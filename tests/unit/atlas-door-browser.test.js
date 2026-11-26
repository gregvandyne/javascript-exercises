// Atlas Quest has one door (docs/decisions.md "Atlas Quest: one door"), in a real browser:
//   - a teacher opening Atlas Quest from Homeroom's Games (a card on My desk, then Play), from Homeroom's Live games (the
//     card named "Atlas Quest") and from its game page first sees Who is it for? with Play, Host live and Build a lesson;
//     Play opens the games, Build a lesson the teacher's tools (Make a quiz, My worksheets), Host live the live game
//     (in Homeroom its live layer for the class, elsewhere /live?mode=atlas); handing out is still tap a card, then a desk;
//   - a student never sees Host live or Build a lesson: on the game page and from a handed-out Atlas Quest on their desk
//     the game opens on its home;
//   - no paper plane and no dotted trail: right answers add nothing to the globe's scene, and the code is gone.
// Screenshots (the door at 390 and 1366 for a teacher, a game without the plane) with ATLAS_SHOTS=<dir>. Skipped with no
// Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.liveClassroom = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { attachUpgrades } = await import('../../server/services/upgrade.js');
const classlive = await import('../../server/services/classlive-socket.js');
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
const SHOTS = process.env.ATLAS_SHOTS || '';
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

