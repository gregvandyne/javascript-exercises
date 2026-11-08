// Jungle Cup's bigger Delta Isle, played with REAL input only (CDP touch drags on the joystick and taps on the
// buttons; real keys on a laptop): from a fresh save, Cappy walks from the dock to every one of the eight arches along
// the intended ways round — the rope bridge over the gorge, the stepping stones and lily pads, the vine swing over the
// ravine, the long ladder up the cliffs, the zipline down, the mud trail, the river ferry and the glowing cave out
// behind the waterfall — and opens each sport on the first try. A keyboard run kicks the shortcut ladder down, rides
// the zipline and pushes the log over the gorge. Fast travel only goes to places Cappy has walked to; an old save
// (from the smaller island) lands safely in the village. Game time is stepped between real inputs so the long walks
// run fast and the same every time.
// Run alone: E2E_PORT=5301 npx playwright test tests/e2e/jungle-cup-island.spec.js
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { gameFrame, ownIp } from './helpers.js';

const SHOTS = process.env.JC_ISLAND_SHOTS || '';
const J = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest.jc[fn](...a), [fn, a]);
const state = f => J(f, 'state');

async function open(page, size) {
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize(size);
  await ownIp(page);
  await page.goto('/play/jungle-cup');
  const f = await gameFrame(page);
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.jc && window.__brbTest.jc.state().screen === 'title', null, { timeout: 30000 });
  return { f, errors };
}
/** A fresh game, the raft-arrival panels skipped (B) and the hello read. */
async function freshGame(f) {
  await J(f, 'manual', true);
  await J(f, 'newGame');
  for (let i = 0; i < 30; i++) {
    await J(f, 'step', 150);
    const s = await state(f);
    if (s.panel) await J(f, 'tapKey', 'b'); else if (s.text) await J(f, 'skipText'); else if (i > 4) break;
  }
  expect((await state(f)).screen).toBe('world');
}
/** Virtual pixels to page CSS pixels. */
async function mapper(page, f) {
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); const v = window.__brbTest.jc.state().view; return { x: r.left, y: r.top, k: v.S / v.dpr }; });
  return (vx, vy) => ({ x: fb.x + c.x + vx * c.k, y: fb.y + c.y + vy * c.k });
}
const pt = (p, id = 1) => ({ x: p.x, y: p.y, id, radiusX: 6, radiusY: 6, force: 1 });
/** A shortest walk over open tiles (4 ways), found in the page from the map itself. */
function bfs(f, from, to) {
  return f.evaluate(([from, to]) => {
    const j = window.__brbTest.jc, [W, H] = j.routes().size, key = (x, y) => y * W + x;
    const prev = new Int32Array(W * H).fill(-2), q = [key(from[0], from[1])]; prev[q[0]] = -1;
    for (let i = 0; i < q.length; i++) {
      const k = q[i], x = k % W, y = (k / W) | 0;
      if (x === to[0] && y === to[1]) { const out = []; for (let c = k; c !== -1; c = prev[c]) out.push([c % W, (c / W) | 0]); return out.reverse(); }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const nk = key(nx, ny); if (prev[nk] !== -2 || j.solidAt(nx, ny)) continue; prev[nk] = k; q.push(nk); }
    }
    return null;
  }, [from, to]);
}
/** The input driver: the joystick (touch) or the arrow keys, pointing Cappy along a direction. */
function touchDriver(page, f, cdp, toPage, view, R) {
  const base = { x: view.W * 0.25, y: view.H * 0.72 };
  let down = false;
  return {
    async point(vx, vy) {
      const d = Math.hypot(vx, vy) || 1;
      if (!down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(base.x, base.y))] }); down = true; }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [pt(toPage(base.x + vx / d * R, base.y + vy / d * R))] });
    },
    async stop() { if (down) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); down = false; } },
    async tapButton(id) {
      const b = (await J(f, 'buttons')).find(x => x.id === id); expect(b, `button ${id}`).toBeTruthy();
      const fb = await (await f.frameElement()).boundingBox();
      const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      await page.touchscreen.tap(fb.x + c.x + b.x + b.w / 2, fb.y + c.y + b.y + b.h / 2);
    },
  };
}
function keyDriver(page) {
  const held = new Set();
  const want = async keys => { for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } };
  return {
    async point(vx, vy) { const k = []; if (Math.abs(vx) > 3) k.push(vx > 0 ? 'ArrowRight' : 'ArrowLeft'); if (Math.abs(vy) > 3) k.push(vy > 0 ? 'ArrowDown' : 'ArrowUp'); await want(k); },
    async stop() { await want([]); },
    async tapButton() { await page.keyboard.press('Space'); },
  };
}
/** Walk to a tile along the open ground, steering tile by tile (on a ladder only up and down matter). */
async function walkTo(f, drv, to, log) {
  let s = await state(f);
  const route = await bfs(f, [s.pos.x, s.pos.y], to);
  expect(route, `a way from ${s.pos.x},${s.pos.y} to ${to}`).not.toBe(null);
  for (let i = 1; i < route.length; i++) {
    const [tx, ty] = route[i];
    for (let n = 0; n < 60; n++) {
      s = await state(f);
      const fx = s.pos.px + 8, fy = s.pos.py + 12, vx = tx * 16 + 8 - fx, vy = ty * 16 + 8 - fy;
      if ((s.pos.climb ? Math.abs(vy) : Math.hypot(vx, vy)) < 5 || (s.pos.x === tx && s.pos.y === ty && Math.hypot(vx, vy) < 7)) break;
      await drv.point(vx, vy);
      await J(f, 'step', 40);
    }
  }
  await drv.stop();
  await J(f, 'step', 60);
  s = await state(f);
  if (log) log.push(`walked to ${s.pos.x},${s.pos.y}`);
  return s;
}
/** Use the ride or shortcut here (its button), and wait for the ride to end. */
async function ride(f, drv, kind) {
  await expect.poll(async () => (await state(f)).trav, { timeout: 4000 }).toBe(kind);
  await drv.tapButton('trav');
  await J(f, 'step', 100);
  for (let i = 0; i < 60; i++) { const s = await state(f); if (!s.ride) break; await J(f, 'step', 100); }
  return state(f);
}
/** Enter a sport from its arch on the first try, then come back out to the island. */
async function playArch(f, drv, id, page) {
  const a = (await J(f, 'world')).arches[id];
  // step in towards the arch until its prompt shows (one approach)
  for (let n = 0; n < 80; n++) {
    const s = await state(f);
    if (s.prompt === id) break;
    await drv.point(a.x * 16 + 8 - (s.pos.px + 8), a.y * 16 + 8 - (s.pos.py + 12)); await J(f, 'step', 40);
  }
  await drv.stop(); await J(f, 'step', 40);
  expect((await state(f)).prompt, `${id} prompt`).toBe(id);
  await drv.tapButton('prompt'); await J(f, 'step', 400);
  let s = await state(f);
  expect([s.screen, s.sport && s.sport.id], `${id} opens on the first try`).toEqual(['sport', id]);
  // back to the island (the intro card's back button / B)
  await page.keyboard.press('Escape'); await J(f, 'step', 600);
  s = await state(f);
  if (s.screen !== 'world') { await J(f, 'tap', 'back'); await J(f, 'step', 600); s = await state(f); }
  expect(s.screen).toBe('world');
  return s;
}

