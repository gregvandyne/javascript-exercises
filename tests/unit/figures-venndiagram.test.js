// Oomba Figures 1.1.0: the Venn diagram (docs/figures-api.md "Probability and tables"). 2 or 3 sets, counts or the
// elements (sorted into their regions), shading; stated totals must add up.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const V = { sets: ['Cat', 'Dog', 'Fish'], counts: { A: 9, B: 7, C: 3, AB: 4, AC: 2, BC: 1, ABC: 2, none: 5 } };
const E = { sets: ['Even', 'Multiple of 3'], members: [[2, 4, 6, 8, 10, 12], [3, 6, 9, 12]], universe: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] };
test('vennDiagram: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'vennDiagram', {
    good: [V, E, { sets: ['A', 'B'], counts: { A: 5, B: 6, AB: 3, none: 2 }, shade: [{ in: ['A'], out: ['B'] }, 'none'], totals: { A: 8, all: 16 }, labels: { AB: 'x' } }],
    bad: [[{ ...V, totals: { Cat: 20 } }, /the total of Cat is given as 20 but the regions add up to 17/], [{ sets: ['A', 'B'], counts: { A: 1, B: 1, AB: 1 } }, /none is missing/],
      [{ ...E, universe: [1, 2] }, /in a set but not in the universe/], [{ ...V, shade: ['AD'] }, /not a region/], [{ ...V, labels: { A: 10 } }, /labeled 10 but it is 9/], [{ sets: ['A'] }, /2 or 3 sets/]],
    key: s => s.union,
  });
});
test('vennDiagram: totals, elements sorted into regions, shading, hide a region', () => {
  const s = OF.solve.vennDiagram(V); assert.deepEqual(s.sets, { A: 17, B: 14, C: 8 }); assert.equal(s.total, 33); assert.equal(s.both.AB, 6); assert.ok(Math.abs(s.given['A|B'] - 6 / 14) < 1e-9, 'P(A|B) = n(A and B) / n(B)');
  const e = OF.solve.vennDiagram(E); assert.deepEqual(e.elements.AB, [6, 12]); assert.deepEqual(e.elements.none, [1, 5, 7, 11]);
  const sh = OF.svg('vennDiagram', { ...V, shade: [{ in: ['A', 'B'] }] }); assert.equal(count(sh, 'of-shade'), 2, 'AB and ABC'); assert.match(sh, /<mask id="of-venn-/);
  assert.equal(count(OF.svg('vennDiagram', V), 'of-count'), 8); assert.equal(count(OF.svg('vennDiagram', V, { hide: 'ABC' }), 'of-count'), 7);
  assert.equal(count(OF.svg('vennDiagram', E), 'of-element'), 4);
});
