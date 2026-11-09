// Rubrics (docs/decisions.md "Rubrics"): a teacher's reusable rubrics in the school's lesson library, attached to a whole
// lesson or to a step that collects work (a written question / exit ticket, a Studio build handed in), scored per student
// when the teacher reviews the work, rolled into the gradebook and its CSV, and shown to that student alone.
//
// A rubric is levels (columns: a label and points, 2-6 of them) × criteria (rows: a name and one descriptor per level).
//
// Who can do what:
//   the rubric's owner (while staff of its school) and that school's admins   edit, share, delete, attach to their lessons
//   staff of the school                                                       see rubrics shared with the school, copy them
//   a class's teachers / school admins                                        score their students with an attached rubric
//   a student                                                                 sees their own result on the lesson page
// Nobody else sees a rubric (students, family accounts, guests, other schools' teachers: not found).
// Scores keep a snapshot of the rubric they were given with, so editing or deleting a rubric never changes a result.
import { q, uid, now, tx, audit } from '../db.js';
import * as S from './schools.js';
import * as T from './lesson-templates.js';

export const LIMITS = Object.freeze({ title: 100, description: 600, levels: [2, 6], label: 40, points: 100, criteria: [1, 12], name: 80, desc: 300, comment: 500, feedback: 2000, perSchool: 300 });
/** Kinds of lesson step that collect work a rubric can score (written question / exit ticket, Studio build hand-in). */
export const STEP_KINDS = ['question', 'build'];
/** The step key of a whole-lesson score (rubric_scores.step_id). */
export const LESSON = '';

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
const clip = (s, n) => String(s == null ? '' : s).replace(/[ \t]+/g, ' ').trim().slice(0, n);
const clipText = (s, n) => String(s == null ? '' : s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, n);
const parse = (s, d) => { try { const x = JSON.parse(s); return x == null ? d : x; } catch { return d; } };
const isStaffOf = (u, schoolId) => { const r = S.roleIn(u, schoolId); return r === 'admin' || r === 'teacher'; };

// ---------------------------------------------------------------- data
/** A rubric row with levels and criteria as data, or null. */
export function getRubric(id) {
  const r = id && typeof id === 'string' ? q.get('SELECT * FROM rubrics WHERE id=?', id) : null;
  return r ? withData(r) : null;
}
const withData = r => ({ ...r, levels: Array.isArray(r.levels) ? r.levels : parse(r.levels, []), criteria: Array.isArray(r.criteria) ? r.criteria : parse(r.criteria, []) });
/** The most a student can get: the top level's points for every criterion. */
export const maxPoints = r => (r && r.levels.length ? r.criteria.length * Math.max(...r.levels.map(l => +l.points || 0)) : 0);

/**
 * A rubric's own fields, cleaned: { title, description, levels: [{ label, points }], criteria: [{ name, descs }] }. Every
 * criterion gets exactly one descriptor per level (missing ones are '', extra ones dropped).
 * -> { ok, v } | { ok:false, code: 'rubricTitle' | 'rubricLevels' | 'rubricCriteria' | 'rubricLabel' | 'rubricName' | 'rubricPoints' }
 */
export function cleanRubric(fields = {}, old = {}) {
  const title = fields.title !== undefined ? clip(fields.title, LIMITS.title) : old.title || '';
  const description = fields.description !== undefined ? clipText(fields.description, LIMITS.description) : old.description || '';
  const levelsIn = fields.levels !== undefined ? fields.levels : old.levels || [];
  const criteriaIn = fields.criteria !== undefined ? fields.criteria : old.criteria || [];
  if (!title) return fail('rubricTitle');
  if (!Array.isArray(levelsIn) || levelsIn.length < LIMITS.levels[0] || levelsIn.length > LIMITS.levels[1]) return fail('rubricLevels');
  if (!Array.isArray(criteriaIn) || criteriaIn.length < LIMITS.criteria[0] || criteriaIn.length > LIMITS.criteria[1]) return fail('rubricCriteria');
  const levels = [];
  for (const l of levelsIn) {
    if (!l || typeof l !== 'object') return fail('rubricLevels');
    const label = clip(l.label, LIMITS.label); if (!label) return fail('rubricLabel');
    const p = typeof l.points === 'string' ? l.points.trim() : l.points;
    if (p === '' || p === null || p === undefined || !Number.isFinite(+p) || +p < 0 || +p > LIMITS.points) return fail('rubricPoints');
    levels.push({ label, points: Math.round(+p * 2) / 2 });
  }
  const criteria = [];
  for (const c of criteriaIn) {
    if (!c || typeof c !== 'object') return fail('rubricCriteria');
    const name = clip(c.name, LIMITS.name); if (!name) return fail('rubricName');
    const d = Array.isArray(c.descs) ? c.descs : [];
    criteria.push({ name, descs: levels.map((_, j) => clipText(typeof d[j] === 'string' ? d[j] : '', LIMITS.desc)) });
  }
  return ok({ v: { title, description, levels, criteria } });
}

