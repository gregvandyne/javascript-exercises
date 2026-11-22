// Story Library in a real browser (docs/decisions.md "Story Library"): the US grade filter and search, reading a book to
// the end with Back / Next, Read to me lighting up each word as it is spoken (a stand-in speechSynthesis that fires word
// boundaries), the questions (a wrong answer says "Try again! Look at page N" and opens that page; then the right
// one), a teacher assigning a book and seeing the class's results, and the phone layout (no sideways scroll, Next in
// reach above the tab bar). LIBRARY_SHOTS=<dir> also saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const LIB = await import('../../server/services/library.js');
const P = await import('../../server/services/progress.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.LIBRARY_SHOTS || '';

seed({ quiet: true });
const s = librarySeed({ book: null });
const [ava, leo] = s.kids;

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, ctxOpts = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 }) {
  const ctx = await browser.newContext(ctxOpts);
  if (who) { const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]); }
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const shot = async (page, name, fullPage = true) => { if (!SHOTS) return; if (fullPage) { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400); } await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage }); };
const pageNo = page => page.textContent('#rd-count').then(t => +/Page (\d+)/.exec(t)[1]);

test('the library: grade chips and search narrow the books', { skip }, async () => {
  const { ctx, page, errors } = await open(ava, '/library');
  const all = await page.locator('.lb-card').count();
  assert.equal(all, LIB.books().length);
  assert.deepEqual(await page.$$eval('.lb-levels a', els => els.map(e => e.textContent.trim())), ['All grades', '🌱 Pre-K/K', '🌿 Grade 1', '🪴 Grade 2', '🌳 Grade 3', '🌲 Grades 4-5']);
  await page.click('.lb-levels a:has-text("Grade 2")');
  await page.waitForURL(/grade=2/);
  const grades = await page.$$eval('.lb-card', els => els.map(e => e.dataset.grade));
  assert.ok(grades.length > 5 && grades.every(l => l === '2'), grades.join());
  assert.equal(await page.getAttribute('.lb-levels a.on', 'href'), '/library?grade=2');
  assert.ok(await page.locator('.lb-card .lb-g2').count() === grades.length, 'each card shows its grade');
  await page.click('.lb-levels a:has-text("All grades")');
  await page.fill('#lb-q', 'giraffe'); await Promise.all([page.waitForURL(/q=giraffe/), page.press('#lb-q', 'Enter')]);
  assert.deepEqual(await page.$$eval('.lb-title', els => els.map(e => e.textContent.trim()).sort()), LIB.search({ q: 'giraffe' }).map(b => b.title).sort());
  assert.ok((await page.$$eval('.lb-title', els => els.map(e => e.textContent.trim()))).includes('Saboo and Jojo'), 'a StoryWeaver book with a giraffe');
  // Each card names where the book comes from (StoryWeaver or Bloom Library).
  assert.deepEqual((await page.$$eval('.lb-card .lb-src', els => els.map(e => e.textContent.trim()))).sort(), LIB.search({ q: 'giraffe' }).map(b => b.credits.platform).sort());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('reading a book to the end, Read to me lighting each word, then the questions: wrong, look at the page, right', { skip }, async () => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: SHOTS ? 2 : 1 });
  // A stand-in for the device voice: speaks instantly, firing a boundary at every word.
  await ctx.addInitScript(() => {
    window.__spoken = [];
    class U { constructor(t) { this.text = t; } }
    window.SpeechSynthesisUtterance = U;
    const ss = { speaking: false, getVoices: () => [{ lang: 'en-US', name: 'Test', localService: true }], cancel() { this.q = []; },
      speak(u) {
        window.__spoken.push(u.text);
        const words = [...u.text.matchAll(/\S+/g)];
        setTimeout(() => { u.onstart && u.onstart(); words.forEach((w, i) => setTimeout(() => u.onboundary && u.onboundary({ name: 'word', charIndex: w.index }), 30 * i)); setTimeout(() => u.onend && u.onend(), 30 * words.length + 400); }, 0);
      } };
    Object.defineProperty(window, 'speechSynthesis', { value: ss, configurable: true });
  });
  const [name, value] = cookieOf(leo.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/library/sw-0001/read`);
  const bk = LIB.getBook('sw-0001'), n = bk.pages.length;
  assert.equal(await pageNo(page), 1);
  await page.click('#rd-next'); assert.equal(await pageNo(page), 2);
  await page.click('#rd-prev'); assert.equal(await pageNo(page), 1);
  await page.keyboard.press('ArrowRight'); assert.equal(await pageNo(page), 2, 'the arrow key turns the page');
  for (let p = 2; p < 6; p++) await page.click('#rd-next');
  assert.equal(await pageNo(page), 6);
  assert.match(page.url(), /\?p=6$/);
  // Read to me: the words light up one by one.
  assert.equal(await page.isVisible('#rd-aloud'), true);
  await page.click('#rd-aloud');
  await page.waitForFunction(() => document.querySelector('#rd-text .hl'));
  const lit = new Set();
  for (let k = 0; k < 12; k++) { const w = await page.$eval('#rd-text', el => (el.querySelector('.hl') || {}).textContent || ''); if (w) lit.add(w); await page.waitForTimeout(25); }
  assert.ok(lit.size >= 3, `words lit one by one: ${[...lit]}`);
  await shot(page, 'reader-read-to-me', false);
  assert.ok((await page.evaluate(() => window.__spoken)).some(t => /large boulder/.test(t)));
  await page.click('#rd-aloud');
  assert.equal(await page.getAttribute('#rd-aloud', 'aria-pressed'), 'false');
  for (let p = 6; p < n; p++) await page.click('#rd-next');
  assert.equal(await page.textContent('#rd-next').then(t => t.trim()), 'Questions ▶');
  await page.click('#rd-next');
  await page.waitForSelector('#rd-end:not([hidden])');
  assert.equal(await page.isHidden('#rd-stage'), true);
  await page.waitForTimeout(300);
  const rd = LIB.readOf(leo.id, 'sw-0001');
  assert.equal(rd.page, n); assert.ok(rd.finished_at); assert.equal(rd.aloud, 1);
  // Question 2: a wrong answer, then look at the page it points to, back, and the right answer.
  const q2 = bk.questions[1], wrong = (q2.answer + 1) % 3;
  await page.click(`.rd-q[data-i="1"] .rd-opt[data-c="${wrong}"]`);
  await page.waitForSelector('.rd-q[data-i="1"] .rd-hint .rd-look');
  assert.match(await page.textContent('.rd-q[data-i="1"] .rd-hint'), new RegExp(`Try again! Look at page ${q2.page}\\.`));
  assert.equal(await page.isDisabled(`.rd-q[data-i="1"] .rd-opt[data-c="${wrong}"]`), true);
  await page.click('.rd-q[data-i="1"] .rd-look');
  assert.equal(await pageNo(page), q2.page);
  assert.match(await page.textContent('#rd-next'), /Back to the questions/);
  await page.click('#rd-next');
  await page.waitForSelector('#rd-end:not([hidden])');
  await page.click(`.rd-q[data-i="1"] .rd-opt[data-c="${q2.answer}"]`);
  await page.waitForSelector('.rd-q[data-i="1"].is-solved');
  for (const i of [0, 2]) { await page.click(`.rd-q[data-i="${i}"] .rd-opt[data-c="${bk.questions[i].answer}"]`); await page.waitForSelector(`.rd-q[data-i="${i}"].is-solved`); }
  await page.waitForSelector('#rd-done:not([hidden])');
  assert.match(await page.textContent('.rd-done-msg'), /2 of 3 right on the first try/);
  assert.equal(LIB.readOf(leo.id, 'sw-0001').marks, '101');
  await shot(page, 'quiz-done');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a teacher assigns a book from the library to a class; a student reads it; the results show who read it', { skip }, async () => {
  const t = await open(s.teacher, `/library?class=${s.cls.id}`);
  assert.match(await t.page.textContent('.lb-forclass'), /Pick a story to assign to 2nd grade/);
  await t.page.click('.lb-card:has(.lb-title:has-text("The Red Raincoat")) a:has-text("Assign")');
  await t.page.waitForURL(/\/library\/sw-0069\/assign\?class=/);
  assert.equal(await t.page.inputValue('#as-c'), s.cls.id);
  await shot(t.page, 'assign-form');
  await Promise.all([t.page.waitForURL(new RegExp(`/class/${s.cls.id}`)), t.page.click('#as-go')]);
  const cl = LIB.assignmentOf(s.cls.id, 'sw-0069'); assert.ok(cl);
  assert.match(await t.page.textContent('body'), /The Red Raincoat/);
  // The student opens it from the class and reads it to the end.
  const k = await open(ava, `/class/${s.cls.id}/lessons/${cl.id}`);
  assert.match(k.page.url(), /\/library\/sw-0069\/read\?cl=/);
  const n = LIB.getBook('sw-0069').pages.length;
  for (let p = 1; p <= n; p++) await k.page.click('#rd-next');
  await k.page.waitForSelector('#rd-end:not([hidden])');
  const bk = LIB.getBook('sw-0069');
  for (const i of [0, 1, 2]) { await k.page.click(`.rd-q[data-i="${i}"] .rd-opt[data-c="${bk.questions[i].answer}"]`); await k.page.waitForSelector(`.rd-q[data-i="${i}"].is-solved`); }
  await k.page.waitForSelector('#rd-done:not([hidden])');
  assert.match(await k.page.textContent('#rd-done'), /Back to 2nd grade/);
  const stepId = LIB.storyOfLesson(cl.lesson_id).stepId;
  assert.equal(P.get(cl.id, stepId, ava.id).status, 'done');
  await k.ctx.close();
  await t.page.goto(`${BASE}/class/${s.cls.id}/progress/${cl.id}`);
  assert.match(await t.page.textContent(`#s-${ava.id}`), /on their own/);
  assert.match(await t.page.textContent(`#s-${ava.id}`), /3 \/ 3/);
  assert.match(await t.page.textContent(`#s-${leo.id}`), /not started/);
  assert.match(await t.page.textContent('.lp-meta'), /1 of 5 started · 1 finished/);
  await shot(t.page, 'teacher-results');
  // The gradebook lists it with a score.
  await t.page.goto(`${BASE}/class/${s.cls.id}/progress`);
  assert.match(await t.page.textContent('body'), /The Red Raincoat/);
  assert.deepEqual(t.errors, []);
  await t.ctx.close();
});

