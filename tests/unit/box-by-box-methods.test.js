// The Big Divide's other methods (docs/decisions.md "The Big Divide: the ladder, area models and partial products"):
// the step checkers in tools/box-by-box/src/lib/methods.ts (pure, so Node loads the TypeScript as it is), the method
// riding in an activity's item, and each method worked in the built game in Chromium, Guided and On my own.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const M = await import(path.join(ROOT, 'tools/box-by-box/src/lib/methods.ts'));
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));

/** A seeded random, so a failure can be run again. */
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
/** Work a ladder by a path of partial quotients: the typed values, rung by rung, then the quotient and remainder. */
function ladderValues(dividend, divisor, qs) {
  const v = {};
  let left = dividend;
  qs.forEach((q, i) => {
    v[`q${i}`] = String(q);
    v[`p${i}`] = String(q * divisor);
    left -= q * divisor;
    v[`r${i}`] = String(left);
  });
  v.quotient = String(Math.floor(dividend / divisor));
  v.remainder = String(dividend % divisor);
  return v;
}
/** A random path down the ladder: each step any whole number of divisors that fits (the last allowed rung finishes). */
function randomPath(dividend, divisor, r) {
  const qs = [];
  let left = dividend;
  while (left >= divisor) {
    const most = Math.floor(left / divisor);
    const last = qs.length === M.MAX_RUNGS - 1;
    const pick = r() < 0.4 ? M.friendlyMultiple(left, divisor) : r() < 0.5 ? M.placeValueMultiple(left, divisor) : 1 + Math.floor(r() * most);
    const q = last ? most : Math.max(1, Math.min(most, Math.max(pick, Math.ceil(most / 3))));
    qs.push(q);
    left -= q * divisor;
  }
  return qs;
}

// ---------------------------------------------------------------- the ladder (and the area model, the same steps)

test('ladder: the watch path takes the biggest place-value groups first, and its groups add up to the quotient', () => {
  assert.deepEqual(M.watchPath(945, 7), [100, 30, 5]);
  assert.deepEqual(M.watchPath(5184, 16), [300, 20, 4]);
  assert.deepEqual(M.watchPath(99, 3), [30, 3]);
  assert.deepEqual(M.watchPath(10, 11 - 1), [1]);
  assert.equal(M.placeValueMultiple(245, 7), 30);
  assert.equal(M.placeValueMultiple(6, 7), 0);
  assert.equal(M.friendlyMultiple(945, 7), 100);
  assert.equal(M.friendlyMultiple(40, 7), 5);
  const r = rng(1);
  for (let n = 0; n < 400; n++) {
    const d = 2 + Math.floor(r() * 9998), a = Math.max(d, 10 + Math.floor(r() * 999990));
    const path = M.watchPath(a, d);
    assert.equal(path.reduce((s, q) => s + q, 0), Math.floor(a / d), `${a} ÷ ${d}`);
    assert.ok(path.length <= 6, `${a} ÷ ${d}: one rung per quotient digit at most`);
  }
});

test('ladder: any valid path of multiples is right, whatever groups are taken away', () => {
  // 945 ÷ 7, several ways down the ladder
  for (const qs of [[100, 30, 5], [100, 20, 15], [50, 50, 35], [100, 10, 10, 10, 5], [135], [2, 100, 33]]) {
    const v = ladderValues(945, 7, qs);
    for (const method of ['ladder', 'area']) {
      const w = M.buildWork(method, 'divide', [945, 7], v);
      assert.equal(w.rungs.length, qs.length, `${qs}: one rung each`);
      assert.equal(w.closed, true);
      assert.ok(M.allRight(w, v), `${method} ${qs}`);
      assert.deepEqual(M.checkWork(w, v), { right: true, wrong: [] }, `${method} ${qs}`);
    }
  }
  // many problems, random paths
  const r = rng(7);
  for (let n = 0; n < 300; n++) {
    const d = 2 + Math.floor(r() * 120), a = Math.max(d, 10 + Math.floor(r() * 99990));
    const qs = randomPath(a, d, r);
    const v = ladderValues(a, d, qs);
    const w = M.buildWork('ladder', 'divide', [a, d], v);
    assert.ok(M.checkWork(w, v).right, `${a} ÷ ${d} by ${qs}: ${JSON.stringify(M.checkWork(w, v))}`);
    assert.equal(M.checkLadder(a, d, qs.map(String), qs.map((q) => String(q * d)), qs.map((_, i) => v[`r${i}`]), v.quotient, v.remainder).right, true);
  }
});

