// Virtual math manipulatives: practice sets drafted with AI (docs/decisions.md "Virtual math manipulatives: practice
// sets"). The model only says WHAT: a title, a few short steps, and a list of items with each item's settings (a
// clock's time, a number line's range and point, a number to build, fractions, coordinates, an amount of money...) and
// whether the item gets an answer box, a "build it here" space, or nothing. Everything here is code: each setting is
// checked against the tool (valid times, ranges, denominators, values), repeats are replaced by distinct items, the
// count is capped, and the board is laid out by one fixed recipe (a tidy grid, centered, nothing overlapping). Pure
// functions, shared by the server (services/manipulatives.js builds the board) and the tests.
import { pieceDefs, allPieceDefs, FRACTION_DENS, hexValue } from './manip-data.js';
import { WORLD, OBJECTS, OBJ_HEAD, kindOf, addMinutes, parseFrac, fracRows, EQ_BAR, ANSWER } from './manip-board.js';

/** At most this many items in a set (the step says so when the teacher asked for more). */
export const PRACTICE_MAX = 12;
export const STEPS_MAX = 4;
const num = (v, d = null) => (v === null || v === undefined || v === '' || !Number.isFinite(+v) ? d : +v);
const int = (v, lo, hi) => { const n = num(v); return n === null || !Number.isInteger(n) || n < lo || n > hi ? null : n; };
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a) || 1);
const DENS = FRACTION_DENS.map(([d]) => d);
const round3 = n => Math.round(n * 1000) / 1000;
const hm = c => `${((c.h + 11) % 12) + 1}:${String(c.m).padStart(2, '0')}`;
let seq = 0;
const id = p => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

// ---------------------------------------------------------------- fractions
/** A fraction in simplest form: "5/6", "1 1/6", "2", "0". */
export function fracText(n, d) {
  if (!d) return '';
  const g = gcd(n, d); n /= g; d /= g;
  if (d === 1) return String(n);
  const w = Math.floor(n / d), r = n % d;
  return w ? `${w} ${r}/${d}` : `${r}/${d}`;
}
const fracStr = f => (f.d === 1 ? String(f.n) : f.n > f.d ? fracText(f.n, f.d) : `${f.n}/${f.d}`);
/**
 * A fraction equation, checked: operands with the tools' denominators (1, 2, 3, 4, 5, 6, 8, 10, 12), results the
 * tiles can show (0 to 3 wholes, a denominator the tools have). op: '+' | '-' | 'x' (by a whole number, or a fraction
 * whose product's denominator the tools have) | '/' (by a whole number) | '=' (equivalence: a = ?/b) | 'compare'.
 * -> null | { a, op, b, text, key }
 */
export function fracEquation(item) {
  const op = { '+': '+', '-': '-', '−': '-', x: 'x', '×': 'x', '*': 'x', '/': '/', '÷': '/', '=': '=', equiv: '=', compare: 'compare', '?': 'compare', '<>': 'compare' }[String(item.op || '').trim().toLowerCase()];
  const a = parseFrac(item.a); if (!op || !a || !DENS.includes(a.d) || a.n < 1 || a.n / a.d > 2) return null;
  const okD = d => DENS.includes(d);
  if (op === '=') {
    const D = int(item.b, 2, 12); if (!D || !okD(D) || D % a.d || D === a.d) return null;
    return { a: fracStr(a), op, b: String(D), text: `${fracStr(a)} = ?/${D}`, key: `${(a.n * D) / a.d}/${D}` };
  }
  const b = parseFrac(item.b); if (!b || b.n < 1) return null;
  if (op === 'compare') {
    if (!okD(b.d) || b.n / b.d > 2) return null;
    const l = a.n * b.d, r = b.n * a.d;
    return { a: fracStr(a), op, b: fracStr(b), text: `${fracStr(a)} ○ ${fracStr(b)}`, key: l > r ? '>' : l < r ? '<' : '=' };
  }
  let n, d;
  if (op === '+' || op === '-') { if (!okD(b.d) || b.n / b.d > 2) return null; n = op === '+' ? a.n * b.d + b.n * a.d : a.n * b.d - b.n * a.d; d = a.d * b.d; }
  else if (op === 'x') { if (b.n / b.d > 6) return null; n = a.n * b.n; d = a.d * b.d; }
  else { if (b.d !== 1 || b.n < 2 || b.n > 6) return null; n = a.n; d = a.d * b.n; }
  const g = gcd(n, d); n /= g; d /= g;
  if (n < 0 || n / d > 3 || (n && !okD(d))) return null;
  const sym = { '+': '+', '-': '−', x: '×', '/': '÷' }[op];
  return { a: fracStr(a), op, b: fracStr(b), text: `${fracStr(a)} ${sym} ${fracStr(b)} = ?`, key: fracText(n, d) || '0' };
}

