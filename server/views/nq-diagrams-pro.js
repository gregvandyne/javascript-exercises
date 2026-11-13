// The Pro diagram pack (Number Quest grades 6-8), drawn in the same 100 x 56.25 space, on the same Cream ground and
// with the same colour tokens as views/nq-diagrams.js (which hands these types to this file):
//   plane          a coordinate plane: four quadrants or the first, a whole-number grid with numbered axes, points
//                  with their names, segments, lines (through two points, or y = mx + b), up to two polygons (a shape
//                  and its image, drawn differently), a slope triangle with its rise and run; with steps and axis
//                  names it is a scatter plot with a trend line;
//   double         a double number line: two scales one over the other, tick for tick, any value a blank "?";
//   boxplot        one or two box plots (lowest, lower quartile, median, upper quartile, highest) over one axis;
//   angles         angles at one point with their measures: on a straight line, in a right angle, where two lines
//                  cross, or round a point; any angle may be the "?";
//   righttriangle  a right triangle: its square corner marked, its two legs and its hypotenuse labelled;
//   net            the net of a rectangular prism (six rectangles) or a triangular prism (three rectangles and two
//                  triangles), its fold lines dashed and its edge lengths written;
//   flow           an operation flow: a value, a machine, the next value... with the way back (the inverse
//                  operations) drawn under it;
// and two options on the number line that views/courses.js draws: `upright` (a line that stands up, a thermometer
// with `tube`, its hops drawn as arrows up and down) and `ray` (an inequality: an open or closed circle and a ray).
// Rules every drawing here keeps: no text under 3.4 units (12 px on a 390 px phone); nothing is told by colour alone
// (a second line is dashed, an image polygon is dashed, an open circle is hollow, the unknown is a "?"); a label that
// sits on lines has a ground-coloured halo; every layout is a pure function of the data, so diagramParts can hand a
// deck author the box of each part for the guided tour, and diagramAlt can say the same data in words.
import { INK, LEAF, GROUND, LINE, TONES, r2, tx, tTop, tBot, head } from './nq-diagram-kit.js';
import { fmt } from '../services/diagrams-pro.js';

const BLUE = '#2F6FD6', RED = '#C2431F', MERCURY = '#E9465C';
/** A string's width at font size 1 (the 0.56 a character the other diagrams use: a little generous, on purpose). */
const wOf = s => String(s).length * 0.56;
/** The largest size up to `max` at which `s` fits in `w`, never under the 3.4 floor. */
const fit = (s, w, max) => r2(Math.max(3.4, Math.min(max, w / wOf(s))));
/** A text line centred on (cx, cy), both ways. */
const mid = (cx, cy, s, size, weight = 800, fill = INK, halo = false) => tx(cx, cy + 0.35 * size, s, size, 'middle', weight, fill, halo);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
/** Lay a layout out once per diagram object (the SVG, the extent and the parts all read the same one). */
const once = fn => { const memo = new WeakMap(); return v => { let g = memo.get(v); if (!g) { g = fn(v); memo.set(v, g); } return g; }; };
/** A part's box for the guided tour: [x, y, w, h] in % of the 100 x 56.25 drawing, with a little room round the
 *  part, inside the frame and never thinner than the tour allows (2%). */
const part = (x0, y0, x1, y1, pad = 1.2) => {
  const a = clamp(Math.min(x0, x1) - pad, 0, 96), b = clamp(Math.min(y0, y1) - pad, 0, 53), c = clamp(Math.max(x0, x1) + pad, a + 2.4, 100), d = clamp(Math.max(y0, y1) + pad, b + 1.4, 56.25);
  const r1 = n => Math.round(n * 10) / 10;
  return [r1(a), r1(b / 0.5625), r1(c - a), r1((d - b) / 0.5625)];
};
/** Label centres that sit at least their own widths apart along one line (the number line's nudge, in one pass each way). */
function spread(items, lo, hi, gap = 1) {
  const by = [...items].sort((p, q) => p.c - q.c);
  for (let i = 1; i < by.length; i++) by[i].c = Math.max(by[i].c, by[i - 1].c + by[i - 1].hw + by[i].hw + gap);
  for (let i = by.length - 1; i >= 0; i--) { by[i].c = Math.min(by[i].c, i === by.length - 1 ? hi - by[i].hw : by[i + 1].c - by[i + 1].hw - by[i].hw - gap); }
  for (let i = 0; i < by.length; i++) by[i].c = Math.max(by[i].c, i ? by[i - 1].c + by[i - 1].hw + by[i].hw + gap : lo + by[i].hw);
  return items;
}
/** The "?" of an unknown, in its dashed box, centred on (cx, cy). */
const blank = (cx, cy, w = 7, h = 6.4) => `<rect data-blank="1" x="${r2(cx - w / 2)}" y="${r2(cy - h / 2)}" width="${w}" height="${h}" rx="1" fill="#FFFFFF" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1.4 1"/>` + mid(cx, cy, '?', 4.6, 800, LEAF);
const isQ = s => String(s).trim() === '?';

