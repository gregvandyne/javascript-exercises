// Oomba Live load check: a real host page (Chromium) and N bot players on the real protocol (HTTP join + WebSocket),
// for each built-in live mode and each class size. The bots join, run around the lobby, answer every question at
// human speed (1-6 s, mostly right) and stay to the end. Measures what matters for a full classroom on one server:
//   - correctness: every bot is seated and counted, every bot gets every question, every answer is counted at the
//     reveal, the leaderboard counts everyone;
//   - server: CPU and memory of the server process (SERVER_PID, Linux /proc), and event-loop lag seen from outside
//     (round trips to /health every 100 ms, p95);
//   - network: messages and bytes per second each player receives;
//   - the projector: frames per second of the host's game frame while N players play.
// Screenshots of the projector at a question go to OUT (live<N>-<mode>.png). Exit code 1 when a check fails.
//
// Tug of Math Live (MODES=tug): every bot answers its own questions on the keypad (about 80% right, one every 1.5-5 s)
// for TUG_SECS seconds (default 30); every answer must come back checked, and the rope keeps up.
//
//   BASE=http://localhost:3000 ADMIN_USER=admin ADMIN_PASS=... [MODES=quest-race,battle,board,wyr,atlas,tug] [SIZES=10,20,30]
//   [QUESTIONS=3] [SECS=12] [STARTER=atlas:eu:easy:flag:3:20 (the platform's own questions for that mode)] [PHONE=1 (one real phone among the bots, with screenshots)] [LAYOUT=1] [SERVER_PID=1234] [OUT=/tmp/live-load] node scripts/live-load.js
import WebSocket from 'ws';
import fs from 'node:fs';
import { frameProblems } from '../tests/e2e/frame-fit.js';

const B = (process.env.BASE || 'http://localhost:3000').replace(/\/$/, '');
const MODES = (process.env.MODES || 'quest-race,battle,board').split(',').filter(Boolean);
const SIZES = (process.env.SIZES || '10,20,30').split(',').map(Number).filter(n => n > 0);
const QUESTIONS = Math.max(1, +process.env.QUESTIONS || 3);
const STARTER = process.env.STARTER || '';
const OUT = process.env.OUT || '/tmp/live-load';
const PID = +process.env.SERVER_PID || 0;
const SECS = +process.env.SECS || 12;
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const TUG_SECS = +process.env.TUG_SECS || 30;
/** A Tug of Math question's answer from its tokens (the bots work it out like a player would). */
function tugSolve(e) {
  const OP = { add: '+', sub: '-', mul: '*', div: '/', lp: '(', rp: ')', sq: '**2', cu: '**3', pow: '**', pct: '/100', of: '*', x: '(x)', q: '(x)', sqrt: 'Math.sqrt' };
  const f = toks => Function('x', `return ${toks.map((t, i) => (typeof t === 'number' ? `(${t})${toks[i + 1] === 'x' || toks[i + 1] === 'q' ? '*' : ''}` : OP[t])).join('')}`);
  const eq = e.indexOf('eq');
  if (eq < 0) return f(e)(0);
  const L = f(e.slice(0, eq)), R = f(e.slice(eq + 1));
  for (let x = -3000; x <= 3000; x++) if (Math.abs(L(x) - R(x)) < 1e-9) return x;
  return 0;
}
async function until(fn, ms = 40000) { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await sleep(250); } }
// LAYOUT=1: the projector page is also checked for layout problems (tests/e2e/frame-fit.js) at these sizes, with
// everyone in the room, in the lobby and during a question.
const LAYOUT = process.env.LAYOUT === '1';
const HOST_SIZES = { projector: [1920, 1080], desktop: [1280, 800], 'tablet-landscape': [1180, 820], 'tablet-portrait': [820, 1180] };
const cats = ['Science', 'Maths', 'Words', 'Places', 'History', 'Nature'];
const ITEMS = Array.from({ length: 30 }, (_, i) => ({ cat: cats[Math.floor(i / 5)], q: `Question ${i + 1}: what is ${i + 2} + ${i + 3}?`, choices: [String(2 * i + 5), String(2 * i + 6), String(2 * i + 4), String(2 * i + 7)], answer: 0, secs: SECS }));

/** CPU seconds and RSS (MB) of a process, from /proc. */
function proc(pid) {
  try {
    const f = fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1].split(' ');
    const tick = 100; // USER_HZ
    return { cpu: (+f[11] + +f[12]) / tick, rss: (+f[21] * 4096) / 1048576 };
  } catch { return null; }
}

async function login() {
  const r = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'content-type': 'application/json', 'sec-fetch-site': 'same-origin' }, body: JSON.stringify({ username: process.env.ADMIN_USER || 'admin', password: process.env.ADMIN_PASS || '' }) });
  if (!r.ok) throw new Error(`login ${r.status}`);
  return r.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
}

