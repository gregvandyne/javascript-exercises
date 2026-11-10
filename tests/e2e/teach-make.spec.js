// "Turn your lesson into a game" (/teach/make): a teacher pastes a lesson, checks the drafted questions in the set
// editor (each with the part of the lesson it came from), saves, then hosts the set live or assigns it to a class.
// The AI's answer is stubbed here (page.route): what is tested is everything around it. Without a key the page says
// drafting isn't available. A student never sees the page. Phone and desktop, light and dark: nothing touches,
// nothing scrolls sideways.
import { test, expect } from '@playwright/test';
import { findTouching } from './touching.js';
import { login } from './helpers.js';

const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const LESSON = 'Fractions with the same denominator. The denominator tells how many equal parts the whole is cut into. To add fractions with the same denominator, add the numerators and keep the denominator: 1/5 + 2/5 = 3/5.';
const DRAFT = { title: 'Fractions, same denominator', items: [
  { q: 'What does the denominator tell you?', choices: ['How many parts you have', 'How many equal parts the whole is cut into', 'Which fraction is bigger'], answer: 1, secs: 20, why: 'The denominator tells how many equal parts the whole is cut into.' },
  { q: 'What is 1/5 + 2/5?', choices: ['3/5', '3/10', '2/5', '1/5'], answer: 0, secs: 30, why: 'Add the numerators and keep the denominator: 1/5 + 2/5 = 3/5.' },
  { q: 'You add the denominators when they are the same.', choices: ['True', 'False'], answer: 1, secs: 10, why: 'Add the numerators and keep the denominator.' },
] };
test.describe.configure({ timeout: 240_000 });

