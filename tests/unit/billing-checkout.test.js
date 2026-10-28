// Paid plans, chunk 4: family checkout (server/services/checkout.js, routes/family.js), the family extra messages
// (server/builder/usage.js), the paid AI pool (services/ai-budget.js), refunds / disputes / fraud warnings and duplicate
// Checkouts (services/billing.js), and the read-only /admin/billing. Billing is on against the fake Stripe
// (tests/support/fake-stripe.js), reached through the real stripe SDK; webhooks are signed and checked for real. Every
// key and secret here is a short fake value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_chk';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config, parseStripe } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid, today, tx } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const B = await import('../../server/services/billing.js');
const C = await import('../../server/services/checkout.js');
const S = await import('../../server/services/stripe.js');
const SC = await import('../../server/services/schools.js');
const usage = await import('../../server/builder/usage.js');
const turns = await import('../../server/builder/turns.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const anthropic = await import('../../server/builder/anthropic.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { _reset: resetLimits, allow, count, loginLockKey } = await import('../../server/services/ratelimit.js');
const { LOGIN } = await import('../../server/routes/auth.js');

const DAY = 86400e3;
const PW = 'a-long-password-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcFamily: 'pmc_fakefamily', termsPublished: false, billingPublic: true, builderDailyTurns: 3, familyExtraMessages: 5, familyChildDailyMax: 4, familyMonthlyAiUsd: 4, proTurnWeight: 1, anthropicKey: '', aiPaidMonthlyBudgetUsd: null, aiHardMonthlyUsd: null };
test.beforeEach(() => { Object.assign(config, defaults); resetLimits(); fake.violations.length = 0; });

// ---------------------------------------------------------------- helpers
/** A signed-in session: { cookie, sid } (the session id, for reauth_at). */
function signIn(u) {
  let c = ''; const sid = auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id);
  return { cookie: c, sid };
}
async function call(who, path, { method = 'GET', body, redirect = 'manual' } = {}) {
  const h = {}; if (who) h.cookie = who.cookie; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
let n = 0;
const kid = () => auth.createUser({ username: `Chk${++n}${uid(4)}`, password: 'rainbow-77' });
function grownup({ tester = true } = {}) {
  const u = auth.createUser({ username: `Par${++n}${uid(4)}`, password: PW, accountType: 'grownup' });
  F.ensureFamily(u);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  return auth.getUser(u.id);
}
/** A grown-up with a linked child, signed in, password typed again. */
function family({ tester = true, fresh = true } = {}) {
  const g = grownup({ tester }); const child = kid(); const fam = F.familyOfOwner(g.id);
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", fam.id, child.id, Date.now(), Date.now());
  const who = signIn(g);
  if (fresh) C.markReauth(who.sid);
  return { g, child, fam, who };
}
const checkout = (who, body = { interval: 'month' }) => call(who, '/api/billing/family/checkout', { method: 'POST', body });
const lastCheckoutParams = () => fake.requests.filter(r => r.method === 'POST' && r.path === '/v1/checkout/sessions').at(-1);
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND target=?', action, target);
const subRow = id => q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', id);
/** Pays a session on the fake hosted page (it makes the subscription and sends the webhooks), as the browser would. */
async function pay(url) {
  const r = await fetch(url, { redirect: 'manual' });
  assert.equal(r.status, 302, await r.text());
  return r.headers.get('location');
}
/** A family with an active plan (paid through the fake Checkout). -> { …family(), subId } */
async function payingFamily(opts = {}) {
  const f = family(opts);
  const r = await checkout(f.who, { interval: opts.interval || 'month' });
  assert.equal(r.status, 200, r.text);
  await pay(r.json.redirect);
  assert.equal(B.ownerPlan('family', f.fam.id).entitled, true);
  return { ...f, subId: B.ownerPlan('family', f.fam.id).subscription.stripe_subscription_id };
}
/** One Builder message charged like agent.js does (charge and row in one transaction). -> the charge or false */
function build(user, { pro = false, usd = 0, refund = false } = {}) {
  return tx(() => {
    const c = usage.takeTurn(user, today(), { pro });
    if (!c) return false;
    const gid = uid(10);
    const row = turns.create({ gameId: gid, userId: user.id, status: 'done', chargedDay: today(), chargedTo: c.source, weight: c.weight });
    if (usd) turns.addCost(row.id, usd);
    if (refund) turns.refund(row.id);
    return c;
  });
}

// ---------------------------------------------------------------- access
test('the billing APIs are 404 for kids, school accounts, teachers, guests and the signed-out, and while families are off', async () => {
  const boss = auth.createUser({ username: `Boss${uid(4)}`, password: 'boss-password-1', role: 'admin' });
  const school = SC.createSchool(boss, { name: `Chk School ${uid(4)}` }).school;
  const teacher = SC.createSchoolAccount(boss, school.id, { rosterName: 'Ms Chk', role: 'teacher' }).user;
  const student = SC.createSchoolAccount(teacher, school.id, { rosterName: 'Stu Chk' }).user;
  const guest = auth.createGuest();
  const paths = [['POST', '/api/billing/family/checkout'], ['POST', '/api/billing/portal'], ['GET', '/api/billing/status']];
  for (const u of [kid(), teacher, student, guest, boss, null]) {
    for (const [method, p] of paths) {
      const r = await call(u ? signIn(u) : null, p, { method, body: method === 'POST' ? { interval: 'month', password: 'x' } : undefined });
      assert.equal(r.status, 404, `${u ? u.username : 'nobody'} ${p}`);
    }
  }
  const { who } = family();
  for (const off of [{ billingPublic: false }, { stripeApiKey: '' }]) {
    Object.assign(config, off);
    for (const [method, p] of paths) assert.equal((await call(who, p, { method, body: method === 'POST' ? { interval: 'month' } : undefined })).status, 404, `${JSON.stringify(off)} ${p}`);
    Object.assign(config, defaults);
  }
  // The fence lets a grown-up reach exactly these.
  assert.ok(grownupMay('POST', '/api/billing/family/checkout') && grownupMay('POST', '/api/billing/portal') && grownupMay('GET', '/api/billing/status'));
  assert.ok(!grownupMay('POST', '/api/billing/webhook-ish'));
});

test('test mode: only billing testers may check out or open the Portal (D14)', async () => {
  const { who, g } = family({ tester: false });
  const r = await checkout(who);
  assert.equal(r.status, 403); assert.match(r.json.error, /aren't on sale/);
  assert.equal((await call(who, '/api/billing/portal', { method: 'POST', body: {} })).status, 403);
  assert.equal(C.mayBill(g), false);
  assert.equal(C.mayBill({ ...g, billing_tester: 1 }), true);
  // The /family page doesn't offer Subscribe to a non-tester in test mode, even with a plan picked on /plans.
  const page = await call(who, '/family?plan=family&interval=month');
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /data-api="\/api\/billing\/family\/checkout"/);
  assert.match(page.text, /isn&#39;t on sale yet|isn't on sale yet/);
});

test('step-up: the password again before checkout (10 minutes), wrong ones counted and limited', async () => {
  const { who, g } = family({ fresh: false });
  let r = await checkout(who);
  assert.equal(r.status, 403); assert.equal(r.json.field, 'password'); assert.equal(r.json.needPassword, true);
  r = await checkout(who, { interval: 'month', password: 'not-the-password' });
  assert.equal(r.status, 403); assert.match(r.json.error, /isn't right/);
  assert.equal(C.reauthFresh(who.sid), false);
  r = await checkout(who, { interval: 'month', password: PW });
  assert.equal(r.status, 200, r.text);
  assert.equal(C.reauthFresh(who.sid), true, 'reauth_at set on this sign-in only');
  assert.equal(C.reauthFresh(signIn(g).sid), false, 'another sign-in of the same account is not stepped up');
  // Within 10 minutes no password is needed; after it, again.
  assert.equal((await checkout(who, { interval: 'year' })).status, 200);
  q.run('UPDATE sessions SET reauth_at=? WHERE id=?', Date.now() - C.STEP_UP_MS - 1000, who.sid);
  assert.equal((await checkout(who)).status, 403);
  // 5 wrong passwords (one above): then 429, even with the right one.
  resetLimits();
  for (let i = 0; i < 5; i++) assert.equal((await checkout(who, { interval: 'month', password: `wrong-${i}` })).status, 403);
  assert.equal((await checkout(who, { interval: 'month', password: PW })).status, 429);
});

test('pay first: checkout needs no linked child, only a known plan and interval', async () => {
  const g = grownup(); const who = signIn(g); C.markReauth(who.sid);
  let r = await checkout(who);
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, /\/pay\/cs_test_/);
  r = await checkout(who, { interval: 'year', plan: 'basic' });
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(lastCheckoutParams().params.line_items, [{ price: 'price_fake_basic_yearly', quantity: '1' }]);
  for (const body of [{ interval: 'week' }, { interval: 'month', plan: 'child' }, { interval: 'month', plan: 'plus' }, { interval: 'month', plan: 'school' }]) {
    r = await checkout(who, body);
    assert.equal(r.status, 400, JSON.stringify(body));
  }
});

test('the Checkout Session: hosted, subscription mode, prices by lookup key, flexible billing, our ids, never payment_method_types', async () => {
  const { who, fam, g } = family();
  const before = fake.requests.length;
  const r = await checkout(who);
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, new RegExp(`^${fake.url}/pay/cs_test_`));
  const cus = fake.requests.slice(before).find(x => x.method === 'POST' && x.path === '/v1/customers');
  assert.ok(cus, 'the Customer is made first');
  assert.deepEqual(cus.params.metadata, { owner_kind: 'family', owner_id: fam.id, family_id: fam.id });
  assert.equal(cus.params.email, undefined); assert.equal(cus.params.name, undefined);
  const p = lastCheckoutParams().params;
  assert.equal(p.mode, 'subscription');
  assert.equal(p.customer, B.customerOf('family', fam.id));
  assert.deepEqual(p.line_items, [{ price: 'price_fake_family_monthly', quantity: '1' }]);
  assert.equal(p.client_reference_id, fam.id);
  assert.deepEqual(p.metadata, { owner_kind: 'family', owner_id: fam.id });
  assert.deepEqual(p.subscription_data, { metadata: { owner_kind: 'family', owner_id: fam.id }, billing_mode: { type: 'flexible' } });
  assert.equal(p.billing_address_collection, 'required');
  assert.deepEqual(p.customer_update, { address: 'auto' });
  assert.equal(p.allow_promotion_codes, 'true');
  assert.match(p.integration_identifier, /^oomba_family_[a-z]{8}$/);
  assert.equal(p.success_url, `${base}/family?checkout={CHECKOUT_SESSION_ID}`);
  assert.equal(p.cancel_url, `${base}/family?plan=family&interval=month`);
  assert.equal(p.payment_method_configuration, 'pmc_fakefamily', 'the Family configuration (Link off), always');
  for (const k of ['payment_method_types', 'automatic_tax', 'consent_collection', 'custom_text']) assert.equal(p[k], undefined, k);
  assert.ok(fake.requests.slice(before).filter(x => x.method === 'POST').every(x => x.idempotencyKey), 'every POST has an idempotency key');
  assert.deepEqual(fake.violations, []);
  assert.equal(audits('billing.checkout.start', `family:${fam.id}`).length, 1);
  assert.equal(JSON.parse(audits('billing.checkout.start', `family:${fam.id}`)[0].details).interval, 'month');
  assert.equal(audits('billing.checkout.start', `family:${fam.id}`)[0].actor_id, g.id);
  // The yearly price; the same Customer is reused.
  await checkout(who, { interval: 'year' });
  assert.deepEqual(lastCheckoutParams().params.line_items, [{ price: 'price_fake_family_yearly', quantity: '1' }]);
  assert.equal(fake.requests.slice(before).filter(x => x.method === 'POST' && x.path === '/v1/customers').length, 1);
  // The settings that switch extras on: Stripe Tax, the Terms.
  Object.assign(config, { stripeTax: true, termsPublished: true });
  await checkout(who);
  const p2 = lastCheckoutParams().params;
  assert.equal(p2.payment_method_configuration, 'pmc_fakefamily');
  assert.deepEqual(p2.automatic_tax, { enabled: 'true' });
  assert.deepEqual(p2.consent_collection, { terms_of_service: 'required' });
  assert.match(p2.custom_text.terms_of_service_acceptance.message, new RegExp(`\\(${base}/terms\\)`));
  assert.equal(p2.payment_method_types, undefined);
  assert.deepEqual(fake.violations, []);
});

test('STRIPE_PMC_FAMILY and TERMS_PUBLISHED are checked at start-up', () => {
  const env = { STRIPE_API_KEY: 'rk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' };
  assert.equal(parseStripe({ ...env, STRIPE_PMC_FAMILY: 'pmc_1AbC' }).pmcFamily, 'pmc_1AbC');
  assert.match(parseStripe({ ...env, STRIPE_PMC_FAMILY: 'card' }).errors.join(), /STRIPE_PMC_FAMILY must look like pmc_/);
  assert.equal(parseStripe({ ...env, TERMS_PUBLISHED: '1' }).termsPublished, true);
  assert.match(parseStripe({ ...env, TERMS_PUBLISHED: 'maybe' }).errors.join(), /TERMS_PUBLISHED/);
});

test('one open Checkout per family: a new one expires the old one; an old one paid meanwhile stops the new one', async () => {
  const { who, fam } = family();
  const first = (await checkout(who)).json.redirect.split('/pay/')[1];
  const second = (await checkout(who)).json.redirect.split('/pay/')[1];
  assert.equal(fake.st.sessions.get(first).status, 'expired');
  assert.equal(fake.st.sessions.get(second).status, 'open');
  assert.equal(q.get("SELECT session_id FROM billing_checkouts WHERE owner_kind='family' AND owner_id=?", fam.id).session_id, second);
  // The open one is paid at Stripe but no webhook arrived yet: a new attempt says the payment is on its way.
  const s = fake.st.sessions.get(second); const sub = fake.subscription({ customer: s.customer, metadata: s.metadata });
  Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: sub.id });
  const r = await checkout(who);
  assert.equal(r.status, 409); assert.match(r.json.error, /just went through/);
  // Its webhook arrives: the plan is on and the open session is forgotten.
  await fake.emit('checkout.session.completed', second);
  assert.equal(B.ownerPlan('family', fam.id).entitled, true);
  assert.equal(q.get("SELECT COUNT(*) n FROM billing_checkouts WHERE owner_kind='family' AND owner_id=?", fam.id).n, 0);
  // Already entitled: no new Checkout (Manage billing instead).
  const again = await checkout(who);
  assert.equal(again.status, 409); assert.match(again.json.error, /already has a plan/);
  // An expired session's webhook also frees the slot.
  const f2 = family(); const sid = (await checkout(f2.who)).json.redirect.split('/pay/')[1];
  fake.st.sessions.get(sid).status = 'expired';
  await fake.emit('checkout.session.expired', sid);
  assert.equal(q.get("SELECT COUNT(*) n FROM billing_checkouts WHERE owner_kind='family' AND owner_id=?", f2.fam.id).n, 0);
});

