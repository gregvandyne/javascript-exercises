// The reading extensions (docs/figures-api.md "Length readings: caliper and micrometer" and "The spring scale's
// extras"): a vernier caliper and a micrometer set exactly at their reading, with least count and zero error, and the
// spring scale's hanging masses and zero error. Readings without the new options draw exactly as in 1.0.0.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { figuresKit } from '../../server/services/figlibs.js';
import { gaCaliper, gaSlideMarks, gaThimbleMarks } from '../../figures/src/ported/gauges.js';
import { checkGenerator, checkWords, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;

test('the 1.0.0 readings draw byte for byte what 1.0.0 drew', () => {
  const F = figuresKit('1.0.0');
  const data = [{ type: 'thermometer', value: 23.5, min: -10, max: 50, step: 1, major: 10 }, { type: 'cylinder', value: 42, min: 0, max: 100, step: 2 }, { type: 'spring', value: 3.5, min: 0, max: 10, step: 0.5, major: 1 }, { type: 'spring', value: 2.25, min: 0, max: 5, step: 0.5, unit: 'N' }];
  for (const d of data) for (const o of [{}, { print: true }, { hide: 'value' }, { lang: 'de' }]) assert.equal(OF.svg('reading', d, o), F.svg('reading', d, o), JSON.stringify([d, o]));
});
test('the caliper: the sliding mark that lines up is the true one, for each least count', () => {
  for (const [lc, value, k] of [[0.1, 34.7, 7], [0.05, 23.45, 9], [0.02, 41.38, 19]]) {
    const v = gaCaliper(lc), s = OF.solve.reading({ type: 'caliper', value, leastCount: lc });
    assert.equal(s.main, Math.floor(value)); assert.equal(s.k, k);
    const m = gaSlideMarks(v, value)[k];
    assert.ok(Math.abs(m.at - Math.round(m.at)) < 1e-9, `${lc}: mark ${k} sits on a main-scale mark`);
    for (const [i, x] of gaSlideMarks(v, value).entries()) if (i !== k) assert.ok(Math.abs(x.at - Math.round(x.at)) > lc / 2 - 1e-9, `${lc}: only mark ${k} lines up (mark ${i})`);
  }
  const z = OF.solve.reading({ type: 'caliper', value: 34.7, leastCount: 0.1, zero: 0.3 });
  assert.equal(z.corrected, 34.4); assert.match(OF.svg('reading', { type: 'caliper', value: 34.7, leastCount: 0.1, zero: 0.3 }), /class="of-closed"/);
});
test('the micrometer: sleeve to the half millimeter, the thimble mark on the datum line, estimated digit, zero error', () => {
  assert.deepEqual({ ...OF.solve.reading({ type: 'micrometer', value: 7.38 }) }, { type: 'micrometer', value: 7.38, unit: 'mm', leastCount: 0.01, zero: 0, corrected: 7.38, sleeve: 7, thimble: 38 });
  assert.equal(OF.solve.reading({ type: 'micrometer', value: 5.62 }).sleeve, 5.5);
  assert.equal(OF.solve.reading({ type: 'micrometer', value: 6.384, estimate: true }).thimble, 38.4);
  const at = gaThimbleMarks(7.38).find(m => m.j === 38); assert.ok(Math.abs(at.angle) < 1e-9, 'mark 38 on the datum line');
  assert.equal(OF.solve.reading({ type: 'micrometer', value: 5.62, zero: -0.03 }).corrected, 5.65);
});
test('the spring scale: hanging masses weigh what it reads; a zero error is drawn unloaded beside it', () => {
  const d = { type: 'spring', value: 1.5, min: 0, max: 5, step: 0.1, major: 1, masses: [100, 50], g: 10 };
  assert.deepEqual(OF.check('reading', d), []);
  assert.deepEqual({ ...OF.solve.reading(d) }, { type: 'spring', value: 1.5, unit: 'N', zero: 0, corrected: 1.5, mass: 150, g: 10, weight: 1.5 });
  assert.equal((OF.svg('reading', d).match(/class="of-mass"/g) || []).length, 2);
  const z = { type: 'spring', value: 3.5, min: 0, max: 5, step: 0.1, major: 1, zero: 0.5 };
  assert.equal(OF.solve.reading(z).corrected, 3); assert.match(OF.svg('reading', z), /class="of-unloaded"/);
  assert.match(OF.check('reading', { ...d, value: 2 }).join(), /weigh 1\.5 N: the pointer reads 1\.5 N, not 2/);
  assert.deepEqual(OF.check('reading', { ...d, value: 2, zero: 0.5 }), [], 'with the zero error added');
});
test('check, hide, print and words', async () => {
  const bad = [[{ type: 'caliper', value: 23.43, leastCount: 0.05 }, /not a multiple of the least count/], [{ type: 'caliper', value: 23.4, leastCount: 0.03 }, /0\.1, 0\.05 or 0\.02/],
    [{ type: 'caliper', value: 160, leastCount: 0.1 }, /0 to 150/], [{ type: 'caliper', value: 20, leastCount: 0.1, zero: 0.8 }, /at most 0\.5/],
    [{ type: 'micrometer', value: 26 }, /to 25/], [{ type: 'micrometer', value: 6.384 }, /least count, 0\.01/], [{ type: 'micrometer', value: 6, leastCount: 0.1 }, /does not take "leastCount"/],
    [{ type: 'thermometer', value: 20, min: 0, max: 50, step: 1, zero: 1 }, /spring scale only/], [{ type: 'spring', value: 2, min: 0, max: 5, step: 0.1, masses: [] }, /1 to 6 masses/]];
  for (const [d, re] of bad) { assert.match(OF.check('reading', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('reading', d), /cannot be drawn/); }
  for (const d of [{ type: 'caliper', value: 23.45, leastCount: 0.05 }, { type: 'micrometer', value: 7.38 }, { type: 'spring', value: 1.5, min: 0, max: 5, step: 0.1, major: 1, masses: [100, 50], g: 10 }]) {
    assert.match(OF.svg('reading', d, { hide: 'value' }), /______/); assert.ok(PRINT_OK(OF.svg('reading', d, { print: true })), d.type);
  }
  await checkWords(assert, ['caliper', 'micrometer', 'zeroError']);
  assert.match(OF.svg('reading', { type: 'caliper', value: 23.45, leastCount: 0.05 }, { lang: 'de' }), /23,45 mm/);
});
test('generators: a caliper and a micrometer reading', async () => {
  await checkGenerator(assert, 'caliper', s => s.value);
  await checkGenerator(assert, 'micrometer', s => s.value);
});
