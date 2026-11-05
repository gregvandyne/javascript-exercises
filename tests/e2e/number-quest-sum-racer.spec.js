// Number Quest's Sum Racer missions, booted in the real game frame (parity repair round 3, blocker 1).
//
// The completability suites exercise the service layer: they prove a step CAN complete, but they never
// open the game itself. That gap let step 1.2 "Round it!" ship broken through two evaluations: its
// mission is Sum Racer's course-only Rounding Run track (level=9&lock=1), whose scene lookup had no
// entry for track 9, so the palette draw threw ("reading 'sky'") and the race froze on its countdown
// forever while every service test stayed green. This spec closes the gap for the whole class: it reads
// every Sum Racer mission Number Quest assigns out of units.json, opens each one exactly the way the
// course sends a student in (the play page with the step's lesson parameters), presses Play, and proves
// the race actually starts — countdown over, questions flowing — with no page error. The Rounding Run
// is additionally driven to the finish to prove its win path (place 1) works end to end in the frame.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gameFrame } from './helpers.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const UNITS = JSON.parse(fs.readFileSync(path.join(ROOT, 'seed-lessons/number-quest/units.json'), 'utf8'));
const MISSIONS = [];
for (const u of UNITS.units) for (const s of u.steps || []) {
  const g = s.game && s.game.explorer;
  if (g && g.slug === 'sum-racer') MISSIONS.push({ step: `explorer-${s.n}`, chapter: g.chapter, params: g.params });
}

test('units.json assigns Sum Racer missions to steps 1.2, 2.1, 2.2, 3.1, 3.2 and 3.3', () => {
  expect(MISSIONS.map(m => m.step)).toEqual(['explorer-1.2', 'explorer-2.1', 'explorer-2.2', 'explorer-3.1', 'explorer-3.2', 'explorer-3.3']);
});

for (const m of MISSIONS) {
  test(`Sum Racer mission for step ${m.step} (${m.chapter}) starts and races in the live frame`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(String(e && e.message || e)));
    await page.goto(`/play/sum-racer?course=number-quest&cstep=${m.step}&${m.params}`);
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
    // The student's way in: the kit title's Play button, which in lesson mode starts the locked track.
    await f.locator('.ok-title-screen #playBtn').click();
    // The countdown must end and the race begin (this is where the Rounding Run used to freeze).
    await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 20000 }).toBe('racing');
    const st = await f.evaluate(() => __brbTest.state());
    expect(st.track, 'the locked track is the one racing').toBe(Number(new URLSearchParams(m.params).get('level')));
    expect(st.question, 'a first question is served').toBeTruthy();
    expect(st.question.text).toBeTruthy();
    expect(errors, 'no page errors in the frame').toEqual([]);
  });
}

test('the Rounding Run (step 1.2) can be won in the live frame', async ({ page }) => {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e && e.message || e)));
  const m = MISSIONS.find(x => x.step === 'explorer-1.2');
  await page.goto(`/play/sum-racer?course=number-quest&cstep=${m.step}&${m.params}`);
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 20000 });
  await f.locator('.ok-title-screen #playBtn').click();
  await expect.poll(() => f.evaluate(() => __brbTest.state().phase), { timeout: 20000 }).toBe('racing');
  // Drive the race the strong way: the student answers every question correctly, fast.
  const end = await f.evaluate(() => {
    const T = window.__brbTest;
    for (let i = 0; i < 60 * 900 && T.state().phase !== 'done'; i++) {
      const st = T.state();
      if (st.phase === 'countdown') { T.skipAnimations(); continue; }
      if (st.question && st.p[0] && !st.p[0].locked) T.answer(st.question.answer, 0);
      T.step(200);
    }
    return T.state();
  });
  expect(end.phase).toBe('done');
  expect(end.results, 'the race produced results').toBeTruthy();
  expect(end.results.place, 'a perfect run wins the Rounding Run').toBe(1);
  expect(errors, 'no page errors in the frame').toEqual([]);
});
