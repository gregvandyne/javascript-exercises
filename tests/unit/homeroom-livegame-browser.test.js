// Homeroom: live games inside Homeroom, a simpler Find lessons, several at once, in a real browser (docs/decisions.md
// "Homeroom: live games inside Homeroom, a simpler Find lessons"):
//   - Find lessons: search first, one row of chips, cards in a grid in groups (Games, Live games, Teaching tools, then
//     the teacher's lessons and lesson plans at the bottom), See all, a chip's grid, a tool's practice by tool; tap a
//     card then a desk hands it out; on a phone the sheet, and a finger still drags a card onto a desk (390);
//   - several at once: Select, three cards, Hand out to a group: all three on those desks in the order picked (laptop and
//     390); a selection dragged onto a desk goes there with the defaults;
//   - Brain Board and Would You Rather Live hosted from Homeroom without leaving it (the address stays on the board), a
//     student's desk brought into the game by itself and back to the desk when it ends, the pill (fold and open), the
//     desks' "In Brain Board", the projector showing the game's host screen, End from the pill.
// Screenshots with HR_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
config.liveClassroom = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { attachUpgrades } = await import('../../server/services/upgrade.js');
const classlive = await import('../../server/services/classlive-socket.js');
const manipSocket = await import('../../server/services/manip-socket.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const LS = await import('../../server/services/classlive-sessions.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrlive-${name}.png` }) : null);

const boss = createUser({ username: 'HlgBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Live Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Reyes', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo, dev] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
// a group: Ada and Ben
const { GROUP_COLORS } = await import('../../public/js/homeroom-seats.js');
if (!H.saveGroups(teacher, cls, { groups: [{ id: 'gs', name: 'Stretch', color: GROUP_COLORS[0] }], members: { [ada.id]: 'gs', [ben.id]: 'gs' } }).ok) throw new Error('groups');
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, htmlText = `<title>${title}</title><h1>${title}</h1>`) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, htmlText, { createdBy: official.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?`, v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
const sumRacer = made('Sum Racer', 'sum-racer', '🏎️');
const wordHunt = made('Word Hunt', 'word-hunt', '🔎');
const sudoku = made('Sudoku', 'sudoku', '🔢');
const typing = made('Typing Zoo', 'typing-zoo', '⌨️');
// the real live games (their own pages: a live game must be live-ready to host)
made('Brain Board', 'brain-board', '🌟', fs.readFileSync('seed-games/brain-board.html', 'utf8'));
made('Would You Rather Live', 'would-you-rather-live', '🤔', fs.readFileSync('seed-games/would-you-rather-live.html', 'utf8'));
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  // (the live games' socket and the Manipulatives room's, as server/index.js: a bare listen() would 404 them)
  attachUpgrades(server, [classlive.route, manipSocket.route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { for (const s of LS.openSessions()) LS.endSession(s.id); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, viewport, { touch = false, ctx = null } = {}) {
  ctx = ctx || await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1366, height: 768 }, TABLET = { width: 820, height: 1180 }, PHONE = { width: 390, height: 844 };
const board = () => `/class/${cls.id}/homeroom`, desk = () => `/class/${cls.id}/desk`;
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const box = (page, sel) => page.locator(sel).first().boundingBox();
const mid = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
async function finger(ctx, page, pts, { wait = 16, holdMs = 0 } = {}) {
  const s = await ctx.newCDPSession(page);
  await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (const p of pts.slice(1)) { await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] }); await page.waitForTimeout(wait); }
  await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
const cardsOf = sid => { const v = HO.boardView(cls); return (v.desks[sid] || []).map(d => v.handouts.find(h => h.id === d.id)).filter(Boolean); };
// (in the order they show: top to bottom, then left to right)
const visibleTitles = (page, sel) => page.$$eval(`${sel} .hr-cc:not([hidden]) .hr-itemt`, l => l.filter(x => x.offsetParent).map(x => ({ r: x.getBoundingClientRect(), t: x.textContent.trim() })).sort((a, b) => Math.round(a.r.top / 20) - Math.round(b.r.top / 20) || a.r.left - b.r.left).map(x => x.t));

// ---------------------------------------------------------------- Find lessons
test('Find lessons: search first, one row of chips, cards in groups (Games, Live, Teaching tools, then lessons), See all, a chip, tap a card then a desk', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const P = '#hr-panel';
  // the order, top to bottom: search, chips, then Games, Live games, Teaching tools, lessons and lesson plans
  const order = await T.page.$$eval(`${P} [data-catalog] > *`, l => l.map(x => x.dataset.csec || (x.matches('.hr-cfind') ? 'find' : '')).filter(Boolean));
  assert.deepEqual(order, ['find', 'games', 'live', 'tools', 'lessons']);
  assert.match(await T.page.textContent(`${P} [data-csec="games"] .hr-cap`), /^Games$/);
  // one row of chips, scrolling sideways (never two rows): All, Games, the subjects (Typing, not Coding), Live games...
  const chips = await T.page.$$eval(`${P} .hr-csubjects [data-csubj]:not([hidden])`, l => l.map(x => x.textContent.trim()));
  for (const c of ['All', 'Games', 'Words', 'Typing', 'Live games', 'Teaching tools', 'Lesson plans']) assert.ok(chips.some(x => x.endsWith(c)), `chip ${c}: ${chips}`);
  assert.ok(!chips.some(x => /Coding/.test(x)), 'Typing Zoo is under Typing');
  const rowH = await T.page.$eval(`${P} .hr-csubjects`, el => el.getBoundingClientRect().height);
  assert.ok(rowH < 52, `one row (${rowH})`);
  // cards: an icon, a name, what it is; nothing to expand; empty groups are not there (no "Lessons you build show here")
  assert.match(await T.page.textContent(`${P} [data-cgroup="s-typing"] .hr-ckind`), /Typing · Grades 1/);
  assert.equal(await T.page.locator(`${P} .hr-empty`).count(), 0);
  assert.equal(await T.page.locator(`${P} [data-cgroup="mine"]`).count(), 0, 'no own lessons yet: no group');
  assert.equal(await T.page.locator(`${P} .hr-cbuild`).count(), 1, 'a Build a lesson card at the end');
  // each part shows its first few (no group headers), See all shows the rest
  const g0 = `${P} [data-csec="tools"]`;
  const before = (await visibleTitles(T.page, g0)).length;
  assert.equal(before, 4);
  assert.equal(await T.page.isVisible(`${P} [data-cgroup="m-0"] .hr-csum`), false, 'no group headers under All');
  await T.page.click(`${g0} [data-cseeall]`);
  assert.ok((await visibleTitles(T.page, g0)).length > 4, 'See all');
  await T.page.waitForTimeout(200); await shot(T.page, 'find-1366');
  // a chip: one grid of what fits, no group headers
  await T.page.click(`${P} [data-csubj="live"]`);
  const live = await visibleTitles(T.page, P);
  assert.ok(live.includes('Brain Board') && live.includes('Would You Rather Live') && !live.includes('Sum Racer'), `live: ${live}`);
  await T.page.click(`${P} [data-csubj="tools"]`);
  const tools = await visibleTitles(T.page, P);
  assert.ok(tools.includes('Base Ten Blocks') && !tools.includes('Sum Racer'));
  await T.page.click(`${P} [data-csubj=""]`);
  // search: a tool, then its practice (by tool, then task)
  await T.page.fill('#hr-cq', 'base ten');
  const found = await visibleTitles(T.page, P);
  assert.equal(found[0], 'Base Ten Blocks'); assert.ok(found.length > 1);
  await T.page.fill('#hr-cq', '');
  // tap a card, then a desk: the sheet for that desk
  await T.page.click(`${P} [data-hritem="${sudoku.id}"]`);
  await T.page.click(`.hr-desk[data-sid="${cleo.id}"]`, { position: { x: 30, y: 30 } });
  await T.page.waitForSelector('.hr-giveform');
  assert.match(await T.page.locator('#sheet-title').innerText(), /Sudoku for Cleo/);
  await T.page.click('.hr-giveok'); await T.page.waitForSelector('.toast');
  assert.ok(cardsOf(cleo.id).some(x => x.title === 'Sudoku'));
  // recently handed out: Recent shows it, and it is first in its group next time
  await T.page.reload(); await T.page.waitForSelector('.hr-desk[data-sid]');
  assert.equal(await T.page.isVisible(`${P} [data-csubj="recent"]`), true);
  const firstGame = (await visibleTitles(T.page, `${P} [data-csec="games"]`))[0];
  assert.equal(firstGame, 'Sudoku', 'the one used last comes first');
  assert.ok(await sideways(T.page) <= 0);
  // 820: the tall panel, the same cards
  await T.page.setViewportSize(TABLET); await T.page.waitForTimeout(400); await shot(T.page, 'find-820');
  assert.ok(await sideways(T.page) <= 0);
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
});

