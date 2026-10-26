// Paid plans, chunk 3: grown-up accounts and family links (server/services/family.js, server/routes/family.js). No
// payments. Billing is on against the fake Stripe (families are on exactly when billing is), except where a test turns
// it off. Covers grown-up sign-up and sessions, the fence around grown-up accounts (the access matrix per route group),
// link codes, the child's Yes / No / Report, the /family view, the chat filter, retention, bans and the admin queue.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_fam', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_fam';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';   // the family pages for everyone; the preview gate has its own test
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const B = await import('../../server/services/billing.js');
const S = await import('../../server/services/schools.js');
const chat = await import('../../server/services/chat.js');
const friends = await import('../../server/services/friends.js');
const games = await import('../../server/services/games.js');
const mod = await import('../../server/services/moderation.js');
const { job } = await import('../../server/services/jobs.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const TF = await import('../../server/services/textfilter.js');
const { scanVersion } = await import('../../server/services/scanner.js');
const i18n = await import('../../server/i18n/index.js');

const DAY = 86400e3, HOUR = 3600e3;
let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body, headers = {} } = {}) {
  const h = { ...headers, ...(cookie ? { cookie } : {}) }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  const set = r.headers.getSetCookie().map(c => c.split(';')[0]).find(c => c.startsWith('brb_session=') && c !== 'brb_session=');
  return { status: r.status, text, json, location: r.headers.get('location'), cookie: set || null };
}
const as = u => (path, opts) => call(cookieFor(u.id), path, opts);
let n = 0;
const kid = (name = `Kiddo${++n}`) => auth.createUser({ username: name, password: 'rainbow-77' });
function grownup(name = `Parent${++n}`) { const u = auth.createUser({ username: name, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); }
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND (? IS NULL OR target=?) ORDER BY created_at', action, target ?? null, target ?? null);
/** A child's code, read back from the API like the /me button does. */
const codeFor = async child => { const r = await as(child)('/api/me/family/code', { method: 'POST', body: {} }); assert.equal(r.status, 200, r.text); return r.json.code; };
const linkUp = async (g, child) => {
  const code = await codeFor(child);
  assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code } })).status, 200);
  assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
};