test.describe('touch', () => {
  test.use({ hasTouch: true, isMobile: true });
  test('Jungle Cup: from the dock to all eight arches along the ways round, with the joystick (390x844)', async ({ page }) => {
    test.setTimeout(600_000);
    const { f, errors } = await open(page, { width: 390, height: 844 });
    await freshGame(f);
    const cdp = await page.context().newCDPSession(page);
    const toPage = await mapper(page, f);
    let s = await state(f);
    expect([s.pos.x, s.pos.y]).toEqual([50, 93]);
    // a first touch so the game knows it's a touch screen
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt(toPage(s.view.W * 0.25, s.view.H * 0.72))] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await J(f, 'step', 60);
    const R = (await state(f)).stick.R || 40;
    const drv = touchDriver(page, f, cdp, toPage, s.view, R);
    const log = [];
    const shot = async n => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `route-390x844-${n}.png`) }); } };
    const r = await J(f, 'routes');
    // the dock up the boardwalk to Mossy Village, then west to Jada's canopy court
    await walkTo(f, drv, [50, 70], log);
    // a golden acorn on the way north (the counter shows it)
    const acorn = r.acorns[0];
    await walkTo(f, drv, acorn, log);
    expect((await state(f)).acorns).toBe(1);
    await walkTo(f, drv, [40, 58], log);
    await playArch(f, drv, 'paddle', page);
    // over the rope bridge (it sways), on over the stepping stones and lily pads to Tico's islet
    await walkTo(f, drv, [31, 60], log);
    s = await state(f); expect(s.pos.tile).toBe(19);   // standing on the rope bridge
    await shot('01-bridge');
    await walkTo(f, drv, [23, 60], log);
    expect([7, 23]).toContain((await state(f)).pos.tile);   // a stone or a lily pad
    await walkTo(f, drv, [17, 60], log);
    await playArch(f, drv, 'seed', page);
    // back over the stones, south to the pitch
    await walkTo(f, drv, [17, 68], log);
    await playArch(f, drv, 'kick', page);
    // north to the ravine: the vine swing over it, up to Kiki's hills
    await walkTo(f, drv, r.routes.swing.a, log);
    await shot('02-swing');
    s = await ride(f, drv, 'swing');
    expect([s.pos.x, s.pos.y]).toEqual(r.routes.swing.b);
    await walkTo(f, drv, [18, 31], log);
    await playArch(f, drv, 'leaf', page);
    // and swing back
    await walkTo(f, drv, r.routes.swing.b, log);
    s = await ride(f, drv, 'swing');
    expect([s.pos.x, s.pos.y]).toEqual(r.routes.swing.a);
    // back over the bridge, up the Kapok road, east along the cliffs and up the long ladder (climbing)
    await walkTo(f, drv, [77, 39], log);
    await walkTo(f, drv, [77, 36], log);
    s = await state(f); expect(s.pos.climb).toBe(true);
    await shot('03-ladder');
    await walkTo(f, drv, [71, 24], log);
    await playArch(f, drv, 'vine', page);
    // the zipline down to the Kapok road
    await walkTo(f, drv, r.routes.zip.a, log);
    s = await ride(f, drv, 'zip');
    expect([s.pos.x, s.pos.y]).toEqual(r.routes.zip.b);
    // the mud trail (slow and splashy) down to the clearing
    await walkTo(f, drv, [80, 45], log);
    expect((await state(f)).pos.tile).toBe(22);
    await walkTo(f, drv, [74, 60], log);
    await playArch(f, drv, 'dash', page);
    // the ferry over the river to the canoes
    await walkTo(f, drv, r.ferry.a, log);
    s = await ride(f, drv, 'ferry');
    expect([s.pos.x, s.pos.y]).toEqual(r.ferry.b);
    await shot('04-east-bank');
    await walkTo(f, drv, [97, 50], log);
    await playArch(f, drv, 'rapids', page);
    // back over, round to the cave: dark inside, the mushrooms glow; out behind the waterfall into Rana's grotto
    await walkTo(f, drv, r.ferry.b, log);
    await ride(f, drv, 'ferry');
    await walkTo(f, drv, [64, 70], log);
    s = await state(f); expect(s.pos.tile).toBe(21); expect(s.cave).toBeGreaterThan(0.5);
    await shot('05-cave');
    await walkTo(f, drv, [r.routes.falls.x, r.routes.falls.y0], log);
    await walkTo(f, drv, [78, 74], log);
    await playArch(f, drv, 'frog', page);
    s = await state(f);
    expect(s.visited.sort()).toEqual(['dash', 'frog', 'kick', 'leaf', 'paddle', 'rapids', 'seed', 'vine']);
    expect(errors).toEqual([]);
    const perf = await J(f, 'perf');
    expect(perf.slowest).toBeLessThan(60);
  });
});

