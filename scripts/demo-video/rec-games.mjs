// Official games, frame by frame (virtual clock), only games a visitor can find today (ARCADE off): Atlas Quest (the
// hook's lit globe, and a Find it question), Word Hunt, Crossword, Castle Clash.
// node .demo2/rec-games.mjs land|port [only]
import { chromium } from 'playwright';
import { launchOptions } from '../chromium.js';
import { Capture, cursorInit, setCursor, glide } from './vc.mjs';
import { B, login, gameFrame, fullGame } from './lib.mjs';
const orient = process.argv[2] || 'land', only = process.argv[3];
const L = orient === 'land';
// Wide: the game montage plays in the band under the caption (1920 x 934 of the 1080 frame), so the games are recorded
// in a window that shape (the page lays itself out for it; nothing is shrunk later). The hook's globe is full frame.
const V = L ? { viewport: { width: 1440, height: 700 }, deviceScaleFactor: 4 / 3, out: [1920, 934] } : { viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, out: [1080, 1920] };
const VH = L ? { ...V, viewport: { width: 1440, height: 810 }, out: [1920, 1080] } : V;
const C = '/tmp/claude-0/demo2/clips';
const br = await chromium.launch(launchOptions({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }, { headless: true }));
const mkCtx = v => br.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, extraHTTPHeaders: { 'x-forwarded-for': '10.7.9.' + (L ? 1 : 2) } });
const ctx = await mkCtx(V);
const p = await ctx.newPage(); p.__name = 'g';
await login(p, 'MayaMakes', 'secret123');
await Capture.install(ctx);
const T = (f, fn, ...a) => f.evaluate(([fn, a]) => window.__brbTest[fn](...a), [fn, a]);
// a game that needs more height than the band gets a wider window of the same shape (shown a little smaller)
const WIDE = { 'word-hunt': 1664, crossword: 1520 };
async function open(slug, pg = p) {
  if (L && pg === p) { const w = WIDE[slug] || V.viewport.width; await pg.setViewportSize({ width: w, height: Math.round(w * V.viewport.height / V.viewport.width) }); }
  await pg.goto(B + '/play/' + slug); await fullGame(pg);
  const f = await gameFrame(pg); const cap = new Capture([pg], `${C}/tmp-${slug}-${orient}`);
  for (let i = 0; i < 900; i++) { await cap.stepAll(33.3); const ok = await f.evaluate(() => { const t = window.__brbTest; if (!t) return false; const s = t.state ? t.state() : {}; return !s || !Object.prototype.hasOwnProperty.call(s, 'ready') || s.ready; }).catch(() => false); if (ok) break; }
  await cap.advance(1200);
  return { f, cap };
}
const out = (cap, name, v = V) => { const r = cap.encode(`${name}-${orient}`, { g: v.out }); console.log('ok', r.g); };
const run = async (name, fn) => { if (only && only !== name) return; await fn(); };

