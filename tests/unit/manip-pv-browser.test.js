// Place-value charts in a real browser (public/js/manip-pv.js; docs/decisions.md "Virtual math manipulatives:
// place-value charts fit and regroup"), on an iPhone 13 with real touch (CDP) and on a laptop with a mouse: ten rods
// dragged one by one into Hundreds wait ("Needs 10 to trade") and then become one flat (the chart's total the same, one
// Undo takes the trade back); the flat dragged into Tens becomes ten rods that fit inside the column; Break on a rod in
// Tens puts ten units inside Ones; and no block is ever drawn outside its column or on top of another. Then the live
// room: a student's trade is saved for everyone. MANIP_SHOTS=<dir> also saves pictures. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const { q } = await import('../../server/db.js');

// Playwright as installed on the machine (chromium.launch() as is); else the Chromium the other browser tests use.
let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() {
  try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); }
}
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'PvBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const PHONE = () => ({ ...pw.devices['iPhone 13'], deviceScaleFactor: 2 });
const LAPTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
async function open(who, hash, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  const cdp = ctxOpts.hasTouch ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errors, cdp };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Chart test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForFunction(() => document.querySelectorAll('#mp-content .mp-piece').length > 0);
  await toBoard(page);
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
}
/** The board at the top of the phone's screen (under the site's bar). */
async function toBoard(page) {
  await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.waitForTimeout(100);
}
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
/** A drag from one point to another: real touch on the phone, the mouse on the laptop. */
async function drag(page, cdp, [x0, y0], [x1, y1]) {
  if (cdp) {
    await touch(cdp, 'touchStart', [[x0, y0]]);
    for (let i = 1; i <= 12; i++) { await touch(cdp, 'touchMove', [[x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12]]); await page.waitForTimeout(16); }
    await touch(cdp, 'touchEnd', []);
  } else {
    await page.mouse.move(x0, y0); await page.mouse.down();
    for (let i = 1; i <= 12; i++) { await page.mouse.move(x0 + ((x1 - x0) * i) / 12, y0 + ((y1 - y0) * i) / 12); await page.waitForTimeout(10); }
    await page.mouse.up();
  }
  await page.waitForTimeout(220);
}
/** A piece's wheel: held on the phone, right-clicked on the laptop. */
async function wheel(page, cdp, [x, y]) {
  if (cdp) { await touch(cdp, 'touchStart', [[x, y]]); await page.waitForTimeout(650); await touch(cdp, 'touchEnd', []); }
  else await page.mouse.click(x, y, { button: 'right' });
  await page.waitForTimeout(200);
}
const centerOf = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return [b.x + b.width / 2, b.y + b.height / 2]; };

/** What the page draws: each column of the chart (in `scope`) with the labels of the blocks whose middle is in it, and
 *  every block drawn wholly inside its column and on top of no other block of that column (to half a pixel). */
