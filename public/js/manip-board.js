// Virtual math manipulatives: the board model (docs/decisions.md "Virtual math manipulatives: one big board").
// Pure functions shared by the page (public/js/manip.js, public/js/manip-room.js) and the server
// (services/manipulatives.js). Every tool's board is a big plane you pan and zoom. What used to be the tool's one fixed
// layout is now an OBJECT you can add as many times as you like (clocks, geoboards, number lines, a place-value chart,
// a ten-frame...), each with its own state; pieces (blocks, tiles, coins, counters) stay free pieces on the plane.
//
// A board (format 2):
//   { v: 2, objects: [{ id, k (kind), x, y, s (scale), st (the object's own state) }], pieces: [...] (piece tools),
//     <a piece tool's settings: decimal, mode, unit>, __ann { notes, strokes, texts }, __steps }
// Places are pixels of the plane: the solo board's world (WORLD), or a square's work space in a live room. Notes, texts
// and pen marks are fractions of that same space. Boards saved before format 2 are migrated when they are read.
import { allPieceDefs, pieceDefs, freeSpot, FRACTION_DENS } from './manip-data.js';

export const WORLD = { w: 4000, h: 2400 };
/** At most this many objects on a board, and in one room square (a practice set of 12 problems is 24 or more). */
export const OBJ_MAX = 40, OBJ_MAX_SQUARE = 30;
/** An object's size limits (its scale), and the height of its handle bar. */
export const S_MIN = 0.35, S_MAX = 3, OBJ_HEAD = 30;
/** Smallest scale a board may be shown at when it is fitted into a room area (a clock about 100 px wide); below it the
 *  layout is reflowed or the area grows instead. S_FLOOR: the smallest scale an object may be stored at (a fitted group). */
export const KMIN = 0.4, S_FLOOR = 0.1;
const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

// ---------------------------------------------------------------- object kinds, per tool
const PV10 = ['Thousands', 'Hundreds', 'Tens', 'Ones'];
const PVD = ['Thousands', 'Hundreds', 'Tens', 'Ones', 'Tenths', 'Hundredths'];
/** Each tool's object kinds: { k, name, add (palette label), init() (a new one's state), size(st) (its natural size,
 *  handle bar included), start (a new board starts with one) }. */
export const OBJECTS = {
  rekenreks: [{ k: 'rekenreks', name: 'Rekenrek', add: 'Add a rekenrek', start: true, init: () => ({ rows: 2, counts: Array(10).fill(0), covered: false, long: false }),
    size: st => ({ w: st.long ? 660 : 500, h: OBJ_HEAD + 28 + clamp(num(st.rows, 2), 1, 10) * 48 + (st.covered ? 56 : 0) }) }],
  'hundred-board': [{ k: 'hundred-board', name: 'Hundred board', add: 'Add a hundred board', start: true, init: () => ({ start: 1, picked: [], mult: 0, decimalMode: false, hidden: false }),
    size: () => ({ w: 500, h: OBJ_HEAD + 504 }) }],
  'fraction-circles': [{ k: 'fraction-circles', name: 'Fraction set', add: 'Add a fraction set', start: true, init: () => ({ placed: [], mode: 'frac', rings: false }),
    size: st => ({ w: 540, h: OBJ_HEAD + 24 + (st.rings ? 350 : Math.max(1, Math.ceil(clamp((st.placed || []).length, 1, 24) / 3)) * 172) }) }],
  'number-lines': [{ k: 'number-lines', name: 'Number line', add: 'Add a number line', start: true, init: () => ({ min: -10, max: 10, step: 1, hide: false, points: [3], jumps: [], jumpFrom: null, mode: 'points' }),
    size: st => ({ w: 892, h: OBJ_HEAD + (st && st.ask ? 268 : st && (st.mode === 'jumps' || (st.jumps || []).length) ? 460 : 380) }) }],
  'bar-models': [{ k: 'bar-models', name: 'Bar model', add: 'Add a bar model', start: true,
    init: () => ({ bars: [{ name: 'Whole', segs: [{ label: 'Part A', value: 3, color: '#7CB342' }, { label: 'Part B', value: 2, color: '#AED581' }] }, { name: 'Compare', segs: [{ label: 'Red', value: 5, color: '#1E88E5' }] }] }),
    size: st => ({ w: 700, h: OBJ_HEAD + 24 + clamp((st.bars || []).length, 1, 8) * 118 }) }],
  'xy-coordinate-board': [{ k: 'xy-coordinate-board', name: 'Coordinate grid', add: 'Add a coordinate grid', start: true,
    // Points of one color join into a line (in the order plotted); arrows: arrowheads at a line's two ends; table: the
    // x/y table beside the grid (on unless turned off).
    init: () => ({ four: true, labels: true, connect: true, arrows: false, table: true, color: '#E53935', pts: [{ x: -2, y: -1, color: '#E53935' }, { x: 1, y: 2, color: '#E53935' }, { x: 4, y: 5, color: '#E53935' }] }),
    size: () => ({ w: 720, h: OBJ_HEAD + 476 }) }],
  geoboard: [{ k: 'geoboard', name: 'Geoboard', add: 'Add a geoboard', start: true, init: () => ({ board: 'square', band: [], bands: [], color: '#E53935', fill: true }),
    size: () => ({ w: 432, h: OBJ_HEAD + 462 }) }],
  clock: [{ k: 'clock', name: 'Clock', add: 'Add a clock', start: true, init: () => ({ h: 9, m: 15, start: null, label: '' }),
    // A practice clock (q) is only its face: no time line, tracker line or buttons (the answer box sits right under it).
    size: st => (st && st.q ? { w: 252, h: OBJ_HEAD + 238 } : { w: 252, h: OBJ_HEAD + 352 }) }],
  'base-ten-blocks': [{ k: 'pv-chart', name: 'Place-value chart', add: 'Add a place-value chart', start: true, init: () => ({ cols: PV10 }), size: st => pvSize(st) },
    { k: 'mat', name: 'Work mat', add: 'Add a work mat', init: () => ({}), size: () => MAT }],
  'place-value-disks': [{ k: 'pv-chart', name: 'Place-value chart', add: 'Add a place-value chart', init: () => ({ cols: PVD }), size: st => pvSize(st) },
    { k: 'mat', name: 'Work mat', add: 'Add a work mat', init: () => ({}), size: () => MAT }],
  'two-color-counters': [{ k: 'ten-frame', name: 'Ten-frame', add: 'Add a ten-frame', start: true, init: () => ({ n: 10 }), size: () => frameSize(10) },
    { k: 'five-frame', name: 'Five-frame', add: 'Add a five-frame', init: () => ({ n: 5 }), size: () => frameSize(5) },
    { k: 'double-ten-frame', name: 'Double ten-frame', add: 'Add a double ten-frame', init: () => ({ n: 20 }), size: () => frameSize(20) },
    { k: 'ppw', name: 'Part-part-whole mat', add: 'Add a part-part-whole mat', init: () => ({}), size: () => ({ w: 440, h: OBJ_HEAD + 320 }) },
    { k: 'mat', name: 'Work mat', add: 'Add a work mat', init: () => ({}), size: () => MAT }],
};
const MAT = { w: 440, h: OBJ_HEAD + 290 };
for (const slug of ['linking-cubes', 'color-tiles', 'number-rods', 'fraction-tiles', 'algebra-tiles', 'pattern-blocks', 'money']) OBJECTS[slug] = [{ k: 'mat', name: 'Work mat', add: 'Add a work mat', init: () => ({}), size: st => matSize(st) }];
// A fraction equation ("1/2 + 1/3 = ?"): its operands drawn as tiles (or circles), an empty "build it here" bar and an
// answer box. Its state: { a, op, b, text, ans (the student's), key (the teacher's answer, never sent to students) }.
const FRAC_EQ = { k: 'frac-eq', name: 'Fraction equation', add: 'Add a fraction equation', init: () => ({ a: '1/2', op: '+', b: '1/4', text: '1/2 + 1/4 = ?', ans: '' }), size: st => fracEqSize(st) };
OBJECTS['fraction-tiles'].unshift(FRAC_EQ); OBJECTS['fraction-circles'].push({ ...FRAC_EQ, init: () => ({ ...FRAC_EQ.init(), shape: 'circles' }) });
// An answer box, on every tool: "?" to type into (the student's, private like their text), sized for its answer.
// Its size is the box's own width and height (st.w, st.h: the box under its handle bar), never a scale: dragging its
// corner shows more of a long answer, which wraps inside it, at the same font size (owner, 21 Nov 2026).
export const ANSWER = { k: 'answer', name: 'Answer', add: 'Add an answer box', init: () => ({ ans: '', size: 'M' }), size: st => answerSize(st) };
for (const slug of Object.keys(OBJECTS)) OBJECTS[slug].push(ANSWER);
/** An answer box's limits: its typed answer (characters), width (the whole box) and height (under the handle bar). */
export const ANS = { max: 100, wMin: 120, wMax: 900, hMin: 58, hMax: 600, h: 58, preset: { S: 170, M: 220, L: 300 } };
/** Kinds sized by their own width and height (a corner drag changes them) instead of a scale. */
export const FREE_SIZE = new Set(['answer']);
/** An answer box's size: its preset width (S, M, L) until it is resized; then st.w x st.h, within ANS. */
export function answerSize(st) {
  const w = clamp(Math.round(num(st && st.w, ANS.preset[st && st.size] || ANS.preset.M)), ANS.wMin, ANS.wMax);
  return { w, h: OBJ_HEAD + clamp(Math.round(num(st && st.h, ANS.h)), ANS.hMin, ANS.hMax) };
}
/**
 * A free-size object's corner dragged by (dx, dy) plane pixels: its new st.w and st.h (in its own unscaled pixels, so
 * the font keeps its size), within its kind's limits and inside the space (it never grows past the space's edge).
 * o: { x, y, s, st }; space: { w, h }. -> { w, h }
 */