// ---------------------------------------------------------------------------------------------- plane
/** How many gridlines apart the axis numbers sit, so they never touch: 1, 2, 5, 10 or 20. */
const every = (need, cell) => [1, 2, 5, 10, 20].find(k => k * cell >= need) || 20;
/** The part of the line through p and q that crosses the box [x0, x1] x [y0, y1], or null. */
function clipLine(p, q, x0, x1, y0, y1) {
  const dx = q[0] - p[0], dy = q[1] - p[1];
  let t0 = -Infinity, t1 = Infinity;
  for (const [d, a, lo, hi] of [[dx, p[0], x0, x1], [dy, p[1], y0, y1]]) {
    if (Math.abs(d) < 1e-12) { if (a < lo - 1e-9 || a > hi + 1e-9) return null; continue; }
    const ta = (lo - a) / d, tb = (hi - a) / d;
    t0 = Math.max(t0, Math.min(ta, tb)); t1 = Math.min(t1, Math.max(ta, tb));
  }
  return t1 - t0 > 1e-9 ? [[p[0] + dx * t0, p[1] + dy * t0], [p[0] + dx * t1, p[1] + dy * t1]] : null;
}
const linePts = l => (l.through ? l.through : [[0, l.b], [1, l.m + l.b]]);
const LINE_LOOK = [{ tone: LEAF, dash: '' }, { tone: BLUE, dash: '2.4 1.4' }, { tone: RED, dash: '0.9 1.3' }];
const planeLay = once(v => {
  const [x0, x1] = v.x, [y0, y1] = v.y, [sx, sy] = v.step || [1, 1], nx = Math.round((x1 - x0) / sx), ny = Math.round((y1 - y0) / sy);
  const xName = v.xName || 'x', yName = v.yName || 'y', longX = xName.length > 2, longY = yName.length > 2;
  const xs = Array.from({ length: nx + 1 }, (_, i) => x0 + i * sx), ys = Array.from({ length: ny + 1 }, (_, j) => y0 + j * sy);
  const yLabW = Math.max(...ys.map(n => wOf(fmt(n)))) * 3.4, xLabW = Math.max(...xs.map(n => wOf(fmt(n)))) * 3.4;
  // the room the grid may take: numbers outside it where an axis is the grid's own edge, a long axis name beside it
  const left = 4 + (x0 === 0 ? yLabW + 1.6 : 0) + (longY ? 5 : 0), right = longX ? 95 : 90.5;
  const top = 4.6, bottom = 55.2 - (y0 === 0 ? 5 : 3) - (longX ? 4.8 : 0);
  const even = sx === sy, u = Math.min((right - left) / nx, (bottom - top) / ny, 8);
  const cw = even ? u : Math.min((right - left) / nx, 9), ch = even ? u : Math.min((bottom - top) / ny, 8);
  const pw = nx * cw, ph = ny * ch, gx = left + (right - left - pw) / 2, gy = top;
  const X = x => gx + (x - x0) / sx * cw, Y = y => gy + ph - (y - y0) / sy * ch, ox = X(0), oy = Y(0);
  let kx = every(xLabW + 1.4, cw), ky = every(4.2, ch);
  if (even) kx = ky = Math.max(kx, ky);
  let s = '';
  for (const x of xs) s += `<line x1="${r2(X(x))}" y1="${r2(gy)}" x2="${r2(X(x))}" y2="${r2(gy + ph)}" stroke="${LINE}" stroke-width="0.4"/>`;
  for (const y of ys) s += `<line x1="${r2(gx)}" y1="${r2(Y(y))}" x2="${r2(gx + pw)}" y2="${r2(Y(y))}" stroke="${LINE}" stroke-width="0.4"/>`;
  // the two axes: an arrow at each end that runs on (both ends where the plane goes below zero)
  const xa = gx - (x0 < 0 ? 2.4 : 0), xb = gx + pw + 2.4, ya = gy - 2.4, yb = gy + ph + (y0 < 0 ? 2.4 : 0);
  s += `<line data-axis="x" x1="${r2(xa)}" y1="${r2(oy)}" x2="${r2(xb)}" y2="${r2(oy)}" stroke="${INK}" stroke-width="0.8"/>` + head(xb + 0.6, oy, 1, 0) + (x0 < 0 ? head(xa - 0.6, oy, -1, 0) : '');
  s += `<line data-axis="y" x1="${r2(ox)}" y1="${r2(ya)}" x2="${r2(ox)}" y2="${r2(yb)}" stroke="${INK}" stroke-width="0.8"/>` + head(ox, ya - 0.6, 0, -1) + (y0 < 0 ? head(ox, yb + 0.6, 0, 1) : '');
  // the numbers: under the x-axis and left of the y-axis, every kx-th and ky-th gridline counted from zero, zero once
  const boxes = [], keep = (cx, cy, w, h) => boxes.push([cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]);
  let nums = '';
  for (const x of xs) {
    const i = Math.round(x / sx);
    if (i && i % kx === 0) { nums += `<line x1="${r2(X(x))}" y1="${r2(oy - 0.8)}" x2="${r2(X(x))}" y2="${r2(oy + 0.8)}" stroke="${INK}" stroke-width="0.5"/>` + tx(X(x), oy + 4.1, fmt(x), 3.4, 'middle', 700, INK, y0 < 0); keep(X(x), oy + 2.9, wOf(fmt(x)) * 3.4, 3.4); }
  }
  for (const y of ys) {
    const j = Math.round(y / sy);
    if (j && j % ky === 0) { nums += `<line x1="${r2(ox - 0.8)}" y1="${r2(Y(y))}" x2="${r2(ox + 0.8)}" y2="${r2(Y(y))}" stroke="${INK}" stroke-width="0.5"/>` + tx(ox - 1.5, Y(y) + 1.2, fmt(y), 3.4, 'end', 700, INK, x0 < 0); keep(ox - 1.5 - wOf(fmt(y)) * 1.7, Y(y), wOf(fmt(y)) * 3.4, 3.4); }
  }
  // zero, once: under the origin where the x-axis is the grid's bottom edge, beside it where the y-axis is the grid's
  // left edge, and in the corner between the axes on a four-quadrant plane (left out where the first number would touch it)
  if (y0 === 0) { nums += tx(ox, oy + 4.1, '0', 3.4, 'middle', 700); keep(ox, oy + 2.9, 2, 3.4); }
  else if (x0 === 0) { nums += tx(ox - 1.5, oy + 1.2, '0', 3.4, 'end', 700); keep(ox - 2.5, oy, 2, 3.4); }
  else if (kx * cw >= 7.5) { nums += tx(ox - 1.5, oy + 4.1, '0', 3.4, 'end', 700, INK, true); keep(ox - 2.5, oy + 2.9, 2, 3.4); }
  let ext = [gy - 3.2, yb + (y0 < 0 ? 0.8 : 0)];
  if (y0 === 0) ext[1] = tBot(oy + 4.1, 3.4);
  if (longX) { const ny2 = (y0 === 0 ? oy + 4.1 : yb + 0.6) + 4.6; nums += tx(gx + pw / 2, ny2, xName, 3.6, 'middle', 800, LEAF); ext[1] = tBot(ny2, 3.6); }
  else nums += tx(xb + 2.2, oy + 1.25, xName, 3.6, 'start', 800, LEAF);
  if (longY) { const cx = left - (x0 === 0 ? yLabW + 1.6 : 0) - 1.6, cy = gy + ph / 2; nums += tx(cx, cy, yName, 3.6, 'middle', 800, LEAF).replace('<text ', `<text transform="rotate(-90 ${r2(cx)} ${r2(cy)})" `); }
  else { nums += tx(ox + 2.4, ya + 0.9, yName, 3.6, 'start', 800, LEAF, true); ext[0] = Math.min(ext[0], tTop(ya + 0.9, 3.6)); }
  // what is drawn on the plane, back to front: polygons, segments, lines, the slope triangle, points; then every name,
  // each set where it covers nothing already placed (a point, a number on an axis, another name)
  const parts = { plane: part(gx, gy, gx + pw, gy + ph, 2), origin: part(ox - 4, oy - 2, ox + 2, oy + 5, 0) };
  const names = [];   // { cx, cy, s, size, fill, cands }
  const want = (s2, size, fill, cands, key) => names.push({ s: s2, size, fill, cands, key });
  const around = (px, py, w, h, d) => [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [1, 0], [-1, 0]].map(([a, b]) => [px + a * (d + (a ? w / 2 : 0)), py + b * (d + (b ? h / 2 : 0) + (a && b ? -0.6 : 0))]);
  let shapes = '';
  /** Whatever is drawn from a to b is in the way of a name: a row of small boxes along it. */
  const along = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(l / 1.4)); for (let i = 0; i <= n; i++) keep(a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n, 1.5, 1.5); };
  along([xa, oy], [xb, oy]); along([ox, ya], [ox, yb]);
  (v.polygons || []).forEach((g, k) => {
    const pts = g.pts.map(p => [X(p[0]), Y(p[1])]), cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    // a shape and its image: the image is the dashed, blue one (told by its line as well as its colour)
    shapes += `<polygon data-poly="${g.image ? 'image' : 'shape'}" points="${pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="${TONES[g.image ? 2 : 0]}" fill-opacity="0.55" stroke="${g.image ? BLUE : INK}" stroke-width="0.9" stroke-linejoin="round"${g.image ? ' stroke-dasharray="2 1.2"' : ''}/>`;
    pts.forEach((p, i) => {
      along(p, pts[(i + 1) % pts.length]);
      shapes += `<circle cx="${r2(p[0])}" cy="${r2(p[1])}" r="0.9" fill="${g.image ? BLUE : INK}"/>`; keep(p[0], p[1], 2.2, 2.2);
      if (g.names) { const l = Math.hypot(p[0] - cx, p[1] - cy) || 1, w = wOf(g.names[i]) * 3.8, d = 2.2 + w / 2; want(g.names[i], 3.8, g.image ? BLUE : INK, [[p[0] + (p[0] - cx) / l * d, p[1] + (p[1] - cy) / l * 3.4], ...around(p[0], p[1], w, 3.8, 1.4)], `polygon:${k}`); }
    });
    parts[`polygon:${k}`] = part(Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1])), 2);
  });
  (v.segments || []).forEach((g, k) => {
    const a = [X(g.from[0]), Y(g.from[1])], b = [X(g.to[0]), Y(g.to[1])];
    shapes += `<line data-seg="${k}" x1="${r2(a[0])}" y1="${r2(a[1])}" x2="${r2(b[0])}" y2="${r2(b[1])}" stroke="${INK}" stroke-width="1" stroke-linecap="round"${g.dash ? ' stroke-dasharray="1.8 1.3"' : ''}/>`
      + `<circle cx="${r2(a[0])}" cy="${r2(a[1])}" r="0.9" fill="${INK}"/><circle cx="${r2(b[0])}" cy="${r2(b[1])}" r="0.9" fill="${INK}"/>`;
    along(a, b);
    if (g.label) { const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, l = Math.hypot(b[0] - a[0], b[1] - a[1]), nxn = -(b[1] - a[1]) / l, nyn = (b[0] - a[0]) / l, w = wOf(g.label) * 3.6, d = 2.2 + Math.abs(nxn) * w / 2 + Math.abs(nyn) * 1.4; want(g.label, 3.6, INK, [[mx - nxn * d, my - nyn * d], [mx + nxn * d, my + nyn * d]], `segment:${k}`); }
    parts[`segment:${k}`] = part(a[0], a[1], b[0], b[1], 1.6);
  });
  (v.lines || []).forEach((g, k) => {
    const [p, q] = linePts(g), c = clipLine(p, q, x0, x1, y0, y1), look = LINE_LOOK[k % 3], dash = g.dash ? '2.4 1.4' : look.dash;
    if (!c) return;
    const a = [X(c[0][0]), Y(c[0][1])], b = [X(c[1][0]), Y(c[1][1])], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, ux = (b[0] - a[0]) / l, uy = (b[1] - a[1]) / l;
    // a line runs on for ever: an arrow at both ends, just inside the grid
    shapes += `<line data-line="${k}" x1="${r2(a[0] + ux * 1.4)}" y1="${r2(a[1] + uy * 1.4)}" x2="${r2(b[0] - ux * 1.4)}" y2="${r2(b[1] - uy * 1.4)}" stroke="${look.tone}" stroke-width="1.1"${dash ? ` stroke-dasharray="${dash}"` : ''}/>` + head(b[0], b[1], ux, uy, look.tone, 2) + head(a[0], a[1], -ux, -uy, look.tone, 2);
    along(a, b);
    if (g.label) {
      // its name beside its upper end (the lower end where that is clear), off the line
      const w = wOf(g.label) * 3.6, hi = a[1] < b[1] ? a : b, lo = hi === a ? b : a, dir = hi === a ? 1 : -1, nxn = -uy, nyn = ux, d = 2 + Math.abs(nxn) * w / 2 + Math.abs(nyn) * 1.6;
      const at = (e, sgn, t, side) => [e[0] + sgn * ux * t + side * nxn * d, e[1] + sgn * uy * t + side * nyn * d];
      want(g.label, 3.6, look.tone === LEAF ? '#167A4C' : look.tone, [5, 10, 15, 20, 26].flatMap(t => [at(hi, dir, t, 1), at(hi, dir, t, -1)]).concat([5, 10, 15].flatMap(t => [at(lo, -dir, t, 1), at(lo, -dir, t, -1)])), `line:${k}`);
    }
    parts[`line:${k}`] = part(a[0], a[1], b[0], b[1], 1.6);
  });
  if (v.slope) {
    const P = [X(v.slope.from[0]), Y(v.slope.from[1])], Q = [X(v.slope.to[0]), Y(v.slope.to[1])], C = [Q[0], P[1]];
    const dx = v.slope.to[0] - v.slope.from[0], dy = v.slope.to[1] - v.slope.from[1], sgx = Math.sign(Q[0] - P[0]), sgy = Math.sign(Q[1] - P[1]), m = 1.5;
    // the run along, then the rise up (or down), dashed, with the square corner where they meet
    shapes += `<path data-slope="1" d="M${r2(P[0])} ${r2(P[1])} L${r2(C[0])} ${r2(C[1])} L${r2(Q[0])} ${r2(Q[1])}" fill="none" stroke="${RED}" stroke-width="0.9" stroke-dasharray="1.6 1.1" stroke-linejoin="round"/>`
      + `<path d="M${r2(C[0] - sgx * m)} ${r2(C[1])} v${r2(sgy * m)} h${r2(sgx * m)}" fill="none" stroke="${RED}" stroke-width="0.5"/>`;
    along(P, C); along(C, Q);
    const run = v.slope.run || `run ${fmt(dx)}`, rise = v.slope.rise || `rise ${fmt(dy)}`, wi = wOf(rise) * 3.6;
    want(run, 3.6, RED, [[(P[0] + C[0]) / 2, P[1] - sgy * 2.8], [(P[0] + C[0]) / 2, P[1] + sgy * 2.8]], 'slope');
    want(rise, 3.6, RED, [[C[0] + sgx * (wi / 2 + 1.6), (C[1] + Q[1]) / 2], [C[0] - sgx * (wi / 2 + 1.6), (C[1] + Q[1]) / 2]], 'slope');
    parts.slope = part(P[0], P[1], Q[0], Q[1], 1.6);
  }
  let dots = '';
  const pn = (v.points || []).length, pr = pn <= 8 ? 1.6 : 1.3;
  (v.points || []).forEach((p, k) => {
    const px = X(p.x), py = Y(p.y);
    dots += `<circle data-point="${k}" cx="${r2(px)}" cy="${r2(py)}" r="${pr}" fill="${p.open ? GROUND : TONES[p.tone ?? 1]}" stroke="${INK}" stroke-width="${p.open ? 0.8 : 0.6}"/>`;
    keep(px, py, pr * 2 + 0.6, pr * 2 + 0.6);
    parts[`point:${k}`] = part(px - pr, py - pr, px + pr, py + pr, 1.4);
  });
  (v.points || []).forEach((p, k) => { if (p.label) { const w = wOf(p.label) * 3.8; names.unshift({ s: p.label, size: 3.8, fill: INK, cands: around(X(p.x), Y(p.y), w, 3.8, pr + 0.9), key: `point:${k}` }); } });
  // place the names: the first spot that is inside the frame and clear; failing that, the spot that covers least
  let words = '';
  const lim = [0.8, ext[0], 99.2, Math.max(ext[1], gy + ph + 3)];
  for (const n of names) {
    const w = wOf(n.s) * n.size, h = n.size;
    let best = null, bestCost = Infinity;
    for (const [cx0, cy0] of n.cands) {
      const cx = clamp(cx0, lim[0] + w / 2, lim[2] - w / 2), cy = clamp(cy0, lim[1] + h / 2, lim[3] - h / 2), moved = Math.abs(cx - cx0) + Math.abs(cy - cy0);
      const b = [cx - w / 2, cy - h * 0.5, cx + w / 2, cy + h * 0.5];
      const cost = boxes.reduce((a, o) => a + Math.max(0, Math.min(b[2], o[2]) - Math.max(b[0], o[0])) * Math.max(0, Math.min(b[3], o[3]) - Math.max(b[1], o[1])), 0) + moved * 0.5;
      if (cost < bestCost - 1e-9) { best = [cx, cy]; bestCost = cost; }
      if (cost === 0) break;
    }
    keep(best[0], best[1], w, h);
    words += mid(best[0], best[1], n.s, n.size, 800, n.fill, true);
    // the part a name belongs to grows to hold it
    const pb = parts[n.key], bx = [best[0] - w / 2, best[1] - h / 2, best[0] + w / 2, best[1] + h / 2];
    if (pb) { const o = [pb[0], pb[1] * 0.5625, pb[0] + pb[2], (pb[1] + pb[3]) * 0.5625]; parts[n.key] = part(Math.min(o[0], bx[0]), Math.min(o[1], bx[1]), Math.max(o[2], bx[2]), Math.max(o[3], bx[3]), 0.4); }
    ext = [Math.min(ext[0], best[1] - h * 0.55), Math.max(ext[1], best[1] + h * 0.66)];
  }
  return { svg: s + shapes + nums + dots + words, extent: [Math.max(0, ext[0]), Math.min(56.25, ext[1])], parts, X, Y, kx, ky };
});