// ---------------------------------------------------------------- the 18 tools: what a practice item is
// Each: norm(item) -> its checked settings or null (not valid for the tool); sig(n) (two items are the same when equal);
// vary(n, i) -> a different valid item (to replace a repeat); cell(n, box, slug) -> { objects, pieces, w, h } (places
// from the cell's top left); key(n) -> the answer, for the teacher only; ask(n) -> what the item asks (its label).
const mat = (w, h, label = '') => ({ k: 'mat', st: { w: Math.round(w), h: Math.round(h), label } });
const defOf = (slug, kind, opts) => pieceDefs(slug, opts).find(d => d.kind === kind);
/** Pieces in a row (or rows of `per`), snapped together as one group when `group`. -> { pieces, w, h } */
function row(slug, kinds, { per = 99, gap = 0, group = false, opts } = {}) {
  const out = []; let x = 0, y = 0, rowH = 0, w = 0, i = 0; const g = group ? id('g') : undefined;
  for (const kind of kinds) {
    const d = defOf(slug, kind, opts); if (!d) continue;
    if (i && i % per === 0) { y += rowH + gap; x = 0; rowH = 0; }
    out.push({ kind, x, y, ...(g ? { g } : {}) }); x += d.w + gap; w = Math.max(w, x - gap); rowH = Math.max(rowH, d.h); i++;
  }
  return { pieces: out, w, h: y + rowH };
}
/** Pieces in a mat: rows stacked, the mat sized around them. */
function onMat(rows, label = '') {
  const P = 16; let y = OBJ_HEAD + P, w = 0; const pieces = [];
  for (const r of rows) { if (!r.pieces.length) continue; for (const p of r.pieces) pieces.push({ ...p, x: p.x + P, y: p.y + y }); y += r.h + 12; w = Math.max(w, r.w); }
  const W = Math.max(180, w + P * 2), H = Math.max(80, y - 12 + P - OBJ_HEAD);
  return { objects: [{ ...mat(W, H, label), x: 0, y: 0 }], pieces, w: W, h: H + OBJ_HEAD };
}
const one = (k, st, slug) => { const K = kindOf(slug, k); const z = K.size({ ...K.init(), ...st }); return { objects: [{ k, st: { ...K.init(), ...st }, x: 0, y: 0 }], pieces: [], w: z.w, h: z.h }; };
const greedy = (value, coins) => { const out = []; let v = value; for (const [kind, c] of coins) while (v >= c && out.length < 12) { out.push(kind); v -= c; } return v ? null : out; };

