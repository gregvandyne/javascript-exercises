// Question sets an official game keeps for a teacher (Algebra Builder's and The Big Divide's; docs/sdk.md "Question sets",
// docs/decisions.md "Algebra Builder", "Box by Box", "The Big Divide"). A teacher makes a set in the game and saves it; the game's link
// carries only the set's short code (?chapter=s-<10 letters and digits>&lock=1), so the link, its QR code and a lesson
// step stay short, and the teacher can change the set later under the same link. The frame hands the set to the game
// (BRB.questionSet) when a link opens it. Each game has its own cleaner (SET_GAMES): a set is only numbers, short math
// problems in a fixed alphabet and a few fixed settings: no free text, no names, nothing about who plays. Sets go with
// their owner's account.
import crypto from 'node:crypto';
import { q, now } from '../db.js';
import { cleanText } from './textfilter.js';

export const MAX_ITEMS = 20;
/** How many sets one account may keep in one game. */
export const MAX_PER_OWNER = 200;
/** A set's code, as it rides in the lesson parameter chapter. */
export const SET_ID = /^s-[a-z0-9]{10}$/;
const ACTIVITIES = ['solve', 'multiply', 'factor'];
/** A problem as typed: digits, x, + − = ^ ( ) and spaces (the minus sign as - or −), at most 40 characters. */
const PROBLEM = /^[0-9x+\-−=^() ]{1,40}$/;

/** Algebra Builder: the clean list of questions, or null when it isn't one: [{ a: activity, p: problem, s: 'all'|'none',
 *  l: bool }], 1 to 20. */
export function cleanItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_ITEMS) return null;
  const out = [];
  for (const it of raw) {
    if (!it || typeof it !== 'object') return null;
    const a = String(it.a || ''), p = typeof it.p === 'string' ? it.p.trim().toLowerCase() : '';
    if (!ACTIVITIES.includes(a) || !PROBLEM.test(p) || !/[0-9x]/.test(p)) return null;
    out.push({ a, p, s: it.s === 'none' ? 'none' : 'all', l: it.l !== false });
  }
  return out;
}

// ------------------------------------------------------------ The Big Divide: one activity per set
// [{ k: 'divide'|'multiply'|'add'|'subtract', p: [[a, b], ...] (1-100 problems the game can work), l: level, c?: 7 flags (level custom),
//    d?: 1 (a fresh set for each student, made from g), g?: the plan it is made from (only with d),
//    m?: the method, one of the kind's own (BB_METHODS); left out, or 'standard', is the standard algorithm, so sets
//    saved before methods read as they always did,
//    r?: how long division writes its remainders, 'fraction' or 'decimal' (BB_FORMS); left out, R (g.remainders stays
//    on or off, as before),
//    dec?: 1 (Numbers: decimals): problems may have decimals, at most 2 places (bbDecCheck); without it, whole numbers
//    only, as always }]
// Every field is a number, a fixed flag or one of a few words: never free text. A set saved before a field came along
// is cleaned to exactly what it was.
const BB_LEVELS = ['watch', 'countUp', 'guided', 'prompted', 'onMyOwn', 'custom'];
export const BB_METHODS = { divide: ['standard', 'ladder', 'area'], multiply: ['standard', 'area', 'partial'], add: ['standard'], subtract: ['standard'] };
const BB_KINDS = Object.keys(BB_METHODS);
export const BB_FORMS = ['fraction', 'decimal'];
/** The methods a decimals activity (dec: 1) may use (the game's DECIMAL_METHODS): the standard one, and the area model
 *  for multiplication and for a decimal divided by a whole number. */
