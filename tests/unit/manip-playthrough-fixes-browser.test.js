// Fixes from recording the Manipulatives' "How it works" videos (25 Nov 2026; docs/decisions.md "Manipulatives: fixes
// from the tutorial play-throughs"), in a real browser: the first click after a drag is a real click (a rekenrek
// dragged by its handle, then a bead; tiles box-selected and dragged, then the pill's Delete); Totals: off hides the
// header total of loose pieces; the first quadrant's x axis has its numbers; a work mat added with pieces loose lands
// in view near them, without zooming out; a backdrop dragged in from the palette starts locked; base ten's decimal
// tenth is a square-cornered block (a place value disk's tenth stays round); an object's Copy lands beside it, never on
// it; a cube out of the middle of a stick leaves two sticks; fraction tiles relabel when Labels changes; palette
// buttons say what they do; the wheel never opens under the site's header. Skipped when no Chromium is installed.
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

const boss = createUser({ username: 'PlayBoss', password: 'secret123', role: 'admin' });
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
async function load(page, tool, state, { fit = true } = {}) {
  const code = M.saveBoard(boss, { tool, title: 'Play test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-piece, #mp-content .mp-obj').length > 0);
  await top(page);
  if (fit) { await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150); }
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
}
const top = page => page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return b; };
const mid = b => [b.x + b.width / 2, b.y + b.height / 2];
const piece = id => `#mp-content .mp-piece[data-pid="${id}"]`;
const at = (page, sel) => page.$eval(sel, e => [parseFloat(e.style.left), parseFloat(e.style.top)]);
const zoom = page => page.$eval('#mp-world', e => new DOMMatrix(getComputedStyle(e).transform).a);
async function mdrag(page, [x0, y0], [x1, y1]) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await page.waitForTimeout(12); }
  await page.mouse.up(); await page.waitForTimeout(200);
}
async function mhold(page, [x, y]) { await page.mouse.move(x, y); await page.mouse.down(); await page.waitForTimeout(650); await page.mouse.up(); await page.waitForTimeout(200); }
const P = (id, kind, x, y, w, h, extra = {}) => ({ id, kind, x, y, w, h, rot: 0, filled: true, locked: false, label: '1', value: 1, color: '#E53935', ...extra });