async function stateOf(browser, who) {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, who.username, who.password);
  const s = await ctx.storageState(); await ctx.close(); return s;
}
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('a teacher pastes a lesson, checks the questions, saves, and assigns the quiz to a class; a student never can', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, storageState: teacher }); const t = await ctx.newPage();
  await t.goto('/teach');
  await t.locator('#teach-make').click();
  await expect(t).toHaveURL(/\/teach\/make$/);
  await expect(t.locator('h1')).toContainText('Turn your lesson into a game');
  await expect(t.locator('#mk-steps li[aria-current="step"]')).toContainText('Paste your lesson');
  await expect(t.locator('#mk-privacy')).toContainText('is not kept');
  expect(await sideways(t)).toBeLessThanOrEqual(0);
  expect(await findTouching(t)).toEqual([]);

  // Too little to work from: said on the page, nothing sent.
  let calls = 0;
  await t.route('**/api/teach/make/draft', async route => { calls++; await route.continue(); });
  await t.fill('#mk-text', 'Fractions.');
  await t.locator('#mk-go').click();
  await expect(t.locator('#mk-err')).toContainText('Paste a bit more of your lesson');
  expect(calls).toBe(0);
  // No AI key in tests: the page says so plainly and stays on step 1.
  await t.fill('#mk-text', LESSON);
  await t.locator('#mk-go').click();
  await expect(t.locator('#mk-err')).toContainText("isn't available right now");
  await expect(t.locator('#mk-1')).toBeVisible();
  await t.unroute('**/api/teach/make/draft');

  // With the AI's draft: step 2 is the editor, every question with the part of the lesson it came from.
  let sent = null;
  await t.route('**/api/teach/make/draft', async route => { sent = route.request().postDataJSON(); await route.fulfill({ json: DRAFT }); });
  await t.fill('#mk-level', 'Grade 4');
  await t.locator('#mk-go').click();
  await expect(t.locator('#mk-steps li[aria-current="step"]')).toContainText('Check the questions');
  expect(sent).toMatchObject({ text: LESSON, level: 'Grade 4', count: 10 });
  await expect(t.locator('#mk-1')).toBeHidden();
  await expect(t.locator('#lv-qlist > li')).toHaveCount(3);
  await expect(t.locator('#lv-set-title')).toHaveValue('Fractions, same denominator');
  await expect(t.locator('#lv-set-grade')).toHaveValue('Grade 4');
  await expect(t.locator('#lv-qlist .lv-why').first()).toContainText('From your lesson:');
  await expect(t.locator('#lv-qlist .lv-why').first()).toContainText('equal parts the whole is cut into');
  // The right answer is the one ticked.
  expect(await t.locator('#lv-qlist > li').first().locator('input[type=radio]').evaluateAll(l => l.findIndex(i => i.checked))).toBe(1);
  expect(await sideways(t)).toBeLessThanOrEqual(0);
  expect(await findTouching(t)).toEqual([]);
  // The teacher edits a question and removes one before saving.
  await t.locator('#lv-qlist > li').nth(1).locator('textarea').fill('What is 1/5 + 2/5 ?');
  await t.locator('#lv-qlist > li').nth(2).locator('[data-remove-q]').click();
  await expect(t.locator('#lv-qlist > li')).toHaveCount(2);
  await t.locator('#lv-set-form button[type=submit]').click();

  // Step 3: host it live, or assign it.
  await expect(t.locator('#mk-steps li[aria-current="step"]')).toContainText('Play it');
  await expect(t.locator('#mk-3')).toBeVisible();
  await expect(t).toHaveURL(/\/teach\/make$/);
  const host = await t.locator('#mk-host').getAttribute('href');
  expect(host).toMatch(/^\/live\?set=[\w-]+$/);
  const setId = host.split('=')[1];
  const saved = await (await t.request.get(`/api/live/sets/${setId}`)).json();
  expect(saved.items.map(i => i.q)).toEqual(['What does the denominator tell you?', 'What is 1/5 + 2/5 ?']);
  expect(saved.items.every(i => !('why' in i))).toBe(true);
  expect(await sideways(t)).toBeLessThanOrEqual(0);
  expect(await findTouching(t)).toEqual([]);
  // The live page opens with this set chosen.
  const live = await ctx.newPage(); await live.goto(host);
  await expect(live.locator('#lv-set')).toHaveValue(`set:${setId}`);
  await live.close();
  // Assign to the demo class: it lands in the class's lessons as a quiz.
  await t.selectOption('#mk-class', { label: 'Demo Class' });
  await t.locator('#mk-assign button[type=submit]').click();
  await expect(t).toHaveURL(/\/class\/[\w-]+\?tab=lessons/);
  await expect(t.locator('main')).toContainText('Fractions, same denominator');
  await ctx.close();

  // A student: no page, no API.
  const sctx = await browser.newContext({ storageState: await stateOf(browser, STUDENT) }); const s = await sctx.newPage();
  await s.goto('/teach/make');
  await expect(s).not.toHaveURL(/\/teach\/make/);
  expect((await s.request.post('/api/teach/make/draft', { data: { text: LESSON } })).status()).toBe(404);
  await sctx.close();
});

test('the page on a small phone and a desktop, light and dark, and in Hebrew: nothing touches or scrolls sideways', async ({ browser }) => {
  const teacher = await stateOf(browser, TEACHER);
  for (const v of [{ width: 360, height: 740, scheme: 'dark' }, { width: 1280, height: 860, scheme: 'light' }, { width: 360, height: 740, scheme: 'light', lang: 'he' }]) {
    const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, colorScheme: v.scheme, storageState: teacher });
    const p = await ctx.newPage();
    if (v.lang) await ctx.addCookies([{ name: 'lang', value: v.lang, url: test.info().project.use.baseURL }]);
    await p.route('**/api/teach/make/draft', route => route.fulfill({ json: DRAFT }));
    await p.goto('/teach/make');
    for (const step of [1, 2]) {
      expect(await sideways(p), `${v.width} ${v.scheme} ${v.lang || 'en'} step ${step}`).toBeLessThanOrEqual(0);
      expect(await findTouching(p), `${v.width} ${v.scheme} ${v.lang || 'en'} step ${step}`).toEqual([]);
      if (process.env.MAKE_SHOTS) await p.screenshot({ path: `${process.env.MAKE_SHOTS}/make-${v.width}-${v.scheme}-${v.lang || 'en'}-${step}.png`, fullPage: true });
      if (step === 1) { await p.fill('#mk-text', LESSON); await p.locator('#mk-go').click(); await expect(p.locator('#lv-qlist > li')).toHaveCount(3); }
    }
    await ctx.close();
  }
});
