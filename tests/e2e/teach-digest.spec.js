// The weekly class summary (docs/decisions.md "Weekly class summary email"): a teacher opens "This week's summary" from
// the Classroom (/teach/summary: counts per class, who hasn't started, the lessons due, the answers to review), sees
// the email as it would go (no student names in it), and picks the day, time and time zone, or turns it off, on the
// Me page. Students get 404 for all of it. The pages at 360, 390 and 1280 px, light and dark, and in Hebrew: no
// sideways scroll, nothing touches (touching.js), 44 px tap targets on phones. Screenshots go to SHOTS
// (default /dev/shm/teach-digest).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { findTouching } from './touching.js';
import { login } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const SHOTS = process.env.SHOTS || '/dev/shm/teach-digest';
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
const smallTargets = (page, scope = 'main') => page.evaluate(sc => [...document.querySelectorAll(['.btn', 'select', 'input:not([type=hidden])', 'summary', '.chip', 'a.chip-s', '.dg-stat a'].map(x => `${sc} ${x}`).concat('.tabbar .tab').join(','))]
  .filter(e => e.checkVisibility())
  // A checkbox or radio is tapped through its label: the label is the target.
  .map(e => [e, (e.matches('input[type=checkbox], input[type=radio]') && e.closest('label') ? e.closest('label') : e).getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`), scope);
/** Layout problems on each page ([name, path, prep?, scope?]: tap targets are checked inside scope, default main) at every view; screenshots of each (name-view.png). */
async function layoutProblems(browser, state, pages, lang = null) {
  const out = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const [name, p, prep, scope] of pages) {
      const r = await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      if (!r.ok()) { out.push(`${at}: ${r.status()}`); continue; }
      if (prep) await prep(page);
      for (const t of await findTouching(page)) out.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) out.push(`${at}: scrolls sideways by ${wide}px`);
      if (v.width < 600) for (const s of await smallTargets(page, scope)) out.push(`${at}: small target ${s}`);
      await page.screenshot({ path: `${SHOTS}/${name}-${v.width}-${v.scheme}${lang ? `-${lang}` : ''}.png`, fullPage: true });
    }
    await ctx.close();
  }
  return [...new Set(out)];
}
const openNames = async page => { for (const d of await page.locator('details.dg-names').all()) await d.evaluate(e => { e.open = true; }); };
const toDigest = async page => { await page.locator('#digest').scrollIntoViewIfNeeded(); };

test.beforeAll(() => { fs.mkdirSync(SHOTS, { recursive: true }); });

test('a teacher opens this week\'s summary from the Classroom: counts per class, names only on the site, the email without names', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher }); const t = await ctx.newPage();
  await t.goto('/teach');
  await Promise.all([t.waitForURL('**/teach/summary'), t.locator('#teach-summary').click()]);
  await expect(t.locator('h1')).toContainText("This week's summary");
  await expect(t.locator('#dg-sched')).toContainText(/goes out every Monday at 7:00 AM|don't have an email address|is off/);
  const card = t.locator('.dg-class', { hasText: 'Demo Class' });
  await expect(card).toHaveCount(1);
  await expect(card.locator('.dg-stat')).toHaveCount(5);
  for (const l of ['Due this week', 'Work done', 'To review', 'Not started', 'Live games']) await expect(card.locator('.dg-stats')).toContainText(l);
  // The roster's real names (the Students tab), to check the email never has one.
  const cls = (await card.locator('h2 a').getAttribute('href')).split('/')[2];
  await t.goto(`/class/${cls}?tab=students`);
  const names = (await t.locator('main table td b').allTextContents()).map(s => s.trim()).filter(Boolean);
  expect(names.length).toBeGreaterThan(1);
  // The email as it would go: the class and its counts, no student name.
  await t.goto('/teach/summary');
  await expect(t.locator('#dg-email')).toBeVisible();
  const email = await (await t.request.get('/teach/summary/email')).text();
  expect(email).toContain('Demo Class');
  expect(email).toContain('Stop these summaries');
  for (const n of names) expect(email.includes(n), n).toBe(false);
  const text = await (await t.request.get('/teach/summary/email?format=text')).text();
  for (const n of names) expect(text.includes(n), n).toBe(false);
  await t.goto('/teach/summary/email');
  await t.screenshot({ path: `${SHOTS}/email-390.png`, fullPage: true });
  await t.setViewportSize({ width: 1280, height: 860 });
  await t.screenshot({ path: `${SHOTS}/email-1280.png`, fullPage: true });
  await ctx.close();
  expect(await layoutProblems(browser, teacher, [['summary', '/teach/summary', openNames], ['teach', '/teach'], ['me', '/me', toDigest, '#digest']])).toEqual([]);
  expect(await layoutProblems(browser, teacher, [['summary', '/teach/summary', openNames], ['me', '/me', toDigest, '#digest']], 'he')).toEqual([]);
  const he = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher });
  await he.addCookies([{ name: 'lang', value: 'he', url: test.info().project.use.baseURL }]);
  const hp = await he.newPage(); await hp.goto('/teach/summary/email');
  await expect(hp.locator('html')).toHaveAttribute('dir', 'rtl');
  await hp.screenshot({ path: `${SHOTS}/email-390-he.png`, fullPage: true });
  await he.close();
});

test('the teacher picks the day, time and time zone on the Me page, or turns the summary off', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const t = await ctx.newPage();
  await login(t, TEACHER.username, TEACHER.password);
  await t.goto('/me');
  const panel = t.locator('#digest');
  await expect(panel).toBeVisible();
  await expect(panel).toContainText('Never a student');
  await expect(t.locator('#digest-on')).toBeChecked();
  await t.selectOption('#digest-day', '5');
  await t.selectOption('#digest-hour', '16');
  await t.selectOption('#digest-tz', 'Europe/London');
  await Promise.all([t.waitForEvent('load'), panel.locator('button[type=submit]').click()]);
  await expect(t.locator('#digest-day')).toHaveValue('5');
  await expect(t.locator('#digest-hour')).toHaveValue('16');
  await expect(t.locator('#digest-tz')).toHaveValue('Europe/London');
  await t.goto('/teach/summary');
  if (!(await t.locator('#dg-sched').textContent()).includes('email address')) await expect(t.locator('#dg-sched')).toContainText('every Friday at 4:00 PM (Europe/London)');
  // Off: the summary page says so.
  await t.goto('/me');
  await t.locator('#digest-on').uncheck();
  await Promise.all([t.waitForEvent('load'), panel.locator('button[type=submit]').click()]);
  await expect(t.locator('#digest-on')).not.toBeChecked();
  await t.goto('/teach/summary');
  await expect(t.locator('#dg-sched')).toContainText('The weekly summary email is off');
  // Back to the default.
  const r = await t.request.post('/api/me/digest', { data: { on: '1', day: '1', hour: '7', tz: '' } });
  expect(r.status()).toBe(200);
  expect((await r.json()).prefs).toMatchObject({ on: true, day: 1, hour: 7, tz: '' });
  expect((await t.request.post('/api/me/digest', { data: { hour: '99' } })).status()).toBe(400);
  await ctx.close();
});

test('students get 404 for the summary, its email and its settings, and no panel on their Me page', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } }); const s = await ctx.newPage();
  await login(s, STUDENT.username, STUDENT.password);
  for (const p of ['/teach/summary', '/teach/summary/email', '/teach/summary/email?format=text']) {
    const r = await s.goto(p);
    expect(r.status(), p).toBe(404);
    await expect(s.locator('body')).not.toContainText('Demo Class');
  }
  expect((await s.request.post('/api/me/digest', { data: { on: '0' } })).status()).toBe(404);
  await s.goto('/me');
  await expect(s.locator('#digest')).toHaveCount(0);
  await ctx.close();
  const guest = await browser.newContext(); const g = await guest.newPage();
  await g.goto('/teach/summary');
  expect(new URL(g.url()).pathname).toBe('/login');
  await guest.close();
});
