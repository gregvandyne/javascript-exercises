// Editing the teacher's area on Homeroom's board in a real browser (public/js/homeroom-board.js; docs/decisions.md
// "Homeroom: one way to edit the board"): one model for every object. Text is a box typed in place: written, let go,
// tapped to select, tapped again to type (the caret where it was tapped), saved. A sticky note resizes in width and
// height. An oval is selected by its outline, resized and deleted; a pen line is selected near the line and deleted
// with the Delete key. The ⋯ menu opens fully inside the screen on a phone, a narrow laptop window (the top bar wraps),
// a Chromebook and a live laptop. Chromium, and WebKit too when Playwright's WebKit is installed. Skipped with neither.
// HRFIX_SHOTS=<dir> also saves screenshots there.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launchChromium() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.HRFIX_SHOTS || '';
const browsers = [];   // [{ name, browser }]
let skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HrEdBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Edit Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Reed', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '4B Math', teacherId: teacher.id }).class;
for (const n of ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay']) { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); }
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browsers.push({ name: 'chromium', browser: await launchChromium() }); } catch { /* none */ }
  try { browsers.push({ name: 'webkit', browser: await pw.webkit.launch() }); } catch { /* WebKit not installed here */ }
  if (!browsers.length) { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { for (const b of browsers) await b.browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const reset = () => H.saveArea(teacher, cls, { __ann: { notes: [], texts: [], strokes: [] }, shapes: [] });
const area = () => H.roomOf(cls.id).area;
async function open(browser, viewport = { width: 1366, height: 768 }, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/class/${cls.id}/homeroom`); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(400);
  const b = await page.locator('.hr-area').boundingBox();
  const at = (fx, fy) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
  return { ctx, page, errors, at, box: b };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hrfix-${name}.png`) }); };
