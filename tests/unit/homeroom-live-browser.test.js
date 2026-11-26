// Homeroom step 3a in a real browser (docs/decisions.md "Homeroom, step 3a"): live class with the teacher's board on a
// Chromebook (1366 x 768) and students' desks on tablets:
//   - live desk status on the board (Working / Typing / Not here chips, the bar, a named cursor on a desk);
//   - a student raises a hand (I have a question): ✋ on their desk and in the Hands panel; Answered puts it down on
//     their desk;
//   - the hall pass queue with two students: Bathroom, Give hall pass ("Go ahead" and the timer), Put in line ("You're
//     next"), "X is back" (the next one goes);
//   - 📊 Today, looking at a desk and locking it ("Your teacher locked your desk for a moment");
//   - phone widths: nothing sideways on the board and the desk with the hand menu open.
// HR_SHOTS=<dir> saves screenshots there (hr3a-*.png). Skipped with no Chromium.
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
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HV = await import('../../server/services/homeroom-live.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr3a-${name}.png` }) : null);

const boss = createUser({ username: 'HrlbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Live Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 12 · Fractions', teacherId: teacher.id }).class;
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo, dev, eli] = kids;
H.saveSeats(teacher, cls, { preset: 'pods', seats: {} });
H.saveGroups(teacher, cls, { groups: H.roomOf(cls.id).groups, members: { [ada.id]: 'g1', [ben.id]: 'g2', [cleo.id]: 'g3', [dev.id]: 'g1' } });
H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Warm-up: 3/4 of 12', x: 0.04, y: 0.12, by: 't' }], texts: [], strokes: [] }, shapes: [] });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const g = games.createGame(official.id, { title: 'Fraction Pizza' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug='fraction-pizza-3a', icon='🍕' WHERE id=?", v.id, g.id);
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
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const LAPTOP = { width: 1366, height: 768 }, TABLET = { width: 1180, height: 820 }, PHONE = { width: 390, height: 844 };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
const fakePulse = (k, body) => HV.pulse(k, cls, body);

