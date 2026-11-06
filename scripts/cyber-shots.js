// Cyber Defenders slide pictures — captures for the Phase 1.5 list (Packet Post and Would You Rather states
// the CS Quest rollout never shot), extended in Phase 2 for Trick Inbox and Escape the Post Office states.
// Same sandbox-frame + __brbTest pattern as scripts/csq-shots-rollout.js:
// deterministic starts, seed 7, 1280x720 masters -> WebP q80. Shot table: scripts/cyber-shots-spec.json.
// Would You Rather has no seed: its dilemma order is shuffled, so a shot names the dilemma it wants and the
// driver plays through the round until that dilemma is on screen, then shoots it before answering.
// Trick Inbox shots start the named set with seed 7 and shoot the first message's hunt screen (with its
// first clue found when the spec says "clue": true); Escape shots start a fresh run and shoot the door.
// Compact shots ("compact": true, the Trick Inbox and Escape captures for the trick, chat, privacy and kindness
// slides) render the game at 800x450 CSS px with a 1.6 device scale, so the 1280x720 master shows the game's own
// UI at the size a phone crop can read. They can name the exact message ("msg": an id from the game's MESSAGES),
// the phase ("hunt" | "decide" | "debrief"), how many clues are found ("found": a number or "all") and the move
// chosen ("action"); an Escape shot names a lock ("chapter": a lock id opens that lock as the lessons do,
// "escape" is the door), how many solver steps to take inside it ("acts"), and "shield": true for the debrief.
// Every compact shot also records the on-screen boxes of the game's own elements (% of the frame) in
// scripts/cyber-shots-rects.json, so slide highlights are placed from real element positions, never guessed.
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
const specIdx = args.indexOf('--spec'); // a trial shot table (candidates looked at before they join the real spec)
const gamesWanted = args.filter(a => !a.startsWith('--') && ![outIdx, onlyIdx, specIdx].filter(i => i >= 0).map(i => args[i + 1]).includes(a));
const ALL = JSON.parse(fs.readFileSync(specIdx >= 0 ? path.resolve(args[specIdx + 1]) : path.join(ROOT, 'scripts', 'cyber-shots-spec.json'), 'utf8'));
const shots = ALL.filter(s => (!gamesWanted.length || gamesWanted.includes(s.game)) && (!ONLY || ONLY.has(s.state)));
if (!shots.length) { console.error('no shots matched'); process.exit(1); }

