// AI voices for one chosen game that is not an official seed game (docs/decisions.md "AI voices for a chosen game").
// The site owner (platform admin) switches a game on at /admin/voices or on the game's own page (/g/<slug>); every
// switch is audited. A game made by a teacher, school staff or the admin can be switched on as it is. A student's game
// can be switched on too (owner's call, November 2026), but only for the published version the admin had in front of
// them: its words are a kid's, so the switch pins that version, and once the student publishes a new one the voices
// stop until the admin switches them on again. An official game never (it has its own known lines, in tts-lines).
// - Stored in settings 'tts.games' as { <game id>: { by, at, version? } } (version: the pinned published version).
// - What may be read: only the game's OWN words, taken from its PUBLISHED version's HTML (string literals in its
//   scripts, text and a few text attributes in its markup), cached per published version id, so publishing a new version
//   uses the new words at once. A line matches one of the game's strings as a whole; its placeholders (${…}, {name},
//   'a' + x + 'b') take a number or one of the game's own short names ('{name} wins!' with 'Fox'), never free text; a
//   number elsewhere must stand where the game's text has a number. A line may also be at most MAX_JOIN of the game's
//   phrases or sentences joined with spaces and plain punctuation (a kit "how to play" read as one), never single words,
//   list items (word lists, answer letters) or code strings, never glued inside a word, never with emoji added. Anything
//   else is 422 filtered and the device's voice reads it. The usual backstops (rude words, personal info, the player's
//   own name or username, TTS_MAX_CHARS) still run in routes/tts.js.
import { q, setting, audit } from '../db.js';
import * as games from './games.js';
import { isStaff } from './schools.js';
import { isOfficial } from './classlive-access.js';
import { tidy, ttsEnabled, onLocales } from './tts.js';
import { TTS_GAMES } from './tts-lines.js';

export const KEY = 'tts.games';
/** A joined line may use at most this many of the game's phrases or sentences (a kit "how to play" read as one). */
export const MAX_JOIN = 3;
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
  // Official games read their own known lines (tts-lines GAMES). Every official game is registered (Greg's rule,
  // 2026-11-05), so the not-listed answer below reports a bug, not a design choice.
  if (isOfficial(g)) return TTS_GAMES.has(g.slug) ? 'This official game already has AI voices: its known lines are read (tts-lines).' : 'This official game is missing from the AI voices list (tts-lines GAMES). That is a bug: every official game must be registered.';
  const owner = q.get('SELECT * FROM users WHERE id=?', g.owner_id);
  if (!owner || owner.is_guest || owner.banned) return 'This game\'s maker has no account in good standing, so it keeps the device\'s voice.';
  return null;
}
/** A student's game (its maker is not a teacher, school staff or the admin): its switch covers one published version. */
export function isStudentGame(g) {
  const owner = g && q.get('SELECT * FROM users WHERE id=?', g.owner_id);
  return !!owner && !(owner.role === 'admin' || isStaff(owner));
}
/** For a student's game switched on: did the student publish a new version since the admin switched it on? */
export function stale(g) {
  const s = g && switched()[g.id];
  return !!s && isStudentGame(g) && s.version !== g.published_version_id;
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
    const student = isStudentGame(g);
    if (student && !g.published_version_id) return { ok: false, status: 400, error: 'This is a student\'s game: publish it first. The switch covers the published version you can play now, so its words are ones you have seen.' };
    map[g.id] = { by: actor.id, at: Date.now(), ...(student ? { version: g.published_version_id } : {}) };
  } else delete map[g.id];
  setting(KEY, JSON.stringify(map));
  audit(actor.id, on ? 'admin.tts.game.on' : 'admin.tts.game.off', g.id, { slug: g.slug, ...(on && map[g.id].version ? { version: map[g.id].version, student: true } : {}) });
  return { ok: true, game: info(g) };
}

