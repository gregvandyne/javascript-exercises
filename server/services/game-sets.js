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
import { canvasVersion, canvasKit, figureProblems } from './canvaskit.js';
import { proofCore } from './proof-core.js';
import { useSetCodes } from '../standards/official-tags.js';
import { codes as atlasCodes, NO_CAP_Q as ATLAS_NO_CAP } from '../live/atlas.js';

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
/** The methods a decimals activity (dec: 1) may use (the game's DECIMAL_METHODS): the standard one, the area model for
 *  multiplication, and the ladder and the area model for a decimal divided by a whole number. */
export const BB_DEC_METHODS = { divide: ['standard', 'ladder', 'area'], multiply: ['standard', 'area'], add: ['standard'], subtract: ['standard'] };
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
/** The ladder's and the area model's rule for a decimals division problem (the game's checkProblem): a whole divisor,
 *  and it comes out by hundredths (7.5 ÷ 3 = 2.5), so there is no remainder to write. null when it works. */
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
    if (dec && k === 'divide' && it.m !== 'standard' && p.some(([a, b]) => bbAreaDecCheck(a, b))) return null;
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

// ---------------------------------------------------------------- Typing Pets: a teacher's own typing lesson or test
// [{ t: title ('' allowed), x: the text to type, k: 'lesson' | 'test', n: a test's minutes (1, 2, 3 or 5), l?: its keyboard
// (a layout id; none = US) }]. The text is
// the teacher's own words, so it passes the site's text filter (refused, never changed). Only letters (any script),
// digits, space, newline and . , ; : ' " - ! ? ( ) ¿ ¡ ، ؟; the game checks it against the chosen keyboard. Curly quotes and dashes from a word
// processor are turned into the plain ones first; runs of spaces become one.
export const TYPING = { min: 10, max: 1500, title: 60, lines: 40, minutes: [1, 2, 3, 5] };
// Letters of any script (Typing Pets has keyboards for 11 languages; the game checks the text against the teacher's
// chosen keyboard), digits, and the punctuation the keyboards share (plus ¿ ¡ and Arabic ، ؟).
const TYPABLE = /^[\p{L}\p{M}\p{N} .,;:'"!?()\-\n¿¡،؟]+$/u;
/** The keyboards a teacher's lesson may be for (seed-games/typing-pets-langs/layouts.json). */
export const TYPING_LAYOUTS = ['us', 'de', 'fr', 'es', 'it', 'pt', 'ru', 'he', 'ar'];
export function cleanTypingItems(raw) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') return null;
  const it = raw[0];
  if (typeof it.x !== 'string') return null;
  const x = it.x.replace(/\r\n?/g, '\n').replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...')
    .replace(/[ \t\u00a0]+/g, ' ').split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  if (x.length < TYPING.min || x.length > TYPING.max || x.split('\n').length > TYPING.lines || !TYPABLE.test(x)) return null;
  const cx = cleanText(x, TYPING.max);
  if (!cx.ok) return null;
  let t = '';
  if (it.t !== undefined && it.t !== '') {
    if (typeof it.t !== 'string' || it.t.length > TYPING.title) return null;
    const ct = cleanText(it.t.replace(/\s+/g, ' '), TYPING.title);
    if (!ct.ok) return null;
    t = ct.value;
  }
  const k = it.k === 'test' ? 'test' : 'lesson';
  const l = TYPING_LAYOUTS.includes(it.l) && it.l !== 'us' ? it.l : null;
  return [{ t, x: cx.value, k, ...(k === 'test' ? { n: TYPING.minutes.includes(it.n) ? it.n : 1 } : {}), ...(l ? { l } : {}) }];
}

