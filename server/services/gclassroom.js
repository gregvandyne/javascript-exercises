// Google Classroom sync (docs/google-classroom.md; docs/decisions.md "Google Classroom sync"). A teacher connects their
// Google Classroom (incremental authorization on top of Sign in with Google), links an Oomba class to one of their
// courses, imports its roster, posts a lesson as coursework (a link back to the lesson, with its due date) and sends each
// student's lesson score as a draft or assigned grade. Calls to Google go through services/gclassroom-client.js only.
//
// Scopes: the two read scopes are required (link a class, import its roster); every write scope is optional and each
// feature works only once its scope was granted (can()): posting and grades (coursework.students), sharing a lesson as
// a material (courseworkmaterials), posts filed under a topic (topics), announcements in the class stream
// (announcements). The stored scopes are the truth, re-read from Google at every token refresh.
//
// Automatic sync (jobs): grades for posted lessons whose progress changed, every 30 minutes, when the teacher turned it
// on for the class (only grades that changed are sent; it stops 30 days after the due date); the roster every 6 hours
// unless turned off (students who left Classroom are listed for the teacher, never removed automatically).
//
// What goes to Google: the lesson's title, a fixed one-line description, the link to the lesson, its due date, and a
// score out of 100 for each student who is on the teacher's own Classroom roster; the topic's name; an announcement's
// fixed template text (a join code and link, or a lesson's title and link) and the teacher's own words. Nothing else:
// no names, no answers, no feedback, no games. What comes back: the teacher's course names, and each student's Google
// account id and full name (the name is only the staff-only roster name, never the public one).
//
// Tokens: the refresh token is stored encrypted (AES-256-GCM, key GOOGLE_TOKEN_KEY, bound to the teacher's user id); no
// key, no storing. Access tokens live in memory for under an hour. Disconnect revokes the token at Google and deletes it.
import crypto from 'node:crypto';
import { q, uid, now, tx, audit } from '../db.js';
import { config } from '../config.js';
import { getUser } from '../auth.js';
import { googleEnabled } from '../oidc.js';
import * as S from './schools.js';
import * as L from './lessons.js';
import * as P from './progress.js';
import * as G from './google.js';
import * as C from './gclassroom-client.js';
import { register } from './jobs.js';
import { allow } from './ratelimit.js';
import { log } from './log.js';

