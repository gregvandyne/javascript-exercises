// The 3D bridge (kit 1.1.0, pack bridge-3d) in a real browser: the /kit 3D scene (kit/demo/three.html) runs through
// the real frame wrapper and CSP with three.js from /vendor/three/, in Playful and Bold, on a desktop and a phone, with no
// errors or kit warnings: a real picture (not blank), the draw-call budget, the kit's title, HUD and quiz card over the
// WebGL canvas, Bold's UI, reduced motion, and a cast of rigs beside their 2D twins. KIT3D_SHOTS=<dir> saves the pictures.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });
const SHOTS = process.env.KIT3D_SHOTS;

async function scene(page, qs) {
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error' || /\[oomba\]/.test(m.text())) errors.push(m.text()); });
  await page.goto(`/kit?scene=three&${qs}`);
  await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/three')), { timeout: 15000 }).toBe(true);
  const f = page.frames().find(x => x.url().includes('/kit/frame/three'));
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  return { f, errors };
}
/** Distinct colours and brightness spread of a screenshot (a blank or failed WebGL picture has almost none). */
const stats = (page, buf) => page.evaluate(async b64 => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 16) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += y; s2 += y * y; n++; seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
  return { colours: seen.size, spread: Math.sqrt(s2 / n - (s / n) ** 2) };
}, buf.toString('base64'));

const CASES = [
  { name: 'playful-desktop-play', qs: 'th=castle&shot=play', vp: [960, 540], style: 'playful' },
  { name: 'playful-phone-ask', qs: 'th=beach&shot=ask', vp: [390, 844], style: 'playful', ask: true },
  { name: 'bold-desktop-play', qs: 'th=cyber&shot=play', vp: [960, 540], style: 'bold' },
  { name: 'bold-phone-ask', qs: 'th=haunted&style=bold&shot=ask', vp: [390, 844], style: 'bold', ask: true },
  { name: 'playful-desktop-cast', qs: 'th=meadow&view=cast', vp: [960, 540], style: 'playful', cast: true },
  { name: 'bold-desktop-cast', qs: 'th=stadium&style=bold&view=cast', vp: [960, 540], style: 'bold', cast: true },
];

