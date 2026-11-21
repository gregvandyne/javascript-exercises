// Oomba Figures: the physics behind a heating or cooling curve. A substance heated (or cooled) steadily from one
// temperature to another warms in a sloped segment in each phase (q = m c ΔT) and changes phase on a flat plateau at its
// melting or boiling point (q = n ΔH), where the heat goes into pulling the particles apart instead of speeding them
// up. Laid along the x-axis by the heat each segment takes (or the time, at a steady rate), every segment is to scale:
// water's boiling plateau is about 6.8 times as long as its melting plateau. A cooling curve is a heating curve run
// backwards, and a supercooled liquid dips below its freezing point before freezing warms it back up. The substances
// are those teachers graph most often (their melting and boiling points at 1 atm from the CRC Handbook of Chemistry and
// Physics; water's specific heats and enthalpies from OpenStax Chemistry 2e, Example 10.10 and Table 5.1; ethanol's
// and acetone's from the NIST Chemistry WebBook, ethanol's solid from Brown, Chemistry: The Central Science; mercury's
// from the CRC; sodium chloride's from the NIST-JANAF tables) and a made-up one with round numbers. A specific heat is
// the phase's near the temperatures its segment covers where known, otherwise at 25 degrees Celsius, so a curve is
// close to scale but not exact: specific heats change with temperature. Pure numbers in, pure numbers out:
// figures/src/energy.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the substances are keyed by an id without their English names; the
// schematic curve from typed segment lengths, the settings, the corner letters and the label placement are left out
// (Oomba draws every curve to scale, on its own axes).

/** Specific heats in J/(g °C), enthalpies in kJ/mol, molar mass in g/mol; mp and bp in °C; from and to, the usual run. */
export const HC_SUBSTANCES = {
  water: { mp: 0, bp: 100, from: -20, to: 120, cSolid: 2.09, cLiquid: 4.18, cGas: 1.86, fusH: 6.01, vapH: 40.67, molarMass: 18.02 },
  ethanol: { mp: -114.1, bp: 78.3, from: -140, to: 100, cSolid: 0.97, cLiquid: 2.44, cGas: 1.42, fusH: 4.97, vapH: 38.56, molarMass: 46.07 },
  acetone: { mp: -94.7, bp: 56.1, from: -120, to: 80, cSolid: 1.65, cLiquid: 2.16, cGas: 1.29, fusH: 5.72, vapH: 29.1, molarMass: 58.08 },
  mercury: { mp: -38.8, bp: 356.7, from: -60, to: 380, cSolid: 0.141, cLiquid: 0.14, cGas: 0.104, fusH: 2.29, vapH: 59.11, molarMass: 200.59 },
  sodiumChloride: { mp: 801, bp: 1465, from: 700, to: 1600, cSolid: 1.11, cLiquid: 1.15, cGas: 0.64, fusH: 28.2, vapH: 166, molarMass: 58.44 },
  x: { mp: 40, bp: 120, from: 0, to: 160, cSolid: 1.5, cLiquid: 3, cGas: 1, fusH: 10, vapH: 30, molarMass: 100 },
};
/** The five segments of a curve from a solid to a gas, in heating order. */
export const HC_SEGMENTS = ['solid', 'melt', 'liquid', 'boil', 'gas'];
export const hcPlateau = k => k === 'melt' || k === 'boil';
/** The segments a curve passes through, in its order: { key, t0, t1 }. A plateau is included when the curve starts or
 *  ends right at it. */
export function hcSegments(dir, { startT, endT, mp, bp }) {
  const lo = Math.min(startT, endT), hi = Math.max(startT, endT);
  const ranges = { solid: [-Infinity, mp], melt: [mp, mp], liquid: [mp, bp], boil: [bp, bp], gas: [bp, Infinity] }, out = [];
  for (const key of HC_SEGMENTS) {
    const [a, b] = ranges[key];
    if (hcPlateau(key)) { if (lo <= a && a <= hi) out.push({ key, t0: a, t1: a }); continue; }
    const from = Math.max(a, lo), to = Math.min(b, hi);
    if (to > from) out.push({ key, t0: from, t1: to });
  }
  return dir === 'heating' ? out : out.reverse().map(s => ({ ...s, t0: s.t1, t1: s.t0 }));
}
/** The heat a segment takes (or gives out), in kJ, for this mass in g. */
export function hcHeat(seg, mass, p) {
  const dT = Math.abs(seg.t1 - seg.t0);
  if (seg.key === 'solid') return (mass * p.cSolid * dT) / 1000;
  if (seg.key === 'liquid') return (mass * p.cLiquid * dT) / 1000;
  if (seg.key === 'gas') return (mass * p.cGas * dT) / 1000;
  return (mass / p.molarMass) * (seg.key === 'melt' ? p.fusH : p.vapH);
}
/** Segments laid end to end from x = 0, each as long as widthOf says: { ...segment, x0, width }. */
export function hcPlace(segs, widthOf) {
  let x = 0;
  return segs.map(s => { const width = Math.max(0, widthOf(s)), placed = { ...s, x0: x, width }; x += width; return placed; });
}
/** The curve through the placed segments, as points [{ x, y }]. A cooling curve can be supercooled: the liquid keeps
 *  cooling past its freezing point by `supercool` before the solid forms, and the heat it gives out freezing warms it
 *  back to the freezing point; the dip takes the start of the plateau (at most 40% of it), so nothing else moves. */
export function hcPoints(placed, supercool = 0) {
  if (!placed.length) return [];
  const pts = [{ x: 0, y: placed[0].t0 }];
  placed.forEach((s, i) => {
    const freezing = s.key === 'melt' && s.t0 === s.t1 && placed[i - 1] && placed[i - 1].key === 'liquid';
    if (freezing && supercool > 0 && s.width > 0) {
      const before = placed[i - 1], slope = before.width > 0 ? Math.abs(before.t1 - before.t0) / before.width : Infinity;
      const down = Math.min(supercool / slope, s.width * 0.4), back = down * 0.5;
      pts.push({ x: s.x0 + down, y: s.t0 - supercool }, { x: s.x0 + down + back, y: s.t0 });
    }
    pts.push({ x: s.x0 + s.width, y: s.t1 });
  });
  return pts;
}
/** A tidy axis range covering from..to: [start, end, step], in 8 to 20 blocks. */
export function hcNiceRange(from, to, zero = false) {
  const span = Math.max(to - from, 1e-6), round = v => Math.round(v * 1e9) / 1e9;
  for (const k of [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6]) for (const m of [1, 2, 2.5, 5]) {
    const step = m * 10 ** k, start = zero ? 0 : Math.floor(from / step + 1e-9) * step, end = Math.ceil(to / step - 1e-9) * step, blocks = Math.round((end - start) / step);
    if (blocks <= 20 && (blocks >= 8 || span / step < 8)) return [round(start), round(end), step];
  }
  return [from, to, span / 10];
}