/** What the admin pages show about a game's switch. */
export function info(g) {
  const on = isOn(g.id), why = whyNot(g);
  const live = g.status === 'published' && !!g.published_version_id && !g.hidden_reason;
  return { id: g.id, slug: g.slug, title: g.title, on, ok: !why, why, live, student: !why && isStudentGame(g), stale: on && stale(g), owner: (q.get('SELECT username FROM users WHERE id=?', g.owner_id) || {}).username || '' };
}
/** Why a game switched on plays nothing yet, for the admin pages: null, or a sentence. */
export const silentWhy = () => (!ttsEnabled() ? 'AI voices are off for the whole site (TTS_ENABLED and a key), so nothing plays yet.'
  : !onLocales().length ? 'No language is switched on at AI voices, so nothing plays yet.' : null);
/** The games switched on, newest first (games deleted since are left out). */
export function list() {
  return Object.entries(switched()).map(([id, s]) => ({ g: games.getGame(id), at: s.at || 0 })).filter(x => x.g).sort((a, b) => b.at - a.at).map(x => ({ ...info(x.g), at: x.at }));
}

/** May this game use AI voices because the admin switched it on: switched on, still made by an allowed maker,
 *  published, not hidden or suspended. Never a draft or a preview (those are not the published version). */
export const allowed = g => !!g && isOn(g.id) && g.status === 'published' && !!g.published_version_id && !g.hidden_reason && !whyNot(g) && !stale(g);

// ---------------------------------------------------------------- the game's own words
const NUM = '';    // a number in the text (a run of up to MAX_DIGITS digits, maybe grouped: 1,234 · 1 234)
const SLOT = '';   // a placeholder in the game's text (${…}, {name}, 'a' + x + 'b'): a number, or one of its names
/** Longer digit runs (a phone number) are never a placeholder: they must be in the game's text as they are. */
export const MAX_DIGITS = 7;
/** Plain punctuation and spaces: the only characters allowed around and between joined strings (never emoji). */
const GAP = /[\s.,!?:;'"\-–—…·。、！？：；，．「」『』“”‘’«»¡¿]/u;
const MAX_GAP = 4;
const PLACEHOLDER = /\$\{[^}]{0,200}\}|\{\{?\s*\w+\s*\}?\}/g;
const DIGITS = /\d+(?:[.,'’ ]\d{3})*(?:[.,]\d{1,2})?(?!\d)/g;
const trimGap = s => { let a = 0, b = s.length; while (a < b && GAP.test(s[a])) a++; while (b > a && GAP.test(s[b - 1])) b--; return s.slice(a, b); };
/** Text -> the form lines are compared in: NFC, one space for any whitespace, lower case, numbers (and placeholders)
 *  as one character each, no plain punctuation at either end. */
export function canon(text, { placeholders = false } = {}) {
  let s = tidy(text).replace(/[]/g, '');
  if (placeholders) s = s.replace(PLACEHOLDER, SLOT);
  s = s.replace(DIGITS, m => ((m.match(/\d/g) || []).length <= MAX_DIGITS ? NUM : m));
  return trimGap(s.toLowerCase());
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const unent = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+\d*);/gi, (m, e) => {
  if (e[0] === '#') { const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(n); } catch { return ' '; } }
  return ENT[e.toLowerCase()] ?? m;
});
const ESC = { n: '\n', r: ' ', t: ' ', b: '', f: '', v: ' ', 0: '' };
/** A simple expression joined into a string ('Score: ' + game.score + '!'): a name, its fields, an index, a call. */
const EXPR = /^\s*\+\s*[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[\w$.]+\]|\([\w$.,\s]*\))*/;
const EXPR_BEFORE = /(?:^|[^\w$.)\]'"`])[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[[\w$.]+\]|\([\w$.,\s]*\))*\s*\+\s*$/;
/** The string literals of a script -> [{ s, arr }] (arr: an item of an array literal, like a word or letter list).
 *  Template literals keep ${…} as a placeholder, and a chain 'a' + x + 'b' is also given whole as 'a${x}b'. */
