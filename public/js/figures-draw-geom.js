// Figures, "Draw it": the geometry of a shape drawn on a dot grid (public/js/figures-draw.js draws the grid; the editor,
// public/js/figures-editor.js, uses both). Pure functions, no page: the tests run them in Node. Corners sit on whole
// numbers, so every test that matters is exact: two sides are equal when their squared lengths are the same whole number,
// parallel when the cross product of their directions is 0, at a right angle when the dot product is 0. A length is
// exact too: the square root of a whole number, written k√r ({ sqrt: r, times: k }, the shapes' own length form).
// Only the angles are decimals (to 4 places where a shape takes one, written on the figure to 0.1°).

export const NAMES = 'ABCDEFGHIJ'.split('');
const sub = (p, q) => [q[0] - p[0], q[1] - p[1]];
const cross = (u, w) => u[0] * w[1] - u[1] * w[0];
const dot = (u, w) => u[0] * w[0] + u[1] * w[1];
const d2Of = (p, q) => { const v = sub(p, q); return dot(v, v); };
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; };
const r1 = x => Math.round(x * 10) / 10;
const r4 = x => Math.round(x * 1e4) / 1e4;
/** An angle for shape data: the measure to 4 places (so areas and lengths worked out from it stay true), written on the
 *  figure to 0.1° (a label within half a degree is true): { A: 53.1301, labels: { A: 53.1 } }. */
function angle(name, deg) {
  const v = r4(deg), l = r1(deg);
  return v === l ? { [name]: v } : { [name]: v, labels: { [name]: l } };
}

/** n = k² r with r square-free: [k, r]. */
export function rootParts(n) {
  let k = 1, r = n;
  for (let f = 2; f * f <= r; f++) while (r % (f * f) === 0) { r /= f * f; k *= f; }
  return [k, r];
}
/** A length whose square is the whole number d2, as shape data: 5, { sqrt: 13 } or { sqrt: 5, times: 2 }. */
export function exactLength(d2) {
  const [k, r] = rootParts(d2);
  return r === 1 ? k : k === 1 ? { sqrt: r } : { sqrt: r, times: k };
}
/** The same length written out: "5", "√13", "2√5". */
export function lengthText(d2) {
  const [k, r] = rootParts(d2);
  return r === 1 ? String(k) : `${k === 1 ? '' : k}√${r}`;
}
/** A length in shape data (a number, [n, d] or { sqrt, times }) as a number. */
export function lengthValue(v) {
  if (typeof v === 'number') return v;
  if (Array.isArray(v) && v.length === 2) return v[0] / v[1];
  if (v && typeof v === 'object' && typeof v.sqrt === 'number') return (typeof v.times === 'number' ? v.times : 1) * Math.sqrt(v.sqrt);
  return NaN;
}
/** A length in shape data written out, or '' for a plain number. */
export function lengthLabel(v) {
  if (Array.isArray(v) && v.length === 2) return `${v[0]}/${v[1]}`;
  if (v && typeof v === 'object' && typeof v.sqrt === 'number') { const t = typeof v.times === 'number' ? v.times : 1; return `${t === 1 ? '' : t}√${v.sqrt}`; }
  return '';
}
/** A sum of lengths written exactly, like terms together: "6 + 2√13" (whole numbers first, then roots smallest first). */
export function sumText(d2s) {
  const by = new Map();
  for (const d2 of d2s) { const [k, r] = rootParts(d2); by.set(r, (by.get(r) || 0) + k); }
  return [...by].sort((a, b) => a[0] - b[0]).map(([r, k]) => (r === 1 ? String(k) : `${k === 1 ? '' : k}√${r}`)).join(' + ');
}

/** Do segments p1p2 and p3p4 meet (touching counts)? */
function meet(p1, p2, p3, p4) {
  const o = (a, b, c) => Math.sign(cross(sub(a, b), sub(a, c)));
  const on = (a, b, c) => Math.min(a[0], b[0]) <= c[0] && c[0] <= Math.max(a[0], b[0]) && Math.min(a[1], b[1]) <= c[1] && c[1] <= Math.max(a[1], b[1]);
  const d1 = o(p3, p4, p1), d2 = o(p3, p4, p2), d3 = o(p1, p2, p3), d4 = o(p1, p2, p4);
  if (d1 !== d2 && d3 !== d4 && d1 && d2 && d3 && d4) return true;
  return (!d1 && on(p3, p4, p1)) || (!d2 && on(p3, p4, p2)) || (!d3 && on(p1, p2, p3)) || (!d4 && on(p1, p2, p4));
}

