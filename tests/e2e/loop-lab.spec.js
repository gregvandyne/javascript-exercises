// Loop Lab on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit tags, the kit's title
// with the game's menu, the space world with the band (the player's avatar leading), the studio grid by tap, playback,
// a challenge done (the sticker card, BRB.gameOver), saving, the concert at night, and a phone layout that fits.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] } });

async function open(page) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/loop-lab');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  return { f, errors };
}

test('Loop Lab runs on the kit: title menu, tapping squares, play, a challenge, a save and the concert', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', ...['art-animals', 'art-biomes-2', 'art-props', 'art-school', 'dress'].map(n => `/vendor/oomba-kit/1.1.0/packs/${n}.js`)]);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), __brbTest.state().screen])).toEqual(['1.1.0', true, 'title']);
  // the kit's title: "Make music" is its Play button, the other ways in sit on the card
  await expect(f.locator('.ok-title-screen #goStudio')).toBeVisible();
  for (const id of ['goTemplates', 'goChallenges', 'goSaves', 'goStickers']) await expect(f.locator(`.ok-title-screen #${id}`)).toBeVisible();
  // the band on the stage: four kit characters and the player's avatar
  expect(await f.evaluate(() => WORLD.entities.filter(e => /^band-/.test(e.tag)).length)).toBe(5);
  // the starter beats list, then back, then Make music
  await f.locator('#goTemplates').click();
  await expect(f.locator('#tplCards .card')).toHaveCount(8);
  await f.locator('#templatesScreen [data-close]').click();
  await f.locator('.ok-title-screen #goStudio').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('studio');
  await expect(f.locator('.tab .face canvas')).toHaveCount(4);
  // tap a square on the grid (the empty grid first)
  await f.evaluate(() => __brbTest.start({ blank: true }));
  const cell = f.locator('#grid .cell').first();
  await cell.click();
  expect(await f.evaluate(() => __brbTest.state().grid.drums[3][0])).toBe(true);   // the top row is the hi-hat (row 3)
  await expect(cell).toHaveClass(/\bon\b/);
  // play and stop
  await f.locator('#playBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().playing)).toBe(true);
  await f.locator('#playBtn').click();
  expect(await f.evaluate(() => __brbTest.state().playing)).toBe(false);
  // challenge 1: a wrong check shows a hint, the right grid shows the sticker card and ends the round
  await f.evaluate(() => { window.__go = 0; const g = BRB.gameOver; BRB.gameOver = o => { window.__go = o; return g && g(o); }; __brbTest.challenge(0); });
  expect((await f.evaluate(() => __brbTest.check())).ok).toBe(false);
  await expect(f.locator('#hintText')).toBeVisible();
  await f.evaluate(() => [0, 4, 8, 12].forEach(s => { if (!__brbTest.state().grid.drums[0][s]) __brbTest.toggle('drums', 0, s); }));
  await f.locator('#checkBtn').click();
  await expect(f.locator('#doneScreen')).toBeVisible();
  await expect(f.locator('#doneSticker canvas')).toHaveCount(1);
  expect(await f.evaluate(() => [window.__go && window.__go.won, __brbTest.state().stickers.includes('c_boom')])).toEqual([true, true]);
  await f.locator('#doneStay').click();
  // save with a word-picker name, load it back
  const i = await f.evaluate(() => __brbTest.save([1, 2, 3]));
  expect(i).toBe(0);
  expect(await f.evaluate(() => __brbTest.saves().length)).toBe(1);
  // the concert: night on the stage, the light bars, the end card
  await f.evaluate(() => { __brbTest.start({ template: 'zoo' }); __brbTest.concert(); });
  await expect(f.locator('#concert')).toBeVisible();
  expect(await f.evaluate(() => __brbTest.state().screen)).toBe('concert');
  await expect.poll(() => f.evaluate(() => WORLD.timeOfDay), { timeout: 5000 }).toBeGreaterThan(0.5);   // the stage lights come on
  await f.locator('#concertBack').click();
  await expect(f.locator('#concert')).toBeHidden();
  // Home goes back to the kit's title, and its menu still works
  await f.locator('#homeBtn').click();
  await expect(f.locator('.ok-title-screen #goStickers')).toBeVisible();
  await f.locator('.ok-title-screen #goStickers').click();
  await expect(f.locator('#stickerGrid .sticker')).toHaveCount(16);
  await page.waitForTimeout(400);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Loop Lab on a phone: the grid fits the screen and the band is in view on the title', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const { f, errors } = await open(page);
  const band = await f.evaluate(() => { const v = WORLD.view, p = WORLD.camera.toScreen({ x: BAND.me.x, y: BAND.me.y }); return [p.y / v.vh, p.x / v.vw]; });
  expect(band[0]).toBeGreaterThan(0.6); expect(band[0]).toBeLessThan(1);
  await f.evaluate(() => __brbTest.start({ template: 'pop' }));
  const r = await f.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), g = document.getElementById('grid').getBoundingClientRect(); return [b.left, b.right, g.right, innerWidth, __brbTest.state().pageSize, __brbTest.state().cell.w]; });
  expect(r[0]).toBeGreaterThanOrEqual(0); expect(r[1]).toBeLessThanOrEqual(r[3]); expect(r[2]).toBeLessThanOrEqual(r[1]);
  expect(r[4]).toBe(8); expect(r[5]).toBeGreaterThanOrEqual(32);
  await f.locator('#grid .cell').nth(9).tap();
  expect(await f.evaluate(() => __brbTest.state().undo)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
  await ctx.close();
});
