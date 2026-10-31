// Grown-up connections (docs/decisions.md "Grown-ups can build"), end to end: two grown-ups connect by swapping codes on
// /family/connections, and a kid who types a grown-up's code on /friends is told "not found", word for word as for a
// code nobody has. Its own server with billing on (family pages need it): E2E_PORT + 13, the fake Stripe on + 14.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, uniq, ownIp, ADMIN } from './helpers.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 13, STRIPE_PORT = E2E + 14;
const GC = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.GB_SHOTS || '';
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_gc', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: GC });
test.describe.configure({ mode: 'serial', timeout: 180_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-gc-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_gc', '--webhook', `${GC}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${GC}/health`);
});
test.afterAll(async () => {
  await stop(app); await stop(stripe);
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: GC, colorScheme: 'light', ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', 'a-long-password-1'); await page.fill('#confirm', 'a-long-password-1');
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
  return name;
}
const codeOf = async page => { await page.goto('/family/connections'); return (await page.locator('#mycode').textContent()).trim(); };

test('two grown-ups connect by code; the page has no chat and no profiles', async ({ browser }) => {
  const a = await person(browser, { viewport: { width: 390, height: 844 } }), b = await person(browser);
  const aName = await grownupSignup(a), bName = await grownupSignup(b);
  const bCode = await codeOf(b);
  expect(bCode).toMatch(/^[A-Z2-9]{6}$/);
  // From /family: the "My connections" link.
  await a.goto('/family');
  await Promise.all([a.waitForURL(/\/family\/connections$/), a.locator('#your-games a[href="/family/connections"]').click()]);
  await expect(a.locator('main')).toContainText('Connections are for grown-up accounts only');
  await a.fill('#code', bCode);
  await Promise.all([a.waitForURL(/\/family\/connections$/), a.waitForResponse(r => r.url().endsWith('/api/friends/add') && r.ok()), a.locator('form.conn-add button[type=submit]').click()]);
  await a.waitForLoadState('load');
  await expect(a.locator('#conn-out-h')).toBeVisible();
  await expect(a.locator('main')).toContainText(`@${bName}`);
  // B sees the request (and a badge on Family), and accepts.
  await b.goto('/');
  await expect(b.locator('.topnav a[href="/family"] .badge, .tabbar a[href="/family"] .badge').first()).toBeAttached();
  await b.goto('/family/connections');
  await expect(b.locator('#conn-in-h')).toBeVisible();
  await Promise.all([b.waitForLoadState('load'), b.locator('form[data-api$="/accept"] button').click()]);
  await expect(b.locator('#conn-list-h + ul')).toContainText(`@${aName}`);
  for (const p of [a, b]) {
    await p.goto('/family/connections');
    await expect(p.locator('main a[href^="/chat"], main a[href^="/u/"]')).toHaveCount(0);
  }
  await expect(a.locator('#conn-list-h + ul')).toContainText(`@${bName}`);
  if (SHOTS) await a.screenshot({ path: path.join(SHOTS, 'connections-phone.png'), fullPage: true });
});

test('a kid typing a grown-up\'s code on /friends is told it was not found, and nothing is sent', async ({ browser }) => {
  const mum = await person(browser);
  await grownupSignup(mum);
  const code = await codeOf(mum);
  const kid = await person(browser);
  await signup(kid, uniq('Kid'));
  await kid.goto('/friends');
  await kid.fill('#code', code);
  await kid.click('#addform [type=submit]');
  await expect(kid.locator('#code-err')).toHaveText("We couldn't find that code. Check each letter and try again.");
  // The same words for a code nobody has.
  await kid.fill('#code', 'ZZZZZZ'); await kid.click('#addform [type=submit]');
  await expect(kid.locator('#code-err')).toHaveText("We couldn't find that code. Check each letter and try again.");
  await mum.goto('/family/connections');
  await expect(mum.locator('#conn-in-h')).toHaveCount(0);
  // And the other way: a grown-up typing a kid's code.
  await kid.goto('/friends');
  const kidCode = (await kid.locator('#mycode').textContent()).trim();
  await mum.fill('#code', kidCode);
  await mum.locator('form.conn-add button[type=submit]').click();
  await expect(mum.locator('#code-err')).toHaveText("We couldn't find that code. Check each letter and try again.");
});