export function scriptItems(src) {
  const out = []; const n = src.length; let i = 0, prev = ''; const stack = [];
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
          else if (e === '"' || e === "'" || e === '`') { out.push({ s: readStr(e), arr: false }); continue; }
          i++;
        }
        continue;
      }
      if (c === quote) { i++; break; }
      if (c === '\n' && quote !== '`') break;
      s += c; i++;
    }
    return s;
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      const arr = stack[stack.length - 1] === '[';
      const pre = EXPR_BEFORE.test(src.slice(Math.max(0, i - 120), i));
      const first = readStr(c); out.push({ s: first, arr });
      let chain = (pre ? '${x}' : '') + first, joined = pre;
      for (;;) {
        const rest = src.slice(i, i + 300);
        const m = /^\s*\+\s*(?=['"`])/.exec(rest);
        if (m) { i += m[0].length; const s2 = readStr(src[i]); out.push({ s: s2, arr }); chain += s2; joined = true; continue; }
        const e = EXPR.exec(rest);
        if (e) { i += e[0].length; chain += '${x}'; joined = true; continue; }
        break;
      }
      if (joined) out.push({ s: chain, arr });
      prev = 'a'; continue;
    }
    if (c === '/' && (!prev || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) {
      // A regular expression: skip it (a quote inside one is not a string).
      i++; let cls = false;
      while (i < n && src[i] !== '\n') { const e = src[i]; if (e === '\\') { i += 2; continue; } if (e === '[') cls = true; else if (e === ']') cls = false; else if (e === '/' && !cls) break; i++; }
      i++; prev = 'a'; continue;
    }
    if (c === '[' || c === '{' || c === '(') stack.push(c);
    else if (c === ']' || c === '}' || c === ')') stack.pop();
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out;
}
/** The string literals of a script (see scriptItems). */
export const scriptStrings = src => scriptItems(src).map(x => x.s);
const ATTRS = /\s(?:title|alt|aria-label|placeholder|value|content|label|data-say|data-text)\s*=\s*("([^"]*)"|'([^']*)')/gi;
/** Every piece of text in a game's HTML -> [{ s, arr }]: script string literals, markup text and text attributes. */
export function sourceItems(html) {
  const src = String(html || '');
  const out = [];
  const scripts = [];
  const rest = src.replace(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi, (m, body) => { scripts.push(body); return ' <x> '; })
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' <x> ').replace(/<!--[\s\S]*?-->/g, ' ');
  for (const s of scripts) out.push(...scriptItems(s));
  for (const m of rest.matchAll(/<[^>]*>/g)) for (const a of m[0].matchAll(ATTRS)) out.push({ s: unent(a[2] ?? a[3] ?? ''), arr: false });
  for (const t of rest.split(/<[^>]*>/)) out.push({ s: unent(t), arr: false });
  // Markup inside strings (innerHTML = '<b>Well done</b>!'): its text too.
  const more = [];
  for (const f of out) if (/<\/?[a-z][^>]*>/i.test(f.s)) { more.push({ s: unent(f.s.replace(/<[^>]*>/g, ' ')), arr: f.arr }); for (const t of f.s.split(/<[^>]*>/)) more.push({ s: unent(t), arr: f.arr }); }
  return out.concat(more);
}
export const sourceFragments = html => sourceItems(html).map(x => x.s);

const letters = s => (s.match(/\p{L}/gu) || []).length;
const codeLike = s => /[_#<>=;\\@|{}[\]]|\p{Ll}\p{Lu}/u.test(s) || /^[\d.]*(?:px|em|rem|vh|vw|ms|deg|%)$/i.test(s);
/** May this string be one of the pieces of a joined line? A phrase or sentence of the game's, never an item of a list
 *  (a word list, answer letters, an alphabet) nor a short code string. */
export function pieceOk(t, arr) {
  const s = tidy(String(t).replace(PLACEHOLDER, ' '));
  return !arr && letters(s) >= 3 && !codeLike(s) && (/\p{L}\s+\p{L}/u.test(s) || /[.!?。！？…]$/.test(s) || /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]{3}/u.test(s));
}
/** May this string fill a word placeholder ('{name} wins!' with 'Fox')? A short name of the game's own (letters only,
 *  3+ letters, at most 3 words), never an item of a list. */
