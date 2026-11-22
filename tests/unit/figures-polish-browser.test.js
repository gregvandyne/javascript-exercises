// Figures Phase 4, polish, in Chromium (docs/decisions.md "Figures Phase 4: polish"): the editor's Undo and Redo
// (buttons, Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z, Ctrl+Y, the cannot-draw panel's Undo my last change on the same history, and
// the editor opened from a worksheet question); the ⋯ Presets menu (examples first, keyboard, save, apply, delete with a
// question); the quieter builder rows (the row and its figure open the editor, ⟳ only with a generator, ⋯ More with
// Move up, Move down, Swap figure and Delete, the keyboard pattern of the My worksheets menus, Alt+Arrow to reorder);
// the delete button's noun on a test and a lesson's questions; the terms page. FIG_SHOTS=<dir> saves pictures at twice
// the pixels. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const F = await import('../../server/services/figures.js');
const FS = await import('../../server/services/figures-steps.js');
const CAT = await import('../../public/js/figures-catalog.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null; try { ({ chromium } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';

const boss = createUser({ username: 'FigPolishB', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Polish Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Polish' });
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
async function open(path, opts = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 }) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const field = (page, k) => page.locator(`[data-f="${k}"]`);
const focused = page => page.evaluate(() => { const a = document.activeElement; return a ? (a.dataset.p || a.dataset.mi || a.id || a.className) : ''; });

test('the editor: Undo and Redo by button and by keyboard, the cannot-draw panel uses the same history', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/rectangle');
  await page.waitForSelector('#fg-figure svg');
  const undo = page.locator('.fg-hist [data-act="undo"]'), redo = page.locator('.fg-hist [data-act="redo"]');
  assert.equal(await undo.getAttribute('aria-label'), null, 'named by its screen-reader text');
  assert.equal((await undo.textContent()).trim(), 'Undo'); assert.equal((await redo.textContent()).trim(), 'Redo');
  assert.ok(await undo.isDisabled()); assert.ok(await redo.isDisabled());
  await field(page, 'AB').fill('20');
  await page.waitForFunction(() => !document.querySelector('.fg-hist [data-act="undo"]').disabled);
  await page.waitForTimeout(450);
  await field(page, 'BC').fill('8'); await field(page, 'BC').blur();
  await page.waitForTimeout(450);
  await shot(page, 'editor-undo-redo');
  await undo.click();
  assert.equal(await field(page, 'BC').inputValue(), '5'); assert.equal(await field(page, 'AB').inputValue(), '20');
  assert.ok(!(await redo.isDisabled()));
  assert.equal(await page.textContent('#fg-hist-msg'), '', 'cleared, then said');
  await page.waitForFunction(() => document.getElementById('fg-hist-msg').textContent === 'Undone.');
  await redo.click();
  assert.equal(await field(page, 'BC').inputValue(), '8');
  // the keyboard, outside a text box: Ctrl+Z, Ctrl+Y, Shift+Ctrl+Z, Meta+Z
  await page.locator('h1').click();
  await page.keyboard.press('Control+z'); assert.equal(await field(page, 'BC').inputValue(), '5');
  await page.keyboard.press('Control+z'); assert.equal(await field(page, 'AB').inputValue(), '12');
  await page.keyboard.press('Control+y'); assert.equal(await field(page, 'AB').inputValue(), '20');
  await page.keyboard.press('Control+Shift+Z'); assert.equal(await field(page, 'BC').inputValue(), '8');
  await page.keyboard.press('Meta+z'); assert.equal(await field(page, 'BC').inputValue(), '5');
  // inside a text box the keys are the box's own
  await field(page, 'BC').focus(); await page.keyboard.press('Control+z');
  assert.equal(await field(page, 'AB').inputValue(), '20', 'not undone from inside a box');
  // a figure that cannot be drawn: the panel's Undo my last change is the same history, and Redo brings it back
  await field(page, 'BC').fill('-3');
  await page.waitForSelector('#fg-cant:not([hidden])');
  await page.click('#fg-cant [data-act="undo"]');
  await page.waitForSelector('#fg-cant', { state: 'hidden' });
  assert.equal(await field(page, 'BC').inputValue(), '5');
  await redo.click(); await page.waitForSelector('#fg-cant:not([hidden])');
  await undo.click(); await page.waitForSelector('#fg-cant', { state: 'hidden' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the editor opened from a worksheet question has the same Undo and Redo, and saves back what is shown', { skip }, async () => {
  const w = F.createWorksheet(boss, { title: 'Undo sheet', items: [{ kind: 'rectangle', data: { AB: 6, BC: 3, unit: 'cm' }, question: 'Area?', answerKey: 'area' }] });
  const it = F.itemsOf(w.id)[0];
  const { ctx, page, errors } = await open(`/figures/rectangle?ws=${w.id}&item=${it.id}`);
  await page.waitForSelector('#fg-figure svg');
  await field(page, 'AB').fill('9'); await field(page, 'AB').blur(); await page.waitForTimeout(450);
  await field(page, 'AB').fill('11'); await field(page, 'AB').blur(); await page.waitForTimeout(450);
  await page.locator('h1').click(); await page.keyboard.press('Control+z');
  assert.equal(await field(page, 'AB').inputValue(), '9');
  await Promise.all([page.waitForURL(/\/figures\/worksheets\//), page.click('[data-act="saveback"]')]);
  assert.equal(F.itemsOf(w.id)[0].data.AB, 9);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a question saved with an earlier definition of its generator (PAST_GENS) opens with its answer and worked lines', { skip }, async () => {
  const past = CAT.PAST_GENS.freeBody[0];
  let seed = 1, was = null;
  for (; seed < 200000; seed += 7) { const w = F.generate('freeBody', seed, undefined, past), now = F.generate('freeBody', seed); if (w && now && JSON.stringify(w.data) !== JSON.stringify(now.data)) { was = w; break; } }
  assert.ok(was, 'a seed the two definitions deal differently');
  const w = F.createWorksheet(boss, { title: 'Old forces', items: [{ kind: 'freeBody', gen: 'freeBody', seed, data: was.data, hide: was.hide, question: was.question }] });
  const it = F.itemsOf(w.id)[0];
  assert.equal(it.gen, 'freeBody', 'the server still links it to its generator');
  const { ctx, page, errors } = await open(`/figures/freeBody?ws=${w.id}&item=${it.id}`);
  await page.waitForSelector('#fg-figure svg');
  await page.waitForFunction(() => document.querySelectorAll('#fg-answer .fg-work li').length > 0);
  assert.deepEqual(await page.$$eval('#fg-answer .fg-work li', l => l.map(x => x.textContent)), was.work);
  if (!it.answerKey) assert.equal(await page.textContent('#fg-answer .fg-big'), was.answer);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the Presets menu: examples first, the keyboard, save as preset, apply it, delete it after a question', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/rectangle');
  await page.waitForSelector('#fg-figure svg');
  const btn = page.locator('.fg-presetmenu .fg-mm-btn');
  assert.equal(await btn.getAttribute('aria-haspopup'), 'menu');
  await btn.focus(); await page.keyboard.press('ArrowDown');
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  assert.equal(await focused(page), 'x0', 'the first example first');
  const items = await page.$$eval('.fg-presetmenu [role="menuitem"]', b => b.map(x => x.dataset.p || x.dataset.mi));
  assert.deepEqual(items.slice(0, 2), ['x0', 'x1']);
  assert.ok(!items.includes('delpresets'), 'no Delete a preset without presets');
  await page.keyboard.press('End'); assert.equal(await focused(page), 'preset');
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(page), 'x0', 'wraps');
  await page.keyboard.press('ArrowUp'); assert.equal(await focused(page), 'preset');
  await page.keyboard.press('Escape');
  assert.equal(await btn.getAttribute('aria-expanded'), 'false');
  assert.ok(await page.evaluate(() => document.activeElement.classList.contains('fg-mm-btn')), 'focus back on the button');
  // a click outside closes it
  await btn.click(); await page.locator('h1').click();
  assert.ok(await page.locator('.fg-presetmenu .fg-mm-list').isHidden());
  // save the figure as it is now
  await field(page, 'AB').fill('15'); await page.waitForTimeout(400);
  await btn.click(); await page.click('.fg-presetmenu [data-mi="preset"]');
  await page.fill('dialog.ob-dialog input', 'Wide one'); await page.keyboard.press('Enter');
  await page.waitForFunction(() => [...document.querySelectorAll('.fg-presetmenu [data-mi="apply"]')].some(b => b.textContent === 'Wide one'));
  assert.equal(F.listPresets(boss, 'rectangle')[0].data.AB, 15);
  // another example, then the teacher's own preset
  await btn.click(); await page.click('.fg-presetmenu [data-p="x0"]');
  assert.equal(await field(page, 'AB').inputValue(), '12');
  await btn.click();
  await shot(page, 'editor-presets-menu');
  const mine = await page.$$eval('.fg-presetmenu [data-mi="apply"]', b => b.find(x => x.textContent === 'Wide one').dataset.p);
  await page.click(`.fg-presetmenu [data-p="${mine}"]`);
  assert.equal(await field(page, 'AB').inputValue(), '15');
  await page.locator('h1').click(); await page.keyboard.press('Control+z');
  assert.equal(await field(page, 'AB').inputValue(), '12', 'applying a preset is one step in undo');
  // delete it: a list of the teacher's presets, a question first
  await btn.click(); await page.click('.fg-presetmenu [data-mi="delpresets"]');
  await page.waitForSelector('.sheet .fg-plist');
  await page.click('.sheet [data-delp]');
  await page.waitForSelector('dialog.ob-dialog[open]');
  assert.match(await page.textContent('dialog.ob-dialog'), /Delete the preset "Wide one"\?/);
  await Promise.all([page.waitForResponse(r => /\/presets\/[^/]+\/delete$/.test(r.url())), page.click('dialog.ob-dialog [data-ob="ok"]')]);
  await page.waitForFunction(() => /no presets/.test(document.querySelector('.sheet').textContent));
  assert.deepEqual(F.listPresets(boss, 'rectangle'), []);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the builder rows: quiet, the ⋯ More menu by keyboard, Alt+Arrow reorders, the row opens the editor, Delete last', { skip }, async () => {
  const w = F.createWorksheet(boss, { title: 'Row sheet', items: [F.starterItem('rectangle'), F.starterItem('triangle'), F.starterItem('orbitals')] });
  const ids = F.itemsOf(w.id).map(x => x.id);
  const { ctx, page, errors } = await open(`/figures/worksheets/${w.id}`);
  await page.waitForSelector('.fg-item:nth-child(3)');
  const row = n => page.locator(`.fg-item:nth-child(${n})`);
  assert.equal(await row(1).locator('.fg-iacts > button, .fg-iacts > .fg-mm > button').count(), 2, '⟳ and ⋯ only');
  assert.equal(await row(3).locator('[data-act="regen"]').count(), 0, 'no ⟳ without a generator (orbitals)');
  assert.equal(await row(3).locator('.fg-iacts .fg-mm-btn').count(), 1);
  assert.equal(await row(1).locator('a.fg-ithumb').getAttribute('href'), `/figures/rectangle?ws=${w.id}&item=${ids[0]}`);
  // the menu by keyboard: Move up is off on the first row, so Move down has the focus
  await row(1).locator('.fg-mm-btn').focus(); await page.keyboard.press('Enter');
  assert.equal(await focused(page), 'down');
  assert.deepEqual(await row(1).locator('[role="menuitem"]').evaluateAll(b => b.map(x => [x.dataset.mi, x.disabled, x.classList.contains('bad')])), [['up', true, false], ['down', false, false], ['swap', false, false], ['ask', false, false], ['del', false, true]]);
  await page.keyboard.press('ArrowDown'); assert.equal(await focused(page), 'swap');
  await page.keyboard.press('Home'); assert.equal(await focused(page), 'down');
  await page.keyboard.press('End'); assert.equal(await focused(page), 'del');
  await page.keyboard.press('Escape');
  assert.equal(await focused(page), `fg-mb-${ids[0]}`, 'focus back on ⋯');
  // Move down from the menu: the question moves, the keyboard stays on its ⋯
  await page.keyboard.press('Enter'); await page.keyboard.press('Enter');
  await page.waitForFunction(id => document.querySelectorAll('.fg-item')[1].dataset.id === id, ids[0]);
  assert.deepEqual(F.itemsOf(w.id).map(x => x.id), [ids[1], ids[0], ids[2]]);
  assert.equal(await focused(page), `fg-mb-${ids[0]}`);
  await page.waitForFunction(() => document.getElementById('fg-moved').textContent === 'Moved to question 2.');
  // Alt+Arrow Up from the figure link moves it back, and the link keeps the focus
  await page.focus(`#fg-e-${ids[0]}`); await page.keyboard.press('Alt+ArrowUp');
  await page.waitForFunction(id => document.querySelectorAll('.fg-item')[0].dataset.id === id, ids[0]);
  assert.equal(await focused(page), `fg-e-${ids[0]}`);
  // not while typing in the question box
  await page.focus(`#fg-q-${ids[0]}`); await page.keyboard.press('Alt+ArrowDown'); await page.waitForTimeout(300);
  assert.deepEqual(F.itemsOf(w.id).map(x => x.id), [ids[0], ids[1], ids[2]]);
  // a click outside closes an open menu
  await row(2).locator('.fg-mm-btn').click(); await page.locator('.fg-crumbs').click();
  assert.ok(await row(2).locator('.fg-mm-list').isHidden());
  // the screenshot: a row's More menu open
  await page.evaluate(() => window.scrollTo(0, document.querySelector('.fg-items').getBoundingClientRect().top + window.scrollY - 120));
  await row(2).locator('.fg-mm-btn').click();
  await shot(page, 'builder-row-more-open');
  await page.keyboard.press('Escape');
  // Swap figure (a box with the kinds), then Delete last, after a question
  await row(3).locator('.fg-mm-btn').click(); await page.click('.fg-item:nth-child(3) [data-mi="swap"]');
  await page.selectOption('.sheet [data-swapkind]', 'kite');
  await Promise.all([page.waitForResponse(r => /\/swap$/.test(r.url())), page.click('.sheet .fg-swapform button[type="submit"]')]);
  await page.waitForFunction(() => /Kite/.test(document.querySelector('.fg-item:nth-child(3) .fg-ikind').textContent));
  await row(3).locator('.fg-mm-btn').click(); await page.click('.fg-item:nth-child(3) [data-mi="del"]');
  await page.waitForSelector('dialog.ob-dialog[open]');
  await page.click('dialog.ob-dialog [data-ob="cancel"]');
  assert.equal(F.itemsOf(w.id).length, 3, 'Cancel keeps it');
  await row(3).locator('.fg-mm-btn').click(); await page.click('.fg-item:nth-child(3) [data-mi="del"]');
  await Promise.all([page.waitForResponse(r => /\/delete$/.test(r.url())), page.click('dialog.ob-dialog [data-ob="ok"]')]);
  await page.waitForFunction(() => document.querySelectorAll('.fg-item').length === 2);
  // the row itself opens the editor
  await Promise.all([page.waitForURL(/\/figures\/rectangle\?ws=/), row(1).locator('.fg-ikind').click()]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the builder rows fit a phone, and the delete button names a test and a lesson\'s questions', { skip }, async () => {
  const t = F.createWorksheet(boss, { title: 'Unit test', purpose: 'test', items: [F.starterItem('rectangle')] });
  const p = await open(`/figures/worksheets/${t.id}`, { viewport: { width: 375, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await p.page.waitForSelector('.fg-item');
  assert.ok(await p.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
  assert.equal((await p.page.textContent('[data-act="remove"]')).trim(), 'Delete test');
  await p.page.click('[data-act="remove"]');
  assert.match(await p.page.textContent('dialog.ob-dialog'), /Delete this test\?/);
  await p.page.click('dialog.ob-dialog [data-ob="cancel"]');
  await p.ctx.close();
  const l = L.createLesson(boss, oak.id, { title: 'Shapes lesson', kind: 'lesson', grade: '6' }).lesson;
  const set = FS.newLessonSet(boss, l.id);
  F.addItem(boss, set.id, F.starterItem('rectangle'));
  const q = await open(`/figures/worksheets/${set.id}`);
  await q.page.waitForSelector('.fg-item');
  assert.equal((await q.page.textContent('[data-act="remove"]')).trim(), 'Delete these questions');
  await q.page.click('[data-act="remove"]');
  assert.match(await q.page.textContent('dialog.ob-dialog'), /Delete these figure questions\?[\s\S]*Figure step keeps the questions/);
  await q.page.click('dialog.ob-dialog [data-ob="cancel"]');
  const s = await open(`/figures/worksheets/${F.createWorksheet(boss, { title: 'Plain', items: [F.starterItem('rectangle')] }).id}`);
  await s.page.waitForSelector('.fg-item');
  assert.equal((await s.page.textContent('[data-act="remove"]')).trim(), 'Delete worksheet');
  assert.deepEqual([...q.errors, ...s.errors, ...p.errors], []);
  await q.ctx.close(); await s.ctx.close();
});

test('the terms page, linked from the editor\'s export notice', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/triangle');
  await page.waitForSelector('#fg-figure svg');
  await Promise.all([page.waitForURL(/\/figures\/terms$/), page.click('.fg-ed-side a[href="/figures/terms"]')]);
  assert.match(await page.textContent('h1'), /Reusing your figures/);
  assert.match(await page.textContent('#fg-notice'), /^Made with Oomba Academy\./);
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
  await shot(page, 'terms-page', true);
  assert.deepEqual(errors, []);
  await ctx.close();
});