test('paying on Stripe\'s page: webhooks turn the plan on; the return page shows it; audit trail', async () => {
  const f = await payingFamily();
  const row = subRow(f.subId);
  assert.equal(row.owner_kind, 'family'); assert.equal(row.owner_id, f.fam.id); assert.equal(row.plan, 'family'); assert.equal(row.interval, 'month');
  assert.equal(row.latest_billing_reason, 'subscription_create'); assert.equal(row.latest_amount_paid, 799); assert.ok(row.latest_paid_at);
  assert.ok(B.refundWindow(row) > Date.now() + 13 * DAY, 'first payment: refundable for 14 days');
  assert.equal(audits('billing.checkout.done', `family:${f.fam.id}`).length, 1);
  assert.equal((await call(f.who, '/api/billing/status')).json.state, 'active');
  const page = await call(f.who, '/family');
  assert.match(page.text, /class="planchip paid">Family plan</);
  assert.match(page.text, /Monthly, renews on/);
  assert.match(page.text, /<a class="btn" href="\/plans">Change plan<\/a>/);
  assert.match(page.text, /5 of 5 extra messages left this month/);
  assert.match(page.text, /data-api="\/api\/billing\/portal"/);
  assert.doesNotMatch(page.text, /data-api="\/api\/billing\/family\/checkout"/);
  // The kid's view of the same moment: no money or plan words anywhere on /me, besides the menu's Plans link that
  // everyone has (docs/decisions.md "Paid plans" §17).
  const me = await call(signIn(f.child), '/me');
  assert.match(me.text, /<a class="navlink" href="\/plans"/);
  assert.doesNotMatch(me.text.replace(/<a [^>]*href="\/plans"[^>]*>[\s\S]*?<\/a>/g, ''), /\$\d|plan|subscri|billing/i);
});