/** A published public game with a published version (so /g and /play work), owned by u: tests never depend on seed games. */
function publicGame(u) {
  const id = uid(), vid = uid(), slug = `fam-${id.toLowerCase()}`, t = Date.now();
  q.run("INSERT INTO games(id, slug, owner_id, title, status, visibility, created_at, updated_at) VALUES (?,?,?,?,'published','public',?,?)", id, slug, u.id, 'Family test game', t, t);
  q.run('INSERT INTO game_versions(id, game_id, number, html, created_at) VALUES (?,?,?,?,?)', vid, id, 1, '<!doctype html><p>hi</p>', t);
  q.run('UPDATE games SET published_version_id=?, current_version_id=? WHERE id=?', vid, vid, id);
  return q.get('SELECT * FROM games WHERE id=?', id);
}
const boss = auth.createUser({ username: 'FamBoss', password: 'boss-password-1', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Acorn Valley School' }).school;
const teacher = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Teach', role: 'teacher' }).user;
const student = S.createSchoolAccount(teacher, oak.id, { rosterName: 'Stu Dent' }).user;

// ---------------------------------------------------------------- grown-up accounts
test('grown-up sign-up: 12+ characters, the parent-or-guardian box, no friend code, a family, audited; lands on /family', async () => {
  const bad = async (body, field, status = 400) => { const r = await call(null, '/api/grown-ups/signup', { method: 'POST', body }); assert.equal(r.status, status, r.text); assert.equal(r.json.field, field); };
  const ok = { username: 'MumOfTwo', password: 'twelve-chars-ok', confirm: 'twelve-chars-ok', adult: '1' };
  await bad({ ...ok, password: 'short-pw-1', confirm: 'short-pw-1' }, 'password');
  await bad({ ...ok, confirm: 'something-else' }, 'confirm');
  await bad({ ...ok, adult: undefined }, 'adult');
  await bad({ ...ok, username: 'x' }, 'username');
  const r = await call(null, '/api/grown-ups/signup', { method: 'POST', body: ok });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.redirect, '/family'); assert.ok(r.cookie);
  const u = auth.getUserByName('MumOfTwo');
  assert.equal(u.account_type, 'grownup'); assert.equal(u.friend_code, null); assert.equal(u.role, 'player');
  assert.equal(auth.accountKind(u), 'grownup'); assert.ok(auth.isGrownup(u));
  assert.ok(F.familyOfOwner(u.id));
  assert.deepEqual(JSON.parse(audits('user.signup', u.id)[0].details), { grownup: true });
  assert.equal(audits('family.create', F.familyOfOwner(u.id).id).length, 1);
  await bad({ ...ok }, 'username');   // taken
  // Signing in: a grown-up lands on /family, and a ?next= only to a page they may open.
  let li = await call(null, '/api/auth/login', { method: 'POST', body: { username: 'MumOfTwo', password: 'twelve-chars-ok' } });
  assert.equal(li.json.redirect, '/family');
  li = await call(null, '/api/auth/login', { method: 'POST', body: { username: 'MumOfTwo', password: 'twelve-chars-ok', next: '/build' } });
  assert.equal(li.json.redirect, '/family');
  li = await call(null, '/api/auth/login', { method: 'POST', body: { username: 'MumOfTwo', password: 'twelve-chars-ok', next: '/family/link' } });
  assert.equal(li.json.redirect, '/family/link');
  // A child is never sent to a family page.
  const k = kid();
  li = await call(null, '/api/auth/login', { method: 'POST', body: { username: k.username, password: 'rainbow-77', next: '/family' } });
  assert.equal(li.json.redirect, '/');
});

test('grown-up sign-up from a guest makes a new account (the guest stays a guest); a signed-in kid must sign out first', async () => {
  const guest = auth.createGuest();
  const r = await as(guest)('/api/grown-ups/signup', { method: 'POST', body: { username: 'DadFromGuest', password: 'twelve-chars-ok', confirm: 'twelve-chars-ok', adult: true } });
  assert.equal(r.status, 200, r.text);
  const g = auth.getUserByName('DadFromGuest');
  assert.notEqual(g.id, guest.id); assert.equal(auth.getUser(guest.id).is_guest, 1); assert.equal(auth.getUser(guest.id).account_type, 'kid');
  const k = kid();
  const r2 = await as(k)('/api/grown-ups/signup', { method: 'POST', body: { username: 'NotAllowedDad', password: 'twelve-chars-ok', confirm: 'twelve-chars-ok', adult: '1' } });
  assert.equal(r2.status, 409); assert.equal(auth.getUserByName('NotAllowedDad'), null);
  assert.equal(auth.getUser(k.id).account_type, 'kid', 'a kid account never becomes a grown-up');
  const page = await as(k)('/grown-ups/signup');
  assert.equal(page.status, 200); assert.match(page.text, /Sign out first/); assert.doesNotMatch(page.text, /api\/grown-ups\/signup/);
  // The kid sign-up never makes a grown-up, whatever it is sent.
  const r3 = await call(null, '/api/auth/signup', { method: 'POST', body: { username: 'SneakyParent', password: 'rainbow-77', accountType: 'grownup' } });
  assert.equal(r3.status, 200); assert.equal(auth.getUserByName('SneakyParent').account_type, 'kid');
});

test('grown-up sessions follow the staff rules (12 hours idle, 7 days at most); password changes need 12 characters', async () => {
  assert.deepEqual(auth.SESSION_RULES.grownup, auth.SESSION_RULES.staff);
  const g = grownup();
  const c = cookieFor(g.id);
  const s = q.get('SELECT * FROM sessions WHERE user_id=? ORDER BY created_at DESC', g.id);
  assert.equal(s.expires_at - s.created_at, 7 * DAY);
  assert.equal((await call(c, '/api/me')).json.user.username, g.username);
  q.run('UPDATE sessions SET last_active=? WHERE id=?', Date.now() - 13 * HOUR, s.id);
  assert.equal((await call(c, '/api/me')).json.user, null, 'idle for 13 hours: signed out');
  const pw = (body) => as(g)('/api/me/password', { method: 'POST', body });
  let r = await pw({ current: 'a-long-password-1', password: 'only-11-chr', confirm: 'only-11-chr' });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'password');
  r = await pw({ current: 'a-long-password-1', password: 'a-new-password-12', confirm: 'a-new-password-12' });
  assert.equal(r.status, 200, r.text);
  // A short password noted at sign-in (e.g. set before the rule) asks for a longer one.
  auth.notePasswordLength(auth.getUser(g.id), 'short');
  assert.equal(auth.getUser(g.id).password_short, 1);
  const fam = await as(g)('/family');
  assert.match(fam.text, /choose a longer one/); assert.match(fam.text, /href="\/family#password"/);
  // Sign out everywhere works for grown-ups too.
  assert.equal((await as(g)('/api/auth/logout-everywhere', { method: 'POST', body: {} })).status, 200);
});

// ---------------------------------------------------------------- the access matrix
// Route groups and what each kind of account gets. 'ok' = 200 (or a redirect to a page they may open).
const GROUPS = {
  builder: [['GET', '/build'], ['POST', '/api/studio/new']],
  studio: [['GET', '/studio/abc'], ['GET', '/api/studio/abc']],
  chat: [['GET', '/chat'], ['GET', '/api/chat'], ['POST', '/api/chat/someone']],
  friends: [['GET', '/friends'], ['GET', '/api/friends'], ['POST', '/api/friends/add']],
  profile: [['GET', '/u/FamBoss']],
  classes: [['GET', '/classes'], ['GET', '/teach'], ['POST', '/api/classes/join']],
  school: [['GET', `/school/${oak.slug}`]],
  lessons: [['GET', '/teach/lessons']],
  admin: [['GET', '/admin'], ['GET', '/api/admin/users']],
  social: [['GET', '/favorites'], ['POST', '/api/me'], ['POST', '/api/me/photo']],
  google: [['POST', '/api/me/google/connect']],
  kidsignup: [['POST', '/api/auth/signup']],
};
test('access matrix: a grown-up gets 404 on every kid route group, and can play games and use the family pages', async () => {
  const g = grownup();
  const go = as(g);
  for (const [group, routes] of Object.entries(GROUPS)) {
    for (const [method, path] of routes) {
      const r = await go(path, { method, body: method === 'POST' ? {} : undefined });
      assert.equal(r.status, 404, `${group}: ${method} ${path} -> ${r.status}`);
    }
  }
  assert.equal((await go('/me')).location, '/family', '/me sends a grown-up to their family page');
  const slug = q.get("SELECT slug FROM games WHERE status='published' LIMIT 1")?.slug;
  for (const p of ['/', '/search', '/parents', '/safety', '/grown-ups', '/family', '/family/link', ...(slug ? [`/g/${slug}`, `/play/${slug}`] : [])]) {
    const r = await go(p); assert.equal(r.status, 200, `${p} -> ${r.status}`);
  }
  // Nav: Home, Search and Family; no Build, Friends or Me tab.
  const home = await go('/');
  assert.match(home.text, /href="\/family"/); assert.doesNotMatch(home.text, /class="navlink" href="\/build"/); assert.doesNotMatch(home.text, /class="tab" href="\/me"/);
});

