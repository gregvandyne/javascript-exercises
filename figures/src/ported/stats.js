// Oomba Figures: the statistics behind the data displays. The median and the five-number summary (quartiles as the
// medians of the lower and upper halves, the median left out of both when the count is odd, as a TI-84 and most US
// textbooks work them out), outliers past 1.5 IQR, a tidy axis to fit some numbers, the normal distribution (its
// height, the area left of a value and its inverse, accurate well past the 4 places a figure writes), the least-squares
// line and Pearson's r, and a smooth curve through points that never overshoots (a monotone
// cubic, for a cumulative frequency curve). Pure numbers in, pure numbers out.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the readers of typed and pasted text (data lists, bins typed as
// "10-20" or "10 <= x < 20", upper bounds typed as "under 20") and the binning of a data set are left out: Oomba takes
// structured data, and stCount (sorting values into given bins) is Oomba's own; points are [x, y] pairs; the words
// describing a correlation are left out (the figures write no such words).

/** The median of numbers sorted smallest first. */
export function stMedian(sorted) {
  const n = sorted.length, mid = Math.floor(n / 2);
  return n % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
/** The five-number summary { min, q1, median, q3, max }: one value is its own quartiles. */
export function stSummary(values) {
  const s = [...values].sort((a, b) => a - b), n = s.length, half = Math.floor(n / 2);
  const lower = n > 1 ? s.slice(0, half) : s, upper = n > 1 ? s.slice(n - half) : s;
  return { min: s[0], q1: stMedian(lower), median: stMedian(s), q3: stMedian(upper), max: s[n - 1] };
}
/** Where the whiskers end when outliers are drawn apart (the last values within 1.5 IQR of the box), and the outliers. */
export function stOutliers(values, sum) {
  const reach = 1.5 * (sum.q3 - sum.q1), inside = v => v >= sum.q1 - reach - 1e-9 && v <= sum.q3 + reach + 1e-9;
  const kept = values.filter(inside);
  return { lo: Math.min(...kept), hi: Math.max(...kept), outliers: values.filter(v => !inside(v)).sort((a, b) => a - b) };
}
const stClean = v => Number(v.toPrecision(12)) || 0;
/** A tidy axis around lo..hi: counting by 1, 2 or 5 times a power of ten, at most 12 steps, starting and ending on a
 *  step (data from 11 to 42 gets 10 to 45 by 5). */
export function stNiceRange(lo, hi) {
  if (!(hi > lo)) { const c = Number.isFinite(lo) ? lo : 0; return stNiceRange(c - 5, c + 5); }
  const MAX = 12, rough = (hi - lo) / MAX, power = 10 ** Math.floor(Math.log10(rough));
  for (const k of [1, 2, 5, 10, 20]) {
    const step = k * power, from = Math.floor(lo / step + 1e-9) * step, to = Math.ceil(hi / step - 1e-9) * step;
    if ((to - from) / step <= MAX + 1e-9) return { from: stClean(from), to: stClean(to), step: stClean(step) };
  }
  return { from: lo, to: hi, step: (hi - lo) / MAX };
}
/** (Oomba's own, not ported.) Values sorted into bins (lo, hi): a value on an edge goes in the bin whose `holds` end it is ("left": 10 <= x < 20,
 *  "right": 10 < x <= 20). -> the count in each bin, and the values that fall in none. */
export function stCount(values, bins, holds = 'left') {
  const counts = bins.map(() => 0), outside = [];
  for (const v of values) {
    const k = bins.findIndex(([lo, hi], i) => (holds === 'left'
      ? v >= lo - 1e-9 && (v < hi - 1e-9 || (i === bins.length - 1 && Math.abs(v - hi) < 1e-9))
      : (v > lo + 1e-9 || (i === 0 && Math.abs(v - lo) < 1e-9)) && v <= hi + 1e-9));
    if (k < 0) outside.push(v); else counts[k]++;
  }
  return { counts, outside };
}

const ST_SQRT_2PI = Math.sqrt(2 * Math.PI);
/** The standard normal curve's height at z. */
export const stPhi = z => Math.exp(-(z * z) / 2) / ST_SQRT_2PI;
/** The area under the standard normal curve left of z: Hart's double precision approximation as given by West (2005),
 *  "Better approximations to cumulative normal functions", good to about 1e-15. */
export function stCdf(z) {
  if (Number.isNaN(z)) return NaN;
  if (z === Infinity) return 1;
  if (z === -Infinity) return 0;
  const x = Math.abs(z);
  let tail;
  if (x > 37) tail = 0;
  else {
    const e = Math.exp(-(x * x) / 2);
    if (x < 7.07106781186547) {
      let n = 3.52624965998911e-2 * x + 0.700383064443688;
      n = n * x + 6.37396220353165; n = n * x + 33.912866078383; n = n * x + 112.079291497871; n = n * x + 221.213596169931; n = n * x + 220.206867912376;
      let d = 8.83883476483184e-2 * x + 1.75566716318264;
      d = d * x + 16.064177579207; d = d * x + 86.7807322029461; d = d * x + 296.564248779674; d = d * x + 637.333633378831; d = d * x + 793.826512519948; d = d * x + 440.413735824752;
      tail = (e * n) / d;
    } else {
      let d = x + 0.65;
      d = x + 4 / d; d = x + 3 / d; d = x + 2 / d; d = x + 1 / d;
      tail = e / d / ST_SQRT_2PI;
    }
  }
  return z > 0 ? 1 - tail : tail;
}
// Acklam's rational approximation to the inverse, refined by one step of Halley's method.
const ST_A = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
const ST_B = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
const ST_C = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
const ST_D = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
/** The z with area p to its left, for 0 < p < 1 (±Infinity at 0 and 1). */
export function stInvCdf(p) {
  if (!(p >= 0 && p <= 1)) return NaN;
  if (p === 0) return -Infinity;
  if (p === 1) return Infinity;
  let z;
  if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); z = (((((ST_C[0] * q + ST_C[1]) * q + ST_C[2]) * q + ST_C[3]) * q + ST_C[4]) * q + ST_C[5]) / ((((ST_D[0] * q + ST_D[1]) * q + ST_D[2]) * q + ST_D[3]) * q + 1); }
  else if (p <= 1 - 0.02425) { const q = p - 0.5, r = q * q; z = ((((((ST_A[0] * r + ST_A[1]) * r + ST_A[2]) * r + ST_A[3]) * r + ST_A[4]) * r + ST_A[5]) * q) / (((((ST_B[0] * r + ST_B[1]) * r + ST_B[2]) * r + ST_B[3]) * r + ST_B[4]) * r + 1); }
  else { const q = Math.sqrt(-2 * Math.log(1 - p)); z = -(((((ST_C[0] * q + ST_C[1]) * q + ST_C[2]) * q + ST_C[3]) * q + ST_C[4]) * q + ST_C[5]) / ((((ST_D[0] * q + ST_D[1]) * q + ST_D[2]) * q + ST_D[3]) * q + 1); }
  const e = stCdf(z) - p, u = e * ST_SQRT_2PI * Math.exp((z * z) / 2);
  return z - u / (1 + (z * u) / 2);
}

