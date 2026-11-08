// Story Builder worker core (docs/story-builder.md): runs ONE story job through every stage, or one change to a
// finished story (a remake). The loop around it is stories/loop.js (one job at a time). Kept apart from the loop so
// tests can drive it.
import fs from 'node:fs';
import path from 'node:path';
import { log } from '../services/log.js';
import * as J from '../services/story-jobs.js';
import { writeStory } from '../services/story-writer.js';
import { validateScript } from '../services/story-script.js';
import { optionsOf, choiceFields } from '../services/story-options.js';
import { produce, WEIGHTS, sceneVisuals, QUALITY } from './pipeline.js';
import { clipDir, cachedClips, pruneClips, planRemake, sceneKey } from './remake.js';

const writeArgs = (s, o) => ({ idea: s.idea, ageBand: s.age_band, seconds: s.seconds, locale: s.locale, style: o.style, tone: o.tone, look: o.look, characters: s.characters || '', lesson: s.lesson || '' });

/**
 * Run a claimed job. A story in 'writing' is made from the start; a finished story whose remake_status is 'working'
 * gets its change (runRemake). -> the final status ('done' | 'failed' | 'queued' when stopped).
 * deps: { renderer, worker (name), signal, write (writeStory, for tests), quality, voice }
 */
export async function runStory(story, deps) {
  if (story.status === 'done' && story.remake_status === 'working') return runRemake(story, deps);
  const { renderer, worker, signal = null, write = writeStory, quality = process.env.STORY_QUALITY || 'full', voice = null } = deps;
  let state = 'writing';
  const move = (to, fields = {}) => { if (J.transition(story.id, state, to, fields)) { state = to; return true; } return false; };
  const t0 = Date.now();
  const o = optionsOf(story);
  try {
    // 1. the script (kept from an earlier try, so a retry never pays for writing twice)
    let script = J.scriptOf(story);
    if (script) { const v = validateScript(script); script = v.ok ? v.script : null; }
    if (!script) {
      const r = await write(writeArgs(story, o));
      if (!r.ok) { J.fail(story.id, state, r.code); log('info', 'story failed', { id: story.id, stage: 'writing', code: r.code }); return 'failed'; }
      script = r.script;
    }
    J.progress(story.id, worker, WEIGHTS.writing[1]);
    if (!move('voicing', { script: JSON.stringify(script), title: script.title })) return J.get(story.id)?.status || 'failed';
    // 2..6. voice, music, words, render, build
    let stage = 'voicing';
    const dir = J.storyDir(story.id);
    const res = await produce({
      id: story.id, script, locale: story.locale, workDir: dir, clipCache: clipDir(dir), renderer, quality, voice, narrator: o.voice, mood: o.music, look: o.look, signal,
      onStage: s => {
        if (s === 'rendering' && state === 'voicing') { move('rendering'); stage = 'rendering'; }
        if (s === 'assembling' && state === 'rendering') { move('assembling'); stage = 'assembling'; }
      },
      onProgress: p => J.progress(story.id, worker, p),
    }).catch(e => { e.stage = stage; throw e; });
    const meta = { ...res.meta, wallSeconds: Math.round((Date.now() - t0) / 1000) };
    move('done', { progress: 1, meta: JSON.stringify(meta), finished_at: Date.now(), worker: '' });
    log('info', 'story done', { id: story.id, seconds: meta.total, render: meta.render });
    return 'done';
  } catch (e) {
    if ((signal && signal.aborted) || e.code === 'stopped') {
      J.transition(story.id, state, 'queued', { worker: '', progress: 0 });
      return 'queued';
    }
    const code = { writing: 'aiFailed', voicing: 'voice', rendering: 'render', assembling: 'assemble' }[e.stage || state] || 'other';
    log('error', 'story failed', { id: story.id, stage: e.stage || state, error: String(e.message || e).slice(0, 500) });
    J.fail(story.id, state, code);
    return 'failed';
  }
}

/** The files a finished version is made of (moved from the work folder into the story's folder when it is ready). */
export const VERSION_FILES = ['story.mp4', 'poster.jpg', 'captions.vtt', 'captions.ass', 'music.wav', 'meta.json'];

