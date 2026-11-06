// Escape the Post Office and Trick Inbox (Cyber Defenders' own games) in the real sandboxed frame: a lesson that
// names one lock (chapter=<lock id>&band=..&lock=1) opens that lock alone as a practice room and reports the win
// once that lock opens; the full room still waits for all six; and both games fit a phone (390x844) and a laptop
// (1280x800): the door's locked cards are solid and readable, titles wrap whole, and Trick Inbox's header pills are
// never cut short ("Messa…").
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, login, ADMIN } from './helpers.js';
import { frameProblems } from './frame-fit.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function open(page, path) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await login(page, ADMIN.username, ADMIN.password);   // course games open only inside the course; the admin may open them directly
  await page.goto(path);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.Oomba && window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
  return { f, errors };
}
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);

test('Escape: a lesson can open one practice lock; it reports the win when that lock opens', async ({ page }) => {
  const { f, errors } = await open(page, '/play/escape-the-post-office?chapter=which-pim&band=1b&lock=1');
  const s0 = await T(f, 'start', { chapter: 'which-pim', band: '1b', fresh: true });
  expect([s0.practice, s0.screen, s0.lock]).toEqual(['which-pim', 'lock', 'which-pim']);
  await expect(f.locator('.ep-pill').first()).toContainText('Lock 3: Which Pim?');
  expect(await f.locator('text=Back to the door').count()).toBe(0);   // a practice room has no door to go back to
  const done = await T(f, 'solveLock');
  expect(done.screen).toBe('practice');
  expect(done.reported).toBe(true);   // the win signal fired, once
  await expect(f.locator('.ep-practice h2')).toContainText('Which Pim?');
  // the saved room is untouched by practice: a fresh full room still has every lock closed
  const room = await T(f, 'start', { chapter: 'escape', band: '1b', fresh: true });
  expect([room.practice, room.screen, room.open.length, room.reported]).toEqual([null, 'door', 0, false]);
  expect(errors).toEqual([]);
});

for (const [w, h] of [[390, 844], [1280, 800]]) {
  test(`Escape door and Trick Inbox round fit ${w}x${h}`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h });
    const { f, errors } = await open(page, '/play/escape-the-post-office');
    await T(f, 'start', { band: '1b', fresh: true });
    await T(f, 'cover');   // two locks open, the third current, three waiting
    await page.waitForTimeout(400);
    const locked = await f.evaluate(() => [...document.querySelectorAll('.ep-lock[disabled]:not(.ep-open)')].map(b => ({ op: getComputedStyle(b).opacity, title: b.querySelector('b').getBoundingClientRect(), box: b.getBoundingClientRect(), sw: b.querySelector('b').scrollWidth, cw: b.querySelector('b').clientWidth })));
    expect(locked.length).toBe(3);
    for (const l of locked) {
      expect(+l.op).toBe(1);   // solid, not see-through
      expect(l.sw).toBeLessThanOrEqual(l.cw + 1);   // the title wraps, never cut
      expect(l.title.right).toBeLessThanOrEqual(l.box.right);
    }
    const p1 = (await frameProblems(f)).filter(p => /ep-/.test(JSON.stringify(p)) && !/offscreen/.test(JSON.stringify(p)));
    expect(p1).toEqual([]);
    await page.goto('/play/trick-inbox');
    const g = await gameFrame(page);
    await g.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
    await T(g, 'start', { chapter: 'letters', band: '1b', seed: 7, lesson: true, lock: true });
    await page.waitForTimeout(400);
    const pills = await g.evaluate(() => [...document.querySelectorAll('.ti-bar .ti-pill span')].map(s => ({ t: s.textContent, sw: s.scrollWidth, cw: s.clientWidth })));
    for (const p of pills) expect(p.sw, `pill "${p.t}" is not cut`).toBeLessThanOrEqual(p.cw + 1);
    expect(pills.map(p => p.t)).toContain('Message 1 of 6');
    expect(errors).toEqual([]);
  });
}
