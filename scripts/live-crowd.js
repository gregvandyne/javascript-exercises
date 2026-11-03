// A full class on a running server: hosts an Oomba Live mode with PLAYERS players (bots on the real socket, as many as
// a class has) plus one real phone in a browser, plays every question to the end, and checks the projector and the
// phone at the usual sizes with tests/e2e/frame-fit.js at the question, the reveal and the end. Also counts what each
// bot receives (messages per question and the biggest one), so a mode that floods phones with 30 players shows up.
//
//   BASE=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS=... MODE=atlas PLAYERS=30 OUT=/tmp/live-crowd \
//   [STARTER=atlas:world:easy:find+flag:5:30] node scripts/live-crowd.js      exit code 1 when anything is wrong
import { chromium } from '@playwright/test';
import WebSocket from 'ws';
import fs from 'node:fs';
import { frameProblems, pageScrollsSideways } from '../tests/e2e/frame-fit.js';

const B = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, ''), OUT = process.env.OUT || '/tmp/live-crowd';
const MODE = process.env.MODE || 'wyr', N = Math.max(1, Math.min(60, +process.env.PLAYERS || 30));
const STARTER = process.env.STARTER || { wyr: 'wyr:mix:5:30', atlas: 'atlas:world:easy:find+capital+flag+famous:5:30' }[MODE] || null;
const SIZES = { phone: [390, 844], 'tablet-portrait': [820, 1180], 'tablet-landscape': [1180, 820], desktop: [1280, 800], projector: [1920, 1080] };
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const frameOf = p => p.frames().find(f => /\/live\/frame\//.test(f.url()));
const st = async p => { try { return await frameOf(p).evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); } catch { return null; } };
async function until(fn, ms = 60000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(250); } }
const problems = [];

/** A bot: joins as a guest, says ready, answers every question after a moment (a spread of answers). */
async function bot(code, k) {
  const r = await fetch(`${B}/api/live/join`, { method: 'POST', headers: { 'content-type': 'application/json', origin: B }, body: JSON.stringify({ code, asGuest: true }) });
  const j = await r.json();
  if (r.status !== 200) throw new Error(`join ${r.status} ${JSON.stringify(j)}`);
  const ws = new WebSocket(`${B.replace(/^http/, 'ws')}/api/live/ws`, { headers: { origin: B } });
  const me = { k, ws, got: [], perQ: new Map(), biggest: 0 };
  let q = null;
  ws.on('message', d => {
    const s = String(d), m = JSON.parse(s);
    me.got.push(m.t); me.biggest = Math.max(me.biggest, s.length);
    if (q) me.perQ.set(q.i, (me.perQ.get(q.i) || 0) + 1);
    if (m.t === 'ph' && m.phase === 'loading') ws.send(JSON.stringify({ t: 'rdy', view: '2d' }));
    if (m.t === 'q') {
      q = m;
      // most answer, a few never do; Atlas: about half the right country (the server's answer is never sent: a bot
      // taps a few likely ones), the rest spread over neighbours and far places
      if (k % 10 === 9) return;
      const c = m.choices.length > 4 ? (k * 37 + m.i * 11) % m.choices.length : (k + m.i) % m.choices.length;
      setTimeout(() => { try { ws.send(JSON.stringify({ t: 'an', i: m.i, c, e: 800 + k * 120 })); } catch { /* closed */ } }, 600 + k * 90);
    }
  });
  await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
  ws.send(JSON.stringify({ t: 'hello', v: 1, tok: j.tok }));
  return me;
}

(async () => {
  const br = await chromium.launch();
  const hc = await br.newContext({ viewport: { width: 1280, height: 800 } }); const host = await hc.newPage();
  await host.request.post(B + '/api/auth/login', { data: { username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || '' }, headers: { 'sec-fetch-site': 'same-origin' } });
  await host.goto(B + '/live');
  const r = await host.request.post(B + '/api/live/sessions', { data: { pick: `mode:${MODE}`, ...(STARTER ? { starter: STARTER } : {}), audience: 'open', replace: true, maxPlayers: 60 }, headers: { Origin: B } });
  const made = await r.json(); if (!made.redirect) throw new Error(`session: ${JSON.stringify(made)}`);
  await host.goto(B + made.redirect); const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  const bots = []; for (let k = 0; k < N; k++) bots.push(await bot(code, k));
  const pc = await br.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }); const phone = await pc.newPage();
  await phone.goto(`${B}/join#${code}`); await phone.click('#lv-join button[type=submit]'); await phone.click('#lv-go'); await phone.waitForURL(/\/live\/play\//);
  await until(async () => (await st(phone)) && (await st(host)));
  // At the end the projector holds the game's podium for a few seconds, then opens the results: check it first, quickly.
  const check = async (tag, fast = false) => {
    const order = fast ? [['host', host], ['phone', phone]].flatMap(([who, p]) => Object.entries(SIZES).map(([n, s]) => [who, p, n, s])) : Object.entries(SIZES).flatMap(([n, s]) => [['host', host, n, s], ['phone', phone, n, s]]);
    for (const [who, p, n, [w, h]] of order) {
      {
        if (who === 'phone' && n === 'projector') continue;
        await p.setViewportSize({ width: w, height: h }); await sleep(fast ? 250 : 600);
        const f = frameOf(p); const probs = f ? await frameProblems(f) : [{ kind: 'noframe' }];
        if (await pageScrollsSideways(p)) probs.push({ kind: 'page-scrolls-sideways' });
        await p.screenshot({ path: `${OUT}/${MODE}-${N}-${tag}-${who}-${n}.png` });
        if (probs.length) { problems.push({ tag, who, n, probs }); console.log(tag, who, n, JSON.stringify(probs).slice(0, 500)); }
      }
    }
    await host.setViewportSize({ width: 1280, height: 800 }); await phone.setViewportSize({ width: 390, height: 844 });
  };
  await check('lobby');
  await host.locator('[data-lv-act="start"]:not([hidden])').click();
  let asked = 0;
  for (;;) {
    const s = await until(async () => { const x = await st(host); return x && ((x.phase === 'playing' && x.question) || x.phase === 'ended' || x.summary || x.end) && x; }, 90000);
    if (s.phase === 'ended' || s.summary || s.end) break;
    asked++;
    // the phone answers too (the first country for Atlas, A for a vote)
    await frameOf(phone).evaluate(() => window.__brbTest.answer(0)).catch(() => {});
    if (asked === 1) { await sleep(1500); await check('question'); }
    await until(async () => { const x = await st(host); return x && x.phase === 'between'; }, 60000);
    await sleep(1500);
    if (asked === 1) await check('reveal');
    // the next one (or the end after the last)
    await host.locator('[data-lv-act="next"]:not([hidden])').click();
    await sleep(800);
  }
  await sleep(600);
  await check('end', true);
  const per = bots.flatMap(b => [...b.perQ.values()]);
  const stats = { players: N + 1, questions: asked, maxPerQuestion: Math.max(...per), avgPerQuestion: Math.round(per.reduce((a, b) => a + b, 0) / per.length), biggest: Math.max(...bots.map(b => b.biggest)) };
  console.log(MODE, JSON.stringify(stats));
  fs.writeFileSync(`${OUT}/${MODE}-${N}-report.json`, JSON.stringify({ stats, problems }, null, 1));
  for (const b of bots) b.ws.close();
  await br.close();
  if (stats.biggest > 8000) problems.push({ kind: 'big message', bytes: stats.biggest });
  process.exit(problems.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