test('access matrix: family routes are 404 for kids, school students, teachers, guests and the admin; the child panel only for own kid accounts', async () => {
  const people = { kid: kid(), student: auth.getUser(student.id), teacher: auth.getUser(teacher.id), guest: auth.createGuest(), admin: boss };
  for (const [who, u] of Object.entries(people)) {
    const go = as(u);
    for (const [method, path] of [['GET', '/family'], ['GET', '/family/link'], ['POST', '/api/family/link'], ['POST', '/api/family/children/x/remove']]) {
      const r = await go(path, { method, body: method === 'POST' ? { code: 'ABC-2345' } : undefined });
      const expect = who === 'guest' && method === 'GET' ? 302 : 404;   // a guest is asked to sign in as a grown-up
      assert.equal(r.status, expect, `${who}: ${method} ${path} -> ${r.status}`);
    }
    for (const path of ['/api/me/family/code', '/api/me/family/answer', '/api/me/family/unlink', '/api/me/family/report']) {
      const r = await go(path, { method: 'POST', body: { answer: 'yes' } });
      assert.equal(r.status, who === 'kid' ? (path.endsWith('code') ? 200 : 409) : 404, `${who}: ${path} -> ${r.status}`);
    }
    const me = await go('/me');
    assert.equal(/id="grownups"/.test(me.text), who === 'kid', `${who}: the "For grown-ups" panel`);
  }
  // Signed out: the family pages ask for the grown-up sign-in; the APIs 404.
  assert.match((await call(null, '/family')).location, /^\/grown-ups\/login\?next=%2Ffamily/);
  assert.equal((await call(null, '/api/family/link', { method: 'POST', body: { code: 'x' } })).status, 404);
  assert.equal((await call(null, '/api/me/family/code', { method: 'POST', body: {} })).status, 404);
  // A grown-up can't use the child's side either.
  assert.equal((await as(grownup())('/api/me/family/code', { method: 'POST', body: {} })).status, 404);
});

test('billing off: no family pages, no panel, no /parents link; grown-ups stay fenced in', async () => {
  const k = kid(); const g = grownup();
  config.stripeApiKey = '';
  for (const p of ['/grown-ups', '/grown-ups/signup', '/grown-ups/login']) assert.equal((await call(null, p)).status, 404, p);
  assert.equal((await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: 'OffParent', password: 'twelve-chars-ok', confirm: 'twelve-chars-ok', adult: '1' } })).status, 404);
  assert.equal((await as(k)('/api/me/family/code', { method: 'POST', body: {} })).status, 404);
  const me = await as(k)('/me'); assert.equal(me.status, 200); assert.doesNotMatch(me.text, /id="grownups"/);
  assert.doesNotMatch((await call(null, '/parents')).text, /href="\/grown-ups"/);
  // A grown-up who already has an account keeps a small /family page: language, password and Sign out, nothing else.
  const li = await call(null, '/api/auth/login', { method: 'POST', body: { username: g.username, password: 'a-long-password-1' } });
  assert.equal(li.status, 200, li.text);
  const home = await call(li.cookie, li.json.redirect);
  assert.equal(home.status, 200, `${li.json.redirect} -> ${home.status}`);
  assert.match(home.text, /data-api="\/api\/auth\/logout"/); assert.match(home.text, /data-api="\/api\/me\/password"/); assert.match(home.text, /id="lang-select"|id="language"|availableLocales/);
  assert.match(home.text, /switched off/); assert.doesNotMatch(home.text, /href="\/family\/link"/);
  for (const [method, path] of [['GET', '/family/link'], ['POST', '/api/family/link'], ['POST', '/api/family/children/x/remove']]) {
    assert.equal((await as(g)(path, { method, body: method === 'POST' ? { code: 'ABC-2345' } : undefined })).status, 404, `off: ${method} ${path}`);
  }
  assert.equal((await as(k)('/family')).status, 404, 'off: still no /family for a kid');
  assert.equal((await call(li.cookie, '/api/auth/logout', { method: 'POST', body: {} })).status, 200, 'the grown-up can sign out');
  assert.equal((await as(g)('/build')).status, 404, 'still no Builder for a grown-up');
  config.stripeApiKey = 'rk_test_fake';
  assert.match((await call(null, '/parents')).text, /href="\/grown-ups"/, 'on: /parents links to /grown-ups');
});

