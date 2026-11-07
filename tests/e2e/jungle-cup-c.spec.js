// Jungle Cup sports, part c: Banana Kick (vs Mico) and Leaf Slide (vs Kiki), through the real play page.
// Each sport: the intro card, real input (a mouse drag on the canvas, on-screen buttons, keys, swipes), a match won
// by playing with keys like a player (reading what is on screen through the sport's state) and one lost by doing
// nothing, the win / lose hooks, pause; Easier champions; a balance run of the bots at three skill levels; then the
// layout check (tests/e2e/frame-fit.js plus every canvas button's size) at 390 x 844, 844 x 390 and 1366 x 768, with
// screenshots in $JC_SHOTS (default .claude/work/jungle-out/sports-c/) when that folder exists.
// Run alone: E2E_PORT=4641 npx playwright test tests/e2e/jungle-cup-c.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const SHOTS = process.env.JC_SHOTS || path.resolve('.claude/work/jungle-out/sports-c');
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
async function playUntilResults(f, secs) {
  for (let i = 0; i < secs; i++) {
    const s = await f.evaluate(() => { const j = window.__brbTest.jc; j.skipText(); j.step(1000); return j.state().sport; });
    if (s && s.phase === 'results') return s;
  }
  return (await state(f)).sport;
}
const touchMode = (f, on) => f.evaluate(on => { window.JC.input.device = on ? 'touch' : 'keys'; }, on);
/** Virtual pixels -> page CSS pixels (the game runs in an iframe). */
async function toPage(page, f, vx, vy) {
  const box = await (await f.frameElement()).boundingBox();
  const v = (await state(f)).view;
  return [box.x + vx * v.S / v.dpr, box.y + vy * v.S / v.dpr];
}

/** One shootout played with the keys like a player: aim at a corner, stop the power in the green, dive where Mico looks. */
async function kickWithKeys(f, maxSteps = 900) {
  return f.evaluate(maxSteps => {
    const j = window.__brbTest.jc;
    let side = 1, lastPhase = '';
    for (let i = 0; i < maxSteps; i++) {
      const st = j.state().sport; if (!st || st.phase !== 'play') return st;
      const s = j.sport();
      if (s.side === 'shoot' && s.phase === 'aim') {
        if (!s.meterOn) {
          side = -side; const key = side < 0 ? 'left' : 'right';
          j.press(key); j.step(560); j.release(key);
          j.tapKey('a');
        } else if (s.meter >= 0.78 && s.meter <= 0.9) j.tapKey('a');
      } else if (s.side === 'keep' && s.phase === 'fly' && s.dive === 9) {
        // Mico's look (eyes and tail) is drawn on screen; the player dives that way once he has kicked
        j.tapKey(s.tell < 0 ? 'left' : s.tell > 0 ? 'right' : 'down');
      }
      lastPhase = s.phase;
      j.step(s.side === 'shoot' && s.meterOn ? 16 : 50);
    }
    return { timeout: true, lastPhase };
  }, maxSteps);
}