/**
 * Everything about a closed shape with corners pts ([[x, y], ...], whole numbers), named in order by names (A, B, C...).
 * -> { ok: false, why: 'few' | 'same' | 'line' | 'cross', need } or { ok: true, n, names, pts, sides: [{ name, d2, value,
 * exact, text }], angles: [{ name, deg, right }], perimeter, perimeterText, area, convex, ccw }.
 * 'same': two corners on one dot; 'line': three corners in a straight line (two sides along one line, or a flat triangle);
 * 'cross': two sides cross.
 */
export function analyze(pts, names = NAMES) {
  const n = pts.length;
  if (n < 3) return { ok: false, why: 'few', need: 3 - n };
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (pts[i][0] === pts[j][0] && pts[i][1] === pts[j][1]) return { ok: false, why: 'same', at: [i, j] };
  const turn = [];
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], q = pts[i], r = pts[(i + 1) % n];
    const c = cross(sub(p, q), sub(q, r));
    if (c === 0) return { ok: false, why: 'line', at: [i] };
    turn.push(c);
  }
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    if (j === i + 1 || (i === 0 && j === n - 1)) continue;
    if (meet(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return { ok: false, why: 'cross', at: [i, j] };
  }
  let a2 = 0;
  for (let i = 0; i < n; i++) a2 += cross(pts[i], pts[(i + 1) % n]);
  const ccw = a2 > 0, convex = turn.every(c => (c > 0) === ccw);
  const nm = i => names[i % n];
  const sides = pts.map((p, i) => { const d2 = d2Of(p, pts[(i + 1) % n]); return { name: `${nm(i)}${nm(i + 1)}`, d2, value: Math.sqrt(d2), exact: exactLength(d2), text: lengthText(d2) }; });
  const angles = pts.map((q, i) => {
    const u = sub(q, pts[(i + n - 1) % n]), w = sub(q, pts[(i + 1) % n]);
    let deg = (Math.acos(Math.max(-1, Math.min(1, dot(u, w) / Math.sqrt(dot(u, u) * dot(w, w))))) * 180) / Math.PI;
    if ((turn[i] > 0) !== ccw) deg = 360 - deg;
    return { name: nm(i), deg, right: dot(u, w) === 0, dot: dot(u, w) };
  });
  const perimeter = sides.reduce((s, x) => s + x.value, 0);
  return { ok: true, n, names: pts.map((p, i) => nm(i)), pts, sides, angles, perimeter, perimeterText: sumText(sides.map(s => s.d2)), area: Math.abs(a2) / 2, convex, ccw };
}

/** A triangle's type: { byAngles: 'right' | 'acute' | 'obtuse', bySides: 'equilateral' | 'isosceles' | 'scalene', right }. */
export function triangleType(info) {
  const right = info.angles.find(a => a.right);
  const byAngles = right ? 'right' : info.angles.some(a => a.dot < 0) ? 'obtuse' : 'acute';
  const [a, b, c] = info.sides.map(s => s.d2);
  const bySides = a === b && b === c ? 'equilateral' : a === b || b === c || a === c ? 'isosceles' : 'scalene';
  return { byAngles, bySides, right: right ? right.name : null };
}

/**
 * A quadrilateral's most special name, from exact tests on its corners:
 * 'square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid' (exactly one pair of parallel sides; isosceles and
 * right are flags), 'kite' (two pairs of equal sides next to each other, not a rhombus), 'concave' or 'quad'.
 * -> { type, isosceles, right, pair: 0 | 1 (which opposite sides are parallel: P0P1 ∥ P2P3, or P1P2 ∥ P3P0) }
 */
