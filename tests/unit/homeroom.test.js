// Homeroom, step 1a (docs/homeroom.md; services/homeroom.js, routes/homeroom.js, public/js/homeroom-seats.js):
//   - the gate: HOMEROOM off hides it from everyone (the platform admin too); on, it answers the platform admin and the
//     class's own teachers on HOMEROOM_USERS ('*': everyone) who have the Teacher plan; a teacher without the plan, one
//     not on the list, a teacher of another class, a school admin who doesn't teach it and every student get the normal
//     404, and their class page is unchanged (no Homeroom | Classroom | Dashboard row);
//   - seating: presets, saving and loading per class, validation (unknown students dropped, bad places and presets
//     refused), new students seated without moving anyone, a student who leaves losing their desk;
//   - groups: defaults, renaming, colors, members (current students only), the word rules;
//   - the teacher's area: cleaned like the live room's (notes, text, pen) plus shapes.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const SEATS = await import('../../public/js/homeroom-seats.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HrBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Oak' }).school;
const staff = (name, role = 'teacher') => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role }).user.id);
const rivera = staff('Ms Rivera'), noPlan = staff('Mr Free'), offList = staff('Ms Offlist'), other = staff('Mr Other'), head = staff('Ms Head', 'admin');
for (const u of [rivera, offList, other, head]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: '4B', teacherId: rivera.id }).class;
S.addToClass(boss, cls.id, noPlan.id, 'teacher');
const otherCls = S.createClass(boss, oak.id, { name: '5C', teacherId: other.id }).class;
const kid = n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return u; };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Rao', 'Eli Moss'].map(kid);
const users = () => [rivera, noPlan, offList, other, head].map(u => u.username.toLowerCase());
const gateOn = (list = users().filter(n => n !== offList.username.toLowerCase())) => { config.homeroom = true; config.homeroomUsers = list; };
const gateOff = () => { config.homeroom = false; config.homeroomUsers = []; };
gateOn();

test('the gate: flag off hides Homeroom from everyone, the platform admin too', async () => {
  gateOff();
  try {
    for (const u of [boss, rivera]) {
      assert.equal(H.canUse(u), false, u.username);
      assert.equal((await as(u)(`/class/${cls.id}/homeroom`)).status, 404);
      assert.equal((await as(u)(`/api/homeroom/${cls.id}/seats`, { body: { seats: {} } })).status, 404);
      assert.doesNotMatch((await as(u)(`/class/${cls.id}`)).text, /class="hr-tabs"/, 'the class page is unchanged');
    }
    // The flag alone opens nothing: on, with nobody on the list, only the platform admin.
    config.homeroom = true;
    assert.equal(H.canUse(boss), true); assert.equal(H.canUse(rivera), false);
  } finally { gateOn(); }
});

