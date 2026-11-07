// Doodle Hoot's mobile and desktop pass, as pictures: DOODLE_SHOTS=<dir> npx playwright test doodle-hoot-shots
// (skipped otherwise). A live room with a drawer and a guesser who types; each view at the sizes the game must fit
// (iPhone 375x667, 390x844 and 430x932, a small Android 360x640, a phone on its side 844x390, a tablet 820x1180, a
// laptop 1366x768, a desktop 1920x1080), light and dark: the word cards, the drawer (with the guesses list), "Who
// guessed it?", the guesser typing (and with the keyboard up: the page about 45% shorter), the reveal, the host's page,
// and on its own: practice typing and pass and play. Every view goes through tests/e2e/frame-fit.js; the problems found
// are written to problems.json beside the pictures, and the test fails on any.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, ownIp, gameFrame } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const DIR = process.env.DOODLE_SHOTS || '';
test.skip(!DIR, 'set DOODLE_SHOTS=<dir> to take the pictures');
const PHONES = [[375, 667], [390, 844], [430, 932], [360, 640], [844, 390]];
const BIG = [[820, 1180], [1366, 768], [1920, 1080]];
const ALL = [...PHONES, ...BIG];
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' };
const problems = {};
const frameOf = page => page.frames().find(x => /\/live\/frame\//.test(x.url()));
async function liveFrame(page) {
  let f = null;
  await expect.poll(async () => { f = frameOf(page); if (!f) return false; try { return !!(await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().doodleLive)); } catch { return false; } }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
async function until(f, fn, timeout = 30_000) { let s = null; await expect.poll(async () => { try { s = await state(f); return !!fn(s); } catch { return false; } }, { timeout }).toBe(true); return s; }
/** One view at one size in both themes: two pictures and the layout check. */
async function snap(page, f, name, [w, h], { kb = false, after = null } = {}) {
  await page.setViewportSize({ width: w, height: kb ? Math.round(h * 0.55) : h });
  if (after) await after();
  for (const scheme of ['light', 'dark']) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.waitForTimeout(260);
    const key = `${name}-${w}x${h}${kb ? '-kb' : ''}-${scheme}`;
    await page.screenshot({ path: path.join(DIR, `${key}.png`) });
    const p = f ? await frameProblems(f) : [];
    if (await pageScrollsSideways(page)) p.push({ kind: 'page scrolls sideways' });
    if (p.length) problems[key] = p;
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
async function player(browser, code) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await ownIp(page);
  await page.goto(`/join#${code}`);
  await page.click('#lv-join button[type=submit]');
  await page.click('#lv-go');
  await page.waitForURL(/\/live\/play\//);
  return page;
}
async function stroke(page, f, pts) {
  const box = await f.locator('.dh-board canvas').boundingBox();
  const at = i => [box.x + (pts[i] / 1000) * box.width, box.y + (pts[i + 1] / 750) * box.height];
  await page.mouse.move(...at(0)); await page.mouse.down();
  for (let i = 2; i < pts.length; i += 2) await page.mouse.move(...at(i), { steps: 4 });
  await page.mouse.up();
}

test('live: every view at every size, light and dark', async ({ browser }) => {
  test.setTimeout(600_000);
  fs.mkdirSync(DIR, { recursive: true });
  const hctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const host = await hctx.newPage();
  await login(host, TEACHER.username, TEACHER.password);
  await host.goto('/live');
  await host.locator('label.lv-pick', { has: host.locator('input[value="mode:doodle"]') }).click();
  await host.selectOption('#lv-doodle-level', '3'); await host.selectOption('#lv-doodle-rounds', '2'); await host.selectOption('#lv-doodle-secs', '100');
  await host.locator('input[name="audience"][value="open"]').check();
  await snap(host, null, 'landing', [1366, 768]);
  await host.locator('#lv-new button[type=submit]').click();
  await host.waitForURL(/\/live\/host\//);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  const a = await player(browser, code), b = await player(browser, code);
  const hf = await liveFrame(host), fa = await liveFrame(a), fb = await liveFrame(b);
  await host.locator('#lv-controls [data-lv-act="start"]:not([hidden])').click();
  // the word cards (Tricky words: the longest), at the phone sizes the drawer is most likely on (15 s to pick)
  await until(fa, s => s.ph === 'pick' && s.choices);
  for (const sz of [[375, 667], [360, 640], [390, 844], [844, 390], [1366, 768]]) await snap(a, fa, 'pick', sz);
  await fa.locator('.dh-card[data-i="0"]').tap();
  await until(fa, s => s.ph === 'draw' && s.canDraw && s.word);
  await a.setViewportSize({ width: 390, height: 844 });
  await stroke(a, fa, [150, 600, 300, 300, 500, 200, 700, 300, 850, 600]);
  await stroke(a, fa, [420, 420, 500, 360, 580, 420, 500, 500, 420, 420]);
  await until(fb, s => s.strokes === 2 && s.typerOn);
  // the guesser types: a word of the list, then something else
  const other = (await state(fa)).choices || [];
  void other;
  await fb.locator('.dh-type input').fill('dog'); await fb.locator('.dh-type input').press('Enter');
  await b.waitForTimeout(1100);
  await fb.locator('.dh-type input').fill('a big red thing'); await fb.locator('.dh-type input').press('Enter');
  await until(fa, s => s.feedText.length >= 2);
  for (const sz of ALL) await snap(a, fa, 'drawer', sz);
  for (const sz of ALL) await snap(b, fb, 'guesser', sz);
  for (const sz of PHONES) await snap(b, fb, 'guesser', sz, { kb: true, after: async () => { await fb.locator('.dh-type input').focus(); await fb.locator('.dh-type input').fill('sunflo'); } });
  await fb.locator('.dh-type input').fill('');
  for (const sz of [...BIG, [390, 844]]) await snap(host, hf, 'host', sz);
  // "Who guessed it?" (the drawer's sheet)
  await a.setViewportSize({ width: 390, height: 844 });
  await fa.locator('#dhSaid').tap();
  for (const sz of [[375, 667], [844, 390], [1366, 768]]) await snap(a, fa, 'sheet', sz);
  await fa.locator('#dhWhoNo').tap();
  // B gets it: the guesser's word in the top bar; then the reveal
  await b.setViewportSize({ width: 390, height: 844 });
  await fb.locator('.dh-type input').fill((await state(fa)).word); await fb.locator('.dh-type input').press('Enter');
  await until(fb, s => s.ph === 'reveal');
  for (const sz of [[375, 667], [1366, 768]]) await snap(b, fb, 'reveal', sz);
  await snap(host, hf, 'reveal-host', [1366, 768]);
  fs.writeFileSync(path.join(DIR, 'problems-live.json'), JSON.stringify(problems, null, 2));
  for (const p of [a, b]) await p.context().close();
  await hctx.close();
  expect(problems).toEqual({});
});

test('on its own: practice typing and pass and play, every size, light and dark', async ({ page }) => {
  test.setTimeout(400_000);
  fs.mkdirSync(DIR, { recursive: true });
  const T = (f, fn, ...x) => f.evaluate(([fn, x]) => window.__brbTest[fn](...x), [fn, x]);
  await ownIp(page);
  await page.goto('/play/doodle-hoot');
  let f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.spell, null, { timeout: 30000 });
  await f.locator('.ok-title-screen .ok-hot').click();
  for (const sz of [[375, 667], [1366, 768]]) await snap(page, f, 'solo-setup', sz);
  await T(f, 'start', { mode: 'practice', lvl: 2, guess: 'type' });
  await f.waitForFunction(() => window.__brbTest.state().screen === 'guess' && window.__brbTest.state().strokes > 3);
  for (const sz of ALL) await snap(page, f, 'solo-practice', sz);
  for (const sz of PHONES) await snap(page, f, 'solo-practice', sz, { kb: true, after: () => f.locator('.dh-type input').focus() });
  await page.goto('/play/doodle-hoot');
  f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.spell, null, { timeout: 30000 });
  await T(f, 'start', { mode: 'pass', lvl: 3, players: 3, guess: 'type' });
  await T(f, 'ready');
  await f.waitForFunction(() => window.__brbTest.state().screen === 'pick');
  for (const sz of [[375, 667], [360, 640], [844, 390]]) await snap(page, f, 'solo-pick', sz);
  await T(f, 'pick', 0);
  await f.waitForFunction(() => window.__brbTest.state().screen === 'draw');
  await T(f, 'draw', [100, 100, 400, 500, 800, 200]);
  for (const sz of ALL) await snap(page, f, 'solo-pass-draw', sz);
  await T(f, 'said');
  for (const sz of [[375, 667], [844, 390]]) await snap(page, f, 'solo-pass-sheet', sz);
  fs.writeFileSync(path.join(DIR, 'problems-solo.json'), JSON.stringify(problems, null, 2));
  expect(problems).toEqual({});
});
