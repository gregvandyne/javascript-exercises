// Funnel step counts (server/services/funnel.js; docs/decisions.md "Funnel counts"): daily totals only, counted on
// the server where each step happens; kid pages add nothing that could follow a child; /admin/stats shows the last
// 7 days against the 7 before. The paid steps (webhooks) are covered in billing.test.js and billing-checkout.test.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const funnel = await import('../../server/services/funnel.js');
const traffic = await import('../../server/services/traffic.js');
const games = await import('../../server/services/games.js');
const S = await import('../../server/services/schools.js');
const SR = await import('../../server/services/school-requests.js');
const F = await import('../../server/services/family.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36';
const cookieFor = u => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; };
const visit = (path, cookie = '') => fetch(base + path, { headers: { accept: 'text/html', 'user-agent': CHROME, ...(cookie ? { cookie } : {}) }, redirect: 'manual' });
const n = (step, day = today()) => (q.get('SELECT n FROM funnel_counts WHERE day=? AND step=?', day, step) || { n: 0 }).n;
const all = () => Object.fromEntries(q.all('SELECT step, SUM(n) n FROM funnel_counts GROUP BY step').map(r => [r.step, r.n]));
const reset = () => q.run('DELETE FROM funnel_counts');
let k = 0;
const kid = () => auth.createUser({ username: `Fun${++k}Kid${Date.now() % 1000}`, password: 'rainbow-77' });

test('the table holds daily totals only: day, step, n (no ids of any kind)', () => {
  const cols = q.all("SELECT name FROM pragma_table_info('funnel_counts')").map(c => c.name);
  assert.deepEqual(cols.sort(), ['day', 'n', 'step']);
  assert.ok(q.get("SELECT 1 FROM migrations WHERE name='0027_funnel'"));
});

test('bump: known steps only, adds up per day; weekly compares the last 7 days with the 7 before', () => {
  reset();
  assert.equal(funnel.bump('parent.nope'), false, 'an unknown step makes no row');
  assert.equal(funnel.bump('parent.view', 0), false);
  assert.equal(q.get('SELECT COUNT(*) n FROM funnel_counts').n, 0);
  const end = '2026-10-28';
  funnel.bump('parent.view', 100, '2026-10-28'); funnel.bump('parent.view', 50, '2026-10-22');   // last 7: 22..28
  funnel.bump('parent.view', 1, '2026-10-21'); funnel.bump('parent.view', 79, '2026-10-15');     // the 7 before: 15..21
  funnel.bump('parent.view', 999, '2026-10-14');                                                  // older: not in either
  funnel.bump('parent.signup', 30, '2026-10-25'); funnel.bump('parent.signup', 40, '2026-10-18');
  funnel.bump('parent.child', 2, '2026-10-01');                                                  // outside both weeks
  funnel.bump('teacher.request', 2, '2026-10-24');
  funnel.bump('kid.play', 80, '2026-10-27'); funnel.bump('kid.play', 100, '2026-10-20');
  const r = funnel.weekly(end);
  assert.deepEqual(r.last, { from: '2026-10-22', to: '2026-10-28' });
  assert.deepEqual(r.prev, { from: '2026-10-15', to: '2026-10-21' });
  assert.deepEqual(r.funnels.map(f => f.key), ['parent', 'teacher', 'guardrail']);
  const step = (f, s) => r.funnels.find(x => x.key === f).steps.find(x => x.key === s);
  assert.deepEqual(step('parent', 'parent.view'), { key: 'parent.view', label: 'Parent page views', last: 150, prev: 80, change: 88, rate: null });
  assert.equal(step('parent', 'parent.signup').last, 30); assert.equal(step('parent', 'parent.signup').change, -25);
  assert.equal(step('parent', 'parent.signup').rate, 20, '30 sign-ups of 150 views');
  assert.equal(step('parent', 'parent.child').rate, 0);
  assert.equal(step('parent', 'parent.checkout').rate, null, 'nothing before it: no rate');
  assert.equal(step('teacher', 'teacher.request').change, null, 'nothing the week before: no percentage');
  assert.equal(step('guardrail', 'kid.play').change, -20);
  assert.equal(step('guardrail', 'kid.play').rate, null, 'guardrail steps are not a funnel');
  assert.equal(funnel.STEPS.length, 12);
});

