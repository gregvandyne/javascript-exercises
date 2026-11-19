// "Make problems like problem N": the generator pattern ("gen", docs/canvas-api.md) for one problem of any kind the kit
// can vary. The kit's own gen() makes each problem and its own check, steps and answer; a figure question becomes a
// template whose numbers are vars (ranges the teacher can change) and whose answer and worked lines are formulas.
//   patternFor(p, ranges?) -> { ranges: { name: { from, to, step?, x? } }, keys: { name: [field...] }, gen } | null
// null: it cannot be varied from one problem (a sort into the Builder's own word groups, a figure question with choices,
// or a figure whose answer is not one of its numbers or two of them put together).
import { P, clone } from './shared.js';

const numText = x => String(Math.round(x * 1000) / 1000);
const span = (a, b) => { const out = []; for (let x = Math.max(2, a); x <= Math.min(12, b) && out.length < 11; x++) out.push(x); return out.length ? out : [2, 3, 4]; };
const int = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(+v) || lo));
const denOf = v => (Array.isArray(v) ? v[1] : 1);
const one = (r, keys, gen) => ({ ranges: { n: r }, keys: { n: keys }, gen });

/** The manipulatives: each tool's own generator options, from the problem's numbers. */
const TOOLS = {
  'fractions.equiv': (p, r) => { const R = r || { from: 2, to: Math.max(4, p.from[1]) }; return one(R, ['from', 'to'], { tool: p.tool, dens: span(R.from, R.to), mult: [2, 3] }); },
  'fractions.shade': (p, r) => { const R = r || { from: 2, to: Math.max(4, p.d) }; return one(R, ['from', 'to'], { tool: p.tool, dens: span(R.from, R.to) }); },
  'fractions.compare': (p, r) => { const R = r || { from: 2, to: Math.max(4, p.a[1], p.b[1]) }; return one(R, ['from', 'to'], { tool: p.tool, dens: span(R.from, R.to) }); },
  'numberline.point': (p, r) => { const R = r || { from: p.lo, to: p.hi, step: p.sub }; return one(R, ['from', 'to', 'step'], { tool: p.tool, lo: int(R.from, -20, 99), hi: int(R.to, int(R.from, -20, 99) + 1, 100), subs: [int(R.step, 1, 12)] }); },
  'numberline.jump': (p, r) => { const R = r || { from: p.lo, to: p.hi, step: p.sub }; return one(R, ['from', 'to', 'step'], { tool: p.tool, lo: int(R.from, -20, 99), hi: int(R.to, int(R.from, -20, 99) + 1, 100), subs: [int(R.step, 1, 12)] }); },
  'tiles.sort': (p, r) => {
    if (!p.rule) return null;   // the Builder's own word groups: there are no numbers to vary
    const tiles = Math.max(4, Math.min(10, p.items.length));
    if (p.rule === 'half') { const R = r || { from: 2, to: Math.max(4, ...p.items.map(denOf)) }; return one(R, ['from', 'to'], { tool: p.tool, rule: 'half', dens: span(R.from, R.to), tiles }); }
    const nums = p.items.filter(Number.isFinite), R = r || { from: Math.max(0, Math.min(...nums)), to: Math.max(...nums) };
    const lo = int(R.from, 0, 9999);
    return one(R, ['from', 'to'], { tool: p.tool, rule: p.rule, ...(p.n !== undefined ? { n: p.n } : {}), lo, hi: Math.max(lo + 6, int(R.to, 0, 10000)), tiles });
  },
  'tiles.order': (p, r) => {
    const tiles = Math.max(3, Math.min(8, p.items.length));
    if (p.items.some(Array.isArray)) { const R = r || { from: 2, to: Math.max(4, ...p.items.map(denOf)) }; return one(R, ['from', 'to'], { tool: p.tool, fractions: true, dens: span(R.from, R.to), tiles, dir: p.dir }); }
    const R = r || { from: Math.max(0, Math.min(...p.items)), to: Math.max(...p.items) }, lo = int(R.from, 0, 99999);
    return one(R, ['from', 'to'], { tool: p.tool, lo, hi: Math.max(lo + 10, int(R.to, 0, 100000)), tiles, dir: p.dir });
  },
};
for (const t of ['digits.add', 'digits.sub', 'digits.mul']) TOOLS[t] = (p, r) => { const R = r || { to: String(p.a).length }; return one(R, ['to'], { tool: t, digits: int(R.to, 1, 4) }); };

