// The Classics shelf in a real browser (docs/decisions.md "Story Library: a Classics shelf"): on a 1280 x 720 laptop,
// text-only pages show side by side as an open book with both pages fully on screen (every view of every classic is
// checked), Next turns both, the counter says "Pages N-M", a picture page keeps the usual layout, a lone text page gets
// a spread to itself, Read to me reads the left page and then the right (the device voice word by word, the AI voice
// sentence by sentence), progress reaches the last page, phones show one page at a time, and a picture book from
// StoryWeaver is unchanged. LIBRARY_SHOTS=<dir> also saves pictures. Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const LIB = await import('../../server/services/library.js');
const { sentences } = await import('../../public/js/library-text.js');
const { librarySeed, cookieOf } = await import('../support/library-seed.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.LIBRARY_SHOTS || '';

seed({ quiet: true });
const s = librarySeed({ book: null });
const LAPTOP = { viewport: { width: 1280, height: 720 }, deviceScaleFactor: SHOTS ? 2 : 1 };

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, ctxOpts = LAPTOP, init = null) {
  const ctx = await browser.newContext(ctxOpts);
  if (init) await ctx.addInitScript(init);
  if (who) { const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]); }
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** What the reader shows: the counter, both pages' boxes (null when hidden) and whether their words overflow. */
const view = page => page.evaluate(() => {
  const box = id => { const e = document.getElementById(id); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, over: e.scrollHeight > e.clientHeight + 1 }; };
  return { count: document.getElementById('rd-count').textContent, vh: innerHeight, vw: innerWidth, left: box('rd-text'), right: box('rd-text2'), leafR: box('rd-leaf-r'),
    pic: box('rd-img'), nav: document.querySelector('.rd-nav').getBoundingClientRect().bottom, stage: document.getElementById('rd-stage').className,
    folios: [...document.querySelectorAll('.rd-folio')].filter(e => e.offsetParent).map(e => e.textContent), blank: !!document.querySelector('#rd-leaf-r.is-blank'),
    next: document.getElementById('rd-next').textContent.trim() };
});
// The device voice, standing in: speaks at once and fires a boundary at every word.
const STANDIN = () => {
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; } };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { getVoices: () => [{ lang: 'en-US', name: 'Test', localService: true }], cancel() {},
    speak(u) { window.__spoken.push(u.text); const ws = [...u.text.matchAll(/\S+/g)]; setTimeout(() => { u.onstart && u.onstart(); ws.forEach((w, i) => setTimeout(() => u.onboundary && u.onboundary({ name: 'word', charIndex: w.index }), 5 * i)); setTimeout(() => u.onend && u.onend(), 5 * ws.length + 30); }, 0); } } });
};

