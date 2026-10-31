// Paid plans, chunk 5: school plans (server/services/school-billing.js, routes/school-billing.js, the school page's
// Billing tab, /admin/billing's invoice requests and paper checks, and the school source in server/builder/usage.js).
// Billing is on against the fake Stripe (tests/support/fake-stripe.js), reached through the real stripe SDK; webhooks
// are signed and checked for real. Every key and secret here is a short fake value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_school';
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
const SB = await import('../../server/services/school-billing.js');
const usage = await import('../../server/builder/usage.js');
const turns = await import('../../server/builder/turns.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const anthropic = await import('../../server/builder/anthropic.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const DAY = 86400e3;
const PW = 'admin-school-pass-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcFamily: 'pmc_fakefamily', stripePmcSchool: '', termsPublished: false, billingPublic: true, builderDailyTurns: 3, schoolTurnsPerSeat: 4, schoolMinSeats: 25, schoolDailyCapDefault: 2, schoolSeatAiUsd: 10, familyExtraMessages: 5, familyChildDailyMax: 4, familyMonthlyAiUsd: 4, proTurnWeight: 1, anthropicKey: '', aiPaidMonthlyBudgetUsd: null, aiHardMonthlyUsd: null, contactEmail: 'help@example.com', schoolInvoiceGraceDays: 30 };
test.beforeEach(() => { Object.assign(config, defaults); resetLimits(); fake.violations.length = 0; });

// ---------------------------------------------------------------- helpers
function signIn(u) {
  let c = ''; const sid = auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id);
  return { cookie: c, sid, user: u };
}
async function call(who, path, { method = 'GET', body } = {}) {
  const h = {}; if (who) h.cookie = who.cookie; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
let n = 0;
const boss = auth.createUser({ username: `SBoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
const kid = () => auth.createUser({ username: `Skid${++n}${uid(4)}`, password: 'rainbow-77' });
/** A school with a school admin (a billing tester, password typed again), a teacher and `students` students. */
function school({ students = 3, tester = true, fresh = true } = {}) {
  const s = SC.createSchool(boss, { name: `Sch ${++n} ${uid(4)}` }).school;
  const admin = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms Admin', role: 'admin' }).user;
  auth.setPassword(admin.id, PW);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', admin.id);
  const teacher = SC.createSchoolAccount(boss, s.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
  const kids = Array.from({ length: students }, (_, i) => SC.createSchoolAccount(admin, s.id, { rosterName: `Stu ${i}` }).user);
  const who = signIn(auth.getUser(admin.id));
  if (fresh) C.markReauth(who.sid);
  return { s: SC.getSchool(s.id), admin: auth.getUser(admin.id), teacher, kids, who };
}
const lastPost = path => fake.requests.filter(r => r.method === 'POST' && r.path === path).at(-1);
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND target=?', action, target);
const subRow = id => q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', id);
async function pay(url) {
  const r = await fetch(url, { redirect: 'manual' });
  assert.equal(r.status, 302, await r.text());
  return r.headers.get('location');
}
/** A school that paid by card for `seats` students. */
async function cardSchool(opts = {}) {
  const x = school(opts);
  const r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: opts.seats || 25 } });
  assert.equal(r.status, 200, r.text);
  await pay(r.json.redirect);
  const plan = B.ownerPlan('school', x.s.id);
  assert.equal(plan.entitled, true);
  return { ...x, subId: plan.subscription.stripe_subscription_id };
}
/** One Builder message charged like agent.js does. -> the charge or false */
function build(user, { pro = false, refund = false } = {}) {
  return tx(() => {
    const c = usage.takeTurn(user, today(), { pro });
    if (!c) return false;
    const row = turns.create({ gameId: uid(10), userId: user.id, status: 'done', chargedDay: today(), chargedTo: c.source, weight: c.weight });
    if (refund) turns.refund(row.id);
    return c;
  });
}
const tab = (who, s, extra = '') => call(who, `/school/${s.slug}?tab=billing${extra}`);
/** An invoice request by the school admin. */
const requestBody = (over = {}) => ({ seats: 30, po: 'PO-7781', contactName: 'Pat Bursar', contactEmail: 'bursar@school.example', line1: '1 School Lane', city: 'Springfield', state: 'IL', postalCode: '62701', country: 'US', taxExempt: '1', note: 'Net 30 please', ...over });

// ---------------------------------------------------------------- access
test('the Billing tab and its APIs: school admins and the platform admin only, and only while paid-plan pages are on', async () => {
  const x = school();
  const apis = [['POST', 'checkout'], ['POST', 'seats'], ['POST', 'portal'], ['POST', 'invoice-request'], ['POST', 'invoice-request/cancel'], ['GET', 'status']];
  // The school admin sees the tab.
  let r = await tab(x.who, x.s);
  assert.equal(r.status, 200);
  assert.match(r.text, /href="\/school\/[^"]+\?tab=billing"/);
  assert.match(r.text, /No school plan/);
  // The platform admin too.
  assert.match((await tab(signIn(boss), x.s)).text, /tab=billing/);
  // Teachers, students, kids, grown-ups, guests and the signed-out: no tab, and 404 on every billing API.
  const g = auth.createUser({ username: `SGrown${uid(4)}`, password: 'a-long-password-1', accountType: 'grownup' });
  for (const u of [x.teacher, x.kids[0], kid(), g, auth.createGuest(), null]) {
    const who = u ? signIn(u) : null;
    for (const [method, p] of apis) assert.equal((await call(who, `/api/billing/school/${x.s.id}/${p}`, { method, body: method === 'POST' ? { seats: 25, password: PW } : undefined })).status, 404, `${u ? u.username : 'nobody'} ${p}`);
  }
  // An admin of another school: 404.
  const other = school();
  assert.equal((await call(other.who, `/api/billing/school/${x.s.id}/status`)).status, 404);
  // Paid-plan pages off (no BILLING_PUBLIC, no preview cookie) or billing off: no tab, 404s, and the daily cap can't be set.
  for (const off of [{ billingPublic: false }, { stripeApiKey: '' }]) {
    Object.assign(config, off);
    r = await tab(x.who, x.s);
    assert.doesNotMatch(r.text, /tab=billing"/, JSON.stringify(off));
    assert.match(r.text, /No classes yet|class/i, 'falls back to the Classes tab');
    for (const [method, p] of apis) assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/${p}`, { method, body: method === 'POST' ? { seats: 25 } : undefined })).status, 404);
    assert.equal((await call(x.who, `/api/schools/${x.s.id}/settings`, { method: 'POST', body: { builderDailyCap: 40 } })).status, 404);
    Object.assign(config, defaults);
  }
});

