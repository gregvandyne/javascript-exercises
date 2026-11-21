// Figures "Draw it" geometry (public/js/figures-draw-geom.js): corners on whole numbers to exact lengths (k√r), angles,
// the shoelace area and the type; drawings that are not a shape (two corners on one dot, three in a line, sides that
// cross); quadrilaterals named by exact tests; each drawn shape turned into its kind's real data, which Oomba Figures
// draws and solves to the drawing's own measures; the coordinate grid twin; links; a preset's drawing kept by the
// server; and every "Draw it" word in English and the 11 translated languages, with no em dashes.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
import * as G from '../../public/js/figures-draw-geom.js';

const OF = globalThis.OombaFigures;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

test('exact lengths: √ in simplest form, as shape data and as text; sums with like terms together', () => {
  assert.deepEqual(G.rootParts(72), [6, 2]);
  assert.deepEqual([25, 13, 20, 8, 1].map(G.exactLength), [5, { sqrt: 13 }, { sqrt: 5, times: 2 }, { sqrt: 2, times: 2 }, 1]);
  assert.deepEqual([25, 13, 20, 18].map(G.lengthText), ['5', '√13', '2√5', '3√2']);
  assert.equal(G.sumText([9, 13, 4]), '5 + √13');
  assert.equal(G.sumText([8, 2, 25]), '5 + 3√2');
  assert.ok(near(G.lengthValue({ sqrt: 5, times: 2 }), 2 * Math.sqrt(5)));
  assert.equal(G.lengthValue([7, 2]), 3.5);
  assert.equal(G.lengthLabel({ sqrt: 13 }), '√13'); assert.equal(G.lengthLabel(4), '');
});

test('a triangle from its corners: sides, angles, perimeter, shoelace area and type', () => {
  const a = G.analyze([[1, 1], [4, 1], [1, 3]]);
  assert.equal(a.ok, true);
  assert.deepEqual(a.sides.map(s => [s.name, s.text]), [['AB', '3'], ['BC', '√13'], ['CA', '2']]);
  assert.deepEqual(a.angles.map(g => [g.name, Math.round(g.deg * 10) / 10, g.right]), [['A', 90, true], ['B', 33.7, false], ['C', 56.3, false]]);
  assert.ok(near(a.angles.reduce((s, g) => s + g.deg, 0), 180));
  assert.equal(a.area, 3); assert.equal(a.perimeterText, '5 + √13');
  assert.deepEqual(G.triangleType(a), { byAngles: 'right', bySides: 'scalene', right: 'A' });
  assert.deepEqual(G.triangleType(G.analyze([[1, 1], [7, 1], [4, 6]])), { byAngles: 'acute', bySides: 'isosceles', right: null });
  assert.deepEqual(G.triangleType(G.analyze([[2, 1], [8, 1], [1, 4]])), { byAngles: 'obtuse', bySides: 'scalene', right: null });
  assert.equal(G.analyze([[0, 0], [7, 1], [3, 5]]).area, 16); // shoelace: |0·1 − 7·0 + 7·5 − 3·1 + 3·0 − 0·5| / 2
  // the same corners clockwise: the same measures
  assert.deepEqual(G.analyze([[1, 3], [4, 1], [1, 1]]).angles.map(g => Math.round(g.deg)), [56, 34, 90]);
});

test('drawings that are not a shape never become data', () => {
  assert.deepEqual(G.toData('triangle', [[1, 1], [4, 1]]), { ok: false, why: 'few', need: 1 });
  assert.equal(G.toData('triangle', [[1, 1], [1, 1], [4, 2]]).why, 'same');
  assert.equal(G.toData('triangle', [[1, 1], [3, 3], [5, 5]]).why, 'line');
  assert.equal(G.toData('rectangle', [[1, 1], [4, 1], [7, 1], [4, 5]]).why, 'line');
  assert.equal(G.toData('kite', [[1, 1], [5, 5], [5, 1], [1, 5]]).why, 'cross', 'a bow tie');
  assert.equal(G.toData('grid', [[0, 0], [4, 0], [4, 4], [2, -1], [0, 4]]).why, 'cross');
});

test('quadrilaterals are named by exact tests', () => {
  const type = pts => G.quadType(G.analyze(pts));
  assert.equal(type([[3, 1], [7, 3], [5, 7], [1, 5]]).type, 'square', 'a tilted square');
  assert.equal(type([[1, 1], [7, 1], [7, 4], [1, 4]]).type, 'rectangle');
  assert.equal(type([[1, 1], [6, 1], [9, 5], [4, 5]]).type, 'rhombus');
  assert.equal(type([[1, 1], [6, 1], [8, 4], [3, 4]]).type, 'parallelogram');
  assert.deepEqual(type([[1, 1], [9, 1], [7, 5], [3, 5]]), { type: 'trapezoid', pair: 0, isosceles: true, right: false });
  assert.deepEqual(type([[1, 1], [8, 1], [5, 5], [1, 5]]), { type: 'trapezoid', pair: 0, isosceles: false, right: true });
  assert.equal(type([[5, 1], [7, 3], [5, 9], [3, 3]]).type, 'kite');
  assert.equal(type([[1, 1], [5, 1], [3, 3], [3, 8]]).type, 'concave');
  assert.equal(type([[1, 1], [6, 2], [5, 5], [1, 4]]).type, 'quad');
});