for (const c of CASES) {
  test(`3D bridge: ${c.name}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const ctx = await browser.newContext({ viewport: { width: c.vp[0], height: c.vp[1] } }); const page = await ctx.newPage();
    await login(page, ADMIN.username, ADMIN.password);
    const { f, errors } = await scene(page, c.qs);
    const st = await f.evaluate(() => window.__brbTest.state());
    expect(st.style).toBe(c.style);
    expect(['low', 'mid', 'high']).toContain(st.tier);
    expect(st.pixelRatio).toBeLessThanOrEqual(1.5);
    if (!c.cast) {
      expect(st.calls, 'draw calls').toBeLessThanOrEqual(100);
      expect(st.triangles).toBeLessThan(150_000);
      expect(st.props).toBeGreaterThanOrEqual(4);
      await expect(f.locator('.ok-ui .ok-pill').first()).toBeVisible();   // the kit's HUD over the canvas
    }
    if (c.ask) await expect(f.locator('.ok-ask .ok-tiles button, .ok-tiles button').first()).toBeVisible({ timeout: 10000 });
    if (c.style === 'bold') expect(await f.evaluate(() => document.querySelector('.ok-ui').classList.contains('ok-bold'))).toBe(true);
    const buf = await page.locator('#kitframe').screenshot();
    const s = await stats(page, buf);
    expect(s.colours, `a real picture: ${JSON.stringify(s)}`).toBeGreaterThan(120);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); fs.writeFileSync(path.join(SHOTS, `${c.name}.png`), buf); }
    expect(errors).toEqual([]);
    await ctx.close();
  });
}

test('3D bridge: reduced motion is honoured, and the title screen sits over the 3D world', async ({ browser }) => {
  test.setTimeout(60_000);
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, reducedMotion: 'reduce' }); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  const { f, errors } = await scene(page, 'th=snow');
  const st = await f.evaluate(() => window.__brbTest.state());
  expect(st.reduced).toBe(true); expect(st.scene).toBe('title');
  await expect(f.locator('.ok-ui .ok-big').first()).toBeVisible();
  expect(await f.evaluate(() => document.querySelector('.ok-ui').classList.contains('ok-rm'))).toBe(true);
  expect(errors).toEqual([]);
  await ctx.close();
});

// Kit 1.1.2: walking a 3D map. Holding forward (W) into a wall and a crate never lifts the hero off the ground (W walks,
// it never jumps), Space jumps onto the crate and lands, the steps are walked up, the map's edge holds, on a desktop
// and on a phone (the touch stick walks, the jump button jumps).
test('3D bridge: the walker keeps the hero on the ground (walls, a crate, steps, the edge), jumps land, keys and touch', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const [vp, touch] of [[[1280, 800], false], [[844, 390], true]]) {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, hasTouch: touch, isMobile: touch }); const page = await ctx.newPage();
    await login(page, ADMIN.username, ADMIN.password);
    // the phone opens the scene's frame on its own, so the touch controls sit inside the phone's screen
    let f = page, errors = [];
    if (touch) { page.on('pageerror', e => errors.push(String(e.message || e))); await page.goto('/kit/frame/three?th=meadow&shot=play'); await page.waitForFunction(() => window.__brbTest && window.__brbTest.state().ready, null, { timeout: 30000 }); }
    else ({ f, errors } = await scene(page, 'th=meadow&shot=play'));
    await f.waitForFunction(() => window.__brbTest.state().scene === 'play');
    await f.evaluate(() => window.__brbTest.drive());
    const st = () => f.evaluate(() => window.__walker.state());
    const tp = async (x, z) => { await f.evaluate(([x, z]) => { window.__walker.teleport(x, z); }, [x, z]); await page.waitForTimeout(300); };
    const onGround = s => s.grounded && Math.abs(s.y - s.ground) < 0.03;
    const watch = async ms => { const out = []; for (let t = 0; t < ms; t += 100) { await page.waitForTimeout(100); out.push(await st()); } return out; };
    if (!touch) {
      await page.locator('#kitframe').click({ position: { x: 20, y: vp[1] / 2 } });
      await tp(-1, -6);
      await page.keyboard.down('KeyW'); let tr = await watch(2500); await page.keyboard.up('KeyW');
      expect(tr.every(onGround), 'holding W: on the ground the whole time, never a jump').toBe(true);
      expect((await st()).z).toBeGreaterThan(-10.5);   // stopped at the wall
      await tp(-3, 6.5); await page.keyboard.down('KeyW'); tr = await watch(1200);
      expect(tr.every(onGround) && (await st()).z > 4.2, 'the crate is a wall when walking').toBe(true);
      await page.keyboard.press('Space'); await page.waitForTimeout(380); await page.keyboard.up('KeyW'); await page.waitForTimeout(900);
      let s = await st(); expect(onGround(s) && s.y > s.terrain + 0.9, `jumped onto the crate (${JSON.stringify(s)})`).toBe(true);
      await tp(4, 3.6); await page.keyboard.down('KeyS'); tr = await watch(1400); await page.keyboard.up('KeyS');
      expect(tr.some(x => x.grounded && x.y > x.terrain + 0.7), 'walked up the steps').toBe(true);
      await tp(0, 0); await page.keyboard.down('KeyD'); tr = await watch(5000); await page.keyboard.up('KeyD');
      s = await st(); expect(Math.hypot(s.x, s.z)).toBeLessThanOrEqual(26 * 0.9 + 0.05);
      expect(tr.every(x => !x.grounded || Math.abs(x.y - x.ground) < 0.03), 'never floats on the slopes').toBe(true);
    } else {
      await page.touchscreen.tap(vp[0] / 2, vp[1] / 3); await page.waitForTimeout(300);
      await tp(-1, -6);
      const box = await f.locator('.ok-stick').boundingBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      const cdp = await ctx.newCDPSession(page);
      const touchAt = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await touchAt('touchStart', cx, cy); await touchAt('touchMove', cx, cy - 40);
      const tr = await watch(2000); await touchAt('touchEnd');
      expect(tr.every(onGround) && (await st()).z < -8, 'the stick walks forward on the ground to the wall').toBe(true);
      await tp(6, -3); const y0 = (await st()).y;
      const jb = await f.locator('.ok-jump').boundingBox(); await page.touchscreen.tap(jb.x + jb.width / 2, jb.y + jb.height / 2);
      let hi = y0; for (let i = 0; i < 12; i++) { await page.waitForTimeout(80); hi = Math.max(hi, (await st()).y); }
      expect(hi - y0, 'the jump button jumps').toBeGreaterThan(0.8); expect(onGround(await st()), 'and lands').toBe(true);
    }
    if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `walk-${touch ? 'phone' : 'desktop'}.png`) });
    expect(errors).toEqual([]);
    await ctx.close();
  }
});
