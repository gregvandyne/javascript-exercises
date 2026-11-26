// Manipulatives: tasks you can practice and assign (docs/decisions.md "Manipulatives: tasks you can practice and
// assign"; docs/manip-practice-tasks.md). The tasks themselves, their seeded variations and the one checker are shared
// with the page (public/js/manip-tasks.js, public/js/manip-task-kit.js); this file is what only the server does:
//   - solo practice progress (manip_practice, migration 0141): per person per task, how many solved, how many checks,
//     the current run of right-first-time answers and the best one. The server checks the work itself (never the page's
//     word) and keeps only those counts;
//   - assigned practice: Assign (a teacher's Manipulatives task list: one or several tasks, a count of questions each, a
//     class, open and due dates) and Homeroom's handout of a task make a lesson of kind 'manip' with one step of kind
//     'manip' (lessons.MANIP_KIND) whose snapshot names the tasks and the count; each student gets their own distinct
//     seeded variations (setFor: the step and the student pick the seed), answered on the Manipulatives page and checked
//     here (services/progress.js manipAnswer); marks, score and done go through step_progress like every graded step,
//     so the gradebook, Classroom overview, Google Classroom and the parents' view show them unchanged;
//   - live boards for Homeroom's watching desks (memory only, as the live room's cursors): a student doing an assigned
//     set inside the desk's player sends their board and the problem now and then; the teacher's board draws it with the
//     tool's own code (services/homeroom-tools.js boardsOf).
import { q, now, audit, tx } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as M from './manipulatives.js';
import { TASKS, taskOf, isPractice, variation, variations, check, idOf } from '../../public/js/manip-tasks.js';
import { hash32, SEED_MAX } from '../../public/js/manip-task-kit.js';
import { toolOf } from '../../public/js/manip-data.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
/** Questions of one task in a set: 1 to COUNT_MAX; a set holds at most SET_MAX questions in all. */
export const COUNT_MAX = 10, SET_MAX = 30, TASKS_MAX = 6;
/** How big a work object may be (the page sends the board it checks). */
const WORK_MAX = 200000;

// ---------------------------------------------------------------- who
/** Practice tasks for this tool slug, with ids (the page lists them). */
export const practiceOf = slug => (TASKS[slug] || []).filter(isPractice).map(t => ({ id: idOf(slug, t), key: t.key, title: t.title }));
/** May this teacher assign Manipulatives tasks to this class? Its teacher who may use Manipulatives. */
export const canAssignTo = (u, c) => !!c && !c.archived_at && M.canHost(u) && S.teaches(u, c.id) && S.canManageClass(u, c);
/** Classes a teacher can assign tasks to. */
export const assignClasses = u => (M.canHost(u) ? S.classesOf(u.id, 'teacher').filter(c => !c.archived_at && S.canManageClass(u, c)) : []);

// ---------------------------------------------------------------- the work a page sends
/** { board, box, choice } as checked: a board object (at most WORK_MAX as JSON), a short typed answer, a choice index. */
export function cleanWork(raw) {
  const w = raw && typeof raw === 'object' ? raw : {};
  let board = w.board && typeof w.board === 'object' && !Array.isArray(w.board) ? w.board : {};
  try { if (JSON.stringify(board).length > WORK_MAX) board = {}; } catch { board = {}; }
  const box = typeof w.box === 'string' ? w.box.slice(0, 100) : '';
  const choice = Number.isInteger(w.choice) && w.choice >= 0 && w.choice < 10 ? w.choice : null;
  return { board, box, choice };
}

// ---------------------------------------------------------------- solo practice
const rowOf = (uid, task) => q.get('SELECT * FROM manip_practice WHERE user_id=? AND task=?', uid, task) || null;
/** Everything this person has practiced: { taskId: { solved, tries, streak, best } }. */
export function progressOf(u) {
  if (!u) return {};
  return Object.fromEntries(q.all('SELECT task, solved, tries, streak, best FROM manip_practice WHERE user_id=?', u.id).map(r => [r.task, { solved: r.solved, tries: r.tries, streak: r.streak, best: r.best }]));
}
/**
 * A check on solo practice: { task (id), seed, work, first (the first check of this variation) }. The server makes the
 * variation again and checks it; a right first check adds one to the run ("3 right in a row"), a wrong first check ends
 * it. -> { ok, correct, partial, feedback, parts, progress: { solved, tries, streak, best } }
 */