// ---------------------------------------------------------------- Word Hunt: one word search per set
// [{ t: title ('' allowed), w: [word, ...] (3-25), s: grid size (0: the smallest that holds the words, or 8, 10, 12,
//    15), d: directions ('easy' across and down, 'medium' and diagonal, 'hard' every way), r: the layout's seed,
//    b: the word list shown to students }]. As Crossword's, a teacher's own words: every word and the title go
// through the site's text filter (docs/decisions.md "Word Hunt in Crossword's look, with your own words"). The grid
// is made in the game (and by the printer) from the words and options, so it is never stored.
export const HUNT = { min: 3, max: 25, typed: 24, letters: 15, title: 60, sizes: [0, 8, 10, 12, 15], dirs: ['easy', 'medium', 'hard'] };
export function cleanHuntItems(raw) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object') return null;
  const it = raw[0];
  if (!Array.isArray(it.w) || it.w.length < HUNT.min || it.w.length > HUNT.max) return null;
  const words = [], seen = new Set();
  for (const x of it.w) {
    if (typeof x !== 'string') return null;
    const w = x.normalize('NFC').replace(/\s+/g, ' ').trim(), n = [...crossLetters(w)].length;
    if (!w || w.length > HUNT.typed || !CROSS_WORD.test(w) || n < 2 || n > HUNT.letters) return null;
    const key = crossLetters(w);
    if (seen.has(key)) return null;
    seen.add(key);
    const cw = cleanText(w, HUNT.typed);
    if (!cw.ok) return null;
    words.push(cw.value);
  }
  let t = '';
  if (it.t !== undefined && it.t !== '') {
    if (typeof it.t !== 'string' || it.t.length > HUNT.title) return null;
    const ct = cleanText(it.t.replace(/\s+/g, ' '), HUNT.title);
    if (!ct.ok) return null;
    t = ct.value;
  }
  const s = it.s === undefined ? 0 : it.s;
  if (!HUNT.sizes.includes(s)) return null;
  if (s && words.some(w => [...crossLetters(w)].length > s)) return null;
  const d = it.d === undefined ? 'medium' : it.d;
  if (!HUNT.dirs.includes(d)) return null;
  const r = Number.isInteger(it.r) && it.r >= 1 && it.r <= 999999 ? it.r : 1;
  return [{ t, w: words, s, d, r, b: it.b !== false }];
}

// ---------------------------------------------------------------- Mistake Hunt: a set of passages to proofread
// [{ t: the passage's title ('' allowed), x: the teacher's correct text, g: grade 0 (K) to 8,
//    m: [{ a, b: a token range of x (end exclusive), w: what students see there, k: the mistake type, p?: 1 pinned,
//          y?: a why line of the teacher's own (Phase 2: drafted for the teacher to check; the game's fixed line otherwise) }],
//    o?: (the first passage only) { h: hints, s: Show answers, n: what students are told: 'total' | 'type' | 'none' } }], 1 to 8.
// The passages are the teacher's own text, so the title, the text, every wrong word and a why line pass the site's
// text filter (no rude words, personal details or links) as Crossword's words do; a text the filter would change is
// refused, never changed, since the mistakes point into it. The mistakes are checked by the game's own rules
// (services/proof-core.js: the range is inside one paragraph, at most 4 words, a known type, the wrong text differs from
// the right one, no two overlap), so an answer key made from a set is always right. docs/decisions.md "Mistake Hunt".
export const PROOF = { passages: 8, minText: 40, maxText: 1500, title: 60, why: 140, bytes: 20000 };
export const PROOF_TELL = ['total', 'type', 'none'];
const PROOF_KEYS = ['t', 'x', 'g', 'm', 'o'], PROOF_M_KEYS = ['a', 'b', 'w', 'k', 'p', 'y', 'ai'];
const plainObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
/** A passage set's options -> { h, s, n } or null. */
function cleanProofOptions(o) {
  if (!plainObject(o) || Object.keys(o).some(k => !['h', 's', 'n'].includes(k))) return null;
  if ((o.h !== undefined && typeof o.h !== 'boolean') || (o.s !== undefined && typeof o.s !== 'boolean')) return null;
  if (o.n !== undefined && !PROOF_TELL.includes(o.n)) return null;
  return { h: o.h !== false, s: o.s !== false, n: o.n || 'total' };
}
/** Mistake Hunt: the clean list of passages, or null when it isn't one. Strict: an unknown key, a text the filter
 *  refuses or would change, or a mistake the game's rules don't keep, and the whole set is turned down. */
