// Manipulatives: tasks you can practice and assign (docs/manip-practice-tasks.md; docs/decisions.md "Manipulatives: tasks
// you can practice and assign"). The shared engine behind every tool's task file (public/js/manip-tasks/<slug>.js):
//   - a seeded random source, so a task's variation is the same everywhere for the same seed (the page, the server's
//     re-check, the tests);
//   - variationOf(task, seed): the task's make(rng) with its id and seed, checked for shape;
//   - setOf(list, n, seed): n distinct variations of one task (never the same prompt twice in a set);
//   - checkWork(tool, v, work): the one checker: the board conditions (the tool file's own `conds`), the answer box
//     (manip-practice.js answerMatches: numbers with commas, fractions in any equal form, times, money; and expanded form
//     here), and a multiple choice; -> { correct, partial, parts, feedback }.
// Pure functions, shared by the browser and the server. English only for now (like the task library).
import { answerMatches } from './manip-practice.js';
import { WORLD, kindOf, newBoard } from './manip-board.js';

// ---------------------------------------------------------------- the seeded random source
/** A 32-bit hash of a string (FNV-1a). */
export function hash32(s) {
  let h = 0x811c9dc5;
  for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** A small seeded generator (mulberry32): rng() in [0, 1), plus helpers. The same (id, seed) gives the same numbers. */
export function rngOf(id, seed) {
  let a = hash32(`${id}#${seed}`) || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const R = () => next();
  /** A whole number from lo to hi (both included). */
  R.int = (lo, hi) => lo + Math.floor(next() * (hi - lo + 1));
  R.pick = list => list[Math.floor(next() * list.length)];
  R.chance = (p = 0.5) => next() < p;
  R.shuffle = list => { const a2 = [...list]; for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; } return a2; };
  return R;
}

// ---------------------------------------------------------------- words
/** 1,234 (US grouping); decimals as given. */
export const fmt = n => (Number.isInteger(n) ? n.toLocaleString('en-US') : String(+n.toFixed(6)));
const NUM_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const word = n => NUM_WORDS[n] || fmt(n);
/** A count and its noun: plural(1, 'bead') -> '1 bead', plural(3, 'bead') -> '3 beads' (every "<count> <noun>" a student reads). */
export const plural = (n, one, many = `${one}s`) => `${fmt(n)} ${+n === 1 ? one : many}`;
/** Turns a string id-ish ("Show 7 the 5-way") into a stable key ("show-7-the-5-way"). */
/** Counting toward the k-th number, never past it: nth(i) is the i-th number said. Up to 4 numbers are listed in full
 * ("5, 10, 15" for 15); more give the first 3 and the target ("5, 10, 15, ... up to 50", `tail` 'until you say' etc.,
 * or null for just "5, 10, 15, ..." when the target is the answer). */
export function countTo(k, nth, tail = 'up to') {
  const said = i => (typeof nth === 'function' ? nth(i) : fmt(nth * i));
  if (k <= 4) return Array.from({ length: Math.max(1, k) }, (_, i) => said(i + 1)).join(', ');
  return `${[1, 2, 3].map(said).join(', ')}, ...${tail ? ` ${tail} ${said(k)}` : ''}`;
}
/** A line ends with one period: "5, 10, 15, ..." keeps its dots. */
export const endLine = t => (/[.?!]$/.test(t) ? t : `${t}.`);
/** How many times: "once", "3 times". */
export const times = n => (+n === 1 ? 'once' : `${fmt(n)} times`);
export const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

// ---------------------------------------------------------------- tasks and variations
/** A task's id: '<tool slug>/<key>' (stable: the key never changes once the task ships). */
export const taskId = (slug, task) => `${slug}/${task.key}`;
export const SEED_MAX = 999999;
/** A task's variation for a seed (a whole number 1..SEED_MAX): { id, seed, prompt, setup, answer, hints, explain, totals }. */
export function variationOf(slug, task, seed) {
  const s = Math.max(1, Math.min(SEED_MAX, Math.floor(Number(seed)) || 1));
  const v = task.make(rngOf(taskId(slug, task), s));
  return { id: taskId(slug, task), seed: s, ...v };
}
/** What makes a variation different from another: its prompt, or its own sig when the numbers are on the board only
 *  (a prompt the same for every seed: "Look at the blocks. What number do they show?"). */
