// Atlas Quest (Live): tapping the map picks exactly the country under the finger, on phones and tablets, with real
// touch events at a real devicePixelRatio. The page is the game itself (alone it plays a practice round), served with
// the pinned kit from public/ (no server state needed).
//   - ~100 random points well inside countries' drawn shapes: a tap there picks that country (the same shapes are drawn
//     and hit-tested, and the tap position matches the drawing at DPR 2-3, portrait, landscape, tablet);
//   - tiny countries (Luxembourg, Singapore, Caribbean islands) are picked on their dot;
//   - a tap just off a coast (in the sea, within the touch radius) still picks the nearest country;
//   - a finger that wobbles a few px is still a tap (not a pan), and a real drag pans without picking.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public');
const PAGE = fs.readFileSync('seed-games/atlas-quest-live.html', 'utf8');
const SHOTS = process.env.SHOTS || '';

async function open(page) {
  await page.route('http://atlas.test/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ body: PAGE, contentType: 'text/html' });
    const f = path.join(ROOT, u.pathname);
    if (f.startsWith(ROOT) && fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: f.endsWith('.js') ? 'text/javascript' : undefined });
    return r.fulfill({ status: 404 });
  });
  await page.goto('http://atlas.test/');
  await expect.poll(() => page.evaluate(() => !!(window.__brbTest && window.__brbTest.practice))).toBe(true);
  await page.evaluate(() => window.__brbTest.practice());
  await expect.poll(() => page.evaluate(() => !!window.__brbTest.state().question), { timeout: 8000 }).toBe(true);
}
const picked = page => page.evaluate(() => window.__brbTest.state().picked);

const SIZES = [
  { name: 'phone-portrait', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  { name: 'phone-landscape', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 },
  { name: 'tablet', viewport: { width: 820, height: 1180 }, deviceScaleFactor: 2 },
];

for (const sz of SIZES) {
  test.describe(sz.name, () => {
    test.use({ viewport: sz.viewport, deviceScaleFactor: sz.deviceScaleFactor, hasTouch: true, isMobile: true });

    test('a tap inside a country picks that country (100 random points)', async ({ page }) => {
      await open(page);
      // a closer view too: Europe, where countries are small and close together
      for (const [where, box] of [['world', null], ['europe', [-12, 35, 32, 62]]]) {
        if (box) await page.evaluate(b => window.__brbTest.fitTo(b), box);
        await page.waitForTimeout(100);
        const pts = await page.evaluate(n => window.__brbTest.samples(n, 11), where === 'world' ? 60 : 40);
        expect(pts.length, `${where}: enough sample points`).toBeGreaterThan(where === 'world' ? 40 : 25);
        const misses = [];
        let prev = null;
        for (const p of pts) {
          const c = await page.evaluate(q => window.__brbTest.clientOf(q.lat, q.lng), p);
          if (prev && Math.hypot(prev.x - c.x, prev.y - c.y) < 40) await page.waitForTimeout(400);   // not a double tap
          await page.touchscreen.tap(c.x, c.y);
          const got = await picked(page);
          if (got !== p.cc) misses.push(`${p.cc} at ${p.lat.toFixed(2)},${p.lng.toFixed(2)} -> ${got}`);
          prev = c;
        }
        expect(misses, `${where}: every tap picks the country under the finger`).toEqual([]);
      }
    });

    test('tiny countries, a tap just off a coast, a wobbly tap, a drag', async ({ page }) => {
      await open(page);
      // tiny countries on their dots (zoomed to their part of the world)
      for (const [cc, box] of [['LU', [-5, 44, 16, 56]], ['SG', [95, -8, 115, 10]], ['GD', [-70, 8, -55, 20]], ['BB', [-70, 8, -55, 20]]]) {
        await page.evaluate(b => window.__brbTest.fitTo(b), box);
        await page.waitForTimeout(450);
        const c = await page.evaluate(code => window.__brbTest.centreOf(code), cc);
        await page.touchscreen.tap(c.x, c.y);
        expect(await picked(page), `tap on ${cc}`).toBe(cc);
      }
      // the sea just east of Madagascar's coast, 10 px out: still Madagascar
      await page.evaluate(() => window.__brbTest.fitTo([30, -30, 65, -8]));
      await page.waitForTimeout(450);
      const off = await page.evaluate(() => window.__brbTest.offCoast('MG', 10));
      expect(off, 'found a sea point off the coast').toBeTruthy();
      await page.touchscreen.tap(off.x, off.y);
      expect(await picked(page)).toBe('MG');
      // a finger that wobbles 6 px is still a tap on the country (and the map does not move)
      await page.evaluate(() => window.__brbTest.fitTo([-12, 35, 32, 62]));
      await page.waitForTimeout(450);
      const fr = await page.evaluate(() => window.__brbTest.centreOf('FR'));
      const before = await page.evaluate(() => window.__brbTest.state().view);
      const cdp = await page.context().newCDPSession(page);
      const tp = (x, y) => [{ x, y, id: 1, radiusX: 8, radiusY: 8, force: 1 }];
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(fr.x, fr.y) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(fr.x + 4, fr.y + 3) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(fr.x + 6, fr.y - 2) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(50);
      expect(await picked(page)).toBe('FR');
      expect(await page.evaluate(() => window.__brbTest.state().view)).toEqual(before);
      // a real drag pans and does not pick
      await page.waitForTimeout(400);
      const de = await page.evaluate(() => window.__brbTest.centreOf('DE'));
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(de.x, de.y) });
      for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(de.x + k * 15, de.y) });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.waitForTimeout(50);
      expect(await picked(page), 'a drag keeps the pick').toBe('FR');
      expect((await page.evaluate(() => window.__brbTest.state().view)).cx).not.toBe(before.cx);
      if (SHOTS && sz.name === 'phone-portrait') {
        // a small country picked, then locked in (its flag and name in the bar), then the reveal (the flag fill)
        await page.evaluate(() => window.__brbTest.fitTo([-5, 44, 16, 56]));
        await page.waitForTimeout(450);
        const lu = await page.evaluate(() => window.__brbTest.centreOf('LU'));
        await page.touchscreen.tap(lu.x, lu.y);
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOTS}/atlas-live2-phone-picked.png` });
        await page.evaluate(() => window.__brbTest.lock());
        await page.waitForTimeout(150);
        await page.screenshot({ path: `${SHOTS}/atlas-live2-phone-locked.png` });
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOTS}/atlas-live2-phone-reveal.png` });
      }
    });
  });
}