// ---------------------------------------------------------------- codes and the child's answer
test('codes: K7Q-4MZ9 shape with a digit, stored only as an HMAC, 1 hour, one open per child, single use', async () => {
  for (let i = 0; i < 300; i++) { const c = F.newCodeText(); assert.match(c, /^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/); assert.match(c, /[2-9]/); }
  const k = kid(); const g1 = grownup(); const g2 = grownup();
  const c1 = await codeFor(k);
  const row = q.get('SELECT * FROM family_link_codes WHERE child_id=?', k.id);
  assert.equal(row.expires_at - row.created_at, HOUR);
  assert.ok(!JSON.stringify(q.all('SELECT * FROM family_link_codes')).includes(c1.replace('-', '')), 'the code itself is never stored');
  assert.ok(F.openCode(k.id));
  // A new code ends the old one.
  const c2 = await codeFor(k);
  assert.equal((await as(g1)('/api/family/link', { method: 'POST', body: { code: c1 } })).status, 400);
  // Spaces, dashes and case don't matter.
  assert.equal((await as(g1)('/api/family/link', { method: 'POST', body: { code: ` ${c2.toLowerCase().replace('-', ' ')} ` } })).status, 200);
  // Used: nobody else can use it.
  assert.equal((await as(g2)('/api/family/link', { method: 'POST', body: { code: c2 } })).status, 400);
  assert.equal(audits('family.link.request', F.familyOfOwner(g1.id).id).length, 1);
  // While a request waits, no new code; after 24 hours it is gone and a code works again.
  assert.equal((await as(k)('/api/me/family/code', { method: 'POST', body: {} })).status, 409);
  q.run('UPDATE family_children SET requested_at=? WHERE child_id=?', Date.now() - DAY - 1000, k.id);
  assert.equal(F.pendingOf(k.id), null);
  const c3 = await codeFor(k);
  // Expired after an hour.
  q.run('UPDATE family_link_codes SET expires_at=? WHERE child_id=? AND used_at IS NULL', Date.now() - 1, k.id);
  assert.equal((await as(g2)('/api/family/link', { method: 'POST', body: { code: c3 } })).status, 400);
  assert.equal((await as(g2)('/api/family/link', { method: 'POST', body: { code: 'not a code' } })).status, 400);
});

test('the child says Yes, No or Report; the child sees only "your grown-up"; one family per child; at most 4 children', async () => {
  const g = grownup('PrettyObviousName');
  const fam = F.familyOfOwner(g.id);
  // No
  const a = kid(); let code = await codeFor(a);
  await as(g)('/api/family/link', { method: 'POST', body: { code } });
  let me = await as(a)('/me');
  assert.match(me.text, /<b>Your grown-up<\/b> wants to link to your account/);
  assert.doesNotMatch(me.text, /PrettyObviousName/, 'never the name the adult typed');
  assert.match(me.text, /class="badge"/, 'a badge on Me while a request waits');
  // The family page shows a waiting request without the child's name.
  let fp = await as(g)('/family');
  assert.match(fp.text, /Waiting for your child to say yes/); assert.doesNotMatch(fp.text, new RegExp(a.username));
  assert.ok(!fp.text.includes(a.id), 'nor the child\'s user id (it shows in public photo URLs)');
  // The child is reminded who a code is for, and asked if they gave it in person.
  assert.match(me.text, /did you give your code to your parent or guardian yourself/i);
  // Cancelling the request uses the token.
  assert.equal((await as(g)(`/api/family/children/${F.requestToken(fam.id, a.id)}/remove`, { method: 'POST', body: {} })).status, 200);
  assert.equal(F.liveRowOf(a.id), null);
  await as(g)('/api/family/link', { method: 'POST', body: { code: await codeFor(a) } });
  assert.equal((await as(a)('/api/me/family/answer', { method: 'POST', body: { answer: 'no' } })).status, 200);
  assert.equal(F.liveRowOf(a.id), null);
  // Yes
  code = await codeFor(a);
  await as(g)('/api/family/link', { method: 'POST', body: { code } });
  assert.equal((await as(a)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
  assert.equal(F.linkOf(a.id).family_id, fam.id);
  me = await as(a)('/me');
  assert.match(me.text, /Linked to <b>your grown-up<\/b>/); assert.doesNotMatch(me.text, /PrettyObviousName/);
  assert.equal(audits('family.link', fam.id).length, 1);
  fp = await as(g)('/family'); assert.match(fp.text, new RegExp(a.username));
  // One family per child: a linked child can't make a code, and the database allows one live row per child.
  assert.equal((await as(a)('/api/me/family/code', { method: 'POST', body: {} })).status, 409);
  const other = grownup();
  assert.throws(() => q.run("INSERT INTO family_children(family_id, child_id, status, requested_at) VALUES (?,?,'pending',?)", F.familyOfOwner(other.id).id, a.id, Date.now()), /UNIQUE/);
  // Report on a request: no link, a report for the admin.
  const b = kid(); code = await codeFor(b);
  await as(other)('/api/family/link', { method: 'POST', body: { code } });
  assert.equal((await as(b)('/api/me/family/answer', { method: 'POST', body: { answer: 'report' } })).status, 200);
  assert.equal(F.liveRowOf(b.id), null);
  const rep = q.get('SELECT * FROM link_reports WHERE child_id=?', b.id);
  assert.equal(rep.family_id, F.familyOfOwner(other.id).id); assert.equal(rep.status, 'open');
  assert.equal(audits('family.link.report', rep.family_id).length, 1);
  // Report on a link: unlinked at once, queued.
  assert.equal((await as(a)('/api/me/family/report', { method: 'POST', body: {} })).status, 200);
  assert.equal(F.linkOf(a.id), null);
  assert.ok(q.get('SELECT 1 FROM link_reports WHERE child_id=? AND family_id=?', a.id, fam.id));
  assert.ok(audits('family.unlink', fam.id).length >= 1);
  // Up to 4 children (pending requests count).
  const g4 = grownup();
  for (let i = 0; i < 4; i++) { const c = kid(); assert.equal((await as(g4)('/api/family/link', { method: 'POST', body: { code: await codeFor(c) } })).status, 200); }
  const fifth = await as(g4)('/api/family/link', { method: 'POST', body: { code: await codeFor(kid()) } });
  assert.equal(fifth.status, 409); assert.match(fifth.json.error, /up to 4/);
});

test('unlink by the child or the grown-up; relinking later works; school students can never be linked', async () => {
  const g = grownup(); const fam = F.familyOfOwner(g.id); const k = kid();
  await linkUp(g, k);
  assert.equal((await as(k)('/api/me/family/unlink', { method: 'POST', body: {} })).status, 200);
  assert.equal(F.linkOf(k.id), null);
  await linkUp(g, k);   // the old unlinked row of the same pair is reused
  assert.equal(F.linkOf(k.id).family_id, fam.id);
  // The grown-up's page names rows by a token, never the child's user id; the id itself does nothing.
  assert.equal((await as(g)(`/api/family/children/${k.id}/remove`, { method: 'POST', body: {} })).status, 404);
  const tok = F.requestToken(fam.id, k.id);
  assert.match((await as(g)('/family')).text, new RegExp(`/api/family/children/${tok}/remove`));
  assert.equal((await as(grownup())(`/api/family/children/${tok}/remove`, { method: 'POST', body: {} })).status, 404, "another family's token does nothing");
  assert.ok(F.linkOf(k.id));
  assert.equal((await as(g)(`/api/family/children/${tok}/remove`, { method: 'POST', body: {} })).status, 200);
  assert.equal(F.linkOf(k.id), null);
  assert.equal((await as(g)(`/api/family/children/${tok}/remove`, { method: 'POST', body: {} })).status, 404);
  assert.equal(F.isChildAccount(auth.getUser(student.id)), false);
  assert.equal(F.createCode(auth.getUser(student.id)).ok, false);
  assert.equal(F.isChildAccount(auth.getUser(teacher.id)), false);
});

test('wrong codes are limited: 10 per 15 minutes per grown-up', async () => {
  const g = grownup();
  for (let i = 0; i < 10; i++) assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code: 'ABC-2345' } })).status, 400);
  const r = await as(g)('/api/family/link', { method: 'POST', body: { code: 'ABC-2345' } });
  assert.equal(r.status, 429);
});

