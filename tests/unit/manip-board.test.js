// The manipulatives board model (public/js/manip-board.js) and practice sets (public/js/manip-practice.js): pure
// functions shared by the page and the server. docs/decisions.md "Virtual math manipulatives: one big board".
import test from 'node:test';
import assert from 'node:assert/strict';
import { TOOLS, pieceDefs } from '../../public/js/manip-data.js';
import { WORLD, OBJECTS, kindsOf, objectTool, objRect, clockSector, addMinutes, migrate, newBoard, reframe, placeObject, snapFor, slotsOf, pieceBox, groupOf,
  SNAP_PX, ORIGIN, parseFrac, OBJ_MAX } from '../../public/js/manip-board.js';
import { buildPractice, fracEquation, fracText, PRACTICE_TABLE, PRACTICE_HELP, PRACTICE_MAX } from '../../public/js/manip-practice.js';

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const piece = (id, kind, x, y, w, h, extra = {}) => ({ id, kind, x, y, w, h, rot: 0, ...extra });

test('every tool has objects to add; object-only tools start with one centered; an answer box on every tool', () => {
  for (const t of TOOLS) {
    const ks = kindsOf(t.slug).map(k => k.k);
    assert.ok(ks.length >= 2, t.slug); assert.ok(ks.includes('answer'), t.slug);
    assert.equal(objectTool(t.slug), !pieceDefs(t.slug).length);
    const b = newBoard(t.slug);
    if (objectTool(t.slug)) {
      assert.equal(b.objects.length, 1, t.slug); assert.equal(b.objects[0].k, t.slug);
      const r = objRect(t.slug, b.objects[0]);
      assert.ok(Math.abs(r.x + r.w / 2 - WORLD.w / 2) < 2 && Math.abs(r.y + r.h / 2 - WORLD.h / 2) < 2, `${t.slug} centered`);
      assert.equal(b.pieces, undefined);
    } else assert.ok(Array.isArray(b.pieces));
  }
  assert.equal(newBoard('base-ten-blocks').objects[0].k, 'pv-chart', 'base ten starts with its chart');
  assert.equal(newBoard('two-color-counters').objects[0].k, 'ten-frame');
  assert.equal(newBoard('money').objects.length, 0, 'tools with no chart start empty, as before');
});

test('the clock\'s yellow: one minute-hand sector from the start minute to the current minute, rings for full hours, nothing at zero', () => {
  assert.equal(clockSector({ h: 9, m: 10, start: null }), null, 'not tracking: no fill');
  assert.equal(clockSector({ h: 9, m: 10, start: { h: 9, m: 10 } }), null, 'zero: no fill');
  assert.deepEqual(clockSector({ h: 9, m: 25, start: { h: 9, m: 10 } }), { elapsed: 15, turns: 0, part: 15, from: 60, sweep: 90 }, '9:10 to 9:25: from the 2 to the 5');
  assert.deepEqual(clockSector({ h: 10, m: 40, start: { h: 9, m: 10 } }), { elapsed: 90, turns: 1, part: 30, from: 60, sweep: 180 }, '9:10 to 10:40: one ring and half a turn');
  assert.deepEqual(clockSector({ h: 10, m: 10, start: { h: 9, m: 10 } }), { elapsed: 60, turns: 1, part: 0, from: 60, sweep: 0 }, 'a full hour: the ring only');
  assert.deepEqual(clockSector({ h: 1, m: 5, start: { h: 11, m: 50 } }), { elapsed: 75, turns: 1, part: 15, from: 300, sweep: 90 }, 'across 12 o\'clock');
  // Never a half-disc: the sweep is the minutes past the last full hour, never the angle between the two hands.
  const s = clockSector({ h: 9, m: 25, start: { h: 9, m: 10 } }); assert.ok(s.sweep < 180);
  assert.deepEqual(addMinutes({ h: 12, m: 50 }, 15), { h: 1, m: 5 }); assert.deepEqual(addMinutes({ h: 1, m: 0 }, -15), { h: 12, m: 45 });
});

