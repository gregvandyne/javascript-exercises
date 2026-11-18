// The Big Divide: the area model with decimals (docs/decisions.md "The Big Divide: read aloud, worksheets, every
// language", the area model for decimals):
//   - multiplication: each number split by place value (2.3 × 1.4 as 2 + 0.3 by 1 + 0.4), a box for each pair (2, 0.3,
//     0.8, 0.12, each with its point), then the boxes added (3.22); a number typed with more zeros is the same number;
//   - division: a decimal divided by a whole number, by the area model or the ladder (the T), in friendly chunks (7.5 ÷ 3:
//     2, then 0.5; 2 + 0.5 = 2.5), only for problems that come out by hundredths (no remainder); a decimal divisor keeps
//     the standard method;
//   - what is offered and saved: the game's DECIMAL_METHODS and the server's BB_DEC_METHODS agree, old sets are cleaned
//     to what they were, and the server refuses the combinations the game doesn't make;
//   - on a phone, three problems in a row for each, to Correct!.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as G from '../../server/services/game-sets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));
const M = await import(path.join(ROOT, 'tools/box-by-box/src/lib/methods.ts'));
const clean = G.SET_GAMES.get('box-by-box');

test('decimal multiplication by the area model: place-value parts, a point in each box, then the sum', () => {
  const w = M.buildWork('area', 'multiply', [2.3, 1.4]);
  assert.deepEqual(w.fields.map((f) => [f.id, f.expect]), [['c0_0', '2'], ['c0_1', '0.3'], ['c1_0', '0.8'], ['c1_1', '0.12'], ['sum', '3.22']]);
  assert.deepEqual(w.fields.map((f) => f.prompt), ['What is 2 × 1?', 'What is 0.3 × 1?', 'What is 2 × 0.4?', 'What is 0.3 × 0.4?', 'Add all the boxes: 2 + 0.3 + 0.8 + 0.12.']);
  assert.ok(w.fields.every((f) => f.point), 'each takes a point');
  assert.match(w.fields[3].hints[1], /3 × 4 = 12\. Then count the decimal places: 2 in all, so it’s 0\.12/);
  assert.deepEqual(w.fields[3].countUp, { skip: { by: 3, times: 4, zeros: 0, places: 2, value: '0.12' } });
  assert.equal(w.answer, '3.22');
  const v = M.watchValues('area', 'multiply', [2.3, 1.4]);
  assert.deepEqual(M.checkWork(M.buildWork('area', 'multiply', [2.3, 1.4], v), v), { right: true, wrong: [] });
  // the same number typed another way is right; a wrong one is marked
  const v2 = { ...v, c0_1: '0.30', sum: '3.220' };
  assert.equal(M.checkWork(M.buildWork('area', 'multiply', [2.3, 1.4], v2), v2).right, true);
  const v3 = { ...v, c1_1: '1.2' };
  assert.deepEqual(M.checkWork(M.buildWork('area', 'multiply', [2.3, 1.4], v3), v3).wrong, ['c1_1']);
  // every decimal problem the editor makes: the boxes add up to the product, exactly
  const plan = { count: 100, tops: [10, 999], bottoms: [2, 99], numbers: 'decimal' };
  for (const [a, b] of L.kindInfo('multiply').settings.generate(plan)) {
    const ww = M.buildWork('area', 'multiply', [a, b]);
    const sum = ww.fields.filter((f) => f.role === 'cell').reduce((s, f) => s + Math.round(Number(f.expect) * 10000), 0);
    assert.equal(sum, Math.round(Number(ww.answer) * 10000), `${a} × ${b}`);
    assert.equal(ww.answer, L.decimalMultiplySheet({ top: a, bottom: b }).answer.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''), `${a} × ${b}: the standard algorithm's answer`);
  }
});

