// The 1.3.0 biology graphs (docs/figures-api.md "Biology (1.3.0)"): population growth from N0, r and K (the logistic
// curve's inflection at K/2 and fastest growth rK/4, exponential doubling ln 2 / r), predator-prey cycles that close
// with the period asked for, enzyme activity (optimum, denaturing, Michaelis-Menten with inhibitors) and photosynthesis
// with its limiting factors; data that cannot be drawn truthfully is refused; print is grays and dashes; hide leaves the
// answer out; the words are in the reader's language; and each kind's generator passes the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkBioGenerator } from './_bio-gens.js';
const OF = globalThis.OombaFigures;

test('population growth: the numbers are the model\'s, the K line and the inflection point where they belong', () => {
  const d = { model: 'logistic', n0: 20, r: 0.5, k: 1000, span: 20, inflection: true };
  const { s } = basics(assert, OF, 'populationGrowth', d), r = OF.solve.populationGrowth(d);
  assert.equal(r.k, 1000); assert.equal(r.maxRate, 125); assert.equal(r.inflection.n, 500);
  assert.ok(Math.abs(r.inflection.t - Math.log(980 / 20) / 0.5) < 1e-9, 'N = K/2 at t = ln((K - N0)/N0) / r');
  assert.ok(Math.abs(r.final - 1000 / (1 + 49 * Math.exp(-10))) < 1e-6);
  assert.match(s, /K = 1000/); assert.equal(count(s, /class="of-inflection"/g), 1);
  const e = OF.solve.populationGrowth({ model: 'exponential', n0: 100, r: Math.LN2, span: 10 });
  assert.ok(Math.abs(e.final - 102400) < 1e-6); assert.ok(Math.abs(e.doubling - 1) < 1e-12);
  const c = OF.solve.populationGrowth({ model: 'crash', n0: 30, r: 0.5, k: 6000, span: 30 });
  assert.ok(Math.abs(c.peak - 6000) < 10, `a crash peaks at the k asked for (${c.peak})`);
  const o = OF.solve.populationGrowth({ model: 'overshoot', n0: 20, r: 0.6, k: 1000, lag: 2, span: 40 });
  assert.ok(o.peak > 1000, 'an overshoot passes K'); assert.ok(Math.abs(o.final - 1000) < 60, 'and settles near it (r lag below pi/2)');
  // a census: the same counts for the same seed, the first count is N0
  const cs = { model: 'exponential', n0: 100, r: 0.5, span: 8, census: { every: 1, noise: 5, seed: 9 } };
  assert.deepEqual(OF.solve.populationGrowth(cs).census, OF.solve.populationGrowth(cs).census); assert.equal(OF.solve.populationGrowth(cs).census[0].n, 100);
  assert.equal(count(OF.svg('populationGrowth', cs), /class="of-census"/g), 9);
  for (const p of [{ model: 'both', n0: 10, r: 0.5, k: 1000 }, { model: 'logistic', n0: 10, r: 0.5, k: 1000, graph: 'perCapita', against: 'size' }, { model: 'logistic', n0: 10, r: 0.54, k: 665, span: 18, phases: true }]) basics(assert, OF, 'populationGrowth', p);
});

