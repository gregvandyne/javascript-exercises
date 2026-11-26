// Homeroom, step 3a (docs/decisions.md "Homeroom, step 3a"; services/homeroom-live.js, routes/homeroom.js):
//   - the status rules from a desk's pulse: Not here after 30 s without one, Done, Stuck after 3 minutes without a step
//     forward on an unfinished handout (and not before; a step forward or a new handout starts it again), Typing, Working;
//   - pulses only while live, cleaned (cursor samples clamped and limited, an unknown handout ignored), cursors off above
//     30 students and for a hidden cursor;
//   - hands: raise (question, help, bathroom), lower, the teacher's Answered; only while live;
//   - the hall pass: one student out at a time, the next in line waits ("place"), back moves the line on, Not now, the
//     pass time (default 5, the teacher changes it, 1 to 20);
//   - lock, hide and "coming over" by the class's teachers only, seen by that student only;
//   - the projector and other students never see hands or names; who may call what (auth);
//   - End class (and a new live class) wipe hands, passes, locks and pulses; delete paths.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const SD = await import('../../server/services/school-delete.js');
const games = await import('../../server/services/games.js');
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

const boss = createUser({ username: 'HlvBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Live Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 9A', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 9B', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Rao'].map(n => kidIn(cls, n));
const [ava, ben, cleo, dev] = kids;
const otherKid = kidIn(otherCls, 'Eli Moss');
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=? WHERE id=?", v.id, slug, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-live'), ladder = made('Word Ladder', 'word-ladder-live');
const live = action => H.setLive(rivera, cls, action);
const T0 = 1_800_000_000_000;

// ---------------------------------------------------------------- the status rules (pure)
test('status rules: Not here, Done, Stuck after 3 minutes, Typing, Working, At desk', () => {
  const cards = [{ id: 'a', done: false, next: true, pct: 20 }, { id: 'b', done: false, locked: true, pct: 0 }];
  const beat = (o = {}) => ({ at: T0, since: T0, onSince: T0, progAt: T0, inputAt: T0 - 60e3, on: '', where: 'desk', ...o });
  assert.deepEqual(HV.statusOf(null, cards, T0), { st: 'away', on: 'a' }, 'no pulse at all: not here');
  assert.equal(HV.statusOf(beat(), cards, T0 + HV.HERE_MS + 1).st, 'away', 'no pulse for 30 s: not here');
  assert.equal(HV.statusOf(beat(), cards, T0 + HV.HERE_MS - 1).st, 'working', 'a pulse 29 s ago is still here');
  assert.equal(HV.statusOf(beat({ inputAt: T0 - 5e3 }), cards, T0).st, 'typing', 'input in the last 10 s');
  assert.equal(HV.statusOf(beat({ inputAt: T0 - 11e3 }), cards, T0).st, 'working');
  assert.equal(HV.statusOf(beat(), [], T0).st, 'here', 'nothing on the desk: at desk');
  assert.deepEqual(HV.statusOf(beat(), [{ id: 'a', done: true }, { id: 'b', done: true }], T0), { st: 'done', on: '' });
  // Stuck: an unfinished handout, no step forward for 3 minutes (pulses kept coming, so they are here)
  const at = T0 + HV.STUCK_MS;
  assert.deepEqual(HV.statusOf(beat({ at: at - 5e3, inputAt: at - 1e3 }), cards, at), { st: 'stuck', on: 'a' }, 'stuck beats typing');
  assert.equal(HV.statusOf(beat({ at: at - 5e3 }), cards, at - 1).st, 'working', 'not before 3 minutes');
  assert.equal(HV.statusOf(beat({ at: at - 5e3, progAt: T0 + 60e3 }), cards, at).st, 'working', 'a step forward starts the 3 minutes again');
  assert.equal(HV.statusOf(beat({ at: at - 5e3, onSince: T0 + 60e3 }), cards, at).st, 'working', 'a new handout starts them again');
  assert.equal(HV.statusOf(beat({ at: at - 5e3, on: 'a', where: 'game' }), cards, at).on, 'a', 'the handout open in the game');
  assert.equal(HV.statusOf(beat({ at: at - 5e3 }), [{ id: 'a', done: true }, { id: 'b', done: true }], at).st, 'done', 'done is never stuck');
  assert.equal(HV.statusOf(beat({ at: at - 5e3 }), [], at).st, 'here', 'nothing to be stuck on');
  // cursor samples: clamped, at most 8, timed back from the pulse
  const pts = HV.cleanSamples([[0, -1, 2], [250, 0.5, 0.25], ...Array.from({ length: 10 }, (_, i) => [500 + i * 250, 0.1, 0.1])], T0);
  assert.equal(pts.length, HV.SAMPLES);
  assert.equal(pts[pts.length - 1][0], T0);
  assert.ok(pts.every(([, x, y]) => x >= 0 && x <= 1 && y >= 0 && y <= 1));
  assert.deepEqual(HV.cleanSamples('nope', T0), []);
});

// ---------------------------------------------------------------- pulses through the routes
test('pulses: only while live; the board gets statuses and cursors, desks and the projector never get names or hands', async () => {
  live('end');
  const p0 = await as(ava)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 0 } });
  assert.equal(p0.status, 200); assert.equal(p0.json.live, null, 'not live: nothing kept');
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/pulse`)).json.live, null);
  live('start');
  const h = HO.handOut(rivera, cls, { gameId: pizza.id, to: { kind: 'all' } });
  assert.ok(h.ok, h.code);
  const cl = h.classLesson.id;
  const r = await as(ava)(`/api/desk/${cls.id}/pulse`, { body: { where: 'game', on: cl, idle: 2, step: 1 } });
  assert.equal(r.status, 200);
  assert.equal(r.json.me.hand, ''); assert.equal(r.json.me.minutes, 5); assert.equal(r.json.me.cursors, true);
  await as(ben)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 40, cur: [[0, 0.2, 0.3], [250, 0.4, 0.5], [500, 9, -3]], pad: [[0, 0.5, 0.5]] } });
  await as(cleo)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', on: 'not-a-handout', idle: 40 } });
  const b = await as(rivera)(`/api/homeroom/${cls.id}/pulse`);
  assert.equal(b.status, 200);
  const d = b.json.desks;
  assert.equal(d[ava.id].st, 'typing'); assert.equal(d[ava.id].on, cl); assert.equal(d[ava.id].where, 'game');
  assert.equal(d[ben.id].st, 'working'); assert.equal(d[ben.id].cur.length, 3);
  assert.deepEqual(d[ben.id].cur[2].slice(1), [1, 0], 'samples clamped to the desk');
  assert.equal(d[cleo.id].on, cl, 'an unknown handout id is ignored: their Next up');
  assert.equal(d[dev.id].st, 'away', 'no pulse: not here');
  assert.ok(b.json.ho && b.json.hv, 'the handouts come with the first poll');
  const again = await as(rivera)(`/api/homeroom/${cls.id}/pulse?hv=${b.json.hv}`);
  assert.equal(again.json.ho, undefined, 'and again only when they changed');
  assert.equal(b.json.cursors, true);
  // a desk's own state poll: its own live desk only, no classmates' names, statuses or hands
  HV.raiseHand(ben, cls, 'question');
  const st = await as(ava)(`/api/desk/${cls.id}/state`);
  assert.equal(st.json.me.hand, '');
  assert.ok(!/Ben|desks|hands/.test(JSON.stringify({ me: st.json.me, mates: st.json.mates })));
  // the projector's poll: the live state and the area, never a name, a hand or a status
  const pr = await as(rivera)(`/api/homeroom/${cls.id}/state`);
  assert.equal(pr.status, 200);
  for (const k of kids) assert.ok(!pr.text.includes(k.id) && !pr.text.includes(k.display_name), 'no student on the projector');
  assert.doesNotMatch(pr.text, /question|hand|bathroom|stuck|typing/i);
  const page = await as(rivera)(`/class/${cls.id}/hub/projector`);
  assert.doesNotMatch(page.text, /homeroom-live|hr-lvchip|Hands up/);
  HV.lowerHand(ben, cls);
});

test('cursors: presence only above 30 students, none for a hidden cursor, none on the game page', async () => {
  live('start');
  await as(ava)(`/api/desk/${cls.id}/pulse`, { body: { where: 'game', idle: 1, cur: [[0, 0.5, 0.5]] } });
  assert.equal(HV.liveView(cls).desks[ava.id].cur, undefined, 'no cursor from the game page');
  assert.ok(HV.setFlag(rivera, cls, ben.id, 'hide', true).ok);
  const r = await as(ben)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 1, cur: [[0, 0.5, 0.5]] } });
  assert.equal(r.json.me.hidden, true, 'the desk is told to stop sending');
  assert.equal(HV.liveView(cls).desks[ben.id].cur, undefined);
  assert.ok(HV.setFlag(rivera, cls, ben.id, 'hide', false).ok);
  // a big class: presence only
  const big = S.createClass(boss, oak.id, { name: 'Big room', teacherId: rivera.id }).class;
  const many = Array.from({ length: 31 }, (_, i) => kidIn(big, `Kid ${i}`));
  H.setLive(rivera, big, 'start');
  const p = await as(many[0])(`/api/desk/${big.id}/pulse`, { body: { where: 'desk', idle: 1, cur: [[0, 0.5, 0.5]] } });
  assert.equal(p.json.me.cursors, false);
  const v = HV.liveView(big);
  assert.equal(v.cursors, false); assert.equal(v.desks[many[0].id].cur, undefined); assert.equal(v.desks[many[0].id].st, 'typing', 'their status still shows');
  H.setLive(rivera, big, 'end');
});

test('Stuck through the server: 3 minutes without a step forward, a step forward starts again, Not here after 30 s', () => {
  live('end'); live('start');
  const cl = HO.boardView(cls).handouts[0].id;
  const t = Date.now();
  HV.pulse(cleo, cls, { where: 'game', on: cl, idle: 0, step: 0 }, t);
  HV.liveView(cls, HO.boardView(cls), t);
  for (let s = 10; s <= 170; s += 10) HV.pulse(cleo, cls, { where: 'game', on: cl, idle: 0, step: 0 }, t + s * 1000);
  assert.equal(HV.liveView(cls, HO.boardView(cls), t + 175e3).desks[cleo.id].st, 'typing');
  HV.pulse(cleo, cls, { where: 'game', on: cl, idle: 0, step: 0 }, t + 180e3);
  const v = HV.liveView(cls, HO.boardView(cls), t + 181e3);
  assert.equal(v.desks[cleo.id].st, 'stuck');
  // the game saved (a step forward): working again
  HV.pulse(cleo, cls, { where: 'game', on: cl, idle: 20, step: 1 }, t + 190e3);
  assert.equal(HV.liveView(cls, HO.boardView(cls), t + 191e3).desks[cleo.id].st, 'working');
  // nothing for 30 s: not here; back again: a fresh start, not stuck from before
  assert.equal(HV.liveView(cls, HO.boardView(cls), t + 190e3 + HV.HERE_MS + 1).desks[cleo.id].st, 'away');
  HV.pulse(cleo, cls, { where: 'game', on: cl, idle: 20, step: 1 }, t + 190e3 + HV.STUCK_MS + 1);
  assert.equal(HV.liveView(cls, HO.boardView(cls), t + 190e3 + HV.STUCK_MS + 2).desks[cleo.id].st, 'working');
});

test('a team desk: teammates see each other\'s cursor on the shared pad (by the names classmates see), nobody else does', async () => {
  live('end'); live('start');
  const tm = H.saveTeams(rivera, cls, { action: 'make', members: [ava.id, ben.id] });
  assert.ok(tm.ok, tm.code);
  await as(ben)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 1, cur: [[0, 0.5, 0.8]], pad: [[0, 0.25, 0.5], [250, 0.3, 0.5]] } });
  const a = await as(ava)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 1 } });
  assert.equal(a.json.mates.length, 1);
  assert.equal(a.json.mates[0].name, ben.display_name, 'the name classmates see, never the roster name');
  assert.deepEqual(a.json.mates[0].pts.map(p => p.slice(1)), [[0.25, 0.5], [0.3, 0.5]]);
  assert.equal((await as(ava)(`/api/desk/${cls.id}/state`)).json.mates.length, 1, 'the state poll brings them too');
  assert.deepEqual((await as(cleo)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 1 } })).json.mates, [], 'not a teammate');
  HV.setFlag(rivera, cls, ben.id, 'hide', true);
  assert.deepEqual((await as(ava)(`/api/desk/${cls.id}/state`)).json.mates, [], 'a hidden cursor is not shared');
  HV.setFlag(rivera, cls, ben.id, 'hide', false);
  H.saveTeams(rivera, cls, { action: 'split', id: tm.team.id });
});

// ---------------------------------------------------------------- hands and the hall pass
test('hands: raise, change, lower; the teacher answers in the order raised; only while live', async () => {
  live('end');
  assert.equal((await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'question' } })).status, 400, 'not live');
  live('start');
  assert.equal((await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'dance' } })).json.code, 'badKind');
  const a = await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'question' } });
  assert.equal(a.status, 200); assert.equal(a.json.me.hand, 'question');
  await as(ben)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'help' } });
  await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'question' } });
  let v = HV.handsView(cls);
  assert.deepEqual(v.hands.map(x => [x.name, x.kind]), [['Ava Stone', 'question'], ['Ben Hill', 'help']], 'in the order raised (the same hand again keeps its place)');
  await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'help' } });
  assert.deepEqual(HV.handsView(cls).hands.map(x => x.name), ['Ben Hill', 'Ava Stone'], 'a new kind is a new hand');
  // tapping again on the student side puts it down
  const down = await as(ava)(`/api/desk/${cls.id}/hand`, { body: { action: 'lower' } });
  assert.equal(down.json.me.hand, '');
  // Answered
  const ans = await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'answer', studentId: ben.id } });
  assert.equal(ans.status, 200); assert.deepEqual(ans.json.hands, []);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'answer', studentId: ben.id } })).json.code, 'noHand');
  // the board's poll shows ✋ on the desk
  HV.raiseHand(cleo, cls, 'question');
  const b = await as(rivera)(`/api/homeroom/${cls.id}/pulse`);
  assert.equal(b.json.desks[cleo.id].hand, 'question'); assert.equal(b.json.hands[0].id, cleo.id);
  HV.lowerHand(cleo, cls);
});

test('the hall pass: one out at a time, timed, the next in line waits and goes when the first is back', async () => {
  live('end'); live('start');
  for (const k of [ava, ben, cleo]) assert.ok(HV.raiseHand(k, cls, 'bathroom').ok);
  const give = k => as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'pass', studentId: k.id } });
  let r = await give(ava);
  assert.equal(r.status, 200); assert.equal(r.json.pass.out.id, ava.id); assert.equal(r.json.pass.minutes, 5, 'five minutes by default');
  assert.ok(Math.abs(r.json.pass.out.at - Date.now()) < 5000);
  r = await give(ben); r = await give(cleo);
  assert.equal(r.json.pass.out.id, ava.id, 'still one out at a time');
  assert.deepEqual(r.json.pass.line.map(x => x.id), [ben.id, cleo.id], 'the line in the order allowed');
  assert.deepEqual(r.json.hands, [], 'their hands went down');
  // what each student sees: Go ahead (with when, for the timer), You're next, in line
  const me = k => as(k)(`/api/desk/${cls.id}/state`).then(x => x.json.me);
  const [mA, mB, mC] = await Promise.all([me(ava), me(ben), me(cleo)]);
  assert.equal(mA.pass, 'out'); assert.ok(mA.outAt); assert.equal(mA.minutes, 5);
  assert.equal(mB.pass, 'line'); assert.equal(mB.place, 1);
  assert.equal(mC.pass, 'line'); assert.equal(mC.place, 2);
  // a bathroom hand while in line or out is refused
  assert.equal((await as(ben)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'bathroom' } })).json.code, 'passAlready');
  // the teacher changes the pass time
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'minutes', minutes: 30 } })).json.code, 'badMinutes');
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'minutes', minutes: 8 } })).json.pass.minutes, 8);
  assert.equal((await me(ava)).minutes, 8);
  // X is back: the next in line goes
  r = await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'back', studentId: ava.id } });
  assert.equal(r.json.pass.out.id, ben.id); assert.deepEqual(r.json.pass.line.map(x => x.id), [cleo.id]);
  assert.equal((await me(cleo)).place, 1, 'You\'re next');
  // the student says they're back themselves
  const bk = await as(ben)(`/api/desk/${cls.id}/hand`, { body: { action: 'back' } });
  assert.equal(bk.json.me.pass, '');
  assert.equal(HV.handsView(cls).pass.out.id, cleo.id);
  // Not now: a bathroom hand down without the pass; leaving the line from the desk
  HV.raiseHand(dev, cls, 'bathroom');
  assert.ok((await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'notNow', studentId: dev.id } })).json.ok);
  assert.equal(HV.mineOf(cls, dev.id).hand, '');
  HV.raiseHand(dev, cls, 'bathroom'); await give(dev);
  assert.equal(HV.mineOf(cls, dev.id).pass, 'line');
  HV.lowerHand(dev, cls);
  assert.equal(HV.mineOf(cls, dev.id).pass, '', 'tapping again leaves the line');
  // a student can only say they are back for themselves; the class's teachers only answer
  assert.equal((await as(ava)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'back', studentId: cleo.id } })).status, 404);
  assert.equal((await as(other)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'back', studentId: cleo.id } })).status, 404);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'pass', studentId: otherKid.id } })).json.code, 'notInClass');
  as(rivera)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'minutes', minutes: 5 } });
});

// ---------------------------------------------------------------- the teacher's desk settings and the look panel
test('lock, hide cursor, coming over: the class\'s teachers set them; only that student sees them; look at a desk', async () => {
  live('end'); live('start');
  const set = (who, body) => as(who)(`/api/homeroom/${cls.id}/desk-flag`, { body });
  assert.equal((await set(rivera, { studentId: ava.id, flag: 'lock', on: true })).json.flags.locked, true);
  assert.equal((await set(rivera, { studentId: ava.id, flag: 'coming', on: true })).json.flags.coming, true);
  assert.equal((await set(rivera, { studentId: ava.id, flag: 'dance', on: true })).json.code, 'badAction');
  assert.equal((await set(rivera, { studentId: otherKid.id, flag: 'lock', on: true })).json.code, 'notInClass');
  for (const u of [other, ava, otherKid, null]) assert.equal((await set(u, { studentId: ava.id, flag: 'lock', on: false })).status, 404, u ? u.username : 'signed out');
  const mine = (await as(ava)(`/api/desk/${cls.id}/state`)).json.me;
  assert.equal(mine.locked, true); assert.equal(mine.coming, true);
  const ben0 = (await as(ben)(`/api/desk/${cls.id}/state`)).json.me;
  assert.equal(ben0.locked, false); assert.equal(ben0.coming, false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='homeroom.desk' AND target=?", cls.id), 'locks are audited');
  // look at a desk: summary and the pad, the teacher only
  q.run('INSERT OR REPLACE INTO homeroom_doodles(class_id, user_id, strokes, updated_at) VALUES (?,?,?,?)', cls.id, ava.id, JSON.stringify([{ c: '#141414', pts: [{ x: 0.1, y: 0.1 }, { x: 0.5, y: 0.5 }] }]), Date.now());
  await as(ava)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk', idle: 3 } });
  const lk = await as(rivera)(`/api/homeroom/${cls.id}/look/${ava.id}`);
  assert.equal(lk.status, 200);
  assert.equal(lk.json.name, 'Ava Stone'); assert.equal(lk.json.strokes.length, 1); assert.equal(lk.json.flags.locked, true);
  assert.ok(lk.json.on && lk.json.on.title, 'what they are on');
  assert.ok(lk.json.at > 0);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/look/${otherKid.id}`)).status, 400);
  for (const u of [other, ben, null]) assert.equal((await as(u)(`/api/homeroom/${cls.id}/look/${ava.id}`)).status, 404);
  // not live: no settings
  live('end');
  assert.equal((await set(rivera, { studentId: ava.id, flag: 'lock', on: true })).json.code, 'notLive');
});

