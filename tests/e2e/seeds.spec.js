// Every launch game loads inside the sandbox with the SDK and no page errors.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

const SEEDS = [['shark-plank', 'Shark Plank'], ['ring-rumble', 'Ring Rumble'], ['footy-tycoon', 'Footy Tycoon'], ['connect-four', null], ['happy-putt', null], ['castle-clash', null], ['brick-drop', null], ['word-hunt', null], ['sum-racer', null]];

for (const [slug, title] of SEEDS) {
  test(`${slug} loads in the sandbox and shows up on Home`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    const r = await page.goto(`/g/${slug}`);
    expect(r.status()).toBe(200);
    const heading = (await page.locator('h1').first().textContent()).trim();
    if (title) expect(heading).toBe(title);
    await page.goto(`/play/${slug}`);
    const f = await gameFrame(page);
    expect(await f.evaluate(() => typeof window.BRB.sfx.play)).toBe('function');
    expect(await f.evaluate(() => document.title.length > 0)).toBe(true);
    await page.waitForTimeout(800);
    expect(errors).toEqual([]);
    await page.goto('/');
    await expect(page.locator('#featured').getByText(heading, { exact: true })).toBeVisible();
  });
}
