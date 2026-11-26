// Homeroom: QA fixes for Manipulatives in Homeroom (docs/decisions.md "Homeroom: QA fixes for Manipulatives in
// Homeroom"), on the server:
//   - B1: a tool handed out is on the board's desks (tools) and in look; a room the teacher ended (End session, another
//     room started) takes its tool off every desk and never opens again by itself, only one that ended by itself (12
//     hours); End class takes every tool off; the board says which tool's room runs (room) before a second is picked;
//   - M3: a class lesson assigned in Classroom (Assign from the Manipulatives page, a lesson of several steps) shows on
//     the student's desk and the teacher's board like a handout, never twice;
//   - M4: the watching desks' board of a practice set comes with its own problem and title, only while the desk's pulse
//     says that set is open: not after the player closes, nor for another set, nor once the set is done;
//   - Needs a look: three wrong checks in a row on a set assigned from the Manipulatives page; Today's per-student
//     questions (qs).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const HT = await import('../../server/services/homeroom-tools.js');
const LK = await import('../../server/services/homeroom-look.js');
const M = await import('../../server/services/manipulatives.js');
const MT = await import('../../server/services/manip-tasks.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: cookieFor(who.id) });

const boss = createUser({ username: 'HqaBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'QA Oak' }).school;
const lane = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(lane.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 3', teacherId: lane.id }).class;
const kid = n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); };
const [ada, ben] = ['Ada', 'Ben'].map(kid);
Object.assign(config, { homeroom: true, homeroomUsers: [lane.username.toLowerCase()], manipulativesUsers: [lane.username.toLowerCase()] });
const C = `/api/homeroom/${cls.id}`;
const deskCards = async who => (await as(who)(`/api/desk/${cls.id}/state`)).json.cards || [];

test('B1: a tool on the board and in look; ended by the teacher it comes off every desk and stays ended; End class takes tools off', async () => {
  const r = HT.handOutTool(lane, cls, { tool: 'rekenreks', to: { kind: 'all' }, instructions: 'Show 7.' });
  assert.ok(r.ok, r.code);
  // the board's view: the tool, and the room running in the class
  let bv = (await as(lane)(`${C}/handouts`)).json;
  assert.equal(bv.tools.length, 1); assert.equal(bv.tools[0].ids, null); assert.ok(bv.tools[0].open);
  assert.deepEqual({ ...bv.room, session: '' }, { session: '', tool: 'rekenreks', title: 'Rekenreks', icon: bv.room.icon, handout: r.item.id });
  // look: the tool is on the desk (not "Nothing on their desk yet"), and the one open now
  H.setLive(lane, cls, 'start');
  HV.pulse(ada, cls, { where: 'tool', on: r.item.id, idle: 1 });
  const lk = HV.lookAt(lane, cls, ada.id);
  assert.deepEqual(lk.tools.map(x => [x.title, x.now]), [['Rekenreks', true]]);
  assert.equal(lk.total, 0);
  // the teacher ends the room (End session in the room, as from look's Open the room): the tool comes off every desk
  assert.ok(M.end(lane, r.session.id).ok);
  bv = (await as(lane)(`${C}/handouts`)).json;
  assert.equal(bv.tools.length, 0); assert.equal(bv.room, null);
  assert.ok(!(await deskCards(ada)).some(x => x.tool), 'no card that opens an ended room');
  // reloading Homeroom never opens it again
  assert.equal((await as(lane)(`/class/${cls.id}/homeroom`)).status, 200);
  assert.equal(M.getSession(r.session.id).status, 'ended');
  assert.equal(HT.storedOf(cls.id).length, 0);
  // so another tool can be handed out
  const money = HT.handOutTool(lane, cls, { tool: 'money', to: { kind: 'all' } });
  assert.ok(money.ok, money.code);
  // a second tool while that room runs: refused, and the board's room says which one runs (the sheet shows it first)
  assert.equal(HT.handOutTool(lane, cls, { tool: 'clock', to: { kind: 'all' } }).code, 'oneTool');
  assert.equal(HT.roomOf(cls).tool, 'money');
  // another room started in the class (the Manipulatives page) ends Money's: Money comes off the desks too
  const other = M.createSession(lane, { classId: cls.id, tool: 'clock', title: 'Clock' });
  assert.ok(other.ok);
  assert.equal(HT.storedOf(cls.id).length, 0);
  // (QA round 2, N1) a room no handout uses never blocks: no room for the board, and the next tool hands out, ending it
  assert.equal(HT.roomOf(cls), null);
  const reken = HT.handOutTool(lane, cls, { tool: 'rekenreks', to: { kind: 'all' } });
  assert.ok(reken.ok, reken.code);
  assert.equal(M.getSession(other.session.id).status, 'ended');
  assert.equal(HT.roomOf(cls).tool, 'rekenreks');
  assert.ok(HT.removeTool(lane, cls, reken.item.id).ok);
  // a room that ended by itself (12 hours, nobody chose it) opens again when the teacher opens Homeroom
  const tiles = HT.handOutTool(lane, cls, { tool: 'color-tiles', to: { kind: 'all' } });
  q.run("UPDATE manip_sessions SET status='ended', opened_at=?, ended_at=? WHERE id=?", Date.now() - 13 * 3600e3, Date.now(), tiles.session.id);
  assert.equal(HT.storedOf(cls.id).length, 1, 'kept: it ended by itself');
  const card = (await deskCards(ada)).find(x => x.tool);
  assert.ok(card && !card.ready && !card.href, 'until then its card opens nothing');
  assert.equal((await as(lane)(`/class/${cls.id}/homeroom`)).status, 200);
  assert.equal(M.getSession(tiles.session.id).status, 'active');
  // End class takes every tool off every desk and ends its room
  H.setLive(lane, cls, 'end');
  assert.equal(HT.storedOf(cls.id).length, 0);
  assert.equal(M.getSession(tiles.session.id).status, 'ended');
  assert.ok(!(await deskCards(ada)).some(x => x.tool));
});

test('M3: a set assigned from the Manipulatives page is on the desk and the board like a handout, never twice', async () => {
  const a = MT.assign(lane, { classId: cls.id, tasks: ['clock/elapsed-time'], count: 2 });
  assert.ok(a.ok, a.code);
  const cards = await deskCards(ada), card = cards.find(x => x.id === a.classLesson.id);
  assert.ok(card, 'on the desk');
  assert.ok(card.manip && card.tool === 'clock' && card.ready && card.href.startsWith('/manipulatives#set/') && card.n === 2);
  const bv = HO.boardView(cls);
  const h = bv.handouts.find(x => x.id === a.classLesson.id);
  assert.ok(h && h.cls && h.manip && h.manip.slug === 'clock');
  assert.ok(bv.desks[ada.id].some(x => x.id === a.classLesson.id && x.qs && x.qs.n === 2));
  // a Homeroom handout of a task is one card (the handout), not two
  const ho = HO.handOutTask(lane, cls, { tasks: ['clock/elapsed-time'], count: 1, to: { kind: 'all' } });
  assert.ok(ho.ok);
  assert.equal((await deskCards(ada)).filter(x => x.id === ho.classLesson.id).length, 1);
  assert.equal(HO.boardView(cls).handouts.filter(x => x.id === ho.classLesson.id).length, 1);
  assert.ok(!HO.boardView(cls).handouts.find(x => x.id === ho.classLesson.id).cls);
  // a lesson of several steps assigned on the class page: a card that opens its lesson page, never the player
  const l = L.createLesson(lane, oak.id, { title: 'Fractions week' }).lesson;
  L.addStep(lane, l.id, { kind: 'text', title: 'Read this', body: 'Halves and quarters.' });
  L.addStep(lane, l.id, { kind: 'text', title: 'Then this', body: 'Thirds.' });
  const as2 = L.assign(lane, cls.id, l.id, {}); assert.ok(as2.ok, as2.code);
  const pc = (await deskCards(ben)).find(x => x.id === as2.classLesson.id);
  assert.ok(pc && pc.page && pc.n === 2 && pc.href === `/class/${cls.id}/lessons/${as2.classLesson.id}`);
  // the parents' view and the plan's counts keep to Homeroom handouts
  assert.ok(!HO.deskView(cls, ben, 'en', { assigned: false }).some(x => x.id === as2.classLesson.id));
  // removed in Classroom: gone from the desk
  assert.ok(L.unassign(lane, as2.classLesson.id).ok);
  assert.ok(!(await deskCards(ben)).some(x => x.id === as2.classLesson.id));
});

test('M4: a set\'s board comes with its own problem, only while that set is open; Needs a look from three wrong checks', async () => {
  H.setLive(lane, cls, 'start');
  const A = MT.assign(lane, { classId: cls.id, tasks: ['money/make-67-cents'], count: 2 });
  const B = MT.assign(lane, { classId: cls.id, tasks: ['pattern-blocks/cover-the-hexagon'], count: 2 });
  assert.ok(A.ok && B.ok);
  const board = { objects: [], pieces: [] };
  assert.ok(MT.putLive(ada, A.classLesson.id, { state: board, space: { w: 400, h: 300 }, i: 0 }).ok);
  const beat = sid => HV.beatOf(cls.id, sid);
  // the desk says set A is open: its board, its own title and question
  HV.pulse(ada, cls, { where: 'tool', on: A.classLesson.id, idle: 1 });
  let b = HT.boardsOf(cls, [ada.id], beat).get(ada.id);
  assert.ok(b && b.on === A.classLesson.id && b.tool === 'money' && b.title === A.title && b.prob.i === 0 && b.prob.n === 2 && b.prob.key.startsWith('money/'));
  // the desk moved to set B before B pushed a board: nothing (never A's board labeled as B), and A's board is forgotten
  HV.pulse(ada, cls, { where: 'tool', on: B.classLesson.id, idle: 1 });
  assert.equal(HT.boardsOf(cls, [ada.id], beat).get(ada.id), undefined);
  assert.equal(MT.liveOf(cls.id, [ada.id]).size, 0);
  // B's board, then the player closes: gone
  assert.ok(MT.putLive(ada, B.classLesson.id, { state: board, space: { w: 400, h: 300 }, i: 1 }).ok);
  b = HT.boardsOf(cls, [ada.id], beat).get(ada.id);
  assert.ok(b && b.tool === 'pattern-blocks' && b.prob.i === 1);
  HV.pulse(ada, cls, { where: 'desk', on: '', idle: 1 });
  assert.equal(HT.boardsOf(cls, [ada.id], beat).get(ada.id), undefined);
  // the board's poll: bcur names only desks with a board now (the page drops the others)
  const poll = (await as(lane)(`${C}/pulse?hv=&w=${ada.id}`)).json;
  assert.ok(!(ada.id in (poll.bcur || {})));
  // a finished set shows no board
  HV.pulse(ada, cls, { where: 'tool', on: A.classLesson.id, idle: 1 });
  assert.ok(MT.putLive(ada, A.classLesson.id, { state: board, space: { w: 400, h: 300 }, i: 0 }).ok);
  assert.ok(HT.boardsOf(cls, [ada.id], beat).get(ada.id));
  const step = q.get('SELECT * FROM lesson_steps WHERE lesson_id=?', A.lesson.id);
  q.run("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, started_at, updated_at) VALUES (?,?,?, 'done', ?, ?) ON CONFLICT DO UPDATE SET status='done'", A.classLesson.id, step.id, ada.id, Date.now(), Date.now());
  assert.equal(HT.boardsOf(cls, [ada.id], beat).get(ada.id), undefined);
  // Needs a look: three wrong checks in a row on set B (assigned from the Manipulatives page, not a Homeroom handout)
  const stepB = q.get('SELECT * FROM lesson_steps WHERE lesson_id=?', B.lesson.id);
  for (let k = 0; k < 3; k++) assert.ok(P.manipAnswer(ben, B.classLesson.id, stepB.id, 0, 'check', { board: {}, box: '', choice: null }).ok);
  const need = LK.compute(cls).find(x => x.id === ben.id);
  assert.ok(need && need.reasons.some(r => r.rule === 'tries' && r.on === B.classLesson.id && r.count === 3), JSON.stringify(need));
  H.setLive(lane, cls, 'end');
  assert.equal(MT.liveOf(cls.id, [ada.id]).size, 0, 'End class forgets the boards');
});
