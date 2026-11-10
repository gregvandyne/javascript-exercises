// Google Classroom sync (server/services/gclassroom.js, server/routes/gclassroom.js): off unless configured, who may
// use it (teachers of the class only: other teachers, students, guests and signed-out visitors get 404/403/401), the
// connect flow (incremental authorization, refresh token encrypted at rest, scopes checked, disconnect revokes), linking
// a course, importing its roster, posting a lesson, sending grades, errors shown plainly, rate limits and the sync log.
// Then the optional write scopes (read-only works, write controls hidden, the "Allow" upgrade, scopes re-read at refresh),
// automatic grades and roster refresh (the jobs), topics, materials and announcements.
// Google is the fakes in tests/support (fake-google.js for OAuth, fake-classroom.js for the API).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeClassroom } = await import('../support/fake-classroom.js');
const fake = await startFakeGoogle();
const room = await startFakeClassroom();
const KEY = 'a'.repeat(64); // a fake test key
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
process.env.GOOGLE_CLASSROOM = '1';
process.env.GOOGLE_TOKEN_KEY = KEY;
process.env.CLASSROOM_API_BASE = room.url;
const { config, parseTokenKey } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const G = await import('../../server/services/google.js');
const GC = await import('../../server/services/gclassroom.js');
const { SCOPES, REQUIRED_SCOPES, OPTIONAL_SCOPES } = await import('../../server/services/gclassroom-client.js');
const LS = await import('../../server/services/classlive-sessions.js');
const { gcLiveAnnounce } = await import('../../server/routes/gclassroom.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); await room.close(); });
const ON = { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true, googleTokenKey: parseTokenKey(KEY).key, classroomApiBase: room.url };
test.beforeEach(() => { RL._reset(); Object.assign(config, ON); GC._forget(); });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const loc = r => r.headers.get('location');
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
const DAY = 86400e3;

/** A school with Google domains, an admin, a teacher of one class, another teacher, a student, and a lesson in the class. */
function school({ domains = ['dwes.test'] } = {}) {
  const admin = createUser({ username: uname('Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `School ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('Tch'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  const other = createUser({ username: uname('Oth'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, other.id, 'teacher', { rosterName: 'Mx Other' });
  const c = S.createClass({ id: teacher.id }, s.id, { name: 'Class 4B', grade: '4' }).class;
  if (domains.length) S.updateSchool({ id: admin.id }, s.id, { settings: { googleDomains: domains } });
  const kid = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Kid Here', grade: '4' }).user;
  S.addToClass({ id: admin.id }, c.id, kid.id, 'student');
  const lesson = L.createLesson(teacher, s.id, { title: 'Fractions day' }).lesson;
  const steps = [L.addStep(teacher, lesson.id, { kind: 'text', title: 'Read', body: 'Halves.' }).step, L.addStep(teacher, lesson.id, { kind: 'text', title: 'More', body: 'Quarters.' }).step];
  const cl = L.assign(teacher, c.id, lesson.id, { dueAt: new Date(Date.now() + 7 * DAY).toISOString().slice(0, 10) }).classLesson;
  return { s: S.getSchool(s.id), admin, teacher, other, kid, c, lesson, steps, cl, tc: cookieFor(teacher.id), oc: cookieFor(other.id), ac: cookieFor(admin.id), kc: cookieFor(kid.id) };
}
/** Connect (POST → start → fake Google auto-consent → callback). write: the "Allow Oomba Academy to post to Classroom"
 *  flow (the optional scopes too; most tests need it), else Connect (the two read scopes). The default email (and so
 *  the Google account) is one per teacher. -> the callback reply. */
async function connect(cookie, classId, { email = `t${crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 10)}@dwes.test`, sub, dropScope, cancel, noRefresh, write = true } = {}) {
  const r = await post('/api/google-classroom/connect', { back: classId, ...(write ? { write: '1' } : {}) }, cookie);
  if (r.status !== 200) return r;
  const start = await get((await r.json()).redirect, cookie);
  assert.equal(start.status, 302, `start ${start.status} ${loc(start)}`);
  const flow = cookieOf(start, 'brb_gflow'); const to = new URL(loc(start));
  assert.equal(to.searchParams.get('access_type'), 'offline');
  assert.equal(to.searchParams.get('include_granted_scopes'), 'true');
  assert.deepEqual(to.searchParams.get('scope').split(' ').sort(), ['openid', 'email', ...(write ? SCOPES : REQUIRED_SCOPES)].sort(), 'only the Classroom scopes we need');
  if (dropScope || noRefresh) fake.next({ dropScope, noRefresh });
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', email); if (sub) to.searchParams.set('fake_sub', sub);
  if (cancel) to.searchParams.set('fake_error', 'access_denied');
  const a = await fetch(to, { redirect: 'manual' });
  const cb = new URL(loc(a));
  return get(cb.pathname + cb.search, `${cookie}; ${flow}`);
}
const course = (students = [], extra = {}) => room.addCourse({ name: `Course ${++n}`, students, ...extra });
const syncs = (classId, kind) => q.all('SELECT * FROM gc_syncs WHERE class_id=? AND kind=? ORDER BY created_at', classId, kind);

test('config: the token key must be 32 bytes; the feature is off without GOOGLE_CLASSROOM=1 or Sign in with Google', async () => {
  assert.equal(parseTokenKey('').key, null);
  assert.equal(parseTokenKey(KEY).key.length, 32);
  assert.equal(parseTokenKey(Buffer.alloc(32, 7).toString('base64')).key.length, 32);
  assert.match(parseTokenKey('short').error, /GOOGLE_TOKEN_KEY/);
  assert.doesNotMatch(parseTokenKey('my-secret-value').error, /my-secret-value/, 'never echoed');
  const { c, tc } = school();
  config.googleClassroom = false;
  assert.equal((await get(`/class/${c.id}/google-classroom`, tc)).status, 404);
  assert.equal((await post('/api/google-classroom/connect', {}, tc)).status, 404);
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 404);
  assert.doesNotMatch(await (await get(`/class/${c.id}`, tc)).text(), /google-classroom/);
  config.googleClassroom = true; config.googleClientId = '';
  assert.equal((await get(`/class/${c.id}/google-classroom`, tc)).status, 404);
  config.googleClientId = ON.googleClientId;
  assert.match(await (await get(`/class/${c.id}`, tc)).text(), new RegExp(`href="/class/${c.id}/google-classroom"`));
});

test('the refresh token at rest: AES-256-GCM, bound to the teacher, unreadable with another key or when changed', () => {
  const sealed = GC.seal('user-1', 'fake-rt-abc');
  assert.match(sealed, /^v1\./); assert.doesNotMatch(sealed, /fake-rt/);
  assert.notEqual(GC.seal('user-1', 'fake-rt-abc'), sealed, 'a fresh nonce each time');
  assert.equal(GC.unseal('user-1', sealed), 'fake-rt-abc');
  assert.equal(GC.unseal('user-2', sealed), null, 'another account');
  const bad = sealed.slice(0, -2) + (sealed.slice(-2) === 'AA' ? 'BB' : 'AA');
  assert.equal(GC.unseal('user-1', bad), null, 'tampered');
  config.googleTokenKey = Buffer.alloc(32, 9);
  assert.equal(GC.unseal('user-1', sealed), null, 'another key');
  config.googleTokenKey = null;
  assert.throws(() => GC.seal('user-1', 'x'), /GOOGLE_TOKEN_KEY/, 'no key, no storing');
});

test('who may use it: the class\'s teachers and school admins; other teachers, students, guests and visitors get nothing', async () => {
  const { c, cl, tc, oc, ac, kc, s } = school();
  const outsider = school();
  const guest = createUser({ username: uname('Gst'), isGuest: true });
  const gc = cookieFor(guest.id);
  const pageUrl = `/class/${c.id}/google-classroom`;
  assert.equal((await get(pageUrl, tc)).status, 200);
  assert.equal((await get(pageUrl, ac)).status, 200, 'the school admin');
  for (const [who, ck] of [['another teacher here', oc], ['a teacher elsewhere', outsider.tc], ['the student', kc], ['a guest', gc]]) {
    assert.equal((await get(pageUrl, ck)).status, 404, who);
    for (const [p, body] of [[`/api/classes/${c.id}/google-classroom/link`, { courseId: '1' }], [`/api/classes/${c.id}/google-classroom/unlink`], [`/api/classes/${c.id}/google-classroom/roster`],
      [`/api/class-lessons/${cl.id}/google-classroom/post`], [`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }]]) {
      const r = await post(p, body, ck);
      assert.ok([403, 404].includes(r.status), `${who}: ${p} → ${r.status}`);
    }
  }
  assert.equal((await get(pageUrl)).status, 302, 'signed out: to sign in');
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {})).status, 401);
  // Students and guests can't start a connection either.
  assert.equal((await post('/api/google-classroom/connect', {}, kc)).status, 403);
  assert.equal((await post('/api/google-classroom/connect', {}, gc)).status, 403);
  // A platform admin who isn't staff sees the page but has no Classroom of their own to connect.
  const root = createUser({ username: uname('Root'), password: 'root-pass-12345', role: 'admin' });
  const rc = cookieFor(root.id);
  assert.equal((await get(pageUrl, rc)).status, 200);
  assert.equal((await post('/api/google-classroom/connect', { back: c.id }, rc)).status, 403);
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, rc)).status, 403);
  assert.ok(s);
});

test('connect: consent, an encrypted refresh token, the page says so; disconnect revokes it at Google and deletes it', async () => {
  const { c, teacher, tc } = school();
  const r = await connect(tc, c.id, { email: 'teach@dwes.test', write: false });
  assert.equal(loc(r), `/class/${c.id}/google-classroom?gc=connected#gc-connect`);
  const row = q.get('SELECT * FROM gc_connections WHERE user_id=?', teacher.id);
  assert.equal(row.email, 'teach@dwes.test'); assert.equal(row.status, 'ok');
  assert.doesNotMatch(row.token_enc, /fake-rt/, 'never stored in the clear');
  const rt = GC.unseal(teacher.id, row.token_enc); assert.ok(fake.refreshTokens.has(rt));
  const pg = await (await get(`/class/${c.id}/google-classroom?gc=connected`, tc)).text();
  assert.match(pg, /Google Classroom is connected/); assert.match(pg, /Connected as ⁦teach@dwes\.test⁩/);
  // The page lists the teacher's courses to link.
  const id = course([], { name: 'Maths 4B' });
  assert.match(await (await get(`/class/${c.id}/google-classroom?fresh=1`, tc)).text(), new RegExp(`<option value="${id}">Maths 4B</option>`));

  const before = fake.stats.revoke;
  const d = await post('/api/google-classroom/disconnect', {}, tc);
  assert.equal(d.status, 200);
  assert.equal(fake.stats.revoke, before + 1); assert.ok(!fake.refreshTokens.has(rt), 'revoked at Google');
  assert.equal(GC.connectionOf(teacher.id), null);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE actor_id=? AND action='gclassroom.disconnect'", teacher.id));
});

test('connect refuses: no GOOGLE_TOKEN_KEY, a scope left unticked, no refresh token, a cancel on Google\'s screen', async () => {
  const { c, teacher, tc } = school();
  config.googleTokenKey = null;
  const off = await post('/api/google-classroom/connect', { back: c.id }, tc);
  assert.equal(off.status, 400); assert.match((await off.json()).error, /isn't set up/);
  assert.match(await (await get(`/class/${c.id}/google-classroom`, tc)).text(), /isn(&#39;|')t set up on this site yet/);
  config.googleTokenKey = ON.googleTokenKey;
  assert.match(loc(await connect(tc, c.id, { dropScope: REQUIRED_SCOPES[1] })), /gcerr=scopesMissing/);
  assert.match(loc(await connect(tc, c.id, { noRefresh: true })), /gcerr=noRefresh/);
  assert.match(loc(await connect(tc, c.id, { cancel: true })), /gcerr=cancelled/);
  assert.equal(GC.connectionOf(teacher.id), null, 'nothing stored');
  assert.match(await (await get(`/class/${c.id}/google-classroom?gcerr=scopesMissing`, tc)).text(), /check both boxes/);
  // A start link from someone else's session is refused.
  const r = await post('/api/google-classroom/connect', { back: c.id }, tc);
  const other = school();
  assert.equal(loc(await get((await r.json()).redirect, other.tc)), '/teach');
});

test('link: only a course the teacher teaches; courses come page by page', async () => {
  const { c, tc } = school();
  await connect(tc, c.id);
  for (let i = 0; i < 55; i++) course([], { name: `Filler ${i}` });
  const mine = course([], { name: 'Science 4B', section: 'Room 2' });
  const notMine = course([], { name: 'Not mine', teaches: false });
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: '' }, tc)).status, 400);
  const bad = await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: notMine }, tc);
  assert.equal(bad.status, 400); assert.match((await bad.json()).error, /isn't one you teach/);
  const ok = await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: mine }, tc);
  assert.equal(ok.status, 200); assert.match((await ok.json()).toast, /Linked to Science 4B/);
  assert.equal(GC.linkOf(c.id).course_id, mine);
  assert.ok(room.calls.some(x => x.path === '/v1/courses' && x.query.pageToken === '50'), 'read the second page');
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/unlink`, {}, tc)).status, 200);
  assert.equal(GC.linkOf(c.id), null);
});

test('unlink then link another Classroom class: posts to the old one stop counting, the lesson can be posted again, grades go to the new one', async () => {
  const { c, cl, steps, kid, tc } = school();
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '220000000000000000001', kid.id, 'kid2@dwes.test', 'dwes.test', Date.now());
  const first = course([{ userId: '220000000000000000001', fullName: 'Kid Here' }], { name: 'Class 4B (old)' });
  const second = course([{ userId: '220000000000000000001', fullName: 'Kid Here' }], { name: 'Science club' });
  await connect(tc, c.id);
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: first }, tc);
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc)).status, 200);
  const oldCw = GC.postOf(cl.id).coursework_id;
  assert.equal(room.courseWork.get(oldCw).courseId, first);
  // Unlink, then relink the same class: the post is still there.
  await post(`/api/classes/${c.id}/google-classroom/unlink`, {}, tc);
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: first }, tc);
  assert.equal(GC.postOf(cl.id).coursework_id, oldCw);
  // Unlink, then link another class: the old post doesn't count.
  await post(`/api/classes/${c.id}/google-classroom/unlink`, {}, tc);
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).status, 400, 'not linked: no grades anywhere');
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: second }, tc);
  assert.equal(GC.postOf(cl.id), null);
  assert.equal(GC.postsOfClass(c.id).size, 0);
  let pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.doesNotMatch(pg, new RegExp(`classroom\\.google\\.com/c/${first}`), 'no link to the old class');
  assert.match(pg, new RegExp(`/api/class-lessons/${cl.id}/google-classroom/post`), 'the Post button is back');
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).status, 400, 'post it to the new class first');
  const r = await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.equal(r.status, 200);
  const p = GC.postOf(cl.id);
  assert.equal(p.course_id, second); assert.notEqual(p.coursework_id, oldCw);
  assert.equal(room.courseWork.get(p.coursework_id).courseId, second);
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok);
  const before = room.calls.length;
  await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc);
  const gradeCalls = room.calls.slice(before).filter(z => /studentSubmissions/.test(z.path));
  assert.ok(gradeCalls.length >= 2);
  assert.ok(gradeCalls.every(z => z.path.startsWith(`/v1/courses/${second}/courseWork/${p.coursework_id}/`)), 'grades only to the new class');
  pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, new RegExp(`classroom\\.google\\.com/c/${second}/a/${p.coursework_id}`));
});

test('deleting a class or a lesson takes its Classroom link, posts and log with it; the sweep clears leftovers', async () => {
  const { c, s, teacher, lesson, cl, tc } = school();
  const id = course([]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.ok(GC.postOf(cl.id));
  assert.ok(L.deleteLesson(teacher, lesson.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM gc_posts WHERE class_lesson_id=?', cl.id).n, 0);
  // A class with no students ever can be deleted: a fresh one.
  const c2 = S.createClass({ id: teacher.id }, s.id, { name: 'Club' }).class;
  await post(`/api/classes/${c2.id}/google-classroom/link`, { courseId: id }, tc);
  const l2 = L.createLesson(teacher, s.id, { title: 'Club day' }).lesson;
  const cl2 = L.assign(teacher, c2.id, l2.id, {}).classLesson;
  await post(`/api/class-lessons/${cl2.id}/google-classroom/post`, {}, tc);
  assert.ok(S.deleteClass(teacher, c2.id).ok);
  for (const t of ['gc_links', 'gc_posts', 'gc_syncs', 'gc_pending']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${t} WHERE class_id=?`, c2.id).n, 0, t);
  // Rows left by some other way of removing a class: the sweep takes them.
  q.run("INSERT INTO gc_links(class_id, course_id, course_name, linked_by, linked_at) VALUES ('gone-class', '1', 'Gone', ?, ?)", teacher.id, Date.now());
  q.run("INSERT INTO gc_posts(class_lesson_id, class_id, course_id, coursework_id, posted_by, posted_at) VALUES ('gone-cl', 'gone-class', '1', '2', ?, ?)", teacher.id, Date.now());
  GC.sweepSyncs();
  assert.equal(q.get("SELECT COUNT(*) n FROM gc_links WHERE class_id='gone-class'").n, 0);
  assert.equal(q.get("SELECT COUNT(*) n FROM gc_posts WHERE class_lesson_id='gone-cl'").n, 0);
});

/** Sign in with Google as this account (fake Google) -> the callback reply. */
async function googleSignIn(email, sub, hd) {
  const st = await get('/auth/google/start');
  const to = new URL(loc(st)); to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', email); to.searchParams.set('fake_sub', sub);
  if (hd !== undefined) to.searchParams.set('fake_hd', hd);
  const cb = new URL(loc(await fetch(to, { redirect: 'manual' })));
  return get(cb.pathname + cb.search, cookieOf(st, 'brb_gflow'));
}

test('roster import: matched by Google account; new ones wait and get a school account (real name staff-only) when they sign in on the school domain', async () => {
  const x = school();
  const { c, s, admin, tc } = x;
  // Already signed in with Google once (a school account of this school, not in the class yet).
  const known = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Dee Known' }).user;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '200000000000000000001', known.id, 'dee@dwes.test', 'dwes.test', Date.now());
  // An own account outside the school; the other teacher (staff).
  const own = createUser({ username: uname('Own'), password: 'own-pass-12345' });
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '200000000000000000002', own.id, 'own@gmail.test', '', Date.now());
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '200000000000000000003', x.other.id, 'oth@dwes.test', 'dwes.test', Date.now());
  const id = course([{ userId: '200000000000000000001', fullName: 'Dee Known' }, { userId: '200000000000000000002', fullName: 'Owen Own' },
    { userId: '200000000000000000003', fullName: 'Mx Other' }, { userId: '200000000000000000004', fullName: 'Eve Newcomer' }, { userId: '200000000000000000004', fullName: 'Eve Newcomer' },
    { userId: '200000000000000000005', fullName: 'Pat Personal' }]);
  await connect(tc, c.id);
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  const users = q.get('SELECT COUNT(*) n FROM users').n;
  const r = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(r.status, 200);
  assert.match((await r.json()).toast, /^1 student added · 2 will join when they first sign in with Google on your school's domain · 1 uses their own account.*· 1 is staff here$/);
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users, 'no account is made before the student signs in (their domain is unknown)');
  assert.equal(G.identityBySub('200000000000000000004'), null, 'their Google id stays free');
  assert.equal(GC.pendingCount(c.id), 2);
  assert.ok(S.classMember(c.id, known.id));
  assert.ok(!S.classMember(c.id, own.id)); assert.ok(!S.classMember(c.id, x.other.id) || S.classMember(c.id, x.other.id).role !== 'student');
  // Again: nothing new.
  const again = await (await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).json();
  assert.match(again.toast, /^0 students added · 2 will join .* · 1 already here/);
  // The page says who's waiting (a count); the sync log shows counts, never names.
  const pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, /2 students from Classroom haven(&#39;|')t signed in yet/);
  assert.match(pg, /Imported students/); assert.doesNotMatch(pg.split('id="gc-log"')[1], /Eve|Owen|Dee|Pat/);
  // Pat signs in with a personal Google account (not the school's domain): no school account, no class, the id stays free.
  const pat = await googleSignIn('pat@gmail.test', '200000000000000000005', '');
  assert.equal(cookieOf(pat, 'brb_session'), '', `not signed in: ${loc(pat)}`);
  assert.equal(G.identityBySub('200000000000000000005'), null);
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users);
  // Eve signs in with Google on the school's domain: her school account is made then, and she lands in the class.
  const done = await googleSignIn('eve@dwes.test', '200000000000000000004');
  assert.ok(cookieOf(done, 'brb_session'), `signed in: ${loc(done)}`);
  assert.equal(loc(done), `/class/${c.id}`);
  const eve = getUser(G.identityBySub('200000000000000000004').user_id);
  assert.equal(eve.managed_school, s.id); assert.equal(eve.password_hash, null);
  assert.doesNotMatch(eve.display_name, /Eve/, 'the Google name is never the public name');
  assert.equal(S.membership(s.id, eve.id).roster_name, 'Eve Newcomer', 'the real name is the staff-only roster name');
  assert.equal(S.membership(s.id, eve.id).role, 'student');
  assert.ok(S.classMember(c.id, eve.id));
  assert.equal(G.identityBySub('200000000000000000004').email, 'eve@dwes.test');
  assert.equal(GC.pendingCount(c.id), 1, 'only Pat still waits');
  // Pat leaves the Classroom class: the next import stops waiting for them. Unlinking clears the rest.
  room.courses.get(id).students = room.courses.get(id).students.filter(z => z.userId !== '200000000000000000005');
  await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(GC.pendingCount(c.id), 0);
  room.addStudent(id, { userId: '200000000000000000006', fullName: 'Sam Later' });
  await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(GC.pendingCount(c.id), 1);
  await post(`/api/classes/${c.id}/google-classroom/unlink`, {}, tc);
  assert.equal(GC.pendingCount(c.id), 0);
});

