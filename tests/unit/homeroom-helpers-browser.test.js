// Homeroom step 3c in a real browser (docs/decisions.md "Homeroom: supports, aides and sub links"), on a Chromebook
// (1366 x 768) and a tablet (820 x 1180):
//   - the teacher taps a student's name on their desk: the desk's menu with supports; Extra time 2x, Read aloud and
//     Bigger text saved; the desk shows its small 🧩 (the teacher's board only);
//   - that student's desk: Bigger text, Read to me beside the teacher's words, "Your time" on the plan's Now line;
//     a classmate's desk has none of it;
//   - an aide's Homeroom: the Aide chip, the board and Hands, no hand-out panel, no Arrange seats, a ⋯ menu with only the
//     projector view;
//   - Sub link for today from the ⋯ menu: the link and the note; the sub opens it (no account): first names, the note,
//     Start class, a hand answered;
//   - the teacher's "While you were out" note, and Got it;
//   - nothing sideways at either width.
// HR_SHOTS=<dir> saves screenshots there (hr3c-*.png). Skipped with no Chromium.
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
const HA = await import('../../server/services/homeroom-aides.js');
const SUP = await import('../../server/services/homeroom-supports.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = async (page, name) => { if (!SHOTS) return; await page.waitForTimeout(500); await page.screenshot({ path: `${SHOTS}/hr3c-${name}.png` }); };   // (after a sheet's slide-up)

const boss = createUser({ username: 'HrHelpBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Helpers Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
const aide = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mr Ortiz', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 12 · Fractions', teacherId: teacher.id }).class;
const NAMES = ['Ada Brooks', 'Ben Cruz', 'Cleo Diaz', 'Dev Shah', 'Eli Fox', 'Fay Gold'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const [ada, ben, cleo] = kids;
H.saveSeats(teacher, cls, { preset: 'rows', seats: {} });
H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Warm-up: 3/4 of 12', x: 0.04, y: 0.12, by: 't' }], texts: [], strokes: [] }, shapes: [] });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const g = games.createGame(official.id, { title: 'Fraction Pizza' });
const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug='fraction-pizza-3c', icon='🍕' WHERE id=?", v.id, g.id);
const ho = HO.handOut(teacher, cls, { gameId: g.id, to: { kind: 'all' }, instructions: 'Make each pizza show the same amount in two ways.' });
SUP.setSimple(teacher, cls, ho.classLesson.id, 'Show the same amount two ways.');
assert.ok(HA.addStaff(teacher, cls, aide.id).ok);
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
const WIDE = { width: 1366, height: 768 }, TAB = { width: 820, height: 1180 };
const noSideways = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);

test('supports from a desk\'s menu, the student\'s desk with Bigger text and Read to me', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const T = await open(teacher, `/class/${cls.id}/homeroom`, vp);
    await T.page.waitForSelector(`.hr-namebtn[data-hrdmenu="${ada.id}"]`);
    await T.page.click(`.hr-namebtn[data-hrdmenu="${ada.id}"]`);
    await T.page.waitForSelector('.hr-supbox');
    if (w === 1366) {
      await T.page.click('[data-suptime="200"]');
      await T.page.check('[data-sup="read"]'); await T.page.check('[data-sup="big"]'); await T.page.check('[data-sup="simple"]');
    }
    await shot(T.page, `supports-menu-${w}`);
    assert.ok(await T.page.isVisible('[data-supsave]'));
    if (w === 1366) {
      await T.page.click('[data-supsave]');
      await T.page.waitForSelector(`.hr-desk[data-sid="${ada.id}"] .hr-supico`);
      assert.deepEqual(SUP.supportOf(cls.id, ada.id), { time: 200, read: true, simple: true, big: true });
      assert.equal(await T.page.locator(`.hr-desk[data-sid="${ben.id}"] .hr-supico`).count(), 0);
    } else {
      assert.equal(await T.page.isChecked('[data-sup="read"]'), true, 'saved supports come back');
      assert.ok(await noSideways(T.page) <= 1);
    }
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
  // a plan running, so the desk shows its Now line and Ada's own clock
  const plan = HP.cleanPlan(teacher, cls, { parts: [{ kind: 'work', minutes: 15, title: 'Pizza work time' }, { kind: 'exit', minutes: 5 }] }).plan;
  assert.ok(HP.usePlan(teacher, cls, plan).ok);
  assert.ok(HP.runAction(teacher, cls, 'start').ok);
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const A = await open(ada, `/class/${cls.id}/desk`, vp, true);
    await A.page.waitForSelector('.hd.hr-big');
    await A.page.waitForSelector('.hd-cardwrap .hr-readbtn');
    assert.match(await A.page.textContent('.hd-cins'), /Show the same amount two ways/);
    await A.page.waitForSelector('.hd-mytime');
    await shot(A.page, `desk-big-read-${w}`);
    assert.ok(await noSideways(A.page) <= 1);
    assert.deepEqual(A.errors, []);
    await A.ctx.close();
  }
  // the game's page (opened from Ada's card): Bigger text and Read to me on the teacher's note over the game
  const step = q.get("SELECT id FROM lesson_steps WHERE lesson_id=(SELECT lesson_id FROM class_lessons WHERE id=?) AND kind='game'", ho.classLesson.id).id;
  const G = await open(ada, `/play/fraction-pizza-3c?lesson=${ho.classLesson.id}&step=${step}`, WIDE, true);
  await G.page.waitForSelector('body.hr-big .playnote summary .hr-readbtn');
  assert.match(await G.page.textContent('.playnote'), /Show the same amount two ways/);
  await shot(G.page, 'game-note-1366');
  assert.deepEqual(G.errors, []);
  await G.ctx.close();
  const B = await open(ben, `/class/${cls.id}/desk`, WIDE, true);
  await B.page.waitForSelector('.hd-card');
  await shot(B.page, 'desk-classmate-1366');
  assert.equal(await B.page.locator('.hd.hr-big, .hr-readbtn, .hd-mytime').count(), 0, 'a classmate has none of it');
  assert.match(await B.page.textContent('.hd-cins'), /Make each pizza/);
  await B.ctx.close();
});

