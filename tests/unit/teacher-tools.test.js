// The teaching tools' one gate (services/teacher-tools.js toolAccess; docs/decisions.md "Figures and the Manipulatives:
// Teacher plan only", the owner's decision of 22 Nov 2026): Figures and the Manipulatives open to school staff with the
// Teacher plan (paid, a trial, a school seat) while paid plans are on for everyone, the platform admin and the tester
// list always; staff without the plan get the plan page (200), never a price; students, kids, guests, grown-ups and
// banned accounts the normal 404; FIGURES=0 and MANIPULATIVES=0 stay kill switches; paid plans off falls back to the
// tester list. A host whose plan lapses keeps the session their students are in; they cannot start a new one.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const F = await import('../../server/services/figures.js');
const TT = await import('../../server/services/teacher-tools.js');
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

const boss = createUser({ username: 'ToolsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Tools Oak' }).school;
const staff = (name, role = 'teacher') => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role }).user.id);
const paid = staff('Pat Paid'), trial = staff('Tia Trial'), seat = staff('Sol Seat'), free = staff('Fay Free'), tester = staff('Tex Tester'), head = staff('Hal Head', 'admin');
const subPaid = TOOLS.givePlan(paid.id); TOOLS.giveTrial(trial.id); TOOLS.giveSeat(oak.id, seat.id, boss.id); TOOLS.givePlan(head.id);
const cls = S.createClass(boss, oak.id, { name: '5P', teacherId: paid.id }).class;
const pupil = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Pip Pupil' }).user.id);
S.addToClass(boss, cls.id, pupil.id);
const grown = createUser({ username: 'ToolsParent', password: 'secret123', accountType: 'grownup' });
const guest = createUser({ username: 'ToolsGuest', isGuest: true });
const kid = createUser({ username: 'ToolsKid', password: 'secret123' });
config.manipulativesUsers = [tester.username.toLowerCase()];

test('one rule for both tools: the plan (paid, trial, seat), testers and the admin; the plan page for staff without it; nobody else', () => {
  for (const u of [paid, trial, seat, head, tester, boss]) { assert.equal(TT.toolAccess(u), 'yes', u.username); assert.equal(F.canMake(u), true); assert.equal(M.canHost(u), true); }
  assert.equal(TT.toolAccess(free), 'plan'); assert.equal(F.canMake(free), false); assert.equal(M.canHost(free), false);
  assert.equal(F.roleOf(free), 'plan'); assert.equal(M.roleOf(free), 'plan');
  for (const u of [pupil, grown, guest, kid, null]) { assert.equal(TT.toolAccess(u), null, u ? u.username : 'none'); assert.equal(F.roleOf(u), null); assert.equal(M.roleOf(u), null); }
  const b = staff('Ben Banned'); TOOLS.givePlan(b.id); q.run('UPDATE users SET banned=1 WHERE id=?', b.id);
  assert.equal(TT.toolAccess(getUser(b.id)), null, 'banned');
  // Each tool's own switch.
  assert.equal(TT.toolAccess(boss, false), null);
  config.figures = false; try { assert.equal(F.canMake(boss), false); assert.equal(M.canHost(paid), true, 'the Manipulatives keep their own switch'); } finally { config.figures = true; }
  config.manipulatives = false; try { assert.equal(M.canHost(boss), false); assert.equal(M.roleOf(free), null); assert.equal(F.canMake(paid), true); } finally { config.manipulatives = true; }
  // Paid plans off (no billing, or billing not yet public): the tester list alone, as before.
  for (const off of [() => TOOLS.plansOn(false), () => { config.billingPublic = false; }]) {
    off();
    try {
      assert.equal(TT.plansOn(), false);
      for (const u of [paid, trial, seat, free]) assert.equal(TT.toolAccess(u), null, u.username);
      assert.equal(TT.toolAccess(tester), 'yes'); assert.equal(TT.toolAccess(boss), 'yes');
    } finally { TOOLS.plansOn(); }
  }
});

test('the plan page: /manipulatives and /figures for a teacher without the plan (200, the trial and /plans, no price); APIs answer 403', async () => {
  for (const [p, h] of [['/manipulatives', /The Manipulatives are part of the Teacher plan/], ['/figures', /Figures is part of the Teacher plan/]]) {
    const r = await as(free)(p);
    assert.equal(r.status, 200, p); assert.match(r.text, h);
    assert.match(r.text, /href="\/trial"[^>]*>Start my free trial/); assert.match(r.text, /href="\/plans"/);
    assert.match(r.text, /free for 14 days/); assert.doesNotMatch(r.text, /\$\d|\d+ a year/, 'no price outside /plans');
    assert.match(r.text, /<a class="navlink" href="\/figures" aria-current="page">/, 'Teaching tools is the door to it');
  }
  assert.equal((await as(free)('/api/manipulatives/state')).status, 403);
  // In Spanish.
  const es = await fetch(base + '/figures', { headers: { cookie: `${cookieFor(free.id)}; lang=es` } });
  assert.match(await es.text(), /Figuras es parte del plan Docente/);
  // With the plan: the tools themselves.
  assert.doesNotMatch((await as(paid)('/manipulatives')).text, /part of the Teacher plan/);
  assert.equal((await as(paid)('/api/manipulatives/state')).status, 200);
  // Never to students, kids, grown-ups or guests: the normal 404 (and no Teaching tools in their menus).
  for (const u of [pupil, kid, grown, guest]) {
    for (const p of ['/figures', '/manipulatives']) { const r = await as(u)(p); assert.equal(r.status, 404, `${u.username} ${p}`); assert.doesNotMatch(r.text, /Teacher plan|href="\/figures"/); }
  }
  // Paid plans off: a teacher without the plan sees no Teaching tools and gets the 404, as before billing.
  TOOLS.plansOn(false);
  try {
    const r = await as(free)('/teach');
    assert.doesNotMatch(r.text, /href="\/figures"/);
    assert.equal((await as(free)('/figures')).status, 404); assert.equal((await as(free)('/manipulatives')).status, 404);
  } finally { TOOLS.plansOn(); }
});

test('a host\'s plan lapses: the session their students are in keeps working; no new session, no new board', async () => {
  const s = M.createSession(paid, { classId: cls.id, tool: 'clock', title: 'Time' });
  assert.ok(s.ok, JSON.stringify(s));
  assert.ok(M.join(pupil, { code: s.session.code }).ok, 'the student joins');
  TOOLS.endPlan(subPaid);
  assert.equal(M.canHost(paid), false); assert.equal(M.roleOf(paid), 'plan');
  // The student: still in the room, the page is theirs.
  assert.equal(M.roleOf(pupil), 'student');
  assert.ok(M.join(pupil, { code: s.session.code }).ok, 'still joins');
  assert.ok(M.studentView(pupil, s.session.id), 'still sees the session');
  assert.equal((await as(pupil)('/manipulatives')).status, 200);
  // The teacher: the plan page; nothing new.
  assert.equal(M.createSession(paid, { classId: cls.id, tool: 'clock' }).ok, false);
  assert.match((await as(paid)('/manipulatives')).text, /part of the Teacher plan/);
  TOOLS.givePlan(paid.id);
  assert.equal(M.canHost(paid), true, 'a new plan opens it again');
});