test('live class: desk status and cursors on the board, a hand raised and answered, the hall pass queue, Today, look and lock', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  const ho = HO.handOut(teacher, cls, { gameId: g.id, to: { kind: 'all' } });
  assert.ok(ho.ok, ho.code);
  const T = await open(teacher, `/class/${cls.id}/homeroom`, LAPTOP);
  const A = await open(ada, `/class/${cls.id}/desk`, TABLET, true);
  const B = await open(ben, `/class/${cls.id}/desk`, TABLET, true);
  const C = await open(cleo, `/class/${cls.id}/desk`, TABLET, true);
  // a few more classmates working (pulses as their desks would send them)
  fakePulse(dev, { where: 'game', on: ho.classLesson.id, idle: 30 });
  fakePulse(eli, { where: 'desk', idle: 2 });

  // ---- the student's desk: the big yellow Raise hand and its menu
  await A.page.waitForSelector('.hd-handbtn');
  await A.page.mouse.move(300, 400); await A.page.mouse.move(350, 450, { steps: 5 });
  await A.page.click('.hd-handbtn');
  await A.page.waitForSelector('.hd-handmenu');
  assert.equal(await A.page.locator('.hd-hmi').count(), 3);
  await shot(A.page, 'student-raise-menu-tablet');
  await A.page.click('.hd-hmi:has-text("I have a question")');
  await A.page.waitForSelector('.hd-note.up');
  assert.match(await A.page.locator('.hd-handbtn').innerText(), /Hand up/);
  // the desk keeps pulsing with a cursor over the desk
  for (let i = 0; i < 6; i++) { await A.page.mouse.move(200 + i * 40, 300 + i * 25, { steps: 3 }); await A.page.waitForTimeout(260); }

  // ---- the teacher's board: statuses, ✋, the Hands panel
  await T.page.waitForSelector('.hr-lvchip', { timeout: 10000 });
  await T.page.waitForSelector(`.hr-desk[data-sid="${ada.id}"] .hr-lvhand`, { timeout: 10000 });
  assert.match(await T.page.locator(`.hr-desk[data-sid="${ada.id}"] .hr-lvhand`).innerText(), /Question/);
  assert.match(await T.page.locator(`.hr-desk[data-sid="${dev.id}"] .hr-lvchip`).innerText(), /Working/);
  assert.match(await T.page.locator(`.hr-desk[data-sid="${eli.id}"] .hr-lvchip`).innerText(), /Typing/);
  assert.match(await T.page.locator(`.hr-desk[data-sid="${kids[7].id}"] .hr-lvchip`).innerText(), /Not here/);
  assert.equal(await T.page.locator('.hr-handsbtn .hr-count').innerText(), '1');
  await T.page.waitForSelector(`.hr-cur[data-cur="${ada.id}"]`, { timeout: 8000 });
  // (the cursor sits on Ada's own desk tile, painted over it and its live screen: the pad's pen is not a Manipulatives
  // tool, so the desk reports where: desk and its samples are kept)
  await T.page.waitForTimeout(1200);
  const curAt = await T.page.evaluate(id => {
    const c = document.querySelector(`.hr-cur[data-cur="${id}"]`), d = document.querySelector(`.hr-desk[data-sid="${id}"]`).getBoundingClientRect();
    const r = c.getBoundingClientRect(), x = r.left + 4, y = r.top + 4, L = c.parentElement;
    L.style.pointerEvents = 'auto'; c.style.pointerEvents = 'auto';
    const top = document.elementFromPoint(x, y); L.style.pointerEvents = ''; c.style.pointerEvents = '';
    return { inside: x >= d.left && x <= d.right && y >= d.top && y <= d.bottom, onTop: !!(top && top.closest('.hr-cur')) };
  }, ada.id);
  assert.deepEqual(curAt, { inside: true, onTop: true });
  await shot(T.page, 'teacher-live-board-laptop');
  await T.page.click('.hr-handsbtn');
  await T.page.waitForSelector('.hr-hrow');
  assert.match(await T.page.locator('.hr-hrow').innerText(), /Ada/);
  await shot(T.page, 'teacher-hands-panel-laptop');
  await T.page.click('[data-hrhand^="answer:"]');
  await A.page.waitForSelector('.hd-note.up', { state: 'detached', timeout: 10000 });
  assert.match(await A.page.locator('.hd-handbtn').innerText(), /Raise hand/);

  // ---- the hall pass with two students
  for (const P of [B, C]) {
    await P.page.waitForSelector('.hd-handbtn');
    await P.page.click('.hd-handbtn'); await P.page.click('.hd-hmi:has-text("Bathroom")');
    await P.page.waitForSelector('.hd-note.up');
  }
  await T.page.waitForSelector(`[data-hrhand="pass:${ben.id}"]`, { timeout: 8000 });
  await T.page.click(`[data-hrhand="pass:${ben.id}"]`);
  await T.page.waitForSelector(`[data-hrhand="pass:${cleo.id}"]:has-text("Put in line")`, { timeout: 8000 });
  await T.page.click(`[data-hrhand="pass:${cleo.id}"]`);
  await B.page.waitForSelector('.hd-note.go', { timeout: 10000 });
  assert.match(await B.page.locator('.hd-note.go').innerText(), /Go ahead[\s\S]*Hall pass: [45]:\d\d/);
  await C.page.waitForSelector('.hd-note:has-text("You’re next")', { timeout: 10000 });
  await shot(B.page, 'student-go-ahead-tablet');
  await shot(C.page, 'student-youre-next-tablet');
  await T.page.waitForSelector('.hr-pout');
  await shot(T.page, 'teacher-hall-pass-laptop');
  await T.page.click(`[data-hrhand="back:${ben.id}"]:has-text("Ben is back")`);
  await C.page.waitForSelector('.hd-note.go', { timeout: 10000 });
  await B.page.waitForSelector('.hd-note', { state: 'detached', timeout: 10000 });
  await T.page.click('[data-hrpanel="hands"]');

  // ---- 📊 Today
  await T.page.click('[data-hrpanel="today"]');
  await T.page.waitForSelector('.hr-tg');
  assert.match(await T.page.locator('.hr-tg').first().innerText(), /Fraction Pizza[\s\S]*of 8 done/);
  assert.equal(await T.page.locator('.hr-fl a[href$="/progress"]').count(), 1);
  await T.page.click('[data-hrpanel="today"]');

  // ---- look at a student's desk, lock it
  await T.page.click(`.hr-desk[data-sid="${ada.id}"] .hr-lvchip`);
  await T.page.waitForSelector('.hr-look'); await T.page.waitForTimeout(600);
  assert.match(await T.page.locator('.hr-look').innerText(), /Fraction Pizza/);
  assert.equal(await T.page.locator('.hr-lkpad svg').count(), 1);
  await shot(T.page, 'teacher-look-panel-laptop');
  await T.page.click('[data-hrflag="lock"]');
  await A.page.waitForSelector('.hd-locked', { timeout: 10000 });
  assert.match(await A.page.locator('.hd-locked').innerText(), /Your teacher locked your desk for a moment/);
  await shot(A.page, 'student-locked-tablet');
  await T.page.waitForSelector('[data-hrflag="lock"][aria-pressed="true"]', { timeout: 8000 });
  await T.page.click('[data-hrflag="lock"]');
  await A.page.waitForSelector('.hd-locked', { state: 'detached', timeout: 10000 });
  await T.page.keyboard.press('Escape');
  // a tap on the desk itself looks at it too
  await T.page.waitForSelector('.hr-look', { state: 'detached' });
  await T.page.click(`.hr-desk[data-sid="${ben.id}"]`, { position: { x: 30, y: 42 } });
  await T.page.waitForSelector('.hr-look', { timeout: 5000 });
  assert.match(await T.page.locator('#sheet-title').innerText(), /Ben/);
  await T.page.keyboard.press('Escape');


  // ---- Stuck: a desk with no step forward for 3 minutes shows Needs a look (the pulse's clock moved back)
  HV.clearClass(cls.id);
  const b0 = Date.now() - HV.STUCK_MS - 5000;
  q.run('UPDATE homeroom_rooms SET live_at=? WHERE class_id=?', b0 - 1000, cls.id);   // class started before that
  for (let at = b0; at < Date.now(); at += 10000) { HV.pulse(dev, cls, { where: 'game', on: ho.classLesson.id, idle: 30 }, at); HV.liveView(cls, HO.boardView(cls), at); }
  fakePulse(dev, { where: 'game', on: ho.classLesson.id, idle: 30 });
  for (const k of [ada, ben, cleo, eli]) fakePulse(k, { where: 'desk', idle: 4 });
  await T.page.waitForSelector(`.hr-desk[data-sid="${dev.id}"] .hr-lvflag`, { timeout: 8000 });
  await T.page.click('[data-hrpanel="today"]');
  await T.page.waitForSelector('.hr-tgflag:has-text("Dev")', { timeout: 8000 });
  await shot(T.page, 'teacher-today-panel-laptop');

  await T.page.click('[data-hrpanel="today"]');

  // a tablet board too
  const T2 = await open(teacher, `/class/${cls.id}/homeroom`, TABLET, true);
  await T2.page.waitForSelector('.hr-lvchip', { timeout: 10000 });
  assert.ok(await noSideways(T2.page) <= 0);
  await shot(T2.page, 'teacher-live-board-tablet');
  for (const P of [T, A, B, C, T2]) { assert.deepEqual(P.errors, []); await P.ctx.close(); }
  H.setLive(teacher, cls, 'end');
});

