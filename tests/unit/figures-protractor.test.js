// Oomba Figures 1.1.0: reading a protractor (docs/figures-api.md "The protractor"). Inner and outer scales, rays at
// their true directions, so the reading is true by construction; hide "reading" for the student.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const rays = s => [...s.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*class="of-ray"/g)].map(m => { const [a, b, c, d] = m.slice(1).map(Number); return ((Math.atan2(b - d, c - a) * 180) / Math.PI + 360) % 360; });
test('protractor: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'protractor', {
    good: [{ angle: 50, reading: true }, { angle: 125, base: 'left', names: ['A', 'B', 'C'] }, { angle: 35, start: 20 }, { angle: 180 }],
    bad: [[{ angle: 50.5 }, /whole number of degrees/], [{ angle: 0 }, /from 1 to 180/], [{ angle: 100, start: 90 }, /from 0 to 80/], [{ angle: 40, base: 'up' }, /"base"/], [{ angle: 40, names: ['A'] }, /three names/]],
    key: s => s.angle,
  });
});
test('protractor: the rays are where the scales say, both scales numbered, hide the reading', () => {
  const a = rays(OF.svg('protractor', { angle: 50 })); assert.ok(Math.abs(a[0] - 0) < 0.05 && Math.abs(a[1] - 50) < 0.05);
  const b = rays(OF.svg('protractor', { angle: 125, base: 'left' })); assert.ok(Math.abs(b[0] - 180) < 0.05 && Math.abs(b[1] - 55) < 0.05, 'the outer scale reads 125 there');
  const f = OF.svg('protractor', { angle: 50, reading: true });
  assert.equal(count(f, 'of-inner'), 19); assert.equal(count(f, 'of-outer'), 19); assert.match(f, /class="of-reading"/);
  assert.doesNotMatch(OF.svg('protractor', { angle: 50, reading: true }, { hide: 'reading' }), /of-reading/);
  assert.deepEqual(OF.solve.protractor({ angle: 125, base: 'left' }), { angle: 125, kind: 'obtuse', rays: [{ inner: 180, outer: 0 }, { inner: 55, outer: 125 }], scale: 'outer', reading: 125 });
  assert.deepEqual(OF.solve.protractor({ angle: 35, start: 20 }).rays, [{ inner: 20, outer: 160 }, { inner: 55, outer: 125 }]);
});