test('Jungle Cup: keys on a laptop: the ladder up, the shortcut ladder kicked down, the zipline, the log pushed over the gorge', async ({ page }) => {
  test.setTimeout(400_000);
  const { f, errors } = await open(page, { width: 1366, height: 768 });
  await freshGame(f);
  const drv = keyDriver(page);
  const r = await J(f, 'routes');
  // up the Kapok road and east to the long ladder; climb it
  await walkTo(f, drv, [77, 38]);
  await walkTo(f, drv, [77, 33]);
  let s = await state(f);
  expect(s.pos.y).toBeLessThanOrEqual(33);
  // the shortcut: the rolled-up ladder at the top of the cliff above the Kapok road, kicked down with Space
  await walkTo(f, drv, [r.routes.kickLadder.x, r.routes.kickLadder.y0 - 1]);
  await expect.poll(async () => (await state(f)).trav, { timeout: 4000 }).toBe('kick');
  await page.keyboard.press('Space'); await J(f, 'step', 200);
  s = await state(f);
  expect(s.shortcuts.ladder).toBe(true);
  expect(await J(f, 'tileAt', r.routes.kickLadder.x, r.routes.kickLadder.y0 + 1)).toBe(17);
  // down the new ladder (it is real now)
  await walkTo(f, drv, [r.routes.kickLadder.x, r.routes.kickLadder.y1 + 1]);
  expect((await state(f)).pos.y).toBe(r.routes.kickLadder.y1 + 1);
  // back up it, and the zipline down
  await walkTo(f, drv, r.routes.zip.a);
  await expect.poll(async () => (await state(f)).trav, { timeout: 4000 }).toBe('zip');
  await page.keyboard.press('Space'); await J(f, 'step', 100);
  expect((await state(f)).ride).toBe('zip');
  for (let i = 0; i < 40 && (await state(f)).ride; i++) await J(f, 'step', 100);
  s = await state(f); expect([s.pos.x, s.pos.y]).toEqual(r.routes.zip.b);
  // west over the rope bridge, south past the pitch to the log; push it over the gorge with Space
  await walkTo(f, drv, [r.routes.gorgeX - 2, r.routes.logY]);
  await expect.poll(async () => (await state(f)).trav, { timeout: 4000 }).toBe('push');
  await page.keyboard.press('Space'); await J(f, 'step', 200);
  expect((await state(f)).shortcuts.log).toBe(true);
  // straight over the log to the boardwalk (the shortcut home)
  await walkTo(f, drv, [r.routes.gorgeX + r.routes.gorgeW + 1, r.routes.logY]);
  s = await state(f); expect(s.pos.x).toBeGreaterThan(r.routes.gorgeX + 2);
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'route-1366x768-log.png') }); }
  // the shortcuts are kept in the save
  const save = await J(f, 'save');
  expect([save.flags.scLadder, save.flags.scLog]).toEqual([1, 1]);
  expect(errors).toEqual([]);
});

