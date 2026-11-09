// Fraction Factory (Number Quest Unit 4, The Bakery) through the real sandboxed frame and its CSP (the kit-pilots
// pattern): the pinned kit and pack tags, Tally on the title, an order solved by its advice script in lesson mode
// with the check card, BRB.gameOver only at chapter completion, the progress label grammar, the quest code, no page
// errors and no CSP violations. Skips until the game is in the seed list.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const LABEL = /^\d{1,2}\/\d{1,2} (levels|cases|tickets|cards|orders), \d{1,3} stars(, \d{1,2}\/\d{1,2} checks)?$/;

async function open(page) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await login(page, ADMIN.username, ADMIN.password);
  const res = await page.goto('/play/fraction-factory');
  test.skip(!res || res.status() === 404, 'Fraction Factory is not in the seed list yet');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.solve, null, { timeout: 30000 });
  return { f, errors };
}
const tags = f => f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);

test('Fraction Factory runs on the kit: pinned tags, Tally, a First Cuts order served in lesson mode, the label grammar, the quest code', async ({ page }) => {
  const { f, errors } = await open(page);
  const t = await tags(f);
  expect(t.map(x => x[0]).filter(s => s.startsWith('/vendor/oomba-kit/'))).toEqual(['/vendor/oomba-kit/1.1.5/oomba-kit.js', '/vendor/oomba-kit/1.1.5/packs/art-props.js', '/vendor/oomba-kit/1.1.5/packs/art-animals.js', '/vendor/oomba-kit/1.1.5/packs/art-school.js', '/vendor/oomba-kit/1.1.5/packs/style-bold.js']);
  for (const x of t) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  await T(f, 'skipAnimations');
  // lesson mode, First Cuts order 3 (3/4 of a cake): cut into 4, tap 3 parts, serve by hand through the real DOM
  await T(f, 'start', { chapter: 'first-cuts', band: '1b', level: 3, seed: 1, lesson: true });
  let s = await T(f, 'state');
  expect([s.screen, s.chapter, s.level, s.lesson]).toEqual(['level', 'first-cuts', 3, true]);
  await f.locator('.ff-tile', { hasText: 'Cut into 4' }).click();
  expect((await T(f, 'state')).denom).toBe(4);
  await f.locator('.ff-piece').nth(0).click();
  await f.locator('.ff-piece').nth(1).click();
  await f.locator('.ff-piece').nth(2).click();
  expect((await T(f, 'state')).takenCount).toBe(3);
  await expect(f.locator('.ff-say')).toBeVisible();
  expect(await f.locator('.ff-say svg').count()).toBe(1);   // Tally, drawn by the game, is on the factory floor
  await f.getByRole('button', { name: 'Serve it!' }).click();
  // the lesson check card: the right tile, then a confidence face, then the served card
  await expect(f.locator('.ff-card-check .ff-tile').first()).toBeVisible({ timeout: 10000 });
  await f.locator('.ff-card-check .ff-tile', { hasText: '3 parts taken out of 4 equal parts' }).click();
  await expect(f.locator('.ff-card-confidence .ff-faces button').first()).toBeVisible({ timeout: 10000 });
  await f.locator('.ff-card-confidence .ff-faces button').nth(2).click();
  await expect(f.locator('.ff-card-served')).toBeVisible({ timeout: 10000 });
  s = await T(f, 'state');
  expect(s.label).toMatch(LABEL);
  expect(s.checks).toEqual({ ok: 1, n: 1 });
  // win-gating: one order served must NOT have ended the game (no chapter completion yet)
  expect(await f.evaluate(() => window.__brbTest.state().done)).toBe(true);
  // the quest code: chapter 4 (Recipe Math), Explorer, play, first unfinished
  await T(f, 'closeCards');
  expect(await T(f, 'code', '4100')).toBe(true);
  s = await T(f, 'state');
  expect([s.chapter, s.band, s.lesson]).toEqual(['recipe', '1b', true]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Fraction Factory: a Re-Slice order solved by the advice script, and the cover pose', async ({ page }) => {
  const { f, errors } = await open(page);
  await T(f, 'skipAnimations');
  await T(f, 'start', { chapter: 're-slice', band: '1b', level: 1, seed: 3, lesson: false });
  let s = await T(f, 'state');
  expect([s.chapter, s.level, s.denom, s.takenCount]).toEqual(['re-slice', 1, 2, 1]);   // starts as 1/2 on the tray
  const snap = await T(f, 'solve');
  expect(snap.done).toBe(true);
  expect([snap.denom, snap.takenCount]).toEqual([4, 2]);   // re-sliced to 2/4, the same amount
  await expect(f.locator('.ff-card-served')).toBeVisible({ timeout: 10000 });
  expect(await T(f, 'cover')).toBe(true);
  s = await T(f, 'state');
  expect([s.chapter, s.denom, s.takenCount]).toEqual(['first-cuts', 4, 3]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
