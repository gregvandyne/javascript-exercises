// Many at once on the manipulatives boards in a real browser (25 Nov 2026, the owner: "All manipulative games should
// allow you to click and drag your cursor to select a bunch of objects at once"; docs/decisions.md "Manipulatives: a
// selection box"): on a laptop a mouse drag on empty space (or on a locked backdrop's body) draws a selection box that
// selects every unlocked piece and object it touches, never a locked chart; the pill says how many with Delete and ✕;
// dragging one moves them all (one Undo step); Delete deletes them (one Undo step); Escape, a tap on empty space and
// Shift+click; the wheel pans (Ctrl zooms), Space+drag and the middle button pan, a plain drag no longer does. On a phone
// one finger still pans and a hold then a drag draws the box. In the live room a student box-selects in their own square
// and the move and the delete are saved. MANIP_SHOTS=<dir> also saves pictures. Skipped when no Chromium is installed.
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

const boss = createUser({ username: 'BoxBoss', password: 'secret123', role: 'admin' });
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

const LAPTOP = () => ({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: SHOTS ? 2 : 1 });
const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
async function open(who, hash, ctxOpts = LAPTOP()) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  const cdp = ctxOpts.hasTouch ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errors, cdp };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** A saved board opened through its share code, the board at the top of the window, everything fitted into it. */
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Box test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-piece').length > 0);
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
}
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return b; };
const mid = b => [b.x + b.width / 2, b.y + b.height / 2];
const piece = id => `#mp-content .mp-piece[data-pid="${id}"]`;
const at = (page, sel) => page.$eval(sel, e => [parseFloat(e.style.left), parseFloat(e.style.top)]);
const onIds = page => page.$$eval('#mp-content .mp-piece.on, #mp-content .mp-obj.on', els => els.map(e => e.dataset.pid || e.dataset.oid).sort());
const view = page => page.$eval('#mp-world', e => { const m = new DOMMatrix(getComputedStyle(e).transform); return { x: m.e, y: m.f, z: m.a }; });
async function mdrag(page, [x0, y0], [x1, y1], { button = 'left', during = null } = {}) {
  await page.mouse.move(x0, y0); await page.mouse.down({ button });
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await page.waitForTimeout(12); }
  if (during) await during();
  await page.mouse.up({ button }); await page.waitForTimeout(150);
}
const U = (id, x, y) => ({ id, kind: 'unit', x, y, w: 30, h: 30, rot: 0, filled: true, locked: false, label: '1', value: 1, color: '#FFD23F' });
// A locked place-value chart (a backdrop) with three units under it, one far to the right, and one locked unit.
const chartBoard = () => ({ decimal: false, objects: [{ id: 'C', k: 'pv-chart', x: 1600, y: 900, s: 1, st: { cols: ['Hundreds', 'Tens', 'Ones'] }, locked: true }],
  pieces: [U('u1', 1620, 1300), U('u2', 1680, 1300), U('u3', 1740, 1300), U('far', 2100, 1300), { ...U('lk', 1700, 1360), locked: true }] });

