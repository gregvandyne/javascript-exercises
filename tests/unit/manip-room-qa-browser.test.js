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

test('push { own: true } with answers typed in the teacher\'s boxes: they are the answer key; students get empty boxes; Check marks right and wrong', () => {
  const { s, kids } = room('K1');
  const kid3 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Mina K1' }).user.id); S.addToClass(boss, M.getSession(s.id).class_id, kid3.id); assert.ok(M.join(kid3, { code: s.code }).ok);
  const area = { v: 2, checks: true, objects: [{ id: 'r1', k: 'rekenreks', x: 40, y: 40, s: 1, st: { rows: 2, beads: 10 } },
    { id: 'a1', k: 'answer', x: 700, y: 40, s: 1, st: { ans: '13', size: 'S' } }, { id: 'a2', k: 'answer', x: 700, y: 200, s: 1, st: { ans: '', size: 'S' } }] };
  assert.ok(M.saveArea(boss, s.id, 't', area).ok);
  assert.ok(M.push(boss, s.id, null, { own: true }).ok);
  // The students' copy: every box empty, no key, nowhere.
  const pushed = M.roomFor(kids[0], s.id).pushed;
  assert.ok(!pushed.includes('13'), 'the answer never reaches a student');
  assert.deepEqual(JSON.parse(JSON.parse(pushed).state).objects.filter(o => o.k === 'answer').map(o => o.st.ans), ['', '']);
  // Nor in the teacher's area as students see it (it is the key now), nor in what the teacher's page is sent.
  const tArea = JSON.parse(M.roomFor(kids[0], s.id).teacher.state);
  assert.equal(tArea.objects.find(o => o.id === 'a1').st.ans, '');
  assert.equal(tArea.__pushKeys, undefined);
  const hostArea = JSON.parse(M.roomFor(boss, s.id).teacher.state);
  assert.equal(hostArea.objects.find(o => o.id === 'a1').st.ans, '13', 'the teacher still sees their answer');
  assert.equal(hostArea.__pushKeys, undefined);
  // The teacher's area saved again (the page never sends the key): the key is kept.
  assert.ok(M.saveArea(boss, s.id, 't', hostArea).ok);
  // Students check: only the filled box counts.
  assert.deepEqual(M.checkAnswers(kids[0], s.id, { a1: '13', a2: 'x' }), { ok: true, results: { a1: true }, right: 1, total: 1 });
  assert.deepEqual(M.checkAnswers(kids[1], s.id, { a1: '12' }), { ok: true, results: { a1: false }, right: 0, total: 1 });
  assert.deepEqual(M.checkAnswers(kid3, s.id, {}), { ok: true, results: { a1: false }, right: 0, total: 1 });
  // A saved board pushed after it: its own key again, the area's is dropped.
  const saved = M.saveBoard(boss, { tool: 'rekenreks', title: 'Key 7', state: { v: 2, objects: [{ id: 'b1', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '', size: 'S', key: '7' } }] } }).board;
  assert.ok(M.push(boss, s.id, saved.id).ok);
  assert.deepEqual(M.checkAnswers(kids[0], s.id, { b1: '7' }), { ok: true, results: { b1: true }, right: 1, total: 1 });
  // Boxes with nothing typed: it can still be pushed, without a key.
  const { s: s2, kids: k2 } = room('K2');
  assert.ok(M.saveArea(boss, s2.id, 't', { v: 2, checks: true, objects: [{ id: 'a1', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '', size: 'S' } }] }).ok);
  assert.ok(M.push(boss, s2.id, null, { own: true }).ok);
  assert.deepEqual(M.checkAnswers(k2[0], s2.id, { a1: '1' }), { ok: false, code: 'noAnswers' });
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
  // Answer boxes with nothing typed: one plain line says so (it can still be pushed).
  assert.equal(await page.locator('.rm-pushnokey').count(), 0);
  await page.keyboard.press('Escape');
  assert.ok(M.saveArea(boss, s.id, 't', { v: 2, objects: [{ id: 'a9', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '', size: 'S' } }] }).ok);
  await page.reload(); await page.waitForSelector('.rm-area[data-key="t"] .mp-obj'); await page.waitForTimeout(300);
  await menu(page); await page.click('.rm-menu [data-rtool="push"]'); await page.waitForSelector('.rm-pushsheet [data-pushmine]');
  assert.equal((await page.locator('.rm-pushnokey').textContent()).trim(), 'Type the answers in your answer boxes first so students can check their work.');
  await shot(page, 'push-sheet-nokey');
  await page.keyboard.press('Escape');
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