export function freeResize(o, dx, dy, space) {
  const s = num(o.s, 1) || 1, z = answerSize(o.st || {}), h0 = z.h - OBJ_HEAD;
  const wMax = Math.min(ANS.wMax, Math.floor((space.w - num(o.x)) / s)), hMax = Math.min(ANS.hMax, Math.floor((space.h - num(o.y)) / s) - OBJ_HEAD);
  return { w: Math.round(clamp(z.w + dx / s, ANS.wMin, wMax)), h: Math.round(clamp(h0 + dy / s, ANS.hMin, hMax)) };
}
/** An answer box grown to show all of its text (h: the height its words need, unscaled): never smaller, within ANS. */
export const grownHeight = (st, need) => Math.max(answerSize(st).h - OBJ_HEAD, Math.min(ANS.hMax, Math.ceil(num(need, 0))));

// ---------------------------------------------------------------- board text (T): its size and box
/** Board text sizes (font pixels): S, M (the default), L, XL. */
export const TEXT_SIZES = { S: 14, M: 18, L: 26, XL: 36 };
export const TEXT_FS = Object.keys(TEXT_SIZES);
/** A text box's limits, in pixels of its space: width and height (its height grows with its words). */
export const TEXT_BOX = { wMin: 60, wMax: 1200, hMin: 24, hMax: 800 };
export const textFont = x => TEXT_SIZES[x && x.fs] || TEXT_SIZES.M;
/** One size step bigger (dir 1) or smaller (dir -1): S <-> M <-> L <-> XL. */
export function stepTextSize(fs, dir) { const i = Math.max(0, TEXT_FS.indexOf(fs in TEXT_SIZES ? fs : 'M')); return TEXT_FS[clamp(i + (dir > 0 ? 1 : -1), 0, TEXT_FS.length - 1)]; }
/** A board text's size fields as they may be stored: fs only when not the default; w and h (a resized box, both
 *  together) within TEXT_BOX. -> { fs?, w?, h? } */
export function textBoxFields(n) {
  const out = {};
  if (n && n.fs in TEXT_SIZES && n.fs !== 'M') out.fs = n.fs;
  if (n && Number.isFinite(+n.w) && Number.isFinite(+n.h)) { out.w = Math.round(clamp(+n.w, TEXT_BOX.wMin, TEXT_BOX.wMax)); out.h = Math.round(clamp(+n.h, TEXT_BOX.hMin, TEXT_BOX.hMax)); }
  return out;
}
/** A text box's corner dragged by (dx, dy) pixels of its space, from its size w0 x h0: its new size within TEXT_BOX and
 *  inside the space (x, y: its place in pixels). -> { w, h } */
export function textResize(w0, h0, dx, dy, x, y, space) {
  return { w: Math.round(clamp(w0 + dx, TEXT_BOX.wMin, Math.min(TEXT_BOX.wMax, space.w - x))), h: Math.round(clamp(h0 + dy, TEXT_BOX.hMin, Math.min(TEXT_BOX.hMax, space.h - y))) };
}
/** A board text's rectangle in pixels of its space (an unsized one: about as wide as its words, on one line). */
export function textRect(n, space) {
  const f = textFont(n), x = num(n.x) * space.w, y = num(n.y) * space.h;
  if (Number.isFinite(+n.w) && Number.isFinite(+n.h)) return { x, y, w: +n.w, h: +n.h };
  return { x, y, w: Math.min(360 * (f / 18), 14 + 10 * (f / 18) * String(n.text || '').length), h: Math.round(f * 1.25 + 6) };
}
/**
 * A dragged box's magnetic snap (board text): its left, right, top or bottom edge lines up with, or sits just beside,
 * an edge of anything nearby (objects, pieces, other texts) when within t pixels; each direction on its own.
 * b: { x, y, w, h }; others: rectangles. -> { dx, dy }
 */
export function snapBox(b, others, t, gap = 8) {
  let bx = null, by = null;
  for (const o of others) {
    const near = b.x < o.x + o.w + 3 * t && b.x + b.w > o.x - 3 * t && b.y < o.y + o.h + 3 * t && b.y + b.h > o.y - 3 * t;
    if (!near) continue;
    for (const d of [o.x - b.x, o.x + o.w - (b.x + b.w), o.x + o.w + gap - b.x, o.x - gap - (b.x + b.w)]) if (Math.abs(d) <= t && (bx === null || Math.abs(d) < Math.abs(bx))) bx = d;
    for (const d of [o.y - b.y, o.y + o.h - (b.y + b.h), o.y + o.h + gap - b.y, o.y - gap - (b.y + b.h)]) if (Math.abs(d) <= t && (by === null || Math.abs(d) < Math.abs(by))) by = d;
  }
  return { dx: bx || 0, dy: by || 0 };
}

// ---------------------------------------------------------------- the coordinate grid: lines and moving them
/** The grid's range of values: four quadrants -10..10, the first quadrant 0..12. */
export const xyRange = st => (st && st.four ? { lo: -10, hi: 10 } : { lo: 0, hi: 12 });
/** The grid's lines: the points of each color, in the order they were plotted, joined (a color with one point has no
 *  line). -> [{ color, idx: [point indexes] }] */
