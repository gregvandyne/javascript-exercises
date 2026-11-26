// Homeroom step 2a in a real browser (public/js/homeroom.js handing out, public/js/homeroom-desk.js cards):
//   - the teacher, on a tablet, taps a game in the panel, then a desk (tap-then-tap), fills in the sheet (instructions,
//     Any order / In order, the grading) and the desk shows the handout; a group chip and Whole class work the same;
//     with a mouse, a game dragged onto a desk opens the same sheet; a desk's handout opens its sheet with Remove;
//   - the student's desk on a tablet, a Chromebook (1366 x 768) and a phone: the cards in order, Next up, 🔒 Later on an
//     In order card that waits (it does not open), the instructions in yellow, no sideways scroll; tapping the card opens
//     the game in the desk's player layer (public/js/homeroom-player.js) with the instructions on top and Back to my desk.
// HR_SHOTS=<dir> also saves screenshots there (hr2a-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr2a-${name}.png` }) : null);

const boss = createUser({ username: 'HobBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Handout Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 12', teacherId: teacher.id }).class;
const NAMES = ['Ava', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const sudoku = made('Sudoku', 'sudoku-hr', '🔢');
const lab = made('Arithmetic Lab', 'arithmetic-lab-hr', '🧮');
const cross = made('Crossword', 'crossword-hr', '📝');
const maps = made('Atlas Quest', 'atlas-quest-hr', '🗺️');
// Groups: Stretch = Ava, Ben, Cleo; On track = Dev, Eli.
const room = H.roomOf(cls.id);
H.saveGroups(teacher, cls, { groups: room.groups, members: { [kids[0].id]: room.groups[0].id, [kids[1].id]: room.groups[0].id, [kids[2].id]: room.groups[0].id, [kids[3].id]: room.groups[1].id, [kids[4].id]: room.groups[1].id } });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch, isMobile: touch && viewport.width < 600 });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
/** Before a screenshot: sheets done sliding in, toasts gone. */
const settle = async page => { await page.waitForTimeout(450); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test('the teacher hands out by tap-then-tap on a tablet: a desk, a group, Whole class; the desks show them', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1180, height: 820 }, true);
  await page.waitForSelector('.hr-desk');
  // Tap Arithmetic Lab, then Dev's desk.
  await page.tap(`[data-hritem="${lab.id}"]`);
  await page.waitForSelector('#hr-givebar:not([hidden])');
  assert.equal(await page.locator(`[data-hritem="${lab.id}"]`).getAttribute('aria-pressed'), 'true');
  await settle(page); await shot(page, 'teacher-picked-tablet');
  const dev = page.locator(`.hr-desk[data-sid="${kids[3].id}"]`);
  const box = await dev.boundingBox();
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Arithmetic Lab for Dev/);
  assert.equal(await page.locator('[data-seg="grade"][data-v="completion"]').getAttribute('aria-checked'), 'true', 'free play: Completion by default');
  assert.equal(await page.locator('[data-seg="order"][data-v="in"]').getAttribute('aria-checked'), 'true');
  await page.fill('#hr-ins', 'Do 3 long divisions with remainders, then show one on your pad.');
  await settle(page); await shot(page, 'teacher-modal-tablet');
  await page.tap('.hr-giveok');
  await page.waitForSelector(`.hr-desk[data-sid="${kids[3].id}"] .hr-card`);
  let ho = HO.boardView(cls).handouts;
  assert.equal(ho.length, 1); assert.equal(ho[0].instructions, 'Do 3 long divisions with remainders, then show one on your pad.');
  assert.deepEqual(L.studentsOfLesson(ho[0].id), [kids[3].id]);
  assert.equal(await page.locator('#hr-givebar:not([hidden])').count(), 0, 'the pick ends after handing out');
  // Sudoku to the Stretch group: Any order, Not graded.
  await page.tap(`[data-hritem="${sudoku.id}"]`);
  await page.tap(`#hr-groupchips [data-hrto="group:${room.groups[0].id}"]`);
  await page.waitForSelector('.hr-giveform');
  await page.tap('[data-seg="order"][data-v="any"]'); await page.tap('[data-seg="grade"][data-v="none"]');
  await page.fill('#hr-ins', 'Try a Medium puzzle. Write one tip you learned on your pad.');
  await page.tap('.hr-giveok');
  await page.waitForSelector(`.hr-desk[data-sid="${kids[0].id}"] .hr-card`);
  // Crossword to the whole class (In order, Score), Atlas Quest to Dev (In order).
  for (const [g, to, grade] of [[cross, '#hr-groupchips [data-hrto="all"]', 'score'], [maps, `.hr-desk[data-sid="${kids[3].id}"]`, 'completion']]) {
    await page.tap(`[data-hritem="${g.id}"]`);
    if (to.startsWith('#')) await page.tap(to); else { const b = await page.locator(to).boundingBox(); await page.touchscreen.tap(b.x + 20, b.y + b.height - 14); }
    await page.waitForSelector('.hr-giveform');
    await page.tap(`[data-seg="grade"][data-v="${grade}"]`);
    await page.tap('.hr-giveok'); await page.waitForSelector('.hr-giveform', { state: 'detached' });
  }
  ho = HO.boardView(cls);
  assert.equal(ho.handouts.length, 4);
  assert.deepEqual(L.studentsOfLesson(ho.handouts.find(h => h.title === 'Crossword').id), []);
  assert.equal(ho.desks[kids[3].id].length, 3, 'Dev: Arithmetic Lab, Crossword, Atlas Quest');
  assert.equal(await page.locator(`.hr-desk[data-sid="${kids[0].id}"] .hr-card`).count(), 2);
  assert.ok(await noSideways(page));
  await page.tap('[data-hr="fit"]'); await page.tap('[data-hr="zin"]'); await page.tap('[data-hr="zin"]'); await page.waitForTimeout(300);
  await settle(page); await shot(page, 'teacher-desks-tablet');
  // A desk's handout: its sheet with Remove.
  await page.locator(`.hr-desk[data-sid="${kids[3].id}"] .hr-card`).first().tap();
  await page.waitForSelector('.hr-dsheet');
  assert.match(await page.locator('.hr-dsheet').innerText(), /Do 3 long divisions/);
  await settle(page); await shot(page, 'teacher-desk-sheet-tablet');
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('with a mouse a game can be dragged onto a desk; the board at 1366 x 768 and on a phone', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1366, height: 768 });
  await page.waitForSelector('.hr-desk');
  // (the panel's catalog lists every lesson by subject: the search finds it and opens its list)
  await page.fill('#hr-cq', 'sudoku');
  const from = await page.locator(`[data-hritem="${sudoku.id}"]`).boundingBox(), to = await page.locator(`.hr-desk[data-sid="${kids[9].id}"]`).boundingBox();
  await page.mouse.move(from.x + 20, from.y + 15); await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 });
  await page.mouse.up();
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Sudoku for Jade/);
  await page.click('[data-give="cancel"]');
  await page.waitForSelector('.hr-giveform', { state: 'detached' });
  assert.equal(HO.boardView(cls).desks[kids[9].id].length, 1, 'cancel hands out nothing (Jade has only Crossword)');
  await settle(page); await shot(page, 'teacher-desks-laptop');
  assert.ok(await noSideways(page));
  assert.deepEqual(errors, []);
  await ctx.close();
  const P = await open(teacher, `/class/${cls.id}/homeroom`, { width: 390, height: 844 }, true);
  await P.page.waitForSelector('.hr-desk');
  // (a phone's strip opens the whole catalog in a sheet: Find lessons; a lesson picked there is picked)
  await P.page.tap('[data-hr="catalog"]');
  await P.page.tap(`.hr-csheet [data-hritem="${lab.id}"]`);
  await P.page.waitForSelector('#hr-givebar:not([hidden])');
  assert.ok(await noSideways(P.page));
  await settle(P.page); await shot(P.page, 'teacher-picked-phone');
  await P.page.tap('#hr-givebar [data-hrto="all"]');
  await P.page.waitForSelector('.hr-giveform');
  assert.equal(await P.page.locator('.hr-giveok').innerText(), 'Put on 10 desks');
  await settle(P.page); await shot(P.page, 'teacher-modal-phone');
  await P.ctx.close();
});

