// The platform admin deletes a school (services/school-delete.js) or a grown-up's / teacher's account
// (services/account-delete.js adminDeleteAccount): confirm pages, the typed name, one transaction, the refusals, and that
// deleting a school frees its Google domain for another school while its members' own accounts survive.
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
const { q, uid, db } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/family.js');
const SD = await import('../../server/services/school-delete.js');
const AD = await import('../../server/services/account-delete.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { RL._reset(); config.googleClientId = 'test-client.apps.googleusercontent.com'; config.googleClientSecret = 'fake-test-secret'; });

const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);
const boss = createUser({ username: uname('Boss'), password: 'boss-pass-12345', role: 'admin' });
const t0 = Date.now();

/** A school with a domain, an admin (own account), a teacher (own account), a school-made student, a class with a
 *  roster, a join request, a lesson assigned with progress, a Google invite and a dashboard. */
function school(name, domains = []) {
  const admin = createUser({ username: uname('Adm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('Tch'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  const c = S.createClass({ id: teacher.id }, s.id, { name: 'Class 4B', grade: '4' }).class;
  const student = S.createSchoolAccount(teacher, s.id, { rosterName: 'Kid One' }).user;
  S.addToClass(teacher, c.id, student.id);
  const ownKid = createUser({ username: uname('Own'), password: 'own-pass-123' });
  q.run('INSERT INTO join_requests(id, class_id, user_id, created_at) VALUES (?,?,?,?)', uid(), c.id, ownKid.id, t0);
  const lessonId = uid(), clId = uid();
  q.run('INSERT INTO lessons(id, school_id, owner_id, title, created_at, updated_at) VALUES (?,?,?,?,?,?)', lessonId, s.id, teacher.id, 'Fractions', t0, t0);
  q.run("INSERT INTO lesson_steps(id, lesson_id, position, kind, title, created_at) VALUES (?,?,0,'read','Step',?)", uid(), lessonId, t0);
  q.run('INSERT INTO class_lessons(id, class_id, lesson_id, position, assigned_by, assigned_at) VALUES (?,?,?,0,?,?)', clId, c.id, lessonId, teacher.id, t0);
  q.run('INSERT INTO step_progress(class_lesson_id, step_id, user_id, started_at, updated_at) VALUES (?,?,?,?,?)', clId, 's1', student.id, t0, t0);
  q.run("INSERT INTO google_invites(id, school_id, class_id, email, created_at, expires_at) VALUES (?,?,?,'kid@x.test',?,?)", uid(), s.id, c.id, t0, t0 + 86400e3);
  q.run("INSERT INTO dash_layouts(id, class_id, owner_id, name, created_at, updated_at) VALUES (?,?,?,'Main',?,?)", uid(), c.id, teacher.id, t0, t0);
  q.run("INSERT INTO dash_class(class_id, pins) VALUES (?, '[]')", c.id);
  if (domains.length) S.updateSchool({ id: admin.id }, s.id, { settings: { googleDomains: domains } });
  return { s: S.getSchool(s.id), admin, teacher, student, ownKid, c, lessonId, clId };
}
const sub = (kind, id, over = {}) => q.run(`INSERT INTO billing_subscriptions(stripe_subscription_id, stripe_customer_id, owner_kind, owner_id, plan, status,
  livemode, created_at, updated_at, cancel_at_period_end) VALUES (?,?,?,?,?,?,?,?,?,?)`, over.id || `sub_${uid()}`, 'cus_x', kind, id, over.plan || 'school',
  over.status || 'active', over.livemode ?? 0, t0, t0, over.cancel ? 1 : 0);

test('every table with a school_id, class_id or class_lesson_id column is handled by the school delete', () => {
  const handled = new Set([...SD.BY_SCHOOL, ...SD.BY_CLASS, ...SD.BY_CLASS_LESSON, ...Object.keys(SD.KEPT)]);
  const missing = [];
  for (const { name } of db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all()) {
    const cols = db.prepare(`PRAGMA table_info(${name})`).all().map(c => c.name);
    if (cols.some(c => ['school_id', 'class_id', 'class_lesson_id'].includes(c)) && !handled.has(name)) missing.push(name);
  }
  assert.deepEqual(missing, [], 'add new tables to services/school-delete.js');
});

test('deleting a school frees its Google domain for another school; members survive, classes and class data go', async () => {
  const test1 = school('Sister Test School', ['nvusd.test']);
  const real = school('Donaldson Way Elementary');
  // Before: the real school can't save the domain.
  let r = await as(real.admin)(`/api/schools/${real.s.id}/google`, { method: 'POST', body: { domains: 'nvusd.test' } });
  assert.equal(r.status, 400); assert.match(r.json.error, /nvusd\.test/);
  // The list shows slug, domains, member count and the delete button; the confirm page lists what goes.
  r = await as(boss)('/admin/schools');
  assert.equal(r.status, 200); assert.match(r.text, new RegExp(test1.s.slug)); assert.match(r.text, /<code>nvusd\.test<\/code>/);
  assert.match(r.text, new RegExp(`/admin/schools/${test1.s.id}/delete`)); assert.match(r.text, /Members/);
  r = await as(boss)(`/admin/schools/${test1.s.id}/delete`);
  assert.equal(r.status, 200); assert.match(r.text, /Class 4B/); assert.match(r.text, /join request/); assert.match(r.text, /delete-school-form/);
  // The typed name must match.
  r = await as(boss)(`/api/admin/schools/${test1.s.id}/delete`, { method: 'POST', body: { confirm: 'Sister Test' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'confirm'); assert.ok(S.getSchool(test1.s.id));
  r = await as(boss)(`/api/admin/schools/${test1.s.id}/delete`, { method: 'POST', body: { confirm: 'Sister Test School' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.redirect, '/admin/schools?deleted=1');
  // Gone: the school, its class and everything hanging off it.
  assert.equal(S.getSchool(test1.s.id), null); assert.equal(S.getClass(test1.c.id), null);
  const left = (tbl, col, id) => q.get(`SELECT COUNT(*) n FROM ${tbl} WHERE ${col}=?`, id).n;
  for (const [tbl, col, id] of [['school_members', 'school_id', test1.s.id], ['class_members', 'class_id', test1.c.id], ['join_requests', 'class_id', test1.c.id],
    ['class_lessons', 'class_id', test1.c.id], ['step_progress', 'class_lesson_id', test1.clId], ['lessons', 'school_id', test1.s.id], ['lesson_steps', 'lesson_id', test1.lessonId],
    ['google_invites', 'school_id', test1.s.id], ['dash_layouts', 'class_id', test1.c.id], ['dash_class', 'class_id', test1.c.id]]) assert.equal(left(tbl, col, id), 0, tbl);
  // Members' own accounts survive and can sign in; the school-made account is switched off, not deleted.
  for (const u of [test1.admin, test1.teacher, test1.ownKid]) { const x = getUser(u.id); assert.ok(x); assert.equal(x.banned, 0); assert.equal(x.username, u.username); }
  assert.equal(getUser(test1.student.id).banned, 1);
  // The other school is untouched, and can now save the domain.
  assert.ok(S.getClass(real.c.id)); assert.ok(S.membership(real.s.id, real.teacher.id));
  r = await as(real.admin)(`/api/schools/${real.s.id}/google`, { method: 'POST', body: { domains: 'nvusd.test' } });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(S.settingsOf(S.getSchool(real.s.id)).googleDomains, ['nvusd.test']);
  // One audit entry, ids and counts only.
  const a = q.all("SELECT * FROM audit_log WHERE action='school.delete' AND target=?", test1.s.id);
  assert.equal(a.length, 1); assert.equal(a[0].actor_id, boss.id); assert.doesNotMatch(a[0].details, /Sister|nvusd/);
});

test('a school with a paid subscription that will still charge is refused; an ended one is not', async () => {
  const x = school('Paying School');
  sub('school', x.s.id, { id: 'sub_paying' });
  let r = await as(boss)(`/admin/schools/${x.s.id}/delete`);
  assert.match(r.text, /delete-billing/); assert.match(r.text, /sub_paying/); assert.doesNotMatch(r.text, /delete-school-form/);
  r = await as(boss)(`/api/admin/schools/${x.s.id}/delete`, { method: 'POST', body: { confirm: 'Paying School' } });
  assert.equal(r.status, 409); assert.match(r.json.error, /sub_paying/); assert.ok(S.getSchool(x.s.id));
  assert.equal(SD.deleteSchool(boss, x.s.id).code, 'billing');
  q.run("UPDATE billing_subscriptions SET status='canceled' WHERE stripe_subscription_id='sub_paying'");
  r = await as(boss)(`/api/admin/schools/${x.s.id}/delete`, { method: 'POST', body: { confirm: 'Paying School' } });
  assert.equal(r.status, 200, r.text); assert.equal(S.getSchool(x.s.id), null);
  assert.ok(q.get("SELECT 1 FROM billing_subscriptions WHERE stripe_subscription_id='sub_paying'"), "Stripe's record of the ended subscription stays");
});

test('nobody but the platform admin can see or use either delete (the admin area answers 404)', async () => {
  const x = school('Guarded School');
  for (const who of [x.admin, x.teacher, x.ownKid]) {
    assert.equal((await as(who)(`/admin/schools/${x.s.id}/delete`)).status, 404);
    assert.equal((await as(who)(`/api/admin/schools/${x.s.id}/delete`, { method: 'POST', body: { confirm: 'Guarded School' } })).status, 404);
    assert.equal((await as(who)(`/admin/users/${x.teacher.id}/delete`)).status, 404);
    assert.equal((await as(who)(`/api/admin/users/${x.teacher.id}/delete`, { method: 'POST', body: { confirm: x.teacher.username } })).status, 404);
  }
  // Signed out too, and a cross-site POST from the admin's browser is stopped by the CSRF check.
  assert.equal((await fetch(`${base}/api/admin/schools/${x.s.id}/delete`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).status, 404);
  const cross = await fetch(`${base}/api/admin/schools/${x.s.id}/delete`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieFor(boss.id), 'sec-fetch-site': 'cross-site' }, body: JSON.stringify({ confirm: 'Guarded School' }) });
  assert.equal(cross.status, 403);
  // GET never deletes.
  assert.equal((await as(boss)(`/api/admin/schools/${x.s.id}/delete`)).status, 404);
  assert.ok(S.getSchool(x.s.id)); assert.ok(getUser(x.teacher.id).password_hash);
});

test('deleting a teacher: memberships end first, schools they made stay (listed), the account becomes a tombstone', async () => {
  const x = school('Teacher Made School');
  const other = school('Other School');
  S.addMember({ id: other.admin.id }, other.s.id, x.admin.id, 'teacher', { rosterName: 'Ms Admin' });
  const target = x.admin;   // made "Teacher Made School", its admin, and a teacher at Other School
  let r = await as(boss)(`/admin?tab=users&username=${target.username}`);
  assert.match(r.text, new RegExp(`/admin/users/${target.id}/delete`));
  r = await as(boss)(`/admin/users/${target.id}/delete`);
  assert.equal(r.status, 200); assert.match(r.text, /delete-schools/); assert.match(r.text, new RegExp(`/admin/schools/${x.s.id}/delete`)); assert.match(r.text, /Other School/);
  r = await as(boss)(`/api/admin/users/${target.id}/delete`, { method: 'POST', body: { confirm: 'someone' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'confirm');
  r = await as(boss)(`/api/admin/users/${target.id}/delete`, { method: 'POST', body: { confirm: target.username } });
  assert.equal(r.status, 200, r.text);
  const u = getUser(target.id);
  assert.equal(u.username, `deleted_${target.id}`); assert.equal(u.password_hash, null); assert.equal(u.banned, 1);
  assert.equal(q.get("SELECT COUNT(*) n FROM school_members WHERE user_id=? AND status='active'", target.id).n, 0);
  assert.equal(q.get("SELECT COUNT(*) n FROM school_members WHERE user_id=? AND roster_name!=''", target.id).n, 0, 'their real name is blanked');
  assert.ok(S.getSchool(x.s.id), 'the school they made is not deleted'); assert.ok(S.getClass(x.c.id));
  assert.ok(S.membership(other.s.id, other.teacher.id));
  const a = q.all("SELECT * FROM audit_log WHERE action='user.delete' AND target=?", target.id);
  assert.equal(a.length, 1); assert.equal(JSON.parse(a[0].details).kind, 'admin'); assert.doesNotMatch(a[0].details, new RegExp(target.username));
});

test('deleting a grown-up ends their family links (the child stays); refusals: self, platform admin, child, paid plan', async () => {
  const g = createUser({ username: uname('Mum'), password: 'mum-pass-123456', accountType: 'grownup' });
  const fam = F.ensureFamily(g) || F.familyOfOwner(g.id);
  const child = createUser({ username: uname('Kid'), password: 'kid-pass-123' });
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", fam.id, child.id, t0, t0);
  // Refusals.
  const other = createUser({ username: uname('Boss'), password: 'boss-pass-12345', role: 'admin' });
  for (const [who, code, status] of [[boss, 'self', 403], [other, 'platformAdmin', 403], [child, 'notAdult', 403]]) {
    assert.equal(AD.adminDeleteRefusal(boss, getUser(who.id)), code);
    const r = await as(boss)(`/api/admin/users/${who.id}/delete`, { method: 'POST', body: { confirm: who.username } });
    assert.equal(r.status, status, `${code}: ${r.text}`); assert.ok(getUser(who.id).password_hash);
  }
  let r = await as(boss)(`/admin/users/${child.id}/delete`);
  assert.match(r.text, /delete-refused/); assert.doesNotMatch(r.text, /delete-user-form/);
  assert.doesNotMatch((await as(boss)(`/admin?tab=users&username=${child.username}`)).text, /u-delete/, 'no delete button for a child');
  sub('family', fam.id, { id: 'sub_family', plan: 'family' });
  r = await as(boss)(`/api/admin/users/${g.id}/delete`, { method: 'POST', body: { confirm: g.username } });
  assert.equal(r.status, 409); assert.ok(getUser(g.id).password_hash);
  q.run("UPDATE billing_subscriptions SET cancel_at_period_end=1 WHERE stripe_subscription_id='sub_family'");
  // Now it goes.
  r = await as(boss)(`/admin/users/${g.id}/delete`);
  assert.match(r.text, /links to 1 child end/);
  r = await as(boss)(`/api/admin/users/${g.id}/delete`, { method: 'POST', body: { confirm: g.username.toUpperCase() } });
  assert.equal(r.status, 200, r.text);
  assert.equal(getUser(g.id).password_hash, null);
  assert.ok(q.get('SELECT unlinked_at FROM family_children WHERE family_id=? AND child_id=?', fam.id, child.id).unlinked_at, 'the link ended');
  assert.ok(getUser(child.id).password_hash, 'the child account stays');
  // A teacher with a Teacher plan that will still charge is refused too.
  const tch = createUser({ username: uname('Tch'), password: 'teach-pass-12345', signupAs: 'teacher' });
  q.run("UPDATE users SET signup_as='teacher' WHERE id=?", tch.id);
  sub('teacher', tch.id, { plan: 'teacher', status: 'trialing' });
  assert.equal(AD.adminDeleteAccount(boss, tch.id).code, 'billing');
});
