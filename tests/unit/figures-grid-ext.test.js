// Oomba Figures 1.1.0: the coordinate grid, extended (docs/figures-api.md "The coordinate grid, extended"). The same
// grid kind, nothing it drew before changed (byte for byte against both shipped files); new: π, fraction and degree
// numbering, axis titles, inequalities shaded on their side (dashed when strict), piecewise functions with open and
// closed ends, holes, verticals and asymptotes, open points, and transformations as grid data: the image is always
// worked out from the pre-image and must fit on the grid. Print, hide, the frozen file, the generator.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator } from './_geometry-gens.js';

const OF = globalThis.OombaFigures;
const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;

const OLD = [
  { x: [-5, 5], y: [-5, 5], points: [{ x: 2, y: 3, label: 'A', coords: true }], fns: [{ expr: '2*x - 1', label: 'y = 2x − 1' }], segments: [{ from: [0, 0], to: [3, 4] }], shapes: [{ points: [[0, 0], [3, 0], [0, 4]] }] },
  { x: [0, 10], y: [0, 8], step: 2, fns: [{ expr: 'x^2/4', from: 1, to: 6 }] }, { x: [-3, 3], y: [-2, 2], fns: [{ expr: '1/x' }] },
];
const NEW = {
  inequalities: { x: [-6, 6], y: [-6, 6], inequalities: [{ expr: 'x + 1', sign: '>=', label: 'y ≥ x + 1' }, { expr: '-2*x + 4', sign: '<' }, { x: -4, sign: '>' }] },
  piecewise: { x: [-6, 6], y: [-6, 6], fns: [{ expr: 'x + 2', to: 1, toClosed: false }, { expr: '-2*x + 4', from: 1, fromClosed: true }] },
  pi: { x: [{ pi: -2 }, { pi: 2 }], y: [-2, 2], xstep: { pi: 0.5 }, ystep: 1, fns: [{ expr: 'sin(x*180/pi)' }] },
  degree: { x: [0, 360], y: [-4, 4], xstep: 45, ystep: 1, numbering: 'degree', ynumbering: 'decimal', fns: [{ expr: '3*sin(2*x)' }], xtitle: 'Angle', ytitle: 'Height' },
  rational: { x: [-6, 6], y: [-6, 6], fns: [{ expr: '(2*x^2 + 3*x - 2)/(x^2 + x - 2)', holes: [-2] }], asymptotes: [{ x: 1 }, { y: 2 }], verticals: [{ x: -5, label: 'x = −5' }], points: [{ x: 3, y: 3, open: true }] },
  reflect: { x: [-6, 6], y: [-6, 6], shapes: [{ points: [[1, 3], [3, 5], [1, 5]], names: ['A', 'B', 'C'], transform: { reflect: 'y=x' } }] },
  steps: { x: [-8, 8], y: [-8, 8], shapes: [{ points: [[1, 1], [4, 1], [1, 3]], names: ['P', 'Q', 'R'], transform: [{ rotate: 90, about: [0, 0] }, { dilate: 2, about: [0, 0] }] }] },
};

test('nothing the grid drew before has changed: the same SVG as 1.0.0 and the batch before, byte for byte', () => {
  const F0 = figuresKit('1.0.0');
  for (const d of OLD) for (const o of [{}, { print: true }, { hide: true }, { lang: 'de', hide: 'labels' }]) assert.equal(OF.svg('grid', d, o), F0.svg('grid', d, o));
  assert.match(OF.check('grid', { x: [5, 1], y: [0, 1] }).join(), /must be ranges \[lo, hi\]/); assert.match(OF.check('grid', { x: [0, 1000], y: [0, 1], step: 1 }).join(), /too many grid lines/);
});

