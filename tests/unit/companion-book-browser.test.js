// The book maker in the Oomba chat, in a real browser (docs/decisions.md "The book maker in the Oomba chat"). On a laptop
// and a 390 px phone: Make a book opens the chat with the first card; a request skips what it answered; the cards; the
// teacher's notes and a file go into the book ("Adding to your book"); the check card with Edit and Make my book; the
// first draft in the same chat, Open the book; on the book page the same chat (no second panel) changes the book, with
// Undo; an adventure with every page painted; a book made in the past changed from another page after a choice card.
// No console errors, no sideways scroll. The chat's AI is a stand-in (services/companion.js hooks.create), the book's AI
// the built-in stand-in (no key), Google the picture stand-in (tests/support/fake-gemini.js).
// COMPANION_BOOK_SHOTS=<dir> also saves the pictures cb-1 ... cb-10 (deviceScaleFactor 1).
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
const SHOTS = process.env.COMPANION_BOOK_SHOTS || '';

const boss = createUser({ username: 'BookBrowserBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
let k = 0;
function teacher(name) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  const c = S.createClass(boss, oak.id, { name: `3B ${++k}`, grade: '3', teacherId: u.id }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Quinn Marsh' }).user.id); S.addToClass(boss, c.id, kid.id);
  return u;
}
const cookieOf = id => { let c = ''; startSession({ append: (kk, v) => { c = v.split(';')[0]; } }, id); return c; };
const ASK = 'Make a choose your own adventure for grade 3';

/** The chat's AI: a book request calls makeBook; a change calls changeBook (the dragon one by its name). */
function ai() {
  CO.hooks.create = async p => {
    const last = p.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const said = typeof last.content === 'string' ? last.content : '';
    const base = { model: p.model, usage: { input_tokens: 5, output_tokens: 5 } };
    const tool = (name, input) => ({ ...base, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${Math.random().toString(36).slice(2, 8)}`, name, input }] });
    const text = s => ({ ...base, stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
    if (afterTool) {
      const r = JSON.parse(last.content.find(c => c.type === 'tool_result').content);
      return text(r.askedWhich ? 'Which book do you mean?' : 'Answer a few quick questions on the card, then check what I will send before anything is made.');
    }
    if (/adventure for grade/i.test(said)) return tool('makeBook', { source: 'ai', kind: 'cyoa', grade: '3' });
    if (/dragon/i.test(said)) return tool('changeBook', { request: 'Use simpler words on page 2.', which: 'dragon adventure' });
    if (/simpler|scarier|ending/i.test(said)) return tool('changeBook', { request: said });
    return text('Okay.');
  };
}

let server, BASE, browser, fake;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  Object.assign(config, { storybookPlanPerDay: 60, storybookPicturesPlanPerDay: 80, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  fake = fakeGemini(G);
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
const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 30)); await D.settle(); };
async function say(page, words) {
  if (!(await page.locator('#oc:not([hidden])').isVisible())) await page.click('#oc-bubble');
  await page.fill('#oc-in', words);
  await page.click('#oc-send');
}
const bookCard = page => page.locator('.oc-book:not(.done)').last();
async function pick(page, label) {
  const b = bookCard(page).locator('[data-act="bookPick"]', { hasText: label }).first();
  await b.waitFor({ timeout: 10000 });
  const v0 = await bookCard(page).getAttribute('aria-label');
  await b.click();
  await page.waitForFunction(v => { const c = [...document.querySelectorAll('.oc-book:not(.done)')].pop(); return c && c.getAttribute('aria-label') !== v; }, v0, { timeout: 10000 });
}

test('laptop: a request skips what it answered, the cards, notes and a file, the check, Make my book, Open the book, the book page\'s chat', { skip }, async () => {
  const u = teacher('Greg Books');
  ai();
  const { ctx, page, errors } = await open(u, '/read', LAPTOP);
  try {
    await say(page, ASK);
    await bookCard(page).waitFor({ timeout: 15000 });
    assert.match(await bookCard(page).textContent(), /Length/);
    assert.match(await bookCard(page).textContent(), /Have AI make one · Choose-your-own-adventure · Grade 3/);
    await noSideScroll(page);
    await shot(page, 'cb-1-ask');
    await pick(page, 'Short'); await pick(page, '3');
    await shot(page, 'cb-2-cards');
    await pick(page, 'Growing reader'); await pick(page, 'No theme'); await pick(page, 'Oomba paints them');
    // Your words: typed notes and a file go into the book, never to the AI
    await page.locator('#oc-bookmode:not([hidden])').waitFor();
    assert.match(await page.locator('#oc-bookmode').textContent(), /Adding to your book/);
    // No Check button (the owner, 23 Nov 2026): the card at Your words has none; sending goes straight on to the check.
    assert.equal(await bookCard(page).locator('[data-act="bookCheck"]', { hasText: /Check/ }).count(), 0, 'no Check button');
    await shot(page, 'cb-3-attach');
    await say(page, 'The water cycle, told by a raindrop called Drip who travels from a puddle to a cloud.');
    await page.locator('.oc-bcheck [data-act="bookStart"]:not([disabled])').last().waitFor({ timeout: 15000 });
    // Still adding to the book at the check: a file goes in and the card checks again
    assert.match(await page.locator('#oc-bookmode').textContent(), /Adding to your book/);
    await page.setInputFiles('#oc-file', { name: 'raindrop-notes.txt', mimeType: 'text/plain', buffer: Buffer.from('Evaporation: the sun warms the water. Condensation: clouds form. Precipitation: rain falls back down.') });
    await page.locator('.oc-bcheck', { hasText: 'raindrop-notes.txt' }).last().waitFor({ timeout: 15000 });
    const check = page.locator('.oc-bcheck').last();
    await check.locator('[data-act="bookStart"]:not([disabled])').waitFor({ timeout: 15000 });
    assert.match(await check.textContent(), /raindrop called Drip/);
    assert.match(await check.textContent(), /raindrop-notes\.txt/);
    assert.match(await check.textContent(), /Never include students' names or their work/);
    assert.ok(await check.locator('[data-act="bookEdit"]').count() >= 5, 'Edit for every part');
    assert.equal(SB.myBooks(u).length, 0, 'nothing made before Make my book');
    await check.evaluate(el => el.scrollIntoView({ block: 'start' }));
    await shot(page, 'cb-4-check');
    await check.locator('[data-act="bookStart"]').click();
    const openBook = page.locator('.oc-msg.bot a', { hasText: 'Open the book' }).last();
    await openBook.waitFor({ timeout: 15000 });
    await settle();
    const [row] = SB.myBooks(u);
    assert.ok(row); assert.equal(row.kind, 'cyoa');
    await page.locator('.oc-change', { hasText: 'A new adventure' }).waitFor({ timeout: 15000 });
    await shot(page, 'cb-5-started');
    // the book page: Open the book shows the book with the chat closed to its bubble (the owner, 24 Nov 2026); a tap on
    // the bubble brings back the same chat (one only), and a change there has Undo
    await Promise.all([page.waitForURL(new RegExp(`/library/make/${row.id}`)), openBook.click()]);
    await page.locator('#oc-bubble:not([hidden])').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('#oc:not([hidden])').count(), 0, 'the chat is closed: the book shows');
    await page.click('#oc-bubble');
    await page.locator('#oc:not([hidden])').waitFor({ timeout: 10000 });
    assert.equal(await page.locator('#oc').count(), 1, 'one chat only');
    await page.locator('#oc-log .oc-change', { hasText: 'A new adventure' }).waitFor();
    await say(page, 'Use simpler words on page 2');
    await page.locator('.oc-change', { hasText: 'Changed pages' }).last().waitFor({ timeout: 20000 });
    await settle();
    assert.ok(await page.locator('.oc-change button', { hasText: 'Undo' }).last().isVisible());
    await page.waitForTimeout(400);
    await noSideScroll(page);
    await shot(page, 'cb-9-book-chat');
    // every page of the adventure painted: the story map and the page list show them
    await page.reload(); await page.locator('#sb-map').waitFor();
    await page.locator('#oc:not([hidden])').waitFor({ timeout: 10000 });
    const book = SB.bookOf(SB.ownBook(u, row.id));
    const st = D.stateOf(u, SB.ownBook(u, row.id));
    assert.equal(Object.values(st.pages).filter(x => x.state === 'done' && x.pic).length, book.pages.length, 'every page painted, every ending too');
    await page.click('#oc [data-c="close"]').catch(() => {});
    await page.waitForTimeout(300);
    await shot(page, 'cb-7-cyoa-pictures');
    assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
  } finally { await settle(); CO.reset(u); await ctx.close(); }
});

test('phone (390 px): Make a book on the library opens the chat sheet with the first card; the check card fits', { skip }, async () => {
  const u = teacher('Pia Phone');
  ai();
  const { ctx, page, errors } = await open(u, '/read', PHONE());
  try {
    await page.click('#lb-make');
    await bookCard(page).waitFor({ timeout: 15000 });
    assert.match(await bookCard(page).textContent(), /Upload your own book/);
    assert.match(await bookCard(page).textContent(), /Have AI make one/);
    assert.match(page.url(), /\/read$/, 'no page change');
    await noSideScroll(page);
    await shot(page, 'cb-8-library-phone');
    await pick(page, 'Have AI make one'); await pick(page, 'Picture book');
    await pick(page, 'Grade 2'); await pick(page, 'Short'); await pick(page, 'Early reader'); await pick(page, 'Animals'); await pick(page, 'Oomba paints them');
    await say(page, 'A shy hedgehog learns to share apples with the other animals in the woods.');
    await page.locator('.oc-bcheck [data-act="bookStart"]:not([disabled])').last().waitFor({ timeout: 15000 });
    await noSideScroll(page);
    await shot(page, 'cb-6-phone');
    assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
  } finally { await settle(); CO.reset(u); await ctx.close(); }
});

test('the theme: Something else opens a box beside Stop; Use this theme (on from 2 letters) goes on with the teacher\'s own theme', { skip }, async () => {
  const u = teacher('Theo Theme');
  ai();
  for (const [label, opts] of [['laptop', LAPTOP], ['phone', PHONE()]]) {
    const { ctx, page, errors } = await open(u, '/read', opts);
    try {
      await page.click('#lb-make');
      await bookCard(page).waitFor({ timeout: 15000 });
      await pick(page, 'Have AI make one'); await pick(page, 'Picture book'); await pick(page, 'Grade 3'); await pick(page, 'Medium'); await pick(page, 'Growing reader');
      const other = bookCard(page).locator('[data-act="bookOther"]');
      await other.waitFor({ timeout: 10000 });
      const form = bookCard(page).locator('.oc-btheme');
      assert.equal(await form.isVisible(), false, 'the box waits for Something else');
      await other.click();
      await form.waitFor({ state: 'visible' });
      assert.equal(await other.getAttribute('aria-expanded'), 'true');
      assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.closest('.oc-btheme') !== null), true, 'the box has the focus');
      const go = form.locator('button[type="submit"]');
      await page.keyboard.type('P'); assert.equal(await go.isDisabled(), true, 'one letter is not a theme');
      await page.keyboard.type('irates and treasure'); assert.equal(await go.isDisabled(), false);
      const fb = await form.boundingBox(), sb = await bookCard(page).locator('[data-act="bookStop"]').boundingBox();
      assert.ok(fb.y + fb.height <= sb.y + 2, 'in the foot, above Stop');
      await noSideScroll(page);
      await shot(page, `cb-11-theme-${label}`);
      const v0 = await bookCard(page).getAttribute('aria-label');
      await page.keyboard.press('Enter');
      await page.waitForFunction(v => { const c = [...document.querySelectorAll('.oc-book:not(.done)')].pop(); return c && c.getAttribute('aria-label') !== v; }, v0, { timeout: 10000 });
      assert.match(await bookCard(page).textContent(), /Oomba paints them/, 'on to the pictures');
      assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
      await bookCard(page).locator('[data-act="bookStop"]').click();
    } finally { await settle(); CO.reset(u); await ctx.close(); }
  }
});

test('laptop: a book made in the past, changed from another page: a choice card of the teacher\'s books, the change, Open the book', { skip }, async () => {
  const u = teacher('Dana Past');
  ai();
  const ids = [];
  for (const title of ['Dragon Adventure', 'Dragon Adventure at Sea']) {
    const r = await SB.createBook(u, { source: 'ai', kind: 'cyoa', grade: '2', length: 'short', endings: 2, level: 'growing', pictures: 'own', about: 'a friendly dragon' });
    const row = SB.ownBook(u, r.id), w = await SB.writeBook(u, row, { text: '' });
    SB.applyBook(u, r.id, SB.bookOf(row), w.book, {});
    q.run('UPDATE made_books SET title=?, updated_at=? WHERE id=?', title, Date.now() - (ids.length + 3) * 86400e3, r.id);
    ids.push(r.id);
  }
  const { ctx, page, errors } = await open(u, '/teach?all=1', LAPTOP);
  try {
    await say(page, 'Make page 2 of the dragon adventure simpler');
    const ask = page.locator('.oc-ask:not(.done)').last();
    await ask.waitFor({ timeout: 15000 });
    assert.match(await ask.textContent(), /Which book\?/);
    assert.match(await ask.textContent(), /Dragon Adventure at Sea/);
    const rev = SB.ownBook(u, ids[1]).rev;
    await ask.locator('[data-act="askPick"]', { hasText: 'at Sea' }).click();
    await page.locator('.oc-change', { hasText: 'Changed pages' }).last().waitFor({ timeout: 20000 });
    assert.ok(SB.ownBook(u, ids[1]).rev > rev, 'the picked book changed');
    const link = page.locator('.oc-change a', { hasText: 'Open the book' }).last();
    assert.equal(await link.getAttribute('href'), `/library/make/${ids[1]}`);
    await noSideScroll(page);
    await shot(page, 'cb-10-past-book');
    assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
  } finally { await settle(); CO.reset(u); await ctx.close(); }
});
