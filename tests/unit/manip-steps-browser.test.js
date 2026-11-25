// The steps on the board, and charts locked by default, in a real browser (docs/decisions.md "Virtual math
// manipulatives: steps on the board, charts locked in place"). On an iPhone 13 and a laptop: the steps card pinned
// above the board (never over a piece), "Step 1 of 4" with ◀ ▶, All steps, the teacher folding it; a student opening
// the same share code; no card without steps; right to left; a live square's strip; and a new place-value chart that
// starts locked (dragging its body pans, its wheel holds only Unlock). MANIP_SHOTS=<dir> also saves pictures.
// Skipped when no Chromium is installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { createApp } = await import('../../server/app.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');

const LOCAL = ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'];
const exe = [process.env.BRB_CHROMIUM, ...LOCAL].find(p => p && fs.existsSync(p));
let chromium = null, devices = {}; try { ({ chromium, devices } = await import('playwright-core')); } catch { /* not installed */ }
const skip = !chromium || (!exe && !process.env.PLAYWRIGHT_BROWSERS_PATH) ? 'needs Chromium' : false;
const SHOTS = process.env.MANIP_SHOTS || '';

const boss = createUser({ username: 'StepsBoss', password: 'secret123', role: 'admin' });
const cookieOf = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const oak = S.createSchool(boss, { name: 'Steps Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: 'Steps 4A' }).class;
const colleague = createUser({ username: 'StepsPal', password: 'secret123', role: 'admin' });
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ada Apple' }).user.id); S.addToClass(boss, A.id, kid.id);

let server, BASE, browser;
test.before(async () => {
  if (skip) return;
  server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ ...(exe ? { executablePath: exe } : {}), args: ['--no-sandbox'] });
  if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
});
test.after(async () => { if (browser) await browser.close(); if (server) { server.closeAllConnections(); server.close(); } });

