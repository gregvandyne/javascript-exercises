// Oomba Live, frame by frame: the teacher picks Brain Board, Ages 10-11, an open room in two teams; a phone types the
// code and joins (three more join off screen); the teacher opens a Science tile, everyone answers, the answer is revealed
// and the team scores go up. Clips: live-pick, live-lobby(-host,-phone), live-game(-host,-phone), and live-game.json
// (times, and where the board and the join code are on the host's page, for the crops in assemble.mjs).
// The wizard is recorded in a window shaped like the band under the caption (1152 x 558, shown at 1920 x 930); the room
// in a 1440 x 810 window at the same 5/3 scale, so assemble.mjs can crop the board and the code without blur.
import { chromium } from 'playwright';
import { launchOptions } from '../chromium.js';
import fs from 'node:fs';
import http from 'node:http';
import { Capture, VCLOCK, cursorInit, setCursor, glide } from './vc.mjs';
const B = process.env.LIVE_B || 'http://localhost:3350';
const login = async (page, u, pw) => { await page.goto(B + '/login'); await page.fill('#username', u); await page.fill('#password', pw); await Promise.all([page.waitForURL(x => !x.pathname.startsWith('/login')), page.click('button[type=submit]')]); };
const C = '/tmp/claude-0/demo2/clips';
const br = await chromium.launch(launchOptions({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] }, { headless: true }));
const K = 5 / 3;
const hc = await br.newContext({ viewport: { width: 1152, height: 558 }, deviceScaleFactor: K, extraHTTPHeaders: { 'x-forwarded-for': '10.6.7.1' } });
await hc.addInitScript(() => {
  const fix = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/localhost:33\d\d/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/(https?:\/\/)?localhost:33\d\d/g, 'oomba.ai'); };
  document.addEventListener('DOMContentLoaded', () => { fix(document.body); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 ? fix(n) : n.nodeType === 3 && fix(n.parentNode || document.body)))).observe(document.body, { childList: true, subtree: true, characterData: true }); });
});
const host = await hc.newPage(); host.__name = 'host';
await login(host, 'DemoTeacher', 'demo-pass-123');
await hc.addInitScript(VCLOCK);
// One clock for the server, the host and the phones (slowclock.mjs with LIVE_CLOCK_PORT): every timer agrees on screen.
const CLK = process.env.LIVE_CLOCK_URL || 'http://127.0.0.1:3351';
const clk = q => new Promise((res, rej) => http.get(CLK + q, r => { let b = ''; r.on('data', d => { b += d; }); r.on('end', () => res(b)); }).on('error', rej));
try {
  Capture.wall = +(await clk('/now'));
  Capture.onWall = t => clk(`/set?t=${Math.round(t)}`);
  console.log('driving the live clock at', CLK);
} catch (e) { console.log('no clock control at', CLK, '(start the server with LIVE_CLOCK_PORT): each page keeps its own clock', e.message); }
const RIGHT = new Map(fs.readdirSync('server/live/bank/en').flatMap(f => Object.values(JSON.parse(fs.readFileSync('server/live/bank/en/' + f, 'utf8'))).flat()).map(r => [r[0], r[1]]));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const frameOf = p => p.frames().find(f => /\/live\/frame\//.test(f.url()));
const st = async p => { try { return await frameOf(p).evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); } catch { return null; } };
/** Capture frames until fn() is true (checked every frame), at most max seconds. */
async function capUntil(cap, fn, max = 20) { for (let i = 0; i < max * 30; i++) { if (await fn()) return true; await cap.frame(); } log('capUntil timed out'); return false; }
async function stepUntil(cap, fn, max = 20) { for (let i = 0; i < max * 30; i++) { if (await fn()) return true; await cap.stepAll(33.3); await new Promise(r => setTimeout(r, 30)); } log('stepUntil timed out'); return false; }

