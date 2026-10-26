// Paid plans, chunk 2: the Stripe plumbing (docs/decisions.md "Paid plans"). The real stripe SDK talks to a fake Stripe
// (tests/support/fake-stripe.js); webhooks are signed the way Stripe signs them and checked by constructEvent. Covers
// the webhook (signature, replays, failed reads, order, owners, modes), the shared sync path, grace and who is entitled.
// Every key and secret here is a short fake value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe, FAKE_API_VERSION } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_now';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
const { config, STRIPE_API_VERSION } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const B = await import('../../server/services/billing.js');
const S = await import('../../server/services/stripe.js');

const DAY = 86400e3;
const families = new Set();
B.registerOwnerKind('family', id => families.has(id));   // grown-up families arrive in chunk 3
let n = 0;
const family = () => { const id = `fam${++n}`; families.add(id); return id; };
const school = () => { const id = `sch${++n}`; q.run('INSERT INTO schools(id, name, slug, created_at) VALUES (?,?,?,?)', id, `School ${id}`, `school-${id}`, Date.now()); return id; };
/** A family whose Stripe Customer we know (as Checkout will record it), with a subscription at the fake. */
function familySub(opts = {}) {
  const fam = family(); const cus = fake.customer().id;
  B.linkCustomer(cus, 'family', fam);
  return { fam, cus, sub: fake.subscription({ customer: cus, ...opts }) };
}
const row = id => q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', id);
const evRow = id => q.get('SELECT * FROM billing_events WHERE event_id=?', id);
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND target=?', action, target);
const deliver = (type, id, opts) => { const ev = fake.event(type, id, opts); return fake.deliver(ev, opts).then(r => ({ ...r, ev })); };
/** The JSON log lines written while fn runs. */
async function logsOf(fn) {
  const lines = []; const silent = process.env.BRB_SILENT; process.env.BRB_SILENT = '0';
  const ow = process.stdout.write; const ew = process.stderr.write;
  const grab = orig => function (chunk, ...rest) { const s = String(chunk); if (s.startsWith('{"t":')) { lines.push(s); return true; } return orig.call(this, chunk, ...rest); };
  process.stdout.write = grab(ow); process.stderr.write = grab(ew);
  try { await fn(); } finally { process.stdout.write = ow; process.stderr.write = ew; process.env.BRB_SILENT = silent; }
  return lines.join('');
}

let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => {
  Object.assign(config, { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeWebhookSecretOld: '', stripeApiBase: fake.url, stripeApiVersion: STRIPE_API_VERSION, stripeTax: false, maintenance: false, movedTo: '' });
  fake.failGets.length = 0; fake.slowGets.length = 0;
});

test('the pinned API version is the SDK default and every call sends it; never payment_method_types', async () => {
  assert.equal(STRIPE_API_VERSION, '2026-09-30.endive');
  assert.equal(FAKE_API_VERSION, STRIPE_API_VERSION);
  const { sub } = familySub();
  await B.syncSubscription(sub.id);
  assert.ok(fake.requests.length > 0);
  for (const r of fake.requests) { assert.equal(r.version, STRIPE_API_VERSION); assert.equal(r.auth, true); }
  assert.deepEqual(fake.violations, []);
  const pkg = JSON.parse((await import('node:fs')).readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));
  assert.match(pkg.dependencies.stripe, /^\d+\.\d+\.\d+$/, 'the stripe SDK is pinned to an exact version');
  // The fake refuses payment_method_types like the rule says (BP-4), even from the SDK.
  const c = await S.stripe();
  await assert.rejects(c.customers.create({ payment_method_types: ['card'] }));
  assert.equal(fake.violations.length, 1); fake.violations.length = 0;
});

test('billing off: the webhook route steps aside, nothing is entitled, the reconcile job does nothing', async () => {
  const { fam, sub } = familySub();
  await B.syncSubscription(sub.id);
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  config.stripeApiKey = '';
  try {
    assert.equal(S.billingMode(), 'off');
    const ev = fake.event('customer.subscription.updated', sub.id);
    const r = await fake.deliver(ev);
    const other = await fetch(base + '/api/billing/nothing-here', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, other.status, 'the same answer as any unknown address');
    assert.equal(evRow(ev.id), undefined);
    assert.equal(B.ownerPlan('family', fam).entitled, false, 'billing off: nobody is entitled');
    assert.deepEqual(await B.reconcile(), { skipped: true });
    await assert.rejects(S.stripe(), /billing is off/);
    assert.equal(await S.verifyWebhook(Buffer.from('{}'), 't=1,v1=00'), null);
  } finally { config.stripeApiKey = 'rk_test_fake'; }
  // A key without a webhook secret is off too.
  config.stripeWebhookSecret = '';
  assert.equal(S.billingMode(), 'off');
});

