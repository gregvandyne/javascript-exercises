// Inside the Machine (CS Quest, computing systems) through the real sandboxed frame and its CSP, kit-pilots pattern:
// the pinned kit and pack tags, no CSP violations, the chapter map in free play, a lesson chapter played through its
// test hooks with the Case-closed card and the progress label grammar, the Pro Fix-It desk's flowchart, the quest
// keypad, and the Daily Crew Challenge. No page errors anywhere.
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
  await page.goto('/play/inside-the-machine');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
  return { f, errors };
}
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const sol = (f, id) => f.evaluate(id => window.InsideTheMachineLevels.level(id).sol, id);
const tags = f => f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));

test('Inside the Machine runs on the kit: pinned tags, the chapter map, a lesson chapter with Case-closed cards, the Pro flowchart desk, the keypad and the daily challenge', async ({ page }) => {
  const { f, errors } = await open(page);
  const t = await tags(f);
  expect(t.map(x => x[0])).toEqual(['/vendor/oomba-kit/1.1.3/oomba-kit.js', '/vendor/oomba-kit/1.1.3/packs/art-school.js', '/vendor/oomba-kit/1.1.3/packs/art-props.js', '/vendor/oomba-kit/1.1.3/packs/art-animals.js', '/vendor/oomba-kit/1.1.3/packs/dress.js', '/vendor/oomba-kit/1.1.3/packs/style-bold.js']);
  for (const x of t) expect([x[1], x[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => [Oomba.version, !!document.querySelector('.ok-stage canvas'), typeof __brbTest.step])).toEqual(['1.1.3', true, 'function']);
  // the kit title, then the chapter map in free play: six chapters for Explorer, the band toggle, the daily tile
  await expect(f.locator('.ok-title-screen .ok-hot')).toBeVisible();
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('map');
  await expect(f.locator('.im-chap')).toHaveCount(5);
  await expect(f.locator('.im-seg')).toBeVisible();
  await expect(f.locator('.im-daily')).toBeVisible();
  await f.locator('.im-seg button').nth(1).click();
  await expect(f.locator('.im-chap')).toHaveCount(6);
  // a lesson: Hardware or Software, Explorer, played with the hooks; every level ends on the Case-closed card
  let s = await T(f, 'start', { chapter: 'hw-sw', band: '1b', level: 1, seed: 3, lesson: true, lock: true });
  expect([s.screen, s.levelId, s.lock, s.lesson]).toEqual(['play', 'hwsw-1', true, true]);
  await expect(f.locator('.im-play .im-pill').first()).toContainText('Class quest');
  await expect(f.locator('.im-play .ok-btn[aria-label="Chapter map"]')).toHaveCount(0);
  if (s.modal) { await T(f, 'closeDialog'); await expect.poll(() => f.evaluate(() => __brbTest.state().modal)).toBe(false); }
  await T(f, 'skipAnimations');
  for (let i = 1; i <= 5; i++) {
    s = await T(f, 'state'); expect(s.level).toBe(i);
    await T(f, 'answer', await sol(f, s.levelId));
    await expect(f.locator('.im-modal .im-check-tiles')).toBeVisible();
    await T(f, 'check', 0);
    await expect(f.locator('.ok-win')).toBeVisible();
    s = await T(f, 'state'); expect(s.label).toMatch(LABEL);
    await T(f, 'next');
    await expect(f.locator('.ok-win')).toHaveCount(0);
  }
  s = await T(f, 'state');
  expect(s.label).toBe('5/5 levels, 15 stars, 5/5 checks');
  expect(s.modal).toBe(true);           // the Quest complete card
  await expect(f.locator('.im-modal h2')).toContainText('Quest complete');
  await T(f, 'closeDialog');
  // the Pro Fix-It desk: the flowchart first, then a swap test finds the user's own cable
  s = await T(f, 'start', { chapter: 'fixit', band: '2', level: 3, seed: 2 });
  expect([s.levelId, s.kind]).toEqual(['fixit-2-3', 'flow']);
  await T(f, 'answer', await sol(f, 'fixit-2-3'));
  const v = await T(f, 'verdict'); expect(v.ok && v.good && v.path.some(p => p.kind === 'swap' && p.hit)).toBe(true);
  await T(f, 'closeDialog'); await T(f, 'closeDialog');
  // the quest keypad: 4 2 0 0 is Bits & Pixels for Pro; the band toggle is gone in a class quest
  expect(await T(f, 'code', '4200')).toBe(true);
  s = await T(f, 'state'); expect([s.chapter, s.band, s.lesson, s.lock]).toEqual(['bits', '2', true, false]);
  // the Daily Crew Challenge: deterministic for the day, its own card
  const pick = await T(f, 'dailyPick', '2');
  s = await T(f, 'daily'); expect(s.levelId).toBe(pick.id); expect(s.daily).toBe(pick.day);
  await T(f, 'answer', await sol(f, s.levelId));
  s = await T(f, 'state'); expect(s.done).toBe(true);
  // a ticket, a persona or a gadget shows its verdict card first; the daily card follows
  const heading = async () => (await f.locator('.im-modal h2').allTextContents()).join(' ');
  await expect.poll(heading).not.toBe('');
  if (!(await heading()).includes('Daily Crew Challenge')) await T(f, 'closeDialog');
  await expect.poll(heading).toContain('Daily Crew Challenge');
  await expect(f.locator('.im-modal .im-stars')).toBeVisible();
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});
