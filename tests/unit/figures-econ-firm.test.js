// The 1.4.0 firm and production possibilities graphs (docs/figures-api.md "Economics (1.4.0)"): cost curves from one
// cubic total cost, so MC crosses AVC and ATC at their lowest points; a price taker producing where P = MC (or shutting
// down), a monopoly where MR = MC, regulated prices and the long run's tangency; the production possibilities curve's
// points, steps and shifts, and two countries' opportunity costs and comparative advantage. Data that cannot be drawn
// truthfully is refused; print is grays, dashes, hatching and names; hide leaves the answer out; the words are in the
// reader's language; and each kind's generator passes the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkEconGenerator } from './_econ-gens.js';
const OF = globalThis.OombaFigures;
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} is not ${b}`);
const mc = (k, q) => k.a - 2 * k.b * q + 3 * k.c * q * q, avc = (k, q) => k.a - k.b * q + k.c * q * q, atc = (k, q) => avc(k, q) + k.F / q;

test('cost curves: MC crosses ATC and AVC at their lowest points, where the teacher put ATC\'s', () => {
  for (const d of [{}, { atc: { q: 5, cost: 3.5 }, mcSlope: 1, fixed: 0.3 }, { atc: { q: 7.5, cost: 3.25 }, mcSlope: 0.7, fixed: 0.9 }]) {
    const r = OF.solve.costCurves(d), k = r.costs, be = r.breakEven, sd = r.shutdown;
    near(be.q, d.atc ? d.atc.q : 6, 'ATC is lowest where asked', 1e-6); near(be.price, d.atc ? d.atc.cost : 4.5, 'at the cost asked', 1e-6);
    near(mc(k, be.q), atc(k, be.q), 'MC = ATC there', 1e-6); near(mc(k, sd.q), avc(k, sd.q), 'MC = AVC at the shutdown point', 1e-9);
    assert.ok(atc(k, be.q - 0.1) > be.price && atc(k, be.q + 0.1) > be.price, 'and it is the lowest');
    near(atc(k, 3) - avc(k, 3), k.F / 3, 'ATC - AVC = AFC');
    basics(assert, OF, 'costCurves', d);
  }
});

test('cost curves: a price taker, a monopoly, regulation and the long run', () => {
  let r = OF.solve.costCurves({ market: 'perfect', price: 'profit' });
  near(mc(r.costs, r.q), r.price, 'P = MC'); assert.ok(r.profit > 0); near(r.profit, (r.price - atc(r.costs, r.q)) * r.q, 'profit = (P - ATC) q');
  r = OF.solve.costCurves({ market: 'perfect', price: 'loss' });
  assert.ok(r.profit < 0 && r.profit > -r.fixedCost, 'a loss, but less than the fixed cost: it keeps producing');
  r = OF.solve.costCurves({ market: 'perfect', price: 'shutdown' });
  assert.equal(r.shutsDown, true); near(r.profit, -r.fixedCost, 'shut down, it loses its fixed cost');
  r = OF.solve.costCurves({ market: 'perfect', price: 5 });
  near(mc(r.costs, r.q), 5, 'a price typed in');
  const m = { market: 'monopoly', shade: ['profit', 'cs', 'dwl'] };
  r = OF.solve.costCurves(m);
  const d = { top: 9.4, slope: 9.4 / 12 };
  near(d.top - 2 * d.slope * r.q, mc(r.costs, r.q), 'MR = MC'); near(r.price, d.top - d.slope * r.q, 'the price off demand');
  near(r.socialOptimum.price, mc(r.costs, r.socialOptimum.q), 'P = MC at the social optimum'); assert.ok(r.dwl > 0 && r.cs > 0);
  const { s, p } = basics(assert, OF, 'costCurves', m);
  for (const k of ['profit', 'cs', 'dwl']) assert.equal(count(s, new RegExp(`class="of-region of-${k}"`, 'g')), 1, k);
  assert.equal(count(p, /of-hatch-/g), 3, 'each region hatched in print');
  r = OF.solve.costCurves({ market: 'monopoly', regulation: 'fair', atc: { q: 7.5, cost: 3.25 }, mcSlope: 0.7, fixed: 0.9, demand: { top: 9.6, end: 7.4 } });
  near(r.price, atc(r.costs, r.q), 'a fair return: P = ATC', 1e-6); near(r.profit, 0, 'no profit', 1e-6);
  r = OF.solve.costCurves({ market: 'monopolistic', run: 'long' });
  near(r.profit, 0, 'the long run: demand tangent to ATC, no profit', 1e-6); assert.ok(r.excessCapacity > 0, 'and excess capacity');
  for (const d2 of [{ market: 'monopolistic', run: 'short', outcome: 'loss', shade: ['profit'] }, { market: 'perfect', price: 'breakeven', axes: 'numbered' }, { afc: true }]) basics(assert, OF, 'costCurves', d2);
});

test('cost curves: refused, hidden and in the reader\'s words', () => {
  const bad = [{ market: 'oligopoly' }, { atc: { q: 6, cost: 2 }, mcSlope: 3 }, { price: 'profit' }, { market: 'perfect', regulation: 'fair' }, { market: 'perfect', price: 0.2 }, { shade: ['profit'] }, { market: 'perfect', shade: ['cs'] }, { atc: { q: 1, cost: 4 } }];
  for (const d of bad) { assert.ok(OF.check('costCurves', d).length, JSON.stringify(d)); assert.match(OF.svg('costCurves', d), /cannot be drawn/); }
  const d = { market: 'perfect', price: 'profit', shade: ['profit'] };
  assert.equal(count(OF.svg('costCurves', d, { hide: 'areas' }), /of-region/g), 0);
  assert.equal(count(OF.svg('costCurves', d, { hide: 'names' }), /class="of-blank"/g), 4, 'MC, ATC, AVC and the price line are lines to write on');
  assert.match(OF.svg('costCurves', d, { lang: 'de' }), /Gewinn/); assert.match(OF.svg('costCurves', {}, { lang: 'he' }), /מחיר ועלויות/);
});

test('production possibilities: points, steps and shifts from the curve; two countries\' opportunity costs', () => {
  let r = OF.solve.possibilitiesCurve({ xMax: 100, yMax: 50, shape: 'straight', steps: true, points: [{ name: 'A', at: 0 }, { name: 'B', at: 0.5 }, { name: 'C', at: 1 }] });
  for (const st of Object.values(r.steps)) near(st.cost, 0.5, 'a straight curve: the same cost every step');
  near(r.constantCost, 0.5, 'Y/X');
  const out = { xMax: 100, yMax: 120, bow: 1.5, steps: true, points: [{ name: 'A', at: 0 }, { name: 'B', at: 0.25 }, { name: 'C', at: 0.5 }, { name: 'D', at: 0.75 }, { name: 'E', at: 1 }] };
  r = OF.solve.possibilitiesCurve(out);
  const costs = Object.values(r.steps).map(s => s.cost);
  assert.ok(costs.every((c, i) => !i || c > costs[i - 1]), `bowed out: the cost rises (${costs})`);
  near(r.points.C.y, 120 * Math.pow(1 - Math.pow(0.5, 1.5), 1 / 1.5), 'C is on the curve');
  basics(assert, OF, 'possibilitiesCurve', out);
  r = OF.solve.possibilitiesCurve({ points: [{ name: 'A', at: 0.35 }, { name: 'B', place: 'inside', at: 0.55 }, { name: 'C', place: 'outside', at: 0.7 }] });
  assert.deepEqual(Object.values(r.points).map(p => p.status), ['efficient', 'inefficient', 'unattainable']);
  r = OF.solve.possibilitiesCurve({ shift: { which: 'both', dir: 'out' }, points: [{ name: 'A', at: 0.5 }, { name: 'B', place: 'on2', at: 0.5 }] });
  assert.ok(r.xMaxAfter > r.xMax && r.yMaxAfter > r.yMax); assert.equal(r.points.B.status, 'unattainable', 'on the new curve: past the old one');
  near(OF.solve.possibilitiesCurve({ xMax: 50, yMax: 40, shift: { xMax: 70 } }).xMaxAfter, 70, 'a numbered pivot');
  const c = { countries: [{ name: 'Country A', x: 40, y: 20 }, { name: 'Country B', x: 30, y: 30 }], goods: ['Wheat', 'Cloth'] };
  r = OF.solve.possibilitiesCurve(c);
  near(r.countryA.costX, 0.5, 'A: 1 wheat costs 1/2 cloth'); near(r.countryB.costX, 1, 'B: 1 wheat costs 1 cloth');
  assert.equal(r.advantageX, 'Country A'); assert.equal(r.advantageY, 'Country B');
  basics(assert, OF, 'possibilitiesCurve', c); basics(assert, OF, 'possibilitiesCurve', { ...c, layout: 'side' });
  const bad = [{ countries: [{ name: 'A', x: 40, y: 20 }, { name: 'B', x: 20, y: 10 }] }, { points: [{ name: 'A', x: 3, y: 4 }] }, { points: [{ name: 'A', place: 'on2', at: 0.5 }] }, { shape: 'convex' },
    { steps: true, points: [{ name: 'A', at: 0.5 }] }, { countries: [{ name: 'A', x: 4, y: 2 }, { name: 'B', x: 3, y: 3 }], steps: true }, { xMax: 100 }];
  for (const d of bad) { assert.ok(OF.check('possibilitiesCurve', d).length, JSON.stringify(d)); assert.match(OF.svg('possibilitiesCurve', d), /cannot be drawn/); }
  const e = { points: [{ name: 'A', at: 0.35 }, { name: 'B', place: 'inside', at: 0.55 }] };
  assert.match(OF.svg('possibilitiesCurve', e), /Inefficient/); assert.doesNotMatch(OF.svg('possibilitiesCurve', e, { hide: 'captions' }), /Inefficient/);
  assert.doesNotMatch(OF.svg('possibilitiesCurve', out, { hide: 'costs' }), /class="of-step-gain"/);
  assert.match(OF.svg('possibilitiesCurve', e, { lang: 'fr' }), /Inefficace/); assert.match(OF.svg('possibilitiesCurve', e, { lang: 'nl' }), /Kapitaalgoederen/);
});

for (const g of ['costCurves', 'possibilitiesCurve']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkEconGenerator(assert, g));
