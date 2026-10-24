// Languages: the 🌐 picker (mouse, keyboard, phone), French with a stub translation and English fallback,
// Arabic right-to-left, the choice persisting across pages and on the account, and BRB.user.lang in games.
// The stub strings come from tests/e2e/fixtures/locales (merged over the real files by playwright.config.js).
import { test, expect } from '@playwright/test';
import { signup, login, ownIp, gameFrame } from './helpers.js';

const NAMES = ['English', 'English (UK)', 'Português', 'Français', 'Español', 'Deutsch', 'עברית', '日本語', 'العربية', 'Русский', 'Italiano', '繁體中文', 'Nederlands'];
const html = page => page.locator('html');

test('the picker lists every language by its own name; choosing French translates the site', async ({ page }) => {
  await ownIp(page);
  await page.goto('/');
  await expect(html(page)).toHaveAttribute('lang', 'en');
  await expect(html(page)).toHaveAttribute('dir', 'ltr');
  const picker = page.locator('.topbar .langpick');
  await picker.locator('summary').click();
  const items = picker.locator('.lang-list a');
  await expect(items).toHaveText(NAMES.map(n => new RegExp(`^(✓)?${n.replace(/[()]/g, '\\$&')}$`)));
  await expect(picker.locator('a[aria-current="true"]')).toHaveText('✓English');
  await Promise.all([page.waitForURL(u => u.pathname === '/' && !u.search.includes('lang')), picker.getByText('Français', { exact: true }).click()]);
  await expect(html(page)).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.topnav .navlink').first()).toContainText('Accueil');
  await expect(page.locator('.hero .btn-big')).toContainText('Jouer');
  await expect(page.locator('.topnav'), 'the real fr.json fills the keys the stub leaves out (fallback itself is unit-tested)').toContainText('Créer');
  await expect(page.locator('.topbar .langpick summary')).toHaveAttribute('aria-label', 'Langue\u00a0: Français');
  // The choice persists across pages (cookie), including client-side strings.
  await page.goto('/search');
  await expect(html(page)).toHaveAttribute('lang', 'fr');
  await expect(page.locator('.topnav .navlink[aria-current="page"]')).toContainText('Recherche');
  await page.locator('.topbar .langpick summary').click();
  await expect(page.locator('.topbar .lang-list a[aria-current="true"]')).toContainText('Français');
  await expect(page.locator('#i18n')).toHaveCount(1);
});

test('Arabic switches the page to right-to-left everywhere and the game gets BRB.user.lang', async ({ page }) => {
  await ownIp(page);
  await page.goto('/safety');
  await page.locator('.topbar .langpick summary').click();
  await Promise.all([page.waitForURL(u => u.pathname === '/safety' && !u.search.includes('lang')), page.locator('.topbar .lang-list').getByText('العربية').click()]);
  await expect(html(page)).toHaveAttribute('dir', 'rtl');
  await expect(html(page)).toHaveAttribute('lang', 'ar');
  for (const path of ['/', '/g/shark-plank', '/search?q=shark', '/friends']) {
    await page.goto(path);
    await expect(html(page), path).toHaveAttribute('dir', 'rtl');
  }
  await page.goto('/');
  await expect(page.locator('.topnav .navlink').first()).toContainText('الرئيسية');
  await expect(page.locator('.hero .btn-big')).toContainText('العب');
  // right-to-left really is applied: the logo sits on the right of the header
  const logo = await page.locator('.topbar .logo').boundingBox(); const me = await page.locator('.topbar .me-btn').boundingBox();
  expect(logo.x).toBeGreaterThan(me.x);
  // games stay left-to-right but know the player's language
  await page.goto('/play/shark-plank');
  await expect(page.locator('#stage')).toHaveAttribute('dir', 'ltr');
  const f = await gameFrame(page);
  expect(await f.evaluate(() => [window.BRB.user.lang, window.BRB.user.dir])).toEqual(['ar', 'rtl']);
});

test('the language menu works with the keyboard and on a phone', async ({ page }) => {
  await ownIp(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const summary = page.locator('.topbar .langpick summary');
  await expect(summary).toBeVisible();
  await summary.focus();
  await page.keyboard.press('Enter');
  const menu = page.locator('.topbar .lang-menu');
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(390);
  await expect(page.locator('.topbar .lang-list a[aria-current="true"]')).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.topbar .lang-list a').nth(1)).toBeFocused();
  await page.keyboard.press('End');
  await expect(page.locator('.topbar .lang-list a').last()).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
  await expect(summary).toBeFocused();
});

test('a signed-in player\'s choice is saved to the account and follows them to another device', async ({ page, browser }) => {
  const { username, password } = await signup(page);
  await page.goto('/me');
  await Promise.all([page.waitForURL(u => u.pathname === '/me' && !u.search.includes('lang')), page.selectOption('#lang-select', 'fr')]);
  await expect(html(page)).toHaveAttribute('lang', 'fr');
  await expect(page.locator('#lang-select')).toHaveValue('fr');
  // a fresh browser with no lang cookie and an English Accept-Language
  const ctx = await browser.newContext({ locale: 'en-US' }); const other = await ctx.newPage();
  await login(other, username, password);
  await other.goto('/');
  await expect(html(other)).toHaveAttribute('lang', 'fr');
  await expect(other.locator('.topnav .navlink').first()).toContainText('Accueil');
  await ctx.close();
});

test('Accept-Language picks the first supported language for a new visitor', async ({ browser }) => {
  const ctx = await browser.newContext({ locale: 'ar-EG' }); const page = await ctx.newPage();
  await ownIp(page);
  await page.goto('/');
  await expect(html(page)).toHaveAttribute('lang', 'ar');
  await expect(html(page)).toHaveAttribute('dir', 'rtl');
  await ctx.close();
});
