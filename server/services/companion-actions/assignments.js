// Oomba's action cards for a class's assignments (registry: ./index.js; helpers: ./shared.js; strings:
// js.companion.act.assignments.*). Each calls the same service as the class page's route (routes/lessons.js).
import * as L from '../lessons.js';
import { no, clean, whichClass, className, assignmentIn, clNow, isoDay, fmtDay, dayParam, assignedLink, CLASS_REF, ASSIGNMENT, P } from './shared.js';

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
];

function dateLines(d, t) {
  const out = [];
  if ('due' in d) out.push(d.due ? t('js.companion.asg.due', { day: fmtDay(d.due, t) }) : t('js.companion.act.assignments.due.none'));
  if ('opens' in d) out.push(d.opens ? t('js.companion.act.assignments.due.opens', { day: fmtDay(d.opens, t) }) : t('js.companion.act.assignments.due.opensNow'));
  return out;
}
