// Oomba Figures 1.1.0: nets (docs/figures-api.md "3D solids and nets"). A cube in one of its 11 nets (any six squares
// that do not fold into a cube are refused), a prism, pyramid, cylinder or cone unfolded to scale; its faces add up to
// the solid's surface area.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { checkDataKind, count } from './_data-gens.js';
import { docGens } from './_solid-gens.js';
import { NT_CUBE_NETS, ntFoldCube, ntShapesOf, ntWhichCubeNet } from '../../figures/src/ported/nets.js';

const OF = globalThis.OombaFigures;
const near = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

test('net: checks, print, languages, the frozen file and the generator', async () => {
  await checkDataKind(assert, OF, 'net', {
    good: [{ solid: 'cube', side: 4, unit: 'cm' }, { solid: 'cube', side: 3, net: 11, tabs: true, faces: 'both' }, { solid: 'prism', length: 8, width: 3, height: 5, shade: true },
      { solid: 'prism', base: 'right', triBase: 6, triHeight: 8, height: 10 }, { solid: 'prism', base: 'regular', sides: 6, side: 4, height: 8, labels: { apothem: true } },
      { solid: 'pyramid', length: 8, width: 6, height: 4, faces: 'areas' }, { solid: 'pyramid', length: 10, width: 10, slant: 12 }, { solid: 'cylinder', radius: 3, height: 10, labels: { circ: true } },
      { solid: 'cone', diameter: 6, slant: 5, labels: { angle: true } }, { solid: 'cube', side: 2, cells: [[0, 0], [1, 0], [1, 1], [2, 1], [2, 2], [3, 2]], fold: 'solid' }],
    bad: [[{ solid: 'cube', side: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]] }, /do not fold into a cube/], [{ solid: 'cube', side: 4, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]] }, /do not fold into a cube/],
      [{ solid: 'cube', side: 4, cells: [[0, 0], [2, 0], [1, 1], [2, 1], [3, 1], [1, 2]] }, /do not fold into a cube/], [{ solid: 'cube', side: 4, net: 12 }, /1 to 11/],
      [{ solid: 'prism', length: 4, width: 4, height: 4 }, /is a cube/], [{ solid: 'sphere', radius: 3 }, /a sphere has no net/], [{ solid: 'cone', radius: 3, height: 4, labels: { angle: 200 } }, /labeled 200 but it is 216°/],
      [{ solid: 'cylinder', radius: 3, height: 10, oblique: true }, /a net is of a right solid/], [{ solid: 'prism', length: 8, width: 3, height: 5, net: 2 }, /goes with solid: "cube"/]],
    key: s => s.surfaceArea, gen: docGens().net, title: W => `${W.net}: ${W.cube}`,
  });
});
test('net: exactly 11 cube nets, each folds, every hexomino that is not one is refused', () => {
  assert.equal(NT_CUBE_NETS.length, 11);
  const shapes = new Set(NT_CUBE_NETS.map(n => ntShapesOf(n).sort()[0]));
  assert.equal(shapes.size, 11, 'no two are turns or mirror images of each other');
  NT_CUBE_NETS.forEach((n, i) => { assert.ok(ntFoldCube(n), `net ${i + 1} folds`); assert.equal(ntWhichCubeNet(n), i + 1); });
  // every free hexomino (35) on a grid: exactly 11 fold into a cube
  const grow = polys => { const out = new Map(); for (const p of polys) for (const [c, r] of p) for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const q = [c + dc, r + dr]; if (p.some(x => x[0] === q[0] && x[1] === q[1])) continue; const n = [...p, q], mc = Math.min(...n.map(x => x[0])), mr = Math.min(...n.map(x => x[1])), m = n.map(([a, b]) => [a - mc, b - mr]); out.set(ntShapesOf(m).sort()[0], m); } return [...out.values()]; };
  let polys = [[[0, 0]]]; for (let i = 0; i < 5; i++) polys = grow(polys);
  assert.equal(polys.length, 35, 'the 35 free hexominoes');
  assert.equal(polys.filter(p => ntFoldCube(p)).length, 11);
  for (const p of polys) assert.equal(OF.check('net', { solid: 'cube', side: 2, cells: p }).length === 0, !!ntFoldCube(p));
});
test('net: faces add up to the solid\'s surface area; fold lines dashed, cut edges solid', () => {
  const cases = [['prism', { length: 8, width: 3, height: 5 }], ['prism', { base: 'isosceles', triBase: 6, triHeight: 4, height: 9 }], ['pyramid', { length: 8, width: 6, height: 4 }],
    ['pyramid', { base: 'regular', sides: 5, side: 4, slant: 6 }], ['cylinder', { radius: 3, height: 10 }], ['cone', { radius: 3, height: 4 }]];
  for (const [solid, m] of cases) assert.ok(near(OF.solve.net({ solid, ...m }).surfaceArea, OF.solve[solid](m).surfaceArea), solid);
  assert.ok(near(OF.solve.net({ solid: 'cube', side: 4, net: 5 }).surfaceArea, 96));
  assert.equal(OF.solve.net({ solid: 'cube', side: 2, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [1, 1]] }), null, 'a square twice is refused');
  assert.equal(OF.solve.net({ solid: 'cube', side: 2, cells: [[0, 1], [1, 1], [2, 1], [3, 1], [2, 0], [0, 2]] }).net, 4, 'named, turned or flipped');
  const s = OF.svg('net', { solid: 'cube', side: 4 });
  assert.equal(count(s, 'of-fold'), 5); assert.equal(count(s, 'of-cut'), 14); assert.match(s, /stroke-dasharray="6 5" class="of-folds"/);
  assert.doesNotMatch(OF.svg('net', { solid: 'cube', side: 4, fold: 'solid' }), /class="of-folds" stroke-dasharray|stroke-dasharray="6 5" class="of-folds"/);
  assert.equal(count(OF.svg('net', { solid: 'cube', side: 4, faces: 'names' }), 'of-facetext'), 6);
  assert.doesNotMatch(OF.svg('net', { solid: 'pyramid', length: 8, width: 6, height: 4, faces: 'areas' }, { hide: 'areas' }), /of-facetext/);
  const c = OF.solve.net({ solid: 'cone', radius: 3, slant: 5 }); assert.ok(near(c.sectorAngle, 216)); assert.deepEqual(c.exact.surfaceArea, { pi: 24 });
});
