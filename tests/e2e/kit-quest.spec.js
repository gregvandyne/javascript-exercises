// "Oomba Quest" (kit/demo/quest.html): a whole game written as one Oomba.game({...}) call with the three art packs,
// played through the real frame (sandbox + frame CSP): the packs load from their pinned tags, the built-in parts work
// in a real browser (talk, spring, key and door, quiz gate, flag), the results screen leads to the generated level 2.
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

async function openQuest(browser, query = {}) {
  const ctx = await browser.newContext({ storageState: auth });
  await ctx.addInitScript(() => { window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective + ' ' + e.blockedURI)); });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('/kit?' + new URLSearchParams({ scene: 'quest', backend: 'paper', ...query }));
  await expect.poll(() => page.frames().some(f => f.url().includes('/kit/frame/quest')), { timeout: 15000 }).toBe(true);
  const frame = page.frames().find(f => f.url().includes('/kit/frame/quest'));
  await frame.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().scene === 'title', null, { timeout: 20000 });
  return { ctx, page, f: frame, errors, csp: () => frame.evaluate(() => window.__csp) };
}
const S = f => f.evaluate(() => window.__brbTest.state());
const hold = (f, a, ms) => f.evaluate(([a, ms]) => window.Oomba.input.hold(a, ms), [a, ms]);
const put = (f, c) => f.evaluate(c => { const w = window.Oomba.debug.kit.game.world; w.hero.x = (c + 0.5) * 48; w.hero.y = 6 * 48; w.body.vx = w.body.vy = 0; }, c);

test('Oomba Quest: one Oomba.game call with three packs plays through talk, spring, key, door, quiz gate and the flag to level 2', async ({ browser }) => {
  test.setTimeout(180_000);
  const k = await openQuest(browser), f = k.f;
  // the packs come from their own pinned tags (SRI + crossorigin), after the kit's
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  // The demo pages load every pack of the version (the 3D bridge too, which does nothing without three.js; the live pack, which does nothing outside a live session).
  const PACKS = ['art-animals', 'art-biomes', 'art-biomes-2', 'art-props', 'art-school', 'bridge-3d', 'dress', 'live', 'style-bold'];
  expect(tags.map(t => t[0])).toEqual(['/vendor/oomba-kit/1.1.0/oomba-kit.js', ...PACKS.map(n => `/vendor/oomba-kit/1.1.0/packs/${n}.js`)]);
  for (const t of tags) expect([t[1], t[2]]).toEqual([true, 'anonymous']);
  expect(await f.evaluate(() => window.Oomba.packs.sort())).toEqual(PACKS);
  await expect(f.locator('.ok-title-screen .ok-h1')).toHaveText('Oomba Quest');
  // Play -> how-to -> countdown -> play (the kit's own scenes)
  await f.locator('.ok-title-screen .ok-hot').click();
  await expect(f.locator('.ok-howcard')).toHaveCount(3);
  await f.locator('.ok-howto .ok-hot').click();
  await expect.poll(() => S(f).then(s => s.scene), { timeout: 10000 }).toBe('play');
  await expect(f.locator('.ok-hud .ok-hearts svg')).toHaveCount(3);
  // the owl talks when you walk up to it
  await hold(f, 'right', 900);
  await expect(f.locator('.ok-bubble')).toContainText('The door needs a key', { timeout: 10000 });
  expect(await f.evaluate(() => window.Oomba.debug.kit.game.world.find('owl').kind)).toBe('owl');
  // the spring bounces you up to the ledge with the key
  await expect.poll(() => S(f).then(s => s.scene), { timeout: 15000 }).toBe('play');
  await put(f, 9); await hold(f, 'right', 600); await f.waitForTimeout(1500);
  await expect.poll(() => S(f).then(s => s.keys), { timeout: 10000 }).toBe(1);
  // the quiz gate asks its own question; the right answer opens it
  await put(f, 36); hold(f, 'right', 6000);
  await expect(f.locator('.ok-ask .ok-q')).toHaveText('4 + 3 = ?', { timeout: 15000 });
  await f.locator('.ok-ask .ok-tile', { hasText: '7' }).click();
  await expect.poll(() => f.evaluate(() => window.Oomba.debug.kit.game.world.find('gate').solidOn), { timeout: 10000 }).toBe(false);
  // the key opens the door; then the flag wins
  await expect.poll(() => S(f).then(s => s.scene), { timeout: 15000 }).toBe('play');
  await put(f, 48); await hold(f, 'right', 1200);
  await expect.poll(() => S(f).then(s => s.keys), { timeout: 10000 }).toBe(0);
  await put(f, 60); await hold(f, 'right', 800);
  await expect(f.locator('.ok-win')).toBeVisible({ timeout: 20000 });
  // Next -> the generated level 2
  await f.locator('.ok-win .ok-hot').click();
  await expect.poll(() => S(f).then(s => [s.scene, s.level]), { timeout: 15000 }).toEqual(['play', 1]);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});

test('Oomba Quest on Glaze at night, in Arabic: chrome mirrors, the game still runs, no errors', async ({ browser }) => {
  test.setTimeout(90_000);
  const k = await openQuest(browser, { backend: 'glaze', mode: 'dark', l: 'ar' }), f = k.f;
  const st = await S(f);
  expect([st.backend, st.theme, st.dir]).toEqual(['glaze', 'dark', 'rtl']);
  await f.evaluate(() => window.__brbTest.start());
  await expect.poll(() => S(f).then(s => s.scene), { timeout: 10000 }).toBe('play');
  const x0 = (await S(f)).hero.x; await hold(f, 'right', 700);
  expect((await S(f)).hero.x).toBeGreaterThan(x0 + 40);
  expect(await k.csp()).toEqual([]);
  expect(k.errors).toEqual([]);
  await k.ctx.close();
});
