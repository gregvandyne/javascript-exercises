// Story Builder: from a checked script to a finished video (docs/story-builder.md).
//   1. voice   one clip per line (services/story-voice.js) in the narrator voice chosen, each measured;
//   2. time    the timeline follows the narration (services/story-captions.js timeline);
//   3. music   the chosen mood composed for exactly that length, ducked under every line (services/story-music.js);
//   4. words   caption cues, a WebVTT file for the player and an ASS file to burn in;
//   5. render  each scene's frames through the renderer interface (renderer.js; Blender) — only scenes with no kept
//              clip (stories/remake.js: a clip is kept per scene under a key of its pictures, so a new voice, new
//              music or new words render nothing again);
//   6. build   ffmpeg: crossfaded scenes + words + music + voice -> story.mp4 and poster.jpg (assemble.js).
// Stages report through onStage(name) and onProgress(fraction of the whole job, 0..1). Everything lands in workDir.
import fs from 'node:fs';
import path from 'node:path';
import { voiceLine, pickProvider, durationOf } from '../services/story-voice.js';
import { timeline, cues, toVtt, toAss, T } from '../services/story-captions.js';
import { bed, writeWav, seedOf } from '../services/story-music.js';
import { providerVoice, pitchOf } from '../services/story-options.js';
import { assemble } from './assemble.js';
import { sceneKey, cachedClips, keepClip, fitClip } from './remake.js';

/** Render quality presets. 'full' is the product; 'preview' for quick looks; 'tiny' for the integration test. */
export const QUALITY = {
  full: { width: 1280, height: 720, fps: 24, step: 2, samples: 4 },
  preview: { width: 640, height: 360, fps: 24, step: 2, samples: 2 },
  tiny: { width: 192, height: 108, fps: 12, step: 3, samples: 1 },
  test: { width: 128, height: 72, fps: 8, step: 4, samples: 1 },
};
/** Where the stage weights put the progress bar. */
export const WEIGHTS = { writing: [0, 0.06], voicing: [0.06, 0.12], rendering: [0.12, 0.94], assembling: [0.94, 1] };

/** The end card's words, per language (kept short; the video is in the story's language). */
const END = { en: 'The End. Goodnight!', 'en-GB': 'The End. Goodnight!', pt: 'Fim. Boa noite!', fr: 'Fin. Bonne nuit !', es: 'Fin. ¡Buenas noches!', de: 'Ende. Gute Nacht!', he: 'הסוף. לילה טוב!', ja: 'おしまい。おやすみなさい！', ar: 'النهاية. تصبح على خير!', ru: 'Конец. Спокойной ночи!', it: 'Fine. Buonanotte!', 'zh-Hant': '完。晚安！', nl: 'Einde. Welterusten!' };
export const endWords = locale => END[locale] || END[String(locale).split('-')[0]] || END.en;

/** What each scene's pictures are (no length): the render spec's scenes without frames. Seeds come from the story id. */
export function sceneVisuals(script, { id }) {
  const base = seedOf(id);
  return script.scenes.map((s, i) => ({
    id: `s${i + 1}`, set: s.set, time: s.time, props: s.props, characters: s.characters, camera: s.camera,
    seed: (base + i * 7919) % 100000, focus: s.characters[0] ? s.characters[0].kind : null,
  }));
}
/** The looks the renderer draws (story-options LOOKS; render_story.py LOOKS). */
const LOOK_NAMES = ['felt', 'comic'];
const lookName = l => (LOOK_NAMES.includes(l) ? l : 'felt');
/**
 * The render spec for a script on a timeline (frames per scene from the timeline; seeds from the story id). `look`
 * (felt | comic) is one field for the whole story; a felt spec carries none, exactly as before looks existed.
 */
