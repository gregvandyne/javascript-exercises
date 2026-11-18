// The Big Divide's new math (docs/decisions.md "The Big Divide: remainders, decimals, addition and subtraction"): the
// sheets in tools/box-by-box/src/lib (pure, so Node loads the TypeScript as it is). Each sheet is checked by working it
// box by box with its own right digits, and against the numbers worked out another way.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const L = await import(path.join(ROOT, 'tools/box-by-box/src/lib/logic.ts'));

/** A seeded random, so a failure can be run again. */
export function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}
const cellsOf = (sheet, kind) => sheet.cells.filter((c) => c.kind === kind);
const boxAt = (sheet, id) => sheet.cells.find((c) => c.kind === 'box' && c.id === id);

// ---------------------------------------------------------------- the bring-down arrows

test('long division: an arrow for each bring-down, from the digit straight down to its box, drawn once the box is filled', () => {
  const s = L.divideSheet({ dividend: 9452, divisor: 7 });
  const downs = s.steps.filter((st) => st.kind === 'bringDown');
  const arrows = cellsOf(s, 'arrow');
  assert.equal(downs.length, 3);
  assert.equal(arrows.length, 3, 'one arrow per bring-down');
  downs.forEach((st, i) => {
    const a = arrows[i];
    const b = boxAt(s, st.boxes[0]);
    assert.equal(a.after, st.boxes[0], 'drawn when its box is filled');
    assert.equal(a.row, 1, 'from the number being divided');
    assert.equal(a.toRow, b.row, 'down to the brought-down box');
    assert.equal(a.col, b.col, 'straight down: the same column');
    assert.ok(st.lit.includes(a.key), 'lit with its step');
    // nothing else sits in the arrow's column between the two
    const between = s.cells.filter((c) => (c.kind === 'box' || c.kind === 'given') && c.col === a.col && c.row > a.row && c.row < a.toRow);
    assert.deepEqual(between, [], `nothing under the arrow ${i + 1}`);
  });
  assert.equal(cellsOf(L.divideSheet({ dividend: 96, divisor: 32 }), 'arrow').length, 0, 'no bring-down, no arrow');
});

// ---------------------------------------------------------------- remainders: R, a fraction, a decimal

const M = await import(path.join(ROOT, 'tools/box-by-box/src/lib/methods.ts'));
const N = await import(path.join(ROOT, 'tools/box-by-box/src/lib/numbers.ts'));
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
/** The quotient's digits as the sheet's boxes hold them, the point included. */
const quotientText = (s) => s.answerBoxes.filter((id) => id[0] === 'q').sort((a, b) => boxAt(s, a).col - boxAt(s, b).col).map((id) => L.boxOf(s, id).digit).join('');

test('remainders: the old on/off reads as R/none; the form rides in the item only as a fraction or a decimal', () => {
  assert.equal(L.remainderForm(true), 'R');
  assert.equal(L.remainderForm(undefined), 'R');
  assert.equal(L.remainderForm(false), 'none');
  assert.equal(L.remainderForm(0), 'none');
  assert.equal(L.remainderForm('fraction'), 'fraction');
  assert.equal(L.remainderForm('decimal'), 'decimal');
  assert.equal(L.kindInfo('divide').settings.parse({ count: 5, dividends: [100, 999], divisors: [2, 9], remainders: false }).remainders, 'none');
  assert.equal(L.kindInfo('divide').settings.parse({ count: 5, dividends: [100, 999], divisors: [2, 9], remainders: true }).remainders, 'R');
  // old items come back exactly as they were (a fresh set per student keeps remainders as on or off)
  const olds = [
    { k: 'divide', p: [[92, 4], [612, 6]], l: 'guided' },
    { k: 'divide', p: [], l: 'guided', d: 1, g: { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: false } },
    { k: 'divide', p: [], l: 'countUp', d: 1, g: { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: true }, m: 'ladder' },
    { k: 'multiply', p: [[24, 13]], l: 'onMyOwn' }
  ];
  for (const o of olds) assert.deepEqual(L.toItem(L.parseItem(o)), o, JSON.stringify(o));
  for (const r of ['fraction', 'decimal']) {
    const it = { k: 'divide', p: [[745, 6]], l: 'guided', r };
    assert.deepEqual(L.toItem(L.parseItem(it)), it);
    const per = { k: 'divide', p: [], l: 'guided', d: 1, g: { count: 16, dividends: [100, 999], divisors: [2, 9], remainders: true }, r };
    assert.deepEqual(L.toItem(L.parseItem(per)), per, 'a fresh set per student: g as before, the form in r');
  }
  assert.equal(L.parseItem({ k: 'multiply', p: [[24, 13]], l: 'guided', r: 'fraction' }).plan.remainders, undefined, 'only division has remainders');
  // a decimal remainder is the standard method's: the ladder writes it as R
  assert.equal(L.formOf(L.parseItem({ k: 'divide', p: [[745, 6]], l: 'guided', r: 'decimal', m: 'ladder' })), 'R');
});

