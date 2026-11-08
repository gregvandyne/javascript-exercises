// The Builder's daily-limit card and Spark Packs, end to end in the browser (docs/decisions.md "Spark Packs"), against
// the fake Stripe (tests/support/fake-stripe.js): its own server with billing on (E2E_PORT + 5) and the fake Stripe
// (E2E_PORT + 4), whose hosted Checkout pages send signed webhooks back; and a second server whose AI budget is spent
// (E2E_PORT + 6) for the "resting for everyone" card.
//   - free account: a kid hits the limit → "Ask my grown-up" → the grown-up's Family badge and request → /plans →
//     Checkout (subscription) → webhook → the kid's card lifts without a reload → the next message builds;
//   - paid account: the kid hits the limit (free + plan extras) → asks for a Spark Pack → the grown-up buys one
//     (password, one-time Checkout) → webhook → the card lifts → builds from the pack → the counter goes down;
//   - a kid with no grown-up (the address and QR code, no link, no price), a grown-up building themselves (free: /plans;
//     paid: the Spark Pack picker), a school student ("ask your teacher"), the AI resting for everyone (no offer);
//   - screenshots (phone and desktop, light and dark) for a contact sheet when SHOTS_DIR is set.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ownIp, ADMIN, templateGame, studioState } from './helpers.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 5, STRIPE_PORT = E2E + 4, REST_PORT = E2E + 6;
const APP = `http://localhost:${PORT}`, STRIPE = `http://127.0.0.1:${STRIPE_PORT}`, REST = `http://localhost:${REST_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PW = 'a-long-password-1', DEMO_PW = 'demo-pass-123';
const SHOTS = process.env.SHOTS_DIR || '';
let DATA = null, DATA2 = null, app = null, rest = null, stripe = null;
const env = (port, data, extra = {}) => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), BRB_DATA_DIR: data, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  DEMO_TEACHER_PASSWORD: DEMO_PW, ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', BRB_MOCK_DELAY_MS: '0',
  CONTACT_EMAIL: 'help@example.com', BUILDER_DAILY_TURNS: '2', FAMILY_EXTRA_MESSAGES: '2', FAMILY_CHILD_DAILY_MAX: '2',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e_spark', STRIPE_API_BASE: STRIPE, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '',
  STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '', ...extra,
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 90_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };
const control = async (what, body = {}) => (await fetch(`${STRIPE}/_test/${what}`, { method: 'POST', body: JSON.stringify(body) })).json();

test.use({ baseURL: APP });
test.describe.configure({ mode: 'serial', timeout: 600_000 });
test.beforeAll(async () => {
  test.setTimeout(240_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-spark-'));
  DATA2 = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-spark-rest-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e_spark', '--webhook', `${APP}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`${STRIPE}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(PORT, DATA), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(PORT, DATA), stdio: 'ignore' });
  // The AI budget spent for today (AI_DAILY_BUDGET_USD=0): the site's AI rests for everyone.
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(REST_PORT, DATA2, { AI_DAILY_BUDGET_USD: '0' }), stdio: 'ignore' });
  rest = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(REST_PORT, DATA2, { AI_DAILY_BUDGET_USD: '0' }), stdio: 'ignore' });
  await up(`${APP}/health`); await up(`${REST}/health`);
});
test.afterAll(async () => {
  await stop(app); await stop(rest); await stop(stripe);
  for (const d of [DATA, DATA2]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: APP, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', PW); await page.fill('#confirm', PW);
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
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
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('button[type=submit]')]);
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
async function makeTester(browser, name) {
  const a = await admin(browser);
  await a.goto(`/admin?tab=users&username=${name}`);
  await Promise.all([a.waitForResponse(r => r.url().includes('/billing-tester') && r.ok()), a.locator('[data-act="tester"]').click()]);
}
/** One Builder message through the Studio's API, waited for. -> the reply */
async function send(page, id, text) {
  const r = await page.request.post(`/api/studio/${id}/chat`, { data: { text, detach: true } });
  if (r.status() === 202) await expect.poll(async () => (await studioState(page, id)).busy, { timeout: 30_000 }).toBe(false);
  return r;
}
/** Sends until the Builder says "limit", then reloads the Studio (the card is drawn from the state). */
async function toLimit(page, id) {
  for (let i = 0; i < 12; i++) { const r = await send(page, id, `change number ${i}`); if (r.status() === 429) break; }
  await page.goto(`/studio/${id}`);
  await expect(page.locator('#st-limit')).toBeVisible();
}
/** The kid's tab comes back into view (as after the grown-up paid on another device): the card reads the state again. */
const backInView = page => page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
/** The grown-up subscribes to the Family plan (monthly) from /plans. */
async function subscribe(mum) {
  await mum.goto('/plans');
  await Promise.all([mum.waitForURL(/\/family\?plan=family&interval=month/), mum.locator('#plan-family a', { hasText: 'Choose Family' }).click()]);
  await mum.fill('#pw-checkout', PW);
  await Promise.all([mum.waitForURL(/\/family\/add\?from=checkout$/, { timeout: 30_000 }), mum.locator('#plan button[value="month"]').click()]);
  await mum.goto('/family');
  await expect(mum.locator('#plan .planchip.paid')).toHaveText('Family plan');
}
/** No price, no link to a grown-up or checkout page, in the card. */
async function kidSafe(card) {
  const htmlText = await card.innerHTML();
  expect(htmlText).not.toMatch(/href="\/(plans|family|grown-ups|parents)|checkout|\$\s?\d|\d[.,]\d\d/);
  expect(await card.innerText()).not.toMatch(/\bplan\b|price|\$|buy|pay/i);
}

const VIEWS = [
  { name: 'phone-light', viewport: { width: 360, height: 780 }, colorScheme: 'light' },
  { name: 'phone-dark', viewport: { width: 360, height: 780 }, colorScheme: 'dark' },
  { name: 'desktop-light', viewport: { width: 1280, height: 860 }, colorScheme: 'light' },
  { name: 'desktop-dark', viewport: { width: 1280, height: 860 }, colorScheme: 'dark' },
];
/** Screenshots of a page in the four views (only when SHOTS_DIR is set). focus: a selector scrolled into view. */
async function shots(browser, label, page, url, focus, base = APP) {
  if (!SHOTS) return;
  fs.mkdirSync(SHOTS, { recursive: true });
  const state = await page.context().storageState();
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ baseURL: base, viewport: v.viewport, colorScheme: v.colorScheme, storageState: state });
    const p = await ctx.newPage();
    await p.goto(url);
    if (focus) { const el = p.locator(focus).first(); await el.waitFor({ state: 'visible', timeout: 15_000 }); await el.scrollIntoViewIfNeeded(); }
    await p.waitForTimeout(300);
    await p.screenshot({ path: path.join(SHOTS, `${label}--${v.name}.png`) });
    await ctx.close();
  }
}

test('free account: the kid asks → the grown-up buys a plan → the card lifts without a reload → the next message builds', async ({ browser }) => {
  const { kid, mum, mumName } = await linkedFamily(browser);
  const game = await templateGame(kid);
  await toLimit(kid, game.id);
  const card = kid.locator('#st-limit');
  await expect(card).toContainText('You have used all your Builder messages for today');   // the lead stays
  await expect(card).toContainText('Your grown-up can unlock more Builder messages');
  await kidSafe(card);
  await expect(kid.locator('#st-send')).toBeDisabled();
  await shots(browser, '1-free-kid', kid, `/studio/${game.id}`, '#st-limit');
  // Ask: one tap, then "your grown-up will see it" (a second ask is not offered).
  await Promise.all([kid.waitForResponse(r => r.url().endsWith('/api/studio/ask-grownup') && r.ok()), card.locator('[data-act="ask-grownup"]').click()]);
  await expect(card).toContainText('Your grown-up will see that you asked');
  await expect(card.locator('[data-act="ask-grownup"]')).toHaveCount(0);
  // The grown-up: a badge on Family, the request on /family with the child's name, a way to the plans.
  await mum.goto('/family');
  const asks = mum.locator('#asks');
  await expect(asks).toContainText('used today\'s Builder messages and asked for more building');
  await expect(asks.locator('a[href="/plans"]')).toBeVisible();
  await makeTester(browser, mumName);
  await subscribe(mum);
  await mum.goto('/family');
  await expect(mum.locator('#asks')).toHaveCount(0);   // the plan answered it
  // The kid's open Studio: back in view, the card goes, the counter shows the family's extras.
  await backInView(kid);
  await expect(card).toBeHidden({ timeout: 15_000 });
  await expect(kid.locator('#st-turns')).toContainText('+2 extra this month');
  await expect(kid.locator('#st-send')).toBeEnabled();
  expect((await send(kid, game.id, 'make the fox orange')).status()).toBe(202);
  await kid.reload();
  await expect(kid.locator('#st-turns')).toContainText('+1 extra this month');
});

test('paid account: the kid asks for a Spark Pack → the grown-up buys one (one-time Checkout) → builds from the pack', async ({ browser }) => {
  const { kid, mum, mumName } = await linkedFamily(browser);
  await makeTester(browser, mumName);
  await subscribe(mum);
  const game = await templateGame(kid);
  await toLimit(kid, game.id);   // 2 free + 2 extras
  const card = kid.locator('#st-limit');
  await expect(card).toContainText('Your grown-up can add a Spark Pack');
  await kidSafe(card);
  await shots(browser, '3-paid-kid', kid, `/studio/${game.id}`, '#st-limit');
  await card.locator('[data-act="ask-grownup"]').click();
  await expect(card).toContainText('Your grown-up will see that you asked');
  // The grown-up: the request → the Spark Pack picker (prices here only), password, the 60 pack.
  await mum.goto('/family');
  await expect(mum.locator('#asks')).toContainText('asked for a Spark Pack');
  await Promise.all([mum.waitForURL(/sparks=1/), mum.locator('#asks a', { hasText: 'Get a Spark Pack' }).click()]);
  const picker = mum.locator('#sparks-buy');
  await expect(picker).toContainText('25 messages · $4.99');
  await expect(picker).toContainText('60 messages · $9.99');
  await expect(picker).toContainText('150 messages · $19.99');
  await expect(picker).toContainText('One payment. Nothing renews.');
  await shots(browser, '7-pack-picker', mum, '/family?sparks=1#sparks', '#sparks-buy');
  // Tampering with the page (another value on the button) is refused by the server.
  await mum.evaluate(() => { document.querySelector('#sparks-buy button[value="p25"]').value = 'p999'; });
  await mum.fill('#pw-sparks', PW).catch(() => {});
  await picker.locator('button[value="p999"]').click();
  await expect(picker.locator('.form-err')).not.toBeEmpty();
  await mum.goto('/family?sparks=1#sparks');
  if (await mum.locator('#pw-sparks').isVisible()) await mum.fill('#pw-sparks', PW);
  await Promise.all([mum.waitForURL(/\/family(\?|#|$)/, { timeout: 30_000 }), mum.locator('#sparks-buy button[value="p60"]').click()]);
  await expect(mum.locator('#sparks-left')).toContainText('60 Spark Pack messages left', { timeout: 30_000 });
  await expect(mum.locator('#asks')).toHaveCount(0);
  const st = await control('state');
  const sess = st.checkouts.at(-1);
  expect(sess.mode).toBe('payment');
  expect(sess.line_items).toEqual([{ price: 'price_fake_spark_60', quantity: '1' }]);
  expect(sess.metadata).toMatchObject({ kind: 'spark_pack', pack: 'p60', owner_kind: 'family' });
  await shots(browser, '8-family-billing', mum, '/family', '#sparks');
  // The kid: back in view, the card goes; the counter shows the pack; a message builds from it.
  await backInView(kid);
  await expect(card).toBeHidden({ timeout: 15_000 });
  await expect(kid.locator('#st-turns')).toContainText('60 Spark Pack messages');
  expect((await send(kid, game.id, 'add a castle')).status()).toBe(202);
  await kid.reload();
  await expect(kid.locator('#st-turns')).toContainText('59 Spark Pack messages');
  // The admin sees the purchase.
  const a = await admin(browser);
  await a.goto('/admin/billing');
  await expect(a.locator('#sparks')).toContainText(`@${mumName}`);
  await expect(a.locator('#sparks')).toContainText('$9.99');
  // The webhook again (Stripe retries): still 59.
  const sessions = (await control('sessions')).sessions.filter(s => s.mode === 'payment');
  await control('emit', { type: 'checkout.session.completed', id: sessions.at(-1).id });
  expect((await studioState(kid, game.id)).sparkLeft).toBe(59);
});

test('a kid with no grown-up, grown-ups building themselves (free and paid), a school student, and the AI resting for everyone', async ({ browser }) => {
  // No grown-up linked: where a grown-up can look (text and a QR code, never a link), and the "link" line to Me.
  const lone = await person(browser); await signup(lone, uniq('Solo'));
  const g1 = await templateGame(lone);
  await toLimit(lone, g1.id);
  const card = lone.locator('#st-limit');
  await expect(card).toContainText('Show this to a grown-up');
  await expect(card.locator('.st-limit-show bdi')).toContainText('/parents');
  await expect(card.locator('.st-limit-qr svg')).toBeVisible();
  await expect(card.locator('a[href="/me#grownups"]')).toBeVisible();
  await expect(card.locator('[data-act="ask-grownup"]')).toHaveCount(0);
  await kidSafe(card);
  await shots(browser, '0-free-kid-no-grownup', lone, `/studio/${g1.id}`, '#st-limit');
  // A grown-up without a plan, building: a link to /plans (no amount).
  const solo = await person(browser); await grownupSignup(solo);
  const g2 = await templateGame(solo);
  await toLimit(solo, g2.id);
  const gcard = solo.locator('#st-limit');
  await expect(gcard.locator('a[href="/plans"]')).toContainText('See plans for more Builder messages');
  expect(await gcard.innerText()).not.toMatch(/\$/);
  await shots(browser, '2-free-grownup', solo, `/studio/${g2.id}`, '#st-limit');
  await Promise.all([solo.waitForURL(/\/plans$/), gcard.locator('a[href="/plans"]').click()]);
  // A grown-up with a plan, building: the Spark Pack picker.
  const { mum, mumName } = await linkedFamily(browser);
  await makeTester(browser, mumName); await subscribe(mum);
  const g3 = await templateGame(mum);
  await toLimit(mum, g3.id);
  const pcard = mum.locator('#st-limit');
  await expect(pcard.locator('a[data-upsell="spark"]')).toContainText('Get a Spark Pack');
  await shots(browser, '4-paid-grownup', mum, `/studio/${g3.id}`, '#st-limit');
  await Promise.all([mum.waitForURL(/\/family\?sparks=1#sparks$/), pcard.locator('a[data-upsell="spark"]').click()]);
  await expect(mum.locator('#sparks-buy')).toBeVisible();
  // A school student (the seeded demo school): ask your teacher, no offer.
  const student = await person(browser); await login(student, 'DemoStudent', DEMO_PW);
  const g4 = await templateGame(student);
  await toLimit(student, g4.id);
  const scard = student.locator('#st-limit');
  await expect(scard).toContainText('Ask your teacher when you can build again');
  await expect(scard.locator('[data-act="ask-grownup"], .st-limit-qr, a[href="/plans"]')).toHaveCount(0);
  await shots(browser, '5-school-student', student, `/studio/${g4.id}`, '#st-limit');
  // The site's AI is resting for everyone (another server, its AI budget spent): no offer, only that it rests.
  const tired = await browser.newContext({ baseURL: REST }); const rp = await tired.newPage(); await ownIp(rp);
  await signup(rp, uniq('Rest'));
  const g5 = await templateGame(rp);
  await toLimit(rp, g5.id);
  const rcard = rp.locator('#st-limit');
  await expect(rcard).toContainText('The Builder is resting for everyone right now');
  await expect(rcard.locator('[data-act="ask-grownup"], .st-limit-qr, a[href="/plans"]')).toHaveCount(0);
  await shots(browser, '6-site-resting', rp, `/studio/${g5.id}`, '#st-limit', REST);
  await tired.close();
});