const RECTS_FILE = path.join(ROOT, 'scripts', 'cyber-shots-rects.json');
const RECTS = fs.existsSync(RECTS_FILE) ? JSON.parse(fs.readFileSync(RECTS_FILE, 'utf8')) : {};
/** Collected in the frame: the named elements of Trick Inbox and Escape, as [x, y, w, h] in % of the viewport. */
function collectRects() {
  const W = innerWidth, H = innerHeight, out = {};
  const r1 = v => Math.round(v * 10) / 10;
  const add = (name, el) => {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return;
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
    if (x1 <= x0 || y1 <= y0) return;
    out[name] = [r1(x0 / W * 100), r1(y0 / H * 100), r1((x1 - x0) / W * 100), r1((y1 - y0) / H * 100), (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)];
  };
  const SEL = [
    ['bar', '.ti-bar, .ep-bar'], ['pill', '.ti-pill, .ep-pill'], ['say', '.ti-say, .ep-say'], ['card', '#ti-msg'], ['from', '.ti-from'],
    ['kind', '#ti-msg .ti-badge'], ['fromtext', '.ti-from > span:not(.ti-badge)'], ['addr', '.ti-addr'], ['subject', '.ti-subj'], ['body', '.ti-body'], ['clue', '.ti-clue'], ['link', '.ti-linkline'],
    ['count', '#ti-cluecount'], ['choose', '.ti-row .ok-btn'], ['actions', '#ti-actions'], ['act', '#ti-actions .ok-btn'], ['debrief', '#ti-debrief'],
    ['dline', '#ti-debrief > *'], ['set', '.ti-ch'], ['grid', '.ep-grid'], ['lock', '.ep-lock'], ['board', '.ep-board'], ['node', '.ep-node .ep-ico'],
    ['nodelabel', '.ep-node small'], ['road', '.ep-link'], ['epcard', '.ep-card'], ['cardtitle', '.ep-card b'], ['cardp', '.ep-card p'], ['clues', '.ep-card ul'],
    ['li', '.ep-card li'], ['tiles', '.ep-tiles'], ['tile', '.ep-tile'], ['seq', '.ep-seq'], ['slot', '.ep-seq span'], ['h', '.ep-h'], ['cipher', '.ep-cipher'],
    ['decoded', '.ep-decoded'], ['shift', '.ep-shift'], ['row', '.ep-row'], ['btn', '.ep-main .ok-btn, .ep-practice .ok-btn, .ep-shield .ok-btn'],
    ['shield', '.ep-shield'], ['table', '.ep-tbl'], ['trow', '.ep-tbl tr'], ['practice', '.ep-practice'], ['ptext', '.ep-practice > *'],
  ];
  for (const [name, sel] of SEL) {
    const els = [...document.querySelectorAll(sel)].filter(e => !e.closest('[hidden]'));
    els.forEach((el, i) => add(els.length === 1 && !['clue', 'act', 'pill', 'lock', 'tile', 'slot', 'li', 'epcard', 'node', 'nodelabel', 'road', 'cardtitle', 'cardp', 'clues', 'dline', 'btn', 'trow', 'ptext', 'set', 'h', 'row'].includes(name) ? name : `${name}${i + 1}`, el));
  }
  return out;
}

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
  for (const compact of [false, true]) {
  const group = list.filter(s => !!s.compact === compact);
  if (!group.length) continue;
  const page = await (await browser.newContext(compact ? { viewport: { width: 800, height: 450 }, deviceScaleFactor: 1.6 } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
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

  for (const s of group) {
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
        if (s.game === 'trick-inbox') {
          T.start({ chapter: s.chapter, band: s.band, seed: 7, lesson: true, lock: true });
          await wait(700);
          const TI = window.TrickInbox;
          const st0 = T.state();
          // walk to the named message: every earlier one is played through (clues, best move, next)
          for (let g = 0; s.msg && T.state().msgId !== s.msg && g < 12; g++) {
            const m = TI.BY_ID[T.state().msgId];
            for (const c of TI.cluesOf(m)) T.act({ t: 'clue', id: c.id });
            T.act({ t: 'ready' }); T.act({ t: 'action', action: m.action }); T.act({ t: 'next' }); await wait(150);
          }
          const msg = TI.BY_ID[T.state().msgId];
          const cs = msg ? TI.cluesOf(msg) : [];
          const nFound = s.found === 'all' ? cs.length : s.found != null ? s.found : (s.clue ? 1 : 0);
          for (const c of cs.slice(0, nFound)) { T.act({ t: 'clue', id: c.id }); await wait(120); }
          if (s.phase === 'decide' || s.phase === 'debrief') { T.act({ t: 'ready' }); await wait(250); }
          if (s.phase === 'debrief') { T.act({ t: 'action', action: s.action || msg.action }); await wait(300); }
          const focus = s.phase === 'debrief' ? '#ti-debrief' : s.phase === 'decide' ? '#ti-actions' : null;
          if (focus && document.querySelector(focus)) document.querySelector(focus).scrollIntoView({ block: 'end' });
          if (s.scrollTop) { const pnl = document.querySelector('.ti-panel'); if (pnl) pnl.scrollTop = 0; }
          await wait(250);
          const st = T.state(); return { levelId: st.msgId, chapter: st.chapter, screen: st.screen + '/' + st.phase };
        }
        if (s.game === 'escape-the-post-office') {
          const lockId = s.chapter !== 'escape' ? s.chapter : undefined;
          T.start({ band: s.band, fresh: true, seed: 7, chapter: lockId === undefined ? null : lockId });
          await wait(700);
          if (s.open) { for (let i = 0; i < s.open; i++) { T.solveLock(); await wait(120); } }
          if (s.shield) { await T.solve(); await wait(400); }
          if (lockId) for (let i = 0; i < (s.acts || 0); i++) { const r = T.run(); if (!r || !r.advice) break; T.act(r.advice); await wait(150); }
          if (s.pick) { T.act({ t: 'pick', id: s.pick }); await wait(150); }
          if (s.shiftTo != null) { T.act({ t: 'shiftTo', n: s.shiftTo }); await wait(150); }
          if (s.wrong) { T.act(s.wrong); await wait(200); }
          const main = document.querySelector('.ep-main'); if (main && s.scrollEnd) main.scrollTop = main.scrollHeight;
          await wait(250);
          const st = T.state(); return { levelId: st.lock || st.screen, chapter: lockId || 'escape', screen: st.screen };
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
      if (s.compact) { const r = await f.evaluate(collectRects); RECTS[`csq/${slug}/${s.state}`] = r; }
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
  await page.close();
  }
  srv.close();
}

const browser = await chromium.launch(fs.existsSync(EXE) ? { executablePath: EXE } : {});
const byGame = {}; for (const s of shots) (byGame[s.game] = byGame[s.game] || []).push(s);
for (const [slug, list] of Object.entries(byGame)) await runGame(browser, slug, list);
await browser.close();
if (Object.keys(RECTS).length) {
  const sorted = Object.fromEntries(Object.keys(RECTS).sort().map(k => [k, RECTS[k]]));
  fs.writeFileSync(RECTS_FILE, JSON.stringify(sorted, null, 1) + '\n');
}

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
