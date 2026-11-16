// Classroom dashboards: the shape board, the geoboard rebuilt (docs/decisions.md "Shape board"). The geometry on the
// three boards (public/js/dash-math4.js: peg places, exact areas and perimeters, inside angles, preset shapes, moving
// bands, pen strokes), the state rebuilt on the server (old geoboards load unchanged; labels and drawings never kept on a
// student's own screen), the question made from a band, the words in every language, and the renderer's rules.
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-dashshape-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const D = await import('../../server/services/dash.js');
const DT = await import('../../server/services/dash-tools.js');
const G = await import('../../public/js/dash-math4.js');
const A = await import('../../public/js/dash-ask.js');
const { tFor } = await import('../../server/i18n/index.js');

const P = (...a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };
const R = (...xs) => xs.map(x => ({ x, y: 0 }));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) < eps;
const sum = xs => xs.reduce((s, x) => s + x, 0);

test('peg places: the square grid, triangle dots (every other row half a step over) and the circle (centre last)', () => {
  assert.deepEqual(G.pegXY('square', 7, { x: 3, y: 2 }), { x: 3, y: 2 });
  const a = G.pegXY('iso', 7, { x: 0, y: 0 }), b = G.pegXY('iso', 7, { x: 1, y: 0 }), c = G.pegXY('iso', 7, { x: 0, y: 1 });
  // Neighbours on triangle dots are all one step apart: an equilateral triangle.
  assert.ok(near(Math.hypot(b.x - a.x, b.y - a.y), 1) && near(Math.hypot(c.x - a.x, c.y - a.y), 1) && near(Math.hypot(c.x - b.x, c.y - b.y), 1));
  assert.ok(near(G.pegXY('iso', 7, { x: 2, y: 3 }).x, 2.5) && near(G.pegXY('iso', 7, { x: 2, y: 3 }).y, 3 * Math.sqrt(3) / 2));
  const top = G.pegXY('circle', 12, { x: 0, y: 0 }), right = G.pegXY('circle', 12, { x: 3, y: 0 });
  assert.ok(near(top.x, 0) && near(top.y, -1), 'peg 0 is at the top'); assert.ok(near(right.x, 1) && near(right.y, 0), 'and they go clockwise');
  assert.deepEqual(G.pegXY('circle', 12, { x: 12, y: 0 }), { x: 0, y: 0 }, 'the centre');
  assert.equal(G.pegList('square', 5).length, 25); assert.equal(G.pegList('iso', 7).length, 49); assert.equal(G.pegList('circle', 8).length, 9);
  assert.ok(G.onBoard('circle', 8, { x: 8, y: 0 }) && !G.onBoard('circle', 8, { x: 9, y: 0 }) && !G.onBoard('circle', 8, { x: 1, y: 1 }));
  assert.ok(G.onBoard('iso', 5, { x: 4, y: 4 }) && !G.onBoard('iso', 5, { x: 5, y: 0 }));
  // Lattice steps on triangle dots and back.
  for (const p of G.pegList('iso', 7)) assert.deepEqual(G.fromLattice('iso', G.toLattice('iso', p)), p);
});

