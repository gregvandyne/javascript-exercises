// Homeroom step 4c in a real browser (docs/decisions.md "Homeroom: K-2 mode, absent and at home"), on a tablet (820 x
// 1180, the main K-2 device), a Chromebook (1366 x 768) and a phone (390 x 844):
//   - a kindergarten desk in K-2 mode: Next up as one big picture with Read to me and a big Start, the rest as picture
//     tiles, big dock buttons; Raise hand as three big pictures; nothing sideways, every target big;
//   - the K-2 notebook: draw or type, a simpler toolbar, no search or tabs to manage; a drawing saved;
//   - K-2 reading notes: a drawing, how they liked it, a word; saved to the notebook;
//   - "Missed while you were out" on the desk of a student who was absent, with the teacher's words;
//   - at home: no Raise hand, Ask my teacher with pictures; the question in the teacher's Hands, marked At home;
//   - the teacher's board with an Absent desk (dimmed) and an At home desk, Today's attendance list (a mark made there);
//   - Finish class's summary with the absent counted on their own.
// HR_SHOTS=<dir> saves screenshots there (hrk2-*.png). Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HP = await import('../../server/services/homeroom-plan.js');
const HR = await import('../../server/services/homeroom-reading.js');
const AT = await import('../../server/services/homeroom-attendance.js');
const LIB = await import('../../server/services/library.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(450); await page.screenshot({ path: `${SHOTS}/hrk2-${name}.png` }); };

const boss = createUser({ username: 'K2bBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'K2 Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room K · Bees', teacherId: teacher.id, grade: 'K' }).class;
const NAMES = ['Ada Brooks', 'Ben Cruz', 'Cleo Diaz', 'Dev Shah', 'Eli Fox', 'Fay Gold', 'Gus Hart', 'Ivy Jones'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo, dev, eli] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Today: count to 20', x: 0.04, y: 0.12, by: 't' }], texts: [], strokes: [] }, shapes: [] });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, icon=? WHERE id=?", v.id, slug, icon, g.id);
  return games.getGame(g.id);
}
const bees = made('Counting Bees', 'counting-bees-k2b', '🐝'), shapes = made('Shape Hunt', 'shape-hunt-k2b', '🔷'), rhymes = made('Rhyme Time', 'rhyme-time-k2b', '🎵');
// Dev was absent yesterday: the handout given then is waiting for him ("Missed while you were out")
const missed = HO.handOut(teacher, cls, { gameId: rhymes.id, to: { kind: 'all' }, instructions: 'Find two words that rhyme with cat.', order: 'any' });
const DAY = 86400e3;
q.run('UPDATE homeroom_handouts SET created_at=created_at-? WHERE class_lesson_id=?', DAY, missed.classLesson.id);
q.run("INSERT INTO homeroom_attendance(class_id, user_id, day, zone, status, by_kind, set_by, at) VALUES (?,?,?,'UTC','absent','teacher',?,?)", cls.id, dev.id, AT.localDay('UTC', now() - DAY), teacher.id, now() - DAY);
const plan = HP.cleanPlan(teacher, cls, { parts: [{ kind: 'work', minutes: 12, title: 'Bee counting', versions: [{ pick: { type: 'game', id: bees.id } }], note: 'Count the bees. Tap the number.' }, { kind: 'break', minutes: 3 }] }).plan;
assert.ok(HP.usePlan(teacher, cls, plan).ok);
assert.ok(HO.handOut(teacher, cls, { gameId: shapes.id, to: { kind: 'all' }, instructions: 'Find 3 circles.', order: 'in' }).ok);
// a Reading handout for Ada, at its notes step (read and quizzed)
const book = LIB.books().find(b => b.grade === 'k' && b.pages.length >= 4) || LIB.books().find(b => b.pages.length >= 4);
const rd = HR.handOutReading(teacher, cls, { bookId: book.id, to: { kind: 'desk', id: ada.id }, order: 'any' });
assert.ok(rd.ok);
const t0 = now();
q.run(`INSERT INTO homeroom_reading(class_lesson_id, class_id, user_id, book_id, page, pages, read_at, quiz_src, marks, solved, quiz_at, created_at, updated_at)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, rd.classLesson.id, cls.id, ada.id, book.id, book.pages.length, book.pages.length, t0, 'library', '111', '111', t0, t0, t0);
const cookieOf = id => { let c = ''; startSession({ append: (k, v2) => { c = v2.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

async function open(who, path, viewport, touch = false) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  if (who) { const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]); }
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const TAB = { width: 820, height: 1180 }, WIDE = { width: 1366, height: 768 }, PHONE = { width: 390, height: 844 };
const SIZES = [[TAB, 820, true], [WIDE, 1366, false], [PHONE, 390, true]];
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
/** A desk shows At home: its chip, or (live, while they're on their desk) the live status chip saying it. */
const atHome = (page, sid) => page.waitForFunction(id => [...document.querySelectorAll(`.hr-desk[data-sid="${id}"] .hr-attchip.home, .hr-desk[data-sid="${id}"] .hr-lvhome`)].some(el => el.offsetParent !== null), sid);
const sizeOf = (page, sel) => page.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
async function draw(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(b.x + b.width * (0.3 + i * 0.05), b.y + b.height * (0.4 + (i % 2) * 0.1));
  await page.mouse.up();
}

test('a K-2 desk: Next up as one big picture with Read to me and Start, picture tiles, Raise hand as pictures', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  assert.ok(H.setLive(teacher, cls, 'start').ok);
  for (const [vp, w, touch] of SIZES) {
    const A = await open(ben, `/class/${cls.id}/desk`, vp, touch);
    await A.page.waitForSelector('.hd.hd-k2 .hd-k2hero');
    assert.match(await A.page.textContent('.hd-k2hero'), /Rhyme Time|Counting Bees|Shape Hunt/);
    assert.ok(await A.page.locator('.hd-k2hero .hr-readbtn').count() === 1, 'Read to me on by default');
    const st = await sizeOf(A.page, '.hd-k2start');
    assert.ok(st.h >= 60, `Start is big (${st.h})`);
    assert.ok(await A.page.locator('.hd-k2tile').count() >= 1);
    const dock = await sizeOf(A.page, '.hd-dockbtn');
    assert.ok(dock.h >= 60, `big dock buttons (${dock.h})`);
    assert.ok(await noSideways(A.page) <= 1, `nothing sideways at ${w}`);
    await shot(A.page, `desk-${w}`);
    await A.page.click('[data-hd="hand"]');
    await A.page.waitForSelector('.hd-k2hands .hd-k2hand');
    assert.equal(await A.page.locator('.hd-k2hands .hd-k2hand').count(), 3);
    const tile = await sizeOf(A.page, '.hd-k2hand');
    assert.ok(tile.h >= 100, `hand pictures are big (${tile.h})`);
    assert.ok(await noSideways(A.page) <= 1);
    await shot(A.page, `hand-${w}`);
    if (w === 820) {
      await A.page.click('.hd-k2hand[data-hdhand="raise:help"]');
      await A.page.waitForSelector('.hd-handbtn.on');
      await A.page.click('[data-hd="hand"]'); await A.page.click('.hd-handmenu [data-hdhand="lower"]');
    } else await A.page.keyboard.press('Escape');
    assert.deepEqual(A.errors, []);
    await A.ctx.close();
  }
});

test('the K-2 notebook draws or types; K-2 reading notes draw, pick and save', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [vp, w, touch] of SIZES) {
    const A = await open(ada, `/class/${cls.id}/desk`, vp, touch);
    await A.page.waitForSelector('.hd.hd-k2 .hd-k2hero');
    await A.page.click('.hd-dock [data-nb-open]');
    await A.page.waitForSelector('#nb.nb-k2 .nb-k2drawbtn');
    assert.equal(await A.page.locator('#nb .nb-search').count(), 0, 'no search in K-2');
    assert.equal(await A.page.locator('#nb .nb-add').count(), 0, 'no new tab in K-2');
    assert.equal(await A.page.locator('#nb .nb-k2tools .nb-tool').count(), 2, 'a simpler toolbar');
    await A.page.locator('#nb .nb-k2drawbtn').first().click();
    await A.page.waitForSelector('#nb .nb-k2draw.on .dp-svg');
    await draw(A.page, '#nb .nb-k2draw.on .dp-svg');
    await A.page.waitForTimeout(1200);
    assert.ok(await noSideways(A.page) <= 1);
    await shot(A.page, `notebook-${w}`);
    await A.page.click('#nb [data-nb="drawdone"]');
    await A.page.waitForSelector('#nb .nb-k2draw .dp-pic');
    if (w === 820) {
      const pg = q.get("SELECT drawing FROM notebook_pages WHERE user_id=? AND drawing!='' LIMIT 1", ada.id);
      assert.ok(pg && JSON.parse(pg.drawing).length >= 1, 'the drawing is saved');
    }
    await A.page.click('#nb [data-nb="close"]');
    // the Reading card's routine is at its notes: the K-2 form
    await A.page.goto(`${BASE}/class/${cls.id}/desk#read=${encodeURIComponent(rd.classLesson.id)}`);
    await A.page.waitForSelector('.hd-k2notes .dp-svg');
    assert.equal(await A.page.locator('.hd-k2feelb').count(), 3);
    await draw(A.page, '.hd-k2notes .dp-svg');
    await A.page.locator('.hd-k2feelb').nth(0).click();
    await A.page.fill('#hd-rdk2word', 'bunny');
    assert.ok(await noSideways(A.page) <= 1);
    await shot(A.page, `reading-notes-${w}`);
    if (w === 390) {
      await A.page.click('.hd-k2notes [type="submit"]');
      await A.page.waitForSelector('.hd-rddone');
      assert.ok(q.get('SELECT notes_at FROM homeroom_reading WHERE class_lesson_id=? AND user_id=?', rd.classLesson.id, ada.id).notes_at);
    }
    assert.deepEqual(A.errors, []);
    await A.ctx.close();
  }
});

