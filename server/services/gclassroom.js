// Google Classroom sync (docs/google-classroom.md; docs/decisions.md "Google Classroom sync"). A teacher connects their
// Google Classroom (incremental authorization on top of Sign in with Google), links an Oomba class to one of their
// courses, imports its roster, posts a lesson as coursework (a link back to the lesson, with its due date) and sends each
// student's lesson score as a draft or assigned grade. Calls to Google go through services/gclassroom-client.js only.
//
// What goes to Google: the lesson's title, a fixed one-line description, the link to the lesson, its due date, and a
// score out of 100 for each student who is on the teacher's own Classroom roster. Nothing else: no names, no answers,
// no feedback, no games. What comes back: the teacher's course names, and each student's Google account id and full name
// (the name is only the staff-only roster name, never the public one).
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
/** Missing any of the scopes we need? (Google lets people untick boxes on the consent screen.) */
export const missingScopes = granted => C.SCOPES.filter(s => !granted.includes(s));

export function saveConnection(u, { sub, email, scopes, refreshToken }) {
  if (!canStore()) return fail('notSetUp');
  if (!refreshToken) return fail('noRefresh');
  const sealed = seal(u.id, refreshToken);
  q.run(`INSERT INTO gc_connections(user_id, sub, email, scopes, token_enc, key_tag, status, last_error, created_at, updated_at) VALUES (?,?,?,?,?,?,'ok',NULL,?,?)
    ON CONFLICT(user_id) DO UPDATE SET sub=excluded.sub, email=excluded.email, scopes=excluded.scopes, token_enc=excluded.token_enc, key_tag=excluded.key_tag, status='ok', last_error=NULL, updated_at=excluded.updated_at`,
  u.id, clip(sub, 255), clip(email, 254), scopes.join(' '), sealed, keyTag(), now(), now());
  tokens.delete(u.id); coursesCache.delete(u.id);
  syncLog(u.id, null, 'connect', 'ok');
  return ok();
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
    tokens.set(userId, { token: r.accessToken, exp: Date.now() + Math.min(r.expiresIn, 3600) * 1000 });
    if (tokens.size > 5000) tokens.delete(tokens.keys().next().value);
    return r.accessToken;
  } catch (e) { if (e.code === 'reconnect') markBroken(userId, 'revoked'); throw e; }
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
  q.run('DELETE FROM gc_pending WHERE class_id NOT IN (SELECT class_id FROM gc_links)');
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
    // Posts and waiting students belong to the Classroom class they came from: linking another one drops them (so a lesson
    // can be posted to the new class, and grades never go to the old one). Relinking the same class keeps them.
    dropped = q.run('DELETE FROM gc_posts WHERE class_id=? AND course_id<>?', c.id, course.id).changes;
    q.run('DELETE FROM gc_pending WHERE class_id=? AND course_id<>?', c.id, course.id);
    q.run(`INSERT INTO gc_links(class_id, course_id, course_name, linked_by, linked_at) VALUES (?,?,?,?,?)
    ON CONFLICT(class_id) DO UPDATE SET course_id=excluded.course_id, course_name=excluded.course_name, linked_by=excluded.linked_by, linked_at=excluded.linked_at, roster_at=NULL, roster_counts=NULL`,
  c.id, course.id, course.name, u.id, now());
  });
  syncLog(u.id, c.id, 'link', 'ok', dropped ? { droppedPosts: dropped } : null);
  return ok({ course });
}
export function unlink(u, c) {
  if (!linkOf(c.id)) return fail('notLinked');
  // Posts stay (relinking the same Classroom class finds them again; linking another drops them). Students still waiting
  // to sign in came from this link, so they go.
  tx(() => { q.run('DELETE FROM gc_links WHERE class_id=?', c.id); q.run('DELETE FROM gc_pending WHERE class_id=?', c.id); });
  syncLog(u.id, c.id, 'unlink', 'ok');
  return ok();
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
 * -> { ok, counts: { added, waiting, already, ownAccount, otherSchool, staff, needDomains } }
 */
export async function importRoster(u, c) {
  const lk = linkOf(c.id); if (!lk) return fail('notLinked');
  const s = S.getSchool(c.school_id);
  let students;
  try { students = await withToken(u.id, tk => C.listAll(tk, `/v1/courses/${encodeURIComponent(lk.course_id)}/students`, 'students', {}, { pageSize: 100, maxPages: 5 })); }
  catch (e) { const f = asFail(e); syncLog(u.id, c.id, 'roster', 'error', null, f.code); return f; }
  if (students.length > MAX_STUDENTS) { syncLog(u.id, c.id, 'roster', 'error', null, 'tooMany'); return fail('tooMany', { max: MAX_STUDENTS }); }
  const domains = G.schoolDomains(s);
  const counts = { added: 0, waiting: 0, already: 0, ownAccount: 0, otherSchool: 0, staff: 0, needDomains: 0 };
  tx(() => {
    const seen = new Set();
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
        if (S.classMember(c.id, user.id)) { counts.already++; continue; }
        if (S.addToClass(u, c.id, user.id, 'student').ok) counts.added++;
        continue;
      }
      if (!domains.length) { counts.needDomains++; continue; }
      q.run(`INSERT INTO gc_pending(class_id, sub, school_id, course_id, roster_name, grade, created_by, created_at) VALUES (?,?,?,?,?,?,?,?)
        ON CONFLICT(class_id, sub) DO UPDATE SET course_id=excluded.course_id, roster_name=excluded.roster_name, grade=excluded.grade, created_by=excluded.created_by, created_at=excluded.created_at`,
      c.id, sub, s.id, lk.course_id, fullName, c.grade || '', u.id, now());
      counts.waiting++;
    }
    // Waiting students no longer on the Classroom roster go.
    const keep = [...seen];
    q.run(`DELETE FROM gc_pending WHERE class_id=?${keep.length ? ` AND sub NOT IN (${keep.map(() => '?').join(',')})` : ''}`, c.id, ...keep);
    q.run('UPDATE gc_links SET roster_at=?, roster_counts=? WHERE class_id=?', now(), JSON.stringify(counts), c.id);
  });
  syncLog(u.id, c.id, 'roster', 'ok', counts);
  return ok({ counts });
}

