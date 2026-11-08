// Jungle Cup through the real play page and sandboxed frame: the title, a new game, walking to Jada's arch (the prompt),
// Paddle Smash won by its perfect-swing bot (the Feather, the totem, the results card) and lost by standing still,
// progress saved for a signed-in player and still there after a reload (Continue), and the layout check
// (tests/e2e/frame-fit.js plus the canvas buttons' own sizes) on a 390 x 844 phone and a 1366 x 768 laptop.
// Run alone: E2E_PORT=4611 npx playwright test tests/e2e/jungle-cup.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp, signup } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
async function open(page, size = { width: 390, height: 844 }) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  await f.evaluate(() => { window.__go = []; const g = BRB.gameOver; BRB.gameOver = o => { window.__go.push(o); return g.call(BRB, o); }; });
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
async function buttonsBigEnough(f, min = 40) {
  const small = (await J(f, 'buttons')).filter(b => Math.min(b.w, b.h) < min);
  expect(small, JSON.stringify(small)).toEqual([]);
}

test('Jungle Cup: title, new game, walk to the arch, win Paddle Smash (Feather + totem), then lose it', async ({ page }) => {
  test.setTimeout(180_000);
  const { f, errors } = await open(page);
  expect(await f.evaluate(() => window.__brbTest.state().screen)).toBe('title');
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  await expect.poll(async () => (await state(f)).text?.key).toBe('story.1');
  await J(f, 'skipText');
  let s = await state(f);
  expect([s.pos.x, s.pos.y, s.feathers, s.saved]).toEqual([50, 93, 0, true]);
  // walk with the keys: up the pier
  await J(f, 'manual', true);
  await J(f, 'walk', 'up', 3);
  expect((await state(f)).pos.y).toBe(90);
  // just below Jada's arch, then one step up into it: the prompt
  await J(f, 'go', [40, 57, 'up']);
  await J(f, 'walk', 'up', 1);
  s = await state(f);
  expect([s.pos.x, s.pos.y, s.prompt]).toEqual([40, 56, 'paddle']);
  // Space in the arch: the intro card
  await J(f, 'tapKey', 'a');
  await J(f, 'step', 400);
  s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', 'paddle', 'intro']);
  await J(f, 'tap', 'go'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('count');
  // the perfect-swing bot plays the warm-up (marmosets) and the match
  await J(f, 'sport', 'auto', true);
  await J(f, 'step', 4000);
  expect((await state(f)).sport.state.stage).toBe('warm');
  s = await playUntilResults(f, 400);
  expect(s.phase).toBe('results');
  expect(s.result.won).toBe(true);
  expect(s.newFeather).toBe(true);
  expect(s.state.you).toBeGreaterThanOrEqual(7);
  s = await state(f);
  expect([s.feathers, s.feathersBy.paddle, s.stars.paddle >= 1, s.best.paddle > 0]).toEqual([1, true, true, true]);
  expect(s.sounds).toEqual(expect.arrayContaining(['tick', 'tock', 'win']));
  // the platform hears about the round when the player leaves the Results card (the site's "New best" message never
  // covers its buttons), not while the card is up
  expect(await f.evaluate(() => window.__go.length)).toBe(0);
  const go = await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; });
  expect(go.at(-1)).toEqual({ won: true, score: 100 * s.stars.paddle + 250 });
  // back to the island: the celebration, the lit socket
  await J(f, 'step', 600);
  await J(f, 'tap', 'back'); await J(f, 'step', 800);
  s = await state(f);
  // Cappy stands a step outside the arch's zone, so its button doesn't pop straight up again
  expect([s.screen, s.prompt]).toEqual(['world', '']);
  expect(Math.hypot(s.pos.x - 40, s.pos.y - 56)).toBeLessThan(4);
  // lose: play again and stand still (warm-up done, so straight into the match with Jada)
  await J(f, 'play', 'paddle'); await J(f, 'step', 4000);
  expect((await state(f)).sport.state.stage).toBe('match');
  s = await playUntilResults(f, 300);
  expect([s.phase, s.result.won, s.result.stars, s.state.them >= 7]).toEqual(['results', false, 0, true]);
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1).won).toBe(false);
  // losing is never punished: the Feather and the best stay, retry is one tap
  s = await state(f);
  expect([s.feathers, s.best.paddle > 0]).toEqual([1, true]);
  await J(f, 'step', 600);
  await J(f, 'tap', 'retry'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('count');
  // pause: Esc, then Keep playing
  await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('paused');
  await J(f, 'tap', 'resume'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).not.toBe('paused');
  // the win/lose hooks (for later stages): lose keeps the Feather; the lift stays locked with one Feather
  s = await J(f, 'lose', 'paddle');
  expect([s.sport.phase, s.sport.result.won, s.feathers]).toEqual(['results', false, 1]);
  await J(f, 'go', 'lift'); await J(f, 'step', 400);
  await J(f, 'talk'); await J(f, 'step', 100);
  expect((await state(f)).text.key).toBe('lift.locked');
  expect(errors).toEqual([]);
});

