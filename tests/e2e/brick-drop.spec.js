// Brick Drop on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's
// title with the game's mode picker, a live round with keys, the kit's pause (P / Esc, Quit back to the title), a
// four-line clear, the results card, Zen's Finish from the pause screen, and the touch pad on a phone.
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
  await page.goto('/play/brick-drop');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.setBoard, null, { timeout: 20000 });
  return { f, errors };
}

test('Brick Drop runs on the kit: title and modes, keys, the kit pause, a BRICK BLAST, results, Zen finish', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', '/vendor/oomba-kit/1.1.0/packs/dress.js', '/vendor/oomba-kit/1.1.0/packs/art-props.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), __brbTest.state().screen])).toEqual(['1.1.0', true, 'title']);
  // the kit's title with the game's three modes; the player's character stands in the corner
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await expect(f.locator('.ok-title-screen .ok-title-hero canvas')).toHaveCount(1);
  await expect(f.locator('.mode')).toHaveCount(3);
  await f.locator('.mode[data-mode="sprint"]').click();
  await expect(f.locator('.mode[data-mode="sprint"]')).toHaveAttribute('aria-pressed', 'true');
  await f.locator('.mode[data-mode="marathon"]').click();
  await f.locator('#playBtn').click();
  // a live round: "Ready?" then the first brick; Space drops, the arrows move and turn
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 5000 }).toBe('play');
  const before = await f.evaluate(() => __brbTest.state());
  expect([before.screen, before.mode]).toEqual(['play', 'marathon']);
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Space'); await page.waitForTimeout(150); await page.keyboard.press('Space');
  await expect.poll(() => f.evaluate(() => __brbTest.state().pieces), { timeout: 3000 }).toBeGreaterThanOrEqual(before.pieces + 2);
  // P opens the kit's pause screen and closes it again; Esc opens it, Quit goes back to the title
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('pause');
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('play');
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.locator('.ok-pause button', { hasText: /quit/i }).click();
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('title');
  // the rules are unchanged: a four-line clear with a vertical Stick scores 800 at level 1
  const s = await f.evaluate(() => {
    const t = __brbTest; t.start({ mode: 'marathon', seed: 7 }); t.skipAnimations(); t.step(2000);
    t.setBoard(['111111111.', '222222222.', '333333333.', '444444444.']); t.setQueue(['I', 'T', 'O']);
    t.input('rotateCW'); for (let i = 0; i < 6; i++) t.input('right'); t.input('hard'); return t.step(600);
  });
  expect([s.lines, s.quads, s.score >= 800 && s.score < 900]).toEqual([4, 1, true]);   // 800 + 2 a row for the hard drop
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);
  // the bricks reach the top: the results card (the kit's look), Menu back to the title
  await f.evaluate(() => { const t = __brbTest; const rows = []; for (let i = 0; i < 20; i++) rows.push(i % 2 ? '8888.88888' : '88888.8888'); t.setBoard(rows); t.setQueue(['O', 'T']); t.input('hard'); t.step(500); });
  await expect(f.locator('#resultsScreen')).toBeVisible();
  expect(await f.evaluate(() => [__brbTest.state().screen, __brbTest.state().result.kind, __brbTest.state().result.best])).toEqual(['results', 'over', true]);
  await expect(f.locator('#resChips .chip.best')).toBeVisible();
  await expect(f.locator('#resultsScreen .ok-portrait')).toHaveCount(1);
  await expect(f.locator('#resGrid div')).toHaveCount(4);
  await f.locator('#resMenuBtn').click();
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  const best = await f.evaluate(() => __brbTest.state().result.score);
  await expect(f.locator('#bestM')).toContainText(String(best));
  // Zen: the pause screen has Finish, which ends the round calmly
  await f.evaluate(() => { __brbTest.skipAnimations(true); __brbTest.start({ mode: 'zen', seed: 3 }); __brbTest.step(2000); __brbTest.pause(true); });
  await expect(f.locator('.ok-pause #zenEndBtn')).toBeVisible();
  await f.locator('#zenEndBtn').click();
  await expect.poll(() => f.evaluate(() => { __brbTest.step(50); return __brbTest.state().screen; }), { timeout: 3000 }).toBe('results');
  expect(await f.evaluate(() => [__brbTest.state().result.mode, __brbTest.state().result.won])).toEqual(['zen', true]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Brick Drop on a phone: the touch pad and taps on the well play the game', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const { f, errors } = await open(page);
  await f.evaluate(() => { __brbTest.start({ mode: 'marathon', seed: 5, live: true }); });
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 5000 }).toBe('play');
  await expect(f.locator('.pbtn[data-act="hard"]')).toBeVisible();
  const p0 = await f.evaluate(() => __brbTest.state());
  await f.locator('.pbtn[data-act="rotateCW"]').tap();
  await expect.poll(() => f.evaluate(() => __brbTest.state().piece.rot)).not.toBe(p0.piece.rot);
  await f.locator('.pbtn[data-act="hold"]').tap();
  await expect.poll(() => f.evaluate(() => __brbTest.state().hold)).toBe(p0.piece.type);
  await f.locator('.pbtn[data-act="hard"]').tap();
  await expect.poll(() => f.evaluate(() => __brbTest.state().pieces)).toBeGreaterThan(p0.pieces);
  const r = await f.evaluate(() => __brbTest.state().piece.rot);
  await f.locator('#well').tap({ position: { x: 100, y: 200 } });   // a tap on the well turns the brick
  await expect.poll(() => f.evaluate(() => __brbTest.state().piece.rot)).not.toBe(r);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
  await ctx.close();
});
