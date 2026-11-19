// A game card in "All my games" on a phone: Edit and Play keep their icon beside the word (the ✏️ used to wrap above
// "Edit") and Play's ▶ keeps its size (the SVG was squeezed to a dot in a shrinking flex button).
import { test, expect } from '@playwright/test';
import { teacherSignup, templateGame, publishFromStudio } from './helpers.js';

test('phone: Edit and Play on a game card are one line each, with full-size icons', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await teacherSignup(page);
  await templateGame(page, { template: 'catch' });
  await publishFromStudio(page, 'private');
  await page.goto('/build');
  const row = page.locator('.shelf-game .mg-row').first();
  const edit = row.locator('a.btn', { hasText: 'Edit' }), play = row.locator('a.btn', { hasText: 'Play' });
  await expect(edit).toBeVisible(); await expect(play).toBeVisible();
  const lineH = async l => (await l.evaluate(el => parseFloat(getComputedStyle(el).lineHeight) || 20));
  for (const b of [edit, play]) {
    const box = await b.boundingBox(), lh = await lineH(b);
    expect(box.height, 'one line, not the icon above the word').toBeLessThan(lh * 2 + 24);
  }
  const svg = await play.locator('svg').boundingBox();
  expect(svg.width).toBeGreaterThanOrEqual(12);
  if (process.env.SHOT) await page.locator('.shelf-game').first().screenshot({ path: process.env.SHOT });
});
