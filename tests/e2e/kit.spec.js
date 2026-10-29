// Oomba Kit smoke test in a real browser: the core scene through the real frame wrapper (sandbox + frame CSP) on both
// backends, backend detection under SwiftShader, a WebGL context loss mid-play, day/night, juice, RTL, touch controls,
// a gamepad, reduced motion, and DOM buttons at least 48 px.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { login, ADMIN } from './helpers.js';

// WebGL in headless Chromium runs on SwiftShader: allowed here so Glaze can be forced and tested.
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

let auth = null;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  auth = await ctx.storageState(); await ctx.close();
});

/** Open /kit with options; returns { page, frame, errors, csp() }. */
async function openKit(browser, query, ctxOpts = {}) {
  const ctx = await browser.newContext({ storageState: auth, ...ctxOpts });
  if (ctxOpts.gamepad) await ctx.addInitScript(() => {
    const btn = i => ({ pressed: i === 0 && window.__padA === true, value: i === 0 && window.__padA ? 1 : 0, touched: false });
    navigator.getGamepads = () => [{ connected: true, mapping: 'standard', index: 0, id: 'stub', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => btn(i)), timestamp: 0 }];
  });
  // Every frame records CSP violations (init scripts run in the sandboxed frame too).
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/kit?' + new URLSearchParams({ scene: 'core', ...query }));   // the engine smoke scene (the default /kit scene is the Meadow demo)
  await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/')), { timeout: 15000 }).toBe(true);
  const frame = page.frames().find(f => f.url().includes('/kit/frame/'));
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.frameStats && window.__brbTest.frameStats().p50 > 0, null, { timeout: 20000 });
  return { ctx, page, frame, errors, csp: () => frame.evaluate(() => window.__csp) };
}
const state = f => f.evaluate(() => window.__brbTest.state());
const stats = f => f.evaluate(() => window.__brbTest.frameStats());
/** Distinct colours and brightness spread of the game frame on screen (blank or flat ~ 0). */
async function pixels(page) {
  const buf = await page.locator('#kitframe').screenshot();
  return page.evaluate(async b64 => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); let s = 0, s2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 16) { const y = 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; s += y; s2 += y * y; n++; seen.add((d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | (d[i + 2] >> 3)); }
    return { colours: seen.size, spread: Math.sqrt(s2 / n - (s / n) ** 2), mean: s / n };
  }, buf.toString('base64'));
}

for (const backend of ['paper', 'glaze']) {
  test(`${backend}: the core scene draws under the real frame CSP with no errors, day and night`, async ({ browser }) => {
    test.setTimeout(90_000);
    const k = await openKit(browser, { backend });
    expect(await k.frame.evaluate(() => typeof window.Oomba === 'object' && window.Oomba.version)).toBe('1.0.0');
    const st = await state(k.frame);
    expect(st.backend).toBe(backend); expect(st.tier).toBe(backend === 'paper' ? 'low' : 'mid');
    const day = await pixels(k.page);
    expect(day.colours, JSON.stringify(day)).toBeGreaterThan(120); expect(day.spread).toBeGreaterThan(12);
    // night: darker, still full of colour (lanterns, stars, fireflies)
    await k.frame.evaluate(() => window.__brbTest.night(true));
    await k.page.waitForTimeout(600);
    const night = await pixels(k.page);
    expect(night.mean).toBeLessThan(day.mean - 40); expect(night.colours).toBeGreaterThan(120);
    // fireflies: a few (never a snowstorm), and never more than 20 on screen
    await k.page.waitForTimeout(1500);
    const ff = (await stats(k.frame)).fireflies; expect(ff, 'fireflies').toBeGreaterThan(0); expect(ff).toBeLessThanOrEqual(20);
    // juice: celebrate (confetti, sparkle, flash, punch), collect (+1, sparkle), hurt (hit-stop, shake), wipe
    await k.frame.evaluate(async () => { const T = window.__brbTest; T.celebrate(); T.collect(1); T.hurt(); await T.wipe(); });
    await k.page.waitForTimeout(300);
    expect((await k.frame.evaluate(() => window.__brbTest.scene())).streak).toBe(1);
    // the font arrived from the kit's own folder (font-src) and the kit's DOM is in place
    expect(await k.frame.evaluate(async () => { await window.Oomba.fonts.ready; return document.fonts.check('800 20px "Bricolage Grotesque"'); })).toBe(true);
    expect(await k.frame.locator('.ok-ui button').count()).toBeGreaterThanOrEqual(4);
    expect(await k.csp()).toEqual([]);
    expect(k.errors).toEqual([]);
    await k.ctx.close();
  });
}

