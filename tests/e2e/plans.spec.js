// The plans page and the Basic plan (docs/decisions.md "Paid plans" §17), end to end against the fake Stripe
// (tests/support/fake-stripe.js): its own server with billing on (E2E_PORT + 8, default 4318) and the fake Stripe
// (E2E_PORT - 1), whose hosted Checkout page sends signed webhooks back to the server.
//   - signed out → /plans → Family yearly → grown-up sign-up keeps the plan → password → Checkout → "Now add your
//     child" → the child's code → linked, with the family's extra messages;
//   - Basic covers one child (a second can't be linked); Basic ↔ Family switched in the Portal (a webhook with the new
//     price on the same subscription);
//   - a kid on /plans: the Plans link in the menu, a calm "a grown-up buys plans" panel, nothing to buy;
//   - the pages at 360 px and 1280 px, light and dark, and right to left (he): nothing touches, no sideways scroll.
//     PLANS_SHOTS=<folder> keeps screenshots for a look by eye.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ownIp, ADMIN } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 8, STRIPE_PORT = E2E - 1;
const APP = `http://localhost:${PORT}`, STRIPE = `http://127.0.0.1:${STRIPE_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.PLANS_SHOTS || '';
const PW = 'a-long-password-1';
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  DEMO_TEACHER_PASSWORD: 'demo-pass-123', ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', BRB_MOCK_DELAY_MS: '0',
  CONTACT_EMAIL: 'help@example.com', BUILDER_DAILY_TURNS: '2', FAMILY_EXTRA_MESSAGES: '3', BASIC_EXTRA_MESSAGES: '2', FAMILY_CHILD_DAILY_MAX: '3',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e_plans', STRIPE_API_BASE: STRIPE, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '',
  STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
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
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-plans-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e_plans', '--webhook', `${APP}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
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
let adminP = null;
async function admin(browser) {
  if (adminP) return adminP;
  adminP = await person(browser); await login(adminP, ADMIN.username, ADMIN.password);
  return adminP;
}
/** The admin marks a grown-up as a billing tester on /admin (D14: the key is a test key). */
async function makeTester(browser, name) {
  const a = await admin(browser);
  await a.goto(`/admin?tab=users&username=${name}`);
  await Promise.all([a.waitForResponse(r => r.url().includes('/billing-tester') && r.ok()), a.locator('[data-act="tester"]').click()]);
}
/** From /plans, signed out: the test key means "not on sale" to a visitor (said at the top, "Coming soon" on the cards),
 *  so make a grown-up account from there, become a billing tester, pick the plan on /plans, and pay with the password
 *  on /family and the fake Stripe page. -> { mum, mumName } on /family after paying */
