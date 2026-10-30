// Speech to text for the Studio chat: a kid speaks, the page sends the clip here, we send it to a hosted transcription
// service and give the words back for the kid to check and edit before pressing Send (never sent by itself; the words
// then go through the same screening as typed text).
// - On only when the owner sets STT_API_KEY (STT_PROVIDER picks the service, default openai; STT_MODEL overrides its
//   model). Without a key the mic button is not shown and the endpoint answers 404.
// - Audio is never stored: it lives in memory for the one request and is dropped as soon as the words come back
//   (COPPA's audio-file rule). Nothing writes it to disk, a database or a log; the log line has only size, time and
//   the service's name. The words are not kept here either.
// - Providers are chosen for zero data retention and no training on API data; the owner must have that agreed with the
//   provider for the key's project before turning it on (docs/legal-review.md).
// - Each service gets a short hint in the kid's language (kids describing a game), which helps with children's speech;
//   Traditional Chinese gets its hint in Traditional characters, so the words come back in them.
import { config } from '../config.js';
import { hasProfanity } from './textfilter.js';

export const MAX_TEXT = 2000;
const TIMEOUT_MS = 20000;

/** Accepted clip types: what MediaRecorder makes in Chrome/Edge/Firefox/Android (webm, ogg) and Safari (mp4/aac). */
export const MIMES = ['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/x-m4a', 'audio/m4a'];
/** Containers we can read the length of (and that MediaRecorder makes); WAV and MP3 are sniffed but refused. */
export const KINDS = ['webm', 'mp4', 'ogg'];
/** The clip's container from its first bytes (never trust the Content-Type alone). -> 'webm'|'mp4'|'ogg'|'wav'|'mp3'|null */
export function sniff(bytes) {
  const b = bytes || Buffer.alloc(0);
  if (b.length < 12) return null;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return 'webm';
  if (b.toString('latin1', 4, 8) === 'ftyp') return 'mp4';
  if (b.toString('latin1', 0, 4) === 'OggS') return 'ogg';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WAVE') return 'wav';
  if (b.toString('latin1', 0, 3) === 'ID3' || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0)) return 'mp3';
  return null;
}
const FILE = { webm: ['clip.webm', 'audio/webm'], mp4: ['clip.mp4', 'audio/mp4'], ogg: ['clip.ogg', 'audio/ogg'], wav: ['clip.wav', 'audio/wav'], mp3: ['clip.mp3', 'audio/mpeg'] };
/** The base type of a Content-Type header (codec parameters dropped: "audio/webm" stays). */
export const baseMime = ct => String(ct || '').split(';')[0].trim().toLowerCase();

/** Site locale -> ISO 639-1 language for the service. */
export function langOf(locale) {
  const l = String(locale || 'en');
  if (l === 'zh-Hant') return 'zh';
  return l.split('-')[0].toLowerCase();
}
// A short hint in the kid's own language: who is talking and the words they are likely to use.
const HINTS = {
  en: 'A child is describing a video game they want to make: levels, jump, coins, a dragon, a robot, make it faster.',
  'en-GB': 'A child is describing a video game they want to make: levels, jump, coins, a dragon, a robot, make it faster, colour, favourite.',
  pt: 'Uma criança está descrevendo um jogo que quer criar: fases, pular, moedas, um dragão, um robô, deixa mais rápido.',
  fr: 'Un enfant décrit un jeu vidéo qu’il veut créer : niveaux, sauter, pièces, un dragon, un robot, plus rapide.',
  es: 'Un niño describe un videojuego que quiere crear: niveles, saltar, monedas, un dragón, un robot, más rápido.',
  de: 'Ein Kind beschreibt ein Videospiel, das es bauen will: Level, springen, Münzen, ein Drache, ein Roboter, schneller.',
  he: 'ילד מתאר משחק מחשב שהוא רוצה לבנות: שלבים, לקפוץ, מטבעות, דרקון, רובוט, יותר מהר.',
  ja: 'こどもが つくりたい ゲームの ことを はなしています。ステージ、ジャンプ、コイン、ドラゴン、ロボット、もっと はやく。',
  ar: 'طفل يصف لعبة فيديو يريد أن يصنعها: مراحل، قفز، عملات، تنين، روبوت، اجعلها أسرع.',
  ru: 'Ребёнок описывает видеоигру, которую хочет сделать: уровни, прыгать, монетки, дракон, робот, сделай быстрее.',
  it: 'Un bambino descrive un videogioco che vuole creare: livelli, saltare, monete, un drago, un robot, più veloce.',
  'zh-Hant': '一個小朋友在描述他想做的電子遊戲：關卡、跳躍、金幣、一條龍、機器人、讓它變得更快。請用繁體中文。',
  nl: 'Een kind beschrijft een videogame die het wil maken: levels, springen, munten, een draak, een robot, maak het sneller.',
};
export const hintFor = locale => HINTS[locale] || HINTS[langOf(locale)] || HINTS.en;

