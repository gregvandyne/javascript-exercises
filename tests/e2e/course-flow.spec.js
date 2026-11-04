// The course flow in a real browser (server/routes/courses.js, public/js/course.js): a kid picks Explorer, reads step 1's
// slides one at a time, passes the quick check (graded by the server), opens the game module — which only starts the
// step — and step 2 unlocks only once the game itself reports the module's chapter finished (third test).
// The server reads the slide decks from tests/fixtures/course (playwright.config.js BRB_COURSE_DIR).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const bank = JSON.parse(fs.readFileSync('seed-lessons/cs-quest/sets/u1-1b.json', 'utf8')).items;
const answerOf = id => bank.find(i => i.id === id).answer;

test('pick Explorer, read step 1, pass the check, open the game module — entering alone does not finish the step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/courses/cs-quest');
  await page.locator('#band-1b').click();
  await expect(page.locator('#step-1b-1\\.1')).toHaveClass(/is-next/);
  await expect(page.locator('#step-1b-1\\.2')).toHaveClass(/is-locked/);
  await page.locator('#cmap-go').click();
  await expect(page).toHaveURL(/\/courses\/cs-quest\/1b-1\.1$/);

  // One slide at a time; the check waits for the last one.
  await expect(page.locator('#slide-1')).toBeVisible();
  await expect(page.locator('#slide-2')).toBeHidden();
  await expect(page.locator('#check')).toBeHidden();
  const slides = await page.locator('.slide').count();
  for (let i = 1; i < slides; i++) await page.locator('#deck-next').click();
  await expect(page.locator(`#slide-${slides}`)).toBeVisible();
  await expect(page.locator('#deck-next')).toHaveText(/Quick check/);
  await page.locator('#deck-next').click();
  await expect(page.locator('#check')).toBeVisible();

  // Three questions, one at a time: the first one wrong (the right one is shown), then two right.
  const qs = page.locator('.qq');
  for (let i = 0; i < 3; i++) {
    const f = qs.nth(i);
    await expect(f).toBeVisible();
    const id = await f.getAttribute('data-q');
    const pick = i === 0 ? (answerOf(id) + 1) % 4 : answerOf(id);
    // Click the choice's label, not a forced check of the radio: the forced click skips Playwright's
    // stability wait and can land on a neighbouring choice while the page above is still settling.
    await f.locator(`.qchoice:has(input[value="${pick}"])`).click();
    await expect(f.locator('.qq-fb')).toHaveText(i === 0 ? /Not quite/ : /Right!/);
    if (i === 0) await expect(f.locator('.qchoice.is-right')).toHaveCount(1);
    await f.locator('.qq-go').click();
  }
  await expect(page.locator('#qresult')).toContainText('You passed! 2 of 3 right.');
  await expect(page.locator('#cl-play')).toContainText('Play: Robo Route · Sequences');
  await page.locator('#cl-play').click();
  await expect(page).toHaveURL(/\/play\/robo-route\?course=cs-quest&cstep=1b-1\.1&chapter=sequences&band=1b&lock=1/);

  // Merely opening the game module starts the step but does not finish it: step 2 stays locked.
  await page.goto('/courses/cs-quest');
  await expect(page.locator('#step-1b-1\\.1')).toHaveClass(/is-next/);
  await expect(page.locator('#step-1b-1\\.2')).toHaveClass(/is-locked/);
  await expect(page.locator('.cmap-count')).toHaveText('0 of 19 steps done');
  // Nothing scrolls sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('fullscreen play keeps a way back to the course step', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/courses/cs-quest');
  await page.locator('#band-1b').click();
  await page.locator('#cmap-go').click();
  await expect(page).toHaveURL(/\/courses\/cs-quest\/1b-1\.1$/);
  await expect(page.locator('#slide-1')).toBeVisible();
  await expect(page.locator('#check')).toBeHidden();
  const slides = await page.locator('.slide').count();
  for (let i = 1; i < slides; i++) await page.locator('#deck-next').click();
  await expect(page.locator(`#slide-${slides}`)).toBeVisible();
  await page.locator('#deck-next').click();
  await expect(page.locator('#check')).toBeVisible();
  const qs = page.locator('.qq');
  for (let i = 0; i < 3; i++) {
    const f = qs.nth(i);
    await expect(f).toBeVisible();
    const id = await f.getAttribute('data-q');
    await f.locator(`.qchoice:has(input[value="${answerOf(id)}"])`).click();
    await expect(f.locator('.qq-fb')).toHaveText(/Right!/);
    await f.locator('.qq-go').click();
  }
  await expect(page.locator('#qresult')).toContainText('You passed! 3 of 3 right.');
  await page.locator('#cl-play').click();
  await expect(page).toHaveURL(/\/play\/robo-route\?course=cs-quest&cstep=1b-1\.1&chapter=sequences&band=1b&lock=1/);

  // The in-stage back link (.fsback) exists but stays hidden until the stage is fullscreen: fullscreen paints
  // only the stage's subtree, so the playbar's own back link can never be tapped there.
  const fsback = page.locator('.fsback');
  await expect(fsback).toHaveCount(1);
  await expect(fsback).toBeHidden();
  await expect(fsback).toHaveAttribute('href', '/courses/cs-quest/1b-1.1#play');
  await page.locator('#p-full').click();
  await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
  await expect(fsback).toBeVisible();
  // It, not the game frame, is what a tap at its centre lands on.
  await expect.poll(() => page.evaluate(() => {
    const a = document.querySelector('.fsback'), r = a.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!el && (el === a || el.closest('a') === a);
  })).toBe(true);
  await fsback.click();
  await expect(page).toHaveURL(/\/courses\/cs-quest\/1b-1\.1#play/);
});