test('phones: no sideways scroll; Back and Next stay above the tab bar; the library is two columns', { skip }, async () => {
  for (const dev of ['iPhone 13', 'Galaxy S9+', 'iPad Mini']) {
    const lib = await open(ava, '/library', { ...devices[dev] });
    assert.ok(await noSideways(lib.page), `${dev} library`);
    if (dev === 'iPhone 13') {
      const cols = await lib.page.$$eval('.lb-card', els => new Set(els.slice(0, 4).map(e => Math.round(e.getBoundingClientRect().left))).size);
      assert.equal(cols, 2);
      await shot(lib.page, 'library-phone', false);
    }
    await lib.ctx.close();
    const rd = await open(ava, '/library/sw-0096/read?p=3', { ...devices[dev] });
    assert.ok(await noSideways(rd.page), `${dev} reader`);
    const box = await rd.page.$eval('#rd-next', el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
    const bar = await rd.page.$eval('.tabbar', el => (getComputedStyle(el).display === 'none' ? innerHeight : el.getBoundingClientRect().top));
    const vh = await rd.page.evaluate(() => innerHeight);
    assert.ok(box.bottom <= Math.min(bar, vh) + 1 && box.top >= 0, `${dev}: Next at ${box.top}-${box.bottom}, tab bar at ${bar}`);
    if (dev === 'iPhone 13') await shot(rd.page, 'reader-phone', false);
    await rd.page.click('#rd-next');
    assert.equal(await pageNo(rd.page), 4);
    assert.deepEqual(rd.errors, []);
    await rd.ctx.close();
  }
});

test('the questions are read with the AI voice when it is on (not the device voice)', { skip }, async () => {
  const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
  const V = await import('../../server/services/tts-voices.js');
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES]; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: l === 'en' }])) });
  try {
    const n = LIB.getBook('sw-0001').pages.length;
    const { ctx, page, errors } = await open(null, `/library/sw-0001/read?p=${n + 1}`);
    // This test's checkout sits under a hidden folder, which the static file server refuses, so serve the clip here.
    await page.route('**/tts/*.mp3', r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }));
    // Count device-voice use, and stand in for the audio player (this test only checks which voice is asked for).
    await page.evaluate(() => {
      window.__deviceSpoke = 0; window.__played = 0;
      const ss = window.speechSynthesis; if (ss) ss.speak = u => { if (String(u.text || "").trim()) window.__deviceSpoke++; };
      window.Audio = class { play() { window.__played++; setTimeout(() => this.onended && this.onended(), 10); return Promise.resolve(); } pause() {} removeAttribute() {} };
    });
    const btn = page.locator('.rd-q').first().locator('.rd-qread');
    await btn.waitFor();
    const [req] = await Promise.all([page.waitForRequest(r => r.url().endsWith('/api/tts') && r.method() === 'POST'), btn.click()]);
    const body = JSON.parse(req.postData());
    assert.deepEqual([body.ctx, body.book, body.q], ['story', 'sw-0001', 0]);
    await page.waitForTimeout(500);
    assert.equal(await page.evaluate(() => window.__played), 1, 'the AI voice played');
    assert.equal(await page.evaluate(() => window.__deviceSpoke), 0, 'the device voice is not used when the AI voice works');
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
});

