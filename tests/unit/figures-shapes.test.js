// Oomba Figures 1.1.0: measured shapes (docs/figures-api.md "Shapes") and the math label typesetter ("Math labels").
// Each kind is drawn to scale from its measures (corners where the numbers put them), refused when the measures cannot
// make it or contradict each other, and says only true things: marks on parts that really are equal or parallel, labels
// that state the true number, a square on every right angle and on no other. "Not drawn to scale" is said on the figure
// and keeps the labels true. Black on white in print, its measures left out when hidden, its name in the reader's
// language and numbers in the reader's decimal mark; a figure question generator for each kind passes the activity
// self-test; the frozen 1.1.0 file draws what the source draws.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
import { mathBox, mathText, mathValue, mathProblem } from '../../figures/src/mathtext.js';
import { FIG_WORDS } from '../../figures/src/words.js';
import { CODES } from '../../server/i18n/index.js';
import { figuresKit, figTag, FIG_LATEST } from '../../server/services/figlibs.js';
import { canvasTag, canvasKit, selfTestHtml } from '../../server/services/canvaskit.js';

const OF = globalThis.OombaFigures;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const KINDS = ['triangle', 'rectangle', 'parallelogram', 'trapezoid', 'kite', 'regularPolygon'];
const corners = s => /<polygon points="([^"]+)"[^>]*class="of-shape"/.exec(s)[1].split(' ').map(p => p.split(',').map(Number));
const dist = (p, q) => Math.hypot(q[0] - p[0], q[1] - p[1]);
const angleAt = (p, a, b) => { const u = [a[0] - p[0], a[1] - p[1]], w = [b[0] - p[0], b[1] - p[1]]; return (Math.acos((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w))) * 180) / Math.PI; };
const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
const labelText = (s, part) => { const m = new RegExp(`<g class="of-(label|name)" data-part="${part}">(.*?)</g></g>`).exec(s); return m ? [...m[2].matchAll(/>([^<]+)<\/text>/g)].map(x => x[1]).join('') : null; };
const near = (a, b, tol = 0.02) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const GOOD = {
  triangle: [{ AB: 3, BC: 4, B: 90, labels: { CA: 'x' } }, { A: 30, CA: 10, B: 90 }, { A: 40, AB: 8, CA: 11, unit: 'm' }, { AB: 10, BC: 13, CA: 13, ticks: { BC: 1, CA: 1 }, heights: ['C'], labels: { hC: 'h' } }, { A: 50, B: 60 }, { A: 30, AB: 10, BC: 6 }, { A: 30, AB: 10, BC: 6, other: true }],
  rectangle: [{ AB: 12, BC: 5, unit: 'cm' }, { AB: 7, square: true, diagonals: ['AC', 'BD'], cross: 'E' }, { AB: 13, BC: 5, labels: { AB: '2x + 3', BC: 'x' } }],
  parallelogram: [{ AB: 12, DA: 10, A: 30, heights: ['D'], labels: { hD: true } }, { AB: 6, A: 70, rhombus: true, diagonals: ['AC', 'BD'] }],
  trapezoid: [{ AB: 12, CD: 7, h: 5, A: 65 }, { type: 'isosceles', AB: 14, CD: 8, h: 4, ticks: { BC: 1, DA: 1 } }, { type: 'right', AB: 15, CD: 9, DA: 8, labels: { BC: 'x' } }],
  kite: [{ AB: 6, DA: 10, B: 110 }, { AB: 7, DA: 12, B: 80, diagonals: ['BD'] }],
  regularPolygon: [{ n: 6, side: 8 }, { n: 8, radius: 5, lines: ['radii'] }, { n: 5, apothem: [7, 2], names: true, centerName: 'O' }, { n: 3, side: 4 }, { n: 20, side: 1 }],
};

test('good data: every kind listed, no problems, one accessible <svg> with the shape and nothing undefined', () => {
  for (const k of KINDS) {
    assert.ok(OF.kinds.includes(k), k); assert.equal(typeof OF.solve[k], 'function', k);
    for (const d of GOOD[k]) {
      assert.deepEqual(OF.check(k, d), [], `${k} ${JSON.stringify(d)}`);
      const s = OF.svg(k, d, { title: 'A shape' });
      assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"[^>]*role="img" aria-label="A shape"/);
      assert.match(s, new RegExp(`class="of-fig of-${k}"`)); assert.match(s, /class="of-shape"/);
      assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/, `${k} ${JSON.stringify(d)}`);
    }
  }
});

