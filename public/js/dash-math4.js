// Classroom dashboards, stage 4: the maths behind the second set of teaching tools (docs/decisions.md "Classroom
// dashboards, stage 4"). Pure functions only: no DOM, no network, no storage. public/js/dash-tools4.js draws with them;
// tests/unit/dash-stage4.test.js checks them. Everything that can be exact is exact: areas are counted in half squares,
// lengths are whole numbers plus simplified square roots (2 + 3√2), money is whole cents, chances are fractions.
import { gcd, simplify } from './dash-math.js';

/** A fraction as a mixed number: "4 1/2", "1/3", "2", "−1 1/4". */
export function mixed(n, d) {
  const s = simplify(n, d), neg = s.n < 0, a = Math.abs(s.n), sign = neg ? '−' : '';
  if (s.d === 1) return `${sign}${a}`;
  const whole = Math.floor(a / s.d), rest = a % s.d;
  return whole ? `${sign}${whole} ${rest}/${s.d}` : `${sign}${rest}/${s.d}`;
}
const minus = v => String(v).replace(/^-/, '−');

// ================================================================ geoboard: Pick's theorem, exact perimeters
/** Twice the area of a polygon (shoelace), always a whole number on a peg board. */
export function doubleArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; }
  return Math.abs(s);
}
/** Pegs on the band (B): each side passes gcd(|dx|, |dy|) pegs. */
export const boundaryPegs = pts => pts.reduce((s, a, i) => { const b = pts[(i + 1) % pts.length]; return s + gcd(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) * (a.x === b.x && a.y === b.y ? 0 : 1); }, 0);
const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const onSeg = (p, a, b) => Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
function segsMeet(a, b, c, d) {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  return (d1 === 0 && onSeg(a, c, d)) || (d2 === 0 && onSeg(b, c, d)) || (d3 === 0 && onSeg(c, a, b)) || (d4 === 0 && onSeg(d, a, b));
}
/** A closed band that makes a real shape: 3 or more pegs, no peg twice, sides never cross or touch, some area. */
export function isSimple(pts) {
  const n = pts.length;
  if (n < 3 || new Set(pts.map(p => `${p.x},${p.y}`)).size !== n || !doubleArea(pts)) return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) {
      // Neighbouring sides may only share their corner: folding back on itself (a straight 180° turn back) is not a shape.
      const [a, b, c] = j === i + 1 ? [pts[i], pts[j], pts[(j + 1) % n]] : [pts[n - 1], pts[0], pts[1]];
      if (cross(a, b, c) === 0 && (c.x - b.x) * (b.x - a.x) + (c.y - b.y) * (b.y - a.y) < 0) return false;
      continue;
    }
    if (segsMeet(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
  }
  return true;
}
/** Pick's theorem: A = I + B/2 − 1. -> { a2 (twice the area), B, I } for a simple polygon on whole-number pegs. */
export function pick(pts) {
  const a2 = doubleArea(pts), B = boundaryPegs(pts);
  return { a2, B, I: (a2 - B + 2) / 2 };
}
/** √n as k√m with m square-free: { k, m }. */
export function sqrtParts(n) {
  let k = 1, m = n;
  for (let f = 2; f * f <= m; f++) while (m % (f * f) === 0) { m /= f * f; k *= f; }
  return { k, m };
}
/** A band's length, exact: whole units plus roots, { whole, roots: [{ k, m }] (m ascending), approx }. closed: back to
 *  the first peg. */
export function bandLength(pts, closed = true) {
  const by = new Map(); let approx = 0;
  const n = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], sq = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
    if (!sq) continue;
    const r = sqrtParts(sq);
    by.set(r.m, (by.get(r.m) || 0) + r.k); approx += Math.sqrt(sq);
  }
  const roots = [...by.entries()].filter(([m]) => m !== 1).sort((a, b) => a[0] - b[0]).map(([m, k]) => ({ k, m }));
  return { whole: by.get(1) || 0, roots, approx };
}
/** "12", "4 + 2√2", "√5 + 2√13", "0". */
export function lengthText(L) {
  const parts = [];
  if (L.whole) parts.push(String(L.whole));
  for (const r of L.roots) parts.push(`${r.k === 1 ? '' : r.k}√${r.m}`);
  return parts.join(' + ') || '0';
}
/** Rounded to 2 decimals, for "≈ 10.83" (only when the length has a root in it). */
export const approxText = (L, intl = 'en') => new Intl.NumberFormat(intl, { maximumFractionDigits: 2, useGrouping: false }).format(L.approx);

