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
  const later = L.assign(ana, cls.id, lesson.id, { opensAt: '2999-01-01' }).classLesson;
  assert.equal(P.markDone(mia, later.id, read.id).code, 'notFound', 'not open yet');
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

test('gradebook and lesson progress: counts, overdue, answers to read; unassigning removes progress', () => {
  const gb = P.classProgress(cls.id);
  assert.equal(gb.lessons.length, 1);
  const miaRow = gb.students.find(p => p.id === mia.id), leoRow = gb.students.find(p => p.id === leo.id);
  assert.deepEqual([miaRow.cells[0].done, miaRow.cells[0].total], [3, 4], 'read, game, answer');
  assert.equal(miaRow.cells[0].overdue, true, 'due in 2020, not finished');
  assert.equal(miaRow.cells[0].toRead, 1);
  assert.equal(leoRow.cells[0].done, 1);
  assert.equal(gb.toRead, 1);
  assert.deepEqual(P.toReadByClass([cls.id, other.id]), { [cls.id]: 1 });
  const lp = P.lessonProgress(cl.id);
  assert.deepEqual(lp.steps.map(s => s.kind), ['text', 'game', 'question', 'build']);
  assert.equal(lp.students.find(p => p.id === mia.id).cells[1].score, 50);
  const tmp = L.assign(ana, cls.id, lesson.id).classLesson;
  P.markDone(mia, tmp.id, read.id);
  L.unassign(ana, tmp.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM step_progress WHERE class_lesson_id=?', tmp.id).n, 0);
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
  assert.equal((await stranger(`/class/${cls.id}/progress`)).status, 404);
  assert.equal((await kid(`/class/${cls.id}/progress`)).status, 404);

  r = await teacher(`/class/${cls.id}/progress.csv`);
  assert.equal(r.status, 200); assert.match(r.headers.get('content-type'), /text\/csv/);
  const lines = r.text.replace(/^﻿/, '').trim().split(/\r\n/);
  assert.equal(lines.length, 3, 'header + 2 students');
  assert.ok(lines.some(x => x.startsWith('Mia Pupil,') && x.includes('3/4')));

  r = await teacher(`/class/${cls.id}/progress/${cl.id}`);
  assert.equal(r.status, 200); assert.match(r.text, /Two quarters are one half\./); assert.match(r.text, /Why is 2\/4 the same as 1\/2\?/);
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