export const sigOf = v => (v && v.sig) || (v && v.prompt) || '';
/**
 * n distinct variations of a task (by sigOf), from a starting seed: the seeds tried are seed, seed+1, ... (each a
 * different random draw). -> [variation] (fewer than n only if the task cannot make that many; tests make sure it can).
 */
export function setOf(slug, task, n, seed = 1, { avoid = [] } = {}) {
  const out = [], seen = new Set(avoid);
  for (let s = Math.max(1, Math.floor(seed)), tries = 0; out.length < n && tries < n * 40; s = (s % SEED_MAX) + 1, tries++) {
    const v = variationOf(slug, task, s);
    if (seen.has(sigOf(v))) continue;
    seen.add(sigOf(v)); out.push(v);
  }
  return out;
}
/** A new seed for "Try another": a variation whose sig (sigOf) is not among the ones just seen. */
export function nextSeed(slug, task, seen = [], rand = Math.random) {
  for (let i = 0; i < 60; i++) {
    const s = 1 + Math.floor(rand() * SEED_MAX), v = variationOf(slug, task, s);
    if (!seen.includes(sigOf(v))) return s;
  }
  return 1 + Math.floor(rand() * SEED_MAX);
}

// ---------------------------------------------------------------- boards
/** A board for a tool with these objects (and pieces), the way the page keeps one (format 2). */
export function boardWith(slug, objects = [], pieces = null, extra = {}) {
  const b = newBoard(slug);
  return { ...b, objects, ...(pieces ? { pieces } : {}), ...extra };
}
/** Object places: n objects of these sizes in one row, centered on the world, gap apart. -> [{ x, y }] */
export function rowPlaces(sizes, gap = 60) {
  const W = sizes.reduce((s, z) => s + z.w, 0) + gap * Math.max(0, sizes.length - 1), H = Math.max(...sizes.map(z => z.h));
  let x = Math.round((WORLD.w - W) / 2);
  return sizes.map(z => { const at = { x, y: Math.round((WORLD.h - H) / 2) }; x += z.w + gap; return at; });
}
export const objSizeOf = (slug, k, st) => kindOf(slug, k).size(st);

// ---------------------------------------------------------------- checking
const clean = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
/** "2000 + 40 + 8" (any order, commas and spaces as typed; zero terms may be left out) equals the expanded form of n. */
export function expandedMatches(n, typed) {
  const parts = String(typed || '').replace(/[,\s]/g, '').split('+').filter(Boolean);
  if (!parts.length || parts.some(p => !/^\d+(\.\d+)?$/.test(p))) return false;
  const want = expandedParts(n).sort((a, b) => b - a), got = parts.map(Number).filter(x => x !== 0).sort((a, b) => b - a);
  return got.length === want.length && got.every((x, i) => Math.abs(x - want[i]) < 1e-9);
}
/** The nonzero place values of n: 2048 -> [2000, 40, 8]. */
export function expandedParts(n) {
  const s = String(n), out = [];
  for (let i = 0; i < s.length; i++) { const d = +s[i]; if (d) out.push(d * 10 ** (s.length - 1 - i)); }
  return out;
}
export const expandedText = n => expandedParts(n).map(fmt).join(' + ');
/** An expression in x and y ("3x² − 2x + 4", "(x + 2)(x − 3)", "2(x+1)") as its terms: { 'x^2': 3, 'x': -2, '': 4 },
 *  or null when it is not one (only digits, x, y, + - * ^ ² and brackets; implicit times). */
