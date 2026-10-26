// Sign in with Google: who may use it, which Oomba account a Google account belongs to, and teachers' invites by
// school Google email. Matching is by Google's account id (sub) only; an email never links an account on its own: only
// a teacher's invite (bound to a school email in the school's own Google domains) binds a new Google account.
// See docs/decisions.md "Sign in with Google".
import { q, uid, now, tx, audit } from '../db.js';
import { createUser, getUser, accountKind } from '../auth.js';
import * as S from './schools.js';
import { allow } from './ratelimit.js';
import { register } from './jobs.js';

const DAY = 86400e3;
export const INVITE_DAYS = 30;
export const MAX_PASTE = 100;
export const MAX_OPEN_PER_CLASS = 300;
export const MAX_OPEN_PER_SCHOOL = 2000;
export const GJOIN = { perClassDay: 100, perIpHour: 300 };
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);

// ------------------------------------------------------------------ identities
export const identityBySub = sub => q.get('SELECT * FROM google_identities WHERE sub=?', String(sub || '')) || null;
export const identityOf = userId => (userId ? q.get('SELECT * FROM google_identities WHERE user_id=?', userId) : null) || null;
/** -> Map userId -> identity row, for a roster. */
export function identitiesOf(ids) {
  const m = new Map(); if (!ids.length) return m;
  for (const r of q.all(`SELECT * FROM google_identities WHERE user_id IN (${ids.map(() => '?').join(',')})`, ...ids)) m.set(r.user_id, r);
  return m;
}
export function touchIdentity(sub, { email, hd }) { q.run('UPDATE google_identities SET email=?, hd=?, last_used_at=? WHERE sub=?', email, hd, now(), sub); }
function insertIdentity(userId, claims, linkedBy) {
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, linked_by, created_at, last_used_at) VALUES (?,?,?,?,?,?,?)',
    claims.sub, userId, claims.email, claims.hd, linkedBy || null, now(), now());
}
/** Remove a user's Google sign-in. by: 'self' | 'teacher' | 'admin' | 'platform'. -> true if one was removed. */
export function unlink(actorId, userId, by) {
  const ident = identityOf(userId); if (!ident) return false;
  q.run('DELETE FROM google_identities WHERE user_id=?', userId);
  audit(actorId, 'user.google_unlink', userId, { by, hd: ident.hd });
  return true;
}

// ------------------------------------------------------------------ domains
export const emailDomain = email => String(email || '').toLowerCase().split('@').pop() || '';
export function schoolDomains(school) {
  const d = school ? S.settingsOf(school).googleDomains : [];
  return Array.isArray(d) ? [...new Set(d.map(x => String(x).toLowerCase()))].slice(0, S.MAX_DOMAINS) : [];
}
/** Both the account's Workspace (hd: managed by that school) and its email domain must be listed. */
export const inSchoolDomains = (domains, { email, hd }) =>
  domains.length > 0 && !!hd && domains.includes(hd) && domains.includes(emailDomain(email));
/** A domain another live school already lists (a Google domain belongs to one school), or null. */
export function domainTakenBy(schoolId, domains) {
  for (const s of q.all("SELECT * FROM schools WHERE id<>? AND archived_at IS NULL AND settings LIKE '%googleDomains%'", schoolId)) {
    const theirs = schoolDomains(s); const hit = domains.find(d => theirs.includes(d));
    if (hit) return hit;
  }
  return null;
}
/** How many accounts owned by this school sign in with Google but wouldn't match these domains any more. */
export function lostWithDomains(schoolId, domains) {
  return q.all('SELECT g.email, g.hd FROM google_identities g JOIN users u ON u.id=g.user_id WHERE u.managed_school=? AND u.banned=0', schoolId)
    .filter(r => !inSchoolDomains(domains, r)).length;
}

// ------------------------------------------------------------------ who may connect Google themselves (Me page)
/** -> { ok, domains } where domains null = any Google account, or { ok:false }. */
export function canConnect(u) {
  if (!u || u.is_guest || u.banned) return fail('schoolOnly');
  const kind = accountKind(u);
  if (kind === 'student') return fail('schoolOnly'); // school-account students: their teacher connects it
  if (kind === 'staff') {
    if (!u.managed_school) return ok({ domains: null });
    const d = schoolDomains(S.getSchool(u.managed_school));
    return d.length ? ok({ domains: d }) : fail('schoolOnly');
  }
  // An own account that is a student in a school with Google domains: a school Google account from any of them.
  const domains = [...new Set(S.schoolsOf(u.id).filter(s => s.role === 'student').flatMap(s => schoolDomains(s)))];
  return domains.length ? ok({ domains }) : fail('schoolOnly');
}
export function canConnectWith(u, claims) {
  const c = canConnect(u); if (!c.ok) return c;
  if (c.domains && !inSchoolDomains(c.domains, claims)) return fail('wrongDomain');
  return ok();
}