test('each drawn shape becomes its kind\'s real data: Oomba Figures draws it and solves it to the drawing\'s measures', () => {
  const cases = [
    ['triangle', [[1, 1], [4, 1], [1, 3]], { AB: 3, BC: { sqrt: 13 }, CA: 2, A: 90 }],
    ['triangle', [[1, 1], [8, 1], [2, 4]], { AB: 7, BC: { sqrt: 5, times: 3 }, CA: { sqrt: 10 } }],
    ['triangle', [[2, 1], [8, 1], [1, 4]], { AB: 6, BC: { sqrt: 58 }, CA: { sqrt: 10 } }],
    ['rectangle', [[1, 1], [7, 1], [7, 4], [1, 4]], { AB: 6, BC: 3 }],
    ['rectangle', [[3, 1], [7, 3], [5, 7], [1, 5]], { AB: { sqrt: 5, times: 2 }, square: true }],
    ['parallelogram', [[1, 1], [6, 1], [8, 4], [3, 4]], { AB: 5, DA: { sqrt: 13 }, A: 56.3099, labels: { A: 56.3 } }],
    ['parallelogram', [[1, 1], [6, 1], [9, 5], [4, 5]], { AB: 5, A: 53.1301, labels: { A: 53.1 }, rhombus: true }],
    ['trapezoid', [[1, 1], [9, 1], [7, 5], [3, 5]], { type: 'isosceles', AB: 8, CD: 4, h: 4 }],
    ['trapezoid', [[8, 1], [1, 1], [1, 5], [5, 5]], { type: 'right', AB: 7, CD: 4, DA: 4 }],
    ['trapezoid', [[1, 1], [9, 1], [6, 5], [2, 5]], { AB: 8, CD: 4, h: 4, A: 75.9638, labels: { A: 76 } }],
    ['trapezoid', [[3, 5], [7, 5], [9, 1], [1, 1]], { type: 'isosceles', AB: 8, CD: 4, h: 4 }],
    ['trapezoid', [[1, 1], [4, 4], [4, 7], [1, 8]], { AB: 7, CD: 3, h: 3, A: 71.5651, labels: { A: 71.6 } }],
    ['kite', [[5, 1], [7, 3], [5, 9], [3, 3]], { AB: { sqrt: 2, times: 2 }, DA: { sqrt: 10, times: 2 }, B: 90 }],
  ];
  for (const [kind, pts, want] of cases) {
    const r = G.toData(kind, pts);
    assert.equal(r.ok, true, `${kind} ${JSON.stringify(pts)}`);
    assert.deepEqual(r.data, want, `${kind} ${JSON.stringify(pts)}`);
    assert.deepEqual(OF.check(kind, r.data), [], `${kind} draws`);
    const s = OF.solve[kind](r.data), a = G.analyze(r.order.map(i => pts[i]));
    assert.ok(near(s.area, a.area, 1e-3), `${kind} area ${s.area} = ${a.area}`);
    assert.ok(near(s.perimeter, a.perimeter, 1e-3), `${kind} perimeter`);
    for (const side of a.sides) if (s.sides && s.sides[side.name] !== undefined) assert.ok(near(s.sides[side.name], side.value, 1e-3), `${kind} ${side.name}`);
    for (const g of a.angles) if (s.angles && s.angles[g.name] !== undefined) assert.ok(near(s.angles[g.name], g.deg, 1e-3), `${kind} ∠${g.name}`);
    assert.match(OF.svg(kind, r.data), /class="of-shape"/);
  }
  // a right triangle's square sits on its right angle
  assert.match(OF.svg('triangle', G.toData('triangle', [[1, 4], [1, 1], [5, 1]]).data), /of-right|rightAngle|square/);
});

test('only that kind is taken: the shape it is, and the editor that draws it', () => {
  const r = (kind, pts) => { const x = G.toData(kind, pts); return [x.why, x.type, x.kind, x.special]; };
  assert.deepEqual(r('trapezoid', [[1, 1], [6, 1], [8, 4], [3, 4]]), ['kind', 'parallelogram', 'parallelogram', false]);
  assert.deepEqual(r('rectangle', [[1, 1], [9, 1], [7, 5], [3, 5]]), ['kind', 'trapezoid', 'trapezoid', false]);
  assert.deepEqual(r('parallelogram', [[1, 1], [5, 1], [5, 4], [1, 4]]), ['kind', 'rectangle', 'rectangle', true]);
  assert.deepEqual(r('parallelogram', [[1, 1], [4, 1], [4, 4], [1, 4]]), ['kind', 'square', 'rectangle', true]);
  assert.deepEqual(r('kite', [[1, 1], [6, 1], [9, 5], [4, 5]]), ['kind', 'rhombus', 'parallelogram', true]);
  assert.deepEqual(r('kite', [[1, 1], [5, 1], [3, 3], [3, 8]]), ['kind', 'concave', 'grid', false]);
  assert.deepEqual(r('rectangle', [[1, 1], [6, 2], [5, 5], [1, 4]]), ['kind', 'quad', 'grid', false]);
});