// ---------------------------------------------------------------- permissions
/** The owner while staff of the school, or the school's admins. */
export const canEditRubric = (u, r) => !!(u && r && (S.canManageSchool(u, r.school_id) || (r.owner_id === u.id && isStaffOf(u, r.school_id))));
/** Staff of the school can open a rubric shared with it; editors can open their own. */
export const canSeeRubric = (u, r) => !!(u && r && (canEditRubric(u, r) || (r.shared && isStaffOf(u, r.school_id))));

// ---------------------------------------------------------------- library
// uses: the lessons (not archived) with the rubric on the whole lesson or on any of their steps, each counted once (as usage()).
const COLS = `r.*, (SELECT COUNT(*) FROM lessons l WHERE l.archived_at IS NULL AND (l.rubric_id=r.id OR EXISTS (SELECT 1 FROM lesson_steps s WHERE s.lesson_id=l.id AND s.rubric_id=r.id))) uses`;
/** The teacher's own rubrics in a school, newest first. */
export const rubricsOf = (ownerId, schoolId) => q.all(`SELECT ${COLS} FROM rubrics r WHERE r.owner_id=? AND r.school_id=? ORDER BY r.updated_at DESC`, ownerId, schoolId).map(withData);
/** Rubrics colleagues shared with the school (not the viewer's own), with the owner's school name. */
export const sharedRubrics = (u, schoolId) => q.all(`SELECT ${COLS}, COALESCE(NULLIF(m.roster_name,''), u.display_name) owner_name FROM rubrics r JOIN users u ON u.id=r.owner_id
  LEFT JOIN school_members m ON m.school_id=r.school_id AND m.user_id=r.owner_id WHERE r.school_id=? AND r.shared=1 AND r.owner_id!=? ORDER BY r.updated_at DESC LIMIT 200`, schoolId, u.id).map(withData);
/** Rubrics a teacher can attach to a lesson of this school: their own (and, for its admins, every rubric of the school). */
export function attachable(u, schoolId) {
  if (!u) return [];
  if (S.canManageSchool(u, schoolId)) return q.all('SELECT * FROM rubrics WHERE school_id=? ORDER BY owner_id!=?, title COLLATE NOCASE', schoolId, u.id).map(withData);
  return isStaffOf(u, schoolId) ? q.all('SELECT * FROM rubrics WHERE school_id=? AND owner_id=? ORDER BY title COLLATE NOCASE', schoolId, u.id).map(withData) : [];
}

