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
// (a point is on the line after its square's digit)
const across = (s, id) => boxAt(s, id).col + (boxAt(s, id).point ? 0.5 : 0);
const quotientText = (s) => s.answerBoxes.filter((id) => id[0] === 'q').sort((a, b) => across(s, a) - across(s, b)).map((id) => L.boxOf(s, id).digit).join('');

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

// ---------------------------------------------------------------- decimals: ÷ and ×

test('decimal numbers: places, shifting the point, and writing hundredths, without floating point', () => {
  assert.deepEqual([N.placesOf(12.6), N.placesOf(7), N.placesOf(0.25), N.placesOf(1e-7)], [1, 0, 2, 99]);
  assert.deepEqual([N.scaled(12.6, 1), N.scaled(0.3, 1), N.scaled(4.35, 2), N.scaled(4.5, 2)], [126, 3, 435, 450]);
  assert.deepEqual([N.shiftPoint(4.5, 1), N.shiftPoint(4.56, 1), N.shiftPoint(4.5, 2), N.shiftPoint(0.84, 1), N.shiftPoint(0.05, 1), N.shiftPoint(6, 1)], ['45', '45.6', '450', '8.4', '0.5', '60']);
  assert.deepEqual([N.asText(5, 2), N.asText(312, 2), N.asText(300, 2), N.asText(7, 0)], ['0.05', '3.12', '3.00', '7']);
});

/** The exact quotient of two decimals, written out, from whole numbers (no floating point). */
function exactQuotient(a, b) {
  const k = Math.max(N.placesOf(a), N.placesOf(b));
  const A = N.scaled(a, k), B = N.scaled(b, k);
  for (let p = 0; p <= 2; p++) if ((A * 10 ** p) % B === 0) return N.asText((A * 10 ** p) / B, p);
  return null;
}

test('decimal division: the point lifted straight up into the quotient, as a step, first', () => {
  for (const [a, b, want] of [[7.5, 3, '2.5'], [12.6, 4, '3.15'], [0.84, 4, '0.21'], [1.5, 6, '0.25'], [55.6, 0.5, '111.2']]) {
    const s = L.sheetFor(L.parseItem({ k: 'divide', p: [[a, b]], l: 'guided', dec: 1 }), [a, b]);
    assert.equal(s.answer, want, `${a} ÷ ${b}`);
    assert.equal(quotientText(s), want);
    assert.ok(L.allRight(s, L.correctValues(s)));
    const lift = s.steps.findIndex((x) => x.kind === 'point' && x.boxes.includes('qp'));
    assert.ok(lift >= 0, 'a step lifts the point');
    // (55.6 ÷ 0.5 is 556 ÷ 5 once both points move: its point comes when a 0 is written)
    if (Number.isInteger(b)) assert.ok(!s.steps.slice(0, lift).some((x) => x.kind === 'divide'), 'before any dividing');
    const pt = s.cells.find((c) => c.key === 'np' || c.id === 'np');
    assert.equal(boxAt(s, 'qp').col, pt.col, 'straight up');
    assert.ok(s.cells.some((c) => c.kind === 'arrow' && c.after === 'qp'), 'with its arrow');
  }
  // 12.6 ÷ 4: a 0 written on the end and brought down to finish it
  const s = L.divideSheet({ dividend: 12.6, divisor: 4 });
  assert.deepEqual(s.steps.map((x) => x.kind).filter((k) => k === 'addZero' || k === 'point'), ['point', 'addZero']);
});

