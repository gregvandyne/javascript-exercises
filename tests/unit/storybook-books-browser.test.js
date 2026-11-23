// Your books as cards, in a real browser (docs/storybook-builder.md "Your books"). On a laptop and a 390 px phone: the
// teacher's books are the library's cards with their pictures; the More menu opens inside the screen; Rename in place;
// Duplicate adds the copy's card; Delete asks in the site's own dialog, then Undo brings the card back, and without Undo
// the book is deleted; a book whose first draft never came says so; the Oomba chat's Delete / Keep card. No console
// errors, no sideways scroll. The chat's AI is a stand-in, the book's AI the built-in stand-in, Google the picture
// stand-in (tests/support/fake-gemini.js).
// MY_BOOKS_SHOTS=<dir> also saves mb-1 ... mb-5 (deviceScaleFactor 1).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const CO = await import('../../server/services/companion.js');
const SB = await import('../../server/services/storybook.js');
const C = await import('../../server/services/oomba-chat.js');
const D = await import('../../server/services/storybook-draw.js');
const G = await import('../../server/services/storybook-gemini.js');
const RL = await import('../../server/services/ratelimit.js');
const { fakeGemini } = await import('../support/fake-gemini.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MY_BOOKS_SHOTS || '';

const boss = createUser({ username: 'MyBooksBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
let k = 0;
function teacher(name) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const c = S.createClass(boss, oak.id, { name: `2B ${++k}`, grade: '2', teacherId: u.id }).class;
  return { u, c };
}
const cookieOf = id => { let c = ''; startSession({ append: (kk, v) => { c = v.split(';')[0]; } }, id); return c; };
const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 30)); await D.settle(); };
/** A book with its first draft and its painted pictures, as the teacher made it. */
async function madeBook(u, title, setup = {}) {
  const r = await SB.createBook(u, { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', pictures: 'ai', about: title, ...setup });
  assert.ok(r.ok, JSON.stringify(r));
  const row = SB.ownBook(u, r.id), w = await SB.writeBook(u, row, { text: '' });
  SB.applyBook(u, r.id, SB.bookOf(row), w.book, {});
  SB.renameBook(u, r.id, title);
  await settle();
  return r.id;
}

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  Object.assign(config, { storybookPlanPerDay: 60, storybookPicturesPlanPerDay: 200, storybookPicturesFreePerDay: 200, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  fakeGemini(G);
  D.hooks.screenImage = async () => 'allow'; SB.hooks.classify = async () => null;
});
test.after(async () => { CO.hooks.create = null; G.hooks.generate = null; D.hooks.screenImage = null; SB.hooks.classify = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => { RL._reset(); q.run('DELETE FROM made_book_ai_days'); });

const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = () => ({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
async function open(who, p, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: 'light' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
const inView = async (page, sel) => { const b = await page.locator(sel).boundingBox(); const w = await page.evaluate(() => document.documentElement.clientWidth); assert.ok(b && b.x >= 0 && b.x + b.width <= w + 1, `${sel} inside the screen: ${JSON.stringify(b)}`); };

let demo;
async function demoBooks() {
  if (demo) return demo;
  const { u, c } = teacher('Rosa Reading');
  const milo = await madeBook(u, 'Milo and Zig Take Over the World');
  const kip = await madeBook(u, 'Kip and the Color King', { kind: 'cyoa', endings: 2, grade: '3' });
  const owl = await madeBook(u, 'The Quiet Owl', { grade: '1' });
  SB.setShared(u, milo, [c.id]);
  // a book whose first draft never came (the "Untitled book · 0 pages" row)
  const empty = (await SB.createBook(u, { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', about: 'a rainy day' })).id;
  q.run('UPDATE made_books SET updated_at=updated_at-1 WHERE id=?', empty);
  demo = { u, c, milo, kip, owl, empty };
  return demo;
}

test('laptop: the library shows Your books as the library\'s cards; Rename in place; Duplicate; Delete with the site\'s dialog and Undo', { skip }, async () => {
  const { u, milo, kip, empty } = await demoBooks();
  const { ctx, page, errors } = await open(u, '/library', LAPTOP);
  try {
    const cards = page.locator('#sb-books .sb-bcard');
    assert.equal(await cards.count(), 4);
    assert.ok(await page.locator(`.sb-bcard[data-book="${milo}"] .sb-bcover img.sb-art`).isVisible(), 'the painted first page is the cover');
    assert.match(await page.locator(`.sb-bcard[data-book="${milo}"] .lb-meta`).textContent(), /pages · .+ · shared with 1 class/);
    assert.match(await page.locator(`.sb-bcard[data-book="${empty}"]`).textContent(), /Didn't finish/);
    // the same card as the library's books: as wide, the same cover shape
    const mine = await page.locator(`.sb-bcard[data-book="${milo}"]`).boundingBox(), lib = await page.locator('#lb-grid .lb-card').first().boundingBox();
    assert.ok(Math.abs(mine.width - lib.width) < 2, `same width: ${mine.width} ${lib.width}`);
    await noSideScroll(page);
    await page.locator('#lb-made-h').scrollIntoViewIfNeeded();
    await shot(page, 'mb-1-cards');
    // Rename in place
    await page.click(`.sb-bcard[data-book="${kip}"] .sb-bmore-btn`);
    await page.click(`.sb-bcard[data-book="${kip}"] [data-b="rename"]`);
    await page.fill(`.sb-bcard[data-book="${kip}"] .sb-brename input`, 'Kip and the Rainbow');
    await page.keyboard.press('Enter');
    await page.locator(`.sb-bcard[data-book="${kip}"] .lb-title a`, { hasText: 'Kip and the Rainbow' }).waitFor();
    assert.equal(SB.ownBook(u, kip).title, 'Kip and the Rainbow');
    // Duplicate: the copy's card first
    await page.click(`.sb-bcard[data-book="${kip}"] .sb-bmore-btn`);
    await page.click(`.sb-bcard[data-book="${kip}"] [data-b="duplicate"]`);
    await page.locator('#sb-books .sb-bcard.is-new').waitFor();
    assert.match(await page.locator('#sb-books .sb-bcard').first().textContent(), /Kip and the Rainbow \(copy\)/);
    const copy = await page.locator('#sb-books .sb-bcard').first().getAttribute('data-book');
    // Delete: the site's dialog, then Undo brings the card back and nothing is deleted
    await page.click(`.sb-bcard[data-book="${copy}"] .sb-bmore-btn`);
    await page.click(`.sb-bcard[data-book="${copy}"] [data-b="delete"]`);
    await page.locator('dialog.ob-dialog[open]').waitFor();
    assert.match(await page.locator('dialog.ob-dialog').textContent(), /Delete “Kip and the Rainbow \(copy\)”\?/);
    await page.click('dialog.ob-dialog [data-ob="ok"]');
    await page.locator('.sb-undo:not([hidden])').waitFor();
    assert.equal(await page.locator(`.sb-bcard[data-book="${copy}"]`).isVisible(), false);
    await page.click('.sb-undobtn');
    assert.ok(await page.locator(`.sb-bcard[data-book="${copy}"]`).isVisible());
    await new Promise(r => setTimeout(r, 6500));
    assert.ok(SB.ownBook(u, copy), 'Undo: still there');
    // and without Undo: deleted when the message ends
    await page.click(`.sb-bcard[data-book="${copy}"] .sb-bmore-btn`);
    await page.click(`.sb-bcard[data-book="${copy}"] [data-b="delete"]`);
    await page.click('dialog.ob-dialog [data-ob="ok"]');
    const t0 = Date.now();
    while (SB.ownBook(u, copy) && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 100));
    assert.equal(SB.ownBook(u, copy), null, 'deleted');
    assert.equal(q.get('SELECT COUNT(*) n FROM made_book_pics WHERE book_id=?', copy).n, 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('phone (390 px): the cards two to a row, no sideways scroll; the More menu inside the screen; the delete dialog', { skip }, async () => {
  const { u, milo, owl } = await demoBooks();
  const { ctx, page, errors } = await open(u, '/library/make', PHONE());
  try {
    await page.locator('#sb-books .sb-bcard').first().waitFor();
    const [a, b] = await Promise.all([0, 1].map(i => page.locator('#sb-books .sb-bcard').nth(i).boundingBox()));
    assert.ok(Math.abs(a.y - b.y) < 2 && b.x > a.x, 'two to a row');
    await noSideScroll(page);
    await shot(page, 'mb-2-phone');
    // the first column's menu opens toward the room it has
    const first = await page.locator('#sb-books .sb-bcard:not(.is-unfinished)').first().getAttribute('data-book');
    await page.click(`.sb-bcard[data-book="${first}"] .sb-bmore-btn`);
    await page.locator(`.sb-bcard[data-book="${first}"] .sb-bmenu`).waitFor();
    await inView(page, `.sb-bcard[data-book="${first}"] .sb-bmenu`);
    await noSideScroll(page);
    await shot(page, 'mb-3-more');
    // the second column's menu too
    await page.keyboard.press('Escape');
    const second = await page.locator('#sb-books .sb-bcard:not(.is-unfinished)').nth(1).getAttribute('data-book');
    await page.click(`.sb-bcard[data-book="${second}"] .sb-bmore-btn`);
    await inView(page, `.sb-bcard[data-book="${second}"] .sb-bmenu`);
    await page.click(`.sb-bcard[data-book="${second}"] [data-b="delete"]`);
    await page.locator('dialog.ob-dialog[open]').waitFor();
    await page.waitForTimeout(500);   // the dialog's fade-in
    await shot(page, 'mb-4-delete');
    await page.click('dialog.ob-dialog [data-ob="cancel"]');
    assert.ok(await page.locator(`.sb-bcard[data-book="${second}"]`).isVisible(), 'Cancel keeps it');
    assert.ok(SB.ownBook(u, milo) && SB.ownBook(u, owl));
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('the Oomba chat: "delete my Kip book" shows Delete / Keep; Delete removes the book and its card', { skip }, async () => {
  const { u, kip } = await demoBooks();
  CO.hooks.create = async p => {
    const last = p.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const base = { model: p.model, usage: { input_tokens: 5, output_tokens: 5 } };
    if (afterTool) return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Tap Delete on the card if you are sure. Nothing is deleted until you do.' }] };
    if (/delete my kip/i.test(typeof last.content === 'string' ? last.content : '')) return { ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'deleteBook', input: { which: 'Kip' } }] };
    return { ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Okay.' }] };
  };
  const { ctx, page, errors } = await open(u, '/library/make', LAPTOP);
  try {
    if (!(await page.locator('#oc:not([hidden])').isVisible())) await page.click('#oc-bubble');
    await page.fill('#oc-in', 'delete my Kip book');
    await page.click('#oc-send');
    await page.locator('.oc-bdel:not(.done)').waitFor({ timeout: 15000 });
    assert.match(await page.locator('.oc-bdel').textContent(), /Delete “Kip and the Rainbow”\?/);
    assert.ok(SB.ownBook(u, kip), 'nothing deleted yet');
    await shot(page, 'mb-5-chat-delete');
    await page.click('.oc-bdel [data-act="bookDelete"]');
    await page.locator('.oc-bdel.done').waitFor();
    assert.equal(SB.ownBook(u, kip), null);
    assert.equal(await page.locator(`.sb-bcard[data-book="${kip}"]`).count(), 0, 'its card goes too');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
