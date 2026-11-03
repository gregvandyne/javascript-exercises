// CS Quest class Standards tab (server/services/standards.js, routes in server/routes/cs-quest.js; plan 9.4, P12): on a
// temp database with a materialised lesson (csq-1b-1.2), a played game step, an answered question, scored exit tickets
// (lesson quiz steps and a live exit-ticket run) and marked rubric lines. All three tiers move; nothing counts the wrong
// activity (a quiz never counts as Practiced, an unfinished game never does, a rubric mark only counts for its line's ids,
// a live run of a non-exit set never counts as Checked); the most recent ticket decides Checked; a student with no work
// in the class shows "no data", never 0; the page, the CSV (formula safe) and the aggregate report (no names); who may
// see them; the class tab; the class-deletion hook.
import './_setup.js';
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
const T = await import('../../server/services/lesson-templates.js');
const STD = await import('../../server/services/standards.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async path => { const r = await fetch(base + path, { headers: { cookie: cookieFor(who.id) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '' }; };

const boss = createUser({ username: 'StdBoss', password: 'secret123', role: 'admin' });
const official = createUser({ username: 'OombaAcademy', password: 'secret123' });
const oak = S.createSchool(boss, { name: 'Oak Standards' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 4B' }).class;
const pupil = name => { const u = S.createSchoolAccount(ana, oak.id, { rosterName: name }).user; S.addToClass(ana, cls.id, u.id); return u; };
const mia = pupil('Mia Pupil'), leo = pupil('Leo Pupil'), kim = pupil('Kim Pupil'), nora = pupil('Nora Pupil');
const outsider = createUser({ username: 'StdOutsider', password: 'secret123' });
for (const [slug, title] of [['robo-route', 'Robo Route'], ['quest-race', 'Quest Race']]) {
  const g = games.createGame(official.id, { title, slug, source: 'seed', category: 'learning' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
}

// The exemplar lesson, materialised and assigned. Its exit ticket's items are set to known cats (the banks may be absent).
const mat = T.materialise(ana, oak.id, 'csq-1b-1.2');
assert.ok(mat.ok, JSON.stringify(mat));
const lesson = mat.lesson;
const item = (cat, n) => ({ q: `Question ${n}?`, choices: ['A', 'B', 'C', 'D'], answer: 0, cat });
const ITEMS = [item('1B-AP-10', 1), item('1B-AP-10', 2), item('1B-AP-09', 3)];
let quiz = L.steps(lesson.id).find(s => s.kind === 'quiz');
if (!quiz) quiz = L.addQuizStep(ana, lesson.id, { title: 'Exit ticket', items: ITEMS }).step;
else q.run('UPDATE lesson_steps SET items=? WHERE id=?', JSON.stringify(ITEMS), quiz.id);
const play = L.steps(lesson.id).find(s => s.kind === 'game' && s.title.startsWith('Play'));
const words = L.steps(lesson.id).find(s => s.kind === 'question');
const cl = L.assign(ana, cls.id, lesson.id).classLesson;
const at = (u, step, ms) => q.run('UPDATE step_progress SET updated_at=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', ms, cl.id, step.id, u.id);
const row = (data, id) => data.rows.find(r => r.id === id);

test('the materialised lesson carries the tags the tab reads', () => {
  assert.equal(play.standards, '1B-AP-10');
  assert.ok(words.standards.includes('1B-AP-10'));
  assert.deepEqual(L.rubricOf(words)[0].ids, ['1B-AP-10']);
  assert.deepEqual(L.quizItemsOf(L.getStep(quiz.id)).map(i => i.cat), ['1B-AP-10', '1B-AP-10', '1B-AP-09']);
});

test('before any work: the lesson is Assigned, nothing practiced, every student has no data', () => {
  const d = STD.classStandards(cls.id);
  assert.deepEqual(d.levels, ['1B']);
  assert.equal(d.rows.length, 21, 'only level 1B rows (the class has 1B lessons)');
  assert.equal(STD.classStandards(cls.id, { all: true }).rows.length, 44);
  const r = row(d, '1B-AP-10');
  assert.equal(r.status, 'assigned'); assert.deepEqual(r.lessons, [cl.id]);
  assert.equal(r.practiced, 0); assert.equal(r.checkedPct, null); assert.equal(r.appliedMean, null);
  assert.ok(d.students.every(p => p.noData));
  assert.equal(row(d, '1B-CS-01').status, 'notYet');
});

test('all three tiers move, each from its own activity only', () => {
  // Mia plays the game to the end (Practiced) and gets both 1B-AP-10 items right, the 1B-AP-09 one wrong.
  assert.ok(P.gameScore(mia, cl.id, play.id, 3, '3 stars').ok);
  for (const [i, c] of [[0, 0], [1, 0], [2, 1]]) assert.ok(P.quizAnswer(mia, cl.id, quiz.id, i, c).ok);
  // Leo answers the question (Practiced) and gets both 1B-AP-10 items wrong; his rubric line is marked 2 (Applied).
  assert.ok(P.answer(leo, cl.id, words.id, 'A loop repeats steps, so fewer blocks.').ok);
  for (const [i, c] of [[0, 2], [1, 3]]) assert.ok(P.quizAnswer(leo, cl.id, quiz.id, i, c).ok);
  assert.ok(P.review(ana, cl.id, words.id, leo.id, 'Nice', { marks: [2] }).ok);
  // Kim opens the game but does not finish it (not Practiced) and answers only the 1B-AP-09 item, right.
  assert.ok(P.gameStarted(kim, cl.id, play.id).ok);
  assert.ok(P.quizAnswer(kim, cl.id, quiz.id, 2, 0).ok);
  // Nora never signs in.

  const d = STD.classStandards(cls.id);
  const r = row(d, '1B-AP-10');
  assert.equal(r.practiced, 2, 'Mia (game done) and Leo (question answered); not Kim (game unfinished), never the quiz');
  assert.equal(r.by.get(kim.id).practiced, false);
  assert.equal(r.checkedPct, 50); assert.equal(r.items, 2); assert.equal(r.checkedStudents, 2);
  assert.deepEqual(r.by.get(mia.id).checked.ticket, { tagged: 2, right: 2 }); assert.equal(r.by.get(mia.id).checked.meets, true);
  assert.equal(r.by.get(leo.id).checked.meets, false);
  assert.deepEqual(r.needsLook, [leo.id], '0 of 2 right');
  assert.equal(r.appliedMean, 2); assert.equal(r.marked, 1); assert.equal(r.by.get(leo.id).applied.meets, true);
  assert.equal(r.meets, 2, 'Mia by Checked, Leo by Applied');
  assert.equal(r.status, 'checked', '2 of 4 is under 80%');
  assert.ok(r.last);

  const r9 = row(d, '1B-AP-09');
  assert.equal(r9.practiced, 0, 'a quiz is a check, never practice');
  assert.equal(r9.checkedPct, 50); assert.equal(r9.items, 1);
  assert.equal(r9.by.get(mia.id).checked.meets, false, '0 of the 1 tagged item');
  assert.equal(r9.by.get(kim.id).checked.meets, true, 'all of the 1 tagged item');
  assert.equal(r9.appliedMean, null, 'the rubric line carries 1B-AP-10 only');
  assert.deepEqual(r9.lessons, [cl.id]);

  // No data, not 0: Nora has no work at all; Kim has work but no evidence for 1B-AP-10.
  const nd = d.students.find(p => p.id === nora.id);
  assert.equal(nd.noData, true);
  assert.equal(r.by.get(nora.id).checked, null); assert.equal(r.by.get(nora.id).applied, null);
  assert.equal(d.students.find(p => p.id === kim.id).noData, false);
});

test('Checked follows the most recent ticket; a live exit-ticket run counts, another live run does not', () => {
  const t0 = Date.now();
  at(mia, quiz, t0 - 60e3);
  // A second exit ticket later: Mia gets both 1B-AP-10 items wrong.
  const late = L.addQuizStep(ana, lesson.id, { title: 'Exit ticket 2', items: [item('1B-AP-10', 4), item('1B-AP-10', 5)] }).step;
  for (const i of [0, 1]) assert.ok(P.quizAnswer(mia, cl.id, late.id, i, 1).ok);
  at(mia, late, t0);
  let r = row(STD.classStandards(cls.id), '1B-AP-10');
  assert.equal(r.by.get(mia.id).checked.meets, false, 'the newest ticket: 0 of 2');
  assert.equal(r.by.get(mia.id).checked.pct, 50, 'accuracy still counts every answered item');

  // A live run of the derived exit-ticket set, newer still: 2 of 2 right again. A warm-up run with the same cat: ignored.
  const set = (title) => { const id = `set${Math.random().toString(36).slice(2, 10)}`; q.run("INSERT INTO live_sets(id, owner_id, school_id, title, subject, items, created_at, updated_at) VALUES (?,?,?,?, 'cs-quest', '[]', ?, ?)", id, ana.id, oak.id, title, t0, t0); return id; };
  const run = (setId, marks, ended) => {
    const id = `run${Math.random().toString(36).slice(2, 10)}`;
    q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, set_id, started_at, ended_at, items) VALUES (?,?,?, 'class', 'quest-race', ?, ?, ?, ?)", id, ana.id, cls.id, setId, ended - 1000, ended,
      JSON.stringify([{ q: 'L1', cat: '1B-AP-10' }, { q: 'L2', cat: '1B-AP-10' }]));
    q.run('INSERT INTO live_run_scores(run_id, user_id, score, marks) VALUES (?,?,?,?)', id, mia.id, 2, marks);
  };
  run(set('CSQ 1.2 warm-up · Loops (3-5)'), '00', t0 + 2000);
  r = row(STD.classStandards(cls.id), '1B-AP-10');
  assert.equal(r.by.get(mia.id).checked.answered, 4, 'the warm-up run is not an exit ticket');
  run(set('CSQ 1.2 exit ticket (3-5)'), '11', t0 + 1000);
  r = row(STD.classStandards(cls.id), '1B-AP-10');
  assert.equal(r.by.get(mia.id).checked.answered, 6);
  assert.equal(r.by.get(mia.id).checked.meets, true, 'the live exit ticket is the newest');
});

test('Meets: 80% of the class', () => {
  const small = S.createClass(ana, oak.id, { name: 'Ana 5C' }).class;
  const zed = S.createSchoolAccount(ana, oak.id, { rosterName: 'Zed Pupil' }).user; S.addToClass(ana, small.id, zed.id);
  const scl = L.assign(ana, small.id, lesson.id).classLesson;
  assert.ok(P.answer(zed, scl.id, words.id, 'Loops repeat steps.').ok);
  assert.ok(P.review(ana, scl.id, words.id, zed.id, '', { marks: '3' }).ok);
  const r = row(STD.classStandards(small.id), '1B-AP-10');
  assert.equal(r.status, 'meets'); assert.equal(r.appliedMean, 3);
});

test('the page, the student drill-down, the CSV and the school report; who may see them', async () => {
  const page = await as(ana)(`/class/${cls.id}/standards`);
  assert.equal(page.status, 200);
  assert.match(page.text, /1B-AP-10/); assert.match(page.text, /aria-current="page"[^>]*>.*Standards|href="\/class\/[^"]+\/standards" aria-current="page"/s);
  assert.match(page.text, /Leo Pupil/, 'needs a look names the student for the teacher');
  assert.match(page.text, /50% · 2 items · 2 students|50% · \d+ items · \d students/);
  const one = await as(ana)(`/class/${cls.id}/standards?student=${nora.id}`);
  assert.equal(one.status, 200); assert.match(one.text, /no data/); assert.doesNotMatch(one.text, />0%</);
  assert.equal((await as(ana)(`/class/${cls.id}/standards?all=1`)).text.match(/csq-std-id/g).length, 44);

  const csv = await as(ana)(`/class/${cls.id}/standards.csv`);
  assert.equal(csv.status, 200); assert.match(csv.type, /text\/csv/);
  const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.equal(lines.length, 22);
  assert.match(lines[0], /^Standard,Concept,Statement,Lessons,Practiced \(students\)/);
  assert.ok(lines.find(l => l.startsWith('1B-AP-10,')));
  assert.doesNotMatch(csv.text, /Leo Pupil|Mia Pupil/, 'counts only');
  // Formula safety: a lesson title that starts with "=".
  q.run('UPDATE lessons SET title=? WHERE id=?', '=HYPERLINK("x")', lesson.id);
  assert.match((await as(ana)(`/class/${cls.id}/standards.csv`)).text, /"'=HYPERLINK\(""x""\)/);
  q.run('UPDATE lessons SET title=? WHERE id=?', mat.lesson.title, lesson.id);

  assert.equal((await as(ben)(`/class/${cls.id}/standards?report=1`)).status, 404, 'the report is for school admins');
  const rep = await as(boss)(`/class/${cls.id}/standards?report=1`);
  assert.equal(rep.status, 200, 'school admins');
  assert.match(rep.text, /Coverage report/); assert.match(rep.text, /Ana 4B/); assert.match(rep.text, /1B-AP-10/);
  assert.doesNotMatch(rep.text, /Mia Pupil|Leo Pupil|Nora Pupil|Zed Pupil/, 'aggregate only');
  const agg = STD.schoolReport(oak.id).rows.find(r => r.id === '1B-AP-10');
  assert.equal(agg.classes, 2); assert.equal(agg.lessons.length, 1); assert.ok(agg.items >= 2); assert.equal(typeof agg.pct, 'number');

  assert.equal((await as(ben)(`/class/${cls.id}/standards`)).status, 404, 'not his class');
  assert.equal((await as(mia)(`/class/${cls.id}/standards`)).status, 404, 'never students');
  assert.equal((await as(mia)(`/class/${cls.id}/standards?report=1`)).status, 404);
  assert.equal((await as(mia)(`/class/${cls.id}/standards.csv`)).status, 404);
  assert.equal((await as(outsider)(`/class/${cls.id}/standards?report=1`)).status, 404);
  assert.equal((await as(boss)(`/class/${cls.id}/standards`)).status, 200, 'school admins');

  const tab = await as(ana)(`/class/${cls.id}`);
  assert.match(tab.text, new RegExp(`href="/class/${cls.id}/standards"`));
});

test('deleted with the class: rows of its assignments go', () => {
  const empty = S.createClass(ana, oak.id, { name: 'Empty 3A' }).class;
  const ecl = L.assign(ana, empty.id, lesson.id).classLesson;
  q.run("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, marks, started_at, updated_at) VALUES (?,?,?, 'started', '2', ?, ?)", ecl.id, words.id, ana.id, Date.now(), Date.now());
  assert.ok(S.deleteClass(ana, empty.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM step_progress WHERE class_lesson_id=?', ecl.id).n, 0);
  assert.ok(q.get('SELECT COUNT(*) n FROM step_progress WHERE class_lesson_id=?', cl.id).n > 0, 'other classes keep theirs');
});
