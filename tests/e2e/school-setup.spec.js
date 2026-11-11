// Setting up a school from a "Set up my school" request (docs/decisions.md "Setting up a school from a request"): the
// School requests tab's "Set up this school" opens one page (school, its admin, the welcome email's address and
// language), and one button makes the school and the admin's account and closes the request. Email sending is off in
// tests, so the People tab says the welcome was not sent and offers the login card and a retry. The email preview
// opens. Phone and desktop: nothing touches, nothing scrolls sideways. Screenshots to $SETUP_SHOTS when set.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { login, ADMIN } from './helpers.js';

test.describe.configure({ timeout: 180_000 });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (p, name) => { if (process.env.SETUP_SHOTS) await p.screenshot({ path: `${process.env.SETUP_SHOTS}/${name}.png`, fullPage: true }); };

test('a school request: Set up this school, one page, one button; the People tab says what happened', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const p = await ctx.newPage();
  const school = `Fortech Test ${Date.now().toString(36)}`;
  // A teacher's request from the public form.
  await p.goto('/teachers');
  const sent = await p.request.post('/api/teachers/school-request', { data: { school, role: 'it', email: 'ana@fortech.example', students: '240', country: 'Portugal', name: 'Ana Rivera' } });
  expect(sent.ok()).toBe(true);
  await login(p, ADMIN.username, ADMIN.password);
  await p.goto('/admin?tab=schoolreq');
  const card = p.locator('article', { hasText: school });
  await expect(card.locator('a', { hasText: 'Set up this school' })).toBeVisible();
  await expect(card.locator('button', { hasText: 'Mark done' })).toHaveCount(0);
  await card.locator('a', { hasText: 'Set up this school' }).click();
  await expect(p).toHaveURL(/\/admin\/schools\/setup\?request=/);
  await expect(p.locator('#su-school')).toHaveValue(school);
  await expect(p.locator('#su-name')).toHaveValue('Ana Rivera');
  await expect(p.locator('#su-email')).toHaveValue('ana@fortech.example');
  await expect(p.locator('#su-user')).toBeHidden();
  expect(await sideways(p)).toBeLessThanOrEqual(0);
  expect(await findTouching(p)).toEqual([]);
  await shot(p, 'setup-390');
  // The preview opens in the chosen language.
  await p.selectOption('#su-lang', 'es');
  const [pv] = await Promise.all([ctx.waitForEvent('page'), p.locator('#su-preview').click()]);
  await expect(pv.locator('body')).toContainText('Elegir mi contraseña');
  await shot(pv, 'preview-es'); await pv.close();
  await p.locator('#setup-form button[type=submit]').click();
  await expect(p).toHaveURL(/\/school\/[\w-]+\?tab=people&welcome=notsent/);
  await expect(p.locator('#welcome-notsent')).toBeVisible();
  await expect(p.locator('#welcome-notsent a[href^="/cards/"]')).toBeVisible();
  await expect(p.locator('#staff')).toBeVisible();
  await expect(p.locator('main')).toContainText('Ana Rivera');
  expect(await sideways(p)).toBeLessThanOrEqual(0);
  await shot(p, 'people-390');
  // Back on the requests tab: closed, linked to the school, with "Welcome email" to send it again.
  await p.goto('/admin?tab=schoolreq');
  const row = p.locator('tr', { hasText: school });
  await expect(row.locator('a', { hasText: 'Welcome email' })).toBeVisible();
  await ctx.close();

  // Desktop: the setup page for an existing school (from the Schools list).
  const d = await browser.newContext({ viewport: { width: 1280, height: 860 } }); const dp = await d.newPage();
  await login(dp, ADMIN.username, ADMIN.password);
  await dp.goto('/admin/schools');
  await dp.locator('tr', { hasText: school }).locator('a', { hasText: 'Welcome email' }).click();
  await expect(dp.locator('input[name=account][value=current]')).toBeChecked();
  await expect(dp.locator('#su-email')).toHaveValue('ana@fortech.example');
  expect(await sideways(dp)).toBeLessThanOrEqual(0);
  expect(await findTouching(dp)).toEqual([]);
  await shot(dp, 'setup-1280-existing');
  await d.close();
});