// ================================================================ pattern blocks
/** What each block is worth in sixths of the yellow hexagon (the square and the thin rhombus are not fractions of it). */
export const BLOCKS = { hex: 6, trap: 3, rhom: 2, tri: 1, sq: null, thin: null };
export const BLOCK_KINDS = Object.keys(BLOCKS);
const R3 = Math.sqrt(3) / 2;
/** Each block's corners (edge length 1, the first corner at 0,0; y down as on screen). */
export const BLOCK_SHAPES = {
  hex: [[0, 0], [1, 0], [1.5, -R3], [1, -2 * R3], [0, -2 * R3], [-0.5, -R3]],
  trap: [[0, 0], [2, 0], [1.5, -R3], [0.5, -R3]],
  rhom: [[0, 0], [1, 0], [1.5, -R3], [0.5, -R3]],
  tri: [[0, 0], [1, 0], [0.5, -R3]],
  sq: [[0, 0], [1, 0], [1, -1], [0, -1]],
  thin: [[0, 0], [1, 0], [1 + R3, -0.5], [R3, -0.5]],
};
/** A block on the board: its kind, its corner on the triangle grid (x in half edges, y in rows; x + y even) and its turn
 *  (r × 30°). -> its corners in edge units. */
export function blockPoints(b) {
  const a = (-b.r * Math.PI) / 6, c = Math.cos(a), s = Math.sin(a), ox = b.x / 2, oy = b.y * R3;
  return BLOCK_SHAPES[b.k].map(([x, y]) => [ox + x * c - y * s, oy + x * s + y * c]);
}
/** The nearest grid point (x + y even) to a place in edge units. */
export function snapBlock(px, py) {
  let best = null;
  const y0 = Math.round(py / R3);
  for (let y = y0 - 1; y <= y0 + 1; y++) {
    let x = Math.round(px * 2); if ((x + y) % 2) x += px * 2 > x ? 1 : -1;
    for (const xx of [x - 2, x, x + 2]) { const d = (xx / 2 - px) ** 2 + (y * R3 - py) ** 2; if (!best || d < best.d) best = { x: xx, y, d }; }
  }
  return { x: best.x, y: best.y };
}
/** How much of a hexagon the blocks make (the hexagon, trapezoid, blue rhombus and triangle): { n, d } in lowest terms,
 *  and the count of each kind. */
export function hexFraction(blocks) {
  const count = Object.fromEntries(BLOCK_KINDS.map(k => [k, 0]));
  let sixths = 0;
  for (const b of blocks) { count[b.k]++; if (BLOCKS[b.k]) sixths += BLOCKS[b.k]; }
  return { ...simplify(sixths, 6), sixths, count };
}

// ================================================================ angles
/** The angle's name: zero, acute, right, obtuse, straight, reflex or full (a whole turn). */
export function angleKind(deg) {
  const a = ((Math.round(deg) % 361) + 361) % 361;
  if (a === 0) return 'zero';
  if (a < 90) return 'acute';
  if (a === 90) return 'right';
  if (a < 180) return 'obtuse';
  if (a === 180) return 'straight';
  if (a < 360) return 'reflex';
  return 'full';
}
export const ANGLE_KINDS = ['zero', 'acute', 'right', 'obtuse', 'straight', 'reflex', 'full'];
/** The ray's direction (degrees anticlockwise from the first ray) from a point relative to the vertex (y up), snapped
 *  to a step; 0 stays 0 and a full turn is 360 only when it was nearly there already. */
export function angleAt(dx, dy, step = 1, was = 0) {
  let a = (Math.atan2(dy, dx) * 180) / Math.PI; if (a < 0) a += 360;
  a = Math.round(a / step) * step;
  if (a >= 360) a = 0;
  if (a === 0 && was > 270) return 360;
  return a;
}

// ================================================================ 3D shapes and nets (plain SVG, no WebGL)
// Every solid is a list of corners (z up, the base on z = 0) and faces; each face but the base hangs on a parent face by
// a shared edge (the net's fold lines). foldPose() turns each face about its hinge, so 0 is the flat net and 1 the solid.
const N_ROUND = 24;
const poly = (n, r, z, rot = 0) => Array.from({ length: n }, (_, i) => { const a = rot + (2 * Math.PI * i) / n; return [r * Math.cos(a), r * Math.sin(a), z]; });
function prism(n, r, h, rot) {
  const v = [...poly(n, r, 0, rot), ...poly(n, r, h, rot)];
  const faces = [{ v: Array.from({ length: n }, (_, i) => n - 1 - i), parent: -1, base: true }];
  for (let i = 0; i < n; i++) faces.push({ v: [i, (i + 1) % n, n + (i + 1) % n, n + i], parent: i === 0 ? 0 : faces.length - 1 });
  faces.push({ v: Array.from({ length: n }, (_, i) => n + i), parent: 1, top: true });
  return { v, faces };
}
function pyramid(n, r, h, rot) {
  const v = [...poly(n, r, 0, rot), [0, 0, h]];
  const faces = [{ v: Array.from({ length: n }, (_, i) => n - 1 - i), parent: -1, base: true }];
  for (let i = 0; i < n; i++) faces.push({ v: [i, (i + 1) % n, n], parent: 0 });
  return { v, faces };
}
/** A round solid: its side is N_ROUND thin strips (a cylinder) or slices (a cone) hinged one to the next, so it unrolls
 *  into a rectangle or a sector; the circles hang on the first strip. */
