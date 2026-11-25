// Homeroom step 1b in a real browser: the student desk (public/js/homeroom-desk.js) on a Chromebook (1366 x 768), a
// tablet (landscape and portrait) and a phone: their name, "Nothing on your desk yet", the pad, the window on the
// teacher's area and the dock, nothing sideways, tap targets at least 48 pixels; a doodle drawn and saved; the teacher's
// area and See the room; live class from the teacher's top bar (Everyone to Homeroom, Bring everyone to me, Pause
// screens) reaching the desk, and the "Your class is in Homeroom" prompt on another page; the projector view.
// HR_SHOTS=<dir> also saves screenshots there. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.HR_SHOTS || '';
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/hr1b-${name}.png` }) : null);

const boss = createUser({ username: 'HrdbBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Desk Browser Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Lane', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: 'Room 9 · Fractions', teacherId: teacher.id }).class;
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lia'];
const kids = NAMES.map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const me = kids[0];
H.saveSeats(teacher, cls, { preset: 'pods', seats: {} });
H.saveGroups(teacher, cls, { groups: H.roomOf(cls.id).groups, members: { [me.id]: 'g1' } });
H.saveArea(teacher, cls, { __ann: { notes: [{ id: 'n1', text: 'Fractions warm-up: 1/2 + 1/4', x: 0.04, y: 0.12, by: 't' }], texts: [{ id: 'x1', text: 'Today: adding fractions', x: 0.3, y: 0.08, fs: 'XL' }],
  strokes: [{ c: '#1F9D63', pts: [{ x: 0.32, y: 0.6 }, { x: 0.45, y: 0.75 }, { x: 0.6, y: 0.55 }] }] }, shapes: [{ id: 's1', k: 'circle', x: 0.7, y: 0.3, x2: 0.85, y2: 0.85, c: '#1E88E5' }] });
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
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: touch });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(BASE + path);
  return { ctx, page, errors };
}
const VIEWS = [['laptop', { width: 1366, height: 768 }, false], ['tablet-landscape', { width: 1180, height: 820 }, true], ['tablet-portrait', { width: 820, height: 1180 }, true], ['phone', { width: 390, height: 844 }, true]];

test('the desk on a Chromebook, a tablet both ways and a phone: everything there, nothing sideways, big tap targets', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  for (const [name, vp, touch] of VIEWS) {
    const { ctx, page, errors } = await open(me, `/class/${cls.id}/desk`, vp, touch);
    await page.waitForSelector('.hd-desk'); await page.waitForTimeout(300);
    assert.equal(await page.locator('.hd-deskh', { hasText: `${me.display_name} · My desk` }).count(), 1, name);
    assert.equal(await page.locator('.hd-emptydesk', { hasText: 'Nothing on your desk yet' }).count(), 1);
    assert.equal(await page.locator('#hd-svg').count(), 1);
    assert.equal(await page.locator('.hd-window .mp-sticky', { hasText: 'Fractions warm-up' }).count(), 1, 'the teacher\'s area in the window');
    const m = await page.evaluate(() => {
      const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
      const small = [...document.querySelectorAll('#hd button, #hd a.hd-dockbtn')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return r.height < 47.5 || r.width < 43.5; }).map(el => el.className + ':' + Math.round(el.getBoundingClientRect().height));
      const dock = document.querySelector('.hd-dock').getBoundingClientRect(), win = document.querySelector('.hd-window').getBoundingClientRect(), pad = document.getElementById('hd-svg').getBoundingClientRect();
      return { scroll: document.documentElement.scrollWidth - innerWidth, small, dockIn: dock.right <= innerWidth + 1 && dock.left >= -1, win: win.width, pad: [pad.width, pad.height], dockBtns: document.querySelectorAll('.hd-dock .hd-dockbtn').length };
    });
    assert.ok(m.scroll <= 0, `${name}: no sideways scroll (${m.scroll})`);
    assert.deepEqual(m.small, [], `${name}: every tap target at least 48 pixels`);
    assert.ok(m.dockIn, `${name}: the dock fits`); assert.equal(m.dockBtns, 5, 'My desk, Teacher\'s area, Library, See the room, Notebook');
    assert.ok(m.win > 150 && m.pad[0] > 200 && m.pad[1] > 120, `${name}: the window and the pad have room (${JSON.stringify(m)})`);
    await shot(page, `desk-${name}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('the pad: a doodle is drawn and saved; the teacher\'s area and See the room open and close', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(me, `/class/${cls.id}/desk`, { width: 1366, height: 768 });
  await page.waitForSelector('#hd-svg');
  const b = await page.locator('#hd-svg').boundingBox();
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.4); await page.mouse.down();
  await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.6, { steps: 8 }); await page.mouse.move(b.x + b.width * 0.6, b.y + b.height * 0.3, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(1200);
  const saved = H.doodleOf(cls.id, me.id);
  assert.equal(saved.length, 1); assert.ok(saved[0].pts.length > 5);
  await page.reload(); await page.waitForSelector('#hd-ink polyline');
  // Undo, then it is saved empty.
  assert.equal(await page.locator('#hd-undo').isDisabled(), true, 'nothing to undo after a reload');
  await page.click('#hd-clear'); await page.waitForTimeout(1200);
  assert.deepEqual(H.doodleOf(cls.id, me.id), []);
  await page.click('#hd-undo'); await page.waitForTimeout(1200);
  assert.equal(H.doodleOf(cls.id, me.id).length, 1, 'undo brings it back');
  // The teacher's area, full screen, then back.
  await page.click('.hd-dock [data-hd="area"]');
  assert.equal(await page.locator('.hd-over .mp-sticky', { hasText: 'Fractions warm-up' }).count(), 1);
  await page.click('.hd-over [data-hd="desk"]');
  assert.equal(await page.locator('.hd-over').count(), 0);
  // See the room: a desk per student with names, no work; mine marked.
  await page.click('.hd-dock [data-hd="room"]');
  assert.equal(await page.locator('.hd-rdesk').count(), kids.length);
  assert.equal(await page.locator('.hd-rdesk.me', { hasText: me.display_name }).count(), 1);
  assert.equal(await page.locator('.hd-room polyline, .hd-room .mp-sticky').count(), 0, 'no one\'s work');
  await shot(page, 'room-laptop');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.hd-over').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('live class: the teacher\'s top bar reaches every desk; the prompt on another page; the projector view', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const T = await open(teacher, `/class/${cls.id}/homeroom`, { width: 1366, height: 768 });
  await T.page.waitForSelector('.hr-desk');
  const other = await open(kids[1], '/classes', { width: 1180, height: 820 }, true);
  const desk = await open(me, `/class/${cls.id}/desk`, { width: 1180, height: 820 }, true);
  await desk.page.waitForSelector('.hd-desk');
  await T.page.click('[data-hr="golive"]');
  await T.page.waitForSelector('[data-hr="bring"]');
  assert.ok(H.liveOf(cls.id));
  // The prompt on any page, with the way to the desk.
  await other.page.waitForSelector('.hr-notify', { timeout: 8000 });
  assert.equal(await other.page.locator('.hr-notify a[href$="/desk"]', { hasText: 'Go to my desk' }).count(), 1);
  await shot(other.page, 'prompt-tablet');
  assert.ok(await other.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  // The desk shows Live, then Bring everyone to me, then Pause screens.
  await desk.page.waitForSelector('#hr-live:not([hidden])', { timeout: 9000 });
  await T.page.click('[data-hr="bring"]'); await T.page.waitForSelector('[data-hr="back"]');
  await desk.page.waitForSelector('.hd-over.hd-show >> text=Your teacher is showing this', { timeout: 6000 });
  await shot(desk.page, 'bring-tablet');
  await T.page.click('[data-hr="pause"]'); await T.page.waitForSelector('[data-hr="resume"]');
  await desk.page.waitForSelector('.hd-pause >> text=Eyes on your teacher', { timeout: 6000 });
  await shot(desk.page, 'paused-tablet');
  await T.page.click('[data-hr="back"]');
  await T.page.waitForTimeout(300);
  await shot(T.page, 'teacher-live-paused');
  // The ⋯ menu: the projector view and End class.
  await T.page.click('[data-hr="menu"]');
  const proj = T.page.locator('#hr-menu a[href$="/homeroom/projector"]');
  assert.equal(await proj.getAttribute('target'), '_blank');
  await shot(T.page, 'teacher-menu');
  const P = await open(teacher, `/class/${cls.id}/homeroom/projector`, { width: 1366, height: 768 });
  await P.page.waitForSelector('.hr-projarea .mp-sticky');
  const text = await P.page.evaluate(() => document.body.innerText);
  for (const k of kids) assert.ok(!text.includes(k.display_name), 'no student names on the projector');
  assert.ok(text.includes('Room 9'));
  assert.ok(await P.page.locator('#hr-live:not([hidden])').count());
  await shot(P.page, 'projector');
  // The live top bar on a tablet and a phone: nothing sideways.
  for (const [name, vp] of [['tablet', { width: 820, height: 1180 }], ['phone', { width: 390, height: 844 }]]) {
    const x = await open(teacher, `/class/${cls.id}/homeroom`, vp, true);
    await x.page.waitForSelector('[data-hr="resume"]');
    assert.ok(await x.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: no sideways scroll while live`);
    await shot(x.page, `teacher-live-${name}`);
    assert.deepEqual(x.errors, []); await x.ctx.close();
  }
  await T.page.click('#hr-menu [data-hr="end"]');
  await T.page.click('.ob-dialog .btn-primary');
  await T.page.waitForSelector('[data-hr="golive"]');
  assert.equal(H.liveOf(cls.id), null);
  await desk.page.waitForSelector('.hd-pause', { state: 'detached', timeout: 9000 });
  for (const x of [T, other, desk, P]) { assert.deepEqual(x.errors, []); await x.ctx.close(); }
});
