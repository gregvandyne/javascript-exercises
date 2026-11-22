// The shared formula language in radians (docs/figures-api.md "Radians"): a figure opts in with angles: "radians" and
// its formulas are rewritten before they are worked out (figures/src/radians.js), so the language itself
// (canvas/src/expr.js, frozen inside Oomba Canvas 1.3.0 and Oomba Figures 1.0.0) and everything in degrees stay as they
// were. Both sides: Oomba Figures, and Oomba Canvas's generators.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
import { radiansExpr, figExprProblem } from '../../figures/src/radians.js';
import { evalExpr } from '../../canvas/src/expr.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { canvasKit, CANVAS_LATEST } from '../../server/services/canvaskit.js';

const OF = globalThis.OombaFigures, ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('the rewrite: trig calls in radians, everything else as it is', () => {
  assert.equal(radiansExpr('2*sin(3*x) + cos(x/2)'), '2*sin((3*x)*180/pi) + cos((x/2)*180/pi)');
  assert.equal(radiansExpr('asin(0.5)'), '(asin(0.5)*pi/180)');
  assert.equal(radiansExpr('sin(cos(x))'), 'sin((cos((x)*180/pi))*180/pi)');
  for (const same of ['x^2 + 1', 'sinh(x)', 'x*sin', 'sqrt(x)', 'sin(x']) assert.equal(radiansExpr(same), same);
  assert.match(figExprProblem(`${'sin(x)+'.repeat(30)}1`, 'radians'), /shorter/); assert.equal(figExprProblem(`${'sin(x)+'.repeat(30)}1`), '');
});
test('Oomba Figures: OF.expr and the grid in radians only when asked; degrees byte for byte as before', () => {
  assert.equal(OF.expr('sin(x)', { x: 90 }), 1); assert.equal(OF.expr('sin(x)', { x: 90 }, {}), 1);
  assert.ok(Math.abs(OF.expr('sin(x)', { x: Math.PI / 2 }, { angles: 'radians' }) - 1) < 1e-12);
  assert.ok(Math.abs(OF.expr('atan(1)', {}, { angles: 'radians' }) - Math.PI / 4) < 1e-12);
  const rad = { x: [{ pi: -2 }, { pi: 2 }], y: [-2, 2], xstep: { pi: 0.5 }, ystep: 1, angles: 'radians', fns: [{ expr: 'sin(x)' }], inequalities: [{ expr: 'cos(x)', sign: '<' }] };
  const deg = { x: [{ pi: -2 }, { pi: 2 }], y: [-2, 2], xstep: { pi: 0.5 }, ystep: 1, fns: [{ expr: 'sin((x)*180/pi)' }], inequalities: [{ expr: 'cos((x)*180/pi)', sign: '<' }] };
  assert.deepEqual(OF.check('grid', rad), []); assert.equal(OF.svg('grid', rad), OF.svg('grid', deg), 'radians draw what the degree form draws');
  assert.notEqual(OF.svg('grid', { ...rad, angles: 'degrees' }), OF.svg('grid', rad));
  assert.match(OF.check('grid', { ...rad, angles: 'grads' }).join(), /"angles" must be "degrees"/);
  // the default: the same SVG as Oomba Figures 1.0.0 drew (it has no radians at all)
  const F0 = figuresKit('1.0.0'), F1 = figuresKit('1.1.0');
  for (const d of [{ x: [0, 360], y: [-2, 2], step: 45, fns: [{ expr: 'sin(x)' }, { expr: '2*cos(x)' }] }, { x: [-5, 5], y: [-5, 5], fns: [{ expr: 'x^2 - 3' }] }]) {
    assert.equal(OF.svg('grid', d), F0.svg('grid', d)); assert.equal(F1.svg('grid', d), F0.svg('grid', d));
  }
  assert.equal(F1.svg('grid', rad), OF.svg('grid', rad), 'the frozen 1.1.0 file has it too');
  assert.ok(Math.abs(OF.solve.tableOfValues({ rule: 'cos(x)', x: [Math.PI], angles: 'radians' }).pairs[0][1] + 1) < 1e-9);
});
test('Oomba Canvas: the language is untouched, its generators work in degrees, its frozen file still has it', () => {
  const src = fs.readFileSync(path.join(ROOT, 'canvas/src/expr.js'), 'utf8'), body = src.split('\n').filter(l => !/^import\s/.test(l)).map(l => l.replace(/^export\s+(?=(function|const)\b)/, '')).join('\n');
  assert.ok(fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-canvas', CANVAS_LATEST, 'oomba-canvas.js'), 'utf8').includes(body), `Oomba Canvas ${CANVAS_LATEST} carries canvas/src/expr.js as it is`);
  assert.doesNotMatch(src, /radians/i, 'no radians in the shared language: a figure opts in on its own side');
  assert.equal(evalExpr('sin(30)'), 0.49999999999999994); assert.equal(evalExpr('round(cos(60), 3)'), 0.5);
  const kit = canvasKit(), gen = { tool: 'figure.number', vars: { a: { of: [30, 90, 150] } }, q: 'sin {a}°?', fig: { kind: 'grid', x: [0, 360], y: [-2, 2], step: 30, fns: [{ expr: 'sin(x)' }] }, answer: 'sin(a)', dp: 2, work: ['sin({a}°) = {=round(sin(a), 2)}'] };
  const ps = kit.logic.deal({ config: { count: 6 }, task: { title: 'Sine' }, problems: [], gen }, { seed: 11, count: 6 });
  for (const p of ps) assert.ok([0.5, 1].includes(p.answer), `${p.answer}: degrees in a generator`);
});