test('decimal divisors: both points move the same number of places first (×10, ×100), shown with hops, then divide', () => {
  for (const [a, b, A, B, want] of [[4.5, 0.3, '45', 3, '15'], [4.5, 0.25, '450', 25, '18'], [6, 0.4, '60', 4, '15'], [4.56, 0.3, '45.6', 3, '15.2'], [1.25, 0.5, '12.5', 5, '2.5']]) {
    const s = L.divideSheet({ dividend: a, divisor: b });
    const what = `${a} ÷ ${b}`;
    assert.equal(s.answer, want, what);
    assert.deepEqual(s.steps.slice(0, 2).map((x) => x.kind), ['shift', 'shift'], `${what}: the divisor, then the dividend`);
    assert.equal(s.steps[0].boxes.map((id) => L.boxOf(s, id).digit).join(''), String(B));
    assert.equal(s.steps[1].boxes.map((id) => L.boxOf(s, id).digit).join(''), A);
    assert.match(s.steps[0].prompt({}), new RegExp(`Move its point ${N.placesOf(b)} place`));
    assert.match(s.steps[1].prompt({}), new RegExp(`the same ${N.placesOf(b)} place`));
    const hops = s.cells.filter((c) => c.kind === 'hop');
    assert.equal(hops.length, 2, `${what}: a hop over each number`);
    for (const h of hops) assert.equal(h.to - h.from, N.placesOf(b), 'as many places as the divisor has');
    assert.ok(L.allRight(s, L.correctValues(s)), what);
  }
  assert.ok(L.divideSheet({ dividend: 4.5, divisor: 0.25 }).cells.some((c) => c.kind === 'given' && c.row === 0 && c.text === '0' && c.faint), '4.5 → 450: the 0 that fills the empty place');
});

test('decimal division: problems made from the plan come out exactly, to hundredths, and each works', () => {
  const gen = L.kindInfo('divide').settings.generate;
  const r = rng(5);
  for (const plan of [{ dividends: [10, 99], divisors: [2, 5] }, { dividends: [100, 999], divisors: [2, 9] }, { dividends: [1000, 9999], divisors: [11, 25] }]) {
    const ps = gen({ count: 40, remainders: 'R', numbers: 'decimal', ...plan }, r);
    assert.ok(ps.length >= 30, `${JSON.stringify(plan)}: ${ps.length} made`);
    assert.ok(ps.some(([, b]) => !Number.isInteger(b)), 'some divisors with a point');
    assert.ok(ps.some(([a, b]) => !Number.isInteger(a) && Number.isInteger(b)), 'some dividends with a point');
    for (const [a, b] of ps) {
      assert.equal(L.checkDivide(a, b, 'decimal'), null, `${a} ÷ ${b}`);
      const s = L.divideSheet({ dividend: a, divisor: b, form: 'decimal' });
      assert.equal(s.answer, exactQuotient(a, b), `${a} ÷ ${b}: exact`);
      assert.ok(L.allRight(s, L.correctValues(s)));
    }
  }
});

test('decimal multiplication: multiply as whole numbers, then count the places and put the point, as a step', () => {
  for (const [a, b, want, P] of [[2.4, 1.3, '3.12', 2], [0.6, 4, '2.4', 1], [12.5, 0.4, '5.00', 2], [3.25, 2.6, '8.450', 3], [0.2, 0.3, '0.06', 2], [35.6, 7, '249.2', 1]]) {
    const s = L.decimalMultiplySheet({ top: a, bottom: b });
    const what = `${a} × ${b}`;
    assert.equal(s.answer, want, what);
    const last = s.steps.at(-1);
    assert.equal(last.kind, 'point');
    assert.deepEqual(last.boxes, ['dp']);
    assert.equal(L.boxOf(s, 'dp').digit, P, `${what}: ${P} decimal places`);
    assert.ok(s.answerBoxes.includes('dp'));
    assert.match(s.steps[0].prompt({}), /Multiply as if there were no points/);
    // the point where the count puts it: P places from the right, on the line (a dot), shown once the count is in
    const dot = s.cells.find((c) => c.kind === 'given' && c.dot && c.after === 'dp' && c.when === String(P));
    assert.ok(dot, `${what}: a point for the right count`);
    assert.equal(s.cols - 1 - dot.col, P, `${what}: ${P} places from the right`);
    assert.ok(L.allRight(s, L.correctValues(s)), what);
    if (want.endsWith('0')) assert.match(s.note, /is the same as/);
  }
  // as whole numbers, the sheet is the multiplication it always was
  assert.equal(L.decimalMultiplySheet({ top: 46, bottom: 23 }).answer, '1058');
  assert.deepEqual(L.decimalMultiplySheet({ top: 46, bottom: 23 }).steps.map((x) => x.kind), L.multiplySheet({ top: 46, bottom: 23 }).steps.map((x) => x.kind));
  // made from the plan: points placed in the plan's sizes, and every answer right
  const ps = L.kindInfo('multiply').settings.generate({ count: 40, tops: [10, 999], bottoms: [2, 99], numbers: 'decimal' }, rng(3));
  assert.ok(ps.length >= 30);
  for (const [a, b] of ps) {
    assert.equal(L.checkMultiply(a, b, 'decimal'), null);
    const P = N.placesOf(a) + N.placesOf(b);
    assert.equal(L.decimalMultiplySheet({ top: a, bottom: b }).answer, N.asText(N.scaled(a, N.placesOf(a)) * N.scaled(b, N.placesOf(b)), P), `${a} × ${b}`);
  }
});

