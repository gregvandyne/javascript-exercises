// Oomba Figures: the firm and the production possibilities behind the cost curves and the production possibilities
// graphs (1.4.0, the economics pack). A firm's costs from one cubic total cost, TC(q) = F + aq - bq^2 + cq^3, so MC,
// AVC, ATC and AFC all come from the same four numbers and every textbook relationship holds exactly: MC crosses AVC
// and ATC at their lowest points, and ATC - AVC = AFC shrinks as output grows. The costs are set by what a teacher sees
// (where ATC bottoms out, how steeply MC rises there, how much of the cost is fixed), solved here for a, b, c and F.
// Then what a firm does: a price taker producing where P = MC (or shutting down below the lowest AVC), a firm facing a
// straight demand curve producing where MR = MC, the socially optimal (P = MC) and fair-return (P = ATC) points, and
// the long-run demand curve tangent to ATC. Production possibilities: a curve between where it meets the axes, bowed
// out (a superellipse), straight, or bowed in (a quadratic Bezier pulled toward the origin), a point a share of the
// way along it, and how far out a curve is along the way to a point. Pure numbers in, pure numbers out:
// figures/src/firm.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the settings, the setups, the label and arrow placement, the market
// panel's layout and the address format are left out (Oomba checks the data and draws its own figure).

// ---------------------------------------------------------------- the firm's costs
const FM_MC_FLOOR = 0.6;
export const fmTC = (k, q) => k.F + k.a * q - k.b * q * q + k.c * q * q * q;
export const fmMC = (k, q) => k.a - 2 * k.b * q + 3 * k.c * q * q;
export const fmAVC = (k, q) => k.a - k.b * q + k.c * q * q;
export const fmAFC = (k, q) => k.F / q;
export const fmATC = (k, q) => fmAVC(k, q) + fmAFC(k, q);
/** Where MC is lowest, and how low; where AVC is lowest (the shutdown point). */
export const fmMinMC = k => ({ q: k.b / (3 * k.c), v: k.a - (k.b * k.b) / (3 * k.c) });
export const fmMinAVC = k => ({ q: k.b / (2 * k.c), v: k.a - (k.b * k.b) / (4 * k.c) });
/** Where ATC is lowest (the break-even point): where 2cq^3 - bq^2 - F = 0, which is where MC = ATC. */
export function fmMinATC(k) {
  const f = q => 2 * k.c * q ** 3 - k.b * q * q - k.F;
  let lo = Math.max(k.b / (2 * k.c), 1e-6), hi = lo + 1;
  while (f(hi) < 0) hi *= 2;
  for (let n = 0; n < 100; n++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; }
  const q = (lo + hi) / 2;
  return { q, v: fmATC(k, q) };
}
/**
 * The costs a teacher's controls make ({ q, cost: where ATC is lowest; slope: MC's slope there; fixed: 0.1 to 1 of
 * the most fixed cost AVC can carry and keep its dip }), and the slope used (lowered when MC would dip below 0.6).
 */
export function fmCostsOf(want) {
  const q = want.q, u = q / (3 - (5 * want.fixed) / 3), most = (2 * (want.cost - FM_MC_FLOOR)) / u;
  let slope = want.slope, lowered = false;
  if (slope > most + 1e-9) { slope = Math.max(0.05, most); lowered = true; }
  const c = slope / (6 * u), qm = q - u, b = 3 * c * qm, F = (5 / 18) * want.fixed * slope * q * q, a = want.cost + 3 * c * q * (2 * qm - q);
  return { costs: { a, b, c, F }, slope, lowered };
}
/** The quantity where MC reaches level on its rising side, or null. */
export function fmOnRisingMC(k, level) {
  const disc = k.b * k.b - 3 * k.c * (k.a - level);
  if (disc < 0) return null;
  const q = (k.b + Math.sqrt(disc)) / (3 * k.c);
  return q > 0 ? q : null;
}
/** A straight demand curve P = top - slope q, and its marginal revenue top - 2 slope q. */
export const fmPriceOn = (d, q) => d.top - d.slope * q;
export const fmMROn = (d, q) => d.top - 2 * d.slope * q;
/** A price taker at price p: where P = MC on MC's rising side, or shut down (q = 0, losing F) below the lowest AVC. */
export function fmPriceTaker(k, p) {
  const lowest = fmMinAVC(k);
  if (p < lowest.v - 1e-9) return { q: 0, p, atc: NaN, profit: -k.F, shutdown: true };
  const q = Math.max(fmOnRisingMC(k, p) ?? lowest.q, lowest.q);
  return { q, p, atc: fmATC(k, q), profit: (p - fmATC(k, q)) * q, shutdown: false };
}
/** Where MR = MC for a firm facing demand d, on MC's rising side, or null. */
export function fmMREqualsMC(k, d) {
  const B = 2 * (d.slope - k.b), disc = B * B - 12 * k.c * (k.a - d.top);
  if (disc < 0) return null;
  const q = (-B + Math.sqrt(disc)) / (6 * k.c);
  return q > 0 ? q : null;
}
/** A firm with market power: Q where MR = MC, P read off demand; it shuts down if that price is below AVC there. */
export function fmPriceMaker(k, d) {
  const q = fmMREqualsMC(k, d);
  if (q === null) return null;
  const p = fmPriceOn(d, q);
  return { q, p, atc: fmATC(k, q), profit: (p - fmATC(k, q)) * q, shutdown: p < fmAVC(k, q) - 1e-9 };
}
/** Where demand meets MC (the socially optimal point), or null. */
export function fmDemandMeetsMC(k, d) {
  const B = d.slope - 2 * k.b, disc = B * B - 12 * k.c * (k.a - d.top);
  if (disc < 0) return null;
  const q = (-B + Math.sqrt(disc)) / (6 * k.c);
  return q > 0 ? q : null;
}
/** Where demand meets ATC (the fair-return point): of two crossings, the one at the larger quantity; null if none. */
export function fmDemandMeetsATC(k, d, far = 60) {
  const gap = q => fmPriceOn(d, q) - fmATC(k, q), n = 3000;
  let found = null, q0 = 1e-3, g0 = gap(q0);
  for (let i = 1; i <= n; i++) {
    const q1 = 1e-3 + (far * i) / n, g1 = gap(q1);
    if (g0 >= 0 !== g1 >= 0) {
      let lo = q0, hi = q1;
      for (let m = 0; m < 60; m++) { const mid = (lo + hi) / 2; if (gap(mid) >= 0 === g0 >= 0) lo = mid; else hi = mid; }
      found = (lo + hi) / 2;
    }
    q0 = q1; g0 = g1;
  }
  return found;
}
/** The straight demand curve tangent to ATC at q (zero profit at the firm's best). */
export function fmTangentAt(k, q) { const slope = -(-k.b + 2 * k.c * q - k.F / (q * q)); return { top: fmATC(k, q) + slope * q, slope }; }
/** The long-run demand curve of a monopolistically competitive firm: tangent to ATC left of its lowest point, meeting the price axis near top. */
export function fmLongRunDemand(k, top, most = 0.85) {
  const bottom = fmMinATC(k).q;
  let lo = bottom * 0.05, hi = bottom * most;
  if (fmTangentAt(k, hi).top >= top) return { q: hi, d: fmTangentAt(k, hi) };
  for (let n = 0; n < 80; n++) { const m = (lo + hi) / 2; if (fmTangentAt(k, m).top > top) lo = m; else hi = m; }
  const q = (lo + hi) / 2;
  return { q, d: fmTangentAt(k, q) };
}
/** The perfectly competitive firm's named prices, given its costs (profit: halfway from the lowest ATC to MC near the top). */
export function fmPricesOf(k, top = 9.3) {
  const lowATC = fmMinATC(k), lowAVC = fmMinAVC(k), right = Math.min(9, fmOnRisingMC(k, top) ?? 9);
  return { profit: lowATC.v + 0.5 * (fmMC(k, right) - lowATC.v), breakeven: lowATC.v, loss: (lowAVC.v + lowATC.v) / 2, shutdownPoint: lowAVC.v, shutdown: Math.max(lowAVC.v * 0.45, lowAVC.v - 1) };
}
/** A short-run monopolistic competitor's demand sits this far above or below the long run's; the long run's meets the price axis this far up. */
export const FM_SHORT_RUN_GAP = 1.1;
export const FM_LONG_RUN_TOP = 0.62;

