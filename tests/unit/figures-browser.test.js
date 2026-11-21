// Figures in a real browser (routes/figures.js, public/js/figures*.js): on a laptop and on an iPhone 13, the menu filters
// by subject and search with no sideways scroll; a card opens its editor; editing a number redraws the figure; numbers
// that cannot make the figure show the cannot-draw panel and turn export off, and Undo brings the figure back; the SVG
// and PNG downloads carry Oomba's CC0 notice in their bytes; "Add to worksheet" makes a worksheet; the builder shows its
// questions and the print preview (student sheet and answer key), Power with AI (mocked) adds checked questions; the
// print page. FIG_SHOTS=<dir> also saves pictures at twice the pixels. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession } = await import('../../server/auth.js');
const F = await import('../../server/services/figures.js');
const { q } = await import('../../server/db.js');
const { pngText } = await import('../../public/js/figures-export.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.FIG_SHOTS || '';
const NOTICE = 'Made with Oomba Academy. Everything Oomba Academy contributes to this figure is dedicated to the public domain under CC0 1.0 (https://creativecommons.org/publicdomain/zero/1.0/). Anything original added by the person who made it is theirs.';

const boss = createUser({ username: 'FigBrowser', password: 'secret123', role: 'admin' });
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

const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2, acceptDownloads: true });
const LAPTOP = () => ({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1, acceptDownloads: true });
async function open(path, ctxOpts = LAPTOP()) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(boss.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name, full = false) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
const visibleKinds = page => page.$$eval('.fg-card', cs => cs.filter(c => !c.hidden && c.offsetParent).map(c => c.getAttribute('href').split('/').pop()));

