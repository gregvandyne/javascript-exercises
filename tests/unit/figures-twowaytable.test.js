// Oomba Figures 1.1.0: the two-way table (docs/figures-api.md "Probability and tables"). Totals are sums; relative
// frequencies over the total, a row's total or a column's.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const W = { columns: ['Walk', 'Bus', 'Car'], rows: ['Grade 7', 'Grade 8'], counts: [[12, 18, 10], [8, 22, 14]] };
test('twoWayTable: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'twoWayTable', {
    good: [W, { ...W, show: 'row', form: 'percent' }, { ...W, show: 'joint', form: 'fraction', blanks: [[0, 1]], labels: { '1,3': 'x' } }],
    bad: [[{ ...W, counts: [[1, 2]] }, /2 rows of 3/], [{ ...W, labels: { '2,3': 80 } }, /labeled 80 but it is 84/], [{ ...W, blanks: [[5, 0]] }, /"blanks"/], [{ ...W, show: 'cells' }, /"show"/]],
    key: s => s.columnTotals[0],
  });
});
test('twoWayTable: totals, relative frequencies, blanks', () => {
  const s = OF.solve.twoWayTable(W); assert.deepEqual(s.rowTotals, [40, 44]); assert.deepEqual(s.columnTotals, [20, 40, 24]); assert.equal(s.total, 84); assert.equal(s.row[0][0], 0.3);
  const f = OF.svg('twoWayTable', W); assert.equal(count(f, 'of-cell'), 12); assert.match(f, />Total</);
  assert.equal(count(OF.svg('twoWayTable', W, { hide: '2,3' }), 'of-cell'), 11); assert.match(OF.svg('twoWayTable', { ...W, show: 'row', form: 'percent' }), />30%</);
});
