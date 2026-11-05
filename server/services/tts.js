// AI voices (text to speech; docs/decisions.md "AI voices", docs/tts-design.md): official games, lessons and Oomba Live
// read SITE-, GAME- and TEACHER-written text aloud with a hosted voice instead of the device's own.
// - OFF by default: on only when TTS_ENABLED=1 and a key is set (TTS_API_KEY; STT_API_KEY only when both providers are
//   openai). Each locale is also off until the admin switches it on at /admin/voices.
// - Never a kid's free text, never a name: the routes pick the text (a signed official-game token, a live question by
//   number, a lesson quiz question by number) and speakable() is the backstop (rude words, personal info, the user's own
//   name or username, too long).
// - Audio is cached on disk (<dataDir>/tts/<2 hex>/<sha256>.mp3), keyed by everything that changes the sound, so one
//   line is generated once for the whole site; identical requests in flight share one provider call.
// - Logs carry a short hash, sizes and timings: never the text, a user id or an address.
// - The provider's API facts (URL, fields, voices, models) are from memory and not checked here (docs/tts-design.md).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { q, now } from '../db.js';
import { register } from './jobs.js';
import { log } from './log.js';
import { hasProfanity, personalInfo, looksLikeLinkCode, normalise as foldName } from './textfilter.js';
import * as usage from './tts-usage.js';
import * as V from './tts-voices.js';

export class TtsError extends Error {
  constructor(code, message = code) { super(message); this.code = code; }
}

/** Tests replace fetch and log here (no network in unit tests; the log hook checks that no text is ever logged). */
export const hooks = { fetch: (...a) => globalThis.fetch(...a), log: (...a) => log(...a) };

/** An MP3's first bytes: an ID3 tag or an MPEG audio frame sync. */
export function isMp3(b) {
  if (!b || b.length < 4) return false;
  if (b.toString('latin1', 0, 3) === 'ID3') return true;
  return b[0] === 0xff && (b[1] & 0xe0) === 0xe0 && ((b[1] >> 1) & 3) !== 0;   // sync + a layer
}

// One silent MPEG-1 Layer III frame: 32 kbit/s, 44.1 kHz, mono, no CRC, 104 bytes, zero side info = silence. Browsers
// and ffmpeg decode it; each frame is 1152 samples (about 26 ms).
const SILENT_FRAME = (() => { const f = Buffer.alloc(104); f[0] = 0xff; f[1] = 0xfb; f[2] = 0x10; f[3] = 0xc0; return f; })();
/** A real, playable, silent MP3 a little longer for longer text (4..200 frames, about 0.1..5 s). */
export const silentMp3 = chars => Buffer.concat(Array(Math.min(200, Math.max(4, Math.round((+chars || 0) / 12)))).fill(SILENT_FRAME));

