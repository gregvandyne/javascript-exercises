// Homeroom step 2c in a real browser:
//   - the Classroom tab's overview at the top of Progress at 1366 x 768 and on a phone: the summary numbers, the Google
//     Classroom status line, the table (alphabetical, cells per grading, trends), no sideways scroll of the page (the
//     table scrolls in its own box); a column's grade chip changes how it is graded;
//   - a comment and a sticker on a finished card from the teacher's board, seen on the student's desk and lesson page;
//   - team desks on a tablet: Arrange seats, Make a team, tap two desks, the team desk with both names; a game tapped
//     onto it goes to both; the student's desk says "Team: ..." and See the room shows the team desk once.
// HR_SHOTS=<dir> also saves screenshots there (hr2c-*.png). Skipped with no Chromium.
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
const P = await import('../../server/services/progress.js');
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
const shot = (page, name, opts = {}) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr2c-${name}.png`, ...opts }) : null);

const boss = createUser({ username: 'Hr2cBrBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Overview Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
// Google Classroom on (a fake client), for the status line; nothing here calls Google.
Object.assign(config, { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true });
const cls = S.createClass(boss, oak.id, { name: 'Room 14', teacherId: teacher.id }).class;
const NAMES = ['Jade Kim', 'Ava Diaz', 'Hana Ito', 'Ben Cole', 'Eli Fox', 'Cleo Park', 'Dev Rao', 'Gus Lee'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const by = n => kids[NAMES.indexOf(n)];
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon, owner = official) {
  const g = games.createGame(owner.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source=?, shelf='learn', slug=?, plays=? WHERE id=?", v.id, owner === official ? 'seed' : 'user', slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const lab = made('Arithmetic Lab', 'arithmetic-lab-2c', '🧮');
const cross = made('Crossword', 'crossword-2c', '📝');
const sudoku = made('Sudoku', 'sudoku-2c', '🔢');
const maze = made('Maze Run', 'maze-run-2c', '🌀');
const quiz = made('Fraction Pizza Quiz', 'fraction-pizza-2c', '🍕', teacher);
const room = H.roomOf(cls.id);
H.saveGroups(teacher, cls, { groups: room.groups, members: Object.fromEntries(kids.map((k, i) => [k.id, room.groups[i % 3].id])) });
const doneAll = (u, clId) => { for (const s of L.steps(L.getClassLesson(clId).lesson_id)) P.markDone(u, clId, s.id); };
const score = (u, clId, pts) => q.run("INSERT OR REPLACE INTO rubric_scores(class_lesson_id, step_id, user_id, rubric_id, snapshot, picks, points, max_points, scored_at) VALUES (?,?,?,?,?,?,?,?,?)", clId, '', u.id, 'rb-b', '{}', '[]', pts, 10, Date.now());
const DAY = 86400e3;
// Four handouts over the last weeks: a scored lesson in versions, a game by completion, a scored quiz, practice.
const h1 = HO.handOut(teacher, cls, { gameId: lab.id, to: { kind: 'all' }, grade: 'score' }).classLesson;
const h2 = HO.handOut(teacher, cls, { gameId: sudoku.id, to: { kind: 'all' }, grade: 'completion' }).classLesson;
const h3 = HO.handOut(teacher, cls, { gameId: cross.id, to: { kind: 'all' }, grade: 'score' }).classLesson;
const h4 = HO.handOut(teacher, cls, { gameId: quiz.id, to: { kind: 'all' }, grade: 'none' }).classLesson;
[[h1, 20], [h2, 13], [h3, 6], [h4, 1]].forEach(([h, d]) => q.run('UPDATE homeroom_handouts SET created_at=? WHERE class_lesson_id=?', Date.now() - d * DAY, h.id));
q.run("UPDATE homeroom_handouts SET hr_lesson='hl-b', version='Stretch' WHERE class_lesson_id=?", h1.id);
const pts1 = [9, 6, 10, 4, 8, 7, 5, 9], pts3 = [10, 7, 10, 3, 9, 8, 4, 9];
kids.forEach((k, i) => {
  doneAll(k, h1.id); score(k, h1.id, pts1[i]);
  if (i % 3) doneAll(k, h2.id);
  if (i < 7) { doneAll(k, h3.id); score(k, h3.id, pts3[i]); }
  if (i % 2) doneAll(k, h4.id);
});
// The class is linked to a Classroom class: roster synced this morning, grades sent 10 minutes ago.
q.run('INSERT INTO gc_links(class_id, course_id, course_name, linked_by, linked_at, roster_at) VALUES (?,?,?,?,?,?)', cls.id, 'c-1', '4th Grade Math', teacher.id, Date.now() - 9 * DAY, Date.now() - 3 * 3600e3);
q.run("INSERT INTO gc_posts(class_lesson_id, kind, class_id, course_id, coursework_id, posted_by, posted_at, grades_at, grades_mode) VALUES (?,?,?,?,?,?,?,?,?)", h1.id, 'assignment', cls.id, 'c-1', 'cw-1', teacher.id, Date.now() - 5 * DAY, Date.now() - 10 * 60e3, 'draft');
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

test('the overview at 1366 x 768: numbers, the Classroom line, the table; a column\'s grading changes from its chip', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/progress`, { width: 1366, height: 768 });
  await page.waitForSelector('#hr-overview');
  assert.ok(await noSideways(page), 'no sideways scroll');
  const heads = await page.locator('.hv-col .hv-title').allTextContents();
  assert.deepEqual(heads, ['Fraction Pizza Quiz', 'Crossword', 'Sudoku', 'Arithmetic Lab'], 'newest first');
  const names = await page.locator('tbody .hv-name a').allTextContents();
  assert.deepEqual(names, [...NAMES].sort(), 'alphabetical');
  const gc = await page.locator('#hv-gc').textContent();
  assert.match(gc, /Linked to “4th Grade Math”/); assert.match(gc, /roster synced/); assert.match(gc, /grades sent/);
  assert.equal(await page.locator('#hv-gc a').getAttribute('href'), `/class/${cls.id}/google-classroom`);
  assert.match(await page.locator('.hv-sum').textContent(), /of handouts finished/);
  assert.ok(await page.locator('.hv-trend.support').count() >= 1, 'someone needs support');
  await settle(page); await shot(page, 'overview-desktop');
  await page.locator('#hv-gc').screenshot(SHOTS ? { path: `${SHOTS}/hr2c-gc-line.png` } : {});
  // Change Sudoku from Completion to Not graded from its chip
  const chip = page.locator(`[data-hvgrade="${h2.id}"]`);
  await chip.click();
  await page.waitForSelector('.hv-menu');
  assert.equal(await page.locator('.hv-mi.on').getAttribute('data-mode'), 'completion');
  await settle(page); await shot(page, 'grade-change');
  await Promise.all([page.waitForNavigation(), page.click('.hv-mi[data-mode="none"]')]);
  await page.waitForSelector('#hr-overview');
  assert.equal(await page.locator(`[data-hvgrade="${h2.id}"]`).getAttribute('data-grade'), 'none');
  assert.equal(L.gradeModeOf(h2.id), 'none');
  // the full gradebook is still there below
  assert.ok(await page.locator('#gb-lessons').count());
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the overview on a phone: no sideways scroll; the table scrolls in its own box', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/progress`, { width: 390, height: 844 }, true);
  await page.waitForSelector('#hr-overview');
  assert.ok(await noSideways(page), 'no sideways scroll on a phone');
  const wrap = await page.locator('.hv-wrap').evaluate(el => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  assert.ok(wrap.sw > wrap.cw, 'the table scrolls inside its box');
  const sum = await page.locator('.hv-sum').boundingBox();
  assert.ok(sum.width <= 390);
  await page.evaluate(() => window.scrollTo(0, document.querySelector('#hr-overview').getBoundingClientRect().top + scrollY - 70));
  await settle(page); await shot(page, 'overview-phone');
  if (SHOTS) await page.locator('#hr-overview').screenshot({ path: `${SHOTS}/hr2c-overview-phone-full.png` });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a comment and a sticker on a finished card: the teacher\'s board, then the student\'s desk and lesson page', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const ava = by('Ava Diaz');
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1180, height: 820 }, true);
  await page.waitForSelector('.hr-desk');
  await page.evaluate(() => document.querySelector('[data-hr="fit"]')?.click());
  await page.locator(`.hr-desk[data-sid="${ava.id}"] .hr-more, .hr-desk[data-sid="${ava.id}"] [data-hrho]`).first().tap();
  await page.waitForSelector('.hr-dsheet');
  await page.locator(`[data-fbedit="${h3.id}"]`).tap();
  await page.fill('#hr-fbc', 'Great work on the tricky clues!');
  await page.locator('[data-fbst="trophy"]').tap();
  assert.equal(await page.locator('[data-fbst="trophy"]').getAttribute('aria-checked'), 'true');
  await settle(page); await shot(page, 'comment-teacher-edit');
  await page.locator(`[data-fbsave="${h3.id}"]`).tap();
  await page.waitForSelector('.hr-fbshow img');
  assert.match(await page.locator('.hr-fbshow').first().textContent(), /Great work on the tricky clues/);
  assert.equal(HO.feedbackFor(h3.id, ava.id).sticker, 'trophy');
  await settle(page); await shot(page, 'comment-teacher');
  assert.deepEqual(errors, []);
  await ctx.close();
  // the student's desk: the sticker and the words on her done card
  const s = await open(ava, `/class/${cls.id}/desk`, { width: 1180, height: 820 }, true);
  await s.page.waitForSelector('.hd-fb');
  assert.match(await s.page.locator('.hd-fb').textContent(), /Great work on the tricky clues/);
  assert.ok(await s.page.locator('.hd-fbsticker[src*="praise-1"]').count());
  assert.ok(await noSideways(s.page));
  await s.page.locator(`[data-hdcard="${h3.id}"]`).scrollIntoViewIfNeeded();
  await settle(s.page); await shot(s.page, 'comment-student-desk');
  await s.page.goto(`${BASE}/class/${cls.id}/lessons/${h3.id}`);
  await s.page.waitForSelector('#teacher-note');
  assert.match(await s.page.locator('#teacher-note').textContent(), /Great work on the tricky clues/);
  await settle(s.page); await shot(s.page, 'comment-student-lesson');
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});

