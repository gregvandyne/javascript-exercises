// Word Hunt (seed-games/word-hunt.html) on the Oomba Kit: the kit's title with the game's card, real drag and tap-tap
// selections through the real frame (CSP), the kit's pause screen, the results card, the daily streak and a race.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

test('Word Hunt runs on kit 1.1.0: title, real selections, pause, results, daily and a race', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/word-hunt');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.select);
  expect(await f.evaluate(() => [Oomba.version, ['dress', 'art-props', 'art-biomes', 'art-biomes-2'].every(p => Oomba.packs.includes(p))])).toEqual(['1.1.0', true]);
  // the kit's title with the game's card: daily, three levels, 13 themes + Surprise, Relax, Play and Race
  await expect(f.locator('.ok-title-screen .wh-tcard')).toBeVisible();
  await expect(f.locator('.wh-tcard [data-theme]')).toHaveCount(14);
  await expect(f.locator('.wh-tcard [data-theme] canvas')).toHaveCount(14);
  await f.locator('.wh-tcard [data-theme="ocean"]').click();
  await expect(f.locator('.wh-tcard [data-theme="ocean"]')).toHaveAttribute('aria-pressed', 'true');
  await f.locator('.wh-tcard [data-diff="medium"]').click();
  expect(await f.evaluate(() => [BRB.storage.get('word-hunt-v1').theme, BRB.storage.get('word-hunt-v1').difficulty])).toEqual(['ocean', 'medium']);
  await f.locator('#playBtn').click();
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);
  let st = await f.evaluate(() => window.__brbTest.state());
  expect([st.screen, st.theme, st.difficulty, st.grid.length]).toEqual(['play', 'ocean', 'medium', 10]);

  // a fixed puzzle, then a real drag and a real tap-tap through the frame
  st = await f.evaluate(() => window.__brbTest.start({ theme: 'space', difficulty: 'easy', seed: 3 }));
  const box = await page.locator('iframe').first().boundingBox();
  const at = async (r, c) => { const p = await f.evaluate(([r, c]) => window.__brbTest.cellCenter(r, c), [r, c]); return { x: box.x + p.x, y: box.y + p.y }; };
  const [w1, w2] = st.words;
  const a = await at(...w1.start), b = await at(...w1.end);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up();
  expect((await f.evaluate(() => window.__brbTest.state())).found).toBe(1);
  await expect(f.locator('.wchip.found')).toHaveCount(1);
  const c = await at(...w2.start), d = await at(...w2.end);
  await page.mouse.click(c.x, c.y);
  expect((await f.evaluate(() => window.__brbTest.state())).pending).toEqual(w2.start);
  await page.mouse.click(d.x, d.y);
  expect((await f.evaluate(() => window.__brbTest.state())).found).toBe(2);
  // a hint marks a word's chip; Read to me lists the words left
  const h = await f.evaluate(() => window.__brbTest.hint());
  await expect(f.locator('.wchip.hinted')).toHaveCount(1);
  expect(st.words.map(w => w.word)).toContain(h.word);
  expect((await f.evaluate(() => window.__brbTest.readWords())).length).toBe(st.words.length - 2);

  // the kit's pause screen with the game's note (its Quit says "Change theme"); P again resumes
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause #pauseInfo')).toBeVisible();
  await expect(f.locator('.ok-pause #quitBtn')).toContainText('Change theme');
  expect((await f.evaluate(() => window.__brbTest.state())).paused).toBe(true);
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect((await f.evaluate(() => window.__brbTest.state())).screen).toBe('play');

  // solve: the results card, stars, chips, points saved and sent
  st = await f.evaluate(() => { const t = window.__brbTest; t.skipAnimations(true); return t.solveAll(); });
  expect([st.screen, st.done, st.stars]).toEqual(['results', true, 2]);
  await expect(f.locator('#resultsScreen')).toBeVisible();
  await expect(f.locator('#resStars span')).toHaveCount(3);
  await expect(f.locator('#resChips .chip')).toHaveCount(3);
  await expect(f.locator('#resArt canvas')).toHaveCount(1);
  const saved = await f.evaluate(() => BRB.storage.get('word-hunt-v1'));
  expect([saved.puzzles, saved.total > 0, saved.solved.space]).toEqual([1, true, 1]);
  st = await f.evaluate(() => window.__brbTest.next());
  expect([st.screen, st.found, st.theme]).toEqual(['play', 0, 'space']);

  // the daily puzzle and its streak, on two days in a row
  st = await f.evaluate(() => { const t = window.__brbTest; t.today('2026-03-01'); t.start({ daily: true }); return t.solveAll(); });
  expect([st.daily, st.save.daily.streak]).toEqual([true, 1]);
  st = await f.evaluate(() => { const t = window.__brbTest; t.today('2026-03-02'); t.start({ daily: true }); return t.solveAll(); });
  expect(st.save.daily.streak).toBe(2);
  await expect(f.locator('#resNote')).toContainText('2 days in a row');

  // race a friend: player 1, then player 2 on the same grid, then the winner card
  st = await f.evaluate(() => { const t = window.__brbTest; t.start({ theme: 'farm', difficulty: 'easy', seed: 9, race: true }); return t.solveAll(); });
  expect(st.race.turn).toBe(0);
  await expect(f.locator('#nextBtn')).toContainText('Player 2');
  const grid = st.grid;
  st = await f.evaluate(() => window.__brbTest.next());
  expect([st.race.turn, st.grid]).toEqual([1, grid]);
  st = await f.evaluate(() => window.__brbTest.solveAll());
  expect(st.race.results.length).toBe(2);
  await expect(f.locator('#resChips .chip canvas')).toHaveCount(2);
  await expect(f.locator('#nextBtn')).toContainText('Race again');

  // back to the title (the kit's title screen again, with the game's card)
  await f.evaluate(() => window.__brbTest.quit());
  await expect(f.locator('.ok-title-screen .wh-tcard')).toBeVisible();
  expect((await f.evaluate(() => window.__brbTest.state())).screen).toBe('title');
  expect(errors).toEqual([]);
});
