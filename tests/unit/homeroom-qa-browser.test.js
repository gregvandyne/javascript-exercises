// Homeroom: QA fixes for Manipulatives in Homeroom, in a real browser (docs/decisions.md "Homeroom: QA fixes for
// Manipulatives in Homeroom"; the server side: tests/unit/homeroom-qa.test.js):
//   - B1: a tool handed out from the board shows a card on every desk; Remove from every desk takes it off and ends its
//     room; the hand-out sheet for a second tool says which tool runs, with Take it off every desk right there; a room
//     ended from the room page stays ended after a reload and students lose its card;
//   - M1: on a phone (390x844) the desk's player is one compact bar over the whole screen (no site bars, no dock, one
//     Raise hand) and the board of a tool's room or a practice set shows on first open, without scrolling in the frame;
//   - M3: a set assigned from the Manipulatives page is on the student's desk and the teacher's board, and opens in the
//     desk's player;
//   - M4: look shows the set's board with its own question while it is open, and nothing once the player closes;
//   - dark mode: desks and their edges stand out from the board, My desk is not cream, the header's globe shows.
// Screenshots with HR_SHOTS=<dir>. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
config.manipulatives = true;
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { attachUpgrades } = await import('../../server/services/upgrade.js');
const classlive = await import('../../server/services/classlive-socket.js');
const manipSocket = await import('../../server/services/manip-socket.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HT = await import('../../server/services/homeroom-tools.js');
const M = await import('../../server/services/manipulatives.js');
const MT = await import('../../server/services/manip-tasks.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrqa-${name}.png` }) : null);

const boss = createUser({ username: 'HqbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'QA Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Quill', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()], manipulativesUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 21', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  // (the live room's socket, as server/index.js: a bare listen() would 404 it)
  attachUpgrades(server, [classlive.route, manipSocket.route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });
async function open(who, path, viewport, { touch = false, dark = false } = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, colorScheme: dark ? 'dark' : 'light' });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1280, height: 800 }, PHONE = { width: 390, height: 844 };
const board = () => `/class/${cls.id}/homeroom`, desk = () => `/class/${cls.id}/desk`;
const api = (s, path, body) => s.page.evaluate(async ([p, b]) => { const r = await fetch(p, b ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) } : {}); return { status: r.status, json: await r.json() }; }, [path, body || null]);
/** Pick a catalog item and a target, as a tap does (the panel's own click handling). */
async function pickAndGive(T, item, to = 'all') {
  await T.page.evaluate(id => document.querySelector(`[data-hritem="${id}"]`).click(), item);
  await T.page.click(`[data-hrto="${to}"]`);
  await T.page.waitForSelector('.hr-giveform');
}

test('B1: a tool on every desk, Remove from every desk, the one-tool rule up front, an ended room stays ended', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector('.hr-desk[data-sid]');
  // hand out Rekenreks to the whole class from the board
  await pickAndGive(T, 'T:manip:rekenreks');
  assert.equal(await T.page.locator('.hr-onetool').count(), 0, 'no other tool runs');
  await T.page.click('.hr-giveok');
  await T.page.waitForSelector('.hr-desk [data-hrho].hr-toolcard');
  assert.equal(await T.page.locator('.hr-desk .hr-toolcard').count(), kids.length, 'a card on every desk');
  await shot(T.page, 'teacher-toolcard');
  const room1 = HT.roomOf(cls);
  assert.equal(room1.tool, 'rekenreks');
  // the student sees it on their desk
  const A = await open(ada, desk(), LAPTOP);
  await A.page.waitForSelector('.hd-card:has-text("Rekenreks")');
  // the desk's sheet: Remove from every desk (asked first), the room ends, the cards go
  await T.page.click(`.hr-desk[data-sid="${ben.id}"] .hr-toolcard`);
  await T.page.waitForSelector('.hr-dtool');
  assert.match(await T.page.textContent('.hr-dtool'), /Open practice/);
  await T.page.click('.hr-dtool [data-rmall]');
  await T.page.click('dialog[open] [data-ob="ok"]');
  await T.page.waitForFunction(() => !document.querySelector('.hr-desk .hr-toolcard'));
  assert.equal(M.getSession(room1.session).status, 'ended');
  await T.page.keyboard.press('Escape');
  // Rekenreks again (another way in), then Money from the board: the sheet says Rekenreks runs, with the way out
  assert.ok(HT.handOutTool(teacher, cls, { tool: 'rekenreks', to: { kind: 'all' } }).ok);
  await T.page.reload(); await T.page.waitForSelector('.hr-desk .hr-toolcard');
  await pickAndGive(T, 'T:manip:money');
  assert.match(await T.page.textContent('.hr-onetool'), /Rekenreks is on desks now/);
  assert.ok(await T.page.locator('.hr-giveok').isDisabled(), 'nothing to fail at Put on desks');
  await shot(T.page, 'onetool-sheet');
  await T.page.click('[data-give="takeoff"]');
  await T.page.waitForFunction(() => !document.querySelector('.hr-onetool') && !document.querySelector('.hr-giveok').disabled);
  await T.page.click('.hr-giveok');
  await T.page.waitForSelector('.hr-desk .hr-toolcard:has-text("Money")');
  // the room ended from the room page (End session): after a reload it stays ended, no card anywhere
  const money = HT.roomOf(cls);
  assert.equal(money.tool, 'money');
  assert.ok(M.end(teacher, money.session).ok);
  await T.page.reload(); await T.page.waitForSelector('.hr-desk[data-sid]');
  const hv = await api(T, `/api/homeroom/${cls.id}/handouts`);
  assert.equal(hv.json.tools.length, 0); assert.equal(hv.json.room, null);
  assert.equal(M.getSession(money.session).status, 'ended');
  assert.equal(await T.page.locator('.hr-desk .hr-toolcard').count(), 0);
  await A.page.reload(); await A.page.waitForSelector('.hd-desk');
  assert.equal(await A.page.locator('.hd-card:has-text("Money")').count(), 0, 'students lose the card');
  assert.deepEqual([...T.errors, ...A.errors], []);
  await T.ctx.close(); await A.ctx.close();
});

