// Assign to some students (docs/decisions.md "Assign to some students"): a class lesson goes to the whole class by
// default, or to the students a teacher ticks (class_lesson_students). The others don't see it on their class page or
// in To do, are refused by the progress API, and show "Not assigned" in the gradebook, its CSV and their own page,
// counted nowhere (Work done, Score, late). The list can change later; only the class's active students can be on it,
// and only the class's managers set it. Google Classroom: such a lesson is never posted, shared or announced there, and
// grades go only to the students on the list.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeClassroom } = await import('../support/fake-classroom.js');
const fake = await startFakeGoogle();
const room = await startFakeClassroom();
const KEY = 'b'.repeat(64); // a fake test key
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
process.env.GOOGLE_CLASSROOM = '1';
process.env.GOOGLE_TOKEN_KEY = KEY;
process.env.CLASSROOM_API_BASE = room.url;
const { config, parseTokenKey } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const GC = await import('../../server/services/gclassroom.js');
const { studentReport } = await import('../../server/services/student-report.js');
const { SCOPES } = await import('../../server/services/gclassroom-client.js');
const games = await import('../../server/services/games.js');

/** An official game to assign (published, as Oomba's games are; no seeding needed). */
const owner = createUser({ username: 'SomeOwner', password: 'owner-pass-12345', role: 'admin' });
const GAME = (() => {
  const g = games.createGame(owner.id, { title: 'Tally Tap' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', source='seed', published_version_id=? WHERE id=?", v.id, g.id);
  return games.getGame(g.id);
})();
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); await room.close(); });
const ON = { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true, googleTokenKey: parseTokenKey(KEY).key, classroomApiBase: room.url, googleClassroomScopes: 'full' };
test.beforeEach(() => { RL._reset(); Object.assign(config, ON); GC._forget(); });

