// Grammar Lab for teachers (docs: services/grammar-lab.js for the course, services/grammar-lab-access.js for the flag).
// Built on what the other assigned work already uses, never beside it:
//   - Assigning (assign): a teacher the flag lets in (the admin, a listed account, or anyone with '*') gives a whole unit,
//     one topic, or a topic's Mistake Hunt room as a separate "proofread" task, to a class, a group or one student, with
//     an optional due day. It is a lesson of kind 'grammar' with one step of kind 'grammar' (lessons.GRAMMAR_KIND) whose
//     snapshot names what was given (lesson_steps.items: { v, what, unit, band, topic?, topics }), assigned like any
//     lesson (class_lessons with its due day, class_lesson_students for some students), so the class page, the student's
//     To do list, the gradebook and the Hub desk show it unchanged. The Hub hands a unit out the same way
//     (services/homeroom-handouts.js handOutGrammar).
//   - No plan gate: the ready-made courses (CS Quest, Cyber Defenders, Number Quest) are assigned without the Teacher
//     plan (routes/cs-quest.js assignUnit and the lesson Assign check only that the teacher manages the class), so
//     Grammar Lab is too; the flag is the only gate.
//   - Completion follows the course: a topic is done when it is mastered, a unit when every topic in it is, a room when it
//     is passed (80% of its mistakes found, checked on the server). The course says so (services/grammar-lab.js
//     onGrammarChange) and this writes the step's step_progress (services/progress.js courseStep); a topic mastered before
//     the work was assigned counts at once. Opening anything completes nothing.
//   - The teacher's views (classGrid, studentView): counts and states only, students in roster order, never a ranking or
//     a score to compare. Nothing here goes to an AI.
//   - Placement (setBand): a teacher's choice of band for a student is absolute (services/grammar-lab.js placeOf).
import { q, audit, tx } from '../db.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as P from './progress.js';
import * as GL from './grammar-lab.js';
import * as A from './grammar-lab-access.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = (code, x = {}) => ({ ok: false, code, ...x });
export const WHATS = Object.freeze(['unit', 'topic', 'room']);
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ---------------------------------------------------------------- who
/** May this teacher give Grammar Lab work to this class? The flag lets them in, and they manage the class. */
export const canAssignTo = (u, c) => !!c && !c.archived_at && A.mayAssignGrammarLab(u) && S.canManageClass(u, c);
/** The classes a teacher can give Grammar Lab work to (the ones they teach, not archived). */
export const assignClasses = u => (A.mayAssignGrammarLab(u) ? S.classesOf(u.id, 'teacher').filter(c => !c.archived_at && S.canManageClass(u, c)) : []);
/** May this teacher see this class's Grammar Lab views? The flag lets them in, and they manage the class. */
export const canView = (u, c) => !!c && A.mayAssignGrammarLab(u) && S.canManageClass(u, c);

// ---------------------------------------------------------------- what is given
/** A step's snapshot: { what, unit, band, topic?, topics } (only what still exists), or null. */
export function snapOf(step) {
  let x = null; try { x = JSON.parse((step && step.items) || 'null'); } catch { x = null; }
  if (!x || !WHATS.includes(x.what) || typeof x.unit !== 'string') return null;
  const p = GL.pathway(x.unit, x.band) || GL.pathway(x.unit);
  if (!p) return null;
  if (x.what === 'unit') return { what: 'unit', unit: p.id, band: p.band, topics: p.topics.slice() };
  if (typeof x.topic !== 'string' || !p.topics.includes(x.topic) || (x.what === 'room' && !GL.room(x.topic))) return null;
  return { what: x.what, unit: p.id, band: p.band, topic: x.topic, topics: [x.topic] };
}
/** What a teacher picked, checked: { what, unit, band, topic } -> { ok, items, unit (the unit), topic (or null) }. */
export function cleanWhat({ what, unit, band = null, topic = null } = {}) {
  if (!WHATS.includes(what)) return fail('badWhat');
  if (typeof unit !== 'string' || !ID.test(unit)) return fail('notFound');
  const p = GL.unitFor(unit, band);
  if (!p) return fail('notFound');
  if (what === 'unit') return ok({ items: { v: 1, what, unit: p.id, band: p.band, topics: p.topics.slice() }, unit: p, topic: null });
  if (typeof topic !== 'string' || !p.topics.includes(topic)) return fail('notFound');
  if (what === 'room' && !GL.room(topic)) return fail('noRoom');
  return ok({ items: { v: 1, what, unit: p.id, band: p.band, topic, topics: [topic] }, unit: p, topic: GL.topic(topic) });
}
/** The lesson's title as students see it: the unit's or the topic's name (course text, English for now); a room's is
 *  the caller's words around the topic (roomTitle: "Proofread: <topic>" in the teacher's language). */
