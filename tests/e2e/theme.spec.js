// Theme (docs/decisions.md "A quieter top bar": no theme button in the top bar any more): signed out, the footer's theme
// links switch at once and the choice survives a reload; signed in, the account menu behind the avatar does the same;
// "Same as my device" follows the device; Settings saves to the account; everything works with JavaScript off.
import { test, expect } from '@playwright/test';
import { signup, login, ownIp } from './helpers.js';

const DARK_BG = 'rgb(20, 20, 20)';     // --bg in the dark token blocks of app.css (Ink)
const LIGHT_BG = 'rgb(244, 241, 230)'; // --bg in :root
/** [content, media] of each theme-color meta (the browser toolbar takes the top bar's colour). */
const themeColors = page => page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map(m => [m.content, m.media || null]));
const html = page => page.locator('html');
const bodyBg = page => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
/** Signed out: the footer's theme links. Signed in: the account menu behind the avatar. */
const menu = page => page.locator('footer .foot-theme');
const acct = page => page.locator('.topbar .acctpick');

test('signed out, picking Dark in the footer switches at once, saves, and survives a reload', async ({ page }) => {
  await ownIp(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  await expect(html(page)).not.toHaveAttribute('data-theme', /./);
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await expect(page.locator('.topbar [data-theme-choice]'), 'no theme menu in the top bar').toHaveCount(0);
  await expect(menu(page).locator('a[aria-current="true"]')).toHaveAttribute('data-theme-choice', 'system');
  await page.evaluate(() => { window.__samePage = true; });
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await menu(page).getByRole('link', { name: 'Dark' }).click();
  await saved;
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(DARK_BG);
  expect(await page.evaluate(() => window.__samePage), 'no reload: the switch is instant').toBe(true);
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  expect(await themeColors(page), 'one toolbar colour: Ink').toEqual([['#141414', null]]);
  await expect(menu(page).locator('a[aria-current="true"]')).toHaveAttribute('data-theme-choice', 'dark');
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
  await menu(page).getByRole('link', { name: 'Light' }).click();
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  expect(await bodyBg(page)).toBe(LIGHT_BG);
  await menu(page).getByRole('link', { name: 'Dark' }).click();
  await page.emulateMedia({ colorScheme: 'light' });
  expect(await bodyBg(page)).toBe(DARK_BG);
  // Back to following the device.
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

test('the footer links, the account menu and the Settings form work with JavaScript turned off', async ({ browser }) => {
  const ctx = await browser.newContext({ javaScriptEnabled: false, colorScheme: 'light' });
  const page = await ctx.newPage();
  await ownIp(page);
  await page.goto('/safety');
  await Promise.all([page.waitForURL(u => u.pathname === '/safety' && !u.search.includes('theme')), menu(page).getByRole('link', { name: 'Dark' }).click()]);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await bodyBg(page)).toBe(DARK_BG);
  await expect(menu(page).locator('a[aria-current="true"]')).toHaveAttribute('data-theme-choice', 'dark');
  // Signed in (through the API, since the sign-in form needs JavaScript): Settings' radio form saves with Save.
  const { username } = await signup(await (await browser.newContext()).newPage());
  const res = await page.request.post('/api/auth/login', { data: { username, password: 'secret123' } });
  expect(res.ok()).toBe(true);
  await page.goto('/me/settings');
  await expect(page.locator('#themeform input[value="dark"]')).toBeChecked();
  await page.locator('#themeform label', { hasText: 'Light' }).click();
  await Promise.all([page.waitForURL(u => u.pathname === '/me/settings' && !u.search.includes('theme')), page.locator('#themeform [type=submit]').click()]);
  expect(new URL(page.url()).hash).toBe('#appearance');
  await expect(html(page)).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('#themeform input[value="light"]')).toBeChecked();
  // The account menu: a <details> of plain links, so it opens and picks with no JavaScript too.
  await page.goto('/safety');
  await acct(page).locator('summary').click();
  await Promise.all([page.waitForURL(u => u.pathname === '/safety' && !u.search.includes('theme')), acct(page).getByRole('link', { name: 'Dark' }).click()]);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('signed in, the avatar opens the account menu: Settings with the theme switches at once and closes the menu', async ({ page }) => {
  await signup(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/learn');
  await expect(page.locator('footer .foot-theme'), 'signed in, the theme is in the account menu, not the footer').toHaveCount(0);
  await page.evaluate(() => { window.__samePage = true; });
  await acct(page).locator('summary').click();
  await expect(acct(page).getByRole('link', { name: 'Me', exact: true }), 'the menu opens on its first item').toBeFocused();
  await expect(acct(page).locator('.lang-head')).toHaveText('Settings');
  await expect(acct(page).locator('a[href="/plans"]'), 'kids are never sold to: no Plans').toHaveCount(0);
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await acct(page).getByRole('link', { name: 'Dark' }).click();
  await saved;
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => window.__samePage), 'no reload').toBe(true);
  await expect(acct(page)).not.toHaveAttribute('open', '');
  await expect(acct(page).locator('summary')).toBeFocused();
  await expect(acct(page).locator('a[aria-current="true"]')).toHaveAttribute('data-theme-choice', 'dark');
  // Escape closes it; a tap outside too.
  await acct(page).locator('summary').click();
  await page.keyboard.press('Escape');
  await expect(acct(page)).not.toHaveAttribute('open', '');
  await acct(page).locator('summary').click();
  await page.locator('main h1').click();
  await expect(acct(page)).not.toHaveAttribute('open', '');
});

test('a choice in Settings applies at once and follows the account to another device', async ({ page, browser }) => {
  const { username, password } = await signup(page);
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/me/settings');
  await expect(page.locator('#themeform [type=submit]'), 'with JavaScript the pick applies at once, so no Save button').toBeHidden();
  const saved = page.waitForResponse(r => r.url().endsWith('/api/me/theme') && r.ok());
  await page.locator('#themeform label', { hasText: 'Dark' }).click();
  await saved;
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  await expect(acct(page).locator('a[aria-current="true"]'), 'the account menu follows').toHaveAttribute('data-theme-choice', 'dark');
  const ctx = await browser.newContext({ colorScheme: 'light' }); const other = await ctx.newPage();
  await login(other, username, password);
  await other.goto('/');
  await expect(html(other)).toHaveAttribute('data-theme', 'dark');
  await ctx.close();
});

test('the top bar fits on phones and desktops (the language picker and Sign in, no theme button)', async ({ browser }) => {
  for (const width of [320, 360, 390, 820, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 800 } }); const page = await ctx.newPage();
    await ownIp(page);
    await page.goto('/');
    await expect(page.locator('.topbar .langpick > summary'), `${width}px`).toBeVisible();
    const r = await page.evaluate(() => {
      const items = [...document.querySelector('.topbar').children].filter(e => e.checkVisibility() && !e.classList.contains('skip'))
        .map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      return { tight: items.slice(1).some((b, i) => b.left - items[i].right < 4), off: items.some(b => b.left < 0 || b.right > innerWidth), wide: document.documentElement.scrollWidth - innerWidth };
    });
    expect(r, `${width}px: top bar items keep apart and stay on screen, no sideways scroll`).toEqual({ tight: false, off: false, wide: 0 });
    await ctx.close();
  }
});