test('OF.check: measures that cannot make the figure, or contradict themselves, are named and draw the card', () => {
  const cases = [
    ['triangle', { AB: 3, BC: 4, CA: 10 }, /cannot make a triangle: AB \+ BC has to be longer than CA/],
    ['triangle', { A: 100, B: 90, AB: 5 }, /already 190°/],
    ['triangle', { A: 60, B: 60, C: 70 }, /is 190°, not 180°/],
    ['triangle', { A: 30, AB: 10, BC: 4 }, /BC is too short to close the triangle: .* at least 5/],
    ['triangle', { AB: 3, BC: 4, CA: 5, B: 60 }, /would be 90°, not 60°/],
    ['triangle', { AB: 3, BC: 4, B: 90, CA: 6 }, /∠B would be 117.28°, not 90°/],
    ['triangle', { AB: 3, BC: 4 }, /give one more measure/],
    ['triangle', { AB: -3, BC: 4, B: 90 }, /AB must be a length/],
    ['triangle', { AB: 3, BC: 4, B: 180 }, /B must be an angle/],
    ['triangle', { AB: 3, BC: 4, B: 90, color: 'red' }, /does not take "color"/],
    ['rectangle', { AB: 12 }, /give BC/],
    ['rectangle', { AB: 12, BC: 5, DA: 5 }, /leave out "DA"/],
    ['parallelogram', { AB: 12, DA: 10, A: 90 }, /this is a rectangle/],
    ['parallelogram', { AB: 6, A: 90, rhombus: true }, /this is a square/],
    ['parallelogram', { AB: 6, DA: 6, A: 60 }, /rhombus: true/],
    ['trapezoid', { AB: 8, CD: 8, h: 3, A: 60 }, /same length this is a parallelogram/],
    ['trapezoid', { type: 'oblong', AB: 8, CD: 4, h: 3 }, /"type" must be "isosceles" or "right"/],
    ['kite', { AB: 6, DA: 4, B: 120 }, /DA is too short to reach/],
    ['kite', { AB: 6, DA: 6, B: 120 }, /this is a rhombus/],
    ['regularPolygon', { n: 2, side: 3 }, /from 3 to 20/],
    ['regularPolygon', { n: 6, side: 3, radius: 3 }, /exactly one of/],
    ['regularPolygon', { n: 6, side: 3, lines: ['diagonals'] }, /"lines" must be a list/],
    // marks and labels that would say something false
    ['rectangle', { AB: 13, BC: 5, labels: { AB: 7 } }, /AB is labeled 7 but it is 13/],
    ['rectangle', { AB: 13, BC: 5, labels: { AB: '7 cm' }, unit: 'cm' }, /AB is labeled 7 cm but it is 13/],
    ['triangle', { AB: 3, BC: 4, B: 90, labels: { CA: { sqrt: 24 } } }, /CA is labeled √24 but it is 5/],
    ['triangle', { AB: 3, BC: 4, B: 90, labels: { A: 40 } }, /∠A is labeled 40 but it is 53.13°/],
    ['triangle', { A: 50, B: 60, labels: { AB: 4, BC: 9 } }, /BC is labeled 9 but with AB labeled 4 it is/],
    ['triangle', { AB: 3, BC: 4, B: 90, ticks: { AB: 1, BC: 1 } }, /ticks claim equal sides AB and BC, but they are not/],
    ['triangle', { AB: 3, BC: 4, B: 90, arcs: { A: 1, C: 1 } }, /arcs claim equal angles/],
    ['triangle', { AB: 3, BC: 4, B: 90, arrows: { AB: 1 } }, /no two sides are parallel/],
    ['trapezoid', { AB: 12, CD: 7, h: 5, A: 65, arrows: { BC: 1, DA: 1 } }, /arrows claim parallel sides BC and DA/],
    ['triangle', { AB: 3, BC: 4, B: 90, labels: { CA: [5, 2] } }, /write a fraction as \{ "frac": \[5, 2\] \}/],
    ['triangle', { AB: 3, BC: 4, B: 90, labels: { CA: { root: 2 } } }, /a piece is/],
    ['triangle', { AB: 3, BC: 4, B: 90, drawAs: { AB: 5, BC: 2, B: 90 } }, /only goes with notToScale: true/],
    ['triangle', { AB: 3, BC: 4, B: 90, notToScale: true, drawAs: { AB: 5, BC: 2, B: 70 } }, /∠B is a right angle in the measures, so "drawAs" must draw it as one/],
    ['triangle', { AB: 3, BC: 3, B: 90, ticks: { AB: 1, BC: 1 }, notToScale: true, drawAs: { AB: 5, BC: 2, B: 90 } }, /ticks claim equal sides AB and BC, but as drawn \(drawAs\) they are not/],
  ];
  for (const [k, d, re] of cases) {
    assert.match(OF.check(k, d).join('; '), re, `${k} ${JSON.stringify(d)}`);
    assert.match(OF.svg(k, d), /cannot be drawn/, `${k}: the card`); assert.doesNotMatch(OF.svg(k, d), /of-shape/);
    assert.equal(OF.solve[k](d), null);
  }
});

