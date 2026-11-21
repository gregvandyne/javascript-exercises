// Oomba Figures: how fast an enzyme works and how fast a plant photosynthesizes, the textbook shapes rather than fits
// to measured data. An enzyme's rate as a share of its fastest (0 to 1): against temperature it doubles every `width`
// degrees as it warms (Q10 = 2 for a width of 10 degrees C) while more and more of it denatures, a logistic curve 1/6
// of the width wide centered so the two balance at the optimum, the curve lowered by 5% so it meets the axis at a slant
// where the enzyme has denatured; against pH a bell (1 - d^2)^2 that reaches 0 `width` pH units either side of the
// optimum; against substrate concentration Michaelis-Menten, v = Vmax S / (Km + S), a competitive inhibitor raising Km
// and a non-competitive one lowering Vmax, each by its strength 1 + [I]/Ki. The enzymes are the ones biology courses
// give optima for (human enzymes at 37 degrees C; pepsin about pH 2, salivary amylase about pH 7, trypsin about pH 8;
// Taq polymerase 75 to 80 degrees C, Chien, Edgar and Trela, J. Bacteriol. 127, 1976; catalase near pH 7), the widths
// drawn to look like the textbook curves. Photosynthesis, in arbitrary units: the light-limited rate aI, a straight line
// from the origin; the capacity Amax f(T) C / (Kc + C), with f(T) the enzyme temperature curve for rubisco working best
// at 30 degrees C; the rate the smaller root of the non-rectangular hyperbola theta P^2 - (J + A)P + JA = 0 (theta
// close to 1: the straight rise and sharp bend, smooth); respiration doubling every 10 degrees C, so the net rate P - R
// is below 0 in the dark and 0 at the compensation point. Light falls off as 1/d^2 from a lamp. Pure numbers in, pure
// numbers out: figures/src/rates.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the enzymes keep their numbers but not their English names; the closed
// chamber's CO2 and O2 over time, the settings, the setups and the axis titles are left out (Oomba checks the data and
// draws its own axes).

const EN_DENATURED = 0.05, EN_STEEP = 6, EN_SHIFT = Math.log(Math.LN2 / EN_STEEP / (1 - Math.LN2 / EN_STEEP));
const enWarmth = x => (2 ** x * (1 + Math.exp(EN_SHIFT))) / (1 + Math.exp(EN_STEEP * x + EN_SHIFT));
/** The rate at temperature t, for an enzyme working best at opt whose rate halves width degrees below it. */
export function enRateAtTemperature(t, opt, width) {
  const r = enWarmth((t - opt) / width);
  return Math.max(0, (r - EN_DENATURED) / (1 - EN_DENATURED));
}
/** Where, warming past its optimum, the enzyme has denatured and the rate is 0. */
export function enDenaturedAbove(opt, width) {
  let lo = 0, hi = 5;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (enWarmth(mid) > EN_DENATURED) lo = mid; else hi = mid; }
  return opt + hi * width;
}
/** The rate at pH p, for an enzyme working best at opt that stops width pH units either side. */
export function enRateAtPH(p, opt, width) { const d = (p - opt) / width; return Math.abs(d) >= 1 ? 0 : (1 - d * d) ** 2; }
export const EN_INHIBITORS = ['none', 'competitive', 'noncompetitive'];
/** Vmax and Km with an inhibitor of this strength (1 + [I]/Ki), from the enzyme's own. */
export function enKinetics(inhibitor, km, strength, vmax = 1) {
  if (inhibitor === 'competitive') return { vmax, km: km * strength };
  if (inhibitor === 'noncompetitive') return { vmax: vmax / strength, km };
  return { vmax, km };
}
/** Michaelis-Menten: the rate at substrate concentration s. */
export const enRateAtSubstrate = (s, k) => (k.vmax * s) / (k.km + s);
/** The enzymes, by id: the optimum temperature (degrees C) and its width, the optimum pH and its width. */
export const EN_ENZYMES = {
  human: { temperature: [37, 10], ph: [7, 3] }, taq: { temperature: [75, 12], ph: [8.3, 2.5] }, pepsin: { temperature: [37, 10], ph: [2, 2.5] },
  amylase: { temperature: [37, 10], ph: [7, 3] }, trypsin: { temperature: [37, 10], ph: [8, 3] }, catalase: { temperature: [37, 10], ph: [7, 3.5] },
};