test('auth: the board\'s poll and hands are the class\'s teachers\'; a desk pulses and raises only its own', async () => {
  live('start');
  for (const u of [other, ava, otherKid, null]) {
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/pulse`)).status, 404, u ? u.username : 'signed out');
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/hands`, { body: { action: 'minutes', minutes: 6 } })).status, 404);
  }
  for (const u of [rivera, otherKid, null]) {
    assert.equal((await as(u)(`/api/desk/${cls.id}/pulse`, { body: { where: 'desk' } })).status, 404, u ? u.username : 'signed out');
    assert.equal((await as(u)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'question' } })).status, 404);
  }
  // a student's body can't name anyone else: their own row only
  await as(ben)(`/api/desk/${cls.id}/hand`, { body: { action: 'raise', kind: 'help', studentId: ava.id, userId: ava.id } });
  assert.equal(HV.mineOf(cls, ava.id).hand, ''); assert.equal(HV.mineOf(cls, ben.id).hand, 'help');
  assert.equal((await as(ben)(`/api/desk/${cls.id}/hand`, { body: { action: 'answer' } })).json.code, 'badAction');
});

// ---------------------------------------------------------------- cleaning up
test('End class wipes hands, passes, locks and pulses; a new live class starts clean; delete paths', async () => {
  live('end'); live('start');
  HV.raiseHand(ava, cls, 'question');
  HV.raiseHand(ben, cls, 'bathroom'); HV.teacherHands(rivera, cls, { action: 'pass', studentId: ben.id });
  HV.setFlag(rivera, cls, cleo.id, 'lock', true);
  HV.pulse(dev, cls, { where: 'desk', idle: 1 });
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_live WHERE class_id=?', cls.id).n, 3);
  const r = await as(rivera)(`/api/homeroom/${cls.id}/live`, { body: { action: 'end' } });
  assert.equal(r.status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_live WHERE class_id=?', cls.id).n, 0, 'End class');
  live('start');
  assert.equal(HV.liveView(cls).desks[dev.id].st, 'away', 'pulses went too');
  assert.equal(HV.mineOf(cls, cleo.id).locked, false);
  // a class left live past 6 hours: a new start clears what it left
  HV.raiseHand(ava, cls, 'help');
  q.run('UPDATE homeroom_rooms SET live_at=? WHERE class_id=?', Date.now() - H.LIVE_MAX_MS - 1000, cls.id);
  live('start');
  assert.equal(HV.mineOf(cls, ava.id).hand, '');
  // a student leaving the class: their row goes and the line moves on
  HV.raiseHand(ava, cls, 'bathroom'); HV.teacherHands(rivera, cls, { action: 'pass', studentId: ava.id });
  HV.raiseHand(dev, cls, 'bathroom'); HV.teacherHands(rivera, cls, { action: 'pass', studentId: dev.id });
  assert.equal(HV.mineOf(cls, dev.id).pass, 'line');
  S.removeFromClass(boss, cls.id, ava.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_live WHERE user_id=?', ava.id).n, 0);
  assert.equal(HV.mineOf(cls, dev.id).pass, 'out', 'the next in line got the pass');
  // an account deleted
  HV.raiseHand(ben, cls, 'question');
  assert.equal(deleteAccount(ben.id, boss, { by: 'admin', leaveSchools: true }).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_live WHERE user_id=?', ben.id).n, 0);
  // the school deleted: the class's rows go (homeroom_live is in BY_CLASS)
  assert.ok(SD.BY_CLASS.includes('homeroom_live'));
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0128_homeroom_live'"));
  assert.equal(H.roomOf(cls.id) && q.get('SELECT pass_minutes m FROM homeroom_rooms WHERE class_id=?', cls.id).m, 5);
});
