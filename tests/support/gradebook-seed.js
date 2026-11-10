// A small school for tests/e2e/gradebook-scores.spec.js (run once on an empty data folder, BRB_DATA_DIR): a teacher, a
// class of six with roster names, lessons with a quiz, a rubric-scored question and a live-hosted game step, a due date
// in the past with work on time, late and missing, and saved live games. Prints { classId, students, ... } as JSON.
// Test data only: every password here is a throwaway for a database that is deleted after the run.
import { q, uid } from '../../server/db.js';
import { createUser } from '../../server/auth.js';
import * as S from '../../server/services/schools.js';
import * as L from '../../server/services/lessons.js';
import * as P from '../../server/services/progress.js';
import * as R from '../../server/services/rubrics.js';
import * as games from '../../server/services/games.js';

const PW = process.env.GB_E2E_PASSWORD || 'gradebook-e2e-pass-1';
const DAY = 864e5;
const admin = createUser({ username: 'GbAdmin', password: PW, role: 'admin' });
const school = S.createSchool(admin, { name: 'Maple Grove Elementary' }).school;
S.updateSchool(admin, school.id, { settings: { timeZone: 'America/Chicago' } });
const teacher = createUser({ username: 'GbTeacher', password: PW, displayName: 'Ms Rivera', avatar: '🍎', color: '#2f6bff' });
S.addMember(admin, school.id, teacher.id, 'teacher', { rosterName: 'Elena Rivera' });
const other = createUser({ username: 'GbOtherTeacher', password: PW, displayName: 'Mr Okafor' });
S.addMember(admin, school.id, other.id, 'teacher', { rosterName: 'Chidi Okafor' });
const cls = S.createClass(teacher, school.id, { name: 'Room 12', grade: '4' }).class;
const student = createUser({ username: 'GbStudent', password: PW, displayName: 'GbStudent', avatar: '🐙', color: '#e0457b' });
q.run('UPDATE users SET managed_school=? WHERE id=?', school.id, student.id);
S.addMember(teacher, school.id, student.id, 'student', { rosterName: 'Priya Natarajan-Whitfield', grade: '4' });
S.addToClass(teacher, cls.id, student.id);
const kids = [student, ...['Ava Lopez', 'Noah Kim', 'Mia Patel', 'Leo Chen', 'Zoe Abara'].map(n => { const r = S.createSchoolAccount(teacher, school.id, { rosterName: n, grade: '4' }); S.addToClass(teacher, cls.id, r.user.id); return r.user; })];

