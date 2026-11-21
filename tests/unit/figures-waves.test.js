// Waves (docs/figures-api.md "Waves"): y = A sin(2πx / λ) on axes fitted so the wavelength or period and the amplitude
// are whole blocks; longitudinal lines bunched at the compressions, lined up with the crests.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { wvFitX, wvLineXs, wvPeaks } from '../../figures/src/ported/waves.js';
import { checkGenerator, checkWords, PRINT_OK } from './_physics-gens.js';
const OF = globalThis.OombaFigures;

test('the wave is drawn from its numbers: crests at λ/4 + nλ on gridlines, amplitude as given; compressions at the crests', () => {
  const svg = OF.svg('waves', { amplitude: 3, wavelength: 4, cycles: 2 });
  const pts = /class="of-wave"/.test(svg) && /points="([^"]+)" fill="none"[^>]*class="of-wave"/.exec(svg)[1].split(' ').map(p => p.split(',').map(Number));
  const ys = pts.map(p => p[1]), top = Math.min(...ys), bot = Math.max(...ys), mid = pts[0][1];
  assert.ok(Math.abs(mid - top - (bot - mid)) < 0.05, 'as far up as down');
  const ix = ys.indexOf(top), x0 = pts[0][0], xEnd = pts[pts.length - 1][0];
  assert.ok(Math.abs((pts[ix][0] - x0) / (xEnd - x0) - 1 / 8) < 0.01, 'the first crest at λ/4 of 2λ');
  assert.equal(wvFitX(8, 4).step * 4 % 1, 0); const f = wvFitX(8, 4); assert.ok(Number.isInteger(4 / f.step), 'λ is whole blocks');
  const xs = wvLineXs(4, 8, 12), near = c => xs.filter(x => Math.abs(x - c) < 0.5).length;
  assert.ok(near(1) > near(3) + 2, 'lines bunch at the crest (compression) and spread at the trough (rarefaction)');
  assert.deepEqual(wvPeaks(4, 8), { crests: [1, 5], troughs: [3, 7] });
  const s = OF.solve.waves({ amplitude: 3, wavelength: 4, cycles: 2, speed: 340 });
  assert.equal(s.frequency, 85); assert.equal(s.period, 4 / 340);
  assert.equal(OF.solve.waves({ axis: 'time', amplitude: 2, period: 0.5, cycles: 3 }).frequency, 2);
});
test('check: what cannot be drawn is named', () => {
  const cases = [[{ wavelength: 4, cycles: 2 }, /amplitude/], [{ amplitude: 2, wavelength: 4, cycles: 1.3 }, /halves/], [{ wave: 'longitudinal', amplitude: 2, wavelength: 4, cycles: 2 }, /leave out "amplitude"/],
    [{ axis: 'time', amplitude: 2, wavelength: 4, cycles: 2 }, /period/], [{ wave: 'longitudinal', axis: 'time', period: 2, cycles: 2 }, /transverse wave only/],
    [{ amplitude: 2, wavelength: 4, cycles: 2, labels: ['compression'] }, /longitudinal/], [{ amplitude: 2, wavelength: 4, cycles: 0.5, marks: ['wavelength'] }, /whole cycle/]];
  for (const [d, re] of cases) { assert.match(OF.check('waves', d).join('; '), re, JSON.stringify(d)); assert.match(OF.svg('waves', d), /cannot be drawn/); }
});
test('hide, print and words', async () => {
  const d = { wave: 'both', amplitude: 3, wavelength: 4, cycles: 2, labels: ['crest', 'trough', 'compression', 'rarefaction'] };
  assert.match(OF.svg('waves', d), /of-mark/); assert.doesNotMatch(OF.svg('waves', d, { hide: true }), /of-mark|of-label/);
  assert.doesNotMatch(OF.svg('waves', d, { hide: 'labels' }), /of-label/); assert.match(OF.svg('waves', d, { hide: 'labels' }), /of-mark/);
  assert.ok(PRINT_OK(OF.svg('waves', d, { print: true })));
  await checkWords(assert, ['wave', 'crest', 'trough', 'compression', 'rarefaction']);
  assert.match(OF.svg('waves', d, { lang: 'fr' }), />crête</);
});
test('a generator: the wavelength, randomized, its key from OF.solve', async () => { await checkGenerator(assert, 'waves', s => s.wavelength); });
