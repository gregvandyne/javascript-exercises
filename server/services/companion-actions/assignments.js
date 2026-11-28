// Oomba's action cards for a class's assignments (registry: ./index.js; helpers: ./shared.js; strings:
// js.companion.act.assignments.*). Each calls the same service as the page's own route: the class page
// (routes/lessons.js), the Figures worksheet's Assign (routes/figures.js), the Manipulatives page's Assign
// (routes/manipulatives.js) and the class's Google Classroom page (routes/gclassroom.js).
import { q } from '../../db.js';
import * as S from '../schools.js';
import * as L from '../lessons.js';
import * as F from '../figures.js';
import * as FS from '../figures-steps.js';
import * as M from '../manipulatives.js';
import * as MT from '../manip-tasks.js';
import * as GC from '../gclassroom.js';
import { siteBase } from '../email.js';
import { tFor } from '../../i18n/index.js';
import { toolOf } from '../../../public/js/manip-data.js';
import { no, clean, fold, whichClass, className, assignmentIn, someStudents, ownIn, ownLessons, ownPlans, clNow, isoDay, fmtDay, dayParam, assignedLink, CLASS_REF, ASSIGNMENT, P } from './shared.js';

const STUDENTS = { type: 'array', maxItems: 30, items: { type: 'string' }, description: 'Only for some students: the placeholders exactly as written, like [student 1]. Leave out for the whole class.' };
const DUE = P('The due day as YYYY-MM-DD (work it out from today), only when the teacher gave one.');
const OPENS = P('The day it opens for students as YYYY-MM-DD, only when the teacher asked for a later start.');
/** The due and open days from the AI. -> { due, opens } | { error } */
function daysOf(p) {
  const due = dayParam(p.due), opens = dayParam(p.opens);
  if (due === false || opens === false) return no('A day must be YYYY-MM-DD.');
  if (due && opens && due < opens) return no('The due day is before the open day.');
  return { due: due || null, opens: opens || null };
}
/** An assignment read back as made: still in this class, for exactly these students ([] the whole class). */
function assignedOk(clId, classId, students) {
  const cl = clNow(clId); if (!cl || cl.class_id !== classId) return false;
  const who = L.studentsOfLesson(clId);
  return who.length === students.length && students.every(x => who.includes(x));
}
/** Undo an assignment Oomba made: off the class again (students' work is kept), unless it is gone already. */
function undoAssignment(u, d) {
  if (!clNow(d.clId)) return { ok: true, skipped: 1 };
  const r = L.unassign(u, d.clId);
  return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
}
/** Who and when, for a card: the whole class or some students, the open day, the due day. */
const whoLines = (t, d) => [d.students ? t('js.companion.asg.some', { count: d.students }) : t('js.companion.asg.all'), d.opens ? t('js.companion.act.assignments.due.opens', { day: fmtDay(d.opens, t) }) : '', d.due ? t('js.companion.asg.due', { day: fmtDay(d.due, t) }) : ''].filter(Boolean);
const workLink = (d, t) => ({ href: `/class/${encodeURIComponent(d.classId)}/progress/${encodeURIComponent(d.clId)}`, label: t('js.companion.act.assignments.seeWork') });
/** The order of an assignment's list on the class page (its unit's, or the lessons outside a unit), as L.reorderAssignment sees it. */
function listOf(clId) {
  const cl = clNow(clId); if (!cl) return null;
  return q.all('SELECT id FROM class_lessons WHERE class_id=? AND unit_id IS ? AND removed_at IS NULL ORDER BY position, rowid', cl.class_id, cl.unit_id || null).map(r => r.id);
}
/** One of the class's units by its name. -> { un } | { error } */
function unitIn(ctx, c, ref) {
  const all = L.unitsOf(c.id).map(x => ({ ...x, title: x.name }));
  if (!all.length) return no('The class has no units.');
  const r = ownIn(ctx, all, ref, 'unit');
  return r.it ? { un: r.it } : r;
}
/** Why an assignment cannot be posted to Google Classroom now (the class's Google Classroom page's own rules), or ''. */
function classroomWhy(u, classId, cl) {
  if (!GC.enabled()) return 'Google Classroom is not turned on on this site.';
  if (!GC.mayConnect(u)) return 'Only school staff can post to Google Classroom.';
  if (GC.connectionState(u.id) !== 'ok') return 'The teacher has not connected Google Classroom (or must connect it again): Connect is on the class\'s Google Classroom page.';
  if (!GC.linkOf(classId)) return 'This class is not linked to a Google Classroom class yet: the teacher links one on the class\'s Google Classroom page.';
  if (GC.someStudents(cl)) return 'It is assigned to some students only, and a post in Classroom reaches the whole class, so it cannot be posted.';
  if (!GC.can(u.id, 'coursework')) return 'The teacher has not allowed Oomba Academy to post to Classroom yet: they allow it on the class\'s Google Classroom page.';
  if (GC.postOf(cl.id, 'assignment')) return 'It is already posted to Google Classroom.';
  return '';
}
const classroomLink = s => (typeof s === 'string' && /^https:\/\/classroom\.google\.com\//.test(s) ? s : '');

export default [
  // POST /api/class-lessons/:id: L.updateAssignment (due day, open day). Undo restores the old days.
  {
    id: 'changeDue', area: 'assignments', risk: 'normal', undoable: true,
    label: 'Change (or clear) the due day or the open day of one of a class\'s assignments.',
    params: { classRef: CLASS_REF, assignment: ASSIGNMENT, due: P('The new due day as YYYY-MM-DD (work it out from today), or "none" to clear it.'), opens: P('The new open day as YYYY-MM-DD, or "none", only when the teacher asked.') },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const a = assignmentIn(ctx, w.c, p.assignment); if (!a.cl) return a;
      const due = dayParam(p.due), opens = dayParam(p.opens);
      if (due === false || opens === false) return no('A day must be YYYY-MM-DD (or "none").');
      if (due === undefined && opens === undefined) return no('Say the new due day (or open day).');
      return {
        data: { classId: w.c.id, clId: a.cl.id, title: a.cl.title, ...(due !== undefined ? { due } : {}), ...(opens !== undefined ? { opens } : {}) },
        ai: `Change the dates of "${clean(ctx, a.cl.title)}" in ${clean(ctx, w.c.name)}:${due !== undefined ? ` due ${due || 'none'}` : ''}${opens !== undefined ? ` opens ${opens || 'none'}` : ''}.`,
      };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.due.ask', { title: d.title, class: className(d.classId) }), lines: dateLines(d, t) }),
    run(u, d) {
      const old = clNow(d.clId); if (!old) return { ok: false, code: 'notFound' };
      const r = L.updateAssignment(u, d.clId, { ...('due' in d ? { dueAt: d.due || '' } : {}), ...('opens' in d ? { opensAt: d.opens || '' } : {}) });
      if (!r.ok) return r;
      const back = clNow(d.clId);
      const landed = !!back && (!('due' in d) || isoDay(back.due_at) === d.due) && (!('opens' in d) || isoDay(back.opens_at) === d.opens);
      return { ok: true, landed, done: { classId: d.classId, title: d.title, ...('due' in d ? { due: isoDay(back.due_at) } : {}), ...('opens' in d ? { opens: isoDay(back.opens_at) } : {}) }, undo: { clId: d.clId, due: isoDay(old.due_at), opens: isoDay(old.opens_at) } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.due.done', { title: d.title }), ...dateLines(d, t)], links: [assignedLink(d.classId, t)] }),
    undo(u, d) {
      if (!clNow(d.clId)) return { ok: true, skipped: 1 };
      const r = L.updateAssignment(u, d.clId, { dueAt: d.due || '', opensAt: d.opens || '' });
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/class-lessons/:id/delete: L.unassign (students' work is kept). Undo: L.assign of the same lesson to the
  // same class, which brings the assignment back with its work, days, unit and students (lessons.js assign).
  {
    id: 'unassign', area: 'assignments', risk: 'delete', warn: 'unassign', undoable: true,
    label: 'Take an assignment off a class (students\' work is kept; Undo brings it back).',
    params: { classRef: CLASS_REF, assignment: ASSIGNMENT },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const a = assignmentIn(ctx, w.c, p.assignment); if (!a.cl) return a;
      return { data: { classId: w.c.id, clId: a.cl.id, title: a.cl.title }, ai: `Take "${clean(ctx, a.cl.title)}" off ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.unassign.ask', { title: d.title, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const old = clNow(d.clId); if (!old) return { ok: false, code: 'notFound' };
      const students = L.studentsOfLesson(old.id);
      const r = L.unassign(u, d.clId); if (!r.ok) return r;
      return { ok: true, landed: !clNow(d.clId), done: { classId: d.classId, title: d.title }, undo: { classId: d.classId, lessonId: old.lesson_id, unitId: old.unit_id || null, opens: isoDay(old.opens_at), due: isoDay(old.due_at), students } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.unassign.done', { title: d.title, class: className(d.classId) })], links: [assignedLink(d.classId, t)] }),
    undo(u, d) {
      const r = L.assign(u, d.classId, d.lessonId, { unitId: d.unitId, opensAt: d.opens, dueAt: d.due, students: d.students || [] });
      return r.ok ? { ok: true, skipped: 0 } : r.code === 'alreadyAssigned' ? { ok: true, skipped: 1 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/lessons/:id/assign: L.assign (one of the teacher's own lessons, its days, the whole class or some
  // students). Undo: L.unassign (the work is kept).
  {
    id: 'assignLesson', area: 'assignments', risk: 'normal', undoable: true,
    label: 'Assign one of the teacher\'s OWN lesson plans (their lesson library, by its title) to a class or some of its students, with a due day or an open day when they gave one. Games and books: use assign.',
    params: { classRef: CLASS_REF, lesson: P('Words of the lesson\'s title as the teacher wrote them.'), due: DUE, opens: OPENS, students: STUDENTS },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const l = ownIn(ctx, ownPlans(u, w.c.school_id), p.lesson, 'lesson plan'); if (!l.it) return l;
      const days = daysOf(p); if (days.error) return days;
      if (L.classLessons(w.c.id).some(x => x.lesson_id === l.it.id)) return no(`${clean(ctx, w.c.name)} already has "${clean(ctx, l.it.title)}" assigned.`);
      const s = someStudents(ctx, w.c, p.students); if (s.error) return s;
      return {
        data: { classId: w.c.id, lessonId: l.it.id, title: l.it.title, ...days, students: s.ids },
        ai: `Assign the lesson plan "${clean(ctx, l.it.title)}" to ${clean(ctx, w.c.name)} (${s.ids.length ? `${s.ids.length} students` : 'the whole class'}${days.opens ? `, opens ${days.opens}` : ''}${days.due ? `, due ${days.due}` : ''}).`,
      };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.lesson.ask', { title: d.title, class: className(d.classId) }), lines: whoLines(t, { ...d, students: d.students.length }) }),
    run(u, d) {
      const r = L.assign(u, d.classId, d.lessonId, { opensAt: d.opens, dueAt: d.due, students: d.students });
      if (!r.ok) return r;
      const cl = r.classLesson;
      return { ok: true, landed: assignedOk(cl.id, d.classId, d.students) && isoDay(cl.due_at) === d.due && isoDay(cl.opens_at) === d.opens, done: { classId: d.classId, clId: cl.id, title: d.title, students: d.students.length, due: d.due, opens: d.opens }, undo: { clId: cl.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.lesson.done', { title: d.title, class: className(d.classId) }), ...whoLines(t, d)], links: [workLink(d, t), assignedLink(d.classId, t, 'lesson')] }),
    undo: undoAssignment,
  },

  // POST /api/figures/worksheets/:id/assign: FS.assignWorksheet (a lesson with the worksheet's questions as they are
  // now, assigned to a class the teacher teaches). Undo: L.unassign of that assignment (the lesson stays in their library).
  {
    id: 'assignWorksheet', area: 'assignments', risk: 'students', warn: 'students', undoable: true,
    label: 'Assign one of the teacher\'s Figures worksheets or tests (its title words, or its id from findMyPages kind figures-sheet; on a worksheet\'s page, that one) to a class they teach, with a due day or an open day when they gave one.',
    params: { classRef: CLASS_REF, worksheet: P('Words of the worksheet\'s title, or its id (findMyPages, makeWorksheet). Leave out on the worksheet\'s own page.'), due: DUE, opens: OPENS },
    plan(u, ctx, p) {
      if (!F.canMake(u)) return no('Figures is not available for this account.');
      const ws = ownIn(ctx, F.listWorksheets(u), p.worksheet, 'worksheet', ctx.page && ctx.page.type === 'figures-sheet' ? ctx.page.sheetId : ''); if (!ws.it) return ws;
      const snap = FS.snapshot(u, ws.it.id);
      if (!snap.ok) return no(snap.code === 'empty' ? 'The worksheet has no questions yet.' : snap.code === 'noAnswer' ? `Question ${(snap.questions || []).join(', ')} has no answer yet: the teacher gives it one on the worksheet first.` : 'That worksheet cannot be assigned.');
      const w = whichClass(u, ctx, p.classRef, { fit: c => !c.archived_at && S.teaches(u, c.id) }); if (!w.c) return w;
      const days = daysOf(p); if (days.error) return days;
      const title = ws.it.title || tFor(ctx.lang)('figures.sheet.untitled');
      return { data: { classId: w.c.id, sheetId: ws.it.id, title, ...days }, ai: `Assign the worksheet "${clean(ctx, title)}" (${snap.items.length} questions) to ${clean(ctx, w.c.name)}${days.opens ? `, opens ${days.opens}` : ''}${days.due ? `, due ${days.due}` : ''}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.sheet.ask', { title: d.title, class: className(d.classId) }), lines: whoLines(t, { ...d, students: 0 }) }),
    run(u, d) {
      const r = FS.assignWorksheet(u, d.sheetId, d.classId, { opensAt: d.opens, dueAt: d.due });
      if (!r.ok) return r;
      const cl = r.classLesson;
      return { ok: true, landed: assignedOk(cl.id, d.classId, []) && isoDay(cl.due_at) === d.due, done: { classId: d.classId, clId: cl.id, title: d.title, due: d.due, opens: d.opens }, undo: { clId: cl.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.sheet.done', { title: d.title, class: className(d.classId) }), ...whoLines(t, { ...d, students: 0 })], links: [workLink(d, t), assignedLink(d.classId, t, 'sheet')] }),
    undo: undoAssignment,
  },

  // POST /api/manipulatives/assign: MT.assign (practice tasks of one Manipulatives tool, a count of questions each, to a
  // class). The board says which tool; the teacher names the tasks. Undo: L.unassign of that assignment.
  {
    id: 'assignBoard', area: 'assignments', risk: 'students', warn: 'students', undoable: true,
    label: 'Assign practice on a Manipulatives board\'s tool to a class: 1 to 6 of the tool\'s practice tasks (by their titles), a count of questions of each, with a due day or an open day when given. The board: its title words or id (findMyPages kind manip); on a board\'s page, that one. Without tasks the result lists them.',
    params: { classRef: CLASS_REF, board: P('Words of the board\'s title, or its id. Leave out on the board\'s own page.'), tasks: { type: 'array', maxItems: 6, items: { type: 'string' }, description: 'Practice tasks of the board\'s tool, by their titles.' }, count: { type: 'integer', description: 'Questions of each task (1 to 10), only when the teacher said.' }, due: DUE, opens: OPENS },
    plan(u, ctx, p) {
      if (!M.canHost(u)) return no('Manipulatives is not available for this account.');
      const b = ownIn(ctx, [...M.listBoards(u, { all: true }), ...M.listRecent(u)], p.board, 'board', ctx.page && ctx.page.type === 'manip' ? ctx.page.boardId : ''); if (!b.it) return b;
      const tool = (toolOf(b.it.tool) || {}).name || b.it.tool, all = MT.practiceOf(b.it.tool);
      if (!all.length) return no(`${tool} has no practice tasks to assign.`);
      const names = xs => xs.map(x => `"${x.title}"`).join(', ');
      const words = (Array.isArray(p.tasks) ? p.tasks : p.tasks ? [p.tasks] : []).map(String).filter(x => x.trim());
      if (!words.length) return no(`Say which practice tasks (1 to ${MT.TASKS_MAX}). ${tool} has: ${names(all)}.`);
      const picked = [];
      for (const wd of words.slice(0, 10)) {
        let hit = all.filter(x => x.id === wd || fold(x.title) === fold(wd));
        if (!hit.length) hit = all.filter(x => fold(x.title).includes(fold(wd)));
        if (hit.length !== 1) return no(hit.length ? `"${clean(ctx, wd, 40)}" fits more than one task: ${names(hit)}.` : `${tool} has no practice task called "${clean(ctx, wd, 40)}". It has: ${names(all)}.`);
        if (!picked.includes(hit[0].id)) picked.push(hit[0].id);
      }
      const count = p.count === undefined || p.count === null || p.count === '' ? Math.min(5, Math.floor(MT.SET_MAX / picked.length)) : Math.floor(Number(p.count));
      const pick = MT.cleanPick({ tasks: picked, count });
      if (!pick.ok) return no(pick.code === 'tooManyTasks' ? `At most ${MT.TASKS_MAX} tasks in one set.` : pick.code === 'badCount' ? `Each task gets 1 to ${MT.COUNT_MAX} questions, at most ${MT.SET_MAX} in all.` : 'Those tasks cannot be assigned together.');
      const w = whichClass(u, ctx, p.classRef, { fit: c => MT.canAssignTo(u, c) }); if (!w.c) return w;
      const days = daysOf(p); if (days.error) return days;
      const titles = pick.tasks.map(id => all.find(x => x.id === id).title);
      return { data: { classId: w.c.id, board: b.it.title, tool: b.it.tool, tasks: pick.tasks, count: pick.n, ...days }, ai: `Assign ${pick.n} questions each of ${names(titles.map(title => ({ title })))} (${tool}, from the board "${clean(ctx, b.it.title)}") to ${clean(ctx, w.c.name)}${days.opens ? `, opens ${days.opens}` : ''}${days.due ? `, due ${days.due}` : ''}.` };
    },
    view(u, d, t) {
      const all = MT.practiceOf(d.tool), tool = (toolOf(d.tool) || {}).name || d.tool;
      return { title: t('js.companion.act.assignments.practice.ask', { title: d.board, class: className(d.classId) }),
        lines: [t('js.companion.act.assignments.practice.tasks', { tool, tasks: d.tasks.map(id => (all.find(x => x.id === id) || {}).title || id).join(', ') }), t('js.companion.act.assignments.practice.count', { count: d.count }), ...whoLines(t, { ...d, students: 0 })] };
    },
    run(u, d) {
      const r = MT.assign(u, { classId: d.classId, tasks: d.tasks, count: d.count, opensAt: d.opens, dueAt: d.due });
      if (!r.ok) return r;
      const cl = r.classLesson;
      return { ok: true, landed: assignedOk(cl.id, d.classId, []) && r.n === d.count * d.tasks.length, done: { classId: d.classId, clId: cl.id, title: r.title, n: r.n, due: d.due, opens: d.opens }, undo: { clId: cl.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.practice.done', { title: d.title, class: className(d.classId), count: d.n }), ...whoLines(t, { ...d, students: 0 })], links: [workLink(d, t), assignedLink(d.classId, t)] }),
    undo: undoAssignment,
  },

  // POST /api/classes/:id/units: L.createUnit. Undo: L.deleteUnit while nothing was put in it.
  {
    id: 'createUnit', area: 'assignments', risk: 'normal', undoable: true,
    label: 'Add a unit (a group for a class\'s assignments, like "Fractions") to a class.',
    params: { classRef: CLASS_REF, name: P('The new name, only when renaming (never a student\'s name).') },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const n = clean(ctx, p.name, 60); if (!n) return no('Say the unit\'s name.');
      if (/\[student/i.test(n)) return no('A unit\'s name cannot be a student.');
      if (L.unitsOf(w.c.id).some(x => fold(x.name) === fold(n))) return no(`${clean(ctx, w.c.name)} already has a unit called "${n}".`);
      return { data: { classId: w.c.id, name: n }, ai: `Add the unit "${n}" to ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.unit.ask', { name: d.name, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const r = L.createUnit(u, d.classId, d.name); if (!r.ok) return r;
      const back = L.getUnit(r.unit.id);
      return { ok: true, landed: !!back && back.class_id === d.classId && back.name === d.name, done: { classId: d.classId, name: back ? back.name : d.name }, undo: { unitId: r.unit.id } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.unit.done', { name: d.name, class: className(d.classId) })], links: [assignedLink(d.classId, t)] }),
    undo(u, d) {
      const un = L.getUnit(d.unitId); if (!un) return { ok: true, skipped: 1 };
      if (q.get('SELECT 1 FROM class_lessons WHERE unit_id=? AND removed_at IS NULL', un.id)) return { ok: false, code: 'notEmpty' };
      const r = L.deleteUnit(u, un.id);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/class-units/:id: L.renameUnit. Undo: the old name back, while it still has Oomba's.
  {
    id: 'renameUnit', area: 'assignments', risk: 'normal', undoable: true,
    label: 'Rename one of a class\'s units.',
    params: { classRef: CLASS_REF, unit: P('The unit\'s name as it is now.'), name: P('The new name, only when renaming (never a student\'s name).') },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const x = unitIn(ctx, w.c, p.unit); if (!x.un) return x;
      const n = clean(ctx, p.name, 60); if (!n) return no('Say the unit\'s new name.');
      if (/\[student/i.test(n)) return no('A unit\'s name cannot be a student.');
      if (n === x.un.name) return no('The unit already has that name.');
      return { data: { classId: w.c.id, unitId: x.un.id, old: x.un.name, name: n }, ai: `Rename the unit "${clean(ctx, x.un.name)}" of ${clean(ctx, w.c.name)} to "${n}".` };
    },
    view: (u, d, t) => ({ title: t('js.companion.act.assignments.renameUnit.ask', { old: d.old, name: d.name, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const old = L.getUnit(d.unitId); if (!old || old.class_id !== d.classId) return { ok: false, code: 'notFound' };
      const r = L.renameUnit(u, d.unitId, d.name); if (!r.ok) return r;
      const back = L.getUnit(d.unitId);
      return { ok: true, landed: !!back && back.name === d.name, done: { classId: d.classId, name: back.name }, undo: { unitId: d.unitId, old: old.name, name: back.name } };
    },
    doneView: (u, d, t) => ({ lines: [t('js.companion.act.assignments.renameUnit.done', { name: d.name })], links: [assignedLink(d.classId, t)] }),
    undo(u, d) {
      const un = L.getUnit(d.unitId); if (!un || un.name !== d.name) return { ok: true, skipped: 1 };
      const r = L.renameUnit(u, un.id, d.old);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/class-lessons/:id/up and /down: L.reorderAssignment (one place, within its unit). Undo: one place back.
  {
    id: 'reorderAssignment', area: 'assignments', risk: 'normal', undoable: true,
    label: 'Move one of a class\'s assignments one place up or down in its list on the class page (within its unit).',
    params: { classRef: CLASS_REF, assignment: ASSIGNMENT, direction: P('"up" or "down".', { enum: ['up', 'down'] }) },
    plan(u, ctx, p) {
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const a = assignmentIn(ctx, w.c, p.assignment); if (!a.cl) return a;
      const dir = /^up$/i.test(String(p.direction || '')) ? -1 : /^down$/i.test(String(p.direction || '')) ? 1 : 0;
      if (!dir) return no('Say "up" or "down".');
      const list = listOf(a.cl.id) || [], i = list.indexOf(a.cl.id);
      if (dir < 0 && i <= 0) return no('It is already first in its list.');
      if (dir > 0 && i >= list.length - 1) return no('It is already last in its list.');
      return { data: { classId: w.c.id, clId: a.cl.id, title: a.cl.title, dir }, ai: `Move "${clean(ctx, a.cl.title)}" one place ${dir < 0 ? 'up' : 'down'} in ${clean(ctx, w.c.name)}.` };
    },
    view: (u, d, t) => ({ title: t(`js.companion.act.assignments.move.${d.dir < 0 ? 'up' : 'down'}`, { title: d.title, class: className(d.classId) }), lines: [] }),
    run(u, d) {
      const before = listOf(d.clId); if (!before) return { ok: false, code: 'notFound' };
      const i = before.indexOf(d.clId);
      const r = L.reorderAssignment(u, d.clId, d.dir); if (!r.ok) return r;
      const j = (listOf(d.clId) || []).indexOf(d.clId);
      return { ok: true, landed: j === i + d.dir, done: { classId: d.classId, title: d.title, dir: d.dir }, undo: { clId: d.clId, dir: -d.dir, at: j } };
    },
    doneView: (u, d, t) => ({ lines: [t(`js.companion.act.assignments.move.${d.dir < 0 ? 'movedUp' : 'movedDown'}`, { title: d.title })], links: [assignedLink(d.classId, t)] }),
    undo(u, d) {
      const list = listOf(d.clId); if (!list || list.indexOf(d.clId) !== d.at) return { ok: true, skipped: 1 };
      const r = L.reorderAssignment(u, d.clId, d.dir);
      return r.ok ? { ok: true, skipped: 0 } : { ok: false, code: 'notFound' };
    },
  },

  // POST /api/class-lessons/:id/google-classroom/post: GC.postLesson (as a Classroom assignment with its due day, to
  // the class's linked Classroom class). Only with Google Classroom on, the teacher connected and allowed to post, the
  // class linked. The post is made on the tap only (send), never in the dry run; it can't be taken back from the chat.
  {
    id: 'postToClassroom', area: 'assignments', risk: 'external', warn: 'classroom', undoable: false,
    label: 'Post one of a class\'s assignments to the class\'s linked Google Classroom class (as an assignment, with its due day), when the teacher has connected Google Classroom and linked the class.',
    params: { classRef: CLASS_REF, assignment: ASSIGNMENT },
    plan(u, ctx, p) {
      if (!GC.enabled()) return no('Google Classroom is not turned on on this site.');
      const w = whichClass(u, ctx, p.classRef); if (!w.c) return w;
      const a = assignmentIn(ctx, w.c, p.assignment); if (!a.cl) return a;
      const why = classroomWhy(u, w.c.id, a.cl); if (why) return no(why);
      return { data: { classId: w.c.id, clId: a.cl.id, title: a.cl.title, lang: ctx.lang || 'en' }, ai: `Post "${clean(ctx, a.cl.title)}" of ${clean(ctx, w.c.name)} to its linked Google Classroom class.` };
    },
    view(u, d, t) {
      const cl = L.getClassLesson(d.clId), lk = GC.linkOf(d.classId);
      return { title: t('js.companion.act.assignments.classroom.ask', { title: d.title, class: className(d.classId) }),
        lines: [lk && lk.course_name ? t('js.companion.act.assignments.classroom.course', { course: lk.course_name }) : '', cl && cl.due_at ? t('js.companion.asg.due', { day: fmtDay(isoDay(cl.due_at), t) }) : ''].filter(Boolean) };
    },
    async send(u, d) {
      const cl = L.getClassLesson(d.clId), c = cl && S.getClass(cl.class_id);
      if (!cl || !c || c.id !== d.classId || !S.canManageClass(u, c) || classroomWhy(u, c.id, cl)) return { ok: false, code: 'notFound' };
      const t = tFor(d.lang || 'en');
      return GC.postLesson(u, cl, { origin: siteBase(), description: t('gclassroom.post.description'), topicName: t('gclassroom.topic.default') });
    },
    run(u, d, value, { dry, sent } = {}) {
      const cl = L.getClassLesson(d.clId); if (!cl || cl.class_id !== d.classId || !S.canManageClass(u, S.getClass(cl.class_id))) return { ok: false, code: 'notFound' };
      // The dry run (before the card and on the tap): the page's rules, nothing sent. The real run comes after send().
      if (dry) return classroomWhy(u, d.classId, cl) ? { ok: false, code: 'notPostable' } : { ok: true, landed: true, done: {} };
      const back = GC.postOf(d.clId, 'assignment');
      return { ok: true, landed: !!sent && !!back, done: { classId: d.classId, title: d.title, link: classroomLink(back && back.link), scheduled: sent && sent.scheduled ? isoDay(sent.scheduled) : null, pastDue: !!(sent && sent.pastDue) } };
    },
    doneView: (u, d, t) => ({
      lines: [t('js.companion.act.assignments.classroom.done', { title: d.title }), d.scheduled ? t('js.companion.act.assignments.classroom.scheduled', { day: fmtDay(d.scheduled, t) }) : '', d.pastDue ? t('js.companion.act.assignments.classroom.pastDue') : ''].filter(Boolean),
      links: [...(classroomLink(d.link) ? [{ href: d.link, label: t('js.companion.act.assignments.classroom.open'), primary: true }] : []), { href: `/class/${encodeURIComponent(d.classId)}/google-classroom`, label: t('js.companion.act.assignments.classroom.page') }],
    }),
  },
];

function dateLines(d, t) {
  const out = [];
  if ('due' in d) out.push(d.due ? t('js.companion.asg.due', { day: fmtDay(d.due, t) }) : t('js.companion.act.assignments.due.none'));
  if ('opens' in d) out.push(d.opens ? t('js.companion.act.assignments.due.opens', { day: fmtDay(d.opens, t) }) : t('js.companion.act.assignments.due.opensNow'));
  return out;
}