test('Jungle Cup: fast travel only to places walked to; an old save lands in the village', async ({ page }) => {
  test.setTimeout(120_000);
  const { f, errors } = await open(page, { width: 390, height: 844 });
  // an old save from the smaller island: its position means nothing on the new map
  await J(f, 'setSave', { pos: { x: 36, y: 40, d: 'up' }, plays: { paddle: 2 }, feathers: { paddle: true }, best: { paddle: 900 }, stars: { paddle: 2 }, flags: { storySeen: 1, metMango: 1, dashNews: 1 } });
  await J(f, 'manual', true);
  await J(f, 'continue');
  for (let i = 0; i < 10; i++) { await J(f, 'step', 150); const s = await state(f); if (s.panel) await J(f, 'tapKey', 'b'); else if (s.text) await J(f, 'skipText'); }
  let s = await state(f);
  expect([s.screen, s.pos.x, s.pos.y]).toEqual(['world', 50, 66]);
  expect(s.visited).toEqual(['paddle']);
  expect(s.feathersBy.paddle).toBe(true);
  // the map: a sport not walked to yet says so and stays on the map; a visited one travels straight there
  await J(f, 'go', 'map'); await J(f, 'step', 200);
  await J(f, 'tap', 'go:frog'); await J(f, 'step', 100);
  s = await state(f);
  expect(s.screen).toBe('map');
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'map-walk-first-390x844.png') }); }
  await J(f, 'tap', 'go:paddle'); await J(f, 'step', 600);
  s = await state(f);
  expect([s.screen, s.prompt]).toEqual(['world', 'paddle']);
  // the minimap: a tap travels to the nearest place Cappy can go (here, the dock at the bottom)
  await J(f, 'go', 'map'); await J(f, 'step', 200);
  const mini = (await J(f, 'buttons')).find(b => b.id === 'mini');
  expect(mini).toBeTruthy();
  const fb = await (await f.frameElement()).boundingBox();
  const c = await f.evaluate(() => { const r = document.getElementById('jc').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await page.mouse.click(fb.x + c.x + mini.x + mini.w * 0.45, fb.y + c.y + mini.y + mini.h * 0.95);
  await J(f, 'step', 600);
  s = await state(f);
  expect(s.screen).toBe('world'); expect(s.pos.y).toBeGreaterThan(85);
  expect(errors).toEqual([]);
});