function cylinder(r, h) {
  const n = N_ROUND, s = prism(n, r, h, -Math.PI / 2 - Math.PI / n);
  s.faces.forEach((f, i) => { if (i >= 1 && i <= n) { f.curved = true; f.parent = i === 1 ? 0 : i - 1; } });
  return s;
}
function cone(r, h) {
  const n = N_ROUND, s = pyramid(n, r, h, -Math.PI / 2 - Math.PI / n);
  s.faces.forEach((f, i) => { if (i >= 1) { f.curved = true; f.parent = i === 1 ? 0 : i - 1; } });
  return s;
}
/** A cuboid 2 × 1 × 1 on its long side; a cube; prisms and pyramids on a regular base. */
const box = (a, b, c) => {
  const v = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]].map(([x, y, z]) => [x - a / 2, y - b / 2, z]);
  return { v, faces: [{ v: [3, 2, 1, 0], parent: -1, base: true }, { v: [0, 1, 5, 4], parent: 0 }, { v: [1, 2, 6, 5], parent: 0 }, { v: [2, 3, 7, 6], parent: 0 }, { v: [3, 0, 4, 7], parent: 0 }, { v: [4, 5, 6, 7], parent: 1, top: true }] };
};
export const SOLIDS = {
  cube: { make: () => box(1.6, 1.6, 1.6), f: 6, e: 12, vx: 8 },
  cuboid: { make: () => box(2.4, 1.2, 1.2), f: 6, e: 12, vx: 8 },
  triprism: { make: () => prism(3, 1.05, 1.9, -Math.PI / 2), f: 5, e: 9, vx: 6 },
  hexprism: { make: () => prism(6, 0.95, 1.5, 0), f: 8, e: 18, vx: 12 },
  sqpyramid: { make: () => pyramid(4, 1.2, 1.6, Math.PI / 4), f: 5, e: 8, vx: 5 },
  tripyramid: { make: () => pyramid(3, 1.25, 1.5, -Math.PI / 2), f: 4, e: 6, vx: 4 },
  cylinder: { make: () => cylinder(0.75, 1.8), f: 3, e: 2, vx: 0, curved: 1, flat: 2 },
  cone: { make: () => cone(0.95, 1.9), f: 2, e: 1, vx: 1, curved: 1, flat: 1 },
};
export const SOLID_KINDS = Object.keys(SOLIDS);
/** Faces, edges and corners counted from the model itself (flat-faced solids): { f, e, vx }. */
export function countSolid(kind) {
  const s = SOLIDS[kind].make(), edges = new Set();
  for (const f of s.faces) f.v.forEach((a, i) => { const b = f.v[(i + 1) % f.v.length]; edges.add(a < b ? `${a}-${b}` : `${b}-${a}`); });
  return { f: s.faces.length, e: edges.size, vx: s.v.length };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const crs = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const normal = pts => unit(crs(sub(pts[1], pts[0]), sub(pts[2], pts[0])));
/** A turn about the line through p along unit axis u by angle a, as a 3 × 4 matrix. */
function rotAbout(p, u, a) {
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c, [x, y, z] = u;
  const R = [[t * x * x + c, t * x * y - s * z, t * x * z + s * y], [t * x * y + s * z, t * y * y + c, t * y * z - s * x], [t * x * z - s * y, t * y * z + s * x, t * z * z + c]];
  const Rp = R.map(r => dot(r, p));
  return R.map((r, i) => [...r, p[i] - Rp[i]]);
}
const apply = (M, v) => M.map(r => r[0] * v[0] + r[1] * v[1] + r[2] * v[2] + r[3]);
const compose = (A, B) => A.map(r => [0, 1, 2].map(j => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]).concat([r[0] * B[0][3] + r[1] * B[1][3] + r[2] * B[2][3] + r[3]]));
const I3 = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0]];
const cache = new Map();
/** The solid with each face's hinge worked out: { v, faces: [{ v, parent, hinge: [a, b], angle }] }. */
export function solidModel(kind) {
  if (cache.has(kind)) return cache.get(kind);
  const s = SOLIDS[kind].make();
  for (const f of s.faces) {
    if (f.parent < 0) continue;
    const p = s.faces[f.parent];
    const shared = f.v.filter(x => p.v.includes(x));
    const [a, b] = shared;
    const np = normal(p.v.map(i => s.v[i])), nf = normal(f.v.map(i => s.v[i]));
    const u = unit(sub(s.v[b], s.v[a])), theta = Math.acos(Math.max(-1, Math.min(1, dot(np, nf))));
    // Unfolding turns the face until it lies flat beside its parent (its normal the parent's): pick that way round.
    const try1 = apply(rotAbout([0, 0, 0], u, theta), nf);
    f.hinge = [a, b]; f.angle = dot(try1, np) > 0.999 ? theta : -theta;
  }
  cache.set(kind, s);
  return s;
}
/** Every face's corners at fold t (0 the flat net, 1 the solid). */
export function foldPose(kind, t) {
  const s = solidModel(kind), M = new Array(s.faces.length), u = 1 - Math.max(0, Math.min(1, t));
  const pose = i => {
    if (M[i]) return M[i];
    const f = s.faces[i];
    if (f.parent < 0) return (M[i] = I3);
    const pa = s.v[f.hinge[0]], ax = unit(sub(s.v[f.hinge[1]], pa));
    return (M[i] = compose(pose(f.parent), rotAbout(pa, ax, u * f.angle)));
  };
  return s.faces.map((f, i) => f.v.map(k => apply(pose(i), s.v[k])));
}