// ---------------------------------------------------------------------------------------------- double
/** Two scales, one over the other: the top line at y 23 with its values over it, the bottom line at y 37 with its
 *  values under it, tick for tick (a dashed tie joins each pair); each scale's name at the far side of its values. */
const doubleLay = once(v => {
  const n = v.ticks.length, xa = 12, xb = 86, slot = (xb - xa) / (n - 1), X = i => xa + i * slot, yT = 23, yB = 37, vT = 17, vB = 43;
  const fs = Math.min(4.2, ...v.ticks.flat().filter(t => !isQ(t)).map(t => fit(t, slot - 1.6, 4.2)));
  let s = '';
  const parts = { top: part(5, vT - 3.4, 96, yT + 2.4, 0.6), bottom: part(5, yB - 2.4, 96, vB + 3.4, 0.6) };
  for (const y of [yT, yB]) s += `<line x1="6" y1="${y}" x2="94" y2="${y}" stroke="${INK}" stroke-width="0.8"/>` + head(95.6, y, 1, 0, INK, 2.4);
  v.ticks.forEach((t, i) => {
    const x = X(i);
    s += `<line data-tie="${i}" x1="${r2(x)}" y1="${yT + 2.4}" x2="${r2(x)}" y2="${yB - 2.4}" stroke="${LINE}" stroke-width="0.5" stroke-dasharray="1.2 1"/>`;
    for (const y of [yT, yB]) s += `<line x1="${r2(x)}" y1="${y - 2.2}" x2="${r2(x)}" y2="${y + 2.2}" stroke="${INK}" stroke-width="0.7"/>`;
    s += isQ(t[0]) ? blank(x, vT) : mid(x, vT, t[0], fs, 700);
    s += isQ(t[1]) ? blank(x, vB) : mid(x, vB, t[1], fs, 700);
    parts[`pair:${i}`] = part(x - slot / 2 + 0.6, vT - 3.4, x + slot / 2 - 0.6, vB + 3.4, 0);
    if (isQ(t[0])) parts[`blank:${i}:top`] = part(x - 3.5, vT - 3.2, x + 3.5, vT + 3.2, 0.8);
    if (isQ(t[1])) parts[`blank:${i}:bottom`] = part(x - 3.5, vB - 3.2, x + 3.5, vB + 3.2, 0.8);
  });
  if (v.top) s += tx(6, 9.6, v.top, fit(v.top, 88, 3.8), 'start', 800, LEAF);
  if (v.bottom) s += tx(6, 51.6, v.bottom, fit(v.bottom, 88, 3.8), 'start', 800, LEAF);
  return { svg: s, extent: [v.top ? tTop(9.6, 3.8) : vT - 3.8, v.bottom ? tBot(51.6, 3.8) : vB + 3.8], parts };
});

