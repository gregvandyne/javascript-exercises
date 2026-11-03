// Oomba Live, frame by frame: the teacher picks Quest Race + Science / Ages 10-11 and opens a room; a phone types the
// code and joins (two more join off screen); a question is answered and the race moves. Clips: live-pick, live-lobby(-host,-phone), live-game(-host,-phone).
import { chromium } from 'playwright';
import fs from 'node:fs';
import { Capture, VCLOCK, cursorInit, setCursor, glide } from './vc.mjs';
const B = process.env.LIVE_B || 'http://localhost:3350';
const login = async (page, u, pw) => { await page.goto(B + '/login'); await page.fill('#username', u); await page.fill('#password', pw); await Promise.all([page.waitForURL(x => !x.pathname.startsWith('/login')), page.click('button[type=submit]')]); };
const C = '/tmp/claude-0/demo2/clips';
const br = await chromium.launch({ args: ['--use-gl=angle', '--ignore-gpu-blocklist'] });
const hc = await br.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, extraHTTPHeaders: { 'x-forwarded-for': '10.6.7.1' } });
await hc.addInitScript(() => {
  const fix = root => { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); for (let n; (n = w.nextNode());) if (/localhost:33\d\d/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/(https?:\/\/)?localhost:33\d\d/g, 'oomba.ai'); };
  document.addEventListener('DOMContentLoaded', () => { fix(document.body); new MutationObserver(ms => ms.forEach(m => m.addedNodes.forEach(n => n.nodeType === 1 ? fix(n) : n.nodeType === 3 && fix(n.parentNode || document.body)))).observe(document.body, { childList: true, subtree: true, characterData: true }); });
});
const host = await hc.newPage(); host.__name = 'host';
await login(host, 'DemoTeacher', 'demo-pass-123');
await hc.addInitScript(VCLOCK);
const RIGHT = new Map(Object.values(JSON.parse(fs.readFileSync('server/live/bank/en/science.json', 'utf8'))).flat().map(r => [r[0], r[1]]));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const frameOf = p => p.frames().find(f => /\/live\/frame\//.test(f.url()));
const st = async p => { try { return await frameOf(p).evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state()); } catch { return null; } };
/** Capture frames until fn() is true (checked every frame), at most max seconds. */
async function capUntil(cap, fn, max = 20) { for (let i = 0; i < max * 30; i++) { if (await fn()) return true; await cap.frame(); } log('capUntil timed out'); return false; }
async function stepUntil(cap, fn, max = 20) { for (let i = 0; i < max * 30; i++) { if (await fn()) return true; await cap.stepAll(33.3); await new Promise(r => setTimeout(r, 30)); } log('stepUntil timed out'); return false; }

// A) the teacher's picks
await host.goto(B + '/live'); await host.waitForLoadState('networkidle').catch(() => {});
let cap = new Capture([host], `${C}/tmp-pick`);
await cap.advance(600); await cursorInit(host); await host.evaluate(() => window.scrollTo(0, 0)); await setCursor(host, 1440 * 0.62, 810 * 0.72);
await cap.seconds(0.4);
await glide(cap, host, host.locator('label:has(input[value="mode:quest-race"])').first(), { sec: 0.5 }); await cap.seconds(0.25);
await glide(cap, host, host.locator('#lv-bank-subject'), { sec: 0.45 }); await host.selectOption('#lv-bank-subject', { label: 'Science' }); await cap.seconds(0.3);
await glide(cap, host, host.locator('#lv-bank-level'), { sec: 0.4 }); await host.selectOption('#lv-bank-level', { label: 'Ages 10–11' }); await cap.seconds(0.25);
await glide(cap, host, host.locator('#lv-bank-count'), { sec: 0.35 }); await host.selectOption('#lv-bank-count', { label: '5' }); await cap.seconds(0.2);
// scroll down smoothly, driven per frame (the cursor stays put on screen)
{ const maxY = await host.evaluate(() => document.documentElement.scrollHeight - innerHeight); const y0 = await host.evaluate(() => scrollY); const n = 16;
  await cap.frames(n, i => host.evaluate(y => window.scrollTo(0, y), y0 + (maxY - y0) * (1 - Math.pow(1 - (i + 1) / n, 3)))); }