// ================================================================ transformations on a grid
export const SHAPES = {
  tri: [[1, 1], [4, 1], [1, 3]],
  flag: [[1, 1], [1, 5], [3, 4], [1, 3]],
  ell: [[1, 1], [4, 1], [4, 2], [2, 2], [2, 4], [1, 4]],
  arrow: [[1, 2], [3, 2], [3, 1], [5, 3], [3, 5], [3, 4], [1, 4]],
};
/** One point moved: translate by (dx, dy); reflect in the x axis, the y axis, y = x or y = −x; rotate 90, 180 or 270
 *  degrees anticlockwise about the origin. */
export function transformPoint([x, y], t) {
  if (t.op === 'translate') return [x + t.dx, y + t.dy];
  if (t.op === 'reflect') return t.axis === 'x' ? [x, -y] : t.axis === 'y' ? [-x, y] : t.axis === 'yx' ? [y, x] : [-y, -x];
  if (t.op === 'rotate') return t.turn === 90 ? [-y, x] : t.turn === 180 ? [-x, -y] : [y, -x];
  return [x, y];
}
/** The rule as an arrow: "(x, y) → (x + 3, y − 2)", "(x, y) → (−y, x)". */
export function ruleText(t) {
  const sh = (v, n) => (n ? `${v} ${n > 0 ? '+' : '−'} ${Math.abs(n)}` : v);
  const to = t.op === 'translate' ? [sh('x', t.dx), sh('y', t.dy)] : t.op === 'reflect' ? { x: ['x', '−y'], y: ['−x', 'y'], yx: ['y', 'x'], ynx: ['−y', '−x'] }[t.axis]
    : { 90: ['−y', 'x'], 180: ['−x', '−y'], 270: ['y', '−x'] }[t.turn];
  return `(x, y) → (${to[0]}, ${to[1]})`;
}
export const pointText = ([x, y]) => `(${minus(x)}, ${minus(y)})`;

// ================================================================ the balance scale: x-boxes and unit weights
/** What a side weighs when each x-box weighs x. */
export const weigh = (side, x) => side.x * x + side.u;
/** −1: the left side is down, 1: the right side is down, 0: level. */
export const tip = (L, R, x) => Math.sign(weigh(R, x) - weigh(L, x));
export const BAL_MAX = { x: 9, u: 30 };
/** Do something to one side or both: 'addx' | 'subx' | 'add1' | 'sub1' | 'div' (share into n equal groups, keep one).
 *  -> the new sides, or null when it can't be done (nothing to take, too many, not shared evenly). */
export function balanceOp(L, R, op, where = 'both', n = 2) {
  const one = s => {
    if (op === 'addx') return s.x < BAL_MAX.x ? { ...s, x: s.x + 1 } : null;
    if (op === 'subx') return s.x > 0 ? { ...s, x: s.x - 1 } : null;
    if (op === 'add1') return s.u < BAL_MAX.u ? { ...s, u: s.u + 1 } : null;
    if (op === 'sub1') return s.u > 0 ? { ...s, u: s.u - 1 } : null;
    if (op === 'div') return n > 1 && s.x % n === 0 && s.u % n === 0 ? { x: s.x / n, u: s.u / n } : null;
    return null;
  };
  const l = where === 'right' ? L : one(L), r = where === 'left' ? R : one(R);
  return l && r ? { L: l, R: r } : null;
}
/** Solved: x on its own on one side, only unit weights on the other. -> the value, or null. */
export function solvedValue(L, R) {
  if (L.x === 1 && L.u === 0 && R.x === 0) return R.u;
  if (R.x === 1 && R.u === 0 && L.x === 0) return L.u;
  return null;
}
/** "3x + 2", "x", "4", "0". */
export function sideText(s) {
  const xs = s.x ? `${s.x === 1 ? '' : s.x}x` : '';
  return xs && s.u ? `${xs} + ${s.u}` : xs || String(s.u);
}
/** A new equation with x as the answer: ax + b = cx + d (a > c), everything within the scale's limits. rnd() in [0, 1). */
export function makeEquation(x, rnd = Math.random) {
  for (let k = 0; k < 200; k++) {
    const a = 2 + Math.floor(rnd() * 4), c = Math.floor(rnd() * a), b = Math.floor(rnd() * 8), d = (a - c) * x + b;
    if (d <= BAL_MAX.u && a <= BAL_MAX.x) return { L: { x: a, u: b }, R: { x: c, u: d } };
  }
  return { L: { x: 1, u: 0 }, R: { x: 0, u: x } };
}