const TOOLS = {
  clock: {
    norm: it => { const m = String(it.time || '').match(/^\s*(\d{1,2}):(\d{2})\s*$/); if (!m) return null; const h = +m[1], mi = +m[2]; return h >= 1 && h <= 12 && mi < 60 ? { h, m: mi } : null; },
    sig: n => hm(n), vary: (n, i) => addMinutes(n, 35 * (i + 1)), key: n => hm(n), ask: () => 'What time is it?',
    cell: (n, box, slug) => (box === 'build' ? one('clock', { h: 12, m: 0, label: `Show ${hm(n)}` }, slug) : one('clock', { h: n.h, m: n.m }, slug)),
  },
  'number-lines': {
    norm: it => {
      const step = [1, 0.5, 0.25, 0.1, 2, 5, 10].includes(num(it.step, 1)) ? num(it.step, 1) : null, min = num(it.min, 0), max = num(it.max, 10), v = num(it.value);
      if (step === null || max <= min || (max - min) / step > 40 || (max - min) / step < 2 || v === null || v < min || v > max) return null;
      const k = (v - min) / step; return Math.abs(k - Math.round(k)) > 1e-6 ? null : { min, max, step, value: round3(v) };
    },
    sig: n => `${n.min}|${n.max}|${n.step}|${n.value}`, key: n => String(n.value), ask: () => 'What number is the point?',
    vary: (n, i) => { const span = Math.round((n.max - n.min) / n.step); return { ...n, value: round3(n.min + ((Math.round((n.value - n.min) / n.step) + 3 * (i + 1)) % (span + 1)) * n.step) }; },
    cell: (n, box, slug) => one('number-lines', { min: n.min, max: n.max, step: n.step, hide: false, points: box === 'build' ? [] : [n.value], jumps: [], jumpFrom: null, ask: box !== 'build', label: box === 'build' ? `Mark ${n.value}` : '' }, slug),
  },
  'hundred-board': {
    norm: it => { const v = int(it.value, 1, 100); return v === null ? null : { value: v }; },
    sig: n => String(n.value), vary: (n, i) => ({ value: ((n.value - 1 + 13 * (i + 1)) % 100) + 1 }), key: n => String(n.value), ask: () => 'Which number is covered?',
    cell: (n, box, slug) => one('hundred-board', { start: 1, picked: box === 'build' ? [] : [n.value - 1], mult: 0, decimalMode: false, hidden: false, label: box === 'build' ? `Cover ${n.value}` : '' }, slug),
  },
  rekenreks: {
    norm: it => { const v = int(it.value, 0, 20); return v === null ? null : { value: v }; },
    sig: n => String(n.value), vary: (n, i) => ({ value: (n.value + 7 * (i + 1)) % 21 }), key: n => String(n.value), ask: () => 'How many beads?',
    cell: (n, box, slug) => one('rekenreks', { rows: 2, counts: box === 'build' ? Array(10).fill(0) : [Math.min(10, n.value), Math.max(0, n.value - 10), 0, 0, 0, 0, 0, 0, 0, 0], label: box === 'build' ? `Show ${n.value}` : '' }, slug),
  },
  'fraction-circles': {
    norm: it => {
      if (it.op) { const e = fracEquation(it); return e ? { eq: e } : null; }
      const fs = (Array.isArray(it.fractions) ? it.fractions : []).slice(0, 4).map(parseFrac);
      if (!fs.length || fs.some(f => !f || !DENS.includes(f.d) || f.n < 1 || f.n > f.d)) return null;
      return { fs: fs.map(f => `${f.n}/${f.d}`) };
    },
    sig: n => (n.eq ? n.eq.text : n.fs.join('+')), key: n => (n.eq ? n.eq.key : fracText(...sumOf(n.fs))), ask: n => (n.eq ? '' : 'How much is shown?'),
    vary: (n, i) => (n.eq ? varyEq(n, i) : { fs: n.fs.map((f, j) => { const p = parseFrac(f), d = DENS[(DENS.indexOf(p.d) + i + 1 + j) % (DENS.length - 1) + 1]; return `${Math.min(p.n, d)}/${d}`; }) }),
    cell: (n, box, slug) => {
      if (n.eq) return one('frac-eq', { ...eqState(n.eq), shape: 'circles' }, slug);
      const placed = n.fs.flatMap(f => { const p = parseFrac(f); return Array.from({ length: p.n }, (_, k) => ({ id: id('p'), d: p.d, rot: (360 / p.d) * k })); });
      return one('fraction-circles', { placed: box === 'build' ? [] : placed.slice(0, 24), mode: 'frac', rings: false, label: box === 'build' ? `Show ${n.fs.join(' + ')}` : '' }, slug);
    },
  },
  'fraction-tiles': {
    norm: it => {
      if (it.op) { const e = fracEquation(it); return e ? { eq: e } : null; }
      const fs = (Array.isArray(it.fractions) ? it.fractions : []).slice(0, 4).map(parseFrac);
      if (!fs.length || fs.some(f => !f || !DENS.includes(f.d) || f.n < 1 || f.n > f.d)) return null;
      return { fs: fs.map(f => `${f.n}/${f.d}`) };
    },
    sig: n => (n.eq ? n.eq.text : n.fs.join('+')), key: n => (n.eq ? n.eq.key : fracText(...sumOf(n.fs))), ask: n => (n.eq ? '' : 'How much is shown?'),
    vary: (n, i) => (n.eq ? varyEq(n, i) : { fs: n.fs.map((f, j) => { const p = parseFrac(f), d = DENS[(DENS.indexOf(p.d) + i + 1 + j) % (DENS.length - 1) + 1]; return `${Math.min(p.n, d)}/${d}`; }) }),
    cell: (n, box, slug) => {
      if (n.eq) return one('frac-eq', eqState(n.eq), slug);
      const kinds = n.fs.flatMap(f => { const p = parseFrac(f); return Array(p.n).fill(`f${p.d}`); });
      return box === 'build' ? onMat([{ pieces: [], w: 300, h: 40 }], `Show ${n.fs.join(' + ')}`) : onMat([row(slug, kinds, { group: true })]);
    },
  },
  'base-ten-blocks': {
    norm: it => { const v = int(it.value, 1, 9999); if (v === null) return null; const d = String(v).padStart(4, '0').split('').map(Number); return d.reduce((s, x) => s + x, 0) > 30 || d[0] > 3 ? null : { value: v }; },
    sig: n => String(n.value), key: n => String(n.value), ask: () => 'What number is shown?',
    vary: (n, i) => { let v = n.value; for (let k = 0; k <= i; k++) v = (v % 999) + 111; return { value: v }; },
    cell: (n, box, slug) => {
      if (box === 'build') { const c = one('pv-chart', { cols: ['Thousands', 'Hundreds', 'Tens', 'Ones'], label: `Build ${n.value}` }, slug); return c; }
      const [th, h, t, o] = String(n.value).padStart(4, '0').split('').map(Number);
      return onMat([row(slug, Array(th).fill('cube'), { gap: 8 }), row(slug, Array(h).fill('flat'), { gap: 8, per: 5 }), row(slug, Array(t).fill('rod'), { group: true }), row(slug, Array(o).fill('unit'), { per: 5, group: true })]);
    },
  },
  'place-value-disks': {
    norm: it => { const v = int(it.value, 1, 9999); if (v === null) return null; return String(v).split('').reduce((s, x) => s + +x, 0) > 24 ? null : { value: v }; },
    sig: n => String(n.value), key: n => String(n.value), ask: () => 'What number is shown?', vary: (n, i) => ({ value: ((n.value + 123 * (i + 1)) % 9000) + 1 }),
    cell: (n, box, slug) => {
      if (box === 'build') return one('pv-chart', { cols: ['Thousands', 'Hundreds', 'Tens', 'Ones', 'Tenths', 'Hundredths'], label: `Build ${n.value}` }, slug);
      const [th, h, t, o] = String(n.value).padStart(4, '0').split('').map(Number);
      return onMat([['th', th], ['h', h], ['t', t], ['o', o]].filter(([, c]) => c).map(([k, c]) => row(slug, Array(c).fill(k), { gap: 4 })));
    },
  },
  'two-color-counters': {
    norm: it => { const v = int(it.value, 0, 10), neg = int(num(it.negative, 0), 0, 10); return v === null || neg === null || v + neg < 1 ? null : { value: v, neg }; },
    sig: n => `${n.value}|${n.neg}`, key: n => String(n.value - n.neg), ask: n => (n.neg ? 'What is the value?' : 'How many counters?'),
    vary: (n, i) => ({ value: (n.value + 3 * (i + 1)) % 11 || 1, neg: n.neg }),
    cell: (n, box, slug) => {
      if (n.neg || box === 'build') return box === 'build' ? one('ten-frame', { n: 10, label: `Show ${n.value}` }, slug) : onMat([row(slug, Array(n.value).fill('pos'), { gap: 6 }), row(slug, Array(n.neg).fill('neg'), { gap: 6 })]);
      const c = one('ten-frame', { n: 10 }, slug), d = defOf(slug, 'pos');
      c.pieces = Array.from({ length: n.value }, (_, i) => ({ kind: 'pos', x: 10 + (i % 5) * 60 + (60 - d.w) / 2, y: OBJ_HEAD + 10 + Math.floor(i / 5) * 60 + (60 - d.h) / 2 }));
      return c;
    },
  },
  'linking-cubes': {
    norm: it => { const v = int(it.value, 1, 20); return v === null ? null : { value: v }; },
    sig: n => String(n.value), vary: (n, i) => ({ value: ((n.value + 5 * (i + 1) - 1) % 20) + 1 }), key: n => String(n.value), ask: () => 'How many cubes?',
    cell: (n, box, slug) => (box === 'build' ? onMat([{ pieces: [], w: 400, h: 40 }], `Make a stick of ${n.value}`)
      : onMat([row(slug, Array(Math.min(10, n.value)).fill('c5'), { group: true }), row(slug, Array(Math.max(0, n.value - 10)).fill('c1'), { group: true })])),
  },
  'color-tiles': {
    norm: it => { const r = int(it.rows, 1, 6), c = int(it.cols, 1, 8); return r === null || c === null ? null : { r, c }; },
    sig: n => `${Math.min(n.r, n.c)}x${Math.max(n.r, n.c)}`, vary: (n, i) => ({ r: ((n.r + i) % 6) + 1, c: ((n.c + 2 * i + 1) % 8) + 1 }), key: n => String(n.r * n.c), ask: () => 'What is the area?',
    cell: (n, box, slug) => (box === 'build' ? onMat([{ pieces: [], w: 300, h: 160 }], `Build an area of ${n.r * n.c}`) : onMat([row(slug, Array(n.r * n.c).fill('t4'), { per: n.c, group: true })])),
  },
  'number-rods': {
    norm: it => { const xs = (Array.isArray(it.numbers) ? it.numbers : []).slice(0, 4).map(v => int(v, 1, 10)); return !xs.length || xs.includes(null) ? null : { xs }; },
    sig: n => [...n.xs].sort().join('+'), vary: (n, i) => ({ xs: n.xs.map((x, j) => ((x + i + j) % 10) + 1) }), key: n => String(n.xs.reduce((s, x) => s + x, 0)), ask: () => 'How long is the train?',
    cell: (n, box, slug) => (box === 'build' ? onMat([{ pieces: [], w: 340, h: 30 }], `Make a train of ${n.xs.reduce((s, x) => s + x, 0)}`) : onMat([row(slug, n.xs.map(x => `r${x}`), { group: true })])),
  },
  money: {
    norm: it => { const v = int(it.value, 1, 4000); return v === null || !greedy(v, MONEY) ? null : { value: v }; },
    sig: n => String(n.value), vary: (n, i) => { let v = n.value; for (let k = 0; k < 40; k++) { v = (v + 17 * (i + 1) + k) % 400 + 1; if (greedy(v, MONEY)) break; } return { value: v }; },
    key: n => `$${(n.value / 100).toFixed(2)}`, ask: () => 'How much money?',
    cell: (n, box, slug) => (box === 'build' ? onMat([{ pieces: [], w: 340, h: 50 }], `Make $${(n.value / 100).toFixed(2)}`) : onMat([row(slug, greedy(n.value, MONEY), { gap: 8, per: 6 })])),
  },
  'algebra-tiles': {
    norm: it => {
      const kinds = new Set(pieceDefs('algebra-tiles').map(d => d.kind)), ps = (Array.isArray(it.pieces) ? it.pieces : []).filter(p => p && kinds.has(p.kind)).map(p => ({ kind: p.kind, count: int(p.count, 1, 9) }));
      return !ps.length || ps.some(p => p.count === null) || ps.reduce((s, p) => s + p.count, 0) > 18 ? null : { ps };
    },
    sig: n => n.ps.map(p => `${p.count}${p.kind}`).sort().join(','), vary: (n, i) => ({ ps: n.ps.map((p, j) => ({ ...p, count: ((p.count + i + j) % 6) + 1 })) }),
    key: n => { const c = k => n.ps.filter(p => p.kind === k).reduce((s, p) => s + p.count, 0); const parts = [[c('x2') - c('mx2'), 'x²'], [c('y2'), 'y²'], [c('xy'), 'xy'], [c('x') - c('mx'), 'x'], [c('y') - c('my'), 'y'], [c('one') - c('mone'), '']].filter(([v]) => v).map(([v, s]) => `${v}${s}`); return parts.length ? parts.join(' + ').replace(/\+ -/g, '− ') : '0'; },
    ask: () => 'Write the expression.',
    cell: (n, box, slug) => onMat(n.ps.map(p => row(slug, Array(p.count).fill(p.kind), { gap: 6 }))),
  },
  'pattern-blocks': {
    norm: it => { const ok = new Set(['hex', 'trap', 'tri', 'para']), ps = (Array.isArray(it.pieces) ? it.pieces : []).filter(p => p && ok.has(p.kind)).map(p => ({ kind: p.kind, count: int(p.count, 1, 6) })); return !ps.length || ps.some(p => p.count === null) ? null : { ps }; },
    sig: n => n.ps.map(p => `${p.count}${p.kind}`).sort().join(','), vary: (n, i) => ({ ps: n.ps.map((p, j) => ({ ...p, count: ((p.count + i + j) % 5) + 1 })) }),
    key: n => hexValue(n.ps.flatMap(p => Array(p.count).fill({ kind: p.kind }))).text, ask: () => 'How many hexagons is this worth?',
    cell: (n, box, slug) => onMat(n.ps.map(p => row(slug, Array(p.count).fill(p.kind), { gap: 6 }))),
  },
  'xy-coordinate-board': {
    norm: it => { const pts = (Array.isArray(it.points) ? it.points : []).slice(0, 4).map(p => ({ x: int(p && p.x, -10, 10), y: int(p && p.y, -10, 10) })); return !pts.length || pts.some(p => p.x === null || p.y === null) ? null : { pts }; },
    sig: n => n.pts.map(p => `${p.x},${p.y}`).join(' '), vary: (n, i) => ({ pts: n.pts.map(p => ({ x: ((p.x + 13 + 3 * (i + 1)) % 21) - 10, y: ((p.y + 12 + 2 * (i + 1)) % 21) - 10 })) }),
    key: n => n.pts.map(p => `(${p.x},${p.y})`).join(' '), ask: n => (n.pts.length > 1 ? 'Name the points.' : 'Name the point.'),
    cell: (n, box, slug) => one('xy-coordinate-board', { four: n.pts.some(p => p.x < 0 || p.y < 0), labels: false, connect: false, color: '#E53935', ask: box !== 'build', pts: box === 'build' ? [] : n.pts.map(p => ({ ...p, color: '#E53935' })), label: box === 'build' ? `Plot ${n.pts.map(p => `(${p.x},${p.y})`).join(' ')}` : '' }, slug),
  },
  geoboard: {
    norm: it => { const pts = (Array.isArray(it.pegs) ? it.pegs : []).slice(0, 8).map(p => ({ x: int(p && p.x, 0, 5), y: int(p && p.y, 0, 5) })); return pts.length < 3 || pts.some(p => p.x === null || p.y === null) || !shoelace(pts) || new Set(pts.map(p => `${p.x},${p.y}`)).size !== pts.length ? null : { pts }; },
    sig: n => n.pts.map(p => `${p.x},${p.y}`).join(' '), vary: (n, i) => { const dx = Math.min(...n.pts.map(p => 5 - p.x)), s = ((i % Math.max(1, dx)) + 1); return { pts: n.pts.map(p => ({ x: Math.min(5, p.x + s), y: p.y })) }; },
    key: n => `${shoelace(n.pts)} square units`, ask: () => 'What is the area?',
    cell: (n, box, slug) => one('geoboard', { board: 'square', band: [], bands: box === 'build' ? [] : [{ pts: n.pts, color: '#1E88E5' }], color: '#E53935', fill: true, label: box === 'build' ? `Make an area of ${shoelace(n.pts)}` : '' }, slug),
  },
  'bar-models': {
    norm: it => { const xs = (Array.isArray(it.parts) ? it.parts : []).slice(0, 4).map(v => int(v, 1, 1000)); const u = int(num(it.unknown, 0), 0, xs.length); return xs.length < 2 || xs.includes(null) || u === null ? null : { xs, u }; },
    sig: n => `${n.xs.join('+')}|${n.u}`, vary: (n, i) => ({ xs: n.xs.map((x, j) => x + (i + 1) * (j + 1)), u: n.u }),
    key: n => String(n.u === n.xs.length ? n.xs.reduce((s, x) => s + x, 0) : n.xs[n.u]), ask: () => 'What is the missing number?',
    cell: (n, box, slug) => {
      const C = ['#7CB342', '#AED581', '#C0CA33', '#9CCC65'], total = n.xs.reduce((s, x) => s + x, 0);
      return one('bar-models', { bars: [{ name: 'Whole', segs: [{ label: 'Whole', value: total, color: '#1E88E5', ...(n.u === n.xs.length ? { hide: true } : {}) }] }, { name: 'Parts', segs: n.xs.map((x, j) => ({ label: `Part ${j + 1}`, value: x, color: C[j % 4], ...(j === n.u ? { hide: true } : {}) })) }] }, slug);
    },
  },
};
const MONEY = [['b20', 2000], ['b10', 1000], ['b5', 500], ['b1', 100], ['quarter', 25], ['dime', 10], ['nickel', 5], ['penny', 1]];
function shoelace(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return Math.abs(a / 2); }
function sumOf(fs) { let n = 0, d = 1; for (const f of fs) { const p = parseFrac(f); n = n * p.d + p.n * d; d *= p.d; } return [n, d]; }
const eqState = e => ({ a: e.a, op: e.op, b: e.b, text: e.text, ans: '', key: e.key });
/** Another fraction equation like this one (to replace a repeat): the second operand's numerator or denominator moves. */
function varyEq(n, i) {
  const e = n.eq, b = parseFrac(e.b) || { n: 1, d: 1 };
  for (let k = 1; k < 40; k++) {
    const d = e.op === '=' ? DENS[(DENS.indexOf(+e.b) + k) % DENS.length] : DENS[(DENS.indexOf(b.d) + i + k) % DENS.length];
    const bb = e.op === '=' ? String(d) : e.op === '/' ? String(((b.n + i + k) % 5) + 2) : e.op === 'x' && b.d === 1 ? String(((b.n + i + k) % 5) + 2) : `${Math.max(1, (b.n + k) % d) || 1}/${d}`;
    const x = fracEquation({ a: e.a, op: e.op === '-' ? '-' : e.op, b: bb });
    if (x && x.text !== e.text) return { eq: x };
  }
  return n;
}