test('remainders as a fraction: the quotient, then what is left over the divisor, in half squares beside it', () => {
  const r = rng(7);
  for (let n = 0; n < 300; n++) {
    const B = 2 + Math.floor(r() * (n % 3 ? 8 : 98)), A = Math.max(B, 10 + Math.floor(r() * 99990));
    const s = L.divideSheet({ dividend: A, divisor: B, form: 'fraction' });
    const Q = Math.floor(A / B), R = A % B;
    assert.equal(s.answer, R ? `${Q} ${R}/${B}` : String(Q), `${A} ÷ ${B}`);
    assert.equal(quotientText(s), String(Q));
    assert.ok(L.allRight(s, L.correctValues(s)));
    if (!R) { assert.equal(s.fraction, undefined); continue; }
    assert.deepEqual(s.fraction.num.map((id) => L.boxOf(s, id).digit).join(''), String(R));
    assert.deepEqual(s.fraction.den.map((id) => L.boxOf(s, id).digit).join(''), String(B));
    for (const id of s.fraction.num) assert.equal(boxAt(s, id).half, 'top');
    for (const id of s.fraction.den) assert.equal(boxAt(s, id).half, 'bottom');
    assert.ok(!s.cells.some((c) => c.key === 'rlabel'), 'no R');
    assert.deepEqual(s.steps.slice(-2).map((x) => x.kind), ['fraction', 'fraction']);
  }
});

test('remainders as a fraction: simplifying is up to the student; a fraction that is not equal is wrong', () => {
  const s = L.divideSheet({ dividend: 30, divisor: 4, form: 'fraction' }); // 7 2/4
  assert.equal(s.answer, '7 2/4');
  const base = L.correctValues(s);
  const put = (num, den) => {
    const v = { ...base };
    s.fraction.num.forEach((id, k) => (v[id] = num.padStart(s.fraction.num.length, ' ')[k].trim()));
    s.fraction.den.forEach((id, k) => (v[id] = den.padStart(s.fraction.den.length, ' ')[k].trim()));
    return v;
  };
  assert.ok(L.allRight(s, put('2', '4')), '2/4');
  assert.ok(L.allRight(s, put('1', '2')), '1/2 (simplified)');
  assert.ok(!L.allRight(s, put('3', '4')), '3/4');
  assert.ok(!L.allRight(s, put('2', '3')), '2/3');
  assert.ok(L.isWrong(s, put('3', '4'), s.fraction.num[0]), 'a top that no equal fraction has is marked');
  // two-digit parts, simplified into fewer digits: the box in front may stay empty
  const t = L.divideSheet({ dividend: 112, divisor: 15, form: 'fraction' }); // 7 7/15
  assert.equal(t.answer, '7 7/15');
  const u = L.divideSheet({ dividend: 102, divisor: 15, form: 'fraction' }); // 6 12/15 = 6 4/5
  const v = L.correctValues(u);
  v[u.fraction.num[0]] = ''; v[u.fraction.num[1]] = '4'; v[u.fraction.den[0]] = ''; v[u.fraction.den[1]] = '5';
  assert.ok(L.allFilled(u, v) && L.allRight(u, v), '6 4/5 for 6 12/15');
  assert.equal(gcd(12, 15), 3);
});

