// The admin pages on phones (public/css/admin.css, server/views/admin-ui.js): at 360×640 and 390×844, in light and dark,
// no page scrolls sideways, nothing touches, every button, field, folded section and menu link is a 44 px tap target, and
// everything the pages showed before the phone layout is still in the page (docs: the admin "nothing lost" inventory).
// Desktop keeps every tab in view. The demo school (DEMO_TEACHER_PASSWORD in playwright.config.js) gives the pages content.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { ADMIN, login } from './helpers.js';

const PHONES = [{ width: 360, height: 640, scheme: 'light' }, { width: 360, height: 640, scheme: 'dark' }, { width: 390, height: 844, scheme: 'light' }];
const TABS = ['queue', 'reports', 'chat', 'links', 'live', 'schoolreq', 'people', 'users', 'messages', 'searches', 'audit'];
const PAGES = [...TABS.map(k => `/admin?tab=${k}`), '/admin?tab=newusers', '/admin?tab=users&username=DemoStudent', '/admin?tab=users&username=DemoTeacher',
  '/admin/messages/DemoStudent', '/admin/stats', '/admin/billing', '/admin/schools', '/admin/voices'];

test.describe.configure({ timeout: 300_000 });

let state;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  // A conversation with the team, so the inbox and the thread have rows.
  await page.goto('/admin?tab=users&username=DemoStudent');
  const id = await page.locator('[data-act="ban"]').getAttribute('data-id');
  const r = await page.evaluate(async id => (await fetch(`/api/admin/users/${id}/message`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Hello from the team (admin-mobile test)' }) })).status, id);
  expect(r).toBe(200);
  state = await ctx.storageState(); await ctx.close();
});

/** Tap targets under 44 px among the controls a person uses (inline links inside sentences and chart bars are not controls). */
const smallTargets = page => page.evaluate(() => {
  const sel = 'main .btn, main select, main textarea, main input:not([type=checkbox]):not([type=radio]):not([type=hidden]), main summary, main .chip, main .checkline, main .tv-onl, .adminnav a, .adminnav-sum, main .nu-who';
  return [...document.querySelectorAll(sel)].filter(el => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return false;
    return r.height < 43.5;
  }).map(el => `${el.tagName.toLowerCase()}.${el.className} "${(el.textContent || el.getAttribute('aria-label') || el.name || '').trim().slice(0, 30)}" ${Math.round(el.getBoundingClientRect().height)}px`);
});