const boss = createUser({ username: 'AtlasDoorBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Atlas Door School' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Okafor', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 4', teacherId: teacher.id }).class;
const kids = ['Ama', 'Bo'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ama, bo] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, file) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, fs.readFileSync(file, 'utf8'), { createdBy: official.id, safetyStatus: 'pass' });
  q.run(`UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?`, v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
const atlas = made('Atlas Quest', 'atlas-quest', '🌍', 'seed-games/atlas-quest.html');
made('Atlas Quest', 'atlas-quest-live', '🌍', 'seed-games/atlas-quest-live.html');
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  attachUpgrades(server, [classlive.route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { for (const s of LS.openSessions()) LS.endSession(s.id); if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1366, height: 768 }, PHONE = { width: 390, height: 844 };
const board = () => `/class/${cls.id}/hub`, desk = () => `/class/${cls.id}/desk`;
/** The game's own sandboxed frame (/frame/<token>), wherever it is nested (the play page, or Homeroom's layer). */
async function gameFrame(page, ms = 60000) {
  const t0 = Date.now();
  for (;;) {
    const f = page.frames().find(x => /\/frame\//.test(x.url()));
    if (f) { await f.waitForFunction(() => window.__brbTest && window.__brbTest.state && document.querySelector('#page, #side'), null, { timeout: ms }); return f; }
    if (Date.now() - t0 > ms) throw new Error('no game frame');
    await page.waitForTimeout(200);
  }
}
const screen = f => f.evaluate(() => window.__brbTest.state().screen);
const ids = (f, list) => f.evaluate(l => l.filter(id => document.getElementById(id)), list);
const DOOR = ['aq-door-play', 'aq-door-host', 'aq-door-build'];
/** The door: the three ways in, in order, and their words. */
async function seeDoor(f) {
  await f.waitForSelector('#aq-door-play');
  assert.equal(await screen(f), 'door');
  assert.deepEqual(await f.$$eval('.aq-path', l => l.map(b => b.id)), DOOR);
  assert.deepEqual(await f.$$eval('.aq-path .aq-pwho', l => l.map(x => x.textContent)), ['Play', 'Host live', 'Build a lesson']);
  assert.equal(await f.textContent('#aq-door-h'), 'Who is it for?');
  assert.deepEqual(await ids(f, ['aq-make', 'aq-ws', 'aq-mine']), [], 'no teacher tools until Build a lesson');
}
/** Play, then back to the door; Build a lesson, then back to the door. */
async function playAndBuild(f) {
  await f.click('#aq-door-play');
  await f.waitForFunction(() => window.__brbTest.state().screen === 'home');
  await f.evaluate(() => window.__brbTest.closeDialog());   // Captain Skye's welcome, the first time
  assert.equal(await f.locator('[data-mode="find"]').count(), 1, 'Play: the games');
  assert.deepEqual(await ids(f, ['aq-make', 'aq-ws']), [], 'Play: no teacher tools beside the games');
  await f.click('#aq-door-back');
  await seeDoor(f);
  await f.click('#aq-door-build');
  await f.waitForSelector('.aq-teach #aq-make');
  assert.equal(await screen(f), 'teach');
  await f.click('#aq-make');
  await f.waitForSelector('#page[data-screen="build"]');
  await f.click('#aq-b-home');   // the maker's Home: back to the teacher's tools
  await f.waitForSelector('.aq-teach #aq-make');
  await f.click('#aq-door-back');
  await seeDoor(f);
}

test('a teacher from Homeroom Games and Live games: the door (Play, Host live, Build a lesson); Host live opens the class\'s live layer', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const P = '#hr-panel';
  await T.page.fill('#hr-cq', 'atlas');
  // Atlas Quest in both places: Games (handed out as before) and Live games (its door), one name
  const gamesCard = `${P} [data-csec="games"] [data-hritem="${atlas.id}"]`, liveCard = `${P} [data-csec="live"] [data-hrdoor="atlas-quest"]`;
  assert.equal(await T.page.locator(gamesCard).count(), 1, 'under Games');
  assert.equal(await T.page.locator(liveCard).count(), 1, 'under Live games');
  assert.equal((await T.page.textContent(`${liveCard} .hr-itemt`)).trim(), 'Atlas Quest', 'the live card is named Atlas Quest');
  assert.equal(await T.page.locator(`${P} [data-hrlive*="mode=atlas"]`).count(), 0, 'no separate live setup card');
  assert.ok(!/Atlas Quest \(Live\)/.test(await T.page.textContent(P)), 'no "(Live)" title');
  // Games: tap the card, then a desk (as before): the hand-out sheet for that desk
  await T.page.click(gamesCard);
  await T.page.click(`.hr-desk[data-sid="${ama.id}"]`, { position: { x: 30, y: 30 } });
  await T.page.waitForSelector('.hr-giveform');
  assert.match(await T.page.locator('#sheet-title').innerText(), /Atlas Quest for Ama/);
  await T.page.click('[data-give="cancel"]'); await T.page.waitForTimeout(300);
  // Games: on My desk, then Play: the door over the board (still picked: the yellow bar's My desk)
  await T.page.waitForSelector('#hr-givebar:not([hidden]) [data-hrto="me"]');
  await T.page.click('#hr-givebar [data-hrto="me"]');
  await T.page.waitForSelector('[data-hrstaged]');
  await T.page.click('[data-hrstaged]');
  await T.page.click('[data-sm="play"]');
  await T.page.waitForSelector('.hr-player .hr-playframe[src*="/play/atlas-quest"]');
  let f = await gameFrame(T.page);
  await seeDoor(f);
  await playAndBuild(f);
  await T.page.click('.hr-player [data-hrplayer="close"]');
  await T.page.waitForSelector('.hr-player', { state: 'detached' });
  // Live games: the card opens the same door over the board, and Host live the live layer for this class
  await T.page.click(`${P} [data-csubj="live"]`);
  await T.page.click(liveCard);
  await T.page.waitForSelector('.hr-player .hr-playframe[src*="/play/atlas-quest"]');
  f = await gameFrame(T.page);
  await seeDoor(f);
  assert.match(await T.page.textContent('.hr-player .hr-playt'), /Atlas Quest/);
  await f.click('#aq-door-host');
  await T.page.waitForSelector('.hr-liveplayer:not([hidden]) .hr-liveframe');
  const src = await T.page.getAttribute('.hr-liveframe', 'src');
  assert.ok(src.startsWith(`/live?mode=atlas&class=${encodeURIComponent(cls.id)}`), src);
  assert.equal(await T.page.locator('.hr-player:not(.hr-liveplayer)').count(), 0, 'the game layer closed');
  assert.equal(new URL(T.page.url()).pathname, board(), 'still on the board');
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
});

test('a teacher from the game page: the door at 1366 and 390; Play, Build a lesson, and Host live to /live?mode=atlas', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, '/g/atlas-quest', LAPTOP);
  await T.page.click('#playbtn');
  await T.page.waitForURL(/\/play\/atlas-quest/);
  let f = await gameFrame(T.page);
  await seeDoor(f);
  await T.page.waitForTimeout(400); await shot(T.page, 'door-teacher-1366');
  // three cards side by side, the same height
  const boxes = await f.$$eval('.aq-path', l => l.map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, h: r.height }; }));
  assert.ok(boxes.every(b => Math.abs(b.y - boxes[0].y) < 2 && Math.abs(b.h - boxes[0].h) < 2), JSON.stringify(boxes));
  await playAndBuild(f);
  // a phone: one column, nothing sideways
  await T.page.setViewportSize(PHONE); await T.page.waitForTimeout(500);
  const col = await f.$$eval('.aq-path', l => l.map(b => b.getBoundingClientRect()).map(r => ({ x: r.x, y: r.y, w: r.width })));
  assert.ok(col.every(b => Math.abs(b.x - col[0].x) < 2) && col[1].y > col[0].y, 'one column at 390');
  assert.ok(await f.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll at 390');
  await shot(T.page, 'door-teacher-390');
  // Host live: the live game's setup, the mode picked
  await f.click('#aq-door-host');
  await T.page.waitForURL(/\/live\?mode=atlas$/);
  await T.page.waitForSelector('#lv-new');
  assert.deepEqual(T.errors, []);
  await T.ctx.close();
});