test('signature: missing, wrong secret, tampered body, too old and not JSON are refused with 400 and leave nothing', async () => {
  const { sub } = familySub();
  const ev = fake.event('customer.subscription.updated', sub.id);
  const body = JSON.stringify(ev);
  const post = (headers, b = body) => fetch(base + B.WEBHOOK_PATH, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: b });
  const logs = await logsOf(async () => {
    assert.equal((await post({})).status, 400, 'no signature');
    assert.equal((await post({ 'stripe-signature': fake.sign(body, { secret: 'whsec_someone_else' }) })).status, 400, 'wrong secret');
    assert.equal((await post({ 'stripe-signature': fake.sign(body) }, body.replace('"active"', '"trialing"'))).status, 400, 'body changed after signing');
    assert.equal((await post({ 'stripe-signature': fake.sign(body, { timestamp: Math.floor(Date.now() / 1000) - 600 }) })).status, 400, 'older than the 300 s tolerance');
    assert.equal((await post({ 'stripe-signature': 'garbage' })).status, 400, 'a malformed header');
    const r = await fetch(base + B.WEBHOOK_PATH, { method: 'POST', headers: { 'content-type': 'text/plain', 'stripe-signature': fake.sign(body) }, body });
    assert.equal(r.status, 400, 'not sent as JSON: no raw body to check');
  });
  assert.equal(evRow(ev.id), undefined);
  assert.equal(row(sub.id), undefined);
  assert.match(logs, /signature check failed/);
  assert.doesNotMatch(logs, /whsec_|rk_test_|v1=/, 'no secret, key or signature in the log');
  // The response body never echoes the request.
  const r = await post({ 'stripe-signature': 'garbage' });
  assert.deepEqual(await r.json(), { received: false });
});

test('signature: during a rotation the previous secret still works; a valid event syncs the subscription', async () => {
  const { fam, sub } = familySub();
  config.stripeWebhookSecretOld = 'whsec_fake_before';
  const r = await deliver('customer.subscription.created', sub.id, { secret: 'whsec_fake_before' });
  assert.equal(r.status, 200);
  assert.equal(evRow(r.ev.id).result, 'ok');
  const s = row(sub.id);
  assert.equal(s.owner_kind, 'family'); assert.equal(s.owner_id, fam); assert.equal(s.plan, 'family');
  assert.equal(s.price_lookup_key, 'oomba_family_monthly'); assert.equal(s.interval, 'month'); assert.equal(s.livemode, 0);
  assert.equal(s.current_period_end, fake.st.subscriptions.get(sub.id).items.data[0].current_period_end * 1000, 'period from the subscription item (basil and later)');
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  config.stripeWebhookSecretOld = '';
  assert.equal((await deliver('customer.subscription.updated', sub.id, { secret: 'whsec_fake_before' })).status, 400, 'once the old secret is removed it no longer works');
});

