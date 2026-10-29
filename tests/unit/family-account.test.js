// Navigation weeks 3–4: the grown-up's two pages. /family is their home (checklist, children, plan, help); the new
// /family/account holds Language, Password, Sign out and Sign out everywhere. The fence (kids, guests and staff get a 404,
// the signed-out the grown-up sign-in), the page while families are off, the fence's allow-list, and the old anchors.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_acct', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_acct';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const SC = await import('../../server/services/schools.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function get(u, path) {
  const r = await fetch(base + path, { headers: u ? { cookie: cookieFor(u.id) } : {}, redirect: 'manual' });
  return { status: r.status, text: await r.text(), location: r.headers.get('location') };
}
let n = 0;
const grownup = () => { const u = auth.createUser({ username: `AcctMum${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u); return auth.getUser(u.id); };
// (Both pages also have the small "Signed in as … Not you? Sign out" line under the heading.)
const PANELS = ['id="language"', 'id="password"', 'id="signout"', 'data-api="/api/me/password"', 'data-api="/api/auth/logout-everywhere"'];

test('/family/account has Language, Password, Sign out and Sign out everywhere; /family has none of them', async () => {
  const g = grownup();
  const acct = await get(g, '/family/account');
  assert.equal(acct.status, 200);
  for (const p of PANELS) assert.ok(acct.text.includes(p), `account page: ${p}`);
  assert.match(acct.text, /<h1>⚙️ Your account<\/h1>/);
  assert.match(acct.text, /<form class="row" action="\/family\/account" method="get" id="langform">/, 'the language form comes back to this page');
  assert.match(acct.text, /<a class="backlink" href="\/family">/);
  assert.match(acct.text, /noindex/);
  const fam = await get(g, '/family');
  assert.equal(fam.status, 200);
  for (const p of PANELS) assert.ok(!fam.text.includes(p), `family page: no ${p}`);
  assert.match(fam.text, /id="famcheck"/, 'the checklist stays');
  assert.match(fam.text, /<script type="module" src="\/js\/family\.js/, 'family.js sends the old anchors on');
});

test('the fence: kids, students, teachers, school admins and the platform admin get a 404; signed out (or a guest) -> the grown-up sign-in', async () => {
  const boss = auth.createUser({ username: 'AcctBoss', password: 'boss-password-1', role: 'admin' });
  const s = SC.createSchool(boss, { name: 'Acct School' }).school;
  const head = SC.createSchoolAccount(boss, s.id, { rosterName: 'Head', role: 'admin' }).user;
  const teach = SC.createSchoolAccount(head, s.id, { rosterName: 'Teach', role: 'teacher' }).user;
  const pupil = SC.createSchoolAccount(head, s.id, { rosterName: 'Pupil' }).user;
  const kid = auth.createUser({ username: 'AcctKid', password: 'rainbow-77' });
  for (const u of [kid, pupil, teach, head, boss]) assert.equal((await get(u, '/family/account')).status, 404, u.username);
  // Like /family: a guest counts as signed out (one tap on Play makes a guest), so both go to the grown-up sign-in.
  for (const u of [null, auth.createGuest()]) {
    const out = await get(u, '/family/account');
    assert.equal(out.status, 302);
    assert.equal(out.location, '/grown-ups/login?next=%2Ffamily%2Faccount');
  }
  assert.equal(grownupMay('GET', '/family/account'), true, 'GROWNUP_GET has it');
  assert.equal(grownupMay('GET', '/family/accounts'), false);
  assert.equal(grownupMay('POST', '/family/account'), false);
});

test('families off: /family/account stays (Language, Password, Sign out); /family is the small "off" page linking to it', async () => {
  const g = grownup();
  config.stripeApiKey = '';
  const acct = await get(g, '/family/account');
  assert.equal(acct.status, 200);
  for (const p of PANELS) assert.ok(acct.text.includes(p), `account page while off: ${p}`);
  const fam = await get(g, '/family');
  assert.equal(fam.status, 200);
  assert.match(fam.text, /Family accounts are switched off right now/);
  assert.match(fam.text, /<a class="btn" href="\/family\/account">⚙️ Account<\/a>/);
  for (const p of PANELS) assert.ok(!fam.text.includes(p), `off page: no copy of ${p}`);
  assert.match(fam.text, /\/js\/family\.js/);
  // Still a 404 for everyone else, and the other family pages stay off.
  assert.equal((await get(auth.createUser({ username: 'AcctKid2', password: 'rainbow-77' }), '/family/account')).status, 404);
  assert.equal((await get(g, '/family/link')).status, 404);
});

test('old anchors: family.js sends /family#password, #language and #signout on to /family/account', () => {
  const js = fs.readFileSync(new URL('../../public/js/family.js', import.meta.url), 'utf8');
  assert.match(js, /location\.pathname === '\/family' && \/\^#\(password\|language\|signout\)\$\/\.test\(location\.hash\)\) location\.replace\(`\/family\/account\$\{location\.hash\}`\)/);
});
