// Happy Putt on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's title
// with Play 18 / Quick 9 and the players card, the hole card, a real drag-to-putt on hole 1, the pass-the-phone card,
// the kit's pause (P, Restart, Quit back to the title), and a Quick 9 round for two to the gold jacket results.
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
  await page.goto('/play/happy-putt');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.holePlan, null, { timeout: 20000 });
  return { f, errors };
}

test('Happy Putt runs on the kit: title, hole card, a drag putt, pass the phone, the kit pause, a Quick 9 to the results', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', '/vendor/oomba-kit/1.1.0/packs/dress.js', '/vendor/oomba-kit/1.1.0/packs/art-animals.js', '/vendor/oomba-kit/1.1.0/packs/art-props.js', '/vendor/oomba-kit/1.1.0/packs/art-biomes-2.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), __brbTest.state().screen, typeof __brbTest.setTheme])).toEqual(['1.1.0', true, 'title', 'function']);

  // the kit's title: Play 18 and Quick 9 in the players card, the player's character in the corner
  await expect(f.locator('.ok-title-screen #play18')).toBeVisible();
  await expect(f.locator('.ok-title-screen #play9')).toBeVisible();
  await expect(f.locator('.ok-title-screen .ok-title-hero canvas')).toHaveCount(1);
  await f.locator('#chips .chip[data-n="2"]').click();
  await expect(f.locator('#names .namerow')).toHaveCount(2);
  await expect(f.locator('#names .namerow .face canvas')).toHaveCount(2);
  await f.locator('#play18').click();

  // the hole card with Coach Mitts (a kit bear), then Tee off
  await expect(f.locator('#intro')).toBeVisible();
  await expect(f.locator('#coachFace canvas')).toHaveCount(1);
  expect(await f.evaluate(() => [__brbTest.state().screen, __brbTest.state().hole, __brbTest.state().players])).toEqual(['intro', 1, 2]);
  await f.locator('#teeOff').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('play');

  // a real drag back from the ball (straight down = aim up) putts
  const box = await f.locator('#c').boundingBox();
  const st = await f.evaluate(() => __brbTest.state()), k = box.width / 390;
  const bx = box.x + st.ball.x * k, by = box.y + st.ball.y * k;
  await page.mouse.move(bx, by); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(bx, by + i * 9 * k);
  await page.mouse.up();
  await expect.poll(() => f.evaluate(() => __brbTest.state().strokes)).toBe(1);
  await expect.poll(() => f.evaluate(() => __brbTest.state().ball.moving), { timeout: 15000 }).toBe(false);

  // finish the hole with the test shot from wherever the ball is: then player 2 gets the pass-the-phone card
  await f.evaluate(async () => {
    const T = __brbTest, h = T.holePlan()[0];
    for (let i = 0; i < 6 && T.state().current === 0 && T.state().screen === 'play'; i++) {
      const s = T.state(); if (s.ball.moving || s.ballState === 'holed') { await new Promise(r => setTimeout(r, 100)); continue; }
      T.setBall(h.tee.x, h.tee.y); await T.shoot(h.testShot.angleRad, h.testShot.power);
    }
  });
  await expect(f.locator('#pass')).toBeVisible({ timeout: 8000 });
  await expect(f.locator('#passBall canvas')).toHaveCount(1);
  await f.locator('#passGo').click();
  await expect.poll(() => f.evaluate(() => [__brbTest.state().screen, __brbTest.state().current])).toEqual(['play', 1]);

  // P opens the kit's pause screen and closes it again; Restart starts the round over; Quit goes back to the title
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('paused');
  await page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('play');
  await f.locator('#pauseBtn').click();
  await f.locator('.ok-pause .ok-quiet').filter({ hasText: /Restart/i }).click();
  await expect(f.locator('#intro')).toBeVisible();
  expect(await f.evaluate(() => [__brbTest.state().hole, __brbTest.state().current, __brbTest.state().scores])).toEqual([1, 0, [[], []]]);
  await f.locator('#teeOff').click();
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.locator('.ok-pause .ok-quiet').filter({ hasText: /Quit/i }).click();
  await expect(f.locator('.ok-title-screen #play9')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('title');

  // a fast Quick 9 for two: the ceremony and the scorecard; Quick 9 is practice (no leaderboard points)
  const end = await f.evaluate(async () => {
    const T = __brbTest; T.start({ players: 2, holes: 9, names: ['Ace', 'Birdie'] }); T.skipAnimations();
    const plan = T.holePlan();
    for (let i = 0; i < 400; i++) {
      const s = T.state(); if (s.finished) break;
      if (s.screen !== 'play' || s.ball.moving || s.ballState === 'holed') { await new Promise(r => setTimeout(r, 30)); continue; }
      const h = plan[s.hole - 1], atTee = Math.abs(s.ball.x - h.tee.x) < 1 && Math.abs(s.ball.y - h.tee.y) < 1;
      if (atTee) await T.shoot(h.testShot.angleRad, h.testShot.power);
      else await T.shoot(Math.atan2(-(h.cup.y - s.ball.y), h.cup.x - s.ball.x), Math.min(1, Math.hypot(h.cup.x - s.ball.x, h.cup.y - s.ball.y) / 420 + 0.12));
    }
    return T.state();
  });
  expect(end.finished).toBe(true);
  await expect(f.locator('#results')).toBeVisible();
  await expect(f.locator('#resultsTitle')).toContainText(/gold jacket/i);
  expect(end.scores.map(a => a.length)).toEqual([9, 9]);
  await expect(f.locator('#resultsTable tr')).toHaveCount(11);   // header + 9 holes, plus the Total row
  await f.locator('#toMenu').click();
  await expect(f.locator('.ok-title-screen #play18')).toBeVisible();

  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