// ---------------------------------------------------------------- production possibilities
const ppClamp = v => Math.max(0, Math.min(1, v));
/** Bowed out (n above 1) or straight (1): a quarter of a superellipse, u^n + v^n = 1, in shares of where it meets the axes. */
function ppSuperellipse(n) {
  const height = u => Math.pow(Math.max(0, 1 - Math.pow(ppClamp(u), n)), 1 / n);
  return { height, round: f => ({ x: Math.pow(Math.sin((Math.PI / 2) * f), 2 / n), y: Math.pow(Math.cos((Math.PI / 2) * f), 2 / n) }) };
}
/** Bowed in: a quadratic Bezier from the y-axis to the x-axis pulled in toward the origin by its middle point (c, c). */
function ppPulledIn(c) {
  const a = 1 - 2 * c, at = t => ({ x: 2 * c * t * (1 - t) + t * t, y: (1 - t) * (1 - t) + 2 * c * t * (1 - t) }), tOf = u => (-c + Math.sqrt(c * c + a * ppClamp(u))) / a;
  return { height: u => at(tOf(u)).y, round: f => at(ppClamp(f)) };
}
/** How the curve bows: out (a superellipse whose power is bow), in (pulled in, a little at the least bow), or straight. */
export const ppBendOf = (shape, bow) => (shape === 'out' ? ppSuperellipse(bow) : shape === 'in' ? ppPulledIn(0.5 - 0.3 * (1 - 1 / Math.max(1, bow))) : ppSuperellipse(1));
/** The curve meeting the axes at X and Y, as points from the y-axis round to the x-axis. */
export function ppCurve(X, Y, bend, n = 160) { const out = []; for (let k = 0; k <= n; k++) { const p = bend.round(k / n); out.push({ x: p.x * X, y: p.y * Y }); } return out; }
/** The point on a curve meeting the axes at X and Y with t of X made of the x-axis good. */
export const ppOnCurve = (X, Y, bend, t) => ({ x: ppClamp(t) * X, y: Y * bend.height(ppClamp(t)) });
const ppBeyond = (p, X, Y, bend) => p.x > X * (1 + 1e-9) || p.y > Y * bend.height(p.x / X) * (1 + 1e-9) + 1e-12;
/** How many times p out from the origin a curve meeting the axes at X and Y is, along the way to p. */
export function ppReach(p, X, Y, bend) {
  if (!(p.x > 0 || p.y > 0)) return 1;
  let hi = 1;
  while (!ppBeyond({ x: p.x * hi, y: p.y * hi }, X, Y, bend) && hi < 1e6) hi *= 2;
  let lo = 0;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (ppBeyond({ x: p.x * mid, y: p.y * mid }, X, Y, bend)) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}
/** Where a schematic curve meets each axis on the hidden grid, the outer curve when one shifts out, and how far in or out a point inside or outside is. */
export const PP_BASE = 8;
export const PP_OUTER = 9.2;
export const PP_INSIDE = 0.6;
export const PP_OUTSIDE = 1.2;