// ================================================================ algebra tiles
export const TILE_KINDS = ['x2', 'x', '1'];
/** How many of each tile, positive and negative: { x2: { p, n }, x: {...}, 1: {...} }. */
export function tileCounts(tiles) {
  const c = Object.fromEntries(TILE_KINDS.map(k => [k, { p: 0, n: 0 }]));
  for (const t of tiles) c[t.k][t.neg ? 'n' : 'p']++;
  return c;
}
/** The tiles simplified: ax² + bx + c as { a, b, c }. */
export function simplifyTiles(tiles) { const c = tileCounts(tiles); return { a: c.x2.p - c.x2.n, b: c.x.p - c.x.n, c: c['1'].p - c['1'].n }; }
const termText = (coef, k, first) => {
  const a = Math.abs(coef), body = k === '1' ? String(a) : `${a === 1 ? '' : a}${k === 'x2' ? 'x²' : 'x'}`;
  return first ? `${coef < 0 ? '−' : ''}${body}` : ` ${coef < 0 ? '−' : '+'} ${body}`;
};
/** "2x² − x + 2", "−3", "0". */
export function polyText({ a, b, c }) {
  let out = '';
  for (const [coef, k] of [[a, 'x2'], [b, 'x'], [c, '1']]) if (coef) out += termText(coef, k, !out);
  return out || '0';
}
/** The tiles as they lie, before zero pairs go: "x² + x² + 2x − x + 3 − 1" grouped as "2x² + 2x − x + 3 − 1". */
export function rawText(tiles) {
  const c = tileCounts(tiles); let out = '';
  for (const k of TILE_KINDS) for (const [n, sign] of [[c[k].p, 1], [c[k].n, -1]]) if (n) out += termText(sign * n, k, !out);
  return out || '0';
}
/** Which tiles are in a zero pair (a positive and a negative of the same kind): their indexes. */
export function zeroPairs(tiles) {
  const out = new Set();
  for (const k of TILE_KINDS) {
    const pos = [], neg = [];
    tiles.forEach((t, i) => { if (t.k === k) (t.neg ? neg : pos).push(i); });
    for (let i = 0; i < Math.min(pos.length, neg.length); i++) { out.add(pos[i]); out.add(neg[i]); }
  }
  return out;
}
/** The tiles with every zero pair taken away (the value never changes). */
export const removeZeroPairs = tiles => { const z = zeroPairs(tiles); return tiles.filter((_, i) => !z.has(i)); };
/** The value at a number x (to check that simplifying keeps it). */
export const tilesValue = (tiles, x) => tiles.reduce((s, t) => s + (t.neg ? -1 : 1) * (t.k === 'x2' ? x * x : t.k === 'x' ? x : 1), 0);

// ================================================================ coins and money (whole cents; original simple designs)
/** Each currency's coins and notes in cents (or plain units for the generic set). note: drawn as a note. */
export const CURRENCIES = {
  usd: { code: 'USD', items: [[1], [5], [10], [25], [50], [100], [500, 1], [1000, 1], [2000, 1]] },
  eur: { code: 'EUR', items: [[1], [2], [5], [10], [20], [50], [100], [200], [500, 1], [1000, 1], [2000, 1]] },
  gbp: { code: 'GBP', items: [[1], [2], [5], [10], [20], [50], [100], [200], [500, 1], [1000, 1], [2000, 1]] },
  gen: { code: '', items: [[1], [2], [5], [10], [20], [50], [100]] },
};
export const CURRENCY_IDS = Object.keys(CURRENCIES);
export const denoms = cur => CURRENCIES[cur].items.map(([v, note]) => ({ v, note: !!note }));
/** The currency a page's language uses: US English dollars, British English pounds, euro languages euros, else the
 *  generic set (plain numbers, no currency). */
export function currencyFor(intl) {
  const l = String(intl || 'en');
  if (/^en-GB/i.test(l)) return 'gbp';
  if (/^en/i.test(l)) return 'usd';
  if (/^(de|fr|es|it|nl|pt)\b/i.test(l)) return 'eur';
  return 'gen';
}
/** The money on the mat: counts[i] of denomination i. */
export const moneyTotal = (cur, counts) => denoms(cur).reduce((s, d, i) => s + d.v * (counts[i] || 0), 0);
/** The fewest coins and notes for an amount (these sets are all "greedy-safe"): counts per denomination. */
export function fewest(cur, amount) {
  const ds = denoms(cur), out = ds.map(() => 0);
  let left = Math.max(0, Math.round(amount));
  for (let i = ds.length - 1; i >= 0; i--) { out[i] = Math.floor(left / ds[i].v); left -= out[i] * ds[i].v; }
  return out;
}
/** Making change by counting up from what it costs to what was paid, smallest coins first:
 *  -> [{ add, to }] (37 → 38 → 39 → 40 → 50 → 75 → 100). null when what was paid is not enough. */
