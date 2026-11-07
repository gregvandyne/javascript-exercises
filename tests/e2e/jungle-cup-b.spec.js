// Jungle Cup sports, part b: Rapids Run (vs the Otter Twins) and Frog Chorus (vs Rana), through the real play page.
// Each sport: the intro card, real input (on-screen buttons, keys, swipes / drum taps and keys), a win by playing and a
// loss by standing still (both through the round, not the hooks), the win / lose hooks, pause; then the layout check
// (tests/e2e/frame-fit.js plus every canvas button's size) at 390 x 844, 844 x 390 and 1366 x 768, with screenshots in
// $JC_SHOTS (default .claude/work/jungle-out/sports-b/) when that folder exists.
// Run alone: E2E_PORT=4631 npx playwright test tests/e2e/jungle-cup-b.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const SHOTS = process.env.JC_SHOTS || path.resolve('.claude/work/jungle-out/sports-b');
const shoot = async (page, name) => { if (fs.existsSync(SHOTS)) await page.screenshot({ path: path.join(SHOTS, name + '.png') }); };
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
  await J(f, 'manual', true);
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
const touchMode = (f, on) => f.evaluate(on => { window.JC.input.device = on ? 'touch' : 'keys'; }, on);

test('Rapids Run: intro, buttons / keys / swipes steer, jump and duck; a race won by playing and one lost by idling', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  // from the arch: the intro card, then Play
  await J(f, 'go', 'rapids'); await J(f, 'step', 300);
  expect((await state(f)).prompt).toBe('rapids');
  await J(f, 'tapKey', 'a'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', 'rapids', 'intro']);
  await J(f, 'tap', 'go'); await J(f, 'step', 3800);
  expect((await state(f)).sport.phase).toBe('play');
  // touch: the arrow buttons steer, the green one jumps, the orange one ducks
  await touchMode(f, true); await J(f, 'step', 50);
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['pause', 'rleft', 'rjump', 'rduck', 'rright']));
  await J(f, 'tap', 'rleft'); await J(f, 'step', 300);
  expect((await sport(f)).lane).toBe(0);
  await J(f, 'tap', 'rright'); await J(f, 'tap', 'rright'); await J(f, 'step', 300);
  expect((await sport(f)).lane).toBe(2);
  await J(f, 'tap', 'rjump'); await J(f, 'step', 50);
  expect((await sport(f)).jumping).toBe(true);
  expect((await state(f)).sounds).toEqual(expect.arrayContaining(['rapJump']));
  await J(f, 'step', 800);
  await J(f, 'tap', 'rduck'); await J(f, 'step', 50);
  expect((await sport(f)).ducking).toBe(true);
  // swipes and keys do the same
  await J(f, 'step', 900);
  await J(f, 'swipe', 'left'); await J(f, 'step', 300);
  expect((await sport(f)).lane).toBe(1);
  await J(f, 'tapKey', 'left'); await J(f, 'step', 300);
  expect((await sport(f)).lane).toBe(0);
  await J(f, 'swipe', 'up'); await J(f, 'step', 50);
  expect((await sport(f)).jumping).toBe(true);
  // the rest of the race with real keys only, reading the river ahead like a player would
  await touchMode(f, false);
  for (let i = 0; i < 1200; i++) {
    const st = await f.evaluate(() => {
      const j = window.__brbTest.jc, s = j.sport();
      if (!s || j.state().sport.phase !== 'play') return j.state().sport;
      const blocked = (o, l) => (o.kind === 'rock' || o.kind === 'croc') && (o.lanes & (1 << l));
      let want = s.lane;
      for (const o of s.ahead) {
        if (o.kind === 'log' && o.ahead < 3.2 && !s.jumping) j.tapKey('up');
        if (o.kind === 'branch' && o.ahead < 3.6 && !s.ducking) j.tapKey('down');
        if (o.ahead > 2 && o.ahead < 24 && blocked(o, want)) { want = [0, 1, 2].filter(l => !blocked(o, l)).sort((a, b) => Math.abs(a - s.lane) - Math.abs(b - s.lane))[0]; break; }
        if (o.kind === 'bubble' && o.ahead > 2 && o.ahead < 14 && !(o.lanes & (1 << want))) { want = [0, 1, 2].find(l => o.lanes & (1 << l)); break; }
      }
      if (want < s.lane) j.tapKey('left'); else if (want > s.lane) j.tapKey('right');
      j.step(100);
      return j.state().sport;
    });
    if (st.phase !== 'play') break;
  }
  s = await playUntilResults(f, 10);
  expect(s.phase).toBe('results');
  expect(s.state.done).toBe(true);
  expect(s.result.won, JSON.stringify(s.result)).toBe(true);
  expect(s.newFeather).toBe(true);
  s = await state(f);
  expect([s.feathersBy.rapids, s.stars.rapids >= 1, s.best.rapids > 0]).toEqual([true, true, true]);
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1).won).toBe(true);
  await shoot(page, 'rapids-results-won');
  // Try again: the autopilot (test hook) wins too
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  await J(f, 'sport', 'auto', true);
  s = await playUntilResults(f, 120);
  expect([s.phase, s.result.won, s.result.stats.place]).toEqual(['results', true, 1]);
  // idle: Cappy hits every log and branch in the middle lane and comes in behind the otters
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  s = await playUntilResults(f, 120);
  expect([s.phase, s.result.won, s.result.stars]).toEqual(['results', false, 0]);
  expect(s.state.bonks).toBeGreaterThan(8);
  expect(s.result.stats.place).toBeGreaterThan(1);
  s = await state(f);
  expect([s.feathersBy.rapids, s.best.rapids > 0]).toEqual([true, true]);   // losing never takes anything away
  // pause (Esc), keep playing
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 4000);
  await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('paused');
  const d0 = (await sport(f)).d; await J(f, 'step', 1000);
  expect((await sport(f)).d).toBe(d0);
  await J(f, 'tap', 'resume'); await J(f, 'step', 500);
  expect((await sport(f)).d).toBeGreaterThan(d0);
  // the hooks
  s = await J(f, 'lose', 'rapids'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', false]);
  s = await J(f, 'win', 'rapids'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', true]);
  expect(errors).toEqual([]);
});

