// The live room in a real browser (public/js/manip-room.js, public/css/manipulatives.css), at 1440 x 900 and on an
// iPhone 13, with a class of 16 who all checked their answers:
//   - the teacher's ⋯ menu stays inside the screen: the "Answers checked" list scrolls and End session (then Reopen room)
//     can always be clicked, and a reopened room is back on the step it was on;
//   - Fit shows every square (the room is not cut off by the "Teaching tools" bar, the tab bar or the palette);
//   - "Check my answers" with everything right says so;
//   - tapping a block in a student's square with a place-value chart never puts it on the chart's heading: under the
//     chart while there is room, else in the column for its value, and the next ones follow it there.
// MANIP_SHOTS=<dir> also saves pictures. Skipped with no Chromium.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.FIGURES = process.env.FIGURES || '1';   // the "Teaching tools" bar over the room, as teachers see it
const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');

let pw = null; try { pw = await import('playwright'); } catch { try { pw = await import('playwright-core'); } catch { /* not installed */ } }
const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
async function launch() {
  try { return await pw.chromium.launch(); } catch (e) { if (!exe) throw e; return pw.chromium.launch({ executablePath: exe, args: ['--no-sandbox'] }); }
}
let browser = null, skip = !pw ? 'needs Playwright' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'RoomFixBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const oak = S.createSchool(boss, { name: 'Room Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const NAMES = ['Ada', 'Ben', 'Cleo', 'Dev', 'Eli', 'Fay', 'Gus', 'Hana', 'Ivo', 'Jade', 'Kai', 'Lia', 'Max', 'Nia', 'Oz', 'Pia'];
const LONG = 'Maximiliana Montgomery-Featherstonehaugh';
function klass(name, n, long = false) {
  const c = S.createClass(boss, oak.id, { name }).class;
  const kids = NAMES.slice(0, n).map((k, i) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: long && i === n - 1 ? LONG : `${k} ${name}` }).user.id); S.addToClass(boss, c.id, u.id); return u; });
  return { c, kids };
}

