// Oomba Figures: what the graphs of concentration against time share, and the kinetics of a rate law graph. A tidy
// axis range (8 to 20 blocks, steps from 0.000001 to 1,000,000, free of the noise a multiplication leaves); a species'
// formula with its digits lowered and a final charge raised ("SO42-" is SO4 with 2- raised); the units. One reactant,
// A -> products, with rate = k[A]^n for n = 0, 1 or 2: each order's integrated rate law makes one graph against time a
// straight line ([A] for zero order, ln[A] for first, 1/[A] for second); the half-lives, the unit of k, and the data
// points a student would be given, scattered from a seed (mulberry32: ptRandom) so a link redraws the same figure,
// rounded as a student would (3 significant figures, ln to 3 decimal places), none after a zero-order reaction ends.
// Pure numbers in, pure numbers out: figures/src/chemgraphs.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the tidy range and the formula markup come from the shared helpers of
// the equilibrium and rate law generators (as plain characters with Unicode subscripts and superscripts, not key text);
// the seeded random numbers are the particle diagram's (the same mulberry32); the label placer, the settings and the
// time unit names are left out.
import { ptRandom } from './particles.js';

const klTidy = v => Number(v.toPrecision(12));
/** A tidy axis range covering from..to: [start, end, step], in 8 to 20 blocks. */
export function klNiceRange(from, to, zero = false) {
  const span = Math.max(to - from, 1e-6);
  for (let k = -6; k <= 6; k++) for (const m of [1, 2, 2.5, 5]) {
    const step = klTidy(m * 10 ** k), start = zero ? 0 : Math.floor(from / step + 1e-9) * step, end = Math.ceil(to / step - 1e-9) * step, blocks = Math.round((end - start) / step);
    if (blocks <= 20 && (blocks >= 8 || span / step < 8)) return [klTidy(start), klTidy(end), step];
  }
  return [from, to, span / 10];
}
const KL_SUB = '₀₁₂₃₄₅₆₇₈₉', KL_SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const klLower = f => f.replace(/([A-Za-z)\]])(\d+)/g, (_, a, d) => a + [...d].map(c => KL_SUB[c]).join(''));
/** A species' formula in plain characters: "N2O5" is N₂O₅, "Fe3+" is Fe³⁺, "SO42-" is SO₄²⁻, "NH4+" is NH₄⁺. A number
 *  in front stays as it is. */
export function klFormula(species) {
  const typed = String(species).trim(), ion = /^(.*?[A-Za-z)\]])(\d*)([+\-−])$/.exec(typed);
  if (!ion) return klLower(typed);
  const [, base, digits, sign] = ion, element = /^(\d*)[A-Z][a-z]?$/.test(base), charged = digits.length > 1 || (digits.length === 1 && element);
  const sub = charged ? digits.slice(0, -1) : digits, charge = charged ? digits.slice(-1) : '';
  return `${klLower(base + sub)}${[...charge].map(c => KL_SUP[c]).join('')}${sign === '+' ? '⁺' : '⁻'}`;
}
export const KL_CONC_UNITS = ['M', 'mol/L', 'mol dm⁻³'];
export const KL_TIME_UNITS = ['s', 'min', 'h'];
/** The graph that is a straight line for each order. */
export const KL_STRAIGHT = { 0: 'conc', 1: 'ln', 2: 'inv' };
/** When a zero-order reaction ends ([A] reaches 0); the other orders never do. */
export const klEnd = (order, a0, k) => (order === 0 ? a0 / k : Infinity);
/** [A] at time t: [A]0 - kt, [A]0 e^(-kt) or 1 / (1/[A]0 + kt). */
export function klConc(order, a0, k, t) {
  if (order === 0) return Math.max(0, a0 - k * t);
  if (order === 1) return a0 * Math.exp(-k * t);
  return a0 / (1 + k * a0 * t);
}
/** What a graph plots for a concentration: [A], ln[A] or 1/[A]; null for ln or 1/ of zero. */
export function klPlotted(plot, a) { if (plot === 'conc') return a; if (!(a > 0)) return null; return plot === 'ln' ? Math.log(a) : 1 / a; }
/** When [A] has fallen to `share` of [A]0. */
export function klTimeAtShare(order, a0, k, share) {
  if (order === 0) return (a0 * (1 - share)) / k;
  if (order === 1) return -Math.log(share) / k;
  return (1 / share - 1) / (k * a0);
}
/** When each of the first n half-lives ends. */
export const klHalfLives = (order, a0, k, n) => Array.from({ length: n }, (_, i) => klTimeAtShare(order, a0, k, 0.5 ** (i + 1)));
/** The unit of 1/[A] as an axis writes it. */
export const KL_INVERSE = { M: 'M⁻¹', 'mol/L': 'L/mol', 'mol dm⁻³': 'dm³ mol⁻¹' };
/** The unit of k. */
export function klKUnit(order, conc, time) {
  const perTime = `${time}⁻¹`;
  if (order === 1) return perTime;
  const zero = { M: 'M', 'mol/L': 'mol L⁻¹', 'mol dm⁻³': 'mol dm⁻³' }, second = { M: 'M⁻¹', 'mol/L': 'L mol⁻¹', 'mol dm⁻³': 'dm³ mol⁻¹' };
  return `${(order === 0 ? zero : second)[conc]} ${perTime}`;
}
/** A number to `figures` significant figures. */
export const klSig = (v, figures = 3) => (v === 0 || !Number.isFinite(v) ? v : Number(v.toPrecision(figures)));
/** ln[A] rounded to 3 decimal places, never -0. */
export const klLnRound = v => Number(v.toFixed(3)) || 0;
const KL_TIDY = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
/** The times of `count` data points from 0 towards `until`, evenly spaced at a plain step. */
export function klDataTimes(until, count) {
  const exact = until / (count - 1);
  let step = klSig(exact, 2);
  if (Math.abs(step - exact) > exact * 1e-9) { const power = 10 ** Math.floor(Math.log10(exact)); step = Math.max(...KL_TIDY.map(m => m * power).filter(v => v <= exact * (1 + 1e-9))); }
  return Array.from({ length: count }, (_, i) => Number((i * step).toPrecision(10)));
}
function klNormal(random) { const u = Math.max(random(), 1e-12); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * random()); }
/** The data a student is given: { t, conc, ln, inv } at each time, scattered by noise percent from the seed. */
export function klDataPoints(order, a0, k, times, noise = 0, seed = 1) {
  const random = ptRandom(seed), end = klEnd(order, a0, k), out = [];
  times.forEach((t, i) => {
    const z = klNormal(random);
    if (t > end * (1 + 1e-9)) return;
    const conc = klSig(i === 0 ? a0 : Math.max(0, klConc(order, a0, k, t) * (1 + (noise / 100) * z)));
    const of = plot => { const v = klPlotted(plot, conc); return v === null ? null : plot === 'ln' ? klLnRound(v) : klSig(v); };
    out.push({ t, conc, ln: of('ln'), inv: of('inv') });
  });
  return out;
}