export function cleanProofItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > PROOF.passages) return null;
  let size; try { size = JSON.stringify(raw).length; } catch { return null; }
  if (size > PROOF.bytes) return null;
  const P = proofCore(), out = [];
  for (const [i, it] of raw.entries()) {
    if (!plainObject(it) || Object.keys(it).some(k => !PROOF_KEYS.includes(k))) return null;
    let t = '';
    if (it.t !== undefined && it.t !== '') {
      if (typeof it.t !== 'string' || it.t.length > PROOF.title) return null;
      const ct = cleanText(it.t.replace(/\s+/g, ' '), PROOF.title);
      if (!ct.ok) return null;
      t = ct.value;
    }
    if (typeof it.x !== 'string' || it.x.length > PROOF.maxText || P.normText(it.x) !== it.x || it.x.length < PROOF.minText) return null;
    const cx = cleanText(it.x, PROOF.maxText);
    if (!cx.ok || cx.value !== it.x) return null;
    if (!Number.isInteger(it.g) || it.g < 0 || it.g > 8) return null;
    if (!Array.isArray(it.m) || !it.m.every(m => plainObject(m) && Object.keys(m).every(k => PROOF_M_KEYS.includes(k)))) return null;
    if (P.problem(it.x, it.m)) return null;
    const m = [];
    for (const mm of it.m) {
      const cw = cleanText(mm.w, P.LIMITS.wrong);
      if (!cw.ok || cw.value !== mm.w) return null;
      if (mm.p !== undefined && mm.p !== 1) return null;
      const c = { a: mm.a, b: mm.b, w: mm.w, k: mm.k };
      if (mm.p === 1) c.p = 1;
      // ai: 1 when the why line was drafted by AI (and reviewed by the teacher before saving: Mistake Hunt, Phase 2).
      if (mm.ai !== undefined && mm.ai !== 1) return null;
      if (mm.y !== undefined && mm.y !== '') {
        if (typeof mm.y !== 'string' || mm.y.length > PROOF.why) return null;
        const cy = cleanText(mm.y.replace(/\s+/g, ' '), PROOF.why);
        if (!cy.ok) return null;
        c.y = cy.value;
        if (mm.ai === 1) c.ai = 1;
      }
      m.push(c);
    }
    m.sort((p, q) => p.a - q.a);
    const item = { t, x: it.x, g: it.g, m };
    if (it.o !== undefined) {
      if (i !== 0) return null;
      const o = cleanProofOptions(it.o);
      if (!o) return null;
      item.o = o;
    }
    out.push(item);
  }
  return out;
}
/** The Common Core codes a passage set practises (its mistakes' types), for the class Standards tab. */
export function proofCodes(items) {
  const P = proofCore(), out = new Set();
  for (const it of Array.isArray(items) ? items : []) for (const m of (it && Array.isArray(it.m) ? it.m : [])) if (P.BY[m.k]) out.add(P.BY[m.k].cc);
  return [...out].sort();
}
// A lesson step that opens a passage set practises its mistakes' codes (the class Standards tab, standards-ccss.js).
useSetCodes('mistake-hunt', 'ccss-ela', id => {
  const r = q.get("SELECT items FROM game_sets WHERE id=?", id);
  try { return r ? proofCodes(JSON.parse(r.items)) : []; } catch { return []; }
});

