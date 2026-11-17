// Classroom dashboards: bar models and number rods (docs/decisions.md "Bar models and number rods"). The maths behind
// both tools, pure (no DOM, no network, no storage) and tested in tests/unit/dash-bars-rods.test.js. The limits here
// are the ones server/services/dash-tools.js cleans to (tested to agree).

const randInt = (rnd, lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
const sum = a => a.reduce((s, x) => s + x, 0);
const sameBag = (a, b) => a.length === b.length && [...a].sort((x, y) => x - y).every((x, i) => x === [...b].sort((p, q) => p - q)[i]);

// ================================================================ bar models
/** Multiply/divide (groups × each = total), part–whole (parts make a whole) and compare (two bars and their difference). */
export const BAR_KINDS = ['mul', 'part', 'cmp'];
/** groups 1-12, in each 1-100, parts 2-4 of 1-999, the two compared bars 1-999, "New problem" up to max (10-1000). */
export const BAR_LIMITS = { g: [1, 12], e: [1, 100], n: [2, 4], v: [1, 999], max: [10, 1000] };
/** The starting state (also server/services/dash-tools.js TOOL_SPECS.bars, tested to agree). */
export const BAR_START = { kind: 'mul', g: 3, e: 4, p: [5, 3], ca: 9, cb: 5, unk: 0, hide: true, bw: true, bp: true, max: 50, story: '' };

/**
 * The model a bar state shows: its quantities, in the order the "What is unknown?" menu lists them (the first is the
 * one asked by default), and which is unknown.
 * mul: total, groups, each. part: whole, then each part. cmp: difference, the first bar, the second bar.
 * -> { kind, slots: [{ key, value }], unk (index), answer, whole }
 */
export function barModel(st) {
  const kind = BAR_KINDS.includes(st.kind) ? st.kind : 'mul';
  let slots;
  if (kind === 'mul') slots = [{ key: 'total', value: st.g * st.e }, { key: 'groups', value: st.g }, { key: 'each', value: st.e }];
  else if (kind === 'part') slots = [{ key: 'whole', value: sum(st.p) }, ...st.p.map((v, i) => ({ key: `p${i}`, value: v }))];
  else slots = [{ key: 'diff', value: Math.abs(st.ca - st.cb) }, { key: 'a', value: st.ca }, { key: 'b', value: st.cb }];
  const unk = Number.isInteger(st.unk) && st.unk >= 0 && st.unk < slots.length ? st.unk : 0;
  return { kind, slots, unk, answer: slots[unk].value, whole: kind === 'cmp' ? Math.max(st.ca, st.cb) : slots[0].value };
}

/** A state brought within the limits (the browser's copy of the server's rules). */
export function clampBars(st) {
  const c = (v, [lo, hi], d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, Math.round(+v))) : d);
  const s = { ...BAR_START, ...st };
  s.kind = BAR_KINDS.includes(s.kind) ? s.kind : 'mul';
  s.g = c(s.g, BAR_LIMITS.g, 3); s.e = c(s.e, BAR_LIMITS.e, 4);
  s.p = (Array.isArray(s.p) ? s.p : BAR_START.p).slice(0, BAR_LIMITS.n[1]).map(v => c(v, BAR_LIMITS.v, 1));
  while (s.p.length < BAR_LIMITS.n[0]) s.p.push(1);
  s.ca = c(s.ca, BAR_LIMITS.v, 9); s.cb = c(s.cb, BAR_LIMITS.v, 5);
  s.max = c(s.max, BAR_LIMITS.max, 50);
  const n = barModel(s).slots.length; if (!(Number.isInteger(s.unk) && s.unk >= 0 && s.unk < n)) s.unk = 0;
  return s;
}

/**
 * The number sentences under a model: which sign, and how many boxes before "=" (one after it). Multiply/divide:
 * □ × □ = □ and □ ÷ □ = □. Part–whole: □ + □ (+ □...) = □ (a box a part) and □ − □ = □. Compare: □ − □ = □ and □ + □ = □.
 */
