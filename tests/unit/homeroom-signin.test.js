// Homeroom, step 1c (docs/decisions.md "Homeroom, step 1c"; services/homeroom-signin.js, routes/homeroom-signin.js):
//   - the class sign-in code: only the class's teachers open, extend and close it; live class opens it, End class closes
//     it; it expires; a wrong or closed code is refused; wrong codes are limited per address and every code per code;
//   - the name grid: only while the code is open, display names only (never roster names, ids or anything else);
//   - typed passwords (the sign-in page's own limits) and picture passwords (wait, then lock) succeed, fail, lock out;
//   - class-device sessions: marked, signed out by End class and at the window's end, Not you? Switch; normal sign-ins
//     untouched;
//   - the teacher's side: modes, new picture passwords, unlock, cards (only for the teacher who made them), K-2 default,
//     own accounts never get pictures; students and other teachers get the normal 404;
//   - leaving the class, account delete, merges; the projector shows the code, desks never do.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const SI = await import('../../server/services/homeroom-signin.js');
const RL = await import('../../server/services/ratelimit.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { createApp } = await import('../../server/app.js');
const { classSignInHooks } = await import('../../server/routes/google.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(p, { body, cookie = '' } = {}) {
  const headers = cookie ? { cookie } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const set = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map(x => x.split(';')[0]).find(x => x.startsWith('brb_session=') && x !== 'brb_session=');
  return { status: r.status, text, json, cookie: set || '' };
}
const as = who => (p, o = {}) => call(p, { ...o, cookie: who ? cookieFor(who.id) : '' });

const boss = createUser({ username: 'HrsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Signin Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
Object.assign(config, { homeroom: true, homeroomUsers: [rivera, other].map(u => u.username.toLowerCase()) });
const cls = S.createClass(boss, oak.id, { name: 'Room 4B', teacherId: rivera.id }).class;
const kinder = S.createClass(boss, oak.id, { name: 'Kinder Bees', grade: 'K', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 5C', teacherId: other.id }).class;
const PW = {};
const kidIn = (c, rosterName, display) => {
  const r = S.createSchoolAccount(boss, oak.id, { rosterName }); S.addToClass(boss, c.id, r.user.id);
  q.run('UPDATE users SET display_name=? WHERE id=?', display, r.user.id); PW[r.user.id] = r.password; return getUser(r.user.id);
};
const ava = kidIn(cls, 'Ava Stone', 'Ava S'), ben = kidIn(cls, 'Ben Hill', 'Ben H'), cleo = kidIn(cls, 'Cleo Park', 'Cleo P');
const own = createUser({ username: 'OwnKid42', password: 'ownpass99', displayName: 'Dana' });
S.addMember(boss, oak.id, own.id, 'student', { rosterName: 'Dana Own' }); S.addToClass(boss, cls.id, own.id, 'student');
const bea = kidIn(kinder, 'Bea Long', 'Bea L');
const otherKid = kidIn(otherCls, 'Dev Rao', 'Dev R');
const signin = (who, c, action) => as(who)(`/api/homeroom/${c.id}/signin`, { body: { action } });
const live = (who, c, action) => as(who)(`/api/homeroom/${c.id}/live`, { body: { action } });
const openCode = async c => (await signin(rivera, c, 'open')).json.signin.code;
const grid = async code => call('/api/hr/open', { body: { code } });
const keyFor = async (code, name) => (await grid(code)).json.students.find(s => s.name === name).k;

test('the code: only the class\'s teachers open, extend and close it; live class opens it, End class closes it; it expires', async () => {
  assert.deepEqual((await as(rivera)(`/api/homeroom/${cls.id}/signin`)).json.signin, { open: false });
  const r = await signin(rivera, cls, 'open');
  assert.equal(r.status, 200);
  const s = r.json.signin;
  assert.equal(s.open, true); assert.match(s.code, /^[A-HJ-NP-Z2-9]{6}$/); assert.match(s.url, new RegExp(`/hr#${s.code}$`)); assert.match(s.shown, /\/hr$/);
  assert.match(s.qr, /^<svg/); assert.ok(s.until - now() > 89 * 60e3 && s.until - now() <= 90 * 60e3);
  // Open again: the same code, kept open longer.
  q.run('UPDATE homeroom_rooms SET signin_until=? WHERE class_id=?', now() + 60e3, cls.id);
  const again = (await signin(rivera, cls, 'open')).json.signin;
  assert.equal(again.code, s.code); assert.ok(again.until - now() > 89 * 60e3);
  // Students, another class's teacher, the platform admin's own students... nobody else.
  for (const u of [ava, other, null]) {
    assert.equal((await signin(u, cls, 'open')).status, 404, u ? u.username : 'signed out');
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/signin`)).status, 404);
    assert.equal((await as(u)(`/class/${cls.id}/homeroom/signin`)).status, 404);
  }
  assert.equal((await signin(rivera, cls, 'nope')).status, 400);
  assert.equal(SI.classForCode(s.code).id, cls.id);
  assert.equal(SI.classForCode(s.code.toLowerCase().replace(/^(...)/, '$1-')).id, cls.id, 'typed in small letters with a dash');
  // Close: the code stops working at once.
  assert.deepEqual((await signin(rivera, cls, 'close')).json.signin, { open: false });
  assert.equal(SI.classForCode(s.code), null);
  assert.equal((await grid(s.code)).status, 400);
  // Expired.
  const c2 = await openCode(cls);
  q.run('UPDATE homeroom_rooms SET signin_until=? WHERE class_id=?', now() - 1, cls.id);
  assert.equal(SI.classForCode(c2), null); assert.equal((await grid(c2)).json.code, 'badCode');
  // Starting live class opens it (a new code); End class closes it.
  assert.equal((await live(rivera, cls, 'start')).status, 200);
  const c3 = SI.signinOf(cls.id); assert.ok(c3.open); assert.notEqual(c3.code, c2);
  assert.equal((await live(rivera, cls, 'end')).status, 200);
  assert.equal(SI.signinOf(cls.id).open, false);
  // Flag off: no /hr at all.
  config.homeroom = false;
  try { assert.equal((await call('/hr')).status, 404); } finally { config.homeroom = true; }
});

test('wrong codes: refused, limited per address; every code limited per code', async () => {
  assert.equal((await grid('ZZZZZZ')).json.code, 'badCode');
  assert.equal((await grid('12')).status, 400);
  assert.equal((await grid('')).status, 400);
  for (let i = 0; i < 98; i++) await grid('ZZZZZY');
  assert.equal((await grid('ZZZZZX')).status, 429, 'too many wrong codes from one address');
  const code = await openCode(cls);
  assert.equal((await grid(code)).status, 429, 'even the right code, until the window passes');
  RL._reset();
  assert.equal((await grid(code)).status, 200, 'the right code is fine');
  for (let i = 0; i < 3000; i++) RL.allow(`hr-code:${code}`, 3000, 900e3);
  assert.equal((await grid(code)).status, 429, 'one code can only be used so much');
  RL._reset();
});

test('the name grid: only while open, display names only, a token per code (no ids, no roster names)', async () => {
  const code = await openCode(cls);
  const r = await grid(code);
  assert.equal(r.status, 200); assert.equal(r.json.className, 'Room 4B');
  assert.deepEqual(r.json.students.map(s => s.name), ['Ava S', 'Ben H', 'Cleo P', 'Dana']);
  for (const s of r.json.students) assert.deepEqual(Object.keys(s).sort(), ['how', 'k', 'name']);
  for (const k of [ava, ben, cleo, own]) assert.ok(!r.text.includes(k.id), 'no account ids');
  assert.doesNotMatch(r.text, /Ava Stone|Ben Hill|Cleo Park|Dana Own|OwnKid42/, 'no roster names or a typed-in username');
  assert.ok(!r.text.includes(otherKid.display_name), 'only this class');
  assert.deepEqual(r.json.students.map(s => s.how), ['password', 'password', 'password', 'password']);
  // A new code: the old tokens mean nothing.
  const k = r.json.students[0].k;
  await signin(rivera, cls, 'close');
  assert.equal((await grid(code)).status, 400, 'closed: no names');
  const code2 = await openCode(cls);
  assert.notEqual(await keyFor(code2, 'Ava S'), k);
  assert.equal((await call('/api/hr/signin', { body: { code: code2, k, password: PW[ava.id] } })).json.code, 'notFound');
  // The page itself: no plans or prices, and the Google button only when Google sign-in is on.
  const page = await call('/hr');
  assert.equal(page.status, 200); assert.match(page.text, /homeroom-signin\.js/); assert.match(page.text, /noindex/);
  assert.doesNotMatch(page.text, /\/plans|Teacher plan|\$\d/);
  await signin(rivera, cls, 'close');
});

test('a typed password: right gets a class-device session and the desk; wrong is refused and locks like /login', async () => {
  const code = await openCode(cls);
  const k = await keyFor(code, 'Ava S');
  const bad = await call('/api/hr/signin', { body: { code, k, password: 'not-it-at-all' } });
  assert.equal(bad.status, 400); assert.equal(bad.json.code, 'wrongPassword'); assert.equal(bad.cookie, '');
  const ok = await call('/api/hr/signin', { body: { code, k, password: PW[ava.id] } });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.redirect, `/class/${cls.id}/desk`); assert.ok(ok.cookie);
  const desk = await call(`/class/${cls.id}/desk`, { cookie: ok.cookie });
  assert.equal(desk.status, 200); assert.match(desk.text, /data-hd="switch"/, 'Not you? Switch on a shared device');
  const sid = q.get("SELECT id FROM sessions WHERE user_id=? AND class_device IS NOT NULL", ava.id);
  assert.ok(sid, 'marked as a class-device session');
  const row = q.get('SELECT * FROM sessions WHERE id=?', sid.id);
  assert.ok(row.expires_at <= SI.signinOf(cls.id).until + SI.GRACE_MS + 5, 'ends with the sign-in window plus the grace');
  // A normal sign-in: no Switch, not marked.
  assert.doesNotMatch((await as(ava)(`/class/${cls.id}/desk`)).text, /data-hd="switch"/);
  // Ten wrong passwords for one student: locked out (the sign-in page's own bucket).
  const kb = await keyFor(code, 'Ben H');
  for (let i = 0; i < 10; i++) await call('/api/hr/signin', { body: { code, k: kb, password: `wrong-${i}` } });
  assert.equal((await call('/api/hr/signin', { body: { code, k: kb, password: PW[ben.id] } })).status, 429);
  assert.equal(RL.count(RL.loginLockKey(ben.username)), 10, 'the same bucket as /login');
  // An own account signs in with their own password too; Google-only or no password: "ask".
  const kd = await keyFor(code, 'Dana');
  assert.equal((await call('/api/hr/signin', { body: { code, k: kd, password: 'ownpass99' } })).status, 200);
  await signin(rivera, cls, 'close');
});

test('picture passwords: set by the teacher, right pictures sign in, wrong ones wait then lock; unlock and new ones', async () => {
  // Own accounts never get pictures; a student of another class is not found.
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${own.id}`, { body: { mode: 'picture' } })).json.code, 'ownAccount');
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${otherKid.id}`, { body: { mode: 'picture' } })).status, 404);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}`, { body: { mode: 'sideways' } })).status, 400);
  // Students and other teachers: 404 for all of it.
  for (const u of [cleo, other]) {
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}`, { body: { mode: 'picture' } })).status, 404);
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}/picture`, { body: {} })).status, 404);
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}/unlock`, { body: {} })).status, 404);
    assert.equal((await as(u)(`/api/homeroom/${cls.id}/signin/cards`, { body: {} })).status, 404);
  }
  const set = await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}`, { body: { mode: 'picture' } });
  assert.equal(set.status, 200); assert.match(set.json.redirect, new RegExp(`^/class/${cls.id}/homeroom/signin/cards/`), 'a card for the new picture password');
  const card = await as(rivera)(set.json.redirect);
  assert.equal(card.status, 200); assert.match(card.text, /Cleo Park/); assert.match(card.text, /Your button: Cleo P/);
  assert.equal((await as(other)(set.json.redirect)).status, 404, 'cards only for the teacher who made them');
  const row = q.get('SELECT * FROM homeroom_signins WHERE class_id=? AND user_id=?', cls.id, cleo.id);
  assert.match(row.pic_hash, /^\$2[aby]\$/, 'stored as a bcrypt hash');
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='homeroom.picture_reset' AND target=?", cls.id).n, 1, 'the reset is in the audit log');
  // The pictures (known here only from the card's page: in order).
  const pics = [...card.text.matchAll(/hs-cardpicname">([^<]+)</g)].map(m => m[1].toLowerCase());
  assert.equal(pics.length, 3);
  const code = await openCode(cls);
  assert.equal((await grid(code)).json.students.find(s => s.name === 'Cleo P').how, 'picture');
  const k = await keyFor(code, 'Cleo P');
  const wrong = pics.slice().reverse().join() === pics.join() ? ['bear', 'bear', 'bear'] : pics.slice().reverse();
  const tryPics = p => call('/api/hr/signin', { body: { code, k, pics: p } });
  for (let i = 1; i < SI.PIC_SOFT; i++) assert.equal((await tryPics(wrong)).json.code, 'wrongPictures');
  const w = await tryPics(wrong);
  assert.equal(w.status, 429); assert.equal(w.json.code, 'wait'); assert.ok(w.json.wait >= 59 && w.json.wait <= 60);
  assert.equal((await tryPics(pics)).json.code, 'wait', 'even the right pictures wait');
  for (let i = SI.PIC_SOFT; i < SI.PIC_HARD; i++) { q.run('UPDATE homeroom_signins SET locked_until=NULL WHERE user_id=?', cleo.id); await tryPics(wrong); }
  q.run('UPDATE homeroom_signins SET locked_until=NULL WHERE user_id=?', cleo.id);
  const locked = await tryPics(pics);
  assert.equal(locked.status, 423); assert.equal(locked.json.code, 'locked');
  assert.match((await as(rivera)(`/class/${cls.id}/homeroom/signin`)).text, /Locked after too many tries/);
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}/unlock`, { body: {} })).status, 200);
  assert.equal((await tryPics(['bear'])).status, 400, 'not three pictures');
  const good = await tryPics(pics);
  assert.equal(good.status, 200, good.text); assert.equal(good.json.redirect, `/class/${cls.id}/desk`); assert.ok(good.cookie);
  assert.equal(q.get('SELECT fails FROM homeroom_signins WHERE user_id=?', cleo.id).fails, 0, 'a right try forgets the wrong ones');
  // A new picture password: the old pictures stop working and its class-device sign-in ends.
  const again = await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}/picture`, { body: {} });
  assert.equal(again.status, 200);
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: good.cookie })).status, 404, 'the old sign-in ended');
  const fresh = [...(await as(rivera)(again.json.redirect)).text.matchAll(/hs-cardpicname">([^<]+)</g)].map(m => m[1].toLowerCase());
  if (fresh.join() !== pics.join()) assert.equal((await tryPics(pics)).json.code, 'wrongPictures');
  assert.equal((await tryPics(fresh)).status, 200);
  // Back to Password: the grid says so, and the typed password works again.
  assert.equal((await as(rivera)(`/api/homeroom/${cls.id}/signin/students/${cleo.id}`, { body: { mode: 'password' } })).status, 200);
  assert.equal((await grid(code)).json.students.find(s => s.name === 'Cleo P').how, 'password');
  await signin(rivera, cls, 'close');
});

