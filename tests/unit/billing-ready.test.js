// "Ready to go live?" on /admin/billing (server/services/billing-ready.js, docs/billing-go-live.md): each check is green
// or red with what to do, read by setting NAME only (no key, secret or id ever reaches the page), against the fake
// Stripe through the real SDK, with webhooks signed and checked for real. Every key and secret here is a short fake.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_ready';
const fake = await startFakeStripe({ webhookSecret: SECRET });   // any key: the tests switch between a test and a live one
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const B = await import('../../server/services/billing.js');
const S = await import('../../server/services/stripe.js');
const { readiness } = await import('../../server/services/billing-ready.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');
const SC = await import('../../server/services/schools.js');

let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const LIVE_KEY = 'rk_live_fakeready', TEST_KEY = 'rk_test_fake';
const defaults = { stripeApiKey: TEST_KEY, stripeWebhookSecret: SECRET, stripeWebhookSecretOld: '', stripeApiBase: fake.url, stripeLiveOk: false, stripeTax: false, stripePmcFamily: '', stripePmcSchool: '',
  termsPublished: false, billingPublic: false, contactEmail: '', publicUrl: '', anthropicKey: '', proTurnWeight: 1, builderFullForAll: false };
test.beforeEach(() => { Object.assign(config, defaults); S._reset(); q.run('DELETE FROM billing_events'); });

function signIn(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return { cookie: c }; }
async function get(who, path) {
  const r = await fetch(base + path, { headers: who ? { cookie: who.cookie } : {}, redirect: 'manual' });
  return { status: r.status, text: await r.text() };
}
const admin = () => signIn(auth.createUser({ username: `Rdy${uid(4)}`, password: 'admin-password-1', role: 'admin' }));
const byId = r => Object.fromEntries(r.rows.map(x => [x.id, x]));
const liveEvent = (type = 'customer.created') => fake.deliver(fake.event(type, { id: `cus_${uid(6)}`, object: 'customer' }, { livemode: true }));

test('today\'s state (test key, nothing else set): the live-only checks are red, each with what to do', async () => {
  const r = await readiness(); const c = byId(r);
  for (const id of ['key', 'liveok', 'webhook', 'prices', 'pmcFamily', 'tax', 'terms', 'contact', 'publicUrl', 'ai', 'proWeight', 'public']) {
    assert.equal(c[id].ok, false, id); assert.ok(c[id].fix.length > 20, `${id} says what to do`);
  }
  assert.equal(c.secret.ok, true); assert.equal(c.pmcSchool.ok, true, 'optional');
  assert.equal(c.i18n.ok, true, 'every paid-plan word is translated');
  assert.match(c.key.now, /test restricted key/);
  assert.match(c.prices.now, /all 9 found \(with the test key\)/);
  assert.equal(c.teacherPrice.ok, false, 'live only'); assert.match(c.teacherPrice.now, /found \(with the test key\)/); assert.match(c.teacherPrice.fix, /oomba_teacher_yearly/); assert.match(c.teacherPrice.fix, /reminder email 7 days before a free trial ends/); assert.match(c.prices.fix, /live mode/);
  assert.equal(c.webhook.now, 'none yet');
  assert.equal(r.ready, r.rows.filter(x => x.ok).length); assert.equal(r.total, r.rows.length); assert.equal(r.live, false);
});

test('billing off: says so, and nothing is read from Stripe', async () => {
  Object.assign(config, { stripeApiKey: '', stripeWebhookSecret: '' });
  const before = fake.requests.length;
  const c = byId(await readiness({ refresh: true }));
  assert.equal(c.key.now, 'not set'); assert.equal(c.secret.ok, false); assert.equal(c.prices.now, 'not checked: billing is off');
  assert.equal(fake.requests.length, before, 'no Stripe call while billing is off');
});

test('switch day: a live key, every setting and a signed live event turn every row green', async () => {
  Object.assign(config, { stripeApiKey: LIVE_KEY, stripeLiveOk: true, stripePmcFamily: 'pmc_fakefamily', stripeTax: true, termsPublished: true,
    contactEmail: 'help@example.com', publicUrl: 'https://oomba.example', anthropicKey: 'fake-ai-key', billingPublic: true, proTurnWeight: 2 });
  let c = byId(await readiness({ refresh: true }));
  assert.equal(c.webhook.ok, false, 'no live event yet');
  assert.equal(c.tax.ok, false, 'Stripe Tax with no registration collects nothing');
  fake.st.tax.registrations.push({ id: 'taxreg_fake', object: 'tax.registration', status: 'active', country: 'US' });
  assert.equal((await liveEvent()).status, 200);
  const r = await readiness({ refresh: true }); c = byId(r);
  assert.deepEqual(r.rows.filter(x => !x.ok).map(x => x.id), [], JSON.stringify(r.rows.filter(x => !x.ok)));
  assert.equal(r.ready, r.total); assert.equal(r.live, true);
  assert.match(c.webhook.now, /today \(customer\.created: ignored\)/);
  assert.match(c.key.now, /live restricted key/); assert.match(c.tax.now, /1 registration/);
});

test('a live event while the key is still a test key is red and says to put in the live key', async () => {
  assert.equal((await liveEvent()).status, 200);
  const c = byId(await readiness());
  assert.equal(c.webhook.ok, false); assert.match(c.webhook.now, /mode_mismatch/); assert.match(c.webhook.fix, /live key/);
  const t = await fake.deliver(fake.event('customer.updated', { id: `cus_${uid(6)}`, object: 'customer' }, { livemode: false }));   // a test-mode event never counts as live
  assert.equal(t.status, 200);
  assert.equal(byId(await readiness()).webhook.ok, false);
});

