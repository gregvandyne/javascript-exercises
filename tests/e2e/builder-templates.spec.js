// The Builder's "Start from" templates on the Oomba Kit, in the real Studio preview (sandbox + frame CSP): each one
// loads the kit and its packs from the pinned tags, passes the safety scan with no style notes, starts a round through
// __brbTest and plays (a real tap, key or card), with no console errors. Then the mock Builder changes a kit game with
// spec edits ("make the bunny blue with a hat", a snowy world) through the kit layer, and the game still plays.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { signup, uniq, templateGame, studioState, gameFrame } from './helpers.js';

const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', process.env.BRB_CHROMIUM].find(p => p && fs.existsSync(p));
test.use({ launchOptions: { ...(exe ? { executablePath: exe } : {}), args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

const S = f => f.evaluate(() => (window.__brbTest && window.__brbTest.state ? window.__brbTest.state() : null)).catch(() => null);
const frameOf = page => page.frames().find(x => x.url().includes('/frame/'));
/** Console errors and page errors from the game frame (the platform's own Permissions-Policy notes are warnings). */
function watch(page) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) errors.push(m.text()); });
  return errors;
}
async function open(page, key) {
  const g = await templateGame(page, { template: key });
  const f = await gameFrame(page);
  await expect.poll(async () => { const s = await S(frameOf(page)); return !!s && (s.game === true || s.ready === true); }, { timeout: 30_000 }).toBe(true);
  const st = await studioState(page, g.id);
  expect(st.current.safety).toBe('pass');
  const tags = await f.evaluate(() => [...document.querySelectorAll('script[src]')].map(s => [s.getAttribute('src'), !!s.integrity, s.crossOrigin]));
  expect(tags[0][0]).toBe('/vendor/oomba-kit/1.1.0/oomba-kit.js');
  for (const t of tags) expect([t[1], t[2]]).toEqual([true, 'anonymous']);
  await f.evaluate(() => window.__brbTest.start());
  await expect.poll(async () => { const s = await S(frameOf(page)); return s && (s.scene || s.screen); }, { timeout: 15_000 }).toBe('play');
  // The player taps into the game (the kit waits while the frame has no focus: the builder was typing in the Studio).
  await page.locator('#st-frame').click({ position: { x: 4, y: 200 } });
  await expect.poll(() => f.evaluate(() => window.Oomba.time.paused)).toBe(false);
  return { g, f: frameOf(page) };
}
/** Press a button in the game (the Studio preview is scaled, so locator clicks miss; this is the element's own click). */
const tap = (f, sel, i = 0) => f.evaluate(([sel, i]) => { const e = document.querySelectorAll(sel)[i]; if (e) e.click(); return !!e; }, [sel, i]);
const hold = (f, a, ms) => f.evaluate(([a, ms]) => window.Oomba.input.hold(a, ms), [a, ms]);