export const titleFor = (w, roomTitle = null) => (w.items.what === 'unit' ? w.unit.title : w.items.what === 'room' && roomTitle ? roomTitle : w.topic.title);
const day = v => { if (v === null || v === undefined || v === '') return null; const s = String(v); return /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(`${s}T00:00:00Z`)) ? s : undefined; };

/**
 * Give Grammar Lab work to a class: { classId, what: 'unit' | 'topic' | 'room', unit, band?, topic?, students ([] the
 * whole class, or the ids of a group or one student), dueAt ('YYYY-MM-DD' or null), roomTitle, body }.
 * -> { ok, lesson, classLesson, step, title, n (topics) } | { ok: false, code }
 */
export function assign(u, { classId, what, unit, band = null, topic = null, students = [], dueAt = null, roomTitle = null, body = '' } = {}) {
  const c = S.getClass(String(classId || ''));
  if (!canAssignTo(u, c)) return fail('noClass');
  const w = cleanWhat({ what, unit, band, topic }); if (!w.ok) return w;
  const d = typeof dueAt === 'number' ? dueAt : day(dueAt);
  if (d === undefined) return fail('badDate');
  const title = titleFor(w, roomTitle);
  try {
    const r = tx(() => {
      const made = L.createLesson(u, c.school_id, { title, kind: 'grammar', subject: 'ela', grade: (GL.band(w.unit.band) || {}).grades || '' });
      if (!made.ok) throw Object.assign(new Error('lesson'), { r: made });
      const step = L.addGrammarStep(u, made.lesson.id, { title, items: w.items, body });
      if (!step.ok) throw Object.assign(new Error('step'), { r: step });
      const a = L.assign(u, c.id, made.lesson.id, { dueAt: d, students: Array.isArray(students) ? students : [] });
      if (!a.ok) throw Object.assign(new Error('assign'), { r: a });
      audit(u.id, 'grammarLab.assign', c.id, { lesson: made.lesson.id, what: w.items.what, unit: w.items.unit, ...(w.items.topic ? { topic: w.items.topic } : {}), ...(a.classLesson && students.length ? { students: students.length } : {}) });
      return ok({ lesson: L.getLesson(made.lesson.id), classLesson: a.classLesson, step: step.step, title, n: w.items.topics.length });
    });
    // Work already done counts at once (a topic mastered before it was assigned).
    syncClassLesson(r.classLesson.id);
    return r;
  } catch (e) { if (e && e.r) return e.r; throw e; }
}