// ---------------------------------------------------------------- what the grown-up sees
test('/family: yesterday and this month up to yesterday, only family-charged messages; never today, school or school names', async () => {
  const g = grownup(); const fam = F.familyOfOwner(g.id);
  const k = kid('SchoolAndFamilyKid');
  S.addMember(boss, oak.id, k.id, 'student', { rosterName: 'Real Name Here' });   // an own account that is also in a school
  await linkUp(g, k);
  const t = Date.now();
  const turn = (day, chargedTo, weight = 1, refunded = 0) => q.run(`INSERT INTO builder_turns(id, game_id, user_id, status, created_at, charged_day, charged_to, weight, refunded)
    VALUES (?,?,?,'done',?,?,?,?,?)`, uid(), uid(), k.id, t, day, chargedTo, weight, refunded);
  const yday = today(t - DAY);
  turn(today(t), `family:${fam.id}`, 5);           // today: never shown
  turn(yday, `family:${fam.id}`, 2);
  turn(yday, `family:${fam.id}`, 1, 1);            // refunded: not counted
  turn(yday, `school:${oak.id}`, 7);                // school: never shown
  turn(yday, 'free', 3);
  const u = F.childUsage(fam.id, k.id, t);
  assert.equal(u.yesterday, 2);
  assert.equal(u.month, today(t).endsWith('-01') ? 0 : 2);
  const page = await as(g)('/family');
  assert.equal(page.status, 200);
  assert.match(page.text, /Family extra messages yesterday: 2/);
  for (const secret of ['Acorn Valley', 'Real Name Here', oak.slug, ': 5', ': 7', ': 10']) assert.ok(!page.text.includes(secret), `the family page leaks ${secret}`);
  assert.match(page.text, /Uses the free daily messages/, 'no family plan: free');
});

test('billing owner registry: a family is a plan owner while its grown-up exists and is not banned', () => {
  const g = grownup(); const fam = F.familyOfOwner(g.id);
  assert.equal(B.ownerKindExists('family', fam.id), true);
  assert.equal(B.ownerKindExists('family', 'no-such-family'), false);
  assert.equal(B.ownerPlan('family', fam.id).entitled, false);
  q.run('UPDATE users SET banned=1 WHERE id=?', g.id);
  assert.equal(B.ownerKindExists('family', fam.id), false);
});