test('exact areas: Pick\'s theorem on the square grid; small triangles on triangle dots, checked by counting', () => {
  // The square grid: the same as the stage 4 geoboard (shoelace and Pick agree).
  for (const s of [P(0, 0, 3, 0, 3, 3, 0, 3), P(1, 1, 8, 2, 9, 7, 3, 9, 2, 5), P(0, 0, 6, 0, 6, 1, 1, 1, 1, 5, 0, 5)]) {
    const a = G.shapeArea('square', 11, s), p = G.pick(s);
    assert.deepEqual(a, { kind: 'sq', a2: p.a2, I: p.I, B: p.B }); assert.equal(a.a2, G.doubleArea(s));
  }
  // Triangle dots: count the small triangles whose middle is inside the shape, one by one.
  const count = (pts, n) => {
    const H = Math.sqrt(3) / 2, L = pts.map(p => G.pegXY('iso', n, p)); let t = 0;
    const inside = (x, y) => { let c = false; for (let i = 0, j = L.length - 1; i < L.length; j = i++) { const a = L[i], b = L[j]; if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) c = !c; } return c; };
    for (let r = -1; r <= n; r++) for (let u = -2 * n; u <= 2 * n; u++) {
      // Two triangles in each rhombus of the lattice: their middles.
      const o = { x: u + r / 2, y: r * H };
      for (const m of [{ x: o.x + 0.5, y: o.y + H / 3 }, { x: o.x + 1, y: o.y + 2 * H / 3 }]) if (inside(m.x, m.y)) t++;
    }
    return t;
  };
  const shapes = [G.presetShape('hex', 'iso', 7), G.presetShape('tri', 'iso', 7), G.presetShape('trap', 'iso', 11), G.presetShape('para', 'iso', 5),
    [{ x: 1, y: 1 }, { x: 5, y: 1 }, { x: 4, y: 4 }, { x: 2, y: 5 }, { x: 1, y: 3 }], [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 2, y: 2 }, { x: 4, y: 4 }, { x: 0, y: 4 }]];
  // Shapes whose sides run along the dots' lines are whole small triangles: count them. Any shape's area, measured on
  // the screen, is t small triangles of √3/4 each.
  shapes.forEach((s, i) => {
    assert.ok(G.simpleOn('iso', 11, s), JSON.stringify(s));
    const a = G.shapeArea('iso', 11, s);
    assert.equal(a.kind, 'tri');
    if (i < 4) assert.equal(a.t, count(s, 11), `small triangles in ${JSON.stringify(s)}`);
    const xy = s.map(p => G.pegXY('iso', 11, p)); let real = 0; for (let k = 0; k < xy.length; k++) { const p = xy[k], q = xy[(k + 1) % xy.length]; real += p.x * q.y - q.x * p.y; }
    assert.ok(near(Math.abs(real) / 2, a.t * Math.sqrt(3) / 4, 1e-9), `area of ${JSON.stringify(s)}`);
    assert.equal(a.t, 2 * a.I + a.B - 2, 't = 2I + B − 2');
  });
  assert.equal(G.shapeArea('iso', 7, G.presetShape('hex', 'iso', 7)).t, 24, 'a hexagon of side 2 is 24 small triangles');
  assert.equal(G.shapeArea('iso', 5, G.presetShape('tri', 'iso', 5)).t, 4);
  // The circle: approx, with the radius as 1.
  assert.ok(near(G.shapeArea('circle', 12, G.presetShape('hex', 'circle', 12)).a, 3 * Math.sqrt(3) / 2));
  assert.ok(near(G.shapeArea('circle', 8, G.presetShape('sq', 'circle', 8)).a, 2));
});

test('exact lengths: whole units plus simplified roots on both grids; the circle\'s chords are said as "≈"', () => {
  assert.equal(G.sideSquare('square', { x: 0, y: 0 }, { x: 2, y: 1 }), 5);
  assert.equal(G.sideSquare('iso', { x: 0, y: 0 }, { x: 1, y: 0 }), 1);
  assert.equal(G.sideSquare('iso', { x: 0, y: 0 }, { x: 0, y: 1 }), 1, 'down to the right is one step');
  assert.equal(G.sideSquare('iso', { x: 0, y: 0 }, { x: 0, y: 2 }), 3, 'two rows straight down is √3');
  assert.equal(G.sideSquare('circle', { x: 0, y: 0 }, { x: 1, y: 0 }), null);
  assert.equal(G.lengthText(G.bandLengthOn('square', 7, P(1, 1, 4, 1, 5, 3, 2, 3))), '6 + 2√5');
  assert.equal(G.lengthLabel(G.bandLengthOn('square', 7, P(0, 0, 1, 1, 2, 0)), 'en'), '2 + 2√2 ≈ 4.83');
  assert.equal(G.lengthText(G.bandLengthOn('iso', 7, G.presetShape('hex', 'iso', 7))), '12');
  assert.equal(G.lengthText(G.bandLengthOn('iso', 7, G.presetShape('rect', 'iso', 7))), '4 + 4√3');
  assert.equal(G.lengthText(G.bandLengthOn('iso', 7, G.presetShape('right', 'iso', 7))), '6 + 2√3');
  const hex = G.bandLengthOn('circle', 12, G.presetShape('hex', 'circle', 12));
  assert.ok(hex.inexact && near(hex.approx, 6)); assert.equal(G.lengthLabel(hex, 'en'), '≈ 6');
  assert.ok(near(G.sideLength('circle', 12, { x: 0, y: 0 }, { x: 12, y: 0 }).approx, 1), 'centre to ring is the radius');
  // An open band's length leaves out the closing side.
  assert.equal(G.lengthText(G.bandLengthOn('iso', 7, [{ x: 0, y: 0 }, { x: 2, y: 0 }], false)), '2');
  assert.equal(G.lengthLabel(G.bandLengthOn('square', 5, P(0, 0, 3, 4), false), 'de'), '5');
  assert.equal(G.approxText({ approx: 4.8284 }, 'de'), '4,83');
});

