// Jungle Cup, Mango Dash (the eighth sport, vs Pecca and her Grunt Gang: 280 m in four sections), played with real
// inputs:
//   - a 390 x 844 touch phone (Easier) wins the run with real joystick drags and PASS taps (the bot's eyes only say
//     which way to push and when to pass; every move reaches the game as a touch);
//   - a 1366 x 768 laptop loses it on the keyboard (holding Down, never passing), then Try again is offered;
//   - the carrier runs any way (back and sideways too); a chasing pig turns to follow every change of direction; a
//     stampede crosses the field after a warning;
//   - a pig hunts the carrier, shows its tell and lunges at him, and turns to the new carrier the moment the mango is
//     passed (Space);
//   - the lightning bolt (grabbed by running into it with the keys) speeds the carrier up; the fireball keeps every pig
//     out of its radius for 10 s and goes with the mango when it is passed;
//   - a save from before Mango Dash (seven Feathers and the Cup) still loads: the Cup stays won, the lift waits for
//     the eighth Feather, Mango tells the news, and Pecca's arch (from the arch table) opens her sport.
// Game time is stepped (manual) so the inputs never lag behind the picture.
// Run alone: E2E_PORT=5121 npx playwright test tests/e2e/jungle-cup-dash.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const H = (f, name, ...a) => f.evaluate(([n, a]) => window.__brbTest.jc.sport(n, ...a), [name, a]);
const state = f => J(f, 'state');
const step = async (f, ms) => (await J(f, 'step', ms)).sport;
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
/** Into a running round of Mango Dash (manual time), the countdown done. */
async function playing(f, save) {
  // keys go to the game frame (as when a player clicks into the game)
  await (await f.frameElement()).focus(); await f.evaluate(() => window.focus());
  await J(f, 'manual', true);
  await J(f, 'setSave', Object.assign({ plays: { dash: 1 } }, save || {}));
  await J(f, 'play', 'dash');
  let s; for (let i = 0; i < 60; i++) { s = await step(f, 100); if (s.phase === 'play') break; }
  expect(s.phase).toBe('play');
  return s;
}

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  test('Mango Dash: a phone (Easier) wins all 280 m with real joystick drags and PASS taps', async ({ page }) => {
    test.setTimeout(900_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    await J(f, 'setSave', { settings: { font: 'pixel', easy: true }, plays: { dash: 1 } });
    await J(f, 'play', 'dash', { intro: true });
    await J(f, 'step', 300);
    await page.screenshot({ path: '/dev/shm/dash/shot-intro-390x844.png' });
    expect((await J(f, 'buttons')).filter(b => b.id === 'go').length).toBe(1);
    await J(f, 'tap', 'go');
    await J(f, 'manual', true);
    for (let i = 0; i < 60 && (await step(f, 100)).phase !== 'play'; i++);
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    const view = (await state(f)).view;
    const start = { x: view.W * 0.25, y: view.H * 0.8 };
    const pb = await H(f, 'passBtn');
    let passes = 0, s, won = false, tries = 0;
    // like a kid: a few tries (Try again between them); one of them must win
    while (!won && tries < 3) {
      tries++;
      if (tries > 1) {
        await J(f, 'tap', 'retry'); await J(f, 'step', 100);
        if ((await state(f)).sport.phase === 'results') { await J(f, 'tapKey', 'a'); }   // Try again is the focused button
        for (let i = 0; i < 60 && (await step(f, 100)).phase !== 'play'; i++);
        expect((await state(f)).sport.phase).toBe('play');
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(start.x, start.y), 1)] });
      await J(f, 'step', 50);
      const R = (await state(f)).stick.R;
      s = (await state(f)).sport;
      let runPasses = 0;
      for (let i = 0; i < 4000; i++) {
        const a = await H(f, 'advice');
        if (a.phase === 'over') break;
        // push the stick the way the bot's eyes say (any direction: up the field, sideways to dodge, back if need be)
        const thumb = toPage(start.x + a.x * R * 0.95, start.y + a.y * R * 0.95);
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(thumb, 1)] });
        // pass when the bot's eyes say so, and once early on anyway (so a PASS tap is always tested)
        const early = runPasses === 0 && s && s.state.metres >= 4 && !s.state.flying;
        if (a.phase === 'play' && (a.pass || early) && a.marked >= 0) {
          // a second finger taps PASS while the thumb stays on the stick
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(thumb, 1), pt(toPage(pb.x, pb.y), 2)] });
          // both fingers up, then the thumb back on the stick (as a kid lifts and replaces it)
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
          await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(start.x, start.y), 1)] });
          passes++; runPasses++;
        }
        s = await step(f, 100);
        if (s.phase !== 'play') break;
        if (!(await state(f)).stick.on) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(start.x, start.y), 1)] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      for (let i = 0; i < 40 && s.phase !== 'results'; i++) s = await step(f, 100);
      expect(s.state.passes, 'PASS taps reached the game').toBeGreaterThan(0);
      won = s.result.won;
      console.log(`try ${tries}: won ${won}, ${s.state.metres} m, ${s.state.tackles} tackles, ${s.state.passes} passes, ${s.state.t} s`);
    }
    await page.screenshot({ path: '/dev/shm/dash/shot-results-390x844.png' });
    expect(passes).toBeGreaterThan(0);
    expect([s.result.won, s.state.metres, s.newFeather], `won within ${tries} tries`).toEqual([true, 280, true]);
    expect((await state(f)).feathersBy.dash).toBe(true);
    expect(errors).toEqual([]);
  });
});

