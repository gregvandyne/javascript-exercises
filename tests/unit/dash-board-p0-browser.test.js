// Class Board parity, P0, in a real browser (docs/decisions.md "Class Board: PDF, link tile and stickers"): the PDF widget
// pages through an uploaded PDF, the link tile opens a new tab, and stickers: the panel's search (the owner's six
// queries, the empty state, recents and favorites), the owner's save test (place three different stickers, resize one,
// move one, reload: all three back in place at the right sizes) with a mouse, and on a phone by touch (tap to place,
// drag, the corner, a toolbar of only Duplicate and Delete, the one moved last on top).
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashp0b-`);

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const { createApp } = await import('../../server/app.js');
const { tFor } = await import('../../server/i18n/index.js');

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

const boss = createUser({ username: 'P0BrowserBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'P0 Browser School' }).school;
const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
const C = S.createClass(T, school.id, { name: 'Grade 4' }).class;
D.ensureLayouts(T, C, tFor('en'));
const first = D.layoutsOf(C.id, T.id)[0];
D.useLayout(T, C, first.id);
const stickersOf = () => D.getLayout(first.id).widgets.filter(x => x.type === 'stickers');
const setWidgets = widgets => D.updateLayout(T, C, first.id, { widgets });

let env = null;
async function setup() {
  if (env) return env;
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  // desk: a laptop with a mouse; phone: a phone with touch (390 x 844).
  const open = async (kind = 'desk') => {
    const ctx = await browser.newContext({ ...(kind === 'phone' ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } }), reducedMotion: 'reduce' });
    const [cn, cv] = cookieFor(T.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('.dash-w');
    return { page, ctx, errors };
  };
  env = { browser, open, base, done: async () => { await browser.close(); server.close(); } };
  return env;
}
test.after(async () => { if (env) await env.done(); });
const until = async (f, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await f()) return true; await new Promise(r => setTimeout(r, 100)); } return f(); };
/** A three-page lesson plan, printed by the browser itself. */
async function samplePdf(browser) {
  const p = await browser.newPage();
  const pg = (n, title) => `<section style="page-break-after:always;font-family:sans-serif;padding:40px"><h1>${title}</h1><p style="font-size:64px">Page ${n}</p></section>`;
  await p.setContent(`<body style="margin:0">${pg(1, 'Fractions')}${pg(2, 'Comparing fractions')}${pg(3, 'Exit ticket')}</body>`);
  const buf = await p.pdf({ format: 'Letter' }); await p.close();
  return buf;
}

test('PDF widget: an uploaded PDF pages through on the board, fitted to the widget', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  const { id } = D.savePdf(T, C, await samplePdf(E.browser));
  setWidgets([{ id: 'pdf1', type: 'pdf', x: 0, y: 0, w: 6, h: 6, s: { doc: id, title: 'Lesson plan' } }]);
  const { page, ctx, errors } = await E.open('desk');
  const w = page.locator('[data-id="pdf1"]');
  await w.locator('.dw-pdfcanvas[data-page="1"]').waitFor({ timeout: 20e3 });
  assert.equal(await w.locator('.dw-pdfpage').textContent(), 'Page 1 of 3');
  assert.equal(await w.locator('.dw-pdfprev').isDisabled(), true);
  await w.locator('.dw-pdfnext').click();
  await w.locator('.dw-pdfcanvas[data-page="2"]').waitFor({ timeout: 20e3 });
  assert.equal(await w.locator('.dw-pdfpage').textContent(), 'Page 2 of 3');
  // Fitted: the whole page shows inside the widget.
  const [area, canvas] = [await w.locator('.dw-pdfarea').boundingBox(), await w.locator('.dw-pdfcanvas').boundingBox()];
  assert.ok(canvas.width <= area.width && canvas.height <= area.height, JSON.stringify({ area, canvas }));
  assert.ok(canvas.height >= area.height - 12 || canvas.width >= area.width - 12, 'as big as fits');
  await w.locator('.dw-pdfnext').click(); await w.locator('.dw-pdfcanvas[data-page="3"]').waitFor();
  assert.equal(await w.locator('.dw-pdfnext').isDisabled(), true);
  // The keyboard pages too.
  await w.locator('.dw-pdfarea').focus(); await page.keyboard.press('ArrowLeft');
  await w.locator('.dw-pdfcanvas[data-page="2"]').waitFor();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('link tile: opens its address in a new tab, with noopener noreferrer', { skip, timeout: 60e3 }, async () => {
  const E = await setup();
  setWidgets([{ id: 'lk1', type: 'link', x: 0, y: 0, w: 3, h: 2, s: { title: 'Class library', url: `${E.base}/robots.txt` } }]);
  const { page, ctx, errors } = await E.open('desk');
  const a = page.locator('[data-id="lk1"] .dw-linktile');
  assert.equal(await a.getAttribute('target'), '_blank'); assert.equal(await a.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(await a.locator('.dw-linktitle').textContent(), 'Class library');
  const [tab] = await Promise.all([ctx.waitForEvent('page'), a.click()]);
  await tab.waitForLoadState();
  assert.equal(tab.url(), `${E.base}/robots.txt`);
  assert.equal(await tab.evaluate(() => window.opener), null, 'the new tab cannot reach the board');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sticker panel: "Search stickers", live counts for the owner\'s six queries, filters, the empty state, recents and favorites', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  setWidgets([{ id: 'cl', type: 'clock', x: 0, y: 0, w: 3, h: 2, s: {} }]);
  const { page, ctx, errors } = await E.open('desk');
  await page.evaluate(() => localStorage.clear());
  await page.click('#dash-stickers-btn');
  const q = page.locator('#dash-stkq');
  assert.equal(await q.getAttribute('placeholder'), 'Search stickers');
  const count = page.locator('.dash-stkcount');
  await until(async () => (await count.textContent()) === '3,657 stickers');
  const counts = {};
  for (const word of ['good morning', 'buongiorno', 'trophy', 'rocket', 'hello', 'birthday']) {
    await q.fill(word);
    await page.waitForFunction(w => document.querySelector('.dash-stkcount').dataset.q === w, word);
    counts[word] = await count.textContent();
  }
  console.log('# panel counts', JSON.stringify(counts));
  assert.deepEqual(counts, { 'good morning': '225 stickers', buongiorno: '24 stickers', trophy: '2 stickers', rocket: '3 stickers', hello: '228 stickers', birthday: '217 stickers' });
  // A page at a time: 60 tiles, then more.
  await q.fill('good morning'); await until(async () => (await count.textContent()) === '225 stickers');
  assert.equal(await page.locator('.dash-stkresults .dash-stkitem').count(), 60);
  // Filters combine with the text.
  await page.selectOption('#dash-stk-lang', 'Italian'); await page.selectOption('#dash-stk-shape', 'bubble');
  await until(async () => (await count.textContent()) === '8 stickers');
  // Empty: says so, and Clear search brings everything back.
  await page.selectOption('#dash-stk-lang', ''); await page.selectOption('#dash-stk-shape', '');
  await q.fill('xylophonezz');
  await page.locator('.dash-stkempty').waitFor();
  assert.equal(await page.locator('.dash-stkempty p').textContent(), 'No stickers found for "xylophonezz"');
  await page.click('.dash-stkclear');
  await until(async () => (await count.textContent()) === '3,657 stickers');
  assert.equal(await q.inputValue(), '');
  // Recents (the last 12 used, at the top when the search is empty) and Favorites (starred).
  await q.fill('trophy'); await until(async () => (await count.textContent()) === '2 stickers');
  await page.locator('.dash-stkresults .dash-stkitem').first().click();
  await page.locator('.dash-stkresults .dash-stkstar').nth(1).click();
  await q.fill(''); await q.dispatchEvent('input');
  await page.locator('.dash-stksec').first().waitFor();
  const secs = await page.locator('.dash-stksech').allTextContents();
  assert.deepEqual(secs.slice(0, 3), ['Favorites', 'Recent', 'All stickers']);
  assert.equal(await page.locator('.dash-stksec').nth(0).locator('.dash-stkitem').count(), 1);
  assert.equal(await page.locator('.dash-stksec').nth(1).locator('.dash-stkitem').count(), 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** A sticker's place on screen: its centre and its box (unturned). */
const boxOf = (page, sid) => page.evaluate(id => { const n = document.querySelector(`.dash-stk[data-sid="${id}"]`); if (!n) return null; return { cx: n.offsetLeft + n.offsetWidth / 2, cy: n.offsetTop + n.offsetHeight / 2, w: n.offsetWidth, h: n.offsetHeight, r: n.style.transform }; }, sid);

test('the owner\'s save test, with a mouse: place three different stickers, resize one, move one, reload: all three are back in place at the right sizes', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  setWidgets([{ id: 'cl', type: 'clock', x: 0, y: 0, w: 3, h: 2, s: {} }, { id: 'tx', type: 'text', x: 3, y: 0, w: 6, h: 4, s: { title: 'Today' } }]);
  const { page, ctx, errors } = await E.open('desk');
  await page.click('#dash-stickers-btn');
  const q = page.locator('#dash-stkq');
  const find = async word => { await q.fill(word); await page.waitForFunction(w => document.querySelector('.dash-stkcount').dataset.q === w, word); return page.locator('.dash-stkresults .dash-stkitem').first(); };
  const place = async word => (await find(word)).click();
  // The first by a click (it goes in the middle of the board); the next two dragged out of the panel to a spot.
  const dragOut = async (word, x, y) => {
    const tile = await (await find(word)).boundingBox();
    await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2); await page.mouse.down();
    await page.mouse.move(x, y, { steps: 12 }); await page.mouse.up();
  };
  const grid = await page.locator('#dash-grid').boundingBox();
  await place('trophy');
  await dragOut('rocket', grid.x + 140, grid.y + 420);
  await dragOut('buongiorno', grid.x + grid.width - 160, grid.y + 120);
  await until(() => stickersOf().length === 3);
  const ids = stickersOf().map(x => x.id), keys = stickersOf().map(x => x.s.k);
  assert.equal(new Set(keys).size, 3, 'three different stickers');
  // Placing the same sticker twice makes two copies (then one is deleted again with its own Delete).
  await place('rocket');
  await until(() => stickersOf().length === 4);
  const extra = stickersOf()[3].id;
  assert.equal(stickersOf()[3].s.k, keys[1]);
  await page.locator(`.dash-stk[data-sid="${extra}"]`).click();
  await page.locator('.dash-stkbar .dash-stk-del').click();
  await until(() => stickersOf().length === 3);
  await page.click('.dash-stkclose');
  // Resize the first by its corner (mouse), proportions kept.
  await page.locator(`.dash-stk[data-sid="${ids[0]}"]`).click();
  const before = await boxOf(page, ids[0]);
  const h = await page.locator(`.dash-stk[data-sid="${ids[0]}"] .dash-stkresize`).boundingBox();
  await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2); await page.mouse.down();
  await page.mouse.move(h.x + 60, h.y + 60, { steps: 8 }); await page.mouse.up();
  const byId = id => stickersOf().find(x => x.id === id);
  await until(() => byId(ids[0]).s.size > 200);
  const grown = await boxOf(page, ids[0]);
  assert.ok(grown.w > before.w + 40, JSON.stringify({ before, grown }));
  assert.ok(Math.abs(grown.w / grown.h - before.w / before.h) < 0.02, 'proportions kept');
  // Move the second by dragging it (mouse).
  const was2 = { ...byId(ids[1]).s };
  const s2 = await page.locator(`.dash-stk[data-sid="${ids[1]}"]`).boundingBox();
  await page.mouse.move(s2.x + s2.width / 2, s2.y + s2.height / 2); await page.mouse.down();
  await page.mouse.move(s2.x + s2.width / 2 + 220, s2.y + s2.height / 2 + 90, { steps: 10 }); await page.mouse.up();
  await until(() => byId(ids[1]).s.x !== was2.x && byId(ids[1]).s.y !== was2.y);
  assert.equal(byId(ids[1]).s.size, was2.size, 'moving never resizes');
  await page.waitForTimeout(900);   // the layout saves 0.7 s after a change
  const saved = stickersOf();
  const shown = await Promise.all(ids.map(id => boxOf(page, id)));
  assert.ok(saved.find(x => x.id === ids[0]).s.size > 200, 'the resized one saved its size');
  // The toolbar has only Duplicate and Delete (owner, 21 Nov 2026). Turn the third 15 degrees from the keyboard.
  await page.locator(`.dash-stk[data-sid="${ids[2]}"]`).click();
  assert.deepEqual(await page.$$eval('.dash-stkbar button', bs => bs.map(b => b.className.match(/dash-stk-(\w+)/)[1])), ['dup', 'del']);
  await page.keyboard.press('r');
  await until(() => { const x = stickersOf().find(y => y.id === ids[2]); return x && x.s.r === 15; });
  // The one last moved sits on top of the others.
  assert.equal(stickersOf().at(-1).id, ids[1], "the sticker moved last is on top");
  await page.waitForTimeout(900);
  const final = stickersOf();
  // Reload: all three are back, each where and as big as it was.
  await page.reload(); await page.waitForSelector('.dash-stk');
  await until(async () => (await page.locator('.dash-stk').count()) === 3);
  for (const [i, id] of ids.entries()) {
    const after = await boxOf(page, id);
    assert.ok(after, id);
    assert.ok(Math.abs(after.cx - shown[i].cx) < 2 && Math.abs(after.cy - shown[i].cy) < 2, `${id} in place: ${JSON.stringify({ was: shown[i], now: after })}`);
    assert.ok(Math.abs(after.w - shown[i].w) < 1 && Math.abs(after.h - shown[i].h) < 1, `${id} same size`);
    assert.deepEqual(final.find(x => x.id === id).s.k, keys[i]);
  }
  assert.equal(await page.locator(`.dash-stkfront .dash-stk[data-sid="${ids[2]}"]`).count(), 1, 'on top of the widgets after a reload');
  assert.match((await boxOf(page, ids[2])).r, /rotate\(15deg\)/);
  console.log('# saved stickers', JSON.stringify(final.map(x => ({ k: x.s.k, x: x.s.x, y: x.s.y, size: x.s.size, r: x.s.r, back: x.s.back }))));
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** A one-finger drag on a touch screen (Chrome's own touch events, so the page gets touch pointers). */
async function touchDrag(page, from, to, steps = 8) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from.x, y: from.y }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from.x + (to.x - from.x) * i / steps, y: from.y + (to.y - from.y) * i / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const mid = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

test('stickers on a phone, by touch: tap to place, drag to move, the corner to resize, a toolbar of only Duplicate and Delete; kept after a reload', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  setWidgets([{ id: 'cl', type: 'clock', x: 0, y: 0, w: 3, h: 2, s: {} }, { id: 'tx', type: 'text', x: 3, y: 0, w: 6, h: 4, s: { title: 'Today' } }]);
  const { page, ctx, errors } = await E.open('phone');
  await page.locator('#dash-stickers-btn').tap();
  await page.locator('#dash-stkq').fill('rocket'); await page.waitForTimeout(200);
  await page.locator('.dash-stkresults .dash-stkitem').first().tap();
  await until(() => stickersOf().length === 1);
  // On a phone the sheet steps aside after a tap, so the new sticker shows.
  await page.locator('.dash-stkpanel').waitFor({ state: 'hidden' });
  await page.waitForTimeout(200);   // the board takes back the room the sheet had, and the stickers are drawn again
  const id = stickersOf()[0].id, sel = `.dash-stk[data-sid="${id}"]`;
  await page.locator(sel).scrollIntoViewIfNeeded();
  const start = await boxOf(page, id);
  // Drag it by touch.
  const b = await page.locator(sel).boundingBox();
  await touchDrag(page, mid(b), { x: mid(b).x - 60, y: mid(b).y + 80 });
  await until(async () => { const now = await boxOf(page, id); return Math.abs(now.cx - start.cx + 60) < 3 && Math.abs(now.cy - start.cy - 80) < 3; });
  // The corner handle by touch, proportions kept.
  await page.locator(sel).tap();
  const w0 = (await boxOf(page, id)).w;
  const hb = await page.locator(`${sel} .dash-stkresize`).boundingBox();
  await touchDrag(page, mid(hb), { x: mid(hb).x + 40, y: mid(hb).y + 40 });
  await until(async () => (await boxOf(page, id)).w > w0 + 20);
  // Duplicate: resizing the copy (by its corner, by touch) never resizes the first.
  await page.locator(sel).tap();
  assert.equal(await page.locator('.dash-stkbar button').count(), 2, 'Duplicate and Delete only');
  if (process.env.DASH_SHOTS) await page.screenshot({ path: `${process.env.DASH_SHOTS}/phone-sticker-toolbar.png` });
  await page.waitForTimeout(900);   // the layout saves 0.7 s after a change
  const firstSize = stickersOf()[0].s.size;
  await page.locator('.dash-stkbar .dash-stk-dup').tap();
  await until(() => stickersOf().length === 2);
  const copy = stickersOf()[1].id, csel = `.dash-stk[data-sid="${copy}"]`;
  const ch = await page.locator(`${csel} .dash-stkresize`).boundingBox();
  await touchDrag(page, mid(ch), { x: mid(ch).x - 30, y: mid(ch).y - 30 });
  await until(() => stickersOf().find(x => x.id === copy).s.size < firstSize);
  assert.equal(stickersOf().find(x => x.id !== copy).s.size, firstSize);
  await page.locator(csel).tap();
  // Delete the copy from its own toolbar; the rest of the board stays.
  await page.locator('.dash-stkbar .dash-stk-del').tap();
  await until(() => stickersOf().length === 1);
  assert.ok(!stickersOf().some(x => x.id === copy));
  assert.equal(D.getLayout(first.id).widgets.filter(x => x.type !== 'stickers').length, 2);
  await page.waitForTimeout(900);
  const was = await boxOf(page, id);
  await page.reload(); await page.waitForSelector(sel);
  const now = await boxOf(page, id);
  assert.ok(Math.abs(now.cx - was.cx) < 2 && Math.abs(now.cy - was.cy) < 2 && Math.abs(now.w - was.w) < 1, JSON.stringify({ was, now }));
  assert.deepEqual(errors, []);
  await ctx.close();
});