test('page views: parent and teacher pages count (also with a language prefix); kid pages, bots, 404s and redirects do not', async () => {
  reset();
  for (const p of ['/parents', '/parents/screen-time', '/grown-ups']) assert.equal(funnel.viewStepOf(p), 'parent.view', p);
  for (const p of ['/teachers', '/plans/schools']) assert.equal(funnel.viewStepOf(p), 'teacher.view', p);
  for (const p of ['/', '/g/x', '/play/x', '/build', '/studio/x', '/me', '/u/x', '/search', '/plans', '/learn', '/learn/math', '/parents/a/b', '/teachersx', '/signup'])
    assert.equal(funnel.viewStepOf(p), null, p);
  assert.equal((await visit('/parents')).status, 200);
  assert.equal((await visit('/es/parents')).status, 200);
  assert.equal((await visit('/teachers')).status, 200);
  assert.equal(n('parent.view'), 2); assert.equal(n('teacher.view'), 1);
  // The page the teacher form returns to is not a new view (each request would add one).
  assert.equal((await visit('/teachers?sent=1')).status, 200);
  assert.equal((await visit('/teachers?failed=1')).status, 200);
  assert.equal(n('teacher.view'), 1, '?sent=1 / ?failed=1 do not count');
  await fetch(base + '/parents', { headers: { accept: 'text/html', 'user-agent': 'Googlebot/2.1' } });
  await fetch(base + '/parents', { headers: { accept: 'application/json', 'user-agent': CHROME } });
  await visit('/parents/not-a-guide');
  assert.equal(n('parent.view'), 2, 'bots, non-pages and 404s are not views');
  // the visit counter and the funnel agree on what a view is
  traffic.recordView('/teachers', '10.0.0.7', CHROME);
  assert.equal(n('teacher.view'), 2);
});

