// Each role's first tab (docs/decisions.md "Play and Learn", part 2): '/' takes a teacher to the Classroom (/teach: hello,
// class cards with what needs attention, courses, live games for the whole class, brain breaks, everything students
// can play), a student to their Class tab (/classes: the live-game banner while the teacher's room is open, To do with
// progress and Continue, games from the class), a grown-up to Family and a guest to Play. Both homes at 360, 390 and
// 1280 px, light and dark, and in Hebrew: no sideways scroll, nothing touches (touching.js), 44 px tap targets on phones.
// The grown-up runs on its own server with billing on (family pages need it): E2E_PORT + 11, fake Stripe on + 12.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findTouching } from './touching.js';
import { login, ownIp, uniq, ADMIN } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const VIEWS = [
  { width: 360, height: 740, scheme: 'light' }, { width: 360, height: 740, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' }, { width: 390, height: 844, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
];
test.describe.configure({ timeout: 300_000 });

async function stateOf(browser, who) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, who.username, who.password);
  const s = await ctx.storageState(); await ctx.close(); return s;
}
/** Controls under 44 px on a phone (links inside sentences are not controls). */
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('main .btn, main select, main input:not([type=hidden]), main summary, main .chip, main a.chip-s, .tabbar .tab')]
  .filter(e => e.checkVisibility()).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`));
async function layoutProblems(browser, state, paths, lang = null) {
  const out = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of paths) {
      const r = await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      if (!r.ok()) { out.push(`${at}: ${r.status()}`); continue; }
      for (const t of await findTouching(page)) out.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) out.push(`${at}: scrolls sideways by ${wide}px`);
      if (v.width < 600) for (const s of await smallTargets(page)) out.push(`${at}: small target ${s}`);
    }
    await ctx.close();
  }
  return [...new Set(out)];
}
/** End the teacher's open live game, if any. */
async function endOpen(t) {
  const mine = await (await t.request.get('/api/live/mine')).json();
  if (!mine.sid) return;
  await t.goto(mine.host);
  t.once('dialog', d => d.accept());
  await t.locator('#lv-controls [data-lv-act="end"]:not([hidden])').click();
  await expect.poll(async () => (await (await t.request.get('/api/live/mine')).json()).sid || null).toBe(null);
}

test('a teacher lands on the Classroom: hello, class cards with what needs attention, courses, live games, brain breaks', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher }); const t = await ctx.newPage();
  // A room another spec left open would show "Open live game" on every card (one room at a time): end it first.
  await endOpen(t);
  await t.goto('/');
  expect(new URL(t.url()).pathname).toBe('/teach');
  await expect(t.locator('.tabbar .tab[href="/teach"]')).toHaveAttribute('aria-current', 'page');
  await expect(t.locator('h1')).toContainText('Hello, ');
  await expect(t.locator('.th-sum')).toContainText(/\d+ class/);
  // The demo class's card: what needs attention (answers to read and/or the next lesson due, or All caught up) and buttons.
  const card = t.locator('#my-classes .classcard', { hasText: 'Demo Class' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.th-chips .chip-s').first()).toBeVisible();
  await expect(card.locator('.th-chips')).toContainText(/answers? to review|Due |All caught up/);
  const cls = (await card.locator('a.cc-link').getAttribute('href')).match(/\/class\/([^/?#]+)/)[1];
  await expect(card.locator(`a[href^="/teach/lessons?school="][href$="class=${cls}"]`)).toContainText('Assign a lesson');
  await expect(card.locator(`a.cc-live[href="/live?class=${cls}"]`)).toBeVisible();
  await expect(t.locator('#nc-n')).toHaveCount(1);   // New class is still here
  // Ready-made ways to teach.
  for (const [slug, href] of [['cs-quest', '/teach/cs-quest'], ['cyber-defenders', '/teach/cyber-defenders'], ['number-quest', '/teachers/number-quest']]) await expect(t.locator(`#teach-course-${slug}`)).toHaveAttribute('href', href);
  await expect(t.locator('#teach-live a[href="/live?mode=quest-race"]')).toContainText('Quest Race');
  await expect(t.locator('#teach-live a[href="/live?mode=tug"]')).toContainText('Tug of Math');
  expect(await t.locator('#brain-breaks a').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/play/swish-flick', '/play/beat-lanes', '/play/would-you-rather', '/play/brick-drop', '/play/remis-quiet-meadow']);
  await expect(t.locator('#teach-all-games')).toHaveAttribute('href', '/play');
  // The tools /teach always had: Lesson library and Make a game in the tools row; CS Quest and Cyber Defenders under
  // Teach with a course (checked above). New class is a tile in the class grid.
  expect(await t.locator('.teachtools a').evaluateAll(l => l.map(a => a.getAttribute('href')))).toEqual(['/teach/lessons', '/build']);
  await expect(t.locator('#my-classes .th-classes .th-newclass summary')).toBeVisible();
  // Phones: the live modes are one sideways row (the page does not scroll sideways).
  expect(await t.evaluate(() => { const r = document.querySelector('#teach-live .th-tiles'); return [r.scrollWidth > r.clientWidth, document.documentElement.scrollWidth - innerWidth]; })).toEqual([true, 0]);
  // A live room open for the class shows on its card (the host's own link to the room).
  await endOpen(t);
  await t.goto(`/live?class=${cls}`);
  await t.locator('label.lv-pick', { has: t.locator('input[value="mode:wyr"]') }).click();
  await t.locator('#lv-new button[type=submit]').click();
  await t.waitForURL(/\/live\/host\//);
  const sid = new URL(t.url()).pathname.split('/').pop();
  await t.goto('/teach');
  await expect(t.locator(`#my-classes .classcard a.chip-s[href="/live/host/${sid}"]`)).toContainText('Live game now');
  await endOpen(t);
  await ctx.close();
  expect(await layoutProblems(browser, teacher, ['/teach'])).toEqual([]);
  expect(await layoutProblems(browser, teacher, ['/teach'], 'he')).toEqual([]);
});

