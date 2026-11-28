// A set game's progress on a lesson step (docs/decisions.md "Arithmetic Lab: audit 4 fixes"): BRB.setProgress after each
// question (Arithmetic Lab's problems) starts the step at the first one, keeps the best score so far labelled
// "part:3/5" (read as "3 of 5 answered"), and finishes the step once every question is answered, the end screen
// reached or not. The run's end after it (BRB.gameOver) replaces the part-way label. Also the class Progress page's
// empty states say what each student's row will show.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.PUBLIC_GAMES = '1';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const { deicon } = await import('../support/deicon.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const raw = await r.text(); let json = null; try { json = JSON.parse(raw); } catch { /* html */ }
  return { status: r.status, text: deicon(raw), json };
};

const boss = createUser({ username: 'PartBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Parts' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 5B' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const leo = S.createSchoolAccount(ana, oak.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(ana, cls.id, leo.id);
const g = games.createGame(boss.id, { title: 'Sets of five' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p>', { createdBy: boss.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
const lesson = L.createLesson(ana, oak.id, { title: 'Five problems' }).lesson;
const step = L.addStep(ana, lesson.id, { kind: 'game', gameId: g.id, body: 'Play it' }).step;
const cl = L.assign(ana, cls.id, lesson.id, {}).classLesson;
const pal = S.createSchoolAccount(ana, oak.id, { rosterName: 'Pal Pupil' }).user; S.addToClass(ana, cls.id, pal.id);
const send = (who, body) => as(who)(`/api/progress/${cl.id}/${step.id}/game`, { method: 'POST', body });
const row = who => P.get(cl.id, step.id, who.id);

test('the first answered problem starts the step, with the score so far; it is not done until every one is answered', async () => {
  assert.equal(row(mia), null, 'nothing yet');
  assert.equal((await send(mia, { event: 'progress', done: 1, total: 5, score: 1, label: 'fixes:2' })).status, 200);
  assert.deepEqual([row(mia).status, row(mia).score, row(mia).label], ['started', 1, 'part:1/5 fixes:2']);
  await send(mia, { event: 'progress', done: 2, total: 5, score: 1, label: 'fixes:3' });
  assert.equal(row(mia).label, 'part:2/5 fixes:3', 'the same score further on: the newer part');
  await send(mia, { event: 'progress', done: 4, total: 5, score: 4 });
  assert.deepEqual([row(mia).status, row(mia).score, row(mia).label], ['started', 4, 'part:4/5']);
  // the last problem answered, and the student leaves before See the score
  await send(mia, { event: 'progress', done: 5, total: 5, score: 5 });
  assert.equal(row(mia).status, 'done', 'every problem answered: done, end screen or not');
  assert.deepEqual([row(mia).score, row(mia).label], [5, '']);
});

test('the end after the last problem, with the same score, takes the place of the part-way label', async () => {
  await send(leo, { event: 'progress', done: 4, total: 5, score: 3, label: 'fixes:1' });
  await send(leo, { event: 'progress', done: 5, total: 5, score: 3, label: 'fixes:1' });
  assert.deepEqual([row(leo).status, row(leo).score, row(leo).label], ['done', 3, 'fixes:1']);
  // See the score: BRB.gameOver's end and score after it change nothing
  await send(leo, { event: 'end', score: 3, won: true });
  await send(leo, { event: 'score', score: 3, label: 'fixes:1' });
  assert.deepEqual([row(leo).status, row(leo).score, row(leo).label], ['done', 3, 'fixes:1']);
  // a later run part way with a lower or equal score never replaces the finished one
  await send(leo, { event: 'progress', done: 2, total: 5, score: 2 });
  await send(leo, { event: 'progress', done: 3, total: 5, score: 3 });
  assert.deepEqual([row(leo).status, row(leo).score, row(leo).label], ['done', 3, 'fixes:1']);
  // a better one part way is the best so far (still done)
  await send(leo, { event: 'progress', done: 4, total: 5, score: 4 });
  assert.deepEqual([row(leo).status, row(leo).score, row(leo).label], ['done', 4, 'part:4/5']);
  // and an end with the same score words it
  P.gameScore(leo, cl.id, step.id, 4, 'fixes:2');
  assert.equal(row(leo).label, 'fixes:2');
});

test('bad progress is refused; a step on another game, or not the student\'s, is not found', async () => {
  for (const body of [{ done: 6, total: 5, score: 1 }, { done: 1, total: 0, score: 1 }, { done: 1, total: 5, score: -1 }, { done: 'x', total: 5, score: 1 }, { done: 1, total: 501, score: 1 }])
    assert.equal((await send(mia, { event: 'progress', ...body })).status, 400, JSON.stringify(body));
  assert.equal(P.gameProgress(ana, cl.id, step.id, { done: 1, total: 5, score: 1 }).ok, false, 'the teacher is not a student of it');
  assert.equal(P.gameProgress(mia, cl.id, 'nope', { done: 1, total: 5, score: 1 }).ok, false, 'not a step of it');
  // done 0 (nothing answered yet) only starts the row
  assert.equal(P.gameProgress(pal, cl.id, step.id, { done: 0, total: 5, score: 0 }).ok, true);
  assert.deepEqual([row(pal).status, row(pal).score, row(pal).label], ['started', null, '']);
});

test('the label reads "3 of 5 answered" (and its step fixes) on the class\'s lesson progress page, in the reader\'s language', async () => {
  const t = (k, o) => ({ 'progress.lesson.partDone': `${o.done} of ${o.total} answered`, 'progress.lesson.stepFixes': `${o.count} step fixes` })[k];
  assert.equal(P.scoreLabel(t, 'part:3/5'), '3 of 5 answered');
  assert.equal(P.scoreLabel(t, 'part:3/5 fixes:2'), '3 of 5 answered · 2 step fixes');
  assert.equal(P.scoreLabel(t, 'fixes:2'), '2 step fixes');
  assert.equal(P.scoreLabel(t, 'level 3'), 'level 3', 'a game\'s own words as they are');
  assert.ok(P.codedLabel('part:3/5') && P.codedLabel('fixes:2') && !P.codedLabel('part:x') && !P.codedLabel('won'));
  P.gameProgress(pal, cl.id, step.id, { done: 3, total: 5, score: 2, label: 'fixes:1' });
  const page = await as(ana)(`/class/${cls.id}/progress/${cl.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /3 of 5 answered · 1 step fix\b/);
  assert.doesNotMatch(page.text, /part:3\/5/, 'the code never shows');
  // every full language words it
  for (const loc of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const x = JSON.parse(fs.readFileSync(new URL(`../../server/i18n/locales/${loc}.json`, import.meta.url), 'utf8'));
    assert.match(x.progress.lesson.partDone, /\{done\}.*\{total\}|\{total\}.*\{done\}/, loc);
    assert.ok(x.progress.gradebook.emptyWhat && !/—/.test(x.progress.gradebook.emptyWhat), loc);
  }
});

test('the play page passes BRB.setProgress on to the lesson step; the SDK sends it', () => {
  const play = fs.readFileSync(new URL('../../public/js/play.js', import.meta.url), 'utf8');
  assert.match(play, /'brb:progress': m =>/);
  assert.match(play, /case 'brb:progress': lessonEvent\(\{ event: 'progress'/);
  const sdk = fs.readFileSync(new URL('../../public/sdk/brb-sdk.js', import.meta.url), 'utf8');
  assert.match(sdk, /setProgress: function \(p\)/);
  assert.match(sdk, /send\('brb:progress'/);
});

test('the class Progress page with nothing assigned, or no students, says what each student\'s row will show', async () => {
  const empty = S.createClass(ana, oak.id, { name: 'Ana empty' }).class;
  const a = await as(ana)(`/class/${empty.id}/progress`);
  assert.equal(a.status, 200);
  assert.match(a.text, /No (games|lessons) assigned yet/);
  assert.match(a.text, /class="small muted gb-empty-what">Once something is assigned and students join the class, each student gets a row here: how many steps of each assignment they’ve done/);
  L.assign(ana, empty.id, lesson.id, {});
  const b = await as(ana)(`/class/${empty.id}/progress`);
  assert.match(b.text, /No students yet/);
  assert.match(b.text, /gb-empty-what/);
});