export function practiceCheck(u, { task, seed, work, first = false } = {}) {
  const x = taskOf(task); if (!x || !isPractice(x.task)) return fail('notFound');
  const s = Math.floor(Number(seed));
  if (!Number.isInteger(s) || s < 1 || s > SEED_MAX) return fail('badRequest');
  const v = variation(task, s), r = check(v, cleanWork(work)), t = now(), old = rowOf(u.id, task);
  const streak = first ? (r.correct ? ((old && old.streak) || 0) + 1 : 0) : (old ? old.streak : 0);
  const row = { solved: ((old && old.solved) || 0) + (r.correct ? 1 : 0), tries: ((old && old.tries) || 0) + 1, streak, best: Math.max((old && old.best) || 0, streak) };
  q.run(`INSERT INTO manip_practice(user_id, task, solved, tries, streak, best, updated_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(user_id, task) DO UPDATE SET solved=excluded.solved, tries=excluded.tries, streak=excluded.streak, best=excluded.best, updated_at=excluded.updated_at`,
  u.id, task, row.solved, row.tries, row.streak, row.best, t);
  return ok({ correct: r.correct, partial: r.partial, parts: r.parts, feedback: r.feedback, progress: row });
}
/** Account delete. */
export const forgetUser = userId => q.run('DELETE FROM manip_practice WHERE user_id=?', userId);

// ---------------------------------------------------------------- an assigned set
/** A step's snapshot: { tasks: [id], n } (only practice tasks that still exist), or null. */
export function snapOf(step) {
  let x = null; try { x = JSON.parse((step && step.items) || 'null'); } catch { x = null; }
  if (!x || !Array.isArray(x.tasks)) return null;
  const tasks = x.tasks.filter(id => { const t = taskOf(id); return t && isPractice(t.task); });
  const n = Math.max(1, Math.min(COUNT_MAX, Math.floor(Number(x.n)) || 1));
  return tasks.length ? { tasks, n } : null;
}
/** The questions of a set for one student: [{ id, seed }] (each task's n distinct variations, in task order). The step
 *  and the student pick the seeds, so a student gets the same questions every time and a classmate gets others. */
export function setFor(step, userId) {
  const snap = snapOf(step); if (!snap) return [];
  return snap.tasks.flatMap(id => variations(id, snap.n, (hash32(`${step.id}:${userId}:${id}`) % SEED_MAX) + 1).map(v => ({ id, seed: v.seed })));
}
/** How many questions a set has. */
export const countOf = step => { const s = snapOf(step); return s ? s.tasks.length * s.n : 0; };
/** Each question's Common Core code, in set order (the class Standards tab: services/standards-ccss.js). */
export const codesOf = step => { const s = snapOf(step); return s ? s.tasks.flatMap(id => Array(s.n).fill(taskOf(id).task.ccss)) : []; };
/** The title of a set: the task's title, or the tool's name and the count of tasks. */
function titleOf(ids) {
  const first = taskOf(ids[0]);
  if (ids.length === 1) return first.task.title;
  const tl = toolOf(first.slug);
  return `${tl ? tl.name : 'Manipulatives'}: ${ids.length} tasks`;
}
/** The teacher's pick checked: { tasks: [id] (practice tasks, at most TASKS_MAX), n }. */
export function cleanPick({ tasks, count } = {}) {
  const ids = [...new Set((Array.isArray(tasks) ? tasks : [tasks]).map(String))].filter(id => { const t = taskOf(id); return t && isPractice(t.task); });
  if (!ids.length) return fail('pickTask');
  if (ids.length > TASKS_MAX) return fail('tooManyTasks');
  // (one tool a set: the page opens the set on that tool's board, and Homeroom watches it as that tool)
  if (new Set(ids.map(id => taskOf(id).slug)).size > 1) return fail('oneToolSet');
  const n = Math.floor(Number(count));
  if (!Number.isInteger(n) || n < 1 || n > COUNT_MAX || n * ids.length > SET_MAX) return fail('badCount');
  return ok({ tasks: ids, n });
}
/**
 * Make the lesson for a set (kind 'manip', one 'manip' step) and assign it to a class: { tasks, count, students ([] the
 * whole class), dueAt, opensAt, body (the teacher's words on the step) }. -> { ok, lesson, classLesson, step, n }
 */