test('opening "About the grade level" does not move the cover picture', { skip }, async () => {
  const { ctx, page, errors } = await open(null, '/library/sw-0001');
  const top = () => page.$eval('.lb-book-cover', e => Math.round(e.getBoundingClientRect().top));
  const before = await top();
  await page.click('.lb-measures summary'); await page.waitForTimeout(150);
  assert.equal(await top(), before, 'the cover stays at the top of its column');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the reader keeps the words and the picture on one screen (wide: side by side; phone: picture pinned)', { skip }, async () => {
  // The longest page in the library.
  let at = null; for (const b of LIB.books()) b.pages.forEach((p, i) => { if (!at || p.words > at.w) at = { id: b.id, p: i + 1, w: p.words }; });
  const wide = await open(null, `/library/${at.id}/read?p=${at.p}`, { viewport: { width: 1280, height: 720 } });
  const w = await wide.page.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return { vh: innerHeight, img: r('#rd-img'), text: r('#rd-text'), len: document.querySelector('#rd-text').dataset.len }; });
  assert.equal(w.len, 'xl');
  assert.ok(w.img.bottom <= w.vh && w.text.bottom <= w.vh, 'picture and words both inside the screen');
  assert.ok(w.text.left >= w.img.right, 'side by side');
  await wide.ctx.close();
  const phone = await open(null, `/library/${at.id}/read?p=${at.p}`, devices['iPhone 13']);
  await phone.page.evaluate(() => window.scrollBy(0, 500)); await phone.page.waitForTimeout(150);
  const p = await phone.page.evaluate(() => { const r = document.querySelector('#rd-img').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
  assert.ok(p.top >= 0 && p.bottom <= p.vh, 'the picture stays on screen while the words scroll');
  assert.deepEqual([...wide.errors, ...phone.errors], []);
  await phone.ctx.close();
});
