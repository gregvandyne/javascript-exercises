// AI voices on our own pages (docs/tts-design.md; server/routes/tts.js). Fetches a line's audio from our server and plays
// it, or hands its bytes to a game frame (public/js/play.js), with the device's own voice as the fallback for anything
// that goes wrong. Only text written by us, a game's makers or a teacher is ever sent: callers pass the game's own words
// (play.js, official games only) or a live / lesson question by its number (the server reads the teacher's text).
//   voiceMode() / setVoiceMode('ai' | 'device')  this device's choice (localStorage 'oomba:voices'; data saver: device)
//   ttsLocale(tag)                               a language tag -> the site locale an AI voice speaks, or null
//   ttsBlob(body)                                POST /api/tts, then the MP3 -> a Blob (throws on any refusal)
//   readAloud({ text, lang, ai })                a page reads text: AI voice when ai = { body, langs } fits, else device
//   stopReading()

export const PREF_KEY = 'oomba:voices';
const SITE = ['en', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru'];

/** The browser asks for less data (Data Saver): AI voices stay off unless the player picks them. */
export const saveData = () => { try { return !!(navigator.connection && navigator.connection.saveData); } catch { return false; } };
export function voiceMode() {
  try { const v = localStorage.getItem(PREF_KEY); if (v === 'ai' || v === 'device') return v; } catch { /* storage off */ }
  return saveData() ? 'device' : 'ai';
}
export function setVoiceMode(v) { try { localStorage.setItem(PREF_KEY, v === 'device' ? 'device' : 'ai'); } catch { /* storage off */ } }

/** The same mapping as the SDK and server/services/tts-voices.js ttsLocale. */
export function ttsLocale(tag) {
  const t = String(tag || '').trim().replace(/_/g, '-').toLowerCase();
  if (!t || t.length > 20) return null;
  if (t === 'en-gb' || t === 'en-uk') return 'en-GB';
  if (/^zh-(hant|tw|hk|mo)\b/.test(t)) return 'zh-Hant';
  if (t === 'zh' || t.startsWith('zh-') || t === 'pt-pt') return null;
  const base = t.split('-')[0];
  return SITE.includes(base) ? base : null;
}
/** Is an AI voice on for this language on this page? langs: the page's tts.langs (absent: off). */
export const aiOn = (langs, lang) => Array.isArray(langs) && voiceMode() === 'ai' && langs.includes(ttsLocale(lang));

// ---- fetching: a small page cache (40 lines / 8 MB), at most 3 at a time, 8 s each ----
const cache = new Map(); let cacheBytes = 0;
const MAX_N = 40, MAX_BYTES = 8 * 1048576, MAX_AT_ONCE = 3, WAIT_MS = 8000;
let running = 0; const queue = [];
const slot = () => (running < MAX_AT_ONCE ? (running++, Promise.resolve()) : new Promise(r => queue.push(r)));
const free = () => { const n = queue.shift(); if (n) n(); else running--; };
function remember(key, blob) {
  if (cache.has(key)) { cacheBytes -= cache.get(key).size; cache.delete(key); }
  cache.set(key, blob); cacheBytes += blob.size;
  while (cache.size > MAX_N || cacheBytes > MAX_BYTES) { const [k, b] = cache.entries().next().value; cache.delete(k); cacheBytes -= b.size; }
}
const inflight = new Map();
export class TtsRefused extends Error { constructor(code, status) { super(code); this.code = code; this.status = status; } }
/** body: the POST /api/tts body. -> Blob (audio/mpeg). Throws TtsRefused / AbortError / TypeError: use the device voice. */
export function ttsBlob(body) {
  const key = JSON.stringify(body);
  if (cache.has(key)) { const b = cache.get(key); cache.delete(key); cache.set(key, b); return Promise.resolve(b); }
  if (inflight.has(key)) return inflight.get(key);
  const p = (async () => {
    await slot();
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), WAIT_MS);
    try {
      const r = await fetch('/api/tts', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      let d = null; try { d = await r.json(); } catch { /* none */ }
      if (!r.ok || !d || typeof d.u !== 'string' || !/^\/tts\/[0-9a-f]{64}\.mp3$/.test(d.u)) throw new TtsRefused((d && d.code) || 'error', r.status);
      const a = await fetch(d.u, { credentials: 'same-origin', signal: ctl.signal });
      if (!a.ok) throw new TtsRefused('error', a.status);
      const blob = await a.blob();
      if (!blob.size) throw new TtsRefused('error', 200);
      remember(key, blob);
      return blob;
    } finally { clearTimeout(timer); free(); inflight.delete(key); }
  })();
  inflight.set(key, p);
  return p;
}

// ---- reading on a page (Oomba Live, lesson quizzes) ----
let audio = null, seq = 0;
/** The device's own voice: the closest voice for the language. -> true when it will speak. */
export function deviceSpeak(text, lang) {
  try {
    const ss = window.speechSynthesis; if (!ss || !text) return false;
    const u = new SpeechSynthesisUtterance(String(text)); if (lang) u.lang = lang;
    const v = deviceVoice(lang); if (v) u.voice = v;
    ss.cancel(); ss.speak(u); return true;
  } catch { return false; }
}
export function deviceVoice(lang) {
  try {
    const vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
    const l = String(lang || '').toLowerCase(), base = l.split('-')[0];
    return vs.find(v => v.lang && v.lang.toLowerCase() === l) || vs.find(v => v.lang && v.lang.toLowerCase().split(/[-_]/)[0] === base) || null;
  } catch { return null; }
}
export function stopReading() {
  seq++;
  if (audio) { try { audio.pause(); audio.removeAttribute('src'); } catch { /* ignore */ } }
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch { /* ignore */ }
}
/**
 * Read text aloud. ai: { body, langs } — the POST /api/tts body (a question by its number, never free text) and the
 * page's AI locales; with no ai, AI voices off for this language, or anything failing, the device's own voice reads text.
 * -> true when something will be read.
 */
export function readAloud({ text, lang, ai = null } = {}) {
  stopReading();
  const my = seq;
  if (!ai || !aiOn(ai.langs, lang)) return deviceSpeak(text, lang);
  ttsBlob(ai.body).then(blob => {
    if (my !== seq) return;
    const url = URL.createObjectURL(blob);
    if (!audio) audio = new Audio();
    audio.onended = () => URL.revokeObjectURL(url);
    audio.onerror = () => { URL.revokeObjectURL(url); if (my === seq) deviceSpeak(text, lang); };
    audio.src = url;
    return audio.play();
  }).catch(() => { if (my === seq) deviceSpeak(text, lang); });
  return true;
}