// ---------------------------------------------------------------- Oomba Canvas: a classroom activity's worksheet
// A Builder-made classroom activity (Oomba Canvas 1.4.0 or later, whatever it is for; routes/games.js canvasSetVersion)
// keeps a teacher's worksheets: the questions that were on screen, under a class code, so a link opens
// exactly those questions for every student and prints them. [problem, ...], 1 to 20 (the play page's limit for a set), each a problem of the kit's own
// tools as the activity's OWN pinned kit file cleans it (cleanProblem: its allow-list of fields, so nothing the kit does
// not read is kept), every piece of text in it (a figure question, its choices and worked lines, a unit, a sort's group
// names) through the site's text filter as Crossword's words are, and the whole set must pass the kit's self-test for
// that activity (every problem solvable by its worked answer, never right when empty, its figures drawable by the
// pinned Oomba Figures). Problems only: nothing about who played, nothing a student typed.
// ---------------------------------------------------------------- Atlas Quest: a teacher's geography quiz
// [{ t: title ('' allowed), r: the printed map's frame (world, a continent, the Caribbean or the Middle East),
//    q: [[kind, code]] for the country questions (label it on a map, name its capital, capital to country, flag to
//       country, which continent, famous for) or ['own', question, answer, code ('' or a country)] for the teacher's own,
//    a: [[code, lng*10, lat*10]] the arrows from small countries to their answer lines on the printed map,
//    h: hints allowed }]. One item, 1 to 60 questions (docs/decisions.md "Atlas Quest in Crossword's look").
// Countries are ISO codes checked against the game's own list (window.AtlasData; services/../live/atlas.js codes),
// never a name; the teacher's own words (the title, a question and its answer) pass the site's text filter as
// Crossword's words do. Capital questions are never about the countries whose capital the game leaves out (NO_CAP_Q).
export const ATLAS = { max: 60, q: 150, a: 60, title: 60, frames: ['world', 'af', 'as', 'eu', 'na', 'sa', 'oc', 'car', 'me'], kinds: ['map', 'cap', 'capc', 'flag', 'cont', 'fam'] };
let atlasKnown = null;
const atlasCode = cc => { if (!atlasKnown) atlasKnown = new Set(atlasCodes()); return typeof cc === 'string' && atlasKnown.has(cc); };
/** The quiz's clean item, or null when it isn't one. opts.empty: a print of a map with no numbers may have no questions;
 *  opts.maxQ: more questions than a quiz holds (a printed blank map numbers a whole region). */
export function cleanAtlasItems(raw, opts = {}) {
  if (!Array.isArray(raw) || raw.length !== 1 || !raw[0] || typeof raw[0] !== 'object' || Array.isArray(raw[0])) return null;
  const it = raw[0];
  if (!Array.isArray(it.q) || it.q.length > (opts.maxQ || ATLAS.max) || (!it.q.length && !opts.empty)) return null;
  const r = it.r === undefined ? 'world' : it.r;
  if (!ATLAS.frames.includes(r)) return null;
  const q = [], seen = new Set();
  for (const x of it.q) {
    if (!Array.isArray(x)) return null;
    if (x[0] === 'own') {
      if (x.length < 3 || x.length > 4 || typeof x[1] !== 'string' || typeof x[2] !== 'string') return null;
      const qq = x[1].replace(/\s+/g, ' ').trim(), aa = x[2].replace(/\s+/g, ' ').trim(), cc = x[3] === undefined ? '' : x[3];
      if (!qq || !aa || qq.length > ATLAS.q || aa.length > ATLAS.a || (cc !== '' && !atlasCode(cc))) return null;
      const cq = cleanText(qq, ATLAS.q), ca = cleanText(aa, ATLAS.a);
      if (!cq.ok || !ca.ok) return null;
      q.push(['own', cq.value, ca.value, cc]);
      continue;
    }
    if (x.length !== 2 || !ATLAS.kinds.includes(x[0]) || !atlasCode(x[1])) return null;
    if ((x[0] === 'cap' || x[0] === 'capc') && ATLAS_NO_CAP.has(x[1])) return null;
    const k = `${x[0]}:${x[1]}`;
    if (seen.has(k)) return null;
    seen.add(k); q.push([x[0], x[1]]);
  }
  const onMap = new Set(q.filter(x => x[0] === 'map').map(x => x[1])), a = [], arrowed = new Set();
  if (it.a !== undefined) {
    if (!Array.isArray(it.a) || it.a.length > ATLAS.max) return null;
    for (const x of it.a) {
      if (!Array.isArray(x) || x.length !== 3 || !onMap.has(x[0]) || arrowed.has(x[0])) return null;
      const [, lng, lat] = x;
      if (!Number.isInteger(lng) || !Number.isInteger(lat) || lng < -1800 || lng > 3600 || lat < -900 || lat > 900) return null;
      arrowed.add(x[0]); a.push([x[0], lng, lat]);
    }
  }
  let t = '';
  if (it.t !== undefined && it.t !== '') {
    if (typeof it.t !== 'string' || it.t.length > ATLAS.title) return null;
    const ct = cleanText(it.t.replace(/\s+/g, ' '), ATLAS.title);
    if (!ct.ok) return null;
    t = ct.value;
  }
  return [{ t, r, q, a, h: it.h !== false }];
}

