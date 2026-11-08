// Jungle Cup's analog joystick and the arches, with real input only (touch drags through CDP, the keyboard, a
// simulated gamepad): the stick floats to the thumb and walks Cappy analog (a half push is slower than a full one),
// he stops on release, A works while the stick is held, the keys and a gamepad stick walk him too, and every one of
// the eight arches opens its sport on the FIRST approach from more than one side.
// Run alone: E2E_PORT=5011 npx playwright test tests/e2e/jungle-cup-stick.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const SHOTS = process.env.JC_STICK_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const SPORTS = ['paddle', 'vine', 'seed', 'rapids', 'frog', 'kick', 'leaf', 'dash'];

async function open(page, size) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  return { f, errors };
}
async function newGame(f) {
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  await J(f, 'skipText');
  await expect.poll(async () => (await state(f)).text).toBe(null);
}
/** Virtual pixels in the game to page CSS pixels (the canvas sits in the sandboxed frame). */
async function mapper(page, f) {
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr }; });
  return (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
}
const pt = (p, id = 1) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Jungle Cup: the floating joystick walks Cappy analog, stops on release, works with A at once', async ({ page }) => {
    test.setTimeout(120_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    await newGame(f);
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    // the open village square
    await J(f, 'go', [17, 46, 'up']);
    await page.waitForTimeout(300);
    let s = await state(f);
    expect(s.stick.on).toBe(false);
    const view = s.view;
    // a thumb lands in the left part of the screen: the stick appears right there
    const start = { x: view.W * 0.25, y: view.H * 0.7 };
    const p0 = toPage(start.x, start.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(p0)] });
    await page.waitForTimeout(80);
    s = await state(f);
    expect(s.stick.on).toBe(true);
    expect(Math.abs(s.stick.x - start.x)).toBeLessThan(2);
    // a half push to the right for 1 s, then a full push for 1 s: the full push goes clearly further
    const R = s.stick.R;
    const push = async (frac, ms) => {
      const a = await state(f);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(start.x + R * frac, start.y))] });
      await page.waitForTimeout(ms);
      const b = await state(f);
      return { dx: b.pos.px - a.pos.px, mag: b.axis.mag };
    };
    const half = await push(0.55, 1000);
    const full = await push(1.4, 1000);
    expect(half.dx).toBeGreaterThan(15);
    expect(full.dx).toBeGreaterThan(half.dx * 1.3);
    expect(half.mag).toBeGreaterThan(0.3); expect(half.mag).toBeLessThan(0.7);
    expect(full.mag).toBe(1);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'stick-390x844-walking.png') });
    // the knob stays inside the base even when the thumb goes far past it
    // diagonal: up-left moves both ways
    let a = await state(f);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(start.x - R, start.y - R))] });
    await page.waitForTimeout(500);
    let b = await state(f);
    expect(b.pos.px).toBeLessThan(a.pos.px - 5); expect(b.pos.py).toBeLessThan(a.pos.py - 5);
    // release: he stops, the stick goes back to its resting hint
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(250);
    a = await state(f); await page.waitForTimeout(400); b = await state(f);
    expect([b.stick.on, b.axis.mag, b.pos.px, b.pos.py]).toEqual([false, 0, a.pos.px, a.pos.py]);
    // stick + A together: hold the stick, walking into Jada's arch from below, and press A with a second finger
    await J(f, 'go', [40, 60, 'up']);
    await page.waitForTimeout(200);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(p0)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(start.x, start.y - R))] });
    await expect.poll(async () => (await state(f)).prompt, { timeout: 8000 }).toBe('paddle');
    s = await state(f);
    expect(s.stick.on).toBe(true);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'stick-390x844-arch-prompt.png') });
    const aBtn = toPage(s.aBtn.x, s.aBtn.y);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(start.x, start.y - R)), pt(aBtn, 2)] });
    await page.waitForTimeout(100);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(async () => { const t = await state(f); return t.sport && [t.screen, t.sport.id, t.sport.phase].join(); }, { timeout: 5000 }).toBe('sport,paddle,intro');
    expect(errors).toEqual([]);
  });

  test('Jungle Cup: every arch opens its sport on the first approach, from more than one side, with the stick', async ({ page }) => {
    test.setTimeout(300_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    await newGame(f);
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    // starting tiles 3-4 tiles from each arch, in a straight free line (below, the sides, the diagonals)
    const starts = await f.evaluate(sports => {
      const j = window.__brbTest.jc, A = j.world().arches, out = {};
      // below, the diagonals, the sides and above; a diagonal line also needs the two tiles it passes between
      const DIRS = [[0, 1], [-1, 1], [1, 1], [-1, 0], [1, 0], [0, -1], [-1, -1], [1, -1]];
      const free = (x, y) => !j.solidAt(x, y);
      for (const id of sports) {
        const a = A[id], got = [];
        for (const [dx, dy] of DIRS) {
          for (const k of [4, 3]) {
            let ok = true;
            for (let i = 1; i <= k && ok; i++) {
              if (!free(a.x + dx * i, a.y + dy * i)) ok = false;
              // (the arch's own posts beside it don't count: he comes in over the tile in front)
              if (dx && dy && i > 1 && (!free(a.x + dx * i, a.y + dy * (i - 1)) || !free(a.x + dx * (i - 1), a.y + dy * i))) ok = false;
            }
            if (ok) { got.push([a.x + dx * k, a.y + dy * k, dx, dy]); break; }
          }
          if (got.length >= 2) break;
        }
        out[id] = { arch: [a.x, a.y], starts: got };
      }
      return out;
    }, SPORTS);
    const view = (await state(f)).view;
    const base = { x: view.W * 0.25, y: view.H * 0.72 };
    const report = [];
    for (const id of SPORTS) {
      const { arch, starts: list } = starts[id];
      expect(list.length, `free approaches to the ${id} arch`).toBeGreaterThanOrEqual(2);
      for (const [sx, sy, dx, dy] of list) {
        await J(f, 'go', [sx, sy, 'up']);
        await page.waitForTimeout(250);
        const R = (await state(f)).stick.R;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(base.x, base.y))] });
        let s = null;
        const t0 = Date.now();
        // steer like a kid: point the stick at the arch until its prompt shows (one approach, never backing off)
        while (Date.now() - t0 < 8000) {
          s = await state(f);
          if (s.prompt === id) break;
          const vx = arch[0] * 16 + 8 - (s.pos.px + 8), vy = arch[1] * 16 + 8 - (s.pos.py + 12), d = Math.hypot(vx, vy) || 1;
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(base.x + vx / d * R, base.y + vy / d * R))] });
          await page.waitForTimeout(60);
        }
        expect(s.prompt, `${id} prompt from ${dx},${dy}`).toBe(id);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
        // the big prompt button itself starts it (a tap)
        const btn = (await J(f, 'buttons')).find(b => b.id === 'prompt');
        expect(btn, `${id} prompt button`).toBeTruthy();
        expect(Math.min(btn.w, btn.h)).toBeGreaterThanOrEqual(40);
        const fb = await (await f.frameElement()).boundingBox();
        const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); return { x: r.left, y: r.top }; });
        await page.touchscreen.tap(fb.x + c.x + btn.x + btn.w / 2, fb.y + c.y + btn.y + btn.h / 2);
        await expect.poll(async () => { const t = await state(f); return t.sport && [t.screen, t.sport.id].join(); }, { timeout: 5000 }).toBe(`sport,${id}`);
        report.push(`${id} from ${dx},${dy}`);
      }
    }
    expect(report.length).toBeGreaterThanOrEqual(14);
    expect(errors).toEqual([]);
  });

  for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
    test(`Jungle Cup: island controls picture (touch) at ${size.width}x${size.height}`, async ({ page }) => {
      test.skip(!SHOTS, 'pictures only with JC_STICK_SHOTS');
      const { f } = await open(page, size);
      await newGame(f);
      await J(f, 'go', [17, 46, 'up']);
      // a touch somewhere first so the game knows it is a touch screen (the resting stick hint shows)
      const cdp = await page.context().newCDPSession(page);
      const toPage = await mapper(page, f);
      const v = (await state(f)).view;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(v.W * 0.5, v.H * 0.5))] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(400);
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.screenshot({ path: path.join(SHOTS, `island-touch-${size.width}x${size.height}.png`) });
    });
  }
});

