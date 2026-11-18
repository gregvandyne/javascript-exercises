// Algebra by drag and drop (docs/decisions.md "Classroom dashboards: the balance scale and algebra tiles by drag and
// drop"): the balance scale's moves (one side tips it, Both sides keeps it level, taking away from a side without that
// tile puts in its opposite), its tilt, ÷, zero pairs and Check; algebra tiles' rows, zero pairs and the challenge; old
// saved states loading unchanged; and in Chromium (skipped where none is installed) tiles dragged with a mouse and with
// touch, tapped, and the keyboard.
import fs from 'node:fs';
import os from 'node:os';
import test from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = fs.mkdtempSync(`${os.tmpdir()}/brb-dashalg-`);

const G = await import('../../public/js/dash-math4.js');
const A = await import('../../public/js/dash-ask.js');
const DT = await import('../../server/services/dash-tools.js');

test('balance: old saved states load and save exactly as they were; new fields only when set', () => {
  const old = { x: 4, lx: 5, lu: 3, rx: 2, ru: 15, show: false, where: 'left', hist: [{ lx: 6, lu: 3, rx: 3, ru: 15, op: 'subx', n: 0, w: 'right' }] };
  assert.deepEqual(DT.cleanToolState('balance', old), old);
  assert.deepEqual(DT.cleanToolState('algebra', { tab: 'balance', balance: old }).balance, old);
  // Negative tiles, the checked x and the new steps are kept; nonsense is clamped or dropped.
  const s = DT.cleanToolState('balance', { ...old, lnx: 2, rnu: 99, tx: -500, hist: [{ op: 'mvnx', w: 'both', rnx: 1 }, { op: 'rm -rf' }] });
  assert.equal(s.lnx, 2); assert.equal(s.rnu, 30); assert.equal(s.tx, -99); assert.equal(s.lnu, undefined);
  assert.deepEqual([s.hist[0].op, s.hist[0].rnx, s.hist[0].lnx, s.hist[1].op], ['mvnx', 1, undefined, 'new']);
  // Algebra tiles: a challenge is kept only when it is one; an old state is unchanged.
  const t = { tiles: [{ k: 'x', neg: true }] };
  assert.deepEqual(DT.cleanToolState('algebra', t), t);
  assert.deepEqual(DT.cleanToolState('algebra', { ...t, goal: [1, -2, 3], gk: true }), { ...t, goal: [1, -2, 3], gk: true });
  assert.deepEqual(DT.cleanToolState('algebra', { ...t, goal: [1, 2], gk: true }), t);
  // A make-a-question still works, with negative tiles counted.
  const words = { q: { balance: 'What is x?' } };
  assert.ok(A.questionFor('balance', { x: 5, lx: 3, lu: 5, rx: 2, ru: 10 }, {}, words));
  assert.equal(A.questionFor('balance', { x: 5, lx: 3, lu: 5, rx: 2, ru: 10, lnu: 1 }, {}, words), null, 'not level');
  assert.equal(A.questionFor('balance', { x: 5, lx: 3, lu: 5, rx: 2, ru: 10, rnx: 0, lnx: 1 }, {}, words), null, 'the same x on both sides');
});

test('balance: one side tips it as far as the weights differ; the same on the other side levels it again', () => {
  const L = { x: 3, u: 5 }, R = { x: 2, u: 10 };
  assert.equal(G.tip(L, R, 5), 0); assert.equal(G.tiltDeg(L, R, 5), 0);
  const one = G.panMove(L, R, { k: 'x', neg: false, add: false, where: 'left' });
  assert.deepEqual(one.L, { x: 2, u: 5, nx: 0, nu: 0 });
  assert.equal(G.tip(one.L, one.R, 5), 1, 'the right side is down');
  assert.equal(G.tiltDeg(one.L, one.R, 5), 8, '3 + the difference of 5');
  assert.equal(G.tiltDeg({ x: 0, u: 1 }, { x: 0, u: 0 }, 5), -4, 'a difference of 1 still shows');
  assert.equal(G.tiltDeg({ x: 0, u: 30 }, { x: 0, u: 0 }, 5), -12, 'never more than 12');
  const two = G.panMove(one.L, one.R, { k: 'x', neg: false, add: false, where: 'right' });
  assert.equal(G.tip(two.L, two.R, 5), 0);
  // Negative tiles weigh the opposite of their twins.
  assert.equal(G.weigh({ x: 3, u: 5, nx: 1, nu: 2 }, 4), 11);
  assert.equal(G.sideText({ x: 3, u: 5, nx: 1, nu: 2 }), '3x − x + 5 − 2'); assert.equal(G.sideText({ x: 0, u: 4, nx: 1, nu: 0 }), '−x + 4');
  assert.equal(G.sideText({ x: 3, u: 2 }), '3x + 2', 'unchanged without negatives');
  // No room, or nothing to take: null.
  assert.equal(G.panMove({ x: 9, u: 0 }, R, { k: 'x', neg: false, add: true, where: 'left' }), null);
  assert.equal(G.panMove({ x: 0, u: 0 }, R, { k: '1', neg: true, add: false, where: 'left' }), null);
  // Moving between sides and putting in a tile of each kind and sign, in one side or the other.
  for (const k of ['x', '1']) for (const neg of [false, true]) for (const where of ['left', 'right']) {
    const r = G.panMove(L, R, { k, neg, add: true, where }); assert.ok(r);
    assert.notEqual(G.tip(r.L, r.R, 5), 0, `${k} ${neg} ${where} tips it`);
  }
});