test('ladder: steps that are not valid are rejected, each marked where it goes wrong', () => {
  const bad = (qs, patch = {}) => {
    const v = { ...ladderValues(945, 7, qs), ...patch };
    const w = M.buildWork('ladder', 'divide', [945, 7], v);
    return M.checkWork(w, v);
  };
  assert.deepEqual(bad([200, 0, 0], {}).wrong.slice(0, 1), ['q0'], '200 × 7 = 1400 is more than 945');
  assert.equal(M.chooseCheck(945, 7, 200), 'over');
  assert.equal(M.chooseCheck(945, 7, 0), 'zero');
  assert.equal(M.chooseCheck(945, 7, 135), null);
  assert.equal(M.chooseCheck(945, 7, 100, true), 'short', 'the last rung allowed must finish');
  assert.match(M.chooseNudge(945, 7, 200), /1400, more than 945/);
  assert.deepEqual(bad([100, 30, 5], { p1: '200' }).wrong, ['p1'], 'a product worked wrong');
  assert.deepEqual(bad([100, 30, 5], { r0: '255' }).wrong.includes('r0'), true, 'a difference worked wrong');
  assert.deepEqual(bad([100, 30, 5], { quotient: '134' }).wrong, ['quotient']);
  assert.deepEqual(bad([100, 30, 5], { remainder: '1' }).wrong, ['remainder']);
  // stopping while what's left still holds the divisor: not finished, so not right
  const v = ladderValues(945, 7, [100, 30]);
  const w = M.buildWork('ladder', 'divide', [945, 7], v);
  assert.equal(w.closed, false, '35 is left: another rung opens');
  assert.equal(w.rungs.length, 3);
  assert.equal(M.allFilled(w, v), false);
  assert.equal(M.checkWork(w, v).right, false);
  // a rung's fields: a choice, then the product and the difference it makes
  const f = M.buildWork('ladder', 'divide', [945, 7], { q0: '100' }).fields;
  assert.deepEqual(f.slice(0, 3).map((x) => [x.id, x.role, x.expect]), [['q0', 'choice', null], ['p0', 'product', '700'], ['r0', 'difference', '245']]);
  assert.equal(M.fieldWrong(f[0], { q0: '200' }), true);
  assert.equal(M.fieldWrong(f[1], { p0: '700' }), false);
  assert.equal(M.fieldWrong(f[1], { p0: '0700' }), false, 'a leading zero is still 700');
  assert.deepEqual(M.wrongDigits(f[1], '710'), [false, true, false], 'only the wrong digit is marked');
});

test('ladder: the remainder is what is left at the bottom, for every problem and path', () => {
  const r = rng(3);
  for (let n = 0; n < 200; n++) {
    const d = 2 + Math.floor(r() * 50), a = Math.max(d, 10 + Math.floor(r() * 9990));
    const qs = randomPath(a, d, r);
    const v = ladderValues(a, d, qs);
    assert.equal(v[`r${qs.length - 1}`], String(a % d), `${a} ÷ ${d}`);
    const w = M.buildWork('area', 'divide', [a, d], v);
    assert.equal(w.answer, `${Math.floor(a / d)} R ${a % d}`);
    assert.equal(M.checkWork(w, { ...v, remainder: String((a % d) + 1) }).right, false);
  }
  // no remainder: R 0
  const v = M.watchValues('ladder', 'divide', [945, 7]);
  assert.equal(v.remainder, '0');
  assert.equal(L.showAnswer(M.buildWork('ladder', 'divide', [945, 7], v).answer), '135');
});

