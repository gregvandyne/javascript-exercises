// AI voices warm-up: the spoken lines of official seed games, read from the repository's own files (trusted; never the
// copy in the database), generated ahead in the background so kids never wait for the first play of a line.
// - Only the game's `// ==== I18N START ==== … // ==== I18N END ====` block is evaluated, with node:vm in an empty
//   context and a 2-second limit. Plural objects and lines with {placeholders} are skipped (they change per player).
// - Roles: an optional `// ==== VOICES START ==== … // ==== VOICES END ====` block in the game defines
//   `const VOICE_ROLES = { <npc id>: '<role>', story: 'narrator', … }` and may define
//   `const VOICE_KEY_ROLES = { '<key prefix>': '<role>' }` for lines one character says under another's key (Granny's
//   shop line is d.shop.1). A line's role: the longest VOICE_KEY_ROLES prefix, else VOICE_ROLES[npc] for `d.<npc>.*`,
//   else VOICE_ROLES.story (else 'narrator'). The game picks a line's role with the same rule (Hero's voiceRole), and
//   the server takes the role from here, never from the page, so the warm cache always hits.
// - The same lines are the allowlist for POST /api/tts ctx 'game' (allowedLine): a game listed in GAMES may only have its
//   own words read, lines with {placeholders} only with numbers in their place.
// - One run at a time, two lines at a time; it stops when the daily characters or the AI budget run out, and pins
//   its lines so cache clean-ups keep them.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as tts from './tts.js';
import * as V from './tts-voices.js';
import * as usage from './tts-usage.js';
import { audit } from '../db.js';
import { config } from '../config.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const SEED_DIR = path.join(ROOT, 'seed-games');

/** Games that can be warmed and which of their keys are spoken. */
export const GAMES = {
  'hero-of-sunvale': { title: 'Hero of Sunvale', spoken: /^(intro\.\d+|end\.(\d+|free)|d\.[a-z]+\.[a-z0-9]+|hint\.[a-z0-9]+|say\.[a-zA-Z0-9]+|mg\.[a-z]+|sw\.[a-z0-9]+|cinder\.[a-z]+)$/ },
};
/** The official games that may use AI voices at all (routes/tts.js gameAllowed): only games listed in GAMES, whose
 *  spoken lines the server knows. Every other game keeps the device's voice. */
export const TTS_GAMES = new Set(Object.keys(GAMES));
/** Lines said under another character's key (used until the game has its own VOICE_KEY_ROLES). hint.* lines are read
 *  by the narrator in every character's card. */
export const DEFAULT_KEY_ROLES = { 'd.shop.': 'wise', 'd.gate.open': 'bright', 'mg.': 'bright', 'say.guard': 'deep', 'say.': 'friendly', 'sw.': 'grumpy', 'cinder.': 'deep', 'hint.': 'narrator' };
/** Used until the game has its own VOICES block (the same mapping as docs/tts-design.md §4). */
export const DEFAULT_VOICE_ROLES = {
  story: 'narrator', granny: 'wise', queen: 'wise', bo: 'deep', oakley: 'deep', finn: 'deep', plum: 'deep', chief: 'deep',
  tilly: 'friendly', ivy: 'friendly', hazel: 'friendly', maple: 'friendly', marigold: 'bright', hero: 'bright', snarlwick: 'grumpy', snarl: 'grumpy',
};

const block = (src, start, end) => {
  const a = src.indexOf(start), b = src.indexOf(end);
  return a >= 0 && b > a ? src.slice(a + start.length, b) : null;
};
const run = (code, name) => vm.runInNewContext(`${code}\n;${name}`, Object.create(null), { timeout: 2000 });
/** A game's I18N object and voice roles, from its file in seed-games/. */
export function readGame(slug, dir = SEED_DIR) {
  if (!GAMES[slug]) return null;
  return parseGame(fs.readFileSync(path.join(dir, `${slug}.html`), 'utf8'));
}
function parseGame(src) {
  const i18n = block(src, '// ==== I18N START ====', '// ==== I18N END ====');
  if (!i18n) return null;
  const strings = run(i18n, 'I18N');
  const v = block(src, '// ==== VOICES START ====', '// ==== VOICES END ====');
  let roles = DEFAULT_VOICE_ROLES, keyRoles = DEFAULT_KEY_ROLES;
  if (v) {
    const r = run(v, 'VOICE_ROLES'); if (r && typeof r === 'object') roles = { ...r };
    const k = run(v, "typeof VOICE_KEY_ROLES === 'undefined' ? null : VOICE_KEY_ROLES"); if (k && typeof k === 'object') keyRoles = { ...k };
  }
  return { strings, roles, keyRoles };
}
/** The role a key is spoken with. */
export function roleOf(key, roles, keyRoles = {}) {
  const pre = Object.keys(keyRoles).filter(p => key.startsWith(p)).sort((a, b) => b.length - a.length)[0];
  const m = /^d\.([a-z]+)\./.exec(key);
  const r = pre ? keyRoles[pre] : m && roles[m[1]] ? roles[m[1]] : roles.story;
  return V.ROLES.includes(r) ? r : 'narrator';
}
/** A game's spoken lines in one locale: [{ key, locale, role, text }] (falls back like the game's t(): locale, base, en).
 *  templates: true also lists lines with {placeholders} (for the allowlist; the warm-up skips them). */
export function gameLines(slug, locale, game = readGame(slug), { templates = false } = {}) {
  if (!game) return [];
  const { strings, roles, keyRoles } = game;
  const chain = [...new Set([locale, locale.split('-')[0], 'en'])].filter(c => Object.prototype.hasOwnProperty.call(strings, c));
  const keys = Object.keys(strings.en || {}).filter(k => GAMES[slug].spoken.test(k));
  const out = [];
  for (const key of keys) {
    let text; for (const c of chain) { if (strings[c][key] !== undefined) { text = strings[c][key]; break; } }
    if (typeof text !== 'string' || !text.trim() || (!templates && /\{\w+\}/.test(text))) continue;
    out.push({ key, locale, role: roleOf(key, roles, keyRoles), text });
  }
  return out;
}

