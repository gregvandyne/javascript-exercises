// Story Library "What would you like to read today?" in a real browser (docs/decisions.md "Story Library: book
// suggestions"): a reader types a wish, the stand-in model (services/library-suggest.js hooks.create) picks books, and
// they show as the library's own cards under "Books for you"; "All books" brings the grid back; a screened wish says
// "Let's try different words"; on a phone nothing scrolls sideways. LIBRARY_SHOTS=<dir> also saves pictures. Skipped
// when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const LIB = await import('../../server/services/library.js');
const SUG = await import('../../server/services/library-suggest.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.LIBRARY_SHOTS || '';

seed({ quiet: true });
const s = librarySeed({ book: null });
const [ava] = s.kids;
const PICKS = ['sw-0026', 'sw-0001', 'sw-0069'];
const asked = [];

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  SUG.hooks.screen = null;
  SUG.hooks.create = async params => {
    asked.push(params.messages[0].content);
    return { model: 'claude-haiku-5-5', stop_reason: 'end_turn', usage: { input_tokens: 40, output_tokens: 20 },
      content: [{ type: 'text', text: JSON.stringify({ ids: [...PICKS, 'not-a-book'] }) }] };
  };
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { SUG.hooks.create = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, ctxOpts = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 }) {
  const ctx = await browser.newContext(ctxOpts);
  if (who) { const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]); }
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(300); await page.screenshot({ path: `${SHOTS}/${name}.png` }); };

test('a wish shows the chosen books as library cards; All books brings the grid back', { skip }, async () => {
  const { ctx, page, errors } = await open(ava, '/library');
  await page.waitForSelector('#lb-wish:not([hidden])');
  assert.equal(await page.textContent('.lb-wish-label').then(t => t.trim()), '✨ What would you like to read today?');
  assert.equal(await page.getAttribute('#lb-wish-q', 'placeholder'), 'dinosaurs, a funny story, something about space...');
  await shot(page, 'wish-box-desktop');
  await page.fill('#lb-wish-q', 'a funny story about animals');
  await page.click('#lb-wish-go');
  await page.waitForSelector('#lb-wish-out:not([hidden]) .lb-card');
  assert.match(asked.at(-1), /<request>\na funny story about animals\n<\/request>/);
  assert.equal(await page.textContent('#lb-wish-h').then(t => t.trim()), '🎁 Books for you');
  assert.deepEqual(await page.$$eval('#lb-wish-grid .lb-title', els => els.map(e => e.textContent.trim())), PICKS.map(id => LIB.getBook(id).title));
  assert.equal(await page.textContent('#lb-wish-note'), 'We found 3 books for you.');
  assert.equal(await page.isVisible('#lb-grid'), false, 'the full grid steps aside');
  assert.equal(await page.isVisible('.lb-tools'), false);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(page, 'wish-result-desktop');
  // A card works like any library card.
  assert.equal(await page.getAttribute('#lb-wish-grid .lb-card >> nth=0 >> a.btn-primary', 'href'), `/library/${PICKS[0]}/read`);
  await page.click('#lb-wish-back');
  assert.equal(await page.isVisible('#lb-wish-out'), false);
  assert.equal(await page.locator('#lb-grid .lb-card').count(), LIB.books().length);
  assert.equal(await page.isVisible('.lb-tools'), true);
  // A screened wish: kind words, no books.
  await page.fill('#lb-wish-q', 'shit');
  await page.click('#lb-wish-go');
  await page.waitForSelector('#lb-wish-out.is-refused:not([hidden])');
  assert.match(await page.textContent('#lb-wish-note'), /^Let's try different words/);
  assert.equal(await page.locator('#lb-wish-grid .lb-card').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phones: the box and the books fit with no sideways scroll', { skip }, async () => {
  for (const dev of ['iPhone 13', 'Galaxy S9+']) {
    const { ctx, page, errors } = await open(null, '/library', { ...devices[dev] });
    await page.waitForSelector('#lb-wish:not([hidden])');
    assert.ok(await noSideways(page), `${dev} box`);
    const box = await page.$eval('#lb-wish-go', el => el.getBoundingClientRect().width);
    assert.ok(box > 200, `${dev}: the button is full width (${box})`);
    if (dev === 'iPhone 13') await shot(page, 'wish-box-phone');
    await page.fill('#lb-wish-q', 'something about space');
    await page.click('#lb-wish-go');
    await page.waitForSelector('#lb-wish-out:not([hidden]) .lb-card');
    assert.ok(await noSideways(page), `${dev} books`);
    const cols = await page.$$eval('#lb-wish-grid .lb-card', els => new Set(els.slice(0, 2).map(e => Math.round(e.getBoundingClientRect().left))).size);
    assert.equal(cols, 2, 'two columns like the library');
    if (dev === 'iPhone 13') { await page.evaluate(() => window.scrollTo(0, 0)); await shot(page, 'wish-result-phone'); }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
