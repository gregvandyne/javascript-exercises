// Homeroom's board tools on the server and in the shared drawing (services/homeroom.js saveArea, public/js/board-shapes.js;
// docs/decisions.md "Homeroom: board tools"): every shape kind and style field the board makes is kept; anything else is
// dropped or clamped (palette colors only, weights, dashes, arrowheads, opacity, rotation, layer, lock, sizes, counts);
// a board saved before these tools is kept exactly as it was and draws as it did.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const B = await import('../../public/js/board-shapes.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

const boss = createUser({ username: 'HrToolsUnitBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Tools Unit Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Vale', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '3C', teacherId: teacher.id }).class;
const save = state => { const r = H.saveArea(teacher, cls, state); assert.ok(r.ok, JSON.stringify(r)); return H.roomOf(cls.id).area; };
const ann = (x = {}) => ({ notes: [], texts: [], strokes: [], ...x });

test('every shape kind is kept with every style field it may have', () => {
  const shapes = B.SHAPE_KINDS.map((k, i) => ({
    id: `s${i}`, k, x: 0.1, y: 0.2, x2: 0.3, y2: 0.4, c: B.PALETTE[i % B.PALETTE.length], w: B.WEIGHTS[i % 4], d: ['dash', 'dot'][i % 2], z: i, lk: i % 3 === 0 ? 1 : undefined,
    ...(B.isLine(k) ? { a: ['start', 'end', 'both'][i % 3] } : { f: '#FFD23F', fo: [50, 25][i % 2], r: 30 - i }),
  }));
  const a = save({ __ann: ann(), shapes });
  assert.equal(a.shapes.length, B.SHAPE_KINDS.length);
  for (const [i, s] of a.shapes.entries()) {
    const want = shapes[i];
    assert.equal(s.k, want.k); assert.equal(s.c, want.c, `${s.k} color`);
    assert.equal(s.w, want.w === 'M' ? undefined : want.w, `${s.k} weight`); assert.equal(s.d, want.d); assert.equal(s.z, i);
    assert.equal(s.lk, want.lk);
    if (B.isLine(s.k)) { assert.equal(s.a, want.a); assert.equal(s.f, undefined); assert.equal(s.r, undefined); }
    else { assert.equal(s.f, '#FFD23F'); assert.equal(s.fo, want.fo); assert.equal(s.r, want.r || undefined); }
  }
  // the shared drawing draws every one of them
  for (const s of a.shapes) assert.match(B.shapeSvg(s, 1560, 380), /^<g[ >].*<\/g>$/s, s.k);
});

test('bad values are dropped or clamped: colors from the palette only, the lists, the numbers, the counts', () => {
  const a = save({ __ann: ann(), shapes: [
    { id: 'a', k: 'rect', x: -3, y: 9, x2: 'x', y2: 0.5, c: '#123456', f: 'red', fo: 30, w: 'XXL', d: 'wavy', a: 'end', r: 400, z: 1e12, lk: 'yes', extra: 1, onclick: 'x' },
    { id: 'b', k: 'circle', x: 0, y: 0, x2: 1, y2: 1, c: 'none' },   // no outline and no fill: it would be invisible
    { id: 'c', k: 'heart', x: 0, y: 0, x2: 1, y2: 1, c: 'none', f: '#D6457A', r: -190, z: 'top' },
    { id: 'd', k: 'line', x: 0, y: 0, x2: 1, y2: 1, c: 'none', f: '#D6457A', fo: 50, a: 'sideways', r: 45 },
    { id: 'e', k: 'blob', x: 0, y: 0, x2: 1, y2: 1 }, null, 'rect', { k: 'rect', x: 0, y: 0, x2: 1, y2: 1, c: '<script>' },
  ] });
  const [r1, r2, r3, r4, r5] = a.shapes;
  // (corners anywhere on the board, kept inside it: x past its left edge is -AREA.x / AREA.w)
  assert.deepEqual(r1, { id: 'a', k: 'rect', x: -0.2692, y: 9, x2: 0, y2: 0.5, c: '#141414', r: 40, z: 9e6 });
  assert.equal(r2.c, '#141414', 'no outline needs a fill');
  assert.deepEqual([r3.c, r3.f, r3.r, r3.z], ['none', '#D6457A', 170, undefined]);
  assert.deepEqual(r4, { id: 'd', k: 'line', x: 0, y: 0, x2: 1, y2: 1, c: '#141414' }, 'a line has no fill, no rotation, no bad arrowheads');
  assert.equal(r5.c, '#141414'); assert.equal(a.shapes.length, 5, 'unknown kinds go');
  // at most SHAPES_MAX shapes
  const many = save({ __ann: ann(), shapes: Array.from({ length: 200 }, (_, i) => ({ id: `m${i}`, k: 'star', x: 0, y: 0, x2: 0.1, y2: 0.1 })) });
  assert.equal(many.shapes.length, B.SHAPES_MAX);
  assert.ok(B.SHAPES_MAX >= 40, 'raised, never lowered');
});

