// The manipulatives' answer boxes, board text and coordinate grid in a real browser (docs/decisions.md "Virtual math
// manipulatives: answer boxes, text boxes and the coordinate grid"): a long answer wraps inside its box and a corner drag
// makes the box bigger (more of the answer shows) at the same font size, and typing past the bottom grows it; a text box
// is dragged (and snaps), resized (its words wrap), made bigger with A+, and is still editable; on the coordinate grid a
// point drags alone (its line follows) while the line between points drags the whole line, on whole grid steps; and
// the same in a live room on a phone, saved for everyone. MANIP_SHOTS=<dir> also saves pictures. Skipped when no
// Chromium is installed.
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

const boss = createUser({ username: 'TextGraphBoss', password: 'secret123', role: 'admin' });
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
const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
async function open(who, hash, ctxOpts = LAPTOP) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.text().startsWith('SNAP')) console.log(m.text()); });
  await page.goto(`${BASE}/manipulatives${hash}`);
  const cdp = ctxOpts.hasTouch ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errors, cdp };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** A saved board opened through its share code, fitted to the screen. */
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Text and graph', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-obj').length > 0);
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.waitForTimeout(100);
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(100);
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
async function tap(page, cdp, [x, y]) { await touch(cdp, 'touchStart', [[x, y]]); await page.waitForTimeout(60); await touch(cdp, 'touchEnd', []); await page.waitForTimeout(200); }
async function tdrag(page, cdp, [x0, y0], [x1, y1]) {
  await touch(cdp, 'touchStart', [[x0, y0]]);
  for (let i = 1; i <= 12; i++) { await touch(cdp, 'touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12]]); await page.waitForTimeout(16); }
  await touch(cdp, 'touchEnd', []); await page.waitForTimeout(250);
}
async function mdrag(page, [x0, y0], [x1, y1]) { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x1, y1, { steps: 12 }); await page.mouse.up(); await page.waitForTimeout(150); }
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return b; };
const center = async (page, sel) => { const b = await box(page, sel); return [b.x + b.width / 2, b.y + b.height / 2]; };
const LONG = 'I added 23 and 19 to get 42, then I checked it by counting back';
/** An answer textarea's numbers: font size, line height, its visible and full heights, and its lines. */
const ansInfo = (page, sel) => page.$eval(sel, ta => {
  const cs = getComputedStyle(ta), lh = parseFloat(cs.lineHeight), out = { font: cs.fontSize, ws: cs.whiteSpace, w: ta.clientWidth, h: ta.clientHeight, full: ta.scrollHeight, wide: ta.scrollWidth <= ta.clientWidth + 1 };
  const h = ta.style.height; ta.style.height = '0px'; out.lines = Math.round((ta.scrollHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)) / lh); ta.style.height = h;
  return out;
});

