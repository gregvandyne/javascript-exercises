// Play and Learn (docs/decisions.md "Play and Learn"): the two shelves of the library and each role's first tab, on
// phones (360, 390) and desktop (1280), light and dark, and in Hebrew (right to left). No sideways scroll, nothing
// touches (touching.js), every control a 44 px tap target, the top bar fits (topbar-fit.js); the Learn filters work as
// plain links and with the grade picker; staff see Assign, Host live and Try it, a kid and a student never do; a teacher
// assigns a game and their student finds it in their class. Uses the demo school (DemoTeacher, DemoStudent).
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { topbarFit } from './topbar-fit.js';
import { signup, ownIp } from './helpers.js';

const DEMO = 'demo-pass-123';
const VIEWS = [
  { width: 360, height: 740, scheme: 'light' }, { width: 360, height: 740, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
];
test.describe.configure({ timeout: 300_000 });

async function stateFor(browser, who) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await ownIp(page);
  if (who === 'kid') await signup(page);
  else if (who) {
    await page.goto('/login'); await page.fill('#username', who); await page.fill('#password', DEMO);
    await Promise.all([page.waitForURL(u => !u.pathname.startsWith('/login')), page.click('button[type=submit]')]);
  }
  const state = await ctx.storageState(); await ctx.close();
  return state;
}
/** Controls under 44 px in the page (links inside sentences are not controls), and the tab bar's tabs. */
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('main .btn, main select, main input:not([type=hidden]), main .chip, .tabbar .tab')]
  .filter(e => e.checkVisibility()).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`));

async function check(browser, state, paths, { lang = null } = {}) {
  const problems = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of paths) {
      const r = await page.goto(p);
      if (!r.ok()) { problems.push(`${p}: ${r.status()}`); continue; }
      const at = `${p} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      for (const t of await findTouching(page)) problems.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) problems.push(`${at}: scrolls sideways by ${wide}px`);
      for (const s of await smallTargets(page)) problems.push(`${at}: small target ${s}`);
      if (v.width > 820) {
        const fit = await page.evaluate(topbarFit);
        if (fit.tight || fit.off || fit.missing.length || fit.wide > 1) problems.push(`${at}: top bar does not fit ${JSON.stringify(fit)}`);
      }
    }
    await ctx.close();
  }
  return [...new Set(problems)];
}

test('Play and Learn for the signed out, a kid, a student and a teacher: no sideways scroll, nothing touches, 44 px targets', async ({ browser }) => {
  const out = await stateFor(browser, null), kid = await stateFor(browser, 'kid');
  const student = await stateFor(browser, 'DemoStudent'), teacher = await stateFor(browser, 'DemoTeacher');
  expect(await check(browser, out, ['/', '/play', '/learn', '/learn?subject=math', '/learn?how=live'])).toEqual([]);
  expect(await check(browser, kid, ['/', '/learn', '/learn?grade=K'])).toEqual([]);
  expect(await check(browser, student, ['/play', '/learn'])).toEqual([]);
  expect(await check(browser, teacher, ['/play', '/learn', '/learn?how=live', '/teach/assign?game=sum-racer'])).toEqual([]);
  expect(await check(browser, teacher, ['/learn', '/play'], { lang: 'he' })).toEqual([]);
  expect(await check(browser, kid, ['/', '/learn'], { lang: 'he' })).toEqual([]);
});

test('the tab bars: each role\'s first tab, five tabs, Play and Learn shared; \'/\' lands on the first tab', async ({ browser }) => {
  const tabs = async (state, path) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state }); const page = await ctx.newPage();
    await page.goto(path);
    const r = { url: new URL(page.url()).pathname, tabs: await page.locator('.tabbar a.tab').evaluateAll(a => a.map(x => x.getAttribute('href'))),
      cur: await page.locator('.tabbar a.tab[aria-current="page"]').evaluateAll(a => a.map(x => x.getAttribute('href'))) };
    await ctx.close(); return r;
  };
  const off = l => l.filter(h => h !== '/plans');
  const out = await tabs(await stateFor(browser, null), '/');
  expect(out.url).toBe('/'); expect(off(out.tabs)).toEqual(['/', '/learn', '/build', '/parents', '/login']); expect(out.cur).toEqual(['/']);
  const kid = await tabs(await stateFor(browser, 'kid'), '/');
  expect(kid.url).toBe('/'); expect(off(kid.tabs)).toEqual(['/', '/learn', '/build', '/friends', '/me']);
  const st = await tabs(await stateFor(browser, 'DemoStudent'), '/');
  expect(st.url).toBe('/classes'); expect(off(st.tabs)).toEqual(['/classes', '/play', '/learn', '/build', '/me']); expect(st.cur).toEqual(['/classes']);
  const teacher = await stateFor(browser, 'DemoTeacher');
  const te = await tabs(teacher, '/');
  // '/' is the Classroom tab; DemoTeacher has one class, which it opens directly.
  expect(te.url).toMatch(/^\/(teach|class\/[^/]+)$/); expect(off(te.tabs)).toEqual(['/teach', '/learn', '/play', '/live', '/me']); expect(te.cur).toEqual(['/teach']);
  const tl = await tabs(teacher, '/learn'); expect(tl.cur).toEqual(['/learn']);
  const tp = await tabs(teacher, '/play'); expect(tp.cur).toEqual(['/play']);
});