export function countUp(cur, cost, paid) {
  if (paid < cost) return null;
  const ds = denoms(cur), f = fewest(cur, paid - cost), steps = [];
  let at = cost;
  f.forEach((n, i) => { for (let k = 0; k < n; k++) { at += ds[i].v; steps.push({ add: ds[i].v, to: at }); } });
  return steps;
}
/** An amount as money in the reader's language ("$1.25", "1,25 €", "£0.40"), or a plain number for the generic set. */
export function moneyText(cur, cents, intl = 'en') {
  const c = CURRENCIES[cur];
  if (!c.code) return new Intl.NumberFormat(intl).format(cents);
  return new Intl.NumberFormat(intl, { style: 'currency', currency: c.code }).format(cents / 100);
}
/** A coin's face: "25¢", "1€"-like short marks drawn on our own simple coins (never real coin pictures). */
export function faceText(cur, v) {
  if (cur === 'gen') return String(v);
  if (cur === 'usd') return v < 100 ? `${v}¢` : `$${v / 100}`;
  if (cur === 'eur') return v < 100 ? `${v}c` : `€${v / 100}`;
  return v < 100 ? `${v}p` : `£${v / 100}`;
}

// ================================================================ chance lab
/** The outcomes and their exact chances: a coin (2), one die (6), the sum of two dice (2-12) or a spinner of n equal
 *  parts. -> [{ o, p: { n, d } }] */