// ---------------------------------------------------------------- completion (the course's word)
/** How far a student is on a snapshot, from the live course state: { done, total, mastered, started }. */
export function progressFor(user, snap) {
  if (snap.what === 'room') {
    const passed = GL.roomPassedSet(user).has(snap.topic);
    return { done: passed ? 1 : 0, total: 1, mastered: passed, started: passed || !!GL.currentRun(user, `room:${snap.topic}`) };
  }
  const have = GL.masteredSet(user);
  const done = snap.topics.filter(id => have.has(id)).length;
  const started = done > 0 || !!q.get(`SELECT 1 FROM grammar_lab_quiz WHERE user_id=? AND topic IN (${snap.topics.map(() => '?').join(',')}) LIMIT 1`, user.id, ...snap.topics);
  return { done, total: snap.topics.length, mastered: done >= snap.topics.length, started };
}
/** Write one student's step from the course state (done stays done). */
function syncOne(cl, step, user) {
  const snap = snapOf(step); if (!snap || !user) return;
  const pr = progressFor(user, snap);
  P.courseStep(cl.id, step.id, user.id, { done: pr.mastered, started: pr.started, answer: JSON.stringify({ done: pr.done, total: pr.total }) });
}
const grammarStep = lessonId => q.get("SELECT * FROM lesson_steps WHERE lesson_id=? AND kind='grammar' ORDER BY position LIMIT 1", lessonId) || null;
/** Every open Grammar Lab assignment of this student brought up to date (after a mastery or a passed room). */
export function syncUser(user) {
  if (!user || !user.id || user.is_guest) return;
  const rows = q.all(`SELECT cl.id, cl.lesson_id FROM class_members m JOIN class_lessons cl ON cl.class_id=m.class_id AND cl.removed_at IS NULL
      JOIN lessons l ON l.id=cl.lesson_id AND l.kind='grammar'
    WHERE m.user_id=? AND m.role='student' AND m.status='active' AND ${L.assignedSql('cl.id', 'm.user_id')}`, user.id);
  for (const r of rows) { const st = grammarStep(r.lesson_id); if (st) syncOne(r, st, user); }
}
/** Every student of one Grammar Lab assignment brought up to date (just after it was given). */
export function syncClassLesson(clId) {
  const cl = L.getClassLesson(clId); if (!cl) return;
  const st = grammarStep(cl.lesson_id); if (!st) return;
  for (const p of S.roster(cl.class_id).filter(x => x.role === 'student')) if (L.assignedTo(cl.id, p.id)) syncOne(cl, st, p);
}
GL.onGrammarChange(user => syncUser(user));

// ---------------------------------------------------------------- the teacher's views
/** The class's open Grammar Lab assignments: [{ cl, step, snap, students: Set | null (null = whole class) }]. */
export function assignmentsIn(classId) {
  const picks = L.picksIn(classId);
  return q.all(`SELECT cl.id, cl.lesson_id, cl.due_at, cl.assigned_at, l.title FROM class_lessons cl JOIN lessons l ON l.id=cl.lesson_id AND l.kind='grammar'
      WHERE cl.class_id=? AND cl.removed_at IS NULL ORDER BY cl.assigned_at, cl.id`, classId)
    .map(r => { const step = grammarStep(r.lesson_id), snap = step && snapOf(step); return snap ? { cl: r, step, snap, students: picks.get(r.id) || null } : null; })
    .filter(Boolean);
}
const nameOf = p => p.roster_name || p.display_name;
/** One topic's state for one student, live: { state: 'none' | 'started' | 'mastered', level, levels, room }. */
function cellOf(user, id, mastered, passed) {
  const tp = GL.topic(id), run = GL.currentRun(user, id);
  const room = GL.room(id) ? { passed: passed.has(id), tried: !passed.has(id) && GL.roomInfo(user, id).tries > 0 } : null;
  if (mastered.has(id)) return { state: 'mastered', level: null, levels: (tp.levels || [0, 0, 0]).length, room };
  if (run && !run.mastered) { const s = GL.summaryOf(run); return { state: 'started', level: s.level, levels: s.levels, room }; }
  return { state: 'none', level: null, levels: (tp.levels || [0, 0, 0]).length, room };
}
/**
 * The class grid: the students (roster order) by the topics of the units the class was given, each cell not started,
 * in progress (level X of N) or mastered, with the room's mark; filtered by band and unit.
 * -> { units: [{ id, band, title, topics: [{ id, title, room }] }], bands, students: [{ id, name, cells: { topicId: cell } }],
 *      counts: { topicId: { mastered, started } }, filters: { unit, band }, all: [units before filtering] }
 */