test('the return page\'s fallback: syncs from the session itself; another family\'s session changes nothing', async () => {
  const a = family(), b = family();
  const sid = (await checkout(a.who)).json.redirect.split('/pay/')[1];
  // Paid at Stripe, but the webhooks are lost.
  const s = fake.st.sessions.get(sid); const sub = fake.subscription({ customer: s.customer, metadata: s.metadata });
  Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: sub.id });
  // Someone else's session id: nothing happens.
  let r = await call(b.who, `/api/billing/status?checkout=${sid}`);
  assert.equal(r.json.state, 'not_yours');
  assert.equal(subRow(sub.id), undefined);
  assert.equal(B.ownerPlan('family', b.fam.id).entitled, false);
  assert.equal((await call(b.who, '/api/billing/status?checkout=garbage')).json.state, 'not_yours');
  assert.equal((await call(b.who, '/api/billing/status?checkout=cs_test_doesnotexist123')).json.state, 'not_yours');
  // The owner's own: synced, on.
  r = await call(a.who, `/api/billing/status?checkout=${sid}`);
  assert.equal(r.json.state, 'active');
  assert.equal(subRow(sub.id).owner_id, a.fam.id);
  // An open (unpaid) session: still processing, nothing granted.
  const c = family(); const sid2 = (await checkout(c.who)).json.redirect.split('/pay/')[1];
  assert.equal((await call(c.who, `/api/billing/status?checkout=${sid2}`)).json.state, 'processing');
  assert.equal(B.ownerPlan('family', c.fam.id).entitled, false);
  // The return page itself waits for it, and offers nothing to pay meanwhile.
  const page = await call(c.who, `/family?checkout=${sid2}`);
  assert.match(page.text, new RegExp(`data-checkout-wait="${sid2}"`));
  assert.doesNotMatch(page.text, /No family plan/);
  assert.doesNotMatch(page.text, /data-api="\/api\/billing\/family\/checkout"|id="pw-checkout"/);
  assert.match(page.text, /<a href="\/family">Back to your family page<\/a>/);
});

