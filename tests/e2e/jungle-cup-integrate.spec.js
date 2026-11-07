// Jungle Cup, the whole game put together: the painted raft-arrival panels at each launch (Skip, and Continue shows
// them once per launch), a full run of all eight Feathers (the totem, the map, the vine lift), the finale (painted
// panels, the Cup raised on the Canopy Stage, credits, free play), the bonus bandanas, every site language, and the
// score sent to the platform. With JC_INTEGRATE_SHOTS=<dir> it also takes the pictures of every screen at 390 x 844
// and 1366 x 768 in the light and dark site themes, each with the layout check.
// Run alone: E2E_PORT=4651 npx playwright test tests/e2e/jungle-cup-integrate.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';
import { frameProblems, pageScrollsSideways } from './frame-fit.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const SPORTS = ['paddle', 'vine', 'seed', 'rapids', 'frog', 'kick', 'leaf', 'dash'];
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

test('Jungle Cup: raft-arrival panels (Skip), eight Feathers, the vine lift, the finale, credits and free play', async ({ page }) => {
  test.setTimeout(180_000);
  const { f, errors } = await open(page);
  await J(f, 'tap', 'play');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  // the painted panels open the game, one per line: the river, the isle, the dock
  let s = await state(f);
  expect([s.text.key, s.panel]).toEqual(['story.1', 'river']);
  await J(f, 'manual', true);
  await J(f, 'next'); await J(f, 'step', 100);
  expect((await state(f)).panel).toBe('isle');
  expect((await J(f, 'buttons')).map(b => b.id)).toContain('skip');
  // Skip jumps past every panel; the cousins still say hello
  await J(f, 'tap', 'skip'); await J(f, 'step', 100);
  s = await state(f);
  expect([s.panel, s.text && s.text.key]).toEqual(['', 'd.coco.hi']);
  await J(f, 'skipText');
  // win all eight: each Feather lights a totem socket, the map shows it, the lift opens
  for (const id of SPORTS) {
    s = await J(f, 'win', id);
    expect(s.sport.newFeather).toBe(true);
  }
  s = await state(f);
  expect(s.feathers).toBe(SPORTS.length);
  for (const id of SPORTS) expect(s.stars[id]).toBeGreaterThanOrEqual(1);
  await J(f, 'go', 'map'); await J(f, 'step', 100);
  expect((await J(f, 'buttons')).filter(b => b.id.startsWith('go:')).length).toBe(SPORTS.length);
  await J(f, 'go', 'lift'); await J(f, 'step', 400);
  await J(f, 'talk');
  expect((await state(f)).text.key).toBe('lift.open');
  await J(f, 'next'); await J(f, 'step', 800);
  // the finale: three painted panels, then Mango on the pixel stage, the Cup raised, Cappy's thanks, the credits
  s = await state(f);
  expect([s.screen, s.panel, s.text.key]).toEqual(['finale', 'lift', 'end.1']);
  await J(f, 'next'); expect((await state(f)).panel).toBe('stage');
  await J(f, 'next'); expect((await state(f)).panel).toBe('cup');
  await J(f, 'next'); s = await state(f);
  expect([s.panel, s.text.key]).toEqual(['', 'end.4']);
  await J(f, 'next'); await J(f, 'step', 3000);
  s = await state(f);
  expect([s.cup, s.cos.bandana, s.cos.own.includes('gold'), s.text.key]).toEqual([true, 'gold', true, 'end.5']);
  expect((await f.evaluate(() => { window.__brbTest.jc.report(); return window.__go; })).at(-1)).toEqual({ won: true, score: s.stars && Object.values(s.stars).reduce((a, b) => a + b, 0) * 100 + SPORTS.length * 250 + 500 });
  await J(f, 'next'); await J(f, 'step', 800);
  expect((await state(f)).screen).toBe('credits');
  await J(f, 'step', 2000);
  await J(f, 'tap', 'done'); await J(f, 'step', 1400);
  s = await state(f);
  expect([s.screen, s.text && s.text.key]).toEqual(['world', 'd.mango.free']);
  expect(errors).toEqual([]);
});