test('a waiting student who signs in after 30 days, or whose school is on another domain, gets no account', async () => {
  const { c, tc } = school();
  const id = course([{ userId: '210000000000000000001', fullName: 'Old Wait' }, { userId: '210000000000000000002', fullName: 'Wrong Dom' }]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  q.run('UPDATE gc_pending SET created_at=? WHERE sub=?', Date.now() - 31 * DAY, '210000000000000000001');
  GC.sweepSyncs();
  assert.equal(GC.pendingCount(c.id), 1);
  const old = await googleSignIn('old@dwes.test', '210000000000000000001');
  assert.equal(cookieOf(old, 'brb_session'), ''); assert.equal(G.identityBySub('210000000000000000001'), null);
  const wrong = await googleSignIn('wd@elsewhere.test', '210000000000000000002');
  assert.equal(cookieOf(wrong, 'brb_session'), ''); assert.equal(G.identityBySub('210000000000000000002'), null);
  assert.equal(GC.pendingCount(c.id), 1, 'still waiting for the right domain');
});

test('roster import without the school\'s Google domains adds known students only, and says why', async () => {
  const { c, tc } = school({ domains: [] });
  const id = course([{ userId: '300000000000000000001', fullName: 'Fay New' }]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  assert.match(await (await get(`/class/${c.id}/google-classroom`, tc)).text(), /hasn(&#39;|')t added its Google domain yet/);
  const r = await (await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).json();
  assert.match(r.toast, /1 not added: add your school's Google domain first/);
  assert.equal(G.identityBySub('300000000000000000001'), null);
});

test('post a lesson: coursework with the title, a link back and the due date, never names; assign can post too', async () => {
  const { c, s, teacher, cl, tc } = school();
  const id = course([]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  const r = await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.equal(r.status, 200); assert.match((await r.json()).toast, /^Posted to Google Classroom\.$/);
  const call = room.calls.findLast(x => x.method === 'POST');
  assert.equal(call.body.title, 'Fractions day'); assert.equal(call.body.maxPoints, 100); assert.equal(call.body.workType, 'ASSIGNMENT');
  assert.equal(call.body.materials[0].link.url, `${base}/class/${c.id}/lessons/${cl.id}`);
  assert.deepEqual(Object.keys(call.body.dueDate), ['year', 'month', 'day']); assert.equal(call.body.dueTime.hours, 23);
  assert.doesNotMatch(JSON.stringify(call.body), /Kid Here|Mr Teach/);
  assert.ok(GC.postOf(cl.id).coursework_id);
  assert.match(GC.postOf(cl.id).link, /^https:\/\/classroom\.google\.com\//);
  const twice = await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.equal(twice.status, 400); assert.match((await twice.json()).error, /already in Google Classroom/);
  // The Lessons tab's assign form has "Also post"; assigning with it posts the new lesson (a past due date is left off).
  const l2 = L.createLesson(teacher, s.id, { title: 'Decimals' }).lesson;
  const tab = await (await get(`/class/${c.id}`, tc)).text();
  assert.match(tab, /name="gcPost" value="1">/, 'the box is there, unticked');
  const a = await (await post(`/api/classes/${c.id}/lessons`, { lessonId: l2.id, dueAt: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10), gcPost: '1' }, tc)).json();
  assert.match(a.toast, /Assigned to Class 4B · Posted to Google Classroom \(without a due date/);
  assert.equal(room.calls.findLast(x => x.method === 'POST').body.dueDate, undefined);
  // Without the box: not posted.
  const l3 = L.createLesson(teacher, s.id, { title: 'Percent' }).lesson;
  const posts = room.calls.filter(x => x.method === 'POST').length;
  await post(`/api/classes/${c.id}/lessons`, { lessonId: l3.id }, tc);
  assert.equal(room.calls.filter(x => x.method === 'POST').length, posts);
  // A lesson that opens later: a Classroom draft scheduled for the day it opens, not published straight away.
  const l4 = L.createLesson(teacher, s.id, { title: 'Later on' }).lesson;
  const opens = new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10);
  const later = await (await post(`/api/classes/${c.id}/lessons`, { lessonId: l4.id, opensAt: opens, dueAt: new Date(Date.now() + 9 * DAY).toISOString().slice(0, 10), gcPost: '1' }, tc)).json();
  assert.match(later.toast, /Scheduled in Google Classroom: students see it on/);
  const body = room.calls.findLast(x => x.method === 'POST').body;
  assert.equal(body.state, 'DRAFT');
  assert.ok(Date.parse(body.scheduledTime) > Date.now() + 2 * DAY, body.scheduledTime);
  assert.ok(body.dueDate);
  // One that is already open: published now.
  assert.equal(room.calls.filter(x => x.method === 'POST').find(x => x.body.title === 'Fractions day').body.state, 'PUBLISHED');
});

test('send grades: each matched student\'s score as a draft or assigned grade; not started and unmatched are counted', async () => {
  const x = school();
  const { c, s, admin, cl, steps, tc, kid } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '400000000000000000001', kid.id, 'kid@dwes.test', 'dwes.test', Date.now());
  const idle = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Ida Idle' }).user;
  S.addToClass({ id: admin.id }, c.id, idle.id, 'student');
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '400000000000000000002', idle.id, 'ida@dwes.test', 'dwes.test', Date.now());
  const id = course([{ userId: '400000000000000000001', fullName: 'Kid Here' }, { userId: '400000000000000000002', fullName: 'Ida Idle' }, { userId: '400000000000000000009', fullName: 'Not Here' }]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).status, 400, 'post it first');
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok);
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'nope' }, tc)).status, 400);
  const r = await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json();
  assert.match(r.toast, /1 completion grade sent · 1 hasn't started · 1 not in this class/);
  const cw = room.courseWork.get(GC.postOf(cl.id).coursework_id);
  const kidSub = cw.submissions.find(z => z.userId === '400000000000000000001');
  assert.equal(kidSub.draftGrade, 50); assert.equal(kidSub.assignedGrade, undefined);
  assert.ok(P.markDone(kid, cl.id, steps[1].id).ok);
  await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'assigned' }, tc);
  assert.equal(kidSub.draftGrade, 100); assert.equal(kidSub.assignedGrade, 100);
  assert.match(room.calls.findLast(z => z.method === 'PATCH').query.updateMask, /^draftGrade,assignedGrade$/);
  const pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, /Assigned completion grades sent/); assert.match(pg, /Sent grades/); assert.match(pg, /Send completion grades/);
  // One grade Google won't take: the rest still go, and the page says so.
  room.failNext(500, { match: /PATCH/ });
  const part = await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json();
  assert.match(part.toast, /0 completion grades sent.*1 didn't go through/);
  assert.equal(syncs(c.id, 'grades').at(-1).status, 'partial');
});

