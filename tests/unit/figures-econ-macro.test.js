// The 1.4.0 macroeconomics graphs (docs/figures-api.md "Economics (1.4.0)"): AD-AS, whose equilibria, gaps and "as far
// as closes the gap" shifts are worked out on the curves (and on a numbered schedule); the Phillips curve, whose short-
// run curve goes through A and the second point given and whose long run returns to the natural rate; and the business
// cycle, whose peaks, troughs and recessions are found on the wave as drawn and repeat for a seed. Data that cannot be
// drawn truthfully is refused; print is grays, dashes and names; hide leaves the answer out; the words are in the
// reader's language; and each kind's generator passes the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkEconGenerator } from './_econ-gens.js';
const OF = globalThis.OombaFigures;
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not ${b}`);
const ADAS = [[70, 10000, 6500], [80, 9400, 8000], [90, 8800, 8800], [100, 8200, 9300], [110, 7600, 9600], [120, 7000, 9800], [130, 6400, 9900]];

test('AD-AS: the gaps are what the start asks for, "full" shifts close them on the curves, and a schedule is read exactly', () => {
  const s = d => OF.solve.adAs(d);
  assert.equal(s({}).gapType, 'none'); near(s({ start: 'recession' }).gap, -1.5, 'a medium recessionary gap'); near(s({ start: 'inflation', gap: 'large' }).gap, 2, 'a large inflationary gap');
  let r = s({ start: 'recession', shift: { ad: 'full' } });
  near(r.gapAfter, 0, 'expansionary policy closes the gap', 1e-6); assert.ok(r.priceLevelChange > 0, 'and raises the price level');
  r = s({ start: 'recession', shift: { sras: 'full' } });
  near(r.gapAfter, 0, 'self-adjustment closes it too', 1e-6); assert.ok(r.priceLevelChange < 0, 'with a lower price level');
  r = s({ shift: { sras: 'left' } });
  assert.ok(r.priceLevelChange > 0 && r.gdpChange < 0, 'a negative supply shock: stagflation'); assert.equal(r.gapTypeAfter, 'recessionary');
  r = s({ schedule: ADAS, potential: 9500 });
  near(r.start.gdp, 8800, 'Y on the schedule'); near(r.start.priceLevel, 90, 'PL on the schedule'); near(r.gap, -700, 'gap'); near(r.gapSize, 700, 'its size');
  r = s({ schedule: ADAS, potential: 9500, shift: { ad: 'full' } });
  near(r.end.gdp, 9500, 'a numbered AD shifted to close the gap', 1e-6);
  for (const d of [{ start: 'recession', shift: { ad: 'full' } }, { as: 'three', start: 'recession' }, { schedule: ADAS, potential: 9500 }, { shift: { lras: 'right', sras: 'full' } }]) basics(assert, OF, 'adAs', d);
});

test('AD-AS: refused, hidden, printed and in the reader\'s words', () => {
  const bad = [{ as: 'three', start: 'inflation' }, { shift: { ad: 'full', sras: 'full' } }, { shift: { ad: 'full' } }, { schedule: ADAS }, { schedule: [[90, 8000, 9000], [80, 9000, 8000]], potential: 8500, x: [0, 100] },
    { schedule: ADAS, potential: 9500, gap: 'small' }, { start: 'boom' }, { shift: { lras: 'full' } }];
  for (const d of bad) { assert.ok(OF.check('adAs', d).length, JSON.stringify(d)); assert.match(OF.svg('adAs', d), /cannot be drawn/); }
  const d = { start: 'recession', shift: { ad: 'full' } };
  assert.equal(count(OF.svg('adAs', d, { hide: 'after' }), /of-after/g), 0);
  assert.equal(count(OF.svg('adAs', { start: 'recession' }, { hide: 'gap' }), /class="of-blank"/g), 1, 'the gap\'s name is a line to write on');
  assert.match(OF.svg('adAs', { start: 'recession' }), /Recessionary gap/);
  assert.match(OF.svg('adAs', { start: 'recession' }, { lang: 'de' }), /Rezessionslücke/); assert.match(OF.svg('adAs', {}, { lang: 'ar' }), /المستوى العام للأسعار/);
});

test('the Phillips curve: the short-run curve goes through A and B, the long run returns to the natural rate, and the shifts go the right way', () => {
  const n = { nru: 5, expected: 2, u2: 3, pi2: 6, movement: 'along', longRun: true };
  let r = OF.solve.phillipsCurve(n);
  near(r.A.u, 5, 'A at the natural rate'); near(r.A.inflation, 2, 'and expected inflation'); near(r.B.u, 3, 'B'); near(r.B.inflation, 6, 'B on the short-run curve');
  near(r.C.u, 5, 'C back at the natural rate'); near(r.C.inflation, 6, 'C at B\'s inflation'); near(r.expectedAfter, 6, 'expectations have caught up');
  basics(assert, OF, 'phillipsCurve', n);
  r = OF.solve.phillipsCurve({ nru: 5, expected: 2, u2: 3, pi2: 6, movement: 'srpc', cause: 'shock', expected2: 5, uShock: 6 });
  assert.ok(r.B.u > 5 && r.B.inflation > 2, 'a supply shock: stagflation');
  near(OF.solve.phillipsCurve({ nru: 5, expected: 2, u2: 3, pi2: 6, movement: 'lrpc', nru2: 4 }).nruAfter, 4, 'the natural rate moves');
  const up = OF.solve.phillipsCurve({ movement: 'along', along: 'up' }), down = OF.solve.phillipsCurve({ movement: 'along', along: 'down' });
  assert.ok(up.B.u < up.A.u && up.B.inflation > up.A.inflation, 'up the curve: less unemployment, more inflation');
  assert.ok(down.B.u > down.A.u && down.B.inflation < down.A.inflation);
  const ex = OF.solve.phillipsCurve({ movement: 'srpc', side: 'right', cause: 'expectations' });
  near(ex.B.u, ex.nru, 'higher expected inflation: up the long-run curve'); assert.ok(ex.B.inflation > ex.A.inflation);
  for (const d of [{}, { movement: 'srpc', side: 'right', cause: 'shock' }, { movement: 'lrpc', side: 'left' }, { curvature: 'strong', movement: 'along', longRun: true }]) basics(assert, OF, 'phillipsCurve', d);
  const bad = [{ nru: 5, expected: 2, u2: 7, pi2: 6 }, { nru: 5, expected: 2 }, { movement: 'up' }, { u2: 3 }, { movement: 'along', side: 'left' }, { nru: 5, expected: 2, u2: 3, pi2: 6, movement: 'srpc', cause: 'shock', expected2: 5, uShock: 4 }];
  for (const d of bad) { assert.ok(OF.check('phillipsCurve', d).length, JSON.stringify(d)); assert.match(OF.svg('phillipsCurve', d), /cannot be drawn/); }
  assert.equal(count(OF.svg('phillipsCurve', n, { hide: 'after' }), /class="of-point"/g), 1, 'hide "after": only A');
  assert.ok(count(OF.svg('phillipsCurve', n), /class="of-mark"/g) >= 4); assert.equal(count(OF.svg('phillipsCurve', n, { hide: 'values' }), /class="of-mark"/g), 0, 'no rates written where the guides meet the axes');
  assert.match(OF.svg('phillipsCurve', {}, { lang: 'it' }), /Tasso di disoccupazione/); assert.match(OF.svg('phillipsCurve', {}, { lang: 'zh-Hant' }), /通貨膨脹率/);
});

test('the business cycle: its turns and recessions are found on the wave, the same for the same seed', () => {
  for (const cycles of [1, 2, 3, 4]) for (const seed of [1, 7, 99]) {
    const r = OF.solve.businessCycle({ cycles, start: 'peak', irregularity: 0.5, seed });
    assert.equal(r.recessions, cycles, `${cycles} cycles from a peak: ${cycles} recessions`); assert.equal(r.troughs, cycles); assert.equal(r.peaks, cycles + 1);
  }
  const a = OF.solve.businessCycle({ cycles: 3, irregularity: 1, seed: 5 }), b = OF.solve.businessCycle({ cycles: 3, irregularity: 1, seed: 5 }), c = OF.solve.businessCycle({ cycles: 3, irregularity: 1, seed: 6 });
  assert.deepEqual(a, b, 'a seed repeats'); assert.notDeepEqual(a.turns, c.turns, 'another seed varies');
  const even = OF.solve.businessCycle({ cycles: 2, start: 'peak', trend: 0 });
  near(even.turns[1].x - even.turns[0].x, even.turns[2].x - even.turns[1].x, 'even cycles: the falls and rises take as long');
  assert.deepEqual(OF.solve.businessCycle({ cycles: 2, start: 'peak', trend: 0 }).letters, { A: 'peak', B: 'contraction', C: 'trough', D: 'expansion', E: 'peak', F: 'trough', G: 'peak' });
  for (const d of [{}, { cycles: 2, start: 'peak', shade: true, dots: true, phases: ['expansion', 'contraction', 'recession', 'recovery'] }, { cycles: 3, irregularity: 0.8, seed: 42, style: 'letters' }]) basics(assert, OF, 'businessCycle', d);
  assert.equal(count(OF.svg('businessCycle', { cycles: 2, start: 'peak', shade: true }), /class="of-recession"/g), 2, 'each recession shaded');
  for (const d of [{ cycles: 1, amplitude: 0.5, trend: 0.6 }, { cycles: 1.25 }, { seed: 0 }, { start: 'top' }, { phases: ['boom'] }]) { assert.ok(OF.check('businessCycle', d).length, JSON.stringify(d)); assert.match(OF.svg('businessCycle', d), /cannot be drawn/); }
  assert.ok(count(OF.svg('businessCycle', {}, { hide: 'labels' }), /class="of-blank"/g) >= 4, 'each label a line to write on');
  assert.doesNotMatch(OF.svg('businessCycle', {}, { hide: 'labels' }), />Peak</);
  assert.match(OF.svg('businessCycle', {}, { lang: 'pt' }), /PIB real/); assert.match(OF.svg('businessCycle', {}, { lang: 'ru' }), /Пик/);
});

for (const g of ['adAs', 'phillipsCurve', 'businessCycle']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkEconGenerator(assert, g));
