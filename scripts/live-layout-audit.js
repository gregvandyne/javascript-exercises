// Live games layout audit: hosts each Oomba Live quiz mode on a running server with three players and checks the
// projector page and a player's page at phone, small phone, tablet (portrait and landscape), desktop and projector
// sizes, in the lobby, during a question, at the reveal (and on the board) and at the end. Inside each game frame it
// looks for text or controls off the screen, text cut off, things on top of each other and squashed buttons
// (tests/e2e/frame-fit.js), and on the page for sideways scrolling. Saves a screenshot of every check.
//
//   BASE=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS=... OUT=/tmp/live-layout [MODES=board,battle,quest-race] \
//   node scripts/live-layout-audit.js        exit code 1 when anything is wrong (tests/e2e/live-layout.spec.js runs it too)
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import { frameProblems, pageScrollsSideways } from '../tests/e2e/frame-fit.js';
const B = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, ''), OUT = process.env.OUT || '/tmp/live-layout';
fs.mkdirSync(OUT, { recursive: true });
const SIZES = { phone: [390, 844], 'small-phone': [360, 640], 'tablet-portrait': [820, 1180], 'tablet-landscape': [1180, 820], desktop: [1280, 800], projector: [1920, 1080] };
const MODES = (process.env.MODES || 'board,battle,quest-race').split(',');
// Our own questions with 2 minutes each, so a question stays open while every size is checked. Long ones too, and
// categories for the board.
const LONG = 'A scientist leaves a glass of water, a glass of salty water and a glass of sugary water on a sunny windowsill for a week. Which glass will have the least water left at the end?';
const ITEMS = [
  { cat: 'Science', q: LONG, choices: ['The glass of plain water', 'The glass of salty water', 'The glass of sugary water', 'They will all be the same'], answer: 0, secs: 120 },
  { cat: 'Geography', q: 'Which is the longest river in South America?', choices: ['Amazon', 'Paraná', 'Orinoco', 'São Francisco'], answer: 0, secs: 120 },
  { cat: 'Math', q: 'What is 7 × 8?', choices: ['56', '54', '64', '48'], answer: 0, secs: 120 },
  { cat: 'Words', q: 'The sun is a star.', choices: ['True', 'False'], answer: 0, secs: 120 },
  { cat: 'History', q: 'Who built the pyramids of Giza?', choices: ['The ancient Egyptians', 'The Romans', 'The Vikings', 'The Aztecs'], answer: 0, secs: 120 },
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frameOf = p => p.frames().find(f => /\/live\/frame\//.test(f.url()));
const st = async p => { try { return await frameOf(p).evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); } catch { return null; } };
async function until(fn, ms = 40000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(250); } }
const report = [];
(async () => {
  const br = await chromium.launch();
  for (const mode of MODES) {
    const hc = await br.newContext({ viewport: { width: 1280, height: 800 } }); const host = await hc.newPage();
    await host.request.post(B + '/api/auth/login', { data: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || '' }, headers: { 'sec-fetch-site': 'same-origin' } });
    await host.goto(B + '/live');
    const r = await host.request.post(B + '/api/live/sessions', { data: { pick: `mode:${mode}`, items: ITEMS, audience: 'open', replace: true }, headers: { Origin: B } });
    await host.goto(B + (await r.json()).redirect); const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
    const players = [];
    for (let i = 0; i < 3; i++) {
      const c = await br.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-forwarded-for': `10.1.${MODES.indexOf(mode)}.${i + 5}` } }); const p = await c.newPage();
      await p.goto(`${B}/join#${code}`); await p.click('#lv-join button[type=submit]'); await p.click('#lv-go'); await p.waitForURL(/\/live\/play\//); players.push(p);
    }
    await until(async () => (await st(players[0])) && (await st(host)));
    const check = async tag => {
      for (const [n, [w, h]] of Object.entries(SIZES)) {
        await host.setViewportSize({ width: w, height: h }); await players[0].setViewportSize({ width: w, height: h });
        await sleep(mode === 'quest-race' ? 1200 : 700);
        for (const [who, p] of [['host', host], ['player', players[0]]]) {
          const f = frameOf(p); const probs = f ? await frameProblems(f) : [{ kind: 'noframe' }];
          if (await pageScrollsSideways(p)) probs.push({ kind: 'page-scrolls-sideways' });
          const file = `${OUT}/${mode}-${tag}-${who}-${n}.png`; await p.screenshot({ path: file });
          report.push({ mode, tag, who, size: n, probs });
          if (probs.length) console.log(mode, tag, who, n, JSON.stringify(probs).slice(0, 600));
        }
      }
      await host.setViewportSize({ width: 1280, height: 800 }); await players[0].setViewportSize({ width: 390, height: 844 });
    };
    await check('lobby');
    await host.locator('[data-lv-act="start"]:not([hidden])').click();
    const openQ = async () => {
      if (mode === 'board') {
        await until(async () => { const s = await st(host); return s && s.phase === 'between'; });
        await sleep(800);
        await frameOf(host).evaluate(() => { const b = document.querySelector('.bb-tile.can'); b && b.click(); });
      }
      await until(async () => { const s = await st(players[0]); return s && s.phase === 'playing' && s.question; });
      await sleep(1500);
    };
    await openQ();
    await check('question');
    for (const p of players) await frameOf(p).evaluate(() => window.__brbTest.answer(0)).catch(() => {});
    await until(async () => { const s = await st(host); return s && (s.reveal || s.phase === 'between' || (s.question && s.question.revealed)); }, 30000).catch(() => {});
    await sleep(1200);
    await check('reveal');
    if (mode === 'board') { await until(async () => (await st(host)).phase === 'between'); await sleep(1500); await check('board-after'); }
    await host.locator('[data-lv-act="end"]:not([hidden])').click().catch(() => {});
    await host.locator('.lv-confirm button, [data-lv-confirm]').first().click({ timeout: 2000 }).catch(() => {});
    await sleep(2500);
    await check('end');
    await hc.close(); for (const p of players) await p.context().close();
  }
  fs.writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
  const bad = report.filter(x => x.probs.length);
  console.log(`${report.length} checks, ${bad.length} with problems. Screenshots and report.json in ${OUT}`);
  await br.close();
  process.exit(bad.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