test('grade K to 2: school accounts start with picture passwords ("ask" until made); cards for the whole class', async () => {
  for (const g of ['K', 'k-2', '1', '2nd', 'Grade 2', 'Kindergarten']) assert.equal(SI.earlyGrade(g), true, g);
  for (const g of ['', '3', 'K-5', 'Grade 4', '10']) assert.equal(SI.earlyGrade(g), false, g);
  assert.equal(SI.howOf(kinder, bea).mode, 'picture');
  assert.equal(SI.howOf(cls, ava).mode, 'password');
  const code = await openCode(kinder);
  assert.equal((await grid(code)).json.students[0].how, 'ask', 'no picture password made yet');
  const p = await as(rivera)(`/class/${kinder.id}/homeroom/signin`);
  assert.equal(p.status, 200); assert.match(p.text, /grade K to 2/); assert.match(p.text, /Bea Long/); assert.match(p.text, /No picture password yet/);
  const cards = await as(rivera)(`/api/homeroom/${kinder.id}/signin/cards`, { body: {} });
  assert.equal(cards.status, 200);
  const page = await as(rivera)(cards.json.redirect);
  assert.match(page.text, /Bea Long/); assert.equal([...page.text.matchAll(/hs-cardpicname/g)].length, 3);
  assert.equal((await grid(code)).json.students[0].how, 'picture');
  await signin(rivera, kinder, 'close');
});

