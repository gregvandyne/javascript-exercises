// Dashboard points: reasons, whole-class points, the student's view and Google Classroom (services/dash.js,
// routes/dash.js, routes/schools.js myPointsPanel, services/gclassroom.js announcePoint, public/js/dash-class5.js;
// docs/decisions.md "Dashboard points: reasons, whole-class points, the student's view and Google Classroom").
// The reasons (a fixed, positive list; the first version's keys still read), a whole-class point stored once as the
// class's own, the history and Undo, the student's "My points" (their own and the class's, never another student's),
// and posting to Google Classroom (the fakes in tests/support: a class announcement without names, a student's point
// to that student only, the switch, failures that never block the point, the rate limit, the missing scope).
import './_setup.js';
import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeClassroom } = await import('../support/fake-classroom.js');
const fake = await startFakeGoogle();
const room = await startFakeClassroom();
const KEY = 'b'.repeat(64); // a fake test key
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
process.env.GOOGLE_CLASSROOM = '1';
process.env.GOOGLE_TOKEN_KEY = KEY;
process.env.CLASSROOM_API_BASE = room.url;
const { config, parseTokenKey } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q, MIGRATIONS } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const GC = await import('../../server/services/gclassroom.js');
const SD = await import('../../server/services/school-delete.js');
const C5 = await import('../../public/js/dash-class5.js');
const { OPTIONAL_SCOPES } = await import('../../server/services/gclassroom-client.js');
const { tFor } = await import('../../server/i18n/index.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); await room.close(); });
const ON = { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true, googleTokenKey: parseTokenKey(KEY).key, classroomApiBase: room.url, googleClassroomScopes: 'read' };
test.beforeEach(() => { RL._reset(); Object.assign(config, ON); GC._forget(); });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const loc = r => r.headers.get('location');
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

/** A school, its teacher and a class with three students (Ada, Ben, Cy by roster name). */
function school() {
  const admin = createUser({ username: uname('PAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Points School ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('PTch'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  const c = S.createClass({ id: teacher.id }, s.id, { name: 'Class 3C', grade: '3' }).class;
  S.updateSchool({ id: admin.id }, s.id, { settings: { googleDomains: ['dwes.test'] } });
  const kid = name => { const u = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name, grade: '3' }).user; S.addToClass({ id: admin.id }, c.id, u.id, 'student'); return getUser(u.id); };
  const a = kid('Ada Apple'), b = kid('Ben Birch'), cy = kid('Cy Cedar');
  return { s, admin, teacher: getUser(teacher.id), c: S.getClass(c.id), a, b, cy, tc: cookieFor(teacher.id), ac: cookieFor(a.id), bc: cookieFor(b.id) };
}
const pts = (x, body) => post(`/api/dash/${x.c.id}/points`, body, x.tc);
async function connect(cookie, classId, { dropScope } = {}) {
  const r = await post('/api/google-classroom/connect', { back: classId, write: '1' }, cookie);
  assert.equal(r.status, 200);
  const start = await get((await r.json()).redirect, cookie);
  const flow = cookieOf(start, 'brb_gflow'); const to = new URL(loc(start));
  if (dropScope) fake.next({ dropScope });
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', `t${crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 10)}@dwes.test`);
  const cb = new URL(loc(await fetch(to, { redirect: 'manual' })));
  return get(cb.pathname + cb.search, `${cookie}; ${flow}`);
}
/** The class linked to a Classroom course where Ada and Ben are (Cy is not), the roster imported. */
async function linked({ dropScope } = {}) {
  const x = school();
  const subA = String(700000000000000000000n + BigInt(++n)), subB = String(710000000000000000000n + BigInt(n));
  const id = room.addCourse({ name: `Course ${n}`, students: [{ userId: subA, fullName: 'Ada Apple' }, { userId: subB, fullName: 'Ben Birch' }] });
  await connect(x.tc, x.c.id, { dropScope });
  assert.equal((await post(`/api/classes/${x.c.id}/google-classroom/link`, { courseId: id }, x.tc)).status, 200);
  for (const [sub, u] of [[subA, x.a], [subB, x.b]]) q.run('INSERT INTO google_identities(sub, user_id, email, hd, created_at) VALUES (?,?,?,?,?)', sub, u.id, `${sub}@dwes.test`, 'dwes.test', Date.now());
  assert.equal((await post(`/api/classes/${x.c.id}/google-classroom/roster`, {}, x.tc)).status, 200);
  return { ...x, id, subA, subB };
}
const announcements = () => room.calls.filter(z => z.method === 'POST' && /\/announcements$/.test(z.path));

test('migration 0109 (after 0108): the awards and the class\'s own points; both in the school delete', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names[names.indexOf('0108_teacher_companion') + 1], '0109_dash_point_awards');
  for (const tb of ['dash_point_awards', 'dash_class_points']) {
    assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", tb), tb);
    assert.ok(SD.BY_CLASS.includes(tb), `${tb} goes with the school`);
  }
  assert.ok(q.all('PRAGMA table_info(dash_class)').some(c => c.name === 'points_gc'));
});

