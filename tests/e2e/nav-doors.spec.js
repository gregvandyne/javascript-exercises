// Doors for grown-ups: signed out and as a guest (after one tap on Play) the phone tab bar is Home · Search · Build ·
// Grown-ups · (Plans) · Sign in, every label fits at 360px in English, German and Hebrew, light and dark; the desktop
// bar keeps Parents and Teachers; the new pages (/learn, a grown-up's /build) have nothing touching and no sideways scroll.
// Week 2: the home doors (the kid's scrolls down to the games, #play, so a game is two taps away) and the signed-out
// top bar with ▶ Play now (to the home page's #play), which fits.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { gameFrame } from './helpers.js';
import { topbarFit } from './topbar-fit.js';

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
    for (const [lang, scheme] of [['en', 'light'], ['de', 'dark'], ['he', 'light'], ['en', 'dark'], ['ar', 'dark']]) {
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
    // Week 2: Home · Build · Parents · Teachers (Plans when billing is public), Sign in, then ▶ Play now; the search field stays.
    expect(await page.locator('.topnav .navlink').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/', '/build', '/parents', '/teachers']);
    await expect(page.locator('.topbar .playnow')).toBeVisible();
    await expect(page.locator('#topq')).toBeVisible();
    const doors = page.locator('.home-intro .doors .door');
    await expect(doors).toHaveCount(3);
    await expect(doors.first()).toContainText('I’m a kid — play now');
    // Wide screens: one row of doors, the kid's first (on the reading side) and widest.
    const boxes = await doors.evaluateAll(l => l.map(d => d.getBoundingClientRect()).map(r => ({ top: Math.round(r.top), w: r.width })));
    expect(new Set(boxes.map(b => b.top)).size).toBe(1);
    expect(boxes[0].w).toBeGreaterThan(boxes[1].w);
    await ctx.close();
  }
});

/** #play (the featured game and the rows) has been scrolled to: its top sits just under the sticky top bar (the page's
 *  scroll-padding), it stays put (the smooth scroll is over), and the hero's Play button is on screen, not under the bar. */
async function atPlay(page) {
  const at = () => page.evaluate(() => {
    const play = document.getElementById('play').getBoundingClientRect().top;
    const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
    const bar = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
    const btn = document.querySelector('#play .hero a.btn-big').getBoundingClientRect();
    return { off: Math.round(Math.abs(play - pad)), y: Math.round(scrollY), under: btn.top < bar, out: btn.bottom > innerHeight };
  });
  await expect.poll(async () => { const a = await at(); await page.waitForTimeout(150); const b = await at(); return a.y === b.y && b.off <= 2; }, { timeout: 5000 }).toBe(true);
  const r = await at();
  expect(r.y).toBeGreaterThan(0);
  expect(r.under || r.out, 'the hero Play button is on screen, clear of the top bar').toBe(false);
  await expect(page.locator('#play .hero a.btn-big')).toBeInViewport();
  expect(new URL(page.url()).hash).toBe('#play');
}

test('the kid door scrolls down to the featured game and the rows (#play), counted; one more tap plays; nobody signs up', async ({ browser }) => {
  for (const [who, width] of [['signed out', 390], ['guest', 1280], ['signed out', 1280], ['guest', 390]]) {
    const opts = { viewport: { width, height: 800 } };
    const ctx = who === 'guest' ? await guestContext(browser, opts) : await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto('/');
    expect(await page.evaluate(() => scrollY)).toBe(0);
    const kid = page.locator('.door-kid');
    await expect(kid).toBeInViewport();   // on the first screen, phone too
    await expect(kid).toHaveAttribute('href', '#play');
    const beacon = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/go/kid');
    await kid.click();
    await beacon;
    await atPlay(page);
    expect(new URL(page.url()).pathname, 'the same page, not a game').toBe('/');
    if (process.env.BRB_SNAPSHOTS) await page.screenshot({ path: test.info().outputPath(`kid-door-${width}-${who.replace(' ', '-')}.png`) });
    // Two taps from home to a game, no sign-up.
    await Promise.all([page.waitForURL(/\/play\/[a-z0-9-]+$/), page.locator('#play .hero a.btn-big').click()]);
    await gameFrame(page);
    // The parent and teacher doors open their pages.
    await page.goto('/');
    await Promise.all([page.waitForURL(/\/parents$/), page.locator('.door-parent').click()]);
    await page.goto('/');
    await Promise.all([page.waitForURL(/\/teachers$/), page.locator('.door-teacher').click()]);
    // From another page, the top bar's Play now lands on the home page at #play (desktop; phones hide it).
    if (width > 820) {
      const b = page.waitForRequest(r => r.method() === 'POST' && new URL(r.url()).pathname === '/go/play');
      await Promise.all([page.waitForURL(u => u.pathname === '/' && u.hash === '#play'), page.locator('.topbar .playnow').click()]);
      await b;
      await atPlay(page);
      // On the home page itself it scrolls there too.
      await page.evaluate(() => { history.replaceState(null, '', '/'); scrollTo(0, 0); });
      await page.locator('.topbar .playnow').click();
      await atPlay(page);
    } else await expect(page.locator('.topbar .playnow')).toBeHidden();
    await ctx.close();
  }
});

test('Play now on a language page leads to that language\'s home page at #play', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.goto('/de/teachers');
  await expect(page.locator('.topbar .playnow')).toHaveAttribute('href', '/de#play');
  await Promise.all([page.waitForURL(u => u.pathname === '/de' && u.hash === '#play'), page.locator('.topbar .playnow').click()]);
  await atPlay(page);
  await ctx.close();
});

test('signed out, the top bar fits from small laptops to wide screens (en, de, ru; signed out and guest)', async ({ browser }) => {
  const problems = [];
  for (const who of ['signed out', 'guest']) for (const lang of ['en', 'de', 'ru']) for (const width of [821, 900, 1000, 1024, 1101, 1181, 1280, 1440]) {
    const opts = { viewport: { width, height: 700 } };
    const ctx = who === 'guest' ? await guestContext(browser, opts) : await browser.newContext(opts);
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    await page.goto('/safety'); await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(topbarFit);
    if (r.tight || r.off || r.wide > 0 || r.cut || r.missing.length) problems.push(`${who} ${lang} @${width}: ${JSON.stringify(r)}`);
    await ctx.close();
  }
  expect(problems).toEqual([]);
});

test('the new and changed pages: nothing touches, no sideways scroll (360 / 1280, light / dark, he)', async ({ browser }) => {
  const problems = [];
  for (const [width, scheme, lang] of [[360, 'light', 'en'], [360, 'dark', 'en'], [1280, 'dark', 'en'], [360, 'light', 'he'], [1280, 'light', 'he']]) {
    const ctx = await guestContext(browser, { viewport: { width, height: 800 }, colorScheme: scheme });
    await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of ['/', '/learn', '/learn/math-games', '/learn/games-for-8-and-9-year-olds', '/g/sum-racer', '/parents', '/safety', '/login', '/signup']) {
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