test('the first click after a drag is a real click: a rekenrek bead after a handle drag; the pill\'s Delete after a group drag', { skip }, async () => {
  const { ctx, page, errors } = await open('#rekenreks');
  await page.waitForSelector('#mp-content .mp-bead');
  await top(page);
  const shown = () => page.$eval('#mp-content .mp-obj .mp-otot', e => e.textContent);
  assert.equal(await shown(), 'Showing 0');
  const h = await box(page, '#mp-content .mp-ohead');
  await mdrag(page, [h.x + 60, h.y + h.height / 2], [h.x + 140, h.y + h.height / 2 + 40]);
  await page.locator('#mp-content .mp-bead').nth(4).click(); await page.waitForTimeout(200);
  assert.notEqual(await shown(), 'Showing 0', 'the bead tap after a drag moved beads');

  // Box-select three tiles, drag one (all move), then the pill's Delete deletes them at once.
  await load(page, 'color-tiles', { objects: [], pieces: [P('a', 't0', 1500, 1000, 52, 52), P('b', 't0', 1580, 1000, 52, 52), P('c', 't0', 1660, 1000, 52, 52)] });
  const a = await box(page, piece('a')), c = await box(page, piece('c'));
  await mdrag(page, [a.x - 30, a.y - 30], [c.x + c.width + 30, c.y + c.height + 30]);
  assert.equal(await page.locator('#mp-content .mp-piece.on').count(), 3, 'three selected');
  await mdrag(page, mid(a), [mid(a)[0] + 60, mid(a)[1] + 50]);
  assert.equal(await page.locator('.mp-selpill').count(), 1, 'still selected');
  await page.locator('.mp-selpill [data-seldel]').click(); await page.waitForTimeout(200);
  assert.equal(await page.locator('#mp-content .mp-piece').count(), 0, 'Delete after a drag deleted them');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Totals: off hides the header total of loose pieces; the first quadrant has its x-axis numbers', { skip }, async () => {
  const { ctx, page, errors } = await open('#color-tiles');
  await load(page, 'color-tiles', { objects: [], pieces: [P('a', 't0', 1500, 1000, 52, 52)] });
  assert.equal(await page.locator('#mp-total').isVisible(), true);
  await page.click('[data-view="totals"]'); await page.waitForTimeout(150);
  assert.equal(await page.locator('#mp-total').isVisible(), false, 'Totals: off hides it');
  await page.click('[data-view="totals"]'); await page.waitForTimeout(150);
  assert.equal(await page.locator('#mp-total').isVisible(), true, 'and on shows it again');

  await page.goto(`${BASE}/manipulatives#xy-coordinate-board`); await page.waitForSelector('#mp-content svg.mp-grid');
  await page.selectOption('#mp-settings select[data-set="four"]', ''); await page.waitForTimeout(200);
  const labs = await page.$$eval('#mp-content svg.mp-grid > text', ts => ts.map(t => ({ x: +t.getAttribute('x'), y: +t.getAttribute('y'), s: t.textContent })));
  const xs = labs.filter(l => l.y > 400 && /^\d+$/.test(l.s));
  assert.ok(xs.length >= 10, `x-axis numbers along the bottom: ${JSON.stringify(xs)}`);
  assert.ok(xs.every(l => l.y <= 440), 'inside the grid');
  // The palette's buttons say what they do: a color by its name, an action by itself.
  assert.equal(await page.locator('#mp-palette [aria-label="Red points"]').count(), 1);
  assert.equal(await page.locator('#mp-palette [aria-label="Connect the points"], #mp-palette [aria-label="Lines off"]').count(), 1);
  assert.equal(await page.locator('#mp-palette [aria-label*="Point color"], #mp-palette [aria-label^="Add Connect"], #mp-palette [aria-label^="Add Lines"], #mp-palette [aria-label^="Add Clear"]').count(), 0);
  await page.goto(`${BASE}/manipulatives#fraction-circles`); await page.waitForSelector('#mp-content .mp-empty');
  assert.equal(await page.textContent('#mp-content .mp-empty'), 'Tap a piece in the palette to put it in a circle. Pieces fill a circle from the top, going clockwise.');
  assert.equal(await page.locator('#mp-palette [aria-label="Add 1/2 piece"]').count(), 1, 'a piece is still an add');
  assert.equal(await page.locator('#mp-palette [aria-label="Rings view"]').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a work mat added with pieces loose lands in view near them (no zoom out); one dragged from the palette starts locked', { skip }, async () => {
  const { ctx, page, errors } = await open('#color-tiles');
  await load(page, 'color-tiles', { objects: [], pieces: [P('a', 't0', 1500, 1000, 52, 52), P('b', 't0', 1560, 1000, 52, 52), P('c', 't0', 1620, 1000, 52, 52)] }, { fit: false });
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
  // Zoom out a step so the view has room for a mat beside the tiles.
  await page.$eval('[data-view="out"]', b => b.click()); await page.$eval('[data-view="out"]', b => b.click()); await page.waitForTimeout(150);
  const z0 = await zoom(page);
  await page.locator('#mp-palette [data-pal]', { hasText: 'Add a work mat' }).first().click(); await page.waitForTimeout(250);
  assert.equal(await zoom(page), z0, 'the view did not change');
  const mat = await box(page, '#mp-content .mp-obj.k-mat'), board = await box(page, '#mp-board');
  assert.ok(mat.x >= board.x && mat.y >= board.y && mat.x + mat.width <= board.x + board.width && mat.y + mat.height <= board.y + board.height, 'in view');
  assert.equal(await page.locator('#mp-content .mp-obj.k-mat.locked').count(), 1, 'a tapped mat starts locked');
  // Dragged in from the palette: locked too.
  const src = await box(page, '#mp-palette [data-pal]:has-text("Add a work mat")');
  await mdrag(page, mid(src), [board.x + 200, board.y + board.height - 150]);
  assert.equal(await page.locator('#mp-content .mp-obj.k-mat').count(), 2);
  assert.equal(await page.locator('#mp-content .mp-obj.k-mat.locked').count(), 2, 'a dragged-in mat starts locked');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('base ten\'s decimal tenth is a square-cornered block (a place value disk\'s tenth stays round)', { skip }, async () => {
  const { ctx, page, errors } = await open('#base-ten-blocks');
  await load(page, 'base-ten-blocks', { decimal: true, objects: [], pieces: [P('t', 'tenth', 1500, 1000, 90, 30, { label: '0.1', value: 0.1, color: '#FFA726' })] });
  const radius = sel => page.$eval(sel, e => getComputedStyle(e).borderTopLeftRadius);
  assert.notEqual(await radius(`${piece('t')} .mp-face`), '50%');
  assert.ok(parseFloat(await radius(`${piece('t')} .mp-face`)) < 10, 'square cornered on the board');
  assert.ok(parseFloat(await radius('#mp-palette .mp-pal[aria-label="Add Tenth, 0.1"] .mp-sw')) < 10, 'and in the palette');
  await load(page, 'place-value-disks', { objects: [], pieces: [P('d', 'tenth', 1500, 1000, 50, 50, { label: '0.1', value: 0.1, color: '#FB8C00' })] });
  assert.equal(await radius(`${piece('d')} .mp-face`), '50%', 'a disk is round');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('an object\'s Copy lands beside it, never on it; a cube out of a stick\'s middle leaves two sticks', { skip }, async () => {
  const { ctx, page, errors } = await open('#rekenreks');
  await load(page, 'rekenreks', { objects: [{ id: 'R', k: 'rekenreks', x: 1500, y: 1000, s: 1, st: { rows: 2, counts: Array(10).fill(0), covered: false, long: false } }], pieces: [] });
  const r0 = await box(page, '#mp-content .mp-obj[data-oid="R"]');
  await mhold(page, [r0.x + 80, r0.y + 14]);
  await page.locator('.mp-wheel [data-wk="copy"]').click(); await page.waitForTimeout(300);
  const objs = await page.$$eval('#mp-content .mp-obj', els => els.map(e => ({ id: e.dataset.oid, x: parseFloat(e.style.left), y: parseFloat(e.style.top), w: e.offsetWidth, h: e.offsetHeight })));
  assert.equal(objs.length, 2);
  const [o, c] = [objs.find(x => x.id === 'R'), objs.find(x => x.id !== 'R')];
  assert.ok(c.x >= o.x + o.w || c.y >= o.y + o.h || c.x + c.w <= o.x || c.y + c.h <= o.y, `the copy is beside the original: ${JSON.stringify(objs)}`);
  const cb = await box(page, `#mp-content .mp-obj[data-oid="${c.id}"]`), board = await box(page, '#mp-board');
  assert.ok(cb.x + cb.width <= board.x + board.width + 1 && cb.y + cb.height <= board.y + board.height + 1 && cb.x >= board.x - 1, 'and on screen');

  // Five linked cubes; hold the middle one (it lifts out): the two ends are two sticks now.
  const cube = (i, x) => P(`k${i}`, 'c0', x, 1000, 40, 40, { g: 'g1' });
  await load(page, 'linking-cubes', { objects: [], pieces: [0, 1, 2, 3, 4].map(i => cube(i, 1500 + i * 40)) });
  await mhold(page, mid(await box(page, piece('k2'))));
  await page.keyboard.press('Escape'); await page.waitForTimeout(150);
  const before = { k1: await at(page, piece('k1')), k3: await at(page, piece('k3')) };
  const k0 = await box(page, piece('k0'));
  await mdrag(page, mid(k0), [mid(k0)[0], mid(k0)[1] + 120]);
  assert.notDeepEqual(await at(page, piece('k1')), before.k1, 'its stick mate moved with it');
  assert.deepEqual(await at(page, piece('k3')), before.k3, 'the other stick stayed');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('fraction tiles relabel when Labels changes; the wheel never opens under the site\'s header', { skip }, async () => {
  const { ctx, page, errors } = await open('#fraction-tiles');
  await load(page, 'fraction-tiles', { mode: 'frac', objects: [], pieces: [P('h', 'f2', 1500, 1000, 132, 40, { label: '1/2', value: 0.5 })] });
  const lab = () => page.textContent(`${piece('h')} .mp-lab`);
  assert.equal(await lab(), '1/2');
  await page.selectOption('#mp-settings select[data-set="mode"]', 'pct'); await page.waitForTimeout(200);
  assert.equal(await lab(), '50%');
  await page.selectOption('#mp-settings select[data-set="mode"]', 'dec'); await page.waitForTimeout(200);
  assert.equal(await lab(), '0.5');

  // A tile at the board's very top, the page scrolled so the board starts right under the sticky header.
  const bar = await box(page, '.topbar');
  await page.evaluate(h => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - h, behavior: 'instant' }); }, bar.height);
  // The wheel pans the board: the tile goes up to just under the board's top edge.
  const b = await box(page, '#mp-board');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  for (let i = 0; i < 6; i++) { const t = await box(page, piece('h')), d = t.y - (b.y + 4); if (Math.abs(d) < 6) break; await page.mouse.wheel(0, d); await page.waitForTimeout(150); }
  const t2 = await box(page, piece('h'));
  await mhold(page, [t2.x + 20, t2.y + 8]);
  assert.equal(await page.locator('.mp-wheel').count(), 1, 'the wheel opened');
  const btns = await page.$$eval('.mp-wheel .mp-wbtn', els => els.map(e => e.getBoundingClientRect().toJSON()));
  const barNow = await box(page, '.topbar');
  assert.ok(btns.every(r => r.top >= barNow.y + barNow.height - 1 && r.bottom <= 860 && r.left >= 0 && r.right <= 1280), `under the header: ${JSON.stringify(btns.map(r => Math.round(r.top)))} header ${barNow.y + barNow.height}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
