// Story Builder: changing a finished story without paying again for what didn't change (docs/story-builder.md
// "Changing a story"). The GPU render is by far the dearest step, so every rendered scene clip is kept in the story's
// folder under a key made from everything that decides its pictures (the scene's set, time, props, characters and
// their actions and places, camera, seed, and the render size) — but not its length, which follows the narration.
// A remake renders only the scenes whose key has no clip yet; a new voice, new music or new words reuse every clip,
// and a clip a little shorter than its scene's new length is stretched (then, if need be, its last frame held) when
// the video is put together.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Bump to make every kept clip stale (a change to the Blender kit that alters old scenes). */
export const CLIP_VERSION = 1;
/** A kept clip may be slowed down this much to fill a longer scene; past it, its last frame is held for the rest. */
export const MAX_STRETCH = 1.5;

/** The scene's picture key: a short hash of its visual spec and the render size (not its frame count). */
export function sceneKey(scene, q) {
  const v = {
    v: CLIP_VERSION, set: scene.set, time: scene.time, props: [...(scene.props || [])], camera: scene.camera, seed: scene.seed, focus: scene.focus ?? null,
    characters: (scene.characters || []).map(c => ({ kind: c.kind, action: c.action, place: c.place })),
    width: q.width, height: q.height, fps: q.fps, step: q.step, samples: q.samples,
  };
  return crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 24);
}

export const clipDir = storyDir => path.join(storyDir, 'clips');
const KEY_RE = /^([0-9a-f]{24})\.mp4$/;
/** The clips kept for a story: Map key -> file. */
export function cachedClips(dir) {
  const out = new Map();
  if (!dir || !fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir)) { const m = KEY_RE.exec(f); if (m) out.set(m[1], path.join(dir, f)); }
  return out;
}
/** Keep a freshly rendered clip under its key (moved, not copied). -> the kept file */
export function keepClip(dir, key, file) {
  fs.mkdirSync(dir, { recursive: true });
  const to = path.join(dir, `${key}.mp4`);
  fs.renameSync(file, to);
  return to;
}
/** Remove kept clips the current version doesn't use. -> how many went */
export function pruneClips(dir, keep) {
  const want = new Set(keep);
  let n = 0;
  for (const [k, f] of cachedClips(dir)) if (!want.has(k)) { fs.rmSync(f, { force: true }); n++; }
  return n;
}

/**
 * How a kept clip of `have` seconds fills a scene of `need` seconds: slowed by `stretch` (1 = as it is), then its last
 * frame held for `pad` seconds. A longer clip is simply cut (the assembly trims every scene to its length).
 */
export function fitClip(have, need) {
  if (!(have > 0) || need <= have) return { stretch: 1, pad: 0 };
  const stretch = Math.min(MAX_STRETCH, need / have);
  const pad = Math.max(0, need - have * stretch);
  return { stretch: Math.round(stretch * 10000) / 10000, pad: pad > 0.001 ? Math.round((pad + 0.1) * 1000) / 1000 : 0 };
}

const wordsOf = s => [s.title, ...s.scenes.flatMap(sc => sc.lines.map(l => `${l.say}\u0000${l.show}`))];
/**
 * What a change has to do again, at the least. A pure function (tests: tests/unit/story-builder.test.js).
 *   kind    'remake' (new words, voice or music) | 'rewrite' (Claude writes it again)
 *   before  { script, options: { style, tone, voice, music } } — the finished version
 *   after   { script (null for a rewrite not yet written), options, scenes (null likewise) }
 *   cached  Set of the clip keys kept for this story; keyOf: scene -> key (sceneKey with the render size)
 * -> { nothing, write, voice: 'all' | [flat line indexes], music, captions, render: [scene indexes] | null (unknown
 *      until written), reuse: [scene indexes], assemble }
 */
export function planRemake({ kind, before, after, cached = new Set(), keyOf }) {
  const o0 = before.options || {}, o1 = after.options || {};
  const write = kind === 'rewrite';
  const voiceChanged = (o1.voice || o0.voice) !== o0.voice;
  const musicChanged = (o1.music || o0.music) !== o0.music;
  if (write || !after.script) return { nothing: false, write: true, voice: 'all', music: true, captions: true, render: null, reuse: [], assemble: true };
  const w0 = wordsOf(before.script), w1 = wordsOf(after.script);
  const lines1 = after.script.scenes.flatMap(sc => sc.lines);
  const lines0 = before.script.scenes.flatMap(sc => sc.lines);
  const changedLines = lines1.map((l, i) => (!lines0[i] || lines0[i].say !== l.say ? i : -1)).filter(i => i >= 0);
  const wordsChanged = w0.length !== w1.length || w0.some((x, i) => x !== w1[i]);
  const render = [], reuse = [];
  (after.scenes || []).forEach((sc, i) => (cached.has(keyOf(sc)) ? reuse : render).push(i));
  // nothing the person changed (missing clips alone are no reason to make it again)
  const look = sc => JSON.stringify([sc.set, sc.time, sc.props, sc.camera, sc.characters.map(c => [c.kind, c.action, c.place])]);
  const visualChanged = before.script.scenes.length !== after.script.scenes.length || after.script.scenes.some((sc, i) => look(sc) !== look(before.script.scenes[i]));
  const nothing = !wordsChanged && !voiceChanged && !musicChanged && !visualChanged;
  return {
    nothing, write: false,
    voice: voiceChanged ? 'all' : changedLines,
    music: musicChanged || changedLines.length > 0 || voiceChanged,   // the music is fitted to the narration's length: composed again (cheap)
    captions: wordsChanged || voiceChanged || changedLines.length > 0,
    render, reuse, assemble: !nothing,
  };
}