let server, BASE;
test.before(async () => {
  if (skip) return;
  try { browser = await launch(); } catch { skip = 'needs Chromium'; return; }
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const DEVICES = () => [['1440', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 }], ['390', { ...pw.devices['iPhone 13'], deviceScaleFactor: 2 }]];
async function open(who, hash, opts) {
  const ctx = await browser.newContext(opts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${hash}`);
  return { ctx, page, errors };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
/** A real click: the mouse on the laptop, a tap on the phone. */
const press = async (page, sel) => { const l = page.locator(sel).first(); if ((page.viewportSize() || {}).width < 900) await l.tap(); else await l.click(); await page.waitForTimeout(250); };
const box = (page, sel) => page.locator(sel).first().boundingBox();
/** The element really under the middle of sel's box (nothing covers it, and it is on the screen). */
const reachable = (page, sel) => page.evaluate(s => {
  const el = document.querySelector(s); if (!el) return false;
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
  const hit = document.elementFromPoint(x, y); return !!hit && (hit === el || el.contains(hit));
}, sel);
/** The bottom of what the room shows: its own bottom (never below the screen or above the tab bar on a phone). */
const roomBottom = page => page.evaluate(() => {
  const rm = document.getElementById('rm').getBoundingClientRect(), tab = document.querySelector('.tabbar');
  const tabTop = tab && getComputedStyle(tab).display !== 'none' ? tab.getBoundingClientRect().top : innerHeight;
  return { rm: rm.bottom, screen: innerHeight, tabTop };
});

// A class of 16 working through a board of three steps with one answer box; checks on, everyone checked.
const STEPS = [{ id: 's1', text: 'Put 7 counters in the ten-frame.' }, { id: 's2', text: 'Fill the rest with the other color.' }, { id: 's3', text: 'How many more make 10?' }];
function checkedRoom({ check = true } = {}) {
  const { c, kids } = klass('2A', 16, true);
  const b = M.saveBoard(boss, { tool: 'two-color-counters', title: 'Make 10', state: { v: 2, pieces: [], __steps: STEPS, objects: [
    { id: 'oframe', k: 'ten-frame', x: 1560, y: 1040, s: 1, st: { n: 10 }, locked: true }, { id: 'oans', k: 'answer', x: 1896, y: 1090, s: 1, st: { ans: '', size: 'S', key: '3' } }] } }).board;
  const s = M.createSession(boss, { classId: c.id, boardId: b.id }).session;
  for (const k of kids) assert.ok(M.join(k, { code: s.code }).ok);
  assert.ok(M.push(boss, s.id, b.id).ok);
  const room = JSON.parse(M.getSession(s.id).room); room.checks = true;
  assert.ok(M.saveArea(boss, s.id, 't', room).ok);
  // Every third one (Ada, Dev, Gus, Jade, Max and the long name) got it wrong: they need help.
  if (check) kids.forEach((k, i) => assert.ok(M.checkAnswers(k, s.id, { oans: i % 3 ? '3' : '4' }).ok));
  assert.ok(M.step(boss, s.id, { to: 1 }).ok);
  return { s, kids };
}

test('the teacher\'s ⋯ menu with 16 answers checked: inside the screen, End session and then Reopen room in reach; a reopened room is back on its step', async t => {
  if (skip) return t.skip(skip);
  const { s } = checkedRoom();
  for (const [dev, opts] of DEVICES()) {
    const { ctx, page, errors } = await open(boss, `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area[data-key]'); await page.waitForTimeout(500);
    assert.ok(await reachable(page, '[data-rtool="menu"]'), `${dev}: the ⋯ button is on the screen`);
    await press(page, '[data-rtool="menu"]');
    // "Answers checked: 16 of 16", one line, closed: no names showing.
    assert.equal((await page.locator('.rm-checks > summary').textContent()).trim(), 'Answers checked: 16 of 16');
    assert.equal(await page.locator('details.rm-checks').evaluate(d => d.open), false, `${dev}: closed by default`);
    assert.equal(await page.locator('.rm-checks li').first().isVisible(), false);
    const menu = await box(page, '.rm-menu'), b = await roomBottom(page);
    assert.ok(menu.y + menu.height <= b.rm + 0.5 && b.rm <= b.tabTop + 0.5, `${dev}: the menu ends inside the room (${menu.y + menu.height} <= ${b.rm})`);
    assert.ok(await reachable(page, '.rm-menu [data-rtool="end"]'), `${dev}: End session can be clicked`);
    await shot(page, `room-menu-${dev}`);
    // Opened (a tap on the line): the six who need help first, then the ten all right, each a name and a score.
    await press(page, '.rm-checks > summary');
    const end0 = await box(page, '.rm-menu [data-rtool="end"]');
    assert.equal(await page.locator('details.rm-checks').evaluate(d => d.open), true);
    const rows = await page.locator('.rm-checks li').evaluateAll(els => els.map(li => ({ cls: li.className, name: li.querySelector('.rm-cname').textContent, score: li.querySelector('.rm-cscore').textContent.trim(), mark: li.querySelector('.rm-cscore img')?.getAttribute('alt') })));
    assert.equal(rows.length, 16);
    assert.deepEqual(rows.map(r => r.cls), [...Array(6).fill('help'), ...Array(10).fill('ok')]);
    assert.deepEqual(rows.slice(0, 6).map(r => r.name), ['Ada 2A', 'Dev 2A', 'Gus 2A', 'Jade 2A', 'Max 2A', LONG]);
    assert.ok(rows.slice(0, 6).every(r => r.score === '0/1' && r.mark === 'Needs help'));
    assert.ok(rows.slice(6).every(r => r.score === '1/1' && r.mark === 'All right'));
    // Nothing overlaps: the rows sit under the switches, each name left of its score, inside the menu; a long name is
    // cut short with an ellipsis.
    const geo = await page.evaluate(() => {
      const R = el => el.getBoundingClientRect(), m = R(document.querySelector('.rm-menu-body'));
      const sw = [...document.querySelectorAll('.rm-menu .rm-switch, .rm-menu .rm-codeline, .rm-checks > summary')].map(R);
      const cells = [...document.querySelectorAll('.rm-checks li')].map(li => ({ n: R(li.querySelector('.rm-cname')), s: R(li.querySelector('.rm-cscore')), cut: li.querySelector('.rm-cname').scrollWidth > li.querySelector('.rm-cname').clientWidth }));
      return { m, sw, cells };
    });
    const hit = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
    for (const [i, c] of geo.cells.entries()) {
      assert.ok(c.n.right <= c.s.left + 0.5, `${dev}: row ${i} name left of its score`);
      assert.ok(c.n.left >= geo.m.left - 0.5 && c.s.right <= geo.m.right + 0.5, `${dev}: row ${i} inside the menu`);
      for (const w of geo.sw) assert.ok(!hit(c.n, w) && !hit(c.s, w), `${dev}: row ${i} overlaps a switch`);
      if (i) assert.ok(c.n.top >= geo.cells[i - 1].n.bottom - 0.5, `${dev}: row ${i} under the one before`);
    }
    assert.equal(geo.cells[5].cut, true, `${dev}: the long name is cut short`);
    assert.ok(geo.cells.slice(0, 5).every(c => !c.cut));
    // The list scrolls inside the menu; End session stays where it is, in reach.
    await page.locator('.rm-menu-body').evaluate(el => { el.scrollTop = el.scrollHeight; });
    assert.deepEqual(await box(page, '.rm-menu [data-rtool="end"]'), end0, `${dev}: pinned`);
    assert.ok(await reachable(page, '.rm-checks li:last-child .rm-cscore'), `${dev}: the last student can be scrolled to`);
    assert.ok(await reachable(page, '.rm-menu [data-rtool="end"]'), `${dev}: End session still in reach`);
    await shot(page, `room-menu-open-${dev}`);
    if (dev === '390') {
      // End the session from the menu, then Reopen room, both in reach; the room comes back on Step 2 of 3.
      // End session asks first, in the site's own dialog.
      await press(page, '.rm-menu [data-rtool="end"]'); await press(page, 'dialog.ob-dialog [data-ob="ok"]'); await page.waitForSelector('.rm-menu [data-rtool="reopen"]');
      // Ended: the check results are gone (memory only), so no "Answers checked" line at all (never "0 of 16").
      assert.equal(await page.locator('.rm-menu .rm-checks').count(), 0, 'no Answers checked line in an ended room');
      assert.ok(await reachable(page, '.rm-menu [data-rtool="reopen"]'), 'Reopen room can be clicked');
      await shot(page, `room-menu-ended-${dev}`);
      await press(page, '.rm-menu [data-rtool="reopen"]'); await page.waitForSelector('.rm-stepnow');
      assert.equal(await page.locator('.rm-stepnow').textContent(), 'Step 2 of 3');
      // Reopened with checks still on: the line is back as before (nobody has checked since: 0 of 16, nothing to open).
      if (!(await page.locator('.rm-menu').count())) await press(page, '[data-rtool="menu"]');
      await page.waitForSelector('.rm-menu .rm-checks-none');
      assert.equal((await page.locator('.rm-menu .rm-checks-none').textContent()).trim(), 'Answers checked: 0 of 16');
      await page.waitForFunction(() => !document.querySelector('.toast'), null, { timeout: 6000 });   // "The room is open again" goes
      assert.ok(await reachable(page, '.rm-menu [data-rtool="end"]'), 'End session in reach again');
    }
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  // A new page on the reopened room: still step 2, for the teacher and in a student's strip.
  const { ctx, page } = await open(boss, `#live/${s.id}`, DEVICES()[0][1]);
  await page.waitForSelector('.rm-stepnow');
  assert.equal(await page.locator('.rm-stepnow').textContent(), 'Step 2 of 3');
  await ctx.close();
  M.end(boss, s.id);
});

test('nobody has checked yet: "Answers checked: 0 of 16", one calm line with nothing to open', async t => {
  if (skip) return t.skip(skip);
  const { s } = checkedRoom({ check: false });
  for (const [dev, opts] of DEVICES()) {
    const { ctx, page, errors } = await open(boss, `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area[data-key]'); await page.waitForTimeout(400);
    await press(page, '[data-rtool="menu"]');
    assert.equal((await page.locator('.rm-checks-none').textContent()).trim(), 'Answers checked: 0 of 16');
    assert.equal(await page.locator('details.rm-checks').count(), 0);
    assert.ok(await reachable(page, '.rm-menu [data-rtool="end"]'));
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  M.end(boss, s.id);
});

test('Fit shows every square of a class of 16, between the bars, at 1440 x 900 and on an iPhone 13 (with the Teaching tools bar)', async t => {
  if (skip) return t.skip(skip);
  const { s } = checkedRoom();
  for (const [dev, opts] of DEVICES()) {
    const { ctx, page, errors } = await open(boss, `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area[data-key]'); await page.waitForTimeout(500);
    assert.equal(await page.locator('.fg-tools').count(), 1, 'the Teaching tools bar is there');
    // The teacher's room opens fitted; at 1440 Fit again (a phone has no Fit button: the room opens that way).
    if (dev === '1440') { await press(page, '[data-rtool="fit"]'); await page.waitForTimeout(200); }
    const b = await roomBottom(page);
    assert.ok(b.rm <= b.screen + 0.5 && b.rm <= b.tabTop + 0.5, `${dev}: the room ends on the screen (${b.rm} <= ${b.screen}, tab bar ${b.tabTop})`);
    assert.equal(await page.evaluate(() => document.scrollingElement.scrollTop), 0, `${dev}: the page itself never scrolled`);
    const bar = await box(page, '#rm-bar'), pal = await box(page, '#rm-pal');
    const floor = dev === '390' ? pal.y : b.rm;
    const areas = await page.locator('.rm-area[data-key]').evaluateAll(els => els.map(e => { const r = e.getBoundingClientRect(); return { k: e.dataset.key, top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
    assert.equal(areas.length, 17);
    for (const a of areas) {
      assert.ok(a.bottom <= floor + 0.5, `${dev}: ${a.k} not cut off at the bottom (${a.bottom} <= ${floor})`);
      assert.ok(a.top >= bar.y + bar.height - 0.5, `${dev}: ${a.k} under the bar`);
      assert.ok(a.left >= -0.5 && a.right <= opts.viewport.width + 0.5, `${dev}: ${a.k} across`);
    }
    await shot(page, `room-fit-${dev}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  M.end(boss, s.id);
});

test('"Check my answers" with everything right: "All 1 right!", never "Try again on the others"', async t => {
  if (skip) return t.skip(skip);
  const { s, kids } = checkedRoom();
  for (const [i, [dev, opts]] of DEVICES().entries()) {
    const kid = kids[i + 1];
    const { ctx, page, errors } = await open(kid, `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area.mine'); await page.waitForTimeout(400);
    await press(page, '[data-rtool="loadpush"]'); await page.waitForTimeout(900);
    const st = JSON.parse(M.studentView(kid, s.id).mine), ans = st.objects.find(o => o.k === 'answer');
    ans.st.ans = '3'; assert.ok(M.saveArea(kid, s.id, kid.id, st).ok);
    await page.waitForFunction(() => document.querySelector('.rm-area.mine .mp-answer')?.value === '3', null, { timeout: 8000 });
    await press(page, '[data-rtool="check"]');
    await page.waitForSelector('.toast');
    assert.equal(await page.locator('.toast').last().textContent(), 'All 1 right!');
    await shot(page, `room-toast-${dev}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  M.end(boss, s.id);
});

test('tap to add in a student\'s square with a place-value chart: never on the chart\'s heading; a first unit beside or under it; a rod (no room outside the chart) into Tens and the next ones follow', async t => {
  if (skip) return t.skip(skip);
  const { c, kids } = klass('2B', 2);
  const b = M.saveBoard(boss, { tool: 'base-ten-blocks', title: 'Chart', state: { v: 2, pieces: [], objects: [{ id: 'ch', k: 'pv-chart', x: 1500, y: 900, s: 1, st: { cols: ['Hundreds', 'Tens', 'Ones'] } }] } }).board;
  const s = M.createSession(boss, { classId: c.id, tool: 'base-ten-blocks', title: 'Chart' }).session;
  for (const k of kids) assert.ok(M.join(k, { code: s.code }).ok);
  assert.ok(M.push(boss, s.id, b.id).ok);
  for (const [i, [dev, opts]] of DEVICES().entries()) {
    const { ctx, page, errors } = await open(kids[i], `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area.mine'); await page.waitForTimeout(400);
    await press(page, '[data-rtool="loadpush"]');
    await page.waitForSelector('.rm-area.mine .mp-pvchart'); await page.waitForTimeout(300);
    const tap = async label => { const l = page.locator('#rm-pal [data-pal]', { hasText: label }).first(); await l.scrollIntoViewIfNeeded(); if (dev === '390') await l.tap(); else await l.click(); await page.waitForTimeout(350); };
    const where = () => page.evaluate(() => {
      const mine = document.querySelector('.rm-area.mine'), ch = mine.querySelector('.mp-obj'), head = ch.querySelector('.mp-ohead').getBoundingClientRect();
      const cols = [...ch.querySelectorAll('.mp-pvchart > div')].map(d => ({ name: d.querySelector('.mp-pvname')?.textContent.trim(), r: d.getBoundingClientRect() }));
      return [...mine.querySelectorAll('.mp-piece')].map(p => {
        const r = p.getBoundingClientRect(), mx = r.left + r.width / 2, my = r.top + r.height / 2;
        const col = cols.find(k => mx >= k.r.left && mx <= k.r.right && my >= k.r.top && my <= k.r.bottom);
        return { label: p.textContent.trim(), col: col ? col.name : null, onHead: r.left < head.right && r.right > head.left && r.top < head.bottom && r.bottom > head.top };
      });
    });
    // The first tap, nothing placed before: a unit. It went to the square's first free spot, the chart's heading.
    await tap('Unit');
    let ps = await where();
    assert.equal(ps.length, 1); assert.equal(ps[0].onHead, false, `${dev}: the first unit is not on the heading`);
    assert.ok([null, 'Ones'].includes(ps[0].col), `${dev}: beside or under the chart, or in Ones: ${JSON.stringify(ps[0])}`);
    await shot(page, `room-tap1-${dev}`);
    // Then rods: no room for one outside the chart, so into Tens (never Hundreds, where it would wait to trade); the
    // next ones follow it there.
    for (let n = 1; n <= 3; n++) {
      await tap('Rod');
      ps = await where();
      assert.deepEqual(ps.filter(p => p.label === '10').map(p => [p.col, p.onHead]), Array(n).fill(['Tens', false]), `${dev}: rod ${n} in Tens`);
    }
    assert.ok(ps.every(p => !p.onHead), `${dev}: nothing on the heading`);
    await shot(page, `room-tap4-${dev}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  M.end(boss, s.id);
});