test('old boards (the first release\'s format) open: one object of the tool plus their pieces, notes where they were', () => {
  const clock2 = migrate('clock', { c1: { h: 9, m: 10 }, c2: { h: 11, m: 40 }, two: true, tracker: 0, __ann: { notes: [{ id: 'n', text: 'Hi', x: 0.5, y: 0.5 }], strokes: [], size: { w: 800, h: 430 } } });
  assert.equal(clock2.v, 2); assert.equal(clock2.objects.length, 2, 'two clocks');
  assert.deepEqual(clock2.objects.map(o => [o.st.h, o.st.m, o.st.label]), [[9, 10, 'Start'], [11, 40, 'End']]);
  assert.deepEqual(clockSector(clock2.objects[1].st).elapsed, 150, 'the end clock shows the elapsed time from the start');
  assert.equal(clock2.__ann.notes[0].x, (ORIGIN.x + 400) / WORLD.w, 'a note keeps its place on the board, now on the big board');
  const one = migrate('clock', { c1: { h: 3, m: 0 }, c2: { h: 4, m: 0 }, two: false, tracker: 30 });
  assert.equal(one.objects.length, 1); assert.equal(clockSector(one.objects[0].st).elapsed, 30, 'the tracker becomes the clock\'s tracked time');
  const bt = migrate('base-ten-blocks', { decimal: false, pieces: [{ id: 'p', kind: 'rod', x: 10, y: 20, w: 30, h: 150 }] });
  assert.deepEqual([bt.pieces[0].x, bt.pieces[0].y], [ORIGIN.x + 10, ORIGIN.y + 20]); assert.equal(bt.objects[0].k, 'pv-chart'); assert.equal(bt.decimal, false);
  assert.equal(migrate('base-ten-blocks', { decimal: true, pieces: [] }).objects.length, 0, 'decimals: no chart, as before');
  assert.equal(migrate('two-color-counters', { frame: '5', pieces: [] }).objects[0].k, 'five-frame');
  const hb = migrate('hundred-board', { start: 11, picked: [3], mult: 2 });
  assert.equal(hb.objects[0].k, 'hundred-board'); assert.deepEqual(hb.objects[0].st.picked, [3]);
  assert.equal(migrate('geoboard', {}).objects.length, 1, 'an empty old board: the tool\'s new board');
  const v2 = newBoard('geoboard'); assert.deepEqual(migrate('geoboard', v2).objects, v2.objects, 'a new board stays as it is');
  // In a live room an older square keeps its places (it was in square pixels already).
  const sq = { w: 480, h: 300 }, r = migrate('money', { pieces: [{ id: 'p', kind: 'penny', x: 5, y: 6 }], __ann: { notes: [{ id: 'n', x: 0.2, y: 0.3 }], strokes: [] } }, { at: { x: 0, y: 0 }, space: sq, from: sq });
  assert.deepEqual([r.pieces[0].x, r.__ann.notes[0].x, r.__ann.notes[0].y], [5, 0.2, 0.3]);
});

test('objects keep their own state; a board made big fits into a square (pushes, sessions from a board)', () => {
  const b = newBoard('clock');
  const c2 = placeObject('clock', b, 'clock', { x: 0, y: 0, w: WORLD.w, h: WORLD.h }, WORLD); c2.st.h = 3; b.objects.push(c2);
  const c3 = placeObject('clock', b, 'clock', { x: 0, y: 0, w: WORLD.w, h: WORLD.h }, WORLD); c3.st.h = 7; b.objects.push(c3);
  assert.deepEqual(b.objects.map(o => o.st.h), [9, 3, 7], 'each clock its own time');
  const rs = b.objects.map(o => objRect('clock', o));
  for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) assert.ok(!overlaps(rs[i], rs[j]), 'new objects never land on others');
  const back = JSON.parse(JSON.stringify(b)); assert.deepEqual(back.objects.map(o => o.st.h), [9, 3, 7], 'through JSON (save, share code)');
  const sq = { w: 600, h: 300 }, small = reframe('clock', { ...b, __ann: { notes: [], texts: [], strokes: [] } }, WORLD, sq);
  for (const o of small.objects) { const r = objRect('clock', o); assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= sq.w + 1 && r.y + r.h <= sq.h + 1, 'inside the square'); }
  assert.deepEqual(small.objects.map(o => o.st.h), [9, 3, 7]);
  // A square too small for a big object: it is made smaller (never below the smallest scale).
  const geo = placeObject('geoboard', { objects: [] }, 'geoboard', { x: 0, y: 0, w: 300, h: 250 }, { w: 300, h: 250 });
  assert.ok(geo.s < 1 && geo.s >= 0.35);
});

