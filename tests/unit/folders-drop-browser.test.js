// Drag a game onto a folder (docs/decisions.md "Drag a game onto a folder"), in a real browser: from Find Oomba games
// and from a folder whose games can be put in order, a game dropped on one of my folders in the left column is saved
// there and its count goes up, without a page load; the folder it came from keeps its order; a game already there is
// not added twice; a shared folder (someone else's) takes no drop; a plain click still opens the game.
// Skipped when no Chromium is installed.
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

seed({ quiet: true });
const boss = auth.createUser({ username: 'DropBoss', password: 'secret123', role: 'admin' });
const school = S.createSchool(boss, { name: 'Drop School' }).school;
const head = S.createSchoolAccount(boss, school.id, { rosterName: 'Head', role: 'admin' }).user;
const ana = S.createSchoolAccount(head, school.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(head, school.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const pick = q.all("SELECT slug FROM games WHERE source='seed' AND status='published' AND visibility='public' AND course_only=0 ORDER BY slug").map(r => r.slug)
  .filter(s => !/-live$|algebra-builder/.test(s));
const [g1, g2, g3] = pick.slice(0, 3).map(s => games.getGameBySlug(s));
const fun = F.createFolder(ana, 'Fun Games').folder; F.addGame(ana, fun.id, g1.id); F.addGame(ana, fun.id, g2.id);
const test1 = F.createFolder(ana, 'Test').folder;
const bens = F.createFolder(ben, 'Ben shares').folder; F.addGame(ben, bens.id, g3.id); F.shareFolder(ben, bens.id, school.id);
const idsIn = f => F.gamesIn(ana, f.id).map(g => g.id);

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
const cookieOf = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
async function open(who, path) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const [name, value] = cookieOf(who.id).split('=');
  await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const folderSel = f => `.shelf-item[data-shelf-key="f-${f.id}"]`;
const countOf = (page, f) => page.textContent(`${folderSel(f)} .n`).then(s => +s.trim());
/** Press on a, move in steps onto b (checking it lights up), let go. */
async function dragTo(page, from, to) {
  const a = await page.locator(from).boundingBox(), b = await page.locator(to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2 + 20, a.y + a.height / 2 + 5, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 });
  const lit = await page.$eval(to, el => el.classList.contains('is-drop'));
  await page.mouse.up();
  return lit;
}

test('Find Oomba games: drop a game on my folder saves it there, once', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, '/build?view=oomba');
  assert.match(await page.textContent('.shelf-drophint'), /Drag a lesson onto a folder/);
  await page.evaluate(() => { window.__stay = 1; });
  const oid = await page.$eval('#shelf-main .oomba-game', el => el.dataset.id);
  const row = `#shelf-main .oomba-game[data-id="${oid}"] .mg-cover`;
  assert.equal(await dragTo(page, row, folderSel(test1)), true, 'the folder lights up under the game');
  await page.waitForFunction(sel => document.querySelector(sel).textContent.trim() === '1', `${folderSel(test1)} .n`);
  assert.deepEqual(idsIn(test1), [oid]);
  assert.match(await page.textContent('#toasts'), /Test/);
  assert.equal(await page.evaluate(() => window.__stay), 1, 'no page load');
  assert.equal(await page.locator('.drop-ghost').count(), 0, 'the picture is gone');
  assert.equal(await page.locator('.is-drop').count(), 0);
  // Again: already there, nothing added.
  await dragTo(page, row, folderSel(test1));
  await page.waitForTimeout(400);
  assert.equal(await countOf(page, test1), 1);
  assert.deepEqual(idsIn(test1), [oid]);
  // Someone else's shared folder takes no drop.
  assert.equal(await page.locator(`${folderSel(bens)}[data-drop-folder]`).count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('From one of my folders: it asks; Cancel and Escape do nothing, Keep in both keeps its place here', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, `/build?folder=${fun.id}`);
  const before = await page.$$eval('#shelf-main .shelf-game', els => els.map(e => e.dataset.id));
  const card = `#shelf-main .shelf-game[data-id="${g2.id}"] .mg-cover`;
  // On the folder it is already in: nothing.
  await dragTo(page, card, folderSel(fun)); await page.waitForTimeout(200);
  assert.equal(await page.locator('.drop-ask').count(), 0);
  // Cancel, then Escape: nothing changes.
  assert.equal(await dragTo(page, card, folderSel(test1)), true);
  await page.waitForSelector('.drop-ask');
  assert.match(await page.textContent('.drop-ask-h'), /→ Test$/);
  assert.match(await page.textContent('.drop-ask-move'), /Move here\s*Takes it out of Fun Games/);
  assert.equal(await page.evaluate(() => document.activeElement.classList.contains('drop-ask-move')), true, 'Move here has the focus');
  await page.click('.drop-ask-cancel'); assert.equal(await page.locator('.drop-ask').count(), 0);
  await dragTo(page, card, folderSel(test1)); await page.waitForSelector('.drop-ask');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.drop-ask').count(), 0);
  await page.waitForTimeout(200);
  assert.ok(!idsIn(test1).includes(g2.id), 'nothing saved');
  // Keep in both.
  await dragTo(page, card, folderSel(test1)); await page.waitForSelector('.drop-ask');
  await page.click('.drop-ask-keep');
  await page.waitForFunction(sel => document.querySelector(sel).textContent.trim() === '2', `${folderSel(test1)} .n`);
  assert.ok(idsIn(test1).includes(g2.id));
  assert.deepEqual(await page.$$eval('#shelf-main .shelf-game', els => els.map(e => e.dataset.id)), before);
  assert.deepEqual(idsIn(fun), before, 'its order is unchanged');
  assert.equal(await page.$eval(`#shelf-main .shelf-game[data-id="${g2.id}"]`, el => el.style.transform), '');
  // Putting them in order still works.
  await dragTo(page, `#shelf-main .shelf-game[data-id="${g2.id}"] .mg-cover`, `#shelf-main .shelf-game[data-id="${g1.id}"] .mg-cover`);
  await page.waitForFunction(id => document.querySelector('#shelf-main .shelf-game').dataset.id === id, g2.id);
  await page.waitForTimeout(300);
  assert.deepEqual(idsIn(fun), [g2.id, g1.id]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Move here: it is saved in the other folder and leaves this one; both counts follow', { skip }, async () => {
  const { ctx, page, errors } = await open(ana, `/build?folder=${fun.id}`);
  const n0 = await countOf(page, test1), f0 = await countOf(page, fun);
  assert.ok(idsIn(fun).includes(g1.id) && !idsIn(test1).includes(g1.id));
  await dragTo(page, `#shelf-main .shelf-game[data-id="${g1.id}"] .mg-cover`, folderSel(test1));
  await page.waitForSelector('.drop-ask'); await page.click('.drop-ask-move');
  await page.waitForFunction(id => !document.querySelector(`#shelf-main .shelf-game[data-id="${id}"]`), g1.id);
  assert.equal(await countOf(page, test1), n0 + 1); assert.equal(await countOf(page, fun), f0 - 1);
  assert.ok(idsIn(test1).includes(g1.id)); assert.ok(!idsIn(fun).includes(g1.id));
  assert.match(await page.textContent('#toasts'), /Moved .+ to Test/);
  assert.equal(await page.textContent('#shelf-h').then(x => x.trim()), 'Fun Games', 'still showing the folder it came from');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('A plain click on a game still opens it', { skip }, async () => {
  const { ctx, page } = await open(ana, '/build?view=oomba');
  await Promise.all([page.waitForURL(/\/g\//), page.click('#shelf-main .oomba-game h3 a')]);
  await ctx.close();
});
