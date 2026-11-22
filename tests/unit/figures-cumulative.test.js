// Oomba Figures 1.1.0: cumulative frequency (docs/figures-api.md "Data displays"). Points at each bin's end, a smooth
// curve that never overshoots (or straight lines), and the median and quartiles read off the curve as drawn.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const C = { bins: [[0, 10], [10, 20], [20, 30], [30, 40], [40, 50], [50, 60]], counts: [4, 10, 18, 24, 10, 4], readings: ['median', 'q1', 'q3'] };
test('cumulativeFrequency: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'cumulativeFrequency', {
    good: [C, { ...C, join: 'lines', at: [35], percent: true }, { bins: [[0, 10], [10, 20]], cumulative: [3, 8] }],
    bad: [[{ bins: [[0, 10], [10, 20]], cumulative: [5, 3] }, /never go down/], [{ ...C, readings: ['mode'] }, /"readings"/], [{ ...C, at: [70] }, /"at"/], [{ bins: [[0, 10]], cumulative: [2], counts: [2] }, /not both/]],
    key: s => s.cumulative[2],
  });
});
test('cumulativeFrequency: running totals, readings off the lines exactly, hide the curve', () => {
  const s = OF.solve.cumulativeFrequency({ ...C, join: 'lines' });
  assert.deepEqual(s.cumulative, [4, 14, 32, 56, 66, 70]); assert.ok(Math.abs(s.median - (30 + (10 * (35 - 32)) / 24)) < 1e-9 && Math.abs(s.q1 - (20 + (10 * (17.5 - 14)) / 18)) < 1e-9);
  const c = OF.solve.cumulativeFrequency(C); assert.ok(c.median > 30 && c.median < 32, 'the curve passes 35 just after 30');
  assert.equal(count(OF.svg('cumulativeFrequency', C), 'of-reading'), 3); assert.equal(count(OF.svg('cumulativeFrequency', C, { hide: 'curve' }), 'of-curve'), 0);
  assert.equal(count(OF.svg('cumulativeFrequency', C, { hide: 'readings' }), 'of-reading-value'), 0);
});
