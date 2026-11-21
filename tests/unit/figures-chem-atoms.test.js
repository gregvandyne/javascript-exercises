// The 1.2.0 atoms and particles (docs/figures-api.md "Chemistry (1.2.0)"): nuclide notation from its numbers (never
// fewer than 0 neutrons or electrons), particle diagrams that draw every particle and keep every atom, and the
// extensions of the kinds 1.1.0 had: orbitals for all 118 elements (real ground states, a noble gas core, stacked by
// energy), a Bohr ion's gained and lost electrons, several half-life curves, a titration from measured pH, more Lewis
// molecules. Without the new options those kinds draw exactly what 1.1.0 drew (tests/unit/figures-v120.test.js).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkWords, PRINT_OK } from './_physics-gens.js';
import { checkChemGenerator } from './_chem-gens.js';
const OF = globalThis.OombaFigures;
const count = (s, re) => (s.match(re) || []).length;

test('nuclide notation: the numbers where they go, worked out; particles with their fixed numbers', () => {
  assert.deepEqual({ ...OF.solve.nuclide({ element: 'C', mass: 14 }) }, { symbol: 'C', Z: 6, mass: 14, charge: 0, protons: 6, neutrons: 8, electrons: 6 });
  assert.deepEqual({ ...OF.solve.nuclide({ element: 'Cl', mass: 37, charge: -1 }) }, { symbol: 'Cl', Z: 17, mass: 37, charge: -1, protons: 17, neutrons: 20, electrons: 18 });
  assert.equal(OF.solve.nuclide({ element: 92, mass: 235 }).symbol, 'U'); assert.equal(OF.solve.nuclide({ element: 'Og', mass: 294 }).Z, 118);
  const s = OF.svg('nuclide', { element: 'Cl', mass: 37, charge: -1 });
  assert.match(s, /text-anchor="end"[^>]*class="of-mass">37</); assert.match(s, /text-anchor="end"[^>]*class="of-z">17</); assert.match(s, /class="of-charge">−</); assert.match(s, /class="of-symbol">Cl</);
  assert.match(OF.svg('nuclide', { particle: 'beta' }), /class="of-z">−1</); assert.match(OF.svg('nuclide', { particle: 'positron' }), /class="of-z">\+1</);
  assert.match(OF.svg('nuclide', { particle: 'alpha', symbol: 'α' }), />α</);
  assert.match(OF.svg('nuclide', { element: 'O', mass: 18, notation: 'hyphen' }), /class="of-hyphen">O-18</);
  const h = OF.svg('nuclide', { element: 'U', mass: 235 }, { hide: 'Z' });
  assert.equal(count(h, /class="of-blank"/g), 1); assert.doesNotMatch(h, />92</);
  const bad = [[{ element: 'C', mass: 5 }, /fewer than 0 neutrons/], [{ element: 'H', mass: 1, charge: 2 }, /fewer than 0 electrons/], [{ element: 'Zz', mass: 5 }, /H to Og/], [{ particle: 'alpha', mass: 4 }, /fixed/], [{ particle: 'beta', symbol: 'He' }, /written e or β/]];
  for (const [d, re] of bad) { assert.match(OF.check('nuclide', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('nuclide', d), /cannot be drawn/); }
});
test('particle diagrams: every particle drawn, the same data the same figure, atoms kept from before to after', () => {
  const water = { particles: [{ count: 8, shape: 'bent', look: { size: 'm', shade: 'gray' }, outer: { size: 's', shade: 'white' }, name: 'Water' }] };
  const s = OF.svg('particles', water);
  assert.equal(count(s, /class="of-disc"/g), 8 * 3 + 3, 'eight molecules of three discs, and one in the key');
  assert.equal(OF.svg('particles', water), s, 'seeded: the same every time'); assert.notEqual(OF.svg('particles', { ...water, seed: 9 }), s);
  assert.deepEqual({ ...OF.solve.particles(water), kinds: undefined }, { kinds: undefined, total: 8, atoms: 24 });
  for (const state of ['gas', 'liquid', 'solid']) assert.equal(count(OF.svg('particles', { ...water, state }), /class="of-disc"/g), 27, state);
  const rx = { boxes: 2, particles: [{ count: 4, after: 0, shape: 'pair', look: { size: 's', shade: 'white' }, outer: { size: 's', shade: 'white' } }, { count: 2, after: 0, shape: 'pair', look: { size: 'm', shade: 'dark' }, outer: { size: 'm', shade: 'dark' } }, { count: 0, after: 4, shape: 'bent', look: { size: 'm', shade: 'dark' }, outer: { size: 's', shade: 'white' } }] };
  assert.deepEqual(OF.check('particles', rx), []); assert.equal(OF.solve.particles(rx).afterTotal, 4);
  assert.match(OF.check('particles', { ...rx, particles: rx.particles.map((k, i) => (i === 2 ? { ...k, after: 3 } : k)) }).join(), /atoms are conserved: the s white atoms are 8 before and 6 after/);
  assert.match(OF.check('particles', { particles: [{ count: 60, look: { size: 'xl', shade: 'gray' } }] }).join(), /only \d+ of the 60 particles fit/);
  const lat = { lattice: { pattern: 'interstitial', rows: 4, columns: 5, main: { size: 'l', shade: 'light' }, second: { size: 'xs', shade: 'black' }, secondCount: 4 } };
  assert.deepEqual({ ...OF.solve.particles(lat) }, { lattice: true, sites: 24, second: 4, main: 20 });
  assert.match(OF.check('particles', { lattice: { ...lat.lattice, secondCount: 13 } }).join(), /only 12 second atoms fit/);
  assert.ok(PRINT_OK(OF.svg('particles', water, { print: true })) || /fill="#FFFFFF"/.test(OF.svg('particles', water, { print: true })));
  assert.match(OF.svg('particles', water, { hide: 'names' }), /__________/);
});
test('orbitals for all 118 elements: real ground states, a noble gas core, stacked by energy', () => {
  const ag = OF.solve.orbitals({ element: 'Ag' });
  assert.equal(ag.coreText, '[Kr] 5s¹ 4d¹⁰'); assert.equal(ag.unpaired, 1);
  assert.equal(OF.solve.orbitals({ element: 'Pd' }).coreText, '[Kr] 4d¹⁰');
  assert.equal(OF.solve.orbitals({ element: 'Au' }).coreText, '[Xe] 6s¹ 4f¹⁴ 5d¹⁰');
  assert.equal(OF.solve.orbitals({ element: 'Fe', charge: 3 }).coreText, '[Ar] 3d⁵'); assert.equal(OF.solve.orbitals({ element: 'Fe', charge: 3 }).unpaired, 5);
  assert.equal(OF.solve.orbitals({ element: 'Og' }).electrons, 118);
  const s = OF.svg('orbitals', { element: 'U', core: true });
  assert.match(s, /U: \[Rn\] 7s² 5f³ 6d¹/); assert.doesNotMatch(s, />1s</, 'the core is not drawn');
  assert.match(OF.svg('orbitals', { element: 'Fe', arrangement: 'energy' }), /Fe: 1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶/);
  assert.match(OF.svg('orbitals', { element: 'Ag' }, { hide: 'arrows' }), /Ag: ____________/);
  assert.match(OF.check('orbitals', { element: 'Xx', core: true }).join(), /H to Og/); assert.match(OF.check('orbitals', { element: 'Fe', arrangement: 'up' }).join(), /"row" or "energy"/);
});
test('Bohr ion marks, half-life curves, a titration from measured pH, more Lewis molecules', () => {
  const cl = OF.svg('bohr', { element: 'Cl', charge: -1, ionMarks: true });
  assert.equal(count(cl, /class="of-gained"/g), 1); assert.equal(count(cl, /class="of-e"/g), 17);
  const na = OF.svg('bohr', { element: 'Na', charge: 1, ionMarks: true });
  assert.equal(count(na, /class="of-lost"/g), 1); assert.equal(count(na, /class="of-lost-shell"/g), 1); assert.equal(count(na, /class="of-e"/g), 10);
  assert.match(OF.check('bohr', { element: 'Na', ionMarks: true }).join(), /needs a "charge"/);
  const hl = { isotopes: [{ halfLife: 5, name: 'A' }, { halfLife: 12, name: 'B' }], start: 80 };
  assert.deepEqual(OF.check('halfLife', hl), []); assert.deepEqual(OF.solve.halfLife(hl, 60), [80 / 2 ** 12, 80 / 2 ** 5]);
  assert.equal(count(OF.svg('halfLife', hl), /class="of-isotope"/g), 2);
  assert.match(OF.check('halfLife', { isotopes: [{ halfLife: 5 }, { halfLife: 5 }] }).join(), /same half-life/); assert.match(OF.check('halfLife', { halfLife: 5, isotopes: [] }).join(), /not both/);
  const tp = { points: [[0, 2.9], [5, 4.1], [12.5, 4.8], [24, 6.2], [25, 8.7], [26, 11.3], [30, 12.2]] };
  assert.deepEqual(OF.check('titration', tp), []); assert.equal(count(OF.svg('titration', tp), /class="of-point"/g), 7);
  assert.match(OF.check('titration', { points: [[0, 3], [5, 4], [4, 5]] }).join(), /must rise/); assert.match(OF.check('titration', { ...tp, acid: 'weak' }).join(), /leave out "acid"/);
  for (const m of ['H2S', 'PH3', 'PCl3', 'NF3', 'OF2', 'SiH4', 'CF4', 'CH3Cl', 'H2O2', 'C2H6', 'HOCl', 'CO', 'CN', 'H3O', 'HCHO']) assert.deepEqual(OF.check('lewis', { molecule: m }), [], m);
  assert.ok(OF.data.molecules.includes('H3O'));
});
test('dot-and-cross: shells overlap where atoms bond, each atom\'s electrons in its own mark; ionic charges balance', () => {
  const s = OF.svg('dotCross', { molecule: 'CH4' });
  assert.equal(count(s, /class="of-shell"/g), 5); assert.equal(count(s, /class="of-dot"/g), 4, 'C: 4 dots'); assert.equal(count(s, /class="of-cross"/g), 4, 'H: 4 crosses');
  const co2 = OF.svg('dotCross', { molecule: 'CO2' });
  assert.equal(count(co2, /class="of-dot"/g) + count(co2, /class="of-cross"/g), 16, 'every outer electron: 4 + 6 + 6');
  assert.deepEqual({ ...OF.solve.dotCross({ molecule: 'H2O' }) }, { ionic: false, bonds: 2, sharedPairs: 2, lonePairs: 2, electrons: 8 });
  assert.equal(count(OF.svg('dotCross', { molecule: 'Cl2' }), /class="of-dot"/g), 7, 'one element: one atom dots, the other crosses');
  // overlapping only where bonded
  const shells = [...OF.svg('dotCross', { molecule: 'CH4' }).matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"[^>]*class="of-shell"/g)].map(m => m.slice(1).map(Number));
  for (let i = 1; i < 5; i++) { assert.ok(Math.hypot(shells[0][0] - shells[i][0], shells[0][1] - shells[i][1]) < 2 * shells[0][2], 'C and H overlap'); for (let j = i + 1; j < 5; j++) assert.ok(Math.hypot(shells[i][0] - shells[j][0], shells[i][1] - shells[j][1]) >= 2 * shells[0][2] - 0.01, 'two H do not'); }
  const mg = { ions: [{ element: 'Mg' }, { element: 'Cl', count: 2 }] };
  assert.deepEqual(JSON.parse(JSON.stringify(OF.solve.dotCross(mg))), { ionic: true, ions: [{ symbol: 'Mg', charge: 2, count: 1 }, { symbol: 'Cl', charge: -1, count: 2 }], transferred: 2, formula: 'MgCl2' });
  const ms = OF.svg('dotCross', mg);
  assert.equal(count(ms, /class="of-cross"/g), 8 + 2, 'Mg²⁺ keeps 8 in its new outer shell; each Cl⁻ got one'); assert.equal(count(ms, /class="of-dot"/g), 14);
  const bad = [[{ ions: [{ element: 'Na' }, { element: 'O' }] }, /charges do not balance/], [{ ions: [{ element: 'Na' }, { element: 'K' }] }, /one metal .* and one non-metal/], [{ molecule: 'CO' }, /dative bond/], [{ molecule: 'NH4' }, /charged molecule/], [{ molecule: 'XY' }, /unknown "molecule"/]];
  for (const [d, re] of bad) { assert.match(OF.check('dotCross', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('dotCross', d), /cannot be drawn/); }
  assert.equal(count(OF.svg('dotCross', { molecule: 'CH4' }, { hide: true }), /class="of-dot"|class="of-cross"/g), 0);
});
test('print, languages, words and generators', async () => {
  for (const [k, d] of [['dotCross', { molecule: 'HCN' }], ['dotCross', { ions: [{ element: 'Al', count: 2 }, { element: 'O', count: 3 }] }], ['nuclide', { element: 'Cl', mass: 37, charge: -1 }], ['orbitals', { element: 'U', core: true }], ['bohr', { element: 'Na', charge: 1, ionMarks: true }], ['halfLife', { isotopes: [{ halfLife: 5 }, { halfLife: 12 }, { halfLife: 20 }] }], ['titration', { points: [[0, 3], [10, 5], [20, 9]] }]]) {
    assert.ok(PRINT_OK(OF.svg(k, d, { print: true })), k);
    for (const l of ['de', 'ja', 'he', 'ar']) assert.doesNotMatch(OF.svg(k, d, { lang: l }), /NaN|undefined/, `${k} ${l}`);
  }
  const p = OF.svg('particles', { particles: [{ count: 6, look: { size: 'm', shade: 'gray', charge: '+' } }] }, { print: true });
  assert.doesNotMatch(p, /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2/); assert.match(p, /fill="#FFFFFF"/);
  await checkWords(assert, ['nuclide', 'particles', 'key', 'dotCross']);
  for (const g of ['nuclide', 'particles', 'dotCross']) await checkChemGenerator(assert, g);
});
