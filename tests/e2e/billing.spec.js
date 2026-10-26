// Family checkout (paid plans, chunk 4), end to end against the fake Stripe (tests/support/fake-stripe.js): its own
// server with billing on (E2E_PORT + 5, default 4315) and the fake Stripe (E2E_PORT + 4), whose hosted Checkout and
// Portal pages send signed webhooks back to the server.
//   - subscribe → webhook → the child's extra messages → Manage billing (Portal) cancel → refund ends the plan;
//   - a crawl of every kid page in every language (an entitled family child, a school student, a guest): no prices,
//     no plan or grown-up page words, no link to /grown-ups or /family, also with the limit reached;
//   - the new pages at 360 px and 1280 px, light and dark, and right to left (he).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ownIp, ADMIN, templateGame, studioState } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 5, STRIPE_PORT = E2E + 4;
const APP = `http://localhost:${PORT}`, STRIPE = `http://127.0.0.1:${STRIPE_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PW = 'a-long-password-1', DEMO_PW = 'demo-pass-123';
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  DEMO_TEACHER_PASSWORD: DEMO_PW, ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', BRB_MOCK_DELAY_MS: '0',
  CONTACT_EMAIL: 'help@example.com', BUILDER_DAILY_TURNS: '2', FAMILY_EXTRA_MESSAGES: '3', FAMILY_CHILD_DAILY_MAX: '3',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e_bill', STRIPE_API_BASE: STRIPE, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '',
  STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: '', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };
const control = async (what, body = {}) => (await fetch(`${STRIPE}/_test/${what}`, { method: 'POST', body: JSON.stringify(body) })).json();

test.use({ baseURL: APP });
test.describe.configure({ mode: 'serial', timeout: 600_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-bill-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e_bill', '--webhook', `${APP}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`${STRIPE}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${APP}/health`);
});
test.afterAll(async () => {
  await stop(app); await stop(stripe);
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: APP, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', PW); await page.fill('#confirm', PW);
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
  return name;
}
/** A child (own account) linked to a new grown-up. -> { kid, kidName, mum, mumName } */
async function linkedFamily(browser) {
  const kid = await person(browser); const { username: kidName } = await signup(kid, uniq('Kid'));
  await kid.goto('/me'); await kid.locator('#grownups [data-family-code]').click();
  await expect(kid.locator('#famcode-value')).toHaveText(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  const code = (await kid.locator('#famcode-value').textContent()).trim();
  const mum = await person(browser); const mumName = await grownupSignup(mum);
  await mum.goto('/family/link'); await mum.fill('#code', code);
  const [res] = await Promise.all([mum.waitForResponse(r => r.url().endsWith('/api/family/link')), mum.click('button[type=submit]')]);
  if (res.status() !== 200) throw new Error(`linking failed (${res.status()}): ${(await mum.locator('.form-err, #code-err').allInnerTexts()).join(' ')}`);
  await mum.waitForURL(/\/family$/);
  await kid.goto('/me');
  await Promise.all([kid.waitForLoadState('load'), kid.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kid.locator('#grownups')).toContainText('Linked to your grown-up');
  return { kid, kidName, mum, mumName };
}
let adminP = null;
async function admin(browser) {
  if (adminP) return adminP;
  adminP = await person(browser); await login(adminP, ADMIN.username, ADMIN.password);
  return adminP;
}
/** The admin marks a grown-up as a billing tester on /admin (D14: test mode). */
async function makeTester(browser, name) {
  const a = await admin(browser);
  await a.goto(`/admin?tab=users&username=${name}`);
  await Promise.all([a.waitForResponse(r => r.url().includes('/billing-tester') && r.ok()), a.locator('[data-act="tester"]').click()]);
  await a.reload();
  await expect(a.locator('main')).toContainText('may check out while the Stripe key is a test key');
}
/** The grown-up subscribes monthly on /family (password, fake Stripe page) and comes back to an active plan. */
async function subscribe(mum) {
  await mum.goto('/family');
  const plan = mum.locator('#plan');
  await expect(plan).toContainText('Subscribe: $7.99 a month');
  await expect(plan).toContainText('Subscribe: $69.00 a year');
  await expect(plan).toContainText('renews automatically');
  await mum.fill('#pw-checkout', PW);
  await Promise.all([mum.waitForURL(/\/family\?checkout=cs_test_/), plan.locator('button[value="month"]').click()]);
  // The webhook usually wins the race (the page then says so at once); otherwise the page waits for it.
  await expect(mum.locator('#plan')).toContainText('Your family plan is active', { timeout: 30_000 });
}
/** One Builder message through the Studio's API, waited for. -> the reply's status */
async function send(page, id, text) {
  const r = await page.request.post(`/api/studio/${id}/chat`, { data: { text, detach: true } });
  if (r.status() === 202) await expect.poll(async () => (await studioState(page, id)).busy, { timeout: 30_000 }).toBe(false);
  return r;
}

test('subscribe → webhook → the child\'s extra messages → Manage billing cancel → a refund ends the plan', async ({ browser }) => {
  const { kid, mum, mumName } = await linkedFamily(browser);
  // Not a billing tester yet: no Subscribe (test mode).
  await mum.goto('/family');
  await expect(mum.locator('#plan')).toContainText("aren't on sale yet");
  await makeTester(browser, mumName);
  await subscribe(mum);
  await expect(mum.locator('#plan')).toContainText('3 of 3 extra messages left this month');
  await expect(mum.locator('#plan button', { hasText: 'Manage billing' })).toBeVisible();

  // The child: the free messages first (2 a day here), then the family's extras.
  const game = await templateGame(kid);
  await expect(kid.locator('#st-turns')).toContainText('+3 extra this month');
  await expect(kid.locator('#st-turns')).toContainText('2 of 2');
  for (const text of ['make the fox orange', 'add more apples', 'make it faster']) expect((await send(kid, game.id, text)).status()).toBe(202);
  await kid.reload();
  await expect(kid.locator('#st-turns')).toContainText('0 of 2');
  await expect(kid.locator('#st-turns')).toContainText('+2 extra this month');
  await expect(kid.locator('main')).not.toContainText(/\$|plan|grown-up/i);

  // The admin sees the plan on /admin/billing.
  const a = await admin(browser);
  await a.goto('/admin/billing');
  await expect(a.locator('main')).toContainText('Family of @' + mumName);
  await expect(a.locator('main')).toContainText('open until');   // the first payment's refund window

  // Manage billing: the Portal (no password again within 10 minutes), Cancel plan, back to /family.
  await Promise.all([mum.waitForURL(new RegExp(`${STRIPE}/portal/`)), mum.locator('#plan button', { hasText: 'Manage billing' }).click()]);
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('#cancel')]);
  await expect(mum.locator('#plan')).toContainText("won't renew");
  await expect(mum.locator('#plan')).toContainText('Your family plan is active');

  // The owner refunds the payment in Stripe: the plan ends at once, the child is back on the free messages.
  const st = await (await fetch(`${STRIPE}/_test/state`, { method: 'POST' })).json();
  const sub = st.subscriptions.find(s => s.status === 'active' && s.cancel_at_period_end);
  expect((await control('refund-latest', { subscription: sub.id })).status).toBe(200);
  await mum.reload();
  await expect(mum.locator('#plan')).toContainText('No family plan');
  await kid.reload();
  await expect(kid.locator('#st-turns')).not.toContainText('extra this month');
  await a.goto('/admin/billing?status=canceled');
  await expect(a.locator('main')).toContainText('Family of @' + mumName);
  expect(st.violations).toEqual([]);
});

// ---------------------------------------------------------------- the kid-page crawl
const LOCALES = fs.readdirSync(path.join(ROOT, 'server/i18n/locales')).filter(f => f.endsWith('.json')).map(f => f.replace(/\.json$/, ''));
const load = code => JSON.parse(fs.readFileSync(path.join(ROOT, 'server/i18n/locales', `${code}.json`), 'utf8'));
const flat = (o, pre = '') => Object.entries(o || {}).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [[`${pre}${k}`, String(v)]]));
/** Words only grown-up pages may show, in one language (and English, the fallback): the family.* page strings and any
 *  info.parents.plans.* ones. Long literal pieces only (placeholders and tags cut out), so common words never match. */