export const CANVAS_SET = { min: 1, max: 20, chars: 20000, text: 300, kit: '1.4.0' };
export const CANVAS_KIND = 'canvas';
const verGe = (v, w) => { const a = String(v).split('.').map(Number), b = w.split('.').map(Number); return (a[0] - b[0] || a[1] - b[1] || a[2] - b[2]) >= 0; };
/** Is this version an activity on a kit that has worksheets (1.4.0 or later)? */
export const canvasSetKit = html => { const v = canvasVersion(html); return v && verGe(v, CANVAS_SET.kit) ? v : null; };
/** Every string in a problem through the text filter (the tool's name left as it is) -> the problem, or null. */
function filterText(x, key) {
  if (typeof x === 'string') {
    if (key === 'tool') return x;
    if (x.length > CANVAS_SET.text) return null;
    const c = cleanText(x, CANVAS_SET.text);
    return c.ok ? c.value : null;
  }
  if (Array.isArray(x)) { const out = []; for (const y of x) { const v = filterText(y, ''); if (v === null) return null; out.push(v); } return out; }
  if (x && typeof x === 'object') { const out = {}; for (const [k, y] of Object.entries(x)) { const v = filterText(y, k); if (v === null) return null; out[k] = v; } return out; }
  return x;
}
/** A classroom activity's worksheet, for this activity's page (html: its published version) -> the clean problems, or
 *  null when it isn't one. */
export function cleanCanvasItems(raw, html) {
  const v = canvasSetKit(html);
  if (!v || !Array.isArray(raw) || raw.length < CANVAS_SET.min || raw.length > CANVAS_SET.max) return null;
  let size; try { size = JSON.stringify(raw).length; } catch { return null; }
  if (size > CANVAS_SET.chars) return null;
  const kit = canvasKit(v), out = [];
  for (const it of raw) {
    const c = kit.logic.cleanProblem(it); if (!c.p) return null;
    const f = filterText(c.p, '');
    const again = f && kit.logic.cleanProblem(f);
    if (!again || !again.p) return null;
    out.push(again.p);
  }
  const act = { problems: out };
  if (!kit.selfTest(act).ok || figureProblems(v, act, html).length) return null;
  return JSON.parse(JSON.stringify(out));
}

/** Set games that are also whole games without a set (Word Hunt's own themes and daily puzzle): a teacher may still
 *  assign them as they are, from the class page or a folder, as before they kept sets. */
export const OPEN_SET_GAMES = new Set(['word-hunt', 'typing-pets']);
/** Official games that may keep question sets (slug -> the cleaner of their sets). */
export const SET_GAMES = new Map([['algebra-builder', cleanItems], ['box-by-box', cleanBoxItems], ['crossword', cleanCrossItems], ['mistake-hunt', cleanProofItems], ['word-hunt', cleanHuntItems], ['atlas-quest', cleanAtlasItems], ['typing-pets', cleanTypingItems]]);

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
  const r = q.get('SELECT id, owner_id, items, title FROM game_sets WHERE id=? AND game_id=?', id, gameId);
  if (!r) return null;
  try { return { id: r.id, ownerId: r.owner_id, items: JSON.parse(r.items), title: r.title || '' }; } catch { return null; }
}

