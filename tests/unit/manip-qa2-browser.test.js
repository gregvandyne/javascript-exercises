// A second QA pass of Manipulatives inside Homeroom (public/js/manip-room.js, public/js/manip-task-play.js,
// public/js/manip.js, public/css/manipulatives.css):
//   - N1: inside Homeroom (?in=hr) an ended room offers no Reopen (a reopened room there reaches no desk), and End
//     session says it takes the tool off every desk; the Manipulatives page on its own keeps Reopen;
//   - N3: the folded practice card on a phone: choices get a line of their own and wrap, the answer box stays usable,
//     the board still shows on first open;
//   - N5: Check my answers with one box: "Right!" and "Not right yet. Try again.", never "All 1 right!";
//   - N6: a new piece or object never lands under the zoom pill (solo, practice, the room).
// MANIP_SHOTS=<dir> also saves pictures. Browser tests skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const i18n = await import('../../server/i18n/index.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'Qa2Boss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const oak = S.createSchool(boss, { name: 'QA2 Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
function room(name, tool = 'rekenreks') {
  const c = S.createClass(boss, oak.id, { name }).class;
  const kids = ['Zara', 'Leo'].map(k => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: `${k} ${name}` }).user.id); S.addToClass(boss, c.id, u.id); return u; });
  const s = M.createSession(boss, { classId: c.id, tool, title: `${name} room` }).session;
  for (const k of kids) assert.ok(M.join(k, { code: s.code }).ok);
  return { c, s, kids };
}

// ---------------------------------------------------------------- the words (N5, N1)
test('Check with one box: "Right!" and "Not right yet. Try again."; more boxes keep the count', () => {
  const t = i18n.makeT('en');
  assert.equal(t('js.manip-room.checkOneRight'), 'Right!');
  assert.equal(t('js.manip-room.checkOneWrong'), 'Not right yet. Try again.');
  assert.equal(t('js.manip-room.checkAll', { total: 3 }), 'All 3 right!');
  assert.equal(t('js.manip-room.checkResult', { right: 1, total: 3 }), '1 of 3 right. Try again on the others.');
  assert.match(t('js.manip-room.endConfirmHr'), /off every desk/);
  assert.doesNotMatch(t('js.manip-room.endConfirmHr'), /reopen/i);
  for (const code of i18n.CODES.filter(c => c !== 'en' && c !== 'en-GB')) {
    const d = i18n.dictionary(code);
    for (const k of ['checkOneRight', 'checkOneWrong', 'endConfirmHr']) assert.ok(d[`js.manip-room.${k}`], `${code} has js.manip-room.${k}`);
  }
});

