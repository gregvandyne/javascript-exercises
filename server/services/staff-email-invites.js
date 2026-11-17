// Staff invites by email: "invite a teacher by their email address". A school admin (or the platform admin) invites an
// address as a Teacher or School admin from the People tab; a teacher of the school invites Teachers only from their
// school's invite page (routes/staff-invites.js). The email has one button, /join-staff/<token>: signed out, the page
// offers Sign in and Create a teacher account (both come back to the link); signed in with the account whose email is
// the invited address, Accept makes them staff the way a username invite does (schools.js answerInvite -> addMember,
// with the inviter as the one who added them), Decline closes it.
//
// The token: 32 random bytes (256 bits), base64url. Only its SHA-256 is stored. It works once and for INVITE_DAYS from
// the last send; Resend makes a new token (the old link stops working). A school has at most MAX_OPEN open invites.
// Privacy: the address is shown only to the school's admins and to the person who sent the invite (never on a public
// page; the join page shows it masked). The audit log keeps the invite's id, never the address.
// Who may accept: the account's email (a Google sign-in's verified address, or the one we keep for it) must be the
// invited address, case-insensitive. A teacher account made after the invite was sent, with no email yet, may claim it:
// the link came to that inbox, and the address is then kept for the account. Never a student, a kid's own account, a
// grown-up's family account, a member already, or another school's school-made account.
import crypto from 'node:crypto';
import { q, uid, now, tx, audit } from '../db.js';
import { getUser, isGrownup } from '../auth.js';
import * as S from './schools.js';
import * as E from './email.js';
import * as F from './email-frame.js';
import { esc } from '../views/html.js';
import { CODES } from '../i18n/index.js';
import { register } from './jobs.js';

export const INVITE_DAYS = 14;
export const MAX_OPEN = 100;
/** Invites (new or sent again) one person may send per hour (routes/staff-invites.js). */
export const PER_INVITER_HOUR = 40;
export const ROLES = ['teacher', 'admin'];
const DAY = 864e5;
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = code => ({ ok: false, code });
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// ---- the token
export const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const newToken = () => crypto.randomBytes(32).toString('base64url');
export const hashToken = tok => crypto.createHash('sha256').update(`staff-email-invite:v1:${tok}`).digest('hex');
export const joinPath = tok => `/join-staff/${tok}`;
export const joinUrl = tok => `${E.siteBase()}${joinPath(tok)}`;
/** A typed address, trimmed and lowercased, or '' when it isn't one. */
export const normInviteEmail = e => E.normEmail(e).toLowerCase();

export const getInvite = id => (id ? q.get('SELECT * FROM staff_email_invites WHERE id=?', String(id)) : null) || null;
/** 'open' | 'expired' | 'used' | 'cancelled' */
export function stateOf(inv, t = now()) {
  if (inv.status === 'cancelled') return 'cancelled';
  if (inv.status !== 'open') return 'used';
  return inv.expires_at <= t ? 'expired' : 'open';
}
/** The invite a link's token names, or null. */
export function byToken(tok) {
  if (typeof tok !== 'string' || !TOKEN_RE.test(tok)) return null;
  return q.get('SELECT * FROM staff_email_invites WHERE token_hash=?', hashToken(tok)) || null;
}

// ---- who may invite, and see which invites
/** 'admin' (the school's admins and the platform admin: any role, every invite) | 'teacher' (Teachers only, their own
 *  invites) | null. Never at an archived school. */
export function inviterRole(u, schoolId) {
  const s = S.getSchool(schoolId);
  if (!u || !s || s.archived_at) return null;
  if (S.canManageSchool(u, s.id)) return 'admin';
  const m = S.membership(s.id, u.id);
  return m && m.role === 'teacher' ? 'teacher' : null;
}
const mayHandle = (u, inv) => { const r = inviterRole(u, inv.school_id); return r === 'admin' || (r === 'teacher' && inv.invited_by === u.id); };
/** Open invites still to be answered (expired ones too, so they can be sent again): all of them for an admin, their
 *  own for a teacher. Each with the inviter's name as the school shows it. */
export function listFor(u, schoolId) {
  const r = inviterRole(u, schoolId); if (!r) return [];
  const rows = q.all(`SELECT * FROM staff_email_invites WHERE school_id=? AND status='open' ${r === 'admin' ? '' : 'AND invited_by=?'} ORDER BY created_at DESC`, schoolId, ...(r === 'admin' ? [] : [u.id]));
  return rows.map(i => ({ ...i, inviter: inviterName(i), expired: i.expires_at <= now() }));
}
export const openCount = schoolId => q.get("SELECT COUNT(*) n FROM staff_email_invites WHERE school_id=? AND status='open' AND expires_at>?", schoolId, now()).n;
/** The inviter's name as the school shows it: their real name on its staff list, else their display name. */
export function inviterName(inv) {
  const m = q.get('SELECT roster_name FROM school_members WHERE school_id=? AND user_id=?', inv.school_id, inv.invited_by);
  const u = getUser(inv.invited_by);
  return (m && m.roster_name) || (u && u.display_name) || '';
}
/** The accounts that have this address (Google's verified one, or the one we keep): their ids. */
const accountsWith = email => q.all(`SELECT user_id FROM google_identities WHERE LOWER(email)=? UNION SELECT user_id FROM email_prefs WHERE LOWER(email)=?`, email, email).map(r => r.user_id);

