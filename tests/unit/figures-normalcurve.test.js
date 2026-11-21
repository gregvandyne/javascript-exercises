// Oomba Figures 1.1.0: the normal curve (docs/figures-api.md "Data displays"). Shaded areas worked out to calculator
// accuracy; a label that states an area must be the true one.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const N = { mean: 100, sd: 15, regions: [{ from: 130 }] };
test('normalCurve: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'normalCurve', {
    good: [N, { regions: [{ from: -1.96, to: 1.96, label: 0.95 }], form: 'decimal', z: true }, { mean: 50, sd: 10, regions: [{ to: 40 }, { from: 60 }], marks: [55] }],
    bad: [[{ ...N, regions: [{ from: 130, label: '5%' }] }, /labeled/], [{ ...N, regions: [{ from: 130, label: 5 }] }, /region 1 is labeled 5 but it is 2\.275/], [{ mean: 0, sd: 0 }, /"sd"/], [{ ...N, regions: [{ from: 200 }] }, /off the curve/], [{ ...N, regions: [{ from: 120, to: 110 }] }, /past "from"/]],
    key: s => s.regions[0].zFrom,
  });
});
test('normalCurve: areas, z-scores, hide the areas', () => {
  const s = OF.solve.normalCurve({ regions: [{ from: -1, to: 1 }, { from: 1.96 }] });
  assert.ok(Math.abs(s.regions[0].area - 0.682689492) < 1e-8 && Math.abs(s.regions[1].area - 0.024997895) < 1e-8);
  assert.match(OF.svg('normalCurve', N), />2\.28%</); assert.equal(count(OF.svg('normalCurve', N, { hide: 'areas' }), 'of-area'), 0);
  assert.equal(count(OF.svg('normalCurve', { ...N, z: true }), 'of-z'), 7);
});