export function xyLines(pts) {
  const by = new Map();
  (pts || []).forEach((p, i) => { const c = String(p && p.color || ''); if (!by.has(c)) by.set(c, []); by.get(c).push(i); });
  return [...by].filter(([, idx]) => idx.length > 1).map(([color, idx]) => ({ color, idx }));
}
/** A point dragged to (x, y) grid values: on the nearest grid point, inside the grid. -> { x, y } */
export const xySnap = (x, y, lo, hi) => ({ x: clamp(Math.round(num(x)), lo, hi), y: clamp(Math.round(num(y)), lo, hi) });
/**
 * A whole line moved by (dx, dy) grid values: every point of it moves by the same whole number of grid steps, and the
 * move is cut short so no point leaves the grid (the line keeps its shape). pts: all the points; idx: the line's.
 * -> new points (the others as they were)
 */
export function xyMoveLine(pts, idx, dx, dy, lo, hi) {
  const on = (pts || []).filter((_, i) => idx.includes(i));
  if (!on.length) return (pts || []).slice();
  const xs = on.map(p => num(p.x)), ys = on.map(p => num(p.y));
  const mx = clamp(Math.round(num(dx)), lo - Math.min(...xs), hi - Math.max(...xs)), my = clamp(Math.round(num(dy)), lo - Math.min(...ys), hi - Math.max(...ys));
  return pts.map((p, i) => (idx.includes(i) ? { ...p, x: num(p.x) + mx, y: num(p.y) + my } : p));
}
export const PV_COL = { w: 136, gap: 6, pad: 10, h: 236 };
function matSize(st) { return { w: clamp(num(st && st.w, 440), 160, 1600), h: OBJ_HEAD + clamp(num(st && st.h, 290), 80, 1200) }; }
OBJECTS['base-ten-blocks'][1].size = matSize; OBJECTS['place-value-disks'][1].size = matSize; OBJECTS['two-color-counters'][2].size = matSize;
/** A fraction like "3/4", "1 1/2" or "2": { n, d } (improper), or null. */
export function parseFrac(s) {
  const m = String(s == null ? '' : s).trim().match(/^(?:(\d{1,2})\s+)?(\d{1,3})(?:\s*\/\s*(\d{1,3}))?$/);
  if (!m) return null;
  const w = m[1] ? +m[1] : 0, n = +m[2], d = m[3] ? +m[3] : 1;
  if (!d || (m[1] && !m[3])) return null;
  return { n: w * d + n, d };
}
/** How a fraction equation's operand is drawn: its tiles (of 1/d), up to d in a row. */
export const fracRows = f => (f ? Math.max(1, Math.ceil(f.n / f.d)) : 1);
export const EQ_BAR = 300;
function fracEqSize(st) {
  const a = parseFrac(st && st.a), b = parseFrac(st && st.b), circles = st && st.shape === 'circles';
  const rows = circles ? 2 : fracRows(a) + (b && b.d > 1 ? fracRows(b) : 1) + 1;
  return { w: 20 + EQ_BAR + 60, h: OBJ_HEAD + 46 + (circles ? 130 : rows * 40 + 24) + 60 };
}
function pvSize(st) { const n = clamp((st && Array.isArray(st.cols) ? st.cols : PV10).length, 1, 8); return { w: PV_COL.pad * 2 + n * PV_COL.w + (n - 1) * PV_COL.gap, h: OBJ_HEAD + PV_COL.pad * 2 + PV_COL.h }; }
export const CELL = 60;
function frameSize(n) { return n > 10 ? { w: 20 + 10 * CELL + 12, h: OBJ_HEAD + 20 + 2 * CELL } : { w: 20 + 5 * CELL, h: OBJ_HEAD + 20 + (n > 5 ? 2 : 1) * CELL }; }

export const kindsOf = slug => OBJECTS[slug] || [];
export const kindOf = (slug, k) => kindsOf(slug).find(x => x.k === k) || null;
/** Is the tool's content objects only (no free pieces)? */
export const objectTool = slug => !pieceDefs(slug).length;
/** Kinds that lie under everything else (mats and charts that pieces sit on). */
export const UNDER = new Set(['mat', 'pv-chart', 'ten-frame', 'five-frame', 'double-ten-frame', 'ppw']);
/** Backdrops: the charts, tables, frames, mats and graphs other pieces go onto (owner, 22 Nov 2026: "when you place
 *  down a chart, table, or graph, it should always be locked in place by default"). A new one starts locked, wherever
 *  it is placed (the palette, a new board, an AI draft, a practice set), so dragging pieces onto it never moves it; the
 *  wheel's Unlock frees it. Boards saved before keep the locks they were saved with (nothing is migrated). */
export const BACKDROP = new Set([...UNDER, 'hundred-board', 'xy-coordinate-board', 'number-lines', 'bar-models']);
/** The lock a new object of kind k starts with: { locked: true } for a backdrop, else nothing. */
export const startLock = k => (BACKDROP.has(k) ? { locked: true } : {});
/** An object's natural size (unscaled) and its place on the plane (scaled). */
export function objSize(slug, o) { const K = kindOf(slug, o.k); return K ? K.size(o.st || {}) : { w: 300, h: 200 }; }
export function objRect(slug, o) { const z = objSize(slug, o), s = num(o.s, 1); return { x: num(o.x), y: num(o.y), w: z.w * s, h: z.h * s }; }

// ---------------------------------------------------------------- the clock's elapsed-time sector
const toMin = c => (((Math.round(num(c.h)) % 12) + 12) % 12) * 60 + clamp(Math.round(num(c.m)), 0, 59);
/** The clock's tracked time: from its start to the time it shows, going forward (never more than 12 hours). Drawn as
 *  ONE minute-hand sector from the start's minute to the current minute (clockwise, `sweep` degrees from `from`, 0 at
 *  the 12), plus a light full ring for each full hour (`turns`). Nothing at all when not tracking or at zero.
 *  -> null | { elapsed (minutes), turns, part (minutes past the last full hour), from, sweep } */
export function clockSector(st) {
  if (!st || !st.start) return null;
  const elapsed = (((toMin(st) - toMin(st.start)) % 720) + 720) % 720;
  if (!elapsed) return null;
  const part = elapsed % 60;
  return { elapsed, turns: Math.floor(elapsed / 60), part, from: (toMin(st.start) % 60) * 6, sweep: part * 6 };
}
/** Minutes later (or earlier) on a clock's 12-hour face. */
export function addMinutes(c, d) { const t = (((toMin(c) + d) % 720) + 720) % 720, h = Math.floor(t / 60); return { h: h || 12, m: t % 60 }; }

// ---------------------------------------------------------------- new boards, and boards saved before format 2
let seq = 0;
const oid = () => `o${Date.now().toString(36)}${(seq++).toString(36)}`;
export const newObject = (slug, k, x = 0, y = 0, s = 1) => { const K = kindOf(slug, k); return K ? { id: oid(), k, x: Math.round(x), y: Math.round(y), s, st: K.init(), ...startLock(k) } : null; };
/** A new board: one object of the tool (if it starts with one), centered in the space. */
export function newBoard(slug, space = WORLD, extra = {}) {
  const K = kindsOf(slug).find(x => x.start), objects = [];
  if (K) {
    const z = K.size(K.init()), s = Math.min(1, (space.w - 24) / z.w, (space.h - 24) / z.h);
    objects.push(newObject(slug, K.k, (space.w - z.w * s) / 2, (space.h - z.h * s) / 2, Math.max(S_MIN, s)));
  }
  return { v: 2, objects, ...(objectTool(slug) ? {} : { pieces: [] }), ...extra };
}
/** Where an old board's top-left lands in the world (a little up and left of the middle, so it looks the same). */
export const ORIGIN = { x: 1600, y: 1000 };
/**
 * Any saved board as format 2. Format-2 boards come back as they are (arrays made sure). An older board (the tool's one
 * state, pieces in board pixels, notes and marks as fractions of the board it was made on, __ann.size) becomes one
 * object of the tool (a clock board with two clocks: two clocks) plus its pieces, with everything moved by `at` and
 * notes, texts and marks turned into fractions of `space`. In a live room (at 0,0 and space = the square) nothing moves.
 */