test('pen lines, text boxes and notes keep their style fields; bad ones go', () => {
  const pts = [{ x: 0.1, y: 0.1 }, { x: 0.2, y: 0.3 }];
  const a = save({ __ann: ann({
    strokes: [{ id: 'p1', c: '#8C6BD1', w: 'XL', d: 'dot', z: 4, lk: 1, pts }, { id: 'p2', c: '#123456', w: 'huge', d: 'zig', z: 'x', lk: 2, pts }, { c: '#1F9D63', pts }, { nope: true }],
    texts: [{ id: 'x1', text: 'Big', x: 0.1, y: 0.1, w: 300, h: 60, fs: 'XL', tc: '#E53935', b: 1, al: 'c', r: -15, lk: 1 }, { id: 'x2', text: 'Odd', x: 0.2, y: 0.2, tc: 'hotpink', b: 'yes', al: 'justify', r: 'spin' }],
    notes: [{ id: 'n1', text: 'Purple', x: 0.1, y: 0.1, w: 200, h: 120, nc: 'purple', lk: 1 }, { id: 'n2', text: 'Plaid', x: 0.1, y: 0.1, nc: 'plaid' }, { id: 'n3', text: 'Yellow', x: 0, y: 0, nc: 'yellow' }],
  }), shapes: [] });
  const [p1, p2, p3] = a.__ann.strokes;
  assert.deepEqual(p1, { c: '#8C6BD1', pts, id: 'p1', w: 'XL', d: 'dot', z: 4, lk: 1 });
  assert.deepEqual(p2, { c: '#141414', pts, id: 'p2' }, 'a color outside the palette becomes black; bad style goes');
  assert.deepEqual(p3, { c: '#1F9D63', pts }, 'an older pen line (no id) is kept as it was');
  assert.equal(a.__ann.strokes.length, 3);
  const [x1, x2] = a.__ann.texts;
  assert.deepEqual([x1.fs, x1.tc, x1.b, x1.al, x1.r, x1.lk, x1.w, x1.h], ['XL', '#E53935', 1, 'c', -15, 1, 300, 60]);
  assert.deepEqual([x2.tc, x2.b, x2.al, x2.r], [undefined, undefined, undefined, undefined]);
  const [n1, n2, n3] = a.__ann.notes;
  assert.deepEqual([n1.nc, n1.lk, n1.w, n1.h], ['purple', 1, 200, 120]);
  assert.equal(n2.nc, undefined); assert.equal(n3.nc, undefined, 'yellow is the default: not stored');
  // the word rules still apply to every text
  const rude = H.saveArea(teacher, cls, { __ann: ann({ texts: [{ id: 'x', text: 'email me at a@b.com', x: 0, y: 0, b: 1 }] }), shapes: [] });
  assert.equal(rude.ok, false);
});

