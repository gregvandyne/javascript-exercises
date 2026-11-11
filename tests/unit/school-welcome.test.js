// Setting up a school from a request (docs/decisions.md "Setting up a school from a request"): one page makes the
// school and its admin account, closes the request and emails the admin a welcome in the request's language, with a
// link to choose their own password (never a password in the email). The same page sends it again later, also for a
// request that was closed with "Mark done" before the school was made. Only the platform admin can use it.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const SR = await import('../../server/services/school-requests.js');
const E = await import('../../server/services/email.js');
const PR = await import('../../server/routes/password-reset.js');
const W = await import('../../server/services/school-welcome.js');
const { tFor, CODES } = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

seed({ quiet: true });
const sent = [];
E._hooks({ fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { status: 200, json: async () => ({ id: `em_${sent.length}` }) }; }, wait: () => Promise.resolve() });
Object.assign(config, { resendApiKey: 're_test_key', emailEnabled: true, publicUrl: 'https://oomba.example' });
const admin = auth.getUserByName('admin');
const teacherAcct = auth.createUser({ username: 'SetupTeachX', password: 'a-long-password-1', displayName: 'Tia' });
const parent = auth.createUser({ username: 'SetupParent', password: 'a-long-password-1', displayName: 'Pat', accountType: 'grownup' });
const FORM = { school: 'Fortech Academy', role: 'it', email: 'ana.rivera@fortech.example', students: '240', country: 'Portugal', name: 'Ana Rivera' };

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); E._hooks({ fetch: null, wait: null }); });
test.beforeEach(() => { resetLimits(); sent.length = 0; });
function cookieOf(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; }
const get = (path, u) => fetch(base + path, { headers: u ? { cookie: cookieOf(u) } : {}, redirect: 'manual' });
const post = (path, body, u) => fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(u ? { cookie: cookieOf(u) } : {}) }, body: JSON.stringify(body), redirect: 'manual' });
const newRequest = (over = {}, locale = 'pt') => SR.getRequest(SR.createRequest({ ...FORM, ...over }, { locale }).id);

test('the email: in the language asked for, the username and a "choose my password" link, never a password', () => {
  for (const code of CODES) {
    const t = tFor(code);
    for (const setUrl of ['https://oomba.example/reset?t=abc', null]) {
      const m = W.schoolWelcomeEmail(t, { name: 'Ms Ana Rivera', school: 'Fortech', username: 'Admin77', setUrl, schoolUrl: 'https://oomba.example/school/fortech', loginUrl: 'https://oomba.example/login', days: 7 });
      assert.ok(m.subject.includes('Fortech'), `${code} subject`);
      assert.ok(m.html.includes('Admin77') && m.text.includes('Admin77'), code);
      assert.ok(m.html.includes(setUrl || 'https://oomba.example/login'), `${code} button link`);
      assert.ok(m.text.includes('https://oomba.example/school/fortech'), code);
      assert.doesNotMatch(m.text, /\{\w+\}/, `${code}: every placeholder filled`);
      assert.doesNotMatch(m.html, /<script/i);
    }
  }
  assert.equal(W.greetName('Ms Ana Rivera'), 'Ms Ana'); assert.equal(W.greetName('Ana Rivera'), 'Ana'); assert.equal(W.greetName(''), '');
  const he = W.schoolWelcomeEmail(tFor('he'), { name: '', school: 'X', username: 'A1', setUrl: null, schoolUrl: 'https://x/s', loginUrl: 'https://x/login' });
  assert.match(he.html, /dir="rtl"/);
});