test('decimals: typed problems take decimals only when Numbers is decimals; the item says so with dec, and old items are unchanged', () => {
  assert.equal(L.checkDivide(7.5, 3), 'The number to divide needs two to six digits, 10 to 999,999.');
  assert.equal(L.checkDivide(7.5, 3, 'decimal'), null);
  assert.equal(L.checkDivide(12, 5, 'decimal'), null, 'whole problems too');
  assert.match(L.checkDivide(7.555, 3, 'decimal'), /at most 2 decimal places/);
  assert.match(L.checkDivide(7.5, 0.1, 'decimal'), /2 to 9,999/);
  assert.equal(L.checkMultiply(2.4, 1.3, 'decimal'), null);
  assert.match(L.checkMultiply(2.4, 13.5, 'decimal'), /more digits goes on top/);
  assert.deepEqual(L.validProblems([[7.5, 3], [92, 4]], 'divide'), [[92, 4]]);
  assert.deepEqual(L.validProblems([[7.5, 3], [92, 4]], 'divide', 'decimal'), [[7.5, 3], [92, 4]]);
  const it = { k: 'divide', p: [[7.5, 3], [4.5, 0.3]], l: 'guided', dec: 1 };
  const a = L.parseItem(it);
  assert.equal(a.plan.numbers, 'decimal');
  assert.equal(L.formOf(a), 'decimal', 'division answers are decimals');
  assert.deepEqual(L.toItem(a), it);
  // decimals: the standard method, or the ladder or area model for a whole divisor (round 2: a decimal divisor's problem
  // is dropped there), and multiplication's partial products fall back to the standard method
  const lad = L.parseItem({ ...it, m: 'ladder' });
  assert.equal(lad.settings.method, 'ladder');
  assert.deepEqual(lad.problems, [[7.5, 3]]);
  assert.equal(L.parseItem({ k: 'multiply', p: [[2.4, 1.3]], l: 'guided', dec: 1, m: 'partial' }).settings.method, 'standard', 'decimals: no partial products');
  assert.equal(L.parseItem({ k: 'divide', p: [[7.5, 3]], l: 'guided' }), null, 'no dec: a decimal problem is not one');
});

test('the server takes exactly the problems the game does, decimals (dec) and every kind, and nothing else', async () => {
  const gameSets = await import(path.join(ROOT, 'server/services/game-sets.js'));
  const r = rng(9);
  const pick = () => { const k = Math.floor(r() * 4); const n = Math.floor(r() * 100000) / [1, 10, 100, 1000][k]; return r() < 0.1 ? -n : n; };
  for (let i = 0; i < 4000; i++) {
    for (const kind of ['divide', 'multiply', 'add', 'subtract']) {
      const a = r() < 0.5 ? pick() : Math.floor(r() * 2000), b = r() < 0.5 ? pick() / 100 : Math.floor(r() * (kind === 'add' || kind === 'subtract' ? 3000 : 30));
      const game = L.kindInfo(kind).check(a, b, 'decimal') === null;
      const server = gameSets.cleanBoxItems([{ k: kind, p: [[a, b]], l: 'guided', dec: 1 }]) !== null;
      assert.equal(server, game, `${kind} ${a}, ${b}`);
      const wa = Math.floor(r() * 12000), wb = Math.floor(r() * 12000);
      assert.equal(gameSets.cleanBoxItems([{ k: kind, p: [[wa, wb]], l: 'guided' }]) !== null, L.kindInfo(kind).check(wa, wb) === null, `${kind} ${wa}, ${wb} (whole)`);
    }
  }
});

