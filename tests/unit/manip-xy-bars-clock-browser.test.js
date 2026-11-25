// Three gaps in the Manipulatives, closed (25 Nov 2026; docs/decisions.md "Manipulatives: a closed shape on the grid,
// typed bar sizes, a clock whose minute hand carries the hour"), in a real browser: the coordinate grid closes the
// current color's line into a shape (a tap on its first point, or the palette's Close the shape), with Undo; a bar
// model's part takes a typed size and can be selected and deleted, and light fills get dark text; the clock's minute
// hand carries the hour past 12 both ways, the hour hand moves the time in 5-minute steps and always sits between the
// numbers for the minutes, the "+1 h" never sits under a hand, and Totals: off hides the digital time. Skipped when no
// Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const M = await import('../../server/services/manipulatives.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

const boss = createUser({ username: 'XbcBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(hash) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  await page.waitForSelector('#mp-board');
  return { ctx, page, errors };
}
/** A saved board opened through its share code, the board at the top of the window, everything fitted into it. */
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Xbc test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-obj').length > 0);
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  // Until the board stops moving (Fit eases it into place).
  let r = await page.locator('#mp-content .mp-obj').first().boundingBox();
  for (let i = 0; i < 20; i++) { await page.waitForTimeout(60); const q = await page.locator('#mp-content .mp-obj').first().boundingBox(); if (Math.abs(q.x - r.x) < 0.5 && Math.abs(q.y - r.y) < 0.5 && Math.abs(q.width - r.width) < 0.5) break; r = q; }
}
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return b; };
async function mdrag(page, [x0, y0], [x1, y1], steps = 12) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(12); }
  await page.mouse.up(); await page.waitForTimeout(200);
}
const undo = async page => { await page.click('[data-tool="undo"]'); await page.waitForTimeout(150); };

// ---------------------------------------------------------------- the coordinate grid
const GRID = '#mp-content svg.mp-grid';
/** The screen spot of grid point (x, y) on the first quadrant (0..12). */
const at = async (page, x, y) => { const r = await box(page, GRID); return [r.x + (x / 12) * r.width, r.y + (1 - y / 12) * r.height]; };
const tap = async (page, x, y) => { const [sx, sy] = await at(page, x, y); await page.mouse.click(sx, sy); await page.waitForTimeout(150); };
const table = page => page.$$eval('#mp-content .mp-xytable td b', bs => bs.map(b => b.textContent).join(' '));
const grid = (extra = {}) => ({ objects: [{ id: 'g', k: 'xy-coordinate-board', x: 900, y: 700, s: 1, locked: true, st: { four: false, labels: true, connect: true, arrows: false, table: true, color: '#E53935', pts: [], ...extra } }] });

