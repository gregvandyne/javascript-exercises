// Fraction circles that hold pieces (25 Nov 2026; docs/decisions.md "Fraction circles: circles hold pieces"), in a real
// browser: pieces tapped in the palette join one circle edge to edge from 12 o'clock (1/2 + 1/4 + 1/4 and 1/3 + 1/6 +
// 1/2 each make "1 whole ✓"); a piece that does not fit goes into the next circle with room, else a new one; a selected
// circle takes the next pieces; a piece is tapped to select it, then Delete takes it away and its circle closes up;
// a piece dragged onto another circle moves there when it fits (never overfilling one); a board saved with the old
// one-piece-a-circle `placed` loads as circles; the live room's square does the same. MANIP_SHOTS=<dir> also saves
// pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const B = await import('../../public/js/manip-board.js');
const { buildPractice } = await import('../../public/js/manip-practice.js');
const { boardContext } = await import('../../server/services/manip-chat.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'FractionCircleBoss', password: 'secret123', role: 'admin' });
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

async function open(who, hash, opts = { viewport: { width: 1280, height: 900 } }) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  return { ctx, page, errors };
}
const shot = async (page, sel, name) => { if (SHOTS) await page.locator(sel).first().screenshot({ path: `${SHOTS}/${name}.png` }); };
/** Each circle of the (first) set under root: its sum and its pieces in order, as their labels. */
const circles = (page, root = '#mp-content') => page.$$eval(`${root} .mp-obj.k-fraction-circles .mp-fcc`, els => els.map(c => ({
  sum: (c.querySelector('.mp-fcsum') || {}).textContent || '',
  ps: [...c.querySelectorAll('.mp-fcp')].map(p => /^(\S+) piece/.exec(p.getAttribute('aria-label'))[1]),
})));
const sums = async (page, root) => (await circles(page, root)).map(c => c.sum);
const center = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function drag(page, [x0, y0], [x1, y1]) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await page.waitForTimeout(16); }
  await page.mouse.up(); await page.waitForTimeout(400);
}
/** A piece's middle on screen: its label's spot (inside its wedge). */
const pieceAt = (page, root, ci, pi) => center(page, `${root} .mp-obj.k-fraction-circles .mp-fcc >> nth=${ci} >> .mp-fcp >> nth=${pi} >> text`);