export function polyOf(s) {
  const src = String(s == null ? '' : s).toLowerCase().replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/[×·]/g, '*').replace(/²/g, '^2');
  if (!src || /[^0-9.xy+\-*^()]/.test(src)) return null;
  let i = 0;
  const key = m => Object.keys(m).filter(v => m[v]).sort().map(v => (m[v] === 1 ? v : `${v}^${m[v]}`)).join('');
  const mono = k => { const m = {}; for (const [, v, e] of String(k).matchAll(/([xy])(?:\^(\d+))?/g)) m[v] = (m[v] || 0) + (e ? +e : 1); return m; };
  const mul = (a, b) => { const out = {}; for (const [ka, ca] of Object.entries(a)) for (const [kb, cb] of Object.entries(b)) { const m = mono(ka), n = mono(kb); for (const v in n) m[v] = (m[v] || 0) + n[v]; const k = key(m); out[k] = (out[k] || 0) + ca * cb; } return out; };
  const add = (a, b, sg = 1) => { const out = { ...a }; for (const [k, c] of Object.entries(b)) out[k] = (out[k] || 0) + sg * c; return out; };
  const pow = (p) => { if (src[i] !== '^') return p; i++; const m = /^\d+/.exec(src.slice(i)); if (!m || +m[0] > 4) throw 0; i += m[0].length; let r = { '': 1 }; for (let k = 0; k < +m[0]; k++) r = mul(r, p); return r; };
  const factor = () => {
    const c = src[i];
    if (c === '(') { i++; const e = expr(); if (src[i] !== ')') throw 0; i++; return pow(e); }
    // (a digit right after a letter is its power: "x2" is how a keyboard writes x²)
    if (c === 'x' || c === 'y') { i++; const d = /^[2-4](?![\d.])/.exec(src.slice(i)); if (d) i++; return pow({ [d ? `${c}^${d[0]}` : c]: 1 }); }
    const m = /^\d+(\.\d+)?|^\.\d+/.exec(src.slice(i)); if (!m) throw 0;
    i += m[0].length; return pow({ '': +m[0] });
  };
  const term = () => { let p = factor(); while (i < src.length && (src[i] === '*' || src[i] === '(' || src[i] === 'x' || src[i] === 'y' || /[\d.]/.test(src[i]))) { if (src[i] === '*') i++; p = mul(p, factor()); } return p; };
  const expr = () => {
    let p = {}, sg = 1;
    if (src[i] === '+' || src[i] === '-') { sg = src[i] === '-' ? -1 : 1; i++; }
    p = add(p, term(), sg);
    while (src[i] === '+' || src[i] === '-') { sg = src[i] === '-' ? -1 : 1; i++; p = add(p, term(), sg); }
    return p;
  };
  try { const p = expr(); if (i !== src.length) return null; return Object.fromEntries(Object.entries(p).filter(([, c]) => Math.abs(c) > 1e-9)); } catch { return null; }
}
const samePoly = (a, b) => !!a && !!b && [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => Math.abs((a[k] || 0) - (b[k] || 0)) < 1e-9);
/** A typed expression equals the key's (any order, implicit times, x^2 or x²; "x = 4" for a key of 4). factored: it
 *  must also be written as a product of brackets ("(x + 2)(x + 3)"), not multiplied out. */