export const BB_DEC_METHODS = { divide: ['standard', 'area'], multiply: ['standard', 'area'], add: ['standard'], subtract: ['standard'] };
const int = v => (Number.isInteger(v) ? v : NaN);
const digits = n => String(n).length;
/** The Big Divide's problem rules (the game's own): null when [a, b] is a problem it works, else why not. */
export function bbCheck(kind, a, b) {
  if (kind === 'divide') {
    if (!Number.isInteger(b) || b < 2 || b > 9999) return 'divisor';
    if (!Number.isInteger(a) || a < 10 || a > 999999) return 'dividend';
    return a < b ? 'smaller' : null;
  }
  if (kind === 'add' || kind === 'subtract') {
    if (!Number.isInteger(a) || a < 10 || a > 9999) return 'top';
    if (!Number.isInteger(b) || b < 10 || b > 9999) return 'bottom';
    return kind === 'subtract' && !(a > b) ? 'order' : null;
  }
  if (!Number.isInteger(a) || a < 10 || a > 9999) return 'top';
  if (!Number.isInteger(b) || b < 2 || b > 999) return 'bottom';
  return digits(b) > digits(a) ? 'order' : null;
}
/** The decimal places a number is written with (99: none it could be written plainly with). */
const placesOf = x => {
  const s = String(x);
  if (!Number.isFinite(x) || /e/i.test(s)) return 99;
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
};
/** x × 10^k as a whole number, from its digits (no floating point): (12.6, 1) -> 126. */
const scaledInt = (x, k) => { const [i, f = ''] = String(x).split('.'); return Number(i + f.padEnd(k, '0').slice(0, k)); };
/** The Big Divide's rules for a problem with a decimal in it (the game's own, logic.ts check*): null when it works. */
export function bbDecCheck(kind, a, b) {
  if (kind === 'add' || kind === 'subtract') {
    // a whole number keeps its rule (10 to 9,999); a decimal is more than 0 and under 10,000
    const ok = x => (Number.isInteger(x) ? x >= 10 && x <= 9999 : x > 0 && x < 10000 && placesOf(x) <= 2);
    if (!ok(a)) return 'top';
    if (!ok(b)) return 'bottom';
    return kind === 'subtract' && !(a > b) ? 'order' : null;
  }
  if (!(a > 0) || !(b > 0) || placesOf(a) > 2 || placesOf(b) > 2) return 'decimal';
  if (kind === 'divide') {
    const s = placesOf(b), B = scaledInt(b, s);
    if (B < 2 || B > 9999) return 'divisor';
    const [i, f = ''] = String(a).split('.');
    const digits = (i + f.slice(0, s).padEnd(s, '0') + f.slice(s)).replace(/^0+/, '');
    return digits.length > 6 || a > 99999 ? 'dividend' : null;
  }
  if (kind === 'multiply') {
    const T = scaledInt(a, placesOf(a)), B = scaledInt(b, placesOf(b));
    if (T < 2 || T > 9999) return 'top';
    if (B < 2 || B > 999) return 'bottom';
    return digits(B) > digits(T) ? 'order' : null;
  }
  return 'kind';
}
/** The area model's rule for a decimals division problem (the game's checkProblem): a whole divisor, and it comes out by
 *  hundredths (7.5 ÷ 3 = 2.5), so there is no remainder to write. null when it works. */
export function bbAreaDecCheck(a, b) {
  if (!Number.isInteger(b)) return 'divisor';
  return scaledInt(a, 2) % b === 0 ? null : 'exact';
}
const range = (v, lo, hi) => (Array.isArray(v) && v.length === 2 && v.every(x => Number.isInteger(x) && x >= lo && x <= hi) ? [Math.min(...v), Math.max(...v)] : null);
function bbPlan(kind, g) {
  if (!g || typeof g !== 'object') return null;
  const count = int(g.count);
  if (!(count >= 1 && count <= 100)) return null;
  if (kind === 'divide') {
    const dividends = range(g.dividends, 10, 999999), divisors = range(g.divisors, 2, 9999);
    return dividends && divisors ? { count, dividends, divisors, remainders: g.remainders !== false } : null;
  }
  const tops = range(g.tops, 10, 9999), bottoms = range(g.bottoms, kind === 'multiply' ? 2 : 10, kind === 'multiply' ? 999 : 9999);
  return tops && bottoms ? { count, tops, bottoms } : null;
}
export function cleanBoxItems(raw) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') return null;
  const it = raw[0];
  const k = BB_KINDS.includes(it.k) ? it.k : null;
  if (!k || !BB_LEVELS.includes(it.l) || !Array.isArray(it.p) || it.p.length > 100) return null;
  const dec = it.dec === 1;
  if (it.dec !== undefined && it.dec !== null && !dec) return null;
  const p = [];
  for (const x of it.p) {
    if (!Array.isArray(x) || x.length !== 2) return null;
    const [a, b] = x.map(Number);
    if (dec && !(Number.isInteger(a) && Number.isInteger(b)) ? bbDecCheck(k, a, b) : bbCheck(k, a, b)) return null;
    p.push([a, b]);
  }
  const d = it.d === 1;
  if (!p.length && !d) return null;
  const out = { k, p, l: it.l };
  if (it.l === 'custom') { if (typeof it.c !== 'string' || !/^[01]{7}$/.test(it.c)) return null; out.c = it.c; }
  if (d) { const g = bbPlan(k, it.g); if (!g) return null; out.d = 1; out.g = g; }
  if (it.m !== undefined && it.m !== null) {
    if (typeof it.m !== 'string' || !(dec ? BB_DEC_METHODS : BB_METHODS)[k].includes(it.m)) return null;
    if (dec && k === 'divide' && it.m === 'area' && p.some(([a, b]) => bbAreaDecCheck(a, b))) return null;
    if (it.m !== 'standard') out.m = it.m;
  }
  if (it.r !== undefined && it.r !== null) {
    if (k !== 'divide' || !BB_FORMS.includes(it.r)) return null;
    out.r = it.r;
  }
  if (dec) out.dec = 1;
  return [out];
}

