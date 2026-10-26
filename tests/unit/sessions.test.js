// Accounts: changing your password, signing out everywhere, and how long a sign-in lasts for each kind of account
// (school students, school staff and the platform admin, own accounts and guests). Time runs on a fake clock.
import './_setup.js';
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
const auth = await import('../../server/auth.js');
const { q, migrate, MIGRATIONS } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const S = await import('../../server/services/schools.js');
const RL = await import('../../server/services/ratelimit.js');
const { PASSWORD_CHANGE, LOGIN } = await import('../../server/routes/auth.js');
const { createApp } = await import('../../server/app.js');

let server, base;
// keepAliveTimeout 0: bcrypt-heavy steps can hold the event loop past the default 5 s idle timer, which would then close a
// kept-alive socket just as the next fetch reuses it (ECONNRESET, "fetch failed"), as in class-sharing.test.js.
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => RL._reset());
test.afterEach(() => mock.timers.reset());

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const cookieOf = (r, name = 'brb_session') => (r.headers.getSetCookie().find(c => c.startsWith(`${name}=`) && !c.startsWith(`${name}=;`)) || '').split(';')[0];
const cleared = (r, name) => r.headers.getSetCookie().some(c => c.startsWith(`${name}=;`) && /Max-Age=0/.test(c));
const sidOf = c => { const tok = decodeURIComponent(c.split('=')[1]); return tok.slice(0, tok.lastIndexOf('.')); };
const post = (path, body, cookie, headers = {}) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers }, body: JSON.stringify(body) });
const get = (path, cookie, headers = {}) => fetch(base + path, { redirect: 'manual', headers: { ...(cookie ? { cookie } : {}), ...headers } });
/** Opening a page in the browser tab (what counts as activity, unlike a fetch). */
const visit = (path, cookie) => get(path, cookie, { 'sec-fetch-dest': 'document', 'sec-fetch-mode': 'navigate' });
/** A GET with no fetch metadata at all, like an old browser opening a page (fetch() always adds Sec-Fetch-Mode). */
const bareGet = (path, cookie) => new Promise((ok, no) => http.get(base + path, { headers: { cookie } }, r => { r.resume(); r.on('end', () => ok(r.statusCode)); }).on('error', no));
const me = async cookie => (await (await get('/api/me', cookie)).json()).user;
const change = (cookie, current, password, confirm = password) => post('/api/me/password', { current, password, confirm }, cookie);
const sessionsOf = id => q.get('SELECT COUNT(*) n FROM sessions WHERE user_id=? AND expires_at>?', id, Date.now()).n;
const lastActive = c => q.get('SELECT last_active FROM sessions WHERE id=?', sidOf(c)).last_active;

const boss = auth.createUser({ username: 'SessBoss', password: 'boss-pass-1234', role: 'admin' });
const school = S.createSchool(boss, { name: 'Session Primary' }).school;
const teacherCard = S.createSchoolAccount(boss, school.id, { rosterName: 'Tia Teach', role: 'teacher' });
const teacher = teacherCard.user;
const kidCard = S.createSchoolAccount(teacher, school.id, { rosterName: 'Kim Kid' });
const kid = kidCard.user;
const ownTeacher = auth.createUser({ username: 'OwnTeacher', password: 'blue-otter-42' });
S.addMember(boss, school.id, ownTeacher.id, 'teacher', { rosterName: 'Olu Own' });
const cls = S.createClass(teacher, school.id, { name: 'Session Class' }).class;
S.addToClass(teacher, cls.id, kid.id);

test('account kinds: school students, staff (school or platform admin), and everyone else', () => {
  assert.equal(auth.accountKind(kid), 'student');
  assert.equal(auth.accountKind(teacher), 'staff', 'a school-made staff account is staff');
  assert.equal(auth.accountKind(ownTeacher), 'staff', 'an own account that teaches is staff');
  assert.equal(auth.accountKind(boss), 'staff', 'the platform admin');
  assert.equal(auth.accountKind(auth.createUser({ username: 'PlainKid', password: 'blue-otter-42' })), 'standard');
  assert.equal(auth.accountKind(auth.createGuest()), 'standard');
  assert.ok(q.all('PRAGMA table_info(sessions)').some(c => c.name === 'last_active'), 'migration added sessions.last_active');
});