export function renderSpec(script, tl, { id, quality = 'full', outDir, look = 'felt' }) {
  const q = QUALITY[quality] || QUALITY.full;
  return {
    ...q, key: String(id), out_dir: outDir, ...(lookName(look) !== 'felt' ? { look: lookName(look) } : {}),
    scenes: sceneVisuals(script, { id }).map((s, i) => ({ ...s, frames: Math.ceil(tl.scenes[i].dur * q.fps) + q.step })),
  };
}
/** The picture key of every scene of a script at a quality, in a look (stories/remake.js sceneKey). */
export const sceneKeys = (script, { id, quality = 'full', look = 'felt' }) => sceneVisuals(script, { id }).map(s => sceneKey(s, QUALITY[quality] || QUALITY.full, lookName(look)));

const stageProgress = (stage, f) => { const [a, b] = WEIGHTS[stage]; return a + (b - a) * Math.max(0, Math.min(1, f)); };

/**
 * { id, script, locale, workDir, renderer, quality, voice (provider: service | local | silent), narrator (story-options
 *   NARRATORS id), mood (story-music MOODS), look (felt | comic: how the pictures are drawn), clipCache (a folder of kept scene clips, or null), onStage, onProgress, signal }
 * -> { video, poster, vtt, meta: { total, timeline, voice, music, render: { ..., rendered, reused } , clips } }
 */