const DAY = 86400e3;
export const MAX_STUDENTS = 300;
export const SYNC_KEEP_DAYS = 180;
const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const ID_RE = /^[\x21-\x7e]{1,255}$/;
const safeId = v => (typeof v === 'string' && ID_RE.test(v) && !/[/?#%\\]/.test(v) ? v : '');

/** On only with Sign in with Google and GOOGLE_CLASSROOM=1 (read per call, so tests can switch it). */
export const enabled = () => googleEnabled() && !!config.googleClassroom;
/** Tokens can be stored only with GOOGLE_TOKEN_KEY set. */
export const canStore = () => Buffer.isBuffer(config.googleTokenKey) && config.googleTokenKey.length === 32;
export const keyTag = () => (canStore() ? crypto.createHash('sha256').update(config.googleTokenKey).digest('hex').slice(0, 12) : '');

// ------------------------------------------------------------------ the refresh token at rest
/** AES-256-GCM with a random 12-byte nonce; the teacher's user id is the associated data, so a row copied onto another
 *  account doesn't decrypt. -> 'v1.<base64url nonce|tag|ciphertext>' */
export function seal(userId, token) {
  if (!canStore()) throw new Error('GOOGLE_TOKEN_KEY is not set');
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', config.googleTokenKey, iv);
  c.setAAD(Buffer.from(`gc:${userId}`));
  const ct = Buffer.concat([c.update(String(token), 'utf8'), c.final()]);
  return `v1.${Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url')}`;
}
/** -> the token, or null if it can't be read (another key, another account, tampered). */
export function unseal(userId, sealed) {
  if (!canStore() || typeof sealed !== 'string' || !sealed.startsWith('v1.')) return null;
  try {
    const b = Buffer.from(sealed.slice(3), 'base64url'); if (b.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', config.googleTokenKey, b.subarray(0, 12));
    d.setAAD(Buffer.from(`gc:${userId}`)); d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
  } catch { return null; }
}

// ------------------------------------------------------------------ connections
export const connectionOf = userId => (userId ? q.get('SELECT user_id, sub, email, scopes, key_tag, status, last_error, created_at, updated_at FROM gc_connections WHERE user_id=?', userId) : null) || null;
/** 'none' | 'ok' | 'reconnect' (the token stopped working, or was sealed with another key). */
export function connectionState(userId) {
  const c = connectionOf(userId); if (!c) return 'none';
  if (c.status !== 'ok' || c.key_tag !== keyTag()) return 'reconnect';
  return 'ok';
}
/** Only school staff connect Classroom (never students, guests, family accounts). */
export const mayConnect = u => !!u && !u.is_guest && !u.banned && S.isSchoolStaff(u);
/** Missing any of the scopes nothing works without (the two read scopes)? Google lets people untick boxes on the
 *  consent screen; an optional scope left unticked only hides its feature. */
export const missingScopes = granted => C.REQUIRED_SCOPES.filter(s => !granted.includes(s));
/** What Google said was granted, kept to the Classroom scopes we know (Google also lists openid, email, profile). */
const classroomScopes = granted => C.SCOPES.filter(s => granted.includes(s));
/** The Classroom scopes this teacher granted (from the stored row: the truth, refreshed with every access token). */
export const grantedScopes = userId => { const c = connectionOf(userId); return c ? String(c.scopes || '').split(/\s+/).filter(Boolean) : []; };
/** May this teacher's connection do this? feature: 'coursework' (post as assignment, grades), 'announce', 'materials',
 *  'topics' (C.OPTIONAL_SCOPES). */
export const can = (userId, feature) => !!C.OPTIONAL_SCOPES[feature] && grantedScopes(userId).includes(C.OPTIONAL_SCOPES[feature]);
/** Optional scopes not granted yet (the page offers "Allow Oomba Academy to post to Classroom" while any is missing). */
export const missingOptional = userId => Object.keys(C.OPTIONAL_SCOPES).filter(k => !can(userId, k));

export function saveConnection(u, { sub, email, scopes, refreshToken }) {
  if (!canStore()) return fail('notSetUp');
  if (!refreshToken) return fail('noRefresh');
  const sealed = seal(u.id, refreshToken);
  q.run(`INSERT INTO gc_connections(user_id, sub, email, scopes, token_enc, key_tag, status, last_error, created_at, updated_at) VALUES (?,?,?,?,?,?,'ok',NULL,?,?)
    ON CONFLICT(user_id) DO UPDATE SET sub=excluded.sub, email=excluded.email, scopes=excluded.scopes, token_enc=excluded.token_enc, key_tag=excluded.key_tag, status='ok', last_error=NULL, updated_at=excluded.updated_at`,
  u.id, clip(sub, 255), clip(email, 254), classroomScopes(scopes).join(' '), sealed, keyTag(), now(), now());
  tokens.delete(u.id); coursesCache.delete(u.id);
  // Connected again: automatic grades paused by an error try again at the next run.
  q.run('UPDATE gc_links SET auto_fails=0, auto_next_at=NULL WHERE auto_by=?', u.id);
  syncLog(u.id, null, 'connect', 'ok', { scopes: classroomScopes(scopes).length });
  return ok();
}
/** Google's answer to a refresh lists the scopes the token has now (a teacher can take one back at Google): keep the
 *  stored row in step. Without a required scope the connection needs connecting again. */
function updateScopes(userId, granted) {
  if (!granted.length) return;
  const next = classroomScopes(granted).join(' ');
  const row = connectionOf(userId); if (!row || row.scopes === next) return;
  q.run('UPDATE gc_connections SET scopes=?, updated_at=? WHERE user_id=?', next, now(), userId);
  if (missingScopes(granted).length) markBroken(userId, 'scopes');
}
/** A call answered "this token lacks the scope": forget that scope until the teacher allows it again. */
function dropScope(userId, feature) {
  const s = C.OPTIONAL_SCOPES[feature]; if (!s) return;
  q.run('UPDATE gc_connections SET scopes=?, updated_at=? WHERE user_id=?', grantedScopes(userId).filter(x => x !== s).join(' '), now(), userId);
}
/** Revoke at Google, then delete (even when Google can't be reached: the row goes, and the error is logged). */
export async function disconnect(u) {
  const row = q.get('SELECT * FROM gc_connections WHERE user_id=?', u.id);
  if (!row) return fail('notConnected');
  const token = unseal(u.id, row.token_enc);
  let revoked = false;
  if (token) { try { revoked = await C.revoke(token); } catch (e) { log('warn', 'google classroom revoke failed', { reason: e.reason || 'error' }); } }
  q.run('DELETE FROM gc_connections WHERE user_id=?', u.id);
  tokens.delete(u.id); coursesCache.delete(u.id);
  // Automatic grades sent with this connection stop (the class page shows them off; turning them on again needs one).
  q.run("UPDATE gc_links SET auto_grades='', auto_by=NULL WHERE auto_by=?", u.id);
  syncLog(u.id, null, 'disconnect', 'ok', { revoked });
  return ok({ revoked });
}
const markBroken = (userId, code) => { q.run("UPDATE gc_connections SET status='reconnect', last_error=?, updated_at=? WHERE user_id=?", code, now(), userId); tokens.delete(userId); };

// Access tokens in memory only: userId -> { token, exp }.
const tokens = new Map();
/** Tests: forget cached access tokens and course lists. */
export function _forget() { tokens.clear(); coursesCache.clear(); }
async function accessToken(userId, fresh = false) {
  const hit = tokens.get(userId);
  if (!fresh && hit && hit.exp > Date.now() + 60e3) return hit.token;
  const row = q.get('SELECT * FROM gc_connections WHERE user_id=?', userId);
  if (!row) throw new C.GcError('notConnected');
  if (row.status !== 'ok' || row.key_tag !== keyTag()) throw new C.GcError('reconnect');
  const rt = unseal(userId, row.token_enc);
  if (!rt) { markBroken(userId, 'key'); throw new C.GcError('reconnect'); }
  try {
    const r = await C.refresh(rt);
    updateScopes(userId, r.scopes);
    if (missingScopes(r.scopes).length && r.scopes.length) throw new C.GcError('reconnect', 'scopes');
    tokens.set(userId, { token: r.accessToken, exp: Date.now() + Math.min(r.expiresIn, 3600) * 1000 });
    if (tokens.size > 5000) tokens.delete(tokens.keys().next().value);
    return r.accessToken;
  } catch (e) { if (e.code === 'reconnect' && e.reason !== 'scopes') markBroken(userId, 'revoked'); throw e; }
}
/** Run fn(accessToken); a 401 refreshes the token once and tries again. */
async function withToken(userId, fn) {
  let tk = await accessToken(userId);
  try { return await fn(tk); }
  catch (e) {
    if (e.code !== 'auth') throw e;
    tk = await accessToken(userId, true);
    try { return await fn(tk); } catch (e2) { if (e2.code === 'auth') { markBroken(userId, 'auth'); throw new C.GcError('reconnect'); } throw e2; }
  }
}
/** A GcError (or anything) as a result code the page can explain. */
const asFail = (e, extra = {}) => {
  const code = e instanceof C.GcError ? e.code : 'googleDown';
  if (!(e instanceof C.GcError)) log('error', 'google classroom error', { error: String(e.message).slice(0, 120) });
  return fail(code === 'auth' ? 'reconnect' : code, extra);
};

// ------------------------------------------------------------------ the sync log
export function syncLog(userId, classId, kind, status, counts = null, error = null) {
  q.run('INSERT INTO gc_syncs(id, class_id, user_id, kind, status, counts, error, created_at) VALUES (?,?,?,?,?,?,?,?)', uid(), classId, userId, kind, status, counts ? JSON.stringify(counts) : null, error, now());
  audit(userId, `gclassroom.${kind}`, classId || userId, { status, ...(counts || {}), ...(error ? { error } : {}) });
}
export const recentSyncs = (classId, n = 10) => q.all('SELECT s.*, u.username FROM gc_syncs s LEFT JOIN users u ON u.id=s.user_id WHERE s.class_id=? ORDER BY s.created_at DESC LIMIT ?', classId, n)
  .map(r => ({ ...r, counts: r.counts ? JSON.parse(r.counts) : {} }));
export const PENDING_DAYS = 30;
/** The sync log after 180 days; roster students still waiting to sign in after 30; and rows whose class, class lesson or
 *  link has gone (a class or lesson deleted some other way than services/schools.js / lessons.js, which delete their own). */
export function sweepSyncs(t = now()) {
  const n = q.run('DELETE FROM gc_syncs WHERE created_at<?', t - SYNC_KEEP_DAYS * DAY).changes;
  q.run('DELETE FROM gc_pending WHERE created_at<?', t - PENDING_DAYS * DAY);
  q.run('DELETE FROM gc_links WHERE class_id NOT IN (SELECT id FROM classrooms)');
  q.run('DELETE FROM gc_posts WHERE class_lesson_id NOT IN (SELECT id FROM class_lessons)');
  q.run("DELETE FROM gc_grades WHERE class_lesson_id NOT IN (SELECT class_lesson_id FROM gc_posts WHERE kind='assignment')");
  q.run('DELETE FROM gc_pending WHERE class_id NOT IN (SELECT class_id FROM gc_links)');
  q.run('DELETE FROM gc_roster WHERE class_id NOT IN (SELECT class_id FROM gc_links)');
  q.run('DELETE FROM gc_syncs WHERE class_id IS NOT NULL AND class_id NOT IN (SELECT id FROM classrooms)');
  return n;
}
register('gclassroom-sync-sweep', 12 * 3600e3, () => sweepSyncs());

// ------------------------------------------------------------------ courses and links
const coursesCache = new Map();
/** The teacher's active Classroom courses where they teach: [{ id, name, section }], cached five minutes. */
export async function courses(u, { fresh = false } = {}) {
  const hit = coursesCache.get(u.id);
  if (!fresh && hit && hit.exp > Date.now()) return ok({ courses: hit.list });
  try {
    const list = (await withToken(u.id, tk => C.listAll(tk, '/v1/courses', 'courses', { teacherId: 'me', courseStates: 'ACTIVE' }, { pageSize: 50, maxPages: 10 })))
      .map(c => ({ id: safeId(c.id), name: clip(c.name, 100), section: clip(c.section, 60) })).filter(c => c.id);
    coursesCache.set(u.id, { list, exp: Date.now() + 300e3 });
    if (coursesCache.size > 2000) coursesCache.delete(coursesCache.keys().next().value);
    return ok({ courses: list });
  } catch (e) { return asFail(e); }
}
/** Students from the Classroom roster still waiting to sign in for the first time. */
export const pendingCount = classId => q.get('SELECT COUNT(*) n FROM gc_pending WHERE class_id=?', classId).n;
/** A course list in the cache (no call to Google needed)? */
export const hasCourses = u => { const hit = coursesCache.get(u.id); return !!hit && hit.exp > Date.now(); };
export const linkOf = classId => q.get('SELECT * FROM gc_links WHERE class_id=?', classId) || null;
export async function link(u, c, courseId) {
  const id = safeId(String(courseId || ''));
  if (!id) return fail('pickCourse');
  const r = await courses(u, { fresh: true }); if (!r.ok) return r;
  const course = r.courses.find(x => x.id === id);
  if (!course) return fail('courseNotYours');
  let dropped = 0;
  tx(() => {
    // Posts, the grades they sent, waiting students and the imported roster belong to the Classroom class they came from:
    // linking another one drops them (so a lesson can be posted to the new class, and grades never go to the old one).
    // Relinking the same class keeps them. The class's settings (automatic sync, the topic's name) stay.
    q.run('DELETE FROM gc_grades WHERE class_lesson_id IN (SELECT class_lesson_id FROM gc_posts WHERE class_id=? AND course_id<>?)', c.id, course.id);
    dropped = q.run('DELETE FROM gc_posts WHERE class_id=? AND course_id<>?', c.id, course.id).changes;
    q.run('DELETE FROM gc_pending WHERE class_id=? AND course_id<>?', c.id, course.id);
    q.run('DELETE FROM gc_roster WHERE class_id=? AND course_id<>?', c.id, course.id);
    q.run(`INSERT INTO gc_links(class_id, course_id, course_name, linked_by, linked_at) VALUES (?,?,?,?,?)
    ON CONFLICT(class_id) DO UPDATE SET course_id=excluded.course_id, course_name=excluded.course_name, linked_by=excluded.linked_by, linked_at=excluded.linked_at, roster_at=NULL, roster_counts=NULL,
      roster_next_at=NULL, auto_fails=0, auto_next_at=NULL`,
  c.id, course.id, course.name, u.id, now());
  });
  syncLog(u.id, c.id, 'link', 'ok', dropped ? { droppedPosts: dropped } : null);
  return ok({ course });
}
export function unlink(u, c) {
  if (!linkOf(c.id)) return fail('notLinked');
  // Posts stay (relinking the same Classroom class finds them again; linking another drops them). Students still waiting
  // to sign in and the imported roster came from this link, so they go.
  tx(() => { q.run('DELETE FROM gc_links WHERE class_id=?', c.id); q.run('DELETE FROM gc_pending WHERE class_id=?', c.id); q.run('DELETE FROM gc_roster WHERE class_id=?', c.id); });
  syncLog(u.id, c.id, 'unlink', 'ok');
  return ok();
}

// ------------------------------------------------------------------ the class's settings
/**
 * Automatic sync for a linked class. grades: '' (off, the default), 'draft' or 'assigned': sent with this teacher's
 * connection (they need the coursework scope; a co-teacher saving the roster switch keeps whoever turned grades on).
 * roster: re-import the roster every 6 hours (on by default).
 */
export function setAuto(u, c, { grades = '', roster = true } = {}) {
  const lk = linkOf(c.id); if (!lk) return fail('notLinked');
  const g = grades === 'off' ? '' : String(grades || '');
  if (g && !GRADE_MODES.includes(g)) return fail('badMode');
  const by = !g ? null : g === lk.auto_grades && lk.auto_by ? lk.auto_by : u.id;
  // Turning them on (or taking them over) needs this teacher's coursework scope; saving them unchanged doesn't.
  if (by === u.id && (g !== lk.auto_grades || lk.auto_by !== u.id) && !can(u.id, 'coursework')) return fail('needsScope');
  q.run('UPDATE gc_links SET auto_grades=?, auto_by=?, auto_fails=0, auto_next_at=NULL, auto_roster=? WHERE class_id=?', g, by, roster ? 1 : 0, c.id);
  // A new mode: look at every posted lesson again (a draft grade may now go as assigned).
  if (g !== lk.auto_grades) q.run('UPDATE gc_posts SET auto_at=NULL WHERE class_id=?', c.id);
  syncLog(u.id, c.id, 'settings', 'ok', { autoGrades: g || 'off', autoRoster: roster ? 1 : 0 });
  return ok({ grades: g, roster: !!roster });
}
export const TOPIC_MAX = 100;
/** The topic's name: the teacher's own for this class, else the default (in the teacher's language). */
export const topicNameOf = (lk, fallback) => (clip(lk && lk.topic_name, TOPIC_MAX) || clip(fallback, TOPIC_MAX)).replace(/[\u200e\u200f]/g, '');
/** Rename the class's topic (blank = the default). A topic already in Classroom is renamed there too when the teacher
 *  has the topics scope (best effort: one Google can't find is made again at the next post). -> { ok, renamed } */
export async function setTopicName(u, c, name, fallback) {
  const lk = linkOf(c.id); if (!lk) return fail('notLinked');
  const n = clip(name, TOPIC_MAX);
  q.run('UPDATE gc_links SET topic_name=? WHERE class_id=?', n, c.id);
  let renamed = false;
  if (lk.topic_id && lk.topic_course_id === lk.course_id && can(u.id, 'topics')) {
    try {
      await withToken(u.id, tk => C.api(tk, 'PATCH', `/v1/courses/${encodeURIComponent(lk.course_id)}/topics/${encodeURIComponent(lk.topic_id)}`, { query: { updateMask: 'name' }, body: { name: n || clip(fallback, TOPIC_MAX) } }));
      renamed = true;
    } catch (e) {
      if (e.code === 'notFound') q.run('UPDATE gc_links SET topic_id=NULL, topic_course_id=NULL WHERE class_id=?', c.id);
      else if (e.code === 'needsScope') dropScope(u.id, 'topics');
      else if (e.code === 'reconnect' || e.code === 'auth') { const f = asFail(e); syncLog(u.id, c.id, 'topic', 'error', null, f.code); return f; }
    }
  }
  syncLog(u.id, c.id, 'topic', 'ok', { renamed });
  return ok({ renamed });
}
const fatal = e => ['auth', 'reconnect', 'rateLimited'].includes(e && e.code);
/** The id of the class's Classroom topic, made once per linked course and remembered (made again when Google says it is
 *  gone). '' when the teacher hasn't granted the topics scope, or Google wouldn't make one: the post goes without. */
async function topicFor(u, lk, tk, fallback) {
  if (!can(u.id, 'topics')) return '';
  const base = `/v1/courses/${encodeURIComponent(lk.course_id)}/topics`;
  const keep = id => { q.run('UPDATE gc_links SET topic_id=?, topic_course_id=? WHERE class_id=?', id, lk.course_id, lk.class_id); return id; };
  try {
    if (lk.topic_id && lk.topic_course_id === lk.course_id) {
      try { await C.api(tk, 'GET', `${base}/${encodeURIComponent(lk.topic_id)}`); return lk.topic_id; } catch (e) { if (e.code !== 'notFound') throw e; }
    }
    const name = topicNameOf(lk, fallback);
    try {
      const made = await C.api(tk, 'POST', base, { body: { name } });
      const id = safeId(String(made && made.topicId || ''));
      return id ? keep(id) : '';
    } catch (e) {
      // A topic of that name is already there (made by hand, or by an earlier link): use it.
      if (e.code !== 'badRequest') throw e;
      const same = (await C.listAll(tk, base, 'topic', {}, { pageSize: 100, maxPages: 3 })).find(x => x && clip(x.name, TOPIC_MAX) === name);
      const id = same ? safeId(String(same.topicId || '')) : '';
      return id ? keep(id) : '';
    }
  } catch (e) {
    if (e.code === 'needsScope') { dropScope(u.id, 'topics'); return ''; }
    if (fatal(e)) throw e;
    log('warn', 'google classroom topic failed', { reason: e.reason || 'error' });
    return '';
  }
}

// ------------------------------------------------------------------ roster import
/**
 * Students of the linked course into this class, matched the way Sign in with Google matches: by the Google account id
 * (Classroom's userId is the same id Sign in with Google calls sub). A known account that belongs to this school joins
 * the class; one that doesn't (an own account outside the school, another school's account, staff) is left out and
 * counted. Someone new waits (gc_pending, 30 days): no account is made yet, because no email is read here and so their
 * domain is unknown. The first time they sign in with Google on one of the school's domains, services/google.js makes
 * their school account (generated username; the Google name only as the staff-only roster name) and puts them in the
 * class. A personal or out-of-domain Google account is never given a school account and its Google id stays free.
 * Students matched here are remembered (gc_roster); one who is no longer on the Classroom roster is marked gone and
 * listed for the teacher ("No longer in Google Classroom"), never taken out of the class automatically.
 * auto: the 6-hourly refresh (logged as 'autoRoster').
 * -> { ok, counts: { added, waiting, already, ownAccount, otherSchool, staff, needDomains, left } }
 */
export async function importRoster(u, c, { auto = false } = {}) {
  const kind = auto ? 'autoRoster' : 'roster';
  const lk = linkOf(c.id); if (!lk) return fail('notLinked');
  const s = S.getSchool(c.school_id);
  let students;
  try { students = await withToken(u.id, tk => C.listAll(tk, `/v1/courses/${encodeURIComponent(lk.course_id)}/students`, 'students', {}, { pageSize: 100, maxPages: 5 })); }
  catch (e) { const f = asFail(e); syncLog(u.id, c.id, kind, 'error', null, f.code); return f; }
  if (students.length > MAX_STUDENTS) { syncLog(u.id, c.id, kind, 'error', null, 'tooMany'); return fail('tooMany', { max: MAX_STUDENTS }); }
  const domains = G.schoolDomains(s);
  const counts = { added: 0, waiting: 0, already: 0, ownAccount: 0, otherSchool: 0, staff: 0, needDomains: 0, left: 0 };
  const t = now();
  tx(() => {
    const seen = new Set();
    const remember = (sub, userId) => q.run(`INSERT INTO gc_roster(class_id, sub, user_id, course_id, seen_at, gone_at) VALUES (?,?,?,?,?,NULL)
      ON CONFLICT(class_id, sub) DO UPDATE SET user_id=excluded.user_id, course_id=excluded.course_id, seen_at=excluded.seen_at, gone_at=NULL`, c.id, sub, userId, lk.course_id, t);
    for (const st of students) {
      const sub = safeId(String(st && st.userId || '')); if (!sub || seen.has(sub)) continue; seen.add(sub);
      const fullName = clip(st.profile && st.profile.name && st.profile.name.fullName, 60);
      const ident = G.identityBySub(sub);
      const user = ident && getUser(ident.user_id);
      if (user) {
        const m = S.membership(s.id, user.id);
        if (m && m.role !== 'student') { counts.staff++; continue; }
        if (user.banned) { counts.otherSchool++; continue; }
        if (!m) { if (user.managed_school && user.managed_school !== s.id) counts.otherSchool++; else counts.ownAccount++; continue; }
        q.run('DELETE FROM gc_pending WHERE class_id=? AND sub=?', c.id, sub);
        if (S.classMember(c.id, user.id)) { counts.already++; remember(sub, user.id); continue; }
        if (S.addToClass(u, c.id, user.id, 'student').ok) { counts.added++; remember(sub, user.id); }
        continue;
      }
      if (!domains.length) { counts.needDomains++; continue; }
      q.run(`INSERT INTO gc_pending(class_id, sub, school_id, course_id, roster_name, grade, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(class_id, sub) DO UPDATE SET course_id=excluded.course_id, roster_name=excluded.roster_name, grade=excluded.grade, created_by=excluded.created_by, created_at=excluded.created_at`,
      c.id, sub, s.id, lk.course_id, fullName, c.grade || '', u.id, t);
      counts.waiting++;
    }
    // Waiting students no longer on the Classroom roster go. Students matched before who left Classroom are marked gone
    // (still in the class: the teacher decides).
    const keep = [...seen];
    const notIn = keep.length ? ` AND sub NOT IN (${keep.map(() => '?').join(',')})` : '';
    q.run(`DELETE FROM gc_pending WHERE class_id=?${notIn}`, c.id, ...keep);
    counts.left = q.run(`UPDATE gc_roster SET gone_at=? WHERE class_id=? AND course_id=? AND gone_at IS NULL${notIn}`, t, c.id, lk.course_id, ...keep).changes;
    q.run('UPDATE gc_links SET roster_at=?, roster_counts=?, roster_next_at=NULL WHERE class_id=?', t, JSON.stringify(counts), c.id);
  });
  syncLog(u.id, c.id, kind, 'ok', counts);
  return ok({ counts });
}
/** Students this class got from Classroom who are no longer on its Classroom roster and are still in the class:
 *  [{ user_id, gone_at, username, display_name, roster_name }] (staff only: the page shows the roster name). */
export const leavers = classId => q.all(`SELECT r.user_id, r.gone_at, u.username, u.display_name, sm.roster_name FROM gc_roster r
  JOIN gc_links k ON k.class_id=r.class_id AND k.course_id=r.course_id
  JOIN class_members m ON m.class_id=r.class_id AND m.user_id=r.user_id AND m.status='active' AND m.role='student'
  JOIN users u ON u.id=r.user_id JOIN classrooms c ON c.id=r.class_id LEFT JOIN school_members sm ON sm.school_id=c.school_id AND sm.user_id=r.user_id
  WHERE r.class_id=? AND r.gone_at IS NOT NULL ORDER BY COALESCE(NULLIF(sm.roster_name,''), u.display_name) COLLATE NOCASE`, classId);
/** A student who left Classroom: take them out of this class (remove) or keep them and stop listing them (keep). */
export function settleLeaver(u, c, userId, action) {
  const row = leavers(c.id).find(r => r.user_id === userId); if (!row) return fail('notLeaver');
  if (action === 'remove') { const r = S.removeFromClass(u, c.id, userId); if (!r.ok) return r; }
  q.run('DELETE FROM gc_roster WHERE class_id=? AND user_id=?', c.id, userId);
  syncLog(u.id, c.id, action === 'remove' ? 'removeLeft' : 'keepLeft', 'ok');
  return ok();
}

// ------------------------------------------------------------------ posting a lesson: an assignment or a material
export const POST_KINDS = ['assignment', 'material'];
/** A class lesson's post of this kind in the Classroom class its class is linked to now (a post to another, earlier
 *  linked Classroom class doesn't count: it can't be graded from here and the lesson can be posted again). */
export const postOf = (clId, kind = 'assignment') => q.get('SELECT p.* FROM gc_posts p JOIN gc_links k ON k.class_id=p.class_id AND k.course_id=p.course_id WHERE p.class_lesson_id=? AND p.kind=?', clId, kind) || null;
export const postsOfClass = (classId, kind = 'assignment') => new Map(q.all('SELECT p.* FROM gc_posts p JOIN gc_links k ON k.class_id=p.class_id AND k.course_id=p.course_id WHERE p.class_id=? AND p.kind=?', classId, kind).map(r => [r.class_lesson_id, r]));
/** Classroom's due date and time (UTC) for a lesson due at the end of its due day where the school is. Classroom refuses
 *  a due date in the past, so a past one is left off. -> { dueDate, dueTime } or null */
export function classroomDue(cl, t = now()) {
  if (!cl.due_at) return null;
  const tz = typeof cl.tz === 'string' && S.isZone(cl.tz) ? cl.tz : null;
  const end = (tz ? L.dayBounds(cl.due_at, tz).end : Math.floor(cl.due_at / DAY) * DAY + DAY) - 60e3;
  if (end <= t) return null;
  const d = new Date(end);
  return { dueDate: { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, dueTime: { hours: d.getUTCHours(), minutes: d.getUTCMinutes() } };
}
/** When a lesson that opens later opens where the school is (Classroom then publishes it at that time). -> ms or null */
export function classroomOpens(cl, t = now()) {
  if (!cl.opens_at) return null;
  const tz = typeof cl.tz === 'string' && S.isZone(cl.tz) ? cl.tz : null;
  const start = tz ? L.dayBounds(cl.opens_at, tz).start : cl.opens_at;
  return start > t + 60e3 ? start : null;
}
const KIND = {
  // As an assignment: graded out of 100, with the due date (coursework.students).
  assignment: { scope: 'coursework', path: 'courseWork', log: 'post', already: 'alreadyPosted' },
  // As a material: no grade, no due date (courseworkmaterials).
  material: { scope: 'materials', path: 'courseWorkMaterials', log: 'material', already: 'alreadyShared' },
};
/** Post a lesson to the linked Classroom class. kind: 'assignment' (postLesson) or 'material' (shareMaterial). origin:
 *  the site's address for the link back; description: the one line, topicName: the default topic's name (both in the
 *  teacher's language). A lesson that opens later goes in as a draft scheduled for its opening, so students don't see it
 *  in Classroom while it's locked here. Filed under the class's topic when the teacher granted the topics scope. */
async function publish(u, cl, kind, { origin, description, topicName = '' }) {
  const k = KIND[kind];
  const lk = linkOf(cl.class_id); if (!lk) return fail('notLinked');
  if (!can(u.id, k.scope)) return fail('needsScope');
  if (postOf(cl.id, kind)) return fail(k.already);
  const lesson = L.getLesson(cl.lesson_id);
  const url = `${origin}/class/${cl.class_id}/lessons/${cl.id}`;
  const due = kind === 'assignment' ? classroomDue(cl) : null;
  const opens = classroomOpens(cl);
  const when = opens ? { state: 'DRAFT', scheduledTime: new Date(opens).toISOString() } : { state: 'PUBLISHED' };
  const body = { title: clip(lesson.title, 300) || 'Lesson', description: clip(description, 300), materials: [{ link: { url } }], ...when,
    ...(kind === 'assignment' ? { workType: 'ASSIGNMENT', maxPoints: 100, ...(due || {}) } : {}) };
  let cw, topicId = '';
  try {
    cw = await withToken(u.id, async tk => {
      topicId = await topicFor(u, lk, tk, topicName);
      return C.api(tk, 'POST', `/v1/courses/${encodeURIComponent(lk.course_id)}/${k.path}`, { body: topicId ? { ...body, topicId } : body });
    });
  } catch (e) { if (e.code === 'needsScope') dropScope(u.id, k.scope); const f = asFail(e); syncLog(u.id, cl.class_id, k.log, 'error', null, f.code); return f; }
  const cwId = safeId(String(cw && cw.id || ''));
  if (!cwId) { syncLog(u.id, cl.class_id, k.log, 'error', null, 'googleDown'); return fail('googleDown'); }
  const alt = typeof cw.alternateLink === 'string' && /^https:\/\/classroom\.google\.com\//.test(cw.alternateLink) ? cw.alternateLink.slice(0, 500) : '';
  // A post to an earlier linked Classroom class (it no longer counts) is replaced, and the grades sent to it forgotten.
  tx(() => {
    if (kind === 'assignment') q.run('DELETE FROM gc_grades WHERE class_lesson_id=?', cl.id);
    q.run(`INSERT INTO gc_posts(class_lesson_id, kind, class_id, course_id, coursework_id, link, posted_by, posted_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(class_lesson_id, kind) DO UPDATE SET class_id=excluded.class_id, course_id=excluded.course_id, coursework_id=excluded.coursework_id, link=excluded.link,
        posted_by=excluded.posted_by, posted_at=excluded.posted_at, grades_at=NULL, grades_mode=NULL, grades_counts=NULL, auto_at=NULL`, cl.id, kind, cl.class_id, lk.course_id, cwId, alt, u.id, now());
  });
  syncLog(u.id, cl.class_id, k.log, 'ok', { lesson: cl.id, due: !!due, pastDue: kind === 'assignment' && !!cl.due_at && !due, scheduled: !!opens, topic: !!topicId });
  return ok({ due: !!due, pastDue: kind === 'assignment' && !!cl.due_at && !due, scheduled: opens ? cl.opens_at : null, link: alt, topic: !!topicId });
}
export const postLesson = (u, cl, opts) => publish(u, cl, 'assignment', opts);
export const shareMaterial = (u, cl, opts) => publish(u, cl, 'material', opts);

// ------------------------------------------------------------------ grades
export const GRADE_MODES = ['draft', 'assigned'];
export const SYNCS_PER_HOUR = 60;
/** A student's completion grade out of 100: steps done of the lesson's steps (the gradebook's figure), not how many
 *  answers were right. The page and the results call it a completion grade. */
export const scoreOf = p => (p.total ? Math.round((100 * Math.min(p.done, p.total)) / p.total) : 0);
/**
 * Each student's score for this lesson to its coursework, as a draft grade (the teacher returns it in Classroom) or as
 * the assigned grade too. Only students on the teacher's own Classroom roster who are in this class and have started
 * the lesson; the rest are counted. Every grade that goes is remembered (gc_grades).
 * onlyChanged (automatic sync): only grades that differ from the last one sent (or now go as assigned); nothing to send,
 * no call to Google. gate(): asked just before calling Google (the automatic sync's rate limit); false -> tooManyTries.
 * -> { ok, counts: { sent, notStarted, notMatched, failed, unchanged? } }
 */
export async function sendGrades(u, cl, mode, { onlyChanged = false, auto = false, gate = null } = {}) {
  const kind = auto ? 'autoGrades' : 'grades';
  if (!GRADE_MODES.includes(mode)) return fail('badMode');
  if (!linkOf(cl.class_id)) return fail('notLinked');
  if (!can(u.id, 'coursework')) return fail('needsScope');
  const post = postOf(cl.id); if (!post) return fail('notPosted');
  const lp = P.lessonProgress(cl.id);
  const last = new Map(q.all('SELECT * FROM gc_grades WHERE class_lesson_id=? AND coursework_id=?', cl.id, post.coursework_id).map(r => [r.user_id, r]));
  const changed = p => { const g = last.get(p.id); return !g || g.grade !== scoreOf(p) || (mode === 'assigned' && g.mode !== 'assigned'); };
  const counts = { sent: 0, notStarted: 0, notMatched: 0, failed: 0, ...(onlyChanged ? { unchanged: 0 } : {}) };
  if (onlyChanged && !lp.students.some(p => p.done && changed(p))) return ok({ counts, quiet: true });
  if (gate && !gate()) return fail('tooManyTries');
  const byUser = new Map(lp.students.map(p => [p.id, p]));
  const base = `/v1/courses/${encodeURIComponent(post.course_id)}/courseWork/${encodeURIComponent(post.coursework_id)}/studentSubmissions`;
  const remember = (...a) => q.run(`INSERT INTO gc_grades(class_lesson_id, user_id, coursework_id, grade, mode, sent_at) VALUES (?,?,?,?,?,?)
    ON CONFLICT(class_lesson_id, user_id) DO UPDATE SET coursework_id=excluded.coursework_id, grade=excluded.grade, mode=excluded.mode, sent_at=excluded.sent_at`, ...a);
  let firstError = null;
  try {
    await withToken(u.id, async tk => {
      const subs = await C.listAll(tk, base, 'studentSubmissions', {}, { pageSize: 100, maxPages: 5 });
      const ids = new Map([...G.identitiesOf([...byUser.keys()]).values()].map(r => [r.sub, r.user_id]));
      for (const sub of subs) {
        const sid = safeId(String(sub && sub.id || '')); const p = byUser.get(ids.get(String(sub && sub.userId || '')));
        if (!sid || !p) { counts.notMatched++; continue; }
        if (!p.done) { counts.notStarted++; continue; }
        if (onlyChanged && !changed(p)) { counts.unchanged++; continue; }
        const grade = scoreOf(p);
        try {
          await C.api(tk, 'PATCH', `${base}/${encodeURIComponent(sid)}`, { query: { updateMask: mode === 'assigned' ? 'draftGrade,assignedGrade' : 'draftGrade' }, body: mode === 'assigned' ? { draftGrade: grade, assignedGrade: grade } : { draftGrade: grade } });
          counts.sent++;
          remember(cl.id, p.id, post.coursework_id, grade, mode, now());
        } catch (e) {
          if (e.code === 'auth' || e.code === 'reconnect' || e.code === 'rateLimited' || e.code === 'needsScope') throw e;
          counts.failed++; firstError = firstError || (e.code || 'googleDown');
        }
      }
    });
  } catch (e) { if (e.code === 'needsScope') dropScope(u.id, 'coursework'); const f = asFail(e, { counts }); syncLog(u.id, cl.class_id, kind, 'error', counts, f.code); return f; }
  // The automatic sync logs only when something went (or didn't): a quiet run leaves no line.
  if (!auto || counts.sent || counts.failed) {
    q.run("UPDATE gc_posts SET grades_at=?, grades_mode=?, grades_counts=? WHERE class_lesson_id=? AND kind='assignment'", now(), mode, JSON.stringify(counts), cl.id);
    syncLog(u.id, cl.class_id, kind, counts.failed ? 'partial' : 'ok', { ...counts, mode }, firstError);
  }
  return ok({ counts, error: firstError });
}

// ------------------------------------------------------------------ announcements
export const ANNOUNCE_MAX = 500;
export const ANNOUNCE_PER_HOUR = 10;
export const ANNOUNCE_TEMPLATES = ['live', 'lesson', 'free'];
/** The teacher's own words: plain text, line breaks kept (at most one empty line in a row), no control characters. */
export const cleanNote = s => String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/[\u0000-\u0009\u000b-\u001f\u007f​-‏‪-‮⁦-⁩]/g, '')
  .split('\n').map(l => l.replace(/[ \t]+/g, ' ').trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
/**
 * The fixed part of an announcement template, in the teacher's language (t): 'live' (a live game starting now: the join
 * code and link; code: a live game open for this class, checked by the caller), 'lesson' (a lesson of this class that
 * is open: its title and link), 'free' (nothing fixed). Nothing else ever goes in: no names, no results.
 * -> { ok, fixed } | { ok: false, code }
 */
export function announceFixed(t, c, { template, code = '', clId = '' }, origin, at = now()) {
  if (template === 'free') return ok({ fixed: '' });
  if (template === 'live') {
    const d = String(code || '');
    if (!/^\d{7}$/.test(d)) return fail('noLiveGame');
    return ok({ fixed: t('gclassroom.announce.fixed.live', { code: d, url: `${origin}/join#${d}` }) });
  }
  if (template === 'lesson') {
    const cl = L.getClassLesson(String(clId || ''));
    if (!cl || cl.class_id !== c.id) return fail('pickLesson');
    if (!L.isOpen(cl, at)) return fail('lessonNotOpen');
    const lesson = L.getLesson(cl.lesson_id);
    return ok({ fixed: t('gclassroom.announce.fixed.lesson', { title: clip(lesson && lesson.title, 120), url: `${origin}/class/${c.id}/lessons/${cl.id}` }) });
  }
  return fail('badTemplate');
}
const NAME_EDGE = '[\\p{L}\\p{N}_]';
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A student's name in the teacher's words? (Their roster name, its first word, their display name or username, as whole
 *  words.) -> the name found, or '' */
export function nameIn(text, classId) {
  if (!text) return '';
  const names = new Set();
  for (const r of S.roster(classId).filter(x => x.role === 'student')) {
    for (const n of [r.roster_name, r.roster_name && r.roster_name.split(/\s+/)[0], r.display_name, r.username]) {
      const v = clip(n, 60); if (v.length >= 3) names.add(v);
    }
  }
  for (const n of names) if (new RegExp(`(?<!${NAME_EDGE})${escRe(n)}(?!${NAME_EDGE})`, 'iu').test(text)) return n;
  return '';
}
/**
 * Post to the class stream: the template's fixed part (announceFixed) and the teacher's note, plain text, at most 500
 * characters, never a student's name (refused, with the name, so the teacher can take it out). 10 an hour per class.
 * -> { ok, link }
 */
export async function announce(u, c, { template, fixed = '', note = '' }) {
  const lk = linkOf(c.id); if (!lk) return fail('notLinked');
  if (!can(u.id, 'announce')) return fail('needsScope');
  if (!ANNOUNCE_TEMPLATES.includes(template)) return fail('badTemplate');
  const words = cleanNote(note);
  const text = [fixed, words].filter(Boolean).join('\n\n');
  if (!words && template === 'free') return fail('emptyNote');
  if (text.length > ANNOUNCE_MAX) return fail('tooLong', { max: ANNOUNCE_MAX });
  const who = nameIn(words, c.id); if (who) return fail('hasName', { name: who });
  if (!allow(`gc-announce:${c.id}`, ANNOUNCE_PER_HOUR, 3600e3)) return fail('tooManyAnnouncements');
  let a;
  try { a = await withToken(u.id, tk => C.api(tk, 'POST', `/v1/courses/${encodeURIComponent(lk.course_id)}/announcements`, { body: { text, state: 'PUBLISHED' } })); }
  catch (e) { if (e.code === 'needsScope') dropScope(u.id, 'announce'); const f = asFail(e); syncLog(u.id, c.id, 'announce', 'error', { template }, f.code); return f; }
  const alt = a && typeof a.alternateLink === 'string' && /^https:\/\/classroom\.google\.com\//.test(a.alternateLink) ? a.alternateLink.slice(0, 500) : '';
  // The log keeps the template and the length, never the text.
  syncLog(u.id, c.id, 'announce', 'ok', { template, chars: text.length });
  return ok({ link: alt });
}

// ------------------------------------------------------------------ automatic sync (jobs)
export const AUTO_GRADES_EVERY = 30 * 60e3;
export const ROSTER_EVERY = 6 * 3600e3;
export const AUTO_STOP_DAYS = 30;
export const AUTO_NO_DUE_DAYS = 90;
/** After errors: 1 h, 2 h, 4 h... at most a day between tries. */
const backoff = fails => Math.min(AUTO_GRADES_EVERY * 2 ** fails, DAY);
/** No more automatic grades for this lesson: 30 days after its due day (90 days after it was posted when it has none). */
export const autoEnded = (cl, post, t = now()) => (cl.due_at ? t > cl.due_at + DAY + AUTO_STOP_DAYS * DAY : t > post.posted_at + AUTO_NO_DUE_DAYS * DAY);
/** Why a class's automatic grades are paused ('' when they run): 'reconnect' (the teacher's connection stopped
 *  working), 'needsScope' (posting isn't allowed any more), 'gone' (that teacher can't sync this class now), 'backoff'. */
export function autoPaused(lk, t = now()) {
  if (!lk || !lk.auto_grades || !lk.auto_by) return '';
  const u = getUser(lk.auto_by); const c = S.getClass(lk.class_id);
  if (!u || !c || !mayConnect(u) || !S.canManageClass(u, c)) return 'gone';
  const st = connectionState(u.id); if (st !== 'ok') return 'reconnect';
  if (!can(u.id, 'coursework')) return 'needsScope';
  return lk.auto_next_at && lk.auto_next_at > t ? 'backoff' : '';
}
/**
 * Every 30 minutes: for each class with automatic grades on, the posted lessons whose students' progress moved since
 * the last look get their changed grades sent (sendGrades onlyChanged), within the teacher's 60 syncs an hour. An error
 * backs that class off; a connection that needs connecting again pauses it (the page says "Connect again").
 */
export async function autoGrades(t = now()) {
  const out = { lessons: 0, sent: 0, paused: 0 };
  if (!enabled() || !canStore()) return out;
  for (const lk of q.all("SELECT * FROM gc_links WHERE auto_grades IN ('draft','assigned') AND auto_by IS NOT NULL AND (auto_next_at IS NULL OR auto_next_at<=?)", t)) {
    if (autoPaused(lk, t)) { out.paused++; continue; }
    const u = getUser(lk.auto_by);
    let error = null;
    for (const p of q.all("SELECT * FROM gc_posts WHERE class_id=? AND course_id=? AND kind='assignment' ORDER BY posted_at", lk.class_id, lk.course_id)) {
      const cl = L.getClassLesson(p.class_lesson_id); if (!cl || autoEnded(cl, p, t)) continue;
      const moved = q.get('SELECT MAX(updated_at) m FROM step_progress WHERE class_lesson_id=?', cl.id).m;
      if (p.auto_at && !(moved > p.auto_at)) continue;
      const r = await sendGrades(u, cl, lk.auto_grades, { onlyChanged: true, auto: true, gate: () => allow(`gc-sync:${u.id}`, SYNCS_PER_HOUR, 3600e3) });
      if (!r.ok) { error = r.code; break; }
      if (!r.quiet) out.lessons++;
      out.sent += r.counts.sent;
      q.run("UPDATE gc_posts SET auto_at=? WHERE class_lesson_id=? AND kind='assignment'", t, cl.id);
    }
    // Out of syncs for this hour: the next run carries on. Any other error backs off.
    if (error && error !== 'tooManyTries') q.run('UPDATE gc_links SET auto_fails=auto_fails+1, auto_next_at=? WHERE class_id=?', t + backoff(lk.auto_fails + 1), lk.class_id);
    else if (!error && lk.auto_fails) q.run('UPDATE gc_links SET auto_fails=0, auto_next_at=NULL WHERE class_id=?', lk.class_id);
  }
  return out;
}
/**
 * Every hour: the roster of each linked class whose last import is 6 hours old is imported again (importRoster, the
 * same rules), with the connection of the teacher who linked it, unless the class turned it off. Only after a first
 * import by hand. Within the class's 20 imports and the teacher's 60 syncs an hour; an error waits another 6 hours.
 */
export async function autoRoster(t = now()) {
  const out = { imported: 0, failed: 0 };
  if (!enabled() || !canStore()) return out;
  for (const lk of q.all('SELECT * FROM gc_links WHERE auto_roster=1 AND roster_at IS NOT NULL AND roster_at<=? AND (roster_next_at IS NULL OR roster_next_at<=?)', t - ROSTER_EVERY, t)) {
    const u = getUser(lk.linked_by); const c = S.getClass(lk.class_id);
    if (!u || !c || c.archived_at || !mayConnect(u) || !S.canManageClass(u, c) || connectionState(u.id) !== 'ok') continue;
    if (!allow(`gc-roster:${c.id}`, 20, 3600e3) || !allow(`gc-sync:${u.id}`, SYNCS_PER_HOUR, 3600e3)) continue;
    const r = await importRoster(u, c, { auto: true });
    if (r.ok) out.imported++;
    else { out.failed++; q.run('UPDATE gc_links SET roster_next_at=? WHERE class_id=?', t + ROSTER_EVERY, c.id); }
  }
  return out;
}
register('gclassroom-auto-grades', AUTO_GRADES_EVERY, () => autoGrades(), { firstAfterMs: 5 * 60e3 });
register('gclassroom-roster-refresh', 3600e3, () => autoRoster(), { firstAfterMs: 10 * 60e3 });

// ------------------------------------------------------------------ clean-up hooks
/** Account deletion (services/account-delete.js): the stored token goes (revoked at Google best-effort first), and the
 *  automatic grades it sent stop. */
export function forgetUser(userId) {
  const row = q.get('SELECT token_enc FROM gc_connections WHERE user_id=?', userId);
  if (row) { const t = unseal(userId, row.token_enc); if (t) C.revoke(t).catch(() => {}); }
  q.run('DELETE FROM gc_connections WHERE user_id=?', userId); tokens.delete(userId); coursesCache.delete(userId);
  q.run("UPDATE gc_links SET auto_grades='', auto_by=NULL WHERE auto_by=?", userId);
}
