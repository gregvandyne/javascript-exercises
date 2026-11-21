// Oomba Figures: the Lotka-Volterra predator-prey model, worked out numerically. Prey dx/dt = ax - bxy (prey grow,
// and are eaten); predators dy/dt = dxy - gy (predators grow on prey, and die). Both populations cycle around a balance
// point (x = g/d, y = a/b), the predators' peaks following the prey's. It is stepped with RK4 on the logarithms of the
// populations, so they never go below zero, at a step small enough that every cycle closes on the one before: the
// quantity V = dx - g ln x + by - a ln y stays the same all the way round, as in the exact solution. A cycle's lowest
// and highest values come from V exactly. The rates are found from what a teacher knows: the populations' averages
// (the balance point), where they start and how long a cycle takes (a and g kept equal, so both swing about as far,
// each against its own balance). The pairs are classroom pairs with believable numbers (the snowshoe hare and Canada
// lynx: OpenStax Biology 2e, 45.6). Pure numbers in, pure numbers out: figures/src/ecology.js checks and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the pairs keep their numbers but not their names (Oomba names the curves
// in the reader's language, or as the data says); the census, the settings and the label placing are left out.

/** The balance point: where neither population changes, and each one's average over a cycle. */
export const lvBalance = r => ({ prey: r.gamma / r.delta, predators: r.alpha / r.beta });
/** The quantity that stays the same around a cycle. */
export const lvConserved = (r, p) => r.delta * p.prey - r.gamma * Math.log(p.prey) + r.beta * p.predators - r.alpha * Math.log(p.predators);
/** How long a cycle takes when the populations stay close to the balance point. */
export const lvSmallPeriod = r => (2 * Math.PI) / Math.sqrt(r.alpha * r.gamma);
/** The two values where a v - b ln v (lowest at v = b/a) equals level: one population's low and high. */
function lvRoots(a, b, level) {
  const mid = b / a, f = v => a * v - b * Math.log(v) - level;
  if (f(mid) >= 0) return [mid, mid];
  const solve = (lo, hi) => { for (let k = 0; k < 200; k++) { const m = Math.sqrt(lo * hi); if (f(m) > 0 === f(lo) > 0) lo = m; else hi = m; } return Math.sqrt(lo * hi); };
  let lo = mid; while (f(lo) < 0 && lo > 1e-300) lo /= 10;
  let hi = mid; while (f(hi) < 0) hi *= 10;
  return [solve(lo, mid), solve(mid, hi)];
}
/** The lowest and highest each population reaches around the cycle through start, exactly. */
export function lvExtremes(r, start) {
  const v = lvConserved(r, start), b = lvBalance(r);
  const prey = lvRoots(r.delta, r.gamma, v - (r.beta * b.predators - r.alpha * Math.log(b.predators)));
  const predators = lvRoots(r.beta, r.alpha, v - (r.delta * b.prey - r.gamma * Math.log(b.prey)));
  return { prey: { low: prey[0], high: prey[1] }, predators: { low: predators[0], high: predators[1] } };
}
function lvStep(r, start) {
  const e = lvExtremes(r, start);
  return 0.01 / Math.max(r.alpha, r.beta * e.predators.high, r.gamma, r.delta * e.prey.high);
}
function lvRk4(r, u, v, dt) {
  const du = v => r.alpha - r.beta * Math.exp(v), dv = u => r.delta * Math.exp(u) - r.gamma;
  const k1u = du(v), k1v = dv(u), k2u = du(v + (dt / 2) * k1v), k2v = dv(u + (dt / 2) * k1u);
  const k3u = du(v + (dt / 2) * k2v), k3v = dv(u + (dt / 2) * k2u), k4u = du(v + dt * k3v), k4v = dv(u + dt * k3u);
  return [u + (dt / 6) * (k1u + 2 * k2u + 2 * k3u + k4u), v + (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v)];
}
const LV_MAX_STEPS = 200000;
/** The populations from time 0 to end: { t, prey, predators } at every step. */
export function lvSimulate(r, start, end) {
  const n = Math.min(LV_MAX_STEPS, Math.max(200, Math.ceil(end / lvStep(r, start)))), dt = end / n;
  const run = { t: [0], prey: [start.prey], predators: [start.predators] };
  let u = Math.log(start.prey), v = Math.log(start.predators);
  for (let k = 1; k <= n; k++) { [u, v] = lvRk4(r, u, v, dt); run.t.push(k * dt); run.prey.push(Math.exp(u)); run.predators.push(Math.exp(v)); }
  return run;
}
/** Is the start (all but) the balance point, where nothing cycles? */
export function lvAtBalance(r, start) {
  const b = lvBalance(r);
  return Math.abs(start.prey / b.prey - 1) < 1e-6 && Math.abs(start.predators / b.predators - 1) < 1e-6;
}
function lvCrossings(t, values, level, rising) {
  const out = [];
  for (let k = 1; k < values.length; k++) {
    const a = values[k - 1] - level, b = values[k] - level;
    if (rising ? a < 0 && b >= 0 : a > 0 && b <= 0) out.push(t[k - 1] + (t[k] - t[k - 1]) * (a / (a - b)));
  }
  return out;
}
/** A run's value at time at, between the steps either side. */
export function lvValueAt(t, values, at) {
  if (at <= t[0]) return values[0];
  if (at >= t[t.length - 1]) return values[values.length - 1];
  const dt = t[1] - t[0], k = Math.min(t.length - 2, Math.floor((at - t[0]) / dt)), f = (at - t[k]) / (t[k + 1] - t[k]);
  return values[k] + (values[k + 1] - values[k]) * f;
}
/** Each population's peaks and lows over a run: the prey turn where the predators pass their balance, the predators
 *  where the prey pass theirs. */