test('two Checkouts paid: the second plan is cancelled and refunded, flagged duplicate, one plan stays', async () => {
  const { who, fam } = family();
  const s1 = (await checkout(who)).json.redirect.split('/pay/')[1];
  // A second tab: the first session is expired at Stripe by the second checkout, so pay the first by hand meanwhile.
  const sess1 = fake.st.sessions.get(s1); const subA = fake.subscription({ customer: sess1.customer, metadata: sess1.metadata });
  Object.assign(sess1, { status: 'complete', payment_status: 'paid', subscription: subA.id });
  q.run("DELETE FROM billing_checkouts WHERE owner_kind='family' AND owner_id=?", fam.id);   // as if the tab started before
  const s2 = (await checkout(who)).json.redirect.split('/pay/')[1];
  await fake.emit('customer.subscription.created', subA.id);
  await fake.emit('checkout.session.completed', s1);
  assert.equal(B.ownerPlan('family', fam.id).subscription.stripe_subscription_id, subA.id);
  await pay(fake.st.sessions.get(s2).url);
  const subB = fake.st.sessions.get(s2).subscription;
  assert.equal(fake.st.subscriptions.get(subB).status, 'canceled', 'the new one is cancelled at Stripe');
  const refund = [...fake.st.refunds.values()].find(x => x.payment_intent === fake.chargeOf(fake.st.subscriptions.get(subB).latest_invoice).payment_intent);
  assert.ok(refund, 'and its payment refunded');
  assert.equal(subRow(subB).flag, 'duplicate');
  assert.equal(subRow(subB).status, 'canceled');
  assert.equal(subRow(subA.id).status, 'active');
  assert.equal(B.ownerPlan('family', fam.id).subscription.stripe_subscription_id, subA.id);
  const dup = audits('billing.duplicate', `family:${fam.id}`);
  assert.equal(dup.length, 1); assert.equal(JSON.parse(dup[0].details).kept, subA.id);
  // The same completion again (Stripe retries): nothing more.
  await fake.emit('checkout.session.completed', s2);
  assert.equal([...fake.st.refunds.values()].filter(x => x.charge === refund.charge).length, 1);
  assert.equal(audits('billing.duplicate', `family:${fam.id}`).length, 1);
  assert.equal(B.entitledOwnerCount('family') >= 1, true);
});

test('refunds: a full refund of the latest payment ends the plan now; a partial one flags it', async () => {
  const a = await payingFamily();
  const ch = fake.chargeOf(fake.st.subscriptions.get(a.subId).latest_invoice);
  fake.refund(ch.id);
  const r = await fake.emit('charge.refunded', ch.id);
  assert.equal(r.status, 200);
  assert.equal(fake.st.subscriptions.get(a.subId).status, 'canceled');
  assert.equal(subRow(a.subId).status, 'canceled');
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, false);
  assert.equal(JSON.parse(audits('billing.refund', `family:${a.fam.id}`)[0].details).cancelled, true);
  const cancelReq = fake.requests.find(x => x.method === 'DELETE' && x.path === `/v1/subscriptions/${a.subId}`);
  assert.equal(cancelReq.params.prorate, 'false');

  const b = await payingFamily();
  const ch2 = fake.chargeOf(fake.st.subscriptions.get(b.subId).latest_invoice);
  fake.refund(ch2.id, 300);
  await fake.emit('charge.refunded', ch2.id);
  assert.equal(fake.st.subscriptions.get(b.subId).status, 'active');
  assert.equal(subRow(b.subId).flag, 'refunded_active');
  assert.equal(B.ownerPlan('family', b.fam.id).entitled, true);
});

test('a dispute or an early fraud warning ends the plan now and flags it; no automatic refund', async () => {
  const a = await payingFamily();
  const ch = fake.chargeOf(fake.st.subscriptions.get(a.subId).latest_invoice);
  await fake.emit('charge.dispute.created', fake.dispute(ch.id));
  assert.equal(fake.st.subscriptions.get(a.subId).status, 'canceled');
  assert.equal(subRow(a.subId).flag, 'dispute');
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, false);
  assert.equal(audits('billing.dispute', `family:${a.fam.id}`).length, 1);

  const b = await payingFamily({ interval: 'year' });
  const ch2 = fake.chargeOf(fake.st.subscriptions.get(b.subId).latest_invoice);
  const refundsBefore = fake.st.refunds.size;
  await fake.emit('radar.early_fraud_warning.created', fake.earlyFraudWarning(ch2.id));
  assert.equal(fake.st.subscriptions.get(b.subId).status, 'canceled');
  const row = subRow(b.subId);
  assert.equal(row.flag, 'efw'); assert.equal(row.risk_payment_intent, ch2.payment_intent);
  assert.equal(fake.st.refunds.size, refundsBefore, 'refunding is the owner\'s choice');
  assert.equal(audits('billing.fraud_warning', `family:${b.fam.id}`).length, 1);
});

test('the refund window (owner decision): first payment and yearly renewals for 14 days; never monthly renewals', () => {
  const t = Date.now();
  const r = (reason, interval, paidAgo = DAY) => ({ latest_paid_at: t - paidAgo, latest_amount_paid: 799, latest_billing_reason: reason, interval });
  assert.ok(B.refundWindow(r('subscription_create', 'month'), t));
  assert.ok(B.refundWindow(r('subscription_cycle', 'year'), t));
  assert.equal(B.refundWindow(r('subscription_cycle', 'month'), t), null);
  assert.equal(B.refundWindow(r('subscription_create', 'month', 15 * DAY), t), null);
  assert.equal(B.refundWindow({ ...r('subscription_create', 'month'), latest_amount_paid: 0 }, t), null);
});