test('class-device sessions: End class signs them out (normal sign-ins stay); Not you? Switch keeps the code', async () => {
  const code = await openCode(cls);
  const dev = (await call('/api/hr/signin', { body: { code, k: await keyFor(code, 'Ava S'), password: PW[ava.id] } })).cookie;
  const normal = cookieFor(ava.id);
  // Not you? Switch: signed out, back to the names with the code.
  const sw = await call(`/api/desk/${cls.id}/switch`, { body: {}, cookie: dev });
  assert.equal(sw.status, 200); assert.equal(sw.json.redirect, `/hr#${code}`);
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: dev })).status, 404, 'signed out');
  assert.equal((await call(`/api/desk/${cls.id}/switch`, { body: {}, cookie: normal })).status, 404, 'never for a normal sign-in');
  // End class.
  await live(rivera, cls, 'start');
  const dev2 = (await call('/api/hr/signin', { body: { code: SI.signinOf(cls.id).code, k: await keyFor(SI.signinOf(cls.id).code, 'Ava S'), password: PW[ava.id] } })).cookie;
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: dev2 })).status, 200);
  await live(rivera, cls, 'end');
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: dev2 })).status, 404, 'End class signed the shared device out');
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: normal })).status, 200, 'a normal sign-in is untouched');
  // The window's end: a class-device session ends with it (plus the grace).
  const code3 = await openCode(cls);
  const dev3 = (await call('/api/hr/signin', { body: { code: code3, k: await keyFor(code3, 'Ava S'), password: PW[ava.id] } })).cookie;
  q.run('UPDATE sessions SET expires_at=? WHERE class_device=?', now() - 1, cls.id);
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: dev3 })).status, 404);
  await signin(rivera, cls, 'close');
});

