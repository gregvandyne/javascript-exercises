// Oomba Figures: the curve a bond energy curve draws, the potential energy of two bonded atoms against the distance
// between their nuclei, as a Morse curve set by the two numbers a student reads back from it:
//   E(r) = D [(1 - e^(-a (r - r0)))^2 - 1],   a = 3 / r0
// r0 is the bond length and D the bond energy. Its lowest point is exactly at r0, where E = -D; it rises to 0 from
// below as the atoms separate and climbs steeply through 0 when they are pushed together. a r0 = 3 gives the steep wall
// and fairly narrow well of a typical bond (real diatomic bonds run from about 1.4 for H2 to 4 for Cl2, most near 3).
// Also the length units (kept in picometers). Pure numbers in, pure numbers out: figures/src/chemgraphs.js draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the settings, the names of the units in words and the page's axis
// titles are left out.

export const BE_SHAPE = 3;
/** The potential energy at distance r, for bond length r0 and bond energy D. */
export function beEnergyAt(r, r0, D) { const gap = 1 - Math.exp((-BE_SHAPE * (r - r0)) / r0); return D * (gap * gap - 1); }
/** The distance, shorter than the bond length, at which the energy is e (never below -D): a point on the wall. */
export const beWallAt = (e, r0, D) => r0 * (1 - Math.log(1 + Math.sqrt(Math.max(0, 1 + e / D))) / BE_SHAPE);
/** Where the curve crosses 0 on its way up the wall: about 0.77 of the bond length. */
export const beZeroCrossing = r0 => r0 * (1 - Math.LN2 / BE_SHAPE);
/** Points along the curve from `from` to `to`; the bond length is one of them when it is between, so the lowest point
 *  drawn is the minimum itself. */
export function beSamples(r0, D, from, to, count = 400) {
  const at = r => ({ x: r, y: beEnergyAt(r, r0, D) }), run = (a, b, n) => Array.from({ length: n + 1 }, (_, j) => at(j === n ? b : a + ((b - a) * j) / n));
  if (!(to > from)) return [];
  if (r0 <= from || r0 >= to) return run(from, to, count);
  const half = Math.floor(count / 2);
  return [...run(from, r0, half), ...run(r0, to, count - half).slice(1)];
}
export const BE_UNITS = ['pm', 'angstrom', 'nm'];
export const BE_UNIT_TEXT = { pm: 'pm', angstrom: 'Å', nm: 'nm' };
const BE_PER_PM = { pm: 1, angstrom: 0.01, nm: 0.001 };
const beTidy = v => Number(v.toPrecision(12));
/** A length in picometers, in another unit: 150 pm is 1.5 Å and 0.15 nm. */
export const beFromPm = (pm, unit) => beTidy(pm * BE_PER_PM[unit]);
