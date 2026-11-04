// Cyber Defenders slide pictures — captures for the Phase 1.5 list (Packet Post and Would You Rather states
// the CS Quest rollout never shot). Same sandbox-frame + __brbTest pattern as scripts/csq-shots-rollout.js:
// deterministic starts, seed 7, 1280x720 masters -> WebP q80. Shot table: scripts/cyber-shots-spec.json.
// Would You Rather has no seed: its dilemma order is shuffled, so a shot names the dilemma it wants and the
// driver plays through the round until that dilemma is on screen, then shoots it before answering.
// Usage: node scripts/cyber-shots.js [--out <masters-root>] [--webp] [--manifest] [--only state,state] [game ...]
//   masters (PNG 1280x720) go to <masters-root>/<game>/<state>.png (default scripts/cyber-masters);
//   --webp also writes public/img/csq/<game>/<state>.webp; --manifest registers the spec's new states in
//   public/img/csq/manifest.json (existing keys are never touched).
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
const OUTROOT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'scripts', 'cyber-masters');
const WEBP = args.includes('--webp');
const MANIFEST = args.includes('--manifest');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const gamesWanted = args.filter(a => !a.startsWith('--') && a !== (outIdx >= 0 ? args[outIdx + 1] : null) && a !== (onlyIdx >= 0 ? args[onlyIdx + 1] : null));
const ALL = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'cyber-shots-spec.json'), 'utf8'));
const shots = ALL.filter(s => (!gamesWanted.length || gamesWanted.includes(s.game)) && (!ONLY || ONLY.has(s.state)));
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
      const seen = await f.evaluate(async (s) => {
        const T = window.__brbTest; const wait = ms => new Promise(r => setTimeout(r, ms));
        T.skipAnimations && T.skipAnimations();
        if (s.title) { await wait(600); return { screen: 'title' }; }
        if (s.game === 'would-you-rather') {
          T.start('alone', { topics: ['online'], count: 10 });
          await wait(600);
          for (let i = 0; i < 12; i++) {
            const st = T.state();
            if (st.cur === s.dilemma) return { levelId: st.cur, chapter: 'online', screen: st.screen };
            T.pick('a'); await wait(350); T.next(); await wait(450);
          }
          const st = T.state(); return { levelId: st.cur, chapter: 'online', screen: st.screen, missed: st.cur !== s.dilemma };
        }
        T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7 });
        await wait(500);
        if (s.cards !== 'open' && T.closeCards) { T.closeCards(); await wait(300); }
        for (const a of s.actions) {
          if (a.acts) { for (let i = 0; i < a.acts; i++) { const adv = T.advice(); if (!adv) break; await T.act(adv); await wait(350); } }
          else if (a.solve) { T.solve(); await wait(800); }
          await wait(120);
        }
        const st = T.state(); return { levelId: st.levelId, chapter: st.chapter, screen: st.screen };
      }, s);
      await wait(400);
      const file = path.join(outDir, `${s.state}.png`);
      await frameEl.screenshot({ path: file });
      let extra = '';
      if (WEBP) {
        const dest = path.join(ROOT, 'public', 'img', 'csq', slug, `${s.state}.webp`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '80', dest]);
        extra = ` -> ${Math.round(fs.statSync(dest).size / 1024)} KB`;
      }
      console.log(`✓ ${slug}/${s.state}: level ${seen.levelId} chapter ${seen.chapter}${seen.missed ? ' ⚠ DILEMMA MISSED' : ''}${extra}`);
    } catch (e) { console.log(`✗ ${slug}/${s.state}: ${e.message.split('\n')[0]}`); }
  }
  if (errors.length) console.log('page errors:', [...new Set(errors)].slice(0, 3).join('; '));
  await page.close(); srv.close();
}

const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const byGame = {}; for (const s of shots) (byGame[s.game] = byGame[s.game] || []).push(s);
for (const [slug, list] of Object.entries(byGame)) await runGame(browser, slug, list);
await browser.close();

if (MANIFEST) {
  const mp = path.join(ROOT, 'public', 'img', 'csq', 'manifest.json');
  const man = JSON.parse(fs.readFileSync(mp, 'utf8'));
  const have = new Set(man.images.map(e => e.key));
  const commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: ROOT }).toString().trim();
  let added = 0;
  for (const s of ALL) {
    const key = `csq/${s.game}/${s.state}`;
    if (have.has(key)) continue;
    man.images.push({ key, game: s.game, chapter: s.chapter, band: s.band, state: s.state, concept: s.concept, alt: s.alt, capturedAt: new Date().toISOString().slice(0, 10), commit });
    added++;
  }
  man.images.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  fs.writeFileSync(mp, JSON.stringify(man, null, 1) + '\n');
  console.log(`manifest: ${added} new entries (${man.images.length} total)`);
}
