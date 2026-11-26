// Homeroom: touch drag, the eraser, the resizable teacher's area, the whole board and students drawing on the room
// (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board"), in a real browser:
//   - an iPhone (touch): a lesson dragged by a finger out of the panel's sideways strip onto My desk and onto a student's
//     desk (a ghost under the finger, the target outlined), after a short hold too; a sideways swipe still scrolls the
//     strip and drags nothing; a card dragged from My desk onto a desk; a tap still picks;
//   - the eraser cuts a board line and an area line in two where it passes (saved, drawn again after a reload, undone);
//     the desk's pad eraser too;
//   - the teacher's area resized by its corner: saved, desks it would cover move down, the projector and a desk's window
//     follow;
//   - a note and a shape placed outside the area: saved, moved, copied and pasted, never on the projector, in a student's
//     See the room;
//   - students drawing on the room: off by default (403), the teacher's toggle, another student's desk refused, the rate
//     limit, paused screens; a student draws and erases in See the room; the teacher sees whose and clears them.
// Chromium (an iPhone's size and touch), WebKit too when Playwright's WebKit is installed. HRTOUCH_SHOTS=<dir> saves
// screenshots (deviceScaleFactor 1) at 390, 820 and 1366.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const H = await import('../../server/services/homeroom.js');
const HS = await import('../../server/services/homeroom-staged.js');
const MK = await import('../../server/services/homeroom-marks.js');
const SEATS = await import('../../public/js/homeroom-seats.js');
const { eraseStrokes } = await import('../../public/js/board-erase.js');
const games = await import('../../server/services/games.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launchChromium() { try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); } }
const SHOTS = process.env.HRTOUCH_SHOTS || '';
const browsers = [];
let skip = !pw ? 'needs Playwright' : false;

const boss = createUser({ username: 'HrTouchBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Homeroom Touch Oak' }).school;
const teacher = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ms Touch', role: 'teacher' }).user.id);
TOOLS.givePlan(teacher.id);
Object.assign(config, { homeroom: true, homeroomUsers: [teacher.username.toLowerCase()] });
const cls = S.createClass(boss, oak.id, { name: '4B Touch', teacherId: teacher.id }).class;
const kids = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay'].map(n => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, cls.id, u.id); return getUser(u.id); });
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
function made(title, slug, icon) {
  const g = games.createGame(official.id, { title, icon });
  const v = games.addVersion(g.id, '<!doctype html><title>x</title><p>Game</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn', slug=?, plays=? WHERE id=?", v.id, slug, 100 - title.length, g.id);
  return games.getGame(g.id);
}
const pizza = made('Fraction Pizza', 'fraction-pizza-touch', '🍕');
made('Sudoku', 'sudoku-touch', '🔢');
made('Atlas Quest', 'atlas-quest-touch', '🗺️');
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browsers.push({ name: 'chromium', browser: await launchChromium() }); } catch { /* none */ }
  try { browsers.push({ name: 'webkit', browser: await pw.webkit.launch() }); } catch { /* WebKit not installed here */ }
  if (!browsers.length) { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
});
test.after(async () => { for (const b of browsers) await b.browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const blank = { __ann: { notes: [], texts: [], strokes: [] }, shapes: [] };
const reset = () => { H.saveArea(teacher, cls, blank); H.saveSeats(teacher, cls, { preset: 'rows', seats: Object.fromEntries(SEATS.layout('rows', kids.length).map((p, i) => [kids[i].id, p])) }); };
const area = () => H.roomOf(cls.id).area;
const until = async (fn, what) => { for (let i = 0; i < 60; i++) { if (fn()) return; await new Promise(r => setTimeout(r, 100)); } assert.fail(`timed out: ${what}`); };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove())); await page.screenshot({ path: path.join(SHOTS, `${name}.png`) }); } };
const IPHONE = { viewport: { width: 390, height: 664 }, screen: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' };
const SIZES = { 390: IPHONE, 820: { viewport: { width: 820, height: 1180 }, hasTouch: true }, 1366: { viewport: { width: 1366, height: 768 } } };
const chromiumOf = () => (browsers.find(b => b.name === 'chromium') || {}).browser;
async function open(browser, opts = {}, who = teacher, url = `/class/${cls.id}/hub`) {
  const o = browser.browserType().name() === 'chromium' ? opts : Object.fromEntries(Object.entries(opts).filter(([k]) => k !== 'isMobile'));
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1, ...o });
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}${url}`);
  return { ctx, page, errors };
}
async function board(browser, opts) { const o = await open(browser, opts); await o.page.waitForSelector('.hr-desk'); await o.page.waitForTimeout(500); return o; }
const box = (page, sel) => page.locator(sel).first().boundingBox();
const mid = b => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
// (a toast along the bottom would sit over the strip: the finger would press it instead)
const noToasts = page => page.evaluate(() => document.querySelectorAll('.toast').forEach(t => t.remove()));
async function drag(page, pts, { hold = false } = {}) { await page.mouse.move(pts[0].x, pts[0].y); await page.mouse.down(); for (const p of pts.slice(1)) await page.mouse.move(p.x, p.y, { steps: 4 }); if (!hold) await page.mouse.up(); }
const line = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }));
/** One finger through the browser's own touch events (Chromium's CDP): down, moves (waiting between them), and up unless
 *  keep. -> the CDP session, to end it later */
async function finger(ctx, page, pts, { wait = 16, holdMs = 0, keep = false, cdp = null } = {}) {
  const s = cdp || await ctx.newCDPSession(page);
  if (!cdp) await s.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0].x, y: pts[0].y }] });
  if (holdMs) await page.waitForTimeout(holdMs);
  for (const p of pts.slice(cdp ? 0 : 1)) { await s.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x, y: p.y }] }); await page.waitForTimeout(wait); }
  if (!keep) await s.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  return s;
}

// ---------------------------------------------------------------- the eraser, by itself
test('the eraser cuts a line in two where it passes, takes a line it covers, leaves the rest alone', () => {
  const s = { id: 'a', c: '#E53935', w: 'L', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
  const far = { id: 'b', c: '#141414', pts: [{ x: 0, y: 200 }, { x: 100, y: 200 }] };
  const r = eraseStrokes([s, far], [{ x: 50, y: -20 }, { x: 50, y: 20 }], 10, { newId: () => 'new' });
  assert.equal(r.changed, true);
  assert.equal(r.strokes.length, 3, 'two pieces and the line it missed');
  const [p1, p2, p3] = r.strokes;
  assert.equal(p1.id, 'a'); assert.equal(p2.id, 'new'); assert.equal(p3, far, 'a line it missed is the same object');
  assert.equal(p1.c, '#E53935'); assert.equal(p2.w, 'L', 'pieces keep the style');
  assert.ok(Math.max(...p1.pts.map(p => p.x)) <= 40.1 && Math.min(...p2.pts.map(p => p.x)) >= 59.9, 'cut at the eraser\'s edge, not at the next recorded point');
  assert.equal(eraseStrokes([s], [{ x: 50, y: 0 }], 80).strokes.length, 0, 'a line wholly under it is gone');
  assert.equal(eraseStrokes([s], [{ x: 50, y: 50 }], 10).changed, false);
  // fractions in, fractions out
  const f = eraseStrokes([{ pts: [{ x: 0, y: 0.5 }, { x: 1, y: 0.5 }] }], [{ x: 450, y: 0 }, { x: 450, y: 600 }], 20, { toPx: p => ({ x: p.x * 900, y: p.y * 600 }), fromPx: p => ({ x: p.x / 900, y: p.y / 600 }) });
  assert.equal(f.strokes.length, 2); assert.ok(f.strokes.every(x => x.pts.every(p => p.x >= 0 && p.x <= 1)));
});

// ---------------------------------------------------------------- students drawing on the room: the server
test('students drawing on the room: off by default (403), the teacher\'s toggle, other desks refused, the rate limit, paused screens, whose', async () => {
  reset(); MK._resetRate();
  const call = async (who, p, body) => {
    const headers = { cookie: cookieOf(who.id), ...(body ? { 'content-type': 'application/json' } : {}) };
    const r = await fetch(`${BASE}${p}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    let json = null; try { json = await r.json(); } catch { /* html */ } return { status: r.status, json };
  };
  if (!BASE) { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); BASE = `http://127.0.0.1:${server.address().port}`; }
  const ada = kids[0], ben = kids[1], seats = H.roomOf(cls.id).seats;
  const free = [{ x: 450, y: 720 }, { x: 560, y: 760 }, { x: 640, y: 700 }];   // left of every desk, under My desk
  assert.equal(MK.drawOn(cls), false, 'off by default');
  const off = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'm1', c: '#141414', pts: free }] });
  assert.equal(off.status, 403); assert.equal(off.json.code, 'drawOff');
  assert.equal((await call(ada, `/api/homeroom/${cls.id}/student-draw`, { on: true })).status, 404, 'a student cannot turn it on');
  const on = await call(teacher, `/api/homeroom/${cls.id}/student-draw`, { on: true });
  assert.equal(on.status, 200); assert.equal(on.json.on, true); assert.equal(MK.drawOn(cls), true);
  const v0 = H.roomOf(cls.id).updatedAt;
  const ok1 = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'm1', c: '#1E88E5', pts: free }] });
  assert.equal(ok1.status, 200, JSON.stringify(ok1.json));
  assert.equal(H.roomOf(cls.id).updatedAt, v0, 'desks and the projector do not fetch the area again');
  // on Ben's desk: refused; on her own desk: hers
  const b = seats[ben.id], a = seats[ada.id];
  const there = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'm1', c: '#1E88E5', pts: free }, { id: 'm2', c: '#141414', pts: [{ x: b.x + 20, y: b.y + 20 }, { x: b.x + 90, y: b.y + 60 }] }] });
  assert.equal(there.status, 403); assert.equal(there.json.code, 'notHere');
  const areaHit = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'm3', pts: [{ x: 600, y: 100 }, { x: 700, y: 120 }] }] });
  assert.equal(areaHit.status, 403, 'never on the teacher\'s area');
  const own = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'm1', c: '#1E88E5', pts: free }, { id: 'm2', c: 'red', pts: [{ x: a.x + 20, y: a.y + 20 }, { x: a.x + 90, y: a.y + 60 }] }] });
  assert.equal(own.status, 200); assert.equal(own.json.mine[1].c, '#141414', 'a pen color from the list');
  // what others see: the lines, no names; the teacher: whose
  const benSees = await call(ben, `/api/desk/${cls.id}/marks`);
  assert.equal(benSees.json.on, true); assert.equal(benSees.json.others.length, 2); assert.deepEqual(benSees.json.mine, []);
  assert.ok(!JSON.stringify(benSees.json).includes('Ada'), 'no names for students');
  const tSees = await call(teacher, `/api/homeroom/${cls.id}/marks`);
  assert.deepEqual(tSees.json.marks.map(m => [m.name, m.strokes.length]), [['Ada', 2]]);
  assert.equal((await call(teacher, `/api/homeroom/${cls.id}/marks?v=${tSees.json.v}`)).json.marks, undefined, 'nothing again until it changes');
  // too much
  const big = Array.from({ length: MK.MARKS.strokes + 1 }, (_, i) => ({ id: `x${i}`, pts: [{ x: 450, y: 700 + i }, { x: 470, y: 700 + i }] }));
  assert.equal((await call(ada, `/api/desk/${cls.id}/marks`, { strokes: big })).status, 400);
  // the rate limit: MARKS.perMin saves a minute
  MK._resetRate();
  let last = null;
  for (let i = 0; i <= MK.MARKS.perMin; i++) last = await call(ben, `/api/desk/${cls.id}/marks`, { strokes: [{ id: 'b1', pts: [{ x: 450, y: 900 + i }, { x: 500, y: 910 }] }] });
  assert.equal(last.status, 429); assert.equal(last.json.code, 'tooFast');
  MK._resetRate();
  // paused screens lock it
  H.setLive(teacher, cls, 'start'); H.setLive(teacher, cls, 'pause');
  const paused = await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [] });
  assert.equal(paused.status, 403); assert.equal(paused.json.code, 'deskLocked');
  assert.equal((await call(ada, `/api/desk/${cls.id}/marks`)).json.locked, true);
  H.setLive(teacher, cls, 'end');
  // the teacher removes one student's, then clears everyone's
  assert.equal((await call(teacher, `/api/homeroom/${cls.id}/marks`, { action: 'remove', studentId: ben.id })).status, 200);
  assert.deepEqual(MK.forBoard(cls).marks.map(m => m.name), ['Ada']);
  assert.equal((await call(teacher, `/api/homeroom/${cls.id}/marks`, { action: 'clear' })).status, 200);
  assert.deepEqual(MK.forBoard(cls).marks, []);
  // off again: refused, and the projector's state never carries them
  await call(teacher, `/api/homeroom/${cls.id}/student-draw`, { on: false });
  assert.equal((await call(ada, `/api/desk/${cls.id}/marks`, { strokes: [] })).status, 403);
  assert.ok(!('marks' in H.boardState(cls.id)), 'the projector\'s state has no students\' lines');
});

