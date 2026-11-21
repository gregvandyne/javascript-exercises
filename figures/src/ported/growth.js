// Oomba Figures: the ecology behind a population growth graph, in the terms OpenStax Biology 2e uses (45.3,
// Environmental Limits to Population Growth). Exponential growth dN/dt = rN is a J-shaped curve; logistic growth
// dN/dt = rN(K - N)/K is an S-shaped curve that levels at the carrying capacity K. r is the per capita growth rate with
// room to grow, per unit of time; divided by N, the growth rate is r for exponential growth whatever N is, and
// r(K - N)/K for logistic growth, falling in a straight line to 0 at K. Two more curves for populations that do not
// settle smoothly at K: overshoot, logistic growth that feels crowding a lag tau late, dN/dt = rN(1 - N(t - tau)/K),
// which overshoots K and oscillates around it (the swings die away when r tau is below about pi/2); and a crash, a
// population using up food that does not grow back, dN/dt = N(r - dF), dF/dt = N, which booms to a peak (N0 + r^2/2d,
// so d is set by the peak) and then crashes. A census is the curve counted every so often, each count off by a normal
// few percent from a seed (mulberry32, Box-Muller), so the same seed always gives the same counts. Pure numbers in,
// pure numbers out: figures/src/ecology.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the settings, the setups, the fitted axes, the axis titles and the
// address format are left out (Oomba checks the data and draws its own axes and labels).

export const PG_MODELS = ['logistic', 'exponential', 'both', 'overshoot', 'crash'];
/** The curves a model draws: "both" draws the logistic and the exponential curve. */
export const pgCurves = m => (m === 'both' ? ['logistic', 'exponential'] : [m]);
/** Whether the model has a carrying capacity to draw. */
export const pgHasK = m => m === 'logistic' || m === 'both' || m === 'overshoot';
/** Whether a logistic curve is on the graph (its inflection point and phases). */
export const pgHasLogistic = m => m === 'logistic' || m === 'both';

const pgLogisticN = (g, t) => g.k / (1 + ((g.k - g.n0) / g.n0) * Math.exp(-g.r * t));
const PG_STEPS = 4000;
function pgTabulated(ts, ns, pcs) {
  const dt = ts[1] - ts[0];
  const at = (values, t) => {
    const i = Math.min(values.length - 2, Math.max(0, Math.floor(t / dt))), f = Math.min(1, Math.max(0, t / dt - i));
    return values[i] + (values[i + 1] - values[i]) * f;
  };
  return { n: t => at(ns, t), perCapita: t => at(pcs, t), rate: t => at(ns, t) * at(pcs, t) };
}
/** Logistic growth with a lag: before time 0 the population was N0 (Heun's method, the lagged N from steps taken). */
function pgOvershoot(g, tEnd) {
  const { n0, r, k, lag } = g, end = Math.max(tEnd, 1e-6);
  const dt = Math.max(end / (10 * PG_STEPS), Math.min(end / PG_STEPS, lag > 0 ? lag / 40 : Infinity)), steps = Math.ceil(end / dt) + 1, ns = [n0];
  const past = t => { if (t <= 0) return n0; const i = Math.min(ns.length - 2, Math.floor(t / dt)), f = t / dt - i; return ns[i] + (ns[Math.min(i + 1, ns.length - 1)] - ns[i]) * f; };
  const pc = t => r * (1 - past(t - lag) / k);
  for (let i = 1; i < steps; i++) {
    const t = (i - 1) * dt, n = ns[i - 1], a = n * pc(t), guess = n + a * dt;
    ns.push(Math.max(0, n + ((a + guess * (lag > 0 ? pc(t + dt) : r * (1 - guess / k))) * dt) / 2));
  }
  const ts = ns.map((_, i) => i * dt);
  return pgTabulated(ts, ns, ts.map(pc));
}
/** Boom and crash: per capita growth falls as food that does not grow back is used (Runge-Kutta). */
function pgCrash(g, tEnd) {
  const { n0, r, k } = g, delta = (r * r) / (2 * Math.max(k - n0, 1e-9)), dt = Math.max(tEnd, 1e-6) / PG_STEPS;
  const f = (n, used) => [n * (r - delta * used), n];
  const ns = [n0], pcs = [r];
  let n = n0, used = 0;
  for (let i = 1; i <= PG_STEPS; i++) {
    const [a1, b1] = f(n, used), [a2, b2] = f(n + (a1 * dt) / 2, used + (b1 * dt) / 2), [a3, b3] = f(n + (a2 * dt) / 2, used + (b2 * dt) / 2), [a4, b4] = f(n + a3 * dt, used + b3 * dt);
    n = Math.max(0, n + ((a1 + 2 * a2 + 2 * a3 + a4) * dt) / 6);
    used += ((b1 + 2 * b2 + 2 * b3 + b4) * dt) / 6;
    ns.push(n); pcs.push(r - delta * used);
  }
  return pgTabulated(ns.map((_, i) => i * dt), ns, pcs);
}
/** A curve worked out: { n(t), rate(t), perCapita(t) } from t = 0 on. g: { n0, r, k, lag }. */
export function pgSolve(curve, g, tEnd) {
  if (curve === 'exponential') { const n = t => g.n0 * Math.exp(g.r * t); return { n, rate: t => g.r * n(t), perCapita: () => g.r }; }
  if (curve === 'logistic') { const n = t => pgLogisticN(g, t); return { n, rate: t => g.r * n(t) * (1 - n(t) / g.k), perCapita: t => g.r * (1 - n(t) / g.k) }; }
  return curve === 'overshoot' ? pgOvershoot(g, tEnd) : pgCrash(g, tEnd);
}
/** A logistic or exponential curve's growth rate and per capita growth rate at a population size N. */
export const pgRateAtN = (curve, g, n) => (curve === 'exponential' ? g.r * n : g.r * n * (1 - n / g.k));
export const pgPerCapitaAtN = (curve, g, n) => (curve === 'exponential' ? g.r : g.r * (1 - n / g.k));
/** Where a logistic curve bends from speeding up to slowing down: N = K/2, growing fastest (rK/4 a unit of time).
 *  Null when it starts at K/2 or above, so never passes through it. */