export function quadType(info) {
  const p = info.pts, e = i => sub(p[i], p[(i + 1) % 4]), s = info.sides.map(x => x.d2);
  if (!info.convex) return { type: 'concave' };
  const par0 = cross(e(0), e(2)) === 0, par1 = cross(e(1), e(3)) === 0;
  const allRight = info.angles.every(a => a.right), anyRight = info.angles.some(a => a.right);
  if (par0 && par1) return { type: allRight ? (s[0] === s[1] ? 'square' : 'rectangle') : s[0] === s[1] ? 'rhombus' : 'parallelogram' };
  if (par0 || par1) {
    const pair = par0 ? 0 : 1, legs = pair === 0 ? [s[1], s[3]] : [s[0], s[2]];
    return { type: 'trapezoid', pair, isosceles: legs[0] === legs[1], right: anyRight };
  }
  if ((s[0] === s[1] && s[2] === s[3]) || (s[1] === s[2] && s[3] === s[0])) return { type: 'kite' };
  return { type: 'quad' };
}

/** Which kind a shape's name belongs to ('square' -> 'rectangle'), for "open the right editor"; 'grid' plots any polygon. */
export const KIND_OF_TYPE = { triangle: 'triangle', square: 'rectangle', rectangle: 'rectangle', rhombus: 'parallelogram', parallelogram: 'parallelogram', trapezoid: 'trapezoid', kite: 'kite', concave: 'grid', quad: 'grid' };
/** The shape names each kind takes. */
export const TAKES = { rectangle: ['rectangle', 'square'], parallelogram: ['parallelogram', 'rhombus'], trapezoid: ['trapezoid'], kite: ['kite'] };
/** A name that is a special case of what the kind would call it (a square is a parallelogram and a kite...), so the
 *  message says it has an editor of its own rather than "not a parallelogram". */
export const SPECIAL = { parallelogram: ['square', 'rectangle'], kite: ['square', 'rhombus'] };
/** How many corners each kind draws (the grid: 3 to 10). */
export const CORNERS = { triangle: [3, 3], rectangle: [4, 4], parallelogram: [4, 4], trapezoid: [4, 4], kite: [4, 4], grid: [3, 10] };
export const DRAWABLE = Object.keys(CORNERS);

/** The corners renamed: order[k] is the index in pts of the corner named NAMES[k]. */
const rot = (k, n = 4) => Array.from({ length: n }, (_, i) => (i + k) % n);
const rev = o => [o[1], o[0], o[3], o[2]];
const angleOf = (pts, order, k) => analyze(order.map(i => pts[i])).angles[k].deg;

/** The length between two corners as exact data (a whole number, a fraction or a root), and a trapezoid's height. */
function heightOf(p) {
  // The distance from D to line AB: |cross(AB, AD)| / |AB|, so h² = c² / d2.
  const ab = sub(p[0], p[1]), c = Math.abs(cross(ab, sub(p[0], p[3]))), d2 = dot(ab, ab);
  const [k, r] = rootParts(d2);
  if (r === 1) { const g = gcd(c, k); return k / g === 1 ? c / g : [c / g, k / g]; }
  // c / (k√r) = (c / (k r)) √r
  const num = c, den = k * r, g = gcd(num, den);
  if (den / g === 1) return { sqrt: r, times: num / g };
  const t = num / den;
  return Math.abs(Math.round(t * 1e4) / 1e4 - t) < 1e-12 ? { sqrt: r, times: t } : Math.round(Math.sqrt(c * c / d2) * 1e4) / 1e4;
}

/**
 * A drawn shape as the kind's real data. -> { ok: true, data, order, type } (order: which drawn corner is A, B, C...), or
 * { ok: false, why: 'few' | 'same' | 'line' | 'cross' } (it cannot be a shape), or { ok: false, why: 'kind', type, kind }
 * (it is a shape, but not one this kind draws: kind is the editor that does).
 */
