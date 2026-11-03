// Mixes a demo's audio and muxes it onto its silent video masters.
//   node scripts/demo-video/mix.mjs <teacher|parents>          music only
//   node scripts/demo-video/mix.mjs <teacher|parents> --vo     music + the voice-over lines (made by make-vo.mjs)
//   --music FILE   use this (already fitted) music instead of <project dir>/music.wav; --suffix S names the outputs -S
// Music is ducked by 18 dB under each spoken line (0.25 s ramps); the mix is normalised to -16 LUFS, -1.5 dBTP.
// Out: <dir>/<prefix>-16x9.mp4, <prefix>-9x16.mp4 and <prefix>-web.mp4 (720p, for the site's page).
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { project } from './projects.mjs';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const args = process.argv.slice(2);
const P = project(args[0]);
const opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const withVo = args.includes('--vo');
const MUSIC = opt('--music') || path.join(P.dir, 'music.wav');
const SUF = opt('--suffix') ? '-' + opt('--suffix') : '';
const ff = a => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: ['ignore', 'inherit', 'inherit'] });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
if (!fs.existsSync(MUSIC)) { console.error(`No music at ${MUSIC}: run fit-music.mjs first.`); process.exit(1); }

const lines = JSON.parse(fs.readFileSync(path.join(DIR, P.script), 'utf8'));
const LINES = path.join(P.dir, 'vo-lines');
const vo = withVo ? lines.map((l, i) => ({ ...l, file: path.join(LINES, `line-${String(i + 1).padStart(2, '0')}.mp3`) })) : [];
for (const l of vo) { if (!fs.existsSync(l.file)) throw new Error(`missing ${l.file}: run make-vo.mjs first`); l.d = dur(l.file); }
vo.forEach((l, i) => { const next = vo[i + 1]; if (next && l.start + l.d > next.start - 0.15) console.warn(`line ${i + 1} runs into line ${i + 2} by ${(l.start + l.d - next.start).toFixed(2)} s`); });

const DUCK = 0.126, RAMP = 0.25;
const win = vo.map(l => `clip(min((t-${(l.start - RAMP).toFixed(3)})/${RAMP},(${(l.start + l.d + RAMP).toFixed(3)}-t)/${RAMP}),0,1)`);
const duckExpr = win.length ? `1-${(1 - DUCK).toFixed(3)}*max(${win.reduce((a, b) => `max(${a},${b})`)},0)` : '1';
const audio = path.join(P.dir, `mix${withVo ? '-vo' : '-music'}${SUF}.wav`);
{
  const inputs = ['-i', MUSIC, ...vo.flatMap(l => ['-i', l.file])];
  let f = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo,volume='${duckExpr}':eval=frame[m]`;
  vo.forEach((l, i) => { const ms = Math.round(l.start * 1000); f += `;[${i + 1}:a]aformat=sample_rates=48000:channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`; });
  f += vo.length ? `;[m]${vo.map((_, i) => `[v${i}]`).join('')}amix=inputs=${vo.length + 1}:normalize=0:duration=first[pre]` : ';[m]anull[pre]';
  const tmp = audio + '.pre.wav';
  ff([...inputs, '-filter_complex', f, '-map', '[pre]', '-c:a', 'pcm_s16le', tmp]);
  let j = null;
  try {
    const r = spawnSync('ffmpeg', ['-hide_banner', '-i', tmp, '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
    j = JSON.parse(/\{[^{}]*"input_i"[^{}]*\}/.exec(r.stderr)[0]);
  } catch { j = null; }
  const ln = j ? `loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=${j.input_i}:measured_TP=${j.input_tp}:measured_LRA=${j.input_lra}:measured_thresh=${j.input_thresh}:offset=${j.target_offset}:linear=true` : 'loudnorm=I=-16:TP=-1.5:LRA=11';
  ff(['-i', tmp, '-af', `${ln},alimiter=limit=0.84:level=false,aresample=48000`, '-c:a', 'pcm_s16le', audio]);
  fs.rmSync(tmp);
}
const only = opt('--only');   // e.g. --only web
for (const [src, kind, extra] of [
  ['video-16x9.mp4', '16x9', ['-c:v', 'copy']],
  ['video-9x16.mp4', '9x16', ['-c:v', 'copy']],
  ['video-16x9.mp4', 'web', ['-vf', 'scale=1280:720:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '25', '-maxrate', '1.6M', '-bufsize', '3.2M', '-pix_fmt', 'yuv420p']],
]) {
  if (only && only !== kind) continue;
  const v = path.join(P.dir, src); if (!fs.existsSync(v)) { console.warn('skip, no', v); continue; }
  const o = opt('--outdir') ? path.join(opt('--outdir'), `${P.prefix}-${kind}${SUF}.mp4`) : path.join(P.dir, `${P.prefix}-${kind}${SUF}.mp4`);
  ff(['-i', v, '-i', audio, '-map', '0:v', '-map', '1:a', ...extra, '-c:a', 'aac', '-b:a', kind === 'web' ? '128k' : '192k', '-shortest', '-movflags', '+faststart', o]);
  console.log(o, dur(o).toFixed(2) + ' s', (fs.statSync(o).size / 1e6).toFixed(1) + ' MB');
}
