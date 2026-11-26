// Scores (docs/decisions.md "Real scores in the gradebook"): what a student got right, apart from how much they did.
//
// "Work done" (services/progress.js overall) is steps done of steps open: a child who answers everything wrong still
// shows 100 %. The Score is points earned of points possible over the work that has a right answer or a teacher's rubric:
//   quiz     a finished quiz step: 1 point per question, the points are the questions answered right (checked by the site)
//            (a Story Library book's questions count the same way: right on the first try; so does a Figures worksheet
//            handed in: 1 point per question, marked by the site)
//   live     a game step the teacher hosted live for the class: 1 point per question asked, the student's best run
//   rubric   a rubric from the library, scored by the teacher: the points given of the most possible (only criteria with
//            a level; a score from a swapped-out rubric is left out, as everywhere: rubrics.scoreCounts)
//   marks    a step's own 0-3 rubric lines (CS Quest): each marked line is worth 3
//   typing   a Typing Zoo step assigned with a pass mark: its best run's grade (services/typing.js), out of 10
// Everything is weighted by its points possible: Score = 100 x sum(earned) / sum(possible). Work not done or not scored
// yet is not in it (Work done shows that), so nothing scored reads "–", never 0 %. A game played outside a live run
// reports a bare number with no maximum, so it has no place in a percentage and is left out.
// Live runs that are not a lesson's step are shown in the gradebook's Live games table and stay out of the Score.
// Work in a lesson assigned to some students counts only for those students (lessons.assignedSql).
// Students only ever appear here as account ids: no name leaves this file, and nothing is sent anywhere.
import { q } from '../db.js';
import * as L from './lessons.js';
import * as TY from './typing.js';

const digits = (s, re) => { let n = 0; for (const ch of s) if (re.test(ch)) n++; return n; };
/** { earned, possible, pct } over items, or null when nothing is scored. */
export function total(items) {
  let earned = 0, possible = 0;
  for (const it of items || []) { earned += it.earned; possible += it.possible; }
  return possible > 0 ? { earned, possible, pct: Math.round((100 * earned) / possible) } : null;
}
/** Points as text: "7/10" (halves kept: "7.5/10"). */
export const pointsText = (p, m) => `${+(+p).toFixed(1)}/${+(+m).toFixed(1)}`;

/** Students' results in live runs: rows [{ run, u, correct, answered, marks }] -> Map 'run:u' -> { right, total } | null.
 *  A run with right-or-wrong marks counts every question asked (one the student skipped is not right); a run without
 *  marks where somebody got something right (an older run, Tug of Math) counts the answers each student gave; a run
 *  where nothing was right or wrong for anyone (Would You Rather: votes; drawing) has no result: the student played. */
export function liveResults(rows) {
  const marked = new Set(), counted = new Set();
  for (const r of rows) { if (/[01]/.test(r.marks || '')) marked.add(r.run); if (r.correct > 0) counted.add(r.run); }
  const out = new Map();
  for (const r of rows) {
    const m = String(r.marks || '');
    out.set(`${r.run}:${r.u}`, marked.has(r.run) && m.length ? { right: digits(m, /1/), total: m.length }
      : !marked.has(r.run) && counted.has(r.run) && r.answered > 0 ? { right: Math.min(r.correct, r.answered), total: r.answered } : null);
  }
  return out;
}

/**
 * Every scored item of a class's current assignments (or of one student: userId):
 * Map 'userId:classLessonId' -> [{ kind: 'quiz' | 'live' | 'rubric' | 'marks', stepId ('' = the whole lesson's rubric),
 *   title (the step's title, may be ''), stepKind, pos, earned, possible }] in step order.
 */
