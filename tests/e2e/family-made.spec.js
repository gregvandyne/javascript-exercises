// Parent-made child accounts (docs/decisions.md "Parent-made child accounts"), end to end, with the flag on. They need
// families (billing on, against the fake Stripe) and PARENT_MADE_CHILDREN=1, so this spec runs its own server: the app
// on E2E_PORT + 9 (default 4319), the fake Stripe on E2E_PORT + 10.
//   - a grown-up signs up, makes their child's account, switches to it; the child plays and builds, answers the
//     first-sign-in card, signs out; the grown-up signs in again with their own password;
//   - "What we keep" (password first, counts only) and Delete (the name typed);
//   - the kid crawl after a switch (no prices, plan names or grown-up pages; the six kid tabs; the grown-up pages 404);
//   - the new pages at 360 / 1280, light / dark, he / ar: nothing touches, no sideways scroll.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { uniq, ownIp, ADMIN, templateGame, studioState, gameFrame } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 9, STRIPE_PORT = E2E + 10;
const APP = `http://localhost:${PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PW = 'a-long-password-1', KID_PW = 'rainbow-77';
const SHOTS = process.env.MADE_SHOTS || '';   // a folder to keep screenshots of the new pages in (for a visual review)
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_made', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
  PARENT_MADE_CHILDREN: '1',
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };

test.use({ baseURL: APP });
test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(120_000);
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-made-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_made', '--webhook', `${APP}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
  await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
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
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
  return name;
}
/** "Make your child's account" (/family/children/new; its door on /family is "Add your kids", tests/e2e/family-add.spec.js),
 *  the form, back on /family with the new row. -> { kidName, token } */
async function makeChild(page, kidName = uniq('Kid')) {
  await page.goto('/family/children/new');
  await expect(page.locator('h1')).toHaveText("Make your child's account");
  await page.fill('#made-name', kidName); await page.fill('#made-pw', KID_PW); await page.fill('#made-confirm', KID_PW);
  if (await page.locator('#pw-made').isVisible()) await page.fill('#pw-made', PW);
  await expect(page.locator('.made-noconsent')).toContainText('is not a parental consent check');
  await page.check('#made-ack'); await page.check('#made-guardian');
  await Promise.all([page.waitForURL(/\/family\?made=/), page.click('button[type=submit]:has-text("Make the account")')]);
  const token = new URL(page.url()).searchParams.get('made');
  const row = page.locator('.famkid-made', { hasText: kidName });
  await expect(row).toContainText('You made this account');
  await expect(row.locator('.famkid-ready')).toContainText('Account ready');
  return { kidName, token, row };
}
/** Switch on the row (open right after making it): the child's password, then the kid home. */
async function switchTo(page, row) {
  const sw = row.locator('details.famkid-act').first();
  if (!(await sw.evaluate(d => d.open))) await sw.locator('summary').click();
  await sw.locator('input[name="childPassword"]').fill(KID_PW);
  const gp = sw.locator('input[name="password"]');
  if (await gp.isVisible()) await gp.fill(PW);
  await Promise.all([page.waitForURL(u => u.pathname === '/'), sw.locator('button[type=submit]').click()]);
}
const TABS = [['/', 'Home'], ['/search', 'Search'], ['/build', 'Build'], ['/friends', 'Friends'], ['/plans', 'Plans'], ['/me', 'Me']];
const tabsOf = page => page.locator('.tabbar .tab').evaluateAll(l => l.map(a => [a.getAttribute('href'), a.querySelector('.tab-t').textContent]));

