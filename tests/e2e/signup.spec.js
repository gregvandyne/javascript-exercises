// One sign-up end to end (docs/decisions.md "One sign-up", server/routes/onboarding.js), on a server of its own with
// families on (the fake Stripe on E2E_PORT + 32), Sign in with Google (the run's fake Google on E2E_PORT + 1) and Google
// Classroom on (app on E2E_PORT + 31):
//   - a teacher creates their school (its admin at once), adds two classes, sees "Connect Google Classroom?" and skips;
//   - another teacher joins that school (an invite from its admin, accepted on the step), then adds a class;
//   - a kid signs up with a name and a password, then joins the first teacher's class with its code;
//   - a parent signs up with a password, another with Google; both land on "Add your kids";
//   - every step at 390px and 1280px: nothing wider than the screen (also at 360px, dark, right to left).
// SIGNUP_SHOTS=<folder> keeps a screenshot of every step at both widths.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ownIp, uniq, ADMIN } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = E2E + 31, STRIPE = E2E + 32, GOOGLE = `http://127.0.0.1:${E2E + 1}`;
const URL0 = `http://localhost:${APP}`;
const SHOTS = process.env.SIGNUP_SHOTS || '';
const PW = 'a-long-password-1';
const env = data => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(APP), BRB_DATA_DIR: data, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', LANDING_AT_ROOT: '0',
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_signup', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '',
  STRIPE_PMC_FAMILY: 'pmc_fakefamily', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '', PARENT_MADE_CHILDREN: '',
  GOOGLE_CLIENT_ID: 'test-client.apps.googleusercontent.com', GOOGLE_CLIENT_SECRET: 'fake-test-secret', GOOGLE_OIDC_BASE: GOOGLE,
  GOOGLE_CLASSROOM: '1', GOOGLE_TOKEN_KEY: 'c'.repeat(64),
});
async function up(url) {
  const t0 = Date.now();
  for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); }
}
const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };
const procs = []; let data = '';

test.describe.configure({ mode: 'serial', timeout: 240_000 });
test.beforeAll(async () => {
  test.setTimeout(180_000);
  data = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-signup-'));
  procs.push(spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE), '--secret', 'whsec_fake_signup', '--webhook', `${URL0}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' }));
  await up(`http://127.0.0.1:${STRIPE}/v1/tax/settings`);
  execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(data), stdio: 'ignore' });
  procs.push(spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(data), stdio: 'ignore' }));
  await up(`${URL0}/health`);
});
test.afterAll(async () => { for (const p of procs) await stop(p); if (data) fs.rmSync(data, { recursive: true, force: true }); });

