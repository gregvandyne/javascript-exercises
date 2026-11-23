// Oomba Figures: the metals a galvanic (electrochemical) cell can be made of, each in a 1 M solution of its own ion, and
// the cell two of them make: the metal with the lower standard reduction potential is the anode (oxidized, the
// negative electrode), the other the cathode, and E°cell is the difference of the two potentials. The half-reactions
// and the overall reaction are balanced so the electrons cancel. Potentials in volts at 25 °C (the usual table values).
// Pure numbers in, pure numbers out: figures/src/cells.js checks the data and draws.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the metals' English names are left out (the figure writes symbols), the
// colors are kept for the screen only, and the reactions also give how many electrons each formula unit moves.

export const GC_METALS = ['Mg', 'Al', 'Zn', 'Fe', 'Ni', 'Pb', 'Cu', 'Ag'];
/** potential: E° of the ion's reduction (V); color: the strip; solution: the solution's tint. */
export const GC_INFO = {
  Mg: { ion: 'Mg²⁺', potential: -2.37, color: '#c3c7cb', solution: '#eef3f8' },
  Al: { ion: 'Al³⁺', potential: -1.66, color: '#ccd1d6', solution: '#eef3f8' },
  Zn: { ion: 'Zn²⁺', potential: -0.76, color: '#a7afb8', solution: '#eef3f8' },
  Fe: { ion: 'Fe²⁺', potential: -0.44, color: '#7c8187', solution: '#e8f4e2' },
  Ni: { ion: 'Ni²⁺', potential: -0.25, color: '#a8a698', solution: '#dff2df' },
  Pb: { ion: 'Pb²⁺', potential: -0.13, color: '#6d7480', solution: '#eef3f8' },
  Cu: { ion: 'Cu²⁺', potential: 0.34, color: '#c47a42', solution: '#d6e9fb' },
  Ag: { ion: 'Ag⁺', potential: 0.8, color: '#d7dbe0', solution: '#eef3f8' },
};
/** The cell two different metals make: which side is the anode, and E°cell rounded to 0.01 V. */
export function gcCell(left, right) {
  const anode = GC_INFO[left].potential < GC_INFO[right].potential ? 'left' : 'right';
  return { anode, cathode: anode === 'left' ? 'right' : 'left', voltage: Math.round(Math.abs(GC_INFO[right].potential - GC_INFO[left].potential) * 100) / 100 };
}
/** An ion's charge from its superscripts: 2 for Cu²⁺. */
export function gcCharge(ion) {
  const digits = '⁰¹²³⁴⁵⁶⁷⁸⁹', n = [...ion].map(c => digits.indexOf(c)).filter(d => d >= 0);
  return n.length ? Number(n.join('')) : 1;
}
/** The half-reactions at the anode and cathode, and the overall reaction balanced; electrons: how many move in it. */
export function gcReactions(left, right) {
  const cell = gcCell(left, right), sides = { left, right }, anode = sides[cell.anode], cathode = sides[cell.cathode];
  const a = GC_INFO[anode], c = GC_INFO[cathode], na = gcCharge(a.ion), nc = gcCharge(c.ion);
  const e = n => `${n === 1 ? '' : n}e⁻`, gcd = (x, y) => (y ? gcd(y, x % y) : x), lcm = (na * nc) / gcd(na, nc), times = (k, w) => `${k === 1 ? '' : k}${w}`, ka = lcm / na, kc = lcm / nc;
  return {
    oxidation: `${anode}(s) → ${a.ion}(aq) + ${e(na)}`,
    reduction: `${c.ion}(aq) + ${e(nc)} → ${cathode}(s)`,
    overall: `${times(ka, anode)}(s) + ${times(kc, c.ion)}(aq) → ${times(ka, a.ion)}(aq) + ${times(kc, cathode)}(s)`,
    electrons: lcm,
  };
}
