// Tug of Math through the real sandboxed frame: the setup card (grade, players, the computer's level, time) and that it
// is remembered; a game against the computer answered with the keyboard and the keypad, to the results card and
// BRB.gameOver; two players on one screen (landscape side by side, portrait with Red's half turned round) pulling the
// rope each way until Blue pulls it past the line; the minus key only from grade 7; and the layout check
// (tests/e2e/frame-fit.js) on phones, tablets, a desktop and a 1920 × 1080 smartboard, in Hebrew and in dark mode.
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
const state = f => T(f, 'state');

async function open(page, url = '/play/tug-of-math') {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await ownIp(page);
  await page.goto(url);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.answerOf, null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
  return { f, errors };
}
async function toSetup(f) {
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('.tms-card')).toBeVisible();
}
const radio = (f, v) => f.locator(`.tms [role=radio][data-v="${v}"]`);
const playing = f => expect.poll(async () => (await state(f)).screen, { timeout: 15000 }).toBe('play');

test('vs Computer: the setup card, keyboard and keypad answers, the results card and BRB.gameOver; the setup is remembered', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { f, errors } = await open(page);
  await toSetup(f);
  await radio(f, 3).click(); await radio(f, 'cpu').click(); await radio(f, 'easy').click(); await radio(f, 60).click();
  await expect(radio(f, 3)).toHaveAttribute('aria-checked', 'true');
  await expect(f.locator('.tms .sample')).toContainText(/[×÷]/);
  await f.locator('#tmStart').click();
  await playing(f);
  let s = await state(f);
  expect([s.mode, s.grade, s.diff, s.len, s.timeLeft <= 60]).toEqual(['cpu', 3, 'easy', 60, true]);
  expect(s.minusKey).toBe(false);
  await expect(f.locator('.side.red .keys')).toBeHidden();   // the computer has no keypad
  // the keyboard: a wrong digit, Backspace, the answer, Enter
  const a = await T(f, 'answerOf', 0);
  await f.locator('.side.blue .qcard').click();
  await page.keyboard.press('9'); await page.keyboard.press('Backspace');
  await page.keyboard.type(String(a)); await expect(f.locator('.side.blue .ans')).toHaveText(String(a));
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).scores[0]).toBe(1);
  expect((await state(f)).rope).toBeGreaterThanOrEqual(0);
  // the keypad: tap the digits and the tick
  await expect.poll(async () => (await state(f)).typed[0] === '' && (await T(f, 'answerOf', 0)) !== null).toBe(true);
  const b = await T(f, 'answerOf', 0);
  for (const d of String(b)) await f.locator(`.side.blue .key[data-k="${d}"]`).click();
  await f.locator('.side.blue .key[data-k="ok"]').click();
  await expect.poll(async () => (await state(f)).scores[0]).toBe(2);
  // a wrong answer: the card shows the right one, no pull
  await expect.poll(async () => (await state(f)).typed[0] === '').toBe(true);
  await T(f, 'answer', 0, (await T(f, 'answerOf', 0)) + 1);
  await expect(f.locator('.side.blue .qcard.wrong')).toBeVisible();
  expect((await state(f)).scores[0]).toBe(2);
  // the computer plays on its own
  await expect.poll(async () => (await state(f)).answered[1], { timeout: 20000 }).toBeGreaterThan(0);
  // time up: the player is ahead unless the computer answered twice already; make sure, then end the game
  await T(f, 'unlock');
  for (let i = 0; i < 4; i++) { await T(f, 'solve', 0); await T(f, 'unlock'); }
  await T(f, 'skipAnimations'); await T(f, 'setTime', 0.1);
  await expect(f.locator('.ok-modal')).toBeVisible({ timeout: 15000 });
  await expect(f.locator('.ok-modal')).toContainText('You win!');
  await expect(f.locator('.ok-modal .tm-stats')).toContainText(/right of/);
  const go = await f.evaluate(() => window.__go);
  expect(go.length).toBe(1);
  expect(go[0].won).toBe(true);
  expect(go[0].score).toBe((await state(f)).result.right[0]);
  expect((await state(f)).saved).toMatchObject({ grade: 3, mode: 'cpu', diff: 'easy', len: 60 });
  // reload: the setup card remembers the last choice
  await page.reload();
  const g = await gameFrame(page);
  await g.waitForFunction(() => window.__brbTest && window.__brbTest.answerOf);
  await toSetup(g);
  for (const v of [3, 'cpu', 'easy', 60]) await expect(radio(g, v)).toHaveAttribute('aria-checked', 'true');
  await radio(g, 'two').click();
  await expect(g.locator('.tms fieldset').nth(2)).toBeHidden();   // no computer level for two players
  expect(errors).toEqual([]);
});