export function lvTurns(r, run) {
  const b = lvBalance(r), at = (times, values) => times.map(t => ({ t, value: lvValueAt(run.t, values, t) }));
  return {
    preyPeaks: at(lvCrossings(run.t, run.predators, b.predators, true), run.prey), preyLows: at(lvCrossings(run.t, run.predators, b.predators, false), run.prey),
    predatorPeaks: at(lvCrossings(run.t, run.prey, b.prey, false), run.predators), predatorLows: at(lvCrossings(run.t, run.prey, b.prey, true), run.predators),
  };
}
/** How long one full cycle through start takes, worked out by running it round. */
export function lvPeriod(r, start) {
  if (lvAtBalance(r, start)) return lvSmallPeriod(r);
  let end = lvSmallPeriod(r) * 2.5;
  for (let tries = 0; tries < 8; tries++, end *= 2) { const peaks = lvTurns(r, lvSimulate(r, start, end)).preyPeaks; if (peaks.length >= 2) return peaks[1].t - peaks[0].t; }
  return lvSmallPeriod(r);
}
/** How long after a prey peak the predators peak, on the cycle through start. */
export function lvLag(r, start, period = lvPeriod(r, start)) {
  if (lvAtBalance(r, start)) return period / 4;
  const turns = lvTurns(r, lvSimulate(r, start, period * 2.2)), prey = turns.preyPeaks[0], pred = prey && turns.predatorPeaks.find(p => p.t > prey.t);
  return prey && pred ? pred.t - prey.t : period / 4;
}
/** The rates for a cycle around balance, through start, taking period to come round (a = g; every rate sped up by the
 *  same factor shortens the cycle by it and keeps its shape). */
export function lvRatesFor(balance, start, period) {
  const base = { alpha: 1, beta: 1 / balance.predators, gamma: 1, delta: 1 / balance.prey }, k = lvPeriod(base, start) / period;
  return { alpha: k, beta: k / balance.predators, gamma: k, delta: k / balance.prey };
}
/** Classroom pairs: the averages, the start, the cycle and the span, in units of time. */
export const LV_PAIRS = {
  'hare-lynx': { preyAverage: 50, predatorAverage: 20, preyStart: 20, predatorStart: 12, period: 10, span: 40, unit: 'years', scale: 'shared' },
  'rabbit-wolf': { preyAverage: 600, predatorAverage: 30, preyStart: 300, predatorStart: 20, period: 8, span: 32, unit: 'years', scale: 'two' },
  'rabbit-fox': { preyAverage: 400, predatorAverage: 40, preyStart: 200, predatorStart: 30, period: 5, span: 20, unit: 'years', scale: 'two' },
  'moose-wolf': { preyAverage: 1000, predatorAverage: 25, preyStart: 600, predatorStart: 20, period: 30, span: 90, unit: 'years', scale: 'two' },
  'mouse-owl': { preyAverage: 500, predatorAverage: 20, preyStart: 250, predatorStart: 14, period: 4, span: 16, unit: 'years', scale: 'two' },
  'aphid-ladybug': { preyAverage: 2000, predatorAverage: 100, preyStart: 1000, predatorStart: 70, period: 30, span: 120, unit: 'days', scale: 'two' },
};