// ---------------------------------------------------------------- the rest of the site
test('grown-ups are on no leaderboard, in no builder search, found by no friend code, have no profile, cannot chat or join a school', async () => {
  const g = grownup('VisibleParent'); const k = kid();
  const gid = publicGame(kid()).id;
  q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', uid(), gid, g.id, Date.now());
  const r = await as(g)(`/api/games/${gid}/score`, { method: 'POST', body: { score: 999999 } });
  assert.equal(r.status, 200, r.text);
  assert.equal(q.get('SELECT COUNT(*) n FROM scores WHERE user_id=?', g.id).n, 0, 'a grown-up score is never stored');
  q.run('INSERT INTO scores(id, game_id, user_id, score, created_at) VALUES (?,?,?,?,?)', uid(), gid, g.id, 5, Date.now());
  q.run('INSERT INTO scores(id, game_id, user_id, score, created_at) VALUES (?,?,?,?,?)', uid(), gid, k.id, 3, Date.now());
  const lb = games.leaderboard(gid, 50);
  assert.ok(lb.some(r2 => r2.id === k.id), 'the leaderboard works (a kid is on it)');
  assert.ok(!lb.some(r2 => r2.id === g.id), 'a grown-up is not');
  q.run("INSERT INTO games(id, slug, owner_id, title, status, visibility, created_at, updated_at) VALUES (?,?,?,?,'published','public',?,?)", uid(), `vp-${uid()}`, g.id, 'Parent game', Date.now(), Date.now());
  assert.ok(!games.searchBuilders(null, 'VisibleParent').length);
  assert.equal(friends.addByCode(k, 'ABCDEF').ok, false);
  assert.equal((await call(null, '/u/VisibleParent')).status, 404);
  assert.equal(chat.canChat(k, g).ok, false); assert.equal(chat.canChat(g, k).ok, false);
  assert.equal(S.addMember(boss, oak.id, g.id, 'teacher').ok, false);
  const staffAdd = await as(boss)(`/api/schools/${oak.id}/staff`, { method: 'POST', body: { rosterName: 'Parent', account: 'existing', username: 'VisibleParent' } });
  assert.equal(staffAdd.status, 400);
});

test('chat filter: the code shape is refused, ordinary words are not', () => {
  for (const s of ['K7Q-4MZ9', 'my code is k7q 4mz9', 'K7Q4MZ9', 'k7q_4mz9!', 'ＫＷＱ－４ＭＺ９',
    // any separators, spaced-out characters, a word stuck in front
    'K 4 P 5 7 6 U', 'K-4-P-5-7-6-U', 'K4P — 576U', 'K4P / 576U', 'K4P...576U', 'K7Q,4MZ9', 'K7Q+4MZ9', 'K7Q—4MZ9', 'k.7.q.4.m.z.9', 'codeK7Q4MZ9']) {
    assert.ok(F.looksLikeLinkCode(s), s);
    const r = chat.checkText(s); assert.equal(r.ok, false, s); assert.equal(r.code, 'contact');
  }
  assert.equal(F.looksLikeLinkCode('2 2 2 2 2 2 2'), false, 'plain numbers are not codes (the phone rule has them)');
  for (const s of ['hello there', 'good game!', 'play again?', 'level 25 is hard', 'see you at 3', 'wow 2fun', 'I got 9999 points', 'abcdefg', 'ABC-DEFG', 'lol 2222', 'GG EASY', 'brb', 'snake-game rocks', 'Panda482', 'THANKS2U', 'we have 2 cats', 'the best 3 games']) {
    assert.equal(F.looksLikeLinkCode(s), false, s);
    assert.equal(chat.checkText(s).ok, true, s);
  }
});

test('retention: old codes, expired requests, old unlinked rows and old resolved reports are deleted', () => {
  const t = Date.now(); const k = kid(); const g = grownup(); const fam = F.familyOfOwner(g.id);
  const code = (created, expires, used = null) => q.run('INSERT INTO family_link_codes(code_hash, child_id, created_at, expires_at, used_at) VALUES (?,?,?,?,?)', uid(20), k.id, created, expires, used);
  code(t - 40 * DAY, t - 40 * DAY + HOUR);            // ran out 40 days ago: goes
  code(t - 40 * DAY, t - 40 * DAY + HOUR, t - 40 * DAY);   // used 40 days ago: goes
  code(t - 10 * DAY, t - 10 * DAY + HOUR);            // ran out 10 days ago: stays
  const k2 = kid(), k3 = kid(), k4 = kid();
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at) VALUES (?,?,'pending',?)", fam.id, k2.id, t - 25 * HOUR);
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at, unlinked_at) VALUES (?,?,'linked',?,?,?)", fam.id, k3.id, t - 200 * DAY, t - 200 * DAY, t - 91 * DAY);
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at, unlinked_at) VALUES (?,?,'linked',?,?,?)", fam.id, k4.id, t - 200 * DAY, t - 200 * DAY, t - 10 * DAY);
  q.run("INSERT INTO link_reports(id, child_id, family_id, status, created_at, resolved_at) VALUES (?,?,?,'resolved',?,?)", uid(), k.id, fam.id, t - 400 * DAY, t - 366 * DAY);
  q.run("INSERT INTO link_reports(id, child_id, family_id, status, created_at) VALUES (?,?,?,'open',?)", uid(), k.id, fam.id, t - 400 * DAY);
  const before = q.get('SELECT COUNT(*) n FROM family_link_codes WHERE child_id=?', k.id).n;
  const r = F.retention(t);
  assert.ok(r.codes >= 2 && r.pending >= 1 && r.unlinked >= 1 && r.reports >= 1, JSON.stringify(r));
  assert.equal(q.get('SELECT COUNT(*) n FROM family_link_codes WHERE child_id=?', k.id).n, before - 2);
  assert.equal(q.get('SELECT COUNT(*) n FROM family_children WHERE child_id IN (?,?)', k2.id, k3.id).n, 0);
  assert.ok(q.get('SELECT 1 FROM family_children WHERE child_id=?', k4.id), 'unlinked 10 days ago: kept');
  assert.equal(q.get("SELECT COUNT(*) n FROM link_reports WHERE child_id=? AND status='open'", k.id).n, 1, 'open reports are kept');
  assert.ok(job('family-retention'), 'runs as a daily job');
});

