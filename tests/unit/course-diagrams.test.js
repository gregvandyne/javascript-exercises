// The drawn diagram types added for Number Quest's fix round A2 (server/views/nq-diagrams.js, cleaned by
// server/services/diagrams.js): a coordinate grid from a labelled (0, 0), unit squares, parallel and
// perpendicular lines, a bar chart with a scale, and a timetable. Each is checked as data (the cleaner keeps
// the well-formed and drops the malformed) and as a drawing (the SVG says what the slide teaches, every text
// is phone-sized, and the drawing sits inside the extent the frame shows).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cleanDiagram, DIAGRAM_TYPES } from '../../server/services/diagrams.js';
import { diagramSvg, diagramExtent, diagramParts, diagramAlt } from '../../server/views/nq-diagrams.js';
import { PRO_DIAGRAM_TYPES, minus, fmt } from '../../server/services/diagrams-pro.js';
import { sayLabel } from '../../server/views/nq-diagrams-pro.js';
import { visualSvg, frameOf } from '../../server/views/courses.js';
import crypto from 'node:crypto';
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
  swap: { type: 'swap', before: ['2', '1'], after: ['1', '2'], mark: [0, 1] },
  split: { type: 'split', whole: '3 kg 400 g', parts: [{ w: 0.882, label: '3,000 g' }, { w: 0.118, label: '400 g' }] },
  ladder: { type: 'ladder', words: ['certain', 'likely', 'even chance', 'unlikely', 'impossible'] },
  fix: { type: 'fix', wrong: '7 × 8 = 54', steps: ['7 × 4 = 28', '28 + 28 = 56'], right: '7 × 8 = 56' },
  counters: { type: 'counters', groups: [{ n: 14, frame: true }] },
  // the Pro pack (services/diagrams-pro.js, views/nq-diagrams-pro.js)
  plane: { type: 'plane', x: [-4, 6], y: [-3, 7], points: [{ x: 1, y: 1, label: 'A (1, 1)' }, { x: 3, y: 5 }], lines: [{ m: 2, b: -1, label: 'y = 2x − 1' }], slope: { from: [1, 1], to: [3, 5] } },
  double: { type: 'double', top: 'Cups of flour', bottom: 'Cookies', ticks: [[0, 0], [2, 12], [4, 24], [6, '?']] },
  boxplot: { type: 'boxplot', min: 0, max: 20, step: 2, unit: 'Points scored', plots: [{ name: 'Team A', five: [2, 5, 8, 12, 18] }] },
  angles: { type: 'angles', layout: 'line', angles: [{ deg: 40 }, { deg: 90 }, { deg: 50, label: '?' }] },
  righttriangle: { type: 'righttriangle', base: 4, height: 3, labels: { base: '4 cm', height: '3 cm', hyp: '?' } },
  net: { type: 'net', solid: 'box', dims: [5, 3, 2], labels: ['5 cm', '3 cm', '2 cm'] },
  flow: { type: 'flow', values: ['?', '15', '17'], ops: ['× 3', '+ 2'], undo: ['÷ 3', '− 2'] },
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

test('swap, split and ladder (fix round A6) draw every word at 13 px or more on a phone (4.0 units and up)', () => {
  for (const t of ['swap', 'split', 'ladder']) {
    for (const x of texts(diagramSvg(cleanDiagram(GOOD[t], 'L')))) if (!/^\d$/.test(x.s) || t !== 'swap') assert.ok(x.size >= 4, `${t}: "${x.s}" at ${x.size}`);
  }
  const split = diagramSvg(cleanDiagram(GOOD.split, 'L')), parts = [...split.matchAll(/<rect x="([\d.]+)" y="22" width="([\d.]+)"/g)].map(m => +m[2]);
  assert.ok(Math.abs(parts[0] / (parts[0] + parts[1]) - 0.882) < 0.01, 'parts to scale');
  const narrow = texts(split).find(x => x.s === '400 g');
  assert.ok(narrow.x <= 94 && narrow.size >= 4, 'a narrow part keeps a phone-sized name, inside the frame');
  assert.deepEqual(texts(diagramSvg(cleanDiagram(GOOD.ladder, 'L'))).filter(x => x.size === 4.2).map(x => x.s), GOOD.ladder.words, 'most likely at the top');
  assert.equal(cleanDiagram({ type: 'split', parts: [{ w: 0.5, label: 'a' }, { w: 0.2, label: 'b' }] }, 'L'), null, 'parts make the whole');
  assert.equal(cleanDiagram({ type: 'swap', before: ['2', '1'], after: ['1', '2'], mark: [5] }, 'L'), null);
});

test('fix (the Jumble beats): the wrong answer struck through over the trick and the right answer, phone-sized, inside its extent', () => {
  const v = cleanDiagram(GOOD.fix, 'The Jumble said 54 for 7 × 8');
  assert.deepEqual(v, { type: 'fix', label: 'The Jumble said 54 for 7 × 8', ...GOOD.fix });
  const svg = diagramSvg(v), ts = texts(svg), [a, b] = diagramExtent(v);
  for (const x of ts) assert.ok(x.size >= 4.2, `"${x.s}" at ${x.size}`);
  const at = s => ts.find(x => x.s === s);
  assert.ok(at('The Jumble says') && at('not right') && at('Fix it'), 'the default card names');
  assert.ok(at('7 × 8 = 54').y < at('7 × 4 = 28').y && at('7 × 4 = 28').y < at('28 + 28 = 56').y, 'the mistake first, then the trick, step by step');
  assert.ok(at('7 × 8 = 56').x > at('7 × 4 = 28').x, 'the right answer beside the steps, in its pill');
  assert.match(svg, /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1" stroke="#C2431F"/, 'the wrong answer is struck through');
  for (const x of ts) assert.ok(x.y - 0.84 * x.size >= a && x.y + 0.28 * x.size <= b + 0.01, `"${x.s}" inside the extent [${a}, ${b}]`);
  assert.ok(b <= 56.25, 'two steps fit the frame');
  assert.equal(cleanDiagram({ ...GOOD.fix, steps: [] }, 'L'), null, 'a fix needs its trick');
  assert.equal(cleanDiagram({ ...GOOD.fix, steps: ['a', 'b', 'c'] }, 'L'), null, 'at most two steps (a third would push the fix card out of the frame)');
  assert.equal(cleanDiagram({ ...GOOD.fix, wrong: 'x'.repeat(19) }, 'L'), null, 'every line fits its card (18 characters)');
});

test('a bar model marked big keeps the flag through the course engine', async () => {
  const C = await import('../../server/services/courses.js');
  assert.ok(C.VISUAL_TYPES.includes('ladder') && C.VISUAL_TYPES.includes('split') && C.VISUAL_TYPES.includes('swap'));
  const views = fs.readFileSync(new URL('../../server/views/courses.js', import.meta.url), 'utf8');
  assert.match(views, /const BIG_ROW = 4\.1, BIG_PART = 4\.1, BIG_HALF = 4\.0;/);
  assert.match(fs.readFileSync(new URL('../../server/services/courses.js', import.meta.url), 'utf8'), /\.\.\.\(v\.big \? \{ big: true \} : \{\}\)/);
});

test('counters (Launchpad Unit 1): rows to count, rows matched one to one, and the ten-frame draw exactly their numbers', () => {
  const circles = svg => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="(#[0-9A-F]+)"/g)].map(m => ({ x: +m[1], y: +m[2], r: +m[3], fill: m[4] }));
  // one group, numbered: 12 counters in a row of ten and a row of two, numbered 1 to 12 in order
  const line = cleanDiagram({ type: 'counters', groups: [{ n: 12, count: true, name: '12 apples' }] }, 'Twelve apples');
  const ls = diagramSvg(line), lc = circles(ls);
  assert.equal(lc.length, 12);
  assert.equal(new Set(lc.slice(0, 10).map(c => c.y)).size, 1, 'ten in the top row'); assert.ok(lc[10].y > lc[0].y && lc[10].x === lc[0].x, 'the eleventh starts the next row under the first');
  assert.deepEqual(texts(ls).filter(t => /^\d+$/.test(t.s)).map(t => +t.s), Array.from({ length: 12 }, (_, i) => i + 1), 'one number on each counter, in order');
  // two groups: matched pairs share an x, one dashed line a pair, the extras stick out
  const match = cleanDiagram({ type: 'counters', groups: [{ n: 5, name: 'apples' }, { n: 3, name: 'lemons', tone: 1 }] }, '5 over 3'), ms = diagramSvg(match), mc = circles(ms);
  const top = mc.filter(c => c.y === mc[0].y), bottom = mc.filter(c => c.y !== mc[0].y);
  assert.equal(top.length, 5); assert.equal(bottom.length, 3);
  assert.deepEqual(bottom.map(c => c.x), top.slice(0, 3).map(c => c.x), 'each lemon sits under an apple');
  assert.equal((ms.match(/stroke-dasharray="1.4 1.1"/g) || []).length, 3, 'one matching line for each pair');
  // the ten-frame: ten cells, the first ten counters inside them, the rest beside it, and the two numbers under them
  for (const n of [10, 14, 19, 20, 7]) {
    const v = cleanDiagram({ type: 'counters', groups: [{ n, frame: true }] }, 'A ten-frame'), svg = diagramSvg(v), cs = circles(svg);
    const cells = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="7" height="7"/g)].map(m => ({ x: +m[1], y: +m[2] }));
    assert.equal(cells.length, 10, 'a 2 by 5 frame'); assert.equal(cs.length, n);
    const right = Math.max(...cells.map(c => c.x)) + 7;
    assert.equal(cs.filter(c => c.x < right).length, Math.min(n, 10), `${n}: the first ten sit in the frame`);
    assert.equal(cs.filter(c => c.x > right).length, Math.max(0, n - 10), `${n}: the rest sit beside it`);
    assert.deepEqual(texts(svg).filter(t => /^\d+$/.test(t.s)).map(t => +t.s), n > 10 ? [10, n - 10] : [n], `${n}: ten and the ones named under them`);
    const [a, b] = diagramExtent(v);
    for (const c of cs) assert.ok(c.y - c.r >= a && c.y + c.r <= b && c.x - c.r >= 0 && c.x + c.r <= 100, `${n}: every counter inside the frame`);
  }
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 21 }] }, 'L'), null, 'at most 20');
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 12 }, { n: 3 }] }, 'L'), null, 'two rows to match hold at most ten each');
  assert.equal(cleanDiagram({ type: 'counters', groups: [] }, 'L'), null);
});

test('counters in two parts (Launchpad Unit 2): split shows a number as two parts, away empties the second, a ten-frame keeps its ten spots', () => {
  const circles = svg => [...svg.matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="(#[0-9A-F]+)"[^>]*?(stroke-dasharray="[^"]*")?\/>/g)].map(m => ({ x: +m[1], y: +m[2], r: +m[3], fill: m[4], dashed: !!m[5] }));
  // 5 is 3 and 2: one row, the first three in one tone, a gap, two in the next tone, and "3" and "2" under the parts
  const v = cleanDiagram({ type: 'counters', groups: [{ n: 5, split: 3 }] }, '3 frogs and 2 more'), svg = diagramSvg(v), cs = circles(svg);
  assert.deepEqual(v.groups, [{ n: 5, split: 3 }]);
  assert.equal(cs.length, 5); assert.equal(new Set(cs.map(c => c.y)).size, 1, 'one row');
  assert.equal(new Set(cs.slice(0, 3).map(c => c.fill)).size, 1); assert.equal(new Set(cs.slice(3).map(c => c.fill)).size, 1); assert.notEqual(cs[0].fill, cs[3].fill, 'the two parts differ in tone');
  const step = cs[1].x - cs[0].x;
  assert.ok(cs[3].x - cs[2].x > step + 2, 'a gap between the parts'); assert.equal(+(cs[4].x - cs[3].x).toFixed(2), +step.toFixed(2));
  assert.equal(+(((cs[0].x - cs[0].r) + (cs[4].x + cs[4].r)) / 2).toFixed(1), 50, 'centred');
  const nums = texts(svg).filter(t => /^\d+$/.test(t.s));
  assert.deepEqual(nums.map(t => +t.s), [3, 2], 'each part named by its size');
  assert.equal(+nums[0].x.toFixed(1), +cs[1].x.toFixed(1), 'under the middle of its part'); assert.ok(nums[0].y > cs[0].y + cs[0].r);
  // numbered counters count on across the gap: 1 2 3 4, then 5 6 7
  const on = diagramSvg(cleanDiagram({ type: 'counters', groups: [{ n: 7, split: 4, count: true }] }, '4 and 3 more'));
  assert.deepEqual(texts(on).filter(t => /^\d+$/.test(t.s)).map(t => +t.s), [1, 2, 3, 4, 5, 6, 7, 4, 3]);
  // away: the second part is drawn as dashed outlines (they went away); the first part is untouched
  const away = circles(diagramSvg(cleanDiagram({ type: 'counters', groups: [{ n: 5, split: 3, away: true }] }, '2 hop away')));
  assert.deepEqual(away.map(c => c.dashed), [false, false, false, true, true]); assert.deepEqual(away.slice(3).map(c => c.fill), ['#FFFFFF', '#FFFFFF']);
  // in a ten-frame the split only changes the tone after the first part: ten counters in ten cells, "10" under them
  const f = cleanDiagram({ type: 'counters', groups: [{ n: 10, frame: true, split: 8 }] }, '8 and 2 make 10'), fs2 = diagramSvg(f), fc = circles(fs2);
  assert.equal(fc.length, 10); assert.equal(new Set(fc.slice(0, 8).map(c => c.fill)).size, 1); assert.equal(new Set(fc.slice(8).map(c => c.fill)).size, 1); assert.notEqual(fc[0].fill, fc[9].fill);
  assert.deepEqual(texts(fs2).filter(t => /^\d+$/.test(t.s)).map(t => +t.s), [10]);
  for (const g of [{ n: 5, split: 3 }, { n: 10, split: 1 }, { n: 2, split: 1, away: true }, { n: 10, split: 9, count: true }]) {
    const d = cleanDiagram({ type: 'counters', groups: [g] }, 'Two parts'), [a, b] = diagramExtent(d);
    for (const c of circles(diagramSvg(d))) assert.ok(c.y - c.r >= a && c.y + c.r <= b && c.x - c.r >= 0 && c.x + c.r <= 100, JSON.stringify(g) + ': every counter inside the frame');
    for (const t of texts(diagramSvg(d))) assert.ok(t.y <= b, JSON.stringify(g) + ': every number inside the band');
  }
  // only a real split of one group of 2 to 10: both parts hold a counter, and away needs a split and no frame
  for (const g of [{ n: 12, split: 3 }, { n: 5, split: 5 }, { n: 5, split: 0 }, { n: 5, split: 2.5 }, { n: 5, away: true }, { n: 10, frame: true, split: 8, away: true }])
    assert.equal(cleanDiagram({ type: 'counters', groups: [g] }, 'L'), null, JSON.stringify(g));
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 5, split: 2 }, { n: 3 }] }, 'L'), null, 'two rows to match are never split');
});