const until = async (fn, what) => { for (let i = 0; i < 40; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };
async function drag(page, from, to, steps = 8) { await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up(); }
const center = async loc => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const empty = at => at(0.95, 0.9);   // a corner of the teacher's area with nothing in it

test('text: write it, let go, tap it, tap again and type where tapped; saved and kept after a reload', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors, at } = await open(browser);
    await page.click('[data-hrmode="text"]');
    const p = at(0.1, 0.5); await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Hello class');
    await shot(page, `${name}-text-editing`);
    await page.keyboard.press('Escape');
    await until(() => (area().__ann.texts || []).length === 1, 'text saved');
    const x0 = area().__ann.texts[0];
    assert.equal(x0.text, 'Hello class', name);
    assert.ok(x0.w > 0 && x0.h > 0, `${name}: a text is a box (width and height)`);
    assert.equal(await page.locator('[data-hrmode="move"][aria-pressed="true"]').count(), 1, `${name}: back on Select after placing it`);
    // let go, then select it with one tap and type with a second one, the caret where it was tapped (before "H")
    const e = empty(at); await page.mouse.click(e.x, e.y);
    assert.equal(await page.locator('#hr-seltools:not([hidden])').count(), 0, `${name}: nothing selected`);
    const tb = await page.locator('.hr-area [data-text]').boundingBox();
    await page.mouse.click(tb.x + 7, tb.y + tb.height / 2);
    assert.equal(await page.locator('#hr-seltools [data-hrsel="edit"]').count(), 1, `${name}: selected, with Edit`);
    assert.equal(await page.locator('.hr-sel .hr-h').count(), 8, `${name}: handles on all corners and edges`);
    await page.mouse.click(tb.x + 2, tb.y + tb.height / 2);
    await page.keyboard.type('Oh, ');
    await page.keyboard.press('Escape');
    await until(() => area().__ann.texts[0].text === 'Oh, Hello class', `${name}: edited text saved (${area().__ann.texts[0].text})`);
    // a double-click on it edits too; the Delete key does nothing while typing
    await page.mouse.click(e.x, e.y);
    await page.mouse.dblclick(tb.x + tb.width - 4, tb.y + tb.height / 2);
    await page.keyboard.press('End'); await page.keyboard.type('!'); await page.keyboard.press('Backspace'); await page.keyboard.type('?');
    await page.keyboard.press('Escape');
    await until(() => area().__ann.texts[0].text === 'Oh, Hello class?', `${name}: double-click edit (${area().__ann.texts[0].text})`);
    await page.reload(); await page.waitForSelector('.hr-desk');
    assert.equal(await page.locator('.hr-area [data-text]', { hasText: 'Oh, Hello class?' }).count(), 1);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

test('sticky note: resized in width and in height from its handles, moved by dragging; saved', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors, at } = await open(browser);
    await page.click('[data-hrmode="note"]');
    const p = at(0.2, 0.2); await page.mouse.click(p.x, p.y);
    await page.keyboard.type('Resize me');
    await page.click('#hr-seltools [data-hrsel="done"]');
    await until(() => (area().__ann.notes || []).length === 1 && area().__ann.notes[0].text === 'Resize me', 'note saved');
    const n0 = area().__ann.notes[0], w0 = n0.w, h0 = n0.h;
    await drag(page, await center(page.locator('.hr-h-e')), { ...(await center(page.locator('.hr-h-e'))), x: (await center(page.locator('.hr-h-e'))).x + 80 });
    await until(() => area().__ann.notes[0].w > w0 + 60, `${name}: wider`);
    const c = await center(page.locator('.hr-h-s'));
    await drag(page, c, { x: c.x, y: c.y + 50 });
    await until(() => area().__ann.notes[0].h > h0 + 40, `${name}: taller`);
    await shot(page, `${name}-sticky-selected`);
    const wide = await page.locator('.hr-area [data-note]').boundingBox();
    assert.ok(wide.width > 200 * 0.3, `${name}: drawn wider`);
    // move it
    const x0 = area().__ann.notes[0].x, m = await center(page.locator('.hr-area [data-note]'));
    await drag(page, m, { x: m.x + 60, y: m.y + 10 });
    await until(() => area().__ann.notes[0].x > x0, `${name}: moved`);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

test('an oval: drawn, then selected by its outline (not a new one), resized and deleted', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors, at } = await open(browser);
    await page.click('[data-hrmode="circle"]');
    await drag(page, at(0.3, 0.2), at(0.5, 0.8));
    await until(() => (area().shapes || []).length === 1, 'oval saved');
    const e = empty(at); await page.mouse.click(e.x, e.y);
    assert.equal(await page.locator('#hr-seltools:not([hidden])').count(), 0);
    // its outline's left end, a few pixels outside the line
    const l = at(0.3, 0.5); await page.mouse.click(l.x - 4, l.y);
    assert.equal(await page.locator('#hr-seltools [data-hrsel="delete"]').count(), 1, `${name}: the oval is selected`);
    assert.equal(await page.locator('#hr-seltools [data-hrselc]').count(), 4, `${name}: its colors`);
    // a press inside it moves it instead of drawing another
    const mid = at(0.4, 0.5); await drag(page, mid, { x: mid.x + 30, y: mid.y });
    await until(() => area().shapes[0].x > 0.3 + 0.005, `${name}: moved`);
    assert.equal(area().shapes.length, 1, `${name}: no new shape`);
    await shot(page, `${name}-oval-selected`);
    const s0 = area().shapes[0], c = await center(page.locator('.hr-h-se'));
    await drag(page, c, { x: c.x + 60, y: c.y - 30 });
    await until(() => area().shapes[0].x2 > s0.x2 + 0.01, `${name}: resized`);
    await page.click('#hr-seltools [data-hrselc="#1F9D63"]');
    await until(() => area().shapes[0].c === '#1F9D63', `${name}: recolored`);
    await page.click('#hr-seltools [data-hrsel="delete"]');
    await until(() => area().shapes.length === 0, `${name}: deleted`);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

test('a pen line: selected by tapping near it, scaled from a corner, deleted with the Delete key; on a tablet too', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors, at } = await open(browser);
    await page.click('[data-hrmode="pen"]');
    await drag(page, at(0.6, 0.3), at(0.8, 0.6), 12);
    await until(() => (area().__ann.strokes || []).length === 1, 'pen line saved');
    await page.click('[data-hrmode="move"]');
    const m = at(0.7, 0.45); await page.mouse.click(m.x + 4, m.y - 3);
    assert.equal(await page.locator('#hr-seltools [data-hrsel="delete"]').count(), 1, `${name}: the line is selected`);
    assert.equal(await page.locator('.hr-sel .hr-h').count(), 4, `${name}: corner handles`);
    const before = JSON.stringify(area().__ann.strokes[0].pts), c = await center(page.locator('.hr-h-se'));
    await drag(page, c, { x: c.x + 40, y: c.y + 20 });
    await until(() => JSON.stringify(area().__ann.strokes[0].pts) !== before, `${name}: scaled`);
    await page.keyboard.press('Delete');
    await until(() => area().__ann.strokes.length === 0, `${name}: deleted`);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
  // a tablet: tap a sticky to select it, tap again to type
  reset();
  const { ctx, page, errors, at } = await open(browsers[0].browser, { width: 1180, height: 820 }, true);
  await page.click('[data-hrmode="note"]');
  const p = at(0.3, 0.3); await page.touchscreen.tap(p.x, p.y);
  await page.keyboard.type('Tablet');
  const e = empty(at); await page.touchscreen.tap(e.x, e.y);
  await until(() => (area().__ann.notes[0] || {}).text === 'Tablet', 'tablet note');
  const n = await center(page.locator('.hr-area [data-note]'));
  await page.touchscreen.tap(n.x, n.y); await page.waitForTimeout(150);
  assert.equal(await page.locator('#hr-seltools [data-hrsel="edit"]').count(), 1, 'tablet: selected');
  await page.touchscreen.tap(n.x, n.y); await page.keyboard.press('End'); await page.keyboard.type(' 2');
  await page.touchscreen.tap(e.x, e.y);
  await until(() => area().__ann.notes[0].text === 'Tablet 2', `tablet: typed (${area().__ann.notes[0].text})`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the ⋯ menu opens fully inside the screen: phone, a narrow window (wrapped top bar), a Chromebook, live on a laptop', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const inside = page => page.evaluate(() => {
    const r = document.querySelector('#hr-menu .rm-menu').getBoundingClientRect();
    return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, ok: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && r.width > 100 };
  });
  for (const { name, browser } of browsers) {
    for (const [vp, live] of [[{ width: 390, height: 844 }, false], [{ width: 900, height: 700 }, false], [{ width: 1366, height: 768 }, false], [{ width: 1366, height: 768 }, true], [{ width: 900, height: 700 }, true]]) {
      const { ctx, page, errors } = await open(browser, vp, vp.width < 500);
      if (live) { await page.click('[data-hr="golive"]'); await page.waitForSelector('#homeroom.hr-islive', { timeout: 8000 }); await page.waitForTimeout(500); }
      await page.click('[data-hr="menu"]');
      await page.waitForSelector('#hr-menu .rm-menu');
      const r = await inside(page);
      assert.ok(r.ok, `${name} ${vp.width}x${vp.height}${live ? ' live' : ''}: the menu is inside the screen ${JSON.stringify(r)}`);
      if (!live && vp.width > 500) await shot(page, `${name}-menu-${vp.width}x${vp.height}`);
      // the sheets it opens are inside the screen too
      await page.click('#hr-menu [data-hr="groups"]'); await page.waitForSelector('.sheet'); await page.waitForTimeout(500);
      const sh = await page.evaluate(() => { const r = document.querySelector('.sheet').getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight + 1; });
      assert.ok(sh, `${name} ${vp.width}: the Groups sheet is inside the screen`);
      await page.keyboard.press('Escape');
      if (live) { H.setLive(teacher, cls, 'end'); }
      assert.deepEqual(errors, [], name);
      await ctx.close();
    }
  }
});

test('the server keeps a sticky note\'s and a text box\'s width and height, within limits', () => {
  const r = H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Hi', x: 0.1, y: 0.1, w: 300, h: 150 }, { id: 'n2', text: '', x: 0.2, y: 0.2, w: 9999, h: 1 }, { id: 'n3', text: 'old', x: 0.3, y: 0.3 }],
    texts: [{ id: 'x1', text: 'Hello', x: 0.5, y: 0.5, w: 400, h: 90 }], strokes: [] }, shapes: [] });
  assert.ok(r.ok);
  const [a, b, c] = area().__ann.notes;
  assert.deepEqual([a.w, a.h], [300, 150]);
  assert.deepEqual([b.w, b.h], [600, 60], 'clamped');
  assert.ok(!('w' in c) && !('h' in c), 'an older note keeps no size');
  assert.deepEqual([area().__ann.texts[0].w, area().__ann.texts[0].h], [400, 90]);
});