test('inside angles add up to (n − 2) × 180 on every board; right angles are 90; a dent is reflex', () => {
  for (const board of G.BOARDS) for (const n of board === 'circle' ? G.RING_SIZES : G.GRID_SIZES) for (const k of G.presetsFor(board, n)) {
    const pts = G.presetShape(k, board, n), a = G.interiorAngles(board, n, pts);
    assert.ok(G.simpleOn(board, n, pts), `${board} ${n} ${k}`);
    assert.ok(pts.every(p => G.onBoard(board, n, p)), `${board} ${n} ${k} on the board`);
    assert.ok(near(sum(a), (pts.length - 2) * 180, 1e-6), `${board} ${n} ${k}: ${a}`);
    assert.ok(a.every(x => x > 0 && x < 360));
  }
  assert.deepEqual(G.interiorAngles('square', 7, P(0, 0, 3, 0, 3, 2, 0, 2)).map(Math.round), [90, 90, 90, 90]);
  // The same shape either way round gives the same angles.
  assert.deepEqual(G.interiorAngles('square', 7, P(0, 2, 3, 2, 3, 0, 0, 0)).map(Math.round), [90, 90, 90, 90]);
  const L = G.interiorAngles('square', 7, P(0, 0, 4, 0, 4, 1, 1, 1, 1, 3, 0, 3)).map(Math.round);
  assert.deepEqual(L, [90, 90, 90, 270, 90, 90], 'an L shape has one reflex corner');
  assert.deepEqual(G.interiorAngles('iso', 7, G.presetShape('tri', 'iso', 7)).map(Math.round), [60, 60, 60]);
  assert.deepEqual(G.interiorAngles('circle', 12, G.presetShape('right', 'circle', 12)).map(Math.round).sort((a, b) => a - b), [30, 60, 90], 'a triangle on a diameter is right-angled');
  assert.equal(G.angleText(90.000000001), '90°'); assert.equal(G.angleText(63.43494882), '63.4°'); assert.equal(G.angleText(63.43494882, 'de'), '63,4°');
  assert.equal(G.angleText(22.5), '22.5°');
  assert.equal(G.vertexLetter(0), 'A'); assert.equal(G.vertexLetter(25), 'Z'); assert.equal(G.vertexLetter(26), 'A′');
});

test('real shapes only: crossing, repeated or flat bands have no area, on every board', () => {
  assert.equal(G.simpleOn('square', 5, P(0, 0, 2, 2, 2, 0, 0, 2)), false, 'a bow tie');
  assert.equal(G.simpleOn('square', 5, P(0, 0, 2, 0, 2, 2, 0, 0)), false, 'a peg twice');
  assert.equal(G.simpleOn('iso', 5, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]), false, 'three in a row');
  assert.equal(G.simpleOn('iso', 5, [{ x: 0, y: 0 }, { x: 0, y: 2 }, { x: 0, y: 4 }]), false, 'straight down two rows and on: a line');
  assert.equal(G.simpleOn('iso', 5, [{ x: 0, y: 0 }, { x: 1, y: 2 }, { x: 0, y: 4 }]), true, 'every other row is half a step over: not a line');
  assert.equal(G.simpleOn('circle', 12, R(0, 12, 6)), false, 'two ends of a diameter and the centre: a line');
  assert.equal(G.simpleOn('circle', 12, R(0, 12, 4)), true);
  assert.equal(G.simpleOn('circle', 12, R(0, 6, 3, 9)), false, 'a bow tie through the centre');
});

