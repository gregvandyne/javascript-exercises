// Oomba Figures 1.1.0: mapping diagrams (docs/figures-api.md "Mapping diagrams"). The arrows are data and match the
// items they join; a rule must be what every arrow does; OF.solve says function, one-to-one, onto and the inverse.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';
import { docGens } from './_solid-gens.js';

const OF = globalThis.OombaFigures;
test('mappingDiagram: checks, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'mappingDiagram', {
    good: [{ inputs: [1, 2, 3], outputs: [3, 5, 7], arrows: [[1, 3], [2, 5], [3, 7]], rule: '2*x + 1' }, { inputs: [1, 2, 3], outputs: [4, 5, 6, 7], arrows: [[1, 4], [1, 5], [2, 6], [3, 7]], shape: 'box' },
      { inputs: ['Ana', 'Ben'], outputs: ['Soccer'], arrows: [['Ana', 'Soccer'], ['Ben', 'Soccer']], titles: ['Student', 'Sport'] }, { inputs: ['a', { frac: [1, 2] }], outputs: [-1], arrows: [], shape: 'none', titles: false, heading: 'A relation' }],
    bad: [[{ inputs: [1, 2], outputs: [3], arrows: [[1, 4]] }, /ends at an item that is not one of the outputs/], [{ inputs: [1, 2], outputs: [3], arrows: [[5, 3]] }, /starts at an item that is not one of the inputs/],
      [{ inputs: [1, 1], outputs: [3], arrows: [] }, /listed twice/], [{ inputs: [1, 2, 3], outputs: [3, 5, 8], arrows: [[1, 3], [2, 5], [3, 8]], rule: '2*x + 1' }, /3 to 8 does not follow the rule: it sends 3 to 7/],
      [{ inputs: ['a'], outputs: [2], arrows: [['a', 2]], rule: 'x' }, /works on numbers/], [{ inputs: [1], outputs: [2], arrows: [[1, 2], [1, 2]] }, /listed twice/], [{ inputs: [], outputs: [2], arrows: [] }, /1 to 12/]],
    key: s => s.pairs.find(p => p[0] === 3)[1], gen: docGens().mappingDiagram,
  });
});
test('mappingDiagram: function, one-to-one, onto, inverse; labels match their arrows; hide', () => {
  const f = OF.solve.mappingDiagram({ inputs: [1, 2, 3], outputs: [3, 5, 7], arrows: [[1, 3], [2, 5], [3, 7]] });
  assert.deepEqual([f.function, f.oneToOne, f.onto, f.inverse], [true, true, true, [[3, 1], [5, 2], [7, 3]]]);
  const sq = OF.solve.mappingDiagram({ inputs: [-2, -1, 0, 1, 2], outputs: [0, 1, 4], arrows: [[-2, 4], [-1, 1], [0, 0], [1, 1], [2, 4]] });
  assert.deepEqual([sq.function, sq.oneToOne, sq.onto, sq.inverse], [true, false, true, null]);
  const nf = OF.solve.mappingDiagram({ inputs: [1, 2, 3], outputs: [4, 5, 6, 7], arrows: [[1, 4], [1, 5], [2, 6], [3, 7]] });
  assert.deepEqual([nf.function, nf.why], [false, '1 goes to 4 and 5']);
  const un = OF.solve.mappingDiagram({ inputs: [1, 2], outputs: [4, 5, 6], arrows: [[1, 4]] });
  assert.deepEqual([un.function, un.why, un.onto, un.range], [false, '2 has no output', false, [4]]);
  const s = OF.svg('mappingDiagram', { inputs: [1, 2], outputs: [3, 4], arrows: [[1, 4], [2, 3]] });
  assert.deepEqual([...s.matchAll(/data-from="([^"]+)" data-to="([^"]+)"/g)].map(m => [m[1], m[2]]), [['1', '4'], ['2', '3']], 'each arrow joins the items it names');
  // each arrow starts at its input's row and ends at its output's row
  const rows = side => Object.fromEntries([...s.matchAll(new RegExp(`class="of-${side}" data-item="([^"]+)"><g class="of-math"><text x="[\\d.]+" y="([\\d.]+)"`, 'g'))].map(m => [m[1], Number(m[2])]));
  const ins = rows('input'), outs = rows('output');
  for (const m of s.matchAll(/data-from="([^"]+)" data-to="([^"]+)"><line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/g)) {
    assert.ok(Math.abs(ins[m[1]] - Number(m[3])) < 12 && Math.abs(outs[m[2]] - Number(m[4])) < 12, `arrow ${m[1]} -> ${m[2]}`);
  }
  assert.equal(count(s, 'of-arrow'), 2); assert.match(s, />Input</); assert.match(s, />Output</);
  assert.equal(count(OF.svg('mappingDiagram', { inputs: [1, 2], outputs: [3, 4], arrows: [[1, 4]] }, { hide: 'arrows' }), 'of-arrow'), 0);
  assert.equal(count(OF.svg('mappingDiagram', { inputs: [1, 2], outputs: [3, 4], arrows: [[1, 4]] }, { hide: true }), 'of-arrow'), 0);
  assert.equal(count(OF.svg('mappingDiagram', { inputs: [1, 2], outputs: [3, 4], arrows: [[1, 4]] }, { hide: 'outputs' }), 'of-output'), 0);
  assert.match(OF.svg('mappingDiagram', { inputs: [1], outputs: [3], arrows: [] }, { lang: 'fr' }), />Entrée</);
});