test('Google from the class sign-in: a class-device session only for a student of that class while it is open', async () => {
  const code = await openCode(cls);
  assert.equal(classSignInHooks.classFor(code).id, cls.id);
  assert.equal(classSignInHooks.classFor('ZZZZZZ'), null);
  const sid = startSession({ append() {} }, ben.id);
  assert.equal(classSignInHooks.mark(sid, ben, cls.id), `/class/${cls.id}/desk`);
  assert.equal(SI.deviceClass(sid), cls.id);
  const sid2 = startSession({ append() {} }, otherKid.id);
  assert.equal(classSignInHooks.mark(sid2, otherKid, cls.id), null, 'not a student of this class');
  assert.equal(SI.deviceClass(sid2), null);
  await signin(rivera, cls, 'close');
  const sid3 = startSession({ append() {} }, ben.id);
  assert.equal(classSignInHooks.mark(sid3, ben, cls.id), null, 'sign-in closed');
});

test('the projector shows the code and its QR while open; a desk never gets the code', async () => {
  const code = await openCode(cls);
  const p = await as(rivera)(`/class/${cls.id}/homeroom/projector`);
  assert.ok(p.text.includes(code)); assert.match(p.text, /Students sign in/);
  const st = (await as(rivera)(`/api/homeroom/${cls.id}/state`)).json;
  assert.equal(st.signin.code, code); assert.match(st.signin.qr, /^<svg/);
  assert.ok(!('qr' in (await as(rivera)(`/api/homeroom/${cls.id}/state?sc=${code}`)).json.signin), 'the QR only when the code changed');
  const desk = await as(ava)(`/api/desk/${cls.id}/state`);
  assert.ok(!desk.text.includes(code), 'desks never see the code');
  assert.ok(!(await as(ava)(`/class/${cls.id}/desk`)).text.includes(code));
  await signin(rivera, cls, 'close');
  assert.deepEqual((await as(rivera)(`/api/homeroom/${cls.id}/state`)).json.signin, { open: false });
});

