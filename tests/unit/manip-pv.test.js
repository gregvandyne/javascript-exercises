// Place-value charts (public/js/manip-pv.js; docs/decisions.md "Virtual math manipulatives: place-value charts fit and
// regroup"): blocks fit inside their column, shrinking as more come in; every block type dropped into every column
// regroups by the rules, one place at a time, and the total never changes.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { allPieceDefs } from '../../public/js/manip-data.js';
import { snapFor, slotsOf, fitInto, pieceBox, WORLD } from '../../public/js/manip-board.js';
import { FIT, fitColumn, settleCharts, columnsOf, columnOf, totalOf, stepsApart, placeOf, chartInfo, strayIds, homeFor, placeAtHome, columnHome, sameValueHome, inChart, defFor } from '../../public/js/manip-pv.js';

const BT = 'base-ten-blocks', PVD = 'place-value-disks';
const PV10 = ['Thousands', 'Hundreds', 'Tens', 'Ones'];
let n = 0;
const make = (d, x, y) => ({ id: `n${n++}`, kind: d.kind, x, y, rot: 0, flipped: false, filled: true, locked: false, color: d.color, label: d.label, value: d.value, w: d.w, h: d.h });
const def = (slug, kind) => allPieceDefs(slug).find(d => d.kind === kind);
const chart = (cols = PV10, extra = {}) => ({ id: `c${n++}`, k: 'pv-chart', x: 100, y: 100, s: 1, st: { cols }, ...extra });
/** A piece of `kind` dropped at the middle of column ci (a little lower each time, as a hand would). */
function dropIn(slug, st, kind, ci, i = 0) {
  const c = columnsOf(slug, st)[ci].slot, d = def(slug, kind), p = make(d, 0, 0);
  p.x = c.x + c.w / 2 - d.w / 2; p.y = Math.min(c.y + c.h - 1, c.y + 40 + i) - d.h / 2;
  st.pieces.push(p); return p;
}
const inside = (a, b) => a.x >= b.x - 0.01 && a.y >= b.y - 0.01 && a.x + a.w <= b.x + b.w + 0.01 && a.y + a.h <= b.y + b.h + 0.01;
const overlaps = (a, b) => a.x < b.x + b.w - 0.01 && b.x < a.x + a.w - 0.01 && a.y < b.y + b.h - 0.01 && b.y < a.y + a.h - 0.01;
/** Every unlocked piece in a column lies wholly inside it, and none covers another (pieces of the same column). */
function assertTidy(slug, st, msg = '') {
  const cols = columnsOf(slug, st);
  for (const c of cols) {
    const ps = st.pieces.filter(p => !p.locked && columnOf(cols, p) === c).map(pieceBox);
    for (const p of ps) assert.ok(inside(p, c.slot), `${msg} ${p.kind} inside ${c.name}: ${JSON.stringify([p.x, p.y, p.w, p.h])} in ${JSON.stringify(c.slot)}`);
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(!overlaps(ps[i], ps[j]), `${msg} ${c.name}: ${ps[i].kind} and ${ps[j].kind} overlap`);
  }
}
const kindsIn = (slug, st, name) => { const cols = columnsOf(slug, st), c = cols.find(x => x.name === name); return st.pieces.filter(p => columnOf(cols, p) === c).map(p => p.kind).sort(); };
const settle = (slug, st) => settleCharts(slug, st, { make, space: WORLD });

