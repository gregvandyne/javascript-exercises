// Paddle Smash with real input only: touch drags on the floating joystick (CDP) plus taps on the Swing button with a
// second finger on a 390 x 844 phone, then the keys on a 1366 x 768 laptop, then a simulated gamepad. The player-bot in
// this file only reads where the ball is going (like eyes) and moves the thumb / presses keys; it never calls the
// sport's own shortcuts. It plays the marmoset warm-up to the end, rallies with Jada, and returns balls in a Fruit
// Frenzy (the score is moved to 10-9 so the Frenzy comes on the next serve): the extra ball is announced and paced. Then the balance check: the sport's
// simulated players (a sloppy kid wins sometimes, Easier champions more, button mashing never).
// Run alone: E2E_PORT=5101 npx playwright test tests/e2e/jungle-cup-paddle.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const SHOTS = process.env.JC_PADDLE_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const sport = f => J(f, 'sport');

async function open(page, size) {
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
  return { f, errors };
}
async function mapper(page, f) {
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr }; });
  const m = (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
  m.k = c.k;
  return m;
}
const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });
/** Where to stand for the most urgent ball coming to Cappy (court units), and whether it is time to swing. */
function plan(st, swung) {
  let best = null;
  for (let i = 0; i < st.balls.length; i++) {
    const b = st.balls[i];
    if (!b.live || b.toward < 0 || b.whiffed) continue;
    const left = b.sweetT - b.age;
    if (left > -0.15 && (!best || left < best.left)) best = { b, i, left };
  }
  if (!best) return { gx: 0, gy: 78, swing: false };
  const key = best.i + ':' + best.b.sweetT;
  const swing = best.left <= 0.02 && !swung.has(key);
  if (swing) swung.add(key);
  return { gx: best.b.sweetX - 4, gy: best.b.sweetY + 7, swing };
}

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Paddle Smash on a phone: the joystick moves Cappy round the table, Swing returns the ball; warm-up, rally, Fruit Frenzy', async ({ page }) => {
    test.setTimeout(300_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    await J(f, 'manual', true);
    await J(f, 'play', 'paddle', { intro: true }); await J(f, 'step', 300);
    await J(f, 'tap', 'go'); await J(f, 'step', 3800);
    let s = await sport(f);
    expect([s.stage, s.port, s.phase]).toEqual(['warm', true, 'serve']);
    const view = (await state(f)).view;
    const R = (await state(f)).stick.R;
    const base = { x: view.W * 0.2, y: view.H * 0.84 };
    const swingBtn = () => J(f, 'buttons').then(bs => bs.find(b => b.id === 'pswing'));
    let btn = await swingBtn();
    expect(btn, 'the Swing button').toBeTruthy();
    expect(Math.min(btn.w, btn.h)).toBeGreaterThanOrEqual(40);
    const tapSwing = async () => {
      // the buttons list is in CSS pixels of the canvas; the mapper takes game (virtual) pixels
      const c = toPage((btn.x + btn.w / 2) / toPage.k, (btn.y + btn.h / 2) / toPage.k);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(thumb.x, thumb.y), 1), pt(c, 2)] });
      // (CDP's touchEnd lists the finger that lifts: the second one; the thumb stays on the stick)
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(c, 2)] });
    };
    // the thumb lands on the left: the joystick appears there
    const thumb = { x: base.x, y: base.y };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(base.x, base.y), 1)] });
    await J(f, 'step', 50);
    expect((await state(f)).stick.on).toBe(true);
    const swung = new Set();
    const xs = [], ys = [];
    /** Play for `secs` of game time with the thumb and the Swing button (stops early when `until` says so). */
    const play = async (secs, until) => {
      for (let i = 0; i < secs * 30; i++) {
        const st = await sport(f);
        if (until && until(st)) return st;
        if ((await state(f)).text) { await J(f, 'skipText'); }
        xs.push(st.cappy.x); ys.push(st.cappy.y);
        const p = plan(st, swung);
        const dx = p.gx - st.cappy.x, dy = p.gy - st.cappy.y, d = Math.hypot(dx, dy);
        const m = d < 0.8 ? 0 : Math.min(1.3, d / 6 + 0.2);
        thumb.x = base.x + (d ? dx / d : 0) * m * R; thumb.y = base.y + (d ? dy / d : 0) * m * R;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(thumb.x, thumb.y), 1)] });
        if (p.swing || (st.phase === 'serve' && st.serve === 'you' && i % 20 === 10)) await tapSwing();
        await J(f, 'step', 33);
      }
      return sport(f);
    };
    // the warm-up against the marmosets, to its end (first to 3)
    s = await play(120, st => st.stage === 'match');
    expect(s.stage).toBe('match');
    expect(s.hits).toBeGreaterThanOrEqual(3);
    // Cappy really ran round his end: sideways and up and down the table
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(15);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(8);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'paddle-390x844-touch-rally.png') });
    // a rally with Jada
    const h0 = s.hits;
    s = await play(25);
    expect(s.hits).toBeGreaterThan(h0);
    // Fruit Frenzy: at 10 points the next serve brings a second (lime and orange) ball in from the marmosets
    await J(f, 'sport', 'score', 10, 9);
    // the extra ball is announced: a marmoset winds up (the "!" tell) before it is tossed
    let sawTell = false;
    const tell = st => { if (st.tossWarn.some(w => w > 0 && w < 9)) sawTell = true; };
    s = await play(25, st => { tell(st); return st.frenzy === 2 && st.balls.filter(b => b.live).length >= 2; });
    expect(s.frenzy).toBe(2);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'paddle-390x844-touch-frenzy.png') });
    const fz0 = s.frenzyYou + s.frenzyThem, hits0 = s.hits;
    s = await play(25, st => st.frenzy === 0 && st.phase !== 'rally');
    expect(sawTell, 'a marmoset winds up before the toss').toBe(true);
    // the balls are paced: none reached Cappy's end on top of another one
    expect(s.fzArr).toBeGreaterThanOrEqual(2);
    expect(s.fzTight, 'two balls reaching Cappy less than 0.7 s apart').toBe(0);
    expect(s.frenzyDone).toBe(1);
    expect(s.frenzyYou + s.frenzyThem).toBeGreaterThanOrEqual(fz0 + 2);   // every ball counted
    expect(s.hits).toBeGreaterThan(hits0);                                 // and Cappy returned Frenzy balls
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(errors).toEqual([]);
  });
});

