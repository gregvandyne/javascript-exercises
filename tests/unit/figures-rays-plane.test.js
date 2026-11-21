// The plane mirror (docs/figures-api.md "The plane mirror"): the rays extension. The image is as far behind the mirror
// as the object is in front, the same size, virtual; each ray reflects at the angle it arrived at, drawn to one scale.
// Ray diagrams without it draw exactly as in 1.0.0.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;

test('the lenses and curved mirrors draw byte for byte what 1.0.0 drew', () => {
  const F = figuresKit('1.0.0');
  for (const type of ['convex-lens', 'concave-lens', 'concave-mirror', 'convex-mirror']) for (const [f, u] of [[10, 25], [10, 6], [8, 16]]) for (const o of [{}, { print: true }, { hide: 'image' }, { hide: true }, { lang: 'he' }]) {
    const d = { type, f, u, h: 3, rays: [1, 2, 3] };
    assert.equal(OF.svg('rays', d, o), F.svg('rays', d, o), JSON.stringify([d, o]));
  }
});
test('the plane mirror: image distance equals object distance, upright, same size, virtual; the law of reflection', () => {
  assert.deepEqual({ ...OF.solve.rays({ type: 'plane-mirror', u: 12, h: 5 }), f: 0 }, { f: 0, v: -12, m: 1, hi: 5, h: 5, real: false, mirror: true, plane: true, x: 12 });
  const svg = OF.svg('rays', { type: 'plane-mirror', u: 10, h: 6 });
  // each dashed back-extension runs from where its ray meets the mirror to the image's tip
  const ext = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"[^>]*class="of-extension"/g)].map(m => m.slice(1).map(Number));
  assert.equal(ext.length, 2);
  const img = /<g><line x1="([\d.]+)" y1="([\d.]+)"[^>]*stroke-dasharray="6 4"\/><polygon points="([\d.]+),([\d.]+)/.exec(svg).slice(1).map(Number);
  for (const e of ext) assert.ok(Math.abs(e[2] - img[2]) < 0.02 && Math.abs(e[3] - img[3]) < 0.02, 'to the image tip');
  // the mirror is half way between the object and the image (the image as far behind as the object in front)
  const obj = /<g><line x1="([\d.]+)"[^>]*stroke="#1F9D63"/.exec(svg)[1], mirror = /<line x1="([\d.]+)"[^>]*stroke="#2A78B0" stroke-width="3.5"/.exec(svg)[1];
  assert.ok(Math.abs(+mirror - +obj - (img[0] - +mirror)) < 0.02);
});
test('check, hide and print', () => {
  for (const [d, re] of [[{ type: 'plane-mirror', u: 10, f: 5 }, /no focal length/], [{ type: 'plane-mirror', u: 10, h: 40 }, /0\.15 to 2 times/], [{ type: 'plane-mirror', u: 10, rays: [3] }, /1 and\/or 2/], [{ type: 'plane-mirror' }, /"u"/]]) {
    assert.match(OF.check('rays', d).join('; '), re); assert.match(OF.svg('rays', d), /cannot be drawn/);
  }
  const d = { type: 'plane-mirror', u: 10, h: 6 };
  assert.doesNotMatch(OF.svg('rays', d, { hide: true }), /of-extension|>image</); assert.match(OF.svg('rays', d, { hide: 'image' }), /of-extension/);
  assert.doesNotMatch(OF.svg('rays', d, { hide: 'image' }), />image</); assert.ok(PRINT_OK(OF.svg('rays', d, { print: true })));
  assert.match(OF.svg('rays', d, { lang: 'ja' }), />像</);
  assert.ok(OF.data.rayTypes.includes('plane-mirror'));
});
test('a generator: the image distance', async () => { await checkGenerator(assert, 'rays', s => s.x); });