// ---------------------------------------------------------------- addition and subtraction

const C = await import(path.join(ROOT, 'tools/box-by-box/src/lib/columns.ts'));
const digitsOf = (s, prefix) => s.boxes.filter((b) => b.id.startsWith(prefix));

test('addition: each column from the right, a 1 carried over the next column, the last carry written in the answer', () => {
  const s = C.addSheet({ top: 475, bottom: 368 });
  assert.equal(s.answer, '843');
  assert.deepEqual(s.steps.map((x) => x.kind), ['add', 'carry', 'add', 'carry', 'add']);
  assert.deepEqual(s.steps.map((x) => x.prompt({})), ['What is 5 + 8?', '13 ones is 1 ten and 3 ones: carry the 1 to the tens, up here.', 'What is 7 + 6 + the 1 you carried?', '14 tens is 1 hundred and 4 tens: carry the 1 to the hundreds, up here.', 'What is 4 + 3 + the 1 you carried?']);
  for (const c of digitsOf(s, 'c')) assert.equal(boxAt(s, c.id).small, true, 'carries are small, over the next column');
  assert.equal(boxAt(s, 'c1').col, s.cells.find((c) => c.key === 't1').col);
  assert.equal(boxAt(s, 'c1').row, 0);
  const t = C.addSheet({ top: 95, bottom: 17 }); // 112: the last carry goes straight into the answer
  assert.equal(t.answer, '112');
  assert.equal(t.steps.at(-1).prompt({}), 'Write the 1 you carried.');
  assert.equal(digitsOf(t, 'c').length, 1);
  // every problem, against the sum worked out
  const r = rng(21);
  for (let n = 0; n < 500; n++) {
    const a = 10 + Math.floor(r() * 9990), b = 10 + Math.floor(r() * 9990);
    const s2 = C.addSheet({ top: a, bottom: b });
    assert.equal(s2.answer, String(a + b), `${a} + ${b}`);
    assert.equal(s2.answerBoxes.map((id) => L.boxOf(s2, id).digit).join(''), String(a + b));
    assert.ok(L.allRight(s2, L.correctValues(s2)));
    // a carry box exactly where a column made 10 or more and another column follows
    let carries = 0;
    for (let p = 0, c = 0; p < 4; p++) {
      const sum = (Math.floor(a / 10 ** p) % 10) + (Math.floor(b / 10 ** p) % 10) + c;
      c = sum >= 10 ? 1 : 0;
      if (c && (a >= 10 ** (p + 1) || b >= 10 ** (p + 1))) carries++;
    }
    assert.equal(digitsOf(s2, 'c').length, carries, `${a} + ${b}: the carries`);
  }
});