test('test mode: only billing testers (and the platform admin) may pay; paying needs the password again', async () => {
  const x = school({ tester: false });
  let r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  assert.equal(r.status, 403); assert.match(r.json.error, /aren't on sale/);
  assert.match((await tab(x.who, x.s)).text, /School plans aren&#39;t on sale yet|School plans aren't on sale yet/);
  assert.doesNotMatch((await tab(x.who, x.s)).text, /data-api="\/api\/billing\/school\/[^"]+\/checkout"/);
  assert.equal(C.mayBill({ role: 'admin' }), true, 'the platform admin');
  // A tester without a fresh password: asked for it.
  const y = school({ fresh: false });
  r = await call(y.who, `/api/billing/school/${y.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  assert.equal(r.status, 403); assert.equal(r.json.needPassword, true);
  r = await call(y.who, `/api/billing/school/${y.s.id}/checkout`, { method: 'POST', body: { seats: 25, password: 'wrong-password-1' } });
  assert.equal(r.status, 403); assert.equal(r.json.field, 'password');
  r = await call(y.who, `/api/billing/school/${y.s.id}/checkout`, { method: 'POST', body: { seats: 25, password: PW } });
  assert.equal(r.status, 200, r.text);
  // Billing testers can now be school staff too (set on /admin), never students.
  const admin = signIn(boss);
  assert.equal((await call(admin, `/api/admin/users/${y.teacher.id}/billing-tester`, { method: 'POST', body: { on: true } })).status, 200);
  assert.equal(auth.getUser(y.teacher.id).billing_tester, 1);
  assert.equal((await call(admin, `/api/admin/users/${y.kids[0].id}/billing-tester`, { method: 'POST', body: { on: true } })).status, 404);
  assert.match((await call(admin, `/admin?tab=users&username=${x.admin.username}`)).text, /Make billing tester/);
});

// ---------------------------------------------------------------- card Checkout
test('card Checkout: quantity = students, the seat price by lookup key, flexible billing, our ids, never payment_method_types', async () => {
  const x = school();
  let r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 24 } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'seats'); assert.match(r.json.error, /25/);
  assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 'lots' } })).status, 400);
  r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 32 } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, new RegExp(`^${fake.url}/pay/cs_test_`));
  const p = lastPost('/v1/checkout/sessions').params;
  assert.equal(p.mode, 'subscription');
  assert.deepEqual(p.line_items, [{ price: 'price_fake_school_seat_yearly', quantity: '32' }]);
  assert.equal(p.client_reference_id, x.s.id);
  assert.deepEqual(p.metadata, { owner_kind: 'school', owner_id: x.s.id });
  assert.deepEqual(p.subscription_data, { metadata: { owner_kind: 'school', owner_id: x.s.id }, billing_mode: { type: 'flexible' } });
  assert.equal(p.integration_identifier, S.INTEGRATION_IDS.school);
  assert.match(p.integration_identifier, /^oomba_school_[a-z]{8}$/);
  assert.equal(p.billing_address_collection, 'required');
  assert.equal(p.allow_promotion_codes, 'true');
  assert.match(p.success_url, new RegExp(`/school/${x.s.slug}\\?tab=billing&checkout=\\{CHECKOUT_SESSION_ID\\}$`));
  assert.equal(p.payment_method_configuration, undefined, 'no STRIPE_PMC_SCHOOL: the account default');
  assert.equal(String(p.managed_payments?.enabled), 'false', 'we are the seller, never Managed Payments');
  assert.equal(p.automatic_tax, undefined, 'no STRIPE_TAX: no automatic_tax');
  assert.equal(p.payment_method_types, undefined);
  // The Customer: ours, with the school's id only (no name or email from us at this point).
  const cus = fake.st.customers.get(p.customer);
  assert.deepEqual(cus.metadata, { owner_kind: 'school', owner_id: x.s.id, school_id: x.s.id });
  assert.equal(B.ownerOfCustomer(p.customer).owner_id, x.s.id);
  // STRIPE_PMC_SCHOOL and STRIPE_TAX when set; one open session (the earlier one is expired).
  config.stripePmcSchool = 'pmc_fakeschool'; config.stripeTax = true;
  const first = q.get("SELECT session_id FROM billing_checkouts WHERE owner_kind='school' AND owner_id=?", x.s.id).session_id;
  r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  assert.equal(r.status, 200);
  const p2 = lastPost('/v1/checkout/sessions').params;
  assert.equal(p2.payment_method_configuration, 'pmc_fakeschool');
  assert.deepEqual(p2.automatic_tax, { enabled: 'true' });
  assert.equal(fake.st.sessions.get(first).status, 'expired');
  assert.equal(audits('billing.checkout.start', `school:${x.s.id}`).length, 2);
  assert.deepEqual(fake.violations, []);
  assert.equal(parseStripe({ STRIPE_PMC_SCHOOL: 'card' }).errors.some(e => /STRIPE_PMC_SCHOOL/.test(e)), true);
  assert.equal(parseStripe({ STRIPE_PMC_SCHOOL: 'pmc_abc123' }).pmcSchool, 'pmc_abc123');
});

test('paying by card: the webhook turns the plan on; the pool is the paid students; the return page waits, then shows it', async () => {
  const x = school({ students: 4 });
  const r = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  const back = await pay(r.json.redirect);
  assert.match(back, /tab=billing&checkout=cs_test_/);
  const plan = B.ownerPlan('school', x.s.id);
  assert.equal(plan.entitled, true);
  const row = plan.subscription;
  assert.equal(row.plan, 'school'); assert.equal(row.quantity, 25); assert.equal(row.pool_quantity, 25);
  assert.equal(row.pool_period_start, row.current_period_start);
  assert.deepEqual(SB.poolOf(x.s.id), { seats: 25, size: 100, used: 0, left: 100, from: row.current_period_start, until: row.current_period_end, via: 'subscription' });
  assert.equal(audits('billing.school.pool', `school:${x.s.id}`).length, 1);
  // The return page and its poll.
  const sid = new URL(back).searchParams.get('checkout');
  const st = await call(x.who, `/api/billing/school/${x.s.id}/status?checkout=${sid}`);
  assert.deepEqual(st.json, { state: 'active' });
  const page = await tab(x.who, x.s, `&checkout=${sid}`);
  assert.match(page.text, /Your school plan is active/);
  assert.match(page.text, /School plan for 25 students/);
  assert.match(page.text, /100 of 100 Builder messages left until/);
  assert.match(page.text, /Change students/);
  assert.match(page.text, /Manage billing/);
  assert.doesNotMatch(page.text, /data-api="[^"]+\/checkout"/, 'no second Checkout');
  assert.doesNotMatch(page.text, /About 0 Builder lessons|about 0 Builder/, 'no lesson count below one lesson');
  config.schoolTurnsPerSeat = 100;
  const t100 = (await tab(x.who, x.s)).text;
  assert.match(t100, /about 10 Builder lessons a year for each paid student/);
  assert.match(t100, /About 10 Builder lessons for your paid students/);
  config.schoolTurnsPerSeat = 4;
  // A second Checkout is refused while the plan is on.
  const again = await call(x.who, `/api/billing/school/${x.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  assert.equal(again.status, 409); assert.match(again.json.error, /already has a plan/);
  // Another school's session id is not this school's.
  const y = school();
  const r2 = await call(y.who, `/api/billing/school/${y.s.id}/checkout`, { method: 'POST', body: { seats: 25 } });
  const sid2 = new URL(r2.json.redirect).pathname.split('/').pop();
  assert.deepEqual((await call(x.who, `/api/billing/school/${x.s.id}/status?checkout=${sid2}`)).json, { state: 'active' });
  assert.deepEqual((await call(y.who, `/api/billing/school/${y.s.id}/status?checkout=${sid}`)).json, { state: 'not_yours' });
  assert.equal(B.ownerPlan('school', y.s.id).entitled, false);
});

test('a delayed (ACH) payment: Checkout completes unpaid and grants nothing until it arrives', async () => {
  const x = school();
  const cus = await C.ownerCustomer('school', x.s.id);
  const sub = fake.subscription({ customer: cus, lookupKey: 'oomba_school_seat_yearly', quantity: 25, invoice: 'open' });
  const sess = fake.session({ customer: cus, subscription: sub.id, paymentStatus: 'unpaid', metadata: { owner_kind: 'school', owner_id: x.s.id }, clientReferenceId: x.s.id });
  assert.equal((await fake.emit('checkout.session.completed', sess.id)).status, 200);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, false);
  assert.equal(SB.poolOf(x.s.id), null);
  assert.match((await tab(x.who, x.s)).text, /The payment is on its way/);
  fake.payInvoice(sub.latest_invoice); sess.payment_status = 'paid';
  assert.equal((await fake.emit('checkout.session.async_payment_succeeded', sess.id)).status, 200);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, true);
  assert.equal(SB.poolOf(x.s.id).seats, 25);
});

// ---------------------------------------------------------------- the school's allowance
test('students and staff of a paying school build from the pool (paid AI pool), up to the daily cap; counters show no totals', async () => {
  const x = await cardSchool({ students: 2 });
  const [a, b] = x.kids;
  // Daily cap: the school's setting (2 here by default) is below the free 3, so 3.
  let al = usage.allowanceFor(a);
  assert.deepEqual({ source: al.source, pool: al.pool, daily: al.daily, left: al.left, classContext: al.classContext, extraLeft: al.extraLeft, schoolId: al.schoolId },
    { source: `school:${x.s.id}`, pool: 'paid', daily: 3, left: 3, classContext: true, extraLeft: null, schoolId: x.s.id });
  assert.deepEqual(usage.counter(a), { turnsLeft: 3, freeLeft: 3, extraLeft: null, classContext: true });
  for (let i = 0; i < 3; i++) assert.deepEqual(build(a), { source: `school:${x.s.id}`, pool: 'paid', weight: 1 });
  assert.equal(build(a), false, 'the daily cap');
  assert.equal(usage.limitMessage(a, k => k), 'builder.errors.limitClass', 'the class, no number');
  assert.equal(SB.poolOf(x.s.id).used, 3);
  // A refunded build gives its message back to the pool.
  build(b, { refund: true });
  assert.equal(SB.poolOf(x.s.id).used, 3);
  // Teachers use the same pool.
  assert.equal(build(x.teacher).source, `school:${x.s.id}`);
  // A higher setting raises the cap (never below the free ones).
  const set = await call(x.who, `/api/schools/${x.s.id}/settings`, { method: 'POST', body: { builderDailyCap: 6 } });
  assert.equal(set.status, 200, set.text);
  assert.equal(SB.effectiveCap(SC.getSchool(x.s.id)), 6);
  assert.equal(usage.allowanceFor(a).left, 3);
  for (const bad of [0, 501, 'many', 2.5]) assert.equal((await call(x.who, `/api/schools/${x.s.id}/settings`, { method: 'POST', body: { builderDailyCap: bad } })).status, 400, String(bad));
  // The pool runs out (4 per seat x 25 = 100): then the free daily messages, never a family's extras.
  turns.create({ gameId: uid(10), userId: x.teacher.id, status: 'done', chargedDay: today(), chargedTo: `school:${x.s.id}`, weight: 96 });
  assert.equal(SB.poolOf(x.s.id).left, 0);
  al = usage.allowanceFor(b);
  assert.equal(al.source, 'free'); assert.equal(al.pool, 'free'); assert.equal(al.classContext, true);
  assert.equal(al.left, 3 - 0, 'b had one refunded message: the free ones are left');
  // A student who has their own account and is a family child: the school's pool, never the family's extras.
  const y = await cardSchool({ students: 0 });
  const child = kid();
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',?)", y.s.id, child.id, Date.now());
  const fam = F.ensureFamily(auth.createUser({ username: `SPar${uid(4)}`, password: 'a-long-password-1', accountType: 'grownup' }));
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", fam.id, child.id, Date.now(), Date.now());
  q.run(`INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?,?,?,?,?,?)`, uid(10), 'family', fam.id, 'family', Date.now() + DAY, Date.now());
  assert.equal(usage.familyOf(child.id), null);
  assert.equal(usage.allowanceFor(child).source, `school:${y.s.id}`);
});

test('a paying school builds while the free AI pool rests; the paid pool\'s ceiling counts the school\'s paid students', async () => {
  const x = await cardSchool({ students: 1 });
  const saved = config.aiDailyBudgetUsd;
  try {
    assert.ok(SB.schoolsPaidMonthlyUsd() >= 25 * 10 / 12, String(SB.schoolsPaidMonthlyUsd()));
    assert.ok(aiBudget.paidMonthly() >= 25 * 10 / 12);
    config.anthropicKey = 'sk-test-not-real';
    config.aiDailyBudgetUsd = 0.01;
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 10_000 }, today(), 'free');
    assert.equal(anthropic.resting('free'), true);
    const al = usage.allowanceFor(x.kids[0]);
    assert.equal(al.pool, 'paid'); assert.equal(anthropic.resting(al.pool), false);
    assert.equal(usage.allowanceFor(kid()).pool, 'free', 'everyone else rests');
  } finally { config.aiDailyBudgetUsd = saved; q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); }
});

