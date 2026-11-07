// Hero of Sunvale on the Oomba Kit (1.1.5), played in the real sandboxed frame and its CSP: the pinned kit tags, the
// kit's title with the game's card, the 3D bridge (toon materials and Ink outlines), the hero maker, a talk with a kit
// portrait, the pause screen, The End with the hero and Marigold, and no console errors.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, signup } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

test('Hero of Sunvale runs on the kit: title, bridge, maker, a talk, pause and The End', async ({ page }) => {
  test.setTimeout(240_000);
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && /oomba/i.test(m.text()))) errors.push(m.text()); });
  await page.goto('/play/hero-of-sunvale');
  const f = await gameFrame(page);
  // the kit and its packs, pinned, before three.js
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.5/oomba-kit.js', '/vendor/oomba-kit/1.1.5/packs/dress.js', '/vendor/oomba-kit/1.1.5/packs/art-biomes-2.js', '/vendor/oomba-kit/1.1.5/packs/bridge-3d.js', '/vendor/oomba-kit/1.1.5/packs/live.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  // the kit's title opens while the kingdom builds (the game's card with the loading bar under the lockup)
  await expect(f.locator('.ok-title-screen.hos-title #loadBox')).toBeVisible();
  await f.waitForFunction(() => window.__brbTest.state().ready, null, { timeout: 180_000 });
  await expect(f.locator('.ok-title-screen.hos-title #newBtn')).toBeVisible();
  await expect(f.locator('.ok-title-screen .ok-title-hero canvas')).toHaveCount(1);
  expect(await f.evaluate(() => window.__brbTest.state().screen)).toBe('title');
  const look = await f.evaluate(() => window.__brbTest.kitLook());
  expect(look.version).toBe('1.1.5');
  expect(look.toon).toEqual(['MeshToonMaterial', 'MeshToonMaterial', 'MeshToonMaterial']);
  expect(look.inks).toBeGreaterThan(50); expect(look.heroInks).toBeGreaterThan(5); expect(look.title).toBe(true); expect(look.theme).toBe('castle');
  // New game -> the hero maker (the kit title closes), the intro, then play
  await f.locator('#newBtn').click();
  await expect(f.locator('#heroScreen')).toBeVisible();
  await expect(f.locator('.ok-title-screen')).toHaveCount(0);
  await expect(f.locator('#skinRow .sw')).toHaveCount(8);
  await f.locator('#skinRow .sw').nth(4).click();
  await f.locator('#makerGo').click();
  await expect(f.locator('#introScreen')).toBeVisible();
  await f.locator('#introSkip').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  expect(await f.evaluate(() => window.__brbTest.save().look.skin)).toBe(6);
  await expect(f.locator('#coinPill svg')).toHaveCount(1);
  await expect(f.locator('#pauseBtn svg')).toHaveCount(1);
  // a talk with Granny Fern: her portrait is a kit character
  await f.evaluate(() => { const t = window.__brbTest; t.manual(true); t.teleport({ x: -14, z: 333 }); t.step(0.1); t.press('interact', 0.05); t.step(0.4); });
  await expect(f.locator('#dialog')).toBeVisible();
  await expect(f.locator('#dlgPortrait canvas.ok-portrait')).toHaveCount(1);
  await f.evaluate(() => { const t = window.__brbTest; while (t.state().dialog.open) t.next(); t.manual(false); });
  // the game's pause screen (kit look) and back
  await page.keyboard.press('KeyP');
  await expect(f.locator('#pauseScreen')).toBeVisible();
  expect(await f.evaluate(() => window.__brbTest.state().paused)).toBe(true);
  await f.locator('#resumeBtn').click();
  await expect(f.locator('#pauseScreen')).toBeHidden();
  // Save and go to the title brings the kit title back; Continue plays on
  await f.evaluate(() => document.getElementById('pauseBtn').click());
  await f.locator('#quitBtn').click();
  await expect(f.locator('.ok-title-screen.hos-title #continueBtn')).toBeVisible();
  await f.locator('#continueBtn').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  // The End: the hero and Princess Marigold as kit characters, the stats with kit icons
  await f.evaluate(() => { const t = window.__brbTest; t.startMission('m11', 0); t.ending(); });
  await expect(f.locator('#endScreen')).toBeVisible();
  await expect(f.locator('#endPics canvas')).toHaveCount(2);
  await expect(f.locator('#endStats li svg')).toHaveCount(5);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

// A signed-in player who designed their character on the Me page plays as it: the title shows it, the hero maker
// starts from it (skin, hair, hair colour, clothes) and offers it again as "My Oomba character".
test('Hero of Sunvale: the player\'s own Oomba character is the default hero', async ({ page }) => {
  test.setTimeout(240_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await signup(page);
  const ch = { species: 'kid', skin: 6, hair: { style: 'braids', color: 'copper' }, outfit: { top: 'hoodie', color: 'grape' } };
  expect(await page.evaluate(async c => (await fetch('/api/me/character', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ character: c }) })).status, ch)).toBe(200);
  await page.goto('/play/hero-of-sunvale');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest.state().ready, null, { timeout: 180_000 });
  expect(await f.evaluate(() => BRB.user.character.skin)).toBe(6);
  await f.locator('#newBtn').click();
  await expect(f.locator('#meBtn')).toBeVisible();
  await expect(f.locator('#meBtn')).toHaveAttribute('aria-pressed', 'true');
  await expect(f.locator('#meBtn canvas')).toHaveCount(1);
  // a different look, then back to their own character with the chip
  await f.locator('#randomBtn').click();
  await f.locator('#meBtn').click();
  await expect(f.locator('#meBtn')).toHaveAttribute('aria-pressed', 'true');
  await f.locator('#makerGo').click();
  await f.locator('#introSkip').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  const look = await f.evaluate(() => window.__brbTest.save().look);
  expect([look.skin, look.hair, look.hairColor, look.outfit]).toEqual([5, 2, 3, 3]);
  expect(errors).toEqual([]);
});