test('a student lands on Class: To do with progress and Continue, games from the class, the live banner while a room is open', async ({ browser }) => {
  const tctx = await browser.newContext(); const t = await tctx.newPage();
  await login(t, TEACHER.username, TEACHER.password);
  await endOpen(t);
  const student = await stateOf(browser, STUDENT);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: student }); const s = await ctx.newPage();
  await s.goto('/');
  expect(new URL(s.url()).pathname).toBe('/classes');
  await expect(s.locator('.tabbar .tab[href="/classes"]')).toHaveAttribute('aria-current', 'page');
  const sec = s.locator('.ct-class').first();
  await expect(sec.locator('h1.cc-name')).toHaveText('Demo Class');
  await expect(sec.locator('.ct-head')).toContainText('🍎');
  await expect(sec.locator('#class-live')).toBeHidden();
  // To do: each open lesson with its due date, progress bar, "x of y done", the next step and Start / Continue.
  const todo = sec.locator('.ct-todo');
  expect(await todo.count()).toBeGreaterThan(0);
  const first = todo.first();
  await expect(first.locator('.chip-s')).toContainText(/Due/);
  await expect(first.locator('[role=progressbar]')).toBeVisible();
  await expect(first).toContainText(/\d+ of \d+ done/);
  await expect(first).toContainText('Next: ');
  const go = first.locator('a.btn-primary');
  await expect(go).toHaveText(/Start|Continue/);
  const href = await go.getAttribute('href');
  expect(href).toMatch(/^\/class\/[^/]+\/lessons\/[^/]+$/);
  // Games from our class, and the way on to Play and Learn.
  await expect(sec.locator('.ct-games h3')).toHaveText(/Games from our class/);
  await expect(s.locator('.ct-more a[href="/play"]')).toBeVisible();
  await expect(s.locator('.ct-more a[href="/learn"]')).toBeVisible();
  // No classmates' names on the page (only the class, the teacher and the student's own sign-in line).
  await expect(s.locator('main')).not.toContainText('Classmates');
  // The teacher opens a class room: the banner appears without a reload.
  const cls = href.split('/')[2];
  await t.goto(`/live?class=${cls}`);
  await t.locator('label.lv-pick', { has: t.locator('input[value="mode:wyr"]') }).click();
  await t.locator('#lv-new button[type=submit]').click();
  await t.waitForURL(/\/live\/host\//);
  const code = (await t.locator('#lv-code').textContent()).replace(/\s/g, '');
  await expect(sec.locator('#class-live')).toBeVisible({ timeout: 20_000 });
  await expect(sec.locator('#class-live-join')).toHaveAttribute('href', `/join#${code}`);
  await s.reload();
  await expect(s.locator('#class-live')).toBeVisible();
  await expect(s.locator('.ct-head')).toContainText('Live game now');
  expect(await layoutProblems(browser, student, ['/classes'])).toEqual([]);
  expect(await layoutProblems(browser, student, ['/classes'], 'he')).toEqual([]);
  await endOpen(t);
  // Continue opens the lesson.
  await Promise.all([s.waitForURL(u => u.pathname === href), go.click()]);
  await ctx.close(); await tctx.close();
});