test('errors: an expired access token is refreshed once; a token revoked at Google asks to connect again; Google refusing is explained', async () => {
  const { c, teacher, tc } = school();
  const id = course([]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  const refreshes = fake.stats.refresh;
  room.failNext(401, { match: /students/ });
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 200, 'retried with a new token');
  assert.equal(fake.stats.refresh, refreshes + 1);
  room.failNext(403, { match: /students/, statusText: 'PERMISSION_DENIED' });
  const denied = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(denied.status, 400); assert.match((await denied.json()).error, /Google Classroom said no/);
  room.failNext(429, { match: /students/ });
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 429);
  assert.equal(syncs(c.id, 'roster').at(-1).error, 'rateLimited');
  // The teacher removed the app in their Google account: the refresh token stops working.
  fake.refreshTokens.clear(); GC._forget();
  const gone = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(gone.status, 400); assert.match((await gone.json()).error, /stopped working/);
  assert.equal(GC.connectionState(teacher.id), 'reconnect');
  assert.match(await (await get(`/class/${c.id}/google-classroom`, tc)).text(), /Connect again/);
  // A new GOOGLE_TOKEN_KEY: stored tokens can't be read, so connect again.
  await connect(tc, c.id);
  assert.equal(GC.connectionState(teacher.id), 'ok');
  config.googleTokenKey = Buffer.alloc(32, 5);
  assert.equal(GC.connectionState(teacher.id), 'reconnect');
});