test('Paddle Smash on a laptop with the keys, then a gamepad: arrows run, Space swings; tapping Space over and over loses the ball', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await J(f, 'manual', true);
  await J(f, 'play', 'paddle'); await J(f, 'step', 3800);
  await J(f, 'sport', 'skipWarm'); await J(f, 'skipText');
  // give the game the keyboard (a click on the canvas, up in the sky where it does nothing harmful)
  const cv = await f.locator('#jc').boundingBox();
  await page.mouse.click(cv.x + 6, cv.y + cv.height * 0.45);
  await J(f, 'sport', 'score', 0, 0); await J(f, 'step', 100);
  let s = await sport(f);
  expect([s.stage, s.port]).toEqual(['match', false]);
  // the arrows move Cappy (the table is sideways here: Right runs towards the net, Up / Down along it)
  await page.keyboard.down('ArrowUp'); await J(f, 'step', 400); await page.keyboard.up('ArrowUp');
  const s1 = await sport(f);
  expect(s1.cappy.x).toBeLessThan(s.cappy.x - 10);
  await page.keyboard.down('ArrowRight'); await J(f, 'step', 200); await page.keyboard.up('ArrowRight');
  expect((await sport(f)).cappy.y).toBeLessThan(s1.cappy.y - 5);
  // a keyboard rally: hold the arrows towards the ring, Space when the circle meets it
  const swung = new Set(), held = {};
  const hold = async (key, on) => { if (!!held[key] === on) return; held[key] = on; if (on) await page.keyboard.down(key); else await page.keyboard.up(key); };
  const keysPlay = async secs => {
    for (let i = 0; i < secs * 30; i++) {
      const st = await sport(f);
      if ((await state(f)).text) await J(f, 'skipText');
      const p = plan(st, swung);
      const dx = p.gx - st.cappy.x, dy = p.gy - st.cappy.y;
      // court x is screen down, court y is screen left
      await hold('ArrowDown', dx > 1.5); await hold('ArrowUp', dx < -1.5);
      await hold('ArrowLeft', dy > 1.5); await hold('ArrowRight', dy < -1.5);
      if (p.swing || (st.phase === 'serve' && st.serve === 'you' && i % 20 === 10)) await page.keyboard.press('Space');
      await J(f, 'step', 33);
    }
    for (const k of Object.keys(held)) await hold(k, false);
    return sport(f);
  };
  s = await keysPlay(30);
  expect(s.hits).toBeGreaterThanOrEqual(3);
  // a simulated gamepad: the left stick runs, button 0 swings
  await f.evaluate(() => {
    const pad = { id: 'test pad', connected: true, index: 0, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 0 };
    window.__pad = pad; navigator.getGamepads = () => [pad];
  });
  // (the game starts reading pads once the browser says one connected)
  await f.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
  const before = await sport(f);
  await f.evaluate(() => { window.__pad.axes[1] = 1; window.__pad.timestamp++; });
  await J(f, 'step', 300);
  await f.evaluate(() => { window.__pad.axes[1] = 0; window.__pad.timestamp++; });
  await J(f, 'step', 50);
  expect((await sport(f)).cappy.x).toBeGreaterThan(before.cappy.x + 8);
  // mashing: Space every 0.2 s while standing still never wins a point
  await J(f, 'sport', 'score', 0, 0); await J(f, 'step', 1600);
  const m0 = await sport(f);
  // (about 12 s: a few points, never the end of the match, where Space would press Try again on the results card)
  for (let i = 0; i < 60; i++) { await page.keyboard.press('Space'); await J(f, 'step', 200); if ((await state(f)).text) await J(f, 'skipText'); }
  const m1 = await sport(f);
  expect(m1.phase).not.toBe('over');
  expect(m1.you).toBeLessThanOrEqual(m0.you + 1);
  expect(m1.them).toBeGreaterThanOrEqual(m0.them + 2);
  expect(errors).toEqual([]);
});