test('population growth: what cannot be drawn is refused, and hide leaves K or the curve out', () => {
  const bad = [{ model: 'logistic', n0: 0, r: 0.5, k: 100 }, { model: 'logistic', n0: 10, r: -1, k: 100 }, { model: 'crash', n0: 100, r: 0.5, k: 50 }, { model: 'exponential', n0: 10, r: 2, span: 100 },
    { model: 'logistic', n0: 600, r: 0.5, k: 1000, inflection: true }, { model: 'overshoot', n0: 10, r: 0.5, k: 100, against: 'size', graph: 'rate' }, { model: 'exponential', n0: 10, r: 0.5, k: 100 }, { model: 'logistic', n0: 10, r: 0.5, k: 100, colour: 'red' }];
  for (const d of bad) { assert.ok(OF.check('populationGrowth', d).length, JSON.stringify(d)); assert.match(OF.svg('populationGrowth', d), /cannot be drawn/); }
  const d = { model: 'logistic', n0: 20, r: 0.5, k: 1000 };
  assert.doesNotMatch(OF.svg('populationGrowth', d, { hide: 'k' }), /K = 1000/);
  assert.equal(count(OF.svg('populationGrowth', d, { hide: 'curve' }), /class="of-curve/g), 0);
  assert.match(OF.svg('populationGrowth', d, { lang: 'de' }), /Populationsgröße/); assert.match(OF.svg('populationGrowth', d, { lang: 'he' }), /גודל האוכלוסייה/);
});

test('predator and prey: the cycle takes the period asked for, the predators peak after the prey, and the lows and highs are exact', () => {
  for (const [p, d] of [[10, { pair: 'hare-lynx' }], [6, { prey: { average: 400, start: 200 }, predators: { average: 40, start: 30 }, period: 6, scale: 'two', peaks: true }]]) {
    const { s } = basics(assert, OF, 'predatorPrey', d), r = OF.solve.predatorPrey(d);
    assert.ok(Math.abs(r.period - p) < 0.01, `period ${r.period}`);
    assert.ok(r.lag > 0 && r.lag < p / 2, 'the predators peak a little after the prey');
    assert.ok(r.prey.low < r.prey.average && r.prey.average < r.prey.high);
    assert.equal(count(s, /class="of-curve/g), 2);
  }
  assert.match(OF.svg('predatorPrey', { pair: 'hare-lynx' }, { print: true }), /stroke-dasharray="9 6"[^>]*class="of-curve of-predators"/, 'in print the predators are dashed');
  assert.equal(count(OF.svg('predatorPrey', { pair: 'hare-lynx' }, { hide: 'predators' }), /class="of-curve/g), 1);
  for (const d of [{ pair: 'dragon-knight' }, { prey: { average: 50, start: 50 }, predators: { average: 20, start: 20 }, period: 10 }, { pair: 'hare-lynx', span: 1000 }, { prey: { average: -5, start: 2 }, predators: { average: 2, start: 1 }, period: 3 }]) assert.ok(OF.check('predatorPrey', d).length, JSON.stringify(d));
  assert.match(OF.svg('predatorPrey', { pair: 'hare-lynx' }, { lang: 'fr' }), /Proies/);
});

test('enzyme activity: the optimum is at the top, the enzyme denatures past it, and an inhibitor changes Km or Vmax', () => {
  const t = { graph: 'temperature', curves: [{ enzyme: 'human' }, { enzyme: 'taq' }], axes: 'numbered', marks: true };
  basics(assert, OF, 'enzymeActivity', t);
  const r = OF.solve.enzymeActivity(t);
  assert.equal(r.optimum, 37); assert.equal(r.curves[1].optimum, 75); assert.ok(r.denatured > 37 && r.denatured < 60);
  const s = OF.solve.enzymeActivity({ graph: 'substrate', curves: [{ km: 2 }, { km: 2, inhibitor: 'competitive', strength: 3 }, { km: 2, inhibitor: 'noncompetitive', strength: 2 }] });
  assert.deepEqual(s.curves.map(c => [c.vmax, c.km]), [[10, 2], [10, 6], [5, 2]]);
  assert.deepEqual(OF.solve.enzymeActivity({ graph: 'pH', curves: [{ enzyme: 'pepsin' }] }).optimum, 2);
  basics(assert, OF, 'enzymeActivity', { graph: 'pH', curves: [{ enzyme: 'pepsin' }, { enzyme: 'trypsin' }] });
  for (const d of [{ graph: 'speed' }, { curves: [{ enzyme: 'lipase' }] }, { graph: 'pH', curves: [{ opt: 20, width: 2 }] }, { graph: 'substrate', curves: [{ enzyme: 'human' }] }, { curves: [{ opt: 90, width: 10 }], marks: true, x: [0, 50] }, { curves: [1, 2, 3, 4] }]) assert.ok(OF.check('enzymeActivity', d).length, JSON.stringify(d));
  assert.doesNotMatch(OF.svg('enzymeActivity', t, { hide: 'marks' }), /of-mark/);
  assert.match(OF.svg('enzymeActivity', t), /Optimum 37 °C/); assert.match(OF.svg('enzymeActivity', t, { lang: 'ja' }), /反応速度/);
});

test('photosynthesis: light limits the rise, CO₂ and temperature set the plateau, and net rate is below 0 in the dark', () => {
  const d = { graph: 'light', curves: [{ co2: 0.1, temp: 30 }, { co2: 0.04, temp: 30 }], axes: 'numbered' };
  basics(assert, OF, 'photosynthesis', d);
  const r = OF.solve.photosynthesis(d);
  assert.ok(Math.abs(r.curves[0].plateau - 12.5) < 1e-9 && Math.abs(r.curves[1].plateau - 25 * 0.04 / 0.14) < 1e-9, 'the plateau is Amax c / (Kc + c) at the best temperature');
  assert.ok(r.curves[1].saturation < r.curves[0].saturation, 'less CO₂ levels off sooner');
  const n = OF.solve.photosynthesis({ graph: 'light', net: true, curves: [{ co2: 0.04, temp: 25 }] });
  assert.ok(n.compensation > 0 && Number.isFinite(n.compensation));
  const tmp = OF.solve.photosynthesis({ graph: 'temperature', curves: [{ light: 80, co2: 0.1 }] });
  assert.equal(tmp.optimum, 30);
  for (const p of [{ graph: 'co2', curves: [{ light: 60, temp: 25 }, { light: 30, temp: 25 }] }, { graph: 'light', lightAxis: 'distance', curves: [{ co2: 0.1, temp: 20 }] }]) basics(assert, OF, 'photosynthesis', p);
  for (const b of [{ graph: 'water' }, { graph: 'light', curves: [{ light: 50, co2: 0.1, temp: 25 }] }, { graph: 'co2', curves: [{ light: 60 }] }, { graph: 'light', curves: [{ co2: 9, temp: 25 }] }, { graph: 'co2', lightAxis: 'distance', curves: [{ light: 60, temp: 25 }] }]) assert.ok(OF.check('photosynthesis', b).length, JSON.stringify(b));
  assert.match(OF.svg('photosynthesis', d, { lang: 'es' }), /Velocidad de la fotosíntesis/);
});

for (const g of ['populationGrowth', 'predatorPrey', 'enzymeActivity', 'photosynthesis']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkBioGenerator(assert, g));
