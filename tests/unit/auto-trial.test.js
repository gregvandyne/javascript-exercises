// The automatic Teacher plan trial at sign-up (docs/decisions.md "Automatic trial at sign-up"; services/teacher-plan.js
// startTeacherTrial / autoStartTrial / seatTakesOver, routes/onboarding.js): the first class saved on the sign-up's
// "Add your classes" step starts the teacher's own 14-day trial straight through Stripe's API (no Checkout, no card),
// once, with the Checkout path's metadata, so the webhooks and the trial emails treat it the same. The double-billing
// safeguards: no trial while a seat or grant covers them or their school has a seat nobody holds; a seat given to a
// teacher in their own trial closes it at no charge; a teacher who pays for their own plan is warned, never cancelled.
// Billing is on against the fake Stripe (tests/support/fake-stripe.js) through the real stripe SDK; webhooks are signed
// and checked for real. Every key and secret here is a short fake value.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_auto_trial';
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
const N = await import('../../server/services/nudges.js');
const E = await import('../../server/services/email.js');
const { teamText } = await import('../../server/services/chat.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

N._opts.kick = false;
const DAY = 86400e3;
const PW = 'teacher-pass-long-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcSchool: '', termsPublished: false, billingPublic: true, teacherTrialDays: 14, teacherDailyMessages: 5, googleClassroom: false };
test.beforeEach(() => { Object.assign(config, defaults); resetLimits(); fake.violations.length = 0; fake.failSubscriptionCreates = 0; fake.webhookUrl = base + B.WEBHOOK_PATH; });

// ---------------------------------------------------------------- helpers
const cookieOf = (r, name) => (r.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
function signIn(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return { cookie: c, user: u }; }
async function call(who, path, { method = 'GET', body } = {}) {
  const h = {}; if (who) h.cookie = who.cookie; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location'), session: cookieOf(r, 'brb_session') };
}
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
let n = 0;
const boss = auth.createUser({ username: `ABoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
const posts = path => fake.requests.filter(r => r.method === 'POST' && r.path === path);
const subsOf = customer => [...fake.st.subscriptions.values()].filter(s => s.customer === customer);
const inbox = userId => q.all("SELECT m.* FROM chat_messages m WHERE m.to_id=? AND m.kind='notice' ORDER BY m.created_at", userId).map(m => teamText(m));
const trialRows = userId => q.all('SELECT * FROM teacher_trials WHERE user_id=?', userId);

/** A teacher through the one sign-up: account (password, so no email), their own classroom, made a billing tester
 *  (test key, D14) before the classes step. -> { who, user, schoolId } */
async function signUp({ tester = true, trial = null } = {}) {
  const name = `AutoT${200 + ++n}`;
  const extra = trial ? { trial: '1', ...(trial.seats ? { seats: String(trial.seats) } : {}) } : {};
  const a = await call(null, '/api/onboarding/teacher', { method: 'POST', body: { username: name, password: PW, confirm: PW, adult: '1', ...extra } });
  assert.equal(a.status, 200, a.text);
  const who = { cookie: a.session };
  const s = await call(who, '/api/onboarding/school', { method: 'POST', body: { how: 'own', name: 'Ms Auto', ...extra } });
  assert.equal(s.status, 200, s.text);
  const user = auth.getUserByName(name);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', user.id);
  return { who, user: auth.getUser(user.id), schoolId: SC.classSchoolsFor(auth.getUser(user.id))[0].id, extra };
}
const addClass = (x, name = '5A') => call(x.who, '/api/onboarding/classes', { method: 'POST', body: { schoolId: x.schoolId, name: [name], grade: ['5'], ...x.extra } });
/** A school (made by the platform admin) with a teacher and an admin, both billing testers. seats: a grant of N teacher
 *  seats for the school. */
function school({ seats = 0 } = {}) {
  const s = SC.createSchool(boss, { name: `ASch ${++n} ${uid(4)}` }).school;
  const admin = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms Admin', role: 'admin' }).user;
  const teacher = SC.createSchoolAccount(boss, s.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
  auth.setPassword(teacher.id, PW); auth.setPassword(admin.id, PW);
  q.run('UPDATE users SET billing_tester=1 WHERE id IN (?,?)', teacher.id, admin.id);
  SC.createClass(auth.getUser(teacher.id), s.id, { name: 'Class A' });
  if (seats) addSeats(s, seats);
  return { s: SC.getSchool(s.id), admin: auth.getUser(admin.id), teacher: auth.getUser(teacher.id), who: signIn(auth.getUser(teacher.id)), adminWho: signIn(auth.getUser(admin.id)) };
}
/** A grant of N teacher seats for a school (the platform admin's; a paid seat plan counts the same). */
const addSeats = (s, seats) => q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, seats, until, created_at) VALUES (?, 'school', ?, 'teacher', ?, ?, ?)", uid(10), s.id, seats, Date.now() + 300 * DAY, Date.now());
const give = (x, userId, extra = {}) => call(x.adminWho, `/api/billing/school/${x.s.id}/seat-give`, { method: 'POST', body: { user: userId, ...extra } });

// ---------------------------------------------------------------- the automatic start
test('the first class saved starts the 14-day trial through the API: the right parameters, once, synced at once; a double submit makes one subscription', async () => {
  const x = await signUp();
  const before = posts('/v1/subscriptions').length;
  const r = await addClass(x);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/signup/teacher/done');
  const made = posts('/v1/subscriptions').slice(before);
  assert.equal(made.length, 1);
  const p = made[0].params;
  assert.deepEqual(p.items, [{ price: 'price_fake_teacher_yearly', quantity: '1' }]);
  assert.equal(p.trial_period_days, '14');
  assert.deepEqual(p.trial_settings, { end_behavior: { missing_payment_method: 'cancel' } });
  assert.deepEqual(p.payment_settings, { save_default_payment_method: 'on_subscription' });
  assert.equal(p.metadata.owner_kind, 'teacher'); assert.equal(p.metadata.owner_id, x.user.id); assert.equal(p.metadata.school_id, x.schoolId);
  assert.equal(p.metadata.trial_key, undefined, 'no email yet: no email HMAC');
  assert.deepEqual(p.billing_mode, { type: 'flexible' });
  assert.equal(p.payment_method_types, undefined); assert.equal(p.collection_method, undefined);
  assert.match(made[0].idempotencyKey, new RegExp(`^trial-teacher-${x.user.id}-0-none$`), 'one Idempotency-Key per teacher');
  assert.equal(posts('/v1/checkout/sessions').filter(c => c.params.client_reference_id === x.user.id).length, 0, 'no Checkout page');
  // The Customer: ours, with the teacher's id (no email: a password sign-up).
  const cus = fake.st.customers.get(p.customer);
  assert.deepEqual(cus.metadata, { owner_kind: 'teacher', owner_id: x.user.id, teacher_id: x.user.id });
  assert.equal(cus.email, null);
  assert.equal(B.ownerOfCustomer(p.customer).owner_id, x.user.id);
  // Synced at once: the plan is on, the trial is remembered, the trial emails' sequence started.
  const plan = TP.teacherPlan(x.user.id);
  assert.equal(plan.entitled, true); assert.equal(plan.via, 'own'); assert.equal(plan.trialing, true);
  assert.ok(Math.abs(plan.trialEnd - (Date.now() + 14 * DAY)) < 60e3);
  assert.equal(trialRows(x.user.id).length, 1);
  assert.equal(q.get('SELECT state FROM trial_emails WHERE user_id=?', x.user.id).state, 'trialing');
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='billing.trial.direct' AND target=?", `teacher:${x.user.id}`).n, 1);
  // A double submit (two classes saved at once) and a retry: still one subscription.
  const [a, b] = await Promise.all([addClass(x, '5B'), addClass(x, '5C')]);
  assert.equal(a.status, 200); assert.equal(b.status, 200);
  assert.equal(subsOf(p.customer).length, 1);
  assert.equal((await TP.startTeacherTrial({ user: x.user })).code, 'entitled');
  // The same key twice at Stripe (a retry after a lost answer) gives back the same subscription.
  const again = await (await import('../../server/services/stripe.js')).createSubscription(p, made[0].idempotencyKey);
  assert.equal(again.id, plan.subscription.stripe_subscription_id);
  assert.equal(subsOf(p.customer).length, 1);
  assert.deepEqual(fake.violations, []);
});

test('the done screen says the trial started (no card), offers an optional email for the reminders, and My classes says it too', async () => {
  const x = await signUp();
  await addClass(x);
  const done = await call(x.who, '/signup/teacher/done');
  assert.equal(done.status, 200, done.location);
  const page = decode(done.text);
  assert.match(page, /You're all set/);
  assert.match(page, /data-trial-line="started">Your 14-day Teacher plan trial has started\. No card needed\./);
  assert.match(page, /<label for="ob-temail">Email for trial reminders<\/label>/);
  assert.match(page, /data-api="\/api\/trial\/email"/);
  assert.doesNotMatch(page, /\$\d/, 'no prices outside /plans');
  assert.match(page, /href="\/teach" id="ob-done-go">Skip for now/);
  // The Teacher plan card (Settings) says the same line after ?plan=started, and shows the trial.
  const teach = decode((await call(x.who, '/me/settings?plan=started')).text);
  assert.match(teach, /Your 14-day Teacher plan trial has started\. No card needed\./);
  assert.match(teach, /Free trial until/);
  // The email: a bad one is refused; a good one is kept the way the trial Checkout keeps it.
  assert.equal((await call(x.who, '/api/trial/email', { method: 'POST', body: { email: 'nope' } })).json.field, 'email');
  const r = await call(x.who, '/api/trial/email', { method: 'POST', body: { email: 'Ms.Auto@School.example' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/teach');
  assert.deepEqual(E.addressOf(x.user.id), { email: 'ms.auto@school.example', source: 'checkout' });
  const cus = fake.st.customers.get(B.customerOf('teacher', x.user.id));
  assert.equal(cus.email, 'ms.auto@school.example', 'on the Stripe Customer (Stripe\'s reminder and receipts)');
  assert.equal(trialRows(x.user.id)[0].email_hash, TP.emailHash('ms.auto@school.example'), 'one trial per email from now on');
  assert.equal(TP.trialUsed({ email: 'ms.auto@school.example' }), true);
  // With an email on file the done screen no longer asks for one.
  assert.doesNotMatch((await call(x.who, '/signup/teacher/done')).text, /ob-temail/);
  // Someone without their own trial can't use it.
  const other = school();
  assert.equal((await call(other.who, '/api/trial/email', { method: 'POST', body: { email: 'x@y.example' } })).status, 404);
});

test('the trial started through the API is treated like a Checkout trial: its webhooks, the trial emails, the trial_will_end notice and the end', async () => {
  const x = await signUp();
  await addClass(x);
  const subId = TP.teacherPlan(x.user.id).subscription.stripe_subscription_id;
  const trials = q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.trial'").n;
  // Stripe's own customer.subscription.created arrives after our sync: accepted, nothing doubled.
  assert.equal((await fake.emit('customer.subscription.created', subId)).status, 200);
  assert.equal(q.get("SELECT result FROM billing_events WHERE stripe_subscription_id=? AND type='customer.subscription.created'", subId).result, 'ok');
  assert.equal(trialRows(x.user.id).length, 1);
  assert.equal(q.get("SELECT COALESCE(SUM(n),0) n FROM funnel_counts WHERE step='teacher.trial'").n, trials, 'counted once');
  assert.equal(q.get("SELECT COUNT(*) n FROM trial_nudges WHERE user_id=? AND step='welcome'", x.user.id).n, 1);
  // trial_will_end: the notice on My classes and one Team inbox message with the link to add a card.
  fake.st.subscriptions.get(subId).trial_end = Math.floor((Date.now() + 3 * DAY) / 1000);
  assert.equal((await fake.emit('customer.subscription.trial_will_end', subId)).status, 200);
  assert.match(inbox(x.user.id).at(-1), /free trial ends in 3 days\. To keep it, add a card here/);
  // The end without a card: canceled by Stripe, "your trial has ended" (email row and Team inbox).
  assert.equal((await fake.endTrial(subId, { card: false })).status, 200);
  assert.equal(TP.teacherPlan(x.user.id).entitled, false);
  assert.equal(q.get('SELECT state FROM trial_emails WHERE user_id=?', x.user.id).state, 'ended');
  assert.equal(q.get("SELECT status FROM trial_nudges WHERE user_id=? AND step='ended'", x.user.id).status, 'pending');
  assert.match(inbox(x.user.id).at(-1), /free trial has ended/);
  // Another one with a card at the end: active, thanked.
  const y = await signUp();
  await addClass(y);
  const ySub = TP.teacherPlan(y.user.id).subscription.stripe_subscription_id;
  assert.equal((await fake.endTrial(ySub, { card: true })).status, 200);
  assert.equal(TP.teacherPlan(y.user.id).subscription.status, 'active');
  assert.equal(q.get('SELECT state FROM trial_emails WHERE user_id=?', y.user.id).state, 'converted');
});

test('no automatic trial: billing off, not open to the account, a kid, a guest, a grown-up, a used trial (teacher, email, school), a grant or a seat', async () => {
  // Billing off: the sign-up goes on, nothing is asked of Stripe, the done step goes to My classes.
  const off = await signUp();
  config.stripeApiKey = '';
  const before = fake.requests.length;
  assert.equal((await addClass(off)).status, 200);
  assert.equal(fake.requests.length, before);
  assert.equal((await call(off.who, '/signup/teacher/done')).location, '/teach');
  config.stripeApiKey = 'rk_test_fake';
  // Test key and not a billing tester (D14: a trial is real AI money).
  const notTester = await signUp({ tester: false });
  assert.equal((await addClass(notTester)).status, 200);
  assert.equal(TP.teacherPlan(notTester.user.id).entitled, false);
  // Never a kid, a guest or a grown-up (the service refuses; the steps never let them in).
  const kid = auth.createUser({ username: `AKid${uid(4)}`, password: 'rainbow-77' });
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', kid.id);
  assert.equal((await TP.autoStartTrial(auth.getUser(kid.id))).code, 'off');
  assert.equal((await TP.startTeacherTrial({ user: auth.getUser(kid.id) })).code, 'notTeacher');
  assert.equal((await TP.startTeacherTrial({ user: auth.createGuest() })).code, 'notTeacher');
  const g = auth.createUser({ username: `AGrown${uid(4)}`, password: 'a-long-password-1', accountType: 'grownup' });
  assert.equal((await TP.startTeacherTrial({ user: auth.getUser(g.id) })).code, 'notTeacher');
  const stu = SC.createSchoolAccount(boss, school().s.id, { rosterName: 'Stu' }).user;
  assert.equal((await TP.startTeacherTrial({ user: auth.getUser(stu.id) })).code, 'notTeacher');
  // A trial used already: by this teacher, by this email (another account), by their school (its seat trial).
  const used = school();
  q.run('INSERT INTO teacher_trials(id, owner_kind, owner_id, user_id, school_id, email_hash, stripe_subscription_id, livemode, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(12), 'teacher', used.teacher.id, used.teacher.id, used.s.id, null, `sub_old_${uid(6)}`, 0, Date.now());
  assert.equal((await TP.startTeacherTrial({ user: used.teacher })).code, 'trialUsed');
  const mailed = school();
  q.run('INSERT INTO teacher_trials(id, owner_kind, owner_id, user_id, school_id, email_hash, stripe_subscription_id, livemode, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(12), 'teacher', 'someone-else', 'someone-else', null, TP.emailHash('used@school.example'), `sub_old_${uid(6)}`, 0, Date.now());
  assert.equal((await TP.startTeacherTrial({ user: mailed.teacher, email: 'USED@school.example' })).code, 'trialUsed');
  const seatTrial = school();
  q.run('INSERT INTO teacher_trials(id, owner_kind, owner_id, user_id, school_id, email_hash, stripe_subscription_id, livemode, created_at) VALUES (?,?,?,?,?,?,?,?,?)', uid(12), 'school', seatTrial.s.id, seatTrial.admin.id, seatTrial.s.id, null, `sub_old_${uid(6)}`, 0, Date.now());
  assert.equal((await TP.startTeacherTrial({ user: seatTrial.teacher })).code, 'trialUsed');
  // Covered already: a grant (the platform admin's), or a school seat.
  const granted = school();
  q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?, 'teacher', ?, 'teacher', ?, ?)", uid(10), granted.teacher.id, Date.now() + 30 * DAY, Date.now());
  assert.equal((await TP.startTeacherTrial({ user: granted.teacher })).code, 'entitled');
  const seated = school({ seats: 2 });
  assert.equal((await give(seated, seated.teacher.id)).status, 200);
  assert.equal((await TP.startTeacherTrial({ user: seated.teacher })).code, 'entitled');
  assert.deepEqual(TP.trialLine(seated.teacher.id), { state: 'covered', school: { id: seated.s.id, name: seated.s.name, slug: seated.s.slug } });
  // None of these made a subscription.
  for (const id of [kid.id, used.teacher.id, mailed.teacher.id, seatTrial.teacher.id, granted.teacher.id, seated.teacher.id]) assert.equal(B.customerOf('teacher', id), null, id);
  // The sign-up's own rate limit: a farm of sign-ups from one address stops getting trials.
  const farm = school();
  const { allow } = await import('../../server/services/ratelimit.js');
  for (let i = 0; i < TP.AUTO_TRIALS_PER_IP_HOUR; i++) allow('trial-auto:203.0.113.9', TP.AUTO_TRIALS_PER_IP_HOUR, 3600e3);
  assert.equal((await TP.autoStartTrial(farm.teacher, { ip: '203.0.113.9' })).code, 'slowDown');
  assert.equal(B.customerOf('teacher', farm.teacher.id), null);
});

test('a free seat nobody holds: no personal trial; "ask your school admin for one" on the done screen, the Teacher plan card and /trial', async () => {
  // A teacher who joins a school with teacher seats (an admin's invite on the sign-up's school step).
  const x = school({ seats: 3 });
  const name = `AJoin${200 + ++n}`;
  const a = await call(null, '/api/onboarding/teacher', { method: 'POST', body: { username: name, password: PW, confirm: PW, adult: '1' } });
  const who = { cookie: a.session };
  const u = auth.getUserByName(name);
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  SC.addMember(x.admin, x.s.id, u.id, 'teacher', { rosterName: 'Ms Join' });
  const r = await call(who, '/api/onboarding/classes', { method: 'POST', body: { schoolId: x.s.id, name: ['3C'], grade: ['3'] } });
  assert.equal(r.status, 200, r.text);
  assert.equal(B.customerOf('teacher', u.id), null, 'no personal trial');
  assert.equal((await TP.startTeacherTrial({ user: auth.getUser(u.id) })).code, 'askAdmin');
  const done = decode((await call(who, '/signup/teacher/done')).text);
  assert.match(done, /data-trial-line="askAdmin">Your school has Teacher plan seats: ask your school admin for one\./);
  assert.doesNotMatch(done, /ob-temail/);
  assert.match(done, /href="\/teach" id="ob-done-go">Continue/);
  assert.match(decode((await call(who, '/me/settings')).text), /Your school has Teacher plan seats: ask your school admin for one\./);
  assert.doesNotMatch(decode((await call(who, '/me/settings')).text), /href="\/trial">Try it free/);
  // /trial: the same note, and only the paid start; "Start my free trial" is refused with it.
  const trial = decode((await call(who, '/trial')).text);
  assert.match(trial, /ask your school admin for one/); assert.match(trial, /name="trial" value="0"/); assert.doesNotMatch(trial, /name="trial" value="1"/);
  const st = await call(who, '/api/trial/start', { method: 'POST', body: { email: 'join@school.example', trial: '1' } });
  assert.equal(st.status, 409); assert.match(st.json.error, /ask your school admin/);
  // Once the admin gives the seat: "Your school covers your Teacher plan".
  assert.equal((await give(x, u.id)).status, 200);
  assert.match(decode((await call(who, '/signup/teacher/done')).text), /data-trial-line="covered">Your school covers your Teacher plan\./);
  assert.equal(TP.teacherPlan(u.id).via, 'seat');
});

// ---------------------------------------------------------------- a seat meets the teacher's own plan
test('a seat given to a teacher in their own trial: the trial is closed at once at no charge, they are told, no trial-ended email, not converted, the seat takes over', async () => {
  // Their own trial first; then the school gets teacher seats.
  const x = school();
  const st = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'seat.me@school.example', trial: '1' } });
  assert.equal(st.status, 200, st.text);
  addSeats(x.s, 2);
  const sub = TP.teacherPlan(x.teacher.id).subscription;
  assert.equal(sub.status, 'trialing');
  const subId = sub.stripe_subscription_id;
  const invoices = [...fake.st.invoices.values()].filter(i => i.parent?.subscription_details?.subscription === subId).length;
  const conv = TP.trialStats().converted;
  // The admin's list: their own plan, in a trial (no "already pays" warning).
  const tab = decode((await call(x.adminWho, `/school/${x.s.slug}?tab=billing`)).text);
  assert.match(tab, /\(has their own Teacher plan\)/); assert.doesNotMatch(tab, /already pays for their own Teacher plan/);
  const r = await give(x, x.teacher.id);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.toast, 'Seat given. Their free trial was closed, with nothing charged.');
  // Stripe: cancelled now, no proration, no invoice (nothing charged).
  const del = fake.requests.filter(q2 => q2.method === 'DELETE' && q2.path === `/v1/subscriptions/${subId}`);
  assert.equal(del.length, 1);
  assert.equal(del[0].idempotencyKey, `cancel-seat-${subId}`);
  assert.equal(fake.st.subscriptions.get(subId).status, 'canceled');
  assert.equal([...fake.st.invoices.values()].filter(i => i.parent?.subscription_details?.subscription === subId).length, invoices, 'no invoice made');
  assert.equal([...fake.st.charges.values()].filter(c => c.customer === sub.stripe_customer_id && c.amount > 0).length, 0, 'never charged');
  // Ours: the seat covers them; the trial is "replaced", told once, its emails stopped without "ended".
  const plan = TP.teacherPlan(x.teacher.id);
  assert.equal(plan.entitled, true); assert.equal(plan.via, 'seat'); assert.equal(plan.school.id, x.s.id);
  assert.equal(B.ownerPlan('teacher', x.teacher.id).subscription.status, 'canceled');
  const row = q.get('SELECT * FROM teacher_trials WHERE stripe_subscription_id=?', subId);
  assert.equal(row.replaced_by_school, x.s.id); assert.ok(row.replaced_at);
  assert.match(inbox(x.teacher.id).at(-1), /Your school now covers your Teacher plan, so your free trial was closed\./);
  assert.equal(inbox(x.teacher.id).filter(m => /free trial has ended/.test(m)).length, 0);
  assert.equal(q.get('SELECT state FROM trial_emails WHERE user_id=?', x.teacher.id).state, 'replaced');
  assert.equal(q.get("SELECT COUNT(*) n FROM trial_nudges WHERE user_id=? AND step='ended'", x.teacher.id).n, 0, 'no trial-ended email');
  assert.equal(q.get("SELECT COUNT(*) n FROM trial_nudges WHERE user_id=? AND status='pending'", x.teacher.id).n, 0);
  assert.equal(TP.trialStats().converted, conv, 'not converted'); assert.ok(TP.trialStats().replaced >= 1);
  // Stripe's own webhook of the cancel arrives later: nothing more happens.
  assert.equal((await fake.emit('customer.subscription.deleted', subId)).status, 200);
  assert.equal(inbox(x.teacher.id).filter(m => /so your free trial was closed/.test(m)).length, 1);
  assert.equal(N.onTrialEnded(x.teacher.id).reason, 'replaced');
  await N.runDue(Date.now() + 1000);
  assert.equal(q.get("SELECT COUNT(*) n FROM email_log WHERE user_id=? AND template='trial_ended'", x.teacher.id).n, 0);
  // The trial counts as used (one ever), and My classes shows the seat.
  assert.equal(TP.trialUsed({ userId: x.teacher.id }), true);
  assert.match(decode((await call(x.who, '/me/settings')).text), new RegExp(`A seat from ${x.s.name}`));
  // Stripe trouble while closing it: the seat is still given, the trial left as it was (nothing marked).
  const y = school();
  assert.equal((await call(y.who, '/api/trial/start', { method: 'POST', body: { email: 'seat.two@school.example', trial: '1' } })).status, 200);
  addSeats(y.s, 2);
  const ySub = TP.teacherPlan(y.teacher.id).subscription.stripe_subscription_id;
  const saved = fake.st.subscriptions.get(ySub); fake.st.subscriptions.delete(ySub);   // Stripe answers 404 to the cancel
  const ry = await give(y, y.teacher.id);
  fake.st.subscriptions.set(ySub, saved);
  assert.equal(ry.status, 200); assert.equal(ry.json.toast, 'Seat given.');
  assert.equal(q.get('SELECT replaced_at FROM teacher_trials WHERE stripe_subscription_id=?', ySub).replaced_at, null);
});

test('a seat for a teacher who pays for their own plan: never cancelled; the admin is warned and confirms; the teacher is told they can cancel theirs in Manage billing', async () => {
  const x = school();
  assert.equal((await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'pays@school.example', trial: '1' } })).status, 200);
  addSeats(x.s, 2);
  const subId = TP.teacherPlan(x.teacher.id).subscription.stripe_subscription_id;
  assert.equal((await fake.endTrial(subId, { card: true })).status, 200);
  assert.equal(TP.ownPaid(x.teacher.id), true);
  // The Billing tab: the warning, with a confirm step on the button.
  const tab = decode((await call(x.adminWho, `/school/${x.s.slug}?tab=billing`)).text);
  assert.match(tab, /\(already pays for their own Teacher plan\)/);
  assert.match(tab, /data-confirm="This teacher already pays for their own Teacher plan\. Give them a seat anyway\? They can then cancel their own plan\."><input type="hidden" name="user" value="[^"]+"><input type="hidden" name="confirm" value="1">/);
  // Without the confirm: refused; with it: given, and nothing cancelled at Stripe.
  const no = await give(x, x.teacher.id);
  assert.equal(no.status, 409); assert.match(no.json.error, /already pays for their own Teacher plan/);
  assert.equal(TP.hasSeat(x.s.id, x.teacher.id), false);
  const yes = await give(x, x.teacher.id, { confirm: '1' });
  assert.equal(yes.status, 200, yes.text); assert.equal(yes.json.toast, 'Seat given.');
  assert.equal(fake.requests.filter(r => r.method === 'DELETE' && r.path === `/v1/subscriptions/${subId}`).length, 0);
  assert.equal(fake.st.subscriptions.get(subId).status, 'active');
  assert.equal(TP.hasSeat(x.s.id, x.teacher.id), true);
  // The teacher: a Team inbox message and the notice on their Teacher plan card, with Manage billing (the Portal).
  assert.match(inbox(x.teacher.id).at(-1), /Your school now covers your Teacher plan\. You can cancel your own plan in Manage billing: https?:\/\/[^ ]+\/me\/settings#teacher-plan/);
  const teach = decode((await call(x.who, '/me/settings')).text);
  assert.match(teach, /id="seat-paid">Your school now covers you\. You can cancel your own plan\./);
  assert.match(teach, /id="seat-paid"[\s\S]*data-api="\/api\/trial\/card"[\s\S]*btn btn-primary" type="submit">Manage billing/);
  const portal = await call(x.who, '/api/trial/card', { method: 'POST', body: { password: PW } });
  assert.equal(portal.status, 200, portal.text); assert.match(portal.json.redirect, /\/portal\/bps_/);
  // Their own plan, cancelled at the period end in the Portal: the notice goes.
  fake.update(subId, { cancelAtPeriodEnd: true });
  await fake.emit('customer.subscription.updated', subId);
  assert.doesNotMatch(decode((await call(x.who, '/me/settings')).text), /id="seat-paid"/);
});

// ---------------------------------------------------------------- /trial and Stripe trouble
test('/trial (?trial=1) starts the same trial on the server, no Checkout; a paid start (trial=0) still uses Checkout', async () => {
  // Signed out with ?trial=1: the sign-up's steps; the first class starts the trial; done says so (not /trial).
  const x = await signUp({ trial: {} });
  const c = await addClass(x);
  assert.equal(c.json.redirect, '/signup/teacher/done?trial=1');
  assert.equal(TP.teacherPlan(x.user.id).trialing, true);
  const done = await call(x.who, '/signup/teacher/done?trial=1');
  assert.equal(done.status, 200); assert.match(decode(done.text), /trial has started/);
  assert.equal((await call(x.who, '/trial')).location, '/me/settings?plan=on#teacher-plan');
  // A school's seat trial (?seats=N): no personal trial; on to /trial?seats=N as before.
  const s = await signUp({ trial: { seats: 4 } });
  await addClass(s);
  assert.equal(B.customerOf('teacher', s.user.id), null);
  assert.equal((await call(s.who, '/signup/teacher/done?trial=1&seats=4')).location, '/trial?seats=4');
  // A teacher at /trial: "Start my free trial" starts it at once (the note says so), no Checkout Session.
  const y = school();
  const page = decode((await call(y.who, '/trial')).text);
  assert.match(page, /It starts right away\. No card is needed for the trial\./); assert.doesNotMatch(page, /Stripe's page/);
  const sessions = posts('/v1/checkout/sessions').length;
  const r = await call(y.who, '/api/trial/start', { method: 'POST', body: { email: 'direct@school.example', trial: '1' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.redirect, '/me/settings?plan=welcome#teacher-plan');
  assert.equal(posts('/v1/checkout/sessions').length, sessions);
  assert.equal(posts('/v1/subscriptions').at(-1).params.metadata.trial_key, TP.emailHash('direct@school.example'));
  assert.equal(fake.st.customers.get(B.customerOf('teacher', y.teacher.id)).email, 'direct@school.example');
  assert.match(decode((await call(y.who, '/me/settings?plan=welcome')).text), /Your Teacher plan is on/);
  // A paid start (trial=0): Checkout, with the card and no trial.
  const z = school();
  const paid = await call(z.who, '/api/trial/start', { method: 'POST', body: { email: 'paid@school.example', trial: '0', password: PW } });
  assert.equal(paid.status, 200, paid.text);
  assert.match(paid.json.redirect, new RegExp(`^${fake.url}/pay/cs_test_`));
  assert.equal(posts('/v1/checkout/sessions').at(-1).params.subscription_data.trial_period_days, undefined);
});

test('Stripe trouble: the sign-up still completes, says nothing scary, and the trial can be started later', async () => {
  const x = await signUp();
  fake.failSubscriptionCreates = 1;
  const r = await addClass(x);
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/signup/teacher/done');
  assert.equal(TP.teacherPlan(x.user.id).entitled, false);
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='billing.trial.auto_skip' AND target=?", `teacher:${x.user.id}`).n, 1);
  // The done step goes on to My classes, with no error; the Teacher plan card shows no plan, nothing scary.
  const done = await call(x.who, '/signup/teacher/done');
  assert.equal(done.status, 302); assert.equal(done.location, '/teach');
  const teach = decode((await call(x.who, '/me/settings')).text);
  assert.match(teach, /id="tp-plans" href="\/plans"/); assert.doesNotMatch(teach, /class="notice warn[^>]*>[^<]*(Stripe|trial)/i);
  // Later, from /trial: it starts (the same key at Stripe is free again: the failed call made nothing).
  const later = await call(x.who, '/api/trial/start', { method: 'POST', body: { email: 'later@school.example', trial: '1' } });
  assert.equal(later.status, 200, later.text);
  assert.equal(TP.teacherPlan(x.user.id).trialing, true);
  // Stripe unreachable entirely: the classes step still answers.
  const y = await signUp();
  config.stripeApiBase = 'http://127.0.0.1:9';
  (await import('../../server/services/stripe.js'))._reset();
  const ry = await addClass(y);
  config.stripeApiBase = fake.url;
  (await import('../../server/services/stripe.js'))._reset();
  assert.equal(ry.status, 200, ry.text);
  assert.equal(TP.teacherPlan(y.user.id).entitled, false);
});