test('Mango Dash: the keyboard can lose it (slow, never passing); Try again is offered; nothing is lost', async ({ page }) => {
  test.setTimeout(300_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await playing(f, { best: { dash: 900 } });
  await page.keyboard.down('ArrowDown');
  let s; for (let i = 0; i < 2400; i++) { s = await step(f, 250); if (s.phase !== 'play' && s.phase !== 'outro') break; }
  await page.keyboard.up('ArrowDown');
  for (let i = 0; i < 20 && s.phase !== 'results'; i++) s = await step(f, 100);
  expect([s.phase, s.result.won, s.result.stars, s.state.over, s.state.lives, s.state.tackles >= 3]).toEqual(['results', false, 0, true, 0, true]);
  await page.screenshot({ path: '/dev/shm/dash/shot-lost-1366x768.png' });
  expect((await J(f, 'buttons')).map(b => b.id)).toContain('retry');
  expect((await state(f)).best.dash).toBe(900);
  expect(errors).toEqual([]);
});

test('Mango Dash: a pig hunts the carrier, shows its tell, lunges at him, and switches to the new carrier after a pass', async ({ page }) => {
  test.setTimeout(180_000);
  const { f, errors } = await open(page, { width: 390, height: 844 });
  await playing(f);
  await H(f, 'quiet', 999);
  // a pig straight ahead: it closes in on Cappy and starts its tell
  await H(f, 'spawn', 'pig', 0, 110);
  let s = (await state(f)).sport;
  expect(s.state.targets).toEqual([{ kind: 'pig', st: 'hunt', target: 'cappy' }]);
  for (let i = 0; i < 40 && s.state.telling === 0; i++) s = await step(f, 50);
  expect(s.state.telling).toBe(1);
  expect(s.state.targets[0].target).toBe('cappy');
  await page.screenshot({ path: '/dev/shm/dash/shot-tell-390x844.png' });
  // pass (Space): the tell breaks and the pig turns to hunt the new carrier
  const marked = s.state.marked;
  expect(marked).not.toBe('');
  await page.keyboard.press('Space');
  s = await step(f, 50);
  expect(s.state.flying).toBe(true);
  expect(s.state.targets[0].target).toBe(marked);
  await page.screenshot({ path: '/dev/shm/dash/shot-pass-390x844.png' });
  for (let i = 0; i < 10 && s.state.flying; i++) s = await step(f, 50);
  expect([s.state.carrier, s.state.targets[0].target]).toEqual([marked, marked]);
  // standing still in its path (Down held, no steering), the pig lunges at the new carrier and tackles him
  await page.keyboard.down('ArrowDown');
  let lunged = false;
  for (let i = 0; i < 80 && !s.state.resetting; i++) { s = await step(f, 50); if (s.state.lunging) { lunged = true; expect(s.state.targets.find(q => q.st === 'lunge').target).toBe(marked); } if (lunged && !s.state.resetting && i % 4 === 0) await page.screenshot({ path: '/dev/shm/dash/shot-lunge-390x844.png' }); }
  await page.keyboard.up('ArrowDown');
  expect(lunged).toBe(true);
  // the lunge either tackles the carrier (a cartoon tumble, back to the checkpoint with Cappy) or he dodges it
  for (let i = 0; i < 20 && !s.state.resetting && !s.state.dodges; i++) s = await step(f, 50);
  expect(s.state.tackles + s.state.dodges).toBeGreaterThan(0);
  if (s.state.resetting) {
    await page.screenshot({ path: '/dev/shm/dash/shot-tackle-390x844.png' });
    for (let i = 0; i < 30 && s.state.resetting; i++) s = await step(f, 100);
    expect([s.state.carrier, s.state.checkpoint, s.state.lives]).toEqual(['cappy', 0, 3]);
  }
  expect(errors).toEqual([]);
});

test('Mango Dash: the bolt speeds the carrier up; the fireball keeps the pigs out of its radius for 10 s and moves with a pass', async ({ page }) => {
  test.setTimeout(180_000);
  const { f, errors } = await open(page, { width: 390, height: 844 });
  await playing(f);
  await H(f, 'quiet', 999);
  // run straight into a bolt (Up held: a sprint)
  await page.keyboard.down('ArrowUp');
  let s = await step(f, 300);
  const before = s.state.speed;
  await H(f, 'powerup', 'bolt', 30);
  for (let i = 0; i < 40 && s.state.power !== 'bolt'; i++) s = await step(f, 50);
  expect(s.state.power).toBe('bolt');
  s = await step(f, 200);
  expect(s.state.speed).toBeGreaterThan(before * 1.3);
  await page.screenshot({ path: '/dev/shm/dash/shot-bolt-390x844.png' });
  for (let i = 0; i < 120 && s.state.bolt > 0; i++) s = await step(f, 100);
  expect(s.state.power).toBe('');
  // run into a fireball
  await H(f, 'powerup', 'fire', 30);
  for (let i = 0; i < 40 && s.state.power !== 'fire'; i++) s = await step(f, 50);
  expect([s.state.power, s.state.fire]).toEqual(['fire', 10]);
  // for 10 s pigs keep coming from all sides and none gets inside the flame radius; halfway, a pass (Space) carries
  // the flames to the teammate who catches it
  let passedAt = 0, closest = 999;
  for (let i = 0; i < 115 && s.state.power === 'fire'; i++) {
    if (i % 6 === 0) await H(f, 'spawn', i % 12 ? 'piglet' : 'pig', (i % 4 - 1.5) * 30, 60);
    if (i === 48) { await page.keyboard.press('Space'); passedAt = i; }
    s = await step(f, 100);
    if (s.state.pigs) closest = Math.min(closest, s.state.nearestPig);
    expect(s.state.lunging, 'no lunge while on fire').toBe(0);
    if (i === 30) await page.screenshot({ path: '/dev/shm/dash/shot-fire-390x844.png' });
  }
  await page.keyboard.up('ArrowUp');
  expect(closest).toBeGreaterThanOrEqual(s.state.fireR - 1);
  expect(passedAt).toBe(48);
  expect(s.state.carrier).not.toBe('cappy');
  expect(s.state.power).toBe('');
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

test('Mango Dash: run any way (back and sideways); a chasing pig curves to follow; a stampede crosses after a warning', async ({ page }) => {
  test.setTimeout(240_000);
  const SH = process.env.JC_DASH_SHOTS || '';
  if (SH) fs.mkdirSync(SH, { recursive: true });
  const { f, errors } = await open(page, { width: 390, height: 844 });
  await playing(f);
  await H(f, 'quiet', 999);
  // up the field first (room to come back), then back down, then sideways: the carrier goes where the keys point
  await page.keyboard.down('ArrowUp'); let s = await step(f, 1500); await page.keyboard.up('ArrowUp');
  const d0 = s.state.d;
  await page.keyboard.down('ArrowDown'); s = await step(f, 700); await page.keyboard.up('ArrowDown');
  expect(s.state.d, 'ran back down the field').toBeLessThan(d0 - 20);
  expect(s.state.vd).toBeLessThan(0);
  if (SH) await page.screenshot({ path: `${SH}/dash-back-390x844.png` });
  const x0 = s.state.x;
  await page.keyboard.down('ArrowLeft'); s = await step(f, 500); await page.keyboard.up('ArrowLeft');
  expect(s.state.x, 'ran sideways').toBeLessThan(x0 - 15);
  s = await step(f, 300);
  // a pig far up ahead and to the right: run left, and it turns left after him; run right, and it turns back
  await H(f, 'spawn', 'pig', 50, 150);
  s = await step(f, 100);
  const pig0 = s.state.pigList[0];
  await page.keyboard.down('ArrowLeft'); s = await step(f, 800); await page.keyboard.up('ArrowLeft');
  const pig1 = s.state.pigList[0];
  expect(pig1.st).toBe('hunt');
  expect(pig1.x, 'the pig follows him left').toBeLessThan(pig0.x - 15);
  expect(Math.cos(pig1.hd), 'heading left').toBeLessThan(0);
  if (SH) await page.screenshot({ path: `${SH}/dash-chase-390x844.png` });
  await page.keyboard.down('ArrowRight'); s = await step(f, 900); await page.keyboard.up('ArrowRight');
  const pig2 = s.state.pigList[0];
  // it turned to follow him back right (or, if it got close, it is facing him for its pounce)
  expect(Math.cos(pig2.hd) > 0 || pig2.st !== 'hunt', 'it turned back').toBe(true);
  expect(Math.abs(pig2.hd - pig1.hd), 'it turned').toBeGreaterThan(0.3);
  // standing still, it closes in, stops with a "!" (the tell), then dives
  let told = false;
  for (let i = 0; i < 60 && !s.state.lunging && !s.state.resetting; i++) { s = await step(f, 50); if (s.state.telling) { told = true; if (SH && i % 3 === 0) await page.screenshot({ path: `${SH}/dash-tell-390x844.png` }); } }
  expect(told).toBe(true);
  for (let i = 0; i < 40 && s.state.resetting; i++) s = await step(f, 100);
  // a stampede: the warning first (no runners yet), then the runners cross on their row
  await H(f, 'jump', 25); await H(f, 'events');
  for (let i = 0; i < 40; i++) { s = await step(f, 100); if (!s.state.resetting) break; }
  // run up past 26 m, where the clearing's stampede comes, then wait behind its row
  await page.keyboard.down('ArrowUp'); for (let i = 0; i < 30 && !s.state.stampede; i++) s = await step(f, 100); await page.keyboard.up('ArrowUp');
  let warned = false, crossed = false;
  for (let i = 0; i < 60 && !crossed; i++) {
    s = await step(f, 100);
    if (s.state.stampede && !s.state.pigList.some(p => p.st === 'cross')) warned = true;
    if (s.state.pigList.some(p => p.st === 'cross')) { crossed = true; if (SH) await page.screenshot({ path: `${SH}/dash-stampede-390x844.png` }); }
  }
  expect([warned, crossed]).toEqual([true, true]);
  expect(errors).toEqual([]);
});
