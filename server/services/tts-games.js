// AI voices for one chosen game that is not an official seed game (docs/decisions.md "AI voices for a chosen game").
// The site owner (platform admin) switches a game on at /admin/voices or on the game's own page (/g/<slug>); every
// switch is audited. Only a game made by a teacher, school staff or the admin (or an official game) can be switched on:
// a student's game never, because its words are a kid's.
// - Stored in settings 'tts.games' as { <game id>: { by, at } }.
// - What may be read: only the game's OWN words, taken from its PUBLISHED version's HTML (string literals in its
//   scripts, text and a few text attributes in its markup), cached per published version id, so publishing a new version
//   uses the new words at once. Digit runs count as placeholders (a score, a level), and a line may be joined from at
//   most MAX_JOIN of those words (a "Score: " + n + "!" template, a sentence built from two strings). Anything else is
//   422 filtered and the device's voice reads it. The usual backstops (rude words, personal info, the player's own name
//   or username, TTS_MAX_CHARS) still run in routes/tts.js.
import { q, setting, audit } from '../db.js';
import * as games from './games.js';
import { isStaff } from './schools.js';
import { isOfficial } from './classlive-access.js';
import { tidy } from './tts.js';

export const KEY = 'tts.games';
/** A joined line may use at most this many of the game's words (numbers and bare punctuation not counted). */
export const MAX_JOIN = 4;
const MAX_FRAGMENT = 600, MAX_FRAGMENTS = 20000, CACHE_N = 50;

// ---------------------------------------------------------------- the switch
let memo = { raw: null, map: {} };
/** { <game id>: { by, at } } of the games switched on. */
export function switched() {
  const raw = setting(KEY);
  if (raw !== memo.raw) { let m = {}; try { m = JSON.parse(raw || '{}') || {}; } catch { m = {}; } memo = { raw, map: m && typeof m === 'object' && !Array.isArray(m) ? m : {} }; }
  return memo.map;
}
export const isOn = id => !!id && Object.prototype.hasOwnProperty.call(switched(), id);

/** Who made the game: may it have AI voices at all? Official games, and games whose maker is a teacher, school staff or
 *  the platform admin. -> null (ok) or a sentence for the admin. */
export function whyNot(g) {
  if (!g) return 'No such game.';
  if (isOfficial(g)) return null;
  const owner = q.get('SELECT * FROM users WHERE id=?', g.owner_id);
  if (!owner || owner.is_guest || owner.banned) return 'This game\'s maker has no account in good standing, so it keeps the device\'s voice.';
  if (owner.role === 'admin' || isStaff(owner)) return null;
  return `This game was made by @${owner.username}, who is not a teacher, school staff or admin. Only games made by teachers, school staff or the admin can have AI voices (a student's game holds a kid's own words).`;
}

/** Find a game from what the admin pasted: a slug, a game id, or a link to /g/<slug> or /play/<slug> (any language
 *  prefix, any host). */
