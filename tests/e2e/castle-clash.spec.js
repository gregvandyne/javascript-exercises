// Castle Clash on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's
// title (Play opens the game's mode menu), a robot game with real taps, the kit's pause (P, the Board button and back,
// Change mode), the rules (perft, a mate and the results card with the winner's portrait), two players, a lesson and a
// puzzle, and no console errors.
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
  await page.goto('/play/castle-clash');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  return { f, errors };
}

test('Castle Clash runs on the kit: title, menu, a robot game, the kit pause, a mate and the results card', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', '/vendor/oomba-kit/1.1.0/packs/dress.js', '/vendor/oomba-kit/1.1.0/packs/art-biomes-2.js', '/vendor/oomba-kit/1.1.0/packs/art-props.js', '/vendor/oomba-kit/1.1.0/packs/art-animals.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), __brbTest.state().screen])).toEqual(['1.1.0', true, 'title']);
  // the kit's title: the lockup, the player's character, the game's card with Play and the totals
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await expect(f.locator('.ok-title-screen .ok-title-hero canvas')).toHaveCount(1);
  await expect(f.locator('#titleCard .chip')).toHaveCount(3);
  await f.locator('#playBtn').click();
  await expect(f.locator('#menuScreen')).toBeVisible();
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);
  // Back goes to the title again; then the robot setup and a real game
  await f.locator('#menuScreen .back').click();
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await f.locator('#playBtn').click();
  await f.locator('#modeRobot').click();
  await f.locator('#robotStart').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('play');
  expect(await f.evaluate(() => [__brbTest.state().mode, __brbTest.state().legalMoves.length])).toEqual(['robot', 20]);
  // Hoot is the kit owl (a drawn avatar) and the player's own character is in their bar
  await expect(f.locator('#meEmoji .ok-portrait')).toHaveCount(1);
  // a real move by taps: e2 then e4; the robot answers
  await f.evaluate(() => __brbTest.seed(5));
  const box = await page.locator('iframe').first().boundingBox();
  for (const sq of ['e2', 'e4']) { const c = await f.evaluate(s => __brbTest.squareCenter(s), sq); await page.mouse.click(box.x + c.x, box.y + c.y); await page.waitForTimeout(150); }
  await f.evaluate(() => __brbTest.idle());
  const st = await f.evaluate(() => __brbTest.state());
  expect(st.history[0]).toBe('e4'); expect(st.history.length).toBe(2); expect(st.turn).toBe('w');
  // P opens the kit's pause (with the game's note and Board button); Board opens the board settings, Done returns
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await expect(f.locator('.ok-pause #pauseText')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(true);
  await f.locator('#pauseSettings').click();
  await expect(f.locator('#setScreen')).toBeVisible();
  await f.locator('#setClose').click();
  await expect(f.locator('.ok-pause')).toBeVisible();
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(false);
  // Esc opens it too; Change mode goes back to the mode menu and the game is kept for Keep playing
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.locator('#pauseMenu').click();
  await expect(f.locator('#menuScreen')).toBeVisible();
  await f.locator('#menuScreen .back').click();
  await expect(f.locator('#titleCard #resumeBtn')).toBeVisible();
  await f.locator('#resumeBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().history.length)).toBe(2);
  // the rules are the same: perft and a back-rank mate against the robot (a robot point, the player's portrait)
  expect(await f.evaluate(() => __brbTest.perft(undefined, 3))).toBe(8902);
  await f.evaluate(async () => { const t = __brbTest; t.skipAnimations(true); t.start({ mode: 'robot', level: 'pawn', side: 'w', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' }); await t.move('Ra8#'); });
  await expect(f.locator('#endScreen')).toBeVisible();
  const end = await f.evaluate(() => __brbTest.state());
  expect([end.result, end.reason, end.points]).toEqual(['1-0', 'checkmate', 1]);
  await expect(f.locator('#endPic .ok-portrait')).toHaveCount(1);
  await expect(f.locator('#endChips .chip')).toHaveCount(2);
  await f.locator('#peekBtn').click();
  await expect(f.locator('#unpeekBtn')).toBeVisible();
  await f.locator('#unpeekBtn').click();
  await f.locator('#endMenu').click();
  await expect(f.locator('#menuScreen')).toBeVisible();
  // two players: the animals are kit characters; a lesson and a puzzle still play
  await f.locator('#modeTwo').click();
  await expect(f.locator('#nickPicW .ok-portrait')).toHaveCount(1);
  await f.locator('#twoStart').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().mode)).toBe('two');
  await expect(f.locator('#oppEmoji .ok-portrait')).toHaveCount(1);
  await f.evaluate(() => __brbTest.start({ mode: 'learn', lesson: 0 }));
  expect(await f.evaluate(() => __brbTest.state().lesson.index)).toBe(0);
  const pz = await f.evaluate(async () => { const t = __brbTest; t.skipAnimations(true); const p = t.puzzles()[0]; t.start({ mode: 'puzzle', puzzle: 0 }); await t.move(p.solution[0]); await t.idle(); return t.state().puzzle; });
  expect(pz.solved).toBe(true);
  expect(errors).toEqual([]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
});
