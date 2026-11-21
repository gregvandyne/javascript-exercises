// Oomba Figures 1.1.0: box plots (docs/figures-api.md "Data displays"). The five-number summary from the data (the
// TI-84 way), outliers past 1.5 IQR, one or several on one axis; a summary given with the data must agree.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const OUT = { data: [2, 20, 22, 24, 25, 28, 30, 30, 32, 35, 38, 40, 75], outliers: true, from: 0, to: 80, step: 10 };
const TWO = { plots: [{ name: 'A', summary: [45, 58, 66, 74, 92] }, { name: 'B', data: [40, 52, 55, 60, 64, 70, 85] }], values: true };
test('boxPlot: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'boxPlot', {
    good: [{ summary: [10, 18, 25, 31, 40] }, OUT, TWO],
    bad: [[{ data: [1, 2, 3, 4, 5, 6, 7], summary: [1, 3, 4, 5, 7] }, /gives Q1 as 3 but the data's is 2/], [{ summary: [5, 4, 3, 2, 1] }, /smallest first/],
      [{ summary: [1, 2, 3, 4, 5], outliers: true }, /needs "data"/], [{ data: [1, 2], plots: [] }, /not both/], [{ summary: [1, 2, 3, 4, 50], to: 20 }, /widen it/]],
    key: s => s.iqr,
  });
});
test('boxPlot: quartiles the TI-84 way, outliers, hide one value', () => {
  const s = OF.solve.boxPlot(OUT);
  assert.deepEqual([s.min, s.q1, s.median, s.q3, s.max], [2, 23, 30, 36.5, 75]); assert.deepEqual(s.outliers, [2, 75]); assert.deepEqual(s.whiskers, [20, 40]);
  assert.equal(count(OF.svg('boxPlot', OUT), 'of-outlier'), 2);
  const t = OF.solve.boxPlot(TWO); assert.equal(t.plots[1].median, 60); assert.equal(t.plots[1].q1, 52); assert.equal(t.plots[1].q3, 70);
  assert.match(OF.svg('boxPlot', TWO), /class="of-value of-median"/); assert.doesNotMatch(OF.svg('boxPlot', TWO, { hide: 'median' }), /of-median/);
});