test('magnetic drops: flush edge to edge, lined up; into slots; groups; nothing far away; a square\'s pieces only', () => {
  const t = SNAP_PX;   // at 100% zoom
  // Linking cubes: dropped 9 px right of a cube and 5 px low: flush on its right, tops lined up.
  const a = piece('a', 'c0', 100, 100, 40, 40), b = piece('b', 'c1', 149, 105, 40, 40);
  assert.deepEqual(snapFor([b], [a], [], t), { dx: -9, dy: -5, to: 'a', slot: null });
  // Number rods end to end; fraction tiles in a row on top of a whole (under it, left edges lined up).
  const whole = piece('w', 'f1', 0, 0, 264, 40), half = piece('h', 'f2', 6, 50, 132, 40);
  assert.deepEqual(snapFor([half], [whole], [], t), { dx: -6, dy: -10, to: 'w', slot: null });
  // A unit beside the middle of a rod: flush on the side, kept where it was along it (no line to snap to there).
  const rod = piece('r', 'rod', 0, 0, 30, 150), unit = piece('u', 'unit', 36, 60, 30, 30);
  assert.deepEqual(snapFor([unit], [rod], [], t), { dx: -6, dy: 0, to: 'r', slot: null });
  // Coins: centered on each other's middle line.
  const q = piece('q', 'quarter', 0, 0, 48, 48), d = piece('d', 'dime', 52, 10, 36, 36);
  assert.deepEqual(snapFor([d], [q], [], t), { dx: -4, dy: -4, to: 'q', slot: null });
  // Too far: nothing. Zoomed out, the same screen distance is farther on the board.
  assert.equal(snapFor([piece('b', 'c1', 160, 100, 40, 40)], [a], [], t), null);
  assert.ok(snapFor([piece('b', 'c1', 160, 100, 40, 40)], [a], [], SNAP_PX / 0.5), 'at 50% zoom 20 board px is 10 screen px');
  // Turned at an odd angle: no snap. A quarter turn: its turned box.
  assert.equal(snapFor([{ ...b, rot: 30 }], [a], [], t), null);
  assert.deepEqual(pieceBox({ id: 'r', x: 0, y: 0, w: 30, h: 150, rot: 90 }), { id: 'r', x: -60, y: 60, w: 150, h: 30, round: false });
  // Slots: a ten-frame's cell centers a counter; a place-value column centers a block across it.
  const frame = { id: 'f', k: 'ten-frame', x: 0, y: 0, s: 1, st: { n: 10 } }, cells = slotsOf('two-color-counters', frame);
  assert.equal(cells.length, 10);
  const c = piece('c', 'pos', cells[3].x + 10, cells[3].y + 2, 48, 48), s = snapFor([c], [], cells, t);
  assert.deepEqual([c.x + s.dx, c.y + s.dy], [cells[3].x + 6, cells[3].y + 6]);
  const chart = { id: 'c', k: 'pv-chart', x: 0, y: 0, s: 1, st: { cols: ['Thousands', 'Hundreds', 'Tens', 'Ones'] } }, cols = slotsOf('base-ten-blocks', chart);
  const u = piece('u', 'unit', cols[3].x + 5, cols[3].y + 40, 30, 30), su = snapFor([u], [], cols, t);
  assert.equal(u.x + su.dx, cols[3].x + (cols[3].w - 30) / 2); assert.equal(su.dy, 0);
  // A group moves together and snaps as one (the held piece leads).
  const g1 = piece('g1', 'c0', 300, 300, 40, 40, { g: 'G' }), g2 = piece('g2', 'c0', 340, 300, 40, 40, { g: 'G' });
  assert.deepEqual(groupOf([a, g1, g2], g2).map(x => x.id), ['g1', 'g2']);
  assert.deepEqual(groupOf([a, g1, g2], a).map(x => x.id), ['a']);
  const moved = [{ ...g1, x: 145, y: 100 }, { ...g2, x: 185, y: 100 }];
  assert.deepEqual(snapFor(moved, [a], [], t), { dx: -5, dy: 0, to: 'a', slot: null });
  // Only the pieces it is given: the room passes a square's own pieces, so a classmate's piece never attracts.
  assert.equal(snapFor([b], [], [], t), null);
});

