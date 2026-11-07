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
// --course csq: CS Quest's own table (scripts/csq-shots-spec.json, the Data Detective, Packet Post, Inside the Machine,
// Robo Route Level Maker and Would You Rather shots of units 2.2-6), its rects in scripts/csq-shots-rects.json.
const CSQ = args.includes('--course') && args[args.indexOf('--course') + 1] === 'csq';
const OUTROOT = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.join(ROOT, 'scripts', CSQ ? 'csq-masters' : 'cyber-masters');
const WEBP = args.includes('--webp');
const MANIFEST = args.includes('--manifest');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? new Set(args[onlyIdx + 1].split(',')) : null;
const specIdx = args.indexOf('--spec'); // a trial shot table (candidates looked at before they join the real spec)
const gamesWanted = args.filter(a => !a.startsWith('--') && ![outIdx, onlyIdx, specIdx, args.indexOf('--course')].filter(i => i >= 0).map(i => args[i + 1]).includes(a));
const ALL = JSON.parse(fs.readFileSync(specIdx >= 0 ? path.resolve(args[specIdx + 1]) : path.join(ROOT, 'scripts', CSQ ? 'csq-shots-spec.json' : 'cyber-shots-spec.json'), 'utf8'));
const shots = ALL.filter(s => (!gamesWanted.length || gamesWanted.includes(s.game)) && (!ONLY || ONLY.has(s.state)));
if (!shots.length) { console.error('no shots matched'); process.exit(1); }