// ---------------------------------------------------------------- a set: checked, distinct, capped, laid out
/** What a practice item means on each tool (docs/decisions.md and the report carry this table). */
export const PRACTICE_TABLE = {
  clock: 'a clock at a time (answer: the time; build: a clock at 12:00 to set to the time)',
  'number-lines': 'a number line (from, to, step) with one point marked "?" (answer: the number)',
  'hundred-board': 'a hundred board with one number covered (answer: the number)',
  rekenreks: 'a rekenrek showing a number of beads (answer: how many)',
  'fraction-circles': 'a fraction set showing fractions, or a fraction equation drawn with circles',
  'fraction-tiles': 'a fraction equation (+, −, × by a whole number or a fraction, ÷ by a whole number, equivalence, compare) drawn with tiles, or a row of tiles to add up',
  'base-ten-blocks': 'blocks showing a number (answer: the number; build: an empty place-value chart "Build 346")',
  'place-value-disks': 'disks showing a number (answer: the number; build: an empty place-value chart)',
  'two-color-counters': 'a ten-frame with counters, or yellow and red counters (answer: how many, or the value)',
  'linking-cubes': 'a stick of cubes (answer: how many; build: "Make a stick of 7")',
  'color-tiles': 'a rectangle of tiles (answer: the area; build: "Build an area of 12")',
  'number-rods': 'a train of rods (answer: its length)',
  money: 'coins and bills for an amount (answer: the amount; build: "Make $1.35")',
  'algebra-tiles': 'a set of tiles (answer: the expression)',
  'pattern-blocks': 'a set of blocks (answer: their value in hexagons)',
  'xy-coordinate-board': 'a grid with points plotted (answer: the ordered pairs; build: points to plot)',
  geoboard: 'a band around pegs (answer: the area; build: "Make an area of 6")',
  'bar-models': 'a part-part-whole bar with one value "?" (answer: the missing value)',
};
/** The settings the model may give an item, per tool (for the prompt). */
export const PRACTICE_HELP = {
  clock: 'time ("H:MM", for example "7:30").',
  'number-lines': 'min, max, step (1, 0.5, 0.25, 0.1, 2, 5 or 10; at most 40 steps), value (the marked point, on a step).',
  'hundred-board': 'value (1 to 100, the covered number).',
  rekenreks: 'value (0 to 20 beads).',
  'fraction-circles': 'fractions (up to 4, like "3/4"; denominators 1, 2, 3, 4, 5, 6, 8, 10, 12), or an equation: op, a, b as for fraction tiles.',
  'fraction-tiles': 'an equation: op ("+", "-", "x", "/" (by a whole number), "=" (equivalence: a = ?/b, b the new denominator) or "compare"), a and b (fractions like "1/2" or mixed numbers like "1 1/3"; denominators 2, 3, 4, 5, 6, 8, 10, 12; results 0 to 3 wholes); or fractions (tiles to add up).',
  'base-ten-blocks': 'value (1 to 3999, digits adding up to 30 at most).',
  'place-value-disks': 'value (1 to 9999).',
  'two-color-counters': 'value (yellow counters, 0 to 10), negative (red counters, 0 to 10).',
  'linking-cubes': 'value (1 to 20 cubes).',
  'color-tiles': 'rows (1 to 6), cols (1 to 8).',
  'number-rods': 'numbers (up to 4 rod lengths, 1 to 10).',
  money: 'value (cents, 1 to 4000).',
  'algebra-tiles': 'pieces: [{ kind, count }] with kinds one, mone, x, mx, x2, mx2, y, my, xy, y2 (at most 18 tiles).',
  'pattern-blocks': 'pieces: [{ kind, count }] with kinds hex, trap, tri, para.',
  'xy-coordinate-board': 'points: up to 4 { x, y } (integers -10 to 10).',
  geoboard: 'pegs: 3 to 8 { x, y } (integers 0 to 5) going around a shape.',
  'bar-models': 'parts (2 to 4 whole numbers), unknown (which part is "?", counting from 0; the number of parts means the whole).',
};
/**
 * A drafted set, checked and built. raw (the model's): { title, steps: [text], items: [{ box, answer?, ...settings }] }.
 * -> { title, steps, board (format 2: objects, pieces, title text; answer boxes carry the teacher's `key`), n, asked,
 *      capped, dropped } where n is the number of items built. Items the tool can't show are dropped; repeats become
 *      distinct items (vary); at most PRACTICE_MAX (the step says when it was capped).
 */