test('practice sets: the owner\'s 8 clocks, distinct, in a 4 x 2 grid, each with an answer box; one step', () => {
  const r = buildPractice('clock', { title: 'What time is it?', steps: ['Write the time under each clock.'], items: ['3:00', '7:30', '9:15', '11:45', '3:00', '12:10', '6:05', '1:55'].map(time => ({ time, box: 'answer' })) });
  const clocks = r.board.objects.filter(o => o.k === 'clock'), boxes = r.board.objects.filter(o => o.k === 'answer');
  assert.equal(clocks.length, 8); assert.equal(boxes.length, 8); assert.deepEqual(r.steps, ['Write the time under each clock.']);
  assert.equal(new Set(clocks.map(o => `${o.st.h}:${o.st.m}`)).size, 8, 'the repeated 3:00 became another time');
  assert.equal(new Set(clocks.map(o => o.y)).size, 2, 'two rows'); assert.equal(new Set(clocks.map(o => o.x)).size, 4, 'four columns');
  assert.equal(boxes[0].st.key, '3:00'); assert.equal(boxes[0].st.ans, '');
  for (const b of boxes) { const c = clocks.find(o => o.x <= b.x + 1 && o.x + 252 >= b.x && o.y < b.y); assert.ok(c, 'each box under its clock'); }
  const rects = r.board.objects.map(o => objRect('clock', o));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) assert.ok(!overlaps(rects[i], rects[j]), 'nothing overlaps');
  for (const x of rects) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= WORLD.w && x.y + x.h <= WORLD.h, 'inside the board');
  // Capped at 12; asked for more, the step says so.
  const big = buildPractice('clock', { items: Array.from({ length: 20 }, (_, i) => ({ time: `${(i % 12) + 1}:00` })) });
  assert.equal(big.n, PRACTICE_MAX); assert.ok(big.capped); assert.match(big.steps.at(-1), /12 problems/);
  // "build": a clock at 12:00 to set, labeled with the time to show; "none": no answer box.
  const build = buildPractice('clock', { items: [{ time: '4:20', box: 'build' }, { time: '5:00', box: 'none' }] });
  assert.equal(build.board.objects.filter(o => o.k === 'answer').length, 0);
  assert.deepEqual([build.board.objects[0].st.h, build.board.objects[0].st.label], [12, 'Show 4:20']);
});

test('fraction equations: +, −, ×, ÷ by a whole, equivalence and compare; checked, simplest answers, distinct', () => {
  assert.deepEqual(fracEquation({ op: '+', a: '1/2', b: '1/3' }), { a: '1/2', op: '+', b: '1/3', text: '1/2 + 1/3 = ?', key: '5/6' });
  assert.equal(fracEquation({ op: '+', a: '3/4', b: '1/2' }).key, '1 1/4', 'mixed number');
  assert.equal(fracEquation({ op: '-', a: '1 1/2', b: '3/4' }).key, '3/4', 'mixed operand');
  assert.equal(fracEquation({ op: 'x', a: '2/3', b: '3' }).key, '2');
  assert.equal(fracEquation({ op: '/', a: '1/2', b: '3' }).key, '1/6');
  assert.equal(fracEquation({ op: '=', a: '3/4', b: '8' }).text, '3/4 = ?/8'); assert.equal(fracEquation({ op: '=', a: '3/4', b: '8' }).key, '6/8');
  assert.equal(fracEquation({ op: 'compare', a: '2/4', b: '1/2' }).key, '=');
  for (const bad of [{ op: '+', a: '1/7', b: '1/3' }, { op: '-', a: '1/4', b: '1/2' }, { op: '/', a: '1/3', b: '3' }, { op: '=', a: '1/3', b: '8' }, { op: '^', a: '1/2', b: '1/2' }, { op: '+', a: 'x', b: '1/2' }, { op: '+', a: '2/3', b: '1/0' }])
    assert.equal(fracEquation(bad), null, JSON.stringify(bad));
  assert.equal(fracText(10, 4), '2 1/2'); assert.deepEqual(parseFrac('2 3/4'), { n: 11, d: 4 });
  const set = buildPractice('fraction-tiles', { items: [{ op: '+', a: '1/2', b: '1/3' }, { op: '+', a: '1/4', b: '1/3' }, { op: '+', a: '2/3', b: '1/4' }, { op: '+', a: '1/2', b: '1/5' }, { op: '+', a: '1/2', b: '1/3' }, { op: '+', a: '3/8', b: '1/4' }] });
  const eqs = set.board.objects.filter(o => o.k === 'frac-eq');
  assert.equal(eqs.length, 6); assert.equal(new Set(eqs.map(o => o.st.text)).size, 6, 'the repeat became another equation');
  for (const e of eqs) assert.ok(fracEquation(e.st), 'every one valid');
  assert.equal(new Set(eqs.map(o => o.y)).size, 2, '3 x 2 grid');
});