test('replays: the same event twice is one row and one audit entry; a racing duplicate is a no-op', async () => {
  const { fam, sub } = familySub();
  const ev = fake.event('customer.subscription.created', sub.id);
  assert.equal((await fake.deliver(ev)).status, 200);
  assert.equal((await fake.deliver(ev)).status, 200);
  const [a, b] = await Promise.all([fake.deliver(ev), fake.deliver(ev)]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(q.get('SELECT COUNT(*) n FROM billing_events WHERE event_id=?', ev.id).n, 1);
  assert.equal(audits('billing.subscription.active', `family:${fam}`).length, 1);
  // Two different events racing for one subscription: both recorded, one row.
  const e1 = fake.event('invoice.paid', fake.st.subscriptions.get(sub.id).latest_invoice);
  const e2 = fake.event('customer.subscription.updated', sub.id);
  const rs = await Promise.all([fake.deliver(e1), fake.deliver(e2)]);
  assert.deepEqual(rs.map(r => r.status), [200, 200]);
  assert.equal(evRow(e1.id).result, 'ok'); assert.equal(evRow(e2.id).result, 'ok');
  assert.equal(q.get('SELECT COUNT(*) n FROM billing_subscriptions WHERE owner_id=?', fam).n, 1);
});

test('a failed Stripe read answers 500 and records nothing; Stripe\'s redelivery then syncs', async () => {
  const { fam, sub } = familySub();
  const ev = fake.event('customer.subscription.created', sub.id);
  fake.failNextGet(1);
  const logs = await logsOf(async () => assert.equal((await fake.deliver(ev)).status, 500));
  assert.equal(evRow(ev.id), undefined, 'no event row, so the redelivery is not a "duplicate"');
  assert.equal(row(sub.id), undefined);
  assert.match(logs, /billing webhook failed/);
  assert.match(logs, /"statusCode":500/);
  assert.doesNotMatch(logs, /rk_test_|whsec_|fake failure/, 'only type, code, status and request id are logged');
  assert.equal((await fake.deliver(ev)).status, 200);
  assert.equal(evRow(ev.id).result, 'ok');
  assert.equal(B.ownerPlan('family', fam).entitled, true);
});

test('order does not matter: a late "updated (active)" after "deleted" still ends canceled; older subscriptions still sync', async () => {
  const { fam, sub } = familySub();
  const updated = fake.event('customer.subscription.updated', sub.id);   // made while active
  fake.update(sub.id, { status: 'canceled' });
  const deleted = fake.event('customer.subscription.deleted', sub.id);
  assert.equal((await fake.deliver(deleted)).status, 200);
  assert.equal((await fake.deliver(updated)).status, 200);
  assert.equal(row(sub.id).status, 'canceled', 'the re-fetch gives the current state');
  assert.equal(B.ownerPlan('family', fam).entitled, false);
  // A newer subscription for the same owner, then an event about the older one: both rows stay right.
  const cus = row(sub.id).stripe_customer_id;
  const newer = fake.subscription({ customer: cus });
  await deliver('customer.subscription.created', newer.id);
  const older = fake.subscription({ customer: cus, periodStart: Date.now() - 40 * DAY });
  await deliver('customer.subscription.created', older.id);
  fake.update(older.id, { status: 'canceled' });
  await deliver('customer.subscription.deleted', older.id);
  assert.equal(row(older.id).status, 'canceled');
  assert.equal(row(newer.id).status, 'active');
  assert.equal(B.ownerPlan('family', fam).entitled, true, 'entitled when any current-mode subscription is');
});

test('two deliveries racing for one subscription: an older read never commits after a newer one', async () => {
  const { fam, sub } = familySub();
  await B.syncSubscription(sub.id);
  fake.delayNextGet(150);   // the first delivery's read sees "active" but answers late
  const first = deliver('customer.subscription.updated', sub.id);
  await new Promise(r => setTimeout(r, 30));
  fake.update(sub.id, { status: 'canceled' });
  const second = deliver('customer.subscription.deleted', sub.id);
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(row(sub.id).status, 'canceled', 'the later sync read after the earlier one committed');
  assert.equal(B.ownerPlan('family', fam).entitled, false);
});

test('serialize: syncs of one subscription run one after another; other subscriptions are not held up', async () => {
  const order = [];
  let release;
  const slow = B.serialize('sub_x', () => new Promise(r => { release = r; order.push('a start'); })).then(() => order.push('a end'));
  const next = B.serialize('sub_x', () => { order.push('b'); });
  const other = B.serialize('sub_y', () => { order.push('other'); });
  await other;
  await new Promise(r => setTimeout(r, 10));
  assert.deepEqual(order, ['a start', 'other']);
  release(); await slow; await next;
  assert.deepEqual(order, ['a start', 'other', 'a end', 'b']);
  // A failed sync doesn't block the next one.
  await assert.rejects(B.serialize('sub_z', () => { throw new Error('boom'); }));
  assert.equal(await B.serialize('sub_z', () => 'ok'), 'ok');
});

test('card grace: past_due gets BILLING_GRACE_DAYS once (set by sync even when the event was missed), active clears it', async () => {
  const { fam, sub } = familySub();
  await B.syncSubscription(sub.id);
  assert.equal(row(sub.id).grace_until, null);
  fake.update(sub.id, { status: 'past_due' });
  const t0 = Date.now();
  await B.reconcile();   // no invoice.payment_failed event: the reconcile job sees it
  const g = row(sub.id).grace_until;
  assert.ok(g >= t0 + 7 * DAY && g <= Date.now() + 7 * DAY, 'now + 7 days');
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  await deliver('invoice.payment_failed', fake.st.subscriptions.get(sub.id).latest_invoice);
  assert.equal(row(sub.id).grace_until, g, 'a later sync keeps the first deadline (no endless grace)');
  assert.equal(B.ownerPlan('family', fam, g + 1).entitled, false, 'after the grace the plan ends');
  assert.equal(B.entitledRow(row(sub.id), g - 1), true);
  fake.update(sub.id, { status: 'active' });
  await deliver('invoice.paid', fake.st.subscriptions.get(sub.id).latest_invoice);
  assert.equal(row(sub.id).grace_until, null, 'paid again: grace cleared');
  assert.ok(audits('billing.subscription.past_due', `family:${fam}`).length === 1);
  assert.ok(audits('billing.invoice.failed', `family:${fam}`).length === 1);
  assert.ok(audits('billing.invoice.paid', `family:${fam}`).length === 1);
});

test('invoice schools: an open invoice past its due date gives due + SCHOOL_INVOICE_GRACE_DAYS, whatever the status; paid clears it', async () => {
  const sch = school(); const cus = fake.customer().id; B.linkCustomer(cus, 'school', sch);
  const due = Date.now() - 5 * DAY;
  const sub = fake.subscription({ customer: cus, lookupKey: 'oomba_school_seat_yearly', collectionMethod: 'send_invoice', invoice: 'open', dueDate: due, quantity: 30 });
  const inv = fake.st.subscriptions.get(sub.id).latest_invoice;
  const r = await deliver('invoice.overdue', inv);
  assert.equal(r.status, 200);
  const s = row(sub.id);
  assert.equal(s.status, 'active', 'Stripe can leave an overdue subscription active');
  assert.equal(s.grace_until, Math.floor(due / 1000) * 1000 + 30 * DAY);
  assert.equal(s.flag, 'overdue'); assert.equal(s.plan, 'school'); assert.equal(s.quantity, 30);
  assert.equal(B.ownerPlan('school', sch).entitled, true, 'inside the 30 days');
  assert.equal(B.ownerPlan('school', sch, s.grace_until + 1).entitled, false, 'after them, back to free');
  assert.ok(audits('billing.invoice.overdue', `school:${sch}`).length === 1);
  fake.payInvoice(inv);
  await deliver('invoice.paid', inv);
  assert.equal(row(sub.id).grace_until, null); assert.equal(row(sub.id).flag, null);
  // Not yet due: no grace.
  const sub2 = fake.subscription({ customer: cus, lookupKey: 'oomba_school_seat_yearly', collectionMethod: 'send_invoice', invoice: 'open', dueDate: Date.now() + 20 * DAY });
  await deliver('invoice.finalized', fake.st.subscriptions.get(sub2.id).latest_invoice);
  assert.equal(row(sub2.id).grace_until, null);
});

test('entitlement matrix: each status, cancel at period end, delayed payment, orphaned, wrong plan', () => {
  const t = Date.now();
  const base = { status: 'active', grace_until: null, payment_pending: 0, orphaned_at: null, cancel_at_period_end: 0, current_period_end: t + 10 * DAY };
  const E = (p, at = t) => B.entitledRow({ ...base, ...p }, at);
  assert.equal(E({}), true);
  assert.equal(E({ status: 'trialing' }), true);
  for (const s of ['incomplete', 'incomplete_expired', 'unpaid', 'canceled', 'paused']) assert.equal(E({ status: s }), false, s);
  assert.equal(E({ status: 'past_due' }), false, 'past_due without grace');
  assert.equal(E({ status: 'past_due', grace_until: t + DAY }), true);
  assert.equal(E({ status: 'past_due', grace_until: t - 1 }), false);
  assert.equal(E({ grace_until: t - 1 }), false, 'an overdue invoice school past its grace');
  assert.equal(E({ cancel_at_period_end: 1 }), true, 'cancelled at the period end: runs to the end');
  assert.equal(E({ cancel_at_period_end: 1 }, t + 10 * DAY), false, '...and not after it, even if the deleted event is missed');
  assert.equal(E({ payment_pending: 1 }), false, 'a delayed payment that has not arrived');
  assert.equal(E({ orphaned_at: t }), false);
});

test('cancel at period end: synced, entitled until the period end; "deleted" ends it', async () => {
  const { fam, sub } = familySub();
  fake.update(sub.id, { cancelAtPeriodEnd: true });
  await deliver('customer.subscription.updated', sub.id);
  const s = row(sub.id);
  assert.equal(s.cancel_at_period_end, 1);
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  assert.equal(B.ownerPlan('family', fam, s.current_period_end).entitled, false);
  fake.update(sub.id, { status: 'canceled' });
  await deliver('customer.subscription.deleted', sub.id);
  assert.equal(B.ownerPlan('family', fam).entitled, false);
  assert.ok(audits('billing.subscription.canceled', `family:${fam}`).length === 1);
});

test('mode filter: a live event under a test key is dropped; live rows never count with a test key (and the reverse)', async () => {
  const { fam, sub } = familySub();
  const r = await deliver('customer.subscription.created', sub.id, { livemode: true });
  assert.equal(r.status, 200);
  assert.equal(evRow(r.ev.id).result, 'mode_mismatch');
  assert.equal(row(sub.id), undefined);
  // A live row (as if left from another key) doesn't entitle under the test key.
  const fam2 = family();
  q.run(`INSERT INTO billing_subscriptions(stripe_subscription_id, stripe_customer_id, owner_kind, owner_id, plan, status, livemode, created_at, updated_at)
    VALUES ('sub_live_row', 'cus_live', 'family', ?, 'family', 'active', 1, 0, 0)`, fam2);
  assert.equal(B.ownerPlan('family', fam2).entitled, false);
  await B.syncSubscription(sub.id);
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  // Switch to a live key: the test rows stop counting, the live row counts. The customer link is per mode too.
  config.stripeApiKey = 'rk_live_fake';
  try {
    assert.equal(S.currentLivemode(), 1);
    assert.equal(B.ownerPlan('family', fam).entitled, false, 'test-mode rows never grant with a live key');
    assert.equal(B.ownerPlan('family', fam2).entitled, true);
    assert.equal(B.ownerOfCustomer(row(sub.id).stripe_customer_id), null);
  } finally { config.stripeApiKey = 'rk_test_fake'; }
  // Reconcile only re-fetches current-mode rows (the live row would 404 at the fake).
  const res = await B.reconcile();
  assert.equal(res.errors, 0);
  assert.equal(q.get("SELECT orphaned_at FROM billing_subscriptions WHERE stripe_subscription_id='sub_live_row'").orphaned_at, null);
});

test('owners: found from the Customer id first; metadata only as a checked fallback; otherwise "unlinked" (200)', async () => {
  // Known customer, metadata pointing elsewhere: the customer wins (BP-9).
  const { fam, cus } = familySub();
  const other = family();
  const s1 = fake.subscription({ customer: cus, metadata: { owner_kind: 'family', owner_id: other } });
  await deliver('customer.subscription.created', s1.id);
  assert.equal(row(s1.id).owner_id, fam);
  // Unknown customer (made in the Dashboard) with metadata naming a real school: linked, and the customer remembered.
  const sch = school();
  const s2 = fake.subscription({ lookupKey: 'oomba_school_seat_yearly', metadata: { owner_kind: 'school', owner_id: sch } });
  await deliver('customer.subscription.created', s2.id);
  assert.equal(row(s2.id).owner_id, sch);
  assert.deepEqual(B.ownerOfCustomer(s2.customer), { owner_kind: 'school', owner_id: sch });
  // The customer's own metadata (school_id) works too.
  const sch2 = school();
  const s3 = fake.subscription({ lookupKey: 'oomba_school_seat_yearly', customerMetadata: { school_id: sch2 } });
  await deliver('customer.subscription.created', s3.id);
  assert.equal(row(s3.id).owner_id, sch2);
  // Unknown customer, metadata naming something that doesn't exist, or nothing: unlinked, 200, listed for linking.
  for (const metadata of [{ owner_kind: 'school', owner_id: 'no-such-school' }, { owner_kind: 'pirate', owner_id: 'x' }, {}]) {
    const s = fake.subscription({ metadata });
    const r = await deliver('customer.subscription.created', s.id);
    assert.equal(r.status, 200, 'never an error: Stripe would retry for days');
    const e = evRow(r.ev.id);
    assert.equal(e.result, 'unlinked'); assert.equal(e.stripe_customer_id, s.customer); assert.equal(e.stripe_subscription_id, s.id);
    assert.equal(row(s.id), undefined);
    assert.equal(audits('billing.unlinked_event', s.id).length, 1);
  }
});

test('refunds, disputes and early fraud warnings find their subscription through invoice payments', async () => {
  const { fam, sub } = familySub();
  await B.syncSubscription(sub.id);
  const inv = fake.st.subscriptions.get(sub.id).latest_invoice;
  const charge = fake.chargeOf(inv);
  fake.refund(charge.id);
  const r1 = await deliver('charge.refunded', charge.id);
  const d = fake.dispute(charge.id);
  const r2 = await deliver('charge.dispute.created', d);
  const w = fake.earlyFraudWarning(charge.id);
  const r3 = await deliver('radar.early_fraud_warning.created', w);
  for (const r of [r1, r2, r3]) { assert.equal(r.status, 200); assert.equal(evRow(r.ev.id).result, 'ok'); assert.equal(evRow(r.ev.id).stripe_subscription_id, sub.id); }
  for (const a of ['billing.refund', 'billing.dispute', 'billing.fraud_warning']) assert.equal(audits(a, `family:${fam}`).length, 1, a);
  assert.ok(fake.requests.some(x => x.path === '/v1/invoice_payments' && x.params.payment?.payment_intent === charge.payment_intent));
  // A charge that isn't an invoice's (no invoice payment): nothing to sync, answered 200.
  const lone = { id: 'ch_lone', object: 'charge', payment_intent: 'pi_lone', amount: 100, amount_refunded: 100, refunded: true, livemode: false };
  const r4 = await deliver('charge.refunded', lone);
  assert.equal(r4.status, 200); assert.equal(evRow(r4.ev.id).result, 'ignored');
});

test('Checkout: an unpaid (delayed) completion grants nothing until the payment arrives; events in any order', async () => {
  const fam = family(); const cus = fake.customer().id; B.linkCustomer(cus, 'family', fam);
  const sub = fake.subscription({ customer: cus, invoice: 'open' });
  const sess = fake.session({ customer: cus, subscription: sub.id, paymentStatus: 'unpaid', metadata: { owner_kind: 'family', owner_id: fam }, clientReferenceId: fam });
  q.run('INSERT INTO billing_checkouts(owner_kind, owner_id, livemode, session_id, created_at) VALUES (?,?,0,?,?)', 'family', fam, sess.id, Date.now());
  const r = await deliver('checkout.session.completed', sess.id);
  assert.equal(r.status, 200);
  assert.equal(row(sub.id).payment_pending, 1);
  assert.equal(B.ownerPlan('family', fam).entitled, false, 'ACH not arrived: no plan yet');
  assert.equal(q.get('SELECT COUNT(*) n FROM billing_checkouts WHERE session_id=?', sess.id).n, 0, 'the open session is cleared');
  // The money arrives: the session is paid and its invoice too. The late "completed" (unpaid copy) changes nothing.
  const lateCompleted = fake.event('checkout.session.completed', sess.id);
  sess.payment_status = 'paid'; fake.payInvoice(fake.st.subscriptions.get(sub.id).latest_invoice);
  await deliver('checkout.session.async_payment_succeeded', sess.id);
  assert.equal(B.ownerPlan('family', fam).entitled, true);
  await fake.deliver(lateCompleted);
  assert.equal(B.ownerPlan('family', fam).entitled, true, 're-fetched, so an old event can\'t take it away');
  // A failed delayed payment: flagged, not entitled.
  const fam2 = family(); const cus2 = fake.customer().id; B.linkCustomer(cus2, 'family', fam2);
  const sub2 = fake.subscription({ customer: cus2, invoice: 'open', status: 'incomplete' });
  const sess2 = fake.session({ customer: cus2, subscription: sub2.id, paymentStatus: 'unpaid', metadata: { owner_kind: 'family', owner_id: fam2 } });
  await deliver('checkout.session.completed', sess2.id);
  await deliver('checkout.session.async_payment_failed', sess2.id);
  assert.equal(row(sub2.id).flag, 'async_failed');
  assert.equal(B.ownerPlan('family', fam2).entitled, false);
  assert.equal(audits('billing.checkout.failed', `family:${fam2}`).length, 1);
  // A paid completion grants at once.
  const fam3 = family(); const cus3 = fake.customer().id; B.linkCustomer(cus3, 'family', fam3);
  const sub3 = fake.subscription({ customer: cus3 });
  await deliver('checkout.session.completed', fake.session({ customer: cus3, subscription: sub3.id, metadata: { owner_kind: 'family', owner_id: fam3 } }).id);
  assert.equal(B.ownerPlan('family', fam3).entitled, true);
});

test('Checkout: an expired session frees the owner to start again; other events and types are ignored with 200', async () => {
  const fam = family();
  const sess = fake.session({ status: 'expired', paymentStatus: 'unpaid', metadata: { owner_kind: 'family', owner_id: fam } });
  q.run('INSERT INTO billing_checkouts(owner_kind, owner_id, livemode, session_id, created_at) VALUES (?,?,0,?,?)', 'family', fam, sess.id, Date.now());
  const r = await deliver('checkout.session.expired', sess.id);
  assert.equal(r.status, 200); assert.equal(evRow(r.ev.id).result, 'ok');
  assert.equal(q.get('SELECT COUNT(*) n FROM billing_checkouts WHERE owner_id=?', fam).n, 0);
  const r2 = await deliver('customer.updated', fake.customer().id);
  assert.equal(r2.status, 200); assert.equal(evRow(r2.ev.id).result, 'ignored');
  const r3 = await deliver('checkout.session.completed', fake.session({ mode: 'payment' }).id);
  assert.equal(evRow(r3.ev.id).result, 'ignored', 'not a subscription Checkout');
  const r4 = await deliver('invoice.paid', fake.invoice({ customer: fake.customer().id }).id);
  assert.equal(evRow(r4.ev.id).result, 'ignored', 'an invoice with no subscription');
});

test('the Checkout return fallback takes the owner only from the session: another family\'s session changes nothing', async () => {
  const famA = family(); const famB = family();
  const cus = fake.customer().id; B.linkCustomer(cus, 'family', famA);
  const sub = fake.subscription({ customer: cus });
  const sess = fake.session({ customer: cus, subscription: sub.id, metadata: { owner_kind: 'family', owner_id: famA }, clientReferenceId: famA });
  assert.deepEqual(await B.syncCheckoutReturn(sess.id, { kind: 'family', id: famB }), { result: 'not_yours' });
  assert.equal(row(sub.id), undefined);
  // Metadata rewritten to famB, but the customer belongs to famA: still refused.
  const sess2 = fake.session({ customer: cus, subscription: sub.id, metadata: { owner_kind: 'family', owner_id: famB }, clientReferenceId: famB });
  assert.deepEqual(await B.syncCheckoutReturn(sess2.id, { kind: 'family', id: famB }), { result: 'not_yours' });
  const open = fake.session({ customer: cus, status: 'open', paymentStatus: 'unpaid', metadata: { owner_kind: 'family', owner_id: famA }, clientReferenceId: famA });
  assert.deepEqual(await B.syncCheckoutReturn(open.id, { kind: 'family', id: famA }), { result: 'processing' });
  const ok = await B.syncCheckoutReturn(sess.id, { kind: 'family', id: famA });
  assert.equal(ok.result, 'ok');
  assert.equal(B.ownerPlan('family', famA).entitled, true);
  assert.equal(B.ownerPlan('family', famB).entitled, false);
});

test('reconcile: catches missed events, marks subscriptions Stripe no longer has as orphaned, keeps going after errors', async () => {
  const a = familySub(); const b = familySub(); const c = familySub();
  for (const x of [a, b, c]) await B.syncSubscription(x.sub.id);
  fake.update(a.sub.id, { status: 'canceled' });   // the deleted event was missed
  fake.st.subscriptions.delete(b.sub.id);          // gone at Stripe (e.g. a sandbox reset)
  const r = await B.reconcile();
  assert.equal(r.orphaned, 1);
  assert.equal(row(a.sub.id).status, 'canceled');
  assert.ok(row(b.sub.id).orphaned_at);
  assert.equal(B.ownerPlan('family', b.fam).entitled, false);
  assert.equal(row(c.sub.id).status, 'active');
  // One failing read is caught and counted; the others still sync.
  fake.update(c.sub.id, { status: 'past_due' });
  const d = familySub(); await B.syncSubscription(d.sub.id); fake.update(d.sub.id, { status: 'unpaid' });
  fake.failNextGet(1);
  const logs = await logsOf(async () => { const r2 = await B.reconcile(); assert.equal(r2.errors, 1); });
  assert.match(logs, /billing reconcile: subscription not synced/);
  assert.ok([row(c.sub.id).status, row(d.sub.id).status].some(s => s === 'past_due' || s === 'unpaid'), 'the other subscription was synced');
});

test('an event of another API version is accepted and warned about once', async () => {
  const { sub } = familySub();
  const logs = await logsOf(async () => {
    assert.equal((await deliver('customer.subscription.created', sub.id, { api_version: '2026-03-25.dahlia' })).status, 200);
    assert.equal((await deliver('customer.subscription.updated', sub.id, { api_version: '2026-03-25.dahlia' })).status, 200);
  });
  assert.equal((logs.match(/different API version/g) || []).length, 1);
});

test('grants entitle until their date unless revoked; never with billing off', () => {
  const sch = school(); const t = Date.now();
  q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, seats, until, created_at) VALUES ('g1','school',?,'school',25,?,?)", sch, t + 30 * DAY, t);
  const p = B.ownerPlan('school', sch);
  assert.equal(p.entitled, true); assert.equal(p.via, 'grant'); assert.equal(p.grant.seats, 25);
  assert.equal(B.ownerPlan('school', sch, t + 31 * DAY).entitled, false);
  q.run("UPDATE billing_grants SET revoked_at=? WHERE id='g1'", t);
  assert.equal(B.ownerPlan('school', sch).entitled, false);
  q.run("UPDATE billing_grants SET revoked_at=NULL WHERE id='g1'");
  config.stripeApiKey = '';
  try { assert.equal(B.ownerPlan('school', sch).entitled, false); } finally { config.stripeApiKey = 'rk_test_fake'; }
});