test('a student of a school without a plan: the free allowance, "{left} left today" with no total, the class limit message', () => {
  const x = school({ students: 1 });
  const al = usage.allowanceFor(x.kids[0]);
  assert.equal(al.source, 'free'); assert.equal(al.classContext, true);
  assert.deepEqual(usage.counter(x.kids[0]), { turnsLeft: 3, freeLeft: 3, extraLeft: null, classContext: true });
  assert.equal(usage.allowanceFor(x.teacher).classContext, false, 'staff of an unpaid school: their own counter');
  assert.equal(usage.allowanceFor(kid()).classContext, false);
  for (let i = 0; i < 3; i++) build(x.kids[0]);
  assert.equal(usage.limitMessage(x.kids[0], k => k), 'builder.errors.limitClass');
});

test('a grant pays a school\'s pool for a year from its date (and each anniversary)', () => {
  const x = school({ students: 1 });
  const created = Date.now() - 400 * DAY;
  q.run('INSERT INTO billing_grants(id, owner_kind, owner_id, plan, seats, until, created_at) VALUES (?,?,?,?,?,?,?)', uid(10), 'school', x.s.id, 'school', 30, Date.now() + 100 * DAY, created);
  const pool = SB.poolOf(x.s.id);
  assert.equal(pool.via, 'grant'); assert.equal(pool.seats, 30); assert.equal(pool.size, 120);
  assert.equal(pool.from, created + 365 * DAY, 'the latest anniversary');
  assert.equal(usage.allowanceFor(x.kids[0]).source, `school:${x.s.id}`);
});

