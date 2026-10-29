// 3D step 1 end to end: start a game from Star Island in the Studio (mock Builder, no network), it draws real 3D
// pixels in the frame under the real frame CSP, the Builder changes it offline, a cover picture is made (when
// screenshots are on, as in the full run), and the friendly device message shows when import maps are missing.
import { test, expect } from '@playwright/test';
import { signup, uniq, templateGame, studioState, gameFrame } from './helpers.js';

/** How varied a picture is: distinct colours and the spread of brightness (blank or one colour ~ 0). */
async function pixelStats(page, buf, type = 'png') {
  const p2 = await page.context().newPage();
  try {
    return await p2.evaluate(async ([b64, mime]) => {
      const img = new Image(); img.src = `data:${mime};base64,${b64}`; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let sum = 0, sum2 = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; sum += y; sum2 += y * y; n++; seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
      return { colours: seen.size, spread: Math.sqrt(sum2 / n - (sum / n) ** 2), w: img.width, h: img.height };
    }, [buf.toString('base64'), `image/${type}`]);
  } finally { await p2.close(); }
}
const state = frame => frame.evaluate(() => (window.__brbTest ? window.__brbTest.state() : null)).catch(() => null);

test('Star Island: start from the template, real 3D under the frame CSP, offline Builder edits, a cover picture', async ({ page }) => {
  test.setTimeout(180_000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  const csp = [];
  page.on('response', r => { if (r.url().includes('/frame/')) csp.push(r.headers()['content-security-policy'] || ''); });
  await signup(page, uniq('Tri'));
  await page.goto('/build');
  await expect(page.locator('.tplcard[data-template="island"]')).toContainText('Star Island');
  const { id } = await templateGame(page, { template: 'island' });
  const v1 = (await studioState(page, id)).current;
  expect(v1.safety).toBe('pass');

  // The preview frame: the real CSP names only the site's /vendor/three/ path, and the island draws.
  let frame = await gameFrame(page);
  await expect.poll(async () => (await state(frame) || {}).ready, { timeout: 30_000 }).toBe(true);
  expect(csp.at(-1)).toMatch(/script-src 'unsafe-inline' https:\/\/cdnjs\.cloudflare\.com http:\/\/localhost:\d+\/vendor\/three\/ http:\/\/localhost:\d+\/vendor\/oomba-kit\/;/);
  expect(csp.at(-1)).toMatch(/connect-src 'none'/);
  await frame.evaluate(() => window.__brbTest.start());
  await expect.poll(async () => (await state(frame) || {}).screen).toBe('play');
  await page.waitForTimeout(1200);
  const st = await state(frame);
  expect(st.total).toBe(12); expect(st.pixelRatio).toBeLessThanOrEqual(1.5);
  const shot = await pixelStats(page, await page.locator('#st-frame').screenshot());
  expect(shot.colours, JSON.stringify(shot)).toBeGreaterThan(150);
  expect(shot.spread, JSON.stringify(shot)).toBeGreaterThan(15);
  expect(await frame.evaluate(() => !!document.getElementById('brb-device'))).toBe(false);

  // The mock Builder changes the 3D game offline: more stars and a night sky, a new safe version.
  await page.fill('#st-input', 'more stars and make it night'); await page.press('#st-input', 'Enter');
  await expect(page.locator('#st-log .ev.version').last()).toContainText('Version 2 is ready', { timeout: 30_000 });
  const v2 = (await studioState(page, id)).current;
  expect(v2.number).toBe(2); expect(v2.safety).toBe('pass');
  await expect.poll(async () => { frame = page.frames().find(f => f.url().includes('/frame/')); const s = frame && await state(frame); return s && s.ready && s.total; }, { timeout: 30_000 }).toBe(16);
  expect(errors).toEqual([]);

  // The cover picture of version 1, taken in the background by the screenshot service (same wrapper, vendor files from disk).
  test.skip(process.env.BRB_SNAPSHOTS !== '1', 'screenshots are off in this run (BRB_SNAPSHOTS=1 turns them on)');
  await expect.poll(async () => (await page.request.get(`/shots/${v1.id}.jpg`)).status(), { timeout: 120_000, intervals: [2000] }).toBe(200);
  const jpg = await (await page.request.get(`/shots/${v1.id}.jpg`)).body();
  const cover = await pixelStats(page, jpg, 'jpeg');
  expect(cover.colours, JSON.stringify(cover)).toBeGreaterThan(150);
  expect(cover.spread, JSON.stringify(cover)).toBeGreaterThan(15);
});

test('a browser without import maps gets the friendly device message instead of a blank 3D game', async ({ page }) => {
  test.setTimeout(90_000);
  await signup(page, uniq('Old'));
  // Pretend to be an older iPad: no import maps. (Init scripts run in every frame, the sandboxed game frame too.)
  await page.context().addInitScript(() => {
    const orig = HTMLScriptElement.supports;
    HTMLScriptElement.supports = t => (t === 'importmap' ? false : orig ? orig.call(HTMLScriptElement, t) : false);
  });
  await templateGame(page, { template: 'island' });
  const frame = await gameFrame(page);
  const box = frame.locator('#brb-device');
  await expect(box).toBeVisible({ timeout: 15_000 });
  await expect(box).toHaveAttribute('role', 'alert');
  await expect(box).toContainText('This game needs a newer device or browser');
  await expect(box).toContainText('update the browser');
  // A 2D game in the same browser is not affected.
  await templateGame(page, { template: 'catch' });
  const f2 = await gameFrame(page);
  await f2.waitForFunction(() => document.readyState === 'complete');
  expect(await f2.evaluate(() => !!document.getElementById('brb-device'))).toBe(false);
});

/** A real tap on an element inside a game frame. The Studio preview is scaled down, which throws off locator clicks
 *  there, so the point is mapped by hand; a real tap also counts as the player's (user activation). */
async function tapInFrame(page, frame, frameSel, sel) {
  const r = await frame.evaluate(s => { const b = document.querySelector(s).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: innerWidth }; }, sel);
  const box = await page.locator(frameSel).boundingBox(); const k = box.width / r.w;
  await page.mouse.click(box.x + r.x * k, box.y + r.y * k);
}

