// Rubrics end to end on the demo school (docs/decisions.md "Rubrics"): the teacher makes a rubric in the lesson library,
// adds a CS Quest starter, attaches the rubric to a written question and to the whole lesson, assigns it; the student
// answers; the teacher scores by tapping levels ("Save and mark reviewed"); the gradebook and CSV show the points; the
// student sees their own result ("From your teacher"). Every new screen is checked on phones (360, 390) and desktop
// (1280), light and dark, and in Hebrew (RTL): no sideways scroll, nothing touching, tap targets of 44px.
// Screenshots go to /dev/shm/teach-rubrics (SHOTS_DIR) for a person to look at.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { login } from './helpers.js';
import { findTouching } from './touching.js';

const DEMO = 'demo-pass-123';
const SHOTS = process.env.SHOTS_DIR || '/dev/shm/teach-rubrics';
fs.mkdirSync(SHOTS, { recursive: true });
test.describe.configure({ timeout: 240_000 });

/** Layout rules on the page as it is now: no sideways scroll, no touching boxes, tap targets at least 44px tall. */
async function layoutOk(page, at) {
  const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && !el.closest('.rb-wrap,.gbwrap')).slice(-6).map(el => `${el.tagName}.${el.className} ${Math.round(el.getBoundingClientRect().right)}`));
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${at}: sideways scroll ${wide.join(' | ')}`).toBeLessThanOrEqual(1);
  const touching = await findTouching(page);
  expect(touching.map(x => `${x.a} ⟷ ${x.b} (${x.dir} ${x.gap}px)`), `${at}: touching`).toEqual([]);
  const small = await page.evaluate(() => [...document.querySelectorAll('main .rb-level, main .rb-editor .btn, main .rb-cmt>summary, main .rb-subtabs .chip, main .rb-starter .btn, main .f-rub select')]
    .filter(el => el.offsetParent && el.getBoundingClientRect().height < 43.5).map(el => `${el.className} ${el.textContent.trim().slice(0, 30)} ${Math.round(el.getBoundingClientRect().height)}px`));
  expect(small, `${at}: tap targets`).toEqual([]);
}
const VIEWS = [
  { name: 'phone360', width: 360, height: 760, scheme: 'light' },
  { name: 'phone390', width: 390, height: 844, scheme: 'dark' },
  { name: 'desktop', width: 1280, height: 900, scheme: 'light' },
  { name: 'desktop-dark', width: 1280, height: 900, scheme: 'dark' },
];

test('rubrics: make, attach, score, gradebook and the student\'s own result', async ({ browser }) => {
  const t = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await login(t, 'DemoTeacher', DEMO);

  // ---- the library: a new rubric from the Rubrics tab of the lesson library
  await t.goto('/teach/lessons');
  await t.click('nav.tabs a[href*="/teach/rubrics"]');
  await expect(t.locator('h1')).toContainText('Rubrics');
  await t.fill('#nr-t', 'Explain your game');
  await Promise.all([t.waitForURL(/\/teach\/rubrics\/\w+$/), t.click('form[data-api="/api/rubrics"] button[type=submit]')]);
  const rubricUrl = t.url();
  await t.fill('#re-c0', 'Rules');
  await t.fill('#re-c0d0', 'The rules are missing');
  await t.fill('#re-c0d3', 'Every rule is clear and fair');
  await t.fill('#re-c1', 'Reasons');
  await t.fill('#re-c2', 'Words');
  await t.click('.rb-save button[type=submit]');
  await expect(t.locator('#re-c0')).toHaveValue('Rules');
  // a row button: add a criterion (it is saved with what was typed)
  await t.fill('#re-c2', 'Spelling and words');
  await Promise.all([t.waitForURL(/\?v=\d+#crit-3$/), t.click('button[value="addCriterion"]')]);
  await expect(t.locator('#re-c3')).toBeVisible();
  await expect(t.locator('#re-c2')).toHaveValue('Spelling and words');
  await Promise.all([t.waitForURL(/\?v=\d+#crit-/), t.click('button[value="dropCriterion:3"]')]);
  await expect(t.locator('#re-c3')).toHaveCount(0);
  // a starter rubric from CS Quest
  await t.goto('/teach/rubrics?tab=starters');
  await Promise.all([t.waitForURL(/imported=1/), t.locator('.rb-starter form button').first().click()]);
  await expect(t.locator('.notice.good')).toBeVisible();
  // the print view
  await t.goto(`${rubricUrl}/print`);
  await expect(t.locator('.rb-grid')).toContainText('Every rule is clear and fair');

  // ---- a lesson with a written question scored by the rubric, and the whole lesson too
  const teach = await (await t.request.get('/teach?all=1')).text();
  const classId = teach.match(/\/class\/([A-Za-z0-9]+)/)[1];
  await t.goto('/teach/lessons');
  await t.fill('#nl-t', 'Rubric e2e lesson');
  await Promise.all([t.waitForURL(/\/teach\/lessons\/\w+/), t.click('form[data-api="/api/lessons"] button[type=submit]')]);
  const lessonId = t.url().match(/\/teach\/lessons\/(\w+)/)[1];
  const add = t.locator('#add-step form.stepgrid');
  await expect(add.locator('.f-rub')).toBeHidden();
  await add.locator('select[name=kind]').selectOption('question');
  await expect(add.locator('.f-rub')).toBeVisible();
  await add.locator('textarea[name=body]').fill('Why is your game fair? Give two reasons.');
  await add.locator('select[name=rubricId]').selectOption({ label: '📏 Explain your game' });
  await add.locator('button[type=submit]').click();
  await expect(t.locator('.stepcard .sc-rubric')).toContainText('Explain your game');
  await t.click('.lessondetails > summary');
  await t.locator('#ld-r').selectOption({ label: '📏 Explain your game' });
  await t.click('.lessondetails .formacts button.btn-primary');
  await expect(t.locator('.lessonrubric')).toContainText('Explain your game');
  const assigned = await t.request.post(`/api/lessons/${lessonId}/assign`, { data: { classId } });
  expect(assigned.ok(), await assigned.text()).toBe(true);
  await t.goto(`/teach/lessons/${lessonId}`);
  const clId = (await t.locator(`a[href^="/class/${classId}/progress/"]`).first().getAttribute('href')).split('/').pop();
  await t.screenshot({ path: `${SHOTS}/lesson-editor-desktop.png`, fullPage: true });

  // ---- the student answers
  const s = await (await browser.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await login(s, 'DemoStudent', DEMO);
  await s.goto(`/class/${classId}/lessons/${clId}`);
  await s.locator('.answerform textarea').fill('Everyone gets the same turns. The goal is the same for both players.');
  await s.locator('.answerform button[type=submit]').click();
  await expect(s.locator('.stepcard:has(.answerform)')).toHaveClass(/is-done/);

  // ---- the teacher scores: tap a level per criterion, a comment, Save and mark reviewed
  await t.goto(`/class/${classId}/progress/${clId}`);
  const card = t.locator('.answercard:has-text("same turns")');
  await card.locator('.rb-crit').nth(0).locator('.rb-level').nth(3).click();
  await card.locator('.rb-crit').nth(1).locator('.rb-level').nth(2).click();
  await card.locator('.rb-crit').nth(2).locator('.rb-level').nth(1).click();
  await card.locator('.rb-crit').nth(1).locator('.rb-cmt > summary').click();
  await card.locator('textarea[name="cmt-1"]').fill('Two good reasons!');
  await card.locator('textarea[name=feedback]').fill('Well explained.');
  await t.screenshot({ path: `${SHOTS}/review-desktop.png`, fullPage: true });
  await card.locator('button[type=submit]').click();
  await expect(t.locator('.answercard:has-text("same turns") .st-pts')).toContainText('9/12');
  // the whole lesson
  const whole = t.locator('#lesson-rubric .answercard:has-text("Demo Student")');
  await whole.locator('.lr-det > summary').click();
  for (let i = 0; i < 3; i++) await whole.locator('.rb-crit').nth(i).locator('.rb-level').nth(2).click();
  await whole.locator('textarea[name=feedback]').fill('A strong lesson.');
  await whole.locator('button[type=submit]').click();
  await expect(t.locator('#lesson-rubric .answercard:has-text("Demo Student") .st-pts')).toContainText('9/12');

  // ---- the gradebook and the CSV
  await t.goto(`/class/${classId}/progress`);
  await expect(t.locator('#gb-lessons tr:has-text("Demo Student") .gb-pts').first()).toContainText('18/24');
  const csv = await (await t.request.get(`/class/${classId}/progress.csv`)).text();
  expect(csv).toContain('Rubric e2e lesson (rubric points)');
  expect(csv.split('\r\n').find(l => l.startsWith('Demo Student'))).toContain('18/24,75%');
  await t.screenshot({ path: `${SHOTS}/gradebook-desktop.png`, fullPage: true });

  // ---- the student sees their own result
  await s.reload();
  await expect(s.locator('.fromteacher')).toContainText('From your teacher');
  await expect(s.locator('.fromteacher')).toContainText('Two good reasons!');
  await expect(s.locator('.fromteacher .rb-total')).toContainText('9/12');
  await expect(s.locator('#from-teacher')).toContainText('A strong lesson.');
  // another classmate's page shows nothing of it (they are the seeded classmates; their pages are theirs alone)

  // ---- every new screen: phones and desktop, light and dark, Hebrew
  const teacherState = await t.context().storageState(), studentState = await s.context().storageState();
  const screens = [
    { who: teacherState, name: 'library', url: '/teach/rubrics' },
    { who: teacherState, name: 'starters', url: '/teach/rubrics?tab=starters' },
    { who: teacherState, name: 'editor', url: rubricUrl.replace(/^https?:\/\/[^/]+/, '') },
    { who: teacherState, name: 'print', url: `${rubricUrl.replace(/^https?:\/\/[^/]+/, '')}/print` },
    { who: teacherState, name: 'review', url: `/class/${classId}/progress/${clId}` },
    { who: teacherState, name: 'lesson-editor', url: `/teach/lessons/${lessonId}` },
    { who: teacherState, name: 'gradebook', url: `/class/${classId}/progress` },
    { who: studentState, name: 'student', url: `/class/${classId}/lessons/${clId}` },
  ];
  for (const v of VIEWS) {
    for (const sc of screens) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: sc.who });
      const p = await ctx.newPage(); await p.goto(sc.url);
      await layoutOk(p, `${sc.name} ${v.name}`);
      await p.screenshot({ path: `${SHOTS}/${sc.name}-${v.name}.png`, fullPage: true });
      await ctx.close();
    }
  }
  // Hebrew (RTL) on a phone, light and dark
  for (const scheme of ['light', 'dark']) {
    for (const sc of screens.filter(x => ['library', 'editor', 'review', 'student'].includes(x.name))) {
      const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: scheme, storageState: sc.who });
      await ctx.addCookies([{ name: 'lang', value: 'he', url: new URL('/', t.url()).href }]);
      const p = await ctx.newPage(); await p.goto(sc.url);
      await expect(p.locator('html')).toHaveAttribute('dir', 'rtl');
      await layoutOk(p, `${sc.name} he ${scheme}`);
      await p.screenshot({ path: `${SHOTS}/${sc.name}-he-${scheme}.png`, fullPage: true });
      await ctx.close();
    }
  }
  // Hebrew at 360: the library's current tab ("Rubrics") is scrolled into view in its sideways tab row, not cut off
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, storageState: teacherState });
    await ctx.addCookies([{ name: 'lang', value: 'he', url: new URL('/', t.url()).href }]);
    const p = await ctx.newPage(); await p.goto('/teach/rubrics');
    await expect.poll(() => p.evaluate(() => {
      const nav = document.querySelector('nav.tabs'), a = nav.querySelector('[aria-current="page"]');
      const n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
      return r.left >= n.left - 1 && r.right <= n.right + 1;
    })).toBe(true);
    await ctx.close();
  }
  // the review page: once reviewed, an answer card's rubric fields are folded away, with the total on the fold
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, storageState: teacherState });
    const p = await ctx.newPage(); await p.goto(`/class/${classId}/progress/${clId}`);
    const fold = p.locator('.answercard:has-text("same turns") details.rb-fold');
    await expect(fold).not.toHaveAttribute('open', '');
    await expect(fold.locator(':scope > summary')).toContainText('9/12');
    await ctx.close();
  }
});

test('rubric pages are for the school\'s staff only', async ({ browser }) => {
  const t = await (await browser.newContext()).newPage();
  await login(t, 'DemoTeacher', DEMO);
  const made = await t.request.post('/api/rubrics', { data: { schoolId: (await (await t.request.get('/teach/rubrics')).text()).match(/name="schoolId" value="([^"]+)"/)[1], title: 'Private rubric' } });
  const url = (await made.json()).redirect;
  const s = await (await browser.newContext()).newPage();
  await login(s, 'DemoStudent', DEMO);
  for (const path of ['/teach/rubrics', url, `${url}/print`]) expect((await s.request.get(path)).status(), path).toBe(404);
  expect((await s.request.post(`/api/rubrics/${url.split('/').pop()}`, { data: { title: 'x' } })).status()).toBe(404);
  const anon = await (await browser.newContext()).newPage();
  const r = await anon.request.get(url, { maxRedirects: 0 });
  expect(r.status()).toBe(302);
});
