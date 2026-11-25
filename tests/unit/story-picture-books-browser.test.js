// Story Builder picture books in a real browser (docs/story-builder.md "Picture books"): a teacher's /stories/new starts
// with Video story, Illustrated picture book and Choose-your-own-adventure picture book; picking a book hides the video's
// own choices; Continue in the book maker opens the Oomba chat on /library with the book card pre-filled (it asks only
// the rest). A kid sees the video form only. A 390 px phone fits. No console errors, no sideways scroll. The chat's AI is
// never called (the hand-off and the taps need none).
// PICTURE_BOOK_SHOTS=<dir> also saves sp-1-teacher, sp-2-kid, sp-3-handoff, sp-4-phone (deviceScaleFactor 1).
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
const RL = await import('../../server/services/ratelimit.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.PICTURE_BOOK_SHOTS || '';

const boss = createUser({ username: 'PicBookBrowserBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
let k = 0;
function teacher(name) {
  const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
  config.manipulativesUsers = [...config.manipulativesUsers, u.username.toLowerCase()];
  S.createClass(boss, oak.id, { name: `2B ${++k}`, grade: '2', teacherId: u.id });
  return u;
}
const cookieOf = id => { let c = ''; startSession({ append: (kk, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE, browser;
const old = { on: config.storyBuilder, books: config.storyPictureBooks };
test.before(async () => {
  if (skip) return;
  config.storyBuilder = true; config.storyPictureBooks = ['teacher'];
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { config.storyBuilder = old.on; config.storyPictureBooks = old.books; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => { RL._reset(); q.run('DELETE FROM made_book_ai_days'); });

const LAPTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 };
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
const shot = async (page, name, opts = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...opts }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');
const bookCard = page => page.locator('.oc-book:not(.done)').last();
const IDEA = 'A shy turtle who finds the way home across the coral reef';

test('laptop: a teacher sees three choices; a picture book hides the video\'s choices; the hand-off opens the chat card pre-filled', { skip }, async () => {
  const u = teacher('Pia Pages');
  const { ctx, page, errors } = await open(u, '/stories/new', LAPTOP);
  try {
    const cards = page.locator('#sb-make .sb-choice');
    assert.equal(await cards.count(), 3);
    assert.deepEqual((await page.locator('#sb-make .sb-lbl').allTextContents()).map(s => s.trim()), ['Video story', 'Illustrated picture book', 'Choose-your-own-adventure picture book']);
    assert.ok(await page.locator('#sb-voice').isVisible(), 'the video\'s narrator choice while the video is picked');
    await noSideScroll(page);
    await shot(page, 'sp-1-teacher');
    await page.click('label[for="sb-make-cyoa"]');
    assert.ok(!(await page.locator('#sb-voice').isVisible()), 'no narrator for a book');
    assert.ok(!(await page.locator('#sb-music').isVisible()), 'no music for a book');
    assert.match(await page.locator('#sb-go').textContent(), /Continue in the book maker/);
    await page.fill('#sb-idea', IDEA);
    await page.click('label[for="sb-style-adventure"]');
    await page.click('label[for="sb-tone-brave"]');
    await page.click('.sb-more > summary');
    await page.selectOption('#sb-age', '6-8');
    await page.selectOption('#sb-blen', 'medium');
    await page.click('#sb-go');
    await page.waitForURL(/\/read$/, { timeout: 15000 });
    await bookCard(page).waitFor({ timeout: 15000 });
    const text = await bookCard(page).textContent();
    assert.match(text, /How many endings\?|endings/i, 'it asks the endings next');
    for (const s of ['Have AI make one', 'Choose-your-own-adventure', 'Grade 2', 'Medium', 'Oomba paints them']) assert.ok(text.includes(s), s);
    assert.doesNotMatch(text, /Upload your own book/, 'the start is not asked again');
    await noSideScroll(page);
    await shot(page, 'sp-3-handoff');
    assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
  } finally { CO.reset(u); await ctx.close(); }
});

test('laptop: a kid sees the video story form only', { skip }, async () => {
  const kid = getUser(createUser({ username: 'PicKidBrowser', password: 'rainbow-77' }).id);
  const { ctx, page, errors } = await open(kid, '/stories/new', LAPTOP);
  try {
    assert.equal(await page.locator('#sb-make').count(), 0);
    assert.equal(await page.locator('input[name="make"]').count(), 0);
    assert.ok(await page.locator('#sb-voice').isVisible());
    assert.match(await page.locator('#sb-go').textContent(), /Make my story/);
    await noSideScroll(page);
    await shot(page, 'sp-2-kid');
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});

test('phone (390 px): the three choices fit, one under the other', { skip }, async () => {
  const u = teacher('Pia Phone');
  const { ctx, page, errors } = await open(u, '/stories/new', PHONE());
  try {
    const boxes = await page.locator('#sb-make .sb-choice').evaluateAll(els => els.map(e => e.getBoundingClientRect()).map(r => ({ x: r.x, y: r.y, w: r.width })));
    assert.equal(boxes.length, 3);
    assert.ok(boxes[1].y > boxes[0].y && boxes[2].y > boxes[1].y, 'stacked');
    assert.ok(boxes.every(b => b.x >= 0 && b.x + b.w <= 390), 'inside the screen');
    await page.click('label[for="sb-make-book"]');
    await noSideScroll(page);
    await shot(page, 'sp-4-phone');
    assert.deepEqual(errors.filter(e => !/Permissions check failed/i.test(e)), []);
  } finally { await ctx.close(); }
});
