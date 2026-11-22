// Oomba Figures 1.1.0: segment addition (docs/figures-api.md "Segment addition"). Points in order on a line, each part
// drawn at its true length, its length or expression (a·x + b as data, worked out at the unknown's value) above it,
// spans as braces; a span's label is the true sum, ticks claim equal parts only where they are, a crossing line's square
// only at 90°. Print, hide, languages, the frozen 1.1.0 file and the generator.
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
const labelText = (s, part) => { const m = new RegExp(`<g class="of-(label|name)" data-part="${part}">(.*?)</g></g>`).exec(s); return m ? [...m[2].matchAll(/>([^<]+)<\/text>/g)].map(x => x[1]).join('') : null; };
const dots = s => [...s.matchAll(/<circle cx="([-\d.]+)" cy="([-\d.]+)" r="3.5"[^>]*class="of-dot"/g)].map(m => [Number(m[1]), Number(m[2])]);

const SOLVE_X = { points: ['A', 'B', 'C'], unknown: { x: 6 }, parts: [{ expr: [2, 1] }, { expr: [3, -4] }], spans: [{ from: 'A', to: 'C', label: 27 }] };
const GOOD = [SOLVE_X, { points: ['A', 'M', 'B'], unknown: { x: 5 }, parts: [{ expr: [3, 2], ticks: 1 }, { expr: [5, -8], ticks: 1 }] },
  { points: ['A', 'M', 'B'], parts: [{ length: 6, ticks: 1 }, { length: 6, ticks: 1 }], cross: { at: 'M', name: 'ℓ' }, unit: 'cm' },
  { points: ['P', 'Q', 'R', 'S'], parts: [4, { length: 7, label: 'x' }, 5], spans: [{ from: 'P', to: 'R', label: true }, { from: 'Q', to: 'S', label: 12 }], start: 'arrow', end: 'arrow' },
  { points: ['A', 'B'], parts: [{ length: 2.5 }], notToScale: true, drawAs: [4] }];

test('good data: no problems, one accessible <svg>, nothing undefined', () => {
  assert.ok(OF.kinds.includes('segmentAddition'));
  for (const d of GOOD) {
    assert.deepEqual(OF.check('segmentAddition', d), [], JSON.stringify(d));
    const s = OF.svg('segmentAddition', d, { title: 'Segment' });
    assert.match(s, /role="img" aria-label="Segment"/); assert.match(s, /class="of-fig of-segmentAddition"/); assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/);
  }
});

