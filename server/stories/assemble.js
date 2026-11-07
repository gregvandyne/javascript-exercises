// Story Builder: put it together with ffmpeg (docs/story-builder.md). Each scene's clip from the renderer (rendered
// "on twos" when step is 2: 12 fps, each frame held for two) is brought to the video's rate and cut to exactly its
// timeline length; the clips crossfade into each other;
// the words are burned in from the ASS file (libass); the music bed (already ducked) and the narration clips, each
// placed at its line's start, are mixed. Out: an H.264 + AAC MP4 (faststart, so it plays while it downloads) and a
// poster JPEG taken while the title is on screen.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

// Only node built-ins in this file: the renderer service (services/story-renderer) assembles with it too.
export function run(cmd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err = (err + d).slice(-20000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)); });
  });
}

/** The site's own display font (Bricolage Grotesque, OFL) for the words; libass falls back through fontconfig for
 *  scripts it doesn't cover (Hebrew, Arabic, Japanese, Chinese, Cyrillic). */
export const FONTS_DIR = process.env.STORY_FONTS_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'public', 'fonts');

/** The ffmpeg arguments (exported for tests). */
export function ffmpegArgs({ tl, sceneClips, fps, width, height, music, clips, ass, out, fontsDir = FONTS_DIR, xfade }) {
  const args = ['-v', 'error', '-y'];
  sceneClips.forEach(f => args.push('-i', f));
  const nS = sceneClips.length;
  args.push('-i', music);
  clips.forEach(c => args.push('-i', c.file));
  const f = [];
  tl.scenes.forEach((s, i) => {
    f.push(`[${i}:v]fps=${fps},trim=duration=${s.dur.toFixed(3)},setpts=PTS-STARTPTS,scale=${width}:${height}:flags=lanczos,format=yuv420p,settb=AVTB[s${i}]`);
  });
  let last = 's0';
  for (let i = 1; i < nS; i++) {
    f.push(`[${last}][s${i}]xfade=transition=fade:duration=${xfade.toFixed(3)}:offset=${tl.scenes[i].start.toFixed(3)}[x${i}]`);
    last = `x${i}`;
  }
  const esc = p => p.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
  f.push(`[${last}]fade=t=in:st=0:d=0.8,fade=t=out:st=${(tl.total - 1.2).toFixed(3)}:d=1.2,vignette=angle=PI/5:mode=forward,ass='${esc(ass)}':fontsdir='${esc(fontsDir)}'[vout]`);
  const mi = nS;
  const parts = [`[${mi}:a]aresample=48000,aformat=channel_layouts=stereo[m]`];
  clips.forEach((c, k) => {
    const ms = Math.round(c.start * 1000);
    parts.push(`[${mi + 1 + k}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[n${k}]`);
  });
  f.push(...parts);
  f.push(`[m]${clips.map((c, k) => `[n${k}]`).join('')}amix=inputs=${clips.length + 1}:normalize=0:dropout_transition=0,atrim=duration=${tl.total.toFixed(3)},alimiter=limit=0.95[aout]`);
  args.push('-filter_complex', f.join(';'), '-map', '[vout]', '-map', '[aout]', '-threads', String(+process.env.STORY_FFMPEG_THREADS || 2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(fps),
    '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', '-t', tl.total.toFixed(3), out);
  return args;
}

/** -> { video, poster } */
export async function assemble(o) {
  const args = ffmpegArgs(o);
  await run(process.env.STORY_NICE === '0' ? 'ffmpeg' : 'nice', process.env.STORY_NICE === '0' ? args : ['-n', '10', 'ffmpeg', ...args], { timeout: 30 * 60e3 });
  const poster = path.join(path.dirname(o.out), 'poster.jpg');
  const at = Math.min(o.tl.total - 0.1, o.posterAt != null ? o.posterAt : 1.8);
  await run('ffmpeg', ['-v', 'error', '-y', '-ss', at.toFixed(2), '-i', o.out, '-frames:v', '1', '-q:v', '3', poster]);
  if (!fs.existsSync(o.out) || !fs.existsSync(poster)) throw new Error('assemble: no output');
  return { video: o.out, poster };
}
