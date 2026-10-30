// "Oomba Meadow", the kit's approval demo (kit/demo/meadow.html), played through the real frame (sandbox + frame CSP):
// title -> make your hero -> how-to -> countdown -> run and jump -> the fox's quiz gate -> nightfall -> the flag ->
// results. It is a dev-only scene: admins (or KIT_PREVIEW=1) see it at /kit; nobody else does, and it is not a game.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { login, ADMIN } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

let auth = null;
test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext(); const page = await ctx.newPage();
  await login(page, ADMIN.username, ADMIN.password);
  auth = await ctx.storageState(); await ctx.close();
});

async function openMeadow(browser, query = {}, ctxOpts = {}) {
  const ctx = await browser.newContext({ storageState: auth, ...ctxOpts });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/kit?' + new URLSearchParams({ backend: 'paper', ...query }));
  await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/meadow')), { timeout: 15000 }).toBe(true);
  const frame = page.frames().find(f => f.url().includes('/kit/frame/meadow'));
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.meadow && window.__brbTest.meadow().scene === 'title', null, { timeout: 20000 });
  return { ctx, page, frame, errors, csp: () => frame.evaluate(() => window.__csp) };
}
const M = f => f.evaluate(() => window.__brbTest.meadow());
const hold = (f, action, ms) => f.evaluate(([a, t]) => window.__brbTest.hold(a, t), [action, ms]);