export function migrate(slug, raw, { at = ORIGIN, space = WORLD, from = null } = {}) {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  if (o.v === 2) return { ...o, objects: Array.isArray(o.objects) ? o.objects.filter(x => x && typeof x === 'object' && kindOf(slug, x.k)) : [], ...(objectTool(slug) ? {} : { pieces: Array.isArray(o.pieces) ? o.pieces : [] }) };
  const ann = o.__ann && typeof o.__ann === 'object' ? o.__ann : null;
  const old = from || (ann && ann.size ? { w: num(ann.size.w, 800) || 800, h: num(ann.size.h, 430) || 430 } : { w: 800, h: 430 });
  const rest = { ...o }; delete rest.__ann; delete rest.__steps; delete rest.v;
  const empty = !Object.keys(rest).length;
  const out = { v: 2, objects: [] };
  if (o.__steps) out.__steps = o.__steps;
  const fx = f => (at.x + num(f) * old.w) / space.w, fy = f => (at.y + num(f) * old.h) / space.h;
  if (ann) {
    const pos = n => ({ ...n, x: clamp(fx(n.x), 0, 1), y: clamp(fy(n.y), 0, 1) });
    out.__ann = { notes: (ann.notes || []).map(pos), texts: (ann.texts || []).map(pos),
      strokes: (ann.strokes || []).map(s => ({ ...s, pts: (s.pts || []).map(p => ({ x: clamp(fx(p && p.x), 0, 1), y: clamp(fy(p && p.y), 0, 1) })) })) };
  }
  if (empty) { const b = newBoard(slug, space); return { ...b, ...(out.__steps ? { __steps: out.__steps } : {}), ...(out.__ann ? { __ann: out.__ann } : {}) }; }
  if (slug === 'clock') {
    // The old clock board: a start clock and an end clock (or one), and a tracker of minutes.
    const c1 = rest.c1 || { h: 9, m: 15 }, c2 = rest.c2 || { h: 11, m: 45 };
    const a = { id: oid(), k: 'clock', x: at.x, y: at.y, s: 1, st: { h: c1.h, m: c1.m, start: !rest.two && num(rest.tracker) > 0 ? addMinutes(c1, -num(rest.tracker)) : null, label: rest.two ? 'Start' : '' } };
    out.objects.push(a);
    if (rest.two !== false) { a.st.start = null; out.objects.push({ id: oid(), k: 'clock', x: at.x + 290, y: at.y, s: 1, st: { h: c2.h, m: c2.m, start: { h: c1.h, m: c1.m }, label: 'End' } }); }
    return out;
  }
  if (objectTool(slug)) { out.objects.push({ id: oid(), k: slug, x: at.x, y: at.y, s: 1, st: rest }); return out; }
  // A piece tool: its settings stay on the board, its pieces move with it; the place-value chart (base ten, whole
  // numbers) and the counters' frame were drawn on the board: they become objects where they were.
  const { pieces, frame, ...settings } = rest;
  Object.assign(out, settings);
  out.pieces = (Array.isArray(pieces) ? pieces : []).filter(p => p && typeof p === 'object').map(p => ({ ...p, x: num(p.x) + at.x, y: num(p.y) + at.y }));
  if (slug === 'base-ten-blocks' && !rest.decimal) { const z = pvSize({ cols: PV10 }); out.objects.push({ id: oid(), k: 'pv-chart', x: at.x + 8, y: at.y + old.h - z.h - 8, s: 1, st: { cols: PV10 } }); }
  if (slug === 'two-color-counters' && +frame) { const k = +frame === 5 ? 'five-frame' : 'ten-frame'; out.objects.push({ id: oid(), k, x: at.x + 12, y: at.y + 34, s: 1, st: { n: +frame === 5 ? 5 : 10 } }); }
  return out;
}

// ---------------------------------------------------------------- places: free spots, fitting into a square
/** Everything on a board as rectangles in its space (objects, pieces, notes and texts). */
export function boxesOf(slug, b, space, { noteW = 176, noteH = 110 } = {}) {
  const ann = b.__ann || {};
  return [...(b.objects || []).map(o => objRect(slug, o)), ...(b.pieces || []).map(p => ({ x: num(p.x), y: num(p.y), w: num(p.w, 40), h: num(p.h, 40) })),
    ...(ann.notes || []).map(n => ({ x: num(n.x) * space.w, y: num(n.y) * space.h, w: noteW, h: noteH })),
    ...(ann.texts || []).map(n => textRect(n, space))];
}
export function bbox(boxes) {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y)), x1 = Math.max(...boxes.map(b => b.x + b.w)), y1 = Math.max(...boxes.map(b => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
/** A free place for a w x h thing inside region (a rectangle of the space: the part on screen, or a square). The
 *  region's own free-spot search, shifted; a full region: the least crowded spot. -> { x, y } */
export function spotIn(boxes, w, h, region, { gap = 16 } = {}) {
  const local = boxes.map(b => ({ x: b.x - region.x, y: b.y - region.y, w: b.w, h: b.h }));
  const at = freeSpot(local, w, h, region.w, region.h, { margin: 16, gap, step: 12 });
  return { x: Math.round(region.x + at.x), y: Math.round(region.y + at.y) };
}
/**
 * Where a piece added from the palette goes: right after the last piece added from the palette (same row, a small even
 * gap, centers lined up), stepping on to the right past anything in the way, and to a new row under the start of the
 * run (left-aligned with it) when the row would leave the region (the part of the board on screen, or the square).
 * When that last piece sits in an object's slot (a frame's cell, a chart's column), a piece of the same kind fills that
 * object's next free slot first. Nothing before (or the last piece is gone): the region's first free spot.
 * A place-value chart is in the way of both (a block is never dropped on its heading, nor into a column it happens to
 * land in, where it could be traded): the first block goes beside or under the chart; a block of the same value as the
 * one before it follows that one into its column (manip-pv.js sameValueHome, before this).
 * last: { id, runX } | null. -> { x, y, runX, full } (full: no free spot was left in the region; the place is a
 * fallback that may cover something: manip-pv.js paletteAdd then tries the chart's column for the block's value)
 */
export const ROW_GAP = 6;
export function nextPieceSpot(slug, b, d, region, last) {
  const pieces = b.pieces || [], L = last && pieces.find(p => p.id === last.id);
  const charts = (b.objects || []).filter(o => o.k === 'pv-chart').map(o => ({ ...objRect(slug, o), head: OBJ_HEAD * num(o.s, 1) }));
  const inSlots = [...pieces.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h })), ...(b.objects || []).filter(o => !UNDER.has(o.k)).map(o => objRect(slug, o))];
  const obstacles = [...charts, ...inSlots];   // charts first: a full region's fallback steps on from the last piece
  const clearOf = list => (x, y) => !list.some(o => x < o.x + o.w + ROW_GAP - 1 && x + d.w + ROW_GAP - 1 > o.x && y < o.y + o.h + ROW_GAP - 1 && y + d.h + ROW_GAP - 1 > o.y);
  const free = clearOf(obstacles), freeInSlot = clearOf(inSlots);
  const inside = (x, y) => x >= region.x && y >= region.y && x + d.w <= region.x + region.w && y + d.h <= region.y + region.h;
  if (L) {
    const cx = L.x + L.w / 2, cy = L.y + L.h / 2;
    // In an object's slot: the same kind fills the next free slot of that object.
    if (L.kind === d.kind) for (const o of b.objects || []) {
      const slots = slotsOf(slug, o), at = slots.findIndex(sl => cx >= sl.x && cx <= sl.x + sl.w && cy >= sl.y && cy <= sl.y + sl.h); if (at < 0) continue;
      const sl = slots[at];
      if (sl.kind === 'cell') {
        const used = sl2 => pieces.some(p => { const px = p.x + p.w / 2, py = p.y + p.h / 2; return px >= sl2.x && px <= sl2.x + sl2.w && py >= sl2.y && py <= sl2.y + sl2.h; });
        const next = [...slots.slice(at + 1), ...slots.slice(0, at)].find(x => !used(x));
        if (next) return { x: Math.round(next.x + (next.w - d.w) / 2), y: Math.round(next.y + (next.h - d.h) / 2), runX: last.runX };
      } else {
        const x = Math.round(sl.x + (sl.w - d.w) / 2);
        for (let y = L.y + L.h + 4; y + d.h <= sl.y + sl.h; y += 4) if (freeInSlot(x, y)) return { x, y: Math.round(y), runX: last.runX };
      }
    }
    // The row: right of the last piece, centers lined up; wrap under the run's start.
    const runX = Number.isFinite(last.runX) ? last.runX : L.x;
    let x = L.x + L.w + ROW_GAP, mid = cy, rowH = Math.max(L.h, d.h);
    for (let i = 0; i < 400; i++) {
      const y = Math.round(mid - d.h / 2);
      if (x + d.w > region.x + region.w || x + d.w > region.x + region.w) { x = runX; mid += rowH + ROW_GAP + 4; rowH = d.h; if (mid - d.h / 2 + d.h > region.y + region.h) break; continue; }
      if (inside(x, y) && free(x, y)) return { x: Math.round(x), y, runX };
      x += 4;
    }
  }
  const at = spotIn(obstacles, d.w, d.h, region), full = !(inside(at.x, at.y) && free(at.x, at.y));
  // A full region: spotIn's fallback may still land on a chart; then under it (never on its heading).
  for (const c of charts) if (at.x < c.x + c.w && at.x + d.w > c.x && at.y < c.y + c.head && at.y + d.h > c.y) at.y = Math.round(c.y + c.h + ROW_GAP);
  return { x: at.x, y: at.y, runX: at.x, ...(full ? { full: true } : {}) };
}
/** The free spot for a w x h thing inside region nearest the board's content (the box around boxes), on a 12 px grid,
 *  the top left first on a tie; nothing there: the region's first free spot. clear(x, y): free of everything (with
 *  its gap). -> { x, y } | null (no free spot in the region) */