const PHONE = { width: 390, height: 844 }, DESKTOP = { width: 1280, height: 900 };
async function person(browser, opts = {}) { const ctx = await browser.newContext({ baseURL: URL0, viewport: PHONE, ...opts }); const page = await ctx.newPage(); await ownIp(page); return page; }
/** The screen fits (no sideways scroll, nothing touching) at 390px and 1280px; a screenshot of each with SIGNUP_SHOTS. */
async function check(page, name) {
  for (const [w, vp] of [['390', PHONE], ['1280', DESKTOP]]) {
    await page.setViewportSize(vp);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(wide, `${name} at ${w}px: no sideways scroll`).toBeLessThanOrEqual(0);
    expect(await findTouching(page), `${name} at ${w}px`).toEqual([]);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}-${w}.png`), fullPage: true }); }
  }
  await page.setViewportSize(PHONE);
}
let classCode = '', schoolId = '', firstTeacher = '';

test('a teacher: account, create the school (its admin), two classes, "Connect Google Classroom?", skip, My classes', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/signup');
  await check(page, '01-who');
  await Promise.all([page.waitForURL(/\/signup\/teacher$/), page.click('a.door-teacher')]);
  await expect(page.locator('.ob-count')).toHaveText('Step 1 of 4');
  await check(page, '10-teacher-account');
  firstTeacher = uniq('Tch').slice(0, 16);
  await page.fill('#username', firstTeacher);
  await page.fill('#password', PW); await page.fill('#confirm', PW);
  // The box first: without it, the form says so.
  await page.click('button.btn-primary[type=submit]');
  await expect(page.locator('#adult-err')).toContainText('18 or older');
  await page.check('#adult');
  await Promise.all([page.waitForURL(/\/signup\/teacher\/school$/), page.click('button.btn-primary[type=submit]')]);
  await expect(page.locator('h1')).toHaveText('Your school');
  await check(page, '11-teacher-school');
  await Promise.all([page.waitForURL(/how=create/), page.click('a.ob-create')]);
  await check(page, '12-teacher-create');
  await page.fill('#ob-school', 'Maple Grove Elementary'); await page.fill('#ob-name', 'Ms Rivera'); await page.fill('#ob-email', 'rivera@maple.example');
  await Promise.all([page.waitForURL(/\/signup\/teacher\/classes$/), page.click('button[type=submit]')]);
  await expect(page.locator('.ob-count')).toHaveText('Step 3 of 4');
  // Name and grade are both needed.
  await page.fill('#ob-cn-0', '4B');
  await page.click('form[data-api="/api/onboarding/classes"] button[type=submit]');
  await expect(page.locator('#ob-cg-0-err')).toContainText('Pick a grade');
  await page.selectOption('#ob-cg-0', '4');
  await page.click('[data-ob-add]');
  await expect(page.locator('[data-ob-class]')).toHaveCount(2);
  await expect(page.locator('#ob-cn-1')).toBeFocused();
  await page.fill('#ob-cn-1', 'Room 12'); await page.selectOption('#ob-cg-1', 'K');
  await check(page, '13-teacher-classes');
  await Promise.all([page.waitForURL(/\/signup\/teacher\/classroom$/), page.click('form[data-api="/api/onboarding/classes"] button[type=submit]')]);
  await expect(page.locator('h1')).toHaveText('Connect Google Classroom?');
  await expect(page.locator('.ob-count')).toHaveText('Step 4 of 4');
  await expect(page.locator('form[data-api="/api/google-classroom/connect"] button')).toBeVisible();
  await check(page, '14-teacher-classroom');
  await Promise.all([page.waitForURL(/\/teach\?welcome=school$/), page.click('#ob-skip')]);
  await expect(page.locator('#school-ready')).toContainText('Maple Grove Elementary is ready');
  await expect(page.locator('main')).toContainText('4B');
  // The class code, for the kid below; the school, for the second teacher.
  const r = await page.request.get('/api/me'); const me = (await r.json()).user;
  expect(me.username).toBe(firstTeacher);
  const teach = await (await page.request.get('/teach?all=1')).text();
  const classId = (/href="\/class\/([^"/?#]+)/.exec(teach) || [])[1];
  await page.goto(`/class/${classId}?tab=students`);
  classCode = ((await page.locator('.jc-code').first().textContent()) || '').trim();
  expect(classCode).toMatch(/^[A-Z0-9]{6}$/);
  await page.goto('/school');
  const people = await (await page.request.get(`${new URL(page.url()).pathname}?tab=people`)).text();
  schoolId = (/data-api="\/api\/schools\/([^/"]+)\/staff"/.exec(people) || [])[1] || '';
  expect(schoolId).not.toBe('');
  await page.context().close();
});

test('another teacher joins the school: the step shows their username; the admin invites it; accept; then a class', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/signup/teacher');
  const name = uniq('Join').slice(0, 16);
  await page.check('#adult'); await page.fill('#username', name); await page.fill('#password', PW); await page.fill('#confirm', PW);
  await Promise.all([page.waitForURL(/\/signup\/teacher\/school$/), page.click('button.btn-primary[type=submit]')]);
  await Promise.all([page.waitForURL(/how=join/), page.click('a.ob-join')]);
  await expect(page.locator('.ob-username bdi')).toHaveText(name);
  await check(page, '15-teacher-join');
  // The school's admin (the first teacher) invites that username from the People tab's API.
  const admin = await person(browser);
  await admin.goto('/login'); await admin.fill('#username', firstTeacher); await admin.fill('#password', PW);
  await Promise.all([admin.waitForURL(u => !u.pathname.startsWith('/login')), admin.click('form[data-api="/api/auth/login"] button[type=submit]')]);
  const inv = await admin.request.post(`/api/schools/${schoolId}/staff`, { data: { account: 'existing', username: name, role: 'teacher', rosterName: 'Mr Lee' } });
  expect(inv.ok(), await inv.text()).toBeTruthy();
  await admin.context().close();
  await Promise.all([page.waitForLoadState('load'), page.click('a.btn:has-text("Check again")')]);
  await expect(page.locator('.ob-invite')).toContainText('Maple Grove Elementary wants to add you as Teacher');
  await check(page, '16-teacher-invite');
  await Promise.all([page.waitForURL(/\/signup\/teacher\/classes$/), page.click('.ob-invite button[type=submit]')]);
  await page.fill('#ob-cn-0', '5C'); await page.selectOption('#ob-cg-0', '5');
  await Promise.all([page.waitForURL(/\/signup\/teacher\/classroom$/), page.click('form[data-api="/api/onboarding/classes"] button[type=submit]')]);
  await Promise.all([page.waitForURL(/\/teach$/), page.click('#ob-skip')]);
  await page.context().close();
});

test('a kid: a fun name and a password (no email, no Google), then the class code', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/signup');
  await Promise.all([page.waitForURL(/\/signup\/kid$/), page.click('a.door-kid')]);
  await expect(page.locator('.gbtn, input[type=email]')).toHaveCount(0);
  await check(page, '20-kid-account');
  await page.fill('#username', uniq('Kid').slice(0, 16)); await page.fill('#password', 'rainbow-77');
  await Promise.all([page.waitForURL(/\/signup\/kid\/code$/), page.click('button[type=submit]')]);
  await expect(page.locator('h1')).toHaveText('Got a class code?');
  await check(page, '21-kid-code');
  // The family code for a grown-up: shown once.
  await page.click('[data-family-code]');
  await expect(page.locator('#famcode-value')).toHaveText(/^[A-Z0-9]{3}-[A-Z0-9]{4}$/);
  await check(page, '22-kid-family-code');
  await page.fill('#ob-code', classCode);
  await Promise.all([page.waitForURL(/\/classes\?sent=1/), page.click('form[data-api="/api/classes/join"] button[type=submit]')]);
  await page.context().close();
});

test('a parent with a password, and one with Google: both land on "Add your kids"', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/signup');
  await Promise.all([page.waitForURL(/\/signup\/parent$/), page.click('a.door-grownup')]);
  await check(page, '30-parent-account');
  await page.check('#adult'); await page.fill('#username', uniq('Mum').slice(0, 16)); await page.fill('#password', PW); await page.fill('#confirm', PW);
  await Promise.all([page.waitForURL(/\/family\/add\?from=signup$/), page.click('button.btn-primary[type=submit]')]);
  await expect(page.locator('.ob-count')).toHaveText('Step 2 of 2');
  if (SHOTS) for (const [w, vp] of [['390', PHONE], ['1280', DESKTOP]]) { await page.setViewportSize(vp); await page.screenshot({ path: path.join(SHOTS, `31-parent-add-kids-${w}.png`), fullPage: true }); }
  await page.context().close();

  const g = await person(browser);
  await g.goto('/signup/parent');
  await g.click('button.gbtn');
  await expect(g.locator('#adult-err')).toContainText('18 or older');
  await g.check('#adult');
  await Promise.all([g.waitForURL(/Fake%20Google|o\/oauth2\/v2\/auth/), g.click('button.gbtn')]);
  await expect(g.locator('h1')).toHaveText('Fake Google: choose an account');
  await g.fill('input[name=email]', `${uniq('dad').toLowerCase()}@gmail.com`);
  await Promise.all([g.waitForURL(new RegExp(`^${URL0}/family/add\\?from=signup$`)), g.click('button:has-text("Continue")')]);
  await expect(g.locator('.ob-count')).toHaveText('Step 2 of 2');
  await g.goto('/family/account');
  await expect(g.locator('#google')).toContainText('@gmail.com');
  await g.context().close();
});

test('sign-in is one page: Google, or a username and password; "Forgot your password?" folds away', async ({ browser }) => {
  const page = await person(browser);
  await page.goto('/login');
  await expect(page.locator('.gbtn')).toBeVisible();
  await expect(page.locator('#forgot')).not.toHaveAttribute('open', '');
  await check(page, '40-login');
  await page.close();
});

test('the steps on a 360px phone, dark and right to left (Hebrew, Arabic): nothing sideways, nothing touching', async ({ browser }) => {
  for (const [lang, scheme] of [['he', 'dark'], ['ar', 'light'], ['de', 'dark']]) {
    const page = await person(browser, { viewport: { width: 360, height: 780 }, colorScheme: scheme });
    for (const p of ['/signup', '/signup/kid', '/signup/parent', '/signup/teacher', '/login']) {
      await page.goto(`${p}?lang=${lang}`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(wide, `${lang} ${p}`).toBeLessThanOrEqual(0);
      expect(await findTouching(page), `${lang} ${p}`).toEqual([]);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `50-${lang}-${scheme}-${p.replace(/\//g, '_')}-360.png`), fullPage: true });
    }
    await page.context().close();
  }
});
