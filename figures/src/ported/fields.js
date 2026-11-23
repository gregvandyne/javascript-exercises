// Oomba Figures: electric and magnetic field lines, traced through the real field so they curve the way they should and
// never cross. Point charges fall off as 1/r² (a slice through 3D, the way textbooks draw it); lines start evenly
// round each + charge and follow the field until they reach another charge or leave a box well outside the figure; a −
// charge's lines are traced backward and kept only when they do not end on a + charge, so a line between two charges
// is drawn once. A bar magnet's field is that of its two end faces carrying magnetic "charge" (+ on the north face, −
// on the south), each face a row of point sources; its loops are chosen by how high they pass over the magnet's
// middle, so they nest evenly. Parallel plates give straight lines from + to −, and a straight wire seen end-on gives
// circles, further apart further out. All in a 640 by 420 figure, y down. Pure numbers in, pure numbers out:
// figures/src/fields.js checks the data, works out the field at a point and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the magnet's lines (from the coil and magnet generator's field code,
// which is not ported) keep only the bar magnet with north on the right; any list of point charges is taken, each
// charge starting lines in proportion to its size, so unequal charges draw truthfully; the field at a point is
// exposed for the answers; the disc-shaped coil faces, the SVG path writing and the screen reader text are left out.

export const FL_W = 640, FL_H = 420, FL_CHARGE_R = 20, FL_WIRE_R = 18;
const FL_CX = FL_W / 2, FL_CY = FL_H / 2, FL_PAIR = 130, FL_ARROW_OUT = 75;
/** How many lines each setup draws: "fewer", "normal" or "more". */
export const FL_DENSITY = {
  charge: { fewer: 8, normal: 12, more: 16 }, opposite: { fewer: 8, normal: 12, more: 16 }, like: { fewer: 8, normal: 12, more: 16 },
  charges: { fewer: 8, normal: 12, more: 16 }, plates: { fewer: 5, normal: 7, more: 9 }, magnet: { fewer: 3, normal: 4, more: 6 }, wire: { fewer: 3, normal: 4, more: 5 },
};