test('a ban ends family links in the same step (as a child, or every link of a banned grown-up)', async () => {
  const g = grownup(); const fam = F.familyOfOwner(g.id); const a = kid(); const b = kid();
  await linkUp(g, a); await linkUp(g, b);
  mod.banUser(boss, a.id, 'test');
  assert.equal(F.linkOf(a.id), null); assert.ok(F.linkOf(b.id));
  mod.banUser(boss, g.id, 'test');
  assert.equal(F.linkOf(b.id), null, 'banning the grown-up ends every link of the family');
  assert.ok(audits('family.unlink', fam.id).length >= 2);
});

test('admin: link reports queue, resolve, ban the grown-up, break a link; 404 for everyone else', async () => {
  const g = grownup('ReportedParent'); const k = kid('ReportingKid');
  await as(g)('/api/family/link', { method: 'POST', body: { code: await codeFor(k) } });
  await as(k)('/api/me/family/answer', { method: 'POST', body: { answer: 'report' } });
  const rep = q.get("SELECT * FROM link_reports WHERE child_id=? AND status='open'", k.id);
  const adm = as(boss);
  const tab = await adm('/admin?tab=links');
  assert.equal(tab.status, 200); assert.match(tab.text, /ReportedParent/); assert.match(tab.text, /ReportingKid/);
  assert.equal((await as(k)(`/api/admin/link-reports/${rep.id}/resolve`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await as(g)(`/api/admin/link-reports/${rep.id}/resolve`, { method: 'POST', body: {} })).status, 404);
  assert.equal((await adm(`/api/admin/link-reports/${rep.id}/ban`, { method: 'POST', body: {} })).status, 200);
  assert.equal(auth.getUser(g.id).banned, 1);
  assert.equal(q.get('SELECT status FROM link_reports WHERE id=?', rep.id).status, 'resolved');
  // Break a link from the user lookup.
  const g2 = grownup('LinkedParent'); const k2 = kid('LinkedKid');
  await linkUp(g2, k2);
  const look = await adm('/admin?tab=users&username=LinkedKid');
  assert.match(look.text, /linked with grown-up/); assert.match(look.text, /LinkedParent/);
  const fid = F.familyOfOwner(g2.id).id;
  assert.equal((await adm(`/api/admin/family/${fid}/children/${k2.id}/unlink`, { method: 'POST', body: {} })).status, 200);
  assert.equal(F.linkOf(k2.id), null);
  assert.equal(audits('admin.family.unlink', fid).length, 1);
});

test('kid pages carry no link to /grown-ups or /family, no price and no plan words', async () => {
  const k = kid(); const st = auth.getUser(student.id); const guest = auth.createGuest();
  for (const [who, go] of [['kid', as(k)], ['student', as(st)], ['guest', as(guest)], ['signed out', p => call(null, p)]]) {
    for (const p of ['/', '/me', '/build', '/search', '/friends', '/classes']) {
      const r = await go(p);
      if (r.status !== 200) continue;
      assert.doesNotMatch(r.text, /href="\/(grown-ups|family)/, `${who} ${p}`);
      assert.doesNotMatch(r.text, /\$\d|family plan|Family plan|per month|a month/, `${who} ${p}`);
    }
  }
});

test('a code can\'t be published elsewhere either: names, game text, score labels and game files', async () => {
  for (const name of ['K4P576U', 'K4P_576U', 'k4p-576u']) assert.equal(TF.cleanName(name).ok, false, name);
  for (const name of ['Panda482', 'SuperKat25', 'Tiger734']) assert.equal(TF.cleanName(name).ok, true, name);
  const k = kid();
  const r = await as(k)('/api/me', { method: 'POST', body: { displayName: 'K4P576U' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'displayName');
  for (const text of ['Win! Type K4P 576U', 'code: K-4-P-5-7-6-U']) assert.equal(TF.cleanText(text).ok, false, text);
  assert.equal(TF.cleanText('Level 2: the best 3 games').ok, true);
  // Score labels: shown on the public leaderboard, so a code (or personal details) is dropped, the score stays.
  assert.equal(games.cleanScoreLabel('K4P-576U'), '');
  assert.equal(games.cleanScoreLabel('call 555 123 4567'), '');
  assert.equal(games.cleanScoreLabel('3 stars'), '3 stars');
  const gm = publicGame(kid());
  q.run('INSERT INTO plays(id, game_id, user_id, started_at) VALUES (?,?,?,?)', uid(), gm.id, k.id, Date.now());
  const sc = await as(k)(`/api/games/${gm.id}/score`, { method: 'POST', body: { score: 10, label: 'K4P-576U' } });
  assert.equal(sc.status, 200, sc.text);
  assert.equal(q.get('SELECT label FROM scores WHERE game_id=? AND user_id=?', gm.id, k.id).label, '');
  const lb = await call(null, `/api/games/${gm.id}/leaderboard`);
  assert.ok(!lb.text.includes('K4P'), 'no code on the public leaderboard');
  // The scanner fails a game that asks for a grown-up's code or shows a code.
  const scan = body => scanVersion(`<!doctype html><html><body>${body}</body></html>`).issues.map(i => i.code);
  assert.ok(scan('<p>Type your grown-up code to win a prize!</p>').includes('link_code'));
  assert.ok(scan('<script>const msg = "Ask your parent for their family code";</script>').includes('link_code'));
  assert.ok(scan('<p>Secret: K4P 576U</p>').includes('link_code'));
  assert.ok(!scan('<p>Find the secret code to open the door. Level 2!</p>').includes('link_code'));
});

test('grown-up pages only show what a grown-up can use: no Studio button, profile links, Like or Rate', async () => {
  const g = grownup(); const owner = kid();
  const gm = publicGame(owner);
  const go = as(g);
  const home = await go('/');
  assert.doesNotMatch(home.text, /href="\/build"/, 'no Open my Studio button');
  assert.match(home.text, /href="\/family#language"/, 'the footer language link goes to their own page');
  const gp = await go(`/g/${gm.slug}`);
  assert.equal(gp.status, 200);
  assert.doesNotMatch(gp.text, /href="\/u\//); assert.doesNotMatch(gp.text, /id="likebtn"/); assert.doesNotMatch(gp.text, /id="rate"/);
  const pp = await go(`/play/${gm.slug}`);
  assert.equal(pp.status, 200); assert.doesNotMatch(pp.text, /id="p-like"|id="p-rate"/);
  const fam = await go('/family');
  assert.match(fam.text, /id="language"/, 'a language choice on the family page');
  // Kids still get them all.
  const kp = await as(kid())(`/g/${gm.slug}`);
  assert.match(kp.text, /href="\/u\//); assert.match(kp.text, /id="likebtn"/); assert.match(kp.text, /id="rate"/);
  assert.match((await as(kid())('/')).text, /href="\/me#language"/);
});

test('the child\'s panel: a safety line next to the code; an English fallback is marked as English', async () => {
  const k = kid();
  await codeFor(k);
  const me = await as(k)('/me');
  assert.match(me.text, /Only give this code to your parent or guardian, face to face/);
  assert.match(me.text, /id="famcode-open"/, 'the "Lost it?" line can be hidden by me.js once a new code shows');
  // In every language the site offers, each kid-facing panel string is either translated or marked lang="en" dir="ltr".
  const g = grownup();
  await as(g)('/api/family/link', { method: 'POST', body: { code: await codeFor(k) } });
  for (const { code } of i18n.availableLocales()) {
    const t = i18n.tFor(code);
    const page = await as(k)(`/me?lang=${code}`);
    const r = page.location ? await call(cookieFor(k.id), page.location) : page;
    for (const key of ['me.family.heading', 'me.family.pendingCheck', 'me.family.yes', 'me.family.report']) {
      const s = t(key);
      if (t.own(key)) assert.ok(r.text.includes(s.replace(/'/g, '&#39;')) || r.text.includes(s), `${code} ${key}`);
      else assert.ok(r.text.includes(`<span lang="en" dir="ltr">${s.replace(/'/g, '&#39;')}</span>`) || r.text.includes(`<span lang="en" dir="ltr">${s}</span>`), `${code} ${key}: English, marked as English`);
    }
  }
});

test('before BILLING_PUBLIC: family pages only for a browser with the preview cookie; ?bpreview sets it, a wrong token never does', async () => {
  const keep = { pub: config.billingPublic, tok: config.billingPreviewToken };
  try {
    config.billingPublic = false; config.billingPreviewToken = 'p'.repeat(32);
    const child = kid();
    assert.equal((await call('', '/grown-ups')).status, 404);
    assert.doesNotMatch((await call('', '/parents')).text, /href="\/grown-ups"/);
    assert.doesNotMatch((await as(child)('/me')).text, /famcode|me-family/);
    assert.equal((await as(child)('/api/me/family/code', { method: 'POST', body: {} })).status, 404);
    // A wrong token: no cookie, just the clean address back.
    const bad = await call('', '/grown-ups?bpreview=nope&x=1');
    assert.equal(bad.status, 302); assert.equal(bad.location, '/grown-ups?x=1');
    // The right token sets an HttpOnly cookie and drops the token from the URL.
    const r = await fetch(`${base}/parents?bpreview=${'p'.repeat(32)}`, { redirect: 'manual' });
    assert.equal(r.status, 302); assert.equal(r.headers.get('location'), '/parents');
    const c = r.headers.getSetCookie().find(x => x.startsWith(`${F.PREVIEW_COOKIE}=`));
    assert.match(c, /HttpOnly/); const pc = c.split(';')[0];
    assert.equal((await call(pc, '/grown-ups')).status, 200);
    assert.match((await call(pc, '/parents')).text, /href="\/grown-ups"/);
    assert.equal((await call(`${cookieFor(child.id)}; ${pc}`, '/api/me/family/code', { method: 'POST', body: {} })).status, 200);
    // A cookie with another value counts for nothing; no token configured means no preview at all.
    assert.equal((await call(`${F.PREVIEW_COOKIE}=${'q'.repeat(32)}`, '/grown-ups')).status, 404);
    config.billingPreviewToken = '';
    assert.equal((await call(pc, '/grown-ups')).status, 404);
    // Open to everyone.
    config.billingPublic = true;
    assert.equal((await call('', '/grown-ups')).status, 200);
  } finally { config.billingPublic = keep.pub; config.billingPreviewToken = keep.tok; }
});