// ---- figure questions: the answer is one of the figure's numbers, or two of them added, taken away, multiplied or divided
const SCALE = new Set(['min', 'max', 'step', 'major', 'minor', 'x', 'y', 'w', 'h', 'width', 'height', 'z', 'charge']);
function leaves(fig) {
  const out = [];
  const walk = (v, path) => {
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) { if (!SCALE.has(path[path.length - 1])) out.push({ path, x: v }); return; }
    if (Array.isArray(v)) v.forEach((y, i) => walk(y, [...path, i]));
    else if (v && typeof v === 'object') for (const [k, y] of Object.entries(v)) if (k !== 'kind') walk(y, [...path, k]);
  };
  walk(fig, []);
  return out.slice(0, 16);
}
const OPS = [['+', '+', (a, b) => a + b], ['-', '−', (a, b) => a - b], ['*', '×', (a, b) => a * b], ['/', '÷', (a, b) => a / b]];
const near = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
/** -> { vars: [{ name, path, x }], expr, sign } or null */
function relation(p) {
  const L = leaves(p.fig), ans = +p.answer;
  const hit = L.find(l => near(l.x, ans)); if (hit) return { vars: [{ name: 'v', ...hit }], expr: 'v' };
  for (let i = 0; i < L.length; i++) for (let j = 0; j < L.length; j++) {
    if (i === j) continue;
    for (const [op, sign, f] of OPS) {
      if ((op === '+' || op === '*') && j < i) continue;
      if (near(f(L[i].x, L[j].x), ans)) return { vars: [{ name: 'a', ...L[i] }, { name: 'b', ...L[j] }], expr: `a${op}b`, sign, op };
    }
  }
  return null;
}
const decimals = x => { const s = numText(x); return s.includes('.') ? s.split('.')[1].length : 0; };
/** A number's own range: half of it to twice it, in steps of its last decimal place (a reading: its scale). */
function rangeOf(p, v) {
  const f = p.fig;
  if (v.path.length === 1 && v.path[0] === 'value' && Number.isFinite(f.min) && Number.isFinite(f.max)) return { from: f.min, to: f.max, step: f.step || 1, x: v.x };
  const step = 10 ** -decimals(v.x), from = Math.max(step, +numText(Math.round(v.x / 2 / step) * step));
  return { from, to: +numText(Math.max(v.x * 2, v.x + 5 * step)), step, x: v.x };
}
function setAt(obj, path, value) { let o = obj; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = value; }
function figurePattern(p, r) {
  if (p.tool !== 'figure.number' || !p.fig) return null;
  const rel = relation(p); if (!rel) return null;
  const ranges = {}, keys = {}, vars = {}, fig = clone(p.fig);
  let q = p.q;
  for (const v of rel.vars) {
    const R = (r && r[v.name]) || rangeOf(p, v);
    ranges[v.name] = R; keys[v.name] = ['from', 'to', 'step'];
    vars[v.name] = [+R.from, +R.to, +R.step || 1];
    setAt(fig, v.path, `{${v.name}}`);
    q = q.replace(new RegExp(`(^|[^\\d.])${numText(v.x).replace('.', '\\.')}(?![\\d]|\\.\\d)`, 'g'), `$1{${v.name}}`);
  }
  const u = p.unit ? ` ${p.unit}` : '', ans = rel.expr === 'v' ? '{v}' : `{=${rel.expr}}`;
  const reading = fig.kind === 'reading' && rel.expr === 'v';
  const work = reading ? [P('genWork1'), P('genWork2', { v: ans, u })]
    : rel.expr === 'v' ? [P('genWorkLook'), P('genWorkAns', { v: ans, u })] : [P('genWorkCalc', { calc: `{a} ${rel.sign} {b}` }), P('genWorkAns', { v: ans, u })];
  const where = rel.op === '-' ? 'a-b>=0' : rel.op === '/' ? 'b>0' : undefined;
  return { ranges, keys, gen: { tool: 'figure.number', vars, ...(where ? { where } : {}), q, fig, answer: rel.expr, ...(p.dp ? { dp: p.dp } : {}), ...(p.unit ? { unit: p.unit } : {}), work } };
}

export function patternFor(p, r = null) {
  if (!p) return null;
  if (TOOLS[p.tool]) return TOOLS[p.tool](p, r && r.n);
  return figurePattern(p, r);
}
