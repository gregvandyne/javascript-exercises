// Oomba Figures 1.1.0: the table of values (docs/figures-api.md "Probability and tables"). Worked out from a rule in x
// (the formula language, in degrees or radians), or pairs that must follow it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const T = { rule: '2*x + 1', from: -2, to: 3 };
test('tableOfValues: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'tableOfValues', {
    good: [T, { pairs: [[1, 4], [2, 7], [3, 10]], names: ['Figure number', 'Tiles'], direction: 'columns' }, { rule: 'x/2 + 1', x: [[1, 2], 1, [3, 2]] }, { rule: 'sin(x)', x: [0, 1], angles: 'radians' }],
    bad: [[{ rule: '2*x + 1', pairs: [[1, 3], [2, 6]] }, /\(2, 6\) does not follow the rule: at x = 2 it gives 5/], [{ rule: '2**x' }, /"rule"/], [{ rule: 'x', from: 0, to: 30 }, /1 to 12 values/], [{ rule: '1/x', x: [0] }, /no value at x = 0/], [{ ...T, angles: 'grads' }, /"angles"/]],
    key: s => s.pairs[4][1],
  });
});
test('tableOfValues: values, blanks, differences, radians', () => {
  const s = OF.solve.tableOfValues(T); assert.deepEqual(s.pairs.map(p => p[1]), [-3, -1, 1, 3, 5, 7]); assert.equal(s.slope, 2); assert.equal(s.intercept, 1);
  assert.equal(OF.solve.tableOfValues({ rule: 'x^2', from: -2, to: 2 }).linear, false); assert.deepEqual(OF.solve.tableOfValues({ rule: 'x^2', from: -2, to: 2 }).second, [2, 2, 2]);
  assert.equal(count(OF.svg('tableOfValues', { ...T, blanks: [3, 4] }), 'of-cell'), 10); assert.equal(count(OF.svg('tableOfValues', T, { hide: 'y' }), 'of-cell'), 6);
  assert.ok(Math.abs(OF.solve.tableOfValues({ rule: 'sin(x)', x: [Math.PI / 2], angles: 'radians' }).pairs[0][1] - 1) < 1e-9);
  assert.equal(OF.solve.tableOfValues({ rule: 'sin(x)', x: [90] }).pairs[0][1], 1, 'degrees by default');
  assert.match(OF.svg('tableOfValues', { rule: 'x/2', x: [[1, 2]] }), />4<\/text>/, 'fractions in, fractions out: 1/4');
});