// ---------------------------------------------------------------------------------------------- boxplot
/** One row a plot: its name, its five numbers over where they sit, then the box (lower quartile to upper quartile,
 *  the median a thick line across it) and its two whiskers; under the rows, the one axis they share. */
const boxLay = once(v => {
  const two = v.plots.length === 2, xa = 10, xb = 90, X = val => xa + (val - v.min) / (v.max - v.min) * (xb - xa);
  const rows = two ? [{ name: 5.6, vals: 10.8, y: 12.8, h: 7 }, { name: 25.2, vals: 30.4, y: 32.4, h: 7 }] : [{ name: 9.4, vals: 15.6, y: 18, h: 10 }];
  const ay = two ? 43.4 : 33.6, n = Math.round((v.max - v.min) / v.step), named = v.plots.some(p => p.name);
  let s = `<line data-axis="x" x1="${xa - 3}" y1="${ay}" x2="${xb + 3}" y2="${ay}" stroke="${INK}" stroke-width="0.8"/>`;
  const ticks = Array.from({ length: n + 1 }, (_, i) => v.min + i * v.step), k = every(Math.max(...ticks.map(t => wOf(fmt(t)))) * 3.4 + 1.4, (xb - xa) / n);
  ticks.forEach((t, i) => { s += `<line x1="${r2(X(t))}" y1="${ay - (i % k ? 0.8 : 1.4)}" x2="${r2(X(t))}" y2="${ay + (i % k ? 0.8 : 1.4)}" stroke="${INK}" stroke-width="${i % k ? 0.4 : 0.6}"/>` + (i % k ? '' : tx(X(t), ay + 5.2, fmt(t), 3.4, 'middle', 700)); });
  if (v.unit) s += tx(50, ay + 10.2, v.unit, fit(v.unit, 88, 3.6), 'middle', 800, LEAF);
  const parts = { axis: part(xa - 3, ay - 1.4, xb + 3, tBot(ay + 5.2, 3.4), 0.8) };
  v.plots.forEach((p, i) => {
    const r = rows[i], [lo, q1, md, q3, hi] = p.five, my = r.y + r.h / 2, tone = TONES[p.tone ?? (i ? 3 : 2)];
    if (p.name) s += tx(xa - 3, r.name, p.name, 3.8, 'start', 800, LEAF);
    s += `<line x1="${r2(X(lo))}" y1="${my}" x2="${r2(X(q1))}" y2="${my}" stroke="${INK}" stroke-width="0.8"/><line x1="${r2(X(q3))}" y1="${my}" x2="${r2(X(hi))}" y2="${my}" stroke="${INK}" stroke-width="0.8"/>`;
    for (const e of [lo, hi]) s += `<line data-cap="1" x1="${r2(X(e))}" y1="${r2(my - r.h * 0.3)}" x2="${r2(X(e))}" y2="${r2(my + r.h * 0.3)}" stroke="${INK}" stroke-width="0.8"/>`;
    s += `<rect data-box="${i}" x="${r2(X(q1))}" y="${r.y}" width="${r2(X(q3) - X(q1))}" height="${r.h}" fill="${tone}" stroke="${INK}" stroke-width="0.7"/>`
      + `<line data-median="${i}" x1="${r2(X(md))}" y1="${r.y}" x2="${r2(X(md))}" y2="${r.y + r.h}" stroke="${INK}" stroke-width="1.4"/>`;
    // the five numbers, each over its own place; two that are the same number are written once
    const vals = [...new Set(p.five)].map(val => ({ s: fmt(val), c: X(val), hw: wOf(fmt(val)) * 3.6 / 2 }));
    spread(vals, 1, 99, 1.6).forEach(t => { s += tx(t.c, r.vals, t.s, 3.6, 'middle', 800); });
    parts[`plot:${i}`] = part(Math.min(xa - 3, X(lo)), tTop(p.name ? r.name : r.vals, 3.8), Math.max(X(hi), xb), r.y + r.h, 0.8);
    parts[`box:${i}`] = part(X(q1), r.y, X(q3), r.y + r.h, 1.2);
    parts[`median:${i}`] = part(X(md) - 1, r.y, X(md) + 1, r.y + r.h, 1.2);
  });
  return { svg: s, extent: [tTop(named ? rows[0].name : rows[0].vals, 3.8), v.unit ? tBot(ay + 10.2, 3.6) : tBot(ay + 5.2, 3.4)], parts };
});

// ---------------------------------------------------------------------------------------------- angles
/** Angles at one point, going round anticlockwise from the ray that points right. Each has its wedge (two radii
 *  taking turns, so neighbours read apart), or a square corner where it is 90 degrees, and its measure on its
 *  bisector, far enough out to fit between its rays. The unknown is a "?" on a dashed wedge. */
