// The trial emails wired to the Teacher plan (services/teacher-plan.js's sync hook → services/nudges.js), end to end
// against the fake Stripe: a trial started through /trial starts the sequence at the checkout's work email; a card
// added during the trial (seen at trial_will_end) stops it with the thank-you; a trial that ends without a card gets
// "Your trial has ended"; one that turns active gets the thank-you. Resend is the fake in services/email.js's hook.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_trialmail';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const B = await import('../../server/services/billing.js');
const SC = await import('../../server/services/schools.js');
const TP = await import('../../server/services/teacher-plan.js');
const E = await import('../../server/services/email.js');
const N = await import('../../server/services/nudges.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const DAY = 86400e3, PW = 'teacher-pass-long-1';
let server, base, n = 0;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`; fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); E._hooks({ fetch: null, wait: null }); });
const sent = [];
E._hooks({ fetch: (url, init) => { sent.push(JSON.parse(init.body)); return Promise.resolve({ status: 200, json: async () => ({ id: `re_${sent.length}` }) }); }, wait: () => Promise.resolve() });
N._opts.kick = false;
test.beforeEach(() => {
  Object.assign(config, { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, termsPublished: false, billingPublic: true, teacherTrialDays: 14,
    resendApiKey: 're_test_key', emailEnabled: true, emailPostalAddress: '123 Main St, Springfield', publicUrl: 'https://oomba.example' });
  resetLimits(); sent.length = 0;
});
const boss = auth.createUser({ username: `MBoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
function signIn(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; }
async function trialTeacher() {
  const s = SC.createSchool(boss, { name: `MSch ${++n} ${uid(4)}` }).school;
  const t = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms Rivera', role: 'teacher' }).user;
  auth.setPassword(t.id, PW); q.run('UPDATE users SET billing_tester=1 WHERE id=?', t.id);
  const email = `rivera${n}@school.example`;
  const r = await fetch(`${base}/api/trial/start`, { method: 'POST', headers: { cookie: signIn(auth.getUser(t.id)), 'content-type': 'application/json' }, body: JSON.stringify({ email, trial: '1' }), redirect: 'manual' });
  const body = await r.text();
  assert.equal(r.status, 200, body);
  // "Start my free trial" starts it through Stripe's API (no Checkout page) and syncs it at once.
  assert.equal(JSON.parse(body).redirect, '/teach?plan=welcome#teacher-plan');
  const sub = TP.teacherPlan(t.id).subscription;
  return { teacher: auth.getUser(t.id), email, subId: sub.stripe_subscription_id };
}
const templates = id => q.all("SELECT template FROM email_log WHERE user_id=? AND status='sent' ORDER BY created_at, rowid", id).map(r => r.template);

test('a trial through /trial starts the sequence at the checkout email; a card added during the trial stops it with the thank-you', async () => {
  const x = await trialTeacher();
  const tr = q.get('SELECT * FROM trial_emails WHERE user_id=?', x.teacher.id);
  assert.ok(tr, 'the sequence started'); assert.equal(tr.state, 'trialing');
  assert.ok(Math.abs(tr.trial_end - (Date.now() + 14 * DAY)) < 60e3);
  assert.deepEqual(E.addressOf(x.teacher.id), { email: x.email, source: 'checkout' });
  await N.runDue(Date.now() + 1000);
  assert.deepEqual(templates(x.teacher.id), ['trial_welcome']);
  assert.deepEqual(sent.at(-1).to, [x.email]);
  assert.match(sent.at(-1).text, /^Hi Ms Rivera,/); assert.match(sent.at(-1).text, /Your 14-day free trial is on/);
  // The teacher adds a card in the Portal; Stripe's trial_will_end (3 days before) syncs it: the sequence stops.
  const cus = fake.st.customers.get(fake.st.subscriptions.get(x.subId).customer);
  cus.invoice_settings = { ...cus.invoice_settings, default_payment_method: 'pm_card_visa' };
  assert.equal((await fake.emit('customer.subscription.trial_will_end', x.subId)).status, 200);
  assert.equal(q.get('SELECT state FROM trial_emails WHERE user_id=?', x.teacher.id).state, 'converted');
  assert.equal(q.get("SELECT status FROM trial_nudges WHERE user_id=? AND step='ending'", x.teacher.id).status, 'canceled');
  await N.runDue(Date.now() + 2000);
  // The trial then turns active: no second thank-you.
  assert.equal((await fake.endTrial(x.subId, { card: true })).status, 200);
  await N.runDue(Date.now() + 3000);
  assert.deepEqual(templates(x.teacher.id), ['trial_welcome', 'trial_thanks']);
});

test('a trial that ends without a card gets "Your trial has ended"; one that turns active gets the thank-you', async () => {
  const y = await trialTeacher();
  await N.runDue(Date.now() + 1000);
  assert.equal((await fake.endTrial(y.subId, { card: false })).status, 200);
  await N.runDue(Date.now() + 2000);
  assert.deepEqual(templates(y.teacher.id), ['trial_welcome', 'trial_ended']);
  assert.match(sent.at(-1).html, /utm_content=ended/); assert.match(sent.at(-1).html, /\/trial\?utm_source=oomba/);
  const z = await trialTeacher();
  assert.equal((await fake.endTrial(z.subId, { card: true })).status, 200);
  await N.runDue(Date.now() + 1000);
  assert.deepEqual(templates(z.teacher.id), ['trial_thanks'], 'converted before the welcome went: only the thank-you');
});