export function nearContent(boxes, w, h, region, clear, { margin = 16, step = 12 } = {}) {
  const all = bbox(boxes), x0 = region.x + margin, y0 = region.y + margin, x1 = region.x + region.w - w - margin, y1 = region.y + region.h - h - margin;
  if (x1 < x0 || y1 < y0) return null;
  const dist = (x, y) => (all ? Math.hypot(Math.max(0, all.x - (x + w), x - (all.x + all.w)), Math.max(0, all.y - (y + h), y - (all.y + all.h))) : 0);
  let best = null;
  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    if (!clear(x, y)) continue;
    const d = dist(x, y); if (!best || d < best.d - 0.5) best = { x: Math.round(x), y: Math.round(y), d };
    if (!all) return { x: best.x, y: best.y };
  }
  return best ? { x: best.x, y: best.y } : null;
}
/** A new object in the next free spot of region, made smaller if it does not fit (never below S_MIN). -> object */
export function placeObject(slug, b, k, region, space) {
  const K = kindOf(slug, k); if (!K) return null;
  const z = K.size(K.init()), s = Math.max(S_MIN, Math.min(1, (region.w - 32) / z.w, (region.h - 32) / z.h));
  const boxes = boxesOf(slug, b, space), w = z.w * s, h = z.h * s, G = 24;
  // First choice: beside an object already there (same top), then under one; else the region's first free spot.
  const inside = (x, y, r) => x >= r.x && y >= r.y && x + w <= r.x + r.w && y + h <= r.y + r.h;
  const clear = (x, y) => !boxes.some(o => x < o.x + o.w + G - 1 && x + w + G - 1 > o.x && y < o.y + o.h + G - 1 && y + h + G - 1 > o.y);
  const objs = (b.objects || []).map(o => objRect(slug, o));
  const tries = [...objs.map(r => ({ x: r.x + r.w + G, y: r.y })), ...objs.map(r => ({ x: r.x, y: r.y + r.h + G }))];
  const all = { x: 0, y: 0, w: space.w, h: space.h };
  // In view if there is room (the free spot nearest what is already there: a mat added beside loose pieces, never in a
  // far corner of the view); else beside or under an object anywhere (the page then brings it into view); else the
  // space's first free spot. One gap for all of them (a spot found with a smaller gap than clear() asks for was turned
  // down, and the mat went to the plane's top left with a fit that zoomed far out: seen recording, 25 Nov 2026).
  const inView = nearContent(boxes, w, h, region, clear);
  const at = tries.find(p => inside(p.x, p.y, region) && clear(p.x, p.y)) || inView || tries.find(p => inside(p.x, p.y, all) && clear(p.x, p.y)) || spotIn(boxes, w, h, all, { gap: G });
  return newObject(slug, k, clamp(at.x, 0, space.w - z.w * s), clamp(at.y, 0, space.h - z.h * s), Math.round(s * 1000) / 1000);
}
/**
 * A board made in one space put into another (a session started from a saved board: the teacher's area; a pushed board:
 * a student's square). Everything is scaled by ONE factor, places and sizes alike (no object keeps a minimum size inside
 * the group, so nothing overlaps), and moved to the top left. A practice board (it carries its `grid`) is laid out
 * again in as many columns as fit at a readable size (KMIN at least), keeping its gaps. grow: the space may get taller
 * (then only the width limits the scale). -> { board, w, h } (h: the height it needs, padding included)
 */
