// Account first, through the one sign-up (docs/decisions.md "Account first: set up your school" and "One sign-up"):
// signed out, "Set up your school" on /teachers leads to the teacher's steps; "Create my school" with a work email makes
// the school (the teacher is its admin at once) and a request our team looks over; the Classroom says it is ready; the
// platform admin's School requests tab offers "Looks good" (no Set up this school: the school already exists). Phone and
// desktop, light and dark: nothing touches, nothing scrolls sideways. Screenshots to $SIGNUP_SHOTS when set.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { uniq, ownIp, adminPage, teacherSignup } from './helpers.js';

test.describe.configure({ timeout: 180_000 });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const shot = async (p, name) => { if (process.env.SIGNUP_SHOTS) await p.screenshot({ path: `${process.env.SIGNUP_SHOTS}/${name}.png`, fullPage: true }); };

test('set up your school: /teachers leads into the sign-up; the school is theirs at once; the admin says Looks good', async ({ browser }) => {
  for (const v of [{ width: 360, height: 740, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme }); const p = await ctx.newPage();
    await ownIp(p);
    await p.goto('/teachers#start');
    expect(await sideways(p)).toBeLessThanOrEqual(0);
    expect(await findTouching(p)).toEqual([]);
    await shot(p, `teachers-start-${v.width}-${v.scheme}`);
    await Promise.all([p.waitForURL(/\/signup\/teacher$/), p.click('#setup-signup')]);
    await expect(p.getByRole('heading', { level: 1 })).toHaveText('Make your teacher account');
    if (v.width !== 360) { await ctx.close(); continue; }
    const school = `${uniq('Fortech')} Academy`, username = uniq('Rox').slice(0, 16);
    await teacherSignup(p, { username, name: 'Roxana Gherghinis', school, email: 'roxana@fortech.example' });
    await expect(p).toHaveURL(/\/teach\?welcome=school/);
    await expect(p.locator('#school-ready')).toContainText(`${school} is ready`);
    expect(await sideways(p)).toBeLessThanOrEqual(0);
    await shot(p, 'classroom-ready-360');
    // The platform admin: the request is linked to the school, with Looks good (email is off in tests: it says so).
    const a = await adminPage(browser);
    await a.goto('/admin?tab=schoolreq');
    const card = a.locator('article', { hasText: school });
    await expect(card).toContainText('Signed up and already using it');
    await expect(card).toContainText(`@${username}`);
    await expect(card).toContainText('Roxana Gherghinis');
    await expect(card.locator('a', { hasText: 'Set up this school' })).toHaveCount(0);
    await shot(a, 'admin-request');
    await card.locator('button', { hasText: 'Looks good' }).click();
    await expect(a.locator('#toasts')).toContainText(/email was not sent|Welcome email sent/);
    await a.reload();
    await expect(a.locator('tr', { hasText: school })).toBeVisible();
    await ctx.close();
  }
});
