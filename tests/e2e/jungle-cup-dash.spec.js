// Jungle Cup, Mango Dash (the eighth sport, vs Pecca and her Grunt Gang), played with real inputs:
//   - a 390 x 844 touch phone wins the run with real joystick drags and PASS taps (the bot's eyes only say which way
//     to push and when to pass; every move reaches the game as a touch);
//   - a 1366 x 768 laptop loses it on the keyboard (holding Down and never passing), then Try again is offered;
//   - a save from before Mango Dash (seven Feathers and the Cup) still loads: the Cup stays won, the lift waits for
//     the eighth Feather, Mango tells the news, and Pecca's arch (from the arch table) opens her sport.
// Game time is stepped (manual) in the touch test so the inputs never lag behind the picture.
// Run alone: E2E_PORT=5121 npx playwright test tests/e2e/jungle-cup-dash.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const OLD7 = ['paddle', 'vine', 'seed', 'rapids', 'frog', 'kick', 'leaf'];

async function open(page, size) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  return { f, errors };
}
async function mapper(page, f) {
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr }; });
  return (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
}
const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Mango Dash: a phone wins it with real joystick drags and PASS taps', async ({ page }) => {
    test.setTimeout(420_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    await J(f, 'setSave', { settings: { font: 'pixel', easy: true }, plays: { dash: 1 } });
    await J(f, 'play', 'dash', { intro: true });
    await J(f, 'step', 300);
    await page.screenshot({ path: '/dev/shm/dash/shot-intro-390x844.png' });
    expect((await J(f, 'buttons')).filter(b => b.id === 'go').length).toBe(1);
    await J(f, 'tap', 'go');
    await expect.poll(async () => (await state(f)).sport.phase, { timeout: 10000 }).toBe('play');
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    const view = (await state(f)).view;
    const start = { x: view.W * 0.25, y: view.H * 0.8 };
    const pb = await f.evaluate(() => window.__brbTest.jc.sport('passBtn'));
    let shot = false, passes = 0, s, won = false, tries = 0;
    // game time moves in 100 ms steps between the real touches (no lag between what is seen and what is pressed)
    await J(f, 'manual', true);
    // like a kid: a few tries (Try again between them); one of them must win
    while (!won && tries < 3) {
      tries++;
      if (tries > 1) { await J(f, 'tap', 'retry'); for (let i = 0; i < 50 && (await J(f, 'step', 100)).sport.phase !== 'play'; i++); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(start.x, start.y), 1)] });
      await J(f, 'step', 50);
      const R = (await state(f)).stick.R;
      s = (await state(f)).sport;
      let runPasses = 0;
      for (let i = 0; i < 1200; i++) {
        const a = await f.evaluate(() => window.__brbTest.jc.sport('advice'));
        if (a.phase !== 'play') break;
        const thumb = toPage(start.x + a.x * R * 0.95, start.y + a.y * R * 0.95);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(thumb, 1)] });
        // pass when the bot's eyes say so, and once early on anyway (so a PASS tap is always tested)
        const early = runPasses === 0 && s && s.state.metres >= 4 && !s.state.flying;
        if ((a.pass || early) && a.marked >= 0) {
          // a second finger taps PASS while the thumb stays on the stick
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(thumb, 1), pt(toPage(pb.x, pb.y), 2)] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [pt(thumb, 1)] });
          passes++; runPasses++;
        }
        s = (await J(f, 'step', 100)).sport;
        if (!shot && s.state.metres >= 20) { shot = true; await page.screenshot({ path: '/dev/shm/dash/shot-play-390x844.png' }); }
        if (s.phase !== 'play') break;
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      for (let i = 0; i < 40 && s.phase !== 'results'; i++) s = (await J(f, 'step', 100)).sport;
      expect(s.state.passes, 'PASS taps reached the game').toBeGreaterThan(0);
      won = s.result.won;
    }
    await page.screenshot({ path: '/dev/shm/dash/shot-results-390x844.png' });
    expect(passes).toBeGreaterThan(0);
    expect([s.result.won, s.state.metres, s.newFeather], `won within ${tries} tries`).toEqual([true, 100, true]);
    expect((await state(f)).feathersBy.dash).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('Mango Dash: the keyboard can lose it (slow, never passing); Try again is offered; nothing is lost', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await J(f, 'setSave', { plays: { dash: 1 }, best: { dash: 900 } });
  await J(f, 'play', 'dash');
  await expect.poll(async () => (await state(f)).sport.phase, { timeout: 10000 }).toBe('play');
  await page.keyboard.down('ArrowDown');
  await expect.poll(async () => (await state(f)).sport.phase, { timeout: 60000, intervals: [500] }).toBe('results');
  await page.keyboard.up('ArrowDown');
  const s = (await state(f)).sport;
  expect([s.result.won, s.result.stars, s.state.over, s.state.metres < 100]).toEqual([false, 0, true, true]);
  await page.screenshot({ path: '/dev/shm/dash/shot-lost-1366x768.png' });
  const ids = (await J(f, 'buttons')).map(b => b.id);
  expect(ids).toContain('retry');
  expect((await state(f)).best.dash).toBe(900);
  expect(errors).toEqual([]);
});

test('a save from before Mango Dash: the Cup stays won, the lift waits for the 8th Feather, Mango tells the news', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page, { width: 390, height: 844 });
  const feathers = Object.fromEntries(OLD7.map(id => [id, true]));
  await J(f, 'setSave', { feathers, cup: true, flags: { metMango: 1, storySeen: 1 } });
  let s = await state(f);
  expect([s.feathers, s.cup]).toEqual([7, true]);
  // the lift is tied shut again until Pecca's Feather
  await J(f, 'go', 'lift'); await J(f, 'talk');
  s = await state(f);
  expect(s.text && s.text.key).toBe('lift.locked');
  await J(f, 'skipText');
  // Mango has the news first
  await J(f, 'go', 'dock');
  const mango = (await J(f, 'world')).npcs.find(n => n.id === 'mango');
  await J(f, 'go', [mango.x, mango.y - 1, 'down']); await J(f, 'talk');
  s = await state(f);
  expect(s.text && s.text.key).toBe('d.mango.dash1');
  await J(f, 'skipText');
  // the arch (from the arch table) opens Mango Dash; winning it lights the 8th socket and opens the lift
  await J(f, 'go', 'dash'); await J(f, 'talk');
  await expect.poll(async () => (await state(f)).screen).toBe('sport');
  expect((await state(f)).sport.id).toBe('dash');
  await J(f, 'win', 'dash');
  s = await state(f);
  expect([s.feathers, s.cup]).toEqual([8, true]);
  expect(errors).toEqual([]);
});