test('Learn filters work as links and with the grade picker; staff buttons for the teacher only; assign end to end', async ({ browser }) => {
  // A kid: subject chips are links; the grade picker shows its games straight away; no staff buttons.
  const kctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: await stateFor(browser, 'kid') }); const kp = await kctx.newPage();
  await kp.goto('/learn');
  await expect(kp.locator('#learn-games .gcard').first()).toBeVisible();
  await Promise.all([kp.waitForURL(/subject=math/), kp.locator('#filters a.chip', { hasText: 'Math' }).click()]);
  await expect(kp.locator('#filters a.chip.on')).toHaveText([/Math/, /Any way/]);
  const metas = await kp.locator('#learn-games .gmeta, #live-games .gmeta').allInnerTexts();
  expect(metas.length).toBeGreaterThan(0); for (const m of metas) expect(m).toMatch(/^Math · Grades/);
  await expect(kp.locator('.learn-more a[href="/learn/math-games"]')).toBeVisible();
  await expect(kp.locator('#filters button[data-nojs]')).toBeHidden();
  await Promise.all([kp.waitForURL(/grade=3/), kp.locator('#filters select[name=grade]').selectOption('3')]);
  expect(new URL(kp.url()).searchParams.get('subject')).toBe('math');
  await expect(kp.locator('.lcard-acts, a[href^="/teach/assign"], a[href^="/live?mode="]')).toHaveCount(0);
  await expect(kp.locator('#learn-join')).toBeVisible();
  await kctx.close();
  // Without scripts the Show button submits the grade.
  const nctx = await browser.newContext({ javaScriptEnabled: false }); const np = await nctx.newPage();
  await np.goto('/learn');
  await np.locator('#filters select[name=grade]').selectOption('K');
  await Promise.all([np.waitForURL(/grade=K/), np.locator('#filters button[data-nojs]').click()]);
  await expect(np.locator('#filters select[name=grade]')).toHaveValue('K');
  await nctx.close();
  // A student: no staff buttons either.
  const sctx = await browser.newContext({ storageState: await stateFor(browser, 'DemoStudent') }); const sp = await sctx.newPage();
  await sp.goto('/learn'); await expect(sp.locator('.lcard-acts')).toHaveCount(0);
  // The teacher: Assign, Host live and Try it; Assign makes a lesson for the class.
  const tctx = await browser.newContext({ storageState: await stateFor(browser, 'DemoTeacher') }); const tp = await tctx.newPage();
  await tp.goto('/learn');
  await expect(tp.locator('a[href="/live?mode=quest-race"]', { hasText: 'Host live' })).toBeVisible();
  await expect(tp.locator('a[href="/play/sum-racer"]', { hasText: 'Try it' })).toBeVisible();
  await expect(tp.locator('#course-cs-quest-assign')).toHaveAttribute('href', '/teach/cs-quest');
  await Promise.all([tp.waitForURL(/\/teach\/assign\?game=word-trail/), tp.locator('a[href="/teach/assign?game=word-trail"]').click()]);
  await tp.locator('#ag-c').selectOption({ label: 'Demo Class' });
  const className = 'Demo Class';
  await Promise.all([tp.waitForURL(/\/class\//), tp.locator('#ag-go').click()]);
  await expect(tp.locator('.toast').first()).toContainText(className);
  await sp.goto(new URL(tp.url()).pathname);
  await expect(sp.locator('main')).toContainText('Word Trail');
  await sctx.close(); await tctx.close();
});
