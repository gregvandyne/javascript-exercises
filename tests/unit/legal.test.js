// Legal pages (chunk 7): /terms, /refunds and /privacy are always public, carry a "Last updated" date and no drafting
// markers or prices; the footer links Privacy everywhere and Terms only for grown-ups and school staff (no plan names
// where a child can see); /privacy shows its billing sections only to them (or ?for=grownups); /parents and /safety switch to the paid-plan wording only once
// paid plans are public (billing on, and BILLING_PUBLIC or the preview cookie).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const i18n = await import('../../server/i18n/index.js');
const { LEGAL_UPDATED } = await import('../../server/routes/info.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const auth = await import('../../server/auth.js');
const SC = await import('../../server/services/schools.js');
const { uid } = await import('../../server/db.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
/** A session cookie for a user. */
function cookieOf(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return { cookie: c }; }
const get = async (path, headers = {}) => { const r = await fetch(base + path, { headers, redirect: 'manual' }); return { status: r.status, text: await r.text() }; };
/** Billing on (a fake test key; no page here calls Stripe) and public, or back to off. */
function paid(on, pub = on) {
  config.stripeApiKey = on ? 'rk_test_fake' : ''; config.stripeWebhookSecret = on ? 'whsec_fake_legal' : ''; config.billingPublic = pub;
}
test.beforeEach(() => resetLimits());
test.afterEach(() => paid(false));
const en = i18n.dictionary('en');
const plain = s => s.replace(/<[^>]+>/g, '').replace(/\{email\}/g, 'greg@oomba.ai');
const decode = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

test('/terms, /refunds and /privacy are public, dated, and show every paragraph of their text', async () => {
  for (const [path, key] of [['/terms', 'terms'], ['/refunds', 'refunds'], ['/privacy?for=grownups', 'privacy']]) {
    const r = await get(path); assert.equal(r.status, 200, path);
    const text = decode(r.text);
    assert.match(text, new RegExp(`<h1>[^<]*${en[`info.${key}.heading`]}</h1>`), `${path} heading`);
    assert.match(text, new RegExp(`Last updated: <time datetime="${LEGAL_UPDATED}">October 27, 2026</time>`), `${path} date`);
    assert.match(text, /href="mailto:greg@oomba\.ai"/, `${path} contact`);
    for (const k of Object.keys(en).filter(k => k.startsWith(`info.${key}.`) && !k.startsWith('info.privacy.more.') && /\.(p|li|s)\d+$/.test(k))) {
      const words = plain(en[k]).slice(0, 60);
      assert.ok(decode(text.replace(/<[^>]+>/g, '')).includes(words), `${path} shows ${k}`);
    }
    assert.ok(!/PLACEHOLDER|ASSUMPTION|LEGAL REVIEW|OWNER DECISION|DRAFT for legal|Not in force/.test(text), `${path}: no drafting markers`);
    assert.ok(!/info\.(terms|refunds|privacy|legal|parents)\./.test(text), `${path}: no raw keys`);
    // No prices on any of them (a kid can type the address).
    const main = text.slice(text.indexOf('<h1'), text.indexOf('<footer'));
    assert.ok(!/\$\s?\d|\d\.\d\d\b|\bUSD\b/.test(main), `${path}: no prices: ${(/.{40}(\$\s?\d|\d\.\d\d\b).{20}/.exec(main) || [''])[0]}`);
  }
});

test('refunds: 14 days for the first payment and yearly renewals only; monthly renewals are not refunded', async () => {
  const t = decode((await get('/refunds')).text).replace(/<[^>]+>/g, '');
  assert.match(t, /within 14 days of the payment that starts a plan, or of a yearly renewal/);
  assert.match(t, /Monthly renewals are not refunded/);
  assert.match(decode((await get('/terms')).text).replace(/<[^>]+>/g, ''), /Monthly renewals are not refunded/);
});

test('/privacy is the site\'s privacy text (the /parents sections) plus grown-up accounts, payments and school billing', async () => {
  const r = decode((await get('/privacy?for=grownups')).text);
  for (const k of ['info.parents.stored.p1', 'info.parents.stored.p2', 'info.parents.never.p1', 'info.parents.ai.p1', 'info.parents.keep.p1', 'info.parents.keep.p2']) {
    assert.ok(r.includes(en[k]), `before launch /privacy shows ${k}`);
  }
  for (const id of ['stored', 'never', 'ai', 'keep', 'grownups', 'linking', 'payments', 'schoolBilling', 'children', 'billingKeep']) assert.match(r, new RegExp(`<section class="panel" id="${id}">`), id);
  assert.match(r, /Paid plans are not on sale yet/);
  assert.doesNotMatch(r, /id="more"/, 'the full text needs no pointer to itself');
  paid(true);
  const p = decode((await get('/privacy?for=grownups')).text);
  assert.ok(p.includes(en['info.parents.never.paid1']) && !p.includes(en['info.parents.never.p1']), 'paid: the new "never" wording');
  assert.ok(p.includes(en['info.parents.stored.paid3']), 'paid: families never see class activity');
  assert.match(p, /href="\/privacy#billingKeep"/);
  assert.doesNotMatch(p, /Paid plans are not on sale yet/);
});

const BILLING_SECTIONS = ['grownups', 'linking', 'payments', 'schoolBilling', 'billingKeep', 'where'];
const footOf = t => t.slice(t.indexOf('<footer'));
test('footer: Privacy on every page; Terms only for grown-ups and school staff (no plan names where a child can see)', async () => {
  const g = auth.createUser({ username: `LGrown${uid(4)}`, password: 'a-long-password-1', accountType: 'grownup' });
  const boss = auth.createUser({ username: `LBoss${uid(4)}`, password: 'boss-password-12', role: 'admin' });
  const s = SC.createSchool(boss, { name: `Legal School ${uid(4)}` }).school;
  const teacher = SC.createSchoolAccount(boss, s.id, { rosterName: 'Ms T', role: 'teacher' }).user;
  const student = SC.createSchoolAccount(boss, s.id, { rosterName: 'Stu' }).user;
  const kid = auth.createUser({ username: `LKid${uid(4)}`, password: 'rainbow-77' });
  const guest = auth.createGuest();
  for (const isPaid of [false, true]) {
    paid(isPaid);
    // Kids, students, guests and the signed-out: Privacy, never Terms, on every page.
    for (const who of [null, kid, student, guest]) {
      const h = who ? cookieOf(who) : {};
      for (const p of ['/', '/safety', '/parents', ...(who ? ['/me'] : ['/login']), '/terms', '/refunds', '/privacy']) {
        const foot = footOf((await get(p, h)).text);
        assert.match(foot, /<a href="\/privacy">Privacy<\/a>/, `${who ? who.username : 'signed out'} ${p}: Privacy`);
        assert.doesNotMatch(foot, /href="\/terms"/, `${who ? who.username : 'signed out'} ${p}: no Terms`);
      }
      // Their /privacy has no billing sections and no plan names.
      const priv = decode((await get('/privacy', h)).text);
      const main = priv.slice(priv.indexOf('<main'), priv.indexOf('<footer'));
      for (const id of BILLING_SECTIONS) assert.doesNotMatch(main, new RegExp(`id="${id}"`), `${who ? who.username : 'signed out'}: no ${id}`);
      // (The /parents sections it repeats are the /parents wording, the same as on /parents.)
      const own = main.replace(/<section class="panel" id="(stored|never|ai|keep)">[\s\S]*?<\/section>/g, '');
      assert.doesNotMatch(own, /Family plan|School plan|family plan|school plan|Manage plan|buy a /, `${who ? who.username : 'signed out'}: no plan names`);
      for (const id of ['stored', 'never', 'ai', 'keep', 'children', 'contact']) assert.match(main, new RegExp(`id="${id}"`), id);
      assert.doesNotMatch(main, /legal-notyet/, 'no "not on sale yet": the sections it is about are not here');
      // Only the signed-out get the pointer to the full text (a parent or a reviewer); kids' accounts don't.
      assert.equal(/href="\/privacy\?for=grownups"/.test(main.replace(/<section class="panel" id="keep">[\s\S]*?<\/section>/, '')), !who, `${who ? who.username : 'signed out'}: pointer`);
    }
    // Grown-ups, school staff and the platform admin: Terms too, and the full /privacy.
    for (const who of [g, teacher, boss]) {
      const h = cookieOf(who);
      const foot = footOf((await get('/privacy', h)).text);
      assert.match(foot, /<a href="\/terms">Terms<\/a>/, `${who.username}: Terms`); assert.match(foot, /<a href="\/privacy">Privacy<\/a>/);
      const priv = (await get('/privacy', h)).text;
      for (const id of BILLING_SECTIONS) assert.match(priv, new RegExp(`id="${id}"`), `${who.username}: ${id}`);
    }
  }
});

test('/parents names the plans (D16) and links the legal pages only once paid plans are public', async () => {
  let t = decode((await get('/parents')).text);
  assert.doesNotMatch(t, /id="plans"/); assert.doesNotMatch(t.slice(0, t.indexOf('<footer')), /href="\/terms"/);
  paid(true);
  t = decode((await get('/parents')).text);
  assert.ok(t.includes(en['info.parents.plans.p1']));
  assert.match(t, /<section class="panel" id="plans">[\s\S]*href="\/terms"[\s\S]*href="\/refunds"[\s\S]*href="\/privacy\?for=grownups"/);
});

test('/parents and /safety: today\'s wording until paid plans are public, then the paid-plan wording', async () => {
  const swaps = [['/parents', 'info.parents.what'], ['/parents', 'info.parents.never'], ['/parents', 'info.parents.keep'], ['/safety', 'info.safety.ads']];
  const check = async (when, isPaid) => {
    for (const [path, k] of swaps) {
      const t = decode((await get(path)).text);
      assert.equal(t.includes(en[`${k}.p1`]), !isPaid, `${when}: ${path} ${k}.p1`);
      assert.equal(t.includes(en[`${k}.paid1`]), isPaid, `${when}: ${path} ${k}.paid1`);
    }
    assert.equal(decode((await get('/parents')).text).includes(en['info.parents.stored.paid3']), isPaid, `${when}: stored.paid3`);
  };
  await check('billing off', false);
  paid(false, true); await check('BILLING_PUBLIC but billing off (nothing to buy)', false);
  paid(true, false); await check('billing on, not public', false);
  paid(true); await check('billing on and public', true);
  assert.match(decode((await get('/safety')).text), /You never have to pay for anything here/);
});

test('the legal text never takes a language out of the picker; Hebrew legal pages are fully Hebrew inside an RTL page', async () => {
  for (const code of ['he', 'ar', 'ru', 'ja']) assert.ok(i18n.availableCodes().includes(code), code);
  const r = await get('/privacy?for=grownups', { cookie: 'lang=he' });
  assert.equal(r.status, 200);
  assert.match(r.text, /<html[^>]*dir="rtl"/);
  assert.match(r.text, /<time datetime="2026-10-27">/);
  // Every section is translated now: nothing on the Hebrew pages is marked as English.
  assert.match(r.text, /<section class="panel" id="payments"><h2>/);
  assert.match(r.text, /<section class="panel" id="stored"><h2>/);
  const t = (await get('/terms', { cookie: 'lang=he' })).text;
  assert.doesNotMatch(t, /<li lang="en" dir="ltr">/);
  assert.doesNotMatch((await get('/terms')).text, /lang="en" dir="ltr"><b>Guest/, 'English pages need no marking');
});

test('an untranslated footer word reads left to right on a right-to-left page', async () => {
  const he = i18n.makeT('he');
  const foot = footOf((await get('/', { cookie: 'lang=he' })).text);
  const marked = /<a href="\/privacy" lang="en" dir="ltr">/.test(foot);
  assert.equal(marked, !he.own('layout.footer.privacy'));
  assert.match(footOf((await get('/')).text), /<a href="\/privacy">Privacy<\/a>/, 'English needs no marking');
});

test('grown-up accounts (the people who pay) can open all three legal pages', async () => {
  const { grownupMay } = await import('../../server/routes/family.js');
  for (const p of ['/terms', '/refunds', '/privacy']) assert.equal(grownupMay('GET', p), true, p);
});
