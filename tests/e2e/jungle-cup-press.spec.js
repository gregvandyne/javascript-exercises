// Jungle Cup's buttons take ANY press, the way kids press: a long press-and-hold and a press whose finger drifts a
// little both work on the FIRST press (as long as the finger lifts off on the same button), a quick tap still works
// exactly once, and a finger that slides off the button cancels it. Real touch only (CDP touch events), plus the map
// with eight sports on a small 360 x 640 phone in long-word languages (the names are never squashed).
// Run alone: E2E_PORT=5701 npx playwright test tests/e2e/jungle-cup-press.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const SHOTS = process.env.JC_PRESS_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');

async function open(page, size, lang) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup' + (lang ? `?lang=${lang}` : ''));
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  await page.waitForTimeout(400);
  return { f, errors };
}
/** A button's centre in page CSS pixels. */
async function centreOf(page, f, id) {
  const fb = await (await f.frameElement()).boundingBox();
  const r = await f.evaluate(() => { const c = document.getElementById('jc').getBoundingClientRect(); return { x: c.left, y: c.top }; });
  const b = (await J(f, 'buttons')).find(x => x.id === id);
  expect(b, `button ${id} on screen`).toBeTruthy();
  return { x: fb.x + r.x + b.x + b.w / 2, y: fb.y + r.y + b.y + b.h / 2, w: b.w, h: b.h };
}
const pt = p => ({ x: p.x, y: p.y, id: 1, radiusX: 6, radiusY: 6, force: 1 });
/** Press with a real finger: down, (drift), hold, lift. */
async function press(page, cdp, p, { holdMs = 60, drift = 0 } = {}) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(p)] });
  if (drift) {
    for (let i = 1; i <= 4; i++) { await page.waitForTimeout(40); await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt({ x: p.x + drift * i / 4, y: p.y + drift * 0.3 * i / 4 })] }); }
  }
  await page.waitForTimeout(holdMs);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });

  for (const kind of [{ name: 'a 1.2 s press-and-hold', holdMs: 1200 }, { name: 'a press that drifts 16 px', holdMs: 120, drift: 16 }, { name: 'a quick tap', holdMs: 50 }]) {
    test(`title Play starts the game on the first press: ${kind.name}`, async ({ page }) => {
      test.setTimeout(60_000);
      const { f, errors } = await open(page, { width: 390, height: 844 });
      const cdp = await page.context().newCDPSession(page);
      const ids = (await J(f, 'buttons')).map(b => b.id);
      const id = ids.includes('play') ? 'play' : 'continue';
      const p = await centreOf(page, f, id);
      await press(page, cdp, p, kind);
      await expect.poll(async () => (await state(f)).screen, { timeout: 5000 }).not.toBe('title');
      expect(errors).toEqual([]);
    });
  }

  test('a finger that slides off the button cancels the press', async ({ page }) => {
    test.setTimeout(60_000);
    const { f } = await open(page, { width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    const ids = (await J(f, 'buttons')).map(b => b.id);
    const p = await centreOf(page, f, ids.includes('play') ? 'play' : 'continue');
    await press(page, cdp, p, { holdMs: 200, drift: p.w });   // well past the button's edge
    await page.waitForTimeout(500);
    expect((await state(f)).screen).toBe('title');
  });

  test('results card: Try again takes a long press and a drifting press on the first go; Back with a quick tap leaves once', async ({ page }) => {
    test.setTimeout(90_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    const cdp = await page.context().newCDPSession(page);
    await J(f, 'tap', 'play');
    await expect.poll(async () => (await state(f)).screen).toBe('world');
    await J(f, 'skipText');
    const toResults = async () => {
      await J(f, 'play', 'kick'); await J(f, 'step', 300);
      await J(f, 'lose', 'kick'); await J(f, 'step', 2500); await page.waitForTimeout(300);
      await expect.poll(async () => (await J(f, 'buttons')).some(b => b.id === 'retry')).toBe(true);
    };
    for (const kind of [{ holdMs: 1200 }, { holdMs: 120, drift: 16 }]) {
      await toResults();
      const p = await centreOf(page, f, 'retry');
      await press(page, cdp, p, kind);
      await expect.poll(async () => (await J(f, 'buttons')).some(b => b.id === 'retry'), { timeout: 5000 }).toBe(false);
      expect((await state(f)).screen).toBe('sport');
    }
    await toResults();
    const p = await centreOf(page, f, 'back');
    await press(page, cdp, p, { holdMs: 50 });
    await expect.poll(async () => (await state(f)).screen, { timeout: 5000 }).toBe('world');
    await page.waitForTimeout(600);
    expect((await state(f)).screen).toBe('world');      // left once: not straight back into the sport
    expect(errors).toEqual([]);
  });
});

test.describe('map names on small phones', () => {
  test.use({ hasTouch: true, isMobile: true });
  const ALL = ['en', 'en-GB', 'ar', 'he', 'de', 'es', 'fr', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant'];
  const CASES = ALL.map(lang => [lang, { width: 360, height: 640 }]).concat(['de', 'fr', 'nl', 'pt', 'en'].map(lang => [lang, { width: 390, height: 844 }]));
  for (const [lang, size] of CASES) {
    {
      test(`map at ${size.width}x${size.height} in ${lang}: eight readable rows`, async ({ page }) => {
        test.setTimeout(60_000);
        const { f, errors } = await open(page, size, lang);
        await J(f, 'tap', 'play');
        await expect.poll(async () => (await state(f)).screen).toBe('world');
        await J(f, 'skipText');
        const cdp = await page.context().newCDPSession(page);
        await press(page, cdp, await centreOf(page, f, 'map'), { holdMs: 60 });
        await expect.poll(async () => (await state(f)).screen).toBe('map');
        await page.waitForTimeout(300);
        if (SHOTS && ['de', 'fr', 'nl', 'pt', 'en'].includes(lang)) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `map-${lang}-${size.width}x${size.height}.png`) }); }
        const rows = (await J(f, 'buttons')).filter(b => b.id.startsWith('go:'));
        expect(rows.length).toBe(8);
        // finger-sized rows, and every name whole (beside its stars, or on a line of its own): never squashed
        for (const r of rows) expect(r.h).toBeGreaterThanOrEqual(24);
        const lay = await J(f, 'mapLayout');
        expect(lay.squeezed, JSON.stringify(lay)).toBe(false);
        expect(errors).toEqual([]);
      });
    }
  }
});