test('OF.check: what cannot be drawn or would lie is named, and draws the card', () => {
  const cases = [
    [{ points: ['A'], parts: [] }, /"points" must list 2 to 7/],
    [{ points: ['A', 'B', 'C'], parts: [{ length: 3 }] }, /"parts" must list 2 parts/],
    [{ points: ['A', 'B'], parts: [{ expr: [2, 1] }] }, /needs "unknown"/],
    [{ points: ['A', 'B'], unknown: { x: 1 }, parts: [{ expr: [2, -5] }] }, /is −3, and a length has to be more than 0/],
    [{ points: ['A', 'B'], parts: [{ length: 3, expr: [1, 0] }] }, /exactly one of "length"/],
    [{ ...SOLVE_X, spans: [{ from: 'A', to: 'C', label: 30 }] }, /AC is labeled 30 but it is 27/],
    [{ ...SOLVE_X, spans: [{ from: 'A', to: 'C', expr: [5, 0] }] }, /AC is labeled 5x, which is 30 with x = 6, but its parts add up to 27/],
    [{ points: ['A', 'B', 'C'], parts: [{ length: 3, ticks: 1 }, { length: 4, ticks: 1 }] }, /ticks claim equal parts AB and BC, but they are not/],
    [{ points: ['A', 'B'], parts: [{ length: 3, label: 4 }] }, /AB is labeled 4 but it is 3/],
    [{ points: ['A', 'B'], parts: [3], drawAs: [4] }, /only goes with notToScale: true/],
    [{ points: ['A', 'B'], parts: [3], cross: { at: 'Z' } }, /"cross" must be/],
  ];
  for (const [d, re] of cases) { assert.match(OF.check('segmentAddition', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('segmentAddition', d), /cannot be drawn/); assert.equal(OF.solve.segmentAddition(d), null); }
});

test('to scale: points spaced by the true lengths (13 and 14 with x = 6); drawAs when not to scale', () => {
  const [a, b, c] = dots(OF.svg('segmentAddition', SOLVE_X));
  assert.ok(Math.abs((b[0] - a[0]) / (c[0] - b[0]) - 13 / 14) < 0.01);
  const [p, q, r, t] = dots(OF.svg('segmentAddition', GOOD[3]));
  assert.ok(Math.abs((q[0] - p[0]) / (t[0] - r[0]) - 4 / 5) < 0.01);
  assert.match(OF.svg('segmentAddition', GOOD[4]), />Not drawn to scale</);
});

test('OF.solve and what it says', () => {
  const s = OF.solve.segmentAddition(SOLVE_X);
  assert.deepEqual(s.unknown, { x: 6 }); assert.deepEqual(s.parts, [13, 14]); assert.deepEqual(s.spans, [27]); assert.equal(s.total, 27);
  assert.deepEqual(OF.solve.segmentAddition(GOOD[1]).midpoints, [{ point: 1, from: 0, to: 2 }]);
  const f = OF.svg('segmentAddition', SOLVE_X);
  assert.equal(labelText(f, 'part0'), '2x+1', 'spaced by the typesetter, not by spaces'); assert.equal(labelText(f, 'part1'), '3x−4'); assert.equal(labelText(f, 'span0'), '27');
  assert.match(f, /<text[^>]*font-style="italic"[^>]*>x<\/text>/);
  const g = OF.svg('segmentAddition', GOOD[3]);
  assert.equal(labelText(g, 'span0'), '11', 'label true: the sum'); assert.equal(count(g, 'of-brace'), 2); assert.equal(count(g, 'of-head'), 2);
  assert.equal(count(OF.svg('segmentAddition', GOOD[2]), 'of-square'), 1); assert.equal(count(OF.svg('segmentAddition', GOOD[2]), 'of-tick'), 2);
  assert.equal(count(OF.svg('segmentAddition', { ...GOOD[2], cross: { at: 'M', angle: 70 } }), 'of-square'), 0, 'a square only at 90°');
});

test('print, hide, languages, the frozen 1.1.0 file, and the generator', async () => {
  const F = figuresKit('1.1.0');
  for (const d of GOOD) {
    assert.doesNotMatch(OF.svg('segmentAddition', d, { print: true }), /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1/);
    assert.equal(F.svg('segmentAddition', d, { lang: 'es' }), OF.svg('segmentAddition', d, { lang: 'es' }));
  }
  const h = OF.svg('segmentAddition', GOOD[3], { hide: true });
  assert.equal(count(h, 'of-label'), 0); assert.equal(count(h, 'of-name'), 4); assert.equal(count(h, 'of-brace'), 2);
  assert.equal(labelText(OF.svg('segmentAddition', GOOD[3], { hide: 'spans' }), 'span0'), null); assert.equal(labelText(OF.svg('segmentAddition', GOOD[3], { hide: 'PQ' }), 'part0'), null);
  for (const c of CODES) { const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]]; assert.ok(OF.svg('segmentAddition', SOLVE_X, { lang: c }).includes(`<title>${W.segmentAddition}</title>`), c); }
  assert.equal(labelText(OF.svg('segmentAddition', GOOD[4], { lang: 'de' }), 'part0'), '2,5');
  await checkGenerator(assert, 'segmentAddition', s => Object.values(s.unknown)[0]);
});
