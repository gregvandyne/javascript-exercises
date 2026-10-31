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
