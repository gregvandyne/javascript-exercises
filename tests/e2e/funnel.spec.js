// Funnel counts (services/funnel.js): a visit to /parents shows up in /admin/stats' Parents table, and the three
// funnel tables fit at 360px (light, dark, Hebrew) with nothing touching and no sideways scroll.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN } from './helpers.js';

test.describe.configure({ timeout: 120_000 });

test('/admin/stats: funnels, last 7 days vs the 7 before; a parent page view is counted; fits at 360px', async ({ browser }) => {
  // A signed-out visitor reads the parent page (a real page load, counted like a visit; a headless browser's own
  // user agent is skipped as a robot, so this one says it is a plain Chrome).
  const visitor = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36' });
  const vp = await visitor.newPage();
  expect((await vp.goto('/parents')).status()).toBe(200);
  await visitor.close();

  const problems = [];
  for (const [lang, scheme] of [['en', 'light'], ['en', 'dark'], ['he', 'dark']]) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 760 }, colorScheme: scheme });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    await page.goto('/login'); await page.fill('#username', ADMIN.username); await page.fill('#password', ADMIN.password);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
    await page.goto('/admin/stats');
    await expect(page.locator('#funnels')).toHaveText('Funnels, last 7 days vs the 7 before');
    await expect(page.locator('.stats-funnels > section')).toHaveCount(3);
    const views = Number(await page.locator('#funnel-parent ~ .tblwrap tbody tr').first().locator('td').nth(1).textContent());
    if (!(views >= 1)) problems.push(`${lang} ${scheme}: parent page views ${views}`);
    const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    if (wide > 1) problems.push(`${lang} ${scheme}: scrolls sideways ${wide}px`);
    for (const t of await findTouching(page)) problems.push(`${lang} ${scheme}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
    if (process.env.BRB_SNAPSHOTS) await page.locator('#funnels').evaluate(e => e.scrollIntoView());
    if (process.env.BRB_SNAPSHOTS) await page.screenshot({ path: test.info().outputPath(`funnels-${lang}-${scheme}.png`), fullPage: false });
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