test('to scale: the drawn corners have the true proportions and angles of the measures', () => {
  const [A, B, C] = corners(OF.svg('triangle', { AB: 3, BC: 4, B: 90 }));
  assert.ok(near(dist(A, B) / dist(B, C), 3 / 4) && near(dist(C, A) / dist(A, B), 5 / 3)); assert.ok(near(angleAt(B, A, C), 90, 0.001));
  const sas = corners(OF.svg('triangle', { A: 40, AB: 8, CA: 11 }));
  assert.ok(near(angleAt(sas[0], sas[1], sas[2]), 40, 0.001)); assert.ok(near(dist(sas[2], sas[0]) / dist(sas[0], sas[1]), 11 / 8));
  const r = corners(OF.svg('rectangle', { AB: 12, BC: 5 }));
  assert.ok(near(dist(r[0], r[1]) / dist(r[1], r[2]), 12 / 5)); for (let i = 0; i < 4; i++) assert.ok(near(angleAt(r[i], r[(i + 3) % 4], r[(i + 1) % 4]), 90, 0.001));
  const p = corners(OF.svg('parallelogram', { AB: 12, DA: 10, A: 30 }));
  assert.ok(near(angleAt(p[0], p[1], p[3]), 30, 0.001)); assert.ok(near(dist(p[0], p[1]) / dist(p[3], p[0]), 1.2));
  const t = corners(OF.svg('trapezoid', { type: 'isosceles', AB: 14, CD: 8, h: 4 }));
  assert.ok(near(dist(t[0], t[1]) / dist(t[2], t[3]), 14 / 8)); assert.ok(near(Math.abs(t[3][1] - t[0][1]) / dist(t[0], t[1]), 4 / 14)); assert.ok(near(dist(t[1], t[2]), dist(t[3], t[0])));
  const k = corners(OF.svg('kite', { AB: 6, DA: 10, B: 110 }));
  assert.ok(near(dist(k[0], k[1]) / dist(k[3], k[0]), 0.6)); assert.ok(near(angleAt(k[1], k[0], k[2]), 110, 0.001)); assert.ok(near(k[1][0], k[3][0], 0.001), 'upright on its line of symmetry');
  const h = corners(OF.svg('regularPolygon', { n: 6, side: 8 }));
  for (let i = 0; i < 6; i++) { assert.ok(near(dist(h[i], h[(i + 1) % 6]), dist(h[0], h[1]))); assert.ok(near(angleAt(h[i], h[(i + 5) % 6], h[(i + 1) % 6]), 120, 0.001)); }
  assert.ok(near(h[0][1], h[1][1], 0.001), 'side AB flat along the bottom');
});

