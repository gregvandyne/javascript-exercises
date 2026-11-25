// The pen anywhere on Homeroom's board (docs/decisions.md "Homeroom: the pen anywhere on the board";
// public/js/homeroom-ink.js): a line started outside the teacher's area is board ink, saved with the area and drawn
// again after a reload; undo, redo and Clear the pen take it too; a line started in the area is still the area's.
// One finger draws on a phone, two fingers pan and zoom. A student's See the room shows board ink; the projector never
// does. On a phone the pen's style, undo, redo and Clear the pen are their own bar of 44px icons above the zoom pill,
// inside the screen, clear of the zoom pill and Oomba's chat button (320 to 430 wide), and the panel's row on a
// tablet and a laptop. Chromium (an iPhone's size, touch and pixel ratio), and WebKit too when Playwright's WebKit is
// installed. Skipped with neither. HRPEN_SHOTS=<dir> also saves screenshots there.
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
const { cleanInk, INK } = await import('../../public/js/homeroom-ink.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launchChromium() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.HRPEN_SHOTS || '';
const browsers = [];   // [{ name, browser }]
let skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HrPenBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Pen Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Pen', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '3A Pen', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return u; });
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
const until = async (fn, what) => { for (let i = 0; i < 40; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const IPHONE = { viewport: { width: 390, height: 664 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
async function open(browser, opts = {}, who = teacher, url = `/class/${cls.id}/homeroom`) {
  // (isMobile is Chromium's only: WebKit gets the same size and touch without it)
  const o = browser.browserType().name() === 'chromium' ? opts : Object.fromEntries(Object.entries(opts).filter(([k]) => k !== 'isMobile'));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, ...o });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${url}`);
  return { ctx, page, errors };
}
async function board(browser, opts) { const o = await open(browser, opts); await o.page.waitForSelector('.hr-desk'); await o.page.waitForTimeout(500); return o; }
async function drag(page, pts) { await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 3 }); await page.mouse.up(); }
/** A finger (or two) on the screen, through the browser's own touch events (Chromium). */
async function touch(ctx, page, frames) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: frames[0] });
  for (const f of frames.slice(1)) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: f });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const ring = (b, n = 20) => Array.from({ length: n + 1 }, (_, i) => ({ x: b.x + b.width / 2 + Math.cos(i / n * 6.2) * (b.width / 2 + 6), y: b.y + b.height / 2 + Math.sin(i / n * 6.2) * (b.height / 2 + 6) }));
const box = (page, sel) => page.locator(sel).first().boundingBox();
const inkCount = page => page.locator('#hr-ink polyline').count();

test('the server keeps board ink (board pixels, palette colors, at least two points), drops the rest; an older board has none', () => {
  reset();
  assert.equal(area().ink, undefined, 'an older board (no ink) saves as before');
  const r = H.saveArea(teacher, cls, { __ann: { notes: [], texts: [], strokes: [] }, shapes: [], ink: [
    { id: 'k1', c: '#E53935', w: 'L', pts: [{ x: 100, y: 900 }, { x: 180.26, y: 940 }, { x: -50, y: 99999 }] },
    { id: 'k<b>', c: 'red', pts: [{ x: 10, y: 10 }, { x: 20, y: 20 }] },
    { pts: [{ x: 5, y: 5 }] }, { pts: 'nope' }, null,
  ] });
  assert.ok(r.ok);
  const ink = area().ink;
  assert.equal(ink.length, 2, 'a one-point line and junk are dropped');
  assert.deepEqual(ink[0], { id: 'k1', c: '#E53935', w: 'L', pts: [{ x: 100, y: 900 }, { x: 180.3, y: 940 }, { x: 0, y: 6000 }] });
  assert.equal(ink[1].c, '#141414', 'an unknown color is black'); assert.equal(ink[1].id, 'kb');
  const many = Array.from({ length: INK.strokes + 5 }, () => ({ pts: [{ x: 1, y: 1 }, { x: 2, y: 2 }] }));
  assert.equal(cleanInk(many).length, INK.strokes, 'at most INK.strokes lines');
  assert.equal(cleanInk([{ pts: Array.from({ length: INK.points + 50 }, (_, i) => ({ x: i, y: i })) }])[0].pts.length, INK.points);
  reset(); assert.equal(area().ink, undefined, 'cleared');
});

test('the pen draws outside the teacher\'s area: saved, drawn again after a reload, undone, redone, cleared; the area keeps its own lines', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors } = await board(browser);
    await page.click('[data-hrmode="pen"]');
    // around the first desk (outside the teacher's area)
    const d = await box(page, '.hr-desk');
    await drag(page, ring(d));
    await until(() => (area().ink || []).length === 1, `${name}: board ink saved`);
    assert.equal(area().__ann.strokes.length, 0, `${name}: not an area line`);
    const pts = area().ink[0].pts;
    assert.ok(pts.length > 5 && pts.every(p => p.y > 420), `${name}: in board pixels, under the area ${JSON.stringify(pts.slice(0, 2))}`);
    // and one in the teacher's area: the area's own line, as before
    const a = await box(page, '.hr-area');
    await drag(page, [{ x: a.x + a.width * 0.3, y: a.y + a.height * 0.5 }, { x: a.x + a.width * 0.5, y: a.y + a.height * 0.6 }]);
    await until(() => area().__ann.strokes.length === 1, `${name}: area line saved`);
    assert.equal(area().ink.length, 1, name);
    assert.equal(await inkCount(page), 1, `${name}: drawn over the desks`);
    // a tap on a desk with the pen draws nothing and opens nothing
    await page.mouse.click(d.x + d.width / 2, d.y + 8);
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.sheet, #hr-dmenu .rm-menu').count(), 0, `${name}: the desk's menu stays shut`);
    await shot(page, `after-${name}-1366-pen`);
    // a reload draws it again
    await page.reload(); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(400);
    assert.equal(await inkCount(page), 1, `${name}: drawn again after a reload`);
    // undo, redo (the area line, then the board line), then Clear the pen takes both
    await page.click('[data-hrmode="pen"]');
    const d2 = await box(page, '.hr-desk >> nth=3');
    await drag(page, ring(d2, 12));
    await until(() => (area().ink || []).length === 2, `${name}: second board line`);
    await page.click('#hr-tools [data-hr="undo"]');
    await until(() => (area().ink || []).length === 1, `${name}: undone`);
    assert.equal(await inkCount(page), 1, name);
    await page.click('#hr-tools [data-hr="redo"]');
    await until(() => (area().ink || []).length === 2, `${name}: redone`);
    await page.click('[data-hr="clearpen"]');
    await until(() => !area().ink && area().__ann.strokes.length === 0, `${name}: Clear the pen`);
    assert.equal(await inkCount(page), 0, name);
    await page.click('#hr-tools [data-hr="undo"]');
    await until(() => (area().ink || []).length === 2 && area().__ann.strokes.length === 1, `${name}: Clear the pen undone`);
    // Select pans again (a drag on the board moves the view, draws nothing)
    await page.click('[data-hrmode="move"]');
    const before = await page.evaluate(() => document.getElementById('hr-world').style.transform);
    await drag(page, [{ x: 700, y: 700 }, { x: 760, y: 650 }]);
    assert.notEqual(await page.evaluate(() => document.getElementById('hr-world').style.transform), before, `${name}: panned`);
    assert.equal(area().ink.length, 2, name);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

test('a phone: one finger draws anywhere at any zoom, two fingers pan and zoom without drawing', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const chromium = browsers.find(b => b.name === 'chromium'); if (!chromium) return t.skip('needs Chromium');
  reset();
  const { ctx, page, errors } = await board(chromium.browser, IPHONE);
  await page.click('[data-hrmode="pen"]');
  const z0 = await page.locator('#hr-zoom .rm-pct').textContent();
  const d = await box(page, '.hr-desk >> nth=1');
  await touch(ctx, page, ring(d, 14).map(p => [{ x: p.x, y: p.y }]));
  await until(() => (area().ink || []).length === 1, 'a finger drew around a desk');
  // two fingers: a pinch (zoom) and a pan, no line
  await touch(ctx, page, [[{ x: 150, y: 290, id: 1 }, { x: 240, y: 290, id: 2 }], [{ x: 140, y: 300, id: 1 }, { x: 260, y: 300, id: 2 }], [{ x: 120, y: 320, id: 1 }, { x: 290, y: 320, id: 2 }]]);
  await page.waitForTimeout(700);
  assert.notEqual(await page.locator('#hr-zoom .rm-pct').textContent(), z0, 'two fingers zoomed');
  assert.equal((area().ink || []).length, 1, 'and drew nothing');
  assert.equal(await inkCount(page), 1);
  // at the new zoom a finger still draws
  const b = await box(page, '#hr-board');
  await touch(ctx, page, [[{ x: b.x + 100, y: b.y + 40 }], [{ x: b.x + 140, y: b.y + 70 }], [{ x: b.x + 180, y: b.y + 40 }]]);
  await until(() => (area().ink || []).length + area().__ann.strokes.length === 2, 'a second line (the board\'s or the area\'s, wherever the zoom put it)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the pen\'s bar on a phone: 44px icons inside the screen, not on each other, the zoom pill or Oomba\'s button; the panel\'s row on a tablet and a laptop', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  reset();
  H.saveArea(teacher, cls, { __ann: { notes: [], texts: [], strokes: [] }, shapes: [], ink: [{ c: '#E53935', pts: [{ x: 500, y: 700 }, { x: 900, y: 760 }] }] });
  const overlap = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;
  for (const { name, browser } of browsers) {
    for (const w of [320, 375, 390, 430, 820, 1366]) {
      const phone = w < 820, opts = phone ? { ...IPHONE, viewport: { width: w, height: 664 }, screen: { width: w, height: 844 } } : { viewport: { width: w, height: w === 820 ? 1180 : 768 } };
      const { ctx, page, errors } = await board(browser, opts);
      await page.click('[data-hrmode="pen"]'); await page.waitForTimeout(250);
      const sel = phone ? '#hr-penbar' : '#hr-tools .hr-toolrow';
      assert.equal(await page.locator(sel).isVisible(), true, `${name} ${w}: the pen's controls`);
      if (phone) assert.equal(await page.locator('#hr-tools .hr-toolrow').count(), 0, `${name} ${w}: not also in the strip`);
      const r = await page.evaluate(s => {
        const rect = el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; };
        const bar = document.querySelector(s), btns = [...bar.querySelectorAll('button')].map(b => ({ ...rect(b), label: b.getAttribute('aria-label') || b.textContent.trim() }));
        const bub = document.getElementById('oc-bubble');
        return { bar: rect(bar), btns, vw: document.documentElement.clientWidth, vh: innerHeight, zoom: rect(document.getElementById('hr-zoom')), bubble: bub && !bub.hidden && bub.offsetParent ? rect(bub) : null, sx: document.documentElement.scrollWidth };
      }, sel);
      const what = `${name} ${w}`;
      assert.ok(r.btns.length >= (phone ? 4 : 2), `${what}: its buttons ${r.btns.length}`);
      assert.ok(r.sx <= r.vw, `${what}: no sideways scroll`);
      for (const b of r.btns) {
        assert.ok(b.label, `${what}: every button has a name`);
        assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.width <= r.vw && b.y + b.height <= r.vh, `${what}: ${b.label} inside the screen ${JSON.stringify(b)}`);
        if (phone) assert.ok(b.width >= 44 && b.height >= 44, `${what}: ${b.label} is a 44px target ${JSON.stringify(b)}`);
      }
      for (let i = 0; i < r.btns.length; i++) for (let j = i + 1; j < r.btns.length; j++) assert.ok(!overlap(r.btns[i], r.btns[j]), `${what}: ${r.btns[i].label} and ${r.btns[j].label} overlap`);
      if (phone) {
        assert.ok(r.bar.x >= 0 && r.bar.x + r.bar.width <= r.vw, `${what}: the bar is inside the screen ${JSON.stringify(r.bar)}`);
        assert.ok(!overlap(r.bar, r.zoom), `${what}: clear of the zoom pill ${JSON.stringify([r.bar, r.zoom])}`);
        if (r.bubble) assert.ok(!overlap(r.bar, r.bubble), `${what}: clear of Oomba's button ${JSON.stringify([r.bar, r.bubble])}`);
        // its style button opens the sheet; Clear the pen is there
        await page.click('#hr-penbar [data-hrpop]'); await page.waitForSelector('#hr-pop.hr-popsheet');
        await page.click('#hr-pop [data-hrpop="close"]');
        assert.equal(await page.locator('#hr-penbar [data-hr="clearpen"]').count(), 1, what);
        if (w === 390) await shot(page, `after-${name}-390-pen`);
      } else if (w === 1366) await shot(page, `after-${name}-1366-pen-toolbar`);
      // Select: the bar goes
      await page.click('#hr-tools [data-hrmode="move"]');
      if (phone) assert.equal(await page.locator('#hr-penbar').isVisible(), false, `${what}: gone with Select`);
      assert.deepEqual(errors, [], what);
      await ctx.close();
    }
  }
});

test('a student\'s See the room shows the board\'s pen lines; the projector does not', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const chromium = browsers[0];
  reset();
  H.saveArea(teacher, cls, { __ann: { notes: [], texts: [], strokes: [{ c: '#1E88E5', pts: [{ x: 0.1, y: 0.5 }, { x: 0.4, y: 0.5 }] }] }, shapes: [], ink: [{ c: '#E53935', pts: [{ x: 500, y: 700 }, { x: 900, y: 760 }] }] });
  const { ctx, page, errors } = await open(chromium.browser, {}, kids[0], `/class/${cls.id}/desk`);
  await page.waitForSelector('[data-hd="room"]'); await page.click('[data-hd="room"]');
  await page.waitForSelector('.hd-room .hd-rdesk'); await page.waitForTimeout(300);
  assert.equal(await page.locator('.hd-rink polyline').count(), 1, 'See the room draws the board ink');
  await shot(page, `after-${chromium.name}-1366-seetheroom`);
  assert.deepEqual(errors, []);
  await ctx.close();
  const pj = await open(chromium.browser, {}, teacher, `/class/${cls.id}/homeroom/projector`);
  await pj.page.waitForSelector('#hr-projarea .hr-roarea'); await pj.page.waitForTimeout(300);
  assert.equal(await pj.page.locator('#hr-projarea polyline').count(), 1, 'the projector: only the area\'s own line');
  assert.equal(await pj.page.locator('polyline[stroke="#E53935"]').count(), 0, 'never the board ink');
  await pj.ctx.close();
});
