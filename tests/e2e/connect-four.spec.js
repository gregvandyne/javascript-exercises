// Drop Four (seed-games/connect-four.html) on the Oomba Kit: the kit's title with the game's setup card, a robot game
// played through the real frame (CSP), the kit's pause screen, the results card, and a two-player series.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

const rows = list => list.map(r => [...r].map(Number));

test('Drop Four runs on kit 1.1.0: title, a robot game, pause, results and a two-player series', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/connect-four');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.setBoard);
  expect(await f.evaluate(() => [Oomba.version, Oomba.packs.includes('dress'), Oomba.packs.includes('art-animals')])).toEqual(['1.1.0', true, true]);
  // the kit's title with the game's card: who plays, the seats and the kit's Play button
  await expect(f.locator('.ok-title-screen .c4-tcard')).toBeVisible();
  await expect(f.locator('.c4-tcard [data-mode="robot"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(f.locator('.c4-tcard .seat')).toHaveCount(2);
  // tapping a seat's picture changes it (player one starts as their own character, then the kit animals)
  await f.locator('.seat .emojiBtn[data-p="0"]').click();
  expect(await f.evaluate(() => BRB.storage.get('drop-four-v1').players[0].emoji)).not.toBe('me');
  await f.locator('#playBtn').click();
  await expect(f.locator('#app')).not.toHaveClass(/offstage/);
  let st = await f.evaluate(() => window.__brbTest.state());
  expect([st.screen, st.mode, st.turn]).toEqual(['play', 'robot', 1]);
  // a real drop by tapping column 4 on the canvas, then the robot answers
  await f.evaluate(() => window.__brbTest.skipAnimations(true));
  const box = await f.locator('#board').boundingBox();
  await f.locator('#board').click({ position: { x: box.width / 2, y: box.height * 0.6 } });
  st = await f.evaluate(() => window.__brbTest.robotMove());
  expect(st.board.flat().filter(v => v === 1).length).toBe(1);
  expect(st.board.flat().filter(v => v === 2).length).toBe(1);
  expect(st.turn).toBe(1);
  // the kit's pause screen with the game's note; P again resumes
  await f.evaluate(() => window.__brbTest.pause(true));
  await expect(f.locator('.ok-pause #pauseInfo')).toBeVisible();
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect((await f.evaluate(() => window.__brbTest.state())).screen).toBe('play');
  // win against the robot: four across, then the results card with robot points
  st = await f.evaluate(async b => { const t = window.__brbTest; t.setBoard(b, 1); return t.drop(4); }, rows(['0000000', '0000000', '0000000', '0000000', '0222000', '0111020']));
  expect([st.winner, st.winningCells.length]).toEqual([1, 4]);
  await expect(f.locator('#resultScreen')).toBeVisible();
  await expect(f.locator('#resultChips .chip')).toHaveCount(2);
  expect(await f.evaluate(() => BRB.storage.get('drop-four-v1').stats.normal.w)).toBe(1);
  // two players, first to 3: game one goes to player two, then Play again starts game two with player two first
  st = await f.evaluate(async b => { const t = window.__brbTest; t.start({ mode: 'two', series: 'three' }); t.setBoard(b, 2); return t.drop(6); }, rows(['0000000', '0000000', '0000000', '0000002', '0001212', '0011212']));
  expect([st.winner, st.wins]).toEqual([2, [0, 1]]);
  await expect(f.locator('#againBtn')).toBeVisible();
  await f.locator('#againBtn').click();
  st = await f.evaluate(() => window.__brbTest.state());
  expect([st.screen, st.turn, st.wins]).toEqual(['play', 2, [0, 1]]);
  await expect(f.locator('#undoBtn')).toBeVisible();
  // back to the title
  await f.evaluate(() => window.__brbTest.quit());
  await expect(f.locator('.ok-title-screen .c4-tcard')).toBeVisible();
  expect(errors).toEqual([]);
});