export function classGrid(c, { unit = '', band = '' } = {}) {
  const list = assignmentsIn(c.id);
  const seen = new Map();
  for (const a of list) { const k = `${a.snap.band}/${a.snap.unit}`; if (!seen.has(k)) seen.set(k, GL.pathway(a.snap.unit, a.snap.band)); }
  const all = [...seen.values()].filter(Boolean);
  const bands = GL.BAND_IDS.filter(b => all.some(p => p.band === b));
  const fb = bands.includes(band) ? band : '', fu = all.some(p => p.id === unit && (!fb || p.band === fb)) ? unit : '';
  const units = all.filter(p => (!fb || p.band === fb) && (!fu || p.id === fu)).map(p => ({ id: p.id, band: p.band, title: p.title,
    topics: p.topics.map(id => ({ id, title: GL.topic(id).title, room: !!GL.room(id) })) }));
  const ids = [...new Set(units.flatMap(x => x.topics.map(t => t.id)))];
  const students = S.roster(c.id).filter(p => p.role === 'student').map(p => {
    const mastered = GL.masteredSet(p), passed = GL.roomPassedSet(p);
    return { id: p.id, name: nameOf(p), user: p, cells: Object.fromEntries(ids.map(id => [id, cellOf(p, id, mastered, passed)])) };
  });
  const counts = Object.fromEntries(ids.map(id => [id, { mastered: students.filter(s => s.cells[id].state === 'mastered').length, started: students.filter(s => s.cells[id].state === 'started').length }]));
  return { units, bands, students, counts, filters: { unit: fu, band: fb }, all: all.map(p => ({ id: p.id, band: p.band, title: p.title })), assignments: list.length };
}
/** The last time this student did anything on these topics (a quiz answer, a room, a mastery), or null. */
function lastActive(user, ids) {
  if (!ids.length) return null;
  const keys = [...ids, ...ids.map(id => `room:${id}`)];
  const a = q.get(`SELECT MAX(updated_at) t FROM grammar_lab_quiz WHERE user_id=? AND topic IN (${keys.map(() => '?').join(',')})`, user.id, ...keys);
  const b = q.get(`SELECT MAX(completed_at) t FROM course_progress WHERE user_id=? AND course=? AND step IN (${ids.map(() => '?').join(',')})`, user.id, GL.SLUG, ...ids);
  return Math.max((a && a.t) || 0, (b && b.t) || 0) || null;
}
/**
 * One student's view: each unit the class was given, with its ring and its topics (status, attempts: the quiz runs
 * started; wrong: the wrong answers in the latest run; the room; the last activity), and their band.
 * -> { student, place, units: [{ id, band, title, done, total, topics: [{ id, title, state, level, levels, attempts,
 *      wrong, room, last }] }] }
 */
export function studentView(c, student) {
  const grid = classGrid(c);
  const mastered = GL.masteredSet(student), passed = GL.roomPassedSet(student);
  const units = grid.all.map(x => GL.pathway(x.id, x.band)).filter(Boolean).map(p => {
    const topics = p.topics.map(id => {
      const run = GL.currentRun(student, id), cell = cellOf(student, id, mastered, passed);
      return { id, title: GL.topic(id).title, ...cell, attempts: run ? run.runs || 1 : 0, wrong: run ? run.history.filter(h => !h.ok).length : 0, last: lastActive(student, [id]) };
    });
    return { id: p.id, band: p.band, title: p.title, done: topics.filter(x => x.state === 'mastered').length, total: topics.length, topics };
  });
  return { student, place: GL.placeOf(student), units };
}
/** Is this a student of the class (active)? -> their roster row, or null. */
export const studentIn = (c, id) => S.roster(c.id).find(p => p.role === 'student' && p.id === String(id || '')) || null;

// ---------------------------------------------------------------- placement
/** A teacher's choice of band for a student of their class (absolute), or '' to go back to the grade. -> placeOf | fail */
export function setBand(u, c, studentId, band) {
  if (!canView(u, c)) return fail('notFound');
  const s = studentIn(c, studentId); if (!s) return fail('notInClass');
  const p = GL.setBandFor(s, band === '' ? null : band, u.id);
  if (!p) return fail('badBand');
  audit(u.id, 'grammarLab.band', c.id, { student: s.id, band: band || null });
  return ok({ place: p });
}
