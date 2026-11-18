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

// ================================================================ shape board (docs/decisions.md "Shape board")
// Three boards: a square grid (n × n pegs), triangle dots (n rows of n pegs, every other row moved half a step, so each
// peg's six neighbours are one step away) and a circle (ring pegs round it and one in the centre). A peg is always
// { x, y } whole numbers: column and row on the grids; on the circle x is the ring peg's number (0 at the top, going
// clockwise) and x = ring is the centre, with y = 0.
export const BOARDS = ['square', 'iso', 'circle'];
export const GRID_SIZES = [5, 7, 9, 11];
export const RING_SIZES = [6, 8, 10, 12, 16, 24];
export const MAX_BANDS = 12, MAX_PTS = 16, BAND_COLOURS = 7;
export const SHAPE_KINDS = ['tri', 'right', 'sq', 'rect', 'para', 'trap', 'pent', 'hex', 'oct'];
const H3 = Math.sqrt(3) / 2;
/** How many pegs a board has across (the grids) or round it (the circle). */
export const boardSize = st => (st.board === 'circle' ? st.ring : st.pegs);
/** Every peg of a board, in reading order (the circle: round the ring, then the centre). */
export function pegList(board, n) {
  if (board === 'circle') return Array.from({ length: n + 1 }, (_, i) => ({ x: i, y: 0 }));
  const out = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out.push({ x, y });
  return out;
}
export const onBoard = (board, n, p) => (board === 'circle' ? p.y === 0 && p.x >= 0 && p.x <= n : p.x >= 0 && p.y >= 0 && p.x < n && p.y < n);
/** A peg in lattice steps: the square grid as it is; triangle dots as (u, r) along the row and down-right (so moving a shape
 *  keeps its shape); the circle as its ring number. */
export const toLattice = (board, p) => (board === 'iso' ? { x: p.x - Math.floor(p.y / 2), y: p.y } : { x: p.x, y: p.y });
export const fromLattice = (board, q) => (board === 'iso' ? { x: q.x + Math.floor(q.y / 2), y: q.y } : { x: q.x, y: q.y });
/** Where a peg is, in board units (one step between neighbouring pegs; the circle's radius is 1, y down as on screen). */
export function pegXY(board, n, p) {
  if (board === 'iso') return { x: p.x + (p.y % 2) / 2, y: p.y * H3 };
  if (board === 'circle') {
    if (p.x >= n) return { x: 0, y: 0 };
    const a = -Math.PI / 2 + (2 * Math.PI * p.x) / n;
    return { x: Math.cos(a), y: Math.sin(a) };
  }
  return { x: p.x, y: p.y };
}
/** The square of a side's length, a whole number on the grids: dx² + dy² (square), u² + uv + v² (triangle dots). null
 *  on the circle (its chords are not whole-number roots). */
