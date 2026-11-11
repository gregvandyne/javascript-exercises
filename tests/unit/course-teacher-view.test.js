// Teacher course view (T1): a teacher can see course completion status, step progress and recorded check
// scores for the students in their own class — and only theirs. The panels live on the class gradebook
// (/class/:id/progress) and are built by courses.classCourseProgress on the shared course-progress layer
// (course_progress / course_bands via courses.states), so every registered course shows up, including
// one that joins the registry later.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const C = await import('../../server/services/courses.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { cookie: cookieFor(u.id), accept: 'text/html' }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };

const boss = createUser({ username: 'T1Boss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak T1' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const clsA = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
const clsB = S.createClass(ben, oak.id, { name: 'Ben 5D' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, clsA.id, mia.id);
const leo = S.createSchoolAccount(ana, oak.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(ana, clsA.id, leo.id);
const fin = S.createSchoolAccount(ana, oak.id, { rosterName: 'Fin Pupil' }).user; S.addToClass(ana, clsA.id, fin.id);
const zed = S.createSchoolAccount(ben, oak.id, { rosterName: 'Zed Pupil' }).user; S.addToClass(ben, clsB.id, zed.id);

const csq = C.getCourse('cs-quest'), cd = C.getCourse('cyber-defenders');
const completeStep = (user, course, step, score = 3) => { C.recordCheck(user, course, step, { score, passed: true }); if (step.game) C.markCompleted(user, course, step); };

test('audit baseline: before this build, no service or page exposed course progress to teachers', () => {
  // the gap this theme closes, stated as the starting fact: course_progress was read only by the
  // student-facing courses service and account deletion (no class-level reader existed)
  assert.equal(typeof C.classCourseProgress, 'function', 'the class-level reader is the new piece');
});

test('classCourseProgress: status, steps done and check scores per student, for both courses', () => {
  // Mia: CS Quest band 1b, two steps complete (scores 3 and 2), a third started (read only)
  C.setBand(mia, csq, '1b');
  const steps = C.steps(csq, '1b');
  completeStep(mia, csq, steps[0], 3);
  completeStep(mia, csq, steps[1], 2);
  C.markRead(mia, csq, steps[2]);
  // Fin: the whole CS Quest Explorer course complete
  C.setBand(fin, csq, '1b');
  for (const s of steps) completeStep(fin, csq, s, 3);
  // Zed (another class): Cyber Defenders band 2, one step complete
  C.setBand(zed, cd, '2');
  completeStep(zed, cd, C.steps(cd, '2')[0], 1);

  const rosterA = S.roster(clsA.id).filter(p => p.role === 'student');
  const rows = C.classCourseProgress(rosterA, csq);
  assert.deepEqual(rows.map(r => r.user.id), rosterA.map(p => p.id), 'exactly the students given, in order');
  const byId = new Map(rows.map(r => [r.user.id, r]));
  const m = byId.get(mia.id);
  assert.equal(m.status, 'in-progress'); assert.equal(m.done, 2); assert.equal(m.total, steps.length);
  assert.equal(m.score, 5, 'the recorded check scores add up (3 + 2)');
  assert.equal(m.maxScore, 3 * steps.filter(s => s.check && s.check.length).length, 'three per checked step');
  assert.equal(m.list.filter(s => s.complete).length, 2);
  assert.equal(m.list[2].complete, false); assert.ok(m.list[2].row, 'the started step shows as started');
  const f = byId.get(fin.id);
  assert.equal(f.status, 'completed'); assert.equal(f.done, f.total);
  const l = byId.get(leo.id);
  assert.equal(l.status, 'not-started'); assert.equal(l.done, 0); assert.equal(l.band, null, 'no band, no rows: nothing stored to show (the guest rule\u2019s shape)');
  assert.ok(!rows.some(r => r.user.id === zed.id), 'a student from another class is never in this class\u2019s rows');

  const cdRows = C.classCourseProgress([zed], cd);
  assert.equal(cdRows[0].status, 'in-progress'); assert.equal(cdRows[0].done, 1); assert.equal(cdRows[0].score, 1); assert.equal(cdRows[0].band, '2');
});

test('the gradebook page shows both course panels for the class\u2019s own teacher, with per-step dots', async () => {
  const r = await get(`/class/${clsA.id}/progress`, ana);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('CS Quest') && r.text.includes('Cyber Defenders'), 'one panel per registered course');
  assert.ok(r.text.includes('Mia Pupil') && r.text.includes('Leo Pupil') && r.text.includes('Fin Pupil'));
  assert.ok(!r.text.includes('Zed Pupil'), 'the other class\u2019s student is not on this page');
  assert.ok(r.text.includes('2/21') || r.text.includes('2/19'), 'Mia\u2019s steps-done count is shown');
  assert.ok(r.text.includes('Completed'), 'Fin\u2019s completed status is labelled');
  assert.ok(r.text.includes('In progress'), 'Mia\u2019s in-progress status is labelled');
});

test('the Teach area has Cyber Defenders: Learn and the lesson library link it and the page renders the program (teacher-1)', async () => {
  // My classes no longer lists courses ("My classes, simpler"): the lesson library's ready-made chips and Learn's course cards do (classroom-homes.test.js).
  const lib = await get('/teach/lessons', ana);
  assert.ok(lib.text.includes('href="/teach/cyber-defenders"'), 'the lesson library\'s ready-made chips');
  const r = await get('/teach/cyber-defenders', ana);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('Cyber Defenders'));
  assert.ok(r.text.includes('Packet Post') && r.text.includes('Trick Inbox') && r.text.includes('Escape the Post Office'), 'the four games are listed');
  assert.ok(r.text.includes('/courses/cyber-defenders'), 'it doors into the student course');
  assert.ok(r.text.includes('/teachers/cyber-defenders?print=1'), 'and into the printable standards map');
  const asStudent = await get('/teach/cyber-defenders', mia);
  assert.notEqual(asStudent.status, 200, 'students do not get the teach page');
  const asGuest = await fetch(base + '/teach/cyber-defenders', { redirect: 'manual' });
  assert.notEqual(asGuest.status, 200, 'signed-out visitors do not get it either');
});

test('privacy: a teacher cannot open another class\u2019s progress page at all', async () => {
  const asAna = await get(`/class/${clsB.id}/progress`, ana);
  assert.notEqual(asAna.status, 200, 'Ana does not teach Ben\u2019s class');
  assert.ok(!asAna.text.includes('Zed Pupil'), 'and Zed\u2019s course rows never leak through it');
  const asBen = await get(`/class/${clsA.id}/progress`, ben);
  assert.notEqual(asBen.status, 200);
  assert.ok(!asBen.text.includes('Mia Pupil'));
  const asStudent = await get(`/class/${clsA.id}/progress`, mia);
  assert.notEqual(asStudent.status, 200, 'students do not get the teacher view either');
});
