// Jungle Cup sports, part A: Vine Climb (vs Sloane) and Seed Shot (vs Tico), through the real play page and sandboxed frame.
//   Vine Climb: won by its timing bot (the Feather, the stars, the platform score), lost by standing still (Sloane reaches
//     the top), and played with real Space presses on the keyboard at the moments the ring is green.
//   Seed Shot: won by its aiming bot, lost by not shooting (Tico wins), played with a real mouse pull-back-and-release and
//     with real arrow keys + Space.
//   Layout: frameProblems plus every canvas button's size, on a 390 x 844 phone, the same phone sideways and a laptop.
// Run alone: E2E_PORT=4621 npx playwright test tests/e2e/jungle-cup-a.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const SHOTS = process.env.JC_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const sport = f => J(f, 'sport');
async function open(page, size = { width: 390, height: 844 }) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  await J(f, 'skipText');
  return { f, errors };
}
/** Run the game (manual time) until the sport's results card, at most `secs` of game time. */
async function playUntilResults(f, secs) {
  for (let i = 0; i < secs; i++) {
    const s = await f.evaluate(() => { const j = window.__brbTest.jc; j.skipText(); j.step(1000); return j.state().sport; });
    if (s && s.phase === 'results') return s;
  }
  return (await state(f)).sport;
}
/** Into a sport through its arch and intro card (Space in the arch, then the Play button). */
async function enter(f, id) {
  await J(f, 'manual', true);
  await J(f, 'go', id); await J(f, 'step', 300);
  expect((await state(f)).prompt).toBe(id);
  await J(f, 'tapKey', 'a'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', id, 'intro']);
  await J(f, 'tap', 'go'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('count');
  await J(f, 'step', 3800);
  s = await state(f);
  expect(s.sport.phase).toBe('play');
  return s;
}
/** The page position (CSS px) of a virtual pixel on the game canvas (a sport's scene coordinates times its scale k). */
async function toPage(page, f, vx, vy) {
  const el = await f.frameElement();
  await el.scrollIntoViewIfNeeded();
  const box = await el.boundingBox(), v = (await state(f)).view, k = v.S / v.dpr;
  return [box.x + vx * k, box.y + vy * k];
}

test('Vine Climb: the bot wins the race (Feather + stars), standing still loses to Sloane, real Space presses climb', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  await enter(f, 'vine');
  let st = await sport(f);
  expect([st.state, st.cur, st.metres, st.next]).toEqual(['stand', 0, 0, 'vine']);
  // win: the timing bot leaps at the best moment and waits for bees
  await J(f, 'sport', 'auto', true);
  let s = await playUntilResults(f, 80);
  expect(s.phase).toBe('results');
  expect([s.result.won, s.newFeather, s.state.won, s.state.best]).toEqual([true, true, true, 60]);
  expect(s.result.stars).toBeGreaterThanOrEqual(2);
  expect(s.state.sloane).toBeLessThan(60);
  s = await state(f);
  expect([s.feathersBy.vine, s.stars.vine >= 2, s.best.vine > 0]).toEqual([true, true, true]);
  expect(s.sounds).toEqual(expect.arrayContaining(['grab', 'whoosh', 'win']));
  const go = await f.evaluate(() => window.__go);
  expect(go.at(-1)).toEqual({ won: true, score: 100 * s.stars.vine + 250 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-vine-won.png` });
  // lose: Try again and stand still; Sloane never stops and reaches the top first
  await J(f, 'step', 600);
  await J(f, 'tap', 'retry'); await J(f, 'step', 4000);
  expect((await sport(f)).state).toBe('stand');
  s = await playUntilResults(f, 90);
  expect([s.phase, s.result.won, s.result.stars, s.state.sloane, s.state.best]).toEqual(['results', false, 0, 60, 0]);
  expect((await f.evaluate(() => window.__go)).at(-1).won).toBe(false);
  s = await state(f);
  expect([s.feathers, s.feathersBy.vine]).toEqual([1, true]);    // losing never takes the Feather away
  // real keys: press Space on the keyboard whenever the ring is green (no hazards, so only timing counts)
  await J(f, 'step', 600);
  await J(f, 'tap', 'retry'); await J(f, 'step', 4000);
  await J(f, 'sport', 'hazards', false);
  await (await f.frameElement()).focus();   // keys go to the game frame
  let presses = 0;
  for (let i = 0; i < 1500 && presses < 8; i++) {
    st = await f.evaluate(() => { const j = window.__brbTest.jc; j.step(1000 / 60); return j.sport(); });
    if ((st.state === 'hang' || st.state === 'stand') && !st.daze && (st.next === 'branch' || Math.abs(st.dx) <= st.r * 0.35)) { await page.keyboard.press('Space'); presses++; await J(f, 'step', 400); }
  }
  st = await sport(f);
  expect(presses).toBe(8);
  expect(st.grabs).toBeGreaterThanOrEqual(8);
  expect(st.falls).toBe(0);
  expect(st.metres).toBeGreaterThanOrEqual(24);
  expect(st.perfects).toBeGreaterThanOrEqual(4);
  // too early: far from the vine, Space does nothing (no fall, no leap)
  for (let i = 0; i < 400; i++) { st = await f.evaluate(() => { const j = window.__brbTest.jc; j.step(1000 / 60); return j.sport(); }); if (st.state === 'hang' && Math.abs(st.dx) > st.r * 3) break; }
  const before = st.grabs;
  await page.keyboard.press('Space'); await J(f, 'step', 50);
  st = await sport(f);
  expect([st.state, st.grabs, st.falls]).toEqual(['hang', before, 0]);
  // the test hooks win and lose at once
  s = await J(f, 'lose', 'vine');
  expect([s.sport.phase, s.sport.result.won]).toEqual(['results', false]);
  s = await J(f, 'win', 'vine');
  expect([s.sport.phase, s.sport.result.won, s.feathersBy.vine]).toEqual(['results', true, true]);
  expect(errors).toEqual([]);
});

test('Seed Shot: the bot outscores Tico, not shooting loses, a real mouse pull-back and real keys hit fruit', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page, { width: 844, height: 390 });
  await enter(f, 'seed');
  // win: the aiming bot
  await J(f, 'sport', 'auto', true);
  let s = await playUntilResults(f, 70);
  expect(s.phase).toBe('results');
  expect([s.result.won, s.newFeather]).toEqual([true, true]);
  expect(s.state.you).toBeGreaterThan(s.state.tico);
  expect(s.state.tico).toBeGreaterThan(0);                 // Tico scores steadily
  expect(s.result.stars).toBeGreaterThanOrEqual(2);
  s = await state(f);
  expect([s.feathersBy.seed, s.best.seed > 0]).toEqual([true, true]);
  expect(s.sounds).toEqual(expect.arrayContaining(['twang', 'win']));
  expect((await f.evaluate(() => window.__go)).at(-1)).toEqual({ won: true, score: 100 * s.stars.seed + 250 });
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-seed-won.png` });
  // lose: never shoot
  await J(f, 'step', 600);
  await J(f, 'tap', 'retry'); await J(f, 'step', 4000);
  s = await playUntilResults(f, 70);
  expect([s.phase, s.result.won, s.result.stars, s.state.you, s.state.tico > 0]).toEqual(['results', false, 0, 0, true]);
  expect((await state(f)).feathersBy.seed).toBe(true);
  // real mouse: pull back from the slingshot (down = near row at a short pull) and let go, aimed ahead of a near fruit
  await J(f, 'step', 600);
  await J(f, 'tap', 'retry'); await J(f, 'step', 4000);
  await J(f, 'sport', 'ticoOff');
  let st = await sport(f), hits = 0;
  for (let n = 0; n < 4; n++) {
    st = await sport(f);
    const lead = await J(f, 'sport', 'lead', 2);
    expect(lead).not.toBeNull();
    // aimX = slX + (startX - x) * 2.4, so pulling left of the start aims right
    const sx = st.slX, sy = st.rowY[1], ex = sx - (lead - st.slX) / 2.4, ey = sy + 12;
    const k = st.k, [px, py] = await toPage(page, f, sx * k, sy * k), [qx, qy] = await toPage(page, f, ex * k, ey * k);
    expect(py).toBeLessThan(380); expect(qy).toBeLessThan(380);
    await page.mouse.move(px, py); await page.mouse.down();
    await page.mouse.move((px + qx) / 2, (py + qy) / 2); await page.mouse.move(qx, qy);
    const aim = await sport(f);
    expect([aim.drag, aim.aimOn, aim.aimRow]).toEqual([true, true, 2]);
    expect(Math.abs(aim.aimX - lead)).toBeLessThanOrEqual(3);
    await page.mouse.up();
    await J(f, 'step', 700);
    hits = (await sport(f)).hits;
  }
  st = await sport(f);
  expect(st.shots).toBe(4);
  expect(hits).toBeGreaterThanOrEqual(3);
  expect(st.you).toBeGreaterThanOrEqual(150);
  // a pull that is too short does not fire
  const [ax, ay] = await toPage(page, f, st.slX * st.k, st.rowY[1] * st.k);
  await page.mouse.move(ax, ay); await page.mouse.down(); await page.mouse.move(ax, ay + 2); await page.mouse.up();
  await J(f, 'step', 100);
  expect((await sport(f)).shots).toBe(4);
  // real keys: Up picks the far row, Left/Right move the ring, Space fires
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  expect((await sport(f)).aimRow).toBe(0);
  const x0 = (await sport(f)).aimX;
  await page.keyboard.down('ArrowRight'); await J(f, 'step', 300); await page.keyboard.up('ArrowRight');
  expect((await sport(f)).aimX).toBeGreaterThan(x0 + 20);
  await page.keyboard.press('Space'); await J(f, 'step', 800);
  expect((await sport(f)).shots).toBe(5);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`Vine Climb and Seed Shot fit ${size.width} x ${size.height}: intro, countdown, play, pause, results`, async ({ page }) => {
    test.setTimeout(150_000);
    const { f, errors } = await open(page, size);
    const check = async () => {
      expect(await frameProblems(f)).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
      const r = await f.evaluate(() => { const c = document.getElementById('jc').getBoundingClientRect(); return [c.width, c.height, innerWidth, innerHeight]; });
      expect([r[0], r[1]]).toEqual([r[2], r[3]]);
      const bs = await J(f, 'buttons');
      const small = bs.filter(b => Math.min(b.w, b.h) < 36);
      expect(small, JSON.stringify(small)).toEqual([]);
      for (const b of bs) { expect(b.x).toBeGreaterThanOrEqual(-1); expect(b.y).toBeGreaterThanOrEqual(-1); expect(b.x + b.w).toBeLessThanOrEqual(r[2] + 1); expect(b.y + b.h).toBeLessThanOrEqual(r[3] + 1); }
    };
    const tag = `${size.width}x${size.height}`;
    for (const id of ['vine', 'seed']) {
      await J(f, 'manual', false);
      await J(f, 'play', id, { intro: true }); await page.waitForTimeout(300);
      await check();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${id}-${tag}-intro.png` });
      await J(f, 'tap', 'go'); await page.waitForTimeout(1200);
      await check();
      await page.waitForTimeout(3000);
      await J(f, 'sport', 'auto', true);
      await page.waitForTimeout(2500);
      await check();
      expect((await J(f, 'buttons')).map(b => b.id)).toContain('pause');
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${id}-${tag}-play.png` });
      await J(f, 'tapKey', 'b'); await page.waitForTimeout(200);
      expect((await state(f)).sport.phase).toBe('paused');
      await check();
      await J(f, 'tap', 'resume'); await page.waitForTimeout(200);
      expect((await state(f)).sport.phase).toBe('play');
      await J(f, 'win', id); await page.waitForTimeout(900);
      await check();
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/e2e-${id}-${tag}-results.png` });
      const perf = await J(f, 'perf');
      expect(perf.frames).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
}