const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0', 'sec-fetch-site': 'same-origin' };
const get = async (path, u) => { const r = await fetch(base + path, { headers: { ...H, cookie: cookieFor(u.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
const post = async (path, u, body = {}) => {
  const r = await fetch(base + path, { method: 'POST', redirect: 'manual', headers: { ...H, 'content-type': 'application/json', cookie: cookieFor(u.id) }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
};
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

/** A school: a teacher of class c (students Ann, Bea, Cal), a colleague who doesn't teach it, and class c2 with Dot. */
function school() {
  const admin = createUser({ username: uname('Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Some School ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
  const other = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Mx Other', role: 'teacher' }).user;
  const c = S.createClass(teacher, s.id, { name: 'Class 5C' }).class;
  const c2 = S.createClass(other, s.id, { name: 'Class 5D' }).class;
  const kid = name => S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name }).user;
  const ann = kid('Ann Alpha'), bea = kid('Bea Beta'), cal = kid('Cal Gamma'), dot = kid('Dot Delta');
  for (const k of [ann, bea, cal]) assert.ok(S.addToClass({ id: admin.id }, c.id, k.id, 'student').ok);
  assert.ok(S.addToClass({ id: admin.id }, c2.id, dot.id, 'student').ok);
  const lesson = (title, kinds = ['text', 'text']) => {
    const l = L.createLesson(teacher, s.id, { title }).lesson;
    const steps = kinds.map((k, i) => (k === 'quiz'
      ? L.addQuizStep(teacher, l.id, { title: 'Check', items: [{ q: '1+1?', choices: ['2', '3'], answer: 0 }, { q: '2+2?', choices: ['4', '5'], answer: 0 }] })
      : L.addStep(teacher, l.id, { kind: 'text', title: `Read ${i + 1}`, body: 'Words.' })).step);
    return { l, steps };
  };
  return { admin, s, teacher, other, c, c2, ann, bea, cal, dot, lesson };
}
/** The gradebook row for one student, as rendered: the <tr> that holds their roster name. */
const rowOf = (text, name) => { const i = text.indexOf(name); const from = text.lastIndexOf('<tr>', i); return text.slice(from, text.indexOf('</tr>', i)); };
const csvRow = (csv, name) => csv.split('\r\n').find(l => l.startsWith(name)) || '';

test('whole class by default: every student sees it, works on it and counts', async () => {
  const x = school();
  const { l, steps } = x.lesson('Whole class lesson');
  const r = await post(`/api/classes/${x.c.id}/lessons`, x.teacher, { lessonId: l.id });
  assert.equal(r.status, 200);
  const cl = L.classLessons(x.c.id).find(z => z.lesson_id === l.id);
  assert.deepEqual(L.studentsOfLesson(cl.id), [], 'no list: the whole class');
  assert.equal(cl.picked, 0);
  for (const k of [x.ann, x.bea, x.cal]) {
    assert.ok(L.assignedTo(cl.id, k.id));
    assert.match((await get(`/class/${x.c.id}`, k)).text, new RegExp(`href="/class/${x.c.id}/lessons/${cl.id}"`));
    assert.equal(P.toDoFor(x.c.id, k.id).length, 1);
  }
  assert.equal((await post(`/api/progress/${cl.id}/${steps[0].id}/done`, x.cal, {})).status, 200);
  const gb = P.classProgress(x.c.id);
  assert.ok(gb.students.every(p => !p.cells[0].na));
  assert.equal(P.lessonSummaries(x.c.id)[cl.id].students, 3);
  // The lesson page's Assign form offers Whole class, picked, and Some students with the class's roster names.
  const page = (await get(`/teach/lessons/${x.lesson('Not yet assigned').l.id}`, x.teacher)).text;
  assert.match(page, /<input type="radio" name="who" value="all" id="as-w-all" checked>/);
  assert.match(page, /name="who" value="some"/);
  assert.match(page, new RegExp(`<input type="checkbox" name="students" value="${x.ann.id}"`));
});

test('some students: only they see it, can work on it and count; the others get "Not assigned"', async () => {
  const x = school();
  const { l, steps } = x.lesson('Some students lesson', ['text', 'quiz']);
  const other = x.lesson('Everyone lesson');
  await post(`/api/classes/${x.c.id}/lessons`, x.teacher, { lessonId: other.l.id });
  const r = await post(`/api/lessons/${l.id}/assign`, x.teacher, { classId: x.c.id, who: 'some', students: [x.ann.id, x.bea.id] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const cl = L.classLessons(x.c.id).find(z => z.lesson_id === l.id);
  assert.deepEqual(L.studentsOfLesson(cl.id).sort(), [x.ann.id, x.bea.id].sort());
  assert.equal(cl.picked, 2);
  // Ann sees and works on it.
  assert.match((await get(`/class/${x.c.id}`, x.ann)).text, new RegExp(`href="/class/${x.c.id}/lessons/${cl.id}"`));
  assert.equal((await get(`/class/${x.c.id}/lessons/${cl.id}`, x.ann)).status, 200);
  assert.equal((await post(`/api/progress/${cl.id}/${steps[0].id}/done`, x.ann, {})).status, 200);
  // Cal doesn't: not on the class page, not in To do or the Class tab, the lesson page and its APIs are not found.
  const calPage = (await get(`/class/${x.c.id}`, x.cal)).text;
  assert.doesNotMatch(calPage, /Some students lesson/);
  assert.match(calPage, /Everyone lesson/, 'the whole-class lesson is still there');
  assert.deepEqual(P.toDoFor(x.c.id, x.cal.id).map(z => z.id), [L.classLessons(x.c.id).find(z => z.lesson_id === other.l.id).id]);
  assert.doesNotMatch((await get('/classes', x.cal)).text, /Some students lesson/);
  assert.equal((await get(`/class/${x.c.id}/lessons/${cl.id}`, x.cal)).status, 404);
  assert.equal((await post(`/api/progress/${cl.id}/${steps[0].id}/done`, x.cal, {})).status, 404);
  assert.equal((await post(`/api/progress/${cl.id}/${steps[0].id}/answer`, x.cal, { answer: 'hi' })).status, 404);
  assert.equal(P.context(x.cal, cl.id, steps[0].id).code, 'notFound');
  assert.equal(P.context(x.ann, cl.id, steps[0].id).ok, true);
  // The gradebook: Cal's cell is a neutral dash with "Not assigned" for screen readers; the column says "2 students".
  const gbPage = (await get(`/class/${x.c.id}/progress`, x.teacher)).text;
  const calRow = rowOf(gbPage, 'Cal Gamma');
  assert.match(calRow, /<td class="gb-na"><span aria-hidden="true">–<\/span><span class="sr-only">Not assigned<\/span><\/td>/);
  assert.doesNotMatch(rowOf(gbPage, 'Ann Alpha'), /class="gb-na"/);
  assert.match(gbPage, /2 students/);
  // CSV: "Not assigned" in Cal's column for it.
  const csv = (await get(`/class/${x.c.id}/progress.csv`, x.teacher)).text;
  const head = csv.replace(/^﻿/, '').split('\r\n')[0].split(',');
  const col = head.indexOf('Some students lesson');
  assert.ok(col > 0);
  assert.equal(csvRow(csv, 'Cal Gamma').split(',')[col], 'Not assigned');
  assert.equal(csvRow(csv, 'Ann Alpha').split(',')[col], '1/2');
  // Lessons tab: "2 students" and done of 2.
  const sums = P.lessonSummaries(x.c.id)[cl.id];
  assert.equal(sums.students, 2); assert.equal(sums.some, true);
  const tab = (await get(`/class/${x.c.id}?view=assigned`, x.teacher)).text;
  assert.match(tab, /2 students/);
  // The lesson's own progress page lists Ann and Bea only.
  const lp = (await get(`/class/${x.c.id}/progress/${cl.id}`, x.teacher)).text;
  assert.match(lp, /Ann Alpha/); assert.doesNotMatch(lp, /Cal Gamma/);
});

test('changing the students later: work by a student taken off stops counting; Whole class brings everyone back', async () => {
  const x = school();
  const { l, steps } = x.lesson('Later lesson', ['text', 'quiz']);
  await post(`/api/classes/${x.c.id}/lessons`, x.teacher, { lessonId: l.id, dueAt: '2020-01-01' });
  const cl = L.classLessons(x.c.id).find(z => z.lesson_id === l.id);
  // Cal did all the work (late, and a quiz scored 1 of 2) while it was for everyone.
  assert.ok(P.markDone(x.cal, cl.id, steps[0].id).ok);
  q.run(`INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, marks, started_at, done_at, updated_at) VALUES (?,?,?,?,?,?,?,?)`, cl.id, steps[1].id, x.cal.id, 'done', '10', Date.now(), Date.now(), Date.now());
  let cal = P.classProgress(x.c.id).students.find(p => p.id === x.cal.id);
  assert.equal(cal.overall, 100); assert.equal(cal.score.pct, 50); assert.equal(cal.lateCount, 1);
  // The ⋯ menu's form: Some students, Ann only.
  const menu = (await get(`/class/${x.c.id}?view=assigned`, x.teacher)).text;
  assert.match(menu, new RegExp(`data-api="/api/class-lessons/${cl.id}"[\\s\\S]*?name="who" value="some"`));
  const r = await post(`/api/class-lessons/${cl.id}`, x.teacher, { opensAt: '', dueAt: '2020-01-01', who: 'some', students: x.ann.id });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.deepEqual(L.studentsOfLesson(cl.id), [x.ann.id], 'one ticked box arrives as a string');
  cal = P.classProgress(x.c.id).students.find(p => p.id === x.cal.id);
  assert.equal(cal.cells[0].na, true);
  assert.equal(P.hasOpenWork(cal), false);
  assert.equal(cal.score, null, 'Score: nothing'); assert.equal(cal.lateCount, 0, 'late: nothing'); assert.equal(cal.overall, 0);
  const rep = studentReport(x.c.id, x.cal.id);
  assert.equal(rep.workDone, null); assert.equal(rep.score, null); assert.equal(rep.lateCount, 0);
  assert.match((await get(`/class/${x.c.id}/student/${x.cal.id}`, x.teacher)).text, /<span class="sr-only">Not assigned<\/span>/);
  const ann = P.classProgress(x.c.id).students.find(p => p.id === x.ann.id);
  assert.equal(ann.cells[0].na, undefined); assert.equal(ann.overall, 0, 'Ann has it and has not started: 0 %');
  assert.equal(ann.lateCount, 1, 'and she is late');
  // The ⋯ menu shows the list ticked now.
  const now = (await get(`/class/${x.c.id}?view=assigned`, x.teacher)).text;
  assert.match(now, new RegExp(`<input type="radio" name="who" value="some" id="w-${cl.id}-some" checked>`));
  assert.match(now, new RegExp(`<input type="checkbox" name="students" value="${x.ann.id}" checked>`));
  // Dates alone (an older form or the API) leave the list as it is.
  assert.equal((await post(`/api/class-lessons/${cl.id}`, x.teacher, { dueAt: '2020-01-02' })).status, 200);
  assert.deepEqual(L.studentsOfLesson(cl.id), [x.ann.id]);
  // Whole class again: Cal's work counts again, and he sees it.
  assert.equal((await post(`/api/class-lessons/${cl.id}`, x.teacher, { who: 'all' })).status, 200);
  assert.deepEqual(L.studentsOfLesson(cl.id), []);
  cal = P.classProgress(x.c.id).students.find(p => p.id === x.cal.id);
  assert.equal(cal.overall, 100); assert.equal(cal.score.pct, 50);
  assert.equal((await get(`/class/${x.c.id}/lessons/${cl.id}`, x.cal)).status, 200);
  // Removed and assigned again: for whoever the new assign says.
  assert.ok(L.setStudents(x.teacher, cl.id, [x.bea.id]).ok);
  assert.ok(L.unassign(x.teacher, cl.id).ok);
  const back = L.assign(x.teacher, x.c.id, l.id, {});
  assert.ok(back.ok && back.restored);
  assert.deepEqual(L.studentsOfLesson(cl.id), [], 'brought back for the whole class');
});

test('only the class\'s active students: outsiders and other classes\' students are refused, nothing is assigned', async () => {
  const x = school();
  const { l } = x.lesson('Refused lesson');
  for (const [students, why] of [[[x.ann.id, x.dot.id], 'another class'], [[x.teacher.id], 'a teacher'], [['nobody-here'], 'an unknown id'], [[x.admin.id], 'the admin']]) {
    const r = await post(`/api/lessons/${l.id}/assign`, x.teacher, { classId: x.c.id, who: 'some', students });
    assert.equal(r.status, 400, why); assert.match(r.json.error, /Only students in this class/);
  }
  const none = await post(`/api/lessons/${l.id}/assign`, x.teacher, { classId: x.c.id, who: 'some' });
  assert.equal(none.status, 400); assert.match(none.json.error, /at least one student/);
  assert.equal((await post(`/api/lessons/${l.id}/assign`, x.teacher, { classId: x.c.id, who: 'maybe' })).status, 400);
  assert.equal(L.classLessons(x.c.id).length, 0, 'nothing was assigned');
  // A student who left the class can't be picked either.
  assert.ok(L.assign(x.teacher, x.c.id, l.id, {}).ok);
  const cl = L.classLessons(x.c.id)[0];
  S.removeFromClass ? S.removeFromClass({ id: x.admin.id }, x.c.id, x.bea.id) : q.run("UPDATE class_members SET status='left' WHERE class_id=? AND user_id=?", x.c.id, x.bea.id);
  assert.equal(L.setStudents(x.teacher, cl.id, [x.bea.id]).code, 'notInClass');
  assert.equal((await post(`/api/class-lessons/${cl.id}`, x.teacher, { who: 'some', students: [x.dot.id] })).status, 400);
  assert.deepEqual(L.studentsOfLesson(cl.id), [], 'unchanged');
  // Assign a game with the same rule (the Assign page): a refused list leaves no lesson behind.
  const before = q.get('SELECT COUNT(*) n FROM lessons WHERE school_id=?', x.s.id).n;
  const g = await post('/api/teach/assign-game', x.teacher, { gameId: GAME.id, classId: x.c.id, who: 'some', students: [x.dot.id] });
  assert.equal(g.status, 400);
  assert.equal(q.get('SELECT COUNT(*) n FROM lessons WHERE school_id=?', x.s.id).n, before);
  const ok = await post('/api/teach/assign-game', x.teacher, { gameId: GAME.id, classId: x.c.id, who: 'some', students: [x.cal.id] });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const gcl = L.classLessons(x.c.id).find(z => z.kind === 'game');
  assert.deepEqual(L.studentsOfLesson(gcl.id), [x.cal.id]);
  assert.doesNotMatch((await get(`/class/${x.c.id}`, x.ann)).text, new RegExp(`/lessons/${gcl.id}"`));
  // The Assign page has the field after the due date, with each class's students.
  const page = (await get(`/teach/assign?id=${GAME.id}&class=${x.c.id}`, x.teacher)).text;
  assert.ok(page.indexOf('id="ag-d"') < page.indexOf('data-as-who'), 'after the due date');
  assert.match(page, new RegExp(`<div class="as-some" data-students-of="${x.c.id}" >`));
});

test('who may set it: the class\'s teachers and school admins; another teacher and students may not', async () => {
  const x = school();
  const { l } = x.lesson('Guarded lesson');
  assert.ok(L.assign(x.teacher, x.c.id, l.id, {}).ok);
  const cl = L.classLessons(x.c.id)[0];
  for (const who of [x.other, x.ann, x.dot]) {
    assert.equal((await post(`/api/class-lessons/${cl.id}`, who, { who: 'some', students: [x.ann.id] })).status, 404);
    assert.equal(L.setStudents(who, cl.id, [x.ann.id]).code, 'notFound');
  }
  assert.equal((await post(`/api/lessons/${l.id}/assign`, x.other, { classId: x.c.id, who: 'some', students: [x.ann.id] })).status, 404);
  assert.deepEqual(L.studentsOfLesson(cl.id), []);
  assert.ok(L.setStudents(x.admin, cl.id, [x.bea.id]).ok, 'a school admin may');
  assert.deepEqual(L.studentsOfLesson(cl.id), [x.bea.id]);
  // A teacher's rubric or review marks can't reach a student the lesson leaves out.
  assert.equal(P.review(x.teacher, cl.id, L.steps(l.id)[0].id, x.ann.id, 'Nice', { marks: [] }).code, 'notFound');
});

/** Connect the class's teacher to Google Classroom (one consent with the write scopes) and link a course. */
async function linked(x, students) {
  const cookie = cookieFor(x.teacher.id);
  const r = await fetch(`${base}/api/google-classroom/connect`, { method: 'POST', redirect: 'manual', headers: { ...H, 'content-type': 'application/json', cookie }, body: JSON.stringify({ back: x.c.id, write: '1' }) });
  const start = await fetch(base + (await r.json()).redirect, { redirect: 'manual', headers: { cookie } });
  const flow = (start.headers.getSetCookie().find(c => c.startsWith('brb_gflow=')) || '').split(';')[0];
  const to = new URL(start.headers.get('location'));
  assert.deepEqual(to.searchParams.get('scope').split(' ').sort(), ['openid', 'email', ...SCOPES].sort());
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', `t${crypto.randomBytes(4).toString('hex')}@dwes.test`);
  const cb = new URL((await fetch(to, { redirect: 'manual' })).headers.get('location'));
  await fetch(base + cb.pathname + cb.search, { redirect: 'manual', headers: { cookie: `${cookie}; ${flow}` } });
  assert.equal(GC.connectionState(x.teacher.id), 'ok');
  const id = room.addCourse({ name: `Course ${++n}`, students });
  assert.equal((await post(`/api/classes/${x.c.id}/google-classroom/link`, x.teacher, { courseId: id })).status, 200);
  return id;
}

test('Google Classroom: a lesson for some students is never posted, shared or announced; grades go only to them', async () => {
  const x = school();
  const subs = { [x.ann.id]: '500000000000000000001', [x.bea.id]: '500000000000000000002', [x.cal.id]: '500000000000000000003' };
  for (const [uid, sub] of Object.entries(subs)) q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', sub, uid, `${sub}@dwes.test`, 'dwes.test', Date.now());
  await linked(x, Object.values(subs).map((userId, i) => ({ userId, fullName: `Kid ${i}` })));
  const { l } = x.lesson('Some for Google');
  const calls = room.calls.length;
  // Assigned to some students with "Also post to Google Classroom": assigned here, not posted, and the toast says why.
  const r = await post(`/api/classes/${x.c.id}/lessons`, x.teacher, { lessonId: l.id, who: 'some', students: [x.ann.id], gcPost: '1' });
  assert.equal(r.status, 200);
  assert.match(r.json.toast, /assigned to some students, so it isn't posted to Google Classroom/);
  const cl = L.classLessons(x.c.id)[0];
  assert.equal(GC.postOf(cl.id), null);
  for (const kind of ['post', 'material']) {
    const p = await post(`/api/class-lessons/${cl.id}/google-classroom/${kind}`, x.teacher);
    assert.equal(p.status, 400); assert.equal(p.json.code, 'someStudents');
  }
  const ann = await post(`/api/classes/${x.c.id}/google-classroom/announce`, x.teacher, { template: 'lesson', clId: cl.id });
  assert.equal(ann.status, 400); assert.equal(ann.json.code, 'someStudents');
  assert.equal(room.calls.slice(calls).filter(c => c.method === 'POST').length, 0, 'nothing went to Google');
  const page = (await get(`/class/${x.c.id}/google-classroom`, x.teacher)).text;
  assert.match(page, /Assigned to some students, so not posted/);
  assert.doesNotMatch(page, new RegExp(`/api/class-lessons/${cl.id}/google-classroom/post`));
  assert.doesNotMatch(page, new RegExp(`<option value="${cl.id}">`), 'not offered for an announcement');
  // A whole-class lesson posted first, then narrowed to Ann and Bea: Cal's finished work sends no grade.
  const w = x.lesson('Whole then some');
  assert.ok(L.assign(x.teacher, x.c.id, w.l.id, {}).ok);
  const wcl = L.classLessons(x.c.id).find(z => z.lesson_id === w.l.id);
  assert.equal((await post(`/api/class-lessons/${wcl.id}/google-classroom/post`, x.teacher)).status, 200);
  for (const k of [x.ann, x.cal]) for (const s of w.steps) assert.ok(P.markDone(k, wcl.id, s.id).ok);
  assert.ok(L.setStudents(x.teacher, wcl.id, [x.ann.id, x.bea.id]).ok);
  const g = await post(`/api/class-lessons/${wcl.id}/google-classroom/grades`, x.teacher, { mode: 'draft' });
  assert.equal(g.status, 200, JSON.stringify(g.json));
  const cw = room.courseWork.get(GC.postOf(wcl.id).coursework_id);
  assert.equal(cw.submissions.find(z => z.userId === subs[x.ann.id]).draftGrade, 100);
  assert.equal(cw.submissions.find(z => z.userId === subs[x.cal.id]).draftGrade, undefined, 'Cal is not on the list');
  assert.deepEqual(q.all('SELECT user_id FROM gc_grades WHERE class_lesson_id=?', wcl.id).map(r => r.user_id), [x.ann.id]);
  assert.match((await get(`/class/${x.c.id}/google-classroom`, x.teacher)).text, /grades go only to the students it(?:'|&#39;|&#x27;)s assigned to/);
});

test('the class dashboard offers only whole-class lessons; the digest leaves a student out of lessons not theirs', async () => {
  const x = school();
  const DASH = await import('../../server/services/dash.js');
  const { l } = x.lesson('Dash some');
  const w = x.lesson('Dash all');
  assert.ok(L.assign(x.teacher, x.c.id, l.id, { students: [x.ann.id] }).ok);
  assert.ok(L.assign(x.teacher, x.c.id, w.l.id, {}).ok);
  assert.deepEqual(DASH.openLessons(x.c).map(z => z.title), ['Dash all']);
  const { classSummary } = await import('../../server/services/digest.js');
  // Only the some-students lesson open: Bea and Cal have nothing of their own to start.
  assert.ok(L.unassign(x.teacher, L.classLessons(x.c.id).find(z => z.lesson_id === w.l.id).id).ok);
  assert.equal(classSummary(S.getClass(x.c.id)).notStarted, 1, 'only Ann has not started');
});