// ---------------------------------------------------------------- seats
test('more students: billed straight away (always_invoice, pending_if_incomplete); the pool grows only once paid', async () => {
  const x = await cardSchool();
  let r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 30 } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.toast, /30 students/);
  const p = lastPost(`/v1/subscriptions/${x.subId}`).params;
  assert.equal(p.items[0].quantity, '30'); assert.equal(p.items[0].id, fake.st.subscriptions.get(x.subId).items.data[0].id);
  assert.equal(p.proration_behavior, 'always_invoice'); assert.equal(p.payment_behavior, 'pending_if_incomplete');
  assert.equal(p.payment_method_types, undefined);
  let row = subRow(x.subId);
  assert.equal(row.quantity, 30); assert.equal(row.pool_quantity, 30);
  assert.equal(SB.poolOf(x.s.id).size, 120);
  assert.equal(JSON.parse(audits('billing.seats', `school:${x.s.id}`).at(-1).details).to, 30);
  // A card payment that fails: the seats stay, the pool too.
  fake.failNextPayment();
  r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 40 } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /didn't go through/);
  row = subRow(x.subId);
  assert.equal(row.quantity, 30); assert.equal(row.pool_quantity, 30);
  // The same number: nothing to do. Below the minimum: refused.
  assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 30 } })).status, 400);
  assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 10 } })).status, 400);
  assert.deepEqual(fake.violations, []);
});

test('fewer students wait for the renewal (next_quantity); the renewal job applies them just before it, with no proration', async () => {
  const x = await cardSchool({ seats: 30 });
  const before = fake.requests.length;
  let r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 26 } });
  assert.equal(r.status, 200); assert.match(r.json.toast, /Next year: 26 students/);
  assert.equal(fake.requests.slice(before).filter(q2 => q2.method === 'POST').length, 0, 'nothing at Stripe yet');
  let row = subRow(x.subId);
  assert.equal(row.quantity, 30); assert.equal(row.next_quantity, 26); assert.equal(row.pool_quantity, 30, 'never lowered mid-period');
  // The sync keeps next_quantity.
  await B.syncSubscription(x.subId);
  assert.equal(subRow(x.subId).next_quantity, 26);
  // Far from the renewal: the job waits.
  assert.deepEqual(await SB.renewalJob(), { applied: 0, errors: 0 });
  // Two days before: applied with proration_behavior=none, then cleared.
  fake.update(x.subId, { periodEnd: Date.now() + DAY });
  await B.syncSubscription(x.subId);
  assert.deepEqual(await SB.renewalJob(), { applied: 1, errors: 0 });
  const p = lastPost(`/v1/subscriptions/${x.subId}`).params;
  assert.equal(p.items[0].quantity, '26'); assert.equal(p.proration_behavior, 'none'); assert.equal(p.payment_behavior, undefined);
  row = subRow(x.subId);
  assert.equal(row.quantity, 26); assert.equal(row.next_quantity, null); assert.equal(row.pool_quantity, 30, 'the pool stays until the period ends');
  // The renewal: a new period paid for 26.
  fake.renew(x.subId);
  await B.syncSubscription(x.subId);
  row = subRow(x.subId);
  assert.equal(row.pool_quantity, 26); assert.equal(row.pool_period_start, row.current_period_start);
  assert.equal(SB.poolOf(x.s.id).used, 0, 'a new year, a full pool');
  assert.equal(audits('billing.seats.renewal', `school:${x.s.id}`).length, 1);
});