test('the grid: tapping the first point closes the shape (fill, closing side, the table says so); Undo; the palette closes it too; the next tap starts a new line', { skip }, async () => {
  const { ctx, page, errors } = await open('#xy-coordinate-board');
  await load(page, 'xy-coordinate-board', grid());
  // "Plot the treasure": (3, 4), (6, 2), (6, 7), connected in order.
  await tap(page, 3, 4); await tap(page, 6, 2); await tap(page, 6, 7);
  assert.equal(await table(page), '(3,4) (6,2) (6,7)');
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0, 'an open line, not a shape yet');
  assert.equal(await page.locator(`${GRID} .mp-xyfirst`).count(), 1, 'the first point is marked: a tap there closes it');
  // A tap on a point that is not the first adds nothing and closes nothing.
  await tap(page, 6, 2);
  assert.equal(await table(page), '(3,4) (6,2) (6,7)');
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0);
  // The first point closes it.
  await tap(page, 3, 4);
  assert.equal(await page.locator(`${GRID} .mp-xyshape polygon`).first().getAttribute('fill'), '#E53935', 'a light fill in its color');
  assert.equal(await page.locator(`${GRID} .mp-xyshape polygon`).first().getAttribute('fill-opacity'), '.16');
  assert.equal(await table(page), '(3,4) (6,2) (6,7)', 'no point added');
  assert.equal(await page.textContent('#mp-content .mp-xyshut'), 'Red shape closed (3 points)');
  assert.equal(await page.textContent('#mp-content .mp-obj .mp-otot'), '3 points · 1 closed shape');
  assert.equal(await page.locator(`${GRID} .mp-xyfirst`).count(), 0);
  // Any point of a closed shape: nothing.
  await tap(page, 6, 7); await tap(page, 3, 4);
  assert.equal(await table(page), '(3,4) (6,2) (6,7)');
  // Undo opens it again; the palette's Close the shape closes it.
  await undo(page);
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0, 'Undo opened it');
  assert.equal(await page.locator(`${GRID} polyline.mp-xyline`).count(), 1, 'the line is still there');
  await page.click('#mp-palette [aria-label="Close the red shape"]'); await page.waitForTimeout(150);
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 1, 'the palette closed it');
  // The next red tap starts a new line; the shape stays.
  await tap(page, 1, 10); await tap(page, 3, 10);
  assert.equal(await table(page), '(3,4) (6,2) (6,7) (1,10) (3,10)');
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 1);
  assert.equal(await page.locator(`${GRID} polyline.mp-xyline`).count(), 1, 'a new open line beside the shape');
  // Dragging a point of the shape still works (and it stays closed); dragging its side moves the whole shape.
  await mdrag(page, await at(page, 6, 7), await at(page, 7, 8));
  assert.equal(await table(page), '(3,4) (6,2) (7,8) (1,10) (3,10)');
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 1, 'still closed');
  await mdrag(page, await at(page, 4.5, 3), await at(page, 5.5, 3));
  assert.equal(await table(page), '(4,4) (7,2) (8,8) (1,10) (3,10)', 'the whole shape moved one step right');
  // Undo all the way back past the close.
  for (let i = 0; i < 5; i++) await undo(page);
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0);
  assert.equal(await table(page), '(3,4) (6,2) (6,7)');
  // Saved: the server keeps the closed lines and the line each point is on.
  const saved = M.cleanState(JSON.stringify({ v: 2, ...grid({ pts: [{ x: 3, y: 4, color: '#E53935' }, { x: 6, y: 2, color: '#E53935' }, { x: 6, y: 7, color: '#E53935' }, { x: 1, y: 10, color: '#E53935', ln: 1 }], shut: ['#E53935#0', 'junk'] }) }), null, 'xy-coordinate-board');
  const g = JSON.parse(saved.state).objects[0].st;
  assert.deepEqual(g.shut, ['#E53935#0']);
  assert.equal(g.pts[3].ln, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the grid: the palette with too few points says so and changes nothing; Lines off: a tap on the first point adds nothing', { skip }, async () => {
  const { ctx, page, errors } = await open('#xy-coordinate-board');
  await load(page, 'xy-coordinate-board', grid());
  await tap(page, 2, 2); await tap(page, 5, 2);
  await page.click('#mp-palette [aria-label="Close the red shape"]'); await page.waitForTimeout(150);
  assert.match(await page.textContent('#toasts .toast'), /Plot 3 points or more in red first\./);
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0);
  await tap(page, 5, 6);
  await page.click('#mp-palette [aria-label="Lines off"]'); await page.waitForTimeout(150);
  await tap(page, 2, 2);
  assert.equal(await page.locator(`${GRID} .mp-xyshape`).count(), 0, 'Lines off: no shape');
  assert.equal(await table(page), '(2,2) (5,2) (5,6)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- bar models
const BAR = '#mp-content .mp-obj.k-bar-models';
const bars = (b0 = [{ label: 'Dogs', value: 4, color: '#7CB342' }, { label: 'Cats', value: 4, color: '#AED581' }]) => ({ objects: [{ id: 'b', k: 'bar-models', x: 900, y: 700, s: 1, locked: true, st: { bars: [{ name: 'Whole', segs: b0 }, { name: 'Other', segs: [{ label: 'Blue', value: 3, color: '#8E24AA' }] }] } }] });
const parts = page => page.$$eval(`${BAR} .mp-bar`, bs => bs.map(b => [...b.querySelectorAll('.mp-seg')].map(s => `${s.querySelector('.mp-seglabel').value}=${s.querySelector('.mp-segval') ? s.querySelector('.mp-segval').value : s.querySelector('b').textContent}`).join(',')));
const val = (b, s) => `${BAR} .mp-segval[data-bar="${b}"][data-seg="${s}"]`;

test('bar models: a part\'s number takes a typed size (clamped; - and + still step it); the name still renames', { skip }, async () => {
  const { ctx, page, errors } = await open('#bar-models');
  await load(page, 'bar-models', bars());
  // "Part-part-whole: pets": 15 dogs and 9 cats, typed.
  await page.fill(val(0, 0), '15'); await page.press(val(0, 0), 'Enter'); await page.waitForTimeout(150);
  await page.fill(val(0, 1), '9'); await page.locator(val(0, 1)).blur(); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=15,Cats=9', 'Blue=3']);
  assert.equal(await page.textContent(`${BAR} p.mp-barname`), 'Whole · total 24');
  await page.fill(val(0, 1), '0'); await page.press(val(0, 1), 'Enter'); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=15,Cats=0.5', 'Blue=3'], 'at least 0.5, as - does');
  await page.fill(val(0, 1), '5000'); await page.press(val(0, 1), 'Enter'); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=15,Cats=999', 'Blue=3'], 'at most 999');
  await undo(page); await undo(page);
  assert.deepEqual(await parts(page), ['Dogs=15,Cats=9', 'Blue=3'], 'Undo takes each typed size back');
  await page.click(`${BAR} [data-act="seg"][data-bar="0"][data-seg="1"][data-d="1"]`); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=15,Cats=10', 'Blue=3'], '+ still steps it');
  await page.fill(`${BAR} .mp-seglabel[data-bar="0"][data-seg="1"]`, '?'); await page.waitForTimeout(100);
  await page.locator(`${BAR} .mp-seglabel[data-bar="0"][data-seg="1"]`).blur();
  assert.deepEqual(await parts(page), ['Dogs=15,?=10', 'Blue=3']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bar models: tap a part to select it, then Delete removes it (never one tap); the last part takes its bar; light fills get dark text', { skip }, async () => {
  const { ctx, page, errors } = await open('#bar-models');
  await load(page, 'bar-models', bars());
  const seg = (b, s) => page.locator(`${BAR} .mp-seg[data-bar="${b}"][data-seg="${s}"]`);
  // The part's corner, once the board has stopped moving (Fit may still be easing it into place).
  const edge = async (b, s) => {
    let r = await seg(b, s).boundingBox();
    for (let i = 0; i < 20; i++) { await page.waitForTimeout(60); const q = await seg(b, s).boundingBox(); if (Math.abs(q.x - r.x) < 0.5 && Math.abs(q.y - r.y) < 0.5) break; r = q; }
    return [r.x + 8, r.y + 6];
  };
  assert.equal(await page.locator(`${BAR} .mp-segdel`).count(), 0);
  await page.mouse.click(...await edge(0, 1)); await page.waitForTimeout(150);
  assert.equal(await page.locator(`${BAR} .mp-seg.on`).count(), 1, 'selected');
  assert.deepEqual(await parts(page), ['Dogs=4,Cats=4', 'Blue=3'], 'selecting deletes nothing');
  assert.equal(await page.textContent(`${BAR} .mp-segdel`), '🗑 Delete Cats');
  // A tap on the part's number or name does not select it.
  await page.click(val(0, 0)); await page.waitForTimeout(100);
  assert.equal(await page.locator(`${BAR} .mp-seg.on[data-seg="1"]`).count(), 1, 'still Cats');
  await page.click(`${BAR} .mp-segdel`); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=4', 'Blue=3']);
  assert.equal(await page.locator(`${BAR} .mp-segdel`).count(), 0);
  await undo(page);
  assert.deepEqual(await parts(page), ['Dogs=4,Cats=4', 'Blue=3'], 'Undo brings it back');
  // The bar's last part takes the bar with it.
  await page.mouse.click(...await edge(1, 0)); await page.waitForTimeout(150);
  await page.click(`${BAR} .mp-segdel`); await page.waitForTimeout(150);
  assert.deepEqual(await parts(page), ['Dogs=4,Cats=4']);
  // Tap the selected part again: no longer selected.
  await page.mouse.click(...await edge(0, 0)); await page.waitForTimeout(150);
  await page.mouse.click(...await edge(0, 0)); await page.waitForTimeout(150);
  assert.equal(await page.locator(`${BAR} .mp-seg.on`).count(), 0);
  // Light green: dark text; purple: white.
  await undo(page); await undo(page); await undo(page);
  const ink = sel => page.$eval(sel, e => getComputedStyle(e).color);
  assert.equal(await ink(`${BAR} .mp-seglabel[data-bar="0"][data-seg="1"]`), 'rgb(20, 20, 20)', 'dark on light green');
  assert.equal(await ink(`${BAR} .mp-seglabel[data-bar="0"][data-seg="0"]`), 'rgb(20, 20, 20)', 'dark on green');
  assert.equal(await ink(`${BAR} .mp-seglabel[data-bar="1"][data-seg="0"]`), 'rgb(255, 255, 255)', 'white on purple');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the clock
const FACE = '#mp-content svg.mp-clock';
const clock = (h, m, extra = {}) => ({ objects: [{ id: 'c', k: 'clock', x: 1000, y: 700, s: 1, st: { h, m, start: null, label: '', ...extra } }] });
/** A spot on the face toward minute m (0..60, 12 at the top), r units from the middle (220 across). */
const dial = async (page, m, r) => { const b = await box(page, FACE); const a = (m / 60) * 2 * Math.PI - Math.PI / 2, k = b.width / 220; return [b.x + b.width / 2 + Math.cos(a) * r * k, b.y + b.height / 2 + Math.sin(a) * r * k]; };
const shows = page => page.$eval(FACE, s => s.getAttribute('aria-label'));
/** The hour hand's angle in degrees clockwise from the 12. */
const hourAngle = page => page.$eval(`${FACE} line[stroke="#E53935"][stroke-width="8"]`, l => { const a = Math.atan2(+l.getAttribute('y2') - 110, +l.getAttribute('x2') - 110) * 180 / Math.PI + 90; return (a + 360) % 360; });
async function sweep(page, m0, m1, r = 78) {
  // Round the face in small steps (the way a hand is dragged), from minute m0 to m1 (m1 < m0: backwards).
  const n = Math.max(6, Math.abs(m1 - m0));
  await page.mouse.move(...await dial(page, m0, r)); await page.mouse.down();
  for (let i = 1; i <= n; i++) { await page.mouse.move(...await dial(page, m0 + ((m1 - m0) * i) / n, r)); await page.waitForTimeout(10); }
  await page.mouse.up(); await page.waitForTimeout(200);
}

test('the clock: the minute hand carries the hour past 12, both ways; the hour hand sits between the numbers and moves the time in 5-minute steps', { skip }, async () => {
  const { ctx, page, errors } = await open('#clock');
  await load(page, 'clock', clock(10, 55));
  await sweep(page, 55, 65);
  assert.equal(await shows(page), 'Clock showing 11:05', 'past 12 clockwise: an hour later');
  assert.equal(await page.textContent('#mp-content .mp-hm'), '11:05');
  await sweep(page, 5, -5);
  assert.equal(await shows(page), 'Clock showing 10:55', 'back past 12: an hour earlier');
  await sweep(page, 55, 125);
  assert.equal(await shows(page), 'Clock showing 12:05', 'round more than once: two hours on');
  await undo(page);
  assert.equal(await shows(page), 'Clock showing 10:55', 'Undo takes the drag back');

  // At 10:30 the hour hand is halfway between 10 and 11.
  await load(page, 'clock', clock(10, 30));
  assert.ok(Math.abs(await hourAngle(page) - 315) < 0.5, `10:30: ${await hourAngle(page)}°, wanted 315°`);
  // The hour hand moves the time on in 5-minute steps (the minute hand follows) and stays between the numbers.
  await sweep(page, 52.5, 57.5, 40);   // the hour hand from 10:30 toward 11:30
  const t = /Clock showing (\d+):(\d\d)/.exec(await shows(page));
  assert.ok(t, await shows(page));
  const h = +t[1], m = +t[2];
  assert.equal(m % 5, 0, `5-minute steps: ${h}:${m}`);
  assert.ok((h === 11 && m >= 15) || (h === 11 && m <= 45), `about 11:30: ${h}:${m}`);
  assert.ok(Math.abs(await hourAngle(page) - ((h % 12) + m / 60) * 30) < 0.5, 'the hour hand matches the minutes');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the clock: the "+1 h" is never under a hand (at :30 too); Totals: off hides the digital time, on shows it', { skip }, async () => {
  const { ctx, page, errors } = await open('#clock');
  for (const [h, m] of [[10, 30], [11, 0], [12, 45], [4, 20]]) {
    await load(page, 'clock', clock(h, m, { start: { h: h === 12 ? 11 : h - 1, m } }));
    const [x, y] = await page.$eval(`${FACE} .mp-cturns`, e => [+e.getAttribute('x'), +e.getAttribute('y') - 5]);
    const a = Math.atan2(y - 110, x - 110) * 180 / Math.PI + 90, ha = ((h % 12) + m / 60) * 30, ma = m * 6;
    const away = b => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
    assert.ok(away(ha) >= 60 && away(ma) >= 60, `${h}:${m}: +1 h at ${a.toFixed(0)}°, hands at ${ha}° and ${ma}°`);
  }
  // Totals: off: no digital time, no elapsed line; the face still works.
  await load(page, 'clock', clock(10, 30, { start: { h: 9, m: 30 } }));
  assert.equal(await page.textContent('#mp-content .mp-hm'), '10:30');
  assert.match(await page.textContent('#mp-content .mp-elapsed'), /Elapsed 1 h 0 min/);
  await page.click('#mp-settings [data-view="totals"]'); await page.waitForTimeout(150);
  assert.equal(await page.textContent('#mp-settings [data-view="totals"]'), 'Totals: off');
  assert.equal(await page.locator('#mp-content .mp-hm').count(), 0, 'no digital time');
  assert.doesNotMatch(await page.textContent('#mp-content .mp-clockwrap'), /10:30|Elapsed/);
  await page.click('#mp-content [data-act="min5"]'); await page.waitForTimeout(150);
  assert.equal(await shows(page), 'Clock showing 10:35, 65 minutes since 9:30', 'the clock still works');
  assert.equal(await page.locator('#mp-content .mp-hm').count(), 0, 'still hidden');
  await page.click('#mp-settings [data-view="totals"]'); await page.waitForTimeout(150);
  assert.equal(await page.textContent('#mp-content .mp-hm'), '10:35', 'on: back');
  assert.deepEqual(errors, []);
  await ctx.close();
});