test('the Customer Portal: step-up, the family\'s own Customer only, audited', async () => {
  const fresh = family();
  let r = await call(fresh.who, '/api/billing/portal', { method: 'POST', body: {} });
  assert.equal(r.status, 409); assert.match(r.json.error, /nothing to manage/);
  const a = await payingFamily();
  q.run('UPDATE sessions SET reauth_at=NULL WHERE id=?', a.who.sid);
  r = await call(a.who, '/api/billing/portal', { method: 'POST', body: {} });
  assert.equal(r.status, 403); assert.equal(r.json.field, 'password');
  r = await call(a.who, '/api/billing/portal', { method: 'POST', body: { password: PW } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, new RegExp(`^${fake.url}/portal/bps_`));
  const req = fake.requests.filter(x => x.path === '/v1/billing_portal/sessions').at(-1);
  assert.equal(req.params.customer, B.customerOf('family', a.fam.id));
  assert.equal(req.params.return_url, `${base}/family`);
  assert.equal(audits('billing.portal.open', `family:${a.fam.id}`).length, 1);
  // Cancelling there: the plan runs to the period end, then ends.
  const portalId = r.json.redirect.split('/portal/')[1];
  const back = await fetch(`${fake.url}/portal/${portalId}/cancel`, { method: 'POST', redirect: 'manual' });
  assert.equal(back.status, 303); assert.equal(back.headers.get('location'), `${base}/family`);
  assert.equal(subRow(a.subId).cancel_at_period_end, 1);
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, true);
  assert.match((await call(a.who, '/family')).text, /won&#39;t renew|won't renew/);
  fake.update(a.subId, { status: 'canceled' });
  await fake.emit('customer.subscription.deleted', a.subId);
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, false);
});

// ---------------------------------------------------------------- the family extra messages
test('a family child: the free daily messages first, then the family\'s extras (shared, monthly), then the limit', async () => {
  const a = await payingFamily();
  const sib = kid();
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", a.fam.id, sib.id, Date.now(), Date.now());
  let al = usage.allowanceFor(a.child);
  assert.deepEqual({ source: al.source, left: al.left, freeLeft: al.freeLeft, extraLeft: al.extraLeft, familyId: al.familyId }, { source: 'free', left: 3 + 4, freeLeft: 3, extraLeft: 5, familyId: a.fam.id });
  for (let i = 0; i < 3; i++) assert.equal(build(a.child).source, 'free', 'free daily ones first');
  al = usage.allowanceFor(a.child);
  assert.equal(al.source, `family:${a.fam.id}`); assert.equal(al.pool, 'paid'); assert.equal(al.freeLeft, 0);
  assert.deepEqual(build(a.child), { source: `family:${a.fam.id}`, pool: 'paid', weight: 1 });
  assert.equal(usage.allowanceFor(sib).extraLeft, 4, 'the sibling sees the shared pool go down');
  // A failed build gives its extra back.
  build(a.child, { refund: true });
  assert.equal(usage.allowanceFor(a.child).extraLeft, 4);
  // Pro counts with its weight.
  config.proTurnWeight = 2;
  assert.equal(build(a.child, { pro: true }).weight, 2);
  assert.equal(usage.allowanceFor(a.child).extraLeft, 2);
  // The per-child daily ceiling (4 extras a day here): this child has used 3, so one more today.
  assert.equal(usage.allowanceFor(a.child).extraToday, 1);
  config.proTurnWeight = 1;
  assert.equal(build(a.child).source, `family:${a.fam.id}`);
  assert.equal(usage.allowanceFor(a.child).left, 0);
  assert.equal(build(a.child), false, 'no more today for this child');
  assert.equal(usage.limitMessage(a.child, (k, v) => `${k}${v ? JSON.stringify(v) : ''}`), 'builder.errors.limitToday', 'no number for a family child');
  // The sibling: free ones, then the last extra of the month.
  for (let i = 0; i < 3; i++) build(sib);
  assert.equal(usage.allowanceFor(sib).extraLeft, 1);
  assert.equal(build(sib).source, `family:${a.fam.id}`);
  assert.equal(usage.allowanceFor(sib).left, 0); assert.equal(build(sib), false);
  // /family counts this month's extras only up to yesterday (nothing today), and "extras left" for the grown-up.
  assert.deepEqual(F.childUsage(a.fam.id, a.child.id), { yesterday: 0, month: 0 });
  assert.match((await call(a.who, '/family')).text, /5 of 5 extra messages left this month, counted up to yesterday/, 'today\'s use never shows');
  const yday = today(Date.now() - DAY);
  if (yday.slice(0, 7) === today().slice(0, 7)) {
    turns.create({ gameId: uid(10), userId: a.child.id, status: 'done', chargedDay: yday, chargedTo: `family:${a.fam.id}`, weight: 1 });
    assert.match((await call(a.who, '/family')).text, /4 of 5 extra messages left this month/);
  }
  // A child who isn't in the family, or a family without a plan: the free allowance.
  assert.equal(usage.allowanceFor(kid()).familyId, null);
  config.stripeApiKey = '';
  assert.equal(usage.allowanceFor(a.child).familyId, null, 'billing off: nobody is entitled');
});

test('the extras stop at the $ backstop and when the paid pool is spent; the free messages stay', async () => {
  const a = await payingFamily();
  for (let i = 0; i < 3; i++) build(a.child);
  assert.equal(usage.allowanceFor(a.child).source, `family:${a.fam.id}`);
  build(a.child, { usd: 4.5 });   // one very expensive message: past FAMILY_MONTHLY_AI_USD (4)
  let al = usage.allowanceFor(a.child);
  assert.equal(al.extraLeft, 0); assert.equal(al.left, 0); assert.equal(al.source, 'free');
  config.familyMonthlyAiUsd = 10;
  assert.ok(usage.allowanceFor(a.child).extraLeft > 0);
  // The paid pool's ceiling: families with a plan x FAMILY_MONTHLY_AI_USD, capped by AI_PAID_MONTHLY_BUDGET_USD.
  const fams = B.entitledOwnerCount('family');
  assert.ok(fams >= 1);
  assert.equal(aiBudget.paidMonthly(), fams * 10);
  config.aiPaidMonthlyBudgetUsd = 0.5;
  assert.equal(aiBudget.paidMonthly(), 0.5);
  aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 100_000 }, today(), 'paid');   // $1 from the paid pool
  assert.equal(aiBudget.ok('paid'), false);
  al = usage.allowanceFor(a.child);
  assert.equal(al.extraLeft, 0); assert.equal(al.source, 'free');
  // The paid pool's spend is not the free pool's.
  assert.ok(aiBudget.status(undefined, 'free').today < 1 || aiBudget.status(undefined, 'free').today === aiBudget.spent().today - aiBudget.paidSpent().today);
  q.run("DELETE FROM ai_spend_pool WHERE pool='paid'"); q.run('DELETE FROM ai_spend');
});