const anglesLay = once(v => {
  const a = v.angles, sum = a.reduce((t, q) => t + q.deg, 0);
  let V, R, R2 = 0;
  if (v.layout === 'line' || (v.layout === 'rays' && sum <= 180.01)) { V = [50, 46]; R = 34; }
  else if (v.layout === 'corner') { V = [33, 47]; R = 35; }
  else if (v.layout === 'cross') { V = [50, 28.5]; R = 31; R2 = Math.min(31, 21 / Math.sin(a[0].deg * Math.PI / 180)); }
  else { V = [50, 29]; R = 21.5; }
  const P = (deg, r) => [V[0] + r * Math.cos(deg * Math.PI / 180), V[1] - r * Math.sin(deg * Math.PI / 180)];
  // the rays: one at the start of each angle and one at the end of the last (where the angles go all the way round,
  // that is the first ray again)
  const starts = []; let t = 0; for (const q of a) { starts.push(t); t += q.deg; }
  const dirs = [...starts]; if (sum < 359.99) dirs.push(sum);
  const len = d => (v.layout === 'cross' && (Math.round(d) % 180 !== 0) ? R2 : R);
  let s = '', wedges = '', words = '';
  const ys = [V[1] + 1.4], parts = { vertex: part(V[0] - 2, V[1] - 2, V[0] + 2, V[1] + 2, 0.6) };
  for (const d of dirs) { const e = P(d, len(d)), c = Math.cos(d * Math.PI / 180), sn = -Math.sin(d * Math.PI / 180); s += `<line data-ray="${r2(d)}" x1="${V[0]}" y1="${V[1]}" x2="${r2(e[0] - c * 1.4)}" y2="${r2(e[1] - sn * 1.4)}" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>` + head(e[0], e[1], c, sn, INK, 2); ys.push(e[1] - 1.2, e[1] + 1.2); }
  a.forEach((q, i) => {
    if (q.blank) return;
    const d0 = starts[i], d1 = d0 + q.deg, bis = d0 + q.deg / 2, label = q.label || `${fmt(q.deg)}°`, unknown = isQ(label), ar = 7.2 + 2.4 * (i % 2);
    const size = unknown ? 5 : 4.2, w = wOf(label) * size, limit = Math.min(len(d0), len(d1)) - 3;
    // far enough out that the measure fits between the two rays; in a narrow angle it also shrinks (never under 3.4)
    const needR = q.deg < 170 ? (w / 2 + 1) / Math.sin(q.deg * Math.PI / 360) : 0, br = bis * Math.PI / 180, clear = ar + 1 + Math.abs(Math.cos(br)) * w / 2 + Math.abs(Math.sin(br)) * size * 0.5, lr = clamp(Math.max(clear, needR), 0, Math.max(limit, ar + 4));
    const fs = needR > lr ? fit(label, 2 * (lr * Math.sin(q.deg * Math.PI / 360) - 0.6), size) : size;
    const tone = TONES[i % 4], p0 = P(d0, ar), p1 = P(d1, ar);
    if (Math.abs(q.deg - 90) < 0.01) {
      // a square corner says 90 degrees without a number
      const m = 4.2, c = P(bis, m * Math.SQRT2), e0 = P(d0, m), e1 = P(d1, m);
      wedges += `<path data-angle="${i}" data-square="1" d="M${V[0]} ${V[1]} L${r2(e0[0])} ${r2(e0[1])} L${r2(c[0])} ${r2(c[1])} L${r2(e1[0])} ${r2(e1[1])} Z" fill="${tone}" fill-opacity="0.6" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"/>`;
    } else {
      wedges += `<path data-angle="${i}" d="M${V[0]} ${V[1]} L${r2(p0[0])} ${r2(p0[1])} A${r2(ar)} ${r2(ar)} 0 ${q.deg > 180 ? 1 : 0} 0 ${r2(p1[0])} ${r2(p1[1])} Z" fill="${unknown ? '#FFFFFF' : tone}" fill-opacity="${unknown ? 1 : 0.6}" stroke="${INK}" stroke-width="0.6" stroke-linejoin="round"${unknown ? ' stroke-dasharray="1.4 1"' : ''}/>`;
    }
    const c = P(bis, lr);
    words += mid(c[0], c[1], label, fs, 800, unknown ? LEAF : INK, true);
    ys.push(c[1] - fs * 0.6, c[1] + fs * 0.66);
    const far = [P(d0, lr + 2), P(d1, lr + 2), P(bis, lr + fs * 0.6), V, [c[0] - w / 2, c[1]], [c[0] + w / 2, c[1]]];
    parts[`angle:${i}`] = part(Math.min(...far.map(p => p[0])), Math.min(...far.map(p => p[1])), Math.max(...far.map(p => p[0])), Math.max(...far.map(p => p[1])), 0.8);
  });
  s = wedges + s + `<circle cx="${V[0]}" cy="${V[1]}" r="1.1" fill="${INK}"/>` + words;
  return { svg: s, extent: [Math.max(0, Math.min(...ys) - 0.6), Math.min(56.25, Math.max(...ys) + 0.6)], parts };
});

// ---------------------------------------------------------------------------------------------- righttriangle
/** A right triangle standing on its base, the square corner at the bottom left (or right): drawn to its own
 *  proportions as far as a phone allows (never thinner than 1 to 3), each side's label beside it. */
const triLay = once(v => {
  const k = clamp(v.height / v.base, 1 / 3, 2), w = Math.min(54, 31 / k), h = w * k, flip = v.corner === 'right', yB = 45, dir = flip ? -1 : 1;
  const xC = 50 - dir * (w / 2 - 3), A = [xC, yB], B = [xC + dir * w, yB], C = [xC, yB - h], L = v.labels;   // A: the square corner
  let s = `<polygon data-tri="1" points="${r2(A[0])},${A[1]} ${r2(B[0])},${B[1]} ${r2(C[0])},${r2(C[1])}" fill="${TONES[2]}" fill-opacity="0.55" stroke="${INK}" stroke-width="0.9" stroke-linejoin="round"/>`
    + `<path data-square="1" d="M${r2(A[0] + dir * 3.4)} ${yB} v-3.4 h${r2(-dir * 3.4)}" fill="none" stroke="${INK}" stroke-width="0.6"/>`;
  const parts = { corner: part(A[0], yB - 3.4, A[0] + dir * 3.4, yB, 1.2), triangle: part(A[0], C[1], B[0], yB, 1.6) }, ys = [C[1] - 1, yB + 1];
  const word = (cx, cy, str, key, anchorDir = 0) => {
    const q = isQ(str), size = q ? 5.2 : 4.4, wd = wOf(str) * size, x = cx + anchorDir * wd / 2;
    s += mid(x, cy, str, size, 800, q ? LEAF : INK, true); ys.push(cy - size * 0.6, cy + size * 0.66);
    parts[key] = part(x - wd / 2, cy - size / 2, x + wd / 2, cy + size / 2, 1.2);
  };
  if (L.base) word((A[0] + B[0]) / 2, yB + 4.4, L.base, 'base');
  if (L.height) word(A[0] - dir * 2.4, yB - h / 2, L.height, 'height', -dir);
  if (L.hyp) {
    // outside the long side, off its middle, pushed out along the side's own normal
    const nx = dir * h / Math.hypot(w, h), ny = -w / Math.hypot(w, h), size = isQ(L.hyp) ? 5.2 : 4.4, d = 2 + Math.abs(nx) * wOf(L.hyp) * size / 2 + Math.abs(ny) * size * 0.5;
    word((B[0] + C[0]) / 2 + nx * d, (B[1] + C[1]) / 2 + ny * d, L.hyp, 'hyp');
  }
  return { svg: s, extent: [Math.max(0, Math.min(...ys)), Math.max(...ys)], parts };
});

// ---------------------------------------------------------------------------------------------- net
/** A net, flat: its faces in three tones (opposite faces of the box share one), the edges it folds on dashed, its
 *  outline solid, and its three lengths written beside the edges they measure. Drawn to its own proportions as far
 *  as a phone allows (no edge is drawn shorter than a fifth of the longest). */