test('a decimal divided by a whole number by the area model: friendly chunks, any path that works, no remainder', () => {
  const v = M.watchValues('area', 'divide', [7.5, 3], 'decimal');
  assert.deepEqual(v, { q0: '2', p0: '6', r0: '1.5', q1: '0.5', p1: '1.5', r1: '0', quotient: '2.5' });
  const w = M.buildWork('area', 'divide', [7.5, 3], v, 'decimal');
  assert.equal(w.answer, '2.5');
  assert.deepEqual(M.checkWork(w, v), { right: true, wrong: [] });
  assert.ok(!w.fields.some((f) => f.role === 'remainder'), 'no remainder to write');
  assert.match(w.fields[3].prompt, /take from 1\.5\. A place-value chunk like 0\.3, 0\.4 or 0\.5 works well/);
  assert.equal(w.fields[0].told, 'Make a section 2 wide: 2 × 3 = 6 fits in 7.5. Write 2 on top.');
  // another path (1, then 1.5), typed with extra zeros, is right too; taking too much is not
  const alt = { q0: '1', p0: '3', r0: '4.5', q1: '1.5', p1: '4.50', r1: '0', quotient: '2.50' };
  assert.deepEqual(M.checkWork(M.buildWork('area', 'divide', [7.5, 3], alt, 'decimal'), alt), { right: true, wrong: [] });
  const over = { q0: '3' };
  assert.match(M.buildWork('area', 'divide', [7.5, 3], over, 'decimal').fields[0].nudge('3'), /3 × 3 = 9, more than 7\.5/);
  // only whole divisors, coming out by hundredths
  assert.equal(L.checkProblem('divide', 7.5, 3, 'decimal', 'area'), null);
  assert.match(L.checkProblem('divide', 4.5, 0.3, 'decimal', 'area'), /whole number/);
  assert.match(L.checkProblem('divide', 13, 3, 'decimal', 'area'), /hundredths/);
  assert.equal(L.checkProblem('divide', 4.5, 0.3, 'decimal', 'standard'), null, 'the standard method keeps decimal divisors');
  // every problem the editor makes for it fits, and works to the end
  for (const [a, b] of L.kindInfo('divide').settings.generate({ count: 100, dividends: [100, 999], divisors: [2, 9], remainders: 'R', numbers: 'decimal', method: 'area' })) {
    assert.equal(L.checkProblem('divide', a, b, 'decimal', 'area'), null, `${a} ÷ ${b}`);
    const vv = M.watchValues('area', 'divide', [a, b], 'decimal');
    assert.equal(M.checkWork(M.buildWork('area', 'divide', [a, b], vv, 'decimal'), vv).right, true, `${a} ÷ ${b}`);
    assert.equal(vv.quotient, L.divideSheet({ dividend: a, divisor: b, form: 'decimal' }).answer, `${a} ÷ ${b}: the standard algorithm's answer`);
  }
});

test('a decimal divided by a whole number by the ladder: the same chunks down the side, any path, no remainder', () => {
  const v = M.watchValues('ladder', 'divide', [7.5, 3], 'decimal');
  assert.deepEqual(v, { q0: '2', p0: '6', r0: '1.5', q1: '0.5', p1: '1.5', r1: '0', quotient: '2.5' });
  const w = M.buildWork('ladder', 'divide', [7.5, 3], v, 'decimal');
  assert.equal(w.answer, '2.5');
  assert.deepEqual(M.checkWork(w, v), { right: true, wrong: [] });
  assert.ok(!w.fields.some((f) => f.role === 'remainder'), 'no remainder to write');
  assert.equal(w.fields[0].prompt, 'How many 3s will you take away from 7.5? A friendly number like 2 or 1 is easy.');
  assert.equal(w.fields[0].told, 'Take away 2 groups of 3. Write 2 on the side.');
  assert.equal(w.fields[3].prompt, 'How many 3s will you take away from 1.5? A friendly number like 0.5 or 0.2 is easy.');
  assert.equal(w.fields.at(-1).prompt, 'Add the numbers on the side: 2 + 0.5. What’s the quotient?');
  // a longer path (1, 1, 0.5) is right too; a wrong difference is marked
  const alt = { q0: '1', p0: '3', r0: '4.5', q1: '1', p1: '3', r1: '1.5', q2: '0.5', p2: '1.5', r2: '0', quotient: '2.5' };
  assert.deepEqual(M.checkWork(M.buildWork('ladder', 'divide', [7.5, 3], alt, 'decimal'), alt), { right: true, wrong: [] });
  const bad = { ...v, r0: '2.5' };
  assert.ok(M.checkWork(M.buildWork('ladder', 'divide', [7.5, 3], bad, 'decimal'), bad).wrong.includes('r0'));
  assert.equal(L.checkProblem('divide', 4.5, 0.3, 'decimal', 'ladder').length > 0, true, 'a decimal divisor: the standard method only');
  for (const [a, b] of L.kindInfo('divide').settings.generate({ count: 60, dividends: [100, 9999], divisors: [2, 25], remainders: 'R', numbers: 'decimal', method: 'ladder' })) {
    const vv = M.watchValues('ladder', 'divide', [a, b], 'decimal');
    assert.equal(M.checkWork(M.buildWork('ladder', 'divide', [a, b], vv, 'decimal'), vv).right, true, `${a} ÷ ${b}`);
  }
});

