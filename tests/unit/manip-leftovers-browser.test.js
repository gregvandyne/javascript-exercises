// Leftovers in the Manipulatives, closed, in a real browser: a double ten-frame is the size it is drawn at (two
// ten-frames side by side, not a work mat) and a counter snaps into its right frame's cells; no tool shows its help text
// while practicing; a geoboard counts the band in progress only while there is one, never on a read-only board; a tap on
// the coordinate grid's edge, or a few px outside it, plots the nearest point on that edge (never a tap on its table).
// Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const M = await import('../../server/services/manipulatives.js');
const { practiceTasks } = await import('../../public/js/manip-tasks.js');
const { TOOLS } = await import('../../public/js/manip-data.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;

const boss = createUser({ username: 'LeftBoss', password: 'secret123', role: 'admin' });
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
  const code = M.saveBoard(boss, { tool, title: 'Leftovers', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-obj').length > 0);
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  // Until the board stops moving (Fit eases it into place).
  let r = await page.locator('#mp-content .mp-obj').first().boundingBox();
  for (let i = 0; i < 30; i++) { await page.waitForTimeout(60); const q = await page.locator('#mp-content .mp-obj').first().boundingBox(); if (Math.abs(q.x - r.x) < 0.5 && Math.abs(q.y - r.y) < 0.5 && Math.abs(q.width - r.width) < 0.5) break; r = q; }
}
async function mdrag(page, [x0, y0], [x1, y1], steps = 12) {
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= steps; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps); await page.waitForTimeout(12); }
  await page.mouse.up(); await page.waitForTimeout(250);
}
const mid = b => [b.x + b.width / 2, b.y + b.height / 2];