export function findGame(input) {
  const s = String(input || '').trim().slice(0, 500);
  if (!s) return null;
  let p = s;
  try { if (/^https?:\/\//i.test(s)) p = new URL(s).pathname; } catch { /* not a URL */ }
  const m = /(?:^|\/)(?:g|play)\/([a-z0-9-]{1,60})(?:[/?#]|$)/i.exec(p);
  const slug = (m ? m[1] : p.replace(/^\/+|\/+$/g, '')).toLowerCase();
  return games.getGameBySlug(slug) || games.getGame(s) || null;
}

/** Switch a game on or off. -> { ok, game } or { ok: false, status, error }. */
export function set(actor, g, on) {
  if (!actor || actor.role !== 'admin') return { ok: false, status: 404, error: 'Not found.' };
  if (!g) return { ok: false, status: 404, error: 'No game with that name or link.' };
  const map = { ...switched() };
  if (on) {
    const why = whyNot(g);
    if (why) return { ok: false, status: 400, error: why };
    map[g.id] = { by: actor.id, at: Date.now() };
  } else delete map[g.id];
  setting(KEY, JSON.stringify(map));
  audit(actor.id, on ? 'admin.tts.game.on' : 'admin.tts.game.off', g.id, { slug: g.slug });
  return { ok: true, game: info(g) };
}

/** What the admin pages show about a game's switch. */
export function info(g) {
  const on = isOn(g.id), why = whyNot(g);
  const live = g.status === 'published' && !!g.published_version_id && !g.hidden_reason;
  return { id: g.id, slug: g.slug, title: g.title, on, ok: !why, why, live, owner: (q.get('SELECT username FROM users WHERE id=?', g.owner_id) || {}).username || '' };
}
/** The games switched on, newest first (games deleted since are left out). */
export function list() {
  return Object.entries(switched()).map(([id, s]) => ({ g: games.getGame(id), at: s.at || 0 })).filter(x => x.g).sort((a, b) => b.at - a.at).map(x => ({ ...info(x.g), at: x.at }));
}

/** May this game use AI voices because the admin switched it on: switched on, still made by an allowed maker,
 *  published, not hidden or suspended. Never a draft or a preview (those are not the published version). */
export const allowed = g => !!g && isOn(g.id) && g.status === 'published' && !!g.published_version_id && !g.hidden_reason && !whyNot(g);

// ---------------------------------------------------------------- the game's own words
const NUM = '';   // a number (a run of digits) or a {placeholder}
/** Text -> the form lines are compared in: NFC, digit runs as one placeholder, no whitespace, lower case. */
export function canon(text, { placeholders = false } = {}) {
  let s = tidy(text).replace(//g, '');
  if (placeholders) s = s.replace(/\$\{[^}]{0,200}\}|\{\{?\s*\w+\s*\}?\}/g, NUM);
  s = s.replace(/\d+(?:[.,'’ ]\d+)*/g, NUM);
  return s.replace(/\s+/g, '').toLowerCase();
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ' '; } }
  return ENT[e.toLowerCase()] ?? m;
});
const ESC = { n: '\n', r: ' ', t: ' ', b: '', f: '', v: ' ', 0: '' };
/** The string literals of a script (template literals are split at ${…}, which stays as a placeholder). */
export function scriptStrings(src) {
  const out = []; const n = src.length; let i = 0, prev = '';
  const readStr = quote => {
    let s = ''; i++;
    while (i < n) {
      const c = src[i];
      if (c === '\\') {
        const d = src[i + 1]; i += 2;
        if (d === 'u') { const m = /^\{([0-9a-f]{1,6})\}|^([0-9a-f]{4})/i.exec(src.slice(i, i + 8)); if (m) { try { s += String.fromCodePoint(parseInt(m[1] || m[2], 16)); } catch { /* bad */ } i += m[0].length; } }
        else if (d === 'x') { const h = src.slice(i, i + 2); if (/^[0-9a-f]{2}$/i.test(h)) { s += String.fromCharCode(parseInt(h, 16)); i += 2; } }
        else if (d === '\n' || d === '\r') { /* a line continuation */ }
        else s += ESC[d] ?? d ?? '';
        continue;
      }
      if (quote === '`' && c === '$' && src[i + 1] === '{') {
        // ${ … }: a placeholder; skip to its matching brace (strings inside it are read as strings too).
        s += '${x}'; i += 2; let depth = 1;
        while (i < n && depth) {
          const e = src[i];
          if (e === '{') depth++; else if (e === '}') depth--;
          else if (e === '"' || e === "'" || e === '`') { readStr(e); continue; }
          i++;
        }
        continue;
      }
      if (c === quote) { i++; break; }
      if (c === '\n' && quote !== '`') break;
      s += c; i++;
    }
    out.push(s);
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') { readStr(c); prev = 'a'; continue; }
    if (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      // A regular expression: skip it (a quote inside one is not a string).
      i++; let cls = false;
      while (i < n && src[i] !== '\n') { const e = src[i]; if (e === '\\') { i += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; i++; }
      i++; prev = 'a'; continue;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
const ATTRS = /\s(?:title|alt|aria-label|placeholder|value|content|label|data-say|data-text)\s*=\s*("([^"]*)"|'([^']*)')/gi;
/** Every piece of text in a game's HTML: script string literals, markup text and text attributes. */
export function sourceFragments(html) {
  const src = String(html || '');
  const out = [];
  const scripts = [];
  const rest = src.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (m, body) => { scripts.push(body); return ' <x> '; })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' <x> ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const s of scripts) out.push(...scriptStrings(s));
  for (const m of rest.matchAll(/<[^>]*>/g)) for (const a of m[0].matchAll(ATTRS)) out.push(unent(a[2] ?? a[3] ?? ''));
  for (const t of rest.split(/<[^>]*>/)) out.push(unent(t));
  // Markup inside strings (innerHTML = '<b>Well done</b>!'): its text too.
  const more = [];
  for (const f of out) if (/<\/?[a-z][^>]*>/i.test(f)) { more.push(unent(f.replace(/<[^>]*>/g, ' '))); for (const t of f.split(/<[^>]*>/)) more.push(unent(t)); }
  return out.concat(more);
}

/** The allowlist of one source: { exact: Set(canon), parts: Map(first char -> [canon] longest first) }. */
export function buildAllowlist(html) {
  const exact = new Set();
  const add = s => { if (exact.size >= MAX_FRAGMENTS) return; const c = canon(s, { placeholders: true }); if (c && c.length <= MAX_FRAGMENT * 2) exact.add(c); };
  for (const f of sourceFragments(html)) {
    const t = tidy(f);
    if (!t || t.length > MAX_FRAGMENT * 4 || !/[\p{L}\p{N}]/u.test(t)) continue;
    add(t);
    // Its lines and sentences on their own (a game may speak a paragraph one sentence at a time).
    const lines = String(f).split(/\n+/).map(tidy).filter(Boolean);
    if (lines.length > 1) lines.forEach(add);
    const sentences = t.split(/(?<=[.!?。！？…])\s+/).filter(Boolean);
    if (sentences.length > 1) sentences.forEach(add);
  }
  const parts = new Map();
  for (const c of exact) { const k = c[0]; if (!parts.has(k)) parts.set(k, []); parts.get(k).push(c); }
  for (const a of parts.values()) a.sort((x, y) => y.length - x.length);
  return { exact, parts };
}

const hasWord = s => /[\p{L}]/u.test(s);
const PUNCT = /^[^\p{L}\p{N}]+/u;
/** Is the canonical text one of the words, or joined from at most MAX_JOIN of them with numbers and punctuation? */
export function matches(a, c) {
  if (!c) return false;
  if (a.exact.has(c)) return true;
  const n = c.length;
  // best[i]: the fewest words used to make c[0..i) (Infinity: can't).
  const best = new Array(n + 1).fill(Infinity); best[0] = 0;
  for (let i = 0; i < n; i++) {
    const b = best[i]; if (b === Infinity) continue;
    if (c[i] === NUM) { if (b < best[i + 1]) best[i + 1] = b; continue; }
    const p = PUNCT.exec(c.slice(i));
    if (p) { const j = i + p[0].length; if (b < best[j]) best[j] = b; }
    if (b >= MAX_JOIN) continue;
    for (const w of a.parts.get(c[i]) || []) {
      if (w.length > n - i || !c.startsWith(w, i)) continue;
      const add = hasWord(w) ? 1 : 0;
      if (b + add < best[i + w.length]) best[i + w.length] = b + add;
    }
  }
  return best[n] <= MAX_JOIN && best[n] >= 1;
}

const cache = new Map();   // published version id -> allowlist
/** The allowlist of a game's published version (cached per version id). */
export function allowlistFor(g) {
  const vid = g && g.published_version_id; if (!vid) return null;
  let a = cache.get(vid);
  if (!a) {
    const v = games.getVersion(vid); if (!v || v.game_id !== g.id) return null;
    a = buildAllowlist(v.html);
    cache.set(vid, a); if (cache.size > CACHE_N) cache.delete(cache.keys().next().value);
  }
  return a;
}
/** Are these the game's own words (its published version)? -> the text to read, or null. */
export function allowedText(g, text) {
  const a = allowlistFor(g); if (!a) return null;
  const s = tidy(text);
  return s && matches(a, canon(s)) ? s : null;
}
export const _clear = () => { cache.clear(); memo = { raw: null, map: {} }; };