// ---------------------------------------------------------------- the fit math
test('fitColumn: everything inside the box, no overlaps, never bigger than life, smaller as more come in', () => {
  const box = { x: 10, y: 20, w: 124, h: 186 };
  let lastK = 1;
  for (const count of [1, 2, 5, 9, 10, 12, 20, 40, 80, 150, 300]) {
    const items = Array.from({ length: count }, () => ({ w: 30, h: 150 }));
    const f = fitColumn(box, items);
    assert.equal(f.places.length, count);
    assert.ok(f.k <= 1 && f.k > 0, `k ${f.k}`);
    assert.ok(f.k <= lastK + 1e-9, `k never grows with more (${count}: ${f.k} after ${lastK})`); lastK = f.k;
    for (const p of f.places) assert.ok(inside(p, box), `${count} rods: ${JSON.stringify(p)}`);
    if (!f.tight) for (let i = 0; i < count; i++) for (let j = i + 1; j < count; j++) assert.ok(!overlaps(f.places[i], f.places[j]), `${count} rods: ${i} and ${j}`);
    assert.equal(f.cramped, f.k < FIT.min - 1e-9);
  }
  // One block: its own size, centered across the box, at the top.
  const one = fitColumn(box, [{ w: 30, h: 30 }]);
  assert.equal(one.k, 1); assert.deepEqual(one.places[0], { x: 57, y: 20, w: 30, h: 30 });
  // Too wide for the box: made narrower to fit.
  const wide = fitColumn({ x: 0, y: 0, w: 100, h: 300 }, [{ w: 130, h: 130 }]);
  assert.ok(wide.places[0].w <= 100 && inside(wide.places[0], { x: 0, y: 0, w: 100, h: 300 }));
  // Far too many for the floor: still inside (the rows close up).
  const crowd = fitColumn({ x: 0, y: 0, w: 40, h: 40 }, Array.from({ length: 400 }, () => ({ w: 30, h: 30 })));
  assert.ok(crowd.cramped); for (const p of crowd.places) assert.ok(inside(p, { x: 0, y: 0, w: 40, h: 40 }), JSON.stringify(p));
  assert.ok(crowd.tight);
  assert.deepEqual(fitColumn(box, []), { k: 1, cramped: false, tight: false, places: [] });
});

test('blocks in any column fit inside it as more are added and taken away; out of a column they get their size back', () => {
  for (const [kind, ci] of [['cube', 0], ['flat', 1], ['rod', 2], ['unit', 3]]) {
    const st = { objects: [chart()], pieces: [] };
    for (let i = 1; i <= 60; i++) {
      dropIn(BT, st, kind, ci, i % 7); const before = totalOf(BT, st);
      settle(BT, st);
      assert.equal(totalOf(BT, st), before, `${kind} total`);
      assert.equal(kindsIn(BT, st, PV10[ci]).length, i, `${kind}: all ${i} in ${PV10[ci]}`);
      assertTidy(BT, st, `${i} x ${kind}`);
    }
    const info = chartInfo(BT, st, st.objects[0])[ci];
    assert.equal(info.n, 60); assert.equal(info.waiting, 0);
    // A readable size while they fit at it; a count once they do not.
    const p0 = st.pieces[0], d = def(BT, kind);
    assert.equal(info.cramped, p0.w < d.w * FIT.min - 0.2, `${kind} cramped flag`);
    // Taken away one by one: the rest grow back (never past their own size), still inside.
    let w = p0.w;
    while (st.pieces.length > 1) { st.pieces.pop(); settle(BT, st); assertTidy(BT, st); assert.ok(st.pieces[0].w >= w - 0.05); w = st.pieces[0].w; }
    // The last one alone: its own size (a flat, wider than the column's inside, just a little smaller).
    const alone = fitColumn({ x: 0, y: 0, w: 136 - 2 * FIT.pad, h: 999 }, [{ w: d.w, h: d.h }]).places[0];
    assert.equal(st.pieces[0].w, alone.w); assert.equal(st.pieces[0].nw === undefined, alone.w === d.w);
    // Dragged out of the chart: its own size again.
    st.pieces.push(dropIn(BT, st, kind, ci)); st.pieces.push(dropIn(BT, st, kind, ci)); settle(BT, st);
    const out = st.pieces[st.pieces.length - 1]; out.x = 1500; out.y = 1500; settle(BT, st);
    assert.equal(out.w, d.w); assert.equal(out.h, d.h); assert.equal(out.nw, undefined); assert.equal(out.nh, undefined);
  }
});