// ---------------------------------------------------------------- Crossword: one puzzle per set
// [{ t: title ('' allowed), w: [[word, clue], ...] (3-30), r: the layout's seed, b: word bank shown, h: hints allowed }].
// Unlike the math games, a crossword is the teacher's own words, so it holds free text: every word, clue and the title
// go through the site's text filter (no rude words, no personal details, no links) as live quiz sets do
// (docs/decisions.md "Crossword"). The grid is worked out in the game from the words and r, so it is never stored.
export const CROSS = { min: 3, max: 30, word: 24, clue: 150, title: 60 };
/** A crossword answer as typed: letters (any script), with spaces, hyphens and apostrophes the grid leaves out. */
const CROSS_WORD = /^[\p{L}\p{M}][\p{L}\p{M} '’-]*$/u;
/** The letters a word puts in the grid (what the game compares against). */
export const crossLetters = w => String(w).normalize('NFC').replace(/[ '’-]/g, '').toLocaleUpperCase();
export function cleanCrossItems(raw) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') return null;
  const it = raw[0];
  if (!Array.isArray(it.w) || it.w.length < CROSS.min || it.w.length > CROSS.max) return null;
  const words = [], seen = new Set();
  for (const pair of it.w) {
    if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || typeof pair[1] !== 'string') return null;
    const w = pair[0].normalize('NFC').replace(/\s+/g, ' ').trim(), c = pair[1].replace(/\s+/g, ' ').trim();
    if (!w || w.length > CROSS.word || !CROSS_WORD.test(w) || [...crossLetters(w)].length < 2) return null;
    if (!c || c.length > CROSS.clue) return null;
    const key = crossLetters(w);
    if (seen.has(key)) return null;
    seen.add(key);
    const cw = cleanText(w, CROSS.word), cc = cleanText(c, CROSS.clue);
    if (!cw.ok || !cc.ok) return null;
    words.push([cw.value, cc.value]);
  }
  let t = '';
  if (it.t !== undefined && it.t !== '') {
    if (typeof it.t !== 'string' || it.t.length > CROSS.title) return null;
    const ct = cleanText(it.t.replace(/\s+/g, ' '), CROSS.title);
    if (!ct.ok) return null;
    t = ct.value;
  }
  const r = Number.isInteger(it.r) && it.r >= 1 && it.r <= 999999 ? it.r : 1;
  return [{ t, w: words, r, b: it.b === true, h: it.h !== false }];
}

/** Official games that may keep question sets (slug -> the cleaner of their sets). */
export const SET_GAMES = new Map([['algebra-builder', cleanItems], ['box-by-box', cleanBoxItems], ['crossword', cleanCrossItems]]);

// New codes leave out letters and digits that read alike (i l 1, o 0), since a student may type one as a class code.
// (Codes made before keep working: SET_ID still takes any letter or digit.)
const CODE_LETTERS = 'abcdefghjkmnpqrstuvwxyz23456789';
const newId = () => {
  const b = crypto.randomBytes(10);
  return 's-' + [...b].map(x => CODE_LETTERS[x % CODE_LETTERS.length]).join('');
};
/** A class code as a student types it ("C5EXP 1CM9H", any case, spaces or dashes) -> the set id, or null. */
export function codeToId(typed) {
  const t = String(typed || '').toLowerCase().replace(/^s-/, '').replace(/[^a-z0-9]/g, '');
  return /^[a-z0-9]{10}$/.test(t) ? `s-${t}` : null;
}

/** A set of this game: { id, items, ownerId } or null. */
export function get(gameId, id) {
  if (!SET_ID.test(String(id || ''))) return null;
  const r = q.get('SELECT id, owner_id, items FROM game_sets WHERE id=? AND game_id=?', id, gameId);
  if (!r) return null;
  try { return { id: r.id, ownerId: r.owner_id, items: JSON.parse(r.items) }; } catch { return null; }
}

/** Save a set: a new one, or (id given) the owner's own one changed. slug: the game's (its cleaner; Algebra Builder's by
 *  default). -> { id } | { error: 'bad'|'notYours'|'full' } */
export function save(gameId, ownerId, rawItems, id = null, slug = 'algebra-builder') {
  const clean = SET_GAMES.get(slug);
  const items = clean ? clean(rawItems) : null;
  if (!items) return { error: 'bad' };
  const t = now();
  if (id) {
    const was = get(gameId, id);
    if (!was || was.ownerId !== ownerId) return { error: 'notYours' };
    q.run('UPDATE game_sets SET items=?, updated_at=? WHERE id=?', JSON.stringify(items), t, id);
    return { id };
  }
  if (q.get('SELECT COUNT(*) n FROM game_sets WHERE game_id=? AND owner_id=?', gameId, ownerId).n >= MAX_PER_OWNER) return { error: 'full' };
  let nid = newId();
  while (q.get('SELECT 1 FROM game_sets WHERE id=?', nid)) nid = newId();
  q.run('INSERT INTO game_sets(id, game_id, owner_id, items, created_at, updated_at) VALUES (?,?,?,?,?,?)', nid, gameId, ownerId, JSON.stringify(items), t, t);
  return { id: nid };
}

/** An account's sets go with it. */
export function forgetUser(userId) { q.run('DELETE FROM game_sets WHERE owner_id=?', userId); }

const ACT_NAME = { solve: 'Solve', multiply: 'Multiply', factor: 'Factor' };
const FROM = { p: '+', q: '=', e: '^', o: '(', c: ')' };
/** A problem as it reads: 2xp3q7 -> "2x + 3 = 7", x^2 -> x². */
export function readable(code) {
  const t = [...String(code)].map(ch => FROM[ch] || ch).join('');
  return t.replace(/\^2/g, '²').replace(/\^3/g, '³').replace(/([+=])/g, ' $1 ').replace(/(\w|\))-/g, '$1 − ').replace(/^-/, '−').replace(/\s+/g, ' ').trim();
}
const BB_KIND = { divide: 'Long division', multiply: 'Multiplication', add: 'Addition', subtract: 'Subtraction' };
const BB_METHOD = { ladder: 'Ladder', area: 'Area model', partial: 'Partial products' };
const BB_FORM = { fraction: 'remainders as fractions', decimal: 'answers as decimals' };
const BB_LEVEL = { watch: 'Watch', countUp: 'Count up', guided: 'Guided', prompted: 'Prompted', onMyOwn: 'On my own', custom: 'your own mix' };
/** What a set game's lesson options open, for the assign page and the lesson's title: a set (its size), one problem, an
 *  activity (The Big Divide: its label), or null when they open none (the teacher's gallery). params: parseParams() of them. */
