// "Ask my admin" (the navigation proposal's weeks 3–4; docs/decisions.md "Navigation shells"): a teacher whose school
// has no School plan asks the school's admins for one from My classes (/teach). There is no email and no inbox: the ask
// is a row the admins see on their /teach plan card and at the top of the school's Billing tab, until one of them
// dismisses it or the school's plan comes on (checked when the page is read, so nothing is scheduled).
//
// The rows hold ids and dates only, never a message. Closed asks are deleted KEEP_CLOSED after they were closed.
// Students, kids and grown-ups never see anything about asks; the routes are for the school's staff only.
import { q, uid, now, audit } from '../db.js';
import { register } from './jobs.js';
import * as SC from './schools.js';
import * as B from './billing.js';

const DAY = 86400e3;
/** Closed asks are deleted this long after they were closed (the privacy text says 90 days). */
export const KEEP_CLOSED = 90 * DAY;
const fail = code => ({ ok: false, code });

/** Does the school have a School plan that is on now? */
export const planOn = schoolId => !!B.ownerPlan('school', schoolId).entitled;
/** Does the school have at least one admin (by membership)? */
export const hasAdmin = schoolId => !!q.get("SELECT 1 FROM school_members WHERE school_id=? AND role='admin' AND status='active'", schoolId);
/** Staff of this school who are not its admin (a teacher there). The platform admin's all-access doesn't count. */
export function teacherHere(u, schoolId) {
  const m = u && SC.membership(schoolId, u.id);
  return !!m && m.role === 'teacher' && !SC.canManageSchool(u, schoolId);
}
/** Closes the school's open asks once its plan is on ('plan'). Called whenever asks are read. -> rows closed */
export function closeIfPlanOn(schoolId, t = now()) {
  if (!planOn(schoolId)) return 0;
  return q.run("UPDATE school_plan_asks SET closed_at=?, close_reason='plan' WHERE school_id=? AND closed_at IS NULL", t, schoolId).changes;
}
/** This teacher's open ask at this school, or null. */
export const myOpenAsk = (u, schoolId) => (u ? q.get('SELECT * FROM school_plan_asks WHERE school_id=? AND teacher_id=? AND closed_at IS NULL', schoolId, u.id) || null : null);

/** A teacher asks. -> { ok: true, ask, already } | { ok: false, code: 'notFound' | 'planOn' | 'noAdmin' } */
export function ask(u, schoolId) {
  const s = SC.getSchool(schoolId);
  if (!s || s.archived_at || !teacherHere(u, s.id)) return fail('notFound');
  if (closeIfPlanOn(s.id) || planOn(s.id)) return fail('planOn');
  if (!hasAdmin(s.id)) return fail('noAdmin');
  const open = myOpenAsk(u, s.id);
  if (open) return { ok: true, ask: open, already: true };
  const row = { id: uid(), school_id: s.id, teacher_id: u.id, created_at: now() };
  try { q.run('INSERT INTO school_plan_asks(id, school_id, teacher_id, created_at) VALUES (?,?,?,?)', row.id, row.school_id, row.teacher_id, row.created_at); }
  catch (e) { if (/UNIQUE/.test(e.message)) return { ok: true, ask: myOpenAsk(u, s.id), already: true }; throw e; }
  audit(u.id, 'school.plan.ask', s.id, { ask: row.id });
  return { ok: true, ask: row, already: false };
}

/** The school's open asks, oldest first, with the teacher's name as the school knows it (roster name, else display
 *  name). Closes them first if the plan is on. -> [{ id, teacher_id, name, created_at }] */
export function openAsks(schoolId) {
  closeIfPlanOn(schoolId);
  return q.all(`SELECT a.id, a.teacher_id, a.created_at, COALESCE(NULLIF(m.roster_name, ''), u.display_name) name
    FROM school_plan_asks a JOIN users u ON u.id=a.teacher_id LEFT JOIN school_members m ON m.school_id=a.school_id AND m.user_id=a.teacher_id
    WHERE a.school_id=? AND a.closed_at IS NULL ORDER BY a.created_at, a.id`, schoolId);
}

/** A school admin dismisses one ask. -> { ok } | { ok: false, code: 'notFound' } */
export function dismiss(by, schoolId, askId) {
  if (!SC.canManageSchool(by, schoolId)) return fail('notFound');
  const r = q.run("UPDATE school_plan_asks SET closed_at=?, closed_by=?, close_reason='dismissed' WHERE id=? AND school_id=? AND closed_at IS NULL", now(), by.id, String(askId || ''), schoolId);
  if (!r.changes) return fail('notFound');
  audit(by.id, 'school.plan.ask.dismiss', schoolId, { ask: String(askId) });
  return { ok: true };
}

/** Deletes asks KEEP_CLOSED after they were closed. -> rows deleted */
export function retention(t = now()) {
  return q.run('DELETE FROM school_plan_asks WHERE closed_at IS NOT NULL AND closed_at < ?', t - KEEP_CLOSED).changes;
}
register('school-plan-asks-retention', DAY, () => retention(), { firstAfterMs: 8 * 60e3 });