test('which methods decimals offer, what is saved, and what the server takes (old sets unchanged)', () => {
  assert.deepEqual(L.DECIMAL_METHODS, G.BB_DEC_METHODS, 'the game and the server agree');
  assert.equal(L.methodFor('divide', 'ladder', 'decimal'), 'ladder');
  assert.equal(L.methodFor('multiply', 'partial', 'decimal'), 'standard');
  assert.equal(L.methodFor('divide', 'area', 'decimal'), 'area');
  assert.equal(L.methodFor('multiply', 'area', 'decimal'), 'area');
  const div = { k: 'divide', p: [[7.5, 3], [12.6, 4]], l: 'guided', m: 'area', dec: 1 };
  const mul = { k: 'multiply', p: [[2.3, 1.4]], l: 'guided', m: 'area', dec: 1 };
  for (const it of [div, mul, { ...div, m: 'ladder' }]) {
    const a = L.parseItem(it);
    assert.equal(a.settings.method, it.m);
    assert.deepEqual(L.toItem(a), it, 'saved as opened');
    assert.deepEqual(clean([it]), [it], 'the server takes it');
  }
  // a decimal divisor or a problem that doesn't come out: the game drops it, the server refuses the set
  assert.deepEqual(L.parseItem({ ...div, p: [[7.5, 3], [4.5, 0.3], [13, 3]] }).problems, [[7.5, 3]]);
  for (const bad of [{ ...div, p: [[4.5, 0.3]] }, { ...div, p: [[13, 3]] }, { ...div, m: 'ladder', p: [[4.5, 0.3]] }, { ...mul, m: 'ladder' }, { ...mul, m: 'partial' }, { k: 'add', p: [[3.5, 2.75]], l: 'guided', m: 'area', dec: 1 }])
    assert.equal(clean([bad]), null, JSON.stringify(bad));
  // sets saved before: the same JSON
  for (const old of [{ k: 'divide', p: [[4.5, 0.3]], l: 'guided', dec: 1 }, { k: 'multiply', p: [[2.4, 1.3]], l: 'countUp', dec: 1 }, { k: 'divide', p: [[96, 4]], l: 'guided', m: 'area' }, { k: 'multiply', p: [[46, 23]], l: 'guided', m: 'partial' }])
    assert.deepEqual(clean([old]), [old]);
  // a decimals item with a method decimals don't have opens with the standard method
  assert.equal(L.parseItem({ k: 'multiply', p: [[2.4, 1.3]], l: 'guided', dec: 1, m: 'partial' }).settings.method, 'standard');
});

// ---------------------------------------------------------------- on a phone, three in a row
const exe = [process.env.BRB_CHROMIUM, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) => p && fs.existsSync(p));
let chromium = null;
try { ({ chromium } = await import('playwright')); } catch { chromium = null; }
let haveBrowser = false;
if (chromium) { try { const b = await chromium.launch(exe ? { executablePath: exe } : {}); await b.close(); haveBrowser = true; } catch { haveBrowser = false; } }
const skip = haveBrowser ? false : 'no Chromium installed';
const html = fs.readFileSync(path.join(ROOT, 'seed-games/box-by-box.html'), 'utf8');
let browser = null;
test.after(async () => { if (browser) await browser.close(); });
async function openPlain(item, phone = true) {
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
/** The friendly chunk a student takes (the biggest place-value one; the last section all that's left). */
const choiceOf = (f) => f.countUp.choose.f.show(f.countUp.choose.last ? Math.floor(f.countUp.choose.left / f.countUp.choose.divisor) : M.placeValueMultiple(f.countUp.choose.left, f.countUp.choose.divisor));
const CASES = [
  { what: 'decimal multiplication by the area model', item: { k: 'multiply', p: [[2.3, 1.4], [0.6, 4], [3.25, 2.6]], l: 'guided', m: 'area', dec: 1 }, form: 'R' },
  { what: 'a decimal divided by a whole number by the area model', item: { k: 'divide', p: [[7.5, 3], [12.6, 4], [0.84, 4]], l: 'guided', m: 'area', dec: 1 }, form: 'decimal' },
  { what: 'a decimal divided by a whole number by the ladder', item: { k: 'divide', p: [[7.5, 3], [12.6, 4], [0.84, 4]], l: 'guided', m: 'ladder', dec: 1 }, form: 'decimal' }
];
for (const c of CASES)
  test(`in Chromium, on a phone: ${c.what}, three in a row, Guided, to Correct!`, { skip, timeout: 120e3 }, async () => {
    const { page, ctx, errors } = await openPlain(c.item);
    for (let i = 0; i < c.item.p.length; i++) {
      const p = c.item.p[i];
      const v = {};
      for (let guard = 0; guard < 40; guard++) {
        const f = M.buildWork(c.item.m, c.item.k, p, v, c.form).fields.find((x) => !v[x.id]);
        if (!f) break;
        assert.equal(await page.locator('.prompt').innerText(), f.prompt, `${p}: the question for ${f.id}`);
        const val = f.role === 'choice' ? choiceOf(f) : f.expect;
        await page.keyboard.type(val, { delay: 25 });
        if (f.role === 'choice' && val.length < f.len) await page.keyboard.press('Enter');
        await page.waitForTimeout(40);
        v[f.id] = val;
      }
      const w = M.buildWork(c.item.m, c.item.k, p, v, c.form);
      if (c.item.k === 'multiply') assert.ok((await page.locator('.amul').innerText()).includes('.'), `${p}: the parts and boxes show their points`);
      await page.getByRole('button', { name: 'Check', exact: true }).click();
      assert.match(await page.locator('.feedback').innerText(), new RegExp(`Correct! ${w.title.replace(/[.×÷]/g, '.')} = ${w.answer.replace('.', '\\.')}`), `${p}`);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scroll');
      await page.locator('.feedback .btn-primary').click();
    }
    await page.getByText('All done!').waitFor();
    assert.match(await page.locator('.final').innerText(), /You got 3 right and 0 wrong/);
    assert.deepEqual(await page.evaluate(() => window.__over), [{ won: true, score: 3 }]);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