test('a student never sees Host live or Build a lesson: the game page and a handed-out Atlas Quest open on the games', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const A = await open(ama, '/play/atlas-quest', LAPTOP);
  let f = await gameFrame(A.page);
  await f.waitForFunction(() => window.__brbTest.state().screen === 'home');
  assert.deepEqual(await ids(f, [...DOOR, 'aq-door-back', 'aq-make', 'aq-ws', 'aq-mine']), [], 'no door, no teacher tools');
  assert.equal(await f.evaluate(() => window.BRB.canHostLive), false);
  assert.ok(await f.locator('.aq-more #aq-lib').count(), 'Maps and more: the library');
  await A.ctx.close();
  // handed out on Bo's desk: he opens it and plays
  const r = HO.handOut(teacher, cls, { gameId: atlas.id, to: { kind: 'desk', id: bo.id } });
  assert.ok(r.ok, r.code);
  const B = await open(bo, desk(), LAPTOP);
  await B.page.waitForSelector('a.hd-card');
  await B.page.click('a.hd-card');
  f = await gameFrame(B.page);
  await f.waitForFunction(() => window.__brbTest.state().screen === 'home');
  assert.deepEqual(await ids(f, [...DOOR, 'aq-make']), [], 'a handout just plays');
  assert.deepEqual(A.errors, []); assert.deepEqual(B.errors, []);
  await B.ctx.close();
});

test('no paper plane and no dotted trail: right answers add nothing to the globe, and the code is gone', { timeout: 280000 }, async t => {
  const html = fs.readFileSync('seed-games/atlas-quest.html', 'utf8'), live = fs.readFileSync('seed-games/atlas-quest-live.html', 'utf8');
  for (const [name, src] of [['solo', html], ['live', live]]) {
    assert.doesNotMatch(src, /planeBody|flyPlane|addTrail|trailGroup|planeShadow|puffs|Plane paint/, `${name}: no plane or trail code`);
    assert.doesNotMatch(src, /paper plane flies/, `${name}: no words about a flying plane`);
  }
  if (skip) return t.skip(skip);
  const A = await open(ama, '/play/atlas-quest', LAPTOP);
  const f = await gameFrame(A.page);
  await f.waitForFunction(() => window.__brbTest.state().screen === 'home');
  await f.evaluate(() => window.__brbTest.closeDialog());
  const before = await f.evaluate(() => window.__brbTest.sceneKinds());
  await f.click('[data-mode="find"]');
  for (let i = 0; i < 3; i++) { await f.evaluate(() => window.__brbTest.answer(true)); if (i < 2) await f.evaluate(() => window.__brbTest.next()); }
  await A.page.waitForTimeout(1200);
  assert.deepEqual(await f.evaluate(() => window.__brbTest.sceneKinds()), before, 'nothing new over the globe (no plane, no trail)');
  assert.equal(await f.evaluate(() => window.__brbTest.state().right), 3, 'the questions still work');
  await shot(A.page, 'game-no-plane-1366');
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
});