test('the fit works at any chart size, with turned blocks, and leaves locked blocks alone; settling twice changes nothing', () => {
  for (const s of [0.35, 0.6, 1, 2]) {
    const st = { objects: [chart(PV10, { s })], pieces: [] };
    for (let i = 0; i < 25; i++) dropIn(BT, st, 'rod', 2, i);
    st.pieces[3].rot = 90;
    settle(BT, st); assertTidy(BT, st, `scale ${s}`);
    assert.equal(st.pieces.length, 25);
    const once = JSON.stringify(st.pieces); settle(BT, st); assert.equal(JSON.stringify(st.pieces), once, `idempotent at ${s}`);
  }
  const st = { objects: [chart()], pieces: [] };
  const locked = dropIn(BT, st, 'rod', 1); locked.locked = true; const at = JSON.stringify(locked);
  for (let i = 0; i < 12; i++) dropIn(BT, st, 'rod', 1, i);
  settle(BT, st);
  assert.equal(JSON.stringify(st.pieces.find(p => p.id === locked.id)), at, 'locked rod untouched');
  assert.deepEqual(kindsIn(BT, st, 'Hundreds').sort(), ['flat', 'rod', 'rod', 'rod'], 'ten unlocked rods traded; the locked one and two more stay');
});

// ---------------------------------------------------------------- regroup on drop
test('stepsApart and placeOf read places', () => {
  assert.equal(placeOf('Tens'), 10); assert.equal(placeOf('hundredths'), 0.01); assert.equal(placeOf('Ten thousands'), 1e4); assert.equal(placeOf('Bananas'), null);
  assert.equal(stepsApart(10, 10), 0); assert.equal(stepsApart(10, 100), -1); assert.equal(stepsApart(100, 10), 1); assert.equal(stepsApart(1000, 10), 2);
  assert.equal(stepsApart(0.1, 1), -1); assert.equal(stepsApart(0.01, 0.1), -1); assert.equal(stepsApart(25, 10), null); assert.equal(stepsApart(10, null), null);
});

// Every block type into every column, one at a time: what the column then holds.
const ONE = {
  cube: { Thousands: { Thousands: ['cube'] }, Hundreds: { Hundreds: Array(10).fill('flat') }, Tens: { Thousands: ['cube'] }, Ones: { Thousands: ['cube'] } },
  flat: { Thousands: { Thousands: ['flat'], wait: true }, Hundreds: { Hundreds: ['flat'] }, Tens: { Tens: Array(10).fill('rod') }, Ones: { Hundreds: ['flat'] } },
  rod: { Thousands: { Tens: ['rod'] }, Hundreds: { Hundreds: ['rod'], wait: true }, Tens: { Tens: ['rod'] }, Ones: { Ones: Array(10).fill('unit') } },
  unit: { Thousands: { Ones: ['unit'] }, Hundreds: { Ones: ['unit'] }, Tens: { Tens: ['unit'], wait: true }, Ones: { Ones: ['unit'] } },
};
test('every block x column pair, one block dropped: placed, waits, breaks one place, or goes to its own column; the total never changes', () => {
  for (const [kind, byCol] of Object.entries(ONE)) for (const [col, want] of Object.entries(byCol)) {
    const st = { objects: [chart()], pieces: [] };
    dropIn(BT, st, kind, PV10.indexOf(col));
    const total = totalOf(BT, st), r = settle(BT, st);
    assert.equal(totalOf(BT, st), total, `${kind} in ${col}: total`);
    for (const name of PV10) assert.deepEqual(kindsIn(BT, st, name), (want[name] || []).slice().sort(), `${kind} in ${col}: ${name}`);
    assert.equal(strayIds(BT, st).size, want.wait ? 1 : 0, `${kind} in ${col}: waiting`);
    assert.equal(chartInfo(BT, st, st.objects[0])[PV10.indexOf(col)].waiting, want.wait ? 1 : 0);
    const moved = Object.keys(want).filter(k => k !== 'wait').some(k => k !== col);
    assert.equal(r.events.length ? r.events[0].kind : null, moved ? 'moved' : (want[col] || []).length === 10 ? 'broke' : null, `${kind} in ${col}: event`);
    assertTidy(BT, st, `${kind} in ${col}`);
  }
});