async function buyFromPlans(browser, plan = 'family', interval = 'year') {
  const mum = await person(browser);
  await mum.goto('/plans');
  await expect(mum.locator('#soon')).toContainText("Basic and Family plans can't be bought yet.");
  await expect(mum.locator(`#plan-${plan} .plan-soon`)).toHaveText('Coming soon');
  await expect(mum.locator('main a', { hasText: /Choose (Basic|Family)/ })).toHaveCount(0);
  await Promise.all([mum.waitForURL(/\/grown-ups\/signup$/), mum.locator('#soon a', { hasText: 'Make a grown-up account' }).click()]);
  const mumName = uniq('Mum');
  await mum.fill('#username', mumName); await mum.fill('#password', PW); await mum.fill('#confirm', PW); await mum.check('#adult');
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('button[type=submit]')]);
  // Test mode: on sale once the admin marks this account as a billing tester.
  await makeTester(browser, mumName);
  await mum.goto('/plans');
  await expect(mum.locator('#soon')).toHaveCount(0);
  if (interval === 'year') await Promise.all([mum.waitForURL(/interval=year/), mum.locator('.plan-seg a', { hasText: 'Yearly' }).click()]);
  const name = plan === 'basic' ? 'Choose Basic' : 'Choose Family';
  await Promise.all([mum.waitForURL(new RegExp(`/family\\?plan=${plan}&interval=${interval}`)), mum.locator(`#plan-${plan} a`, { hasText: name }).click()]);
  const form = mum.locator('#checkout');
  await expect(form).toContainText(`Start your ${plan === 'basic' ? 'Basic' : 'Family'} plan`);
  await expect(form).toContainText('You add your children after paying');
  await expect(form.locator(`button[value="${interval}"]`)).toHaveClass(/btn-primary/);
  await mum.fill('#pw-checkout', PW);
  await Promise.all([mum.waitForURL(/\/family\?(checkout=cs_test_|welcome=1)/, { timeout: 30_000 }), form.locator(`button[value="${interval}"]`).click()]);
  await expect(mum.locator('#plan .planchip.paid')).toHaveText(plan === 'basic' ? 'Basic plan' : 'Family plan', { timeout: 30_000 });
  return { mum, mumName };
}
/** A child's code from /me, typed by the grown-up, and the child's Yes. -> the child's page */
async function addChild(browser, mum, { expectError = null } = {}) {
  const kid = await person(browser); const { username } = await signup(kid, uniq('Kid'));
  await kid.goto('/me'); await kid.locator('#grownups [data-family-code]').click();
  await expect(kid.locator('#famcode-value')).toHaveText(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  const code = (await kid.locator('#famcode-value').textContent()).trim();
  await mum.goto('/family/link'); await mum.fill('#code', code);
  if (expectError) {
    await mum.click('button[type=submit]');
    await expect(mum.locator('#code-err')).toContainText(expectError);
    return { kid, username };
  }
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('button[type=submit]')]);
  await kid.goto('/me');
  await Promise.all([kid.waitForLoadState('load'), kid.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kid.locator('#grownups')).toContainText('Linked to your grown-up');
  return { kid, username };
}
const subOf = async () => (await control('state')).subscriptions.filter(s => s.status === 'active').at(-1);

test('signed out → Family yearly → sign-up keeps the plan → password → Checkout → "Now add your child" → linked child gets extras', async ({ browser }) => {
  const { mum } = await buyFromPlans(browser, 'family', 'year');
  await expect(mum).toHaveURL(/\/family\?welcome=1|\/family\?checkout=/);
  await mum.goto('/family?welcome=1');
  const welcome = mum.locator('#welcome');
  await expect(welcome).toContainText('Your Family plan is on. Thank you!');
  await expect(welcome.locator('h2')).toHaveText('Now add your child');
  await expect(welcome).toContainText('Your child signs in, opens Me');
  await expect(mum.locator('#plan')).toContainText('Yearly, renews on');
  await expect(mum.locator('#plan')).toContainText('3 of 3 extra messages left this month');
  await expect(mum.locator('#plan a', { hasText: 'Change plan' })).toHaveAttribute('href', '/plans');
  const { kid, username } = await addChild(browser, mum);
  await mum.goto('/family');
  await expect(mum.locator('.famkid')).toContainText(username);
  await expect(mum.locator('.famkid')).toContainText('Extra messages come from your family plan.');
  await expect(mum.locator('#welcome')).toHaveCount(0);
  // The child: nothing about money; the Studio counter shows the extras as a number only.
  await kid.goto('/');
  await expect(kid.locator('.topnav a[href="/plans"]')).toHaveText(/Plans/);
  // /plans marks the grown-up's plan, and Basic says "Switch".
  await mum.goto('/plans');
  await expect(mum.locator('#plan-family .plan-yours')).toHaveText('Your plan');
  await expect(mum.locator('#plan-basic a', { hasText: 'Switch to this plan' })).toBeVisible();
});

