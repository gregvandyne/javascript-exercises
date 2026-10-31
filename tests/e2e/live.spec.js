// Oomba Live end to end (docs/live-protocol.md; design: docs/decisions.md "Oomba Live"). A host (the demo teacher) on
// the projector page and players in their own browser contexts, all on the real socket: guests join with generated
// names (no cookies), everyone sees everyone move in the 3D lobby, a full Quest Race to the podium and the results, the
// classic Question Battle from the landing page, a class room with account names and saved scores, removal and the
// auto-lock, Hero of Sunvale (an existing 3D game made live-ready) with players seeing each other walk, a Builder game
// made live-ready in the Studio and hosted for the class, the 2D fallback and the Watch view, a 360px phone, RTL,
// reconnecting mid-race, and 40 bot seats against a low-tier device's draw-call budget.
// LIVE_SHOTS=<dir> saves the screenshots (host lobby, mid-race, phone, question card, podium, results, 2D, join card).
import { test, expect } from '@playwright/test';
import path from 'node:path';
import WebSocket from 'ws';
import { login, ownIp, templateGame, uniq } from './helpers.js';

const SHOTS = process.env.LIVE_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const TEACHER = { username: 'DemoTeacher', password: 'demo-pass-123' }, STUDENT = { username: 'DemoStudent', password: 'demo-pass-123' };
const ITEMS = [
  { q: 'What is 2 + 3?', choices: ['5', '4', '6', '7'], answer: 0, secs: 20 },
  { q: 'What is 6 + 1?', choices: ['7', '8', '5', '6'], answer: 0, secs: 20 },
  { q: 'What is 9 - 4?', choices: ['5', '6', '3', '4'], answer: 0, secs: 20 },
  { q: 'What is 3 + 3?', choices: ['6', '5', '7', '9'], answer: 0, secs: 20 },
];
const solve = q => { const m = /(\d+)\s*([+−×-])\s*(\d+)/.exec(q); const a = +m[1], b = +m[3]; return String(m[2] === '+' ? a + b : m[2] === '×' ? a * b : a - b); };
const no3d = () => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return k === 'webgl2' ? null : g.call(this, k, ...a); }; };