test('Find lessons on a phone (390): the sheet, chips in one row, cards in a grid; a tap then a desk; a finger drags a card onto a desk', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), PHONE, { touch: true });
  await T.page.waitForSelector('.hr-desk[data-sid]');
  await T.page.evaluate(() => { const b = document.querySelector('[data-hr="catalog"]'), p = document.getElementById('hr-panel'); p.scrollLeft = b.offsetLeft - 20; });
  await T.page.locator('[data-hr="catalog"]').tap();
  await T.page.waitForSelector('.hr-csheet [data-cq]');
  const S = '.hr-csheet';
  const rowH = await T.page.$eval(`${S} .hr-csubjects`, el => el.getBoundingClientRect().height);
  assert.ok(rowH < 52, `one row of chips (${rowH})`);
  // two cards side by side, each a big target
  const [a, b] = await T.page.$$eval(`${S} [data-cgroup="m-0"] .hr-cc:not([hidden]) .hr-ccard`, l => l.slice(0, 2).map(x => { const r = x.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
  assert.ok(Math.abs(a.y - b.y) < 2 && b.x > a.x, 'two in a row');
  assert.ok(a.h >= 100 && a.w >= 140, `a big card (${a.w}x${a.h})`);
  assert.ok(await sideways(T.page) <= 0);
  await T.page.evaluate(() => document.activeElement && document.activeElement.blur());
  await T.page.waitForTimeout(300); await shot(T.page, 'find-390');
  // search and tap: the yellow bar; then a desk
  await T.page.fill(`${S} [data-cq]`, 'word');
  await T.page.locator(`${S} [data-hritem="${wordHunt.id}"]`).tap();
  await T.page.waitForSelector('#hr-givebar:not([hidden])');
  await T.page.locator('#hr-givebar [data-hrto="all"]').tap();
  await T.page.waitForSelector('.hr-giveform');
  await T.page.locator('[data-give="cancel"]').tap(); await T.page.waitForTimeout(300);
  await T.page.locator('#hr-givebar [data-hr="unpick"]').tap();
  // a finger: a short hold on a card in the sheet, then onto Dev's desk
  await T.page.locator('[data-hr="catalog"]').tap();
  await T.page.waitForSelector(`${S} [data-cq]`);
  await T.page.fill(`${S} [data-cq]`, 'sum');
  await T.page.evaluate(() => document.activeElement && document.activeElement.blur()); await T.page.waitForTimeout(300);
  const from = mid(await box(T.page, `${S} [data-hritem="${sumRacer.id}"]`)), to = mid(await box(T.page, `.hr-desk[data-sid="${dev.id}"]`));
  await finger(T.ctx, T.page, line(from, to, 12), { holdMs: 420 });
  await T.page.waitForSelector('.hr-giveform');
  assert.match(await T.page.locator('#sheet-title').innerText(), /Sum Racer for Dev/);
  await T.page.locator('[data-give="cancel"]').tap();
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
});

// ---------------------------------------------------------------- several at once
test('several at once: Select three, Hand out to a group, all three on those desks in the order picked (laptop and 390)', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const ids = await T.page.$$eval('#hr-panel [data-hritem^="T:task:base-ten-blocks"]', l => l.map(x => x.dataset.hritem));
  assert.ok(ids.length, 'base ten practice in the catalog');
  const picks = [wordHunt.id, sumRacer.id, ids[0]];
  await T.page.click('#hr-panel [data-cselect]');
  for (const id of picks) { await T.page.evaluate(i => { const el = document.querySelector(`#hr-panel [data-hritem="${i}"]`); el.closest('li').hidden = false; el.scrollIntoView({ block: 'center' }); }, id); await T.page.click(`#hr-panel [data-hritem="${id}"]`); }
  assert.match(await T.page.textContent('#hr-panel [data-cselbar]'), /3 selected/);
  assert.equal(await T.page.textContent(`#hr-panel [data-hritem="${sumRacer.id}"] .hr-ccheck`), '2', 'numbered in the order picked');
  // live games can't be picked: they host
  await T.page.waitForTimeout(100); await shot(T.page, 'select-1366');
  await T.page.click('#hr-panel [data-msel="go"]');
  await T.page.waitForSelector('#hr-givebar:not([hidden])');
  await T.page.click('#hr-givebar [data-hrto="group:gs"]');
  await T.page.waitForSelector('.hrm-form');
  assert.equal(await T.page.locator('.hrm-item').count(), 3);
  assert.equal(await T.page.inputValue(`[data-mgrade="${ids[0]}"]`), 'score', 'practice: by score');
  assert.equal(await T.page.inputValue(`[data-mgrade="${wordHunt.id}"]`), 'completion');
  await shot(T.page, 'select-sheet-1366');
  await T.page.click('.hrm-form .hr-giveok');
  await T.page.waitForSelector('.hrm-form', { state: 'detached' });
  for (const k of [ada, ben]) {
    const titles = cardsOf(k.id).map(x => x.title);
    assert.deepEqual(titles.slice(-3).slice(0, 2), ['Word Hunt', 'Sum Racer'], `${k.display_name}: ${titles}`);
    assert.equal(cardsOf(k.id).length >= 3, true);
  }
  assert.equal(cardsOf(cleo.id).filter(x => x.title === 'Word Hunt').length, 0, 'only the group');
  // the board shows them on the desks, in order
  await T.page.waitForFunction(id => document.querySelectorAll(`.hr-desk[data-sid="${id}"] [data-hrho]`).length >= 3, ada.id);
  // a selection dragged onto a desk: all of it goes there with the sheet's defaults (no sheet)
  await T.page.click('#hr-panel [data-cselect]');
  for (const id of [typing.id, wordHunt.id]) { await T.page.evaluate(i => { const el = document.querySelector(`#hr-panel [data-hritem="${i}"]`); el.closest('li').hidden = false; el.scrollIntoView({ block: 'center' }); }, id); await T.page.click(`#hr-panel [data-hritem="${id}"]`); }
  const from = mid(await box(T.page, `#hr-panel [data-hritem="${wordHunt.id}"]`)), to = mid(await box(T.page, `.hr-desk[data-sid="${cleo.id}"]`));
  await T.page.mouse.move(from.x, from.y); await T.page.mouse.down();
  for (const p of line(from, to, 12)) await T.page.mouse.move(p.x, p.y);
  await T.page.mouse.up();
  await T.page.waitForFunction(() => /Handed out/.test(document.getElementById('toasts').textContent), null, { timeout: 10000 });
  assert.deepEqual(cardsOf(cleo.id).map(x => x.title).filter(x => x !== 'Sudoku'), ['Typing Zoo', 'Word Hunt']);
  assert.equal(await T.page.locator('.hrm-form').count(), 0, 'no sheet for a drop');
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
  // 390: the same in the sheet, to Dev's desk (a tap on the desk after Hand out)
  const P = await open(teacher, board(), PHONE, { touch: true });
  await P.page.waitForSelector('.hr-desk[data-sid]');
  await P.page.evaluate(() => { const b = document.querySelector('[data-hr="catalog"]'), p = document.getElementById('hr-panel'); p.scrollLeft = b.offsetLeft - 20; });
  await P.page.locator('[data-hr="catalog"]').tap();
  await P.page.waitForSelector('.hr-csheet [data-cselect]');
  await P.page.locator('.hr-csheet [data-cselect]').tap();
  for (const id of [sudoku.id, wordHunt.id, ids[0]]) { await P.page.evaluate(i => { const el = document.querySelector(`.hr-csheet [data-hritem="${i}"]`); el.closest('li').hidden = false; el.scrollIntoView({ block: 'center' }); }, id); await P.page.locator(`.hr-csheet [data-hritem="${id}"]`).tap(); }
  assert.match(await P.page.textContent('.hr-csheet [data-cselbar]'), /3 selected/);
  await P.page.waitForTimeout(200); await shot(P.page, 'select-390');
  assert.ok(await sideways(P.page) <= 0);
  await P.page.locator('.hr-csheet [data-msel="go"]').tap();
  await P.page.waitForSelector('#hr-givebar:not([hidden])');
  await P.page.locator(`.hr-desk[data-sid="${dev.id}"]`).tap({ position: { x: 20, y: 20 } });
  await P.page.waitForSelector('.hrm-form');
  await P.page.locator('.hrm-form .hr-giveok').tap();
  await P.page.waitForSelector('.hrm-form', { state: 'detached' });
  const devTitles = cardsOf(dev.id).map(x => x.title);
  assert.deepEqual(devTitles.slice(0, 2), ['Sudoku', 'Word Hunt'], `Dev: ${devTitles}`);
  assert.equal(devTitles.length, 3);
  assert.deepEqual(P.errors, []);
  await P.ctx.close();
});

