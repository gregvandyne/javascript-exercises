// One sign-up (docs/decisions.md "One sign-up", server/routes/onboarding.js): after "Who's signing up?"
//   kid      a fun name and a password (no email, no Google), then an optional class code or a family code to give
//   parent   Sign up with Google or a username and password (18 or older), then "Add your kids"
//   teacher  Sign up with Google or a username and password, then create (admin at once) / join / skip a school, then
//            at least one class (name and grade), then "Connect Google Classroom?" (when on), then /teach or the trial
// Against the fake Google (tests/support/fake-google.js) and the fake Stripe (families on).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeStripe } = await import('../support/fake-stripe.js');
const fakeG = await startFakeGoogle();
const fakeS = await startFakeStripe({ webhookSecret: 'whsec_fake_onb', apiKey: 'rk_test_fake' });
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fakeG.url;
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_onb';
process.env.STRIPE_API_BASE = fakeS.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/family.js');
const E = await import('../../server/services/email.js');
const { homeFor } = await import('../../server/routes/auth.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fakeG.close(); await fakeS.close(); });
test.beforeEach(() => { RL._reset(); config.googleClientId = 'test-client.apps.googleusercontent.com'; config.googleClientSecret = 'fake-test-secret'; config.stripeApiKey = 'rk_test_fake'; config.googleClassroom = false; });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const loc = r => r.headers.get('location');
async function get(p, cookie = '') { const r = await fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} }); r.body2 = await r.text(); return r; }
async function post(p, body, cookie = '') {
  const r = await fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
  r.json2 = await r.json().catch(() => null); r.session = cookieOf(r, 'brb_session'); return r;
}
let n = 0;
const uname = p => `${p}_${200 + ++n}`;   // a fixed shape: random digits can trip the name filters (69, 420, ages)
const PW = 'a-long-password-1';
/** The fake Google in auto mode: our start (from a sign-up API's redirect) → Google → our callback. */
async function google(start, { email, hd, sub, cookie = '' }) {
  const s = await get(start, cookie);
  assert.equal(s.status, 302, `start: ${s.status} ${loc(s)}`);
  const flow = cookieOf(s, 'brb_gflow');
  assert.ok(flow, `no flow cookie: went to ${loc(s)}`);
  const to = new URL(loc(s));
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', email);
  if (hd !== undefined) to.searchParams.set('fake_hd', hd);
  if (sub) to.searchParams.set('fake_sub', sub);
  const a = await fetch(to, { redirect: 'manual' });
  const cb = new URL(loc(a));
  const r = await get(cb.pathname + cb.search, [cookie, flow].filter(Boolean).join('; '));
  r.session = cookieOf(r, 'brb_session');
  return r;
}
const meOf = async cookie => (await (await fetch(base + '/api/me', { headers: { cookie } })).json()).user;