test('balance: Both sides keeps it level, for any x; taking away a tile a side lacks puts in its opposite', () => {
  const rnd = G.seeded(11);
  for (let i = 0; i < 300; i++) {
    const x = 1 + Math.floor(rnd() * 9), e = G.makeEquation(x, rnd);
    const m = { k: rnd() < 0.5 ? 'x' : '1', neg: rnd() < 0.5, add: rnd() < 0.5, where: 'both' };
    const r = G.panMove(e.L, e.R, m); if (!r) continue;
    assert.equal(G.tip(r.L, r.R, x), 0, JSON.stringify(m));
    // and Remove zero pairs never changes a side's weight
    for (const s of [r.L, r.R]) { assert.equal(G.weigh(G.sideZero(s), x), G.weigh(s, x)); assert.equal(G.sidePairs(G.sideZero(s)), 0); }
  }
  // 3x + 5 = 2x + 10, take x away from both: 2x + 5 = x + 10; take 5 away from both... ; the right side has no x left:
  let s = { L: { x: 1, u: 0 }, R: { x: 0, u: 5 } };
  s = G.panMove(s.L, s.R, { k: 'x', neg: false, add: false, where: 'both' });
  assert.deepEqual(s, { L: { x: 0, u: 0, nx: 0, nu: 0 }, R: { x: 0, u: 5, nx: 1, nu: 0 } }, 'taking x from a side with none puts in −x');
  assert.equal(G.tip(s.L, s.R, 5), 0);
  // ÷ shares every count (negatives too) evenly
  assert.equal(G.shareBy({ x: 2, u: 0 }, { x: 0, u: 10 }), 2);
  assert.equal(G.shareBy({ x: 2, u: 0, nx: 0, nu: 2 }, { x: 0, u: 10 }), 2);
  assert.deepEqual(G.balanceOp({ x: 4, u: 0, nx: 0, nu: 2 }, { x: 0, u: 10 }, 'div', 'both', 2), { L: { x: 2, u: 0, nx: 0, nu: 1 }, R: { x: 0, u: 5 } });
  assert.equal(G.solvedValue({ x: 1, u: 0 }, { x: 0, u: 0, nu: 2 }), -2);
  assert.equal(G.solvedValue({ x: 1, u: 0 }, { x: 0, u: 5, nu: 1 }), null, 'a zero pair is still there');
});

test('balance: Check shows the working on each side', () => {
  const L = { x: 3, u: 5 }, R = { x: 2, u: 10 };
  const no = G.checkX(L, R, 4);
  assert.equal(no.ok, false); assert.equal(no.l.text, '3·4 + 5 = 17'); assert.equal(no.r.text, '2·4 + 10 = 18');
  const yes = G.checkX(L, R, 5); assert.equal(yes.ok, true); assert.equal(yes.l.v, 20);
  assert.equal(G.workText({ x: 1, u: 9 }, 4).text, '4 + 9 = 13');
  assert.equal(G.workText({ x: 0, u: 9 }, 4).text, '9');
  assert.equal(G.workText({ x: 2, u: 0, nu: 1 }, -3).text, '2·(−3) − 1 = −7');
  assert.equal(G.workText({ x: 0, u: 0, nx: 1 }, 4).text, '−4');
});

