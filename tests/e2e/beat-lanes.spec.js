// Beat Lanes on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's
// title, the song list and levels, a song judged by lane taps and keys, the kit's pause, and the results card; the
// song's kit world and the band (the player's avatar first) are on the stage behind the lanes.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Beat Lanes runs on the kit: title, songs, a judged song, the kit pause and the results card', async ({ page }) => {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/beat-lanes');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.songs, null, { timeout: 20000 });
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', ...['art-animals', 'art-biomes', 'art-biomes-2', 'art-props', 'dress'].map(p => `/vendor/oomba-kit/1.1.0/packs/${p}.js`)]);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), !!document.querySelector('.ok-ui #game #cv')])).toEqual(['1.1.0', true, true]);

  // the kit's title -> the song list -> a song's levels
  await expect(f.locator('.ok-title-screen #playBtn')).toBeVisible();
  await f.locator('#playBtn').click();
  await expect(f.locator('#scrSongs .card').first()).toBeVisible();
  expect(await f.locator('#scrSongs .card').count()).toBe(9);
  await f.locator('#scrSongs .card[data-id="twinkle"] .go').click();
  await expect(f.locator('#scrDiff .lvl.easy')).toBeVisible();

  // Normal, on the manual clock: taps on the lanes are judged like real ones
  await f.locator('#scrDiff .lvl.normal').click();
  await f.evaluate(() => __brbTest.manual(true));
  let s = await f.evaluate(() => __brbTest.state());
  expect([s.screen, s.song, s.difficulty, s.lanes, s.world.biome, s.world.cast[0]]).toEqual(['play', 'twinkle', 'normal', 4, 'space', 'me']);
  const notes = await f.evaluate(() => __brbTest.notes().slice(0, 4));
  for (const n of notes) await f.evaluate(([lane]) => __brbTest.hit(lane, 0), [n.lane]);
  s = await f.evaluate(() => __brbTest.state());
  expect([s.counts.perfect, s.combo]).toEqual([4, 4]);
  await expect(f.locator('#hud')).toBeVisible();

  // P opens the kit's pause screen (with the song's name); Escape resumes
  await f.evaluate(() => __brbTest.manual(false));
  await page.keyboard.press('p');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await expect(f.locator('.ok-pause #pauseSong')).toContainText('Twinkle');
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  expect(await f.evaluate(() => __brbTest.state().paused)).toBe(false);

  // the rest of the song, perfectly: the results card, its kit sparks and buttons
  await f.evaluate(() => { __brbTest.skipAnimations(true); __brbTest.finish({ perfect: true }); });
  await expect(f.locator('#scrResults')).toBeVisible();
  s = await f.evaluate(() => __brbTest.state());
  expect([s.screen, s.over, s.passed, s.grade, s.counts.miss]).toEqual(['results', true, true, 'S', 0]);
  await expect(f.locator('#resStars .ok-slot.ok-on')).toHaveCount(3);
  await f.locator('#resSongsBtn').click();
  await expect(f.locator('#scrSongs')).toBeVisible();
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
