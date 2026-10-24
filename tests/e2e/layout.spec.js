// Layout: panels, cards, lists and buttons never touch, on phones, tablets and desktops, in light and dark mode,
// with collapsible sections closed and opened. Uses the demo school seeded by DEMO_TEACHER_PASSWORD (see
// playwright.config.js). scripts/layout-audit.js runs the same check over every page it can reach.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN } from './helpers.js';

const DEMO = 'demo-pass-123';
const VIEWS = [
  { width: 390, height: 844, scheme: 'dark' }, { width: 390, height: 844, scheme: 'light' },
  { width: 820, height: 1180, scheme: 'light' },
  { width: 1280, height: 860, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' },
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
    const page = await ctx.newPage();
    for (const p of paths) {
      await page.goto(p);
      for (const t of await findTouching(page)) problems.push(`${p} @${v.width}/${v.scheme}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      await page.evaluate(() => document.querySelectorAll('details:not(.inline-menu):not(.langpick)').forEach(d => { d.open = true; }));
      for (const t of await findTouching(page)) problems.push(`${p} [opened] @${v.width}/${v.scheme}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
    }
    await ctx.close();
  }
  return [...new Set(problems)];
}

test.describe.configure({ timeout: 240_000 });

test('public pages: nothing touches', async ({ browser }) => {
  const { state, ctx } = await signIn(browser); await ctx.close();
  expect(await checkPages(browser, state, ['/', '/search?q=quiz', '/g/sum-racer', '/login', '/signup', '/safety', '/parents', '/sdk'])).toEqual([]);
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
  const cls = await href(page, '/teach', 'a.classcard');
  const folder = await href(page, '/teach/lessons', 'a.fr-name');
  const editor = await href(page, folder, 'a.fr-name').then(sub => href(page, sub, 'a.lr-main'));
  await ctx.close();
  expect(await checkPages(browser, state, ['/teach', cls, '/teach/lessons', folder, editor])).toEqual([]);
});

test('admin pages: nothing touches', async ({ browser }) => {
  const { page, state, ctx } = await signIn(browser, ADMIN.username, ADMIN.password);
  const school = await href(page, '/admin/schools', 'td a[href^="/school/"]');
  await ctx.close();
  expect(await checkPages(browser, state, ['/admin', '/admin/stats', '/admin/schools', school, `${school}?tab=people`, `${school}?tab=settings`])).toEqual([]);
});
