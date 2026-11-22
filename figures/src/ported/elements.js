// Oomba Figures: all 118 elements by atomic number, and their ground-state electron configurations: electrons fill the
// sublevels in order (lower n + l first, and lower n when n + l is the same), except for the real ground states that
// differ (NIST: Cr, Cu, Nb, Mo, Ru, Rh, Pd, Ag, La, Ce, Gd, Pt, Au, Ac, Th, Pa, U, Np, Cm, Lr). A cation loses
// electrons from its sublevel with the highest n first, and the highest l within that n (so Fe loses 4s before 3d, and
// Sn 5p before 5s); an anion gains them going on in filling order. Also the noble gas core a configuration can be
// written with ([Ar] 4s² 3d⁶). Pure numbers in, pure numbers out: figures/src/chem.js and figures/src/spectra.js use them.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the elements' English names, the "filling order" rule for exceptions
// (Oomba always draws the real ground state), the editable diagrams and their checking, and the written forms with
// superscripts are left out (Oomba writes configurations its own way).

export const EL_SYMBOLS = [null, ...'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og'.split(' ')];
export const EL_MAX_Z = 118;
/** 'Na' | 11 -> 11, or 0. */
export function elZ(el) {
  if (Number.isInteger(el) && el >= 1 && el <= EL_MAX_Z) return el;
  const i = EL_SYMBOLS.indexOf(String(el || '').trim());
  return i > 0 ? i : 0;
}
export const EL_NOBLE = [2, 10, 18, 36, 54, 86, 118];
/** Ground states that differ from the filling order: only the sublevels that differ. */
export const EL_EXCEPTIONS = {
  24: { '4s': 1, '3d': 5 }, 29: { '4s': 1, '3d': 10 }, 41: { '5s': 1, '4d': 4 }, 42: { '5s': 1, '4d': 5 }, 44: { '5s': 1, '4d': 7 }, 45: { '5s': 1, '4d': 8 },
  46: { '5s': 0, '4d': 10 }, 47: { '5s': 1, '4d': 10 }, 57: { '4f': 0, '5d': 1 }, 58: { '4f': 1, '5d': 1 }, 64: { '4f': 7, '5d': 1 }, 78: { '6s': 1, '5d': 9 },
  79: { '6s': 1, '5d': 10 }, 89: { '5f': 0, '6d': 1 }, 90: { '5f': 0, '6d': 2 }, 91: { '5f': 2, '6d': 1 }, 92: { '5f': 3, '6d': 1 }, 93: { '5f': 4, '6d': 1 },
  96: { '5f': 7, '6d': 1 }, 103: { '6d': 0, '7p': 1 },
};
const EL_LETTERS = ['s', 'p', 'd', 'f'];
/** Every sublevel up to 7p in filling order: { name, n, l, orbitals }. */
export const EL_FILLING = (() => {
  const all = [];
  for (let n = 1; n <= 7; n++) for (let l = 0; l < Math.min(n, 4); l++) all.push({ name: `${n}${EL_LETTERS[l]}`, n, l, orbitals: 2 * l + 1 });
  return all.filter(s => s.n + s.l <= 8).sort((a, b) => a.n + a.l - (b.n + b.l) || a.n - b.n);
})();
export const elFillingIndex = name => EL_FILLING.findIndex(s => s.name === name);
/** Fill this many electrons in filling order: { '1s': 2, ... }. */
export function elFill(electrons) {
  const c = {}; let left = electrons;
  for (const s of EL_FILLING) { if (left <= 0) break; c[s.name] = Math.min(left, 2 * s.orbitals); left -= c[s.name]; }
  return c;
}
/** An atom's real ground state. */
export const elAtom = z => (z in EL_EXCEPTIONS ? { ...elFill(z), ...EL_EXCEPTIONS[z] } : elFill(z));
/** An atom's or ion's ground state (empty sublevels may be 0). */
export function elIon(z, charge) {
  const c = elAtom(z);
  if (charge > 0) {
    let lose = Math.min(charge, z);
    for (const s of EL_FILLING.filter(x => c[x.name]).sort((a, b) => b.n - a.n || b.l - a.l)) { const lost = Math.min(lose, c[s.name]); c[s.name] -= lost; lose -= lost; }
  } else if (charge < 0) {
    let gain = -charge;
    for (const s of EL_FILLING) { const room = 2 * s.orbitals - (c[s.name] ?? 0), got = Math.min(gain, room); if (got) c[s.name] = (c[s.name] ?? 0) + got; gain -= got; if (!gain) break; }
  }
  return c;
}
/** The largest noble gas core a configuration fills: { z, symbol, sublevels }, or null. */
export function elCore(c) {
  const e = Object.values(c).reduce((s, x) => s + x, 0);
  for (const z of [...EL_NOBLE].reverse()) {
    if (z >= e) continue;
    const core = elFill(z);
    if (Object.entries(core).every(([k, n]) => (c[k] ?? 0) === n)) return { z, symbol: EL_SYMBOLS[z], sublevels: Object.keys(core) };
  }
  return null;
}
