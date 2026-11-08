// Jungle Cup, Vine Climb: every leap in a freshly grown tree can be made (no gap wider than the grab reach), and a kid
// can climb from the 30 m branch past 39 m to the 45 m branch with real touch taps that react to the green ring
// (a quarter of a second late, as a kid would), and an early tap waits for the green instead of slipping.
// Run alone: E2E_PORT=6601 npx playwright test tests/e2e/jungle-cup-vine.spec.js
import { test, expect } from '@playwright/test';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
async function openVine(page) {
  await ownIp(page); await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  await J(f, 'manual', true);
  return f;
}
async function startRound(f) { await J(f, 'play', 'vine'); await J(f, 'step', 3900); await J(f, 'sport', 'hazards', false); }

test('Vine Climb: no impossible gap anywhere in the tree (25 grown trees)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  const f = await openVine(page);
  for (let run = 0; run < 25; run++) {
    await startRound(f);
    const gaps = await J(f, 'sport', 'gaps');
    expect(gaps.length).toBe(20);
    for (const g of gaps) expect(g.min, `tree ${run}, from ${g.m} m`).toBeLessThanOrEqual(g.r);
  }
});

test.describe('on a touch phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('real taps, reacting to the green ring, climb from 30 m past 39 m to the 45 m branch', async ({ page }) => {
    test.setTimeout(180_000);
    const f = await openVine(page);
    await startRound(f);
    await J(f, 'sport', 'to', 10);                    // the 30 m branch
    const box = await (await f.frameElement()).boundingBox();
    let st = await J(f, 'sport');
    expect([st.state, st.metres]).toEqual(['stand', 30]);
    for (let guard = 0; guard < 60 && st.best < 45; guard++) {
      await J(f, 'sport', 'sloane', 0);
      // wait for the ring to turn green, then a quarter of a second more (a kid's reaction), then tap
      const ok = await f.evaluate(() => {
        const j = window.__brbTest.jc;
        for (let fr = 0; fr < 600; fr++) {
          const s = j.sport();
          if ((s.state === 'hang' || s.state === 'stand') && !s.daze && (s.next === 'branch' || Math.abs(s.dx) <= s.r + (s.state === 'stand' ? 2 : 0))) { j.step(250); return true; }
          j.step(1000 / 60);
        }
        return false;
      });
      expect(ok).toBe(true);
      await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.6);
      await J(f, 'step', 700);
      st = await J(f, 'sport');
    }
    expect(st.best).toBeGreaterThanOrEqual(45);
  });

  test('an early tap waits for the green ring instead of slipping', async ({ page }) => {
    test.setTimeout(120_000);
    const f = await openVine(page);
    await startRound(f);
    await J(f, 'sport', 'to', 11);                    // hanging on the vine above the 30 m branch
    const box = await (await f.frameElement()).boundingBox();
    // step until the next vine is coming into reach but not yet green (yellow, closing in)
    const found = await f.evaluate(() => {
      const j = window.__brbTest.jc; let prev = 1e9;
      for (let fr = 0; fr < 600; fr++) {
        const s = j.sport(), d = Math.abs(s.dx);
        if (s.state === 'hang' && d > s.r + 2 && d < s.r * 2.2 && d < prev) return true;
        prev = d; j.step(1000 / 60);
      }
      return false;
    });
    expect(found).toBe(true);
    const before = await J(f, 'sport');
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height * 0.6);
    await J(f, 'step', 900);
    const after = await J(f, 'sport');
    expect(after.falls).toBe(before.falls);          // no slip
    expect(after.grabs).toBe(before.grabs + 1);      // it leapt and grabbed the next vine
  });
});
