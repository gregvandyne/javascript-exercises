// Oomba Figures: the science of a one-substance phase diagram. The substances (their triple and critical points, and
// what happens at 1 atm, read from the NIST Chemistry WebBook's fluid tables, which work them out from each one's
// reference equation of state; water's melting point is IAPWS R14-08(2011)), the units, and the three boundaries as
// curves through a diagram's places: the vaporization curve from the triple point to the critical point, bending upward
// as vapor pressure does, (e^(k s) - 1) / (e^k - 1); the sublimation curve from the graph's corner to the triple point,
// arriving steeper than the vaporization curve leaves (subliming takes more heat than boiling); and the fusion line,
// straight up from the triple point, leaning left only where the solid is less dense than the liquid (water). Also: how
// sharply a curve must bend to pass through a typed boiling point, where a line of one pressure meets the boundaries,
// and which phase is at a place. The places are in whatever the diagram is drawn in: a typed substance's own units on
// a grid, or the blocks of a figure not to scale (PD_SCHEMATIC). Pure numbers in, pure numbers out:
// figures/src/phase.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the substances are keyed by id without their English names or the
// sources' names (kept here in the comment above); the diagram's shape is made from the values directly rather than
// from page settings; the label placement, the letters' shuffle, the settings, the answer key's and the screen reader's
// words are left out (Oomba places its own labels and writes its own words).

export const PD_ATM = 101325;      // Pa, exact
export const PD_ZERO_C = 273.15;   // K, exact
/** Triple and critical points in K and Pa; nbp, nmp (normal boiling and melting points) or sublimes (the solid's
 *  sublimation temperature at 1 atm) in K; fusion: which way the fusion line leans. */
export const PD_SUBSTANCES = {
  water: { fusion: 'left', triple: { T: 273.16, P: 611.657 }, critical: { T: 647.096, P: 22.064e6 }, nmp: 273.1525, nbp: 373.1243 },
  co2: { fusion: 'right', triple: { T: 216.592, P: 517964 }, critical: { T: 304.1282, P: 7.3773e6 }, sublimes: 194.686 },
  nitrogen: { fusion: 'right', triple: { T: 63.151, P: 12519.8 }, critical: { T: 126.192, P: 3.3958e6 }, nbp: 77.355 },
  oxygen: { fusion: 'right', triple: { T: 54.361, P: 146.278 }, critical: { T: 154.581, P: 5.043e6 }, nbp: 90.1878 },
  argon: { fusion: 'right', triple: { T: 83.8058, P: 68890.9 }, critical: { T: 150.687, P: 4.863e6 }, nbp: 87.302 },
  methane: { fusion: 'right', triple: { T: 90.6941, P: 11696.1 }, critical: { T: 190.564, P: 4.5992e6 }, nbp: 111.667 },
  ammonia: { fusion: 'right', triple: { T: 195.49, P: 6053.39 }, critical: { T: 405.56, P: 11.3634e6 }, nbp: 239.832 },
};
export const pdFromKelvin = (k, unit) => (unit === 'K' ? k : k - PD_ZERO_C);
export const pdFromPascal = (pa, unit) => (unit === 'atm' ? pa / PD_ATM : pa / 1000);
export const pdAtmIn = unit => pdFromPascal(PD_ATM, unit);
/** A diagram not to scale, in blocks: where its points sit and how its lines run. */
export const PD_SCHEMATIC = { width: 12, height: 10, wide: { width: 14, height: 11 }, triple: { x: 4.5, y: 2.5 }, critical: { x: 10, y: 8 }, atm: 4.5, lean: 1.2, bend: 2 };
/** The sharpest bend a vaporization curve is given; past it the curve is an elbow. */
export const PD_MAX_K = 8;

