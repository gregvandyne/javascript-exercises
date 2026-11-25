// Homeroom, step 3c: aides (docs/decisions.md "Homeroom: supports, aides and sub links"). A class's teacher lets another
// adult help in the class's Homeroom: by an invite link (they open it signed in to their own staff account; the teacher
// sends it by email themselves) or by picking a teacher of the same school. An aide opens that class's Homeroom only:
// the desks and their live status, hands and the hall pass, a look at a student's desk, comments and stickers, a
// student's supports (to read, not change). An aide never changes grades or grading, removes handouts, edits groups or
// seating, plans with the AI, sees billing, ends class or reads a notebook: those services ask canUseClass (the class's
// own teachers), and the routes refuse an aide with 403. The aide needs no Teacher plan: the class has Homeroom through
// its own teacher's (services/homeroom.js classHasHomeroom). The teacher removes an aide at any time.
//
// Who can be an aide: a staff account (school staff anywhere, or the platform admin: services/schools.js isSchoolStaff,
// auth.js accountKind 'staff'), never a student, a grown-up (family) account, a guest or a banned account; never one of
// the class's own teachers (they already run it).
import crypto from 'node:crypto';
import { q, uid, now, audit } from '../db.js';
import { accountKind, getUser } from '../auth.js';
import * as S from './schools.js';
import * as H from './homeroom.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
/** Aides and open invites a class may have at once. */
export const AIDES_MAX = 10;
/** An invite link works this long, once. */
export const INVITE_MS = 7 * 86400e3;
const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
export const hashOf = token => crypto.createHash('sha256').update(String(token || '')).digest('hex');

/** May this account be an aide at all (an adult staff account)? */
export const adultStaff = u => !!u && !u.is_guest && !u.banned && !u.hrSub && accountKind(u) === 'staff';
const rowOf = (classId, userId) => q.get("SELECT * FROM homeroom_aides WHERE class_id=? AND user_id=? AND status='active'", classId, userId) || null;
/** Is this person an aide of this class now (the class having Homeroom through its own teacher)? */
export function isAide(u, c) {
  if (!H.on() || !c || c.archived_at || !adultStaff(u) || S.teaches(u, c.id)) return false;
  return !!rowOf(c.id, u.id) && H.classHasHomeroom(c);
}
H.onHelper((u, c) => (isAide(u, c) ? 'aide' : null));

const nameOf = r => (r.user_id ? (S.staffName({ id: r.user_id }) || (getUser(r.user_id) || {}).display_name || '') : '');
/** The class's aides and open invites, for its teacher: [{ id, status: active | invited, name, email, at, until }]. */
export function listFor(c, at = now()) {
  return q.all('SELECT * FROM homeroom_aides WHERE class_id=? ORDER BY created_at', c.id)
    .filter(r => r.status === 'active' || (r.invite_until || 0) > at)
    .map(r => ({ id: r.id, status: r.status, name: nameOf(r), email: r.email || '', at: r.joined_at || r.created_at, ...(r.status === 'invited' ? { until: r.invite_until } : {}) }));
}
/** The school's staff a teacher may add as an aide at once: its other staff, not the class's teachers or aides yet. */
export function staffToAdd(u, c) {
  const aides = q.all("SELECT user_id FROM homeroom_aides WHERE class_id=? AND status='active'", c.id).map(r => r.user_id);
  const taken = new Set([...S.roster(c.id).filter(p => p.role === 'teacher').map(p => p.id), ...aides]);
  return S.members(c.school_id, 'staff').filter(m => !m.banned && m.id !== u.id && !taken.has(m.id))
    .map(m => ({ id: m.id, name: m.roster_name || m.display_name || m.username })).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 200);
}
const room = c => listFor(c).length < AIDES_MAX;
const teacherOnly = (u, c) => (H.canUseClass(u, c) ? null : fail(H.helperRole(u, c) ? 'forbidden' : 'notFound'));

/** An invite link for an aide ({ email }: optional, only to remember who it was for). The class's teachers only.
 *  -> { ok, token, aide } (the token is shown once; only its hash is kept) */
