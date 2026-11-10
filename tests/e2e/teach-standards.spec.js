// Standards beyond computer science (docs/decisions.md, 9 Nov 2026): the class Standards tab's framework picker (CSTA,
// Common Core Math, Common Core ELA), the Common Core coverage view and one student's levels, the lesson's standards
// picker (search by grade, domain and words; tag the lesson or a step; remove), the codes on Learn cards for staff, and
// who may open them (a student gets 404). Every page at 360, 390 and 1280 px, light and dark, and in Hebrew: no sideways
// scroll, nothing touches (touching.js), 44 px tap targets on phones. Screenshots go to $STD_SHOTS (default
// /dev/shm/teach-standards), one per page and view.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { findTouching } from './touching.js';
import { login } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const NOTICE = '© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.';
const SHOTS = process.env.STD_SHOTS || '/dev/shm/teach-standards';
const VIEWS = [
  { width: 360, height: 740, scheme: 'light' }, { width: 360, height: 740, scheme: 'dark' },
  { width: 390, height: 844, scheme: 'light' }, { width: 390, height: 844, scheme: 'dark' },
  { width: 1280, height: 860, scheme: 'light' }, { width: 1280, height: 860, scheme: 'dark' },
];
test.describe.configure({ timeout: 420_000 });

async function stateOf(browser, who) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, who.username, who.password);
  const s = await ctx.storageState(); await ctx.close(); return s;
}
/** The demo class and its first lesson, as the teacher sees them. */
async function demo(page) {
  await page.goto('/teach');
  const href = await page.locator('#my-classes .classcard', { hasText: 'Demo Class' }).locator('a.cc-link').getAttribute('href');
  const cls = href.match(/\/class\/([^/?#]+)/)[1];
  // An assigned lesson: the class page links each one to its editor (?from=<class>).
  const html = await (await page.request.get(`/class/${cls}`)).text();
  // Other specs assign their own short lessons to this class: take the first one with two steps or more, so "another
  // step" below is really another one (its picker lists the whole lesson, then each step).
  const ids = [...new Set([...html.matchAll(/\/teach\/lessons\/([A-Za-z0-9]+)\?from=/g)].map(m => m[1]))];
  let lesson = null;
  for (const id of ids) {
    const p = await (await page.request.get(`/teach/lessons/${id}/standards`)).text();
    const sel = (p.match(/<select[^>]*id="sf-t"[\s\S]*?<\/select>/) || [''])[0];
    if ((sel.match(/<option /g) || []).length >= 3) { lesson = id; break; }
  }
  expect(lesson, 'a demo lesson with two steps or more').toBeTruthy();
  return { cls, lesson };
}
const smallTargets = page => page.evaluate(() => [...document.querySelectorAll('main .btn, main select, main input:not([type=hidden]), main summary, main .chip, main a.chip-s, .tabbar .tab')]
  .filter(e => e.checkVisibility()).map(e => [e, e.getBoundingClientRect()]).filter(([, r]) => r.width > 0 && r.height < 43.5)
  .map(([e, r]) => `${e.tagName.toLowerCase()}.${e.className} "${(e.innerText || '').trim().slice(0, 30)}" ${Math.round(r.height)}px`));
async function layoutProblems(browser, state, pages, { lang = null, views = VIEWS } = {}) {
  const out = [];
  fs.mkdirSync(SHOTS, { recursive: true });
  for (const v of views) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: state });
    if (lang) await ctx.addCookies([{ name: 'lang', value: lang, url: test.info().project.use.baseURL }]);
    const page = await ctx.newPage();
    for (const [name, p] of pages) {
      const r = await page.goto(p);
      const at = `${name} @${v.width}/${v.scheme}${lang ? `/${lang}` : ''}`;
      if (!r.ok()) { out.push(`${at}: ${r.status()}`); continue; }
      // the legend open, so what is inside it is checked too
      await page.evaluate(() => document.querySelectorAll('details.csq-std-legend').forEach(d => { d.open = true; }));
      for (const t of await findTouching(page)) out.push(`${at}: ${t.a}  ⟷  ${t.b} (${t.dir} ${t.gap}px)`);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      if (wide > 1) out.push(`${at}: scrolls sideways by ${wide}px`);
      if (v.width < 600) for (const s of await smallTargets(page)) out.push(`${at}: small target ${s}`);
      await page.screenshot({ path: path.join(SHOTS, `${name}-${v.width}-${v.scheme}${lang ? `-${lang}` : ''}.png`), fullPage: true });
    }
    await ctx.close();
  }
  return [...new Set(out)];
}