const RECTS_FILE = path.join(ROOT, 'scripts', CSQ ? 'csq-shots-rects.json' : 'cyber-shots-rects.json');
const RECTS = fs.existsSync(RECTS_FILE) ? JSON.parse(fs.readFileSync(RECTS_FILE, 'utf8')) : {};
/** Collected in the frame: the named elements of Trick Inbox and Escape, as [x, y, w, h] in % of the viewport. */
function collectRects(clip, marks) {
  // clip { top, height } (CSS px): a narrow shot's 16:9 slice of the page; boxes are then % of the slice
  const T = clip ? clip.top : 0, W = innerWidth, H = clip ? clip.height : innerHeight, out = {};
  const sh = q => ({ left: q.left, right: q.right, top: q.top - T, bottom: q.bottom - T, width: q.width, height: q.height });
  const R = el => sh(el.getBoundingClientRect());
  const r1 = v => Math.round(v * 10) / 10;
  const add = (name, el) => {
    const r = R(el); if (!r.width || !r.height) return;
    const x0 = Math.max(0, r.left), y0 = Math.max(0, r.top), x1 = Math.min(W, r.right), y1 = Math.min(H, r.bottom);
    if (x1 <= x0 || y1 <= y0) return;
    out[name] = [r1(x0 / W * 100), r1(y0 / H * 100), r1((x1 - x0) / W * 100), r1((y1 - y0) / H * 100), (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60)];
    // The element's ink: the union of its text lines (Range rects) and its pictures. A container as wide as the frame
    // often holds a short line ("From: Pim"), and a phone crop is measured from the ink, not the container.
    const rng = document.createRange(); rng.selectNodeContents(el);
    let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
    for (const q of [...[...rng.getClientRects()].map(sh), ...[...el.querySelectorAll('img, svg, canvas')].map(R)]) {
      if (q.width < 1 || q.height < 1) continue;
      a = Math.min(a, q.left); b = Math.min(b, q.top); c = Math.max(c, q.right); d = Math.max(d, q.bottom);
    }
    if (c > a) {
      a = Math.max(a, x0); b = Math.max(b, y0); c = Math.min(c, x1); d = Math.min(d, y1);
      if (c > a && d > b) out[`${name}~ink`] = [r1(a / W * 100), r1(b / H * 100), r1((c - a) / W * 100), r1((d - b) / H * 100)];
    }
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
    // Packet Post's trick cards (Spot the Trick)
    ['ppsay', '.pp-say'], ['pph', '.pp-panel > .pp-h'], ['ppletter', '.pp-letter'], ['ppfrom', '.pp-letter .pp-from'], ['ppbadge', '.pp-letter .pp-badge'],
    ['ppsubj', '.pp-letter b'], ['ppbody', '.pp-letter p'], ['pptile', '.pp-tile'], ['ppverdict', '.pp-verdicts .ok-btn'],
    // ... and its other panels: an item card (a lockbox, a secret message), a cipher's letters, what goes wrong on a road
    ['ppitem', '.pp-itemcard'], ['ppcipher', '.pp-cipher'], ['ppevents', '.pp-events'], ['ppev', '.pp-events li'], ['pptiles', '.pp-tiles'],
    ['ppbtn', '.pp-panel .ok-btn'],
    // Would You Rather: the question, its two choices (a, b) with their words, and the OR between them
    ['wyrask', '#ask'], ['wyropt', '#pair .opt'], ['wyrtx', '#pair .opt .tx'], ['wyror', '#pair .or'],
  ];
  // a shot's own named parts (CS Quest shots name what their slide's highlights point at): { name: selector }
  for (const [name, sel] of Object.entries(marks || {})) [...document.querySelectorAll(sel)].filter(e => !e.closest('[hidden]')).forEach((el, i) => add(`${name}${i + 1}`, el));
  for (const [name, sel] of SEL) {
    const els = [...document.querySelectorAll(sel)].filter(e => !e.closest('[hidden]'));
    els.forEach((el, i) => add(els.length === 1 && !['clue', 'act', 'pill', 'lock', 'tile', 'slot', 'li', 'epcard', 'node', 'nodelabel', 'road', 'cardtitle', 'cardp', 'clues', 'dline', 'btn', 'trow', 'ptext', 'set', 'h', 'row', 'pptile', 'ppverdict', 'ppbadge'].includes(name) ? name : `${name}${i + 1}`, el));
  }
  // The game's body text size in the 1280-wide master (px): the font most of the picture's words are set in. A slide's
  // crop scales it to the phone (tests/unit/cyber-shots.test.js keeps it readable at 390 px).
  const sizes = new Map();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement, s = t.textContent.trim();
    if (!s || !el || el.closest('[hidden]') || !el.getClientRects().length) continue;
    if (clip) { const q = R(el); if (q.bottom <= 0 || q.top >= H) continue; }   // a slice: only the words it shows
    const px = Math.round(parseFloat(getComputedStyle(el).fontSize) * 1280 / W * 10) / 10;
    sizes.set(px, (sizes.get(px) || 0) + s.length);
  }
  if (sizes.size) out['~bodyFont'] = [...sizes].sort((p, q) => q[1] - p[1])[0][0];
  // Every visible word (and emoji or icon glyph run), as [x, y, w, h] in % of the frame: the course engine's
  // zoom-to-cue (public/js/course-zoom.js) moves a zoom's edges into the gaps between words, so it never cuts one.
  const words = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const el = t.parentElement, s = t.textContent;
    if (!s.trim() || !el || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    for (const m of s.matchAll(/\S+/g)) {
      const rg = document.createRange(); rg.setStart(t, m.index); rg.setEnd(t, m.index + m[0].length);
      for (const q of [...rg.getClientRects()].map(sh)) {
        if (q.width < 1 || q.height < 4 || q.right <= 0 || q.bottom <= 0 || q.left >= W || q.top >= H) continue;
        words.push([r1(Math.max(0, q.left) / W * 100), r1(Math.max(0, q.top) / H * 100), r1((Math.min(W, q.right) - Math.max(0, q.left)) / W * 100), r1((Math.min(H, q.bottom) - Math.max(0, q.top)) / H * 100)]);
      }
    }
  }
  out['~words'] = words;
  // The text itself, line by line (an authoring aid: a slide's highlight is placed on the words it names).
  const tl = [];
  const tw2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = tw2.nextNode(); t; t = tw2.nextNode()) {
    const el = t.parentElement, s = t.textContent.replace(/\s+/g, ' ').trim();
    if (!s || !el || el.closest('[hidden]')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    for (const q of [...rg.getClientRects()].map(sh)) {
      if (q.width < 1 || q.height < 4 || q.right <= 0 || q.bottom <= 0 || q.left >= W || q.top >= H) continue;
      tl.push([r1(Math.max(0, q.left) / W * 100), r1(Math.max(0, q.top) / H * 100), r1((Math.min(W, q.right) - Math.max(0, q.left)) / W * 100), r1((Math.min(H, q.bottom) - Math.max(0, q.top)) / H * 100), s.slice(0, 50)]);
    }
  }
  out['~lines'] = tl;
  return out;
}