const netLay = once(v => {
  const top = Math.max(...v.dims), [d1, d2, d3] = v.dims.map(d => Math.max(d, top / 5)), names = v.labels || v.dims.map(fmt), y0 = 6.5;
  const rect = (key, x, y, w, h, tone) => `<rect data-face="${key}" x="${r2(x)}" y="${r2(y)}" width="${r2(w)}" height="${r2(h)}" fill="${TONES[tone]}" fill-opacity="0.75"/>`;
  const fold = (x1, y1, x2, y2) => `<line data-fold="1" x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${INK}" stroke-width="0.5" stroke-dasharray="1.4 1"/>`;
  const outline = pts => `<polygon data-outline="1" points="${pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ')}" fill="none" stroke="${INK}" stroke-width="0.8" stroke-linejoin="round"/>`;
  const parts = {};
  let s = '';
  if (v.solid === 'box') {
    // length l, width w, height h: a strip of four faces (left, front, right, back), the top over the front and the
    // bottom under it
    const [l, w, h] = [d1, d2, d3], W = 2 * l + 2 * w, H = h + 2 * w, u = Math.min(78 / W, 38 / H), x0 = 50 - W * u / 2 + 3, ys = y0 + w * u, ye = ys + h * u, xf = x0 + w * u, xr = xf + l * u, xb = xr + w * u, xe = xb + l * u;
    s += rect('left', x0, ys, w * u, h * u, 2) + rect('front', xf, ys, l * u, h * u, 0) + rect('right', xr, ys, w * u, h * u, 2) + rect('back', xb, ys, l * u, h * u, 0) + rect('top', xf, y0, l * u, w * u, 1) + rect('bottom', xf, ye, l * u, w * u, 1);
    s += fold(xf, ys, xf, ye) + fold(xr, ys, xr, ye) + fold(xb, ys, xb, ye) + fold(xf, ys, xr, ys) + fold(xf, ye, xr, ye);
    s += outline([[x0, ys], [xf, ys], [xf, y0], [xr, y0], [xr, ys], [xe, ys], [xe, ye], [xr, ye], [xr, ye + w * u], [xf, ye + w * u], [xf, ye], [x0, ye]]);
    s += tx(x0 - 1.6, (ys + ye) / 2 + 1.5, names[2], 4.2, 'end', 800) + mid((xf + xr) / 2, ye + w * u + 3.6, names[0], 4.2) + tx(xr + 1.6, ye + w * u / 2 + 1.5, names[1], 4.2, 'start', 800);
    Object.assign(parts, { net: part(x0, y0, xe, ye + w * u, 1.6), left: part(x0, ys, xf, ye), front: part(xf, ys, xr, ye), right: part(xr, ys, xb, ye), back: part(xb, ys, xe, ye), top: part(xf, y0, xr, ys), bottom: part(xf, ye, xr, ye + w * u) });
    return { svg: s, extent: [y0 - 0.5, tBot(ye + w * u + 3.6 + 0.35 * 4.2, 4.2)], parts };
  }
  // a triangular prism: the triangle's base b and height t, the prism's length L. Three rectangles side by side (as
  // wide as the triangle's three sides), a triangle over the middle one and one under it.
  const [b, t, L] = [d1, d2, d3], sd = Math.hypot(b / 2, t), W = 2 * sd + b, H = L + 2 * t, u = Math.min(78 / W, 40 / H), x0 = 50 - W * u / 2 + 3, ys = y0 + t * u, ye = ys + L * u, xm = x0 + sd * u, xn = xm + b * u, xe = xn + sd * u, cx = (xm + xn) / 2;
  s += rect('side:0', x0, ys, sd * u, L * u, 2) + rect('base', xm, ys, b * u, L * u, 0) + rect('side:1', xn, ys, sd * u, L * u, 2);
  s += `<polygon data-face="end:0" points="${r2(xm)},${r2(ys)} ${r2(xn)},${r2(ys)} ${r2(cx)},${y0}" fill="${TONES[1]}" fill-opacity="0.75"/><polygon data-face="end:1" points="${r2(xm)},${r2(ye)} ${r2(xn)},${r2(ye)} ${r2(cx)},${r2(ye + t * u)}" fill="${TONES[1]}" fill-opacity="0.75"/>`;
  s += fold(xm, ys, xm, ye) + fold(xn, ys, xn, ye) + fold(xm, ys, xn, ys) + fold(xm, ye, xn, ye);
  // the triangle's height: dashed from its tip to its base, with the square corner where it lands
  s += `<line data-height="1" x1="${r2(cx)}" y1="${y0}" x2="${r2(cx)}" y2="${r2(ys)}" stroke="${INK}" stroke-width="0.5" stroke-dasharray="0.8 0.8"/><path d="M${r2(cx)} ${r2(ys - 1.6)} h1.6 v1.6" fill="none" stroke="${INK}" stroke-width="0.4"/>`;
  s += outline([[x0, ys], [xm, ys], [cx, y0], [xn, ys], [xe, ys], [xe, ye], [xn, ye], [cx, ye + t * u], [xm, ye], [x0, ye]]);
  s += tx(x0 - 1.6, (ys + ye) / 2 + 1.5, names[2], 4.2, 'end', 800) + mid(cx, ys + 3.6, names[0], fit(names[0], Math.max(b * u - 1.5, 4), 4.2), 800, INK, true) + tx(cx + b * u / 4 + 2.2, y0 + t * u / 2 + 1.5, names[1], 4.2, 'start', 800);
  Object.assign(parts, { net: part(x0, y0, xe, ye + t * u, 1.6), 'side:0': part(x0, ys, xm, ye), base: part(xm, ys, xn, ye), 'side:1': part(xn, ys, xe, ye), 'end:0': part(xm, y0, xn, ys), 'end:1': part(xm, ye, xn, ye + t * u) });
  return { svg: s, extent: [y0 - 0.5, ye + t * u + 0.6], parts };
});

// ---------------------------------------------------------------------------------------------- flow
/** An operation flow, left to right: a value in its chip, a machine that does one operation, the next value... With
 *  `undo`, the way back runs under it, right to left: a dashed blue path from each value to the one before it,
 *  through the inverse operation in its dashed box. An unknown value is a "?" chip. */
const flowLay = once(v => {
  const n = v.ops.length, cwid = n === 3 ? 10.5 : 15, gap = Math.min(24, (88 - (n + 1) * cwid) / n), total = (n + 1) * cwid + n * gap, x0 = 50 - total / 2, cy = 21, bw = Math.min(gap - 5.6, 15);
  const cxOf = i => x0 + i * (cwid + gap) + cwid / 2;
  let s = '';
  const parts = {};
  v.values.forEach((val, i) => {
    const cx = cxOf(i), q = isQ(val);
    s += `<rect data-value="${i}" x="${r2(cx - cwid / 2)}" y="${cy - 6}" width="${cwid}" height="12" rx="2" fill="#FFFFFF" stroke="${INK}" stroke-width="0.7"${q ? ' stroke-dasharray="1.6 1.1"' : ''}/>` + mid(cx, cy, val, q ? 5.6 : fit(val, cwid - 1.6, 5.2), 800, q ? LEAF : INK);
    parts[`value:${i}`] = part(cx - cwid / 2, cy - 6, cx + cwid / 2, cy + 6, 1);
  });
  v.ops.forEach((op, i) => {
    const xa = cxOf(i) + cwid / 2, xb = cxOf(i + 1) - cwid / 2, mx = (xa + xb) / 2;
    s += `<line x1="${r2(xa)}" y1="${cy}" x2="${r2(xb - 1.6)}" y2="${cy}" stroke="${INK}" stroke-width="0.9"/>` + head(xb - 0.2, cy, 1, 0, INK, 1.9);
    s += `<rect data-op="${i}" x="${r2(mx - bw / 2)}" y="${cy - 5}" width="${r2(bw)}" height="10" rx="1.4" fill="${TONES[i % 4]}" stroke="${INK}" stroke-width="0.8"/>` + mid(mx, cy, op, fit(op, bw - 1.4, 4.6), 800);
    parts[`op:${i}`] = part(mx - bw / 2, cy - 5, mx + bw / 2, cy + 5, 1);
    if (v.undo) {
      // back from value i + 1 to value i: down, along, and up into the chip, through the inverse operation
      const fromX = cxOf(i + 1) - 1.8, toX = cxOf(i) + 1.8, uy = 36, ub = Math.min(bw, gap - 1.5);
      s += `<path data-undo="${i}" d="M${r2(fromX)} ${cy + 6.6} V${uy} H${r2(toX)} V${cy + 8.6}" fill="none" stroke="${BLUE}" stroke-width="0.9" stroke-dasharray="1.6 1.1" stroke-linejoin="round"/>` + head(toX, cy + 6.5, 0, -1, BLUE, 1.9);
      s += `<rect x="${r2(mx - ub / 2)}" y="${uy - 3.6}" width="${r2(ub)}" height="7.2" rx="1.2" fill="#FFFFFF" stroke="${BLUE}" stroke-width="0.6" stroke-dasharray="1.4 1"/>` + mid(mx, uy, v.undo[i], fit(v.undo[i], ub - 1.2, 4.2), 800);
      parts[`undo:${i}`] = part(toX, cy + 6.6, fromX, uy + 3.6, 1);
    }
  });
  if (v.inName) s += tx(cxOf(0), 11.4, v.inName, fit(v.inName, 2 * Math.min(cxOf(0), 100 - cxOf(0)) - 1, 3.8), 'middle', 800, LEAF);
  if (v.outName) s += tx(cxOf(n), 11.4, v.outName, fit(v.outName, 2 * Math.min(cxOf(n), 100 - cxOf(n)) - 1, 3.8), 'middle', 800, LEAF);
  return { svg: s, extent: [v.inName || v.outName ? tTop(11.4, 3.8) : cy - 6.6, v.undo ? 40.2 : cy + 6.6], parts };
});

