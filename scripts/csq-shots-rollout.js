// CS Quest slide pictures — rollout captures (all worlds beyond the Robo Route Unit 1 pilot).
// Companion to scripts/csq-shots.js: same sandbox-frame + __brbTest pattern, generalised to every
// CS Quest game. Shot table lives in scripts/csq-rollout-spec.json (state, chapter, band, level, actions).
// Usage: node scripts/csq-shots-rollout.js [--out <masters-root>] [--webp] [game ...]
//   masters (PNG 1280x720) go to <masters-root>/<game>/<state>.png; --webp also writes
//   public/img/csq/<game>/<state>.webp (WebP q80, max 1280 wide). Seed 7 everywhere.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { frameDocument, frameCsp, SANDBOX } from '../server/services/frame.js';
import { vendorFile } from '../server/services/snapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const wait = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUTROOT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'scripts', 'csq-masters');
const WEBP = args.includes('--webp');
const gamesWanted = args.filter(a => !a.startsWith('--') && a !== (outIdx >= 0 ? args[outIdx + 1] : null));
const ALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'csq-rollout-spec.json'), 'utf8'));
const shots = ALL.filter(s => !gamesWanted.length || gamesWanted.includes(s.game));
if (!shots.length) { console.error('no shots matched'); process.exit(1); }

async function runGame(browser, slug, list) {
  const doc = frameDocument(fs.readFileSync(path.join(ROOT, 'seed-games', `${slug}.html`), 'utf8'), { user: { displayName: 'Player', avatar: '🦊', isGuest: false }, game: { id: slug, title: slug }, save: {}, canSave: false, preview: true });
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
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
  await page.route(/fonts\.(googleapis|gstatic)\.com/, route => {
    try { const body = execFileSync('curl', ['-s', '-L', '-A', 'Mozilla/5.0 Chrome/140', route.request().url()], { maxBuffer: 8e6 }); route.fulfill({ status: 200, body, headers: { 'content-type': /gstatic/.test(route.request().url()) ? 'font/woff2' : 'text/css', 'access-control-allow-origin': '*' } }); } catch { route.abort(); }
  });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${srv.address().port}/`);
  await page.waitForTimeout(900);
  const f = page.frames().find(x => x.url().includes('/g'));
  await f.waitForFunction(() => window.__brbTest && window.__brbTest.state, null, { timeout: 30000 });
  const frameEl = await page.$('iframe');
  const outDir = path.join(OUTROOT, slug); fs.mkdirSync(outDir, { recursive: true });

  for (const s of list) {
    try {
      await f.evaluate(async (s) => {
        const T = window.__brbTest; const wait = ms => new Promise(r => setTimeout(r, ms));
        T.skipAnimations && T.skipAnimations();
        const mode = s.actions.find(a => a.mode) || {};
        if (s.game === 'would-you-rather') {
          const topics = (s.actions.find(a => a.topics) || {}).topics || [s.chapter];
          T.start('alone', { topics, count: 6 });
        } else if (s.game === 'robo-route') {
          const m = s.chapter === 'debug' ? 'debug' : s.chapter === 'level-maker' ? 'maker' : 'play';
          T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, mode: m });
          await wait(500); T.closeModal(); await wait(300);
          const st = T.state(); if (st.planDone === false) { T.plan(); await wait(800); T.closeModal(); await wait(300); }
        } else if (s.game === 'data-detective') {
          T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, mode: mode.mode || 'play' });
          await wait(500); T.closeDialog && T.closeDialog(); await wait(300);
        } else if (s.game === 'packet-post') {
          T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7 });
          await wait(500); T.closeCards && T.closeCards(); await wait(300);
        } else { // inside-the-machine: start() skips the learn card by default
          T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7 });
          await wait(500);
        }
        for (const a of s.actions) {
          if (a.mode || a.topics) continue;
          if (a.steps) { for (let i = 0; i < a.steps; i++) { T.stepOnce(); await wait(130); } }
          else if (a.program) T.program(a.program);
          else if (a.solve && s.game === 'robo-route') { await T.solve(); await wait(400); }
          else if (a.solve && s.game === 'data-detective') { T.solve(); await wait(600); }
          else if (a.closeModal) { if (T.closeModal) T.closeModal(); else if (T.closeDialog) T.closeDialog(); await wait(300); }
          else if (a.test != null) { T.test(a.test); await wait(300); }
          else if (a.mkRows) { T.mkRows(a.mkRows); await wait(300); }
          else if (a.mkCheck) { T.mkCheck(); await wait(300); }
          else if (a.mkTest) { await T.mkTest(); await wait(400); }
          else if (a.tester) { T.tester(a.tester[0], a.tester[1]); await wait(400); }
          else if (a.act) { T.act(a.act); await wait(400); }
          else if (a.acts && s.game === 'data-detective') { for (const x of a.acts) { T.act(x); await wait(350); } }
          else if (a.acts && s.game === 'packet-post') { for (let i = 0; i < a.acts; i++) { const adv = T.advice(); if (!adv) break; await T.act(adv); await wait(350); } }
          else if (a.claimCard) { T.claimCard(); await wait(400); }
          else if (a.tap) { T.tap(a.tap); await wait(350); }
          else if (a.clickAria) { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label') || '') === a.clickAria); if (b) b.click(); await wait(350); }
          else if (a.pick) { T.pick(a.pick); await wait(500); }
          else if (a.next) { T.next(); await wait(400); }
          else if (a.ready) { T.ready(); await wait(400); }
          await wait(120);
        }
      }, s);
      await wait(400);
      const st = await f.evaluate(() => { const x = window.__brbTest.state(); return { levelId: x.levelId, chapter: x.chapter, screen: x.screen }; }).catch(() => ({}));
      const file = path.join(outDir, `${s.state}.png`);
      await frameEl.screenshot({ path: file });
      let extra = '';
      if (WEBP) {
        const dest = path.join(ROOT, 'public', 'img', 'csq', slug, `${s.state}.webp`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '80', dest]);
        extra = ` -> ${Math.round(fs.statSync(dest).size / 1024)} KB`;
      }
      console.log(`✓ ${slug}/${s.state}: level ${st.levelId} chapter ${st.chapter}${extra}`);
    } catch (e) { console.log(`✗ ${slug}/${s.state}: ${e.message.split('\n')[0]}`); }
  }
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 3).join('; '));
  await page.close(); srv.close();
}

const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const byGame = {}; for (const s of shots) (byGame[s.game] = byGame[s.game] || []).push(s);
for (const [slug, list] of Object.entries(byGame)) await runGame(browser, slug, list);
await browser.close();
