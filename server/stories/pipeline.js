// Story Builder: from a checked script to a finished video (docs/story-builder.md).
//   1. voice   one clip per line (services/story-voice.js), each measured;
//   2. time    the timeline follows the narration (services/story-captions.js timeline);
//   3. music   a lullaby composed for exactly that length, ducked under every line (services/story-music.js);
//   4. words   caption cues, a WebVTT file for the player and an ASS file to burn in;
//   5. render  each scene's frames through the renderer interface (renderer.js; Blender);
//   6. build   ffmpeg: crossfaded scenes + words + music + voice -> story.mp4 and poster.jpg (assemble.js).
// Stages report through onStage(name) and onProgress(fraction of the whole job, 0..1). Everything lands in workDir.
import fs from 'node:fs';
import path from 'node:path';
import { voiceLine, pickProvider } from '../services/story-voice.js';
import { timeline, cues, toVtt, toAss, T } from '../services/story-captions.js';
import { lullaby, writeWav, seedOf } from '../services/story-music.js';
import { assemble } from './assemble.js';

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

/** The render spec for a script on a timeline (frames per scene from the timeline; seeds from the story id). */
export function renderSpec(script, tl, { id, quality = 'full', outDir }) {
  const q = QUALITY[quality] || QUALITY.full;
  const base = seedOf(id);
  return {
    ...q, key: String(id), out_dir: outDir,
    scenes: script.scenes.map((s, i) => ({
      id: `s${i + 1}`, set: s.set, time: s.time, props: s.props, characters: s.characters, camera: s.camera,
      frames: Math.ceil(tl.scenes[i].dur * q.fps) + q.step, seed: (base + i * 7919) % 100000, focus: s.characters[0] ? s.characters[0].kind : null,
    })),
  };
}

const stageProgress = (stage, f) => { const [a, b] = WEIGHTS[stage]; return a + (b - a) * Math.max(0, Math.min(1, f)); };

/**
 * { id, script, locale, workDir, renderer, quality, voice, onStage, onProgress, signal }
 * -> { video, poster, vtt, meta: { total, timeline, voice, music, render } }
 */
export async function produce({ id, script, locale = 'en', workDir, renderer, quality = 'full', voice = null, onStage = () => {}, onProgress = () => {}, signal = null }) {
  fs.mkdirSync(workDir, { recursive: true });
  const stop = () => { if (signal && signal.aborted) throw Object.assign(new Error('stopped'), { code: 'stopped' }); };
  // 1. voice
  onStage('voicing');
  const voiceDir = path.join(workDir, 'voice');
  fs.mkdirSync(voiceDir, { recursive: true });
  const provider = voice || pickProvider(locale);
  const durations = [], clips = [];
  const allLines = script.scenes.flatMap((s, i) => s.lines.map((l, k) => ({ i, k, l })));
  let n = 0, used = provider;
  for (const { i, k, l } of allLines) {
    stop();
    const r = await voiceLine(l.say, { locale, dir: voiceDir, index: n, provider });
    used = r.provider;
    (durations[i] = durations[i] || [])[k] = r.duration;
    clips.push({ file: r.file, scene: i, line: k });
    n++;
    onProgress(stageProgress('voicing', n / allLines.length));
  }
  // 2. timeline
  const tl = timeline(script, durations);
  tl.lines.forEach((l, j) => { clips[j].start = l.start; });
  // 3. music
  const music = path.join(workDir, 'music.wav');
  const bed = lullaby({ seconds: tl.total, seed: seedOf(id), duck: tl.narration });
  writeWav(music, [bed.left, bed.right]);
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
  // 5. render
  stop();
  onStage('rendering');
  const spec = renderSpec(script, tl, { id, quality, outDir: path.join(workDir, 'frames') });
  const t0 = Date.now();
  const r = await renderer.render(spec, { signal, onProgress: p => onProgress(stageProgress('rendering', p.done / p.total)) });
  const renderSec = (Date.now() - t0) / 1000;
  // 6. build
  stop();
  onStage('assembling');
  onProgress(stageProgress('assembling', 0.1));
  const out = path.join(workDir, 'story.mp4');
  const sceneClips = spec.scenes.map(s => (r.clips && r.clips[s.id]) || path.join(spec.out_dir, `${s.id}.mp4`));
  await assemble({ tl, sceneClips, fps: q.fps, width: q.width, height: q.height, music, clips, ass, out, xfade: T.xfade, posterAt: titleAt[0] + 1.4 });
  // the clips were only needed to build the video
  fs.rmSync(spec.out_dir, { recursive: true, force: true });
  onProgress(1);
  const meta = {
    total: tl.total, scenes: tl.scenes, lines: tl.lines.map(l => ({ scene: l.scene, start: l.start, end: l.end })),
    voice: used, music: bed.info,
    render: { engine: r.engine, frames: r.frames, seconds: Math.round(renderSec), quality, width: q.width, height: q.height, fps: q.fps, step: q.step, samples: q.samples,
      secPerVideoSec: Math.round((renderSec / tl.total) * 10) / 10, secPerFrame: r.frames ? Math.round((r.frameSeconds / r.frames) * 100) / 100 : null },
  };
  fs.writeFileSync(path.join(workDir, 'meta.json'), JSON.stringify(meta, null, 1));
  return { video: out, poster: path.join(workDir, 'poster.jpg'), vtt, meta };
}