test('the model: exact sums in 360ths, the next circle with room, never overfilled; old boards migrate; practice and the AI read circles', () => {
  const st = { circles: [] };
  for (const d of [2, 4, 4]) B.fcAdd(st, d);
  assert.deepEqual(st.circles.map(c => B.fcCircleLabel(c, 'frac')), ['1 whole ✓']);
  for (const d of [3, 6, 2]) B.fcAdd(st, d);
  assert.deepEqual(st.circles.map(c => B.fcCircleLabel(c, 'frac')), ['1 whole ✓', '1 whole ✓'], '1/3 + 1/6 + 1/2 = 1 whole');
  assert.equal(B.fcAdd(st, 12).c, st.circles[2], 'full circles: a new one');
  assert.equal(B.fcAmount(B.fcTotal(st)), '2 1/12');
  assert.equal(B.fcAmount(270, 'pct'), '75%'); assert.equal(B.fcAmount(270, 'dec'), '0.75'); assert.equal(B.fcAmount(120, 'pct'), '33.3%');
  // A selected circle takes the next piece; one with no room sends it on (diverted).
  st.sel = { c: st.circles[0].id };
  const r = B.fcAdd(st, 4); assert.ok(r.diverted); assert.equal(r.c, st.circles[2]);
  // A move that would overfill is refused; one that fits moves and closes up the circle it left.
  assert.equal(B.fcMove(st, st.circles[2].ps[0].id, st, st.circles[0].id), 'full');
  const q = st.circles[0].ps[1].id;
  assert.equal(B.fcMove(st, q, st, st.circles[2].id), 'moved');
  assert.deepEqual(st.circles[0].ps.map(p => p.d), [2, 4]); assert.deepEqual(st.circles[2].ps.map(p => p.d), [12, 4, 4]);
  // Old boards: each piece alone in its own circle, as it looked; an empty one gets one empty circle.
  const old = B.fcLoad({ placed: [{ id: 'a', d: 4, rot: 90 }, { id: 'b', d: 3, rot: 0 }, { id: 'x', d: 7 }], mode: 'pct', rings: false });
  assert.deepEqual(old.circles, [{ id: 'c1', ps: [{ id: 'a', d: 4 }] }, { id: 'c2', ps: [{ id: 'b', d: 3 }] }]);
  assert.equal(old.mode, 'pct'); assert.ok(!('placed' in old));
  assert.deepEqual(B.fcLoad({ placed: [] }).circles, [{ id: 'c1', ps: [] }]);
  assert.deepEqual(B.fcLoad({ circles: [{ id: 'c1', ps: [{ id: 'p1', d: 2 }, { id: 'p2', d: 2 }, { id: 'p3', d: 2 }] }] }).circles[0].ps.length, 2, 'a saved circle is never overfilled');
  const v1 = B.migrate('fraction-circles', { placed: [{ id: 'a', d: 2 }], mode: 'frac', rings: false });
  assert.equal(v1.objects[0].k, 'fraction-circles'); assert.equal(B.fcCircles(v1.objects[0].st).length, 1);
  assert.ok(B.objSize('fraction-circles', { k: 'fraction-circles', st: { placed: Array(7).fill({ d: 4 }) } }).h > B.objSize('fraction-circles', { k: 'fraction-circles', st: { placed: [{ d: 4 }] } }).h, 'old boards are sized by their circles');
  // A practice item: each fraction in its own circle; the AI reads each circle's pieces by size.
  const set = buildPractice('fraction-circles', { items: [{ fractions: ['3/4', '1/2'] }] });
  const o = set.board.objects.find(x => x.k === 'fraction-circles');
  assert.deepEqual(o.st.circles.map(c => c.ps.map(p => p.d)), [[4, 4, 4], [2]]); assert.equal(o.st.q, true);
  assert.deepEqual(boardContext('fraction-circles', set.board).items[0].fractions, ['3/4', '1/2']);
  assert.deepEqual(boardContext('fraction-circles', { v: 2, objects: [{ k: 'fraction-circles', st: { placed: [{ d: 4 }, { d: 4 }, { d: 3 }] } }] }).free.objects[0].fractions, ['2/4', '1/3'], 'an old board reads as before');
});