test('algebra tiles: rows by kind with zero pairs together, and the challenge', () => {
  const t = (k, neg = false) => ({ k, neg });
  const tiles = [t('x', true), t('1'), t('x'), t('x2'), t('x'), t('1', true)];
  const rows = G.tileRows(tiles);
  assert.deepEqual(rows.map(r => r.k), ['x2', 'x', '1']);
  assert.deepEqual(rows[1], { k: 'x', pairs: [[2, 0]], rest: [4] });
  assert.deepEqual(rows[2], { k: '1', pairs: [[1, 5]], rest: [] });
  const rnd = G.seeded(3);
  for (let i = 0; i < 200; i++) {
    const g = G.makeGoal(rnd);
    assert.ok([g.a, g.b, g.c].filter(Boolean).length >= 2 && Math.abs(g.a) <= 2 && Math.abs(g.b) <= 4 && Math.abs(g.c) <= 5);
  }
  assert.deepEqual(G.goalDiff(tiles, { a: 1, b: 1, c: 0 }), []);
  assert.deepEqual(G.goalDiff(tiles, { a: 1, b: -1, c: 3 }), ['x', '1']);
});

test('every language has the new words, translated', () => {
  const en = JSON.parse(fs.readFileSync('server/i18n/locales/en.json', 'utf8')).dash.w;
  const keys = { balance: ['tray', 'sign', 'putOn', 'bothHint', 'bothPut', 'bothOff', 'addedTo', 'bothTake', 'zero', 'tryX', 'ckYes', 'ckNo', 'howto', 'helpUse'],
    algebra: ['tray', 'cancel', 'legend', 'goal', 'challenge', 'yes', 'notYet', 'diff', 'flip', 'zero', 'howto', 'helpUse'] };
  for (const code of ['ar', 'de', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']) {
    const l = JSON.parse(fs.readFileSync(`server/i18n/locales/${code}.json`, 'utf8')).dash.w;
    for (const [m, ks] of Object.entries(keys)) for (const k of ks) { assert.ok(l[m][k], `${code} ${m}.${k}`); assert.notEqual(l[m][k], en[m][k], `${code} ${m}.${k} is translated`); }
  }
  // No side dropdown any more: the balance has no "Do it to" select.
  const tools = fs.readFileSync('public/js/dash-tools4.js', 'utf8');
  const bal = tools.slice(tools.indexOf('function balance('), tools.indexOf('function algebra('));
  assert.doesNotMatch(bal, /W\.where|T\.pick\(/);
});

// ---------------------------------------------------------------- in the browser
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(p => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

let env = null;
async function setup() {
  if (env) return env;
  const { config } = await import('../../server/config.js');
  config.anthropicKey = '';
  const { createUser, startSession, getUser } = await import('../../server/auth.js');
  const S = await import('../../server/services/schools.js');
  const D = await import('../../server/services/dash.js');
  const { createApp } = await import('../../server/app.js');
  const { tFor } = await import('../../server/i18n/index.js');
  const boss = createUser({ username: 'AlgBoss', password: 'secret123', role: 'admin' });
  const school = S.createSchool(boss, { name: 'Algebra School' }).school;
  const T = getUser(S.createSchoolAccount(boss, school.id, { rosterName: 'Teacher', role: 'teacher' }).user.id);
  const C = S.createClass(T, school.id, { name: 'Class 7A' }).class;
  D.ensureLayouts(T, C, tFor('en'));
  const first = D.layoutsOf(C.id, T.id)[0];
  D.updateLayout(T, C, first.id, { name: 'Test', widgets: [
    { id: 'wbal', type: 'algebra', x: 0, y: 0, w: 9, h: 9, s: { state: { tab: 'balance', balance: { x: 5, lx: 3, lu: 5, rx: 2, ru: 10, show: false, where: 'right', hist: [] } } } },
    { id: 'wtil', type: 'algebra', x: 0, y: 9, w: 9, h: 8, s: { state: { tiles: [{ k: 'x', neg: false }, { k: 'x', neg: true }, { k: '1', neg: false }] } } }] });
  D.useLayout(T, C, first.id);
  const server = createApp().listen(0); await new Promise(r => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});
  const open = async (touch = false) => {
    const ctx = await browser.newContext(touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const [cn, cv] = cookieFor(T.id).split('=');
    await ctx.addCookies([{ name: cn, value: cv, url: base }, { name: 'lang', value: 'en', url: base }]);
    const page = await ctx.newPage();
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/class/${C.id}/dashboard`);
    await page.waitForSelector('.dt-bwrap');
    return { page, ctx, errors };
  };
  const state = id => D.getLayout(first.id).widgets.find(w => w.id === id).s.state;
  const reset = () => D.updateLayout(T, C, first.id, { name: 'Test', widgets: D.getLayout(first.id).widgets.map(w => (w.id === 'wbal' ? { ...w, s: { state: { tab: 'balance', balance: { x: 5, lx: 3, lu: 5, rx: 2, ru: 10, show: false, where: 'right', hist: [] } } } } : w)) });
  env = { open, state, reset, done: async () => { await browser.close(); server.close(); } };
  return env;
}
test.after(async () => { if (env) await env.done(); });

const bal = '.dash-w[data-id="wbal"]';
const eqText = page => page.locator(`${bal} .dt-baleq`).textContent();
const grp = (page, side, k, neg = '') => page.locator(`${bal} .dt-bgrp[data-side="${side}"][data-k="${k}"][data-neg="${neg}"]`);
const mid = async l => { const b = await l.boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
async function mouseDrag(page, src, dst) {
  const [x0, y0] = await mid(src), [x1, y1] = await mid(dst);
  await page.mouse.move(x0, y0); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(x0 + ((x1 - x0) * i) / 6, y0 + ((y1 - y0) * i) / 6);
  await page.mouse.up(); await page.waitForTimeout(150);
}
/** A drag with one finger (touch events through the DevTools protocol: Chromium turns them into pointer events). */
async function touchDrag(page, ctx, src, dst) {
  const cdp = await ctx.newCDPSession(page);
  const [x0, y0] = await mid(src), [x1, y1] = await mid(dst);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y: y0 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + ((x1 - x0) * i) / 8, y: y0 + ((y1 - y0) * i) / 8 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(200);
}

test('the balance with a mouse: no side dropdown; drag off one side tips it, the other side levels it, Both sides, Check, Undo', { skip, timeout: 120e3 }, async () => {
  const E = await setup(); E.reset();
  const { page, ctx, errors } = await E.open();
  await page.locator(bal).scrollIntoViewIfNeeded();
  assert.equal(await page.locator(`${bal} select[aria-label="Do it to"]`).count(), 0);
  assert.equal(await eqText(page), '3x + 5 = 2x + 10', 'the saved equation, as it was');
  // Take an x off the left side (dropped on the tray): it tips to the right.
  await mouseDrag(page, grp(page, 'left', 'x'), page.locator(`${bal} .dt-tray`));
  assert.equal(await eqText(page), '2x + 5 ≠ 2x + 10');
  assert.match(await page.locator(`${bal} .dt-read .dt-sub`).textContent(), /right side is heavier/);
  const beam = await page.locator(`${bal} .dt-bbeam`).evaluate(e => e.style.transform);
  assert.match(beam, /rotate\(\d/, 'turned clockwise: the right side down');
  // The same to the other side: level.
  await mouseDrag(page, grp(page, 'right', 'x'), page.locator(`${bal} .dt-tray`));
  assert.equal(await eqText(page), '2x + 5 = x + 10');
  assert.match(await page.locator(`${bal} .dt-bbeam`).evaluate(e => e.style.transform), /^rotate\(0(\.0+)?deg\)$/);
  // A 1 from the tray onto Both sides: level, both sides one more.
  await mouseDrag(page, page.locator(`${bal} .dt-traytile[data-k="1"]`), page.locator(`${bal} .dt-bboth`));
  assert.equal(await eqText(page), '2x + 6 = x + 11');
  // An x from the left side onto Both sides: taken from both.
  await mouseDrag(page, grp(page, 'left', 'x'), page.locator(`${bal} .dt-bboth`));
  assert.equal(await eqText(page), 'x + 6 = 11');
  // Check: a wrong x shows the working, the right one says yes.
  const inp = page.locator(`${bal} .dt-step input`);
  await inp.fill('4'); await inp.press('Enter'); await page.locator(`${bal} .dt-bcheck`).click();
  assert.equal(await page.locator(`${bal} .dt-bres`).textContent(), 'Not yet: left 4 + 6 = 10, right 11.');
  await inp.fill('5'); await inp.press('Enter'); await page.locator(`${bal} .dt-bcheck`).click();
  assert.equal(await page.locator(`${bal} .dt-bres`).textContent(), 'Yes, x = 5: both sides make 11.');
  // Saved with the history; Undo goes back a step.
  for (let i = 0; i < 40 && E.state('wbal').balance.tx !== 5; i++) await page.waitForTimeout(100);
  const s = E.state('wbal').balance;
  assert.deepEqual([s.lx, s.lu, s.rx, s.ru, s.tx, s.hist.map(h => `${h.op}:${h.w}`).join(' ')], [1, 6, 0, 11, 5, 'subx:left subx:right add1:both subx:both']);
  await page.locator(`${bal} button[aria-label="Undo"]`).click();
  assert.equal(await eqText(page), '2x + 6 = x + 11');
  // The tiles are 44px targets; nothing in the scale is cut off.
  for (const b of await page.locator(`${bal} .dt-bgrp, ${bal} .dt-traytile, ${bal} .dt-bboth`).all()) { const r = await b.boundingBox(); assert.ok(r.height >= 43.5 && r.width >= 43.5, JSON.stringify(r)); }
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('the balance with touch on a phone, by tapping, and with the keyboard', { skip, timeout: 120e3 }, async () => {
  const E = await setup(); E.reset();
  const { page, ctx, errors } = await E.open(true);
  await page.locator(bal).scrollIntoViewIfNeeded();
  // A finger drags a −1 (the sign switched) onto the right side: it tips to the left.
  await page.locator(`${bal} .dt-sign`).click();
  await touchDrag(page, ctx, page.locator(`${bal} .dt-traytile[data-k="1"]`), page.locator(`${bal} .dt-bpan-right`));
  assert.equal(await eqText(page), '3x + 5 ≠ 2x + 10 − 1');
  // A finger drags it off again.
  await touchDrag(page, ctx, grp(page, 'right', '1', '1'), page.locator(`${bal} .dt-tray`));
  assert.equal(await eqText(page), '3x + 5 = 2x + 10');
  // Tap a tile, then tap where it goes: +x (switch back) on Both sides.
  await page.locator(`${bal} .dt-sign`).tap();
  await page.locator(`${bal} .dt-traytile[data-k="x"]`).tap();
  assert.equal(await page.locator(`${bal} .dt-traytile[data-k="x"]`).getAttribute('aria-pressed'), 'true');
  await page.locator(`${bal} .dt-bboth`).tap();
  assert.equal(await eqText(page), '4x + 5 = 3x + 10');
  // The keyboard: a side's tile, Delete takes one away (and it tips); Enter on a tray tile, then the side's Put here.
  await grp(page, 'left', 'x').focus(); await page.keyboard.press('Delete');
  assert.equal(await eqText(page), '3x + 5 ≠ 3x + 10');
  await page.locator(`${bal} .dt-traytile[data-k="x"]`).focus(); await page.keyboard.press('Enter');
  await page.locator(`${bal} .dt-bpan-left .dt-bput`).focus(); await page.keyboard.press('Enter');
  assert.equal(await eqText(page), '4x + 5 = 3x + 10');
  // What changed is said (the page's live region).
  for (let i = 0; i < 20 && !/put in/.test(await page.locator('#dash-say').textContent()); i++) await page.waitForTimeout(50);
  assert.match(await page.locator('#dash-say').textContent(), /Left side: put in \+x\. Level/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('algebra tiles: drag a tile onto its opposite and the pair makes 0; drag from the tray; drag off to take away', { skip, timeout: 120e3 }, async () => {
  const E = await setup();
  const { page, ctx, errors } = await E.open();
  const til = '.dash-w[data-id="wtil"]';
  await page.locator(til).scrollIntoViewIfNeeded();
  assert.equal(await page.locator(`${til} .dt-zpair`).count(), 1, '+x and −x shown together');
  await mouseDrag(page, page.locator(`${til} .dt-zpair .dt-mtile`).first(), page.locator(`${til} .dt-zpair .dt-mtile`).nth(1));
  await page.waitForTimeout(100);
  assert.equal(await page.locator(`${til} .dt-mtile`).count(), 1);
  await mouseDrag(page, page.locator(`${til} .dt-traytile[data-k="x2"]`), page.locator(`${til} .dt-algmat`));
  assert.equal(await page.locator(`${til} .dt-algexp`).textContent(), 'x² + 1');
  await mouseDrag(page, page.locator(`${til} .dt-mtile`).first(), page.locator(`${til} .dt-tray`));
  assert.equal(await page.locator(`${til} .dt-algexp`).textContent(), '1');
  assert.deepEqual(errors, []);
  await ctx.close();
});
