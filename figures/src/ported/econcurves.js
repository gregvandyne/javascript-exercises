// Oomba Figures: the curve math behind every economics graph (1.4.0, the economics pack). A curve is a list of points
// in the graph's own units (a polyline, sampled finely enough to draw): straight supply and demand lines run on to the
// edges of a box, upright and flat ones, curves of a function, a quarter superellipse (a production possibilities
// curve) and shifted copies of any of them. Where two curves cross, where one is at a price or a quantity, the area
// and the center of a polygon, and the region between a curve and a price (consumer and producer surplus) or between
// two curves (a deadweight loss) are all read off the points, so a figure's equilibria and shaded areas are worked
// out from its curves, never placed by eye. A curve cut to a box (Liang-Barsky) and a smooth curve through typed
// points that never overshoots them (a monotone cubic, as PCHIP draws) are here too, and how far a small, medium or
// large shift moves a curve. Pure numbers in, pure numbers out: figures/src/econ.js and the economics kinds draw.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, points as { x, y }
// as before but names changed so they share one scope with the rest of the bundle; the shift arrows' placement, the
// fitted ranges and the panel layout are left out (Oomba places its own arrows and labels, on its own axes).

/** How far a shift moves a curve, as a share of the axis it moves along. */
export const EC_SHIFT_SHARE = { small: 0.12, medium: 0.2, large: 0.28 };
export const EC_SIZES = ['small', 'medium', 'large'];
const EC_SAMPLES = 160;

/** A line through a and b, run on to the edges of box ({ x0, x1, y0, y1 }); upright when a and b share an x. */
export function ecLineThrough(a, b, box) {
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1e-12) return [{ x: a.x, y: box.y0 }, { x: a.x, y: box.y1 }];
  const m = dy / dx, at = x => ({ x, y: a.y + m * (x - a.x) });
  return [at(box.x0), at(box.x1)];
}
/** y = f(x) from x0 to x1, leaving out where it is not a number. */
export function ecGraphOf(f, x0, x1, n = EC_SAMPLES) {
  const out = [];
  for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = f(x); if (Number.isFinite(y)) out.push({ x, y }); }
  return out;
}
/**
 * A quarter of a superellipse from (0, Y) round to (X, 0): (x/X)^n + (y/Y)^n = 1, bowed out from the origin when n is
 * above 1, straight at 1. Points spaced by angle, so the curve is as smooth at its ends as in its middle.
 */
export function ecBowed(X, Y, n, samples = EC_SAMPLES) {
  const out = [];
  for (let k = 0; k <= samples; k++) { const t = ((Math.PI / 2) * k) / samples; out.push({ x: X * Math.pow(Math.sin(t), 2 / n), y: Y * Math.pow(Math.cos(t), 2 / n) }); }
  return out;
}
/** A curve moved dx right and dy up. */
export const ecShifted = (c, dx, dy) => c.map(p => ({ x: p.x + dx, y: p.y + dy }));