test('OF.solve: the numbers the figure is drawn from (perimeter, area, heights, diagonals, the regular polygon)', () => {
  const t = OF.solve.triangle({ AB: 3, BC: 4, B: 90 });
  assert.ok(near(t.sides.CA, 5, 1e-9) && near(t.area, 6, 1e-9) && near(t.perimeter, 12, 1e-9)); assert.equal(t.right, 'B'); assert.equal(t.byAngles, 'right'); assert.equal(t.bySides, 'scalene');
  assert.ok(near(t.heights.B, 2.4, 1e-9));
  const iso = OF.solve.triangle({ AB: 10, BC: 13, CA: 13 }); assert.ok(near(iso.heights.C, 12, 1e-9)); assert.equal(iso.bySides, 'isosceles');
  const amb = [OF.solve.triangle({ A: 30, AB: 10, BC: 6 }), OF.solve.triangle({ A: 30, AB: 10, BC: 6, other: true })];
  assert.ok(amb[0].ambiguous && amb[1].ambiguous); assert.ok(near(amb[0].angles.C + amb[1].angles.C, 180, 1e-9), 'the two triangles of the ambiguous case');
  const un = OF.solve.triangle({ A: 50, B: 60 }); assert.equal(un.sized, false); assert.equal(un.area, null); assert.ok(near(un.angles.C, 70, 1e-9));
  const re = OF.solve.rectangle({ AB: 12, BC: 5 }); assert.equal(re.area, 60); assert.equal(re.perimeter, 34); assert.ok(near(re.diagonals.AC, 13, 1e-9)); assert.deepEqual(re.right, ['A', 'B', 'C', 'D']);
  assert.equal(OF.solve.rectangle({ AB: 6, square: true }).area, 36);
  const pa = OF.solve.parallelogram({ AB: 12, DA: 10, A: 30 }); assert.ok(near(pa.height, 5, 1e-9) && near(pa.area, 60, 1e-9) && near(pa.perimeter, 44, 1e-9));
  const tr = OF.solve.trapezoid({ type: 'isosceles', AB: 14, CD: 8, h: 4 }); assert.ok(near(tr.area, 44, 1e-9) && near(tr.sides.BC, 5, 1e-9) && near(tr.perimeter, 32, 1e-9));
  assert.ok(near(OF.solve.trapezoid({ type: 'right', AB: 15, CD: 9, DA: 8 }).sides.BC, 10, 1e-9)); assert.deepEqual(OF.solve.trapezoid({ type: 'right', AB: 15, CD: 9, DA: 8 }).right, ['A', 'D']);
  const ki = OF.solve.kite({ AB: 6, DA: 10, B: 110 }); assert.ok(near(ki.perimeter, 32, 1e-9) && near(ki.area, (ki.diagonals.AC * ki.diagonals.BD) / 2, 1e-9));
  const hx = OF.solve.regularPolygon({ n: 6, side: 8 }); assert.ok(near(hx.radius, 8, 1e-9) && near(hx.apothem, 4 * Math.sqrt(3), 1e-9) && near(hx.area, 96 * Math.sqrt(3), 1e-9)); assert.equal(hx.interior, 120); assert.equal(hx.exterior, 60);
  assert.ok(near(OF.solve.regularPolygon({ n: 4, radius: Math.SQRT2 }).side, 2, 1e-9));
  // a length given as a fraction or a root is drawn at its value
  assert.ok(near(OF.solve.triangle({ AB: { sqrt: 2, times: 3 }, BC: 3, B: 90 }).sides.CA, Math.sqrt(27), 1e-9)); assert.ok(near(OF.solve.rectangle({ AB: [5, 2], BC: 1 }).area, 2.5, 1e-9));
});