// ---------------------------------------------------------------- touch drag on a phone
test('an iPhone: a finger drags out of the strip and out of the Find lessons sheet onto My desk and desks (after a hold too); a sideways swipe scrolls the strip; a card from My desk; a tap picks', { timeout: 240000 }, async t => {
  if (skip) return t.skip(skip);
  const browser = chromiumOf(); if (!browser) return t.skip('needs Chromium');
  reset();
  q.run('UPDATE homeroom_rooms SET staged=? WHERE class_id=?', '[]', cls.id);
  const { ctx, page, errors } = await board(browser, IPHONE);
  // (on a phone the catalog is the Find lessons sheet; the strip keeps the groups, lesson plans, Reading and the tools)
  const item = '#hr-panel [data-hritem="R:"]';
  const show = () => page.evaluate(sel => { const el = document.querySelector(sel), p = document.getElementById('hr-panel'); p.scrollLeft = el.offsetLeft - 40; }, item).then(() => page.waitForTimeout(200));
  await show();
  // a sideways swipe on it scrolls the strip, drags nothing
  const sx0 = await page.evaluate(() => document.getElementById('hr-panel').scrollLeft);
  const it0 = mid(await box(page, item));
  await finger(ctx, page, line(it0, { x: it0.x - 160, y: it0.y + 4 }, 10));
  await page.waitForTimeout(400);
  const sx1 = await page.evaluate(() => document.getElementById('hr-panel').scrollLeft);
  assert.ok(Math.abs(sx1 - sx0) > 40, `the strip scrolled (${sx0} -> ${sx1})`);
  assert.equal(await page.locator('.hr-ghost').count(), 0, 'no drag');
  assert.equal(await page.locator('#hr-givebar:not([hidden])').count(), 0, 'nothing picked');
  // Read any book, up out of the strip onto Ben's desk: the ghost follows, the desk is outlined, Ben's sheet
  await show(); await noToasts(page);
  const it = mid(await box(page, item)), ben = mid(await box(page, `.hr-desk[data-sid="${kids[1].id}"]`));
  const cdp = await finger(ctx, page, [...line(it, { x: it.x, y: it.y - 60 }, 4), ...line({ x: it.x, y: it.y - 60 }, ben, 10)], { keep: true });
  await page.waitForSelector('.hr-ghost');
  assert.equal(await page.locator(`.hr-desk[data-sid="${kids[1].id}"].hr-droptarget`).count(), 1, 'Ben\'s desk is outlined under the finger');
  await shot(page, 'drag-phone-390');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /for Ben/);
  assert.equal(await page.locator('.hr-ghost').count(), 0, 'the ghost is gone');
  await page.locator('[data-give="cancel"]').tap(); await page.waitForTimeout(300);
  await page.locator('#hr-givebar [data-hr="unpick"]').tap();
  // Find lessons: a hold on Fraction Pizza in the sheet, then onto My desk (the sheet steps aside, then closes)
  await page.evaluate(() => { const b = document.querySelector('[data-hr="catalog"]'), p = document.getElementById('hr-panel'); p.scrollLeft = b.offsetLeft - 20; });
  await page.locator('[data-hr="catalog"]').tap();
  await page.waitForSelector('.hr-csheet [data-cq]');
  await page.locator('.hr-csheet [data-cq]').fill('Pizza');
  await page.waitForTimeout(250); await page.keyboard.press('Enter').catch(() => {});
  await page.evaluate(() => document.activeElement && document.activeElement.blur()); await page.waitForTimeout(300);
  const sp = `.hr-csheet [data-hritem="${pizza.id}"]`;
  await page.locator(sp).scrollIntoViewIfNeeded();
  const pz = mid(await box(page, sp)), my = mid(await box(page, '.hr-tdesk'));
  const cdp2 = await finger(ctx, page, line(pz, my, 12), { holdMs: 420, keep: true });
  await page.waitForSelector('.hr-ghost');
  assert.equal(await page.locator('.hr-csheet').isVisible(), false, 'the sheet stepped aside');
  await shot(page, 'drag-phone-sheet-390');
  await cdp2.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await until(() => HS.storedOf(cls.id).length === 1, 'on My desk');
  await page.waitForSelector('.hr-tdesk [data-hrstaged]');
  assert.equal(await page.locator('.hr-csheet').count(), 0, 'the sheet closed');
  // a card on My desk, by a finger, onto Cleo's desk
  await page.waitForTimeout(300); await noToasts(page);
  const card = mid(await box(page, '.hr-tdesk [data-hrstaged]')), cleo = mid(await box(page, `.hr-desk[data-sid="${kids[2].id}"]`));
  await finger(ctx, page, line(card, cleo, 12));
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Fraction Pizza for Cleo/);
  await page.locator('[data-give="cancel"]').tap(); await page.waitForTimeout(300);
  await page.locator('#hr-givebar [data-hr="unpick"]').tap();
  await page.waitForSelector('#hr-givebar[hidden]', { state: 'attached' });
  // a tap still picks (the yellow bar says where to put it)
  await show(); await noToasts(page);
  await page.locator(item).tap();
  await page.waitForSelector('#hr-givebar:not([hidden])');
  assert.equal(await page.locator(item).getAttribute('aria-pressed'), 'true');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'nothing sideways');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a tablet\'s tall panel: a finger drags a lesson sideways onto a desk; up and down scrolls the panel', { timeout: 120000 }, async t => {
  if (skip) return t.skip(skip);
  const browser = chromiumOf(); if (!browser) return t.skip('needs Chromium');
  reset();
  const { ctx, page, errors } = await board(browser, { viewport: { width: 1180, height: 820 }, hasTouch: true });
  // the catalog's search opens Fraction Pizza's group
  await page.locator('#hr-panel [data-cq]').fill('Pizza'); await page.waitForTimeout(250);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const item = `#hr-panel [data-hritem="${pizza.id}"]`;
  await page.locator('#hr-panel [data-cq]').fill(''); await page.waitForTimeout(250);
  await page.locator('#hr-panel [data-cq]').fill('Pizza'); await page.waitForTimeout(250);
  await page.locator(item).scrollIntoViewIfNeeded();
  const y0 = await page.evaluate(() => document.getElementById('hr-panel').scrollTop);
  const it = mid(await box(page, item));
  await finger(ctx, page, line(it, { x: it.x + 3, y: it.y + 150 }, 10));
  await page.waitForTimeout(400);
  assert.notEqual(await page.evaluate(() => document.getElementById('hr-panel').scrollTop), y0, 'the panel scrolled');
  assert.equal(await page.locator('#hr-givebar:not([hidden])').count(), 0, 'nothing picked');
  await page.locator(item).scrollIntoViewIfNeeded();
  const it2 = mid(await box(page, item)), dev = mid(await box(page, `.hr-desk[data-sid="${kids[3].id}"]`));
  await finger(ctx, page, [...line(it2, { x: it2.x + 60, y: it2.y }, 4), ...line({ x: it2.x + 60, y: it2.y }, dev, 10)]);
  await page.waitForSelector('.hr-giveform');
  assert.match(await page.locator('#sheet-title').innerText(), /Fraction Pizza for Dev/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the eraser on the board
test('the eraser takes only what it passes over: a board line and an area line cut in two, saved, drawn again, undone', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors } = await board(browser);
    await page.click('[data-hrmode="pen"]');
    const a = await box(page, '.hr-area'), d = await box(page, '.hr-desk');
    // a board line beside the first desk, and one in the area
    const by = d.y + d.height + 18;
    await drag(page, line({ x: d.x - 120, y: by }, { x: d.x + d.width + 60, y: by }, 16));
    await drag(page, line({ x: a.x + a.width * 0.2, y: a.y + a.height * 0.6 }, { x: a.x + a.width * 0.8, y: a.y + a.height * 0.6 }, 24));
    await until(() => (area().ink || []).length === 1 && area().__ann.strokes.length === 1, `${name}: two lines`);
    await page.click('[data-hrmode="erase"]');
    assert.equal(await page.locator('[data-hrmode="erase"]').getAttribute('aria-pressed'), 'true');
    await page.click('[data-hrerase="L"]');
    // rub down across the middle of each
    const bx = d.x + d.width / 2 - 30, ax = a.x + a.width * 0.45;
    await drag(page, line({ x: bx, y: by - 30 }, { x: bx, y: by + 30 }, 6));
    await drag(page, line({ x: ax, y: a.y + a.height * 0.6 - 30 }, { x: ax, y: a.y + a.height * 0.6 + 10 }, 4), { hold: true });
    if (name === 'chromium') await shot(page, 'erase-mid-1366');
    await page.mouse.move(ax, a.y + a.height * 0.6 + 30, { steps: 3 }); await page.mouse.up();
    await until(() => (area().ink || []).length === 2 && area().__ann.strokes.length === 2, `${name}: both cut in two`);
    const ink = area().ink;
    assert.ok(Math.max(...ink[0].pts.map(p => p.x)) < Math.min(...ink[1].pts.map(p => p.x)), `${name}: a gap where the eraser went`);
    assert.notEqual(ink[0].id, ink[1].id, `${name}: each piece its own id`);
    // drawn again after a reload
    await page.reload(); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(400);
    assert.equal(await page.locator('#hr-ink polyline').count(), 2, `${name}: two board pieces`);
    assert.equal(await page.locator('.hr-area .hr-draw polyline').count(), 2, `${name}: two area pieces`);
    // undo puts the area line back whole (the last erase), Clear the pen still clears all
    await page.click('[data-hrmode="erase"]');
    const ax2 = a.x + a.width * 0.66;
    await drag(page, line({ x: ax2, y: a.y + a.height * 0.6 - 30 }, { x: ax2, y: a.y + a.height * 0.6 + 30 }, 4));
    await until(() => area().__ann.strokes.length === 3, `${name}: cut again`);
    await page.click('#hr-tools [data-hr="undo"]');
    await until(() => area().__ann.strokes.length === 2, `${name}: undone`);
    await page.click('[data-hr="clearpen"]');
    await until(() => !area().ink && area().__ann.strokes.length === 0, `${name}: Clear the pen`);
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

test('the eraser by touch on a phone (its own bar), and the desk\'s pad eraser', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  const browser = chromiumOf(); if (!browser) return t.skip('needs Chromium');
  reset();
  H.saveArea(teacher, cls, { ...blank, ink: [{ id: 'k1', c: '#1E88E5', w: 'L', pts: [{ x: 500, y: 640 }, { x: 900, y: 640 }] }] });
  {
    const { ctx, page, errors } = await board(browser, IPHONE);
    await page.locator('[data-hrmode="erase"]').tap();
    await page.waitForSelector('#hr-penbar:not([hidden]) [data-hrerase]');
    const pts = await page.evaluate(() => { const r = document.querySelector('#hr-ink polyline').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await finger(ctx, page, line({ x: pts.x, y: pts.y - 20 }, { x: pts.x, y: pts.y + 20 }, 6));
    await until(() => (area().ink || []).length === 2, 'a finger erased the middle');
    await shot(page, 'erase-phone-390');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // the desk's pad: a line, then the eraser through its middle
  const ada = kids[0];
  q.run('DELETE FROM homeroom_doodles WHERE class_id=?', cls.id);
  const { ctx, page, errors } = await open(browser, { viewport: { width: 1366, height: 768 } }, ada, `/class/${cls.id}/desk`);
  await page.waitForSelector('#hd-svg');
  const pad = await box(page, '#hd-svg');
  await drag(page, line({ x: pad.x + pad.width * 0.2, y: pad.y + pad.height * 0.5 }, { x: pad.x + pad.width * 0.8, y: pad.y + pad.height * 0.5 }, 16));
  await until(() => H.doodleOf(cls.id, ada.id).length === 1, 'a pad line');
  await page.click('#hd-erase');
  assert.equal(await page.locator('#hd-erase').getAttribute('aria-pressed'), 'true');
  await drag(page, line({ x: pad.x + pad.width * 0.5, y: pad.y + pad.height * 0.4 }, { x: pad.x + pad.width * 0.5, y: pad.y + pad.height * 0.6 }, 6));
  await until(() => H.doodleOf(cls.id, ada.id).length === 2, 'the pad line in two');
  await shot(page, 'pad-erase-1366');
  await page.click('#hd-undo');
  await until(() => H.doodleOf(cls.id, ada.id).length === 1, 'undone');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- the teacher's area resized
test('the teacher\'s area resized by its corner: saved, desks it would cover move down, the projector and a desk\'s window follow', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  const browser = chromiumOf(); if (!browser) return t.skip('needs Chromium');
  reset();
  H.saveArea(teacher, cls, { ...blank, __ann: { notes: [{ id: 'n1', text: 'Today: fractions', x: 0.05, y: 0.1, w: 200, h: 110 }], texts: [], strokes: [] } });
  const { ctx, page, errors } = await board(browser);
  const before = Math.min(...Object.values(H.roomOf(cls.id).seats).map(p => p.y));
  const h = await box(page, '.hr-fh-se'), z = await page.evaluate(() => +document.getElementById('hr-world').style.transform.match(/scale\(([\d.]+)\)/)[1]);
  await drag(page, line(mid(h), { x: mid(h).x + 200 * z, y: mid(h).y + 300 * z }, 8));
  await until(() => !!area().frame, 'the frame saved');
  const fr = area().frame;
  assert.ok(fr.w >= SEATS.AREA.w + 150 && fr.h >= SEATS.AREA.h + 250, `bigger ${JSON.stringify(fr)}`);
  assert.equal(fr.x, SEATS.AREA.x, 'its left edge stayed');
  await until(() => Math.min(...Object.values(H.roomOf(cls.id).seats).map(p => p.y)) >= SEATS.seatsTop(SEATS.frameOf(area())), 'the desks moved down under it');
  assert.ok(Math.min(...Object.values(H.roomOf(cls.id).seats).map(p => p.y)) > before);
  assert.deepEqual(area().__ann.notes[0].x, 0.05, 'the note keeps its place');
  // My desk under the area's middle
  const a = await box(page, '.hr-area'), my = await box(page, '.hr-tdesk');
  assert.ok(my.y > a.y + a.height, 'My desk under it');
  assert.ok(Math.abs((my.x + my.width / 2) - (a.x + a.width / 2)) < 3, 'centered');
  // the left edge, then a reload keeps it
  const hw = await box(page, '.hr-fh-w');
  await drag(page, line(mid(hw), { x: mid(hw).x - 100 * z, y: mid(hw).y }, 6));
  await until(() => area().frame.x < SEATS.AREA.x, 'its left edge moved');
  await page.reload(); await page.waitForSelector('.hr-desk'); await page.waitForTimeout(400);
  const ratio = await page.evaluate(() => { const r = document.querySelector('.hr-area').getBoundingClientRect(); return r.width / r.height; });
  const f2 = area().frame;
  assert.ok(Math.abs(ratio - f2.w / f2.h) < 0.02, 'drawn at its size after a reload');
  // undo puts the size back
  await page.click('#hr-tools [data-hr="undo"]').catch(() => {});
  for (const [w, o] of Object.entries(SIZES)) {
    const s = await board(browser, o);
    await shot(s.page, `area-resized-${w}`);
    await s.ctx.close();
  }
  // the projector and a student's window follow the new size
  const p = await open(browser, { viewport: { width: 1366, height: 768 } }, teacher, `/class/${cls.id}/hub/projector`);
  await p.page.waitForSelector('.hr-fit');
  const pf = await p.page.evaluate(() => { const f = document.querySelector('.hr-fit'); return { w: +f.dataset.w, h: +f.dataset.h, notes: document.querySelectorAll('.hr-roarea .mp-sticky').length }; });
  assert.deepEqual(pf, { w: area().frame.w, h: area().frame.h, notes: 1 });
  await shot(p.page, 'projector-resized-1366');
  await p.ctx.close();
  const st = await open(browser, { viewport: { width: 1366, height: 768 } }, kids[0], `/class/${cls.id}/desk`);
  await st.page.waitForSelector('#hd-window .hr-fit');
  assert.equal(await st.page.evaluate(() => +document.querySelector('#hd-window .hr-fit').dataset.h), area().frame.h);
  await st.ctx.close();
  assert.deepEqual(errors, []);
  await ctx.close();
});

// ---------------------------------------------------------------- objects anywhere on the board
test('a note and a shape outside the teacher\'s area: saved, moved, copied and pasted; never on the projector; in See the room', { timeout: 180000 }, async t => {
  if (skip) return t.skip(skip);
  for (const { name, browser } of browsers) {
    reset();
    const { ctx, page, errors } = await board(browser);
    const d = await box(page, `.hr-desk[data-sid="${kids[0].id}"]`);
    // a note left of the desks
    await page.click('[data-hrmode="note"]');
    await page.mouse.click(d.x - 140, d.y + 10);
    await page.keyboard.type('Line up here');
    await page.click('#hr-seltools [data-hrsel="done"]');
    await until(() => area().__ann.notes.length === 1 && area().__ann.notes[0].text === 'Line up here', `${name}: the note saved`);
    assert.ok(area().__ann.notes[0].y > 1, `${name}: under the area (${area().__ann.notes[0].y})`);
    // a shape drawn under the desks' row
    await page.click('[data-hrmode="shape"]');
    await page.click('[data-hrshape="star"]');
    await drag(page, line({ x: d.x - 150, y: d.y + d.height + 40 }, { x: d.x - 60, y: d.y + d.height + 120 }, 6));
    await until(() => area().shapes.length === 1, `${name}: the shape saved`);
    assert.ok(area().shapes[0].y > 1, `${name}: outside the area`);
    // selected, moved by a drag, copied and pasted (Ctrl+C, Ctrl+V), undone
    await page.keyboard.press('Escape');   // (the star's toolbar would sit over the note)
    const n0 = { ...area().__ann.notes[0] };
    const nb = await box(page, '.hr-area [data-note]');
    await page.mouse.click(nb.x + nb.width / 2, nb.y + 10);
    await drag(page, line({ x: nb.x + nb.width / 2, y: nb.y + 10 }, { x: nb.x + nb.width / 2 - 30, y: nb.y + 50 }, 4));
    await until(() => area().__ann.notes[0].y > n0.y, `${name}: moved`);
    await page.keyboard.press('ControlOrMeta+c'); await page.waitForTimeout(100);
    await page.keyboard.press('ControlOrMeta+v');
    await until(() => area().__ann.notes.length === 2, `${name}: pasted`);
    await page.keyboard.press('ControlOrMeta+z');
    await until(() => area().__ann.notes.length === 1, `${name}: undone`);
    if (name === 'chromium') {
      await page.mouse.click(5, 5).catch(() => {});
      for (const [w, o] of Object.entries(SIZES)) { const s = await board(browser, o); await shot(s.page, `outside-${w}`); await s.ctx.close(); }
    }
    // the projector: neither
    const p = await open(browser, {}, teacher, `/class/${cls.id}/hub/projector`);
    await p.page.waitForSelector('.hr-fit');
    assert.equal(await p.page.locator('.hr-roarea .mp-sticky').count(), 0, `${name}: no note on the projector`);
    assert.equal(await p.page.locator('.hr-roarea .hr-draw > *').count(), 0, `${name}: no shape on the projector`);
    await p.ctx.close();
    // a student's See the room: both
    const st = await open(browser, {}, kids[1], `/class/${cls.id}/desk`);
    await st.page.waitForSelector('[data-hd="room"]');
    await st.page.click('.hd-dock [data-hd="room"]');
    await st.page.waitForSelector('#hd-roombox .hd-robjs');
    assert.equal(await st.page.locator('#hd-roombox .hd-robj .mp-sticky').count(), 1, `${name}: the note in See the room`);
    assert.match(await st.page.locator('#hd-roombox .hd-robj').innerText(), /Line up here/);
    assert.ok(await st.page.locator('#hd-roombox .hd-robjsvg > *').count() >= 1, `${name}: the shape in See the room`);
    assert.equal(await st.page.locator('#hd-window .mp-sticky').count(), 0, `${name}: not on the desk's window on the area`);
    await st.ctx.close();
    assert.deepEqual(errors, [], name);
    await ctx.close();
  }
});

// ---------------------------------------------------------------- students drawing on the room: the pages
test('students drawing on the room: the teacher\'s toggle in the ⋯ menu, a student draws and erases in See the room, the teacher sees whose and clears them', { timeout: 200000 }, async t => {
  if (skip) return t.skip(skip);
  const browser = chromiumOf(); if (!browser) return t.skip('needs Chromium');
  reset(); MK._resetRate(); MK.removeMarks(teacher, cls); MK.setDraw(teacher, cls, false);
  const tb = await board(browser);
  await tb.page.click('[data-hr="menu"]');
  await tb.page.click('[data-hr="studentdraw"]');
  await tb.page.waitForSelector('.hr-drawbox');
  assert.equal(await tb.page.locator('[data-drawon="0"]').getAttribute('aria-checked'), 'true', 'off by default');
  await tb.page.click('[data-drawon="1"]');
  await until(() => MK.drawOn(cls), 'turned on');
  await tb.page.waitForTimeout(300);
  for (const [w, o] of Object.entries(SIZES)) {
    const s = await board(browser, o);
    await s.page.click('[data-hr="menu"]'); await s.page.click('[data-hr="studentdraw"]'); await s.page.waitForSelector('.hr-drawbox'); await s.page.waitForTimeout(300);
    await shot(s.page, `draw-toggle-${w}`);
    await s.ctx.close();
  }
  await tb.page.keyboard.press('Escape');
  // Ada in See the room: the pen, a line left of the desks
  const ada = kids[0];
  const st = await open(browser, {}, ada, `/class/${cls.id}/desk`);
  await st.page.waitForSelector('[data-hd="room"]');
  await st.page.click('.hd-dock [data-hd="room"]');
  await st.page.waitForSelector('#hd-roomtools:not([hidden]) [data-hdrp="pen"]');
  await st.page.click('[data-hdrp="pen"]');
  const front = await box(st.page, '#hd-roombox .hd-front'), first = await box(st.page, '#hd-roombox .hd-rdesk');
  const x1 = front.x + 16, x2 = Math.min(first.x - 16, front.x + 120), y = first.y + 20;
  await drag(st.page, line({ x: x1, y }, { x: x2, y: y + 30 }, 10));
  await until(() => (MK.forBoard(cls).marks || []).length === 1, 'her line saved');
  await shot(st.page, 'room-draw-1366');
  // over Ben's desk: no line there
  const bd = await box(st.page, '#hd-roombox .hd-rdesk:not(.me)');
  await drag(st.page, line({ x: bd.x + 10, y: bd.y + bd.height / 2 }, { x: bd.x + bd.width - 10, y: bd.y + bd.height / 2 }, 8));
  await st.page.waitForTimeout(900);
  assert.equal(MK.forBoard(cls).marks[0].strokes.length, 1, 'nothing on another desk');
  // the teacher's board shows it, with whose
  await tb.page.waitForFunction(() => document.querySelectorAll('#hr-smarks polyline').length === 1, null, { timeout: 15000 });
  assert.match(await tb.page.locator('#hr-smarks polyline title').textContent(), /Ada/);
  await shot(tb.page, 'room-draw-teacher-1366');
  // her eraser takes her line away (rubbed across it)
  await st.page.click('[data-hdrp="erase"]');
  await drag(st.page, line({ x: x1 - 4, y: y - 10 }, { x: x2 + 4, y: y + 40 }, 16));
  await until(() => (MK.forBoard(cls).marks || []).length === 0 || MK.forBoard(cls).marks[0].strokes.every(s => s.pts.length < 6), 'erased');
  // other screens: See the room with drawing on at 390 and 820
  await st.page.click('[data-hdrp="pen"]');
  await drag(st.page, line({ x: x1, y: y + 10 }, { x: x2, y: y + 40 }, 10));
  await until(() => (MK.forBoard(cls).marks || []).length === 1, 'a line again');
  for (const w of ['390', '820']) {
    const s = await open(browser, SIZES[w], kids[1], `/class/${cls.id}/desk`);
    await s.page.waitForSelector('[data-hd="room"]'); await s.page.click('.hd-dock [data-hd="room"]');
    await s.page.waitForSelector('#hd-roomtools:not([hidden])'); await s.page.waitForTimeout(800);
    await shot(s.page, `room-draw-${w}`);
    if (w === '820') assert.ok(await s.page.locator('#hd-roombox .hd-rmarks polyline').count() >= 1, 'Ben sees Ada\'s line');
    await s.ctx.close();
  }
  // the teacher clears students' drawings; then turns it off: no tools in See the room
  await tb.page.click('[data-hr="menu"]'); await tb.page.click('[data-hr="studentdraw"]'); await tb.page.waitForSelector('[data-drawclear]');
  await tb.page.click('[data-drawclear]');
  await tb.page.click('[data-ob="ok"]');
  await until(() => (MK.forBoard(cls).marks || []).length === 0, 'cleared');
  await tb.page.click('[data-drawon="0"]').catch(async () => { await tb.page.click('[data-hr="menu"]'); await tb.page.click('[data-hr="studentdraw"]'); await tb.page.click('[data-drawon="0"]'); });
  await until(() => !MK.drawOn(cls), 'off');
  await st.page.waitForFunction(() => document.getElementById('hd-roomtools')?.hidden, null, { timeout: 15000 });
  assert.deepEqual(st.errors, []); assert.deepEqual(tb.errors, []);
  await st.ctx.close(); await tb.ctx.close();
});
