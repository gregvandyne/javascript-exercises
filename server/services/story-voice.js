// Story Builder: the narrator's voice, one clip per line, measured (docs/story-builder.md).
// Providers, picked by STORY_VOICE (default 'auto'):
//   'service'  the site's AI voice (services/tts.js synthesize, ctx 'story', the narrator role at the slow rate): the
//              same provider, cache, daily character limits and AI budget as every other voice on the site;
//   'local'    an offline voice on the worker machine (SVOX Pico for English, German, Spanish, French and Italian,
//              eSpeak NG otherwise), slowed a little and warmed with ffmpeg. For development, and as the fallback
//              when the service is off or refuses (a story is never left without a voice when one can be made);
//   'silent'   silence of a reading-speed length (tests).
// 'auto' = 'service' when the AI voice is on for the language, else 'local' when an offline voice is installed,
// else none (the story fails at the voice stage). The text was written by Claude and passed the story checks; speakable() is the backstop here too.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as tts from './tts.js';
import * as V from './tts-voices.js';

const PICO = { en: 'en-US', 'en-GB': 'en-GB', de: 'de-DE', es: 'es-ES', fr: 'fr-FR', it: 'it-IT' };
const ESPEAK = { en: 'en-us', 'en-GB': 'en-gb', pt: 'pt-br', fr: 'fr-fr', es: 'es', de: 'de', he: 'he', ja: 'ja', ar: 'ar', ru: 'ru', it: 'it', 'zh-Hant': 'cmn', nl: 'nl' };
const has = bin => { try { return spawnSync('sh', ['-c', `command -v ${bin}`]).status === 0; } catch { return false; } };
const tools = { pico: null, espeak: null };
export const localVoices = () => {
  if (tools.pico === null) { tools.pico = has('pico2wave'); tools.espeak = has('espeak-ng'); }
  return { pico: tools.pico, espeak: tools.espeak };
};