test('M1: on a phone the player is the whole screen under one bar, and the board shows on first open', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  assert.ok(HT.handOutTool(teacher, cls, { tool: 'rekenreks', to: { kind: 'all' }, instructions: 'Show 7.' }).ok);
  for (const id of ['money/make-67-cents', 'clock/elapsed-time']) assert.ok(HO.handOutTask(teacher, cls, { tasks: [id], count: 2, to: { kind: 'all' }, order: 'any' }).ok);
  const results = [];
  for (const [title, name, boardSel] of [['Rekenreks', 'rekenreks', '.rm-area.mine'], ['Make 67', 'money', '.mp-board'], ['Elapsed', 'clock', '.mp-board']]) {
    const s = await open(cleo, desk(), PHONE, { touch: true });
    await s.page.waitForSelector('.hd-card');
    await s.page.click(`.hd-card:has-text("${title}")`);
    await s.page.waitForSelector('.hr-playframe');
    const f = s.page.frameLocator('.hr-playframe');
    await f.locator(boardSel).first().waitFor({ timeout: 25000 });
    await s.page.waitForTimeout(800);
    const outer = await s.page.evaluate(() => {
      const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const fr = document.querySelector('.hr-playframe').getBoundingClientRect();
      return { top: fr.top, bottom: fr.bottom, h: innerHeight, topbar: vis(document.querySelector('.topbar')), tabbar: vis(document.querySelector('.tabbar')), dock: vis(document.querySelector('.hd-dock')),
        deskTop: vis(document.querySelector('.hd-top')), hands: [...document.querySelectorAll('.hd-handbtn')].filter(vis).map(b => !!b.closest('.hr-playtop')), scroll: document.scrollingElement.scrollTop };
    });
    const inner = await f.locator(boardSel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, h: r.height, vis: Math.max(0, Math.min(innerHeight, r.bottom) - Math.max(0, r.top)), vh: innerHeight, scroll: document.scrollingElement.scrollTop }; });
    results.push({ name, outer, inner, frac: inner.vis / inner.h });
    await shot(s.page, `phone-player-${name}`);
    assert.ok(outer.top <= 64 && outer.bottom >= outer.h - 1, `${name}: the frame fills the screen under one bar (${JSON.stringify(outer)})`);
    assert.ok(!outer.topbar && !outer.tabbar && !outer.dock && !outer.deskTop, `${name}: no site bars, dock or second top bar`);
    assert.deepEqual(outer.hands, [true], `${name}: one Raise hand, in the player's bar`);
    assert.equal(inner.scroll, 0);
    assert.ok(inner.top >= 0 && inner.top < inner.vh, `${name}: the board's top shows without scrolling (${JSON.stringify(inner)})`);
    assert.ok(inner.vis / inner.h >= 0.6, `${name}: at least 60% of the board shows (${Math.round((100 * inner.vis) / inner.h)}%)`);
    // Raise hand from the player's bar: its menu opens over the game, on top
    if (name === 'rekenreks') {
      await s.page.click('.hr-playtop .hd-handbtn');
      await s.page.waitForSelector('#hd-handmenu');
      assert.ok(await s.page.evaluate(() => { const r = document.querySelector('#hd-handmenu').getBoundingClientRect(); return document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('#hd-handmenu') != null; }), 'the hand menu is on top');
      await s.page.click('.hr-playtop .hd-handbtn');
    }
    // Back: the desk again, with its bars
    await s.page.click('.hr-playback');
    await s.page.waitForSelector('.hd-top', { state: 'visible' });
    assert.equal(await s.page.locator('.hd-top .hd-handbtn').count(), 1, 'Raise hand back in the desk bar');
    await s.ctx.close();
  }
  console.log('# M1', JSON.stringify(results.map(r => ({ name: r.name, frameTop: r.outer.top, boardTop: Math.round(r.inner.top), boardShown: `${Math.round(r.frac * 100)}%` }))));
  H.setLive(teacher, cls, 'end');
});