test('a grown-up signs up, makes their child\'s account and switches; the child plays and builds; back to the grown-up with their password', async ({ browser }) => {
  const page = await person(browser, { viewport: { width: 360, height: 780 } });
  const mumName = await grownupSignup(page);
  await page.goto('/family');
  await expect(page.locator('#famcheck')).toContainText('Add your child');
  await expect(page.locator('#famcheck')).toContainText('Make your child\'s account, or link one they already have.');
  const { kidName, row } = await makeChild(page);
  // No Remove for a made child: Delete instead.
  await expect(row.locator('button:has-text("Unlink")')).toHaveCount(0);
  await expect(row.locator('a', { hasText: 'Delete account' })).toBeVisible();
  await expect(row.locator('details.famkid-act').first().locator('.small')).toContainText('This signs you out here');
  await switchTo(page, row);
  // The child: the normal kid shell, the first-sign-in card, no way back but a real sign-in.
  expect(await tabsOf(page)).toEqual(TABS);
  const card = page.locator('.madecard');
  await expect(card).toContainText('A grown-up made this account for you.');
  await expect(card).toContainText('They can see some counts about your account');
  // The full list folds under "What can they see?" (the card stays short on every page).
  await expect(card.getByText('They can\'t read your chats or your Builder messages')).toBeHidden();
  await card.locator('summary', { hasText: 'What can they see?' }).click();
  await expect(card.getByText('They can\'t read your chats or your Builder messages')).toBeVisible();
  await expect(card).not.toContainText(mumName);
  expect(await page.content()).not.toMatch(/switch back|href="\/family|href="\/grown-ups/i);
  // Plays a game.
  const slug = (await page.locator('a[href^="/g/"]').first().getAttribute('href')).replace('/g/', '');
  await page.goto(`/play/${slug}`);
  await gameFrame(page);
  // Builds one (the mock Builder: no AI key on this server).
  await page.setViewportSize({ width: 1280, height: 860 });
  const game = await templateGame(page);
  const sent = await page.request.post(`/api/studio/${game.id}/chat`, { data: { text: 'make it blue', detach: true } });
  expect(sent.status()).toBe(202);
  await expect.poll(async () => (await studioState(page, game.id)).busy, { timeout: 30_000 }).toBe(false);
  expect((await studioState(page, game.id)).game.title).toBe(game.title);
  // The card's OK in this Switch sign-in (the grown-up may still hold the device): hidden for this sign-in only.
  await page.goto('/');
  await Promise.all([page.waitForLoadState('load'), page.locator('.madecard button[type=submit]').click()]);
  await expect(page.locator('.madecard')).toHaveCount(0);
  await page.goto('/me');
  await expect(page.locator('#grownups')).toContainText('made this account and is linked to it');
  await expect(page.locator('.madecard')).toHaveCount(0);
  // Signs out (Me › Sign out), like any kid.
  await Promise.all([page.waitForURL(u => u.pathname === '/'), page.locator('#signout form[data-api="/api/auth/logout"] button').click()]);
  // The child signs in themselves: the card is back, until they answer it here.
  await page.goto('/login');
  await page.fill('#username', kidName); await page.fill('#password', KID_PW);
  await Promise.all([page.waitForURL(u => u.pathname === '/'), page.click('form[data-api="/api/auth/login"] button[type=submit]')]);
  await expect(page.locator('.madecard')).toContainText('A grown-up made this account for you.');
  await Promise.all([page.waitForLoadState('load'), page.locator('.madecard button[type=submit]').click()]);
  await expect(page.locator('.madecard')).toHaveCount(0);
  await page.goto('/me');
  await expect(page.locator('.madecard')).toHaveCount(0);
  await Promise.all([page.waitForURL(u => u.pathname === '/'), page.locator('#signout form[data-api="/api/auth/logout"] button').click()]);
  // The grown-up comes back with their own password, on the grown-up sign-in.
  await page.goto('/grown-ups/login');
  await page.fill('#username', mumName); await page.fill('#password', PW);
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
  await expect(page.locator('.famkid-made', { hasText: kidName })).toBeVisible();
  await expect(page.locator('.famkid-made', { hasText: kidName })).toContainText('Family extra messages yesterday');
});

test('the way back from a child\'s session: the grown-up sign-in asks to sign the child out first, then signs the grown-up in', async ({ browser }) => {
  const page = await person(browser);
  const mumName = await grownupSignup(page);
  const { row } = await makeChild(page);
  await switchTo(page, row);
  await page.goto('/grown-ups/login');
  await Promise.all([page.waitForURL(/\/grown-ups\/login/), page.locator('form[data-api="/api/auth/logout"] button').click()]);
  await page.fill('#username', mumName); await page.fill('#password', PW);
  await Promise.all([page.waitForURL(/\/family$/), page.click('button[type=submit]')]);
});

test('"What we keep" shows counts only; Delete needs the name typed', async ({ browser }) => {
  const page = await person(browser);
  await grownupSignup(page);
  const { kidName } = await makeChild(page);
  await page.goto('/family');
  await Promise.all([page.waitForURL(/\/data$/), page.locator('.famkid-made', { hasText: kidName }).locator('a', { hasText: 'What we keep' }).click()]);
  // The step-up from making the account is still fresh: straight to the counts. (A stale one asks first: unit tests.)
  await expect(page.locator('h1')).toContainText(`What we keep for ${kidName}`);
  await expect(page.locator('.keptlist')).toContainText('Games made: 0 (0 public)');
  await expect(page.locator('.keptlist')).toContainText('Notice you read');
  await page.fill('#del-name', 'not-the-name');
  await page.click('#delete button[type=submit]');
  await expect(page.locator('#del-name-err')).toContainText('Type the account');
  await page.fill('#del-name', kidName);
  await Promise.all([page.waitForURL(/\/family$/), page.click('#delete button[type=submit]')]);
  await expect(page.locator('.toast')).toContainText(`${kidName}'s account was deleted.`);
  await expect(page.locator('.famkid', { hasText: kidName })).toHaveCount(0);
});