test('a laptop (1280 x 720): an open book for text pages, Next turns both, a picture page as usual, a lone page on its own', { skip }, async () => {
  const bk = LIB.getBook('cl-whale'), n = bk.pages.length;
  const { ctx, page, errors } = await open(null, '/library/cl-whale/read');
  let v = await view(page);
  assert.equal(v.count, `Pages 1-2 of ${n}`);
  assert.match(v.stage, /is-spread/); assert.equal(v.pic, null, 'no picture on a spread');
  assert.ok(v.left && v.right && !v.left.over && !v.right.over, 'both pages fully visible, no overflow');
  assert.ok(v.left.right <= v.right.left, 'side by side'); assert.ok(v.left.bottom <= v.vh && v.right.bottom <= v.vh && v.nav <= v.vh, 'on screen');
  assert.deepEqual(v.folios, ['1', '2']);
  assert.equal(await page.$eval('#rd-text', e => e.textContent.replace(/\s+/g, ' ').trim()), bk.pages[0].text.replace(/\s+/g, ' ').trim());
  await shot(page, 'classics-spread-1280');
  await page.click('#rd-next');
  v = await view(page); assert.equal(v.count, `Pages 3-4 of ${n}`); assert.match(page.url(), /\?p=3$/);
  await page.keyboard.press('ArrowRight');
  assert.match((await view(page)).count, /^Pages? 5/, 'the arrow key turns the page');
  // The first picture page: the usual layout, picture and words side by side.
  const pic = bk.pages.findIndex(p => p.image) + 1;
  await page.goto(`${BASE}/library/cl-whale/read?p=${pic}`);
  v = await view(page);
  assert.equal(v.count, `Page ${pic} of ${n}`); assert.ok(!/is-spread/.test(v.stage)); assert.equal(v.right, null);
  assert.ok(v.pic && v.left && v.left.left >= v.pic.right && !v.left.over, 'picture beside the words');
  await shot(page, 'classics-picture-page-1280');
  await page.click('#rd-prev'); assert.match((await view(page)).count, new RegExp(`${pic - 1} of ${n}$`), 'Back goes to the page (or spread) before');
  // The last page stands alone after a picture page: a spread with a blank right-hand page.
  await page.goto(`${BASE}/library/cl-whale/read?p=${n}`);
  v = await view(page);
  assert.equal(v.count, `Page ${n} of ${n}`); assert.ok(v.blank && v.leafR, 'a blank right page'); assert.deepEqual(v.folios, [String(n), '']);
  assert.match(v.next, /Questions/);
  await shot(page, 'classics-lone-page-1280');
  // A link to the right-hand page of a spread opens the spread.
  await page.goto(`${BASE}/library/cl-whale/read?p=2`); assert.equal((await view(page)).count, `Pages 1-2 of ${n}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('every view of every Classics book fits a 1280 x 720 laptop and a 1440 x 900 one', { skip }, async () => {
  for (const size of [{ width: 1280, height: 720 }, { width: 1440, height: 900 }]) {
    const { ctx, page, errors } = await open(null, '/library', { viewport: size });
    let spreads = 0;
    for (const bk of LIB.books().filter(b => b.source === 'classics' && b.pages.some(p => !p.image))) {
      await page.goto(`${BASE}/library/${bk.id}/read`);
      for (let k = 0; k < bk.pages.length; k++) {
        const v = await view(page);
        for (const side of [v.left, v.right].filter(Boolean)) assert.ok(!side.over && side.bottom <= v.vh, `${bk.id} ${v.count} at ${size.width}x${size.height}`);
        assert.ok(v.nav <= v.vh, `${bk.id} ${v.count}: Next on screen`);
        if (/is-spread/.test(v.stage)) spreads++;
        if (v.next.includes('Questions')) break;
        await page.click('#rd-next');
      }
    }
    assert.ok(spreads > 50, `${spreads} spreads`);
    if (size.width === 1440) { await page.goto(`${BASE}/library/cl-velveteen-rabbit/read?p=3`); await shot(page, 'classics-spread-1440'); }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('Read to me reads the left page, then the right (device voice word by word; AI voice by page and sentence numbers)', { skip }, async () => {
  const bk = LIB.getBook('cl-whale');
  const { ctx, page, errors } = await open(null, '/library/cl-whale/read', LAPTOP, STANDIN);
  await page.click('#rd-aloud');
  await page.waitForFunction(() => document.querySelector('#rd-text .hl'));
  await page.waitForFunction(() => document.querySelector('#rd-text2 .hl'), null, { timeout: 15000 });
  const spoken = (await page.evaluate(() => window.__spoken)).filter(t => t.trim());
  const want = [...sentences(bk.pages[0].text), ...sentences(bk.pages[1].text)].map(x => x.text);
  assert.deepEqual(spoken.slice(0, want.length), want.slice(0, spoken.length), 'left page first, then the right');
  assert.ok(spoken.length > sentences(bk.pages[0].text).length, 'it went on to the right page');
  await page.click('#rd-aloud');
  assert.deepEqual(errors, []);
  await ctx.close();
  // The AI voice: each sentence by its page and number, the left page's first.
  const { config, TTS_ALL_LOCALES } = await import('../../server/config.js');
  const V = await import('../../server/services/tts-voices.js');
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES]; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: l === 'en' }])) });
  try {
    const ai = await open(null, '/library/cl-whale/read');
    await ai.page.route('**/tts/*.mp3', r => r.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.alloc(64) }));
    await ai.page.evaluate(() => { window.Audio = class { play() { setTimeout(() => this.onended && this.onended(), 5); return Promise.resolve(); } pause() {} removeAttribute() {} }; });
    const asked = [];
    ai.page.on('request', r => { if (r.url().endsWith('/api/tts') && r.method() === 'POST') { const b = JSON.parse(r.postData()); asked.push([b.page, b.s]); } });
    await ai.page.click('#rd-aloud');
    await ai.page.waitForFunction(() => document.querySelector('#rd-text2 .hl-s'), null, { timeout: 15000 });
    const n1 = sentences(bk.pages[0].text).length;
    // Each sentence once, in order (the next one is fetched while one plays, so two can arrive swapped).
    const order = [...new Set(asked.map(x => x.join(':')))];
    assert.deepEqual(order.slice(0, n1).sort(), Array.from({ length: n1 }, (_, i) => `1:${i}`).sort(), 'the left page first');
    assert.equal(order[n1], '2:0', 'then the right page');
    await ai.ctx.close();
  } finally { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
});

test('reading a classic to the end in spreads: the furthest page is the last one, and the questions work', { skip }, async () => {
  const kid = s.kids[1], bk = LIB.getBook('cl-camel'), n = bk.pages.length;
  const { ctx, page, errors } = await open(kid, '/library/cl-camel/read');
  await page.waitForTimeout(200);
  assert.equal(LIB.readOf(kid.id, 'cl-camel').page, 2, 'a spread of pages 1-2 counts as page 2');
  for (let k = 0; k < n; k++) { if ((await view(page)).next.includes('Questions')) break; await page.click('#rd-next'); }
  await page.click('#rd-next');
  await page.waitForSelector('#rd-end:not([hidden])');
  await page.waitForTimeout(300);
  assert.equal(LIB.readOf(kid.id, 'cl-camel').page, n);
  const q = bk.questions[0], wrong = (q.answer + 1) % 3;
  await page.click(`.rd-q[data-i="0"] .rd-opt[data-c="${wrong}"]`);
  await page.waitForSelector('.rd-q[data-i="0"] .rd-look');
  await page.click('.rd-q[data-i="0"] .rd-look');
  const v = await view(page);
  assert.match(v.count, new RegExp(`\\b${q.page}\\b`), `the spread with page ${q.page}`);
  await page.click('#rd-next'); await page.waitForSelector('#rd-end:not([hidden])');
  for (const [i, x] of bk.questions.entries()) { await page.click(`.rd-q[data-i="${i}"] .rd-opt[data-c="${x.answer}"]`); await page.waitForSelector(`.rd-q[data-i="${i}"].is-solved`); }
  await page.waitForSelector('#rd-done:not([hidden])');
  assert.equal(LIB.readOf(kid.id, 'cl-camel').marks, '011');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('phones show one page at a time; a StoryWeaver picture book is unchanged on a laptop', { skip }, async () => {
  const bk = LIB.getBook('cl-whale'), n = bk.pages.length;
  const ph = await open(null, '/library/cl-whale/read', { ...devices['iPhone 13'] });
  let v = await view(ph.page);
  assert.equal(v.count, `Page 1 of ${n}`); assert.equal(v.right, null); assert.ok(!/is-spread/.test(v.stage));
  assert.ok(await ph.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'no sideways scroll');
  await shot(ph.page, 'classics-phone');
  await ph.page.click('#rd-next'); v = await view(ph.page); assert.equal(v.count, `Page 2 of ${n}`);
  assert.deepEqual(ph.errors, []);
  await ph.ctx.close();
  const sw = await open(null, '/library/sw-0001/read');
  v = await view(sw.page);
  const m = LIB.getBook('sw-0001').pages.length;
  assert.equal(v.stage, 'rd-stage'); assert.equal(v.count, `Page 1 of ${m}`); assert.equal(await sw.page.$$eval('.rd-leaf, .rd-folio', els => els.length), 0);
  assert.ok(v.pic && v.left && v.left.left >= v.pic.right);
  await sw.page.click('#rd-next'); assert.equal((await view(sw.page)).count, `Page 2 of ${m}`);
  assert.deepEqual(sw.errors, []);
  await sw.ctx.close();
  // The library shows the Classics label on the cards.
  const lib = await open(null, '/library?q=kipling');
  assert.ok((await lib.page.$$eval('.lb-src', els => els.map(e => e.textContent.trim()))).every(t => t === 'Classics'));
  assert.ok((await lib.page.locator('.lb-card').count()) >= 4);
  await shot(lib.page, 'classics-library');
  await lib.ctx.close();
});

test('a long book\'s page dots slide on one line; a short book keeps every dot', { skip }, async () => {
  const dots = page => page.evaluate(() => { const d = document.getElementById('rd-dots'); const shown = [...d.children].filter(i => !i.hidden);
    return { cls: d.className, shown: shown.length, all: d.children.length, h: d.getBoundingClientRect().height, on: shown.filter(i => i.classList.contains('on')).length, cur: [...d.children].findIndex(i => i.classList.contains('cur')) }; });
  const { ctx, page, errors } = await open(null, '/library/cl-velveteen-rabbit/read');
  let d = await dots(page);
  assert.equal(d.all, 50); assert.equal(d.shown, 13); assert.match(d.cls, /sliding/); assert.match(d.cls, /more-r/); assert.doesNotMatch(d.cls, /more-l/);
  assert.ok(d.h < 20, `one line of dots (${d.h}px)`);
  await page.goto(`${BASE}/library/cl-velveteen-rabbit/read?p=30`);
  d = await dots(page);
  assert.match(d.cls, /more-l/); assert.match(d.cls, /more-r/); assert.equal(d.shown, 13); assert.ok(d.h < 20);
  const last = +(await view(page)).count.match(/(\d+) of 50/)[1];
  assert.equal(d.cur, last - 1, 'the current page is the big dot'); assert.equal(d.on, 7, 'the dots before it are filled, centered');
  await page.click('#rd-next'); await page.waitForTimeout(150);
  const d2 = await dots(page); assert.ok(d2.cur > d.cur, 'the window follows Next');
  await shot(page, 'classics-long-dots-1280');
  await page.goto(`${BASE}/library/cl-velveteen-rabbit/read?p=50`);
  d = await dots(page); assert.match(d.cls, /more-l/); assert.doesNotMatch(d.cls, /more-r/); assert.equal(d.shown, 13);
  // A 14-page classic shows all its dots, as before.
  await page.goto(`${BASE}/library/cl-whale/read`);
  d = await dots(page); assert.equal(d.shown, d.all); assert.doesNotMatch(d.cls, /sliding/); assert.equal(d.cur, -1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('swiping turns the page: a finger drags the page and turns it, a short drag springs back, a trackpad swipe turns it', { skip }, async () => {
  const touch = async (page, pts) => {
    const c = await page.context().newCDPSession(page);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pts[0]] });
    for (const p of pts.slice(1)) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
  };
  const line = (x1, x2, y, steps = 8, dy = 0) => Array.from({ length: steps + 1 }, (_, i) => ({ x: x1 + (x2 - x1) * i / steps, y: y + dy * i / steps }));
  const count = page => page.$eval('#rd-count', e => e.textContent);
  // A phone, a picture book and a classic.
  for (const book of ['sw-0001', 'cl-whale']) {
    const { ctx, page, errors } = await open(null, `/library/${book}/read`, { ...devices['iPhone 13'] });
    await page.waitForTimeout(300);
    // On the words (a short page's middle could be the Back/Next row, where a swipe is a tap).
    const b = await page.$eval('#rd-text', e => { const r = e.getBoundingClientRect(); return { x: innerWidth / 2, y: r.y + 30 }; });
    await touch(page, line(b.x + 120, b.x - 120, b.y)); assert.match(await count(page), /^Page 2 of/, `${book}: swipe left goes forward`);
    await touch(page, line(b.x - 120, b.x + 120, b.y)); assert.match(await count(page), /^Page 1 of/, `${book}: swipe right goes back`);
    await touch(page, line(b.x - 120, b.x + 120, b.y)); assert.match(await count(page), /^Page 1 of/, `${book}: nothing before page 1`);
    // Two quick swipes in a row turn two pages (the second finishes the first one's slide at once).
    const q = async (x1, x2) => { const c = await page.context().newCDPSession(page); await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x1, y: b.y }] });
      for (const p of line(x1, x2, b.y, 4).slice(1)) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
      await c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    await q(b.x + 100, b.x - 100); await page.waitForTimeout(60); await q(b.x + 100, b.x - 100); await page.waitForTimeout(500);
    assert.match(await count(page), /^Page 3 of/, `${book}: two quick swipes, two pages`);
    await q(b.x - 100, b.x + 100); await page.waitForTimeout(60); await q(b.x - 100, b.x + 100); await page.waitForTimeout(500);
    assert.match(await count(page), /^Page 1 of/, `${book}: and back`);
    // A quick flick of 40px turns the page.
    await q(b.x + 20, b.x - 20); await page.waitForTimeout(500); assert.match(await count(page), /^Page 2 of/, `${book}: a flick turns`);
    await q(b.x - 20, b.x + 20); await page.waitForTimeout(500); assert.match(await count(page), /^Page 1 of/, `${book}: a flick back`);
    await touch(page, line(b.x + 6, b.x - 6, b.y, 8)); assert.match(await count(page), /^Page 1 of/, `${book}: a short drag springs back`);
    await touch(page, line(b.x, b.x - 30, b.y, 8, 200)); assert.match(await count(page), /^Page 1 of/, `${book}: scrolling down is not a turn`);
    // Mid-drag the page follows the finger; let go short and it comes back.
    const c = await page.context().newCDPSession(page);
    await c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b.x, y: b.y }] });
    for (const p of line(b.x, b.x - 50, b.y, 5).slice(1)) await c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [p] });
    await page.waitForTimeout(60);
    const mid = await page.$eval('#rd-stage > :not(.rd-nav):not([hidden])', e => e.style.transform); assert.match(mid, /translate3d\(-50px/, `${book}: the page follows the finger one-to-one`);
    await c.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); await page.waitForTimeout(300);
    assert.equal(await page.$eval('#rd-stage > :not(.rd-nav):not([hidden])', e => e.style.transform), '', `${book}: back in place`);
    await touch(page, line(b.x + 120, b.x - 120, b.y)); await page.waitForTimeout(300);
    assert.equal(await page.$eval('#rd-stage > :not(.rd-nav):not([hidden])', e => e.style.transform), '', `${book}: no transform left after a turn`);
    // iPhone Safari: once a finger moves sideways the reader stops the browser moving the site (touchmove is
    // cancelled); an up-and-down move is left alone (it scrolls); a touch at the screen's edge is Safari's back swipe.
    await page.evaluate(() => { window.__tm = []; document.addEventListener('touchmove', e => window.__tm.push(e.defaultPrevented), { passive: true }); });
    await touch(page, line(b.x + 40, b.x - 40, b.y, 8));
    assert.ok((await page.evaluate(() => window.__tm)).slice(-4).every(Boolean), `${book}: a sideways move is the reader's`);
    await touch(page, line(b.x + 40, b.x + 40, b.y, 8));                       // (wait for the turn to finish)
    await page.evaluate(() => { window.__tm = []; });
    await touch(page, line(b.x, b.x + 4, b.y, 8, 120));
    assert.ok(!(await page.evaluate(() => window.__tm)).some(Boolean), `${book}: scrolling is the browser's`);
    const at = await count(page);
    await page.evaluate(() => { window.__tm = []; });
    await touch(page, line(8, 200, b.y, 8));
    assert.ok(!(await page.evaluate(() => window.__tm)).some(Boolean), `${book}: the edge swipe is Safari's`);
    assert.equal(await count(page), at, `${book}: an edge swipe doesn't turn`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // A laptop: a sideways two-finger trackpad swipe turns the spread once, its momentum doesn't turn it again.
  const { ctx, page, errors } = await open(null, '/library/cl-whale/read');
  const b = await page.$eval('#rd-stage', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + 200 }; });
  await page.mouse.move(b.x, b.y);
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(30, 0); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  assert.equal(await count(page), 'Pages 3-4 of 14', 'one turn per swipe');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(-30, 0); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  assert.equal(await count(page), 'Pages 1-2 of 14');
  // A sideways swipe beside the book (the page's margin) turns it too, and the browser is told not to use sideways
  // swipes for back and forward on this page.
  await page.mouse.move(20, 400);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(30, 0); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  assert.equal(await count(page), 'Pages 3-4 of 14', 'a swipe beside the book');
  assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.documentElement).overscrollBehaviorX, getComputedStyle(document.body).overscrollBehaviorX]), ['none', 'none']);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(-30, 0); await page.waitForTimeout(16); }
  await page.waitForTimeout(400);
  await page.mouse.move(b.x, b.y);
  await page.mouse.wheel(0, 300); await page.waitForTimeout(300);
  assert.equal(await count(page), 'Pages 1-2 of 14', 'scrolling down is not a turn');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the "You finished" card: a small star in the line, no focus ring, a compact header on phones', { skip }, async () => {
  for (const [name, opts] of [['phone', { ...devices['iPhone 13'] }], ['laptop', LAPTOP]]) {
    const { ctx, page, errors } = await open(null, '/library/sw-0001/read?p=12', opts);
    await page.waitForTimeout(300);
    const m = await page.$eval('#rd-end-h', h => ({ star: h.querySelector('img').getBoundingClientRect().height, h: h.getBoundingClientRect().height,
      outline: getComputedStyle(h).outlineStyle, focused: document.activeElement === h, cover: h.parentElement.querySelector(':scope > img').getBoundingClientRect(),
      q1: document.querySelector('.rd-q').getBoundingClientRect().top, vh: innerHeight }));
    assert.ok(m.star < 40, `${name}: the star is icon-sized (${m.star}px)`);
    assert.ok(m.h < 80, `${name}: the heading is a line or two (${m.h}px)`);
    if (m.focused) assert.equal(m.outline, 'none', `${name}: no focus ring`);
    if (name === 'phone') { assert.ok(m.cover.width <= 120, 'a small cover'); assert.ok(m.q1 < m.vh * 0.6, 'the first question is on the screen'); }
    await shot(page, `finish-${name}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});