test('ten of the next smaller block trade for one: 1s into Tens, 10s into Hundreds, 100s into Thousands; leftovers wait', () => {
  for (const [kind, col, up] of [['unit', 'Tens', 'rod'], ['rod', 'Hundreds', 'flat'], ['flat', 'Thousands', 'cube']]) {
    const st = { objects: [chart()], pieces: [] }, ci = PV10.indexOf(col);
    for (let i = 0; i < 9; i++) { dropIn(BT, st, kind, ci, i); const t0 = totalOf(BT, st); settle(BT, st); assert.equal(totalOf(BT, st), t0); }
    assert.deepEqual(kindsIn(BT, st, col), Array(9).fill(kind), `nine ${kind}s wait in ${col}`);
    assert.equal(chartInfo(BT, st, st.objects[0])[ci].waiting, 9);
    dropIn(BT, st, kind, ci, 20);
    const t0 = totalOf(BT, st), r = settle(BT, st);
    assert.equal(totalOf(BT, st), t0, `${kind}: total kept`);
    assert.deepEqual(kindsIn(BT, st, col), [up], `ten ${kind}s became one ${up}`);
    assert.equal(r.fresh.length, 1); assert.equal(r.events[0].kind, 'traded'); assert.equal(r.events[0].n, 10); assert.equal(r.events[0].m, 1);
    assert.equal(strayIds(BT, st).size, 0);
    // 23 at once: two trade, three wait.
    const st2 = { objects: [chart()], pieces: [] };
    for (let i = 0; i < 23; i++) dropIn(BT, st2, kind, ci, i % 30);
    const t2 = totalOf(BT, st2); settle(BT, st2);
    assert.equal(totalOf(BT, st2), t2);
    assert.deepEqual(kindsIn(BT, st2, col), [...Array(3).fill(kind), up, up].sort());
    assertTidy(BT, st2);
  }
});

test('a block dropped two or more places away goes to its own column; with no such column it stays', () => {
  const st = { objects: [chart(['Tens', 'Ones'])], pieces: [] };
  dropIn(BT, st, 'cube', 1); dropIn(BT, st, 'unit', 0);
  const t0 = totalOf(BT, st); settle(BT, st);
  assert.equal(totalOf(BT, st), t0);
  assert.deepEqual(kindsIn(BT, st, 'Ones'), ['cube'].sort(), 'a cube in Ones with no Thousands column stays (waiting, marked)');
  assert.deepEqual(kindsIn(BT, st, 'Tens'), ['unit'], 'one unit waits in Tens');
  assert.equal(strayIds(BT, st).size, 2);
  assertTidy(BT, st);
});

test('a column with an unknown heading only lays its blocks out', () => {
  const st = { objects: [chart(['Bananas'])], pieces: [] };
  for (let i = 0; i < 12; i++) dropIn(BT, st, 'unit', 0, i);
  settle(BT, st); assert.equal(st.pieces.length, 12); assertTidy(BT, st); assert.equal(strayIds(BT, st).size, 0);
});

