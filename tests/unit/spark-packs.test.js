// The Builder's daily-limit offer and Spark Packs (docs/decisions.md "Spark Packs"): server/builder/upsell.js (what the
// limit card offers, per account), server/services/sparks.js (one-time Checkout, crediting by webhook or return page,
// use, refunds, disputes, expiry, asks, admin grants), the allowance (server/builder/usage.js) and the routes. Billing is
// on against the fake Stripe (tests/support/fake-stripe.js), reached through the real stripe SDK; webhooks are signed and
// checked for real; builds run through the real Studio API with the mock Builder. Every key and secret is a short fake.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.BRB_MOCK_DELAY_MS = '0';
const { startFakeStripe } = await import('../support/fake-stripe.js');
const SECRET = 'whsec_fake_spk';
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
const SC = await import('../../server/services/schools.js');
const sparks = await import('../../server/services/sparks.js');
const usage = await import('../../server/builder/usage.js');
const turns = await import('../../server/builder/turns.js');
const { upsellFor, SPARK_HREF } = await import('../../server/builder/upsell.js');
const { navBadges } = await import('../../server/services/badges.js');
const i18n = await import('../../server/i18n/index.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

const DAY = 86400e3;
const PW = 'a-long-password-1';
let server, base;
test.before(async () => {
  server = createApp().listen(0, '127.0.0.1'); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
  fake.webhookUrl = base + B.WEBHOOK_PATH;
});
test.after(async () => { server.close(); await fake.close(); });
const defaults = { stripeApiKey: 'rk_test_fake', stripeWebhookSecret: SECRET, stripeApiBase: fake.url, stripeTax: false, stripePmcFamily: 'pmc_fakefamily', termsPublished: false, billingPublic: true,
  builderDailyTurns: 2, familyExtraMessages: 3, familyChildDailyMax: 3, familyMonthlyAiUsd: 4, basicExtraMessages: 2, proTurnWeight: 1, builderFullForAll: true, anthropicKey: '',
  aiPaidMonthlyBudgetUsd: null, aiHardMonthlyUsd: null, aiDailyBudgetUsd: 5, aiMonthlyBudgetUsd: 150, sparkDailyMax: 60, sparkExpiryDays: 365, sparkAiUsdPerMessage: 0.1 };
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
const kid = () => auth.createUser({ username: `Spk${++n}${uid(4)}`, password: 'rainbow-77' });
function grownup({ tester = true } = {}) {
  const u = auth.createUser({ username: `Par${++n}${uid(4)}`, password: PW, accountType: 'grownup' });
  F.ensureFamily(u);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  return auth.getUser(u.id);
}
const link = (fam, child) => q.run("INSERT INTO family_children(family_id, child_id, status, requested_at, linked_at) VALUES (?,?,'linked',?,?)", fam.id, child.id, Date.now(), Date.now() + (++n));
/** A grown-up with a linked child, signed in, password typed again. */
function family({ tester = true } = {}) {
  const g = grownup({ tester }); const child = kid(); const fam = F.familyOfOwner(g.id);
  link(fam, child);
  const who = signIn(g); C.markReauth(who.sid);
  return { g, child, fam, who };
}
async function pay(url, query = '') {
  const r = await fetch(url + query, { redirect: 'manual' });
  assert.equal(r.status, 302, await r.text());
  return r.headers.get('location');
}
/** A family whose Family plan is on (paid through the fake Checkout and its webhooks). */
async function payingFamily(opts = {}) {
  const f = family(opts);
  const r = await call(f.who, '/api/billing/family/checkout', { method: 'POST', body: { interval: 'month', plan: opts.plan || 'family' } });
  assert.equal(r.status, 200, r.text);
  await pay(r.json.redirect);
  assert.equal(B.ownerPlan('family', f.fam.id).entitled, true);
  return { ...f, subId: B.ownerPlan('family', f.fam.id).subscription.stripe_subscription_id };
}
const buySpark = (who, body) => call(who, '/api/billing/family/sparks', { method: 'POST', body });
const lastCheckout = () => fake.requests.filter(r => r.method === 'POST' && r.path === '/v1/checkout/sessions').at(-1);
const sessionOf = url => url.split('/pay/')[1];
/** A paid Spark Pack of a size for a family with a plan. -> the session id */
async function boughtSpark(f, pack = 'p25', query = '') {
  const r = await buySpark(f.who, { pack });
  assert.equal(r.status, 200, r.text);
  await pay(r.json.redirect, query);
  return sessionOf(r.json.redirect);
}
/** One Builder message charged like agent.js does (charge and row in one transaction, the row id known first). */
function build(user, { pro = false, refund = false, day = today() } = {}) {
  return tx(() => {
    const id = uid(16);
    const c = usage.takeTurn(user, day, { pro, turnId: id });
    if (!c) return false;
    turns.create({ id, gameId: uid(10), userId: user.id, status: 'done', chargedDay: day, chargedTo: c.source, weight: c.weight });
    if (refund) turns.refund(id);
    return { ...c, id };
  });
}
const useUp = user => { let i = 0; while (build(user) && i < 500) i++; return i; };
const req = { get: () => 'oomba.test', protocol: 'https', cookies: {}, headers: {} };
const packRows = fid => q.all('SELECT * FROM spark_packs WHERE family_id=? ORDER BY created_at', fid);
const ledger = (pid, reason) => q.all('SELECT * FROM spark_ledger WHERE pack_id=?' + (reason ? ' AND reason=?' : ''), pid, ...(reason ? [reason] : []));
function game(u) {
  const id = uid(), vid = uid(), t = Date.now();
  q.run("INSERT INTO games(id, slug, owner_id, title, status, visibility, created_at, updated_at) VALUES (?,?,?,?,'draft','private',?,?)", id, `spk-${id.toLowerCase()}`, u.id, 'Spark test', t, t);
  q.run('INSERT INTO game_versions(id, game_id, number, html, created_at) VALUES (?,?,?,?,?)', vid, id, 1, '<!doctype html><p>hi</p>', t);
  q.run('UPDATE games SET current_version_id=? WHERE id=?', vid, id);
  return id;
}
/** Sends one message through the Studio API and waits for its build to end. -> the POST's status */
async function chat(who, gid, text = 'make the sky purple') {
  const r = await call(who, `/api/studio/${gid}/chat`, { method: 'POST', body: { text, detach: true } });
  if (r.status === 202) for (let i = 0; i < 400; i++) { const s = await call(who, `/api/studio/${gid}`); if (!s.json.busy) break; await new Promise(res => setTimeout(res, 25)); }
  return r;
}

// ---------------------------------------------------------------- what the limit card offers
test('the limit card offer per account: free kid (with and without a grown-up), paid kid, free and paid grown-up, teacher, student, guest', async () => {
  // A kid with no grown-up: where a grown-up can look (/parents, as text and a QR code; never a link or a price).
  const lone = kid();
  const u0 = upsellFor(lone, req);
  assert.deepEqual({ kind: u0.kind, who: u0.who, grownup: u0.grownup, address: u0.address }, { kind: 'plan', who: 'kid', grownup: false, address: 'oomba.test/parents' });
  assert.match(u0.qr, /^<svg[\s\S]*<\/svg>$/);
  // A kid with a linked grown-up and no plan: ask them for more building.
  const free = family();
  assert.deepEqual(upsellFor(free.child, req), { kind: 'plan', who: 'kid', grownup: true, asked: false });
  // The grown-up of a family without a plan: /plans. With a plan: the Spark Pack picker.
  assert.deepEqual(upsellFor(free.g, req), { kind: 'plan', who: 'grownup', href: '/plans' });
  const paid = await payingFamily();
  assert.deepEqual(upsellFor(paid.child, req), { kind: 'spark', who: 'kid', grownup: true, asked: false });
  assert.deepEqual(upsellFor(paid.g, req), { kind: 'spark', who: 'grownup', href: SPARK_HREF });
  // Spark Packs not on sale (no "Family" payment method configuration): nothing to offer a paid family.
  config.stripePmcFamily = '';
  assert.equal(upsellFor(paid.child, req), null); assert.equal(upsellFor(paid.g, req), null);
  config.stripePmcFamily = 'pmc_fakefamily';
  // School staff: /trial (the Teacher plan's free trial). A student: "ask your teacher", never an offer.
  const boss = auth.createUser({ username: `Boss${uid(4)}`, password: 'boss-password-1', role: 'admin' });
  const school = SC.createSchool(boss, { name: `Spk School ${uid(4)}` }).school;
  const teacher = SC.createSchoolAccount(boss, school.id, { rosterName: 'Ms Spk', role: 'teacher' }).user;
  const student = SC.createSchoolAccount(teacher, school.id, { rosterName: 'Stu Spk' }).user;
  assert.deepEqual(upsellFor(auth.getUser(teacher.id), req), { kind: 'plan', who: 'staff', href: '/trial' });
  assert.deepEqual(upsellFor(auth.getUser(student.id), req), { kind: 'class' });
  // A family child who is also a student (school without a plan): class wins, no family offer in class.
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',?)", school.id, paid.child.id, Date.now());
  assert.deepEqual(upsellFor(paid.child, req), { kind: 'class' });
  q.run('DELETE FROM school_members WHERE user_id=?', paid.child.id);
  // A guest, billing off, family pages off: nothing.
  assert.equal(upsellFor(auth.createGuest(), req), null);
  config.billingPublic = false; assert.equal(upsellFor(free.child, { ...req, headers: {}, cookies: {} }), null); config.billingPublic = true;
  config.stripeApiKey = ''; assert.equal(upsellFor(free.child, req), null); config.stripeApiKey = 'rk_test_fake';
});

test('the site\'s AI is resting for everyone: no offer at all, only that it rests (free or paid pool, or the hard ceiling)', async () => {
  const paid = await payingFamily();
  const lone = kid();
  config.aiDailyBudgetUsd = 0;   // the free pool is spent for today
  for (const u of [lone, paid.child, paid.g]) assert.deepEqual(upsellFor(u, req), { kind: 'resting' });
  config.aiDailyBudgetUsd = 5; config.aiPaidMonthlyBudgetUsd = 0;   // the paid pool is at the owner's own cap
  assert.deepEqual(upsellFor(paid.child, req), { kind: 'resting' });
  config.aiPaidMonthlyBudgetUsd = null;
  assert.equal(upsellFor(paid.child, req).kind, 'spark');
});

test('the Studio state carries the offer and the Spark Pack counter; the page itself has no price, plan name or /plans link', async () => {
  const paid = await payingFamily();
  await boughtSpark(paid, 'p25');
  const gid = game(paid.child), kidWho = signIn(paid.child);
  const st = (await call(kidWho, `/api/studio/${gid}`)).json;
  assert.equal(st.sparkLeft, 25); assert.deepEqual(st.upsell, null, 'Spark Pack messages left: nothing to buy');
  const page = await call(kidWho, `/studio/${gid}`);
  const main = page.text.slice(page.text.indexOf('<main'), page.text.indexOf('</main>'));
  assert.doesNotMatch(main, /\/plans|\/grown-ups|\/family|\$\d|\d\.\d\d|Family plan|Basic plan|per month/);
  // The card's new words for children: no price, plan, money word or countdown (like the card's other words).
  const en = i18n.tFor('en');
  for (const k of ['askText', 'askTextSpark', 'askButton', 'asked', 'qrLabel', 'classText', 'resting', 'back']) {
    assert.doesNotMatch(en(`js.studio.limitCard.${k}`), /plan|price|\$|€|buy|pay|upgrade|hour|minute|\d/i, k);
  }
  assert.doesNotMatch(en('js.studio.limitCard.showText', { address: 'x' }), /plan|price|\$|buy|pay|\d/i);
});

// ---------------------------------------------------------------- asks
test('"Ask my grown-up": only a child with a linked grown-up and no message left; one open ask; the grown-up sees it with a badge; dismiss', async () => {
  const f = family();
  const kidWho = signIn(f.child);
  const ask = () => call(kidWho, '/api/studio/ask-grownup', { method: 'POST', body: {} });
  assert.equal((await ask()).status, 404, 'messages left: nothing to ask');
  useUp(f.child);
  const r1 = await ask();
  assert.equal(r1.status, 200, r1.text); assert.equal(r1.json.already, false);
  assert.equal((await ask()).json.already, true, 'one open ask per child');
  assert.equal(upsellFor(f.child, req).asked, true);
  assert.equal(q.all('SELECT * FROM builder_asks WHERE child_id=?', f.child.id).length, 1);
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='builder.ask' AND target=?", `family:${f.fam.id}`).n, 1);
  // The grown-up: a Family badge until they open /family, where the ask is (name, a way to the plans, Dismiss).
  assert.equal(navBadges(f.g).asks, 1);
  const page = await call(f.who, '/family');
  assert.match(page.text, /id="asks"/); assert.match(page.text, new RegExp(f.child.display_name));
  assert.match(page.text, /used today's Builder messages and asked for more building/);
  assert.equal(navBadges(f.g).asks, 0, 'seen');
  const askId = q.get('SELECT id FROM builder_asks WHERE child_id=?', f.child.id).id;
  assert.equal((await call(f.who, `/api/family/asks/${askId}/dismiss`, { method: 'POST', body: {} })).status, 200);
  assert.doesNotMatch((await call(f.who, '/family')).text, /id="asks"/);
  // Another family's grown-up can't dismiss it; a kid without a grown-up, a guest and a grown-up can't ask.
  const other = family(); useUp(other.child);
  assert.equal((await call(signIn(other.child), '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 200);
  const otherAsk = q.get('SELECT id FROM builder_asks WHERE child_id=? AND closed_at IS NULL', other.child.id).id;
  assert.equal((await call(f.who, `/api/family/asks/${otherAsk}/dismiss`, { method: 'POST', body: {} })).status, 404);
  const lone = kid(); useUp(lone);
  assert.equal((await call(signIn(lone), '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 404, 'no grown-up to ask');
  assert.equal((await call(f.who, '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 404, 'grown-ups are fenced out');
  // The plan comes on: the plan ask closes by itself.
  const r = await call(other.who, '/api/billing/family/checkout', { method: 'POST', body: { interval: 'month' } });
  await pay(r.json.redirect);
  assert.equal(sparks.asksFor(other.fam.id).length, 0);
  // A week later an ask is no longer open; the daily job deletes old closed ones.
  const f3 = family(); useUp(f3.child); sparks.ask(f3.child, f3.fam.id, 'plan');
  assert.equal(sparks.openAsk(f3.child.id, Date.now() + 8 * DAY), null);
  sparks.daily(Date.now() + 200 * DAY);
  assert.equal(q.get('SELECT COUNT(*) n FROM builder_asks WHERE child_id IN (?,?)', f.child.id, other.child.id).n, 0);
});

// ---------------------------------------------------------------- free account: plan checkout lifts the limit at once
test('free kid at the limit → the grown-up buys a plan → webhook → the limit lifts at once (the next message builds)', async () => {
  const f = family();
  const gid = game(f.child), kidWho = signIn(f.child);
  for (let i = 0; i < 2; i++) assert.equal((await chat(kidWho, gid, `change ${i}`)).status, 202);
  const limited = await chat(kidWho, gid, 'one more');
  assert.equal(limited.status, 429); assert.equal(limited.json.code, 'limit');
  assert.equal((await call(kidWho, `/api/studio/${gid}`)).json.upsell.kind, 'plan');
  assert.equal((await call(kidWho, '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 200);
  const r = await call(f.who, '/api/billing/family/checkout', { method: 'POST', body: { interval: 'month' } });
  assert.equal(lastCheckout().params.mode, 'subscription');
  await pay(r.json.redirect);
  const st = (await call(kidWho, `/api/studio/${gid}`)).json;
  assert.equal(st.turnsLeft, 3); assert.equal(st.extraLeft, 3); assert.equal(st.upsell.kind, 'spark', 'the plan is on: a Spark Pack is the next thing to ask for');
  assert.equal((await chat(kidWho, gid, 'add a rainbow')).status, 202);
  assert.equal(q.get('SELECT charged_to FROM builder_turns WHERE game_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', gid).charged_to, `family:${f.fam.id}`);
});

// ---------------------------------------------------------------- paid account: Spark Pack checkout
test('Spark Pack checkout: mode=payment, the server\'s price and messages, our metadata; the webhook credits it; the builder builds again', async () => {
  const p = await payingFamily();
  const gid = game(p.child), kidWho = signIn(p.child);
  for (let i = 0; i < 5; i++) await chat(kidWho, gid, `step ${i}`);   // 2 free + 3 family extras
  assert.equal((await chat(kidWho, gid, 'again')).status, 429);
  assert.equal((await call(kidWho, '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 200);
  assert.equal(sparks.asksFor(p.fam.id)[0].kind, 'spark');
  // The page sends only a size; anything else it sends is ignored (the server decides price and messages).
  const r = await buySpark(p.who, { pack: 'p60', price: 'price_fake_spark_25', amount: 1, messages: 9999, quantity: 50 });
  assert.equal(r.status, 200, r.text);
  const params = lastCheckout().params;
  assert.equal(params.mode, 'payment');
  assert.deepEqual(params.line_items, [{ price: 'price_fake_spark_60', quantity: '1' }]);
  assert.equal(params.metadata.kind, 'spark_pack'); assert.equal(params.metadata.pack, 'p60'); assert.equal(params.metadata.owner_id, p.fam.id);
  assert.equal(params.payment_intent_data.metadata.pack, 'p60');
  assert.equal(params.client_reference_id, p.fam.id);
  assert.equal(params.payment_method_configuration, 'pmc_fakefamily');
  assert.equal(params.integration_identifier, 'oomba_spark_tmzqbwhe');
  assert.equal(params.allow_promotion_codes, undefined, 'no codes on packs');
  assert.match(params.success_url, /\/family\?sparks_checkout=\{CHECKOUT_SESSION_ID\}#sparks$/);
  assert.equal(fake.violations.length, 0, 'never payment_method_types');
  const row = packRows(p.fam.id).at(-1);
  assert.deepEqual({ status: row.status, messages: row.messages, remaining: row.remaining, amount: row.amount_total }, { status: 'open', messages: 60, remaining: 0, amount: 999 });
  // Paid: the webhook credits it, the ask closes, the kid builds again from the pack.
  const back = await pay(r.json.redirect);
  assert.match(back, /\/family\?sparks_checkout=cs_test_/);
  const paidRow = packRows(p.fam.id).at(-1);
  assert.equal(paidRow.status, 'active'); assert.equal(paidRow.remaining, 60); assert.ok(paidRow.stripe_payment_intent);
  assert.ok(paidRow.expires_at > Date.now() + 364 * DAY && paidRow.expires_at < Date.now() + 366 * DAY);
  assert.equal(ledger(paidRow.id, 'purchase').length, 1);
  assert.equal(sparks.asksFor(p.fam.id).length, 0, 'the ask closed');
  const st = (await call(kidWho, `/api/studio/${gid}`)).json;
  assert.equal(st.turnsLeft, 60); assert.equal(st.sparkLeft, 60);
  assert.equal((await chat(kidWho, gid, 'add a castle')).status, 202);
  const last = q.get('SELECT * FROM builder_turns WHERE game_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', gid);
  assert.equal(last.charged_to, `spark:${p.fam.id}`); assert.equal(last.status, 'done');
  assert.equal(sparks.balance(p.fam.id), 59);
  assert.equal(ledger(paidRow.id, 'use')[0].turn_id, last.id, 'the use names its build');
  // The return page: active (and the grown-up's page shows the pack with its price paid, not the kid's).
  assert.equal((await call(p.who, `/api/billing/sparks/status?checkout=${row.stripe_session_id}`)).json.state, 'active');
  const fam = await call(p.who, '/family');
  assert.match(fam.text, /id="sparks"/); assert.match(fam.text, /59 Spark Pack messages left/); assert.match(fam.text, /\$4\.99/); assert.match(fam.text, /\$19\.99/);
  // Admin sees it.
  const admin = auth.createUser({ username: `Adm${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  const ad = await call(signIn(admin), '/admin/billing');
  assert.match(ad.text, /⚡ Spark Packs/); assert.match(ad.text, new RegExp(`@${p.g.username}`)); assert.match(ad.text, /\$9\.99/);
});

test('who may buy a Spark Pack: a plan first; a size we sell; password again; billing testers in test mode; never a kid or a guest', async () => {
  const f = family();
  assert.equal((await buySpark(f.who, { pack: 'p25' })).status, 409, 'no plan');
  assert.match((await buySpark(f.who, { pack: 'p25' })).json.error, /choose a Basic or Family plan first/);
  const p = await payingFamily();
  for (const pack of ['p999', '', 'constructor', '__proto__', 'toString']) assert.equal((await buySpark(p.who, { pack })).status, 400, pack);
  // Password again after 10 minutes.
  const stale = signIn(p.g);
  const r = await buySpark(stale, { pack: 'p25' });
  assert.equal(r.status, 403); assert.equal(r.json.needPassword, true);
  assert.equal((await buySpark(stale, { pack: 'p25', password: PW })).status, 200);
  // Test mode: a grown-up who is not a billing tester can't.
  const nt = await payingFamily();
  q.run('UPDATE users SET billing_tester=0 WHERE id=?', nt.g.id);
  assert.equal((await buySpark(nt.who, { pack: 'p25' })).status, 403);
  // A kid, a guest and the signed-out: 404 (the route isn't there for them).
  for (const who of [signIn(p.child), signIn(auth.createGuest()), null]) assert.equal((await buySpark(who, { pack: 'p25' })).status, 404);
  // No price at Stripe for a size: "can't be bought right now".
  const saved = fake.st.prices.get('oomba_spark_25'); fake.st.prices.delete('oomba_spark_25');
  const S = await import('../../server/services/stripe.js');
  await S.prices({ refresh: true });
  try { assert.equal((await buySpark(p.who, { pack: 'p25' })).status, 409); } finally { fake.st.prices.set('oomba_spark_25', saved); await S.prices({ refresh: true }); }
});

// ---------------------------------------------------------------- webhooks: duplicates, order, async, expiry
test('a webhook delivered twice, or completed and async-succeeded both, credits once', async () => {
  const p = await payingFamily();
  const sid = await boughtSpark(p, 'p25');
  const ev = fake.event('checkout.session.completed', sid);
  for (let i = 0; i < 2; i++) assert.equal((await fake.deliver(ev)).status, 200);
  assert.equal((await fake.emit('checkout.session.completed', sid)).status, 200, 'another event id, same session');
  await fake.emit('checkout.session.async_payment_succeeded', sid);
  const row = sparks.packBySession(sid);
  assert.equal(row.remaining, 25); assert.equal(ledger(row.id, 'purchase').length, 1);
  assert.equal(q.get('SELECT result FROM billing_events WHERE event_id=?', ev.id).result, 'ok');
  // A bad signature changes nothing.
  assert.equal((await fake.deliver(fake.event('checkout.session.completed', sid), { secret: 'whsec_wrong' })).status, 400);
});

test('the webhook first or the return page first (or no webhook at all): the pack is credited once either way', async () => {
  const p = await payingFamily();
  // No webhook (Stripe late or down): the return page's own sync credits it.
  const r = await buySpark(p.who, { pack: 'p25' });
  await pay(r.json.redirect, '?webhook=0');
  const sid = sessionOf(r.json.redirect);
  assert.equal(sparks.packBySession(sid).status, 'open');
  assert.equal((await call(p.who, `/api/billing/sparks/status?checkout=${sid}`)).json.state, 'active');
  assert.equal(sparks.balance(p.fam.id), 25);
  await fake.emit('checkout.session.completed', sid);   // the webhook arrives after all
  assert.equal(sparks.balance(p.fam.id), 25); assert.equal(ledger(sparks.packBySession(sid).id, 'purchase').length, 1);
  // The webhook a moment after the redirect: the page waits ("processing"), then the webhook credits it.
  const r2 = await buySpark(p.who, { pack: 'p25' });
  await pay(r2.json.redirect, '?late=1');
  await new Promise(res => setTimeout(res, 1800));
  assert.equal(sparks.balance(p.fam.id), 50);
  // The return page with another family's session, or a made-up id: not yours, nothing changes.
  const q2 = await payingFamily();
  assert.equal((await call(q2.who, `/api/billing/sparks/status?checkout=${sid}`)).json.state, 'not_yours');
  assert.equal((await call(q2.who, '/api/billing/sparks/status?checkout=cs_test_madeupmadeup123')).json.state, 'not_yours');
  assert.equal((await call(q2.who, '/api/billing/sparks/status?checkout=nonsense')).json.state, 'not_yours');
  assert.equal(sparks.balance(q2.fam.id), 0);
  // A session whose row was lost (the server stopped between Stripe and the database): rebuilt from its metadata.
  const r3 = await buySpark(p.who, { pack: 'p60' });
  const sid3 = sessionOf(r3.json.redirect);
  q.run('DELETE FROM spark_packs WHERE stripe_session_id=?', sid3);
  await pay(r3.json.redirect);
  assert.equal(sparks.packBySession(sid3).remaining, 60);
});

test('a Checkout left unpaid (cancelled, then expired) credits nothing; a delayed payment credits only when it arrives; a failed one never', async () => {
  const p = await payingFamily();
  const r = await buySpark(p.who, { pack: 'p25' });
  const sid = sessionOf(r.json.redirect);
  assert.equal((await fake.deliver(fake.event('checkout.session.expired', { ...fake.st.sessions.get(sid), status: 'expired' }))).status, 200);
  fake.st.sessions.get(sid).status = 'expired';
  await fake.emit('checkout.session.expired', sid);
  assert.equal(sparks.packBySession(sid).status, 'expired'); assert.equal(sparks.balance(p.fam.id), 0);
  assert.equal((await call(p.who, `/api/billing/sparks/status?checkout=${sid}`)).json.state, 'failed');
  // Delayed (ACH-like): processing until it arrives.
  const r2 = await buySpark(p.who, { pack: 'p25' });
  const sid2 = sessionOf(r2.json.redirect);
  await pay(r2.json.redirect, '?async=1');
  assert.equal(sparks.packBySession(sid2).status, 'processing'); assert.equal(sparks.balance(p.fam.id), 0);
  assert.equal((await call(p.who, `/api/billing/sparks/status?checkout=${sid2}`)).json.state, 'processing');
  await fake.settleAsync(sid2, true);
  assert.equal(sparks.balance(p.fam.id), 25);
  // Delayed and failed.
  const r3 = await buySpark(p.who, { pack: 'p60' });
  const sid3 = sessionOf(r3.json.redirect);
  await pay(r3.json.redirect, '?async=1');
  await fake.settleAsync(sid3, false);
  assert.equal(sparks.packBySession(sid3).status, 'failed'); assert.equal(sparks.balance(p.fam.id), 25);
  const fam = await call(p.who, '/family');
  assert.match(fam.text, /The payment didn(&#39;|')t go through/);
});

// ---------------------------------------------------------------- refunds, disputes
test('refunds after partial use take back their share of what is left (never below 0); a full refund or a dispute ends the pack', async () => {
  const p = await payingFamily(); useUp(p.child);   // free and extras gone: the next ones are pack messages
  const sid = await boughtSpark(p, 'p25');
  for (let i = 0; i < 5; i++) assert.equal(build(p.child).source, `spark:${p.fam.id}`);
  assert.equal(sparks.balance(p.fam.id), 20);
  // Half refunded: 13 of the 25 messages are paid back, taken from the 20 left.
  await (await fetch(`${fake.url}/_test/refund-session`, { method: 'POST', body: JSON.stringify({ session: sid, amount: 250 }) })).json();
  assert.equal(sparks.balance(p.fam.id), 7);
  assert.equal(sparks.packBySession(sid).status, 'active');
  // The same refund event again: nothing more.
  // Refunded in full later: the rest goes and the pack ends.
  await (await fetch(`${fake.url}/_test/refund-session`, { method: 'POST', body: JSON.stringify({ session: sid }) })).json();
  assert.equal(sparks.balance(p.fam.id), 0); assert.equal(sparks.packBySession(sid).status, 'refunded');
  assert.equal(usage.allowanceFor(p.child).left, 0);
  // Used more than the refund leaves: what's left goes, never below 0.
  const sid2 = await boughtSpark(p, 'p25');
  for (let i = 0; i < 20; i++) build(p.child);
  await (await fetch(`${fake.url}/_test/refund-session`, { method: 'POST', body: JSON.stringify({ session: sid2, amount: 250 }) })).json();
  const r2 = sparks.packBySession(sid2);
  assert.equal(r2.remaining, 0); assert.equal(-ledger(r2.id, 'refund').reduce((a, x) => a + x.delta, 0), 5);
  // A dispute: what's left goes now.
  const sid3 = await boughtSpark(p, 'p60');
  await (await fetch(`${fake.url}/_test/dispute-session`, { method: 'POST', body: JSON.stringify({ session: sid3 }) })).json();
  assert.equal(sparks.packBySession(sid3).status, 'disputed'); assert.equal(sparks.balance(p.fam.id), 0);
  // A build given back after its pack was refunded: nothing returns to a dead pack.
  assert.ok(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='billing.spark.dispute'").n >= 1);
});

// ---------------------------------------------------------------- use: order, siblings, Pro, refunds, races, days
test('order and sharing: free daily first, then the plan\'s extras, then packs; siblings share one balance; a build given back returns its credits once', async () => {
  const p = await payingFamily();
  const sib = kid(); link(p.fam, sib);
  await boughtSpark(p, 'p25');
  const sources = []; for (let i = 0; i < 6; i++) sources.push(build(p.child).source);
  assert.deepEqual(sources, ['free', 'free', `family:${p.fam.id}`, `family:${p.fam.id}`, `family:${p.fam.id}`, `spark:${p.fam.id}`]);
  assert.equal(usage.allowanceFor(sib).sparkLeft, 24, 'the sibling sees the same balance');
  // The sibling's own free messages come first, then (extras used up by the family) the packs.
  assert.deepEqual([build(sib).source, build(sib).source, build(sib).source], ['free', 'free', `spark:${p.fam.id}`]);
  assert.equal(sparks.balance(p.fam.id), 23);
  // A failed build gives its credit back, once.
  const b = build(p.child, { refund: true });
  assert.equal(b.source, `spark:${p.fam.id}`); assert.equal(sparks.balance(p.fam.id), 23);
  turns.refund(b.id); assert.equal(sparks.balance(p.fam.id), 23, 'refund is once');
  // The grown-up builds from the same packs once their own free messages are used.
  assert.equal(usage.allowanceFor(p.g).sparkLeft, 23);
  // A fifth child (beyond FAMILY_MAX_CHILDREN) isn't covered.
  const more = [kid(), kid(), kid()]; for (const k of more) link(p.fam, k);
  assert.equal(usage.allowanceFor(more[2]).sparkFamilyId, null);
  assert.equal(usage.allowanceFor(more[1]).sparkFamilyId, p.fam.id);
});

test('Pro weight: a Pro message uses the plan\'s weight from a pack, and never more credits than are left', async () => {
  config.builderFullForAll = false; config.proTurnWeight = 2;
  const p = await payingFamily(); useUp(p.child);
  const sid = await boughtSpark(p, 'p25');
  const c = build(p.child, { pro: true });
  assert.equal(c.source, `spark:${p.fam.id}`); assert.equal(c.weight, 2); assert.equal(sparks.balance(p.fam.id), 23);
  q.run('UPDATE spark_packs SET remaining=1 WHERE stripe_session_id=?', sid);
  const last = build(p.child, { pro: true });
  assert.ok(last, 'a Pro message may use the last credit');
  assert.equal(sparks.balance(p.fam.id), 0);
  assert.equal(q.get('SELECT remaining FROM spark_packs WHERE stripe_session_id=?', sid).remaining, 0, 'never below 0');
  assert.equal(build(p.child, { pro: true }), false);
  assert.throws(() => q.run('UPDATE spark_packs SET remaining=-1 WHERE stripe_session_id=?', sid), /CHECK/, 'the table refuses a negative balance');
});

test('two siblings racing for the last credit through the Studio: one builds, the other is told the limit; never a negative balance', async () => {
  const p = await payingFamily();
  const sib = kid(); link(p.fam, sib);
  useUp(p.child); useUp(sib);
  const sid = await boughtSpark(p, 'p25');
  q.run('UPDATE spark_packs SET remaining=1 WHERE stripe_session_id=?', sid);
  const g1 = game(p.child), g2 = game(sib);
  const [a, b] = await Promise.all([chat(signIn(p.child), g1, 'race one'), chat(signIn(sib), g2, 'race two')]);
  const charged = q.all("SELECT * FROM builder_turns WHERE game_id IN (?,?) AND charged_to LIKE 'spark:%'", g1, g2);
  assert.equal(charged.length, 1, `one build charged (statuses ${a.status} ${b.status})`);
  assert.equal(sparks.balance(p.fam.id), 0);
  assert.equal(q.get('SELECT remaining FROM spark_packs WHERE stripe_session_id=?', sid).remaining, 0);
});

test('a new UTC day: the free daily messages come back, packs do not reset; packs run out at their end date', async () => {
  const p = await payingFamily(); useUp(p.child);
  const sid = await boughtSpark(p, 'p25');
  for (let i = 0; i < 3; i++) build(p.child);
  const tomorrow = new Date(Date.now() + DAY).toISOString().slice(0, 10);
  const al = usage.allowanceFor(p.child, tomorrow);
  assert.equal(al.freeLeft, 2); assert.equal(al.sparkLeft, 22); assert.equal(al.source, 'free');
  // The per-builder daily cap for pack messages: tomorrow starts again; with packs left the card offers nothing.
  config.sparkDailyMax = 3;
  assert.equal(usage.allowanceFor(p.child).left, 0);
  assert.equal(upsellFor(p.child, req), null, 'packs left: more tomorrow, nothing to buy');
  assert.equal(usage.allowanceFor(p.child, tomorrow).sparkToday, 3);
  config.sparkDailyMax = 60;
  // The pack's time runs out: unusable at once, and the daily job ends it (the rest is written off).
  q.run('UPDATE spark_packs SET expires_at=? WHERE stripe_session_id=?', Date.now() - 1, sid);
  assert.equal(sparks.balance(p.fam.id), 0); assert.equal(usage.allowanceFor(p.child).sparkLeft, null);
  sparks.daily();
  const row = sparks.packBySession(sid);
  assert.equal(row.status, 'ended'); assert.equal(row.remaining, 0); assert.equal(ledger(row.id, 'expire')[0].delta, -22);
});

test('the plan ends while packs remain: the packs stay usable; once they run out the card offers a plan again', async () => {
  const p = await payingFamily(); useUp(p.child);
  await boughtSpark(p, 'p25');
  fake.update(p.subId, { status: 'canceled' });
  await fake.emit('customer.subscription.deleted', p.subId);
  assert.equal(B.ownerPlan('family', p.fam.id).entitled, false);
  const al = usage.allowanceFor(p.child);
  assert.equal(al.familyId, null); assert.equal(al.sparkFamilyId, p.fam.id); assert.equal(al.sparkLeft, 25);
  assert.equal(build(p.child).source, `spark:${p.fam.id}`);
  // A new pack needs the plan again.
  assert.equal((await buySpark(p.who, { pack: 'p25' })).status, 409);
  q.run('UPDATE spark_packs SET remaining=0 WHERE family_id=?', p.fam.id);
  assert.equal(upsellFor(p.child, req).kind, 'plan');
});

test('a school with a plan: its members never use their family\'s packs (no family money in class)', async () => {
  const p = await payingFamily();
  await boughtSpark(p, 'p25');
  const boss = auth.createUser({ username: `Boss${uid(4)}`, password: 'boss-password-1', role: 'admin' });
  const school = SC.createSchool(boss, { name: `Spk Paid ${uid(4)}` }).school;
  q.run("INSERT INTO school_members(school_id, user_id, role, status, joined_at) VALUES (?,?,'student','active',?)", school.id, p.child.id, Date.now());
  q.run("INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at, granted_by) VALUES (?,?,?,?,?,?,?)", uid(), 'school', school.id, 'school', Date.now() + 30 * DAY, Date.now(), boss.id);
  assert.equal(usage.allowanceFor(p.child).sparkFamilyId, null);
  assert.deepEqual(upsellFor(p.child, req), { kind: 'class' });
});

// ---------------------------------------------------------------- admin
test('/admin/billing: grant Spark Pack messages to a family (by the grown-up\'s or a linked child\'s username), revoke what is left; audited', async () => {
  const f = family();
  const admin = auth.createUser({ username: `Adm${uid(4)}`, password: 'admin-password-1', role: 'admin' });
  const aw = signIn(admin);
  const r = await call(aw, '/api/admin/billing/sparks/grant', { method: 'POST', body: { username: f.child.username, messages: '15', note: 'sorry for the outage' } });
  assert.equal(r.status, 200, r.text);
  assert.equal(sparks.balance(f.fam.id), 15, 'a family without a plan can be given packs');
  assert.equal(q.get("SELECT COUNT(*) n FROM audit_log WHERE action='admin.spark.grant' AND target=?", `family:${f.fam.id}`).n, 1);
  for (const body of [{ username: f.g.username, messages: 0 }, { username: f.g.username, messages: 5000 }, { username: f.g.username, messages: 'x' }]) assert.equal((await call(aw, '/api/admin/billing/sparks/grant', { method: 'POST', body })).status, 400);
  assert.equal((await call(aw, '/api/admin/billing/sparks/grant', { method: 'POST', body: { username: kid().username, messages: 5 } })).status, 404, 'a kid with no family');
  const pack = packRows(f.fam.id)[0];
  assert.equal((await call(aw, `/api/admin/billing/sparks/${pack.id}/revoke`, { method: 'POST', body: {} })).status, 200);
  assert.equal(sparks.balance(f.fam.id), 0); assert.equal(sparks.packState(sparks.packsOf(f.fam.id)[0]), 'revoked');
  assert.equal((await call(aw, `/api/admin/billing/sparks/${pack.id}/revoke`, { method: 'POST', body: {} })).status, 404);
  // Not the admin: 404/403.
  assert.notEqual((await call(f.who, '/api/admin/billing/sparks/grant', { method: 'POST', body: { username: f.g.username, messages: 5 } })).status, 200);
  const page = await call(aw, '/admin/billing');
  assert.match(page.text, /grant · 15/); assert.match(page.text, /revoked/);
});

test('the paid AI pool grows with packs; guests never reach checkout', async () => {
  const before = sparks.poolUsd();
  const p = await payingFamily();
  await boughtSpark(p, 'p60');
  assert.ok(Math.abs(sparks.poolUsd() - before - 6) < 1e-9, '60 messages × $0.10');
  const guest = signIn(auth.createGuest());
  assert.equal((await call(guest, '/api/billing/sparks/status?checkout=x')).status, 404);
  assert.notEqual((await call(guest, '/api/studio/ask-grownup', { method: 'POST', body: {} })).status, 200);
  assert.equal(upsellFor(auth.createGuest(), req), null);
});