test('Jungle Cup: Continue shows the panels once per launch; a first three-star round gives the berry bandana', async ({ page }) => {
  test.setTimeout(90_000);
  const { f, errors } = await open(page);
  await J(f, 'setSave', { pos: { x: 36, y: 40, d: 'up' } });
  await J(f, 'go', 'title'); await J(f, 'step', 100);
  await J(f, 'tap', 'continue');
  await expect.poll(async () => (await state(f)).screen).toBe('world');
  expect((await state(f)).panel).toBe('river');
  await J(f, 'manual', true);
  await J(f, 'press', 'b'); await J(f, 'release', 'b'); await J(f, 'step', 100);   // Esc / B skips them too
  let s = await state(f);
  expect([s.panel, s.text]).toEqual(['', null]);
  // back to the title and Continue again: no panels this time
  await J(f, 'go', 'title'); await J(f, 'step', 100);
  await J(f, 'tap', 'continue'); await J(f, 'step', 800);
  s = await state(f);
  expect([s.screen, s.text]).toEqual(['world', null]);
  // two stars give no bandana; the first three-star round (the vine bot climbs in about 30 s) gives the berry one
  s = await J(f, 'win', 'paddle');
  expect([s.sport.result.stars, s.cos.own.includes('berry')]).toEqual([2, false]);
  await J(f, 'play', 'vine'); await J(f, 'step', 3800); await J(f, 'sport', 'auto', true);
  for (let i = 0; i < 60; i++) { s = await J(f, 'step', 1000); if (s.sport.phase === 'results') break; }
  expect([s.sport.phase, s.sport.result.stars]).toEqual(['results', 3]);
  expect(s.cos.own).toContain('berry');
  expect(s.cos.bandana).not.toBe('berry');   // given, not forced on: Style picks what Cappy wears
  expect(errors).toEqual([]);
});

const SHOTS = process.env.JC_INTEGRATE_SHOTS || '';
test.describe('pictures', () => {
  test.skip(!SHOTS, 'set JC_INTEGRATE_SHOTS=<dir> to take the pictures');
  for (const size of [{ width: 390, height: 844 }, { width: 1366, height: 768 }]) for (const scheme of ['light', 'dark']) {
    test(`every screen at ${size.width} x ${size.height}, ${scheme}`, async ({ page }) => {
      test.setTimeout(240_000);
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.emulateMedia({ colorScheme: scheme });
      const { f, errors } = await open(page, size);
      const problems = [];
      const shot = async name => {
        const p = await frameProblems(f); if (p.length) problems.push([name, p]);
        expect(await pageScrollsSideways(page)).toBe(false);
        await page.screenshot({ path: path.join(SHOTS, `${size.width}x${size.height}-${scheme}-${name}.png`) });
      };
      await J(f, 'step', 600); await shot('01-title');
      await J(f, 'tap', 'play'); await expect.poll(async () => (await state(f)).screen).toBe('world');
      await J(f, 'manual', true); await J(f, 'step', 1500); await shot('02-intro-panel');
      await J(f, 'skipText');
      await J(f, 'go', 'village'); await J(f, 'step', 600); await shot('03-overworld');
      await J(f, 'win', 'paddle'); await J(f, 'win', 'vine'); await J(f, 'win', 'seed');
      await J(f, 'go', 'paddle'); await J(f, 'step', 300); await shot('04-arch');
      await f.evaluate(() => { window.JC.go('world', { at: [36, 40, 'up'], celebrate: 'frog' }, true); });
      await f.evaluate(() => { const s = window.JC.save.data; s.feathers.frog = true; });
      await J(f, 'step', 1200); await shot('05-totem');
      await J(f, 'go', 'map'); await J(f, 'step', 300); await shot('06-map');
      await J(f, 'go', 'settings'); await J(f, 'step', 200); await shot('07-settings');
      await J(f, 'go', 'style'); await J(f, 'step', 200); await shot('08-style');
      for (const id of SPORTS) {
        await J(f, 'play', id, { intro: true }); await J(f, 'step', 400);
        if (id === 'paddle' || id === 'frog') await shot(`10-${id}-intro`);
        await J(f, 'tap', 'go'); await J(f, 'step', 3800);
        await J(f, 'sport', 'auto', true); await J(f, 'step', 6000);
        await shot(`11-${id}-play`);
        await J(f, 'win', id); await J(f, 'step', 2500);
        await shot(`12-${id}-results`);
      }
      await J(f, 'go', 'finale'); await J(f, 'step', 1500); await shot('20-finale-lift');
      await J(f, 'next'); await J(f, 'step', 1500); await shot('21-finale-stage');
      await J(f, 'next'); await J(f, 'step', 1500); await shot('22-finale-cup');
      await J(f, 'next'); await J(f, 'next'); await J(f, 'step', 1500); await shot('23-finale-raised');
      await J(f, 'step', 1500); await J(f, 'next'); await J(f, 'step', 1200); await J(f, 'step', 6000); await shot('24-credits');
      fs.writeFileSync(path.join(SHOTS, `${size.width}x${size.height}-${scheme}-problems.json`), JSON.stringify(problems, null, 1));
      expect(problems).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
});