test('rate limits: 20 roster imports an hour per class; the sync log is audited and swept after 180 days', async () => {
  const { c, teacher, tc } = school();
  const id = course([]);
  await connect(tc, c.id); await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  for (let i = 0; i < 20; i++) assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 200);
  const r = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(r.status, 429); assert.match((await r.json()).error, /Too many syncs/);
  assert.ok(q.get("SELECT COUNT(*) n FROM audit_log WHERE actor_id=? AND action='gclassroom.roster'", teacher.id).n >= 20);
  q.run('UPDATE gc_syncs SET created_at=? WHERE class_id=?', Date.now() - 181 * DAY, c.id);
  assert.ok(GC.sweepSyncs() >= 20);
  assert.equal(GC.recentSyncs(c.id).length, 0);
});

test('the page uses the cached course list; only linking asks Google for a fresh one', async () => {
  const { c, tc } = school();
  const id = course([], { name: 'Cached course' });
  await connect(tc, c.id);
  const lists = () => room.calls.filter(x => x.method === 'GET' && x.path === '/v1/courses' && !x.query.pageToken).length;
  const n0 = lists();
  for (let i = 0; i < 5; i++) assert.equal((await get(`/class/${c.id}/google-classroom`, tc)).status, 200);
  assert.equal(lists(), n0 + 1, 'one fetch for five page views');
  // "Refresh the list" asks Google again (rate limited per teacher).
  const pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, new RegExp(`href="/class/${c.id}/google-classroom\\?fresh=1#gc-course"`));
  await get(`/class/${c.id}/google-classroom?fresh=1`, tc);
  assert.equal(lists(), n0 + 2);
  for (let i = 0; i < 40; i++) await get(`/class/${c.id}/google-classroom?fresh=1`, tc);
  assert.ok(lists() <= n0 + 31, 'at most 30 fresh lists an hour');
  const n1 = lists();
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  assert.equal(lists(), n1 + 1, 'linking checks a fresh list');
});

test('account deletion takes the stored token with it', async () => {
  const { c, teacher, tc } = school();
  await connect(tc, c.id);
  assert.ok(GC.connectionOf(teacher.id));
  GC.forgetUser(teacher.id);
  assert.equal(GC.connectionOf(teacher.id), null);
});

// ---------------------------------------------------------------- optional scopes
const pageOf = async (c, cookie, q = '') => (await get(`/class/${c.id}/google-classroom${q}`, cookie)).text();
/** A school, a connected teacher (write: the optional scopes too), the class linked to a course with these students. */
async function linked(students = [], { write = true, dropScope, ...o } = {}) {
  const x = school(o);
  const id = course(students);
  await connect(x.tc, x.c.id, { write, dropScope });
  assert.equal((await post(`/api/classes/${x.c.id}/google-classroom/link`, { courseId: id }, x.tc)).status, 200);
  return { ...x, id };
}

test('read-only connect works: link and import, and every write control is a note with "Allow Oomba Academy to post to Classroom"', async () => {
  const { c, s, teacher, cl, tc, kid, id } = await linked([{ userId: '600000000000000000001', fullName: 'Kid Here' }], { write: false });
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '600000000000000000001', kid.id, 'kid6@dwes.test', 'dwes.test', Date.now());
  assert.deepEqual(GC.grantedScopes(teacher.id).sort(), [...REQUIRED_SCOPES].sort(), 'only the read scopes are stored');
  assert.equal(GC.connectionState(teacher.id), 'ok');
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 200);
  assert.ok(id);
  const pg = await pageOf(c, tc);
  assert.match(pg, /Allow Oomba Academy to post to Classroom/);
  assert.match(pg, /name="write" value="1"/);
  for (const hidden of ['google-classroom/post"', 'google-classroom/grades"', 'google-classroom/material"', 'google-classroom/announce"', 'name="autoGrades" value="1" ', 'gc-topicform']) assert.ok(!pg.includes(hidden), `hidden: ${hidden}`);
  assert.match(pg, /To post lessons, send grades and share materials/);
  assert.match(pg, /To post announcements/);
  assert.match(pg, /Update the students from Classroom every 6 hours/, 'the roster refresh only needs the read scope');
  // The assign form has no "Also post" box, and the APIs say what's missing; Google is never asked to write.
  assert.doesNotMatch(await (await get(`/class/${c.id}`, tc)).text(), /name="gcPost"/);
  const writes = () => room.calls.filter(x => x.method !== 'GET').length;
  const w0 = writes();
  for (const p of [`/api/class-lessons/${cl.id}/google-classroom/post`, `/api/class-lessons/${cl.id}/google-classroom/material`]) {
    const r = await post(p, {}, tc); assert.equal(r.status, 400); assert.equal((await r.json()).code, 'needsScope');
  }
  assert.equal((await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json()).code, 'needsScope');
  assert.equal((await (await post(`/api/classes/${c.id}/google-classroom/announce`, { template: 'free', note: 'Hello' }, tc)).json()).code, 'needsScope');
  assert.equal((await (await post(`/api/classes/${c.id}/google-classroom/auto`, { autoRoster: '1', autoGrades: '1', mode: 'draft' }, tc)).json()).code, 'needsScope');
  // Posting from the assign form with the box sent anyway: nothing goes.
  const l2 = L.createLesson(teacher, s.id, { title: 'Sneaky' }).lesson;
  const a = await (await post(`/api/classes/${c.id}/lessons`, { lessonId: l2.id, gcPost: '1' }, tc)).json();
  assert.match(a.toast, /isn't allowed to do this/);
  assert.equal(writes(), w0, 'no write call reached Google');
});