test('what it says: given measures, not worked-out ones; a right angle\'s square, not "90°"; labels typeset as math', () => {
  const s = OF.svg('triangle', { AB: 3, BC: 4, B: 90, labels: { CA: 'x' } });
  assert.equal(labelText(s, 'AB'), '3'); assert.equal(labelText(s, 'BC'), '4'); assert.equal(labelText(s, 'CA'), 'x'); assert.equal(labelText(s, 'B'), null, 'no "90°"');
  assert.equal(count(s, 'of-square'), 1); assert.equal(labelText(s, 'A'), null, 'a worked-out angle says nothing');
  assert.match(s, /<text[^>]*font-style="italic"[^>]*>x<\/text>/, 'a variable is italic');
  assert.equal(labelText(OF.svg('triangle', { AB: 3, BC: 4, B: 90, labels: { CA: true, A: true }, round: 0 }), 'A'), '53°');
  assert.equal(count(OF.svg('triangle', { AB: 3, BC: 4, B: 90, rightAngles: false }), 'of-square'), 0);
  assert.equal(count(OF.svg('rectangle', { AB: 12, BC: 5 }), 'of-square'), 4); assert.equal(count(OF.svg('parallelogram', { AB: 12, DA: 10, A: 30 }), 'of-square'), 0);
  assert.equal(labelText(OF.svg('rectangle', { AB: 12, BC: 5, unit: 'cm' }), 'AB'), '12cm', 'the unit after the number (its own run)');
  const root = OF.svg('triangle', { AB: { sqrt: 2, times: 3 }, BC: 3, B: 90, names: ['P', "Q'", 'R'] });
  assert.match(root, /data-part="AB"><g class="of-math"><text[^>]*>3<\/text><polyline[^>]*\/><text[^>]*>2<\/text>/, '3√2: a root sign over the 2'); assert.equal(labelText(root, 'vB'), 'Q′', 'a prime');
  const frac = OF.svg('rectangle', { AB: [5, 2], BC: 1 });
  assert.match(frac, /data-part="AB"><g class="of-math"><text[^>]*>5<\/text><text[^>]*>2<\/text><line /, '5/2 stacked over a bar');
  assert.equal(count(OF.svg('triangle', { AB: 10, BC: 13, CA: 13, ticks: { BC: 1, CA: 1 } }), 'of-tick'), 2);
  assert.equal(count(OF.svg('parallelogram', { AB: 12, DA: 10, A: 30 }), 'of-arrow'), 6, 'a parallelogram opens with its arrows: 1, 1, 2, 2');
  assert.equal(count(OF.svg('kite', { AB: 6, DA: 10, B: 110 }), 'of-tick'), 6, 'a kite opens with its ticks');
  const ht = OF.svg('triangle', { A: 120, AB: 4, CA: 4, heights: ['C'], labels: { hC: true } });
  assert.equal(count(ht, 'of-height'), 1); assert.equal(count(ht, 'of-ext'), 1, 'the base runs on, dashed, to an outside foot'); assert.equal(labelText(ht, 'hC'), '3.5');
  const hx = OF.svg('regularPolygon', { n: 6, side: 8, lines: ['apothem'], labels: { apothem: 'a' } });
  assert.equal(labelText(hx, 'apothem'), 'a'); assert.equal(count(hx, 'of-spoke'), 1); assert.equal(count(hx, 'of-center'), 1);
  const sq = OF.svg('rectangle', { AB: 7, square: true, diagonals: ['AC', 'BD'], cross: 'E' });
  assert.equal(count(sq, 'of-square'), 5, 'four corners and the diagonals crossing at right angles'); assert.equal(labelText(sq, 'x'), 'E');
});

test('not drawn to scale: the note on the figure, the proportions from drawAs, the labels and solve() from the measures', () => {
  const d = { AB: 3, BC: 4, B: 90, labels: { CA: true }, notToScale: true, drawAs: { AB: 5, BC: 2, B: 90 } };
  assert.deepEqual(OF.check('triangle', d), []);
  const s = OF.svg('triangle', d), [A, B, C] = corners(s);
  assert.ok(near(dist(A, B) / dist(B, C), 5 / 2), 'drawn as drawAs'); assert.equal(labelText(s, 'CA'), '5', 'labeled from the measures');
  assert.match(s, /class="of-note"><text[^>]*font-style="italic"[^>]*>Not drawn to scale<\/text>/); assert.equal(count(s, 'of-square'), 1);
  assert.ok(near(OF.solve.triangle(d).sides.CA, 5, 1e-9));
  assert.match(OF.svg('triangle', { AB: 3, BC: 4, B: 90, notToScale: true }), />Not drawn to scale</, 'the note without drawAs: drawn to scale');
  assert.doesNotMatch(OF.svg('triangle', { AB: 3, BC: 4, B: 90 }), /of-note/);
  assert.match(OF.svg('triangle', d, { lang: 'de' }), />Nicht maßstabsgetreu</); assert.match(OF.svg('triangle', d, { lang: 'he' }), /direction="rtl"/, 'Hebrew reads right to left in its own label');
  assert.match(OF.check('regularPolygon', { n: 6, side: 3, notToScale: true, drawAs: { side: 4 } }).join(), /needs no "drawAs"/);
});