// ------------------------------------------------------------------ invites: parsing
const EMAIL_TOKEN = /[^\s<>,;"'()]+@[^\s<>,;"'()]+/g;
export function normEmail(e) {
  const v = String(e || '').trim().toLowerCase().replace(/^mailto:/, '').replace(/\.+$/, '');
  const at = v.lastIndexOf('@');
  if (at < 1 || v.length > 254 || at > 64 || !/^[\x21-\x7e]+$/.test(v)) return '';
  const domain = v.slice(at + 1);
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(domain) || v.indexOf('@') !== at) return '';
  return v;
}
const HEADER_WORDS = /^(name|names|email|e-mail|emails|student|students|first|last|full|address|[\s\t,;:|])*$/i;
/**
 * A pasted list: one address per line, with an optional name ("ana@x.org, Ana Silva", "Ana Silva <ana@x.org>", a
 * spreadsheet row "Ana Silva⇥ana@x.org"), or several bare addresses on one line.
 * -> { entries: [{ email, name }], bad: [line] } (duplicates merged, first name wins).
 */
export function parseInviteLines(text) {
  const entries = []; const seen = new Map(); const bad = [];
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const hasEmail = lines.some(l => l.includes('@'));
  for (const raw of lines) {
    const line = raw.replace(/mailto:/gi, '').trim();
    if (!line) continue;
    const tokens = line.match(EMAIL_TOKEN) || [];
    if (!tokens.length) { if (hasEmail && HEADER_WORDS.test(line)) continue; bad.push(clip(line, 60)); continue; }
    let rest = line; for (const tk of tokens) rest = rest.replace(tk, ' ');
    rest = rest.replace(/[,;\t<>"'()|]+/g, ' ').replace(/\s+/g, ' ').trim();
    const name = tokens.length === 1 ? clip(rest, 60) : '';
    if (tokens.length > 1 && rest) { bad.push(clip(line, 60)); continue; }
    for (const tk of tokens) {
      const email = normEmail(tk);
      if (!email) { bad.push(clip(tk, 60)); continue; }
      if (seen.has(email)) continue;
      seen.set(email, true); entries.push({ email, name });
    }
  }
  return { entries, bad };
}

// ------------------------------------------------------------------ invites: rows and states
export const getInvite = id => q.get('SELECT * FROM google_invites WHERE id=?', String(id || '')) || null;
export function inviteState(row, t = now()) {
  if (row.status === 'joined') return 'joined';
  if (row.status === 'revoked') return 'revoked';
  return row.expires_at <= t ? 'expired' : 'waiting';
}
const openCount = (col, v) => q.get(`SELECT COUNT(*) n FROM google_invites WHERE ${col}=? AND status='open'`, v).n;
function upsertInvite(by, { schoolId, classId = null, role, email, rosterName = '', grade = '', userId = null }) {
  const old = q.get("SELECT * FROM google_invites WHERE school_id=? AND IFNULL(class_id,'')=? AND email=? AND status='open'", schoolId, classId || '', email);
  if (old) {
    // A renew only extends the invite (and takes a new roster name): an open "connect this account" invite stays one,
    // unless this entry is itself a connect for a (new) account.
    q.run('UPDATE google_invites SET expires_at=?, roster_name=CASE WHEN ?<>\'\' THEN ? ELSE roster_name END, user_id=COALESCE(?, user_id), role=CASE WHEN ? IS NULL THEN role ELSE ? END WHERE id=?',
      now() + INVITE_DAYS * DAY, rosterName, rosterName, userId, userId, role, old.id);
    return 'renewed';
  }
  q.run(`INSERT INTO google_invites(id, school_id, class_id, role, email, roster_name, grade, user_id, status, created_by, created_at, expires_at)
    VALUES (?,?,?,?,?,?,?,?,'open',?,?,?)`, uid(12), schoolId, classId, role, email, clip(rosterName, 60), clip(grade, 12), userId, by.id, now(), now() + INVITE_DAYS * DAY);
  return 'invited';
}

/** Class invites from a pasted list. All or nothing: any bad line refuses the whole paste. */
export function createClassInvites(by, c, text) {
  const s = S.getSchool(c.school_id); const domains = schoolDomains(s);
  if (!domains.length) return fail('noDomains');
  const { entries, bad } = parseInviteLines(text);
  if (!entries.length && !bad.length) return fail('none');
  if (entries.length > MAX_PASTE) return fail('tooMany');
  const notSchool = entries.filter(e => !domains.includes(emailDomain(e.email))).map(e => e.email);
  if (bad.length || notSchool.length) return fail('badLines', { bad: bad.slice(0, 10), notSchool: notSchool.slice(0, 10) });
  // Students in this class, for "already here" and matching a name to an existing school account.
  const people = S.roster(c.id).filter(p => p.role === 'student');
  const ids = identitiesOf(people.map(p => p.id));
  const byEmail = new Map([...ids.values()].map(r => [r.email, r]));
  const plan = [];
  for (const e of entries) {
    if (byEmail.has(e.email)) { plan.push({ ...e, kind: 'already' }); continue; }
    const named = e.name ? people.filter(p => (p.roster_name || '').toLowerCase() === e.name.toLowerCase()) : [];
    if (named.length > 1) return fail('ambiguous', { name: e.name });
    if (named.length === 1) {
      if (named[0].managed_school !== s.id) return fail('ownAccount', { name: e.name });
      plan.push({ ...e, kind: 'attach', userId: named[0].id }); continue;
    }
    plan.push({ ...e, kind: 'new' });
  }
  const adding = plan.filter(p => p.kind !== 'already').length;
  if (openCount('class_id', c.id) + adding > MAX_OPEN_PER_CLASS || openCount('school_id', s.id) + adding > MAX_OPEN_PER_SCHOOL) return fail('tooManyOpen');
  const counts = { invited: 0, attach: 0, renewed: 0, already: 0 };
  tx(() => {
    for (const p of plan) {
      if (p.kind === 'already') { counts.already++; continue; }
      if (p.kind === 'attach') q.run("UPDATE google_invites SET status='revoked', revoked_by=?, revoked_at=? WHERE user_id=? AND status='open' AND email<>?", by.id, now(), p.userId, p.email);
      const r = upsertInvite(by, { schoolId: s.id, classId: c.id, role: 'student', email: p.email, rosterName: p.name, grade: c.grade || '', userId: p.kind === 'attach' ? p.userId : null });
      if (r === 'renewed') counts.renewed++; else if (p.kind === 'attach') counts.attach++; else counts.invited++;
    }
  });
  audit(by.id, 'school.google_invite', c.id, counts);
  return ok({ counts });
}

/** One staff invite (school admins): joins the school as teacher or admin when they sign in with that Google account. */
export function createStaffInvite(by, schoolId, { email, rosterName, role }) {
  const s = S.getSchool(schoolId); const domains = schoolDomains(s);
  if (!domains.length) return fail('noDomains');
  const e = normEmail(email); if (!e) return fail('notEmail');
  if (!domains.includes(emailDomain(e))) return fail('notSchool', { email: e });
  const rn = clip(rosterName, 60); if (!rn) return fail('rosterName');
  if (!['teacher', 'admin'].includes(role)) return fail('badRole');
  if (openCount('school_id', s.id) >= MAX_OPEN_PER_SCHOOL) return fail('tooManyOpen');
  // That address is already waiting to connect an existing account here: a staff invite would turn it into a new one.
  if (q.get("SELECT 1 FROM google_invites WHERE school_id=? AND class_id IS NULL AND email=? AND user_id IS NOT NULL AND status='open'", s.id, e)) return fail('attachWaiting');
  const r = upsertInvite(by, { schoolId: s.id, role, email: e, rosterName: rn });
  audit(by.id, 'school.google_staff_invite', s.id, { role, renewed: r === 'renewed' });
  return ok({ state: r, name: rn, role });
}

/** Connect Google to an existing school account of this school (a student, or school-made staff from the People tab). */
export function attachInvite(by, schoolId, classId, userId, email) {
  const s = S.getSchool(schoolId); const domains = schoolDomains(s);
  if (!domains.length) return fail('noDomains');
  const u = getUser(userId); const m = u && S.membership(s.id, u.id);
  if (!u || u.banned || u.managed_school !== s.id || !m) return fail('notSchoolAccount');
  const e = normEmail(email); if (!e) return fail('notEmail');
  if (!domains.includes(emailDomain(e))) return fail('notSchool', { email: e });
  tx(() => {
    q.run("UPDATE google_invites SET status='revoked', revoked_by=?, revoked_at=? WHERE user_id=? AND status='open'", by.id, now(), u.id);
    upsertInvite(by, { schoolId: s.id, classId, role: m.role, email: e, rosterName: m.roster_name, grade: m.grade, userId: u.id });
  });
  audit(by.id, 'school.google_attach_invite', s.id, { user: u.id });
  return ok();
}
export function renewInvite(by, inv) {
  if (inv.status !== 'open') return fail('notFound');
  q.run('UPDATE google_invites SET expires_at=? WHERE id=?', now() + INVITE_DAYS * DAY, inv.id);
  audit(by.id, 'school.google_invite_renew', inv.school_id, { invite: inv.id });
  return ok();
}
export function revokeInvite(by, inv) {
  if (inv.status !== 'open') return fail('notFound');
  q.run("UPDATE google_invites SET status='revoked', revoked_by=?, revoked_at=? WHERE id=?", by.id, now(), inv.id);
  audit(by.id, 'school.google_invite_revoke', inv.school_id, { invite: inv.id });
  return ok();
}
/** The invites a teacher sees for a class (not revoked), newest first, with the joined/connect-to username. */
export const invitesOfClass = classId => q.all(`SELECT i.*, uu.username used_username, tu.username target_username FROM google_invites i
  LEFT JOIN users uu ON uu.id=i.used_by LEFT JOIN users tu ON tu.id=i.user_id
  WHERE i.class_id=? AND i.status<>'revoked' ORDER BY i.created_at DESC LIMIT 500`, classId);
export const staffInvitesOf = schoolId => q.all(`SELECT i.*, uu.username used_username FROM google_invites i LEFT JOIN users uu ON uu.id=i.used_by
  WHERE i.school_id=? AND i.class_id IS NULL AND i.user_id IS NULL AND i.status<>'revoked' ORDER BY i.created_at DESC LIMIT 200`, schoolId);
/** Open attach invites for these users -> Map userId -> email (the roster's "Google: waiting" line). */
export function pendingAttach(ids) {
  const m = new Map(); if (!ids.length) return m;
  for (const r of q.all(`SELECT user_id, email FROM google_invites WHERE status='open' AND expires_at>? AND user_id IN (${ids.map(() => '?').join(',')})`, now(), ...ids)) m.set(r.user_id, r.email);
  return m;
}

// ------------------------------------------------------------------ applying invites
/** Open, unexpired invites for this verified email whose school (and class) is live and lists the account's domain. */
function validInvites(claims) {
  return q.all("SELECT * FROM google_invites WHERE email=? AND status='open' AND expires_at>? ORDER BY created_at", claims.email, now()).filter(inv => {
    const s = S.getSchool(inv.school_id);
    if (!s || s.archived_at || !inSchoolDomains(schoolDomains(s), claims)) return false;
    if (inv.class_id) { const c = S.getClass(inv.class_id); if (!c || c.archived_at || c.school_id !== s.id) return false; }
    if (inv.user_id) { const t = getUser(inv.user_id); if (!t || t.banned || t.managed_school !== s.id || !S.membership(s.id, t.id)) return false; }
    return true;
  });
}
const actorOf = inv => ({ id: inv.created_by || null });
function markJoined(inv, user) {
  q.run("UPDATE google_invites SET status='joined', used_by=?, used_at=? WHERE id=?", user.id, now(), inv.id);
  audit(inv.created_by, 'school.google_invite_joined', inv.school_id, { invite: inv.id, user: user.id });
}
const RANK = { student: 0, teacher: 1, admin: 2 };
/** Everything this person's school email was invited to. -> the class ids joined. Runs inside the sign-in. */
export function applyInvites(user, claims, list = validInvites(claims)) {
  const joined = [];
  for (const inv of list) {
    user = getUser(user.id);
    if (user.managed_school && user.managed_school !== inv.school_id) continue;
    const m = S.membership(inv.school_id, user.id);
    if (inv.user_id) { if (inv.user_id === user.id) markJoined(inv, user); continue; }
    if (!inv.class_id) { // staff
      if (m && m.role === 'student') continue;
      const role = m && RANK[m.role] > RANK[inv.role] ? m.role : inv.role;
      if (!S.addMember(actorOf(inv), inv.school_id, user.id, role, { rosterName: m ? '' : inv.roster_name }).ok) continue;
      markJoined(inv, user); continue;
    }
    if (m && m.role !== 'student') continue;
    if (!m) {
      if (S.isPlatformAdmin(user)) continue;
      if (!user.managed_school && !S.settingsOf(S.getSchool(inv.school_id)).allowOwnAccounts) continue;
      if (!S.addMember(actorOf(inv), inv.school_id, user.id, 'student', { rosterName: inv.roster_name, grade: inv.grade }).ok) continue;
    }
    if (!S.addToClass(actorOf(inv), inv.class_id, user.id, 'student').ok) continue;
    q.run("UPDATE join_requests SET status='approved', decided_by=?, decided_at=? WHERE user_id=? AND class_id=? AND status='pending'", inv.created_by, now(), user.id, inv.class_id);
    markJoined(inv, user); joined.push(inv.class_id);
  }
  return joined;
}

// ------------------------------------------------------------------ new school accounts
/** A school account made through Google: generated username, no password (the login card is the fallback). */
export function newSchoolAccount(actor, schoolId, { role, rosterName, grade = '', claims, via }) {
  const username = S.newUsername();
  const u = createUser({ username, displayName: username });
  q.run('UPDATE users SET managed_school=? WHERE id=?', schoolId, u.id);
  const rn = clip(rosterName, 60) || clip(claims.name, 60) || clip(claims.email.split('@')[0], 60);
  S.addMember(actor, schoolId, u.id, role, { rosterName: rn, grade });
  insertIdentity(u.id, claims, actor.id);
  audit(actor.id, 'school.google_account_create', schoolId, { user: u.id, role, via });
  return getUser(u.id);
}

// ------------------------------------------------------------------ class code + school Google account
export function setGoogleJoin(by, c, on) {
  q.run('UPDATE classrooms SET google_join=? WHERE id=?', on ? 1 : 0, c.id);
  audit(by.id, 'class.google_join_toggle', c.id, { on: !!on });
  return ok();
}
const liveClassByCode = code => {
  const c = S.getClassByCode(code); if (!c || c.archived_at) return null;
  const s = S.getSchool(c.school_id); return s && !s.archived_at ? { c, s } : null;
};
const googleJoinOpen = (found, claims) => !!found && found.c.google_join === 1 && inSchoolDomains(schoolDomains(found.s), claims);
/** A signed-in person joining with a class code after Google. -> { landing } or { jerr } */
export function joinWithCode(user, code, claims) {
  const found = liveClassByCode(code);
  if (!found) return { jerr: 'badCode' };
  const { c, s } = found;
  if (S.classMember(c.id, user.id)) return { landing: `/class/${c.id}` };
  const m = S.membership(s.id, user.id);
  // Joining at once is for the school's own people (its accounts, or students already in it); anyone else goes through
  // the usual class-code rules (own accounts wait for the teacher, or are refused when the school turned them off).
  const ofSchool = user.managed_school === s.id || (m && m.role === 'student');
  if (googleJoinOpen(found, claims) && ofSchool && !(m && m.role !== 'student')) {
    if (!m) S.addMember({ id: firstTeacher(c.id) }, s.id, user.id, 'student', { rosterName: claims.name, grade: c.grade || '' });
    S.addToClass(user, c.id, user.id, 'student');
    audit(user.id, 'class.google_join', c.id, { user: user.id });
    return { landing: `/class/${c.id}` };
  }
  const r = S.requestJoin(user, code);
  if (!r.ok) return { jerr: r.code };
  return { landing: r.state === 'pending' ? '/classes' : `/class/${c.id}` };
}
const firstTeacher = classId => (q.get("SELECT user_id FROM class_members WHERE class_id=? AND role='teacher' AND status='active' ORDER BY joined_at LIMIT 1", classId) || {}).user_id || null;

// ------------------------------------------------------------------ deciding a sign-in
/**
 * claims: the checked ID token ({ sub, email, hd, name }); flow: { i: intent, c: code, u: user id for link };
 * currentUser: who is signed in now (link only). -> { ok:true, user, via, landing? } or { ok:false, code }.
 * Codes are message keys under google.errors (plus 'paused', 'tooManyJoins').
 */
export function resolveSignIn({ claims, flow = {}, currentUser = null, ip = '' }) {
  try { return tx(() => decide({ claims, flow, currentUser, ip })); }
  catch (e) {
    // Two callbacks at once for the same new Google account (a double click): the second finds it known now.
    if (/UNIQUE constraint failed: google_identities/.test(e.message)) return tx(() => decide({ claims, flow, currentUser, ip }));
    throw e;
  }
}
function decide({ claims, flow, currentUser, ip }) {
  const intent = flow.i || 'signin';
  const ident = identityBySub(claims.sub);

  if (intent === 'link') {
    const u = currentUser;
    if (!u || u.id !== flow.u) return fail('expired');
    if (ident && ident.user_id === u.id) { touchIdentity(claims.sub, claims); return ok({ user: u, via: 'link', landing: '/me?google=connected#google' }); }
    if (ident) return fail('inUse');
    if (identityOf(u.id)) return fail('alreadyLinked');
    const can = canConnectWith(u, claims); if (!can.ok) return can;
    insertIdentity(u.id, claims, u.id);
    applyInvites(u, claims);
    audit(u.id, 'user.google_link', u.id, { hd: claims.hd });
    return ok({ user: getUser(u.id), via: 'link', landing: '/me?google=connected#google' });
  }

  let user = null, via = '', landing = null;
  if (ident) {
    user = getUser(ident.user_id);
    if (!user || user.banned) return fail('paused');
    if (user.managed_school) {
      const domains = schoolDomains(S.getSchool(user.managed_school));
      if (!domains.length) return fail('schoolOff');
      if (!inSchoolDomains(domains, claims)) return fail('wrongDomain');
    }
    touchIdentity(claims.sub, claims);
    const joined = applyInvites(user, claims);
    if (joined.length) landing = `/class/${joined[0]}`;
    via = 'sub';
  } else {
    // Invites from more than one school for the same address (schools that list the same domain): the oldest invite's
    // school decides, and only that school's invites apply. A later invite from another school can't jump ahead.
    const all = validInvites(claims);
    const list = all.length ? all.filter(i => i.school_id === all[0].school_id) : all;
    const attach = list.find(i => i.user_id);
    const staff = list.find(i => !i.user_id && !i.class_id);
    const student = list.find(i => !i.user_id && i.class_id);
    if (attach) {
      user = getUser(attach.user_id);
      const old = identityOf(user.id);
      if (old) q.run('DELETE FROM google_identities WHERE user_id=?', user.id);
      insertIdentity(user.id, claims, attach.created_by);
      audit(attach.created_by, 'user.google_link', user.id, { replaced: !!old, via: 'attach' });
      via = 'attach';
    } else if (staff) {
      user = newSchoolAccount(actorOf(staff), staff.school_id, { role: staff.role, rosterName: staff.roster_name, claims, via: 'invite' });
      via = 'invite';
    } else if (student) {
      user = newSchoolAccount(actorOf(student), student.school_id, { role: 'student', rosterName: student.roster_name, grade: student.grade, claims, via: 'invite' });
      via = 'invite';
    } else if (intent === 'join') {
      const found = liveClassByCode(flow.c);
      if (!googleJoinOpen(found, claims)) return fail('joinNoWay');
      if (!allow(`gjoin-class:${found.c.id}`, GJOIN.perClassDay, DAY) || !allow(`gjoin-ip:${ip}`, GJOIN.perIpHour, 3600e3)) return fail('tooManyJoins');
      user = newSchoolAccount({ id: firstTeacher(found.c.id) }, found.s.id, { role: 'student', grade: found.c.grade || '', claims, via: 'class_code' });
      S.addToClass({ id: user.id }, found.c.id, user.id, 'student');
      audit(user.id, 'class.google_join', found.c.id, { user: user.id, created: true });
      return ok({ user, via: 'class_code', created: true, landing: `/class/${found.c.id}` });
    } else return fail('unknown');
    const joined = applyInvites(user, claims, list.filter(i => !i.user_id || i.user_id === user.id));
    if (joined.length) landing = `/class/${joined[0]}`;
  }
  if (intent === 'join' && flow.c) {
    const r = joinWithCode(getUser(user.id), flow.c, claims);
    landing = r.landing || `/join?code=${encodeURIComponent(S.normCode(flow.c))}&jerr=${r.jerr}`;
  }
  return ok({ user: getUser(user.id), via, landing });
}

export function auditSignIn(user, via, hd) { audit(user.id, 'user.google_signin', user.id, { via, hd }); }

// ------------------------------------------------------------------ retention
/** Joined and removed invites go 90 days after use; open ones 90 days after they expired. */
export function sweepInvites(t = now()) {
  const cut = t - 90 * DAY;
  return q.run("DELETE FROM google_invites WHERE (status='joined' AND used_at<?) OR (status='revoked' AND revoked_at<?) OR (status='open' AND expires_at<?)", cut, cut, cut).changes;
}
register('google-invites-sweep', 6 * 3600e3, () => sweepInvites());