export function buildPractice(slug, raw, { clean = s => s } = {}) {
  const T = TOOLS[slug]; if (!T) return null;
  const items = Array.isArray(raw && raw.items) ? raw.items : [];
  const asked = items.length;
  const seen = new Set(), list = []; let dropped = 0;
  for (const it of items.slice(0, PRACTICE_MAX)) {
    let n = it && typeof it === 'object' ? T.norm(it) : null;
    if (!n) { dropped++; continue; }
    const n0 = n;
    for (let i = 0; seen.has(T.sig(n)) && i < 60; i++) { const m = T.vary(n0, i), c = m && T.norm(denorm(slug, m)); if (c) n = c; }
    if (seen.has(T.sig(n))) { dropped++; continue; }
    seen.add(T.sig(n));
    const box = ['answer', 'build', 'none'].includes(it.box) ? it.box : 'answer';
    list.push({ n, box, label: clean(String(it.label || '').slice(0, 40)) });
  }
  const capped = asked > PRACTICE_MAX;
  const title = clean(String((raw && raw.title) || '').slice(0, 80)) || 'Practice';
  let steps = (Array.isArray(raw && raw.steps) ? raw.steps : []).map(x => clean(String(x || '').trim().slice(0, 140))).filter(Boolean).slice(0, STEPS_MAX);
  if (!steps.length) steps = [list.some(x => x.box === 'answer') ? 'Write your answer under each one.' : 'Work on each one.'];
  if (capped) steps[steps.length - 1] = `${steps[steps.length - 1]} (${PRACTICE_MAX} problems: the most on one board.)`.slice(0, 200);
  return { title, steps, board: layout(slug, T, list, title), n: list.length, asked, capped, dropped };
}
/** An item's checked settings back into the model's words (to check a varied item the same way). */
function denorm(slug, n) {
  if (n.eq) return { op: n.eq.op, a: n.eq.a, b: n.eq.b };
  if (slug === 'clock') return { time: hm(n) };
  if (slug === 'number-lines') return n;
  if (n.fs) return { fractions: n.fs };
  if (n.xs && slug === 'number-rods') return { numbers: n.xs };
  if (n.xs) return { parts: n.xs, unknown: n.u };
  if (n.ps) return { pieces: n.ps };
  if (n.pts) return slug === 'geoboard' ? { pegs: n.pts } : { points: n.pts };
  if (n.r) return { rows: n.r, cols: n.c };
  return { value: n.value, negative: n.neg };
}
/** The fixed recipe: a grid (up to 4 across), every cell the same size, the item centered in it, its answer box under
 *  it (sized for the answer), a short label above when there is one; the title above it all; the whole centered on the
 *  board. Nothing overlaps and one Fit shows everything. */