test('decimal blocks and place-value disks follow the same rules', () => {
  const cols = ['Ones', 'Tenths', 'Hundredths', 'Thousandths'];
  const st = { decimal: true, objects: [chart(cols)], pieces: [] };
  for (let i = 0; i < 10; i++) dropIn(BT, st, 'hundredth', 1, i);
  dropIn(BT, st, 'one', 2);
  const t0 = totalOf(BT, st); settle(BT, st);
  assert.equal(totalOf(BT, st), t0);
  assert.deepEqual(kindsIn(BT, st, 'Tenths'), ['tenth'], 'ten hundredths in Tenths: one tenth');
  assert.deepEqual(kindsIn(BT, st, 'Ones'), ['one'], 'a one in Hundredths goes to Ones');
  assert.equal(defFor(BT, 10, 'one').kind, 'rod', 'no decimal 10: the whole-number rod');
  const PVDC = ['Thousands', 'Hundreds', 'Tens', 'Ones', 'Tenths', 'Hundredths'];
  const d = { objects: [chart(PVDC)], pieces: [] };
  for (let i = 0; i < 10; i++) dropIn(PVD, d, 'o', 2, i);
  dropIn(PVD, d, 'h', 2); dropIn(PVD, d, 'm', 5);
  const t1 = totalOf(PVD, d); settle(PVD, d);
  assert.equal(totalOf(PVD, d), t1);
  assert.deepEqual(kindsIn(PVD, d, 'Tens'), Array(11).fill('t'), 'ten 1s trade for a 10, the 100 breaks into ten 10s');
  assert.deepEqual(kindsIn(PVD, d, 'Hundredths'), ['m'], 'a million disk has no column here: it stays');
  assertTidy(PVD, d);
});

test('trades cascade within a column but never across the board, and a regroup is one change', () => {
  // 100 units dropped into Tens: ten rods (all one place up), the board total unchanged.
  const st = { objects: [chart()], pieces: [] };
  for (let i = 0; i < 100; i++) dropIn(BT, st, 'unit', 2, i % 50);
  const t0 = totalOf(BT, st); settle(BT, st);
  assert.equal(totalOf(BT, st), t0);
  assert.deepEqual(kindsIn(BT, st, 'Tens'), Array(10).fill('rod'));
  // Two charts: each column its own.
  const two = { objects: [chart(), { ...chart(), id: 'c2', x: 100, y: 600 }], pieces: [] };
  const cols = columnsOf(BT, two);
  for (let i = 0; i < 5; i++) { const p = make(def(BT, 'unit'), cols[2].slot.x + 50, cols[2].slot.y + 50 + i); two.pieces.push(p); const q = make(def(BT, 'unit'), cols[6].slot.x + 50, cols[6].slot.y + 50 + i); two.pieces.push(q); }
  settle(BT, two);
  assert.equal(two.pieces.filter(p => p.kind === 'unit').length, 10, 'five and five in two charts: no trade');
});

// ---------------------------------------------------------------- Break and Regroup buttons
test('Break and Regroup send their pieces to the column for their value in the same chart', () => {
  const st = { objects: [chart()], pieces: [] };
  const rod = dropIn(BT, st, 'rod', 2); settle(BT, st);
  const home = homeFor(BT, st, rod, 1);
  assert.equal(home.col.name, 'Ones');
  // As manip.js breakPiece does: the rod goes, ten units go to Ones.
  st.pieces = st.pieces.filter(p => p !== rod);
  const news = Array.from({ length: 10 }, () => make(def(BT, 'unit'), rod.x, rod.y)); placeAtHome(home, news, WORLD); st.pieces.push(...news);
  settle(BT, st);
  assert.deepEqual(kindsIn(BT, st, 'Ones'), Array(10).fill('unit')); assert.equal(totalOf(BT, st), 10); assertTidy(BT, st);
  // A flat in Hundreds breaks into Tens; a cube in Thousands into Hundreds.
  const s2 = { objects: [chart()], pieces: [] }; const flat = dropIn(BT, s2, 'flat', 1), cube = dropIn(BT, s2, 'cube', 0); settle(BT, s2);
  assert.equal(homeFor(BT, s2, flat, 10).col.name, 'Tens'); assert.equal(homeFor(BT, s2, cube, 100).col.name, 'Hundreds');
  // Regroup: ten units in Ones make a rod that goes to Tens.
  assert.equal(homeFor(BT, st, st.pieces[0], 10).col.name, 'Tens');
  // In a chart with no column for the value: under the chart (so it is not traded straight back).
  const s3 = { objects: [chart(['Tens'])], pieces: [] }; const r3 = dropIn(BT, s3, 'rod', 0); settle(BT, s3);
  const h3 = homeFor(BT, s3, r3, 1); assert.ok(h3.below);
  const n3 = Array.from({ length: 10 }, () => make(def(BT, 'unit'), 0, 0)); placeAtHome(h3, n3, WORLD);
  const c3 = columnsOf(BT, s3); for (const q of n3) assert.equal(columnOf(c3, q), null);
  // Not in a chart: null (the button's usual place).
  assert.equal(homeFor(BT, s3, { ...r3, x: 3000, y: 2000 }, 1), null);
  // Copy: a copy of a rod waiting in Hundreds goes into Hundreds too (never next door, where it would break into units).
  const s4 = { objects: [chart()], pieces: [] }; const r4 = dropIn(BT, s4, 'rod', 1); settle(BT, s4);
  assert.equal(columnHome(BT, s4, r4).col.name, 'Hundreds'); assert.equal(columnHome(BT, s4, { ...r4, x: 3000 }), null);
});