test('the pool grows only on the invoice that covers the seats (poolFor)', () => {
  const card = { collection_method: 'charge_automatically', pending_update: null };
  const send = { collection_method: 'send_invoice', pending_update: null };
  const prev = { pool_quantity: 30, pool_period_start: 1000, latest_invoice_id: 'in_old', latest_invoice_status: 'paid' };
  // The same paid invoice as last time, more seats (next year's seats applied early, a Dashboard change): no growth.
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_old', status: 'paid' }, quantity: 60, periodStart: 1000, prev }), { quantity: 30, periodStart: 1000 });
  assert.deepEqual(B.poolFor({ plan: 'school', sub: send, li: { id: 'in_old', status: 'paid' }, quantity: 60, periodStart: 1000, prev }), { quantity: 30, periodStart: 1000 });
  // A new paid invoice (the seat change's): the pool grows to the seats.
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_new', status: 'paid' }, quantity: 60, periodStart: 1000, prev }), { quantity: 60, periodStart: 1000 });
  // The invoice just became paid: grows too. Unpaid, or a pending update: not yet.
  assert.equal(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_old', status: 'paid' }, quantity: 60, periodStart: 1000, prev: { ...prev, latest_invoice_status: 'open' } }).quantity, 60);
  assert.equal(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_new', status: 'open' }, quantity: 60, periodStart: 1000, prev }).quantity, 30);
  assert.equal(B.poolFor({ plan: 'school', sub: { ...card, pending_update: { expires_at: 1 } }, li: { id: 'in_new', status: 'paid' }, quantity: 60, periodStart: 1000, prev }).quantity, 30);
  // With the invoice's lines, their quantity decides, whatever the sync order.
  const lines = n => ({ object: 'list', has_more: false, data: [{ quantity: n }] });
  assert.equal(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_new', status: 'paid', lines: lines(30) }, quantity: 60, periodStart: 1000, prev }).quantity, 30);
  assert.equal(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_old', status: 'paid', lines: lines(60) }, quantity: 60, periodStart: 1000, prev }).quantity, 60);
  // Never down within a period.
  assert.equal(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_new', status: 'paid' }, quantity: 25, periodStart: 1000, prev }).quantity, 30);
});

test('a new period: until its invoice is paid the old pool carries over and keeps counting from the old start (poolFor)', () => {
  const card = { collection_method: 'charge_automatically', pending_update: null };
  const prev = { pool_quantity: 30, pool_period_start: 1000, latest_invoice_id: 'in_old', latest_invoice_status: 'paid' };
  for (const status of ['open', 'draft']) assert.deepEqual(B.poolFor({ plan: 'school', sub: { ...card, status: 'past_due' }, li: { id: 'in_renew', status }, quantity: 30, periodStart: 2000, prev }), { quantity: 30, periodStart: 1000 }, status);
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_old', status: 'paid' }, quantity: 30, periodStart: 2000, prev }), { quantity: 30, periodStart: 1000 }, 'last year\'s invoice pays nothing this year');
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_renew', status: 'paid' }, quantity: 26, periodStart: 2000, prev }), { quantity: 26, periodStart: 2000 }, 'paid: the new year starts');
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_renew', status: 'open' }, quantity: 20, periodStart: 2000, prev }), { quantity: 20, periodStart: 1000 }, 'never above the new seats');
  // send_invoice: a finalized renewal invoice starts the new year.
  assert.deepEqual(B.poolFor({ plan: 'school', sub: { collection_method: 'send_invoice', pending_update: null }, li: { id: 'in_renew', status: 'open' }, quantity: 30, periodStart: 2000, prev }), { quantity: 30, periodStart: 2000 });
  // A first sync: the period it is in.
  assert.deepEqual(B.poolFor({ plan: 'school', sub: card, li: { id: 'in_1', status: 'open' }, quantity: 30, periodStart: 2000, prev: null }), { quantity: 0, periodStart: 2000 });
});

test('more students for next year: the renewal job applies them with no invoice, and the pool waits for the renewal invoice', async () => {
  const x = await cardSchool({ seats: 30, students: 1 });
  build(x.kids[0]);
  let r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 40, when: 'renewal' } });
  assert.equal(r.status, 200, r.text);
  fake.update(x.subId, { periodEnd: Date.now() + DAY });
  await B.syncSubscription(x.subId);
  assert.deepEqual(await SB.renewalJob(), { applied: 1, errors: 0 });
  let row = subRow(x.subId);
  assert.equal(row.quantity, 40); assert.equal(row.pool_quantity, 30, 'not paid for: the pool stays');
  await B.syncSubscription(x.subId);
  assert.equal(subRow(x.subId).pool_quantity, 30, 'a later sync changes nothing');
  assert.equal(SB.poolOf(x.s.id).size, 30 * 4);
  // The renewal invoice for 40 is paid: the new year's pool.
  fake.renew(x.subId);
  await B.syncSubscription(x.subId);
  row = subRow(x.subId);
  assert.equal(row.pool_quantity, 40); assert.equal(row.pool_period_start, row.current_period_start);
  assert.equal(SB.poolOf(x.s.id).used, 0);
  void r;
});

test('a card renewal that fails: the past-due school keeps what was left of last year\'s pool, not a fresh one', async () => {
  const x = await cardSchool({ seats: 25, students: 1 });
  const before = subRow(x.subId).pool_period_start;
  for (let i = 0; i < 2; i++) build(x.kids[0]);
  assert.equal(SB.poolOf(x.s.id).used, 2);
  fake.renew(x.subId, { paid: false });
  await B.syncSubscription(x.subId);
  const row = subRow(x.subId);
  assert.equal(row.status, 'past_due'); assert.equal(B.ownerPlan('school', x.s.id).entitled, true, 'in grace');
  assert.equal(row.pool_quantity, 25); assert.equal(row.pool_period_start, before, 'the old start');
  assert.equal(SB.poolOf(x.s.id).used, 2, 'used is not reset');
  assert.equal(SB.poolOf(x.s.id).left, 25 * 4 - 2);
});

test('the renewal reminder: 30 days ahead, next year\'s students proposed from today\'s count', async () => {
  const x = await cardSchool({ students: 28 });
  assert.doesNotMatch((await tab(x.who, x.s)).text, /id="renewal"/);
  fake.update(x.subId, { periodEnd: Date.now() + 20 * DAY });
  await B.syncSubscription(x.subId);
  const page = (await tab(x.who, x.s)).text;
  assert.match(page, /id="renewal"/);
  assert.match(page, /renews on .* for 25 students\. You have 28 students now\./);
  assert.match(page, /id="seats-next"[^>]*value="28"/);
  // "You have N students, M paid" at 110%.
  assert.match(page, /You have 28 students, 25 paid\./);
  const r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 28, when: 'renewal' } });
  assert.equal(r.status, 200);
  assert.equal(subRow(x.subId).next_quantity, 28);
  assert.match((await tab(x.who, x.s)).text, /Next year: 28 students\./);
});

