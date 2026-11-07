// Jungle Cup, the cooler jumps and the Vine Climb knockdown, through the real play page and sandboxed frame.
//   Leaf Slide: with real key presses, pop off a ramp, see the landing ring, flip in the air, land clean (squash,
//   points); later a golden mega ramp. Vine Climb: a coconut and a bee each knock Cappy off his vine and down to the
//   last branch he passed when he leaps into them (hanging on is safe); with Easier he catches a vine two below.
// Run alone: E2E_PORT=5111 npx playwright test tests/e2e/jungle-cup-jumps.spec.js
// With JC_JUMP_SHOTS=<dir> it saves pictures of the jumps (mid-air, landing, the mega ramp, the knockdown).
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const SHOTS = process.env.JC_JUMP_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const sport = f => J(f, 'sport');
async function open(page, size = { width: 390, height: 844 }) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  await J(f, 'skipText');
  await J(f, 'manual', true);
  return { f, errors };
}
const shoot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
/** Real key presses go to the game's frame (focused first, like a player clicking into it). */
async function key(page, f, k) { await f.evaluate(() => window.focus()); await page.keyboard.press(k); await J(f, 'step', 17); }
async function until(f, pred, max = 400, ms = 33) { for (let i = 0; i < max; i++) { const s = await sport(f); if (pred(s)) return s; await J(f, 'step', ms); } return sport(f); }

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`Leaf Slide jumps with real keys at ${size.width} x ${size.height}: pop, landing ring, flip, clean landing, a mega ramp`, async ({ page }) => {
    test.setTimeout(180_000);
    const { f, errors } = await open(page, size);
    const tag = size.width < size.height ? 'p' : 'd';
    await J(f, 'setSave', { settings: { easy: false, font: 'pixel' } });
    await J(f, 'play', 'leaf'); await J(f, 'sport', 'seed', 7); await J(f, 'play', 'leaf'); await J(f, 'step', 3800);
    expect((await state(f)).sport.phase).toBe('play');
    // crouch on the kicker with Space: the pop is armed
    await until(f, s => s.onRamp && s.toLip > 30);
    await key(page, f, 'Space');
    let s = await sport(f);
    expect(s.pop).toBe(true);
    // off the lip: in the air, a landing ring ahead, speed lines
    s = await until(f, s => s.air, 80, 17);
    expect(s.air).toBe(true);
    await J(f, 'step', 120);
    s = await sport(f);
    expect(s.landT).toBeGreaterThan(0.5);
    expect(s.landX).toBeGreaterThan(s.x + 20);
    await shoot(page, `leaf-${tag}-launch`);
    // a flip (Up) with plenty of time to finish it, then the ghosts of the flip
    await key(page, f, 'ArrowUp');
    s = await sport(f);
    expect(s.trick).toBe('flip');
    await J(f, 'step', 240);
    s = await sport(f);
    expect(s.trail).toBeGreaterThan(1);
    await shoot(page, `leaf-${tag}-flip`);
    // touch-down: no trick still going, so a clean landing that banks points, with a squash
    s = await until(f, s => !s.air, 120, 17);
    expect([s.crashes, s.combos]).toEqual([0, 1]);
    expect(s.score).toBeGreaterThan(150);
    expect(s.sq).toBeLessThan(0);
    await J(f, 'step', 50);
    await shoot(page, `leaf-${tag}-landing`);
    expect((await state(f)).sounds).toEqual(expect.arrayContaining(['lsPop', 'lsLand']));
    // a golden mega ramp later in the run (the bot rides there; the player takes the mega ramp with real keys)
    await J(f, 'sport', 'auto', true);
    s = await until(f, s => s.nextMega && !s.air && s.toLip < 320, 1200, 100);
    await J(f, 'sport', 'auto', false);
    expect(s.megaRamps).toBeGreaterThan(0);
    s = await until(f, s => s.onRamp && s.nextMega);
    await shoot(page, `leaf-${tag}-mega-ramp`);
    await key(page, f, 'Space');
    s = await until(f, s => s.air, 80, 17);
    expect(s.megas).toBe(1);
    await J(f, 'step', 100);
    await key(page, f, 'ArrowLeft');
    await J(f, 'step', 500);
    await key(page, f, 'ArrowDown');
    await J(f, 'step', 380);
    await shoot(page, `leaf-${tag}-mega-air`);
    s = await until(f, s => !s.air, 200, 17);
    expect(s.crashes).toBe(0);
    expect(s.bigAirs).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}

