// The checklist at the top of /family (server/routes/family.js familyChecklist; docs/decisions.md "The /family
// checklist"): each state (new, waiting for the child, linked, plan on, back from Checkout, waiting for Checkout, "Free is
// fine"), grown-ups only, nothing while families are off, no amounts, nothing counted, and the English marked as English
// in a language that hasn't translated it yet.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { startFakeStripe } = await import('../support/fake-stripe.js');
const fake = await startFakeStripe({ webhookSecret: 'whsec_fake_check', apiKey: 'rk_test_fake' });
process.env.STRIPE_API_KEY = 'rk_test_fake';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fake_check';
process.env.STRIPE_API_BASE = fake.url;
process.env.BILLING_PUBLIC = '1';
const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const F = await import('../../server/services/family.js');
const { grownupMay } = await import('../../server/routes/family.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { withoutKeys } = await import('../support/i18n-gaps.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { server.close(); await fake.close(); });
test.beforeEach(() => { config.stripeApiKey = 'rk_test_fake'; config.stripePmcFamily = 'pmc_fakefamily'; resetLimits(); });

const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function call(cookie, path, { method = 'GET', body } = {}) {
  const h = { ...(cookie ? { cookie } : {}) }; if (body !== undefined) h['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, location: r.headers.get('location') };
}
const as = u => (path, opts) => call(cookieFor(u.id), path, opts);
let n = 0;
const kid = () => auth.createUser({ username: `CheckKid${++n}`, password: 'rainbow-77' });
/** A grown-up who can buy a plan now (a test key: a billing tester), unless { tester: false }. */
function grownup({ tester = true } = {}) {
  const u = auth.createUser({ username: `CheckParent${++n}`, password: 'a-long-password-1', accountType: 'grownup' }); F.ensureFamily(u);
  if (tester) q.run('UPDATE users SET billing_tester=1 WHERE id=?', u.id);
  return auth.getUser(u.id);
}
const famOf = g => F.familyOfOwner(g.id);
const codeFor = async child => { const r = await as(child)('/api/me/family/code', { method: 'POST', body: {} }); assert.equal(r.status, 200, r.text); return r.json.code; };
const ask = async (g, child) => assert.equal((await as(g)('/api/family/link', { method: 'POST', body: { code: await codeFor(child) } })).status, 200);
const linkUp = async (g, child) => { await ask(g, child); assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200); };
const grant = g => q.run('INSERT INTO billing_grants(id, owner_kind, owner_id, plan, until, created_at) VALUES (?,?,?,?,?,?)', uid(10), 'family', famOf(g).id, 'family', Date.now() + 86400e3, Date.now());
/** The checklist's own markup (the open <section> or the folded <details>), or null. */
function checklist(pageHtml) {
  const m = pageHtml.match(/<(section|details) class="panel famcheck[^"]*" id="famcheck"[\s\S]*?<\/\1>/);
  return m ? m[0] : null;
}
const stepOf = (c, i) => c.split('class="famcheck-step')[i];
const funnelTotal = () => q.get('SELECT COALESCE(SUM(n),0) n FROM funnel_counts').n;