// ---------------------------------------------------------------- kid
test('kid: a fun name and a password, then "Got a class code?" (or a family code to give a grown-up), skippable', async () => {
  const name = uname('Kiddo');
  const r = await post('/api/auth/signup', { username: name, password: 'rainbow-77' });
  assert.equal(r.status, 200, JSON.stringify(r.json2));
  const page = await get('/signup/kid/code', r.session);
  assert.equal(page.status, 200);
  const t = page.body2;
  assert.match(t, /<h1 class="center ob-h" id="ob-h">Got a class code\?<\/h1>/);
  assert.match(t, /<span class="ob-count">Step 2 of 2<\/span>/);
  assert.match(t, /<form data-api="\/api\/classes\/join" novalidate>/);
  assert.match(t, /data-family-code/, 'families on: the kid can get a code for their grown-up');
  assert.match(t, /Only give this code to your parent or guardian, face to face/);
  assert.match(t, /<a class="btn btn-block" href="\/" id="ob-skip">Skip for now<\/a>/);
  assert.doesNotMatch(t, /type="email"|name="email"|gbtn|auth\/google/, 'never an email or Google for a kid');
  // A class code joins the class the usual way (an own account waits for the teacher).
  const admin = auth.createUser({ username: uname('KAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool(admin, { name: `Kid School ${n}` }).school; S.addMember(admin, s.id, admin.id, 'admin', { rosterName: 'Ms A' });
  const c = S.createClass(admin, s.id, { name: '3C', grade: '3' }).class;
  const j = await post('/api/classes/join', { code: c.join_code }, r.session);
  assert.equal(j.status, 200); assert.equal(j.json2.state, 'pending');
  // The family code: the same as Me › For grown-ups.
  const code = await post('/api/me/family/code', {}, r.session);
  assert.equal(code.status, 200); assert.match(code.json2.code, /^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  // Families off: no family code part. Not a kid's own account: no code step.
  config.stripeApiKey = '';
  assert.doesNotMatch((await get('/signup/kid/code', r.session)).body2, /data-family-code/);
  config.stripeApiKey = 'rk_test_fake';
  assert.equal(loc(await get('/signup/kid/code')), '/signup/kid');
  const g = auth.createUser({ username: uname('KGrown'), password: PW, accountType: 'grownup' });
  assert.equal(loc(await get('/signup/kid/code', cookieFor(g.id))), '/family');
});

// ---------------------------------------------------------------- parent
test('parent: the "18 or older" box, Sign up with Google or a username and password, then "Add your kids" (step 2 of 2)', async () => {
  const page = (await get('/signup/parent')).body2;
  assert.match(page, /<h1 class="center ob-h" id="ob-h">Make your parent account<\/h1>/);
  assert.match(page, /<span class="ob-count">Step 1 of 2<\/span>/);
  assert.match(page, /name="adult" value="1"> <span>I am a parent or guardian, 18 or older\.<\/span>/);
  assert.match(page, /<button class="gbtn" type="submit" name="via" value="google">/);
  assert.match(page, /We keep your Google email to sign you in and for account emails\./);
  assert.ok(page.indexOf('name="adult"') < page.indexOf('name="via"') && page.indexOf('name="via"') < page.indexOf('name="username"'), 'the box first, then Google, then the password');
  assert.doesNotMatch(page, /\$\d/, 'no prices');
  // With a password: "Add your kids", which shows the second dot.
  const name = uname('Mum');
  const r = await post('/api/grown-ups/signup', { username: name, password: PW, confirm: PW, adult: '1' });
  assert.equal(r.status, 200); assert.equal(r.json2.redirect, '/family/add?from=signup');
  const add = (await get('/family/add?from=signup', r.session)).body2;
  assert.match(add, /<span class="ob-count">Step 2 of 2<\/span>/); assert.match(add, /Add your kids|Link my child/);
  assert.equal(auth.getUserByName(name).account_type, 'grownup');
});

test('parent with Google: the box is checked first; a personal Gmail makes a grown-up account with the verified email; next time it signs in', async () => {
  const no = await post('/api/grown-ups/signup', { via: 'google' });
  assert.equal(no.status, 400); assert.equal(no.json2.field, 'adult');
  const ok = await post('/api/grown-ups/signup', { via: 'google', adult: '1' });
  assert.equal(ok.status, 200);
  assert.match(ok.json2.redirect, /^\/auth\/google\/start\?intent=signup&t=/);
  // Without the page's token, Google is never started for a sign-up.
  assert.equal(loc(await get('/auth/google/start?intent=signup&as=grownup')), '/signup/parent?gerr=expired');
  const before = q.get('SELECT COUNT(*) n FROM users').n;
  const r = await google(ok.json2.redirect, { email: 'maria.parent@gmail.com' });
  assert.equal(r.status, 303); assert.equal(loc(r), '/family/add?from=signup');
  assert.ok(r.session);
  const me = await meOf(r.session);
  const u = auth.getUser(me.id);
  assert.equal(u.account_type, 'grownup'); assert.equal(u.password_hash, null); assert.ok(F.familyOfOwner(u.id), 'their family is ready');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, before + 1);
  assert.deepEqual(E.addressOf(u.id), { email: 'maria.parent@gmail.com', source: 'google' }, 'the verified email is kept (sign-in, resets, account emails)');
  assert.ok(!/Maria|maria/.test(u.username + u.display_name), 'the Google name and email never become the username');
  assert.equal(q.get("SELECT method FROM sign_ins WHERE user_id=? ORDER BY at DESC", u.id).method, 'signup');
  // The same Google account again (sign-up or sign-in): the same account, never a second one.
  const again = await google((await post('/api/grown-ups/signup', { via: 'google', adult: '1' })).json2.redirect, { email: 'maria.parent@gmail.com' });
  assert.equal((await meOf(again.session)).id, u.id);
  const li = await google('/auth/google/start', { email: 'maria.parent@gmail.com' });
  assert.equal((await meOf(li.session)).id, u.id); assert.equal(loc(li), '/family');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, before + 1);
  // Their family account page has the Google panel (no password to change, nothing to disconnect).
  const acct = (await get('/family/account', li.session)).body2;
  assert.match(acct, /id="google"/); assert.match(acct, /Connected to ⁦?maria\.parent@gmail\.com/);
  assert.match(acct, /You sign in with Google, so there’s no password to change\./);
  // A plan picked on /plans comes along through Google too.
  const p = await post('/api/grown-ups/signup', { via: 'google', adult: '1', plan: 'family', interval: 'year' });
  assert.match(p.json2.redirect, /&next=%2Ffamily%3Fplan%3Dfamily%26interval%3Dyear$/);
  const pr = await google(p.json2.redirect, { email: 'plan.parent@gmail.com' });
  assert.equal(loc(pr), '/family?plan=family&interval=year');
});

test('an email never links two accounts: a password grown-up who signs in with Google is turned away kindly and connects it from their account page', async () => {
  const name = uname('Papa');
  const made = await post('/api/grown-ups/signup', { username: name, password: PW, confirm: PW, adult: '1' });
  const dad = auth.getUserByName(name);
  E.rememberAddress(dad.id, 'dad.home@gmail.com', 'checkout');
  // Signing in with a Google account we don't know (the same address) makes nothing and links nothing.
  const before = q.get('SELECT COUNT(*) n FROM users').n;
  const li = await google('/auth/google/start', { email: 'dad.home@gmail.com' });
  assert.equal(loc(li), '/login?gerr=unknown');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, before); assert.equal(q.get('SELECT 1 FROM google_identities WHERE user_id=?', dad.id), undefined);
  const login = (await get('/login?gerr=unknown')).body2;
  assert.match(login, /Parent or teacher\? <a href="\/signup">Make your account<\/a> and choose Sign up with Google\./);
  // On their family account page, with their password: connected (by Google's id).
  const panel = (await get('/family/account', made.session)).body2;
  assert.match(panel, /data-api="\/api\/me\/google\/connect"/);
  const c = await post('/api/me/google/connect', { current: PW }, made.session);
  assert.equal(c.status, 200, JSON.stringify(c.json2));
  const linked = await google(c.json2.redirect, { email: 'dad.home@gmail.com', cookie: made.session });
  assert.equal(loc(linked), '/me?google=connected#google');
  assert.equal(loc(await get('/me?google=connected', made.session)), '/family/account?google=connected', 'a grown-up lands on their account page');
  assert.equal(q.get('SELECT user_id FROM google_identities WHERE email=?', 'dad.home@gmail.com').user_id, dad.id);
  assert.equal((await meOf((await google('/auth/google/start', { email: 'dad.home@gmail.com' })).session)).id, dad.id);
});

// ---------------------------------------------------------------- teacher
async function teacher(over = {}) {
  const username = uname('Teach');
  const r = await post('/api/onboarding/teacher', { username, password: 'zebra-violin-42-x', confirm: 'zebra-violin-42-x', adult: '1', ...over });
  assert.equal(r.status, 200, JSON.stringify(r.json2));
  return { cookie: r.session, user: auth.getUserByName(username), r };
}
test('teacher: the account, then the school step (create, join or skip); signing in again comes back to it', async () => {
  const page = (await get('/signup/teacher')).body2;
  assert.match(page, /Make your teacher account/); assert.match(page, /<span class="ob-count">Step 1 of 3<\/span>/);
  assert.match(page, /I am a teacher or school staff member, and 18 or older\./); assert.match(page, /name="via" value="google"/);
  // Every mistake at once; the box first.
  assert.equal((await post('/api/onboarding/teacher', { username: 'ok_name1', password: PW, confirm: PW })).json2.field, 'adult');
  const bad = await post('/api/onboarding/teacher', { username: 'a b', password: 'short', confirm: 'x', adult: '1' });
  assert.equal(bad.status, 400); assert.deepEqual(Object.keys(bad.json2.errors), ['username', 'password']);
  assert.equal((await post('/api/onboarding/teacher', { username: uname('Tq'), password: PW, confirm: 'another-one-12', adult: '1' })).json2.field, 'confirm');
  const t = await teacher();
  assert.equal(t.r.json2.redirect, '/signup/teacher/school');
  assert.equal(t.user.signup_as, 'teacher'); assert.equal(auth.accountKind(t.user), 'standard', 'not staff until the school step');
  assert.equal(homeFor(t.user), '/signup/teacher/school', 'signing in again goes back to the school step');
  assert.equal(loc(await get('/signup', t.cookie)), '/signup/teacher/school');
  const school = (await get('/signup/teacher/school', t.cookie)).body2;
  assert.match(school, /<h1 class="center ob-h" id="ob-h">Your school<\/h1>/); assert.match(school, /Step 2 of 3/);
  assert.match(school, /href="\/signup\/teacher\/school\?how=create"[\s\S]*Create my school[\s\S]*href="\/signup\/teacher\/school\?how=join"[\s\S]*Join my school[\s\S]*href="\/signup\/teacher\/school\?how=own"[\s\S]*Skip for now/);
  assert.doesNotMatch(school, /ob-back/, 'the account exists: no way back to it');
});

test('teacher creates the school: its admin at once, with a request for our team when an email is given; then at least one class with a grade', async () => {
  const t = await teacher();
  const form = (await get('/signup/teacher/school?how=create', t.cookie)).body2;
  assert.match(form, /Create your school/); assert.match(form, /name="school"/); assert.match(form, /name="name"/); assert.match(form, /name="email" type="email"/);
  assert.match(form, /<a class="ob-back" href="\/signup\/teacher\/school">/);
  const bad = await post('/api/onboarding/school', { how: 'create', school: 'x', name: '', email: 'nope' }, t.cookie);
  assert.deepEqual(Object.keys(bad.json2.errors), ['school', 'name', 'email']);
  const r = await post('/api/onboarding/school', { how: 'create', school: 'Elm Primary', name: 'Ms Rivera', email: 'Rivera@Elm.example', tz: 'America/Chicago' }, t.cookie);
  assert.equal(r.status, 200); assert.equal(r.json2.redirect, '/signup/teacher/classes');
  const u = auth.getUser(t.user.id);
  const [s] = S.schoolsOf(u.id);
  assert.equal(s.name, 'Elm Primary'); assert.equal(s.role, 'admin', 'the creator is the school admin');
  assert.equal(auth.accountKind(u), 'staff'); assert.equal(u.signup_as, ''); assert.equal(u.display_name, 'Ms Rivera');
  assert.equal(S.zoneOf(S.getSchool(s.id)), 'America/Chicago');
  const req = q.get('SELECT * FROM school_requests WHERE school_id=?', s.id);
  assert.equal(req.status, 'open'); assert.equal(req.email, 'rivera@elm.example'); assert.equal(req.contact_name, 'Ms Rivera'); assert.equal(req.user_id, u.id);
  assert.equal(E.addressOf(u.id).email, 'rivera@elm.example');
  assert.equal((await post('/api/onboarding/school', { how: 'create', school: 'Twice', name: 'Ms Rivera' }, t.cookie)).status, 409, 'only once');
  // Classes: required, each with a name and a grade.
  const page = (await get('/signup/teacher/classes', t.cookie)).body2;
  assert.match(page, /Add your classes/); assert.match(page, /Step 3 of 3/); assert.match(page, /<option value="K">Kindergarten<\/option>/); assert.match(page, /<option value="8">Grade 8<\/option>/);
  assert.match(page, /data-ob-add/); assert.match(page, /<template data-ob-class-template>/);
  const sid = /name="schoolId" value="([^"]+)"/.exec(page)[1];
  assert.equal((await post('/api/onboarding/classes', { schoolId: sid, name: [''], grade: [''] }, t.cookie)).json2.error, 'Add at least one class.');
  assert.equal((await post('/api/onboarding/classes', { schoolId: sid, name: ['4B'], grade: [''] }, t.cookie)).json2.error, 'Pick a grade for each class.');
  assert.equal((await post('/api/onboarding/classes', { schoolId: sid, name: ['', 'x'], grade: ['3', '3'] }, t.cookie)).json2.error, 'Give the class a name.');
  assert.equal((await post('/api/onboarding/classes', { schoolId: 'nope', name: ['4B'], grade: ['4'] }, t.cookie)).status, 400);
  const c = await post('/api/onboarding/classes', { schoolId: sid, name: ['4B', 'Room 12', ''], grade: ['4', 'K', ''] }, t.cookie);
  assert.equal(c.status, 200); assert.equal(c.json2.toast, '2 classes added'); assert.equal(c.json2.redirect, '/signup/teacher/done');
  assert.deepEqual(S.classesOf(u.id, 'teacher').map(x => [x.name, x.grade]).sort(), [['4B', '4'], ['Room 12', 'K']]);
  // Back on the step: their classes, Continue, and a way to add more.
  const again = (await get('/signup/teacher/classes', t.cookie)).body2;
  assert.match(again, /id="ob-classes-next">Continue/); assert.match(again, /Room 12/);
  // Classroom off: straight on; done: My classes with "{school} is ready" (our team has the request).
  assert.equal(loc(await get('/signup/teacher/classroom', t.cookie)), '/signup/teacher/done');
  assert.equal(loc(await get('/signup/teacher/done', t.cookie)), '/teach?welcome=school');
});