await glide(cap, host, host.locator('label:has(input[value="open"])').first(), { sec: 0.4 }); await host.check('input[value="open"]').catch(() => {}); await cap.seconds(0.2);
const open = host.locator('button:has-text("Open the room")').first();
await glide(cap, host, open, { sec: 0.45, click: false }); await cap.seconds(0.15);
cap.encode('live-pick', { host: [1920, 1080] }); log('pick captured');
await Promise.all([host.waitForURL(/\/live\/(host|room|s)\//, { timeout: 20000 }).catch(() => {}), open.click()]);
cap = new Capture([host], `${C}/tmp-x`);
await stepUntil(cap, async () => frameOf(host) && await st(host), 30);
await cap.advance(1500);
const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, ''); log('code', code, host.url());

// B) phones join
const phones = [];
for (let i = 0; i < 3; i++) {
  const c = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, extraHTTPHeaders: { 'x-forwarded-for': `10.6.10.${i + 5}` } });
  await c.addInitScript(VCLOCK);
  const p = await c.newPage(); p.__name = 'phone'; phones.push(p);
}
const ph = phones[0];
await ph.goto(B + '/join'); await ph.waitForLoadState('networkidle').catch(() => {});
cap = new Capture([host, ph], `${C}/tmp-lobby`, phones.slice(1));
await cap.advance(500);
await cap.seconds(0.5);
const box = ph.locator('#lv-join input').first(); await box.click();
for (const ch of code) { await ph.keyboard.type(ch); await cap.frames(4); }
await cap.seconds(0.3);
await ph.click('#lv-join button[type=submit]', { noWaitAfter: true });
await capUntil(cap, async () => await ph.locator('#lv-go').isVisible().catch(() => false), 10); await cap.seconds(0.6);
await Promise.all([ph.waitForURL(/\/live\/play\//, { timeout: 20000 }).catch(() => {}), ph.click('#lv-go', { noWaitAfter: true })]);
await capUntil(cap, async () => !!(await st(ph)), 20);
for (const p of phones.slice(1)) {
  await p.goto(`${B}/join#${code}`); await p.click('#lv-join button[type=submit]');
  await p.locator('#lv-go').waitFor({ timeout: 10000 }); await Promise.all([p.waitForURL(/\/live\/play\//, { timeout: 20000 }).catch(() => {}), p.click('#lv-go')]);
  await cap.seconds(0.5);
}
await cap.seconds(1.4);
cap.encode('live-lobby', { host: [1920, 1080], phone: [780, 1688] }); log('lobby captured');

// C) the game: one question, answered, revealed, the race moves
cap = new Capture([host, ph], `${C}/tmp-game`, phones.slice(1));
await cap.seconds(0.3);
await host.locator('[data-lv-act="start"]:not([hidden])').click({ noWaitAfter: true });
await capUntil(cap, async () => { const s = await st(ph); return s && s.phase === 'playing' && s.question && !s.question.revealed && s.answered == null; }, 25);
const M = { q: cap.n / 30 }; log('question at', M.q);
await cap.seconds(1.3);
{ const f = frameOf(ph); const ps = await st(ph); const right = ps && ps.question && RIGHT.get(ps.question.q); const ok = right ? ps.question.choices.indexOf(right) : null; log('answer', ok, right);
  const btns = f.locator('button.qr-a'); if (await btns.count()) await btns.nth(typeof ok === 'number' && ok >= 0 ? ok : 0).click({ noWaitAfter: true }).catch(() => {}); else await f.evaluate(() => window.__brbTest.answer(0)).catch(() => {}); }
await cap.seconds(0.5);
for (const [i, p] of phones.slice(1).entries()) { await frameOf(p).evaluate(i => window.__brbTest.answer(i === 0 ? 0 : 1), i).catch(() => {}); await cap.seconds(0.3); }
await capUntil(cap, async () => { const s = await st(host); return s && (s.reveal || (s.question && s.question.revealed) || s.phase === 'between'); }, 20);
M.r = cap.n / 30; log('revealed at', M.r);
await cap.seconds(5.5);
M.end = cap.n / 30;
fs.writeFileSync(`${C}/live-game.json`, JSON.stringify(M));
cap.encode('live-game', { host: [1920, 1080], phone: [780, 1688] }); log('game captured', M);
await br.close();