export function sideSquare(board, a, b) {
  if (board === 'circle') return null;
  const p = toLattice(board, a), q = toLattice(board, b), du = q.x - p.x, dv = q.y - p.y;
  return board === 'iso' ? du * du + du * dv + dv * dv : du * du + dv * dv;
}
/** A side's exact length { whole, roots, approx } (as bandLength), or only approx on the circle. */
export function sideLength(board, n, a, b) {
  const sq = sideSquare(board, a, b);
  if (sq === null) { const p = pegXY(board, n, a), q = pegXY(board, n, b); return { whole: 0, roots: [], approx: Math.hypot(q.x - p.x, q.y - p.y), inexact: true }; }
  const r = sqrtParts(sq);
  return r.m === 1 ? { whole: r.k, roots: [], approx: r.k } : { whole: 0, roots: [{ k: r.k, m: r.m }], approx: Math.sqrt(sq) };
}
/** A band's length on any board: exact on the grids (whole units plus simplified roots), approx on the circle. */
export function bandLengthOn(board, n, pts, closed = true) {
  if (board === 'square') return bandLength(pts, closed);
  const by = new Map(); let approx = 0, inexact = false;
  const k = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < k; i++) {
    const L = sideLength(board, n, pts[i], pts[(i + 1) % pts.length]);
    approx += L.approx;
    if (L.inexact) { inexact = true; continue; }
    if (L.whole) by.set(1, (by.get(1) || 0) + L.whole);
    for (const r of L.roots) by.set(r.m, (by.get(r.m) || 0) + r.k);
  }
  if (inexact) return { whole: 0, roots: [], approx, inexact: true };
  const roots = [...by.entries()].filter(([m]) => m !== 1).sort((a, b) => a[0] - b[0]).map(([m, kk]) => ({ k: kk, m }));
  return { whole: by.get(1) || 0, roots, approx };
}
/** "4 + 2√2 ≈ 6.83", "12", "≈ 3.46" (the circle): a length for the readout and labels. */
export function lengthLabel(L, intl = 'en') {
  if (L.inexact) return `≈ ${approxText(L, intl)}`;
  return L.roots.length ? `${lengthText(L)} ≈ ${approxText(L, intl)}` : lengthText(L);
}
/** Is this band a real shape on this board? (no peg twice, no sides crossing or touching, some area) */
export function simpleOn(board, n, pts) {
  if (new Set(pts.map(p => `${p.x},${p.y}`)).size !== pts.length) return false;
  if (board === 'square') return isSimple(pts);
  if (board === 'iso') return isSimple(pts.map(p => toLattice(board, p)));
  // The circle: real coordinates, scaled up and rounded so the integer test sees straight lines through the centre.
  return isSimple(pts.map(p => { const q = pegXY(board, n, p); return { x: Math.round(q.x * 1e6), y: Math.round(q.y * 1e6) }; }));
}
/** A closed band's area. Square grid: square units, exactly (Pick's theorem; a2 is twice the area). Triangle dots: small
 *  triangles, exactly (each is half of the lattice's rhombus: t = 2I + B − 2). Circle: approx, with the radius as 1. */
export function shapeArea(board, n, pts) {
  if (board === 'square') { const p = pick(pts); return { kind: 'sq', a2: p.a2, I: p.I, B: p.B }; }
  if (board === 'iso') { const L = pts.map(p => toLattice(board, p)), t = doubleArea(L), B = boundaryPegs(L); return { kind: 'tri', t, B, I: (t - B + 2) / 2 }; }
  let s = 0;
  for (let i = 0; i < pts.length; i++) { const a = pegXY(board, n, pts[i]), b = pegXY(board, n, pts[(i + 1) % pts.length]); s += a.x * b.y - b.x * a.y; }
  return { kind: 'approx', a: Math.abs(s) / 2 };
}
/** Each corner's inside angle, in degrees (a closed band that doesn't cross itself): they add up to (n − 2) × 180. */
export function interiorAngles(board, n, pts) {
  const P = pts.map(p => pegXY(board, n, p));
  let s = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; s += a.x * b.y - b.x * a.y; }
  const turn = Math.sign(s) || 1;
  return P.map((v, i) => {
    const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length];
    const e1 = { x: v.x - a.x, y: v.y - a.y }, e2 = { x: b.x - v.x, y: b.y - v.y };
    const t = Math.atan2(e1.x * e2.y - e1.y * e2.x, e1.x * e2.x + e1.y * e2.y) * 180 / Math.PI;
    return 180 - turn * t;
  });
}
/** "90°", "63.4°": whole degrees when the angle is one (to a hundredth), else one decimal. */
export function angleText(a, intl = 'en') {
  const r = Math.round(a);
  if (Math.abs(a - r) < 0.01) return `${r}°`;
  return `${new Intl.NumberFormat(intl, { maximumFractionDigits: 1, useGrouping: false }).format(a)}°`;
}
/** Vertex letters across every band in turn: A, B, … Z, then A′, B′ … */
export const vertexLetter = i => String.fromCharCode(65 + (i % 26)) + '′'.repeat(Math.floor(i / 26));

// ---------------------------------------------------------------- the board's labels: size and place
/** Each kind of label on the shape board: its size in viewBox units (a 1000-unit board) and the smallest it may be on
 *  the screen, in CSS px [screen, projector]. On a big board the words grow with it; on the smallest widget they stay
 *  readable from a seat (the owner found 13px too small, Nov 2026). */