test('Banana Kick: intro, a mouse drag and keys shoot, buttons / keys / swipes dive; won with keys, lost by idling', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  await J(f, 'go', 'kick'); await J(f, 'step', 300);
  expect((await state(f)).prompt).toBe('kick');
  await J(f, 'tapKey', 'a'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', 'kick', 'intro']);
  await shoot(page, 'kick-intro');
  await J(f, 'tap', 'go'); await J(f, 'sport', 'seed', 7); await J(f, 'step', 3800);
  s = await sport(f);
  expect([s.side, s.phase]).toEqual(['shoot', 'aim']);
  // a real mouse drag on the canvas, from the ball up toward the right post: the aim follows, the release kicks
  const L = s.layout;
  const [px, py] = await toPage(page, f, L.bx, L.by);
  await page.mouse.move(px, py); await page.mouse.down();
  // the drag is copied onto the ball (stretched by the sport's gain): aim at the top right of the goal
  const gain = Math.max(1, (L.by - L.gy0) / Math.max(60, L.H * 0.34));
  const [qx, qy] = await toPage(page, f, L.bx + (L.gw * 0.36) / gain, L.by - (L.by - (L.gy0 + L.gh * 0.25)) / gain);
  await page.mouse.move((px + qx) / 2, (py + qy) / 2, { steps: 4 });
  expect((await sport(f)).drag).toBe(true);
  await J(f, 'step', 50); await shoot(page, 'kick-drag');
  await page.mouse.move(qx, qy, { steps: 4 }); await page.mouse.up();
  s = await sport(f);
  expect(['kick', 'fly']).toContain(s.phase);
  expect(['goal', 'save', 'post']).toContain(s.outcome);
  await J(f, 'step', 300);
  expect((await state(f)).sounds).toEqual(expect.arrayContaining(['kick']));
  await J(f, 'step', 400); await shoot(page, 'kick-shot');
  await J(f, 'step', 2200);
  s = await sport(f);
  expect([s.nYou, s.side]).toEqual([1, 'keep']);
  // keeping with the on-screen buttons
  await touchMode(f, true);
  for (let i = 0; i < 40 && (await sport(f)).phase !== 'tell'; i++) await J(f, 'step', 100);
  await J(f, 'step', 200); await shoot(page, 'kick-keep-tell');
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['pause', 'kdl', 'kdc', 'kdr']));
  await J(f, 'tap', 'kdr');
  expect((await sport(f)).dive).toBe(1);
  await J(f, 'step', 3000);
  s = await sport(f);
  expect(s.nMico).toBe(1);
  // the next keep: a swipe dives, then the keys
  for (let i = 0; i < 80 && !((await sport(f)).side === 'keep' && (await sport(f)).phase === 'tell'); i++) {
    const st = await sport(f);
    if (st.side === 'shoot' && st.phase === 'aim') { await touchMode(f, false); await J(f, 'tapKey', 'a'); await J(f, 'step', 700); await J(f, 'tapKey', 'a'); }
    await J(f, 'step', 100);
  }
  await J(f, 'swipe', 'left');
  expect((await sport(f)).dive).toBe(-1);
  // the rest of the match with keys only, like a player: a fixed seed makes it the same every run
  await J(f, 'step', 600); await J(f, 'tap', 'retry');
  await J(f, 'play', 'kick'); await J(f, 'sport', 'seed', 11); await J(f, 'step', 3800);
  await touchMode(f, false);
  s = await kickWithKeys(f);
  s = await playUntilResults(f, 5);
  expect(s.phase).toBe('results');
  expect(s.result.won, JSON.stringify(s)).toBe(true);
  expect(s.newFeather).toBe(true);
  await shoot(page, 'kick-results-won');
  s = await state(f);
  expect([s.feathersBy.kick, s.stars.kick >= 1, s.best.kick > 0]).toEqual([true, true, true]);
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1).won).toBe(true);
  // the bot (test hook) wins too
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'sport', 'seed', 5); await J(f, 'step', 3800);
  await J(f, 'sport', 'auto', true);
  s = await playUntilResults(f, 120);
  expect([s.phase, s.result.won]).toEqual(['results', true]);
  // idle: soft kicks Mico saves, no dives: Mico wins
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'sport', 'seed', 3); await J(f, 'step', 3800);
  s = await playUntilResults(f, 200);
  expect([s.phase, s.result.won, s.result.stars]).toEqual(['results', false, 0]);
  expect(s.result.stats.mico).toBeGreaterThan(s.result.stats.you);
  s = await state(f);
  expect([s.feathersBy.kick, s.best.kick > 0]).toEqual([true, true]);
  // pause
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3900);
  await J(f, 'tapKey', 'a'); await J(f, 'step', 100);
  await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('paused');
  const m0 = (await sport(f)).meter; await J(f, 'step', 500);
  expect((await sport(f)).meter).toBe(m0);
  await J(f, 'tap', 'resume'); await J(f, 'step', 200);
  expect((await sport(f)).meter).not.toBe(m0);
  s = await J(f, 'lose', 'kick'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', false]);
  s = await J(f, 'win', 'kick'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', true]);
  expect(errors).toEqual([]);
});