test('a teacher tags a lesson with Common Core standards and sees the class\'s coverage; a student never can', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher }); const t = await ctx.newPage();
  const { cls, lesson } = await demo(t);

  // The class tab opens on the framework the class has work in (the demo class plays math games: Common Core Math, not
  // computer science), with the framework chips above it; the CSTA chip opens the CSTA tab as before.
  await t.goto(`/class/${cls}/standards`);
  await expect(t).toHaveURL(/\/standards\?fw=ccss-math$/);
  await expect(t.locator('.std-fw .chip[aria-current="page"]')).toContainText('Common Core Math');
  await t.locator('.std-fw .chip', { hasText: 'Computer science (CSTA)' }).click();
  await expect(t).toHaveURL(/fw=csta$/);
  await expect(t.locator('.std-fw .chip[aria-current="page"]')).toContainText('Computer science (CSTA)');
  await expect(t.locator('.csq-std-lead')).toContainText('CSTA');
  await t.locator('.std-fw .chip', { hasText: 'Common Core Math' }).click();
  await expect(t).toHaveURL(/fw=ccss-math/);
  await expect(t.locator('.std-notice')).toContainText(NOTICE);

  // The lesson's standards page: search grade 4 fractions, tag the whole lesson with 4.NF.B.3, then a step with 4.NF.A.1.
  await t.goto(`/teach/lessons/${lesson}`);
  await expect(t.locator('#standards')).toBeVisible();
  await t.locator(`#standards a[href="/teach/lessons/${lesson}/standards"]`).click();
  await expect(t.locator('h1')).toContainText('Standards');
  await t.selectOption('#sf-g', '4');
  await expect(t).toHaveURL(/grade=4/);
  await t.selectOption('#sf-d', 'NF');
  await expect(t).toHaveURL(/domain=NF/);
  await t.fill('#sf-q', 'sum of fractions');
  await Promise.all([t.waitForURL(/q=sum/), t.locator('.std-filters button[type=submit]').click()]);
  const hit = t.locator('.std-result', { hasText: '4.NF.B.3' }).first();
  await expect(hit).toBeVisible();
  await hit.locator('button', { hasText: 'Add' }).click();
  await expect(t.locator('#tagged .std-tag', { hasText: '4.NF.B.3' })).toBeVisible();
  await expect(t.locator('.std-result', { hasText: '4.NF.B.3' }).first().locator('.chip-s')).toContainText('Tagged');
  // A step: pick it in "Add to" (the page reloads with ?to=) and search again.
  const stepOpt = await t.locator('#sf-t option').nth(1).getAttribute('value');
  await t.selectOption('#sf-t', stepOpt);
  await expect(t).toHaveURL(new RegExp(`to=${stepOpt}`));
  await t.fill('#sf-q', '4.NF.A.1');
  await Promise.all([t.waitForURL(/q=4\.NF\.A\.1/), t.locator('.std-filters button[type=submit]').click()]);
  await t.locator('.std-result', { hasText: '4.NF.A.1' }).first().locator('button').click();
  await expect(t.locator('#tagged h3', { hasText: /^Step 1/ })).toBeVisible();
  // Another step picked in "Add to", then "+ Add" straight away (no Search): the tag goes on that step, not the lesson.
  const opts = t.locator('#sf-t option');
  const lastIx = (await opts.count()) - 1;
  const lastOpt = await opts.nth(lastIx).getAttribute('value');
  const lastName = (await opts.nth(lastIx).innerText()).trim();
  await t.selectOption('#sf-t', lastOpt);
  await expect(t).toHaveURL(new RegExp(`to=${lastOpt}`));
  // The URL changes when the new page commits, before it is all parsed: read its Add forms once it is.
  await t.waitForLoadState('domcontentloaded');
  await expect.poll(() => t.locator('.std-results input[name="stepId"]').evaluateAll(l => [...new Set(l.map(i => i.value))])).toEqual([lastOpt]);
  await t.locator('.std-result', { hasText: '4.NF.A.1' }).first().locator('button', { hasText: 'Add' }).click();
  const onLast = t.locator('#tagged li', { has: t.locator('h3', { hasText: lastName }) });
  await expect(onLast.locator('.std-tag', { hasText: '4.NF.A.1' })).toBeVisible();
  await expect(t.locator('#tagged li', { has: t.locator('h3', { hasText: 'Whole lesson' }) }).locator('.std-tag', { hasText: '4.NF.A.1' })).toHaveCount(0);
  await expect(t.locator('.std-notice')).toContainText(NOTICE);
  // ELA tab of the picker
  await t.locator('.std-fw .chip', { hasText: 'Common Core ELA' }).click();
  await expect(t.locator('#sf-d option[value="RL"]')).toHaveCount(1);

  // The editor shows the tags; the class's Common Core tab covers them.
  await t.goto(`/teach/lessons/${lesson}`);
  await expect(t.locator('#standards .std-code', { hasText: '4.NF.B.3' })).toBeVisible();
  await t.goto(`/class/${cls}/standards?fw=ccss-math`);
  const row = t.locator('table.std-ccss tr', { hasText: '4.NF.B.3' });
  await expect(row).toBeVisible();
  await expect(row.locator('.csq-std-status')).toContainText(/Covered|Practiced|Checked|Meets/);
  await expect(t.locator('.std-summary li', { hasText: 'Grade 4' })).toContainText(/\d+ of 28 standards covered/);
  // One student's levels
  await t.selectOption('#std-student', { index: 1 });
  await expect(t).toHaveURL(/student=/);
  await expect(t.locator('table.std-ccss th', { hasText: 'Level' })).toHaveCount(1);
  // The CSV
  const csv = await t.request.get(`/class/${cls}/standards.csv?fw=ccss-math`);
  expect(csv.ok()).toBe(true);
  expect(await csv.text()).toContain('4.NF.B.3');
  // Learn: staff see the codes
  await t.goto('/learn?std=3.OA');
  await expect(t.locator('.lcard .std-code', { hasText: '3.OA.C.7' }).first()).toBeVisible();
  await expect(t.locator('.learn-std-go')).toBeVisible();   // its own Filter button, with JS on
  await expect(t.locator('section.courses')).toHaveCount(0); // courses are not filtered by code, so they are left out
  await t.fill('input[name="std"]', 'RF.K');
  await Promise.all([t.waitForURL(/std=RF\.K/), t.locator('.learn-std-go').click()]);
  await expect(t.locator('.lcard .std-code', { hasText: /^RF\.K\./ }).first()).toBeVisible();
  await ctx.close();

  // A student: 404 everywhere, and no codes on Learn.
  const kid = await browser.newContext({ storageState: await stateOf(browser, STUDENT) }); const k = await kid.newPage();
  for (const p of [`/class/${cls}/standards?fw=ccss-math`, `/class/${cls}/standards`, `/teach/lessons/${lesson}/standards`]) expect((await k.goto(p)).status(), p).toBe(404);
  expect((await k.request.get(`/api/classes/${cls}/standards?fw=ccss-math`)).status()).toBe(404);
  expect((await k.request.get('/api/standards/search?fw=ccss-math&q=fraction')).status()).toBe(404);
  expect((await k.request.post(`/api/lessons/${lesson}/standards`, { data: { framework: 'ccss-math', code: '4.NF.A.2' } })).status()).toBe(404);
  await k.goto('/learn');
  await expect(k.locator('.std-code')).toHaveCount(0);
  await kid.close();
});