test('a mouse drag on empty space selects many (never a locked chart); one drag moves them all; Delete, Undo, Escape, Shift+click', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#base-ten-blocks');
  await load(page, 'base-ten-blocks', chartBoard());
  assert.equal(await page.locator('#mp-content .mp-obj[data-oid="C"].locked').count(), 1, 'the chart is locked');
  const c = await box(page, '#mp-content .mp-obj[data-oid="C"]'), b1 = await box(page, piece('u1')), b3 = await box(page, piece('u3')), bl = await box(page, piece('lk'));
  // From the locked chart's body (above the first unit) to past the third unit and the locked one: a dashed box while dragging.
  const from = [b1.x - 12, c.y + c.height - 30], to = [b3.x + b3.width + 12, bl.y + bl.height + 8];
  await mdrag(page, from, to, { during: async () => {
    const sb = await page.$eval('#mp-selbox', e => ({ hidden: e.hidden, w: e.offsetWidth, h: e.offsetHeight, border: getComputedStyle(e).borderTopStyle }));
    assert.deepEqual([sb.hidden, sb.border], [false, 'dashed'], 'the selection box shows, dashed');
    assert.ok(Math.abs(sb.w - (to[0] - from[0])) < 4 && Math.abs(sb.h - (to[1] - from[1])) < 4, `the box follows the cursor (${sb.w}x${sb.h})`);
    await shot(page, 'box-01-drag');
  } });
  assert.equal(await page.$eval('#mp-selbox', e => e.hidden), true, 'the box goes when the button is let go');
  assert.deepEqual(await onIds(page), ['u1', 'u2', 'u3'], 'the three units, not the chart, the far one or the locked one');
  assert.equal(await page.isVisible('#mp-selpill'), true);
  assert.match(await page.textContent('#mp-selpill'), /3 selected/);
  assert.equal(await page.locator('#mp-selpill .chip[data-seldel]').count(), 1); assert.equal(await page.locator('#mp-selpill .chip[data-selx]').count(), 1);
  await shot(page, 'box-02-selected-pill');
  // Drag one of them: all three move by the same amount; the rest stay.
  const before = { u1: await at(page, piece('u1')), u2: await at(page, piece('u2')), u3: await at(page, piece('u3')), far: await at(page, piece('far')), lk: await at(page, piece('lk')) };
  const z = (await view(page)).z;
  await mdrag(page, mid(await box(page, piece('u2'))), [mid(await box(page, piece('u2')))[0] + 120, mid(await box(page, piece('u2')))[1] + 90]);
  const moved = {}; for (const id of ['u1', 'u2', 'u3', 'far', 'lk']) moved[id] = await at(page, piece(id));
  const d = [moved.u1[0] - before.u1[0], moved.u1[1] - before.u1[1]];
  assert.ok(Math.abs(d[0] - 120 / z) < 3 && Math.abs(d[1] - 90 / z) < 3, `moved with the cursor (${d})`);
  for (const id of ['u2', 'u3']) assert.deepEqual([moved[id][0] - before[id][0], moved[id][1] - before[id][1]], d, `${id} moved with the others`);
  assert.deepEqual([moved.far, moved.lk], [before.far, before.lk], 'what was not selected stayed');
  assert.deepEqual(await onIds(page), ['u1', 'u2', 'u3'], 'still selected after the move');
  // Delete: all three go, one toast with Undo; Undo brings them back where they were moved to; Undo again undoes the move.
  await page.keyboard.press('Delete'); await page.waitForTimeout(150);
  for (const id of ['u1', 'u2', 'u3']) assert.equal(await page.locator(piece(id)).count(), 0, `${id} deleted`);
  assert.equal(await page.locator(piece('far')).count(), 1);
  assert.equal(await page.isVisible('#mp-selpill'), false, 'the pill goes with them');
  assert.match(await page.textContent('.mp-undo'), /3 deleted/);
  await page.locator('[data-tool="undo"]').click(); await page.waitForTimeout(150);
  for (const id of ['u1', 'u2', 'u3']) assert.deepEqual(await at(page, piece(id)), moved[id], `${id} back (one Undo step)`);
  await page.locator('[data-tool="undo"]').click(); await page.waitForTimeout(150);
  for (const id of ['u1', 'u2', 'u3']) assert.deepEqual(await at(page, piece(id)), before[id], `${id} where it started (the move was one Undo step)`);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  // Escape lets go; so does a tap on empty space; the pill's ✕ too.
  const sweep = async () => { const a = await box(page, piece('u1')), b = await box(page, piece('u3')); await mdrag(page, [a.x - 10, a.y - 10], [b.x + b.width + 10, b.y + b.height + 6]); };
  await sweep(); assert.equal((await onIds(page)).length, 3);
  await page.keyboard.press('Escape'); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), [], 'Escape lets go');
  await sweep(); assert.equal((await onIds(page)).length, 3);
  const bd = await box(page, '#mp-board'); await page.mouse.click(bd.x + bd.width - 40, bd.y + bd.height - 40); await page.waitForTimeout(150);
  assert.deepEqual(await onIds(page), [], 'a tap on empty space lets go');
  await sweep(); await page.locator('#mp-selpill [data-selx]').click(); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), [], '✕ lets go');
  // Shift+click adds and removes; a plain click on one outside the selection selects just it.
  await page.mouse.click(...mid(await box(page, piece('u1')))); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), ['u1']);
  await page.keyboard.down('Shift'); await page.mouse.click(...mid(await box(page, piece('far')))); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), ['far', 'u1'], 'Shift+click added it');
  assert.match(await page.textContent('#mp-selpill'), /2 selected/);
  await page.keyboard.down('Shift'); await page.mouse.click(...mid(await box(page, piece('lk')))); await page.keyboard.up('Shift'); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), ['far', 'u1'], 'a locked piece never joins');
  await page.mouse.click(...mid(await box(page, piece('u3')))); await page.waitForTimeout(100);
  assert.deepEqual(await onIds(page), ['u3'], 'a click outside the selection selects just that one');
  // Dark mode: the box and the pill on the dark board.
  await sweep();
  await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(150);
  const pill = await page.$eval('#mp-selpill', e => getComputedStyle(e).backgroundColor);
  const lum = pill.match(/[\d.]+/g).slice(0, 3).map(Number).reduce((s, v) => s + v, 0) / 3;
  assert.ok(lum < 90, `the pill is dark in dark mode (${pill})`);
  await shot(page, 'box-03-dark');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the view: the wheel pans (Ctrl zooms), Space+drag and the middle button pan, a plain drag on empty space no longer does', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#base-ten-blocks');
  await load(page, 'base-ten-blocks', chartBoard());
  const bd = await box(page, '#mp-board'), empty = [bd.x + bd.width - 60, bd.y + bd.height - 60];
  const sy = await page.evaluate(() => scrollY);
  await page.mouse.move(...empty); await page.waitForTimeout(500);   // the board settles after it is fitted
  // What the board got from each wheel turn (Chromium scales a test's wheel by the screen's pixel ratio).
  await page.evaluate(() => { window.__wheel = []; document.getElementById('mp-board').addEventListener('wheel', e => window.__wheel.push([e.deltaX, e.deltaY]), { passive: true }); });
  const got = () => page.evaluate(() => window.__wheel.pop());
  let v0 = await view(page);
  await page.mouse.wheel(0, 120); await page.waitForTimeout(400);
  let v1 = await view(page), w = await got();
  assert.ok(w[1] > 0 && Math.abs(v1.y - (v0.y - w[1])) < 2 && Math.abs(v1.x - v0.x) < 1 && v1.z === v0.z, `the wheel scrolled the board up (${v0.y} -> ${v1.y}, deltaY ${w[1]})`);
  assert.equal(await page.evaluate(() => scrollY), sy, 'the page did not scroll');
  await page.mouse.wheel(80, 0); await page.waitForTimeout(400);
  const v2 = await view(page); w = await got(); assert.ok(w[0] > 0 && Math.abs(v2.x - (v1.x - w[0])) < 2, `sideways too (${v1.x} -> ${v2.x}, deltaX ${w[0]})`);
  await page.keyboard.down('Control'); await page.mouse.wheel(0, -100); await page.waitForTimeout(400); await page.keyboard.up('Control');
  const v3 = await view(page); assert.ok(v3.z > v2.z, `Ctrl+wheel zooms in (${v2.z} -> ${v3.z})`);
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
  // A plain drag on empty space draws a box and leaves the view where it is.
  v0 = await view(page);
  await mdrag(page, empty, [empty[0] - 90, empty[1] - 70]);
  v1 = await view(page); assert.deepEqual([v1.x, v1.y], [v0.x, v0.y], 'a plain drag did not pan');
  // Space held: a drag pans, even one that starts on a piece (which stays where it is on the board).
  const u = piece('u2'), u0 = await at(page, u), pu = mid(await box(page, u));
  await page.mouse.move(...pu); await page.keyboard.down('Space');
  assert.equal(await page.$eval('#mp-board', e => e.classList.contains('mp-grab')), true, 'the board shows it will pan');
  await mdrag(page, pu, [pu[0] + 60, pu[1] + 40]);
  await page.keyboard.up('Space');
  v1 = await view(page); assert.ok(Math.abs(v1.x - v0.x - 60) < 2 && Math.abs(v1.y - v0.y - 40) < 2, `Space+drag panned (${v1.x - v0.x}, ${v1.y - v0.y})`);
  assert.deepEqual(await at(page, u), u0, 'the piece did not move on the board');
  assert.equal(await page.evaluate(() => scrollY), sy, 'Space did not scroll the page');
  assert.equal(await page.$eval('#mp-board', e => e.classList.contains('mp-grab')), false);
  // The middle button pans too.
  await mdrag(page, empty, [empty[0] - 50, empty[1] - 30], { button: 'middle' });
  const v4 = await view(page); assert.ok(Math.abs(v4.x - v1.x + 50) < 2 && Math.abs(v4.y - v1.y + 30) < 2, `the middle button panned (${v4.x - v1.x}, ${v4.y - v1.y})`);
  assert.deepEqual(await onIds(page), [], 'nothing selected by the pans');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('on a phone: one finger still pans, a hold on empty space then a drag draws the box', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#base-ten-blocks', PHONE());
  await load(page, 'base-ten-blocks', { decimal: false, pieces: [U('u1', 1620, 1300), U('u2', 1680, 1300), U('u3', 1740, 1300), U('far', 2000, 1500)] });
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
  const drag = async ([x0, y0], [x1, y1], holdFirst = 0) => {
    await touch('touchStart', [[x0, y0]]); if (holdFirst) await page.waitForTimeout(holdFirst);
    for (let i = 1; i <= 12; i++) { await touch('touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12]]); await page.waitForTimeout(16); }
    await touch('touchEnd', []); await page.waitForTimeout(200);
  };
  const a = await box(page, piece('u1')), b = await box(page, piece('u3'));
  const v0 = await view(page);
  await drag([a.x - 14, a.y - 14], [a.x + 26, a.y + 16]);
  const v1 = await view(page); assert.ok(Math.abs(v1.x - v0.x - 40) < 3 && Math.abs(v1.y - v0.y - 30) < 3, `one finger panned (${v1.x - v0.x}, ${v1.y - v0.y})`);
  assert.deepEqual(await onIds(page), []);
  const a2 = await box(page, piece('u1')), b2 = await box(page, piece('u3'));
  await drag([a2.x - 12, a2.y - 12], [b2.x + b2.width + 10, b2.y + b2.height + 10], 650);
  const v2 = await view(page); assert.deepEqual([v2.x, v2.y], [v1.x, v1.y], 'the held drag did not pan');
  assert.deepEqual(await onIds(page), ['u1', 'u2', 'u3'], 'a hold and a drag selected the three');
  assert.match(await page.textContent('#mp-selpill'), /3 selected/);
  assert.ok(b.width > 0);
  await shot(page, 'box-04-phone-selected');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the live room: a student box-selects in their own square, moves them together and deletes them (saved), never in a classmate\'s', { skip }, async () => {
  const oak = S.createSchool(boss, { name: 'Box Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Box' });
  const A = S.createClass(boss, oak.id, { name: 'Box 4A' }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Apple' }).user.id); S.addToClass(boss, A.id, kid.id);
  const s = M.createSession(boss, { classId: A.id, tool: 'two-color-counters', title: 'Box room' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  const C = (id, x, y, extra = {}) => ({ id, kind: 'pos', x, y, w: 48, h: 48, rot: 0, filled: true, label: '+1', value: 1, color: '#FFD23F', ...extra });
  assert.ok(M.saveArea(boss, s.id, kid.id, { v: 2, objects: [], pieces: [C('c1', 60, 80), C('c2', 130, 80), C('c3', 200, 80), C('c4', 60, 260), { ...C('tl', 130, 260), locked: true }] }).ok);
  const saved = () => JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, kid.id).state);
  const { ctx, page, errors } = await open(kid, `#live/${s.id}`);
  const rp = id => `.rm-area.mine .mp-piece[data-pid="${id}"]`;
  await page.waitForSelector(rp('c1')); await page.waitForTimeout(500);
  const ons = () => page.$$eval('.rm-area .mp-piece.on', els => els.map(e => e.dataset.pid).sort());
  const p1 = await box(page, rp('c1')), p3 = await box(page, rp('c3'));
  await mdrag(page, [p1.x - 14, p1.y - 14], [p3.x + p3.width + 10, p3.y + p3.height + 10], { during: async () => {
    assert.equal(await page.$eval('#rm-selbox', e => e.hidden), false, 'the selection box shows in the room');
  } });
  assert.deepEqual(await ons(), ['c1', 'c2', 'c3'], 'the three in the box, not the ones below');
  assert.match(await page.textContent('#rm-selpill'), /3 selected/);
  await shot(page, 'box-05-room-selected');
  const z = await page.$eval('#rm-world', e => new DOMMatrix(getComputedStyle(e).transform).a);
  const c2 = mid(await box(page, rp('c2')));
  await mdrag(page, c2, [c2[0] + 80, c2[1] + 120]);
  await page.waitForTimeout(1100);
  const st = saved(), dy = Math.round(120 / z);
  for (const [id, x0] of [['c1', 60], ['c2', 130], ['c3', 200]]) { const p = st.pieces.find(x => x.id === id); assert.ok(Math.abs(p.x - x0 - Math.round(80 / z)) <= 2 && Math.abs(p.y - 80 - dy) <= 2, `${id} moved with the others and was saved (${p.x},${p.y})`); }
  assert.deepEqual([st.pieces.find(x => x.id === 'c4').y, st.pieces.find(x => x.id === 'tl').y], [260, 260], 'the others stayed');
  await page.keyboard.press('Backspace'); await page.waitForTimeout(1100);
  assert.deepEqual(saved().pieces.map(p => p.id).sort(), ['c4', 'tl'], 'Backspace deleted the three, saved');
  assert.equal(await page.isVisible('#rm-selpill'), false);
  // Off the student's own square (the room's background), a drag still pans the room.
  const v0 = await page.$eval('#rm-world', e => new DOMMatrix(getComputedStyle(e).transform).e);
  const sq = await box(page, '.rm-area.mine'), rm = await box(page, '#rm');
  const outside = [Math.min(rm.x + rm.width - 30, sq.x + sq.width + 30), sq.y + sq.height / 2];
  await mdrag(page, outside, [outside[0] - 60, outside[1]]);
  const v1 = await page.$eval('#rm-world', e => new DOMMatrix(getComputedStyle(e).transform).e);
  assert.ok(Math.abs(v1 - v0 + 60) < 3, `the room panned (${v1 - v0})`);
  assert.deepEqual(errors, []);
  await ctx.close();
  M.end(boss, s.id);
});