test('counters as tens and ones (Launchpad Unit 3): sticks of ten and loose ones draw exactly the number, alone or two side by side', () => {
  const rects = (svg, fill) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-F]+)"/g)].filter(m => m[5] === fill).map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  const STICK = '#8FC1F5', ONE = '#F2A65A';
  // 34: three sticks, each cut into ten blocks by nine lines, four loose ones standing on the same floor, both parts named
  const v = cleanDiagram({ type: 'counters', groups: [{ n: 34, tens: true }] }, '34 as tens and ones'), svg = diagramSvg(v);
  assert.deepEqual(v.groups, [{ n: 34, tens: true }]);
  const sticks = rects(svg, STICK), ones = rects(svg, ONE);
  assert.equal(sticks.length, 3); assert.equal(ones.length, 4);
  assert.equal((svg.match(/<line /g) || []).length, 27, 'nine lines a stick: ten blocks each');
  assert.ok(sticks.every(s => s.h === sticks[0].h && s.y === sticks[0].y && s.h >= 9 * s.w / 2), 'tall sticks of one size');
  assert.ok(ones.every(o => o.w === o.h && o.x > sticks[2].x + sticks[2].w), 'square ones to the right of the tens');
  assert.equal(+Math.max(...ones.map(o => o.y + o.h)).toFixed(2), +(sticks[0].y + sticks[0].h).toFixed(2), 'the ones stand on the same floor as the sticks');
  assert.equal(+((sticks[0].x + Math.max(...ones.map(o => o.x + o.w))) / 2).toFixed(1), 50, 'centred');
  assert.deepEqual(texts(svg).map(t => t.s).filter(t => /^\d+ (tens?|ones?)$/.test(t)), ['3 tens', '4 ones']);
  // one of each is named in the singular; no loose ones, no ones name; more than five ones take a second column
  const names = n => texts(diagramSvg(cleanDiagram({ type: 'counters', groups: [{ n, tens: true }] }, 'A number as tens and ones'))).map(t => t.s).filter(t => /^\d+ (tens?|ones?)$/.test(t));
  assert.deepEqual(names(11), ['1 ten', '1 one']); assert.deepEqual(names(60), ['6 tens']); assert.deepEqual(names(99), ['9 tens', '9 ones']);
  const nine = rects(diagramSvg(cleanDiagram({ type: 'counters', groups: [{ n: 19, tens: true }] }, 'Nineteen as tens and ones')), ONE);
  assert.equal(nine.length, 9); assert.equal(new Set(nine.map(o => o.x)).size, 2, 'two columns'); assert.equal(nine.filter(o => o.x === nine[0].x).length, 5, 'five in the first');
  // the two names never print over each other, even under one stick and one loose block
  for (const n of [11, 12, 21, 91, 19, 34, 99]) {
    const ts = texts(diagramSvg(cleanDiagram({ type: 'counters', groups: [{ n, tens: true }] }, 'A number as tens and ones'))).filter(t => /^\d+ (tens?|ones?)$/.test(t.s));
    if (ts.length === 2) assert.ok(ts[1].x - ts[0].x >= (ts[0].s.length + ts[1].s.length) * 2.53 / 2 + 1.9, `${n}: the names are apart`);
  }
  // two numbers side by side: each in its own half with its numeral under it
  const two = cleanDiagram({ type: 'counters', groups: [{ n: 34, tens: true }, { n: 43, tens: true }] }, '34 and 43'), ts = diagramSvg(two);
  const st = rects(ts, STICK), on = rects(ts, ONE);
  assert.equal(st.length, 7); assert.equal(on.length, 7);
  assert.equal(st.filter(s => s.x < 50).length, 3); assert.equal(on.filter(o => o.x < 50).length, 4);
  assert.ok([...st, ...on].every(r => (r.x < 50) === (r.x + r.w < 50)), 'nothing crosses the middle');
  const nums = texts(ts).filter(t => /^\d+$/.test(t.s));
  assert.deepEqual(nums.map(t => t.s), ['34', '43']); assert.ok(nums[0].x < 50 && nums[1].x > 50);
  // every block and every word stays inside the frame and the drawing's band, up to 99 and 99
  for (const gs of [[{ n: 10, tens: true }], [{ n: 99, tens: true }], [{ n: 99, tens: true }, { n: 98, tens: true }], [{ n: 10, tens: true }, { n: 11, tens: true }]]) {
    const d = cleanDiagram({ type: 'counters', groups: gs }, 'Tens and ones'), out = diagramSvg(d), [a, b] = diagramExtent(d);
    for (const r of [...rects(out, STICK), ...rects(out, ONE)]) assert.ok(r.x >= 1 && r.x + r.w <= 99 && r.y >= a && r.y + r.h <= b, JSON.stringify(gs) + ': every block inside the frame');
    for (const t of texts(out)) assert.ok(t.y <= b && t.x > 4 && t.x < 96, JSON.stringify(gs) + ': every word inside the band');
  }
  // only whole numbers from 10 to 99, and never mixed with the other counter options
  for (const g of [{ n: 9, tens: true }, { n: 100, tens: true }, { n: 34.5, tens: true }, { n: 34, tens: true, frame: true }, { n: 34, tens: true, split: 3 }, { n: 34, tens: true, count: true }, { n: 34, tens: true, name: 'crates' }])
    assert.equal(cleanDiagram({ type: 'counters', groups: [g] }, 'L'), null, JSON.stringify(g));
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 34, tens: true }, { n: 8 }] }, 'L'), null, 'two numbers are both drawn as tens and ones, or neither');
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 34 }] }, 'L'), null, 'without tens a group still holds at most 20');
});

test('counters on a see-saw (Launchpad Unit 4): each side holds exactly its number, level when the sides are the same, leaning to the heavier side when not', () => {
  const rects = (svg, fill) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-F]+)"/g)].filter(m => m[5] === fill).map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  const A = '#66C792', B2 = '#FFD23F', SECOND = '#8FC1F5';
  const draw = (groups, label = 'Two sides on a see-saw') => { const v = cleanDiagram({ type: 'counters', balance: true, groups }, label); return { v, svg: diagramSvg(v) }; };
  const turn = svg => +(/<g transform="rotate\((-?[\d.]+) 50 41\)">/.exec(svg) || [0, 0])[1];
  const side = (svg, s) => new RegExp(`<g data-side="${s}">(.*?)</g>`).exec(svg)[1];
  const words = svg => texts(svg).map(t => t.s).filter(s => s !== 'Two sides on a see-saw');
  // 5 + 2 = 7: five blocks and two more on the left, seven on the right, level, the sum under each side and "="
  const eq = draw([{ n: 7, split: 5 }, { n: 7 }]);
  assert.deepEqual(eq.v, { type: 'counters', label: 'Two sides on a see-saw', balance: true, groups: [{ n: 7, split: 5 }, { n: 7 }] });
  assert.equal(rects(side(eq.svg, 'l'), A).length, 5); assert.equal(rects(side(eq.svg, 'l'), SECOND).length, 2); assert.equal(rects(side(eq.svg, 'r'), B2).length, 7);
  assert.equal(turn(eq.svg), 0, 'the same on both sides: level'); assert.deepEqual(words(eq.svg), ['5 + 2', '7', '=']);
  const all = [...rects(eq.svg, A), ...rects(eq.svg, SECOND), ...rects(eq.svg, B2)];
  assert.ok(all.every(r => r.w === r.h), 'square blocks'); assert.ok(rects(side(eq.svg, 'l'), A).every(r => r.x + r.w < 50) && rects(side(eq.svg, 'r'), B2).every(r => r.x > 50), 'each side on its own half');
  assert.equal(new Set(rects(side(eq.svg, 'r'), B2).map(r => r.x)).size, 2, 'stacks of five: seven blocks take two stacks'); assert.equal(rects(side(eq.svg, 'r'), B2).filter(r => r.x === rects(side(eq.svg, 'r'), B2)[0].x).length, 5);
  // the blocks stand on the beam, and the two sides sit the same distance from the pivot
  const beam = /<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="1.6" rx="0.5" fill="#D9A066"/.exec(eq.svg).slice(1).map(Number);
  assert.equal(+Math.max(...all.map(r => r.y + r.h)).toFixed(2), beam[1]); assert.equal(beam[0] + beam[2] / 2, 50);
  const mid = rs => (Math.min(...rs.map(r => r.x)) + Math.max(...rs.map(r => r.x + r.w))) / 2;
  assert.equal(+(50 - mid([...rects(side(eq.svg, 'l'), A), ...rects(side(eq.svg, 'l'), SECOND)])).toFixed(2), +(mid(rects(side(eq.svg, 'r'), B2)) - 50).toFixed(2));
  // 4 + 1 = 5 + 2 is not true: the heavier right side goes down, and the sign between them is crossed
  const ne = draw([{ n: 5, split: 4 }, { n: 7, split: 5 }]);
  assert.equal(turn(ne.svg), 5); assert.deepEqual(words(ne.svg), ['4 + 1', '5 + 2', '≠']);
  assert.equal(turn(draw([{ n: 9 }, { n: 6 }]).svg), -5, 'a heavier left side goes down');
  assert.equal(turn(draw([{ n: 6 }, { n: 6 }]).svg), 0); assert.deepEqual(words(draw([{ n: 6 }, { n: 6 }]).svg), ['6', '6', '=']);
  // the sign may come first: 7 = 3 + 4
  assert.deepEqual(words(draw([{ n: 7 }, { n: 7, split: 3 }]).svg), ['7', '3 + 4', '=']);
  // 8 + ? = 11: the hidden part is a dashed box marked "?", it weighs nothing yet (the side with it is up), and the sum still says "="
  const q = draw([{ n: 11, split: 8, hide: true }, { n: 11 }]);
  assert.equal(rects(side(q.svg, 'l'), A).length, 8); assert.equal(rects(side(q.svg, 'l'), SECOND).length, 0, 'the hidden blocks are not drawn');
  assert.match(side(q.svg, 'l'), /stroke-dasharray="1\.2 0\.9"\/><text [^>]*>\?<\/text>/); assert.equal(turn(q.svg), 5); assert.deepEqual(words(q.svg), ['?', '8 + ?', '11', '=']);
  // every block and every word stays inside the frame and the drawing's band, up to 20 and 20, level or leaning
  for (const gs of [[{ n: 20 }, { n: 20, split: 10 }], [{ n: 20, split: 1 }, { n: 1 }], [{ n: 1 }, { n: 20, split: 19 }], [{ n: 20, split: 19, hide: true }, { n: 20 }]]) {
    const d = draw(gs), [a, b] = diagramExtent(d.v), k = turn(d.svg) * Math.PI / 180;
    for (const r of [...rects(d.svg, A), ...rects(d.svg, B2), ...rects(d.svg, SECOND)]) for (const [x, y] of [[r.x, r.y], [r.x + r.w, r.y + r.h]]) {
      const X = 50 + (x - 50) * Math.cos(k) - (y - 41) * Math.sin(k), Y = 41 + (x - 50) * Math.sin(k) + (y - 41) * Math.cos(k);
      assert.ok(X >= 1 && X <= 99 && Y >= a && Y <= b && Y <= 48, JSON.stringify(gs) + ': every block inside the frame, above the ground');
    }
    for (const t of texts(d.svg)) assert.ok(t.y <= b && t.x > 4 && t.x < 96, JSON.stringify(gs) + ': every word inside the band');
  }
  // two whole numbers from 1 to 20, a split inside the number, a hidden part only with a split, and no other counter option
  for (const gs of [[{ n: 7 }], [{ n: 7 }, { n: 21 }], [{ n: 0 }, { n: 7 }], [{ n: 7, split: 7 }, { n: 7 }], [{ n: 7, hide: true }, { n: 7 }], [{ n: 7, frame: true }, { n: 7 }], [{ n: 7, name: 'x' }, { n: 7 }], [{ n: 7, tone: 1 }, { n: 7 }], [{ n: 7, split: 3, away: true }, { n: 7 }], [{ n: 34, tens: true }, { n: 7 }]])
    assert.equal(cleanDiagram({ type: 'counters', balance: true, groups: gs }, 'L'), null, JSON.stringify(gs));
  // without `balance`, two groups are still the matched rows they were (no more than 10 each)
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 12 }, { n: 12 }] }, 'L'), null);
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 4 }, { n: 4 }] }, 'L').balance, undefined);
});