export function barSentences(st) {
  const { kind } = barModel(st);
  if (kind === 'mul') return [{ op: '×', n: 2 }, { op: '÷', n: 2 }];
  if (kind === 'part') return [{ op: '+', n: st.p.length }, { op: '−', n: 2 }];
  return [{ op: '−', n: 2 }, { op: '+', n: 2 }];
}

/**
 * Is a number sentence the user filled in true to the model? vals: the numbers in its boxes, left to right (the last is
 * after "="). -> true, false, or null while a box is empty. Any order the maths allows is right (4 × 3 and 3 × 4).
 */
export function checkSentence(st, which, vals) {
  const s = barSentences(st)[which];
  if (!s || !Array.isArray(vals) || vals.length !== s.n + 1 || vals.some(v => !Number.isFinite(v))) return null;
  const m = barModel(st), [a, b, c] = vals;
  if (m.kind === 'mul') {
    const { g, e } = st, total = g * e;
    if (s.op === '×') return a * b === c && c === total && sameBag([a, b], [g, e]);
    return a === total && ((b === g && c === e) || (b === e && c === g));
  }
  if (m.kind === 'part') {
    const whole = sum(st.p);
    if (s.op === '+') { const add = vals.slice(0, -1), res = vals.at(-1); return res === whole && sameBag(add, st.p); }
    return a === whole && b + c === whole && b >= 1 && c >= 1 && (st.p.includes(b) || st.p.includes(c));
  }
  const big = Math.max(st.ca, st.cb), small = Math.min(st.ca, st.cb), diff = big - small;
  if (s.op === '−') return a === big && b === small && c === diff;
  return c === big && sameBag([a, b], [small, diff]);
}

/**
 * "New problem": a random model of the same kind with every number up to max (the teacher's Options), and a random
 * unknown. rnd: a function giving numbers in [0, 1). Multiply/divide: 2-10 groups of 2-12 (fewer where max is small);
 * part–whole: the same number of parts as now (2-4), each at least 1; compare: two different lengths.
 */
export function newBarProblem(st, rnd = Math.random) {
  const s = clampBars(st), max = s.max, out = { ...s };
  if (s.kind === 'mul') {
    const gHi = Math.max(2, Math.min(10, Math.floor(max / 2)));
    out.g = randInt(rnd, 2, gHi);
    out.e = randInt(rnd, 2, Math.max(2, Math.min(12, Math.floor(max / out.g))));
    out.unk = randInt(rnd, 0, 2);
  } else if (s.kind === 'part') {
    const n = s.p.length, hi = Math.max(1, Math.floor(max / n));
    out.p = Array.from({ length: n }, () => randInt(rnd, 1, hi));
    out.unk = randInt(rnd, 0, n);
  } else {
    const small = randInt(rnd, 1, Math.max(1, max - 1)), big = randInt(rnd, Math.min(max, small + 1), max);
    if (rnd() < 0.5) { out.ca = big; out.cb = small; } else { out.ca = small; out.cb = big; }
    if (out.ca === out.cb) out.ca = Math.min(BAR_LIMITS.v[1], out.ca + 1);
    out.unk = randInt(rnd, 0, 2);
  }
  return out;
}

// ================================================================ number rods
/** The board in units (a 1-rod is one unit square): 30 across, 16 down. At most 60 rods; rods 1-20 long (a rod longer
 *  than 16 can only lie down). */
export const ROD_W = 30, ROD_H = 16, ROD_MAX = 60, ROD_LONG = [11, 20];
/** A rod's box on the board: { x0, y0, x1, y1 } (x1, y1 just past it). v: standing up. */
export const rodBox = r => ({ x0: r.x, y0: r.y, x1: r.x + (r.v ? 1 : r.n), y1: r.y + (r.v ? r.n : 1) });
/** A rod kept wholly on the board (a rod too long to stand up there lies down). */
export function clampRod(r, W = ROD_W, H = ROD_H) {
  const n = Math.max(1, Math.min(20, Math.round(r.n) || 1)), v = !!r.v && n <= H;
  const w = v ? 1 : n, h = v ? n : 1;
  return { n, v, x: Math.max(0, Math.min(W - w, Math.round(r.x) || 0)), y: Math.max(0, Math.min(H - h, Math.round(r.y) || 0)) };
}
/**
 * Where a rod let go at (x, y) (its top left corner in units, not yet whole) lands: on the unit grid, wholly on the board
 * and, when one of its ends is within `reach` units of another rod's end on the same line, touching that end (so trains
 * join up). -> the rod's new { n, v, x, y }.
 */
