// The 1.2.0 energy figures (docs/figures-api.md "Chemistry (1.2.0)"): a heating or cooling curve with every segment to
// scale from q = m c ΔT and q = n ΔH, its plateaus exactly at the melting and boiling points; and a potential energy
// diagram whose peaks and dips are exactly the levels' energies, with Ea, ΔH and a catalyst worked out from them.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkWords, PRINT_OK } from './_physics-gens.js';
import { checkChemGenerator } from './_chem-gens.js';
const OF = globalThis.OombaFigures;
const curve = (s, cls) => [...new RegExp(`<polyline points="([^"]+)"[^>]*class="${cls}"`).exec(s)[1].split(' ')].map(p => p.split(',').map(Number));

test('heating curve: each segment\'s heat is m c ΔT or n ΔH, laid end to end; time is heat over the rate', () => {
  const s = OF.solve.heatingCurve({ substance: 'water', mass: 100 });
  assert.deepEqual(s.segments.map(x => x.state), ['solid', 'melt', 'liquid', 'boil', 'gas']);
  const want = [100 * 2.09 * 20 / 1000, 100 / 18.02 * 6.01, 100 * 4.18 * 100 / 1000, 100 / 18.02 * 40.67, 100 * 1.86 * 20 / 1000];
  s.segments.forEach((x, i) => assert.ok(Math.abs(x.heat - want[i]) < 1e-9, x.state));
  assert.ok(Math.abs(s.boil / s.melt - 40.67 / 6.01) < 1e-9, 'the boiling plateau is 6.8 times the melting one');
  assert.ok(Math.abs(s.time - s.heat / 10) < 1e-9); assert.equal(s.direction, 'heating');
  const c = OF.solve.heatingCurve({ substance: 'water', from: 120, to: -20 });
  assert.deepEqual(c.segments.map(x => x.state), ['gas', 'boil', 'liquid', 'melt', 'solid']); assert.equal(c.direction, 'cooling');
  // drawn: the plateaus are flat at exactly mp and bp, their lengths in proportion
  const pts = curve(OF.svg('heatingCurve', { substance: 'water', x: 'heat' }), 'of-curve');
  const flat = pts.slice(1).map((p, i) => [pts[i], p]).filter(([a, b]) => Math.abs(a[1] - b[1]) < 1e-9 && b[0] > a[0]);
  assert.equal(flat.length, 2);
  assert.ok(Math.abs((flat[1][1][0] - flat[1][0][0]) / (flat[0][1][0] - flat[0][0][0]) - 40.67 / 6.01) < 0.01);
  // supercooling dips below the freezing point by exactly that much, then warms back to it
  const sc = curve(OF.svg('heatingCurve', { substance: 'water', from: 120, to: -20, supercool: 8 }), 'of-curve'), ys = sc.map(p => p[1]);
  const plain = curve(OF.svg('heatingCurve', { substance: 'water', from: 120, to: -20 }), 'of-curve');
  assert.equal(sc.length, plain.length + 2);
  const yOf0 = plain[3][1], yOf8 = sc[4][1], per = (plain[3][1] - plain[2][1]) / 100;
  assert.ok(Math.abs((yOf8 - yOf0) - 8 * per) < 0.02, 'the dip is 8 °C below 0 °C');
  assert.ok(ys.length > 0);
});
test('heating curve: refused when it cannot be drawn truthfully', () => {
  const bad = [[{ substance: 'water', from: 50, to: 50 }, /must differ/], [{ substance: 'lava' }, /must be one of/], [{ substance: 'water', mp: 10 }, /not both/],
    [{ mp: 50, bp: 40, cSolid: 1, cLiquid: 1, cGas: 1, fusH: 1, vapH: 1, molarMass: 10, from: 0, to: 100 }, /above the melting point/],
    [{ substance: 'water', supercool: 5 }, /cooling curve that freezes/], [{ substance: 'water', from: 120, to: -20, supercool: 30 }, /at most 20/],
    [{ substance: 'water', x: 'heat', rate: 5 }, /goes with "x": "time"/], [{ substance: 'water', from: -300, to: 20 }, /above absolute zero/]];
  for (const [d, re] of bad) { assert.match(OF.check('heatingCurve', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('heatingCurve', d), /cannot be drawn/); }
  assert.deepEqual(OF.check('heatingCurve', { mp: 40, bp: 120, cSolid: 1.5, cLiquid: 3, cGas: 1, fusH: 10, vapH: 30, molarMass: 100, from: 0, to: 160 }), [], 'your own substance');
});
test('potential energy diagram: the peaks and dips are exactly the levels, Ea and ΔH from them, a catalyst lowers Ea only', () => {
  const d = { levels: [50, 150, 20] }, s = OF.solve.energyProfile(d);
  assert.deepEqual([s.dH, s.ea, s.eaReverse, s.exothermic, s.rateStep], [-30, 100, 130, true, null]);
  const two = OF.solve.energyProfile({ levels: [40, 120, 70, 100, 10] });
  assert.deepEqual(two.steps, [{ ea: 80, eaReverse: 50 }, { ea: 30, eaReverse: 90 }]); assert.equal(two.rateStep, 0); assert.equal(two.eaOverall, 80);
  const cat = OF.solve.energyProfile({ levels: [50, 150, 20], catalyst: 100 });
  assert.deepEqual([cat.dH, cat.catEa, cat.catEaReverse, cat.lowered], [-30, 50, 80, 50]);
  // the drawn curve's top is the transition state, its ends the reactants and products, on the energy axis's scale
  const svg = OF.svg('energyProfile', d), pts = curve(svg, 'of-curve'), ys = pts.map(p => p[1]);
  const Y = e => 30 + 280 - ((e - 0) / (175 - 0)) * 280;
  assert.ok(Math.abs(Math.min(...ys) - Y(150)) < 0.02); assert.ok(Math.abs(pts[0][1] - Y(50)) < 0.02); assert.ok(Math.abs(pts[pts.length - 1][1] - Y(20)) < 0.02);
  assert.match(svg, />E<tspan[^>]*>a<\/tspan> = 100 kJ\/mol</); assert.match(svg, />ΔH = −30 kJ\/mol</);
  const cs = curve(OF.svg('energyProfile', { levels: [50, 150, 20], catalyst: 100 }), 'of-catalyzed');
  assert.ok(Math.abs(Math.min(...cs.map(p => p[1])) - Y(100)) < 0.02, 'the catalyzed peak is at 100');
  assert.doesNotMatch(OF.svg('energyProfile', d, { hide: 'values' }), /= 100 kJ/); assert.doesNotMatch(OF.svg('energyProfile', d, { hide: true }), /ΔH/);
  assert.doesNotMatch(OF.svg('energyProfile', { levels: [20, 150, 80], style: 'levels' }), /of-curve/);
});
test('potential energy diagram: refused when it cannot be drawn truthfully', () => {
  const bad = [[{ levels: [50, 150] }, /3, 5 or 7/], [{ levels: [50, 40, 20] }, /transition state: it must be above/], [{ levels: [50, 150, 20], catalyst: 160 }, /below the highest transition state/],
    [{ levels: [50, 150, 20], catalyst: 40 }, /above the reactants and the products/], [{ levels: [50, 150, 20], arrows: ['catEa'] }, /needs a "catalyst"/], [{ levels: [50, 150, 20], style: 'levels', arrows: ['ea'] }, /ΔH only/]];
  for (const [d, re] of bad) { assert.match(OF.check('energyProfile', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('energyProfile', d), /cannot be drawn/); }
});
test('print, languages, words and generators', async () => {
  for (const [k, d] of [['heatingCurve', { substance: 'water', from: 120, to: -20, supercool: 8 }], ['energyProfile', { levels: [50, 150, 20], catalyst: 100, arrows: ['ea', 'dh', 'eaReverse', 'catEa'] }]]) {
    assert.ok(PRINT_OK(OF.svg(k, d, { print: true })), k);
    for (const l of ['de', 'fr', 'ja', 'he', 'ar', 'ru']) assert.doesNotMatch(OF.svg(k, d, { lang: l }), /NaN|undefined/, `${k} ${l}`);
  }
  assert.match(OF.svg('heatingCurve', { substance: 'water' }, { hide: 'states' }), /________/); assert.match(OF.svg('heatingCurve', { substance: 'water' }, { hide: 'points' }), /_____ °C/);
  await checkWords(assert, ['heatingCurve', 'coolingCurve', 'heatAdded', 'heatRemoved', 'temperature', 'solid', 'liquid', 'gas', 'melting', 'boiling', 'freezing', 'condensing', 'energyProfile', 'reactionCoordinate', 'potentialEnergy', 'reactants', 'products', 'catalyzed', 'uncatalyzed', 'reverse']);
  for (const g of ['heatingCurve', 'energyProfile']) await checkChemGenerator(assert, g);
});
