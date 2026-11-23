// Oomba Figures: a roller coaster's track, a smooth curve through the teacher's points from left to right that never
// overshoots them (a monotone cubic: level at both ends and at every hilltop and valley floor, and between a higher and
// a lower neighbor the weighted harmonic mean of the slopes either side), each gap one exact cubic Bézier. A loop
// stands on level track at one point. A rough stretch's length mark can span a run of rough stretches. Pure numbers in,
// pure numbers out: figures/src/coaster.js places the points, checks the data, works out the speeds and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a rough stretch is a number in Oomba's `rough` list (the point it starts
// at, from 1) instead of a switch on the point; the figure's layout (the object's tilt and size, the label placer,
// mirroring) is left out (figures/src/coaster.js lays it out).

/** The slope at each of a row of points (down the page per unit across) for a curve that never overshoots. */
export function rcSlopes(xs, ys) {
  const h = xs.slice(1).map((x, k) => x - xs[k]), d = h.map((hk, k) => (ys[k + 1] - ys[k]) / hk);
  return xs.map((_, k) => {
    if (k === 0 || k === xs.length - 1) return 0;
    const d0 = d[k - 1], d1 = d[k];
    if (d0 * d1 <= 0) return 0;
    const h0 = h[k - 1], h1 = h[k];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  });
}
/** The curve at x: how far down the page it is, and its slope. Past either end it is level. */
export function rcCurveAt(knots, x) {
  if (x <= knots[0].x) return { y: knots[0].y, slope: 0 };
  const last = knots[knots.length - 1];
  if (x >= last.x) return { y: last.y, slope: 0 };
  const k = Math.max(0, knots.findIndex(q => q.x > x) - 1), a = knots[k], b = knots[k + 1], h = b.x - a.x, s = (x - a.x) / h, s2 = s * s, s3 = s2 * s;
  return {
    y: (2 * s3 - 3 * s2 + 1) * a.y + (s3 - 2 * s2 + s) * h * a.m + (-2 * s3 + 3 * s2) * b.y + (s3 - s2) * h * b.m,
    slope: ((6 * s2 - 6 * s) * a.y + (-6 * s2 + 6 * s) * b.y) / h + (3 * s2 - 4 * s + 1) * a.m + (3 * s2 - 2 * s) * b.m,
  };
}
/** Each gap as one exact cubic Bézier: its control points a third of the gap along, on each end's slope. */
export function rcPath(knots) {
  const r = n => Math.round(n * 100) / 100;
  return knots.map((b, k) => {
    if (k === 0) return `M${r(b.x)},${r(b.y)}`;
    const a = knots[k - 1], third = (b.x - a.x) / 3;
    return `C${r(a.x + third)},${r(a.y + a.m * third)} ${r(b.x - third)},${r(b.y - b.m * third)} ${r(b.x)},${r(b.y)}`;
  }).join(' ');
}
/** The rough stretches' length marks as the points (from 0) each runs between: a stretch with a mark starts one, and a
 *  rough stretch right after it with no mark of its own joins it. `rough` lists where stretches start (from 1). */
export function rcLengthRuns(n, rough, marked) {
  const runs = [];
  for (let i = 0; i < n - 1; i++) {
    if (!rough.includes(i + 1)) continue;
    const before = runs[runs.length - 1];
    if (marked(i + 1) || !before || before.to !== i) runs.push({ from: i, to: i + 1 });
    else before.to = i + 1;
  }
  return runs;
}
