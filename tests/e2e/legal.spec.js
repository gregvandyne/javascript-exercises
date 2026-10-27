// Legal pages (/terms, /refunds, /privacy): readable on a 360px phone and a 1280px desktop, light and dark, in English
// and in Hebrew (right to left, the legal text in English inside it); nothing touches, nothing scrolls sideways, and the
// footer leads there: Privacy for everyone, Terms only for grown-ups and school staff (never on a kid's pages). Screenshots go to the test's test-results folder for a look by eye.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { signup, uniq, ownIp, adminPage } from './helpers.js';

const PAGES = [['/terms', 'Terms of Service'], ['/refunds', 'Refund and Cancellation Policy'], ['/privacy', 'Privacy Policy'], ['/privacy?for=grownups', 'Privacy Policy']];
const VIEWS = [{ width: 360, height: 780 }, { width: 1280, height: 860 }];
test.describe.configure({ timeout: 180_000 });

for (const lang of ['en', 'he']) {
  test(`legal pages at 360 and 1280, light and dark (${lang})`, async ({ browser }) => {
    const problems = [];
    for (const v of VIEWS) for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({ viewport: v, colorScheme: scheme });
      await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
      const page = await ctx.newPage();
      for (const [path, heading] of PAGES) {
        await page.goto(path); await page.evaluate(() => document.fonts.ready);
        const where = `${path} ${lang} @${v.width}/${scheme}`;
        await expect(page.locator('h1'), where).toContainText(heading);   // the legal text is English in every language for now
        expect(await page.locator('html').getAttribute('dir'), where).toBe(lang === 'he' ? 'rtl' : 'ltr');
        await expect(page.locator('.legal-updated time'), where).toHaveAttribute('datetime', '2026-10-27');
        // Billing is off in this run: "not on sale yet", except on the /privacy without the billing sections.
        await expect(page.locator('.legal-notyet'), where).toHaveCount(path === '/privacy' ? 0 : 1);
        expect(await page.locator('.legal section.panel').count(), where).toBeGreaterThan(4);
        // English text inside a Hebrew page reads left to right (its full stops at the end).
        if (lang === 'he') expect(await page.locator('#contact p').evaluate(e => getComputedStyle(e).direction), where).toBe('ltr');
        for (const t of await findTouching(page)) problems.push(`${where}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
        const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        if (wide > 1) problems.push(`${where}: scrolls sideways by ${wide}px`);
        // Text stays inside its panel (long words, the email link, list bullets in RTL).
        const out = await page.evaluate(() => [...document.querySelectorAll('.legal .panel')].flatMap(p => {
          const r = p.getBoundingClientRect();
          return [...p.querySelectorAll('h2,h3,p,li,a')].filter(e => { const b = e.getBoundingClientRect(); return b.left < r.left - 0.5 || b.right > r.right + 0.5; }).map(e => `${p.id}: ${e.tagName} ${e.textContent.slice(0, 40)}`);
        }));
        problems.push(...out.map(o => `${where}: outside its panel: ${o}`));
        await page.screenshot({ path: test.info().outputPath(`${path.slice(1).replace(/\W+/g, '-')}-${lang}-${v.width}-${scheme}.png`), fullPage: v.width === 360 && path === '/refunds' });
      }
      await ctx.close();
    }
    expect([...new Set(problems)]).toEqual([]);
  });
}

test('kids and the signed-out: a Privacy link without plan names, never Terms; the platform admin: Terms too', async ({ page, browser }) => {
  for (const path of ['/', '/safety', '/parents']) {
    await page.goto(path);
    await expect(page.locator('footer.foot a[href="/privacy"]')).toHaveText('Privacy');
    await expect(page.locator('footer.foot a[href="/terms"]')).toHaveCount(0);
  }
  await page.locator('footer.foot a[href="/privacy"]').click();
  await expect(page.locator('h1')).toContainText('Privacy Policy');
  for (const id of ['stored', 'never', 'keep', 'children', 'more']) await expect(page.locator(`section#${id}`)).toHaveCount(1);
  for (const id of ['payments', 'schoolBilling', 'billingKeep', 'grownups']) await expect(page.locator(`section#${id}`)).toHaveCount(0);
  // A kid's own account: the same, and no pointer to the grown-up text.
  await ownIp(page);
  await signup(page, uniq('LegalKid'));
  for (const path of ['/', '/me', '/build']) {
    await page.goto(path);
    await expect(page.locator('footer.foot a[href="/privacy"]')).toHaveText('Privacy');
    await expect(page.locator('footer.foot a[href="/terms"]')).toHaveCount(0);
  }
  await page.goto('/privacy');
  await expect(page.locator('section#payments')).toHaveCount(0);
  await expect(page.locator('section#more')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText(/Family plan|School plan|Manage plan|buy a /);
  // The platform admin (as school staff and grown-ups): Terms in the footer, /terms links the refund policy, and /privacy
  // has every section.
  const a = await adminPage(browser);
  await a.goto('/safety');
  await a.locator('footer.foot a[href="/terms"]').click();
  await expect(a).toHaveURL(/\/terms$/); await expect(a.locator('h1')).toContainText('Terms of Service');
  await a.locator('#plans a[href="/refunds"]').click();
  await expect(a.locator('h1')).toContainText('Refund and Cancellation Policy');
  await a.locator('footer.foot a[href="/privacy"]').click();
  await expect(a.locator('h1')).toContainText('Privacy Policy');
  for (const id of ['stored', 'never', 'keep', 'payments', 'schoolBilling', 'billingKeep']) await expect(a.locator(`section#${id}`)).toHaveCount(1);
  await a.context().close();
  // Billing is off in this run: today's wording, nothing about buying on /parents and /safety.
  await page.goto('/safety'); await expect(page.locator('main')).toContainText('Nothing is for sale');
  await page.goto('/parents'); await expect(page.locator('section#plans')).toHaveCount(0);
});