export function fitInto(slug, b, from, to, { grow = false, pad = 12 } = {}) {
  const src = JSON.parse(JSON.stringify(b)), g = src.grid;
  const W = to.w - pad * 2, H = to.h - pad * 2;
  let place = null, bw, bh;   // place(x, y, cell) -> the point in the grid's new layout (unscaled), origin at 0, 0
  if (g && g.n && g.cw && g.ch) {
    const size = c => { const rows = Math.ceil(g.n / c); return { w: c * g.cw + (c - 1) * g.gx, h: g.title + rows * g.ch + (rows - 1) * g.gy }; };
    const kOf = c => { const z = size(c); return Math.min(1, W / z.w, grow ? Infinity : H / z.h); };
    // The most columns that keep a readable size; if none does, the one with the biggest scale.
    let cols = 0;
    for (let c = Math.min(g.cols, g.n); c >= 1; c--) if (kOf(c) >= KMIN) { cols = c; break; }
    if (!cols) { cols = 1; for (let c = 1; c <= Math.min(g.cols, g.n); c++) if (kOf(c) > kOf(cols)) cols = c; }
    const z = size(cols); bw = z.w; bh = z.h;
    place = (x, y, cell) => {
      if (!(cell >= 0)) return { x: x - g.x0, y: y - g.y0 };
      const oc = cell % g.cols, or = Math.floor(cell / g.cols), nc = cell % cols, nr = Math.floor(cell / cols);
      return { x: x - g.x0 - oc * (g.cw + g.gx) + nc * (g.cw + g.gx), y: y - g.y0 - or * (g.ch + g.gy) + nr * (g.ch + g.gy) };
    };
    src.grid = { ...g, cols, x0: pad, y0: pad, fitted: true };
  } else {
    const ann0 = src.__ann || {};
    const marks = (ann0.strokes || []).flatMap(s => (s.pts || []).map(p => ({ x: num(p.x) * from.w, y: num(p.y) * from.h, w: 1, h: 1 })));
    const box = bbox([...boxesOf(slug, src, from), ...marks]) || { x: 0, y: 0, w: 1, h: 1 };
    bw = box.w; bh = box.h; place = (x, y) => ({ x: x - box.x, y: y - box.y });
  }
  const k = Math.min(1, W / Math.max(1, bw), grow ? Infinity : H / Math.max(1, bh));
  const map = (x, y, cell) => { const p = place(x, y, cell); return { x: pad + p.x * k, y: pad + p.y * k }; };
  const cellOf = st => (st && Number.isInteger(st.cell) ? st.cell : -1);
  for (const o of src.objects || []) { const p = map(num(o.x), num(o.y), cellOf(o.st)); o.x = Math.round(p.x * 10) / 10; o.y = Math.round(p.y * 10) / 10; o.s = Math.round(Math.max(S_FLOOR, num(o.s, 1) * k) * 1000) / 1000; }
  for (const p of src.pieces || []) { const q = map(num(p.x), num(p.y), Number.isInteger(p.cell) ? p.cell : -1); p.x = Math.round(q.x * 10) / 10; p.y = Math.round(q.y * 10) / 10; p.w = Math.max(4, Math.round(num(p.w, 40) * k)); p.h = Math.max(4, Math.round(num(p.h, 40) * k));
    // A block made smaller in a chart's column keeps its own size (manip-pv.js), at the same scale.
    if (p.nw !== undefined) p.nw = Math.max(4, Math.round(num(p.nw, 40) * k)); if (p.nh !== undefined) p.nh = Math.max(4, Math.round(num(p.nh, 40) * k)); }
  const outH = grow ? Math.ceil(pad * 2 + bh * k) : to.h, out = { w: to.w, h: Math.max(outH, 1) };
  const ann = src.__ann;
  if (ann) {
    const f = n => { const p = map(num(n.x) * from.w, num(n.y) * from.h, Number.isInteger(n.cell) ? n.cell : -1); return { ...n, x: Math.min(1, Math.max(0, p.x / out.w)), y: Math.min(1, Math.max(0, p.y / out.h)) }; };
    ann.notes = (ann.notes || []).map(f); ann.texts = (ann.texts || []).map(f);
    ann.strokes = (ann.strokes || []).map(s => ({ ...s, pts: (s.pts || []).map(f) }));
    delete ann.size;
  }
  return { board: src, w: out.w, h: out.h, k };
}
/**
 * A board made in one space shown in another (a solo board pushed into a room square, or a session started from a
 * saved board): everything moved to the top left of the new space and made smaller, all together, if it would not fit.
 * Notes, texts and marks stay fractions, of the new space. -> a new board
 */
export function reframe(slug, b, from, to, pad = 12) { return fitInto(slug, b, from, to, { pad }).board; }

// ---------------------------------------------------------------- magnetic drops (pieces snap together and into slots)
/** How close (screen pixels) a dropped piece must be to snap. The plane's distance is this over the zoom. */
export const SNAP_PX = 14;
/** Round pieces, per tool (a piece kind means something only inside its tool: base ten's 'tenth' is a long block, place
 *  value disks' 'tenth' is a disk). Money's bills (b1, b5...) are not round. */
const ROUND_KINDS = { 'two-color-counters': /^(pos|neg|blue|green)$/, 'place-value-disks': /^(m|hth|tth|th|h|t|o|tenth|hund|thou)$/, money: /^(penny|nickel|dime|quarter)$/ };
const ROUNDISH = /^(pos|neg|blue|green|m|hth|tth|th|h|t|o|tenth|hund|thou|penny|nickel|dime|quarter)$/;
/** Is a piece of this kind drawn round in this tool? (No tool given: any round kind, the old rule.) */
export const roundPiece = (slug, kind) => (slug ? !!(ROUND_KINDS[slug] && ROUND_KINDS[slug].test(String(kind || ''))) : ROUNDISH.test(String(kind || '')));
/** A piece's rectangle as it lies (a quarter turn swaps width and height). null when turned at an odd angle (no snap). */
export function pieceBox(p, slug = null) {
  const r = ((Math.round(num(p.rot)) % 360) + 360) % 360;
  if (r % 90) return null;
  const turn = r % 180 === 90, w = num(p.w, 40), h = num(p.h, 40);
  return { id: p.id, x: num(p.x) + (turn ? (w - h) / 2 : 0), y: num(p.y) + (turn ? (h - w) / 2 : 0), w: turn ? h : w, h: turn ? w : h, round: roundPiece(slug, p.kind) };
}
/** Places on an object that pieces drop into: a place-value chart's columns, a frame's cells. [{ x, y, w, h, kind }] */
export function slotsOf(slug, o) {
  const s = num(o.s, 1), X = num(o.x), Y = num(o.y);
  if (o.k === 'pv-chart') {
    const cols = Array.isArray(o.st && o.st.cols) ? o.st.cols : PV10;
    return cols.map((_, i) => ({ kind: 'column', x: X + (PV_COL.pad + i * (PV_COL.w + PV_COL.gap)) * s, y: Y + (OBJ_HEAD + PV_COL.pad) * s, w: PV_COL.w * s, h: PV_COL.h * s }));
  }
  if (o.k === 'ten-frame' || o.k === 'five-frame') {
    const n = o.k === 'five-frame' ? 5 : 10;
    return Array.from({ length: n }, (_, i) => ({ kind: 'cell', x: X + (10 + (i % 5) * CELL) * s, y: Y + (OBJ_HEAD + 10 + Math.floor(i / 5) * CELL) * s, w: CELL * s, h: CELL * s }));
  }
  if (o.k === 'double-ten-frame') {
    // Two ten-frames side by side (12 px apart): cells 0-9 the left one, 10-19 the right one.
    return Array.from({ length: 20 }, (_, i) => { const f = Math.floor(i / 10), j = i % 10; return { kind: 'cell', x: X + (10 + f * (5 * CELL + 12) + (j % 5) * CELL) * s, y: Y + (OBJ_HEAD + 10 + Math.floor(j / 5) * CELL) * s, w: CELL * s, h: CELL * s }; });
  }
  return [];
}
const overlap1 = (a0, a1, b0, b1, t) => a0 < b1 + t && b0 < a1 + t;
/**
 * Where a dropped piece (or group) should snap. moving: the pieces being dragged, at their dropped places (the one held
 * first); others: the other pieces in the SAME space (a square's own pieces only: never a classmate's or the
 * teacher's); slots: from slotsOf; t: the snap distance in plane pixels. Flush edge to edge with another piece (side by
 * side, end to end, on top of or under it), lined up with its top, middle or bottom (left, middle or right) when that is
 * close too; else into a slot (a frame's cell: centered; a chart's column: centered across it). Nothing in reach: null.
 * -> null | { dx, dy, to (the piece id snapped to) | null, slot }
 */