test('pegs under a finger, inside a band, and moving a band peg by peg (the circle turns round its centre)', () => {
  assert.deepEqual(G.nearestPeg('square', 7, { x: 2.3, y: 4.6 }).p, { x: 2, y: 5 });
  assert.deepEqual(G.nearestPeg('square', 7, { x: -3, y: 9 }).p, { x: 0, y: 6 }, 'off the board: the nearest edge peg');
  assert.deepEqual(G.nearestPeg('iso', 7, G.pegXY('iso', 7, { x: 3, y: 3 })).p, { x: 3, y: 3 });
  assert.deepEqual(G.nearestPeg('iso', 7, { x: 3.4, y: 0.9 }).p, { x: 3, y: 1 }, 'row 1 is half a step over');
  assert.deepEqual(G.nearestPeg('circle', 12, { x: 0.05, y: -0.1 }).p, { x: 12, y: 0 });
  assert.deepEqual(G.nearestPeg('circle', 12, { x: 0.9, y: 0.05 }).p, { x: 3, y: 0 });
  const sq = P(1, 1, 4, 1, 4, 4, 1, 4);
  assert.ok(G.insideBand('square', 7, sq, { x: 2.5, y: 2.5 }) && !G.insideBand('square', 7, sq, { x: 5, y: 2 }));
  assert.deepEqual(G.moveBand('square', 7, sq, 2, 1), P(3, 2, 6, 2, 6, 5, 3, 5));
  assert.equal(G.moveBand('square', 7, sq, 3, 0), null, 'off the board: no move');
  // Triangle dots move along the lattice, so a shape keeps its shape (and its area and angles).
  const hex = G.presetShape('hex', 'iso', 9), moved = G.moveBand('iso', 9, hex, 1, 1);
  assert.ok(moved); assert.equal(G.shapeArea('iso', 9, moved).t, G.shapeArea('iso', 9, hex).t);
  assert.deepEqual(G.interiorAngles('iso', 9, moved).map(Math.round), G.interiorAngles('iso', 9, hex).map(Math.round));
  assert.deepEqual(G.moveBand('circle', 12, R(0, 4, 12), 2, 0), R(2, 6, 12), 'the centre stays put');
  assert.deepEqual(G.moveBand('circle', 12, R(11, 3), 2, 0), R(1, 5), 'round past the top');
});

test('preset shapes: in the middle, real, and the expected size; only where the board can make them', () => {
  assert.deepEqual(G.presetsFor('square', 7), G.SHAPE_KINDS);
  assert.deepEqual(G.presetsFor('iso', 7), ['tri', 'right', 'rect', 'para', 'trap', 'hex'], 'no square on triangle dots');
  assert.deepEqual(G.presetsFor('circle', 8), ['tri', 'right', 'sq', 'oct']);
  assert.deepEqual(G.presetsFor('circle', 10), ['tri', 'right', 'rect', 'pent']);
  const area = (k, n = 7) => G.mixed(G.shapeArea('square', n, G.presetShape(k, 'square', n)).a2, 2);
  assert.deepEqual(['tri', 'right', 'sq', 'rect', 'para', 'trap', 'hex', 'oct'].map(k => area(k)), ['6', '6', '9', '8', '6', '6', '12', '14']);
  for (const n of G.GRID_SIZES) for (const k of G.presetsFor('square', n)) {
    const pts = G.presetShape(k, 'square', n), xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - (n - 1) / 2) <= 0.5 && Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - (n - 1) / 2) <= 0.5, `${k} on ${n} is in the middle`);
  }
  // Regular shapes on the circle have equal sides.
  for (const [k, n] of [['tri', 12], ['sq', 16], ['pent', 10], ['hex', 24], ['oct', 8]]) {
    const pts = G.presetShape(k, 'circle', n), s = pts.map((p, i) => G.sideLength('circle', n, p, pts[(i + 1) % pts.length]).approx);
    assert.ok(s.every(x => near(x, s[0], 1e-9)), `${k} on ${n}`);
  }
  assert.equal(G.presetShape('pent', 'circle', 12), null); assert.equal(G.presetShape('sq', 'iso', 7), null); assert.equal(G.presetShape('star', 'square', 7), null);
});

