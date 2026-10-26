// Grown-up accounts and family links (paid plans, chunk 3), end to end. Families are on only while billing is, so this
// spec runs its own server with billing on against the fake Stripe (tests/support/fake-stripe.js): the server on
// E2E_PORT + 3 (default 4313), the fake Stripe on E2E_PORT + 2. No payments yet.
//   - a child gets a code on /me, a grown-up signs up from /parents → /grown-ups and types it, the child says yes;
//   - a child reports a request, the admin sees it in the link reports queue;
//   - grown-ups are fenced in (404 on the Builder, friends, chat); kids never see a link to the grown-up pages;
//   - the new pages at 360 px and 1280 px, light and dark, and right to left (he): nothing touches, no sideways scroll.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, uniq, ownIp, ADMIN } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 3, STRIPE_PORT = E2E + 2;
const FAM = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SHOTS = process.env.FAMILY_SHOTS || '';   // a folder to keep screenshots of the new pages in (for a visual review)
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: FAM });
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-fam-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e', '--webhook', `${FAM}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
  await up(`${FAM}/health`);
});
test.afterAll(async () => {
  await stop(app); await stop(stripe);
  if (DATA) fs.rmSync(DATA, { recursive: true, force: true });
});

/** A fresh browser context (its own cookies and address). */
async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: FAM, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', 'a-long-password-1'); await page.fill('#confirm', 'a-long-password-1');
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
  return name;
}
async function getCode(page) {
  await page.goto('/me');
  const panel = page.locator('#grownups');
  await expect(panel).toContainText('A grown-up can link to your account.');
  await panel.locator('[data-family-code]').click();
  await expect(page.locator('#famcode')).toBeVisible();
  const code = (await page.locator('#famcode-value').textContent()).trim();
  expect(code).toMatch(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  return code;
}
async function enterCode(page, code) {
  await page.goto('/family/link');
  await page.fill('#code', code);
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
}

test('a child gets a code, a grown-up signs up from /parents and links, the child says yes', async ({ browser }) => {
  const kidPage = await person(browser);
  const kid = await signup(kidPage, uniq('Kid'));
  const code = await getCode(kidPage);
  await expect(kidPage.locator('#grownups')).toContainText('/family/link');
  await expect(kidPage.locator('#grownups a')).toHaveCount(0);   // the address is text, not a link

  const mum = await person(browser);
  await mum.goto('/parents');
  await Promise.all([mum.waitForURL(/\/grown-ups$/), mum.click('a[href="/grown-ups"]')]);
  await expect(mum.locator('h1')).toContainText('Oomba Academy for families');
  await expect(mum.locator('main')).toContainText('$7.99');
  await expect(mum.locator('main')).toContainText('US families');
  await Promise.all([mum.waitForURL(/\/grown-ups\/signup$/), mum.click('a[href="/grown-ups/signup"]')]);
  // The 12-character rule and the parent-or-guardian box.
  await mum.fill('#username', uniq('Mum')); await mum.fill('#password', 'too-short-1'); await mum.fill('#confirm', 'too-short-1'); await mum.check('#adult');
  await mum.click('button[type=submit]');
  await expect(mum.locator('#password-err')).toContainText('12');
  const mumName = await grownupSignup(mum);
  await expect(mum.locator('h1')).toContainText('Your family');
  await expect(mum.locator('.topnav')).toContainText('Family');
  await expect(mum.locator('.topnav a[href="/build"]')).toHaveCount(0);
  await enterCode(mum, code);
  await expect(mum.locator('.famkid.pending')).toContainText('Waiting for your child to say yes');
  await expect(mum.locator('main')).not.toContainText(kid.username);

  await kidPage.goto('/');
  await expect(kidPage.locator('.tabbar .tab[href="/me"] .badge, .me-btn .badge').first()).toBeAttached();
  await kidPage.goto('/me');
  await expect(kidPage.locator('#grownups')).toContainText('Your grown-up wants to link to your account');
  await expect(kidPage.locator('#grownups')).not.toContainText(mumName);
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Yes' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('Linked to your grown-up');

  await mum.goto('/family');
  await expect(mum.locator('.famkid')).toContainText(kid.username);
  await expect(mum.locator('.famkid')).toContainText('Family extra messages yesterday: 0');
  // Fenced in: the Builder, friends and chat are not there for a grown-up; /me is the family page.
  for (const p of ['/build', '/friends', '/chat', `/u/${kid.username}`]) expect((await mum.goto(p)).status(), p).toBe(404);
  await mum.goto('/me'); await expect(mum).toHaveURL(/\/family$/);
  // The child unlinks.
  kidPage.once('dialog', d => d.accept());
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Unlink' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('A grown-up can link to your account.');
});

test('a child reports a request; the admin sees it in the link reports queue', async ({ browser }) => {
  const kidPage = await person(browser);
  const kid = await signup(kidPage, uniq('Kid'));
  const code = await getCode(kidPage);
  const stranger = await person(browser);
  const strangerName = await grownupSignup(stranger, uniq('Strngr'));
  await enterCode(stranger, code);
  await kidPage.goto('/me');
  kidPage.once('dialog', d => d.accept());
  await Promise.all([kidPage.waitForLoadState('load'), kidPage.locator('#grownups button', { hasText: 'Report' }).click()]);
  await expect(kidPage.locator('#grownups')).toContainText('A grown-up can link to your account.');
  await stranger.goto('/family');
  await expect(stranger.locator('main')).toContainText('No children linked yet.');

  const admin = await person(browser);
  await admin.goto('/login'); await admin.fill('#username', ADMIN.username); await admin.fill('#password', ADMIN.password);
  await Promise.all([admin.waitForURL(u => !u.pathname.startsWith('/login')), admin.click('button[type=submit]')]);
  await admin.goto('/admin?tab=links');
  const card = admin.locator('article', { hasText: strangerName });
  await expect(card).toContainText(kid.username);
  await card.locator('[data-act="resolvelink"]').click();
  await expect(admin.locator('main')).toContainText('No link reports', { timeout: 10_000 });
});

test('kid pages show nothing about grown-up accounts, plans or prices', async ({ browser }) => {
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  for (const p of ['/', '/me', '/build', '/search', '/friends', '/parents?x=1']) {
    await kidPage.goto(p);
    const html = await kidPage.content();
    if (p.startsWith('/parents')) continue;   // a grown-up page (the footer link to it is allowed)
    expect(html, p).not.toMatch(/href="\/(grown-ups|family)/);
    expect(html, p).not.toMatch(/\$\d|family plan/i);
  }
});

// Each new page at a phone and a desktop width, light and dark, and right to left.
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test('the new pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  // Set up one of each state: a grown-up with a linked child and a waiting request, and a child being asked.
  const mum = await person(browser);
  await grownupSignup(mum, uniq('Mum'));
  const a = await person(browser); await signup(a, uniq('Kid')); const ca = await getCode(a);
  await enterCode(mum, ca);
  await a.goto('/me'); await Promise.all([a.waitForLoadState('load'), a.locator('#grownups button', { hasText: 'Yes' }).click()]);
  const b = await person(browser); await signup(b, uniq('Kid')); const cb = await getCode(b);
  await enterCode(mum, cb);
  const mumState = await mum.context().storageState(), askedState = await b.context().storageState(), linkedState = await a.context().storageState();
  const sets = [
    [null, ['/grown-ups', '/grown-ups/signup', '/grown-ups/login', '/parents']],
    [mumState, ['/family', '/family/link']],
    [askedState, ['/me#grownups']],
    [linkedState, ['/me#grownups']],
  ];
  const problems = [];
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  for (const v of VIEWS) {
    for (const [state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: FAM, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, ...(state ? { storageState: state } : {}) });
      const page = await ctx.newPage();
      for (const p of paths) {
        const url = v.lang ? `${p.split('#')[0]}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p;
        await page.goto(url);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
        if (SHOTS) {
          if (p.includes('#')) await page.locator(`#${p.split('#')[1]}`).scrollIntoViewIfNeeded();
          await page.screenshot({ path: path.join(SHOTS, `${p.replace(/[^a-z]+/gi, '_')}${state === askedState ? '_asked' : state === linkedState ? '_linked' : ''}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`), fullPage: !p.includes('#') });
        }
      }
      await ctx.close();
    }
  }
  expect([...new Set(problems)]).toEqual([]);
});