test('kid crawl after a switch: no prices, plan names or grown-up pages; the six kid tabs; grown-up pages and APIs are 404', async ({ browser }) => {
  const page = await person(browser);
  await grownupSignup(page);
  const { row } = await makeChild(page);
  await switchTo(page, row);
  const slug = (await page.locator('a[href^="/g/"]').first().getAttribute('href')).replace('/g/', '');
  const PRICE = /\$\s?\d|\d\s?\$|US\$|USD|€|£|7[.,]99|69[.,]00/;
  const problems = [];
  for (const p of ['/', '/me', '/build', '/friends', `/g/${slug}`, '/privacy', '/safety']) {
    await page.goto(p);
    const text = await page.locator('body').innerText(), html = await page.content();
    if (PRICE.test(text)) problems.push(`${p}: a price`);
    if (/\b(Basic|Family|School) plan\b|days? left|ends in \d/i.test(text)) problems.push(`${p}: a plan name or countdown (${text.match(/\b(Basic|Family|School) plan\b|days? left|ends in \d/i)[0]})`);
    if (/href="\/(grown-ups|family)(\/|"|\?)/.test(html)) problems.push(`${p}: links to a grown-up page`);
    expect(await tabsOf(page), p).toEqual(TABS);
  }
  expect(problems).toEqual([]);
  // The made section of /privacy is there for the child too (no plan names in it).
  await page.goto('/privacy');
  await expect(page.locator('#made')).toContainText('A parent or legal guardian with a grown-up account can make');
  for (const p of ['/family', '/family/account', '/family/children/new']) expect((await page.request.get(p, { maxRedirects: 0 })).status(), p).toBe(404);
  expect((await page.request.get('/api/billing/status')).status()).toBe(404);
  for (const p of ['/api/family/children/new', '/api/family/reauth', '/api/billing/portal']) expect((await page.request.post(p, { data: { password: PW } })).status(), p).toBe(404);
});

const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
  { width: 360, height: 780, scheme: 'dark', lang: 'ar' }, { width: 360, height: 780, scheme: 'light', lang: 'de' },
];
const RTL = new Set(['he', 'ar']);
/** The longest name a child can have (16 characters): the row's buttons carry it ("Change WombatWhimsyMWWx's password"). */
const LONG_NAME = 'WombatWhimsyMWWx';
test('the new pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he, ar, de; a 16-character child name)', async ({ browser }) => {
  const mum = await person(browser);
  const mumName = await grownupSignup(mum);
  const { token } = await makeChild(mum, LONG_NAME);
  const mumState = await mum.context().storageState();
  // A second device for the child's side: the grown-up signs in there and switches (that signs them out there only).
  const other = await person(browser);
  await other.goto('/grown-ups/login');
  await other.fill('#username', mumName); await other.fill('#password', PW);
  await Promise.all([other.waitForURL(/\/family$/), other.click('button[type=submit]')]);
  await switchTo(other, other.locator('.famkid-made').first());
  const kidState = await other.context().storageState();
  const sets = [
    [mumState, ['/family', `/family?made=${token}`, '/family/children/new', `/family/children/${token}/data`, '/privacy#made', '/parents#made']],
    [kidState, ['/', '/me#grownups']],
  ];
  const problems = [];
  for (const v of VIEWS) {
    for (const [state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: APP, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
      const page = await ctx.newPage();
      for (const p of paths) {
        const [base, hash] = p.split('#');
        await page.goto(v.lang ? `${base}${base.includes('?') ? '&' : '?'}lang=${v.lang}` : base);
        if (RTL.has(v.lang)) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        // The folded tools and sections: checked open.
        await page.evaluate(() => { for (const d of document.querySelectorAll('details.famkid-act, details.famleave, details.lp-fold')) d.open = true; });
        if (hash) await expect(page.locator(`#${hash}`)).toBeVisible();
        for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
        if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${p.replace(/[^a-z]+/gi, '_')}${state === kidState ? '_kid' : ''}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`), fullPage: true }); }
        // Every language has the made texts now: on a right-to-left page they read right to left, nothing in the page is
        // marked as English (the fallback, lang="en" dir="ltr", is covered in tests/unit/family-made.test.js with withoutKeys).
        if (RTL.has(v.lang) && p === '/family/children/new') {
          await expect(page.locator('h1')).not.toHaveAttribute('dir', /./);
          await expect(page.locator('h1')).not.toHaveText(/Make your child/);
          await expect(page.locator('#main [lang="en"]')).toHaveCount(0);
        }
      }
      await ctx.close();
    }
  }
  expect([...new Set(problems)]).toEqual([]);
});