test('the upgrade: "Allow" asks for the optional scopes; unticked ones stay off; scopes are re-read at every refresh', async () => {
  const { c, teacher, tc } = await linked([], { write: false });
  // Nothing new ticked: posting stays off.
  assert.match(loc(await connect(tc, c.id, { dropScope: Object.values(OPTIONAL_SCOPES) })), /gcerr=noneAllowed/);
  assert.equal(GC.can(teacher.id, 'coursework'), false);
  // Everything but announcements.
  const r = await connect(tc, c.id, { dropScope: OPTIONAL_SCOPES.announce });
  assert.equal(loc(r), `/class/${c.id}/google-classroom?gc=allowed#gc-connect`);
  assert.deepEqual(GC.missingOptional(teacher.id), ['announce']);
  let pg = await pageOf(c, tc, '?gc=allowed');
  assert.match(pg, /Oomba Academy may now post to your Classroom/);
  assert.match(pg, /Post to Google Classroom/); assert.match(pg, /Share as material/); assert.match(pg, /gc-topicform/);
  assert.match(pg, /To post announcements, allow Oomba Academy/, 'announcements are still a note with the button');
  assert.match(pg, /Some of these are off/);
  // Google narrows what the token may do (the teacher took a scope back at Google): the next refresh says so.
  const row = q.get('SELECT token_enc FROM gc_connections WHERE user_id=?', teacher.id);
  const rt = fake.refreshTokens.get(GC.unseal(teacher.id, row.token_enc));
  rt.scope = rt.scope.split(' ').filter(x => x !== OPTIONAL_SCOPES.coursework).join(' ');
  GC._forget();
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 200);
  assert.equal(GC.can(teacher.id, 'coursework'), false, 're-read from the refresh');
  assert.equal(GC.can(teacher.id, 'materials'), true);
  pg = await pageOf(c, tc);
  assert.doesNotMatch(pg, /google-classroom\/post"/); assert.match(pg, /Share as material/);
  // A write Google refuses for a missing scope forgets that scope too.
  room.failNext(403, { match: /courseWorkMaterials/, body: { error: { code: 403, status: 'PERMISSION_DENIED', message: 'Request had insufficient authentication scopes.', details: [{ reason: 'ACCESS_TOKEN_SCOPE_INSUFFICIENT' }] } } });
  const cl = L.classPlan(c.id).flatMap(g => g.lessons)[0];
  const m = await post(`/api/class-lessons/${cl.id}/google-classroom/material`, {}, tc);
  assert.equal(m.status, 400); assert.equal((await m.json()).code, 'needsScope');
  assert.equal(GC.can(teacher.id, 'materials'), false);
  // Without a read scope the connection needs connecting again.
  rt.scope = rt.scope.split(' ').filter(x => x !== REQUIRED_SCOPES[1]).join(' ');
  GC._forget();
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 400);
  assert.equal(GC.connectionState(teacher.id), 'reconnect');
});

// ---------------------------------------------------------------- automatic grades
test('automatic grades: only changed grades go, every 30 minutes, within the rate limit; a revoked token pauses them and the page says "Reconnect Classroom"', async () => {
  const x = await linked([{ userId: '610000000000000000001', fullName: 'Kid Here' }, { userId: '610000000000000000002', fullName: 'Bea Busy' }, { userId: '610000000000000000003', fullName: 'Ned Notours' }]);
  const { c, s, admin, cl, steps, tc, kid, teacher } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '610000000000000000001', kid.id, 'kid61@dwes.test', 'dwes.test', Date.now());
  const bea = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Bea Busy' }).user;
  S.addToClass({ id: admin.id }, c.id, bea.id, 'student');
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '610000000000000000002', bea.id, 'bea@dwes.test', 'dwes.test', Date.now());
  // In the Oomba class and signed in with Google, but not on the teacher's Classroom roster: never sent.
  const out = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Olly Outside' }).user;
  S.addToClass({ id: admin.id }, c.id, out.id, 'student');
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '610000000000000000099', out.id, 'olly@dwes.test', 'dwes.test', Date.now());
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc)).status, 200);
  // Off by default: nothing happens.
  assert.equal(GC.linkOf(c.id).auto_grades, '');
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok); assert.ok(P.markDone(bea, cl.id, steps[0].id).ok); assert.ok(P.markDone(out, cl.id, steps[0].id).ok);
  const patches = () => room.calls.filter(z => z.method === 'PATCH');
  let n0 = patches().length;
  await GC.autoGrades();
  assert.equal(patches().length, n0, 'off: nothing sent');
  // Turned on (draft): the page shows it; the first run sends both started students on the roster.
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/auto`, { autoRoster: '1', autoGrades: '1', mode: 'draft' }, tc)).status, 200);
  assert.match(await pageOf(c, tc), /name="autoGrades" value="1" checked/);
  await GC.autoGrades();
  assert.equal(patches().length, n0 + 2);
  const cw = room.courseWork.get(GC.postOf(cl.id).coursework_id);
  const subOf = sub => cw.submissions.find(z => z.userId === sub);
  assert.equal(subOf('610000000000000000001').draftGrade, 50); assert.equal(subOf('610000000000000000002').draftGrade, 50);
  assert.ok(!cw.submissions.some(z => z.userId === '610000000000000000099'), 'Olly is not on the roster');
  assert.equal(syncs(c.id, 'autoGrades').length, 1);
  // Nothing changed: no call to Google at all.
  n0 = room.calls.length;
  await GC.autoGrades();
  assert.equal(room.calls.length, n0, 'unchanged: Google is not asked');
  // Kid does the second step: only Kid's grade goes.
  await new Promise(r => setTimeout(r, 5));
  assert.ok(P.markDone(kid, cl.id, steps[1].id).ok);
  n0 = patches().length;
  await GC.autoGrades();
  assert.equal(patches().length, n0 + 1, 'only the changed grade');
  assert.equal(subOf('610000000000000000001').draftGrade, 100);
  // A sent-by-hand grade counts as sent: the automatic run doesn't send it again.
  await new Promise(r => setTimeout(r, 5));
  assert.ok(P.markDone(bea, cl.id, steps[1].id).ok);
  await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc);
  n0 = patches().length;
  await GC.autoGrades();
  assert.equal(patches().length, n0, 'already sent by hand');
  // Switching to assigned grades sends them again, as assigned.
  await post(`/api/classes/${c.id}/google-classroom/auto`, { autoRoster: '1', autoGrades: '1', mode: 'assigned' }, tc);
  await GC.autoGrades();
  assert.equal(subOf('610000000000000000001').assignedGrade, 100); assert.equal(subOf('610000000000000000002').assignedGrade, 100);
  // The teacher's 60 syncs an hour are shared: none left, nothing goes and no back-off.
  q.run('DELETE FROM gc_grades WHERE class_lesson_id=?', cl.id); q.run('UPDATE gc_posts SET auto_at=NULL WHERE class_lesson_id=?', cl.id);
  for (let i = 0; i < 60; i++) RL.allow(`gc-sync:${teacher.id}`, 60, 3600e3);
  n0 = room.calls.length;
  await GC.autoGrades();
  assert.equal(room.calls.length, n0); assert.equal(GC.linkOf(c.id).auto_fails, 0);
  RL._reset();
  // A lesson due more than 30 days ago gets no more automatic grades.
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.now() - 32 * DAY, cl.id);
  n0 = room.calls.length;
  await GC.autoGrades();
  assert.equal(room.calls.length, n0, '30 days after the due date: stopped');
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.now() + 7 * DAY, cl.id);
  // The teacher removed the app at Google: the run stops, the connection asks to reconnect, later runs don't call Google.
  fake.refreshTokens.clear(); GC._forget();
  await GC.autoGrades();
  assert.equal(GC.connectionState(teacher.id), 'reconnect');
  n0 = room.calls.length;
  await GC.autoGrades(Date.now() + DAY);
  assert.equal(room.calls.length, n0, 'paused');
  const pg = await pageOf(c, tc);
  assert.match(pg, /Automatic grades are paused: your Google Classroom connection stopped working/);
  assert.match(pg, /Reconnect Classroom/);
  // Connecting again resumes them.
  await connect(tc, c.id);
  assert.equal(GC.autoPaused(GC.linkOf(c.id)), '');
  const p0 = patches().length;
  await GC.autoGrades();
  assert.ok(patches().length > p0);
  // Disconnecting turns them off.
  await post('/api/google-classroom/disconnect', {}, tc);
  assert.equal(GC.linkOf(c.id).auto_grades, '');
});

test('automatic grades back off after an error, and someone else saving the roster switch keeps who sends them', async () => {
  const x = await linked([{ userId: '620000000000000000001', fullName: 'Kid Here' }]);
  const { c, cl, steps, tc, kid, teacher, ac } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '620000000000000000001', kid.id, 'kid62@dwes.test', 'dwes.test', Date.now());
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  await post(`/api/classes/${c.id}/google-classroom/auto`, { autoRoster: '1', autoGrades: '1', mode: 'draft' }, tc);
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok);
  room.failNext(503, { match: /studentSubmissions/ });
  const t = Date.now();
  await GC.autoGrades(t);
  const lk = GC.linkOf(c.id);
  assert.equal(lk.auto_fails, 1); assert.ok(lk.auto_next_at >= t + 60 * 60e3, 'an hour before the next try');
  assert.match(await pageOf(c, tc), /paused after an error/);
  const n0 = room.calls.length;
  await GC.autoGrades(t + 10 * 60e3);
  assert.equal(room.calls.length, n0, 'waits');
  await GC.autoGrades(t + 2 * 3600e3);
  assert.equal(GC.linkOf(c.id).auto_fails, 0);
  // The school admin (Classroom connected read-only) changes only the roster switch: grades keep going with the teacher's.
  await connect(ac, c.id, { write: false });
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/auto`, { autoGrades: '1', mode: 'draft' }, ac)).status, 200);
  assert.equal(GC.linkOf(c.id).auto_by, teacher.id); assert.equal(GC.linkOf(c.id).auto_roster, 0);
});