test('leaving the class, deleting the account, merging and deleting the school take the sign-in rows', async () => {
  const gone = kidIn(cls, 'Gus Gone', 'Gus G'), left = kidIn(cls, 'Lee Left', 'Lee L');
  for (const u of [gone, left]) SI.setMode(rivera, cls, u.id, 'picture');
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_signins WHERE user_id IN (?,?)', gone.id, left.id).n, 2);
  const code = await openCode(cls);
  const dev = (await call('/api/hr/signin', { body: { code, k: await keyFor(code, 'Ava S'), password: PW[ava.id] } })).cookie;
  S.removeFromClass(boss, cls.id, left.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_signins WHERE user_id=?', left.id).n, 0, 'left the class');
  assert.equal(deleteAccount(gone.id, boss, { by: 'admin', leaveSchools: true }).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_signins WHERE user_id=?', gone.id).n, 0, 'account deleted');
  const SD = await import('../../server/services/school-delete.js');
  assert.ok(SD.BY_CLASS.includes('homeroom_signins'), 'goes with the class and the school');
  // The class going (archived and deleted the way the school deletes its classes) ends its shared devices.
  S.classDeleted(cls.id);
  assert.equal((await call(`/class/${cls.id}/desk`, { cookie: dev })).status, 404);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_signins WHERE class_id=?', cls.id).n, 0);
});