test('M3 and M4: a set assigned from Manipulatives on the desk and the board; look shows its board and question, nothing after Back', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  const a = MT.assign(teacher, { classId: cls.id, tasks: ['pattern-blocks/cover-the-hexagon'], count: 2 });
  assert.ok(a.ok, a.code);
  const T = await open(teacher, board(), LAPTOP);
  await T.page.waitForSelector(`.hr-desk[data-sid="${ada.id}"] [data-hrho="${a.classLesson.id}"]`);
  const A = await open(ada, desk(), LAPTOP);
  await A.page.waitForSelector(`.hd-card[data-hdcard="${a.classLesson.id}"]`);
  assert.equal(await A.page.locator(`.hd-card[data-hdcard="${a.classLesson.id}"]`).count(), 1);
  await A.page.click(`.hd-card[data-hdcard="${a.classLesson.id}"]`);
  await A.page.waitForSelector('.hr-playframe');
  assert.match(await A.page.getAttribute('.hr-playframe', 'src'), /#set\//);
  const f = A.page.frameLocator('.hr-playframe');
  await f.locator('#mp-prob .mp-prompt').waitFor({ timeout: 25000 });
  // look: the board of this set with its own question
  await T.page.waitForSelector(`.hr-lvchip[data-hrlook="${ada.id}"]`, { timeout: 15000 });
  await T.page.click(`.hr-lvchip[data-hrlook="${ada.id}"]`);
  await T.page.waitForSelector('.hr-lkscreen[data-kind="tool"] .hr-sprob', { timeout: 30000 });
  assert.match(await T.page.textContent('.hr-lkscreen .hr-sprob'), /Question 1 of 2/);
  assert.match(await T.page.textContent('.hr-lkscreen .hr-stag'), new RegExp(a.title));
  await shot(T.page, 'look-set');
  // Back to my desk: look and the desk tile drop the board (no stale, mismatched pair)
  await A.page.click('.hr-playback');
  await T.page.waitForFunction(() => !document.querySelector('.hr-lkscreen .hr-sprob'), null, { timeout: 15000 });
  await T.page.keyboard.press('Escape');
  await T.page.waitForFunction(sid => !document.querySelector(`.hr-desk[data-sid="${sid}"] .hr-screen[data-kind="tool"]`), ada.id, { timeout: 15000 });
  // Today: the set, with every student's place in it (alphabetical, no ranking)
  await T.page.click('[data-hrpanel="today"]');
  await T.page.waitForSelector('#hr-flpanel .hr-tglist');
  await shot(T.page, 'today');
  await T.ctx.close(); await A.ctx.close();
  H.setLive(teacher, cls, 'end');
});

/** WCAG contrast of two CSS colors (rgb()/rgba() strings, alpha ignored). */
function contrast(a, b) {
  const lum = c => { const [r, g, bl] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05);
}
test('dark mode: desks stand out from the board, My desk is dark, the globe shows', { timeout: 280000 }, async t => {
  if (skip) return t.skip(skip);
  assert.ok(HT.handOutTool(teacher, cls, { tool: 'clock', to: { kind: 'all' } }).ok);
  const T = await open(teacher, board(), LAPTOP, { dark: true });
  await T.page.waitForSelector('.hr-desk[data-sid]');
  const c = await T.page.evaluate(() => {
    const cs = el => getComputedStyle(el), d = document.querySelector('.hr-desk[data-sid]'), b = document.querySelector('.hr-board'), td = document.querySelector('.hr-tdesk');
    const globe = document.querySelector('.langpick .globe svg');
    return { desk: cs(d).backgroundColor, edge: cs(d).borderTopColor, board: cs(b).backgroundColor, tdesk: cs(td).backgroundColor, ink: cs(td).color, globe: globe ? cs(globe).color : '', bar: cs(document.querySelector('.topbar')).backgroundColor };
  });
  assert.ok(contrast(c.edge, c.board) >= 3, `desk edge on the board: ${contrast(c.edge, c.board).toFixed(2)} (${c.edge} on ${c.board})`);
  assert.ok(contrast(c.desk, c.board) >= 1.25, `desk face on the board: ${contrast(c.desk, c.board).toFixed(2)}`);
  assert.ok(contrast(c.tdesk, 'rgb(255,253,242)') >= 4.5, `My desk is not cream (${c.tdesk})`);
  assert.ok(contrast(c.ink, c.tdesk) >= 4.5, 'My desk\'s words read');
  assert.ok(c.globe && contrast(c.globe, c.bar) >= 3, `the globe takes the bar's ink (${c.globe} on ${c.bar})`);
  assert.match(await (await fetch(`${BASE}/icons/oomba/globe.svg`)).text(), /currentColor/);
  await shot(T.page, 'dark-board');
  const A = await open(ada, desk(), LAPTOP, { dark: true });
  await A.page.waitForSelector('.hd-desk');
  await shot(A.page, 'dark-desk');
  await T.ctx.close(); await A.ctx.close();
});
