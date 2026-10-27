// Layout: panels, cards, lists and buttons never touch and pages never scroll sideways, on phones, tablets, small
// laptops and desktops, in light and dark mode (following the device, and Dark picked on a light device), with collapsible sections closed and opened. Uses the demo school seeded by DEMO_TEACHER_PASSWORD (see
// playwright.config.js). scripts/layout-audit.js runs the same check over every page it can reach.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN } from './helpers.js';

const DEMO = 'demo-pass-123';
const VIEWS = [
  { width: 390, height: 844, scheme: 'dark' }, { width: 390, height: 844, scheme: 'light' },
  { width: 820, height: 1180, scheme: 'light' }, { width: 1024, height: 768, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' },
  { width: 390, height: 844, scheme: 'light', theme: 'dark' },
];

async function signIn(browser, username, password) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (username) {
    await page.goto('/login'); await page.fill('#username', username); await page.fill('#password', password);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  }
  return { ctx, page, state: await ctx.storageState() };
}
const href = async (page, url, selector) => {
  await page.goto(url);
  const u = new URL(await page.locator(selector).first().getAttribute('href'), page.url());
  return u.pathname + u.search;
};

async function checkPages(browser, state, paths) {
  const problems = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    if (v.theme) await ctx.addCookies([{ name: 'theme', value: v.theme, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(p);
      for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.theme || v.scheme}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${p} @${v.width}: the page scrolls sideways by ${wide}px`);
      await page.evaluate(() => document.querySelectorAll('details:not(.inline-menu):not(.langpick):not(.themepick)').forEach(d => { d.open = true; }));
      for (const t of await findTouching(page)) problems.push(`${p} [opened] @${v.width}/${v.theme || v.scheme}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
    }
    await ctx.close();
  }
  return [...new Set(problems)];
}

test.describe.configure({ timeout: 240_000 });

test('public pages: nothing touches', async ({ browser }) => {
  const { state, ctx } = await signIn(browser); await ctx.close();
  expect(await checkPages(browser, state, ['/', '/search?q=quiz', '/g/sum-racer', '/login', '/signup', '/safety', '/parents', '/sdk', '/terms', '/refunds', '/privacy'])).toEqual([]);
});

test('student pages: nothing touches', async ({ browser }) => {
  const { page, state, ctx } = await signIn(browser, 'DemoStudent', DEMO);
  const cls = await href(page, '/classes', 'a.classcard');
  const lesson = await href(page, cls, 'a.cl-main');
  await ctx.close();
  expect(await checkPages(browser, state, ['/me', '/classes', cls, lesson, '/build', '/friends', '/favorites', '/u/DemoStudent'])).toEqual([]);
});

test('teacher pages: nothing touches', async ({ browser }) => {
  const { page, state, ctx } = await signIn(browser, 'DemoTeacher', DEMO);
  const cls = await href(page, '/teach', 'a.cc-link');
  const folder = await href(page, '/teach/lessons', 'a.fr-name');
  const editor = await href(page, folder, 'a.fr-name').then(sub => href(page, sub, 'a.lr-main'));
  await ctx.close();
  expect(await checkPages(browser, state, ['/teach', cls, `${cls}?tab=games`, `${cls}?tab=students`, `${cls}?tab=settings`, `${cls}/progress`, '/teach/lessons', folder, editor])).toEqual([]);
});

test('admin pages: nothing touches', async ({ browser }) => {
  const { page, state, ctx } = await signIn(browser, ADMIN.username, ADMIN.password);
  const school = await href(page, '/admin/schools', 'td a[href^="/school/"]');
  await ctx.close();
  expect(await checkPages(browser, state, ['/admin', '/admin/stats', '/admin/schools', school, `${school}?tab=people`, `${school}?tab=settings`])).toEqual([]);
});

test('the top bar fits the logo, search, the language and theme menus and the Me button in English, German and Russian', async ({ browser }) => {
  // The demo teacher has the most nav items (Classes) and a long name: the tightest bar.
  const { state, ctx } = await signIn(browser, 'DemoTeacher', DEMO); await ctx.close();
  const problems = [];
  for (const lang of ['en', 'de', 'ru']) for (const width of [320, 360, 390, 820, 1024, 1280]) {
    const c = await browser.newContext({ viewport: { width, height: 700 }, storageState: state });
    await c.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await c.newPage();
    await page.goto('/safety'); await page.evaluate(() => document.fonts.ready);
    const r = await page.evaluate(() => {
      const items = [...document.querySelector('.topbar').children].filter(e => e.checkVisibility() && !e.classList.contains('skip'))
        .map(e => e.getBoundingClientRect()).sort((a, b) => a.left - b.left);
      const nav = [...document.querySelectorAll('.topnav .navlink')].filter(e => e.checkVisibility()).map(e => e.getBoundingClientRect());
      // The search placeholder (the long one, or the short one app.js swaps in) is never cut off. Below 360px the field is
      // a round button to the search page instead.
      const q = document.querySelector('#topq'), cs = getComputedStyle(q), cx = document.createElement('canvas').getContext('2d');
      cx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const field = q.checkVisibility();
      const cut = field && cx.measureText(q.placeholder).width > q.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      const missing = ['.topbar .langpick > summary', '.topbar .themepick > summary', '.topbar .me-btn', field ? '#topq' : '.topsearch-btn']
        .filter(s => !document.querySelector(s).checkVisibility());
      return { tight: items.slice(1).some((b, i) => b.left - items[i].right < 4) || nav.slice(1).some((b, i) => b.left - nav[i].right < 2),
        off: items.some(b => b.left < 0 || b.right > innerWidth), wide: document.documentElement.scrollWidth - innerWidth,
        logo: document.querySelector('.logo-lockup').checkVisibility() ? 'wordmark' : 'mark', name: document.querySelector('.topbar .logo').getAttribute('aria-label'), cut, missing, field };
    });
    // The mark on phones and beside the full nav on small laptops (up to 1100px with five nav items, as here).
    const logo = width <= 600 || (width > 820 && width <= 1100) ? 'mark' : 'wordmark';
    if (r.tight || r.off || r.wide || r.cut || r.missing.length || r.field !== width >= 360 || r.logo !== logo || r.name !== 'Oomba Academy') problems.push(`${lang} @${width}: ${JSON.stringify(r)}`);
    await c.close();
  }
  expect(problems).toEqual([]);
});
