// Figures "Draw it" in a real browser (public/js/figures-draw.js, figures-draw-geom.js, figures-editor.js): on a laptop
// with a mouse, three taps on the dot grid make a triangle whose exact measures fill the fields and draw the real figure;
// dragging a corner updates them; the keyboard nudges a corner; undo and redo bring drawings back; the drawn figure and
// its coordinate-grid twin each go on a worksheet. On a phone (CDP touch) the grid takes the finger without scrolling the
// page. A drawing that is not this kind of shape says so and links to the right editor, which opens with the drawing;
// the cannot-draw panel offers "Draw it on a grid instead"; a drawn preset reopens its drawing. FIG_SHOTS=<dir> saves
// pictures at twice the pixels. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const F = await import('../../server/services/figures.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigDrawer', password: 'secret123', role: 'admin' });
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
const LAPTOP = () => ({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
async function open(path, ctxOpts = LAPTOP()) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (el, name) => { if (SHOTS) await el.screenshot({ path: `${SHOTS}/${name}.png` }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
/** The page position of a dot on the grid (whole-number x, y), from the board's own geometry. */
const dot = (page, x, y) => page.evaluate(([x, y]) => {
  const svg = document.querySelector('.fg-board-svg'), vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), k = r.width / vb.width;
  const n = (vb.width - 60) / 40, lo = +svg.querySelector('text').textContent; // the first number along the bottom is the left edge
  return { x: r.left + (30 + (x - lo) * 40) * k, y: r.top + (30 + (lo + n - y) * 40) * k };
}, [x, y]);
const tap = async (page, x, y) => { const p = await dot(page, x, y); await page.mouse.click(p.x, p.y); };
const code = page => page.textContent('#fg-code');
const data = async page => JSON.parse((await code(page)).replace(/^OF\.svg\('\w+', /, '').replace(/(, \{ hide: .*)?\)$/, ''));

test('laptop with a mouse: tap three dots, the measures fill in exactly; drag a corner; keyboard nudge; undo; add both outputs to a worksheet', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/triangle');
  await page.waitForSelector('#fg-figure svg');
  assert.equal(await page.isHidden('#fg-draw'), true, 'Type the measures first');
  await page.click('[data-act="mode"][data-mode="draw"]');
  await page.waitForSelector('#fg-draw:not([hidden])');
  assert.equal(await page.getAttribute('[data-mode="draw"]', 'aria-pressed'), 'true');
  assert.match(await page.getAttribute('.fg-board-svg', 'aria-label'), /Dot grid, 10 by 10/);
  await tap(page, 1, 1);
  assert.match(await page.textContent('#fg-dmsg'), /Tap 2 more dots\./);
  await tap(page, 4, 1);
  await tap(page, 1, 3);
  await page.waitForFunction(() => /Filled in from your drawing/.test(document.getElementById('fg-dmsg').textContent));
  // live measures: corners, exact sides with decimals, angles to 0.1°, the type, perimeter and area (shoelace)
  const dm = await page.textContent('#fg-dm');
  for (const s of ['A(1, 1)', 'B(4, 1)', 'C(1, 3)', 'AB = 3', 'BC = √13 ≈ 3.61', 'CA = 2', '∠A = 90° ∟', '∠B = 33.7°', '∠C = 56.3°', 'Right · Scalene', '5 + √13 ≈ 8.61', '3 square units']) assert.ok(dm.includes(s), `${s} in ${dm}`);
  // the real data: exact lengths and the right angle, in the fields and drawn by Oomba Figures
  assert.deepEqual(await data(page), { AB: 3, BC: { sqrt: 13 }, CA: 2, A: 90 });
  assert.equal(await page.inputValue('#fg-f-AB'), '3');
  assert.equal(await page.inputValue('#fg-f-BC'), '3.6056');
  assert.match(await page.textContent('label:has(#fg-f-BC) .fg-exact'), /= √13/);
  assert.equal(await page.inputValue('#fg-f-A'), '90');
  assert.match(await page.innerHTML('#fg-figure'), /class="of-shape"/);
  assert.equal(await page.isHidden('#fg-cant'), true);
  await shot(page.locator('.fg-ed-stage'), 'draw-triangle-laptop');
  // drag C from (1, 3) to (1, 5): CA = 4, BC = 5 (3, 4, 5)
  const c0 = await dot(page, 1, 3), c1 = await dot(page, 1, 5);
  await page.mouse.move(c0.x, c0.y); await page.mouse.down(); await page.mouse.move(c1.x, c1.y, { steps: 6 }); await page.mouse.up();
  await page.waitForFunction(() => document.getElementById('fg-code').textContent.includes('"BC":5'));
  assert.deepEqual(await data(page), { AB: 3, BC: 5, CA: 4, A: 90 });
  assert.match(await page.textContent('#fg-dm'), /C\(1, 5\)/);
  assert.match(await page.textContent('#fg-facts'), /5/);
  await shot(page.locator('#fg-figure'), 'draw-filled-figure');
  // the keyboard: C is picked up (it was the last one dragged); the right arrow nudges it to (2, 5)
  await page.focus('.fg-board-svg');
  await page.keyboard.press('ArrowRight');
  await page.waitForFunction(() => document.getElementById('fg-dm').textContent.includes('C(2, 5)'));
  await page.waitForFunction(() => /C moved to \(2, 5\)/.test(document.querySelector('.fg-board-wrap [role="status"]').textContent));
  assert.deepEqual(await data(page), { AB: 3, BC: { sqrt: 5, times: 2 }, CA: { sqrt: 17 } });
  assert.match(await page.textContent('#fg-dm'), /BC = 2√5 ≈ 4\.47/);
  // undo takes the nudge back, redo brings it again
  await page.click('.fg-ed-actions [data-act="undo"]');
  await page.waitForFunction(() => document.getElementById('fg-dm').textContent.includes('C(1, 5)'));
  await page.click('.fg-ed-actions [data-act="redo"]');
  await page.waitForFunction(() => document.getElementById('fg-dm').textContent.includes('C(2, 5)'));
  await page.keyboard.press('Escape');
  // a flat drawing (three dots on a line) says so and keeps the last good figure (the last one on the way there)
  const cNow = await dot(page, 2, 5), cFlat = await dot(page, 5, 1);
  await page.mouse.move(cNow.x, cNow.y); await page.mouse.down(); await page.mouse.move(cFlat.x, cFlat.y, { steps: 5 }); await page.mouse.up();
  await page.waitForFunction(() => /straight line/.test(document.getElementById('fg-dmsg').textContent));
  assert.deepEqual(await page.evaluate(d => window.OombaFigures.check('triangle', d), await data(page)), [], 'never an invalid figure');
  assert.notDeepEqual(await data(page), { AB: 3, BC: 3, CA: 1 });
  assert.equal(await page.isHidden('#fg-cant'), true);
  await page.click('.fg-ed-actions [data-act="undo"]');
  await page.waitForFunction(() => /Filled in/.test(document.getElementById('fg-dmsg').textContent));
  // the second output: the same corners on a coordinate grid, named
  await page.check('#fg-dgrid');
  await page.waitForSelector('#fg-gridout:not([hidden]) svg');
  const gsvg = await page.innerHTML('#fg-gridfig');
  assert.match(gsvg, />A</); assert.match(gsvg, />B</); assert.match(gsvg, />C</);
  await shot(page.locator('#fg-gridout'), 'draw-grid-output');
  // both go on a worksheet: the triangle first (a new sheet), then the grid figure on the same sheet
  const before = q.get('SELECT COUNT(*) n FROM question_sets WHERE owner_id=?', boss.id).n;
  await page.click('#fg-addbox .fg-addmenu summary');
  await page.click('#fg-addbox [data-act="addnew"]');
  await page.waitForSelector('#fg-added:not([hidden])');
  assert.equal(q.get('SELECT COUNT(*) n FROM question_sets WHERE owner_id=?', boss.id).n, before + 1);
  const ws = q.get('SELECT id FROM question_sets WHERE owner_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', boss.id).id;
  await page.click('#fg-gaddbox .fg-addmenu summary');
  await page.click(`#fg-gaddbox [data-act="addto"][data-ws="${ws}"]`);
  await page.waitForSelector('#fg-gadded:not([hidden])');
  const items = F.itemsOf(ws);
  assert.deepEqual(items.map(i => i.kind), ['triangle', 'grid']);
  assert.deepEqual(items[0].data, { AB: 3, BC: { sqrt: 5, times: 2 }, CA: { sqrt: 17 } });
  assert.deepEqual(items[1].data.shapes, [{ points: [[1, 1], [4, 1], [2, 5]], names: ['A', 'B', 'C'] }]);
  assert.deepEqual([items[1].data.x, items[1].data.y], [[0, 10], [0, 10]]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a phone with touch: the grid takes the finger (no page scroll), three taps and a drag fill the triangle in', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/triangle', PHONE());
  await page.waitForSelector('#fg-figure svg');
  await page.tap('[data-act="mode"][data-mode="draw"]');
  await page.waitForSelector('#fg-draw:not([hidden])');
  await noSideScroll(page);
  assert.equal(await page.$eval('.fg-board-svg', s => getComputedStyle(s).touchAction), 'none');
  const box = await page.$eval('.fg-board-svg', s => s.getBoundingClientRect().width);
  assert.ok(box >= 300 && box <= 390, `the grid fits the phone: ${box}`);
  await page.$eval('.fg-board-svg', s => s.scrollIntoView({ block: 'center', behavior: 'instant' })); // clear of the phone's tab bar
  await page.waitForFunction(() => new Promise(r => { const y = scrollY; requestAnimationFrame(() => requestAnimationFrame(() => r(scrollY === y))); }));
  const cdp = await ctx.newCDPSession(page);
  const touchTap = async (x, y) => { const p = await dot(page, x, y); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p.x, y: p.y }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
  await touchTap(2, 1); await touchTap(8, 1); await touchTap(5, 6);
  await page.waitForFunction(() => /Filled in/.test(document.getElementById('fg-dmsg').textContent));
  assert.deepEqual(await data(page), { AB: 6, BC: { sqrt: 34 }, CA: { sqrt: 34 } });
  assert.match(await page.textContent('#fg-dm'), /Acute · Isosceles/);
  // drag C down one dot with a finger (to 5 by 5 by 6): the page does not scroll
  const y0 = await page.evaluate(() => window.scrollY);
  const p0 = await dot(page, 5, 6), p1 = await dot(page, 5, 5);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0.x, y: p0.y }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0.x, y: p0.y + ((p1.y - p0.y) * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => document.getElementById('fg-dm').textContent.includes('C(5, 5)'));
  assert.equal(await page.evaluate(() => window.scrollY), y0, 'the page did not scroll');
  assert.deepEqual(await data(page), { AB: 6, BC: 5, CA: 5 });
  await noSideScroll(page);
  await shot(page.locator('#fg-draw'), 'draw-triangle-phone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the cannot-draw panel offers "Draw it on a grid instead", and the drawing replaces the bad measures', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/triangle');
  await page.waitForSelector('#fg-figure svg');
  await page.fill('#fg-f-B', ''); await page.fill('#fg-f-AB', '1'); await page.fill('#fg-f-BC', '2'); await page.fill('#fg-f-CA', '10');
  await page.waitForSelector('#fg-cant:not([hidden])');
  assert.match(await page.textContent('#fg-cant'), /These sides cannot make a triangle/);
  assert.equal(await page.textContent('#fg-cant [data-act="drawit"]'), '✏️ Draw it on a grid instead');
  await shot(page.locator('.fg-ed-stage'), 'draw-cannot-draw-button');
  await page.click('#fg-cant [data-act="drawit"]');
  await page.waitForSelector('#fg-draw:not([hidden])');
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('fg-board-svg')), true, 'the grid has the focus');
  // the keyboard alone: Enter places a corner at the cursor, the arrows move the cursor
  await page.keyboard.press('Enter');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#fg-cant[hidden]', { state: 'attached' });
  assert.deepEqual(await data(page), { AB: 3, BC: 4, CA: 5, B: 90 });
  assert.equal(await page.isDisabled('[data-act="svg"]'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('quadrilaterals: only that kind is taken; "That shape is a parallelogram, not a trapezoid" opens the right editor with the drawing', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/trapezoid');
  await page.waitForSelector('#fg-figure svg');
  await page.click('[data-act="mode"][data-mode="draw"]');
  const before = await code(page);
  for (const [x, y] of [[1, 1], [6, 1], [8, 4], [3, 4]]) await tap(page, x, y);
  await page.waitForFunction(() => /not a trapezoid/.test(document.getElementById('fg-dmsg').textContent));
  assert.match(await page.textContent('#fg-dmsg'), /That shape is a parallelogram, not a trapezoid\./);
  assert.equal(await code(page), before, 'the figure is unchanged');
  assert.match(await page.textContent('#fg-dm'), /Parallelogram/);
  await shot(page.locator('#fg-draw'), 'draw-not-a-trapezoid');
  // move D to (2, 4): exactly one pair of parallel sides now
  const d0 = await dot(page, 3, 4), d1 = await dot(page, 2, 4);
  await page.mouse.move(d0.x, d0.y); await page.mouse.down(); await page.mouse.move(d1.x, d1.y, { steps: 4 }); await page.mouse.up();
  await page.waitForFunction(() => /Filled in/.test(document.getElementById('fg-dmsg').textContent));
  // AB is the longer base (6, from (8, 4) to (2, 4)), CD the shorter (5), h = 3 and A to 4 places, written to 0.1°
  assert.deepEqual(await data(page), { AB: 6, CD: 5, h: 3, A: 56.3099, labels: { A: 56.3 } });
  assert.match(await page.textContent('#fg-dm'), /A\(8, 4\).*B\(2, 4\).*C\(1, 1\).*D\(6, 1\)/);
  // back to the parallelogram, and open it in the Parallelogram editor: the drawing comes along
  await page.click('.fg-ed-actions [data-act="undo"]');
  await page.waitForFunction(() => /not a trapezoid/.test(document.getElementById('fg-dmsg').textContent));
  await page.click('#fg-dmsg a[data-open="parallelogram"]');
  await page.waitForURL(/\/figures\/parallelogram\?draw=/);
  await page.waitForFunction(() => /Filled in/.test((document.getElementById('fg-dmsg') || {}).textContent || ''));
  assert.equal(await page.getAttribute('[data-mode="draw"]', 'aria-pressed'), 'true');
  assert.deepEqual(await data(page), { AB: 5, DA: { sqrt: 13 }, A: 56.3099, labels: { A: 56.3 } });
  assert.match(await page.innerHTML('#fg-figure'), /56\.3/);
  // a square in the parallelogram editor has an editor of its own
  await page.click('[data-act="dclear"]');
  for (const [x, y] of [[1, 1], [4, 1], [4, 4], [1, 4]]) await tap(page, x, y);
  await page.waitForFunction(() => /its own editor/.test(document.getElementById('fg-dmsg').textContent));
  assert.match(await page.textContent('#fg-dmsg'), /That shape is a square, and Oomba Figures draws it with its own editor\./);
  assert.ok(await page.$('#fg-dmsg a[data-open="rectangle"]'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('presets: a drawn example, and a teacher preset saved in Draw it, reopen their drawings', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/kite');
  await page.waitForSelector('#fg-figure svg');
  await page.selectOption('#fg-preset', 'd0');
  await page.waitForFunction(() => /Filled in/.test(document.getElementById('fg-dmsg').textContent));
  assert.deepEqual(await data(page), { AB: { sqrt: 2, times: 2 }, DA: { sqrt: 10, times: 2 }, B: 90 });
  await page.click('[data-act="preset"]');
  await page.fill('dialog.ob-dialog input', 'My kite');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('#fg-preset option')].some(o => o.textContent === 'My kite'));
  const saved = F.listPresets(boss, 'kite').find(p => p.name === 'My kite');
  assert.deepEqual(saved.draw, { pts: [[5, 1], [7, 3], [5, 9], [3, 3]], n: 10, o: [0, 0] });
  assert.equal(saved.data._draw, undefined);
  await page.click('[data-act="mode"][data-mode="type"]');
  await page.selectOption('#fg-preset', 'x0');
  await page.waitForFunction(() => document.getElementById('fg-draw').hidden);
  const id = await page.$eval('#fg-preset', s => [...s.options].find(o => o.textContent === 'My kite').value);
  await page.selectOption('#fg-preset', id);
  await page.waitForSelector('#fg-draw:not([hidden])');
  assert.match(await page.textContent('#fg-dm'), /A\(3, 3\)/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the coordinate grid kind draws a polygon of up to 10 corners', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/grid');
  await page.waitForSelector('#fg-figure svg');
  await page.click('[data-act="mode"][data-mode="draw"]');
  for (const [x, y] of [[-3, -2], [2, -3], [4, 1], [0, 4], [-4, 2]]) await tap(page, x, y);
  await page.waitForFunction(() => /Filled in/.test(document.getElementById('fg-dmsg').textContent));
  const d = await data(page);
  assert.deepEqual(d.shapes, [{ points: [[-3, -2], [2, -3], [4, 1], [0, 4], [-4, 2]], names: ['A', 'B', 'C', 'D', 'E'] }]);
  assert.deepEqual([d.x, d.y], [[-5, 5], [-5, 5]]);
  assert.match(await page.textContent('#fg-dm'), /Polygon with 5 sides/);
  assert.equal(await page.isHidden('#fg-dgrid'), true, 'no second grid for the grid itself');
  assert.deepEqual(errors, []);
  await ctx.close();
});
