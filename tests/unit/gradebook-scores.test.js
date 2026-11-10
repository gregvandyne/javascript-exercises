// Real scores and real names in the gradebook (docs/decisions.md "Real scores in the gradebook", the teacher audit's
// item 2): "Work done" apart from "Score" (a child who answers everything wrong is 100 % done and 0 % right), the
// Score's formula (quizzes, live game steps and rubrics, weighted by points possible; "–" with nothing scored), work
// finished late (the school's time zone), live game results per student (never a guest), roster names beside the names
// used in games on staff screens only, one student's page (staff only, printable), the CSV's new columns at the end,
// and the gradebook's server time for 3 classes of 28.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const R = await import('../../server/services/rubrics.js');
const SC = await import('../../server/services/scores.js');
const { studentReport } = await import('../../server/services/student-report.js');
const games = await import('../../server/services/games.js');
const { tFor, CODES } = await import('../../server/i18n/index.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const req = async (who, path, { method = 'GET', body } = {}) => {
  const headers = { connection: 'close', ...(who ? { cookie: cookieFor(who.id) } : {}), ...(body ? { 'content-type': 'application/json' } : {}) };
  const t0 = performance.now();
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* a page */ }
  return { status: r.status, text, json, location: r.headers.get('location') || '', headers: r.headers, ms: performance.now() - t0 };
};
const DAY = 864e5;
const main = html => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const csvOf = async (who, classId) => (await req(who, `/class/${classId}/progress.csv`)).text.replace(/^﻿/, '').trim().split('\r\n').map(l => l.split(','));