test('a subscription to a price of the other plan never entitles (a family plan bought for a school)', async () => {
  const sch = school(); const cus = fake.customer().id; B.linkCustomer(cus, 'school', sch);
  const sub = fake.subscription({ customer: cus, lookupKey: 'oomba_family_monthly' });
  await B.syncSubscription(sub.id);
  assert.equal(row(sub.id).plan, 'family');
  assert.equal(B.ownerPlan('school', sch).entitled, false);
});

test('prices are found by lookup key', async () => {
  const p = await S.prices({ refresh: true });
  assert.deepEqual(Object.keys(p).sort(), ['oomba_family_monthly', 'oomba_family_yearly', 'oomba_school_seat_yearly']);
  assert.equal(p.oomba_family_yearly.interval, 'year');
  assert.equal(p.oomba_school_seat_yearly.unitAmount, 2000);
  const req = fake.requests.findLast(r => r.path === '/v1/prices');
  assert.deepEqual(req.params.lookup_keys, Object.values(S.PRICE_LOOKUP_KEYS));
});

test('tax readiness: STRIPE_TAX=1 with pending settings or no registration is a problem (and a warning)', async () => {
  assert.equal((await S.taxReadiness()).on, false, 'off: nothing to check, no calls');
  config.stripeTax = true;
  fake.st.tax.status = 'pending';
  assert.equal((await S.taxReadiness()).problem, 'settings_pending');
  fake.st.tax.status = 'active';
  let r;
  const logs = await logsOf(async () => { r = await B.checkTax(); });
  assert.equal(r.problem, 'no_registrations'); assert.equal(r.ok, false);
  assert.match(logs, /collecting in no state/);
  fake.st.tax.registrations.push({ id: 'taxreg_fake', object: 'tax.registration', country: 'US', status: 'active' });
  r = await S.taxReadiness();
  assert.equal(r.ok, true); assert.equal(r.registrations, 1);
  assert.equal(S.lastTaxReadiness().ok, true);
});