export function describe(gameId, params, slug = 'algebra-builder') {
  const ch = params && params.chapter;
  if (!ch) return null;
  if (SET_ID.test(ch)) {
    const s = get(gameId, ch);
    if (!s) return null;
    if (slug === 'crossword') {
      const a = s.items[0], n = a.w.length;
      return { kind: 'one', label: `${a.t ? `${a.t}: ` : ''}crossword, ${n} words` };
    }
    if (slug === 'box-by-box') {
      const a = s.items[0], n = a.d ? (a.p.length || (a.k === 'divide' ? 16 : 12)) : a.p.length;
      return { kind: 'one', label: `${BB_KIND[a.k]}, ${n} problem${n === 1 ? '' : 's'}${a.d ? ' (different for each student)' : ''}, ${a.dec ? 'decimals, ' : ''}${BB_FORM[a.r] ? `${BB_FORM[a.r]}, ` : ''}${BB_METHOD[a.m] ? `${BB_METHOD[a.m]}, ` : ''}${BB_LEVEL[a.l]}` };
    }
    return { kind: 'set', n: s.items.length };
  }
  if (slug !== 'algebra-builder') return null;
  if (ACT_NAME[params.mode]) return { kind: 'one', label: `${ACT_NAME[params.mode]} ${readable(ch)}` };
  return null;
}