export function snapFor(moving, others, slots, t, { link = true, slug = null } = {}) {
  const boxes = moving.map(p => pieceBox(p, slug)); if (boxes.some(b => !b)) return null;
  const ids = new Set(moving.map(p => p.id));
  let best = null;
  const offer = (dx, dy, to, slot) => { const d = Math.hypot(dx, dy); if (!best || d < best.d) best = { dx, dy, to, slot, d }; };
  // Dropped in a place-value chart's column: the column lays its blocks out (manip-pv.js), so no edge-to-edge snap
  // (that pulled blocks out over the column's edge).
  const h0 = boxes[0], inColumn = slots.some(s => s.kind === 'column' && h0.x + h0.w / 2 >= s.x && h0.x + h0.w / 2 <= s.x + s.w && h0.y + h0.h / 2 >= s.y && h0.y + h0.h / 2 <= s.y + s.h);
  for (const q0 of link && !inColumn ? others : []) {
    if (ids.has(q0.id)) continue;
    const q = pieceBox(q0, slug); if (!q) continue;
    for (const a of boxes) {
      const cross = (a0, aw, b0, bw, round) => {
        const opts = round ? [b0 + (bw - aw) / 2] : [b0, b0 + (bw - aw) / 2, b0 + bw - aw];
        let c = null; for (const o of opts) if (Math.abs(o - a0) <= t && (c === null || Math.abs(o - a0) < Math.abs(c - a0))) c = o;
        return c === null ? a0 : c;
      };
      const round = a.round && q.round;
      if (overlap1(a.y, a.y + a.h, q.y, q.y + q.h, 0)) {
        for (const x of [q.x + q.w, q.x - a.w]) if (Math.abs(x - a.x) <= t) offer(x - a.x, cross(a.y, a.h, q.y, q.h, round) - a.y, q.id, null);
      }
      if (overlap1(a.x, a.x + a.w, q.x, q.x + q.w, 0)) {
        for (const y of [q.y + q.h, q.y - a.h]) if (Math.abs(y - a.y) <= t) offer(cross(a.x, a.w, q.x, q.w, round) - a.x, y - a.y, q.id, null);
      }
    }
  }
  if (best) { const { dx, dy, to } = best; return { dx, dy, to, slot: null }; }
  // No piece in reach: a slot under the held piece's middle.
  const a = boxes[0], cx = a.x + a.w / 2, cy = a.y + a.h / 2;
  // Pieces that never link (two-color counters): only an empty cell (no other piece's middle in it).
  const taken = s => others.some(q => !ids.has(q.id) && num(q.x) + num(q.w, 40) / 2 >= s.x && num(q.x) + num(q.w, 40) / 2 <= s.x + s.w && num(q.y) + num(q.h, 40) / 2 >= s.y && num(q.y) + num(q.h, 40) / 2 <= s.y + s.h);
  for (const s of slots) {
    if (cx < s.x - t || cx > s.x + s.w + t || cy < s.y - t || cy > s.y + s.h + t) continue;
    if (!link && (s.kind !== 'cell' || taken(s))) continue;
    if (s.kind === 'cell') offer(s.x + (s.w - a.w) / 2 - a.x, s.y + (s.h - a.h) / 2 - a.y, null, s);
    else offer(s.x + (s.w - a.w) / 2 - a.x, clamp(a.y, s.y, s.y + s.h - a.h) - a.y, null, s);
  }
  return best ? { dx: best.dx, dy: best.dy, to: null, slot: best.slot } : null;
}
/** The pieces that move together with p: its snapped group (pieces sharing p.g), else p alone. */
export const groupOf = (pieces, p) => (p && p.g ? pieces.filter(q => q.g === p.g) : p ? [p] : []);
/** Do a tool's pieces link to each other? Two-color counters never do (owner, 21 Nov 2026): a counter snaps only into
 *  an empty frame cell and stays exactly where it is dropped anywhere else, even right beside another counter. */
export const linksPieces = slug => slug !== 'two-color-counters';
/** The options snapFor takes for a tool. */
export const snapOpts = slug => ({ link: linksPieces(slug), slug });
/** Frames whose counters move with them when the frame is dragged. */
export const FRAMES = new Set(['ten-frame', 'five-frame', 'double-ten-frame']);
/** The pieces seated in an object's cells (a piece's middle inside one of its cell slots), locked pieces left out. */
export function seatedIn(slug, o, pieces) {
  const cells = slotsOf(slug, o).filter(s => s.kind === 'cell');
  return (pieces || []).filter(p => !p.locked && cells.some(s => { const cx = num(p.x) + num(p.w, 40) / 2, cy = num(p.y) + num(p.h, 40) / 2; return cx >= s.x && cx <= s.x + s.w && cy >= s.y && cy <= s.y + s.h; }));
}
// ---------------------------------------------------------------- selecting many at once (a selection box, Shift+click)
// A selection is { p: Set(piece ids), o: Set(object ids) }; the solo board and the room keep one each (the room's per square).
/** The rectangle between two corners. */
export const rectFrom = (a, b) => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
/** A piece's box as it lies, at any turn (the box around its turned corners). */
export function pieceRect(p) {
  const b = pieceBox(p); if (b) return b;
  const a = (num(p.rot) * Math.PI) / 180, w = num(p.w, 40), h = num(p.h, 40), c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a)), W = w * c + h * s, H = w * s + h * c;
  return { x: num(p.x) + (w - W) / 2, y: num(p.y) + (h - H) / 2, w: W, h: H };
}
/** What a selection box r takes (owner, 25 Nov 2026): every unlocked piece and object whose box meets it. Locked ones
 *  (backdrops start locked) never. -> a selection */
export const inRect = (slug, b, r) => ({ p: new Set((b.pieces || []).filter(p => !p.locked && meets(pieceRect(p), r)).map(p => p.id)), o: new Set((b.objects || []).filter(o => !o.locked && meets(objRect(slug, o), r)).map(o => o.id)) });
/** How many things a selection holds (null: none). */
export const selCount = m => (m ? m.p.size + m.o.size : 0);
/** The selection with what is still on the board and unlocked. */
export const selKeep = (b, m) => ({ p: new Set((b.pieces || []).filter(p => m.p.has(p.id) && !p.locked).map(p => p.id)), o: new Set((b.objects || []).filter(o => m.o.has(o.id) && !o.locked).map(o => o.id)) });
/** Everything a drag of the selection moves, at its start: its pieces (with their snapped groups) and objects, and what each object takes along
 *  (carry(o): an unlocked frame's seated counters, a chart's blocks), each once. -> [{ it, obj, x0, y0, r }] */
export function selMoving(slug, b, m, carry = () => []) {
  const objs = (b.objects || []).filter(o => m.o.has(o.id) && !o.locked), ps = new Set((b.pieces || []).filter(p => m.p.has(p.id) && !p.locked));
  for (const p of [...ps]) for (const q of groupOf(b.pieces, p)) if (!q.locked) ps.add(q);   // a snapped group stays whole
  for (const o of objs) for (const p of carry(o)) ps.add(p);
  return [...objs.map(o => ({ it: o, obj: true, x0: num(o.x), y0: num(o.y), r: objRect(slug, o) })), ...[...ps].map(p => ({ it: p, obj: false, x0: num(p.x), y0: num(p.y), r: { x: num(p.x), y: num(p.y), w: num(p.w, 40), h: num(p.h, 40) } }))];
}
/** Move a selection by (dx, dy) plane pixels from where it started, all of it kept inside space (no snapping). */
export function selMove(list, dx, dy, space) {
  const b = bbox(list.map(x => x.r)); if (!b) return;
  const ddx = clamp(dx, -b.x, space.w - b.x - b.w), ddy = clamp(dy, -b.y, space.h - b.y - b.h);
  for (const x of list) { x.it.x = Math.round(x.x0 + ddx); x.it.y = Math.round(x.y0 + ddy); }
}
/** Delete a selection's unlocked pieces and objects (a snapped group left with one piece is no group). -> how many went */
export function selDelete(b, m) {
  const k = selKeep(b, m), n = selCount(k);
  b.objects = (b.objects || []).filter(o => !k.o.has(o.id));
  if (Array.isArray(b.pieces)) {
    const hit = new Set(b.pieces.filter(p => k.p.has(p.id) && p.g).map(p => p.g));
    b.pieces = b.pieces.filter(p => !k.p.has(p.id));
    for (const g of hit) splitGroup(b.pieces, g);
  }
  return n;
}
/** A free place right beside r (under it, right of it, above, left, then below right), inside region, gap px apart
 *  from everything in boxes. -> { x, y } | null */