test('every 2D template is a kit game that plays in the Studio preview with no errors', async ({ page }) => {
  test.setTimeout(300_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  const errors = watch(page);
  await signup(page, uniq('Tpl'));

  // Catch: the hero runs; things fall from the sky.
  let { f } = await open(page, 'catch');
  const x0 = (await S(f)).hero.x; await hold(f, 'left', 700);
  expect((await S(f)).hero.x).toBeLessThan(x0);
  await expect.poll(() => f.evaluate(() => document.querySelectorAll('.ok-hud .ok-hearts svg').length)).toBe(3);

  // Runner: the hero runs right by itself.
  ({ f } = await open(page, 'runner'));
  const r0 = (await S(f)).hero.x;
  await expect.poll(async () => (await S(f)).hero.x, { timeout: 10_000 }).toBeGreaterThan(r0 + 60);

  // Quiz: the host's quiz card, four answers; a right answer scores.
  ({ f } = await open(page, 'quiz'));
  await tap(f, '.ok-bubble');
  await expect(f.locator('.ok-ask .ok-tile')).toHaveCount(4, { timeout: 15_000 });
  // the round is unseeded (a fresh shuffle each time): keep answering, tapping the host's fact bubbles away, until a right answer scores
  for (let i = 0; i < 16 && !(await S(f)).score; i++) { if (!(await tap(f, '.ok-ask .ok-tile:not([disabled])'))) await tap(f, '.ok-bubble'); await page.waitForTimeout(500); }
  await expect.poll(async () => (await S(f)).score, { timeout: 10_000 }).toBeGreaterThan(0);

  // Memory: twelve cards, flipping two turns them up.
  ({ f } = await open(page, 'memory'));
  await expect(f.locator('.mm-card')).toHaveCount(12);
  // a keyboard player: Space on a focused card flips it (the kit never takes Space for a jump on the game's buttons);
  // the cards wait out the peek on the game clock, which runs slower than real time on a software-rendered browser
  await expect.poll(async () => { await f.evaluate(() => document.querySelectorAll('.mm-card')[0].focus()); await page.keyboard.press('Space'); return f.locator('.mm-card[aria-pressed="true"]').count(); }, { timeout: 15_000 }).toBe(1);
  await tap(f, '.mm-card', 1);
  await expect(f.locator('.mm-card[aria-pressed="true"]')).toHaveCount(2);

  // Word: a picture, letter slots and letter keys; a wrong letter costs a heart, the right one fills a slot.
  ({ f } = await open(page, 'word'));
  await expect(f.locator('.wd .wd-key').first()).toBeVisible({ timeout: 15_000 });
  const before = await f.locator('.wd-slot.wd-on').count();
  const keys = await f.locator('.wd .wd-key').count();
  for (let i = 0; i < keys; i++) { if ((await f.locator('.wd-slot.wd-on').count()) > before) break; await tap(f, '.wd .wd-key', i); await page.waitForTimeout(150); }
  await expect.poll(() => f.locator('.wd-slot.wd-on').count()).toBeGreaterThan(before);

  // Duel: a tap on a pad decides the round.
  ({ f } = await open(page, 'duel'));
  await expect(f.locator('.du-signal')).toBeVisible();
  // tap player 1's pad until the round is decided: before GO the point goes to player 2, after GO to player 1
  await expect.poll(async () => {
    await f.evaluate(() => document.querySelector('.du-p1').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
    return f.locator('.du-score').textContent();
  }, { timeout: 15_000 }).toMatch(/0 – 1|1 – 0/);

  // Board: Roll moves the first player's token along the path.
  ({ f } = await open(page, 'board'));
  await tap(f, '.bd-roll');
  await expect.poll(async () => (await S(f)).score, { timeout: 10_000 }).toBeGreaterThan(0);

  expect(errors).toEqual([]);
});

test('the mock Builder changes a kit game with spec edits through the kit layer, and it still plays', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1280, height: 860 });
  const errors = watch(page);
  await signup(page, uniq('Lyr'));
  const { g } = await open(page, 'catch');
  for (const text of ['make the bunny blue with a hat', 'make the world snowy']) {
    const sent = await page.request.post(`/api/studio/${g.id}/chat`, { data: { text, detach: true } });
    expect(sent.status()).toBe(202);
    await expect.poll(async () => (await studioState(page, g.id)).busy, { timeout: 30_000 }).toBe(false);
  }
  const st = await studioState(page, g.id);
  expect(st.current.number).toBe(3); expect(st.current.safety).toBe('pass');
  await page.reload();
  const f = await gameFrame(page);
  await expect.poll(() => f.evaluate(() => window.BRB_TUNE && window.BRB_TUNE.biome).catch(() => null), { timeout: 20_000 }).toBe('snow');
  expect(await f.evaluate(() => window.BRB_TUNE.look.bunny)).toEqual({ colors: { base: 'sky' }, outfit: { color: 'sky' }, wear: ['wizard-hat'] });
  expect(await f.evaluate(() => typeof window.Oomba.__tune)).toBe('function');
  await f.evaluate(() => window.__brbTest.start());
  await expect.poll(async () => (await S(f) || {}).scene, { timeout: 15_000 }).toBe('play');
  expect(errors).toEqual([]);
});
