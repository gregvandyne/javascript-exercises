// Homeroom, step 1b (docs/decisions.md "Homeroom, step 1b"; services/homeroom.js, routes/homeroom.js):
//   - the student desk's gate: a student of a class whose teacher has Homeroom gets /class/:id/desk (and a "My desk"
//     link on their class page); a student of another class, the class's teacher, a class without Homeroom (flag off,
//     no entitled teacher) and a signed-out visitor get the normal 404;
//   - live class: only the class's teachers start, bring, pause and end it; students (and other teachers) get a 404 and
//     only read it; a class left live ends by itself; the "Your class is in Homeroom" check and its script;
//   - the doodle and working-out pad: saved and loaded per student, cleaned and limited, only by its own student, gone
//     when they leave the class or their account is deleted;
//   - the projector view: the class's teachers only, and never a student's name or desk.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
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

const boss = createUser({ username: 'HrdBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Desk Oak' }).school;
const staff = (name) => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), noPlan = staff('Mr Free'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 5C', teacherId: other.id }).class;
const plainCls = S.createClass(boss, oak.id, { name: 'Room 6D', teacherId: noPlan.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park'].map(n => kidIn(cls, n));
const otherKid = kidIn(otherCls, 'Dev Rao'), plainKid = kidIn(plainCls, 'Eli Moss');
const gateOn = () => { config.homeroom = true; config.homeroomUsers = [rivera, noPlan, other].map(u => u.username.toLowerCase()); };
gateOn();
const live = (who, c, action) => as(who)(`/api/homeroom/${c.id}/live`, { body: { action } });

test('the desk: a student of a Homeroom class gets it; another class, a class without Homeroom, teachers: 404', async () => {
  const r = await as(kids[0])(`/class/${cls.id}/desk`);
  assert.equal(r.status, 200, r.text.slice(0, 200));
  assert.match(r.text, /\/js\/homeroom-desk\.js/);
  assert.match(r.text, /Room 4B/);
  assert.match(r.text, /noindex/);
  assert.match(r.text, /See the room/); assert.match(r.text, /href="\/library"/);
  assert.doesNotMatch(r.text, /\/plans|Teacher plan|\$\d/, 'students never see plans or prices');
  // See the room: every desk of the class, by the names classmates see (display names), never the roster's real names.
  for (const k of kids) { assert.ok(r.text.includes(k.id)); assert.ok(r.text.includes(k.display_name)); }
  assert.doesNotMatch(r.text, /Ben Hill|Cleo Park/, 'no real names of classmates');
  // Their class page: the way to the desk.
  assert.match((await as(kids[0])(`/class/${cls.id}`)).text, new RegExp(`href="/class/${cls.id}/desk"`));

  assert.equal((await as(otherKid)(`/class/${cls.id}/desk`)).status, 404, 'a student of another class');
  assert.equal((await as(otherKid)(`/class/${otherCls.id}/desk`)).status, 200, 'their own class has Homeroom too');
  assert.equal((await as(plainKid)(`/class/${plainCls.id}/desk`)).status, 404, 'their teacher has no Teacher plan');
  assert.doesNotMatch((await as(plainKid)(`/class/${plainCls.id}`)).text, /\/desk"/, 'no link without Homeroom');
  for (const u of [rivera, other, boss, null]) assert.equal((await as(u)(`/class/${cls.id}/desk`)).status, 404, u ? u.username : 'signed out');
  assert.equal((await as(kids[0])(`/api/desk/${cls.id}/state`)).status, 200);
  assert.equal((await as(otherKid)(`/api/desk/${cls.id}/state`)).status, 404);
  // A teacher with the plan but off the list doesn't count; the flag off hides it from everyone; an archived class too.
  config.homeroomUsers = [noPlan.username.toLowerCase()];
  try { assert.equal((await as(kids[0])(`/class/${cls.id}/desk`)).status, 404); } finally { gateOn(); }
  config.homeroom = false;
  try { assert.equal((await as(kids[0])(`/class/${cls.id}/desk`)).status, 404); assert.doesNotMatch((await as(kids[0])(`/class/${cls.id}`)).text, /\/desk"/); } finally { gateOn(); }
  q.run('UPDATE classrooms SET archived_at=1 WHERE id=?', cls.id);
  try { assert.equal((await as(kids[0])(`/class/${cls.id}/desk`)).status, 404); } finally { q.run('UPDATE classrooms SET archived_at=NULL WHERE id=?', cls.id); }
  // A second teacher with the plan is enough when the first has none.
  S.addToClass(boss, plainCls.id, other.id, 'teacher');
  try { assert.equal((await as(plainKid)(`/class/${plainCls.id}/desk`)).status, 200); } finally { S.removeFromClass(boss, plainCls.id, other.id); }
});

test('live class: only the class\'s teachers change it; students only read it; it ends by itself', async () => {
  for (const u of [kids[0], otherKid, other, noPlan]) {
    assert.equal((await live(u, cls, 'start')).status, 404, u.username);
  }
  assert.equal(H.liveOf(cls.id), null, 'nobody but its teacher started it');
  assert.equal((await live(rivera, cls, 'bring')).json.code, 'notLive');
  assert.equal((await live(rivera, cls, 'dance')).status, 400);

  // The prompt's check: nothing live yet.
  assert.deepEqual((await as(kids[0])('/api/homeroom-live')).json.live, []);
  const r = await live(rivera, cls, 'start');
  assert.equal(r.status, 200, r.text); assert.ok(r.json.live.since); assert.equal(r.json.live.bring, false);
  const st = await as(kids[1])(`/api/desk/${cls.id}/state`);
  assert.ok(st.json.live); assert.equal(st.json.live.paused, false); assert.ok('area' in st.json);
  // Asked again with the version it has: no area sent again.
  assert.ok(!('area' in (await as(kids[1])(`/api/desk/${cls.id}/state?v=${st.json.v}`)).json));
  assert.deepEqual((await as(kids[0])('/api/homeroom-live')).json.live.map(c => c.name), ['Room 4B']);
  assert.deepEqual((await as(otherKid)('/api/homeroom-live')).json.live, [], 'another class\'s student hears nothing');

  // Students can't pause or bring everyone, or end it.
  for (const a of ['pause', 'bring', 'end']) assert.equal((await live(kids[0], cls, a)).status, 404);
  assert.equal((await live(rivera, cls, 'bring')).json.live.bring, true);
  assert.equal((await live(rivera, cls, 'pause')).json.live.paused, true);
  const seen = (await as(kids[2])(`/api/desk/${cls.id}/state`)).json.live;
  assert.deepEqual([seen.bring, seen.paused], [true, true]);
  assert.equal((await live(rivera, cls, 'resume')).json.live.paused, false);
  assert.equal((await live(rivera, cls, 'back')).json.live.bring, false);
  // The teacher's page shows it live.
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom`)).text, /"live":\{"since"/);
  assert.equal((await live(rivera, cls, 'end')).json.live, null);
  assert.equal((await as(kids[0])(`/api/desk/${cls.id}/state`)).json.live, null);

  // Left live: it ends by itself after LIVE_MAX_MS.
  await live(rivera, cls, 'start');
  q.run('UPDATE homeroom_rooms SET live_at=? WHERE class_id=?', Date.now() - H.LIVE_MAX_MS - 1000, cls.id);
  assert.equal(H.liveOf(cls.id), null);
  assert.deepEqual((await as(kids[0])('/api/homeroom-live')).json.live, []);
  await live(rivera, cls, 'end');
});

test('the prompt\'s script: on every page for students with a Homeroom class, not on the desk, not for others', async () => {
  H.saveSeats(rivera, cls, { seats: {} });   // the class has a Homeroom room
  assert.match((await as(kids[0])('/classes')).text, /\/js\/homeroom-notify\.js/);
  assert.match((await as(kids[0])('/me')).text, /\/js\/homeroom-notify\.js/);
  assert.doesNotMatch((await as(kids[0])(`/class/${cls.id}/desk`)).text, /homeroom-notify/);
  assert.doesNotMatch((await as(plainKid)('/classes')).text, /homeroom-notify/, 'no Homeroom room in their class');
  assert.doesNotMatch((await as(rivera)('/classes')).text, /homeroom-notify/, 'teachers start it; they get no prompt');
  config.homeroom = false;
  try { assert.doesNotMatch((await as(kids[0])('/classes')).text, /homeroom-notify/); } finally { gateOn(); }
});

test('the doodle pad: saved and loaded per student, cleaned and limited, only by its own student', async () => {
  const pad = (who, c, strokes) => as(who)(`/api/desk/${c.id}/doodle`, { body: { strokes } });
  const strokes = [
    { c: '#1E88E5', pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.52345678 }, { x: 3, y: -1 }] },
    { c: 'url(javascript:alert(1))', pts: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] },
    { c: '#141414', pts: [{ x: 0.4, y: 0.4 }] },
  ];
  const r = await pad(kids[0], cls, strokes);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(H.doodleOf(cls.id, kids[0].id), [
    { c: '#1E88E5', pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5235 }, { x: 1, y: 0 }] },
    { c: H.DOODLE_COLORS[0], pts: [{ x: 0.2, y: 0.2 }, { x: 0.3, y: 0.3 }] },
  ], 'inside the page, a known color, no one-point stroke');
  assert.deepEqual(H.doodleOf(cls.id, kids[1].id), [], 'each student has their own');
  // Loaded with the desk.
  assert.match((await as(kids[0])(`/class/${cls.id}/desk`)).text, /"strokes":\[\{"c":"#1E88E5"/);
  assert.match((await as(kids[1])(`/class/${cls.id}/desk`)).text, /"strokes":\[\]/);
  // Limits: too many strokes, too many points in all; a long stroke is cut.
  const line = n => ({ c: '#141414', pts: Array.from({ length: n }, (_, i) => ({ x: i / n, y: 0.5 })) });
  assert.equal((await pad(kids[0], cls, Array.from({ length: H.DOODLE.strokes + 1 }, () => line(2)))).json.code, 'padFull');
  assert.equal((await pad(kids[0], cls, Array.from({ length: 60 }, () => line(H.DOODLE.points)))).json.code, 'padFull');
  assert.equal((await pad(kids[0], cls, [line(H.DOODLE.points + 200)])).status, 200);
  assert.equal(H.doodleOf(cls.id, kids[0].id)[0].pts.length, H.DOODLE.points);
  for (const bad of [{}, 'x', [null], [{ c: '#141414' }]]) assert.equal((await pad(kids[0], cls, bad)).status, 400, JSON.stringify(bad));
  // Nobody else writes to it: another class's student, the teacher, a signed-out visitor.
  for (const u of [otherKid, rivera, null]) assert.equal((await pad(u, cls, [line(3)])).status, 404);
  assert.equal(H.doodleOf(cls.id, kids[0].id)[0].pts.length, H.DOODLE.points, 'unchanged');
  // Gone when they leave the class; gone with their account.
  await pad(kids[1], cls, [line(5)]);
  S.removeFromClass(boss, cls.id, kids[1].id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_doodles WHERE user_id=?', kids[1].id).n, 0);
  S.addToClass(boss, cls.id, kids[1].id);
  const gone = kidIn(cls, 'Gus Gone');
  await pad(gone, cls, [line(5)]);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_doodles WHERE user_id=?', gone.id).n, 1);
  assert.equal(deleteAccount(gone.id, boss, { by: 'admin', leaveSchools: true }).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_doodles WHERE user_id=?', gone.id).n, 0);
});

test('the projector view: the class\'s teachers only; the teacher\'s area and the class, never a student\'s name or desk', async () => {
  H.saveArea(rivera, cls, { __ann: { notes: [{ id: 'n1', text: 'Long division', x: 0.1, y: 0.1, by: 't' }] } });
  H.saveSeats(rivera, cls, { preset: 'pods', seats: {} });
  const p = await as(rivera)(`/class/${cls.id}/homeroom/projector`);
  assert.equal(p.status, 200);
  assert.match(p.text, /Room 4B/); assert.match(p.text, /Long division/); assert.match(p.text, /homeroom-projector\.js/);
  const everyone = [...S.roster(cls.id).filter(x => x.role === 'student')];
  assert.ok(everyone.length >= 3);
  for (const k of everyone) {
    for (const s of [k.id, k.display_name, k.roster_name, k.username].filter(Boolean)) assert.ok(!p.text.includes(s), `no ${s} on the projector`);
  }
  assert.doesNotMatch(p.text, /"seats"|"members"|"groups"|hr-desk/);
  assert.doesNotMatch(p.text, /oc-bubble|companion\.js/, 'no chat on the projector');
  const st = await as(rivera)(`/api/homeroom/${cls.id}/state`);
  assert.equal(st.status, 200); assert.equal(st.json.area.__ann.notes[0].text, 'Long division');
  for (const k of everyone) assert.ok(!st.text.includes(k.id) && !st.text.includes(k.display_name));
  for (const u of [kids[0], other, noPlan, null]) {
    assert.equal((await as(u)(`/class/${cls.id}/homeroom/projector`)).status, 404);
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/state`)).status, 404);
  }
});
