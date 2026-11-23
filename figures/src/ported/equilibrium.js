// Oomba Figures: the chemistry of an equilibrium graph. A reversible reaction settles to equilibrium from its starting
// concentrations, then answers each stress. The graph is solved from K, never drawn from typed levels, so its lines
// always move in the ratio of the coefficients and every level stretch gives the K it should. Between stresses one
// number moves, the extent: each concentration is its start plus coefficient times the extent (reactants minus). Where
// it settles is the extent with Q = K, found by bisection; how it gets there is the textbook teaching model, the
// reaction taken as elementary (rate = kf [reactants] - kr [products], kf / kr = K), stepped with RK4, kf set so the
// first approach is within 1% of equilibrium at the time given. A stress adds or removes a species, changes the volume
// (every concentration divided by the factor) or the temperature (K multiplied, the approach faster or slower). The
// reaction setups (their forward reactions' heat from the NIST Chemistry WebBook's enthalpies of formation, or what is
// seen for iron(III) thiocyanate) come with example K values and starting concentrations chosen so the graph reads
// well: they are not measured equilibrium constants. Pure numbers in, pure numbers out: figures/src/chemgraphs.js
// checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the setups keep their formulas as plain typed text (H2, Fe3+) for the
// shared formula writer, and their names in words, the page's automatic stress words and the settings are left out.

/** How close to equilibrium counts as settled: within this share of the stretch's whole change. */
export const EQ_SETTLED = 0.01;
/** Each setup: species [formula, coefficient, side], gas or aqueous, the forward reaction's heat, example K and start. */
export const EQ_REACTIONS = {
  ammonia: { species: [['N2', 1, 'r'], ['H2', 3, 'r'], ['NH3', 2, 'p']], phase: 'gas', heat: 'exothermic', dH: -92, k: 0.5, start: [1, 3, 0] },
  hi: { species: [['H2', 1, 'r'], ['I2', 1, 'r'], ['HI', 2, 'p']], phase: 'gas', heat: 'exothermic', dH: -9.5, k: 10, start: [1, 0.8, 0] },
  n2o4: { species: [['N2O4', 1, 'r'], ['NO2', 2, 'p']], phase: 'gas', heat: 'endothermic', dH: 57, k: 0.2, start: [1, 0] },
  so3: { species: [['SO2', 2, 'r'], ['O2', 1, 'r'], ['SO3', 2, 'p']], phase: 'gas', heat: 'exothermic', dH: -198, k: 10, start: [1, 0.8, 0] },
  pcl5: { species: [['PCl5', 1, 'r'], ['PCl3', 1, 'p'], ['Cl2', 1, 'p']], phase: 'gas', heat: 'endothermic', dH: 88, k: 0.5, start: [1, 0, 0.3] },
  fescn: { species: [['Fe3+', 1, 'r'], ['SCN-', 1, 'r'], ['FeSCN2+', 1, 'p']], phase: 'aqueous', heat: 'exothermic', dH: null, k: 5, start: [1, 0.6, 0] },
  abc: { species: [['A', 1, 'r'], ['B', 1, 'r'], ['C', 1, 'p']], phase: 'gas', heat: 'exothermic', dH: null, k: 5, start: [1, 0.6, 0] },
};
/** A species' coefficient as the extent moves it: reactants minus, products plus. */
export const eqSigned = s => (s[2] === 'r' ? -s[1] : s[1]);
const eqAt = (start, coefs, xi) => start.map((c, i) => Math.max(0, c + coefs[i] * xi));
/** The reaction quotient Q at these concentrations. */
export const eqQuotient = (c, coefs) => c.reduce((q, ci, i) => q * ci ** coefs[i], 1);
function eqLimits(start, coefs) {
  let lo = -Infinity, hi = Infinity;
  coefs.forEach((v, i) => { if (v > 0) lo = Math.max(lo, -start[i] / v); else if (v < 0) hi = Math.min(hi, start[i] / -v); });
  return [Math.min(0, lo), Math.max(0, hi)];
}
/** Where the reaction settles from `start`: the extent at which Q = K (exactly one, by bisection). */
export function eqSettle(start, coefs, k) {
  const [lo, hi] = eqLimits(start, coefs);
  if (!(hi > lo) || !(k > 0)) return { xi: 0, equilibrium: [...start] };
  const lnK = Math.log(k), lnQ = xi => coefs.reduce((sum, v, i) => sum + v * Math.log(Math.max(start[i] + v * xi, 1e-300)), 0);
  let a = lo, b = hi;
  for (let n = 0; n < 200 && b - a > 1e-16 * Math.max(1, Math.abs(a), Math.abs(b)); n++) { const mid = (a + b) / 2; if (lnQ(mid) < lnK) a = mid; else b = mid; }
  const xi = (a + b) / 2;
  return { xi, equilibrium: eqAt(start, coefs, xi) };
}
/** The forward rate less the reverse rate. */
export function eqNetRate(c, coefs, kf, k) {
  let forward = kf, reverse = kf / k;
  coefs.forEach((v, i) => { if (v < 0) forward *= c[i] ** -v; else if (v > 0) reverse *= c[i] ** v; });
  return forward - reverse;
}
function eqApproach(start, coefs, kf, k, target, times, visit) {
  const f = xi => eqNetRate(eqAt(start, coefs, xi), coefs, kf, k), whole = Math.abs(target), close = whole * EQ_SETTLED;
  let xi = 0, t = 0, settledAt = whole === 0 ? 0 : null;
  for (const next of times) {
    let steps = 0;
    while (t < next) {
      const gap = target - xi, rate = f(xi);
      if (Math.abs(gap) <= whole * 1e-13 || rate * gap <= 0 || ++steps > 200000) { xi = target; t = next; break; }
      const h = Math.min(next - t, (0.02 * Math.abs(gap)) / Math.abs(rate)), k1 = rate, k2 = f(xi + (h / 2) * k1), k3 = f(xi + (h / 2) * k2), k4 = f(xi + h * k3);
      let stepped = xi + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
      if ((target - stepped) * gap < 0) stepped = target;
      if (settledAt === null && Math.abs(target - stepped) <= close) { const before = Math.abs(gap), after = Math.abs(target - stepped); settledAt = t + h * (before === after ? 1 : (before - close) / (before - after)); }
      xi = stepped; t += h;
    }
    visit(next, xi);
  }
  return settledAt;
}
/** The forward rate constant that brings the first approach within 1% of equilibrium at `established`. */
export function eqRateConstant(start, coefs, k, established) {
  const { xi } = eqSettle(start, coefs, k), [lo, hi] = eqLimits(start, coefs);
  if (!(hi > lo)) return 1;
  if (Math.abs(xi) > 1e-9 * (hi - lo)) { const took = eqApproach(start, coefs, 1, k, xi, [Number.MAX_VALUE], () => {}); if (took && Number.isFinite(took)) return took / established; }
  const eq = eqAt(start, coefs, xi), d = 1e-6 * (hi - lo), pushed = Math.abs(eqNetRate(eqAt(eq, coefs, d), coefs, 1, k) - eqNetRate(eqAt(eq, coefs, -d), coefs, 1, k)) / (2 * d);
  return pushed > 0 ? Math.log(1 / EQ_SETTLED) / (pushed * established) : 1;
}
function eqStressed(c, s) {
  if (s.kind === 'volume') return { c: c.map(v => v / s.factor), short: 0 };
  if (s.kind === 'temperature') return { c: [...c], short: 0 };
  const out = [...c], change = s.kind === 'add' ? s.amount : -s.amount, short = Math.max(0, -(out[s.species] + change));
  out[s.species] = Math.max(0, out[s.species] + change);
  return { c: out, short };
}
const EQ_SAMPLES = 720;
/**
 * The whole graph: { coefs, start, k, established, stresses: [{ kind: 'add' | 'remove', at, species, amount } |
 * { kind: 'volume', at, factor } | { kind: 'temperature', at, kFactor, speed }] } from time 0 to `until` -> { stretches:
 * [{ from, to, k, start, equilibrium, shift ('forward' | 'reverse' | 'none'), settledAt, end, samples: [{ t, c }], short }],
 * reacts }.
 */
