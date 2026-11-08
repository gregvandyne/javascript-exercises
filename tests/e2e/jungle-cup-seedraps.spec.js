// Jungle Cup: the busier Seed Shot lagoon and the longer Rapids Run, played with real inputs.
//   Seed Shot: four rows, a golden fruit hit with a real mouse pull-back scores double, the swallows snap up a seed
//     fired with real keys under them (no points), divers go under and come back, the frog and the fish turn up.
//   Rapids Run: a 1,350 m course with every new hazard in it, real keys steer, a real jump over a waterfall gives a
//     big drop, steering into a whirlpool spins you, and the autopilot finishes first using the fast water.
// Run alone: E2E_PORT=5131 npx playwright test tests/e2e/jungle-cup-seedraps.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems } from './frame-fit.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
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
  await J(f, 'manual', true);
  return { f, errors };
}
async function start(f, id) {
  await J(f, 'play', id); await J(f, 'step', 3900);
  expect((await J(f, 'state')).sport.phase).toBe('play');
}
/** Page coordinates of a point in the game canvas (CSS px inside the frame). */
async function toPage(page, f, x, y) {
  const box = await page.locator('iframe').first().boundingBox();
  return [box.x + x, box.y + y];
}

test('Seed Shot: four rows, golden fruit, swallows, divers, the frog and the fish', async ({ page }) => {
  test.setTimeout(180_000);
  const { f, errors } = await open(page, { width: 390, height: 844 });
  await start(f, 'seed');
  await J(f, 'sport', 'ticoOff');
  let st = await sport(f);
  expect(st.rows).toBe(4);
  expect(new Set(st.fruit.map(x => x.row))).toEqual(new Set([0, 1, 2, 3]));
  // divers go under and come back up
  let sawUnder = false, sawDiverUp = false;
  for (let i = 0; i < 80 && !(sawUnder && sawDiverUp); i++) {
    await J(f, 'step', 200); st = await sport(f);
    if (st.fruit.some(x => x.kind === 'diver' && x.under)) sawUnder = true;
    if (st.fruit.some(x => x.kind === 'diver' && !x.under)) sawDiverUp = true;
  }
  expect([sawUnder, sawDiverUp]).toEqual([true, true]);
  // a golden fruit in the near row, hit with a real mouse pull-back: 100 points (double the 50)
  await J(f, 'sport', 'lifeOff');
  await J(f, 'step', 1600);   // let the seed reload after the auto-skip
  // (up to five tries, like a player: each time the fruit we aim at turns golden, and we check the aim before letting go)
  let gain = 0;
  for (let n = 0; n < 5; n++) {
    st = await sport(f);
    const lead = await J(f, 'sport', 'lead', 3);
    expect(lead).not.toBeNull();
    expect(await J(f, 'sport', 'golden', 3)).toBe(true);
    const sx = st.slX, sy = st.rowY[2], ex = sx - (lead - st.slX) / 2.4, ey = sy + 12;
    const [px, py] = await toPage(page, f, sx * st.k, sy * st.k), [qx, qy] = await toPage(page, f, ex * st.k, ey * st.k);
    const before = st.you, golds = st.golds;
    await page.mouse.move(px, py); await page.mouse.down(); await page.mouse.move((px + qx) / 2, (py + qy) / 2); await page.mouse.move(qx, qy);
    const aim = await sport(f);
    expect([aim.drag, aim.aimOn, aim.aimRow]).toEqual([true, true, 3]);
    // the aim follows the pull (the test's drag uses an approximate pull ratio and the fruit keeps drifting, so this
    // only checks it is near the lead point; whether the shot really lands is checked just below, by the points)
    expect(Math.abs(aim.aimX - lead)).toBeLessThanOrEqual(24);
    await page.mouse.up(); await J(f, 'step', 700);
    st = await sport(f);
    if (st.golds > golds) { gain = st.you - before; break; }
    await J(f, 'step', 1500);
  }
  expect([st.golds, gain]).toEqual([1, 100]);   // golden: double the near row's 50
  // the swallows over the third row: a seed fired under them with real keys is a snack (no points)
  await J(f, 'step', 1500);
  await J(f, 'sport', 'flock', 2); await J(f, 'step', 80);
  let fl = (await sport(f)).flock;
  for (let i = 0; i < 40 && !(fl && fl.x > 60); i++) { await J(f, 'step', 100); fl = (await sport(f)).flock; }
  expect(fl).not.toBeNull();
  // put the ring where the flock will be when the seed comes down (0.5 s for this row), on row 2
  st = await sport(f);
  const target = fl.x + 62 * 0.5;
  while (st.aimRow > 2) { await page.keyboard.press('ArrowUp'); st = await sport(f); }
  while (st.aimRow < 2) { await page.keyboard.press('ArrowDown'); st = await sport(f); }
  for (let i = 0; i < 80 && Math.abs(st.aimX - target) > 6; i++) {
    const key = st.aimX < target ? 'ArrowRight' : 'ArrowLeft';
    await page.keyboard.down(key); await J(f, 'step', 30); await page.keyboard.up(key); st = await sport(f);
  }
  const youBefore = st.you, snacks = st.snacks;
  await page.keyboard.press('Space'); await J(f, 'step', 700);
  st = await sport(f);
  expect(st.snacks).toBe(snacks + 1);
  expect(st.you).toBe(youBefore);
  // the frog hops onto the empty pads and fish jump: over a little while both show up
  let frog = false, fish = false;
  for (let i = 0; i < 80 && !(frog && fish); i++) { await J(f, 'step', 250); st = await sport(f); frog = frog || !!st.frog; fish = fish || st.fish; }
  expect([frog, fish]).toEqual([true, true]);
  expect(await frameProblems(f)).toEqual([]);
  expect(errors).toEqual([]);
});

