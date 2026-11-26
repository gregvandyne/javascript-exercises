// Manipulatives tasks on the server (docs/decisions.md "Manipulatives: tasks you can practice and assign";
// services/manip-tasks.js, services/progress.js manipAnswer, services/homeroom-handouts.js handOutTask):
//   - who gets in: a student of a class whose teacher may use Manipulatives practices; one whose teacher may not, a 404;
//   - solo practice: the server's own check (never the page's word), the counts and the "right in a row" run;
//   - assigning: a 'manip' lesson for the class; each student their own stable, distinct questions; marks, hints, Next
//     after the last hint, score = % right first time, done; refused input; the gradebook and the Standards tab;
//   - Homeroom: a task handed out as a graded handout, the desk's card, the board's handout, the pulse as a tool, the
//     live board and the problem for watching desks (memory only), Needs a look's tries;
//   - deleting: an account takes its practice counts.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const SC = await import('../../server/services/scores.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const HT = await import('../../server/services/homeroom-tools.js');
const NL = await import('../../server/services/homeroom-look.js');
const PV = await import('../../server/services/homeroom-parents.js');
const M = await import('../../server/services/manipulatives.js');
const MT = await import('../../server/services/manip-tasks.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { variation } = await import('../../public/js/manip-tasks.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

const boss = createUser({ username: 'MtsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Task Service Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Park', role: 'teacher' }).user.id);
const other = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Hale', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const plain = S.createClass(boss, oak.id, { name: 'Room 10', teacherId: other.id }).class;
const kid = n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); return u; };
const [amy, bo, cy] = ['Amy', 'Bo', 'Cy'].map(kid);
for (const k of [amy, bo]) S.addToClass(boss, cls.id, k.id);
S.addToClass(boss, plain.id, cy.id);
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const T5 = 'rekenreks/show-7-the-5-way', TB = 'base-ten-blocks/build-and-read-2-048';
const sol = (id, seed) => { const v = variation(id, seed); return { v, work: JSON.parse(JSON.stringify(v.solution)) }; };

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.closeAllConnections(); server.close(); });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function as(u, p, body) {
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers: { cookie: cookieOf(u.id), 'content-type': 'application/json', origin: base }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
}

test('who gets in: a student whose teacher may use Manipulatives practices; another student does not', async () => {
  assert.equal(M.roleOf(amy), 'student');
  assert.equal(M.canPractice(cy), false);
  assert.equal(M.roleOf(cy), null);
  assert.equal((await as(amy, '/manipulatives')).status, 200);
  assert.equal((await as(cy, '/manipulatives')).status, 404);
  const st = (await as(amy, '/api/manipulatives/state')).json;
  assert.equal(st.role, 'student'); assert.deepEqual(st.practice, {});
});

test('solo practice: the server checks the work itself and keeps counts and the run', async () => {
  const { work } = sol(T5, 11);
  let r = await as(amy, '/api/manipulatives/practice/check', { task: T5, seed: 11, work, first: true });
  assert.equal(r.status, 200); assert.equal(r.json.correct, true); assert.deepEqual(r.json.progress, { solved: 1, tries: 1, streak: 1, best: 1 });
  // a page that says "right" without the board: wrong (the server's own check)
  r = await as(amy, '/api/manipulatives/practice/check', { task: T5, seed: 12, work: { box: String(sol(T5, 12).v.solution.box) }, first: true, correct: true });
  assert.equal(r.json.correct, false); assert.equal(r.json.partial, true);
  assert.match(r.json.feedback, /row/);
  assert.equal(r.json.progress.streak, 0);
  r = await as(amy, '/api/manipulatives/practice/check', { task: T5, seed: 12, work: sol(T5, 12).work, first: false });
  assert.equal(r.json.correct, true); assert.equal(r.json.progress.streak, 0, 'right on a second check keeps the run where it was');
  for (const s of [13, 14, 15]) r = await as(amy, '/api/manipulatives/practice/check', { task: T5, seed: s, work: sol(T5, s).work, first: true });
  assert.deepEqual(r.json.progress, { solved: 5, tries: 6, streak: 3, best: 3 });
  assert.deepEqual((await as(amy, '/api/manipulatives/state')).json.practice[T5], { solved: 5, tries: 6, streak: 3, best: 3 });
  // refused: an unknown or not-yet-practice task, a bad seed
  assert.equal((await as(amy, '/api/manipulatives/practice/check', { task: 'clock/elapsed-time', seed: 1, work: {} })).status, 404);
  assert.equal((await as(amy, '/api/manipulatives/practice/check', { task: T5, seed: 0, work: {} })).status, 400);
  // tolerant: commas and spaces in the box
  const b = sol(TB, 3);
  assert.equal(MT.practiceCheck(bo, { task: TB, seed: 3, work: { ...b.work, box: ` ${b.work.box.replace(/ \+ /g, '+')} ` }, first: true }).correct, true);
});