test('a chart carries the blocks in its columns; a drop in a column does not snap to a neighbor past its edge', () => {
  const st = { objects: [chart()], pieces: [] };
  for (let i = 0; i < 4; i++) dropIn(BT, st, 'rod', 2, i);
  const loose = make(def(BT, 'rod'), 2000, 2000); st.pieces.push(loose); settle(BT, st);
  assert.deepEqual(inChart(BT, st.objects[0], st.pieces).map(p => p.id).sort(), st.pieces.filter(p => p !== loose).map(p => p.id).sort());
  // A rod dropped right beside the last rod in Tens: no edge-to-edge snap (the column lays it out).
  const last = st.pieces.filter(p => p !== loose).sort((a, b) => b.x - a.x)[0];
  const q = { ...make(def(BT, 'rod'), last.x + last.w + 3, last.y), w: last.w, h: last.h };
  const s = snapFor([q], st.pieces, slotsOf(BT, st.objects[0]), 14);
  assert.ok(s && s.to === null && s.slot && s.slot.kind === 'column', JSON.stringify(s));
  // Outside a chart, pieces still snap to each other.
  const a = make(def(BT, 'rod'), 3000, 2000), b = make(def(BT, 'rod'), 3033, 2000);
  assert.equal(snapFor([b], [a], slotsOf(BT, st.objects[0]), 14).to, a.id);
});

test('fitInto keeps a shrunken block\'s own size at the same scale; the server keeps nw and nh bounded', async () => {
  const st = { v: 2, objects: [chart()], pieces: [] };
  for (let i = 0; i < 20; i++) dropIn(BT, st, 'rod', 2, i);
  settle(BT, st);
  const p = st.pieces[0]; assert.ok(p.nw === 30 && p.nh === 150 && p.w < 30);
  const f = fitInto(BT, st, WORLD, { w: 300, h: 200 }).board, q = f.pieces[0];
  assert.ok(q.nw < 30 && Math.abs(q.nw / q.nh - 30 / 150) < 0.05, JSON.stringify(q));
  const M = await import('../../server/services/manipulatives.js');
  const c = JSON.parse(M.cleanState({ v: 2, objects: [], pieces: [{ id: 'a', kind: 'rod', x: 1, y: 1, w: 10, h: 50, nw: 30, nh: 150 }, { id: 'b', kind: 'rod', x: 1, y: 1, w: 10, h: 50, nw: 'x', nh: 150 }, { id: 'c', kind: 'rod', x: 1, y: 1, w: 10, h: 50, nw: 1e9, nh: -5 }] }, null, BT).state);
  assert.deepEqual([c.pieces[0].nw, c.pieces[0].nh], [30, 150]);
  assert.equal(c.pieces[1].nw, undefined); assert.equal(c.pieces[1].nh, undefined);
  assert.deepEqual([c.pieces[2].nw, c.pieces[2].nh], [WORLD.w, 4]);
});