test('only the platform admin opens the setup page and its API', async () => {
  const r = newRequest();
  assert.equal((await get(`/admin/schools/setup?request=${r.id}`, teacherAcct)).status === 200, false);
  assert.ok([403, 404, 302].includes((await post('/api/admin/schools/setup', { request: r.id, email: 'x@y.example', rosterName: 'X' }, teacherAcct)).status));
  assert.ok([302, 401, 403, 404].includes((await get('/admin/schools/setup')).status));
  const page = await get(`/admin/schools/setup?request=${r.id}`, admin);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /value="Fortech Academy"/); assert.match(html, /value="Ana Rivera"/); assert.match(html, /value="ana\.rivera@fortech\.example"/);
  assert.match(html, /<option value="pt" selected>/, 'the email language is the request\'s');
  // The old "Create school" link lands here; the School requests tab leads here.
  assert.equal((await get(`/admin/schools?request=${r.id}`, admin)).headers.get('location'), `/admin/schools/setup?request=${r.id}`);
  const tab = await (await get('/admin?tab=schoolreq', admin)).text();
  assert.match(tab, new RegExp(`/admin/schools/setup\\?request=${r.id}`)); assert.match(tab, /Set up this school/);
  const pv = await get('/admin/schools/setup/preview?in=es', admin);
  assert.equal(pv.status, 200); assert.match(await pv.text(), /Elegir mi contraseña/);
  assert.equal(sent.length, 0);
});

