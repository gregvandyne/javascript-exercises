// Shark Plank on the Oomba Kit, played through the real sandboxed frame and its CSP: the pinned kit and packs, the
// kit's title, a word won with taps (the results card), a word lost to the shark, the friend's secret word, the
// keyboard (P is a letter, not pause), and the saved star total, with no page errors and no CSP violations.
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
  await page.goto('/play/shark-plank');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  return { f, errors };
}
const state = f => f.evaluate(() => __brbTest.state());
const tap = (f, l) => f.locator('#k' + l).click();

test('Shark Plank runs on the kit: title, a word won and a word lost, the results card, the saved stars', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', '/vendor/oomba-kit/1.1.0/packs/art-animals.js', '/vendor/oomba-kit/1.1.0/packs/art-school.js', '/vendor/oomba-kit/1.1.0/packs/art-props.js', '/vendor/oomba-kit/1.1.0/packs/dress.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas')])).toEqual(['1.1.0', true]);
  // the kit's title, then Play
  await expect(f.locator('.ok-title-screen h1')).toContainText('Shark');
  await f.locator('.ok-title-screen .ok-big').click();
  await expect.poll(async () => (await state(f)).screen).toBe('play');
  await expect(f.locator('.ok-hud .ok-hearts svg')).toHaveCount(6);
  // a right letter, a wrong letter (a heart lost), then the rest of the word: the results card
  let s = await state(f);
  const wrong = [...'QXZJVKWYBFGHMP'].filter(l => !s.word.includes(l));
  await tap(f, s.word[0]);
  await tap(f, wrong[0]);
  await expect(f.locator('#k' + wrong[0])).toHaveClass(/bad/);
  await expect(f.locator('#k' + s.word[0])).toHaveClass(/good/);
  s = await state(f);
  expect([s.misses, s.lives]).toEqual([1, 5]);
  for (const l of new Set(s.word)) if (!s.guessed.includes(l)) await tap(f, l);
  await expect(f.locator('#result')).toBeVisible({ timeout: 10000 });
  s = await state(f);
  expect([s.screen, s.won, s.stars]).toEqual(['result', true, 1]);
  await expect(f.locator('#resWord')).toHaveText(s.word);
  await expect(f.locator('#resSparks .ok-on')).toHaveCount(3, { timeout: 5000 });   // one miss: three sparks
  expect(await f.evaluate(() => localStorage.getItem('shark-plank-stars'))).toBe('1');
  // New word, then lose it: the shark's chomp, the word revealed, the card
  await f.locator('#resNext').click();
  await expect.poll(async () => (await state(f)).screen).toBe('play');
  s = await state(f);
  for (const l of [...'QXZJVKWYBFGHMPDCLNRSTU'].filter(l => !s.word.includes(l)).slice(0, 6)) await tap(f, l);
  await expect.poll(async () => (await state(f)).anim).toBe('chomp');
  await expect(f.locator('#result')).toBeVisible({ timeout: 20000 });
  s = await state(f);
  expect([s.over, s.won, s.lives, s.stars]).toEqual([true, false, 0, 1]);
  expect(await f.locator('#word .slot.miss').count()).toBeGreaterThan(0);   // the missing letters were revealed (in red) before the card
  await expect(f.locator('#resWord')).toHaveText(s.word);
  // the keyboard: P is a letter here (only Esc opens the pause screen)
  await f.locator('#resNext').click();
  await expect.poll(async () => (await state(f)).screen).toBe('play');
  await page.keyboard.press('p');
  expect((await state(f)).guessed).toEqual(['P']);
  expect(await f.evaluate(() => Oomba.ui.open)).toBe(0);
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  // a friend's secret word
  await f.locator('.lvl[data-l="two"]').click();
  await expect(f.locator('#secret')).toBeVisible();
  await f.locator('#secretIn').fill('é');
  await f.locator('#startSecret').click();
  await expect(f.locator('#err')).not.toBeEmpty();
  await f.locator('#secretIn').fill('Pirate');
  await f.locator('#startSecret').click();
  s = await state(f);
  expect([s.screen, s.word, s.level]).toEqual(['play', 'PIRATE', 'two']);
  await page.waitForTimeout(300);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
