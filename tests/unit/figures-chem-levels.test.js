// The 1.5.0 atomic energy levels (docs/figures-api.md "Chemistry: organic structures and atomic energy levels (1.5.0)"):
// hydrogen's levels from E = -13.6 Z²/n² eV (or any atom's levels in eV), each line drawn exactly at its energy; each
// transition's photon (energy, wavelength from λ = hc/ΔE, frequency, emission or absorption, series) from OF.solve,
// checked here against the Balmer and Lyman lines; arrows down for emission and up (dashed) for absorption; levels too
// close for an arrow are refused; print is black; hide leaves the values out; the reader's words; and the generator.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkChem2Generator } from './_chem2-gens.js';
const OF = globalThis.OombaFigures;
const near = (a, b, msg, tol = 0.05) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not ${b}`);

test('the levels and photons: Bohr energies, the Balmer and Lyman lines, ionization, a cascade', () => {
  const r = OF.solve.energyLevels({ transitions: [{ from: 3, to: 2 }, { from: 4, to: 2 }, { from: 2, to: 1 }, { from: 1, to: 'inf' }, { from: 1, to: 3 }] });
  assert.deepEqual(r.levels.map(l => Math.round(l.energy * 1000) / 1000), [-13.6, -3.4, -1.511, -0.85, -0.544, -0.378]);
  near(r.wavelength, 656.4, 'H-alpha (Bohr, 13.6 eV)', 0.1); near(r.energy, 1.889, 'ΔE 3 to 2', 0.001); near(r.frequency / 1e14, 4.567, 'f = c/λ', 0.01);
  assert.equal(r.transitions[0].type, 'emission'); assert.equal(r.transitions[0].series, 'balmer'); assert.equal(r.transitions[0].region, 'visible');
  near(r.transitions[1].wavelength, 486.2, 'H-beta', 0.2); near(r.transitions[2].wavelength, 121.6, 'Lyman alpha', 0.1); assert.equal(r.transitions[2].region, 'uv');
  near(r.transitions[3].energy, 13.6, 'ionization from n = 1', 1e-9); assert.equal(r.transitions[3].type, 'absorption'); assert.equal(r.transitions[3].to, 'inf');
  assert.equal(r.transitions[4].type, 'absorption'); near(r.ionization, 13.6, 'ionization energy', 1e-9); near(r.ionizationJ * 1e18, 2.179, 'in joules', 0.001);
  assert.equal(OF.solve.energyLevels({ cascade: 4 }).lines, 6, 'n(n - 1)/2 lines from n = 4'); assert.equal(OF.solve.energyLevels({ cascade: 5, height: 900 }).lines, 10);
  near(OF.solve.energyLevels({ z: 2, transitions: [{ from: 4, to: 3 }] }).wavelength, 468.8, 'He+ 4 to 3', 0.2);
  near(OF.solve.energyLevels({ levels: [-10.4, -5.5, -4.9, -3.7, -1.6], transitions: [{ from: 2, to: 1 }] }).wavelength, 253.0, 'mercury\'s 4.9 eV line', 0.1);
  assert.equal(OF.solve.energyLevels({ levels: [-5, -2], transitions: [{ from: 2, to: 1 }] }).transitions[0].series, undefined, 'series are hydrogen\'s');
});

test('drawn to scale: each level exactly at its energy, arrows the right way', () => {
  const d = { transitions: [{ from: 3, to: 2 }, { from: 1, to: 3 }] }, { s } = basics(assert, OF, 'energyLevels', d);
  const ys = [...s.matchAll(/<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="[\d.]+" stroke="[^"]+" stroke-width="[\d.]+" stroke-linecap="round" class="of-level"/g)].map(m => Number(m[1]));
  assert.equal(ys.length, 7, 'n = 1 to 6 and n = ∞');
  const k = (ys[0] - ys[6]) / 13.6;
  [-13.6, -3.4, -1.5111, -0.85, -0.544, -0.3778, 0].forEach((e, i) => near(ys[0] - ys[i], (e + 13.6) * k, `level ${i + 1}`, 0.02));
  assert.equal(count(s, /class="of-transition of-emission"/g), 1); assert.equal(count(s, /class="of-transition of-absorption"/g), 1);
  assert.match(s, /stroke-dasharray="6 4"/, 'absorption dashed');
  assert.match(s, />656 nm</); assert.match(s, /#ff0000|#FF0000/i, 'the red line\'s arrow in its color');
  assert.match(OF.svg('energyLevels', { ...d, show: 'both' }), />1\.89 eV</); assert.doesNotMatch(OF.svg('energyLevels', { ...d, show: 'none' }), /nm</);
  assert.match(OF.svg('energyLevels', { transitions: [{ from: 3, to: 2 }], unit: 'J' }), /−2\.18 × 10⁻¹⁸ J/);
  assert.match(OF.svg('energyLevels', { transitions: [{ from: 3, to: 2 }], series: true }), />Balmer</);
});

test('what cannot be drawn is refused; hide, print and the reader\'s words', () => {
  const bad = [[{ transitions: [{ from: 6, to: 5 }] }, /too close/], [{ transitions: [{ from: 2, to: 2 }] }, /itself/], [{ transitions: [{ from: 9, to: 1 }] }, /levels 1 to 6/],
    [{ top: 8 }, /"top"/], [{ z: 7 }, /"z"/], [{ levels: [-1, 2] }, /below 0/], [{ levels: [-3, -3] }, /same energy/], [{ levels: [-3, -1], z: 2 }, /not both/], [{ cascade: 3, transitions: [] }, /not both/],
    [{ cascade: 9 }, /"cascade"/], [{ transitions: [{ from: 1, to: 'inf' }], ionization: false }, /ionization/], [{ levels: [-3, -1], series: true }, /hydrogen-like/], [{ unit: 'kJ' }, /"unit"/], [{ height: 50 }, /"height"/],
    [{ transitions: [{ from: 3, to: 2 }, { from: 3, to: 2 }] }, /twice/], [{ colour: 1 }, /does not take/]];
  for (const [d, why] of bad) { const c = OF.check('energyLevels', d); assert.ok(c.length, JSON.stringify(d)); assert.match(c.join(' '), why, JSON.stringify(d)); assert.match(OF.svg('energyLevels', d), /cannot be drawn/); }
  assert.ok(OF.check('energyLevels', { transitions: [{ from: 5, to: 4 }] }).length, '5 to 4: 8 px apart'); assert.deepEqual(OF.check('energyLevels', { transitions: [{ from: 5, to: 4 }], height: 900 }), [], 'taller: the arrow fits');
  const d = { transitions: [{ from: 3, to: 2 }, { from: 4, to: 2 }] }, p = OF.svg('energyLevels', d, { print: true });
  assert.doesNotMatch(p, /#ff0000/i, 'print: black arrows');
  assert.equal(count(OF.svg('energyLevels', d, { hide: 'values' }), /class="of-blank"/g), 2); assert.doesNotMatch(OF.svg('energyLevels', d, { hide: 'values' }), /656 nm/);
  assert.equal(count(OF.svg('energyLevels', d, { hide: 'levels' }), /class="of-blank"/g), 6); assert.doesNotMatch(OF.svg('energyLevels', d, { hide: 'levels' }), /−3\.4 eV/);
  assert.match(OF.svg('energyLevels', d, { lang: 'de' }), /Energie \(eV\)/); assert.match(OF.svg('energyLevels', { ...d, series: true }, { lang: 'ja' }), /バルマー系列/);
  assert.match(OF.svg('energyLevels', d, { lang: 'fr' }), /−3,4 eV/, 'the reader\'s decimal mark');
});

test('the energyLevels generator: self-test, OF.check, answers from OF.solve, randomized', async () => checkChem2Generator(assert, 'energyLevels'));