test('admin pages on phones: no sideways scroll, nothing touches, 44 px targets', async ({ browser }) => {
  const problems = [];
  for (const v of PHONES) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state, hasTouch: true });
    const page = await ctx.newPage();
    for (const p of PAGES) {
      await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}`;
      // The section menu folds on phones; open it so its links are measured too.
      const toggle = page.locator('.adminnav-sum');
      if (await toggle.count()) { await toggle.click(); await expect(page.locator('.adminnav a[aria-current="page"]')).toBeVisible(); }
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${at}: scrolls sideways by ${wide}px`);
      // Only the tv-grid may keep an inner scroller on wide screens; on phones no table hides columns.
      const hidden = await page.evaluate(() => [...document.querySelectorAll('main .tblwrap')].filter(w => w.scrollWidth > w.clientWidth + 1).map(w => w.className));
      if (hidden.length) problems.push(`${at}: a table scrolls inside its box: ${hidden.join(', ')}`);
      for (const s of await smallTargets(page)) problems.push(`${at}: small target ${s}`);
      // Every folded section shows that it opens: a + / − marker at the end of its row.
      const unmarked = await page.evaluate(() => [...document.querySelectorAll('main details>summary:not(.btn)')].filter(el => el.getBoundingClientRect().height
        && !/^"[+−]"$/.test(getComputedStyle(el, '::after').content)).map(el => el.textContent.trim().slice(0, 30)));
      for (const u of unmarked) problems.push(`${at}: folded section without a marker "${u}"`);
      for (const t of await findTouching(page)) problems.push(`${at}: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
      await page.evaluate(() => document.querySelectorAll('main details').forEach(d => { d.open = true; }));
      for (const t of await findTouching(page)) problems.push(`${at} [opened]: ${t.a} ⟷ ${t.b} (${t.dir} ${t.gap}px)`);
    }
    await ctx.close();
  }
  expect([...new Set(problems)]).toEqual([]);
});

test('admin pages keep every item: shortcuts, all tabs, filters, CSV, forms and sections', async ({ browser }) => {
  for (const viewport of [{ width: 360, height: 640 }, { width: 1366, height: 768 }]) {
    const ctx = await browser.newContext({ viewport, storageState: state });
    const page = await ctx.newPage();
    const has = async (sel, n = 1) => expect(page.locator(sel), `${page.url()} @${viewport.width}: ${sel}`).toHaveCount(n);
    const text = async (...words) => { const t = await page.locator('main').innerText(); for (const w of words) expect(t, `${page.url()} @${viewport.width}`).toContain(w); };

    await page.goto('/admin?tab=queue');
    for (const h of ['/admin?tab=queue', '/admin/stats', '/admin/schools', '/admin/billing', '/admin/voices']) await has(`.adminhead a[href="${h}"]`);
    await expect(page.locator('section[aria-label="AI spending"]')).toContainText(/today \$[\d.]+ of \$[\d.]+ \(\d+ calls\)/);
    await expect(page.locator('section[aria-label="AI spending"]')).toContainText(/this month \$[\d.]+ of \$[\d.]+/);
    for (const k of TABS) await has(`nav.tabs[aria-label="Admin sections"] a[href="/admin?tab=${k}"]`);
    await has('.adminnav a[aria-current="page"]');
    // Phones: the menu is folded under the current tab; desktop: every tab shows, none hidden in a scroller.
    if (viewport.width < 600) {
      await expect(page.locator('.adminnav-sum')).toContainText('Review queue');
      await expect(page.locator('.adminnav a[href="/admin?tab=audit"]')).toBeHidden();
      await page.locator('.adminnav-sum').click();
    } else await expect(page.locator('.adminnav-sum')).toBeHidden();
    for (const k of TABS) {
      const a = page.locator(`.adminnav a[href="/admin?tab=${k}"]`);
      // Phones: open, every link shows (the list may run below the fold); desktop: all on screen, none scrolled out of view.
      if (viewport.width < 600) await expect(a).toBeVisible(); else await expect(a).toBeInViewport();
    }

    // All users: search, Show and CSV in view; the other filters folded (open on desktop); quick views; every sort column.
    await page.goto('/admin?tab=people');
    for (const n of ['q', 'type', 'active', 'joined', 'from', 'to', 'sort', 'dir']) await has(`form.nu-form [name="${n}"]`);
    await expect(page.locator('form.nu-form button[type=submit]', { hasText: 'Show' })).toBeVisible();
    const csv = page.locator('a[href^="/admin/users.csv"]');
    await expect(csv).toBeVisible();
    const res = await page.request.get(await csv.getAttribute('href'));
    expect(res.status()).toBe(200); expect(res.headers()['content-disposition']).toMatch(/attachment; filename="oomba-users-/);
    expect(await page.locator('details.nu-more').evaluate(d => d.open)).toBe(viewport.width > 900);
    await has('.nu-quick a.chip', 8);
    await has('.nu-table th a.sorth', 13);
    await text('Accounts', 'Active today', 'New, last 7 days', 'New, last 30 days', 'Sign-ups per day', 'Guests are not listed');
    for (const l of ['Type', 'Joined', 'Last login', 'Last active', 'Days active', 'Played', 'Built', 'AI messages', 'Course steps', 'Live games', 'Plays of their games', 'Status']) await expect(page.locator(`.nu-table td[data-label="${l}"]`).first()).toBeAttached();

    // A person: the actions are right under their name, then the facts, activity, games and audit.
    await page.goto('/admin?tab=users&username=DemoStudent');
    await expect(page.locator('.uacts a', { hasText: 'Message' })).toBeVisible();
    await expect(page.locator('.uacts a', { hasText: 'View profile' })).toBeVisible();
    await expect(page.locator('.uacts [data-act="ban"]')).toBeVisible();
    for (const th of ['Account type', 'Site role', 'Schools', 'Family', 'Created', 'Last seen', 'Games', 'Friends', 'Chat', 'Reports']) await has(`.afacts th:text-is("${th}")`);
    await text('📈 Activity', 'Plays per day', 'AI Builder messages per day', 'Days active', 'Games they play most', 'Courses', 'Recent activity');

    // Team inbox: conversations first, then announcements, then the three welcome messages.
    await page.goto('/admin?tab=messages');
    const order = await page.evaluate(() => ['#conv-h', '#ann-h', '#wel-h'].map(s => document.querySelector(s).getBoundingClientRect().top));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    await has('#announce'); await has('.inboxrow', 1);
    for (const w of ['kid', 'grownup', 'teacher']) { await has(`#wel-${w} textarea[name="text"]`); await has(`#wel-${w} input[name="on"]`); }
    await text('Welcome message for new kids', 'Welcome message for new parents', 'Welcome message for new teachers and school staff');

    await page.goto('/admin?tab=searches');
    await has('a[href="/admin?tab=searches"]', 2); await has('a[href="/admin?tab=searches&flagged=1"]'); await text('BUILDER_WEB_SEARCH', 'kept 90 days');
    await page.goto('/admin?tab=audit');
    for (const h of ['When', 'Who', 'What', 'Target', 'Details']) await has(`table.alog th:text-is("${h}")`);

    await page.goto('/admin/messages/DemoStudent');
    await has('#dm textarea'); await has('a[href="/admin?tab=users&username=DemoStudent"]'); await text('Hello from the team (admin-mobile test)');

    await page.goto('/admin/stats');
    for (const id of ['st-today', 'st-active', 'st-cost', 'funnels', 'st-days', 'st-top']) await has(`#${id}`);
    await has('.ajump a', 6); await has('.charts .chart', 8);
    await expect(page.locator('#funnel-parent ~ .tblwrap tbody tr').first()).toBeAttached();
    await text('Most played, last 7 days', 'All-time favourites', 'Top builders', 'Where people go', 'AI by model', 'Most active, last 7 days', 'Newest accounts');

    await page.goto('/admin/billing');
    for (const id of ['requests', 'unpaid', 'b-subs', 'b-problems', 'b-webhooks']) await has(`section#${id}`);
    await has('select[name="status"]'); await has('select[name="flag"]');
    // The two sections that need action come before the long lists.
    const top = s => page.locator(s).evaluate(e => e.getBoundingClientRect().top);
    expect(await top('#requests')).toBeLessThan(await top('#b-subs'));
    expect(await top('#unpaid')).toBeLessThan(await top('#b-subs'));

    await page.goto('/admin/schools');
    await has('form[data-api="/api/admin/schools"]'); await expect(page.locator('main table tbody tr').first()).toBeVisible();

    await page.goto('/admin/voices');
    await expect(page.locator('table.tv-grid thead th').first()).toBeAttached();
    expect(await page.locator('table.tv-grid tbody tr[data-locale]').count()).toBeGreaterThan(5);
    await expect(page.locator('table.tv-grid [data-narrator]').first()).toBeVisible();
    await has('.tv-roles select', 5); await has('#tv-form button[type=submit]'); await has('#tv-game-add'); await has('#tv-warm');
    if (viewport.width < 600) await expect(page.locator('table.tv-grid [data-play-narrator]').first()).toBeVisible();
    else await expect(page.locator('table.tv-grid [data-play]').first()).toBeVisible();
    await ctx.close();
  }
});