// ---------------------------------------------------------------- invoices (D7)
test('an invoice request: checked, stored, audited without the contact\'s details, one open at a time, can be withdrawn', async () => {
  const x = school();
  const api = `/api/billing/school/${x.s.id}/invoice-request`;
  for (const [over, field] of [[{ seats: 3 }, 'seats'], [{ contactName: '' }, 'contactName'], [{ contactEmail: 'nope' }, 'contactEmail'], [{ line1: '' }, 'line1'], [{ city: '' }, 'city'], [{ postalCode: '' }, 'postalCode'], [{ country: 'USA' }, 'country']]) {
    const r = await call(x.who, api, { method: 'POST', body: requestBody(over) });
    assert.equal(r.status, 400, JSON.stringify(over)); assert.equal(r.json.field, field);
  }
  let r = await call(x.who, api, { method: 'POST', body: requestBody() });
  assert.equal(r.status, 200, r.text);
  const req = SB.openRequestOf(x.s.id);
  assert.equal(req.seats, 30); assert.equal(req.po, 'PO-7781'); assert.equal(req.contact_email, 'bursar@school.example'); assert.equal(req.tax_exempt_claimed, 1);
  assert.deepEqual(JSON.parse(req.address_json), { line1: '1 School Lane', line2: '', city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' });
  const a = audits('billing.school.request', `school:${x.s.id}`);
  assert.equal(a.length, 1); assert.doesNotMatch(a[0].details, /bursar|Pat|Lane/);
  assert.equal((await call(x.who, api, { method: 'POST', body: requestBody() })).status, 409, 'one open request');
  const page = (await tab(x.who, x.s)).text;
  assert.match(page, /Invoice requested on .* for 30 students\. We will send it to/);
  r = await call(x.who, `${api}/cancel`, { method: 'POST', body: {} });
  assert.equal(r.status, 200);
  assert.equal(SB.openRequestOf(x.s.id), null);
  assert.equal((await call(x.who, `${api}/cancel`, { method: 'POST', body: {} })).status, 404);
});

test('Create invoice subscription (owner): the Customer with address, contact and PO, send_invoice net 30, the plan on at once', async () => {
  const x = school({ students: 2 });
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() });
  const req = SB.openRequestOf(x.s.id);
  const admin = signIn(boss);
  let page = await call(admin, '/admin/billing');
  assert.match(page.text, /School invoice requests/);
  assert.match(page.text, new RegExp(x.s.name));
  assert.match(page.text, /PO-7781/); assert.match(page.text, /bursar@school\.example/); assert.match(page.text, /1 School Lane, Springfield, IL, 62701, US/);
  assert.match(page.text, /they say so: wait for the exemption certificate/);
  assert.match(page.text, /Create invoice subscription/);
  // Not for anyone but the platform admin.
  assert.equal((await call(x.who, `/api/admin/billing/requests/${req.id}/invoice-subscription`, { method: 'POST', body: {} })).status, 404);
  // Created without ticking "exemption certificate received": no tax_exempt.
  const r = await call(admin, `/api/admin/billing/requests/${req.id}/invoice-subscription`, { method: 'POST', body: { seats: '30' } });
  assert.equal(r.status, 200, r.text);
  const cusPost = fake.requests.filter(q2 => q2.method === 'POST' && q2.path === '/v1/customers').at(-1).params;
  assert.equal(cusPost.name, x.s.name); assert.equal(cusPost.email, 'bursar@school.example');
  assert.deepEqual(cusPost.address, { line1: '1 School Lane', city: 'Springfield', state: 'IL', postal_code: '62701', country: 'US' });
  assert.deepEqual(cusPost.invoice_settings, { custom_fields: [{ name: 'PO number', value: 'PO-7781' }] });
  assert.equal(cusPost.tax_exempt, undefined);
  assert.deepEqual(cusPost.metadata, { owner_kind: 'school', owner_id: x.s.id, school_id: x.s.id });
  const p = lastPost('/v1/subscriptions').params;
  assert.equal(p.collection_method, 'send_invoice'); assert.equal(p.days_until_due, '30');
  assert.deepEqual(p.items, [{ price: 'price_fake_school_seat_yearly', quantity: '30' }]);
  assert.equal(p.metadata.school_id, x.s.id); assert.equal(p.metadata.owner_kind, 'school'); assert.equal(p.metadata.po, 'PO-7781'); assert.equal(p.metadata.billing_request, req.id);
  assert.deepEqual(p.billing_mode, { type: 'flexible' });
  assert.equal(p.automatic_tax, undefined, 'no STRIPE_TAX');
  assert.equal(p.payment_settings, undefined, 'how to pay an invoice is set in the Dashboard');
  assert.equal(lastPost('/v1/subscriptions').idempotencyKey, `invoice-sub-${req.id}-30`, 'the key carries the students');
  assert.equal(fake.requests.filter(q2 => q2.method === 'POST' && q2.path === '/v1/customers').at(-1).idempotencyKey, `customer-invoice-create-${req.id}-0`, 'and the exemption box');
  // The plan is on (invoice sent, net 30); the pool is the invoiced students.
  const plan = B.ownerPlan('school', x.s.id);
  assert.equal(plan.entitled, true); assert.equal(plan.subscription.collection_method, 'send_invoice');
  assert.equal(plan.subscription.pool_quantity, 30);
  assert.equal(usage.allowanceFor(x.kids[0]).source, `school:${x.s.id}`);
  assert.equal(q.get('SELECT status FROM billing_requests WHERE id=?', req.id).status, 'done');
  assert.equal(JSON.parse(audits('admin.billing.invoice_create', `school:${x.s.id}`)[0].details).subscription, plan.subscription.stripe_subscription_id);
  // The school sees it, with the open invoice.
  const t = (await tab(x.who, x.s)).text;
  assert.match(t, /School plan for 30 students/); assert.match(t, /Invoice for \$600\.00, due on/);
  // /admin/billing: the unpaid invoice with "Mark paid by check"; the request is gone.
  page = await call(admin, '/admin/billing');
  assert.doesNotMatch(page.text, new RegExp(`requests/${req.id}/`));
  assert.match(page.text, /Mark paid by check/);
  // Again for the same school: refused (it has a plan).
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() });
  const again = await call(admin, `/api/admin/billing/requests/${SB.openRequestOf(x.s.id).id}/invoice-subscription`, { method: 'POST', body: {} });
  assert.equal(again.status, 409);
  assert.equal((await call(admin, `/api/admin/billing/requests/${SB.openRequestOf(x.s.id).id}/close`, { method: 'POST', body: {} })).status, 200);
  assert.deepEqual(fake.violations, []);
});