test('print: black on white, no fill, no Oomba colors', () => {
  for (const k of KINDS) for (const d of GOOD[k]) {
    const s = OF.svg(k, { ...d, notToScale: k !== 'regularPolygon' || undefined }, { print: true });
    assert.doesNotMatch(s, /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1/, `${k}: no Oomba colors in print`);
    assert.match(s, /class="of-fill"/); assert.match(s, /<polygon points="[^"]+" fill="none" stroke="none" class="of-fill"/);
    assert.match(s, new RegExp(`class="of-fig of-${k} of-print"`));
  }
  assert.match(OF.svg('triangle', GOOD.triangle[0]), /fill="#E1F1E1"/, 'on screen: the light green fill');
});

test('hide: true leaves out every measure (names and marks stay, the same size); a part or a group leaves out its own', () => {
  const d = { AB: 10, BC: 13, CA: 13, ticks: { BC: 1, CA: 1 }, heights: ['C'], labels: { hC: 'h', C: true } };
  const full = OF.svg('triangle', d), blank = OF.svg('triangle', d, { hide: true }), vb = s => /viewBox="([^"]+)"/.exec(s)[1];
  assert.equal(count(blank, 'of-label'), 0); assert.equal(count(blank, 'of-name'), 3); assert.equal(count(blank, 'of-tick'), 2); assert.equal(count(blank, 'of-height'), 1);
  assert.ok(count(full, 'of-label') >= 4);
  assert.equal(labelText(OF.svg('triangle', d, { hide: 'CA' }), 'CA'), null); assert.equal(labelText(OF.svg('triangle', d, { hide: 'CA' }), 'BC'), '13');
  assert.equal(labelText(OF.svg('triangle', d, { hide: 'heights' }), 'hC'), null); assert.equal(labelText(OF.svg('triangle', d, { hide: 'angles' }), 'C'), null);
  assert.equal(labelText(OF.svg('triangle', d, { hide: 'sides' }), 'AB'), null); assert.equal(labelText(OF.svg('triangle', d, { hide: 'sides' }), 'hC'), 'h');
  assert.equal(labelText(OF.svg('regularPolygon', { n: 6, side: 8, lines: ['apothem'], labels: { apothem: true } }, { hide: 'apothem' }), 'apothem'), null);
  assert.ok(vb(blank) && vb(full));
});

test('languages: the kind\'s name in every site language; the reader\'s decimal mark and Latin digits; never mirrored', () => {
  const name = { triangle: 'triangle', rectangle: 'rectangle', parallelogram: 'parallelogram', trapezoid: 'trapezoid', kite: 'kite', regularPolygon: 'regularPolygon' };
  for (const c of CODES) {
    const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]];
    for (const w of [...Object.values(name), 'square', 'rhombus', 'notToScale']) assert.ok(W[w], `${c}: ${w}`);
    for (const k of KINDS) { const s = OF.svg(k, GOOD[k][0], { lang: c }); assert.ok(s.includes(`<title>${W[name[k]]}</title>`), `${c} ${k}`); assert.match(s, /direction="ltr"/); }
    assert.ok(OF.svg('rectangle', { AB: 6, square: true }, { lang: c }).includes(`<title>${W.square}</title>`));
  }
  const d = { AB: 2.5, BC: 4, B: 90, labels: { CA: true } };
  assert.equal(labelText(OF.svg('triangle', d, { lang: 'de' }), 'AB'), '2,5'); assert.equal(labelText(OF.svg('triangle', d, { lang: 'de' }), 'CA'), '4,7');
  assert.equal(labelText(OF.svg('triangle', d, { lang: 'fr' }), 'AB'), '2,5'); assert.equal(labelText(OF.svg('triangle', d, { lang: 'ar' }), 'AB'), '2.5');
  assert.doesNotMatch(OF.svg('triangle', d, { lang: 'ar' }), /[٠-٩]/); assert.equal(labelText(OF.svg('triangle', d), 'AB'), '2.5');
});