test('detection: under SwiftShader (software WebGL) the kit picks Paper by itself', async ({ browser }) => {
  const k = await openKit(browser, { backend: 'auto' });
  const st = await state(k.frame);
  expect(st.backend).toBe('paper'); expect(st.tier).toBe('low');
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('a lost WebGL context switches to Paper in the same frame and play goes on', async ({ browser }) => {
  test.setTimeout(60_000);
  const k = await openKit(browser, { backend: 'glaze' });
  expect((await state(k.frame)).backend).toBe('glaze');
  await k.frame.evaluate(() => document.querySelector('.ok-stage canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext());
  await expect.poll(async () => (await state(k.frame)).backend).toBe('paper');
  const before = (await k.frame.evaluate(() => window.__brbTest.scene())).streak;
  await k.frame.evaluate(() => window.__brbTest.collect(0));
  await k.page.waitForTimeout(400);
  expect((await k.frame.evaluate(() => window.__brbTest.scene())).streak).toBe(before + 1);
  const px = await pixels(k.page); expect(px.colours).toBeGreaterThan(120);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('RTL, reduced motion, touch controls, a gamepad, and 48 px buttons at phone size', async ({ browser }) => {
  test.setTimeout(60_000);
  const k = await openKit(browser, { backend: 'paper', mode: 'dark', l: 'ar' }, { viewport: { width: 360, height: 640 }, hasTouch: true, reducedMotion: 'reduce', gamepad: true });
  const f = k.frame;
  expect(await f.locator('.ok-ui').getAttribute('dir')).toBe('rtl'); expect(await f.locator('.ok-ui').getAttribute('lang')).toBe('ar');
  const st = await state(f); expect(st.reduced).toBe(true); expect(st.theme).toBe('dark'); expect(st.dir).toBe('rtl');
  expect(await f.locator('.ok-ui button').first().textContent()).toBe('العب');
  // reduced motion: no shake and no screen flash
  await f.evaluate(() => { window.__brbTest.hurt(); window.__brbTest.celebrate(); });
  const k2 = await f.evaluate(() => { const s = window.Oomba.debug.kit.stage; return { trauma: s.camera.trauma, sx: s.camera.sx, flash: s.F.flash }; });
  expect(k2).toEqual({ trauma: 0, sx: 0, flash: 0 });
  // touch controls appear after the first touch
  expect(await f.locator('.ok-touch').count()).toBe(0);
  await k.page.touchscreen.tap(180, 400);
  await expect(f.locator('.ok-touch .ok-jump')).toBeVisible();
  // a gamepad's A button is the jump action
  await f.evaluate(() => { window.__padA = true; window.__brbTest.step(1); });
  expect(await f.evaluate(() => window.Oomba.input.down('jump'))).toBe(true);
  await f.evaluate(() => { window.__padA = false; window.__brbTest.step(1); });
  expect(await f.evaluate(() => window.Oomba.input.down('jump'))).toBe(false);
  // DOM buttons are at least 48 px tall; nothing overflows the 360 px screen
  const sizes = await f.$$eval('.ok-ui button', bs => bs.map(b => b.getBoundingClientRect().height));
  for (const h of sizes) expect(h).toBeGreaterThanOrEqual(48);
  expect(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('resizing the window 30 times never adds atlas pages or GPU textures (bands re-bake in place)', async ({ browser }) => {
  test.setTimeout(120_000);
  for (const backend of ['paper', 'glaze']) {
    const k = await openKit(browser, { backend });
    await k.page.waitForTimeout(500);
    const s0 = await stats(k.frame);
    for (let i = 0; i < 30; i++) { await k.page.setViewportSize({ width: 880 + (i % 8) * 50, height: 620 + (i % 5) * 20 }); await k.page.waitForTimeout(i % 6 === 5 ? 260 : 40); }
    await k.page.setViewportSize({ width: 1280, height: 720 }); await k.page.waitForTimeout(600);
    const s1 = await stats(k.frame);
    expect(s1.pageSlots, `${backend}: page slots`).toBeLessThanOrEqual(s0.pageSlots + 1);
    expect(s1.pages, `${backend}: live pages`).toBeLessThanOrEqual(s0.pages + 1);
    if (backend === 'glaze') expect(s1.textures).toBeLessThanOrEqual(s0.textures + 2);
    expect(k.errors).toEqual([]);
    await k.ctx.close();
  }
});

test('switching away from Glaze releases its WebGL context (no pile of live contexts)', async ({ browser }) => {
  test.setTimeout(60_000);
  const k = await openKit(browser, { backend: 'glaze' });
  const lost = await k.frame.evaluate(async () => {
    const out = []; const T = window.__brbTest;
    for (let i = 0; i < 6; i++) {
      const c = document.querySelector('.ok-stage canvas'); const gl = c.getContext('webgl2');
      T.setTier('low'); await new Promise(r => requestAnimationFrame(r));
      out.push(!!(gl && gl.isContextLost()));
      T.setBackend('glaze'); T.setTier('mid'); await new Promise(r => requestAnimationFrame(r));
    }
    return out;
  });
  expect(lost).toEqual([true, true, true, true, true, true]);
  expect(k.errors.filter(e => /Too many active WebGL contexts/.test(e))).toEqual([]);
  await k.ctx.close();
});

test('captions: key sounds write to the caption strip when captions are on (throttled), plain sounds do not', async ({ browser }) => {
  const k = await openKit(browser, { backend: 'paper' });
  const f = k.frame;
  await f.evaluate(() => { window.Oomba.settings.captions = true; window.Oomba.sfx('select'); });
  expect(await f.locator('.ok-caption').textContent()).toBe('');
  await f.evaluate(() => window.Oomba.sfx('correct'));
  await expect(f.locator('.ok-caption.on')).toHaveText('[ding]');
  await f.evaluate(() => window.Oomba.sfx('hurt'));
  await expect(f.locator('.ok-caption.on')).toHaveText('[ouch]');
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});