test('while the free AI pool rests, a family child builds from the extras (paid pool); others rest', async () => {
  const a = await payingFamily();
  config.anthropicKey = 'sk-test-not-real';
  config.familyMonthlyAiUsd = 50;
  const saved = config.aiDailyBudgetUsd;
  try {
    config.aiDailyBudgetUsd = 0.01;
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 10_000 }, today(), 'free');   // $0.10: the free pool rests
    assert.equal(anthropic.resting('free'), true);
    assert.equal(anthropic.resting('paid'), false);
    const al = usage.allowanceFor(a.child);
    assert.equal(al.freeLeft, 3);
    assert.equal(al.source, `family:${a.fam.id}`, 'extras even before the free ones are used');
    assert.equal(al.pool, 'paid');
    assert.equal(usage.allowanceFor(kid()).pool, 'free');
    // The hard ceiling stops both pools.
    config.aiHardMonthlyUsd = 0.05;
    assert.equal(aiBudget.status(undefined, 'paid').reason, 'hard');
    assert.equal(anthropic.resting('paid'), true);
  } finally { config.aiDailyBudgetUsd = saved; q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); }
});

test('the Studio counter: free left of the daily ones, plus the extras this month (numbers only)', async () => {
  const a = await payingFamily();
  assert.deepEqual(usage.counter(a.child), { turnsLeft: 7, freeLeft: 3, extraLeft: 5, classContext: false });
  assert.deepEqual(usage.counter(kid()), { turnsLeft: 3, freeLeft: 3, extraLeft: null, classContext: false });
});

