// The folder sidebar in a real browser (docs/decisions.md "Folders in a sidebar, on Build and the class page"): on Build
// and on the class page's Games tab, picking a folder swaps the right side in place (no page load: a marker set on the
// page survives), marks it (aria-current), puts it in the address, and Back and a reload keep it; the class page opens
// on "Assigned to <class>" when it has assignments, and "Assign to <class>" assigns from a folder without leaving it.
// No sideways scroll on a phone (390 and 360 px, also right to left), in dark mode too.
// FOLDERS_SHOTS=<dir> also saves pictures (desktop 1440 x 900, phone 390 x 844, dark). Skipped when no Chromium is installed.
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
const boss = auth.createUser({ username: 'ShelfBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Testy University' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, school.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, school.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, school.id, { name: '4b math' }).class;
const kid = S.createSchoolAccount(ana, school.id, { rosterName: 'Kid' }).user; S.addToClass(ana, cls.id, kid.id);
const empty = S.createClass(ana, school.id, { name: '4c math' }).class;
const seedGame = slug => games.getGameBySlug(slug);
const pick = q.all("SELECT slug FROM games WHERE source='seed' AND status='published' AND visibility='public' AND course_only=0 ORDER BY slug").map(r => r.slug)
  .filter(s => !/-live$|algebra-builder/.test(s));
const [g1, g2, g3, g4, g5] = pick.slice(0, 5).map(seedGame);
const fun = F.createFolder(ana, 'Fun Games').folder; F.addGame(ana, fun.id, g1.id); F.addGame(ana, fun.id, g2.id);
const test1 = F.createFolder(ana, 'Test').folder; F.addGame(ana, test1.id, g3.id);
F.shareFolder(ana, fun.id, school.id);
const g4m = F.createFolder(ben, 'Grade 4 math').folder; for (const g of [g1, g3, g4, g5]) F.addGame(ben, g4m.id, g.id); F.shareFolder(ben, g4m.id, school.id);
assert.ok(F.assignGame(ana, cls.id, g4.id, { dueAt: new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10) }).ok);

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
async function open(who, path, { lang = '', ...ctxOpts } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...ctxOpts });
  const [name, value] = cookieOf(who.id).split('=');
  await ctx.addCookies([{ name, value, url: BASE }, ...(lang ? [{ name: 'lang', value: lang, url: BASE }] : [])]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const heading = page => page.textContent('#shelf-h').then(s => s.trim());
const current = page => page.$$eval('.shelf-item[aria-current="true"]', els => els.map(e => e.dataset.shelfKey));
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }) : null);

test('Build: picking a folder shows its games in place; the address, Back and a reload keep it', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, '/build');
  assert.equal(await heading(page), 'All my games');
  assert.deepEqual(await current(page), ['all']);
  await page.evaluate(() => { window.__stay = 1; });
  await page.click(`.shelf-item[data-shelf-key="f-${fun.id}"]`);
  await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Fun Games');
  assert.equal(await page.evaluate(() => window.__stay), 1, 'no page load');
  assert.equal(new URL(page.url()).search, `?folder=${fun.id}`);
  assert.deepEqual(await current(page), [`f-${fun.id}`]);
  assert.equal(await page.locator('#shelf-main .shelf-game').count(), 2);
  assert.match(await page.textContent('#shelf-main .shelf-head'), /2 games · Shared with Testy University/);
  assert.equal(await page.locator('#shelf-main [data-reorder]').count(), 1, 'its games can be dragged into order');
  await shot(page, 'build-folder-1440');
  // A colleague's folder: read only, Copy to my folders.
  await page.click(`.shelf-item[data-shelf-key="f-${g4m.id}"]`);
  await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Grade 4 math');
  assert.match(await page.textContent('#shelf-main'), /Copy to my folders/);
  assert.equal(await page.locator('#shelf-main [data-grip], #shelf-main form[data-api$="/delete"]').count(), 0, 'nothing to change in it');
  await page.goBack(); await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Fun Games');
  assert.equal(await page.evaluate(() => window.__stay), 1, 'Back swaps in place too');
  await page.goBack(); await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'All my games');
  await page.goForward(); await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Fun Games');
  await page.reload(); assert.equal(await heading(page), 'Fun Games', 'a reload keeps it');
  // The keyboard: Tab reaches the items, Enter picks one.
  await page.focus(`.shelf-item[data-shelf-key="f-${test1.id}"]`); await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Test');
  // The folder's ⋯ menu: Rename, Share, Move, Delete.
  await page.click('#shelf-main .shelf-head .shelf-more');
  const menu = await page.textContent('#shelf-main .shelf-head .shelf-menu-panel');
  for (const w of ['Rename', 'Share with Testy University', 'Move up', 'Delete folder']) assert.ok(menu.includes(w), w);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#shelf-main .shelf-head .shelf-menu[open]').count(), 0, 'Escape closes it');
  assert.deepEqual(errors, []); await ctx.close();
});