test('a new grown-up: step 1 done, step 2 says how and links to the code form, step 3 is calm and links to /plans', async () => {
  const g = grownup();
  const before = funnelTotal();
  const page = (await as(g)('/family')).text;
  const c = checklist(page);
  assert.ok(c, 'the checklist is there'); assert.match(c, /^<section/);
  assert.ok(page.indexOf('id="famcheck"') < page.indexOf('id="kids-h"'), 'at the top of the page');
  assert.match(c, /<h2 id="famcheck-h">Getting started<\/h2>/);
  assert.match(stepOf(c, 1), /^ done"/); assert.match(stepOf(c, 1), /Your grown-up account/); assert.match(stepOf(c, 1), /class="sr-only">Done</);
  assert.match(stepOf(c, 2), /^"/, 'step 2 not done');
  assert.match(stepOf(c, 2), /Link your child[\s\S]*opens <b>Me<\/b>, then <b>For grown-ups<\/b>[\s\S]*<a href="\/family\/link">Type your child&#39;s code<\/a>/);
  assert.match(stepOf(c, 3), /^"/, 'step 3 not done');
  assert.match(stepOf(c, 3), /Pick a plan \(optional\)[\s\S]*Free works; a plan adds Builder messages for your child\.[\s\S]*<a href="\/plans">See plans<\/a>/);
  assert.doesNotMatch(c, /famcheck\/hide|checklist\/hide/, 'nothing to hide before a child is linked');
  assert.doesNotMatch(c, /\$|\d+\.\d\d|month|year|Family plan|Basic plan/i, 'no amounts or plan names in the checklist');
  assert.equal(funnelTotal(), before, 'looking at the checklist counts nothing');
});

test('waiting for the child to say yes, then linked: step 2 ticks and the "Free is fine" button shows', async () => {
  const g = grownup(), child = kid();
  await ask(g, child);
  let c = checklist((await as(g)('/family')).text);
  assert.match(stepOf(c, 2), /^"[\s\S]*Waiting for your child to say yes/);
  assert.doesNotMatch(stepOf(c, 2), /href="\/family\/link"/);
  assert.equal((await as(child)('/api/me/family/answer', { method: 'POST', body: { answer: 'yes' } })).status, 200);
  c = checklist((await as(g)('/family')).text);
  assert.match(c, /^<section/, 'still open: no plan yet');
  assert.match(stepOf(c, 2), /^ done"/); assert.doesNotMatch(stepOf(c, 2), /Get a code|family\/link/);
  assert.match(stepOf(c, 3), /<form data-api="\/api\/family\/checklist\/hide" data-reload class="famcheck-hide"><button class="btn btn-sm" type="submit">Free is fine, hide this<\/button><\/form>/);
});

test('"Free is fine": stored on the family, the checklist folds to All set and stays so; the plan card keeps See plans', async () => {
  const g = grownup(), child = kid();
  await linkUp(g, child);
  const before = funnelTotal();
  const r = await as(g)('/api/family/checklist/hide', { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text);
  assert.ok(famOf(g).checklist_hidden_at > 0);
  const page = (await as(g)('/family')).text, c = checklist(page);
  assert.match(c, /^<details class="panel famcheck folded" id="famcheck"><summary><span aria-hidden="true">✓<\/span> <span>All set<\/span><\/summary>/);
  assert.match(stepOf(c, 3), /Staying free for now\./); assert.doesNotMatch(c, /checklist\/hide|any time/);
  assert.match(page, /id="plan"[\s\S]*href="\/plans">See plans</, 'the plan card still offers plans');
  // Again: no change, no error.
  assert.equal((await as(g)('/api/family/checklist/hide', { method: 'POST', body: {} })).status, 200);
  assert.equal(funnelTotal(), before, 'hiding counts nothing');
});

test('a plan on: "Your plan is on"; with a child linked it folds to All set; straight back from Checkout /family goes on to "Add your kids"', async () => {
  const g = grownup();
  grant(g);
  let c = checklist((await as(g)('/family')).text);
  assert.match(c, /^<section/, 'no child yet: open');
  assert.match(stepOf(c, 3), /^ done"[\s\S]*Your plan is on/);
  assert.doesNotMatch(stepOf(c, 3), /href="\/plans"|Free works/);
  assert.match(stepOf(c, 2), /family\/link/);
  await linkUp(g, kid());
  c = checklist((await as(g)('/family')).text);
  assert.match(c, /^<details class="panel famcheck folded"/);
  // Straight back from Checkout (the plan on): "Add your kids" says thank you and is where a child is added.
  for (const q2 of ['?welcome=1', '?checkout=cs_test_abc']) {
    const r = await call(cookieFor(g.id), `/family${q2}`);
    assert.equal(r.status, 302, q2); assert.equal(r.location, '/family/add?from=checkout', q2);
  }
});

test('plans not on sale to this grown-up (a test key and not a billing tester, or no Family payment setup): no promise, no plans link', async () => {
  for (const [why, make] of [['not a tester', () => grownup({ tester: false })], ['no PMC', () => { config.stripePmcFamily = ''; return grownup(); }]]) {
    const g = make(), child = kid();
    let s3 = stepOf(checklist((await as(g)('/family')).text), 3);
    assert.match(s3, /Plans aren’t on sale yet\. Free works in the meantime\./, why);
    assert.doesNotMatch(s3, /href="\/plans"|a plan adds|any time|US families/, why);
    await linkUp(g, child);
    assert.match(stepOf(checklist((await as(g)('/family')).text), 3), /checklist\/hide/, `${why}: "Free is fine" still folds it`);
    assert.equal((await as(g)('/api/family/checklist/hide', { method: 'POST', body: {} })).status, 200);
    s3 = stepOf(checklist((await as(g)('/family')).text), 3);
    assert.match(s3, /Plans aren’t on sale yet/, why); assert.doesNotMatch(s3, /any time|Staying free/, why);
  }
});

test('waiting for Checkout (back from Stripe, plan not on yet): step 3 offers no plans link', async () => {
  const g = grownup();
  const c = checklist((await as(g)('/family?checkout=cs_test_wait')).text);
  assert.match(stepOf(c, 3), /^"/); assert.doesNotMatch(stepOf(c, 3), /href="\/plans"|Free works|checklist\/hide/);
});

test('grown-ups only: kids, guests and signed-out visitors never get it; nothing while families are off', async () => {
  const child = kid();
  assert.equal((await as(child)('/family')).status, 404);
  assert.doesNotMatch((await as(child)('/me')).text, /famcheck/);
  assert.equal((await as(child)('/api/family/checklist/hide', { method: 'POST', body: {} })).status, 404);
  assert.equal((await call(null, '/api/family/checklist/hide', { method: 'POST', body: {} })).status, 404);
  assert.ok(grownupMay('POST', '/api/family/checklist/hide'), 'inside the grown-up fence');
  const g = grownup();
  config.stripeApiKey = '';
  const off = await as(g)('/family');
  assert.equal(off.status, 200); assert.doesNotMatch(off.text, /famcheck/);
  assert.equal((await as(g)('/api/family/checklist/hide', { method: 'POST', body: {} })).status, 404);
  assert.equal(famOf(g).checklist_hidden_at, null);
});

test('in German the checklist is German, nothing marked English; in a language without these words yet, they are marked as English and translated words are not', async () => {
  const g = grownup();
  q.run("UPDATE users SET lang='de' WHERE id=?", g.id);
  const page = (await as(g)('/family')).text, c = checklist(page);
  assert.match(page, /<html lang="de"/);
  assert.match(c, /<h2 id="famcheck-h">Erste Schritte<\/h2>/);
  assert.match(c, /<b>Ihr Kind verbinden<\/b>/);
  assert.match(c, /<a href="\/family\/link">Code Ihres Kindes eingeben<\/a>/);
  assert.doesNotMatch(c, /lang="en"|Getting started|Link your child/);
  // The checklist words taken out of German (simulated): those are English, marked so; the how-to stays German.
  await withoutKeys('de', ['family.check'], async () => {
    const gap = (await as(g)('/family')).text, cg = checklist(gap);
    assert.match(gap, /<html lang="de"/);
    assert.match(cg, /<h2 id="famcheck-h" lang="en" dir="ltr">Getting started<\/h2>/);
    assert.match(cg, /<b lang="en" dir="ltr">Link your child<\/b>/);
    assert.match(cg, /Ihr Kind meldet sich an/, 'the how-to is the German one already translated (family.link.step1)');
    assert.doesNotMatch(cg, /Your child signs in/);
  });
});