test('reasons: a fixed, positive list of at most 12 with the owner\'s examples, the first version\'s keys kept, aliases read, every locale', () => {
  const R = D.POINT_REASONS;
  assert.ok(R.length >= 10 && R.length <= 12, String(R.length));
  for (const k of ['leadership', 'teamwork', 'focus', 'kind', 'example', 'effort', 'participation']) assert.ok(R.includes(k), k);
  for (const old of ['kind', 'helpful', 'teamwork', 'effort', 'listening', 'responsible', 'brave', 'creative']) assert.ok(R.includes(old), `old key ${old} still works`);
  assert.equal(new Set(R).size, R.length);
  assert.ok(!R.some(x => /bad|rude|late|minus|lose|off/i.test(x)));
  assert.deepEqual(Object.keys(C5.REASON_ICON), R, 'the picker shows the same reasons in the same order');
  assert.equal(D.pointReason('kindness'), 'kind'); assert.equal(D.pointReason('Focused'), 'focus'); assert.equal(D.pointReason('hard-work'), 'effort');
  assert.equal(D.pointReason('rude'), ''); assert.equal(D.pointReason('__proto__'), ''); assert.equal(D.pointReason('constructor'), '');
  const en = tFor('en');
  assert.equal(en('dash.w.score.r_example'), 'Setting a good example');
  for (const code of ['en', 'en-GB', 'de', 'es', 'fr', 'it', 'nl', 'pt', 'ru', 'ja', 'zh-Hant', 'he', 'ar']) {
    const t = tFor(code);
    for (const r of R) for (const k of [`dash.w.score.r_${r}`, `dash.w.score.f_${r}`]) assert.ok(t(k) && t(k) !== k, `${code} ${k}`);
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8'));
    if (code !== 'en' && code !== 'en-GB') for (const k of ['classPoints', 'classGiven', 'gcPost', 'onlyYou', 'r_leadership', 'f_participation']) assert.ok(l.dash.w.score[k] && l.dash.w.score[k] !== JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.w.score[k], `${code} ${k} is translated`);
  }
  // No em dashes in any of the new words.
  for (const code of ['en', 'de', 'fr', 'ar']) assert.doesNotMatch(JSON.stringify(JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash.w.score), /\u2014/);
});

test('old stored points read the same: the first version\'s keys and its "everyone" rows (one per student)', async () => {
  const x = school();
  // As the first version left them: a count per (class, student, reason), no awards remembered.
  for (const [u, r, k] of [[x.a, 'creative', 2], [x.a, 'brave', 1], [x.b, 'teamwork', 1], [x.cy, 'teamwork', 1]]) q.run('INSERT INTO dash_points(class_id, user_id, reason, n, at) VALUES (?,?,?,?,?)', x.c.id, u.id, r, k, Date.now());
  let p = D.pointsAll(x.c, x.teacher);
  assert.deepEqual(p.list.find(k => k.id === x.a.id).r, { creative: 2, brave: 1 });
  assert.equal(p.total, 5); assert.deepEqual(p.cls, { n: 0, r: {} });
  // Undo of an old point with no award remembered still takes it back.
  assert.equal((await pts(x, { action: 'undo', user: x.a.id, reason: 'creative' })).status, 200);
  assert.equal(D.pointsAll(x.c).list.find(k => k.id === x.a.id).r.creative, 1);
  // An alias in a request is stored under its key.
  assert.equal((await pts(x, { action: 'award', user: x.b.id, reason: 'kindness' })).status, 200);
  assert.deepEqual(D.pointsAll(x.c).list.find(k => k.id === x.b.id).r, { teamwork: 1, kind: 1 });
  assert.equal((await pts(x, { action: 'award', user: x.b.id, reason: 'rude' })).status, 400);
});

