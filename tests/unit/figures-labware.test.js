// The 1.2.0 lab readings, more types of `reading` in the measure pack (docs/figures-api.md "Chemistry (1.2.0)"): a buret
// read down (with an initial reading, a titre), a beaker, a gas syringe, a digital and a triple beam balance, a digital
// thermometer, a pH meter (digital or analog) and pH paper, and volume by displacement. The meniscus, the plunger, the
// needle and the riders sit exactly at the reading; a reading the instrument cannot show is refused; the older readings
// draw exactly as before (tests/unit/figures-v120.test.js).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { lwNeedle, lwRiders } from '../../figures/src/ported/labware.js';
import { checkWords, PRINT_OK } from './_physics-gens.js';
import { checkChemGenerator } from './_chem-gens.js';
const OF = globalThis.OombaFigures;
/** The y where a meniscus path's bowl bottoms out (its middle point). */
const meniscusY = s => +/<path d="M [\d.]+ [\d.]+ C [\d.]+ [\d.]+ [\d.]+ [\d.]+ [\d.]+ ([\d.]+) C/.exec(s)[1];

test('buret: read down from 0, the meniscus\'s bottom at the reading, an initial reading gives the titre', () => {
  const ys = [23.4, 23.45, 23.5].map(v => meniscusY(OF.svg('reading', { type: 'buret', value: v, max: 50 })));
  assert.ok(ys[0] < ys[1] && ys[1] < ys[2], 'a bigger reading is lower down');
  assert.ok(Math.abs(ys[1] - ys[0] - 4.5) < 0.02 && Math.abs(ys[2] - ys[1] - 4.5) < 0.02, '90 per mL: half a mark is 4.5');
  const t = { type: 'buret', value: 24.65, initial: 1.2, max: 50 };
  assert.deepEqual({ ...OF.solve.reading(t) }, { type: 'buret', value: 24.65, unit: 'mL', decimals: 2, initial: 1.2, final: 24.65, titre: 23.45 });
  const s = OF.svg('reading', t);
  assert.match(s, />1\.20 mL</); assert.match(s, />24\.65 mL</); assert.equal((s.match(/class="of-panel"/g) || []).length, 2);
  assert.match(OF.svg('reading', t, { lang: 'de' }), />24,65 mL</);
});
test('beaker, gas syringe and displacement: the surface, the plunger\'s face and the rise exactly at the readings', () => {
  const b = OF.svg('reading', { type: 'beaker', value: 175, max: 250, step: 25 });
  assert.ok(Math.abs(/H ([\d.]+) C/.test(b) ? 0 : 1) === 0, 'a flat meniscus');
  const flatY = +/<path d="M [\d.]+ [\d.]+ C [\d. ]+ [\d.]+ ([\d.]+) [\d.]+ ([\d.]+) H/.exec(b)[2];
  assert.ok(Math.abs(flatY - (40 + 54 + 240 - (175 / 250) * 240)) < 0.02);
  const sx = v => +/<line x1="([\d.]+)"[^>]*class="of-level"/.exec(OF.svg('reading', { type: 'syringe', value: v, max: 100 }))[1];
  assert.ok(Math.abs(sx(50) - sx(0) - 180) < 0.02 && Math.abs(sx(43.5) - sx(0) - 43.5 * 3.6) < 0.02, '3.6 per cm³ on a 100 cm³ syringe');
  assert.match(OF.svg('reading', { type: 'syringe', value: 43.5, max: 100, setup: true }), /43\.5 cm³/);
  const d = { type: 'displacement', before: 42, after: 50, max: 100, step: 1, major: 10 };
  assert.deepEqual({ ...OF.solve.reading(d) }, { type: 'displacement', before: 42, after: 50, volume: 8, value: 8, unit: 'mL' });
  const ds = OF.svg('reading', d);
  assert.match(ds, /class="of-object"/); assert.match(ds, />42 mL</); assert.match(ds, />50 mL</); assert.match(ds, /= 8 mL</);
  // the rock's drawn area is the water it pushed up: the rise times the tube's width
  const e = /<ellipse cx="[\d.]+" cy="[\d.]+" rx="([\d.]+)" ry="([\d.]+)"/.exec(ds), H = 420;
  assert.ok(Math.abs(Math.PI * e[1] * e[2] - 70 * (8 / 100) * H) < 2, 'area = the rise across the tube');
  const m = OF.svg('reading', { ...d, object: 'marbles', count: 3, before: 40, after: 46 });
  assert.equal((m.match(/class="of-object"/g) || []).length, 3);
});
test('balances, the digital thermometer and the pH meter: displays to their places, riders and needle at the reading', () => {
  assert.match(OF.svg('reading', { type: 'balance', value: 24.7, decimals: 2 }), />24\.70</, 'a display shows all its places');
  assert.match(OF.svg('reading', { type: 'balance', value: 0.2537, decimals: 4 }), /class="of-shield"/, 'an analytical balance in its draft shield');
  assert.deepEqual(lwRiders(347.65), { hundreds: 300, tens: 40, front: 7.65 }); assert.deepEqual(lwRiders(610), { hundreds: 500, tens: 100, front: 10 });
  const tb = OF.svg('reading', { type: 'tripleBeam', value: 263.45 }), tips = [...tb.matchAll(/<polygon points="([\d.]+),/g)].map(m => +m[1]);
  assert.ok(tips.some(x => Math.abs(x - (190 + (60 / 100) * 400)) < 0.02) && tips.some(x => Math.abs(x - (190 + (200 / 500) * 400)) < 0.02) && tips.some(x => Math.abs(x - (190 + (3.45 / 10) * 400)) < 0.02), 'each rider at its value');
  assert.deepEqual({ ...OF.solve.reading({ type: 'thermometer', digital: true, value: 23.4 }) }, { type: 'thermometer', digital: true, value: 23.4, unit: '°C', decimals: 1, celsius: 23.4, kelvin: 296.55 });
  assert.equal(OF.solve.reading({ type: 'thermometer', digital: true, value: 98.6, unit: '°F' }).celsius, 37);
  assert.match(OF.svg('reading', { type: 'thermometer', digital: true, value: 295.4, unit: 'K', decimals: 1 }), />295\.4</);
  assert.ok(Math.abs(lwNeedle(7)) < 1e-12 && Math.abs(lwNeedle(0) + Math.PI / 4) < 1e-12);
  const a = OF.svg('reading', { type: 'pH', meter: 'analog', value: 3.4 }), n = /<line x1="210" y1="236" x2="([\d.]+)" y2="([\d.]+)"[^>]*class="of-level"/.exec(a);
  assert.ok(Math.abs(Math.atan2(+n[1] - 210, 236 - +n[2]) - lwNeedle(3.4)) < 1e-3, 'the needle at pH 3.4');
  assert.match(OF.svg('reading', { type: 'pH', value: 4.6, decimals: 2 }), />4\.60</);
  assert.match(OF.svg('reading', { type: 'pH', meter: 'paper', value: 11 }), /fill="#3f51b5"[^>]*class="of-level"/, 'the strip matches the pH 11 swatch');
});
test('refused when the instrument cannot show it', () => {
  const bad = [[{ type: 'buret', value: 23.47, max: 50 }, /not on a mark or half way/], [{ type: 'buret', value: 10, initial: 12, max: 50 }, /reads down/], [{ type: 'buret', value: 10, max: 40 }, /25, 50/],
    [{ type: 'beaker', value: 160, max: 250, step: 25 }, /not on a mark or half way/], [{ type: 'syringe', value: 43.6, max: 100 }, /not on a mark/], [{ type: 'syringe', value: 30, max: 100, setup: 'yes' }, /true/],
    [{ type: 'balance', value: 24.735, decimals: 2 }, /more places than the display shows/], [{ type: 'balance', value: 300, decimals: 3 }, /0 to 200/], [{ type: 'tripleBeam', value: 611 }, /0 to 610/], [{ type: 'tripleBeam', value: 72.33 }, /front beam/],
    [{ type: 'thermometer', digital: true, value: 200 }, /-50 to 150 °C/], [{ type: 'thermometer', digital: true, value: 23.45, decimals: 1 }, /more places/], [{ type: 'pH', value: 15 }, /0 to 14/],
    [{ type: 'pH', meter: 'analog', value: 3.45 }, /every 0\.2/], [{ type: 'pH', meter: 'paper', value: 4.5 }, /whole/], [{ type: 'pH', meter: 'paper', value: 4, decimals: 1 }, /digital pH meter only/],
    [{ type: 'displacement', before: 50, after: 42, max: 100, step: 1 }, /must be above "before"/], [{ type: 'displacement', before: 5, after: 45, max: 100, step: 1 }, /stick out of the water/], [{ type: 'displacement', before: 4, after: 6.35, max: 10, step: 0.2 }, /"after": .*not on a tick/]];
  for (const [d, re] of bad) { assert.match(OF.check('reading', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('reading', d), /cannot be drawn/); }
});
test('print, hide, languages, words and generators', async () => {
  const all = [{ type: 'buret', value: 24.65, initial: 1.2, max: 50 }, { type: 'beaker', value: 175, max: 250, step: 25 }, { type: 'syringe', value: 43.5, max: 100, setup: true }, { type: 'balance', value: 24.73 }, { type: 'tripleBeam', value: 347.65 }, { type: 'thermometer', digital: true, value: 23.4 }, { type: 'pH', value: 4.62 }, { type: 'pH', meter: 'analog', value: 3.4 }, { type: 'pH', meter: 'paper', value: 11 }, { type: 'displacement', before: 42, after: 50, max: 100, step: 1, major: 10 }];
  for (const d of all) {
    assert.ok(PRINT_OK(OF.svg('reading', d, { print: true })), d.type);
    assert.match(OF.svg('reading', d, { hide: 'value' }), /______/, d.type);
    for (const l of ['de', 'ja', 'he', 'ar']) assert.doesNotMatch(OF.svg('reading', d, { lang: l }), /NaN|undefined/, `${d.type} ${l}`);
  }
  assert.doesNotMatch(OF.svg('reading', { type: 'pH', meter: 'paper', value: 11 }, { print: true }), /#3f51b5/i, 'pH paper prints in grays');
  await checkWords(assert, ['buret', 'beaker', 'gasSyringe', 'balance', 'tripleBeam', 'digitalThermometer', 'phMeter', 'phPaper', 'initial', 'final', 'before', 'after', 'objectVolume', 'dispReading']);
  for (const g of ['reading.buret', 'reading.beaker', 'reading.syringe', 'reading.tripleBeam', 'reading.pH', 'reading.displacement']) await checkChemGenerator(assert, g);
});
