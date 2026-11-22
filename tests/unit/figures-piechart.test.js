// Oomba Figures 1.1.0: the pie chart (docs/figures-api.md "Data displays"). Angles worked out from the values; a label
// that states a number must be the slice's value, percent or angle as shown.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const P = { slices: [{ name: 'Walk', value: 100 }, { name: 'Bus', value: 140 }, { name: 'Car', value: 80 }, { name: 'Bike', value: 40 }], show: ['name', 'angle'], dp: 0 };
test('pieChart: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'pieChart', {
    good: [P, { ...P, labels: { Bike: 'x' } }, { slices: [{ name: 'A', value: 3 }, { name: 'B', value: 1 }], show: ['percent', 'fraction'], key: true }],
    bad: [[{ ...P, labels: { Bike: 45 } }, /Bike is labeled 45, but its angle is 40/], [{ ...P, labels: { Bike: '45°' } }, /Bike is labeled 45°/], [{ ...P, show: ['percent'], labels: { Bike: '20%' } }, /percent is 11\.11/], [{ slices: [{ name: 'A', value: 0 }] }, /value above 0/], [{ ...P, show: 'colour' }, /"show"/], [{ ...P, labels: { Boat: 'x' } }, /not one of the slices/]],
    key: s => s.slices[0].angle,
  });
});
test('pieChart: the angles add to 360, percents and fractions; hide a label', () => {
  const s = OF.solve.pieChart(P); assert.deepEqual(s.slices.map(x => x.angle), [100, 140, 80, 40]); assert.deepEqual(s.slices[3].fraction, [1, 9]);
  const f = OF.svg('pieChart', P); assert.deepEqual([...f.matchAll(/data-angle="([\d.]+)"/g)].map(m => +m[1]), [100, 140, 80, 40]);
  assert.match(f, />100°</); assert.equal(count(f, 'of-slice'), 4);
  assert.doesNotMatch(OF.svg('pieChart', P, { hide: 'Bike' }), />40°</);
  assert.match(OF.svg('pieChart', P, { print: true }), /url\(#of-pieChart-/, 'patterns in print');
});