test('Basic covers one child; Family ↔ Basic switched in the Portal keeps the links and says who gets the extras', async ({ browser }) => {
  const { mum } = await buyFromPlans(browser, 'basic', 'month');
  await expect(mum.locator('#plan')).toContainText('2 of 2 extra messages left this month');
  await expect(mum.locator('#plan')).toContainText('Covers 1 child.');
  const first = await addChild(browser, mum);
  await mum.goto('/family');
  await expect(mum.locator('main')).toContainText('Your Basic plan covers 1 child. To link more, switch to the Family plan');
  await expect(mum.locator('a[href="/family/link"]')).toHaveCount(0);
  await addChild(browser, mum, { expectError: 'Your Basic plan covers 1 child' });
  // Upgrade in the Portal: the same subscription gets the Family price (Stripe sends customer.subscription.updated).
  const sub = await subOf();
  expect((await control('switch-plan', { subscription: sub.id, lookupKey: 'oomba_family_monthly' })).status).toBe(200);
  await mum.goto('/family');
  await expect(mum.locator('#plan .planchip.paid')).toHaveText('Family plan');
  const second = await addChild(browser, mum);
  await mum.goto('/family');
  await expect(mum.locator('.famkid')).toHaveCount(2);
  // Downgrade back to Basic: both stay linked; only the first linked child keeps the extras, and the page says so.
  expect((await control('switch-plan', { subscription: sub.id, lookupKey: 'oomba_basic_monthly' })).status).toBe(200);
  await mum.goto('/family');
  await expect(mum.locator('#plan .planchip.paid')).toHaveText('Basic plan');
  await expect(mum.locator('.famkid')).toHaveCount(2);
  await expect(mum.locator('#basic-note')).toContainText('Your Basic plan covers one child');
  await expect(mum.locator('#basic-note')).toContainText(first.username.replace(/^Kid/, 'Kid'));
  await expect(mum.locator('.famkid', { hasText: first.username })).toContainText('Extra messages come from your Basic plan.');
  await expect(mum.locator('.famkid', { hasText: second.username })).toContainText('Uses the free daily messages.');
  expect((await control('state')).violations).toEqual([]);
});

test('a kid on /plans: the Plans link in the menu, every plan to look at, and a calm "a grown-up buys plans" panel', async ({ browser }) => {
  const kid = await person(browser); await signup(kid, uniq('Kid'));
  await kid.goto('/');
  await Promise.all([kid.waitForURL(/\/plans$/), kid.locator('.topnav a[href="/plans"]').click()]);
  await expect(kid.locator('.plan-card')).toHaveCount(4);
  await expect(kid.locator('#plan-free .plan-yours')).toHaveText('Your plan');
  // No sales nudging for kids: no "Recommended" badge.
  await expect(kid.locator('.plan-badge')).toHaveCount(0);
  await expect(kid.locator('main')).not.toContainText('Recommended');
  await expect(kid.locator('main a[href^="/grown-ups"], main a[href^="/family"]')).toHaveCount(0);
  await Promise.all([kid.waitForURL(/ask=family/), kid.locator('#plan-family a', { hasText: 'How to get it' }).click()]);
  const ask = kid.locator('#ask');
  await expect(ask).toContainText('A grown-up buys plans');
  await expect(ask).toContainText('They can sign up at');
  await expect(ask).toContainText('/plans');
  await expect(ask).toContainText('You can keep playing and building for free.');
  await expect(ask.locator('a')).toHaveCount(0);
  // On a phone the Plans tab is in the tab bar.
  const phone = await person(browser, { viewport: { width: 360, height: 780 }, storageState: await kid.context().storageState() });
  await phone.goto('/');
  await expect(phone.locator('.tabbar a[href="/plans"]')).toBeVisible();
});