test('a lost 3D picture: "Try again" has the page reload the game, in the Studio and on the play page', async ({ page }) => {
  test.setTimeout(150_000);
  const frames = [];
  page.on('response', r => { if (r.url().includes('/frame/')) frames.push(r.status()); });
  await signup(page, uniq('Tri'));
  const { slug } = await templateGame(page, { template: 'island' });
  const current = () => page.frames().find(f => f.url().includes('/frame/'));
  const backAndReady = () => expect.poll(async () => { const f = current(); return !!f && f.evaluate(() => !document.getElementById('brb-device') && !!(window.__brbTest && window.__brbTest.state().ready)).catch(() => false); }, { timeout: 30_000 }).toBe(true);
  const loseAndRetry = async frameSel => {
    await backAndReady();
    const f = current();
    // The island asks for its picture back (preventDefault), but a forced loss never returns: the SDK shows its card.
    await f.evaluate(() => document.querySelector('canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
    await expect(f.locator('#brb-device')).toBeVisible({ timeout: 15_000 });
    frames.length = 0;
    await tapInFrame(page, f, frameSel, '#brb-device button');
    // The page reloads it (with the sign-in cookie): a fresh 200, never the 403 a reload from inside the frame gets.
    await expect.poll(() => frames.includes(200), { timeout: 15_000 }).toBe(true);
    await backAndReady();
    expect(frames).not.toContain(403);
  };
  await loseAndRetry('#st-frame');   // templateGame leaves us in the Studio
  await page.goto(`/play/${slug}`);
  await loseAndRetry('#gameframe');
});
