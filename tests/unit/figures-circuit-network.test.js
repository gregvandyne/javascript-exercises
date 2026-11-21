// Compound circuits (docs/figures-api.md "Compound circuits"): the circuit kind's layout "network", series and parallel
// groups nested in a loop, no wires crossing; OF.solve gives the equivalent resistance, currents and voltages. The flat
// circuits draw exactly as in 1.0.0.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { checkGenerator, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;
const NET = { layout: 'network', loop: [{ type: 'battery', volts: 12 }, { type: 'resistor', ohms: 4 }, { parallel: [{ type: 'resistor', ohms: 6 }, { series: [{ type: 'resistor', ohms: 2 }, { type: 'bulb', ohms: 4, voltmeter: true }] }] }, { type: 'ammeter' }] };

test('the flat circuits draw byte for byte what 1.0.0 drew', () => {
  const F = figuresKit('1.0.0');
  const data = [{ layout: 'series', parts: [{ type: 'cell', value: '1.5 V' }, { type: 'bulb' }, { type: 'ammeter', value: '0.2 A' }, { type: 'switch', open: true }] },
    { layout: 'parallel', parts: [{ type: 'battery', value: '6 V' }, { type: 'ammeter' }], branches: [[{ type: 'resistor', value: '2 Ω' }], [{ type: 'bulb' }, { type: 'resistor' }]], meters: [{ type: 'voltmeter', across: [0, 0], value: '6 V' }] }];
  for (const d of data) for (const o of [{}, { print: true }, { hide: 'meters' }, { lang: 'ar' }]) assert.equal(OF.svg('circuit', d, o), F.svg('circuit', d, o));
  assert.equal(OF.solve.circuit(data[0]), null, 'a flat circuit has no numbers of its own');
});
test('the numbers: equivalent resistance, currents and voltages from Ohm\'s law; the meters show them', () => {
  const s = OF.solve.circuit(NET);
  assert.equal(s.resistance, 7); assert.ok(Math.abs(s.current - 12 / 7) < 1e-12);
  const by = Object.fromEntries(s.parts.map(p => [p.name, p]));
  assert.ok(Math.abs(by['R₂'].current - 6 / 7) < 1e-12 && Math.abs(by.L.voltage - 24 / 7) < 1e-12 && Math.abs(by['R₁'].voltage + by['R₂'].voltage - 12) < 1e-9, 'the voltages round the loop add up to the source');
  const svg = OF.svg('circuit', NET);
  assert.match(svg, /A {2}1\.71 A/); assert.match(svg, />3\.43 V</); assert.match(svg, /R₁ {2}4 Ω/); assert.match(svg, /ε {2}12 V/);
  // three levels deep, an open switch in a branch carries nothing
  const deep = OF.solve.circuit({ layout: 'network', loop: [{ type: 'cell', volts: 6 }, { parallel: [{ type: 'resistor', ohms: 10 }, { series: [{ type: 'resistor', ohms: 5 }, { parallel: [{ type: 'resistor', ohms: 10 }, { type: 'switch', open: true }] }] }] }] });
  assert.ok(Math.abs(deep.resistance - 1 / (1 / 10 + 1 / 15)) < 1e-12, 'three levels deep'); assert.equal(deep.parts.find(p => p.type === 'switch').current, 0);
  // no wire crosses another: every wire is horizontal or vertical, and no two cross at a point that is not a joint
  const wires = [...svg.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)" stroke="#141414" stroke-width="2.5"/g)].map(m => m.slice(1).map(Number));
  const H = wires.filter(w => w[1] === w[3]), V = wires.filter(w => w[0] === w[2]);
  let crossings = 0;
  for (const h of H) for (const v of V) { const x = v[0], y = h[1]; if (x > Math.min(h[0], h[2]) + 0.5 && x < Math.max(h[0], h[2]) - 0.5 && y > Math.min(v[1], v[3]) + 0.5 && y < Math.max(v[1], v[3]) - 0.5) crossings++; }
  assert.equal(crossings, 0);
});
test('check: what cannot be drawn truthfully is named', () => {
  const bad = [[{ layout: 'network', loop: [{ type: 'resistor', ohms: 2 }, { type: 'bulb' }] }, /exactly one cell/], [{ layout: 'network', loop: [{ type: 'battery' }, { type: 'ammeter' }] }, /short circuit/],
    [{ layout: 'network', loop: [{ type: 'battery' }, { parallel: [{ type: 'resistor' }, { type: 'ammeter' }] }] }, /short it out/], [{ layout: 'network', loop: [{ type: 'battery' }, { parallel: [{ type: 'resistor' }] }] }, /2 to 4 branches/],
    [{ layout: 'network', loop: [{ type: 'battery' }, { parallel: [{ type: 'battery' }, { type: 'resistor' }] }] }, /in the loop itself/],
    [{ layout: 'network', loop: [{ type: 'battery' }, ...Array.from({ length: 8 }, () => ({ type: 'resistor' }))] }, /at most 8 parts/],
    [{ layout: 'network', loop: [{ type: 'battery' }, { type: 'resistor', ohms: -2 }] }, /above 0/], [{ layout: 'network', parts: [] }, /not used|"loop"/]];
  for (const [d, re] of bad) { assert.match(OF.check('circuit', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('circuit', d), /cannot be drawn/); }
});
test('hide, print', () => {
  assert.match(OF.svg('circuit', NET, { hide: 'meters' }), /A {2}\? A/); assert.match(OF.svg('circuit', NET, { hide: true }), />\? V</);
  assert.ok(PRINT_OK(OF.svg('circuit', NET, { print: true })));
});
test('a generator: the total resistance', async () => { await checkGenerator(assert, 'circuit', s => s.resistance); });
