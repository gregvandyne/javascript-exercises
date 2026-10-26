// Legal pages (/terms, /refunds, /privacy): readable on a 360px phone and a 1280px desktop, light and dark, in English
// and in Hebrew (right to left, the legal text in English inside it); nothing touches, nothing scrolls sideways, and the
// footer's Terms and Privacy links lead there. Screenshots go to the test's test-results folder for a look by eye.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';

const PAGES = [['/terms', 'Terms of Service'], ['/refunds', 'Refund and Cancellation Policy'], ['/privacy', 'Privacy Policy']];
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
        await expect(page.locator('.legal-updated time'), where).toHaveAttribute('datetime', '2026-10-26');
        await expect(page.locator('.legal-notyet'), where).toBeVisible();   // billing is off in this run
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
        await page.screenshot({ path: test.info().outputPath(`${path.slice(1)}-${lang}-${v.width}-${scheme}.png`), fullPage: v.width === 360 && path === '/refunds' });
      }
      await ctx.close();
    }
    expect([...new Set(problems)]).toEqual([]);
  });
}

test('the footer links Terms and Privacy on kid pages; /terms links the refund policy and /privacy', async ({ page }) => {
  for (const path of ['/', '/safety', '/parents']) {
    await page.goto(path);
    await expect(page.locator('footer.foot a[href="/terms"]')).toHaveText('Terms');
    await expect(page.locator('footer.foot a[href="/privacy"]')).toHaveText('Privacy');
  }
  await page.goto('/safety');
  await page.locator('footer.foot a[href="/terms"]').click();
  await expect(page).toHaveURL(/\/terms$/); await expect(page.locator('h1')).toContainText('Terms of Service');
  await page.locator('#plans a[href="/refunds"]').click();
  await expect(page.locator('h1')).toContainText('Refund and Cancellation Policy');
  await page.locator('footer.foot a[href="/privacy"]').click();
  await expect(page.locator('h1')).toContainText('Privacy Policy');
  for (const id of ['stored', 'never', 'keep', 'payments', 'billingKeep']) await expect(page.locator(`section#${id}`)).toHaveCount(1);
  // Billing is off in this run: today's wording, nothing about buying on /parents and /safety.
  await page.goto('/safety'); await expect(page.locator('main')).toContainText('Nothing is for sale');
});
