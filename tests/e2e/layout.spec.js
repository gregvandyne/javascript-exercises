// Layout: panels, cards, lists and buttons never touch and pages never scroll sideways, on phones, tablets, small
// laptops and desktops, in light and dark mode (following the device, and Dark picked on a light device), with collapsible sections closed and opened. Uses the demo school seeded by DEMO_TEACHER_PASSWORD (see
// playwright.config.js). scripts/layout-audit.js runs the same check over every page it can reach.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN, signup, uniq, schoolWithAdmin } from './helpers.js';

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
  expect(await checkPages(browser, state, ['/', '/search?q=quiz', '/g/sum-racer', '/login', '/signup', '/signup?for=kid', '/signup?for=grownup', '/safety', '/parents', '/sdk', '/terms', '/refunds', '/privacy'])).toEqual([]);
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
  // The demo teacher has a long name; the platform admin has the most menu items (Home · Search · Build · Friends ·
  // Schools): together the tightest bars.
  const problems = [];
  for (const [who, pw] of [['DemoTeacher', DEMO], [ADMIN.username, ADMIN.password]]) {
  const { state, ctx } = await signIn(browser, who, pw); await ctx.close();
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
        logo: document.querySelector('.logo-lockup').checkVisibility() ? 'wordmark' : 'mark', name: document.querySelector('.topbar .logo').getAttribute('aria-label'), cut, missing, field,
        links: document.querySelectorAll('.topnav .navlink').length };
    });
    // The mark on phones and beside the menu on small laptops (up to 1000px; up to 1100px with five menu items or more).
    const logo = width <= 600 || (width > 820 && width <= 1000) || (width > 1000 && width <= 1100 && r.links >= 5) ? 'mark' : 'wordmark';
    // The search field, or the round 🔎 button: below 360px, and on small laptops beside four or more menu items (up to
    // 1000px) or five or more (up to 1100px).
    const field = width >= 360 && !(width > 820 && ((width <= 1000 && r.links >= 4) || (width <= 1100 && r.links >= 5)));
    if (r.tight || r.off || r.wide || r.cut || r.missing.length || r.field !== field || r.logo !== logo || r.name !== 'Oomba Academy') problems.push(`${who} ${lang} @${width}: ${JSON.stringify(r)}`);
    await c.close();
  }
  }
  expect(problems).toEqual([]);
});

// Navigation weeks 3–4: a tab bar for each role (billing is off on this server, so no Plans). The phone tab bar at 360px
// and the desktop top bar at 1280px, light and dark, English, Hebrew and Arabic: the right items in order, every label
// on one line and not cut, nothing touching, no sideways scroll.
test('every role\'s tab bar (360) and top bar (1280): the right items, labels fit, nothing touches (light, dark, he, ar)', async ({ browser }) => {
  // A school admin: a new own account, appointed by the platform admin.
  const adm = await signIn(browser, ADMIN.username, ADMIN.password);
  const headCtx = await browser.newContext(); const headPage = await headCtx.newPage();
  const { username: headName } = await signup(headPage, uniq('Head'), 'head-pass-123');
  const school = await schoolWithAdmin(adm.page, headName);
  const headState = await headCtx.storageState(); await headCtx.close(); await adm.ctx.close();
  const kidCtx = await browser.newContext(); const kidPage = await kidCtx.newPage();
  await signup(kidPage, uniq('Kid')); const kidState = await kidCtx.storageState(); await kidCtx.close();
  const state = async (u, pw) => { const x = await signIn(browser, u, pw); await x.ctx.close(); return x.state; };
  const ROLES = [
    ['signed out', undefined, ['/', '/search', '/build', '/parents', '/login'], ['/', '/build', '/parents', '/teachers'], ['/', '/login']],
    ['kid', kidState, ['/', '/search', '/build', '/friends', '/me'], ['/', '/search', '/build', '/friends'], ['/', '/me']],
    ['student', await state('DemoStudent', DEMO), ['/', '/classes', '/build', '/friends', '/me'], ['/', '/classes', '/build', '/friends'], ['/classes', '/me']],
    ['teacher', await state('DemoTeacher', DEMO), ['/teach', '/', '/me'], ['/teach', '/'], ['/teach', '/me']],
    ['school admin', headState, ['/teach', '/', '/school', '/me'], ['/teach', '/', '/school'], ['/teach', `/school/${school.slug}?tab=people`, '/me']],
    ['platform admin', await state(ADMIN.username, ADMIN.password), ['/', '/search', '/build', '/friends', '/admin/schools', '/me'], ['/', '/search', '/build', '/friends', '/admin/schools'], ['/', '/me']],
  ];
  const problems = [];
  for (const [who, st, tabs, top, pages] of ROLES) {
    for (const [width, scheme, lang] of [[360, 'light', 'en'], [360, 'dark', 'he'], [360, 'light', 'ar'], [1280, 'dark', 'en'], [1280, 'light', 'he'], [1280, 'dark', 'ar']]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: scheme, storageState: st });
      await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
      const page = await ctx.newPage();
      for (const p of pages) {
        await page.goto(p); await page.evaluate(() => document.fonts.ready);
        const r = await page.evaluate(() => {
          const vis = e => e.checkVisibility();
          const tabs = [...document.querySelectorAll('.tabbar .tab')];
          return {
            tabs: tabs.map(t => t.getAttribute('href')), tabsShown: tabs.some(vis),
            top: [...document.querySelectorAll('.topnav .navlink')].map(a => a.getAttribute('href')), topShown: [...document.querySelectorAll('.topnav .navlink')].some(vis),
            cut: tabs.filter(t => vis(t) && t.scrollWidth > t.clientWidth + 1).map(t => t.textContent.trim()),
            wrapped: tabs.filter(vis).map(t => t.querySelector('.tab-t')).filter(l => l && l.getBoundingClientRect().height > parseFloat(getComputedStyle(l).lineHeight || '0') * 1.5 + 1).map(l => l.textContent.trim()),
            search: vis(document.querySelector('#topq')) || vis(document.querySelector('.topsearch-btn')),
            wide: document.documentElement.scrollWidth - innerWidth,
          };
        });
        const at = `${who} ${p} @${width}/${scheme}/${lang}`;
        if (JSON.stringify(r.tabs) !== JSON.stringify(tabs)) problems.push(`${at}: tabs ${r.tabs.join(' ')}`);
        if (JSON.stringify(r.top) !== JSON.stringify(top)) problems.push(`${at}: top ${r.top.join(' ')}`);
        if (width === 360 && (!r.tabsShown || r.topShown)) problems.push(`${at}: the phone shows the top menu instead of the tab bar`);
        if (width === 1280 && (r.tabsShown || !r.topShown)) problems.push(`${at}: the desktop shows the tab bar`);
        if (r.cut.length) problems.push(`${at}: cut off ${r.cut.join(', ')}`);
        if (r.wrapped.length) problems.push(`${at}: label on two lines ${r.wrapped.join(', ')}`);
        if (!r.search) problems.push(`${at}: no search in the top bar`);
        if (r.wide > 1) problems.push(`${at}: scrolls sideways ${r.wide}px`);
        for (const t of await findTouching(page)) problems.push(`${at}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      }
      await ctx.close();
    }
  }
  expect(problems).toEqual([]);
});
