// The 1.4.0 market graphs (docs/figures-api.md "Economics (1.4.0)"): supply and demand, whose equilibria, a control's
// quantities, a tax's prices and every shaded area are worked out from the curves (checked here against the algebra of
// straight lines and a schedule), and the money markets, whose rates move the way each shift moves them; data that
// cannot be drawn truthfully is refused; print is grays, hatching and names; hide leaves the answer out; the words are
// in the reader's language; and each kind's generator passes the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkEconGenerator } from './_econ-gens.js';
const OF = globalThis.OombaFigures;
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not ${b}`);
const LINES = { demand: { at: 10, slope: -0.1 }, supply: { at: 2, slope: 0.1 } };   // P = 10 - Q/10 and P = 2 + Q/10: Q* = 40, P* = 6

test('supply and demand: the equilibrium, a shift, the surplus areas and a tax come from the curves, exactly', () => {
  let r = OF.solve.supplyDemand({ ...LINES, shade: ['cs', 'ps'] });
  basics(assert, OF, 'supplyDemand', { ...LINES, shade: ['cs', 'ps'] });
  near(r.equilibrium.quantity, 40, 'Q*'); near(r.equilibrium.price, 6, 'P*'); near(r.cs, 80, 'CS = 1/2 x 40 x 4'); near(r.ps, 80, 'PS = 1/2 x 40 x 4');
  r = OF.solve.supplyDemand({ ...LINES, shift: { demand: 20 } });
  near(r.after.quantity, 50, 'demand 20 to the right'); near(r.after.price, 7, 'the price rises to 7');
  const t = { ...LINES, tax: { type: 'tax', amount: 2 }, shade: ['cs', 'ps', 'dwl', 'revenue'] };
  r = OF.solve.supplyDemand(t);
  near(r.tax.quantity, 30, 'Q with the tax'); near(r.tax.buyers, 7, 'buyers pay 7'); near(r.tax.sellers, 5, 'sellers keep 5');
  near(r.revenue, 60, 'revenue 2 x 30'); near(r.dwl, 10, 'DWL 1/2 x 10 x 2'); near(r.cs, 45, 'CS 1/2 x 30 x 3'); near(r.tax.buyersShare, 1, 'buyers pay half of it');
  const { s, p } = basics(assert, OF, 'supplyDemand', t);
  for (const k of ['cs', 'ps', 'dwl', 'revenue']) { assert.equal(count(s, new RegExp(`class="of-region of-${k}"`, 'g')), 1, k); assert.equal(count(p, new RegExp(`of-hatch-${k}`, 'g')), 1, `${k} is hatched in print`); }
  r = OF.solve.supplyDemand({ ...LINES, tax: { type: 'subsidy', amount: 2 }, shade: ['dwl'] });
  near(r.tax.quantity, 50, 'a subsidy: more is traded'); near(r.tax.buyers, 5, 'buyers pay less'); near(r.dwl, 10, 'its deadweight loss');
});

test('supply and demand: a ceiling makes a shortage and a floor a surplus, read off the curves; a schedule is exact', () => {
  let r = OF.solve.supplyDemand({ ...LINES, control: { type: 'ceiling', at: 5 }, shade: ['dwl'] });
  assert.equal(r.control.binding, true); near(r.control.qd, 50, 'Qd'); near(r.control.qs, 30, 'Qs'); near(r.control.shortage, 20, 'shortage'); near(r.dwl, 10, 'DWL'); near(r.quantity, 30, 'only Qs is sold');
  r = OF.solve.supplyDemand({ ...LINES, control: { type: 'floor', at: 7 } });
  near(r.control.surplus, 20, 'a floor at 7: a surplus of 20');
  assert.equal(OF.solve.supplyDemand({ ...LINES, control: { type: 'ceiling', at: 8 } }).control.binding, false, 'a ceiling above P* does not bind');
  const sched = { schedule: [[1, 800, 400], [1.5, 700, 500], [2, 600, 600], [2.5, 500, 700], [3, 400, 800]], control: { type: 'ceiling', at: 1.5 }, shade: ['cs', 'ps', 'dwl'] };
  r = OF.solve.supplyDemand(sched);
  near(r.equilibrium.price, 2, 'P*'); near(r.equilibrium.quantity, 600, 'Q*'); near(r.control.shortage, 200, 'shortage');
  near(r.cs, 1125, 'CS under the demand run on to the price axis'); near(r.ps, 525, 'PS over the supply run on to the quantity axis'); near(r.dwl, 50, 'DWL');
  basics(assert, OF, 'supplyDemand', sched);
  // schematic: the shifts go the textbook way
  const up = OF.solve.supplyDemand({ shift: { demand: 'increase' } }), down = OF.solve.supplyDemand({ shift: { supply: 'decrease' } });
  assert.ok(up.priceChange > 0 && up.quantityChange > 0); assert.ok(down.priceChange > 0 && down.quantityChange < 0);
  assert.ok(OF.solve.supplyDemand({ supply: 'vertical', shift: { demand: 'increase' } }).quantityChange === 0, 'upright supply: the quantity cannot change');
});

test('supply and demand: what cannot be drawn is refused; hide, print and the reader\'s words', () => {
  const bad = [{ demand: 'vertical', supply: 'vertical' }, { demand: { at: 10, slope: 0.1 }, supply: { at: 2, slope: 0.1 } }, { ...LINES, tax: { type: 'tax', amount: 1 }, control: { type: 'ceiling', at: 5 } },
    { demand: 'vertical', shade: ['cs'] }, { ...LINES, colour: 'red' }, { schedule: [[1, 400, 400], [2, 500, 500]] }, { demand: { at: 10, slope: 0 }, supply: { at: 2, slope: 0.1 }, shift: { demand: 5 } },
    { shift: { demand: 'up' } }, { ...LINES, x: [0, 10] }, { ...LINES, shade: ['revenue'] }, { demand: 'normal', supply: { at: 2, slope: 0.1 } }, { ...LINES, tax: { type: 'tax', amount: 9 } }];
  for (const d of bad) { assert.ok(OF.check('supplyDemand', d).length, JSON.stringify(d)); assert.match(OF.svg('supplyDemand', d), /cannot be drawn/); }
  const d = { ...LINES, shift: { demand: 20 }, shade: ['cs'] };
  assert.match(OF.svg('supplyDemand', d), /Q<tspan[^>]*>e<\/tspan>|class="of-mark"/);
  assert.equal(count(OF.svg('supplyDemand', d, { hide: 'after' }), /of-after/g), 0, 'hide "after": the new curve is the student\'s to draw');
  assert.equal(count(OF.svg('supplyDemand', d, { hide: 'areas' }), /of-region/g), 0);
  assert.ok(count(OF.svg('supplyDemand', d, { hide: 'values' }), /class="of-blank"/g) >= 4, 'the values at the axes are lines to write on');
  assert.doesNotMatch(OF.svg('supplyDemand', d, { hide: 'values' }), / = 6\b/);
  assert.equal(count(OF.svg('supplyDemand', d, { hide: 'names' }), /class="of-blank"/g), 3, 'D1, D2 and S are lines to write on');
  assert.match(OF.svg('supplyDemand', {}, { lang: 'de' }), /Menge/); assert.match(OF.svg('supplyDemand', { control: { type: 'ceiling', at: 0.3 } }, { lang: 'es' }), /Precio máximo/);
  assert.match(OF.svg('supplyDemand', {}, { lang: 'he' }), /כמות/);
});

test('the money markets: each shift moves the rate the way it should, on every graph', () => {
  const m = d => OF.solve.moneyMarket(d);
  assert.equal(m({ shift: { supply: 'increase' } }).rateChange, -1, 'more money: a lower nominal rate');
  assert.equal(m({ shift: { demand: 'increase' } }).rateChange, 1);
  assert.equal(m({ shift: { supply: 'increase', demand: 'increase' } }).rateChange, 0, 'equal shifts: the rate ends where it started');
  assert.equal(m({ shift: { supply: 1, demand: 1 } }).rateMove, 2, 'a generator\'s 1 and -1, and the answer 1, 2 or 3');
  const f = m({ graph: 'funds', shift: { demand: 'increase' } });
  assert.equal(f.rateChange, 1); assert.equal(f.quantityChange, 1, 'crowding out: a higher real rate, more lent');
  const a = m({ graph: 'reserves', regime: 'ample', shift: { supply: 'increase' } });
  assert.equal(a.rateChange, 0, 'ample reserves: more reserves leave the rate where it is'); assert.equal(a.quantityChange, 1);
  assert.equal(m({ graph: 'reserves', regime: 'ample', shift: { demand: 'decrease' } }).rateChange, -1, 'lower administered rates');
  assert.equal(m({ graph: 'reserves', regime: 'limited', shift: { supply: 'increase' } }).rateChange, -1, 'limited reserves: the rate falls');
  for (const d of [{}, { graph: 'funds' }, { graph: 'reserves', regime: 'limited', shift: { demand: 'increase' } }]) basics(assert, OF, 'moneyMarket', d);
  for (const d of [{ graph: 'stocks' }, { regime: 'ample' }, { shift: { supply: 'up' } }, { shift: { supply: 2 } }, { graph: 'money', x: [0, 5] }]) { assert.ok(OF.check('moneyMarket', d).length, JSON.stringify(d)); assert.match(OF.svg('moneyMarket', d), /cannot be drawn/); }
  const d = { shift: { supply: 'increase' } };
  assert.equal(count(OF.svg('moneyMarket', d, { hide: 'after' }), /of-after/g), 0);
  assert.match(OF.svg('moneyMarket', d, { lang: 'fr' }), /Taux d&#39;intérêt nominal/); assert.match(OF.svg('moneyMarket', { graph: 'funds' }, { lang: 'ja' }), /実質利子率/);
});

for (const g of ['supplyDemand', 'moneyMarket']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkEconGenerator(assert, g));
