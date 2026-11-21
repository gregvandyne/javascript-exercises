// Oomba Figures: how chemistry's lab instruments read. A buret reads down from 0 at its top; a gas syringe reads out
// from 0 at its nozzle; a beaker is marked coarsely (every 10, 25 or 50 mL) and its wide surface is flat across the
// middle, climbing the glass only near it. A digital balance shows 1 to 4 decimal places of grams and holds less the
// finer it reads (1000, 400, 200 and 200 g); a triple beam balance's three riders add up to the mass, the 100 g and 10 g
// riders in notches and the front one sliding along a 0 to 10 g beam. A pH meter reads 0 to 14 (an analog one's needle
// swings evenly over a dial, 45 degrees either side of straight up), and pH paper matches one of 15 swatches, one per
// whole pH, red through green to purple. A digital thermometer reads about -50 to 150 degrees Celsius, in Celsius,
// kelvin or Fahrenheit. In a volume by displacement figure the object's volume is the rise: after less before. Pure
// numbers in, pure numbers out: figures/src/labware.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; only the scales, ranges, rider split, dial angle, swatch colors, unit
// conversion and the meniscus curves are kept. A reading is never rounded or clamped here: Oomba's checks refuse one the
// instrument cannot show (its own reading rule: on a mark or half way between two, or the display's places). The
// random readings, the drawn instruments' layouts, the magnifiers, the held and pan objects and the answer-key
// sentences are left out (Oomba draws the instruments its own way, and OF.solve gives the numbers).

/** A digital balance's capacity in grams for the places it shows; 3 and 4 places are analytical balances. */
export const LW_BALANCE = { 1: 1000, 2: 400, 3: 200, 4: 200 };
export const LW_TRIPLE_BEAM = 610;
/** A triple beam balance's riders for a mass (in hundredths, so 610 g is 500 + 100 + 10): { hundreds, tens, front }. */
export function lwRiders(grams) {
  let left = Math.round(grams * 100);
  const hundreds = Math.min(5, Math.floor(left / 10000));
  left -= hundreds * 10000;
  const tens = Math.min(10, Math.floor(left / 1000));
  left -= tens * 1000;
  return { hundreds: hundreds * 100, tens: tens * 10, front: left / 100 };
}

export const LW_PH_MIN = 0, LW_PH_MAX = 14;
const LW_HALF_SWEEP = Math.PI / 4;
/** The analog pH meter's needle angle from straight up (radians), 0 at the left end. */
export const lwNeedle = pH => -LW_HALF_SWEEP + ((pH - LW_PH_MIN) / (LW_PH_MAX - LW_PH_MIN)) * 2 * LW_HALF_SWEEP;
/** pH paper's color chart: one swatch per whole pH, 0 to 14. */
export const LW_PH_COLORS = ['#c8102e', '#e0301e', '#f0592a', '#f7892b', '#fbb034', '#fdd835', '#cddc39', '#7cb342', '#2e9e6b', '#1e9aa0', '#1e78c2', '#3f51b5', '#5e35b1', '#7b1fa2', '#4a148c'];

/** Degrees Celsius to kelvin or Fahrenheit and back. */
const LW_TO_C = { '°C': t => t, K: t => t - 273.15, '°F': t => ((t - 32) * 5) / 9 };
const LW_FROM_C = { '°C': c => c, K: c => c + 273.15, '°F': c => (c * 9) / 5 + 32 };
export const lwConvert = (t, from, to) => LW_FROM_C[to](LW_TO_C[from](t));
/** A digital probe thermometer's range in a unit, whole numbers: about -50 to 150 degrees Celsius. */
export const lwDigitalRange = unit => ({ min: Math.round(lwConvert(-50, '°C', unit)), max: Math.round(lwConvert(150, '°C', unit)) });

/** The meniscus from the left wall to the right: it climbs `depth` up each wall in one bowl, its bottom exactly at y. */
export function lwMeniscus(left, right, y, depth) {
  const w = right - left, mid = left + w / 2, top = y - depth;
  return `M ${left} ${top} C ${left + 0.04 * w} ${y - 0.4 * depth} ${left + 0.22 * w} ${y} ${mid} ${y} C ${right - 0.22 * w} ${y} ${right - 0.04 * w} ${y - 0.4 * depth} ${right} ${top}`;
}
/** A wide vessel's meniscus: flat across the middle at y, climbing `depth` up each wall only within `edge` of it. */
export function lwFlatMeniscus(left, right, y, depth, edge) {
  const top = y - depth;
  return `M ${left} ${top} C ${left + 0.15 * edge} ${y - 0.3 * depth} ${left + 0.45 * edge} ${y} ${left + edge} ${y} H ${right - edge} C ${right - 0.45 * edge} ${y} ${right - 0.15 * edge} ${y - 0.3 * depth} ${right} ${top}`;
}
/** The object's volume in a displacement figure: the rise, to the readings' places. */
export const lwDisplaced = (before, after, decimals) => Number((after - before).toFixed(decimals));