/** A new invite. { email, rosterName, role, lang } -> { ok, invite, token } | { ok:false, code } */
export function createInvite(by, schoolId, { email, rosterName, role = 'teacher', lang = '' } = {}) {
  const s = S.getSchool(schoolId);
  const may = inviterRole(by, s && s.id); if (!may) return fail('notFound');
  if (!ROLES.includes(role)) return fail('badRole');
  if (role === 'admin' && may !== 'admin') return fail('teachersOnly');
  const e = normInviteEmail(email); if (!e) return fail('badEmail');
  const rn = clip(rosterName, 60); if (!rn) return fail('staffName');
  if (accountsWith(e).some(id => { const m = S.membership(s.id, id); return m && m.role !== 'student'; })) return fail('emailStaff');
  const t = now();
  if (q.get("SELECT 1 FROM staff_email_invites WHERE school_id=? AND email=? AND status='open' AND expires_at>?", s.id, e, t)) return fail('alreadyInvited');
  if (openCount(s.id) >= MAX_OPEN) return fail('tooManyInvites');
  const token = newToken(), id = uid(14);
  tx(() => {
    // An old invite to the same address that ran out is closed: one open invite per school and address.
    q.run("UPDATE staff_email_invites SET status='cancelled', used_at=? WHERE school_id=? AND email=? AND status='open'", t, s.id, e);
    q.run(`INSERT INTO staff_email_invites(id, school_id, email, roster_name, role, token_hash, lang, invited_by, status, created_at, sent_at, expires_at)
      VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)`, id, s.id, e, rn, role, hashToken(token), CODES.includes(lang) ? lang : '', by.id, t, t, t + INVITE_DAYS * DAY);
  });
  audit(by.id, 'school.staff_email_invite', s.id, { invite: id, role });
  return ok({ invite: getInvite(id), token });
}
/** Send again: a new token (the old link stops working) and INVITE_DAYS from now. -> { ok, invite, token } */
export function renewInvite(by, schoolId, id) {
  const inv = getInvite(id);
  if (!inv || inv.school_id !== schoolId || inv.status !== 'open' || !mayHandle(by, inv)) return fail('notFound');
  const expired = inv.expires_at <= now();
  if (expired && openCount(schoolId) >= MAX_OPEN) return fail('tooManyInvites');
  const token = newToken(), t = now();
  q.run('UPDATE staff_email_invites SET token_hash=?, sent_at=?, expires_at=? WHERE id=?', hashToken(token), t, t + INVITE_DAYS * DAY, inv.id);
  audit(by.id, 'school.staff_email_invite_resend', schoolId, { invite: inv.id });
  return ok({ invite: getInvite(inv.id), token });
}
export function cancelInvite(by, schoolId, id) {
  const inv = getInvite(id);
  if (!inv || inv.school_id !== schoolId || inv.status !== 'open' || !mayHandle(by, inv)) return fail('notFound');
  q.run("UPDATE staff_email_invites SET status='cancelled', used_at=? WHERE id=? AND status='open'", now(), inv.id);
  audit(by.id, 'school.staff_email_invite_cancel', schoolId, { invite: inv.id });
  return ok();
}

// ---- answering
/** The account's own addresses (lowercased). */
const addressesOf = userId => q.all("SELECT LOWER(email) e FROM google_identities WHERE user_id=? AND email<>'' UNION SELECT LOWER(email) e FROM email_prefs WHERE user_id=? AND email<>''", userId, userId).map(r => r.e);
/** A child's account, for this rule: a kid's own account (not staff anywhere, not made on the teacher sign-up), or one
 *  a family made or holds as a child. */
function childAccount(u) {
  if (u.made_by_family) return true;
  if (q.get("SELECT 1 FROM family_children WHERE child_id=? AND unlinked_at IS NULL AND status IN ('linked','pending')", u.id)) return true;
  if (u.managed_school) return false;   // a school-made account: the school rules below decide
  return !S.isStaff(u) && !S.teacherToBe(u);
}
/** May this signed-in account answer the invite? -> null (yes) | an error code. Also { claim: true } when the account
 *  has no address and may take the invited one. */