test('the meadow plays end to end: title, hero, how-to, run, jump, quiz gate, nightfall, flag and results', async ({ browser }) => {
  test.setTimeout(180_000);
  const k = await openMeadow(browser);
  const f = k.frame;
  // title: the world stays alive behind it (the camera pans: checked over fixed steps, not real time), Play is focused
  await expect(f.locator('.ok-title-screen .ok-h1')).toHaveText('Oomba Meadow');
  expect(await f.evaluate(() => window.Oomba.time.paused)).toBe(false);
  const pan = await f.evaluate(() => { const c = window.Oomba.debug.kit.stage.camera, x0 = c.x; window.__brbTest.step(600); return c.x - x0; });
  expect(Math.abs(pan)).toBeGreaterThan(1);
  await f.locator('.ok-title-screen .ok-hot').click();
  // make your hero: 4 tabs, picking an option re-bakes the kid (a new entity) and marks the choice
  await expect(f.locator('.mh')).toBeVisible();
  await expect(f.locator('.mh-tabs button')).toHaveCount(4);
  const kid0 = await f.evaluate(() => window.Oomba.debug.kit.stage.entities.find(e => e.kind === 'kid').id);
  await f.locator('.mh-tabs button').nth(1).click();
  await expect(f.locator('.mh-grid .mh-opt')).toHaveCount(8);
  await f.locator('.mh-grid .mh-opt').nth(3).click();
  await expect(f.locator('.mh-grid .mh-opt').nth(3)).toHaveAttribute('aria-pressed', 'true');
  expect(await f.evaluate(() => window.Oomba.debug.kit.stage.entities.find(e => e.kind === 'kid' && !e.dead).id)).not.toBe(kid0);
  await f.locator('.mh .ok-hot').click();
  // how-to (3 cards) -> countdown -> play with the HUD
  await expect(f.locator('.ok-howcard')).toHaveCount(3);
  await f.locator('.ok-howto .ok-hot').click();
  await expect.poll(() => M(f).then(m => m.scene), { timeout: 10000 }).toBe('play');
  await expect(f.locator('.ok-hud .ok-hearts svg')).toHaveCount(3);
  // run right with the keyboard, then jump
  const x0 = (await M(f)).x;
  await hold(f, 'right', 700);
  expect((await M(f)).x).toBeGreaterThan(x0 + 40);
  await f.evaluate(() => { window.__minY = 0; window.Oomba.debug.kit.stage.update(() => { window.__minY = Math.min(window.__minY, window.__brbTest.meadow().y); }); });
  await hold(f, 'jump', 250); await f.waitForTimeout(400);
  expect(await f.evaluate(() => window.__minY)).toBeLessThan(-60);
  // the fox: a speech bubble, then the 7 x 6 quiz (the fox stays clear of the scrim). A first miss shows the hint and
  // gives another go without giving the answer away; two misses reveal it and the fox asks a different fact.
  await f.evaluate(() => window.__brbTest.beat('fox'));
  await hold(f, 'right', 2500);
  await expect.poll(() => M(f).then(m => m.scene), { timeout: 10000 }).toBe('talk');
  await expect(f.locator('.ok-bubble')).toBeVisible();
  expect(await f.locator('.ok-bubble .ok-txt').evaluate(e => getComputedStyle(e.parentNode).hyphens)).toBe('none');
  await expect(f.locator('.ok-ask .ok-q')).toHaveText('7 × 6 = ?', { timeout: 15000 });
  await expect(f.locator('.ok-ask .ok-asker canvas')).toBeVisible();
  await f.locator('.ok-ask .ok-tile', { hasText: '36' }).click();
  await expect(f.locator('.ok-ask .ok-hint')).toBeVisible();
  await expect(f.locator('.ok-banner.ok-wrong')).not.toContainText('42');
  expect(await f.locator('.ok-ask .ok-tile.ok-right').count(), 'the right tile is never pre-marked on the retry').toBe(0);
  await f.locator('.ok-ask .ok-tile', { hasText: '48' }).click();
  await expect(f.locator('.ok-banner.ok-wrong')).toContainText('42');
  await expect(f.locator('.ok-ask .ok-tile', { hasText: '42' })).toHaveClass(/ok-right/);
  await expect(f.locator('.ok-ask .ok-q')).toHaveText('6 × 8 = ?', { timeout: 15000 });   // a different fact next
  await f.locator('.ok-ask .ok-tile', { hasText: '48' }).click();
  await expect.poll(() => M(f).then(m => m.gate), { timeout: 10000 }).toBe(true);
  // through the gate: night falls and the lanterns light one by one
  await expect.poll(() => M(f).then(m => m.scene), { timeout: 15000 }).toBe('play');
  await hold(f, 'right', 2400);
  await expect.poll(() => M(f).then(m => m.night), { timeout: 10000 }).toBe(true);
  await expect.poll(() => M(f).then(m => [m.tod, m.lanterns]), { timeout: 20000 }).toEqual([1, 5]);
  // the flag: slow-mo, the spark wipe, the results card with three sparks and the cheering row
  await f.evaluate(() => window.__brbTest.beat('goal'));
  await f.evaluate(() => window.__brbTest.collectAll());
  await hold(f, 'right', 1500);
  await expect(f.locator('.ok-win')).toBeVisible({ timeout: 20000 });
  await expect(f.locator('.ok-sparks .ok-on')).toHaveCount(3, { timeout: 15000 });
  const m = await M(f);
  expect(m.got).toBe(m.total); expect(m.scene).toBe('win');
  expect(await f.evaluate(() => window.Oomba.debug.kit.stage.entities.filter(e => e.clip === 'cheer').length)).toBeGreaterThanOrEqual(5);
  // one level: "Play again" is the big, focused button and there is no Next; it -> countdown -> a fresh level
  await expect(f.locator('.ok-win .ok-row button')).toHaveCount(1);
  await expect(f.locator('.ok-win .ok-hot')).toBeFocused();
  await f.locator('.ok-win .ok-hot').click();
  await expect.poll(() => M(f).then(m => [m.scene, m.got, m.gate]), { timeout: 15000 }).toEqual(['play', 0, false]);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('the meadow on Glaze at night, in Hebrew (RTL chrome, the world does not mirror) and at phone size', async ({ browser }) => {
  test.setTimeout(120_000);
  const k = await openMeadow(browser, { backend: 'glaze', mode: 'dark', l: 'he' }, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const f = k.frame;
  const st = await f.evaluate(() => window.__brbTest.state());
  expect([st.backend, st.theme, st.lang, st.dir]).toEqual(['glaze', 'dark', 'he', 'rtl']);
  expect(await f.evaluate(() => document.querySelector('.ok-ui').getAttribute('dir'))).toBe('rtl');
  await expect(f.locator('.ok-title-screen .ok-h1')).toHaveAttribute('dir', 'ltr');   // an English title stays LTR
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('.mh h2')).toHaveText('צרו את הגיבור שלכם');
  await f.evaluate(() => window.__brbTest.beat('pond'));
  await expect.poll(() => M(f).then(m => m.scene), { timeout: 10000 }).toBe('play');
  // portrait: zoomed in, the ground in the upper two-thirds; the sign still points right (the world is not mirrored)
  expect(await f.evaluate(() => window.Oomba.debug.kit.stage.camera.zoom)).toBeGreaterThan(1.5);
  expect(await f.evaluate(() => window.Oomba.debug.kit.stage.entities.find(e => e.sprite === 'sign').flip)).toBe(false);
  await f.locator('canvas').first().tap({ position: { x: 200, y: 600 } });
  await expect(f.locator('.ok-touch .ok-jump svg')).toBeVisible();
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('night: no blown-out lights, a few fireflies low in the scene, the cast keeps its colour (snapshot metrics)', async ({ browser }, testInfo) => {
  test.setTimeout(90_000);
  for (const backend of ['paper', 'glaze']) {
    const k = await openMeadow(browser, { backend, ...(backend === 'glaze' ? { tier: 'high' } : {}) });
    const f = k.frame;
    await f.evaluate(() => window.__brbTest.beat('goal'));
    await k.page.waitForTimeout(3500);
    const buf = await k.page.locator('#kitframe').screenshot();
    await testInfo.attach(`night-${backend}`, { body: buf, contentType: 'image/png' });
    const px = await k.page.evaluate(async b64 => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let white = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { n++; if (d[i] > 248 && d[i + 1] > 248 && d[i + 2] > 248) white++; }
      return { white: white / n };
    }, buf.toString('base64'));
    expect(px.white, `${backend}: blown-out white`).toBeLessThan(0.006);
    const ff = await f.evaluate(() => {
      const s = window.Oomba.debug.kit.stage, P = s.particles, top = s.camera.y - s.view.vh / 2 / s.camera.effZoom, h = s.view.vh / s.camera.effZoom, out = [];
      for (let i = 0; i < P.n; i++) if (P.flags[i] & 8) out.push({ y: (P.y[i] - top) / h, layer: P.layer[i], size: P.size[i] });
      return out;
    });
    expect(ff.length).toBeLessThanOrEqual(20);
    for (const p of ff) { expect(p.y, 'fireflies stay low (never in the stars)').toBeGreaterThan(0.25); expect(p.layer, 'behind the play layer').toBeLessThan(5); expect(p.size).toBeLessThan(12); }
    expect(k.errors).toEqual([]);
    await k.ctx.close();
  }
});

test('Glaze: after the title, steady play uploads no whole atlas page (only small dirty rectangles)', async ({ browser }) => {
  test.setTimeout(90_000);
  const k = await openMeadow(browser, { backend: 'glaze' });
  const f = k.frame;
  await f.evaluate(() => window.__brbTest.beat('play'));
  await k.page.waitForTimeout(800);
  const u0 = (await f.evaluate(() => window.__brbTest.frameStats())).uploads;
  await hold(f, 'right', 1500); await hold(f, 'jump', 300); await hold(f, 'right', 1200);
  const u1 = (await f.evaluate(() => window.__brbTest.frameStats())).uploads;
  expect(u1.full - u0.full, 'full-page uploads during play').toBe(0);
  expect(u1.px - u0.px, 'uploaded pixels during play').toBeLessThan(2048 * 2048);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('pause contract: P opens the pause screen during play, a lost focus does too; restart and quit come back to the game', async ({ browser }) => {
  test.setTimeout(90_000);
  const k = await openMeadow(browser);
  const f = k.frame;
  await f.evaluate(() => window.__brbTest.beat('play'));
  await f.locator('canvas').first().click({ position: { x: 640, y: 200 } });   // focus the game
  await k.page.keyboard.press('KeyP');
  await expect(f.locator('.ok-pause')).toBeVisible();
  expect(await f.evaluate(() => window.Oomba.time.paused)).toBe(true);
  await f.locator('.ok-pause').press('Escape');
  await expect(f.locator('.ok-pause')).toHaveCount(0);
  await f.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(f.locator('.ok-pause')).toBeVisible();
  await f.evaluate(() => window.dispatchEvent(new Event('focus')));
  expect(await f.evaluate(() => window.Oomba.time.paused), 'the pause screen keeps it paused after focus returns').toBe(true);
  await f.locator('.ok-pause .ok-quiet').filter({ hasText: 'Quit' }).click();
  await expect.poll(() => M(f).then(m => m.scene), { timeout: 10000 }).toBe('title');
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('the demo is not public: no /kit for guests or players, and it is not in the games list', async ({ request }) => {
  for (const url of ['/kit', '/kit/frame/meadow']) expect((await request.get(url)).status()).toBe(404);
  const home = await (await request.get('/')).text();
  expect(home).not.toMatch(/Oomba Meadow/);
});
