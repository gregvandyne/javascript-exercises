// The course flow in a real browser (server/routes/courses.js, public/js/course.js): a kid picks Explorer, reads step 1's
// slides one at a time, passes the quick check (graded by the server), opens the game module, and step 2 unlocks.
// The server reads the slide decks from tests/fixtures/course (playwright.config.js BRB_COURSE_DIR).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const bank = JSON.parse(fs.readFileSync('seed-lessons/cs-quest/sets/u1-1b.json', 'utf8')).items;
const answerOf = id => bank.find(i => i.id === id).answer;

test('pick Explorer, read step 1, pass the check, open the game module, step 2 unlocks', async ({ page }) => {
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
    await f.locator(`input[value="${pick}"]`).check({ force: true });
    await expect(f.locator('.qq-fb')).toHaveText(i === 0 ? /Not quite/ : /Right!/);
    if (i === 0) await expect(f.locator('.qchoice.is-right')).toHaveCount(1);
    await f.locator('.qq-go').click();
  }
  await expect(page.locator('#qresult')).toContainText('You passed! 2 of 3 right.');
  await expect(page.locator('#cl-play')).toContainText('Play: Robo Route · Sequences');
  await page.locator('#cl-play').click();
  await expect(page).toHaveURL(/\/play\/robo-route\?course=cs-quest&cstep=1b-1\.1&chapter=sequences&band=1b&lock=1/);

  await page.goto('/courses/cs-quest');
  await expect(page.locator('#step-1b-1\\.1')).toHaveClass(/is-done/);
  await expect(page.locator('#step-1b-1\\.2')).toHaveClass(/is-next/);
  await expect(page.locator('.cmap-count')).toHaveText('1 of 19 steps done');
  // Nothing scrolls sideways on a phone.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