function grownupWords(code) {
  const out = new Set();
  for (const loc of [load('en'), load(code)]) {
    for (const [k, v] of flat(loc)) {
      if (!/^(family\.|info\.parents\.plans\.)/.test(k)) continue;
      for (const piece of v.replace(/<[^>]+>/g, '\u0000').replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '\u0000').split('\u0000')) {
        const s = piece.trim(); if (s.length >= 18) out.add(s);
      }
    }
  }
  return [...out];
}
const PRICE = /\$\s?\d|\d\s?\$|US\$|USD|€|7[.,]99|69[.,]00/;
function check(problems, where, text, html, words) {
  if (/href="\/(grown-ups|family)(\/|"|\?)/.test(html)) problems.push(`${where}: links to a grown-up page`);
  if (PRICE.test(text)) problems.push(`${where}: a price (${text.match(PRICE)[0]})`);
  for (const w of words) if (text.includes(w)) { problems.push(`${where}: grown-up words "${w.slice(0, 40)}"`); break; }
}

test('kid pages in every language show no prices, plans or grown-up pages (family child at the limit, school student, guest)', async ({ browser }) => {
  // An entitled family child who has used every message today (2 free + 3 extras).
  const { kid, mum, mumName } = await linkedFamily(browser);
  await makeTester(browser, mumName);
  await subscribe(mum);
  const game = await templateGame(kid);
  for (let i = 0; i < 5; i++) await send(kid, game.id, `change number ${i}`);
  const limited = await send(kid, game.id, 'one more please');
  expect(limited.status()).toBe(429);
  // A school student (the seeded demo school) with a game of their own, and a guest.
  const student = await person(browser); await login(student, 'DemoStudent', DEMO_PW);
  const sgame = await templateGame(student);
  const guest = await person(browser);
  await guest.goto('/');
  const slug = (await guest.locator('a[href^="/g/"]').first().getAttribute('href')).replace('/g/', '');
  await guest.goto(`/g/${slug}`);
  const playBtn = guest.locator('a[href^="/play/"], button:has-text("Play")').first();
  if (await playBtn.count()) await playBtn.click().catch(() => {});
  const who = [
    ['family child', kid, ['/', '/me', '/build', '/search', `/g/${slug}`, `/play/${slug}`, `/studio/${game.id}`, '/friends']],
    ['school student', student, ['/', '/me', '/build', '/search', `/g/${slug}`, `/studio/${sgame.id}`]],
    ['guest', guest, ['/', '/search', `/g/${slug}`, `/play/${slug}`, '/me', '/safety']],
  ];
  const problems = [];
  for (const code of LOCALES) {
    const words = grownupWords(code);
    for (const [label, page, paths] of who) {
      await page.goto(`/?lang=${code}`);
      for (const p of paths) {
        await page.goto(p);
        if (p.startsWith('/studio/')) await expect(page.locator('#st-turns')).not.toBeEmpty();
        const text = await page.locator('body').innerText();
        check(problems, `${code} ${label} ${p}`, text, await page.content(), words);
      }
      // The Builder's limit message, in this language.
      if (page === kid) {
        const r = await send(kid, game.id, 'and again');
        const msg = (await r.json()).error || '';
        check(problems, `${code} ${label} limit message`, msg, '', words);
        if (!msg) problems.push(`${code}: no limit message`);
      }
    }
  }
  await kid.goto('/?lang=en');
  expect(problems).toEqual([]);
});

// ---------------------------------------------------------------- layout of the new pages
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test('the new pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  // A family about to subscribe (tester, linked child), one with a plan, and the admin.
  const before = await linkedFamily(browser); await makeTester(browser, before.mumName);
  const paid = await linkedFamily(browser); await makeTester(browser, paid.mumName); await subscribe(paid.mum);
  const beforeState = await before.mum.context().storageState(), paidState = await paid.mum.context().storageState();
  const adminState = await (await admin(browser)).context().storageState();
  const sets = [
    [beforeState, ['/family', '/family?checkout=cs_test_layoutcheck123']],
    [paidState, ['/family', '/grown-ups']],
    [adminState, ['/admin/billing']],
  ];
  const problems = [];
  for (const v of VIEWS) {
    for (const [state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: APP, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
      const page = await ctx.newPage();
      for (const p of paths) {
        await page.goto(v.lang ? `${p}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
      }
      await ctx.close();
    }
  }
  // Back to English for the accounts used above (?lang= is saved on the account).
  for (const pg of [before.mum, paid.mum]) await pg.goto('/family?lang=en');
  expect([...new Set(problems)]).toEqual([]);
});
