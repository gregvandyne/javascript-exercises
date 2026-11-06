// Trick Inbox (Cyber Defenders Phase 2) in the real sandboxed frame (the packet-post pattern): the pinned kit
// 1.1.4 tag and its four packs, no CSP violations, a full Explorer set played through __brbTest to the win
// signal (and only there), a wrong Deliver costing a stamp-star with the missed clue named in the debrief, the
// Pro boss round's eight messages, and lesson lock mode hiding the map.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const LABEL = /^\d{1,2}\/\d{1,2} messages, \d stars$/;

async function open(page, path = '/play/trick-inbox') {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await login(page, ADMIN.username, ADMIN.password);   // a course game opens only inside the course; the admin may open it directly
  await page.goto(path);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
  return { f, errors };
}
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);

test('Trick Inbox runs on the kit: pinned tags, the set map, a full Letters round solved through the hooks', async ({ page }) => {
  const { f, errors } = await open(page);
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags.map(x => x[0]).slice(0, 5)).toEqual(['/vendor/oomba-kit/1.1.4/oomba-kit.js', '/vendor/oomba-kit/1.1.4/packs/art-props.js', '/vendor/oomba-kit/1.1.4/packs/art-animals.js', '/vendor/oomba-kit/1.1.4/packs/art-school.js', '/vendor/oomba-kit/1.1.4/packs/style-bold.js']);
  for (const x of tags.slice(0, 5)) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => Oomba.version)).toBe('1.1.4');
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  // free play: the title leads to the set map (Explorer: four sets)
  await f.locator('.ok-title-screen .ok-hot').click();
  const go = f.locator('.ok-howto .ok-hot');
  await go.waitFor({ state: 'visible', timeout: 8000 }).then(() => go.click(), () => {});
  await expect(f.locator('.ti-ch')).toHaveCount(4, { timeout: 15000 });
  // a lesson-shaped start: Letters, Explorer, seed 2 — solved perfectly through the hooks
  const s1 = await T(f, 'start', { chapter: 'letters', band: '1b', seed: 2, lesson: true, lock: true });
  expect([s1.screen, s1.chapter, s1.band, s1.lesson, s1.lock, s1.total, s1.gameOver]).toEqual(['round', 'letters', '1b', true, true, 6, false]);
  expect(await f.evaluate(() => !document.querySelector('.ti-seg'))).toBe(true);   // lock=1: no band toggle, no map
  const done = await T(f, 'solve');
  expect(done.gameOver).toBe(true);   // the win signal fires only at genuine completion
  expect(done.stars).toBe(3); expect(done.score).toBe(done.maxScore);   // a perfect round: every clue found, every best move
  expect(done.label).toMatch(LABEL); expect(done.label).toMatch(/^6\/6 messages, 3 stars$/);
  await expect(f.locator('.ok-win')).toBeVisible({ timeout: 8000 });
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Trick Inbox: a wrong Deliver costs a stamp-star and the debrief names the missed clue', async ({ page }) => {
  const { f, errors } = await open(page);
  // letters seed 2 deals lt-5 first (a prize trick hiding two clues): deliver it unjudged and unhunted
  const s1 = await T(f, 'start', { chapter: 'letters', band: '1b', seed: 2, lesson: true, lock: true });
  expect(s1.phase).toBe('hunt'); expect(s1.msgId).toBe('lt-5'); expect(s1.gameOver).toBe(false);
  await T(f, 'act', { t: 'ready' });
  await T(f, 'act', { t: 'action', action: 'deliver' });
  const s2 = await T(f, 'state');
  expect(s2.phase).toBe('debrief');
  expect(s2.stampStars).toBe(2);
  await expect(f.locator('#ti-debrief')).toContainText('costs a stamp-star');
  await expect(f.locator('#ti-debrief')).toContainText('Clues still hiding');
  await expect(f.locator('#ti-debrief')).toContainText('prize-faker');
  expect(s2.gameOver).toBe(false);   // still no win signal mid-round
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Trick Inbox: the Pro boss round runs eight messages, and the map offers all seven sets', async ({ page }) => {
  const { f, errors } = await open(page);
  await T(f, 'start', { chapter: 'boss', band: '2', seed: 5, lesson: true, lock: true });
  const s1 = await T(f, 'state');
  expect([s1.chapter, s1.band, s1.total]).toEqual(['boss', '2', 8]);
  const done = await T(f, 'solve');
  expect(done.gameOver).toBe(true); expect(done.label).toMatch(/^8\/8 messages, 3 stars$/);
  // back in free play, Pro sees all seven sets
  const s2 = await T(f, 'start', { band: '2', lesson: false, lock: false });
  expect(s2.screen).toBe('map');
  await expect(f.locator('.ti-ch')).toHaveCount(7, { timeout: 15000 });
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
