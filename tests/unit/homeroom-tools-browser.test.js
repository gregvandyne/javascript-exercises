// Homeroom's board tools in a real browser (public/js/homeroom-board.js, homeroom-board-ui.js, board-shapes.js;
// docs/decisions.md "Homeroom: board tools"): every shape in the Shapes picker drawn by dragging (Shift keeps a square),
// fill with opacity, dashed and thick outlines, a dashed arrow line, a dotted pen line, the last style kept for the
// next shape; copy, cut, paste and duplicate for a sticky note, a text box, a pen line, a shape and a line (keys and
// buttons, into another class, words from elsewhere as a text box); a marquee and Shift-click selecting many, moved,
// styled and deleted together, bring to front and send to back; turning and locking; undo and redo; the student desk's
// window and the projector drawing exactly what the board draws; the picker and popovers inside the screen on a phone
// (a sheet), a tablet and a Chromebook. Chromium only. HRTOOLS_SHOTS=<dir> saves screenshots there.
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
const B = await import('../../public/js/board-shapes.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.HRTOOLS_SHOTS || '';
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HrToolsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Tools Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Hale', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '5A Shapes', teacherId: teacher.id }).class;
const cls2 = S.createClass(boss, oak.id, { name: '5B Shapes', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return u; });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const EMPTY = { __ann: { notes: [], texts: [], strokes: [] }, shapes: [] };
const reset = (c = cls, st = EMPTY) => assert.ok(H.saveArea(teacher, c, st).ok);
const area = (c = cls) => H.roomOf(c.id).area;
const shapes = (c = cls) => area(c).shapes || [];
async function context(viewport = { width: 1366, height: 768 }, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(teacher.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  return ctx;
}
async function board(ctx, c = cls) {
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/class/${c.id}/hub`); await page.waitForSelector('.hr-desk, .hr-nostudents'); await page.waitForTimeout(400);
  const b = await page.locator('.hr-area').boundingBox();
  const at = (fx, fy) => ({ x: b.x + b.width * fx, y: b.y + b.height * fy });
  return { page, errors, at, box: b };
}
async function open(viewport, touch) { const ctx = await context(viewport, touch); return { ctx, ...(await board(ctx)) }; }
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hrtools-${name}.png`) }); };
const until = async (fn, what) => { for (let i = 0; i < 50; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };
async function drag(page, from, to, { steps = 8, shift = false } = {}) {
  await page.mouse.move(from.x, from.y); if (shift) await page.keyboard.down('Shift');
  await page.mouse.down(); await page.mouse.move(to.x, to.y, { steps }); await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
const center = async loc => { const r = await loc.boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
const empty = at => at(0.97, 0.93);
async function pick(page, id) { await page.click('[data-hrmode="shape"]'); await page.waitForSelector('#hr-pop .hr-picker'); await page.click(`#hr-pop [data-hrshape="${id}"]`); }
const setStyle = async (page, pop, v) => { if (!(await page.locator('#hr-pop').count())) await page.click(`#hr-seltools [data-hrpop="${pop}"]`); await page.click(`#hr-pop [data-hrset="${v}"]`); };
const closePop = page => page.keyboard.press('Escape');
const press = (page, k) => page.keyboard.press(`Control+${k}`);

test('every shape in the picker: drawn by dragging, selectable, Shift keeps it square', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  reset();
  const { ctx, page, errors, at, box } = await open();
  await page.click('[data-hrmode="shape"]'); await page.waitForSelector('#hr-pop .hr-picker');
  assert.equal(await page.locator('#hr-pop [data-hrshape]').count(), B.PICKS.length, 'every shape and line in the picker');
  const r = await page.locator('#hr-pop').boundingBox();
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.width <= 1366 && r.y + r.height <= 768, `the picker is on the screen ${JSON.stringify(r)}`);
  await shot(page, 'shapes-picker');
  await closePop(page);
  // 25 shapes on a 9 x 3 grid of the area
  for (const [i, p] of B.PICKS.entries()) {
    const cx = 0.04 + (i % 9) * 0.105, cy = 0.1 + Math.floor(i / 9) * 0.3;
    await pick(page, p.id);
    await drag(page, at(cx, cy), at(cx + 0.08, cy + 0.22));
    await until(() => shapes().length === i + 1, `${p.id} saved`);
    const s = shapes()[i];
    assert.equal(s.k, p.k, p.id); assert.equal(s.a, p.a, `${p.id}: its arrowheads`);
    assert.equal(await page.locator('[data-hrmode="move"][aria-pressed="true"]').count(), 1, `${p.id}: back on Select`);
    assert.equal(await page.locator('#hr-seltools [data-hrsel="delete"]').count(), 1, `${p.id}: selected`);
  }
  assert.equal(await page.locator('.hr-area .hr-draw [data-shape]').count(), B.PICKS.length);
  // a click on the star's outline selects it again (not the empty board)
  await page.mouse.click(empty(at).x, empty(at).y);
  const star = shapes().findIndex(s => s.k === 'star'), sb = shapes()[star];
  const tip = { x: box.x + box.width * ((sb.x + sb.x2) / 2), y: box.y + box.height * Math.min(sb.y, sb.y2) + 3 };
  await page.mouse.click(tip.x, tip.y);
  assert.equal(await page.locator('#hr-seltools:not([hidden])').count(), 1, 'the star is selected by its tip');
  // Shift keeps it square
  reset(); await page.reload(); await page.waitForSelector('.hr-desk');
  await pick(page, 'rect');
  await drag(page, at(0.1, 0.2), at(0.3, 0.5), { shift: true });
  await until(() => shapes().length === 1, 'square saved');
  const q = shapes()[0], w = Math.abs(q.x2 - q.x) * 1560, h = Math.abs(q.y2 - q.y) * 380;
  assert.ok(Math.abs(w - h) < 2, `square: ${w} x ${h}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('style: fill and opacity, dashed thick outline, a dashed arrow line, a dotted pen line, the next shape remembers', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  reset();
  const { ctx, page, errors, at } = await open();
  await pick(page, 'hex'); await drag(page, at(0.1, 0.2), at(0.25, 0.8));
  await until(() => shapes().length === 1, 'hexagon');
  await setStyle(page, 'fill', 'f:#7CB342'); await setStyle(page, 'fill', 'fo:50'); await closePop(page);
  await setStyle(page, 'line', 'd:dash'); await setStyle(page, 'line', 'w:XL'); await setStyle(page, 'line', 'c:#1E88E5'); await closePop(page);
  await until(() => { const s = shapes()[0]; return s.f === '#7CB342' && s.fo === 50 && s.d === 'dash' && s.w === 'XL' && s.c === '#1E88E5'; }, `hexagon styled ${JSON.stringify(shapes()[0])}`);
  const poly = page.locator('.hr-area .hr-draw [data-shape] polygon');
  assert.equal(await poly.getAttribute('fill'), '#7CB342'); assert.equal(await poly.getAttribute('fill-opacity'), '0.5');
  assert.ok(await poly.getAttribute('stroke-dasharray'), 'dashed'); assert.equal(await poly.getAttribute('stroke-width'), '14');
  // stroke "none" is offered on a filled shape
  await page.click('#hr-seltools [data-hrpop="line"]');
  assert.equal(await page.locator('#hr-pop [data-hrset="c:none"]:not([disabled])').count(), 1, 'no outline, as it is filled');
  await shot(page, 'style-toolbar');
  await closePop(page);
  // the next shape has the same style
  await pick(page, 'star'); await drag(page, at(0.3, 0.2), at(0.42, 0.8));
  await until(() => shapes().length === 2, 'star');
  const s2 = shapes()[1];
  assert.deepEqual([s2.f, s2.fo, s2.d, s2.w, s2.c], ['#7CB342', 50, 'dash', 'XL', '#1E88E5'], 'remembered for the next shape');
  // a dashed arrow line
  await pick(page, 'aline'); await drag(page, at(0.5, 0.3), at(0.7, 0.7));
  await until(() => shapes().length === 3, 'arrow line');
  await setStyle(page, 'line', 'd:dash'); await setStyle(page, 'line', 'a:both'); await closePop(page);
  await until(() => shapes()[2].d === 'dash' && shapes()[2].a === 'both', 'dashed, both ends');
  assert.equal(await page.locator(`.hr-area [data-shape="${shapes()[2].id}"] polygon`).count(), 2, 'two arrowheads');
  // a dotted, thick pen line (the pen's own style, from the Board tools)
  await page.click('[data-hrmode="pen"]');
  await page.click('#hr-tools [data-hrpop="line"]'); await page.click('#hr-pop [data-hrset="d:dot"]'); await page.click('#hr-pop [data-hrset="w:L"]'); await page.click('#hr-pop [data-hrset="c:#D6457A"]'); await closePop(page);
  if (await page.locator('[data-hrmode="pen"][aria-pressed="true"]').count() === 0) await page.click('[data-hrmode="pen"]');
  await drag(page, at(0.75, 0.3), at(0.95, 0.6), { steps: 12 });
  await until(() => (area().__ann.strokes || []).length === 1, 'pen line');
  const pen = area().__ann.strokes[0];
  assert.deepEqual([pen.d, pen.w, pen.c], ['dot', 'L', '#D6457A']);
  assert.match(await page.locator('.hr-area .hr-draw polyline').getAttribute('stroke-dasharray'), /^0\.01 /, 'dots');
  await page.click('[data-hrmode="move"]');
  await shot(page, 'styled-board');
  assert.deepEqual(errors, []);
  await ctx.close();
});

const SEED = {
  __ann: { notes: [{ id: 'n1', text: 'Note A', x: 0.02, y: 0.08, w: 176, h: 110, nc: 'green' }], texts: [{ id: 'x1', text: 'Words', x: 0.2, y: 0.1, w: 200, h: 40, b: 1 }],
    strokes: [{ id: 'p1', c: '#E53935', pts: [{ x: 0.4, y: 0.2 }, { x: 0.45, y: 0.4 }, { x: 0.5, y: 0.3 }], z: 1 }] },
  shapes: [{ id: 's1', k: 'tri', x: 0.6, y: 0.1, x2: 0.7, y2: 0.5, c: '#1E88E5', f: '#FFD23F', z: 2 }, { id: 'l1', k: 'line', x: 0.75, y: 0.2, x2: 0.9, y2: 0.4, c: '#141414', a: 'end', z: 3 }],
};
// where to press for each seeded object (area fractions)
const SPOT = { note: [0.06, 0.25], text: [0.24, 0.15], stroke: [0.45, 0.4], shape: [0.65, 0.4], line: [0.825, 0.3] };

test('copy, paste and duplicate every kind of object: keys, buttons, another class, words from elsewhere', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  reset(); reset(cls2);
  const ctx = await context();
  const { page, errors, at } = await board(ctx);
  const counts = () => { const a = area(); return { note: a.__ann.notes.length, text: a.__ann.texts.length, stroke: a.__ann.strokes.length, shape: shapes().filter(s => s.k !== 'line').length, line: shapes().filter(s => s.k === 'line').length }; };
  H.saveArea(teacher, cls, SEED); await page.reload(); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(300);
  for (const [k, [fx, fy]] of Object.entries(SPOT)) {
    const before = counts()[k];
    await page.mouse.click(empty(at).x, empty(at).y);
    await page.mouse.click(at(fx, fy).x, at(fx, fy).y);
    assert.equal(await page.locator('#hr-seltools:not([hidden])').count(), 1, `${k}: selected`);
    // Ctrl+C then Ctrl+V: a copy 16 px down and right, selected
    await press(page, 'c'); await page.mouse.move(at(fx, fy).x, at(fx, fy).y); await press(page, 'v');
    await until(() => counts()[k] === before + 1, `${k}: pasted`);
    // Ctrl+D: duplicated; the toolbar's Duplicate too
    await press(page, 'd');
    await until(() => counts()[k] === before + 2, `${k}: duplicated`);
    await page.click('#hr-seltools [data-hrsel="dup"]');
    await until(() => counts()[k] === before + 3, `${k}: duplicated by the button`);
  }
  // the pasted note kept its color and words, 16 px from the first
  const ns = area().__ann.notes;
  assert.deepEqual(ns.map(n => n.text), ['Note A', 'Note A', 'Note A', 'Note A']);
  assert.ok(ns.every(n => n.nc === 'green'), 'its color too');
  assert.ok(Math.abs((ns[1].x - ns[0].x) * 1560 - 16) < 1.5 && Math.abs((ns[1].y - ns[0].y) * 380 - 16) < 1.5, `offset 16 px (${(ns[1].x - ns[0].x) * 1560})`);
  const ls = shapes().filter(s => s.k === 'line');
  assert.ok(ls.every(l => l.a === 'end'), 'a line keeps its arrowhead');
  // cut with the More menu, paste with the Board tools' Paste button
  const n0 = counts().shape;
  await page.mouse.click(empty(at).x, empty(at).y);
  await page.mouse.click(at(...SPOT.shape).x, at(...SPOT.shape).y);
  await page.click('#hr-seltools [data-hrpop="more"]'); await page.click('#hr-pop [data-hrsel="cut"]');
  await until(() => counts().shape === n0 - 1, 'cut');
  await page.click('#hr-tools [data-hr="paste"]');
  await until(() => counts().shape === n0, 'pasted back');
  // into another class in the same browser
  const other = await board(ctx, cls2);
  await other.page.click('#hr-tools [data-hr="paste"]');
  await until(() => shapes(cls2).length === 1 && shapes(cls2)[0].k === 'tri', 'pasted into 5B');
  // words copied from elsewhere: a new text box
  await other.page.evaluate(() => {
    const dt = new DataTransfer(); dt.setData('text/plain', 'From my notes');
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await until(() => (area(cls2).__ann.texts || []).some(x => x.text === 'From my notes'), 'plain text pasted as a text box');
  // the system clipboard's copy event carries the objects (a paste event with them puts them on the board)
  const html = await page.evaluate(() => {
    const dt = new DataTransfer(); document.querySelector('#hr-board').focus();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
    return dt.getData('text/html');
  });
  assert.match(html, /data-oomba-board=/, 'the copy event wrote the objects');
  await other.page.evaluate(h => { const dt = new DataTransfer(); dt.setData('text/html', h); document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, html);
  await until(() => shapes(cls2).length === 2, 'pasted from the system clipboard');
  assert.deepEqual([...errors, ...other.errors], []);
  await ctx.close();
});

test('many at once: a marquee, Shift-click, moved together, styled together, front and back, deleted together; undo and redo', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  reset(); H.saveArea(teacher, cls, SEED);
  const { ctx, page, errors, at } = await open();
  // a marquee across the stroke, the triangle and the line
  await drag(page, at(0.38, 0.03), at(0.93, 0.6), { steps: 10 });
  assert.equal(await page.locator('.hr-sel .hr-selbox.group').count(), 1, 'a group');
  assert.equal(await page.locator('.hr-sel .hr-selbox.thin').count(), 3, 'three selected');
  await shot(page, 'multi-select');
  // Shift-click adds the note
  await page.keyboard.down('Shift'); await page.mouse.click(at(...SPOT.note).x, at(...SPOT.note).y); await page.keyboard.up('Shift');
  assert.equal(await page.locator('.hr-sel .hr-selbox.thin').count(), 4, 'four selected');
  // move them together
  const before = JSON.stringify(area()), x0 = shapes()[0].x, n0 = area().__ann.notes[0].x, p0 = area().__ann.strokes[0].pts[0].x;
  await drag(page, at(0.65, 0.4), at(0.65 + 40 / 1560 * 1, 0.45), { steps: 6 });
  await until(() => shapes()[0].x > x0 + 0.005 && area().__ann.notes[0].x > n0 + 0.005 && area().__ann.strokes[0].pts[0].x > p0 + 0.005, 'moved together');
  assert.equal(area().__ann.texts[0].x, 0.2, 'the text box was not selected');
  // style together: the outline color on the stroke, the triangle and the line
  await setStyle(page, 'line', 'c:#8C6BD1'); await closePop(page);
  await until(() => shapes().every(s => s.c === '#8C6BD1') && area().__ann.strokes[0].c === '#8C6BD1', 'recolored together');
  // send to back, bring to front (the triangle under the pen line, then over it)
  await page.mouse.click(empty(at).x, empty(at).y); await page.mouse.click(at(...SPOT.shape).x, at(...SPOT.shape).y);
  await page.click('#hr-seltools [data-hrpop="more"]'); await page.click('#hr-pop [data-hrsel="back"]');
  await until(() => shapes()[0].z < area().__ann.strokes[0].z, 'sent to back');
  assert.equal(await page.evaluate(() => document.querySelector('.hr-area .hr-draw').firstElementChild.getAttribute('data-shape')), 's1', 'drawn first');
  await page.click('#hr-seltools [data-hrpop="more"]'); await page.click('#hr-pop [data-hrsel="front"]');
  await until(() => shapes()[0].z > shapes()[1].z, 'brought to front');
  // Ctrl+A and Delete; Ctrl+Z brings everything back; Ctrl+Shift+Z deletes again; Ctrl+Y as well
  await page.mouse.click(empty(at).x, empty(at).y);
  await press(page, 'a'); await page.keyboard.press('Delete');
  await until(() => !shapes().length && !area().__ann.notes.length && !area().__ann.texts.length && !area().__ann.strokes.length, 'all deleted');
  await press(page, 'z');
  await until(() => shapes().length === 2 && area().__ann.notes.length === 1, 'undone');
  await page.keyboard.press('Control+Shift+Z');
  await until(() => !shapes().length, 'redone');
  await press(page, 'z'); await until(() => shapes().length === 2, 'undone again');
  await press(page, 'y'); await until(() => !shapes().length, 'Ctrl+Y redoes');
  await page.click('#hr-tools [data-hr="undo"]'); await until(() => shapes().length === 2, 'the Undo button');
  await page.click('#hr-tools [data-hr="redo"]'); await until(() => !shapes().length, 'the Redo button');
  // undo walks back the moves too
  for (let i = 0; i < 5; i++) await page.click('#hr-tools [data-hr="undo"]');
  await until(() => JSON.stringify(area()) === before, 'back to the start');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('turn a shape and a text box; lock one so it stays put', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  reset(); H.saveArea(teacher, cls, SEED);
  const { ctx, page, errors, at } = await open();
  await page.mouse.click(at(...SPOT.shape).x, at(...SPOT.shape).y);
  const h = await center(page.locator('.hr-h-rot')), c = await center(page.locator('.hr-sel .hr-selbox'));
  await drag(page, h, { x: c.x + Math.abs(c.y - h.y), y: c.y });   // a quarter turn (to the right when the handle is above, to the left when under)
  await until(() => Math.abs(Math.abs(shapes()[0].r || 0) - 90) <= 2, `turned (${shapes()[0].r})`);
  assert.match(await page.locator('.hr-area [data-shape="s1"]').getAttribute('transform'), /^rotate\(-?9\d/, 'drawn turned');
  // still selected by a press inside it after the turn
  await page.mouse.click(empty(at).x, empty(at).y); await page.mouse.click(c.x, c.y);
  assert.equal(await page.locator('#hr-seltools:not([hidden])').count(), 1, 'selected again');
  // the text box
  await page.mouse.click(empty(at).x, empty(at).y); await page.mouse.click(at(...SPOT.text).x, at(...SPOT.text).y);
  const th = await center(page.locator('.hr-h-rot')), tc = await center(page.locator('.hr-area [data-text]'));
  await drag(page, th, { x: tc.x - (tc.y - th.y), y: tc.y }, { shift: true });
  await until(() => Math.abs(Math.abs(area().__ann.texts[0].r || 0) - 90) <= 1, `text turned (${area().__ann.texts[0].r})`);
  // lock the triangle: no handles, a drag does not move it, Unlock brings them back
  await page.mouse.click(empty(at).x, empty(at).y); await page.mouse.click(c.x, c.y);
  await page.click('#hr-seltools [data-hrpop="more"]'); await page.click('#hr-pop [data-hrsel="lock"]');
  await until(() => shapes()[0].lk === 1, 'locked');
  assert.equal(await page.locator('.hr-sel .hr-h').count(), 0, 'no handles while locked');
  const x0 = shapes()[0].x; await drag(page, c, { x: c.x + 60, y: c.y }); await page.waitForTimeout(700);
  assert.equal(shapes()[0].x, x0, 'stays put');
  await page.mouse.click(c.x, c.y);
  await page.click('#hr-seltools [data-hrsel="lock"]');
  await until(() => !shapes()[0].lk, 'unlocked');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/** A teacher's area with one of everything, styled. */
const RICH = {
  __ann: {
    notes: [{ id: 'n1', text: 'Pink note', x: 0.02, y: 0.06, w: 180, h: 110, nc: 'pink' }, { id: 'n2', text: 'Blue note', x: 0.02, y: 0.5, w: 180, h: 110, nc: 'blue' }],
    texts: [{ id: 'x1', text: 'Fractions!', x: 0.16, y: 0.06, w: 260, h: 50, fs: 'XL', b: 1, tc: '#E53935', al: 'c' }, { id: 'x2', text: 'Turned words', x: 0.16, y: 0.6, w: 200, h: 40, r: -12, tc: '#1E88E5' }],
    strokes: [{ id: 'p1', c: '#1F9D63', w: 'L', d: 'dot', pts: [{ x: 0.36, y: 0.7 }, { x: 0.4, y: 0.85 }, { x: 0.46, y: 0.7 }], z: 5 }],
  },
  shapes: [
    { id: 's1', k: 'star', x: 0.34, y: 0.06, x2: 0.44, y2: 0.5, c: '#F59E0B', f: '#FFD23F', w: 'L', z: 1 },
    { id: 's2', k: 'heart', x: 0.46, y: 0.1, x2: 0.55, y2: 0.5, c: 'none', f: '#D6457A', fo: 50, z: 2 },
    { id: 's3', k: 'speech', x: 0.57, y: 0.06, x2: 0.7, y2: 0.45, c: '#141414', f: '#FFFFFF', d: 'dash', z: 3 },
    { id: 's4', k: 'cyl', x: 0.72, y: 0.06, x2: 0.79, y2: 0.55, c: '#00897B', f: '#4FC3F7', fo: 25, w: 'XL', z: 4 },
    { id: 's5', k: 'cloud', x: 0.81, y: 0.06, x2: 0.97, y2: 0.5, c: '#8C6BD1', z: 6, r: 8 },
    { id: 'l1', k: 'curve', x: 0.5, y: 0.6, x2: 0.7, y2: 0.9, c: '#E53935', a: 'end', d: 'dash', z: 7 },
    { id: 'l2', k: 'elbow', x: 0.72, y: 0.65, x2: 0.95, y2: 0.92, c: '#141414', a: 'both', w: 'S', z: 8 },
  ],
};

test('the student desk\'s window and the projector draw exactly what the board draws', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  reset(cls, RICH);
  const T = await open();
  await shot(T.page, 'rich-board');
  const strip = s => s.replace(/ class="hr-shape" data-shape="[^"]*"/g, '').replace(/ data-stroke="[^"]*"/g, '').replace(/<g\s+/g, '<g ').replace(/<g >/g, '<g>');
  const drawn = async (page, sel) => strip(await page.evaluate(q => document.querySelector(q).innerHTML, sel));
  const styles = (page, sel) => page.evaluate(q => [...document.querySelectorAll(`${q} .mp-text, ${q} .mp-sticky`)].map(e => [e.className.replace(/ ?(hr-rotext|hr-rosticky|on)\b/g, '').trim(), e.getAttribute('style'), e.textContent.trim()]), sel);
  const onBoard = await drawn(T.page, '.hr-board .hr-area .hr-draw'), bs = await styles(T.page, '.hr-board .hr-area');
  assert.ok(onBoard.includes('fill-opacity="0.5"') && onBoard.includes('stroke-dasharray'), 'styled shapes on the board');
  // a student's desk: the window on the teacher's area
  const sctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, hasTouch: true });
  const [n, v] = cookieOf(kids[0].id).split('='); await sctx.addCookies([{ name: n, value: v, url: BASE }]);
  const desk = await sctx.newPage(); const derr = []; desk.on('pageerror', e => derr.push(String(e)));
  await desk.goto(`${BASE}/class/${cls.id}/desk`); await desk.waitForSelector('.hd-window .hr-draw');
  assert.equal(await drawn(desk, '.hd-window .hr-draw'), onBoard, 'the desk draws the same shapes and pen lines');
  assert.deepEqual(await styles(desk, '.hd-window'), bs, 'and the same notes and text');
  assert.equal(await desk.locator('.hd-window [contenteditable], .hd-window [data-hrh], .hd-window #hr-seltools').count(), 0, 'nothing to edit');
  await shot(desk, 'student-desk');
  // the projector
  const P = await T.ctx.newPage();
  const perr = []; P.on('pageerror', e => perr.push(String(e)));
  await P.goto(`${BASE}/class/${cls.id}/hub/projector`); await P.waitForSelector('.hr-projarea .hr-draw');
  assert.equal(await drawn(P, '.hr-projarea .hr-draw'), onBoard, 'the projector draws the same');
  assert.deepEqual(await styles(P, '.hr-projarea'), bs);
  await shot(P, 'projector');
  assert.deepEqual([...T.errors, ...derr, ...perr], []);
  await sctx.close(); await T.ctx.close();
});

test('the picker and the style popovers fit: a phone (a sheet, nothing sideways), a tablet, a Chromebook', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  reset(cls, RICH);
  for (const [name, vp, touch] of [['phone', { width: 390, height: 844 }, true], ['tablet', { width: 1180, height: 820 }, true], ['chromebook', { width: 1366, height: 768 }, false]]) {
    const { ctx, page, errors } = await open(vp, touch);
    const inside = sel => page.evaluate(q => { const r = document.querySelector(q).getBoundingClientRect(); return { ok: r.left >= -0.5 && r.top >= -0.5 && r.right <= innerWidth + 0.5 && r.bottom <= innerHeight + 0.5 && r.width > 50, r: [r.left, r.top, r.right, r.bottom], w: innerWidth, h: innerHeight }; }, sel);
    const sideways = () => page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    const tap = async sel => { if (touch) await page.tap(sel); else await page.click(sel); };
    await tap('[data-hrmode="shape"]'); await page.waitForSelector('#hr-pop .hr-picker');
    const r = await inside('#hr-pop'); assert.ok(r.ok, `${name}: picker inside ${JSON.stringify(r)}`);
    if (name === 'phone') assert.equal(await page.locator('#hr-pop.hr-popsheet').count(), 1, 'a sheet on a phone');
    assert.ok(!(await sideways()), `${name}: nothing sideways`);
    if (name === 'phone') await shot(page, 'phone-sheet');
    await tap('#hr-pop [data-hrshape="diamond"]');
    assert.equal(await page.locator('[data-hrmode="shape"][aria-pressed="true"]').count(), 1, `${name}: the shape tool is on`);
    await tap('[data-hrmode="move"]');
    // select a shape, open its Outline popover
    await page.evaluate(() => { window.scrollTo(0, 0); });
    const s = page.locator('.hr-area [data-shape="s3"]'); const c = await center(s);
    if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await page.waitForTimeout(200);
    assert.equal(await page.locator('.hr-area [data-shape]').count(), RICH.shapes.length, `${name}: selected, nothing new drawn`);
    const bar = await inside('#hr-seltools'); assert.ok(bar.ok, `${name}: the toolbar inside ${JSON.stringify(bar)}`);
    await tap('#hr-seltools [data-hrpop="line"]');
    const p = await inside('#hr-pop'); assert.ok(p.ok, `${name}: Outline inside ${JSON.stringify(p)}`);
    assert.ok(!(await sideways()), `${name}: nothing sideways with the popover`);
    await shot(page, `${name}-outline`);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});