test('the student\'s desk: cards in order, Next up, 🔒 Later does not open, instructions in yellow; the game with them on top', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const dev = kids[3];
  for (const [name, vp, touch] of [['laptop', { width: 1366, height: 768 }, false], ['phone', { width: 390, height: 844 }, true], ['tablet', { width: 1180, height: 820 }, true]]) {
    const { ctx, page, errors } = await open(dev, `/class/${cls.id}/desk`, vp, touch);
    await page.waitForSelector('.hd-card');
    const cards = await page.locator('.hd-card').evaluateAll(els => els.map(e => ({ t: e.querySelector('.hd-ct').textContent, next: e.classList.contains('next'), locked: e.classList.contains('locked'), a: e.tagName })));
    assert.deepEqual(cards.map(c => c.t), ['Arithmetic Lab', 'Crossword', 'Atlas Quest'], name);
    assert.deepEqual(cards.map(c => [c.next, c.locked]), [[true, false], [false, true], [false, true]], `${name}: Next up, then Later`);
    assert.equal(cards[1].a, 'DIV', 'a waiting card is not a link');
    assert.equal(await page.locator('.hd-card.next .hd-badge', { hasText: 'Next up' }).count(), 1);
    assert.equal(await page.locator('.hd-card.locked .hd-badge', { hasText: 'Later' }).count(), 2);
    assert.match(await page.locator('.hd-card.next .hd-cins').innerText(), /Do 3 long divisions/);
    assert.equal(await page.locator('#hd-order').innerText(), 'Do these in order');
    assert.ok(await noSideways(page), `${name}: no sideways scroll`);
    const tall = await page.locator('.hd-card.next').evaluate(e => e.getBoundingClientRect().height);
    assert.ok(tall >= 48, 'a big tap target');
    await shot(page, `student-desk-${name}`);
    // A waiting card says why and stays.
    await page.locator('.hd-card.locked').first().click({ force: true });   // aria-disabled: Playwright would wait
    await page.locator('.toast', { hasText: 'Finish the ones before it first' }).waitFor();
    assert.match(page.url(), /\/desk$/);
    assert.equal(await page.locator('.hr-player').count(), 0, `${name}: a waiting card never opens the player`);
    if (name === 'tablet') {
      // Open the game in the desk's player layer (public/js/homeroom-player.js): the desk stays, the address says
      // which card is open, the instructions on top of the game, Back to my desk.
      await page.locator('.hd-card.next').tap();
      await page.waitForSelector('.hr-player iframe');
      assert.match(page.url(), new RegExp(`/class/${cls.id}/desk#play=`), 'the desk stays, the card in the address');
      const back = page.locator('.hr-playback');
      assert.match(await back.innerText(), /Back to my desk/);
      assert.match(await page.locator('.hr-playframe').getAttribute('src'), /[?&]in=hr(&|$)/);
      const game = page.frameLocator('.hr-player iframe');
      await game.locator('.playnote').waitFor();
      assert.match(await game.locator('.playnote-t').innerText(), /Do 3 long divisions/);
      assert.equal(await game.locator('.playbar > a.iconbtn').first().isVisible(), false, 'the game page\'s own Back gives way to the layer\'s');
      const stage = await game.locator('#stage').boundingBox(), note = await game.locator('.playnote').boundingBox();
      assert.ok(stage.y >= note.y + note.height - 1, 'the game starts under the instructions');
      await shot(page, 'game-instructions-tablet');
      await game.locator('.playnote summary').tap(); await page.waitForTimeout(200);
      await shot(page, 'game-instructions-open-tablet');
      // Finish it: Back to my desk, the cards are asked for again: the next card opens, the done card fades with a check.
      const cl = HO.deskView(cls, dev)[0], step = L.steps(L.getClassLesson(cl.id).lesson_id)[0];
      const P = await import('../../server/services/progress.js');
      assert.ok(P.gameScore(dev, cl.id, step.id, 5).ok);
      await back.tap();
      await page.waitForSelector('.hr-player', { state: 'detached' });
      assert.match(page.url(), new RegExp(`/class/${cls.id}/desk$`));
      await page.waitForSelector('.hd-card.done');
      assert.equal(await page.locator('.hd-card.next .hd-ct').innerText(), 'Crossword');
      assert.equal(await page.locator('.hd-card.locked').count(), 1);
      await shot(page, 'student-desk-done-tablet');
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // Ava: Sudoku (Any order) and Crossword: both open.
  const { ctx, page } = await open(kids[0], `/class/${cls.id}/desk`, { width: 820, height: 1180 }, true);
  await page.waitForSelector('.hd-card');
  assert.equal(await page.locator('.hd-card.locked').count(), 1, 'Crossword is In order after an unfinished Sudoku');
  assert.ok(await noSideways(page));
  await shot(page, 'student-desk-portrait');
  await ctx.close();
});