export class SttError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}

/** Tests replace fetch here (no network in unit tests). */
export const hooks = { fetch: (...a) => globalThis.fetch(...a) };

const DEFAULT_MODEL = { openai: 'gpt-transcribe', elevenlabs: 'scribe_v2' };
const PROVIDERS = {
  /** OpenAI's transcription endpoint (no training on API data; zero data retention by agreement with OpenAI). */
  async openai({ bytes, kind, locale, signal, key, model }) {
    const [name, type] = FILE[kind];
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    const m = model || DEFAULT_MODEL.openai;
    form.append('model', m);
    // The newest model takes a list of expected languages (and Traditional Chinese as zh-tw); older ones take one code.
    if (/^gpt-transcribe/.test(m)) form.append('languages[]', locale === 'zh-Hant' ? 'zh-tw' : langOf(locale));
    else form.append('language', langOf(locale));
    form.append('prompt', hintFor(locale));
    form.append('response_format', 'json');
    const res = await hooks.fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal });
    if (!res.ok) throw new SttError(res.status === 429 ? 'busy' : 'provider', `openai ${res.status}`);
    const data = await res.json();
    return String((data && data.text) || '');
  },
  /** ElevenLabs Scribe, with request logging off (their zero retention mode; needs their enterprise agreement). */
  async elevenlabs({ bytes, kind, locale, signal, key, model }) {
    const [name, type] = FILE[kind];
    const form = new FormData();
    form.append('file', new Blob([bytes], { type }), name);
    form.append('model_id', model || DEFAULT_MODEL.elevenlabs);
    form.append('language_code', langOf(locale));
    form.append('tag_audio_events', 'false');
    const res = await hooks.fetch('https://api.elevenlabs.io/v1/speech-to-text?enable_logging=false', { method: 'POST', headers: { 'xi-api-key': key }, body: form, signal });
    if (!res.ok) throw new SttError(res.status === 429 ? 'busy' : 'provider', `elevenlabs ${res.status}`);
    const data = await res.json();
    return String((data && data.text) || '');
  },
  /** Tests only (refused in production by config): fixed words, so the Studio's mic can be tried end to end. */
  async mock({ bytes }) {
    return bytes.length > 2000 ? 'make the dragon fly faster' : '';
  },
};