// ---------------------------------------------------------------- live games inside Homeroom
const inFrame = (page, sel = '.hr-liveframe') => page.waitForFunction(s => { const f = document.querySelector(s); try { return f && f.contentWindow.location.pathname; } catch { return ''; } }, sel);
const framePath = (page, sel = '.hr-liveframe') => page.evaluate(s => { const f = document.querySelector(s); try { return f.contentWindow.location.pathname; } catch { return ''; } }, sel);
async function startFromLanding(page) {
  const f = page.frameLocator('.hr-liveframe');
  await f.locator('#lv-new').waitFor({ timeout: 20000 });
  // the landing's steps: Next until the game is made (the frame moves on to its host screen)
  for (let i = 0; i < 8; i++) {
    if ((await framePath(page)).startsWith('/live/host/')) return;
    const next = f.locator('#lv-nav [data-go="next"]');
    if (await next.isVisible().catch(() => false)) await next.click(); else await f.locator('#lv-new [type="submit"]:visible').first().click().catch(() => {});
    await page.waitForTimeout(500);
  }
  await page.waitForFunction(() => { const fr = document.querySelector('.hr-liveframe'); try { return fr.contentWindow.location.pathname.startsWith('/live/host/'); } catch { return false; } }, null, { timeout: 20000 });
}

