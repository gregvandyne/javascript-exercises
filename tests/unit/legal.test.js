// Legal pages (chunk 7): /terms, /refunds and /privacy are always public, carry a "Last updated" date and no drafting
// markers or prices; the footer links Terms and Privacy; /parents and /safety switch to the paid-plan wording only once
// paid plans are public (billing on, and BILLING_PUBLIC or the preview cookie).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
const { createApp } = await import('../../server/app.js');
const i18n = await import('../../server/i18n/index.js');
const { LEGAL_UPDATED } = await import('../../server/routes/info.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
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
  for (const [path, key] of [['/terms', 'terms'], ['/refunds', 'refunds'], ['/privacy', 'privacy']]) {
    const r = await get(path); assert.equal(r.status, 200, path);
    const text = decode(r.text);
    assert.match(text, new RegExp(`<h1>[^<]*${en[`info.${key}.heading`]}</h1>`), `${path} heading`);
    assert.match(text, new RegExp(`Last updated: <time datetime="${LEGAL_UPDATED}">October 26, 2026</time>`), `${path} date`);
    assert.match(text, /href="mailto:greg@oomba\.ai"/, `${path} contact`);
    for (const k of Object.keys(en).filter(k => k.startsWith(`info.${key}.`) && /\.(p|li|s)\d+$/.test(k))) {
      const words = plain(en[k]).slice(0, 60);
      assert.ok(decode(text.replace(/<[^>]+>/g, '')).includes(words), `${path} shows ${k}`);
    }
    assert.ok(!/PLACEHOLDER|ASSUMPTION|LEGAL REVIEW|OWNER DECISION|DRAFT for legal|Not in force/.test(text), `${path}: no drafting markers`);
    assert.ok(!/info\.(terms|refunds|privacy|legal|parents)\./.test(text), `${path}: no raw keys`);
    // Linked from every page's footer, so from kid pages too: no prices (children never see prices).
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
  const r = decode((await get('/privacy')).text);
  for (const k of ['info.parents.stored.p1', 'info.parents.stored.p2', 'info.parents.never.p1', 'info.parents.ai.p1', 'info.parents.keep.p1', 'info.parents.keep.p2']) {
    assert.ok(r.includes(en[k]), `before launch /privacy shows ${k}`);
  }
  for (const id of ['stored', 'never', 'ai', 'keep', 'grownups', 'linking', 'payments', 'schoolBilling', 'children', 'billingKeep']) assert.match(r, new RegExp(`<section class="panel" id="${id}">`), id);
  assert.match(r, /Paid plans are not on sale yet/);
  paid(true);
  const p = decode((await get('/privacy')).text);
  assert.ok(p.includes(en['info.parents.never.paid1']) && !p.includes(en['info.parents.never.p1']), 'paid: the new "never" wording');
  assert.ok(p.includes(en['info.parents.stored.paid3']), 'paid: families never see class activity');
  assert.match(p, /href="\/privacy#billingKeep"/);
  assert.doesNotMatch(p, /Paid plans are not on sale yet/);
});

test('footer: Terms and Privacy on every page with a footer', async () => {
  for (const p of ['/', '/safety', '/parents', '/login', '/terms', '/refunds', '/privacy']) {
    const t = (await get(p)).text; const foot = t.slice(t.indexOf('<footer'));
    assert.match(foot, /<a href="\/terms">Terms<\/a>/, `${p}: Terms`); assert.match(foot, /<a href="\/privacy">Privacy<\/a>/, `${p}: Privacy`);
  }
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

test('the legal text never takes a language out of the picker, and Hebrew pages fall back to English inside an RTL page', async () => {
  for (const code of ['he', 'ar', 'ru', 'ja']) assert.ok(i18n.availableCodes().includes(code), code);
  const r = await get('/privacy', { cookie: 'lang=he' });
  assert.equal(r.status, 200);
  assert.match(r.text, /<html[^>]*dir="rtl"/);
  assert.match(r.text, /<time datetime="2026-10-26">/);
  // English fallback text is marked lang="en" dir="ltr"; the sections Hebrew already has (from /parents) are not.
  assert.match(r.text, /<section class="panel" id="payments"><h2 lang="en" dir="ltr">/);
  assert.match(r.text, /<section class="panel" id="stored"><h2>/);
  const t = (await get('/terms', { cookie: 'lang=he' })).text;
  assert.match(t, /<li lang="en" dir="ltr"><b>Guest:/);
  assert.doesNotMatch((await get('/terms')).text, /lang="en" dir="ltr"><b>Guest/, 'English pages need no marking');
});

test('grown-up accounts (the people who pay) can open all three legal pages', async () => {
  const { grownupMay } = await import('../../server/routes/family.js');
  for (const p of ['/terms', '/refunds', '/privacy']) assert.equal(grownupMay('GET', p), true, p);
});
