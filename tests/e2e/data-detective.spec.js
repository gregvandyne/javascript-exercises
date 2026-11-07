// Data Detective (CS Quest unit 3) through the real sandboxed frame and its CSP (the kit-pilots pattern): the pinned kit
// and pack tags, the test hooks, a case solved by its tap script in lesson mode with the Case-closed card, the progress
// label grammar, the quest-code keypad, no page errors and no CSP violations. Skips until the game is in the seed list.
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
  const res = await page.goto('/play/data-detective');
  test.skip(!res || res.status() === 404, 'Data Detective is not in the seed list yet');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.solve, null, { timeout: 30000 });
  return { f, errors };
}
const tags = f => f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);

test('Data Detective runs on the kit: pinned tags, Dot on the title, a Sort & Group case closed in lesson mode, the label grammar, the keypad', async ({ page }) => {
  const { f, errors } = await open(page);
  const t = await tags(f);
  expect(t.map(x => x[0]).filter(s => s.startsWith('/vendor/oomba-kit/'))).toEqual(['/vendor/oomba-kit/1.1.5/oomba-kit.js', '/vendor/oomba-kit/1.1.5/packs/art-props.js', '/vendor/oomba-kit/1.1.5/packs/dress.js', '/vendor/oomba-kit/1.1.5/packs/style-bold.js']);
  for (const x of t) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, Oomba.packs.sort().join(','), typeof __brbTest.setTheme])).toEqual(['1.1.5', 'art-props,dress,style-bold', 'function']);
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  await T(f, 'skipAnimations');
  await T(f, 'start', { chapter: 'sort', band: '1b', level: 1, seed: 1, lesson: true });
  let s = await T(f, 'state');
  expect([s.screen, s.chapter, s.level, s.evidence, s.mode]).toEqual(['play', 'sort', 1, false, 'play']);
  await expect(f.locator('tr[data-row]')).toHaveCount(10);
  // the Show-me rule: the sort header unlocks the claim; the evidence row closes the case
  await f.locator('.hdr[aria-label*="When"]').click();
  expect((await T(f, 'state')).evidence).toBe(true);
  await T(f, 'claim', 0);
  await f.locator('tr[data-row="r8"]').click();
  expect((await T(f, 'state')).solved).toBe(true);
  // the Case-closed card (lesson mode): the right tile, then a confidence face
  await expect(f.locator('.ok-ask .ok-tile').first()).toBeVisible({ timeout: 10000 });
  await f.locator('.ok-ask .ok-tile', { hasText: 'Puts the rows in order' }).click();
  await expect(f.locator('.dd-modal .faces button').first()).toBeVisible({ timeout: 10000 });
  await f.locator('.dd-modal .faces button').nth(2).click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().level), { timeout: 10000 }).toBe(2);
  s = await T(f, 'state');
  expect(s.scoreCalls[0]).toEqual({ score: 3, label: '1/6 cases, 3 stars, 1/1 checks' });
  expect(s.label).toMatch(LABEL);
  // the quest-code keypad: twelve keys, digits shown in groups, a bad code refused
  await T(f, 'keypad');
  await expect(f.locator('.dd-modal .keys button')).toHaveCount(12);
  expect(await f.locator('.dd-modal .code').textContent()).toBe('_ _ _ _');
  await T(f, 'closeDialog');
  expect(await T(f, 'code', '9 9 0 0')).toBe(false);
  expect(await T(f, 'code', '5 2 0 0')).toBe(true);
  s = await T(f, 'state');
  expect([s.chapter, s.band, s.lesson]).toEqual(['models', '2', true]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Data Detective: My Data tally mode through the quest code, a chart made and the charts-made label', async ({ page }) => {
  const { f, errors } = await open(page);
  await T(f, 'skipAnimations');
  expect(await T(f, 'code', '7 1 2 0')).toBe(true);
  let s = await T(f, 'state');
  expect([s.chapter, s.mode, s.preset]).toEqual(['my-data', 'tally', 'pets']);
  await expect(f.locator('.step .ibtn')).toHaveCount(12);
  expect(await T(f, 'solve')).toBe(true);
  await expect(f.locator('.ok-ask .ok-tile').first()).toBeVisible({ timeout: 10000 });
  await f.locator('.ok-ask .ok-tile', { hasText: 'Not yet' }).click();
  await f.locator('.dd-modal .faces button').nth(2).click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().level), { timeout: 10000 }).toBe(2);
  s = await T(f, 'state');
  expect(s.scoreCalls[0]).toEqual({ score: 1, label: '1 charts made' });
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