// ---------------------------------------------------------------- automatic roster
test('roster refresh: every 6 hours new students are added; students who left Classroom are listed, never removed on their own', async () => {
  const x = await linked([{ userId: '630000000000000000001', fullName: 'Kid Here' }]);
  const { c, s, admin, tc, kid } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '630000000000000000001', kid.id, 'kid63@dwes.test', 'dwes.test', Date.now());
  const imports = () => room.calls.filter(z => z.method === 'GET' && /\/students$/.test(z.path)).length;
  // Not before a first import by hand.
  let n0 = imports();
  await GC.autoRoster(Date.now() + 7 * 3600e3);
  assert.equal(imports(), n0);
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).status, 200);
  assert.match(await pageOf(c, tc), /Roster updated just now/);
  // Not before 6 hours.
  n0 = imports();
  await GC.autoRoster();
  assert.equal(imports(), n0);
  // A new student (known to Oomba) joins the Classroom class, Kid leaves it.
  const neu = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Nia New' }).user;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '630000000000000000002', neu.id, 'nia@dwes.test', 'dwes.test', Date.now());
  room.courses.get(x.id).students = [{ userId: '630000000000000000002', fullName: 'Nia New' }];
  const r = await GC.autoRoster(Date.now() + 6 * 3600e3 + 60e3);
  assert.equal(r.imported, 1);
  assert.ok(S.classMember(c.id, neu.id), 'the new student is added');
  assert.ok(S.classMember(c.id, kid.id), 'the student who left is NOT removed');
  assert.deepEqual(GC.leavers(c.id).map(z => z.user_id), [kid.id]);
  assert.equal(syncs(c.id, 'autoRoster').at(-1).status, 'ok');
  const pg = await pageOf(c, tc);
  assert.match(pg, /No longer in Google Classroom/); assert.match(pg, /Kid Here/); assert.match(pg, /Remove from class/);
  assert.match(pg, /1 no longer in Google Classroom/);
  // Remove: out of the class, off the list. (Another leaver kept: stays in the class, off the list.)
  const bad = await post(`/api/classes/${c.id}/google-classroom/leavers`, { userId: neu.id, action: 'remove' }, tc);
  assert.equal(bad.status, 400, 'only students who left can be removed from here');
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/leavers`, { userId: kid.id, action: 'remove' }, tc)).status, 200);
  assert.ok(!S.classMember(c.id, kid.id)); assert.equal(GC.leavers(c.id).length, 0);
  room.courses.get(x.id).students = [];
  await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/leavers`, { userId: neu.id, action: 'keep' }, tc)).status, 200);
  assert.ok(S.classMember(c.id, neu.id)); assert.equal(GC.leavers(c.id).length, 0);
  // Turned off: the job leaves the class alone.
  await post(`/api/classes/${c.id}/google-classroom/auto`, {}, tc);
  assert.equal(GC.linkOf(c.id).auto_roster, 0);
  n0 = imports();
  await GC.autoRoster(Date.now() + 13 * 3600e3);
  assert.equal(imports(), n0);
});

// ---------------------------------------------------------------- topics and materials
test('topics: made once per linked course, reused, made again when deleted in Classroom, renamed; none without the scope', async () => {
  const x = await linked([]);
  const { c, s, teacher, cl, tc } = x;
  const made = () => room.calls.filter(z => z.method === 'POST' && /\/topics$/.test(z.path)).length;
  const n0 = made();
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  assert.equal(made(), n0 + 1);
  const topicId = GC.linkOf(c.id).topic_id;
  assert.equal(room.topics.get(topicId).name, 'Oomba Academy');
  assert.equal(room.calls.findLast(z => z.method === 'POST' && /courseWork$/.test(z.path)).body.topicId, topicId);
  // A second post (and a material) reuse it.
  await post(`/api/class-lessons/${cl.id}/google-classroom/material`, {}, tc);
  const cl2 = L.assign(teacher, c.id, L.createLesson(teacher, s.id, { title: 'Two' }).lesson.id, {}).classLesson;
  await post(`/api/class-lessons/${cl2.id}/google-classroom/post`, {}, tc);
  assert.equal(made(), n0 + 1, 'made once');
  assert.equal(room.calls.findLast(z => z.method === 'POST' && /courseWorkMaterials$/.test(z.path)).body.topicId, topicId);
  // Renamed here: renamed in Classroom too.
  assert.equal((await post(`/api/classes/${c.id}/google-classroom/topic`, { name: 'Maths games' }, tc)).status, 200);
  assert.equal(room.topics.get(topicId).name, 'Maths games');
  // Deleted in Classroom: made again (with the class's name for it).
  room.topics.delete(topicId);
  const cl3 = L.assign(teacher, c.id, L.createLesson(teacher, s.id, { title: 'Three' }).lesson.id, {}).classLesson;
  assert.equal((await post(`/api/class-lessons/${cl3.id}/google-classroom/post`, {}, tc)).status, 200);
  assert.equal(made(), n0 + 2);
  const again = GC.linkOf(c.id).topic_id;
  assert.notEqual(again, topicId); assert.equal(room.topics.get(again).name, 'Maths games');
  // A topic of that name already there (made by hand): used, not duplicated.
  q.run('UPDATE gc_links SET topic_id=NULL WHERE class_id=?', c.id);
  const cl4 = L.assign(teacher, c.id, L.createLesson(teacher, s.id, { title: 'Four' }).lesson.id, {}).classLesson;
  await post(`/api/class-lessons/${cl4.id}/google-classroom/post`, {}, tc);
  assert.equal(GC.linkOf(c.id).topic_id, again);
  assert.equal(GC.topicNameOf({ topic_name: '' }, 'Oomba Academy‏'), 'Oomba Academy', 'no direction marks go to Google');
  // Without the topics scope: posted without a topic, as before.
  const y = await linked([], { dropScope: OPTIONAL_SCOPES.topics });
  const m0 = made();
  assert.equal((await post(`/api/class-lessons/${y.cl.id}/google-classroom/post`, {}, y.tc)).status, 200);
  assert.equal(made(), m0);
  assert.equal(room.calls.findLast(z => z.method === 'POST' && /courseWork$/.test(z.path)).body.topicId, undefined);
  assert.doesNotMatch(await pageOf(y.c, y.tc), /gc-topicform/);
});

