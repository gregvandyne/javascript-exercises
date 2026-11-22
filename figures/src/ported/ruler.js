// Oomba Figures: a ruler's marks and readings. Every mark on a centimeter or inch ruler with its level (0 for a numbered
// mark, then ever shorter: a medium mark at each half centimeter among millimeters, inch marks shortening from halves
// down to sixteenths), how long each level's mark is, how wide the ruler is drawn (the same drawing units per centimeter
// on any ruler up to 30 cm or 12 in), and a length written the way a ruler reads it ("4.3" in cm; "3 3/8" in inches).
// Pure numbers in, pure numbers out: figures/src/readings.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; a ruler is given by its unit, length and smallest marks (Oomba's
// structured data) rather than the original's menus of sizes; a metric reading follows Oomba's reading rule (on a mark,
// or half way between two, with one decimal more) instead of the original's estimated-digit and nearest-mark choice;
// the snapping, random lengths, typed-length parsing, the magnifiers and the long-ruler marks (5 and 10 cm) are left
// out; the numbers are written in the reader's language by the caller.

const RU_PER_CM = 32;
const RU_WIDEST = 900;
export const RU_CM_PER_INCH = 2.54;
const ruGcd = (a, b) => (b ? ruGcd(b, a % b) : a);
const ruNear = (x, s) => Math.abs(x / s - Math.round(x / s)) < 1e-6;

/** Every mark: [{ value, level }] from 0 to max, numbered (level 0) every whole unit. */
export function ruTicks(unit, max, step) {
  const perNumber = Math.round(1 / step), count = Math.round(max / step), out = [];
  for (let i = 0; i <= count; i++) {
    const j = i % perNumber;
    const level = !j ? 0 : unit === 'in' ? Math.round(Math.log2(perNumber / ruGcd(j, perNumber))) : perNumber === 10 && j !== 5 ? 2 : 1;
    out.push({ value: Number((i * step).toFixed(6)), level });
  }
  return out;
}
/** How long a mark of this level is, in drawing units. */
export const ruTickHeight = (unit, level) => { const h = unit === 'in' ? [0.36, 0.28, 0.22, 0.16, 0.11] : [0.36, 0.26, 0.17]; return 84 * h[Math.min(level, h.length - 1)]; };
/** Drawing units per unit of the ruler (per cm, or per inch). */
export const ruPerUnit = (unit, max) => { const cm = max * (unit === 'in' ? RU_CM_PER_INCH : 1); return (Math.min(RU_PER_CM, RU_WIDEST / cm) * cm) / max; };
/** A length as the ruler reads it: decimals in cm (fmt writes them), a whole number or mixed fraction in inches. */
export function ruText(unit, step, value, fmt) {
  if (unit === 'cm') { const dp = step >= 1 ? 0 : 1; return fmt(value, dp + (ruNear(value, step) ? 0 : 1)); }
  const n = Math.round(1 / step), parts = Math.round(value * n), whole = Math.floor(parts / n), rest = parts % n;
  if (!rest) return String(whole);
  const k = ruGcd(rest, n), frac = `${rest / k}/${n / k}`;
  return whole ? `${whole} ${frac}` : frac;
}
