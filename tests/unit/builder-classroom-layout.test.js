// The game-type step of /build/new in a real browser, for a teacher and for a kid: "For your class" shown first for a
// teacher (the games one tap away), the games first for a kid; a classroom type skips the steps it has no use for (a
// survey: 2D or 3D, world, characters and what it teaches) and the progress counts only the steps left; the plan
// lists only those; switching groups keeps the pick. No sideways scroll on a desktop or an iPhone.
// CLASSROOM_SHOTS=<dir> also saves pictures of the step (teacher, desktop and iPhone). Skipped when no Chromium is installed.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-classroom-layout-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.arcade = true;   // the arcade Builder (the kit, Kit 2, the 2D art); the classroom focus (ARCADE off): builder-focus.test.js
config.builderFullForAll = false; config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { q, now } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.CLASSROOM_SHOTS || '';

let server, BASE, browser, n = 0;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
/** A signed-in page on /build/new: a teacher (school staff) or a kid. */
async function open({ teacher, ...ctxOpts }) {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage();
  const name = `${teacher ? 'Teach' : 'Kid'}Room${'ABCDEFGHIJ'[n++]}`;
  const r = await page.request.post(`${BASE}/api/auth/signup`, { data: { username: name, password: 'secret12' } }); assert.equal(r.status(), 200, await r.text());
  if (teacher) { const u = auth.getUserByName(name), school = S.createSchool(u, { name: `School ${name}` }).school; q.run('INSERT INTO school_members(school_id, user_id, role, joined_at) VALUES (?,?,?,?)', school.id, u.id, 'teacher', now()); }
  const errors = []; page.on('pageerror', e => errors.push(String(e)));
  // a teacher starts on Classroom activity: Arcade game, then "Help me choose" (today's steps)
  await page.goto(`${BASE}/build/new`); if (teacher) await page.click('.su-kind[data-kind="arcade"]'); await page.click('#su-guide');
  await page.waitForSelector('.su-screen[data-screen="type"]:not([hidden])');
  return { ctx, page, errors };
}
const visibleCards = page => page.$$eval('.su-screen[data-screen="type"] .su-card', els => els.filter(e => e.offsetParent !== null).map(e => e.dataset.card));
const next = page => page.click('.su-screen:not([hidden]) [data-go="next"]');
const screen = page => page.$eval('.su-screen:not([hidden])', el => el.dataset.screen);
const noScroll = page => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);

for (const [label, opts] of [['desktop', { viewport: { width: 1280, height: 800 } }], ['iPhone', devices['iPhone 13'] ? { ...devices['iPhone 13'], defaultBrowserType: undefined } : { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  test(`teacher, ${label}: "For your class" is shown first; a survey skips to the extras and the plan lists two steps`, { skip }, async () => {
    const { ctx, page, errors } = await open({ teacher: true, ...opts });
    assert.deepEqual(await page.$$eval('[data-tgroup-btn]', b => b.map(x => `${x.dataset.tgroupBtn}:${x.getAttribute('aria-pressed')}`)), ['class:true', 'games:false']);
    assert.deepEqual(await visibleCards(page), ['quiet', 'categories', 'survey', 'bingo', 'flashcards', 'exitticket', 'spinner', 'scoreboard', 'quiz', 'word', 'memory', 'else']);
    assert.ok(await noScroll(page));
    const sizes = await page.$$eval('.su-screen[data-screen="type"] .su-card', els => [...new Set(els.filter(e => e.offsetParent !== null).map(e => { const r = e.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}`; }))]);
    assert.equal(sizes.length, 1, `every card one size (${sizes})`);
    if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: `${SHOTS}/type-step-teacher-${label}.png`, fullPage: true }); }
    await page.click('.su-pick[data-step="type"][data-id="survey"]');
    assert.match(await page.textContent('.su-screen[data-screen="type"] .su-count'), /Step 1 of 3/);
    // the games are one tap away, and the pick is kept while they look
    await page.click('[data-tgroup-btn="games"]');
    assert.deepEqual(await visibleCards(page), ['adventure', 'runner', 'catch', 'duel', 'board', 'else']);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/type-step-teacher-${label}-games.png`, fullPage: true });
    await page.click('[data-tgroup-btn="class"]');
    assert.equal(await page.getAttribute('.su-pick[data-id="survey"]', 'aria-pressed'), 'true');
    await next(page); assert.equal(await screen(page), 'play', 'no 2D or 3D, world or characters for a survey');
    assert.match(await page.textContent('.su-screen[data-screen="play"] .su-count'), /Step 2 of 3/);
    await next(page); assert.equal(await screen(page), 'extras', 'and nothing to teach');
    assert.match(await page.textContent('.su-screen[data-screen="extras"] .su-count'), /Step 3 of 3/);
    await page.fill('#su-notes', 'about our school trip'); await next(page);
    assert.equal(await screen(page), 'plan');
    assert.deepEqual(await page.$$eval('#su-rows dt', d => d.map(x => x.textContent)), ['Game type', 'How it is played', 'Extras']);
    await page.waitForFunction(() => document.getElementById('su-told').textContent.length > 5 && document.getElementById('su-told').textContent !== '…');
    assert.equal(await page.textContent('#su-told'), 'Here is my game plan. Kind of game: Class survey. We play it together on one screen. about our school trip.');
    await page.click('#su-plan [data-go="back"], .su-screen[data-screen="plan"] [data-go="back"]');
    assert.equal(await screen(page), 'extras', 'Back skips the same steps');
    assert.deepEqual(errors, []); await ctx.close();
  });
}

test('kid: the games first in today\'s order, kid-suitable classroom types one tap away; bingo skips to "How will it be played?"', { skip }, async () => {
  const { ctx, page, errors } = await open({ teacher: false, viewport: { width: 390, height: 844 } });
  assert.deepEqual(await page.$$eval('[data-tgroup-btn]', b => b.map(x => `${x.dataset.tgroupBtn}:${x.getAttribute('aria-pressed')}`)), ['games:true', 'class:false']);
  assert.deepEqual(await visibleCards(page), ['adventure', 'runner', 'catch', 'quiz', 'memory', 'word', 'duel', 'board', 'else']);
  await page.click('[data-tgroup-btn="class"]');
  assert.deepEqual(await visibleCards(page), ['quiet', 'categories', 'bingo', 'flashcards', 'spinner', 'scoreboard', 'else']);
  await page.click('.su-pick[data-step="type"][data-id="bingo"]');
  await next(page); assert.equal(await screen(page), 'play'); assert.match(await page.textContent('.su-screen[data-screen="play"] .su-count'), /Step 2 of 4/);
  await next(page); assert.equal(await screen(page), 'learn'); assert.match(await page.textContent('.su-screen[data-screen="learn"] .su-count'), /Step 3 of 4/);
  await page.click('.su-screen[data-screen="learn"] [data-go="back"]');
  // changing to a game brings every step back
  await page.click('.su-screen[data-screen="play"] [data-go="back"]'); await page.click('[data-tgroup-btn="games"]');
  await page.click('.su-pick[data-step="type"][data-id="runner"]'); await next(page);
  assert.equal(await screen(page), 'look'); assert.match(await page.textContent('.su-screen[data-screen="look"] .su-count'), /Step 2 of 7/);
  assert.ok(await noScroll(page));
  assert.deepEqual(errors, []); await ctx.close();
});