test('the math typesetter: values, problems, plain text and boxes', () => {
  assert.equal(mathValue(12), 12); assert.equal(mathValue('12'), 12); assert.equal(mathValue('−3.5'), -3.5); assert.equal(mathValue({ frac: [5, 2] }), 2.5);
  assert.ok(near(mathValue({ sqrt: 5, times: 3 }), 3 * Math.sqrt(5), 1e-12)); assert.ok(near(mathValue([3, { sqrt: 5 }]), 3 * Math.sqrt(5), 1e-12)); assert.ok(near(mathValue({ pi: 2 }), 2 * Math.PI, 1e-12));
  for (const l of ['x', '2x + 3', ['x', { sup: 2 }], { text: 'cm' }, ['a', { sub: 1 }]]) assert.equal(mathValue(l), null, JSON.stringify(l));
  assert.equal(mathText([3, { sqrt: 5 }]), '3√5'); assert.equal(mathText({ frac: [5, 2] }), '5/2'); assert.equal(mathText("A'"), 'A′'); assert.equal(mathText('x - 3'), 'x − 3'); assert.equal(mathText({ pi: 2 }), '2π');
  assert.equal(mathText(2.5, 'de'), '2,5'); assert.equal(mathText(-4), '−4');
  assert.equal(mathProblem(['x', { sup: 2 }]), null); assert.equal(mathProblem({ frac: ['x', 4], slash: true }), null);
  assert.match(mathProblem([5, 2]), /write a fraction/); assert.match(mathProblem({ frac: [1] }), /\[top, bottom\]/); assert.match(mathProblem({ sqrt: 2, power: 3 }), /does not take "power"/);
  assert.match(mathProblem('x'.repeat(40)), /30 characters/); assert.match(mathProblem('<b>'), /no control characters/); assert.match(mathProblem(Array(30).fill('x')), /too long/);
  const a = mathBox('x + 3', 20), b = mathBox('x+3', 20), f = mathBox({ frac: [1, 2] }, 20), r = mathBox({ sqrt: 2 }, 20), plain = mathBox('2', 20);
  assert.ok(near(a.w, b.w, 1e-9), 'operators get their own spaces, typed or not'); assert.ok(f.asc > plain.asc && f.desc > plain.desc, 'a stacked fraction stands taller');
  assert.ok(r.w > plain.w && r.asc > plain.asc, 'a root sign over the 2'); assert.equal(mathBox('', 20), null); assert.ok(mathBox('', 20, { suffix: '°' }).w > 0);
});

test('the frozen 1.1.0 file draws what the source draws; 1.0.0 does not know the shapes', () => {
  const F = figuresKit('1.1.0');
  for (const k of KINDS) for (const d of GOOD[k]) { assert.equal(F.svg(k, d), OF.svg(k, d), k); assert.equal(F.check(k, d).length, 0); }
  assert.equal(F.svg('triangle', GOOD.triangle[0], { print: true, lang: 'fr', hide: 'CA' }), OF.svg('triangle', GOOD.triangle[0], { print: true, lang: 'fr', hide: 'CA' }));
  const nts = { AB: 3, BC: 4, B: 90, labels: { CA: 'x' }, notToScale: true, drawAs: { AB: 5, BC: 2, B: 90 } };
  assert.equal(F.svg('triangle', nts, { lang: 'ja' }), OF.svg('triangle', nts, { lang: 'ja' })); assert.match(F.svg('triangle', nts), /Not drawn to scale/);
  for (const rel of ['figures/src/shapes.js', 'figures/src/mathtext.js', 'figures/src/ported/shapes.js', 'figures/src/ported/polygons.js']) {
    assert.doesNotMatch(fs.readFileSync(path.join(ROOT, rel), 'utf8'), /^import \{[^}]* as /m, `${rel}: no renamed imports (the bundle shares one scope)`);
  }
  assert.match(figuresKit('1.0.0').check('triangle', GOOD.triangle[0])[0], /unknown figure/);
});