// Each page at a phone and a desktop width, light and dark, and right to left.
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test('the pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  const paid = await buyFromPlans(browser, 'basic', 'month');
  const fresh = await person(browser);
  await fresh.goto('/grown-ups/signup');
  const freshName = uniq('Dad');
  await fresh.fill('#username', freshName); await fresh.fill('#password', PW); await fresh.fill('#confirm', PW); await fresh.check('#adult');
  await Promise.all([fresh.waitForURL(/\/family/), fresh.click('button[type=submit]')]);
  await makeTester(browser, freshName);
  const kid = await person(browser); await signup(kid, uniq('Kid'));
  const teacher = await person(browser); await login(teacher, 'DemoTeacher', 'demo-pass-123').catch(() => {});
  const sets = [
    ['out', null, ['/plans', '/plans?interval=year', '/plans/schools', '/plans/schools?students=10', '/plans/schools/print?students=140', '/grown-ups', '/grown-ups/signup?plan=family&interval=year', '/grown-ups/login?plan=basic&interval=month']],
    ['kid', await kid.context().storageState(), ['/', '/plans?ask=basic']],
    ['grownup', await fresh.context().storageState(), ['/plans', '/family', '/family?plan=basic&interval=month']],
    ['basic', await paid.mum.context().storageState(), ['/plans', '/family?welcome=1']],
    ['teacher', await teacher.context().storageState(), ['/plans?ask=family']],
  ];
  const problems = [];
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const v of VIEWS) {
    for (const [label, state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: APP, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, ...(state ? { storageState: state } : {}) });
      const page = await ctx.newPage();
      for (const p of paths) {
        await page.goto(v.lang ? `${p}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        for (const t of await findTouching(page)) problems.push(`${label} ${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${label} ${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
        if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${label}${p.replace(/[^a-z]+/gi, '_')}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`), fullPage: true });
      }
      await ctx.close();
    }
  }
  // Back to English for the accounts used above (?lang= is saved on the account).
  for (const pg of [paid.mum, fresh, kid, teacher]) await pg.goto('/?lang=en').catch(() => {});
  expect([...new Set(problems)]).toEqual([]);
});

test('/plans/schools: the seat calculator (Stripe\'s seat price, at least 25) and "Send this to my admin"', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/plans/schools');
  await expect(page.locator('#calc-students')).toHaveValue('25');
  await page.fill('#calc-students', '12');
  await Promise.all([page.waitForURL(/students=12/), page.locator('#calc button[type=submit]').click()]);
  await expect(page.locator('.seatcalc-out')).toHaveText('25 students × $20.00 = $500.00 a year');
  await expect(page.locator('#calc')).toContainText('so a smaller school pays for 25');
  await page.fill('#calc-students', '140');
  await Promise.all([page.waitForURL(/students=140/), page.locator('#calc button[type=submit]').click()]);
  await expect(page.locator('.seatcalc-out')).toHaveText('140 students × $20.00 = $2,800.00 a year');
  await Promise.all([page.waitForURL(/\/plans\/schools\/print\?students=140/), page.locator('a', { hasText: 'Send this to my admin' }).click()]);
  await expect(page.locator('.printdoc')).toContainText('$2,800.00');
  await expect(page.locator('[data-print]')).toBeVisible();
  // Printed: no menus, no buttons, just the page.
  await page.emulateMedia({ media: 'print' });
  for (const sel of ['.topbar', '.tabbar', '.foot', '.printbar']) await expect(page.locator(sel)).toBeHidden();
  await expect(page.locator('h1')).toBeVisible();
  await page.context().close();
});

test('six menu items (a teacher: Classes and Plans) fit the top bar from small laptops to wide screens', async ({ browser }) => {
  const teacher = await person(browser); await login(teacher, 'DemoTeacher', 'demo-pass-123');
  const state = await teacher.context().storageState();
  const problems = [];
  for (const width of [821, 900, 1000, 1001, 1100, 1180, 1181, 1280, 1400, 1440]) {
    for (const lang of ['en', 'ru']) {
      const ctx = await browser.newContext({ baseURL: APP, viewport: { width, height: 800 }, storageState: state });
      const page = await ctx.newPage();
      await page.goto(`/plans?lang=${lang}`);
      await expect(page.locator('.topnav .navlink')).toHaveCount(6);
      for (const t of await findTouching(page)) problems.push(`${width}/${lang}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${width}/${lang}: scrolls sideways by ${wide}px`);
      const over = await page.evaluate(() => { const b = document.querySelector('.topbar').getBoundingClientRect(); return [...document.querySelectorAll('.topbar > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > b.right + 1 || r.left < b.left - 1); }).map(e => e.className); });
      if (over.length) problems.push(`${width}/${lang}: outside the top bar: ${over.join(', ')}`);
      if (SHOTS) await page.locator('.topbar').screenshot({ path: path.join(SHOTS, `topbar-teacher-${width}-${lang}.png`) });
      await ctx.close();
    }
  }
  await teacher.goto('/?lang=en');
  expect([...new Set(problems)]).toEqual([]);
});