test('set up from a request: school, a new admin account, the request done, and the welcome to the request\'s address', async () => {
  const r = newRequest();
  const res = await post('/api/admin/schools/setup', { request: r.id, name: 'Fortech Academy', account: 'new', rosterName: 'Ana Rivera', email: 'ana.rivera@fortech.example', lang: 'pt' }, admin);
  assert.equal(res.status, 200, await res.clone().text());
  const d = await res.json();
  assert.match(d.redirect, /^\/school\/[\w-]+\?tab=people&welcome=sent&to=a%E2%80%A2%E2%80%A2%E2%80%A2%40fortech\.example$/);
  const after = SR.getRequest(r.id);
  assert.equal(after.status, 'done'); assert.ok(after.school_id);
  const school = S.getSchool(after.school_id);
  assert.equal(school.name, 'Fortech Academy');
  const [boss] = S.members(school.id, 'admin');
  assert.equal(boss.roster_name, 'Ana Rivera'); assert.equal(boss.managed_school, school.id);
  assert.equal(sent.length, 1);
  const m = sent[0];
  assert.deepEqual(m.to, ['ana.rivera@fortech.example']);
  assert.equal(m.tags.find(x => x.name === 'category').value, 'transactional');
  assert.ok(!m.headers || !m.headers['List-Unsubscribe'], 'they asked for it: no unsubscribe header');
  assert.match(m.subject, /Fortech Academy/); assert.match(m.text, /Escolher minha senha/, 'Portuguese, as the request');
  assert.ok(m.text.includes(boss.username));
  const link = m.text.match(/https:\/\/oomba\.example\/reset\?t=(\S+)/);
  assert.ok(link, 'a link to choose the password');
  // The account's first password (on the login card only) is in no word of the email.
  const acct = auth.getUser(boss.id);
  for (const w of new Set((m.text + ' ' + m.html).split(/[\s<>"]+/).filter(x => x.length >= 6 && x.length <= 72 && !/^https?:/.test(x)))) assert.equal(auth.verifyPassword(acct, w), false, `the password is in the email: ${w}`);
  assert.equal(E.addressOf(boss.id).email, 'ana.rivera@fortech.example', 'kept for later password resets');
  // The link: a welcome page, 7 days, once.
  const tok = decodeURIComponent(link[1]);
  const pageRes = await get(`/reset?t=${encodeURIComponent(tok)}`);
  assert.equal(pageRes.status, 200);
  assert.match(await pageRes.text(), /Choose your password|Escolha sua senha/);
  const set = await post('/api/auth/reset', { token: tok, password: 'blue-otter-fortech-42' });
  assert.equal(set.status, 200);
  assert.match((await set.json()).redirect, /^\/login\?welcome=1&u=/);
  assert.equal(sent.length, 1, 'no "your password was changed" email after the first one is chosen');
  assert.equal((await post('/api/auth/reset', { token: tok, password: 'another-long-pass-9' })).status, 400, 'once only');
  const login = await post('/api/auth/login', { username: boss.username, password: 'blue-otter-fortech-42' });
  assert.equal(login.status, 200);
  const signIn = await (await get(`/login?welcome=1&u=${boss.username}`)).text();
  assert.match(signIn, /id="welcome-done"/); assert.ok(signIn.includes(`value="${boss.username}"`));
  // The People tab says it went.
  assert.match(await (await get(d.redirect, admin)).text(), /id="welcome-sent"/);
});

test('a request closed with "Mark done" first: set up later, and the email sent again for a school with an admin', async () => {
  const r = newRequest({ school: 'Late Start School', email: 'lee@late.example', name: 'Lee Park' }, 'en');
  SR.close(admin, r.id, 'done');
  const tab = await (await get('/admin?tab=schoolreq', admin)).text();
  assert.match(tab, new RegExp(`/admin/schools/setup\\?request=${r.id}`), 'the closed request offers "Set up this school"');
  const a = await post('/api/admin/schools/setup', { request: r.id, name: 'Late Start School', account: 'new', rosterName: 'Lee Park', email: 'lee@late.example', lang: 'en' }, admin);
  assert.equal(a.status, 200);
  const linked = SR.getRequest(r.id);
  assert.ok(linked.school_id, 'the done request now remembers its school');
  // Again from the Schools list: one of the school's admins, nothing new made.
  const before = S.members(linked.school_id, 'staff').length;
  const page = await (await get(`/admin/schools/setup?school=${linked.school_id}`, admin)).text();
  assert.match(page, /value="lee@late\.example"/, 'the address comes from the linked request');
  const [boss] = S.members(linked.school_id, 'admin');
  const again = await post('/api/admin/schools/setup', { schoolId: linked.school_id, account: 'current', adminId: boss.id, email: 'lee@late.example', lang: 'en' }, admin);
  assert.equal(again.status, 200);
  assert.equal(S.members(linked.school_id, 'staff').length, before);
  assert.equal(sent.length, 2); assert.match(sent[1].text, /Choose my password/, 'a school-made account gets a fresh link');
});

test('their own account: added as the admin, told to sign in as usual; a family account or a typo makes nothing', async () => {
  const schools = q.get('SELECT COUNT(*) n FROM schools').n;
  const bad = await post('/api/admin/schools/setup', { name: 'Nope School', account: 'existing', username: 'SetupParent', rosterName: 'Pat', email: 'pat@x.example' }, admin);
  assert.equal(bad.status, 400); assert.equal((await bad.json()).field, 'username');
  assert.equal((await post('/api/admin/schools/setup', { name: 'Nope School', account: 'existing', username: 'NoSuchUser9', rosterName: 'Pat', email: 'pat@x.example' }, admin)).status, 400);
  assert.equal((await post('/api/admin/schools/setup', { name: 'Nope School', account: 'new', rosterName: 'Pat', email: 'not-an-email' }, admin)).status, 400);
  assert.equal(q.get('SELECT COUNT(*) n FROM schools').n, schools, 'nothing made');
  assert.equal(sent.length, 0);
  const ok = await post('/api/admin/schools/setup', { name: 'Own Account School', account: 'existing', username: 'SetupTeachX', rosterName: 'Tia Moss', email: 'tia@own.example' }, admin);
  assert.equal(ok.status, 200);
  const s = q.get("SELECT * FROM schools WHERE name='Own Account School'");
  assert.equal(S.membership(s.id, teacherAcct.id).role, 'admin');
  assert.equal(sent.length, 1);
  assert.doesNotMatch(sent[0].text, /\/reset\?t=/, 'their own account keeps its password: no link to change it');
  assert.match(sent[0].text, /https:\/\/oomba\.example\/login/);
});

test('email off: everything is set up, and the People tab offers the login card and a retry', async () => {
  config.emailEnabled = false;
  try {
    const r = newRequest({ school: 'Offline School', email: 'o@off.example' }, 'en');
    const res = await post('/api/admin/schools/setup', { request: r.id, name: 'Offline School', account: 'new', rosterName: 'Olu Off', email: 'o@off.example' }, admin);
    const d = await res.json();
    assert.match(d.redirect, /welcome=notsent/); assert.match(d.redirect, /card=/);
    const html = await (await get(d.redirect, admin)).text();
    assert.match(html, /id="welcome-notsent"/); assert.match(html, /href="\/cards\//); assert.match(html, /\/admin\/schools\/setup\?school=/);
    assert.equal(SR.getRequest(r.id).status, 'done');
  } finally { config.emailEnabled = true; }
});

test('the optional username: used for the new school admin account and in the email; a taken or bad one makes nothing', async () => {
  const schools = q.get('SELECT COUNT(*) n FROM schools').n;
  for (const [u, why] of [['SetupTeachX', 'taken'], ['Roxana G', 'a space'], ['ab', 'too short']]) {
    const r = await post('/api/admin/schools/setup', { name: 'Named School', account: 'new', newUsername: u, rosterName: 'Roxana Gherghinis', email: 'r@named.example' }, admin);
    assert.equal(r.status, 400, why); assert.equal((await r.json()).field, 'newUsername', why);
  }
  assert.equal(q.get('SELECT COUNT(*) n FROM schools').n, schools, 'nothing made');
  const ok = await post('/api/admin/schools/setup', { name: 'Named School', account: 'new', newUsername: 'RoxanaG', rosterName: 'Roxana Gherghinis', email: 'r@named.example', lang: 'en' }, admin);
  assert.equal(ok.status, 200, await ok.clone().text());
  const u = auth.getUserByName('RoxanaG');
  assert.ok(u && u.managed_school);
  assert.equal(S.membership(u.managed_school, u.id).role, 'admin');
  assert.match(sent.at(-1).text, /RoxanaG/);
  // Students never get a chosen username this way.
  assert.equal(S.createSchoolAccount(admin, u.managed_school, { rosterName: 'Kid', role: 'student', username: 'KidPicked' }).code, 'badRole');
});

test('"Your name" on the Me page: grown-ups and staff set their own name; kids and students never do', async () => {
  const s = q.get("SELECT * FROM schools WHERE name='Named School'");
  const boss = auth.getUserByName('RoxanaG');
  const me = await (await get('/me', boss)).text();
  assert.match(me, /id="your-name"/); assert.match(me, /value="Roxana Gherghinis"/); assert.match(me, /RoxanaG/);
  const r = await post('/api/me/name', { name: '  Ștefana   Gherghinis ' }, boss);
  assert.equal(r.status, 200);
  assert.equal(auth.getUser(boss.id).display_name, 'Ștefana Gherghinis');
  assert.equal(S.membership(s.id, boss.id).roster_name, 'Ștefana Gherghinis', 'her name at the school too');
  assert.equal(auth.getUser(boss.id).username, 'RoxanaG', 'the username never changes');
  for (const bad of ['Roxana2', 'R', '<b>x</b>', 'Ms Bitch']) assert.equal((await post('/api/me/name', { name: bad }, boss)).status, 400, bad);
  assert.equal((await post('/api/me/name', { name: 'Ana Lee' }, boss)).status, 200, 'a real name the joined-up check would misread');
  // A grown-up (parent) account: yes. A kid's own account and a school's student: no panel, no API.
  assert.match(await (await get('/family/account', parent)).text(), /id="your-name"/, 'a parent\'s settings live on their family account page');
  assert.equal((await post('/api/me/name', { name: 'Pat Moss' }, parent)).status, 200);
  const kidAcct = auth.createUser({ username: 'NameKid12', password: 'a-long-password-1' });
  const student = S.createSchoolAccount(admin, s.id, { rosterName: 'Sam Student' }).user;
  for (const k of [kidAcct, student]) {
    assert.doesNotMatch(await (await get('/me', k)).text(), /id="your-name"/);
    assert.equal((await post('/api/me/name', { name: 'Real Name' }, k)).status, 404);
  }
  assert.equal(auth.getUser(kidAcct.id).display_name, 'NameKid12');
});