// ---------------------------------------------------------------- in a browser
let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = exe ? await pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }) : await pw.chromium.launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const { attachUpgrades } = await import('../../server/services/upgrade.js');
  attachUpgrades(server, [(await import('../../server/services/classlive-socket.js')).route, (await import('../../server/services/manip-socket.js')).route]);
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };
async function open(who, path, opts = LAPTOP) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  page.on('dialog', d => { errors.push(`browser dialog: ${d.type()}`); d.dismiss(); });
  if (path) await page.goto(`${BASE}${path}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const menu = async f => { if (!(await f.locator('.rm-menu').count())) await f.locator('[data-rtool="menu"]').click(); await f.locator('.rm-menu').waitFor(); };
/** Homeroom's player frame (?in=hr) on a page of the given size, under a bar of barH px. */
async function inPlayer(who, hash, opts = PHONE, barH = 53) {
  const s = await open(who, '/robots.txt', opts);
  const { width, height } = opts.viewport;
  await s.page.setContent(`<meta name="viewport" content="width=device-width,initial-scale=1"><body style="margin:0"><div style="height:${barH}px"></div><iframe id="f" src="${BASE}/manipulatives?in=hr${hash}" style="width:${width}px;height:${height - barH}px;border:0;display:block"></iframe></body>`);
  return { ...s, f: s.page.frameLocator('#f') };
}
const hit = (a, b) => a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5 && a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5;

test('N1: in Homeroom\'s player an ended room offers no Reopen, and End says the tool comes off every desk; on its own page Reopen stays', async t => {
  if (skip) return t.skip(skip);
  const { s } = room('N1');
  const P = await inPlayer(boss, `#live/${s.id}`, LAPTOP, 205);
  await P.f.locator('.rm-area[data-key="t"]').waitFor(); await P.page.waitForTimeout(400);
  await menu(P.f); await P.f.locator('.rm-menu [data-rtool="end"]').click();
  await P.f.locator('dialog.ob-dialog').waitFor();
  const text = (await P.f.locator('dialog.ob-dialog').innerText()).replace(/\s+/g, ' ');
  await shot(P.page, 'n1-end-confirm-inhr');
  assert.match(text, /off every desk/, text);
  assert.doesNotMatch(text, /reopen/i, text);
  await P.f.locator('dialog.ob-dialog [data-ob="ok"]').click();
  await P.f.locator('.rm-bar .mp-tag.bad').waitFor();
  assert.equal(M.getSession(s.id).status, 'ended');
  await menu(P.f);
  await shot(P.page, 'n1-ended-menu-inhr');
  assert.equal(await P.f.locator('[data-rtool="reopen"]').count(), 0, 'no Reopen inside Homeroom');
  assert.deepEqual(P.errors, []);
  await P.ctx.close();
  // The Manipulatives page on its own: the old words and Reopen.
  const { s: s2 } = room('N1b');
  const { ctx, page, errors } = await open(boss, `/manipulatives#live/${s2.id}`);
  await page.waitForSelector('.rm-area[data-key="t"]');
  await menu(page); await page.click('.rm-menu [data-rtool="end"]');
  await page.waitForSelector('dialog.ob-dialog');
  assert.match(await page.locator('dialog.ob-dialog').innerText(), /reopen the room later/);
  await page.click('dialog.ob-dialog [data-ob="ok"]');
  await page.waitForSelector('.rm-bar .mp-tag.bad');
  await menu(page);
  assert.equal(await page.locator('.rm-menu [data-rtool="reopen"]').count(), 1, 'Reopen on its own page');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N5: a student checks one box: "Not right yet. Try again." then "Right!"', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = room('N5');
  assert.ok(M.saveArea(boss, s.id, 't', { v: 2, checks: true, objects: [{ id: 'a1', k: 'answer', x: 10, y: 10, s: 1, st: { ans: '13', size: 'S' } }] }).ok);
  assert.ok(M.push(boss, s.id, null, { own: true }).ok);
  const { ctx, page, errors } = await open(kids[0], `/manipulatives#live/${s.id}`);
  await page.waitForSelector('[data-rtool="loadpush"]'); await page.click('[data-rtool="loadpush"]');
  await page.waitForSelector('.rm-area.mine .mp-answer');
  const check = page.locator('[data-rtool="check"]').first();
  await page.locator('.rm-area.mine .mp-answer').fill('12'); await page.waitForTimeout(700);
  await check.click();
  await page.waitForSelector('#toasts .toast');
  const wrong = (await page.locator('#toasts .toast').last().innerText()).trim();
  await shot(page, 'n5-check-one-wrong');
  assert.equal(wrong, 'Not right yet. Try again.');
  await page.locator('.rm-area.mine .mp-answer').fill('13'); await page.waitForTimeout(700);
  await check.click();
  await page.waitForFunction(() => [...document.querySelectorAll('#toasts .toast')].some(e => e.innerText.trim() === 'Right!'));
  await shot(page, 'n5-check-one-right');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N3: the folded card on a phone in Homeroom: choices on their own wrapping line, a usable answer box, the board in view', async t => {
  if (skip) return t.skip(skip);
  for (const hash of ['#practice/algebra-tiles/two-variable-terms', '#practice/xy-coordinate-board/same-x-same-y']) {
    const P = await inPlayer(boss, hash);
    await P.f.locator('#mp-prob .mp-prompt').waitFor(); await P.f.locator('.mp-board').waitFor(); await P.page.waitForTimeout(600);
    const name = hash.split('/')[1];
    if (SHOTS) await P.page.screenshot({ path: `${SHOTS}/n3-folded-${name}.png` });
    const m = await P.f.locator('#mp-prob').evaluate(el => {
      const r = q => { const e = el.querySelector(q); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, sw: e.scrollWidth, cw: e.clientWidth }; };
      return { box: r('.mp-probbox'), ch: r('.mp-probchoices'), card: r('.mp-probc'), last: r('.mp-probchoice:last-child') };
    });
    assert.ok(m.ch, `${hash}: choices`);
    // (Algebra Tiles always asks for a box too; XY's question may have only the choices.)
    if (hash.includes('algebra')) assert.ok(m.box, `${hash}: an answer box`);
    if (m.box) {
      assert.ok(m.box.w >= 120, `${hash}: the answer box is usable (${Math.round(m.box.w)} px)`);
      assert.ok(m.ch.y >= m.box.y + m.box.h - 1, `${hash}: the choices are on a line of their own, under the box`);
    }
    assert.ok(m.ch.w >= m.card.w - 40, `${hash}: the choices take the card's width (${Math.round(m.ch.w)} of ${Math.round(m.card.w)})`);
    assert.ok(m.ch.sw <= m.ch.cw + 1, `${hash}: the choices wrap, no sideways scroll (${m.ch.sw} > ${m.ch.cw})`);
    assert.ok(m.last.x + m.last.w <= m.card.x + m.card.w + 0.5, `${hash}: every choice inside the card`);
    const b0 = await P.f.locator('.mp-board').first().evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    assert.ok(b0.top >= 0 && b0.top < b0.vh * 0.6, `${hash}: the board's top shows on first open (${Math.round(b0.top)} of ${b0.vh})`);
    assert.ok(Math.min(b0.vh, b0.bottom) - b0.top >= 250, `${hash}: a good part of the board shows`);
    // A choice can be picked.
    await P.f.locator('.mp-probchoice').first().tap();
    await P.f.locator('.mp-probchoice.on').waitFor();
    assert.deepEqual(P.errors, []);
    await P.ctx.close();
  }
});