export function snapRod(r, others = [], W = ROD_W, H = ROD_H, reach = 0.75) {
  const base = clampRod({ ...r, x: Math.round(r.x), y: Math.round(r.y) }, W, H);
  let best = null;
  for (const o of others) {
    if (!!o.v !== base.v) continue;
    const ob = rodBox(o), len = base.n;
    // On the same line: lying rods share a row, standing rods a column.
    const line = base.v ? Math.abs(r.x - o.x) <= 0.5 : Math.abs(r.y - o.y) <= 0.5;
    if (!line) continue;
    const along = base.v ? r.y : r.x;
    for (const at of base.v ? [ob.y1, ob.y0 - len] : [ob.x1, ob.x0 - len]) {
      const d = Math.abs(along - at);
      if (d <= reach && (!best || d < best.d)) best = { d, x: base.v ? o.x : at, y: base.v ? at : o.y };
    }
  }
  return best ? clampRod({ ...base, x: best.x, y: best.y }, W, H) : base;
}
/**
 * Trains: rods lying in one row (or standing in one column) end to end with no gap. -> [{ v, rods: [index...] in order,
 * x, y, len }]. Every rod is in exactly one train (a rod alone is a train of one).
 */
export function trains(rods) {
  const out = [], used = new Set();
  const order = rods.map((r, i) => i).sort((i, j) => (!!rods[i].v - !!rods[j].v) || (rods[i].v ? rods[i].x - rods[j].x || rods[i].y - rods[j].y : rods[i].y - rods[j].y || rods[i].x - rods[j].x));
  for (const i of order) {
    if (used.has(i)) continue;
    const r = rods[i], t = { v: !!r.v, rods: [i], x: r.x, y: r.y, len: r.n }; used.add(i);
    let end = r.v ? r.y + r.n : r.x + r.n, more = true;
    while (more) {
      more = false;
      for (const j of order) {
        const o = rods[j];
        if (used.has(j) || !!o.v !== t.v) continue;
        if (t.v ? o.x === t.x && o.y === end : o.y === t.y && o.x === end) { t.rods.push(j); t.len += o.n; end += o.n; used.add(j); more = true; break; }
      }
    }
    out.push(t);
  }
  return out;
}
/** The train rod i is in. */
export const trainOf = (rods, i) => trains(rods).find(t => t.rods.includes(i)) || null;

/** An equation of lengths: { l: [terms], r: [terms] }, each side 1-3 terms of 1-20 and exactly one 0, the missing one. */
export const EQ_START = { l: [5, 4], r: [0, 3] };
/** Is it an equation the board can model? Both sides at most 20 long, the missing term at least 1. */
export function eqValid(eq) {
  if (!eq || !Array.isArray(eq.l) || !Array.isArray(eq.r)) return false;
  const all = [...eq.l, ...eq.r];
  if (eq.l.length < 1 || eq.r.length < 1 || eq.l.length > 3 || eq.r.length > 3 || all.filter(x => x === 0).length !== 1 || all.some(x => !Number.isInteger(x) || x < 0 || x > 20)) return false;
  const m = missingOf(eq);
  return m >= 1 && m <= 20 && sum(eq.l) + (eq.l.includes(0) ? m : 0) <= 20 && sum(eq.r) + (eq.r.includes(0) ? m : 0) <= 20;
}
/** The missing number (what makes both sides the same length). */
export function missingOf(eq) {
  const L = sum(eq.l), R = sum(eq.r);
  return eq.l.includes(0) ? R - L : L - R;
}
/** "5 + 4 = □ + 3" (the box is "□"). */
export const eqText = (eq, box = '□') => `${eq.l.map(x => (x ? x : box)).join(' + ')} = ${eq.r.map(x => (x ? x : box)).join(' + ')}`;
/**
 * An equation a teacher typed: "5 + 4 = ? + 3", "7 = 3 + _", "□+2=9"... One term is missing (?, □, _ or a blank
 * between signs); only + and whole numbers. -> { l, r } or null when it isn't one the board can model.
 */