test('a guest lands on Play', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const g = await ctx.newPage();
  await ownIp(g);
  await g.goto('/g/shark-plank');
  await g.click('#playbtn');
  await expect(g).toHaveURL(/\/play\/shark-plank/);
  await g.goto('/');
  expect(new URL(g.url()).pathname).toBe('/');
  await expect(g.locator('.tabbar .tab[href="/"]')).toHaveAttribute('aria-current', 'page');
  await expect(g.locator('.tabbar .tab[href="/learn"]')).toHaveCount(1);
  await ctx.close();
});

// ---- a grown-up: their own server with billing on (family pages are on only while billing is)
test.describe('a grown-up', () => {
  const E2E = +(process.env.E2E_PORT || 4310);
  const PORT = E2E + 11, STRIPE_PORT = E2E + 12, GB = `http://localhost:${PORT}`;
  const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  let DATA = null, app = null, stripe = null;
  const env = () => ({
    PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(PORT), BRB_DATA_DIR: DATA, ADMIN_USERNAME: ADMIN.username, ADMIN_PASSWORD: ADMIN.password,
    ANTHROPIC_API_KEY: '', BRB_SILENT: '1', TRUST_PROXY: '1', BRB_ALL_LOCALES: '1', BRB_SNAPSHOTS: '0', CONTACT_EMAIL: 'help@example.com',
    STRIPE_API_KEY: 'rk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_fake_plh', STRIPE_API_BASE: `http://127.0.0.1:${STRIPE_PORT}`, STRIPE_API_VERSION: '', STRIPE_TAX: '', STRIPE_LIVE_OK: '', STRIPE_WEBHOOK_SECRET_OLD: '', STRIPE_PMC_FAMILY: 'pmc_fakefamily', BILLING_PUBLIC: '1', BILLING_PREVIEW_TOKEN: '',
  });
  const up = async url => { const t0 = Date.now(); for (;;) { try { if ((await fetch(url)).status < 500) return; } catch { /* not up yet */ } if (Date.now() - t0 > 60_000) throw new Error(`${url} did not start`); await new Promise(r => setTimeout(r, 150)); } };
  const stop = async p => { if (p && p.exitCode === null) { p.kill('SIGTERM'); await Promise.race([new Promise(r => p.once('exit', r)), new Promise(r => setTimeout(r, 10_000))]); if (p.exitCode === null) p.kill('SIGKILL'); } };
  test.beforeAll(async () => {
    test.setTimeout(150_000);
    DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-plh-'));
    stripe = spawn(process.execPath, ['tests/support/fake-stripe.js', '--port', String(STRIPE_PORT), '--secret', 'whsec_fake_plh', '--webhook', `${GB}/api/billing/webhook`], { cwd: ROOT, stdio: 'ignore' });
    await up(`http://127.0.0.1:${STRIPE_PORT}/v1/tax/settings`);
    execFileSync(process.execPath, ['scripts/seed.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
    app = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env: env(), stdio: 'ignore' });
    await up(`${GB}/health`);
  });
  test.afterAll(async () => { await stop(app); await stop(stripe); if (DATA) fs.rmSync(DATA, { recursive: true, force: true }); });

  test('lands on Family; Play is /play, current there', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: GB, viewport: { width: 390, height: 844 } }); const m = await ctx.newPage();
    await ownIp(m);
    await m.goto('/grown-ups/signup');
    await m.fill('#username', uniq('Mum')); await m.fill('#password', 'a-long-password-1'); await m.fill('#confirm', 'a-long-password-1');
    await m.check('#adult');
    await Promise.all([m.waitForURL(/\/family\/add\?from=signup$/), m.click('button[type=submit]')]);
    await m.goto('/');
    expect(new URL(m.url()).pathname).toBe('/family');
    await expect(m.locator('.tabbar .tab[href="/family"]')).toHaveAttribute('aria-current', 'page');
    await m.goto('/play');
    await expect(m.locator('.tabbar .tab[href="/play"]')).toHaveAttribute('aria-current', 'page');
    await ctx.close();
  });
});
