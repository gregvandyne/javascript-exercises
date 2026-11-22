// A game step's score from a set where the teacher showed an answer (Oomba Canvas 1.3.0, gameOver({ helped: true })):
// stored with the best score (migration 0090), cleared by an equal score without help, and marked "Teacher showed an
// answer" on the class's lesson progress page for its staff only; never on the student's own lesson page.
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
const { deicon } = await import('../support/deicon.js');  // icons read back as the emoji they stand for

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const raw = await r.text(), text = deicon(raw); let json = null; try { json = JSON.parse(raw, (k, v) => typeof v === 'string' ? deicon(v) : v); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HelpBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Helped' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 6A' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const g = games.createGame(boss.id, { title: 'Reading scales' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p>', { createdBy: boss.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
const lesson = L.createLesson(ana, oak.id, { title: 'Scales' }).lesson;
const play = L.addStep(ana, lesson.id, { kind: 'game', gameId: g.id, body: 'Play it' }).step;
const cl = L.assign(ana, cls.id, lesson.id, {}).classLesson;

test('migration 0090 adds step_progress.helped', () => {
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0090_step_progress_helped'"));
  assert.ok(q.all('PRAGMA table_info(step_progress)').some(c => c.name === 'helped'));
});
test('helped goes with the best score; an equal score without help clears it; older pages send no flag', async () => {
  const send = body => as(mia)(`/api/progress/${cl.id}/${play.id}/game`, { method: 'POST', body });
  assert.equal((await send({ event: 'end', score: 4, helped: true })).status, 200);
  assert.equal(P.get(cl.id, play.id, mia.id).helped, 1);
  await send({ event: 'score', score: 4, label: '', helped: true });
  assert.equal(P.get(cl.id, play.id, mia.id).helped, 1, 'the same set\'s score keeps the mark');
  await send({ event: 'end', score: 3 });
  assert.equal(P.get(cl.id, play.id, mia.id).helped, 1, 'a lower score changes nothing');
  await send({ event: 'end', score: 4, helped: 'yes' });
  assert.equal(P.get(cl.id, play.id, mia.id).helped, 0, 'an equal score without help (only true counts as help) clears it');
  await send({ event: 'end', score: 5, helped: true });
  assert.deepEqual([P.get(cl.id, play.id, mia.id).score, P.get(cl.id, play.id, mia.id).helped], [5, 1]);
});
test('the mark shows on the staff\'s lesson progress page, never on the student\'s own page', async () => {
  const staff = await as(ana)(`/class/${cls.id}/progress/${cl.id}`);
  assert.equal(staff.status, 200);
  assert.match(staff.text, /class="st-helped" title="Teacher showed an answer"/);
  assert.match(staff.text, /👀 Teacher showed an answer<\/span>/, 'and in the key');
  const own = await as(mia)(`/class/${cls.id}/lessons/${cl.id}`);
  assert.equal(own.status, 200);
  assert.doesNotMatch(own.text, /Teacher showed an answer|st-helped/);
  assert.equal((await as(mia)(`/class/${cls.id}/progress/${cl.id}`)).status, 404, 'students never see the progress page');
});
test('the class progress CSV has a column for answers the teacher showed, only for lessons where that happened', async () => {
  const csv = await as(ana)(`/class/${cls.id}/progress.csv`);
  assert.equal(csv.status, 200);
  const [head, row] = csv.text.replace(/^﻿/, '').trim().split('\r\n').map(l => l.split(','));
  const i = head.indexOf('Scales (answers shown by the teacher)');
  assert.ok(i > 0, 'the column is there');
  assert.equal(row[i], '1', 'one game score came after the teacher showed an answer');
  assert.equal(head.indexOf('Scales (answers shown by the teacher)'), head.length - 1, 'new columns go at the end');
  q.run('UPDATE step_progress SET helped=0');
  const none = await as(ana)(`/class/${cls.id}/progress.csv`);
  assert.doesNotMatch(none.text, /answers shown by the teacher/, 'no column when no answer was shown');
  q.run('UPDATE step_progress SET helped=1');
  assert.notEqual((await as(mia)(`/class/${cls.id}/progress.csv`)).status, 200, 'students never get the CSV');
});