// ---- Clip length from the container (the page's X-Clip-Ms is only a hint: a client can lie about it). -> seconds | null
// WebM: the Info Duration and the last block's time; MP4: mvhd/mehd/mdhd durations and fragment ends (Safari writes
// fragmented MP4); Ogg: the last page's granule position. null: the length couldn't be read.
const uintBE = (b, at, n) => { let v = 0; for (let k = 0; k < n && at + k < b.length; k++) v = v * 256 + b[at + k]; return v; };
function vint(b, i, keepMarker) {
  const first = b[i]; if (first === undefined || first === 0) return null;
  let len = 1, mask = 0x80; while (!(first & mask)) { len++; mask >>= 1; }
  if (i + len > b.length) return null;
  let v = keepMarker ? first : first & (mask - 1); let ones = (first & (mask - 1)) === mask - 1;
  for (let k = 1; k < len; k++) { v = v * 256 + b[i + k]; if (b[i + k] !== 0xff) ones = false; }
  return { v, len, unknown: !keepMarker && ones };
}
function webmSeconds(b) {
  const el = pos => { const id = vint(b, pos, true); if (!id) return null; const sz = vint(b, pos + id.len, false); if (!sz) return null; return { id: id.v, start: pos + id.len + sz.len, size: sz.unknown ? null : sz.v }; };
  let e = el(0); if (!e || e.id !== 0x1a45dfa3 || e.size == null) return null;
  e = el(e.start + e.size); if (!e || e.id !== 0x18538067) return null;
  const end = e.size == null ? b.length : Math.min(b.length, e.start + e.size);
  let i = e.start, scale = 1e6, duration = 0, maxTc = -1, clusterTc = null, n = 0;
  while (i < end && n++ < 200000) {
    const x = el(i); if (!x) break;
    // Containers we read inside (Segment's Info, Cluster, BlockGroup): step into them; their size may be unknown.
    if (x.id === 0x1549a966 || x.id === 0x1f43b675 || x.id === 0xa0) { if (x.id === 0x1f43b675) clusterTc = null; i = x.start; continue; }
    if (x.size == null) break;
    if (x.id === 0x2ad7b1) scale = uintBE(b, x.start, x.size) || 1e6;
    else if (x.id === 0x4489 && x.start + x.size <= b.length) duration = x.size === 4 ? b.readFloatBE(x.start) : x.size === 8 ? b.readDoubleBE(x.start) : 0;
    else if (x.id === 0xe7) clusterTc = uintBE(b, x.start, x.size);
    else if ((x.id === 0xa3 || x.id === 0xa1) && clusterTc != null) {
      const tr = vint(b, x.start, false);
      if (tr && x.start + tr.len + 2 <= b.length) maxTc = Math.max(maxTc, clusterTc + b.readInt16BE(x.start + tr.len));
    }
    i = x.start + x.size;
  }
  const s = Math.max(maxTc > 0 ? (maxTc * scale) / 1e9 : 0, duration > 0 && Number.isFinite(duration) ? (duration * scale) / 1e9 : 0);
  return s > 0 ? s : null;
}
function mp4Seconds(b) {
  let movie = 0, media = 0, mediaScale = 0, movieScale = 0, fragEnd = 0, mehd = 0;
  const walk = (from, to, depth) => {
    let i = from;
    while (i + 8 <= to && depth < 6) {
      let size = b.readUInt32BE(i); const type = b.toString('latin1', i + 4, i + 8); let head = 8;
      if (size === 1) { if (i + 16 > to) return; size = uintBE(b, i + 8, 8); head = 16; } else if (size === 0) size = to - i;
      if (size < head) return;
      const s = i + head, e = Math.min(to, i + size), v = b[s];
      if (['moov', 'trak', 'mdia', 'mvex', 'moof', 'traf'].includes(type)) walk(s, e, depth + 1);
      else if (type === 'mvhd' && s + (v === 1 ? 32 : 20) <= e) { movieScale = v === 1 ? b.readUInt32BE(s + 20) : b.readUInt32BE(s + 12); const d = v === 1 ? uintBE(b, s + 24, 8) : b.readUInt32BE(s + 16); if (movieScale) movie = d / movieScale; }
      else if (type === 'mdhd' && s + (v === 1 ? 32 : 20) <= e && !mediaScale) { mediaScale = v === 1 ? b.readUInt32BE(s + 20) : b.readUInt32BE(s + 12); const d = v === 1 ? uintBE(b, s + 24, 8) : b.readUInt32BE(s + 16); if (mediaScale) media = d / mediaScale; }
      else if (type === 'mehd' && s + 8 <= e) mehd = v === 1 ? uintBE(b, s + 4, 8) : b.readUInt32BE(s + 4);
      if (type === 'traf') fragEnd = Math.max(fragEnd, trafEnd(s, e));
      i = i + size;
    }
  };
  const trafEnd = (from, to) => {
    let base = 0, def = 0, sum = 0, i = from;
    while (i + 8 <= to) {
      const size = b.readUInt32BE(i); const type = b.toString('latin1', i + 4, i + 8); const s = i + 8, e = Math.min(to, i + size);
      if (size < 8) break;
      const flags = uintBE(b, s + 1, 3), v = b[s];
      if (type === 'tfhd') { let o = s + 8; if (flags & 1) o += 8; if (flags & 2) o += 4; if (flags & 8 && o + 4 <= e) def = b.readUInt32BE(o); }
      else if (type === 'tfdt' && s + 8 <= e) base = v === 1 ? uintBE(b, s + 4, 8) : b.readUInt32BE(s + 4);
      else if (type === 'trun' && s + 8 <= e) {
        const count = Math.min(b.readUInt32BE(s + 4), 1e6); let o = s + 8; if (flags & 1) o += 4; if (flags & 4) o += 4;
        const per = [0x100, 0x200, 0x400, 0x800].filter(f => flags & f).length * 4;
        if (flags & 0x100) { for (let k = 0; k < count && o + 4 <= e; k++, o += per) sum += b.readUInt32BE(o); } else sum += count * def;
      }
      i += size;
    }
    return base + sum;
  };
  try { walk(0, b.length, 0); } catch { /* a broken box: what was read so far */ }
  const s = Math.max(movie, media, movieScale && mehd ? mehd / movieScale : 0, mediaScale && fragEnd ? fragEnd / mediaScale : 0);
  return s > 0 && Number.isFinite(s) ? s : null;
}
function oggSeconds(b) {
  const head = b.indexOf('OpusHead');
  let rate = 0, skip = 0;
  if (head >= 0 && head + 12 <= b.length) { rate = 48000; skip = b.readUInt16LE(head + 10); }
  else { const vh = b.indexOf('\x01vorbis', 0, 'latin1'); if (vh >= 0 && vh + 16 <= b.length) rate = b.readUInt32LE(vh + 12); }
  if (!rate) return null;
  for (let at = b.lastIndexOf('OggS'); at >= 0; at = at ? b.lastIndexOf('OggS', at - 1) : -1) {
    if (at + 14 > b.length) continue;
    const g = b.readBigInt64LE(at + 6);
    if (g > 0n) { const s = (Number(g) - skip) / rate; return s > 0 ? s : null; }
  }
  return null;
}
export function clipSeconds(bytes, kind = sniff(bytes)) {
  try {
    if (kind === 'webm') return webmSeconds(bytes);
    if (kind === 'mp4') return mp4Seconds(bytes);
    if (kind === 'ogg') return oggSeconds(bytes);
  } catch { /* unreadable */ }
  return null;
}
/** Bytes a second assumed when a clip's length can't be read (a low bitrate, so the estimate errs long). */
export const UNKNOWN_BYTES_PER_SECOND = 2000;
/** The seconds a clip is counted as for the daily caps and the cost: its real length, else an estimate from its size. */
export function countedSeconds(bytes, declaredMs = 0) {
  const real = clipSeconds(bytes);
  return Math.max((+declaredMs || 0) / 1000, real != null ? real : bytes.length / UNKNOWN_BYTES_PER_SECOND);
}