export function outcomes(kind, dice = 1, parts = 4) {
  if (kind === 'coin') return [{ o: 'H', p: { n: 1, d: 2 } }, { o: 'T', p: { n: 1, d: 2 } }];
  if (kind === 'spinner') return Array.from({ length: parts }, (_, i) => ({ o: String(i + 1), p: { n: 1, d: parts } }));
  if (dice === 2) return Array.from({ length: 11 }, (_, i) => ({ o: String(i + 2), p: simplify(6 - Math.abs(i + 2 - 7), 36) }));
  return Array.from({ length: 6 }, (_, i) => ({ o: String(i + 1), p: { n: 1, d: 6 } }));
}
/** How many times we expect an outcome in so many trials, exact: { n, d }. */
export const expectedCount = (trials, p) => simplify(trials * p.n, p.d);
/** One trial: the index of the outcome. rnd() in [0, 1). */
export function trial(kind, dice, parts, rnd = Math.random) {
  if (kind === 'coin') return rnd() < 0.5 ? 0 : 1;
  if (kind === 'spinner') return Math.min(parts - 1, Math.floor(rnd() * parts));
  const d = () => 1 + Math.min(5, Math.floor(rnd() * 6));
  return dice === 2 ? d() + d() - 2 : d() - 1;
}
/** Run some trials: -> the counts added to the ones already there. */
export function runTrials(kind, dice, parts, n, counts = [], rnd = Math.random) {
  const out = outcomes(kind, dice, parts).map((_, i) => counts[i] || 0);
  for (let k = 0; k < n; k++) out[trial(kind, dice, parts, rnd)]++;
  return out;
}
/** A small seeded random source (tests, and the same shuffle every time for a question). */
export function seeded(seed) { let s = (seed >>> 0) || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ================================================================ letter tiles and word families (English phonics)
export const ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
export const isVowel = ch => VOWELS.has(String(ch).toLowerCase());
/** Word families (the rime) and the real words each makes with one or two letters in front (a short, kind list). */
export const FAMILIES = {
  at: ['bat', 'cat', 'fat', 'hat', 'mat', 'pat', 'rat', 'sat', 'vat', 'chat', 'flat', 'that'],
  an: ['ban', 'can', 'fan', 'man', 'pan', 'ran', 'tan', 'van', 'plan', 'than'],
  ap: ['cap', 'gap', 'lap', 'map', 'nap', 'rap', 'sap', 'tap', 'zap', 'clap', 'flap', 'snap', 'trap'],
  ig: ['big', 'dig', 'fig', 'jig', 'pig', 'rig', 'wig', 'twig'],
  in: ['bin', 'fin', 'pin', 'tin', 'win', 'chin', 'grin', 'shin', 'skin', 'spin', 'thin', 'twin'],
  ip: ['dip', 'hip', 'lip', 'rip', 'sip', 'tip', 'zip', 'chip', 'drip', 'flip', 'ship', 'skip', 'slip', 'trip'],
  op: ['bop', 'cop', 'hop', 'mop', 'pop', 'top', 'chop', 'drop', 'flop', 'shop', 'stop'],
  ot: ['cot', 'dot', 'got', 'hot', 'jot', 'lot', 'not', 'pot', 'rot', 'knot', 'plot', 'shot', 'spot'],
  ug: ['bug', 'dug', 'hug', 'jug', 'mug', 'pug', 'rug', 'tug', 'plug', 'slug', 'snug'],
  un: ['bun', 'fun', 'pun', 'run', 'sun', 'spun', 'stun'],
  et: ['get', 'jet', 'let', 'met', 'net', 'pet', 'set', 'vet', 'wet', 'yet'],
  en: ['den', 'hen', 'men', 'pen', 'ten', 'then', 'when'],
  ell: ['bell', 'cell', 'fell', 'sell', 'tell', 'well', 'yell', 'shell', 'smell', 'spell'],
  ake: ['bake', 'cake', 'lake', 'make', 'rake', 'take', 'wake', 'flake', 'shake', 'snake'],
  ine: ['dine', 'fine', 'line', 'mine', 'nine', 'pine', 'vine', 'shine', 'spine'],
};
export const FAMILY_IDS = Object.keys(FAMILIES);
/** The letters in front that make real words in a family (single letters and two-letter blends). */
export const onsetsOf = fam => [...new Set(FAMILIES[fam].map(w => w.slice(0, w.length - fam.length)))];
export const isFamilyWord = (fam, word) => !!FAMILIES[fam] && FAMILIES[fam].includes(String(word).toLowerCase());
/** Vowels and consonants in a word (letters only). */
export function letterCounts(word) {
  const ls = [...String(word).toLowerCase()].filter(c => /[a-z]/.test(c));
  const v = ls.filter(isVowel).length;
  return { letters: ls.length, vowels: v, consonants: ls.length - v };
}

// ================================================================ maps: simple original outlines and a grid map
const ll = pts => pts.map(([lon, lat]) => [Math.round(((lon + 180) / 360) * 1000), Math.round(((90 - lat) / 180) * 500)]);
/** The continents as simple outlines (our own drawing, much simplified), on a 1000 × 500 map; some have islands. */
export const CONTINENTS = {
  northAmerica: [ll([[-168, 66], [-162, 70], [-140, 70], [-125, 72], [-95, 75], [-80, 73], [-62, 68], [-62, 60], [-55, 52], [-66, 45], [-70, 42], [-76, 35], [-81, 31], [-80, 26], [-82, 29], [-90, 30], [-97, 27], [-97, 22], [-92, 18], [-87, 21], [-88, 15], [-83, 10], [-78, 8], [-80, 7], [-86, 11], [-92, 14], [-105, 20], [-110, 24], [-114, 31], [-117, 33], [-124, 40], [-124, 48], [-130, 55], [-140, 60], [-152, 58], [-165, 55], [-160, 60], [-166, 62]]),
    ll([[-55, 60], [-44, 60], [-20, 70], [-18, 77], [-30, 83], [-60, 82], [-72, 78], [-58, 70]])],
  southAmerica: [ll([[-78, 8], [-72, 12], [-62, 11], [-52, 5], [-50, 0], [-35, -5], [-35, -9], [-39, -15], [-41, -22], [-48, -26], [-53, -34], [-58, -38], [-63, -41], [-65, -45], [-68, -50], [-69, -55], [-74, -53], [-75, -45], [-73, -37], [-71, -30], [-70, -18], [-76, -14], [-81, -6], [-80, -1], [-77, 4]])],
  europe: [ll([[-5.6, 36], [-8.9, 37], [-9.5, 39], [-8.8, 42], [-9.2, 43.2], [-1.5, 43.4], [-1.2, 46], [-4.7, 48.4], [-1.6, 48.7], [1.6, 50.9], [4, 51.5], [5, 53.3], [8.6, 53.9],
      [8.1, 55.5], [8.6, 57.1], [10.6, 57.7], [10.5, 56], [9.9, 54.8], [12, 54.2], [14.2, 53.9], [18.6, 54.6], [21, 55.3], [21.1, 56.9], [24, 57.3], [23.5, 59.2], [28, 59.5],
      [30, 60.5], [29, 64], [29, 67], [32, 69], [40, 67], [44, 68], [60, 69], [60, 55], [53, 47], [50, 45], [47, 42], [41.5, 41.6], [39, 44.5], [37.5, 45.2], [35, 45],
      [33.5, 44.4], [31, 46.6], [29.7, 45.3], [28, 43], [28.9, 41.3], [26, 40.6], [24, 40.5], [22.9, 40.6], [23.5, 38], [22, 36.5], [21.1, 38], [19.5, 40], [19.4, 41.8],
      [15.5, 44], [13.6, 45.7], [12.3, 45.2], [12.5, 44], [14, 42.3], [16, 41.4], [18.5, 40.2], [16.6, 38.9], [15.7, 38], [15.6, 40.1], [14, 40.8], [12.3, 41.7],
      [10.5, 42.9], [10.2, 43.9], [8.7, 44.4], [7, 43.6], [4, 43.5], [3.1, 42.5], [3.2, 41.8], [0.9, 41], [-0.3, 39.4], [0.2, 38.7], [-0.7, 37.6], [-2.1, 36.7], [-4.4, 36.7]]),
    // Scandinavia, Great Britain, Ireland, Iceland, Sicily
    ll([[5, 59], [5.5, 62], [10, 64], [14, 67], [17, 69], [20, 70], [25, 71], [28, 71], [29.5, 69.8], [27, 68.5], [24, 66], [22, 65.6], [21, 64], [19, 63], [17.5, 61], [18.5, 60], [16.5, 57], [14, 55.5], [12.5, 56], [11.8, 58], [10.5, 59], [8, 58.1]]),
    ll([[-5.7, 50], [1.4, 51.2], [1.7, 52.7], [0, 53.5], [-1.6, 55.6], [-2, 57.6], [-3.3, 58.6], [-5, 58.6], [-6.2, 56.5], [-4.9, 55], [-3, 54.5], [-3.1, 53.3], [-4.6, 52.8], [-5.3, 51.7], [-3, 51.4]]),
    ll([[-10, 51.5], [-6, 52], [-6, 55.2], [-8, 55.2], [-10, 54]]), ll([[-24, 64], [-14, 64], [-14, 66.5], [-22, 66.5]]), ll([[12.4, 38.1], [15.6, 38.3], [15.1, 36.7]])],
  asia: [ll([[60, 55], [60, 69], [70, 73], [90, 76], [110, 77], [130, 72], [150, 71], [170, 70], [180, 68], [180, 65], [170, 60], [163, 58], [156, 51], [141, 53], [140, 46], [132, 43], [129, 35], [126, 38], [122, 40], [121, 31], [117, 24], [108, 21], [106, 10], [100, 13], [100, 4], [104, 1], [98, 8], [98, 16], [94, 17], [90, 22], [87, 21], [80, 15], [77, 8], [73, 18], [72, 21], [67, 25], [57, 25], [56, 27], [52, 24], [56, 18], [52, 16], [44, 12], [42, 16], [39, 22], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [29, 41], [36, 41], [41, 41], [47, 42], [50, 45], [53, 47]]),
    ll([[130, 31], [135, 34], [140, 35], [142, 40], [141, 45], [140, 42], [136, 36], [131, 34]]), ll([[109, -2], [117, -4], [119, 1], [117, 7], [110, 2]]), ll([[95, 5], [106, -6], [103, -5], [98, 0]]), ll([[131, -1], [141, -3], [150, -10], [143, -9], [135, -4]])],
  africa: [ll([[-17, 21], [-17, 15], [-15, 11], [-8, 4], [-2, 5], [4, 6], [9, 4], [9, -1], [13, -6], [12, -12], [14, -23], [18, -34], [20, -35], [26, -34], [32, -28], [36, -20], [40, -15], [40, -10], [39, -5], [42, 0], [51, 12], [44, 11], [43, 13], [39, 16], [36, 23], [33, 28], [32, 31], [25, 32], [20, 31], [11, 33], [10, 37], [3, 37], [-6, 35], [-10, 30], [-13, 27]]),
    ll([[44, -25], [47, -25], [50, -15], [49, -12], [44, -17]])],
  australia: [ll([[113, -22], [114, -27], [115, -34], [124, -34], [131, -31], [138, -35], [141, -38], [147, -39], [150, -37], [153, -28], [153, -25], [146, -19], [145, -15], [142, -11], [141, -17], [136, -12], [132, -11], [129, -15], [123, -17], [119, -20]]),
    ll([[172, -34], [178, -38], [175, -41], [171, -44], [167, -46], [170, -42]])],
  antarctica: [ll([[-180, -78], [-160, -78], [-140, -75], [-100, -73], [-75, -72], [-60, -64], [-58, -63], [-62, -70], [-40, -78], [-20, -73], [0, -70], [30, -69], [60, -67], [90, -66], [120, -66], [150, -68], [165, -71], [170, -76], [180, -78], [180, -85], [-180, -85]])],
};
export const CONTINENT_IDS = Object.keys(CONTINENTS);
/** Where each continent's and ocean's name goes on the world map. */
export const PLACE_LABELS = {
  northAmerica: [235, 120], southAmerica: [320, 310], europe: [530, 108], asia: [740, 130], africa: [550, 255], australia: [865, 330], antarctica: [500, 470],
  pacific: [95, 250], atlantic: [400, 210], indian: [700, 320], arctic: [500, 22], southern: [215, 425],
};
export const OCEAN_IDS = ['pacific', 'atlantic', 'indian', 'arctic', 'southern'];
function inPoly([x, y], pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
/** The continent at a point of the world map, or null (the sea). */
export const continentAt = (x, y) => CONTINENT_IDS.find(id => CONTINENTS[id].some(p => inPoly([x, y], p))) || null;
/** The grid map: 10 columns (A-J) and 5 rows (1-5) of 100 × 100 on the same 1000 × 500 map. -> "C4". */
export const GRID_COLS = 10, GRID_ROWS = 5;
export const gridRef = (x, y) => `${String.fromCharCode(65 + Math.max(0, Math.min(GRID_COLS - 1, Math.floor(x / 100))))}${Math.max(1, Math.min(GRID_ROWS, Math.floor(y / 100) + 1))}`;