test('pen strokes are simplified: straight runs lose their middle points, corners stay', () => {
  const line = Array.from({ length: 50 }, (_, i) => [i * 10, 100]);
  assert.deepEqual(G.simplifyStroke(line), [[0, 100], [490, 100]]);
  const vee = [...Array.from({ length: 20 }, (_, i) => [i * 10, i * 10]), ...Array.from({ length: 20 }, (_, i) => [200 + i * 10, 190 - i * 10])];
  const s = G.simplifyStroke(vee);
  assert.ok(s.length <= 4 && s.some(([x, y]) => x === 190 && y === 190), JSON.stringify(s));
  assert.deepEqual(G.simplifyStroke([[1, 2]]), [[1, 2]]);
});

test('the state on the server: old geoboards come back exactly as saved; new keys are kept only when not their start', () => {
  const c = DT.cleanToolState;
  // Layouts saved before the shape board.
  const olds = [
    DT.cleanToolState('geoboard', {}),
    { pegs: 11, cur: 0, show: true, bands: [{ pts: P(1, 1, 8, 2, 9, 7, 3, 9, 2, 5), closed: true }, { pts: P(5, 4, 7, 5, 6, 8), closed: false }] },
    { pegs: 5, cur: 2, show: false, bands: [{ pts: P(0, 0, 4, 0, 4, 4), closed: true }, { pts: [], closed: false }, { pts: P(1, 1), closed: false }] },
  ];
  for (const o of olds) assert.deepEqual(c('geoboard', o), o);
  assert.deepEqual(c('geoboard', {}), { pegs: 7, cur: 0, show: true, bands: [{ pts: P(1, 1, 4, 1, 5, 3, 2, 3), closed: true }] }, 'the starting state is as it was');
  // The new keys.
  const s = c('geoboard', { board: 'iso', pegs: 9, cur: -1, fills: false, lines: 1, angles: 'true', labels: true, title: `Make a hexagon‮\u0007 ${'x'.repeat(120)}`,
    bands: [{ pts: P(0, 0, 2, 0, 1, 2), closed: true, c: 9 }, { pts: P(0, 0, 9, 9, 3, 3), c: 4 }, { pts: P(1, 1, 2, 1), c: -3 }],
    notes: [{ x: -5, y: 2000, t: 'Hexagon ⁦!⁩' }, { x: 10, y: 10, t: '   ' }, ...Array(20).fill({ x: 1, y: 1, t: 'n' })],
    ink: [{ c: 9, p: [1, 2, 3] }, { c: 1, p: [5] }, { c: 2, p: Array(500).fill(2000) }, ...Array(40).fill({ c: 0, p: [1, 1, 2, 2] })], evil: 1 });
  assert.equal(s.board, 'iso'); assert.equal(s.pegs, 9); assert.equal(s.cur, -1); assert.equal(s.fills, false); assert.equal(s.lines, true); assert.equal(s.angles, true); assert.equal(s.labels, true);
  assert.equal([...s.title].length, 80); assert.doesNotMatch(s.title, /[‮\u0007]/); assert.ok(!('evil' in s)); assert.ok(!('ring' in s), 'the ring size at its start is not stored');
  assert.deepEqual(s.bands[0], { pts: P(0, 0, 2, 0, 1, 2), closed: true, c: 6 }, 'colours clamp to the seven');
  assert.deepEqual(s.bands[1], { pts: P(0, 0, 3, 3), closed: false, c: 4 }, 'pegs off the board go');
  assert.ok(!('c' in s.bands[2]), 'no colour: it takes its place\'s colour');
  assert.equal(s.notes.length, 11, 'at most 12 labels, empty ones dropped'); assert.deepEqual(s.notes[0], { x: 0, y: 1000, t: 'Hexagon !' });
  assert.equal(s.ink.length, 29, 'at most 30 strokes; a stroke with no whole point goes');
  assert.deepEqual(s.ink[0], { c: 4, p: [1, 2] }, 'an odd number is cut to whole points; colours clamp');
  assert.equal(s.ink[1].p.length, 240); assert.ok(s.ink[1].p.every(v => v === 1000));
  assert.deepEqual(c('geoboard', s), s, 'cleaning is stable');
  assert.deepEqual(c('geoboard', JSON.parse(JSON.stringify(s))), s);
  // The circle keeps its ring pegs and centre only.
  const ci = c('geoboard', { board: 'circle', ring: 8, bands: [{ pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 9, y: 0 }, { x: 3, y: 1 }, { x: 4, y: 0 }], closed: true }] });
  assert.deepEqual(ci.bands[0].pts, R(0, 8, 4)); assert.equal(ci.ring, 8);
  assert.equal(c('geoboard', { board: 'circle', ring: 7 }).ring, undefined, 'not a ring size: the start (12, not stored)');
  // On a student's own screen, labels and drawings are never kept.
  const st = c('geoboard', { notes: [{ x: 1, y: 1, t: 'hi' }], ink: [{ c: 0, p: [1, 1, 2, 2] }], title: 'Mine' }, { student: true });
  assert.ok(!('notes' in st) && !('ink' in st)); assert.equal(st.title, 'Mine');
});