test('team desks on a tablet: make a team, hand a game to it, the student sees "Team" and the team desk once', { timeout: 150000 }, async t => {
  if (skip) return t.skip(skip);
  const [ben, cleo] = [by('Ben Cole'), by('Cleo Park')];
  const { ctx, page, errors } = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1180, height: 820 }, true);
  await page.waitForSelector('.hr-desk');
  await page.tap('[data-hr="seats"]');
  await page.waitForSelector('[data-hr="teampick"]');
  await page.tap('[data-hr="teampick"]');
  for (const k of [ben, cleo]) {
    const b = await page.locator(`.hr-desk[data-sid="${k.id}"]`).boundingBox();
    await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  }
  assert.equal(await page.locator('.hr-desk.picked').count(), 2);
  assert.equal(await page.locator('[data-hr="teammake"]').isDisabled(), false);
  await settle(page); await shot(page, 'team-pick');
  await page.tap('[data-hr="teammake"]');
  await page.waitForSelector('.hr-team');
  const team = H.roomOf(cls.id).teams[0];
  assert.deepEqual(team.members.sort(), [ben.id, cleo.id].sort());
  assert.match(await page.locator('.hr-team').textContent(), /Ben Cole/);
  assert.equal(await page.locator(`.hr-desk[data-sid="${ben.id}"]`).count(), 0, 'the members sit at the team desk');
  // drag the team desk a little (with a mouse, as on a Chromebook)
  const tb = await page.locator('.hr-team').boundingBox();
  await page.mouse.move(tb.x + 40, tb.y + 20); await page.mouse.down(); await page.mouse.move(tb.x + 70, tb.y + 20, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(700);
  assert.notDeepEqual({ x: H.roomOf(cls.id).teams[0].x, y: H.roomOf(cls.id).teams[0].y }, { x: team.x, y: team.y }, 'moved and saved');
  await page.tap('[data-hr="seatsdone"]');
  await page.tap('[data-hr="fit"]'); await page.waitForTimeout(200);
  // hand a game to the team: tap the game, then the team desk
  await page.tap(`[data-hritem="${maze.id}"]`);
  const tb2 = await page.locator('.hr-team').boundingBox();
  await page.touchscreen.tap(tb2.x + tb2.width / 2, tb2.y + tb2.height / 2);
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('.hr-giveok').textContent(), /2 desks/);
  await page.tap('.hr-giveok');
  await page.waitForFunction(() => [...document.querySelectorAll('.toast')].some(x => /Maze Run/.test(x.textContent)));
  // the team desk lists its handouts (the first two, then "+N more"): now one more
  assert.match(await page.locator('.hr-team .hr-more').textContent(), /\+3 more/);
  const ho = HO.boardView(cls).handouts.find(h => h.title === 'Maze Run');
  assert.equal(ho.target, 'team'); assert.deepEqual(L.studentsOfLesson(ho.id).sort(), [ben.id, cleo.id].sort());
  await settle(page); await shot(page, 'team-teacher');
  assert.deepEqual(errors, []);
  await ctx.close();
  // Ben's desk: "Team: Cleo...", the team's pad, and See the room with the team desk once
  const s = await open(ben, `/class/${cls.id}/desk`, { width: 1180, height: 820 }, true);
  await s.page.waitForSelector('#hd-team');
  assert.match(await s.page.locator('#hd-team').textContent(), new RegExp(`Team: ${getUser(cleo.id).display_name}`));
  assert.match(await s.page.locator('.hd-padcap').textContent(), /team/i);
  assert.ok(await noSideways(s.page));
  await settle(s.page); await shot(s.page, 'team-student');
  await s.page.tap('[data-hd="room"]');
  await s.page.waitForSelector('.hd-rteam');
  assert.equal(await s.page.locator('.hd-rteam').count(), 1);
  assert.equal(await s.page.locator('.hd-rdesk').count(), NAMES.length - 1, 'two students, one desk');
  await settle(s.page); await shot(s.page, 'team-room');
  assert.deepEqual(s.errors, []);
  await s.ctx.close();
});