test('the gate: flag on + allowlist + Teacher plan; the class\'s own teachers only; never students', async () => {
  assert.equal(H.canUseClass(rivera, cls), true);
  assert.equal(H.canUseClass(boss, cls), true, 'the platform admin passes');
  assert.equal(H.canUse(noPlan), false, 'on the list but no Teacher plan');
  assert.equal(H.canUse(offList), false, 'Teacher plan but not on the list');
  assert.equal(H.canUseClass(other, cls), false, 'a teacher of another class');
  assert.equal(H.canUseClass(other, otherCls), true);
  assert.equal(H.canUseClass(head, cls), false, 'a school admin who does not teach the class');
  for (const k of kids) assert.equal(H.canUse(k), false);

  const page = await as(rivera)(`/class/${cls.id}/homeroom`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<nav class="hr-tabs"[^>]*>.*Homeroom.*Classroom.*Dashboard/s);
  assert.match(page.text, /Teacher(&#39;|')s desk/);
  assert.match(page.text, /\/js\/homeroom\.js/);
  assert.match(page.text, /noindex/);
  for (const k of kids) assert.ok(page.text.includes(k.id), 'every student has a desk in the page data');
  // The class page: the Homeroom | Classroom | Dashboard row for her, nothing new for anyone else.
  const classPage = await as(rivera)(`/class/${cls.id}`);
  assert.match(classPage.text, /class="hr-tabs"/); assert.match(classPage.text, new RegExp(`href="/class/${cls.id}/homeroom"`));
  for (const u of [noPlan, head, kids[0]]) {
    assert.equal((await as(u)(`/class/${cls.id}/homeroom`)).status, 404, u.username);
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/groups`, { body: { groups: [] } })).status, 404, u.username);
    const r = await as(u)(`/class/${cls.id}`);
    assert.equal(r.status, 200); assert.doesNotMatch(r.text, /class="hr-tabs"|\/homeroom"/, u.username);
  }
  assert.equal((await as(other)(`/class/${cls.id}/homeroom`)).status, 404);
  assert.equal((await as(null)(`/class/${cls.id}/homeroom`)).status, 404);
  // '*' lets every Teacher plan teacher in (still not one without the plan).
  gateOn(['*']);
  try { assert.equal(H.canUse(offList), true); assert.equal(H.canUse(noPlan), false); } finally { gateOn(); }
  // An archived class: no Homeroom.
  q.run('UPDATE classrooms SET archived_at=1 WHERE id=?', otherCls.id);
  try { assert.equal(H.canUseClass(other, S.getClass(otherCls.id)), false); } finally { q.run('UPDATE classrooms SET archived_at=NULL WHERE id=?', otherCls.id); }
  // The plan ends: Homeroom goes with it.
  const ending = staff('Ms Ending'); const sub = TOOLS.givePlan(ending.id); config.homeroomUsers.push(ending.username.toLowerCase());
  assert.equal(H.canUse(ending), true); TOOLS.endPlan(sub); assert.equal(H.canUse(ending), false);
});

test('seating: presets lay out every desk with no overlaps (names above them included), below the teacher\'s desk', () => {
  for (const p of SEATS.PRESETS) for (const n of [1, 4, 12, 24, 36]) {
    const l = SEATS.layout(p, n);
    assert.equal(l.length, n, `${p} ${n}`);
    for (const a of l) assert.ok(a.y >= SEATS.SEATS_TOP && a.x >= 0, `${p} ${n}`);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      assert.ok(Math.abs(l[i].x - l[j].x) >= SEATS.DESK.w || Math.abs(l[i].y - l[j].y) >= SEATS.DESK.h + SEATS.NAME_H - 10, `${p} ${n}: desks ${i} and ${j} overlap (names included)`);
    }
  }
  assert.equal(SEATS.clampSeat({ x: 'a', y: 1 }), null);
  assert.deepEqual(SEATS.clampSeat({ x: -50, y: 10 }), { x: 0, y: SEATS.SEATS_TOP }, 'never above the students\' part of the room');
});

test('seating: saved and loaded per class; only that class\'s teachers; bad input refused', async () => {
  const fresh = H.roomOf(cls.id);
  assert.equal(fresh.preset, 'rows'); assert.equal(Object.keys(fresh.seats).length, kids.length);
  assert.deepEqual(fresh.groups.map(g => g.key), ['stretch', 'onTrack', 'building']);

  const seats = Object.fromEntries(SEATS.layout('circle', kids.length).map((p, i) => [kids[i].id, p]));
  const r = await as(rivera)(`/api/homeroom/${cls.id}/seats`, { body: { preset: 'circle', seats: { ...seats, [other.id]: { x: 10, y: 900 }, nobody: { x: 1, y: 1 } } } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.preset, 'circle');
  assert.deepEqual(Object.keys(r.json.seats).sort(), kids.map(k => k.id).sort(), 'only the class\'s students keep a seat');
  // One desk dragged: the others stay where they were.
  const moved = await as(rivera)(`/api/homeroom/${cls.id}/seats`, { body: { seats: { [kids[0].id]: { x: 1234.6, y: 2001 } } } });
  assert.equal(moved.status, 200);
  const room = H.roomOf(cls.id);
  assert.equal(room.preset, 'circle');
  assert.deepEqual(room.seats[kids[0].id], { x: 1235, y: 2001 });
  assert.deepEqual(room.seats[kids[1].id], seats[kids[1].id]);
  assert.equal(H.roomOf(otherCls.id).preset, 'rows', 'each class keeps its own seating');
  // The page carries it back.
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom`)).text, /"preset":"circle"/);

  for (const body of [{ preset: 'stadium', seats: {} }, { seats: [] }, { seats: { [kids[0].id]: { x: 'left', y: 3 } } }, {}]) {
    const bad = await as(rivera)(`/api/homeroom/${cls.id}/seats`, { body });
    assert.equal(bad.status, 400, JSON.stringify(body)); assert.ok(bad.json.error);
  }
  // Another class's teacher, a co-teacher without the plan, a student: 404, nothing saved.
  for (const u of [other, noPlan, kids[1]]) assert.equal((await as(u)(`/api/homeroom/${cls.id}/seats`, { body: { seats: { [kids[0].id]: { x: 0, y: 700 } } } })).status, 404);
  assert.deepEqual(H.roomOf(cls.id).seats[kids[0].id], { x: 1235, y: 2001 });

  // A new student gets a free desk without moving anyone; a student who leaves loses theirs (and their group).
  const before = H.roomOf(cls.id).seats;
  const fay = kid('Fay Lane');
  const after = H.roomOf(cls.id).seats;
  for (const k of kids) assert.deepEqual(after[k.id], before[k.id]);
  assert.ok(after[fay.id]);
  for (const k of kids) { const a = after[k.id], b = after[fay.id]; assert.ok(Math.abs(a.x - b.x) >= SEATS.DESK.w || Math.abs(a.y - b.y) >= SEATS.DESK.h, 'the new desk is free'); }
  await as(rivera)(`/api/homeroom/${cls.id}/seats`, { body: { seats: { [fay.id]: after[fay.id] } } });
  H.saveGroups(rivera, cls, { groups: H.roomOf(cls.id).groups, members: { [fay.id]: 'g1' } });
  S.removeFromClass(boss, cls.id, fay.id);
  const row = q.get('SELECT seats, members FROM homeroom_rooms WHERE class_id=?', cls.id);
  assert.ok(!row.seats.includes(fay.id) && !row.members.includes(fay.id));
});

