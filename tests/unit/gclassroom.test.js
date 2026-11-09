// Google Classroom sync (server/services/gclassroom.js, server/routes/gclassroom.js): off unless configured, who may
// use it (teachers of the class only: other teachers, students, guests and signed-out visitors get 404/403/401), the
// connect flow (incremental authorization, refresh token encrypted at rest, scopes checked, disconnect revokes), linking
// a course, importing its roster, posting a lesson, sending grades, errors shown plainly, rate limits and the sync log.
// Google is the fakes in tests/support (fake-google.js for OAuth, fake-classroom.js for the API).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

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
const { SCOPES } = await import('../../server/services/gclassroom-client.js');

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
/** Connect (POST → start → fake Google auto-consent → callback). -> the callback reply. */
async function connect(cookie, classId, { email = 'teach@dwes.test', sub, dropScope, cancel, noRefresh } = {}) {
  const r = await post('/api/google-classroom/connect', { back: classId }, cookie);
  if (r.status !== 200) return r;
  const start = await get((await r.json()).redirect, cookie);
  assert.equal(start.status, 302, `start ${start.status} ${loc(start)}`);
  const flow = cookieOf(start, 'brb_gflow'); const to = new URL(loc(start));
  assert.equal(to.searchParams.get('access_type'), 'offline');
  assert.equal(to.searchParams.get('include_granted_scopes'), 'true');
  assert.deepEqual(to.searchParams.get('scope').split(' ').sort(), ['openid', 'email', ...SCOPES].sort(), 'only the Classroom scopes we need');
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
  const r = await connect(tc, c.id, { email: 'teach@dwes.test' });
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
  assert.match(loc(await connect(tc, c.id, { dropScope: SCOPES[2] })), /gcerr=scopesMissing/);
  assert.match(loc(await connect(tc, c.id, { noRefresh: true })), /gcerr=noRefresh/);
  assert.match(loc(await connect(tc, c.id, { cancel: true })), /gcerr=cancelled/);
  assert.equal(GC.connectionOf(teacher.id), null, 'nothing stored');
  assert.match(await (await get(`/class/${c.id}/google-classroom?gcerr=scopesMissing`, tc)).text(), /check every box/);
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
