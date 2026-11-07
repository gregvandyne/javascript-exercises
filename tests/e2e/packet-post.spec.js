// Packet Post (CS Quest unit 4) in the real sandboxed frame (the kit-pilots pattern): the pinned kit 1.1.4 tag and its
// four packs, no CSP violations, the kit title screen with a Play button, a level played through __brbTest with the
// score label in the gradebook grammar, the chapter map with the Daily Crew Challenge, and the wheel tool.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;

async function open(page) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await login(page, ADMIN.username, ADMIN.password);   // a course game opens only inside the course; the admin may open it directly
  await page.goto('/play/packet-post');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
  return { f, errors };
}
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);

test('Packet Post runs on the kit: pinned tags, the title, a Lock It level solved through the hooks, the score label', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0]).slice(0, 5)).toEqual(['/vendor/oomba-kit/1.1.4/oomba-kit.js', '/vendor/oomba-kit/1.1.4/packs/art-props.js', '/vendor/oomba-kit/1.1.4/packs/art-animals.js', '/vendor/oomba-kit/1.1.4/packs/art-school.js', '/vendor/oomba-kit/1.1.4/packs/style-bold.js']);
  for (const x of tags.slice(0, 5)) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, Oomba.packs.sort().join(','), typeof __brbTest.setTheme])).toEqual(['1.1.4', 'art-animals,art-props,art-school,style-bold', 'function']);
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  // a lesson-shaped start: Lock It, Explorer, level 1 (the learn card), then the solver, then the Case-closed card and the results card
  const s1 = await T(f, 'start', { chapter: 'locks', band: '1b', level: 1, seed: 2, lesson: true, lock: true });
  expect([s1.screen, s1.chapter, s1.level, s1.band, s1.lesson, s1.lock, s1.cards]).toEqual(['level', 'locks', 1, '1b', true, true, 1]);
  await expect(f.locator('.pp-card-learn')).toBeVisible();
  await f.locator('.pp-card-learn .ok-hot').click();
  await expect(f.locator('.pp-card-learn')).toHaveCount(0);
  expect(await f.evaluate(() => !document.querySelector('.pp-seg') && !document.querySelector('.pp-pad'))).toBe(true);   // lock=1: no band toggle, no map; a live-style frame has no keypad either
  await T(f, 'skipAnimations');
  const snap = await T(f, 'solve');
  expect(snap.phase).toBe('done');
  await expect(f.locator('.ok-ask')).toBeVisible({ timeout: 8000 });   // the Case-closed card (the kit quiz card)
  await f.locator('.ok-ask .ok-tile').first().click();
  await expect(f.locator('.ok-dialog')).toBeVisible({ timeout: 8000 });   // how sure were you?
  await f.locator('.ok-dialog .ok-btn').last().click();
  await expect(f.locator('.ok-win')).toBeVisible({ timeout: 8000 });
  const s2 = await T(f, 'state');
  expect(s2.levelStars).toBe(3); expect(s2.label).toMatch(LABEL); expect(s2.label).toMatch(/^1\/6 levels, 3 stars, [01]\/1 checks$/);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

// Every packet carries its piece of the picture: the board's packets, the inbox tiles and the rebuilt slots are copies of
// the cut picture, and a copied canvas must be painted again (cloneNode keeps none of a canvas's pixels: the bug that
// left every packet a blank white square in Break It Up, Rules of the Road and the padlock road).
test('Packet Post: every packet piece shows its part of the picture (no blank squares)', async ({ page }) => {
  const { f, errors } = await open(page);
  for (const [chapter, level] of [['packets', 1], ['protocols', 1], ['protocols', 3]]) {
    await T(f, 'start', { chapter, band: '1b', level, seed: 2, lesson: false });
    await T(f, 'closeCards'); await T(f, 'skipAnimations');
    // a few moves so packets reach the board, the inbox and the slots
    for (let i = 0; i < 4; i++) { const a = await T(f, 'advice'); if (!a) break; await T(f, 'act', a); await f.page().waitForTimeout(300); }
    const pieces = await f.evaluate(() => [...document.querySelectorAll('canvas.pp-piece')].filter(c => c.getClientRects().length).map(c => {
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let ink = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) ink++;
      return ink / (c.width * c.height);
    }));
    expect(pieces.length, `${chapter} ${level}: pieces on screen`).toBeGreaterThan(0);
    // a piece is a slice of the picture, so it holds some ink (a corner slice of the apple is still well over 2%)
    expect(Math.max(...pieces), `${chapter} ${level}: the pieces have pixels`).toBeGreaterThan(0.1);
    for (const share of pieces) expect(share, `${chapter} ${level}: no blank piece`).toBeGreaterThan(0.02);
  }
  expect(errors).toEqual([]);
});

test('Packet Post: the chapter map with its six chapters and the Daily Crew Challenge, the band toggle, the wheel tool', async ({ page }) => {
  const { f, errors } = await open(page);
  await f.locator('.ok-title-screen .ok-hot').click();
  const go = f.locator('.ok-howto .ok-hot');   // the kit's first-visit how-to card
  await go.waitFor({ state: 'visible', timeout: 8000 }).then(() => go.click(), () => {});
  await expect(f.locator('.pp-map .pp-ch')).toHaveCount(7, { timeout: 15000 });   // six chapters and the daily tile
  await expect(f.locator('.pp-ch.pp-daily')).toBeVisible();
  await f.locator('.pp-seg button').nth(1).click();   // Pro
  expect((await T(f, 'state')).band).toBe('2');
  await f.locator('.pp-ch.pp-daily').click();
  await expect.poll(() => T(f, 'state').then(s => s.screen)).toBe('level');
  expect((await T(f, 'state')).daily).toBeGreaterThan(20000);
  const s = await T(f, 'start', { mode: 'wheel' });
  expect(s.screen).toBe('wheel');
  await expect(f.locator('.pp-wheel')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await expect(f.locator('.pp-shift')).toContainText('4');
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