/** Tap a palette button n times (a new piece or object each), then -> the screen rects of the pieces/objects and the pill. */
async function addMany(f, sel, n, pill) {
  for (let i = 0; i < n; i++) { await f.locator(sel).first().tap(); await f.locator('body').evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))); }
  return f.locator('body').evaluate((b, pillSel) => {
    const z = document.querySelector(pillSel), zr = z && z.getBoundingClientRect();
    const items = [...document.querySelectorAll('.mp-piece, .mp-obj')].map(e => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, width: r.width, height: r.height }; });
    return { pill: zr && { x: zr.left, y: zr.top, width: zr.width, height: zr.height }, items };
  }, pill);
}

test('N6: new pieces never land under the zoom pill on a phone (practice in Homeroom, solo)', async t => {
  if (skip) return t.skip(skip);
  // Practice in Homeroom's player: the red counter from the palette.
  const P = await inPlayer(boss, '#practice/two-color-counters/subtracting-a-negative');
  await P.f.locator('#mp-prob .mp-prompt').waitFor(); await P.f.locator('.mp-board').waitFor(); await P.page.waitForTimeout(600);
  const red = '#mp-palette [data-pal].piece >> nth=1';
  const r1 = await addMany(P.f, red, 14, '#mp-zoom');
  await shot(P.page, 'n6-practice-pieces');
  assert.ok(r1.pill, 'the zoom pill shows');
  for (const it of r1.items) assert.equal(hit(it, r1.pill), false, `a piece under the pill: ${JSON.stringify(it)} / ${JSON.stringify(r1.pill)}`);
  assert.deepEqual(P.errors, []);
  await P.ctx.close();
  // The solo board on a phone: pieces and an object.
  const { ctx, page, errors } = await open(boss, '/manipulatives#two-color-counters', PHONE);
  await page.waitForSelector('#mp-board'); await page.waitForTimeout(500);
  const r2 = await addMany(page.locator('html'), '#mp-palette [data-pal].piece', 14, '#mp-zoom');
  await shot(page, 'n6-solo-pieces');
  for (const it of r2.items) assert.equal(hit(it, r2.pill), false, `a piece under the pill: ${JSON.stringify(it)} / ${JSON.stringify(r2.pill)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('N6: in the room, a new piece never lands under the zoom pill', async t => {
  if (skip) return t.skip(skip);
  const { s } = room('N6', 'two-color-counters');
  const { ctx, page, errors } = await open(boss, `/manipulatives#live/${s.id}`, { viewport: { width: 1024, height: 700 }, deviceScaleFactor: 1 });
  await page.waitForSelector('.rm-area[data-key="t"]'); await page.waitForTimeout(500);
  // Pan (the wheel) so the teacher's area starts just under the pill: its top left corner behind Fit.
  const where = () => page.evaluate(() => { const r = document.querySelector('.rm-area[data-key="t"] .rm-in').getBoundingClientRect(), z = document.querySelector('#rm-zoom .rm-zoom').getBoundingClientRect(); return { dx: r.left - (z.left - 20), dy: r.top - (z.top + 6) }; });
  await page.mouse.move(700, 450);
  for (let i = 0; i < 6; i++) { const w = await where(); if (Math.abs(w.dx) < 4 && Math.abs(w.dy) < 4) break; await page.mouse.wheel(w.dx, w.dy); await page.waitForTimeout(120); }
  const w = await where(); assert.ok(Math.abs(w.dx) < 30 && Math.abs(w.dy) < 30, `the area is under the pill (${JSON.stringify(w)})`);
  const items = [];
  for (let i = 0; i < 20; i++) { await page.locator('#rm-pal [data-pal].piece').first().click(); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => { const z = document.querySelector('#rm-zoom .rm-zoom').getBoundingClientRect(); return { pill: { x: z.left, y: z.top, width: z.width, height: z.height }, items: [...document.querySelectorAll('.rm-area[data-key="t"] .mp-piece')].map(e => { const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, width: b.width, height: b.height }; }) }; });
  items.push(...r.items);
  await shot(page, 'n6-room-pieces');
  assert.ok(items.length >= 20, `pieces added (${items.length})`);
  for (const it of items) assert.equal(hit(it, r.pill), false, `a piece under the pill: ${JSON.stringify(it)} / ${JSON.stringify(r.pill)}`);
  assert.deepEqual(errors, []);
  await ctx.close();
});
