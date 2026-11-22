// Oomba Figures 1.1.0: the histogram (docs/figures-api.md "Data displays"). Bars touch; unequal bins are drawn as
// frequency density, so each bar's area is its frequency.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const EQ = { bins: [[0, 10], [10, 20], [20, 30]], counts: [4, 9, 6], polygon: true };
const UN = { bins: [[0, 10], [10, 15], [15, 20], [20, 30], [30, 50]], counts: [8, 10, 14, 12, 6] };
const bars = s => [...s.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"[^>]*class="of-bar"/g)].map(m => m.slice(1).map(Number));
test('histogram: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'histogram', {
    good: [EQ, UN, { data: [3, 7, 12, 15, 19, 22, 29, 30], bins: [[0, 10], [10, 20], [20, 30]] }],
    bad: [[{ bins: [[0, 10], [12, 20]], counts: [1, 2] }, /must start where bin 1 ends/], [{ ...UN, density: false }, /must be drawn as frequency density/],
      [{ bins: [[0, 10], [10, 20]], counts: [1, 2], data: [1, 2, 3] }, /is given 1 but the data has 3/], [{ bins: [[0, 10]], data: [12] }, /in none of the bins/], [{ bins: [[0, 10]] }, /needs "counts"/]],
    key: s => s.densities[2],
  });
});
test('histogram: areas are frequencies, the density axis, hide a bar or the scale', () => {
  const b = bars(OF.svg('histogram', UN)), area = b.map(r => r[2] * r[3]);
  UN.counts.forEach((c, i) => assert.ok(Math.abs(area[i] / area[0] - c / UN.counts[0]) < 0.01, `bar ${i}`));
  assert.match(OF.svg('histogram', UN), />Frequency density</); assert.match(OF.svg('histogram', EQ), />Frequency</);
  assert.equal(bars(OF.svg('histogram', UN, { hide: 'bin3' })).length, 4);
  assert.ok(count(OF.svg('histogram', UN, { hide: 'scale' }), 'of-num') < count(OF.svg('histogram', UN), 'of-num'), 'no numbers up the density axis');
  assert.equal(count(OF.svg('histogram', EQ), 'of-polygon'), 1);
  const s = OF.solve.histogram(UN); assert.deepEqual(s.densities, [0.8, 2, 2.8, 1.2, 0.3]); assert.deepEqual(s.modalClass, [15, 20]); assert.equal(s.n, 50);
});