test('assigning from the Manipulatives page: a class lesson; each student their own stable, distinct questions', async () => {
  let r = await as(teacher, '/api/manipulatives/assign', { classId: cls.id, tasks: [T5, 'rekenreks/hidden-beads'], count: 3, dueAt: '2026-12-01' });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.n, 6); assert.match(r.json.toast, /Room 9/);
  const cl = L.getClassLesson(r.json.classLesson.id), step = q.get("SELECT * FROM lesson_steps WHERE lesson_id=? AND kind='manip'", cl.lesson_id);
  assert.equal(L.getLesson(cl.lesson_id).kind, 'manip');
  const a = MT.setFor(step, amy.id), b = MT.setFor(step, bo.id);
  assert.equal(a.length, 6); assert.deepEqual(MT.setFor(step, amy.id), a, 'the same questions every time');
  assert.notDeepEqual(a, b, 'a classmate gets others');
  assert.equal(new Set(a.slice(0, 3).map(x => variation(x.id, x.seed).prompt)).size, 3, 'distinct within the set');
  // refused input
  for (const [body, code] of [[{ classId: cls.id, tasks: [], count: 3 }, 'pickTask'], [{ classId: cls.id, tasks: [T5], count: 11 }, 'badCount'], [{ classId: cls.id, tasks: [T5, TB], count: 2 }, 'oneToolSet'],
    [{ classId: plain.id, tasks: [T5], count: 2 }, 'noClass'], [{ classId: cls.id, tasks: [T5], count: 2, dueAt: 'soon' }, 'badDate']]) {
    const x = await as(teacher, '/api/manipulatives/assign', body); assert.equal(x.json.code, code, JSON.stringify(body));
  }
  assert.equal((await as(amy, '/api/manipulatives/assign', { classId: cls.id, tasks: [T5], count: 2 })).status, 404);
  // the student's set: the server answers each action
  const api = `/api/manipulatives/set/${cl.id}/${step.id}`;
  let s = (await as(amy, api)).json;
  assert.deepEqual(s.items, a); assert.equal(s.marks, '------'); assert.match(s.back, new RegExp(`/lessons/${cl.id}$`));
  assert.equal((await as(bo, api)).json.items[0].seed, b[0].seed, 'Bo gets his own');
  assert.equal((await as(cy, api)).status, 404, 'not their class');
  // question 0: wrong, then a hint, then right: not right first time
  r = await as(amy, api, { i: 0, action: 'check', work: {} });
  assert.equal(r.json.correct, false); assert.equal(r.json.hint, 1); assert.equal(r.json.explain, false);
  r = await as(amy, api, { i: 0, action: 'next' }); assert.equal(r.json.code, 'notYet', 'Next only after every hint');
  r = await as(amy, api, { i: 0, action: 'hint' }); assert.equal(r.json.hint, 2);
  r = await as(amy, api, { i: 0, action: 'check', work: sol(a[0].id, a[0].seed).work });
  assert.equal(r.json.correct, true); assert.equal(r.json.marks, '0-----'); assert.equal(r.json.explain, true);
  assert.equal((await as(amy, api, { i: 0, action: 'check', work: {} })).json.code, 'answered');
  // question 1: every hint, then Next: not right
  for (let k = 0; k < 3; k++) r = await as(amy, api, { i: 1, action: 'check', work: {} });
  assert.equal(r.json.explain, true);
  r = await as(amy, api, { i: 1, action: 'next' }); assert.equal(r.json.marks, '00----');
  // the rest right first time
  for (let i = 2; i < 6; i++) r = await as(amy, api, { i, action: 'check', work: sol(a[i].id, a[i].seed).work });
  assert.equal(r.json.marks, '001111'); assert.equal(r.json.done, true); assert.equal(r.json.score, 67);
  const row = P.get(cl.id, step.id, amy.id); assert.equal(row.status, 'done'); assert.equal(row.label, 'manip');
  // the gradebook reads it like a quiz: 4 of 6
  const items = SC.classItems(cls.id).get(`${amy.id}:${cl.id}`);
  assert.deepEqual(items.map(x => [x.kind, x.earned, x.possible]), [['quiz', 4, 6]]);
  // marking it done by hand is refused (only answering finishes it)
  assert.equal(P.markDone(bo, cl.id, step.id).ok, false);
  // the student's lesson page has Start; the teacher's has Preview for each task
  assert.match((await as(bo, `/class/${cls.id}/lessons/${cl.id}`)).text, new RegExp(`/manipulatives#set/${cl.id}/${step.id}`));
  assert.match((await as(teacher, `/class/${cls.id}/lessons/${cl.id}`)).text, /\/manipulatives#practice\/rekenreks\/hidden-beads/);
});