/** Is speech to text available (the provider is known and its key is set)? */
export function sttEnabled(cfg = config) {
  if (!cfg.sttProvider || !PROVIDERS[cfg.sttProvider]) return false;
  return cfg.sttProvider === 'mock' || !!cfg.sttApiKey;
}
export const providerName = () => config.sttProvider;

/** Rude words a misheard clip might contain are shown as stars (the kid can retype; Send screens the text anyway). */
export function maskWords(text) {
  return String(text || '').split(/(\s+)/).map(w => (w.trim() && hasProfanity(w) ? '*'.repeat(Math.min(8, Array.from(w).length)) : w)).join('');
}
/** Tidy the words for the text box: no control characters, collapsed spaces, at most MAX_TEXT characters. */
export function tidy(text) {
  let s = String(text || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f‪-‮⁦-⁩]/g, '').replace(/[ \t]+/g, ' ').trim();
  if (s.length > MAX_TEXT) { s = s.slice(0, MAX_TEXT); if (/[\ud800-\udbff]$/.test(s)) s = s.slice(0, -1); }
  return s;
}

/**
 * Turn one clip into words. bytes: the clip (a Buffer, kept in memory only); locale: the kid's site language.
 * -> { text, provider, ms }. Throws SttError: 'off', 'format', 'empty', 'busy', 'provider', 'timeout'.
 * The caller drops its reference to bytes as soon as this returns.
 */
export async function transcribe({ bytes, locale = 'en', signal = null }) {
  if (!sttEnabled()) throw new SttError('off');
  const kind = sniff(bytes);
  if (!KINDS.includes(kind)) throw new SttError('format');
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  let raw;
  try {
    raw = await PROVIDERS[config.sttProvider]({ bytes, kind, locale, signal: sig, key: config.sttApiKey, model: config.sttModel });
  } catch (e) {
    if (e instanceof SttError) throw e;
    if (timeout.aborted) throw new SttError('timeout');
    throw new SttError('provider', e && e.name === 'AbortError' ? 'aborted' : 'network');
  }
  return { text: maskWords(tidy(raw)), provider: config.sttProvider, ms: Date.now() - t0 };
}