export function besideSpot(boxes, r, region, gap = 10, order = 'below') {
  const w = num(r.w, 40), h = num(r.h, 40), x = num(r.x), y = num(r.y), G = gap;
  const free = (ax, ay) => ax >= region.x && ay >= region.y && ax + w <= region.x + region.w && ay + h <= region.y + region.h && !boxes.some(o => ax < o.x + o.w + G - 1 && ax + w + G - 1 > o.x && ay < o.y + o.h + G - 1 && ay + h + G - 1 > o.y);
  const below = [0, h + G], right = [w + G, 0], above = [0, -h - G], left = [-w - G, 0], diag = [w + G, h + G];
  for (const [dx, dy] of order === 'right' ? [right, below, left, above, diag] : [below, right, above, left, diag]) if (free(x + dx, y + dy)) return { x: Math.round(x + dx), y: Math.round(y + dy) };
  return null;
}
/** Is a w x h box at (x, y) clear of everything in boxes (gap px apart)? */
const clearAt = (boxes, x, y, w, h, gap) => !boxes.some(o => x < o.x + o.w + gap - 1 && x + w + gap - 1 > o.x && y < o.y + o.h + gap - 1 && y + h + gap - 1 > o.y);
/** A copy's place: right beside the original (under it, right of it, above, left) inside region (the part on screen);
 *  else a free spot in region; else beside it anywhere in space (the page then shows it); else the region's free-spot
 *  search. Never on top of the original (seen recording, 25 Nov 2026: a copy 24 px down and right of its original).
 *  boxes: everything on the board. order: 'below' (pieces) or 'right' (objects) first. -> { x, y } */
export function nearSpot(boxes, p, region, space = null, { gap = 10, order = 'below' } = {}) {
  const w = num(p.w, 40), h = num(p.h, 40);
  const near = besideSpot(boxes, p, region, gap, order); if (near) return near;
  const inView = spotIn(boxes, w, h, region, { gap });
  const okView = inView.x >= region.x && inView.y >= region.y && inView.x + w <= region.x + region.w && inView.y + h <= region.y + region.h && clearAt(boxes, inView.x, inView.y, w, h, gap);
  if (okView) return inView;
  const far = space && besideSpot(boxes, p, { x: 0, y: 0, w: space.w, h: space.h }, gap, order); if (far) return far;
  return space ? spotIn(boxes, w, h, { x: 0, y: 0, w: space.w, h: space.h }, { gap }) : inView;
}
/** After a piece left a group (lifted, turned, deleted): the pieces still in it that no longer touch one another become
 *  groups of their own, by adjacency (edges within 2 px, overlapping along the edge); a piece left alone is in no group.
 *  The largest part keeps the group's id. pieces: the board's pieces (changed in place). */
export function splitGroup(pieces, g, newGid = i => `${g}.${i}`) {
  if (!g) return;
  const m = pieces.filter(p => p.g === g); if (!m.length) return;
  const box = p => pieceBox(p) || { x: num(p.x), y: num(p.y), w: num(p.w, 40), h: num(p.h, 40) };
  const bs = m.map(box), T = 2;
  const touch = (a, b) => a.x <= b.x + b.w + T && b.x <= a.x + a.w + T && a.y <= b.y + b.h + T && b.y <= a.y + a.h + T
    && (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > T || Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > T);
  const seen = new Array(m.length).fill(false), parts = [];
  for (let i = 0; i < m.length; i++) {
    if (seen[i]) continue;
    const part = [], todo = [i]; seen[i] = true;
    while (todo.length) { const k = todo.pop(); part.push(k); for (let j = 0; j < m.length; j++) if (!seen[j] && touch(bs[k], bs[j])) { seen[j] = true; todo.push(j); } }
    parts.push(part);
  }
  parts.sort((a, b) => b.length - a.length);
  let n = 0;
  parts.forEach((part, pi) => {
    if (part.length < 2) { for (const k of part) delete m[k].g; return; }
    if (pi === 0) return;
    let id; do { id = newGid(++n); } while (pieces.some(p => p.g === id));
    for (const k of part) m[k].g = id;
  });
}

// ---------------------------------------------------------------- the AI draft's layout (the code decides WHERE)
/**
 * Places for a drafted lesson: the objects in a tidy row (wrapping after 3), evenly spaced and centered, a short label
 * above each one that has one, the pieces under them grouped by kind in rows (one kind a row, wrapping), and the title
 * above it all. Nothing overlaps; everything sits inside `space`, around its middle (one Fit shows it all).
 * draft: { title, objects: [{ k, label, st }], pieces: [{ kind, count }] }; defs: the tool's piece kinds (sizes).
 * -> { objects, pieces: [{ kind, x, y }], texts: [{ text, x, y }] } in plane pixels
 */
export function draftLayout(slug, draft, defs, space = WORLD) {
  const GAP = 48, LABEL = 34, TITLE = 54, PGAP = 10, ROWW = 1500;
  const objs = (draft.objects || []).map(d => { const K = kindOf(slug, d.k); return K ? { d, z: K.size({ ...K.init(), ...(d.st || {}) }) } : null; }).filter(Boolean);
  const rows = []; for (let i = 0; i < objs.length; i += 3) rows.push(objs.slice(i, i + 3));
  const anyLabel = objs.some(x => x.d.label);
  const rowW = r => r.reduce((s, x) => s + x.z.w, 0) + (r.length - 1) * GAP;
  const rowH = r => Math.max(...r.map(x => x.z.h)) + (anyLabel ? LABEL : 0);
  // Pieces: one kind a row, wrapping at ROWW.
  const kinds = (draft.pieces || []).map(p => ({ def: defs.find(x => x.kind === p.kind), n: p.count })).filter(x => x.def && x.n > 0);
  const prow = []; for (const { def, n } of kinds) {
    const per = Math.max(1, Math.floor((ROWW + PGAP) / (def.w + PGAP)));
    for (let i = 0; i < n; i += per) prow.push({ def, n: Math.min(per, n - i) });
  }
  const pW = prow.length ? Math.max(...prow.map(r => r.n * r.def.w + (r.n - 1) * PGAP)) : 0;
  const pH = prow.reduce((s, r) => s + r.def.h + PGAP * 2, 0);
  const W = Math.max(pW, ...rows.map(rowW), 0), H = TITLE + rows.reduce((s, r) => s + rowH(r) + GAP, 0) + pH;
  const x0 = Math.round((space.w - W) / 2), y0 = Math.round(Math.max(16, (space.h - H) / 2));
  const out = { objects: [], pieces: [], texts: [] };
  if (draft.title) out.texts.push({ text: draft.title, x: x0, y: y0 });
  let y = y0 + TITLE;
  for (const r of rows) {
    let x = x0 + Math.round((W - rowW(r)) / 2);
    for (const { d, z } of r) {
      if (d.label) out.texts.push({ text: d.label, x, y });
      const K = kindOf(slug, d.k), o = newObject(slug, d.k, x, y + (anyLabel ? LABEL : 0), 1); o.st = { ...K.init(), ...(d.st || {}) };
      out.objects.push(o); x += z.w + GAP;
    }
    y += rowH(r) + GAP;
  }
  for (const r of prow) {
    let x = x0 + Math.round((W - (r.n * r.def.w + (r.n - 1) * PGAP)) / 2);
    for (let i = 0; i < r.n; i++) { out.pieces.push({ kind: r.def.kind, x, y: y + PGAP }); x += r.def.w + PGAP; }
    y += r.def.h + PGAP * 2;
  }
  return out;
}
/** Every kind of piece a tool can hold (for cleaning and for the drafter). */
export const pieceKinds = slug => new Set(allPieceDefs(slug).map(d => d.kind));