test('practice sets on all 18 tools: an item means something on each; settings checked; repeats replaced; answers computed', () => {
  assert.deepEqual(Object.keys(PRACTICE_TABLE).sort(), TOOLS.map(t => t.slug).sort());
  assert.deepEqual(Object.keys(PRACTICE_HELP).sort(), TOOLS.map(t => t.slug).sort());
  const ex = {
    clock: { time: '7:30' }, 'number-lines': { min: 0, max: 20, step: 2, value: 14 }, 'hundred-board': { value: 47 }, rekenreks: { value: 13 },
    'fraction-circles': { fractions: ['3/4'] }, 'fraction-tiles': { op: '+', a: '1/2', b: '1/4' }, 'base-ten-blocks': { value: 346 }, 'place-value-disks': { value: 2305 },
    'two-color-counters': { value: 7 }, 'linking-cubes': { value: 12 }, 'color-tiles': { rows: 3, cols: 4 }, 'number-rods': { numbers: [3, 5] }, money: { value: 135 },
    'algebra-tiles': { pieces: [{ kind: 'x2', count: 1 }, { kind: 'x', count: 3 }, { kind: 'one', count: 2 }] }, 'pattern-blocks': { pieces: [{ kind: 'trap', count: 3 }] },
    'xy-coordinate-board': { points: [{ x: 3, y: -2 }] }, geoboard: { pegs: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 2 }] }, 'bar-models': { parts: [3, 5], unknown: 2 },
  };
  const keys = { clock: '7:30', 'number-lines': '14', 'hundred-board': '47', rekenreks: '13', 'fraction-circles': '3/4', 'fraction-tiles': '3/4', 'base-ten-blocks': '346', 'place-value-disks': '2305',
    'two-color-counters': '7', 'linking-cubes': '12', 'color-tiles': '12', 'number-rods': '8', money: '$1.35', 'algebra-tiles': '1x² + 3x + 2', 'pattern-blocks': '1 1/2',
    'xy-coordinate-board': '(3,-2)', geoboard: '3 square units', 'bar-models': '8' };
  for (const t of TOOLS) {
    const r = buildPractice(t.slug, { items: [ex[t.slug], ex[t.slug], ex[t.slug], { nonsense: 1 }] });
    assert.equal(r.n, 3, `${t.slug}: three distinct items from one repeated (the nonsense one dropped)`); assert.equal(r.dropped, 1, t.slug);
    const first = r.board.objects.find(o => o.st.key);
    assert.equal(first.st.key, keys[t.slug], `${t.slug} answer`);
    const all = [...r.board.objects.map(o => objRect(t.slug, o)), ...(r.board.pieces || []).map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }))];
    for (const x of all) assert.ok(x.x >= 0 && x.y >= 0 && x.x + x.w <= WORLD.w && x.y + x.h <= WORLD.h, `${t.slug} inside`);
    const objs = r.board.objects.map(o => objRect(t.slug, o));
    for (let i = 0; i < objs.length; i++) for (let j = i + 1; j < objs.length; j++) {
      const a = r.board.objects[i], b = r.board.objects[j];
      if (a.k === 'mat' || b.k === 'mat' || a.k === 'ten-frame' || b.k === 'ten-frame') continue;
      assert.ok(!overlaps(objs[i], objs[j]), `${t.slug}: objects never overlap`);
    }
    assert.ok(r.board.objects.length <= OBJ_MAX * 3);
  }
  // Settings a tool can't show are refused, not guessed.
  assert.equal(buildPractice('clock', { items: [{ time: '13:75' }] }).n, 0);
  assert.equal(buildPractice('number-lines', { items: [{ min: 0, max: 10, step: 3, value: 2 }] }).n, 0, 'a step the tool does not have');
  assert.equal(buildPractice('number-lines', { items: [{ min: 0, max: 10, step: 1, value: 2.5 }] }).n, 0, 'a point off the steps');
  assert.equal(buildPractice('base-ten-blocks', { items: [{ value: 9999 }] }).n, 0, 'too many blocks');
  assert.equal(buildPractice('geoboard', { items: [{ pegs: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }] }).n, 0, 'a band with no area');
  assert.equal(buildPractice('xy-coordinate-board', { items: [{ points: [{ x: 30, y: 0 }] }] }).n, 0);
  assert.equal(buildPractice('money', { items: [{ value: -5 }] }).n, 0);
  assert.equal(buildPractice('fraction-circles', { items: [{ fractions: ['5/7'] }] }).n, 0);
  // Words: steps and labels go through the caller's word check.
  const clean = s => (/bad/.test(s) ? '' : s);
  assert.deepEqual(buildPractice('clock', { steps: ['a bad step', 'Read it.'], items: [{ time: '1:00', label: 'bad' }] }, { clean }).steps, ['Read it.']);
});