test('remainders as a decimal: a point and zeros on the end, brought down box by box, to 2 places at most', () => {
  const r = rng(11);
  for (let n = 0; n < 400; n++) {
    const B = 2 + Math.floor(r() * (n % 4 ? 8 : 40)), A = Math.max(B, 10 + Math.floor(r() * 9990));
    const s = L.divideSheet({ dividend: A, divisor: B, form: 'decimal' });
    const what = `${A} ÷ ${B}`;
    const hundredths = Math.floor((A * 100) / B);
    const exact = (A * 100) % B === 0;
    const want = A % B === 0 ? String(A / B) : N.asText(hundredths, 2).replace(/0$/, (z) => ((A * 10) % B === 0 ? '' : z));
    assert.equal(s.answer, exact ? want : `${want}…`, what);
    assert.equal(quotientText(s), want, `${what}: the quotient's boxes`);
    assert.ok(L.allRight(s, L.correctValues(s)), what);
    if (A % B === 0) { assert.ok(!s.steps.some((x) => x.kind === 'point'), `${what}: whole, no point`); continue; }
    const kinds = s.steps.map((x) => x.kind);
    const p = kinds.indexOf('point');
    assert.deepEqual(kinds.slice(p, p + 3), ['point', 'point', 'bringDown'], `${what}: write .0, lift the point, bring down the 0`);
    assert.deepEqual(s.steps[p].boxes.map((id) => L.boxOf(s, id).digit), ['.', 0]);
    assert.deepEqual(s.steps[p + 1].boxes.map((id) => L.boxOf(s, id).digit), ['.']);
    const np = boxAt(s, 'np'), qp = boxAt(s, 'qp');
    assert.equal(np.col, qp.col, 'the point lifted straight up');
    assert.ok(s.cells.some((c) => c.kind === 'arrow' && c.after === 'qp' && c.toRow < c.row), 'an arrow up beside the lifted point');
    const downs = s.steps.filter((x) => x.kind === 'bringDown').length;
    assert.equal(s.cells.filter((c) => c.kind === 'arrow' && c.toRow > c.row).length, downs, 'an arrow for each bring-down, the zeros too');
    if (!exact) {
      const rounded = N.asText(Math.round((A * 100) / B), 2);
      assert.ok(s.note.includes(`it’s ${rounded}`), `${what}: rounds to ${rounded} (${s.note})`);
    } else assert.equal(s.note, undefined);
  }
  // 745 ÷ 6 = 124.1666…: stops at 2 places
  const s = L.divideSheet({ dividend: 745, divisor: 6, form: 'decimal' });
  assert.equal(s.answer, '124.16…');
  assert.match(s.note, /stop at 2 decimal places.*nearest hundredth, it’s 124\.17/);
  assert.equal(L.divideSheet({ dividend: 745, divisor: 4, form: 'decimal' }).answer, '186.25');
  assert.equal(L.divideSheet({ dividend: 27, divisor: 6, form: 'decimal' }).answer, '4.5');
});

test('remainders: the ladder and the area model write a fraction beside the quotient; simplified is right too', () => {
  for (const method of ['ladder', 'area']) {
    const v = M.watchValues(method, 'divide', [30, 4], 'fraction');
    const w = M.buildWork(method, 'divide', [30, 4], v, 'fraction');
    assert.equal(w.answer, '7 2/4');
    assert.deepEqual([v.remainder, v.den], ['2', '4']);
    assert.ok(M.allRight(w, v) && M.checkWork(w, v).right, method);
    const s = { ...v, remainder: '1', den: '2' };
    const ws = M.buildWork(method, 'divide', [30, 4], s, 'fraction');
    assert.ok(M.allRight(ws, s) && M.checkWork(ws, s).right, `${method}: 1/2`);
    const bad = { ...v, remainder: '2', den: '3' };
    const wb = M.buildWork(method, 'divide', [30, 4], bad, 'fraction');
    assert.deepEqual(M.checkWork(wb, bad).wrong, ['den'], `${method}: 2/3`);
    // nothing left over: no fraction
    const e = M.watchValues(method, 'divide', [28, 4], 'fraction');
    const we = M.buildWork(method, 'divide', [28, 4], e, 'fraction');
    assert.equal(we.answer, '7');
    assert.ok(!we.fields.some((f) => f.role === 'remainder' || f.role === 'denominator'));
    assert.ok(M.checkWork(we, e).right);
  }
});
