// Ring Rumble (seed-games/ring-rumble.html) on the Oomba Kit: the kit's title with the game's two buttons and the
// player's own character, the wrestler select, Get ready, a fight in the real frame (CSP), the kit's pause screen with
// the game's Controls button, a two-round win and the kit's results card (Rematch! / New wrestlers), then Quit.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

const state = f => f.evaluate(() => window.__brbTest.state());

test('Ring Rumble runs on kit 1.1.0: title, select, a fight, pause, a two-round win, results, rematch and quit', async ({ page }) => {
  test.setTimeout(150_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/play/ring-rumble');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.fighters);
  expect(await f.evaluate(() => [Oomba.version, ['dress', 'art-biomes-2', 'art-animals'].every(p => Oomba.packs.includes(p))])).toEqual(['1.1.0', true]);
  // the kit's title: the lockup, "2 Players" (the kit's Play) and "Vs Computer", the key diagrams on desktop, the player's character
  await expect(f.locator('.ok-title-screen #go2')).toHaveText(/2 Players/);
  await expect(f.locator('.ok-title-screen #go1')).toHaveText(/Vs Computer/);
  await expect(f.locator('.ok-title-screen .ok-title-hero canvas')).toBeVisible();
  await expect(f.locator('#titleCtl .ctl')).toHaveCount(2);
  expect(await f.evaluate(() => window.__brbTest.keys(0))).toMatchObject({ left: 'A', right: 'D', up: 'W', punch: 'F', kick: 'G', grab: 'H', special: 'T' });
  // Vs Computer -> pick a wrestler; the computer picks another; Get ready shows player 1's keys only
  await f.locator('#go1').click();
  await expect(f.locator('#select')).toBeVisible();
  await expect(f.locator('#grid .card')).toHaveCount(8);
  await f.locator('#grid .card').first().click();
  await expect(f.locator('#ready')).toBeVisible({ timeout: 15_000 });
  await expect(f.locator('#readyCtl .ctl')).toHaveCount(1);
  await page.keyboard.press('KeyX');   // any ordinary key starts the fight
  await expect(f.locator('#vs')).toBeVisible();
  await f.evaluate(() => window.__brbTest.skipVS());
  await expect.poll(async () => (await state(f)).phase, { timeout: 15_000 }).toBe('fight');
  let st = await state(f);
  expect([st.mode, st.round, st.wins, st.hints]).toEqual(['game', 1, [0, 0], true]);
  await expect(f.locator('#topbtns')).toBeVisible();
  // a real punch from the keyboard lands
  await f.evaluate(() => { const F = window.__brbTest.fighters(); F[0].x = F[1].x - 130; F[1].ai.t = 5; });
  await page.keyboard.down('KeyF'); await page.waitForTimeout(120); await page.keyboard.up('KeyF');
  await expect.poll(() => f.evaluate(() => window.__brbTest.fighters()[1].hp), { timeout: 5000 }).toBeLessThan(100);
  // Esc: the kit's pause screen with the game's Controls button; Controls -> Back returns to it; Resume plays on
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect((await state(f)).mode).toBe('paused');
  await f.locator('.ok-pause #ctlOpen').click();
  await expect(f.locator('#controls')).toBeVisible();
  await expect(f.locator('#ctlPanel .ctl')).toHaveCount(1);
  await f.locator('#ctlClose').click();
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.locator('.ok-pause .ok-col .ok-btn').first().click();
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect((await state(f)).mode).toBe('game');
  // win two rounds: the computer is nearly out and player 1 punches
  for (let r = 1; r <= 2; r++) {
    await expect.poll(async () => (await state(f)).phase, { timeout: 30_000 }).toBe('fight');
    await expect.poll(async () => {
      const ph = await f.evaluate(() => { const F = window.__brbTest.fighters(); F[1].hp = Math.min(F[1].hp, 1); F[0].x = F[1].x - 120; F[0].face = 1; return window.__brbTest.state().phase; });
      if (ph === 'fight') { await page.keyboard.down('KeyF'); await page.waitForTimeout(150); await page.keyboard.up('KeyF'); }
      return ph;
    }, { timeout: 20_000, intervals: [400] }).not.toBe('fight');
    if (r === 1) { await expect.poll(async () => (await state(f)).round, { timeout: 30_000 }).toBe(2); expect((await state(f)).wins).toEqual([1, 0]); }
  }
  // the kit's results card: the winner's picture, 3 sparks for a 2-0, the score, Rematch! and New wrestlers
  await expect(f.locator('.ok-win')).toBeVisible({ timeout: 30_000 });
  st = await state(f);
  expect([st.mode, st.wins]).toEqual(['result', [2, 0]]);
  await expect(f.locator('.ok-win .ok-h2')).toContainText('WINS');
  await expect(f.locator('.ok-win .rr-win-pic')).toBeVisible();
  await expect(f.locator('.ok-win .rr-score')).toHaveText(/2\s*–\s*0/);
  await expect(f.locator('.ok-win #newPick')).toHaveText(/New wrestlers/);
  await f.locator('.ok-win #rematch').click();
  await expect.poll(async () => (await state(f)).mode).toBe('game');
  st = await state(f);
  expect([st.round, st.wins]).toEqual([1, [0, 0]]);
  // pause -> Quit goes back to the kit's title
  await f.locator('#pauseBtn').click();
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.locator('.ok-pause .ok-col .ok-btn').last().click();
  await expect(f.locator('.ok-title-screen #go1')).toBeVisible();
  expect((await state(f)).mode).toBe('menu');
  expect(errors).toEqual([]);
});

test('Ring Rumble on a phone in landscape: touch pads, no key strips, and the fullscreen button still goes through the SDK', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/play/ring-rumble');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.fighters);
  await expect(f.locator('#go2')).toBeVisible();
  await f.locator('#go2').click();
  await f.locator('#grid .card').nth(1).click();
  await f.locator('#grid .card').nth(4).click();
  await expect(f.locator('#vs')).toBeVisible({ timeout: 10_000 });   // no keyboard: straight to the VS splash
  await f.evaluate(() => window.__brbTest.skipVS());
  const st = await state(f);
  expect([st.mode, st.desktop, st.padsShown, st.hints]).toEqual(['game', false, [true, true], false]);
  // a touch pad button drives player 2
  await f.locator('#pad2 .pb[data-k="left"]').dispatchEvent('pointerdown', { pointerId: 7 });
  await expect.poll(() => f.evaluate(() => window.__brbTest.fighters()[1].state)).toMatch(/walk|idle/);
  await f.locator('#pad2 .pb[data-k="left"]').dispatchEvent('pointerup', { pointerId: 7 });
  const msg = page.evaluate(() => new Promise(res => addEventListener('message', e => { if (e.data && e.data.type === 'brb:fullscreen') res(e.data.on); })));
  await f.evaluate(() => document.getElementById('fsBtn').click());
  expect(await msg).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});
