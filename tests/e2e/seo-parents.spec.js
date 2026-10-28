// The parent pages (/parents, its guides and the age pages /learn/games-for-…) and the pages they changed (the home
// page's introduction, the make-a-game page), on a phone (360) and a desktop (1280), light and dark, and in Hebrew
// (right to left): nothing touches, nothing scrolls sideways, one H1, the structured data parses in the browser.
// Full-page screenshots go to test-results/seo-parents-shots (SEO_SHOTS=<folder> to choose another).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findTouching } from './touching.js';

const SHOTS = process.env.SEO_SHOTS || 'test-results/seo-parents-shots';
const PAGES = ['/parents', '/parents/ai-builder-safety', '/parents/safety-and-screen-time', '/learn/games-for-8-and-9-year-olds', '/learn/games-for-10-and-11-year-olds', '/learn/games-for-12-to-14-year-olds', '/learn/make-a-game', '/learn/math-games', '/'];
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test.describe.configure({ timeout: 240_000 });

test('parent pages: layout at 360 and 1280, light, dark and Hebrew', async ({ browser }) => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const problems = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme });
    if (v.lang) await ctx.addCookies([{ name: 'lang', value: v.lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(p);
      if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      expect(await page.locator('h1').count(), `${p}: one H1`).toBe(1);
      for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${v.width}${v.lang ? '/' + v.lang : ''}: scrolls sideways by ${wide}px`);
      // Pictures load before the screenshot (cards are lazy).
      await page.evaluate(async () => { for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = 'eager'; await Promise.all([...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; })))); });
      await page.screenshot({ path: path.join(SHOTS, `${p === '/' ? 'home' : p.slice(1).replace(/\//g, '_')}-${v.width}-${v.scheme}${v.lang ? '-' + v.lang : ''}.png`), fullPage: true });
    }
    await ctx.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});

test('parent pages: structured data in the browser, the calls to action, and the old /parents anchors', async ({ page }) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/parents');
  const types = (await page.locator('script[type="application/ld+json"]').allTextContents()).flatMap(d => JSON.parse(d)['@graph'].map(n => n['@type']));
  expect(types).toEqual(expect.arrayContaining(['WebPage', 'FAQPage', 'BreadcrumbList', 'ItemList', 'Organization']));
  // The privacy sections are still there under their old addresses (/parents#ai, the footer's /parents#contact).
  for (const id of ['what', 'stored', 'never', 'ai', 'keep', 'friends', 'builder', 'languages']) await expect(page.locator(`section#${id}`)).toHaveCount(1);
  await page.goto('/parents#keep');
  await expect(page.locator('section#keep')).toBeInViewport();
  // "Try a game now" opens a game without signing up; "Let your child start free" opens the kids' sign-up.
  await page.goto('/parents');
  // Once at the top, and again after the questions at the end.
  await expect(page.getByRole('link', { name: 'Let your child start free' })).toHaveCount(2);
  for (const l of await page.getByRole('link', { name: 'Let your child start free' }).all()) await expect(l).toHaveAttribute('href', '/signup');
  await page.locator('a.lp-hub[href="/learn/games-for-8-and-9-year-olds"]').click();
  await expect(page).toHaveURL(/\/learn\/games-for-8-and-9-year-olds$/);
  await expect(page.locator('h1')).toContainText('Learning games for 8 and 9 year olds');
  await page.goto('/parents/ai-builder-safety'); await page.goto('/parents/safety-and-screen-time');
  expect(errors).toEqual([]);
});