export function checkAnswer(u, inv) {
  if (!u || u.is_guest || u.banned) return { code: 'staffAccountOnly' };
  if (isGrownup(u)) return { code: 'staffAccountOnly' };
  if (u.role === 'admin') return { code: 'staffAccountOnly' };   // the platform admin manages every school already
  if (u.managed_school && u.managed_school !== inv.school_id) return { code: 'otherSchoolAccount' };
  const m = S.membership(inv.school_id, u.id);
  if (m && m.role === 'student') return { code: 'studentHere' };
  if (m) return { code: 'alreadyMember' };
  if (childAccount(u)) return { code: 'childAccount' };
  const mine = addressesOf(u.id);
  if (mine.includes(inv.email)) return null;
  // No address yet: a teacher account made after the email went out (from the link's own "Create a teacher account").
  if (!mine.length && S.teacherToBe(u) && u.created_at >= inv.sent_at) return { claim: true };
  return { code: 'emailMismatch' };
}
/** Accept (they become staff here with the role and real name the invite gave) or decline. Single use.
 *  -> { ok, school, role } | { ok:false, code } (code: a state from stateOf, or one of checkAnswer's) */
export function answer(u, tok, accept) {
  const inv = byToken(tok); if (!inv) return fail('notFound');
  const st = stateOf(inv); if (st !== 'open') return fail(st);
  const s = S.getSchool(inv.school_id); if (!s || s.archived_at) return fail('notFound');
  const c = checkAnswer(u, inv); if (c && c.code) return fail(c.code);
  const t = now();
  if (q.run("UPDATE staff_email_invites SET status=?, used_at=?, used_by=? WHERE id=? AND status='open' AND expires_at>?", accept ? 'accepted' : 'declined', t, u.id, inv.id, t).changes !== 1) return fail('used');
  audit(u.id, accept ? 'school.staff_email_invite_accept' : 'school.staff_email_invite_decline', s.id, { invite: inv.id, role: inv.role });
  if (!accept) return ok({ school: s, role: inv.role });
  const r = S.addMember(getUser(inv.invited_by) || u, s.id, u.id, inv.role, { rosterName: inv.roster_name });
  if (!r.ok) { q.run("UPDATE staff_email_invites SET status='open', used_at=NULL, used_by=NULL WHERE id=?", inv.id); return r; }
  // A username invite to the same school is answered too; a new teacher's sign-up steps are done (onboarding.js).
  q.run('DELETE FROM staff_invites WHERE school_id=? AND user_id=?', s.id, u.id);
  q.run("UPDATE users SET signup_as='' WHERE id=? AND signup_as='teacher'", u.id);
  if (c && c.claim) E.rememberAddress(u.id, inv.email, 'staff-invite');
  return ok({ school: s, role: inv.role });
}

// ---- the email
/** The invite email in t's language. { inviter, school, role ('teacher'|'admin'), url, days } -> { subject, html, text } */
export function inviteEmail(t, { inviter, school, role, url, days = INVITE_DAYS }) {
  const k = key => `school.emailInvite.mail.${key}`;
  const v = { name: inviter || t(k('someone')), school, role: t(`school.roles.${role}`), days };
  const lines = { hi: t(k('hi'), v), intro: t(k('intro'), v), what: t(k('what'), v), how: t(k('how'), v), ignore: t(k('ignore'), v), why: t(k('why'), v) };
  const subject = t(k('subject'), v), button = t(k('button'), v);
  const html = F.frame({ lang: t.locale || 'en', dir: t.dir || 'ltr', subject, preview: lines.intro, base: E.siteBase(),
    body: [F.p(esc(lines.hi)), F.p(esc(lines.intro)), F.p(esc(lines.what)), F.button(url, button), F.p(esc(lines.how), { muted: true, small: true }),
      F.p(esc(lines.ignore), { muted: true, small: true, last: true })].join('\n'),
    foot: esc(lines.why) });
  const text = [lines.hi, lines.intro, lines.what, `${button}: ${url}`, lines.how, lines.ignore, '--', lines.why].join('\n\n') + '\n';
  return { subject, html, text };
}
/** Emails the invite (the token is only in the email). t: a translator in the invite's language.
 *  -> email.send's { status: 'sent'|'off'|'skipped'|'failed', reason? } */
export function sendInvite(t, inv, token) {
  if (!E.sendingOn()) return Promise.resolve({ status: 'off' });
  const s = S.getSchool(inv.school_id);
  const m = inviteEmail(t, { inviter: inviterName(inv), school: s.name, role: inv.role, url: joinUrl(token) });
  return E.send({ userId: null, to: inv.email, template: 'staff_invite', category: 'transactional', subject: m.subject, html: m.html, text: m.text,
    idemKey: `staffinvite-${inv.id}-${inv.sent_at}` });
}

/** Answered, cancelled and long-expired invites are kept 60 days (so an old link says what happened to it), then go. */
export const retention = () => q.run("DELETE FROM staff_email_invites WHERE (status!='open' AND COALESCE(used_at, created_at)<?) OR (status='open' AND expires_at<?)", now() - 60 * DAY, now() - 60 * DAY).changes;
register('staff-email-invite-retention', DAY, () => retention(), { firstAfterMs: 23 * 60e3 });
