// "Add your kids" (/family/add, routes/family.js) end to end, on two servers of its own (families on against the fake
// Stripe): ON with PARENT_MADE_CHILDREN=1 (app E2E_PORT + 11, fake Stripe + 12) and OFF without it (app + 13, fake
// Stripe + 14). Both have FAMILY_MAX_CHILDREN=2.
//   - sign-up lands on the step; the two choices sit side by side (phone and desktop); Make inline (notice and both
//     boxes), back to the step with the child's name; Link inline with the child's code; Add another / Done;
//   - "I'll do this later" goes to /family and nothing sends the grown-up back;
//   - back from Checkout (the plan on) lands on the step, which says thank you;
//   - the most children: no choices, Done;
//   - flag off: nothing about making an account, the code form open straight away;
//   - 360 / 1280, light / dark, he / de / ru (tiles start-aligned, titles at most 4 lines): nothing touches, no sideways scroll. ADD_SHOTS=<folder> keeps screenshots.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ownIp, ADMIN } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PW = 'a-long-password-1', KID_PW = 'rainbow-77';
const SHOTS = process.env.ADD_SHOTS || '';
const SERVERS = { on: { port: E2E + 11, stripe: E2E + 12, made: '1' }, off: { port: E2E + 13, stripe: E2E + 14, made: '' } };
const urlOf = which => `http://localhost:${SERVERS[which].port}`;
const env = (s, data) => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(s.port), BRB_DATA_DIR: data, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com', FAMILY_MAX_CHILDREN: '2',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_add', STRIPE_API_BASE: `http://127.0.0.1:${s.stripe}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '',
  STRIPE_PMC_FAMILY: 'pmc_fakefamily', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '', PARENT_MADE_CHILDREN: s.made,
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };
const procs = [], dirs = [];

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  for (const [which, s] of Object.entries(SERVERS)) {
    const data = fs.mkdtempSync(path.join(os.tmpdir(), `brb-add-${which}-`)); dirs.push(data);
    const stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(s.stripe), '--secret', 'whsec_fake_add', '--webhook', `${urlOf(which)}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
    procs.push(stripe);
    await up(`http://127.0.0.1:${s.stripe}/v1/tax/settings`);
    execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(s, data), stdio: 'ignore' });
    const app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(s, data), stdio: 'ignore' });
    procs.push(app);
    await up(`${urlOf(which)}/health`);
  }
});
test.afterAll(async () => {
  for (const p of procs) await stop(p);
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

const PHONE = { width: 360, height: 780 }, DESKTOP = { width: 1280, height: 900 };
async function person(browser, which, opts = {}) { const ctx = await browser.newContext({ baseURL: urlOf(which), viewport: PHONE, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
/** A new grown-up through the real sign-up: lands on "Add your kids". */
async function grownupSignup(page, name = uniq('Mum')) {
  await page.goto('/grown-ups/signup');
  await page.fill('#username', name); await page.fill('#password', PW); await page.fill('#confirm', PW);
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button[type=submit]')]);
  await expect(page.locator('main h1')).toHaveText('Add your kids');
  return name;
}
/** A kid account with its family code from Me › For grown-ups. -> { kid, username, code } */
async function kidWithCode(browser, which) {
  const kid = await person(browser, which); const { username } = await signup(kid, uniq('Kid'));
  await kid.goto('/me'); await kid.locator('#grownups [data-family-code]').click();
  await expect(kid.locator('#famcode-value')).toHaveText(/^[A-HJKMNP-Z2-9]{3}-[A-HJKMNP-Z2-9]{4}$/);
  return { kid, username, code: (await kid.locator('#famcode-value').textContent()).trim() };
}
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true }); } };
/** Make the child's account inline on the step (the step-up password only when asked). */
async function makeOnStep(page, kidName) {
  await Promise.all([page.waitForURL(/how=make/), page.locator('.addkids-choice', { hasText: "Make my child's account" }).click()]);
  await expect(page.locator('.addkids-choice[aria-current="true"]')).toContainText("Make my child's account");
  const form = page.locator('#addkids-how form');
  await expect(form.locator('.made-notice')).toBeVisible();
  await expect(form.locator('.made-noconsent')).toContainText('is not a parental consent check');
  await page.fill('#made-name', kidName); await page.fill('#made-pw', KID_PW); await page.fill('#made-confirm', KID_PW);
  if (await page.locator('#pw-made').isVisible()) await page.fill('#pw-made', PW);
  await page.check('#made-ack'); await page.check('#made-guardian');
  await Promise.all([page.waitForURL(/\/family\/add\?made=[^&#]+$/), form.locator('button[type=submit]').click()]);
}

test('flag on: sign-up lands on the step; two choices side by side; make one inline, link another, then Done', async ({ browser }) => {
  for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const mum = await person(browser, 'on', { viewport });
    await grownupSignup(mum);
    await expect(mum.locator('main .notice.good')).toContainText('Your grown-up account is ready.');
    const tiles = mum.locator('.addkids-choice');
    await expect(tiles).toHaveCount(2);
    const [a, b] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()];
    expect(Math.abs(a.y - b.y), `${label}: side by side`).toBeLessThan(2);
    expect(a.x + a.width, `${label}: not overlapping`).toBeLessThanOrEqual(b.x);
    await expect(mum.locator('main form')).toHaveCount(0);
    await expect(mum.locator('main a', { hasText: "I'll do this later" })).toHaveAttribute('href', '/family');
    await shot(mum, `step-on-${label}`);
    if (label === 'desktop') { await mum.context().close(); continue; }
    // Make: the inline form, then back on the step with the child's name and "Add another".
    const kidName = uniq('Kid');
    await makeOnStep(mum, kidName);
    await shot(mum, `step-on-${label}-made-form`);
    await expect(mum.locator('.addkids-added')).toContainText(kidName);
    await expect(mum.locator('#addkids-pick-h')).toHaveText('Add another child');
    // The ?made= handoff: ready, Switch to <name> (open on /family) and Done both go to /family?made=….
    const madeQ = new URL(mum.url()).search;
    await expect(mum.locator('main .famkid-ready')).toContainText(`${kidName} can sign in`);
    await expect(mum.locator('.addkids-leave a', { hasText: `Switch to ${kidName}` })).toHaveAttribute('href', `/family${madeQ}#made-switch`);
    await expect(mum.locator('.addkids-leave a', { hasText: 'Done' })).toHaveAttribute('href', `/family${madeQ}`);
    await shot(mum, `step-on-${label}-after-one`);
    // Link: the code form inline; the request waits for the child's yes.
    const { kid, username } = await kidWithCode(browser, 'on');
    const code = (await kid.locator('#famcode-value').textContent()).trim();
    await Promise.all([mum.waitForURL(/how=link/), mum.locator('.addkids-choice', { hasText: "Link my child's existing account" }).click()]);
    await mum.fill('#code', code);
    await Promise.all([mum.waitForURL(/\/family\/add$/), mum.locator('#addkids-how button[type=submit]').click()]);
    await expect(mum.locator('.addkids-added')).toContainText('Waiting for your child to say yes');
    await kid.goto('/me');
    await Promise.all([kid.waitForLoadState('load'), kid.locator('#grownups button', { hasText: 'Yes' }).click()]);
    await expect(kid.locator('#grownups')).toContainText('Linked to your grown-up');
    await mum.reload();
    await expect(mum.locator('.addkids-added li')).toHaveCount(2);
    await expect(mum.locator('.addkids-added')).toContainText(username);
    await expect(mum.locator('.addkids-added')).not.toContainText(`@${username}`);
    // FAMILY_MAX_CHILDREN=2: full, no choices, Done.
    await expect(mum.locator('main')).toContainText('You have linked 2 children, the most for one family.');
    await expect(mum.locator('.addkids-choice')).toHaveCount(0);
    await expect(mum.locator('main form')).toHaveCount(0);
    await shot(mum, `step-on-${label}-full`);
    await Promise.all([mum.waitForURL(/\/family$/), mum.locator('main a', { hasText: 'Done' }).click()]);
    await expect(mum.locator('.famkid')).toHaveCount(2);
    await expect(mum.locator('#kids-h ~ a[href="/family/add"]')).toHaveCount(0, { timeout: 1000 });
    await mum.context().close();
  }
});

test('skip: "I\'ll do this later" goes to /family, which stays /family; the Children panel opens the step again', async ({ browser }) => {
  const mum = await person(browser, 'on');
  await grownupSignup(mum);
  await Promise.all([mum.waitForURL(/\/family$/), mum.locator('main a', { hasText: "I'll do this later" }).click()]);
  await expect(mum.locator('main h1')).toContainText('Your family');
  await mum.reload();
  await expect(mum).toHaveURL(/\/family$/);
  await Promise.all([mum.waitForURL(/\/family\/add$/), mum.locator('main a[href="/family/add"]', { hasText: 'Add a child' }).click()]);
  await expect(mum.locator('.addkids-choice')).toHaveCount(2);
  await expect(mum.locator('main .notice.good')).toHaveCount(0);
});

test('back from Checkout: paying lands on the step, which says thank you; nothing about money on it', async ({ browser }) => {
  const mum = await person(browser, 'on');
  const mumName = await grownupSignup(mum);
  const admin = await person(browser, 'on'); await login(admin, ADMIN.username, ADMIN.password);
  await admin.goto(`/admin?tab=users&username=${mumName}`);
  await Promise.all([admin.waitForResponse(r => r.url().includes('/billing-tester') && r.ok()), admin.locator('[data-act="tester"]').click()]);
  await mum.goto('/family?plan=family&interval=month');
  const form = mum.locator('#checkout');
  await mum.fill('#pw-checkout', PW);
  await Promise.all([mum.waitForURL(/\/family\/add\?from=checkout$/, { timeout: 30_000 }), form.locator('button[value="month"]').click()]);
  await expect(mum.locator('main .notice.good')).toContainText('Your Family plan is on. Thank you!');
  await expect(mum.locator('.addkids-choice')).toHaveCount(2);
  await expect(mum.locator('main')).not.toContainText('$');
  await shot(mum, 'step-on-phone-after-checkout');
});

test('flag off: nothing about making an account; the code form is open straight away and links a child', async ({ browser }) => {
  for (const [label, viewport] of [['phone', PHONE], ['desktop', DESKTOP]]) {
    const mum = await person(browser, 'off', { viewport });
    await grownupSignup(mum);
    await expect(mum.locator('main')).toContainText("Link your child's Oomba Academy account to yours.");
    await expect(mum.locator('.addkids-choice')).toHaveCount(0);
    await expect(mum.locator('main')).not.toContainText(/Make my child|Make their account|parental consent/);
    await expect(mum.locator('#addkids-how-h')).toHaveText("Link my child's existing account");
    await expect(mum.locator('#code')).toBeVisible();
    expect((await mum.request.get('/family/add?how=make')).ok()).toBe(true);
    await shot(mum, `step-off-${label}`);
    if (label === 'phone') {
      const { kid, code } = await kidWithCode(browser, 'off');
      await mum.fill('#code', code);
      await Promise.all([mum.waitForURL(/\/family\/add$/), mum.locator('#addkids-how button[type=submit]').click()]);
      await expect(mum.locator('.addkids-added')).toContainText('Waiting for your child to say yes');
      await expect(mum.locator('#addkids-how-h')).toHaveText('Add another child');
      await expect(mum.locator('main a.btn-primary', { hasText: 'Done' })).toBeVisible();
      await shot(mum, `step-off-${label}-after-one`);
      await kid.context().close();
    }
    await mum.context().close();
  }
});

test('the step at 360 and 1280, light and dark, and right to left: nothing touches, no sideways scroll', async ({ browser }) => {
  const VIEWS = [{ ...PHONE, scheme: 'light' }, { ...PHONE, scheme: 'dark' }, { ...DESKTOP, scheme: 'light' }, ...['he', 'de', 'ru'].map(lang => ({ ...PHONE, scheme: 'light', lang }))];
  const problems = [];
  for (const which of ['on', 'off']) {
    const mum = await person(browser, which); await grownupSignup(mum);
    const state = await mum.context().storageState(); await mum.context().close();
    const paths = which === 'on' ? ['/family/add?from=signup', '/family/add?how=make', '/family/add?how=link'] : ['/family/add?from=signup'];
    for (const v of VIEWS) {
      const ctx = await browser.newContext({ baseURL: urlOf(which), viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
      const page = await ctx.newPage();
      for (const p of paths) {
        await page.goto(v.lang ? `${p}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', v.lang === 'he' ? 'rtl' : 'ltr');
        // On a phone the tiles stack emoji over text, start-aligned, with their own (smaller) padding: not .door's.
        if (v.width === PHONE.width && which === 'on') {
          for (const st of await page.locator('.addkids-choice').evaluateAll(els => els.map(e => { const c = getComputedStyle(e); return [c.flexDirection, c.alignItems, c.minHeight, c.paddingInlineStart]; }))) {
            if (st.join() !== 'column,flex-start,0px,12px') problems.push(`tile not start-aligned with its own padding ${p} ${v.lang || ''}: ${st.join()}`);
          }
          const tall = await page.locator('.addkids-choice .door-h').evaluateAll(els => els.map(e => Math.round(e.getBoundingClientRect().height / parseFloat(getComputedStyle(e).lineHeight))));
          for (const lines of tall) if (lines > 4) problems.push(`tile title wraps to ${lines} lines ${p} ${v.lang || ''}`);
        }
        for (const t of await findTouching(page)) problems.push(`${which} ${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${which} ${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
        if (v.lang) await expect(page.locator('#main [lang="en"]')).toHaveCount(0);
        if (v.scheme === 'dark' || v.lang) await shot(page, `step-${which}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}-${p.replace(/[^a-z]+/gi, '_')}`);
      }
      await ctx.close();
    }
  }
  expect([...new Set(problems)]).toEqual([]);
});
