// Story Builder worker core (docs/story-builder.md): runs ONE story job through every stage. The loop around it is
// scripts/story-worker.js (its own process, one job at a time). Kept apart from the loop so tests can drive it.
import { log } from '../services/log.js';
import * as J from '../services/story-jobs.js';
import { writeStory } from '../services/story-writer.js';
import { validateScript } from '../services/story-script.js';
import { produce, WEIGHTS } from './pipeline.js';

/**
 * Run a claimed story (status 'writing'). -> the final status ('done' | 'failed' | 'queued' when stopped).
 * deps: { renderer, worker (name), signal, write (writeStory, for tests), quality, voice }
 */
export async function runStory(story, { renderer, worker, signal = null, write = writeStory, quality = process.env.STORY_QUALITY || 'full', voice = null }) {
  let state = 'writing';
  const move = (to, fields = {}) => { if (J.transition(story.id, state, to, fields)) { state = to; return true; } return false; };
  const t0 = Date.now();
  try {
    // 1. the script (kept from an earlier try, so a retry never pays for writing twice)
    let script = J.scriptOf(story);
    if (script) { const v = validateScript(script); script = v.ok ? v.script : null; }
    if (!script) {
      const r = await write({ idea: story.idea, ageBand: story.age_band, seconds: story.seconds, locale: story.locale });
      if (!r.ok) { J.fail(story.id, state, r.code); log('info', 'story failed', { id: story.id, stage: 'writing', code: r.code }); return 'failed'; }
      script = r.script;
    }
    J.progress(story.id, worker, WEIGHTS.writing[1]);
    if (!move('voicing', { script: JSON.stringify(script), title: script.title })) return J.get(story.id)?.status || 'failed';
    // 2..6. voice, music, words, render, build
    let stage = 'voicing';
    const res = await produce({
      id: story.id, script, locale: story.locale, workDir: J.storyDir(story.id), renderer, quality, voice, signal,
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
