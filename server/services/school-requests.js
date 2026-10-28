// "Set up my school" requests (the navigation proposal, week 1): a teacher or school leader fills in a short form on
// /teachers (school name, their role, a work email, about how many students, country) and the platform admin sets the
// school up from the "School requests" queue on /admin (docs/decisions.md "Doors for grown-ups").
//
// This is the one place the site asks for an email, and only from an adult on the teacher page: never from a kid
// account (routes/teachers.js refuses them). The site sends no email: the admin replies by hand. A request is deleted
// KEEP_MS after it was closed (or made, if nobody ever closed it). Nothing a request says is shown anywhere but /admin.
import { q, uid, now, audit } from '../db.js';
import { register } from './jobs.js';
import * as funnel from './funnel.js';

const DAY = 86400e3;
/** How long a request is kept (the form's privacy line says "1 year"). */
export const KEEP_MS = 365 * DAY;
/** The roles a person may pick (their labels are teachers.setup.roles.<key>). */
export const ROLES = ['teacher', 'leader', 'it', 'district', 'other'];
export const LIMITS = { school: 100, email: 254, country: 60, studentsMax: 100000 };
/** Open requests at most (a flood stops at the door; the admin's queue stays readable). */
export const MAX_OPEN = 500;
export const STATUSES = ['open', 'done', 'declined'];

const text = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max + 1);
/** A plain address check: one @, a dot in the domain, no spaces. The admin replies by hand, so it only has to look right. */
export const looksLikeEmail = s => /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:.]{2,}$/.test(s);

/** Checks a form. -> { ok: true, value } | { ok: false, field, fields } (field: the first one to fix; fields: every
 *  one, so a teacher sees all the mistakes at once instead of one per try). */
export function validate(body = {}) {
  const bad = [];
  const school = text(body.school, LIMITS.school);
  if (school.length < 2 || school.length > LIMITS.school) bad.push('school');
  const role = String(body.role || '');
  if (!ROLES.includes(role)) bad.push('role');
  const email = text(body.email, LIMITS.email).toLowerCase();
  if (email.length > LIMITS.email || !looksLikeEmail(email)) bad.push('email');
  const students = Number(String(body.students ?? '').trim());
  if (!Number.isInteger(students) || students < 1 || students > LIMITS.studentsMax) bad.push('students');
  const country = text(body.country, LIMITS.country);
  if (country.length < 2 || country.length > LIMITS.country) bad.push('country');
  if (bad.length) return { ok: false, field: bad[0], fields: bad };
  return { ok: true, value: { school, role, email, students, country } };
}

/** Stores a request. by: the adult account that sent it (a grown-up, school staff, the platform admin), or null for a
 *  guest or someone signed out: a guest is often a child who tapped Play, and signing up keeps the guest's id, so a
 *  guest's id is never stored next to an email (routes/teachers.js passes null).
 *  -> { ok: true, id } | { ok: false, field } | { ok: false, code: 'full' } */
export function createRequest(body, { by = null, locale = '' } = {}) {
  const v = validate(body);
  if (!v.ok) return v;
  if (openCount() >= MAX_OPEN) return { ok: false, code: 'full' };
  const id = uid(12); const r = v.value;
  q.run(`INSERT INTO school_requests(id, school_name, role, email, students, country, locale, user_id, status, created_at)
    VALUES (?,?,?,?,?,?,?,?,'open',?)`, id, r.school, r.role, r.email, r.students, r.country, String(locale || '').slice(0, 12), by ? by.id : null, now());
  funnel.bump('teacher.request');
  return { ok: true, id };
}

export const getRequest = id => (id ? q.get('SELECT * FROM school_requests WHERE id=?', String(id)) : null) || null;
export const openCount = () => q.get("SELECT COUNT(*) n FROM school_requests WHERE status='open'").n;
/** The admin's queue: every open request (oldest first, so the longest wait is on top) and the latest closed ones. */
export function queue({ closed = 20 } = {}) {
  return {
    open: q.all("SELECT r.*, s.slug school_slug, s.name linked_school FROM school_requests r LEFT JOIN schools s ON s.id=r.school_id WHERE r.status='open' ORDER BY r.created_at"),
    closed: q.all("SELECT r.*, s.slug school_slug, s.name linked_school FROM school_requests r LEFT JOIN schools s ON s.id=r.school_id WHERE r.status!='open' ORDER BY r.closed_at DESC LIMIT ?", closed),
  };
}
/** Marks an open request done or declined (schoolId: the school made for it). -> true if it changed. */
export function close(by, id, status, { schoolId = null } = {}) {
  if (status !== 'done' && status !== 'declined') return false;
  const r = getRequest(id);
  if (!r || r.status !== 'open') return false;
  q.run('UPDATE school_requests SET status=?, closed_at=?, closed_by=?, school_id=COALESCE(?, school_id) WHERE id=?', status, now(), by.id, schoolId, r.id);
  // Ids only in the audit log: the email stays in this one table, so it goes when the row goes.
  audit(by.id, `school_request.${status}`, r.id, schoolId ? { school: schoolId } : '');
  return true;
}
/** Opens a closed request again (a mis-click). */
export function reopen(by, id) {
  const r = getRequest(id);
  if (!r || r.status === 'open') return false;
  q.run("UPDATE school_requests SET status='open', closed_at=NULL, closed_by=NULL WHERE id=?", r.id);
  audit(by.id, 'school_request.reopen', r.id);
  return true;
}
/** Deletes requests KEEP_MS after they were closed (or made, when never closed). -> rows deleted */
export function retention(at = now()) {
  return q.run('DELETE FROM school_requests WHERE COALESCE(closed_at, created_at) < ?', at - KEEP_MS).changes;
}
register('school-requests-retention', DAY, () => retention(), { firstAfterMs: 7 * 60e3 });