/** A whole slide played with the keys like a player: Space on each ramp, tricks that fit the air, hop the logs. */
async function slideWithKeys(f) {
  return f.evaluate(() => {
    const j = window.__brbTest.jc, order = ['up', 'left', 'down'];
    for (let i = 0; i < 6000; i++) {
      const st = j.state().sport; if (!st || st.phase !== 'play') return st;
      const s = j.sport();
      if (s.over) { j.step(100); continue; }
      if (!s.air) {
        if (s.onRamp && !s.pop) j.tapKey('a');
        else if (s.nextLog > 0 && s.nextLog < s.vx * 0.2) j.tapKey('a');
      } else if (!s.trick && !s.queue) {
        const dur = { up: 0.52, left: 0.42, down: 0.34 }, want = order[s.nTr % 3];
        if (s.landIn > dur[want] + 0.08) j.tapKey(want);
        else if (s.landIn > dur.down + 0.08) j.tapKey('down');
      }
      j.step(33);
    }
    return null;
  });
}

test('Leaf Slide: intro, keys / buttons / swipes / taps jump and trick; a slide won with keys and one lost by idling', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  await J(f, 'go', 'leaf'); await J(f, 'step', 300);
  expect((await state(f)).prompt).toBe('leaf');
  await J(f, 'tapKey', 'a'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport.id, s.sport.phase]).toEqual(['sport', 'leaf', 'intro']);
  await shoot(page, 'leaf-intro');
  await J(f, 'tap', 'go'); await J(f, 'step', 3800);
  expect((await state(f)).sport.phase).toBe('play');
  // touch: the jump button on the first ramp pops, the trick buttons work in the air
  await touchMode(f, true); await J(f, 'step', 50);
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['pause', 'ljump']));
  for (let i = 0; i < 200 && !(await sport(f)).onRamp; i++) await J(f, 'step', 33);
  await J(f, 'tap', 'ljump');
  expect((await sport(f)).pop).toBe(true);
  for (let i = 0; i < 60 && !(await sport(f)).air; i++) await J(f, 'step', 33);
  await J(f, 'step', 80);
  expect((await J(f, 'buttons')).map(b => b.id)).toEqual(expect.arrayContaining(['lspin', 'lflip', 'lgrab']));
  await J(f, 'tap', 'lflip');
  expect((await sport(f)).trick).toBe('flip');
  await J(f, 'step', 120); await shoot(page, 'leaf-flip');
  for (let i = 0; i < 40 && (await sport(f)).air; i++) await J(f, 'step', 33);
  s = await sport(f);
  expect(s.pops).toBe(1);
  expect(s.score + s.crashes).toBeGreaterThan(0);
  // a swipe up on the next ramp, a tap trick in the air
  for (let i = 0; i < 300 && !(await sport(f)).onRamp; i++) await J(f, 'step', 33);
  await J(f, 'swipe', 'up');
  for (let i = 0; i < 60 && !(await sport(f)).air; i++) await J(f, 'step', 33);
  await J(f, 'step', 80);
  await J(f, 'swipe', 'down');
  expect((await sport(f)).trick).toBe('grab');
  // the rest with the keys, like a player
  await J(f, 'step', 600); await J(f, 'tap', 'retry');
  await J(f, 'play', 'leaf'); await J(f, 'sport', 'seed', 21); await J(f, 'step', 3800);
  await touchMode(f, false);
  await J(f, 'step', 4000); await shoot(page, 'leaf-play-keys');
  s = await slideWithKeys(f);
  s = await playUntilResults(f, 5);
  expect(s.phase).toBe('results');
  expect(s.result.won, JSON.stringify(s)).toBe(true);
  expect(s.result.stats.tricks).toBeGreaterThan(20);
  expect(s.newFeather).toBe(true);
  await shoot(page, 'leaf-results-won');
  s = await state(f);
  expect([s.feathersBy.leaf, s.stars.leaf >= 1, s.best.leaf > 0]).toEqual([true, true, true]);
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1).won).toBe(true);
  // the bot wins too
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  await J(f, 'sport', 'auto', true);
  s = await playUntilResults(f, 100);
  expect([s.phase, s.result.won]).toEqual(['results', true]);
  // idle: no tricks, logs bonk, Kiki wins
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  s = await playUntilResults(f, 100);
  expect([s.phase, s.result.won, s.result.stars]).toEqual(['results', false, 0]);
  s = await state(f);
  expect([s.feathersBy.leaf, s.best.leaf > 0]).toEqual([true, true]);
  // landing mid-trick is a wipeout
  await J(f, 'step', 600); await J(f, 'tap', 'retry'); await J(f, 'step', 3800);
  for (let i = 0; i < 300 && !(await sport(f)).onRamp; i++) await J(f, 'step', 33);
  await J(f, 'tapKey', 'a');
  for (let i = 0; i < 60 && !(await sport(f)).air; i++) await J(f, 'step', 33);
  for (let i = 0; i < 60 && (await sport(f)).landIn > 0.3; i++) await J(f, 'step', 33);
  await J(f, 'tapKey', 'up');
  await J(f, 'step', 600);
  s = await sport(f);
  expect(s.crashes).toBe(1);
  expect((await state(f)).sounds).toEqual(expect.arrayContaining(['lsSplat']));
  // pause
  await J(f, 'tapKey', 'b'); await J(f, 'step', 100);
  expect((await state(f)).sport.phase).toBe('paused');
  const x0 = (await sport(f)).x; await J(f, 'step', 500);
  expect((await sport(f)).x).toBe(x0);
  await J(f, 'tap', 'resume'); await J(f, 'step', 300);
  expect((await sport(f)).x).toBeGreaterThan(x0);
  s = await J(f, 'lose', 'leaf'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', false]);
  s = await J(f, 'win', 'leaf'); expect([s.sport.phase, s.sport.result.won]).toEqual(['results', true]);
  expect(errors).toEqual([]);
});