test('Frog Chorus: intro, drums played by keys and taps in time; a song won by playing and one lost by idling', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  await J(f, 'go', 'frog'); await J(f, 'step', 300);
  expect((await state(f)).prompt).toBe('frog');
  await J(f, 'tapKey', 'a'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', 'frog', 'intro']);
  await J(f, 'tap', 'go'); await J(f, 'step', 3800);
  s = await sport(f);
  expect([s.phase, s.rounds, s.notes > 60]).toEqual(['count', 18, true]);
  // the drums are canvas buttons (tap targets)
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['pause', 'drum0', 'drum1', 'drum2']));
  // play the whole song: drum taps for the first rounds, then the keys (Left / Down / Right), each on its beat
  const KEYS = ['left', 'down', 'right'];
  let taps = 0;
  for (let i = 0; i < 400; i++) {
    const st = await sport(f);
    if (!st || st.done || !st.next) break;
    if (st.next.inS > 0.012) { await J(f, 'step', Math.round(st.next.inS * 1000)); continue; }
    if (st.next.round <= 3) { await J(f, 'tap', 'drum' + st.next.drum); taps++; } else await J(f, 'tapKey', KEYS[st.next.drum]);
    await J(f, 'step', 17);
  }
  expect(taps).toBeGreaterThan(5);
  s = await playUntilResults(f, 10);
  expect(s.phase).toBe('results');
  expect(s.result.won, JSON.stringify(s.result)).toBe(true);
  expect(s.result.stats.accuracy).toBeGreaterThan(85);
  expect(s.state.misses).toBeLessThan(5);
  expect(s.newFeather).toBe(true);
  s = await state(f);
  expect([s.feathersBy.frog, s.stars.frog >= 2, s.best.frog > 0]).toEqual([true, true, true]);
  expect(s.sounds).toEqual(expect.arrayContaining(['drumLow', 'drumMid', 'drumHigh']));
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1).won).toBe(true);
  await shoot(page, 'frog-results-won');
  // the test bot (hook) wins too; idling loses (every note a miss) and costs nothing
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  await J(f, 'sport', 'auto', true);
  s = await playUntilResults(f, 100);
  expect([s.phase, s.result.won, s.result.stars, s.state.misses]).toEqual(['results', true, 3, 0]);
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  s = await playUntilResults(f, 100);
  expect([s.phase, s.result.won, s.result.stars, s.state.you]).toEqual(['results', false, 0, 0]);
  expect(s.state.misses).toBe(s.state.notes);
  s = await state(f);
  expect([s.feathersBy.frog, s.best.frog > 0]).toEqual([true, true]);
  // a wrong drum is not a hit
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  for (let i = 0; i < 40; i++) { const st = await sport(f); if (st.next.inS < 0.012) break; await J(f, 'step', Math.max(17, Math.round(st.next.inS * 1000))); }
  const nx = (await sport(f)).next;
  await J(f, 'tapKey', KEYS[(nx.drum + 1) % 3]); await J(f, 'step', 17);
  s = await sport(f);
  expect([s.wrong, s.you]).toEqual([1, 0]);
  // pause stops the beat clock
  await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
  const t0 = (await sport(f)).time; await J(f, 'step', 1000);
  expect((await sport(f)).time).toBe(t0);
  await J(f, 'tap', 'resume'); await J(f, 'step', 500);
  expect((await sport(f)).time).toBeGreaterThan(t0);
  s = await J(f, 'lose', 'frog'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', false]);
  s = await J(f, 'win', 'frog'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', true]);
  expect(errors).toEqual([]);
});