test('teacher skips the school: their own classroom (no request, no email); the done step says nothing it cannot keep', async () => {
  const t = await teacher();
  assert.match((await get('/signup/teacher/school?how=own', t.cookie)).body2, /Your own classroom/);
  const r = await post('/api/onboarding/school', { how: 'own', name: 'Mr Okafor' }, t.cookie);
  assert.equal(r.status, 200);
  const [s] = S.schoolsOf(t.user.id);
  assert.equal(s.name, 'Mr Okafor’s classroom'); assert.equal(s.role, 'admin');
  assert.equal(q.get('SELECT COUNT(*) n FROM school_requests WHERE school_id=?', s.id).n, 0);
  assert.equal(loc(await get('/signup/teacher/done', t.cookie)), '/signup/teacher/classes', 'no class yet: not done');
  const sid = S.classSchoolsFor(auth.getUser(t.user.id))[0].id;
  assert.equal((await post('/api/onboarding/classes', { schoolId: sid, name: 'Math 6', grade: '6' }, t.cookie)).status, 200, 'one row sent as plain fields');
  assert.equal(loc(await get('/signup/teacher/done', t.cookie)), '/teach');
});

test('teacher joins their school: a school admin\'s invite (by username) is accepted on the step, then the classes', async () => {
  const t = await teacher();
  const join = (await get('/signup/teacher/school?how=join', t.cookie)).body2;
  assert.match(join, /Ask your school’s Oomba Academy admin to add you/);
  assert.ok(join.includes(`data-copy="${t.user.username}"`), 'their username, to copy');
  assert.match(join, /href="\/signup\/teacher\/school\?how=own">Start with my own classroom for now/);
  const admin = auth.createUser({ username: uname('JAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool(admin, { name: `Join School ${n}` }).school; S.addMember(admin, s.id, admin.id, 'admin', { rosterName: 'Ms Head' });
  assert.equal(S.inviteStaff(admin, s.id, t.user.id, 'teacher', { rosterName: 'Mx Lee' }).ok, true);
  const page = (await get('/signup/teacher/school?how=join', t.cookie)).body2;
  assert.ok(page.includes(`data-api="/api/onboarding/invite/${s.id}"`)); assert.match(page, /wants to add you as Teacher/);
  const a = await post(`/api/onboarding/invite/${s.id}`, {}, t.cookie);
  assert.equal(a.status, 200); assert.equal(a.json2.redirect, '/signup/teacher/classes');
  const u = auth.getUser(t.user.id);
  assert.equal(S.membership(s.id, u.id).role, 'teacher'); assert.equal(u.signup_as, '');
  assert.match((await get('/signup/teacher/classes', t.cookie)).body2, /Add your classes/);
  // A school whose admin makes the classes: nothing to add, Continue.
  S.updateSchool(admin, s.id, { settings: { teachersCreateClasses: false } });
  assert.match((await get('/signup/teacher/classes', t.cookie)).body2, /your school admin makes the classes/);
});

test('teacher with Google: an own (teacher-to-be) account with the verified email, then the school step; a Workspace staff invite still makes a school account', async () => {
  const ok = await post('/api/onboarding/teacher', { via: 'google', adult: '1', trial: '1' });
  assert.equal(ok.status, 200); assert.match(ok.json2.redirect, /next=%2Fsignup%2Fteacher%2Fschool%3Ftrial%3D1$/);
  const r = await google(ok.json2.redirect, { email: 'ms.teach@gmail.com' });
  assert.equal(loc(r), '/signup/teacher/school?trial=1');
  const u = auth.getUser((await meOf(r.session)).id);
  assert.equal(u.account_type, 'kid'); assert.equal(u.signup_as, 'teacher'); assert.equal(u.managed_school, '');
  assert.equal(q.get('SELECT email FROM google_identities WHERE user_id=?', u.id).email, 'ms.teach@gmail.com');
  // The email is offered on the create step.
  assert.match((await get('/signup/teacher/school?how=create&trial=1', r.session)).body2, /value="ms\.teach@gmail\.com"/);
  // The school Google flows are unchanged: a staff invite on the school's Workspace domain wins over a sign-up.
  const admin = auth.createUser({ username: uname('GAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool(admin, { name: `G School ${n}` }).school; S.addMember(admin, s.id, admin.id, 'admin', { rosterName: 'Ms G' });
  S.updateSchool(admin, s.id, { settings: { googleDomains: ['dwes.test'] } });
  const G = await import('../../server/services/google.js');
  assert.equal(G.createStaffInvite(admin, s.id, { email: 'new.teach@dwes.test', rosterName: 'Mr New', role: 'teacher' }).ok, true);
  const w = await google((await post('/api/onboarding/teacher', { via: 'google', adult: '1' })).json2.redirect, { email: 'new.teach@dwes.test', hd: 'dwes.test' });
  const su = auth.getUser((await meOf(w.session)).id);
  assert.equal(su.managed_school, s.id, 'the school account from the invite'); assert.equal(S.membership(s.id, su.id).role, 'teacher');
  // Kids never sign up with Google: there is no kid path for it.
  assert.equal(loc(await get('/auth/google/start?intent=signup&t=bad&as=kid')), '/signup?gerr=expired');
});

test('the trial: /trial (signed out) runs the teacher steps and comes back to /trial; prices stay off the sign-up', async () => {
  assert.equal(loc(await get('/trial')), '/signup/teacher?trial=1');
  const t = await teacher({ trial: '1', seats: '3' });
  assert.equal(t.r.json2.redirect, '/signup/teacher/school?trial=1&seats=3');
  const steps = (await get('/signup/teacher/school?trial=1&seats=3', t.cookie)).body2;
  assert.match(steps, /how=create&amp;trial=1&amp;seats=3|how=create&trial=1&seats=3/);
  assert.doesNotMatch(steps, /\$\d/);
  const s = await post('/api/onboarding/school', { how: 'own', name: 'Ms Trial', trial: '1', seats: '3' }, t.cookie);
  assert.equal(s.json2.redirect, '/signup/teacher/classes?trial=1&seats=3');
  const sid = S.classSchoolsFor(auth.getUser(t.user.id))[0].id;
  const c = await post('/api/onboarding/classes', { schoolId: sid, name: ['5A'], grade: ['5'], trial: '1', seats: '3' }, t.cookie);
  assert.equal(c.json2.redirect, '/signup/teacher/done?trial=1&seats=3');
  assert.equal(loc(await get('/signup/teacher/done?trial=1&seats=3', t.cookie)), '/trial?seats=3');
  const trial = (await get('/trial', t.cookie)).body2;
  assert.match(trial, /Start your 14-day free trial/, 'the trial starts as before, from here');
});

test('who may be on the teacher steps: never a kid\'s own account, a grown-up or a school-made account', async () => {
  const k = auth.createUser({ username: uname('NotTeach'), password: 'rainbow-77' });
  const kc = cookieFor(k.id);
  for (const p of ['/signup/teacher/school', '/signup/teacher/school?how=create', '/signup/teacher/classes', '/signup/teacher/classroom']) assert.equal(loc(await get(p, kc)), '/', p);
  assert.equal((await post('/api/onboarding/school', { how: 'create', school: 'Sneaky', name: 'Me Me' }, kc)).status, 409);
  assert.equal(S.schoolsOf(k.id).length, 0, 'a kid never makes themselves a school admin');
  assert.equal((await post('/api/onboarding/teacher', { username: uname('Tx'), password: PW, confirm: PW, adult: '1' }, kc)).status, 409, 'signed in: no second account');
  const g = auth.createUser({ username: uname('GTeach'), password: PW, accountType: 'grownup' });
  assert.equal(loc(await get('/signup/teacher/school', cookieFor(g.id))), '/family');
  // Signed out: the account step first.
  assert.equal(loc(await get('/signup/teacher/classes')), '/signup/teacher');
  // Google off: no Google button, and its API answers like an unknown page.
  config.googleClientId = '';
  assert.doesNotMatch((await get('/signup/teacher')).body2, /name="via"/);
  assert.equal((await post('/api/onboarding/teacher', { via: 'google', adult: '1' })).status, 404);
});

test('Connect Google Classroom? (when it is on): the existing connect flow for the first class, or Skip', async () => {
  const t = await teacher();
  await post('/api/onboarding/school', { how: 'own', name: 'Ms Class' }, t.cookie);
  const sid = S.classSchoolsFor(auth.getUser(t.user.id))[0].id;
  config.googleClassroom = true;
  const c = await post('/api/onboarding/classes', { schoolId: sid, name: ['7B'], grade: ['7'] }, t.cookie);
  assert.equal(c.json2.redirect, '/signup/teacher/classroom');
  const page = (await get('/signup/teacher/classroom', t.cookie)).body2;
  assert.match(page, /Connect Google Classroom\?/); assert.match(page, /Step 4 of 4/);
  const cls = S.classesOf(t.user.id, 'teacher')[0];
  // The connect button needs the token key; without it the step says it can be done later. Skip always works.
  assert.ok(/data-api="\/api\/google-classroom\/connect"/.test(page) || /connect Google Classroom later/.test(page));
  if (/google-classroom\/connect/.test(page)) assert.ok(page.includes(`name="back" value="${cls.id}"`));
  assert.match(page, /href="\/signup\/teacher\/done" id="ob-skip">Skip for now/);
});
