// Oomba Figures 1.1.0: the scatter plot (docs/figures-api.md "Data displays"). The least-squares line and r, as a
// calculator works them out, never drawn by eye.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const S = { points: [[1, 52], [2, 58], [2, 61], [3, 65], [4, 70], [4, 66], [5, 75], [6, 78], [7, 85], [8, 88]], x: [0, 10], y: [40, 100], fit: true, equation: true, r: true };
test('scatterPlot: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'scatterPlot', {
    good: [{ points: [[1, 2], [2, 3], [3, 5]] }, S],
    bad: [[{ points: [[1, 2], [1, 5]], fit: true }, /different x values/], [{ ...S, x: [2, 10] }, /widen it/], [{ points: [[1, 2]], equation: true }, /it needs "fit": true/], [{ points: [] }, /1 to 100 points/]],
    key: s => s.fit.slope,
  });
});
test('scatterPlot: the fit, its equation and r; hide the line', () => {
  const s = OF.solve.scatterPlot(S); assert.ok(Math.abs(s.fit.slope - 5.0294) < 1e-3 && Math.abs(s.fit.intercept - 48.676) < 1e-3 && Math.abs(s.r - 0.9904) < 1e-3);
  const f = OF.svg('scatterPlot', S); assert.equal(count(f, 'of-point'), 10); assert.equal(count(f, 'of-fit'), 1); assert.match(f, />5\.03</); assert.match(f, />0\.99</);
  assert.equal(count(OF.svg('scatterPlot', S, { hide: 'fit' }), 'of-fit'), 0);
});