/** How far up a curve is (0 to 1) when it is s of the way along its temperatures. */
export const pdRise = (s, k) => (Math.abs(k) < 1e-9 ? s : Math.expm1(k * s) / Math.expm1(k));
/** How far along a curve is when it is f of the way up: pdRise backwards. */
export const pdRun = (f, k) => (Math.abs(k) < 1e-9 ? f : Math.log1p(f * Math.expm1(k)) / k);
const pdSlopeStart = k => (Math.abs(k) < 1e-9 ? 1 : k / Math.expm1(k));
const pdSlopeEnd = k => (Math.abs(k) < 1e-9 ? 1 : (k * Math.exp(k)) / Math.expm1(k));
const pdCurveAt = (a, b, k, s) => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * pdRise(s, k) });
const pdSample = (a, b, k, n) => Array.from({ length: n + 1 }, (_, i) => pdCurveAt(a, b, k, i / n));
/** The boundaries of a shape { triple, critical, corner, top, fusionTopX, kVap, kSub }, as points. */
export const pdVaporization = (d, n = 60) => pdSample(d.triple, d.critical, d.kVap, n);
export const pdSublimation = (d, n = 40) => pdSample(d.corner, d.triple, d.kSub, n);
export const pdFusion = d => [d.triple, { x: d.fusionTopX, y: d.top }];
export const pdVaporPressure = (d, x) => pdCurveAt(d.triple, d.critical, d.kVap, (x - d.triple.x) / (d.critical.x - d.triple.x)).y;
export const pdSublimationPressure = (d, x) => pdCurveAt(d.corner, d.triple, d.kSub, (x - d.corner.x) / (d.triple.x - d.corner.x)).y;
export const pdMeltingAt = (d, y) => d.triple.x + ((d.fusionTopX - d.triple.x) * (y - d.triple.y)) / (d.top - d.triple.y);
/** How sharply a vaporization curve bends to pass through a boiling point s of the way along and f of the way up; null
 *  when no upward bend does, PD_MAX_K when it would take a sharper one. */
export function pdBendThrough(s, f) {
  if (!(s > 0 && s < 1 && f > 0 && f < 1) || f >= s) return null;
  if (pdRise(s, PD_MAX_K) > f) return PD_MAX_K;
  let lo = 0, hi = PD_MAX_K;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (pdRise(s, mid) > f) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** A sublimation curve's bend: raised until it arrives at the triple point steeper than the vaporization curve leaves. */
export function pdSublimationBend(d, steeper = 1.5) {
  const leaves = ((d.critical.y - d.triple.y) / (d.critical.x - d.triple.x)) * pdSlopeStart(d.kVap), straight = (d.triple.y - d.corner.y) / (d.triple.x - d.corner.x);
  if (!(straight > 0) || !Number.isFinite(leaves)) return 2;
  let k = 1.5;
  while (k < 12 && straight * pdSlopeEnd(k) < leaves * steeper) k += 0.25;
  return k;
}
/** Where a line of one pressure meets the boundaries, left to right. */
export function pdCrossings(d, y) {
  const out = [];
  if (y > d.corner.y && y < d.triple.y) out.push({ boundary: 'sublimation', x: d.corner.x + (d.triple.x - d.corner.x) * pdRun((y - d.corner.y) / (d.triple.y - d.corner.y), d.kSub), y });
  if (y > d.triple.y && y <= d.top) out.push({ boundary: 'fusion', x: pdMeltingAt(d, y), y });
  if (y > d.triple.y && y < d.critical.y) out.push({ boundary: 'vaporization', x: d.triple.x + (d.critical.x - d.triple.x) * pdRun((y - d.triple.y) / (d.critical.y - d.triple.y), d.kVap), y });
  return out.sort((a, b) => a.x - b.x);
}
/** The phase at a place: solid, liquid, gas or supercritical. */
export function pdPhaseAt(d, x, y) {
  if (y >= d.triple.y) {
    if (x < pdMeltingAt(d, y)) return 'solid';
    if (x > d.critical.x) return y > d.critical.y ? 'supercritical' : 'gas';
    if (x <= d.triple.x) return 'liquid';
    return y > pdVaporPressure(d, x) ? 'liquid' : 'gas';
  }
  return x < d.triple.x && y > pdSublimationPressure(d, x) ? 'solid' : 'gas';
}
/** A pressure to 3 significant figures, keeping a final zero: 0.00604, 48.0, 218, 3,400. */
export const pdSig3 = v => { const r = Number(v.toPrecision(3)); return Math.abs(r) >= 1000 ? r.toLocaleString('en-US') : v.toPrecision(3); };
