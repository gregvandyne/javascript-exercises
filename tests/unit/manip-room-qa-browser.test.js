// The Manipulatives side of a QA walkthrough of the live room inside Homeroom (public/js/manip-room.js, public/js/manip.js,
// public/js/manip-task-list.js, public/css/manipulatives.css, services/manipulatives.js push):
//   - Push a board: "Push my board" sends the teacher's area as it is (nothing saved first); an empty area says so with a
//     way to it; saved boards stay listed, with a link that opens the tool in a new tab; the ⋯ menu closes;
//   - End session asks first, in the site's own dialog (never the browser's);
//   - "How it works" in the room: the teacher's ⋯ menu, the student's palette;
//   - a "Deleted · Undo" toast never follows to the next tool;
//   - a new answer box in a square never lands on the rekenrek;
//   - the room's palette fits Homeroom's player frame (?in=hr) at 1280 x 800 without scrolling;
//   - the Assign sheet: after assigning, the ticks go and the line says what was assigned to whom;
//   - the phone's "My square" icon is a house, not a dot.
// MANIP_SHOTS=<dir> also saves pictures. Browser tests skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'RoomQaBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const oak = S.createSchool(boss, { name: 'QA Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
function klass(name, n = 2) {
  const c = S.createClass(boss, oak.id, { name }).class;
  const kids = ['Zara', 'Leo', 'Mina'].slice(0, n).map(k => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `${k} ${name}` }).user.id); S.addToClass(boss, c.id, u.id); return u; });
  return { c, kids };
}
function room(name, tool = 'rekenreks') {
  const { c, kids } = klass(name);
  const s = M.createSession(boss, { classId: c.id, tool, title: `${name} room` }).session;
  for (const k of kids) assert.ok(M.join(k, { code: s.code }).ok);
  return { c, s, kids };
}

// ---------------------------------------------------------------- the server: Push my board
test('push { own: true }: the teacher\'s area as it is, without the room\'s own keys or the teacher\'s notes; an empty area is refused', () => {
  const { s, kids } = room('P1');
  // The area as the room page saves it: a rekenrek, an answer box with the teacher's answer, a note, a text, a mark.
  const area = { v: 2, objects: [{ id: 'r1', k: 'rekenreks', x: 40, y: 40, s: 1, st: { rows: 2, beads: 10, left: [3, 0] } }, { id: 'a1', k: 'answer', x: 700, y: 40, s: 1, st: { ans: '', size: 'S', key: '13' } }],
    checks: true, __ann: { notes: [{ id: 'n1', text: 'Show 13', x: 0.5, y: 0.5 }], texts: [{ id: 't1', text: 'Look', x: 0.5, y: 0.5 }], strokes: [{ c: '#FF6B4A', pts: [{ x: 0.1, y: 0.2 }, { x: 0.3, y: 0.4 }] }] } };
  assert.ok(M.saveArea(boss, s.id, 't', area).ok);
  assert.ok(M.push(boss, s.id, null, { own: true }).ok);
  const p = JSON.parse(M.getSession(s.id).pushed_state), st = JSON.parse(p.state);
  assert.equal(p.code, null);
  assert.deepEqual(st.objects.map(o => o.id), ['r1', 'a1']);
  assert.equal(st.objects[1].st.key, undefined, 'the teacher\'s answer never goes to students');
  assert.equal(st.checks, undefined); assert.equal(st.layout, undefined);
  assert.deepEqual(st.__ann.notes, [], 'the notes are already every square\'s Instructions');
  assert.equal(st.__ann.texts.length, 1); assert.equal(st.__ann.strokes.length, 1);
  assert.ok(st.__ann.texts[0].x < 0.5, 'a fraction of the big board now (the area is narrower than it)');
  // The student's room has it to load.
  assert.ok(M.roomFor(kids[0], s.id).pushed);
  // An empty area: refused, with its own words.
  const { s: s2 } = room('P2');
  assert.ok(M.saveArea(boss, s2.id, 't', { v: 2, objects: [] }).ok);
  assert.deepEqual(M.push(boss, s2.id, null, { own: true }), { ok: false, code: 'emptyArea' });
  // A student never pushes.
  assert.equal(M.push(kids[0], s.id, null, { own: true }).ok, false);
});