// ---------------------------------------------------------------------------------------------- numberline options
/** `upright`: the number line stood on end, the bigger numbers higher. Its marks are named on its left, its point
 *  (yellow, the same point as on the line that lies flat) is named on its right, and each hop is an arrow beside
 *  it, up or down, with its label. With `tube` it is a thermometer: a tube and a bulb round the line, filled red up to
 *  the point. */
const uprightLay = once(v => {
  const tube = !!v.tube, ax = 42, yHi = tube ? 9.5 : 9, yLo = tube ? 42.5 : 47.5, Y = at => yLo - (at - v.min) / (v.max - v.min) * (yLo - yHi);
  let s = '';
  const parts = { line: part(ax - 3, yHi - 3, ax + 3, yLo + 3, 0.6) };
  if (tube) {
    const by = 49.2, br = 4.6;
    s += `<path data-tube="1" d="M${ax - 2.6} ${by - 3.6} V8.1 a2.6 2.6 0 0 1 5.2 0 V${by - 3.6} a${br} ${br} 0 1 1 -5.2 0 Z" fill="#FFFFFF" stroke="${INK}" stroke-width="0.7" stroke-linejoin="round"/>`
      + `<circle cx="${ax}" cy="${by}" r="3.2" fill="${MERCURY}"/>`
      + (v.point ? `<rect data-level="1" x="${ax - 1.3}" y="${r2(Y(v.point.at))}" width="2.6" height="${r2(by - Y(v.point.at))}" fill="${MERCURY}"/>` : '');
    parts.line = part(ax - 4.6, 5.5, ax + 4.6, by + br, 0.6);
  } else {
    s += `<line x1="${ax}" y1="6" x2="${ax}" y2="50.5" stroke="${INK}" stroke-width="0.8"/>` + head(ax, 4.6, 0, -1) + head(ax, 51.9, 0, 1);
  }
  // the marks: a tick each, its name on the left; names that would touch are moved apart, the ticks stay true
  const lx = ax - (tube ? 6.4 : 4), names = v.marks.map(m => ({ m, c: Y(m.at), hw: 1.95 }));
  spread(names, 3.6, 53, 0).forEach(q => {
    const y = Y(q.m.at);
    s += (tube ? `<line data-tick="1" x1="${ax - 5.4}" y1="${r2(y)}" x2="${ax - 2.6}" y2="${r2(y)}" stroke="${INK}" stroke-width="0.7"/>` : `<line data-tick="1" x1="${ax - 2.6}" y1="${r2(y)}" x2="${ax + 2.6}" y2="${r2(y)}" stroke="${INK}" stroke-width="0.7"/>`)
      + tx(lx, q.c + 1.26, q.m.label, 3.6, 'end', 700);
  });
  if (v.point) {
    const y = Y(v.point.at), px = ax + (tube ? 7 : 4.6);
    s += tube ? `<line x1="${ax + 2.6}" y1="${r2(y)}" x2="${ax + 5.6}" y2="${r2(y)}" stroke="${INK}" stroke-width="0.7"/>` : `<circle cx="${ax}" cy="${r2(y)}" r="2.3" fill="#FFD23F" stroke="${INK}" stroke-width="0.7"/>`;
    s += tx(px, y + 1.6, v.point.label, 4.6, 'start', 800, INK, true);
    parts.point = part(ax - 2.4, y - 2.6, px + wOf(v.point.label) * 4.6, y + 2.6, 0.8);
  }
  (v.hops || []).forEach((h, k) => {
    const hx = 62 + 12 * k, y1 = Y(h.from), y2 = Y(h.to), dir = Math.sign(y2 - y1), fs = fit(h.label, 9.6, 3.8);
    // a faint level line ties each end of the arrow to its number on the line
    for (const y of [y1, y2]) s += `<line data-level-line="1" x1="${ax + 2.8}" y1="${r2(y)}" x2="${hx}" y2="${r2(y)}" stroke="${LINE}" stroke-width="0.5" stroke-dasharray="1.2 1"/>`;
    s += `<circle cx="${hx}" cy="${r2(y1)}" r="0.9" fill="${LEAF}"/><line data-hop="${k}" x1="${hx}" y1="${r2(y1)}" x2="${hx}" y2="${r2(y2 - dir * 1.6)}" stroke="${LEAF}" stroke-width="1.1"/>` + head(hx, y2, 0, dir, LEAF, 2.2)
      + tx(hx + 2.2, (y1 + y2) / 2 + 0.35 * fs, h.label, fs, 'start', 800, LEAF);
    parts[`hop:${k}`] = part(hx - 1.4, y1, hx + 2.2 + wOf(h.label) * fs, y2, 1);
  });
  return { svg: s, extent: tube ? [5, 54.3] : [4.2, 52.4], parts };
});
export const uprightSvg = v => uprightLay(v).svg;
export const uprightExtent = v => uprightLay(v).extent;
/** `ray` on the number line that lies flat (X maps a number to its place on the line at y 36): a thick green ray
 *  from `at` to the line's end, with its own arrow, and a circle at `at`: filled when `at` is part of the answer,
 *  hollow (`open`) when it is not. */
export function raySvg(v, X) {
  const x = X(v.ray.at), right = v.ray.dir === 'right', end = right ? 92.6 : 7.4;
  return `<line data-ray="${v.ray.dir}" x1="${r2(x)}" y1="36" x2="${end}" y2="36" stroke="${LEAF}" stroke-width="2" stroke-linecap="butt"/>` + head(right ? 96 : 4, 36, right ? 1 : -1, 0, LEAF, 3.4)
    + `<circle data-end="${v.ray.open ? 'open' : 'closed'}" cx="${r2(x)}" cy="36" r="2" fill="${v.ray.open ? GROUND : LEAF}" stroke="${LEAF}" stroke-width="0.9"/>`;
}
const rayParts = v => { const x = 6 + ((v.ray.at - v.min) / (v.max - v.min)) * 88, right = v.ray.dir === 'right'; return { end: part(x - 2.5, 33.5, x + 2.5, 38.5, 0.8), ray: part(right ? x - 2.5 : 4, 33.5, right ? 96 : x + 2.5, 38.5, 0.8) }; };

// ---------------------------------------------------------------------------------------------- the pack
const LAY = { plane: planeLay, double: doubleLay, boxplot: boxLay, angles: anglesLay, righttriangle: triLay, net: netLay, flow: flowLay };
export const PRO_SVG = Object.fromEntries(Object.entries(LAY).map(([t, lay]) => [t, v => lay(v).svg]));
export const PRO_EXTENT = Object.fromEntries(Object.entries(LAY).map(([t, lay]) => [t, v => lay(v).extent]));
/** The named parts of a Pro diagram, each with the box a guided-tour step can use as it is: { name: [x, y, w, h] }
 *  in % of the drawing, the unit `slide.focus[].box` is written in. {} for a type with no named parts. */
export function diagramParts(v) {
  if (!v) return {};
  if (Object.hasOwn(LAY, v.type)) return LAY[v.type](v).parts;
  if (v.type === 'numberline') return v.upright ? uprightLay(v).parts : v.ray ? rayParts(v) : {};
  return {};
}

// ---------------------------------------------------------------------------------------------- the same in words
/** A label as a screen reader should say it: the unknown named, the signs and marks a voice drops or garbles
 *  written as words (negative, minus, degrees, squared, times, over). */