export const isGptModel = m => /^gpt-/i.test(String(m || ''));
export const PROVIDERS = {
  /** OpenAI's speech endpoint. gpt-4o-mini-tts takes reading instructions; tts-1 / tts-1-hd take a speed instead. */
  async openai({ text, voice, model, instructions, speed, signal, key }) {
    const body = { model, input: text, voice, response_format: 'mp3', ...(isGptModel(model) ? { instructions } : { speed }) };
    const res = await hooks.fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal,
    });
    if (!res.ok) throw new TtsError(res.status === 429 ? 'busy' : 'provider', `openai ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isMp3(buf)) throw new TtsError('provider', 'openai: not mp3');
    return buf;
  },
  /** Tests only (refused in production by config): a silent MP3, so headless Chromium can play it and fire `ended`. */
  async mock({ text }) { return silentMp3(String(text || '').length); },
};
export const MODEL_OF = { mock: 'mock' };
const modelOf = (cfg = config) => MODEL_OF[cfg.ttsProvider] || cfg.ttsModel || 'gpt-4o-mini-tts';

/** The key for the provider: TTS_API_KEY, else STT_API_KEY when both TTS and STT use OpenAI. */
export function ttsKey(cfg = config) {
  if (cfg.ttsApiKey) return cfg.ttsApiKey;
  if (cfg.ttsProvider === 'openai' && cfg.sttProvider === 'openai' && cfg.sttApiKey) return cfg.sttApiKey;
  return '';
}
/** Is the owner's switch on, the provider known and (except the mock) a key set? */
export function ttsEnabled(cfg = config) {
  if (!cfg.ttsEnabled || !cfg.ttsProvider || !PROVIDERS[cfg.ttsProvider]) return false;
  return cfg.ttsProvider === 'mock' || !!ttsKey(cfg);
}
/** May this locale speak now (TTS on, the locale in TTS_LOCALES and switched on at /admin/voices)? */
export const localeOn = locale => ttsEnabled() && V.localeSwitchedOn(locale);
/** The locales pages may use now ([] when TTS is off). */
export const onLocales = () => (ttsEnabled() ? V.onLocales() : []);

// ---------------------------------------------------------------- what may be spoken
/** NFC, no control or bidi-override characters, whitespace collapsed, trimmed. */
export function tidy(text) {
  return String(text ?? '').normalize('NFC').replace(/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/g, ' ').replace(/\s+/g, ' ').trim();
}
/** What a voice must never say: emoji and pictographs. A row of stars in a counting question is a
 *  picture, not words — read aloud literally it is "star star star…" (Greg, live on the placement,
 *  2026-11-05). Stripped in spokenText(), which plan() applies to everything it hands a voice, so
 *  every context (a game's line, a live or lesson question, a course slide, a placement item) and
 *  every cache key use the spoken form only. tidy() itself does NOT strip: the line matchers
 *  (tts-lines, tts-games) compare with tidy(), and a registered line with emoji added must stay a
 *  different, refused line — the safety checks see the text as written, the voice hears it cleaned.
 *  The variation selector and keycap mark go too (a keycap digit keeps its digit: "1️⃣" speaks "1"),
 *  the regional-indicator pairs that make flags, and a zero-width joiner left behind by a sequence. */
const PICTOGRAPHS = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u20E3\u200D]/gu;
/** tidy(), plus the pictographs a voice must never name. The only text a voice is ever given. */
export function spokenText(text) { return tidy(String(text ?? '').replace(PICTOGRAPHS, ' ')); }
const latin = s => /^[\x20-\x7e]+$/.test(s);
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Does the text contain this name (folded; whole words for Latin names, anywhere for other scripts)? 3+ characters only. */
function hasName(text, name) {
  // Punctuation goes before folding (the fold reads "!" as a leetspeak "i").
  const words = v => foldName(String(v || '').replace(/[^\p{L}\p{N}]+/gu, ' ')).trim();
  const n = words(name);
  if (Array.from(n.replace(/\s/g, '')).length < 3) return false;
  const t = words(text);
  if (latin(n)) return new RegExp(`(^|\\s)${escRe(n)}(\\s|$)`).test(t);
  return t.replace(/\s/g, '').includes(n.replace(/\s/g, ''));
}
/** Contexts whose text the server itself picks by reference (routes/tts.js): a teacher's question set by
 *  number ('live', 'lesson'), or a Number Quest placement item by run id ('placement' — the item the run
 *  is serving now, regenerated on the server from its template and seed; generated maths text, never
 *  anything a child typed). */
const BY_NUMBER = new Set(['live', 'lesson', 'placement']);
/**
 * The backstop checks (the main guard is which text a route accepts). -> null (ok) | 'long' (empty or over
 * TTS_MAX_CHARS) | 'filtered' (rude words, personal info, something like a link code, the user's own name or username).
 * ctx 'live' / 'lesson' / 'placement': a question already on the student's screen, picked by the server. Its numbers and answer letters are not
 * taken for a phone number or a family link code (a maths question with its four answers reads as "2 + 3? A: 5. B: 4. C:
 * 6. D: 7.": one long run of digits, and letter-digit pairs like a link code). Rude words, emails and links still count.
 */
export function speakable(text, { user = null, ctx = null } = {}) {
  const s = tidy(text);
  if (!s || s.length > config.ttsMaxChars) return 'long';
  const quiz = BY_NUMBER.has(ctx), pi = personalInfo(s);
  if (hasProfanity(s) || (pi && !(pi === 'phone' && quiz)) || (!quiz && looksLikeLinkCode(s))) return 'filtered';
  if (user && (hasName(s, user.display_name) || hasName(s, user.username))) return 'filtered';
  return null;
}

// ---------------------------------------------------------------- cache
export const cacheDir = () => path.join(config.dataDir, 'tts');
export const fileOf = hash => path.join(cacheDir(), hash.slice(0, 2), `${hash}.mp3`);
export const urlOf = hash => `/tts/${hash}.mp3`;
export const HASH_RE = /^[0-9a-f]{64}$/;

/** Everything that changes the sound, for one request: the provider, model, voice, instructions (or speed), locale. */
export function plan({ text, locale, role = 'narrator', rate = 'normal', voice = null }) {
  const r = V.ROLES.includes(role) ? role : 'narrator';
  const bucket = V.RATES.includes(rate) ? rate : V.rateBucket(rate);
  const provider = config.ttsProvider, model = modelOf();
  const v = voice && V.VOICES.includes(voice) ? voice : V.voiceFor(r, locale);
  const instructions = isGptModel(model) ? V.instructionsFor(r, locale, bucket) : '';
  const speed = isGptModel(model) ? null : V.SPEED[bucket];
  const s = spokenText(text);
  return { text: s, locale, role: r, rate: bucket, provider, model, voice: v, instructions, speed, hash: cacheKey({ provider, model, voice: v, instructions, speed, locale, rate: bucket, text: s }) };
}
/** sha256 (hex) of every part that changes the audio. */
export function cacheKey({ provider, model, voice, instructions = '', speed = null, locale, rate = 'normal', text }) {
  return crypto.createHash('sha256').update([provider, model, voice, instructions, speed == null ? '' : String(speed), locale, rate, 'mp3', text].join('|')).digest('hex');
}
/** The cache row of a hash whose file is still there, or null (a row whose file went is dropped). */
export function cached(hash) {
  if (!HASH_RE.test(String(hash || ''))) return null;
  const r = q.get('SELECT * FROM tts_cache WHERE hash=?', hash);
  if (!r) return null;
  if (!fs.existsSync(fileOf(hash))) { q.run('DELETE FROM tts_cache WHERE hash=?', hash); return null; }
  return r;
}
function touch(r, pin) {
  const t = now();
  if (pin && !r.pinned) q.run('UPDATE tts_cache SET pinned=1 WHERE hash=?', r.hash);
  // last_used at most once an hour per line (a class of 30 on one question writes once).
  if (t - r.last_used > 3600e3) q.run('UPDATE tts_cache SET last_used=?, hits=hits+1 WHERE hash=?', t, r.hash);
  else q.run('UPDATE tts_cache SET hits=hits+1 WHERE hash=?', r.hash);
}

const inflight = new Map();
/** Requests waiting on a provider call now (tests). */
export const _inflight = () => inflight.size;

/**
 * Audio for one line. -> { hash, url, cached: bool }. Throws TtsError: 'off', 'long', 'site' (the daily characters or
 * the AI budget), 'fast' (gate refused), 'busy' (provider rate limit or timeout), 'provider'.
 *   gate(): called only when new audio must be made (not for a cache hit or a request joining one in flight); return
 *           an error code to refuse (the per-person generation limits live in the route).
 *   pin: keep this line through cache clean-ups (warm-up and admin samples).
 *   ctx: a label for the log line ('game', 'live', 'lesson', 'admin', 'warm').
 */
export async function synthesize({ text, locale, role = 'narrator', rate = 'normal', voice = null, ctx = 'game', pin = false, gate = null, signal = null }) {
  if (!ttsEnabled()) throw new TtsError('off');
  const p = plan({ text, locale, role, rate, voice });
  if (!p.text || p.text.length > config.ttsMaxChars) throw new TtsError('long');
  const hit = cached(p.hash);
  if (hit) {
    touch(hit, pin); usage.hit();
    hooks.log('info', 'tts', { h: p.hash.slice(0, 8), chars: p.text.length, locale: p.locale, role: p.role, ctx, provider: p.provider, ms: 0, cached: true });
    return { hash: p.hash, url: urlOf(p.hash), cached: true };
  }
  const running = inflight.get(p.hash);
  if (running) { const r = await running; if (pin) q.run('UPDATE tts_cache SET pinned=1 WHERE hash=?', p.hash); return { ...r, cached: true }; }
  const why = gate ? gate(p) : null;
  if (why) throw new TtsError(why);
  if (usage.blocked(p.text.length)) throw new TtsError('site');
  const job = generate(p, { ctx, pin, signal });
  inflight.set(p.hash, job);
  try { return await job; } finally { inflight.delete(p.hash); }
}

async function generate(p, { ctx, pin, signal }) {
  const t0 = Date.now();
  const timeout = AbortSignal.timeout(config.ttsTimeoutMs);
  const sig = signal ? AbortSignal.any([signal, timeout]) : timeout;
  // Counted before the call: a failed call may still have been billed.
  usage.record(p.text.length, p.provider);
  let buf;
  try {
    buf = await PROVIDERS[p.provider]({ text: p.text, voice: p.voice, model: p.model, instructions: p.instructions, speed: p.speed, signal: sig, key: ttsKey() });
    if (!Buffer.isBuffer(buf) || !isMp3(buf)) throw new TtsError('provider', 'not mp3');
  } catch (e) {
    usage.fail();
    const code = e instanceof TtsError ? e.code : timeout.aborted ? 'busy' : 'provider';
    hooks.log('warn', 'tts failed', { h: p.hash.slice(0, 8), chars: p.text.length, locale: p.locale, role: p.role, ctx, provider: p.provider, ms: Date.now() - t0, code, why: e instanceof TtsError ? e.message : (e && e.name) || 'error' });
    throw new TtsError(code);
  }
  const file = fileOf(p.hash);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.renameSync(tmp, file);
  const t = now();
  q.run(`INSERT INTO tts_cache(hash, bytes, chars, provider, model, voice, locale, role, pinned, hits, created_at, last_used) VALUES (?,?,?,?,?,?,?,?,?,0,?,?)
    ON CONFLICT(hash) DO UPDATE SET bytes=excluded.bytes, pinned=MAX(pinned, excluded.pinned), last_used=excluded.last_used`,
  p.hash, buf.length, p.text.length, p.provider, p.model, p.voice, p.locale, p.role, pin ? 1 : 0, t, t);
  hooks.log('info', 'tts', { h: p.hash.slice(0, 8), chars: p.text.length, bytes: buf.length, locale: p.locale, role: p.role, ctx, provider: p.provider, ms: Date.now() - t0, cached: false });
  if (cacheBytes() > capBytes() * 1.1) setImmediate(() => { try { cleanup(); } catch (e) { hooks.log('error', 'tts cleanup failed', { error: e.message }); } });
  return { hash: p.hash, url: urlOf(p.hash), cached: false };
}

export const capBytes = () => config.ttsCacheMb * 1024 * 1024;
export const cacheBytes = () => q.get('SELECT COALESCE(SUM(bytes),0) b FROM tts_cache').b;
export const cacheStats = () => q.get('SELECT COUNT(*) n, COALESCE(SUM(bytes),0) bytes, COALESCE(SUM(pinned),0) pinned FROM tts_cache');
const rm = f => { try { fs.unlinkSync(f); } catch { /* already gone */ } };
/**
 * Keep the cache under TTS_CACHE_MB: rows whose file went and files with no row are removed; then, over the cap, the
 * least recently used lines go (unpinned first; pinned ones only if they alone are over) until it is at 90%.
 * -> { removed, orphans, bytes }
 */
export function cleanup() {
  let orphans = 0, removed = 0;
  for (const r of q.all('SELECT hash FROM tts_cache')) if (!fs.existsSync(fileOf(r.hash))) { q.run('DELETE FROM tts_cache WHERE hash=?', r.hash); orphans++; }
  const dir = cacheDir();
  if (fs.existsSync(dir)) {
    for (const sub of fs.readdirSync(dir)) {
      const d = path.join(dir, sub);
      if (!/^[0-9a-f]{2}$/.test(sub) || !fs.statSync(d).isDirectory()) continue;
      for (const f of fs.readdirSync(d)) {
        const m = /^([0-9a-f]{64})\.mp3$/.exec(f);
        // Temporary files from a write that never finished (older than a minute) and files with no row.
        if (!m) { if (f.endsWith('.tmp') && Date.now() - fs.statSync(path.join(d, f)).mtimeMs > 60e3) { rm(path.join(d, f)); orphans++; } continue; }
        if (!q.get('SELECT 1 FROM tts_cache WHERE hash=?', m[1]) && !inflight.has(m[1])) { rm(path.join(d, f)); orphans++; }
      }
    }
  }
  let bytes = cacheBytes();
  const cap = capBytes();
  if (bytes > cap) {
    const target = cap * 0.9;
    for (const pinned of [0, 1]) {
      for (const r of q.all('SELECT hash, bytes FROM tts_cache WHERE pinned=? ORDER BY last_used, created_at', pinned)) {
        if (bytes <= target) break;
        rm(fileOf(r.hash)); q.run('DELETE FROM tts_cache WHERE hash=?', r.hash); bytes -= r.bytes; removed++;
      }
      if (bytes <= target) break;
    }
  }
  if (removed || orphans) hooks.log('info', 'tts cache cleanup', { removed, orphans, bytes });
  return { removed, orphans, bytes };
}
register('tts-cache-cleanup', 3600e3, () => cleanup(), { firstAfterMs: 13 * 60e3 });