test('Easier champions: slower otters, a lower mark from Rana and wider timing', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page);
  await J(f, 'setSave', { settings: { easy: true, font: 'pixel' } });
  await J(f, 'play', 'frog'); await J(f, 'step', 3800);
  let s = await sport(f);
  expect(s.target).toBeLessThan(0.5);
  await J(f, 'play', 'rapids'); await J(f, 'step', 3800); await J(f, 'step', 20000);
  const easy = (await sport(f)).rivals[0].d;
  await J(f, 'setSave', { settings: { easy: false, font: 'pixel' } });
  await J(f, 'play', 'rapids'); await J(f, 'step', 3800); await J(f, 'step', 20000);
  s = await sport(f);
  expect(s.rivals[0].d).toBeGreaterThan(easy);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`Rapids Run and Frog Chorus fit ${size.width} x ${size.height}: intro, play, pause, results`, async ({ page }) => {
    test.setTimeout(120_000);
    const { f, errors } = await open(page, size);
    const tag = size.width < size.height ? 'p' : size.width < 1000 ? 'l' : 'd';
    const check = async () => {
      expect(await frameProblems(f)).toEqual([]);
      expect(await pageScrollsSideways(page)).toBe(false);
      const r = await f.evaluate(() => { const c = document.getElementById('jc').getBoundingClientRect(); return [c.width, c.height, innerWidth, innerHeight]; });
      expect([r[0], r[1]]).toEqual([r[2], r[3]]);
      const bs = await J(f, 'buttons');
      const small = bs.filter(b => Math.min(b.w, b.h) < 36);
      expect(small, JSON.stringify(small)).toEqual([]);
      for (const b of bs) { expect(b.x).toBeGreaterThanOrEqual(-1); expect(b.y).toBeGreaterThanOrEqual(-1); expect(b.x + b.w).toBeLessThanOrEqual(r[2] + 1); expect(b.y + b.h).toBeLessThanOrEqual(r[3] + 1); }
      // no two buttons overlap
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j], over = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(over, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    };
    for (const id of ['rapids', 'frog']) {
      await J(f, 'play', id, { intro: true }); await J(f, 'step', 300);
      await check(); await shoot(page, `${id}-${tag}-intro`);
      await J(f, 'tap', 'go'); await J(f, 'step', 3800);
      for (const touch of [true, false]) {
        await touchMode(f, touch);
        await J(f, 'sport', 'auto', true);
        await J(f, 'step', id === 'rapids' ? (touch ? 7000 : 9000) : (touch ? 6800 : 9200));
        await check(); await shoot(page, `${id}-${tag}-play-${touch ? 'touch' : 'keys'}`);
      }
      await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
      expect((await state(f)).sport.phase).toBe('paused');
      await check(); await shoot(page, `${id}-${tag}-paused`);
      await J(f, 'tap', 'resume'); await J(f, 'step', 100);
      const s = await playUntilResults(f, 120);
      expect([s.phase, s.result.won]).toEqual(['results', true]);
      await J(f, 'step', 1500);
      await check(); await shoot(page, `${id}-${tag}-results`);
    }
    // a real frame rate on a running race (not manual time)
    await J(f, 'manual', false);
    await J(f, 'play', 'rapids'); await page.waitForTimeout(6000);
    const perf = await J(f, 'perf');
    expect(perf.frames).toBeGreaterThan(100);
    expect(errors).toEqual([]);
  });
}