// ---------------------------------------------------------------- photosynthesis
export const PS_ALPHA = 0.25, PS_AMAX = 25, PS_KC = 0.1, PS_THETA = 0.995, PS_T_OPT = 30, PS_T_WIDTH = 10, PS_R25 = 1.5, PS_LAMP = 100 * 10 ** 2, PS_SATURATED = 0.95;
/** The temperature factor, 0 to 1: 1 at rubisco's optimum, 0 once it has denatured. */
export const psWarmth = t => enRateAtTemperature(t, PS_T_OPT, PS_T_WIDTH);
export const PS_DENATURED_AT = enDenaturedAbove(PS_T_OPT, PS_T_WIDTH);
/** The fastest the plant can fix CO2 at concentration c (%) and temperature t. */
export const psCapacity = (c, t) => (PS_AMAX * psWarmth(t) * Math.max(0, c)) / (PS_KC + Math.max(0, c));
/** The smaller root of theta P^2 - (J + A)P + JA = 0: the two limits joined smoothly. */
export function psColimit(j, a) {
  if (j <= 0 || a <= 0) return 0;
  if (!Number.isFinite(j)) return a;
  const b = j + a;
  return (b - Math.sqrt(Math.max(0, b * b - 4 * PS_THETA * j * a))) / (2 * PS_THETA);
}
/** The gross rate at light i, CO2 c (%) and temperature t. */
export const psGross = (i, c, t) => psColimit(PS_ALPHA * Math.max(0, i), psCapacity(c, t));
/** Respiration at temperature t: 1.5 at 25 degrees C, doubling every 10 degrees. */
export const psRespiration = t => PS_R25 * 2 ** ((t - 25) / 10);
export const psNet = (i, c, t) => psGross(i, c, t) - psRespiration(t);
/** The light intensity d cm from the lamp, and how far from it the light is this intense. */
export const psIntensityAt = d => (d <= 0 ? Infinity : PS_LAMP / (d * d));
export const psDistanceFor = i => Math.sqrt(PS_LAMP / i);
/** The plateau as light rises without end (set by CO2 and temperature), and as CO2 does (set by light and temperature). */
export const psLightPlateau = (c, t) => psCapacity(c, t);
export const psCo2Plateau = (i, t) => psColimit(PS_ALPHA * i, PS_AMAX * psWarmth(t));
const psLightFor = (p, a) => (p * a * (a - PS_THETA * p * a)) / (a - p * a);
/** The light intensity at which the rate has levelled off: 95% of its plateau. */
export function psLightSaturation(c, t) { const a = psCapacity(c, t); return a > 0 ? psLightFor(PS_SATURATED, a) / PS_ALPHA : 0; }
function psSolveUp(f, target, lo, hi) {
  if (f(hi) < target) return Infinity;
  if (f(lo) >= target) return lo;
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (f(mid) < target) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
/** The CO2 concentration (%) at which the rate has levelled off (95% of its plateau), or Infinity. */
export const psCo2Saturation = (i, t) => psSolveUp(c => psGross(i, c, t), PS_SATURATED * psCo2Plateau(i, t), 0, 100);
/** The light intensity at which photosynthesis just keeps up with respiration (the net rate is 0). */
export function psLightCompensation(c, t) { const a = psCapacity(c, t), r = psRespiration(t); return a > r ? psLightFor(r / a, a) / PS_ALPHA : Infinity; }
/** The temperature (degrees C, to a hundredth) at which a rate is fastest. */
export function psFastestAt(rate, from = 0, to = 60) {
  let best = from;
  for (let t = from; t <= to + 1e-9; t += 0.01) if (rate(t) > rate(best) + 1e-12) best = t;
  return Math.round(best * 100) / 100;
}
