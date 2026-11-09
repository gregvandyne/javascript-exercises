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
  assert.match(await (await get(`/class/${c.id}/google-classroom`, tc)).text(), new RegExp(`<option value="${id}">Maths 4B</option>`));

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

test('roster import: matched by Google account, new ones get a school account (real name staff-only), the rest counted', async () => {
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
    { userId: '200000000000000000003', fullName: 'Mx Other' }, { userId: '200000000000000000004', fullName: 'Eve Newcomer' }, { userId: '200000000000000000004', fullName: 'Eve Newcomer' }]);
  await connect(tc, c.id);
  await post(`/api/classes/${c.id}/google-classroom/link`, { courseId: id }, tc);
  const users = q.get('SELECT COUNT(*) n FROM users').n;
  const r = await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc);
  assert.equal(r.status, 200);
  assert.match((await r.json()).toast, /2 students added · 1 uses their own account.*· 1 is staff here/);
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users + 1, 'one new account, for the newcomer only');
  assert.ok(S.classMember(c.id, known.id));
  assert.ok(!S.classMember(c.id, own.id)); assert.ok(!S.classMember(c.id, x.other.id) || S.classMember(c.id, x.other.id).role !== 'student');
  const eve = getUser(G.identityBySub('200000000000000000004').user_id);
  assert.equal(eve.managed_school, s.id); assert.equal(eve.password_hash, null);
  assert.doesNotMatch(eve.display_name, /Eve/, 'the Google name is never the public name');
  assert.equal(S.membership(s.id, eve.id).roster_name, 'Eve Newcomer', 'the real name is the staff-only roster name');
  assert.ok(S.classMember(c.id, eve.id));
  // Again: nothing new.
  const again = await (await post(`/api/classes/${c.id}/google-classroom/roster`, {}, tc)).json();
  assert.match(again.toast, /0 students added · 2 already here/);
  // The Students tab says Eve hasn't signed in yet; the sync log shows counts, never names.
  assert.match(await (await get(`/class/${c.id}?tab=students`, tc)).text(), /from Classroom, not signed in yet/);
  const pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, /Imported students/); assert.doesNotMatch(pg.split('id="gc-log"')[1], /Eve|Owen|Dee/);
  // Eve signs in with Google (same account id, the school's domain) and lands in that account.
  const st = await get('/auth/google/start');
  const to = new URL(loc(st)); to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', 'eve@dwes.test'); to.searchParams.set('fake_sub', '200000000000000000004');
  const cb = new URL(loc(await fetch(to, { redirect: 'manual' })));
  const done = await get(cb.pathname + cb.search, cookieOf(st, 'brb_gflow'));
  assert.ok(cookieOf(done, 'brb_session'), `signed in: ${loc(done)}`);
  assert.equal(G.identityBySub('200000000000000000004').email, 'eve@dwes.test');
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
  assert.match(await (await get(`/class/${c.id}`, tc)).text(), /name="gcPost"/);
  const a = await (await post(`/api/classes/${c.id}/lessons`, { lessonId: l2.id, dueAt: new Date(Date.now() - 5 * DAY).toISOString().slice(0, 10), gcPost: '1' }, tc)).json();
  assert.match(a.toast, /Assigned to Class 4B · Posted to Google Classroom \(without a due date/);
  assert.equal(room.calls.findLast(x => x.method === 'POST').body.dueDate, undefined);
  // Without the box: not posted.
  const l3 = L.createLesson(teacher, s.id, { title: 'Percent' }).lesson;
  const posts = room.calls.filter(x => x.method === 'POST').length;
  await post(`/api/classes/${c.id}/lessons`, { lessonId: l3.id }, tc);
  assert.equal(room.calls.filter(x => x.method === 'POST').length, posts);
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
  assert.match(r.toast, /1 grade sent · 1 hasn't started · 1 not in this class/);
  const cw = room.courseWork.get(GC.postOf(cl.id).coursework_id);
  const kidSub = cw.submissions.find(z => z.userId === '400000000000000000001');
  assert.equal(kidSub.draftGrade, 50); assert.equal(kidSub.assignedGrade, undefined);
  assert.ok(P.markDone(kid, cl.id, steps[1].id).ok);
  await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'assigned' }, tc);
  assert.equal(kidSub.draftGrade, 100); assert.equal(kidSub.assignedGrade, 100);
  assert.match(room.calls.findLast(z => z.method === 'PATCH').query.updateMask, /^draftGrade,assignedGrade$/);
  const pg = await (await get(`/class/${c.id}/google-classroom`, tc)).text();
  assert.match(pg, /Assigned grades sent/); assert.match(pg, /Sent grades/);
  // One grade Google won't take: the rest still go, and the page says so.
  room.failNext(500, { match: /PATCH/ });
  const part = await (await post(`/api/class-lessons/${cl.id}/google-classroom/grades`, { mode: 'draft' }, tc)).json();
  assert.match(part.toast, /0 grades sent.*1 didn't go through/);
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

test('account deletion takes the stored token with it', async () => {
  const { c, teacher, tc } = school();
  await connect(tc, c.id);
  assert.ok(GC.connectionOf(teacher.id));
  GC.forgetUser(teacher.id);
  assert.equal(GC.connectionOf(teacher.id), null);
});