test('a student\'s own screen drops labels and drawings; the teacher\'s layout and a sent tool keep them', () => {
  const s = { state: { notes: [{ x: 5, y: 5, t: 'Label' }], ink: [{ c: 1, p: [1, 1, 9, 9] }], bands: [] } };
  const w = [{ id: 'g1', type: 'geoboard', x: 0, y: 0, w: 8, h: 8, s }];
  const teacher = D.cleanWidgets(w, 'teacher')[0].s.state, student = D.cleanWidgets(w, 'student')[0].s.state;
  assert.deepEqual(teacher.notes, [{ x: 5, y: 5, t: 'Label' }]); assert.equal(teacher.ink.length, 1);
  assert.ok(!('notes' in student) && !('ink' in student));
  // Other tools are untouched by the student rule.
  assert.deepEqual(D.cleanWidgets([{ id: 'o', type: 'organizer', s: { state: { kind: 'kwl', boxes: [{ h: '', t: 'mine' }] } } }], 'student')[0].s.state.boxes[0].t, 'mine');
  // The renderer keeps nothing of the kind from a student's own widget either, and a copy keeps through ctx.keep only.
  const src = fs.readFileSync('public/js/dash-shapeboard.js', 'utf8');
  assert.match(src, /const ownScreen = !ctx\.teacher && !ctx\.copy;/);
  assert.match(src, /if \(ownScreen\) \{ out\.notes = \[\]; out\.ink = \[\]; \}\n\s*ctx\.keep\(out\);/);
  assert.doesNotMatch(src, /ctx\.send|ctx\.act\(|ctx\.get\(|ctx\.upload|ctx\.checks/);
  // The challenge title is the teacher's: only the teacher types it.
  assert.match(src, /const teacherText = !!ctx\.teacher && !ctx\.copy;/);
  assert.match(src, /if \(teacherText && !ctx\.editing && !projecting\(\)\) \{ titleIn\.value = st\.title; head\.append\(titleIn, ideas\); \}\n\s*else head\.appendChild\(titleOut\);/);
});

test('Make a question: the selected band\'s area, with the perimeter and the pegs as wrong answers; triangle dots count triangles', () => {
  const reg = D.registryFor(tFor('en'), 'teacher'), W = reg.types.find(x => x.id === 'geoboard').words;
  const st = { pegs: 7, cur: 1, bands: [{ pts: P(0, 0, 1, 0, 0, 1), closed: true }, { pts: P(1, 1, 4, 1, 5, 3, 2, 3), closed: true }] };
  const q = A.questionFor('geoboard', st, W, reg.ask, 'en');
  assert.equal(q.q, 'What is the area of the shape, in square units?');
  assert.equal(q.options[q.answer], '6'); assert.ok(q.options.includes('6 + 2√5'), 'the perimeter is a wrong answer'); assert.ok(q.options.includes('11'), 'counting the pegs');
  assert.equal(A.questionFor('geoboard', { ...st, cur: 0 }, W, reg.ask, 'en').options[A.questionFor('geoboard', { ...st, cur: 0 }, W, reg.ask, 'en').answer], '1/2');
  assert.equal(A.questionFor('geoboard', { ...st, cur: -1 }, W, reg.ask, 'en').options[A.questionFor('geoboard', { ...st, cur: -1 }, W, reg.ask, 'en').answer], '1/2', 'none selected: the first shape');
  const iso = { board: 'iso', pegs: 7, cur: 0, bands: [{ pts: G.presetShape('hex', 'iso', 7), closed: true }] };
  const qi = A.questionFor('geoboard', iso, W, reg.ask, 'en');
  assert.equal(qi.q, 'How many small triangles make the shape?'); assert.equal(qi.options[qi.answer], '24'); assert.equal(new Set(qi.options).size, qi.options.length);
  assert.equal(A.questionFor('geoboard', { board: 'circle', ring: 12, bands: [{ pts: R(0, 4, 8), closed: true }] }, W, reg.ask, 'en'), null, 'the circle\'s areas are not exact: no question');
  assert.equal(A.questionFor('geoboard', { bands: [] }, W, reg.ask, 'en'), null);
});

test('the registry and the words: the geoboard id stays; every word in every language, translated', async () => {
  const t = D.widgetType('geoboard');
  // Maths tools combined: the angle maker is a mode of the shape board; the mode switch costs a row (smallest 5 x 8).
  assert.deepEqual([t.size, t.min, t.group, t.send, t.modes], [[8, 8], [5, 8], 'teach', true, ['geoboard', 'angle']]);
  assert.ok(D.MATH_TOOLS.includes('geoboard') && D.ASK_KEYS.includes('geoboardTri') && D.PRACTICE.geoboard.length);
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8'));
  const words = en.dash.w.geoboard;
  for (const k of t.words) assert.ok(typeof words[k] === 'string' && words[k], k);
  // Every word the renderer reads is in the registry.
  const src = fs.readFileSync('public/js/dash-shapeboard.js', 'utf8');
  const used = new Set([...src.matchAll(/\bW\.(\w+)/g)].map(m => m[1]));
  for (const k of used) assert.ok(t.words.includes(k), `W.${k}`);
  for (const k of [...G.SHAPE_KINDS, ...G.BOARDS, 'fills', 'lines', 'angles', 'labels', 'show', ...[0, 1, 2, 3, 4, 5, 6].map(i => `c${i}`), ...[0, 1, 2, 3, 4].map(i => `pen${i}`), ...[1, 2, 3, 4, 5].map(i => `idea${i}`)]) assert.ok(t.words.includes(k), k);
  const kept = ['name', 'hint', 'show', 'band', 'cursor', 'newBand', 'undo', 'area', 'perimeter', 'pickIs', 'open', 'crosses', 'peg', 'added', 'closed', 'howto'];
  for (const code of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
    const g = l.dash.w.geoboard;
    // Translated, not copied (a few words are the same in some languages: "Triangle", "Text", "≈ {a}"...).
    let same = 0;
    for (const k of [...t.words, 'desc', 'helpUse', 'helpIdeas']) {
      assert.ok(typeof g[k] === 'string' && g[k].trim(), `${code} ${k}`);
      if (!kept.includes(k) && g[k] === words[k]) same++;
    }
    assert.ok(same <= 8, `${code}: ${same} words the same as in English`);
    for (const k of ['desc', 'helpUse', 'helpIdeas', 'empty', 'noRoom', 'titlePh', 'idea1', 'resetDone', 'local']) assert.notEqual(g[k], words[k], `${code} ${k}`);
    assert.ok(l.dash.ask.geoboardTri && l.dash.ask.geoboardTri !== en.dash.ask.geoboardTri, code);
    for (const gone of ['pegs', 'close', 'clear', 'squares']) assert.ok(!(gone in g), `${code}: ${gone} is no longer used`);
  }
  const { checkAll } = await import('../../server/i18n/check.js');
  for (const l of checkAll().locales) {
    assert.deepEqual([...l.placeholderErrors, ...l.parseErrors, ...l.extra].filter(k => /geoboard/.test(k)), [], l.code);
    assert.deepEqual(l.missing.filter(k => /geoboard/.test(k) && l.code !== 'en-GB'), [], l.code);
  }
  // Our own names: no other product is named anywhere in the shape board.
  const css = fs.readFileSync('public/css/dash.css', 'utf8'), all = src + css + JSON.stringify(en.dash.w.geoboard);
  assert.doesNotMatch(all, /brain\s*ing\s*camp|mathigon|polypad|didax|toy\s*theater/i);
});

test('the ⓘ help is short: three lines on the controls and one "Try:" idea, in every language', () => {
  for (const code of ['en', 'ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const g = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash.w.geoboard;
    const lines = g.helpUse.split('\n');
    assert.equal(lines.length, 3, code); assert.ok(!g.helpIdeas.includes('\n'), code);
    const words = s => (/^(ja|zh)/.test(code) ? [...s].length / 3 : s.split(/\s+/).length);
    for (const l of lines) assert.ok(words(l) <= 14, `${code}: ${l}`);
    if (code === 'en') { assert.match(g.helpIdeas, /^Try: /); assert.ok(words(`${g.helpUse} ${g.helpIdeas}`) <= 55); }
  }
  // The panel keeps the controls and one "Try:" line; the list of shared extras is left out.
  const src = fs.readFileSync('public/js/dash-shapeboard.js', 'utf8');
  assert.match(src, /const r = T\.finish\(\);\n\s*tidyHelp\(\);/);
  assert.match(src, /el\('p', 'dt-helptry', list\.textContent\)/);
});

test('the renderer: pointer events with no page scroll on the board, pinch only on the board, keyboard, a live summary', () => {
  const src = fs.readFileSync('public/js/dash-shapeboard.js', 'utf8'), css = fs.readFileSync('public/css/dash.css', 'utf8');
  for (const ev of ["'pointerdown'", "'pointermove'", "'pointerup'", "'pointercancel'"]) assert.ok(src.includes(`board.addEventListener(${ev}`), ev);
  assert.doesNotMatch(src, /'touchstart'|'mousedown'/, 'one code path for mouse, touch and pen');
  assert.match(css, /\.gb-svg\{[^}]*touch-action:none/);
  assert.match(src, /kind: 'pinch'/); assert.match(src, /e\.ctrlKey \|\| e\.metaKey/);
  for (const k of ['ArrowRight:', 'ArrowUp:', "'Enter'", "'Escape'", "'Delete'", "'Backspace'", "k === 'z'", "k === 'y'"]) assert.ok(src.includes(k), k);
  assert.match(src, /T\.read\.removeAttribute\('aria-live'\)/); assert.match(src, /ctx\.say\(/);
  assert.match(src, /'aria-haspopup', 'dialog'/); assert.match(src, /'aria-expanded'/);
  assert.match(src, /requestFullscreen/); assert.match(src, /gb-max/, 'a fallback where there is no Fullscreen API');
  // Buttons are 44px.
  assert.match(css, /\.dt \.gb-btn\{[^}]*min-width:44px;min-height:44px/);
  assert.doesNotMatch(src, /innerHTML|insertAdjacentHTML|outerHTML/);
});