/** The longest name a set may have (its title: what its owner calls it in their list). */
export const TITLE_MAX = 60;
/** A set's name as typed -> { ok: true, value } ('' is no name) or { ok: false } when the site's text filter refuses
 *  it (rude words, personal details, links). */
export function cleanTitle(raw) {
  if (raw === undefined || raw === null) return { ok: true, value: '' };
  if (typeof raw !== 'string' || raw.length > 400) return { ok: false };
  const c = cleanText(raw.replace(/\s+/g, ' '), TITLE_MAX);
  return c.ok ? { ok: true, value: c.value } : { ok: false };
}

/** Save a set: a new one, or (id given) the owner's own one changed. slug: the game's (its cleaner; Algebra Builder's by
 *  default). opts.title: the set's name (left out: kept as it is; one the text filter refuses is left out the same
 *  way, so the set still saves). Crossword's and Word Hunt's name is always its puzzle's title (items[0].t). A classroom activity's
 *  worksheet (slug CANVAS_KIND) is cleaned for its activity's page, opts.html.
 *  -> { id } | { error: 'bad'|'notYours'|'full' } */
export function save(gameId, ownerId, rawItems, id = null, slug = 'algebra-builder', opts = {}) {
  const clean = slug === CANVAS_KIND ? raw => cleanCanvasItems(raw, opts.html) : SET_GAMES.get(slug);
  const items = clean ? clean(rawItems) : null;
  if (!items) return { error: 'bad' };
  const t = now();
  const named = slug === 'crossword' || slug === 'word-hunt' || slug === 'atlas-quest' ? { ok: true, value: items[0].t } : opts.title === undefined ? null : cleanTitle(opts.title);
  const title = named && named.ok ? named.value : null;
  if (id) {
    const was = get(gameId, id);
    if (!was || was.ownerId !== ownerId) return { error: 'notYours' };
    if (title === null) q.run('UPDATE game_sets SET items=?, updated_at=? WHERE id=?', JSON.stringify(items), t, id);
    else q.run('UPDATE game_sets SET items=?, title=?, updated_at=? WHERE id=?', JSON.stringify(items), title, t, id);
    return { id };
  }
  return insert(gameId, ownerId, items, title || '', t);
}
function insert(gameId, ownerId, items, title, t = now()) {
  if (q.get('SELECT COUNT(*) n FROM game_sets WHERE game_id=? AND owner_id=?', gameId, ownerId).n >= MAX_PER_OWNER) return { error: 'full' };
  let nid = newId();
  while (q.get('SELECT 1 FROM game_sets WHERE id=?', nid)) nid = newId();
  q.run('INSERT INTO game_sets(id, game_id, owner_id, items, title, created_at, updated_at) VALUES (?,?,?,?,?,?,?)', nid, gameId, ownerId, JSON.stringify(items), title, t, t);
  return { id: nid };
}

// ---------------------------------------------------------------- the owner's own list ("My worksheets")
// A teacher's sets in one game, to open again, print, share, copy, rename and delete (docs/sdk.md "Question sets").
// Every call here is the owner's own: anyone else's set reads exactly as a set that isn't there.
/** A set's class code as a teacher shows it: "C5EXP 1CM9H". */
export const codeOf = id => { const c = String(id).replace(/^s-/, '').toUpperCase(); return `${c.slice(0, 5)} ${c.slice(5)}`; };
/** How many questions a set holds: Crossword's words, The Big Divide's problems (a fresh set per student: how many it
 *  makes), Algebra Builder's questions. */