test('the answer box and the fraction equation are real objects (any tool / fraction tools), sized for their content', () => {
  for (const t of TOOLS) assert.ok(kindsOf(t.slug).some(k => k.k === 'answer'));
  assert.ok(kindsOf('fraction-tiles').some(k => k.k === 'frac-eq') && kindsOf('fraction-circles').some(k => k.k === 'frac-eq'));
  const A = OBJECTS.clock.find(k => k.k === 'answer');
  assert.ok(A.size({ size: 'L' }).w > A.size({ size: 'S' }).w);
});

test('tap to add: the next piece goes right of the last one added (centers lined up, an even gap), wraps under the run, steps past others, fills a frame\'s next cell', async () => {
  const { nextPieceSpot, ROW_GAP } = await import('../../public/js/manip-board.js');
  const defs = pieceDefs('place-value-disks'), D = k => defs.find(d => d.kind === k);
  const b = { v: 2, objects: [], pieces: [] }, region = { x: 0, y: 0, w: 600, h: 400 };
  let last = null;
  const add = k => { const d = D(k), at = nextPieceSpot('place-value-disks', b, d, region, last); const p = { id: `p${b.pieces.length}`, kind: k, x: at.x, y: at.y, w: d.w, h: d.h }; b.pieces.push(p); last = { id: p.id, runX: at.runX }; return p; };
  const seq = ['o', 'o', 'o', 't', 'h', 'hth'].map(add);
  for (let i = 1; i < seq.length; i++) {
    assert.equal(seq[i].x, seq[i - 1].x + seq[i - 1].w + ROW_GAP, `piece ${i} right after the one before`);
    assert.equal(Math.round(seq[i].y + seq[i].h / 2), Math.round(seq[0].y + seq[0].h / 2), 'centers lined up');
  }
  // The row runs out of room: the next one starts a row under the run's start, left-aligned.
  for (let i = 0; i < 4; i++) add('hth');
  const wrapped = b.pieces.find(p => p.y > seq[0].y + 30);
  assert.ok(wrapped, 'a second row'); assert.equal(wrapped.x, seq[0].x, 'under the start of the run');
  for (let i = 0; i < b.pieces.length; i++) for (let j = i + 1; j < b.pieces.length; j++) assert.ok(!overlaps(b.pieces[i], b.pieces[j]), 'never on another piece');
  // Something in the way: step on past it.
  const c = { v: 2, objects: [], pieces: [{ id: 'a', kind: 'o', x: 20, y: 20, w: 50, h: 50 }, { id: 'x', kind: 'o', x: 80, y: 20, w: 50, h: 50 }] };
  const at = nextPieceSpot('place-value-disks', c, D('o'), region, { id: 'a', runX: 20 });
  assert.ok(at.x >= 130 + ROW_GAP - 1 && at.y === 20);
  // A counter in a ten-frame's first cell: the next counter goes in the next free cell.
  const frame = { id: 'f', k: 'ten-frame', x: 100, y: 100, s: 1, st: { n: 10 } }, cells = slotsOf('two-color-counters', frame), pos = pieceDefs('two-color-counters')[0];
  const f = { v: 2, objects: [frame], pieces: [{ id: 'c0', kind: 'pos', x: cells[0].x + 6, y: cells[0].y + 6, w: 48, h: 48 }] };
  assert.deepEqual(nextPieceSpot('two-color-counters', f, pos, { x: 0, y: 0, w: 1000, h: 800 }, { id: 'c0', runX: 0 }), { x: cells[1].x + 6, y: cells[1].y + 6, runX: 0 });
  // Nothing added before: the region's first free spot.
  assert.deepEqual(nextPieceSpot('money', { pieces: [] }, pieceDefs('money')[0], { x: 100, y: 50, w: 400, h: 300 }, null), { x: 116, y: 66, runX: 116 });
});

