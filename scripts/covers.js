// Capture real screenshots of the launch games for their cover art (public/covers/<slug>.jpg).
// Each game runs inside the real sandbox wrapper (frameDocument + FRAME_CSP), is played to a
// good-looking moment, and is photographed at a 3:4 card shape.
//
// Usage: node scripts/covers.js [slug ...]      (default: every game in SEED_GAMES that has a recipe)
// Needs the Playwright Chromium (pre-installed at /opt/pw-browsers in our cloud sandboxes, or `npx playwright install chromium`).
// Google Fonts are fetched with curl (which honours the machine's proxy) so the shots use each game's real fonts.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { frameDocument, FRAME_CSP, SANDBOX } from '../server/services/frame.js';
import { SEED_GAMES } from './seed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'covers');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORTRAIT = { width: 360, height: 480 };
const LANDSCAPE = { width: 640, height: 480 };
const wait = ms => new Promise(r => setTimeout(r, ms));
const hook = f => f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 15000 });

// One recipe per game: viewport + how to reach a moment worth showing on a card.
const RECIPES = {
  'shark-plank': { viewport: PORTRAIT, async prep(f) { await wait(1500); for (const k of ['e', 'a', 't']) { await f.evaluate(l => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().toLowerCase().startsWith(l)); if (b) b.click(); }, k); await wait(350); } await wait(900); } },
  'ring-rumble': { viewport: LANDSCAPE, async prep(f, page) {
    await wait(800); await f.click('#go1'); await wait(500);
    const cards = await f.$$('#grid .card'); if (cards[0]) await cards[0].click(); await wait(2200);
    await f.evaluate(() => window.__brbTest && window.__brbTest.skipVS && window.__brbTest.skipVS()); await wait(2600);
    for (const k of ['KeyD', 'KeyD', 'KeyF', 'KeyG', 'KeyF']) { await page.keyboard.down(k); await wait(160); await page.keyboard.up(k); }
    await wait(250);
  } },
  'footy-tycoon': { viewport: { width: 540, height: 720 }, async prep(f) { await wait(900); await f.click('#start'); await wait(1600); await f.evaluate(() => { scrollTo(0, 0); document.scrollingElement.scrollTop = 0; }); await wait(300); } },
  'connect-four': { viewport: PORTRAIT, async prep(f) {
    await hook(f); await f.evaluate(() => window.__brbTest.start({ mode: 'two' })); await f.evaluate(() => window.__brbTest.skipAnimations && window.__brbTest.skipAnimations());
    for (const c of [3, 3, 2, 4, 4, 2, 5, 1, 3, 4]) await f.evaluate(c => window.__brbTest.drop(c), c);
    await wait(800);
  } },
  'happy-putt': { viewport: PORTRAIT, async prep(f) { await hook(f); await f.evaluate(() => window.__brbTest.start({ players: 1 })); await f.evaluate(() => { window.__brbTest.skipAnimations(); window.__brbTest.loadHole(3); }); await wait(1800); } },
  'castle-clash': { viewport: PORTRAIT, async prep(f) {
    await hook(f); await f.evaluate(() => window.__brbTest.start({ mode: 'two' })); await f.evaluate(() => window.__brbTest.skipAnimations && window.__brbTest.skipAnimations());
    for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'c3', 'Nf6']) await f.evaluate(m => window.__brbTest.move(m), m);
    await wait(900);
  } },
  'brick-drop': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f); await f.evaluate(() => window.__brbTest.start({ mode: 'marathon', seed: 7 }));
    await f.evaluate(() => {
      const t = window.__brbTest; t.skipAnimations(); t.step(3000);
      // A colourful half-built stack with a gap for the falling piece (ids 1-7 are the brick colours).
      const rows = Array.from({ length: 20 }, () => Array(10).fill(0));
      const stack = ['0000000000', '0000000000', '0000000000', '0000000000', '0000000000', '0000000000', '0000000000', '0000000000', '0000000000', '0000000000',
        '0000000000', '0000000000', '0000000660', '1000006660', '1100055670', '1130755677', '2233775447', '2233370444', '6611177420', '6651174422'];
      stack.forEach((r, y) => [...r].forEach((c, x) => { rows[y][x] = +c; }));
      t.setBoard(rows); t.setQueue(['I', 'T', 'O', 'L']); t.step(200);
      for (let i = 0; i < 6; i++) t.step(160);
    });
    await wait(2500); // let the Go! banner fade
  } },
  'munch-maze': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f);
    await f.evaluate(() => {
      // All four Gloops out, the bottom dots eaten, a bonus snack showing (sequence from the game's builder).
      const T = window.__brbTest;
      T.start({ mode: 'classic', seed: 7, maze: 'candy' });
      T.manual(true); T.skipAnimations(true); T.step(20); T.skipAnimations(false);
      const rows = T.maze();
      for (let y = 21; y <= 29; y++) for (let x = 1; x <= 26; x++) if (rows[y][x] === '.') { T.placeMunch(x, y); T.step(9); }
      T.placeMunch(10, 20); T.input('right');
      T.placeGloop('Zippy', 17, 20, 'left'); T.placeGloop('Sneaky', 6, 23, 'up');
      T.placeGloop('Tricky', 22, 24, 'left'); T.placeGloop('Dozy', 15, 26, 'right');
      T.step(60);
    });
    await wait(900);
  } },
  'word-peek': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f);
    await f.evaluate(() => {
      const t = window.__brbTest;   // three coloured rows with CR being typed in the fourth
      t.skipAnimations(true); t.start({ mode: 'practice', answer: 'crane' });
      t.guess('stare'); t.guess('plant'); t.guess('cream');
      t.skipAnimations(false); t.type('cr');
    });
    await wait(1600);
  } },
  'swish-flick': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f);
    await f.evaluate(() => { const T = window.__brbTest; T.start({ mode: 'arcade', seed: 7 }); T.skipAnimations(); for (let i = 0; i < 5; i++) { T.step(300); T.flick(T.solve()); T.step(1600); } });
    await wait(1700);   // let the last "Swish! +2" fade off the board
    await f.evaluate(() => { const T = window.__brbTest; T.flick(T.solve()); T.step(260); T.freeze(true); });   // flaming ball rising toward the hoop, LED shows 5
    await wait(600);
  } },
  'loop-lab': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f);
    await f.evaluate(() => {   // a rainbow melody line playing, with the characters bopping
      const T = window.__brbTest; T.start({ template: 'pop' }); T.stop(); T.kit('melody', 'marimba');
      [0, 2, 4, 5, 7, 9, 8, 7, 5, 4, 2, 4, 5, 7, 9, 7].forEach((d, s) => { if (T.state().notes.melody[s] !== d) T.toggle('melody', d, s); });
      T.setTempo(112); T.tab('melody'); T.play();
    });
    await wait(2900);   // let the "New sticker" toast fade
  } },
  'beat-lanes': { viewport: PORTRAIT, touch: true, async prep(f) {
    await hook(f);
    await f.evaluate(() => {   // mid-song on Hard: notes on the highway, a big combo and sparks
      const t = window.__brbTest; t.skipAnimations(true);
      t.start({ song: 'robot', difficulty: 'hard' }); t.manual(true); t.autoplay(true);
      t.step(48000); t.step(700);
    });
    await wait(500);
  } },
  'word-hunt': { viewport: PORTRAIT, async prep(f) {
    await hook(f); await f.evaluate(() => window.__brbTest.start({ theme: 'Space', difficulty: 'medium', seed: 3 }));
    await f.evaluate(() => { const t = window.__brbTest; t.skipAnimations && t.skipAnimations(); const s = t.state(); s.words.slice(0, 4).forEach(w => t.select(w.start, w.end)); });
    await wait(900);
  } },
  'sum-racer': { viewport: PORTRAIT, async prep(f) {
    await hook(f); await f.evaluate(() => window.__brbTest.start({ track: 2, mode: 'choice', players: 1, seed: 5 }));
    await f.evaluate(() => window.__brbTest.skipAnimations && window.__brbTest.skipAnimations());
    for (let i = 0; i < 4; i++) { await f.evaluate(() => { const t = window.__brbTest; t.answer(t.state().question.answer); t.step && t.step(900); }); }
    await wait(900);
  } },
};

