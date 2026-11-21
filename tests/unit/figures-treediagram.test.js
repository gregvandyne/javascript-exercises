// Oomba Figures 1.1.0: the tree diagram (docs/figures-api.md "Probability and tables"). Branches from one point add up
// to 1 (exactly, as fractions); each outcome's probability is the product along its path.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';

const OF = globalThis.OombaFigures;
const T = { stages: ['1st draw', '2nd draw'], branches: [{ name: 'R', p: [3, 5], then: [{ name: 'R', p: [2, 4] }, { name: 'B', p: [2, 4] }] }, { name: 'B', p: [2, 5], then: [{ name: 'R', p: [3, 4] }, { name: 'B', p: [1, 4] }] }] };
test('treeDiagram: checks, truth, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'treeDiagram', {
    good: [T, { branches: [{ name: 'H', p: 0.5 }, { name: 'T', p: 0.5 }], repeat: 3 }, { branches: [{ name: 'Rain', p: 0.3, label: 'x' }, { name: 'Dry', p: 0.7 }] }],
    bad: [[{ branches: [{ name: 'R', p: [3, 5] }, { name: 'B', p: [3, 5] }] }, /add up to 1\.2, not 1/], [{ branches: [{ name: 'A', p: 0.5 }, { name: 'B', p: 0.5, label: 0.4 }] }, /labeled 0\.4 but it is 0\.5/],
      [{ branches: [{ name: 'A', p: 2 }, { name: 'B', p: 0.5 }] }, /a probability from 0 to 1/], [{ ...T, stages: ['one'] }, /"stages" must list 2/], [{ branches: [{ name: 'A', p: 1 }] }, /2 to 4 branches/]],
    key: s => s.outcomes[0].p,
  });
});
test('treeDiagram: products reduced, conditional branches, hide products or one branch', () => {
  const s = OF.solve.treeDiagram(T);
  assert.deepEqual(s.outcomes.map(o => o.fraction), [[3, 10], [3, 10], [3, 10], [1, 10]]); assert.equal(s.stages[1].R, 0.6);
  assert.deepEqual(s.branches.find(b => b.path.join() === 'B,R'), { path: ['B', 'R'], p: 0.75 }, 'P(R second | B first)');
  assert.equal(count(OF.svg('treeDiagram', T), 'of-product'), 4); assert.equal(count(OF.svg('treeDiagram', T, { hide: 'products' }), 'of-product'), 0);
  assert.equal(count(OF.svg('treeDiagram', T), 'of-prob'), 6); assert.equal(count(OF.svg('treeDiagram', T, { hide: 'B,R' }), 'of-prob'), 5);
  assert.equal(OF.solve.treeDiagram({ branches: [{ name: 'H', p: 0.5 }, { name: 'T', p: 0.5 }], repeat: 3 }).outcomes.length, 8);
});