test('Homeroom: a task handed out is a graded handout; the desk card opens the set; watching desks get the board and the problem', async () => {
  H.setLive(teacher, cls, 'start');
  assert.equal(HO.handOutTask(other, cls, { tasks: [T5], count: 5, to: { kind: 'all' } }).code, 'notFound');
  assert.equal(HO.handOutTask(teacher, cls, { tasks: [T5], count: 0, to: { kind: 'all' } }).code, 'badCount');
  const r = HO.handOutTask(teacher, cls, { tasks: [T5], count: 5, to: { kind: 'desk', id: bo.id }, grade: 'score', dueAt: '2026-12-02', dueTime: '15:00' });
  assert.ok(r.ok, r.code); assert.equal(r.n, 5);
  const bv = HO.boardView(cls), h = bv.handouts.find(x => x.id === r.classLesson.id);
  assert.deepEqual([h.manip.slug, h.manip.n, h.grade, h.students, h.icon], ['rekenreks', 5, 'score', 1, '🧮'.length ? h.icon : '']);
  assert.ok(h.due && h.dueMin === 900);
  assert.equal(HO.deskView(cls, amy).some(x => x.id === r.classLesson.id), false, 'only on Bo\'s desk');
  const card = HO.deskView(cls, bo).find(x => x.id === r.classLesson.id);
  assert.equal(card.manip, true); assert.equal(card.n, 5); assert.equal(card.tool, 'rekenreks'); assert.equal(card.pct, 0);
  assert.match(card.href, /^\/manipulatives#set\//);
  // the pulse counts it as a tool open in the player
  assert.ok(HV.pulse(bo, cls, { where: 'tool', on: r.classLesson.id }).ok);
  const lv = HV.liveView(cls, bv);
  assert.equal(lv.desks[bo.id].where, 'tool'); assert.equal(lv.desks[bo.id].tool.slug, 'rekenreks');
  // the live board and the problem (memory only), drawn by the board
  const step = q.get("SELECT s.* FROM lesson_steps s JOIN class_lessons cl ON cl.lesson_id=s.lesson_id WHERE cl.id=? AND s.kind='manip'", r.classLesson.id);
  const qs = MT.setFor(step, bo.id), v = variation(qs[0].id, qs[0].seed);
  assert.ok(MT.putLive(bo, r.classLesson.id, { state: v.setup, space: { w: 600, h: 300 }, i: 0, box: '2' }).ok);
  assert.equal(MT.putLive(amy, r.classLesson.id, { state: v.setup, i: 0 }).ok, false, 'not hers');
  const b = HT.boardsOf(cls, [bo.id]).get(bo.id);
  assert.equal(b.tool, 'rekenreks'); assert.equal(b.session, ''); assert.equal(b.prob.prompt, v.prompt); assert.equal(b.prob.box, '2'); assert.equal(b.prob.n, 5);
  assert.ok(HT.versionsOf(cls).get(bo.id));
  for (const t of q.all("SELECT name FROM sqlite_master WHERE type='table'")) {
    const cols = q.all(`PRAGMA table_info(${t.name})`).map(c => c.name);
    for (const c of cols) assert.equal(q.get(`SELECT COUNT(*) n FROM ${t.name} WHERE CAST(${c} AS TEXT) LIKE ?`, `%${v.prompt.slice(0, 30)}%`).n, 0, `the problem is never stored (${t.name}.${c})`);
  }
  // Needs a look: three wrong checks in a row
  for (let k = 0; k < 3; k++) P.manipAnswer(bo, r.classLesson.id, step.id, 0, 'check', {});
  const look = NL.compute(cls).find(x => x.id === bo.id);
  assert.ok(look && look.reasons.some(x => x.rule === 'tries' && x.count === 3), JSON.stringify(look));
  const ok0 = P.manipAnswer(bo, r.classLesson.id, step.id, 0, 'check', sol(qs[0].id, qs[0].seed).work);
  assert.equal(ok0.correct, true, JSON.stringify(ok0));
  assert.equal(HO.deskView(cls, bo).find(x => x.id === r.classLesson.id).pct, 20);
  assert.ok(!(NL.compute(cls).find(x => x.id === bo.id) || { reasons: [] }).reasons.some(x => x.rule === 'tries'), 'a right answer ends the run');
  // finished: the score on the board's card and in the parents' view (the gradebook's figure)
  for (let i = 1; i < 5; i++) P.manipAnswer(bo, r.classLesson.id, step.id, i, 'check', sol(qs[i].id, qs[i].seed).work);
  const done = HO.boardView(cls).desks[bo.id].find(x => x.id === r.classLesson.id);
  assert.deepEqual([done.done, done.score], [true, 80]);
  const pv = PV.classView(bo, cls).handouts.find(x => x.id === r.classLesson.id);
  assert.ok(pv, 'the parents\' view lists it'); assert.equal(pv.grade, 'score'); assert.equal(pv.pct, 80);
  H.setLive(teacher, cls, 'end');
  HO.removeHandout(teacher, cls, r.classLesson.id);
});

test('the catalog lists each tool\'s practice tasks as lessons; the hand-out route takes a task', async () => {
  const page = (await as(teacher, `/class/${cls.id}/homeroom`)).text;
  assert.match(page, /data-hritem="T:task:rekenreks\/show-7-the-5-way"/);
  assert.match(page, /Rekenreks: practice lessons/);
  const r = await as(teacher, `/api/homeroom/${cls.id}/handouts`, { task: T5, count: 4, to: { kind: 'all' }, grade: 'score' });
  assert.equal(r.status, 200, r.text); assert.match(r.json.toast, /Show 7 the 5-way/);
  const h = r.json.handouts.find(x => x.manip);
  assert.equal(h.manip.n, 4);
  const bad = await as(teacher, `/api/homeroom/${cls.id}/handouts`, { task: 'clock/elapsed-time', count: 4, to: { kind: 'all' } });
  assert.equal(bad.json.code, 'pickTask');
  HO.removeHandout(teacher, cls, h.id);
});

test('deleting an account takes its practice counts', () => {
  const kidAlone = createUser({ username: 'MtsAlone', password: 'secret123' });
  MT.practiceCheck(kidAlone, { task: T5, seed: 3, work: sol(T5, 3).work, first: true });
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_practice WHERE user_id=?', kidAlone.id).n, 1);
  const r = deleteAccount(kidAlone.id, boss, { by: 'admin', parentMade: false, leaveSchools: true });
  assert.ok(r.ok, r.code);
  assert.equal(q.get('SELECT COUNT(*) n FROM manip_practice WHERE user_id=?', kidAlone.id).n, 0);
});