// ------------------------------------------------------------------ posting a lesson as coursework
/** A class lesson's post in the Classroom class its class is linked to now (a post to another, earlier linked Classroom
 *  class doesn't count: it can't be graded from here and the lesson can be posted again). */
export const postOf = clId => q.get('SELECT p.* FROM gc_posts p JOIN gc_links k ON k.class_id=p.class_id AND k.course_id=p.course_id WHERE p.class_lesson_id=?', clId) || null;
export const postsOfClass = classId => new Map(q.all('SELECT p.* FROM gc_posts p JOIN gc_links k ON k.class_id=p.class_id AND k.course_id=p.course_id WHERE p.class_id=?', classId).map(r => [r.class_lesson_id, r]));
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
/** origin: the site's address for the link back; description: the one line (in the teacher's language). A lesson that
 *  opens later goes in as a draft scheduled for its opening, so students don't see it in Classroom while it's locked here. */
export async function postLesson(u, cl, { origin, description }) {
  const lk = linkOf(cl.class_id); if (!lk) return fail('notLinked');
  if (postOf(cl.id)) return fail('alreadyPosted');
  const lesson = L.getLesson(cl.lesson_id);
  const url = `${origin}/class/${cl.class_id}/lessons/${cl.id}`;
  const due = classroomDue(cl);
  const opens = classroomOpens(cl);
  const when = opens ? { state: 'DRAFT', scheduledTime: new Date(opens).toISOString() } : { state: 'PUBLISHED' };
  const body = { title: clip(lesson.title, 300) || 'Lesson', description: clip(description, 300), materials: [{ link: { url } }], workType: 'ASSIGNMENT', ...when, maxPoints: 100, ...(due || {}) };
  let cw;
  try { cw = await withToken(u.id, tk => C.api(tk, 'POST', `/v1/courses/${encodeURIComponent(lk.course_id)}/courseWork`, { body })); }
  catch (e) { const f = asFail(e); syncLog(u.id, cl.class_id, 'post', 'error', null, f.code); return f; }
  const cwId = safeId(String(cw && cw.id || ''));
  if (!cwId) { syncLog(u.id, cl.class_id, 'post', 'error', null, 'googleDown'); return fail('googleDown'); }
  const alt = typeof cw.alternateLink === 'string' && /^https:\/\/classroom\.google\.com\//.test(cw.alternateLink) ? cw.alternateLink.slice(0, 500) : '';
  // A post to an earlier linked Classroom class (it no longer counts) is replaced.
  q.run(`INSERT INTO gc_posts(class_lesson_id, class_id, course_id, coursework_id, link, posted_by, posted_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(class_lesson_id) DO UPDATE SET class_id=excluded.class_id, course_id=excluded.course_id, coursework_id=excluded.coursework_id, link=excluded.link,
      posted_by=excluded.posted_by, posted_at=excluded.posted_at, grades_at=NULL, grades_mode=NULL, grades_counts=NULL`, cl.id, cl.class_id, lk.course_id, cwId, alt, u.id, now());
  syncLog(u.id, cl.class_id, 'post', 'ok', { lesson: cl.id, due: !!due, pastDue: !!cl.due_at && !due, scheduled: !!opens });
  return ok({ due: !!due, pastDue: !!cl.due_at && !due, scheduled: opens ? cl.opens_at : null, link: alt });
}

