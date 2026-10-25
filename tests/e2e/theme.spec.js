// Theme: the top-bar menu switches at once and the choice survives a reload; "Same as my device" follows the device;
// the Me page saves to the account; everything works with JavaScript off; the button fits the top bar on phones and desktops.
import { test, expect } from '@playwright/test';
import { signup, login, ownIp } from './helpers.js';

const DARK_BG = 'rgb(20, 20, 20)';     // --bg in the dark token blocks of app.css (Ink)
const LIGHT_BG = 'rgb(244, 241, 230)'; // --bg in :root
/** [content, media] of each theme-color meta (the browser toolbar takes the top bar's colour). */
const themeColors = page => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map(m => [m.content, m.media || null]));
const html = page => page.locator('html');
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
const menu = page => page.locator('.topbar .themepick');

test('picking Dark in the top bar switches at once, saves, and survives a reload', async ({ page }) => {
  await ownIp(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(html(page)).not.toHaveAttribute('data-theme', /./);
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await expect(menu(page).locator('summary')).toHaveAttribute('aria-label', 'Theme: Same as my device');
  await page.evaluate(() => { window.__samePage = true; });
  await menu(page).locator('summary').click();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await menu(page).getByRole('link', { name: 'Dark' }).click();
  await saved;
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(DARK_BG);
  expect(await page.evaluate(() => window.__samePage), 'no reload: the switch is instant').toBe(true);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  expect(await themeColors(page), 'one toolbar colour: Ink').toEqual([['#141414', null]]);
  await expect(menu(page)).not.toHaveAttribute('open', '');
  await expect(menu(page).locator('summary')).toHaveAttribute('aria-label', 'Theme: Dark');
  await expect(menu(page).locator('summary')).toBeFocused();
  await page.reload();
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(DARK_BG);
  await expect(menu(page).locator('a[aria-current="true"]')).toHaveAttribute('data-theme-choice', 'dark');
  await page.goto('/search');
  await expect(html(page), 'other pages too').toHaveAttribute('data-theme', 'dark');
});

test('"Same as my device" follows the device both ways; Light and Dark ignore it', async ({ page }) => {
  await ownIp(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.goto('/safety');
  expect(await bodyBg(page)).toBe(DARK_BG);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  // Light stays light on a dark device, and Dark stays dark on a light one.
  await menu(page).locator('summary').click();
  await menu(page).getByRole('link', { name: 'Light' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await menu(page).locator('summary').click();
  await menu(page).getByRole('link', { name: 'Dark' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bodyBg(page)).toBe(DARK_BG);
  // Back to following the device.
  await menu(page).locator('summary').click();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await menu(page).getByRole('link', { name: 'Same as my device' }).click();
  await saved;
  await expect(html(page)).not.toHaveAttribute('data-theme', /./);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'light dark');
  expect(await themeColors(page), 'one toolbar colour per device scheme').toEqual([['#FFFDF2', '(prefers-color-scheme: light)'], ['#141414', '(prefers-color-scheme: dark)']]);
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await page.emulateMedia({ colorScheme: 'dark' });
  expect(await bodyBg(page)).toBe(DARK_BG);
  await page.reload();
  expect(await bodyBg(page), 'after a reload too').toBe(DARK_BG);
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bodyBg(page)).toBe(LIGHT_BG);
});

test('the menu and the Me page form work with JavaScript turned off', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' });
  const page = await ctx.newPage();
  await ownIp(page);
  await page.goto('/safety');
  await menu(page).locator('summary').click();
  await Promise.all([page.waitForURL(u => u.pathname === '/safety' && !u.search.includes('theme')), menu(page).getByRole('link', { name: 'Dark' }).click()]);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(DARK_BG);
  await expect(menu(page).locator('summary')).toHaveAttribute('aria-label', 'Theme: Dark');
  // Signed in (through the API, since the sign-in form needs JavaScript): the Me page's radio form saves with Save.
  const { username } = await signup(await (await browser.newContext()).newPage());
  const res = await page.request.post('/api/auth/login', { data: { username, password: 'secret123' } });
  expect(res.ok()).toBe(true);
  await page.goto('/me');
  await expect(page.locator('#themeform input[value="dark"]')).toBeChecked();
  await page.locator('#themeform label', { hasText: 'Light' }).click();
  await Promise.all([page.waitForURL(u => u.pathname === '/me' && !u.search.includes('theme')), page.locator('#themeform [type=submit]').click()]);
  expect(new URL(page.url()).hash).toBe('#appearance');
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#themeform input[value="light"]')).toBeChecked();
  await ctx.close();
});

test('a choice on the Me page applies at once and follows the account to another device', async ({ page, browser }) => {
  const { username, password } = await signup(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/me');
  await expect(page.locator('#themeform [type=submit]'), 'with JavaScript the pick applies at once, so no Save button').toBeHidden();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await page.locator('#themeform label', { hasText: 'Dark' }).click();
  await saved;
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(menu(page).locator('summary'), 'the top-bar menu follows').toHaveAttribute('aria-label', 'Theme: Dark');
  const ctx = await browser.newContext({ colorScheme: 'light' }); const other = await ctx.newPage();
  await login(other, username, password);
  await other.goto('/');
  await expect(html(other)).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('the theme button fits the top bar on phones and desktops', async ({ browser }) => {
  for (const width of [320, 360, 390, 820, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } }); const page = await ctx.newPage();
    await ownIp(page);
    await page.goto('/');
    await expect(menu(page).locator('summary'), `${width}px`).toBeVisible();
    const r = await page.evaluate(() => {
      const items = [...document.querySelector('.topbar').children].filter(e => e.checkVisibility() && !e.classList.contains('skip'))
        .map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      return { tight: items.slice(1).some((b, i) => b.left - items[i].right < 4), off: items.some(b => b.left < 0 || b.right > innerWidth), wide: document.documentElement.scrollWidth - innerWidth };
    });
    expect(r, `${width}px: top bar items keep apart and stay on screen, no sideways scroll`).toEqual({ tight: false, off: false, wide: 0 });
    await ctx.close();
  }
});
