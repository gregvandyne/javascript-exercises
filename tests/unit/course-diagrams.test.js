// The drawn diagram types added for Number Quest's fix round A2 (server/views/nq-diagrams.js, cleaned by
// server/services/diagrams.js): a coordinate grid from a labelled (0, 0), unit squares, parallel and
// perpendicular lines, a bar chart with a scale, and a timetable. Each is checked as data (the cleaner keeps
// the well-formed and drops the malformed) and as a drawing (the SVG says what the slide teaches, every text
// is phone-sized, and the drawing sits inside the extent the frame shows).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDiagram, DIAGRAM_TYPES } from '../../server/services/diagrams.js';
import { diagramSvg, diagramExtent } from '../../server/views/nq-diagrams.js';
import * as C from '../../server/services/courses.js';

const GOOD = {
  grid: { type: 'grid', cols: 5, rows: 4, point: { x: 3, y: 2 }, walk: true },
  squares: { type: 'squares', fence: true, shapes: [{ rows: 2, cols: 8, name: '8 by 2: 16 squares' }, { rows: 5, cols: 5, name: '5 by 5: 25 squares' }] },
  lines: { type: 'lines', items: [{ kind: 'parallel', name: 'parallel' }, { kind: 'perpendicular', name: 'perpendicular' }, { kind: 'crossing', name: 'just crossing' }] },
  chart: { type: 'chart', max: 20, step: 4, bars: [{ label: 'Apples', value: 12 }, { label: 'Bananas', value: 20 }, { label: 'Pears', value: 16 }] },
  table: { type: 'table', head: ['Bus', 'Leaves', 'Ride', 'Arrives'], rows: [['A', '9:10', '20 min', '9:30'], ['C', '10:50', '15 min', '11:05']], mark: 1 },
  letters: { type: 'letters', items: [{ ch: 'A', fold: true, name: 'halves match' }, { ch: 'H', fold: true, name: 'halves match' }, { ch: 'F', name: 'no fold fits' }] },
  spinner: { type: 'spinner', parts: 6, shaded: 1, left: '6 equal parts', right: '1 red part' },
  build: { type: 'build', digits: ['3', '5', '2'] },
};
const texts = svg => [...svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)"[^>]*>([^<]*)<\/text>/g)].map(m => ({ x: +m[1], y: +m[2], size: +m[3], s: m[4] }));

test('the course engine accepts the new types, and the cleaner drops malformed data', () => {
  for (const t of DIAGRAM_TYPES) assert.ok(C.VISUAL_TYPES.includes(t), `${t} is a known visual type`);
  for (const [t, v] of Object.entries(GOOD)) assert.equal(cleanDiagram(v, 'A label').type, t);
  assert.equal(cleanDiagram(GOOD.grid, ''), null, 'a diagram needs its accessible label');
  assert.equal(cleanDiagram({ ...GOOD.grid, point: { x: 9, y: 2 } }, 'L'), null, 'a point off the grid');
  assert.equal(cleanDiagram({ ...GOOD.squares, shapes: [{ rows: 0, cols: 3 }] }, 'L'), null, 'an empty rectangle');
  assert.equal(cleanDiagram({ ...GOOD.lines, items: [{ kind: 'wavy', name: 'x' }] }, 'L'), null, 'an unknown line kind');
  assert.equal(cleanDiagram({ ...GOOD.chart, step: 3 }, 'L'), null, 'a scale step that does not divide the top');
  assert.equal(cleanDiagram({ ...GOOD.chart, bars: [{ label: 'A', value: 30 }, { label: 'B', value: 2 }] }, 'L'), null, 'a bar above the scale');
  assert.equal(cleanDiagram({ ...GOOD.table, rows: [['A', '9:10']] }, 'L'), null, 'a row shorter than the head');
  assert.equal(cleanDiagram({ ...GOOD.table, mark: 5 }, 'L'), null, 'a picked row that does not exist');
  assert.equal(cleanDiagram({ type: 'grid', cols: 5, rows: 4, onclick: 'x', point: { x: 1, y: 1, evil: 1 } }, 'L').onclick, undefined, 'only known fields survive');
});

test('every diagram: phone-sized text, escaped, inside the extent the frame shows', () => {
  for (const [t, v0] of Object.entries(GOOD)) {
    const v = cleanDiagram(v0, 'A label with <b>');
    const svg = diagramSvg(v), [a, b] = diagramExtent(v);
    assert.ok(a >= 0 && b <= 56.25 && b - a > 10, `${t}: extent ${a}..${b} inside the drawing`);
    const ts = texts(svg);
    assert.ok(ts.length >= (t === 'spinner' ? 2 : 3), `${t}: it labels what it draws`);
    for (const x of ts) {
      assert.ok(x.size >= 3.4, `${t}: "${x.s}" is ${x.size} units (12 px at 390 px), not smaller`);
      assert.ok(x.y - 0.84 * x.size >= a - 0.01 && x.y + 0.28 * x.size <= b + 0.01, `${t}: "${x.s}" sits inside the extent ${a}..${b}`);
      assert.ok(x.x >= 0 && x.x <= 100, `${t}: "${x.s}" is inside the frame`);
    }
    assert.ok(!/<b>/.test(svg), `${t}: no raw markup`);
  }
});