test('ladder: hints suggest a friendly multiple, and Count up steps through 1, 2, 5, 10, 20, 50, 100 …', () => {
  const q0 = M.buildWork('ladder', 'divide', [945, 7]).fields[0];
  assert.equal(q0.hints.length, 3);
  assert.match(q0.hints[1], /100 × 7 = 700/);
  assert.match(q0.hints[2], /Try 100/);
  assert.match(q0.prompt, /How many 7s will you take away from 945\?/);
  assert.deepEqual(M.friendlySteps(945, 7), [1, 2, 5, 10, 20, 50, 100, 200], 'up to the first that is too many');
  assert.deepEqual(M.friendlySteps(20, 7), [1, 2, 5]);
  // no long dashes in what a student reads
  for (const f of M.buildWork('ladder', 'divide', [945, 7], M.watchValues('ladder', 'divide', [945, 7])).fields)
    for (const t of [f.prompt, f.told, ...f.hints]) assert.doesNotMatch(t, /—/);
});

// ---------------------------------------------------------------- multiplication: the area model and partial products

test('area model and partial products: place-value parts, a product for each pair, adding up to the answer', () => {
  assert.deepEqual(M.placeParts(46), [40, 6]);
  assert.deepEqual(M.placeParts(406), [400, 6], 'a zero digit makes no part');
  assert.deepEqual(M.placeParts(9999), [9000, 900, 90, 9]);
  assert.deepEqual(M.areaCells(46, 23).map((r) => r.map((c) => c.value)), [[800, 120], [120, 18]]);
  assert.deepEqual(M.partialProducts(46, 23).map((p) => [p.bottom, p.top, p.value]), [[3, 6, 18], [3, 40, 120], [20, 6, 120], [20, 40, 800]]);
  const r = rng(11);
  for (let n = 0; n < 300; n++) {
    const top = 10 + Math.floor(r() * 9990), bottom = 2 + Math.floor(r() * Math.min(997, top));
    const cells = M.areaCells(top, bottom).flat();
    const pp = M.partialProducts(top, bottom);
    assert.equal(M.partsTotal(cells), top * bottom, `${top} × ${bottom}`);
    assert.equal(M.partsTotal(pp), top * bottom);
    assert.deepEqual(pp.map((p) => p.value).sort((a, b) => a - b), cells.map((c) => c.value).sort((a, b) => a - b), 'the same parts, listed');
    for (const method of ['area', 'partial']) {
      const v = M.watchValues(method, 'multiply', [top, bottom]);
      const w = M.buildWork(method, 'multiply', [top, bottom], v);
      assert.ok(M.allRight(w, v), `${method} ${top} × ${bottom}`);
      assert.equal(w.answer, String(top * bottom));
    }
  }
});

test('area model and partial products: each box checked, the sum checked, wrong digits marked', () => {
  const w = M.buildWork('area', 'multiply', [46, 23]);
  assert.deepEqual(w.fields.map((f) => [f.id, f.expect]), [['c0_0', '800'], ['c0_1', '120'], ['c1_0', '120'], ['c1_1', '18'], ['sum', '1058']]);
  assert.equal(w.fields[0].prompt, 'What is 40 × 20?');
  assert.match(w.fields[0].hints[1], /4 × 2 = 8\. Then put on 2 zeros/);
  assert.deepEqual(w.fields[0].countUp, { skip: { by: 4, times: 2, zeros: 2, value: 800 } });
  const v = { ...M.watchValues('area', 'multiply', [46, 23]), c1_1: '17' };
  assert.equal(M.checkWork(M.buildWork('area', 'multiply', [46, 23], v), v).right, false);
  assert.deepEqual(M.checkWork(M.buildWork('area', 'multiply', [46, 23], v), v).wrong, ['c1_1']);
  assert.deepEqual(M.wrongDigits(w.fields[3], '17'), [false, true]);
  const p = M.buildWork('partial', 'multiply', [46, 23]);
  assert.deepEqual(p.fields.map((f) => f.prompt), ['What is 3 × 6?', 'What is 3 × 40?', 'What is 20 × 6?', 'What is 20 × 40?', 'Add all the lines: 18 + 120 + 120 + 800.']);
  // one part each: nothing to add, the one box is the answer
  const one = M.buildWork('area', 'multiply', [40, 3]);
  assert.deepEqual(one.fields.map((f) => f.id), ['c0_0']);
  assert.equal(one.sum, null);
});

// ---------------------------------------------------------------- the method in an activity