test('a board saved before the new tools loads and saves exactly as it was, and draws as it did', () => {
  const old = {
    __ann: { notes: [{ id: 'n1', text: 'Warm-up', x: 0.1, y: 0.2, by: 't', w: 200, h: 120 }], texts: [{ id: 'x1', text: 'Hi', x: 0.3, y: 0.1, fs: 'L', w: 260, h: 40 }],
      strokes: [{ c: '#1E88E5', pts: [{ x: 0.1, y: 0.1 }, { x: 0.3, y: 0.4 }] }] },
    shapes: [{ id: 's1', k: 'rect', x: 0.5, y: 0.1, x2: 0.7, y2: 0.6, c: '#FF6B4A' }, { id: 's2', k: 'circle', x: 0.7, y: 0.1, x2: 0.9, y2: 0.6, c: '#1F9D63' }, { id: 's3', k: 'line', x: 0.1, y: 0.9, x2: 0.4, y2: 0.8, c: '#141414' }],
  };
  const a = save(old);
  assert.deepEqual(a.shapes, old.shapes, 'shapes unchanged');
  assert.deepEqual(a.__ann.strokes, old.__ann.strokes, 'pen lines unchanged');
  assert.deepEqual(a.__ann.notes, old.__ann.notes); assert.deepEqual(a.__ann.texts, old.__ann.texts);
  // drawn as before: stroke width 5 (pen 4), no fill, a rectangle's corners 6 px round; pen lines under shapes
  const svg = B.drawingsSvg(a.shapes, a.__ann.strokes, 1560, 380);
  assert.ok(svg.indexOf('<polyline') < svg.indexOf('<rect'), 'pen lines under shapes, as before');
  assert.match(svg, /<rect fill="none" stroke="#FF6B4A" stroke-width="5"[^>]* rx="6"\/>/);
  assert.match(svg, /<ellipse fill="none" stroke="#1F9D63" stroke-width="5"/);
  assert.match(svg, /<polyline fill="none" stroke="#1E88E5" stroke-width="4"/);
  assert.ok(!/dasharray|fill-opacity|rotate/.test(svg), 'no style it did not have');
  // a z orders drawings across shapes and pen lines
  const zsvg = B.drawingsSvg([{ ...old.shapes[0], z: 1 }], [{ ...old.__ann.strokes[0], z: 2 }], 1560, 380);
  assert.ok(zsvg.indexOf('<rect') < zsvg.indexOf('<polyline'), 'a pen line drawn over a shape');
});

test('the shared drawing: arrowheads, dashes, dots, fill opacity, rotation, note colors, text style', () => {
  const line = B.shapeSvg({ k: 'line', x: 0, y: 0, x2: 0.5, y2: 0, c: '#E53935', a: 'both', d: 'dash' }, 1000, 100);
  assert.equal((line.match(/<polygon/g) || []).length, 2, 'two arrowheads');
  assert.match(line, /stroke-dasharray="[\d.]+ [\d.]+"/);
  assert.match(B.strokeSvg({ c: '#141414', d: 'dot', pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }, 100, 100), /stroke-dasharray="0\.01 /);
  assert.equal(B.strokeSvg({ c: '#141414', pts: [{ x: 0, y: 0 }] }, 100, 100), '', 'a single point is not drawn');
  const filled = B.shapeSvg({ k: 'star', x: 0, y: 0, x2: 1, y2: 1, c: 'none', f: '#1E88E5', fo: 25, r: 30 }, 100, 100);
  assert.match(filled, /transform="rotate\(30 50 50\)"/); assert.match(filled, /fill="#1E88E5" fill-opacity="0.25"/); assert.match(filled, /stroke="none"/);
  assert.match(B.noteHtml({ id: 'n', text: '<b>', x: 0, y: 0, nc: 'blue' }, { ro: true }), /hr-nc-blue[^>]*><p class="hr-objtext" dir="auto">&lt;b&gt;<\/p>/);
  const t = B.textHtml({ id: 'x', text: 'Hi', x: 0, y: 0, tc: '#E53935', b: 1, al: 'r', r: 10 }, { ro: true });
  assert.match(t, /color:#E53935;font-weight:900;text-align:right;transform:rotate\(10deg\)/);
  assert.ok(!/data-text/.test(t), 'read-only: nothing to select');
});