// ------------------------------------------------------------------ grades
export const GRADE_MODES = ['draft', 'assigned'];
/** A student's completion grade out of 100: steps done of the lesson's steps (the gradebook's figure), not how many
 *  answers were right. The page and the results call it a completion grade. */
export const scoreOf = p => (p.total ? Math.round((100 * Math.min(p.done, p.total)) / p.total) : 0);
/**
 * Each student's score for this lesson to its coursework, as a draft grade (the teacher returns it in Classroom) or as
 * the assigned grade too. Only students on the teacher's own Classroom roster who are in this class and have started
 * the lesson; the rest are counted. -> { ok, counts: { sent, notStarted, notMatched, failed } }
 */
export async function sendGrades(u, cl, mode) {
  if (!GRADE_MODES.includes(mode)) return fail('badMode');
  if (!linkOf(cl.class_id)) return fail('notLinked');
  const post = postOf(cl.id); if (!post) return fail('notPosted');
  const lp = P.lessonProgress(cl.id);
  const byUser = new Map(lp.students.map(p => [p.id, p]));
  const base = `/v1/courses/${encodeURIComponent(post.course_id)}/courseWork/${encodeURIComponent(post.coursework_id)}/studentSubmissions`;
  const counts = { sent: 0, notStarted: 0, notMatched: 0, failed: 0 };
  let firstError = null;
  try {
    await withToken(u.id, async tk => {
      const subs = await C.listAll(tk, base, 'studentSubmissions', {}, { pageSize: 100, maxPages: 5 });
      const ids = new Map([...G.identitiesOf([...byUser.keys()]).values()].map(r => [r.sub, r.user_id]));
      for (const sub of subs) {
        const sid = safeId(String(sub && sub.id || '')); const p = byUser.get(ids.get(String(sub && sub.userId || '')));
        if (!sid || !p) { counts.notMatched++; continue; }
        if (!p.done) { counts.notStarted++; continue; }
        const grade = scoreOf(p);
        try {
          await C.api(tk, 'PATCH', `${base}/${encodeURIComponent(sid)}`, { query: { updateMask: mode === 'assigned' ? 'draftGrade,assignedGrade' : 'draftGrade' }, body: mode === 'assigned' ? { draftGrade: grade, assignedGrade: grade } : { draftGrade: grade } });
          counts.sent++;
        } catch (e) {
          if (e.code === 'auth' || e.code === 'reconnect' || e.code === 'rateLimited') throw e;
          counts.failed++; firstError = firstError || (e.code || 'googleDown');
        }
      }
    });
  } catch (e) { const f = asFail(e, { counts }); syncLog(u.id, cl.class_id, 'grades', 'error', counts, f.code); return f; }
  q.run('UPDATE gc_posts SET grades_at=?, grades_mode=?, grades_counts=? WHERE class_lesson_id=?', now(), mode, JSON.stringify(counts), cl.id);
  syncLog(u.id, cl.class_id, 'grades', counts.failed ? 'partial' : 'ok', { ...counts, mode }, firstError);
  return ok({ counts, error: firstError });
}

// ------------------------------------------------------------------ clean-up hooks
/** Account deletion (services/account-delete.js): the stored token goes (revoked at Google best-effort first). */
export function forgetUser(userId) {
  const row = q.get('SELECT token_enc FROM gc_connections WHERE user_id=?', userId);
  if (row) { const t = unseal(userId, row.token_enc); if (t) C.revoke(t).catch(() => {}); }
  q.run('DELETE FROM gc_connections WHERE user_id=?', userId); tokens.delete(userId); coursesCache.delete(userId);
}
