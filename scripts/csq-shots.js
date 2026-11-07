// CS Quest slide pictures: capture the in-game screenshots the course slides will carry (the image plan, pilot:
// Robo Route, Unit 1). Each shot drives the real game inside the sandbox wrapper (the covers.js pattern) with the
// game's own test hooks (window.__brbTest.start / program / stepOnce), so every state is deterministic and
// re-runnable when a game changes: seed 7 everywhere unless a shot says otherwise.
//
// Usage: node scripts/csq-shots.js [--out <masters-dir>] [--webp] [--scale 2] [shot-key ...]
//   masters (PNG, 1280x720) go to --out (default scripts/csq-masters/robo-route);
//   --webp also converts each master to public/img/csq/robo-route/<state>.webp (WebP q80, max 1280 wide).
//   --scale 2 photographs at device scale 2 (a 2560x1440 picture of the same 1280x720 layout): for a picture a
//   slide crops very narrow (one panel of a split), so it stays crisp on a laptop. Views, focus boxes and the
//   recorded geometry stay in % of the frame, so they are the same at either scale.
// Needs the Playwright Chromium (`npx playwright install chromium`).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { frameDocument, frameCsp, SANDBOX } from '../server/services/frame.js';
import { vendorFile } from '../server/services/snapshot.js';

