// Fits a music track to a demo video: node scripts/demo-video/fit-music.mjs <teacher|parents> <track> [options]
//   --start S     begin S seconds into the track (default 0)
//   --cut A,B     remove A..B seconds of the track (a whole number of bars keeps the beat), 60 ms crossfade
//   --hit T       shift so the track's moment T (e.g. a downbeat) lands on the end card
//   --fade-in S   fade in over S seconds (default 0.05; longer when the excerpt starts mid-phrase)
//   --out FILE    default <project dir>/music.wav
// The result is exactly as long as the video, fades out over the last 1.5 s and is left unmastered (mix.mjs normalises).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { project } from './projects.mjs';
const [name, track, ...rest] = process.argv.slice(2);
const P = project(name);
if (!track || !fs.existsSync(track)) { console.error('Give a music file.'); process.exit(1); }
const opt = k => { const i = rest.indexOf(k); return i >= 0 ? rest[i + 1] : null; };
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const video = path.join(P.dir, 'video-16x9.mp4');
const total = dur(video);
const timeline = JSON.parse(fs.readFileSync(path.join(P.dir, 'timeline.json'), 'utf8'));
const endCard = timeline[timeline.length - 1].start;
let start = +(opt('--start') || 0);
const cut = opt('--cut') ? opt('--cut').split(',').map(Number) : null;
const hit = opt('--hit') != null ? +opt('--hit') : null;
const removed = cut ? cut[1] - cut[0] : 0;
if (hit != null) start = Math.max(0, hit - removed - endCard);
const out = opt('--out') || path.join(P.dir, 'music.wav');
const FADE = 1.5;
let f = `[0:a]aformat=sample_rates=48000:channel_layouts=stereo[s]`;
if (cut) f += `;[s]asplit[a][b];[a]atrim=0:${cut[0] + 0.03},asetpts=PTS-STARTPTS[a1];[b]atrim=${cut[1] - 0.03},asetpts=PTS-STARTPTS[b1];[a1][b1]acrossfade=d=0.06:c1=tri:c2=tri[s]`;
const fadeIn = +(opt('--fade-in') || 0.05);   // a longer fade-in when the excerpt starts mid-phrase
f += `;[s]atrim=start=${start.toFixed(3)},asetpts=PTS-STARTPTS,apad=whole_dur=${total.toFixed(3)},atrim=0:${total.toFixed(3)},afade=t=in:st=0:d=${fadeIn},afade=t=out:st=${(total - FADE).toFixed(3)}:d=${FADE}[out]`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', track, '-filter_complex', f, '-map', '[out]', '-c:a', 'pcm_s16le', out], { stdio: 'inherit' });
console.log(out, dur(out).toFixed(2) + ' s', `(video ${total.toFixed(2)} s, end card at ${endCard} s, track from ${start.toFixed(2)} s${cut ? `, cut ${cut.join('-')}` : ''})`);