// ---------------------------------------------------------------- the figure question generators (docs/figures-api.md)
const GENS = {
  triangle: { tool: 'figure.number', vars: { a: [3, 12], b: [3, 12] }, q: 'Find the length of the hypotenuse x.', fig: { kind: 'triangle', AB: '{a}', BC: '{b}', B: 90, unit: 'cm', labels: { CA: 'x' } }, answer: 'sqrt(a^2 + b^2)', dp: 1, unit: 'cm', work: ['x² = {a}² + {b}²', 'x² = {=a^2 + b^2}', 'x = √{=a^2 + b^2} = {=round(sqrt(a^2 + b^2), 1)}'] },
  rectangle: { tool: 'figure.number', vars: { l: [3, 15], w: [2, 12] }, where: 'l > w', q: 'What is the area of the rectangle?', fig: { kind: 'rectangle', AB: '{l}', BC: '{w}', unit: 'cm' }, answer: 'l*w', dp: 0, unit: 'cm²', work: ['Area = length × width', '= {l} × {w}', '= {=l*w}'] },
  parallelogram: { tool: 'figure.number', vars: { b: [6, 14], s: [4, 12, 2] }, where: 'b != s', q: 'What is the area of the parallelogram?', fig: { kind: 'parallelogram', AB: '{b}', DA: '{s}', A: 30, unit: 'm', heights: ['D'], labels: { DA: false, A: false, hD: true } }, answer: 'b*s/2', dp: 0, unit: 'm²', work: ['Area = base × height', '= {b} × {=s/2}', '= {=b*s/2}'] },
  trapezoid: { tool: 'figure.number', vars: { a: [8, 16], c: [3, 12], h: [3, 8] }, where: 'c <= a - 2', q: 'What is the area of the trapezoid?', fig: { kind: 'trapezoid', type: 'isosceles', AB: '{a}', CD: '{c}', h: '{h}', unit: 'cm', ticks: { BC: 1, DA: 1 } }, answer: '(a + c)/2*h', dp: 1, unit: 'cm²', work: ['Area = (a + b) ÷ 2 × h', '= ({a} + {c}) ÷ 2 × {h}', '= {=(a + c)/2*h}'] },
  kite: { tool: 'figure.number', vars: { a: [3, 8], d: [6, 14], b: { of: [80, 90, 100, 110] } }, where: 'd >= a + 2', q: 'The short sides of the kite are equal, and so are its long sides. What is its perimeter?', fig: { kind: 'kite', AB: '{a}', DA: '{d}', B: '{b}', labels: { B: false } }, answer: '2*(a + d)', dp: 0, work: ['Perimeter = 2 × short side + 2 × long side', '= 2 × {a} + 2 × {d}', '= {=2*(a + d)}'] },
  regularPolygon: { tool: 'figure.number', vars: { n: { of: [5, 6, 8, 9, 10, 12] } }, q: 'This polygon is regular. What is the size of each interior angle x?', fig: { kind: 'regularPolygon', n: '{n}', side: 4, center: false, labels: { side: false, angle: 'x' } }, answer: '180*(n - 2)/n', dp: 1, unit: '°', work: ['The angles add up to (n − 2) × 180° = ({n} − 2) × 180° = {=(n - 2)*180}°.', 'Each angle is {=(n - 2)*180} ÷ {n} = {=round(180*(n - 2)/n, 1)}°.'] },
};
const KEY = {
  triangle: s => s.sides.CA, rectangle: s => s.area, parallelogram: s => s.area, trapezoid: s => s.area, kite: s => s.perimeter, regularPolygon: s => s.interior,
};
const activity = data => `<title>Shapes</title>\n${figTag('oomba-figures')}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;

test('the generators (docs/figures-api.md): each passes the self-test, and every set it deals is a true figure whose key solve() agrees with', () => {
  const kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  for (const k of KINDS) {
    const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${k} practice` }, problems: [], gen: GENS[k] };
    assert.deepEqual(selfTestHtml(activity(data)), { ok: true, problems: [] }, k);
    const seen = new Set();
    for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
      const { kind, ...fig } = p.fig;
      assert.equal(kind, k); assert.equal(F.check(kind, fig).length, 0, `${k} ${JSON.stringify(fig)}`);
      const want = KEY[k](F.solve[k](fig));
      assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -(GENS[k].dp) + 1e-9, `${k}: the key ${p.answer} is the figure's ${want}`);
      seen.add(p.answer);
    }
    assert.ok(seen.size >= 4, `${k} randomized: ${[...seen].join(', ')}`);
    const sheet = kit.sheet(data, { seed: 4242, n: 4 });
    assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === k && i.work.length >= 2));
  }
  // a generator whose figure would lie is refused by name
  const bad = selfTestHtml(activity({ config: { count: 6, purpose: ['screen', 'generator'] }, task: { title: 'x' }, problems: [], gen: { ...GENS.rectangle, fig: { ...GENS.rectangle.fig, labels: { AB: 99 } } } }));
  assert.equal(bad.ok, false); assert.match(bad.problems.map(x => x.why).join('; '), /its figure \(rectangle\): AB is labeled 99/);
});