test('a whole-class point is stored once, as the class\'s own (never one per student), and recorded as the class\'s', async () => {
  const x = school();
  let r = await pts(x, { action: 'award', user: 'class', reason: 'teamwork' });
  assert.equal(r.status, 200); let j = await r.json();
  assert.deepEqual(j.cls, { n: 1, r: { teamwork: 1 } });
  assert.equal(j.total, 0, 'no student got a point');
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_points WHERE class_id=?', x.c.id).n, 0);
  assert.deepEqual(q.all('SELECT reason, n FROM dash_class_points WHERE class_id=?', x.c.id), [{ reason: 'teamwork', n: 1 }]);
  const aw = q.all('SELECT user_id, reason, by_id FROM dash_point_awards WHERE class_id=?', x.c.id);
  assert.deepEqual(aw, [{ user_id: null, reason: 'teamwork', by_id: x.teacher.id }]);
  // "all", what the first version sent for everyone, is the class's point now.
  await pts(x, { action: 'award', user: 'all', reason: 'teamwork' });
  await pts(x, { action: 'award', user: 'class', reason: 'focus' });
  j = await (await pts(x, { action: 'award', user: x.a.id, reason: 'kind' })).json();
  assert.deepEqual(j.cls, { n: 3, r: { teamwork: 2, focus: 1 } });
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_class_points WHERE class_id=?', x.c.id).n, 2, 'one row per reason');
  // The Recent list: the newest first; the class's awards have no name.
  assert.deepEqual(j.recent.map(a => [a.user, a.name, a.reason]), [[x.a.id, x.a.display_name, 'kind'], [null, null, 'focus'], [null, null, 'teamwork'], [null, null, 'teamwork']]);
  // The teacher's list stays in name order however many points anyone has (never ranked).
  for (let i = 0; i < 3; i++) await pts(x, { action: 'award', user: x.cy.id, reason: 'effort' });
  assert.deepEqual(D.pointsAll(x.c).list.map(k => k.id), D.studentsOf(x.c).map(k => k.id), 'the class list\'s own order');
  assert.deepEqual(D.pointsAll(x.c).list.map(k => k.id), [x.a.id, x.b.id, x.cy.id], 'by name, not by points');
  // A class with no students has nobody to give a class point to; students can't give one.
  assert.equal((await post(`/api/dash/${x.c.id}/points`, { action: 'award', user: 'class', reason: 'kind' }, x.ac)).status, 404);
});

test('history and undo: Undo takes back the latest matching award; Start again clears the counts and the history', async () => {
  const x = school();
  for (const [user, reason] of [[x.a.id, 'teamwork'], [x.a.id, 'kind'], [x.a.id, 'teamwork'], ['class', 'teamwork'], ['class', 'leadership']]) await pts(x, { action: 'award', user, reason });
  const ids = () => q.all('SELECT id, user_id, reason FROM dash_point_awards WHERE class_id=? ORDER BY at, rowid', x.c.id);
  const before = ids();
  assert.equal(before.length, 5);
  // Undo Ada's teamwork: the second (latest) teamwork award goes, the first stays.
  let j = await (await pts(x, { action: 'undo', user: x.a.id, reason: 'teamwork' })).json();
  assert.deepEqual(ids().map(a => a.id), before.filter((a, i) => i !== 2).map(a => a.id));
  assert.deepEqual(j.list.find(k => k.id === x.a.id).r, { teamwork: 1, kind: 1 });
  // Undo a class point: only the class's.
  j = await (await pts(x, { action: 'undo', user: 'class', reason: 'teamwork' })).json();
  assert.deepEqual(j.cls, { n: 1, r: { leadership: 1 } });
  assert.equal(ids().length, 3);
  for (let i = 0; i < 3; i++) await pts(x, { action: 'undo', user: 'class', reason: 'teamwork' });
  assert.deepEqual(D.classPoints(x.c), { n: 1, r: { leadership: 1 } }, 'never below zero');
  assert.ok(q.all('SELECT n FROM dash_class_points').every(r => r.n > 0));
  // Start again: counts and remembered awards all go (a fresh start for everyone).
  j = await (await pts(x, { action: 'reset' })).json();
  assert.equal(j.total, 0); assert.deepEqual(j.cls, { n: 0, r: {} }); assert.deepEqual(j.recent, []);
  for (const tb of ['dash_points', 'dash_class_points', 'dash_point_awards']) assert.equal(q.get(`SELECT COUNT(*) n FROM ${tb} WHERE class_id=?`, x.c.id).n, 0, tb);
  assert.equal(D.hasPoints(x.c), false);
});

