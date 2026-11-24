// Castle Clash with its own chess UI (no Oomba Kit), played through the real sandboxed frame and its CSP: the home
// page, a robot game with real taps, settings, the rules (perft, a mate and the results card), two players, a lesson,
// the Beginner path, a rated puzzle whose pack loads from /vendor/data on the real server, the progress page, and no
// console errors or CSP reports.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}) } });

async function open(page) {
  await page.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errors.push(m.text()); });
  await page.goto('/play/castle-clash');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state().screen === 'home', null, { timeout: 20000 });
  return { f, errors };
}

test('Castle Clash: home, a robot game by taps, settings, a mate, two players, a lesson, puzzles and progress', async ({ page }) => {
  const { f, errors } = await open(page);
  expect(await f.evaluate(() => [...document.querySelectorAll('script[src]')].length)).toBe(0);
  expect(await f.evaluate(() => typeof window.Oomba)).toBe('undefined');
  await expect(f.locator('#homeScreen #modeRobot')).toBeVisible();
  await f.locator('#modeRobot').click();
  await expect(f.locator('#robotScreen .level')).toHaveCount(4);
  await f.locator('#robotStart').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().screen)).toBe('play');
  expect(await f.evaluate(() => [__brbTest.state().mode, __brbTest.state().legalMoves.length])).toEqual(['robot', 20]);
  await expect(f.locator('#oppBar .botFace')).toHaveCount(1);
  // a real move by taps: e2 then e4; the robot answers
  await f.evaluate(() => __brbTest.seed(5));
  const box = await page.locator('iframe').first().boundingBox();
  for (const sq of ['e2', 'e4']) { const c = await f.evaluate(s => __brbTest.squareCenter(s), sq); await page.mouse.click(box.x + c.x, box.y + c.y); await page.waitForTimeout(150); }
  await f.evaluate(() => __brbTest.idle());
  const st = await f.evaluate(() => __brbTest.state());
  expect(st.history[0]).toBe('e4'); expect(st.history.length).toBe(2); expect(st.turn).toBe('w');
  await expect(f.locator('#moves .mv.last')).toHaveCount(1);
  // settings: a board theme, then Done
  await f.locator('#setBtn').click();
  await expect(f.locator('#setScreen')).toBeVisible();
  await f.locator('#themePick button[data-theme="ocean"]').click();
  await f.locator('#setClose').click();
  expect(await f.evaluate(() => __brbTest.state().theme)).toBe('ocean');
  // home keeps the game: Keep playing brings it back
  await f.locator('#homeBtn').click();
  await expect(f.locator('#resumeBtn')).toBeVisible();
  await f.locator('#resumeBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().history.length)).toBe(2);
  // the rules: perft and a back-rank mate against the robot (a robot point and the results card)
  expect(await f.evaluate(() => __brbTest.perft(undefined, 3))).toBe(8902);
  await f.evaluate(async () => { const t = __brbTest; t.skipAnimations(true); t.start({ mode: 'robot', level: 'pawn', side: 'w', fen: '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1' }); await t.move('Ra8#'); });
  await expect(f.locator('#endScreen')).toBeVisible();
  const end = await f.evaluate(() => __brbTest.state());
  expect([end.result, end.reason, end.points]).toEqual(['1-0', 'checkmate', 1]);
  await f.locator('#peekBtn').click();
  await expect(f.locator('#unpeekBtn')).toBeVisible();
  await f.locator('#unpeekBtn').click();
  await f.locator('#endMenu').click();
  await expect(f.locator('#homeScreen')).toBeVisible();
  // two players, a lesson and a Beginner path puzzle
  await f.locator('#modeTwo').click();
  await f.locator('#twoStart').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().mode)).toBe('two');
  await f.evaluate(() => __brbTest.start({ mode: 'learn', lesson: 0 }));
  expect(await f.evaluate(() => __brbTest.state().lesson.index)).toBe(0);
  const pz = await f.evaluate(async () => { const t = __brbTest; const p = t.puzzles()[0]; t.start({ mode: 'puzzle', puzzle: 0 }); await t.move(p.solution[0]); await t.idle(); return t.state().puzzle; });
  expect(pz.solved).toBe(true);
  // a rated puzzle: its pack comes from the site's /vendor/data under the frame CSP
  const lp = await f.evaluate(async () => { const t = __brbTest; const s = await t.lp.start({ kind: 'rated' }); for (const u of t.lp.solution()) await t.move(u); await t.idle(); return [s.step, t.lp.state().solved, t.progress().r]; });
  expect(lp[0]).toBe(1); expect(lp[1]).toBe(true); expect(lp[2]).toBeGreaterThan(800);
  await f.evaluate(() => __brbTest.show('progress'));
  await expect(f.locator('#progStats .stat')).toHaveCount(8);
  expect(errors).toEqual([]);
  expect(await f.evaluate(() => window.__csp)).toEqual([]);
});