export async function produce({ id, script, locale = 'en', workDir, renderer, quality = 'full', voice = null, narrator = 'auto', mood = 'lullaby', look = 'felt', clipCache = null, onStage = () => {}, onProgress = () => {}, signal = null }) {
  fs.mkdirSync(workDir, { recursive: true });
  const stop = () => { if (signal && signal.aborted) throw Object.assign(new Error('stopped'), { code: 'stopped' }); };
  // 1. voice
  const tStart = Date.now();
  onStage('voicing');
  const voiceDir = path.join(workDir, 'voice');
  fs.mkdirSync(voiceDir, { recursive: true });
  const provider = voice || pickProvider(locale);
  const durations = [], clips = [];
  const allLines = script.scenes.flatMap((s, i) => s.lines.map((l, k) => ({ i, k, l })));
  let n = 0, used = provider;
  for (const { i, k, l } of allLines) {
    stop();
    const r = await voiceLine(l.say, { locale, dir: voiceDir, index: n, provider, voice: providerVoice(narrator), pitch: pitchOf(narrator) });
    used = r.provider;
    (durations[i] = durations[i] || [])[k] = r.duration;
    clips.push({ file: r.file, scene: i, line: k });
    n++;
    onProgress(stageProgress('voicing', n / allLines.length));
  }
  // 2. timeline
  const tl = timeline(script, durations);
  tl.lines.forEach((l, j) => { clips[j].start = l.start; });
  // 3. music: composed here for a local build; a remote renderer composes the same piece from the same seed
  const remote = !!renderer.assembles;
  const musicParams = { seconds: tl.total, seed: seedOf(id), duck: tl.narration, mood };
  let music = null, musicInfo = null;
  if (!remote) {
    music = path.join(workDir, 'music.wav');
    const piece = bed(musicParams);
    writeWav(music, [piece.left, piece.right]);
    musicInfo = piece.info;
  }
  // 4. words
  const q = QUALITY[quality] || QUALITY.full;
  const cueList = cues(tl.lines);
  const last = tl.lines[tl.lines.length - 1];
  const endAt = [last.end + T.tail * 0.6, tl.total - 0.4];
  const titleAt = [0.5, T.title + 0.2];
  const end = endWords(locale);
  const vtt = path.join(workDir, 'captions.vtt');
  fs.writeFileSync(vtt, toVtt(cueList, { title: script.title, titleAt, end: { start: endAt[0], end: endAt[1], text: end } }));
  const ass = path.join(workDir, 'captions.ass');
  fs.writeFileSync(ass, toAss(cueList, { width: q.width, height: q.height, title: script.title, titleAt, endText: end, endAt }));
  const posterAt = titleAt[0] + 1.4;
  // 5. render (and, on a remote renderer, 6. build there too: the web server never runs Blender or the big ffmpeg)
  stop();
  onStage('rendering');
  const spec = renderSpec(script, tl, { id, quality, outDir: path.join(workDir, 'frames'), look });
  const keys = spec.scenes.map(s => sceneKey(s, q, lookName(look)));
  const out = path.join(workDir, 'story.mp4');
  const t0 = Date.now();
  // Scenes with a kept clip are not rendered again (the remote renderer that builds the video itself needs every scene).
  const kept = remote || !clipCache ? new Map() : cachedClips(clipCache);
  const toRender = spec.scenes.filter((s, i) => !kept.has(keys[i]));
  const bundle = remote ? { timeline: { scenes: tl.scenes, total: tl.total }, xfade: T.xfade, posterAt, ass, music: musicParams, voice: clips.map(c => ({ start: c.start, file: c.file })), outDir: workDir } : null;
  let r = { engine: null, frames: 0, frameSeconds: 0, clips: {} };
  if (toRender.length) {
    r = await renderer.render({ ...spec, scenes: toRender }, {
      signal, assemble: bundle,
      onProgress: p => onProgress(p.phase === 'assembling' ? stageProgress('assembling', 0.5) : stageProgress('rendering', p.done / p.total)),
      onPhase: ph => { if (ph === 'assembling') onStage('assembling'); },
    });
  }
  const renderSec = (Date.now() - t0) / 1000;
  const voiceSec = (t0 - tStart) / 1000;
  const t1 = Date.now();
  let fits = null;
  if (remote) {
    onStage('assembling');
    musicInfo = r.music || null;
  } else {
    // 6. build: keep each new clip under its key, and fit every clip to its scene's length
    stop();
    onStage('assembling');
    onProgress(stageProgress('assembling', 0.1));
    const sceneClips = await Promise.all(spec.scenes.map(async (s, i) => {
      if (kept.has(keys[i])) return kept.get(keys[i]);
      const file = (r.clips && r.clips[s.id]) || path.join(spec.out_dir, `${s.id}.mp4`);
      return clipCache ? keepClip(clipCache, keys[i], file) : file;
    }));
    fits = await Promise.all(sceneClips.map(async (f, i) => (kept.has(keys[i]) ? fitClip(await durationOf(f).catch(() => 0), tl.scenes[i].dur) : { stretch: 1, pad: 0 })));
    await assemble({ tl, sceneClips, fits, fps: q.fps, width: q.width, height: q.height, music, clips, ass, out, xfade: T.xfade, posterAt });
  }
  if (!fs.existsSync(out) || !fs.existsSync(path.join(workDir, 'poster.jpg'))) throw Object.assign(new Error('no video came back'), { stage: 'assembling' });
  // the frames folder was only needed to build the video (kept clips live in clipCache)
  fs.rmSync(spec.out_dir, { recursive: true, force: true });
  onProgress(1);
  const meta = {
    total: tl.total, scenes: tl.scenes, lines: tl.lines.map(l => ({ scene: l.scene, start: l.start, end: l.end })),
    voice: used, narrator, music: musicInfo, clips: remote ? [] : keys,
    render: { renderer: renderer.name, engine: r.engine, look: lookName(look), frames: r.frames, seconds: Math.round(renderSec), quality, width: q.width, height: q.height, fps: q.fps, step: q.step, samples: q.samples,
      secPerVideoSec: Math.round((renderSec / tl.total) * 10) / 10, secPerFrame: r.frames && r.frameSeconds ? Math.round((r.frameSeconds / r.frames) * 100) / 100 : null,
      sceneSeconds: r.sceneSeconds || undefined, rendered: toRender.length, reused: spec.scenes.length - toRender.length,
      stretched: fits ? fits.filter(f => f.stretch > 1 || f.pad > 0).length : 0 },
    stageSeconds: { voiceAndWords: Math.round(voiceSec * 10) / 10, render: Math.round(renderSec * 10) / 10, assemble: Math.round(((Date.now() - t1) / 1000) * 10) / 10 },
  };
  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 1));
  return { video: out, poster: path.join(workDir, 'poster.jpg'), vtt, meta };
}