export function eqRun({ coefs, start, k, established, stresses }, until) {
  const [lo0, hi0] = eqLimits(start, coefs), reacts = hi0 > lo0, stretches = [], dt = until / EQ_SAMPLES;
  let kf = eqRateConstant(start, coefs, k, established), kNow = k, c = [...start], short = 0;
  const ordered = stresses.filter(s => s.at > 0 && s.at <= until).sort((a, b) => a.at - b.at);
  for (let n = 0; n <= ordered.length; n++) {
    const from = n ? ordered[n - 1].at : 0, to = n < ordered.length ? ordered[n].at : Math.max(until, from);
    const { xi, equilibrium } = eqSettle(c, coefs, kNow), [a, b] = eqLimits(c, coefs);
    const shift = Math.abs(xi) <= 1e-9 * Math.max(b - a, 1e-300) ? 'none' : xi > 0 ? 'forward' : 'reverse', target = shift === 'none' ? 0 : xi;
    const times = [];
    for (let j = Math.floor(from / dt + 1e-9) + 1; j * dt < to - 1e-9 * dt; j++) times.push(j * dt - from);
    if (to > from) times.push(to - from);
    const origin = c, samples = [{ t: from, c: [...origin] }];
    const settledAt = eqApproach(origin, coefs, kf, kNow, target, times, (t, x) => samples.push({ t: from + t, c: eqAt(origin, coefs, x) }));
    if (n < ordered.length && settledAt !== null && shift !== 'none') samples[samples.length - 1].c = [...equilibrium];
    const end = samples[samples.length - 1].c;
    stretches.push({ from, to, k: kNow, start: [...origin], equilibrium: shift === 'none' ? [...origin] : equilibrium, shift, settledAt: settledAt === null ? null : from + settledAt, end, samples, short });
    if (n < ordered.length) {
      const s = ordered[n], next = eqStressed(end, s);
      c = next.c; short = next.short;
      if (s.kind === 'temperature') { kf *= s.speed * Math.sqrt(s.kFactor); kNow *= s.kFactor; }
    }
  }
  return { stretches, reacts };
}
/** How many times bigger K is after a temperature stress: heating an exothermic reaction makes it smaller. */
export const eqKFactor = (heat, kind, amount) => ((kind === 'raise') === (heat === 'endothermic') ? amount : 1 / amount);
