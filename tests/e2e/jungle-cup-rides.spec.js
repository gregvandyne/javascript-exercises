// Jungle Cup, the island's rides are easy to spot and to use: the zipline (a thick cable on posts, signs at both
// ends) and the vine swing (a big leafy vine over the ravine). Walking up with real joystick drags on a 390 x 844
// touch phone, a one-time hint names the ride, its big button ("Zip down!" / "Swing across!") pops up a few steps
// before the spot, a real tap on it rides across. Pictures of the approach and mid-ride go to JC_RIDE_SHOTS.
// Run alone: E2E_PORT=6011 npx playwright test tests/e2e/jungle-cup-rides.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');
const SHOTS = process.env.JC_RIDE_SHOTS || '';
const pt = (p, id) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });
test.use({ hasTouch: true, isMobile: true });

async function mapper(page, f) {
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr }; });
  return (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
}
/** A free tile n tiles away from (x, y), so Cappy has a few steps to walk up to the ride. */
async function startNear(f, x, y, n) {
  for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
    let ok = true; for (let k = 1; k <= n; k++) if (await J(f, 'solidAt', x + dx * k, y + dy * k)) { ok = false; break; }
    if (ok) return [x + dx * n, y + dy * n];
  }
  return [x, y + 1];
}

for (const kind of ['zip', 'swing']) {
  test(`Jungle Cup: the ${kind === 'zip' ? 'zipline' : 'vine swing'} is easy to spot, names itself once, and its big button rides it`, async ({ page }) => {
    test.setTimeout(240_000);
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.setViewportSize({ width: 390, height: 844 });
    await ownIp(page);
    await page.goto('/play/jungle-cup');
    const f = await gameFrame(page);
    await f.waitForFunction(() => window.__brbTest?.jc?.state().screen === 'title', null, { timeout: 30000 });
    await J(f, 'manual', true);
    await J(f, 'setSave', { plays: { paddle: 1 } });
    const r = (await J(f, 'routes')).routes, spot = r[kind].a;
    const from = await startNear(f, spot[0], spot[1], 4);
    await J(f, 'go', [from[0], from[1], 'up']);
    await J(f, 'step', 300); await J(f, 'skipText');
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    let s = await state(f);
    const start = toPage(s.view.W * 0.25, s.view.H * 0.72);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(start, 1)] });
    await J(f, 'step', 60);
    const R = (await state(f)).stick.R || 40;
    // walk up with the stick until the ride's button shows; it must show a few steps before the spot
    let appearedAt = -1;
    for (let n = 0; n < 120; n++) {
      s = await state(f);
      if (s.trav === kind) { appearedAt = Math.hypot(spot[0] * 16 + 8 - (s.pos.px + 8), spot[1] * 16 + 8 - (s.pos.py + 12)); break; }
      const vx = spot[0] * 16 + 8 - (s.pos.px + 8), vy = spot[1] * 16 + 8 - (s.pos.py + 12), L = Math.max(1, Math.hypot(vx, vy));
      const th = toPage(s.view.W * 0.25 + vx / L * R * 0.9, s.view.H * 0.72 + vy / L * R * 0.9);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(th, 1)] });
      await J(f, 'step', 40);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await J(f, 'step', 80);
    expect(appearedAt, 'the ride button pops up a few steps before the spot').toBeGreaterThan(26);
    expect((await J(f, 'save')).flags['hint_' + kind], 'the one-time hint named the ride').toBe(1);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${kind}-approach-390x844.png`) }); }
    // a real tap on the big button
    const b = (await J(f, 'buttons')).find(x => x.id === 'trav');
    expect(b, 'the big ride button').toBeTruthy();
    const fb = await (await f.frameElement()).boundingBox(), c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const tp = { x: fb.x + c.x + b.x + b.w / 2, y: fb.y + c.y + b.y + b.h / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(tp, 3)] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await J(f, 'step', kind === 'zip' ? 900 : 500);
    expect((await state(f)).ride).toBe(kind);
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${kind}-mid-390x844.png`) });
    for (let i = 0; i < 60 && (await state(f)).ride; i++) await J(f, 'step', 100);
    s = await state(f);
    expect([s.pos.x, s.pos.y]).toEqual(r[kind].b);
    expect(errors).toEqual([]);
  });
}