/** An angle in a small, crowded shape may shrink to this [screen, projector], never below. */
export const LABEL_MIN_PX = [12, 14];
export const LABEL_SIZES = { letter: [28, 17, 21], side: [22, 16, 20], angle: [21, 15, 19], note: [30, 18, 22], ruler: [24, 16, 20] };
/** A label's size on the screen (CSS px) on a board drawn `boardPx` px across: its share of the board, never under its
 *  floor. */
export function labelPx(kind, boardPx, projector = false) {
  const [units, screen, proj] = LABEL_SIZES[kind] || LABEL_SIZES.side;
  return Math.max(units * (boardPx > 0 ? boardPx : 0) / 1000, projector ? proj : screen);
}
/** About how wide a label is, in the units of its font size (the board's labels are bold; ′ and √ are narrow). */
export const labelWidth = (text, size) => [...String(text)].reduce((s, ch) => s + (/[′'.,:]/.test(ch) ? 0.28 : /[1IJijl ]/.test(ch) ? 0.4 : /°/.test(ch) ? 0.45 : /[0-9]/.test(ch) ? 0.6 : /[MW]/.test(ch) ? 0.95 : 0.66), 0) * size;
/** Places the board's labels so they don't sit on each other or on the pegs: each label tries its own spot first, then
 *  spots turned a little round its corner (or side) and a little further out, and takes the one that covers least. Then
 *  a label still on another is tried again with all the others in place (twice at most).
 *  items: [{ x, y (what it labels), dx, dy (the way out, a unit vector), d (how far), w, h, near (stay close: an angle), band }]
 *  in board units, placed in order; minScale: how much smaller it may be drawn where there is no room. opts: { pegs: [{ x, y }], peg (their radius), box: [x0, y0, x1, y1], gap (room kept
 *  round a label), lines: the bands' sides [[x1, y1, x2, y2, band]] (a label keeps off its own band's), fixed: boxes already there [{ x, y, w, h }] }. -> [{ x, y, scale }] the middle of each label and its
 *  size (1, or smaller down to its minScale). */
export function placeLabels(items, opts = {}) {
  const pegs = opts.pegs || [], lines = opts.lines || [], pr = opts.peg || 0, gap = opts.gap || 0, [bx0, by0, bx1, by1] = opts.box || [-Infinity, -Infinity, Infinity, Infinity];
  const fixed = (opts.fixed || []).map(b => ({ ...b }));
  const TURNS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5], FAR = [1, 1.35, 1.75, 2.2];
  // An angle stays inside its corner (turned only a little, never far), so it is never read as another corner's.
  const NEAR_TURNS = [0, 0.35, -0.35], NEAR_FAR = [1, 0.85, 1.2, 0.7];
  const spots = items.map(() => null), scale = items.map(() => 1);
  const hits = (x, y, w, h, q) => { const ox = Math.min(x + w / 2, q.x + q.w / 2) - Math.max(x - w / 2, q.x - q.w / 2), oy = Math.min(y + h / 2, q.y + q.h / 2) - Math.max(y - h / 2, q.y - q.h / 2); return ox > 0 && oy > 0 ? ox * oy : 0; };
  const others = i => fixed.concat(spots.filter((p, j) => p && j !== i));
  const place = (i, wide = false) => {
    const it = items[i], w = it.w * scale[i] + 2 * gap, h = it.h * scale[i] + 2 * gap, there = others(i);
    const turns = it.near && !wide ? NEAR_TURNS : TURNS, fars = it.near && !wide ? NEAR_FAR : it.near ? [...NEAR_FAR, 0.55, 1.6] : FAR;
    let best = null;
    fars.forEach((far, fi) => turns.forEach((turn, ti) => {
      const c = Math.cos(turn), s = Math.sin(turn), ux = it.dx * c - it.dy * s, uy = it.dx * s + it.dy * c;
      const x = it.x + ux * it.d * far, y = it.y + uy * it.d * far;
      let score = fi * 0.6 + ti * 0.25, on = 0;
      const l = x - w / 2, r = x + w / 2, t = y - h / 2, b = y + h / 2;
      if (l < bx0 || r > bx1 || t < by0 || b > by1) score += 1000;
      for (const q of there) { const a = hits(x, y, w, h, q); if (a) { on++; score += 40 + 100 * a / (w * h); } }
      for (const p of pegs) {
        const nx = Math.max(l, Math.min(p.x, r)), ny = Math.max(t, Math.min(p.y, b));
        if (Math.hypot(p.x - nx, p.y - ny) < pr) score += 6;
      }
      for (const g of lines) if (g[4] === it.band && segmentInBox(g, l, t, r, b)) score += 5;
      if (!best || score < best.score) best = { x, y, w, h, score, on };
    }));
    // Never outside the board, whatever else it covers.
    best.x = Math.max(bx0 + w / 2, Math.min(bx1 - w / 2, best.x)); best.y = Math.max(by0 + h / 2, Math.min(by1 - h / 2, best.y));
    spots[i] = best;
  };
  items.forEach((it, i) => place(i));
  const bad = () => spots.map((p, i) => i).filter(i => others(i).some(q => hits(spots[i].x, spots[i].y, spots[i].w, spots[i].h, q)));
  for (let pass = 0; pass < 2; pass++) { const b = bad(); if (!b.length) break; b.forEach(i => place(i)); }
  // Still crowded (a small shape on a dense board): a label that may be smaller (minScale) gets a little smaller.
  for (let pass = 0; pass < 6; pass++) {
    const b = bad().filter(i => scale[i] > (items[i].minScale || 1) + 1e-9); if (!b.length) break;
    b.forEach(i => { scale[i] = Math.max(items[i].minScale || 1, scale[i] * 0.94); place(i); });
  }
  // Still on another: no two labels may sit on each other, so an angle may then turn further round its corner too.
  for (let pass = 0; pass < 2; pass++) { const b = bad(); if (!b.length) break; b.forEach(i => place(i, true)); }
  return spots.map((p, i) => ({ x: p.x, y: p.y, scale: scale[i] }));
}
/** Whether a line from (x1, y1) to (x2, y2) passes through a box (Liang-Barsky). */
export function segmentInBox([x1, y1, x2, y2], l, t, r, b) {
  let u0 = 0, u1 = 1; const dx = x2 - x1, dy = y2 - y1;
  for (const [p, q] of [[-dx, x1 - l], [dx, r - x1], [-dy, y1 - t], [dy, b - y1]]) {
    if (p === 0) { if (q < 0) return false; continue; }
    const u = q / p;
    if (p < 0) { if (u > u1) return false; if (u > u0) u0 = u; } else { if (u < u0) return false; if (u < u1) u1 = u; }
  }
  return true;
}
/** Whether two placed labels (middle, width, height) cover each other. */
export const labelsOverlap = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w && Math.abs(a.y - b.y) * 2 < a.h + b.h;
/** The nearest peg to a point in board units, and how far it is (board units). */
export function nearestPeg(board, n, pt) {
  let best = null;
  if (board === 'circle') {
    for (const p of pegList(board, n)) { const q = pegXY(board, n, p), d = Math.hypot(q.x - pt.x, q.y - pt.y); if (!best || d < best.d) best = { p, d }; }
    return best;
  }
  const y0 = board === 'iso' ? Math.round(pt.y / H3) : Math.round(pt.y);
  for (let y = y0 - 1; y <= y0 + 1; y++) {
    if (y < 0 || y >= n) continue;
    const x0 = Math.round(pt.x - (board === 'iso' ? (y % 2) / 2 : 0));
    for (let x = x0 - 1; x <= x0 + 1; x++) {
      if (x < 0 || x >= n) continue;
      const q = pegXY(board, n, { x, y }), d = Math.hypot(q.x - pt.x, q.y - pt.y);
      if (!best || d < best.d) best = { p: { x, y }, d };
    }
  }
  if (!best) { const c = { x: Math.max(0, Math.min(n - 1, Math.round(pt.x))), y: Math.max(0, Math.min(n - 1, Math.round(board === 'iso' ? pt.y / H3 : pt.y))) }; const q = pegXY(board, n, c); best = { p: c, d: Math.hypot(q.x - pt.x, q.y - pt.y) }; }
  return best;
}
/** Is a point (board units) inside a closed band? */
export function insideBand(board, n, pts, pt) {
  const P = pts.map(p => pegXY(board, n, p)); let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c; }
  return c;
}
/** A band moved by whole steps (the grids: dx along, dy down in lattice steps; the circle: turned dx pegs round, the centre
 *  staying put), or null when a peg would leave the board. */
export function moveBand(board, n, pts, dx, dy) {
  const out = pts.map(p => {
    if (board === 'circle') return p.x >= n ? { ...p } : { x: (((p.x + dx) % n) + n) % n, y: 0 };
    const q = toLattice(board, p); return fromLattice(board, { x: q.x + dx, y: q.y + dy });
  });
  return out.every(p => onBoard(board, n, p)) ? out : null;
}
/** A preset shape as pegs, placed in the middle of the board, or null when the board can't make it. */
export function presetShape(kind, board, n) {
  if (board === 'circle') {
    const h = n / 2, reg = k => (n % k === 0 ? Array.from({ length: k }, (_, i) => ({ x: (i * n) / k, y: 0 })) : null);
    if (kind === 'tri') { if (n % 3 === 0) return reg(3); const k = Math.round(n / 3); return [{ x: 0, y: 0 }, { x: k, y: 0 }, { x: n - k, y: 0 }]; }
    if (kind === 'right') return n % 2 ? null : [{ x: 0, y: 0 }, { x: Math.max(1, Math.round(n / 6)), y: 0 }, { x: h, y: 0 }];
    if (kind === 'sq') return reg(4);
    if (kind === 'rect') { if (n % 2) return null; let i = Math.round(h / 3); if (4 * i === h) i -= 1; return i < 1 ? null : [i, h - i, h + i, n - i].map(x => ({ x, y: 0 })); }
    if (kind === 'trap') { if (n % 6) return null; const k = n / 6, s = n % 12 === 0 ? (3 * n) / 4 : 0; return [0, k, 2 * k, 3 * k].map(i => ({ x: (s + i) % n, y: 0 })); }
    if (kind === 'pent') return reg(5);
    if (kind === 'hex') return reg(6);
    if (kind === 'oct') return reg(8);
    return null;
  }
  // The shapes in lattice steps (square grid: plain steps; triangle dots: along the row and down-right).
  const S = board === 'iso'
    ? { tri: [[0, 2], [2, 2], [2, 0]], right: [[0, 0], [1, 0], [0, 2]], rect: [[0, 0], [1, 0], [0, 2], [-1, 2]], para: [[0, 0], [2, 0], [2, 1], [0, 1]],
      trap: [[0, 2], [4, 2], [4, 0], [2, 0]], hex: [[2, 0], [2, 1], [1, 2], [0, 2], [0, 1], [1, 0]] }
    : { tri: [[0, 3], [4, 3], [2, 0]], right: [[0, 0], [0, 3], [4, 3]], sq: [[0, 0], [3, 0], [3, 3], [0, 3]], rect: [[0, 0], [4, 0], [4, 2], [0, 2]],
      para: [[1, 0], [4, 0], [3, 2], [0, 2]], trap: [[1, 0], [3, 0], [4, 2], [0, 2]], pent: [[2, 0], [4, 2], [3, 4], [1, 4], [0, 2]],
      hex: [[1, 0], [3, 0], [4, 2], [3, 4], [1, 4], [0, 2]], oct: [[1, 0], [3, 0], [4, 1], [4, 3], [3, 4], [1, 4], [0, 3], [0, 1]] };
  const raw = S[kind]; if (!raw) return null;
  // Triangle dots' shapes are drawn twice as big where the board has room for that (from 7 rows).
  const mid = { x: (n - 1) / 2, y: ((n - 1) / 2) * (board === 'iso' ? H3 : 1) };
  for (const k of board === 'iso' && n >= 7 ? [2, 1] : [1]) {
    const L = raw.map(([x, y]) => ({ x: x * k, y: y * k }));
    const at = (dx, dy) => L.map(q => fromLattice(board, { x: q.x + dx, y: q.y + dy }));
    let best = null;
    for (let dy = -n; dy <= n; dy++) for (let dx = -2 * n; dx <= 2 * n; dx++) {
      const pts = at(dx, dy); if (!pts.every(p => onBoard(board, n, p))) continue;
      const xy = pts.map(p => pegXY(board, n, p));
      const cx = (Math.min(...xy.map(q => q.x)) + Math.max(...xy.map(q => q.x))) / 2, cy = (Math.min(...xy.map(q => q.y)) + Math.max(...xy.map(q => q.y))) / 2;
      const d = (cx - mid.x) ** 2 + (cy - mid.y) ** 2;
      if (!best || d < best.d - 1e-9) best = { pts, d };
    }
    if (best) return best.pts;
  }
  return null;
}
/** Which preset shapes this board can make. */
export const presetsFor = (board, n) => SHAPE_KINDS.filter(k => presetShape(k, board, n));
/** Pen strokes are kept small: points closer than tol to the line between their neighbours go (Ramer-Douglas-Peucker). */
export function simplifyStroke(pts, tol = 2) {
  if (pts.length < 3) return pts.slice();
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let far = -1, fd = tol;
    const A = pts[a], B = pts[b], dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * (pts[i][0] - A[0]) - dx * (pts[i][1] - A[1])) / len; if (d > fd) { fd = d; far = i; } }
    if (far >= 0) { keep[far] = 1; stack.push([a, far], [far, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

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
/** Pattern blocks review: a press on a block in the palette is a tap (it adds the block, as before) until the pointer has
 *  moved more than `slop` px from where it went down; from then on it is a drag. */
export const PALETTE_SLOP = 8;
export function paletteDrag(x0, y0, x1, y1, slop = PALETTE_SLOP) { return Math.hypot(x1 - x0, y1 - y0) > slop; }
/** A block of kind k dragged from the palette and let go with its middle at (px, py) on the board (edge units; the board
 *  is w × h edges, 15 × 10 rows by default). -> the block it becomes: its corner on the grid point (x + y even, x 0-2w,
 *  y 0-rows) nearest to where it was let go, among those where the whole block lies on the board (so its edges meet the
 *  grid, and other blocks' edges, like a block dragged on the board); null when let go off the board (cancelled). */
export function dropBlock(k, px, py, r = 0, w = 15, rows = 10) {
  const h = rows * R3;
  if (!BLOCK_SHAPES[k] || !(px >= 0 && px <= w && py >= 0 && py <= h)) return null;
  const pts = blockPoints({ k, x: 0, y: 0, r });
  const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const ox = px - cx, oy = py - cy;
  let best = null;
  for (let y = 0; y <= rows; y++) for (let x = y % 2; x <= 2 * w; x += 2) {
    const inside = pts.every(([a, b]) => a + x / 2 >= -1e-9 && a + x / 2 <= w + 1e-9 && b + y * R3 >= -1e-9 && b + y * R3 <= h + 1e-9);
    if (!inside) continue;
    const d = (x / 2 - ox) ** 2 + (y * R3 - oy) ** 2;
    if (!best || d < best.d - 1e-12) best = { x, y, d };
  }
  return best ? { k, x: best.x, y: best.y, r } : null;
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

// ================================================================ the balance scale: x tiles and 1 tiles, positive and negative
// A side is { x, u } (positive x tiles and 1 tiles) plus, since "the balance scale by drag and drop" (docs/decisions.md),
// nx and nu: its negative tiles (−x and −1, as in Algebra Builder). A side saved before has none, and weighs as before.
/** What a side weighs when each x tile weighs x (a negative tile weighs the opposite of its twin). */
export const weigh = (side, x) => (side.x - (side.nx || 0)) * x + side.u - (side.nu || 0);
/** −1: the left side is down, 1: the right side is down, 0: level. */
export const tip = (L, R, x) => Math.sign(weigh(R, x) - weigh(L, x));
/** How far the beam turns, in degrees, clockwise (the right side down): more the more one side outweighs the other, at
 *  most 12, and never so little it can't be seen (4 for a difference of 1). */
export function tiltDeg(L, R, x) {
  const d = weigh(R, x) - weigh(L, x);
  return d ? Math.sign(d) * Math.min(12, 3 + Math.abs(d)) : 0;
}
export const BAL_MAX = { x: 9, u: 30 };
/** A side with all four counts (a saved side may lack nx and nu). */
export const fullSide = s => ({ x: s.x || 0, u: s.u || 0, nx: s.nx || 0, nu: s.nu || 0 });
/** The count a tile is kept in: 'x' | 'u' | 'nx' | 'nu'. k: 'x' or '1'. */
export const tileKey = (k, neg) => (k === 'x' ? (neg ? 'nx' : 'x') : neg ? 'nu' : 'u');
const room = key => (key === 'x' || key === 'nx' ? BAL_MAX.x : BAL_MAX.u);
/** One tile into a side (null when the side is full of that tile) or out of it (null when it has none). */
export function sideMove(s, k, neg, add) {
  const key = tileKey(k, neg), o = fullSide(s);
  if (add ? o[key] >= room(key) : o[key] <= 0) return null;
  o[key] += add ? 1 : -1; return o;
}
/** A tile moved on the scale: { k: 'x' | '1', neg, add: true (put in) | false (taken out), where: 'left' | 'right' |
 *  'both' }. Taking a tile away from both sides takes it from each side that has one and, on a side that has none, puts
 *  in its opposite (taking away x is adding −x), as in Algebra Builder. -> the new sides, or null (can't be done). */
export function panMove(L, R, m) {
  const one = s => {
    if (m.add) return sideMove(s, m.k, m.neg, true);
    if (m.where !== 'both') return sideMove(s, m.k, m.neg, false);
    return sideMove(s, m.k, m.neg, false) || sideMove(s, m.k, !m.neg, true);
  };
  const l = m.where === 'right' ? fullSide(L) : one(L), r = m.where === 'left' ? fullSide(R) : one(R);
  return l && r ? { L: l, R: r } : null;
}
/** The zero pairs on a side (a tile and its opposite): how many. */
export const sidePairs = s => Math.min(s.x || 0, s.nx || 0) + Math.min(s.u || 0, s.nu || 0);
/** A side with its zero pairs taken away (it weighs the same). */
export function sideZero(s) {
  const o = fullSide(s), a = Math.min(o.x, o.nx), b = Math.min(o.u, o.nu);
  return { x: o.x - a, nx: o.nx - a, u: o.u - b, nu: o.nu - b };
}
/** What both sides can be shared by: the greatest number every count divides by (0 for an empty scale). */
export const shareBy = (L, R) => [L.x, L.u, L.nx || 0, L.nu || 0, R.x, R.u, R.nx || 0, R.nu || 0].reduce((a, b) => gcdOf(a, b), 0);
const gcdOf = (a, b) => (b ? gcdOf(b, a % b) : Math.abs(a));
/** Do something to one side or both: 'addx' | 'subx' | 'add1' | 'sub1' | 'div' (share into n equal groups, keep one).
 *  -> the new sides, or null when it can't be done (nothing to take, too many, not shared evenly). */
export function balanceOp(L, R, op, where = 'both', n = 2) {
  const one = s => {
    if (op === 'addx') return s.x < BAL_MAX.x ? { ...s, x: s.x + 1 } : null;
    if (op === 'subx') return s.x > 0 ? { ...s, x: s.x - 1 } : null;
    if (op === 'add1') return s.u < BAL_MAX.u ? { ...s, u: s.u + 1 } : null;
    if (op === 'sub1') return s.u > 0 ? { ...s, u: s.u - 1 } : null;
    if (op === 'div') {
      if (n < 2 || [s.x, s.u, s.nx || 0, s.nu || 0].some(v => v % n)) return null;
      const o = { x: s.x / n, u: s.u / n };
      if (s.nx || s.nu) Object.assign(o, { nx: (s.nx || 0) / n, nu: (s.nu || 0) / n });
      return o;
    }
    return null;
  };
  const l = where === 'right' ? L : one(L), r = where === 'left' ? R : one(R);
  return l && r ? { L: l, R: r } : null;
}
/** The working when x is a number: "3·4 + 5 = 17", "−x" as "−4", "2·(−3) − 1 = −7". -> { text, v }. */
export function workText(side, x) {
  const a = side.x - (side.nx || 0), b = side.u - (side.nu || 0), xs = x < 0 ? `(${minus(x)})` : String(x);
  let t = a ? `${a === 1 ? '' : a === -1 ? '−' : `${minus(a)}·`}${a === 1 || a === -1 ? (x < 0 && a === -1 ? xs : minus(x)) : xs}` : '';
  if (b) t = t ? `${t} ${b < 0 ? '−' : '+'} ${Math.abs(b)}` : minus(b);
  const v = weigh(side, x);
  return { text: t && t !== minus(v) ? `${t} = ${minus(v)}` : minus(v), v };
}
/** Check a value of x on the scale as it is: { ok, l, r } (l and r: workText of each side). */
export function checkX(L, R, x) { const l = workText(L, x), r = workText(R, x); return { ok: l.v === r.v, l, r }; }
/** Solved: one x tile on its own on one side, only 1 tiles on the other (positive or negative, no zero pairs left).
 *  -> the value, or null. */
export function solvedValue(L, R) {
  const alone = s => s.x === 1 && !s.u && !s.nx && !s.nu, units = s => !s.x && !s.nx && !(s.u && s.nu);
  if (alone(L) && units(R)) return R.u - (R.nu || 0);
  if (alone(R) && units(L)) return L.u - (L.nu || 0);
  return null;
}
/** "3x + 2", "x", "4", "0"; with negative tiles as they lie: "3x − x + 5 − 2", "−x + 4". */
export function sideText(s) {
  const parts = [];
  const add = (n, body, neg) => { if (!n) return; const t = body ? `${n === 1 ? '' : n}${body}` : String(n); parts.push(parts.length ? `${neg ? '−' : '+'} ${t}` : `${neg ? '−' : ''}${t}`); };
  add(s.x, 'x', false); add(s.nx || 0, 'x', true); add(s.u, '', false); add(s.nu || 0, '', true);
  return parts.join(' ') || '0';
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
/** Algebra tiles' "Build this" challenge (docs/decisions.md "the balance scale by drag and drop"): an expression
 *  ax² + bx + c to build, a from −2 to 2, b from −4 to 4, c from −5 to 5, never 0 and never one term alone. rnd() in [0, 1). */
export function makeGoal(rnd = Math.random) {
  for (let k = 0; k < 100; k++) {
    const g = { a: Math.floor(rnd() * 5) - 2, b: Math.floor(rnd() * 9) - 4, c: Math.floor(rnd() * 11) - 5 };
    if ([g.a, g.b, g.c].filter(Boolean).length >= 2) return g;
  }
  return { a: 1, b: -1, c: 3 };
}
/** The kinds of tile whose total differs from the goal's: some of 'x2', 'x', '1' (none: built). */
export function goalDiff(tiles, goal) {
  const s = simplifyTiles(tiles);
  return [['x2', s.a, goal.a], ['x', s.b, goal.b], ['1', s.c, goal.c]].filter(([, have, want]) => have !== want).map(([k]) => k);
}
/** The tiles on the mat in the order they are drawn: by kind (x², x, 1), each zero pair together (a positive, then its
 *  negative), then the tiles left over (positives, then negatives). -> [{ k, pairs: [[i, j]], rest: [i] }] (indexes). */
export function tileRows(tiles) {
  return TILE_KINDS.map(k => {
    const pos = [], neg = [];
    tiles.forEach((t, i) => { if (t.k === k) (t.neg ? neg : pos).push(i); });
    const n = Math.min(pos.length, neg.length), pairs = [];
    for (let i = 0; i < n; i++) pairs.push([pos[i], neg[i]]);
    return { k, pairs, rest: [...pos.slice(n), ...neg.slice(n)] };
  });
}

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
/** Review: choosing a word family (or none) starts from scratch: the board is cleared and only the family's ending is on
 *  it (it never adds to what was there). -> the changed part of a letter tiles state. */
export function switchFamily(state, fam) {
  return { ...state, fam: FAMILIES[fam] ? fam : '', word: [] };
}
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