// a cursor on the game, positioned by the controller (the game is the whole window)
const ring = async (cap, at, n = 9) => { await cap.frames(n, i => setCursor(p, at.x, at.y, i / n)); await setCursor(p, at.x, at.y); };
await run('atlas', async () => {
  // The hook: a clean lit globe turning slowly (6.2 s). Lit countries are painted with their flag, which reads as a
  // jumble at this size, so this window gets the game's region colors instead: the flag pictures are left out (the
  // game paints a lit country in its region's color until its flag has loaded). Every country big enough to show is lit
  // (the tiny ones would get a flag on a pole), the side panel is put away and the globe turns on its own.
  const hc = await mkCtx(VH);
  await hc.addInitScript(() => { let v; Object.defineProperty(window, 'AtlasData', { configurable: true, get: () => v, set: x => { if (x && x.FLAG) for (const k in x.FLAG) x.FLAG[k] = 'data:,'; v = x; } }); });
  const hp = await hc.newPage(); hp.__name = 'g';
  await login(hp, 'MayaMakes', 'secret123');
  await hp.goto(B + '/play/atlas-quest'); await fullGame(hp);
  { const f = await gameFrame(hp); await f.waitForFunction(() => window.BRB && window.BRB.storage && window.AtlasData);
    console.log('lit', await f.evaluate(() => { const m = {}; for (const r of window.AtlasData.C) if (r[10] >= 25) m[r[0]] = 3; const s = BRB.storage.get('atlas-quest-v1') || {}; s.m = m; s.intro = 9; BRB.storage.set('atlas-quest-v1', s); return Object.keys(m).length; }));
    await new Promise(r => setTimeout(r, 2000)); }
  await Capture.install(hc);
  const { f, cap } = await open('atlas-quest', hp);
  await T(f, 'home');
  await f.evaluate(() => { document.getElementById('side').style.display = 'none'; dispatchEvent(new Event('resize')); });
  await f.evaluate(() => window.__brbTest.camera({ lat: 18, lng: -4, dist: 3.0 }));
  await cap.advance(1500);
  await cap.seconds(6.2, async i => { await f.evaluate(i => { try { window.__brbTest.camera({ lat: 18 - i * 0.03, lng: -4 + i * 0.22, dist: 3.0 - i * 0.0006 }); } catch {} }, i); });
  out(cap, 'atlas', VH);
  await hc.close();
});
await run('atlasq', async () => {
  // Find it: the cursor taps the country on the globe, it lights up with its flag, then Next flies to the next one
  const { f, cap } = await open('atlas-quest');
  await T(f, 'mode', 'find'); await cap.advance(2200);
  await cursorInit(p); await setCursor(p, V.viewport.width * 0.8, V.viewport.height * 0.85);
  await cap.frames(4);
  const at = await f.evaluate(cc => window.__brbTest.screenOf(cc), await T(f, 'current'));
  const n = 20; const s0 = { x: V.viewport.width * 0.8, y: V.viewport.height * 0.85 };
  await cap.frames(n, i => { const k = (i + 1) / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; return setCursor(p, s0.x + (at.x - s0.x) * e, s0.y + (at.y - s0.y) * e); });
  await T(f, 'answer', true); await ring(cap, at);
  await cap.frames(22);
  const nx = await glide(cap, p, f.locator('button:has-text("Next")').first(), { sec: 0.5, click: false });
  await f.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.getClientRects().length && /^\W*Next\b/.test(b.textContent.trim())); if (b) b.click(); });
  await ring(cap, nx);
  await cap.frames(26);
  out(cap, 'atlasq');
});
await run('wordhunt', async () => {
  // Word Hunt mid-solve: two words dragged out of the grid
  const { f, cap } = await open('word-hunt');
  const st = await T(f, 'start', { difficulty: 'easy', seed: 3953805450 }); await cap.advance(1200);
  await cursorInit(p); await setCursor(p, p.viewportSize().width * 0.75, p.viewportSize().height * 0.85);
  await cap.frames(4);
  const words = st.words.filter(w => w.word.length >= 4).slice(0, 2);
  for (const w of words) {
    const a = await T(f, 'cellCenter', w.start[0], w.start[1]), b = await T(f, 'cellCenter', w.end[0], w.end[1]);
    const from = await p.evaluate(() => window.__cur);
    await cap.frames(12, i => { const k = (i + 1) / 12, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; return setCursor(p, from.x + (a.x - from.x) * e, from.y + (a.y - from.y) * e); });
    // a real drag on the wide screen; on the phone (touch emulation scrolls the page under a mouse drag) the cursor
    // draws the same line and the word is selected through the game's own hook at the end
    const drag = orient === 'land';
    if (drag) { await p.mouse.move(a.x, a.y); await p.mouse.down(); }
    await cap.frames(16, async i => { const k = (i + 1) / 16, x = a.x + (b.x - a.x) * k, y = a.y + (b.y - a.y) * k; if (drag) await p.mouse.move(x, y); await setCursor(p, x, y); });
    if (drag) await p.mouse.up(); else await T(f, 'select', w.start, w.end);
    await ring(cap, b, 8);
    await cap.frames(8);
  }
  await cap.frames(Math.max(0, 96 - cap.n));
  console.log('word hunt found', (await T(f, 'state')).found);
  out(cap, 'wordhunt');
});
await run('crossword', async () => {
  // Crossword: a tap on 1 across and the word typed in, then the next one
  const { f, cap } = await open('crossword');
  await T(f, 'cwSample'); await cap.advance(1200);
  const s = await T(f, 'cwState');
  await cursorInit(p); await setCursor(p, p.viewportSize().width * 0.7, p.viewportSize().height * 0.85);
  await cap.frames(4);
  for (const e of s.answers.filter(e => e.letters.length <= 6).slice(0, 2)) {
    const cell = f.locator(`[data-rc="${e.r},${e.c}"]`).first();
    if (await cell.count()) await glide(cap, p, cell, { sec: 0.4, click: false });
    await T(f, 'cwSelect', e.r, e.c, e.dir); await cap.frames(4);
    for (const ch of e.letters) { await T(f, 'cwType', ch); await cap.frames(4); }
    await cap.frames(6);
  }
  await cap.frames(Math.max(0, 96 - cap.n));
  out(cap, 'crossword');
});
await run('chess', async () => {
  const { f, cap } = await open('castle-clash');
  await T(f, 'start', { mode: 'robot', level: 'pawn' }); await cap.advance(1500);
  // The board is still between moves since the restyle (#570): a cursor drags each move (the robot answers on its own clock).
  const sq = id => f.locator('.sq').nth((8 - +id[1]) * 8 + 'abcdefgh'.indexOf(id[0]));
  await cursorInit(p); await setCursor(p, p.viewportSize().width * 0.7, p.viewportSize().height * 0.85);
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