test('the new options: good data draws, nothing undefined', () => {
  for (const [k, d] of Object.entries(NEW)) {
    assert.deepEqual(OF.check('grid', d), [], k);
    assert.doesNotMatch(OF.svg('grid', d), /cannot be drawn|NaN|undefined|Infinity|\[object/, k);
  }
  const pi = OF.svg('grid', NEW.pi);
  for (const t of ['−2π', '−3π/2', '−π', '−π/2', 'π/2', 'π', '3π/2', '2π']) assert.ok(pi.includes(`>${t}</text>`), t);
  const deg = OF.svg('grid', NEW.degree);
  for (const t of ['45°', '180°', '360°']) assert.ok(deg.includes(`>${t}</text>`), t);
  assert.match(deg, /class="of-axis-title"[^>]*>Angle</); assert.match(deg, />Height</);
  const ineq = OF.svg('grid', NEW.inequalities);
  assert.equal(count(ineq, 'of-shade'), 3); assert.equal((ineq.match(/class="of-boundary"/g) || []).length, 3);
  assert.equal((ineq.match(/stroke-dasharray="8 6" class="of-boundary"/g) || []).length, 2, 'strict: dashed; ≥: solid');
  const pw = OF.svg('grid', NEW.piecewise); assert.equal(count(pw, 'of-open'), 1); assert.equal(count(pw, 'of-closed'), 1);
  const ra = OF.svg('grid', NEW.rational); assert.equal(count(ra, 'of-open'), 2, 'the hole and the open point'); assert.equal(count(ra, 'of-asymptote'), 2); assert.equal(count(ra, 'of-vertical'), 1);
});

test('the checks: inequalities, piecewise ends, holes, and images that must fit', () => {
  const cases = [
    [{ x: [-5, 5], y: [-5, 5], inequalities: [{ expr: 'x', sign: '=>' }] }, /"sign" must be one of/],
    [{ x: [-5, 5], y: [-5, 5], inequalities: [{ expr: '1/x', sign: '>' }] }, /must have a value all the way across/],
    [{ x: [-5, 5], y: [-5, 5], inequalities: [{ expr: 'x', x: 2, sign: '>' }] }, /give one of "expr"/],
    [{ x: [-5, 5], y: [-5, 5], fns: [{ expr: 'x', toClosed: true }] }, /give "to"/],
    [{ x: [-5, 5], y: [-5, 5], fns: [{ expr: 'x*x', to: 3, toClosed: true }] }, /the end at x = 3 must be on the grid/],
    [{ x: [-5, 5], y: [-5, 5], fns: [{ expr: '1/x', holes: [0] }] }, /the hole at x = 0 must be on the grid/],
    [{ x: [-5, 5], y: [-5, 5], shapes: [{ points: [[3, 1], [4, 1], [3, 2]], transform: { translate: [3, 0] } }] }, /its image runs off the grid/],
    [{ x: [-5, 5], y: [-5, 5], shapes: [{ points: [[1, 1], [2, 1], [1, 2]], transform: { rotate: 45 } }] }, /"rotate" must be 90, 180 or 270/],
    [{ x: [-5, 5], y: [-5, 5], shapes: [{ points: [[1, 1], [2, 1], [1, 2]], transform: { reflect: 'y=2x' } }] }, /"reflect" must be/],
    [{ x: [-5, 5], y: [-5, 5], shapes: [{ points: [[1, 1], [2, 1], [1, 2]], transform: { dilate: 1 } }] }, /"dilate" .* must be above 0, not 1/],
    [{ x: [-5, 5], y: [-5, 5], shapes: [{ points: [[1, 1], [2, 1], [1, 2]], names: ['A', 'B'] }] }, /one short name for each corner/],
    [{ x: [-5, 5], y: [-5, 5], numbering: 'roman' }, /"numbering" must be one of/],
  ];
  for (const [d, re] of cases) { assert.match(OF.check('grid', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('grid', d), /cannot be drawn/); }
});

test('transformations: the image is the true image, with primes; OF.solve gives it and the steps in words', () => {
  const r = OF.solve.grid(NEW.reflect);
  assert.deepEqual(r.shapes[0].images, [[[3, 1], [5, 3], [5, 1]]], 'over y = x: (x, y) -> (y, x)'); assert.deepEqual(r.shapes[0].steps, ['Reflect over y = x']);
  const s = OF.solve.grid(NEW.steps);
  assert.deepEqual(s.shapes[0].images, [[[-1, 1], [-1, 4], [-3, 1]], [[-2, 2], [-2, 8], [-6, 2]]]); assert.deepEqual(s.shapes[0].steps, ['Rotate 90° counterclockwise about the origin', 'Dilate by 2 from the origin']);
  const t = (tr, p) => OF.solve.grid({ x: [-9, 9], y: [-9, 9], shapes: [{ points: [p, [0, 0], [1, 0]], transform: tr }] }).shapes[0].images[0][0];
  assert.deepEqual(t({ translate: [3, -2] }, [1, 2]), [4, 0]); assert.deepEqual(t({ reflect: 'x-axis' }, [1, 2]), [1, -2]); assert.deepEqual(t({ reflect: 'y-axis' }, [1, 2]), [-1, 2]);
  assert.deepEqual(t({ reflect: 'y=-x' }, [1, 2]), [-2, -1]); assert.deepEqual(t({ reflect: { x: 3 } }, [1, 2]), [5, 2]); assert.deepEqual(t({ rotate: -90 }, [1, 2]), [2, -1]);
  assert.deepEqual(t({ rotate: 180, about: [1, 1] }, [3, 2]), [-1, 0]); assert.deepEqual(t({ dilate: 0.5, about: [2, 2] }, [6, 4]), [4, 3]);
  const svg = OF.svg('grid', NEW.steps);
  assert.equal(count(svg, 'of-image'), 2); assert.match(svg, />P′</); assert.match(svg, />Q″</); assert.equal(count(svg, 'of-center'), 2);
  assert.equal(count(OF.svg('grid', NEW.reflect), 'of-mirror'), 1);
  assert.equal(count(OF.svg('grid', NEW.steps, { hide: 'image' }), 'of-image'), 0, 'hide "image": the student draws it');
});

test('print, the frozen 1.1.0 file, and the generator', async () => {
  const F = figuresKit('1.1.0');
  for (const d of Object.values(NEW)) {
    assert.doesNotMatch(OF.svg('grid', d, { print: true }), /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1/);
    assert.equal(F.svg('grid', d, { lang: 'fr' }), OF.svg('grid', d, { lang: 'fr' }));
  }
  assert.match(figuresKit('1.0.0').svg('grid', NEW.reflect), /<svg/, '1.0.0 ignores what it does not know and still draws');
  await checkGenerator(assert, 'grid', s => s.shapes[0].images[0][0][0]);
});