async function capture(browser, slug) {
  const htmlPath = path.join(ROOT, 'seed-games', `${slug}.html`);
  if (!fs.existsSync(htmlPath)) return console.log(`- ${slug}: no game file, skipped`);
  const recipe = RECIPES[slug];
  if (!recipe) return console.log(`- ${slug}: no recipe, skipped`);
  const doc = frameDocument(fs.readFileSync(htmlPath, 'utf8'), { user: { displayName: 'Player', avatar: '🦊', isGuest: false }, game: { id: slug, title: slug }, save: {}, canSave: false, preview: true });
  const srv = http.createServer((q, r) => {
    if (q.url.startsWith('/g')) { r.setHeader('Content-Security-Policy', FRAME_CSP); r.setHeader('Content-Type', 'text/html; charset=utf-8'); return r.end(doc); }
    r.setHeader('Content-Type', 'text/html; charset=utf-8');
    r.end(`<!doctype html><style>html,body{margin:0;height:100%;background:#000}iframe{width:100%;height:100%;border:0;display:block}</style><iframe sandbox="${SANDBOX}" src="/g"></iframe>`);
  });
  await new Promise(r => srv.listen(0, r));
  const ctx = await browser.newContext({ viewport: recipe.viewport, deviceScaleFactor: 1.5, reducedMotion: 'no-preference', ...(recipe.touch ? { hasTouch: true } : {}) });
  const page = await ctx.newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
    try {
      const body = execFileSync('curl', ['-s', '-L', '-A', 'Mozilla/5.0 Chrome/140', route.request().url()], { maxBuffer: 8e6 });
      const ct = /gstatic/.test(route.request().url()) ? 'font/woff2' : 'text/css';
      route.fulfill({ status: 200, body, headers: { 'content-type': ct, 'access-control-allow-origin': '*' } });
    } catch { route.abort(); }
  });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto(`http://127.0.0.1:${srv.address().port}/`);
    await page.waitForTimeout(700);
    const f = page.frames().find(x => x.url().includes('/g'));
    await recipe.prep(f, page);
    fs.mkdirSync(OUT, { recursive: true });
    const file = path.join(OUT, `${slug}.jpg`);
    await page.screenshot({ path: file, type: 'jpeg', quality: 78 });
    console.log(`✓ ${slug}: ${path.relative(ROOT, file)} (${Math.round(fs.statSync(file).size / 1024)} KB)${errors.length ? '  page errors: ' + errors.join('; ') : ''}`);
  } catch (e) {
    console.log(`✗ ${slug}: ${e.message.split('\n')[0]}`);
  } finally { await ctx.close(); srv.close(); }
}

const wanted = process.argv.slice(2).length ? process.argv.slice(2) : SEED_GAMES;
const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
for (const slug of wanted) await capture(browser, slug);
await browser.close();