function layout(slug, T, list, title) {
  const cells = list.map(({ n, box, label }) => {
    const c = T.cell(n, box, slug), key = T.key(n);
    const ans = box === 'answer' && !(n.eq) ? { k: 'answer', st: { ans: '', size: key.length > 9 ? 'L' : key.length > 4 ? 'M' : 'S', key } } : null;
    const az = ans ? ANSWER.size(ans.st) : null;
    // A question gives nothing away: its object is marked (q) so the page shows no total and a clock no digital time.
    if (box === 'answer') for (const o of c.objects) o.st = { ...o.st, q: true };
    return { c, ans, az, label, w: Math.max(c.w, az ? az.w : 0), h: c.h + (az ? az.h + 12 : 0) };
  });
  const cols = cells.length <= 4 ? cells.length : cells.length <= 6 ? 3 : 4, LABEL = cells.some(c => c.label) ? 30 : 0, GX = 40, GY = 48, TITLE = 56;
  const cw = Math.max(0, ...cells.map(c => c.w)), ch = Math.max(0, ...cells.map(c => c.h)) + LABEL, rows = Math.ceil(cells.length / Math.max(1, cols));
  const W = cols * cw + (cols - 1) * GX, H = TITLE + rows * ch + (rows - 1) * GY;
  const x0 = Math.round((WORLD.w - W) / 2), y0 = Math.round(Math.max(16, (WORLD.h - H) / 2));
  const defs = allPieceDefs(slug);
  const board = { v: 2, objects: [], pieces: [], __ann: { notes: [], strokes: [], texts: [{ id: id('t'), text: title, x: x0 / WORLD.w, y: y0 / WORLD.h, by: 't' }] } };
  cells.forEach((cell, i) => {
    const cx = x0 + (i % cols) * (cw + GX), cy = y0 + TITLE + Math.floor(i / cols) * (ch + GY);
    if (cell.label) board.__ann.texts.push({ id: id('t'), text: cell.label, x: cx / WORLD.w, y: cy / WORLD.h, by: 't' });
    const ox = cx + Math.round((cw - cell.c.w) / 2), oy = cy + LABEL;
    for (const o of cell.c.objects) board.objects.push({ id: id('o'), k: o.k, x: ox + o.x, y: oy + o.y, s: 1, st: o.st });
    for (const p of cell.c.pieces) { const d = defs.find(x => x.kind === p.kind); if (d) board.pieces.push({ id: id('p'), kind: d.kind, x: Math.round(ox + p.x), y: Math.round(oy + p.y), rot: 0, flipped: false, filled: true, locked: false, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h, ...(p.g ? { g: p.g } : {}) }); }
    if (cell.ans) board.objects.push({ id: id('o'), k: 'answer', x: cx + Math.round((cw - cell.az.w) / 2), y: oy + cell.c.h + 12, s: 1, st: cell.ans.st });
  });
  if (!defs.length) delete board.pieces;
  return board;
}
export const practiceKinds = () => Object.keys(TOOLS);
export { OBJECTS };