test('Jungle Cup: keys and a gamepad stick walk Cappy smoothly; the pad is analog', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await newGame(f);
  await J(f, 'go', [17, 46, 'up']);
  await page.waitForTimeout(300);
  await f.locator('#jc').focus();
  // keys: right for 0.6 s
  let a = await state(f);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(600); await page.keyboard.up('ArrowRight');
  let b = await state(f);
  expect(b.pos.px - a.pos.px).toBeGreaterThan(30);
  expect(b.pos.dir).toBe('right');
  // keys: a diagonal moves both ways at once
  a = b;
  await page.keyboard.down('ArrowLeft'); await page.keyboard.down('ArrowUp'); await page.waitForTimeout(500);
  await page.keyboard.up('ArrowLeft'); await page.keyboard.up('ArrowUp');
  b = await state(f);
  expect(b.pos.px).toBeLessThan(a.pos.px - 10); expect(b.pos.py).toBeLessThan(a.pos.py - 10);
  // A key at an arch: Space opens the sport on the first press
  await J(f, 'go', [40, 59, 'up']);
  await page.waitForTimeout(200);
  await page.keyboard.down('ArrowUp');
  await expect.poll(async () => (await state(f)).prompt, { timeout: 6000 }).toBe('paddle');
  await page.keyboard.up('ArrowUp');
  await page.keyboard.press('Space');
  await expect.poll(async () => { const t = await state(f); return t.sport && t.sport.id; }, { timeout: 4000 }).toBe('paddle');
  // a gamepad: a light push walks slowly, a full push faster
  await J(f, 'go', [17, 46, 'up']);
  await page.waitForTimeout(300);
  await f.evaluate(() => {
    const pad = { connected: true, id: 'test pad', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    window.__pad = pad; navigator.getGamepads = () => [pad];
    window.dispatchEvent(new Event('gamepadconnected'));
  });
  const padRun = async (x, ms) => { const s0 = await state(f); await f.evaluate(x => { window.__pad.axes[0] = x; }, x); await page.waitForTimeout(ms); const s1 = await state(f); await f.evaluate(() => { window.__pad.axes[0] = 0; }); return { dx: s1.pos.px - s0.pos.px, mag: s1.axis.mag }; };
  const slow = await padRun(0.45, 900);
  await page.waitForTimeout(200);
  const fast = await padRun(-1, 900);
  expect(slow.dx).toBeGreaterThan(10);
  expect(slow.mag).toBeLessThan(0.5);
  expect(-fast.dx).toBeGreaterThan(slow.dx * 1.3);
  // a light touch in the dead zone does nothing
  a = await state(f);
  await f.evaluate(() => { window.__pad.axes[0] = 0.12; }); await page.waitForTimeout(400);
  b = await state(f);
  expect(b.pos.px).toBe(a.pos.px);
  await f.evaluate(() => { window.__pad.axes[0] = 0; });
  expect(errors).toEqual([]);
});