test('every string the manipulatives pages ask for exists (no raw "js.manip..." key can reach the screen)', async () => {
  const fs = await import('node:fs');
  const en = JSON.parse(fs.readFileSync(new URL('../../server/i18n/locales/en.json', import.meta.url)));
  const get = k => k.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), en);
  for (const f of ['manip.js', 'manip-room.js']) {
    const src = fs.readFileSync(new URL(`../../public/js/${f}`, import.meta.url), 'utf8');
    const keys = [...src.matchAll(/t\('((?:js)\.manip(?:-room)?\.[a-zA-Z.]+)'/g)].map(m => m[1]);
    assert.ok(keys.length > 50, f);
    for (const k of keys) assert.equal(typeof get(k), 'string', `${f}: ${k}`);
  }
});

test('practice questions give nothing away: marked read-only (no digital time, no totals), "build" items stay settable', () => {
  const r = buildPractice('clock', { items: [{ time: '3:00', box: 'answer' }, { time: '4:20', box: 'build' }] });
  const [q, b] = r.board.objects.filter(o => o.k === 'clock');
  assert.equal(q.st.q, true); assert.equal(b.st.q, undefined);
  for (const slug of ['number-lines', 'base-ten-blocks', 'money', 'geoboard']) {
    const x = buildPractice(slug, { items: [{ number: 1, value: 14, min: 0, max: 20, step: 2, pegs: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] }] });
    assert.ok(x.board.objects.filter(o => o.k !== 'answer').every(o => o.st.q), slug);
  }
});

test('checking an answer accepts sensible equivalent forms and never needs the answer shown', async () => {
  const { answerMatches, timeOf, valueOf, centsOf } = await import('../../public/js/manip-practice.js');
  const yes = (k, a, o) => assert.equal(answerMatches(k, a, o), true, `${k} <- ${a}`), no = (k, a, o) => assert.equal(answerMatches(k, a, o), false, `${k} <- ${a}`);
  for (const a of ['7:30', '7.30', '07:30', 'half past 7', 'half past seven', ' 7:30 ']) yes('7:30', a);
  yes('7:45', 'quarter to 8'); yes('3:15', 'quarter past 3'); yes('3:00', "3 o'clock"); yes('12:10', '12.10'); no('7:30', '7:35'); no('7:30', '19:30');
  for (const a of ['5/6', '10/12', '15/18']) yes('5/6', a);
  no('5/6', '10/12', { simplest: true }); yes('5/6', '5/6', { simplest: true }); yes('1 1/4', '5/4'); yes('1 1/4', '1.25'); yes('1 1/4', '5/4', { simplest: true }); no('1 1/4', '10/8', { simplest: true });
  yes('4/8', '4', { over: 8 }); yes('4/8', '4/8', { over: 8 }); no('4/8', '1/2', { over: 8 });
  for (const a of ['1032', '1,032', ' 1032']) yes('1032', a);
  yes('-2', '−2'); yes('0.3', '.3'); yes('0.3', '3/10'); no('346', '364');
  for (const a of ['$1.35', '1.35', '135¢', '135 cents', '$1.35 ']) yes('$1.35', a);
  no('$1.35', '$1.53'); yes('$2.00', '200¢'); yes('$2.00', '$2');
  yes('<', '<'); no('<', '>'); yes('(3,-2)', '( 3, −2 )'); no('(3,-2)', '(-2,3)');
  yes('6 square units', '6'); yes('6 square units', '6 sq units'); yes('1 1/2', '3/2');
  yes('1x² + 3x + 2', 'x^2 + 3x + 2'); yes('2x² − 1', '2x²-1'); no('x', '');
  assert.equal(timeOf('quarter to 1'), timeOf('12:45')); assert.deepEqual(valueOf('1,032'), { n: 1032, d: 1 }); assert.equal(centsOf('2.5'), 250);
});
