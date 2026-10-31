// Grown-ups can build (docs/decisions.md "Grown-ups can build"), end to end. Family pages are on only while billing is,
// so this spec runs its own server with billing on against the fake Stripe: the server on E2E_PORT + 11, the fake
// Stripe on E2E_PORT + 12.
//   - a grown-up signs up, has the Build tab, opens /build, starts a game from a template; the share dialog starts on
//     "My family", with a hint under each choice;
//   - published to the family: their linked child can play it, an unrelated child gets "not shared";
//   - changed to Everyone: it waits for the safety check, the admin approves it;
//   - an unrelated child sees the "Grown-up builder" tag with no link and no way to contact the grown-up;
//   - the five-tab bar fits at phone width; the /family "Your games" panel.
// GB_SHOTS: a folder to keep screenshots in (phone 390x844 and desktop, light).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, uniq, ownIp, ADMIN, templateGame, studioState, adminApprove } from './helpers.js';
import { topbarFit } from './topbar-fit.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 11, STRIPE_PORT = E2E + 12;
const GB = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.GB_SHOTS || '';
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: process.env.BRB_SNAPSHOTS || '0', CONTACT_EMAIL: 'help@example.com',
  ...(process.env.BRB_CHROMIUM ? { BRB_CHROMIUM: process.env.BRB_CHROMIUM } : {}),
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_gb', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: GB });
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-gb-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_gb', '--webhook', `${GB}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${GB}/health`);
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.afterAll(async () => {
  await stop(app); await stop(stripe);
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

const PHONE = { width: 390, height: 844 }, DESKTOP = { width: 1280, height: 860 };
async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: GB, colorScheme: 'light', ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', 'a-long-password-1'); await page.fill('#confirm', 'a-long-password-1');
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
  return name;
}
async function linkChild(mum, kidPage) {
  await kidPage.goto('/me');
  await kidPage.locator('#grownups [data-family-code]').click();
  await expect(kidPage.locator('#famcode-value')).toHaveText(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  const code = (await kidPage.locator('#famcode-value').textContent()).trim();
  await mum.goto('/family/link'); await mum.fill('#code', code);
  await Promise.all([mum.waitForURL(/\/family$/), mum.click('button[type=submit]')]);
  await kidPage.goto('/me');
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('Linked to your grown-up');
}
/** Screenshots at phone and desktop width (light): the same page in two windows of the same sign-in. */
async function shots(page, name, url, { prepare } = {}) {
  if (!SHOTS) return;
  const state = await page.context().storageState();
  for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const ctx = await page.context().browser().newContext({ baseURL: GB, viewport, colorScheme: 'light', storageState: state });
    const p = await ctx.newPage(); await ownIp(p);
    await p.goto(url); await p.evaluate(() => document.fonts.ready);
    if (prepare) await prepare(p);
    await p.screenshot({ path: path.join(SHOTS, `${name}-${label}.png`), fullPage: !prepare });
    await ctx.close();
  }
}

test('a grown-up builds a game for their family; their child plays it, another child can\'t; then Everyone, approved; no contact for kids', async ({ browser }) => {
  const mum = await person(browser, { viewport: PHONE });
  const mumName = await grownupSignup(mum);
  // The five tabs: Family · Build · Games · Plans · Account, and they fit at phone width.
  await mum.goto('/');
  const tabs = await mum.locator('.tabbar .tab').evaluateAll(l => l.map(a => a.getAttribute('href')));
  expect(tabs).toEqual(['/family', '/build', '/', '/plans', '/family/account']);
  const fit = await mum.evaluate(() => {
    const t = [...document.querySelectorAll('.tabbar .tab')].map(a => a.getBoundingClientRect());
    return { wide: document.documentElement.scrollWidth - innerWidth, off: t.some(b => b.left < 0 || b.right > innerWidth + 0.5), overlap: t.slice(1).some((b, i) => b.left < t[i].right - 0.5) };
  });
  expect(fit, JSON.stringify(fit)).toEqual({ wide: 0, off: false, overlap: false });
  for (const width of [360, 390]) {
    await mum.setViewportSize({ width, height: 800 }); await mum.goto('/');
    const w = await mum.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    expect(w, `no sideways scroll at ${width}`).toBe(0);
  }
  await mum.setViewportSize(PHONE);
  await shots(mum, 'grownup-home', '/');

  // A linked child, and a child of nobody here.
  const child = await person(browser); const childName = (await signup(child, uniq('Kid'))).username;
  await linkChild(mum, child);
  const other = await person(browser); await signup(other, uniq('Kid'));

  // The Builder: a template, then Publish opens on "My family".
  const g = await templateGame(mum, { title: uniq('Family Game ') });
  await mum.click('#st-publish');
  const sheet = mum.locator('.sheet').filter({ has: mum.locator('#vis-go') });
  await expect(sheet.locator('[data-vis="family"]')).toHaveAttribute('aria-pressed', 'true');
  expect(await sheet.locator('[data-vis]').evaluateAll(l => l.map(b => b.dataset.vis))).toEqual(['private', 'family', 'friends', 'public']);
  await expect(sheet.locator('[data-vis="friends"]')).toContainText('My grown-up connections');
  await expect(sheet.locator('[data-vis="family"] .vis-hint')).toContainText('said yes to your family link');
  await expect(sheet.locator('[data-vis="public"] .vis-hint')).toContainText(`Shown as ${mumName}, grown-up builder`);
  await expect(sheet).not.toContainText(childName);
  await expect(mum.locator('main')).not.toContainText('$');
  if (SHOTS) {
    await expect(mum.locator('.toast')).toHaveCount(0, { timeout: 6000 });
    await mum.screenshot({ path: path.join(SHOTS, 'share-picker-phone.png') });
    const state = await mum.context().storageState();
    const ctx = await browser.newContext({ baseURL: GB, viewport: DESKTOP, colorScheme: 'light', storageState: state }); const d = await ctx.newPage(); await ownIp(d);
    await d.goto(`/studio/${g.id}`); await d.click('#st-publish');
    await expect(d.locator('.sheet [data-vis="family"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(d.locator('.toast')).toHaveCount(0, { timeout: 6000 });
    await d.screenshot({ path: path.join(SHOTS, 'share-picker-desktop.png') });
    await ctx.close();
  }
  await sheet.locator('#vis-go').click();
  await expect(mum.locator('#vis-go')).toHaveCount(0);
  await expect.poll(async () => (await studioState(mum, g.id)).game.visibility).toBe('family');

  // Their child plays it; the other child is told it isn't shared with them.
  expect((await child.goto(`/g/${g.slug}`)).status()).toBe(200);
  await expect(child.locator('h1')).toContainText(g.title);
  expect((await other.goto(`/g/${g.slug}`)).status()).toBe(404);
  await expect(other.locator('main')).toContainText("isn't shared with you");

  // Everyone: it waits for the safety check (no model on the test server), and the admin approves it.
  await mum.goto(`/studio/${g.id}`);
  await mum.click('#st-share');
  const s2 = mum.locator('.sheet').filter({ has: mum.locator('#vis-go') });
  await s2.locator('[data-vis="public"]').click(); await s2.locator('#vis-go').click();
  await expect.poll(async () => (await studioState(mum, g.id)).pending?.visibility).toBe('public');
  expect((await other.goto(`/g/${g.slug}`)).status(), 'still the family\'s only, while it waits').toBe(404);
  const admin = await person(browser);
  await admin.goto('/login'); await admin.fill('#username', ADMIN.username); await admin.fill('#password', ADMIN.password);
  await Promise.all([admin.waitForURL(u => !u.pathname.startsWith('/login')), admin.click('button[type=submit]')]);
  await admin.goto('/admin?tab=queue');
  const card = admin.locator('article.reviewcard', { hasText: g.title });
  await expect(card).toContainText('Grown-up builder');
  await expect(card.locator(`a[href="/u/${mumName}"]`)).toHaveCount(0);
  await adminApprove(admin, g.id);
  await expect.poll(async () => (await studioState(mum, g.id)).game.visibility).toBe('public');

  // The unrelated child: the name and the tag, no link, no way to reach the grown-up, nothing about their child.
  await other.setViewportSize(PHONE);
  expect((await other.goto(`/g/${g.slug}`)).status()).toBe(200);
  const chip = other.locator('.ownerchip-grownup');
  await expect(chip).toContainText(mumName); await expect(chip).toContainText('Grown-up builder');
  await expect(other.locator('.gamehero a[href^="/u/"]')).toHaveCount(0);
  await expect(other.locator('a[href^="/chat"], [data-act="friend"], #followbtn')).toHaveCount(0);
  await expect(other.locator('main')).not.toContainText(childName);
  expect((await other.goto(`/u/${mumName}`)).status()).toBe(404);
  await shots(other, 'public-grownup-game-as-kid', `/g/${g.slug}`);

  // The grown-up's /family: Your games, with the game and its status; the child is in the family list only here.
  await mum.goto('/family');
  const yours = mum.locator('#your-games');
  await expect(yours).toContainText(g.title); await expect(yours).toContainText('Everyone');
  await expect(yours.locator('a[href="/build"]')).toBeVisible();
  await expect(yours.locator('a[href="/family/connections"]')).toBeVisible();
  await expect(yours).toContainText('Your Builder use');
  expect(await mum.locator('main').innerText()).not.toMatch(/\$\s?\d/);
  await shots(mum, 'family-your-games', '/family#your-games', { prepare: async p => { await p.locator('#your-games').scrollIntoViewIfNeeded(); } });
  if (SHOTS) {
    // Just the panel too, at each width.
    for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
      const ctx = await browser.newContext({ baseURL: GB, viewport, colorScheme: 'light', storageState: await mum.context().storageState() });
      const p = await ctx.newPage(); await ownIp(p); await p.goto('/family');
      await p.locator('#your-games').screenshot({ path: path.join(SHOTS, `family-your-games-panel-${label}.png`) });
      await ctx.close();
    }
  }
  // Desktop: Family · Build · Games · Plans fits in the top bar.
  for (const width of [821, 1000, 1280]) {
    await mum.setViewportSize({ width, height: 800 }); await mum.goto('/family'); await mum.evaluate(() => document.fonts.ready);
    expect(await mum.locator('.topnav .navlink').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/family', '/build', '/', '/plans']);
    const r = await mum.evaluate(topbarFit);
    expect(r.tight || r.off || r.wide > 0 || r.cut || r.missing.length, `@${width}: ${JSON.stringify(r)}`).toBeFalsy();
  }
});
