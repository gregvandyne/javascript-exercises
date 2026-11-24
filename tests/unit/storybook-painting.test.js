// While Oomba paints a book's pictures, nobody sees the art-pack drawing in their place (docs/decisions.md "Book
// pictures: a painting placeholder, never the art pack while painting"; docs/storybook-builder.md "Pictures"). The
// owner: "Just tried the book generator again and it still used the same graphic pack" (the log showed Google painting
// every picture; the teacher saw the art-pack drawings while it did and deleted the book). Checked here:
//   - queued or drawing: the painting placeholder (never the art pack) in the editor's page picture, the page list, the
//     story map, the reader a student opens, the print copy and the book card on /library and /library/make, whose meta
//     line says "Painting pictures" with Read still there; the editor's line "Painting your pictures: N of M ready";
//   - the art pack only for a real fallback, with its reason and Paint pictures again right there;
//   - the editor's poll swaps each painted picture in (page, list, map) and says "All pictures painted.", and the card
//     swaps in its painted cover, without a reload.
// Google is the stand-in (tests/support/fake-gemini.js), held back until the test lets it paint.
// PAINT_SHOTS=<dir> also saves pp-1 ... pp-4 (deviceScaleFactor 1).
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
const SB = await import('../../server/services/storybook.js');
const C = await import('../../server/services/oomba-chat.js');
const D = await import('../../server/services/storybook-draw.js');
const G = await import('../../server/services/storybook-gemini.js');
const RL = await import('../../server/services/ratelimit.js');
const { paintingHtml } = await import('../../public/js/storybook-art.js');
const { fakeGemini } = await import('../support/fake-gemini.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1243/chrome-linux/chrome', '/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1243/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p) && fs.statSync(p).isFile());
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.PAINT_SHOTS || '';

const boss = createUser({ username: 'PaintBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oomba Academy Demo School' }).school;
const teach = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Rosa Reading', role: 'teacher' }).user.id);
config.manipulativesUsers = [...config.manipulativesUsers, teach.username.toLowerCase()];
const cls = S.createClass(boss, oak.id, { name: '2B', grade: '2', teacherId: teach.id }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mia Pupil' }).user.id); S.addToClass(boss, cls.id, kid.id);
const cookieOf = id => { let c = ''; startSession({ append: (kk, v) => { c = v.split(';')[0]; } }, id); return c; };
const ART_PACK = /<svg [^>]*class="sb-art"/;   // the art-pack drawing (storybook-art.js pictureSvg); icons are <svg class="fx ...">

// Google, held back: every call waits until let() is called.
let hold = null;
const gate = () => { let open; hold = new Promise(r => { open = r; }); return () => { open(); hold = null; }; };
let server, BASE, browser;
test.before(async () => {
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (!skip) browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
  Object.assign(config, { storybookPlanPerDay: 60, storybookPicturesPlanPerDay: 200, storybookPicturesFreePerDay: 200, geminiKey: '', aiDailyBudgetUsd: 1000, aiMonthlyBudgetUsd: 100000 });
  fakeGemini(G);
  const paint = G.hooks.generate;
  G.hooks.generate = async (...a) => { if (hold) await hold; return paint(...a); };
  D.hooks.screenImage = async () => 'allow'; SB.hooks.classify = async () => null;
});
test.after(async () => { G.hooks.generate = null; D.hooks.screenImage = null; SB.hooks.classify = null; if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
test.beforeEach(() => { RL._reset(); q.run('DELETE FROM made_book_ai_days'); });

const settle = async () => { await C.allSettled(); await D.settle(); await new Promise(r => setTimeout(r, 30)); await D.settle(); };
/** A book with its first draft; its pictures are queued (and wait while Google is held back). */
async function draft(title, setup = {}) {
  const r = await SB.createBook(teach, { source: 'ai', kind: 'linear', grade: '2', length: 'short', level: 'growing', pictures: 'ai', about: title, ...setup });
  assert.ok(r.ok, JSON.stringify(r));
  const row = SB.ownBook(teach, r.id), w = await SB.writeBook(teach, row, { text: '' });
  SB.applyBook(teach, r.id, SB.bookOf(row), w.book, {});
  SB.renameBook(teach, r.id, title);
  await new Promise(r2 => setTimeout(r2, 20));
  return r.id;
}
const get = async (p, who = teach) => { const r = await fetch(`${BASE}${p}`, { headers: { cookie: cookieOf(who.id) } }); return { status: r.status, text: await r.text() }; };
const cardOf = (html, id) => { const m = new RegExp(`<li class="lb-card sb-bcard[^"]*" data-book="${id}"[\\s\\S]*?</li>`).exec(html); return m ? m[0] : ''; };

test('the placeholder: a soft panel with a brush and the words, decorative or named; no art pack', () => {
  const h = paintingHtml('Oomba is painting this picture');
  assert.match(h, /^<div class="sb-art sb-painting" data-painting="1" role="img" aria-label="Oomba is painting this picture">/);
  assert.match(h, /data-fx="paintbrush"[^>]*width="28"[^>]*><use href="\/icons\/oomba\/brush\.svg/);
  assert.match(h, /<span class="sb-painting-t">Oomba is painting this picture<\/span>/);
  assert.match(paintingHtml('x', { decorative: true }), /aria-hidden="true"/);
  assert.doesNotMatch(h, ART_PACK);
  const css = fs.readFileSync(new URL('../../public/css/library.css', import.meta.url), 'utf8');
  assert.match(css, /\.sb-painting::before\{[^}]*animation:sb-shimmer/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)\{\.sb-painting::before\{animation:none/);
});

test('while painting: the reader (a student), the print copy and the card show the placeholder, never the art pack; a fallback shows the art pack', async () => {
  const let_ = gate();
  const id = await draft('The Painting Test');
  SB.setShared(teach, id, [cls.id]);
  const row = SB.ownBook(teach, id), bk = SB.bookOf(row);
  assert.ok(SB.paintingOf(row).busy > 0, 'pictures are queued');
  for (const p of bk.pages) assert.equal(D.painting(id, p.id), true, p.id);
  // the reader a student opens, and its page data (the script draws every other page from it)
  let r = await get(`/library/made/${id}/read`, kid);
  assert.equal(r.status, 200);
  assert.match(r.text, /<div class="sb-art sb-painting" data-painting="1" role="img" aria-label="Oomba is painting this picture">/);
  assert.doesNotMatch(r.text, ART_PACK);
  // the print copy (the teacher)
  r = await get(`/library/made/${id}/print`);
  assert.doesNotMatch(r.text, ART_PACK); assert.match(r.text, /sb-painting/);
  // the card on /library/make and /library: the placeholder cover, "Painting pictures", Read still there
  for (const where of ['/library/make', '/library']) {
    const c = cardOf((await get(where)).text, id);
    assert.ok(c, where);
    assert.match(c, /data-painting="1"/); assert.match(c, /class="lb-cover sb-bcover"[^>]*><div class="sb-art sb-painting"[^>]*aria-hidden="true"/);
    assert.match(c, /<p class="lb-meta small muted"><svg[^>]*data-fx="paintbrush"[\s\S]*?\d+ pages · Painting pictures/);
    assert.match(c, new RegExp(`href="/library/made/${id}/read"`), 'Read is still there');
    assert.doesNotMatch(c, ART_PACK);
  }
  // the card endpoint the cards' script polls
  r = await get(`/api/library/make/${id}/card`);
  assert.equal(JSON.parse(r.text).painting, true);
  assert.equal((await get(`/api/library/make/${id}/card`, kid)).status, 404, 'teachers only');
  // the editor's state: queued or drawing, no picture yet (the page script shows the placeholder for these)
  const st = D.stateOf(teach, row);
  assert.ok(st.busy > 0 && Object.values(st.pages).every(d => ['queued', 'drawing'].includes(d.state) && !d.pic));
  // a picture that fell back is a real fallback: the art pack, and the card no longer says painting once nothing waits
  const one = bk.pages[0].id;
  let_(); await settle();
  q.run("UPDATE made_book_draws SET state='fallback', reason='busy', pic_id=NULL WHERE book_id=? AND target=?", id, `page:${one}`);
  assert.equal(D.painting(id, one), false);
  assert.match(SB.pictureHtml(row, bk, bk.pages[0]), ART_PACK);
  const c = cardOf((await get('/library/make')).text, id);
  assert.doesNotMatch(c, /Painting pictures|data-painting/); assert.match(c, ART_PACK, 'the cover is the fallback drawing');
  // painted pages are the painted pictures
  assert.match(SB.pictureHtml(row, bk, bk.pages[1]), /<img class="sb-art" src="\/library\/made\//);
  // a book whose pictures the teacher adds (no painting at all): the art pack, as before
  const own = await draft('Own Pictures', { pictures: 'own' });
  const orow = SB.ownBook(teach, own);
  assert.equal(SB.paintingOf(orow).total, 0);
  assert.match(SB.pictureHtml(orow, SB.bookOf(orow), SB.bookOf(orow).pages[0]), ART_PACK);
});

test('a restart leaves pictures queued: the queue is kicked again soon after start-up', async () => {
  const { job } = await import('../../server/services/jobs.js');
  const j = job('storybook-picture-queue'); assert.ok(j, 'registered'); assert.ok(j.firstAfterMs <= 10e3);
  const id = await draft('Left Queued');
  await settle();
  q.run("UPDATE made_book_draws SET state='queued', pic_id=NULL WHERE book_id=?", id);
  await j.fn(); await settle();
  assert.equal(SB.paintingOf(SB.ownBook(teach, id)).busy, 0, 'drawn after the kick');
});

// ---------------------------------------------------------------- in a browser
const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const PHONE = () => ({ ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
async function open(who, p, ctxOpts) {
  const ctx = await browser.newContext({ ...ctxOpts, colorScheme: 'light', reducedMotion: 'reduce' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }, { name: 'theme', value: 'light', url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${p}`);
  return { ctx, page, errors };
}
const shot = async (page, name, o = {}) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${name}.png`), ...o }); };
const noSideScroll = async page => assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'no sideways scroll');

test('editor and cards: placeholders and the progress line while painting; each picture swaps in on the poll; "All pictures painted."', { skip }, async () => {
  const let_ = gate();
  const id = await draft('Kip and the Color King', { kind: 'cyoa', endings: 2, grade: '3' });
  const n = SB.bookOf(SB.ownBook(teach, id)).pages.length;
  const ed = await open(teach, `/library/make/${id}`, LAPTOP);
  const cards = await open(teach, '/library/make', LAPTOP);
  let phone;
  try {
    const { page } = ed;
    await page.locator('#sb-drawline:not([hidden])').waitFor();
    assert.match(await page.locator('#sb-drawline').textContent(), /Painting your pictures: \d+ of \d+ ready\. You can keep editing\./);
    assert.doesNotMatch(await page.locator('#sb-drawline').textContent(), /art pack|kit/i);
    // the open page, the page list and the story map: placeholders, no art-pack drawing anywhere
    assert.ok(await page.locator('.sb-fig .sb-painting[role="img"][aria-label="Oomba is painting this picture"]').isVisible());
    assert.ok(await page.locator('.sb-fig .sb-painting-t', { hasText: 'Oomba is painting this picture' }).isVisible());
    assert.equal(await page.locator('#sb-plist .sb-pthumb .sb-painting').count(), n);
    assert.equal(await page.locator('#sb-map .sb-nthumb .sb-painting').count(), n);
    assert.equal(await page.locator('#sb-edit svg.sb-art').count(), 0, 'no art-pack drawing while painting');
    await noSideScroll(page);
    await shot(page, 'pp-1-painting');
    // the card while painting
    const card = cards.page.locator(`.sb-bcard[data-book="${id}"]`);
    assert.ok(await card.locator('.sb-bcover .sb-painting').isVisible());
    assert.match(await card.locator('.lb-meta').textContent(), /Painting pictures/);
    assert.ok(await card.locator(`a[href="/library/made/${id}/read"]`).isVisible(), 'Read is still there');
    await card.scrollIntoViewIfNeeded();
    await shot(cards.page, 'pp-2-card', { clip: await (async () => { const b = await card.boundingBox(); return { x: Math.max(0, b.x - 16), y: Math.max(0, b.y - 16), width: Math.min(1440, b.width * 3 + 64), height: b.height + 32 }; })() });
    // a phone, mid-painting
    phone = await open(teach, `/library/make/${id}`, PHONE());
    await phone.page.locator('#sb-drawline:not([hidden])').waitFor();
    assert.ok(await phone.page.locator('.sb-fig .sb-painting').isVisible());
    await noSideScroll(phone.page);
    await shot(phone.page, 'pp-4-phone');
    // Google paints: the poll swaps each painted picture in (page, list, map), then says so and the line hides
    let_();
    await page.locator('#sb-drawline', { hasText: 'All pictures painted.' }).waitFor({ timeout: 30e3 });
    assert.equal(await page.locator('#sb-edit .sb-painting').count(), 0);
    assert.ok(await page.locator('.sb-fig img.sb-art').isVisible(), 'the painted picture');
    assert.equal(await page.locator('#sb-plist .sb-pthumb img.sb-art').count(), n);
    assert.equal(await page.locator('#sb-map .sb-nthumb img.sb-art').count(), n);
    assert.equal(await page.locator('#sb-edit svg.sb-art').count(), 0);
    await shot(page, 'pp-3-done');
    await page.locator('#sb-drawline').waitFor({ state: 'hidden', timeout: 8e3 });
    // the card swaps in its painted cover without a reload
    await card.locator('.sb-bcover img.sb-art').waitFor({ timeout: 15e3 });
    assert.doesNotMatch(await cards.page.locator(`.sb-bcard[data-book="${id}"] .lb-meta`).textContent(), /Painting pictures/);
    assert.deepEqual([...ed.errors, ...cards.errors, ...phone.errors], []);
  } finally { if (hold) hold = null; await ed.ctx.close(); await cards.ctx.close(); if (phone) await phone.ctx.close(); }
});

test('editor: a real fallback shows the art-pack drawing with its reason and Paint pictures again right there', { skip }, async () => {
  const id = await draft('The Fallback Book');
  await settle();
  const bk = SB.bookOf(SB.ownBook(teach, id));
  q.run("UPDATE made_book_draws SET state='fallback', reason='busy', pic_id=NULL WHERE book_id=? AND target=?", id, `page:${bk.pages[0].id}`);
  const { ctx, page, errors } = await open(teach, `/library/make/${id}`, LAPTOP);
  try {
    await page.locator('.sb-fig svg.sb-art').waitFor();
    assert.match(await page.locator('#sb-dst').textContent(), /Google was too busy to paint this one, so this shows the art-pack drawing/);
    assert.ok(await page.locator('#sb-dst [data-act="repaint"]', { hasText: 'Paint pictures again' }).isVisible());
    assert.match(await page.locator('#sb-drawline').textContent(), /1 picture couldn't be painted/);
    assert.ok(await page.locator('#sb-drawline [data-act="repaint"]').isVisible());
    // Paint pictures again: the placeholder while it paints, then the painted picture
    await page.click('#sb-dst [data-act="repaint"]');
    await page.locator('.sb-fig img.sb-art').waitFor({ timeout: 30e3 });
    assert.equal(await page.locator('.sb-fig svg.sb-art').count(), 0);
    assert.deepEqual(errors, []);
  } finally { await ctx.close(); }
});