test('groups: rename, recolor, members; validation and the word rules', async () => {
  const groups = [{ id: 'g1', key: 'stretch', name: '', color: '#8C6BD1' }, { id: 'g2', name: 'Fractions crew', color: '#E8833A' }, { id: 'gx', name: 'Readers', color: '#3F8FCF' }];
  const members = { [kids[0].id]: 'g1', [kids[1].id]: 'g2', [kids[2].id]: 'gone', [other.id]: 'g1' };
  const r = await as(rivera)(`/api/homeroom/${cls.id}/groups`, { body: { groups, members } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json.groups.map(g => g.name || g.key), ['stretch', 'Fractions crew', 'Readers']);
  assert.deepEqual(r.json.members, { [kids[0].id]: 'g1', [kids[1].id]: 'g2' }, 'only current students, only groups that exist');
  assert.deepEqual(H.roomOf(cls.id).members, r.json.members);
  const bad = async (gs, code) => { const x = await as(rivera)(`/api/homeroom/${cls.id}/groups`, { body: { groups: gs, members: {} } }); assert.equal(x.status, 400, JSON.stringify(gs)); assert.equal(x.json.code, code); };
  await bad([], 'badGroups');
  await bad([{ id: 'a', name: 'A', color: '#000000' }], 'badGroups');
  await bad([{ id: 'a', name: 'A', color: '#8C6BD1' }, { id: 'a', name: 'B', color: '#8C6BD1' }], 'badGroups');
  await bad([{ id: 'a', name: '   ', color: '#8C6BD1' }], 'groupName');
  await bad(Array.from({ length: 9 }, (_, i) => ({ id: `g${i}`, name: `G${i}`, color: '#8C6BD1' })), 'badGroups');
  await bad([{ id: 'a', name: 'Call 555-123-4567', color: '#8C6BD1' }], 'words');
  assert.equal(H.roomOf(cls.id).groups.length, 3, 'nothing changed');
});

test('the teacher\'s area: notes, text, pen and shapes, cleaned like the live room\'s', async () => {
  const state = { __ann: { notes: [{ id: 'n1', text: 'Long division today', x: 0.1, y: 0.2, by: 't' }], texts: [{ id: 'x1', text: 'Warm-up', x: 2, y: -1 }, { id: 'x2', text: '   ', x: 0, y: 0 }],
    strokes: [{ c: 'red', pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.6 }] }] },
    shapes: [{ id: 's1', k: 'rect', x: 0.1, y: 0.1, x2: 0.3, y2: 1.4, c: '#1F9D63' }, { id: 's2', k: 'blob', x: 0, y: 0, x2: 1, y2: 1 }], extra: 'dropped' };
  const r = await as(rivera)(`/api/homeroom/${cls.id}/area`, { body: { state } });
  assert.equal(r.status, 200, r.text);
  const a = H.roomOf(cls.id).area;
  assert.equal(a.__ann.notes[0].text, 'Long division today');
  // (objects may sit anywhere on the board: docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole
  // board"; a place past the board's top is kept at its edge, -AREA.y / AREA.h)
  assert.deepEqual(a.__ann.texts.map(x => [x.text, x.x, x.y]), [['Warm-up', 2, -0.1053]], 'empty texts go; places stay inside the board');
  assert.equal(a.__ann.strokes[0].c, '#FF6B4A', 'a bad pen color becomes the default');
  assert.deepEqual(a.shapes, [{ id: 's1', k: 'rect', x: 0.1, y: 0.1, x2: 0.3, y2: 1.4, c: '#1F9D63' }]);
  assert.equal(a.extra, undefined);
  const rude = await as(rivera)(`/api/homeroom/${cls.id}/area`, { body: { state: { __ann: { notes: [{ id: 'n', text: 'email me at a@b.com', x: 0, y: 0 }] } } } });
  assert.equal(rude.status, 400); assert.equal(rude.json.code, 'personal');
  assert.equal((await as(other)(`/api/homeroom/${cls.id}/area`, { body: { state } })).status, 404);
});

test('the class page: a Homeroom teacher keeps every class tab working (Classroom), and Dashboard unchanged', async () => {
  const r = await as(rivera)(`/class/${cls.id}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /<nav class="tabs classtabs"/, 'the Classroom tab is today\'s class page');
  assert.match(r.text, /<a href="\/class\/[^"]+"[^>]*aria-current="page"[^>]*>Classroom<\/a>/);
  const p = await as(rivera)(`/class/${cls.id}/progress`);
  assert.equal(p.status, 200); assert.match(p.text, /class="hr-tabs"/);
  const d = await as(rivera)(`/class/${cls.id}/dashboard`);
  // Dashboard is the third view of the same page now (docs/decisions.md "Homeroom: one page, three views"); its widgets
  // are unchanged.
  assert.equal(d.status, 200); assert.match(d.text, /class="hr-tabs"/); assert.match(d.text, /id="dash-grid"/);
  // In Spanish.
  const es = await fetch(`${base}/class/${cls.id}/homeroom`, { headers: { cookie: `${cookieFor(rivera.id)}; lang=es` } });
  assert.match(await es.text(), /Organizar los asientos/);
});