test('the method rides in the item only when it is not the standard algorithm; old items are standard', () => {
  const act = (kind, method) => ({ kind, problems: [[945, 7]], settings: { ...L.freshSettings(), method }, plan: L.kindInfo(kind).settings.fresh() });
  assert.equal(L.freshSettings().method, 'standard');
  assert.deepEqual(L.toItem(act('divide', 'standard')), { k: 'divide', p: [[945, 7]], l: 'guided' }, 'exactly the item saved before methods');
  assert.deepEqual(L.toItem(act('divide', 'ladder')), { k: 'divide', p: [[945, 7]], l: 'guided', m: 'ladder' });
  assert.equal(L.parseItem({ k: 'divide', p: [[945, 7]], l: 'guided' }).settings.method, 'standard');
  assert.equal(L.parseItem({ k: 'divide', p: [[945, 7]], l: 'guided', m: 'area' }).settings.method, 'area');
  assert.equal(L.parseItem({ k: 'multiply', p: [[46, 23]], l: 'guided', m: 'partial' }).settings.method, 'partial');
  assert.equal(L.parseItem({ k: 'multiply', p: [[46, 23]], l: 'guided', m: 'ladder' }).settings.method, 'standard', 'not a multiplication method');
  assert.equal(L.parseItem({ k: 'divide', p: [[945, 7]], l: 'guided', m: '<b>x</b>' }).settings.method, 'standard');
  assert.deepEqual(M.methodsFor('divide').map((m) => m.name), ['standard', 'ladder', 'area']);
  assert.deepEqual(M.methodsFor('multiply').map((m) => m.name), ['standard', 'area', 'partial']);
  for (const kind of ['divide', 'multiply']) for (const m of M.methodsFor(kind)) {
    assert.ok(m.about.length > 20 && !/—/.test(m.about), `${kind} ${m.name}: a one-line description`);
    if (m.name !== 'standard') assert.ok(m.steps.length >= 3);
  }
});

// ---------------------------------------------------------------- in the built game (Chromium)

const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('@playwright/test')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';

const html = fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.html'), 'utf8');
let browser = null;
test.after(async () => { if (browser) await browser.close(); });
/** The built game opened with a teacher's activity (a question set), as the frame opens it: BRB stubbed, the kit served. */
async function open(item, phone) {
  browser ??= await chromium.launch(exe ? { executablePath: exe } : {});
  const ctx = await browser.newContext(phone ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' } : { viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.host !== 'game.test') return r.abort();
    if (u.pathname.startsWith('/vendor/')) return r.fulfill({ path: path.join(ROOT, 'public', u.pathname) });
    return r.fulfill({ contentType: 'text/html', body: html });
  });
  await page.addInitScript((it) => {
    const kept = {};
    window.__over = [];
    window.BRB = { questionSet: { id: 's-abcdefghjk', items: [it], mine: false }, storage: { get: (k) => kept[k] ?? null, set: (k, v) => (kept[k] = v) }, gameOver: (o) => window.__over.push(o), user: { isGuest: false } };
  }, item);
  await page.goto('http://game.test/play');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  return { page, ctx, errors };
}
/** Type each entry (a number into the field with the focus; '\n' is Enter). */
async function type(page, keys) {
  for (const k of keys) {
    if (k === '\n') await page.keyboard.press('Enter');
    else await page.keyboard.type(k);
    await page.waitForTimeout(30);
  }
}
async function finish(page) {
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await page.locator('.feedback.right').waitFor();
  assert.match(await page.locator('.feedback').innerText(), /Correct!/);
  await page.getByRole('button', { name: 'See the score' }).click();
  await page.getByText('All done!').waitFor();
  return page.evaluate(() => window.__over);
}