test('two players on one screen: a keypad each, the rope moves both ways, Blue pulls it past the line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { f, errors } = await open(page);
  await toSetup(f);
  await radio(f, 2).click(); await radio(f, 'two').click(); await radio(f, 90).click();
  await f.locator('#tmStart').click();
  await playing(f);
  await expect(f.locator('.side.blue .keys')).toBeVisible();
  await expect(f.locator('.side.red .keys')).toBeVisible();
  // Red answers on its own keypad: the rope goes Red's way
  const r = await T(f, 'answerOf', 1);
  for (const d of String(r)) await f.locator(`.side.red .key[data-k="${d}"]`).click();
  await f.locator('.side.red .key[data-k="ok"]').click();
  await expect.poll(async () => (await state(f)).rope).toBe(-1);
  // Blue answers on the number row, Red's number pad is its own (two players, one keyboard)
  await f.locator('.mid .scene').click({ force: true });
  const a = await T(f, 'answerOf', 0);
  await page.keyboard.type(String(a)); await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(f)).rope).toBe(0);
  await expect.poll(async () => (await state(f)).typed.join('|')).toBe('|');   // both sides' next questions are up
  const r2 = await T(f, 'answerOf', 1);
  for (const d of String(r2)) await page.keyboard.press('Numpad' + d);
  expect((await state(f)).typed).toEqual(['', String(r2)]);
  await page.keyboard.press('NumpadEnter');
  await expect.poll(async () => (await state(f)).rope).toBe(-1);
  // Blue pulls 9 times: past the line (8 steps from the middle) wins at once
  for (let i = 0; i < 9; i++) { await T(f, 'unlock'); await T(f, 'solve', 0); }
  await expect.poll(async () => (await state(f)).winner).toBe(0);
  await expect(f.locator('.ok-modal')).toBeVisible({ timeout: 15000 });
  await expect(f.locator('.ok-modal')).toContainText('Blue team wins!');
  expect(await f.evaluate(() => window.__go.length)).toBe(0);   // a shared screen submits no score
  expect(errors).toEqual([]);
});

test('portrait: Red\'s half turned round for the player across the table, every key big enough', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { f } = await open(page);
  await toSetup(f);
  await T(f, 'start', { mode: 'two', grade: 4, len: 60 });
  await playing(f);
  expect(await f.evaluate(() => getComputedStyle(document.querySelector('.side.red')).transform)).toMatch(/^matrix\(-1, .*-1, /);
  for (const side of ['blue', 'red']) {
    const sizes = await f.locator(`.side.${side} .key:visible`).evaluateAll(ks => ks.map(k => [k.getBoundingClientRect().width, k.getBoundingClientRect().height]));
    expect(sizes.length).toBe(12);
    for (const [w, h] of sizes) expect(Math.min(w, h)).toBeGreaterThanOrEqual(44);
  }
  expect(await frameProblems(f)).toEqual([]);
});

test('the minus key: from grade 7 only, and a negative answer pulls', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  const { f } = await open(page);
  await toSetup(f);
  await T(f, 'start', { mode: 'cpu', grade: 3, diff: 'easy' });
  await playing(f);
  expect((await state(f)).minusKey).toBe(false);
  await expect(f.locator('.side.blue .key[data-k="pm"]')).toBeHidden();
  await T(f, 'start', { mode: 'cpu', grade: 7, diff: 'easy', seed: 11 });
  await playing(f);
  await expect(f.locator('.side.blue .key[data-k="pm"]')).toBeVisible();
  // find a negative answer (grade 7 has plenty) and type it with the keypad's ± key
  let a = await T(f, 'answerOf', 0);
  for (let i = 0; i < 30 && a >= 0; i++) { await T(f, 'solve', 0); await T(f, 'unlock'); a = await T(f, 'answerOf', 0); }
  expect(a).toBeLessThan(0);
  const before = (await state(f)).scores[0];
  await f.locator('.side.blue .key[data-k="pm"]').click();
  for (const d of String(-a)) await f.locator(`.side.blue .key[data-k="${d}"]`).click();
  await expect(f.locator('.side.blue .ans')).toHaveText('−' + String(-a));
  await f.locator('.side.blue .key[data-k="ok"]').click();
  await expect.poll(async () => (await state(f)).scores[0]).toBe(before + 1);
});

const SIZES = [[390, 844], [844, 390], [820, 1180], [1180, 820], [1280, 800], [1920, 1080]];
test('fits phones, tablets, a desktop and a smartboard: the setup card, vs Computer and two players', async ({ page }) => {
  test.setTimeout(240_000);
  for (const [width, height] of SIZES) {
    await page.setViewportSize({ width, height });
    const { f } = await open(page);
    await toSetup(f);
    await page.waitForTimeout(300);
    expect(await frameProblems(f), `setup ${width}×${height}`).toEqual([]);
    for (const mode of ['cpu', 'two']) {
      await T(f, 'start', { mode, grade: 5, diff: 'normal', len: 90, seed: 3 });
      await playing(f);
      await page.waitForTimeout(400);
      expect(await frameProblems(f), `${mode} ${width}×${height}`).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
    }
  }
});

test('Hebrew (right to left) and dark mode: the menus mirror, the field keeps Blue on the left, everything fits', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  for (const [width, height] of [[390, 844], [844, 390], [1280, 800]]) {
    await page.setViewportSize({ width, height });
    const { f } = await open(page, '/play/tug-of-math?lang=he');
    await expect.poll(() => f.evaluate(() => document.documentElement.dir)).toBe('rtl');
    await toSetup(f);
    await expect(f.locator('.tms h2')).toHaveText('מוכנים למשוך?');
    expect(await frameProblems(f), `setup ${width}`).toEqual([]);
    await T(f, 'start', { mode: 'two', grade: 7, len: 60 });
    await playing(f);
    await page.waitForTimeout(300);
    expect(await frameProblems(f), `two ${width}`).toEqual([]);
    if (width > height) {
      const [b, r] = await Promise.all(['.side.blue', '.side.red'].map(s => f.locator(s).evaluate(e => e.getBoundingClientRect().left)));
      expect(b).toBeLessThan(r);
    }
    await expect(f.locator('.side.blue .team')).toContainText('הקבוצה הכחולה');
  }
});