test('a missing live price is named by its lookup key; a Stripe error is shown by code, not message', async () => {
  Object.assign(config, { stripeApiKey: LIVE_KEY, stripeLiveOk: true });
  const saved = fake.st.prices.get('oomba_spark_150'); fake.st.prices.delete('oomba_spark_150');
  try {
    const c = byId(await readiness({ refresh: true }));
    assert.equal(c.prices.ok, false); assert.equal(c.prices.now, 'missing: oomba_spark_150'); assert.match(c.prices.fix, /lookup key/);
  } finally { fake.st.prices.set('oomba_spark_150', saved); }
  fake.failNextGet(1, 500);
  const e = byId(await readiness({ refresh: true }));
  assert.equal(e.prices.ok, false); assert.match(e.prices.now, /^not checked: Stripe answered /);
});

test('a paid-plan word missing in one language turns the translations row red and names the language', async () => {
  await withoutKeys('de', ['info.refunds.sparks.li3', 'family.sparks.pick'], async () => {
    const c = byId(await readiness());
    assert.equal(c.i18n.ok, false); assert.equal(c.i18n.now, 'de lacks 2');
  });
  assert.equal(byId(await readiness()).i18n.ok, true);
});

test('/admin/billing shows the panel to the admin only, by setting name, never a key, secret or id', async () => {
  Object.assign(config, { stripeApiKey: LIVE_KEY, stripeLiveOk: true, stripePmcFamily: 'pmc_fakesecretid', stripePmcSchool: 'pmc_fakeschoolid', contactEmail: 'help@example.com', publicUrl: 'https://oomba.example', stripeWebhookSecretOld: 'whsec_fake_old_one' });
  const r = await get(admin(), '/admin/billing');
  assert.equal(r.status, 200);
  assert.match(r.text, /<section class="panel" id="ready"><h2>🚦 Ready to go live\?<\/h2>/);
  assert.match(r.text, /href="#ready">Go-live checks/);
  assert.match(r.text, /<li class="ready-row is-bad" data-check="webhook">/);
  assert.match(r.text, /<li class="ready-row is-ok" data-check="key">/);
  assert.match(r.text, /href="\/admin\/billing\?recheck=1#ready">Check again/);
  assert.match(r.text, /docs\/billing-go-live\.md/);
  for (const s of [LIVE_KEY, SECRET, 'whsec_fake_old_one', 'pmc_fakesecretid', 'pmc_fakeschoolid', 'fakeready']) assert.ok(!r.text.includes(s), `the page never shows ${s}`);
  assert.match(r.text, /\d+ of \d+<\/b>&nbsp;ready/);
  // Check again reads the prices from Stripe again.
  const n = fake.requests.filter(x => x.path === '/v1/prices').length;
  assert.equal((await get(admin(), '/admin/billing?recheck=1')).status, 200);
  assert.ok(fake.requests.filter(x => x.path === '/v1/prices').length > n);
  // Nobody else gets the page: not a kid, a grown-up, a guest, a school admin, a teacher or a student.
  const boss = auth.createUser({ username: `RdyBoss${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  const school = SC.createSchool(boss, { name: `Rdy School ${uid(4)}` }).school;
  const schoolAdmin = SC.createSchoolAccount(boss, school.id, { rosterName: 'Rdy Head', role: 'admin' }).user;
  const teacher = SC.createSchoolAccount(boss, school.id, { rosterName: 'Ms Rdy', role: 'teacher' }).user;
  const student = SC.createSchoolAccount(teacher, school.id, { rosterName: 'Stu Rdy' }).user;
  const others = [auth.createUser({ username: `RdyKid${uid(4)}`, password: 'rainbow-77' }), auth.createUser({ username: `RdyPar${uid(4)}`, password: 'grownup-password-1', accountType: 'grownup' }),
    auth.createGuest(), schoolAdmin, teacher, student];
  for (const who of [null, ...others.map(signIn)]) {
    for (const path of ['/admin/billing', '/admin/billing?recheck=1']) {
      const o = await get(who, path);
      assert.equal(o.status, 404, `${path} is not found for anyone but the platform admin`);
      assert.doesNotMatch(o.text, /Ready to go live|STRIPE_|rk_live|whsec_|pmc_/);
    }
  }
});

test('BUILDER_FULL_FOR_ALL on (the default): PRO_TURN_WEIGHT changes nothing, so the row says so and is green', async () => {
  config.builderFullForAll = true;
  const c = byId(await readiness());
  assert.equal(c.proWeight.ok, true); assert.match(c.proWeight.label, /BUILDER_FULL_FOR_ALL is on/); assert.match(c.proWeight.now, /no effect/);
});

test('every row green folds the list away behind "Show the checks"', async () => {
  Object.assign(config, { stripeApiKey: LIVE_KEY, stripeLiveOk: true, stripePmcFamily: 'pmc_fakefamily', termsPublished: true,
    contactEmail: 'help@example.com', publicUrl: 'https://oomba.example', anthropicKey: 'fake-ai-key', billingPublic: true, stripeTax: false, proTurnWeight: 2 });
  await liveEvent();
  let t = (await get(admin(), '/admin/billing')).text;
  assert.doesNotMatch(t, /Show the checks/, 'one red row (tax): the list shows');
  config.stripeTax = true; fake.st.tax.registrations.length || fake.st.tax.registrations.push({ id: 'taxreg_fake2', object: 'tax.registration', status: 'active', country: 'US' });
  t = (await get(admin(), '/admin/billing?recheck=1')).text;
  assert.match(t, /Every check is green\./); assert.match(t, /<summary>Show the checks<\/summary>/);
});