test('an answer box: a long answer wraps; dragging its corner shows more of it at the same font size; typing past the bottom grows the box', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#clock');
  await load(page, 'clock', { objects: [{ id: 'A', k: 'answer', x: 1800, y: 1100, s: 1, st: { ans: LONG, size: 'M' } }, { id: 'B', k: 'answer', x: 1800, y: 1300, s: 1, st: { ans: '', size: 'M' } }, { id: 'D', k: 'answer', x: 2200, y: 2400 - 30 - 64, s: 1, st: { ans: LONG, size: 'S' } }] });
  const ta = '#mp-content .mp-obj[data-oid="A"] textarea.mp-answer';
  const a0 = await ansInfo(page, ta);
  assert.equal(a0.ws, 'pre-wrap', 'the words wrap');
  assert.ok(a0.wide, 'nothing runs off the side');
  assert.ok(a0.lines >= 3, `on more than one line (${a0.lines})`);
  assert.ok(a0.full <= a0.h + 1, 'the box grew taller to show all of it');
  await shot(page, 'answer-before-resize');
  // Select it (a tap on its handle), then drag its corner right and down.
  await page.click('#mp-content .mp-obj[data-oid="A"] .mp-ohead');
  const c = await center(page, '#mp-content .mp-obj[data-oid="A"] .mp-oresize');
  await mdrag(page, c, [c[0] + 160, c[1] + 40]);
  const a1 = await ansInfo(page, ta);
  assert.equal(a1.font, a0.font, 'the same font size');
  assert.ok(a1.w > a0.w + 100 && a1.h > a0.h + 20, `a bigger box (${a0.w}x${a0.h} -> ${a1.w}x${a1.h})`);
  assert.ok(a1.lines < a0.lines, 'the words reflow onto fewer lines');
  assert.ok(a1.full <= a1.h + 1, 'all of the answer shows');
  const st = await page.evaluate(() => document.querySelector('#mp-content .mp-obj[data-oid="A"]').style.width);
  assert.ok(parseFloat(st) > 300, 'the object is wider');
  assert.equal(await page.$eval('#mp-content .mp-obj[data-oid="A"] .mp-objin', e => e.style.transform || 'scale(1)'), 'scale(1)', 'never scaled');
  await shot(page, 'answer-after-resize');
  // Typing a long answer into a small box grows it taller.
  // A box that can't grow (at the bottom of the board): its words scroll (never clipped silently); wider, all of them show.
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  const D = '#mp-content .mp-obj[data-oid="D"]';
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(100);
  const d0 = await ansInfo(page, `${D} textarea.mp-answer`);
  assert.ok(d0.full > d0.h + 4 && (await page.$eval(`${D} textarea.mp-answer`, e => getComputedStyle(e).overflowY)) === 'auto', 'too much for the box: it scrolls');
  await page.click(`${D} .mp-ohead`);
  const dc = await center(page, `${D} .mp-oresize`);
  await mdrag(page, dc, [dc[0] + 300, dc[1]]);
  const d1 = await ansInfo(page, `${D} textarea.mp-answer`);
  assert.equal(d1.font, d0.font, 'the same font size');
  assert.ok(d1.full <= d1.h + 1 && d1.lines < d0.lines, `wider: the whole answer shows (${d0.lines} -> ${d1.lines} lines)`);
  const tb = '#mp-content .mp-obj[data-oid="B"] textarea.mp-answer';
  const h0 = (await box(page, '#mp-content .mp-obj[data-oid="B"]')).height;
  await page.click(tb); await page.keyboard.type(LONG); await page.keyboard.press('Enter');
  const b1 = await ansInfo(page, tb);
  assert.ok((await box(page, '#mp-content .mp-obj[data-oid="B"]')).height > h0 + 20, 'the box grew');
  assert.ok(b1.full <= b1.h + 1, 'its whole answer shows');
  assert.equal(await page.$eval(tb, e => e.value), LONG, 'Enter finished it (no new line)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a text box: dragged (it snaps beside things), resized (words wrap), bigger with A+, and still editable', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#clock');
  await load(page, 'clock', { objects: [{ id: 'C', k: 'clock', x: 1800, y: 1000, s: 1, st: { h: 9, m: 15, start: null, label: '' } }] });
  await page.click('[data-tool="text"]');
  const cb0 = await box(page, '#mp-content .mp-obj[data-oid="C"]');
  await page.mouse.click(cb0.x + cb0.width + 60, cb0.y + 40);
  await page.keyboard.type('Count on from nine to see what passed'); await page.keyboard.press('Enter');
  await page.click('[data-tool="text"]');   // text mode off: a drag moves it
  const t0 = await box(page, '.mp-text'), cb = await box(page, '#mp-content .mp-obj[data-oid="C"]');
  await shot(page, 'text-before-move');
  // Dragged by the mouse to just right of the clock: it snaps 8 px from the clock's right edge, at the clock's top.
  await mdrag(page, [t0.x + 20, t0.y + 10], [t0.x + 20 - (t0.x - cb.x - cb.width) + 12, t0.y + 10 - (t0.y - cb.y) + 5]);
  const t1 = await box(page, '.mp-text');
  assert.ok(Math.abs(t1.x - (cb.x + cb.width + 8)) <= 1.5 && Math.abs(t1.y - cb.y) <= 1.5, `moved and snapped beside the clock (${t1.x},${t1.y} vs ${cb.x + cb.width},${cb.y})`);
  await shot(page, 'text-after-move');
  // A tap opens it to edit: the corner gives it a box its words wrap in, A+ twice makes them bigger.
  await page.mouse.click(t1.x + 20, t1.y + 10);
  await page.waitForSelector('.mp-text.editing textarea');
  const r = await center(page, '.mp-text.editing [data-trz]'), e0 = await box(page, '.mp-text.editing');
  await mdrag(page, r, [r[0] - e0.width + 240, r[1] + 80]);
  let e1 = await box(page, '.mp-text.editing');
  assert.ok(Math.abs(e1.width - 240) < 30 && e1.height > e0.height + 40, `resized to about 240 wide, taller (${e1.width}x${e1.height})`);
  const f0 = await page.$eval('.mp-text', e => parseFloat(getComputedStyle(e).fontSize));
  await page.click('[data-tsz="1"]'); await page.click('[data-tsz="1"]');
  const f1 = await page.$eval('.mp-text', e => parseFloat(getComputedStyle(e).fontSize));
  assert.ok(f1 > f0 + 10, `bigger (${f0} -> ${f1})`);
  assert.ok(await page.locator('.mp-text.editing textarea').count(), 'still being written after A+');
  e1 = await box(page, '.mp-text.editing');
  assert.ok(Math.abs(e1.width - 240) < 30, 'the same width: the bigger words wrap inside it');
  assert.equal(await page.$eval('.mp-text.editing textarea', ta => ta.scrollWidth <= ta.clientWidth + 1), true, 'its words wrap');
  // The grip moves it while it is being written.
  const g = await center(page, '[data-tgrip]');
  await mdrag(page, g, [g[0] + 60, g[1] + 200]);
  const e2 = await box(page, '.mp-text.editing');
  assert.ok(e2.y > e1.y + 150, 'the grip moved it');
  // Still editable: type more, Enter.
  await page.click('.mp-text.editing textarea'); await page.keyboard.press('Control+End'); await page.keyboard.type(' today'); await page.keyboard.press('Enter');
  assert.match(await page.textContent('.mp-text'), /what passed today$/);
  assert.equal(await page.$eval('.mp-text', e => getComputedStyle(e).whiteSpace), 'pre-wrap');
  await shot(page, 'text-big-wrapped');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a text box on a phone: a finger drags it, a tap opens it, A− makes it smaller', { skip }, async () => {
  const { ctx, page, errors, cdp } = await open(boss, '#clock', PHONE());
  await load(page, 'clock', { objects: [{ id: 'C', k: 'clock', x: 1800, y: 1000, s: 1, st: { h: 9, m: 15, start: null, label: '' } }], __ann: { notes: [], strokes: [], texts: [{ id: 'tx', text: 'Start time', x: 0.45, y: 0.4 }] } });
  const t0 = await box(page, '.mp-text');
  await tdrag(page, cdp, [t0.x + 15, t0.y + 8], [t0.x + 75, t0.y + 108]);
  const t1 = await box(page, '.mp-text');
  assert.ok(t1.x > t0.x + 30 && t1.y > t0.y + 60, `a finger moved it (${t0.x},${t0.y} -> ${t1.x},${t1.y})`);
  await tap(page, cdp, [t1.x + 10, t1.y + 6]);
  await page.waitForSelector('.mp-text.editing textarea');
  await tap(page, cdp, await center(page, '[data-tsz="-1"]'));
  assert.equal(await page.$eval('.mp-text', e => getComputedStyle(e).fontSize), '14px');
  assert.ok(await page.locator('.mp-text.editing').count(), 'still open after A−');
  await shot(page, 'text-phone-small');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const xyBoard = (extra = {}) => ({ objects: [{ id: 'G', k: 'xy-coordinate-board', x: 1700, y: 900, s: 1, st: { four: true, labels: true, connect: true, arrows: true, table: true, color: '#1E88E5',
  pts: [{ x: -4, y: -3, color: '#1E88E5' }, { x: 0, y: -1, color: '#1E88E5' }, { x: 4, y: 1, color: '#1E88E5' }, { x: 2, y: 6, color: '#E53935' }], ...extra } }] });
/** The grid's points as the page now holds them (from its table). */
const tablePts = page => page.$$eval('#mp-content .mp-xytable tbody tr, .rm-area.mine .mp-xytable tbody tr', rows => rows.map(r => r.children[2].textContent));
/** A grid value's place on the screen. */
const gridAt = (page, sel, x, y) => page.$eval(sel, (svg, [x, y]) => { const r = svg.getBoundingClientRect(); return [r.left + ((x + 10) / 20) * r.width, r.top + (1 - (y + 10) / 20) * r.height]; }, [x, y]);

test('the coordinate grid: a point drags alone (its line follows); the line between points drags the whole line on whole grid steps', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#xy-coordinate-board');
  await load(page, 'xy-coordinate-board', xyBoard());
  const svg = '#mp-content svg.mp-grid';
  assert.deepEqual(await tablePts(page), ['(-4,-3)', '(0,-1)', '(4,1)', '(2,6)']);
  assert.equal(await page.locator(`${svg} polygon`).count(), 6, 'four axis arrows and the line\'s two end arrows');
  await shot(page, 'graph-line-arrows-table');
  // The line, halfway between (0,-1) and (4,1): dragged 3 right and 2 up (a little off the grid lines).
  await mdrag(page, await gridAt(page, svg, 2, 0), await gridAt(page, svg, 5.2, 1.8));
  assert.deepEqual(await tablePts(page), ['(-1,-1)', '(3,1)', '(7,3)', '(2,6)'], 'the whole blue line moved 3 right and 2 up; the red point stayed');
  await shot(page, 'graph-after-line-drag');
  // A point: only it moves, and its line follows.
  await mdrag(page, await gridAt(page, svg, 3, 1), await gridAt(page, svg, 3.1, 5.2));
  assert.deepEqual(await tablePts(page), ['(-1,-1)', '(3,5)', '(7,3)', '(2,6)'], 'only that point moved');
  // A line can't leave the grid: dragged far right it stops with its last point on the edge, its shape kept.
  await mdrag(page, await gridAt(page, svg, 5, 4), await gridAt(page, svg, 9.8, 4));
  assert.deepEqual(await tablePts(page), ['(2,-1)', '(6,5)', '(10,3)', '(2,6)']);
  // A tap on empty grid still plots a point; the drags plotted nothing; Undo takes back the last drag.
  await page.waitForTimeout(300); await page.mouse.click(...await gridAt(page, svg, -7, 7)); await page.waitForTimeout(150);
  assert.equal((await tablePts(page)).length, 5);
  await page.click('[data-tool="undo"]'); await page.click('[data-tool="undo"]');
  assert.deepEqual(await tablePts(page), ['(-1,-1)', '(3,5)', '(7,3)', '(2,6)']);
  // Table off: the grid alone.
  await page.click('#mp-content .mp-obj[data-oid="G"] .mp-ohead');
  await page.click('[data-toggle="table"]');
  assert.equal(await page.locator('#mp-content .mp-xytable').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the live room on a phone: answer box, text box and grid line changes are saved for everyone', { skip }, async () => {
  const oak = S.createSchool(boss, { name: 'Text Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: 'Text 5B' }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Bo Pear' }).user.id); S.addToClass(boss, A.id, kid.id);
  const saved = s => JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, kid.id).state);
  // An answer box and a text in Bo's square.
  const s = M.createSession(boss, { classId: A.id, tool: 'clock', title: 'Elapsed time' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  assert.ok(M.saveArea(boss, s.id, kid.id, { v: 2, objects: [{ id: 'A', k: 'answer', x: 20, y: 20, s: 1, st: { ans: '', size: 'M' } }], __ann: { notes: [], strokes: [], texts: [] } }).ok);
  const { ctx, page, errors, cdp } = await open(kid, `#live/${s.id}`, PHONE());
  const mine = '.rm-area.mine';
  await page.waitForSelector(`${mine} textarea.mp-answer`); await page.waitForTimeout(400);
  await tap(page, cdp, await center(page, `${mine} textarea.mp-answer`));
  await page.keyboard.type(LONG); await page.waitForTimeout(1100);
  let st = saved(s).objects.find(o => o.id === 'A').st;
  assert.equal(st.ans, LONG, 'the long answer is saved whole');
  assert.ok(st.h > 58, `the box grew taller (${st.h})`);
  await page.keyboard.press('Enter');
  await tap(page, cdp, await center(page, `${mine} .mp-obj[data-oid="A"] .mp-ohead`));
  const c = await center(page, `${mine} .mp-obj[data-oid="A"] .mp-oresize`);
  await tdrag(page, cdp, c, [c[0] + 60, c[1] + 20]);
  await page.waitForTimeout(1100);
  st = saved(s).objects.find(o => o.id === 'A').st;
  assert.ok(st.w > 240, `wider, saved (${st.w})`);
  assert.equal(saved(s).objects.find(o => o.id === 'A').s, 1, 'never scaled');
  // A text: placed with T, A+ once, then moved by its grip.
  await tap(page, cdp, await center(page, '[data-rtool="text"]'));
  const ab = await box(page, `${mine} .mp-obj[data-oid="A"]`);
  await tap(page, cdp, [ab.x + 10, ab.y + ab.height + 16]);
  await page.keyboard.type('My work');
  await tap(page, cdp, await center(page, `${mine} [data-tsz="1"]`));
  const g = await center(page, `${mine} [data-tgrip]`), tb0 = await box(page, `${mine} .mp-text`);
  await tdrag(page, cdp, g, [g[0] + 30, g[1] + 40]);
  const tb1 = await box(page, `${mine} .mp-text`);
  assert.ok(tb1.x > tb0.x + 15 && tb1.y > tb0.y + 20, 'the grip moved it');
  assert.ok(await page.locator(`${mine} .mp-text.editing textarea`).count(), 'still being written');
  await page.keyboard.press('Enter'); await page.waitForTimeout(1100);
  const tx = saved(s).__ann.texts;
  assert.equal(tx.length, 1); assert.equal(tx[0].text, 'My work'); assert.equal(tx[0].fs, 'L', 'its size is saved');
  const ws = await page.$eval(`${mine} .rm-in`, e => e.getBoundingClientRect());
  assert.ok(Math.abs(tx[0].x * ws.width + ws.left - tb1.x) < 6, 'its new place is saved');
  await shot(page, 'room-phone-answer-text');
  await ctx.close();
  M.end(boss, s.id);
  // A grid in Bo's square: the line dragged as one.
  const s2 = M.createSession(boss, { classId: A.id, tool: 'xy-coordinate-board', title: 'Lines' }).session;
  assert.ok(M.join(kid, { code: s2.code }).ok);
  const grid = xyBoard().objects[0];
  assert.ok(M.saveArea(boss, s2.id, kid.id, { v: 2, objects: [{ ...grid, x: 10, y: 10, s: 0.6 }] }).ok);
  const p2 = await open(kid, `#live/${s2.id}`, PHONE());
  await p2.page.waitForSelector(`${mine} svg.mp-grid`); await p2.page.waitForTimeout(400);
  const svg = `${mine} svg.mp-grid`;
  await tdrag(p2.page, p2.cdp, await gridAt(p2.page, svg, 2, 0), await gridAt(p2.page, svg, 4, -2));
  await p2.page.waitForTimeout(1100);
  assert.deepEqual(saved(s2).objects[0].st.pts.map(p => [p.x, p.y]), [[-2, -5], [2, -3], [6, -1], [2, 6]], 'the blue line moved 2 right and 2 down, saved');
  await shot(p2.page, 'room-phone-graph');
  assert.deepEqual([...errors, ...p2.errors], []);
  await p2.ctx.close();
  M.end(boss, s2.id);
});