test('counters as hundreds, tens and ones (Launchpad Unit 5): flats of a hundred, sticks of ten and loose ones, an empty place left empty', () => {
  const rects = (svg, fill) => [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-F]+)"/g)].filter(m => m[5] === fill).map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));
  const FLAT = '#66C792', STICK = '#8FC1F5', ONE = '#F2A65A';
  const draw = n => { const v = cleanDiagram({ type: 'counters', groups: [{ n, hundreds: true }] }, 'A number as hundreds, tens and ones'); return { v, svg: diagramSvg(v) }; };
  const names = svg => texts(svg).map(t => t.s).filter(t => /^\d+ (hundreds?|tens?|ones?)$/.test(t));
  // 243: two flats, four sticks, three loose ones, each named under its place
  const d = draw(243);
  assert.deepEqual(d.v, { type: 'counters', label: 'A number as hundreds, tens and ones', groups: [{ n: 243, hundreds: true }] });
  const flats = rects(d.svg, FLAT), sticks = rects(d.svg, STICK), ones = rects(d.svg, ONE);
  assert.equal(flats.length, 2); assert.equal(sticks.length, 4); assert.equal(ones.length, 3);
  assert.ok(flats.every(f => f.w === f.h && f.w === 10 * sticks[0].w / 1.2), 'a flat is a square ten blocks each way');
  assert.equal((d.svg.match(/<line /g) || []).length, 2 * 18 + 4 * 9, 'nine lines each way on a flat, nine on a stick: a hundred blocks, ten blocks');
  assert.ok(sticks.every(s => s.h === flats[0].h && s.y === flats[0].y), 'a stick is as tall as a flat');
  assert.ok(flats[1].x > flats[0].x && flats[1].x < flats[0].x + flats[0].w, 'the flats lie one over the next, each showing an edge to count');
  assert.ok(Math.min(...sticks.map(s => s.x)) > Math.max(...flats.map(f => f.x + f.w)) && Math.min(...ones.map(o => o.x)) > Math.max(...sticks.map(s => s.x + s.w)), 'hundreds, then tens, then ones, as the number is written');
  assert.equal(+Math.max(...ones.map(o => o.y + o.h)).toFixed(2), +(flats[0].y + flats[0].h).toFixed(2), 'everything stands on one floor');
  assert.equal(+((flats[0].x + Math.max(...ones.map(o => o.x + o.w))) / 2).toFixed(1), 50, 'centred');
  assert.deepEqual(names(d.svg), ['2 hundreds', '4 tens', '3 ones']);
  // an empty place is left empty and still named: 407 has no sticks, 470 no loose ones; one of each is singular
  const z = draw(407);
  assert.equal(rects(z.svg, FLAT).length, 4); assert.equal(rects(z.svg, STICK).length, 0); assert.equal(rects(z.svg, ONE).length, 7); assert.deepEqual(names(z.svg), ['4 hundreds', '0 tens', '7 ones']);
  assert.ok(Math.min(...rects(z.svg, ONE).map(o => o.x)) - Math.max(...rects(z.svg, FLAT).map(f => f.x + f.w)) >= 12, 'room is kept where the tens would stand');
  assert.equal(new Set(rects(z.svg, ONE).map(o => o.x)).size, 2, 'more than five ones take a second column');
  assert.deepEqual(names(draw(470).svg), ['4 hundreds', '7 tens', '0 ones']); assert.equal(rects(draw(470).svg, ONE).length, 0);
  assert.deepEqual(names(draw(111).svg), ['1 hundred', '1 ten', '1 one']); assert.deepEqual(names(draw(100).svg), ['1 hundred', '0 tens', '0 ones']);
  // more than five flats or sticks: a wider gap after the fifth
  const big = draw(999), bf = rects(big.svg, FLAT), bs = rects(big.svg, STICK);
  assert.equal(bf.length, 9); assert.equal(bs.length, 9); assert.equal(rects(big.svg, ONE).length, 9);
  assert.ok(bf[5].x - bf[4].x > bf[4].x - bf[3].x + 1 && bs[5].x - bs[4].x > bs[4].x - bs[3].x + 1, 'a gap after five');
  // every block and every word stays inside the frame and the drawing's band, and the names never print over each other
  for (const n of [100, 101, 110, 111, 199, 243, 407, 470, 505, 909, 990, 999]) {
    const { v, svg } = draw(n), [a, b] = diagramExtent(v);
    for (const r of [...rects(svg, FLAT), ...rects(svg, STICK), ...rects(svg, ONE)]) assert.ok(r.x >= 1 && r.x + r.w <= 99 && r.y >= a && r.y + r.h <= b, `${n}: every block inside the frame`);
    const ts = texts(svg).filter(t => /^\d+ (hundreds?|tens?|ones?)$/.test(t.s));
    assert.equal(ts.length, 3, `${n}: three names`);
    for (const t of texts(svg)) assert.ok(t.y <= b && t.x - t.s.length * (t.size * 0.55) / 2 > 1 && t.x + t.s.length * (t.size * 0.55) / 2 < 99, `${n}: every word inside the band`);
    for (let i = 1; i < 3; i++) assert.ok(ts[i].x - ts[i - 1].x >= (ts[i].s.length + ts[i - 1].s.length) * 2.53 / 2 + 1.9, `${n}: the names are apart`);
  }
  // one whole number from 100 to 999, and never mixed with the other counter options
  for (const gs of [[{ n: 99, hundreds: true }], [{ n: 1000, hundreds: true }], [{ n: 243.5, hundreds: true }], [{ n: 243, hundreds: true, tens: true }], [{ n: 243, hundreds: true, frame: true }], [{ n: 243, hundreds: true, name: 'pods' }], [{ n: 243, hundreds: true, split: 3 }],
    [{ n: 243, hundreds: true }, { n: 407, hundreds: true }], [{ n: 243, hundreds: true }, { n: 7 }]])
    assert.equal(cleanDiagram({ type: 'counters', groups: gs }, 'L'), null, JSON.stringify(gs));
  assert.equal(cleanDiagram({ type: 'counters', balance: true, groups: [{ n: 243, hundreds: true }] }, 'L'), null);
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 243 }] }, 'L'), null, 'without hundreds a group still holds at most 20');
  assert.equal(cleanDiagram({ type: 'counters', groups: [{ n: 34, tens: true }] }, 'L').groups[0].hundreds, undefined, 'tens and ones are still what they were');
});