test('kid pages add nothing per child: browsing adds no funnel rows; sign-ups and plays add only daily totals', async () => {
  reset();
  const u = kid(); const cookie = cookieFor(u);
  const g = games.createGame(u.id, { title: 'Funnel Game' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id='x' WHERE id=?", g.id);
  const slug = q.get('SELECT slug FROM games WHERE id=?', g.id).slug;
  for (const p of ['/', '/search', `/g/${slug}`, '/me', '/build', '/favorites']) await visit(p, cookie);
  for (const p of ['/', '/search', `/g/${slug}`]) await visit(p);
  assert.deepEqual(all(), {}, 'kid pages count no funnel step');
  // A kid sign-up (through the real form's API) and a guest keeping their progress both count once.
  const post = (body, cookie = '') => fetch(base + '/api/auth/signup', { method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  assert.equal((await post({ username: 'FunnelNewKid', password: 'blue-otter-42' })).status, 200);
  const guest = auth.createGuest();
  assert.equal((await post({ username: 'FunnelGuestKid', password: 'blue-otter-42' }, cookieFor(guest))).status, 200);
  assert.equal((await post({ username: 'FunnelNewKid', password: 'blue-otter-42' })).status, 400, 'a taken name: no sign-up, no count');
  games.recordPlay(g.id, u.id); games.recordPlay(g.id, null);
  assert.deepEqual(all(), { 'kid.signup': 2, 'kid.play': 2 });
  // Nothing in the counts names anybody.
  const dump = JSON.stringify(q.all('SELECT * FROM funnel_counts'));
  for (const s of [u.id, u.username, guest.id, 'FunnelNewKid', 'FunnelGuestKid', g.id, slug]) assert.ok(!dump.includes(s), s);
  // And no counting cookie: a signed-out view of a parent page sets no new cookie.
  const r = await visit('/parents');
  assert.equal(r.headers.get('set-cookie'), null);
});

test('teacher steps: school requests, schools set up, first class with students (once per school)', () => {
  reset();
  const boss = auth.createUser({ username: 'FunnelBoss', password: 'a-long-password-1' });
  q.run("UPDATE users SET role='admin' WHERE id=?", boss.id);
  const form = { school: 'Birch Lane', role: 'teacher', email: 'pat@birch.example.org', students: '120', country: 'Canada' };
  assert.equal(SR.createRequest({ ...form, email: 'nope' }).ok, false);
  assert.equal(SR.createRequest(form).ok, true);
  assert.equal(n('teacher.request'), 1, 'only a stored request counts');
  const school = S.createSchool(boss, { name: 'Birch Lane' }).school;
  assert.equal(S.createSchool(boss, { name: 'x' }).ok, false);
  assert.equal(n('teacher.school'), 1);
  const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Ms Birch', role: 'teacher' }).user;
  const a = S.createClass(teacher, school.id, { name: 'Class A' }).class;
  const b = S.createClass(teacher, school.id, { name: 'Class B' }).class;
  assert.equal(n('teacher.class'), 0, 'a class with only its teacher is not yet a class with students');
  const s1 = S.createSchoolAccount(teacher, school.id, { rosterName: 'Sam' }).user;
  const s2 = S.createSchoolAccount(teacher, school.id, { rosterName: 'Ali' }).user;
  assert.equal(S.addToClass(teacher, a.id, s1.id).ok, true);
  assert.equal(n('teacher.class'), 1);
  S.addToClass(teacher, a.id, s2.id); S.addToClass(teacher, b.id, s2.id);
  S.moveStudent(teacher, a.id, b.id, s1.id); S.removeFromClass(teacher, b.id, s1.id); S.addToClass(teacher, a.id, s1.id);
  assert.equal(n('teacher.class'), 1, 'more students, classes, moves and re-adds never count again');
  const other = S.createSchool(boss, { name: 'Cedar Park' }).school;
  const t2 = S.createSchoolAccount(boss, other.id, { rosterName: 'Mr Cedar', role: 'teacher' }).user;
  const c = S.createClass(t2, other.id, { name: 'Room 1' }).class;
  S.addToClass(t2, c.id, S.createSchoolAccount(t2, other.id, { rosterName: 'Jo' }).user.id);
  assert.equal(n('teacher.school'), 2); assert.equal(n('teacher.class'), 2, 'another school: counted once more');
});

test('parent steps: a child saying yes counts; a request or a No does not (grown-up sign-ups: family.test.js)', () => {
  reset();
  const g = auth.createUser({ username: 'FunnelParent', password: 'a-long-password-1', accountType: 'grownup' });
  const link = child => { const c = F.createCode(child); assert.equal(c.ok, true); assert.equal(F.redeem(auth.getUser(g.id), c.code).ok, true); };
  const yes = kid(), no = kid();
  link(yes); assert.equal(n('parent.child'), 0, 'a request is not a link yet');
  assert.equal(F.answer(auth.getUser(yes.id), 'yes').ok, true);
  link(no); F.answer(auth.getUser(no.id), 'no');
  assert.equal(n('parent.child'), 1);
});

test('/admin/stats shows the three funnels with last 7 days vs the 7 before; admins only', async () => {
  reset();
  funnel.bump('parent.view', 40); funnel.bump('parent.signup', 4); funnel.bump('kid.play', 12);
  funnel.bump('kid.play', 20, today(Date.now() - 8 * 86400e3));
  const admin = auth.createUser({ username: 'FunnelAdmin', password: 'a-long-password-1' });
  q.run("UPDATE users SET role='admin' WHERE id=?", admin.id);
  const page = await (await visit('/admin/stats', cookieFor(admin))).text();
  assert.match(page, /Funnels, last 7 days vs the 7 before/);
  for (const h of ['Parents', 'Teachers', 'Guardrail']) assert.match(page, new RegExp(`<h2 id="funnel-\\w+">${h}`));
  assert.match(page, /<tr><td>Parent page views<\/td><td>40<\/td><td>0<\/td><td>new<\/td><td><\/td><\/tr>/);
  assert.match(page, /<tr><td>Grown-up sign-ups<\/td><td>4<\/td><td>0<\/td><td>new<\/td><td>10%<\/td><\/tr>/);
  assert.match(page, /<tr><td>Games played<\/td><td>12<\/td><td>20<\/td><td><span class="chip-s warn">−40%<\/span><\/td><\/tr>/, 'a guardrail drop stands out');
  assert.doesNotMatch(page, /Builder turns|\bturns\b/i);
  const kidPage = await visit('/admin/stats', cookieFor(kid()));
  assert.notEqual(kidPage.status, 200);
});
