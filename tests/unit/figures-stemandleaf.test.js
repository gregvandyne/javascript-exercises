// Oomba Figures 1.1.0: the stem-and-leaf plot (docs/figures-api.md "Data displays"). Every stem from the smallest to
// the largest (empty ones too), leaves in order, a key written from a value in the data; back to back for two sets.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const D = { data: [56, 62, 65, 67, 71, 73, 73, 78, 92] };
test('stemAndLeaf: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'stemAndLeaf', {
    good: [D, { data: [12, 15, 21], data2: [18, 22, 31], names: ['A', 'B'] }, { data: [2.5, 3.1, 3.8], leaf: 0.1 }, { data: [20, 24, 26, 31], split: true }],
    bad: [[{ data: [2.5] }, /not a whole number of leaves/], [{ data: [-3] }, /0 or more/], [{ data: [1, 500] }, /more than 16 stems/], [{ data: [1], leaf: 3 }, /"leaf"/]],
    key: s => s.median,
  });
});
test('stemAndLeaf: the empty stem is kept, the key is true, hide the leaves', () => {
  const f = OF.svg('stemAndLeaf', D);
  assert.equal(count(f, 'of-stem'), 5, '5, 6, 7, 8 (empty) and 9'); assert.equal(count(f, 'of-leaf'), 9);
  assert.match(f, />Key: 5 \| 6 means 56</); assert.match(OF.svg('stemAndLeaf', { data: [2.5, 3.1], leaf: 0.1 }), /2 \| 5 means 2\.5/);
  assert.equal(count(OF.svg('stemAndLeaf', D, { hide: true }), 'of-leaf'), 0);
  assert.match(OF.svg('stemAndLeaf', D, { lang: 'fr' }), />Légende : |>Légende: 5 \| 6 signifie 56</);
  const s = OF.solve.stemAndLeaf(D); assert.equal(s.median, 71); assert.deepEqual(s.mode, [73]); assert.deepEqual(s.stems[3], { stem: 8, leaves: [[]] });
});