/** The field of point charges ({ x, y, q }), each falling off as 1/r²: (x, y) -> [ex, ey]. */
export function flChargeField(charges) {
  return (x, y) => {
    let ex = 0, ey = 0;
    for (const c of charges) {
      const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy + 1e-6, k = c.q / (r2 * Math.sqrt(r2));
      ex += k * dx; ey += k * dy;
    }
    return [ex, ey];
  };
}
/** The field of charged end faces ({ x, y0, y1, q }: a vertical segment), each sampled as a row of point sources. */
export function flFaceField(faces, samples = 9) {
  const src = faces.flatMap(f => Array.from({ length: samples }, (_, i) => ({ x: f.x, y: f.y0 + ((i + 0.5) / samples) * (f.y1 - f.y0), q: f.q / samples })));
  return flChargeField(src);
}
/** Follow the field from `start`, a small step at a time (fourth-order Runge-Kutta), until stop(p) or it leaves bounds. */
export function flTrace(field, start, { stop, bounds, step = 2.5, maxSteps = 4000 }) {
  const dir = (x, y) => { const [bx, by] = field(x, y), len = Math.hypot(bx, by) || 1; return [bx / len, by / len]; };
  const pts = [start];
  let { x, y } = start;
  for (let i = 0; i < maxSteps; i++) {
    const [k1x, k1y] = dir(x, y), [k2x, k2y] = dir(x + (step / 2) * k1x, y + (step / 2) * k1y), [k3x, k3y] = dir(x + (step / 2) * k2x, y + (step / 2) * k2y), [k4x, k4y] = dir(x + step * k3x, y + step * k3y);
    x += (step / 6) * (k1x + 2 * k2x + 2 * k3x + k4x); y += (step / 6) * (k1y + 2 * k2y + 2 * k3y + k4y);
    pts.push({ x, y });
    if (stop({ x, y })) break;
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) break;
  }
  return pts;
}
/** The whole line through a point: traced backward and forward from it. */
export function flTraceThrough(field, through, opts) {
  const back = flTrace((x, y) => { const [bx, by] = field(x, y); return [-bx, -by]; }, through, opts), ahead = flTrace(field, through, opts);
  return [...back.reverse(), ...ahead.slice(1)];
}
/** Where a line's arrowhead goes: partway along it by length, and which way it points there (degrees, y down). */
export function flArrowAlong(pts, fraction = 0.5) {
  if (pts.length < 3) return null;
  const lengths = [0];
  for (let i = 1; i < pts.length; i++) lengths.push(lengths[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const target = lengths[lengths.length - 1] * fraction, i = Math.max(1, lengths.findIndex(l => l >= target)), a = pts[i - 1], b = pts[i];
  return { x: b.x, y: b.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
}
const flLength = pts => pts.reduce((s, p, i) => (i ? s + Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y) : 0), 0);
function flArrowAt(pts, distance) {
  let walked = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    walked += Math.hypot(b.x - a.x, b.y - a.y);
    if (walked >= distance) return { x: b.x, y: b.y, angle: (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI };
  }
  return flArrowAlong(pts);
}
const flInFigure = (p, m = 15) => p.x > m && p.x < FL_W - m && p.y > m && p.y < FL_H - m;

const FL_CACHE = new Map();
/** Lines of point charges: n for a charge of size 1, more for a bigger one; offset turns the starts by part of a step. */
export function flChargeLines(charges, n, offset) {
  const key = JSON.stringify([charges, n, offset]);
  if (FL_CACHE.has(key)) return FL_CACHE.get(key);
  const field = flChargeField(charges), backward = (x, y) => { const [ex, ey] = field(x, y); return [-ex, -ey]; };
  const bounds = { left: -FL_W, right: 2 * FL_W, top: -FL_H, bottom: 2 * FL_H };
  const onCharge = p => charges.find(c => Math.hypot(p.x - c.x, p.y - c.y) < FL_CHARGE_R);
  const lines = [];
  for (const c of charges) {
    const m = Math.max(1, Math.round(n * Math.abs(c.q)));
    for (let k = 0; k < m; k++) {
      const a = (2 * Math.PI * (k + offset)) / m, start = { x: c.x + (FL_CHARGE_R + 1) * Math.cos(a), y: c.y + (FL_CHARGE_R + 1) * Math.sin(a) };
      const pts = flTrace(c.q > 0 ? field : backward, start, { stop: p => !!onCharge(p), bounds, step: 2 });
      const end = onCharge(pts[pts.length - 1]);
      if (c.q < 0) { if (end && end.q > 0) continue; pts.reverse(); }
      const arrow = end ? (() => { const mid = flArrowAlong(pts); return flInFigure(mid) ? mid : flArrowAt(pts, FL_ARROW_OUT); })() : flArrowAt(pts, c.q > 0 ? FL_ARROW_OUT : flLength(pts) - FL_ARROW_OUT);
      lines.push({ points: pts, arrows: arrow ? [arrow] : [] });
    }
  }
  FL_CACHE.set(key, lines);
  return lines;
}
/** Two plates, + on top and − below, with a sign every 40 or so along each. */
export function flPlates() {
  const left = FL_CX - 190, right = FL_CX + 190, count = 9;
  return { left, right, top: FL_CY - 100, bottom: FL_CY + 100, signs: Array.from({ length: count }, (_, i) => left + ((i + 0.5) / count) * (right - left)) };
}
/** Straight lines from the + plate down to the − plate, evenly spaced and clear of the ends. */
export function flPlateLines(p, n) {
  const inset = 25, top = p.top + 5, bottom = p.bottom - 5;
  return Array.from({ length: n }, (_, i) => { const x = p.left + inset + (i / (n - 1)) * (p.right - p.left - 2 * inset); return { points: [{ x, y: top }, { x, y: bottom }], arrows: [{ x, y: (top + bottom) / 2 + 6, angle: 90 }] }; });
}
/** Circles round the wire, further apart further out: counterclockwise with the current out of the page, clockwise into it. */
export function flWireLines(n, current) {
  const ccw = current === 'out';
  return Array.from({ length: n }, (_, k) => {
    const r = 42 * 1.45 ** k;
    const points = Array.from({ length: 289 }, (_, i) => { const a = (2 * Math.PI * i) / 288; return { x: FL_CX + r * Math.cos(a), y: FL_CY + r * Math.sin(a) }; });
    return { points, arrows: [{ x: FL_CX, y: FL_CY - r, angle: ccw ? 180 : 0 }, { x: FL_CX, y: FL_CY + r, angle: ccw ? 0 : 180 }] };
  });
}
/** The bar magnet (north on the right) and its field. */
export const flMagnet = () => ({ x: FL_CX - 110, y: FL_CY - 25, length: 220, height: 50 });
export function flMagnetField(m = flMagnet()) {
  return flFaceField([{ x: m.x + m.length, y0: m.y, y1: m.y + m.height, q: 1 }, { x: m.x, y0: m.y, y1: m.y + m.height, q: -1 }]);
}
const FL_MCACHE = new Map();
/** The magnet's loops, evenly nested up to `reach` above it, the lower half the upper reflected, and its two axis lines. */
export function flMagnetLines(count, reach = 160) {
  const m = flMagnet(), key = `${count},${reach}`;
  if (!FL_MCACHE.has(key)) {
    const L = m.length, H = m.height;
    const field = flFaceField([{ x: L, y0: -H / 2, y1: H / 2, q: 1 }, { x: 0, y0: -H / 2, y1: H / 2, q: -1 }]);
    const inside = p => p.x > -0.5 && p.x < L + 0.5 && p.y > -H / 2 - 0.5 && p.y < H / 2 + 0.5;
    const bounds = { left: -L * 4, right: L * 5, top: -reach * 3, bottom: reach * 3 };
    const top = Array.from({ length: count }, (_, k) => flTraceThrough(field, { x: L / 2, y: -H / 2 - (reach * (k + 1)) / count }, { stop: inside, bounds }));
    FL_MCACHE.set(key, [...top, ...top.map(l => l.map(p => ({ x: p.x, y: -p.y })))]);
  }
  const cy = m.y + m.height / 2, nx = m.x + m.length, sx = m.x;
  const loops = FL_MCACHE.get(key).map(l => { const points = l.map(p => ({ x: m.x + p.x, y: cy + p.y })); return { points, arrows: [flArrowAlong(points)].filter(Boolean) }; });
  return [...loops,
    { points: [{ x: nx, y: cy }, { x: nx + 700, y: cy }], arrows: [{ x: nx + 48, y: cy, angle: 0 }] },
    { points: [{ x: sx - 700, y: cy }, { x: sx, y: cy }], arrows: [{ x: sx - 36, y: cy, angle: 0 }] }];
}
/** The charges a setup places ({ x, y, q }), or the teacher's own (given in figure units from the middle, y up). */
export function flChargesOf(setup, sign, own) {
  if (own) return own.map(c => ({ x: FL_CX + c.x, y: FL_CY - c.y, q: c.q }));
  if (setup === 'charge') return [{ x: FL_CX, y: FL_CY, q: sign }];
  if (setup === 'opposite') return [{ x: FL_CX - FL_PAIR, y: FL_CY, q: 1 }, { x: FL_CX + FL_PAIR, y: FL_CY, q: -1 }];
  if (setup === 'like') return [{ x: FL_CX - FL_PAIR, y: FL_CY, q: sign }, { x: FL_CX + FL_PAIR, y: FL_CY, q: sign }];
  return [];
}
/** Everything a setup draws: { lines, charges, plates, magnet, wire }. */
export function flBuild(setup, n, sign, current, own) {
  const fig = { lines: [], charges: [], plates: null, magnet: null, wire: null };
  if (setup === 'plates') { fig.plates = flPlates(); fig.lines = flPlateLines(fig.plates, n); return fig; }
  if (setup === 'magnet') { fig.magnet = flMagnet(); fig.lines = flMagnetLines(n); return fig; }
  if (setup === 'wire') { fig.wire = { x: FL_CX, y: FL_CY, current }; fig.lines = flWireLines(n, current); return fig; }
  fig.charges = flChargesOf(setup, sign, own);
  // Like charges only: half a step off the axis, so no line runs into the still point between them.
  const like = fig.charges.length > 1 && fig.charges.every(c => Math.sign(c.q) === Math.sign(fig.charges[0].q));
  fig.lines = flChargeLines(fig.charges, n, like ? 0.5 : 0);
  return fig;
}