test('change password: rules, current password, confirm; every session ends, this device gets a fresh one, and it is audited', async () => {
  const u = auth.createUser({ username: 'ChangeMe', password: 'blue-otter-42' });
  const here = cookieFor(u.id), phone = cookieFor(u.id), laptop = cookieFor(u.id);
  const bad = async (body, field, status = 400) => { const r = await post('/api/me/password', body, here); assert.equal(r.status, status, JSON.stringify(body)); const j = await r.json(); assert.equal(j.field, field, j.error); return j.error; };
  assert.equal(await bad({ current: '', password: 'green-panda-77', confirm: 'green-panda-77' }, 'current'), 'Type your current password.');
  await bad({ current: 'blue-otter-42', password: '123', confirm: '123' }, 'password');
  await bad({ current: 'blue-otter-42', password: 'password', confirm: 'password' }, 'password');
  await bad({ current: 'blue-otter-42', password: 'changeme-77', confirm: 'changeme-77' }, 'password'); // has the username in it
  assert.equal(await bad({ current: 'blue-otter-42', password: 'green-panda-77', confirm: 'green-panda-78' }, 'confirm'), "The two new passwords don't match.");
  assert.equal(await bad({ current: 'wrong-pass-00', password: 'green-panda-77', confirm: 'green-panda-77' }, 'current'), "That isn't your current password.");
  await bad({ current: 'blue-otter-42', password: 'blue-otter-42', confirm: 'blue-otter-42' }, 'password');
  assert.equal(sessionsOf(u.id), 3, 'nothing changed yet');

  const r = await change(here, 'blue-otter-42', 'green-panda-77');
  assert.equal(r.status, 200); assert.match((await r.json()).toast, /Password changed/);
  const fresh = cookieOf(r);
  assert.ok(fresh && fresh !== here, 'a new session cookie');
  assert.equal((await me(fresh)).username, 'ChangeMe', 'still signed in on this device');
  assert.equal(await me(here), null, 'the old cookie of this device is no use any more (a copy of it neither)');
  assert.equal(await me(phone), null, 'other devices signed out'); assert.equal(await me(laptop), null);
  assert.equal(sessionsOf(u.id), 1);
  assert.ok(auth.verifyPassword(auth.getUser(u.id), 'green-panda-77')); assert.ok(!auth.verifyPassword(auth.getUser(u.id), 'blue-otter-42'));
  const log = q.get("SELECT * FROM audit_log WHERE action='user.password_change' AND actor_id=?", u.id);
  assert.ok(log); assert.equal(JSON.parse(log.details).otherSessionsEnded, 2);
  assert.ok(!JSON.stringify(log).includes('green-panda-77'), 'the password is never logged');
});

test('ADMIN_PASSWORD is applied when it is new or changed, so a password the admin changes on the Me page survives restarts', async () => {
  const { applyAdminPassword } = await import('../../scripts/seed.js');
  const a = auth.createUser({ username: 'EnvAdmin', password: 'first-start-pass-1', role: 'admin' });
  assert.equal(applyAdminPassword(a, 'env-pass-123456'), true, 'first start with it: applied');
  assert.ok(auth.verifyPassword(auth.getUser(a.id), 'env-pass-123456'));
  assert.equal(applyAdminPassword(a, 'env-pass-123456'), false, 'the same value at the next start: nothing to do');
  assert.equal((await change(cookieFor(a.id), 'env-pass-123456', 'rotated-on-me-page-9')).status, 200);
  assert.equal(applyAdminPassword(a, 'env-pass-123456'), false, 'a restart keeps the password changed on the Me page');
  assert.ok(auth.verifyPassword(auth.getUser(a.id), 'rotated-on-me-page-9'));
  assert.equal(applyAdminPassword(a, 'new-env-pass-7890'), true, 'a new ADMIN_PASSWORD resets it (a forgotten password)');
  assert.ok(auth.verifyPassword(auth.getUser(a.id), 'new-env-pass-7890'));
  assert.ok(!JSON.stringify(q.all('SELECT * FROM settings')).includes('env-pass'), 'only a hash is kept');
});