test('a grown-up meets no dead ends: every same-site link and form on their pages answers (no 404)', async ({ browser }) => {
  const mum = await person(browser);
  await grownupSignup(mum, uniq('Mum'));
  await mum.goto('/');
  const game = await mum.locator('a[href^="/g/"]').first().getAttribute('href');
  const seeds = ['/', '/search', '/search?q=a', '/family', '/family/link', '/parents', '/safety', '/grown-ups', game, game.replace('/g/', '/play/')];
  const hrefs = new Set(), apis = new Set();
  for (const p of seeds) {
    await mum.goto(p);
    for (const h of await mum.locator('a[href^="/"]').evaluateAll(as => as.map(a => a.getAttribute('href')))) hrefs.add(h.split('#')[0] || '/');
    for (const a of await mum.locator('[data-api]').evaluateAll(es => es.map(e => e.getAttribute('data-api')))) apis.add(a);
  }
  const dead = [];
  for (const h of [...hrefs].slice(0, 120)) { const r = await mum.request.get(h); if (r.status() === 404) dead.push(`GET ${h}`); }
  // Forms: sent empty (a 400 is fine, a 404 is a dead end). Signing out is left for last.
  for (const a of apis) {
    if (/\/api\/auth\/logout/.test(a)) continue;
    const r = await mum.request.post(a, { data: {} }); if (r.status() === 404) dead.push(`POST ${a}`);
  }
  // The game page's own buttons: Like and Rate are not shown to a grown-up.
  await mum.goto(game);
  await expect(mum.locator('#likebtn, #rate')).toHaveCount(0);
  await expect(mum.locator('a[href^="/u/"]')).toHaveCount(0);
  expect(dead).toEqual([]);
});

test('the code panel: a safety line next to the code; a new code hides "Lost it? Get a new one"', async ({ browser }) => {
  const kidPage = await person(browser);
  await signup(kidPage, uniq('Kid'));
  await getCode(kidPage);
  await expect(kidPage.locator('#famcode')).toContainText('Only give this code to your parent or guardian, face to face.');
  await kidPage.reload();
  await expect(kidPage.locator('#famcode-open')).toBeVisible();
  await kidPage.locator('[data-family-code]').click();
  await expect(kidPage.locator('#famcode')).toBeVisible();
  await expect(kidPage.locator('#famcode-open')).toBeHidden();
  await expect(kidPage.locator('[data-family-code]')).toHaveCount(0);
});
