// Homeroom: the teacher's desk in a real browser (docs/decisions.md "Homeroom: the teacher's desk"; public/js/homeroom.js):
//   - on a tablet, in a class with no students: a game and a lesson tapped in the panel, then My desk, are staged there
//     (cards on the desk, nothing assigned); a card's menu has Play / Preview, Hand out and Take off my desk; Play opens
//     the game; Hand out picks it, Whole class opens the sheet with "No students yet. Students who join will get it.",
//     and a student who joins later sees it on their desk;
//   - with a mouse at 1366 x 768: a game dragged from the panel onto My desk, a card dragged from My desk onto a
//     student's desk opens that desk's hand-out sheet; Take off my desk; the board's Select still edits the area;
//   - on a phone: My desk and its menu, nothing sideways.
// HR_SHOTS=<dir> also saves screenshots there (hrtd-*.png). Skipped with no Chromium.
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
const HO = await import('../../server/services/homeroom-handouts.js');
const HL = await import('../../server/services/homeroom-lessons.js');
const HS = await import('../../server/services/homeroom-staged.js');
const M = await import('../../public/js/homeroom-lesson-make.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hrtd-${name}.png` }) : null);

const boss = createUser({ username: 'HtdBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Teacher Desk Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const empty = S.createClass(boss, oak.id, { name: 'Room 1 (new)', teacherId: teacher.id }).class;
const full = S.createClass(boss, oak.id, { name: 'Room 2', teacherId: teacher.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava', 'Ben', 'Cleo'].map(n => kidIn(full, n));
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const sudoku = made('Sudoku', 'sudoku-td', '🔢');
const pizza = made('Fraction Pizza', 'fraction-pizza-td', '🍕');
made('Arithmetic Lab', 'arithmetic-lab', '🧮');
const lesson = HL.getMine(teacher, HL.saveLesson(teacher, { slug: 'arithmetic-lab', title: 'Long division warm-up', base: M.defaults('arithmetic-lab', 3), versions: [] }).lesson.id);
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
const settle = async page => { await page.waitForTimeout(450); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
const tapCenter = async (page, sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); };
const classLessons = c => q.get('SELECT COUNT(*) n FROM class_lessons WHERE class_id=? AND removed_at IS NULL', c.id).n;

test('a tablet, a class with no students: stage on My desk, preview, hand out to Whole class from the card', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${empty.id}/homeroom`, { width: 1180, height: 820 }, true);
  await page.waitForSelector('.hr-tdesk');
  assert.match(await page.locator('.hr-tdesk').innerText(), /My desk[\s\S]*Drop a game here/);
  // Tap Sudoku, then My desk.
  await page.tap(`[data-hritem="${sudoku.id}"]`);
  await page.waitForSelector('#hr-givebar:not([hidden]) [data-hrto="me"]');
  await tapCenter(page, '.hr-tdesk');
  await page.waitForSelector('.hr-tdesk [data-hrstaged]');
  assert.equal(await page.locator('#hr-givebar:not([hidden])').count(), 0, 'the pick ends once it is on the desk');
  // The lesson and Fraction Pizza by the bar's My desk chip.
  for (const id of [`L:${lesson.id}`, pizza.id]) {
    await page.tap(`[data-hritem="${id}"]`);
    await page.tap('#hr-givebar [data-hrto="me"]');
    await page.waitForFunction(n => document.querySelectorAll('.hr-tdesk [data-hrstaged]').length === n, id === pizza.id ? 3 : 2);
  }
  assert.deepEqual(HS.storedOf(empty.id).map(x => x.kind), ['game', 'lesson', 'game']);
  assert.equal(classLessons(empty), 0, 'staged, not assigned');
  assert.ok(await noSideways(page));
  await settle(page); await shot(page, 'empty-class-tablet');
  // The lesson's card: Preview opens its own question set.
  await page.locator('.hr-tdesk [data-hrstaged]').nth(1).tap();
  await page.waitForSelector('.hr-smenu');
  assert.equal(await page.locator('.hr-smenu [data-sm="play"]').getAttribute('href'), `/play/arithmetic-lab?chapter=${encodeURIComponent(lesson.base.set)}&lock=1`);
  assert.match(await page.locator('.hr-smenu').innerText(), /Preview[\s\S]*Hand out[\s\S]*Take off my desk/);
  await page.keyboard.press('Escape'); await page.waitForSelector('.hr-smenu', { state: 'detached' });
  // Sudoku's card: Play opens the game as the teacher.
  await page.locator('.hr-tdesk [data-hrstaged]').first().tap();
  await page.waitForSelector('.hr-smenu');
  assert.match(await page.locator('#sheet-title').innerText(), /Sudoku/);
  await settle(page); await shot(page, 'card-menu-tablet');
  await Promise.all([page.waitForURL(/\/play\/sudoku-td$/), page.locator('.hr-smenu [data-sm="play"]').tap()]);
  assert.equal(classLessons(empty), 0);
  await page.goto(`${BASE}/class/${empty.id}/homeroom`);
  await page.waitForSelector('.hr-tdesk [data-hrstaged]');
  assert.equal(await page.locator('.hr-tdesk [data-hrstaged]').count(), 3, 'kept between visits');
  // Hand out from the card: then Whole class. The sheet says nobody is in the class yet.
  await page.locator('.hr-tdesk [data-hrstaged]').first().tap();
  await page.waitForSelector('.hr-smenu');
  await page.tap('.hr-smenu [data-sm="give"]');
  await page.waitForSelector('#hr-givebar:not([hidden])');
  assert.match(await page.locator('#hr-givebar').innerText(), /Sudoku/);
  assert.equal(await page.locator('#hr-givebar [data-hrto="me"]').count(), 0, 'already on My desk: no My desk chip');
  await page.tap('#hr-groupchips [data-hrto="all"]');
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Sudoku for Whole class/);
  assert.equal(await page.locator('.hr-emptynote').innerText(), 'No students yet. Students who join will get it.');
  assert.equal(await page.locator('.hr-giveok').innerText(), 'Hand out to the class');
  await settle(page); await shot(page, 'empty-roster-note-tablet');
  await page.tap('.hr-giveok');
  await page.waitForSelector('.hr-giveform', { state: 'detached' });
  const ho = HO.boardView(empty).handouts;
  assert.equal(ho.length, 1); assert.equal(ho[0].target, 'all'); assert.deepEqual(L.studentsOfLesson(ho[0].id), []);
  assert.equal(await page.locator('.hr-tdesk [data-hrstaged]').count(), 3, 'it stays on My desk to hand out again');
  assert.deepEqual(errors, []);
  await ctx.close();
  // A student who joins later finds it on their desk.
  const late = kidIn(empty, 'Dana Late');
  const s = await open(late, `/class/${empty.id}/desk`, { width: 1180, height: 820 }, true);
  await s.page.waitForSelector('.hd-card');
  assert.match(await s.page.locator('.hd-card').first().innerText(), /Sudoku/);
  assert.doesNotMatch(await s.page.content(), /Fraction Pizza|Long division warm-up/, 'never what is only on the teacher\'s desk');
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test('a mouse at 1366 x 768: drag onto My desk, drag a card onto a student\'s desk, take it off; Select still edits', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${full.id}/homeroom`, { width: 1366, height: 768 });
  await page.waitForSelector('.hr-desk');
  assert.equal(await page.locator('.hr-tdesk [data-hrstaged]').count(), 0, 'each class has its own desk');
  // drag Fraction Pizza from the panel onto My desk
  await page.locator(`[data-hritem="${pizza.id}"]`).scrollIntoViewIfNeeded();
  const from = await page.locator(`[data-hritem="${pizza.id}"]`).boundingBox(), to = await page.locator('.hr-tdesk').boundingBox();
  await page.mouse.move(from.x + 20, from.y + from.height / 2); await page.mouse.down();
  await page.mouse.move(from.x + 80, from.y + 30, { steps: 4 }); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();
  await page.waitForSelector('.hr-tdesk [data-hrstaged]');
  assert.equal(HS.storedOf(full.id).length, 1);
  // drag the card onto Ben's desk: Ben's hand-out sheet
  const card = await page.locator('.hr-tdesk [data-hrstaged]').first().boundingBox(), ben = await page.locator(`.hr-desk[data-sid="${kids[1].id}"]`).boundingBox();
  await page.mouse.move(card.x + 20, card.y + card.height / 2); await page.mouse.down();
  await page.mouse.move(card.x + 60, card.y + 40, { steps: 4 }); await page.mouse.move(ben.x + ben.width / 2, ben.y + ben.height / 2, { steps: 10 });
  await page.waitForSelector('.hr-ghost');
  await settle(page); await shot(page, 'drag-from-desk-1366');
  await page.mouse.up();
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Fraction Pizza for Ben/);
  assert.equal(await page.locator('.hr-emptynote').count(), 0);
  await settle(page); await shot(page, 'hand-out-from-desk-1366');
  await page.tap('.hr-giveok').catch(() => page.click('.hr-giveok'));
  await page.waitForSelector(`.hr-desk[data-sid="${kids[1].id}"] .hr-card`);
  assert.deepEqual(L.studentsOfLesson(HO.boardView(full).handouts[0].id), [kids[1].id]);
  // take it off My desk
  await page.click('.hr-tdesk [data-hrstaged]');
  await page.waitForSelector('.hr-smenu');
  await page.click('.hr-smenu [data-sm="off"]');
  await page.waitForSelector('.hr-tdeskempty');
  assert.equal(HS.storedOf(full.id).length, 0);
  // the board's Select / handles model still works: a note placed in the area is selected with its handles
  await page.click('[data-hrmode="note"]');
  const area = await page.locator('.hr-area').boundingBox();
  await page.mouse.click(area.x + 120, area.y + 80);
  await page.keyboard.type('Warm-up first');
  await page.click('#hr-seltools [data-hrsel="done"]');
  await page.waitForSelector('.hr-h');
  assert.match(await page.locator('.hr-area [data-note]').innerText(), /Warm-up first/);
  assert.equal(await page.locator('[data-hrmode="move"]').getAttribute('aria-pressed'), 'true', 'back on Select');
  assert.ok(await noSideways(page));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a phone: My desk, its menu, nothing sideways', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${empty.id}/homeroom`, { width: 390, height: 844 }, true);
  await page.waitForSelector('.hr-tdesk [data-hrstaged]');
  assert.ok(await noSideways(page));
  await page.tap('[data-hr="fit"]').catch(() => {});
  await settle(page); await shot(page, 'phone-board');
  await page.locator('.hr-tdesk [data-hrstaged]').first().tap();
  await page.waitForSelector('.hr-smenu');
  assert.ok(await noSideways(page));
  await settle(page); await shot(page, 'phone-card-menu');
  assert.deepEqual(errors, []);
  await ctx.close();
});