// --geometry <file>: also record each Robo Route shot's board as it stands in the picture (cell grid in % of the
// 1280x720 frame, the cells, start, goal, items and Bolt) so slide paths can be generated and checked
// (scripts/csq-route-check.js). Merged into the file by image key.
const BOARD_GEOMETRY = () => {
  const pct = r => [r.left / 12.8, r.top / 7.2, r.width / 12.8, r.height / 7.2].map(v => +v.toFixed(2));
  const shown = e => { const r = e.getBoundingClientRect(); return e.offsetParent && r.width > 0 && r.bottom > 0 && r.top < 720 && !e.closest('[hidden]'); };
  // the parts a slide's focus box can name: program blocks, shelf, pills, watch strip, test tabs, buttons
  const ui = [...document.querySelectorAll('#game .rr-blk, #game .rr-pill, #game .rr-watch > *, #game .ok-btn, #game .rr-task, #game .rr-verdict, #modal .rr-tile2, .ok-ui .ok-banner')]
    .filter(shown).map(e => ({ t: (e.getAttribute('aria-label') || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60), c: e.className.split(' ').filter(c => /^rr-|^ok-(btn|hot|go|quiet)$/.test(c)).slice(0, 3).join('.'), r: pct(e.getBoundingClientRect()) }));
  const grid = document.querySelector('#grid');
  if (!grid || !shown(grid) || !grid.children.length) return { ui };
  const kids = [...grid.children], w = Math.max(...kids.map(c => +c.dataset.x)) + 1, h = Math.max(...kids.map(c => +c.dataset.y)) + 1;
  const a = pct(kids[0].getBoundingClientRect()), z = pct(kids[kids.length - 1].getBoundingClientRect());
  const code = c => (c.classList.contains('goal') ? 'G' : c.classList.contains('wall') ? '#' : c.classList.contains('water') ? '~' : c.classList.contains('paint') ? 'P' : c.classList.contains('plate') ? 'B' : c.classList.contains('door') ? 'D' : c.querySelector('.it[data-item]:not(.gone)') ? '*' : '.');
  const rows = []; for (let y = 0; y < h; y++) rows.push(kids.filter(c => +c.dataset.y === y).sort((p, q) => p.dataset.x - q.dataset.x).map(code).join(''));
  const st = window.__brbTest.state();
  return { level: st.levelId, band: st.band, layout: st.layout, w, h, rows, bolt: st.bolt,
    cell: { x0: a[0], y0: a[1], w: a[2], h: a[3], dx: w > 1 ? +((z[0] - a[0]) / (w - 1)).toFixed(3) : a[2], dy: h > 1 ? +((z[1] - a[1]) / (h - 1)).toFixed(3) : a[3] }, ui };
};
function saveGeometry(file, all) {
  const old = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  Object.assign(old, all);
  const sorted = Object.fromEntries(Object.keys(old).sort().map(k => [k, old[k]]));
  fs.writeFileSync(file, JSON.stringify(sorted, null, 1) + '\n');
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SLUG = 'robo-route';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = ms => new Promise(r => setTimeout(r, ms));

// The pilot shot table: one row per unique capture. Decks point at these keys; mission slides reuse their
// chapter's key shot. level = the 1-based level inside chapter+band (levelsFor order). program = the game's
// own block language (the level's solution unless the shot says otherwise). steps = stepOnce calls after the
// program is built. keepPlanCard = photograph the plan card itself (the pseudocode IS the teaching element).
const SHOTS = [
  // ---- 1.1 Sequences, Explorer (chapter sequences, levels seq-1..seq-6)
  { key: 'sequences-1b-key', chapter: 'sequences', band: '1b', level: 1 },
  { key: 'sequences-1b-turn-then-move', chapter: 'sequences', band: '1b', level: 5, program: 'right; move; move; move; move; left; move; move; move' },
  { key: 'sequences-1b-turn-in-place', chapter: 'sequences', band: '1b', level: 2, program: 'move; move; move; move; left; move; move', steps: 5 },
  { key: 'sequences-1b-better-route', chapter: 'best-route', band: '1b', level: 1, route: 0 },
  // ---- 1.1 Sequences, Pro (seq-1 pro, seq-2 pro, seq-3p, seq-4p, seq-5 pro, seq-6 pro)
  { key: 'sequences-2-key', chapter: 'sequences', band: '2', level: 1 },
  { key: 'sequences-2-plan-lines', chapter: 'sequences', band: '2', level: 3, keepPlanCard: true },
  { key: 'sequences-2-plan-to-blocks', chapter: 'sequences', band: '2', level: 3, program: 'move; move; move; move; pick; move; left; move; move; move; move; move; pick; left; move; move; move; left; move; move; move' },
  { key: 'sequences-2-compare-routes', chapter: 'sequences', band: '2', level: 5 },
  // ---- 1.2 Loops, Explorer (loop-1..loop-7)
  { key: 'loops-1b-repeat-bracket', chapter: 'loops', band: '1b', level: 1, program: 'repeat 5 { move }' },
  { key: 'loops-1b-repeat-number', chapter: 'loops', band: '1b', level: 3, program: 'repeat 2 { move; move; pick }; move' },
  { key: 'loops-1b-turn-inside', chapter: 'loops', band: '1b', level: 1, program: 'repeat 5 { right }' },
  // ---- 1.2 Loops, Pro (loop-1 pro, loop-2p, loop-3 pro, loop-4 pro, loop-5p..loop-8p)
  { key: 'loops-2-key', chapter: 'loops', band: '2', level: 1, program: 'repeat 7 { move }' },
  { key: 'loops-2-nested', chapter: 'loops', band: '2', level: 8, program: 'repeat 3 { repeat 3 { move }; right }; repeat 2 { move }' },
  { key: 'loops-2-staircase', chapter: 'loops', band: '2', level: 5, program: 'repeat 3 { repeat 2 { move }; right; move; left }' },
  { key: 'loops-2-predict', chapter: 'loops', band: '2', level: 7, program: 'repeat 3 { repeat 2 { move; pick }; right; move; left }' },
  // ---- 1.3 Conditionals, Explorer (cond-1..cond-7; cond-1 has the fog)
  { key: 'conditionals-1b-fog', chapter: 'conditionals', band: '1b', level: 1 },
  { key: 'conditionals-1b-if-else', chapter: 'conditionals', band: '1b', level: 1, program: 'if path { move } else { left }' },
  { key: 'conditionals-1b-fog-proof', chapter: 'conditionals', band: '1b', level: 3, program: 'repeat until goal { if path { move } else { left } }' },
  { key: 'conditionals-1b-when', chapter: 'conditionals', band: '1b', level: 2, program: 'when gem { right }; repeat 8 { move; if gem { pick } }' },
  // ---- 1.3 Conditionals, Pro (cond-1 pro, cond-2, cond-3, cond-4p..cond-7p)
  { key: 'conditionals-2-decide', chapter: 'conditionals', band: '2', level: 3, program: 'repeat until goal { if path { move } else { left } }' },
  { key: 'conditionals-2-when-if', chapter: 'conditionals', band: '2', level: 2, program: 'when gem { right }; repeat 11 { move; if gem { pick } }' },
  { key: 'conditionals-2-and', chapter: 'conditionals', band: '2', level: 4, program: 'repeat until goal { if wall and gem { pick; right } else { if wall { left } else { move } } }' },
  { key: 'conditionals-2-or-not', chapter: 'conditionals', band: '2', level: 5, program: 'repeat until goal { move; if not path or paint { right } }' },
  { key: 'conditionals-2-key', chapter: 'conditionals', band: '2', level: 6 },
  { key: 'conditionals-2-any-maze', chapter: 'conditionals', band: '2', level: 6, program: 'repeat until goal { if path { move } else { right } }' },
  // ---- 1.4 Variables, Explorer (var-1..var-6)
  { key: 'variables-1b-key', chapter: 'variables', band: '1b', level: 2 },
  { key: 'variables-1b-named-box', chapter: 'variables', band: '1b', level: 1, program: 'set count 0; repeat 5 { move; pick; change count 1 }; right; move; move' },
  { key: 'variables-1b-set-change', chapter: 'variables', band: '1b', level: 3, program: 'set steps 4; repeat 4 { change steps -1; move }; move', steps: 5 },
  { key: 'variables-1b-counting-gems', chapter: 'variables', band: '1b', level: 1, program: 'set count 0; repeat 5 { move; pick; change count 1 }; right; move; move', steps: 7 },
  // ---- 1.4 Variables, Pro (var-1 pro, var-2, var-3 pro, var-4p..var-6p)
  { key: 'variables-2-watch-value', chapter: 'variables', band: '2', level: 3, program: 'set steps 6; repeat 6 { change steps -1; move }; move', steps: 5 },
  // ---- 1.5 Functions, Explorer (fn-1..fn-6; starters load on their own where a shot has no program)
  { key: 'functions-1b-key', chapter: 'functions', band: '1b', level: 1, clear: true },
  { key: 'functions-1b-my-block', chapter: 'functions', band: '1b', level: 1, program: 'proc Stair { move; pick; right; move; left }' },
  { key: 'functions-1b-defined-not-called', chapter: 'functions', band: '1b', level: 2, program: 'proc Side { move; move; move; right }' },
  { key: 'functions-1b-remix-credit', chapter: 'functions', band: '1b', level: 4 },
  // ---- 1.5 Functions, Pro (fn-1 pro, fn-2 pro, fn-3p..fn-7p)
  { key: 'functions-2-key', chapter: 'functions', band: '2', level: 7 },
  { key: 'functions-2-parameter', chapter: 'functions', band: '2', level: 4, program: 'proc Dash(n) { repeat n { move }; right }; call Dash(7); call Dash(6); call Dash(5); call Dash(4); call Dash(3)' },
  { key: 'functions-2-three-rooms', chapter: 'functions', band: '2', level: 3, program: 'proc Room(steps) { move; left; repeat steps { move }; pick; right; right; repeat steps { move }; left; move }; call Room(1); call Room(3); call Room(2); move' },
  { key: 'functions-2-subgoals', chapter: 'functions', band: '2', level: 5, program: 'proc GetGems { repeat 3 { move; pick } }; proc Climb { repeat 3 { left; move; right; move } }; proc Cross { left; repeat 4 { move } }; call GetGems; call Climb; call Cross' },
  { key: 'functions-2-notes-credit', chapter: 'functions', band: '2', level: 6, program: 'proc Sweep chip collect { repeat 3 { move; pick; move } }; proc Drop chip down { right; repeat 7 { move } }; proc Home chip home { right; repeat 5 { move } }; call Sweep; call Drop; call Home' },
];

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'scripts', 'csq-masters', SLUG);
const WEBP = args.includes('--webp');
const scaleIdx = args.indexOf('--scale');
const SCALE = scaleIdx >= 0 ? Math.max(1, Math.min(3, +args[scaleIdx + 1] || 1)) : 1;
const geoIdx = args.indexOf('--geometry');
const GEOFILE = geoIdx >= 0 ? path.resolve(args[geoIdx + 1]) : null;
const geometry = {};
const wanted = args.filter(a => !a.startsWith('--') && a !== (outIdx >= 0 ? args[outIdx + 1] : null) && a !== (geoIdx >= 0 ? args[geoIdx + 1] : null) && a !== (scaleIdx >= 0 ? args[scaleIdx + 1] : null));
const shots = wanted.length ? SHOTS.filter(s => wanted.includes(s.key)) : SHOTS;
if (!shots.length) { console.error('no shots matched'); process.exit(1); }