export function polyMatches(key, typed, { factored = false } = {}) {
  let a = String(typed || '').replace(/\s+/g, '');
  if (!/=/.test(String(key))) a = a.replace(/^[xy]=/i, '');
  if (factored && !/\)\*?\(|^\(.+\)(\^2|²)$|^\d+\*?\(.+\)$/.test(a.replace(/[−–]/g, '-'))) return false;
  return samePoly(polyOf(key), polyOf(a));
}
/** An ordered pair typed "(3, -4)", "3,-4" or "( 3 , −4 )" equals the key's. */
export function pointMatches(key, typed) {
  const p = s => { const m = /^\(?(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)?$/.exec(String(s || '').replace(/\s+/g, '').replace(/[−–]/g, '-')); return m ? [+m[1], +m[2]] : null; };
  const a = p(typed), b = p(key);
  return !!a && !!b && a[0] === b[0] && a[1] === b[1];
}
/** Does a typed answer match the box's key? box: { key (or keys), kind: 'expanded' | 'poly' | 'factored' | 'point' |
 *  undefined, simplest (a fraction in lowest terms only), over (an equivalence "?/8": the numerator, or the fraction
 *  over that denominator) }. */
export function boxMatches(box, typed) {
  const a = clean(typed); if (!a) return false;
  const keys = Array.isArray(box.keys) ? box.keys : [box.key];
  if (box.kind === 'expanded') return keys.some(k => expandedMatches(k, a));
  if (box.kind === 'poly' || box.kind === 'factored') return keys.some(k => polyMatches(k, a, { factored: box.kind === 'factored' }));
  if (box.kind === 'point') return keys.some(k => pointMatches(k, a));
  const opts = { simplest: !!box.simplest, over: Math.max(0, Math.round(+box.over || 0)) };
  return keys.some(k => answerMatches(String(k), a, opts));
}
/**
 * Check a student's work on a variation. tool: the tool file's exports ({ conds: { type: (cond, board) -> bool } }).
 * work: { board (the board's state), box (what they typed), choice (the index they picked, or null) }.
 * -> { correct, partial (some parts right), parts: { board?, box?, choice? } (true / false each), feedback (one calm
 *    line: what to look at, never the answer) }
 */
export function checkWork(tool, v, work = {}) {
  const a = v.answer || {}, parts = {};
  let miss = null;
  if (Array.isArray(a.board) && a.board.length) {
    const board = work.board && typeof work.board === 'object' ? work.board : {};
    parts.board = true;
    for (const c of a.board) {
      const f = tool.conds[c.t];
      let okc = false; try { okc = !!(f && f(c, board)); } catch { okc = false; }
      if (!okc) { parts.board = false; if (!miss) miss = c.say || 'Look at the board again.'; break; }
    }
  }
  if (a.box) {
    parts.box = boxMatches(a.box, work.box);
    if (!parts.box && !miss) miss = clean(work.box) ? (a.box.say || 'Look again at the number you typed.') : 'Type your answer in the box.';
  }
  if (a.choice) {
    const i = Number.isInteger(work.choice) ? work.choice : null;
    parts.choice = i === a.choice.correct;
    if (!parts.choice && !miss) miss = i === null ? 'Pick an answer.' : (a.choice.say || 'Think again about which answer fits.');
  }
  const vals = Object.values(parts), correct = vals.length > 0 && vals.every(Boolean);
  return { correct, partial: !correct && vals.some(Boolean), parts, feedback: correct ? '' : miss || 'Not yet.' };
}

// ---------------------------------------------------------------- what a variation must look like (the tests use it)
/** Problems with a variation's shape, [] when it is fine. */
export function shapeProblems(v) {
  const out = [];
  if (!v || typeof v !== 'object') return ['no variation'];
  if (typeof v.prompt !== 'string' || v.prompt.length < 10) out.push('prompt');
  if (!v.setup || typeof v.setup !== 'object' || !Array.isArray(v.setup.objects)) out.push('setup');
  const a = v.answer || {};
  if (!(Array.isArray(a.board) && a.board.length) && !a.box && !a.choice) out.push('answer');
  if (a.choice && (!Array.isArray(a.choice.options) || a.choice.options.length < 2 || !Number.isInteger(a.choice.correct) || !a.choice.options[a.choice.correct])) out.push('choice');
  if (!Array.isArray(v.hints) || v.hints.length < 2 || v.hints.length > 3 || v.hints.some(h => typeof h !== 'string' || h.length < 8)) out.push('hints');
  if (typeof v.explain !== 'string' || v.explain.length < 8) out.push('explain');
  if (!v.solution || typeof v.solution !== 'object') out.push('solution');
  const all = [v.prompt, ...(v.hints || []), v.explain, ...((a.choice && a.choice.options) || [])].join(' ');
  if (/[\u2014]/.test(all)) out.push('em dash');
  return out;
}