test('subtraction: regrouping crosses out and writes the new digit, a small 1 in front; across zeros, 400 − 167', () => {
  const s = C.subtractSheet({ top: 400, bottom: 167 });
  assert.equal(s.answer, '233');
  assert.deepEqual(s.steps.map((x) => [x.kind, x.boxes.map((id) => L.boxOf(s, id).digit).join('')]), [
    ['borrow', '3'], // the 4 hundreds become 3
    ['borrow', '1'], // the 0 tens become 10
    ['borrow', '9'], // then 9
    ['borrow', '1'], // the ones 0 becomes 10
    ['subtract', '3'], ['subtract', '3'], ['subtract', '2']
  ]);
  const crossed = s.cells.filter((c) => c.kind === 'given' && c.crossBy).map((c) => [c.key, c.crossBy]).sort();
  assert.deepEqual(crossed, [['t1', 'w1'], ['t2', 'w2']], 'the 4 and the tens 0, each crossed by the digit written over it');
  assert.deepEqual(s.crossedBy, { o1: 'w1' }, 'the small 1 that made 10 tens, crossed out with it');
  assert.equal(boxAt(s, 'o0').corner, true);
  assert.equal(boxAt(s, 'o0').row, 1, 'in front of the 0 itself');
  // 532 − 148: the tens lend, then borrow themselves: the small 1 goes in front of the new digit
  const t = C.subtractSheet({ top: 532, bottom: 148 });
  assert.equal(t.answer, '384');
  assert.equal(boxAt(t, 'o1').row, 0, 'in front of the 2 written over the 3');
  assert.equal(t.steps.find((x) => x.boxes.includes('a1')).prompt({}), 'What is 12 − 4?');
  // 400 − 367 = 33: no box for a zero in front
  assert.deepEqual(C.subtractSheet({ top: 400, bottom: 367 }).answerBoxes, ['a1', 'a0']);
  // every problem, against the difference worked out, and the regrouping rules
  const r = rng(23);
  for (let n = 0; n < 800; n++) {
    let a = 10 + Math.floor(r() * 9990), b = 10 + Math.floor(r() * 9990);
    if (n % 5 === 0) a = [100, 1000, 4000, 5003, 9000][n % 25 / 5 | 0];
    if (a <= b) [a, b] = [b + 1, a];
    if (a > 9999) continue;
    const s2 = C.subtractSheet({ top: a, bottom: b });
    assert.equal(s2.answer, String(a - b), `${a} − ${b}`);
    assert.equal(Number(s2.answerBoxes.map((id) => L.boxOf(s2, id).digit).join('')), a - b);
    assert.ok(L.allRight(s2, L.correctValues(s2)));
    for (const st of s2.steps.filter((x) => x.kind === 'borrow')) {
      const id = st.boxes[0];
      const v = L.boxOf(s2, id).digit;
      if (id[0] === 'o') assert.equal(v, 1, 'a small 1 in front');
      else assert.ok(v >= 0 && v <= 9, 'a digit over a crossed-out one');
    }
    // each digit crossed out once at most, and only ever by the digit written over it
    for (const c of s2.cells.filter((x) => x.kind === 'given' && x.crossBy)) assert.equal(boxAt(s2, c.crossBy).col, c.col);
  }
});

test('addition and subtraction with decimals: the points line up, padded with faint zeros, and come straight down', () => {
  const s = C.addSheet({ top: 3.5, bottom: 2.75 });
  assert.equal(s.answer, '6.25');
  assert.ok(s.cells.some((c) => c.kind === 'given' && c.key === 't0' && c.text === '0' && c.faint), '3.5 is 3.50');
  const pts = s.cells.filter((c) => c.text === '.' || c.id === 'ap');
  assert.equal(new Set(pts.map((c) => c.col)).size, 1, 'one column for the points');
  assert.ok(s.steps.some((x) => x.kind === 'point' && x.boxes[0] === 'ap'));
  for (const [k, a, b, want] of [['add', 0.5, 0.25, '0.75'], ['add', 35.6, 7.25, '42.85'], ['subtract', 5.2, 1.75, '3.45'], ['subtract', 10.05, 2.5, '7.55'], ['subtract', 40, 16.3, '23.7'], ['subtract', 1, 0.25, '0.75']]) {
    const t = (k === 'add' ? C.addSheet : C.subtractSheet)({ top: a, bottom: b });
    assert.equal(t.answer, want, `${a} ${k} ${b}`);
    assert.ok(L.allRight(t, L.correctValues(t)));
  }
  assert.equal(C.checkColumns('add', 3.5, 2.75), 'Whole numbers, 10 to 9,999.');
  assert.equal(C.checkColumns('add', 3.5, 2.75, 'decimal'), null);
  assert.match(C.checkColumns('subtract', 2.75, 3.5, 'decimal'), /bigger/);
  assert.match(C.checkColumns('add', 5, 30), /two to four digits/);
  // problems from a plan: within the ranges, the bigger on top, a point in each with decimals
  for (const kind of ['add', 'subtract'])
    for (const numbers of ['whole', 'decimal']) {
      const ps = L.kindInfo(kind).settings.generate({ count: 30, tops: [100, 999], bottoms: [10, 999], ...(numbers === 'decimal' ? { numbers } : {}) }, rng(4));
      assert.equal(ps.length, 30);
      for (const [a, b] of ps) {
        assert.equal(C.checkColumns(kind, a, b, numbers), null, `${a}, ${b}`);
        if (numbers === 'decimal') assert.ok(N.isDecimal(a) || N.isDecimal(b));
      }
    }
});