test('class page: "Assigned to" first; a folder in place, with "Assign to <class>" and "Assign all"', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, `/class/${cls.id}`);
  assert.equal(await heading(page), 'Assigned to 4b math');
  assert.match(await page.textContent('#shelf-main'), new RegExp(g4.title));
  for (const w of ['Build new game', 'Find Oomba games', 'My folders', 'Shared by colleagues', 'Games students shared']) assert.ok((await page.textContent('.shelf-side')).includes(w), w);
  await shot(page, 'class-assigned-1440');
  await page.evaluate(() => { window.__stay = 1; });
  await page.click(`.shelf-item[data-shelf-key="f-${fun.id}"]`);
  await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Fun Games');
  assert.equal(await page.evaluate(() => window.__stay), 1, 'no page load');
  assert.equal(new URL(page.url()).search, `?folder=${fun.id}`);
  assert.match(await page.textContent('#shelf-main .shelf-head'), /Assign all 2/);
  assert.equal(await page.locator('#shelf-main .shelf-game summary', { hasText: 'Assign to 4b math' }).count(), 2);
  await shot(page, 'class-folder-1440');
  // Assign one from the folder: due day, then back on the same folder with it marked.
  const row = page.locator('#shelf-main .shelf-game', { hasText: g1.title });
  await row.locator('summary', { hasText: 'Assign to 4b math' }).click();
  await row.locator('input[type=date]').fill(new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10));
  await Promise.all([page.waitForURL(`**/class/${cls.id}?folder=${fun.id}`), row.locator('.shelf-pop-panel button[type=submit]').click()]);
  await page.waitForSelector('.shelf-game .shelf-done');
  assert.equal(await heading(page), 'Fun Games');
  assert.ok(F.assignmentOf(cls.id, g1.id), 'assigned');
  // Games students shared: in place too.
  await page.click('.shelf-item[data-shelf-key="students"]');
  await page.waitForFunction(() => document.querySelector('#shelf-h').textContent.trim() === 'Games students shared');
  assert.deepEqual(errors, []); await ctx.close();
  // A class with nothing assigned opens on the first folder.
  const e = await open(ana, `/class/${empty.id}`);
  assert.equal(await heading(e.page), 'Fun Games'); await e.ctx.close();
});

for (const [label, opts] of [['390', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }], ['360', { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true }],
  ['360 right to left', { viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true, lang: 'he' }]]) {
  test(`phone ${label}: Build's sidebar is a row of chips, the class page has two clear tabs; no sideways scroll`, { skip }, async () => {
    for (const path of ['/build', `/build?folder=${fun.id}`, `/class/${cls.id}`, `/class/${cls.id}?folder=${fun.id}`]) {
      const { ctx, page, errors } = await open(ana, path, opts);
      assert.ok(await noSideways(page), `${path}: no sideways scroll`);
      if (path.startsWith('/class/')) {
        // The class page (docs/decisions.md "The Games tab on phones: two clear tabs"): the sidebar gives way to the
        // phone block, a two-part switch (Assigned | My library) over compact rows; its tap targets are 44 px or more.
        assert.equal(await page.$eval('.shelf-class', el => getComputedStyle(el).display), 'none', 'the sidebar hides');
        const segs = await page.$$eval('.lib-seg', els => els.map(el => el.getBoundingClientRect().height));
        assert.equal(segs.length, 2); assert.ok(segs.every(h => h >= 44), 'the switch is 44 px tall');
        const taps = await page.$$eval('.lib .lib-item, .lib .lib-toggle, .lib .shelf-more, .lib .lib-tool, .lib .lib-back', els => els.map(el => el.getBoundingClientRect().height).filter(Boolean));
        assert.ok(taps.every(h => h >= 44), `${path}: tap targets are 44 px tall (${taps})`);
      } else {
        const nav = await page.$eval('.shelf-nav', el => ({ row: getComputedStyle(el).flexDirection, scrolls: el.scrollWidth > el.clientWidth }));
        assert.equal(nav.row, 'row', 'chips in a row');
        const chip = await page.$eval('.shelf-item[aria-current="true"]', el => el.getBoundingClientRect().height);
        assert.ok(chip >= 44, 'chips are 44 px tall');
      }
      if (label === '390' && path === `/build?folder=${fun.id}`) await shot(page, 'build-folder-390');
      if (label === '390' && path === `/class/${cls.id}?folder=${fun.id}`) await shot(page, 'class-folder-390');
      if (opts.lang && path === `/class/${cls.id}?folder=${fun.id}`) await shot(page, 'class-folder-360-rtl');
      // Menus open inside the screen.
      if (path.includes('folder')) {
        const where = path.startsWith('/class/') ? '.lib .lib-row' : '#shelf-main .shelf-game';
        await page.locator(`${where} .shelf-more`).first().click();
        const r = await page.locator(`${where} .shelf-menu-panel`).first().boundingBox();
        assert.ok(r.x >= 0 && r.x + r.width <= opts.viewport.width + 1, `${path}: the ⋯ menu fits`);
        assert.ok(await noSideways(page), `${path}: still no sideways scroll`);
        await page.keyboard.press('Escape');
      }
      assert.deepEqual(errors, []); await ctx.close();
    }
  });
}

test('dark mode: the sidebar reads in the dark palette', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, `/build?folder=${fun.id}`, { colorScheme: 'dark' });
  const c = await page.$eval('.shelf-item[aria-current="true"]', el => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color]);
  assert.deepEqual(c, ['rgb(102, 199, 146)', 'rgb(20, 20, 20)'], 'the current item is Mint with Ink text');
  await shot(page, 'build-folder-dark-1440');
  const k = await open(ana, `/class/${cls.id}?folder=${fun.id}`, { colorScheme: 'dark' });
  await shot(k.page, 'class-folder-dark-1440'); await k.ctx.close();
  assert.deepEqual(errors, []); await ctx.close();
});

test('a student sees no shelf, no folders and no Assign', { skip }, async () => {
  const { ctx, page } = await open(kid, `/class/${cls.id}?folder=${fun.id}`);
  assert.equal(await page.locator('[data-shelf], .shelf-item, form[data-api^="/api/teach/assign"]').count(), 0);
  assert.doesNotMatch(await page.textContent('main'), /Fun Games|Assign to/);
  await ctx.close();
});