test('exempt schools, STRIPE_TAX and an existing Customer: tax_exempt only when ticked, automatic_tax only with STRIPE_TAX=1', async () => {
  const x = school();
  const cus = await C.ownerCustomer('school', x.s.id);   // e.g. an earlier card Checkout
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody({ po: '' }) });
  config.stripeTax = true;
  const reqId = SB.openRequestOf(x.s.id).id;
  const r = await call(signIn(boss), `/api/admin/billing/requests/${reqId}/invoice-subscription`, { method: 'POST', body: { exempt: '1' } });
  assert.equal(r.status, 200, r.text);
  const upd = lastPost(`/v1/customers/${cus}`).params;
  assert.equal(upd.tax_exempt, 'exempt'); assert.equal(upd.email, 'bursar@school.example');
  assert.equal(fake.st.customers.get(cus).tax_exempt, 'exempt');
  const p = lastPost('/v1/subscriptions').params;
  assert.equal(p.customer, cus); assert.deepEqual(p.automatic_tax, { enabled: 'true' }); assert.equal(p.metadata.po, undefined);
  assert.equal(JSON.parse(audits('admin.billing.invoice_create', `school:${x.s.id}`)[0].details).exempt, true);
  assert.equal(lastPost(`/v1/customers/${cus}`).idempotencyKey, `customer-invoice-update-${reqId}-1`, 'the exemption box is in the key');
});

test('Mark paid by check: paid out of band at Stripe, synced, audited; only our schools\' open invoices', async () => {
  const x = school();
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() });
  const admin = signIn(boss);
  await call(admin, `/api/admin/billing/requests/${SB.openRequestOf(x.s.id).id}/invoice-subscription`, { method: 'POST', body: {} });
  const row = B.ownerPlan('school', x.s.id).subscription;
  const [inv] = SB.openInvoicesOf(row);
  assert.ok(inv && inv.id.startsWith('in_'));
  assert.equal((await call(admin, '/api/admin/billing/invoices/in_notours123456/paid-by-check', { method: 'POST', body: {} })).status, 404);
  assert.equal((await call(x.who, `/api/admin/billing/invoices/${inv.id}/paid-by-check`, { method: 'POST', body: {} })).status, 404, 'admin only');
  const r = await call(admin, `/api/admin/billing/invoices/${inv.id}/paid-by-check`, { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text);
  const pay = lastPost(`/v1/invoices/${inv.id}/pay`);
  assert.equal(pay.params.paid_out_of_band, 'true'); assert.equal(pay.idempotencyKey, `oob-${inv.id}`);
  assert.equal(fake.st.invoices.get(inv.id).status, 'paid');
  assert.deepEqual(SB.openInvoicesOf(subRow(row.stripe_subscription_id)), []);
  assert.equal(audits('admin.billing.paid_out_of_band', `school:${x.s.id}`).length, 1);
  // Stripe's invoice.paid afterwards changes nothing more.
  assert.equal((await fake.emit('invoice.paid', inv.id)).status, 200);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, true);
});

test('an invoice school seat increase: the prorated invoice is sent at once and the pool grows (invoiced)', async () => {
  const x = school();
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody({ seats: 25 }) });
  await call(signIn(boss), `/api/admin/billing/requests/${SB.openRequestOf(x.s.id).id}/invoice-subscription`, { method: 'POST', body: {} });
  const subId = B.ownerPlan('school', x.s.id).subscription.stripe_subscription_id;
  const r = await call(x.who, `/api/billing/school/${x.s.id}/seats`, { method: 'POST', body: { seats: 35 } });
  assert.equal(r.status, 200, r.text);
  const p = lastPost(`/v1/subscriptions/${subId}`).params;
  assert.equal(p.proration_behavior, 'always_invoice'); assert.equal(p.payment_behavior, undefined, 'only card schools wait for a payment');
  const row = subRow(subId);
  assert.equal(row.pool_quantity, 35);
  assert.equal(SB.openInvoicesOf(row).length, 2, 'the first invoice and the proration invoice');
});

test('overdue invoice grace (D11): 30 days after the due date, then back to free; nothing is removed (D12)', async () => {
  const x = school({ students: 2 });
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody({ seats: 25 }) });
  await call(signIn(boss), `/api/admin/billing/requests/${SB.openRequestOf(x.s.id).id}/invoice-subscription`, { method: 'POST', body: {} });
  const subId = B.ownerPlan('school', x.s.id).subscription.stripe_subscription_id;
  // Due 10 days ago: still on, with grace to due + 30 days, flagged overdue; the tab and /admin/billing say so.
  const inv = fake.st.invoices.get(fake.st.subscriptions.get(subId).latest_invoice);
  inv.due_date = Math.floor((Date.now() - 10 * DAY) / 1000);
  assert.equal((await fake.emit('invoice.overdue', inv.id)).status, 200);
  let row = subRow(subId);
  assert.equal(row.flag, 'overdue');
  assert.equal(row.grace_until, inv.due_date * 1000 + 30 * DAY);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, true);
  assert.match((await tab(x.who, x.s)).text, /An invoice is overdue\. Pay it by/);
  assert.match((await call(signIn(boss), '/admin/billing')).text, /overdue/);
  // Due 31 days ago: the plan stops; students are back on the free allowance; members and classes stay.
  inv.due_date = Math.floor((Date.now() - 31 * DAY) / 1000);
  await B.syncSubscription(subId);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, false);
  const al = usage.allowanceFor(x.kids[0]);
  assert.equal(al.source, 'free'); assert.equal(al.classContext, true);
  assert.equal(SC.members(x.s.id, 'student').length, 2);
  assert.equal(SC.getSchool(x.s.id).archived_at, null);
  // Paid at last: on again.
  fake.payInvoice(inv.id);
  await fake.emit('invoice.paid', inv.id);
  row = subRow(subId);
  assert.equal(row.grace_until, null); assert.equal(row.flag, null);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, true);
});