const g = games.createGame(admin.id, { title: 'Fraction Quest' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: admin.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);

const levels = [{ label: 'Beginning', points: 1 }, { label: 'Developing', points: 2 }, { label: 'Secure', points: 3 }, { label: 'Excellent', points: 4 }];
const rubric = R.createRubric(teacher, school.id, { title: 'Explain your thinking', levels, criteria: [{ name: 'Ideas' }, { name: 'Reasons' }, { name: 'Words' }] }).rubric;
const QUIZ = [['1/2 + 1/2?', ['1', '2/4']], ['1/4 + 2/4?', ['3/4', '3/8']], ['Which is bigger?', ['1/2', '1/3']], ['2/8 is the same as', ['1/4', '1/2']], ['3/3 is', ['1', '3']]].map(([text, choices]) => ({ q: text, choices, answer: 0 }));

const fractions = L.createLesson(teacher, school.id, { title: 'Adding fractions' }).lesson;
const read = L.addStep(teacher, fractions.id, { kind: 'text', title: 'Read', body: 'Fractions with the same denominator.' }).step;
const quiz = L.addQuizStep(teacher, fractions.id, { title: 'Exit ticket', items: QUIZ }).step;
const ask = L.addStep(teacher, fractions.id, { kind: 'question', title: 'Explain', body: 'Why does the denominator stay the same?', rubricId: rubric.id }).step;
const play = L.addStep(teacher, fractions.id, { kind: 'game', gameId: g.id, title: 'Class game' }).step;
const dueDay = new Date(Date.now() - 6 * DAY).toISOString().slice(0, 10);
const cl = L.assign(teacher, cls.id, fractions.id, { dueAt: dueDay }).classLesson;
const words = L.createLesson(teacher, school.id, { title: 'Word detectives: spelling patterns and long vowel sounds' }).lesson;
const wRead = L.addStep(teacher, words.id, { kind: 'text', body: 'Find the pattern.' }).step;
const wQuiz = L.addQuizStep(teacher, words.id, { title: 'Quick check', items: QUIZ.slice(0, 4) }).step;
const cl2 = L.assign(teacher, cls.id, words.id).classLesson;
const later = L.createLesson(teacher, school.id, { title: 'Decimals' }).lesson;
L.addStep(teacher, later.id, { kind: 'text', body: 'Tenths.' });
L.assign(teacher, cls.id, later.id, { opensAt: '2999-01-01' });

const doQuiz = (u, clId, step, picks) => picks.forEach((c, i) => P.quizAnswer(u, clId, step.id, i, c));
const when = (clId, stepIds, userId, t) => { for (const sid of stepIds) q.run('UPDATE step_progress SET done_at=?, updated_at=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', t, t, clId, sid, userId); };
const lateFrom = L.lateFrom(L.getClassLesson(cl.id));
const all = [read.id, quiz.id, ask.id, play.id];
const [priya, ava, noah, mia, leo] = kids;
// Priya: all done on time, strong. Ava: every quiz answer wrong, all done (100% done, low score). Noah: done late.
// Mia: half done, missing after the due date. Leo: nothing in this lesson. Zoe: nothing at all.
for (const [u, picks] of [[priya, [0, 0, 0, 0, 1]], [ava, [1, 1, 1, 1, 1]], [noah, [0, 0, 1, 0, 0]]]) {
  P.markDone(u, cl.id, read.id); doQuiz(u, cl.id, quiz, picks);
  P.answer(u, cl.id, ask.id, u === priya ? 'The pieces are the same size, so you only count how many there are.' : u === ava ? 'You add the top and the bottom.' : 'Because eighths stay eighths.');
  P.gameScore(u, cl.id, play.id, 700, 'live');
}
R.saveScore(teacher, cl.id, ask.id, priya.id, { picks: [3, 2, 3], feedback: 'Lovely explanation, Priya. Next time draw the fraction bar too.' });
P.review(teacher, cl.id, ask.id, priya.id, 'Lovely explanation, Priya.');
R.saveScore(teacher, cl.id, ask.id, ava.id, { picks: [0, 1, 1] });
P.review(teacher, cl.id, ask.id, ava.id, 'Look again at what the bottom number means.');
when(cl.id, all, priya.id, lateFrom - 2 * DAY); when(cl.id, all, ava.id, lateFrom - DAY);
when(cl.id, [read.id, quiz.id], noah.id, lateFrom - DAY); when(cl.id, [ask.id, play.id], noah.id, lateFrom + 2 * DAY);
P.markDone(mia, cl.id, read.id); doQuiz(mia, cl.id, quiz, [0, 0, 0, 1, 1]);
for (const [u, picks] of [[priya, [0, 0, 0, 0]], [ava, [0, 1, 1, 0]], [mia, [0, 0, 1, 0]], [leo, [0, 0, 0, 1]]]) { P.markDone(u, cl2.id, wRead.id); doQuiz(u, cl2.id, wQuiz, picks); }

function liveRun(title, daysAgo, scores, link = false, mode = 'battle') {
  const id = uid(12), ended = Date.now() - daysAgo * DAY;
  q.run(`INSERT INTO live_runs(id, host_id, class_id, class_lesson_id, step_id, audience, mode, title, started_at, ended_at, players, guests, items, scored_by)
    VALUES (?,?,?,?,?,'class',?,?,?,?,?,0,'[]','server')`, id, teacher.id, cls.id, link ? cl.id : null, link ? play.id : null, mode, title, ended - 600e3, ended, scores.length);
  scores.forEach(([u, marks], i) => q.run('INSERT INTO live_run_scores(run_id, user_id, score, rank, correct, answered, team, bonus, marks) VALUES (?,?,?,?,?,?,0,0,?)', id, u.id,
    [...marks].filter(c => c === '1').length * 100, i + 1, [...marks].filter(c => c === '1').length, [...marks].filter(c => c !== '-').length, marks));
  return id;
}
liveRun('Fraction Quest', 8, [[priya, '1111111101'], [ava, '1100100010'], [noah, '1111011000'], [leo, '1110001-1-']], true);
liveRun('Friday warm-up', 3, [[priya, '11111110'], [noah, '11011010'], [mia, '11110000'], [leo, '10100000'], [kids[5], '11111011']]);
liveRun('Would you rather: animals', 1, [[priya, '-----'], [ava, '-----'], [mia, '-----']], false, 'wyr');

console.log(JSON.stringify({ password: PW, classId: cls.id, clId: cl.id, askId: ask.id, students: kids.map(u => ({ id: u.id, username: u.username })), teacher: teacher.username, other: other.username, student: student.username }));