test('solo: pieces join one circle, a full one says 1 whole, overflow starts a new circle, select then Delete, drag between circles, labels, rings', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#fraction-circles');
  const SET = '#mp-content .mp-obj.k-fraction-circles';
  await page.waitForSelector(`${SET} .mp-fcc`);
  assert.equal(await page.textContent(`${SET} .mp-empty`), 'Tap a piece in the palette to put it in a circle. Pieces fill a circle from the top, going clockwise.');
  assert.deepEqual(await sums(page), ['Empty']);
  const tap = async label => { await page.click(`#mp-palette [aria-label="Add ${label} piece"]`); await page.waitForTimeout(120); };
  // "Half and quarter mix": 1/2 + 1/4 + 1/4 in one circle, edge to edge from 12 o'clock.
  await tap('1/2'); await tap('1/4');
  assert.deepEqual(await circles(page), [{ sum: '3/4', ps: ['1/2', '1/4'] }]);
  await tap('1/4');
  assert.deepEqual(await circles(page), [{ sum: '1 whole ✓', ps: ['1/2', '1/4', '1/4'] }]);
  assert.match(await page.getAttribute(`${SET} .mp-fcp >> nth=0 >> path`, 'd'), /^M 80 80 L 80 8 /, 'the first piece starts at 12 o\'clock');
  assert.equal(await page.textContent(`${SET} .mp-otot`), 'Total 1');
  await shot(page, SET, 'fc-whole');
  // Overflow: the full circle takes no more, a new circle starts; 1/3 + 1/6 + 1/2 is another whole.
  await tap('1/3');
  assert.deepEqual(await sums(page), ['1 whole ✓', '1/3']);
  await tap('1/6'); await tap('1/2');
  assert.deepEqual(await circles(page), [{ sum: '1 whole ✓', ps: ['1/2', '1/4', '1/4'] }, { sum: '1 whole ✓', ps: ['1/3', '1/6', '1/2'] }]);
  await tap('1/12');
  assert.deepEqual(await sums(page), ['1 whole ✓', '1 whole ✓', '1/12']);
  assert.equal(await page.textContent(`${SET} .mp-otot`), 'Total 2 1/12');
  // Select, then Delete: a tap selects (never deletes); a second tap lets go; Delete takes it away and the circle closes up.
  const first = `${SET} .mp-fcc >> nth=0 >> .mp-fcp >> nth=0`;
  await page.click(`${first} >> text`); await page.waitForTimeout(120);
  assert.equal(await page.getAttribute(first, 'aria-pressed'), 'true');
  assert.equal((await circles(page))[0].ps.length, 3, 'a tap does not delete');
  assert.equal(await page.textContent(`${SET} [data-act="fcdel"]`), '🗑 Delete the 1/2 piece');
  await shot(page, SET, 'fc-selected');
  await page.click(`${first} >> text`); await page.waitForTimeout(120);
  assert.equal(await page.locator(`${SET} [data-act="fcdel"]`).count(), 0, 'a second tap lets it go');
  await page.click(`${first} >> text`); await page.click(`${SET} [data-act="fcdel"]`); await page.waitForTimeout(120);
  assert.deepEqual((await circles(page))[0], { sum: '1/2', ps: ['1/4', '1/4'] });
  assert.match(await page.getAttribute(first + ' >> path', 'd'), /^M 80 80 L 80 8 /, 'closed up: the next piece moved to 12 o\'clock');
  // Undo brings it back.
  await page.click('[data-tool="undo"]'); await page.waitForTimeout(120);
  assert.equal((await circles(page))[0].sum, '1 whole ✓');
  assert.equal(await page.getAttribute(first, 'aria-pressed'), 'true', 'back as it was: selected');
  await page.click(`${SET} [data-act="fcdel"]`); await page.waitForTimeout(120);
  // A selected circle takes the next pieces (here circle 3, though circle 1 has room).
  await page.click(`${SET} .mp-fcc >> nth=2 >> .mp-fcsum`); await page.waitForTimeout(120);
  assert.equal(await page.textContent(`${SET} [data-act="fcdel"]`), '🗑 Delete circle 3');
  await tap('1/4');
  assert.deepEqual(await sums(page), ['1/2', '1 whole ✓', '1/3']);
  // Drag a piece onto another circle: it moves there (circle 3's 1/4 into circle 1: 3/4 and 1/12).
  await drag(page, await pieceAt(page, '#mp-content', 2, 1), await center(page, `${SET} .mp-fcc >> nth=0 >> svg`));
  assert.deepEqual(await circles(page), [{ sum: '3/4', ps: ['1/4', '1/4', '1/4'] }, { sum: '1 whole ✓', ps: ['1/3', '1/6', '1/2'] }, { sum: '1/12', ps: ['1/12'] }]);
  // Onto a full circle: no room, nothing moves.
  await drag(page, await pieceAt(page, '#mp-content', 0, 0), await center(page, `${SET} .mp-fcc >> nth=1 >> svg`));
  assert.deepEqual(await sums(page), ['3/4', '1 whole ✓', '1/12']);
  assert.match(await page.locator('.toast').last().textContent(), /no room for 1\/4/);
  // New circle: an empty whole, selected; pieces go into it.
  await page.click('#mp-palette [aria-label="New circle"]'); await page.waitForTimeout(120);
  assert.deepEqual(await sums(page), ['3/4', '1 whole ✓', '1/12', 'Empty']);
  await tap('1/3'); assert.deepEqual(await sums(page), ['3/4', '1 whole ✓', '1/12', '1/3']);
  // Labels: percents on the pieces and the sums.
  await page.selectOption('#mp-settings select[data-set="mode"]', 'pct'); await page.waitForTimeout(150);
  assert.deepEqual(await sums(page), ['75%', '1 whole ✓', '8.3%', '33.3%']);
  assert.deepEqual((await circles(page))[0].ps, ['25%', '25%', '25%']);
  assert.equal(await page.textContent(`${SET} .mp-otot`), 'Total 216.7%');
  // The rings view is still there, and back.
  await page.click('#mp-palette [aria-label="Rings view"]');
  assert.equal(await page.locator(`${SET} svg[aria-label="Fraction circle rings"]`).count(), 1);
  await page.click('#mp-palette [aria-label="Back to circles"]');
  assert.equal(await page.locator(`${SET} .mp-fcc`).count(), 4);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('an old saved board (each piece alone in its own circle) loads as circles and can be filled', { skip }, async () => {
  const { ctx, page, errors } = await open(boss, '#fraction-circles');
  const code = M.saveBoard(boss, { tool: 'fraction-circles', title: 'Old circles', state: { v: 2, objects: [{ id: 'o1', k: 'fraction-circles', x: 1600, y: 900, s: 1, st: { placed: [{ id: 'a1', d: 4, rot: 90 }, { id: 'a2', d: 4, rot: 180 }, { id: 'a3', d: 3, rot: 0 }], mode: 'frac', rings: false } }] } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-fcc').length === 3);
  assert.deepEqual(await circles(page), [{ sum: '1/4', ps: ['1/4'] }, { sum: '1/4', ps: ['1/4'] }, { sum: '1/3', ps: ['1/3'] }]);
  await page.click('#mp-palette [aria-label="Add 1/2 piece"]'); await page.waitForTimeout(120);
  assert.deepEqual(await sums(page), ['3/4', '1/4', '1/3'], 'the first circle with room');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the live room: a student fills a circle in their square, drags a piece between circles and deletes one', { skip }, async () => {
  const oak = S.createSchool(boss, { name: 'Circle Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const c = S.createClass(boss, oak.id, { name: '4C' }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada 4C' }).user.id); S.addToClass(boss, c.id, kid.id);
  const b = M.saveBoard(boss, { tool: 'fraction-circles', title: 'Wholes', state: { v: 2, objects: [{ id: 'fs', k: 'fraction-circles', x: 1500, y: 900, s: 1, st: { circles: [{ id: 'c1', ps: [] }, { id: 'c2', ps: [] }], sel: null, mode: 'frac', rings: false } }] } }).board;
  const s = M.createSession(boss, { classId: c.id, tool: 'fraction-circles', title: 'Wholes' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  assert.ok(M.push(boss, s.id, b.id).ok);
  const { ctx, page, errors } = await open(kid, `#live/${s.id}`, { viewport: { width: 1440, height: 900 } });
  await page.waitForSelector('.rm-area.mine'); await page.waitForTimeout(400);
  await page.click('[data-rtool="loadpush"]');
  const ROOT = '.rm-area.mine';
  await page.waitForSelector(`${ROOT} .mp-fcc`); await page.waitForTimeout(300);
  const tap = async label => { const l = page.locator(`#rm-pal [aria-label="Add ${label} piece"]`).first(); await l.scrollIntoViewIfNeeded(); await l.click(); await page.waitForTimeout(300); };
  await tap('1/3'); await tap('1/3'); await tap('1/3');
  assert.deepEqual(await sums(page, ROOT), ['1 whole ✓', 'Empty']);
  await tap('1/9');
  assert.deepEqual(await sums(page, ROOT), ['1 whole ✓', '1/9']);
  // A third dragged from the full circle into circle 2 (1/9 + 1/3 = 4/9 fits).
  await drag(page, await pieceAt(page, ROOT, 0, 2), await center(page, `${ROOT} .mp-obj.k-fraction-circles .mp-fcc >> nth=1 >> svg`));
  assert.deepEqual(await circles(page, ROOT), [{ sum: '2/3', ps: ['1/3', '1/3'] }, { sum: '4/9', ps: ['1/9', '1/3'] }]);
  await page.click(`${ROOT} .mp-obj.k-fraction-circles .mp-fcc >> nth=1 >> .mp-fcp >> nth=0 >> text`); await page.waitForTimeout(300);
  await page.click(`${ROOT} [data-act="fcdel"]`); await page.waitForTimeout(300);
  assert.deepEqual(await circles(page, ROOT), [{ sum: '2/3', ps: ['1/3', '1/3'] }, { sum: '1/3', ps: ['1/3'] }]);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/fc-room.png` });
  // Saved for the teacher: the square's board holds the circles.
  let saved = null;
  for (let i = 0; i < 30 && !saved; i++) {
    await page.waitForTimeout(200);
    const o = (JSON.parse(M.studentView(kid, s.id).mine || '{}').objects || []).find(x => x.k === 'fraction-circles');
    if (o && JSON.stringify(o.st.circles.map(c => c.ps.map(p => p.d))) === '[[3,3],[3]]') saved = o;
  }
  assert.ok(saved, 'the square saved its circles');
  assert.deepEqual(errors, []);
  await ctx.close();
  M.end(boss, s.id);
});