export const nameOk = (t, arr) => { const s = tidy(t); return !arr && s.length <= 30 && letters(s) >= 3 && /^\p{L}[\p{L}\p{M} '’-]*$/u.test(s) && s.split(' ').length <= 3 && !codeLike(s); };

const index = (m, c) => { const k = c[0]; if (!m.has(k)) m.set(k, []); m.get(k).push(c); };
/** The allowlist of one source: { exact: Set, lines: Map(first char -> [canon]), pieces: Map(…), names: Map(…) }. */
export function buildAllowlist(html) {
  const all = new Map();   // canon -> may be a joined piece
  const names = new Set();
  const add = (s, arr) => {
    if (all.size >= MAX_FRAGMENTS) return;
    const c = canon(s, { placeholders: true });
    if (!c || c.length > MAX_FRAGMENT * 2 || !/[\p{L}\p{N}]/u.test(c)) return;
    all.set(c, all.get(c) || pieceOk(s, arr));
  };
  for (const { s: f, arr } of sourceItems(html)) {
    const t = tidy(f);
    if (!t || t.length > MAX_FRAGMENT * 4 || !/[\p{L}\p{N}]/u.test(t)) continue;
    add(t, arr);
    if (nameOk(t, arr)) names.add(canon(t));
    // Its lines and sentences on their own (a game may speak a paragraph one sentence at a time).
    const lines = String(f).split(/\n+/).map(tidy).filter(Boolean);
    if (lines.length > 1) lines.forEach(l => add(l, arr));
    const sentences = t.split(/(?<=[.!?。！？…])\s+/).filter(Boolean);
    if (sentences.length > 1) sentences.forEach(l => add(l, arr));
  }
  const a = { exact: new Set(), lines: new Map(), pieces: new Map(), names: new Map() };
  for (const [c, piece] of all) { if (!c.includes(SLOT)) a.exact.add(c); index(a.lines, c); if (piece) index(a.pieces, c); }
  for (const c of names) index(a.names, c);
  for (const m of [a.lines, a.pieces, a.names]) for (const l of m.values()) l.sort((x, y) => y.length - x.length);
  return a;
}

/** Where can pattern p (one of the game's lines, maybe with placeholders) match c from i on? -> [[end, names left]]. */
function ends(a, p, c, i, w, out = [], j = 0) {
  while (j < p.length && p[j] !== SLOT) { if (c[i] !== p[j]) return out; i++; j++; }
  if (j === p.length) { out.push([i, w]); return out; }
  // A placeholder: a number, or (once a line) one of the game's own names.
  if (c[i] === NUM) ends(a, p, c, i + 1, w, out, j + 1);
  if (w > 0) for (const nm of a.names.get(c[i]) || []) if (c.startsWith(nm, i)) ends(a, p, c, i + nm.length, w - 1, out, j + 1);
  return out;
}
const isWordCh = ch => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);
const candidates = (m, c, i) => (m.get(c[i]) || []).concat(m.get(SLOT) || []);
/** Is the canonical text one of the game's lines (its numbers and name placeholders filled), or at most MAX_JOIN of its
 *  phrases or sentences joined with spaces and plain punctuation? Never single words, letters or emoji glued in. */
export function matches(a, c) {
  if (!c) return false;
  if (a.exact.has(c)) return true;
  const n = c.length;
  for (const p of candidates(a.lines, c, 0)) if (ends(a, p, c, 0, 1).some(([e]) => e === n)) return true;
  // Joined: states [position, pieces used, names left]; each piece starts a word and is followed by a short plain gap.
  let states = [[0, 1]], seen = new Set();
  for (let k = 1; k <= MAX_JOIN && states.length; k++) {
    const next = [];
    for (const [i, w] of states) {
      for (const p of candidates(a.pieces, c, i)) {
        for (const [e, w2] of ends(a, p, c, i, w)) {
          if (e === n) { if (k >= 2) return true; continue; }
          let g = e; while (g < n && GAP.test(c[g])) g++;
          if (g - e > MAX_GAP || g === n) continue;
          if (g === e && isWordCh(c[e - 1]) && isWordCh(c[e])) continue;   // never glued inside a word
          const key = `${g}:${w2}`; if (seen.has(key)) continue; seen.add(key); next.push([g, w2]);
        }
      }
    }
    states = next;
  }
  return false;
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
