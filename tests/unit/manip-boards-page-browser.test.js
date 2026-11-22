// My boards and the All boards page in a real browser (docs/decisions.md "Virtual math manipulatives: saving and AI
// drafts"), on a phone (iPhone 13) and a 1440 laptop, with 8 templates, 12 recent boards and an ended room: the home
// shows the newest 5 of each and one "See all boards" link; the page shows every one, grouped by tool (the most
// recently used tool first, a room under its own tool); its ⋯ menu renames, duplicates, deletes, reopens a room and
// starts a live room; no sideways scroll and no console errors. MANIP_SHOTS=<dir> also saves pictures (one dark).
// Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const { q } = await import('../../server/db.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'AllBoardsBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const TOOLS = ['clock', 'base-ten-blocks', 'fraction-circles', 'number-lines'];
let room, klass;
/** 8 templates and 12 recent boards across four tools (older first), and a Money room that ended just now. */
function seed() {
  const t0 = Date.now() - 3600e3;
  for (let i = 0; i < 8; i++) {
    const id = M.saveBoard(boss, { tool: TOOLS[i % 4], title: `Template ${i + 1}`, state: {} }).board.id;
    q.run('UPDATE manip_boards SET created_at=?, updated_at=?, opened_at=? WHERE id=?', t0 + i * 1000, t0 + i * 1000, t0 + i * 1000, id);
  }
  for (let i = 0; i < 12; i++) {
    const id = M.autosave(boss, { tool: TOOLS[(i + 1) % 4], title: `Recent ${i + 1}`, state: {} }).board.id;
    q.run('UPDATE manip_boards SET created_at=?, updated_at=?, opened_at=? WHERE id=?', t0 + 60e3 + i * 1000, t0 + 60e3 + i * 1000, t0 + 60e3 + i * 1000, id);
  }
  const oak = S.createSchool(boss, { name: 'All Boards Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  klass = S.createClass(boss, oak.id, { name: 'Boards 3A' }).class;
  room = M.createSession(boss, { classId: klass.id, tool: 'money', title: 'Coins room' }).session;
  M.end(boss, room.id);
}

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  seed();
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  // The room's socket, as in production (server/index.js), so a reopened or started room connects.
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  attachUpgrades(server, [(await import('../../server/services/manip-socket.js')).route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const PHONE = () => { const d = devices['iPhone 13'] || {}; return { viewport: d.viewport || { width: 390, height: 664 }, deviceScaleFactor: d.deviceScaleFactor || 3, isMobile: true, hasTouch: true, userAgent: d.userAgent, reducedMotion: 'reduce' }; };
const WIDE = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce' };
async function open(path, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
/** A picture of one card, the window made tall enough for it (fixed bars stay out of its middle). */
const cardShot = async (page, loc, name) => {
  const vp = page.viewportSize();
  await page.evaluate(() => scrollTo(0, 0)); const b = await loc.boundingBox();
  await page.setViewportSize({ width: vp.width, height: Math.ceil(b.y + b.height + 200) }); await page.waitForTimeout(500);
  await loc.screenshot({ path: `${SHOTS}/${name}.png` });
  await page.setViewportSize(vp);
};
/** The page: whole on a laptop; on a phone (fixed bars) the window at the top and at Recent boards. */
const pageShots = async (page, name, phone) => {
  await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(300);
  if (!phone) return page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
  await page.screenshot({ path: `${SHOTS}/${name}-top.png` });
  await page.evaluate(() => { const h = document.querySelector('#mp-allrecent'); scrollTo(0, h.getBoundingClientRect().top + scrollY - 80); }); await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/${name}-recent.png` });
};
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const titles = loc => loc.locator('.mp-blink').allTextContents();
const groups = loc => loc.locator('.mp-tgroup .mp-tname').evaluateAll(hs => hs.map(h => h.textContent.replace(/\s+/g, ' ').trim()));

for (const [label, opts] of [['iPhone 13', PHONE()], ['1440', WIDE]]) {
  test(`${label}: the home shows 5 + 5 and "See all boards"; the page shows every board grouped by tool`, { skip }, async () => {
    const w = label === '1440' ? 1440 : 390;
    const { ctx, page, errors } = await open('/manipulatives#', opts);
    await page.waitForSelector('.mp-boards .mp-brow');
    const card = page.locator('.mp-boards');
    assert.equal(await card.locator('.mp-blist').nth(0).locator('.mp-brow').count(), 5, 'templates: 5');
    assert.equal(await card.locator('.mp-blist').nth(1).locator('.mp-brow').count(), 5, 'recent: 5');
    assert.deepEqual(await card.locator('.mp-blist').nth(0).locator('.mp-blink').allTextContents(), ['Template 8', 'Template 7', 'Template 6', 'Template 5', 'Template 4'], 'newest first');
    assert.deepEqual(await card.locator('.mp-blist').nth(1).locator('.mp-blink').allTextContents(), ['Coins room', 'Recent 12', 'Recent 11', 'Recent 10', 'Recent 9']);
    assert.equal(await card.locator('.mp-tgroup').count(), 0, 'the home stays ungrouped');
    const link = card.locator('.mp-ball a');
    assert.equal(await link.count(), 1);
    assert.equal(await link.textContent(), 'See all boards (21)');
    assert.equal(await link.getAttribute('href'), '/manipulatives/boards');
    assert.ok(await link.isVisible(), 'the link shows');
    const [lb, cb] = [await link.boundingBox(), await card.boundingBox()];
    assert.ok(lb.y + lb.height <= cb.y + cb.height, 'inside the card');
    assert.ok(await sideways(page) <= 0, 'no sideways scroll on the home');
    if (SHOTS) await cardShot(page, card, `home-card-${w}`);
    await link.click();
    await page.waitForURL(/\/manipulatives\/boards$/);
    await page.waitForSelector('#mp-alltpl .mp-brow');
    assert.match(await page.textContent('h1'), /All boards/);
    assert.equal(await page.locator('a.btn[href="/manipulatives"]').textContent(), 'Back to Manipulatives');
    const tpl = page.locator('#mp-alltpl'), rec = page.locator('#mp-allrecent');
    assert.equal(await tpl.locator('.mp-brow').count(), 8);
    assert.equal(await rec.locator('.mp-brow').count(), 13, '12 recent boards and the room');
    // Grouped by tool: the most recently used tool first, its count beside it, the newest board first inside.
    assert.deepEqual(await groups(tpl), ['Number Lines 2 boards', 'Fraction Circles 2 boards', 'Base Ten Blocks 2 boards', 'Clock 2 boards']);
    assert.deepEqual(await groups(rec), ['Money 1 board', 'Clock 3 boards', 'Number Lines 3 boards', 'Fraction Circles 3 boards', 'Base Ten Blocks 3 boards']);
    assert.deepEqual(await titles(tpl.locator('.mp-tgroup[data-tool="clock"]')), ['Template 5', 'Template 1']);
    assert.deepEqual(await titles(rec.locator('.mp-tgroup[data-tool="clock"]')), ['Recent 12', 'Recent 8', 'Recent 4']);
    assert.equal(await rec.locator('.mp-tgroup[data-tool="money"] .mp-brow:has-text("Coins room") .mp-ico svg, .mp-tgroup[data-tool="money"] .mp-brow:has-text("Coins room") .mp-ico img').count() > 0, true, 'the room keeps its icon');
    assert.equal(await page.locator('.mp-tname .mp-ico').count(), 9, 'each tool heading has its icon');
    assert.equal(await page.locator('#mp-moretpl').count(), 0, 'no "Show all" for 8 templates');
    assert.ok(await sideways(page) <= 0, 'no sideways scroll on the page');
    // The ⋯ menu opens here as on the home.
    const row = tpl.locator('.mp-brow:has(.mp-blink:text-is("Template 1"))');
    await row.locator('.mp-more').click();
    assert.deepEqual(await row.locator('[role="menuitem"]').allTextContents(), ['Start a live room with it', 'Rename', 'Duplicate', 'Delete']);
    assert.ok(await sideways(page) <= 0, 'the open menu adds no sideways scroll');
    if (SHOTS) {
      await page.keyboard.press('Escape');
      await page.evaluate(() => { document.activeElement?.blur(); scrollTo(0, 0); }); await page.waitForTimeout(200);
      await pageShots(page, `page-${w}`, w < 800);
      await row.locator('.mp-more').click();
      await page.screenshot({ path: `${SHOTS}/page-menu-${w}.png` });
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('dark: the home card and the page (pictures only when MANIP_SHOTS is set)', { skip }, async () => {
  const { ctx, page, errors } = await open('/manipulatives#', { ...PHONE(), colorScheme: 'dark' });
  await page.waitForSelector('.mp-boards .mp-ball a');
  if (SHOTS) await cardShot(page, page.locator('.mp-boards'), 'home-card-390-dark');
  await page.goto(`${BASE}/manipulatives/boards`); await page.waitForSelector('#mp-allrecent .mp-brow');
  assert.ok(await sideways(page) <= 0);
  if (SHOTS) await pageShots(page, 'page-390-dark', true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the page\'s ⋯ menu: rename, duplicate and delete in place; a title opens the board; reopen and start go to the room', { skip }, async () => {
  const { ctx, page, errors } = await open('/manipulatives/boards', WIDE);
  await page.waitForSelector('#mp-alltpl .mp-brow');
  const tpl = page.locator('#mp-alltpl');
  const menu = async (scope, title, act) => { const r = scope.locator(`.mp-brow:has(.mp-blink:text-is("${title}"))`); await r.locator('.mp-more').click(); await r.locator(`[data-act="${act}"]`).click(); };
  // Rename the oldest template (not on the home).
  await menu(tpl, 'Template 1', 'rename');
  await page.fill('#mp-rn', 'Oldest clock'); await page.press('#mp-rn', 'Enter');
  await page.waitForSelector('#mp-alltpl .mp-tgroup[data-tool="clock"] .mp-blink:has-text("Oldest clock")');
  assert.equal(await page.evaluate(() => location.pathname), '/manipulatives/boards', 'still on the page');
  // Duplicate it: the copy is the newest template, so Clock becomes the first group.
  await menu(tpl, 'Oldest clock', 'duplicate');
  await page.waitForSelector('#mp-alltpl .mp-blink:has-text("Oldest clock (copy)")');
  assert.equal(await tpl.locator('.mp-brow').count(), 9);
  assert.equal(await tpl.locator('.mp-tgroup').first().getAttribute('data-tool'), 'clock');
  assert.match(await tpl.locator('.mp-tgroup[data-tool="clock"] .mp-tname').textContent(), /3 boards/);
  // Delete the oldest recent board.
  const rec = page.locator('#mp-allrecent');
  page.once('dialog', d => d.accept());
  await menu(rec, 'Recent 1', 'delete');
  await page.waitForFunction(() => ![...document.querySelectorAll('#mp-allrecent .mp-blink')].some(b => b.textContent === 'Recent 1'));
  assert.equal(await rec.locator('.mp-brow').count(), 12);
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_boards WHERE owner_id=? AND title='Recent 1'", boss.id).n, 0);
  // A recent board's title opens it on the manipulatives page.
  const r2 = q.get("SELECT id FROM manip_boards WHERE owner_id=? AND title='Recent 2'", boss.id).id;
  await rec.locator('.mp-blink:text-is("Recent 2")').click();
  await page.waitForURL(u => u.pathname === '/manipulatives' && u.hash === `#board/${r2}`);
  await page.waitForSelector('#mp-board');
  // Reopen the ended room: the room opens.
  await page.goto(`${BASE}/manipulatives/boards`); await page.waitForSelector('#mp-allrecent .mp-brow');
  await menu(page.locator('#mp-allrecent'), 'Coins room', 'reopen');
  await page.waitForURL(u => u.pathname === '/manipulatives' && u.hash === `#live/${room.id}`);
  await page.waitForSelector('.rm-live');
  assert.equal(M.getSession(room.id).status, 'active');
  M.end(boss, room.id);
  // Start a live room with a template (one class: straight into the room).
  await page.goto(`${BASE}/manipulatives/boards`); await page.waitForSelector('#mp-alltpl .mp-brow');
  await menu(page.locator('#mp-alltpl'), 'Template 6', 'start');
  await page.waitForURL(u => u.pathname === '/manipulatives' && /^#live\//.test(u.hash));
  await page.waitForSelector('.rm-live');
  const started = M.getSession((await page.evaluate(() => location.hash)).slice(6));
  assert.equal(started.class_id, klass.id); assert.equal(started.tool, 'base-ten-blocks');
  M.end(boss, started.id);
  // Several classes: the home's room form, with the template picked.
  const oak = q.get('SELECT school_id FROM classrooms WHERE id=?', klass.id).school_id;
  S.createClass(boss, oak, { name: 'Boards 3B' });
  await page.goto(`${BASE}/manipulatives/boards`); await page.waitForSelector('#mp-alltpl .mp-brow');
  await menu(page.locator('#mp-alltpl'), 'Template 7', 'start');
  await page.waitForURL(u => u.pathname === '/manipulatives');
  await page.waitForFunction(() => document.querySelector('#mp-host select[name="boardId"]')?.selectedOptions[0]?.textContent.includes('Template 7'));
  assert.equal(await page.evaluate(() => location.hash), '');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('many templates: the page shows the newest 50, then "Show all" brings the rest; the home still 5', { skip }, async () => {
  const before = M.countBoards(boss);
  for (let i = 0; i < 52 - before + 1; i++) M.saveBoard(boss, { tool: 'geoboard', title: `Extra ${i + 1}`, state: {} });
  const total = M.countBoards(boss);
  assert.ok(total > 50);
  const { ctx, page, errors } = await open('/manipulatives/boards', WIDE);
  await page.waitForSelector('#mp-moretpl');
  assert.equal(await page.locator('#mp-alltpl .mp-brow').count(), 50);
  assert.equal(await page.textContent('#mp-moretpl'), `Show all ${total} templates`);
  await page.click('#mp-moretpl');
  await page.waitForFunction(n => document.querySelectorAll('#mp-alltpl .mp-brow').length === n, total);
  assert.equal(await page.locator('#mp-moretpl').count(), 0);
  await page.goto(`${BASE}/manipulatives#`); await page.waitForSelector('.mp-boards .mp-ball a');
  assert.equal(await page.locator('.mp-boards .mp-blist').nth(0).locator('.mp-brow').count(), 5);
  assert.deepEqual(errors, []);
  await ctx.close();
});