test('materials: "Share as material" posts the title, the fixed line and the link, no grade or due date; once per lesson, next to the assignment', async () => {
  const { c, cl, tc } = await linked([]);
  const r = await post(`/api/class-lessons/${cl.id}/google-classroom/material`, {}, tc);
  assert.equal(r.status, 200); assert.match((await r.json()).toast, /as a material/);
  const call = room.calls.findLast(z => z.method === 'POST' && /courseWorkMaterials$/.test(z.path));
  assert.equal(call.body.title, 'Fractions day'); assert.equal(call.body.description, 'Open this lesson on Oomba Academy.');
  assert.equal(call.body.materials[0].link.url, `${base}/class/${c.id}/lessons/${cl.id}`);
  for (const k of ['maxPoints', 'dueDate', 'dueTime', 'workType']) assert.equal(call.body[k], undefined, k);
  assert.ok(GC.postOf(cl.id, 'material')); assert.equal(GC.postOf(cl.id), null, 'not an assignment');
  const twice = await post(`/api/class-lessons/${cl.id}/google-classroom/material`, {}, tc);
  assert.equal(twice.status, 400); assert.match((await twice.json()).error, /already shared as a material/);
  // The assignment can still be posted: one of each kind.
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc)).status, 200);
  assert.equal((await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc)).status, 400);
  assert.equal(q.get('SELECT COUNT(*) n FROM gc_posts WHERE class_lesson_id=?', cl.id).n, 2);
  const pg = await pageOf(c, tc);
  assert.match(pg, /Shared as material/); assert.match(pg, /Open material/); assert.match(pg, /Send completion grades/);
  assert.equal(syncs(c.id, 'material').length, 1);
});

// ---------------------------------------------------------------- announcements
test('announcements: only the template\'s fixed words and the teacher\'s note, never a student\'s name, at most 500 characters, 10 an hour', async () => {
  const x = await linked([]);
  const { c, s, teacher, cl, tc } = x;
  const ann = body => post(`/api/classes/${c.id}/google-classroom/announce`, body, tc);
  const last = () => room.calls.findLast(z => z.method === 'POST' && /announcements$/.test(z.path));
  // Free text: exactly the teacher's words (anything else in the request is ignored).
  let r = await ann({ template: 'free', note: '  Bring your  headphones tomorrow!\r\n\r\n\r\nThanks ', text: 'Kid Here scored 100%' });
  assert.equal(r.status, 200);
  assert.deepEqual(last().body, { text: 'Bring your headphones tomorrow!\n\nThanks', state: 'PUBLISHED' });
  // A student's name (full, first name, or username) is refused, and the form shows it under the message.
  for (const note of ['Well done Kid Here!', 'Well done kid!', `Hi ${x.kid.username}`]) {
    r = await ann({ template: 'free', note });
    assert.equal(r.status, 400, note); const j = await r.json(); assert.equal(j.code, 'hasName'); assert.equal(j.field, 'note');
  }
  assert.equal((await (await ann({ template: 'free', note: '' })).json()).code, 'emptyNote');
  assert.equal((await (await ann({ template: 'free', note: 'x'.repeat(501) })).json()).code, 'tooLong');
  assert.equal((await (await ann({ template: 'grades', note: 'hi' })).json()).code, 'badTemplate');
  // A lesson: its title and link, plus an optional note. Only an open lesson of this class.
  r = await ann({ template: 'lesson', clId: cl.id, note: 'Due Friday.' });
  assert.equal(r.status, 200);
  assert.equal(last().body.text, `📚 A new lesson is ready: Fractions day\n${base}/class/${c.id}/lessons/${cl.id}\n\nDue Friday.`);
  const other = school();
  assert.equal((await (await ann({ template: 'lesson', clId: other.cl.id })).json()).code, 'pickLesson');
  const later = L.assign(teacher, c.id, L.createLesson(teacher, s.id, { title: 'Later' }).lesson.id, { opensAt: new Date(Date.now() + 3 * DAY).toISOString().slice(0, 10) }).classLesson;
  assert.equal((await (await ann({ template: 'lesson', clId: later.id })).json()).code, 'lessonNotOpen');
  // A live game: only the code of a game open for this class (a typed code is never used).
  config.liveClassroom = true;
  try {
    assert.equal((await (await ann({ template: 'live', code: '7654321' })).json()).code, 'noLiveGame');
    assert.match(await pageOf(c, tc), /No live game is open for this class right now/);
    const sess = { id: 'gc-test-live', phase: 'lobby', audience: 'class', classId: c.id, code: '1234567', host: { userId: teacher.id }, seats: new Map(), cohosts: new Map() };
    LS._all().set(sess.id, sess);
    try {
      assert.equal(gcLiveAnnounce({ user: teacher }, sess), `/class/${c.id}/google-classroom?live=1#gc-announce`, 'the host screen links here');
      assert.equal(gcLiveAnnounce({ user: x.other }, sess), '', 'not for someone else');
      const pg = await pageOf(c, tc, '?live=1');
      assert.match(pg, /<details class="gc-tpl" open><summary>🎮/);
      assert.match(pg, /Join at http:\/\/127\.0\.0\.1:\d+\/join#1234567 with the code 1234567/);
      r = await ann({ template: 'live', code: '7654321', note: "Let's go!" });
      assert.equal(r.status, 200);
      assert.equal(last().body.text, `🎮 A live game is starting now! Join at ${base}/join#1234567 with the code 1234567.\n\nLet's go!`);
    } finally { LS._all().delete(sess.id); }
  } finally { config.liveClassroom = false; }
  // The log keeps the template and the length, never the text.
  const logged = syncs(c.id, 'announce');
  assert.ok(logged.length >= 3); assert.doesNotMatch(JSON.stringify(logged), /headphones|Friday|Let's go/);
  // 10 an hour per class (counting the 3 above).
  let sent = 3;
  for (let i = 0; i < 9; i++) { const z = await ann({ template: 'free', note: `Reminder ${i}` }); if (z.status === 200) sent++; else { assert.equal(z.status, 429); assert.match((await z.json()).error, /10 announcements in an hour/); } }
  assert.equal(sent, 10);
  assert.match(await pageOf(c, tc), /Oomba Academy adds only the words shown above/);
});

// ---------------------------------------------------------------- hardening: retries, big classes, the name check
test('automatic grades: a grade that didn\'t go through is tried again later (backing off) until it goes; grades that went are not sent again; the retries stop with the lesson\'s window', async () => {
  const x = await linked([{ userId: '640000000000000000001', fullName: 'Kid Here' }, { userId: '640000000000000000002', fullName: 'Bea Busy' }]);
  const { c, s, admin, cl, steps, tc, kid } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '640000000000000000001', kid.id, 'kid64@dwes.test', 'dwes.test', Date.now());
  const bea = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Bea Busy' }).user;
  S.addToClass({ id: admin.id }, c.id, bea.id, 'student');
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '640000000000000000002', bea.id, 'bea64@dwes.test', 'dwes.test', Date.now());
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  await post(`/api/classes/${c.id}/google-classroom/auto`, { autoRoster: '1', autoGrades: '1', mode: 'draft' }, tc);
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok); assert.ok(P.markDone(bea, cl.id, steps[0].id).ok);
  const cw = room.courseWork.get(GC.postOf(cl.id).coursework_id);
  const subOf = sub => cw.submissions.find(z => z.userId === sub);
  const patches = () => room.calls.filter(z => z.method === 'PATCH');
  // Kid's grade fails (Google answers 500 for that one submission); Bea's goes.
  room.failNext(500, { match: new RegExp(`PATCH .*/${subOf('640000000000000000001').id}$`) });
  const t = Date.now();
  await GC.autoGrades(t);
  assert.equal(subOf('640000000000000000001').draftGrade, undefined); assert.equal(subOf('640000000000000000002').draftGrade, 50);
  assert.equal(syncs(c.id, 'autoGrades').at(-1).status, 'partial');
  let p = GC.postOf(cl.id);
  assert.equal(p.retry_fails, 1); assert.ok(p.retry_at >= t + 60 * 60e3, 'tried again in an hour');
  assert.equal(GC.linkOf(c.id).auto_fails, 0, 'one student failing doesn\'t pause the class');
  // Nobody does anything more. Before the retry is due: no call to Google.
  let n0 = room.calls.length;
  await GC.autoGrades(t + 30 * 60e3);
  assert.equal(room.calls.length, n0, 'waits for the retry');
  // It fails again: the next try is two hours later.
  room.failNext(503, { match: /PATCH/ });
  n0 = patches().length;
  await GC.autoGrades(t + 61 * 60e3);
  assert.equal(patches().length, n0 + 1, 'only the failed student is tried, Bea is not sent again');
  p = GC.postOf(cl.id);
  assert.equal(p.retry_fails, 2); assert.ok(p.retry_at >= t + 61 * 60e3 + 2 * 3600e3);
  n0 = room.calls.length;
  await GC.autoGrades(t + 2 * 3600e3);
  assert.equal(room.calls.length, n0, 'backing off');
  // Then it goes: Kid's grade only, and the retry is done.
  n0 = patches().length;
  await GC.autoGrades(t + 4 * 3600e3);
  assert.equal(patches().length, n0 + 1);
  assert.ok(patches().at(-1).path.endsWith(subOf('640000000000000000001').id));
  assert.equal(subOf('640000000000000000001').draftGrade, 50);
  p = GC.postOf(cl.id); assert.equal(p.retry_at, null); assert.equal(p.retry_fails, 0);
  assert.equal(syncs(c.id, 'autoGrades').at(-1).status, 'ok');
  n0 = room.calls.length;
  await GC.autoGrades(t + 30 * 3600e3);
  assert.equal(room.calls.length, n0, 'nothing left to send: Google is not asked');

  // The retries stop with the lesson's automatic grades: 30 days after its due day...
  q.run('UPDATE gc_posts SET auto_at=NULL WHERE class_lesson_id=?', cl.id);
  assert.ok(P.markDone(kid, cl.id, steps[1].id).ok);
  room.failNext(500, { match: /PATCH/ });
  const t2 = t + 40 * 3600e3;
  await GC.autoGrades(t2);
  assert.ok(GC.postOf(cl.id).retry_at, 'Kid\'s 100 is waiting for a retry');
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', t2 - 32 * DAY, cl.id);
  n0 = room.calls.length;
  await GC.autoGrades(t2 + 3 * 3600e3);
  assert.equal(room.calls.length, n0, '30 days after the due date: no more retries');
  // ...or 90 days after it was posted when it has no due date.
  q.run('UPDATE class_lessons SET due_at=NULL WHERE id=?', cl.id);
  q.run("UPDATE gc_posts SET posted_at=? WHERE class_lesson_id=? AND kind='assignment'", t2 - 91 * DAY, cl.id);
  await GC.autoGrades(t2 + 3 * 3600e3);
  assert.equal(room.calls.length, n0, '90 days after posting: no more retries');
  // Inside the window the same retry still goes.
  q.run("UPDATE gc_posts SET posted_at=? WHERE class_lesson_id=? AND kind='assignment'", t2, cl.id);
  await GC.autoGrades(t2 + 3 * 3600e3);
  assert.equal(subOf('640000000000000000001').draftGrade, 100);
  assert.equal(subOf('640000000000000000002').draftGrade, 50, 'Bea unchanged');
});

