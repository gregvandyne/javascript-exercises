// Munch Maze on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's
// title with the game's mode and maze picker, keys and swipes steering Munch, the kit's pause (P / Escape), a
// Super Snack, game over with the results card, and back to the title. No page errors, no CSP violations.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function open(page) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/munch-maze');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.placeGloop, null, { timeout: 20000 });
  return { f, errors };
}

test('Munch Maze runs on the kit: tags, title, keys, the kit pause, a Super Snack, game over and the results card', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', '/vendor/oomba-kit/1.1.0/packs/dress.js', '/vendor/oomba-kit/1.1.0/packs/art-biomes-2.js',
    '/vendor/oomba-kit/1.1.0/packs/art-props.js', '/vendor/oomba-kit/1.1.0/packs/art-school.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, Oomba.packs.slice().sort().join(','), typeof __brbTest.setTheme])).toEqual(['1.1.0', 'art-biomes-2,art-props,art-school,dress', 'function']);
  // the kit's title with the game's card: pick Easy and the Mint maze, then Play
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await f.locator('#playEasy').click();
  await f.locator('#mazePick [data-maze=mint]').click();
  await f.locator('#playBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('play');
  expect(await f.evaluate(() => [__brbTest.state().mode, __brbTest.state().maze, __brbTest.state().lives])).toEqual(['easy', 'mint', 5]);
  // a classic game with exact time: keys steer Munch, dots are eaten
  await f.evaluate(() => { __brbTest.manual(true); __brbTest.start({ mode: 'classic', seed: 7, maze: 'candy' }); __brbTest.skipAnimations(true); __brbTest.step(50); __brbTest.skipAnimations(false); });
  await page.keyboard.down('ArrowLeft'); await page.keyboard.up('ArrowLeft');
  const s1 = await f.evaluate(() => __brbTest.step(1500));
  expect(s1.munch.dir).toBe('left'); expect(s1.score).toBeGreaterThan(0);
  // P opens the kit's pause screen; P again resumes; Escape opens it and Escape closes it
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await expect(f.locator('.ok-pause #pauseInfo')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(true);
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(false);
  // a Super Snack: the Gloops out in the maze turn blue
  expect((await f.evaluate(() => __brbTest.frighten())).frightLeft).toBeGreaterThan(0);
  // caught three times: game over, then the kit-styled results card with Play again / Menu
  const end = await f.evaluate(() => {
    const t = __brbTest; t.skipAnimations(true);
    for (let i = 0; i < 8; i++) { const s = t.step(4000); if (s.over) break; t.placeGloop(0, s.munch.x, s.munch.y, 'left'); }
    return t.step(100);
  });
  expect(end.over).toBe(true);
  await expect(f.locator('#overScreen')).toBeVisible();
  expect(await f.evaluate(() => Oomba.scene)).toBe('results');
  await f.locator('#againBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().over)).toBe(false);
  await f.evaluate(() => __brbTest.quit());
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Munch Maze on a phone: the on-screen arrows and a swipe steer Munch; the arrow-buttons switch is kept', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  const { f, errors } = await open(page);
  await expect(f.locator('#padToggle')).toHaveAttribute('aria-pressed', 'true');
  await f.evaluate(() => { __brbTest.manual(true); __brbTest.start({ mode: 'classic', seed: 2, maze: 'candy' }); __brbTest.skipAnimations(true); __brbTest.step(50); __brbTest.skipAnimations(false); });
  await expect(f.locator('#pad [data-dir=right]')).toBeVisible();
  await f.locator('#pad [data-dir=right]').dispatchEvent('pointerdown', { pointerId: 3 });
  await f.locator('#pad [data-dir=right]').dispatchEvent('pointerup', { pointerId: 3 });
  expect((await f.evaluate(() => __brbTest.step(600))).munch.dir).toBe('right');
  // a swipe to the left on the maze
  const b = await f.locator('#cv').boundingBox();
  await f.locator('#cv').dispatchEvent('pointerdown', { pointerId: 4, clientX: b.x + 200, clientY: b.y + 200 });
  await f.evaluate(([x, y]) => window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 4, clientX: x, clientY: y })), [b.x + 150, b.y + 202]);
  await f.evaluate(() => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 4 })));
  expect((await f.evaluate(() => __brbTest.step(600))).munch.dir).toBe('left');
  expect(errors).toEqual([]);
  await ctx.close();
});