// The cartoon look (kit 1.1.5, the 3D bridge's opt-in style): ?style=cartoon on the play page goes on to the frame as
// the kit's okStyle, and Hero of Sunvale (which offers the style) draws the style sheet's look: the cel shader, the Ink
// palette, rounded boxes, no shadow maps, lamp halos. Without it, or with a style the site does not know, nothing changes.
test('Hero of Sunvale: ?style=cartoon loads the cartoon look, and the default is unchanged', async ({ page }) => {
  test.setTimeout(400_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const open = async q => {
    await page.goto('/play/hero-of-sunvale' + q);
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.__brbTest.state().ready, null, { timeout: 180_000 });
    return f;
  };
  // the default look, exactly as before
  let f = await open('');
  expect(f.url()).not.toContain('okStyle');
  let look = await f.evaluate(() => window.__brbTest.kitLook());
  expect([look.version, look.style, look.program, look.rounded, look.halos, look.ground]).toEqual(['1.1.5', 'playful', 'okToon', false, 0, '#7ccf4f']);
  // a style the site does not know is not passed on
  f = await open('?style=bogus');
  expect(f.url()).not.toContain('okStyle');
  expect((await f.evaluate(() => window.__brbTest.kitLook())).style).toBe('playful');
  // the cartoon look
  f = await open('?style=cartoon');
  expect(f.url()).toContain('?okStyle=cartoon');
  look = await f.evaluate(() => window.__brbTest.kitLook());
  expect([look.version, look.style, look.program, look.shadows, look.rounded]).toEqual(['1.1.5', 'cartoon', 'okCel', false, true]);
  expect(look.toon).toEqual(['MeshToonMaterial', 'MeshToonMaterial', 'MeshToonMaterial']);
  expect(look.inks).toBeGreaterThan(50); expect(look.heroInks).toBeGreaterThan(5); expect(look.halos).toBeGreaterThan(5);
  expect(look.ground).toBe(await f.evaluate(() => Oomba.color('mint', 2).toLowerCase()));
  await expect(f.locator('.ok-title-screen.hos-title #newBtn')).toBeVisible();
  // the same game: the hero maker, play, a fight with the slimes at Sunny Farm (blob shadows, no shadow maps), The End
  await f.locator('#newBtn').click();
  await expect(f.locator('#heroScreen')).toBeVisible();
  await f.locator('#makerGo').click();
  await f.locator('#introSkip').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  const fight = await f.evaluate(() => { const t = window.__brbTest; t.start({ mission: 'm2', step: 2 }); t.manual(true); t.teleport({ x: 175, z: 250 }); t.step(0.2); t.moveTo(175, 244, { direct: true }); t.step(2.5); const s = t.state(); t.manual(false); return { foes: s.enemiesNear.length, enc: s.encounter && s.encounter.state, shadows: s.shadows }; });
  expect(fight.foes).toBeGreaterThan(1); expect(fight.enc).toBe('active'); expect(fight.shadows).toBe(false);
  await f.evaluate(() => { const t = window.__brbTest; t.startMission('m11', 0); t.ending(); });
  await expect(f.locator('#endScreen')).toBeVisible();
  await expect(f.locator('#endPics canvas')).toHaveCount(2);
  expect(errors).toEqual([]);
});

// The breeze mockup (?style=breeze): the start pack (hero, Granny, villagers, village props, the Blobble) arrives before
// play, the world pack follows in the background, both under the frame's CSP and their pinned hashes, with no errors.
test('Hero of Sunvale: ?style=breeze loads its two model packs and plays', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/play/hero-of-sunvale?style=breeze');
  const f = await gameFrame(page);
  expect(f.url()).toContain('?okStyle=breeze');
  await f.waitForFunction(() => window.__brbTest.state().ready, null, { timeout: 180_000 });
  await expect.poll(() => f.evaluate(() => window.__brbTest.kitLook().models), { timeout: 60_000 }).toBe('ready');
  await expect.poll(() => f.evaluate(() => window.__brbTest.kitLook().world), { timeout: 60_000 }).toBe('ready');
  expect(await f.evaluate(() => window.__brbTest.kitLook().style)).toBe('breeze');
  await f.locator('#newBtn').click();
  await f.locator('#makerGo').click();
  await f.locator('#introSkip').click();
  await expect.poll(() => f.evaluate(() => window.__brbTest.state().screen)).toBe('play');
  const fight = await f.evaluate(() => { const t = window.__brbTest; t.start({ mission: 'm2', step: 2 }); t.manual(true); t.teleport({ x: 175, z: 250 }); t.step(0.2); t.moveTo(175, 244, { direct: true }); t.step(2.5); const s = t.state(); t.manual(false); return s.enemiesNear.length; });
  expect(fight).toBeGreaterThan(1);
  expect(errors).toEqual([]);
});