const many = (prefix, count) => Array.from({ length: count }, (_, i) => ({ userId: `${prefix}${String(i).padStart(6, '0')}`, fullName: `Student ${i}` }));
test('a Classroom class over 300 students gets the plain "more than 300 students" answer without its whole roster being read', async () => {
  const x = await linked(many('6500000000000', 1200));
  const { c, tc } = x;
  const reads = () => room.calls.filter(z => z.method === 'GET' && z.path.endsWith('/students')).length;
  const n0 = reads();
  const r = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(r.status, 400);
  const j = await r.json();
  assert.equal(j.code, 'tooMany'); assert.match(j.error, /more than 300 students/);
  assert.equal(reads() - n0, 4, 'paging stops as soon as more than 300 were seen (not 12 pages, not "too many pages")');
  assert.equal(syncs(c.id, 'roster').at(-1).error, 'tooMany');
  assert.equal(GC.pendingCount(c.id), 0, 'nothing imported');
  // Exactly 300 is fine.
  const y = await linked(many('6510000000000', 300));
  assert.equal((await post(`/api/classes/${y.c.id}/google-classroom/roster`, {}, y.tc)).status, 200);
  assert.equal(GC.pendingCount(y.c.id), 300);
});

test('grades for a Classroom class with more than 500 submissions: paging stops once every student was found; past the page limit the rest are counted, not a failed send', async () => {
  const roster = many('6600000000000', 1050);
  roster[3] = { userId: '660000000000000000001', fullName: 'Kid Here' };
  roster[700] = { userId: '660000000000000000002', fullName: 'Bea Busy' };
  const x = await linked(roster);
  const { c, s, admin, cl, steps, tc, kid } = x;
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '660000000000000000001', kid.id, 'kid66@dwes.test', 'dwes.test', Date.now());
  const bea = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Bea Busy' }).user;
  S.addToClass({ id: admin.id }, c.id, bea.id, 'student');
  q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', '660000000000000000002', bea.id, 'bea66@dwes.test', 'dwes.test', Date.now());
  await post(`/api/class-lessons/${cl.id}/google-classroom/post`, {}, tc);
  const cw = room.courseWork.get(GC.postOf(cl.id).coursework_id);
  const subOf = sub => cw.submissions.find(z => z.userId === sub);
  const reads = () => room.calls.filter(z => z.method === 'GET' && z.path.endsWith('/studentSubmissions')).length;
  // Only Kid started: the first page has Kid, so one page is read.
  assert.ok(P.markDone(kid, cl.id, steps[0].id).ok);
  let n0 = reads();
  let r = await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json();
  assert.equal(reads() - n0, 1, 'stops once Kid was found');
  assert.match(r.toast, /^1 completion grade sent/);
  assert.equal(subOf('660000000000000000001').draftGrade, 50);
  // Bea started too, 700 entries in (more than the old 500-entry limit): 8 pages, and both grades go.
  assert.ok(P.markDone(bea, cl.id, steps[0].id).ok);
  n0 = reads();
  r = await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json();
  assert.equal(reads() - n0, 8);
  assert.match(r.toast, /^2 completion grades sent/);
  assert.equal(subOf('660000000000000000002').draftGrade, 50);
  assert.equal(syncs(c.id, 'grades').at(-1).status, 'ok');
  // Bea past the 1,000 entries read (10 pages): Kid's grade still goes; Bea counts as not gone through, with the reason.
  const [bsub] = cw.submissions.splice(cw.submissions.findIndex(z => z.userId === '660000000000000000002'), 1);
  cw.submissions.push(bsub);
  assert.ok(P.markDone(kid, cl.id, steps[1].id).ok); assert.ok(P.markDone(bea, cl.id, steps[1].id).ok);
  n0 = reads();
  const res = await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc);
  assert.equal(res.status, 200, 'not a failed send');
  r = await res.json();
  assert.equal(reads() - n0, GC.SUBMISSION_PAGES);
  assert.match(r.toast, /1 completion grade sent.*1 didn't go through/);
  assert.equal(subOf('660000000000000000001').draftGrade, 100); assert.equal(subOf('660000000000000000002').draftGrade, 50);
  const last = syncs(c.id, 'grades').at(-1);
  assert.equal(last.status, 'partial'); assert.equal(last.error, 'tooMany');
  assert.match(await pageOf(c, tc), /That Classroom class has more than 300 students/);
});

test('announcements: everyday words that are also first names (May, Will, Art) pass unless written as a name; full names and usernames never; the error names the word', async () => {
  const x = await linked([]);
  const { c, s, admin, tc, kid } = x;
  for (const rosterName of ['May Lin', 'Will Ortiz', 'Art Bell']) S.addToClass({ id: admin.id }, c.id, S.createSchoolAccount({ id: admin.id }, s.id, { rosterName }).user.id, 'student');
  const ann = note => post(`/api/classes/${c.id}/google-classroom/announce`, { template: 'free', note }, tc);
  for (const note of ['Bring your art supplies, we will start in May', 'May I remind you: Will you all bring art supplies? Art starts at 9.',
    'Field trip on May 3.', 'See you in early May!', 'We will mark the tests tonight.']) {
    const r = await ann(note);
    assert.equal(r.status, 200, `${note}: ${r.status === 200 ? '' : (await r.json()).error}`);
  }
  const refused = async (note, word) => {
    const r = await ann(note);
    assert.equal(r.status, 400, note);
    const j = await r.json();
    assert.equal(j.code, 'hasName'); assert.equal(j.field, 'note');
    assert.equal(j.error, `“${word}” in your message matches a student's name. Announcements go to the whole class, so please reword it or take it out.`);
  };
  await refused('Great job, Will!', 'Will');
  await refused('Thank you May for helping today', 'May');
  await refused('Well done may lin', 'may lin');
  await refused('Art Bell won the quiz', 'Art Bell');
  await refused(`Hi ${kid.username.toLowerCase()}`, kid.username.toLowerCase());
  await refused('Well done kid!', 'kid');
  // The check itself, directly.
  assert.equal(GC.nameIn('the will to win', c.id), '');
  assert.equal(GC.nameIn('Ask Will, then May.', c.id), 'Will');
  assert.equal(GC.nameIn('"Will you help?" she asked.', c.id), '');
  assert.equal(GC.nameIn('Due by May 12', c.id), '');
  assert.equal(GC.nameIn('Thanks, Ortiz', c.id), '', 'a last name alone is not checked');
});