async function columns(page, scope = '#mp-content') {
  const r = await page.evaluate(sc => {
    const cols = [...document.querySelectorAll(`${sc} .mp-obj .mp-pvchart > div`)].map(el => ({ name: el.querySelector('.mp-pvname').textContent, foot: el.querySelector('.mp-pvfoot')?.textContent || '', r: el.getBoundingClientRect(), labels: [], boxes: [] }));
    const bad = [];
    for (const el of document.querySelectorAll(`${sc} .mp-piece`)) {
      const b = el.getBoundingClientRect(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const c = cols.find(k => cx >= k.r.left && cx <= k.r.right && cy >= k.r.top && cy <= k.r.bottom); if (!c) continue;
      if (b.left < c.r.left - 0.5 || b.right > c.r.right + 0.5 || b.top < c.r.top - 0.5 || b.bottom > c.r.bottom + 0.5) bad.push(`${el.textContent} outside ${c.name}`);
      for (const o of c.boxes) if (b.left < o.right - 0.5 && o.left < b.right - 0.5 && b.top < o.bottom - 0.5 && o.top < b.bottom - 0.5) bad.push(`${el.textContent} on another in ${c.name}`);
      c.labels.push(el.textContent.trim()); c.boxes.push(b);
    }
    return { cols: cols.map(c => ({ name: c.name, foot: c.foot, labels: c.labels.sort() })), bad };
  }, scope);
  assert.deepEqual(r.bad, [], 'every block inside its column, none on another');
  return Object.fromEntries(r.cols.map(c => [c.name, c]));
}
const colCenter = async (page, i, scope = '#mp-content') => { const b = await page.locator(`${scope} .mp-obj .mp-pvchart > div`).nth(i).boundingBox(); return [b.x + b.width / 2, b.y + b.height * 0.45]; };
const chartTotal = page => page.textContent('#mp-content .mp-obj .mp-otot').catch(() => '');
const ROD = (id, x, y) => ({ id, kind: 'rod', x, y, w: 30, h: 150, rot: 0, filled: true, locked: false, label: '10', value: 10, color: '#4CAF50' });
const CHART = { id: 'pv', k: 'pv-chart', x: 1700, y: 1000, s: 1, st: { cols: ['Thousands', 'Hundreds', 'Tens', 'Ones'] } };

for (const [name, opts] of [['iPhone 13 (touch)', PHONE], ['laptop (mouse)', () => LAPTOP]]) {
  test(`${name}: ten rods trade for a flat in Hundreds, the flat breaks into ten rods in Tens, Break puts ten units in Ones`, async t => {
    if (skip) return t.skip(skip);
    const o = opts(), tag = o.hasTouch ? 'phone' : 'laptop';
    const { ctx, page, errors, cdp } = await open(boss, '#base-ten-blocks', o);
    await load(page, 'base-ten-blocks', { decimal: false, objects: [CHART], pieces: Array.from({ length: 10 }, (_, i) => ROD(`r${i}`, 1700 + i * 44, 1320)) });
    const piece = id => `#mp-content .mp-piece[data-pid="${id}"]`;
    for (let i = 0; i < 9; i++) await drag(page, cdp, await centerOf(page, piece(`r${i}`)), await colCenter(page, 1));
    let c = await columns(page);
    assert.deepEqual(c.Hundreds.labels, Array(9).fill('10'), 'nine rods wait in Hundreds');
    assert.equal(c.Hundreds.foot, 'Needs 10 to trade');
    assert.match(await chartTotal(page), /Total 90/);
    await shot(page, `pv-${tag}-1-nine-rods`);
    // The tenth: one flat, the same total.
    await drag(page, cdp, await centerOf(page, piece('r9')), await colCenter(page, 1));
    c = await columns(page);
    assert.deepEqual(c.Hundreds.labels, ['100'], 'ten rods became one flat'); assert.equal(c.Hundreds.foot, '');
    assert.match(await chartTotal(page), /Total 100/);
    assert.match(await page.textContent('#toasts'), /Traded 10 × 10 for 1 × 100/);
    await shot(page, `pv-${tag}-2-traded`);
    // One Undo: the tenth rod back where it was, the nine still waiting.
    await page.locator('[data-tool="undo"]').click(); await page.waitForTimeout(150); await toBoard(page);
    c = await columns(page);
    assert.deepEqual(c.Hundreds.labels, Array(9).fill('10'));
    assert.equal(await page.locator(piece('r9')).count(), 1);
    await drag(page, cdp, await centerOf(page, piece('r9')), await colCenter(page, 1));
    c = await columns(page); assert.deepEqual(c.Hundreds.labels, ['100']);
    // The flat into Tens: ten rods, all inside Tens.
    await drag(page, cdp, await centerOf(page, '#mp-content .mp-piece'), await colCenter(page, 2));
    c = await columns(page);
    assert.deepEqual(c.Hundreds.labels, []); assert.deepEqual(c.Tens.labels, Array(10).fill('10'), 'a flat in Tens: ten rods');
    assert.match(await chartTotal(page), /Total 100/);
    await shot(page, `pv-${tag}-3-flat-to-tens`);
    // Break on a rod in Tens: ten units inside Ones.
    const rod = await page.$eval('#mp-content .mp-piece', el => el.dataset.pid);
    await wheel(page, cdp, await centerOf(page, piece(rod)));
    await page.locator('.mp-wheel .mp-wbtn[data-wk="break"]').click(); await page.waitForTimeout(300);
    c = await columns(page);
    assert.deepEqual(c.Tens.labels, Array(9).fill('10')); assert.deepEqual(c.Ones.labels, Array(10).fill('1'), 'ten units landed inside Ones');
    assert.match(await chartTotal(page), /Total 100/);
    assert.equal(await page.locator('#mp-content .mp-piece').count(), 19, 'nothing left outside the chart');
    await shot(page, `pv-${tag}-4-break-to-ones`);
    // A block dragged out of the chart gets its own size back.
    const u = await page.$$eval('#mp-content .mp-piece', els => els.find(e => e.textContent.trim() === '10').dataset.pid);
    const ch = await page.locator('#mp-content .mp-obj').boundingBox();
    await drag(page, cdp, await centerOf(page, piece(u)), [ch.x + ch.width / 2, ch.y + ch.height + 60]);
    assert.match(await page.getAttribute(piece(u), 'style'), /width:30px;height:150px/);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('the live room: a student\'s trade in their square is saved for everyone, inside the column', async t => {
  if (skip) return t.skip(skip);
  const oak = S.createSchool(boss, { name: 'Pv Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: 'Pv 2A' }).class;
  const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Apple' }).user.id); S.addToClass(boss, A.id, kid.id);
  const s = M.createSession(boss, { classId: A.id, tool: 'base-ten-blocks', title: 'Trade' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  const chart = { ...CHART, x: 10, y: 10, s: 1 };
  const nine = Array.from({ length: 9 }, (_, i) => ROD(`h${i}`, 162 + 50 - 15, 60 + i * 2)), last = ROD('last', 40, 330);
  assert.ok(M.saveArea(boss, s.id, kid.id, { v: 2, objects: [chart], pieces: [...nine, last] }).ok);
  const saved = () => JSON.parse(q.get('SELECT state FROM manip_work WHERE session_id=? AND user_id=?', s.id, kid.id).state);
  const { ctx, page, errors, cdp } = await open(kid, `#live/${s.id}`, PHONE());
  const mine = '.rm-area.mine';
  await page.waitForSelector(`${mine} .mp-piece[data-pid="last"]`); await page.waitForTimeout(400);
  await drag(page, cdp, await centerOf(page, `${mine} .mp-piece[data-pid="last"]`), await colCenter(page, 1, mine));
  await page.waitForTimeout(1100);
  const st = saved(), flats = st.pieces.filter(p => p.kind === 'flat');
  assert.equal(flats.length, 1, 'one flat saved'); assert.equal(st.pieces.filter(p => p.kind === 'rod').length, 0);
  assert.equal(st.pieces.reduce((n, p) => n + p.value, 0), 100, 'the same total');
  const c = await columns(page, mine);
  assert.deepEqual(c.Hundreds.labels, ['100']);
  await shot(page, 'pv-room-traded');
  assert.deepEqual(errors, []);
  await ctx.close();
  M.end(boss, s.id);
});