export function classItems(classId, { userId = null } = {}) {
  const who = userId ? [userId] : [];
  const out = new Map();
  const add = (u, cl, it) => { const k = `${u}:${cl}`; let a = out.get(k); if (!a) out.set(k, a = []); a.push(it); };
  // Library rubrics first: a step scored with one never also counts its own 0-3 lines.
  const lib = new Set();
  for (const r of q.all(`SELECT r.user_id u, r.class_lesson_id cl, r.step_id sid, r.points, r.max_points, s.title, s.kind, s.position pos FROM rubric_scores r
      JOIN class_lessons c ON c.id=r.class_lesson_id AND c.removed_at IS NULL JOIN lessons l ON l.id=c.lesson_id
      LEFT JOIN lesson_steps s ON r.step_id!='' AND s.id=r.step_id AND s.lesson_id=c.lesson_id
      WHERE c.class_id=? AND r.max_points>0 AND (r.step_id='' OR s.id IS NOT NULL) AND ${L.assignedSql('c.id', 'r.user_id')} ${userId ? 'AND r.user_id=?' : ''}
        AND COALESCE(CASE WHEN r.step_id='' THEN l.rubric_id WHEN s.kind IN ('question','build') THEN s.rubric_id END, r.rubric_id)=r.rubric_id`, classId, ...who)) {
    lib.add(`${r.u}:${r.cl}:${r.sid}`);
    add(r.u, r.cl, { kind: 'rubric', stepId: r.sid, title: r.title || '', stepKind: r.kind || '', pos: r.sid ? r.pos : 1e9, earned: r.points, possible: r.max_points });
  }
  for (const r of q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.step_id sid, p.marks, p.status, s.title, s.kind, s.position pos, s.rubric FROM step_progress p
      JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
      WHERE c.class_id=? AND p.marks!='' AND s.kind IN ('quiz','story','figures','proofread','manip','question','build') AND ${L.assignedSql('c.id', 'p.user_id')} ${userId ? 'AND p.user_id=?' : ''}`, classId, ...who)) {
    const base = { stepId: r.sid, title: r.title || '', stepKind: r.kind, pos: r.pos };
    // A Story Library book's 3 questions (services/library.js): 1 point each, right on the first try.
    if (r.kind === L.QUIZ_KIND || r.kind === 'story' || r.kind === L.FIGURES_KIND || r.kind === L.PROOF_KIND || r.kind === L.MANIP_KIND) {
      if (r.status === 'done' && !/[^01]/.test(r.marks)) add(r.u, r.cl, { kind: 'quiz', ...base, earned: digits(r.marks, /1/), possible: r.marks.length });
      continue;
    }
    if (lib.has(`${r.u}:${r.cl}:${r.sid}`)) continue;
    const lines = L.rubricOf(r).length, m = r.marks.slice(0, lines), n = digits(m, /[0-3]/);
    if (n) add(r.u, r.cl, { kind: 'marks', ...base, earned: [...m].reduce((a, ch) => a + (/[0-3]/.test(ch) ? +ch : 0), 0), possible: 3 * n });
  }
  // A game step hosted live for the class: the student's best run (the gradebook keeps the best score too).
  const runs = q.all(`SELECT r.id run, r.class_lesson_id cl, r.step_id sid, sc.user_id u, sc.correct, sc.answered, sc.marks, s.title, s.kind, s.position pos FROM live_runs r
      JOIN live_run_scores sc ON sc.run_id=r.id JOIN class_lessons c ON c.id=r.class_lesson_id AND c.removed_at IS NULL AND c.class_id=r.class_id
      JOIN lesson_steps s ON s.id=r.step_id AND s.lesson_id=c.lesson_id AND s.kind='game'
      WHERE r.class_id=? AND ${L.assignedSql('c.id', 'sc.user_id')} ${userId ? 'AND r.id IN (SELECT run_id FROM live_run_scores WHERE user_id=?)' : ''}`, classId, ...who);
  const res = liveResults(runs), best = new Map();
  for (const r of runs) {
    if (userId && r.u !== userId) continue;
    const x = res.get(`${r.run}:${r.u}`); if (!x || !x.total) continue;
    const k = `${r.u}:${r.cl}:${r.sid}`, old = best.get(k);
    if (!old || x.right / x.total > old.earned / old.possible) best.set(k, { u: r.u, cl: r.cl, kind: 'live', stepId: r.sid, title: r.title || '', stepKind: r.kind, pos: r.pos, earned: x.right, possible: x.total });
  }
  for (const { u, cl, ...it } of best.values()) add(u, cl, it);
  // A Typing Zoo step with a pass mark (services/typing.js gradeOf): the best run's grade, out of GRADE_POINTS.
  for (const r of q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.step_id sid, p.score, p.label, s.id, s.kind, s.game_id, s.options, s.title, s.position pos FROM step_progress p
      JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
      JOIN games g ON g.id=s.game_id AND g.slug=? AND g.source='seed'
      WHERE c.class_id=? AND s.kind='game' AND p.score IS NOT NULL AND s.options LIKE '%mode=%' AND ${L.assignedSql('c.id', 'p.user_id')} ${userId ? 'AND p.user_id=?' : ''}`, TY.SLUG, classId, ...who)) {
    const pass = TY.passOfStep(r), g = TY.gradeOf(pass, r.score, r.label);
    if (g !== null) add(r.u, r.cl, { kind: 'typing', stepId: r.sid, title: r.title || '', stepKind: 'game', pos: r.pos, earned: (g * TY.GRADE_POINTS) / 100, possible: TY.GRADE_POINTS });
  }
  // A Homeroom lesson graded by Score (services/homeroom-lessons.js): its problems are the points. Arithmetic Lab reports
  // how many the student got right; Crossword and Algebra Builder finish only once everything is right (the play page's
  // end with won: label 'won'), so a finished run is all of them. Played without finishing (2 minutes, or "I played
  // it"): not scored, so it reads "–", never 0 %. Flashcards reports a percent (Learn all mastered: 100, a Test: its % right;
  // the best is kept), so the cards earned are that share of the cards; a Match round alone ends won with no number:
  // done, not scored.
  for (const r of q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.step_id sid, p.score, p.label, h.problems n, g.slug, s.title, s.position pos FROM step_progress p
      JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL
      JOIN homeroom_handouts h ON h.class_lesson_id=c.id AND h.hr_lesson IS NOT NULL AND h.grade='score' AND h.problems>0
      JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id AND s.kind='game' JOIN games g ON g.id=s.game_id
      WHERE c.class_id=? AND p.status='done' AND ${L.assignedSql('c.id', 'p.user_id')} ${userId ? 'AND p.user_id=?' : ''}`, classId, ...who)) {
    const earned = r.slug === 'arithmetic-lab' ? (r.score === null ? null : Math.min(r.score, r.n))
      : r.slug === 'flashcards' ? (r.score === null ? null : Math.round((Math.min(r.score, 100) * r.n) / 100))
        : r.label === 'won' || r.score !== null ? r.n : null;
    if (earned !== null) add(r.u, r.cl, { kind: 'lesson', stepId: r.sid, title: r.title || '', stepKind: 'game', pos: r.pos, earned, possible: r.n });
  }
  for (const a of out.values()) a.sort((x, y) => x.pos - y.pos);
  return out;
}

/** Steps done late per student and assigned lesson: Map 'userId:classLessonId' -> n. lessons: rows from L.classLessons
 *  (they carry the school's zone). A step is late when it was first done after the lesson's due day ended. */
export function lateSteps(classId, lessons, { userId = null } = {}) {
  const from = new Map(lessons.map(cl => [cl.id, L.lateFrom(cl)]).filter(([, t]) => t !== null));
  const out = new Map();
  if (!from.size) return out;
  const first = Math.min(...from.values());
  for (const r of q.all(`SELECT p.user_id u, p.class_lesson_id cl, p.done_at t FROM step_progress p JOIN class_lessons c ON c.id=p.class_lesson_id AND c.removed_at IS NULL
      JOIN lesson_steps s ON s.id=p.step_id AND s.lesson_id=c.lesson_id
      WHERE c.class_id=? AND p.status='done' AND p.done_at>=? AND ${L.assignedSql('c.id', 'p.user_id')} ${userId ? 'AND p.user_id=?' : ''}`, classId, first, ...(userId ? [userId] : []))) {
    const t = from.get(r.cl);
    if (t !== undefined && r.t >= t) { const k = `${r.u}:${r.cl}`; out.set(k, (out.get(k) || 0) + 1); }
  }
  return out;
}

/** The class's saved live games with each student's result (never a guest: only live_run_scores, which holds the class's
 *  own signed-in students): { runs: [{ id, title, mode, ended_at, players, linked }], by: Map 'runId:userId' ->
 *  { right, total } | null (played; nothing to mark) }. Newest first, at most `limit`. */
export function classLive(classId, limit = 8) {
  const runs = q.all('SELECT id, title, mode, ended_at, players, class_lesson_id, step_id FROM live_runs WHERE class_id=? ORDER BY ended_at DESC LIMIT ?', classId, limit);
  if (!runs.length) return { runs: [], by: new Map() };
  const rows = q.all(`SELECT run_id run, user_id u, correct, answered, marks FROM live_run_scores WHERE run_id IN (${runs.map(() => '?').join(',')})`, ...runs.map(r => r.id));
  return { runs: runs.map(r => ({ id: r.id, title: r.title, mode: r.mode, ended_at: r.ended_at, players: r.players, linked: !!(r.class_lesson_id && r.step_id) })), by: liveResults(rows) };
}