// ---------------------------------------------------------------- in a browser
let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = exe ? await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }) : await pw.chromium.launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  // The room's socket, as in production (server/index.js).
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  attachUpgrades(server, [(await import('../../server/services/manip-socket.js')).route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
async function open(who, path, opts = LAPTOP) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  // The browser's own boxes are never used.
  page.on('dialog', d => { errors.push(`browser dialog: ${d.type()}`); d.dismiss(); });
  if (path) await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const menu = async page => { if (!(await page.locator('.rm-menu').count())) await page.click('[data-rtool="menu"]'); await page.waitForSelector('.rm-menu'); };

test('Push a board: Push my board, the saved boards and a link to build one; the ⋯ menu closes; an empty area offers a way to it', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('P3');
  const saved = M.saveBoard(boss, { tool: 'rekenreks', title: 'Make 13', state: { v: 2, objects: [{ id: 'x1', k: 'rekenreks', x: 900, y: 900, s: 1, st: { rows: 2, beads: 10 } }] } }).board;
  const { ctx, page, errors } = await open(boss, `/manipulatives#live/${s.id}`);
  await page.waitForSelector('.rm-area[data-key="t"]'); await page.waitForTimeout(400);
  await menu(page); await page.click('.rm-menu [data-rtool="push"]');
  await page.waitForSelector('.rm-pushsheet');
  assert.equal(await page.locator('.rm-menu').count(), 0, 'the ⋯ menu closed');
  assert.equal(await page.locator('[data-rtool="menu"]').getAttribute('aria-expanded'), 'false');
  assert.equal((await page.locator('.rm-pushsheet [data-pushmine]').textContent()).trim(), 'Push my board');
  assert.equal(await page.locator(`.rm-pushsheet [data-push="${saved.id}"]`).count(), 1, 'the saved board is listed');
  const link = page.locator('.rm-pushsheet a[target="_blank"]');
  assert.equal(await link.getAttribute('href'), '/manipulatives#rekenreks');
  assert.match(await link.textContent(), /Build and save a board in Rekenreks/);
  await shot(page, 'push-sheet');
  // Push my board: the area as it is; every student is told.
  await page.click('.rm-pushsheet [data-pushmine]');
  await page.waitForSelector('.rm-pushsheet', { state: 'detached' });
  const p = JSON.parse(M.getSession(s.id).pushed_state);
  assert.equal(p.code, null); assert.equal(JSON.parse(p.state).objects[0].k, 'rekenreks');
  const st = await open(kids[0], `/manipulatives#live/${s.id}`);
  await st.page.waitForSelector('[data-rtool="loadpush"]');
  await st.ctx.close();
  // An empty area: says so, and "Go to my area" brings the area into view, ready to add to.
  assert.ok(M.saveArea(boss, s.id, 't', { v: 2, objects: [] }).ok);
  await page.reload(); await page.waitForSelector('.rm-area[data-key="t"]'); await page.waitForTimeout(400);
  await menu(page); await page.click('.rm-menu [data-rtool="push"]');
  await page.waitForSelector('.rm-pushsheet [data-pgo]');
  assert.equal(await page.locator('.rm-pushsheet [data-pushmine]').count(), 0);
  assert.match(await page.locator('.rm-pushempty').textContent(), /Your area is empty/);
  await shot(page, 'push-sheet-empty');
  await page.click('.rm-pushsheet [data-pgo]');
  assert.equal(await page.locator('.rm-pushsheet').count(), 0);
  assert.match(await page.locator('#rm-pal .mp-cap').first().textContent(), /Teacher's area/i);
  // Escape closes the sheet too.
  await menu(page); await page.click('.rm-menu [data-rtool="push"]'); await page.waitForSelector('.rm-pushsheet');
  await page.keyboard.press('Escape'); assert.equal(await page.locator('.rm-pushsheet').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('End session asks first (the site\'s dialog): Cancel keeps the room, End session ends it', async t => {
  if (skip) return t.skip(skip);
  const { s } = room('E1');
  const { ctx, page, errors } = await open(boss, `/manipulatives#live/${s.id}`);
  await page.waitForSelector('.rm-area[data-key="t"]');
  await menu(page); await page.click('.rm-menu [data-rtool="end"]');
  await page.waitForSelector('dialog.ob-dialog.is-danger');
  assert.equal((await page.locator('dialog.ob-dialog h2').textContent()).trim(), 'End this session?');
  await shot(page, 'end-confirm');
  await page.click('dialog.ob-dialog [data-ob="cancel"]');
  await page.waitForTimeout(300);
  assert.equal(M.getSession(s.id).status, 'active', 'Cancel: still running');
  await menu(page); await page.click('.rm-menu [data-rtool="end"]');
  await page.click('dialog.ob-dialog [data-ob="ok"]');
  await page.waitForSelector('.rm-menu [data-rtool="reopen"], [data-rtool="menu"]');
  await page.waitForFunction(() => document.querySelector('.rm-bar .mp-tag.bad'));
  assert.equal(M.getSession(s.id).status, 'ended');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('How it works in the room: the teacher\'s ⋯ menu, the student\'s palette (and its tools row on a phone)', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('H1');
  const host = await open(boss, `/manipulatives#live/${s.id}`);
  await host.page.waitForSelector('.rm-area[data-key="t"]');
  await menu(host.page); await host.page.click('.rm-menu [data-rtool="how"]');
  await host.page.waitForSelector('.sheet video.mp-howvideo');
  assert.equal(await host.page.locator('.rm-menu').count(), 0, 'the menu closed');
  assert.equal((await host.page.locator('#sheet-title').textContent()).trim(), 'Rekenreks: how it works');
  await shot(host.page, 'room-how-host');
  assert.deepEqual(host.errors, []);
  await host.ctx.close();
  const kid = await open(kids[0], `/manipulatives#live/${s.id}`);
  await kid.page.waitForSelector('#rm-pal .rm-palhow');
  await kid.page.click('#rm-pal .rm-palhow');
  await kid.page.waitForSelector('.sheet video.mp-howvideo');
  await shot(kid.page, 'room-how-student');
  assert.deepEqual(kid.errors, []);
  await kid.ctx.close();
  const phone = await open(kids[1], `/manipulatives#live/${s.id}`, { ...pw.devices['iPhone 13'], deviceScaleFactor: 2 });
  await phone.page.waitForSelector('.rm-area.mine'); await phone.page.waitForTimeout(400);
  assert.equal(await phone.page.locator('#rm-pal .rm-palhow').isVisible(), false);
  await phone.page.locator('#rm-pal .mp-toolsrow [data-rtool="how"]').tap();
  await phone.page.waitForSelector('.sheet video.mp-howvideo');
  await phone.ctx.close();
});

test('a "Deleted · Undo" toast and the page\'s toasts never follow to the next tool', async t => {
  if (skip) return t.skip(skip);
  const { ctx, page, errors } = await open(boss, '/manipulatives#rekenreks');
  await page.waitForSelector('#mp-board');
  await page.evaluate(async () => { (await import('/js/manip-wheel.js')).undoToast('1/2 deleted', 'Undo', () => {}); (await import('/js/app.js')).toast('Saved'); });
  assert.equal(await page.locator('.mp-undo').isVisible(), true);
  await page.evaluate(() => { location.hash = 'money'; });
  await page.waitForFunction(() => document.querySelector('.mp-tool h1')?.textContent.includes('Money'));
  assert.equal(await page.locator('.mp-undo').isVisible(), false, 'the Undo stayed with its board');
  assert.equal(await page.locator('#toasts .toast').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a student\'s new answer box lands beside the rekenrek in their square, never on it', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('A1');
  const { ctx, page, errors } = await open(kids[0], `/manipulatives#live/${s.id}`);
  await page.waitForSelector('.rm-area.mine .mp-obj');
  await page.locator('#rm-pal [data-pal]', { hasText: 'answer box' }).first().click();
  await page.waitForFunction(() => document.querySelectorAll('.rm-area.mine .mp-obj').length === 2);
  await page.click('#rm-zoom [data-rtool="mine"]'); await page.waitForTimeout(300);
  const rs = await page.locator('.rm-area.mine .mp-obj').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }));
  const hit = (a, b) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
  assert.equal(hit(rs[0], rs[1]), false, 'the answer box is not on the rekenrek');
  const sq = await page.locator('.rm-area.mine .rm-in').boundingBox();
  for (const r of rs) assert.ok(r.x >= sq.x - 0.5 && r.y >= sq.y - 0.5 && r.x + r.w <= sq.x + sq.width + 0.5 && r.y + r.h <= sq.y + sq.height + 0.5, 'inside the square');
  await shot(page, 'answer-box');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Homeroom\'s player at 1280 x 800 (?in=hr in its frame): the room\'s palette fits, Cover, the pen and Undo without scrolling', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('F1');
  const { ctx, page, errors } = await open(kids[0], '/robots.txt');
  // The player's frame: the page under its bar, about 1256 x 510 on a 1280 x 800 screen.
  await page.setContent(`<body style="margin:0"><div style="height:205px"></div><iframe id="f" src="${BASE}/manipulatives?in=hr#live/${s.id}" style="margin-left:12px;width:1256px;height:510px;border:0"></iframe></body>`);
  const fr = page.frameLocator('#f');
  await fr.locator('.rm-area.mine').waitFor(); await page.waitForTimeout(500);
  const m = await fr.locator('#rm-pal').evaluate(el => ({ sh: el.scrollHeight, ch: el.clientHeight, inhr: document.body.classList.contains('mp-inhr') }));
  assert.ok(m.inhr);
  assert.ok(m.sh <= m.ch + 1, `the palette fits without scrolling (${m.sh} <= ${m.ch})`);
  for (const sel of ['[data-pal]:has-text("Cover")', '[data-rtool="pen"]', '[data-rtool="undo"]']) {
    const r = await fr.locator(`#rm-pal ${sel}`).first().boundingBox(), pal = await fr.locator('#rm-pal').boundingBox();
    assert.ok(r && r.y + r.height <= pal.y + pal.height + 0.5, `${sel} in view`);
  }
  // The palette never covers Fit and My square under it.
  const pal = await fr.locator('#rm-pal').boundingBox(), zoom = await fr.locator('#rm-zoom .rm-zoom').boundingBox();
  assert.ok(pal.y + pal.height <= zoom.y + 0.5);
  await shot(page, 'inhr-palette');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Assign: after assigning, the ticks are gone and the line says what was assigned to which class', async t => {
  if (skip) return t.skip(skip);
  klass('Room 12');
  const { ctx, page, errors } = await open(boss, '/manipulatives#practice/fraction-tiles');
  await page.waitForSelector('[data-pick]');
  const picks = page.locator('[data-pick]');
  await picks.nth(0).check(); await picks.nth(2).check();
  assert.equal((await page.locator('#mp-tlpicked').textContent()).trim(), '2 tasks ticked');
  const titles = await page.locator('.mp-tltitle').evaluateAll(els => els.map(e => e.textContent));
  await page.click('#mp-tlassign'); await page.waitForSelector('.mp-assign');
  await page.selectOption('.mp-assign select[name="classId"]', { label: 'Room 12' });
  await page.fill('.mp-assign input[name="count"]', '4');
  await page.click('.mp-assign [type="submit"]');
  await page.waitForSelector('.mp-assign', { state: 'detached' });
  assert.equal(await page.locator('[data-pick]:checked').count(), 0, 'no ticks left');
  assert.equal(await page.locator('#mp-tlassign').isDisabled(), true);
  const line = (await page.locator('#mp-tlpicked').textContent()).trim();
  assert.equal(line, `Assigned to Room 12: ${titles[0]}, ${titles[2]}. Each student gets 8 questions.`);
  await shot(page, 'assign-after');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the phone\'s "My square" button: its house shows whole on the green button (a light disc behind it)', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('M1');
  const { ctx, page, errors } = await open(kids[0], `/manipulatives#live/${s.id}`, { ...pw.devices['iPhone 13'], deviceScaleFactor: 2 });
  await page.waitForSelector('.rm-minebar svg.fx-oo[data-fx="house"]');
  const bg = await page.locator('.rm-minebar svg.fx-oo').evaluate(el => ({ icon: getComputedStyle(el).backgroundColor, btn: getComputedStyle(el.closest('button')).backgroundColor }));
  assert.notEqual(bg.icon, 'rgba(0, 0, 0, 0)');
  assert.notEqual(bg.icon, bg.btn);
  await shot(page, 'phone-mysquare');
  assert.deepEqual(errors, []);
  await ctx.close();
});