test('Brain Board hosted from Homeroom: the layer, the class already chosen, the address stays; desks join by themselves; the pill; the projector; End', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const url0 = T.page.url();
  await T.page.click('#hr-panel [data-csubj="live"]');
  await T.page.click('#hr-panel [data-hrlive*="mode=board"]');
  await T.page.waitForSelector('.hr-liveplayer:not([hidden]) .hr-liveframe');
  await inFrame(T.page);
  assert.match(await T.page.$eval('.hr-liveframe', f => f.src), /\/live\?mode=board&class=.*&in=hr/);
  // the real landing, without the site's chrome, set to the class
  const f = T.page.frameLocator('.hr-liveframe');
  await f.locator('#lv-new').waitFor();
  assert.equal(await f.locator('header.top, nav.tabs, footer.foot').count(), 0, 'no site menu or footer in the layer');
  await T.page.waitForTimeout(300); await shot(T.page, 'host-setup-1366');
  await startFromLanding(T.page);
  assert.equal(T.page.url(), url0, 'the address stays on the board');
  const s = LS.openForClass(cls.id);
  assert.ok(s && s.mode === 'board' && s.audience === 'class', 'a Brain Board for the class');
  // a student's desk: brought in by itself, no code
  const A = await open(ada, desk(), TABLET, { touch: true });
  await A.page.waitForSelector('.hr-player .hr-playframe');
  await A.page.waitForFunction(() => { const fr = document.querySelector('.hr-player .hr-playframe'); try { return fr.contentWindow.location.pathname.startsWith('/live/play/'); } catch { return false; } }, null, { timeout: 20000 });
  await A.page.frameLocator('.hr-player .hr-playframe').locator('body.lv-player-page').waitFor();
  await LSwait(() => [...s.seats.values()].some(x => x.userId === ada.id && x.conn), 'Ada is in the game');
  await A.page.waitForTimeout(800); await shot(A.page, 'desk-in-game-820');
  // the teacher: Back to Homeroom folds it into the pill, with how many joined; desks say In Brain Board
  await T.page.click('.hr-liveplayer [data-lg="min"]');
  await T.page.waitForSelector('#hr-lgpill');
  assert.equal(await T.page.isVisible('.hr-liveplayer'), false);
  await T.page.waitForFunction(() => /1 joined/.test(document.getElementById('hr-lgpill').textContent), null, { timeout: 15000 });
  assert.match(await T.page.textContent('#hr-lgpill'), /Live: Brain Board/);
  await T.page.waitForSelector(`.hr-desk[data-sid="${ada.id}"] .hr-lgin`, { timeout: 15000 });
  assert.match(await T.page.textContent(`.hr-desk[data-sid="${ada.id}"] .hr-lgin`), /In Brain Board/);
  assert.equal(await T.page.locator(`.hr-desk[data-sid="${ben.id}"] .hr-lgin`).count(), 0);
  await shot(T.page, 'pill-1366');
  // the frame kept running underneath: open it again from the pill
  await T.page.click('#hr-lgpill [data-lg="restore"]');
  await T.page.waitForSelector('.hr-liveplayer:not([hidden])');
  assert.match(await framePath(T.page), new RegExp(`^/live/host/${s.id}`));
  await T.page.click('.hr-liveplayer [data-lg="min"]');
  // the projector view: the game's host screen over it; the teacher's layer takes the Teacher view
  const Pj = await open(teacher, `/class/${cls.id}/homeroom/projector`, LAPTOP, { ctx: T.ctx });
  await Pj.page.waitForSelector('.hr-projliveframe');
  await Pj.page.frameLocator('.hr-projliveframe').locator('body.lv-projector').waitFor({ timeout: 20000 });
  await Pj.page.waitForTimeout(1200); await shot(Pj.page, 'projector-1366');
  await T.page.click('#hr-lgpill [data-lg="restore"]');
  await T.page.waitForFunction(sid => { const fr = document.querySelector('.hr-liveframe'); try { return fr.contentWindow.location.pathname === `/live/host/${sid}/dash`; } catch { return false; } }, s.id, { timeout: 15000 });
  await T.page.waitForTimeout(800); await shot(T.page, 'host-dash-1366');
  await T.page.click('.hr-liveplayer [data-lg="min"]');
  await Pj.page.close();
  // End from the pill: the game ends, the desk is back
  await T.page.click('#hr-lgpill [data-lg="end"]');
  await T.page.click('dialog[open] [data-ob="ok"]');
  await T.page.waitForSelector('#hr-lgpill', { state: 'detached' });
  assert.equal(LS.openForClass(cls.id), null);
  await A.page.waitForSelector('.hr-player', { state: 'detached', timeout: 20000 });
  assert.equal(await A.page.locator('#hd-lgcard').count(), 0);
  assert.equal(T.page.url(), url0);
  assert.deepEqual(T.errors, []); assert.deepEqual(A.errors, []);
  await A.ctx.close(); await T.ctx.close();
});
async function LSwait(fn, what, ms = 15000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 100)); } }