export function run(cmd, args, { timeout = 120000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    const timer = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.stdout.on('data', d => { out += d; });
    p.stderr.on('data', d => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => { clearTimeout(timer); code === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${code}: ${err.slice(-400)}`)); });
  });
}
/** Seconds of an audio file (ffprobe). */
// MPEG audio frame tables (Layer III): bitrates in kbit/s by [MPEG-1 | MPEG-2/2.5][index], sample rates by version.
const BITRATES = [[0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
/**
 * Seconds of an MP3 (Layer III), counted frame by frame (so VBR files come out right too), with no ffmpeg: the web
 * server measures the site voice's clips this way. -> seconds, or null when it isn't an MP3 it can read.
 */
export function mp3Duration(buf) {
  let i = 0;
  if (buf.length > 10 && buf.toString('latin1', 0, 3) === 'ID3') i = 10 + ((buf[6] & 0x7f) << 21 | (buf[7] & 0x7f) << 14 | (buf[8] & 0x7f) << 7 | (buf[9] & 0x7f));
  let seconds = 0, frames = 0;
  while (i + 4 <= buf.length) {
    const b1 = buf[i + 1], b2 = buf[i + 2];
    const ver = (b1 >> 3) & 3, layer = (b1 >> 1) & 3, bri = b2 >> 4, sri = (b2 >> 2) & 3;
    if (buf[i] !== 0xff || (b1 & 0xe0) !== 0xe0 || ver === 1 || layer !== 1 || bri === 0 || bri === 15 || sri === 3) { i++; continue; }
    const sr = RATES[ver][sri], kbps = BITRATES[ver === 3 ? 0 : 1][bri], pad = (b2 >> 1) & 1;
    const len = Math.floor(((ver === 3 ? 144 : 72) * kbps * 1000) / sr) + pad;
    if (len < 4) { i++; continue; }
    seconds += (ver === 3 ? 1152 : 576) / sr;
    frames++;
    i += len;
  }
  return frames ? seconds : null;
}

/** Seconds of an audio file: MP3s are counted here, anything else asks ffprobe. */
export async function durationOf(file) {
  if (/\.mp3$/i.test(file)) { const d = mp3Duration(fs.readFileSync(file)); if (d) return d; }
  const out = await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file]);
  const d = parseFloat(out);
  if (!Number.isFinite(d)) throw new Error('no duration');
  return d;
}

export function pickProvider(locale, want = process.env.STORY_VOICE || 'auto') {
  if (want === 'service' || want === 'local' || want === 'silent') return want;
  if (tts.ttsEnabled() && V.ttsLocale(locale) && tts.localeOn(V.ttsLocale(locale))) return 'service';
  const lv = localVoices();
  // No voice at all: the story fails at the voice stage ('voice') rather than becoming a silent video by accident.
  // 'silent' is only ever used when asked for (STORY_VOICE=silent: tests).
  return lv.pico || lv.espeak ? 'local' : 'none';
}

async function localClip(text, locale, out, pitch = 1) {
  const lv = localVoices();
  const raw = out.replace(/\.wav$/, '.raw.wav');
  const code = PICO[locale] ? locale : PICO[String(locale).split('-')[0]] ? String(locale).split('-')[0] : null;
  if (lv.pico && code) await run('pico2wave', ['-l', PICO[code], '-w', raw, text]);
  else if (lv.espeak) await run('espeak-ng', ['-v', ESPEAK[locale] || ESPEAK[String(locale).split('-')[0]] || 'en-us', '-s', '135', '-w', raw, text]);
  else throw new Error('no local voice');
  // calmer and warmer: a touch slower, the hiss off the top, a little body, a small room
  // the narrator chosen (story-options NARRATORS pitch): shifted up or down a little, at the same speed
  const p = Math.max(0.7, Math.min(1.3, +pitch || 1));
  const shift = p === 1 ? '' : `aresample=32000,asetrate=${Math.round(32000 * p)},aresample=32000,atempo=${(1 / p).toFixed(4)},`;
  await run('ffmpeg', ['-v', 'error', '-y', '-i', raw, '-af', `${shift}atempo=0.9,highpass=f=70,lowpass=f=7000,equalizer=f=220:t=q:w=1:g=3,aecho=0.8:0.5:40:0.12,loudnorm=I=-18:TP=-2`, '-ar', '32000', '-ac', '1', out]);
  fs.rmSync(raw, { force: true });
}

async function silentClip(text, out) {
  const secs = Math.max(0.8, String(text).length / 14);
  await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `anullsrc=r=32000:cl=mono`, '-t', secs.toFixed(2), out]);
}

/**
 * Voice one line into dir/line-<i>.(wav|mp3). -> { file, duration, provider }.
 * voice: the site voice to read it (tts-voices VOICES; null: the language's narrator); pitch: the offline voice's shift.
 * A 'service' refusal or failure falls back to the local voice (when there is one).
 */
export async function voiceLine(text, { locale = 'en', dir, index, provider = pickProvider(locale), voice = null, pitch = 1 }) {
  const s = tts.spokenText(text);
  if (!s) throw new Error('empty line');
  if (provider === 'service') {
    try {
      const r = await tts.synthesize({ text: s, locale: V.ttsLocale(locale) || locale, role: 'narrator', rate: 'slow', voice: voice && V.VOICES.includes(voice) ? voice : null, ctx: 'story' });
      const file = path.join(dir, `line-${index}.mp3`);
      fs.copyFileSync(tts.fileOf(r.hash), file);
      return { file, duration: await durationOf(file), provider };
    } catch (e) {
      const lv = localVoices();
      if (!lv.pico && !lv.espeak) throw e;
      provider = 'local';
    }
  }
  const file = path.join(dir, `line-${index}.wav`);
  if (provider === 'local') await localClip(s, locale, file, pitch);
  else if (provider === 'silent') await silentClip(s, file);
  else throw new Error('no voice: turn the AI voice on for this language (TTS_ENABLED, /admin/voices) or install an offline voice');
  return { file, duration: await durationOf(file), provider };
}