// ---------------------------------------------------------------- the allowlist (routes/tts.js, ctx 'game')
// A game may only have its own spoken lines read: the server never sends text a player could have typed. A line with
// {placeholders} matches only with numbers in their place (a count like "Crystal smashed! 3/5"), never letters.
const NUM = "[0-9][0-9.,'’ ]{0,15}";
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const memo = new Map();   // `${slug}|${locale}` -> { mtime, exact: Map(text -> roles[]), tpl: [{ re, roles }] }
/** The allowlist of one game and locale (memoised per file modification time). */
export function allowlist(slug, locale, dir = SEED_DIR) {
  if (!GAMES[slug]) return null;
  const file = path.join(dir, `${slug}.html`);
  let mtime; try { mtime = fs.statSync(file).mtimeMs; } catch { return null; }
  const k = `${slug}|${locale}|${dir}`, hit = memo.get(k);
  if (hit && hit.mtime === mtime) return hit;
  const exact = new Map(), tpl = [];
  for (const x of gameLines(slug, locale, readGame(slug, dir), { templates: true })) {
    const text = tts.tidy(x.text);
    if (/\{\w+\}/.test(text)) {
      const re = new RegExp(`^${text.split(/\{\w+\}/).map(escRe).join(NUM)}$`, 'u');
      const t = tpl.find(y => y.re.source === re.source);
      if (t) { if (!t.roles.includes(x.role)) t.roles.push(x.role); } else tpl.push({ re, roles: [x.role] });
    } else {
      const r = exact.get(text) || []; if (!r.includes(x.role)) r.push(x.role); exact.set(text, r);
    }
  }
  const out = { mtime, exact, tpl };
  memo.set(k, out);
  return out;
}
/**
 * Is this one of the game's own spoken lines in this locale? -> { text, role } (role: the line's own role; the asked
 * role only when the same words are also another character's line) or null.
 */
export function allowedLine(slug, locale, text, askedRole = null) {
  const a = allowlist(slug, locale); if (!a) return null;
  const s = tts.tidy(text);
  const pick = roles => ({ text: s, role: roles.includes(askedRole) ? askedRole : roles[0] });
  const ex = a.exact.get(s); if (ex) return pick(ex);
  const t = a.tpl.find(y => y.re.test(s));
  return t ? pick(t.roles) : null;
}

// ---------------------------------------------------------------- the warm-up run
const blank = () => ({ running: false, games: [], locales: [], total: 0, done: 0, cached: 0, skipped: 0, failed: 0, chars: 0, usd: 0, stopped: null, startedAt: null, endedAt: null });
let state = blank();
export const status = () => { const { promise, ...s } = state; void promise; return { ...s, usd: Math.round(s.usd * 10000) / 10000 }; };

/** All lines for these games and locales, and how many characters are not cached yet (with their estimated cost). */
export function estimate(games, locales) {
  const lines = [];
  for (const g of games) { const game = readGame(g); for (const l of locales) lines.push(...gameLines(g, l, game)); }
  let chars = 0, missing = 0;
  for (const x of lines) { const p = tts.plan(x); if (!tts.cached(p.hash)) { chars += p.text.length; missing++; } }
  return { lines: lines.length, missing, chars, usd: usage.usdFor(chars), list: lines };
}

/** Start one background run. -> { ok, status } or { ok: false, error }. */
export function start({ games = [], locales = [], by = null, concurrency = 2 } = {}) {
  if (state.running) return { ok: false, error: 'A warm-up is already running.' };
  if (!tts.ttsEnabled()) return { ok: false, error: 'AI voices are off (TTS_ENABLED and a key).' };
  const gs = games.filter(g => GAMES[g]);
  // Any locale TTS_LOCALES allows, switched on or not (the admin may warm a language before turning it on).
  const ls = [...new Set(locales)].filter(l => config.ttsLocales.includes(l));
  if (!gs.length || !ls.length) return { ok: false, error: 'Pick a game and at least one language.' };
  const { list } = estimate(gs, ls);
  state = { ...blank(), running: true, games: gs, locales: ls, total: list.length, startedAt: Date.now() };
  audit(by, 'admin.tts.warm', gs.join(','), { locales: ls, lines: list.length });
  const queue = list.slice();
  const worker = async () => {
    while (queue.length && !state.stopped) {
      const x = queue.shift();
      if (usage.blocked(x.text.length)) { state.stopped = 'budget'; break; }
      try {
        const r = await tts.synthesize({ text: x.text, locale: x.locale, role: x.role, ctx: 'warm', pin: true });
        if (r.cached) state.cached++; else { state.chars += x.text.length; state.usd += usage.usdFor(x.text.length); }
        state.done++;
      } catch (e) {
        if (e.code === 'site') { state.stopped = 'budget'; break; }
        if (e.code === 'long') state.skipped++; else state.failed++;
      }
    }
  };
  state.promise = Promise.all(Array.from({ length: Math.max(1, Math.min(4, concurrency)) }, worker))
    .finally(() => { state.running = false; state.endedAt = Date.now(); delete state.promise; });
  return { ok: true, status: status() };
}
/** Ask a running warm-up to stop after the lines in flight. */
export function stop() { if (state.running) state.stopped = 'admin'; return status(); }
/** Tests: wait for the run to end. */
export const _wait = () => state.promise || Promise.resolve();
export const _reset = () => { state = blank(); };