export function invite(u, c, { email = '' } = {}) {
  const no = teacherOnly(u, c); if (no) return no;
  const mail = String(email || '').trim().slice(0, 254);
  if (mail && !EMAIL.test(mail)) return fail('badEmail');
  if (!room(c)) return fail('tooManyAides');
  const token = crypto.randomBytes(24).toString('base64url'), id = uid(12), t = now();
  q.run("INSERT INTO homeroom_aides(id, class_id, user_id, status, invite_hash, invite_until, email, invited_by, created_at) VALUES (?,?,NULL,'invited',?,?,?,?,?)",
    id, c.id, hashOf(token), t + INVITE_MS, mail, u.id, t);
  audit(u.id, 'homeroom.aide_invite', c.id, { aide: id, email: !!mail });
  return ok({ token, aide: listFor(c).find(x => x.id === id) });
}
/** A teacher of the same school as an aide, at once. The class's teachers only. -> { ok, aide } */
export function addStaff(u, c, userId) {
  const no = teacherOnly(u, c); if (no) return no;
  const p = getUser(String(userId || ''));
  if (!p || !staffToAdd(u, c).some(x => x.id === p.id) || !adultStaff(p)) return fail('notStaff');
  if (!room(c)) return fail('tooManyAides');
  const id = uid(12), t = now();
  q.run("INSERT INTO homeroom_aides(id, class_id, user_id, status, invited_by, created_at, joined_at) VALUES (?,?,?,'active',?,?,?)", id, c.id, p.id, u.id, t, t);
  audit(u.id, 'homeroom.aide_add', c.id, { aide: id, user: p.id });
  return ok({ aide: listFor(c).find(x => x.id === id) });
}
/** Remove an aide (or an open invite) now. The class's teachers only. -> { ok } */
export function remove(u, c, aideId) {
  const no = teacherOnly(u, c); if (no) return no;
  const r = q.run('DELETE FROM homeroom_aides WHERE id=? AND class_id=?', String(aideId || ''), c.id);
  if (!r.changes) return fail('notFound');
  audit(u.id, 'homeroom.aide_remove', c.id, { aide: String(aideId) });
  return ok();
}

// ---------------------------------------------------------------- the invite link
/** The open invite a token is for: { row, c } or null (used, ended, removed, the class gone or archived). */
export function inviteOf(token, at = now()) {
  if (!token || String(token).length > 100) return null;
  const r = q.get("SELECT * FROM homeroom_aides WHERE invite_hash=? AND status='invited'", hashOf(token));
  if (!r || (r.invite_until || 0) <= at) return null;
  const c = S.getClass(r.class_id);
  return c && !c.archived_at ? { row: r, c } : null;
}
/** The signed-in person takes the invite: they become the class's aide (the link then stops working). Only an adult
 *  staff account; one of the class's own teachers is simply sent to the class. -> { ok, c } */
export function accept(u, token) {
  const x = inviteOf(token); if (!x) return fail('inviteGone');
  if (S.teaches(u, x.c.id)) return ok({ c: x.c, teacher: true });
  if (!adultStaff(u)) return fail('notAdult');
  const t = now();
  if (rowOf(x.c.id, u.id)) q.run('DELETE FROM homeroom_aides WHERE id=?', x.row.id);
  else q.run("UPDATE homeroom_aides SET user_id=?, status='active', invite_hash=NULL, invite_until=NULL, joined_at=? WHERE id=?", u.id, t, x.row.id);
  audit(u.id, 'homeroom.aide_join', x.c.id, { aide: x.row.id });
  return ok({ c: x.c });
}
/** The classes this person helps in as an aide now: [{ id, name }] (their own list of where to go). */
export const classesFor = u => (adultStaff(u) ? q.all("SELECT c.id, c.name FROM homeroom_aides a JOIN classrooms c ON c.id=a.class_id WHERE a.user_id=? AND a.status='active' AND c.archived_at IS NULL ORDER BY c.name", u.id)
  .filter(c => isAide(u, S.getClass(c.id))) : []);

// A class deleted: its aides go (its rows also go with the class row itself).
S.onClassLeave(({ classId, userId = null } = {}) => { if (classId && !userId) q.run('DELETE FROM homeroom_aides WHERE class_id=?', classId); });