test('the webhook works while the site is in maintenance or moved to a new address', async () => {
  const { sub } = familySub();
  config.maintenance = true;
  const app2 = createApp().listen(0, '127.0.0.1'); await new Promise(r => app2.once('listening', r));
  const url = `http://127.0.0.1:${app2.address().port}${B.WEBHOOK_PATH}`;
  try {
    assert.equal((await fetch(url.replace(B.WEBHOOK_PATH, '/'))).status, 503, 'pages are "back soon"');
    assert.equal((await fake.deliver(fake.event('customer.subscription.created', sub.id), { url })).status, 200);
  } finally { app2.close(); config.maintenance = false; }
  config.movedTo = 'https://new.example.com';
  const app3 = createApp().listen(0, '127.0.0.1'); await new Promise(r => app3.once('listening', r));
  const url3 = `http://127.0.0.1:${app3.address().port}${B.WEBHOOK_PATH}`;
  try { assert.equal((await fake.deliver(fake.event('customer.subscription.updated', sub.id), { url: url3 })).status, 200); } finally { app3.close(); config.movedTo = ''; }
});

test('the webhook body is limited and never decompressed', async () => {
  const big = '{"x":"' + 'a'.repeat(1100 * 1024) + '"}';
  const r = await fetch(base + B.WEBHOOK_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': fake.sign(big) }, body: big });
  assert.equal(r.status, 413);
  const g = await fetch(base + B.WEBHOOK_PATH, { method: 'POST', headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'stripe-signature': 't=1,v1=00' }, body: 'x' });
  assert.equal(g.status, 415);
});

test('a Stripe error never carries the key: StripeCallError has only type, code, status and request id', async () => {
  config.stripeApiKey = 'rk_test_wrongfake';
  try {
    const e = await S.getSubscription('sub_any').catch(x => x);
    assert.ok(e instanceof S.StripeCallError);
    assert.equal(e.statusCode, 401);
    assert.doesNotMatch(JSON.stringify({ m: e.message, f: e.fields, s: e.stack }), /rk_test_|Invalid API Key/);
    assert.deepEqual(Object.keys(e.fields).sort(), ['code', 'requestId', 'statusCode', 'type']);
  } finally { config.stripeApiKey = 'rk_test_fake'; }
});