export function sizeOf(slug, items) {
  const a = items[0] || {};
  if (slug === 'crossword' || slug === 'word-hunt') return Array.isArray(a.w) ? a.w.length : 0;
  if (slug === 'atlas-quest') return Array.isArray(a.q) ? a.q.length : 0;
  if (slug === 'typing-pets') return typeof a.x === 'string' ? a.x.length : 0;
  if (slug === 'box-by-box') return a.d ? (a.p.length || (a.k === 'divide' ? 16 : 12)) : a.p.length;
  if (slug === 'mistake-hunt') return items.reduce((n, it) => n + (Array.isArray(it.m) ? it.m.length : 0), 0);
  return items.length;   // Algebra Builder's questions, a classroom activity's problems
}
function view(r, slug) {
  let items; try { items = JSON.parse(r.items); } catch { return null; }
  if (!Array.isArray(items) || !items.length) return null;
  return { id: r.id, code: codeOf(r.id), title: r.title || '', label: labelOf(slug, items), n: sizeOf(slug, items), updated: r.updated_at, items };
}
/** The owner's sets in this game, newest first: [{ id, code, title, label, n, updated, items }]. */
export function listMine(gameId, ownerId, slug = 'algebra-builder') {
  return q.all('SELECT id, items, title, updated_at FROM game_sets WHERE game_id=? AND owner_id=? ORDER BY updated_at DESC, created_at DESC, id LIMIT ?', gameId, ownerId, MAX_PER_OWNER)
    .map(r => view(r, slug)).filter(Boolean);
}
/** One of the owner's sets as the list shows it, or null. */
export function oneMine(gameId, ownerId, id, slug = 'algebra-builder') {
  const r = q.get('SELECT id, items, title, updated_at FROM game_sets WHERE id=? AND game_id=? AND owner_id=?', String(id || ''), gameId, ownerId);
  return r ? view(r, slug) : null;
}
/** The owner's own set, or null (someone else's: null, as a set that isn't there). */
function own(gameId, ownerId, id) {
  const s = get(gameId, id);
  return s && s.ownerId === ownerId ? s : null;
}
/** Delete the owner's set: its link and class code stop working. -> true, or false when it isn't theirs. */
export function remove(gameId, ownerId, id) {
  if (!own(gameId, ownerId, id)) return false;
  q.run('DELETE FROM game_sets WHERE id=? AND owner_id=?', id, ownerId);
  // Oomba's chat on a Mistake Hunt set goes with the set (services/proof-chat.js).
  q.run('DELETE FROM proof_chats WHERE owner_id=? AND set_key=?', ownerId, id);
  return true;
}
/** Rename the owner's set ('' takes the name away). Crossword's and Word Hunt's name is its puzzle's title, so that changes too.
 *  -> { ok: true, title } | { error: 'notYours'|'title' } */
export function rename(gameId, ownerId, id, rawTitle, slug = 'algebra-builder') {
  const s = own(gameId, ownerId, id);
  if (!s) return { error: 'notYours' };
  const c = cleanTitle(rawTitle);
  if (!c.ok) return { error: 'title' };
  if (slug === 'crossword' || slug === 'word-hunt') {
    const items = (slug === 'crossword' ? cleanCrossItems : cleanHuntItems)([{ ...s.items[0], t: c.value }]);
    if (!items) return { error: 'title' };
    q.run('UPDATE game_sets SET items=?, title=?, updated_at=? WHERE id=?', JSON.stringify(items), c.value, now(), id);
  } else if (slug === 'atlas-quest') {   // Atlas Quest's name is its quiz's title too
    const items = cleanAtlasItems([{ ...s.items[0], t: c.value }]);
    if (!items) return { error: 'title' };
    q.run('UPDATE game_sets SET items=?, title=?, updated_at=? WHERE id=?', JSON.stringify(items), c.value, now(), id);
  } else q.run('UPDATE game_sets SET title=?, updated_at=? WHERE id=?', c.value, now(), id);
  return { ok: true, title: c.value };
}
/** A copy of the owner's set under a new code, named title (the caller's "Copy of ..."; cut to TITLE_MAX).
 *  -> { id } | { error: 'notYours'|'full' } */
