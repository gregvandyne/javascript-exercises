// Doors for grown-ups: signed out and as a guest (after one tap on Play) the phone tab bar is Home · Search · Build ·
// Grown-ups · (Plans) · Sign in, every label fits at 360px in English, German and Hebrew, light and dark; the desktop
// bar keeps Parents and Teachers; the new pages (/learn, a grown-up's /build) have nothing touching and no sideways scroll.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';

test.describe.configure({ timeout: 180_000 });

async function guestContext(browser, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  await page.goto('/');
  const r = await page.evaluate(() => fetch('/api/auth/guest', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(x => x.status));
  expect(r).toBe(200);
  await page.close();
  return ctx;
}

test('signed out and as a guest: Grown-ups tab, no Friends; the labels fit at 360px (en, de, he; light, dark)', async ({ browser }) => {
  const problems = [];
  for (const who of ['signed out', 'guest']) {
    for (const [lang, scheme] of [['en', 'light'], ['de', 'dark'], ['he', 'light'], ['en', 'dark']]) {
      const opts = { viewport: { width: 360, height: 760 }, colorScheme: scheme };
      const ctx = who === 'guest' ? await guestContext(browser, opts) : await browser.newContext(opts);
      await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
      const page = await ctx.newPage();
      for (const p of ['/', '/g/sum-racer', '/parents', '/learn']) {
        await page.goto(p); await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(() => {
          const tabs = [...document.querySelectorAll('.tabbar .tab')];
          return {
            hrefs: tabs.map(t => t.getAttribute('href')),
            cut: tabs.filter(t => t.scrollWidth > t.clientWidth + 1).map(t => t.textContent.trim()),
            // Every label on one line (a label that wraps lifts its icon above the others).
            wrapped: tabs.map(t => t.querySelector('.tab-t')).filter(l => l && l.getBoundingClientRect().height > parseFloat(getComputedStyle(l).lineHeight || '0') * 1.5 + 1).map(l => l.textContent.trim()),
            icons: tabs.map(t => `${t.getAttribute('href')}:${Math.round(t.querySelector('.emo').getBoundingClientRect().top)}`),
            wide: document.documentElement.scrollWidth - innerWidth,
            intro: !!document.querySelector('.home-intro'),
            footTeachers: !!document.querySelector('footer.foot a[href="/teachers"]'),
          };
        });
        const want = ['/', '/search', '/build', '/parents', '/login'];
        if (JSON.stringify(r.hrefs.filter(h => h !== '/plans')) !== JSON.stringify(want)) problems.push(`${who} ${lang} ${p}: tabs ${r.hrefs.join(' ')}`);
        if (r.cut.length) problems.push(`${who} ${lang} ${p}: cut off ${r.cut.join(', ')}`);
        if (r.wrapped.length) problems.push(`${who} ${lang} ${p}: label on two lines ${r.wrapped.join(', ')}`);
        const tops = r.icons.map(x => +x.split(':').pop());   // the current tab's icon is scaled up a little: 3px slack
        if (lang === 'en' && Math.max(...tops) - Math.min(...tops) > 3) problems.push(`${who} ${lang} ${p}: tab icons at different heights ${r.icons.join(' ')}`);
        if (r.wide > 1) problems.push(`${who} ${lang} ${p}: scrolls sideways ${r.wide}px`);
        if (!r.footTeachers) problems.push(`${who} ${lang} ${p}: no Teachers link in the footer`);
        if (p === '/' && !r.intro) problems.push(`${who} ${lang}: no home intro`);
        for (const t of await findTouching(page)) problems.push(`${who} ${lang} ${p}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      }
      // Grown-ups is the current tab on the parent page.
      await page.goto('/parents');
      await expect(page.locator('.tabbar .tab[href="/parents"]')).toHaveAttribute('aria-current', 'page');
      await ctx.close();
    }
  }
  expect(problems).toEqual([]);
});

test('desktop, signed out and as a guest: Parents and Teachers in the top bar, no Friends', async ({ browser }) => {
  for (const who of ['signed out', 'guest']) {
    const opts = { viewport: { width: 1280, height: 860 } };
    const ctx = who === 'guest' ? await guestContext(browser, opts) : await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('.topnav a[href="/parents"]')).toBeVisible();
    await expect(page.locator('.topnav a[href="/teachers"]')).toBeVisible();
    await expect(page.locator('.topnav a[href="/friends"]')).toHaveCount(0);
    await expect(page.locator('.home-intro')).toBeVisible();
    await ctx.close();
  }
});

test('the new and changed pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  const problems = [];
  for (const [width, scheme, lang] of [[360, 'light', 'en'], [360, 'dark', 'en'], [1280, 'dark', 'en'], [360, 'light', 'he'], [1280, 'light', 'he']]) {
    const ctx = await guestContext(browser, { viewport: { width, height: 800 }, colorScheme: scheme });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of ['/learn', '/learn/math-games', '/learn/games-for-8-and-9-year-olds', '/g/sum-racer', '/parents', '/safety', '/login', '/signup']) {
      await page.goto(p);
      for (const t of await findTouching(page)) problems.push(`${p} @${width}/${scheme}/${lang}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${width}/${lang}: scrolls sideways by ${wide}px`);
    }
    // Signed out (no guest) /login and /signup show "Grown-up or teacher?".
    await ctx.clearCookies();
    await page.goto('/login');
    await expect(page.locator('.grownup-line a[href="/teachers"]')).toBeVisible();
    await ctx.close();
  }
  // The landing pages in the languages with the longest button labels: no sideways scroll at 360px.
  for (const lang of ['de', 'pt', 'nl', 'it', 'es', 'fr']) {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of ['/teachers', '/parents']) {
      await page.goto(p);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @360/${lang}: scrolls sideways by ${wide}px`);
    }
    await ctx.close();
  }
  expect(problems).toEqual([]);
});
