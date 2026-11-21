// Oomba Figures 1.1.0: composite shapes (docs/figures-api.md "Composite shapes"). Parts joined side to side or cut out;
// the outline worked out from them (no line where two parts share an edge); parts never overlap, cuts lie inside, the
// parts hang together; a stated length is the true one. OF.solve gives area and perimeter. Print, hide, languages, the
// frozen file and the generator.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { FIG_WORDS } from '../../figures/src/words.js';
import { CODES } from '../../server/i18n/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator } from './_geometry-gens.js';

const OF = globalThis.OombaFigures;
const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
const labels = s => [...s.matchAll(/<g class="of-label" data-part="[^"]+">(.*?)<\/g><\/g>/g)].map(m => [...m[1].matchAll(/>([^<]+)<\/text>/g)].map(x => x[1]).join(''));
const near = (a, b, t = 1e-6) => Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

const L = { parts: [{ rect: [0, 0, 8, 3] }, { rect: [0, 3, 3, 4] }], sides: true, unit: 'm' };
const ARCH = { parts: [{ rect: [0, 0, 8, 5] }, { semicircle: [[0, 5], [8, 5]], radius: true }], labels: [{ from: [0, 0], to: [8, 0], label: true }], splits: [{ from: [0, 5], to: [8, 5] }], unit: 'cm' };
const HOLE = { parts: [{ rect: [0, 0, 10, 6] }, { circle: [5, 3, 2], cut: true, radius: true }], sides: true, shade: true, unit: 'in' };
const HOUSE = { parts: [{ rect: [0, 0, 6, 4] }, { tri: [[0, 4], [6, 4], [3, 7]] }], labels: [{ from: [0, 0], to: [6, 0], label: 6 }], splits: [{ from: [3, 4], to: [3, 7], label: 'h' }] };
const GOOD = [L, ARCH, HOLE, HOUSE];

test('good data: no problems, one accessible <svg>, nothing undefined', () => {
  assert.ok(OF.kinds.includes('compositeShape'));
  for (const d of GOOD) {
    assert.deepEqual(OF.check('compositeShape', d), [], JSON.stringify(d));
    const s = OF.svg('compositeShape', d, { title: 'Shape' });
    assert.match(s, /role="img" aria-label="Shape"/); assert.match(s, /class="of-shape"/); assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/);
  }
});

test('OF.check: overlaps, cuts outside, loose parts and false labels are named, and draw the card', () => {
  const cases = [
    [{ parts: [] }, /"parts" must list 1 to 8/],
    [{ parts: [{ rect: [0, 0, -2, 3] }] }, /"rect" must be \[x, y, width, height\]/],
    [{ parts: [{ rect: [0, 0, 4, 4] }, { rect: [2, 2, 4, 4] }] }, /parts 1 and 2 overlap/],
    [{ parts: [{ rect: [0, 0, 4, 4] }, { rect: [5, 0, 4, 4] }] }, /must join side to side into one shape/],
    [{ parts: [{ rect: [0, 0, 4, 4] }, { circle: [4, 2, 1], cut: true }] }, /cut out, so it must lie inside the shape/],
    [{ parts: [{ rect: [0, 0, 8, 5] }, { semicircle: [[8, 5], [0, 5]] }] }, /overlap/],
    [{ ...L, sides: false, labels: [{ from: [0, 0], to: [8, 0], label: 9 }] }, /is labeled 9 but it is 8/],
    [{ ...L, labels: [{ from: [0, 0], to: [4, 0] }] }, /is not a whole side of the outline/],
    [{ ...HOLE, parts: [HOLE.parts[0], { circle: [5, 3, 2], cut: true, radius: 3 }] }, /the radius of part 2 is labeled 3 but it is 2/],
    [{ ...L, splits: [{ from: [4, 4], to: [6, 6] }] }, /must run inside the shape/],
    [{ parts: [{ rect: [0, 0, 1, 1], radius: true }] }, /"radius" is for a circle or a semicircle/],
  ];
  for (const [d, re] of cases) { assert.match(OF.check('compositeShape', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('compositeShape', d), /cannot be drawn/); assert.equal(OF.solve.compositeShape(d), null); }
});

test('the outline is worked out from the parts; area and perimeter are true', () => {
  const l = OF.solve.compositeShape(L);
  assert.equal(l.area, 36); assert.ok(near(l.perimeter, 30)); assert.equal(l.sides.length, 6, 'six sides: no line where the two rectangles meet');
  assert.deepEqual(labels(OF.svg('compositeShape', L)).sort(), ['3m', '3m', '4m', '5m', '7m', '8m'].sort());
  const a = OF.solve.compositeShape(ARCH);
  assert.ok(near(a.area, 40 + 8 * Math.PI)); assert.ok(near(a.perimeter, 8 + 5 + 5 + 4 * Math.PI, 1e-6), 'three straight sides and a half circle');
  const h = OF.solve.compositeShape(HOLE);
  assert.ok(near(h.area, 60 - 4 * Math.PI)); assert.ok(near(h.perimeter, 32 + 4 * Math.PI, 1e-6), 'the hole\'s edge counts');
  assert.equal(OF.solve.compositeShape(HOUSE).area, 33);
  assert.equal(count(OF.svg('compositeShape', HOUSE), 'of-split'), 1); assert.equal(count(OF.svg('compositeShape', ARCH), 'of-radius'), 1);
  assert.match(OF.svg('compositeShape', HOLE), /fill="#B8DEBE"/, 'shaded'); assert.match(OF.svg('compositeShape', HOLE, { print: true }), /fill="#D9D9D9"/, 'shaded in print too');
});

test('print, hide, languages, the frozen 1.1.0 file, and the generator', async () => {
  const F = figuresKit('1.1.0');
  for (const d of GOOD) {
    const p = OF.svg('compositeShape', d, { print: true });
    assert.doesNotMatch(p, /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1/); if (!d.shade) assert.match(p, /fill="none" stroke="none"|fill="none"/);
    assert.equal(F.svg('compositeShape', d, { lang: 'ja' }), OF.svg('compositeShape', d, { lang: 'ja' }));
  }
  assert.equal(count(OF.svg('compositeShape', L, { hide: true }), 'of-label'), 0); assert.equal(count(OF.svg('compositeShape', HOUSE, { hide: 'splits' }), 'of-label'), 1);
  for (const c of CODES) { const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]]; assert.ok(OF.svg('compositeShape', L, { lang: c }).includes(`<title>${W.compositeShape}</title>`), c); }
  assert.ok(labels(OF.svg('compositeShape', { parts: [{ rect: [0, 0, 2.5, 1] }], sides: true }, { lang: 'de' })).includes('2,5'));
  await checkGenerator(assert, 'compositeShape', s => s.area);
});