export function duplicate(gameId, ownerId, id, title, slug = 'algebra-builder') {
  const s = own(gameId, ownerId, id);
  if (!s) return { error: 'notYours' };
  const c = cleanTitle(String(title || '').slice(0, TITLE_MAX));
  const name = c.ok ? c.value : '';
  let items = s.items;
  if (slug === 'crossword') items = cleanCrossItems([{ ...items[0], t: name }]) || items;
  if (slug === 'word-hunt') items = cleanHuntItems([{ ...items[0], t: name }]) || items;
  if (slug === 'atlas-quest') items = cleanAtlasItems([{ ...items[0], t: name }]) || items;
  return insert(gameId, ownerId, items, name);
}

/** An account's sets go with it. */
export function forgetUser(userId) { q.run('DELETE FROM game_sets WHERE owner_id=?', userId); q.run('DELETE FROM proof_chats WHERE owner_id=?', userId); q.run('DELETE FROM proof_ai_drafts WHERE user_id=?', userId); }

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
/** A set as it reads in a list or on the assign page (English): "Habitats: crossword, 12 words", "Long division, 12
 *  problems, Guided", "5 questions: Solve, Factor". */
export function labelOf(slug, items) {
  const a = items[0];
  if (slug === 'crossword') return `${a.t ? `${a.t}: ` : ''}crossword, ${a.w.length} words`;
  if (slug === 'word-hunt') return `${a.t ? `${a.t}: ` : ''}word hunt, ${a.w.length} words`;
  if (slug === 'atlas-quest') return `${a.t ? `${a.t}: ` : ''}geography quiz, ${a.q.length} question${a.q.length === 1 ? '' : 's'}`;
  if (slug === 'typing-pets') return `${a.t ? `${a.t}: ` : ''}${a.k === 'test' ? `typing test, ${a.n} minute${a.n === 1 ? '' : 's'}` : 'typing lesson'}, ${a.x.length} characters`;
  if (slug === 'box-by-box') {
    const n = sizeOf(slug, items);
    return `${BB_KIND[a.k]}, ${n} problem${n === 1 ? '' : 's'}${a.d ? ' (different for each student)' : ''}, ${a.dec ? 'decimals, ' : ''}${BB_FORM[a.r] ? `${BB_FORM[a.r]}, ` : ''}${BB_METHOD[a.m] ? `${BB_METHOD[a.m]}, ` : ''}${BB_LEVEL[a.l]}`;
  }
  if (slug === CANVAS_KIND) return `${items.length} question${items.length === 1 ? '' : 's'}`;
  if (slug === 'mistake-hunt') {
    const n = sizeOf(slug, items);
    return `${a.t ? `${a.t}: ` : ''}${items.length} passage${items.length === 1 ? '' : 's'}, ${n} mistake${n === 1 ? '' : 's'}`;
  }
  const kinds = [...new Set(items.map(i => ACT_NAME[i.a]).filter(Boolean))].join(', ');
  return `${items.length} question${items.length === 1 ? '' : 's'}${kinds ? `: ${kinds}` : ''}`;
}
/** What a set game's lesson options open, for the assign page and the lesson's title: a set (its size), one problem, an
 *  activity (The Big Divide: its label), or null when they open none (the teacher's gallery). params: parseParams() of them. */
export function describe(gameId, params, slug = 'algebra-builder') {
  const ch = params && params.chapter;
  if (!ch) return null;
  if (SET_ID.test(ch)) {
    const s = get(gameId, ch);
    if (!s) return null;
    if (slug === 'crossword' || slug === 'word-hunt' || slug === 'box-by-box' || slug === 'mistake-hunt' || slug === 'atlas-quest' || slug === 'typing-pets') return { kind: 'one', label: labelOf(slug, s.items) };
    return { kind: 'set', n: s.items.length };
  }
  if (slug !== 'algebra-builder') return null;
  if (ACT_NAME[params.mode]) return { kind: 'one', label: `${ACT_NAME[params.mode]} ${readable(ch)}` };
  return null;
}