async function signedIn(browser, who, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage(); await login(page, who.username, who.password); return page;
}
/** Open a room as the host (JSON API, as the landing form sends it); -> the 7-digit code, on the projector page. */
async function openRoom(page, body) {
  const origin = new URL(page.url()).origin;
  const r = await page.request.post('/api/live/sessions', { data: { audience: 'open', replace: true, ...body }, headers: { Origin: origin } });
  expect(r.status(), await r.text()).toBe(200);
  await page.goto((await r.json()).redirect);
  return (await page.locator('#lv-code').textContent()).replace(/\s/g, '');
}
/** A player: a fresh context (own address), /join#code, the guest card (or "Join as me"), then the play page. */
async function player(browser, code, { viewport = { width: 420, height: 800 }, locale, init, account, reroll = false, shotName } = {}) {
  const ctx = await browser.newContext({ viewport, ...(locale ? { locale } : {}) });
  if (init) await ctx.addInitScript(init);
  const page = await ctx.newPage();
  if (account) await login(page, account.username, account.password); else await ownIp(page);
  await page.goto(`/join#${code}`);
  await expect(page.locator('#jc')).toHaveValue(code);
  expect(new URL(page.url()).hash).toBe('');   // the code left the address bar
  await page.click('#lv-join button[type=submit]');
  if (account) { await page.locator('#lv-as-me').click(); }
  else {
    await expect(page.locator('#lv-card-step')).toBeVisible();
    const nick = await page.locator('#lv-nick').textContent();
    expect(nick.length).toBeGreaterThan(3);
    if (reroll) { await page.click('#lv-reroll'); await expect(page.locator('#lv-nick')).not.toHaveText(nick); }
    if (shotName) { await page.waitForTimeout(400); await shot(page, shotName); }
    await page.click('#lv-go');
  }
  await page.waitForURL(/\/live\/play\//);
  return page;
}
/** The live game frame in a page, once its game is up. */
async function liveFrame(page, ready = s => s && s.game) {
  let f = null;
  await expect.poll(async () => {
    f = page.frames().find(x => /\/live\/frame\//.test(x.url()));
    if (!f) return false;
    try { return !!ready(await f.evaluate(() => window.__brbTest && window.__brbTest.state && window.__brbTest.state())); } catch { return false; }
  }, { timeout: 45_000 }).toBe(true);
  return f;
}
const state = f => f.evaluate(() => window.__brbTest.state());
async function waitPhase(f, phase, timeout = 20_000) { await expect.poll(async () => (await state(f)).phase, { timeout }).toBe(phase); }
async function waitQuestion(f, i) { await expect.poll(async () => { const s = await state(f); return s.phase === 'playing' && s.question && s.question.i === i ? 'open' : s.phase; }, { timeout: 25_000 }).toBe('open'); return (await state(f)).question; }
const act = (host, a) => host.locator(`[data-lv-act="${a}"]:not([hidden])`).click();

test.describe.configure({ mode: 'serial' });

test('Quest Race, open room: guests join with generated names, see each other move, race to the podium; results; no guest cookies', async ({ browser }) => {
  test.setTimeout(300_000);
  const host = await signedIn(browser, TEACHER);
  const code = await openRoom(host, { pick: 'mode:quest-race', items: ITEMS });
  expect(code).toMatch(/^\d{7}$/);
  await expect(host.locator('#lv-qr svg')).toBeVisible();
  await expect(host.locator('#lv-code')).toHaveAttribute('dir', 'ltr');
  const a = await player(browser, code, { reroll: true, shotName: 'join-nickname-card' });
  const b = await player(browser, code, { viewport: { width: 360, height: 740 } });
  const c = await player(browser, code, { init: no3d });
  // guests have no cookies at all (the seat token is in sessionStorage)
  for (const p of [a, b, c]) expect(await p.context().cookies()).toEqual([]);
  await expect(host.locator('#lv-roster li')).toHaveCount(3);
  await expect(host.locator('#lv-count')).toContainText('3 of');
  // the roster never links to anyone
  expect(await host.locator('#lv-roster a').count()).toBe(0);
  let fa = await liveFrame(a, s => s.started3d);
  const [fb, fc] = [await liveFrame(b, s => s.started3d), await liveFrame(c, s => s.view === '2d')];
  const hf = await liveFrame(host, s => s.started3d);
  expect((await state(fc)).view).toBe('2d');                       // no WebGL 2: the race top-down, no device card
  expect(await fc.locator('#brb-device').count()).toBe(0);
  // B runs around the lobby; A (3D) and C (2D) see B move
  const seatB = (await state(fb)).me.seat;
  const before = (await state(fa)).others.find(o => o.seat === seatB);
  await fb.evaluate(() => window.__brbTest.walk(1, 0, 1500));
  await expect.poll(async () => { const o = (await state(fa)).others.find(x => x.seat === seatB); return o && o.x !== null && Math.abs(o.x - (before.x ?? o.x + 1)) > 1; }, { timeout: 10_000 }).toBe(true);
  await expect.poll(async () => { const o = (await state(fc)).others.find(x => x.seat === seatB); return !!(o && o.x !== null); }, { timeout: 10_000 }).toBe(true);
  await host.waitForTimeout(600);
  await shot(host, 'host-lobby'); await shot(a, 'player-3d-lobby-others');
  await shot(c, 'player-2d-fallback');
  await act(host, 'start');
  // A answers right every time, B always wrong, C right on the even questions
  const progress = { a: [], b: [] };
  for (let i = 0; i < ITEMS.length; i++) {
    const q = await waitQuestion(fa, i);
    const right = q.choices.indexOf(solve(q.q));
    if (i === 0) { await a.waitForTimeout(1200); await shot(b, 'player-question-card'); await shot(a, 'player-3d-question-others'); }
    await fa.evaluate(k => window.__brbTest.answer(k), right);
    await fb.evaluate(k => window.__brbTest.answer(k), (right + 1) % q.choices.length);
    await fc.evaluate(k => window.__brbTest.answer(k), i % 2 ? (right + 1) % q.choices.length : right);
    await waitPhase(fa, 'between');
    await expect.poll(async () => (await state(fa)).me.target).toBeGreaterThan(progress.a.at(-1) || 0);
    progress.a.push((await state(fa)).me.target); progress.b.push((await state(fb)).me.target);
    if (i === 1) {
      // reconnect: A reloads mid-race and keeps the seat and the progress
      const seatA = (await state(fa)).me.seat, tgt = (await state(fa)).me.target;
      await a.reload();
      const fa2 = await liveFrame(a, s => s.started3d && s.me && s.me.target > 0);
      expect((await state(fa2)).me.seat).toBe(seatA); expect((await state(fa2)).me.target).toBe(tgt);
      fa = fa2;
      await a.waitForTimeout(2500);
      await shot(host, 'host-mid-race'); await shot(a, 'player-3d-mid-race'); await shot(b, 'player-phone-3d-mid-race');
    }
    await act(host, 'next');
  }
  const fa3 = await liveFrame(a, s => s.phase === 'ended');
  expect(progress.b.every(x => x === 0)).toBe(true);               // wrong answers never move a runner
  const end = await state(fa3);
  expect(end.me.target).toBeGreaterThanOrEqual(990);
  expect(end.podium[0]).toBe(end.me.seat);                          // all right and quick: first on the podium
  await expect(a.locator('#lv-place')).toContainText(/1/);
  await a.waitForTimeout(1500); await shot(a, 'podium-player');
  await host.waitForURL(/\/live\/results\//);
  await expect(host.locator('.lv-table tbody tr')).toHaveCount(3);
  await expect(host.locator('.lv-results')).toContainText('3 guests played');
  await expect(host.locator('.lv-items li')).toHaveCount(ITEMS.length);
  await shot(host, 'results-table');
  // the code is dead now
  const again = await a.request.post('/api/live/join', { data: { code }, headers: { Origin: new URL(a.url()).origin } });
  expect(again.status()).toBe(404);
  void hf;
  for (const p of [a, b, c, host]) await p.context().close();
});

test('Question Battle from the landing page: questions on the projector, answers on devices, ended early by the host', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  await host.goto('/live?mode=battle');
  await expect(host.locator('input[name="pick"][value="mode:battle"]')).toBeChecked();
  await expect(host.locator('#lv-sets')).toBeVisible();
  await host.locator('input[name="audience"][value="open"]').check();
  host.on('dialog', d => d.accept());
  await host.click('#lv-new button[type=submit]');
  await host.waitForURL(/\/live\/host\//);
  const code = (await host.locator('#lv-code').textContent()).replace(/\s/g, '');
  const a = await player(browser, code), b = await player(browser, code);
  const [fa, fb] = [await liveFrame(a), await liveFrame(b)];
  await liveFrame(host);
  await act(host, 'start');
  for (let i = 0; i < 2; i++) {
    const q = await waitQuestion(fa, i);
    const right = q.choices.indexOf(solve(q.q));
    // the answers are real buttons, at least 48px tall
    const btn = fa.locator('.qb-a').first(); expect((await btn.boundingBox()).height).toBeGreaterThanOrEqual(48);
    await fa.locator('.qb-a').nth(right).click();
    await fb.locator('.qb-a').nth((right + 1) % q.choices.length).click();
    await waitPhase(fa, 'between');
    await expect(fa.locator('#note')).toContainText('Right');
    if (i === 0) { await host.waitForTimeout(500); await shot(host, 'battle-host-reveal'); }
    await act(host, 'next');
  }
  await waitQuestion(fa, 2);
  await act(host, 'end');                                            // asks first (accepted above)
  await host.waitForURL(/\/live\/results\//);
  await expect(host.locator('.lv-table tbody tr').first()).toContainText('1');
  for (const p of [a, b, host]) await p.context().close();
});

test('class room: only the class\'s signed-in students, shown by account name; their scores are kept for the class', async ({ browser }) => {
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS.slice(0, 2), audience: 'class', classId });
  await expect(host.locator('.lv-joinbox')).toContainText('Sign in first');
  // a guest is asked to sign in
  const g = await (await browser.newContext()).newPage(); await ownIp(g);
  await g.goto(`/join#${code}`); await g.click('#lv-join button[type=submit]');
  await expect(g.locator('#lv-err')).toContainText('Sign in first');
  await expect(g.locator('#lv-err a')).toHaveAttribute('href', /\/login/);
  // the class's student joins as themselves
  const s = await player(browser, code, { account: STUDENT });
  await expect(s.locator('#lv-me-name')).toHaveText('DemoStudent');
  await expect(host.locator('#lv-roster')).toContainText('DemoStudent');
  const fs = await liveFrame(s);
  await liveFrame(host);
  await act(host, 'start');
  for (let i = 0; i < 2; i++) {
    const q = await waitQuestion(fs, i);
    await fs.evaluate(k => window.__brbTest.answer(k), q.choices.indexOf(solve(q.q)));
    await waitPhase(fs, 'between');
    await act(host, 'next');
  }
  await host.waitForURL(/\/live\/results\//);
  await expect(host.locator('.lv-table')).toContainText('DemoStudent');
  // the class progress page lists the run
  await host.goto(`/class/${classId}/progress`);
  await expect(host.locator('#live-games')).toContainText('Question Battle');
  await host.locator('#live-games a').first().click();
  await expect(host.locator('.lv-table')).toContainText('DemoStudent');
  for (const p of [g, s, host]) await p.context().close();
});

test('removal and the lock: a removed player sees it and cannot come back; the room locks at the start', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await signedIn(browser, TEACHER);
  host.on('dialog', d => d.accept());
  const code = await openRoom(host, { pick: 'mode:battle', items: ITEMS });
  const a = await player(browser, code), c = await player(browser, code);
  await liveFrame(a); await liveFrame(c);
  await expect(host.locator('#lv-roster li')).toHaveCount(2);
  await host.locator('#lv-roster li').nth(1).locator('[data-lv-kick]').click();
  await expect(c.locator('#lv-end-title')).toContainText('removed');
  await expect(host.locator('#lv-roster li')).toHaveCount(1);
  // the same browser trying again with the code is told no (the seat's marker), and so is a fresh one after the start
  await c.goto(`/join#${code}`); await c.click('#lv-join button[type=submit]');
  await expect(c.locator('#lv-err')).toContainText("can't join");
  await act(host, 'start');
  const late = await (await browser.newContext()).newPage(); await ownIp(late);
  await late.goto(`/join#${code}`); await late.click('#lv-join button[type=submit]');
  await expect(late.locator('#lv-err')).toContainText('locked');
  await act(host, 'end');
  for (const p of [a, c, late, host]) await p.context().close();
});

test('Hero of Sunvale live: players see each other walk in the village; the projector shows the class; no 3D gets the Watch map', async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await signedIn(browser, TEACHER);
  await host.goto('/g/hero-of-sunvale');
  await expect(host.locator('#hostlive')).toBeVisible();              // "Host live" on the game page of a live-ready game
  const gameId = new URL(await host.locator('#hostlive').getAttribute('href'), 'http://x').searchParams.get('game');
  const code = await openRoom(host, { pick: `game:${gameId}` });
  const a = await player(browser, code, { viewport: { width: 900, height: 700 } });
  const b = await player(browser, code, { viewport: { width: 900, height: 700 } });
  const w = await player(browser, code, { init: no3d });
  const ready = s => s && s.ready;
  const [fa, fb] = [await liveFrame(a, ready), await liveFrame(b, ready)];
  await expect(w.locator('#lv-watch')).toBeVisible();                 // a 3D game with no 2D path: the Watch map
  for (const f of [fa, fb]) await f.evaluate(() => window.__brbTest.start());
  const seatB = await fb.evaluate(() => Oomba.live.me.seat);
  await expect.poll(() => fa.evaluate(s => !!Oomba.live.position(s), seatB), { timeout: 15_000 }).toBe(true);
  const p0 = await fa.evaluate(s => Oomba.live.position(s), seatB);
  await fb.evaluate(() => window.__brbTest.press('up', 2.5));
  await expect.poll(async () => { const p = await fa.evaluate(s => Oomba.live.position(s), seatB); return Math.hypot(p.x - p0.x, p.z - p0.z) > 2; }, { timeout: 15_000 }).toBe(true);
  // B's hero is drawn in A's world (the crowd), and the solo game is untouched (A still plays its own Sunvale)
  expect(await fa.evaluate(() => Oomba.live.role)).toBe('player');
  await act(host, 'start');
  await liveFrame(host, ready);
  await expect(host.frames().find(f => /\/live\/frame\//.test(f.url())).locator('#liveMeter')).toContainText(/\d/);
  await host.waitForTimeout(2000); await shot(host, 'hero-host-view'); await shot(a, 'hero-player-sees-others');
  await act(host, 'end');
  for (const p of [a, b, w, host]) await p.context().close();
});

test('a Builder game made live-ready in the Studio (mock Builder), shared with the class and hosted live', async ({ browser }) => {
  test.setTimeout(240_000);
  const kid = await signedIn(browser, STUDENT);
  const game = await templateGame(kid);
  await expect(kid.locator('#st-liveclass [data-act="make-live"]')).toBeVisible();
  await kid.click('#st-liveclass [data-act="make-live"]');
  await expect(kid.locator('#st-liveclass')).toContainText('Live-ready', { timeout: 60_000 });
  await expect(kid.locator('#st-liveclass')).toContainText('teacher');   // a kid never hosts: a teacher or grown-up does
  await kid.click('#st-publish');
  const sheet = kid.locator('.sheet').filter({ has: kid.locator('#vis-go') });
  await sheet.locator('[data-vis="class"]').click();
  if (await sheet.locator('#cp-all').count()) await sheet.locator('#cp-all').check();   // one class: no list to tick
  await sheet.locator('#vis-go').click();
  await expect(kid.locator('#vis-go')).toHaveCount(0);
  const host = await signedIn(browser, TEACHER);
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  await expect(host.locator(`input[name="pick"][value="game:${game.id}"]`)).toHaveCount(1);   // listed under "Shared with my classes"
  const code = await openRoom(host, { pick: `game:${game.id}`, audience: 'class', classId });
  const s = await player(browser, code, { account: STUDENT });
  // a game without its own lobby: the platform lobby first, then the game when the host starts
  await liveFrame(s, st => st.view);
  await act(host, 'start');
  const fs = await liveFrame(s, st => st.scene === 'play' || st.scene === 'countdown' || st.scene === 'intro' || st.scene === 'howto');
  expect(await fs.evaluate(() => Oomba.live.active)).toBe(true);
  await expect(host.locator('#lv-roster')).toContainText('DemoStudent');
  await act(host, 'end');
  for (const p of [kid, s, host]) await p.context().close();
});

test('phone 360px and right to left: the join card, the play page and the code fit; names in the player\'s language', async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await signedIn(browser, TEACHER);
  const code = await openRoom(host, { pick: 'mode:quest-race', items: ITEMS });
  const he = await player(browser, code, { locale: 'he-IL', viewport: { width: 360, height: 740 } });
  expect(await he.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(he.locator('#lv-me-name')).toHaveText(/[֐-׿]/);   // a Hebrew nickname
  expect(await he.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const fr = await liveFrame(he, s => s.view);
  expect(await fr.evaluate(() => document.documentElement.dir)).toBe('rtl');
  const ar = await (await browser.newContext({ locale: 'ar', viewport: { width: 360, height: 740 } })).newPage();
  await ownIp(ar); await ar.goto('/join');
  expect(await ar.evaluate(() => document.documentElement.dir)).toBe('rtl');
  await expect(ar.locator('#jc')).toHaveAttribute('dir', 'ltr');
  expect(await ar.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const box = await ar.locator('#lv-join button[type=submit]').boundingBox(); expect(box.height).toBeGreaterThanOrEqual(48);
  // nothing for sale on a player's page
  for (const p of [he, ar]) expect(await p.content()).not.toMatch(/\/plans|checkout|subscribe|€|\$\d/i);
  await act(host, 'end');
  for (const p of [he, ar, host]) await p.context().close();
});

test('40 bot seats moving and a low-tier device: positions arrive, the crowd stays within its draw-call budget', async ({ browser, baseURL, request }) => {
  test.setTimeout(180_000);
  const host = await signedIn(browser, TEACHER);
  const code = await openRoom(host, { pick: 'mode:quest-race', items: ITEMS });
  const origin = new URL(baseURL).origin, wsUrl = origin.replace(/^http/, 'ws') + '/api/live/ws';
  const bots = [];
  for (let i = 0; i < 40; i++) {
    const r = await request.post('/api/live/join', { data: { code }, headers: { Origin: origin, 'X-Forwarded-For': `10.9.${i}.1` } });
    expect(r.status()).toBe(200);
    const { tok } = await r.json();
    const ws = new WebSocket(wsUrl, { headers: { Origin: origin } });
    await new Promise((ok, bad) => { ws.on('open', ok); ws.on('error', bad); });
    ws.send(JSON.stringify({ t: 'hello', v: 1, tok }));
    ws.send(JSON.stringify({ t: 'rdy', view: '3d' }));
    bots.push(ws);
  }
  const me = await player(browser, code);
  await me.goto(me.url() + '?okTier=low');
  const f = await liveFrame(me, s => s.started3d);
  const START = await f.evaluate(() => window.QR.START);
  const t0 = Date.now();
  while (Date.now() - t0 < 5000) {
    bots.forEach((ws, i) => { const a = (Date.now() / 4000 + i) % (Math.PI * 2); ws.send(JSON.stringify({ t: 'mv', p: [Math.round((START.x + Math.cos(a) * (2 + i % 8)) * 100), 0, Math.round((START.z + Math.sin(a) * (2 + i % 8)) * 100), (i * 6) & 255, 1] })); });
    await me.waitForTimeout(150);
  }
  const s = await state(f);
  expect(s.others.filter(o => o.x !== null).length).toBeGreaterThanOrEqual(38);
  const calls = await f.evaluate(() => window.QR.crowdCalls);
  expect(calls).toBeLessThanOrEqual(250);
  await shot(me, 'crowd-40-low-tier');
  bots.forEach(ws => ws.close());
  await act(host, 'end');
  for (const p of [me, host]) await p.context().close();
});

test('entry points: "Host a live game" on the class page, "Join a game" for signed-out visitors', async ({ browser }) => {
  const host = await signedIn(browser, TEACHER);
  await host.goto('/live');
  const classId = await host.locator('#lv-class option').first().getAttribute('value');
  await host.goto(`/class/${classId}`);
  await expect(host.locator(`a[href="/live?class=${classId}"]`)).toBeVisible();
  const out = await (await browser.newContext({ viewport: { width: 1600, height: 800 } })).newPage();
  await out.goto('/');
  await expect(out.locator('#home-join')).toBeVisible();
  await expect(out.locator('.topbar .joinnow')).toBeVisible();
  await out.click('#home-join'); await out.waitForURL(/\/join$/);
  await expect(out.locator('#jc')).toBeVisible();
  void uniq;
  for (const p of [host, out]) await p.context().close();
});
