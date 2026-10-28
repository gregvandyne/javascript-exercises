// Teachers (the navigation proposal, week 1): the "Set up my school" form on /teachers (stored in school_requests,
// rate-limited, same-origin only, never shown to a kid's account, nothing echoed back), the platform admin's "School
// requests" queue on /admin (done / declined / reopen, "Create school" through the usual Add a school form), and on
// /plans/schools a seat calculator (Stripe's seat price, at least SCHOOL_MIN_SEATS) and a page to print for the admin.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_sr', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_sr';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const SC = await import('../../server/services/schools.js');
const SR = await import('../../server/services/school-requests.js');
const { seatQuote } = await import('../../server/routes/plans.js');
const { SETUP_LIMITS } = await import('../../server/routes/teachers.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; config.schoolMinSeats = 25; resetLimits(); q.run('DELETE FROM school_requests'); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body, headers = {}, form = false } = {}) {
  const h = { ...headers }; if (cookie) h.cookie = cookie;
  let payload;
  if (body !== undefined) { h['content-type'] = form ? 'application/x-www-form-urlencoded' : 'application/json'; payload = form ? new URLSearchParams(body).toString() : JSON.stringify(body); }
  const r = await fetch(base + path, { method, headers: h, body: payload, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
const as = u => (path, opts) => call(u ? cookieFor(u.id) : null, path, opts);
let n = 0;
const kid = () => auth.createUser({ username: `SrKid${++n}`, password: 'rainbow-77' });
const grownup = () => { const u = auth.createUser({ username: `SrParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
const admin = () => auth.createUser({ username: `SrBoss${++n}`, password: 'rainbow-77', role: 'admin' });
const good = (over = {}) => ({ school: 'Maple Street Elementary', role: 'teacher', email: 'Ms.Rivera@maple.k12.example.org', students: '320', country: 'United States', ...over });
const send = (u, body, opts = {}) => as(u)('/api/teachers/school-request', { method: 'POST', body, ...opts });
const start = s => (/<section class="panel lp-start"[\s\S]*?<\/section>/.exec(s) || [''])[0];

test('/teachers: the "Set up my school" form replaces the email link; it says 1 school day; no prices', async () => {
  const r = await call(null, '/teachers');
  assert.equal(r.status, 200);
  const s = start(r.text);
  assert.match(s, /<form class="sr-form" data-api="\/api\/teachers\/school-request" data-next="\/teachers\?sent=1#start" method="post"/);
  for (const name of ['school', 'role', 'email', 'students', 'country']) assert.match(s, new RegExp(`name="${name}"[^>]*required|<select[^>]*name="${name}" required`), name);
  assert.match(s, /type="email"/); assert.match(s, /type="number"/);
  assert.match(s, /within 1 school day/);
  assert.doesNotMatch(s, /mailto:[^"]*\?subject=/, 'no "Email us" button any more');
  assert.match(s, /Questions first\? Write to <a href="mailto:/, 'the address stays as a small line');
  assert.doesNotMatch(r.text, /\$\d/, 'no amounts on the teacher page');
  // A guest (one game played), a grown-up account, school staff and the platform admin get the form too.
  const staff = auth.createUser({ username: `SrTeach${++n}`, password: 'rainbow-77' });
  const sch = SC.createSchool(admin(), { name: `Sr School ${n}` }).school;
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'teacher','active',?)", sch.id, staff.id, Date.now());
  for (const u of [auth.createGuest(), grownup(), staff, admin()]) assert.match(start((await as(u)('/teachers')).text), /class="sr-form"/, u.username);
});

test('a kid\'s own or school account never gets the form (no email asked of a child), and its POST is refused', async () => {
  const k = kid();
  const s = start((await as(k)('/teachers')).text);
  assert.doesNotMatch(s, /<form|name="email"/);
  assert.match(s, /Show this page to your teacher!/);
  const r = await send(k, good());
  assert.equal(r.status, 404);
  assert.equal(SR.openCount(), 0);
});

test('sending: stored once, thank-you page with nothing echoed back, the admin count goes up', async () => {
  const r = await send(null, good({ school: '  Maple   Street <b>Elementary</b> ' }));
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(r.json, { ok: true });
  const row = q.get('SELECT * FROM school_requests');
  assert.equal(row.school_name, 'Maple Street <b>Elementary</b>', 'spaces tidied, kept as typed (escaped where shown)');
  assert.equal(row.email, 'ms.rivera@maple.k12.example.org');
  assert.equal(row.students, 320); assert.equal(row.role, 'teacher'); assert.equal(row.country, 'United States');
  assert.equal(row.status, 'open'); assert.equal(row.user_id, null); assert.equal(row.locale, 'en');
  const thanks = await call(null, '/teachers?sent=1');
  const s = start(thanks.text);
  assert.match(s, /Thank you! We(&#39;|')ve got your request\./);
  assert.match(s, /within 1 school day/);
  assert.doesNotMatch(s, /<form/);
  assert.doesNotMatch(thanks.text, /Maple|rivera/i, 'nothing typed is shown back');
  // A grown-up account is remembered (to tell repeat requests apart). A guest is not: a guest is often a child who
  // tapped Play, and signing up keeps the guest's id, so it must never sit next to an email.
  const g = auth.createGuest();
  assert.equal((await send(g, good({ school: 'Oak Hill' }))).status, 200);
  assert.equal(q.get("SELECT user_id FROM school_requests WHERE school_name='Oak Hill'").user_id, null, 'a guest is stored as nobody');
  const p = grownup();
  assert.equal((await send(p, good({ school: 'Birch Lane' }))).status, 200, 'a parent who teaches may send it');
  assert.equal(q.get("SELECT user_id FROM school_requests WHERE school_name='Birch Lane'").user_id, p.id);
});

test('every field is checked, with its own message; lengths are capped', async () => {
  const cases = [
    [{ school: 'X' }, 'school'], [{ school: 'S'.repeat(101) }, 'school'], [{ school: '' }, 'school'],
    [{ role: 'boss' }, 'role'], [{ role: '' }, 'role'],
    [{ email: 'not-an-email' }, 'email'], [{ email: 'a@b' }, 'email'], [{ email: `${'a'.repeat(250)}@x.org` }, 'email'], [{ email: 'a b@x.org' }, 'email'], [{ email: '<x@y.org>' }, 'email'],
    [{ students: '0' }, 'students'], [{ students: '2.5' }, 'students'], [{ students: 'lots' }, 'students'], [{ students: '1000001' }, 'students'], [{ students: '' }, 'students'],
    [{ country: '' }, 'country'], [{ country: 'C'.repeat(61) }, 'country'],
  ];
  for (const [over, field] of cases) {
    resetLimits();
    const r = await send(null, good(over));
    assert.equal(r.status, 400, JSON.stringify(over));
    assert.equal(r.json.field, field, JSON.stringify(over));
    assert.ok(r.json.error.length > 5);
  }
  assert.equal(SR.openCount(), 0);
  assert.equal(SR.validate(good({ students: 1 })).ok, true, 'a number works as well as a string');
  // An empty form: every field comes back at once, each with its own message.
  resetLimits();
  const empty = await send(null, {});
  assert.equal(empty.status, 400);
  assert.equal(empty.json.field, 'school');
  assert.deepEqual(Object.keys(empty.json.errors), ['school', 'role', 'email', 'students', 'country']);
  assert.match(empty.json.errors.email, /name@school\.org/);
});

test('rate-limited per address; the hidden robot field is thanked but not stored; cross-site posts are refused', async () => {
  for (let i = 0; i < SETUP_LIMITS.perIpHour; i++) assert.equal((await send(null, good({ school: `School ${i}` }))).status, 200);
  const slow = await send(null, good());
  assert.equal(slow.status, 429);
  assert.match(slow.json.error, /try again in an hour/);
  assert.equal(SR.openCount(), SETUP_LIMITS.perIpHour);
  resetLimits();
  // Mistakes and robot posts don't use up the stored-request limits (a teacher fixing a form isn't locked out).
  for (let i = 0; i < SETUP_LIMITS.perIpHour * 3; i++) assert.equal((await send(null, good({ email: 'nope' }))).status, 400);
  for (let i = 0; i < SETUP_LIMITS.perIpHour * 2; i++) assert.equal((await send(null, good({ website: 'x' }))).status, 200);
  assert.equal((await send(null, good({ school: 'After Typos' }))).status, 200, 'still allowed after fixing mistakes');
  // A flood of tries stops at the much larger tries limit.
  resetLimits();
  for (let i = 0; i < SETUP_LIMITS.triesPerIpHour; i++) await send(null, good({ email: 'nope' }));
  assert.equal((await send(null, good({ school: 'Flooded' }))).status, 429);
  // The everyone-per-day limit has its own message (waiting an hour wouldn't help).
  resetLimits();
  const { allow } = await import('../../server/services/ratelimit.js');
  for (let i = 0; i < SETUP_LIMITS.perDay; i++) allow('school-request:all', SETUP_LIMITS.perDay, 86400e3);
  const busy = await send(null, good({ school: 'Busy Day' }));
  assert.equal(busy.status, 429);
  assert.match(busy.json.error, /a lot of requests today/);
  assert.doesNotMatch(busy.json.error, /hour/);
  resetLimits();
  assert.equal((await send(null, good({ school: 'Robot Academy', website: 'http://spam.example' }))).status, 200);
  assert.equal(q.get("SELECT COUNT(*) n FROM school_requests WHERE school_name='Robot Academy'").n, 0);
  const cross = await send(null, good(), { headers: { 'sec-fetch-site': 'cross-site' } });
  assert.equal(cross.status, 403);
  const other = await send(null, good(), { headers: { origin: 'https://evil.example' } });
  assert.equal(other.status, 403);
});

test('without JavaScript the form posts as a plain form and gets the page back', async () => {
  const ok = await send(null, { ...good(), back: '/es/teachers' }, { form: true });
  assert.equal(ok.status, 303);
  assert.equal(ok.location, '/es/teachers?sent=1#start');
  assert.equal(SR.openCount(), 1);
  const bad = await send(null, { ...good({ email: 'nope' }), back: 'https://evil.example/teachers' }, { form: true });
  assert.equal(bad.status, 303);
  assert.equal(bad.location, '/teachers?failed=1#start', 'only a teacher page of this site');
  assert.match(start((await call(null, '/teachers?failed=1')).text), /needs fixing/);
});

test('/admin: a "School requests" tab with a count, done / declined / reopen, and "Create school" through Add a school', async () => {
  const boss = admin();
  await send(null, good({ school: 'Maple <script>alert(1)</script>' }));
  await send(null, good({ school: 'Cedar High', email: 'it@cedar.example.org', role: 'it' }));
  const [maple, cedar] = q.all('SELECT * FROM school_requests ORDER BY school_name DESC');
  // Not for anyone else.
  for (const u of [null, kid(), grownup()]) {
    assert.equal((await as(u)('/admin?tab=schoolreq')).status, 404);
    assert.equal((await as(u)(`/api/admin/school-requests/${maple.id}/done`, { method: 'POST', body: {} })).status, 404);
  }
  const home = await as(boss)('/admin');
  assert.match(home.text, /href="\/admin\?tab=schoolreq"[^>]*>[\s\S]*?School requests&nbsp;<span class="badge">2<\/span>/);
  assert.match(home.text, /href="\/admin\/schools">[\s\S]*?Schools&nbsp;<span class="badge"[^>]*>2<\/span>/, 'the count on the Schools button too');
  const tab = (await as(boss)('/admin?tab=schoolreq')).text;
  assert.match(tab, /Maple &lt;script&gt;alert\(1\)&lt;\/script&gt;/, 'escaped');
  assert.doesNotMatch(tab, /<script>alert/);
  assert.match(tab, /href="mailto:it@cedar\.example\.org"/);
  assert.match(tab, new RegExp(`href="/admin/schools\\?request=${cedar.id}">➕ Create school`));
  // Decline Maple, reopen it, decline again.
  assert.equal((await as(boss)(`/api/admin/school-requests/${maple.id}/declined`, { method: 'POST', body: {} })).status, 200);
  assert.equal(SR.getRequest(maple.id).status, 'declined');
  assert.equal((await as(boss)(`/api/admin/school-requests/${maple.id}/declined`, { method: 'POST', body: {} })).status, 404, 'only open ones');
  assert.equal((await as(boss)(`/api/admin/school-requests/${maple.id}/reopen`, { method: 'POST', body: {} })).status, 200);
  assert.equal(SR.getRequest(maple.id).status, 'open');
  assert.equal((await as(boss)(`/api/admin/school-requests/${maple.id}/nonsense`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await as(boss)(`/api/admin/school-requests/${maple.id}/done`, { method: 'POST', body: {} })).status, 200);
  // Create school for Cedar: the form is filled in, and adding the school closes the request with it.
  const form = (await as(boss)(`/admin/schools?request=${cedar.id}`)).text;
  assert.match(form, new RegExp(`<input type="hidden" name="request" value="${cedar.id}">`));
  assert.match(form, /name="name"[^>]*value="Cedar High"/);
  const made = await as(boss)('/api/admin/schools', { method: 'POST', body: { name: 'Cedar High', request: cedar.id } });
  assert.equal(made.status, 200, made.text);
  const closed = SR.getRequest(cedar.id);
  assert.equal(closed.status, 'done'); assert.equal(closed.closed_by, boss.id);
  assert.equal(closed.school_id, SC.getSchoolBySlug(made.json.redirect.split('/')[2].split('?')[0]).id);
  assert.equal(SR.openCount(), 0);
  const after = (await as(boss)('/admin?tab=schoolreq')).text;
  assert.match(after, /No school requests waiting/);
  assert.match(after, /Recently closed[\s\S]*Cedar High[\s\S]*✅ <a href="\/school\//);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='school_request.done' AND target=?", cedar.id));
  assert.doesNotMatch(q.all('SELECT details FROM audit_log').map(r => r.details).join(' '), /cedar\.example/, 'no email in the audit log');
});

test('requests are deleted 1 year after they are closed (or made, if never closed)', () => {
  const t0 = Date.now();
  const a = SR.createRequest(good()).id; const b = SR.createRequest(good({ school: 'Kept' })).id;
  q.run('UPDATE school_requests SET created_at=? WHERE id=?', t0 - SR.KEEP_MS - 1000, a);
  assert.equal(SR.retention(t0), 1);
  assert.equal(SR.getRequest(a), null); assert.ok(SR.getRequest(b));
});

test('a flood stops at MAX_OPEN', () => {
  const stmt = 'INSERT INTO school_requests(id, school_name, role, email, students, country, status, created_at) VALUES (?,?,?,?,?,?,?,?)';
  for (let i = 0; i < SR.MAX_OPEN; i++) q.run(stmt, `flood${i}`, 'S', 'teacher', 'a@b.org', 1, 'US', 'open', Date.now());
  assert.deepEqual(SR.createRequest(good()), { ok: false, code: 'full' });
});

test('seat calculator: students × Stripe\'s seat price, at least SCHOOL_MIN_SEATS', async () => {
  assert.deepEqual(seatQuote('40', 2000), { students: 40, seats: 40, min: 25, unit: 2000, total: 80000 });
  assert.deepEqual(seatQuote('10', 2000), { students: 10, seats: 25, min: 25, unit: 2000, total: 50000 });
  assert.equal(seatQuote('abc', 2000).students, null);
  assert.equal(seatQuote('3', null).total, null, 'no price, no total');
  const r = await call(null, '/plans/schools?students=40');
  assert.equal(r.status, 200);
  assert.match(r.text, /id="calc"/);
  assert.match(r.text, /40 students × \$20\.00 = <b>\$800\.00<\/b> a year/);
  assert.match(r.text, /href="\/plans\/schools\/print\?students=40"[^>]*>🖨️ Send this to my admin/);
  assert.match(r.text, /href="\/teachers#start"/, 'set up through the form, not an email');
  const small = await call(null, '/plans/schools?students=10');
  assert.match(small.text, /25 students × \$20\.00 = <b>\$500\.00<\/b> a year/);
  assert.match(small.text, /at least 25 students, so a smaller school pays for 25/);
  config.schoolMinSeats = 5;
  assert.match((await call(null, '/plans/schools?students=10')).text, /10 students × \$20\.00 = <b>\$200\.00<\/b>/, 'the minimum comes from config');
});

test('"Send this to my admin": a printable page with the price and total, never indexed; off with billing like /plans/schools', async () => {
  const r = await call(null, '/plans/schools/print?students=120');
  assert.equal(r.status, 200);
  assert.match(r.text, /<meta name="robots" content="noindex/);
  assert.match(r.text, /data-print/); assert.match(r.text, /\/js\/print\.js/);
  assert.match(r.text, /Price per student, per year<\/th><td dir="ltr">\$20\.00/);
  assert.match(r.text, /Total per year<\/th><td dir="ltr"><b>\$2,400\.00<\/b>/);
  assert.match(r.text, /fill in the short form at <bdi dir="ltr"><b>[^<]+\/teachers<\/b><\/bdi>/);
  assert.equal((await as(grownup())('/plans/schools/print')).status, 200, 'a grown-up may open it');
  config.stripeApiKey = '';
  for (const p of ['/plans/schools', '/plans/schools/print']) assert.equal((await call(null, p)).status, 404, p);
  // With billing off, the teacher page doesn't link plans; the form still works.
  const t = await call(null, '/teachers');
  assert.doesNotMatch(t.text, /href="\/plans/);
  assert.match(t.text, /class="sr-form"/);
});