const doc = frameDocument(fs.readFileSync(path.join(ROOT, 'seed-games', `${SLUG}.html`), 'utf8'), { user: { displayName: 'Player', avatar: '🦊', isGuest: false }, game: { id: SLUG, title: SLUG }, save: {}, canSave: false, preview: true });
const srv = http.createServer((q, r) => {
  const origin = `http://127.0.0.1:${srv.address().port}`;
  if (q.url.startsWith('/g')) { r.setHeader('Content-Security-Policy', frameCsp(origin)); r.setHeader('Content-Type', 'text/html; charset=utf-8'); return r.end(doc); }
  if (q.url.startsWith('/vendor/')) {
    const f = vendorFile(origin + q.url.split('?')[0]);
    if (!f) { r.statusCode = 404; return r.end(); }
    r.setHeader('Content-Type', f.endsWith('.js') ? 'text/javascript; charset=utf-8' : f.endsWith('.woff2') ? 'font/woff2' : 'text/plain; charset=utf-8');
    r.setHeader('Access-Control-Allow-Origin', '*'); r.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    return r.end(fs.readFileSync(f));
  }
  r.setHeader('Content-Type', 'text/html; charset=utf-8');
  r.end(`<!doctype html><style>html,body{margin:0;height:100%;background:#000}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${SANDBOX}" src="/g"></iframe>`);
});
await new Promise(r => srv.listen(0, r));
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: SCALE });
const page = await ctx.newPage();
await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
  try {
    const body = execFileSync('curl', ['-s', '-L', '-A', 'Mozilla/5.0 Chrome/140', route.request().url()], { maxBuffer: 8e6 });
    route.fulfill({ status: 200, body, headers: { 'content-type': /gstatic/.test(route.request().url()) ? 'font/woff2' : 'text/css', 'access-control-allow-origin': '*' } });
  } catch { route.abort(); }
});
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${srv.address().port}/`);
await page.waitForTimeout(800);
const f = page.frames().find(x => x.url().includes('/g'));
await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state().ready, null, { timeout: 30000 });
fs.mkdirSync(OUT, { recursive: true });
const frameEl = await page.$('iframe');

for (const s of shots) {
  try {
    await f.evaluate(s => { window.__brbTest.skipAnimations(); window.__brbTest.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, lock: false }); }, s);
    await wait(600);
    // Close the learn card (which may hand over to the plan card); complete the plan unless the plan card IS the shot.
    await f.evaluate(() => window.__brbTest.closeModal());
    await wait(300);
    if (!s.keepPlanCard) {
      const st = await f.evaluate(() => window.__brbTest.state());
      if (st.planDone === false) { await f.evaluate(() => window.__brbTest.plan()); await wait(900); await f.evaluate(() => window.__brbTest.closeModal()); await wait(300); }
      if (s.clear) await f.evaluate(() => window.__brbTest.program([]));
      if (s.program) await f.evaluate(p => window.__brbTest.program(p), s.program);
      if (s.route != null) await f.evaluate(i => { try { window.__brbTest.previewRoute(i); } catch { /* the compare screen itself is the shot */ } }, s.route);
      for (let i = 0; i < (s.steps || 0); i++) { await f.evaluate(() => window.__brbTest.stepOnce()); await wait(130); }
    }
    await wait(400);
    const st = await f.evaluate(() => window.__brbTest.state());
    if (GEOFILE) geometry[`csq/${SLUG}/${s.key}`] = Object.assign({ shot: { chapter: s.chapter, band: s.band, level: s.level, program: s.program || null, steps: s.steps || 0 } }, await f.evaluate(`(${BOARD_GEOMETRY})()`));
    const file = path.join(OUT, `${s.key}.png`);
    await frameEl.screenshot({ path: file });
    let extra = '';
    if (WEBP) {
      const dest = path.join(ROOT, 'public', 'img', 'csq', SLUG, `${s.key}.webp`);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', `scale='min(${1280 * SCALE},iw)':-2`, '-c:v', 'libwebp', '-quality', SCALE > 1 ? '72' : '80', dest]);
      extra = ` -> public/img/csq/${SLUG}/${s.key}.webp (${Math.round(fs.statSync(dest).size / 1024)} KB)`;
    }
    console.log(`✓ ${s.key}: ${st.levelId} band ${st.band} blocks ${st.blocks} card ${st.card}${extra}`);
  } catch (e) {
    console.log(`✗ ${s.key}: ${e.message.split('\n')[0]}`);
  }
}
if (GEOFILE) saveGeometry(GEOFILE, geometry);
if (errors.length) console.log('page errors:', [...new Set(errors)].join('; '));
await browser.close(); srv.close();