test('the coordinate grid: any polygon of 3 to 10 corners, and the drawn shape\'s twin, both drawable', () => {
  const r = G.toData('grid', [[-3, -2], [2, -3], [4, 1], [0, 4], [-4, 2]], { range: { x: [-5, 5], y: [-5, 5] } });
  assert.deepEqual(r.data, { x: [-5, 5], y: [-5, 5], shapes: [{ points: [[-3, -2], [2, -3], [4, 1], [0, 4], [-4, 2]], names: ['A', 'B', 'C', 'D', 'E'] }] });
  assert.deepEqual(OF.check('grid', r.data), []);
  const g = G.gridData([[1, 1], [4, 1], [1, 3]], { x: [0, 10], y: [0, 10] });
  assert.deepEqual(OF.check('grid', g), []);
  assert.match(OF.svg('grid', g), />C</);
  assert.equal(G.ptsText([[1, 1], [-4, 2]]), '1,1;-4,2');
  assert.deepEqual(G.parsePts('1,1;-4,2'), [[1, 1], [-4, 2]]);
  for (const bad of ['', null, '1,1;2', '1.5,1', '99,1', Array(12).fill('1,1').join(';')]) assert.equal(G.parsePts(bad), null, String(bad));
});

test('a preset saved in Draw it keeps its drawing; the figure data never carries it', async () => {
  const { createUser } = await import('../../server/auth.js');
  const F = await import('../../server/services/figures.js');
  const u = createUser({ username: 'FigDrawPreset', password: 'secret123', role: 'admin' });
  const r = F.savePreset(u, { kind: 'triangle', name: 'Drawn', data: { AB: 3, BC: { sqrt: 13 }, CA: 2, A: 90 }, draw: { pts: [[1, 1], [4, 1], [1, 3]], n: 10, o: [0, 0] } });
  assert.equal(r.ok, true);
  assert.deepEqual(r.preset.draw, { pts: [[1, 1], [4, 1], [1, 3]], n: 10, o: [0, 0] });
  const p = F.listPresets(u, 'triangle')[0];
  assert.deepEqual(p.data, { AB: 3, BC: { sqrt: 13 }, CA: 2, A: 90 });
  assert.deepEqual(p.draw.pts, [[1, 1], [4, 1], [1, 3]]);
  F.savePreset(u, { kind: 'triangle', name: 'Typed', data: { AB: 3, BC: 4, B: 90 }, draw: { pts: [[1, 1], ['x', 2]] } });
  assert.equal(F.listPresets(u, 'triangle').find(x => x.name === 'Typed').draw, undefined, 'a bad drawing is left out');
  assert.equal(F.cleanDraw({ pts: [[1, 1], [2, 2], [3, 1]], n: 7, o: [0.5, 0] }).n, 10);
});

test('words: every Draw it key the code uses is in English and the 11 translated languages, placeholders kept, no em dashes', () => {
  const src = ['public/js/figures-editor.js', 'public/js/figures-draw.js'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const used = new Set([...src.matchAll(/\bD\(\s*'([\w.]+)'/g)].map(m => m[1]));
  for (const p of ['help.triangle', 'help.quad', 'help.grid', 'ex.right', 'ex.isosceles', 'ex.obtuse', 'ex.pentagon', 'same', 'line', 'cross', 'cannot']) used.add(p);
  for (const t of ['square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid', 'isoTrapezoid', 'rightTrapezoid', 'kite', 'quad', 'concave', 'polygon']) used.add(`t.${t}`);
  for (const t of ['square', 'rectangle', 'rhombus', 'parallelogram', 'trapezoid', 'kite', 'quad', 'concave']) used.add(`a.${t}`);
  for (const t of ['right', 'acute', 'obtuse', 'scalene', 'isosceles', 'equilateral']) used.add(`tri.${t}`);
  for (const k of ['rectangle', 'parallelogram', 'trapezoid', 'kite', 'grid']) used.add(`open.${k}`);
  const get = (o, k) => k.split('.').reduce((x, p) => (x && typeof x === 'object' ? x[p] : undefined), o);
  const load = c => JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${c}.json`), 'utf8')).js['figures-editor'].draw;
  const en = load('en');
  for (const k of used) assert.equal(typeof get(en, k), 'string', `en ${k}`);
  const holes = s => [...String(s).matchAll(/\{(\w+)[,}]/g)].map(m => m[1]).sort().join();
  for (const c of ['pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) {
    const l = load(c);
    for (const k of used) {
      assert.equal(typeof get(l, k), 'string', `${c} ${k}`);
      assert.doesNotMatch(get(l, k), /\u2014/, `${c} ${k}`);
      assert.equal([...new Set(holes(get(l, k)).split(','))].join(), [...new Set(holes(get(en, k)).split(','))].join(), `${c} ${k} placeholders`);
    }
  }
  assert.doesNotMatch(JSON.stringify(en), /\u2014|colour|centre/);
});