test('lapse (D12): a cancelled card plan sends everyone back to the free allowance, nothing removed', async () => {
  const x = await cardSchool({ students: 2 });
  assert.equal(usage.allowanceFor(x.kids[0]).source, `school:${x.s.id}`);
  fake.update(x.subId, { status: 'canceled' });
  assert.equal((await fake.emit('customer.subscription.deleted', x.subId)).status, 200);
  assert.equal(B.ownerPlan('school', x.s.id).entitled, false);
  assert.equal(usage.allowanceFor(x.kids[0]).source, 'free');
  assert.equal(usage.allowanceFor(x.teacher).source, 'free');
  assert.equal(SC.members(x.s.id, 'student').length, 2);
  // A card past_due: 7 days of grace while Stripe retries.
  const y = await cardSchool();
  fake.update(y.subId, { status: 'past_due' });
  await fake.emit('invoice.payment_failed', fake.st.subscriptions.get(y.subId).latest_invoice);
  const row = subRow(y.subId);
  assert.ok(row.grace_until > Date.now() + 6 * DAY && row.grace_until <= Date.now() + 7 * DAY);
  assert.equal(B.ownerPlan('school', y.s.id).entitled, true);
  assert.match((await tab(y.who, y.s)).text, /The last card payment didn&#39;t go through|The last card payment didn't go through/);
});

test('Manage billing: the school\'s own Customer, password again, audited; back to the Billing tab', async () => {
  const x = await cardSchool();
  const r = await call(x.who, `/api/billing/school/${x.s.id}/portal`, { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text);
  const p = lastPost('/v1/billing_portal/sessions').params;
  assert.equal(p.customer, B.customerOf('school', x.s.id));
  assert.match(p.return_url, new RegExp(`/school/${x.s.slug}\\?tab=billing$`));
  assert.equal(audits('billing.portal.open', `school:${x.s.id}`).length, 1);
  const y = school();
  assert.equal((await call(y.who, `/api/billing/school/${y.s.id}/portal`, { method: 'POST', body: {} })).status, 409, 'no Customer yet');
});

test('billing off is today\'s behavior: a school student has the free allowance, the usual counter and limit message, no class pool', () => {
  config.stripeApiKey = '';
  const x = school({ students: 1 });
  const al = usage.allowanceFor(x.kids[0]);
  assert.equal(al.source, 'free'); assert.equal(al.classContext, false);
  assert.deepEqual(SB.schoolSide(x.kids[0].id), { school: null, entitled: false, student: false });
  assert.deepEqual(usage.counter(x.kids[0]), { turnsLeft: 3, freeLeft: 3, extraLeft: null, classContext: false });
  for (let i = 0; i < 3; i++) build(x.kids[0]);
  assert.deepEqual(usage.limitKey(usage.allowanceFor(x.kids[0])), ['builder.errors.limit', { count: 3 }]);
  assert.equal(SB.poolOf(x.s.id), null);
  assert.equal(SB.schoolsPaidMonthlyUsd(), 0);
});

test('invoice requests\' contact details, note and PO number are deleted 2 years after they are closed', async () => {
  const x = school();
  await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() });
  const id = SB.openRequestOf(x.s.id).id;
  SB.closeRequest(boss, id);
  q.run('UPDATE billing_requests SET closed_at=? WHERE id=?', Date.now() - 2 * 366 * DAY, id);
  await SB.renewalJob();
  const r = q.get('SELECT * FROM billing_requests WHERE id=?', id);
  assert.equal(r.contact_email, null); assert.equal(r.address_json, null); assert.equal(r.contact_name, null);
  assert.equal(r.note, '', 'the free-text note too'); assert.equal(r.po, '', 'and the PO number (it is on the Stripe invoice)');
  assert.equal(r.seats, 30, 'the numbers stay');
  // A note alone is cleared too.
  q.run("UPDATE billing_requests SET note='call 555-0100' WHERE id=?", id);
  await SB.renewalJob();
  assert.equal(q.get('SELECT note FROM billing_requests WHERE id=?', id).note, '');
});

test('invoice requests are per Stripe mode: a test-mode leftover never blocks a live request or shows as open', async () => {
  const x = school();
  assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() })).status, 200);
  const id = SB.openRequestOf(x.s.id).id;
  assert.equal(q.get('SELECT livemode FROM billing_requests WHERE id=?', id).livemode, 0);
  assert.ok(SB.openRequests().some(r => r.id === id));
  // The key switches to live: the test request is not open here, and a new one can be made.
  q.run('UPDATE billing_requests SET livemode=1 WHERE id=?', id);   // the same as switching modes, seen from the other side
  assert.equal(SB.openRequestOf(x.s.id), null);
  assert.ok(!SB.openRequests().some(r => r.id === id));
  assert.equal((await call(x.who, `/api/billing/school/${x.s.id}/invoice-request`, { method: 'POST', body: requestBody() })).status, 200);
  assert.notEqual(SB.openRequestOf(x.s.id).id, id);
});

test('the daily cap box shows the cap in force, never accepts less than the free messages, and shows only with a plan', async () => {
  const x = school();
  let page = (await tab(x.who, x.s)).text;
  assert.doesNotMatch(page, /id="set-builderDailyCap"/, 'no plan: no cap box');
  assert.doesNotMatch(page, /Each student and teacher can send up to/);
  const y = await cardSchool();
  page = (await tab(y.who, y.s)).text;
  // The setting (2) is below the free 3: the box says 3, its minimum is 3.
  assert.match(page, /id="set-builderDailyCap"[^>]*min="3"[^>]*value="3"/);
  assert.match(page, /Each student and teacher can send up to 3 Builder messages a day/);
  const bad = await call(y.who, `/api/schools/${y.s.id}/settings`, { method: 'POST', body: { builderDailyCap: 2 } });
  assert.equal(bad.status, 400); assert.match(bad.text, /from 3 to 500/);
  assert.equal((await call(y.who, `/api/schools/${y.s.id}/settings`, { method: 'POST', body: { builderDailyCap: 3 } })).status, 200);
});