export function pgInflection(g) {
  if (!(g.n0 > 0 && g.n0 < g.k / 2)) return null;
  return { t: Math.log((g.k - g.n0) / g.n0) / g.r, n: g.k / 2, rate: (g.r * g.k) / 4 };
}
/** The lag, exponential and stationary phases of a logistic curve: their edges are where the steepest tangent (through
 *  the inflection point) meets N0 and K. Null with no inflection point; lagEnd is null when the curve starts steep. */
export function pgPhases(g) {
  const p = pgInflection(g);
  if (!p) return null;
  const lagEnd = p.t - (g.k / 2 - g.n0) / p.rate, stationary = p.t + g.k / 2 / p.rate;
  return { lagEnd: lagEnd > 0.05 * stationary ? lagEnd : null, stationary };
}
/** A repeatable stream of numbers from 0 to 1 (mulberry32). */
export function pgRandom(seed) {
  let a = Math.floor(seed) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = Math.imul(a ^ (a >>> 15), 1 | a);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
/** Decimals a census is written to: whole individuals unless the numbers are small (like millions of cells). */
export const pgCensusDecimals = largest => (largest < 10 ? 2 : largest < 100 ? 1 : 0);
/** A census: the population counted every `every` units from 0 to tEnd, each count off the curve by a normal amount
 *  (noise: the standard deviation in %), the same for the same seed. The first count is N0. */
export function pgCensus(sol, every, tEnd, noise, seed) {
  const next = pgRandom(seed), count = Math.min(200, Math.floor(tEnd / every + 1e-9));
  const exact = Array.from({ length: count + 1 }, (_, i) => ({ t: Number((i * every).toPrecision(12)), n: sol.n(i * every) }));
  const tenths = 10 ** pgCensusDecimals(Math.max(...exact.map(p => p.n)));
  return exact.map(({ t, n }, i) => {
    const z = Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
    const counted = i === 0 ? n : Math.max(0, n * (1 + (noise / 100) * z));
    return { t, n: Math.round(counted * tenths) / tenths };
  });
}