test('staff and the platform admin need 12 characters; own accounts 6', async () => {
  for (const [u, pw] of [[teacher, teacherCard.password], [ownTeacher, 'blue-otter-42'], [boss, 'boss-pass-1234']]) {
    const c = cookieFor(u.id);
    const r = await change(c, pw, 'green-pand7');   // 11 characters
    assert.equal(r.status, 400, u.username); const j = await r.json();
    assert.equal(j.field, 'password'); assert.equal(j.error, "That's only 11 characters. Use at least 12.", 'says something the hint above does not');
    assert.equal((await change(c, pw, 'green-panda-77x')).status, 200, `${u.username}: 15 characters is fine`);
  }
  const own = auth.createUser({ username: 'ShortOk', password: 'blue-otter-42' });
  assert.equal((await change(cookieFor(own.id), 'blue-otter-42', 'tulip9')).status, 200, '6 characters for an own account');
  // the Me page says which rule applies
  const page = async u => (await (await get('/me', cookieFor(u.id))).text());
  assert.match(await page(ownTeacher), /At least 12 characters, because staff accounts/);
  assert.match(await page(own), /At least 6 characters/);
});

test('staff who sign in with a short password are asked for a longer one until they change it', async () => {
  const shorty = auth.createUser({ username: 'ShortStaff', password: 'tulip-42' });
  S.addMember(boss, school.id, shorty.id, 'teacher');
  const signIn = async (username, password) => { const r = await post('/api/auth/login', { username, password }); assert.equal(r.status, 200, username); return cookieOf(r); };
  const c = await signIn('ShortStaff', 'tulip-42');
  assert.equal(auth.getUser(shorty.id).password_short, 1);
  for (const path of ['/me', '/teach', '/']) {
    const h = await (await get(path, c)).text();
    assert.match(h, /Your password is shorter than 12 characters\. Staff accounts can see children's work, so please <a href="\/me#password">choose a longer one<\/a>\./, path);
  }
  // a long enough password, or an own account: no notice
  const longer = auth.createUser({ username: 'LongStaff', password: 'tulip-rocket-42' });
  S.addMember(boss, school.id, longer.id, 'teacher');
  assert.doesNotMatch(await (await get('/me', await signIn('LongStaff', 'tulip-rocket-42'))).text(), /shorter than 12/);
  auth.createUser({ username: 'ShortKid', password: 'tulip-42' });
  assert.doesNotMatch(await (await get('/me', await signIn('ShortKid', 'tulip-42'))).text(), /shorter than 12/);
  assert.equal(auth.getUserByName('ShortKid').password_short, 0);
  // changing it clears the notice
  const r = await change(c, 'tulip-42', 'tulip-rocket-4242');
  assert.equal(r.status, 200);
  assert.equal(auth.getUser(shorty.id).password_short, 0);
  assert.doesNotMatch(await (await get('/me', cookieOf(r))).text(), /shorter than 12/);
});

test('school students are told their teacher looks after the password; guests see no form', async () => {
  const c = cookieFor(kid.id);
  const r = await change(c, kidCard.password, 'my-own-pass-11');
  assert.equal(r.status, 403); assert.equal((await r.json()).error, 'Your teacher looks after your password — ask them if you forget it.');
  assert.ok(auth.verifyPassword(auth.getUser(kid.id), kidCard.password), 'unchanged');
  const html = await (await get('/me', c)).text();
  assert.match(html, /Your teacher looks after your password/); assert.doesNotMatch(html, /data-api="\/api\/me\/password"/);
  const g = auth.createGuest(); const gc = cookieFor(g.id);
  assert.equal((await change(gc, 'x', 'green-panda-77')).status, 403);
  const gh = await (await get('/me', gc)).text();
  assert.doesNotMatch(gh, /id="password"/); assert.doesNotMatch(gh, /logout-everywhere/);
});

test('wrong current passwords are limited, and share one guess budget with the sign-in page', async () => {
  const u = auth.createUser({ username: 'Guesser', password: 'blue-otter-42' }); const c = cookieFor(u.id);
  for (let i = 0; i < PASSWORD_CHANGE.fails; i++) assert.equal((await change(c, `wrong-guess-${i}`, 'green-panda-77')).status, 400);
  const r = await change(c, 'blue-otter-42', 'green-panda-77');
  assert.equal(r.status, 429); assert.match((await r.json()).error, /Too many tries/);
  assert.ok(auth.verifyPassword(auth.getUser(u.id), 'blue-otter-42'));
  assert.equal(RL.count(RL.loginLockKey('Guesser')), PASSWORD_CHANGE.fails, 'the wrong guesses count toward the sign-in lock too');
  // the rest of the account's budget is used up at the sign-in page: now neither form takes guesses
  for (let i = PASSWORD_CHANGE.fails; i < LOGIN.userFails; i++) assert.equal((await post('/api/auth/login', { username: 'Guesser', password: `nope-${i}` })).status, 400);
  assert.equal((await post('/api/auth/login', { username: 'Guesser', password: 'blue-otter-42' })).status, 429, 'signing in waits');
  // a locked account can't be guessed at from a session left open either (even after the change form's own window)
  RL.clear(`pw-change-fail:${u.id}`);
  assert.equal((await change(c, 'blue-otter-42', 'green-panda-77')).status, 429);
  // rule mistakes don't use up the allowance (no bcrypt check)
  RL._reset();
  for (let i = 0; i < PASSWORD_CHANGE.fails + 2; i++) assert.equal((await change(c, 'blue-otter-42', '123')).status, 400);
  assert.equal(RL.count(RL.loginLockKey('Guesser')), 0);
  assert.equal((await change(c, 'blue-otter-42', 'green-panda-77')).status, 200);
});

test('sign out everywhere ends every session, this one too', async () => {
  const u = auth.createUser({ username: 'Everywhere', password: 'blue-otter-42' });
  const here = cookieFor(u.id), other = cookieFor(u.id);
  const r = await post('/api/auth/logout-everywhere', {}, here);
  assert.equal(r.status, 200); const j = await r.json();
  assert.equal(j.redirect, '/login'); assert.match(j.toast, /every device/);
  assert.ok(cleared(r, 'brb_session'), 'cookie cleared');
  assert.equal(await me(here), null); assert.equal(await me(other), null); assert.equal(sessionsOf(u.id), 0);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='user.signout_everywhere' AND actor_id=?", u.id));
  assert.equal((await post('/api/auth/logout-everywhere', {}, cookieFor(auth.createGuest().id))).status, 403, 'not for guests');
  // "Not you? Sign out" goes to the sign-in page; plain sign out still goes home
  assert.equal((await (await post('/api/auth/logout', { next: '/login' }, cookieFor(u.id))).json()).redirect, '/login');
  assert.equal((await (await post('/api/auth/logout', {}, cookieFor(u.id))).json()).redirect, '/');
  assert.equal((await (await post('/api/auth/logout', { next: '//evil.example' }, cookieFor(u.id))).json()).redirect, '/');
});

test('"Not you? Sign out" for students in a class, a plain Sign out on an own account\'s Me page', async () => {
  const notYou = /<form class="notyou small" data-api="\/api\/auth\/logout"><input type="hidden" name="next" value="\/login">/;
  const kc = cookieFor(kid.id);
  for (const path of ['/classes', `/class/${cls.id}`, '/me']) assert.match(await (await get(path, kc)).text(), notYou, `school student: ${path}`);
  assert.match(await (await get('/me', kc)).text(), /Not you\? Sign out/);
  // an own account that joined the class with a code: the same shared device, so the same line on the class pages
  const ownKid = auth.createUser({ username: 'OwnClassKid', password: 'blue-otter-42' });
  S.addMember(teacher, school.id, ownKid.id, 'student'); S.addToClass(teacher, cls.id, ownKid.id);
  const oc = cookieFor(ownKid.id);
  for (const path of ['/classes', `/class/${cls.id}`]) assert.match(await (await get(path, oc)).text(), /Signed in as <b><bdi>OwnClassKid<\/bdi><\/b>\./, `own account in a class: ${path}`);
  const meOwn = await (await get('/me', oc)).text();
  assert.doesNotMatch(meOwn, /Not you\?/, 'their own Me page just says Sign out');
  assert.match(meOwn, /<input type="hidden" name="next" value="\/"><button class="notyou-btn" type="submit">Sign out<\/button>/);
  // teachers don't get it on their class pages
  assert.doesNotMatch(await (await get(`/class/${cls.id}`, cookieFor(teacher.id))).text(), /class="notyou/);
});

// ---- session lifetimes, on a fake clock
const HOUR = 3600e3, DAY = 24 * HOUR, MIN = 60e3;
function clock() { mock.timers.enable({ apis: ['Date'], now: Date.now() }); return ms => mock.timers.tick(ms); }

test('school students: signed out after 1 hour without activity', async () => {
  const tick = clock(); const c = cookieFor(kid.id);
  tick(59 * MIN); assert.equal((await visit('/classes', c)).status, 200, '59 minutes idle: still in');
  tick(59 * MIN); assert.equal((await me(c)).username, kid.username, 'opening that page was activity');
  tick(2 * MIN);
  const r = await visit('/classes', c);
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/login?next=%2Fclasses&signedout=1', 'pages go to sign-in and come back');
  assert.ok(cleared(r, 'brb_session'), 'the stale cookie is dropped');
  assert.equal(await me(c), null);
  const api = await post('/api/progress/x/y/done', {}, c);
  assert.equal(api.status, 401); assert.deepEqual(await api.json(), { error: 'You were signed out. Please sign in again.', signedOut: true });
  const login = await (await get('/login?next=%2Fclasses&signedout=1')).text();
  assert.match(login, /<p class="notice warn" role="status">You were signed out\. Sign in again to carry on\.<\/p>/);
});

test('"you were signed out" is said once, on whatever page comes next', async () => {
  const tick = clock(); const c = cookieFor(kid.id);
  tick(2 * HOUR);
  const home = await visit('/', c);
  assert.equal(home.status, 200, 'the home page needs no sign-in');
  assert.match(await home.text(), /<p class="notice warn pagenote" role="status">You were signed out\. <a href="\/login\?next=%2F">Sign in again<\/a> to carry on\.<\/p>/);
  assert.doesNotMatch(await (await visit('/', '')).text(), /pagenote/, 'only once (the cookie is gone)');
});

test('school students: 10 hours at most, however active', async () => {
  const tick = clock(); const c = cookieFor(kid.id);
  for (let i = 0; i < 19; i++) { tick(30 * MIN); assert.equal((await visit('/classes', c)).status, 200, `active at ${(i + 1) / 2} h`); }
  tick(31 * MIN); assert.equal(await me(c), null, 'over 10 hours');
  const studio = await get('/build', c);
  assert.equal(studio.status, 302); assert.equal(studio.headers.get('location'), '/login?next=%2Fbuild&signedout=1', 'not the sign-up page');
  // the cookie lasts a day longer than the session, so the device can be told it ended
  let set = ''; auth.startSession({ append: (k, v) => { set = v; } }, kid.id);
  assert.match(set, /Max-Age=122400\b/);
});

test('the server decides what keeps a sign-in awake: opening pages and changing things, not background reads', async () => {
  const tick = clock(); const c = cookieFor(kid.id); const start = lastActive(c);
  const quiet = [
    ['a fetch of an API', () => get('/api/me', c)],
    ['live counts without the background header', () => get('/api/live?ids=x', c)],
    ['an API that does not exist', () => get('/api/nothing-here', c)],
    ['a page fetched by a script', () => get('/classes', c, { 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors' })],
    ['the game frame', () => get('/classes', c, { 'sec-fetch-dest': 'iframe', 'sec-fetch-mode': 'navigate' })],
    ['anything marked background', () => post('/api/me/theme', { theme: 'dark' }, c, { 'x-brb-background': '1' })],
  ];
  for (const [what, call] of quiet) { tick(2 * MIN); await call(); assert.equal(lastActive(c), start, what); }
  tick(2 * MIN); await visit('/classes', c); assert.equal(lastActive(c), Date.now(), 'opening a page');
  tick(2 * MIN); await post('/api/me/theme', { theme: 'light' }, c); assert.equal(lastActive(c), Date.now(), 'changing something');
  tick(2 * MIN); assert.equal(await bareGet('/classes', c), 200); assert.equal(lastActive(c), Date.now(), 'a page from a browser that sends no fetch headers');
  tick(2 * MIN); await bareGet('/api/me', c); assert.equal(lastActive(c), Date.now() - 2 * MIN, 'but not an API read');
});

test('a game left running does not keep a school student signed in; playing does', async () => {
  const game = '/api/games/no-such-game';
  const calls = (c, headers) => Promise.all([
    post(`${game}/heartbeat`, {}, c, headers), post(`${game}/save`, { data: {} }, c, headers), post(`${game}/score`, { score: 1 }, c, headers),
    post(`${game}/play`, {}, c, headers), post('/api/progress/x/y/game', { event: 'time', seconds: 30 }, c, headers),
  ]);
  let tick = clock(); let c = cookieFor(kid.id);
  for (let i = 0; i < 4; i++) { tick(15 * MIN); await calls(c); assert.ok(await me(c), `${(i + 1) * 15} minutes of a game on its own`); }
  tick(2 * MIN); assert.equal(await me(c), null, 'heartbeats, saves, scores and lesson time alone are not activity');
  mock.timers.reset();
  // the play page marks them X-Brb-Active after real input (a key, click or tap)
  tick = clock(); c = cookieFor(kid.id);
  for (let i = 0; i < 6; i++) { tick(15 * MIN); await calls(c, { 'x-brb-active': '1' }); }
  assert.equal((await me(c)).username, kid.username, 'an hour and a half of play');
});

test('activity is written at most once a minute per session', async () => {
  const tick = clock(); const c = cookieFor(kid.id);
  const first = lastActive(c);
  for (let i = 0; i < 5; i++) { tick(10e3); await visit('/classes', c); }
  assert.equal(lastActive(c), first, 'requests within the minute do not write');
  tick(15e3); await visit('/classes', c);
  assert.equal(lastActive(c), Date.now(), 'after a minute it is written');
});

test('staff and the platform admin: 12 hours idle, 7 days at most', async () => {
  for (const u of [teacher, ownTeacher, boss]) {
    let tick = clock(); let c = cookieFor(u.id);
    tick(11 * HOUR); assert.ok(await me(c), `${u.username} after 11 h idle`);
    tick(12 * HOUR + MIN); assert.equal(await me(c), null, `${u.username} after 12 h idle`);
    mock.timers.reset();
    tick = clock(); c = cookieFor(u.id);
    for (let h = 0; h < 7 * 24 - 11; h += 11) { tick(11 * HOUR); assert.equal((await visit('/me', c)).status, 200, `${u.username} active at ${h + 11} h`); }
    tick(11 * HOUR); assert.equal(await me(c), null, `${u.username} after 7 days`);
    mock.timers.reset();
  }
});

test('own accounts and guests keep 60 days, with no idle limit', async () => {
  const own = auth.createUser({ username: 'SixtyDays', password: 'blue-otter-42' });
  for (const u of [own, auth.createGuest()]) {
    const tick = clock(); const c = cookieFor(u.id);
    tick(59 * DAY); assert.ok(await me(c), `${u.username} after 59 days untouched`);
    tick(2 * DAY); assert.equal(await me(c), null, `${u.username} after 61 days`);
    mock.timers.reset();
  }
  // an own account signed in before becoming staff gets the staff rules from its next request
  const later = auth.createUser({ username: 'LaterStaff', password: 'blue-otter-42' });
  const tick = clock(); const c = cookieFor(later.id);
  S.addMember(boss, school.id, later.id, 'teacher');
  tick(8 * DAY); assert.equal(await me(c), null, 'now staff: 7 days at most');
});

test('signing in again after a timeout works, even with the old cookie still sent', async () => {
  const tick = clock(); const c = cookieFor(kid.id);
  tick(2 * HOUR); assert.equal(await me(c), null);
  const r = await post('/api/auth/login', { username: kid.username, password: kidCard.password }, c);
  assert.equal(r.status, 200); const fresh = cookieOf(r);
  assert.equal((await me(fresh)).username, kid.username, 'the new session works (the old cookie did not get in the way)');
});

test('after a sign-in ends on a shared device, the next child goes to their own home, not the last child\'s page', async () => {
  const other = S.createSchoolAccount(teacher, school.id, { rosterName: 'Kai Next' });
  const page = `/class/${cls.id}`;
  const login = (username, password, cookie) => post('/api/auth/login', { username, password, next: page }, cookie).then(async r => ({ r, redirect: (await r.json()).redirect }));
  const tick = clock(); const c = cookieFor(kid.id);
  tick(2 * HOUR);
  const left = await visit(page, c);
  assert.equal(left.headers.get('location'), `/login?next=${encodeURIComponent(page)}&signedout=1`);
  const ended = cookieOf(left, 'brb_ended'); assert.ok(ended, 'the device remembers whose sign-in ended');
  // someone else signs in: their own home, and the note is gone
  const b = await login(other.username, other.password, ended);
  assert.equal(b.redirect, '/classes'); assert.ok(cleared(b.r, 'brb_ended'));
  // the same child: back to the page
  assert.equal((await login(kid.username, kidCard.password, ended)).redirect, page);
  // the session was ended from another device (sign out everywhere, a new password): the same child comes back
  const elsewhere = cookieFor(kid.id); auth.endSessions(kid.id);
  const left2 = await visit(page, elsewhere);
  assert.equal((await login(kid.username, kidCard.password, cookieOf(left2, 'brb_ended'))).redirect, page);
  // a session already swept (nobody knows whose): own home, to be safe
  const swept = cookieFor(kid.id); q.run('DELETE FROM sessions WHERE id=?', sidOf(swept));
  const left3 = await visit(page, swept);
  assert.equal((await login(kid.username, kidCard.password, cookieOf(left3, 'brb_ended'))).redirect, '/classes');
  // the old session cookie sent with the sign-in itself (it ends in that same request)
  const stale = cookieFor(kid.id); tick(2 * HOUR);
  const c2 = await login(other.username, other.password, stale);
  assert.equal(c2.redirect, '/classes'); assert.ok(cleared(c2.r, 'brb_ended'), 'the note set in that request is cleared again');
  // nothing ended on this device: ?next= works as always
  assert.equal((await login(other.username, other.password)).redirect, page);
});

test('migration 0015 gives sessions the new caps would end at once one more hour', async () => {
  const sql = MIGRATIONS.find(([n]) => n === '0015_session_activity')[1].split('\n').filter(l => !/ALTER TABLE/.test(l)).join('\n');
  const own = auth.createUser({ username: 'OldOwn', password: 'blue-otter-42' });
  const t = Date.now(); const old = { [kid.id]: t - 30 * HOUR, [teacher.id]: t - 10 * DAY, [own.id]: t - 30 * DAY };
  const cookies = {};
  for (const [uid, created] of Object.entries(old)) {
    const id = `old-${uid}`; q.run('INSERT INTO sessions(id, user_id, created_at, expires_at, ua, last_active) VALUES (?,?,?,?,?,0)', id, uid, created, created + 60 * DAY, '');
    cookies[uid] = `brb_session=${encodeURIComponent(`${id}.${auth.sign(id)}`)}`;
  }
  migrate([['test_0015_again', sql]]);
  const row = uid => q.get('SELECT * FROM sessions WHERE id=?', `old-${uid}`);
  assert.ok(Math.abs(row(kid.id).last_active - t) < 60e3, 'counts as used now');
  assert.ok(Math.abs(row(kid.id).created_at - (t - 9 * HOUR)) < 60e3, 'a student: 9 hours old, so one hour left');
  assert.ok(Math.abs(row(teacher.id).created_at - (t - 167 * HOUR)) < 60e3, 'staff: one hour short of 7 days');
  assert.equal(row(own.id).created_at, t - 30 * DAY, 'own accounts keep their 60 days');
  for (const uid of Object.keys(old)) assert.ok(await me(cookies[uid]), `still signed in after the deploy: ${uid}`);
  const tick = clock(); tick(61 * MIN);
  assert.equal(await me(cookies[kid.id]), null); assert.equal(await me(cookies[teacher.id]), null);
  assert.ok(await me(cookies[own.id]));
});

test('the grown-ups page shows how to contact us once CONTACT_EMAIL is set', async () => {
  const before = await (await get('/parents')).text();
  assert.doesNotMatch(before, /id="contact"/); assert.doesNotMatch(before, /href="\/parents#contact"/);
  config.contactEmail = 'hello@example.org';
  try {
    const h = await (await get('/parents')).text();
    assert.match(h, /<section class="panel" id="contact"><h2>Contact us<\/h2>/);
    assert.match(h, /Grown-ups can email us at <a href="mailto:hello@example.org" dir="ltr">hello@example.org<\/a>\./);
    assert.match(await (await get('/login')).text(), /<a href="\/parents#contact">Contact us<\/a>/, 'linked from the footer of every page');
  } finally { config.contactEmail = ''; }
});