test('Would You Rather Live from the ⋯ menu-free catalog on a phone; a desk on a phone joins; the game ending takes it back to the desk', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), PHONE, { touch: true });
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const url0 = T.page.url();
  await T.page.evaluate(() => { const b = document.querySelector('[data-hr="catalog"]'), p = document.getElementById('hr-panel'); p.scrollLeft = b.offsetLeft - 20; });
  await T.page.locator('[data-hr="catalog"]').tap();
  await T.page.locator('.hr-csheet [data-csubj="live"]').tap();
  await T.page.locator('.hr-csheet [data-hrlive*="mode=wyr"]').tap();
  await T.page.waitForSelector('.hr-liveplayer:not([hidden]) .hr-liveframe');
  assert.equal(await T.page.locator('.hr-csheet').count(), 0, 'the sheet closed');
  await startFromLanding(T.page);
  const s = LS.openForClass(cls.id);
  assert.ok(s && s.mode === 'wyr');
  assert.equal(T.page.url(), url0);
  await T.page.waitForTimeout(800); await shot(T.page, 'host-390');
  const B = await open(ben, desk(), PHONE, { touch: true });
  await B.page.waitForFunction(() => { const fr = document.querySelector('.hr-player .hr-playframe'); try { return fr.contentWindow.location.pathname.startsWith('/live/play/'); } catch { return false; } }, null, { timeout: 20000 });
  await LSwait(() => [...s.seats.values()].some(x => x.userId === ben.id && x.conn), 'Ben is in the game');
  await B.page.waitForTimeout(800); await shot(B.page, 'desk-in-game-390');
  await T.page.locator('.hr-liveplayer [data-lg="min"]').tap();
  await T.page.waitForSelector('#hr-lgpill');
  await T.page.waitForTimeout(400); await shot(T.page, 'pill-390');
  assert.ok(await sideways(T.page) <= 0);
  // the game ends (from the host page itself, or by itself): the desk comes back
  LS.endSession(s.id);
  await B.page.waitForSelector('.hr-player', { state: 'detached', timeout: 20000 });
  await T.page.waitForSelector('#hr-lgpill', { state: 'detached', timeout: 20000 });
  assert.deepEqual(T.errors, []); assert.deepEqual(B.errors, []);
  await B.ctx.close(); await T.ctx.close();
});

