// Account first (docs/decisions.md "Account first: set up your school"): signed out, "Set up your school" on /teachers
// makes the teacher's account and their school in one go and lands them on their Classroom; the platform admin's
// School requests tab offers "Looks good" (no Set up this school: the school already exists). Phone and desktop,
// light and dark: nothing touches, nothing scrolls sideways. Screenshots to $SIGNUP_SHOTS when set.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { uniq, ownIp, adminPage } from './helpers.js';

test.describe.configure({ timeout: 180_000 });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (p, name) => { if (process.env.SIGNUP_SHOTS) await p.screenshot({ path: `${process.env.SIGNUP_SHOTS}/${name}.png`, fullPage: true }); };

test('set up your school: account and school in one go, the Classroom says it is ready, the admin says Looks good', async ({ browser }) => {
  for (const v of [{ width: 360, height: 740, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme }); const p = await ctx.newPage();
    await ownIp(p);
    await p.goto('/teachers#start');
    const f = p.locator('.sr-form');
    await expect(f.locator('legend')).toContainText('Your account');
    await f.locator('button[type=submit]').scrollIntoViewIfNeeded();
    expect(await sideways(p)).toBeLessThanOrEqual(0);
    expect(await findTouching(p)).toEqual([]);
    await shot(p, `teachers-form-${v.width}-${v.scheme}`);
    if (process.env.SIGNUP_SHOTS) await p.locator('#start').screenshot({ path: `${process.env.SIGNUP_SHOTS}/start-${v.width}-${v.scheme}.png` });
    // Mistakes are all shown at once, and nothing is made.
    await f.locator('button[type=submit]').click();
    await expect(p.locator('#sr-username-err')).not.toBeEmpty();
    await expect(p.locator('#sr-adult-err')).not.toBeEmpty();
    if (v.width !== 360) { await ctx.close(); continue; }
    const school = `${uniq('Fortech')} Academy`, username = uniq('Rox').slice(0, 16);
    await p.fill('#sr-name', 'Roxana Gherghinis'); await p.fill('#sr-school', school);
    await p.selectOption('#sr-role', 'it'); await p.fill('#sr-email', 'roxana@fortech.example');
    await p.fill('#sr-students', '240'); await p.fill('#sr-country', 'Romania');
    await p.fill('#sr-username', username); await p.fill('#sr-password', 'blue-otter-fortech-42'); await p.check('#sr-adult');
    await Promise.all([p.waitForURL(/\/teach\?welcome=school/), f.locator('button[type=submit]').click()]);
    await expect(p.locator('#school-ready')).toContainText(`${school} is ready`);
    expect(await sideways(p)).toBeLessThanOrEqual(0);
    await shot(p, 'classroom-ready-360');
    // The platform admin: the request is linked to the school, with Looks good (email is off in tests: it says so).
    const a = await adminPage(browser);
    await a.goto('/admin?tab=schoolreq');
    const card = a.locator('article', { hasText: school });
    await expect(card).toContainText('Signed up and already using it');
    await expect(card).toContainText(`@${username}`);
    await expect(card.locator('a', { hasText: 'Set up this school' })).toHaveCount(0);
    await shot(a, 'admin-request');
    await card.locator('button', { hasText: 'Looks good' }).click();
    await expect(a.locator('#toasts')).toContainText(/email was not sent|Welcome email sent/);
    await a.reload();
    await expect(a.locator('tr', { hasText: school })).toBeVisible();
    await ctx.close();
  }
});
