// The first official games on the Oomba Kit (spec §16 step 3 pilots), played through the real sandboxed frame and its
// CSP: Sum Racer loads the pinned kit and packs, keeps its test hooks and rules, and plays a round with taps and keys
// with no page errors and no CSP violations. Word Peek was the other pilot; it left the kit for Crossword's look
// (docs/decisions.md "Sudoku and Word Peek in Crossword's look") and its round, result card, Play again and reduced
// motion are checked in tests/unit/word-peek.test.js.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function open(page, slug) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`/play/${slug}`);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  return { f, errors };
}
const tags = f => f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));

test('Sum Racer runs on the kit: the kit title, a track, taps, the kit pause, the podium world and the results card', async ({ page }) => {
  const { f, errors } = await open(page, 'sum-racer');
  const t = await tags(f);
  expect(t.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.6/oomba-kit.js', '/vendor/oomba-kit/1.1.6/packs/art-animals.js', '/vendor/oomba-kit/1.1.6/packs/art-school.js', '/vendor/oomba-kit/1.1.6/packs/art-biomes.js', '/vendor/oomba-kit/1.1.6/packs/dress.js',
    // the pixel-art look (?style=pixel, #231)
    '/vendor/oomba-kit/1.1.6/packs/style-pixel.js', '/vendor/oomba-kit/1.1.6/packs/art-pixel.js']);
  for (const x of t) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await f.locator('#playBtn').click();
  await expect(f.locator('.tcard').first()).toBeVisible();
  await f.locator('.tcard').first().click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 8000 }).toBe('racing');
  // a right answer by tapping its tile: the tile gets the kit's tick shape
  const i = await f.evaluate(() => { const q = __brbTest.state().question; return q.choices.indexOf(q.answer); });
  await f.locator('#half0 .ans').nth(i).dispatchEvent('pointerdown');
  await expect(f.locator('#half0 .ans.isRight .mk')).toHaveCount(1);
  expect(await f.evaluate(() => __brbTest.state().correct)).toBe(1);
  // P opens the kit's pause screen; Escape resumes
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(false);
  // the rest of the race, then the podium (kit characters in the track's world) and the results card
  const r = await f.evaluate(() => __brbTest.finish({ every: 2 }));
  expect(r.screen).toBe('results');
  await expect(f.locator('#resultScreen')).toBeVisible();
  expect(await f.evaluate(() => Oomba.scene)).toBe('results');
  await f.locator('#menuBtn').click();
  await expect(f.locator('.tcard').first()).toBeVisible();
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Sum Racer two players: both halves race and answer; a click on the page around it (lost focus) keeps the race going as before the port', async ({ page }) => {
  const { f, errors } = await open(page, 'sum-racer');
  await f.evaluate(() => __brbTest.start({ track: 5, mode: 'choice', players: 2, seed: 3 }));
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 8000 }).toBe('racing');
  for (const p of [0, 1]) {
    const i = await f.evaluate(n => { const q = __brbTest.state().p[n].question; return q.choices.indexOf(q.answer); }, p);
    await f.locator(`#half${p} .ans`).nth(i).dispatchEvent('pointerdown');
  }
  await expect.poll(() => f.evaluate(() => __brbTest.state().p.map(x => x.correct))).toEqual([1, 1]);
  // the page around the game takes focus (the site's buttons, full screen): no pause screen, the race keeps its own
  // clock exactly as before the port (a hidden tab still pauses it)
  await f.evaluate(() => window.dispatchEvent(new Event('blur')));
  const t0 = await f.evaluate(() => __brbTest.state().raceTime);
  await expect.poll(() => f.evaluate(() => __brbTest.state().raceTime), { timeout: 4000 }).toBeGreaterThan(t0);
  expect(await f.evaluate(() => [__brbTest.state().paused, document.querySelectorAll('.ok-pause').length])).toEqual([false, 0]);
  await f.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(errors).toEqual([]);
});