export function toData(kind, pts, { range } = {}) {
  const info = analyze(pts);
  if (!info.ok) return info;
  const len = (i, j) => exactLength(d2Of(pts[i], pts[j]));
  if (kind === 'grid') {
    const r = range || { x: [Math.min(0, ...pts.map(p => p[0])), Math.max(10, ...pts.map(p => p[0]))], y: [Math.min(0, ...pts.map(p => p[1])), Math.max(10, ...pts.map(p => p[1]))] };
    return { ok: true, order: pts.map((p, i) => i), type: pts.length === 3 ? 'triangle' : pts.length === 4 ? quadType(info).type : 'polygon', data: gridData(pts, r) };
  }
  if (kind === 'triangle') {
    if (pts.length !== 3) return { ok: false, why: 'few', need: 3 - pts.length };
    const ty = triangleType(info), data = { AB: len(0, 1), BC: len(1, 2), CA: len(2, 0) };
    if (ty.right) data[ty.right] = 90;
    return { ok: true, data, order: [0, 1, 2], type: 'triangle', tri: ty };
  }
  if (pts.length !== 4) return { ok: false, why: 'few', need: 4 - pts.length };
  const q = quadType(info);
  if (!(TAKES[kind] || []).includes(q.type)) return { ok: false, why: 'kind', type: q.type, kind: KIND_OF_TYPE[q.type], special: (SPECIAL[kind] || []).includes(q.type), quad: q };
  if (kind === 'rectangle') return { ok: true, order: [0, 1, 2, 3], type: q.type, quad: q, data: q.type === 'square' ? { AB: len(0, 1), square: true } : { AB: len(0, 1), BC: len(1, 2) } };
  if (kind === 'parallelogram') {
    const A = angle('A', info.angles[0].deg);
    return { ok: true, order: [0, 1, 2, 3], type: q.type, quad: q, data: q.type === 'rhombus' ? { AB: len(0, 1), ...A, rhombus: true } : { AB: len(0, 1), DA: len(3, 0), ...A } };
  }
  if (kind === 'kite') {
    // B is the corner between the two short sides: A, B, C round it in the drawn direction, D opposite.
    const s = info.sides.map(x => x.d2);
    const b = [0, 1, 2, 3].find(i => s[(i + 3) % 4] === s[i] && s[i] < s[(i + 1) % 4]);
    const order = rot((b + 3) % 4), P = order.map(i => pts[i]);
    return { ok: true, order, type: 'kite', quad: q, data: { AB: exactLength(d2Of(P[0], P[1])), DA: exactLength(d2Of(P[3], P[0])), ...angle('B', angleOf(pts, order, 1)) } };
  }
  // A trapezoid: AB and CD the parallel sides, AB the longer (along the bottom when it is drawn).
  let order = rot(q.pair);
  const d = o => d2Of(pts[o[0]], pts[o[1]]);
  if (d(rot(q.pair + 2)) > d(order)) order = rot(q.pair + 2);
  const at = o => { const a = analyze(o.map(i => pts[i])); return a.angles; };
  if (q.right && !at(order)[0].right) order = rev(order);
  const P = order.map(i => pts[i]), AB = exactLength(d2Of(P[0], P[1])), CD = exactLength(d2Of(P[2], P[3]));
  if (q.right) return { ok: true, order, type: 'trapezoid', quad: q, data: { type: 'right', AB, CD, DA: exactLength(d2Of(P[3], P[0])) } };
  if (q.isosceles) return { ok: true, order, type: 'trapezoid', quad: q, data: { type: 'isosceles', AB, CD, h: heightOf(P) } };
  return { ok: true, order, type: 'trapezoid', quad: q, data: { AB, CD, h: heightOf(P), ...angle('A', at(order)[0].deg) } };
}

/** The same corners plotted on a coordinate grid (the grid kind), named A, B, C... in order. */
export function gridData(pts, range, names = NAMES) {
  return { x: [range.x[0], range.x[1]], y: [range.y[0], range.y[1]], shapes: [{ points: pts.map(p => [p[0], p[1]]), names: pts.map((p, i) => names[i]) }] };
}

/** Corners for a link (?draw=1,1;4,1;1,3) and back (whole numbers from -40 to 40, at most 10 corners). */
export const ptsText = pts => pts.map(p => `${p[0]},${p[1]}`).join(';');
export function parsePts(s) {
  const out = String(s || '').split(';').filter(Boolean).map(x => x.split(',').map(Number));
  return out.length >= 1 && out.length <= 10 && out.every(p => p.length === 2 && p.every(v => Number.isInteger(v) && Math.abs(v) <= 40)) ? out : null;
}