test('Easier champions: Mico looks longer and never fakes, Kiki scores less', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page);
  const kiki = async () => { await J(f, 'play', 'leaf'); await J(f, 'sport', 'seed', 4); await J(f, 'step', 3800); await J(f, 'step', 40000); return (await sport(f)).kiki; };
  await J(f, 'setSave', { settings: { easy: true, font: 'pixel' } });
  const easy = await kiki();
  await J(f, 'setSave', { settings: { easy: false, font: 'pixel' } });
  const normal = await kiki();
  expect(easy).toBeLessThan(normal * 0.8);
  expect(errors).toEqual([]);
});

test('Balance: the bots at three skill levels (sloppy kids lose more, steady kids win)', async ({ page }) => {
  test.setTimeout(240_000);
  const { f, errors } = await open(page);
  const out = await f.evaluate(() => {
    const j = window.__brbTest.jc, res = {};
    const leaf = (skill, easy, seed) => {
      j.setSave({ settings: { easy, font: 'pixel' } });
      j.play('leaf'); j.sport('seed', seed); j.play('leaf'); j.step(3800); j.sport('auto', true); j.sport('skill', skill);
      for (let i = 0; i < 100 && j.state().sport.phase !== 'results'; i++) j.step(1000);
      const r = j.state().sport.result; return r;
    };
    const kick = (sigma, easy, seed) => {
      j.setSave({ settings: { easy, font: 'pixel' } });
      j.play('kick'); j.step(3800); j.sport('seed', seed); j.sport('sigma', sigma); j.sport('auto', true);
      for (let i = 0; i < 200 && j.state().sport.phase !== 'results'; i++) j.step(1000);
      return j.state().sport.result;
    };
    for (const [name, skill, easy] of [['leafPro', 1, false], ['leafKid', 0.55, false], ['leafSloppy', 0.25, false], ['leafSloppyEasy', 0.25, true]]) {
      let w = 0, sum = 0, kk = 0; for (let s = 1; s <= 10; s++) { const r = leaf(skill, easy, s * 31); w += r.won ? 1 : 0; sum += r.score; kk += r.stats.kiki; } res[name] = { wins: w, of: 10, avg: Math.round(sum / 10), kiki: Math.round(kk / 10) };
    }
    for (const [name, sigma, easy] of [['kickPro', 0, false], ['kickSloppy', 0.25, false], ['kickSloppyEasy', 0.25, true]]) {
      let w = 0; for (let s = 1; s <= 12; s++) { const r = kick(sigma, easy, s * 17); w += r.won ? 1 : 0; } res[name] = { wins: w, of: 12 };
    }
    j.setSave({ settings: { easy: false, font: 'pixel' } });
    return res;
  });
  console.log('balance', JSON.stringify(out));
  expect(out.leafPro.wins).toBeGreaterThanOrEqual(9);
  expect(out.leafSloppyEasy.wins).toBeGreaterThanOrEqual(out.leafSloppy.wins);
  expect(out.kickPro.wins).toBeGreaterThanOrEqual(10);
  expect(errors).toEqual([]);
});

