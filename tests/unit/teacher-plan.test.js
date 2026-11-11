// The Teacher plan (server/services/teacher-plan.js, routes/teacher-plan.js; docs/decisions.md "Teacher plan"): $119 a
// year per teacher, a 14-day free trial with no card, one trial per teacher / email / school, the class's shared daily
// Builder messages, /trial and /trial/thanks, the trial's webhooks and notices, teacher seats for schools, the legacy
// per-student plan, /admin/billing. Billing is on against the fake Stripe (tests/support/fake-stripe.js) through the real
// stripe SDK; webhooks are signed and checked for real. Every key and secret here is a short fake value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_teacher';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid, today, tx } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const B = await import('../../server/services/billing.js');
const C = await import('../../server/services/checkout.js');
const SC = await import('../../server/services/schools.js');
const SB = await import('../../server/services/school-billing.js');
const TP = await import('../../server/services/teacher-plan.js');
const F = await import('../../server/services/family.js');
const usage = await import('../../server/builder/usage.js');
const turns = await import('../../server/builder/turns.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const funnel = await import('../../server/services/funnel.js');
const { upsellFor } = await import('../../server/builder/upsell.js');
const { teamText } = await import('../../server/services/chat.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const DAY = 86400e3;
const PW = 'teacher-pass-long-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcFamily: 'pmc_fakefamily', stripePmcSchool: '', termsPublished: false, billingPublic: true, builderDailyTurns: 3, teacherDailyMessages: 5, teacherTrialDays: 14, teacherMonthlyAiUsd: 10, familyExtraMessages: 5, familyChildDailyMax: 4, proTurnWeight: 1, anthropicKey: '', aiPaidMonthlyBudgetUsd: null, aiHardMonthlyUsd: null, contactEmail: 'help@example.com', schoolMinSeats: 25 };
test.beforeEach(() => { Object.assign(config, defaults); resetLimits(); fake.violations.length = 0; fake.webhookUrl = base + B.WEBHOOK_PATH; });

// ---------------------------------------------------------------- helpers
function signIn(u) {
  let c = ''; const sid = auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id);
  return { cookie: c, sid, user: u };
}
async function call(who, path, { method = 'GET', body } = {}) {
  const h = {}; if (who) h.cookie = who.cookie; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location'), cookie: (r.headers.get('set-cookie') || '').split(';')[0] };
}
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
let n = 0;
const boss = auth.createUser({ username: `TBoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
const kid = () => auth.createUser({ username: `Tkid${++n}${uid(4)}`, password: 'rainbow-77' });
/** A school with a teacher (a billing tester), a school admin and `students` students in the teacher's class. */
function school({ students = 2, tester = true } = {}) {
  const s = SC.createSchool(boss, { name: `TSch ${++n} ${uid(4)}` }).school;
  const admin = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms Admin', role: 'admin' }).user;
  const teacher = SC.createSchoolAccount(boss, s.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
  auth.setPassword(teacher.id, PW); auth.setPassword(admin.id, PW);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id IN (?,?)', teacher.id, admin.id);
  const cls = SC.createClass(auth.getUser(teacher.id), s.id, { name: 'Class A' }).class;
  const kids = Array.from({ length: students }, (_, i) => SC.createSchoolAccount(admin, s.id, { rosterName: `Stu ${i}` }).user);
  for (const k of kids) SC.addToClass(admin, cls.id, k.id, 'student');
  return { s: SC.getSchool(s.id), admin: auth.getUser(admin.id), teacher: auth.getUser(teacher.id), kids, cls, who: signIn(auth.getUser(teacher.id)), adminWho: signIn(auth.getUser(admin.id)) };
}
const lastPost = path => fake.requests.filter(r => r.method === 'POST' && r.path === path).at(-1);
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND target=?', action, target);
const inbox = userId => q.all("SELECT m.* FROM chat_messages m WHERE m.to_id=? AND m.kind='notice' ORDER BY m.created_at", userId).map(m => teamText(m));
async function pay(url) {
  const r = await fetch(url, { redirect: 'manual' });
  assert.equal(r.status, 302, await r.text());
  return r.headers.get('location');
}
/** A teacher who started the free trial through /trial and Stripe's (fake) Checkout. */
async function trialTeacher(opts = {}) {
  const x = school(opts);
  const r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: opts.email || `t${++n}@school.example`, trial: '1' } });
  assert.equal(r.status, 200, r.text);
  const back = await pay(r.json.redirect);
  const sub = TP.teacherPlan(x.teacher.id).subscription;
  return { ...x, back, subId: sub && sub.stripe_subscription_id };
}
/** One Builder message charged like agent.js does. -> the charge or false */
function build(user) {
  return tx(() => {
    const c = usage.takeTurn(user, today());
    if (!c) return false;
    turns.create({ gameId: uid(10), userId: user.id, status: 'done', chargedDay: today(), chargedTo: c.source, weight: c.weight });
    return c;
  });
}
const fakeReq = { protocol: 'http', get: () => 'localhost' };

// ---------------------------------------------------------------- Checkout
test('the teacher trial\'s Checkout: the Teacher price by lookup key, quantity 1, 14 days, no card, cancel at the end without one', async () => {
  const x = school();
  // A work email is required.
  let r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'nope', trial: '1' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'email');
  r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'Ms.Teach@School.example', trial: '1' } });
  assert.equal(r.status, 200, r.text);
  assert.match(r.json.redirect, new RegExp(`^${fake.url}/pay/cs_test_`));
  const p = lastPost('/v1/checkout/sessions').params;
  assert.equal(p.mode, 'subscription');
  assert.deepEqual(p.line_items, [{ price: 'price_fake_teacher_yearly', quantity: '1' }]);
  assert.equal(p.client_reference_id, x.teacher.id);
  assert.deepEqual(p.metadata, { owner_kind: 'teacher', owner_id: x.teacher.id });
  assert.equal(p.subscription_data.trial_period_days, '14');
  assert.deepEqual(p.subscription_data.trial_settings, { end_behavior: { missing_payment_method: 'cancel' } });
  assert.equal(p.payment_method_collection, 'if_required', 'no card needed for the trial');
  assert.equal(p.subscription_data.metadata.owner_kind, 'teacher'); assert.equal(p.subscription_data.metadata.school_id, x.s.id);
  assert.equal(p.subscription_data.metadata.trial_key, TP.emailHash('ms.teach@school.example'), 'an HMAC of the email, never the address');
  assert.doesNotMatch(JSON.stringify(p.subscription_data.metadata), /school\.example/);
  assert.deepEqual(p.subscription_data.billing_mode, { type: 'flexible' });
  assert.equal(p.integration_identifier, 'oomba_teacher_kvrnzdqa');
  assert.match(p.success_url, /\/trial\/thanks\?checkout=\{CHECKOUT_SESSION_ID\}$/);
  assert.match(p.cancel_url, /\/trial\?cancelled=1$/);
  assert.equal(p.billing_address_collection, 'auto', 'no Stripe Tax: as little as possible to start a trial');
  assert.equal(String(p.managed_payments?.enabled), 'false');
  assert.equal(p.payment_method_types, undefined);
  // The Customer carries the work email (Stripe's trial reminder and receipts go there) and is ours.
  const cus = fake.st.customers.get(p.customer);
  assert.equal(cus.email, 'ms.teach@school.example');
  assert.equal(B.ownerOfCustomer(p.customer).owner_kind, 'teacher');
  // With Stripe Tax the address is asked for.
  config.stripeTax = true;
  await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'ms.teach@school.example', trial: '1' } });
  assert.equal(lastPost('/v1/checkout/sessions').params.billing_address_collection, 'required');
  assert.deepEqual(lastPost('/v1/checkout/sessions').params.automatic_tax, { enabled: 'true' });
  // Paid without a trial: the password first, then a Checkout with no trial and the card asked for.
  config.stripeTax = false;
  r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'ms.teach@school.example', trial: '0' } });
  assert.equal(r.status, 403); assert.equal(r.json.needPassword, true);
  r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'ms.teach@school.example', trial: '0', password: PW } });
  assert.equal(r.status, 200, r.text);
  const p2 = lastPost('/v1/checkout/sessions').params;
  assert.equal(p2.subscription_data.trial_period_days, undefined); assert.equal(p2.payment_method_collection, undefined);
  // Test key: a teacher who isn't a billing tester can't start one (a trial is real AI money).
  const y = school({ tester: false });
  assert.equal((await call(y.who, '/api/trial/start', { method: 'POST', body: { email: 'y@school.example', trial: '1' } })).status, 403);
  // Students and kids: no.
  assert.equal((await call(signIn(x.kids[0]), '/api/trial/start', { method: 'POST', body: { email: 'k@x.example', trial: '1' } })).status, 404);
  assert.deepEqual(fake.violations, []);
});

// ---------------------------------------------------------------- the trial's life
test('trial lifecycle: trialing (full plan) → trial_will_end notice → a card turns it active; without one it is canceled and nothing is lost', async () => {
  const before = q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.trial'").n;
  const x = await trialTeacher();
  assert.match(x.back, /\/trial\/thanks\?checkout=cs_test_/);
  const plan = TP.teacherPlan(x.teacher.id);
  assert.equal(plan.entitled, true); assert.equal(plan.via, 'own'); assert.equal(plan.trialing, true);
  const row = plan.subscription;
  assert.equal(row.status, 'trialing'); assert.equal(row.plan, 'teacher'); assert.equal(row.payment_pending, 0, 'no payment was required');
  assert.ok(Math.abs(row.trial_end - (Date.now() + 14 * DAY)) < 60e3);
  assert.equal(q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.trial'").n, before + 1);
  assert.equal(audits('billing.trial.start', `teacher:${x.teacher.id}`).length, 1);
  // The return page: confirms and goes to the Teacher plan card in Settings with a welcome.
  const sid = new URL(x.back).searchParams.get('checkout');
  const th = await call(x.who, `/trial/thanks?checkout=${sid}`);
  assert.equal(th.status, 302); assert.equal(th.location, '/me/settings?plan=welcome#teacher-plan');
  const teach = decode((await call(x.who, '/me/settings?plan=welcome')).text);
  assert.match(teach, /id="teacher-plan"/); assert.match(teach, /Your Teacher plan is on/); assert.match(teach, /Free trial until/);
  assert.match(teach, /5 of 5 Builder messages left today for you and your classes/);
  assert.doesNotMatch(teach, /Your free trial ends in/, 'no ending notice two weeks out');
  // Stripe's trial_will_end (3 days before): the notice in Settings and one Team inbox message with the link.
  fake.update(x.subId, {}); fake.st.subscriptions.get(x.subId).trial_end = Math.floor((Date.now() + 3 * DAY) / 1000);
  assert.equal((await fake.emit('customer.subscription.trial_will_end', x.subId)).status, 200);
  assert.ok(TP.teacherPlan(x.teacher.id).subscription.trial_notice_at);
  let msgs = inbox(x.teacher.id);
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /free trial ends in 3 days\. To keep it, add a card here: https?:\/\/[^ ]+\/me\/settings#teacher-plan/);
  const t2 = decode((await call(x.who, '/me/settings')).text);
  assert.match(t2, /Your free trial ends in 3 days\. Add a card to keep the Teacher plan/);
  assert.match(t2, /data-api="\/api\/trial\/card"[\s\S]*Add a card/);
  // The same event again (Stripe retries with a new id): no second message.
  await fake.emit('customer.subscription.trial_will_end', x.subId);
  assert.equal(inbox(x.teacher.id).length, 1);
  // Add a card: Manage billing (the Customer Portal), password first.
  let r = await call(x.who, '/api/trial/card', { method: 'POST', body: {} });
  assert.equal(r.status, 403);
  r = await call(x.who, '/api/trial/card', { method: 'POST', body: { password: PW } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /\/portal\/bps_/);
  assert.match(lastPost('/v1/billing_portal/sessions').params.return_url, /\/me\/settings#teacher-plan$/);
  // The trial ends with a card: active, paid, counted, thanked.
  const plans0 = q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.plan'").n;
  assert.equal((await fake.endTrial(x.subId, { card: true })).status, 200);
  const on = TP.teacherPlan(x.teacher.id);
  assert.equal(on.entitled, true); assert.equal(on.trialing, false); assert.equal(on.subscription.status, 'active');
  assert.equal(on.subscription.latest_amount_paid, 11900);
  assert.equal(q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.plan'").n, plans0 + 1, 'a converted trial counts as a paid plan');
  msgs = inbox(x.teacher.id);
  assert.match(msgs.at(-1), /Thank you! Your Teacher plan is on for the year/);
  assert.match(decode((await call(x.who, '/me/settings')).text), /Renews on/);

  // Another teacher's trial ends without a card: canceled by Stripe; the plan's extras stop; classes stay.
  const y = await trialTeacher();
  assert.equal(usage.allowanceFor(y.kids[0]).source, `teacher:${y.teacher.id}`);
  assert.equal((await fake.endTrial(y.subId, { card: false })).status, 200);
  assert.equal(TP.teacherPlan(y.teacher.id).entitled, false);
  assert.equal(B.ownerPlan('teacher', y.teacher.id).subscription.status, 'canceled');
  assert.equal(usage.allowanceFor(y.kids[0]).source, 'free');
  assert.equal(SC.classesOf(y.teacher.id, 'teacher').length, 1, 'the class is still there');
  assert.equal(SC.members(y.s.id, 'student').length, 2, 'and its students');
  assert.match(inbox(y.teacher.id).at(-1), /free trial has ended\. Your classes, students and their games are all still here/);
  assert.equal(audits('billing.trial.ended', `teacher:${y.teacher.id}`).length, 1);
  // Back on /trial: the trial is used, so it offers the paid plan (card) instead.
  const page = decode((await call(y.who, '/trial')).text);
  assert.match(page, /You have had your free trial/); assert.match(page, /name="trial" value="0"/);
  assert.match(decode((await call(y.who, '/me/settings')).text), /id="tp-plans" href="\/plans">/);
});

test('one free trial per teacher, per email and per school, ever (per Stripe mode)', async () => {
  const x = await trialTeacher({ email: 'once@school.example' });
  await fake.endTrial(x.subId, { card: false });
  // The same teacher again: refused (they can still pay).
  let r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'other@school.example', trial: '1' } });
  assert.equal(r.status, 409); assert.match(r.json.error, /free trial has been used/);
  // Another teacher with the same email (any case): refused.
  const y = school();
  r = await call(y.who, '/api/trial/start', { method: 'POST', body: { email: 'ONCE@school.example', trial: '1' } });
  assert.equal(r.status, 409);
  assert.equal(TP.trialUsed({ email: 'once@school.example' }), true);
  // A fresh teacher and email: fine. (A colleague at the same school can have their own trial.)
  assert.equal((await call(y.who, '/api/trial/start', { method: 'POST', body: { email: 'fresh@school.example', trial: '1' } })).status, 200);
  // A school's seat trial: once per school.
  const z = school();
  r = await call(z.adminWho, '/api/trial/start', { method: 'POST', body: { school: z.s.id, seats: '3' } });
  assert.equal(r.status, 200, r.text);
  const sp = lastPost('/v1/checkout/sessions').params;
  assert.deepEqual(sp.line_items, [{ price: 'price_fake_teacher_yearly', quantity: '3' }]);
  assert.equal(sp.subscription_data.trial_period_days, '14'); assert.equal(sp.payment_method_collection, 'if_required');
  await pay(r.json.redirect);
  const row = B.ownerPlan('school', z.s.id).subscription;
  assert.equal(row.status, 'trialing'); assert.equal(row.plan, 'teacher'); assert.equal(row.quantity, 3);
  assert.equal(TP.trialUsed({ schoolId: z.s.id }), true);
  fake.update(row.stripe_subscription_id, { status: 'canceled' });
  await fake.emit('customer.subscription.deleted', row.stripe_subscription_id);
  r = await call(z.adminWho, '/api/trial/start', { method: 'POST', body: { school: z.s.id, seats: '3' } });
  assert.equal(r.status, 409); assert.match(r.json.error, /free trial has been used/);
  // The school's admins were told the trial ended.
  assert.match(inbox(z.admin.id).at(-1), /free trial has ended/);
  // A test-mode trial never blocks a live one: the rows are per mode.
  assert.equal(q.get('SELECT livemode FROM teacher_trials WHERE school_id=? AND owner_kind=?', z.s.id, 'school').livemode, 0);
});

// ---------------------------------------------------------------- /trial
test('/trial routing: signed out → teacher sign-up; a teacher → start; trialing or paid → Settings; kid and grown-up → for teachers', async () => {
  // Signed out: the sign-up form for a teacher account (and the plan, no card).
  let r = await call(null, '/trial');
  assert.equal(r.status, 200);
  let t = decode(r.text);
  assert.match(t, /Try the Teacher plan free for 14 days/);
  assert.match(t, /Create your teacher account/);
  assert.match(t, /data-api="\/api\/trial\/signup"/);
  assert.match(t, /\$119\.00 a year per teacher\. No per-student charge\./);
  assert.match(t, /noindex/);
  // A guest is signed out too.
  const guest = auth.createGuest();
  assert.match(decode((await call(signIn(guest), '/trial')).text), /Create your teacher account/);
  // A teacher with no plan: the start form with the work email; ?cancelled=1 says nothing started.
  const x = school();
  t = decode((await call(x.who, '/trial?cancelled=1')).text);
  assert.match(t, /Start your 14-day free trial/); assert.match(t, /name="email"/); assert.match(t, /Nothing was started/);
  // In a trial or paid: straight to the Teacher plan card in Settings with a notice.
  const y = await trialTeacher();
  r = await call(y.who, '/trial');
  assert.equal(r.status, 302); assert.equal(r.location, '/me/settings?plan=on#teacher-plan');
  assert.match(decode((await call(y.who, '/me/settings?plan=on')).text), /You already have the Teacher plan/);
  await fake.endTrial(y.subId, { card: true });
  assert.equal((await call(y.who, '/trial')).location, '/me/settings?plan=on#teacher-plan');
  // A kid (own account) and a school student: a friendly page for teachers, with the families' plans.
  for (const who of [signIn(kid()), signIn(x.kids[0])]) {
    r = await call(who, '/trial');
    assert.equal(r.status, 200);
    t = decode(r.text);
    assert.match(t, /The Teacher plan is for teachers/); assert.match(t, /href="\/plans">See the plans for families</);
    assert.doesNotMatch(t, /data-api="\/api\/trial/);
  }
  // A grown-up: the same friendly page (the fence lets /trial through).
  const g = auth.createUser({ username: `TGrown${uid(4)}`, password: 'a-long-password-1', accountType: 'grownup' });
  r = await call(signIn(g), '/trial');
  assert.equal(r.status, 200); assert.match(decode(r.text), /The Teacher plan is for teachers/);
  // A school admin with ?seats=N: the school's free trial for that many teachers.
  t = decode((await call(x.adminWho, '/trial?seats=4')).text);
  assert.match(t, /A free trial for your school/); assert.match(t, /4 teachers/); assert.match(t, /name="seats" value="4"/);
  // Paid-plan pages off: /trial goes to the teacher page; the APIs are 404.
  config.billingPublic = false;
  r = await call(null, '/trial');
  assert.equal(r.status, 302); assert.equal(r.location, '/teachers#start');
  assert.equal((await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'a@b.example' } })).status, 404);
});

test('the teacher sign-up: an account, their own classroom (they can make a class), signed in, then on to the trial', async () => {
  const bad = await call(null, '/api/trial/signup', { method: 'POST', body: { name: 'A', school: '', email: 'x', username: 'GoodName12', password: 'short', adult: '' } });
  assert.equal(bad.status, 400);
  assert.deepEqual(Object.keys(bad.json.errors).sort(), ['adult', 'email', 'name', 'password', 'school'], JSON.stringify(bad.json.errors));
  const r = await call(null, '/api/trial/signup', { method: 'POST', body: { name: 'Ms Rivera', school: 'Hill Primary', email: 'rivera@hill.example', username: 'MsRiveraHill', password: PW, adult: '1' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/trial', 'test key and not a billing tester: /trial says it isn\'t open yet');
  const u = auth.getUserByName('MsRiveraHill');
  assert.equal(u.display_name, 'Ms Rivera'); assert.equal(u.account_type, 'kid', 'teachers\' accounts are ordinary accounts that are school staff');
  assert.equal(TP.isTeacher(u), true);
  const s = SC.schoolsOf(u.id)[0];
  assert.equal(s.name, 'Hill Primary'); assert.equal(s.role, 'admin'); assert.equal(s.roster_name, 'Ms Rivera');
  assert.equal(SC.canCreateClass(u, s.id), true, 'a teacher account that can make a class');
  assert.equal(q.get('SELECT 1 FROM users WHERE id=? AND username LIKE ?', u.id, '%rivera@%'), undefined, 'the email is not kept on the account');
  // Signed in by the sign-up (a session cookie came back).
  assert.match(r.cookie, /=/);
  const who = { cookie: r.cookie };
  // Child safety (the audit's bug 0): the teacher this sign-up makes has no friend code and cannot send a friend request
  // to a child's account, by the API it would use; the child sees no request. (tests/unit/staff-no-friends.test.js)
  assert.equal(u.friend_code, null, 'a trial teacher has no friend code');
  const child = auth.createUser({ username: 'TrialChild1', password: 'secret123' });
  const ask = await call(who, '/api/friends/add', { method: 'POST', body: { code: child.friend_code } });
  assert.equal(ask.status, 403, ask.text); assert.equal(ask.json.code, 'staff');
  assert.equal(q.get('SELECT COUNT(*) n FROM friends WHERE user_id=? OR friend_id=?', u.id, u.id).n, 0);
  assert.equal((await call(who, '/api/friends')).status, 403);
  assert.doesNotMatch((await call(who, '/friends')).text, /id="mycode"/);
  assert.match(decode((await call(who, '/trial')).text), /isn't open yet/);
  // As a billing tester, the sign-up goes straight to Stripe's Checkout with the trial.
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  // (a second account: the sign-up starts Checkout only for the account it makes)
  config.stripeApiKey = 'rk_test_fake';
  const r2 = await call(null, '/api/trial/signup', { method: 'POST', body: { name: 'Mr Lee', school: 'Lee Academy', email: 'lee@lee.example', username: 'MrLeeAcademy', password: PW, adult: '1', seats: '5' } });
  assert.equal(r2.status, 200); assert.equal(r2.json.redirect, '/trial?seats=5', 'a school trial goes back to /trial to confirm it');
  // Signed in already: no second account.
  assert.equal((await call(who, '/api/trial/signup', { method: 'POST', body: { name: 'X Y', school: 'Z School', email: 'z@z.example', username: 'Another1', password: PW, adult: '1' } })).status, 409);
});

test('Checkout\'s return page starts the trial even when the webhook is slow (it confirms from the session)', async () => {
  const x = school();
  const r = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'slow@school.example', trial: '1' } });
  fake.webhookUrl = `${base}/nowhere-yet`;   // Stripe's webhooks don't arrive (yet)
  const back = await pay(r.json.redirect);
  fake.webhookUrl = base + B.WEBHOOK_PATH;
  assert.equal(TP.teacherPlan(x.teacher.id).entitled, false, 'nothing synced yet');
  const sid = new URL(back).searchParams.get('checkout');
  // Someone else's session is not theirs.
  const y = school();
  assert.deepEqual((await call(y.who, `/api/trial/status?checkout=${sid}`)).json, { state: 'not_yours' });
  const th = await call(x.who, `/trial/thanks?checkout=${sid}`);
  assert.equal(th.status, 302); assert.equal(th.location, '/me/settings?plan=welcome#teacher-plan');
  assert.equal(TP.teacherPlan(x.teacher.id).trialing, true);
  assert.equal(TP.trialUsed({ userId: x.teacher.id }), true);
  // Signed out: sign in first, then back here.
  const out = await call(null, `/trial/thanks?checkout=${sid}`);
  assert.equal(out.status, 302); assert.match(out.location, /^\/login\?next=/);
});

// ---------------------------------------------------------------- the Teacher plan card in Settings (/me/settings)
/** The Teacher plan card on the Settings page, decoded. */
const meCard = async who => { const t = decode((await call(who, '/me/settings')).text); const i = t.indexOf('id="teacher-plan"'); return i < 0 ? '' : t.slice(i, t.indexOf('</section>', i)); };
const PRICE = /\$\s?\d|€\s?\d|£\s?\d|\d\s?(USD|EUR|GBP)\b/;

test('the Settings page\'s Teacher plan card, a teacher who owns it: trialing (no card yet) with Add a card, then active with Manage billing (the portal)', async () => {
  const x = await trialTeacher();
  let c = await meCard(x.who);
  assert.match(c, /Free trial until /);
  assert.match(c, /5 of 5 Builder messages left today for you and your classes/);
  assert.match(c, /<form data-api="\/api\/trial\/card" class="planform">[\s\S]*Add a card<\/button>/, 'Add a card: the trial emails\' link lands here');
  assert.doesNotMatch(c, PRICE);
  // Settings: plan and billing first, then Language, Appearance, Password and Sign out; the section nav lists them.
  // Never on My classes or the Me page (the Me page has the Settings tile).
  const me = decode((await call(x.who, '/me/settings')).text);
  const at = id => me.indexOf(`id="${id}"`);
  assert.ok(at('billing') < at('teacher-plan') && at('teacher-plan') < at('language') && at('language') < at('appearance') && at('appearance') < at('password') && at('password') < at('signout'));
  assert.deepEqual([...me.matchAll(/<nav class="setnav"[\s\S]*?<\/nav>/g)][0][0].match(/href="#[^"]+"/g), ['href="#billing"', 'href="#language-sec"', 'href="#appearance-sec"', 'href="#password-sec"', 'href="#signout-sec"']);
  assert.doesNotMatch(decode((await call(x.who, '/teach')).text), /id="teacher-plan"/);
  const mePage = decode((await call(x.who, '/me')).text);
  assert.doesNotMatch(mePage, /id="teacher-plan"|id="language"|id="appearance"|id="password"|id="signout"/);
  assert.match(mePage, /<a class="panel metile" href="\/me\/settings">/);
  // Add a card / Manage billing opens the Stripe customer portal, back to the Me page.
  const r = await call(x.who, '/api/trial/card', { method: 'POST', body: { password: PW } });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /\/portal\/bps_/);
  assert.match(lastPost('/v1/billing_portal/sessions').params.return_url, /\/me\/settings#teacher-plan$/);
  await fake.endTrial(x.subId, { card: true });
  c = await meCard(x.who);
  assert.match(c, /Renews on /); assert.match(c, /Manage billing<\/button>/); assert.doesNotMatch(c, /Add a card/);
  // Set to end at the period's end: "Ends on".
  fake.update(x.subId, { cancelAtPeriodEnd: true });
  await fake.emit('customer.subscription.updated', x.subId);
  assert.match(await meCard(x.who), /Ends on /);
});

test('the Settings page\'s Teacher plan card: a seat from the school (Manage school billing for its admin, a note for a teacher); no plan: a line and the plans', async () => {
  const x = school();
  // No plan: one line and a link to /plans (prices stay there).
  let c = await meCard(x.who);
  assert.match(c, /Unlimited students and 5 AI builds a day for your classes/);
  assert.match(c, /<a class="btn btn-primary" id="tp-plans" href="\/plans">/);
  assert.doesNotMatch(c, PRICE);
  // The school buys teacher seats (a seat trial) and gives one to the teacher and one to its admin.
  const r = await call(x.adminWho, '/api/trial/start', { method: 'POST', body: { school: x.s.id, seats: '2' } });
  assert.equal(r.status, 200, r.text); await pay(r.json.redirect);
  assert.ok(TP.assignSeat(x.admin, x.s.id, x.teacher.id).ok);
  assert.ok(TP.assignSeat(x.admin, x.s.id, x.admin.id).ok);
  c = await meCard(x.who);
  assert.match(c, new RegExp(`A seat from ${x.s.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.`));
  assert.match(c, /id="tp-seat-note">The admins of [^<]+ look after this plan\./);
  assert.doesNotMatch(c, /tp-school-billing|data-api="\/api\/trial\/card"/, 'a teacher on a seat has no billing of their own');
  const a = await meCard(x.adminWho);
  assert.match(a, /A seat from /);
  assert.match(a, new RegExp(`<a class="btn" id="tp-school-billing" href="/school/${encodeURIComponent(x.s.slug)}\\?tab=billing">`));
  assert.doesNotMatch(a, /tp-seat-note/);
  assert.doesNotMatch(a + c, PRICE);
  // The admin's Me page also has My school.
  assert.match(decode((await call(x.adminWho, '/me')).text), /<a class="panel metile" href="\/school">/);
  // A teacher without billing on sees no plan section, only the others.
  config.billingPublic = false; config.stripeApiKey = '';
  const off = decode((await call(x.who, '/me/settings')).text);
  assert.doesNotMatch(off, /id="billing"|id="teacher-plan"/); assert.match(off, /id="language"/);
});

// ---------------------------------------------------------------- the class's Builder messages
test('the class AI pool: the teacher and their students share TEACHER_DAILY_MESSAGES a day (paid pool); at the cap, the class message', async () => {
  config.teacherDailyMessages = 4;
  const x = await trialTeacher({ students: 2 });
  const [a, b] = x.kids;
  // Never the family's extras or Spark Packs in a paid class.
  const al = usage.allowanceFor(a);
  assert.equal(al.source, `teacher:${x.teacher.id}`); assert.equal(al.pool, 'paid'); assert.equal(al.daily, 4); assert.equal(al.left, 4);
  assert.equal(al.classContext, true); assert.equal(al.extraLeft, null); assert.equal(al.sparkLeft, null);
  assert.equal(usage.familyOf(a.id), null);
  assert.equal(usage.allowanceFor(x.teacher).source, `teacher:${x.teacher.id}`, 'the teacher builds from it too');
  // Shared: two students and the teacher use the same 4.
  assert.equal(build(a).source, `teacher:${x.teacher.id}`);
  assert.equal(build(b).source, `teacher:${x.teacher.id}`);
  assert.equal(build(x.teacher).source, `teacher:${x.teacher.id}`);
  assert.equal(TP.poolOf(x.teacher.id).left, 1);
  assert.equal(usage.allowanceFor(b).left, 1);
  assert.equal(build(a).source, `teacher:${x.teacher.id}`);
  // Used up: the free daily messages that are left (none: they were counted today), the class limit message, and the
  // limit card says "ask your teacher" to a student and "more tomorrow" to the teacher. Never a family upsell.
  const after = usage.allowanceFor(a);
  assert.equal(after.source, 'free'); assert.equal(after.classContext, true);
  assert.deepEqual(usage.limitKey({ ...after, left: 0 }), ['builder.errors.limitClass']);
  assert.deepEqual(upsellFor(auth.getUser(a.id), fakeReq), { kind: 'class' });
  assert.deepEqual(upsellFor(x.teacher, fakeReq), { kind: 'teacher' });
  // The paid AI pool's ceiling counts the teacher.
  assert.ok(TP.teachersPaidMonthlyUsd() >= 10);
  assert.ok(aiBudget.paidMonthly() >= 10);
  // A teacher without a plan: their students are on the free messages, and the card offers them the trial.
  const y = school();
  assert.equal(usage.allowanceFor(y.kids[0]).source, 'free');
  assert.deepEqual(upsellFor(y.teacher, fakeReq), { kind: 'plan', who: 'staff', href: '/trial' });
  // The paid pool spent: nobody builds from the Teacher plan (the site's caps still apply).
  config.aiPaidMonthlyBudgetUsd = 0;
  const z = await trialTeacher();
  assert.notEqual(usage.allowanceFor(z.kids[0]).source, `teacher:${z.teacher.id}`);
});

test('a student in several paid teachers\' classes builds from the first class they joined, then the next one with messages left', async () => {
  config.teacherDailyMessages = 1;
  const x = await trialTeacher({ students: 1 });
  const stu = x.kids[0];
  // A second teacher at the same school, with their own plan, and a class this student joins later.
  const t2 = SC.createSchoolAccount(boss, x.s.id, { rosterName: 'Ms Two', role: 'teacher' }).user;
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', t2.id);
  const c2 = SC.createClass(auth.getUser(t2.id), x.s.id, { name: 'Class B' }).class;
  SC.addToClass(x.admin, c2.id, stu.id, 'student');
  const r = await call(signIn(auth.getUser(t2.id)), '/api/trial/start', { method: 'POST', body: { email: 't2@school.example', trial: '1' } });
  await pay(r.json.redirect);
  assert.equal(TP.teachersOfStudent(stu.id)[0], x.teacher.id);
  assert.equal(build(stu).source, `teacher:${x.teacher.id}`, 'the first class they joined');
  assert.equal(build(stu).source, `teacher:${t2.id}`, 'then the next paid one with messages left');
  assert.equal(usage.allowanceFor(stu).source, 'free');
});

// ---------------------------------------------------------------- schools: legacy plan, admin, copy
test('a school on the legacy per-student plan keeps it (pool, renewal price) and its Billing tab says "Legacy plan"', async () => {
  const x = school({ students: 3 });
  const customer = await C.ownerCustomer('school', x.s.id);
  const sub = fake.subscription({ customer, lookupKey: 'oomba_school_seat_yearly', quantity: 25, metadata: { owner_kind: 'school', owner_id: x.s.id } });
  await B.syncSubscription(sub.id);
  const plan = B.ownerPlan('school', x.s.id);
  assert.equal(plan.plan, 'school'); assert.equal(SB.isLegacy(plan), true);
  assert.equal(usage.allowanceFor(x.kids[0]).source, `school:${x.s.id}`, 'the legacy school pool still pays');
  const tab = decode((await call(x.adminWho, `/school/${x.s.slug}?tab=billing`)).text);
  assert.match(tab, /Legacy plan\./); assert.match(tab, /priced per student\. It keeps that price when it renews/);
  assert.match(tab, /School plan for 25 students/);
  assert.match(tab, /\$20\.00 per student per year/, 'its own (legacy) price, from Stripe');
  // A renewal stays on the legacy price: nothing moves it.
  fake.renew(sub.id);
  await B.syncSubscription(sub.id);
  assert.equal(B.ownerPlan('school', x.s.id).subscription.price_lookup_key, 'oomba_school_seat_yearly');
  // /admin/billing lists it as a legacy plan; Teacher plans have their own section with trial dates.
  await trialTeacher();
  const admin = decode((await call(signIn(boss), '/admin/billing')).text);
  assert.match(admin, /id="teachers"/); assert.match(admin, /Teacher plans/);
  assert.match(admin, /Trialing/); assert.match(admin, /Trials started/); assert.match(admin, /Trial ends/);
  assert.match(admin, /legacy plan/); assert.match(admin, /school \(legacy per-student\)/);
  assert.match(admin, /oomba_teacher_yearly/);
  // The go-live panel checks the Teacher price's lookup key.
  assert.match(admin, /The Teacher plan's price exists \(lookup key oomba_teacher_yearly\)/);
});

test('pricing copy: Teacher $119/year, 14-day trial, no card, unlimited students, 300 builds a day; schools per teacher; no per-student price anywhere public', async () => {
  config.teacherDailyMessages = 300;
  const plans = decode((await call(null, '/plans')).text);
  assert.match(plans, /\$119\.00<\/span> <span class="per">per teacher a year/);
  assert.match(plans, /14-day free trial, no card required/); assert.match(plans, /Unlimited students/); assert.match(plans, /300 AI builds a day for the class/);
  assert.match(plans, /Invoice or purchase order available/);
  const schools = decode((await call(null, '/plans/schools')).text);
  assert.match(schools, /\$119\.00 per teacher per year, with no per-student charge/);
  const teachers = decode((await call(null, '/teachers')).text);
  assert.match(teachers, /Try the Teacher plan free for 14 days, no card needed: unlimited students and 300 AI builds a day/);
  assert.match(teachers, /href="\/trial">Start free trial</);
  // The FAQ: what is free, what the Teacher plan adds, and no price outside the plans pages.
  assert.match(teachers, /The optional Teacher plan adds a shared daily pool of AI builds for your classes[\s\S]*Try it free for 14 days, no card needed/);
  assert.doesNotMatch(teachers, /\$\d/);
  config.billingPublic = false;
  const off = decode((await call(null, '/teachers')).text);
  assert.match(off, /Playing, classes, lessons and progress are free/); assert.doesNotMatch(off, /Teacher plan/);
  config.billingPublic = true;
  const terms = decode((await call(null, '/terms')).text);
  assert.match(terms, /priced <b>per teacher per year<\/b>, with no charge per student/);
  assert.match(terms, /14-day free trial<\/b> that needs no card/);
  assert.doesNotMatch(terms, /per student per year|minimum of 25 students/);
  const refunds = decode((await call(null, '/refunds')).text);
  assert.match(refunds, /<b>Teacher<\/b>/); assert.match(refunds, /Free trials:<\/b> a Teacher plan's free trial costs nothing/);
  const privacy = decode((await call(null, '/privacy?for=grownups')).text);
  assert.match(privacy, /Seats<\/b> are counted in teachers/);
  for (const page of [plans, schools, teachers]) assert.doesNotMatch(page, /per student|\$20\.00/);
  // Every language has the new words (the readiness panel's i18n row, tests/unit/billing-i18n.test.js).
  const { billingKeyGaps } = await import('../../server/i18n/billing-keys.js');
  assert.deepEqual(billingKeyGaps(), {});
  // A translated page shows its own words.
  const { dictionary } = await import('../../server/i18n/index.js');
  assert.equal(dictionary('de')['plans.teacher.per'], 'pro Lehrkraft und Jahr');
  for (const code of ['es', 'fr', 'ja', 'ar', 'he', 'ru', 'zh-Hant']) assert.match(dictionary(code)['teachers.start.plans'], /\{days\}[\s\S]*\{daily\}|\{daily\}[\s\S]*\{days\}/, code);
});

test('funnel and webhook events: teacher.trial is a known step; trial_will_end is one of the 15 handled events', () => {
  assert.ok(funnel.STEPS.includes('teacher.trial'));
  assert.ok(B.WEBHOOK_EVENTS.includes('customer.subscription.trial_will_end'));
  assert.equal(B.WEBHOOK_EVENTS.length, 15);
  assert.equal(F.familiesOn(undefined), true);
});
