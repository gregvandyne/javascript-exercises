// Progress (schools step 3): how each student is doing on each step of each lesson assigned to their class.
//
// A step is "done" when:
//   read      the student marks it done
//   question  the student sends an answer (they can change it; a changed answer goes back to the teacher to review)
//   game      the game reports a score or the end of a game, the student has played for 2 minutes, or marks it done
//   build     the student hands in the game they made (it is shared with their school so the teacher can play it)
//   quiz      every question is answered (checked here, once each)
//   figures   the student hands in their answers to a Figures worksheet (marked here: services/figures-steps.js)
//   proofread the student hands in their fixes to a Mistake Hunt passage set (marked here: services/proof-steps.js)
// Teachers (and school admins) see everything for their class, can write feedback on answers and mark them reviewed.
// Students see only their own progress. Removing a lesson from a class keeps its progress (it comes back if the
// lesson is assigned again); deleting a step or a lesson deletes the progress on it.
import { q, now, audit } from '../db.js';
import * as S from './schools.js';
import * as TY from './typing.js';
import * as L from './lessons.js';
import * as games from './games.js';
import { MODES } from './classlive-access.js';
import * as R from './rubrics.js';
import * as SC from './scores.js';
import * as FS from './figures-steps.js';
import * as PS from './proof-steps.js';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
export const PLAYED_ENOUGH = 120; // seconds of play that count a game step as done
/** Official games a class plays only when the teacher hosts them live (the Oomba Live built-in modes and Would You Rather
 *  Live). A lesson step on one of them says "Your teacher hosts this live" instead of Play, and its cell is written by the
 *  live run alone (classlive-results -> gameScore with the label 'live'): a student cannot open it with the lesson context,
 *  time it out, score it or mark it done by hand (CS Quest P5; routes/progress.js and routes/games.js refuse too). */
export const HOSTED_LIVE = new Set([...Object.values(MODES), 'would-you-rather-live']);
/** Is this step hosted live? Takes a joined step row (lessons.steps: game_slug / game_source) or a bare one (getStep). */
export function hostedLive(step) {
  if (!step || step.kind !== 'game' || !step.game_id) return false;
  const g = 'game_slug' in step ? { slug: step.game_slug, source: step.game_source } : games.getGame(step.game_id);
  return !!g && g.source === 'seed' && HOSTED_LIVE.has(g.slug);
}
const clipText = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{4,}/g, '\n\n\n').trim().slice(0, n);

export const get = (clId, stepId, userId) => q.get('SELECT * FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', clId, stepId, userId) || null;
/** A student's progress on one assigned lesson: { stepId: row }. */
export const forStudent = (clId, userId) => Object.fromEntries(q.all('SELECT * FROM step_progress WHERE class_lesson_id=? AND user_id=?', clId, userId).map(r => [r.step_id, r]));

/** The student, class lesson and step for a progress action, or a failure code. Only students of the class the lesson
 *  is assigned to (the whole class, or a list naming them), open lessons, steps of that lesson. */
export function context(u, clId, stepId) {
  const cl = L.getClassLesson(clId); const step = L.getStep(stepId);
  if (!u || !cl || !step || step.lesson_id !== cl.lesson_id) return fail('notFound');
  const c = S.getClass(cl.class_id); const m = c && S.classMember(c.id, u.id);
  // Students of the class who can still see it (not archived, still in the school), on open lessons assigned to them.
  if (!m || m.role !== 'student' || !S.canViewClass(u, c) || !L.isOpen(cl) || !L.assignedTo(cl.id, u.id)) return fail('notFound');
  return ok({ cl, step });
}

/** updated_at is the student's own last action on the step ("Last active", "Sent 5 minutes ago", a class's last
 *  activity): a teacher's review or marks (byStaff) leave it alone, and a row a teacher makes for a student who has done
 *  nothing (marks for a teammate) starts at 0 = never. The teacher's time is reviewed_at. */