test('phones: the board live and the desk with the hand menu and the hall pass, nothing sideways', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  HV.raiseHand(dev, cls, 'help');
  const T = await open(teacher, `/class/${cls.id}/homeroom`, PHONE, true);
  await T.page.waitForSelector('.hr-handsbtn .hr-count', { timeout: 10000 });
  assert.ok(await noSideways(T.page) <= 0, 'board');
  await shot(T.page, 'teacher-live-board-phone');
  await T.page.click('.hr-handsbtn'); await T.page.waitForSelector('.hr-hrow');
  assert.ok(await noSideways(T.page) <= 0, 'hands panel');
  const box = await T.page.locator('#hr-flpanel').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= PHONE.width + 1, 'the panel fits');
  await shot(T.page, 'teacher-hands-panel-phone');
  await T.page.click('[data-hrpanel="today"]'); await T.page.waitForSelector('.hr-tg');
  await shot(T.page, 'teacher-today-panel-phone');
  const A = await open(ada, `/class/${cls.id}/desk`, PHONE, true);
  await A.page.waitForSelector('.hd-handbtn');
  await A.page.click('.hd-handbtn'); await A.page.waitForSelector('.hd-handmenu');
  assert.ok(await noSideways(A.page) <= 0, 'desk');
  const m = await A.page.locator('.hd-handmenu').boundingBox();
  assert.ok(m.x >= 0 && m.x + m.width <= PHONE.width + 1, 'the menu fits');
  const small = await A.page.evaluate(() => [...document.querySelectorAll('.hd-hmi, .hd-handbtn')].filter(el => el.getBoundingClientRect().height < 47.5).length);
  assert.equal(small, 0, '48-pixel targets');
  await shot(A.page, 'student-raise-menu-phone');
  await A.page.click('.hd-hmi:has-text("Bathroom")');
  await A.page.waitForSelector('.hd-note.up');
  HV.teacherHands(teacher, cls, { action: 'pass', studentId: ada.id });
  await A.page.waitForSelector('.hd-note.go', { timeout: 10000 });
  assert.ok(await noSideways(A.page) <= 0, 'the pass note');
  await shot(A.page, 'student-go-ahead-phone');
  // the next in line on a phone, and a locked desk on a phone
  const E = await open(eli, `/class/${cls.id}/desk`, PHONE, true);
  HV.raiseHand(eli, cls, 'bathroom'); HV.teacherHands(teacher, cls, { action: 'pass', studentId: eli.id });
  await E.page.waitForSelector('.hd-note:has-text("You’re next")', { timeout: 10000 });
  assert.ok(await noSideways(E.page) <= 0);
  await shot(E.page, 'student-youre-next-phone');
  await T.page.click('[data-hrpanel="today"]');
  await T.page.click(`.hr-desk[data-sid="${ada.id}"] .hr-lvchip`);
  await T.page.waitForSelector('.hr-look'); await T.page.waitForTimeout(600);
  assert.ok(await noSideways(T.page) <= 0, 'look panel');
  await shot(T.page, 'teacher-look-panel-phone');
  await T.page.click('[data-hrflag="lock"]');
  await A.page.waitForSelector('.hd-locked', { timeout: 10000 });
  await shot(A.page, 'student-locked-phone');
  await E.ctx.close();
  // the laptop desk
  const L = await open(ben, `/class/${cls.id}/desk`, LAPTOP);
  await L.page.waitForSelector('.hd-handbtn');
  await L.page.click('.hd-handbtn'); await L.page.waitForSelector('.hd-handmenu');
  await shot(L.page, 'student-raise-menu-laptop');
  // the teacher's look panel on a tablet
  const T3 = await open(teacher, `/class/${cls.id}/homeroom`, TABLET, true);
  await T3.page.waitForSelector(`.hr-desk[data-sid="${ada.id}"] .hr-lvchip`, { timeout: 10000 });
  await T3.page.click(`.hr-desk[data-sid="${ada.id}"] .hr-lvchip`);
  await T3.page.waitForSelector('.hr-look'); await T3.page.waitForTimeout(600);
  await shot(T3.page, 'teacher-look-panel-tablet');
  await T3.ctx.close();
  for (const P of [T, A, L]) { assert.deepEqual(P.errors, []); await P.ctx.close(); }
  H.setLive(teacher, cls, 'end');
});
