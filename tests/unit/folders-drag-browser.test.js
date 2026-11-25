// Dragging games in a folder, in a real browser (docs/decisions.md "Folders: one drag for games"). Greg's two reports:
// 1. "Games sometimes all disappear while dragging": the shelf's game rows carried data-live as a flag, and app.js's
//    live player counts (every 30 s, any [data-live]) wrote "0 playing" into each row and hid it. The rows must survive
//    that refresh, and a failed save must leave the list whole, in the order the server has, without a reload.
// 2. "The drag feels different with one game versus several": both now lift the row the same way (faded in place), show
//    the same small picture of the game under the pointer, and light up a folder the same way. With several games the
//    faded row also moves to where it will land. Alt and the arrow keys and a long press on a phone still work.
// FOLDERS_SHOTS=<dir> also saves pictures of a drag in progress. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/game-folders.js');
const games = await import('../../server/services/games.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FOLDERS_SHOTS || '';

seed({ quiet: true });
const boss = auth.createUser({ username: 'DragBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Testy University' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Head', role: 'admin' }).user;
const greg = S.createSchoolAccount(head, school.id, { rosterName: 'Greg Teacher', role: 'teacher' }).user;
const cls = S.createClass(greg, school.id, { name: '4b math' }).class;
const pick = q.all("SELECT slug FROM games WHERE source='seed' AND status='published' AND visibility='public' AND course_only=0 ORDER BY slug").map(r => r.slug)
  .filter(s => !/-live$|algebra-builder/.test(s));
const G = pick.slice(0, 6).map(s => games.getGameBySlug(s));
const fun = F.createFolder(greg, 'Fun Games').folder; for (const g of G.slice(0, 3)) F.addGame(greg, fun.id, g.id);
F.shareFolder(greg, fun.id, school.id);
const test5 = F.createFolder(greg, 'Test').folder; for (const g of G.slice(0, 5)) F.addGame(greg, test5.id, g.id);
const solo = F.createFolder(greg, 'Solo').folder; F.addGame(greg, solo.id, G[5].id);
const idsIn = f => F.gamesIn(greg, f.id).map(g => g.id);

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
const cookieOf = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function open(path, { clock = false, ...ctxOpts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts });
  const [name, value] = cookieOf(greg.id).split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  if (clock) await page.clock.install();
  await page.goto(BASE + path);
  // The list in view, so a drag starts on the screen (the class page opens with its overview above the sidebar).
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#shelf-main').getBoundingClientRect().top + scrollY - 80));
  return { ctx, page, errors };
}
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);
const rowSel = i => `#shelf-main .shelf-games > .shelf-game:nth-child(${i})`;
const folderSel = f => `.shelf-side .shelf-item[data-shelf-key="f-${f.id}"]`;
/** The rows the teacher can see in the folder: their ids, each with a size on screen, a title and not hidden. */
const shown = page => page.$$eval('#shelf-main .shelf-games > .shelf-game', els => els.filter(li => {
  const r = li.getBoundingClientRect();
  return !li.hidden && r.width > 0 && r.height > 0 && li.querySelector('h3 a');
}).map(li => li.dataset.id));
const center = async (page, sel) => { const b = await page.locator(sel).boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
/** Press on the game's cover and move a little: the drag has started. */
async function lift(page, i) {
  const a = await center(page, `${rowSel(i)} .mg-cover`);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(a.x + 12, a.y + 10, { steps: 4 });
  return a;
}

test('bug 1: the 30 s live count refresh leaves the games in a folder alone; dragging still works after it', { skip }, async () => {
  const { ctx, page, errors } = await open(`/class/${cls.id}?folder=${fun.id}`, { clock: true });
  assert.match(await page.textContent('#shelf-main .shelf-head'), /3 lessons · Shared with Testy University/);
  assert.deepEqual(await shown(page), idsIn(fun));
  const asked = page.waitForRequest(r => r.url().includes('/api/live?'), { timeout: 5000 }).catch(() => null);
  await page.clock.runFor(31000);
  await asked; await page.waitForTimeout(300);
  assert.deepEqual(await shown(page), idsIn(fun), 'all three games still show after the live counts refresh');
  // Start a drag, let the next refresh land in the middle of it, then drop the first game last.
  const before = idsIn(fun);
  await lift(page, 1);
  await page.clock.runFor(30000); await page.waitForTimeout(300);
  const end = await center(page, `${rowSel(3)} .mg-cover`);
  await page.mouse.move(end.x, end.y + 30, { steps: 10 });
  await page.mouse.up();
  await page.waitForFunction(() => !document.body.classList.contains('is-sorting'));
  await page.waitForTimeout(300);
  assert.deepEqual(idsIn(fun), [before[1], before[2], before[0]], 'the new order is saved');
  assert.deepEqual(await shown(page), idsIn(fun), 'and shows, every game');
  assert.match(await page.textContent('#shelf-main .shelf-head'), /3 lessons/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a failed save keeps the list whole, in the order the server has, without a reload', { skip }, async () => {
  const { ctx, page, errors } = await open(`/build?folder=${test5.id}`);
  await page.evaluate(() => { window.__stay = 1; });
  const saved = idsIn(test5);
  let calls = 0;
  await page.route('**/order', async r => { calls++; await new Promise(x => setTimeout(x, 300)); r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Something went wrong"}' }); });
  // Two drags, the second while the first save is still pending.
  for (const [from, to] of [[1, 4], [5, 2]]) {
    await lift(page, from);
    const b = await center(page, `${rowSel(to)} .mg-cover`);
    await page.mouse.move(b.x, b.y + (to > from ? 20 : -20), { steps: 10 });
    await page.mouse.up();
  }
  await page.waitForFunction(() => document.querySelector('#toasts')?.textContent.includes('Something went wrong'));
  await page.waitForTimeout(1800);
  assert.ok(calls >= 1);
  assert.equal(await page.evaluate(() => window.__stay), 1, 'no page load');
  assert.deepEqual(idsIn(test5), saved, 'nothing changed on the server');
  assert.deepEqual(await shown(page), saved, 'every game shows, in the saved order');
  assert.equal(await page.locator('.drop-ghost, .is-lifted, .is-dragging').count(), 0);
  // It still works once the server answers again.
  await page.unroute('**/order');
  await lift(page, 1);
  const b = await center(page, `${rowSel(2)} .mg-cover`);
  await page.mouse.move(b.x, b.y + 20, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(400);
  assert.deepEqual(idsIn(test5), [saved[1], saved[0], ...saved.slice(2)]);
  assert.deepEqual(await shown(page), idsIn(test5));
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** What a drag looks like, mid-way: the ghost, the dragged row, the cursor, and a folder under the pointer. */
async function dragLook(page, f, other, name) {
  await lift(page, 1);
  const row = rowSel(1).replace(':nth-child(1)', '.is-lifted');
  const look = await page.evaluate(sel => {
    const g = document.querySelector('.drop-ghost'), li = document.querySelector(sel);
    const css = (el, keys) => el ? Object.fromEntries(keys.map(k => [k, getComputedStyle(el)[k]])) : null;
    return {
      ghosts: document.querySelectorAll('.drop-ghost').length,
      ghost: css(g, ['borderRadius', 'boxShadow', 'backgroundColor', 'maxWidth', 'font', 'pointerEvents']),
      ghostParts: g ? [...g.children].map(c => c.className || c.tagName) : null,
      row: css(li, ['opacity', 'transform', 'outlineStyle', 'boxShadow', 'pointerEvents', 'position']),
      rowClass: li ? [...li.classList].filter(c => /is-/.test(c)).sort() : null,
      moved: document.querySelectorAll('.shelf-games > .shelf-game[style*="transform"]').length,
      cursor: getComputedStyle(document.body).cursor,
    };
  }, row);
  await shot(page, `${name}-lifted`);
  const p = await center(page, folderSel(other));
  await page.mouse.move(p.x, p.y, { steps: 10 });
  await page.waitForTimeout(300);   // the folder's highlight eases in
  look.folder = await page.$eval(folderSel(other), el => ({ on: el.classList.contains('is-drop'), bg: getComputedStyle(el).backgroundColor, sh: getComputedStyle(el).boxShadow }));
  look.overFolder = await page.evaluate(() => ({ ghosts: document.querySelectorAll('.drop-ghost').length, moved: document.querySelectorAll('.shelf-games > .shelf-game[style*="transform"]').length }));
  await shot(page, `${name}-over-folder`);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await page.waitForTimeout(150);
  look.after = await page.evaluate(() => document.querySelectorAll('.drop-ghost, .is-lifted, .is-dragging, .is-drop').length);
  return look;
}

test('bug 2: a drag looks the same with one game and with several', { skip }, async () => {
  const one = await open(`/build?folder=${solo.id}`);
  const a = await dragLook(one.page, solo, fun, 'drag-one-game');
  const many = await open(`/build?folder=${test5.id}`);
  const b = await dragLook(many.page, test5, fun, 'drag-several-games');
  assert.equal(a.ghosts, 1, 'one game: a picture follows the pointer');
  assert.deepEqual(b, a, 'several games: the same picture, the same lifted row, the same cursor and folder highlight');
  assert.equal(b.folder.on, true);
  assert.equal(b.moved, 0, 'the row is not flown around with a transform');
  assert.equal(b.after, 0, 'Escape puts everything back');
  assert.deepEqual(await shown(many.page), idsIn(test5), 'and the order is as it was');
  assert.deepEqual([...one.errors, ...many.errors], []);
  await one.ctx.close(); await many.ctx.close();
});

test('several games: the faded row moves to where it will land; Escape puts it back; Alt and the arrow keys still move a game', { skip }, async () => {
  const { ctx, page, errors } = await open(`/build?folder=${test5.id}`);
  const saved = idsIn(test5);
  await lift(page, 1);
  const b = await center(page, `${rowSel(3)} .mg-cover`);
  await page.mouse.move(b.x, b.y + 20, { steps: 10 });
  assert.equal(await page.$eval(rowSel(3), el => el.classList.contains('is-lifted')), true, 'it shows where it will land');
  await shot(page, 'drag-several-landing');
  await page.keyboard.press('Escape'); await page.mouse.up(); await page.waitForTimeout(300);
  assert.deepEqual(await shown(page), saved, 'Escape: back where it was');
  assert.deepEqual(idsIn(test5), saved, 'nothing saved');
  // Alt + ArrowDown on the first game's grip.
  await page.focus(`${rowSel(1)} [data-grip]`);
  await page.keyboard.press('Alt+ArrowDown');
  await page.waitForTimeout(400);
  assert.deepEqual(idsIn(test5), [saved[1], saved[0], ...saved.slice(2)]);
  assert.equal(await page.evaluate(() => document.activeElement.closest('.shelf-game').dataset.id), saved[0], 'the grip keeps the focus');
  await page.keyboard.press('Alt+ArrowUp'); await page.waitForTimeout(400);
  assert.deepEqual(idsIn(test5), saved);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a phone: press and hold, then drag a game into a new place', { skip }, async () => {
  const { ctx, page, errors } = await open(`/build?folder=${test5.id}`, { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const saved = idsIn(test5);
  const cdp = await ctx.newCDPSession(page);
  const a = await center(page, `${rowSel(1)} .mg-cover`), b = await center(page, `${rowSel(2)} .mg-cover`);
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await touch('touchStart', a.x, a.y);
  await page.waitForTimeout(500);   // the hold
  assert.equal(await page.locator('.drop-ghost').count(), 1, 'the hold lifts it, with the same picture');
  for (let k = 1; k <= 10; k++) await touch('touchMove', a.x, a.y + (b.y - a.y + 30) * k / 10);
  await shot(page, 'drag-phone');
  await touch('touchEnd');
  await page.waitForTimeout(500);
  assert.deepEqual(idsIn(test5), [saved[1], saved[0], ...saved.slice(2)]);
  assert.deepEqual(await shown(page), idsIn(test5));
  // A quick swipe still scrolls and moves nothing.
  await touch('touchStart', a.x, a.y); for (let k = 1; k <= 5; k++) await touch('touchMove', a.x, a.y - k * 20); await touch('touchEnd');
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.drop-ghost').count(), 0);
  assert.deepEqual(idsIn(test5), [saved[1], saved[0], ...saved.slice(2)]);
  assert.deepEqual(errors, []);
  await ctx.close();
});
