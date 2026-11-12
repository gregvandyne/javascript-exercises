// The teaching loop, Plan → Play → Check → Feedback (docs/decisions.md "The teaching loop"): the Classroom home's card
// for a brand-new teacher (a school and teacher made here by the admin, so other specs can't have ticked anything):
// nothing done, Hide, Show again from /teach/loop, Plan and Play tick themselves off when a game is assigned and Check
// when they open the gradebook. On the demo school: "Needs attention first" lands sorted, the links to the real tools ("Needs attention first" lands sorted), /teachers and, when
// the landing is at "/" (LANDING_AT_ROOT=1), its section. At 360, 390 and 1280 px, light and dark, and in Hebrew: no
// sideways scroll, nothing touches (touching.js), 44 px tap targets on phones.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { login, adminPage, uniq } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const VIEWS = [
  { width: 360, height: 740, scheme: 'light' }, { width: 360, height: 740, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' }, { width: 390, height: 844, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
];
test.describe.configure({ mode: 'serial', timeout: 300_000 });

/** A new school with one teacher (a school account) who has made a class: signed-in storage state. */
let fresh = null;
async function freshTeacher(browser) {
  if (fresh) return fresh;
  const admin = await adminPage(browser);
  await admin.goto('/admin/schools');
  await admin.fill('#sn', `Loop School ${uniq('L')}`);
  await Promise.all([admin.waitForURL(/\/school\//), admin.click('form[data-api="/api/admin/schools"] button[type=submit]')]);
  await admin.selectOption('#st-r', 'teacher');
  await admin.fill('#st-n', 'Lia Loop');
  await Promise.all([admin.waitForURL(/\/cards\//), admin.click('form[data-api$="/staff"] button[type=submit]')]);
  const username = (await admin.locator('.logincard dd b').nth(0).textContent()).trim();
  const password = (await admin.locator('.logincard dd b').nth(1).textContent()).trim();
  await admin.context().close();
  const ctx = await browser.newContext(); const t = await ctx.newPage();
  await login(t, username, password);
  await t.goto('/teach?all=1');
  await t.fill('#nc-n', 'Loop 4C');
  await Promise.all([t.waitForURL(/\/class\//), t.click('form[data-api="/api/classes"] button[type=submit]')]);
  const classId = t.url().match(/\/class\/([^/?#]+)/)[1];
  fresh = { state: await ctx.storageState(), classId };
  await ctx.close();
  return fresh;
}
async function stateOf(browser, who) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, who.username, who.password);
  const s = await ctx.storageState(); await ctx.close(); return s;
}
const smallTargets = (page, scope) => page.evaluate(scope => [...document.querySelectorAll(`${scope} .btn, ${scope} .chip, ${scope} a.lp-btn, ${scope} button`)]
  .filter(e => e.checkVisibility()).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`), scope);
async function layoutProblems(browser, state, paths, { lang = null, scope = 'main' } = {}) {
  const out = [];
  for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, ...(state ? { storageState: state } : {}) });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const p of paths) {
      const r = await page.goto(p);
      const at = `${p} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      if (!r.ok()) { out.push(`${at}: ${r.status()}`); continue; }
      for (const t of await findTouching(page)) out.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) out.push(`${at}: scrolls sideways by ${wide}px`);
      if (v.width < 600) for (const s of await smallTargets(page, scope)) out.push(`${at}: small target ${s}`);
    }
    await ctx.close();
  }
  return [...new Set(out)];
}

test('a new teacher\'s Classroom: the card above My classes, nothing done, Hide and Show again, links for their class', async ({ browser }) => {
  const { state, classId } = await freshTeacher(browser);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state }); const t = await ctx.newPage();
  await t.goto('/teach?all=1');
  const card = t.locator('#teach-loop');
  await expect(card).toBeVisible();
  await expect(card.locator('h2')).toHaveText('🔁 Your teaching loop');
  await expect(card.locator('.tl-count')).toHaveText('0 of 4 done');
  await expect(card.locator('.tl-mstep.is-done')).toHaveCount(0);
  await expect(card.locator('.tl-sub')).toContainText('Loop 4C');
  await expect(card.locator(`a.chip[href="/class/${classId}/progress"]`).first()).toBeVisible();
  await expect(card.locator(`a[href="/class/${classId}/standards"]`)).toHaveCount(0); // no Standards tab (12 Nov 2026)
  const [cardY, classesY] = await Promise.all([card.boundingBox(), t.locator('#my-classes').boundingBox()]).then(b => b.map(x => x.y));
  expect(cardY).toBeLessThan(classesY);
  // On a phone only the next step (Plan) is open, so My classes starts on the first screen.
  await expect(card.locator('.tl-mstep.is-next')).toHaveCount(1);
  await expect(card.locator('.tl-mstep.is-next')).toContainText('Plan');
  await expect(card.locator('.tl-mstep.is-next .tl-mtools a.chip').first()).toBeVisible();
  await expect(card.locator(`a.chip[href="/class/${classId}/standards"]`)).toBeHidden();
  expect(classesY).toBeLessThan(844 - 60);

  // Hide: the card goes and the small link takes its place; Show again from /teach/loop brings it back.
  await card.locator('.tl-hide button').click();
  await expect(t.locator('#teach-loop')).toHaveCount(0);
  await expect(t.locator('#teach-loop-link')).toBeVisible();
  await t.click('#teach-loop-link');
  await expect(t).toHaveURL(/\/teach\/loop$/);
  await expect(t.locator('h1')).toContainText('How Oomba fits your week');
  await expect(t.locator('.tl-step')).toHaveCount(4);
  await expect(t.locator('.tl-shot img')).toHaveCount(4);
  for (const img of await t.locator('.tl-shot img').all()) { await img.scrollIntoViewIfNeeded(); await expect.poll(() => img.evaluate(i => i.complete && i.naturalWidth)).toBe(1280); }
  await t.click('.tl-foot form button');
  await expect(t.locator('.tl-foot form')).toHaveCount(0);
  await t.goto('/teach?all=1');
  await expect(t.locator('#teach-loop')).toBeVisible();
  await ctx.close();
});

test('the card and /teach/loop on phones and desktop, light and dark, and in Hebrew: nothing touches, no sideways scroll', async ({ browser }) => {
  const { state } = await freshTeacher(browser);
  const problems = [
    ...await layoutProblems(browser, state, ['/teach', '/teach/loop']),
    ...await layoutProblems(browser, state, ['/teach', '/teach/loop'], { lang: 'he' }),
  ];
  expect(problems).toEqual([]);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: state });
  await ctx.addCookies([{ name: 'lang', value: 'he', url: test.info().project.use.baseURL }]);
  const p = await ctx.newPage(); await p.goto('/teach?all=1');
  await expect(p.locator('html')).toHaveAttribute('dir', 'rtl');
  await expect(p.locator('#teach-loop h2')).toContainText('מעגל ההוראה שלך');
  await ctx.close();
});

test('the steps tick themselves off: assigning a game (Plan, Play), opening the gradebook from the card (Check)', async ({ browser }) => {
  const { state, classId } = await freshTeacher(browser);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, storageState: state }); const t = await ctx.newPage();
  await t.goto('/teach?all=1');
  const r = await t.request.post('/api/teach/assign-game', { data: { game: 'word-hunt', classId }, headers: { 'sec-fetch-site': 'same-origin' } });
  expect(r.status()).toBe(200);
  await t.goto('/teach?all=1');
  await expect(t.locator('#teach-loop .tl-count')).toHaveText('2 of 4 done');
  await t.locator('#teach-loop a.chip', { hasText: 'Gradebook' }).click();
  await expect(t).toHaveURL(new RegExp(`/class/${classId}/progress$`));
  await t.goto('/teach?all=1');
  await expect(t.locator('#teach-loop .tl-count')).toHaveText('3 of 4 done');
  await expect(t.locator('#teach-loop .tl-mstep:not(.is-done)')).toContainText('Feedback');
  await t.goto('/teach/loop');
  await expect(t.locator('.tl-step.is-done')).toHaveCount(3);
  await ctx.close();
});

test('on the demo school: "Needs attention first" opens the latest lesson\'s progress, sorted', async ({ browser }) => {
  const state = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, storageState: state }); const t = await ctx.newPage();
  await t.goto('/teach/loop');
  await t.locator('#teach-loop-check a', { hasText: 'Needs attention first' }).click();
  await expect(t).toHaveURL(/\/progress\/[^/#]+#needs-attention$/);
  await expect(t.locator('#needs-attention [data-sort]')).toHaveAttribute('aria-pressed', 'true');
  await ctx.close();
});

test('staff only: a student gets "not found" for /teach/loop and never sees the card', async ({ browser }) => {
  const state = await stateOf(browser, STUDENT);
  const ctx = await browser.newContext({ storageState: state }); const s = await ctx.newPage();
  expect((await s.goto('/teach/loop')).status()).toBe(404);
  expect((await s.request.post('/api/teach/loop/hide', { headers: { 'sec-fetch-site': 'same-origin' } })).status()).toBe(404);
  await s.goto('/classes');
  await expect(s.locator('#teach-loop')).toHaveCount(0);
  await ctx.close();
});

test('/teachers (and the landing at "/", when it is on): the section with the four screens, at every size', async ({ browser }) => {
  const ctx = await browser.newContext(); const p = await ctx.newPage();
  await p.goto('/teachers');
  const sec = p.locator('#teach-loop');
  await expect(sec.locator('h2')).toContainText('Plan → Play → Check → Feedback');
  await expect(sec.locator('.tl-step')).toHaveCount(4);
  await expect(sec.locator('a')).toHaveCount(0);
  const landing = await p.goto('/').then(() => p.locator('#loop').count());
  const paths = ['/teachers', ...(landing ? ['/'] : [])];
  if (landing) {
    await expect(p.locator('#loop .lp-loop-step')).toHaveCount(4);
    await expect(p.locator('#loop .lp-loop-shot img')).toHaveCount(4);
    for (const alt of await p.locator('#loop img').evaluateAll(l => l.map(i => i.alt))) expect(alt.length).toBeGreaterThan(30);
  }
  await ctx.close();
  expect([...await layoutProblems(browser, null, paths, { scope: '#teach-loop, #loop' }), ...await layoutProblems(browser, null, paths, { lang: 'he', scope: '#teach-loop, #loop' })]).toEqual([]);
});
