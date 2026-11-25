// Homeroom, Classroom and Dashboard as one page with three views, in a real browser (public/js/class-views.js,
// server/routes/homeroom-views.js; docs/decisions.md "Homeroom: one page, three views"). Homeroom -> Classroom ->
// Dashboard -> Homeroom never loads the page again (a value set on window survives, one navigation entry); the address
// follows, Back and Forward move between views, a reload and a link open the view the address names; Homeroom's zoom
// and place, Classroom's tab and scroll are kept; a key pressed once acts once, and only in the view on screen; the
// shared bar is at the same place and height on every view (1366 x 768, 1000 x 600, a phone) with nothing sideways, and
// every button in it whole at 390, 820, 1024 and 1366 (a live class too); no errors. A teacher without Homeroom keeps
// the separate pages. Chromium only (Playwright's WebKit is not installed here). HRVIEWS_SHOTS=<dir> saves screenshots there.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { startSession, createUser, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HS = await import('../../server/services/homeroom-staged.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const { q } = await import('../../server/db.js');
const { OFFICIAL, getUserByName } = await import('../../server/auth.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launchChromium() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.HRVIEWS_SHOTS || '';
let browser = null, skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HvBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Views Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
const plain = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Plain', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '4B Math', teacherId: teacher.id }).class;
const cls2 = S.createClass(boss, oak.id, { name: '5C Science', teacherId: teacher.id }).class;
const plainCls = S.createClass(boss, oak.id, { name: '3A Plain', teacherId: plain.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kai', 'Lu'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
// a game to stage on My desk and to hand out (the playing layer)
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const game = games.createGame(official.id, { title: 'Fraction Pizza' });
const gv = games.addVersion(game.id, '<!doctype html><title>x</title><p>Pizza game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug='fraction-pizza-hv', icon='🍕' WHERE id=?", gv.id, game.id);
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launchChromium(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(url, { viewport = { width: 1366, height: 768 }, who = teacher, touch = false, reduced = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.goto(`${BASE}${url}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `hrviews-${name}.png`) }); };
const view = page => page.evaluate(() => document.getElementById('cv')?.dataset.view || '');
const shown = (page, k) => page.waitForFunction(k2 => document.getElementById('cv')?.dataset.view === k2 && !document.querySelector(`.cv-view[data-cv-view="${k2}"]`).hidden, k, { timeout: 15000 });
async function goView(page, k) { await page.click(`#cv-bar a[data-cv-go="${k}"]`); await shown(page, k); await page.waitForTimeout(350); }
const barBox = page => page.evaluate(() => { const r = document.getElementById('cv-bar').getBoundingClientRect(); return { y: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) }; });
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('Homeroom -> Classroom -> Dashboard -> Homeroom without loading the page again; Back, Forward, reload', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}/homeroom`);
  await page.waitForSelector('.hr-desk');
  await page.evaluate(() => { window.__sentinel = 'still here'; });
  const zoom0 = await page.evaluate(() => document.querySelector('#hr-zoom .rm-pct')?.textContent);
  // zoom in twice and pan: kept across the views
  await page.click('[data-hr="zin"]'); await page.click('[data-hr="zin"]');
  const b = await page.locator('#hr-board').boundingBox();
  await page.mouse.move(b.x + b.width * 0.7, b.y + b.height * 0.8); await page.mouse.down(); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.7, { steps: 6 }); await page.mouse.up();
  const before = await page.evaluate(() => ({ t: document.getElementById('hr-world').style.transform, pct: document.querySelector('#hr-zoom .rm-pct').textContent }));
  assert.notEqual(before.pct, zoom0);
  const bar0 = await barBox(page);
  await shot(page, '1366-homeroom');

  await goView(page, 'classroom');
  assert.equal(new URL(page.url()).pathname, `/class/${cls.id}`);
  assert.ok(await page.isVisible('.classtabs'), 'the class page is in the view');
  assert.deepEqual(await barBox(page), bar0, 'the bar does not move');
  await shot(page, '1366-classroom');

  await goView(page, 'dashboard');
  assert.equal(new URL(page.url()).pathname, `/class/${cls.id}/dashboard`);
  await page.waitForSelector('#dash-grid .dash-w');
  assert.deepEqual(await barBox(page), bar0, 'the bar does not move');
  await shot(page, '1366-dashboard');

  await goView(page, 'homeroom');
  assert.equal(new URL(page.url()).pathname, `/class/${cls.id}/homeroom`);
  const after = await page.evaluate(() => ({ t: document.getElementById('hr-world').style.transform, pct: document.querySelector('#hr-zoom .rm-pct').textContent }));
  assert.deepEqual(after, before, 'zoom and place kept');
  assert.equal(await page.evaluate(() => window.__sentinel), 'still here', 'never loaded again');
  assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation').length), 1);

  // Back: Dashboard, then Classroom; Forward: Dashboard
  await page.goBack(); await shown(page, 'dashboard');
  assert.equal(new URL(page.url()).pathname, `/class/${cls.id}/dashboard`);
  await page.goBack(); await shown(page, 'classroom');
  await page.goForward(); await shown(page, 'dashboard');
  assert.equal(await page.evaluate(() => window.__sentinel), 'still here');
  // a reload opens the view the address names
  await page.reload(); await shown(page, 'dashboard');
  assert.equal(await page.evaluate(() => window.__sentinel), undefined);
  assert.ok(await page.isVisible('#dash-grid'));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('keys go to the view on screen, once: Delete on Homeroom deletes one note, never while Classroom is on screen', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'One', x: 0.1, y: 0.2 }, { id: 'n2', text: 'Two', x: 0.5, y: 0.2 }], texts: [], strokes: [] }, shapes: [] });
  const { ctx, page, errors } = await open(`/class/${cls.id}/homeroom`);
  await page.waitForSelector('.hr-desk');
  // there and back twice: nothing bound twice
  for (let i = 0; i < 2; i++) { await goView(page, 'classroom'); await goView(page, 'dashboard'); await goView(page, 'homeroom'); }
  const note = page.locator('.hr-area .mp-notes > *').first();
  const box = await note.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + 8);
  await page.waitForTimeout(200);
  // selected, then Classroom: Delete there must not touch the board
  await goView(page, 'classroom');
  await page.locator('body').press('Delete');
  await page.waitForTimeout(700);
  assert.equal(H.roomOf(cls.id).area.__ann.notes.length, 2, 'not deleted from another view');
  await goView(page, 'homeroom');
  await page.locator('#hr-board').press('Delete');
  for (let i = 0; i < 30 && H.roomOf(cls.id).area.__ann.notes.length === 2; i++) await page.waitForTimeout(100);
  assert.equal(H.roomOf(cls.id).area.__ann.notes.length, 1, 'one key, one note');
  // the dashboard's live check runs only while it is on screen
  let checks = 0; page.on('request', r => { if (/\/api\/dash\/[^/]+\/live/.test(r.url())) checks++; });
  await page.waitForTimeout(5000);
  assert.equal(checks, 0, 'no dashboard checks while Homeroom is on screen');
  await goView(page, 'dashboard');
  await page.waitForTimeout(500);
  assert.ok(checks >= 1, 'the dashboard asks as soon as it is shown');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Classroom keeps its tab and scroll; deep links and a reload on every view; the switcher; reduced motion', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${cls.id}?tab=students`, { reduced: true });
  await shown(page, 'classroom');
  await page.evaluate(() => scrollTo(0, 400)); await page.waitForTimeout(100);
  const y = await page.evaluate(() => Math.round(scrollY));
  assert.ok(y > 100);
  await goView(page, 'homeroom');
  assert.equal(await page.evaluate(() => scrollY), 0);
  await goView(page, 'classroom');
  assert.equal(new URL(page.url()).search, '?tab=students');
  assert.ok(Math.abs(await page.evaluate(() => scrollY) - y) < 4, 'scroll kept');
  // a new page on Homeroom (same tab): Classroom opens where it was left
  await page.goto(`${BASE}/class/${cls.id}/homeroom`); await shown(page, 'homeroom');
  assert.match(await page.getAttribute('#cv-bar a[data-cv-go="classroom"]', 'href'), /\?tab=students$/);
  await goView(page, 'classroom');
  assert.equal(new URL(page.url()).search, '?tab=students');
  // each view by its address and after a reload
  for (const [k, u] of [['homeroom', `/class/${cls.id}/homeroom`], ['dashboard', `/class/${cls.id}/dashboard`], ['classroom', `/class/${cls.id}/progress`]]) {
    await page.goto(`${BASE}${u}`); await shown(page, k);
    await page.reload(); await shown(page, k);
    assert.equal(await sideways(page), 0, k);
  }
  // another class from the switcher: the same view of it
  await page.selectOption('#hr-class', cls2.id);
  await page.waitForURL(`${BASE}/class/${cls2.id}`);
  await shown(page, 'classroom');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the shared bar: same place and height on every view at 1366 x 768, 1000 x 600 and a phone; nothing sideways', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, viewport] of [['1366', { width: 1366, height: 768 }], ['1000', { width: 1000, height: 600 }], ['phone', { width: 390, height: 844 }]]) {
    const { ctx, page, errors } = await open(`/class/${cls.id}/homeroom`, { viewport, touch: name === 'phone' });
    await page.waitForSelector('.hr-desk');
    const bar = await barBox(page);
    if (name !== '1366') await shot(page, `${name}-homeroom`);
    for (const k of ['classroom', 'dashboard']) {
      await goView(page, k);
      assert.deepEqual(await barBox(page), bar, `${name} ${k}`);
      assert.equal(await sideways(page), 0, `${name} ${k}`);
      if (name !== '1366') await shot(page, `${name}-${k}`);
    }
    // the bar's buttons all fit on one row (nothing scrolls inside it) on a laptop
    if (name !== 'phone') for (const k of ['homeroom', 'classroom', 'dashboard']) {
      await goView(page, k);
      const fit = await page.evaluate(k2 => { const a = document.querySelector(`[data-cv-acts="${k2}"]`); return [a.scrollWidth, a.clientWidth]; }, k);
      assert.ok(fit[0] <= fit[1] + 1, `${name} ${k}: the buttons fit (${fit})`);
    }
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
  // a frame in the middle of a switch (the fade)
  if (SHOTS) {
    const { ctx, page } = await open(`/class/${cls.id}/homeroom`);
    await page.waitForSelector('.hr-desk'); await goView(page, 'dashboard'); await goView(page, 'homeroom');
    await page.click('#cv-bar a[data-cv-go="dashboard"]'); await page.waitForTimeout(150);
    await shot(page, 'midswitch');
    await ctx.close();
  }
});

// Every control in the shared bar, whole and on screen: none cut off by the bar's button row (or anything else that
// clips) or by the window, and nothing scrolls inside the row.
const clippedInBar = page => page.evaluate(() => {
  const bar = document.getElementById('cv-bar'), out = [];
  for (const el of bar.querySelectorAll('button, a, select, summary, .dash-now, .hr-livedot')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    let l = 0, rt = innerWidth;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (getComputedStyle(p).overflowX !== 'visible') { const b = p.getBoundingClientRect(); l = Math.max(l, b.left); rt = Math.min(rt, b.right); }
    }
    if (r.left < l - 1 || r.right > rt + 1) out.push(`${(el.getAttribute('aria-label') || el.textContent || el.tagName).trim().slice(0, 30)} ${Math.round(r.left)}..${Math.round(r.right)} in ${Math.round(l)}..${Math.round(rt)}`);
  }
  for (const a of bar.querySelectorAll('.cv-acts')) if (a.getClientRects().length && a.scrollWidth > a.clientWidth + 1) out.push(`${a.dataset.cvActs} scrolls (${a.scrollWidth} > ${a.clientWidth})`);
  return out;
});

test('the shared bar fits at 390, 820, 1024 and 1366 on every view (and live): no button cut off, nothing sideways', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls2, 'start');
  try {
    for (const width of [390, 820, 1024, 1366]) {
      const viewport = { width, height: width < 600 ? 844 : width === 820 ? 1180 : 768 }, touch = width < 1366;
      const { ctx, page, errors } = await open(`/class/${cls.id}/homeroom`, { viewport, touch });
      await page.waitForSelector('.hr-desk');
      const bar = await barBox(page);
      for (const k of ['homeroom', 'classroom', 'dashboard']) {
        if (k !== 'homeroom') await goView(page, k);
        if (k === 'dashboard') await page.waitForSelector('#dash-grid .dash-w');
        await page.waitForTimeout(200);
        assert.deepEqual(await clippedInBar(page), [], `${width} ${k}: every button whole`);
        assert.equal(await sideways(page), 0, `${width} ${k}: nothing sideways`);
        assert.deepEqual(await barBox(page), bar, `${width} ${k}: the bar keeps its place and height`);
        if (width === 820 || width === 1024) await shot(page, `fit-${width}-${k}`);
      }
      assert.deepEqual(errors, [], `${width}`);
      await ctx.close();
      // a live class: more buttons in Homeroom's bar (Today, Hands, Pause screens, Bring everyone to me)
      const live = await open(`/class/${cls2.id}/homeroom`, { viewport, touch });
      await live.page.waitForSelector('#hr-livebtns .hr-pausebtn');
      await live.page.waitForTimeout(200);
      assert.deepEqual(await clippedInBar(live.page), [], `${width} live: every button whole`);
      assert.equal(await sideways(live.page), 0, `${width} live`);
      if (width === 820 || width === 1024) await shot(live.page, `fit-${width}-live`);
      assert.deepEqual(live.errors, [], `${width} live`);
      await live.ctx.close();
    }
  } finally { H.setLive(teacher, cls2, 'end'); }
});

test('a teacher without Homeroom: the class page and the dashboard as before', { timeout: 60000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(`/class/${plainCls.id}`, { who: plain });
  assert.equal(await page.$('#cv'), null);
  await page.click('#class-dash-link');
  await page.waitForURL(`${BASE}/class/${plainCls.id}/dashboard`);
  await page.waitForSelector('#dash-grid .dash-w');
  assert.ok(await page.isVisible('.dash-logo')); assert.equal(await page.$('.topbar'), null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('play inside Homeroom: Play on a My desk card opens the game over the board; Back, Escape and a reload', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const st = HS.stage(teacher, cls, { pick: game.id }); assert.ok(st.ok, st.code);
  const { ctx, page, errors } = await open(`/class/${cls.id}/homeroom`);
  await page.waitForSelector('[data-hrstaged]');
  await page.evaluate(() => { window.__sentinel = 'kept'; });
  await page.click('[data-hr="zin"]');
  const before = await page.evaluate(() => document.getElementById('hr-world').style.transform);
  await page.click('[data-hrstaged]');
  await page.click('[data-sm="play"]');
  await page.waitForSelector('.hr-player iframe');
  assert.match(page.url(), /#play=/);
  const frame = page.frameLocator('.hr-player iframe');
  await frame.locator('#stage').waitFor({ timeout: 10000 });
  assert.equal(await frame.locator('.playbar > a.iconbtn').first().isVisible(), false, 'the game page\'s own Back gives way to the layer\'s');
  assert.match(await page.textContent('.hr-playback'), /Back to Homeroom/);
  await shot(page, 'player-teacher');
  // Escape closes (the game in the frame keeps its own keys: here the layer's bar has the focus); the board is as it was
  await page.focus('.hr-playback'); await page.keyboard.press('Escape');
  await page.waitForSelector('.hr-player', { state: 'detached' });
  assert.doesNotMatch(page.url(), /#play=/);
  assert.equal(await page.evaluate(() => document.getElementById('hr-world').style.transform), before);
  // again, then the browser's Back closes it; a reload with the address reopens it
  await page.click('[data-hrstaged]'); await page.click('[data-sm="play"]'); await page.waitForSelector('.hr-player');
  await page.goBack(); await page.waitForSelector('.hr-player', { state: 'detached' });
  assert.equal(await page.evaluate(() => window.__sentinel), 'kept', 'never left the page');
  await page.goto(`${BASE}/class/${cls.id}/homeroom#play=${encodeURIComponent(st.id || HS.storedOf(cls.id)[0].id)}`);
  await page.reload();
  await page.waitForSelector('.hr-player iframe');
  await page.click('.hr-playback'); await page.waitForSelector('.hr-player', { state: 'detached' });
  // a phone: the layer under the shared bar
  const ph = await open(`/class/${cls.id}/homeroom`, { viewport: { width: 390, height: 844 }, touch: true });
  await ph.page.waitForSelector('[data-hrstaged]', { state: 'attached' });
  await ph.page.evaluate(id => { location.hash = `play=${encodeURIComponent(id)}`; }, HS.storedOf(cls.id)[0].id);
  await ph.page.reload(); await ph.page.waitForSelector('.hr-player iframe');
  const top = await ph.page.evaluate(() => [document.getElementById('cv-bar').getBoundingClientRect().bottom, document.querySelector('.hr-player').getBoundingClientRect().top]);
  assert.ok(top[1] >= top[0] - 1, 'below the shared bar');
  assert.equal(await sideways(ph.page), 0);
  await shot(ph.page, 'player-teacher-phone');
  await ph.ctx.close();
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a student plays a handout inside the desk: one pulse, Pause screens over it, closing shows the progress', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const ada = kids[0];
  const ho = HO.handOut(teacher, cls, { gameId: game.id, to: { kind: 'desk', id: ada.id } });
  assert.ok(ho.ok, ho.code);
  H.setLive(teacher, cls, 'start');
  try {
    const { ctx, page, errors } = await open(`/class/${cls.id}/desk`, { who: ada, viewport: { width: 1180, height: 820 }, touch: true });
    await page.waitForSelector('a.hd-card');
    await page.evaluate(() => { window.__sentinel = 'desk'; });
    const pulses = { desk: 0, game: 0 };
    page.on('request', r => { if (/\/api\/desk\/[^/]+\/pulse/.test(r.url()) && r.method() === 'POST') { try { pulses[JSON.parse(r.postData()).where]++; } catch { /* other */ } } });
    await page.click('a.hd-card');
    await page.waitForSelector('.hr-player iframe');
    assert.match(page.url(), /\/desk#play=/);
    assert.ok(await page.isVisible('[data-hd="hand"]'), 'Raise hand stays');
    await page.frameLocator('.hr-player iframe').locator('#stage').waitFor({ timeout: 10000 });
    await page.waitForTimeout(3500);
    assert.equal(pulses.desk, 0, 'the desk rests while the game page pulses'); assert.ok(pulses.game >= 1, 'the game pulses');
    await shot(page, 'player-desk');
    // Pause screens: over the game
    H.setLive(teacher, cls, 'pause');
    await page.waitForSelector('#hd-over .hd-pause', { timeout: 10000 });
    const onTop = await page.evaluate(() => { const r = document.querySelector('.hr-player').getBoundingClientRect(); const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!el.closest('#hd-over'); });
    assert.ok(onTop, 'Pause screens covers the game');
    await shot(page, 'player-desk-paused');
    H.setLive(teacher, cls, 'resume');
    await page.waitForSelector('#hd-over .hd-pause', { state: 'detached', timeout: 10000 });
    // they play a while; closing brings the card's progress
    const step = L.steps(L.getClassLesson(ho.classLesson.id).lesson_id)[0];
    assert.ok(P.gameTime(ada, ho.classLesson.id, step.id, 60).ok);
    await page.click('.hr-playback');
    await page.waitForSelector('.hr-player', { state: 'detached' });
    await page.waitForFunction(() => { const i = document.querySelector('a.hd-card .hd-cbar i'); return i && parseFloat(i.style.width) > 0; }, null, { timeout: 8000 });
    assert.equal(await page.evaluate(() => window.__sentinel), 'desk');
    // a reload with the address opens it again; Back closes it
    await page.click('a.hd-card'); await page.waitForSelector('.hr-player');
    await page.reload(); await page.waitForSelector('.hr-player iframe');
    await page.goBack(); await page.waitForSelector('.hr-player', { state: 'detached' });
    assert.deepEqual(errors, []);
    await ctx.close();
  } finally { H.setLive(teacher, cls, 'end'); }
});