test('grid: numbered axes from a labelled (0, 0), and (3, 2) is three units right and two up from it', () => {
  const svg = diagramSvg(GOOD.grid), ts = texts(svg);
  const origin = ts.find(x => x.s === '(0, 0)'), pt = /<circle cx="([\d.]+)" cy="([\d.]+)" r="1.9"/.exec(svg), o = /<circle cx="([\d.]+)" cy="([\d.]+)" r="1.1"/.exec(svg);
  assert.ok(origin, 'the origin is labelled (0, 0)');
  for (const n of ['1', '2', '3', '4', '5']) assert.ok(ts.some(x => x.s === n), `the axes are numbered (${n})`);
  const tick = n => ts.find(x => x.s === String(n) && x.y > 50); // an x-axis number, under the axis
  const u = tick(2).x - tick(1).x;
  assert.ok(Math.abs(tick(1).x - +o[1] - u) < 0.01, 'the first x number is one unit right of the origin');
  assert.ok(Math.abs(+pt[1] - +o[1] - 3 * u) < 0.01, 'the point is 3 units right of (0, 0)');
  assert.ok(Math.abs(+o[2] - +pt[2] - 2 * u) < 0.01, 'and 2 units up');
  assert.ok(ts.some(x => x.s === '(3, 2)') && ts.some(x => x.s === '3 right') && ts.some(x => x.s === '2 up'), 'the address and its walk are named');
  assert.ok((svg.match(/stroke="#C9C2A6"/g) || []).length === 9, 'gridlines: 5 up and 4 across');
});

test('squares: tiled unit squares, one per square unit, with each side counted', () => {
  const svg = diagramSvg(GOOD.squares);
  const cells = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)" fill="#/g)];
  assert.equal(cells.length, 16 + 25, 'one square per unit');
  assert.ok(cells.every(m => m[1] === m[2]), 'every tile is a square');
  assert.equal((svg.match(/fill="none" stroke="#1F9D63"/g) || []).length, 2, 'each shape wears its fence');
  const ts = texts(svg).map(x => x.s);
  for (const s of ['8', '2', '5', '8 by 2: 16 squares', '5 by 5: 25 squares']) assert.ok(ts.includes(s), s);
});

test('lines, chart and table draw what they name', () => {
  const lines = diagramSvg(GOOD.lines);
  assert.match(lines, /<path d="M[\d.]+ [\d.]+ H[\d.]+ V[\d.]+" fill="#/, 'the perpendicular pair has its square corner marked');
  const chart = diagramSvg(GOOD.chart), bars = [...chart.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(bars.length, 3);
  assert.ok(Math.abs(bars[0] / bars[1] - 12 / 20) < 0.01 && Math.abs(bars[2] / bars[1] - 16 / 20) < 0.01, 'bar heights are to scale');
  for (const n of ['0', '4', '8', '12', '16', '20']) assert.ok(texts(chart).some(x => x.s === n), `the scale reads ${n}`);
  const table = diagramSvg(GOOD.table), ts = texts(table).map(x => x.s);
  for (const s of ['Bus', 'Arrives', '10:50', '11:05']) assert.ok(ts.includes(s), s);
  assert.match(table, /fill="#FFF1B8"/, 'the picked row is marked');
});

test('letters, spinner and build draw what they name (fix round A4)', () => {
  assert.equal(cleanDiagram({ type: 'letters', items: [{ ch: 'ab', name: 'x' }, { ch: 'A', name: 'y' }] }, 'L'), null, 'one capital letter per panel');
  assert.equal(cleanDiagram({ type: 'spinner', parts: 6, shaded: 7 }, 'L'), null, 'no more red parts than parts');
  assert.equal(cleanDiagram({ type: 'build', digits: ['3', 'x'] }, 'L'), null, 'digits only');
  const letters = diagramSvg(GOOD.letters);
  assert.equal((letters.match(/stroke-dasharray="2 1.4"/g) || []).length, 2, 'a fold line on A and H only, none on F');
  const ax = texts(letters).find(t => t.s === 'A').x;
  assert.match(letters, new RegExp(`<line x1="${ax}" y1="10" x2="${ax}" y2="36"`), 'the fold runs straight down the middle of the letter');
  const spin = diagramSvg(GOOD.spinner);
  assert.equal((spin.match(/<path d="M50 25 L/g) || []).length, 6, 'six equal parts of one circle');
  assert.equal((spin.match(/fill="#E9465C"/g) || []).length, 1, 'one of them red');
  assert.ok(texts(spin).some(t => t.s === '1 red part') && texts(spin).some(t => t.s === '6 equal parts'));
  const build = diagramSvg(GOOD.build), ts = texts(build);
  const top = ts.filter(t => t.y < 25).map(t => t.x), bottom = ts.filter(t => t.y > 40).map(t => t.x);
  assert.deepEqual(ts.filter(t => t.y > 40).map(t => t.s), ['3', '5', '2'], 'joined: 3, 5, 2 reads 352');
  assert.ok(top[1] - top[0] > bottom[1] - bottom[0], 'the cards are apart on top and joined below');
  assert.match(build, /<rect x="[\d.]+" y="33" width="36"/, 'one joined card holds all three digits');
});