test('the Standards pages on phones and desktop, light and dark, and in Hebrew: nothing touches, nothing scrolls sideways', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ storageState: teacher }); const t = await ctx.newPage();
  const { cls, lesson } = await demo(t);
  const html = await (await t.request.get(`/class/${cls}/standards?fw=ccss-math`)).text();
  const student = (html.match(/<option value="([A-Za-z0-9]+)"/) || [])[1];
  await ctx.close();
  const pages = [
    ['class-csta', `/class/${cls}/standards?fw=csta`],
    ['class-math', `/class/${cls}/standards?fw=ccss-math`],
    ['class-math-grade4', `/class/${cls}/standards?fw=ccss-math&grade=4`],
    ['class-math-student', `/class/${cls}/standards?fw=ccss-math&student=${student}`],
    ['class-ela', `/class/${cls}/standards?fw=ccss-ela`],
    ['lesson-standards', `/teach/lessons/${lesson}/standards?fw=ccss-math&grade=3&domain=MD`],
    ['lesson-standards-ela', `/teach/lessons/${lesson}/standards?fw=ccss-ela&grade=K&domain=RF`],
    ['lesson-editor', `/teach/lessons/${lesson}`],
    ['learn-staff', '/learn'],
  ];
  expect(await layoutProblems(browser, teacher, pages)).toEqual([]);
  expect(await layoutProblems(browser, teacher, pages.filter(([n]) => ['class-math', 'class-math-student', 'lesson-standards', 'lesson-editor'].includes(n)),
    { lang: 'he', views: [VIEWS[0], VIEWS[3], VIEWS[4]] })).toEqual([]);
});
