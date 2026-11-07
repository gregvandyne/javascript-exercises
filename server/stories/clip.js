// Story Builder: one scene's rendered frames -> one small, near-lossless H.264 clip (docs/story-builder.md).
// Both renderers hand scenes over as clips: a 10-second scene is ~1-3 MB instead of ~100 PNGs (~80 MB), which is what
// makes sending them back from a render machine cheap. The clip keeps the render rate (fps / step: "on twos" is 12 fps);
// the assembler brings it to the video's 24 fps. Only node built-ins here: the renderer service imports this file.
import { spawn } from 'node:child_process';

export function encodeClip(framesDir, out, { fps = 24, step = 1, timeoutMs = 20 * 60e3 } = {}) {
  const rate = String(fps / Math.max(1, step));
  const args = ['-v', 'error', '-y', '-framerate', rate, '-i', `${framesDir}/f_%05d.png`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-pix_fmt', 'yuv420p', '-r', rate, '-threads', '2', '-movflags', '+faststart', out];
  return new Promise((resolve, reject) => {
    const p = spawn(process.env.STORY_FFMPEG || 'ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
    p.stderr.on('data', d => { err = (err + d).slice(-2000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`clip encode exited ${code}: ${err.slice(-300)}`)); });
  });
}