/**
 * Make the change waiting on a finished story (docs/story-builder.md "Changing a story"). The new version is built in
 * <story>/next while the old one keeps playing; only when it is complete are its files moved over the old ones and
 * the row updated (J.finishRemake). A rewrite asks Claude first; every scene with a kept clip is reused; a failure
 * leaves the old video exactly as it was. -> 'done' (the story stays done either way) | 'queued' when stopped.
 */
export async function runRemake(story, { renderer, worker, signal = null, write = writeStory, quality = process.env.STORY_QUALITY || 'full', voice = null }) {
  const t0 = Date.now();
  const rm = J.remakeOf(story) || {};
  const before = { script: J.scriptOf(story), options: optionsOf(story) };
  const options = choiceFields(rm.options || {}, before.options);
  const dir = J.storyDir(story.id), next = path.join(dir, 'next');
  let stage = 'writing';
  try {
    if (!before.script) throw Object.assign(new Error('no script to change'), { stage: 'writing' });
    // 1. the new words: Claude's rewrite, or the owner's own (checked when they were sent; checked again here)
    let script;
    if (rm.kind === 'rewrite') {
      const r = await write({ ...writeArgs(story, options), previous: before.script, note: rm.note || '' });
      if (!r.ok) { J.failRemake(story.id, r.code); log('info', 'story change failed', { id: story.id, stage: 'writing', code: r.code }); return 'done'; }
      script = r.script;
    } else {
      const v = validateScript(rm.script || before.script);
      if (!v.ok) { J.failRemake(story.id, 'invalid'); return 'done'; }
      script = v.script;
    }
    const q = QUALITY[quality] || QUALITY.full;
    const plan = planRemake({ kind: 'remake', before, after: { script, options, scenes: sceneVisuals(script, { id: story.id }) }, cached: new Set(cachedClips(clipDir(dir)).keys()), keyOf: (s, look) => sceneKey(s, q, look) });
    J.remakeProgress(story.id, worker, WEIGHTS.writing[1]);
    // 2..6. into the work folder, reusing every kept clip
    stage = 'voicing';
    fs.rmSync(next, { recursive: true, force: true });
    const res = await produce({
      id: story.id, script, locale: story.locale, workDir: next, clipCache: clipDir(dir), renderer, quality, voice, narrator: options.voice, mood: options.music, look: options.look, signal,
      onStage: s => { stage = s; },
      onProgress: p => J.remakeProgress(story.id, worker, p),
    });
    // 7. swap in the new version, file by file (the video last), then the row
    for (const f of VERSION_FILES.filter(f => f !== 'story.mp4').concat('story.mp4')) {
      const from = path.join(next, f);
      if (fs.existsSync(from)) fs.renameSync(from, path.join(dir, f));
    }
    fs.rmSync(next, { recursive: true, force: true });
    fs.rmSync(path.join(dir, 'voice'), { recursive: true, force: true });
    const meta = { ...res.meta, wallSeconds: Math.round((Date.now() - t0) / 1000), change: { kind: rm.kind, planned: plan.render.length, rendered: res.meta.render.rendered, reused: res.meta.render.reused } };
    const done = J.finishRemake(story.id, { script, options, meta });
    if (done.ok && res.meta.clips && res.meta.clips.length) pruneClips(clipDir(dir), res.meta.clips);
    log('info', 'story changed', { id: story.id, kind: rm.kind, rendered: res.meta.render.rendered, reused: res.meta.render.reused, share: done.share });
    return 'done';
  } catch (e) {
    fs.rmSync(next, { recursive: true, force: true });
    if ((signal && signal.aborted) || e.code === 'stopped') {
      J.requeueRemake(story.id);   // back in line, to be made again
      return 'queued';
    }
    const code = { writing: 'aiFailed', voicing: 'voice', rendering: 'render', assembling: 'assemble' }[e.stage || stage] || 'other';
    log('error', 'story change failed', { id: story.id, stage: e.stage || stage, error: String(e.message || e).slice(0, 500) });
    J.failRemake(story.id, code);
    return 'done';
  }
}
