// The manipulatives' hold-to-edit wheel in a real browser (docs/decisions.md "Virtual math manipulatives: hold to
// edit"): on an iPhone 13 with real touch (CDP), a tap selects and a hold lifts a fraction tile out of its row and opens
// its 5-icon wheel; Flip turns a counter over (+1 to −1) without mirroring the wheel or the label; counters never join
// and snap only into a frame's empty cells; a locked frame stays put and still takes counters, an unlocked one carries
// its counters; Delete and Undo; a wheel at the screen's edge stays on screen; right-click and Shift+F10 on a laptop;
// Break on base-ten blocks; Flip on algebra tiles; the live room on a phone; and the tools that keep their own taps.
// MANIP_SHOTS=<dir> also saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'WheelBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1 };
async function open(who, hash, ctxOpts = PHONE()) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  const cdp = ctxOpts.hasTouch ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errors, cdp };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** A saved board opened through its share code, then fitted to the screen. */
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Wheel test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => /loaded|Loaded|Opened/.test(document.getElementById('mp-status')?.textContent || '') || document.querySelectorAll('#mp-content .mp-piece, #mp-content .mp-obj').length > 0);
  // The board at the top of the phone's screen (under the site's bar), then everything fitted into it.
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.waitForTimeout(100);
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(100);
}
// Real touch through the DevTools protocol.
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
async function tap(page, cdp, [x, y]) { await touch(cdp, 'touchStart', [[x, y]]); await page.waitForTimeout(60); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(150); }
async function hold(page, cdp, [x, y], ms = 650) { await touch(cdp, 'touchStart', [[x, y]]); await page.waitForTimeout(ms); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(150); }
async function drag(page, cdp, [x0, y0], [x1, y1], { holdFirst = 0 } = {}) {
  await touch(cdp, 'touchStart', [[x0, y0]]);
  if (holdFirst) await page.waitForTimeout(holdFirst);
  for (let i = 1; i <= 12; i++) { await touch(cdp, 'touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12]]); await page.waitForTimeout(16); }
  await touch(cdp, 'touchEnd', []); await page.waitForTimeout(200);
}
const centerOf = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return [b.x + b.width / 2, b.y + b.height / 2]; };
const piece = id => `#mp-content .mp-piece[data-pid="${id}"]`;
const head = id => `#mp-content .mp-obj[data-oid="${id}"] .mp-ohead`;
const wheelLabels = page => page.$$eval('.mp-wheel .mp-wbtn', els => els.map(e => e.getAttribute('aria-label')));
const stateOf = page => page.evaluate(() => [...document.querySelectorAll('#mp-content .mp-piece')].map(e => ({ id: e.dataset.pid, x: parseFloat(e.style.left), y: parseFloat(e.style.top), label: e.textContent.trim(), cls: e.className })));
const P = (id, kind, x, y, w, h, extra = {}) => ({ id, kind, x, y, w, h, rot: 0, filled: true, locked: false, ...extra });
const tiles = () => ({ mode: 'frac', pieces: [
  P('whole', 'f1', 1800, 1100, 264, 40, { label: '1 whole', value: 1, color: '#B0BEC5', g: 'G1' }),
  P('half', 'f2', 1800, 1140, 132, 40, { label: '1/2', value: 0.5, color: '#E53935', g: 'G1' }),
  P('third', 'f3', 1932, 1140, 88, 40, { label: '1/3', value: 1 / 3, color: '#FB8C00', g: 'G1' }),
  P('fourth', 'f4', 1800, 1240, 66, 40, { label: '1/4', value: 0.25, color: '#FFD23F' }),
] });
const counter = (id, pos, x, y) => P(id, pos ? 'pos' : 'neg', x, y, 48, 48, { label: pos ? '+1' : '−1', value: pos ? 1 : -1, color: pos ? '#FFD23F' : '#E53935' });
const frame = (id, x, y, extra = {}) => ({ id, k: 'ten-frame', x, y, s: 1, st: { n: 10 }, ...extra });

test('fraction tiles on a phone: a tap selects only; a hold lifts the tile out of its row and opens a 5-icon wheel; a tap outside only closes it', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#fraction-tiles');
  await load(page, 'fraction-tiles', tiles());
  const before = (await stateOf(page)).find(p => p.id === 'half');
  await tap(page, cdp, await centerOf(page, piece('half')));
  assert.match(await page.getAttribute(piece('half'), 'class'), /\bon\b/, 'a tap selects (green outline)');
  assert.equal(await page.locator('.mp-wheel').count(), 0, 'a tap opens no menu');
  assert.equal(await page.locator('.mp-pbar, .mp-obar').count(), 0, 'no old pill row');
  await hold(page, cdp, await centerOf(page, piece('half')));
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'the hold opened the wheel');
  assert.deepEqual(await wheelLabels(page), ['Copy', 'Fill', 'Rotate', 'Lock', 'Delete']);
  const after = (await stateOf(page)).find(p => p.id === 'half');
  assert.doesNotMatch(after.cls, /grouped/, 'out of its group');
  assert.match(after.cls, /lifted/);
  const moved = Math.hypot(after.x - before.x, after.y - before.y); assert.ok(moved >= 6 && moved <= 10, `lifted about 8 px (${moved})`);
  assert.match((await stateOf(page)).find(p => p.id === 'whole').cls, /grouped/, 'the rest of the row stays together');
  // Each button: its name for screen readers and a tooltip; Delete in red; the ring about 64 px out.
  assert.equal(await page.locator('.mp-wheel .mp-wbtn.bad').getAttribute('aria-label'), 'Delete');
  const bg = await page.$eval('.mp-wheel .mp-wbtn', b => [getComputedStyle(b).backgroundColor, b.offsetWidth]); assert.deepEqual(bg, ['rgb(20, 20, 20)', 48]);
  await page.hover('.mp-wheel .mp-wbtn').catch(() => {});
  await shot(page, '01-fraction-tiles-wheel');
  // A tap outside closes it and does nothing else (the selection stays, nothing pans).
  const view = await page.$eval('#mp-world', w => w.style.transform);
  await tap(page, cdp, [30, 300]);
  assert.equal(await page.locator('.mp-wheel').count(), 0);
  assert.match(await page.getAttribute(piece('half'), 'class'), /\bon\b/, 'the closing tap was used up');
  assert.equal(await page.$eval('#mp-world', w => w.style.transform), view);
  // A drag (no hold) moves the whole snapped row.
  const w0 = (await stateOf(page)).find(p => p.id === 'whole');
  await drag(page, cdp, await centerOf(page, piece('third')), (await centerOf(page, piece('third'))).map(v => v + 60));
  const w1 = (await stateOf(page)).find(p => p.id === 'whole');
  assert.ok(w1.x > w0.x + 20 && w1.y > w0.y + 20, 'the group moved with the dragged tile');
  // Hold then slide: only that tile moves.
  const t0 = (await stateOf(page)).find(p => p.id === 'third'), wb = (await stateOf(page)).find(p => p.id === 'whole');
  const c = await centerOf(page, piece('third'));
  await drag(page, cdp, c, [c[0] + 10, c[1] + 120], { holdFirst: 650 });
  const s2 = await stateOf(page);
  assert.ok(s2.find(p => p.id === 'third').y > t0.y + 40, 'the held tile moved');
  assert.deepEqual([s2.find(p => p.id === 'whole').x, s2.find(p => p.id === 'whole').y], [wb.x, wb.y], 'the row stayed');
  assert.equal(await page.locator('.mp-wheel').count(), 0, 'sliding closed the wheel');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('counters: Flip turns +1 into −1 without mirroring anything; counters never join; a frame\'s empty cell takes one', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#two-color-counters');
  await load(page, 'two-color-counters', { objects: [frame('F', 1700, 1000)], pieces: [counter('a', true, 1720, 1250), counter('b', true, 1850, 1250)] });
  await hold(page, cdp, await centerOf(page, piece('a')));
  assert.deepEqual(await wheelLabels(page), ['Flip over', 'Copy', 'Lock', 'Delete']);
  await page.locator('.mp-wheel .mp-wbtn[data-wk="flip"]').click();
  await page.waitForTimeout(450);
  assert.equal((await stateOf(page)).find(p => p.id === 'a').label, '−1', '+1 became −1');
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'Flip keeps the wheel open');
  const t = await page.evaluate(sel => {
    const anc = []; for (let e = document.querySelector('.mp-wheel .mp-wbtn').parentElement; e; e = e.parentElement) anc.push(getComputedStyle(e).transform);
    const lab = document.querySelector(sel + ' .mp-lab'), chain = []; for (let e = lab; e && !e.classList.contains('mp-world'); e = e.parentElement) chain.push(getComputedStyle(e).transform);
    return { anc, chain };
  }, piece('a'));
  assert.ok(t.anc.every(x => x === 'none'), `the wheel's ancestors are not transformed: ${t.anc}`);
  for (const m of t.chain) { const k = /^matrix\(([^,]+)/.exec(m); assert.ok(m === 'none' || +k[1] > 0, `no mirroring on the label's way up: ${m}`); }
  await shot(page, '02-counter-flipped');
  await tap(page, cdp, [20, 250]);
  // Dropped right beside another counter: no join, no snap, it stays where it was let go.
  const b0 = (await stateOf(page)).find(p => p.id === 'b'), a0 = (await stateOf(page)).find(p => p.id === 'a');
  const z = await page.$eval('#mp-world', w => +/scale\(([\d.]+)\)/.exec(w.style.transform)[1]);
  const from = await centerOf(page, piece('b')), to = [from[0] - (b0.x - a0.x - 52) * z, from[1] + 3 * z];
  await drag(page, cdp, from, to);
  const s1 = await stateOf(page), b1 = s1.find(p => p.id === 'b');
  assert.ok(Math.abs(b1.x - (a0.x + 52)) <= 2 && Math.abs(b1.y - (b0.y + 3)) <= 2, `stays where dropped (${b1.x},${b1.y})`);
  assert.ok(s1.every(p => !/grouped/.test(p.cls)), 'never joined');
  // Dropped over a frame cell: centered in it.
  const cell = await page.$eval('#mp-content .mp-obj[data-oid="F"] .mp-frame div:nth-child(3)', d => { const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await drag(page, cdp, await centerOf(page, piece('b')), [cell[0] + 6, cell[1] + 5]);
  const seat = await centerOf(page, piece('b'));
  assert.ok(Math.hypot(seat[0] - cell[0], seat[1] - cell[1]) < 5, 'snapped into the cell');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('frames: hold for Lock, Copy, Delete; a locked frame stays put and still takes counters; an unlocked frame carries its counters', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#two-color-counters');
  const F = frame('F', 1700, 1000);
  await load(page, 'two-color-counters', { objects: [F], pieces: [counter('in1', true, 1716, 1046), counter('in2', false, 1776, 1046), counter('out', true, 1720, 1250)] });
  await hold(page, cdp, await centerOf(page, head('F')));
  assert.deepEqual(await wheelLabels(page), ['Lock', 'Copy', 'Delete']);
  await page.locator('.mp-wheel .mp-wbtn[data-wk="lock"]').click();
  await page.waitForFunction(() => !document.querySelector('#toasts .toast'), null, { timeout: 5000 });   // the lock's message, out of the way
  assert.equal(await page.locator('#mp-content .mp-obj[data-oid="F"] .mp-olock').count(), 1, 'a lock badge');
  const f0 = await page.$eval('#mp-content .mp-obj[data-oid="F"]', e => [e.style.left, e.style.top]);
  const h = await centerOf(page, head('F'));
  await drag(page, cdp, h, [h[0] + 80, h[1] + 60]);
  assert.deepEqual(await page.$eval('#mp-content .mp-obj[data-oid="F"]', e => [e.style.left, e.style.top]), f0, 'a locked frame does not move');
  const cell = await page.$eval('#mp-content .mp-obj[data-oid="F"] .mp-frame div:nth-child(4)', d => { const r = d.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await drag(page, cdp, await centerOf(page, piece('out')), [cell[0] + 5, cell[1] - 4]);
  const seat = await centerOf(page, piece('out')); assert.ok(Math.hypot(seat[0] - cell[0], seat[1] - cell[1]) < 5, 'a locked frame still takes a counter');
  await shot(page, '03-counters-locked-frame');
  // Holding it again: only Unlock.
  await hold(page, cdp, await centerOf(page, head('F')));
  assert.deepEqual(await wheelLabels(page), ['Unlock']);
  await page.locator('.mp-wheel .mp-wbtn[data-wk="unlock"]').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator('#mp-content .mp-obj[data-oid="F"] .mp-olock').count(), 0);
  // Unlocked: dragging the frame takes the counters in its cells along.
  const p0 = await stateOf(page), o0 = await page.$eval('#mp-content .mp-obj[data-oid="F"]', e => parseFloat(e.style.left));
  const h2 = await centerOf(page, head('F'));
  await drag(page, cdp, h2, [h2[0] + 40, h2[1] + 30]);
  const o1 = await page.$eval('#mp-content .mp-obj[data-oid="F"]', e => parseFloat(e.style.left)), p1 = await stateOf(page);
  assert.ok(o1 > o0 + 10, 'the frame moved');
  for (const id of ['in1', 'in2', 'out']) assert.equal(p1.find(p => p.id === id).x - p0.find(p => p.id === id).x, o1 - o0, `${id} came along`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Delete acts at once and Undo brings it back; a piece at the screen\'s edge gets a wheel fully on screen', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#fraction-tiles');
  await load(page, 'fraction-tiles', tiles());
  await hold(page, cdp, await centerOf(page, piece('fourth')));
  await page.locator('.mp-wheel .mp-wbtn[data-wk="delete"]').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator(piece('fourth')).count(), 0, 'deleted');
  assert.equal(await page.locator('.mp-wheel').count(), 0, 'Delete closes the wheel');
  assert.match(await page.textContent('.mp-undo'), /1\/4 deleted/);
  await page.locator('.mp-undo .mp-undobtn').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator(piece('fourth')).count(), 1, 'Undo restored it');
  assert.equal(await page.locator('.mp-undo').isVisible(), false);
  // Pan the board so a tile sits at the screen's right edge, then hold it there.
  const vw = page.viewportSize().width, pc = await centerOf(page, piece('fourth'));
  const board = await page.locator('#mp-board').boundingBox(), empty = [board.x + 8, pc[1]];
  await drag(page, cdp, empty, [empty[0] + (board.x + board.width - 12 - pc[0]), empty[1]]);
  const edge = await centerOf(page, piece('fourth'));
  assert.ok(edge[0] > vw - 32, `at the edge (${edge[0]})`);
  await hold(page, cdp, edge);
  assert.equal(await page.$eval('.mp-wheel', w => w.dataset.mode), 'arc', 'a half wheel opening away from the edge');
  const boxes = await page.$$eval('.mp-wheel .mp-wbtn', els => els.map(e => e.getBoundingClientRect()).map(r => [r.left, r.top, r.right, r.bottom]));
  assert.equal(boxes.length, 5);
  for (const [l, t, r, b] of boxes) assert.ok(l >= 0 && t >= 0 && r <= vw && b <= page.viewportSize().height, `on screen: ${[l, t, r, b]}`);
  await shot(page, '04-edge-wheel');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('base-ten blocks: Break is on the wheel (and gone from the palette); algebra tiles: Flip makes the opposite tile', { skip }, async () => {
  {
    const { ctx, page, errors, cdp } = await open(boss, '#base-ten-blocks');
    await load(page, 'base-ten-blocks', { decimal: false, pieces: [P('rod', 'rod', 1900, 1000, 30, 150, { label: '10', value: 10, color: '#4CAF50' }), P('u', 'unit', 1990, 1000, 30, 30, { label: '1', value: 1, color: '#FFD23F' })] });
    assert.equal(await page.locator('#mp-palette [data-pal]', { hasText: 'Break' }).count(), 0, 'no Break in the palette');
    assert.equal(await page.locator('#mp-palette [data-pal]', { hasText: 'Regroup' }).count(), 1, 'Regroup stays');
    await hold(page, cdp, await centerOf(page, piece('u')));
    assert.deepEqual(await wheelLabels(page), ['Copy', 'Rotate', 'Lock', 'Delete'], 'a unit does not break');
    await tap(page, cdp, [20, 250]);
    await hold(page, cdp, await centerOf(page, piece('rod')));
    assert.deepEqual(await wheelLabels(page), ['Break into 10', 'Copy', 'Rotate', 'Lock', 'Delete']);
    await shot(page, '05-base-ten-wheel-break');
    await page.locator('.mp-wheel .mp-wbtn[data-wk="break"]').click(); await page.waitForTimeout(150);
    assert.equal(await page.locator('#mp-content .mp-piece').count(), 11, 'ten units and the one there was');
    assert.match(await page.textContent('#mp-total'), /Total 11/);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  {
    const { ctx, page, errors, cdp } = await open(boss, '#algebra-tiles');
    await load(page, 'algebra-tiles', { pieces: [P('x', 'x', 1900, 1000, 34, 92, { label: 'x', value: 0, color: '#43A047' }), P('xy', 'xy', 2000, 1000, 92, 62, { label: 'xy', value: 0, color: '#8E24AA' })] });
    await hold(page, cdp, await centerOf(page, piece('xy')));
    assert.deepEqual(await wheelLabels(page), ['Rotate', 'Copy', 'Lock', 'Delete'], 'xy has no opposite tile: no Flip');
    await tap(page, cdp, [20, 250]);
    await hold(page, cdp, await centerOf(page, piece('x')));
    assert.deepEqual(await wheelLabels(page), ['Flip over', 'Rotate', 'Copy', 'Lock', 'Delete']);
    await page.locator('.mp-wheel .mp-wbtn[data-wk="flip"]').click(); await page.waitForTimeout(450);
    assert.equal((await stateOf(page)).find(p => p.id === 'x').label, '−x');
    assert.match(await page.textContent('#mp-total'), /− 1x/);
    await shot(page, '06-algebra-flipped');
    await page.locator('.mp-wheel .mp-wbtn[data-wk="rotate"]').click(); await page.waitForTimeout(150);
    assert.match(await page.getAttribute(piece('x'), 'style'), /rotate\(90deg\)/, 'a quarter turn');
    await tap(page, cdp, [20, 250]);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('a locked piece: a badge, it shakes instead of moving, its wheel has only Unlock, and it does not leave its group', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#fraction-tiles');
  const st = tiles(); st.pieces[1].locked = true;
  await load(page, 'fraction-tiles', st);
  assert.equal(await page.locator(`${piece('half')} .mp-lockb`).count(), 1);
  const h0 = (await stateOf(page)).find(p => p.id === 'half');
  const c = await centerOf(page, piece('half'));
  await drag(page, cdp, c, [c[0] + 50, c[1] + 50]);
  assert.deepEqual(((await stateOf(page)).find(p => p.id === 'half')).x, h0.x, 'it did not move');
  await hold(page, cdp, c);
  assert.deepEqual(await wheelLabels(page), ['Unlock']);
  assert.match((await stateOf(page)).find(p => p.id === 'half').cls, /grouped/, 'locked pieces do not separate');
  await page.locator('.mp-wheel .mp-wbtn[data-wk="unlock"]').click(); await page.waitForTimeout(150);
  assert.equal(await page.locator(`${piece('half')} .mp-lockb`).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('on a laptop: right-click opens the wheel; Shift+F10 from keyboard focus too, arrows move, Esc returns focus to the piece', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#fraction-tiles', LAPTOP);
  await load(page, 'fraction-tiles', tiles());
  const [x, y] = await centerOf(page, piece('fourth'));
  await page.mouse.click(x, y, { button: 'right' });
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'right-click');
  assert.equal((await wheelLabels(page)).length, 5);
  await page.mouse.move(...(await centerOf(page, '.mp-wheel .mp-wbtn[data-wk="rotate"]')));
  await page.waitForTimeout(100);
  assert.equal(await page.textContent('.mp-wtip'), 'Rotate', 'a tooltip');
  await shot(page, '07-desktop-1280');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mp-wheel').count(), 0);
  // A long mouse press opens it too.
  await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(650);
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'a long mouse press');
  await page.mouse.up(); await page.mouse.click(10, 300);
  assert.equal(await page.locator('.mp-wheel').count(), 0);
  // Keyboard.
  await page.focus(piece('fourth'));
  await page.keyboard.press('Shift+F10');
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'Shift+F10');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.wk), 'copy', 'focus on the first icon');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.wk), 'fill');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.wk), 'rotate');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.mp-wheel').count(), 0);
  assert.equal(await page.evaluate(() => document.activeElement.dataset.pid), 'fourth', 'focus back on the piece');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'Enter on a focused piece');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ContextMenu');
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'the ContextMenu key');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the tools that keep their own taps still work, and none opens a wheel from its own controls', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#rekenreks', LAPTOP);
  const html = () => page.$eval('#mp-content', e => e.innerHTML);
  const noWheel = async tool => assert.equal(await page.locator('.mp-wheel').count(), 0, tool);
  const go = async tool => { await page.evaluate(h => { location.hash = h; }, tool); await page.waitForSelector('#mp-content .mp-obj'); await page.waitForTimeout(150); };
  await go('rekenreks');
  await page.click('#mp-content .mp-bead[data-r="0"][data-i="2"]');
  assert.equal(await page.locator('#mp-content .mp-bead.on').count(), 3, 'rekenrek: beads slide'); await noWheel('rekenreks');
  await go('hundred-board');
  await page.click('#mp-content .mp-cell[data-i="5"]');
  assert.equal(await page.locator('#mp-content .mp-cell.on').count(), 1, 'hundred board: a cell is covered'); await noWheel('hundred-board');
  await go('fraction-circles');
  await page.click('#mp-palette [data-pal]:has-text("1/2")');
  const t0 = await html(); await page.click('#mp-content [data-act="turn"]');
  assert.notEqual(await html(), t0, 'fraction circles: a piece turns'); await noWheel('fraction-circles');
  for (const tool of ['number-lines', 'xy-coordinate-board']) {
    await go(tool);
    const before = await html(), b = await page.locator('#mp-content svg.mp-nl, #mp-content svg.mp-grid').first().boundingBox();
    await page.mouse.click(b.x + b.width * 0.62, b.y + b.height * 0.5);
    assert.notEqual(await html(), before, `${tool}: a tap on it plots`); await noWheel(tool);
  }
  await go('bar-models');
  const b0 = await html(); await page.click('#mp-content [data-act="seg"][data-d="1"]');
  assert.notEqual(await html(), b0, 'bar models: a part grows'); await noWheel('bar-models');
  await go('geoboard');
  const g0 = await html(); await page.click('#mp-content .mp-peg >> nth=0', { force: true }); await page.click('#mp-content .mp-peg >> nth=6', { force: true });
  assert.notEqual(await html(), g0, 'geoboard: pegs make a band'); await noWheel('geoboard');
  await go('clock');
  const c0 = await page.textContent('#mp-content .mp-obj'); await page.click('#mp-content [data-act="hour"]');
  assert.notEqual(await page.textContent('#mp-content .mp-obj'), c0, 'clock: an hour later'); await noWheel('clock');
  // Holding the clock's face sets the time as before (its own work), never a wheel.
  const face = await page.locator('#mp-content svg[data-clock]').first().boundingBox();
  await page.mouse.move(face.x + face.width / 2, face.y + 20); await page.mouse.down(); await page.waitForTimeout(600); await page.mouse.up();
  await noWheel('clock face');
  // An object's handle: hold for its wheel (Lock, Copy, Delete) on these tools too.
  const hb = await page.locator('#mp-content .mp-ohead').first().boundingBox();
  await page.mouse.click(hb.x + 30, hb.y + hb.height / 2, { button: 'right' });
  assert.deepEqual(await page.$$eval('.mp-wheel .mp-wbtn', els => els.map(e => e.dataset.wk)), ['lock', 'copy', 'delete']);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the live room on a phone: a student holds a counter in their own square, flips it (saved), and can\'t unlock what the teacher locked', { skip }, async () => {
  const oak = S.createSchool(boss, { name: 'Wheel Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: 'Wheel 4A' }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Apple' }).user.id); S.addToClass(boss, A.id, kid.id);
  const s = M.createSession(boss, { classId: A.id, tool: 'two-color-counters', title: 'Zero pairs' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  // The teacher locks one counter in Ada's square; Ada has another of her own.
  assert.ok(M.saveArea(boss, s.id, kid.id, { v: 2, objects: [], pieces: [counter('mine', true, 60, 60), { ...counter('tl', true, 160, 60), locked: true }] }).ok);
  const saved = () => JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, kid.id).state);
  assert.equal(saved().pieces.find(p => p.id === 'tl').lockBy, 't', 'the teacher\'s lock is the teacher\'s');
  const { ctx, page, errors, cdp } = await open(kid, `#live/${s.id}`);
  const rp = id => `.rm-area.mine .mp-piece[data-pid="${id}"]`;
  await page.waitForSelector(rp('mine')); await page.waitForTimeout(400);
  await hold(page, cdp, await centerOf(page, rp('mine')));
  assert.deepEqual(await wheelLabels(page), ['Flip over', 'Copy', 'Lock', 'Delete']);
  await shot(page, '08-room-phone-wheel');
  await page.locator('.mp-wheel .mp-wbtn[data-wk="flip"]').click();
  await page.waitForTimeout(1100);
  assert.equal(saved().pieces.find(p => p.id === 'mine').kind, 'neg', 'the flip was saved for everyone');
  await tap(page, cdp, [20, 300]);
  // The teacher's lock: no wheel, a message.
  await hold(page, cdp, await centerOf(page, rp('tl')));
  assert.equal(await page.locator('.mp-wheel').count(), 0);
  assert.match(await page.textContent('#toasts'), /Your teacher locked this/);
  // Even a page that tries: the server keeps the teacher's lock and the piece where it was.
  M.saveArea(kid, s.id, kid.id, { v: 2, objects: [], pieces: [counter('mine', false, 60, 60), { ...counter('tl', true, 300, 200), locked: false }] });
  const tl = saved().pieces.find(p => p.id === 'tl'); assert.deepEqual([tl.locked, tl.lockBy, tl.x], [true, 't', 160]);
  assert.deepEqual(errors, []);
  await ctx.close();
  M.end(boss, s.id);
});
