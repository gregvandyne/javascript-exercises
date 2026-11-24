// Official games, frame by frame (virtual clock): Gulp City (hook + big hole), Atlas Quest, Would You Rather, Castle Clash.
// node .demo2/rec-games.mjs land|port [only]
import { chromium } from 'playwright';
import { launchOptions } from '../chromium.js';
import { Capture, cursorInit, setCursor, glide } from './vc.mjs';
import { B, login, gameFrame, fullGame } from './lib.mjs';
const orient = process.argv[2] || 'land', only = process.argv[3];
const V = orient === 'land' ? { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, out: [1920, 1080] } : { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, out: [1080, 1920] };
const C = '/tmp/claude-0/demo2/clips';
const br = await chromium.launch(launchOptions({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }, { headless: true }));
const ctx = await br.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, isMobile: !!V.isMobile, hasTouch: !!V.hasTouch, extraHTTPHeaders: { 'x-forwarded-for': '10.7.9.' + (orient === 'land' ? 1 : 2) } });
const p = await ctx.newPage(); p.__name = 'g';
await login(p, 'MayaMakes', 'secret123');
await Capture.install(ctx);
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
async function open(slug) {
  await p.goto(B + '/play/' + slug); await fullGame(p);
  const f = await gameFrame(p); const cap = new Capture([p], `${C}/tmp-${slug}-${orient}`);
  for (let i = 0; i < 900; i++) { await cap.stepAll(33.3); const ok = await f.evaluate(() => { const t = window.__brbTest; if (!t) return false; const s = t.state ? t.state() : {}; return !s || !Object.prototype.hasOwnProperty.call(s, 'ready') || s.ready; }).catch(() => false); if (ok) break; }
  await cap.advance(1200);
  return { f, cap };
}
const out = (cap, name) => { const r = cap.encode(`${name}-${orient}`, { g: V.out }); console.log('ok', r.g); };
const run = async (name, fn) => { if (only && only !== name) return; await fn(); };

await run('gulp', async () => {
  const { f, cap } = await open('gulp-city');
  await T(f, 'start', { mode: 'round', difficulty: 'easy', seed: 5 }); await T(f, 'setGrace', 999);
  await T(f, 'setSize', 4.2); await T(f, 'autopilot', true); await cap.advance(1500);
  await cap.seconds(6.2); out(cap, 'gulp');
  await T(f, 'setSize', 11); await cap.advance(3500);
  const c2 = new Capture([p], `${C}/tmp-gulp2-${orient}`); await c2.seconds(3.0); out(c2, 'gulpbig');
});
await run('atlas', async () => {
  const { f, cap } = await open('atlas-quest');
  await T(f, 'cover'); await cap.advance(1000);
  await cap.seconds(3.0, async i => { await f.evaluate(i => { try { window.__brbTest.camera({ lat: 20 - i * 0.12, lng: 4 + i * 0.75, dist: 2.6 - i * 0.008 }); } catch {} }, i); });
  out(cap, 'atlas');
});
await run('wyr', async () => {
  const { f, cap } = await open('would-you-rather');
  await T(f, 'start', 'alone', { count: 10 }); await cap.advance(800);
  await f.evaluate(() => { const b = document.getElementById('readyBtn') || document.querySelector('[id*=start i]'); b && b.click(); }); await cap.advance(1200);
  // Since the restyle (#570) the cards are still between answers, so a cursor picks one and moves on to the next question.
  await cursorInit(p); await setCursor(p, V.viewport.width * 0.72, V.viewport.height * 0.88);
  await cap.frames(6);
  const a = await glide(cap, p, f.locator('#optA'), { sec: 0.6, click: false, dy: 0.55 });
  await T(f, 'pick', 'a'); await cap.frames(9, i => setCursor(p, a.x, a.y, i / 9)); await setCursor(p, a.x, a.y);
  await cap.frames(18);
  const n = await glide(cap, p, f.locator('#nextBtn'), { sec: 0.5, click: false });
  await f.evaluate(() => document.getElementById('nextBtn').click()); await cap.frames(9, i => setCursor(p, n.x, n.y, i / 9)); await setCursor(p, n.x, n.y);
  await cap.frames(21);
  out(cap, 'wyr');
});
await run('chess', async () => {
  const { f, cap } = await open('castle-clash');
  await T(f, 'start', { mode: 'robot', level: 'pawn' }); await cap.advance(1500);
  // The board is still between moves since the restyle (#570): a cursor drags each move (the robot answers on its own clock).
  const sq = id => f.locator('.sq').nth((8 - +id[1]) * 8 + 'abcdefgh'.indexOf(id[0]));
  await cursorInit(p); await setCursor(p, V.viewport.width * 0.7, V.viewport.height * 0.85);
  await cap.frames(4);
  for (const m of ['e2e4', 'g1f3', 'f1c4']) {
    await glide(cap, p, sq(m.slice(0, 2)), { sec: 0.35, click: false });
    const t = await glide(cap, p, sq(m.slice(2, 4)), { sec: 0.3, click: false });
    await f.evaluate(m => { window.__brbTest.move(m, {}); }, m).catch(e => console.log('move', e.message));
    await cap.frames(6, i => setCursor(p, t.x, t.y, i / 6)); await setCursor(p, t.x, t.y);
  }
  await cap.frames(14);
  out(cap, 'chess');
});
await br.close();