test('the menu on a laptop and a phone: subject tabs, grade chips and search filter the cards; a card opens its editor', { skip }, async () => {
  for (const [label, opts] of [['laptop', LAPTOP()], ['phone', PHONE()]]) {
    const { ctx, page, errors } = await open('/figures', opts);
    await page.waitForSelector('.fg-card');
    await noSideScroll(page);
    assert.equal((await visibleKinds(page)).length, 57, 'every kind in the catalog (1.2.0 added seven chemistry kinds)');
    await shot(page, `menu-${label}`);
    if (label === 'laptop') await shot(page, 'menu-laptop-full', true);
    await page.click('[data-tab="physics"]');
    const phys = await visibleKinds(page);
    assert.ok(phys.length >= 10 && phys.every(k => ['freeBody', 'vectors', 'inclinedPlane', 'pulley', 'rays', 'circuit', 'motionGraph', 'motionMap', 'projectile', 'waves', 'reading'].includes(k)), phys.join());
    await page.click('[data-tab="chem"]');
    const chem = await visibleKinds(page);
    for (const k of ['massSpectrum', 'heatingCurve', 'energyProfile', 'nuclide', 'lineSpectrum', 'photoelectron', 'particles']) assert.ok(chem.includes(k), `the Chemistry tab has ${k}`);
    await page.click('[data-tab="all"]');
    await page.click('[data-grade="K-2"]');
    assert.ok((await visibleKinds(page)).includes('barGraph'));
    assert.ok(!(await visibleKinds(page)).includes('normalCurve'));
    await page.click('[data-grade="K-2"]');
    await page.fill('#fg-q', 'box plot');
    assert.deepEqual(await visibleKinds(page), ['boxPlot']);
    await page.fill('#fg-q', 'zzzz');
    assert.equal(await page.isVisible('#fg-none'), true);
    await page.fill('#fg-q', 'triangle');
    await page.click('.fg-card[href="/figures/triangle"]');
    await page.waitForSelector('#fg-figure svg');
    assert.match(page.url(), /\/figures\/triangle$/);
    await noSideScroll(page);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the editor: a number redraws the figure; impossible numbers show why, turn export off, and Undo brings the figure back', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/triangle');
  await page.waitForSelector('#fg-figure svg');
  await page.fill('#fg-question', 'Find x, the length of CA.');
  await page.selectOption('#fg-key', 'sides.CA');
  assert.match(await page.textContent('#fg-answer'), /5/);
  await shot(page, 'editor-triangle-laptop');
  await page.fill('#fg-f-AB', '6'); await page.fill('#fg-f-BC', '8');
  await page.waitForFunction(() => document.getElementById('fg-code').textContent.includes('"AB":6'));
  assert.match(await page.textContent('#fg-answer'), /10/, 'OF.solve: 6, 8, 10');
  assert.equal(await page.isHidden('#fg-cant'), true);
  // the cannot-draw state
  await page.fill('#fg-f-B', ''); await page.fill('#fg-f-AB', '1'); await page.fill('#fg-f-BC', '2'); await page.fill('#fg-f-CA', '10');
  await page.waitForSelector('#fg-cant:not([hidden])');
  assert.match(await page.textContent('#fg-cant'), /These sides cannot make a triangle/);
  assert.match(await page.textContent('#fg-cant'), /Oomba Figures says: these sides cannot make a triangle/);
  for (const act of ['svg', 'png', 'copy']) assert.equal(await page.isDisabled(`[data-act="${act}"]`), true, act);
  assert.match(await page.innerHTML('#fg-figure'), /This figure cannot be drawn/);
  await shot(page, 'editor-cannot-draw');
  await page.waitForTimeout(400);
  await page.click('#fg-cant [data-act="undo"]');
  await page.waitForSelector('#fg-cant[hidden]', { state: 'attached' });
  assert.equal(await page.isDisabled('[data-act="svg"]'), false);
  // the advanced JSON box
  await page.click('#fg-adv summary');
  await page.fill('#fg-json', '{ "AB": 3,');
  assert.match(await page.textContent('#fg-json-msg'), /isn't valid JSON yet/);
  await page.fill('#fg-json', '{ "AB": 5, "BC": 12, "B": 90 }');
  await page.waitForFunction(() => document.getElementById('fg-code').textContent.includes('"BC":12'));
  // Randomize uses the kind's generator: a question with its answer and worked lines
  await page.click('[data-act="random"]');
  await page.waitForFunction(() => document.getElementById('fg-question').value.length > 5);
  assert.ok((await page.$$('#fg-answer .fg-work li')).length >= 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('downloads: the SVG has the notice as metadata; the PNG has it in a tEXt chunk and XMP', { skip }, async () => {
  const { ctx, page, errors } = await open('/figures/rectangle');
  await page.waitForSelector('#fg-figure svg');
  const [svgDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="svg"]')]);
  assert.equal(svgDl.suggestedFilename(), 'rectangle.svg');
  const svg = fs.readFileSync(await svgDl.path(), 'utf8');
  assert.match(svg, /^<svg/); assert.ok(svg.includes(`<dc:rights>${NOTICE}</dc:rights>`));
  const [pngDl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="png"]')]);
  assert.equal(pngDl.suggestedFilename(), 'rectangle.png');
  const bytes = new Uint8Array(fs.readFileSync(await pngDl.path()));
  assert.deepEqual([...bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  const txt = pngText(bytes);
  assert.equal(txt.Copyright, NOTICE);
  assert.ok(txt['XML:com.adobe.xmp'].includes(NOTICE));
  assert.equal(txt['Copyright:crc'], undefined);
  assert.ok(bytes.length > 2000, 'a real picture');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('on a phone: add a figure to a new worksheet, see it in the builder with its print preview, and print', { skip }, async () => {
  const before = q.get("SELECT COUNT(*) n FROM question_sets WHERE owner_id=?", boss.id).n;
  const { ctx, page, errors } = await open('/figures/triangle', PHONE());
  await page.waitForSelector('#fg-figure svg');
  await noSideScroll(page);
  await shot(page, 'editor-triangle-phone');
  await page.selectOption('#fg-key', 'sides.CA');
  await page.fill('#fg-question', 'Find the length of CA.');
  await page.click('.fg-addmenu summary');
  await page.click('[data-act="addnew"]');
  await page.waitForSelector('#fg-added:not([hidden])');
  assert.equal(q.get("SELECT COUNT(*) n FROM question_sets WHERE owner_id=?", boss.id).n, before + 1);
  await page.click('#fg-added a');
  await page.waitForSelector('.fg-item');
  await noSideScroll(page);
  assert.match(await page.textContent('.fg-item'), /Find the length of CA\./);
  assert.match(await page.textContent('.fg-item .fg-ians'), /5/);
  assert.match(await page.innerHTML('#fg-paper'), /class="fgp"/);
  await page.click('[data-tab="key"]');
  assert.match(await page.innerHTML('#fg-paper'), /fgp-key/);
  await page.click('a[href$="/print?key=1"]');
  await page.waitForSelector('.fgp');
  await noSideScroll(page);
  assert.equal(await page.$$eval('.fgp-page', p => p.length), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the worksheet builder on a laptop: Power with AI (mocked) adds checked questions; reorder, new numbers; print preview', { skip }, async () => {
  F.hooks.create = async () => ({ model: config.builderModel, usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Area and volume practice', items: [
    { kind: 'rectangle', question: 'Find the area of the rectangle.', data: JSON.stringify({ AB: 6, BC: 2, unit: 'm' }), answerKey: 'area' },
    { kind: 'prism', question: 'A gift box has these measurements. How much space is inside it?', data: JSON.stringify({ length: 5, width: 2, height: 3, unit: 'in' }), answerKey: 'volume' },
    { kind: 'triangle', question: 'Find CA.', data: JSON.stringify({ AB: 1, BC: 2, CA: 10 }), answerKey: 'sides.CA' },
    { kind: 'cylinder', question: 'Find the volume of the cylinder. Round to the nearest tenth.', data: JSON.stringify({ radius: 4, height: 11, unit: 'm' }), answerKey: 'volume' },
    { kind: 'boxPlot', question: 'What is the interquartile range?', data: JSON.stringify({ summary: [12, 18, 23, 29, 40], values: true }), answerKey: 'iqr' },
  ] }) }] });
  try {
    const { ctx, page, errors } = await open('/figures/worksheets/new?ai=1');
    await page.waitForSelector('#fg-brief');
    assert.equal(await page.isVisible('#fg-aibox'), true);
    await page.fill('#fg-brief', 'Grade 7, area and volume of rectangles, prisms and cylinders, plus one box plot.');
    await page.selectOption('#fg-count', '5');
    await page.click('[data-act="draft"]');
    await page.waitForSelector('.fg-item:nth-child(5)');
    assert.match(page.url(), /\/figures\/worksheets\/[A-Za-z0-9]+$/);
    assert.match(await page.textContent('#fg-note'), /5 questions drafted[\s\S]*1 figure couldn't be drawn and was replaced/);
    const answers = await page.$$eval('.fg-ians b', bs => bs.map(b => b.textContent));
    assert.equal(answers[0], '12 m²'); assert.equal(answers[1], '30 in³'); assert.equal(answers[4], '11');
    assert.match(await page.inputValue('#fg-title'), /Area and volume practice/);
    await shot(page, 'worksheet-builder-ai-mocked');
    await shot(page, 'worksheet-builder-ai-mocked-full', true);
    // reorder and new numbers
    const first = await page.$eval('.fg-item', li => li.dataset.id);
    await page.click(`.fg-item[data-id="${first}"] [data-act="down"]`);
    await page.waitForFunction(id => document.querySelectorAll('.fg-item')[1].dataset.id === id, first);
    await Promise.all([page.waitForResponse(r => /\/regen$/.test(r.url()) && r.status() === 200), page.click('.fg-item:nth-child(3) [data-act="regen"]')]);
    await page.click('[data-tab="key"]');
    assert.match(await page.innerHTML('#fg-paper'), /12 m²/);
    await page.click('[data-tab="sheet"]');
    assert.doesNotMatch(await page.innerHTML('#fg-paper'), /12 m²/);
    assert.equal(await page.isDisabled('.fg-assign button'), true, 'assigning is next');
    const id = page.url().split('/').pop();
    await page.goto(`${BASE}/figures/worksheets/${id}/print?key=0`);
    await page.waitForSelector('.fgp');
    await shot(page, 'print-student-sheet', true);
    await page.goto(`${BASE}/figures/worksheets/${id}/print?key=1`);
    await page.waitForSelector('.fgp-key');
    if (SHOTS) await page.addStyleTag({ content: '.topbar,.tabbar{display:none!important}' });
    if (SHOTS) await page.locator('.fgp-key').screenshot({ path: `${SHOTS}/print-answer-key.png` });
    await page.emulateMedia({ media: 'print' });
    assert.equal(await page.isHidden('.fg-printbar'), true, 'the print bar is not printed');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { F.hooks.create = null; }
});

test('editors for a kind from data, physics and chemistry draw without errors', { skip }, async () => {
  for (const [kind, name] of [['boxPlot', 'editor-data-boxplot'], ['projectile', 'editor-physics-projectile'], ['bohr', 'editor-chem-bohr']]) {
    const { ctx, page, errors } = await open(`/figures/${kind}`);
    await page.waitForSelector('#fg-figure svg');
    assert.equal(await page.isHidden('#fg-cant'), true, kind);
    if (kind !== 'bohr') { await page.click('[data-act="random"]'); await page.waitForFunction(() => document.getElementById('fg-question').value.length > 5); }
    else await page.selectOption('#fg-f-element', 'Mg');
    await page.waitForTimeout(150);
    await shot(page, name);
    assert.deepEqual(errors, [], kind);
    await ctx.close();
  }
});
test('the 1.2.0 chemistry editors (each new kind, and the lab readings) draw without errors and make new questions', { skip }, async () => {
  for (const kind of ['massSpectrum', 'heatingCurve', 'energyProfile', 'nuclide', 'lineSpectrum', 'photoelectron', 'particles', 'reading']) {
    const { ctx, page, errors } = await open(`/figures/${kind}`);
    await page.waitForSelector('#fg-figure svg');
    assert.equal(await page.isHidden('#fg-cant'), true, kind);
    await page.click('[data-act="random"]'); await page.waitForFunction(() => document.getElementById('fg-question').value.length > 5);
    await page.waitForTimeout(150);
    assert.equal(await page.isHidden('#fg-cant'), true, `${kind}: a new question draws`);
    await shot(page, `editor-chem-${kind}`);
    assert.deepEqual(errors, [], kind);
    await ctx.close();
  }
});