// A) the teacher's picks: Brain Board, a level, an open room (guests with made-up names), two teams
await host.goto(B + '/live'); await host.waitForLoadState('networkidle').catch(() => {});
let cap = new Capture([host], `${C}/tmp-pick`);
await cap.advance(600); await cursorInit(host); await host.evaluate(() => window.scrollTo(0, 0)); await setCursor(host, 1152 * 0.62, 558 * 0.72);
await cap.seconds(0.4);
await glide(cap, host, host.locator('label:has(input[value="mode:board"])').first(), { sec: 0.5 }); await cap.seconds(0.25);
// The host page is a few steps (game, questions, who can join, open): Next between them.
const next = async () => { await glide(cap, host, host.locator('[data-go="next"]:visible').first(), { sec: 0.4 }); await cap.seconds(0.35); };
await next();
await glide(cap, host, host.locator('#lv-bank-level'), { sec: 0.45 }); await host.selectOption('#lv-bank-level', { label: 'Ages 10–11' }); await cap.seconds(0.35);
await next();
// Who can join: anyone with the code, as guests with safe made-up names (a class game is the signed-in class only).
await glide(cap, host, host.locator('label:has(input[value="open"])').first(), { sec: 0.4 }); await host.check('input[value="open"]').catch(() => {}); await cap.seconds(0.2);
await glide(cap, host, host.locator('label.lv-seg-opt:has(input[name="teams"][value="2"])').first(), { sec: 0.4 }); await cap.seconds(0.2);
await next();
const open = host.locator('button:has-text("Open the room")').first();
await glide(cap, host, open, { sec: 0.45, click: false }); await cap.seconds(0.15);
cap.encode('live-pick', { host: [1920, 930] }); log('pick captured');
await host.setViewportSize({ width: 1440, height: 810 });
await open.click();
// a room left open by an earlier run: end it and open this one (off camera)
const again = host.locator('button:has-text("End it and open")');
for (let i = 0; i < 20 && !/\/live\/(host|room|s)\//.test(host.url()); i++) { if (await again.isVisible().catch(() => false)) await again.click(); await new Promise(r => setTimeout(r, 250)); }
await host.waitForURL(/\/live\/(host|room|s)\//, { timeout: 20000 });
cap = new Capture([host], `${C}/tmp-x`);
await stepUntil(cap, async () => frameOf(host) && await st(host), 30);
await cap.advance(1500);
const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, ''); log('code', code, host.url());

// B) phones join
const phones = [];
for (let i = 0; i < 4; i++) {
  const c = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': `10.6.10.${i + 5}` } });
  await c.addInitScript(VCLOCK);
  const p = await c.newPage(); p.__name = 'phone'; phones.push(p);
}
const ph = phones[0];
await ph.goto(B + '/join'); await ph.waitForLoadState('networkidle').catch(() => {});
cap = new Capture([host, ph], `${C}/tmp-lobby`, phones.slice(1));
const joinOff = async p => {
  await p.goto(`${B}/join#${code}`); await p.click('#lv-join button[type=submit]');
  await p.locator('#lv-go').waitFor({ timeout: 10000 }); await Promise.all([p.waitForURL(/\/live\/play\//, { timeout: 20000 }).catch(() => {}), p.click('#lv-go')]);
};
// one classmate is in already (off screen), so the room isn't empty and the phone on screen joins the other team
await joinOff(phones[1]); await cap.advance(800);
await cap.advance(500);
await cap.seconds(0.5);
const box = ph.locator('#lv-join input').first(); await box.click();
for (const ch of code) { await ph.keyboard.type(ch); await cap.frames(4); }
await cap.seconds(0.3);
await ph.click('#lv-join button[type=submit]', { noWaitAfter: true });
await capUntil(cap, async () => await ph.locator('#lv-go').isVisible().catch(() => false), 10); await cap.seconds(0.6);
await Promise.all([ph.waitForURL(/\/live\/play\//, { timeout: 20000 }).catch(() => {}), ph.click('#lv-go', { noWaitAfter: true })]);
await capUntil(cap, async () => !!(await st(ph)), 20);
for (const p of phones.slice(2)) { await joinOff(p); await cap.seconds(0.5); }
await cap.seconds(1.4);
// where the code card and the game are on the host's page (css px), for the crops
const boxes = await host.evaluate(() => {
  const r = e => { const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
  let card = document.getElementById('lv-code'); while (card.parentElement && card.getBoundingClientRect().height < 300) card = card.parentElement;
  return { card: r(card), game: r(document.querySelector('iframe')) };
});
cap.encode('live-lobby', { host: [2400, 1350], phone: [780, 1688] }); log('lobby captured', JSON.stringify(boxes));

// C) the game: the teacher opens a Science tile, everyone answers, the answer shows and the team scores go up
cap = new Capture([host, ph], `${C}/tmp-game`, phones.slice(1));
await cap.seconds(0.3);
await host.locator('[data-lv-act="start"]:not([hidden])').click({ noWaitAfter: true });
await capUntil(cap, async () => { const s = await st(host); return s && s.canPick; }, 25);
await cursorInit(host); await setCursor(host, 1440 * 0.55, 810 * 0.85);
const M = { board: cap.n / 30 };
await cap.seconds(0.5);
M.pick = cap.n / 30;
// tiles are listed column by column (5 rows each): Science (column 2), 200 points
await glide(cap, host, frameOf(host).locator('.bb-tile').nth(6), { sec: 0.55 });
{ const s0 = await host.evaluate(() => window.__cur), n = 18;   // the cursor eases off the board, to the controls
  await cap.frames(n, i => { const k = (i + 1) / n, e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; return setCursor(host, s0.x + (1250 - s0.x) * e, s0.y + (760 - s0.y) * e); }); }
await capUntil(cap, async () => { const s = await st(ph); return s && s.phase === 'playing' && s.question && !s.question.answered; }, 25);
M.q = cap.n / 30; log('question at', M.q);
await cap.seconds(1.4);
{ const f = frameOf(ph); const ps = await st(ph); const right = ps && ps.question && RIGHT.get(ps.question.q); const ok = right ? ps.question.choices.indexOf(right) : -1; log('answer', ok, right, ps && ps.question && ps.question.q);
  M.ok = ok >= 0 ? ok : 0;
  await f.evaluate(i => window.__brbTest.answer(i), M.ok).catch(() => {}); }
M.a = cap.n / 30;
await cap.seconds(0.5);
// two more right answers and one wrong one from the phones off screen
for (const [i, p] of phones.slice(1).entries()) { await frameOf(p).evaluate(i => window.__brbTest.answer(i), i < 2 ? M.ok : (M.ok + 1) % 4).catch(() => {}); await cap.seconds(0.3); }
await capUntil(cap, async () => { const s = await st(host); return s && s.phase === 'between'; }, 25);
M.r = cap.n / 30; log('revealed at', M.r);
await cap.seconds(5.5);
M.end = cap.n / 30;
fs.writeFileSync(`${C}/live-game.json`, JSON.stringify({ ...M, ...boxes, scale: K }));
cap.encode('live-game', { host: [2400, 1350], phone: [780, 1688] }); log('game captured', M);
await br.close();
