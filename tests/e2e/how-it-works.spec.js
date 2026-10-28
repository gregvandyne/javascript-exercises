// "How it works" on /parents and /teachers (server/views/how.js, public/js/how.js, public/css/how.css): at 360, 768 and
// 1280, light and dark, and in Hebrew, nothing touches and nothing scrolls sideways once every section has come into
// view; with reduced motion everything shows and nothing moves; without JavaScript every step's picture shows; on a
// wide screen the sticky screen follows the step in the middle of the view; the hero layers move with the scroll; and
// the browser logs no errors.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';

const PAGES = ['/parents', '/teachers'];
const VIEWS = [
  { width: 360, height: 780, scheme: 'light' }, { width: 360, height: 780, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
  { width: 360, height: 780, scheme: 'light', lang: 'he' }, { width: 1280, height: 860, scheme: 'dark', lang: 'he' },
  // Tablets: words and phone picture side by side.
  { width: 768, height: 1024, scheme: 'light' }, { width: 768, height: 1024, scheme: 'dark', lang: 'he' },
];
test.describe.configure({ timeout: 240_000 });

/** Scroll to the bottom a screen at a time (so every section is revealed and every picture loads), then wait. */
async function scrollThrough(page) {
  await page.evaluate(async () => {
    const wait = ms => new Promise(r => setTimeout(r, ms));
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.6) { scrollTo(0, y); await wait(60); }
    scrollTo(0, 0); await wait(60);
  });
  await page.waitForTimeout(800);   // reveal transitions are 0.55 s
}
const errorsOf = page => { const errs = []; page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); page.on('pageerror', e => errs.push(String(e))); return errs; };

