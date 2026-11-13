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
  swap: { type: 'swap', before: ['2', '1'], after: ['1', '2'], mark: [0, 1] },
  split: { type: 'split', whole: '3 kg 400 g', parts: [{ w: 0.882, label: '3,000 g' }, { w: 0.118, label: '400 g' }] },
  ladder: { type: 'ladder', words: ['certain', 'likely', 'even chance', 'unlikely', 'impossible'] },
  fix: { type: 'fix', wrong: '7 × 8 = 54', steps: ['7 × 4 = 28', '28 + 28 = 56'], right: '7 × 8 = 56' },
  counters: { type: 'counters', groups: [{ n: 14, frame: true }] },
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