const RUNS = [
  // a ladder down a path of the student's own (not the watch path), and the area model by another
  { item: { k: 'divide', p: [[945, 7]], m: 'ladder' }, keys: ['100', '\n', '700', '245', '20', '\n', '140', '105', '15', '\n', '105', '0', '135', '0'] },
  { item: { k: 'divide', p: [[2445, 7]], m: 'area' }, keys: ['300', '\n', '2100', '345', '40', '\n', '280', '65', '9', '\n', '63', '2', '349', '2'] },
  { item: { k: 'multiply', p: [[46, 23]], m: 'area' }, keys: ['800', '120', '120', '18', '1058'] },
  { item: { k: 'multiply', p: [[352, 47]], m: 'partial' }, keys: ['14', '350', '2100', '80', '2000', '12000', '16544'] }
];
for (const { item, keys } of RUNS)
  for (const l of ['guided', 'onMyOwn'])
    test(`in Chromium: ${item.m} ${item.k === 'divide' ? 'division' : 'multiplication'}, ${l === 'guided' ? 'Guided' : 'On my own'}, one problem to Correct! and the score`, { skip, timeout: 60e3 }, async () => {
      const { page, ctx, errors } = await open({ ...item, l }, l === 'guided');
      await type(page, keys);
      assert.deepEqual(await finish(page), [{ won: true, score: 1 }], 'BRB.gameOver once, with the score');
      assert.deepEqual(errors, []);
      // the work fits the phone: the page itself never scrolls sideways
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
      await ctx.close();
    });

test('in Chromium: Guided marks a wrong digit at once and Stuck? lights up; a second wrong Check shows a worked answer', { skip, timeout: 60e3 }, async () => {
  const { page, ctx, errors } = await open({ k: 'divide', p: [[945, 7]], l: 'guided', m: 'ladder' }, true);
  await type(page, ['200', '\n']);
  assert.match(await page.locator('.prompt').innerText(), /1400, more than 945/);
  assert.equal(await page.locator('.num.wrong').count(), 1);
  await type(page, ['300', '\n']);
  assert.match(await page.getByRole('button', { name: /Stuck\?/ }).innerText(), /Stuck\? Hint/);
  await page.getByRole('button', { name: /Stuck\?/ }).click();
  assert.match(await page.locator('.hint-box').innerText(), /friendly number of 7s/);
  await type(page, ['100', '\n', '710']);
  assert.equal(await page.locator('.num.wrong .sq.bad').count(), 1, 'only the 1 of 710 is marked');
  await ctx.close();
  // On my own: a wrong answer, Check twice, and the answer is worked one way, the changed fields shown
  const o = await open({ k: 'multiply', p: [[46, 23]], l: 'onMyOwn', m: 'area' }, false);
  await type(o.page, ['800', '120', '120', '19', '1059']);
  await o.page.getByRole('button', { name: 'Check', exact: true }).click();
  assert.match(await o.page.locator('.feedback').innerText(), /Not quite/);
  await o.page.getByRole('button', { name: 'Try again' }).click();
  assert.equal(await o.page.locator('.num.wrong').count(), 2, 'the box and the sum stay marked');
  await o.page.getByRole('button', { name: 'Check', exact: true }).click();
  assert.match(await o.page.locator('.feedback').innerText(), /The answer is 1058/);
  assert.equal(await o.page.locator('.num.shown').count(), 2);
  await o.page.getByRole('button', { name: 'See the score' }).click();
  assert.deepEqual(await o.page.evaluate(() => window.__over), [{ won: true, score: 0 }]);
  assert.deepEqual([...errors, ...o.errors], []);
  await o.ctx.close();
});

test('in Chromium: Watch shows one sensible path, and Count up picks with ▲ and skip-counts', { skip, timeout: 60e3 }, async () => {
  const { page, ctx } = await open({ k: 'divide', p: [[945, 7]], l: 'watch', m: 'ladder' }, false);
  await page.getByRole('button', { name: 'Next' }).click();
  assert.match(await page.locator('.prompt').innerText(), /Take away 100 groups of 7/);
  for (let i = 0; i < 30 && !(await page.getByText('All done!').count()); i++) await page.getByRole('button', { name: /^(Next|Done)$/ }).click();
  assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: 0 }]);
  await ctx.close();
  const c = await open({ k: 'multiply', p: [[46, 23]], l: 'countUp', m: 'area' }, false);
  for (const times of [2, 2, 3, 3]) {
    for (let i = 0; i < times; i++) await c.page.keyboard.press('ArrowUp');
    await c.page.keyboard.press('Enter');
    await c.page.waitForTimeout(50);
  }
  assert.deepEqual(await c.page.locator('.amul .num').allInnerTexts().then((t) => t.map((x) => x.replace(/\s/g, ''))), ['800', '120', '120', '18']);
  await type(c.page, ['1058']);
  assert.deepEqual(await finish(c.page), [{ won: true, score: 1 }]);
  await c.ctx.close();
});
