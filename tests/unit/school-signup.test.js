// Account first (docs/decisions.md "Account first: set up your school"): signed out, "Set up your school" on /teachers
// makes the teacher's own account and their school at once (they are its school admin), keeps their email for the
// account, stores the request linked to both and signs them in to their Classroom. A teacher who already runs a school
// tells us about it instead. The platform admin's "Looks good" sends the welcome (sign in with their own account: no
// password link) and closes the request. A kid's account still never sees the form.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const SC = await import('../../server/services/schools.js');
const SR = await import('../../server/services/school-requests.js');
const E = await import('../../server/services/email.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const sent = [];
E._hooks({ fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { status: 200, json: async () => ({ id: `em_${sent.length}` }) }; }, wait: () => Promise.resolve() });
Object.assign(config, { resendApiKey: 're_test_key', emailEnabled: true, publicUrl: 'https://oomba.example' });

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
test.beforeEach(() => { resetLimits(); sent.length = 0; });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body } = {}) {
  const h = {}; if (cookie) h.cookie = cookie;
  if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
let n = 0;
const admin = () => auth.createUser({ username: `SuBoss${++n}`, password: 'rainbow-77', role: 'admin' });
const form = (over = {}) => ({ signup: '1', name: 'Roxana Gherghinis', school: 'Fortech Academy', role: 'it', email: 'roxana@fortech.example', students: '240', country: 'Romania',
  username: `RoxanaT${++n}`, password: 'blue-otter-fortech-42', adult: '1', tz: 'Europe/Bucharest', ...over });

test('signed out: "Set up your school" leads into the one sign-up (no form of its own any more)', async () => {
  const r = await call(null, '/teachers');
  assert.equal(r.status, 200);
  const start = (/<section class="panel lp-start" id="start"[\s\S]*?<\/section>/.exec(r.text) || [''])[0];
  assert.match(start, /Make your teacher account, then create or join your school and add your classes/);
  assert.match(start, /<a class="btn btn-primary btn-big" href="\/signup\/for\/teacher" id="setup-signup" rel="nofollow">Create my teacher account<\/a>/);
  assert.doesNotMatch(start, /name="username"|name="password"|data-api="\/api\/teachers\/school-request"/);
  // The old form's API still answers a post (a page left open before the change), with the same rules.
});

test('one sign-up: the account, its school (they run it), the email kept, the request linked, signed in', async () => {
  const before = { users: q.get('SELECT COUNT(*) n FROM users').n, schools: q.get('SELECT COUNT(*) n FROM schools').n };
  const f = form();
  const r = await call(null, '/api/teachers/school-request', { method: 'POST', body: f });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/teach?welcome=school');
  assert.ok(r.cookie, 'signed in');
  const u = auth.getUserByName(f.username);
  assert.ok(u); assert.equal(u.display_name, 'Roxana Gherghinis'); assert.ok(auth.verifyPassword(u, f.password));
  assert.equal(auth.accountKind(u), 'staff');
  const [s] = SC.schoolsOf(u.id);
  assert.equal(s.name, 'Fortech Academy'); assert.equal(s.role, 'admin');
  assert.equal(JSON.parse(SC.getSchool(s.id).settings).timeZone, 'Europe/Bucharest');
  assert.equal(E.addressOf(u.id).email, 'roxana@fortech.example', 'kept for the welcome and password resets');
  const req = q.get('SELECT * FROM school_requests WHERE user_id=?', u.id);
  assert.equal(req.school_id, s.id); assert.equal(req.status, 'open'); assert.equal(req.contact_name, 'Roxana Gherghinis');
  assert.equal(q.get('SELECT COUNT(*) n FROM school_members WHERE user_id=?', u.id).n, 1, 'one school, theirs');
  assert.equal(q.get('SELECT COUNT(*) n FROM schools').n, before.schools + 1);
  // Their Classroom says the school is ready.
  const home = await call(r.cookie, '/teach?welcome=school');
  assert.match(home.text, /id="school-ready"/); assert.match(home.text, /Fortech Academy is ready, and you(?:'|&#39;)re its school admin/);
  assert.equal(sent.length, 0, 'no email until the platform admin has looked');
});

test('every mistake at once, and nothing is made', async () => {
  const before = { users: q.get('SELECT COUNT(*) n FROM users').n, schools: q.get('SELECT COUNT(*) n FROM schools').n, reqs: q.get('SELECT COUNT(*) n FROM school_requests').n };
  const r = await call(null, '/api/teachers/school-request', { method: 'POST', body: form({ name: 'R', email: 'nope', username: 'a b', password: 'short', adult: '' }) });
  assert.equal(r.status, 400);
  for (const k of ['name', 'email', 'username', 'password', 'adult']) assert.ok(r.json.errors[k], k);
  const already = auth.createUser({ username: `Taken${++n}`, password: 'rainbow-77' });
  const users0 = q.get('SELECT COUNT(*) n FROM users').n;
  const taken = await call(null, '/api/teachers/school-request', { method: 'POST', body: form({ username: already.username }) });
  assert.equal(taken.status, 400); assert.equal(taken.json.field, 'username');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users0);
  assert.equal(q.get('SELECT COUNT(*) n FROM schools').n, before.schools);
  assert.equal(q.get('SELECT COUNT(*) n FROM school_requests').n, before.reqs);
});

test('a teacher who runs a school tells us about it; someone else\'s school is refused', async () => {
  const f = form();
  const made = SC.createTeacherWithSchool({ name: 'Ana Lee', school: 'Lee Elementary', username: f.username, password: f.password });
  const page = await call(cookieFor(made.user.id), '/teachers');
  assert.match(page.text, /id="sr-school-id"/); assert.match(page.text, new RegExp(`<option value="${made.school.id}">Lee Elementary</option>`));
  assert.doesNotMatch(page.text, /name="password"/);
  const other = SC.createTeacherWithSchool({ name: 'Bo Moss', school: 'Moss Middle', username: `BoMoss${++n}`, password: 'green-heron-pass-77' });
  const no = await call(cookieFor(made.user.id), '/api/teachers/school-request', { method: 'POST', body: { schoolId: other.school.id, role: 'teacher', email: 'ana@lee.example', students: '50', country: 'US' } });
  assert.equal(no.status, 400);
  const ok = await call(cookieFor(made.user.id), '/api/teachers/school-request', { method: 'POST', body: { schoolId: made.school.id, role: 'teacher', email: 'ana@lee.example', students: '50', country: 'US' } });
  assert.equal(ok.status, 200, ok.text);
  const req = q.get('SELECT * FROM school_requests WHERE school_id=?', made.school.id);
  assert.equal(req.school_name, 'Lee Elementary'); assert.equal(req.user_id, made.user.id); assert.equal(req.contact_name, 'Ana Lee');
});

test('the admin: "Looks good" sends the welcome (their own account, no password link) and closes the request', async () => {
  const f = form({ email: 'lg@fortech.example', school: 'Looks Good School' });
  const r = await call(null, '/api/teachers/school-request', { method: 'POST', body: f });
  assert.equal(r.status, 200);
  const req = q.get("SELECT * FROM school_requests WHERE school_name='Looks Good School'");
  const boss = admin();
  const tab = await call(cookieFor(boss.id), '/admin?tab=schoolreq');
  assert.match(tab.text, /Signed up and already using it/);
  assert.match(tab.text, new RegExp(`data-api="/api/admin/school-requests/${req.id}/approve"`));
  assert.doesNotMatch(tab.text, new RegExp(`/admin/schools/setup\\?request=${req.id}`), 'no Set up this school: the school exists');
  const ok = await call(cookieFor(boss.id), `/api/admin/school-requests/${req.id}/approve`, { method: 'POST', body: {} });
  assert.equal(ok.status, 200, ok.text); assert.match(ok.json.toast, /Welcome email sent/);
  assert.equal(SR.getRequest(req.id).status, 'done');
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].to, ['lg@fortech.example']);
  assert.match(sent[0].text, new RegExp(f.username));
  assert.match(sent[0].text, /Sign in with your usual Oomba Academy account/);
  assert.doesNotMatch(sent[0].text, /\/reset\?t=/);
  assert.equal((await call(cookieFor(boss.id), `/api/admin/school-requests/${req.id}/approve`, { method: 'POST', body: {} })).status, 404, 'once');
  // A plain request (no school yet) has no "Looks good": the setup page makes the school.
  const plain = SR.createRequest({ school: 'Plain School', role: 'teacher', email: 'p@plain.example', students: '10', country: 'US' });
  assert.equal((await call(cookieFor(boss.id), `/api/admin/school-requests/${plain.id}/approve`, { method: 'POST', body: {} })).status, 404);
  // Nobody else can approve.
  const u = auth.getUserByName(f.username);
  assert.equal((await call(cookieFor(u.id), `/api/admin/school-requests/${plain.id}/approve`, { method: 'POST', body: {} })).status, 404);
});