test('an aide\'s Homeroom: the Aide chip, the board and Hands, nothing that changes the class', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'start');
  q.run("INSERT INTO homeroom_live(class_id, user_id, hand, hand_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET hand=excluded.hand, hand_at=excluded.hand_at", cls.id, cleo.id, 'help', now(), now());
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const A = await open(aide, `/class/${cls.id}/homeroom`, vp);
    await A.page.waitForSelector('.hr-aidechip');
    await A.page.waitForSelector('.hr-desk');
    assert.equal(await A.page.isVisible('#hr-panel'), false, 'no hand-out panel');
    assert.equal(await A.page.locator('[data-hr="seats"], [data-hr="golive"]').count(), 0);
    await A.page.waitForSelector('[data-hrpanel="hands"]');
    await A.page.click('[data-hrpanel="hands"]');
    await A.page.waitForSelector('.hr-hrow');
    await shot(A.page, `aide-${w}`);
    await A.page.click('[data-hr="menu"]');
    const items = await A.page.locator('#hr-menu .rm-mi').allTextContents();
    assert.equal(items.length, 1, `only the projector view: ${items}`);
    assert.ok(await noSideways(A.page) <= 1);
    assert.deepEqual(A.errors, []);
    await A.ctx.close();
  }
  q.run('DELETE FROM homeroom_live WHERE class_id=?', cls.id);
});

test('Sub link for today, the sub\'s page, and "While you were out"', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  H.setLive(teacher, cls, 'end');
  let url = '';
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const T = await open(teacher, `/class/${cls.id}/homeroom`, vp);
    await T.page.waitForSelector('.hr-desk');
    await T.page.click('[data-hr="menu"]');
    await T.page.click('[data-hr="sublink"]');
    await T.page.waitForSelector('.hr-subform');
    if (!url) {
      await T.page.fill('#hr-subnote', 'Lunch is at 11:40. Ben helps with the projector. If the plan runs short, pick a brain break.');
      await T.page.click('.hr-subform button[type="submit"]');
      await T.page.waitForSelector('#hr-sublink');
      url = await T.page.inputValue('#hr-sublink');
    }
    await shot(T.page, `sub-dialog-${w}`);
    assert.ok(await noSideways(T.page) <= 1);
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
  assert.match(url, /\/sub\/[A-Za-z0-9_-]{30,}$/);
  const raise = () => q.run("INSERT INTO homeroom_live(class_id, user_id, hand, hand_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id,user_id) DO UPDATE SET hand=excluded.hand, hand_at=excluded.hand_at", cls.id, cleo.id, 'question', now(), now());
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const U = await open(null, new URL(url).pathname, vp);
    await U.page.waitForSelector('.hr-sdesk');
    assert.equal(new URL(U.page.url()).pathname, '/sub', 'the token leaves the address bar');
    const names = await U.page.locator('.hr-sname').allTextContents();
    assert.ok(names.includes('Ada') && !names.some(n => / /.test(n.trim())), `first names: ${names}`);
    assert.match(await U.page.textContent('.hr-subnote'), /Lunch is at 11:40/);
    assert.ok(await U.page.locator('.hr-subsup').count() >= 1, 'Ada has supports');
    if (w === 1366) {
      await U.page.click('[data-sublive="start"]');
      await U.page.waitForSelector('#hr-live:not([hidden])');
      raise();   // (a student's hand, once class is live: starting it cleared the room)
      await U.page.click('[data-subplan="next"]');
      await U.page.waitForSelector('.hr-hrow');
    }
    await U.page.waitForTimeout(300);
    await shot(U.page, `sub-view-${w}`);
    assert.ok(await noSideways(U.page) <= 1);
    assert.deepEqual(U.errors, []);
    if (w === 1366) { await U.page.click('[data-subhand^="answer:"]'); await U.page.waitForFunction(() => !document.querySelector('.hr-hrow')); }
    await U.ctx.close();
  }
  for (const [vp, w] of [[WIDE, 1366], [TAB, 820]]) {
    const T = await open(teacher, `/class/${cls.id}/homeroom`, vp);
    await T.page.waitForSelector('.hr-outnote');
    const text = await T.page.textContent('.hr-outnote');
    assert.match(text, /While you were out/); assert.match(text, /Answered 1 hand/); assert.match(text, /Started class/);
    await shot(T.page, `while-out-${w}`);
    if (w === 820) { await T.page.click('[data-outseen]'); await T.page.waitForFunction(() => !document.querySelector('.hr-outnote')); }
    assert.deepEqual(T.errors, []);
    await T.ctx.close();
  }
  H.setLive(teacher, cls, 'end');
});