/** A bot: join over HTTP, then the socket. */
async function bot(code, i, tag) {
  const ip = `10.${(tag % 200) + 20}.${Math.floor(i / 200)}.${(i % 200) + 10}`;
  const j = await fetch(B + '/api/live/join', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify({ code }) });
  const join = await j.json();
  if (!j.ok) return { ok: false, code: join.code, status: j.status };
  const ws = new WebSocket(B.replace(/^http/, 'ws') + '/api/live/ws', { headers: { origin: B, 'x-forwarded-for': ip } });
  const b = { ok: true, ws, seat: null, msgs: 0, bytes: 0, qs: new Set(), answered: new Set(), byType: {}, lbN: 0, closed: null, pos: [0, 0, 0], tq: 0, sent: 0, tr: 0 };
  ws.on('message', d => {
    b.msgs++; b.bytes += d.length;
    let m; try { m = JSON.parse(String(d)); } catch { return; }
    b.byType[m.t] = (b.byType[m.t] || 0) + 1;
    if (m.t === 'wel') { b.seat = m.me && m.me.seat; ws.send(JSON.stringify({ t: 'rdy', view: '2d' })); }
    if (m.t === 'ph' && m.phase === 'loading') ws.send(JSON.stringify({ t: 'rdy', view: '2d' }));
    if (m.t === 'q' && !b.qs.has(m.i)) {
      b.qs.add(m.i);
      const wait = 1000 + Math.random() * 5000, right = Math.random() < 0.7;
      setTimeout(() => { if (ws.readyState === 1) { ws.send(JSON.stringify({ t: 'an', i: m.i, c: right ? 0 : 1 + Math.floor(Math.random() * Math.min(3, (m.choices || []).length - 1)), e: Math.round(wait) })); b.answered.add(m.i); } }, wait);
    }
    if (m.t === 'lb') b.lbN = Math.max(b.lbN, m.n || 0);
    // Tug of Math Live: this bot's own question, then its checked answer
    if (m.t === 'ev' && m.f === 0 && m.k === 'tq' && m.d && !b.qs.has(`t${m.d.i}`)) {
      b.qs.add(`t${m.d.i}`); b.tq++;
      const wait = 1500 + Math.random() * 3500, v = tugSolve(m.d.e) + (Math.random() < 0.8 ? 0 : 1);
      setTimeout(() => { if (ws.readyState === 1) { ws.send(JSON.stringify({ t: 'ev', k: 'ans', d: { i: m.d.i, v }, to: 'host' })); b.sent++; } }, wait);
    }
    if (m.t === 'ev' && m.f === 0 && m.k === 'tr') b.tr++;
  });
  ws.on('close', c => { b.closed = c; });
  await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); });
  ws.send(JSON.stringify({ t: 'hello', v: 1, tok: join.tok }));
  return b;
}