test('the standalone /live pages are as before outside Homeroom: chrome, no framing', { timeout: 60000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, `/live?mode=board&class=${cls.id}`, LAPTOP);
  await T.page.waitForSelector('#lv-new');
  assert.ok(await T.page.locator('footer.foot').count() >= 1, 'the site footer');
  const r = await T.page.evaluate(async () => { const x = await fetch(location.href); return { csp: x.headers.get('content-security-policy'), xfo: x.headers.get('x-frame-options') }; });
  assert.match(r.csp, /frame-ancestors 'none'/); assert.equal(r.xfo, 'DENY');
  await T.ctx.close();
});

// ---------------------------------------------------------------- QA round 2
test('QA round 2: a tool is on a busy desk\'s tile, never under "+N more" (N2); the Homeroom prompt never covers the board (N4)', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const HT = await import('../../server/services/homeroom-tools.js');
  for (const g of [sumRacer, wordHunt, sudoku, typing]) HO.handOut(teacher, cls, { gameId: g.id, to: { kind: 'desk', id: dev.id } });
  const tool = HT.handOutTool(teacher, cls, { tool: 'rekenreks', to: { kind: 'desk', id: dev.id } });
  assert.ok(tool.ok, tool.code);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector(`.hr-desk[data-sid="${dev.id}"] .hr-more`);
  assert.equal(await T.page.locator(`.hr-desk[data-sid="${dev.id}"] .hr-toolcard`).count(), 1, 'the tool card is on the tile');
  await T.ctx.close();
  HT.removeTool(teacher, cls, tool.item.id);
  // a student away from their desk while class is live: the prompt sits at the top of the page, over nothing
  H.setLive(teacher, cls, 'start');
  for (const vp of [LAPTOP, PHONE]) {
    const A = await open(ada, '/manipulatives', vp);
    await A.page.waitForSelector('.hr-notify', { timeout: 15000 });
    const nb = await box(A.page, '.hr-notify');
    const under = await A.page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? !!el.closest('.hr-notify') : false; }, [nb.x + nb.width / 2, nb.y + nb.height / 2]);
    assert.ok(under, 'nothing over it');
    const m = await A.page.locator('#manip').boundingBox();
    assert.ok(m && nb.y + nb.height <= m.y + 1, `the prompt (${nb.y}..${nb.y + nb.height}) is above the board (${m && m.y})`);
    await shot(A.page, `notify-${vp.width}`);
    await A.ctx.close();
  }
  H.setLive(teacher, cls, 'end');
});