// ---------------------------------------------------------------- people and places
const boss = auth.createUser({ username: 'GbBoss', password: 'boss-password-12', role: 'admin' });
const elm = S.createSchool(boss, { name: 'Score Elm School' }).school;
assert.ok(S.updateSchool(boss, elm.id, { settings: { timeZone: 'America/New_York' } }).ok);
const head = S.createSchoolAccount(boss, elm.id, { rosterName: 'Hana Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, elm.id, { name: 'Ana 4A' }).class;
const bens = S.createClass(ben, elm.id, { name: 'Ben 4B' }).class;
const pupil = (name, c = cls, by = ana) => { const u = S.createSchoolAccount(by, elm.id, { rosterName: name }).user; S.addToClass(by, c.id, u.id); return u; };
const mia = pupil('Mia Realname'), leo = pupil('Leo Realname'), kim = pupil('Kim Realname'), zed = pupil('Zed Other', bens, ben);
const kid = auth.createUser({ username: 'GbKid', password: 'rainbow-77' });
const grown = auth.createUser({ username: 'GbParent', password: 'a-long-password-1', accountType: 'grownup' });
const guest = auth.createGuest();
const outsider = (() => { const sch = S.createSchool(boss, { name: 'Far Oak' }).school; return S.createSchoolAccount(boss, sch.id, { rosterName: 'Eve Elsewhere', role: 'teacher' }).user; })();
const game = (() => {
  const g = games.createGame(boss.id, { title: 'Quest Game' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: boss.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  return games.getGame(g.id);
})();
const QUIZ5 = [{ q: '6 x 7?', choices: ['42', '36'], answer: 0 }, { q: '8 x 4?', choices: ['32', '24'], answer: 0 }, { q: '56 / 8?', choices: ['7', '6'], answer: 0 },
  { q: '9 x 9?', choices: ['81', '72'], answer: 0 }, { q: '7 x 7?', choices: ['49', '42'], answer: 0 }];
const levels = [{ label: 'Beginning', points: 1 }, { label: 'Developing', points: 2 }, { label: 'Secure', points: 3 }, { label: 'Excellent', points: 4 }];
const rub = R.createRubric(ana, elm.id, { title: 'Explaining', levels, criteria: [{ name: 'Ideas' }, { name: 'Reasons' }, { name: 'Words' }, { name: 'Care' }] }).rubric;

// Lesson 1 (due long ago): a quiz of 5, a written question with a 16-point rubric, a game step hosted live.
const lesson = L.createLesson(ana, elm.id, { title: 'Times tables' }).lesson;
const quiz = L.addQuizStep(ana, lesson.id, { title: 'Exit ticket', items: QUIZ5 }).step;
const ask = L.addStep(ana, lesson.id, { kind: 'question', title: 'Explain', body: 'How do you know 6 x 7?', rubricId: rub.id }).step;
const play = L.addStep(ana, lesson.id, { kind: 'game', gameId: game.id, title: 'Class game' }).step;
const cl = L.assign(ana, cls.id, lesson.id, { dueAt: '2024-03-08' }).classLesson;
// Lesson 2: only a reading step (nothing to score). Lesson 3 opens far in the future.
const reading = L.createLesson(ana, elm.id, { title: 'Read about arrays' }).lesson;
const read = L.addStep(ana, reading.id, { kind: 'text', body: 'Rows and columns.' }).step;
const cl2 = L.assign(ana, cls.id, reading.id).classLesson;
const later = L.createLesson(ana, elm.id, { title: 'Next term' }).lesson;
const laterQuiz = L.addQuizStep(ana, later.id, { title: 'Later quiz', items: QUIZ5.slice(0, 2) }).step;
const cl3 = L.assign(ana, cls.id, later.id, { opensAt: '2999-01-01' }).classLesson;

const answerQuiz = (u, clId, stepId, picks) => { picks.forEach((c, i) => assert.ok(P.quizAnswer(u, clId, stepId, i, c).ok)); };
const doneAt = (clId, stepId, userId, t) => q.run('UPDATE step_progress SET done_at=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', t, clId, stepId, userId);
const row = (id, classId = cls.id) => P.classProgress(classId).students.find(p => p.id === id);
/** A saved class live game: scores for [user, correct, answered, marks]. */
function liveRun({ title, classId = cls.id, clId = null, stepId = null, mode = 'battle', ended = Date.now() - DAY, scores }) {
  const id = uid(12);
  q.run(`INSERT INTO live_runs(id, host_id, class_id, class_lesson_id, step_id, audience, mode, title, started_at, ended_at, players, guests, items, scored_by)
    VALUES (?,?,?,?,?,'class',?,?,?,?,?,2,'[]','server')`, id, ana.id, classId, clId, stepId, mode, title, ended - 600e3, ended, scores.length + 2);
  scores.forEach(([u, correct, answered, marks], i) => q.run('INSERT INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,0,0,?)', id, u.id, correct * 100, i + 1, correct, answered, marks));
  return id;
}

// ---------------------------------------------------------------- a. Work done is not the Score
test('a. a child who answers every question wrong is 100% done and 0% right; nothing scored reads "–", never 0%', async () => {
  // Leo: every quiz answer wrong, the question answered, the game step ticked: all three steps done.
  answerQuiz(leo, cl.id, quiz.id, [1, 1, 1, 1, 1]);
  assert.ok(P.answer(leo, cl.id, ask.id, 'because').ok);
  assert.ok(P.markDone(leo, cl.id, play.id).ok);
  assert.ok(P.markDone(leo, cl2.id, read.id).ok);
  const r = row(leo.id);
  assert.equal(r.overall, 100, 'Work done: every open step is done');
  assert.deepEqual(r.score, { earned: 0, possible: 5, pct: 0 }, 'Score: 0 of 5 quiz points');
  // Kim has done nothing; Mia read lesson 2 only: nothing scored for either.
  assert.ok(P.markDone(mia, cl2.id, read.id).ok);
  assert.equal(row(kim.id).score, null); assert.equal(row(mia.id).score, null);
  assert.equal(SC.total([]), null);
  const page = await req(ana, `/class/${cls.id}/progress`);
  assert.equal(page.status, 200);
  assert.match(page.text, /<th scope="col" class="gb-sum">Work done<\/th><th scope="col" class="gb-sum">Score<\/th>/);
  assert.doesNotMatch(main(page.text), /Overall/, 'the old column name is gone');
  const tr = id => new RegExp(`<tr><th scope="row" class="gb-name">(?:(?!</tr>)[\\s\\S])*?/student/${id}"[\\s\\S]*?</tr>`).exec(page.text)[0];
  assert.match(tr(leo.id), /<td class="gb-all"><b>100%<\/b>/);
  assert.match(tr(leo.id), new RegExp(`<a class="gb-cell gb-score" href="/class/${cls.id}/student/${leo.id}#score" title="See what makes up this score"><b class="gb-num" dir="ltr">0%</b><span class="gb-pts" aria-hidden="true" dir="ltr">0/5</span><span class="sr-only"> 0 of 5 points</span></a>`));
  assert.match(tr(kim.id), /<td class="gb-all gb-scorecell"><span class="muted" aria-hidden="true">–<\/span><span class="sr-only">Nothing scored yet<\/span>/);
  assert.doesNotMatch(tr(kim.id), /gb-score"/, 'no score link with nothing to explain');
  // "How to read it" explains both columns and the formula.
  const en = tFor('en');
  for (const k of ['workDone', 'score', 'late', 'names']) assert.ok(page.text.includes(en(`gradebook.help.${k}`).replace(/"/g, '&quot;').replace(/'/g, '&#39;')), k);
  assert.match(en('gradebook.help.score'), /Points earned out of points possible/); assert.match(en('gradebook.help.score'), /count for more/);
  assert.match(en('gradebook.help.workDone'), /does not look at right answers/);
});

// ---------------------------------------------------------------- b. the formula
test('b. Score = points earned / points possible over quizzes, rubrics and live game steps, weighted by points possible', () => {
  // Mia: quiz 4 of 5; rubric 12 of 16 (levels 3,3,3,3 of 4); the game step hosted live twice (6/10, then 9/10: the best counts).
  answerQuiz(mia, cl.id, quiz.id, [0, 0, 0, 0, 1]);
  assert.ok(P.answer(mia, cl.id, ask.id, 'six sevens are forty-two').ok);
  assert.ok(R.saveScore(ana, cl.id, ask.id, mia.id, { picks: [2, 2, 2, 2] }).ok);
  assert.deepEqual(row(mia.id).score, { earned: 16, possible: 21, pct: 76 }, '(4 + 12) / (5 + 16): the rubric weighs more than the quiz');
  liveRun({ title: 'Class game', clId: cl.id, stepId: play.id, ended: Date.now() - 3 * DAY, scores: [[mia, 6, 10, '1111110000'], [leo, 2, 10, '11000-----']] });
  liveRun({ title: 'Class game', clId: cl.id, stepId: play.id, ended: Date.now() - 2 * DAY, scores: [[mia, 9, 10, '1111111110']] });
  const m = row(mia.id);
  assert.deepEqual(m.score, { earned: 25, possible: 31, pct: 81 }, '(4 + 12 + 9) / (5 + 16 + 10)');
  assert.deepEqual(m.cells[0].items.map(i => [i.kind, i.stepId, i.earned, i.possible]), [['quiz', quiz.id, 4, 5], ['rubric', ask.id, 12, 16], ['live', play.id, 9, 10]], 'every item, in step order');
  assert.deepEqual(row(leo.id).score, { earned: 2, possible: 15, pct: 13 }, 'a question skipped in a live game is not right: 2 of 10, plus 0 of 5');
  // Not counted: a quiz still open, a plain game score (no maximum), feedback without a level, a lesson not open yet.
  assert.ok(P.quizAnswer(kim, cl.id, quiz.id, 0, 0).ok);
  assert.ok(P.gameScore(kim, cl.id, play.id, 4200, 'points').ok);
  assert.ok(P.answer(kim, cl.id, ask.id, 'hm').ok);
  assert.ok(R.saveScore(ana, cl.id, ask.id, kim.id, { picks: [null, null, null, null], feedback: 'Say more.' }).ok);
  assert.equal(row(kim.id).score, null, 'nothing with a maximum yet');
  q.run("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, score, label, marks, started_at, done_at, updated_at) VALUES (?,?,?,'done',100,'quiz','11',1,1,1)", cl3.id, laterQuiz.id, kim.id);
  const k = row(kim.id);
  assert.equal(k.cells[2].locked, true); assert.deepEqual(k.cells[2].score, { earned: 2, possible: 2, pct: 100 });
  assert.equal(k.score, null, 'a lesson that has not opened is left out of the Score, as it is out of Work done');
  q.run('DELETE FROM step_progress WHERE class_lesson_id=?', cl3.id);
  // A step's own 0-3 rubric lines (CS Quest): each marked line is worth 3; a library rubric on the same step wins.
  assert.deepEqual(SC.liveResults([{ run: 'r', u: 'a', correct: 3, answered: 4, marks: '' }, { run: 'r', u: 'b', correct: 0, answered: 0, marks: '' }]).get('r:a'), { right: 3, total: 4 }, 'no marks kept: answers given');
  const votes = SC.liveResults([{ run: 'w', u: 'a', correct: 0, answered: 5, marks: '-----' }, { run: 'w', u: 'b', correct: 0, answered: 0, marks: '-----' }]);
  assert.equal(votes.get('w:a'), null, 'votes are answers with no right one: played, never 0 of 5'); assert.equal(votes.get('w:b'), null);
  assert.equal(SC.pointsText(7.5, 10), '7.5/10');
});

test('b2. a step\'s own 0-3 rubric lines count 3 points a marked line; a removed lesson and a swapped rubric leave the Score', () => {
  const l = L.createLesson(ben, elm.id, { title: 'Capstone' }).lesson;
  const b = L.addStep(ben, l.id, { kind: 'question', body: 'Plan it', rubric: [{ line: 'Plan' }, { line: 'Test' }, { line: 'Share' }] }).step;
  assert.equal(L.rubricOf(L.getStep(b.id)).length, 3, 'the step carries three rubric lines');
  const c = L.assign(ben, bens.id, l.id).classLesson;
  assert.ok(P.answer(zed, c.id, b.id, 'my plan').ok);
  assert.ok(P.review(ben, c.id, b.id, zed.id, 'ok', { marks: [3, 2, null] }).ok);
  assert.deepEqual(row(zed.id, bens.id).score, { earned: 5, possible: 6, pct: 83 }, '3 + 2 of 2 marked lines x 3');
  assert.deepEqual(row(zed.id, bens.id).cells[0].items.map(i => i.kind), ['marks']);
  assert.ok(L.unassign(ben, c.id).ok);
  assert.equal(P.classProgress(bens.id).lessons.length, 0);
  assert.equal(SC.classItems(bens.id).size, 0, 'work on a removed lesson is kept but not scored');
});

// ---------------------------------------------------------------- c. late
test('c. late: work still missing after the due day, and work finished after it ("Done late"), by the school\'s time zone', async () => {
  // Due 8 March 2024 in New York: the day ends at 05:00 UTC on the 9th (EST, the day before the clocks change).
  const end = Date.UTC(2024, 2, 9, 5, 0, 0);
  assert.equal(L.lateFrom(L.getClassLesson(cl.id)), end, 'local midnight after the due day');
  assert.equal(L.lateFrom(L.getClassLesson(cl2.id)), null, 'no due date: never late');
  // Mia finished everything a minute before the day ended there (already the 9th in UTC): on time.
  assert.ok(P.gameScore(mia, cl.id, play.id, 900, 'live').ok);
  for (const s of [quiz, ask, play]) doneAt(cl.id, s.id, mia.id, end - 60e3);
  // Leo's last step was first done a minute after it: done late.
  for (const s of [quiz, ask]) doneAt(cl.id, s.id, leo.id, end - 5 * DAY);
  doneAt(cl.id, play.id, leo.id, end + 60e3);
  const m = row(mia.id).cells[0], l = row(leo.id).cells[0], k = row(kim.id).cells[0];
  assert.deepEqual([m.late, m.lateDone, m.lateSteps], [false, false, 0]);
  assert.deepEqual([l.late, l.lateDone, l.lateSteps], [false, true, 1]);
  assert.deepEqual([k.late, k.lateDone], [true, false], 'Kim has not finished: late');
  assert.deepEqual([row(mia.id).lateCount, row(leo.id).lateCount, row(kim.id).lateCount], [0, 1, 1]);
  const page = await req(ana, `/class/${cls.id}/progress`);
  assert.equal((page.text.match(/<span class="chip-s bad gb-latedone">⏰ Done late<\/span>/g) || []).length, 1, 'one "Done late" cell: Leo');
  assert.match(page.text, /<td class="gb-late">/, 'Kim\'s cell is late as before');
  // The lesson's own page: the late step is marked, and the row says Done late.
  const lp = await req(ana, `/class/${cls.id}/progress/${cl.id}`);
  const tr = id => new RegExp(`<tr id="s-${id}"[\\s\\S]*?</tr>`).exec(lp.text)[0];
  assert.match(tr(leo.id), /gb-latedone">⏰ Done late/); assert.equal((tr(leo.id).match(/class="st-late"/g) || []).length, 1);
  assert.doesNotMatch(tr(mia.id), /st-late|gb-latedone/);
  // Without a school time zone the old rule holds: late only once the due day is over everywhere (+36 h).
  assert.equal(L.lateFrom({ due_at: Date.UTC(2024, 2, 8) }), Date.UTC(2024, 2, 8) + 36 * 3600e3);
});

// ---------------------------------------------------------------- d. live games in the gradebook
test('d. live game results: a column per saved class game with right/asked per student; guests and outsiders never', async () => {
  const solo = liveRun({ title: 'Friday warm-up', scores: [[mia, 7, 8, '11111110'], [leo, 3, 8, '1110000-']] });
  const vote = liveRun({ title: 'Would you rather', mode: 'wyr', ended: Date.now() - DAY - 60e3, scores: [[mia, 0, 4, '----'], [kim, 0, 4, '----']] });
  // A row that should never exist (an account outside the class) is not shown even if it did.
  q.run('INSERT INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,0,0,?)', solo, kid.id, 800, 1, 8, 8, '11111111');
  const lv = SC.classLive(cls.id, 8);
  assert.equal(lv.runs.length, 4); assert.deepEqual(lv.runs.map(r => [r.title, r.linked]), [['Friday warm-up', false], ['Would you rather', false], ['Class game', true], ['Class game', true]]);
  assert.deepEqual(lv.by.get(`${solo}:${mia.id}`), { right: 7, total: 8 });
  assert.deepEqual(lv.by.get(`${solo}:${leo.id}`), { right: 3, total: 8 }, 'a skipped question counts as asked');
  assert.equal(lv.by.get(`${vote}:${mia.id}`), null, 'a vote has no right answer: played');
  assert.equal(lv.by.has(`${solo}:${kim.id}`), false, 'Kim was not there');
  const before = row(mia.id).score;
  assert.deepEqual(before, { earned: 25, possible: 31, pct: 81 }, 'a live game that is not a lesson step stays out of the Score');
  const page = await req(ana, `/class/${cls.id}/progress`);
  const table = /<table class="tbl gradebook gb-livetbl" id="gb-live">[\s\S]*?<\/table>/.exec(page.text)[0];
  assert.equal((table.match(/<th scope="col">/g) || []).length, 4, 'a column per game');
  assert.match(table, new RegExp(`<a href="/live/results/${solo}" dir="auto">Friday warm-up</a>`));
  const tr = id => new RegExp(`<tr><th scope="row" class="gb-name">(?:(?!</tr>)[\\s\\S])*?/student/${id}"[\\s\\S]*?</tr>`).exec(table)[0];
  assert.match(tr(mia.id), /<span class="gb-num" dir="ltr">7\/8<\/span>/); assert.match(tr(mia.id), /<span aria-hidden="true">✓<\/span><span class="sr-only">played, nothing to mark<\/span>/);
  assert.match(tr(kim.id), /<span class="sr-only">did not play<\/span>/);
  assert.doesNotMatch(table, new RegExp(`${kid.username}|8/8`), 'only the class\'s own students; a guest has no row at all');
  assert.equal(q.get('SELECT guests FROM live_runs WHERE id=?', solo).guests, 2, 'the run had guests; none of them is in the gradebook');
  assert.equal((table.match(/<tr><th scope="row"/g) || []).length, 3, 'three students, three rows');
});

// ---------------------------------------------------------------- e. names
test('e. staff screens show the roster name with the name used in games beside it; students and the big screen never see a roster name', async () => {
  const gen = u => auth.getUser(u.id).display_name;
  assert.notEqual(gen(mia), 'Mia Realname');
  const both = u => new RegExp(`<b dir="auto">${S.roster(cls.id).find(p => p.id === u.id).roster_name}</b> <span class="gname small muted" title="Name in games"><span class="sr-only">Name in games: </span><bdi>${gen(u)}</bdi></span></a>`);
  const book = await req(ana, `/class/${cls.id}/progress`);
  for (const u of [mia, leo, kim]) assert.match(book.text, both(u), u.username);
  assert.match(book.text, new RegExp(`<a href="/class/${cls.id}/student/${mia.id}"><b dir="auto">Mia Realname</b> <span class="gname`), 'the name links to the student\'s page');
  const lp = await req(ana, `/class/${cls.id}/progress/${cl.id}`);
  assert.match(lp.text, both(mia));
  // answers to review: the card carries both names (no link there)
  assert.match(lp.text, new RegExp(`id="a-${ask.id}-${mia.id}">\\s*<div class="ac-head"><span class="pp">[\\s\\S]*?<b dir="auto">Mia Realname</b> <span class="gname small muted" title="Name in games"><span class="sr-only">Name in games: </span><bdi>${gen(mia)}</bdi>`));
  // the Standards tab's student picker
  const std = await req(ana, `/class/${cls.id}/standards?fw=ccss-math`);
  assert.equal(std.status, 200); assert.match(std.text, new RegExp(`>Mia Realname \\(${gen(mia)}\\)</option>`));
  const csta = await req(ana, `/class/${cls.id}/standards?fw=csta`);
  assert.match(csta.text, new RegExp(`>Mia Realname \\(${gen(mia)}\\)</option>`));
  // the CSV: roster name, then the Oomba Academy name
  const csv = await csvOf(ana, cls.id);
  assert.deepEqual(csv[0].slice(0, 2), ['Name', 'Oomba Academy name']);
  assert.deepEqual(csv.find(l => l[0] === 'Mia Realname').slice(0, 2), ['Mia Realname', mia.username]);
  // A student's own pages never carry a classmate's roster name (nor their own page for staff).
  for (const path of [`/class/${cls.id}`, `/class/${cls.id}/lessons/${cl.id}`, '/']) {
    const r = await req(mia, path);
    assert.doesNotMatch(r.text, /Leo Realname|Kim Realname/, path);
  }
  // The helper keeps the two apart and falls back to the generated name alone.
  const { staffStudentName } = await import('../../server/views/components.js');
  assert.equal(String(staffStudentName({ roster_name: '', display_name: 'CozyLynx25' })), '<span class="sname"><b dir="auto">CozyLynx25</b></span>');
  assert.equal(String(staffStudentName({ roster_name: 'Same', display_name: 'Same' })), '<span class="sname"><b dir="auto">Same</b></span>');
  // The projector page and the players' page have no roster-name code at all: only the Teacher view asks for them.
  const src = f => fs.readFileSync(new URL(`../../public/js/${f}`, import.meta.url), 'utf8');
  for (const f of ['live-host.js', 'live-play.js', 'live-join.js']) assert.doesNotMatch(src(f), /roster-names/, f);
  assert.match(src('live-dash.js'), /roster-names/);
});

// ---------------------------------------------------------------- f. one student's page
test('f. a student\'s page: work done, score and its items, late, standards, answers and feedback, live results; printable', async () => {
  assert.ok(P.review(ana, cl.id, ask.id, mia.id, 'Clear thinking, Mia.').ok);
  const rep = studentReport(cls.id, mia.id);
  assert.equal(rep.workDone, 100); assert.deepEqual(rep.score, { earned: 25, possible: 31, pct: 81 }); assert.equal(rep.lateCount, 0);
  assert.equal(rep.answers.length, 1); assert.equal(rep.answers[0].feedback, 'Clear thinking, Mia.');
  assert.equal(rep.live.length, 4, 'the four games Mia played');
  assert.equal(studentReport(cls.id, zed.id), null, 'not a student of this class');
  assert.equal(studentReport(cls.id, ana.id), null, 'a teacher is not a student');
  const page = await req(ana, `/class/${cls.id}/student/${mia.id}`);
  assert.equal(page.status, 200); assert.equal(page.headers.get('cache-control'), 'no-store');
  const m = main(page.text);
  // the name in two parts, so a print can leave the family name out; the name in games is never printed
  assert.match(m, /<h2 class="sp-name"><span class="sp-first" dir="auto">Mia<\/span><span class="sp-rest" dir="auto"> Realname<\/span><\/h2>/);
  assert.match(m, /<label class="chk sp-fullname"><input type="checkbox" id="sp-full"> Print the full name<\/label>/);
  assert.doesNotMatch(m, /id="sp-full"[^>]*checked/, 'first name only unless the teacher ticks the box');
  assert.match(m, new RegExp(`<span class="noprint">Name in games: <bdi>${auth.getUser(mia.id).display_name}</bdi> · </span>`));
  assert.match(m, /<button class="btn btn-primary btn-sm" type="button" data-print>/);
  const css = fs.readFileSync(new URL('../../public/css/schools.css', import.meta.url), 'utf8');
  assert.match(css, /@media print\{[^@]*\.sp-page:not\(:has\(#sp-full:checked\)\) \.sp-rest\{display:none\}/, 'the print rule that hides the rest of the name');
  // the numbers
  assert.match(m, /<span class="sp-stat-v"><span dir="ltr">100%<\/span><\/span><span class="sp-stat-l">Work done<\/span>/);
  assert.match(m, /<span class="sp-stat-v"><span dir="ltr">81%<\/span><\/span><span class="sp-stat-l">Score<\/span><span class="small muted"><span dir="ltr">25\/31<\/span>/);
  // what the score is made of: each item with its type and points, and the total
  const score = /<section class="panel" id="score"[\s\S]*?<\/section>/.exec(m)[0];
  for (const [title, kind, pts] of [['Exit ticket', 'Quiz', '4/5'], ['Explain', 'Rubric', '12/16'], ['Class game', 'Live game', '9/10']]) {
    assert.match(score, new RegExp(`<th scope="row" dir="auto">${title}</th><td data-label="Type"><span aria-hidden="true">[^<]+</span> ${kind}</td><td data-label="Points"><span class="gb-num" dir="ltr">${pts}</span>`), title);
  }
  assert.match(score, /<tfoot><tr><th scope="row" colspan="2">Score<\/th><td><b dir="ltr">81%<\/b> <span class="small muted" dir="ltr">25\/31<\/span>/);
  assert.match(m, /Clear thinking, Mia\./); assert.match(m, /six sevens are forty-two/);
  assert.match(m, /Friday warm-up<\/a> <span class="small muted">[^<]+<\/span>\s*<b class="gb-num" dir="ltr">7\/8<\/b>/);
  // nobody else is on the page, and nothing is for sale
  assert.doesNotMatch(m, /Leo Realname|Kim Realname|Zed Other/);
  assert.doesNotMatch(m, new RegExp(`${auth.getUser(leo.id).display_name}|${auth.getUser(kim.id).display_name}`));
  assert.doesNotMatch(m, /\$\s?\d|\/plans|upgrade|free trial/i, 'no prices on a page about a child');
  // Leo: late, and a 13% score; Kim: nothing scored, with the reason
  const leoPage = main((await req(ana, `/class/${cls.id}/student/${leo.id}`)).text);
  assert.match(leoPage, /<span class="chip-s bad">⏰ Done late<\/span>/); assert.match(leoPage, /<span class="sp-stat-v">1<\/span><span class="sp-stat-l">Late lessons<\/span>/);
  const kimPage = main((await req(ana, `/class/${cls.id}/student/${kim.id}`)).text);
  assert.match(kimPage, /Nothing is scored yet\. Scores come from quizzes/); assert.match(kimPage, /<span class="chip-s bad">⏰ Late<\/span>/);
});

test('g. the student\'s page, the gradebook, its CSV and the live names are for the class\'s staff only', async () => {
  const path = `/class/${cls.id}/student/${mia.id}`;
  for (const u of [ana, head]) assert.equal((await req(u, path)).status, 200, `${u.username}: the class's teacher and the school's admin`);
  for (const u of [ben, outsider, mia, leo, kid, grown, guest]) {
    const r = await req(u, path);
    assert.equal(r.status, 404, `${u.username} gets the 404 page`);
    assert.doesNotMatch(r.text, /Mia Realname|sp-page|Realname/, u.username);
  }
  const out = await req(null, path);
  assert.ok(out.status === 302 || out.status === 401, 'signed out: the sign-in page'); assert.doesNotMatch(out.text, /Realname/);
  // a student of another class, a teacher, an unknown id: 404 for the class's own teacher too
  for (const id of [zed.id, ana.id, 'nope', kid.id]) assert.equal((await req(ana, `/class/${cls.id}/student/${id}`)).status, 404, id);
  // Ben's class, Ben's student: Ana is not let in
  assert.equal((await req(ana, `/class/${bens.id}/student/${zed.id}`)).status, 404);
  assert.equal((await req(ben, `/class/${bens.id}/student/${zed.id}`)).status, 200);
  // a student who left the class: gone from the page
  const tmp = pupil('Tia Temp');
  assert.equal((await req(ana, `/class/${cls.id}/student/${tmp.id}`)).status, 200);
  assert.ok(S.removeFromClass(ana, cls.id, tmp.id).ok);
  assert.equal((await req(ana, `/class/${cls.id}/student/${tmp.id}`)).status, 404);
  for (const p of [`/class/${cls.id}/progress`, `/class/${cls.id}/progress.csv`, `/class/${cls.id}/progress/${cl.id}`]) {
    for (const u of [ben, outsider, mia, kid, grown, guest]) assert.equal((await req(u, p)).status, 404, `${u.username} ${p}`);
  }
});

// ---------------------------------------------------------------- h. the CSV
test('h. the CSV keeps its old columns in place and adds Score, late and live games at the end', async () => {
  const csv = await csvOf(ana, cls.id);
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const runs = SC.classLive(cls.id, 8).runs;
  assert.deepEqual(csv[0], ['Name', 'Oomba Academy name',
    'Times tables', 'Times tables (quiz %)', 'Times tables (rubric points)', 'Times tables (rubric %)', 'Read about arrays', 'Next term', 'Next term (quiz %)',
    'Work done', 'Quiz %', 'Rubric points', 'Rubric %',
    'Score', 'Score (points)', 'Late lessons', 'Times tables (score %)', 'Times tables (late)',
    ...runs.map(r => `Live: ${r.title} (${fmt.format(r.ended_at)})`)]);
  const line = name => csv.find(l => l[0] === name).slice(2);
  assert.deepEqual(line('Mia Realname').slice(0, 16), ['3/3', '80%', '12/16', '75%', '1/1', '–', '', '100%', '80%', '12/16', '75%', '81%', '25/31', '0', '81%', '']);
  const col = (name, h) => csv.find(l => l[0] === name)[csv[0].indexOf(h)];
  assert.equal(col('Mia Realname', 'Work done'), '100%'); assert.equal(col('Mia Realname', 'Score'), '81%'); assert.equal(col('Mia Realname', 'Score (points)'), '25/31');
  assert.equal(col('Mia Realname', 'Times tables (score %)'), '81%'); assert.equal(col('Mia Realname', 'Times tables (late)'), ''); assert.equal(col('Mia Realname', 'Late lessons'), '0');
  assert.equal(col('Leo Realname', 'Work done'), '100%'); assert.equal(col('Leo Realname', 'Score'), '13%'); assert.equal(col('Leo Realname', 'Times tables (late)'), 'done late'); assert.equal(col('Leo Realname', 'Late lessons'), '1');
  assert.equal(col('Kim Realname', 'Score'), '–'); assert.equal(col('Kim Realname', 'Score (points)'), ''); assert.equal(col('Kim Realname', 'Times tables (late)'), 'late');
  const live = title => csv[0].findIndex(h => h.startsWith(`Live: ${title} `));
  assert.equal(csv.find(l => l[0] === 'Mia Realname')[live('Friday warm-up')], '7/8');
  assert.equal(csv.find(l => l[0] === 'Kim Realname')[live('Friday warm-up')], '', 'not there');
  assert.equal(csv.find(l => l[0] === 'Leo Realname')[live('Friday warm-up')], '3/8');
  assert.ok(csv.every(l => l.length === csv[0].length || l.join(',').includes('"')), 'every row has every column');
});

// ---------------------------------------------------------------- i. words
test('i. every gradebook word exists in all 13 languages (en-GB falls back to en except its own spelling)', () => {
  const en = JSON.parse(fs.readFileSync(new URL('../../server/i18n/locales/en.json', import.meta.url), 'utf8')).gradebook;
  const keys = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (typeof v === 'string' ? [pre + k] : keys(v, `${pre}${k}.`)));
  const all = keys(en);
  assert.ok(all.length >= 50, `${all.length} keys`);
  assert.equal(CODES.length, 13);
  for (const code of CODES.filter(c => c !== 'en' && c !== 'en-GB')) {
    const g = JSON.parse(fs.readFileSync(new URL(`../../server/i18n/locales/${code}.json`, import.meta.url), 'utf8')).gradebook;
    assert.deepEqual(keys(g).sort(), [...all].sort(), code);
    const t = tFor(code);
    for (const k of ['workDone', 'doneLate', 'help.score', 'help.workDone', 'student.printFull']) assert.notEqual(t(`gradebook.${k}`), tFor('en')(`gradebook.${k}`), `${code} ${k} is translated`);
  }
  assert.equal(tFor('en-GB')('gradebook.student.standardsLine', { meets: 1, developing: 2, practiced: 3 }), '1 met · 2 developing · 3 practised');
  assert.equal(tFor('en-GB')('gradebook.workDone'), 'Work done');
});

// ---------------------------------------------------------------- j. speed
test('j. the gradebook for 3 classes of 28 stays under 300 ms of server time (seeded: 12 lessons x 5 steps each, scores, live games)', async () => {
  const t = S.createSchoolAccount(boss, elm.id, { rosterName: 'Speedy Teacher', role: 'teacher' }).user;
  const big = [];
  const rubric = R.createRubric(t, elm.id, { title: 'Speed rubric', levels, criteria: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] }).rubric;
  const lessons = Array.from({ length: 12 }, (_, i) => {
    const l = L.createLesson(t, elm.id, { title: `Lesson ${i + 1}` }).lesson;
    return { l, steps: [L.addStep(t, l.id, { kind: 'text', body: 'Read.' }).step, L.addQuizStep(t, l.id, { title: 'Check', items: QUIZ5 }).step,
      L.addStep(t, l.id, { kind: 'question', body: 'Explain.', rubricId: rubric.id }).step, L.addStep(t, l.id, { kind: 'game', gameId: game.id }).step, L.addStep(t, l.id, { kind: 'text', body: 'Recap.' }).step] };
  });
  const ins = q.run.bind(q);
  for (let c = 0; c < 3; c++) {
    const room = S.createClass(t, elm.id, { name: `Speed ${c + 1}` }).class;
    const kids = Array.from({ length: 28 }, (_, i) => { const u = S.createSchoolAccount(t, elm.id, { rosterName: `Pupil ${c + 1}-${i + 1}` }).user; S.addToClass(t, room.id, u.id); return u; });
    lessons.forEach(({ l, steps }, li) => {
      const a = L.assign(t, room.id, l.id, { dueAt: li % 2 ? '2024-03-08' : null }).classLesson;
      const snap = JSON.stringify({ levels, criteria: [{ name: 'A' }, { name: 'B' }, { name: 'C' }] });
      kids.forEach((u, ki) => {
        const at = Date.UTC(2024, 2, 8) + ((ki % 5) - 2) * DAY;
        ins("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, started_at, done_at, updated_at) VALUES (?,?,?,'done',?,?,?)", a.id, steps[0].id, u.id, at, at, at);
        ins("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, score, label, marks, started_at, done_at, updated_at) VALUES (?,?,?,'done',?, 'quiz', ?, ?,?,?)", a.id, steps[1].id, u.id, 60, ki % 2 ? '11010' : '10110', at, at, at);
        ins("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, answer, started_at, done_at, updated_at) VALUES (?,?,?,'done','An answer of a few words.',?,?,?)", a.id, steps[2].id, u.id, at, at, at);
        ins('INSERT INTO rubric_scores(class_lesson_id, step_id, user_id, rubric_id, version, snapshot, picks, points, max_points, scored_by, scored_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', a.id, steps[2].id, u.id, rubric.id, rubric.version, snap, '[2,1,3]', 9, 12, t.id, at);
        if (ki % 3) ins("INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, score, label, seconds, started_at, done_at, updated_at) VALUES (?,?,?,'done',?, 'points', 200, ?,?,?)", a.id, steps[3].id, u.id, 500 + ki, at, at, at);
      });
      if (li < 4) liveRun({ title: `Live ${li + 1}`, classId: room.id, clId: a.id, stepId: steps[3].id, scores: kids.map((u, ki) => [u, 5 + (ki % 5), 10, '1111100000'.split('').map((ch, x) => (x < 5 + (ki % 5) ? '1' : '0')).join('')]) });
    });
    for (let r = 0; r < 4; r++) liveRun({ title: `Warm-up ${r + 1}`, classId: room.id, scores: kids.slice(0, 25).map((u, ki) => [u, ki % 8, 8, '11110000']) });
    big.push(room);
  }
  // the data is what the claim is about
  const gb = P.classProgress(big[0].id);
  assert.equal(gb.students.length, 28); assert.equal(gb.lessons.length, 12);
  assert.ok(gb.students.every(p => p.score && p.score.possible >= 12 * (5 + 12)), 'every student has quiz, rubric and live scores');
  // Server time: the service that builds the gradebook, and the whole page over HTTP (render included), per class and
  // for the three together. The best of 5 runs each (a busy CI box can be slow once; the page must be able to be fast).
  await req(t, `/class/${big[0].id}/progress`);   // warm the statement cache
  const best = async fn => { let m = Infinity; for (let i = 0; i < 5; i++) { const t0 = performance.now(); await fn(); m = Math.min(m, performance.now() - t0); } return m; };
  const service = await best(() => { for (const c of big) P.classProgress(c.id); });
  const pages = await best(async () => { for (const c of big) { const r = await req(t, `/class/${c.id}/progress`); assert.equal(r.status, 200); assert.ok(r.text.includes('gb-livetbl')); } });
  const one = await best(() => req(t, `/class/${big[1].id}/progress`));
  const csv = await best(() => req(t, `/class/${big[2].id}/progress.csv`));
  const student = await best(() => req(t, `/class/${big[0].id}/student/${gb.students[3].id}`));
  console.log(`# gradebook timings (ms): service x3 ${service.toFixed(1)}, pages x3 ${pages.toFixed(1)}, one page ${one.toFixed(1)}, csv ${csv.toFixed(1)}, student page ${student.toFixed(1)}`);
  assert.ok(service < 300, `classProgress for 3 classes of 28: ${service.toFixed(1)} ms`);
  assert.ok(pages < 300, `3 gradebook pages over HTTP: ${pages.toFixed(1)} ms`);
  assert.ok(one < 300 && csv < 300 && student < 300, `one page ${one.toFixed(1)}, csv ${csv.toFixed(1)}, student ${student.toFixed(1)}`);
});