test('shapes that look another way and shapes made of shapes (Launchpad Unit 6): a triangle is still three corners upside down, thin or right-angled; a square, a rectangle and a hexagon show the pieces inside', async () => {
  const V = await import('../../server/views/courses.js');
  const clean = items => C.cleanSlide({ title: 'Shapes', text: 'Some shapes to look at.', visual: { type: 'shapes', label: 'Shapes', items } }).visual;
  const draw = items => { const v = clean(items); assert.ok(v, JSON.stringify(items)); return String(V.visualSvg(v, { y0: 0, fh: 56.25 })); };
  const polys = svg => [...svg.matchAll(/<polygon points="([^"]+)"/g)].map(m => m[1].split(' ').map(p => p.split(',').map(Number)));
  const cuts = svg => [...svg.matchAll(/<line data-cut="1" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].map(m => m.slice(1).map(Number));
  const side = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  assert.deepEqual(C.SHAPE_LOOKS, { triangle: ['flip', 'thin', 'right'], square: ['turned'] }); assert.deepEqual(C.SHAPE_MADE, { square: [2], rectangle: [2], hexagon: [2, 6] });
  // the cleaner keeps a look and a made count, and nothing else
  assert.deepEqual(clean([{ shape: 'triangle', name: 'a', look: 'flip', extra: 1 }, { shape: 'hexagon', name: 'b', made: 6 }]).items, [{ shape: 'triangle', name: 'a', look: 'flip' }, { shape: 'hexagon', name: 'b', made: 6 }]);
  // three triangles: upright, upside down, long and thin. Each has three corners; the flipped one points down.
  const [up, down, thin] = polys(draw([{ shape: 'triangle', name: 'triangle' }, { shape: 'triangle', name: 'upside down', look: 'flip' }, { shape: 'triangle', name: 'long and thin', look: 'thin' }]));
  for (const t of [up, down, thin]) assert.equal(t.length, 3);
  const tip = t => { const ys = t.map(p => p[1]).sort((a, b) => a - b); return ys[1] - ys[0] > ys[2] - ys[1] ? 'up' : 'down'; };   // one corner alone at the top, or alone at the bottom
  assert.equal(tip(up), 'up'); assert.equal(tip(down), 'down');
  assert.equal(Math.max(...down.map(p => p[1])) - Math.min(...down.map(p => p[1])), Math.max(...up.map(p => p[1])) - Math.min(...up.map(p => p[1])), 'the same triangle, turned over');
  const sides = t => [side(t[0], t[1]), side(t[1], t[2]), side(t[2], t[0])].sort((a, b) => a - b);
  assert.ok(sides(thin)[2] > 3 * sides(thin)[0], 'long and thin: two long sides and a short one'); assert.ok(Math.abs(sides(up)[2] - sides(up)[0]) < 0.05, 'the plain one has equal sides');
  // a right-angled triangle is half of the square beside it: its two short sides are the square's side
  const [ra, , sq] = polys(draw([{ shape: 'triangle', name: 'triangle', look: 'right' }, { shape: 'triangle', name: 'triangle', look: 'right' }, { shape: 'square', name: 'square', made: 2 }]));
  const sqSide = side(sq[0], sq[1]);
  assert.ok(Math.abs(sides(ra)[0] - sqSide) < 0.02 && Math.abs(sides(ra)[1] - sqSide) < 0.02 && Math.abs(sides(ra)[2] - sqSide * Math.SQRT2) < 0.03, 'two of them make the square');
  const sqSvg = draw([{ shape: 'square', name: 'square' }, { shape: 'square', name: 'square', made: 2 }]);
  assert.equal(cuts(sqSvg).length, 1); const d = cuts(sqSvg)[0], s2 = polys(sqSvg)[1];
  assert.deepEqual([d.slice(0, 2), d.slice(2)], [s2[0], s2[2]], 'the square made of 2: one line corner to corner');
  // a turned square is still four equal sides and four square corners, standing on a corner
  const [flat, turned] = polys(draw([{ shape: 'square', name: 'square', corners: true }, { shape: 'square', name: 'turned', corners: true, look: 'turned' }]));
  const ts = [0, 1, 2, 3].map(i => side(turned[i], turned[(i + 1) % 4]));
  assert.ok(ts.every(x => Math.abs(x - ts[0]) < 0.02), 'four equal sides'); assert.ok(Math.abs(side(turned[0], turned[2]) - side(turned[1], turned[3])) < 0.02, 'equal diagonals: square corners');
  assert.equal(new Set(turned.map(p => p[1])).size, 3, 'it stands on a corner'); assert.equal(new Set(flat.map(p => p[1])).size, 2);
  assert.equal((draw([{ shape: 'square', name: 'square', corners: true }, { shape: 'square', name: 'turned', corners: true, look: 'turned' }]).match(/<path d="M[^"]+" fill="none" stroke="#141414" stroke-width="0.5"\/>/g) || []).length, 8, 'a square-corner mark in all four corners of both');
  // a rectangle made of 2 is exactly two squares wide, with one line down its middle
  const recSvg = draw([{ shape: 'square', name: 'square' }, { shape: 'rectangle', name: 'rectangle', made: 2 }]), rec = polys(recSvg)[1], rc = cuts(recSvg);
  assert.ok(Math.abs(side(rec[0], rec[1]) - 2 * side(rec[1], rec[2])) < 0.02, 'twice as wide as it is tall'); assert.equal(rc.length, 1);
  assert.ok(Math.abs(rc[0][0] - (rec[0][0] + rec[1][0]) / 2) < 0.02 && rc[0][0] === rc[0][2] && rc[0][1] === rec[0][1] && rc[0][3] === rec[2][1], 'the line stands in the middle, top to bottom');
  const plain = polys(draw([{ shape: 'square', name: 'square' }, { shape: 'rectangle', name: 'rectangle' }]))[1];
  assert.ok(Math.abs(side(plain[1], plain[2]) / side(plain[0], plain[1]) - 0.6) < 0.01, 'a rectangle on its own keeps the shape it always had');
  // a hexagon made of 2 has one line through its middle (two trapezoids); made of 6, three lines through its middle
  const hexSvg = draw([{ shape: 'trapezoid', name: 'trapezoid' }, { shape: 'hexagon', name: '2 trapezoids', made: 2 }, { shape: 'hexagon', name: '6 triangles', made: 6 }]), hc = cuts(hexSvg), hx = polys(hexSvg);
  assert.equal(hc.length, 4);
  for (const [i, lines] of [[1, hc.slice(0, 1)], [2, hc.slice(1)]]) {
    const cx = hx[i].reduce((a, p) => a + p[0], 0) / 6, cy = hx[i].reduce((a, p) => a + p[1], 0) / 6;
    for (const l of lines) { assert.ok(Math.abs((l[0] + l[2]) / 2 - cx) < 0.02 && Math.abs((l[1] + l[3]) / 2 - cy) < 0.02, 'every line goes through the middle'); assert.ok(hx[i].some(p => Math.abs(p[0] - l[0]) < 0.011 && Math.abs(p[1] - l[1]) < 0.011), 'from a corner'); }
  }
  assert.equal(hc[0][1], hc[0][3], 'two trapezoids: the line lies flat');
  // only a look or a count the shape really has; a shape is never both
  for (const it of [{ shape: 'square', name: 'x', look: 'flip' }, { shape: 'hexagon', name: 'x', look: 'turned' }, { shape: 'triangle', name: 'x', made: 2 }, { shape: 'hexagon', name: 'x', made: 3 }, { shape: 'square', name: 'x', made: 2, look: 'turned' }, { shape: 'rectangle', name: 'x', made: 6 }])
    assert.equal(clean([{ shape: 'square', name: 'ok' }, it]), undefined, JSON.stringify(it));
});

test('a clock face (Launchpad Unit 7): `clock` draws the spinner’s circle with twelve numbers, a short hand for the hour and a long hand for the minutes', () => {
  const clean = (clock, more = {}) => cleanDiagram({ type: 'spinner', parts: 12, shaded: 0, clock, ...more }, 'A clock');
  assert.deepEqual(clean({ h: 3, m: 0 }, { left: '3:00', right: "3 o'clock" }), { type: 'spinner', label: 'A clock', parts: 12, shaded: 0, clock: { h: 3, m: 0 }, left: '3:00', right: "3 o'clock" });
  assert.deepEqual(clean({ h: 7, m: 10 }, { fives: true }), { type: 'spinner', label: 'A clock', parts: 12, shaded: 0, clock: { h: 7, m: 10 }, fives: true });
  // a time to five minutes on a twelve-hour face, and nothing else: no 13 o'clock, no 7:12, never a pie, always twelve parts
  for (const c of [{ h: 0, m: 0 }, { h: 13, m: 0 }, { h: 7, m: 12 }, { h: 7, m: 60 }, { h: 7.5, m: 0 }, { h: 7 }, 'seven', []]) assert.equal(clean(c), null, JSON.stringify(c));
  assert.equal(cleanDiagram({ type: 'spinner', parts: 6, shaded: 0, clock: { h: 3, m: 0 } }, 'L'), null); assert.equal(clean({ h: 3, m: 0 }, { pie: true }), null);
  assert.equal(cleanDiagram({ type: 'spinner', parts: 12, shaded: 1, clock: { h: 3, m: 0 } }, 'L'), null);
  const hands = svg => Object.fromEntries([...svg.matchAll(/<line data-hand="(minute|hour)" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="(#[0-9A-Fa-f]+)" stroke-width="([\d.]+)"/g)]
    .map(m => [m[1], { dx: +m[4] - +m[2], dy: +m[5] - +m[3], from: [+m[2], +m[3]], tone: m[6], width: +m[7] }]));
  /** Where a hand points, as an hour on the face (0 to 12, clockwise from the top), worked out here from its two ends. */
  const points = hd => ((Math.atan2(hd.dx, -hd.dy) * 6 / Math.PI) + 12) % 12, len = hd => Math.hypot(hd.dx, hd.dy);
  for (const [h, m] of [[3, 0], [12, 0], [3, 30], [7, 10], [11, 55], [6, 30], [9, 45]]) {
    const svg = diagramSvg(clean({ h, m })), hd = hands(svg), at = `${h}:${String(m).padStart(2, '0')}`;
    assert.deepEqual(texts(svg).map(t => t.s), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'], `${at}: the twelve numbers, and nothing else without a label`);
    assert.equal((svg.match(/<line data-tick="1"/g) || []).length, 12, `${at}: twelve hour marks`);
    // the long hand is at the minutes (m / 5 on the face); the short hand at the hour and the part of it that has passed
    assert.ok(Math.abs(points(hd.minute) - (m / 5) % 12) < 0.02, `${at}: the long hand points to ${m / 5 || 12}`);
    assert.ok(Math.abs(points(hd.hour) - ((h % 12) + m / 60) % 12) < 0.02, `${at}: the short hand has moved ${m} minutes past ${h}`);
    assert.ok(len(hd.hour) < len(hd.minute) * 0.7, `${at}: the hour hand is the short one`); assert.ok(hd.hour.width > hd.minute.width, `${at}: and the thick one`);
    assert.notEqual(hd.hour.tone, hd.minute.tone, `${at}: the hands differ in color too`); assert.deepEqual([hd.hour.from, hd.minute.from], [[50, 25], [50, 25]], `${at}: both from the middle`);
    for (const t of texts(svg)) { assert.ok(t.size >= 3.4, `${at}: ${t.s} is phone-sized`); assert.ok(Math.hypot(t.x - 50, t.y - 1.25 - 25) < 16.5, `${at}: ${t.s} is inside the face`); }
    // every number sits where its hour is
    for (const t of texts(svg)) assert.ok(Math.abs(((Math.atan2(t.x - 50, -(t.y - 1.25 - 25)) * 6 / Math.PI) + 12) % 12 - (+t.s % 12)) < 0.02, `${at}: the ${t.s} is at ${t.s} o'clock`);
    assert.doesNotMatch(svg, /<path /, `${at}: no shares and no pointer`);
  }
  // half past: the short hand is half way between its hour and the next
  assert.ok(Math.abs(points(hands(diagramSvg(clean({ h: 3, m: 30 }))).hour) - 3.5) < 0.02);
  // `fives`: the minutes counted by fives outside the face, as far as the long hand has gone
  const five = diagramSvg(clean({ h: 7, m: 10 }, { fives: true, left: '7:10 a.m.', right: 'morning' })), outside = texts(five).filter(t => Math.hypot(t.x - 50, t.y - 1.2 - 25) > 16.5 && /^\d+$/.test(t.s));
  assert.deepEqual(outside.map(t => t.s), ['5', '10']);
  outside.forEach((t, i) => assert.ok(Math.abs(((Math.atan2(t.x - 50, -(t.y - 1.2 - 25)) * 6 / Math.PI) + 12) % 12 - (i + 1)) < 0.02, `${t.s} minutes is counted beside the ${i + 1}`));
  assert.deepEqual(texts(five).filter(t => !/^\d+$/.test(t.s)).map(t => t.s), ['7:10 a.m.', 'morning']);
  for (const t of texts(five)) assert.ok(t.size >= 3.4);
  assert.deepEqual(texts(diagramSvg(clean({ h: 7, m: 0 }, { fives: true }))).length, 12, 'on the hour there are no minutes to count');
  // the drawing sits inside the band the frame shows, with and without the minutes round the edge
  const tTop = t => t.y - 0.84 * t.size;
  for (const v of [clean({ h: 3, m: 0 }), clean({ h: 7, m: 55 }, { fives: true })]) {
    const [a, b] = diagramExtent(v), svg = diagramSvg(v);
    assert.ok(a <= 25 - 16.5 - 0.4 && b >= 25 + 16.5 + 0.4, 'the whole face and its edge');
    for (const t of texts(svg)) assert.ok(tTop(t) >= a - 0.01 && t.y + 0.28 * t.size <= b + 0.01, `"${t.s}" at y ${t.y} is inside ${a}..${b}`);
    assert.ok(a >= 0 && b <= 56.25);
  }
  // without `clock` the spinner is the spinner it was
  assert.equal(cleanDiagram({ type: 'spinner', parts: 12, shaded: 0 }, 'L').clock, undefined); assert.match(diagramSvg(cleanDiagram({ type: 'spinner', parts: 12, shaded: 0 }, 'L')), /<path /);
});

test('a circle cut in equal shares (Launchpad Unit 6): `pie` draws the spinner’s circle with no pointer and its shaded shares green', () => {
  const v = cleanDiagram({ type: 'spinner', parts: 4, shaded: 1, pie: true, right: 'one fourth' }, 'A circle cut in 4 equal shares');
  assert.deepEqual(v, { type: 'spinner', label: 'A circle cut in 4 equal shares', parts: 4, shaded: 1, pie: true, right: 'one fourth' });
  const svg = diagramSvg(v), parts = [...svg.matchAll(/<path d="(M50 25 L[^"]+Z)" fill="(#[0-9A-F]+)"/g)];
  assert.equal(parts.length, 4, 'four shares'); assert.deepEqual(parts.map(m => m[2]), ['#66C792', '#FFFFFF', '#FFFFFF', '#FFFFFF'], 'one shaded, green');
  // equal shares: every part sweeps the same quarter turn of the same circle
  for (const m of parts) { const [, x1, y1, x2, y2] = /L([\d.]+) ([\d.]+) A16\.5 16\.5 0 0 1 ([\d.]+) ([\d.]+) Z/.exec(m[1]).map(Number); assert.ok(Math.abs(Math.hypot(x2 - x1, y2 - y1) - 16.5 * Math.SQRT2) < 0.02); }
  assert.doesNotMatch(svg, /<line |<circle |<polygon /, 'no pointer, no hub');
  assert.deepEqual(texts(svg).map(t => t.s), ['one fourth']);
  const half = diagramSvg(cleanDiagram({ type: 'spinner', parts: 2, shaded: 1, pie: true }, 'Halves'));
  assert.equal((half.match(/fill="#66C792"/g) || []).length, 1); assert.equal((half.match(/<path /g) || []).length, 2);
  // without `pie` the spinner is the spinner it was: red shares and a pointer
  const spin = diagramSvg(cleanDiagram({ type: 'spinner', parts: 4, shaded: 1 }, 'L'));
  assert.match(spin, /fill="#E9465C"/); assert.match(spin, /<line /); assert.equal(cleanDiagram({ type: 'spinner', parts: 4, shaded: 1 }, 'L').pie, undefined);
  const [a, b] = diagramExtent(v); assert.ok(a <= 25 - 16.5 && b >= 25 + 16.5, 'the whole circle is inside the band the frame shows');
});

// ---------------------------------------------------------------------------------------------------------------
// The Pro diagram pack (grades 6-8): seven new types (plane, double, boxplot, angles, righttriangle, net, flow), three
// options on the number line (upright, tube, ray), a histogram option on the bar chart, and four small gaps closed in
// what was already there. Nothing that already ships may move: the baseline below is every diagram in the seed decks.

const BASE = JSON.parse(fs.readFileSync(new URL('../fixtures/course/diagram-baseline.json', import.meta.url), 'utf8'));
const slideSvg = slide => { const s = C.cleanSlide({ title: 'T', ...slide }); return s.visual ? String(visualSvg(s.visual, frameOf(s))) : null; };
const pro = (v, label = 'A label') => cleanDiagram(v, label);
const line = (more = {}) => C.cleanSlide({ title: 'T', visual: { type: 'numberline', label: 'A line', min: -5, max: 5, marks: [{ at: -5, label: '−5' }, { at: 0, label: '0' }, { at: 5, label: '5' }], ...more } }).visual;
/** Every drawing rule the pack keeps, checked on one cleaned diagram: nothing that is not a number in the SVG, no text
 *  under 3.4 units, every text inside the frame and inside the band the frame shows, every named part a legal focus box. */
function sound(v, what) {
  const s = C.cleanSlide({ title: 'T', visual: v }), f = frameOf(s), svg = String(visualSvg(s.visual, f)), [a, b] = [f.y0, f.y0 + f.fh];
  assert.doesNotMatch(svg, /NaN|undefined|Infinity|null/, `${what}: only numbers and words in the drawing`);
  assert.ok(a >= 0 && b <= 56.26 && b - a >= 22.6, `${what}: the band ${a}..${b} is inside the drawing`);
  for (const m of svg.matchAll(/<text (?:transform="[^"]*" )?x="([\d.-]+)" y="([\d.-]+)" font-size="([\d.]+)" text-anchor="(\w+)"[^>]*>([^<]*)<\/text>/g)) {
    const [, x, y, size, anchor, str] = m, turned = m[0].includes('transform='), w = turned ? 0 : str.length * 0.5 * size, left = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : +x;
    assert.ok(+size >= 3.4, `${what}: "${str}" is ${size} units, under the 3.4 floor`);
    assert.ok(left >= -0.5 && left + w <= 100.5, `${what}: "${str}" runs from ${left.toFixed(1)} to ${(left + w).toFixed(1)}, outside the frame`);
    if (!turned) assert.ok(y - 0.84 * size >= a - 0.01 && +y + 0.28 * size <= b + 0.01, `${what}: "${str}" at y ${y} is outside the band ${a}..${b}`);
  }
  const parts = diagramParts(s.visual);
  for (const [name, bx] of Object.entries(parts)) {
    assert.ok(bx.length === 4 && bx.every(Number.isFinite) && bx[0] >= 0 && bx[1] >= 0 && bx[2] >= 2 && bx[3] >= 2 && bx[0] + bx[2] <= 100 && bx[1] + bx[3] <= 100.01, `${what}: part ${name} [${bx}] is a box a tour step may use`);
    // a slide that tours every part keeps its focus (the engine accepts each box as written)
    assert.ok(C.cleanSlide({ title: 'T', visual: v, focus: [{ cue: 'Look here.', box: bx.map((n, i) => (i === 3 ? Math.min(n, 100 - bx[1]) : n)) }] }).focus, `${what}: part ${name} is accepted as a focus box`);
  }
  return { svg, parts, alt: /aria-label="([^"]*)"/.exec(svg)[1], visual: s.visual };
}

test('nothing that already ships has moved: every diagram in the seed decks draws the SVG it drew before the Pro pack', () => {
  assert.ok(BASE.length >= 170, 'the baseline holds the decks’ diagrams');
  for (const b of BASE) {
    const svg = slideSvg(b.slide);
    assert.ok(svg, `${b.from}: still a diagram`);
    assert.equal(crypto.createHash('sha256').update(svg).digest('hex').slice(0, 32), b.sha, `${b.from} (${b.slide.visual.type}) draws exactly as before`);
  }
  // and none of them has grown words in its accessible name: only the Pro pack's drawings say their data
  for (const b of BASE) assert.equal(diagramAlt(C.cleanSlide({ title: 'T', ...b.slide }).visual), '', `${b.from}: its label is its whole name`);
});

test('the Pro pack: each type is known to the engine, keeps only its own fields, and garbage never throws or draws', () => {
  for (const t of PRO_DIAGRAM_TYPES) { assert.ok(DIAGRAM_TYPES.includes(t) && C.VISUAL_TYPES.includes(t), `${t} is a visual type`); assert.ok(GOOD[t], `${t} has an example here`); }
  const junk = [null, undefined, NaN, Infinity, -Infinity, -1, 0, 1e12, 0.5, '', ' ', 'x'.repeat(400), '<script>', true, [], {}, [[]], [null], [NaN, NaN], [1, 2, 3], { x: 1 }, () => 1];
  let kept = 0, dropped = 0;
  /** Every place in a value where junk can go: the value itself, each field, each item (two levels down). */
  const spots = (v, depth = 0) => (v && typeof v === 'object' && depth < 3 ? Object.keys(v).flatMap(k => [[k], ...spots(v[k], depth + 1).map(p => [k, ...p])]) : []);
  const put = (v, path, x) => { const c = structuredClone(v); let o = c; for (const k of path.slice(0, -1)) o = o[k]; o[path[path.length - 1]] = x; return c; };
  const all = { ...Object.fromEntries(PRO_DIAGRAM_TYPES.map(t => [t, GOOD[t]])),
    plane2: { type: 'plane', x: [0, 10], y: [0, 100], step: [1, 10], xName: 'Hours', yName: 'Score', points: [{ x: 1, y: 20, tone: 2, open: true }], segments: [{ from: [0, 0], to: [4, 40], label: 'a', dash: true }], lines: [{ through: [[0, 0], [5, 50]], dash: true }], polygons: [{ pts: [[1, 10], [3, 10], [3, 40]], names: ['A', 'B', 'C'], image: true }] },
    cross: { type: 'angles', layout: 'cross', angles: [{ deg: 50 }, { deg: 130 }, { deg: 50, blank: true }, { deg: 130, label: 'x°' }] },
    prism: { type: 'net', solid: 'prism', dims: [6, 4, 7] }, box2: { type: 'boxplot', min: 50, max: 100, step: 5, plots: [{ five: [55, 68, 75, 82, 95], tone: 1 }, { five: [60, 70, 72, 78, 100] }] } };
  for (const [name, good] of Object.entries(all)) {
    assert.ok(pro(good), `${name} is well formed`);
    assert.equal(pro({ ...good, onclick: 'x', evil: { a: 1 } }).onclick, undefined, `${name}: only known fields survive`);
    for (const path of spots(good)) for (const x of junk) {
      if (path.length === 1 && path[0] === 'type') continue;
      let v;
      assert.doesNotThrow(() => { v = C.cleanSlide({ title: 'T', visual: { ...put(good, path, x), label: 'L' } }).visual; }, `${name}.${path.join('.')} = ${String(x).slice(0, 20)}: the cleaner does not throw`);
      if (!v) { dropped++; continue; }
      kept++;
      assert.doesNotThrow(() => sound({ ...put(good, path, x), label: 'L' }, `${name}.${path.join('.')} = ${String(x).slice(0, 20)}`));
    }
  }
  assert.ok(dropped > 1500 && kept > 100, `junk was mostly dropped (${dropped}) and what was kept (${kept}) drew soundly`);
  for (const x of junk) for (const t of PRO_DIAGRAM_TYPES) assert.equal(cleanDiagram({ type: t, ...(x && typeof x === 'object' ? x : { data: x }) }, 'L'), null, `an empty ${t}`);
  assert.equal(pro(GOOD.plane, ''), null, 'a diagram needs its accessible label');
});

test('labels in the Pro pack: the deck’s minus sign, never a hyphen; whole or not at all; said in words for a screen reader', () => {
  assert.equal(minus('-3'), '−3'); assert.equal(minus('y = -2x + 1'), 'y = −2x + 1'); assert.equal(minus('5 - 2'), '5 − 2'); assert.equal(minus('(-4, -1)'), '(−4, −1)');
  assert.equal(minus('x-axis'), 'x-axis', 'a hyphen inside a word stays a hyphen'); assert.equal(minus('T-shirts'), 'T-shirts');
  assert.equal(fmt(-2.5), '−2.5'); assert.equal(fmt(-0), '0'); assert.equal(fmt(1 / 3), '0.33'); assert.equal(fmt(12), '12');
  // a number given as a number, and a string typed with a hyphen, both print the real minus
  assert.deepEqual(pro({ type: 'double', ticks: [[-2, '-10'], [0, 0], [2, 10]] }).ticks, [['−2', '−10'], ['0', '0'], ['2', '10']]);
  assert.deepEqual(pro({ type: 'flow', values: [-4, '?'], ops: ['- 9'] }), { type: 'flow', label: 'A label', values: ['−4', '?'], ops: ['− 9'] });
  // the older types too: a negative number in a table cell or on a rectangle's side (grade 6-8 tables of values)
  assert.deepEqual(pro({ type: 'table', head: ['x', -2, 0], rows: [['y', -6, 0.5]] }).rows, [['y', '−6', '0.5']]);
  assert.deepEqual(pro({ type: 'table', head: ['x', -2, 0], rows: [['y', -6, 0.5]] }).head, ['x', '−2', '0']);
  assert.deepEqual(pro({ type: 'table', head: ['a', 'b'], rows: [[3, 12.5]] }).rows, [['3', '12.5']], 'and nothing else about a number changes');
  // a label is never cut short (half a number is a wrong number): too long, and the diagram is dropped
  assert.equal(pro({ ...GOOD.double, ticks: [[0, 0], [2, '1,000,000']] }), null);
  assert.equal(pro({ ...GOOD.righttriangle, labels: { base: '4 centimetres', height: '3' } }), null);
  assert.equal(pro({ ...GOOD.flow, ops: ['× 3', '+ 1234567'] }), null);
  // fractions, decimals, exponents, degrees and primes are kept as written and drawn as written
  const tri = sound({ ...GOOD.righttriangle, label: 'T', labels: { base: 'b = 2.5', height: '1 1/2', hyp: 'c² = 8.5' } }, 'triangle labels');
  for (const t of ['b = 2.5', '1 1/2', 'c² = 8.5']) assert.ok(texts(tri.svg).some(x => x.s === t), `"${t}" is drawn whole`);
  assert.match(tri.alt, /b equals 2\.5\b.*1 and 1 over 2.*c squared equals 8\.5/);
  // what a voice is given: no bare signs
  assert.equal(sayLabel('−3'), 'negative 3'); assert.equal(sayLabel('5 − 2'), '5 minus 2'); assert.equal(sayLabel('y = −2x + 1'), 'y equals negative 2x plus 1');
  assert.equal(sayLabel('65°'), '65 degrees'); assert.equal(sayLabel('−5°C'), 'negative 5 degrees Celsius'); assert.equal(sayLabel('3/4'), '3 over 4'); assert.equal(sayLabel('2 1/2'), '2 and 1 over 2');
  assert.equal(sayLabel('x²'), 'x squared'); assert.equal(sayLabel('A′'), 'A prime'); assert.equal(sayLabel('?'), 'unknown'); assert.equal(sayLabel('× 3'), 'times 3'); assert.equal(sayLabel('÷ 4'), 'divided by 4'); assert.equal(sayLabel('x ≤ 3'), 'x at most 3');
});

test('plane: a coordinate plane with its axes numbered from zero, points where their numbers say, lines, polygons and a slope triangle', () => {
  const v = pro({ type: 'plane', x: [-5, 5], y: [-4, 4], points: [{ x: 3, y: 2, label: 'A' }, { x: -4, y: -1, label: 'B', open: true }, { x: 0, y: 0 }] });
  assert.deepEqual(v, { type: 'plane', label: 'A label', x: [-5, 5], y: [-4, 4], points: [{ x: 3, y: 2, label: 'A' }, { x: -4, y: -1, label: 'B', open: true }, { x: 0, y: 0 }] });
  const svg = diagramSvg(v), pts = [...svg.matchAll(/<circle data-point="(\d)" cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)" fill="(#[0-9A-F]+)"/g)].map(m => ({ x: +m[2], y: +m[3], fill: m[5] }));
  const ax = /<line data-axis="x" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)"/.exec(svg), ay = /<line data-axis="y" x1="([\d.]+)" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/.exec(svg);
  const ox = +ay[1], oy = +ax[2], u = (pts[0].x - ox) / 3;
  assert.equal(pts.length, 3); assert.ok(Math.abs(pts[2].x - ox) < 0.02 && Math.abs(pts[2].y - oy) < 0.02, '(0, 0) is where the axes cross');
  assert.ok(u > 3 && Math.abs((oy - pts[0].y) - 2 * u) < 0.02, '(3, 2) is 3 units right and 2 up, on square units');
  assert.ok(Math.abs((pts[1].x - ox) + 4 * u) < 0.02 && Math.abs((pts[1].y - oy) - u) < 0.02, '(−4, −1) is 4 left and 1 down');
  assert.notEqual(pts[0].fill, pts[1].fill, 'an open point is hollow'); assert.equal(pts[1].fill, '#FFFDF2');
  // the numbers on the axes: every one sits on its own gridline, negatives with the real minus sign
  const nums = texts(svg).filter(t => /^−?\d+$/.test(t.s));
  assert.ok(nums.some(t => t.s === '−4') && nums.some(t => t.s === '4') && !nums.some(t => /-/.test(t.s)));
  for (const t of nums.filter(n => Math.abs(n.y - (oy + 4.1)) < 0.01 && n.s !== '0')) assert.ok(Math.abs(t.x - (ox + Number(t.s.replace('−', '-')) * u)) < 0.02, `${t.s} is under its gridline on the x-axis`);
  assert.equal((svg.match(/<path d="M[\d. ]+L[\d. ]+L[\d. ]+Z" fill="#141414"/g) || []).length, 4, 'four quadrants: an arrow at each end of each axis');
  assert.equal((diagramSvg(pro({ type: 'plane', x: [0, 6], y: [0, 4] })).match(/Z" fill="#141414"/g) || []).length, 2, 'the first quadrant: one arrow an axis');
  assert.deepEqual(texts(svg).filter(t => t.s === 'x' || t.s === 'y').length, 2, 'the axes are named x and y unless the deck names them');
  // a line is drawn right across the plane, through the points its rule gives
  const ln = pro({ type: 'plane', x: [-4, 6], y: [-3, 7], lines: [{ m: 2, b: -1, label: 'y = 2x - 1' }, { through: [[-4, 3], [6, 3]] }], slope: { from: [1, 1], to: [3, 5] } });
  assert.equal(ln.lines[0].label, 'y = 2x − 1');
  const ls = diagramSvg(ln), segs = [...ls.matchAll(/<line data-line="(\d)" x1="([\d.-]+)" y1="([\d.-]+)" x2="([\d.-]+)" y2="([\d.-]+)" stroke="(#[0-9A-F]+)" stroke-width="[\d.]+"( stroke-dasharray)?/g)];
  assert.equal(segs.length, 2); assert.notEqual(segs[0][6], segs[1][6], 'two lines differ in colour'); assert.ok(!segs[0][7] && segs[1][7], 'and the second is dashed, so not by colour alone');
  const cw = (+/<line data-axis="x" x1="([\d.]+)"/.exec(ls)[1] + 2.4), slope = (segs[0][3] - segs[0][5]) / (segs[0][4] - segs[0][2]);
  assert.ok(Math.abs(slope - 2) < 0.02 && cw > 0, 'y = 2x − 1 climbs 2 for each 1 across (square units)'); assert.ok(Math.abs(segs[1][3] - segs[1][5]) < 0.01, 'the line through (−4, 3) and (6, 3) is level');
  assert.match(ls, /<path data-slope="1" [^>]*stroke-dasharray/); assert.deepEqual(texts(ls).filter(t => /^(rise|run)/.test(t.s)).map(t => t.s).sort(), ['rise 4', 'run 2']);
  assert.deepEqual(texts(diagramSvg(pro({ type: 'plane', x: [-4, 6], y: [-3, 7], slope: { from: [0, 4], to: [2, 1] } }))).filter(t => /^(rise|run)/.test(t.s)).map(t => t.s).sort(), ['rise −3', 'run 2'], 'a line that falls has a negative rise');
  // a shape and its image: the image is dashed and another colour, and its corners keep their names
  const tr = diagramSvg(pro({ type: 'plane', x: [-6, 6], y: [-4, 4], polygons: [{ pts: [[-5, 1], [-2, 1], [-2, 3]], names: ['A', 'B', 'C'] }, { pts: [[1, -3], [4, -3], [4, -1]], names: ['A′', 'B′', 'C′'], image: true }] }));
  const polys = [...tr.matchAll(/<polygon data-poly="(shape|image)" points="([^"]+)" fill="(#[0-9A-F]+)" fill-opacity="[\d.]+" stroke="(#[0-9A-F]+)"[^>]*?( stroke-dasharray="[^"]+")?\/>/g)];
  assert.deepEqual(polys.map(m => m[1]), ['shape', 'image']); assert.ok(!polys[0][5] && polys[1][5]); assert.notEqual(polys[0][3], polys[1][3]); assert.notEqual(polys[0][4], polys[1][4]);
  const P = m => m[2].split(' ').map(q => q.split(',').map(Number));
  P(polys[0]).forEach((p, i) => { const q = P(polys[1])[i]; assert.ok(Math.abs((q[0] - p[0]) - (P(polys[1])[0][0] - P(polys[0])[0][0])) < 0.02 && Math.abs((q[1] - p[1]) - (P(polys[1])[0][1] - P(polys[0])[0][1])) < 0.02, 'a slide moves every corner the same way'); });
  for (const n of ['A', 'B', 'C', 'A′', 'B′', 'C′']) assert.ok(texts(tr).some(t => t.s === n), `corner ${n} is named`);
  // a scatter plot: its own steps and axis names, many points, a dashed trend line
  const sc = sound({ type: 'plane', label: 'Practice and score', x: [0, 10], y: [0, 100], step: [1, 10], xName: 'Hours of practice', yName: 'Score', points: [[1, 22], [2, 35], [3, 30], [4, 48], [5, 55], [6, 52], [7, 70], [8, 74], [9, 90]].map(([x, y]) => ({ x, y })), lines: [{ m: 8, b: 14, dash: true, label: 'trend' }] }, 'scatter');
  assert.equal((sc.svg.match(/data-point=/g) || []).length, 9); assert.match(sc.svg, /data-line="0"[^>]*stroke-dasharray/); assert.match(sc.svg, /transform="rotate\(-90[^>]*>Score</); assert.ok(texts(sc.svg).some(t => t.s === 'Hours of practice'));
  assert.ok(texts(sc.svg).some(t => t.s === '100') && texts(sc.svg).some(t => t.s === '10'));
  assert.match(sc.alt, /^Practice and score\. A coordinate plane: Hours of practice from 0 to 10, Score from 0 to 100\. 9 points: \(1, 22\), .* and \(9, 90\)\. A line with slope 8 that crosses the y-axis at 14, labelled trend\.$/);
  // big planes keep phone-sized numbers by numbering fewer gridlines (the drawing is clamped, never the data)
  const big = sound({ type: 'plane', label: 'Big', x: [-10, 10], y: [-10, 10], points: [{ x: -8, y: 6, label: '(-8, 6)' }] }, 'a plane from −10 to 10');
  assert.deepEqual(texts(big.svg).filter(t => /^−?\d+$/.test(t.s)).map(t => t.s).sort(), ['10', '10', '5', '5', '−10', '−10', '−5', '−5'], 'numbered every 5');
  assert.ok(texts(big.svg).some(t => t.s === '(−8, 6)'));
  // what is false is dropped: a point off the plane, a plane without its axes, part squares, a line that misses it, a flat slope triangle
  const bad = more => pro({ type: 'plane', x: [-5, 5], y: [-5, 5], ...more });
  for (const more of [{ points: [{ x: 6, y: 0 }] }, { x: [1, 5] }, { x: [-5, 5.5] }, { x: [5, -5] }, { step: 0 }, { step: [1, -1] }, { step: 3 }, { x: [-50, 50] }, { lines: [{ m: 1, b: 40 }] }, { lines: [{ through: [[1, 1], [1, 1]] }] }, { lines: [{ m: 1, b: 0, through: [[0, 0], [1, 1]] }] },
    { slope: { from: [0, 0], to: [3, 0] } }, { slope: { from: [0, 0], to: [0, 3] } }, { polygons: [{ pts: [[0, 0], [1, 1]] }] }, { polygons: [{ pts: [[0, 0], [1, 1], [2, 0]], names: ['A', 'B'] }] }, { points: Array.from({ length: 17 }, (_, i) => ({ x: 0, y: i % 5 })) }, { segments: [{ from: [0, 0], to: [0, 0] }] },
    { lines: [{ m: 1, b: 0 }, { m: 2, b: 0 }, { m: 3, b: 0 }, { m: 4, b: 0 }] }, { xName: 'a name that is far too long to print' }, { points: [{ x: 1, y: 1, tone: 9 }] }]) assert.equal(bad(more), null, JSON.stringify(more).slice(0, 60));
  // its words: the same numbers, negatives spoken
  const said = sound({ ...GOOD.plane, label: 'A line and its slope' }, 'plane').alt;
  assert.equal(said, 'A line and its slope. A coordinate plane: x from negative 4 to 6, y from negative 3 to 7. 2 points: A (1, 1) at (1, 1) and (3, 5). A line with slope 2 that crosses the y-axis at negative 1, labelled y equals 2x minus 1. A slope triangle from (1, 1) to (3, 5): run 2, rise 4.');
  const parts = diagramParts(v); assert.deepEqual(Object.keys(parts), ['plane', 'origin', 'point:0', 'point:1', 'point:2']);
  // a point's part is round its dot (and its name)
  const p0 = parts['point:0']; assert.ok(p0[0] <= pts[0].x && p0[0] + p0[2] >= pts[0].x && p0[1] * 0.5625 <= pts[0].y && (p0[1] + p0[3]) * 0.5625 >= pts[0].y);
});

test('double: two number lines tick for tick, the unknown a "?" in a dashed box', () => {
  const v = pro(GOOD.double);
  assert.deepEqual(v, { type: 'double', label: 'A label', top: 'Cups of flour', bottom: 'Cookies', ticks: [['0', '0'], ['2', '12'], ['4', '24'], ['6', '?']] });
  const svg = diagramSvg(v), ts = texts(svg), ties = [...svg.matchAll(/<line data-tie="\d" x1="([\d.]+)"/g)].map(m => +m[1]);
  assert.equal(ties.length, 4); for (let i = 2; i < 4; i++) assert.ok(Math.abs((ties[i] - ties[i - 1]) - (ties[1] - ties[0])) < 0.02, 'the ticks are evenly spaced');
  // each pair is one above the other, on its own tie
  v.ticks.forEach((t, i) => { for (const s of t.filter(x => x !== '?')) assert.ok(ts.some(x => x.s === s && Math.abs(x.x - ties[i]) < 0.02), `${s} is on tick ${i}`); });
  const up = ts.filter(t => ['0', '2', '4', '6'].includes(t.s) && t.y < 23), down = ts.filter(t => ['0', '12', '24'].includes(t.s) && t.y > 37);
  assert.equal(up.length, 4); assert.equal(down.length, 3); assert.equal((svg.match(/data-blank="1"/g) || []).length, 1); assert.ok(ts.some(t => t.s === '?' && Math.abs(t.x - ties[3]) < 0.02 && t.y > 37), 'the "?" is under the 6');
  assert.ok(ts.some(t => t.s === 'Cups of flour' && t.y < up[0].y) && ts.some(t => t.s === 'Cookies' && t.y > down[0].y), 'each line is named on its own side');
  assert.equal(sound({ ...GOOD.double, label: 'Flour and cookies' }, 'double').alt, 'Flour and cookies. A double number line: Cups of flour above Cookies. 0 lines up with 0; 2 lines up with 12; 4 lines up with 24; 6 lines up with unknown.');
  assert.deepEqual(Object.keys(diagramParts(v)), ['top', 'bottom', 'pair:0', 'pair:1', 'pair:2', 'pair:3', 'blank:3:bottom']);
  // seven ticks at most, each value short enough to stand on its own tick at phone size
  sound({ type: 'double', label: 'L', top: 'Hours', bottom: 'Kilometres', ticks: [[0, 0], [0.5, 30], [1, 60], [1.5, 90], [2, '?'], [2.5, 150], [3, 180]] }, 'seven ticks');
  sound({ type: 'double', label: 'L', ticks: [['0%', '$0'], ['100%', '$1,250']] }, 'two ticks, no names');
  for (const ticks of [[[0, 0]], Array.from({ length: 8 }, (_, i) => [i, i]), [[0, 0], [1]], [[0, 0], [1, 2, 3]], [[0, 0], ['', 1]], [[0, 0, 0, 0, 0, 0].map(() => 0), [1, 1]], Array.from({ length: 6 }, (_, i) => [i, '123456']), 'ticks', null]) assert.equal(pro({ type: 'double', ticks }), null, JSON.stringify(ticks).slice(0, 50));
});

test('boxplot: five numbers over a labelled axis, the box from quartile to quartile, one plot or two to compare', () => {
  const v = pro(GOOD.boxplot);
  assert.deepEqual(v, { type: 'boxplot', label: 'A label', min: 0, max: 20, step: 2, unit: 'Points scored', plots: [{ five: [2, 5, 8, 12, 18], name: 'Team A' }] });
  const svg = diagramSvg(v), X = n => 10 + n / 20 * 80;
  const box = /<rect data-box="0" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)"/.exec(svg), med = /<line data-median="0" x1="([\d.]+)"/.exec(svg), caps = [...svg.matchAll(/<line data-cap="1" x1="([\d.]+)"/g)].map(m => +m[1]);
  assert.ok(Math.abs(box[1] - X(5)) < 0.02 && Math.abs(+box[1] + +box[3] - X(12)) < 0.02, 'the box runs from the lower quartile to the upper'); assert.ok(Math.abs(med[1] - X(8)) < 0.02, 'the median is at 8');
  assert.deepEqual(caps.map(c => Math.round(c * 100) / 100), [X(2), X(18)], 'the whiskers end at the lowest and the highest');
  for (const n of [2, 5, 8, 12, 18]) assert.ok(texts(svg).some(t => t.s === String(n) && t.y < +box[2] && Math.abs(t.x - X(n)) < 0.02), `${n} is written over its place`);
  for (let n = 0; n <= 20; n += 2) assert.ok(texts(svg).some(t => t.s === String(n) && t.y > 33.6 && Math.abs(t.x - X(n)) < 0.02), `the axis names ${n}`);
  assert.ok(texts(svg).some(t => t.s === 'Team A') && texts(svg).some(t => t.s === 'Points scored'));
  assert.equal(sound({ ...GOOD.boxplot, label: 'Scores' }, 'boxplot').alt, 'Scores. A box plot over a number line from 0 to 20 (Points scored). Team A: lowest 2, lower quartile 5, median 8, upper quartile 12, highest 18.');
  // two plots share the one axis, in two tones, each with its name
  const two = sound({ type: 'boxplot', label: 'Two classes', min: 50, max: 100, step: 5, unit: 'Test score', plots: [{ name: 'Class A', five: [55, 68, 75, 82, 95] }, { name: 'Class B', five: [60, 70, 72, 78, 100] }] }, 'two box plots');
  const boxes = [...two.svg.matchAll(/<rect data-box="(\d)" x="([\d.]+)" y="([\d.]+)" width="[\d.]+" height="[\d.]+" fill="(#[0-9A-F]+)"/g)];
  assert.equal(boxes.length, 2); assert.ok(+boxes[1][3] > +boxes[0][3] + 10, 'one under the other'); assert.notEqual(boxes[0][4], boxes[1][4]); assert.equal((two.svg.match(/data-axis="x"/g) || []).length, 1);
  assert.match(two.alt, /Two box plots over a number line from 50 to 100 \(Test score\)\. Class A: lowest 55, .* Class B: lowest 60, lower quartile 70, median 72, upper quartile 78, highest 100\.$/);
  assert.deepEqual(Object.keys(two.parts), ['axis', 'plot:0', 'box:0', 'median:0', 'plot:1', 'box:1', 'median:1']);
  // numbers that sit close are moved apart, not printed over each other; equal numbers are written once
  const close = texts(diagramSvg(pro({ type: 'boxplot', min: 0, max: 10, step: 1, plots: [{ five: [1, 4, 4.5, 5, 9] }] }))).filter(t => t.y < 18).sort((a, b) => a.x - b.x);
  for (let i = 1; i < close.length; i++) assert.ok(close[i].x - close[i - 1].x >= (close[i].s.length + close[i - 1].s.length) * 0.56 * 3.6 / 2 + 1, `${close[i - 1].s} and ${close[i].s} do not touch`);
  assert.deepEqual(texts(diagramSvg(pro({ type: 'boxplot', min: 0, max: 10, step: 1, plots: [{ five: [2, 4, 4, 4, 9] }] }))).filter(t => t.y < 18).map(t => t.s), ['2', '4', '9']);
  // a long axis numbers fewer ticks; five numbers out of order, or off the axis, are not a box plot
  sound({ type: 'boxplot', label: 'L', min: 0, max: 1200, step: 100, plots: [{ five: [100, 400, 650, 800, 1150] }] }, 'a long axis');
  for (const more of [{ plots: [{ five: [5, 2, 8, 12, 18] }] }, { plots: [{ five: [2, 5, 8, 12, 22] }] }, { plots: [{ five: [2, 5, 8, 12] }] }, { plots: [] }, { plots: [GOOD.boxplot.plots[0], GOOD.boxplot.plots[0], GOOD.boxplot.plots[0]] }, { step: 3 }, { step: 1 }, { min: 20 }, { step: 0 }, { plots: [{ five: [2, 5, NaN, 12, 18] }] }]) assert.equal(pro({ ...GOOD.boxplot, ...more }), null, JSON.stringify(more));
});

test('angles: rays from one point with the measure of each angle; on a line, in a corner, at a crossing, round a point', () => {
  const rays = svg => [...svg.matchAll(/<line data-ray="([\d.]+)" x1="([\d.]+)" y1="([\d.]+)" x2="([\d.-]+)" y2="([\d.-]+)"/g)].map(m => ({ deg: +m[1], at: (Math.atan2(-(m[5] - m[3]), m[4] - m[2]) * 180 / Math.PI + 360) % 360 }));
  const onLine = pro({ type: 'angles', layout: 'line', angles: [{ deg: 65 }, { deg: 115, label: '?' }] });
  assert.deepEqual(onLine, { type: 'angles', label: 'A label', layout: 'line', angles: [{ deg: 65 }, { deg: 115, label: '?' }] });
  const svg = diagramSvg(onLine);
  assert.deepEqual(rays(svg).map(r => Math.round(r.at)), [0, 65, 180], 'a straight line and one ray at 65 degrees: drawn at their true angles');
  assert.deepEqual(texts(svg).map(t => t.s), ['65°', '?'], 'the measure is written; the unknown is a "?" (its size is never written)'); assert.doesNotMatch(svg, />115/);
  assert.match(svg, /<path data-angle="1"[^>]*stroke-dasharray/, 'the unknown angle is dashed as well as marked "?"');
  assert.equal(sound({ ...onLine, label: 'Angles on a line' }, 'angles on a line').alt, 'Angles on a line. 2 angles side by side on a straight line. Going round: 65 degrees and unknown. Together they make 180 degrees.');
  // a right angle is a square corner; in a corner the angles make 90
  const three = diagramSvg(pro(GOOD.angles)); assert.match(three, /<path data-angle="1" data-square="1"/); assert.deepEqual(rays(three).map(r => Math.round(r.at)), [0, 40, 130, 180]);
  const corner = sound({ type: 'angles', label: 'In a corner', layout: 'corner', angles: [{ deg: 32 }, { deg: 58, label: 'x°' }] }, 'angles in a corner');
  assert.deepEqual(rays(corner.svg).map(r => Math.round(r.at)), [0, 32, 90]); assert.match(corner.alt, /2 angles side by side in a right angle\. Going round: 32 degrees and x degrees\. Together they make 90 degrees\.$/);
  // two lines that cross: four rays, opposite pairs in line; an angle may be left without a measure
  const cross = sound({ type: 'angles', label: 'Crossing', layout: 'cross', angles: [{ deg: 50 }, { deg: 130, label: '?' }, { deg: 50, label: 'x°' }, { deg: 130, blank: true }] }, 'crossing lines');
  assert.deepEqual(rays(cross.svg).map(r => Math.round(r.at)), [0, 50, 180, 230]); assert.deepEqual(texts(cross.svg).map(t => t.s), ['50°', '?', 'x°']); assert.equal((cross.svg.match(/data-angle=/g) || []).length, 3);
  assert.match(cross.alt, /Two straight lines cross and make four angles\. Going round: 50 degrees, unknown, x degrees and an angle with no measure\. Angles across from each other are equal\.$/);
  const round = sound({ type: 'angles', label: 'Round a point', layout: 'rays', angles: [{ deg: 120 }, { deg: 90 }, { deg: 110 }, { deg: 40, label: '?' }] }, 'round a point');
  assert.deepEqual(rays(round.svg).map(r => Math.round(r.at)), [0, 120, 210, 320], 'all the way round: four rays for four angles'); assert.match(round.alt, /Together they go all the way round: 360 degrees\.$/);
  assert.deepEqual(Object.keys(round.parts), ['vertex', 'angle:0', 'angle:1', 'angle:2', 'angle:3']);
  // every measure is phone-sized even in the narrowest angle allowed, and clear of the point
  for (const deg of [20, 25, 33.5, 70, 160]) { const s = sound({ type: 'angles', label: 'L', layout: 'line', angles: [{ deg, label: '(2x + 10)°' }, { deg: 180 - deg }] }, `a ${deg} degree angle`); for (const t of texts(s.svg)) assert.ok(Math.hypot(t.x - 50, t.y - 46) > 7, `${t.s} is clear of the point`); }
  // angles that do not add up are not drawn
  const bad = (layout, ...degs) => pro({ type: 'angles', layout, angles: degs.map(deg => ({ deg })) });
  assert.equal(bad('line', 65, 110), null); assert.equal(bad('corner', 32, 60), null); assert.equal(bad('cross', 50, 130, 50, 120), null); assert.equal(bad('cross', 50, 130), null); assert.equal(bad('rays', 200, 170), null);
  assert.equal(bad('line', 10, 170), null, 'an angle too thin to label'); assert.equal(bad('fan', 90, 90), null); assert.equal(bad('line', 60, 60, 20, 20, 20), null); assert.ok(bad('line', 60, 60, 60)); assert.ok(bad('rays', 75));
});

test('righttriangle: the square corner marked, the two legs and the hypotenuse each with its label', () => {
  const v = pro(GOOD.righttriangle);
  assert.deepEqual(v, { type: 'righttriangle', label: 'A label', base: 4, height: 3, labels: { base: '4 cm', height: '3 cm', hyp: '?' } });
  const svg = diagramSvg(v), P = /<polygon data-tri="1" points="([^"]+)"/.exec(svg)[1].split(' ').map(q => q.split(',').map(Number)), [A, B, Cc] = P;
  assert.ok(Math.abs(A[1] - B[1]) < 0.01 && Math.abs(A[0] - Cc[0]) < 0.01, 'one leg level, one upright: a right angle at the first corner'); assert.match(svg, /<path data-square="1"/);
  assert.ok(Math.abs((A[1] - Cc[1]) / (B[0] - A[0]) - 3 / 4) < 0.01, 'drawn 3 high for 4 along');
  const ts = texts(svg), at = s => ts.find(t => t.s === s);
  assert.ok(at('4 cm').y > A[1] && Math.abs(at('4 cm').x - (A[0] + B[0]) / 2) < 0.02, 'the base is named under it'); assert.ok(at('3 cm').x < A[0], 'the height beside the upright leg, outside');
  assert.ok(at('?').x > (B[0] + Cc[0]) / 2 && at('?').y < (B[1] + Cc[1]) / 2, 'the hypotenuse outside the long side');
  assert.equal(sound({ ...GOOD.righttriangle, label: 'A right triangle' }, 'right triangle').alt, 'A right triangle. A right triangle. The leg along the bottom: 4 cm. The upright leg: 3 cm. The longest side, the hypotenuse: unknown.');
  assert.deepEqual(Object.keys(diagramParts(v)), ['corner', 'triangle', 'base', 'height', 'hyp']);
  // the corner may sit on the right; a very thin or very flat triangle is drawn no thinner than a phone can show (clamped), with its true labels
  const flip = diagramSvg(pro({ ...GOOD.righttriangle, corner: 'right' })), F = /points="([^"]+)"/.exec(flip)[1].split(' ').map(q => q.split(',').map(Number));
  assert.ok(F[1][0] < F[0][0], 'the base runs left from the corner');
  for (const [base, height] of [[1, 100], [100, 1], [5, 12], [1e6, 1]]) {
    const s = sound({ type: 'righttriangle', label: 'L', base, height, labels: { base: String(base).slice(0, 9), height: String(height), hyp: '?' } }, `a ${base} by ${height} triangle`), Q = /points="([^"]+)"/.exec(s.svg)[1].split(' ').map(q => q.split(',').map(Number));
    const w = Math.abs(Q[1][0] - Q[0][0]), h = Math.abs(Q[0][1] - Q[2][1]); assert.ok(w >= 10 && h >= 10 && w <= 54.01 && h <= 31.01, `drawn ${w.toFixed(1)} by ${h.toFixed(1)}`);
  }
  for (const more of [{ base: 0 }, { height: -3 }, { base: '4' }, { labels: { base: '4' } }, { labels: {} }, { labels: null }, { corner: 'top' }, { labels: { base: '4', height: '' } }]) assert.equal(pro({ ...GOOD.righttriangle, ...more }), null, JSON.stringify(more));
});

test('net: a rectangular prism unfolds into six rectangles, a triangular prism into three and two triangles, edges labelled', () => {
  const v = pro(GOOD.net);
  assert.deepEqual(v, { type: 'net', label: 'A label', solid: 'box', dims: [5, 3, 2], labels: ['5 cm', '3 cm', '2 cm'] });
  const svg = diagramSvg(v), faces = Object.fromEntries([...svg.matchAll(/<rect data-face="(\w+)" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" fill="(#[0-9A-F]+)"/g)].map(m => [m[1], { x: +m[2], y: +m[3], w: +m[4], h: +m[5], tone: m[6] }]));
  assert.deepEqual(Object.keys(faces).sort(), ['back', 'bottom', 'front', 'left', 'right', 'top'], 'six faces');
  const u = faces.front.w / 5, near = (a, b) => Math.abs(a - b) < 0.03;
  // each face has the right two edges, to one scale: front and back 5 by 2, left and right 3 by 2, top and bottom 5 by 3
  for (const [f, w, h] of [['front', 5, 2], ['back', 5, 2], ['left', 3, 2], ['right', 3, 2], ['top', 5, 3], ['bottom', 5, 3]]) assert.ok(near(faces[f].w, w * u) && near(faces[f].h, h * u), `${f} is ${w} by ${h}`);
  // and they join where they fold: the strip left, front, right, back; the top over the front, the bottom under it
  assert.ok(near(faces.left.x + faces.left.w, faces.front.x) && near(faces.front.x + faces.front.w, faces.right.x) && near(faces.right.x + faces.right.w, faces.back.x));
  assert.ok(near(faces.top.x, faces.front.x) && near(faces.top.y + faces.top.h, faces.front.y) && near(faces.bottom.y, faces.front.y + faces.front.h));
  assert.equal(faces.front.tone, faces.back.tone); assert.equal(faces.left.tone, faces.right.tone); assert.equal(faces.top.tone, faces.bottom.tone); assert.equal(new Set(Object.values(faces).map(f => f.tone)).size, 3);
  assert.equal((svg.match(/data-fold="1"/g) || []).length, 5, 'five fold lines, dashed'); assert.equal((svg.match(/data-outline="1"/g) || []).length, 1);
  assert.deepEqual(texts(svg).map(t => t.s).sort(), ['2 cm', '3 cm', '5 cm']);
  assert.equal(sound({ ...GOOD.net, label: 'A box, unfolded' }, 'net').alt, 'A box, unfolded. The net of a rectangular prism, flat: six rectangles that fold into a box. Length 5 cm, width 3 cm, height 2 cm. Two faces are 5 cm by 3 cm, two are 5 cm by 2 cm and two are 3 cm by 2 cm.');
  assert.deepEqual(Object.keys(diagramParts(v)), ['net', 'left', 'front', 'right', 'back', 'top', 'bottom']);
  // without labels the edges carry their numbers
  assert.deepEqual(texts(diagramSvg(pro({ type: 'net', solid: 'box', dims: [4, 4, 2.5] }))).map(t => t.s).sort(), ['2.5', '4', '4']);
  // a triangular prism: three rectangles as wide as the triangle's sides, a triangle on each end of the middle one
  const pr = sound({ type: 'net', label: 'A prism, unfolded', solid: 'prism', dims: [6, 4, 7], labels: ['6 m', '4 m', '7 m'] }, 'prism net');
  const rs = [...pr.svg.matchAll(/<rect data-face="([\w:]+)" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/g)], tris = (pr.svg.match(/<polygon data-face="end:\d"/g) || []).length;
  assert.equal(rs.length, 3); assert.equal(tris, 2); const k = rs[1][2] / 6;
  assert.ok(near(rs[0][2], 5 * k) && near(rs[2][2], 5 * k), 'the slanted sides of a 6 wide, 4 high triangle are 5 long'); assert.ok(rs.every(r => near(r[3], 7 * k)), 'each rectangle is as long as the prism');
  assert.match(pr.svg, /data-height="1"/); assert.match(pr.alt, /The net of a triangular prism, flat: three rectangles side by side with a triangle above and below the middle one\. Each triangle has base 6 m and height 4 m\. The prism is 7 m long\.$/);
  // a long thin solid is drawn no thinner than a phone can show (clamped); what is not a solid is dropped
  for (const dims of [[100, 1, 1], [1, 100, 1], [1, 1, 100], [1000, 1000, 1], [0.5, 0.25, 0.1]]) for (const solid of ['box', 'prism']) {
    const s = sound({ type: 'net', label: 'L', solid, dims }, `${solid} ${dims}`); for (const m of s.svg.matchAll(/<rect data-face="[\w:]+" x="[\d.]+" y="[\d.]+" width="([\d.]+)" height="([\d.]+)"/g)) assert.ok(+m[1] >= 2.5 && +m[2] >= 2.5, `${solid} ${dims}: every face can be seen (${m[1]} by ${m[2]})`);
  }
  for (const more of [{ solid: 'pyramid' }, { dims: [5, 3] }, { dims: [5, 3, 0] }, { dims: [5, 3, -2] }, { dims: [5, 3, 2000] }, { dims: '532' }, { labels: ['5 cm', '3 cm'] }, { labels: ['5 cm', '3 cm', 'two centimetres'] }]) assert.equal(pro({ ...GOOD.net, ...more }), null, JSON.stringify(more));
});

test('flow: values and machines in a row, the way back drawn under them for the inverse operations', () => {
  const v = pro(GOOD.flow);
  assert.deepEqual(v, { type: 'flow', label: 'A label', values: ['?', '15', '17'], ops: ['× 3', '+ 2'], undo: ['÷ 3', '− 2'] });
  const svg = diagramSvg(v), xs = re => [...svg.matchAll(re)].map(m => +m[1]);
  const vals = xs(/<rect data-value="\d" x="([\d.]+)"/g), ops = xs(/<rect data-op="\d" x="([\d.]+)"/g);
  assert.equal(vals.length, 3); assert.equal(ops.length, 2); assert.ok(vals[0] < ops[0] && ops[0] < vals[1] && vals[1] < ops[1] && ops[1] < vals[2], 'value, machine, value, machine, value: left to right');
  assert.match(svg, /<rect data-value="0"[^>]*stroke-dasharray/, 'the unknown value is a dashed chip'); assert.doesNotMatch(svg, /<rect data-value="1"[^>]*stroke-dasharray/);
  assert.equal((svg.match(/<path data-undo="\d"[^>]*stroke-dasharray/g) || []).length, 2, 'two dashed paths back');
  const ts = texts(svg); for (const s of ['?', '15', '17', '× 3', '+ 2', '÷ 3', '− 2']) assert.ok(ts.some(t => t.s === s), `"${s}" is drawn`);
  assert.ok(ts.find(t => t.s === '÷ 3').y > ts.find(t => t.s === '× 3').y + 8 && Math.abs(ts.find(t => t.s === '÷ 3').x - ts.find(t => t.s === '× 3').x) < 0.02, 'each inverse sits under the operation it undoes');
  assert.equal(sound({ ...GOOD.flow, label: 'Undo it' }, 'flow').alt, 'Undo it. An operation flow. Start with unknown; times 3 gives 15; then plus 2 gives 17. Going back from 17: minus 2, then divided by 3.');
  assert.deepEqual(Object.keys(diagramParts(v)), ['value:0', 'value:1', 'op:0', 'undo:0', 'value:2', 'op:1', 'undo:1']);
  // one machine with its ends named; three machines still phone-sized
  const one = sound({ type: 'flow', label: 'L', values: ['x', '12'], ops: ['× 4'], inName: 'in', outName: 'out' }, 'one machine'); assert.ok(texts(one.svg).some(t => t.s === 'in') && texts(one.svg).some(t => t.s === 'out')); assert.doesNotMatch(one.svg, /data-undo/);
  const three = sound({ type: 'flow', label: 'L', values: ['n', '2n', '?', '−4'], ops: ['× 2', '− 9', '÷ 2'], undo: ['÷ 2', '+ 9', '× 2'] }, 'three machines'); assert.equal((three.svg.match(/data-op=/g) || []).length, 3);
  sound({ type: 'flow', label: 'L', values: ['−2.5', '1234'], ops: ['+ 12'] }, 'long labels'); sound({ type: 'flow', label: 'L', values: ['1234', '1234', '1234', '1234'], ops: ['× 12', '+ 12', '÷ 12'], undo: ['÷ 12', '− 12', '× 12'] }, 'three machines, four characters each');
  for (const more of [{ ops: [] }, { ops: ['+ 1', '+ 1', '+ 1', '+ 1'], values: [1, 2, 3, 4, 5] }, { values: ['?', '15'] }, { undo: ['÷ 3'] }, { ops: ['× 3', ''] }, { values: ['?', '15', '1234567'] }, { values: ['1', '2', '3', '12345'], ops: ['+ 1', '+ 1', '+ 1'], undo: undefined }, { inName: 'a very long name' }]) assert.equal(pro({ ...GOOD.flow, ...more }), null, JSON.stringify(more));
});

test('number line options (Pro): `upright` stands it up, `tube` makes it a thermometer, `ray` shades an inequality', () => {
  // upright: bigger numbers are higher; marks on the left, the point named on the right, hops as arrows up and down
  const up = line({ upright: true, point: { at: -3, label: '−3' }, hops: [{ from: 4, to: -3, label: '−7' }, { from: -3, to: 2, label: '+5' }] });
  assert.equal(up.upright, true);
  const s = sound(up, 'upright line'), ticks = [...s.svg.matchAll(/<line data-tick="1" x1="[\d.]+" y1="([\d.]+)"/g)].map(m => +m[1]);
  assert.ok(ticks[0] > ticks[1] && ticks[1] > ticks[2], '−5 is under 0, and 0 under 5'); assert.ok(Math.abs((ticks[0] - ticks[1]) - (ticks[1] - ticks[2])) < 0.02, 'to scale');
  const Y = at => ticks[1] - at * (ticks[1] - ticks[2]) / 5, hops = [...s.svg.matchAll(/<line data-hop="(\d)" x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="([\d.]+)"/g)];
  assert.ok(Math.abs(hops[0][2] - Y(4)) < 0.02 && +hops[0][3] > +hops[0][2], 'the first arrow starts at 4 and goes down'); assert.ok(Math.abs(hops[1][2] - Y(-3)) < 0.02 && +hops[1][3] < +hops[1][2], 'the second starts at −3 and goes up');
  assert.match(s.svg, new RegExp(`<circle cx="42" cy="${Y(-3).toFixed(2).replace(/\.?0+$/, '')}" r="2.3" fill="#FFD23F"`), 'the point is at −3');
  assert.equal(s.alt, 'A line. An upright number line from negative 5 at the bottom to 5 at the top. Marked: negative 5, 0 and 5. A point at negative 3, labelled negative 3. An arrow down from 4 to negative 3, labelled negative 7. An arrow up from negative 3 to 2, labelled plus 5.');
  assert.deepEqual(Object.keys(s.parts), ['line', 'point', 'hop:0', 'hop:1']);
  // a thermometer: a tube and a bulb, filled up to its reading
  const th = sound(line({ upright: true, tube: true, min: -20, max: 30, marks: [-20, -10, 0, 10, 20, 30].map(n => ({ at: n, label: `${fmt(n)}°` })), point: { at: -5, label: '−5°C' } }), 'thermometer');
  assert.match(th.svg, /<path data-tube="1"/); const lvl = /<rect data-level="1" x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="([\d.]+)"/.exec(th.svg); assert.ok(+lvl[2] > 5, 'filled from the bulb up to the reading');
  assert.match(th.alt, /A thermometer from negative 20 at the bottom to 30 at the top\. Marked: negative 20 degrees, .* It reads negative 5, labelled negative 5 degrees Celsius\.$/);
  // nine close marks are still told apart (their names moved, their ticks true)
  const nine = sound(line({ upright: true, min: -2, max: 2, marks: [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2].map(n => ({ at: n, label: fmt(n) })) }), 'nine marks'), ys = texts(nine.svg).map(t => t.y).sort((a, b) => a - b);
  for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 3.85, 'names do not touch');
  // ray: from its number to one end of the line, a filled circle when the number counts and a hollow one when it does not
  const open = line({ ray: { at: -2, dir: 'right', open: true } }), closed = line({ ray: { at: 3, dir: 'left' } });
  assert.deepEqual(open.ray, { at: -2, dir: 'right', open: true }); assert.deepEqual(closed.ray, { at: 3, dir: 'left' });
  const so = sound(open, 'open ray'), sc = sound(closed, 'closed ray'), X = at => 6 + (at + 5) / 10 * 88;
  const ro = /<line data-ray="right" x1="([\d.]+)" y1="36" x2="([\d.]+)"/.exec(so.svg), rc = /<line data-ray="left" x1="([\d.]+)" y1="36" x2="([\d.]+)"/.exec(sc.svg);
  assert.ok(Math.abs(ro[1] - X(-2)) < 0.01 && +ro[2] > 90, 'from −2 to the right end'); assert.ok(Math.abs(rc[1] - X(3)) < 0.01 && +rc[2] < 10, 'from 3 to the left end');
  assert.match(so.svg, /<circle data-end="open" cx="[\d.]+" cy="36" r="2" fill="#FFFDF2" stroke="#1F9D63"/, 'open: hollow'); assert.match(sc.svg, /<circle data-end="closed" cx="[\d.]+" cy="36" r="2" fill="#1F9D63"/, 'closed: filled');
  assert.equal(so.alt, 'A line. On the number line, a ray from negative 2 to the right: every number greater than negative 2. The circle at negative 2 is open: negative 2 itself is not included.');
  assert.equal(sc.alt, 'A line. On the number line, a ray from 3 to the left: every number less than or equal to 3. The circle at 3 is filled: 3 is included.');
  assert.deepEqual(Object.keys(so.parts), ['end', 'ray']);
  // malformed options drop the diagram; a line without them is the line it was
  for (const more of [{ upright: 'yes' }, { tube: true }, { upright: true, tube: 1 }, { upright: true, stacks: [{ at: 0, n: 2 }] }, { upright: true, ray: { at: 0, dir: 'right' } }, { upright: true, hops: [{ from: 0, to: 3, label: 'a long one' }] },
    { ray: { at: 9, dir: 'right' } }, { ray: { at: 0, dir: 'up' } }, { ray: { at: 5, dir: 'right' } }, { ray: { at: -5, dir: 'left' } }, { ray: { at: 0, dir: 'left', open: 'no' } }, { ray: 'x > 2' }, { ray: [] }]) assert.equal(line(more), undefined, JSON.stringify(more));
  assert.deepEqual(Object.keys(line()), ['type', 'label', 'min', 'max', 'marks']); assert.deepEqual(diagramParts(line()), {}); assert.equal(diagramAlt(line()), '');
});

test('gaps closed in the older types for grades 6-8: eleven marks, hops that stay on the line, ten-part tapes, a histogram', () => {
  // a line from −5 to 5 (or a dot plot from 0 to 10) names every whole number: 11 marks, none printed over another
  const eleven = line({ marks: Array.from({ length: 11 }, (_, i) => ({ at: i - 5, label: fmt(i - 5) })) });
  assert.equal(eleven.marks.length, 11); const xs = texts(slideSvg({ visual: eleven })).filter(t => /^−?\d$/.test(t.s)).map(t => t.x); assert.equal(xs.length, 11);
  for (let i = 1; i < 11; i++) assert.ok(xs[i] - xs[i - 1] > 6, 'each number under its own tick');
  assert.equal(line({ marks: Array.from({ length: 12 }, (_, i) => ({ at: i - 5, label: String(i) })) }), undefined, 'twelve is too many');
  // a hop may go back (below zero), but both of its ends are on the line: before, a hop from 999 to −999 was drawn off the frame
  assert.deepEqual(line({ hops: [{ from: 2, to: -4, label: '−6' }] }).hops, [{ from: 2, to: -4, label: '−6' }]);
  for (const h of [{ from: 999, to: -999, label: 'x' }, { from: -9, to: 0, label: 'x' }, { from: 0, to: 9, label: 'x' }, { from: 2, to: 2, label: 'x' }]) assert.equal(line({ hops: [h] }), undefined, JSON.stringify(h));
  // a tape diagram of 3 : 5 has rows of three and five equal parts; a percent bar has ten tenths
  const tape = C.cleanSlide({ title: 'T', visual: { type: 'bars', label: 'L', big: true, rows: [{ label: 'Red', parts: Array.from({ length: 3 }, () => ({ w: 0.125, label: '4' })) }, { label: 'Blue', parts: Array.from({ length: 5 }, () => ({ w: 0.125, label: '4' })) }, { label: 'Tenths', parts: Array.from({ length: 10 }, () => ({ w: 0.1, label: '10%' })) }] } }).visual;
  assert.deepEqual(tape.rows.map(r => r.parts.length), [3, 5, 10]);
  assert.equal(C.cleanSlide({ title: 'T', visual: { type: 'bars', label: 'L', rows: [{ label: 'x', parts: Array.from({ length: 11 }, () => ({ w: 0.09, label: '' })) }] } }).visual, undefined);
  // a histogram: bars that touch, up to six, one tone; without `touch` the chart is the chart it was
  const hist = pro({ type: 'chart', max: 12, step: 2, touch: true, bars: [['0–9', 2], ['10–19', 7], ['20–29', 11], ['30–39', 6], ['40–49', 4], ['50–59', 1]].map(([label, value]) => ({ label, value })) });
  assert.equal(hist.touch, true); assert.equal(hist.bars.length, 6);
  const bars = [...diagramSvg(hist).matchAll(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)" height="[\d.]+" fill="(#[0-9A-F]+)"/g)];
  for (let i = 1; i < bars.length; i++) assert.ok(Math.abs(+bars[i - 1][1] + +bars[i - 1][2] - bars[i][1]) < 0.02, 'each bar starts where the last one ends'); assert.equal(new Set(bars.map(b => b[3])).size, 1);
  sound({ ...hist, label: 'Heights' }, 'histogram');
  assert.equal(pro({ ...GOOD.chart, bars: Array.from({ length: 6 }, (_, i) => ({ label: `b${i}`, value: i })) }), null, 'six bars only when they touch'); assert.equal(pro({ ...GOOD.chart, touch: 'yes' }), null);
  assert.equal(pro(GOOD.chart).touch, undefined);
});