/** The least-squares line { slope, intercept }, or null when the x values do not vary. */
export function stFit(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((t, p) => t + p[0], 0) / n, my = points.reduce((t, p) => t + p[1], 0) / n;
  let sxx = 0, sxy = 0;
  for (const [x, y] of points) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); }
  if (sxx < 1e-12 * Math.max(1, mx * mx)) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx };
}
/** Pearson's correlation coefficient r, or null when either variable does not vary. */
export function stCorrelation(points) {
  const n = points.length;
  if (n < 2) return null;
  const mx = points.reduce((t, p) => t + p[0], 0) / n, my = points.reduce((t, p) => t + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of points) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  if (sxx < 1e-12 * Math.max(1, mx * mx) || syy < 1e-12 * Math.max(1, my * my)) return null;
  return Math.max(-1, Math.min(1, sxy / Math.sqrt(sxx * syy)));
}

/** A smooth curve through points [x, y] in order of x, as points close enough to draw as a line (perGap to each gap).
 *  Between two points it stays between their values, so a curve that only rises keeps rising. Two points: a line. */
export function stSmooth(pts, perGap = 24) {
  const s = [...pts].sort((a, b) => a[0] - b[0]).filter((p, k, all) => k === 0 || p[0] !== all[k - 1][0]), n = s.length;
  if (n < 3) return s;
  const t = s.map(p => p[0]), v = s.map(p => p[1]), h = t.slice(1).map((x, k) => x - t[k]), d = h.map((hk, k) => (v[k + 1] - v[k]) / hk);
  const m = t.map((_, k) => {
    if (k === 0 || k === n - 1) return 0;
    const d0 = d[k - 1], d1 = d[k];
    if (d0 * d1 <= 0) return 0;
    const h0 = h[k - 1], h1 = h[k];
    return (3 * (h0 + h1)) / ((2 * h1 + h0) / d0 + (h1 + 2 * h0) / d1);
  });
  const end = (h0, h1, d0, d1) => {
    const e = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(e) !== Math.sign(d0)) return 0;
    if (Math.sign(d0) !== Math.sign(d1) && Math.abs(e) > Math.abs(3 * d0)) return 3 * d0;
    return e;
  };
  m[0] = end(h[0], h[1], d[0], d[1]);
  m[n - 1] = end(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  const out = [];
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < perGap; j++) {
    const q = j / perGap, q2 = q * q, q3 = q2 * q;
    out.push([t[k] + q * h[k], (2 * q3 - 3 * q2 + 1) * v[k] + (q3 - 2 * q2 + q) * h[k] * m[k] + (-2 * q3 + 3 * q2) * v[k + 1] + (q3 - q2) * h[k] * m[k + 1]]);
  }
  out.push(s[n - 1]);
  return out;
}
