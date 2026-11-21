// Oomba Figures 1.1.0: the dot plot (docs/figures-api.md "Data displays"). One mark per value, stacked over its tick.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const D = { data: [7, 8, 8, 9, 6, 7, 8, 10], xtitle: 'Hours' };
test('dotPlot: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'dotPlot', {
    good: [D, { counts: [[1, 3], [2, 5], [4, 1]], mark: 'x' }, { counts: [[[1, 8], 2], [[3, 8], 1]], from: 0, to: 1, step: [1, 8] }],
    bad: [[{ data: [1, 2.5], step: 1 }, /2.5 is not on a tick/], [{ data: [1, 2], counts: [[1, 1]] }, /not both/], [{ data: [1, 20], from: 0, to: 10 }, /widen it/], [{ counts: [[1, 1.5]] }, /whole counts/]],
    key: s => s.range,
  });
});
test('dotPlot: as many marks as values, the statistics, hide', () => {
  assert.equal(count(OF.svg('dotPlot', D), 'of-mark'), 8); assert.equal(count(OF.svg('dotPlot', D, { hide: true }), 'of-mark'), 0);
  const s = OF.solve.dotPlot(D); assert.equal(s.median, 8); assert.deepEqual(s.mode, [8]); assert.equal(s.range, 4); assert.equal(s.mean, 7.875);
  assert.match(OF.svg('dotPlot', { counts: [[[1, 8], 2]], from: 0, to: 1, step: [1, 8] }), />1\/8</, 'fractions on the line');
});