function upsert(clId, stepId, userId, fields, { byStaff = false } = {}) {
  const old = get(clId, stepId, userId); const t = byStaff ? (old ? old.updated_at : 0) : now();
  if (!old) {
    const row = { status: 'started', score: null, label: '', plays: 0, seconds: 0, answer: '', game_id: null, feedback: '', reviewed_at: null, reviewed_by: null, done_at: null, helped: 0, ...fields };
    q.run(`INSERT INTO step_progress(class_lesson_id, step_id, user_id, status, score, label, plays, seconds, answer, game_id, feedback, reviewed_at, reviewed_by, started_at, done_at, updated_at, helped)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, clId, stepId, userId, row.status, row.score, row.label, row.plays, row.seconds, row.answer, row.game_id, row.feedback, row.reviewed_at, row.reviewed_by, now(), row.done_at, t, row.helped);
  } else {
    const row = { ...old, ...fields };
    q.run(`UPDATE step_progress SET status=?, score=?, label=?, plays=?, seconds=?, answer=?, game_id=?, feedback=?, reviewed_at=?, reviewed_by=?, done_at=?, updated_at=?, helped=?
      WHERE class_lesson_id=? AND step_id=? AND user_id=?`, row.status, row.score, row.label, row.plays, row.seconds, row.answer, row.game_id, row.feedback, row.reviewed_at, row.reviewed_by, row.done_at, t, row.helped, clId, stepId, userId);
  }
  return get(clId, stepId, userId);
}
const done = old => ({ status: 'done', done_at: (old && old.done_at) || now() });

// ---------------------------------------------------------------- student actions
/** Mark a read / game / build step done (or not done again: undo). Questions are done by answering. */
export function markDone(u, clId, stepId, isDone = true) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind === 'question') return fail('answerFirst');
  if (c.step.kind === 'story') return fail('notFound');   // done by reading to the end and answering (storyStep)
  if (L.HANDIN_KINDS.includes(c.step.kind)) return fail('notFound');   // done by handing in (figuresAnswer, proofAnswer)
  if (hostedLive(c.step)) return fail('notFound');   // the live run writes this cell
  const old = get(clId, stepId, u.id);
  if (!isDone) return ok({ row: upsert(clId, stepId, u.id, { status: 'started', done_at: null }) });
  return ok({ row: upsert(clId, stepId, u.id, done(old)) });
}
/** The student's written answer to a question step. A changed answer goes back to the teacher's "to review" list. */
export function answer(u, clId, stepId, text) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'question') return fail('notFound');
  const a = clipText(text, 3000); if (!a) return fail('answerEmpty');
  const old = get(clId, stepId, u.id);
  if (old && old.answer === a) return ok({ row: old });
  return ok({ row: upsert(clId, stepId, u.id, { answer: a, ...done(old), reviewed_at: null, reviewed_by: null }) });
}
/** A quiz step's questions for the student: text and choices, never the answers; and their marks so far. */
export function quizFor(u, clId, stepId) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.QUIZ_KIND) return fail('notFound');
  const items = quizItems(c.step);
  const old = get(clId, stepId, u.id);
  return ok({ items: items.map(it => ({ q: it.q, choices: it.choices })), marks: (old && old.marks) || '-'.repeat(items.length) });
}
const quizItems = step => { try { const x = JSON.parse(step.items || '[]'); return Array.isArray(x) ? x : []; } catch { return []; } };
/** A quiz step answer: question i, choice c. Checked here, once per question. When every question has an answer the step
 *  is done with score = % right (label 'quiz'), shown in the gradebook like a game step.
 *  -> { ok, right, answer, next (the next unanswered question, or -1), score } */
export function quizAnswer(u, clId, stepId, i, c) {
  const x = context(u, clId, stepId); if (!x.ok) return x;
  if (x.step.kind !== L.QUIZ_KIND) return fail('notFound');
  const items = quizItems(x.step);
  if (!Number.isInteger(i) || i < 0 || i >= items.length || !Number.isInteger(c) || c < 0 || c >= items[i].choices.length) return fail('badRequest');
  const old = get(clId, stepId, u.id);
  let marks = ((old && old.marks) || '').padEnd(items.length, '-').slice(0, items.length);
  if (marks[i] !== '-') return fail('answered');
  const right = c === items[i].answer;
  marks = marks.slice(0, i) + (right ? '1' : '0') + marks.slice(i + 1);
  const finished = !marks.includes('-');
  const score = finished ? Math.round((100 * [...marks].filter(m => m === '1').length) / items.length) : null;
  upsert(clId, stepId, u.id, finished ? { score, label: 'quiz', ...done(old) } : {});
  q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', marks, clId, stepId, u.id);
  return ok({ right, answer: items[i].answer, next: marks.indexOf('-'), score });
}
/** A figures step for the student (services/figures-steps.js viewFor): figures as SVGs, questions, units, what they
 *  typed; marks once handed in; answers and worked lines only once allowed (never before the due date is over). */
export function figuresFor(u, clId, stepId, { lang = 'en' } = {}) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.FIGURES_KIND) return fail('notFound');
  return ok({ view: FS.viewFor(c.step, c.cl, get(clId, stepId, u.id), { lang }) });
}
/** A figures step's answers: answers[i] is what the student typed for question i (a string, at most FS.ANSWER_CHARS).
 *  Save keeps them (started); handIn marks every question once (marks '1'/'0', score = % right, label 'figures') and the
 *  step is done. After handing in nothing changes. -> { ok, row, handedIn, score } */
export function figuresAnswer(u, clId, stepId, answers, { handIn = false } = {}) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.FIGURES_KIND) return fail('notFound');
  const items = FS.itemsOf(c.step);
  if (!items.length || !Array.isArray(answers) || answers.length > items.length) return fail('badRequest');
  const list = items.map((_, i) => String(answers[i] == null ? '' : answers[i]).replace(/[\u0000-\u001f]/g, '').trim().slice(0, FS.ANSWER_CHARS));
  const old = get(clId, stepId, u.id);
  if (FS.handedIn(old)) return fail('handedIn');
  if (handIn && !list.some(Boolean)) return fail('answerEmpty');
  const text = JSON.stringify(list);
  if (!handIn) {
    if (!old && !list.some(Boolean)) return ok({ row: null, handedIn: false, score: null });
    return ok({ row: upsert(clId, stepId, u.id, { answer: text }), handedIn: false, score: null });
  }
  const marks = FS.markAll(items, list);
  const score = Math.round((100 * [...marks].filter(m => m === '1').length) / items.length);
  upsert(clId, stepId, u.id, { answer: text, score, label: 'figures', ...done(old) });
  q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', marks, clId, stepId, u.id);
  return ok({ row: get(clId, stepId, u.id), handedIn: true, score });
}
/** A proofread step for the student (services/proof-steps.js viewFor): the words they see, their fixes so far, their
 *  marks once handed in, the key and why lines only once allowed. */
export function proofFor(u, clId, stepId) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.PROOF_KIND) return fail('notFound');
  return ok({ view: PS.viewFor(c.step, c.cl, get(clId, stepId, u.id)), cl: c.cl, step: c.step });
}
/** A proofread step's fixes: edits[i] is passage i's list of { a, b, s }. Save keeps them (started); handIn marks every
 *  mistake once (marks '1'/'0' in reading order, score = % found, label 'proofread') and the step is done. After
 *  handing in nothing changes. -> { ok, handedIn, score, view } */
export function proofAnswer(u, clId, stepId, edits, { handIn = false } = {}) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.PROOF_KIND) return fail('notFound');
  const ce = PS.cleanEdits(c.step, edits); if (!ce.ok) return ce;
  const old = get(clId, stepId, u.id);
  if (PS.handedIn(old)) return fail('handedIn');
  const text = JSON.stringify(ce.edits), any = ce.edits.some(e => e.length);
  if (!handIn) {
    if (!old && !any) return ok({ handedIn: false, score: null, view: PS.viewFor(c.step, c.cl, null) });
    const row = upsert(clId, stepId, u.id, { answer: text });
    return ok({ handedIn: false, score: null, view: PS.viewFor(c.step, c.cl, row) });
  }
  const r = PS.markAll(c.step, ce.edits);
  upsert(clId, stepId, u.id, { answer: text, score: r.score, label: 'proofread', ...done(old) });
  q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', r.marks, clId, stepId, u.id);
  return ok({ handedIn: true, score: r.score, view: PS.viewFor(c.step, c.cl, get(clId, stepId, u.id)) });
}
/** A hint on a proofread step (only when the teacher allowed hints, before handing in): the fixes so far are saved, the
 *  server finds the sentence with a mistake not fixed yet in passage i (proof-steps hintFor; the key stays here) and
 *  counts the hint in step_progress.hints (at most PS.HINTS_MAX). Nothing left to hint is not counted.
 *  -> { ok, hint: { i, a, b, k, g } | null, view } | fail('noHints' | 'handedIn' | 'badRequest' | 'words' | 'notFound') */
export function proofHint(u, clId, stepId, edits, i) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== L.PROOF_KIND) return fail('notFound');
  if (!PS.hintsOn(c.step)) return fail('noHints');
  const ce = PS.cleanEdits(c.step, edits); if (!ce.ok) return ce;
  const old = get(clId, stepId, u.id);
  if (PS.handedIn(old)) return fail('handedIn');
  const hint = PS.hintFor(c.step, ce.edits, i);
  if (hint === undefined) return fail('badRequest');
  let row = upsert(clId, stepId, u.id, { answer: JSON.stringify(ce.edits) });
  if (hint) {
    q.run('UPDATE step_progress SET hints=MIN(?, hints+1) WHERE class_lesson_id=? AND step_id=? AND user_id=?', PS.HINTS_MAX, clId, stepId, u.id);
    row = get(clId, stepId, u.id);
  }
  return ok({ hint, view: PS.viewFor(c.step, c.cl, row) });
}
/** A Story Library step (services/library.js): the student is reading the step's book, or has finished it. The book's
 *  progress lives in story_reads; this row is the class's copy: started, then done with marks (first try per question,
 *  '1'/'0'), score (% right first time) and label ('aloud' when Read to me was used, else 'own').
 *  -> { ok, row } | { ok: false, code } */
export function storyStep(u, clId, stepId, { bookId, done: isDone = false, marks = '', aloud = false } = {}) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'story' || c.step.story_id !== bookId) return fail('notFound');
  const old = get(clId, stepId, u.id);
  if (old && old.status === 'done') return ok({ row: old });   // the first finished reading is the one that counts
  const label = aloud || (old && old.label === 'aloud') ? 'aloud' : 'own';
  if (!isDone) return ok({ row: upsert(clId, stepId, u.id, { label }) });
  const m = String(marks || '');
  const score = m && !/[^01]/.test(m) ? Math.round((100 * [...m].filter(x => x === '1').length) / m.length) : null;
  upsert(clId, stepId, u.id, { label, score, ...done(old) });
  q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', m, clId, stepId, u.id);
  return ok({ row: get(clId, stepId, u.id) });
}
/** The student opened a game step's game from the lesson. */
export function gameStarted(u, clId, stepId) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'game' || hostedLive(c.step)) return fail('notFound');
  const old = get(clId, stepId, u.id);
  return ok({ row: upsert(clId, stepId, u.id, { plays: ((old && old.plays) || 0) + 1 }) });
}
/** Time played (the play page reports every 30 seconds); 2 minutes counts as done. */
export function gameTime(u, clId, stepId, seconds) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'game' || hostedLive(c.step)) return fail('notFound');
  const old = get(clId, stepId, u.id);
  const total = Math.min(24 * 3600, ((old && old.seconds) || 0) + Math.max(0, Math.min(60, Math.round(+seconds || 0))));
  return ok({ row: upsert(clId, stepId, u.id, { seconds: total, ...(total >= PLAYED_ENOUGH ? done(old) : {}) }) });
}
/** A score (best kept) or the end of a game: the step is done. score null = a game ended without a score. Also how a
 *  live run writes a hosted-live step's cell (classlive-results.js, label 'live'); the student-facing route refuses such
 *  steps before it gets here (routes/progress.js). */
/** helped: the set's result came after the teacher showed an answer (BRB.gameOver({ helped: true })). It goes with the
 *  best score; an equal score without help clears it. */
export function gameScore(u, clId, stepId, score, label = '', helped = false) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'game') return fail('notFound');
  const old = get(clId, stepId, u.id);
  const s = score === null || score === undefined || !Number.isFinite(+score) ? null : Math.max(0, Math.min(1e9, Math.floor(+score)));
  // Typing Zoo with a pass mark (services/typing.js): the best run is the one with the best grade, and the step is done
  // only once a run reaches the mark (a bare game-over, with no run, never finishes it).
  const pass = TY.passOfStep(c.step);
  if (pass) {
    const g = s === null ? null : TY.gradeOf(pass, s, label), og = old && old.score !== null ? TY.gradeOf(pass, old.score, old.label) : null;
    const best = g !== null && (og === null || g > og || (g === og && s > old.score));
    const fin = g === 100 || (old && old.status === 'done');
    return ok({ row: upsert(clId, stepId, u.id, { ...(best ? { score: s, label: String(label || '').slice(0, 40) } : {}), ...(fin ? done(old) : {}) }) });
  }
  const better = s !== null && (!old || old.score === null || s > old.score);
  const h = better ? { helped: helped ? 1 : 0 } : s !== null && old && s === old.score && old.helped && !helped ? { helped: 0 } : {};
  return ok({ row: upsert(clId, stepId, u.id, { ...(better ? { score: s, label: String(label || '').slice(0, 40) } : {}), ...h, ...done(old) }) });
}
/** A build step: the game the student is making (made once, then reopened). */
export function buildGame(u, clId, stepId, gameId) {
  const c = context(u, clId, stepId); if (!c.ok) return c;
  if (c.step.kind !== 'build') return fail('notFound');
  return ok({ row: upsert(clId, stepId, u.id, { game_id: gameId }) });
}

// ---------------------------------------------------------------- teachers
const managed = (u, clId) => { const cl = L.getClassLesson(clId); const c = cl && S.getClass(cl.class_id); return c && S.canManageClass(u, c) ? { cl, c } : null; };
/** Rubric marks as stored: one character per rubric line, '0'-'3' or '-' (not marked). From an array (numbers, digit
 *  strings; null / '' / '-' = not marked; undefined = unchanged) or such a string. Lines the input leaves out (a shorter
 *  list, a form missing a line) keep what `existing` has ('-' when there is nothing), so a caller never un-marks a line by
 *  not mentioning it. null when malformed: a value outside 0-3, or more lines than the rubric has. */
export function cleanMarks(marks, lines, existing = '') {
  const n = Math.max(0, lines | 0);
  const list = typeof marks === 'string' ? [...marks] : Array.isArray(marks) ? marks : null;
  if (!list || list.length > n) return null;
  const was = [...String(existing || '').padEnd(n, '-').slice(0, n)].map(ch => (/^[0-3]$/.test(ch) ? ch : '-'));
  let out = '';
  for (let i = 0; i < n; i++) {
    const v = list[i];
    if (v === undefined) { out += was[i]; continue; }
    if (v === null || v === '' || v === '-') { out += '-'; continue; }
    const s = String(v).trim();
    if (!/^[0-3]$/.test(s)) return null;
    out += s;
  }
  return out;
}
/** The marks a step can take: its rubric's lines (question and build steps only), else 0. */
const rubricLines = step => (L.RUBRIC_KINDS.includes(step.kind) ? L.rubricOf(step).length : 0);
/** The maximum number of teammates one review can mark along (a roster, never more). */
export const ALSO_MARK_MAX = 60;
/**
 * A teacher's review of one student's step (question and build steps only). feedback: a string replaces the feedback,
 * even '' (the form's Send with an empty box, which also marks the answer read, as always); left out (undefined) it is
 * kept. marks, on steps with a rubric: a 0-3 mark per rubric line ([2, 3, null, 1] or '23-1'; a line left out or
 * undefined is unchanged, null / '' / '-' un-marks it; marks left out = unchanged). reviewed_at ("the teacher has seen
 * this") is set when feedback is sent and otherwise only on a row with no unread answer: marks alone (a bulk tool,
 * "Also mark these teammates") never take an unread answer off the to-review list or tell the student it was read.
 * alsoMark: up to ALSO_MARK_MAX classmates who get the same marks on this step (a capstone team: the captain handed the
 * game in; the others never opened the step), a row is made for them if they have none; the feedback stays with the one
 * student; nothing happens when every mark is '-'. -> { ok, marks, alsoMarked: [ids] }
 */
export function review(u, clId, stepId, userId, feedback, { marks, alsoMark = [] } = {}) {
  const m = managed(u, clId); if (!m) return fail('notFound');
  const step = L.getStep(stepId); if (!step || step.lesson_id !== m.cl.lesson_id) return fail('notFound');
  // Only question and build steps have anything to review (a text or game step row never takes feedback, as before).
  if (!L.RUBRIC_KINDS.includes(step.kind)) return fail('notFound');
  const row = get(clId, stepId, userId);
  const lines = rubricLines(step);
  let clean = null;
  if (marks !== undefined && marks !== null) {
    if (lines) { clean = cleanMarks(marks, lines, row && row.marks); if (clean === null) return fail('badMarks'); }
    else {
      // No rubric on this step: only "nothing marked" is accepted (a form with no radios sends nothing; an API sending digits is wrong).
      const list = typeof marks === 'string' ? [...marks] : Array.isArray(marks) ? marks : null;
      if (!list || list.some(v => !(v === null || v === undefined || v === '' || v === '-'))) return fail('badMarks');
    }
  }
  // Something to review: an answer, a build row (started or handed in), or marks for a student of the class.
  const student = id => { const cm = S.classMember(m.c.id, id); return !!cm && cm.role === 'student' && L.assignedTo(m.cl.id, id); };
  if (!row && !(clean !== null && student(userId))) return fail('notFound');
  if (row && !row.answer && step.kind === 'question' && clean === null) return fail('notFound');
  const t = now();
  const unread = r => !!(r && r.answer && !r.reviewed_at);
  const seen = { reviewed_at: t, reviewed_by: u.id };
  upsert(clId, stepId, userId, { ...(feedback !== undefined ? { feedback: clipText(feedback, 2000) } : {}), ...(feedback !== undefined || !unread(row) ? seen : {}) }, { byStaff: true });
  if (clean !== null) q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', clean, clId, stepId, userId);
  const also = [];
  if (clean !== null && lines && /[0-3]/.test(clean)) {
    for (const id of [...new Set([].concat(alsoMark || []).map(String))].slice(0, ALSO_MARK_MAX)) {
      if (!id || id === userId || !student(id)) continue;
      upsert(clId, stepId, id, unread(get(clId, stepId, id)) ? {} : seen, { byStaff: true });
      q.run('UPDATE step_progress SET marks=? WHERE class_lesson_id=? AND step_id=? AND user_id=?', clean, clId, stepId, id);
      also.push(id);
    }
  }
  audit(u.id, 'progress.review', clId, { step: stepId, user: userId, ...(clean !== null ? { marks: clean } : {}), ...(also.length ? { also: also.length } : {}) });
  return ok({ marks: clean === null ? (row && row.marks) || '' : clean, alsoMarked: also });
}

/** Steps that count for a lesson (all its steps, in order). */
const stepsOf = lessonId => q.all('SELECT id, kind, title, game_id, position, rubric, rubric_id, standards FROM lesson_steps WHERE lesson_id=? ORDER BY position, created_at', lessonId);
const studentsOf = classId => S.roster(classId).filter(p => p.role === 'student');

/** One assigned lesson: its steps, the students it is assigned to (the class's, or those listed: picked > 0), and every
 *  such student's progress on every step. */
export function lessonProgress(clId) {
  const cl = L.getClassLesson(clId); if (!cl) return null;
  const picked = new Set(L.studentsOfLesson(cl.id));
  const st = stepsOf(cl.lesson_id), students = studentsOf(cl.class_id).filter(p => !picked.size || picked.has(p.id));
  cl.some = picked.size > 0; cl.picked = cl.some ? students.length : 0;
  const rows = q.all('SELECT * FROM step_progress WHERE class_lesson_id=?', clId);
  const by = new Map(rows.map(r => [`${r.user_id}:${r.step_id}`, r]));
  const ids = new Set(st.map(s => s.id));
  // Scores (services/scores.js) and work first done after the due day ended (lateFrom: the school's time zone).
  const items = SC.classItems(cl.class_id), lateFrom = L.lateFrom(cl);
  return {
    cl, steps: st, lateFrom,
    students: students.map(p => {
      const cells = st.map(s => by.get(`${p.id}:${s.id}`) || null);
      const doneN = cells.filter(x => x && x.status === 'done').length;
      const last = rows.filter(r => r.user_id === p.id && ids.has(r.step_id)).reduce((m, r) => Math.max(m, r.updated_at), 0);
      const isNew = (x, i) => !!(x && x.answer && !x.reviewed_at && st[i].kind === 'question');
      const firstNew = cells.findIndex(isNew);
      const its = items.get(`${p.id}:${clId}`) || [];
      const lateSteps = lateFrom === null ? 0 : cells.filter(x => x && x.status === 'done' && x.done_at >= lateFrom).length;
      return { ...p, cells, done: doneN, total: st.length, items: its, score: SC.total(its), lateSteps, last: last || null, toRead: cells.filter(isNew).length, firstNew: firstNew >= 0 ? st[firstNew].id : null };
    }),
  };
}
/** The class gradebook: every assigned lesson × every student, as done/total, plus answers waiting to be reviewed.
 *  A lesson that hasn't opened yet is 'locked': never late, and left out of the overall figure. Open / due / late follow
 *  the school's time zone when it has one (the rows carry tz); t is "now" (tests pass an instant). A lesson assigned to
 *  some students has a 'na' (not assigned) cell for the others: nothing in it, so it counts nowhere (Work done, Score,
 *  late, rubric and quiz figures), even when the student did work in it before the list changed. */
export function classProgress(classId, t = now()) {
  const lessons = L.classPlan(classId).flatMap(g => g.lessons.map(cl => ({ ...cl, unit: g.unit, locked: !L.isOpen(cl, t), due: L.dueState(cl, t) })));
  const students = studentsOf(classId), picks = L.picksIn(classId);
  const na = (p, cl) => picks.has(cl.id) && !picks.get(cl.id).has(p.id);
  // some: assigned to some students; picked: how many of the class's students now.
  for (const cl of lessons) { cl.some = picks.has(cl.id); cl.picked = cl.some ? students.filter(p => picks.get(cl.id).has(p.id)).length : 0; }
  const counts = q.all(`SELECT p.class_lesson_id cl, p.user_id u, SUM(p.status='done') done, SUM(p.answer!='' AND p.reviewed_at IS NULL AND s.kind='question') toread, MAX(p.updated_at) last,
      AVG(CASE WHEN s.kind IN ('quiz','figures','proofread') AND p.status='done' AND p.score IS NOT NULL THEN p.score END) quiz, SUM(s.kind IN ('quiz','figures','proofread') AND p.status='done' AND p.score IS NOT NULL) quizzes,
      SUM(p.helped) helped
    FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=? AND ${L.assignedSql('c.id', 'p.user_id')} GROUP BY p.class_lesson_id, p.user_id`, classId);
  const by = new Map(counts.map(r => [`${r.u}:${r.cl}`, r]));
  // Rubric scores (services/rubrics.js): points / most possible per lesson, on lessons with a rubric (hasRubric).
  const pts = R.classTotals(classId), withRubric = R.lessonsWithRubrics([...new Set(lessons.map(cl => cl.lesson_id))]);
  // Quiz and figures steps (checked by the site: score = % right): the lesson's quiz score is the mean of its finished ones.
  const lessonIds = [...new Set(lessons.map(cl => cl.lesson_id))];
  const withQuiz = new Set(lessonIds.length ? q.all(`SELECT DISTINCT lesson_id FROM lesson_steps WHERE kind IN ('quiz','figures','proofread') AND lesson_id IN (${lessonIds.map(() => '?').join(',')})`, ...lessonIds).map(r => r.lesson_id) : []);
  for (const cl of lessons) { cl.hasRubric = withRubric.has(cl.lesson_id); cl.hasQuiz = withQuiz.has(cl.lesson_id); }
  // Scores (services/scores.js): the scored items of each lesson, and steps first done after the due day ended.
  const items = SC.classItems(classId), lateN = SC.lateSteps(classId, lessons);
  const rows = students.map(p => ({ ...p, cells: lessons.map(cl => {
    if (na(p, cl)) return { na: true, done: 0, total: 0, toRead: 0, last: null, locked: cl.locked, late: false, lateSteps: 0, lateDone: false, items: [], score: null,
      quiz: null, quizzes: 0, helped: 0, points: null, maxPoints: null, scored: 0, criteria: 0 };
    const r = by.get(`${p.id}:${cl.id}`); const done = r ? Math.min(r.done, cl.steps) : 0;
    const sc = pts.get(`${p.id}:${cl.id}`) || null;
    const its = items.get(`${p.id}:${cl.id}`) || [], lateSteps = lateN.get(`${p.id}:${cl.id}`) || 0;
    return { done, total: cl.steps, toRead: r ? r.toread : 0, last: (r && r.last) || null, locked: cl.locked, late: !cl.locked && cl.due === 'late' && done < cl.steps,
      // finished, but after the due day (the school's time zone): 'late' above is work still missing after it
      lateSteps, lateDone: !cl.locked && cl.steps > 0 && done >= cl.steps && lateSteps > 0,
      items: its, score: SC.total(its),
      quiz: r && r.quizzes ? Math.round(r.quiz) : null, quizzes: r ? r.quizzes || 0 : 0,
      // game steps whose kept score came after the teacher showed an answer (Oomba Canvas 1.3.0); staff-only
      helped: r ? r.helped || 0 : 0,
      points: sc ? sc.points : null, maxPoints: sc ? sc.max : null, scored: sc ? sc.scored : 0, criteria: sc ? sc.of : 0 };
  }) }));
  for (const p of rows) { p.overall = overall(p.cells); p.rubric = rubricOverall(p.cells); p.quiz = quizOverall(p.cells); p.score = scoreOverall(p.cells); p.lateCount = p.cells.filter(x => x.late || x.lateDone).length; }
  return { lessons, students: rows, toRead: rows.reduce((n, p) => n + p.cells.reduce((m, x) => m + (x.toRead || 0), 0), 0), anyRubric: lessons.some(cl => cl.hasRubric) || rows.some(p => p.rubric), anyQuiz: lessons.some(cl => cl.hasQuiz) };
}
/** A gradebook row's open work (lessons open and assigned to the student, with steps): is there any? */
export const hasOpenWork = p => p.cells.some(x => !x.locked && !x.na && x.total);
/** "Work done": the percentage of steps done across the lessons that are open (one rule for the page and the CSV).
 *  It says nothing about right answers: that is the Score (scoreOverall). */
export function overall(cells) {
  const open = cells.filter(x => !x.locked);
  const total = open.reduce((n, x) => n + x.total, 0);
  return total ? Math.round((100 * open.reduce((n, x) => n + Math.min(x.done, x.total), 0)) / total) : 0;
}
/** The Score across the open lessons: points earned of points possible over everything scored (quizzes, live game
 *  steps, rubrics; services/scores.js), { earned, possible, pct }, or null when nothing is scored yet. */
export function scoreOverall(cells) {
  return SC.total(cells.filter(x => !x.locked).flatMap(x => x.items || []));
}
/** The mean quiz score (% right) over every finished quiz of the open lessons, or null with none finished. */
export function quizOverall(cells) {
  const qz = cells.filter(x => !x.locked && x.quizzes > 0);
  const n = qz.reduce((a, x) => a + x.quizzes, 0);
  return n ? Math.round(qz.reduce((a, x) => a + x.quiz * x.quizzes, 0) / n) : null;
}
/** A quiz row's result: { right, total, pct } once every question is answered (marks '1'/'0' per question), else null. */
export function quizResult(row) {
  const m = String((row && row.marks) || '');
  if (!row || row.status !== 'done' || !m || /[^01]/.test(m)) return null;
  const right = [...m].filter(c => c === '1').length;
  return { right, total: m.length, pct: Math.round((100 * right) / m.length) };
}
/** Rubric points across every scored lesson: { points, max, pct } or null when nothing is scored yet. */
export function rubricOverall(cells) {
  const sc = cells.filter(x => x.maxPoints > 0);
  if (!sc.length) return null;
  const points = sc.reduce((n, x) => n + x.points, 0), max = sc.reduce((n, x) => n + x.maxPoints, 0);
  return { points, max, pct: R.percent(points, max) };
}
/** Answers waiting for a teacher to review, per class (for My classes). Only answers to question steps count: a step
 *  changed to another type keeps its old answers, but there is nothing left to review. */
export const toReadByClass = classIds => (classIds.length ? Object.fromEntries(q.all(`SELECT c.class_id cid, COUNT(*) n FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id
  JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id AND s.kind='question'
  JOIN class_members m ON m.class_id=c.class_id AND m.user_id=p.user_id AND m.status='active' AND m.role='student'
  WHERE p.answer!='' AND p.reviewed_at IS NULL AND c.removed_at IS NULL AND ${L.assignedSql('c.id', 'p.user_id')} AND c.class_id IN (${classIds.map(() => '?').join(',')}) GROUP BY c.class_id`, ...classIds).map(r => [r.cid, r.n])) : {});
/** Done / total steps per assigned lesson for one student (for their class page). */
export function studentSummary(classId, userId) {
  const rows = q.all(`SELECT p.class_lesson_id cl, SUM(p.status='done') done FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id
    JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id WHERE c.class_id=? AND c.removed_at IS NULL AND p.user_id=? AND ${L.assignedSql('c.id', 'p.user_id')} GROUP BY p.class_lesson_id`, classId, userId);
  return Object.fromEntries(rows.map(r => [r.cl, r.done]));
}

/** A student's open lessons not finished yet in one class (only those assigned to them), soonest due first: [{ id, title, due_at, left }]. */
export function toDoFor(classId, userId, t = now()) {
  const done = studentSummary(classId, userId);
  return L.classPlan(classId, { openOnly: true, userId }).flatMap(g => g.lessons).filter(cl => cl.steps > 0 && L.isOpen(cl, t) && (done[cl.id] || 0) < cl.steps)
    .map(cl => ({ id: cl.id, title: cl.title, due_at: cl.due_at || null, left: cl.steps - (done[cl.id] || 0), cl }))
    .sort((a, z) => (a.due_at || Infinity) - (z.due_at || Infinity));
}
/** Answers waiting to be reviewed in a class, per assigned lesson (current students only): [{ cl, title, n }]. */
export function toReadByLesson(classId) {
  return q.all(`SELECT c.id cl, l.title, COUNT(*) n FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL
    JOIN lessons l ON l.id=c.lesson_id JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
    JOIN class_members m ON m.class_id=c.class_id AND m.user_id=p.user_id AND m.status='active' AND m.role='student'
    WHERE c.class_id=? AND s.kind='question' AND p.answer!='' AND p.reviewed_at IS NULL AND ${L.assignedSql('c.id', 'p.user_id')} GROUP BY c.id ORDER BY c.position`, classId);
}
/** The first answer waiting for review for each student in a class lesson: { 'userId:clId': stepId }. */
export function firstNewAnswers(classId) {
  const rows = q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.step_id s, s.position pos FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL
    JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id WHERE c.class_id=? AND s.kind='question' AND p.answer!='' AND p.reviewed_at IS NULL AND ${L.assignedSql('c.id', 'p.user_id')} ORDER BY s.position, s.created_at`, classId);
  const out = {}; for (const r of rows) { const k = `${r.u}:${r.cl}`; if (!out[k]) out[k] = r.s; } return out;
}
/** Done / students for each assigned lesson in a class (students: those it is assigned to; some: assigned to some
 *  students, not the whole class), and answers to review (for the class's Lessons tab rows). */
export function lessonSummaries(classId) {
  const gb = classProgress(classId);
  return Object.fromEntries(gb.lessons.map((cl, i) => [cl.id, { done: gb.students.filter(p => p.cells[i].total && p.cells[i].done >= p.cells[i].total).length, students: gb.students.filter(p => !p.cells[i].na).length, some: !!cl.some, toRead: gb.students.reduce((n, p) => n + (p.cells[i].toRead || 0), 0) }]));
}