/** Two default columns sets: 'points' Beginning 1 · Developing 2 · Secure 3 · Excellent 4. t gives the labels. */
export const defaultLevels = t => ['beginning', 'developing', 'secure', 'excellent'].map((k, i) => ({ label: t(`rubrics.levelNames.${k}`), points: i + 1 }));
export function createRubric(u, schoolId, fields = {}, { source = '' } = {}) {
  if (!isStaffOf(u, schoolId)) return fail('notFound');
  if (q.get('SELECT COUNT(*) n FROM rubrics WHERE owner_id=? AND school_id=?', u.id, schoolId).n >= LIMITS.perSchool) return fail('tooManyRubrics');
  const c = cleanRubric(fields); if (!c.ok) return c;
  const id = uid(10), t = now(), v = c.v;
  q.run('INSERT INTO rubrics(id, school_id, owner_id, title, description, levels, criteria, shared, source, version, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, schoolId, u.id, v.title, v.description, JSON.stringify(v.levels), JSON.stringify(v.criteria), fields.shared ? 1 : 0, clip(source, 80), 1, t, t);
  audit(u.id, 'rubric.create', id, { school: schoolId, ...(source ? { source: clip(source, 80) } : {}) });
  return ok({ rubric: getRubric(id) });
}
/** Edit a rubric (fields left out are kept). shared: 0/1. The version goes up when the levels or criteria change. */
export function updateRubric(u, id, fields = {}) {
  const r = getRubric(id); if (!canEditRubric(u, r)) return fail('notFound');
  const c = cleanRubric(fields, r); if (!c.ok) return c;
  const v = c.v;
  const changed = JSON.stringify(v.levels) !== JSON.stringify(r.levels) || JSON.stringify(v.criteria) !== JSON.stringify(r.criteria);
  const shared = fields.shared !== undefined ? (fields.shared ? 1 : 0) : r.shared;
  q.run('UPDATE rubrics SET title=?, description=?, levels=?, criteria=?, shared=?, version=?, updated_at=? WHERE id=?',
    v.title, v.description, JSON.stringify(v.levels), JSON.stringify(v.criteria), shared, r.version + (changed ? 1 : 0), now(), r.id);
  return ok({ rubric: getRubric(r.id) });
}
/** Copy a rubric (own, or shared by a colleague; `force` for one attached to a lesson being copied) into u's library. */
export function copyRubric(u, id, { force = false, t = null } = {}) {
  const r = getRubric(id);
  if (!r || !(force ? isStaffOf(u, r.school_id) : canSeeRubric(u, r))) return fail('notFound');
  const title = r.owner_id === u.id ? (t ? t('rubrics.copyTitle', { title: r.title }) : `${r.title} (2)`) : r.title;
  return createRubric(u, r.school_id, { title: clip(title, LIMITS.title) || r.title, description: r.description, levels: r.levels, criteria: r.criteria }, { source: `copy:${r.id}` });
}
/** Where a rubric is attached: [{ lessonId, title, steps: n, whole: bool }] (lessons not archived). */
export function usage(id) {
  const rows = q.all(`SELECT l.id, l.title, l.rubric_id=? whole, (SELECT COUNT(*) FROM lesson_steps s WHERE s.lesson_id=l.id AND s.rubric_id=?) steps FROM lessons l
    WHERE l.archived_at IS NULL AND (l.rubric_id=? OR EXISTS (SELECT 1 FROM lesson_steps s WHERE s.lesson_id=l.id AND s.rubric_id=?)) ORDER BY l.title COLLATE NOCASE`, id, id, id, id);
  return rows.map(x => ({ lessonId: x.id, title: x.title, whole: !!x.whole, steps: x.steps }));
}
/** Delete a rubric. While it is attached to a lesson or step it is refused ('inUse', with uses) unless detach is set:
 *  then it comes off every lesson and step first. Scores already given keep their snapshot. */
export function deleteRubric(u, id, { detach = false } = {}) {
  const r = getRubric(id); if (!canEditRubric(u, r)) return fail('notFound');
  const uses = usage(r.id);
  if (uses.length && !detach) return { ok: false, code: 'inUse', uses };
  tx(() => {
    q.run('UPDATE lessons SET rubric_id=NULL WHERE rubric_id=?', r.id);
    q.run('UPDATE lesson_steps SET rubric_id=NULL WHERE rubric_id=?', r.id);
    q.run('DELETE FROM rubrics WHERE id=?', r.id);
  });
  audit(u.id, 'rubric.delete', r.id, { title: r.title, detached: uses.length });
  return ok({ detached: uses.length });
}

// ---------------------------------------------------------------- starters (CS Quest's exit-ticket rubrics)
/** CS Quest lessons whose exit ticket (or a step) has rubric lines: [{ key, title, band, unit, lines }], program order. */
export function starters() {
  const out = [];
  for (const tpl of T.templates()) {
    const lines = starterLines(tpl);
    if (lines.length) out.push({ key: tpl.key, title: tpl.title, band: tpl.band, unit: tpl.unit, unitTitle: tpl.unitTitle, lines: lines.length });
  }
  return out;
}
const starterLines = tpl => [...((tpl.exit && tpl.exit.rubric) || []), ...(tpl.steps || []).flatMap(s => (Array.isArray(s.rubric) ? s.rubric : []))]
  .filter((x, i, a) => x && x.line && a.findIndex(y => y.line === x.line) === i).slice(0, LIMITS.criteria[1]);
/** A CS Quest lesson's rubric lines as a library rubric: levels 0-3 (Not yet · Beginning · Developing · Secure), the
 *  lines as criteria and their level descriptors (the catalogue's English text). t gives the level labels. */
export function importStarter(u, schoolId, key, t) {
  const tpl = T.getTemplate(key);
  const lines = tpl ? starterLines(tpl) : [];
  if (!lines.length) return fail('notFound');
  const levels = ['notYet', 'beginning', 'developing', 'secure'].map((k, i) => ({ label: t(`rubrics.levelNames.${k}`), points: i }));
  const criteria = lines.map(l => ({ name: l.line, descs: (l.levels || []).slice(0, 4) }));
  return createRubric(u, schoolId, { title: `${tpl.title} (${T.GRADES[tpl.band] || tpl.band})`, description: t('rubrics.starters.fromLesson', { title: tpl.title }), levels, criteria }, { source: `csq:${tpl.key}` });
}

// ---------------------------------------------------------------- attaching
/** Can u put rubric `rubricId` on a lesson of `schoolId`? '' / null = take it off (always fine). The rubric already
 *  there (`current`) may stay even when u could not attach it now (a school admin's, say). -> rubric id | null | false */
export function attachId(u, schoolId, rubricId, current = null) {
  if (rubricId === undefined) return current || null;
  if (!rubricId) return null;
  if (rubricId === current) return current;
  const r = getRubric(String(rubricId));
  return r && r.school_id === schoolId && canEditRubric(u, r) ? r.id : false;
}

// ---------------------------------------------------------------- scores
/** The rubric scoring a step ('' = the whole lesson) of an assigned lesson, or null. */
export function rubricFor(lesson, step) {
  const id = rubricIdFor(lesson, step);
  return id ? getRubric(id) : null;
}
/** The id of the rubric on a step ('' / null step = the whole lesson), or null. */
export const rubricIdFor = (lesson, step) => (step ? (STEP_KINDS.includes(step.kind) ? step.rubric_id || null : null) : (lesson && lesson.rubric_id) || null);
/** Was this score given with rubric r as it is now (same rubric, same version)? Only then do its picks fill the form. */
export const sameRubric = (score, r) => !!(score && r && score.rubric_id === r.id && score.version === r.version);
/** Does a saved score still count (gradebook, CSV, the student's page)? Yes while the step or lesson still carries the
 *  rubric it was given with, or carries none (detached or deleted: the snapshot stands). A step switched to another
 *  rubric leaves the old score out until the teacher scores again. rubricId: what the step / lesson carries now. */
export const scoreCounts = (score, rubricId) => !!score && (!rubricId || score.rubric_id === rubricId);
/** How many criteria a score has a level for, out of how many: { n, of }. A partial score is n < of. */
export function scoredOf(score) {
  const of = score && score.snapshot && Array.isArray(score.snapshot.criteria) ? score.snapshot.criteria.length : 0;
  return { n: score && Array.isArray(score.picks) ? score.picks.filter(p => p !== null && p !== undefined).length : 0, of };
}
const rowOut = r => (r ? { ...r, snapshot: parse(r.snapshot, null), picks: parse(r.picks, []), comments: parse(r.comments, []) } : null);
export const getScore = (clId, stepId, userId) => rowOut(q.get('SELECT * FROM rubric_scores WHERE class_lesson_id=? AND step_id=? AND user_id=?', clId, stepId || '', userId));
/** One student's scores in one assigned lesson: { stepId | '': row }. */
export const scoresFor = (clId, userId) => Object.fromEntries(q.all('SELECT * FROM rubric_scores WHERE class_lesson_id=? AND user_id=?', clId, userId).map(r => [r.step_id, rowOut(r)]));
/** Every score in an assigned lesson: Map 'userId:stepId' -> row. */
export const scoresIn = clId => new Map(q.all('SELECT * FROM rubric_scores WHERE class_lesson_id=?', clId).map(r => [`${r.user_id}:${r.step_id}`, rowOut(r)]));

/**
 * The picks and comments a teacher sent, checked against the rubric: picks one level index (or null) per criterion,
 * comments one string per criterion. A criterion left out keeps what `old` has when old was given with the same rubric
 * at the same version (sameRubric); a score from another rubric, or an older version, is never carried over.
 * -> { ok, picks, comments } | { ok:false, code:'badScore' }
 */
export function cleanScore(r, { picks, comments } = {}, old = null) {
  const n = r.criteria.length, same = sameRubric(old, r);
  const was = i => { const k = same ? old.picks[i] : null; return Number.isInteger(k) && k >= 0 && k < r.levels.length ? k : null; }, wasC = i => (same ? old.comments[i] || '' : '');
  const pIn = picks === undefined ? [] : Array.isArray(picks) ? picks : null;
  const cIn = comments === undefined ? [] : Array.isArray(comments) ? comments : null;
  if (!pIn || !cIn || pIn.length > n || cIn.length > n) return fail('badScore');
  const outP = [], outC = [];
  for (let i = 0; i < n; i++) {
    const v = pIn[i];
    if (v === undefined) outP.push(was(i));
    else if (v === null || v === '' || v === '-') outP.push(null);
    else { const k = typeof v === 'number' ? v : /^\d{1,2}$/.test(String(v).trim()) ? +String(v).trim() : NaN; if (!Number.isInteger(k) || k < 0 || k >= r.levels.length) return fail('badScore'); outP.push(k); }
    const c = cIn[i];
    if (c !== undefined && c !== null && typeof c !== 'string') return fail('badScore');
    outC.push(c === undefined ? wasC(i) : clipText(c, LIMITS.comment));
  }
  return ok({ picks: outP, comments: outC });
}
const managedLesson = (u, clId) => {
  const cl = clId ? q.get('SELECT * FROM class_lessons WHERE id=? AND removed_at IS NULL', clId) : null;
  const c = cl && S.getClass(cl.class_id);
  return c && S.canManageClass(u, c) ? { cl, c, lesson: q.get('SELECT * FROM lessons WHERE id=?', cl.lesson_id) } : null;
};
/** What a score is for: the class lesson, the rubric and the step (null for the whole lesson), for a teacher of the class
 *  and a student of it. -> { ok, cl, rubric, step } | { ok:false, code:'notFound' } */
export function scoreContext(u, clId, stepId, userId) {
  const m = managedLesson(u, clId); if (!m || !m.lesson) return fail('notFound');
  const step = stepId ? q.get('SELECT * FROM lesson_steps WHERE id=?', stepId) : null;
  if (stepId && (!step || step.lesson_id !== m.lesson.id)) return fail('notFound');
  const rubric = rubricFor(m.lesson, step); if (!rubric) return fail('notFound');
  const cm = S.classMember(m.c.id, userId); if (!cm || cm.role !== 'student') return fail('notFound');
  return ok({ cl: m.cl, rubric, step });
}
/**
 * Score one student with the rubric attached to a step (stepId) or the whole lesson (stepId ''). picks / comments as in
 * cleanScore; feedback (whole-lesson scores only: a step's written feedback stays in step_progress, see progress.review)
 * replaces the old one when given. With nothing picked, no comment and no feedback the score is removed.
 * -> { ok, score: row | null } | { ok:false, code }
 */
export function saveScore(u, clId, stepId, userId, { picks, comments, feedback } = {}) {
  const x = scoreContext(u, clId, stepId || '', userId); if (!x.ok) return x;
  const old = getScore(clId, stepId || '', userId);
  const c = cleanScore(x.rubric, { picks, comments }, old); if (!c.ok) return c;
  const fb = stepId ? '' : feedback !== undefined ? clipText(feedback, LIMITS.feedback) : old ? old.feedback : '';
  const key = [clId, stepId || '', userId];
  if (!c.picks.some(p => p !== null) && !c.comments.some(Boolean) && !fb) {
    q.run('DELETE FROM rubric_scores WHERE class_lesson_id=? AND step_id=? AND user_id=?', ...key);
    audit(u.id, 'rubric.unscore', clId, { step: stepId || '', user: userId });
    return ok({ score: null });
  }
  const r = x.rubric;
  // Points and the most possible count only the criteria with a level: feedback or comments alone score nothing (max 0,
  // left out of every total), and a partial score is points out of the criteria scored so far (scoredOf says how many).
  if (c.picks.some(p => p !== null && !(Number.isInteger(p) && p >= 0 && p < r.levels.length))) return fail('badScore');
  const top = r.levels.length ? Math.max(...r.levels.map(l => +l.points || 0)) : 0;
  const points = c.picks.reduce((n, p) => n + (p === null ? 0 : +r.levels[p].points || 0), 0);
  const maxScored = c.picks.filter(p => p !== null).length * top;
  const snapshot = JSON.stringify({ title: r.title, levels: r.levels, criteria: r.criteria });
  q.run(`INSERT INTO rubric_scores(class_lesson_id, step_id, user_id, rubric_id, version, snapshot, picks, comments, feedback, points, max_points, scored_by, scored_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(class_lesson_id, step_id, user_id) DO UPDATE SET rubric_id=excluded.rubric_id, version=excluded.version, snapshot=excluded.snapshot,
    picks=excluded.picks, comments=excluded.comments, feedback=excluded.feedback, points=excluded.points, max_points=excluded.max_points, scored_by=excluded.scored_by, scored_at=excluded.scored_at`,
    ...key, r.id, r.version, snapshot, JSON.stringify(c.picks), JSON.stringify(c.comments), fb, points, maxScored, u.id, now());
  audit(u.id, 'rubric.score', clId, { step: stepId || '', user: userId, points });
  return ok({ score: getScore(clId, stepId || '', userId) });
}

/** Rubric points per student and assigned lesson in a class (current assignments, steps still in the lesson, scores that
 *  still count: scoreCounts). Only scores with a level picked add up (max_points > 0).
 *  Map 'userId:classLessonId' -> { points, max, n: scores, scored: criteria with a level, of: criteria in those scores }. */
export function classTotals(classId) {
  const rows = q.all(`SELECT r.user_id u, r.class_lesson_id cl, r.points, r.max_points, r.picks, r.snapshot FROM rubric_scores r
    JOIN class_lessons c ON c.id=r.class_lesson_id AND c.removed_at IS NULL JOIN lessons l ON l.id=c.lesson_id
    LEFT JOIN lesson_steps s ON r.step_id!='' AND s.id=r.step_id AND s.lesson_id=c.lesson_id
    WHERE c.class_id=? AND r.max_points>0 AND (r.step_id='' OR s.id IS NOT NULL)
      AND COALESCE(CASE WHEN r.step_id='' THEN l.rubric_id WHEN s.kind IN ('question','build') THEN s.rubric_id END, r.rubric_id)=r.rubric_id`, classId);
  const out = new Map();
  for (const row of rows) {
    const k = `${row.u}:${row.cl}`, x = out.get(k) || { points: 0, max: 0, n: 0, scored: 0, of: 0 };
    const so = scoredOf(rowOut(row));
    x.points += row.points; x.max += row.max_points; x.n += 1; x.scored += so.n; x.of += so.of;
    out.set(k, x);
  }
  return out;
}
/** Lessons (ids) with a rubric on the lesson or any of its steps. */
export function lessonsWithRubrics(lessonIds) {
  if (!lessonIds.length) return new Set();
  const ph = lessonIds.map(() => '?').join(',');
  return new Set(q.all(`SELECT id FROM lessons WHERE id IN (${ph}) AND (rubric_id IS NOT NULL OR EXISTS (SELECT 1 FROM lesson_steps s WHERE s.lesson_id=lessons.id AND s.rubric_id IS NOT NULL AND s.kind IN ('question','build')))`, ...lessonIds).map(r => r.id));
}
/** Points as text: "7/10" (halves kept: "7.5/10"). */
export const pointsText = (p, m) => `${+(+p).toFixed(1)}/${+(+m).toFixed(1)}`;
export const percent = (p, m) => (m > 0 ? Math.round((100 * p) / m) : null);

// ---------------------------------------------------------------- clean-up hooks
/** Lesson and step deletion (services/lessons.js) and class deletion take their scores with them. */
export const forgetLesson = lessonId => q.run('DELETE FROM rubric_scores WHERE class_lesson_id IN (SELECT id FROM class_lessons WHERE lesson_id=?)', lessonId);
export const forgetStep = stepId => q.run('DELETE FROM rubric_scores WHERE step_id=?', stepId);
S.onClassLeave(({ classId, userId = null } = {}) => { if (classId && !userId) q.run('DELETE FROM rubric_scores WHERE class_lesson_id NOT IN (SELECT id FROM class_lessons)'); });
S.onAccountMerge(({ from, into }) => {
  q.run('UPDATE OR IGNORE rubric_scores SET user_id=? WHERE user_id=?', into, from);
  q.run('DELETE FROM rubric_scores WHERE user_id=?', from);
  q.run('UPDATE rubrics SET owner_id=? WHERE owner_id=?', into, from);
});