// ---------------------------------------------------------------- inside Homeroom's player on a phone (?in=hr in its frame)
/** A page holding the player's frame: 390 x 844 less the player's bar (53 px), as Homeroom draws it on a phone. */
async function inPlayer(who, hash) {
  const s = await open(who, '/robots.txt', { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  await s.page.setContent(`<body style="margin:0"><div style="height:53px"></div><iframe id="f" src="${BASE}/manipulatives?in=hr${hash}" style="width:390px;height:791px;border:0;display:block"></iframe></body>`);
  return { ...s, f: s.page.frameLocator('#f') };
}
const topOf = (f, sel) => f.locator(sel).first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight }; });

test('the room in Homeroom\'s player on a phone: no second bar or Raise hand, My square in a corner, the palette one row', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('HR1');
  const P = await inPlayer(kids[0], `#live/${s.id}`);
  await P.f.locator('.rm-area.mine').waitFor(); await P.page.waitForTimeout(600);
  const bar = await P.f.locator('#rm-bar').evaluate(el => ({ text: el.innerText.trim(), h1: !!el.querySelector('h1'), hand: !!el.querySelector('[data-rtool="hand"]') }));
  assert.deepEqual(bar, { text: '', h1: false, hand: false }, 'only the icon of My square is left');
  assert.equal(await P.f.locator('[data-rtool="hand"]').count(), 0, 'no Raise hand anywhere in the room');
  assert.equal(await P.f.locator('#rm-bar [data-rtool="mine"]').isVisible(), true, 'My square, in a corner');
  const pal = await topOf(P.f, '#rm-pal');
  assert.ok(pal.h <= 64, `the palette is one row (${pal.h} px)`);
  assert.equal(await P.f.locator('#rm-pal [data-rtool="pen"]').count(), 1, 'its tools are still there (scroll sideways)');
  const sq = await topOf(P.f, '.rm-area.mine');
  assert.ok(sq.top >= 0 && sq.bottom <= pal.bottom - pal.h, 'the square shows whole above the palette');
  if (SHOTS) await P.page.screenshot({ path: `${SHOTS}/hr-phone-room.png` });
  // My square still brings the student back to their own square.
  await P.f.locator('#rm-bar [data-rtool="mine"]').tap();
  assert.deepEqual(P.errors, []);
  await P.ctx.close();
});

test('a practice question in Homeroom\'s player on a phone: the card folds, the board shows; ▾ and a hint open over the board without moving it', async t => {
  if (skip) return t.skip(skip);
  for (const hash of ['#practice/money/make-67-cents', '#practice/clock/elapsed-time', '#practice/base-ten-blocks/build-1-139', '#practice/number-lines/jump-to-add']) {
    const P = await inPlayer(boss, hash);
    await P.f.locator('#mp-prob .mp-prompt').waitFor(); await P.f.locator('.mp-board').waitFor(); await P.page.waitForTimeout(500);
    const b0 = await topOf(P.f, '.mp-board');
    assert.ok(b0.top >= 0 && b0.top < b0.vh * 0.5, `${hash}: the board's top shows without scrolling (${Math.round(b0.top)} of ${b0.vh})`);
    assert.ok(Math.min(b0.vh, b0.bottom) - b0.top >= 300, `${hash}: most of the board shows`);
    if (hash.includes('money') && SHOTS) await P.page.screenshot({ path: `${SHOTS}/hr-phone-set-money.png` });
    // ▾: the whole card over the board; the board stays where it was
    await P.f.locator('[data-pp="fold"]').tap();
    await P.f.locator('.mp-probc.open').waitFor();
    assert.ok(Math.abs((await topOf(P.f, '.mp-board')).top - b0.top) < 1, 'the board stays');
    await P.f.locator('[data-pp="fold"]').tap();
    await P.f.locator('.mp-probc:not(.open)').waitFor();
    // a hint: shown, over the board; the board does not move
    await P.f.locator('[data-pp="hint"]').tap();
    await P.f.locator('.mp-probc.open .mp-probhints li').first().waitFor();
    assert.equal(await P.f.locator('.mp-probhints li').first().isVisible(), true);
    assert.ok(Math.abs((await topOf(P.f, '.mp-board')).top - b0.top) < 1, `${hash}: a hint never pushes the board down`);
    if (hash.includes('money') && SHOTS) await P.page.screenshot({ path: `${SHOTS}/hr-phone-set-hint.png` });
    assert.deepEqual(P.errors, []);
    await P.ctx.close();
  }
  // The page on its own (not in Homeroom): no fold button, the card as before.
  const { ctx, page } = await open(boss, '/manipulatives#practice/money/make-67-cents', { viewport: { width: 390, height: 844 } });
  await page.waitForSelector('#mp-prob .mp-prompt');
  assert.equal(await page.locator('.mp-probfold').count(), 0);
  assert.equal(await page.locator('.mp-oomba').first().isVisible(), true);
  await ctx.close();
});
