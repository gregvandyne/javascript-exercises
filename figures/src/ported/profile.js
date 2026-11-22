// Oomba Figures: the chemistry behind a potential energy diagram (a reaction energy profile): the potential energy of
// the reacting particles against the reaction coordinate, from a list of levels in order: the reactants, a transition
// state, then for each further step an intermediate and its transition state, and the products (3, 5 or 7 levels).
//   ΔH = E(products) − E(reactants): negative for an exothermic reaction.
//   Ea (forward) = E(transition state) − E(the level before it); Ea (reverse) = E(transition state) − E(the level after it).
// A catalyst gives the reaction one lower transition state: the reactants and products stay, so ΔH does not change.
// The rate-determining step is named only when the two ways of finding it agree (the highest Ea, and the transition
// state highest above the lowest point before it). The curve between neighboring levels is a smoothstep, flat at both
// ends, so each peak is exactly its transition state's energy and each dip exactly its intermediate's, and nothing
// overshoots; the reaction coordinate has no numbers, and each step takes the same width. Pure numbers in, pure numbers
// out: figures/src/energy.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the settings, the setups, the label placer and the arrow layout are left
// out (Oomba checks the levels, works the answers out and draws its own arrows).

export const PE_MAX_STEPS = 3;
/** Whether a list of levels makes a reaction: 3, 5 or 7 of them. */
export const peIsCount = n => n >= 3 && n <= 2 * PE_MAX_STEPS + 1 && n % 2 === 1;
/** What the level at i of count is: 'reactants', 'ts', 'intermediate' or 'products'. */
export const peKindOf = (i, count) => (i === 0 ? 'reactants' : i === count - 1 ? 'products' : i % 2 === 1 ? 'ts' : 'intermediate');
/** Each step: { index (its transition state's), before, ts, after, ea, eaReverse }. */
export function peSteps(levels) {
  const out = [];
  for (let i = 1; i < levels.length - 1; i += 2) { const [before, ts, after] = [levels[i - 1], levels[i], levels[i + 1]]; out.push({ index: i, before, ts, after, ea: ts - before, eaReverse: ts - after }); }
  return out;
}
export const peDeltaH = levels => levels[levels.length - 1] - levels[0];
/** The rate-determining step (0 for the first), or null when it is not clear cut (or there is one step). */
export function peRateStep(levels) {
  const steps = peSteps(levels);
  if (steps.length < 2) return null;
  const best = values => { const top = Math.max(...values), at = values.flatMap((v, k) => (Math.abs(v - top) < 1e-9 ? [k] : [])); return at.length === 1 ? at[0] : null; };
  const byEa = best(steps.map(st => st.ea)), bySpan = best(steps.map(st => st.ts - Math.min(...levels.slice(0, st.index).filter((_, k) => k % 2 === 0))));
  return byEa !== null && byEa === bySpan ? byEa : null;
}
/** A catalyzed path: the same reactants and products, over one lower transition state. */
export const peCatalyzed = (levels, ts) => [levels[0], ts, levels[levels.length - 1]];
const PE_START = 3, PE_END = 4, PE_HALVES = [4, 3, 2.5];
/** How a reaction of this many steps is laid along the reaction coordinate, in blocks: { start, end, half, width }. */
export function pePlacement(steps, endRun = PE_END) {
  const n = Math.min(PE_MAX_STEPS, Math.max(1, Math.round(steps))), half = PE_HALVES[n - 1], end = PE_START + 2 * n * half;
  return { start: PE_START, end, half, width: Math.ceil(end + Math.max(PE_END, endRun) - 1e-9) };
}
/** Where along the reaction coordinate each level is: a plateau's middle, a peak or a dip. */
export function peLevelXs(levels, p) {
  const half = (p.end - p.start) / (levels.length - 1);
  return levels.map((_, i) => (i === 0 ? p.start / 2 : i === levels.length - 1 ? (p.end + p.width) / 2 : p.start + i * half));
}
export const peSmooth = u => { const t = Math.min(1, Math.max(0, u)); return t * t * (3 - 2 * t); };
const PE_SAMPLES = 60;
/** The curve through the levels as points [{ x (blocks), y (energy) }]: flat to start, a smoothstep between each pair
 *  of neighboring levels (the run from start to end shared out equally), then flat to width. */
export function pePoints(levels, p) {
  if (levels.length < 2) return [];
  const half = (p.end - p.start) / (levels.length - 1), pts = [{ x: 0, y: levels[0] }];
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i - 1], b = levels[i], x0 = p.start + (i - 1) * half;
    for (let k = 0; k <= PE_SAMPLES; k++) { if (k === 0 && i > 1) continue; const u = k / PE_SAMPLES; pts.push({ x: x0 + u * half, y: a + (b - a) * peSmooth(u) }); }
  }
  pts.push({ x: p.width, y: levels[levels.length - 1] });
  return pts;
}