async function run(browser, cookie, mode, n, tag) {
  const r = await fetch(B + '/api/live/sessions', { method: 'POST', headers: { 'content-type': 'application/json', cookie, origin: B }, body: JSON.stringify({ pick: mode.startsWith('game:') ? mode : `mode:${mode}`, items: ITEMS.slice(0, mode === 'board' ? 30 : Math.max(QUESTIONS, 3)), audience: 'open', replace: true, maxPlayers: 100, settings: { count: mode === 'board' ? 30 : QUESTIONS }, ...(STARTER && STARTER.split(':')[0] === mode ? { starter: STARTER } : mode === 'tug' ? { starter: 'tug:4:120' } : {}) }) });
  const made = await r.json();
  if (!r.ok) throw new Error(`session ${r.status} ${JSON.stringify(made)}`);
  let page = null, ctx = null, code = null;
  const hostMsgs = [];
  if (browser) {
    ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.addCookies(cookie.split('; ').map(c => { const [name, ...v] = c.split('='); return { name, value: v.join('='), url: B }; }));
    page = await ctx.newPage();
    page.on('websocket', ws => ws.on('framereceived', f => { try { const m = JSON.parse(f.payload); if (m.t === 'rv') hostMsgs.push(m); } catch { /* binary */ } }));
    await page.goto(B + made.redirect);
    code = (await page.locator('#lv-code').textContent()).replace(/\s/g, '');
  }
  const bots = [];
  for (let i = 0; i < n; i++) { bots.push(await bot(code, i, tag)); }
  // One real phone among the bots (the last seat), for screenshots of what a player sees in a full room.
  let phone = null;
  if (process.env.PHONE === '1') {
    const pc = await browser.newContext({ viewport: { width: 390, height: 844 }, extraHTTPHeaders: { 'x-forwarded-for': `10.9.${tag % 200}.250` } });
    phone = await pc.newPage();
    await phone.goto(`${B}/join#${code}`); await phone.click('#lv-join button[type=submit]'); await phone.click('#lv-go'); await phone.waitForURL(/\/live\/play\//);
  }
  const seated = bots.filter(b => b.ok).length + (phone ? 1 : 0);
  await sleep(1500);
  // The lobby: everyone runs around for 5 s (presence at 10 Hz, like a real phone).
  const walk = setInterval(() => { for (const b of bots) if (b.ok && b.ws.readyState === 1) { b.pos = [b.pos[0] + Math.round(Math.random() * 60 - 30), 0, b.pos[2] + Math.round(Math.random() * 60 - 30)]; b.ws.send(JSON.stringify({ t: 'mv', p: [...b.pos, Math.floor(Math.random() * 256), 1] })); } }, 100);
  const frameOf = () => page && page.frames().find(f => /\/live\/frame\//.test(f.url()));
  const fps = async () => { const f = frameOf(); if (!f) return null; try { return await f.evaluate(() => new Promise(res => { let k = 0; const t0 = performance.now(); const step = () => { k++; if (performance.now() - t0 < 3000) requestAnimationFrame(step); else res(Math.round(k / ((performance.now() - t0) / 1000))); }; requestAnimationFrame(step); })); } catch { return null; } };
  const lobbyFps = await fps();
  await page.screenshot({ path: `${OUT}/live${n}-${mode}-lobby.png` }).catch(() => {});
  const layout = [];
  const checkLayout = async tag => {
    if (!LAYOUT) return;
    for (const [name, [w, h]] of Object.entries(HOST_SIZES)) {
      await page.setViewportSize({ width: w, height: h }); await sleep(900);
      const f = frameOf(); const probs = f ? await frameProblems(f).catch(e => [{ kind: 'error', what: e.message }]) : [{ kind: 'noframe' }];
      if (probs.length) layout.push({ tag, size: name, probs: probs.slice(0, 5) });
      await page.screenshot({ path: `${OUT}/live${n}-${mode}-${tag}-${name}.png` }).catch(() => {});
    }
    await page.setViewportSize({ width: 1920, height: 1080 });
  };
  await checkLayout('lobby');
  if (phone) await phone.screenshot({ path: `${OUT}/live${n}-${mode}-lobby-phone.png` }).catch(() => {});
  const game = mode.startsWith('game:');
  if (!game) clearInterval(walk);
  // Measure from here: start, play QUESTIONS questions, end.
  const p0 = PID ? proc(PID) : null, t0 = Date.now();
  for (const b of bots) if (b.ok) { b.msgs = 0; b.bytes = 0; }
  const lags = []; let pinging = true, playFps = null;
  (async () => { while (pinging) { const s = Date.now(); try { await fetch(B + '/health'); } catch { /* down */ } lags.push(Date.now() - s); await sleep(100); } })();
  await page.evaluate(() => document.querySelector('[data-lv-act="start"]:not([hidden])').click());
  const st = async () => { const f = frameOf(); try { return f && await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); } catch { return null; } };
  let shot = false;
  const wantRv = game ? 0 : mode === 'board' ? Math.min(QUESTIONS, 30) : QUESTIONS;
  if (game) {
    // A free-play game (a 3D world): everyone keeps running around and scoring for 20 s.
    const scorer = setInterval(() => { for (const b of bots) if (b.ok && b.ws.readyState === 1) { b.sc = (b.sc || 0) + 10; b.ws.send(JSON.stringify({ t: 'sc', n: b.sc })); } }, 1000);
    await sleep(8000); playFps = await fps(); await page.screenshot({ path: `${OUT}/live${n}-game.png` }).catch(() => {});
    if (phone) await phone.screenshot({ path: `${OUT}/live${n}-game-phone.png` }).catch(() => {});
    await sleep(12000); clearInterval(scorer); clearInterval(walk);
  }
  if (mode === 'tug') {
    // everyone answers on their own keypad for TUG_SECS seconds
    await until(async () => { const s = await st(); return s && s.phase === 'playing'; });
    await sleep(Math.min(8000, TUG_SECS * 500)); playFps = await fps();
    await page.screenshot({ path: `${OUT}/live${n}-${mode}.png` }).catch(() => {});
    await checkLayout('question');
    if (phone) await phone.screenshot({ path: `${OUT}/live${n}-${mode}-phone.png` }).catch(() => {});
    shot = true;
    await sleep(Math.max(0, TUG_SECS * 1000 - Math.min(8000, TUG_SECS * 500)));
  }
  const deadline = Date.now() + 60000 + wantRv * (SECS + 15) * 1000;
  while (mode !== 'tug' && hostMsgs.length < wantRv && Date.now() < deadline) {
    const s = await st();
    if (mode === 'board' && s && s.phase === 'between') await frameOf().evaluate(() => { const b = document.querySelector('.bb-tile.can'); b && b.click(); }).catch(() => {});
    if (s && s.phase === 'playing' && s.question && !shot) {
      await sleep(1500);
      playFps = await fps();
      await page.screenshot({ path: `${OUT}/live${n}-${mode}.png` });
      await checkLayout('question');
      if (phone) await phone.screenshot({ path: `${OUT}/live${n}-${mode}-phone.png` }).catch(() => {});
      shot = true;
    }
    if (mode !== 'board' && s && s.phase === 'between') {
      // the race (or the battle) after a reveal: a shot of the board with everyone on it, then Next
      if (hostMsgs.length === wantRv - 1 || (wantRv === 1)) {
        await page.screenshot({ path: `${OUT}/live${n}-${mode}-race.png` }).catch(() => {});
        if (phone) await phone.screenshot({ path: `${OUT}/live${n}-${mode}-race-phone.png` }).catch(() => {});
      }
      await sleep(mode === 'quest-race' ? 4000 : 0);
      await page.evaluate(() => { const b = document.querySelector('#lv-controls [data-lv-act="next"]:not([hidden])'); b && b.click(); }).catch(() => {});
    }
    await sleep(400);
  }
  await sleep(2500); // the last leaderboard
  const secs = (Date.now() - t0) / 1000, p1 = PID ? proc(PID) : null;
  pinging = false;
  // Correctness.
  const ok = bots.filter(b => b.ok);
  const qsSeen = ok.map(b => b.qs.size), answeredTotal = ok.reduce((k, b) => k + b.answered.size, 0);
  const counted = hostMsgs.filter(m => !m.skipped).reduce((k, m) => k + (m.counts || []).reduce((a, c) => a + c, 0), 0);
  const lbN = Math.max(0, ...ok.map(b => b.lbN));
  const sorted = [...lags].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const res = {
    mode: game ? 'game' : mode, players: n, seated, refused: bots.filter(b => !b.ok).map(b => b.code),
    questions: hostMsgs.length, everyBotGotEveryQuestion: qsSeen.every(k => k >= hostMsgs.length),
    answersSent: answeredTotal, answersCounted: counted, leaderboardCounts: lbN,
    cpuPct: p0 && p1 ? Math.round(((p1.cpu - p0.cpu) / secs) * 100) : null, rssMB: p1 ? Math.round(p1.rss) : null,
    healthP95ms: p95, msgsPerSecPerPlayer: +(ok.reduce((k, b) => k + b.msgs, 0) / ok.length / secs).toFixed(1),
    kbPerSecPerPlayer: +(ok.reduce((k, b) => k + b.bytes, 0) / ok.length / secs / 1024).toFixed(2),
    hostFpsLobby: lobbyFps, hostFpsPlaying: playFps, secs: Math.round(secs), ...(LAYOUT ? { layout } : {}),
  };
  if (mode === 'tug') {
    // every bot got questions of its own, and (all but the last few in flight) every answer came back checked
    const sent = ok.reduce((k, b) => k + b.sent, 0), back = ok.reduce((k, b) => k + b.tr, 0);
    Object.assign(res, { everyBotGotEveryQuestion: ok.every(b => b.tq >= 2), answersSent: sent, answersCounted: back, tugQuestions: ok.reduce((k, b) => k + b.tq, 0) });
    res.pass = (!LAYOUT || !layout.length) && res.seated === n + (phone ? 1 : 0) && res.everyBotGotEveryQuestion && back >= sent - n;
  } else res.pass = (!LAYOUT || !layout.length) && res.seated === n + (phone ? 1 : 0) && res.everyBotGotEveryQuestion && res.answersCounted >= res.answersSent - n * 0.05 && res.questions >= wantRv && (mode === 'board' || res.leaderboardCounts === 0 || res.leaderboardCounts >= n);
  await page.locator('[data-lv-act="end"]:not([hidden])').click().catch(() => {});
  await page.locator('.lv-confirm button, [data-lv-confirm]').first().click({ timeout: 2000 }).catch(() => {});
  for (const b of ok) try { b.ws.close(); } catch { /* gone */ }
  await sleep(500);
  if (ctx) await ctx.close();
  if (phone) await phone.context().close();
  return res;
}

(async () => {
  let browser = null;
  { const { chromium } = await import('@playwright/test'); browser = await chromium.launch(process.env.BRB_CHROMIUM ? { executablePath: process.env.BRB_CHROMIUM } : {}); }
  const cookie = await login();
  const results = []; let tag = 0;
  for (const mode of MODES) for (const n of SIZES) {
    const r = await run(browser, cookie, mode, n, tag++);
    results.push(r); console.log(JSON.stringify(r));
  }
  fs.writeFileSync(`${OUT}/load.json`, JSON.stringify(results, null, 1));
  if (browser) await browser.close();
  process.exit(results.every(r => r.pass) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
