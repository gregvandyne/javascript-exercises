// The teacher and subject pages (/teachers, /learn/*) and the home page's new heading, on a phone (360) and a desktop
// (1280), light and dark, and in Hebrew (right to left): nothing touches, nothing scrolls sideways, one H1, the
// structured data parses in the browser, and the language address works. Full-page screenshots go to
// test-results/seo-shots (SEO_SHOTS=<folder> to choose another) for a person to look at.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findTouching } from './touching.js';

const SHOTS = process.env.SEO_SHOTS || 'test-results/seo-shots';
const PAGES = ['/teachers', '/learn/math-games', '/learn/word-games', '/learn/make-a-game', '/', '/g/sum-racer'];
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
];
test.describe.configure({ timeout: 240_000 });

test('teacher and subject pages: layout at 360 and 1280, light, dark and Hebrew', async ({ browser }) => {
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

test('structured data and language addresses work in the browser', async ({ page }) => {
  await page.goto('/teachers');
  const data = await page.locator('script[type="application/ld+json"]').allTextContents();
  const types = data.flatMap(d => JSON.parse(d)['@graph'].map(n => n['@type']));
  expect(types).toEqual(expect.arrayContaining(['FAQPage', 'BreadcrumbList', 'Organization', 'WebSite', 'ItemList']));
  // No script error from the data blocks under the site's CSP.
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/g/sum-racer'); await page.goto('/learn/music-games');
  expect(errors).toEqual([]);
  // The hero's call to action jumps to the "start" section.
  await page.goto('/teachers');
  await page.getByRole('link', { name: 'Get a free school account' }).first().click();
  await expect(page.locator('#start')).toBeInViewport();
  // /fr/g/sum-racer is French, without changing the visitor's saved language.
  await page.goto('/fr/g/sum-racer');
  await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
  expect((await page.context().cookies()).find(c => c.name === 'lang')).toBeUndefined();
  await page.goto('/g/sum-racer');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
