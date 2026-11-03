// Makes a demo's voice-over with OpenAI text-to-speech (the model and narrator voice the site uses for its AI voices:
// gpt-4o-mini-tts, "coral"), one MP3 per line of its script (teacher-vo.json / parents-vo.json), then runs mix.mjs --vo.
//   OPENAI_API_KEY=... node scripts/demo-video/make-vo.mjs <teacher|parents>
// Options (env): VO_MODEL (default gpt-4o-mini-tts), VO_VOICE (default coral), VO_ONLY=1 (make the lines, don't mix).
// A line that would run into the next one is sped up a little (up to 1.12x) so the timing holds.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { project } from './projects.mjs';
const DIR = path.dirname(new URL(import.meta.url).pathname);
const name = process.argv[2];
const P = project(name);
const KEY = process.env.OPENAI_API_KEY;
if (!KEY) { console.error('Set OPENAI_API_KEY first.'); process.exit(1); }
const MODEL = process.env.VO_MODEL || 'gpt-4o-mini-tts', VOICE = process.env.VO_VOICE || 'coral';
const INSTRUCTIONS = `You are the narrator of ${P.audience}; smile while you speak. ` +
  'Pace: lively but clear, natural pauses at commas. Accent: American English. Read exactly the words given, and nothing else.';
const lines = JSON.parse(fs.readFileSync(path.join(DIR, P.script), 'utf8'));
const out = path.join(P.dir, 'vo-lines'); fs.mkdirSync(out, { recursive: true });
const dur = f => +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString();
const videoEnd = dur(path.join(P.dir, 'video-16x9.mp4')) - 0.2;
for (const [i, l] of lines.entries()) {
  const file = path.join(out, `line-${String(i + 1).padStart(2, '0')}.mp3`);
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice: VOICE, input: l.text, response_format: 'mp3', ...(/^gpt-/.test(MODEL) ? { instructions: INSTRUCTIONS } : { speed: 1.0 }) }),
  });
  if (!res.ok) { console.error(`line ${i + 1}: ${res.status} ${await res.text()}`); process.exit(1); }
  const raw = file.replace(/\.mp3$/, '.raw.mp3');
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  // trim the silence the model leaves at either end
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-af', 'silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse', file]);
  fs.rmSync(raw);
  const room = (lines[i + 1] ? lines[i + 1].start : videoEnd) - l.start - 0.25, d = dur(file);
  if (d > room) {
    const k = Math.min(1.12, d / room);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-af', `atempo=${k.toFixed(3)}`, file + '.tmp.mp3']); fs.renameSync(file + '.tmp.mp3', file);
    console.log(`line ${i + 1}: ${d.toFixed(2)} s > ${room.toFixed(2)} s, sped up ${k.toFixed(2)}x`);
  }
  console.log(`line ${i + 1}: ${dur(file).toFixed(2)} s  "${l.text}"`);
}
if (!process.env.VO_ONLY) execFileSync('node', [path.join(DIR, 'mix.mjs'), name, '--vo'], { stdio: 'inherit' });