test('layout at 360 and 1280, light, dark and Hebrew: nothing touches, no sideways scroll, no console errors', async ({ browser }) => {
  const problems = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme });
    if (v.lang) await ctx.addCookies([{ name: 'lang', value: v.lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage(); const errs = errorsOf(page);
    for (const p of PAGES) {
      const at = `${p} @${v.width}/${v.scheme}${v.lang ? '/' + v.lang : ''}`;
      await page.goto(p);
      if (v.lang) await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
      await expect(page.locator('#how-it-works .how-step').first()).toBeVisible();
      await scrollThrough(page);
      // Every section has been revealed.
      expect(await page.locator('.how-rv:not(.is-in)').count(), `${at}: all revealed`).toBe(0);
      for (const t of await findTouching(page)) problems.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${at}: scrolls sideways by ${wide}px`);
      // The step pictures that show have loaded.
      const broken = await page.evaluate(() => [...document.querySelectorAll('#how-it-works img')].filter(i => i.checkVisibility() && !(i.complete && i.naturalWidth > 0)).map(i => i.currentSrc || i.src));
      if (broken.length) problems.push(`${at}: pictures not loaded: ${broken.join(', ')}`);
    }
    if (errs.length) problems.push(`@${v.width}/${v.scheme}${v.lang || ''}: console errors: ${errs.join(' | ')}`);
    await ctx.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});

test('reduced motion: everything shows at once and nothing moves', async ({ browser }) => {
  for (const width of [360, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, reducedMotion: 'reduce' });
    const page = await ctx.newPage(); const errs = errorsOf(page);
    for (const p of PAGES) {
      await page.goto(p);
      await page.evaluate(() => scrollTo(0, 600)); await page.waitForTimeout(300);
      expect(await page.locator('.how-reveal, .how-rv, .how-js, .how-par-js').count(), `${p}@${width}: no motion classes`).toBe(0);
      await expect(page.locator('.how-stage')).toBeHidden();
      // Every step's own picture is there, and every section is fully opaque.
      for (const fig of await page.locator('#how-it-works .how-fig').all()) expect((await fig.boundingBox()).height, p).toBeGreaterThan(100);
      expect(await page.evaluate(() => [...document.querySelectorAll('.lp > section, .lp-cols > *, .how-step')].filter(e => getComputedStyle(e).opacity !== '1').length)).toBe(0);
      // The hero layers stay where they are.
      for (const t of await page.locator('.how-l').evaluateAll(ls => ls.map(l => getComputedStyle(l).transform))) expect(t).toBe('none');
    }
    expect(errs).toEqual([]);
    await ctx.close();
  }
});

test('without JavaScript every step shows its picture', async ({ browser }) => {
  for (const width of [360, 1280]) {
    const ctx = await browser.newContext({ viewport: { width, height: 860 }, javaScriptEnabled: false });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(p);
      const figs = page.locator('#how-it-works .how-fig');
      expect(await figs.count()).toBeGreaterThan(3);
      for (const fig of await figs.all()) { await fig.scrollIntoViewIfNeeded(); const b = await fig.boundingBox(); expect(b && b.width > 100 && b.height > 100, `${p}@${width}`).toBe(true); }
      await expect(page.locator('.how-stage')).toBeHidden();
      // From 960px the picture is the wide (desktop) screenshot, below it the phone one.
      const src = await page.locator('#how-it-works .how-fig img').first().evaluate(i => i.currentSrc);
      expect(src).toMatch(width >= 960 ? /-d-(1024|2048)\.webp$/ : /-p-(390|780)\.webp$/);
    }
    await ctx.close();
  }
});

test('1280: the sticky screen shows the step in the middle of the view', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage(); const errs = errorsOf(page);
  for (const p of PAGES) {
    await page.goto(p);
    const stage = page.locator('.how-stage');
    await expect(stage).toBeVisible();
    await expect(stage).toHaveAttribute('data-step', '1');
    const n = await page.locator('.how-step').count();
    for (const step of [3, n, 2]) {
      await page.locator(`#how-${step}`).evaluate(el => { const r = el.getBoundingClientRect(); scrollTo(0, scrollY + r.top + r.height / 2 - innerHeight / 2); });
      await expect(stage).toHaveAttribute('data-step', String(step));
      await expect(page.locator(`#how-${step}`)).toHaveAttribute('aria-current', 'step');
      expect(await page.locator('.how-step[aria-current]').count()).toBe(1);
      await expect(stage.locator('.how-count')).toHaveText(`${step} / ${n}`);
      // Left to right in every language, so right-to-left pages don't show "5 / 3".
      expect(await stage.locator('.how-count').evaluate(e => getComputedStyle(e).direction)).toBe('ltr');
      const shot = stage.locator('.how-shot.on');
      await expect(shot).toHaveCount(1);
      await expect(shot).toHaveCSS('opacity', '1');
      await expect.poll(() => shot.locator('img').evaluate(i => i.complete && i.naturalWidth)).toBeGreaterThan(0);
      expect(await shot.locator('img').evaluate(i => i.currentSrc)).toMatch(/-d-(1024|2048)\.webp$/);
      // The sticky screen stays in view while the steps scroll.
      const b = await stage.boundingBox(); expect(b.y).toBeGreaterThanOrEqual(0); expect(b.y + b.height).toBeLessThanOrEqual(860);
    }
    // The steps' own pictures are hidden on this layout, and the copies say nothing to screen readers.
    await expect(page.locator('#how-it-works .how-fig').first()).toBeHidden();
    expect(await stage.locator('img').evaluateAll(is => is.every(i => i.alt === ''))).toBe(true);
  }
  expect(errs).toEqual([]);
  await ctx.close();
});

test('the hero layers move at different speeds as the page scrolls', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto('/parents');
  const y = () => page.locator('.how-l').evaluateAll(ls => ls.map(l => new DOMMatrix(getComputedStyle(l).transform).m42));
  const before = await y();
  await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(300);
  const after = await y();
  expect(before.every(v => Math.abs(v) < 1)).toBe(true);
  // Further back moves less: shapes < wide screen < phone, all upward.
  expect(after[0]).toBeLessThan(-1); expect(after[1]).toBeLessThan(after[0]); expect(after[2]).toBeLessThan(after[1]);
  await ctx.close();
});

test('browsers without scroll-driven animations get the parallax from how.js', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  await ctx.addInitScript(() => { const s = CSS.supports.bind(CSS); CSS.supports = (...a) => (/animation-timeline/.test(a.join(':')) ? false : s(...a)); });
  const page = await ctx.newPage(); const errs = errorsOf(page);
  await page.goto('/teachers');
  const art = page.locator('.how-art');
  await expect(art).toHaveClass(/how-par-js/);
  await page.evaluate(() => scrollTo(0, 344)); await page.waitForTimeout(200);
  const p = await art.evaluate(a => +a.style.getPropertyValue('--how-p'));
  expect(p).toBeCloseTo(344 / (860 * 0.8), 2);
  expect(errs).toEqual([]);
  await ctx.close();
});
