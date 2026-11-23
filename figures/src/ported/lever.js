// Oomba Figures: the lever's sums and how long its arms and arrows are drawn. The load's weight is the load itself in N
// or lb, and mass × 9.8 N/kg for a load in kg or g. An ideal lever balances, so the effort is the weight × the load
// arm ÷ the effort arm (in lb for a load in lb, in N otherwise), and the mechanical advantage is the effort arm ÷ the
// load arm. The beam is drawn to scale from the two arms, except that no arm is shorter than 15% of the beam (so its
// words fit); the bigger force's arrow is the longest and the other in proportion, never too short to see. Pure numbers
// in, pure numbers out: figures/src/lever.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the class is a number (1, 2 or 3); arms that do not suit the class are
// refused by Oomba's check instead of swapped; the number writing, the answer lines, the label placement and the
// settings are left out (Oomba writes its own worked answers).

/** What 1 kg weighs, in N. */
export const LV_G = 9.8;
export const LV_BEAM = 480, LV_OVERHANG = 30, LV_SPAN = LV_BEAM - 2 * LV_OVERHANG, LV_MIN_ARM = 0.15 * LV_BEAM, LV_LONGEST = 110, LV_SHORTEST = 45;
const lvClamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** Do these arms suit the class? Class 2 has the longer effort arm, class 3 the longer load arm. */
export const lvArmsSuit = (cls, effortArm, loadArm) => cls === 1 || (cls === 2 ? effortArm >= loadArm : effortArm <= loadArm);
/** The lever's sums: is the load a mass, its kg, its weight, the force unit, the mechanical advantage and the effort. */
export function lvSums(effortArm, loadArm, load, loadUnit) {
  const mass = loadUnit === 'kg' || loadUnit === 'g', kg = loadUnit === 'g' ? load / 1000 : load, weight = mass ? kg * LV_G : load;
  return { mass, kg, weight, forceUnit: loadUnit === 'lb' ? 'lb' : 'N', advantage: effortArm / loadArm, effort: (weight * loadArm) / effortArm };
}
/** How long each arm is drawn (px), and whether both are to scale. The longer arm of a class 2 or 3 lever reaches the far end. */
export function lvDrawnArms(cls, effortArm, loadArm) {
  if (cls === 1) {
    const raw = (LV_SPAN * loadArm) / (loadArm + effortArm), load = lvClamp(raw, LV_MIN_ARM, LV_SPAN - LV_MIN_ARM);
    return { effort: LV_SPAN - load, load, toScale: Math.abs(load - raw) < 0.01 };
  }
  const raw = (LV_SPAN * Math.min(effortArm, loadArm)) / Math.max(effortArm, loadArm), short = lvClamp(raw, LV_MIN_ARM, LV_SPAN - LV_MIN_ARM), toScale = Math.abs(short - raw) < 0.01;
  return cls === 2 ? { effort: LV_SPAN, load: short, toScale } : { effort: short, load: LV_SPAN, toScale };
}
/** How long two forces' arrows are: the bigger one the longest, the other in proportion but no shorter than the shortest. */
export function lvArrowLengths(effort, load) {
  const big = Math.max(effort, load), len = f => Math.round(lvClamp((LV_LONGEST * f) / big, LV_SHORTEST, LV_LONGEST) * 100) / 100;
  return { effort: len(effort), load: len(load) };
}