test('the student\'s "My points": their own points and the class\'s on their class page, never another student\'s, never a ranking', async () => {
  const x = school();
  // Nothing yet: the class page has no card.
  assert.doesNotMatch(await (await get(`/class/${x.c.id}`, x.ac)).text(), /id="my-points"/);
  for (const [user, reason] of [[x.a.id, 'kind'], [x.a.id, 'kind'], [x.a.id, 'teamwork'], ['class', 'focus'], ['class', 'focus']]) await pts(x, { action: 'award', user, reason });
  // Ben gets lots of points for a reason Ada and the class never got.
  for (let i = 0; i < 7; i++) await pts(x, { action: 'award', user: x.b.id, reason: 'leadership' });
  const html = await (await get(`/class/${x.c.id}`, x.ac)).text();
  const card = html.slice(html.indexOf('id="my-points"'), html.indexOf('</section>', html.indexOf('id="my-points"')));
  assert.ok(card.length > 100, 'the card is there');
  assert.match(card, /My points/);
  assert.match(card, /id="mp-mine"><b>3<\/b>/);
  assert.match(card, /Kindness <b>2<\/b>/); assert.match(card, /Teamwork <b>1<\/b>/);
  assert.match(card, /id="mp-class"><b>2<\/b>/); assert.match(card, /Focus <b>2<\/b>/);
  assert.match(card, /The whole class earned a point for focus/, 'the full sentence stays, for screen readers and as the row\'s title');
  // Layout A ("Let's go with A."): all my points on top (own + the whole class's), then "Just me" and "Whole class" cards.
  assert.match(card, /class="mp-total" id="mp-total"><p class="mp-tl"><b>All my points<\/b><small>My own 3 \+ the whole class&#39;s 2<\/small><\/p><p class="mp-tn"><b>5<\/b><\/p>/);
  assert.ok(card.indexOf('mp-total') < card.indexOf('mp-me') && card.indexOf('mp-me') < card.indexOf('mp-class'), 'the total first, then Just me, then Whole class');
  assert.match(card, /class="mp-col mp-me"[^>]*><h3 class="mp-boxh"[^>]*>[\s\S]{0,400}Just me<\/h3>/);
  assert.match(card, /class="mp-col mp-class"[^>]*><h3 class="mp-boxh"[^>]*>[\s\S]{0,400}Whole class<\/h3>/);
  assert.equal((card.match(/<h4 class="mp-h3">Recent<\/h4>/g) || []).length, 2, 'both cards have Recent');
  const p0 = D.pointsMine(x.c, x.a.id); assert.equal(p0.mine + p0.cls.n, 5);
  assert.match(card, /Only you and your teacher see your points/);
  // Another student's points are never in the page: not their reason, count, name or id.
  assert.doesNotMatch(card, /Leadership/);
  for (const v of [x.b.id, x.b.username, 'Ben Birch']) assert.ok(!html.includes(v) || !card.includes(v), v);
  assert.ok(!card.includes(x.b.id) && !card.includes(x.b.display_name), 'no other student in the card');
  assert.doesNotMatch(card, /\b7\b/, 'Ben\'s count is not shown');
  assert.doesNotMatch(card, /rank|place|top|1st|leader ?board/i);
  // The data behind it holds nothing of anyone else's.
  const mine = D.pointsMine(x.c, x.a.id);
  assert.ok(!JSON.stringify(mine).includes(x.b.id) && !JSON.stringify(mine).includes(x.b.display_name));
  assert.deepEqual(mine.recent.map(a => a.reason), ['teamwork', 'kind', 'kind']);
  assert.deepEqual(mine.classRecent.map(a => a.reason), ['focus', 'focus']);
  assert.ok(mine.recent.every(a => Object.keys(a).sort().join() === 'at,reason'), 'only the reason and the day');
  // Ben's card shows his own.
  const bcard = await (await get(`/class/${x.c.id}`, x.bc)).text();
  assert.match(bcard, /id="mp-mine"><b>7<\/b>/); assert.match(bcard, /class="mp-tn"><b>9<\/b>/, 'Ben: his 7 and the class\'s 2'); assert.doesNotMatch(bcard.slice(bcard.indexOf('id="my-points"')), /Kindness <b>2/);
  // The Classes tab links to it.
  assert.match(await (await get('/classes', x.ac)).text(), new RegExp(`href="/class/${x.c.id}#my-points"[^>]*>[\\s\\S]{0,200}My points: 3`));
  // The teacher's own class page has no student card.
  assert.doesNotMatch(await (await get(`/class/${x.c.id}`, x.tc)).text(), /id="my-points"/);
});

test('Google Classroom: off by default; a whole-class point goes to the stream without names; a student\'s point only to that student', async () => {
  const x = await linked();
  let st = D.gcState(x.teacher, x.c);
  assert.deepEqual({ show: st.show, on: st.on, ready: st.ready }, { show: true, on: false, ready: true });
  const before = announcements().length;
  // Off: nothing is posted.
  let j = await (await pts(x, { action: 'award', user: 'class', reason: 'teamwork' })).json();
  assert.equal(j.gcPost, undefined); assert.equal(announcements().length, before);
  // On (remembered for the class).
  j = await (await pts(x, { action: 'gc', on: true })).json();
  assert.equal(j.gc.on, true); assert.equal(D.pointsGcOn(x.c), true);
  j = await (await pts(x, { action: 'award', user: 'class', reason: 'teamwork' })).json();
  assert.deepEqual(j.gcPost, { ok: true });
  let a = announcements().at(-1);
  assert.equal(a.path, `/v1/courses/${x.id}/announcements`);
  assert.deepEqual(a.body, { text: 'Our class earned a point for teamwork! 🎉', state: 'PUBLISHED' });
  // A student's point: only to that student (their Google id), and still no name.
  j = await (await pts(x, { action: 'award', user: x.a.id, reason: 'example' })).json();
  assert.deepEqual(j.gcPost, { ok: true });
  a = announcements().at(-1);
  assert.deepEqual(a.body, { text: 'You earned a point for setting a good example! 🌟', state: 'PUBLISHED', assigneeMode: 'INDIVIDUAL_STUDENTS', individualStudentsOptions: { studentIds: [x.subA] } });
  const sent = JSON.stringify(announcements().slice(before).map(z => z.body));
  for (const v of ['Ada', 'Apple', 'Ben', 'Birch', x.a.display_name, x.a.username, x.b.display_name, x.b.id, x.a.id, x.subB]) assert.ok(!sent.includes(v), `never sent: ${v}`);
  assert.doesNotMatch(sent, /rank|\d+ points|total/i);
  // The Recent list marks what went.
  assert.deepEqual(D.pointsAll(x.c, x.teacher).recent.slice(0, 2).map(r => r.gc), ['posted', 'posted']);
  // Undo takes the announcement back in Classroom too.
  const posted = q.get("SELECT gc_id FROM dash_point_awards WHERE class_id=? AND user_id=? AND gc='posted'", x.c.id, x.a.id).gc_id;
  assert.ok(room.announcements.has(posted));
  assert.equal((await pts(x, { action: 'undo', user: x.a.id, reason: 'example' })).status, 200);
  assert.ok(!room.announcements.has(posted), 'gone from Classroom');
  // The teacher's language.
  assert.equal(D.pointText(tFor('de'), { user: null, reason: 'teamwork' }), 'Unsere Klasse hat einen Punkt für Teamarbeit bekommen! 🎉');
  // A student who isn't on the Classroom roster: the point is saved, nothing is posted, a calm line says why.
  const n0 = announcements().length;
  const r = await pts(x, { action: 'award', user: x.cy.id, reason: 'kind' });
  assert.equal(r.status, 200); j = await r.json();
  assert.deepEqual(j.gcPost, { ok: false, code: 'notOnClassroom' });
  assert.equal(j.list.find(k => k.id === x.cy.id).n, 1);
  assert.equal(announcements().length, n0);
  // Off again: nothing more is posted.
  await pts(x, { action: 'gc', on: false });
  await pts(x, { action: 'award', user: 'class', reason: 'kind' });
  assert.equal(announcements().length, n0);
  // Logged without the words or the student.
  const logs = q.all("SELECT counts FROM gc_syncs WHERE class_id=? AND kind='pointPost'", x.c.id);
  assert.ok(logs.length >= 2); assert.doesNotMatch(JSON.stringify(logs), new RegExp(`${x.subA}|teamwork|example`));
});

test('Google Classroom failures never block the point: Google down, the hourly limit, the missing scope (the reconnect path)', async () => {
  const x = await linked();
  await pts(x, { action: 'gc', on: true });
  // Google is down: the point is saved, the answer is calm.
  room.failNext(500, { match: /announcements$/ });
  let r = await pts(x, { action: 'award', user: 'class', reason: 'participation' });
  assert.equal(r.status, 200); let j = await r.json();
  assert.equal(j.gcPost.ok, false); assert.equal(j.gcPost.code, 'googleDown');
  assert.deepEqual(j.cls, { n: 1, r: { participation: 1 } });
  assert.equal(q.get("SELECT gc FROM dash_point_awards WHERE class_id=? ORDER BY at DESC, rowid DESC LIMIT 1", x.c.id).gc, 'failed:googleDown');
  // The class's 10 announcements an hour are shared with the Classroom page's own; past them, points still count.
  let ok = 0, paused = 0;
  for (let i = 0; i < 12; i++) { j = await (await pts(x, { action: 'award', user: 'class', reason: 'focus' })).json(); if (j.gcPost.ok) ok++; else { assert.equal(j.gcPost.code, 'tooManyAnnouncements'); paused++; } }
  assert.equal(ok, 9, 'the failed try counted as one'); assert.equal(paused, 3);
  assert.equal(D.classPoints(x.c).r.focus, 12);
  // Without the announcements scope: the switch can't be used, the widget links to the class's Classroom page.
  const y = await linked({ dropScope: OPTIONAL_SCOPES.announce });
  const st = D.gcState(y.teacher, y.c);
  assert.deepEqual({ show: st.show, ready: st.ready, why: st.why, allow: st.allow }, { show: true, ready: false, why: 'needsScope', allow: `/class/${y.c.id}/google-classroom#gc-announce` });
  await pts(y, { action: 'gc', on: true });
  const n0 = announcements().length;
  r = await pts(y, { action: 'award', user: y.a.id, reason: 'kind' });
  assert.equal(r.status, 200); j = await r.json();
  assert.deepEqual(j.gcPost, { ok: false, code: 'needsScope' });
  assert.equal(j.list.find(k => k.id === y.a.id).n, 1);
  assert.equal(announcements().length, n0);
  // A class that isn't linked shows nothing about Classroom.
  const z = school();
  assert.deepEqual(D.gcState(z.teacher, z.c), { show: false });
  // Classroom off on this site: nothing either.
  config.googleClassroom = false;
  assert.deepEqual(D.gcState(x.teacher, x.c), { show: false });
});

test('the client: the reasons sheet, the whole-class line and the calm Google Classroom lines', () => {
  const W = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.w.score;
  assert.equal(C5.gcLine(W, null), '');
  assert.equal(C5.gcLine(W, { ok: true }), 'Posted to Google Classroom.');
  assert.equal(C5.gcLine(W, { ok: true, pending: true }), W.gcPending);
  assert.match(C5.gcLine(W, { ok: false, code: 'googleDown' }), /The point is saved/);
  assert.match(C5.gcLine(W, { ok: false, code: 'needsScope' }), /connecting again/);
  assert.match(C5.gcLine(W, { ok: false, code: 'tooManyAnnouncements' }), /10 an hour/);
  assert.match(C5.awardDay(Date.UTC(2026, 10, 22, 15), 'en-US', 'America/New_York'), /Sun, Nov 22/);
  // The teacher's list is private on the projector; the class's points are not.
  const src = fs.readFileSync('public/js/dash-class5.js', 'utf8');
  const fn = src.slice(src.indexOf('export function points('), src.indexOf('// ---------------------------------------------------------------- mood check-in'));
  assert.match(fn, /el\('ul', 'dw5-plist dw-scroll dw-private'\)/);
  assert.match(fn, /el\('div', 'dw-row dw-foot dw-private'\)/);
  assert.doesNotMatch(fn, /\.sort\(/, 'never sorted by points');
  assert.doesNotMatch(fn, /el\('input'|el\('textarea'|contenteditable/i, 'nobody types a reason');
});

test('deleting an account: the awards for that student go; the ones a teacher gave stay with the class, unsigned', async () => {
  const x = school();
  await pts(x, { action: 'award', user: x.a.id, reason: 'kind' });
  await pts(x, { action: 'award', user: 'class', reason: 'kind' });
  D.forgetUser(x.a.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_point_awards WHERE user_id=?', x.a.id).n, 0);
  D.forgetUser(x.teacher.id);
  assert.deepEqual(q.all('SELECT user_id, by_id FROM dash_point_awards WHERE class_id=?', x.c.id), [{ user_id: null, by_id: null }]);
  assert.equal(q.get('SELECT COUNT(*) n FROM dash_point_awards WHERE by_id=?', x.teacher.id).n, 0);
});