test('Jungle Cup: a signed-in player\'s progress is saved and comes back after a reload', async ({ page }) => {
  test.setTimeout(120_000);
  await signup(page);
  let { f, errors } = await open(page);
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  await J(f, 'skipText');
  let s = await J(f, 'win', 'paddle');
  expect([s.feathers, s.sport.result.won]).toEqual([1, true]);
  // settings are saved too
  await J(f, 'go', 'settings'); await J(f, 'step', 100);
  await J(f, 'tap', 'easy'); await J(f, 'step', 100);
  expect((await state(f)).settings.easy).toBe(true);
  await J(f, 'go', 'kapok');
  await J(f, 'walk', 'down', 2);
  const pos = (await state(f)).pos;
  await page.waitForTimeout(3500);   // the SDK sends the save to the server
  await page.reload();
  f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  s = await state(f);
  expect([s.saved, s.feathers, s.feathersBy.paddle, s.settings.easy]).toEqual([true, 1, true, true]);
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['continue', 'play']));
  await J(f, 'tap', 'continue');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  s = await state(f);
  expect([s.pos.x, s.pos.y]).toEqual([pos.x, pos.y]);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) {
  test(`Jungle Cup fits ${size.width} x ${size.height}: title, island, map, sport intro, play, results`, async ({ page }) => {
    test.setTimeout(120_000);
    const { f, errors } = await open(page, size);
    const check = async () => {
      expect(await frameProblems(f)).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
      // the canvas fills the frame and every button drawn on it is big enough to tap
      const r = await f.evaluate(() => { const c = document.getElementById('jc').getBoundingClientRect(); return [c.width, c.height, innerWidth, innerHeight]; });
      expect([r[0], r[1]]).toEqual([r[2], r[3]]);
      await buttonsBigEnough(f, 36);
      const bs = await J(f, 'buttons');
      for (const b of bs) { expect(b.x).toBeGreaterThanOrEqual(-1); expect(b.y).toBeGreaterThanOrEqual(-1); expect(b.x + b.w).toBeLessThanOrEqual(r[2] + 1); expect(b.y + b.h).toBeLessThanOrEqual(r[3] + 1); }
    };
    await check();
    await J(f, 'tap', 'play');
    await expect.poll(async () => (await state(f)).screen).toBe('world');
    await J(f, 'skipText');
    await J(f, 'go', 'paddle'); await page.waitForTimeout(400);
    await check();
    expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['map', 'prompt']));
    for (const tab of ['map', 'settings', 'controls', 'style']) { await J(f, 'go', tab); await page.waitForTimeout(250); await check(); }
    await J(f, 'play', 'paddle', { intro: true }); await page.waitForTimeout(300);
    await check();
    await J(f, 'tap', 'go'); await page.waitForTimeout(4500);
    await check();
    expect((await J(f, 'buttons')).map(b => b.id)).toContain('pause');
    await J(f, 'win', 'paddle'); await page.waitForTimeout(800);
    await check();
    expect(await J(f, 'perf')).toMatchObject({});
    expect(errors).toEqual([]);
  });
}
