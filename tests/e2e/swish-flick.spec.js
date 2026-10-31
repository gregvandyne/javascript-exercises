// Swish Flick on the Oomba Kit: the kit's title, an arcade round to its result card, a story level won with stars,
// the kit's pause screen, and no page errors in the real sandboxed frame.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

test('swish-flick: kit title, arcade to the result card, story win, pause, no errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/swish-flick');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.Oomba && Oomba.version === '1.1.0');
  await expect(f.locator('.ok-title-screen #goArcade')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('title');
  // arcade from the title's own button: a few solved shots, then the clock runs out -> the kit's card with the stats
  await f.locator('#goArcade').click();
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().mode)).toBe('arcade');
  await f.evaluate(() => { __brbTest.skipAnimations(); for (let i = 0; i < 3; i++) { __brbTest.step(400); __brbTest.flick(__brbTest.solve()); __brbTest.step(1800); } __brbTest.setTime(0.05); __brbTest.step(3000); });
  const a = await f.evaluate(() => __brbTest.state());
  expect(a.screen).toBe('results'); expect(a.baskets).toBe(3); expect(a.score).toBeGreaterThan(0);
  await expect(f.locator('#resStats div')).toHaveCount(4);
  // the menu button on the kit card goes back to the title
  await f.locator('#resMenu').click();
  await expect(f.locator('.ok-title-screen #goStory')).toBeVisible();
  // story level 1: win it, the kit's win card shows stars and Next goes on to level 2
  await f.evaluate(() => { __brbTest.start({ mode: 'story', level: 1 }); for (let i = 0; i < 2; i++) { __brbTest.step(300); __brbTest.shoot(__brbTest.solve()); __brbTest.step(4000); } __brbTest.step(1000); });
  const s = await f.evaluate(() => __brbTest.state());
  expect([s.screen, s.result, s.stars]).toEqual(['lvEnd', 'win', 3]);
  await expect(f.locator('.ok-win #lvNext')).toBeVisible();
  await f.locator('#lvNext').click();
  await expect(f.locator('.ok-win')).toHaveCount(0);
  expect(await f.evaluate(() => [__brbTest.state().level, __brbTest.state().screen])).toEqual([2, 'play']);   // skipAnimations: no level card
  // pause is the kit's pause screen; resume returns to play
  await f.locator('#pauseBtn').click();
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(true);
  await f.locator('.ok-pause .ok-go').click();
  expect(await f.evaluate(() => [__brbTest.state().screen, __brbTest.state().paused])).toEqual(['play', false]);
  expect(errors).toEqual([]);
});