test('Rapids Run: 1,350 m of river with every new hazard, real keys steer, jump a waterfall, spin in a whirlpool', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await start(f, 'rapids');
  let st = await sport(f);
  expect(st.len).toBe(1350);
  for (const k of ['log', 'branch', 'rock', 'croc', 'bubble', 'whirl', 'dam', 'vine', 'fall', 'roll', 'chan']) expect(st.kinds[k] || 0, k).toBeGreaterThan(0);
  // real keys steer one lane per press (the game frame takes the keyboard, as after a player's first click)
  await page.locator('iframe').first().focus(); await f.evaluate(() => window.focus());
  expect(st.lane).toBe(1);
  await page.keyboard.press('ArrowRight'); await J(f, 'step', 100);
  expect((await sport(f)).lane).toBe(2);
  await page.keyboard.press('ArrowLeft'); await J(f, 'step', 100);
  expect((await sport(f)).lane).toBe(1);
  // the first whirlpool (Croc Creek) sits in the middle lane: sail into it
  await J(f, 'sport', 'skipTo', 330); await J(f, 'step', 100);
  st = await sport(f);
  expect(st.section).toBe(1);
  for (let i = 0; i < 40 && st.spins === 0; i++) { await J(f, 'step', 100); st = await sport(f); }
  expect(st.spins).toBe(1);
  // the first waterfall (Waterfall Run): a real Up press just before it
  await J(f, 'sport', 'skipTo', 1030); await J(f, 'step', 100);
  st = await sport(f);
  expect(st.section).toBe(3);
  for (let i = 0; i < 40; i++) {
    const a = st.ahead.find(o => o.kind === 'fall');
    if (a && a.ahead < 3) break;
    await J(f, 'step', 50); st = await sport(f);
  }
  await page.keyboard.press('ArrowUp'); await J(f, 'step', 800);
  st = await sport(f);
  expect(st.drops).toBe(1);
  expect(await frameProblems(f)).toEqual([]);
  // the autopilot races the whole river from the start and wins, riding fast water on the way
  await J(f, 'play', 'rapids'); await J(f, 'step', 3900);
  await J(f, 'sport', 'auto', true);
  let s;
  for (let i = 0; i < 140; i++) { await J(f, 'step', 1000); s = (await J(f, 'state')).sport; if (s.phase === 'results') break; }
  expect(s.phase).toBe('results');
  expect(s.result.won).toBe(true);
  expect(s.state.fast).toBeGreaterThan(0);
  expect(s.state.raceT).toBeGreaterThan(70);   // longer than the old 900 m race
  expect(errors).toEqual([]);
});