test('Paddle Smash balance (first to 30): good players win, sloppy ones rarely, Easier champions often, button mashing never', async ({ page }) => {
  test.setTimeout(300_000);
  const { f } = await open(page, { width: 390, height: 844 });
  await J(f, 'manual', true);
  await J(f, 'play', 'paddle'); await J(f, 'step', 4000);
  const sim = (cfg, n) => J(f, 'sport', 'sim', cfg, n);
  const sloppy = { react: 0.45, pos: 7, time: 0.09, speed: 0.85 };
  const decent = await sim({ react: 0.3, pos: 4, time: 0.05 }, 12);
  const kid = await sim(sloppy, 20);
  const kidEasy = await sim({ ...sloppy, easy: true }, 12);
  const mash = await sim({ react: 0.2, pos: 0, time: 0, mash: true }, 10);
  const mashEasy = await sim({ react: 0.2, pos: 0, time: 0, mash: true, easy: true }, 10);
  // a match to 30: a good player nearly always wins, an average kid about 6 times in 10, a sloppy one rarely on
  // Normal but most of the time with Easier champions (20 matches is noisy, so the bounds are loose)
  expect(decent.winRate).toBeGreaterThanOrEqual(0.6);
  expect(kid.winRate).toBeLessThan(0.5);
  expect(kidEasy.winRate).toBeGreaterThan(kid.winRate);
  expect(kidEasy.winRate).toBeGreaterThanOrEqual(0.6);
  expect(mash.wins).toBe(0);
  expect(mashEasy.wins).toBe(0);
  // a match takes a minute or more of play, and Frenzy balls are counted
  expect(kid.avgSecs).toBeGreaterThan(180);
  expect(kid.fzYou + kid.fzThem).toBeGreaterThan(0);
  // Fruit Frenzy is paced: balls reach Cappy one after another (almost never within 0.7 s of each other), a decent kid
  // returns most Frenzy balls and a sloppy one about half or more
  expect(decent.fzYou / (decent.fzYou + decent.fzThem)).toBeGreaterThanOrEqual(0.75);
  expect(kid.fzYou / (kid.fzYou + kid.fzThem)).toBeGreaterThanOrEqual(0.45);
  expect(decent.fzTight + kid.fzTight).toBeLessThanOrEqual(Math.ceil((decent.fzArr + kid.fzArr) * 0.02));
  if (SHOTS) fs.writeFileSync(path.join(SHOTS, 'paddle-balance.json'), JSON.stringify({ decent, kid, kidEasy, mash, mashEasy }, null, 1));
});
