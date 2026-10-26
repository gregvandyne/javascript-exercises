// Sign in with Google, stages 2-4: the school's Google domains, teachers' invites by school email (new students,
// connecting existing school accounts, staff), the class-code option, connecting Google from the Me page, and clean-up.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeGoogle } = await import('../support/fake-google.js');
const fake = await startFakeGoogle();
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const G = await import('../../server/services/google.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { RL._reset(); config.googleClientId = 'test-client.apps.googleusercontent.com'; config.googleClientSecret = 'fake-test-secret'; });

const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const loc = r => r.headers.get('location');
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

/** A school with Google domains (dwes.test), a school admin, a teacher and a class. */
function school({ domains = ['dwes.test'] } = {}) {
  const admin = createUser({ username: uname('Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `School ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('Tch'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  const c = S.createClass({ id: teacher.id }, s.id, { name: 'Class 4B', grade: '4' }).class;
  S.updateSchool({ id: admin.id }, s.id, { settings: { googleDomains: domains } });
  return { s: S.getSchool(s.id), admin, teacher, c, adminCookie: cookieFor(admin.id), teacherCookie: cookieFor(teacher.id) };
}
/** Our start → fake Google (auto mode) → our callback. */
async function google({ email, hd, sub, name, intent, code, cookie = '', start }) {
  const s = await get(start || `/auth/google/start${intent ? `?intent=${intent}` : ''}${code ? `&code=${code}` : ''}`, cookie);
  assert.equal(s.status, 302, `start: ${s.status} ${loc(s)}`);
  const flow = cookieOf(s, 'brb_gflow'); const to = new URL(loc(s));
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', email);
  if (hd !== undefined) to.searchParams.set('fake_hd', hd);
  if (sub) to.searchParams.set('fake_sub', sub);
  if (name) to.searchParams.set('fake_name', name);
  const a = await fetch(to, { redirect: 'manual' });
  const cb = new URL(loc(a));
  const r = await get(cb.pathname + cb.search, [cookie, flow].filter(Boolean).join('; '));
  r.session = cookieOf(r, 'brb_session');
  return r;
}
const identity = email => q.get('SELECT * FROM google_identities WHERE email=?', email);

test('pasted lists: names, spreadsheet rows, several per line, headers and junk', () => {
  const r = G.parseInviteLines('Name\tEmail\nAna Silva\tana@dwes.test\nbo@dwes.test, Bo Li\nCara Diaz <CARA@dwes.test>\nmailto:dan@dwes.test.\nx@dwes.test y@dwes.test\nana@dwes.test, Again\nnot an email');
  assert.deepEqual(r.entries.map(e => [e.email, e.name]), [['ana@dwes.test', 'Ana Silva'], ['bo@dwes.test', 'Bo Li'], ['cara@dwes.test', 'Cara Diaz'], ['dan@dwes.test', ''], ['x@dwes.test', ''], ['y@dwes.test', '']]);
  assert.deepEqual(r.bad, ['not an email']);
  assert.deepEqual(G.parseInviteLines('a@b').bad, ['a@b']);
});

test('school Google domains: cleaned, personal mail services and junk refused', async () => {
  assert.deepEqual(S.parseDomains('@DWES.test, https://students.dwes.test/x  dwes.test').domains, ['dwes.test', 'students.dwes.test']);
  assert.equal(S.parseDomains('gmail.com').code, 'personalDomain');
  assert.equal(S.parseDomains('not a domain!').code, 'badDomain');
  assert.equal(S.parseDomains(Array.from({ length: 11 }, (_, i) => `d${i}.test`).join(',')).code, 'tooManyDomains');
  const { s, adminCookie, teacherCookie } = school({ domains: [] });
  assert.equal((await post(`/api/schools/${s.id}/google`, { domains: 'dwes.test' }, teacherCookie)).status, 404);
  const bad = await post(`/api/schools/${s.id}/google`, { domains: 'gmail.com' }, adminCookie);
  assert.equal(bad.status, 400); assert.equal((await bad.json()).field, 'domains');
  assert.equal((await post(`/api/schools/${s.id}/google`, { domains: 'dwes.test' }, adminCookie)).status, 200);
  assert.deepEqual(G.schoolDomains(S.getSchool(s.id)), ['dwes.test']);
  const page = await (await get(`/school/${s.slug}?tab=settings`, adminCookie)).text();
  assert.match(page, /id="google"/); assert.match(page, /test-client\.apps\.googleusercontent\.com/);
});

test('a teacher invites by school email; the student signs in with Google, gets a school account and joins the class', async () => {
  const { c, s, teacherCookie } = school();
  const badPaste = await post(`/api/classes/${c.id}/google-invites`, { emails: 'eli@dwes.test\nfay@gmail.com' }, teacherCookie);
  assert.equal(badPaste.status, 400); assert.match((await badPaste.json()).error, /fay@gmail\.com/);
  assert.equal(q.get('SELECT COUNT(*) n FROM google_invites WHERE class_id=?', c.id).n, 0, 'all or nothing');
  const ok = await post(`/api/classes/${c.id}/google-invites`, { emails: 'eli@dwes.test, Eli Park\ngus@dwes.test' }, teacherCookie);
  assert.equal(ok.status, 200); assert.match((await ok.json()).toast, /2 invited/);
  const again = await (await post(`/api/classes/${c.id}/google-invites`, { emails: 'eli@dwes.test' }, teacherCookie)).json();
  assert.match(again.toast, /1 renewed/);

  // A personal Google account with the same address (no hd) is not the school's: refused.
  assert.equal(loc(await google({ email: 'eli@dwes.test', hd: '' })), '/login?gerr=unknown');
  const r = await google({ email: 'eli@dwes.test', name: 'Eli From Google' });
  assert.equal(loc(r), `/class/${c.id}`);
  const ident = identity('eli@dwes.test'); const u = getUser(ident.user_id);
  assert.equal(u.managed_school, s.id); assert.equal(u.password_hash, null);
  assert.doesNotMatch(u.display_name, /Eli/, 'the Google name is never the public name');
  assert.equal(S.membership(s.id, u.id).roster_name, 'Eli Park');
  assert.equal(S.membership(s.id, u.id).grade, '4');
  assert.ok(S.classMember(c.id, u.id));
  assert.equal(q.get("SELECT status FROM google_invites WHERE email='eli@dwes.test'").status, 'joined');
  // Next time: just signs in.
  assert.equal(loc(await google({ email: 'eli@dwes.test' })), '/classes');
  // The teacher sees the Google line and the invite list.
  const page = await (await get(`/class/${c.id}?tab=students`, teacherCookie)).text();
  assert.match(page, /Google: eli@dwes\.test/); assert.match(page, /Joined as @/); assert.match(page, /gus@dwes\.test/);
});

test('a name in the paste that matches a school account in the class connects that account instead', async () => {
  const { c, s, admin, teacherCookie } = school();
  const made = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Hana Ito', grade: '4' });
  S.addToClass({ id: admin.id }, c.id, made.user.id, 'student');
  const r = await (await post(`/api/classes/${c.id}/google-invites`, { emails: 'hana@dwes.test, hana ito' }, teacherCookie)).json();
  assert.match(r.toast, /1 will connect/);
  const users = q.get('SELECT COUNT(*) n FROM users').n;
  const res = await google({ email: 'hana@dwes.test' });
  assert.ok(res.session);
  assert.equal(identity('hana@dwes.test').user_id, made.user.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users, 'no new account');
  // Removing Google from an account with a password keeps it; the card route is for Google-only accounts.
  const rm = await post(`/api/classes/${c.id}/students/${made.user.id}/google/remove`, {}, teacherCookie);
  assert.equal(rm.status, 200); assert.equal(identity('hana@dwes.test'), undefined);
});

test('removing Google from a Google-only school account hands the teacher a login card at once', async () => {
  const { c, teacherCookie } = school();
  await post(`/api/classes/${c.id}/google-invites`, { emails: 'ivy@dwes.test' }, teacherCookie);
  await google({ email: 'ivy@dwes.test' });
  const u = getUser(identity('ivy@dwes.test').user_id);
  const rm = await (await post(`/api/classes/${c.id}/students/${u.id}/google/remove`, {}, teacherCookie)).json();
  assert.match(rm.redirect, /^\/cards\//);
  assert.ok(getUser(u.id).password_hash);
});

test('a teacher connects one existing student by email from the roster menu', async () => {
  const { c, s, admin, teacherCookie } = school();
  const made = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Jon Ek' });
  S.addToClass({ id: admin.id }, c.id, made.user.id, 'student');
  const wrong = await post(`/api/classes/${c.id}/students/${made.user.id}/google`, { email: 'jon@other.test' }, teacherCookie);
  assert.equal(wrong.status, 400);
  assert.equal((await post(`/api/classes/${c.id}/students/${made.user.id}/google`, { email: 'jon@dwes.test' }, teacherCookie)).status, 200);
  assert.match(await (await get(`/class/${c.id}?tab=students`, teacherCookie)).text(), /Google: waiting \(jon@dwes\.test\)/);
  await google({ email: 'jon@dwes.test' });
  assert.equal(identity('jon@dwes.test').user_id, made.user.id);
});

test('a school admin invites a teacher by school email', async () => {
  const { s, adminCookie, teacherCookie } = school();
  assert.equal((await post(`/api/schools/${s.id}/google-invites`, { email: 'kim@dwes.test', rosterName: 'Ms Kim', role: 'teacher' }, teacherCookie)).status, 404);
  const r = await post(`/api/schools/${s.id}/google-invites`, { email: 'kim@dwes.test', rosterName: 'Ms Kim', role: 'teacher' }, adminCookie);
  assert.equal(r.status, 200);
  const res = await google({ email: 'kim@dwes.test' });
  assert.equal(loc(res), '/teach');
  const u = getUser(identity('kim@dwes.test').user_id);
  assert.equal(S.membership(s.id, u.id).role, 'teacher'); assert.equal(u.managed_school, s.id);
});

test('class code + school Google account: off by default, on joins at once, other domains never', async () => {
  const { c, teacherCookie } = school();
  const off = await google({ intent: 'join', code: c.join_code, email: 'lea@dwes.test' });
  assert.match(loc(off), /^\/join\?code=.*gerr=joinNoWay/);
  assert.equal((await post(`/api/classes/${c.id}/google-join`, { on: '1' }, teacherCookie)).status, 200);
  const other = await google({ intent: 'join', code: c.join_code, email: 'max@else.test' });
  assert.match(loc(other), /gerr=joinNoWay/);
  const yes = await google({ intent: 'join', code: c.join_code, email: 'lea@dwes.test', name: 'Lea Roy' });
  assert.equal(loc(yes), `/class/${c.id}`);
  const u = getUser(identity('lea@dwes.test').user_id);
  assert.ok(S.classMember(c.id, u.id));
  assert.equal(S.membership(c.school_id, u.id).roster_name, 'Lea Roy');
  // A wrong code never says whether Google join is on.
  assert.match(loc(await get('/auth/google/start?intent=join&code=XX')), /\/join\?bad=1/);
});

test('/join: step one asks for the code, step two how you sign in', async () => {
  const p1 = await (await get('/join')).text();
  assert.match(p1, /name="code"/); assert.doesNotMatch(p1, /gbtn/);
  const p2 = await (await get('/join?code=abc234')).text();
  assert.match(p2, /Class code ABC234/); assert.match(p2, /href="\/auth\/google\/start\?intent=join&amp;code=ABC234"/);
  assert.equal(loc(await get('/join/abc234')), '/join?code=ABC234');
  assert.match(await (await get('/join?code=1')).text(), /doesn&#39;t look like a class code|doesn't look like a class code/);
});

test('Me page: staff connect Google after a password check; own accounts outside schools see nothing', async () => {
  const { teacher, teacherCookie } = school();
  const me = await (await get('/me', teacherCookie)).text();
  assert.match(me, /id="google"/);
  assert.equal((await post('/api/me/google/connect', { current: 'nope' }, teacherCookie)).status, 400);
  const ok = await (await post('/api/me/google/connect', { current: 'teach-pass-12345' }, teacherCookie)).json();
  assert.match(ok.redirect, /^\/auth\/google\/start\?intent=link&t=/);
  const r = await google({ start: ok.redirect, cookie: teacherCookie, email: 'teacher.personal@gmail.com', hd: '' });
  assert.equal(loc(r), '/me?google=connected#google');
  assert.equal(identity('teacher.personal@gmail.com').user_id, teacher.id);
  // Signing in with it now works, and the same Google account can't go on another account.
  assert.equal(loc(await google({ email: 'teacher.personal@gmail.com', hd: '' })), '/teach');
  // A link ticket is bound to the session it was made in.
  const other = cookieFor(teacher.id);
  assert.equal(loc(await get(ok.redirect, other)), '/me?gerr=expired#google');
  // Disconnect.
  assert.equal((await post('/api/me/google/disconnect', {}, teacherCookie)).status, 200);
  assert.equal(identity('teacher.personal@gmail.com'), undefined);

  const own = createUser({ username: uname('Own'), password: 'own-pass-123' });
  const oc = cookieFor(own.id);
  assert.doesNotMatch(await (await get('/me', oc)).text(), /id="google"/);
  assert.equal((await post('/api/me/google/connect', { current: 'own-pass-123' }, oc)).status, 403);
});

test('removing a school account from its school removes its Google sign-in and open invites', async () => {
  const { c, s, admin, teacherCookie } = school();
  await post(`/api/classes/${c.id}/google-invites`, { emails: 'ned@dwes.test' }, teacherCookie);
  await google({ email: 'ned@dwes.test' });
  const u = identity('ned@dwes.test').user_id;
  S.removeMember({ id: admin.id }, s.id, u);
  assert.equal(identity('ned@dwes.test'), undefined);
  // Invited again later: a fresh account, not the paused one.
  await post(`/api/classes/${c.id}/google-invites`, { emails: 'ned@dwes.test' }, teacherCookie);
  await google({ email: 'ned@dwes.test' });
  assert.notEqual(identity('ned@dwes.test').user_id, u);
});

test('clearing the school domains turns Google off for its school accounts, with a warning', async () => {
  const { c, s, adminCookie, teacherCookie } = school();
  await post(`/api/classes/${c.id}/google-invites`, { emails: 'oli@dwes.test' }, teacherCookie);
  await google({ email: 'oli@dwes.test' });
  const r = await (await post(`/api/schools/${s.id}/google`, { domains: '' }, adminCookie)).json();
  assert.match(r.toast, /1 account/);
  assert.match(loc(await google({ email: 'oli@dwes.test' })), /gerr=schoolOff/);
});

test('invites expire, can be renewed and removed, and old ones are swept', async () => {
  const { c, teacherCookie, s } = school();
  await post(`/api/classes/${c.id}/google-invites`, { emails: 'pia@dwes.test' }, teacherCookie);
  const inv = q.get("SELECT * FROM google_invites WHERE email='pia@dwes.test'");
  q.run('UPDATE google_invites SET expires_at=? WHERE id=?', Date.now() - 1000, inv.id);
  assert.equal(loc(await google({ email: 'pia@dwes.test' })), '/login?gerr=unknown');
  assert.equal((await post(`/api/google-invites/${inv.id}/renew`, {}, teacherCookie)).status, 200);
  assert.equal(G.inviteState(G.getInvite(inv.id)), 'waiting');
  assert.equal((await post(`/api/google-invites/${inv.id}/revoke`, {}, teacherCookie)).status, 200);
  assert.equal((await post(`/api/google-invites/${inv.id}/revoke`, {}, teacherCookie)).status, 404);
  q.run('UPDATE google_invites SET revoked_at=? WHERE id=?', Date.now() - 91 * 86400e3, inv.id);
  assert.ok(G.sweepInvites() >= 1);
  assert.equal(G.getInvite(inv.id), null);
  assert.ok(s);
});

test('off: no Google panels or routes anywhere', async () => {
  const { c, s, adminCookie, teacherCookie } = school();
  config.googleClientId = '';
  assert.equal((await get('/join')).status, 404);
  assert.equal((await get('/google-setup')).status, 404);
  assert.equal((await post(`/api/classes/${c.id}/google-invites`, { emails: 'a@dwes.test' }, teacherCookie)).status, 404);
  assert.doesNotMatch(await (await get(`/class/${c.id}?tab=students`, teacherCookie)).text(), /google-invites|Google:/);
  assert.doesNotMatch(await (await get(`/school/${s.slug}?tab=settings`, adminCookie)).text(), /id="google"/);
  assert.doesNotMatch(await (await get('/me', teacherCookie)).text(), /id="google"/);
  assert.doesNotMatch(await (await get('/login')).text(), /Join your class/);
});