test('Missed while you were out, with the teacher\'s words', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [vp, w, touch] of SIZES) {
    const A = await open(dev, `/class/${cls.id}/desk`, vp, touch);
    await A.page.waitForSelector('.hd-missed .hd-k2tile');
    assert.match(await A.page.textContent('.hd-missed'), /Missed while you were out[\s\S]*Rhyme Time/);
    assert.ok(await noSideways(A.page) <= 1);
    await shot(A.page, `missed-${w}`);
    assert.deepEqual(A.errors, []);
    await A.ctx.close();
  }
});

test('the board: an Absent desk and an At home desk; Today\'s attendance; a question from home in Hands; Finish class', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  assert.ok(AT.mark(teacher, cls, dev.id, 'absent').ok);
  assert.ok(AT.mark(teacher, cls, cleo.id, 'home').ok);
  // Cleo at home: no Raise hand, Ask my teacher with pictures
  const C = await open(cleo, `/class/${cls.id}/desk`, TAB, true);
  await C.page.waitForSelector('[data-hd="ask"]');
  assert.equal(await C.page.locator('[data-hd="hand"]').count(), 0, 'no hand or hall pass at home');
  assert.ok(await C.page.isVisible('#hd-homechip'));
  await C.page.click('[data-hd="ask"]');
  await C.page.waitForSelector('.hd-askmenu .hd-k2hand');
  await shot(C.page, 'ask-820');
  await C.page.click('.hd-askmenu [data-hdask="question"]');
  await C.page.waitForSelector('.hd-askbtn.on');
  assert.deepEqual(C.errors, []);
  await C.ctx.close();
  for (const [vp, w, touch] of SIZES) {
    const T = await open(teacher, `/class/${cls.id}/hub`, vp, touch);
    await T.page.waitForSelector(`.hr-desk.hr-att-absent[data-sid="${dev.id}"] .hr-attchip`);
    assert.match(await T.page.textContent(`.hr-desk[data-sid="${dev.id}"]`), /Absent today/);
    await atHome(T.page, cleo.id);
    assert.equal(await T.page.locator(`.hr-desk[data-sid="${dev.id}"] .hr-lvchip`).count(), 0, 'no live status on an absent desk');
    await shot(T.page, `board-${w}`);
    // Today: the attendance list; mark Eli at home from there (the tablet)
    await T.page.click('[data-hrpanel="today"]');
    await T.page.waitForSelector('.hr-attbox');
    await T.page.click('.hr-attbox summary');
    if (w === 820) {
      await T.page.click(`[data-hratt="${eli.id}:home"]`);
      await atHome(T.page, eli.id);
      assert.equal(AT.statusOf(cls.id, eli.id), 'home');
    }
    await T.page.waitForSelector('.hr-attbox[open] .hr-attlist');
    assert.ok(await noSideways(T.page) <= 1);
    await shot(T.page, `today-${w}`);
    // Hands: the question from home, marked At home
    await T.page.click('[data-hrpanel="hands"]');
    await T.page.waitForSelector('.hr-askrow');
    assert.match(await T.page.textContent('.hr-askrow'), /Cleo Diaz[\s\S]*At home/);
    await shot(T.page, `hands-${w}`);
    if (w !== 390) {
      await T.page.click('[data-hrpanel=""]');
      // a desk's menu: today's attendance and their own K-2 desk
      await T.page.click(`.hr-namebtn[data-hrdmenu="${dev.id}"]`);
      await T.page.waitForSelector('.hr-dmtop .hr-attseg');
      assert.equal(await T.page.getAttribute('.hr-dmtop [data-dmatt="absent"]', 'aria-checked'), 'true');
      assert.match(await T.page.textContent('.hr-dmtop'), /K-2 desk[\s\S]*As the class \(on\)/);
      await shot(T.page, `deskmenu-${w}`);
      await T.page.keyboard.press('Escape');
      // the ⋯ menu's K-2 desks: by grade (on) for a kindergarten class
      await T.page.click('[data-hr="menu"]');
      await T.page.click('[data-hr="k2"]');
      await T.page.waitForSelector('.hr-k2box');
      assert.equal(await T.page.getAttribute('[data-k2mode=""]', 'aria-checked'), 'true');
      assert.match(await T.page.textContent('[data-k2mode=""]'), /By grade \(on\)/);
      await shot(T.page, `k2menu-${w}`);
      await T.page.keyboard.press('Escape');
    }
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
  // Finish class: the summary counts the present students and shows the absent apart
  assert.ok(HP.runAction(teacher, cls, 'start').ok);
  const fin = HP.runAction(teacher, cls, 'finish');
  assert.equal(fin.summary.absent, 1);
  for (const [vp, w, touch] of SIZES) {
    const T = await open(teacher, `/class/${cls.id}/hub`, vp, touch);
    await T.page.waitForSelector('#hr-plan [data-hrplan]');
    if (!(await T.page.locator('#hr-plan [data-hrplan="summary"]').count())) await T.page.click('#hr-plan [data-hrplan="menu"]');
    await T.page.locator('[data-hrplan="summary"]').first().click();
    await T.page.waitForSelector('.hr-sum');
    assert.match(await T.page.textContent('.hr-sum'), /1 absent[\s\S]*not counted as unfinished/);
    assert.ok(await noSideways(T.page) <= 1);
    await shot(T.page, `summary-${w}`);
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
});