const PHONE = () => ({ ...devices['iPhone 13'], deviceScaleFactor: 2 });
const LAPTOP = { viewport: { width: 1280, height: 800 }, deviceScaleFactor: SHOTS ? 2 : 1 };
async function open(who, hash, ctxOpts = PHONE(), query = '') {
  const ctx = await browser.newContext(ctxOpts);
  const [name, value] = cookieOf(who.id).split('='); await ctx.addCookies([{ name, value, url: BASE }]);
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${BASE}/manipulatives${query}${hash}`);
  const cdp = ctxOpts.hasTouch ? await ctx.newCDPSession(page) : null;
  return { ctx, page, errors, cdp };
}
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const STEPS = ['Build 46 with rods and units.', 'Put each block in its column of the chart.', 'Add 7 more units. How many units now?', 'Trade ten units for a rod and write the new number.'];
const deck = () => STEPS.map((text, i) => ({ id: `s${i}`, text }));
/** A board saved with these steps, opened through its share code, the board at the top of the screen. */
async function load(page, tool, state) {
  const code = M.saveBoard(boss, { tool, title: 'Steps test', state: { v: 2, ...state } }).board.code;
  await page.waitForSelector('#mp-redeem-in');
  await page.fill('#mp-redeem-in', code); await page.press('#mp-redeem-in', 'Enter');
  await page.waitForSelector('#mp-board'); await page.waitForTimeout(300);
  await page.evaluate(() => { const b = document.getElementById('mp-stepcard')?.firstElementChild || document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
  await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
}
const cardText = page => page.$eval('.mp-stepcard', e => e.innerText.replace(/\s+/g, ' ').trim());
const box = async (page, sel) => { const b = await page.locator(sel).first().boundingBox(); assert.ok(b, `no ${sel}`); return b; };
const targets = page => page.$$eval('.mp-stepcard button', els => els.filter(e => e.offsetParent).map(e => { const r = e.getBoundingClientRect(); return [e.dataset.sc, Math.round(r.width), Math.round(r.height)]; }));
const blocks = () => ({ pieces: [], objects: [{ id: 'C', k: 'pv-chart', x: 1600, y: 1000, s: 1, st: { cols: ['Hundreds', 'Tens', 'Ones'] }, locked: true }] });

for (const [label, opts] of [['iPhone 13', PHONE], ['laptop', () => LAPTOP]]) {
  test(`the teacher's board (${label}): the steps card above the board, ◀ ▶, All steps, fold and show`, { skip }, async () => {
    const { ctx, page, errors } = await open(boss, '#base-ten-blocks', opts());
    await load(page, 'base-ten-blocks', { ...blocks(), __steps: deck() });
    const card = await box(page, '.mp-stepcard'), board = await box(page, '#mp-board');
    assert.ok(card.y + card.height <= board.y + 1, 'the card ends where the board starts: nothing on the board is under it');
    assert.ok(Math.abs(card.width - board.width) < 2, 'as wide as the board');
    assert.match(await cardText(page), /Step 1 of 4/); assert.match(await cardText(page), /Build 46 with rods and units\./);
    for (const [k, w, h] of await targets(page)) assert.ok(w >= 44 && h >= 44, `${k}: ${w}x${h}`);
    assert.ok(await page.locator('[data-sc="prev"]').isDisabled(), 'no step before the first');
    if (label === 'iPhone 13') { const doc = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(doc <= 390, `no sideways scroll (${doc})`); }
    await page.click('[data-sc="next"]');
    assert.match(await cardText(page), /Step 2 of 4/); assert.match(await cardText(page), /Put each block in its column/);
    assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.dataset.sc), 'next', 'the keyboard stays on Next');
    await shot(page, `${label === 'laptop' ? 'laptop' : 'phone'}-01-teacher-steps`);
    await page.click('[data-sc="all"]');
    assert.deepEqual(await page.$$eval('.mp-sc-list li', els => els.map(e => e.textContent)), STEPS);
    assert.equal(await page.$eval('.mp-sc-list li[aria-current="step"]', e => e.textContent), STEPS[1]);
    await shot(page, `${label === 'laptop' ? 'laptop' : 'phone'}-02-teacher-all-steps`);
    await page.click('[data-sc="all"]'); await page.click('[data-sc="next"]'); await page.click('[data-sc="next"]');
    assert.match(await cardText(page), /Step 4 of 4/); assert.ok(await page.locator('[data-sc="next"]').isDisabled());
    // The teacher folds it to one slim line, and shows it again at the same step.
    await page.click('[data-sc="fold"]');
    assert.equal(await page.locator('.mp-stepcard.folded').count(), 1); assert.equal(await page.locator('.mp-sc-text').count(), 0);
    assert.ok((await box(page, '.mp-stepcard')).height <= 64, 'folded: one slim line');
    await page.click('[data-sc="unfold"]'); assert.match(await cardText(page), /Step 4 of 4/);
    // The teacher's steps editor and the card agree: a new step shows at once.
    await page.click('[data-tool="steps"]'); await page.click('[data-sadd]'); await page.fill('#st-4', 'Check with a partner.');
    await page.click('[data-sc="next"]'); assert.match(await cardText(page), /Step 5 of 5: ?|Step 5 of 5/); assert.match(await cardText(page), /Check with a partner\./);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('another teacher opens the share code: the same card; no steps: no card; one step: just what to do', { skip }, async () => {
  const { ctx, page, errors } = await open(colleague, '#base-ten-blocks');
  await load(page, 'base-ten-blocks', { ...blocks(), __steps: deck() });
  assert.match(await cardText(page), /Step 1 of 4/);
  await page.click('[data-sc="next"]'); assert.match(await cardText(page), /Step 2 of 4/);
  await shot(page, 'phone-03-share-code');
  await page.click('[data-sc="all"]'); assert.equal(await page.locator('.mp-sc-list li').count(), 4);
  // A board without steps: nothing at all above the board.
  await load(page, 'base-ten-blocks', blocks());
  assert.equal(await page.locator('.mp-stepcard').count(), 0);
  assert.equal(await page.$eval('#mp-stepcard', e => getComputedStyle(e).display), 'none');
  // One step: no arrows and no list, just what to do.
  await load(page, 'clock', { objects: [], __steps: [{ id: 'a', text: 'Set the clock to 7:30.' }] });
  assert.match(await cardText(page), /Instructions/); assert.equal(await page.locator('[data-sc="next"], [data-sc="all"]').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('right to left (Hebrew): the card reads from the right, Back points right and comes first', { skip }, async () => {
  const { ctx, page, errors } = await open(colleague, '#base-ten-blocks', PHONE(), '?lang=he');
  await load(page, 'base-ten-blocks', { ...blocks(), __steps: deck() });
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
  assert.match(await cardText(page), /שלב 1 מתוך 4/);
  const prev = await box(page, '[data-sc="prev"]'), next = await box(page, '[data-sc="next"]');
  assert.ok(prev.x > next.x, 'Back is on the right'); assert.equal(await page.textContent('[data-sc="prev"]'), '▶');
  const card = await box(page, '.mp-stepcard'), no = await box(page, '.mp-sc-no');
  assert.ok(no.x + no.width > card.x + card.width - 40, 'the heading starts at the right');
  await shot(page, 'phone-04-rtl');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('a live square: the strip still shows only the current step (a future one never reaches the student)', { skip }, async () => {
  const s = M.createSession(boss, { classId: A.id, tool: 'base-ten-blocks', title: 'Steps live' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  assert.ok(M.saveArea(boss, s.id, 't', { v: 2, objects: [], pieces: [], __steps: deck() }).ok);
  for (const [label, opts] of [['phone', PHONE()], ['laptop', LAPTOP]]) {
    const { ctx, page, errors } = await open(kid, `#live/${s.id}`, opts);
    await page.waitForSelector('.rm-area.mine .rm-strip'); await page.waitForTimeout(500);
    const strip = await page.$eval('.rm-area.mine .rm-strip', e => e.innerText);
    assert.match(strip, /Step 1 of 4/); assert.match(strip, /Build 46/);
    assert.doesNotMatch(await page.content(), /Trade ten units/, 'the last step is not on the student\'s page');
    await shot(page, `${label}-05-live-square`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
  M.end(boss, s.id);
});

test('a board pushed by share code into a live room: its steps become the deck; the student sees step 1 only', { skip }, async () => {
  const saved = M.saveBoard(boss, { tool: 'base-ten-blocks', title: 'Pushed steps', state: { v: 2, ...blocks(), __steps: deck() } }).board;
  const s = M.createSession(boss, { classId: A.id, tool: 'base-ten-blocks', title: 'Pushed live' }).session;
  assert.ok(M.join(kid, { code: s.code }).ok);
  assert.ok(M.push(boss, s.id, saved.id).ok);
  const { ctx, page, errors } = await open(kid, `#live/${s.id}`);
  await page.waitForSelector('[data-rtool="loadpush"]'); await page.click('[data-rtool="loadpush"]'); await page.waitForTimeout(600);
  await page.waitForSelector('.rm-area.mine .mp-obj.k-pv-chart');
  const strip = await page.$eval('.rm-area.mine .rm-strip', e => e.innerText);
  assert.match(strip, /Step 1 of 4/); assert.match(strip, /Build 46/);
  assert.doesNotMatch(await page.content(), /Trade ten units|Add 7 more/, 'later steps never reach the student');
  assert.equal(await page.locator('.rm-area.mine .mp-obj.k-pv-chart.locked').count(), 1, 'the pushed chart keeps its lock');
  await shot(page, 'phone-07-pushed-board-square');
  assert.deepEqual(errors, []);
  await ctx.close();
  M.end(boss, s.id);
});

for (const [label, opts] of [['iPhone 13', PHONE], ['laptop', () => LAPTOP]]) {
  test(`a new place-value chart starts locked (${label}): dragging it pans the board (a mouse: with Space held), its wheel holds only Unlock`, { skip }, async () => {
    const { ctx, page, errors, cdp } = await open(boss, '#base-ten-blocks', opts());
    await page.waitForSelector('#mp-board'); await page.waitForTimeout(200);
    const c = '#mp-content .mp-obj.k-pv-chart';
    assert.equal(await page.locator(`${c}.locked`).count(), 1, 'the new board\'s chart is locked');
    // Another from the palette: locked too.
    await page.locator('[data-pal]', { hasText: 'Add a place-value chart' }).first().click(); await page.waitForTimeout(200);
    assert.equal(await page.locator(`${c}.locked`).count(), 2);
    await page.evaluate(() => { const b = document.getElementById('mp-board'); window.scrollTo({ top: scrollY + b.getBoundingClientRect().top - 70, behavior: 'instant' }); });
    await page.$eval('[data-view="fit"]', b => b.click()); await page.waitForTimeout(150);
    const el = page.locator(c).first(), b0 = await el.boundingBox(), id = await el.getAttribute('data-oid');
    const at0 = await page.$eval(`${c}[data-oid="${id}"]`, e => [e.style.left, e.style.top]);
    // Drag the chart's body (a column): the board pans, the chart stays where it is on the board. A mouse's plain drag
    // there draws a selection box instead (docs/decisions.md "Manipulatives: a selection box"): the chart neither moves
    // nor is selected, and with Space held the same drag pans.
    const [x0, y0] = [b0.x + b0.width / 2, b0.y + b0.height * 0.7];
    if (cdp) {
      const t = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y]) => ({ x, y })) });
      await t('touchStart', [[x0, y0]]); for (let i = 1; i <= 10; i++) { await t('touchMove', [[x0 + i * 6, y0 + i * 4]]); await page.waitForTimeout(16); } await t('touchEnd', []);
    } else {
      const mdrag = async () => { await page.mouse.move(x0, y0); await page.mouse.down(); await page.mouse.move(x0 + 60, y0 + 40, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(150); };
      await mdrag();
      assert.deepEqual(await page.$eval(`${c}[data-oid="${id}"]`, e => [e.style.left, e.style.top]), at0, 'a plain drag did not move the chart');
      const bb = await el.boundingBox(); assert.ok(Math.abs(bb.x - b0.x) < 1 && Math.abs(bb.y - b0.y) < 1, 'a plain drag did not pan');
      assert.equal(await page.locator(`${c}.on`).count(), 0, 'the locked chart is never selected');
      await page.evaluate(() => document.activeElement?.blur()); await page.mouse.move(x0, y0); await page.keyboard.down('Space'); await mdrag(); await page.keyboard.up('Space');
    }
    await page.waitForTimeout(150);
    assert.deepEqual(await page.$eval(`${c}[data-oid="${id}"]`, e => [e.style.left, e.style.top]), at0, 'the chart did not move on the board');
    const b1 = await el.boundingBox(); assert.ok(Math.abs(b1.x - b0.x - 60) < 6 && Math.abs(b1.y - b0.y - 40) < 6, `the view panned (${b1.x - b0.x}, ${b1.y - b0.y})`);
    // Hold its handle: the wheel has only Unlock; Unlock frees it.
    const h = await (page.locator(`${c}[data-oid="${id}"] .mp-ohead`)).boundingBox();
    const hx = h.x + h.width / 2, hy = h.y + h.height / 2;
    if (cdp) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: hx, y: hy }] }); await page.waitForTimeout(650); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
    else await page.mouse.click(hx, hy, { button: 'right' });
    await page.waitForSelector('.mp-wheel .mp-wbtn');
    assert.deepEqual(await page.$$eval('.mp-wheel .mp-wbtn', els => els.map(e => e.dataset.wk)), ['unlock']);
    await shot(page, `${label === 'laptop' ? 'laptop' : 'phone'}-06-locked-chart-wheel`);
    await page.locator('.mp-wheel .mp-wbtn[data-wk="unlock"]').click(); await page.waitForTimeout(150);
    assert.equal(await page.locator(`${c}[data-oid="${id}"].locked`).count(), 0, 'unlocked from the wheel');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}
