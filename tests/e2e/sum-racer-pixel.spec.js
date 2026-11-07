// Sum Racer's pixel style in the real game frame: ?style=pixel loads the kit's pixel packs and font and draws the race,
// the results and a course mission in pixel art; without it the game is the Ink look it always was (no pixel font, no
// pixel skin). The unit twin (tests/unit/sum-racer-pixel.test.js) checks the tags, the fallback and the art.
import { test, expect } from '@playwright/test';
import { gameFrame } from './helpers.js';

async function open(page, query) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  await page.goto(`/play/sum-racer${query}`);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  return { f, errors };
}
const loaded = f => f.evaluate(() => performance.getEntriesByType('resource').map(e => e.name.replace(/^.*\/vendor\/oomba-kit\/[^/]+\//, '')));

test('?style=pixel: the pixel packs, the pixel font and the pixel race', async ({ page }) => {
  const { f, errors } = await open(page, '?style=pixel');
  await expect.poll(() => f.evaluate(() => __brbTest.style()), { timeout: 15000 }).toBe('pixel');
  expect(await f.evaluate(() => [Oomba.style(), document.documentElement.classList.contains('sr-pixel'), !!Oomba.pixel.image])).toEqual(['pixel', true, true]);
  await expect.poll(async () => (await loaded(f)).filter(n => /^(packs\/(style|art)-pixel\.js|fonts\/(pixelify-latin|oomba-pixel-digits)\.woff2)$/.test(n)).sort(), { timeout: 15000 })
    .toEqual(['fonts/oomba-pixel-digits.woff2', 'fonts/pixelify-latin.woff2', 'packs/art-pixel.js', 'packs/style-pixel.js']);
  // a race: it draws, and the canvas holds only a handful of colours per row (pixel art, not anti-aliased shapes)
  const st = await f.evaluate(() => { __brbTest.start({ track: 2, seed: 3, manual: true }); __brbTest.skipAnimations(); __brbTest.step(2000); __brbTest.realtime(); return __brbTest.state(); });
  expect(st.phase).toBe('racing');
  await page.waitForTimeout(400);
  const colours = await f.evaluate(() => {
    const cv = document.querySelector('#half0 canvas'), g = cv.getContext('2d'), y = Math.round(cv.height * 0.55), d = g.getImageData(0, y, cv.width, 1).data, set = new Set();
    for (let i = 0; i < d.length; i += 4) set.add(d[i] << 16 | d[i + 1] << 8 | d[i + 2]);
    return set.size;
  });
  expect(colours).toBeGreaterThan(2);
  expect(colours).toBeLessThan(40);
  // the results: the pixel podium on the scenery canvas, the kit's world stays empty
  const end = await f.evaluate(() => __brbTest.finish({ every: 2 }));
  expect(end.screen).toBe('results');
  await page.waitForTimeout(300);
  expect(await f.evaluate(() => !document.getElementById('titleCanvas').hidden)).toBe(true);
  expect(errors).toEqual([]);
});

test('the default is unchanged: no ?style, no pixel packs in use, no pixel font, the Ink look', async ({ page }) => {
  const { f, errors } = await open(page, '');
  await page.waitForTimeout(1500);
  expect(await f.evaluate(() => [__brbTest.style(), Oomba.style(), document.documentElement.classList.contains('sr-pixel'), BRB.params.style || null]))
    .toEqual(['ink', 'playful', false, null]);
  expect((await loaded(f)).filter(n => /pixelify|pixel-digits/.test(n))).toEqual([]);
  expect(await f.evaluate(() => !!document.querySelector('.ok-pixel'))).toBe(false);
  const st = await f.evaluate(() => { __brbTest.start({ track: 1, seed: 3, manual: true }); __brbTest.skipAnimations(); __brbTest.step(1000); return __brbTest.state(); });
  expect(st.phase).toBe('racing');
  expect(errors).toEqual([]);
});

test('a Number Quest mission (level, mode, lock) races in pixel art with ?style=pixel', async ({ page }) => {
  const { f, errors } = await open(page, '?course=number-quest&cstep=explorer-2.1&level=10&mode=add&lock=1&style=pixel');
  expect(await f.evaluate(() => BRB.params)).toEqual({ mode: 'add', level: 10, lock: 1, style: 'pixel' });
  await expect.poll(() => f.evaluate(() => __brbTest.style()), { timeout: 15000 }).toBe('pixel');
  await f.locator('.ok-title-screen #playBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 20000 }).toBe('racing');
  const st = await f.evaluate(() => __brbTest.state());
  expect(st.track).toBe(10);
  expect(st.question.text).toMatch(/\+/);
  expect(errors).toEqual([]);
});