test('Jungle Cup: Cappy slides along walls instead of sticking, and slips round corners', async ({ page }) => {
  test.setTimeout(60_000);
  const { f } = await open(page, { width: 1366, height: 768 });
  await newGame(f);
  await J(f, 'manual', true);
  // find a solid tile with free tiles round it: push diagonally into it and he still slides on
  const spot = await f.evaluate(() => {
    const j = window.__brbTest.jc;
    for (let y = 30; y < 60; y++) for (let x = 20; x < 55; x++) {
      if (!j.solidAt(x, y)) continue;
      let free = true;
      for (const [dx, dy] of [[0, 1], [0, 2], [-1, 1], [1, 1], [-2, 1], [2, 1], [-1, 2], [1, 2]]) if (j.solidAt(x + dx, y + dy)) free = false;
      if (free && !j.solidAt(x - 1, y) && !j.solidAt(x + 1, y)) return [x, y];
    }
    return null;
  });
  expect(spot).not.toBe(null);
  await J(f, 'go', [spot[0], spot[1] + 1, 'up']);
  await J(f, 'step', 50);
  const a = await state(f);
  // up-right into the wall above: he cannot go up, but he keeps going right
  await J(f, 'press', 'up'); await J(f, 'press', 'right');
  await J(f, 'step', 800);
  await J(f, 'release', 'up'); await J(f, 'release', 'right');
  const b = await state(f);
  expect(b.pos.px - a.pos.px).toBeGreaterThan(20);
  // straight up into the middle of the block: blocked (no walking through)
  await J(f, 'go', [spot[0], spot[1] + 1, 'up']); await J(f, 'step', 50);
  const c = await state(f);
  await J(f, 'press', 'up'); await J(f, 'step', 800); await J(f, 'release', 'up');
  const d = await state(f);
  expect(d.pos.y).toBe(c.pos.y);
  // the edge of the block: pushing up with a couple of pixels of overlap slips round the corner
  await J(f, 'go', [spot[0] + 1, spot[1] + 1, 'up']); await J(f, 'step', 50);
  await J(f, 'press', 'left'); await J(f, 'step', 67); await J(f, 'release', 'left');
  await J(f, 'press', 'up'); await J(f, 'step', 900); await J(f, 'release', 'up');
  const e = await state(f);
  expect(e.pos.y).toBeLessThan(spot[1] + 1);
});

for (const size of [{ width: 1366, height: 768 }]) {
  test(`Jungle Cup: island controls picture at ${size.width}x${size.height}`, async ({ page }) => {
    test.skip(!SHOTS, 'pictures only with JC_STICK_SHOTS');
    const { f } = await open(page, size);
    await newGame(f);
    await J(f, 'go', [17, 46, 'up']);
    await page.waitForTimeout(400);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: path.join(SHOTS, `island-${size.width}x${size.height}.png`) });
  });
}