test('finishing the game module — not entering it, not part-playing it — completes the step', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/courses/cs-quest');
  await page.locator('#band-1b').click();
  await page.locator('#cmap-go').click();
  await expect(page).toHaveURL(/\/courses\/cs-quest\/1b-1\.1$/);
  const slides = await page.locator('.slide').count();
  for (let i = 1; i < slides; i++) await page.locator('#deck-next').click();
  await page.locator('#deck-next').click();
  await expect(page.locator('#check')).toBeVisible();
  const qs = page.locator('.qq');
  for (let i = 0; i < 3; i++) {
    const f = qs.nth(i);
    await expect(f).toBeVisible();
    const id = await f.getAttribute('data-q');
    await f.locator(`.qchoice:has(input[value="${answerOf(id)}"])`).click();
    await expect(f.locator('.qq-fb')).toHaveText(/Right!/);
    await f.locator('.qq-go').click();
  }
  await expect(page.locator('#qresult')).toContainText('You passed! 3 of 3 right.');
  await page.locator('#cl-play').click();
  await expect(page).toHaveURL(/\/play\/robo-route\?course=cs-quest&cstep=1b-1\.1&chapter=sequences&band=1b&lock=1/);

  // Drive the game with its own test hooks (the way scripts/csq-shots.js does): start the locked chapter, then
  // per level solve it, answer its case card, and take the win card's button.
  const f = await gameFrame(page);
  await f.waitForFunction(() => !!window.__brbTest);
  const state = () => f.evaluate(() => window.__brbTest.state());
  await f.evaluate(() => { window.__brbTest.skipAnimations(); window.__brbTest.start({ lesson: true, lock: true, chapter: 'sequences', band: '1b' }); });
  const total = (await state()).total;
  expect(total).toBeGreaterThan(1);
  const playLevel = async () => {
    await f.evaluate(() => window.__brbTest.solve());
    await expect.poll(async () => !!((await state()).card) || (await f.locator('.ok-win').count()) > 0, { timeout: 20_000 }).toBe(true);
    if ((await state()).card) {
      await f.evaluate(() => window.__brbTest.check(0));
      await f.evaluate(() => window.__brbTest.confidence(2));
    }
    await expect(f.locator('.ok-win')).toBeVisible({ timeout: 20_000 });
    await f.locator('.ok-win button').last().click();
  };

  // One level of six is real progress, but the step is not finished and the course map must say so.
  await playLevel();
  expect((await state()).done).toBe(1);
  const midMap = await (await page.request.get('/courses/cs-quest')).text();
  expect(midMap).not.toContain('is-done" id="step-1b-1.1"');
  expect(midMap).toContain('0 of 19 steps done');

  // Finish the chapter: its end is the one moment the game reports the module won (brb:gameover), and only
  // then may the step complete.
  for (let guard = 0; (await state()).done < total && guard < 10; guard++) await playLevel();
  expect((await state()).done).toBe(total);
  await expect(f.locator('.ok-win')).toContainText('Quest complete!');
  await expect.poll(async () => (await (await page.request.get('/courses/cs-quest')).text()).includes('is-done" id="step-1b-1.1"'), { timeout: 15_000 }).toBe(true);
  await page.goto('/courses/cs-quest');
  await expect(page.locator('#step-1b-1\\.1')).toHaveClass(/is-done/);
  await expect(page.locator('#step-1b-1\\.2')).toHaveClass(/is-next/);
  await expect(page.locator('.cmap-count')).toHaveText('1 of 19 steps done');
  expect(errors).toEqual([]);
});
