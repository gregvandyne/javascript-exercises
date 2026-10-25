// Progress (schools step 3): marking steps done, written answers and feedback, game scores and play time from a
// lesson, build steps (one game per student, hand-in), the gradebook and lesson progress pages, the CSV, and who
// can see or change what.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};
function liveGame(owner, visibility, title = 'G') {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id, g.id);
  return games.getGame(g.id);
}

const boss = createUser({ username: 'ProgBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Progress' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
const other = S.createClass(ben, oak.id, { name: 'Ben 5D' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const leo = S.createSchoolAccount(ana, oak.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(ana, cls.id, leo.id);
const zed = S.createSchoolAccount(ben, oak.id, { rosterName: 'Zed Pupil' }).user; S.addToClass(ben, other.id, zed.id);
const quiz = liveGame(boss, 'public', 'Fraction Quiz');
const lesson = L.createLesson(ana, oak.id, { title: 'Fractions day' }).lesson;
const read = L.addStep(ana, lesson.id, { kind: 'text', title: 'Read this', body: 'Halves and quarters.' }).step;
const play = L.addStep(ana, lesson.id, { kind: 'game', gameId: quiz.id, body: 'Play it' }).step;
const ask = L.addStep(ana, lesson.id, { kind: 'question', title: 'Explain', body: 'Why is 2/4 the same as 1/2?' }).step;
const build = L.addStep(ana, lesson.id, { kind: 'build', body: 'a quiz about halves' }).step;
const cl = L.assign(ana, cls.id, lesson.id, { dueAt: '2020-01-01' }).classLesson;
const future = L.createLesson(ana, oak.id, { title: 'Next term' }).lesson;
const futureStep = L.addStep(ana, future.id, { kind: 'text', body: 'Later.' }).step;

test('question steps need a question; read steps are marked done and can be undone', () => {
  assert.equal(L.addStep(ana, lesson.id, { kind: 'question', body: '' }).code, 'questionText');
  assert.ok(P.markDone(mia, cl.id, read.id).ok);
  assert.equal(P.get(cl.id, read.id, mia.id).status, 'done');
  assert.ok(P.markDone(mia, cl.id, read.id, false).ok);
  assert.equal(P.get(cl.id, read.id, mia.id).status, 'started');
  assert.ok(P.markDone(mia, cl.id, read.id).ok);
  assert.equal(P.markDone(mia, cl.id, ask.id).code, 'answerFirst', 'questions are done by answering');
});

test('only the class\'s students act on their own steps, and only once the lesson is open', () => {
  assert.equal(P.markDone(zed, cl.id, read.id).code, 'notFound', 'another class');
  assert.equal(P.markDone(ana, cl.id, read.id).code, 'notFound', 'teachers do not get progress');
  const later = L.assign(ana, cls.id, future.id, { opensAt: '2999-01-01' }).classLesson;
  assert.equal(P.markDone(mia, later.id, futureStep.id).code, 'notFound', 'not open yet');
  const otherLesson = L.createLesson(ana, oak.id, { title: 'Other' }).lesson;
  const st = L.addStep(ana, otherLesson.id, { kind: 'text', body: 'x' }).step;
  assert.equal(P.markDone(mia, cl.id, st.id).code, 'notFound', 'a step of a different lesson');
  L.unassign(ana, later.id);
});

test('answers: empty refused, changed answers go back to the teacher, feedback marks them read', () => {
  assert.equal(P.answer(mia, cl.id, ask.id, '   ').code, 'answerEmpty');
  assert.ok(P.answer(mia, cl.id, ask.id, 'Because two quarters make a half.').ok);
  let row = P.get(cl.id, ask.id, mia.id);
  assert.equal(row.status, 'done'); assert.equal(row.reviewed_at, null);
  assert.equal(P.review(ben, cl.id, ask.id, mia.id, 'nope').code, 'notFound', 'only this class\'s teachers');
  assert.ok(P.review(ana, cl.id, ask.id, mia.id, 'Great thinking!').ok);
  row = P.get(cl.id, ask.id, mia.id); assert.equal(row.feedback, 'Great thinking!'); assert.ok(row.reviewed_at);
  assert.ok(P.answer(mia, cl.id, ask.id, 'Because two quarters make a half.').ok, 'same answer again: unchanged');
  assert.ok(P.get(cl.id, ask.id, mia.id).reviewed_at, 'still read');
  assert.ok(P.answer(mia, cl.id, ask.id, 'Two quarters are one half.').ok);
  assert.equal(P.get(cl.id, ask.id, mia.id).reviewed_at, null, 'a changed answer is new again');
});

test('game steps: plays, time (2 minutes = done), best score kept, a finished game counts', () => {
  P.gameStarted(leo, cl.id, play.id); P.gameStarted(leo, cl.id, play.id);
  assert.equal(P.get(cl.id, play.id, leo.id).plays, 2);
  for (let i = 0; i < 3; i++) P.gameTime(leo, cl.id, play.id, 30);
  assert.equal(P.get(cl.id, play.id, leo.id).status, 'started');
  P.gameTime(leo, cl.id, play.id, 30);
  assert.equal(P.get(cl.id, play.id, leo.id).status, 'done', '120 seconds');
  P.gameTime(leo, cl.id, play.id, 5000);
  assert.equal(P.get(cl.id, play.id, leo.id).seconds, 180, 'at most 60 seconds per report');
  P.gameScore(mia, cl.id, play.id, 50); P.gameScore(mia, cl.id, play.id, 20);
  assert.equal(P.get(cl.id, play.id, mia.id).score, 50, 'best score kept');
  assert.equal(P.get(cl.id, play.id, mia.id).status, 'done');
  assert.equal(P.gameScore(mia, cl.id, read.id, 5).code, 'notFound', 'scores only on game steps');
});

test('gradebook and lesson progress: counts, late, answers to review; removing keeps work, assigning again brings it back', () => {
  const gb = P.classProgress(cls.id);
  assert.equal(gb.lessons.length, 1);
  const miaRow = gb.students.find(p => p.id === mia.id), leoRow = gb.students.find(p => p.id === leo.id);
  assert.deepEqual([miaRow.cells[0].done, miaRow.cells[0].total], [3, 4], 'read, game, answer');
  assert.equal(miaRow.cells[0].late, true, 'due in 2020, not done');
  assert.equal(miaRow.cells[0].toRead, 1);
  assert.equal(leoRow.cells[0].done, 1);
  assert.equal(gb.toRead, 1);
  assert.deepEqual(P.toReadByClass([cls.id, other.id]), { [cls.id]: 1 });
  const lp = P.lessonProgress(cl.id);
  assert.deepEqual(lp.steps.map(s => s.kind), ['text', 'game', 'question', 'build']);
  assert.equal(lp.students.find(p => p.id === mia.id).cells[1].score, 50);
  // a lesson is in a class only once
  assert.equal(L.assign(ana, cls.id, lesson.id).code, 'alreadyAssigned');
  // removing it keeps the work; the class no longer shows it; assigning it again brings it back
  const extra = L.createLesson(ana, oak.id, { title: 'Extra' }).lesson;
  const extraStep = L.addStep(ana, extra.id, { kind: 'text', body: 'Extra reading.' }).step;
  const tmp = L.assign(ana, cls.id, extra.id).classLesson;
  P.markDone(mia, tmp.id, extraStep.id);
  L.unassign(ana, tmp.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM step_progress WHERE class_lesson_id=?', tmp.id).n, 1, 'work kept');
  assert.equal(L.getClassLesson(tmp.id), null, 'removed from the class');
  assert.ok(!P.classProgress(cls.id).lessons.some(l => l.id === tmp.id));
  assert.equal(P.markDone(mia, tmp.id, extraStep.id).code, 'notFound', 'no more work on a removed lesson');
  const back = L.assign(ana, cls.id, extra.id);
  assert.equal(back.restored, true); assert.equal(back.classLesson.id, tmp.id);
  assert.equal(P.get(tmp.id, extraStep.id, mia.id).status, 'done', 'the work is back');
  // lessons that haven't opened are locked: never late, and not in the overall figure
  assert.ok(!P.classProgress(cls.id).lessons.some(l => l.lesson_id === future.id), 'the not-open lesson was removed earlier');
  const soon = L.assign(ana, cls.id, future.id, { opensAt: '2999-01-01', dueAt: '2000-01-01' });
  assert.equal(soon.restored, true);
  const later = soon.classLesson;
  const gb3 = P.classProgress(cls.id); const fi = gb3.lessons.findIndex(l => l.id === later.id);
  const mia3 = gb3.students.find(p => p.id === mia.id);
  assert.equal(mia3.cells[fi].locked, true); assert.equal(mia3.cells[fi].late, false);
  assert.equal(P.overall(mia3.cells), P.overall(mia3.cells.filter((x, i) => i !== fi)), 'locked lessons are left out');
  L.unassign(ana, later.id);
  // due today is not late; 'today' is the (UTC) due day; late only once the due day is over everywhere
  const day = Date.UTC(2026, 0, 10);
  assert.equal(L.dueState({ due_at: day }, day + 3600e3), 'today');
  assert.equal(L.dueState({ due_at: day }, day + 23 * 3600e3), 'today');
  assert.equal(L.dueState({ due_at: day }, day + 30 * 3600e3), 'due', 'the day after: past due, not late yet');
  assert.equal(L.dueState({ due_at: day }, day + 37 * 3600e3), 'late');
  assert.equal(L.dueState({ due_at: day }, day - 1), 'upcoming');
  assert.equal(L.dueState({ due_at: null }), null);
});

test('pages and APIs: student lesson page, answers, gradebook, lesson progress, CSV, feedback, play page', async () => {
  const kid = as(mia), teacher = as(ana), stranger = as(ben);
  let r = await kid(`/class/${cls.id}/lessons/${cl.id}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /Two quarters are one half\./, 'my answer is in the box');
  assert.match(r.text, new RegExp(`/play/${quiz.slug}\\?lesson=${cl.id}&(amp;)?step=${play.id}`), 'play link carries the lesson');
  assert.match(r.text, /lessonprogress/);
  r = await kid(`/api/progress/${cl.id}/${ask.id}/answer`, { method: 'POST', body: { answer: '' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'answer');
  r = await kid(`/api/progress/${cl.id}/${read.id}/done`, { method: 'POST', body: { done: '0' } });
  assert.equal(r.status, 200); assert.equal(P.get(cl.id, read.id, mia.id).status, 'started');
  await kid(`/api/progress/${cl.id}/${read.id}/done`, { method: 'POST', body: { done: '1' } });

  r = await teacher(`/class/${cls.id}/progress`);
  assert.equal(r.status, 200); assert.match(r.text, /Mia Pupil/); assert.match(r.text, /Leo Pupil/); assert.match(r.text, /Fractions day/);
  assert.match(r.text, /id="to-review"/, 'answers to review are listed');
  assert.match(r.text, new RegExp(`href="/class/${cls.id}/progress/${cl.id}#answers"`), 'each lesson with answers to review links to them');
  assert.match(r.text, new RegExp(`href="/class/${cls.id}/progress/${cl.id}#a-${ask.id}-${mia.id}"`), 'the cell goes to the student\'s first new answer');
  assert.equal((await stranger(`/class/${cls.id}/progress`)).status, 404);
  assert.equal((await kid(`/class/${cls.id}/progress`)).status, 404);

  r = await teacher(`/class/${cls.id}/progress.csv`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const lines = r.text.replace(/^﻿/, '').trim().split(/\r\n/);
  assert.equal(lines.length, 3, 'header + 2 students');
  assert.ok(lines.some(x => x.startsWith('Mia Pupil,') && x.includes('3/4')));
  const miaOverall = P.classProgress(cls.id).students.find(p => p.id === mia.id).overall;
  assert.ok(lines.find(x => x.startsWith('Mia Pupil,')).endsWith(`,${miaOverall}%`), 'the CSV Overall is the page\'s Overall');

  r = await teacher(`/class/${cls.id}/progress/${cl.id}`);
  assert.equal(r.status, 200); assert.match(r.text, /Two quarters are one half\./); assert.match(r.text, /Why is 2\/4 the same as 1\/2\?/);
  assert.match(r.text, /class="tabs classtabs"/, 'the class tabs stay on top');
  assert.match(r.text, /<h2 dir="auto">Fractions day<\/h2>/);
  assert.match(r.text, new RegExp(`id="a-${ask.id}-${mia.id}"`), 'answer cards carry the id the gradebook links to');
  r = await teacher(`/class/${cls.id}/lessons/${cl.id}`);
  assert.equal(r.status, 200, 'the student view, for the teacher');
  assert.match(r.text, new RegExp(`href="/play/${quiz.slug}"`), 'a plain Play link for the teacher');
  assert.doesNotMatch(r.text, /\?lesson=/, 'nothing the teacher plays is recorded');
  assert.match(r.text, new RegExp(`href="/class/${cls.id}/progress/${cl.id}"`), 'a link to the lesson\'s progress');
  assert.doesNotMatch(r.text, /answerform|\/done"/, 'no buttons that save work');
  r = await teacher(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { feedback: 'Spot on.' } });
  assert.equal(r.status, 200);
  r = await kid(`/class/${cls.id}/lessons/${cl.id}`);
  assert.match(r.text, /Spot on\./, 'the student sees the feedback');
  assert.equal((await stranger(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { feedback: 'x' } })).status, 404);

  r = await kid(`/play/${quiz.slug}?lesson=${cl.id}&step=${play.id}`);
  assert.equal(r.status, 200);
  assert.match(r.text, new RegExp(`"lesson":\\{"cl":"${cl.id}","step":"${play.id}"`), 'the play page knows the lesson step');
  assert.match(r.text, new RegExp(`href="/class/${cls.id}/lessons/${cl.id}"`), 'back goes to the lesson');
  r = await as(zed)(`/play/${quiz.slug}?lesson=${cl.id}&step=${play.id}`);
  assert.match(r.text, /"lesson":null/, 'not for students of other classes');
  r = await kid(`/api/progress/${cl.id}/${play.id}/game`, { method: 'POST', body: { event: 'score', score: 99 } });
  assert.equal(r.status, 200); assert.equal(P.get(cl.id, play.id, mia.id).score, 99);
});

test('removed lessons leave the gradebook, the CSV and the student\'s lessons; lessons not open yet are greyed out', async () => {
  const kid = as(mia), teacher = as(ana);
  const gone = L.createLesson(ana, oak.id, { title: 'Gone soon' }).lesson;
  const goneStep = L.addStep(ana, gone.id, { kind: 'text', body: 'Bye.' }).step;
  const gcl = L.assign(ana, cls.id, gone.id).classLesson;
  assert.ok(P.markDone(mia, gcl.id, goneStep.id).ok);
  assert.match((await kid(`/class/${cls.id}`)).text, /Gone soon/, 'listed while assigned');
  L.unassign(ana, gcl.id);
  let r = await teacher(`/class/${cls.id}/progress`);
  assert.equal(r.status, 200); assert.doesNotMatch(r.text, /Gone soon/, 'not in the gradebook');
  r = await teacher(`/class/${cls.id}/progress.csv`);
  assert.doesNotMatch(r.text, /Gone soon/, 'not in the CSV');
  r = await kid(`/class/${cls.id}`);
  assert.equal(r.status, 200); assert.match(r.text, /Fractions day/); assert.doesNotMatch(r.text, /Gone soon/, 'not in the student\'s lessons');
  assert.equal((await kid(`/class/${cls.id}/lessons/${gcl.id}`)).status, 404);
  assert.equal((await teacher(`/class/${cls.id}/progress/${gcl.id}`)).status, 404);
  assert.equal((await teacher(`/class/${cls.id}/lessons/${gcl.id}`)).status, 404);
  assert.equal(P.get(gcl.id, goneStep.id, mia.id).status, 'done', 'the work is kept');

  // a lesson that opens later: greyed out with '–', and Overall (page and CSV) leaves it out
  const soon = L.assign(ana, cls.id, gone.id, { opensAt: '2999-01-01' }).classLesson;
  assert.equal(soon.id, gcl.id, 'assigning again brings the old one back');
  r = await teacher(`/class/${cls.id}/progress`);
  assert.match(r.text, /Gone soon/); assert.match(r.text, /class="gb-locked"/);
  const gb = P.classProgress(cls.id), col = gb.lessons.findIndex(l => l.id === soon.id);
  const row = gb.students.find(p => p.id === mia.id);
  assert.equal(row.cells[col].locked, true); assert.equal(row.cells[col].done, 1, 'their earlier work is still counted in the cell');
  r = await teacher(`/class/${cls.id}/progress.csv`);
  const [head, ...rows] = r.text.replace(/^﻿/, '').trim().split(/\r\n/);
  const at = head.split(',').indexOf('Gone soon'); assert.ok(at > 1);
  const csvMia = rows.find(x => x.startsWith('Mia Pupil,')).split(',');
  assert.equal(csvMia[at], '–', 'not open yet');
  assert.equal(csvMia[csvMia.length - 1], `${row.overall}%`);
  assert.equal(row.overall, P.overall(row.cells.filter((x, i) => i !== col)), 'left out of Overall');
  assert.doesNotMatch((await kid(`/class/${cls.id}`)).text, /Gone soon/, 'students don\'t see it before it opens');
  L.unassign(ana, soon.id);

  // only answers to question steps wait for review: a question changed to another type can't keep a count going
  const quick = L.createLesson(ana, oak.id, { title: 'Quick question' }).lesson;
  const qs = L.addStep(ana, quick.id, { kind: 'question', body: 'Why?' }).step;
  const qcl = L.assign(ana, cls.id, quick.id).classLesson;
  const waiting = () => P.toReadByClass([cls.id])[cls.id] || 0;
  const before = waiting();
  assert.ok(P.answer(mia, qcl.id, qs.id, 'Because.').ok);
  assert.equal(waiting(), before + 1);
  assert.equal(P.classProgress(cls.id).toRead, waiting(), 'the gradebook, the tab badge and My classes agree');
  assert.deepEqual(P.toReadByLesson(cls.id).find(r => r.cl === qcl.id), { cl: qcl.id, title: 'Quick question', n: 1 });
  assert.equal(P.firstNewAnswers(cls.id)[`${mia.id}:${qcl.id}`], qs.id);
  assert.ok(L.updateStep(ana, qs.id, { kind: 'text', body: 'Read why.' }).ok);
  assert.equal(waiting(), before);
  assert.equal(P.classProgress(cls.id).toRead, before);
  assert.ok(!P.toReadByLesson(cls.id).some(r => r.cl === qcl.id));
  assert.equal(P.firstNewAnswers(cls.id)[`${mia.id}:${qcl.id}`], undefined);
  assert.equal(P.lessonProgress(qcl.id).students.find(p => p.id === mia.id).toRead, 0);
  L.unassign(ana, qcl.id);
});

test('build steps: one Studio game per student, reopened after; hand-in needs a made game', async () => {
  const kid = as(leo);
  let r = await kid(`/api/progress/${cl.id}/${build.id}/hand-in`, { method: 'POST', body: {} });
  assert.equal(r.status, 400, 'nothing to hand in yet');
  r = await kid(`/api/progress/${cl.id}/${build.id}/build`, { method: 'POST', body: {} });
  assert.equal(r.status, 200); assert.match(r.json.redirect, /^\/studio\/[^?]+\?ask=a%20quiz%20about%20halves$/);
  const gameId = r.json.redirect.split('/')[2].split('?')[0];
  r = await kid(`/api/progress/${cl.id}/${build.id}/build`, { method: 'POST', body: {} });
  assert.equal(r.json.redirect, `/studio/${gameId}`, 'the same game, reopened');
  r = await kid(`/api/progress/${cl.id}/${build.id}/hand-in`, { method: 'POST', body: {} });
  assert.equal(r.status, 400, 'the game has nothing in it yet');
  assert.equal((await as(zed)(`/api/progress/${cl.id}/${build.id}/build`, { method: 'POST', body: {} })).status, 404);
});

test('review fixes: merged accounts keep their work, removed lessons stay out of every count, archived classes take no work, units, bringing lessons back', async () => {
  // A school account's lesson work moves with it when a join request is approved as "the same student".
  const card = S.createSchoolAccount(ana, oak.id, { rosterName: 'Nia Card' }).user; S.addToClass(ana, cls.id, card.id);
  assert.ok(P.answer(card, cl.id, ask.id, 'Two quarters make a half.').ok);
  const own = createUser({ username: 'NiaOwn', password: 'secret123' });
  assert.equal(S.requestJoin(own, cls.join_code).state, 'pending');
  const rid = S.pendingRequests(cls.id).find(r => r.user_id === own.id).id;
  assert.ok(S.approveRequest(ana, rid, { sameAs: card.id }).ok);
  assert.equal(P.forStudent(cl.id, own.id)[ask.id].answer, 'Two quarters make a half.');
  assert.equal(q.get('SELECT COUNT(*) n FROM step_progress WHERE user_id=?', card.id).n, 0);

  // A removed lesson leaves every count: the tab badge and My classes, the gradebook, the review list, the library, the editor.
  const rm = L.createLesson(ana, oak.id, { title: 'Removed later' }).lesson;
  const rq = L.addStep(ana, rm.id, { kind: 'question', body: 'What did you learn?' }).step;
  const rcl = L.assign(ana, cls.id, rm.id).classLesson;
  const waiting = () => P.toReadByClass([cls.id])[cls.id] || 0, before = waiting();
  assert.ok(P.answer(mia, rcl.id, rq.id, 'Lots.').ok); assert.equal(waiting(), before + 1);
  assert.ok(L.unassign(ana, rcl.id).ok);
  assert.equal(waiting(), before); assert.equal(P.classProgress(cls.id).toRead, before);
  assert.ok(!P.toReadByLesson(cls.id).some(x => x.cl === rcl.id));
  assert.equal(L.lessonsIn(ana.id, oak.id, null).find(l => l.id === rm.id).assigned, 0);
  assert.ok(!L.assignedClasses(rm.id).some(x => x.class_id === cls.id));
  // Bringing it back says whether work came back (only when students had some).
  assert.equal(L.assign(ana, cls.id, rm.id).workBack, true);
  const oops = L.createLesson(ana, oak.id, { title: 'Oops assigned' }).lesson; L.addStep(ana, oops.id, { kind: 'text', body: 'x' });
  L.unassign(ana, L.assign(ana, cls.id, oops.id).classLesson.id);
  const again = L.assign(ana, cls.id, oops.id); assert.equal(again.restored, true); assert.equal(again.workBack, false);

  // Answers from a student who moved to another class stop counting here.
  const kim = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kim Pupil' }).user; S.addToClass(ana, cls.id, kim.id);
  const exit = L.createLesson(ana, oak.id, { title: 'Exit ticket' }).lesson;
  const xq = L.addStep(ana, exit.id, { kind: 'question', body: 'One thing you learned?' }).step;
  const xcl = L.assign(ana, cls.id, exit.id).classLesson;
  const base = waiting();
  assert.ok(P.answer(kim, xcl.id, xq.id, 'Halves.').ok); assert.equal(waiting(), base + 1);
  assert.ok(S.moveStudent(ana, cls.id, other.id, kim.id).ok);
  assert.equal(waiting(), base); assert.equal(P.classProgress(cls.id).toRead, base);
  assert.ok(!P.toReadByLesson(cls.id).some(x => x.cl === xcl.id));

  // A co-teacher can bring back a colleague's lesson that was removed from the class (and only there).
  S.addToClass(ana, cls.id, ben.id, 'teacher');
  const benL = L.createLesson(ben, oak.id, { title: 'Ben lesson' }).lesson; L.addStep(ben, benL.id, { kind: 'text', body: 'y' });
  const bcl = L.assign(ben, cls.id, benL.id).classLesson; assert.ok(bcl);
  assert.ok(L.unassign(ana, bcl.id).ok);
  const tab = (await as(ana)(`/class/${cls.id}`)).text;
  assert.match(tab, /<optgroup label="Removed from this class"><option value="[^"]+">/); assert.match(tab, new RegExp(`<option value="${benL.id}">Ben lesson`));
  const third = S.createClass(ana, oak.id, { name: 'Ana 6A' }).class;
  assert.equal(L.assign(ana, third.id, benL.id).code, 'notFound', 'a colleague\'s lesson is still copied before it goes into a new class');
  assert.ok(L.assign(ana, cls.id, benL.id).ok, 'any teacher of the class can undo a removal');

  // An archived class takes no more work.
  const arc = S.createClass(ana, oak.id, { name: 'Ana Old' }).class; S.addToClass(ana, arc.id, leo.id);
  const acl = L.assign(ana, arc.id, lesson.id).classLesson;
  assert.ok(P.markDone(leo, acl.id, read.id).ok);
  S.archiveClass(ana, arc.id, true);
  assert.equal(P.markDone(leo, acl.id, read.id, false).code, 'notFound');
  assert.equal(P.answer(leo, acl.id, ask.id, 'A late answer').code, 'notFound');

  // Deleting a unit puts its lessons after the ones already outside a unit, so ↑/↓ moves the lesson you clicked.
  const uc = S.createClass(ana, oak.id, { name: 'Ana Units' }).class;
  const mk = title => { const l = L.createLesson(ana, oak.id, { title }).lesson; L.addStep(ana, l.id, { kind: 'text', body: title }); return l; };
  const [la, lb, lc, ld] = ['A1', 'B1', 'C1', 'D1'].map(mk);
  const unit = L.createUnit(ana, uc.id, 'U').unit;
  L.assign(ana, uc.id, la.id); L.assign(ana, uc.id, lb.id); L.assign(ana, uc.id, lc.id, { unitId: unit.id }); L.assign(ana, uc.id, ld.id, { unitId: unit.id });
  assert.ok(L.deleteUnit(ana, unit.id).ok);
  const order = () => L.classLessons(uc.id).map(x => x.title), row = title => L.classLessons(uc.id).find(x => x.title === title);
  assert.deepEqual(order(), ['A1', 'B1', 'C1', 'D1']);
  assert.ok(L.reorderAssignment(ana, row('C1').id, -1).ok);
  assert.deepEqual(order(), ['A1', 'C1', 'B1', 'D1']);
});