export function makeAssignment(u, c, { tasks, count, students = [], dueAt = null, opensAt = null, body = '' } = {}) {
  const p = cleanPick({ tasks, count }); if (!p.ok) return p;
  const first = taskOf(p.tasks[0]), title = titleOf(p.tasks);
  try { return tx(() => {
    const made = L.createLesson(u, c.school_id, { title, kind: 'manip', subject: 'math', grade: first.task.grade === 'K' ? 'K' : first.task.grade });
    if (!made.ok) throw Object.assign(new Error('lesson'), { r: made });
    const step = L.addManipStep(u, made.lesson.id, { title, items: { v: 1, tasks: p.tasks, n: p.n }, body });
    if (!step.ok) throw Object.assign(new Error('step'), { r: step });
    const a = L.assign(u, c.id, made.lesson.id, { dueAt, opensAt, students });
    if (!a.ok) throw Object.assign(new Error('assign'), { r: a });
    audit(u.id, 'manip.assign', c.id, { lesson: made.lesson.id, tasks: p.tasks, n: p.n, ...(students.length ? { students: students.length } : {}) });
    return ok({ lesson: L.getLesson(made.lesson.id), classLesson: a.classLesson, step: step.step, n: p.n * p.tasks.length, title });
  }); } catch (e) { if (e && e.r) return e.r; throw e; }
}
const day = v => { if (v === null || v === undefined || v === '') return null; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? s : undefined; };
/** Assign from the Manipulatives page (the whole class): { classId, tasks, count, opensAt, dueAt }. */
export function assign(u, { classId, tasks, count, opensAt = null, dueAt = null } = {}) {
  if (!M.canHost(u)) return fail('notFound');
  const c = S.getClass(String(classId || ''));
  if (!canAssignTo(u, c)) return fail('noClass');
  const o = day(opensAt), d = day(dueAt);
  if (o === undefined || d === undefined) return fail('badDate');
  if (o && d && d < o) return fail('dueBeforeOpen');
  return makeAssignment(u, c, { tasks, count, dueAt: d, opensAt: o });
}
/** The set's lesson page link for a student (the Manipulatives page opens it). */
export const hrefOf = (clId, stepId) => `/manipulatives#set/${encodeURIComponent(clId)}/${encodeURIComponent(stepId)}`;

// ---------------------------------------------------------------- live boards for Homeroom's watching desks (memory only)
/** classId -> Map(sid -> { v, at, on (class lesson), title, slug, state, space, i, n, prompt, box, key }). The board and
 *  the problem it is for come in one push and are kept as one entry (key: the task and variation), so they are never
 *  shown apart. The page pushes only when something changed, so an entry lasts while its set stays open in the desk's
 *  player: Homeroom shows it only while the desk's pulse says that set is open (services/homeroom-tools.js boardsOf),
 *  and forgets it when the player closes or moves on (services/homeroom-live.js pulse), at End class, when the student
 *  leaves the class, and after LIVE_MS with no push at all. */
const live = new Map();
export const LIVE_MS = 20 * 60e3;
let liveV = 0;
export const _resetLive = () => live.clear();
/** A student's board on an assigned set, from the page: only their own open assignment, small, memory only. */
export function putLive(u, clId, { state, space, i, n, prompt, box } = {}) {
  const cl = L.getClassLesson(String(clId || '')); if (!cl || !u) return fail('notFound');
  const c = S.getClass(cl.class_id), m = c && S.classMember(c.id, u.id);
  if (!m || m.role !== 'student' || !L.assignedTo(cl.id, u.id) || !L.isOpen(cl)) return fail('notFound');
  const step = q.get('SELECT * FROM lesson_steps WHERE lesson_id=? AND kind=? ORDER BY position LIMIT 1', cl.lesson_id, L.MANIP_KIND); if (!step) return fail('notFound');
  let json = ''; try { json = JSON.stringify(state && typeof state === 'object' ? state : {}); } catch { json = ''; }
  if (!json || json.length > WORK_MAX) return fail('tooBig');
  const qs = setFor(step, u.id), k = Math.max(0, Math.min(qs.length - 1, Math.floor(Number(i)) || 0)), x = qs[k] && taskOf(qs[k].id);
  if (!x) return fail('notFound');
  const v = variation(qs[k].id, qs[k].seed), lesson = L.getLesson(cl.lesson_id);
  const sp = space && typeof space === 'object' ? { w: Math.max(50, Math.min(4000, Math.round(+space.w) || 600)), h: Math.max(50, Math.min(2400, Math.round(+space.h) || 400)) } : { w: 600, h: 400 };
  let r = live.get(c.id); if (!r) { r = new Map(); live.set(c.id, r); }
  r.set(u.id, { v: ++liveV, at: now(), on: cl.id, title: (lesson && lesson.title) || x.task.title, slug: x.slug, state: json, space: sp, i: k, n: qs.length, prompt: v.prompt, key: `${qs[k].id}:${qs[k].seed}`,
    box: typeof box === 'string' ? box.slice(0, 100) : '' });
  return ok();
}
/** The boards of these students still kept (Map sid -> entry), for the teacher's board. */
export function liveOf(classId, sids) {
  const r = live.get(classId), out = new Map(); if (!r) return out;
  for (const sid of sids) { const e = r.get(sid); if (!e) continue; if (now() - e.at > LIVE_MS) { r.delete(sid); continue; } out.set(sid, e); }
  return out;
}
/** Is this student's set finished (its step_progress done)? A finished set's board is not shown. */
export const setDone = (clId, userId) => !!q.get("SELECT 1 FROM step_progress WHERE class_lesson_id=? AND user_id=? AND status='done' LIMIT 1", String(clId || ''), String(userId || ''));
export const forgetLive = (classId, sid = null) => { if (!sid) live.delete(classId); else { const r = live.get(classId); if (r) r.delete(sid); } };
S.onClassLeave(({ classId, userId = null } = {}) => { if (classId) forgetLive(classId, userId); });