test('addition and subtraction: their own items (k add or subtract), the standard method only, old kinds unchanged', () => {
  for (const k of ['add', 'subtract']) {
    const it = { k, p: [[475, 368], [400, 167]], l: 'guided' };
    const a = L.parseItem(it);
    assert.equal(a.kind, k);
    assert.deepEqual(L.toItem(a), it);
    assert.equal(L.parseItem({ ...it, m: 'area' }).settings.method, 'standard');
    assert.deepEqual(L.toItem(L.parseItem({ k, p: [], l: 'onMyOwn', d: 1, g: { count: 12, tops: [100, 999], bottoms: [10, 99] } })), { k, p: [], l: 'onMyOwn', d: 1, g: { count: 12, tops: [100, 999], bottoms: [10, 99] } });
  }
  assert.equal(L.parseItem({ k: 'subtract', p: [[167, 400]], l: 'guided' }), null, 'the smaller on top is not a problem');
  assert.equal(L.parseItem({ k: 'nonsense', p: [[92, 4]], l: 'guided' }).kind, 'divide', 'an unknown kind is long division, as always');
});

test('decimal points sit on the line: the digits side by side, no column of their own, and the minus signs next to their numbers', () => {
  const s = L.divideSheet({ dividend: 745, divisor: 6, form: 'decimal' });
  const qp = boxAt(s, 'qp'), np = boxAt(s, 'np');
  assert.ok(qp.point && np.point && qp.col === np.col, 'the same line, quotient and dividend');
  assert.equal(qp.col, boxAt(s, 'q2').col, 'on the line after the 4 of 124');
  assert.equal(boxAt(s, 'q3').col, qp.col + 1, 'the next digit in the very next column');
  // every row's digits are in adjacent columns, and each minus sits right before its number
  const rows = new Map();
  for (const c of s.cells) if (c.kind === 'box' && !c.point && c.row > 1) rows.set(c.row, [...(rows.get(c.row) ?? []), c.col]);
  for (const [r, cols] of rows) { cols.sort((a, b) => a - b); cols.forEach((c, i) => i && assert.equal(c, cols[i - 1] + 1, `row ${r}: no gap`)); }
  for (const m of s.cells.filter((c) => c.kind === 'given' && c.text === '−')) {
    const first = Math.min(...s.cells.filter((c) => c.kind === 'box' && c.row === m.row).map((c) => c.col));
    assert.equal(m.col, first - 1, `row ${m.row}: the minus right before its number`);
  }
  for (const [k, a, b] of [['add', 3.5, 2.75], ['subtract', 5.2, 1.75]]) {
    const t = (k === 'add' ? C.addSheet : C.subtractSheet)({ top: a, bottom: b });
    assert.equal(t.cols, 4, `${a} ${k} ${b}: a sign and three digits, no column for the point`);
    assert.ok(t.cells.filter((c) => c.text === '.').every((c) => c.dot));
  }
});

test('regrouping: a small 1 goes in the corner of a digit set aside for it, clear of any strike', () => {
  const s = C.subtractSheet({ top: 400, bottom: 167 });
  for (const id of ['o0', 'o1']) {
    const o = boxAt(s, id);
    const t = s.cells.find((c) => c.kind === 'given' && c.row === o.row && c.col === o.col);
    assert.ok(o.corner && t.nudge, `${id}: in the corner, its digit nudged over`);
  }
});