export function parseEquation(text) {
  const t = String(text || '').replace(/[□▢☐_？]/g, '?').replace(/\s+/g, '').replace(/[＋]/g, '+').replace(/[＝]/g, '=');
  if ([...t].length > 40) return null;
  const sides = t.split('=');
  if (sides.length !== 2) return null;
  const side = s => s.split('+').map(x => (x === '?' ? 0 : /^\d{1,2}$/.test(x) ? Number(x) : NaN));
  const eq = { l: side(sides[0]), r: side(sides[1]) };
  return eqValid(eq) ? eq : null;
}
/**
 * "New equation": two equal sides with a missing box somewhere, every term 1-10 and each side at most `max` (≤ 20).
 * Forms: a + b = □ + c, a + b = c + □, □ + a = b + c, a + □ = b + c, a + b = □.
 */
export function newEquation(rnd = Math.random, max = 20) {
  const top = Math.max(4, Math.min(20, max));
  for (let k = 0; k < 200; k++) {
    const total = randInt(rnd, 4, top);
    const a = randInt(rnd, Math.max(1, total - 10), Math.min(10, total - 1)), b = total - a;
    const form = randInt(rnd, 0, 4);
    if (form === 4) return { l: [a, b], r: [0] };
    const c = randInt(rnd, Math.max(1, total - 10), Math.min(10, total - 1)), d = total - c;
    if (c === a || c === b) continue;   // the same two numbers on both sides would give the answer away
    const eq = [{ l: [a, b], r: [0, d] }, { l: [a, b], r: [c, 0] }, { l: [0, b], r: [c, d] }, { l: [a, 0], r: [c, d] }][form];
    if (eqValid(eq)) return eq;
  }
  return { ...EQ_START, l: [...EQ_START.l], r: [...EQ_START.r] };
}
/**
 * The two trains that model an equation on the board: each side's known terms as rods end to end from (x, y) (lying)
 * or standing from (x, y) down; the second side a row (column) further on, two units after the first. The missing term
 * is a gap where its rod goes: { rods: [{ n, v, x, y }], gap: { n, v, x, y } }. Standing trains too tall for the
 * board lie down instead.
 */
export function modelEquation(eq, v = false, x = 1, y = 1, H = ROD_H) {
  const rods = []; let gap = null;
  const m = missingOf(eq), long = Math.max(...[eq.l, eq.r].map(side => side.reduce((a, n) => a + (n || m), 0)));
  if (v && y + long > H) v = false;
  [eq.l, eq.r].forEach((side, k) => {
    let at = 0;
    for (const n of side) {
      const len = n || missingOf(eq);
      const pos = v ? { x: x + 2 * k, y: y + at } : { x: x + at, y: y + 2 * k };
      if (n) rods.push({ n, v, ...pos }); else gap = { n: len, v, ...pos };
      at += len;
    }
  });
  return { rods, gap };
}
/** Do two rods share a unit square? */
export const rodsOverlap = (a, b) => { const p = rodBox(a), q = rodBox(b); return p.x0 < q.x1 && q.x0 < p.x1 && p.y0 < q.y1 && q.y0 < p.y1; };
/**
 * Where a tapped rod goes: the first place where it lies wholly on the board on no other rod, row by row from the top
 * left for a lying rod (rows from `from` on first), column by column for a standing one (columns from `from` on first):
 * the equation's trains use the rows (columns) before `from`. -> { n, v, x, y } or null when the board has no room.
 */
export function freeSpot(rods, n, v = false, from = 6, W = ROD_W, H = ROD_H) {
  const w = v ? 1 : n, h = v ? n : 1;
  if (w > W || h > H) return null;
  const tries = [];
  for (let y = 0; y <= H - h; y++) for (let x = 0; x <= W - w; x++) tries.push({ x, y });
  const late = p => (v ? p.x < from : p.y < from);
  tries.sort((a, b) => late(a) - late(b) || (v ? a.x - b.x || a.y - b.y : a.y - b.y || a.x - b.x));
  for (const p of tries) { const r = { n, v, ...p }; if (!rods.some(o => rodsOverlap(o, r))) return r; }
  return null;
}