// ---------------------------------------------------------------- tap to add after a block placed in a column
test('a palette add worth the same as the last block placed goes into that block\'s column; anything else: the usual place', () => {
  const st = { objects: [chart()], pieces: [] };
  const first = dropIn(BT, st, 'rod', 2); settle(BT, st);
  let last = { id: first.id };
  // Nine taps of Rod: each one into Tens (never Ones), all fitted, nothing traded (rods in Tens are in their own column).
  for (let i = 0; i < 9; i++) {
    const home = sameValueHome(BT, st, last, def(BT, 'rod'));
    assert.equal(home && home.col.name, 'Tens', `tap ${i + 2}`);
    const q = make(def(BT, 'rod'), 0, 0); placeAtHome(home, [q], WORLD); st.pieces.push(q); last = { id: q.id };
    const r = settle(BT, st); assert.deepEqual(r.events, []);
    assertTidy(BT, st, `tap ${i + 2}`);
  }
  assert.deepEqual(kindsIn(BT, st, 'Tens'), Array(10).fill('rod')); assert.deepEqual(kindsIn(BT, st, 'Ones'), []);
  assert.equal(totalOf(BT, st), 100);
  // Another value (a unit after a rod): no column of its own, the usual placement.
  assert.equal(sameValueHome(BT, st, last, def(BT, 'unit')), null);
  assert.equal(sameValueHome(BT, st, last, def(BT, 'flat')), null);
  // The same value from the other block set (a decimal "one" after a unit) counts as the same.
  const u = dropIn(BT, st, 'unit', 3); settle(BT, st);
  assert.equal(sameValueHome(BT, st, { id: u.id }, def(BT, 'one')).col.name, 'Ones');
  // A rod waiting in Hundreds: the next rod joins it there (and ten of them trade, as on a drop).
  const s2 = { objects: [chart()], pieces: [] }; const w = dropIn(BT, s2, 'rod', 1); settle(BT, s2);
  assert.equal(sameValueHome(BT, s2, { id: w.id }, def(BT, 'rod')).col.name, 'Hundreds');
  // Fallbacks: nothing placed yet, the block gone, moved out of the chart, its chart deleted.
  assert.equal(sameValueHome(BT, st, null, def(BT, 'rod')), null);
  assert.equal(sameValueHome(BT, st, { id: 'gone' }, def(BT, 'rod')), null);
  const out = st.pieces.find(p => p.id === last.id); out.x = 3000; out.y = 2000; settle(BT, st);
  assert.equal(sameValueHome(BT, st, last, def(BT, 'rod')), null, 'moved out of the chart');
  const s3 = { objects: [chart()], pieces: [] }; const r3 = dropIn(BT, s3, 'rod', 2); settle(BT, s3);
  s3.objects = [];
  assert.equal(sameValueHome(BT, s3, { id: r3.id }, def(BT, 'rod')), null, 'chart deleted');
});

test('a block whose middle is in the gap between two columns belongs to the nearer one and is pulled inside', () => {
  const st = { objects: [chart()], pieces: [] }, cols = columnsOf(BT, st), tens = cols[2].slot, ones = cols[3].slot;
  const gapMid = (tens.x + tens.w + ones.x) / 2;
  const a = make(def(BT, 'rod'), gapMid - 1 - 15, tens.y + 20); st.pieces.push(a);   // middle 1 px left of the gap's middle
  assert.equal(columnOf(cols, a).name, 'Tens');
  settle(BT, st); assertTidy(BT, st);
  assert.deepEqual(kindsIn(BT, st, 'Tens'), ['rod']);
  // Outside the chart (past the outer edge, or above it): no column.
  assert.equal(columnOf(cols, make(def(BT, 'unit'), ones.x + ones.w + 20, ones.y + 10)), null);
});
