// School plans (paid plans, chunk 5), end to end against the fake Stripe (tests/support/fake-stripe.js): their own
// server with billing on (E2E_PORT + 7, default 4317) and the fake Stripe (E2E_PORT + 6), whose hosted Checkout page
// sends signed webhooks back to the server.
//   - card: the demo school's admin pays by card for 25 students → webhook → the student's Studio counter shows only
//     "left today" → more students (billed at once, the pool grows);
//   - invoice: another school's admin asks for an invoice → /admin/billing → Create invoice subscription → the plan is
//     on → Mark paid by check; an overdue invoice shows on the tab;
//   - the Billing tab and /admin/billing at 360 px and 1280 px, light and dark, and right to left (he).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { signup, login, uniq, ownIp, ADMIN, templateGame } from './helpers.js';
import { findTouching } from './touching.js';

const E2E = +(process.env.E2E_PORT || 4310);
const PORT = E2E + 7, STRIPE_PORT = E2E + 6;
const APP = `http://localhost:${PORT}`, STRIPE = `http://127.0.0.1:${STRIPE_PORT}`;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DEMO_PW = 'demo-pass-123', DEMO_SLUG = 'magic-cups-demo-school';
let DATA = null, app = null, stripe = null;
const env = () => ({
  PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
  DEMO_TEACHER_PASSWORD: DEMO_PW, ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', BRB_MOCK_DELAY_MS: '0',
  CONTACT_EMAIL: 'help@example.com', BUILDER_DAILY_TURNS: '2', SCHOOL_TURNS_PER_SEAT: '4', SCHOOL_DAILY_CAP_DEFAULT: '3',
  // The demo school's teacher is also its school admin here.
  BOOTSTRAP_SCHOOLS: JSON.stringify([{ name: 'Oomba Academy Demo School', admin: 'DemoTeacher' }]),
  STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_e2e_school', STRIPE_API_BASE: STRIPE, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '',
  STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', STRIPE_PMC_SCHOOL: 'pmc_fakeschool', TERMS_PUBLISHED: '', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
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
  DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-sbill-'));
  stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_e2e_school', '--webhook', `${APP}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
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
/** The admin marks an account as a billing tester on /admin (D14: test mode; school staff can be testers now). */
async function makeTester(browser, name) {
  const a = await admin(browser);
  await a.goto(`/admin?tab=users&username=${name}`);
  await Promise.all([a.waitForResponse(r => r.url().includes('/billing-tester') && r.ok()), a.locator('[data-act="tester"]').click()]);
  await a.reload();
  await expect(a.locator('main')).toContainText('may check out while the Stripe key is a test key');
}
/** A second school (made by the platform admin) whose admin is a new own account. -> { page, slug, name, adminName } */
async function invoiceSchool(browser) {
  const a = await admin(browser);
  const name = `${uniq('Bay')} School`;
  const made = await a.request.post('/api/admin/schools', { data: { name } });
  const slug = (await made.json()).redirect.match(/\/school\/([^?]+)/)[1];
  const html = await (await a.request.get(`/school/${slug}?tab=people`)).text();
  const id = html.match(/\/api\/schools\/([A-Za-z0-9]+)\/staff/)[1];
  const page = await person(browser);
  const { username: adminName } = await signup(page, uniq('Bursar'), 'bursar-pass-123');
  const add = await a.request.post(`/api/schools/${id}/staff`, { data: { account: 'existing', username: adminName, rosterName: 'Pat Bursar', role: 'admin' } });
  expect(add.ok()).toBe(true);
  await makeTester(browser, adminName);
  return { page, slug, name, adminName, password: 'bursar-pass-123' };
}

test('card: the school admin pays for 25 students; students see only "left today"; more students are billed and grow the pool', async ({ browser }) => {
  const boss = await person(browser); await login(boss, 'DemoTeacher', DEMO_PW);
  // Not a billing tester yet (test mode): the tab is there, but nothing to pay with.
  await boss.goto(`/school/${DEMO_SLUG}?tab=billing`);
  await expect(boss.locator('#plan')).toContainText('No school plan');
  await expect(boss.locator('#plan')).toContainText("School plans aren't on sale yet");
  await expect(boss.locator('#pay')).toHaveCount(0);
  // Teachers and students never see it.
  const student = await person(browser); await login(student, 'DemoStudent', DEMO_PW);
  expect((await student.request.get(`/school/${DEMO_SLUG}?tab=billing`)).status()).toBe(404);
  const game = await templateGame(student);
  await expect(student.locator('#st-turns')).toHaveText(/🔋 2 left today/);   // a class context: no total, even unpaid
  await makeTester(browser, 'DemoTeacher');
  await boss.goto(`/school/${DEMO_SLUG}?tab=billing`);
  await expect(boss.locator('#plan')).toContainText('$20.00 per student per year, for at least 25 students');
  await expect(boss.locator('#seats-pay')).toHaveValue('25');
  await boss.fill('#seats-pay', '20');
  await boss.fill('#pw-pay', DEMO_PW);
  await boss.locator('#pay button[type=submit]').click();
  await expect(boss.locator('#seats-pay-err')).toContainText('from 25');
  await boss.fill('#seats-pay', '25');
  await Promise.all([boss.waitForURL(/tab=billing&checkout=cs_test_/), boss.locator('#pay button[type=submit]').click()]);
  await expect(boss.locator('#plan')).toContainText('School plan for 25 students', { timeout: 30_000 });
  await expect(boss.locator('#plan')).toContainText('100 of 100 Builder messages left');
  const st = await control('state');
  const checkout = st.checkouts.at(-1);
  expect(checkout.payment_method_configuration).toBe('pmc_fakeschool');
  expect(checkout.line_items[0].quantity).toBe('25');
  expect(st.violations).toEqual([]);

  // The student builds from the school's pool: still only "left today" (the school's cap, 3 here).
  await student.reload();
  await expect(student.locator('#st-turns')).toHaveText(/🔋 3 left today/);
  await expect(student.locator('main')).not.toContainText(/\$|plan|grown-up/i);

  // More students: billed at once (the fake card pays), the pool grows.
  await boss.goto(`/school/${DEMO_SLUG}?tab=billing`);
  await boss.fill('#seats-change', '30');
  await Promise.all([boss.waitForLoadState('load'), boss.locator('#seats button[type=submit]').click()]);
  await expect(boss.locator('#plan')).toContainText('School plan for 30 students', { timeout: 15_000 });
  await expect(boss.locator('#plan')).toContainText('of 120 Builder messages left');
  // Fewer students: next year.
  await boss.fill('#seats-change', '26');
  await Promise.all([boss.waitForLoadState('load'), boss.locator('#seats button[type=submit]').click()]);
  await expect(boss.locator('#seats')).toContainText('Next year: 26 students.', { timeout: 15_000 });
  // The daily cap setting.
  await boss.fill('#set-builderDailyCap', '5');
  await Promise.all([boss.waitForLoadState('load'), boss.locator('#cap button[type=submit]').click()]);
  await expect(boss.locator('#cap-hint')).toContainText('now 5');
  await student.reload();
  await expect(student.locator('#st-turns')).toHaveText(/🔋 5 left today/);
  // The owner sees the school's plan on /admin/billing.
  const a = await admin(browser);
  await a.goto('/admin/billing');
  await expect(a.locator('main')).toContainText('Oomba Academy Demo School');
  await expect(a.locator('main')).toContainText('card · pool 30 paid · next year 26');
  void game;
});

test('invoice: the school asks, the owner clicks Create invoice subscription, the plan is on; Mark paid by check; overdue', async ({ browser }) => {
  const sch = await invoiceSchool(browser);
  const p = sch.page;
  await p.goto(`/school/${sch.slug}?tab=billing`);
  await p.locator('#invoice summary').click();
  await p.fill('#inv-seats', '40');
  await p.fill('#inv-po', 'PO-2026-17');
  await p.fill('#inv-contactName', 'Pat Bursar');
  await p.fill('#inv-contactEmail', 'bursar@bay.example');
  await p.fill('#inv-line1', '12 Harbor Road');
  await p.fill('#inv-city', 'Portland');
  await p.fill('#inv-state', 'ME');
  await p.fill('#inv-postalCode', '04101');
  await p.check('input[name=taxExempt]');
  await Promise.all([p.waitForLoadState('load'), p.locator('#invoice button[type=submit]').click()]);
  await expect(p.locator('#invoice')).toContainText('Invoice requested on', { timeout: 15_000 });
  await expect(p.locator('#invoice')).toContainText('for 40 students');

  // The owner.
  const a = await admin(browser);
  await a.goto('/admin/billing');
  const req = a.locator('#requests .panel', { hasText: sch.name });
  await expect(req).toContainText('PO-2026-17');
  await expect(req).toContainText('bursar@bay.example');
  await expect(req).toContainText('12 Harbor Road, Portland, ME, 04101, US');
  await expect(req).toContainText('they say so');
  a.once('dialog', d => d.accept());
  await Promise.all([a.waitForResponse(r => r.url().includes('/invoice-subscription')), req.locator('button', { hasText: 'Create invoice subscription' }).click()]);
  await a.waitForLoadState('load');
  await expect(a.locator('#requests')).not.toContainText(sch.name);
  await expect(a.locator('#unpaid')).toContainText(sch.name);

  // The school: on at once (net 30), the open invoice shown.
  await p.goto(`/school/${sch.slug}?tab=billing`);
  await expect(p.locator('#plan')).toContainText('School plan for 40 students');
  await expect(p.locator('#plan')).toContainText('Invoice for $800.00, due on');
  await expect(p.locator('#plan')).toContainText('160 of 160 Builder messages left');

  // Overdue: still on for 30 days after the due date, and the tab says so.
  const st = await control('state');
  const sub = st.subscriptions.find(s => s.collection_method === 'send_invoice' && s.items.data[0].quantity === 40);
  expect((await control('overdue', { subscription: sub.id, days: 3 })).status).toBe(200);
  await p.reload();
  await expect(p.locator('#plan')).toContainText('An invoice is overdue. Pay it by');
  await expect(p.locator('#plan')).toContainText('School plan for 40 students');

  // A check arrives: Mark paid by check.
  await a.goto('/admin/billing');
  const row = a.locator('#unpaid tr', { hasText: sch.name });
  await expect(row).toContainText('overdue');
  a.once('dialog', d => d.accept());
  await Promise.all([a.waitForResponse(r => r.url().includes('/paid-by-check')), row.locator('button', { hasText: 'Mark paid by check' }).click()]);
  await a.waitForLoadState('load');
  await expect(a.locator('#unpaid')).not.toContainText(sch.name);
  await p.reload();
  await expect(p.locator('#plan')).not.toContainText('overdue');
  await expect(p.locator('#plan')).not.toContainText('Invoice for');
  expect((await control('state')).violations).toEqual([]);
});

// ---------------------------------------------------------------- layout of the new pages
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test('the Billing tab and /admin/billing: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  // A school with no plan (the invoice form open), one with a pending request, the paying demo school, and the admin.
  const fresh = await invoiceSchool(browser);
  const asked = await invoiceSchool(browser);
  await asked.page.request.post(`/api/billing/school/${(await (await asked.page.request.get(`/school/${asked.slug}?tab=billing`)).text()).match(/\/api\/billing\/school\/([A-Za-z0-9]+)\//)[1]}/invoice-request`, {
    data: { seats: 30, contactName: 'Sam Office', contactEmail: 'office@asked.example', line1: '5 Main St', city: 'Austin', postalCode: '73301', country: 'US' } });
  const boss = await person(browser); await login(boss, 'DemoTeacher', DEMO_PW);
  const sets = [
    [await fresh.page.context().storageState(), [`/school/${fresh.slug}?tab=billing`]],
    [await asked.page.context().storageState(), [`/school/${asked.slug}?tab=billing`]],
    [await boss.context().storageState(), [`/school/${DEMO_SLUG}?tab=billing`, `/school/${DEMO_SLUG}?tab=billing&checkout=cs_test_layoutcheck123`]],
    [await (await admin(browser)).context().storageState(), ['/admin/billing']],
  ];
  const problems = [];
  for (const v of VIEWS) {
    for (const [state, paths] of sets) {
      const ctx = await browser.newContext({ baseURL: APP, viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
      const page = await ctx.newPage();
      for (const p of paths) {
        await page.goto(v.lang ? `${p}${p.includes('?') ? '&' : '?'}lang=${v.lang}` : p);
        if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
        // Open the invoice form so its fields are checked too.
        if (await page.locator('#invoice details').count()) await page.locator('#invoice summary').click();
        for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
      }
      await ctx.close();
    }
  }
  for (const pg of [fresh.page, asked.page, boss]) await pg.goto('/?lang=en');
  expect([...new Set(problems)]).toEqual([]);
});