/** In the frame: the slice top (CSS px) for a narrow.at anchor (see the runner). */
function sliceTop(at, H) {
  const lines = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let anchor = null;
  for (let t = tw.nextNode(); t; t = tw.nextNode()) {
    const el = t.parentElement; if (!t.textContent.trim() || !el || el.closest('[hidden]') || !el.getClientRects().length) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    for (const q of rg.getClientRects()) if (q.height >= 4 && q.width >= 1) lines.push([q.top, q.bottom]);
    if (!anchor && at.text && t.textContent.replace(/\s+/g, ' ').includes(at.text)) anchor = rg.getBoundingClientRect().top;
  }
  if (at.sel) { const e = [...document.querySelectorAll(at.sel)].find(x => !x.closest('[hidden]') && x.getClientRects().length); if (e) anchor = e.getBoundingClientRect().top; }
  if (anchor == null) throw new Error(`narrow.at: no ${at.text || at.sel} on screen`);
  let top = Math.max(0, anchor - (at.pad != null ? at.pad : 6) + (at.dy || 0));
  const G = 2;
  for (let k = 0; k < 8; k++) {
    const a = lines.find(l => l[0] < top + G && l[1] > top - G);
    if (a) { top = Math.max(0, a[0] - G - 1); continue; }
    const b = lines.find(l => l[0] < top + H + G && l[1] > top + H - G);
    if (b) { top = b[1] + G + 1 - H; continue; }
    break;
  }
  return Math.round(Math.max(0, top) * 10) / 10;
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
  // Three ways to shoot: the wide game (1280 x 720), compact (800 x 450 at 1.6) and narrow: the game laid out as on
  // a phone (narrow.width CSS px wide, narrow.height tall, so its lines wrap short), and a 16:9 slice of it from
  // narrow.top, shot at 1280 px wide, so a phone shows the game's words at their own size. Without a top, the whole
  // narrow page is shot (a survey, to choose the slice).
  const modeOf = s => (s.narrow ? `n${s.narrow.width}x${s.narrow.height}` : s.compact ? 'compact' : 'wide');
  for (const mode of [...new Set(list.map(modeOf))]) {
  const group = list.filter(s => modeOf(s) === mode);
  const nw = group[0].narrow;
  const page = await (await browser.newContext(nw ? { viewport: { width: nw.width, height: nw.height }, deviceScaleFactor: 1280 / nw.width }
    : mode === 'compact' ? { viewport: { width: 800, height: 450 }, deviceScaleFactor: 1.6 } : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })).newPage();
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
          const topic = s.topic || 'online';
          T.start('alone', { topics: [topic], count: 10 });
          await wait(600);
          for (let i = 0; i < 12; i++) {
            const st = T.state();
            if (st.cur === s.dilemma) {
              if (s.pick) { T.pick(s.pick); await wait(500); }   // the reveal: the choice made and what it costs
              return { levelId: st.cur, chapter: topic, screen: T.state().screen };
            }
            T.pick('a'); await wait(350); T.next(); await wait(450);
          }
          const st = T.state(); return { levelId: st.cur, chapter: topic, screen: st.screen, missed: st.cur !== s.dilemma };
        }
        // CS Quest's worlds (the csq-shots-rollout.js drivers): Robo Route's Level Maker, Data Detective, Inside the Machine
        if (s.game === 'robo-route' || s.game === 'data-detective' || s.game === 'inside-the-machine') {
          if (s.game === 'robo-route') {
            T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, mode: s.chapter === 'level-maker' ? 'maker' : 'play' });
            await wait(500); T.closeModal(); await wait(300);
          } else if (s.game === 'data-detective') {
            T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, mode: s.mode || 'play' });
            await wait(500); if (!s.keepDialog) { T.closeDialog(); await wait(300); }
          } else { T.start({ chapter: s.chapter, band: s.band, level: s.level, seed: 7, learn: !!s.learn }); await wait(500); }
          for (const a of s.actions) {
            if (a.program) T.program(a.program);
            else if (a.steps) { for (let i = 0; i < a.steps; i++) { T.stepOnce(); await wait(130); } }
            else if (a.solve) { await T.solve(); await wait(600); }
            else if (a.closeModal) { if (T.closeModal) T.closeModal(); else T.closeDialog(); await wait(300); }
            else if (a.mkRows) { T.mkRows(a.mkRows); await wait(300); }
            else if (a.mkCheck) { T.mkCheck(); await wait(300); }
            else if (a.mkTest) { await T.mkTest(); await wait(400); }
            else if (a.makerFree) { T.maker(); await wait(400); }
            else if (a.run) { await T.run(); await wait(600); }
            else if (a.act) { T.act(a.act); await wait(400); }
            else if (a.acts) { for (const x of a.acts) { T.act(x); await wait(350); } }
            else if (a.claimCard) { T.claimCard(); await wait(400); }
            else if (a.tap) { T.tap(a.tap); await wait(350); }
            else if (a.answer) { T.answer(a.answer); await wait(400); }
            else if (a.next) { T.next(); await wait(400); }
            else if (a.click) { const b = [...document.querySelectorAll(a.click.sel || 'button')].filter(x => !a.click.text || (x.getAttribute('aria-label') || x.textContent || '').trim().includes(a.click.text))[a.click.i || 0]; if (b) b.click(); await wait(350); }
            else if (a.eval) { (0, eval)(a.eval); await wait(350); }
            else if (a.scroll) { const el = document.querySelector(a.scroll); if (el) el.scrollIntoView({ block: a.block || 'start' }); await wait(200); }
            await wait(120);
          }
          const st = T.state(); return { levelId: st.levelId || st.level, chapter: st.chapter && (st.chapter.id || st.chapter), screen: st.screen };
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
      // narrow.at (CS Quest shots): place the slice from the game's own words instead of a fixed top: the slice starts
      // `pad` px above the first visible text that contains at.text (or the element at.sel), and both its edges are then
      // moved into gaps between lines of text. The top it lands on is printed, so the spec can pin it.
      if (s.narrow && s.narrow.at) s.narrow.top = await f.evaluate(`(${sliceTop})(${JSON.stringify(s.narrow.at)}, ${s.narrow.width * 9 / 16})`);
      const clip = s.narrow && s.narrow.top != null ? { top: s.narrow.top, height: s.narrow.width * 9 / 16 } : null;
      { const r = await f.evaluate(`(${collectRects})(${JSON.stringify(clip)}, ${JSON.stringify(s.marks || null)})`); RECTS[`csq/${slug}/${s.state}`] = r; }   // every shot: its words (zoom-to-cue)
      const file = path.join(outDir, `${s.state}.png`);
      if (clip) await page.screenshot({ path: file, clip: { x: 0, y: clip.top, width: s.narrow.width, height: clip.height } });
      else await frameEl.screenshot({ path: file });
      let extra = '';
      if (WEBP) {
        const dest = path.join(ROOT, 'public', 'img', 'csq', slug, `${s.state}.webp`);
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', file, '-vf', "scale='min(1280,iw)':-2", '-c:v', 'libwebp', '-quality', '80', dest]);
        extra = ` -> ${Math.round(fs.statSync(dest).size / 1024)} KB`;
      }
      console.log(`✓ ${slug}/${s.state}: level ${seen.levelId} chapter ${seen.chapter}${seen.missed ? ' ⚠ DILEMMA MISSED' : ''}${s.narrow && s.narrow.at ? ` top ${s.narrow.top}` : ''}${extra}`);
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
