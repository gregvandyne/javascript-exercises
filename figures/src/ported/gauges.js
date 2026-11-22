// Oomba Figures: how a vernier caliper and a micrometer screw gauge read. A caliper's sliding (vernier) scale fits n
// divisions in n x g - 1 mm (10 in 9 mm, 20 in 39 mm, 50 in 49 mm), so each is one least count short of g mm, and a
// reading is the main-scale mark just left of its zero plus the sliding mark k that lines up with a main-scale mark,
// worth k least counts. A micrometer's spindle moves half a millimeter a turn and its thimble has 50 marks, 0.01 mm
// each: a reading is the last sleeve mark showing (to the half millimeter) plus the thimble mark on the datum line,
// and the thimble's marks seen side on bunch toward its edges. With a zero error (what it reads closed), the object
// measures the reading less the zero error. Pure numbers in, pure numbers out: figures/src/readings.js checks and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the scales and readings only: the drawn instruments' layouts, the held
// objects, the close-up and magnifier sizes, the random readings and the answer-key sentences are left out (Oomba draws
// a close-up of the scales of its own, and OF.solve gives the numbers).

export const GA_CALIPER = {
  0.1: { divisions: 10, length: 9, decimals: 1 },
  0.05: { divisions: 20, length: 39, decimals: 2 },
  0.02: { divisions: 50, length: 49, decimals: 2 },
};
export const GA_CALIPER_RANGE = 150, GA_CALIPER_MAX_ZERO = 0.5;
/** A caliper's sliding scale for its least count: { leastCount, divisions, length, decimals, spacing, numberEvery }. */
export function gaCaliper(lc) { const v = GA_CALIPER[lc]; return { ...v, leastCount: lc, spacing: v.length / v.divisions, numberEvery: Math.round(0.1 / lc) }; }
/** The main-scale mark left of the sliding zero, and the sliding mark k that lines up: { main, k }. */
export function gaCaliperRead(v, reading) { const main = Math.floor(reading + 1e-9); return { main, k: Math.round((reading - main) / v.leastCount) }; }
/** Every sliding-scale mark from its zero at the reading: { i, at (mm on the main scale), number }. */
export const gaSlideMarks = (v, reading) => Array.from({ length: v.divisions + 1 }, (_, i) => ({ i, at: reading + i * v.spacing, number: i % v.numberEvery === 0 ? String(i / v.numberEvery) : undefined }));

export const GA_PITCH = 0.5, GA_DIVISIONS = 50, GA_MICROMETER_RANGE = 25, GA_MICROMETER_MAX_ZERO = 0.05;
/** The last sleeve mark showing (to the half mm) and the thimble mark on the datum line (with tenths when estimated). */
export function gaMicrometerRead(reading) {
  const sleeve = Math.floor(reading / GA_PITCH + 1e-9) * GA_PITCH;
  return { sleeve, thimble: Math.round(((reading - sleeve) / 0.01) * 10) / 10 };
}
/** The thimble's marks seen side on, turned so the reading is on the datum line: each one's angle from the datum (up is
 *  toward the bigger numbers), the front half only; a mark's height is the thimble's radius times sin(angle). */
export function gaThimbleMarks(reading, limit = (85 * Math.PI) / 180) {
  const turned = (((reading % GA_PITCH) + GA_PITCH) % GA_PITCH) / 0.01;
  return Array.from({ length: GA_DIVISIONS }, (_, j) => { let t = (j - turned) / GA_DIVISIONS; t -= Math.round(t); return { j, angle: t * 2 * Math.PI }; }).filter(m => Math.abs(m.angle) <= limit);
}
/** What the object really measures: the reading less the zero error, to the instrument's places. */
export const gaCorrected = (reading, zero, decimals) => Math.round((reading - zero) * 10 ** decimals) / 10 ** decimals;