test('Leaf Slide: landing mid-trick is a kind wipeout, and reduced motion turns the shake off', async ({ page }) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { f, errors } = await open(page);
  await J(f, 'play', 'leaf'); await J(f, 'sport', 'seed', 7); await J(f, 'play', 'leaf'); await J(f, 'step', 3800);
  await until(f, s => s.onRamp && s.toLip > 30);
  await key(page, f, 'Space');
  await until(f, s => s.air, 80, 17);
  await until(f, s => s.landT < 0.25, 120, 17);
  await key(page, f, 'ArrowUp');
  const s = await until(f, s => !s.air, 60, 17);
  expect(s.crashes).toBe(1);
  expect(await f.evaluate(() => [window.JC.juice.ox, window.JC.juice.oy, window.JC.juice.t > 0])).toEqual([0, 0, false]);
  expect(errors).toEqual([]);
});

/** Wait for the green ring on the next vine, then leap with a real Space press, and drop a hazard into the leap. */
async function leapInto(page, f, kind) {
  await until(f, s => s.state === 'hang' && Math.abs(s.dx) <= s.r - 1, 300, 17);
  await key(page, f, 'Space');
  expect((await sport(f)).state).toBe('leap');
  await J(f, 'sport', 'drop', kind);
}

test('Vine Climb: leaping into a coconut or a bee knocks Cappy down to the last branch; hanging on is safe; Easier catches a vine', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page);
  await J(f, 'setSave', { settings: { easy: false, font: 'pixel' } });
  await J(f, 'play', 'vine'); await J(f, 'step', 3800);
  await J(f, 'sport', 'hazards', false);
  // hanging on: a coconut dropped right on Cappy only falls past
  await J(f, 'sport', 'to', 8); await J(f, 'step', 100);
  await J(f, 'sport', 'drop', 'coconut'); await J(f, 'step', 600);
  let s = await sport(f);
  expect([s.state, s.knocks]).toEqual(['hang', 0]);
  // a leap from vine 8 (24 m) into a coconut: down to the 15 m branch (target 5)
  await leapInto(page, f, 'coconut');
  s = await until(f, s => s.knocks > 0, 60, 17);
  expect([s.state, s.knocked, s.fallTo]).toEqual(['fall', true, 5]);
  await J(f, 'step', 120);
  await shoot(page, 'vine-knock-tumble');
  s = await until(f, s => s.state === 'stand', 160, 17);
  expect([s.cur, s.metres, s.knocks]).toEqual([5, 15, 1]);
  await J(f, 'step', 60);
  await shoot(page, 'vine-knock-down');
  expect((await sport(f)).daze).toBe(true);
  // a leap from vine 12 (36 m) into a bee: down to the 30 m branch (target 10)
  await J(f, 'sport', 'to', 12); await J(f, 'step', 100);
  await leapInto(page, f, 'bee');
  s = await until(f, s => s.knocks > 1, 60, 17);
  expect([s.state, s.fallTo]).toEqual(['fall', 10]);
  s = await until(f, s => s.state === 'stand', 200, 17);
  expect([s.cur, s.knocks]).toEqual([10, 2]);
  expect((await state(f)).sounds).toEqual(expect.arrayContaining(['bonk']));
  // Easier champions: a leap from vine 8 into a coconut drops Cappy only to vine 6, which he grabs on the way down
  await J(f, 'setSave', { settings: { easy: true, font: 'pixel' } });
  await J(f, 'play', 'vine'); await J(f, 'step', 3800);
  await J(f, 'sport', 'hazards', false);
  await J(f, 'sport', 'to', 8); await J(f, 'step', 100);
  await leapInto(page, f, 'coconut');
  s = await until(f, s => s.knocks > 0, 60, 17);
  expect(s.fallTo).toBe(6);
  s = await until(f, s => s.state === 'hang', 160, 17);
  expect([s.cur, s.knocks]).toEqual([6, 1]);
  await J(f, 'setSave', { settings: { easy: false, font: 'pixel' } });
  expect(errors).toEqual([]);
});
