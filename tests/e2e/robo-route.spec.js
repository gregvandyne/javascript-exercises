// Robo Route through the real sandboxed frame and its CSP (kit-pilots pattern): the pinned kit tags, no CSP violations,
// a class quest by quest code, a level solved by its answer with the score label in the gradebook grammar, the Debug Lab
// and the Level Maker reached, no page errors.
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
  await page.goto('/play/robo-route');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
  return { f, errors };
}
const T = (f, fn, ...a) => f.evaluate(([n, args]) => window.__brbTest[n](...args), [fn, a]);

test('Robo Route runs on the kit: pinned tags, a quest code, a solved level with a gradebook label, the Debug Lab, the Level Maker', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.4/oomba-kit.js', '/vendor/oomba-kit/1.1.4/packs/art-props.js', '/vendor/oomba-kit/1.1.4/packs/style-bold.js']);
  for (const x of tags) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, Oomba.packs.sort().join(','), typeof __brbTest.setTheme])).toEqual(['1.1.4', 'art-props,style-bold', 'function']);
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('#tiles .rr-tile')).toHaveCount(10); // eight chapters, the daily and the quest code
  // a quest code: chapter 2 (loops), Explorer, play, first unfinished level
  await T(f, 'questCode', '2100');
  await expect.poll(() => T(f, 'state').then(s => s.levelId)).toBe('loop-1');
  await T(f, 'closeModal');
  await T(f, 'skipAnimations');
  await T(f, 'solve');
  await expect.poll(() => T(f, 'state').then(s => s.phase), { timeout: 5000 }).toBe('card');
  expect(await T(f, 'check', 0)).toBe(true);
  expect(await T(f, 'confidence', 3)).toBe(true);
  await expect.poll(() => T(f, 'state').then(s => s.label), { timeout: 5000 }).toMatch(LABEL);
  expect((await T(f, 'state')).label).toBe('1/7 levels, 3 stars, 1/1 checks');
  await expect(f.locator('.ok-ui .ok-modal.ok-win')).toBeVisible();
  await f.locator('.ok-ui .ok-modal.ok-win .ok-row .ok-hot').click();
  await expect.poll(() => T(f, 'state').then(s => s.levelId)).toBe('loop-2');
  // the Debug Lab: a starter program with one bug, the edit counter
  await T(f, 'start', { chapter: 'debug', band: '1b', seed: 1 });
  await T(f, 'closeModal');
  let s = await T(f, 'state'); expect([s.levelId, s.blocks, s.edits]).toEqual(['dbg-1', 7, 0]);
  await T(f, 'run');
  await expect.poll(() => T(f, 'verdict').then(v => v && v.failReason), { timeout: 5000 }).toBe('bump');
  // the Level Maker: task 1, a check, a code
  await T(f, 'start', { chapter: 'level-maker', band: '1b', seed: 1 });
  await T(f, 'closeModal');
  s = await T(f, 'state'); expect([s.screen, s.maker.task]).toEqual(['maker', 'mk-1']);
  expect((await T(f, 'mkCheck')).ok).toBe(false);
  await T(f, 'tool', 'floor'); await T(f, 'paint', 2, 3);
  expect((await T(f, 'mkCheck')).ok).toBe(true);
  expect(await T(f, 'mkCode')).toMatch(/^([2-9B-DF-HJ-NP-TV-Z]{4} )*[2-9B-DF-HJ-NP-TV-Z]{1,4}$/);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