/** Where two segments cross, as how far along the first (0 to 1), or null. */
function ecCrossing(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y }, den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den, u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? t : null;
}
/** Every point where two curves cross, in order along the first. */
export function ecCrossings(a, b) {
  const out = [];
  for (let i = 1; i < a.length; i++) for (let j = 1; j < b.length; j++) {
    const t = ecCrossing(a[i - 1], a[i], b[j - 1], b[j]);
    if (t === null) continue;
    const p = { x: a[i - 1].x + (a[i].x - a[i - 1].x) * t, y: a[i - 1].y + (a[i].y - a[i - 1].y) * t }, last = out[out.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 1e-7) out.push(p);
  }
  return out;
}
/** Where two curves first cross, or null if they do not. */
export const ecIntersect = (a, b) => ecCrossings(a, b)[0] || null;
/** The curve's height where it first reaches x, or null if it never does. */
export function ecYAt(c, x) {
  for (let i = 1; i < c.length; i++) {
    const a = c[i - 1], b = c[i];
    if ((a.x - x) * (b.x - x) <= 0 && a.x !== b.x) return a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x);
    if (a.x === x) return a.y;
  }
  return c.length && c[c.length - 1].x === x ? c[c.length - 1].y : null;
}
/** How far across the curve is where it first reaches height y, or null if it never does. */
export const ecXAt = (c, y) => ecYAt(c.map(p => ({ x: p.y, y: p.x })), y);
/** How long a curve is. */
export const ecLength = c => c.reduce((sum, p, k) => (k ? sum + Math.hypot(p.x - c[k - 1].x, p.y - c[k - 1].y) : 0), 0);
/** The point t of the way along a curve by its length (0 its start, 1 its end), and the way it is heading there. */
export function ecAlong(c, t) {
  let left = Math.max(0, Math.min(1, t)) * ecLength(c);
  for (let k = 1; k < c.length; k++) {
    const a = c[k - 1], b = c[k], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= len || k === c.length - 1) {
      const f = len ? Math.min(1, left / len) : 0;
      return { at: { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f }, dir: len ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 } };
    }
    left -= len;
  }
  return { at: c[0], dir: { x: 1, y: 0 } };
}
/** A polygon's area (positive whichever way round it goes). */
export function ecArea(poly) {
  let a = 0;
  for (let k = 0; k < poly.length; k++) { const p = poly[k], q = poly[(k + 1) % poly.length]; a += p.x * q.y - q.x * p.y; }
  return Math.abs(a) / 2;
}
/** A polygon's center of area (its first point, if it has none). */
export function ecCentroid(poly) {
  let a = 0, cx = 0, cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k], q = poly[(k + 1) % poly.length], cross = p.x * q.y - q.x * p.y;
    a += cross; cx += (p.x + q.x) * cross; cy += (p.y + q.y) * cross;
  }
  if (Math.abs(a) < 1e-12) return poly[0] || { x: 0, y: 0 };
  return { x: cx / (3 * a), y: cy / (3 * a) };
}
/** The region between a curve and a level line from x0 to x1 (under demand and over a price: consumer surplus). */
export function ecBetween(c, level, x0, x1, n = 48) {
  const pts = [{ x: x0, y: level }];
  for (let k = 0; k <= n; k++) { const x = x0 + ((x1 - x0) * k) / n, y = ecYAt(c, x); if (y !== null) pts.push({ x, y }); }
  pts.push({ x: x1, y: level });
  return pts;
}
/** The region between two curves from x0 to x1, each read at every x. */
export function ecBetweenCurves(a, b, x0, x1, n = 48) {
  const top = [], bottom = [];
  for (let k = 0; k <= n; k++) {
    const x = x0 + ((x1 - x0) * k) / n, ya = ecYAt(a, x), yb = ecYAt(b, x);
    if (ya !== null) top.push({ x, y: ya });
    if (yb !== null) bottom.push({ x, y: yb });
  }
  return [...top, ...bottom.reverse()];
}
/** A curve cut to a box: its runs inside it (Liang-Barsky on each segment). */
export function ecClip(pts, box) {
  const runs = [];
  let run = [];
  const end = () => { if (run.length > 1) runs.push(run); run = []; };
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dy = b.y - a.y;
    let t0 = 0, t1 = 1, inside = true;
    for (const [p, q] of [[-dx, a.x - box.x0], [dx, box.x1 - a.x], [-dy, a.y - box.y0], [dy, box.y1 - a.y]]) {
      if (p === 0) { if (q < 0) inside = false; } else { const t = q / p; if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t); }
    }
    if (!inside || t0 > t1) { end(); continue; }
    const at = t => ({ x: a.x + dx * t, y: a.y + dy * t });
    if (t0 > 0) end();
    if (!run.length) run.push(at(t0));
    run.push(at(t1));
    if (t1 < 1) end();
  }
  end();
  return runs;
}
/** The longest run of a curve inside a box ([] when none is). */
export const ecDrawn = (c, box) => ecClip(c, box).sort((a, b) => b.length - a.length)[0] || [];
/**
 * A smooth curve through pts, with the other coordinate worked out from by ('y' when each point is read across from a
 * price, as a schedule's rows are). It never overshoots: between two points it stays between their values (a monotone
 * cubic). Points sharing a value of by are taken once.
 */
export function ecSmoothThrough(pts, by = 'x', perGap = 24) {
  const other = by === 'x' ? 'y' : 'x';
  const sorted = [...pts].sort((a, b) => a[by] - b[by]).filter((p, k, all) => k === 0 || p[by] !== all[k - 1][by]);
  const n = sorted.length;
  if (n < 3) return sorted;
  const t = sorted.map(p => p[by]), v = sorted.map(p => p[other]), h = t.slice(1).map((x, k) => x - t[k]), d = h.map((hk, k) => (v[k + 1] - v[k]) / hk);
  const m = t.map((_, k) => {
    if (k === 0 || k === n - 1) return 0;
    const d0 = d[k - 1], d1 = d[k];
    if (d0 * d1 <= 0) return 0;
    const h0 = h[k - 1], h1 = h[k];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  });
  const end = (h0, h1, d0, d1) => {
    const s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) return 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) return 3 * d0;
    return s;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  const out = [];
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < perGap; j++) {
    const s = j / perGap, s2 = s * s, s3 = s2 * s;
    const value = (2 * s3 - 3 * s2 + 1) * v[k] + (s3 - 2 * s2 + s) * h[k] * m[k] + (-2 * s3 + 3 * s2) * v[k + 1] + (s3 - s2) * h[k] * m[k + 1], at = t[k] + s * h[k];
    out.push(by === 'x' ? { x: at, y: value } : { x: value, y: at });
  }
  out.push(sorted[n - 1]);
  return out;
}
