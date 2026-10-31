// Footy Tycoon on the Oomba Kit: the title's setup card starts a game, a few turns play (popups answered, the bot
// takes its turns), the pause screen's Quit leaves a saved game that Continue picks up, and a win shows the champions card.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

const answerPopups = f => f.evaluate(() => { const sc = document.getElementById('scrim'); if (sc.hidden) return false; const b = [...document.querySelectorAll('#mBtns button')].find(x => !x.disabled); if (b) b.click(); return true; });

test('Footy Tycoon: kick off, play turns against the bot, pause and continue', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/footy-tycoon');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.start && document.getElementById('start'));
  expect(await f.evaluate(() => typeof Oomba === 'object' && Oomba.version)).toBe('1.1.0');
  await f.fill('#name0', 'Mia');
  await f.click('#start');
  await expect(f.locator('#board .tile')).toHaveCount(36);
  let rolls = 0;
  for (let i = 0; i < 200 && rolls < 3; i++) {
    await page.waitForTimeout(300);
    if (await answerPopups(f)) continue;
    const st = await f.evaluate(() => __brbTest.state());
    if (st.turn === 0 && await f.evaluate(() => !document.getElementById('roll').disabled)) { await f.click('#roll'); rolls++; }
  }
  expect(rolls).toBe(3);
  for (let i = 0; i < 100; i++) { if (!(await answerPopups(f)) && await f.evaluate(() => !document.getElementById('roll').disabled)) break; await page.waitForTimeout(400); }
  const st = await f.evaluate(() => __brbTest.state());
  expect(st.players[0].name).toBe('Mia');
  expect(st.players[1].bot).toBe(true);
  // pause, quit to the title: the game is saved and Continue brings it back
  await f.click('#pauseBtn');
  await f.locator('.ok-pause button', { hasText: 'Quit' }).click();
  await expect(f.locator('#resume')).toBeVisible();
  await f.click('#resume');
  await expect(f.locator('#board .tile')).toHaveCount(36);
  expect((await f.evaluate(() => __brbTest.state())).players[0].pos).toBe(st.players[0].pos);
  expect(errors).toEqual([]);
});

test('Footy Tycoon: three ticks win the league on the champions card', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/footy-tycoon');
  let f = await gameFrame(page);
  const P = (name, bot, icon, pos, checks) => ({ name, bot, icon, color: '#FF6B5B', pos, money: 900, checks });
  const save = page.waitForRequest(r => r.url().includes('/save') && r.method() === 'POST');
  await f.evaluate(s => localStorage.setItem('footy-tycoon-v3', JSON.stringify(s)), { mode: 'legends', players: [P('Mia', false, 'me', 3, 3), P('Kickbot', true, '🤖', 7, 0)], owner: {}, injured: {}, turn: 0, turnCount: 4, dice: [2, 3], deck: [], msg: { k: 'rollsAgain', v: { p: 0 } }, won: false, fresh: false });
  await save; await page.waitForTimeout(300);
  await page.goto('/'); await page.goto('/play/footy-tycoon');
  f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && document.getElementById('resume') && !document.getElementById('resume').hidden);
  await f.click('#resume');
  await f.click('#roll');
  await expect.poll(async () => { if (await f.evaluate(() => __brbTest.state().won)) return true; await answerPopups(f); return false; }, { timeout: 30000, intervals: [700] }).toBe(true);
  await expect(f.locator('#mTitle')).toContainText('Mia wins the league!');
  expect(await f.evaluate(() => JSON.parse(localStorage.getItem('footy-wallet-v1')).players.mia.trophies)).toBe(5);
  expect(errors).toEqual([]);
});