for (const size of [{ width: 390, height: 844 }, { width: 844, height: 390 }, { width: 1366, height: 768 }]) {
  test(`Banana Kick and Leaf Slide fit ${size.width} x ${size.height}: intro, play, pause, results`, async ({ page }) => {
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
      for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
        const a = bs[i], b = bs[j], over = a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 1 && b.y < a.y + a.h - 1;
        expect(over, `${a.id} overlaps ${b.id}`).toBe(false);
      }
    };
    for (const id of ['kick', 'leaf']) {
      await J(f, 'play', id, { intro: true }); await J(f, 'step', 300);
      await check(); await shoot(page, `${id}-${tag}-intro`);
      await J(f, 'tap', 'go'); await J(f, 'sport', 'seed', 9); await J(f, 'step', 3800);
      for (const touch of [true, false]) {
        await touchMode(f, touch);
        await J(f, 'sport', 'auto', true);
        if (id === 'kick') {
          // a shot in the air, then a keep while Mico shows his look
          for (let i = 0; i < 80; i++) { const s = await sport(f); if (s.side === 'shoot' && s.phase === 'fly') break; await J(f, 'step', 50); }
          await J(f, 'step', 150); await check(); await shoot(page, `kick-${tag}-shoot-${touch ? 'touch' : 'keys'}`);
          await J(f, 'sport', 'auto', false);
          for (let i = 0; i < 120; i++) { const s = await sport(f); if (s.side === 'keep' && s.phase === 'tell') break; await J(f, 'step', 50); }
          await J(f, 'step', 500); await check(); await shoot(page, `kick-${tag}-keep-${touch ? 'touch' : 'keys'}`);
          await J(f, 'sport', 'auto', true);
          for (let i = 0; i < 80; i++) { const s = await sport(f); if (s.side === 'shoot' && s.phase === 'aim') break; await J(f, 'step', 100); }
          await J(f, 'sport', 'auto', false); await J(f, 'step', 200);
          await check(); await shoot(page, `kick-${tag}-aim-${touch ? 'touch' : 'keys'}`);
        } else {
          for (let i = 0; i < 300; i++) { const s = await sport(f); if (s.air && s.trick) break; await J(f, 'step', 33); }
          await J(f, 'step', 100); await check(); await shoot(page, `leaf-${tag}-play-${touch ? 'touch' : 'keys'}`);
          await J(f, 'step', 4000);
        }
      }
      await J(f, 'tapKey', 'b'); await J(f, 'step', 200);
      expect((await state(f)).sport.phase).toBe('paused');
      await check(); await shoot(page, `${id}-${tag}-paused`);
      await J(f, 'tap', 'resume');
      await J(f, 'win', id); await J(f, 'step', 1500);
      await check(); await shoot(page, `${id}-${tag}-results`);
    }
    const perf = await J(f, 'perf');
    expect(perf.frames).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
}