// ---------------------------------------------------------------- the double ten-frame
test('a double ten-frame is as big as its two ten-frames (not a work mat) and a counter snaps into a cell of its right frame', { skip }, async () => {
  const { ctx, page, errors } = await open('#two-color-counters');
  await load(page, 'two-color-counters', { objects: [{ id: 'd', k: 'double-ten-frame', x: 900, y: 700, s: 1, locked: true, st: { n: 20 } }],
    pieces: [{ id: 'c1', kind: 'pos', x: 1300, y: 920, w: 48, h: 48 }] });
  const fit = await page.$eval('#mp-content .mp-obj.k-double-ten-frame', o => {
    const inn = o.querySelector('.mp-objin'), f2 = o.querySelector('.mp-frame2'), body = o.querySelector('.mp-obody');
    const fr = [...o.querySelectorAll('.mp-frame2 > .mp-frame')].map(f => f.getBoundingClientRect()), r = o.getBoundingClientRect();
    return { w: inn.offsetWidth, h: inn.offsetHeight, f2w: f2.scrollWidth, f2h: f2.scrollHeight, bodyH: body.offsetHeight, inside: fr.every(b => b.left >= r.left - 0.5 && b.right <= r.right + 0.5 && b.top >= r.top - 0.5 && b.bottom <= r.bottom + 0.5), sideBySide: fr.length === 2 && fr[1].left > fr[0].right };
  });
  assert.equal(fit.w, 644); assert.equal(fit.h, 176);
  assert.ok(fit.f2w <= fit.w && fit.f2h <= fit.bodyH, `its frames fit in it: ${JSON.stringify(fit)}`);
  assert.ok(fit.inside && fit.sideBySide, 'two ten-frames side by side inside the object');
  // A counter dragged near the right frame's third top cell lands centered in it.
  const cell = await page.locator('#mp-content .k-double-ten-frame .mp-frame >> nth=1').locator('div').nth(2).boundingBox();
  const c = await page.locator('#mp-content .mp-piece').first().boundingBox();
  await mdrag(page, mid(c), [cell.x + cell.width / 2 + cell.width * 0.2, cell.y + cell.height / 2 - cell.height * 0.15]);
  const after = await page.locator('#mp-content .mp-piece').first().boundingBox(), [ax, ay] = mid(after), [cx, cy] = mid(cell);
  assert.ok(Math.abs(ax - cx) < 1.5 && Math.abs(ay - cy) < 1.5, `centered in the cell: ${ax - cx}, ${ay - cy}`);
  assert.match(await page.textContent('#mp-content .k-double-ten-frame .mp-otot'), /^Value 1/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- help text while practicing
test('no tool shows its help text (the hint under the settings, the note under the board) while practicing; outside practice it is there', { skip }, async () => {
  const { ctx, page, errors } = await open('#pattern-blocks');
  await page.waitForSelector('.mp-hint');
  assert.match(await page.textContent('.mp-hint'), /^Hold a block: Rotate turns it 30 degrees/);
  assert.equal(await page.locator('.mp-note').count(), 1);
  const slugs = TOOLS.map(t => t.slug).filter(s => practiceTasks(s).length);
  assert.ok(slugs.length >= 15, `tools with tasks to practice: ${slugs.length}`);
  for (const slug of slugs) {
    const { id } = practiceTasks(slug)[0];
    const name = TOOLS.find(t => t.slug === slug).name;
    await page.goto(`${BASE}/manipulatives#practice/${id}`);
    await page.waitForFunction(n => { const h = document.querySelector('.mp-practicing .mp-title h1'), p = document.getElementById('mp-prob'); return h && h.textContent.includes(n) && p && p.children.length > 0; }, name);
    assert.equal(await page.locator('.mp-practicing').count(), 1, slug);
    assert.equal(await page.locator('.mp-hint').count(), 0, `${slug}: no hint while practicing`);
    assert.equal(await page.locator('.mp-note').count(), 0, `${slug}: no note while practicing`);
  }
  // back to free play: the help is back
  await page.goto(`${BASE}/manipulatives#geoboard`); await page.waitForSelector('.mp-hint');
  assert.match(await page.textContent('.mp-hint'), /^Tap pegs in order/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the geoboard's band in progress
test('the geoboard counts the band in progress only while there is one, and never on a read-only board', { skip }, async () => {
  const { ctx, page, errors } = await open('#geoboard');
  await page.waitForSelector('#mp-content .mp-peg');
  const line = () => page.locator('#mp-content .mp-obody p.small').allTextContents();
  assert.deepEqual(await line(), [], 'no band yet: no line');
  await page.click('#mp-content .mp-peg >> nth=0', { force: true });
  assert.deepEqual(await line(), ['Current band: 1 peg.']);
  await page.click('#mp-content .mp-peg >> nth=2', { force: true }); await page.click('#mp-content .mp-peg >> nth=14', { force: true });
  assert.deepEqual(await line(), ['Current band: 3 pegs.']);
  await page.click('#mp-palette [aria-label="Close the band"]');
  assert.deepEqual(await line(), [], 'closed: no band in progress');
  // Read-only (Homeroom's teacher board, the live room's classmates): never, even with a band in progress.
  const ro = await page.evaluate(async () => {
    const m = await import('/js/manip.js');
    const st = { objects: [{ id: 'g', k: 'geoboard', x: 0, y: 0, s: 1, st: { board: 'square', band: [{ x: 0, y: 0 }, { x: 2, y: 0 }], bands: [], color: '#E53935', fill: true } }], pieces: [] };
    return m.readOnlyBoard('geoboard', st, { w: 600, h: 500 }).html;
  });
  assert.ok(ro.includes('mp-geo'), 'the board is drawn');
  assert.ok(!/Current band/.test(ro), 'no "Current band" on a read-only board');
  // A practice question's board (read-only for its review) neither.
  await page.goto(`${BASE}/manipulatives#practice/geoboard/squares-of-many-sizes`); await page.waitForSelector('#mp-content .mp-obj');
  assert.equal(await page.locator('#mp-content :text("Current band")').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the coordinate grid's edges
test('a tap on the grid\'s edge or a few px outside it plots the nearest point on that edge; a tap on its table or labels, or farther out, plots nothing', { skip }, async () => {
  const { ctx, page, errors } = await open('#xy-coordinate-board');
  await load(page, 'xy-coordinate-board', { objects: [{ id: 'g', k: 'xy-coordinate-board', x: 900, y: 700, s: 1, locked: true, st: { four: false, labels: true, connect: false, arrows: false, table: true, color: '#E53935', pts: [] } }] });
  const table = () => page.$$eval('#mp-content .mp-xytable td b', bs => bs.map(b => b.textContent).join(' '));
  const r = await page.locator('#mp-content svg.mp-grid').boundingBox(), step = r.height / 12;
  const click = async (x, y) => { await page.mouse.click(x, y); await page.waitForTimeout(150); };
  await click(r.x - 4, r.y + r.height - 5 * step);   // left of the left edge, at y = 5
  await click(r.x + r.width + 5, r.y - 5);           // past the top right corner
  await click(r.x + 7 * step, r.y + r.height + 4);   // under the bottom edge, at x = 7
  await click(r.x + 1, r.y + 3 * step);              // on the left edge itself, at y = 9
  assert.equal(await table(), '(0,5) (12,12) (7,0) (0,9)');
  // Farther out than the edge's few px: nothing.
  await click(r.x - 20, r.y + r.height / 2);
  // The table, its "Table" label and the object's name: nothing.
  for (const css of ['#mp-content .mp-xytable .mp-barname', '#mp-content .mp-xytable th', '#mp-content .mp-xytable td', '#mp-content .mp-oname']) {
    const b = await page.locator(css).first().boundingBox(); await click(b.x + 4, b.y + b.height / 2);
  }
  assert.equal(await table(), '(0,5) (12,12) (7,0) (0,9)');
  // Undo takes the last edge point back (it went through the board's own change, like any tap).
  await page.$eval('[data-tool="undo"]', b => b.click()); await page.waitForTimeout(150);
  assert.equal(await table(), '(0,5) (12,12) (7,0)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the task box under the board
test('the task box: Preview and Assign side by side at one height (equal columns on a phone), then one row of matching quiet links', { skip }, async () => {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h } });
    const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
    const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${BASE}/manipulatives#fraction-tiles`); await page.waitForSelector('#mp-tasks .mp-task .mp-taskacts');
    const L = await page.$eval('#mp-tasks', box => {
      const r = e => e.getBoundingClientRect(), task = box.querySelector('.mp-task'), acts = [...task.querySelectorAll('.mp-taskacts > *')];
      const links = [...box.querySelectorAll('.mp-tasknav > *')], cs = e => getComputedStyle(e);
      return { acts: acts.map(a => ({ t: a.textContent.trim(), ...r(a).toJSON(), primary: a.classList.contains('btn-primary') })), task: r(task).toJSON(),
        links: links.map(a => ({ t: a.textContent.trim(), pill: a.classList.contains('btn'), font: `${cs(a).fontSize} ${cs(a).fontWeight}`, color: cs(a).color, top: r(a).top, bg: cs(a).backgroundColor })),
        navTop: r(box.querySelector('.mp-tasknav')).top, actsBottom: Math.max(...acts.map(a => r(a).bottom)) };
    });
    const [pv, as] = L.acts;
    assert.deepEqual(L.acts.map(a => [a.t.replace(/^\W+/u, ''), a.primary]), [['Preview', false], ['Assign', true]], `${w}: Preview (secondary) then Assign (primary)`);
    assert.equal(pv.height, as.height, `${w}: one height`); assert.equal(pv.top, as.top, `${w}: side by side`);
    if (w < 500) {
      assert.ok(Math.abs(pv.width - as.width) < 1, 'a phone: two equal columns');
      assert.ok(Math.abs(pv.left - L.task.left) < 1 && Math.abs(as.right - L.task.right) < 1, 'filling the card');
    }
    assert.deepEqual(L.links.map(l => l.t), ['All 17 tasks for this tool', 'Practice these tasks', 'Task library'], `${w}: the links, in order`);
    assert.ok(L.links.every(l => !l.pill && l.bg === 'rgba(0, 0, 0, 0)'), `${w}: text links, no pill`);
    assert.equal(new Set(L.links.map(l => `${l.font} ${l.color}`)).size, 1, `${w}: one style for every link`);
    assert.ok(L.navTop >= L.actsBottom + 8, `${w}: the links sit under the buttons with space between`);
    if (w > 1000) assert.equal(new Set(L.links.map(l => Math.round(l.top))).size, 1, 'a wide screen: one row');
    // "All 17 tasks" still opens and closes the list
    await page.click('#mp-tasksmore'); assert.equal(await page.locator('#mp-tasks .mp-task').count(), 17);
    assert.notEqual(await page.textContent('#mp-tasksmore'), 'All 17 tasks for this tool', 'it now offers fewer');
    await page.click('#mp-tasksmore'); assert.equal(await page.locator('#mp-tasks .mp-task').count(), 1);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