// ---------------------------------------------------------------- pages
test('/family: Subscribe buttons with prices, what to read before paying, the password field only when needed', async () => {
  const f = family({ fresh: false });
  // No plan picked: the Free plan card and a way to the plans page, nothing to pay.
  let page = (await call(f.who, '/family')).text;
  assert.match(page, /class="planchip">Free plan</);
  assert.match(page, /<a class="btn btn-primary" href="\/plans">See plans<\/a>/);
  assert.doesNotMatch(page, /data-api="\/api\/billing\/family\/checkout"/);
  page = (await call(f.who, '/family?plan=family&interval=month')).text;
  assert.match(page, /Start your Family plan/);
  assert.match(page, /Subscribe: \$7\.99 a month/);
  assert.match(page, /Subscribe: \$69\.00 a year/);
  assert.match(page, /renews automatically/);
  assert.match(page, /Cancel anytime/);
  assert.match(page, /within 14 days of your first payment or of a yearly renewal/);
  assert.match(page, /One child can use up to 4 extra messages a day/);
  assert.match(page, /id="pw-checkout"/);
  // The Terms and refund policy are linked above the Subscribe buttons; "By subscribing, you agree" only once published.
  const body = p => p.slice(0, p.indexOf('<footer'));
  assert.match(body(page), /Plans are covered by our <a href="\/terms">Terms of Service<\/a> and our <a href="\/refunds">/);
  assert.doesNotMatch(body(page), /By subscribing, you agree/, 'no agreement line until /terms is published');
  assert.match(page, /<div class="field" data-reauth >/, 'shown while not fresh');
  C.markReauth(f.who.sid);
  config.termsPublished = true;
  page = (await call(f.who, '/family?plan=family')).text;
  // Fresh: the field is still in the form, hidden and not required, so a page left open past 10 minutes can ask for it.
  assert.match(page, /<div class="field" data-reauth hidden>/);
  assert.match(page, /id="pw-checkout"/);
  assert.doesNotMatch(page.match(/<input[^>]*id="pw-checkout"[^>]*>/)[0], /required/);
  assert.match(body(page), /By subscribing, you agree to our <a href="\/terms">/);
  // /grown-ups: the limits are stated before buying; "not on sale yet" only for those who can't buy.
  const landing = (await call(f.who, '/grown-ups')).text;
  assert.match(landing, /One child can use up to 4 extra messages a day/);
  assert.match(landing, /<a href="\/terms">Terms of Service<\/a> and our <a href="\/refunds">Refund and Cancellation Policy<\/a>/, '/grown-ups links the terms and the refund policy');
  assert.doesNotMatch(landing, /aren&#39;t on sale yet|aren't on sale yet/);
  assert.match((await call(null, '/grown-ups')).text, /aren&#39;t on sale yet|aren't on sale yet/);
});

test('/admin/billing: read-only, admin only; rows, flags, refund window, events, the Stripe Tax banner', async () => {
  const admin = auth.createUser({ username: `Adm${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  const a = await payingFamily();
  const ch = fake.chargeOf(fake.st.subscriptions.get(a.subId).latest_invoice);
  await fake.emit('charge.dispute.created', fake.dispute(ch.id));
  config.stripeTax = true; fake.st.tax.registrations.length = 0; fake.st.tax.status = 'active';
  await B.checkTax();
  const who = signIn(admin);
  const r = await call(who, '/admin/billing');
  assert.equal(r.status, 200);
  assert.match(r.text, /Stripe: test/);
  assert.match(r.text, /collecting in no state/);
  assert.match(r.text, new RegExp(a.subId));
  assert.match(r.text, /Disputed: cancelled/);
  assert.match(r.text, /charge\.dispute\.created/);
  assert.doesNotMatch(r.text, /<form[^>]*method="post"/i, 'read-only');
  const flagged = await call(who, '/admin/billing?flag=dispute');
  assert.match(flagged.text, new RegExp(a.subId));
  const active = await call(who, '/admin/billing?status=entitled');
  assert.doesNotMatch(active.text, new RegExp(`subscriptions/${a.subId}`));
  assert.match(flagged.text, new RegExp(`subscriptions/${a.subId}`));
  for (const u of [kid(), a.g]) assert.equal((await call(signIn(u), '/admin/billing')).status, 404);
});

test('billing testers are set from /admin (grown-ups only), audited', async () => {
  const admin = auth.createUser({ username: `Adm${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  const who = signIn(admin);
  const g = grownup({ tester: false });
  let r = await call(who, `/api/admin/users/${g.id}/billing-tester`, { method: 'POST', body: { on: true } });
  assert.equal(r.status, 200);
  assert.equal(auth.getUser(g.id).billing_tester, 1);
  assert.equal(JSON.parse(audits('admin.billing.tester', g.id)[0].details).on, true);
  r = await call(who, `/api/admin/users/${g.id}/billing-tester`, { method: 'POST', body: { on: false } });
  assert.equal(auth.getUser(g.id).billing_tester, 0);
  assert.equal((await call(who, `/api/admin/users/${kid().id}/billing-tester`, { method: 'POST', body: { on: true } })).status, 404);
  assert.equal((await call(signIn(g), `/api/admin/users/${g.id}/billing-tester`, { method: 'POST', body: { on: true } })).status, 404);
  const look = await call(who, `/admin?tab=users&username=${g.username}`);
  assert.match(look.text, /Make billing tester/);
});

test('no Stripe key, card number or webhook secret in any log line or error body', async () => {
  const f = family();
  fake.failNextGet(3);
  const lines = []; const silent = process.env.BRB_SILENT; process.env.BRB_SILENT = '0';
  const ow = process.stdout.write; const ew = process.stderr.write;
  const grab = orig => function (chunk, ...rest) { const s = String(chunk); if (s.startsWith('{"t":')) { lines.push(s); return true; } return orig.call(this, chunk, ...rest); };
  process.stdout.write = grab(ow); process.stderr.write = grab(ew);
  let body = '';
  try {
    config.stripeApiKey = 'rk_test_wrongkey';   // every call fails with 401 at the fake
    S._reset();
    const r = await checkout(f.who);
    body = r.text;
    assert.ok([409, 502].includes(r.status), r.text);
  } finally { process.stdout.write = ow; process.stderr.write = ew; process.env.BRB_SILENT = silent; config.stripeApiKey = 'rk_test_fake'; S._reset(); fake.failGets.length = 0; }
  const all = lines.join('') + body;
  for (const secret of ['rk_test_wrongkey', 'rk_test_fake', SECRET]) assert.ok(!all.includes(secret), secret);
});

test('a Builder message of a family child past the free ones: charged to the family, the done event carries the counter', async () => {
  process.env.BRB_MOCK_DELAY_MS = '0';
  const { runTurn } = await import('../../server/builder/agent.js');
  const games = await import('../../server/services/games.js');
  const a = await payingFamily();
  for (let i = 0; i < 3; i++) build(a.child);
  const g = games.createGame(a.child.id, {});
  const events = [];
  const r = await runTurn({ user: a.child, gameId: g.id, text: 'a fox catching apples', provider: 'mock', emit: (name, d) => events.push([name, d]) });
  assert.equal(r.ok, true, JSON.stringify(r));
  const row = q.get('SELECT charged_to, weight FROM builder_turns WHERE game_id=? AND charged_day IS NOT NULL', g.id);
  assert.equal(row.charged_to, `family:${a.fam.id}`);
  const done = events.filter(e => e[0] === 'done').at(-1)[1];
  assert.equal(done.freeLeft, 0); assert.equal(done.extraLeft, 4);
  // All used up (the child's daily ceiling here is 4): the limit says no number and nothing about plans.
  for (let i = 0; i < 3; i++) build(a.child);
  const ev2 = [];
  const r2 = await runTurn({ user: a.child, gameId: g.id, text: 'make it blue', provider: 'mock', emit: (name, d) => ev2.push([name, d]) });
  assert.equal(r2.ok, false);
  const err = ev2.find(e => e[0] === 'error')[1].message;
  assert.equal(err, "You've used today's Builder messages. More tomorrow!");
});

// ---------------------------------------------------------------- review fixes
test('step-up: a locked account (the sign-in lock) takes no password here, and wrong ones count toward that lock', async () => {
  const { who, g } = family({ fresh: false });
  const lockKey = loginLockKey(g.username);
  assert.equal((await checkout(who, { interval: 'month', password: 'wrong-1' })).status, 403);
  assert.equal(count(lockKey), 1, 'a wrong step-up password counts like a sign-in failure');
  for (let i = 1; i < LOGIN.userFails; i++) allow(lockKey, LOGIN.userFails, LOGIN.window);
  assert.equal((await checkout(who, { interval: 'month', password: PW })).status, 429, 'locked: even the right password');
  assert.equal((await call(who, '/api/billing/portal', { method: 'POST', body: { password: PW } })).status, 429);
  assert.equal(C.reauthFresh(who.sid), false);
  assert.equal(count(lockKey), LOGIN.userFails, 'refused tries add nothing more');
});

test('without STRIPE_PMC_FAMILY family plans are not on sale: no Subscribe, no Checkout, a start-up warning and an admin banner', async () => {
  const f = family();
  config.stripePmcFamily = '';
  const before = fake.requests.length;
  const r = await checkout(f.who);
  assert.equal(r.status, 409); assert.match(r.json.error, /can't be bought right now/);
  assert.equal(fake.requests.slice(before).filter(x => x.method === 'POST' && x.path === '/v1/checkout/sessions').length, 0, 'never a session without the Family configuration');
  const page = (await call(f.who, '/family?plan=basic')).text;
  assert.doesNotMatch(page, /data-api="\/api\/billing\/family\/checkout"/);
  assert.match(page, /This plan isn&#39;t on sale yet|This plan isn't on sale yet/);
  assert.match((await call(f.who, '/grown-ups')).text, /aren&#39;t on sale yet|aren't on sale yet/);
  assert.match(parseStripe({ STRIPE_API_KEY: 'rk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x' }).warnings.join(), /STRIPE_PMC_FAMILY is not set/);
  assert.doesNotMatch(parseStripe({ STRIPE_API_KEY: 'rk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PMC_FAMILY: 'pmc_1AbC' }).warnings.join(), /STRIPE_PMC_FAMILY/);
  const admin = auth.createUser({ username: `Adm${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  assert.match((await call(signIn(admin), '/admin/billing')).text, /Family checkout is off: STRIPE_PMC_FAMILY is not set/);
  config.stripePmcFamily = 'pmc_fakefamily';
  assert.doesNotMatch((await call(signIn(admin), '/admin/billing')).text, /Family checkout is off/);
});

test('a plan stuck past its grace stops a new Checkout (fix the payment instead); an old plan recovering late is cancelled and refunded', async () => {
  const a = await payingFamily();
  fake.update(a.subId, { status: 'past_due' });
  await fake.emit('customer.subscription.updated', a.subId);
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, true, 'inside the grace');
  q.run('UPDATE billing_subscriptions SET grace_until=? WHERE stripe_subscription_id=?', Date.now() - 1000, a.subId);
  assert.equal(B.ownerPlan('family', a.fam.id).entitled, false);
  const r = await checkout(a.who);
  assert.equal(r.status, 409); assert.match(r.json.error, /didn't go through\. Update your card in Manage billing/);
  const page = (await call(a.who, '/family')).text;
  assert.doesNotMatch(page, /data-api="\/api\/billing\/family\/checkout"/);
  assert.match(page, /data-api="\/api\/billing\/portal"/);
  // A second plan starts anyway (e.g. a Checkout opened earlier in another tab): it is the family's plan now.
  const cus = B.customerOf('family', a.fam.id);
  const subB = fake.subscription({ customer: cus, metadata: { owner_kind: 'family', owner_id: a.fam.id } });
  await fake.emit('customer.subscription.created', subB.id);
  assert.equal(B.ownerPlan('family', a.fam.id).subscription.stripe_subscription_id, subB.id);
  assert.equal(subRow(subB.id).flag, null);
  // Then the old card's retry succeeds: the old plan is ended and that payment refunded; one plan stays.
  const inv = fake.invoice({ subscription: a.subId, customer: cus, billingReason: 'subscription_cycle' });
  fake.update(a.subId, { status: 'active', latestInvoice: inv.id });
  await fake.emit('invoice.paid', inv.id);
  assert.equal(fake.st.subscriptions.get(a.subId).status, 'canceled');
  assert.ok([...fake.st.refunds.values()].find(x => x.payment_intent === fake.chargeOf(inv.id).payment_intent), 'the late payment is refunded');
  assert.equal(subRow(a.subId).flag, 'duplicate'); assert.equal(subRow(a.subId).status, 'canceled');
  assert.equal(subRow(subB.id).status, 'active'); assert.equal(subRow(subB.id).flag, null);
  assert.equal(B.ownerPlan('family', a.fam.id).subscription.stripe_subscription_id, subB.id);
  const dup = audits('billing.duplicate', `family:${a.fam.id}`);
  assert.equal(dup.length, 1); assert.equal(JSON.parse(dup[0].details).kept, subB.id);
  // A plan that recovers with no other plan stays, as before.
  const c = await payingFamily();
  fake.update(c.subId, { status: 'past_due' }); await fake.emit('customer.subscription.updated', c.subId);
  q.run('UPDATE billing_subscriptions SET grace_until=? WHERE stripe_subscription_id=?', Date.now() - 1000, c.subId);
  fake.update(c.subId, { status: 'active' }); await fake.emit('customer.subscription.updated', c.subId);
  assert.equal(subRow(c.subId).flag, null); assert.equal(B.ownerPlan('family', c.fam.id).entitled, true);
});

test('the paid pool keeps a family\'s share for the month after it stops paying: the others keep their extras', async () => {
  q.run("DELETE FROM ai_spend_pool"); q.run('DELETE FROM ai_spend');
  try {
    const a = await payingFamily(), b = await payingFamily();
    for (let i = 0; i < 3; i++) build(a.child);
    assert.equal(build(a.child, { usd: 0.01 }).source, `family:${a.fam.id}`);
    const ceiling = aiBudget.paidMonthly();
    assert.ok(ceiling >= 8);
    // Paid spend this month: $2 short of the ceiling (more than a lapsed family's $4 share would leave).
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: Math.round((ceiling - 2) * 1e5) }, today(), 'paid');
    fake.update(a.subId, { status: 'canceled' });
    await fake.emit('customer.subscription.deleted', a.subId);
    assert.equal(B.ownerPlan('family', a.fam.id).entitled, false);
    assert.equal(aiBudget.paidMonthly(), ceiling, 'the lapsed family still counts this month');
    assert.equal(aiBudget.ok('paid'), true);
    for (let i = 0; i < 3; i++) build(b.child);
    const al = usage.allowanceFor(b.child);
    assert.equal(al.extraLeft, 5); assert.equal(al.source, `family:${b.fam.id}`);
  } finally { q.run("DELETE FROM ai_spend_pool"); q.run('DELETE FROM ai_spend'); }
});

test('a family child in a school without a plan keeps the extras but sees only "{left} left today" (a class context)', async () => {
  const a = await payingFamily();
  assert.equal(usage.allowanceFor(a.child).familyId, a.fam.id);
  const boss = auth.createUser({ username: `Boss${uid(4)}`, password: 'boss-password-1', role: 'admin' });
  const school = SC.createSchool(boss, { name: `Chk School ${uid(4)}` }).school;
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',?)", school.id, a.child.id, Date.now());
  const al = usage.allowanceFor(a.child);
  assert.equal(al.familyId, a.fam.id); assert.equal(al.extraLeft, null); assert.equal(al.classContext, true);
  assert.deepEqual(usage.counter(a.child), { turnsLeft: 7, freeLeft: 7, extraLeft: null, classContext: true });
  q.run("UPDATE school_members SET status='left', left_at=? WHERE school_id=? AND user_id=?", Date.now(), school.id, a.child.id);
  assert.deepEqual(usage.counter(a.child), { turnsLeft: 7, freeLeft: 3, extraLeft: 5, classContext: false }, 'out of school: the "+N" counter again');
});

test('funnel counts (services/funnel.js): Checkout started once per try; Paid once, from the webhook', async () => {
  const count = step => q.get('SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step=?', step).n;
  const started0 = count('parent.checkout'), paid0 = count('parent.paid');
  const f = family();
  assert.equal((await checkout(f.who)).status, 200);
  assert.equal((await checkout(f.who, { interval: 'year' })).status, 200);
  assert.equal(count('parent.checkout'), started0 + 1, 'clicking again within a day is the same try');
  assert.equal((await checkout(f.who, { interval: 'week' })).status, 400);
  assert.equal(count('parent.checkout'), started0 + 1, 'a refused request does not');
  // A day later it is a new try.
  q.run("UPDATE billing_checkouts SET created_at=created_at-? WHERE owner_kind='family' AND owner_id=?", 2 * 86400e3, f.fam.id);
  assert.equal((await checkout(f.who)).status, 200);
  assert.equal(count('parent.checkout'), started0 + 2);
  assert.equal(count('parent.paid'), paid0);
  const p = await payingFamily();
  assert.equal(count('parent.paid'), paid0 + 1);
  await call(p.who, '/api/billing/status');
  assert.equal(count('parent.paid'), paid0 + 1, 'the return page never counts it twice');
});