export function sayLabel(s) {
  return String(s).replace(/^\s*\?\s*$/, 'unknown').replace(/\?/g, ' unknown ')
    .replace(/(\d+) (\d+)\/(\d+)/g, '$1 and $2 over $3').replace(/(\d+)\/(\d+)/g, '$1 over $2')
    .replace(/(?<=[\w)°²³′]) − /g, ' minus ').replace(/(^|[\s(=<>≤≥×÷+,])−(?=[\d.a-z(])/gi, '$1negative ').replace(/−/g, ' minus ')
    .replace(/°C\b/g, ' degrees Celsius').replace(/°F\b/g, ' degrees Fahrenheit').replace(/°/g, ' degrees').replace(/²/g, ' squared').replace(/³/g, ' cubed').replace(/′/g, ' prime')
    .replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/≤/g, ' at most ').replace(/≥/g, ' at least ').replace(/\+/g, ' plus ').replace(/=/g, ' equals ')
    .replace(/\s+/g, ' ').trim();
}
const N = n => sayLabel(fmt(n));
const at = p => `(${N(p[0])}, ${N(p[1])})`;
const list = a => (a.length <= 1 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
/** What a Pro diagram shows, said from its data (the lesson viewer adds it to the picture's accessible name, after
 *  the author's own label): every number a sighted learner can read off the drawing, and never the value behind a
 *  "?". '' for a diagram this pack does not draw. */
export function diagramAlt(v) {
  if (!v) return '';
  if (v.type === 'plane') {
    const out = [`A coordinate plane: ${v.xName || 'x'} from ${N(v.x[0])} to ${N(v.x[1])}, ${v.yName || 'y'} from ${N(v.y[0])} to ${N(v.y[1])}.`];
    if (v.points) out.push(`${v.points.length === 1 ? 'Point' : `${v.points.length} points`}: ${list(v.points.map(p => `${p.label && !/^\(.*\)$/.test(p.label) ? `${sayLabel(p.label)} at ` : ''}${at([p.x, p.y])}${p.open ? ' (open circle)' : ''}`))}.`);
    for (const g of v.segments || []) out.push(`A segment from ${at(g.from)} to ${at(g.to)}${g.label ? `, labelled ${sayLabel(g.label)}` : ''}.`);
    for (const g of v.lines || []) {
      const how = g.through ? (g.through[0][0] === g.through[1][0] ? `an upright line through ${at(g.through[0])} and ${at(g.through[1])}` : `a line through ${at(g.through[0])} and ${at(g.through[1])}`) : `a line with slope ${N(g.m)} that crosses the y-axis at ${N(g.b)}`;
      out.push(`${how[0].toUpperCase()}${how.slice(1)}${g.label ? `, labelled ${sayLabel(g.label)}` : ''}.`);
    }
    for (const g of v.polygons || []) out.push(`${g.image ? 'Its image, drawn dashed: a' : 'A'} shape with corners ${list(g.pts.map((p, i) => `${g.names ? `${sayLabel(g.names[i])} ` : ''}${at(p)}`))}.`);
    if (v.slope) out.push(`A slope triangle from ${at(v.slope.from)} to ${at(v.slope.to)}: ${sayLabel(v.slope.run || `run ${fmt(v.slope.to[0] - v.slope.from[0])}`)}, ${sayLabel(v.slope.rise || `rise ${fmt(v.slope.to[1] - v.slope.from[1])}`)}.`);
    return out.join(' ');
  }
  if (v.type === 'double') {
    const a = v.top || 'the top line', b = v.bottom || 'the bottom line';
    return `A double number line: ${a} above ${b}. ${v.ticks.map(t => `${sayLabel(t[0])} lines up with ${sayLabel(t[1])}`).join('; ')}.`;
  }
  if (v.type === 'boxplot') {
    return `${v.plots.length === 2 ? 'Two box plots' : 'A box plot'} over a number line from ${N(v.min)} to ${N(v.max)}${v.unit ? ` (${v.unit})` : ''}. `
      + v.plots.map((p, i) => `${p.name || (v.plots.length === 2 ? `Plot ${i + 1}` : 'The data')}: lowest ${N(p.five[0])}, lower quartile ${N(p.five[1])}, median ${N(p.five[2])}, upper quartile ${N(p.five[3])}, highest ${N(p.five[4])}.`).join(' ');
  }
  if (v.type === 'angles') {
    const said = v.angles.map(q => (q.blank ? 'an angle with no measure' : sayLabel(q.label || `${fmt(q.deg)}°`)));
    const how = { line: `${said.length} angles side by side on a straight line`, corner: `${said.length} angles side by side in a right angle`, cross: 'Two straight lines cross and make four angles', rays: `${said.length === 1 ? 'An angle' : `${said.length} angles side by side`} at one point` }[v.layout];
    const sum = v.angles.reduce((t, q) => t + q.deg, 0), end = v.layout === 'line' ? ' Together they make 180 degrees.' : v.layout === 'corner' ? ' Together they make 90 degrees.' : v.layout === 'cross' ? ' Angles across from each other are equal.' : Math.abs(sum - 360) < 0.01 ? ' Together they go all the way round: 360 degrees.' : '';
    return `${how}. Going round: ${list(said)}.${end}`;
  }
  if (v.type === 'righttriangle') {
    const L = v.labels;
    return `A right triangle. ${[L.base ? `The leg along the bottom: ${sayLabel(L.base)}.` : '', L.height ? `The upright leg: ${sayLabel(L.height)}.` : '', L.hyp ? `The longest side, the hypotenuse: ${sayLabel(L.hyp)}.` : ''].filter(Boolean).join(' ')}`;
  }
  if (v.type === 'net') {
    const n = (v.labels || v.dims.map(fmt)).map(sayLabel);
    return v.solid === 'box'
      ? `The net of a rectangular prism, flat: six rectangles that fold into a box. Length ${n[0]}, width ${n[1]}, height ${n[2]}. Two faces are ${n[0]} by ${n[1]}, two are ${n[0]} by ${n[2]} and two are ${n[1]} by ${n[2]}.`
      : `The net of a triangular prism, flat: three rectangles side by side with a triangle above and below the middle one. Each triangle has base ${n[0]} and height ${n[1]}. The prism is ${n[2]} long.`;
  }
  if (v.type === 'flow') {
    // an operation that starts with a minus sign takes away (it is not a negative number)
    const op = o => sayLabel(String(o).replace(/^\u2212\s*/, 'minus '));
    const steps = v.ops.map((o, i) => `${op(o)} gives ${sayLabel(v.values[i + 1])}`);
    const back = v.undo ? ` Going back from ${sayLabel(v.values[v.values.length - 1])}: ${[...v.undo].reverse().map(op).join(', then ')}.` : '';
    return `An operation flow. Start with ${sayLabel(v.values[0])}; ${steps.join('; then ')}.${back}`;
  }
  if (v.type === 'numberline' && v.upright) {
    const out = [`${v.tube ? 'A thermometer' : 'An upright number line'} from ${N(v.min)} at the bottom to ${N(v.max)} at the top.`];
    if (v.marks.length) out.push(`Marked: ${list(v.marks.map(m => sayLabel(m.label)))}.`);
    if (v.point) out.push(`${v.tube ? 'It reads' : 'A point at'} ${N(v.point.at)}, labelled ${sayLabel(v.point.label)}.`);
    for (const h of v.hops || []) out.push(`An arrow ${h.to > h.from ? 'up' : 'down'} from ${N(h.from)} to ${N(h.to)}, labelled ${sayLabel(h.label)}.`);
    return out.join(' ');
  }
  if (v.type === 'numberline' && v.ray) {
    const r = v.ray, more = r.dir === 'right';
    return `On the number line, a ray from ${N(r.at)} to the ${r.dir}: every number ${more ? 'greater' : 'less'} than ${r.open ? '' : 'or equal to '}${N(r.at)}. The circle at ${N(r.at)} is ${r.open ? `open: ${N(r.at)} itself is not included` : `filled: ${N(r.at)} is included`}.`;
  }
  return '';
}
