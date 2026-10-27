// The plans page and the Basic plan (docs/decisions.md "Paid plans" §17): /plans and /plans/schools, the Plans link in
// everyone's menu, prices read from Stripe by lookup key, pay first and link children after, the Basic plan (one
// child, its own extra messages and AI backstop), switching Basic <-> Family on the same subscription (the Customer
// Portal), and prices nowhere else a child looks. Billing is on against the fake Stripe (tests/support/fake-stripe.js),
// reached through the real stripe SDK; webhooks are signed and checked for real. Every key and secret is a short fake.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_plans';
const fake = await startFakeStripe({ webhookSecret: SECRET, apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = SECRET;
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
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
const { grownupMay } = await import('../../server/routes/family.js');
const { viewerOf } = await import('../../server/routes/plans.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const PW = 'a-long-password-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcFamily: 'pmc_fakefamily', termsPublished: false, billingPublic: true, billingPreviewToken: '', builderDailyTurns: 3, familyExtraMessages: 5, basicExtraMessages: 2, familyChildDailyMax: 4, familyMonthlyAiUsd: 4, basicMonthlyAiUsd: 2.5, familyMaxChildren: 4, proTurnWeight: 1, anthropicKey: '', aiPaidMonthlyBudgetUsd: null, aiHardMonthlyUsd: null, contactEmail: 'help@example.com' };
test.beforeEach(() => { Object.assign(config, defaults); resetLimits(); fake.violations.length = 0; });

// ---------------------------------------------------------------- helpers
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
const kid = () => auth.createUser({ username: `Pl${++n}${uid(4)}`, password: 'rainbow-77' });
function grownup({ tester = true } = {}) {
  const u = auth.createUser({ username: `Gp${++n}${uid(4)}`, password: PW, accountType: 'grownup' });
  F.ensureFamily(u);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  return auth.getUser(u.id);
}
/** Links a child to a family the way the child's Yes does (linked_at in order). */
function link(fam, child, at = Date.now()) {
  q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", fam.id, child.id, at, at);
}
/** A grown-up with no child yet, signed in, password typed again. */
function parent(opts) {
  const g = grownup(opts); const fam = F.familyOfOwner(g.id); const who = signIn(g); C.markReauth(who.sid);
  return { g, fam, who };
}
const checkout = (who, body) => call(who, '/api/billing/family/checkout', { method: 'POST', body });
async function pay(url) { const r = await fetch(url, { redirect: 'manual' }); assert.equal(r.status, 302, await r.text()); return r.headers.get('location'); }
/** A family that paid for a plan through the fake Checkout (no child needed). -> { …parent(), subId } */
async function paying(plan = 'family', interval = 'month') {
  const p = parent();
  const r = await checkout(p.who, { plan, interval });
  assert.equal(r.status, 200, r.text);
  await pay(r.json.redirect);
  const op = B.ownerPlan('family', p.fam.id);
  assert.equal(op.entitled, true); assert.equal(op.plan, plan);
  return { ...p, subId: op.subscription.stripe_subscription_id };
}
function build(user) {
  return tx(() => {
    const c = usage.takeTurn(user, today());
    if (!c) return false;
    turns.create({ gameId: uid(10), userId: user.id, status: 'done', chargedDay: today(), chargedTo: c.source, weight: c.weight });
    return c;
  });
}
const audits = (action, target) => q.all('SELECT * FROM audit_log WHERE action=? AND target=?', action, target);
const main = html => html.slice(html.indexOf('<main'), html.indexOf('</main>'));
const decode = s => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
const boss = auth.createUser({ username: `PBoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
function school() {
  const s = SC.createSchool(boss, { name: `Plans School ${++n} ${uid(4)}` }).school;
  const admin = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms Admin', role: 'admin' }).user;
  const teacher = SC.createSchoolAccount(boss, s.id, { rosterName: 'Mr Teach', role: 'teacher' }).user;
  const student = SC.createSchoolAccount(admin, s.id, { rosterName: 'Stu' }).user;
  return { s: SC.getSchool(s.id), admin: auth.getUser(admin.id), teacher: auth.getUser(teacher.id), student: auth.getUser(student.id) };
}

// ---------------------------------------------------------------- the page and the menu
test('/plans and the menu\'s Plans link: on for everyone while paid-plan pages are on, gone otherwise', async () => {
  const k = kid(), g = grownup(), { teacher, student } = school();
  for (const who of [null, signIn(k), signIn(g), signIn(teacher), signIn(student), signIn(auth.createGuest())]) {
    const home = await call(who, '/');
    assert.match(home.text, /<a class="navlink" href="\/plans"[^>]*><span class="emo" aria-hidden="true">⭐<\/span>Plans<\/a>/);
    assert.match(home.text, /<a class="tab" href="\/plans"/, 'also in the phone tab bar');
    const r = await call(who, '/plans');
    assert.equal(r.status, 200);
    assert.match(r.text, /<a class="navlink" href="\/plans" aria-current="page"/);
  }
  assert.equal((await call(null, '/plans/schools')).status, 200);
  for (const off of [{ billingPublic: false }, { stripeApiKey: '' }]) {
    Object.assign(config, off);
    for (const p of ['/plans', '/plans/schools']) assert.equal((await call(null, p)).status, 404, `${JSON.stringify(off)} ${p}`);
    assert.doesNotMatch((await call(signIn(k), '/')).text, /href="\/plans"/);
    Object.assign(config, defaults);
  }
  // The preview cookie opens it before BILLING_PUBLIC, like the other paid-plan pages.
  Object.assign(config, { billingPublic: false, billingPreviewToken: 'x'.repeat(30) });
  assert.equal((await call({ cookie: `${F.PREVIEW_COOKIE}=${'x'.repeat(30)}` }, '/plans')).status, 200);
  // A grown-up account may open it (the fence).
  assert.ok(grownupMay('GET', '/plans') && grownupMay('GET', '/plans/schools'));
  assert.equal(viewerOf(null), 'out'); assert.equal(viewerOf(g), 'grownup'); assert.equal(viewerOf(teacher), 'staff'); assert.equal(viewerOf(k), 'kid'); assert.equal(viewerOf(student), 'kid');
});

test('four cards like a pricing page: Free, Basic, Family (recommended), School, with prices from Stripe and a monthly / yearly switch', async () => {
  let r = decode((await call(null, '/plans')).text);
  const m = main(r);
  assert.deepEqual([...m.matchAll(/<section class="plan-card[^"]*" id="plan-(\w+)"/g)].map(x => x[1]), ['free', 'basic', 'family', 'school']);
  assert.match(m, /<h2 id="plan-free-h">Free<\/h2>[\s\S]*\$0</);
  assert.match(m, /<h2 id="plan-basic-h">Basic<\/h2><p class="plan-tag muted">For one young builder<\/p>[\s\S]*\$4\.99<\/span> <span class="per">a month/);
  assert.match(m, /<h2 id="plan-family-h">Family<\/h2><p class="plan-tag muted">For up to 4 children<\/p>[\s\S]*\$7\.99<\/span> <span class="per">a month/);
  assert.match(m, /\$20\.00<\/span> <span class="per">per student a year[\s\S]*For at least 25 students/);
  // Recommended: the Family card only.
  assert.equal((m.match(/class="plan-badge"/g) || []).length, 1);
  assert.match(m, /<section class="plan-card recommended" id="plan-family"/);
  // What each gives, in plain words, with the counts from the settings.
  assert.match(m, /2 extra Builder messages a month/);
  assert.match(m, /5 extra Builder messages a month, shared by up to 4 children/);
  assert.match(m, /Play every game/); assert.match(m, /Build games with the free daily Builder messages/);
  assert.match(m, /100 Builder messages a year for each paid student/);
  // The disclosed limits, tax and the policies.
  assert.match(m, /One child can use up to 4 extra messages a day\./);
  assert.match(m, /unusually expensive to run/);
  assert.match(m, /<a href="\/terms">Terms of Service<\/a>/); assert.match(m, /<a href="\/refunds">Refund and Cancellation Policy<\/a>/);
  // Never "child plan" or "Plus".
  assert.doesNotMatch(m, /child plan|Plus plan|>Plus</i);
  // Signed out: each paid plan leads to the grown-up sign-up with the plan kept; Free to the kid sign-up.
  assert.match(m, /href="\/grown-ups\/signup\?plan=basic&interval=month">Choose Basic</);
  assert.match(m, /href="\/grown-ups\/signup\?plan=family&interval=month">Choose Family</);
  assert.match(m, /href="\/signup">Start free</);
  assert.match(m, /href="\/plans\/schools">Get a school plan</);
  // Yearly.
  r = decode((await call(null, '/plans?interval=year')).text);
  assert.match(r, /<a href="\/plans\?interval=year" aria-current="page">Yearly<\/a>/);
  assert.match(r, /\$45\.00<\/span> <span class="per">a year/);
  assert.match(r, /\$69\.00<\/span> <span class="per">a year/);
  assert.match(r, /That's \$3\.75 a month, paid once a year\./);
  assert.match(r, /href="\/grown-ups\/signup\?plan=family&interval=year"/);
});

test('prices follow Stripe\'s Price objects (by lookup key, cached), never a number in the code', async () => {
  const price = fake.st.prices.get('oomba_basic_monthly');
  price.unit_amount = 599;
  await S.prices({ refresh: true });
  assert.match(decode((await call(null, '/plans')).text), /\$5\.99<\/span> <span class="per">a month/);
  price.unit_amount = 499;
  await S.prices({ refresh: true });
  assert.match(decode((await call(null, '/plans')).text), /\$4\.99/);
  // A missing price: the card says so instead of a made-up number.
  fake.st.prices.delete('oomba_basic_yearly');
  await S.prices({ refresh: true });
  const p = await C.planPrices();
  assert.equal(p.basic, null); assert.ok(p.family);
  assert.match(main(decode((await call(null, '/plans')).text)), /id="plan-basic"[\s\S]*Price coming soon[\s\S]*id="plan-family"/);
  fake.st.prices.set('oomba_basic_yearly', { ...price, id: 'price_fake_basic_yearly', lookup_key: 'oomba_basic_yearly', unit_amount: 4500, recurring: { interval: 'year', interval_count: 1, usage_type: 'licensed' } });
  await S.prices({ refresh: true });
});

test('a kid sees the plans but can\'t buy: a calm "a grown-up buys plans" panel, no sign-up links, no countdown', async () => {
  const k = kid();
  const who = signIn(k);
  let m = main(decode((await call(who, '/plans')).text));
  assert.doesNotMatch(m, /href="\/(grown-ups|family)/);
  assert.match(m, /href="\/plans\?interval=month&ask=basic#ask">How to get it</);
  assert.match(m, /id="plan-free"[\s\S]*<span class="plan-yours">Your plan<\/span>[\s\S]*id="plan-basic"/);
  assert.doesNotMatch(m, /id="ask"/);
  m = main(decode((await call(who, '/plans?ask=family')).text));
  assert.match(m, /<section class="panel plan-ask" id="ask"[^>]*><h2 id="ask-h"><span aria-hidden="true">🧑‍🧒<\/span> A grown-up buys plans<\/h2>/);
  assert.match(m, /They can sign up at <bdi dir="ltr"><b>127\.0\.0\.1:\d+\/plans<\/b><\/bdi>\./);
  assert.match(m, /You can keep playing and building for free\./);
  assert.doesNotMatch(m, /hurry|only \d+ left|today only|countdown|ends in/i);
  // A kid whose family pays: their plan is marked, and the buttons still don't sell.
  const f = await paying('basic');
  const c = kid(); link(f.fam, c);
  m = main(decode((await call(signIn(c), '/plans')).text));
  assert.match(m, /id="plan-basic"[\s\S]*<span class="plan-yours">Your plan<\/span>[\s\S]*id="plan-family"/);
  assert.doesNotMatch(m, /id="plan-free"[\s\S]*plan-yours[\s\S]*id="plan-basic"/);
  // A school student (a class context): no plan marked at all.
  const { student, teacher } = school();
  m = main(decode((await call(signIn(student), '/plans?ask=basic')).text));
  assert.doesNotMatch(m, /plan-yours/);
  assert.match(m, /A grown-up buys plans/);
  // A teacher: Basic and Family are for families; the School card.
  m = main(decode((await call(signIn(teacher), '/plans?ask=basic')).text));
  assert.match(m, /Basic and Family are for families/);
  assert.match(m, /href="#plan-school">See the School plan</);
  assert.match(m, /href="\/plans\/schools">Get a school plan</);
});

test('School: a school admin goes to their Billing tab; everyone else to the "for schools" page with the contact email', async () => {
  const { s, admin, teacher } = school();
  const m = main(decode((await call(signIn(admin), '/plans')).text));
  assert.match(m, new RegExp(`href="/school/${s.slug}\\?tab=billing">Get a school plan<`));
  assert.match(main(decode((await call(signIn(boss), '/plans')).text)), /href="\/admin\/billing">Get a school plan</);
  const page = decode((await call(signIn(teacher), '/plans/schools')).text);
  assert.match(page, /Oomba Academy for schools/);
  assert.match(page, /\$20\.00 per student per year, for at least 25 students/);
  assert.match(page, /How to set up a school/);
  assert.match(page, /<a href="mailto:help@example\.com" dir="ltr">help@example\.com<\/a>/);
  assert.doesNotMatch(page, /tab=billing/, 'a teacher gets no Billing tab link');
  assert.match(decode((await call(signIn(admin), '/plans/schools')).text), new RegExp(`href="/school/${s.slug}\\?tab=billing">Go to your school's Billing tab<`));
});

// ---------------------------------------------------------------- pay first, link kids after
test('signed out → pick a plan → grown-up sign-up keeps it → /family asks for it (password, then Checkout) → add a child', async () => {
  const su = await call(null, '/grown-ups/signup?plan=family&interval=year');
  su.text = decode(su.text);
  assert.match(su.text, /You picked the Family plan\./);
  assert.match(su.text, /<input type="hidden" name="plan" value="family"><input type="hidden" name="interval" value="year">/);
  assert.match(su.text, /href="\/grown-ups\/login\?plan=family&interval=year"/);
  const li = await call(null, '/grown-ups/login?plan=basic&interval=month');
  assert.match(li.text, /<input type="hidden" name="next" value="\/family\?plan=basic&amp;interval=month">/);
  assert.match((await call(null, '/grown-ups/signup?plan=nope')).text, /<form data-api="\/api\/grown-ups\/signup" novalidate>\s*<div/, 'an unknown plan is ignored');
  const name = `Npar${uid(5)}`;
  const r = await call(null, '/api/grown-ups/signup', { method: 'POST', body: { username: name, password: PW, confirm: PW, adult: '1', plan: 'family', interval: 'year' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, '/family?plan=family&interval=year');
  const g = auth.getUserByName(name);
  q.run('UPDATE users SET billing_tester=1 WHERE id=?', g.id);
  const who = signIn(auth.getUser(g.id));
  // The picked plan first on /family: the yearly button first and primary, the password field, no child needed.
  const page = decode((await call(who, '/family?plan=family&interval=year')).text);
  assert.ok(page.indexOf('id="plan"') < page.indexOf('id="kids-h"'), 'the plan to pay for comes first');
  assert.match(page, /Start your Family plan/);
  assert.match(page, /You add your children after paying/);
  assert.match(page, /<input type="hidden" name="plan" value="family">/);
  assert.match(page, /<button class="btn btn-primary" type="submit" name="interval" value="year">Subscribe: \$69\.00 a year<\/button><button class="btn " type="submit" name="interval" value="month">/);
  assert.match(page, /id="pw-checkout"/);
  // The password, then Stripe.
  const c = await checkout(who, { plan: 'family', interval: 'year' });
  assert.equal(c.status, 403); assert.equal(c.json.needPassword, true);
  const ok = await checkout(who, { plan: 'family', interval: 'year', password: PW });
  assert.equal(ok.status, 200, ok.text);
  const back = await pay(ok.json.redirect);
  assert.match(back, /\/family\?checkout=cs_test_/);
  const fam = F.familyOfOwner(g.id);
  assert.equal(B.ownerPlan('family', fam.id).plan, 'family');
  assert.equal(JSON.parse(audits('billing.checkout.start', `family:${fam.id}`)[0].details).plan, 'family');
  // Back on /family: the welcome says what to do next, with the steps.
  const done = decode((await call(who, new URL(back).pathname + new URL(back).search)).text);
  assert.match(done, /Your Family plan is on\. Thank you!/);
  assert.match(done, /<h2 id="welcome-h">Now add your child<\/h2>/);
  assert.match(done, /Your child signs in, opens <b>Me<\/b>/);
  assert.match(done, /href="\/family\/link">➕ Link a child</);
  assert.match(decode((await call(who, '/family?welcome=1')).text), /Now add your child/);
  // The plan card: Family, extras, Manage billing and Change plan.
  assert.match(done, /class="planchip paid">Family plan</);
  assert.match(done, /Yearly, renews on/);
  assert.match(done, /5 of 5 extra messages left this month/);
  assert.match(done, /Covers up to 4 children\./);
  assert.match(done, /data-api="\/api\/billing\/portal"/);
  assert.match(done, /href="\/plans">Change plan</);
  // The waiting page goes back to the welcome.
  const s2 = parent();
  const open = await checkout(s2.who, { plan: 'basic', interval: 'month' });
  const sid = open.json.redirect.split('/pay/')[1];
  assert.match((await call(s2.who, `/family?checkout=${sid}`)).text, /data-back="\/family\?welcome=1"/);
});

test('a grown-up on /plans: their plan is marked; paying goes through /family; switching goes through Manage billing', async () => {
  const p = parent();
  let m = main(decode((await call(p.who, '/plans?interval=year')).text));
  assert.match(m, /id="plan-free"[\s\S]*plan-yours[\s\S]*id="plan-basic"/);
  assert.match(m, /href="\/family\?plan=basic&interval=year#checkout">Choose Basic</);
  assert.match(m, /href="\/family\?plan=family&interval=year#checkout">Choose Family</);
  const f = await paying('basic');
  m = main(decode((await call(f.who, '/plans')).text));
  assert.match(m, /id="plan-basic"[\s\S]*<span class="plan-yours">Your plan<\/span><a class="btn btn-block" href="\/family#plan">Manage your plan</);
  assert.match(m, /href="\/family\?plan=family&interval=month#plan">Switch to this plan</);
  const fam = decode((await call(f.who, '/family?plan=family&interval=month')).text);
  assert.match(fam, /To switch to the Family plan, open Manage billing/);
  assert.doesNotMatch(fam, /data-api="\/api\/billing\/family\/checkout"/, 'no second Checkout: the switch is in the Portal');
  // A second Checkout is refused (one plan per family; Basic and Family are both family plans).
  const r = await checkout(f.who, { plan: 'family', interval: 'month' });
  assert.equal(r.status, 409); assert.match(r.json.error, /already has a plan/);
});

// ---------------------------------------------------------------- the Basic plan
test('Basic: one child, BASIC_EXTRA_MESSAGES a month, its own AI backstop; a second child can\'t be linked', async () => {
  const f = await paying('basic');
  assert.equal(F.maxChildrenFor(f.fam.id), 1);
  const a = kid(); link(f.fam, a);
  // Free daily messages first (3), then the Basic plan's 2 extras.
  for (let i = 0; i < 3; i++) assert.equal(build(a).source, 'free');
  assert.equal(build(a).source, `family:${f.fam.id}`);
  assert.equal(build(a).source, `family:${f.fam.id}`);
  assert.equal(build(a), false, 'the month\'s 2 extras are used');
  assert.equal(usage.allowanceFor(a).extraLeft, 0);
  // Linking a second child is refused while the plan is Basic.
  const b = kid();
  const code = F.createCode(b).code;
  const r = await call(f.who, '/api/family/link', { method: 'POST', body: { code } });
  assert.equal(r.status, 409); assert.match(r.json.error, /Basic plan covers 1 child/);
  const page = decode((await call(f.who, '/family')).text);
  assert.match(page, /class="planchip paid">Basic plan</);
  assert.match(page, /0 of 2 extra messages left this month|2 of 2 extra messages left this month/);
  assert.match(page, /Covers 1 child\./);
  assert.match(page, /Your Basic plan covers 1 child\. To link more, switch to the Family plan/);
  assert.doesNotMatch(page, /href="\/family\/link">➕/);
  assert.match(page, /Extra messages come from your Basic plan\./);
  // The AI backstop is BASIC_MONTHLY_AI_USD.
  const g2 = await paying('basic'); const c = kid(); link(g2.fam, c);
  for (let i = 0; i < 3; i++) build(c);
  assert.equal(build(c).source, `family:${g2.fam.id}`);
  q.run('UPDATE builder_turns SET usd=2.6 WHERE user_id=? AND charged_to=?', c.id, `family:${g2.fam.id}`);
  assert.equal(usage.allowanceFor(c).extraLeft, 0, 'past $2.50 this month: no more extras');
  config.basicMonthlyAiUsd = 5;
  assert.equal(usage.allowanceFor(c).extraLeft, 1);
});

test('the paid AI pool counts each family with its own plan\'s backstop', async () => {
  const before = B.paidFamiliesUsd();
  const nBefore = B.paidFamiliesThisMonth();
  await paying('basic'); await paying('family');
  assert.equal(B.paidFamiliesThisMonth(), nBefore + 2);
  assert.equal(B.paidFamiliesUsd(), before + 2.5 + 4);
  assert.ok(aiBudget.paidMonthly() >= 6.5);
  assert.deepEqual(B.planLimits('basic'), { plan: 'basic', extra: 2, maxChildren: 1, aiUsd: 2.5 });
  assert.deepEqual(B.planLimits('family'), { plan: 'family', extra: 5, maxChildren: 4, aiUsd: 4 });
});

test('Family → Basic in the Portal (same subscription, new price): the plan changes, links stay, only the first child keeps extras, and /family says so', async () => {
  const f = await paying('family');
  const first = kid(), second = kid();
  link(f.fam, first, Date.now() - 60e3); link(f.fam, second, Date.now());
  assert.equal(usage.familyOf(first.id), f.fam.id); assert.equal(usage.familyOf(second.id), f.fam.id);
  // The Portal switch: customer.subscription.updated with the Basic price.
  fake.switchPrice(f.subId, 'oomba_basic_monthly');
  const r = await fake.emit('customer.subscription.updated', f.subId);
  assert.equal(r.status, 200);
  const row = q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', f.subId);
  assert.equal(row.plan, 'basic'); assert.equal(row.price_lookup_key, 'oomba_basic_monthly');
  assert.equal(B.ownerPlan('family', f.fam.id).plan, 'basic');
  assert.equal(B.ownerPlan('family', f.fam.id).entitled, true);
  const a = audits('billing.plan.change', `family:${f.fam.id}`);
  assert.equal(a.length, 1); assert.deepEqual({ from: JSON.parse(a[0].details).from, to: JSON.parse(a[0].details).to }, { from: 'family', to: 'basic' });
  // Both links stay; the extras are the first linked child's only.
  assert.equal(F.childrenOf(f.fam.id).filter(k => k.status === 'linked').length, 2);
  assert.equal(usage.familyOf(first.id), f.fam.id);
  assert.equal(usage.familyOf(second.id), null);
  for (let i = 0; i < 3; i++) build(second);
  assert.equal(build(second), false, 'the second child has the free messages, like anyone');
  assert.deepEqual(usage.coveredChildren(f.fam.id, 'basic'), [first.id]);
  const page = decode((await call(f.who, '/family')).text);
  assert.match(page, new RegExp(`Your Basic plan covers one child: <b><bdi>${first.display_name}</bdi></b>\\. Your other linked children build with the free daily messages`));
  assert.match(page, /Extra messages come from your Basic plan\.[\s\S]*Uses the free daily messages\./);
  // And back: Basic → Family covers both again, and more children can be linked.
  fake.switchPrice(f.subId, 'oomba_family_yearly');
  await fake.emit('customer.subscription.updated', f.subId);
  assert.equal(B.ownerPlan('family', f.fam.id).plan, 'family');
  assert.equal(usage.familyOf(second.id), f.fam.id);
  assert.equal(F.maxChildrenFor(f.fam.id), 4);
  assert.doesNotMatch(decode((await call(f.who, '/family')).text), /id="basic-note"/);
  assert.equal(audits('billing.plan.change', `family:${f.fam.id}`).length, 2);
});

test('one plan per family: a Basic and a Family plan both paid → the second is cancelled and refunded', async () => {
  const p = parent();
  const a = await checkout(p.who, { plan: 'basic', interval: 'month' });
  const b = await checkout(p.who, { plan: 'family', interval: 'month' });   // expires the first session
  assert.equal(b.status, 200);
  await pay(b.json.redirect);
  assert.equal(B.ownerPlan('family', p.fam.id).plan, 'family');
  // The first session, paid anyway at Stripe (e.g. in another tab before it expired).
  const sid = a.json.redirect.split('/pay/')[1];
  const s = fake.st.sessions.get(sid);
  const sub = fake.subscription({ customer: s.customer, lookupKey: 'oomba_basic_monthly', metadata: s.metadata });
  Object.assign(s, { status: 'complete', payment_status: 'paid', subscription: sub.id });
  await fake.emit('checkout.session.completed', sid);
  const row = q.get('SELECT * FROM billing_subscriptions WHERE stripe_subscription_id=?', sub.id);
  assert.equal(row.flag, 'duplicate');
  assert.equal(fake.st.subscriptions.get(sub.id).status, 'canceled');
  assert.equal(B.ownerPlan('family', p.fam.id).plan, 'family');
});

// ---------------------------------------------------------------- prices stay on /plans
test('prices are on /plans only: kid pages (Studio, Me, games, Build, Home) carry none, only the menu\'s Plans link', async () => {
  const f = await paying('family');
  const c = kid(); link(f.fam, c);
  for (let i = 0; i < 20 && build(c); i++);   // at the limit
  const who = signIn(c);
  const studio = await call(who, '/build');
  for (const p of ['/', '/me', '/build', '/search', '/friends', '/safety']) {
    const r = await call(who, p);
    if (r.status !== 200) continue;
    const text = r.text.replace(/<a [^>]*href="\/plans"[^>]*>[\s\S]*?<\/a>/g, '');
    assert.doesNotMatch(text, /\$\s?\d|\d\.\d\d\b|per month|a month|Basic plan|Family plan|href="\/(grown-ups|family)/, p);
    assert.doesNotMatch(text, /href="\/plans/, `${p}: no other link to /plans`);
  }
  assert.equal(studio.status, 200);
  assert.match((await call(who, '/plans')).text, /\$7\.99/, 'the plans page itself has them');
});

test('/parents and /grown-ups link to /plans', async () => {
  assert.match((await call(null, '/parents')).text, /<a class="btn btn-primary" href="\/plans">See plans and prices<\/a>/);
  assert.match((await call(null, '/grown-ups')).text, /<a class="btn" href="\/plans">Compare plans and prices<\/a>/);
  config.billingPublic = false;
  assert.doesNotMatch((await call(null, '/parents')).text, /href="\/plans"/);
});
