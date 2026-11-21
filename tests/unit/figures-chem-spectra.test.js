// The 1.2.0 spectra (docs/figures-api.md "Chemistry (1.2.0)"): a mass spectrum's peaks at their mass numbers, as tall as
// their abundances (every element's natural abundances add up to 100 and average to its standard atomic weight), line
// spectra at their wavelengths, and a photoelectron spectrum's peaks at their binding energies, as tall as their
// electrons. Data that cannot be drawn truthfully is refused with the "cannot be drawn" card; print is black on white;
// hide leaves the answer out; the words are in all 12 languages; each kind has a generator.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { IS_TABLE } from '../../figures/src/ported/isotopes.js';
import { checkWords, PRINT_OK } from './_physics-gens.js';
import { checkChemGenerator } from './_chem-gens.js';
const OF = globalThis.OombaFigures;
const rects = (s, cls) => [...s.matchAll(new RegExp(`<rect x="([\\d.-]+)" y="([\\d.-]+)" width="([\\d.]+)" height="([\\d.]+)"[^>]*class="${cls}"`, 'g'))].map(m => ({ x: +m[1], y: +m[2], w: +m[3], h: +m[4] }));

test('mass spectrum: every element\'s abundances add up to 100 and average to its standard atomic weight', () => {
  // CIAAW abridged standard atomic weights (2024), to their places
  const W = { H: 1.008, Li: 6.94, B: 10.81, C: 12.011, N: 14.007, O: 15.999, Ne: 20.180, Mg: 24.305, Si: 28.085, S: 32.06, Cl: 35.45, Ar: 39.95, K: 39.098, Ca: 40.078, Fe: 55.845, Cu: 63.546, Zn: 65.38, Br: 79.904, Kr: 83.798, Ag: 107.87, Xe: 131.29, Pb: 207.2, U: 238.03 };
  assert.equal(Object.keys(IS_TABLE).length, 58);
  for (const el of Object.keys(IS_TABLE)) {
    const s = OF.solve.massSpectrum({ element: el });
    assert.ok(Math.abs(s.total - 100) < 1e-6, `${el}: ${s.total}`);
    if (W[el]) assert.ok(Math.abs(s.mass - W[el]) < 0.02, `${el}: ${s.mass} vs ${W[el]}`);
  }
  assert.equal(Math.round(OF.solve.massSpectrum({ element: 'Cl' }).mass * 100) / 100, 35.45);
  assert.equal(OF.solve.massSpectrum({ element: 'Mg' }).mostAbundant, 24);
});
test('mass spectrum: each peak at its mass number, as tall as its abundance; relative heights; the missing peak', () => {
  const s = OF.svg('massSpectrum', { element: 'Mg' }), bars = rects(s, 'of-peak');
  assert.equal(bars.length, 3);
  const base = bars[0].y + bars[0].h, per = bars[0].h / 78.99;
  for (const [b, a] of bars.map((b, i) => [b, [78.99, 10, 11.01][i]])) { assert.ok(Math.abs(b.y + b.h - base) < 0.02); assert.ok(Math.abs(b.h - a * per) < 0.05, `${a}`); }
  assert.ok(Math.abs((bars[1].x - bars[0].x) - (bars[2].x - bars[1].x)) < 0.02, 'one m/z apart each');
  assert.match(s, />78\.99%</); assert.match(s, />Mg</);
  const rel = OF.solve.massSpectrum({ element: 'Zr', scale: 'relative' }).peaks;
  assert.equal(Math.max(...rel.map(p => p.height)), 100);
  assert.equal(rects(OF.svg('massSpectrum', { element: 'Si', missing: 29 }), 'of-peak').length, 2);
  const x = { isotopes: [{ mass: 10, abundance: 19.9 }, { mass: 11, abundance: 80.1 }], name: 'Element X' };
  assert.deepEqual(OF.check('massSpectrum', x), []); assert.ok(Math.abs(OF.solve.massSpectrum(x).mass - 10.801) < 1e-9);
  assert.match(OF.svg('massSpectrum', x, { lang: 'de' }), />80,1%</, 'the reader\'s decimal mark');
});
test('line spectra: each line at its wavelength, a mixture is every line of its parts, print is black lines on white', () => {
  const d = { strips: [{ element: 'H' }, { element: 'Na' }, { name: 'Unknown', mix: [0, 1] }], from: 400, to: 700 };
  assert.deepEqual(OF.check('lineSpectrum', d), []);
  const s = OF.svg('lineSpectrum', d), xs = [...s.matchAll(/<line x1="([\d.]+)"[^>]*class="of-line"/g)].map(m => +m[1]);
  const X = nm => 96 + ((nm - 400) / 300) * 520;
  assert.deepEqual(xs.slice(0, 4), [410.2, 434, 486.1, 656.3].map(nm => Math.round(X(nm) * 100) / 100));
  const sol = OF.solve.lineSpectrum(d);
  assert.deepEqual(sol.strips[2].lines, [...sol.strips[0].lines, ...sol.strips[1].lines].sort((a, b) => a - b)); assert.deepEqual(sol.strips[2].mix, ['H', 'Na']);
  assert.match(s, /stroke="#ff0000"|stroke="#ff/, 'colored lines on black'); assert.match(s, /fill="#000000"/);
  const p = OF.svg('lineSpectrum', d, { print: true });
  assert.ok(PRINT_OK(p)); assert.doesNotMatch(p, /class="of-line"[^>]*stroke="#(?!000000)/); assert.doesNotMatch(p.replace(/<line[^>]*stroke="#000000"[^>]*class="of-line"\/>/g, ''), /class="of-line"/);
  assert.match(OF.svg('lineSpectrum', { strips: [{ element: 'H' }, { element: 'He' }], style: 'absorption' }), /linearGradient id="of-rainbow-380-750"/);
  assert.match(OF.svg('lineSpectrum', d, { hide: 'names' }), /________/); assert.doesNotMatch(OF.svg('lineSpectrum', d, { hide: 'names' }), />Unknown</);
});
test('photoelectron spectrum: one peak per sublevel of the real ground state, as tall as its electrons, at its binding energy', () => {
  const na = OF.solve.photoelectron({ element: 'Na' });
  assert.deepEqual(na.peaks.map(p => [p.sublevel, p.electrons, p.energy]), [['1s', 2, 104], ['2s', 2, 6.84], ['2p', 6, 3.67], ['3s', 1, 0.5]]);
  assert.equal(na.electrons, 11);
  const cr = OF.solve.photoelectron({ element: 'Cr' }).peaks;
  assert.deepEqual([cr.find(p => p.sublevel === '4s').electrons, cr.find(p => p.sublevel === '3d').electrons], [1, 5], 'Cr: 4s¹ 3d⁵');
  for (let z = 1; z <= 54; z++) assert.equal(OF.solve.photoelectron({ element: z }).electrons, z, `Z ${z}: every electron in a peak`);
  // the peak tops: log axis 0.1 to 1000 MJ/mol growing to the left, heights in electrons
  const s = OF.svg('photoelectron', { element: 'Na' }), tops = [...s.matchAll(/<path d="M ([^"]+)"[^>]*class="of-peak"/g)].map(m => m[1].split(' L ').map(p => p.split(',').map(Number)));
  const X = E => 64 + 460 * (1 - (Math.log10(E) + 1) / 4), Y = n => 40 + 240 - (n / 7) * 240;
  tops.forEach((pts, i) => { const top = pts[12], p = na.peaks[i]; assert.ok(Math.abs(top[0] - X(p.energy)) < 0.02, p.sublevel); assert.ok(Math.abs(top[1] - Y(p.electrons)) < 0.02, p.sublevel); });
  assert.match(OF.svg('photoelectron', { element: 'Na', compare: 'Mg' }), /class="of-compare"/);
  assert.ok(Math.abs(OF.solve.photoelectron({ element: 'Na', unit: 'eV' }).peaks[0].energy - 104 / 0.0964853) < 1e-6);
  assert.doesNotMatch(OF.svg('photoelectron', { element: 'Na' }, { hide: 'element' }), />Na</);
});
test('cannot be drawn, print, hide and words', async () => {
  const bad = [['massSpectrum', { isotopes: [{ mass: 10, abundance: 20 }, { mass: 11, abundance: 70 }] }, /add up to 100 \(they add up to 90\)/], ['massSpectrum', { element: 'Tc' }, /isotope data/],
    ['massSpectrum', { isotopes: [{ mass: 10.2, abundance: 50 }, { mass: 9.8, abundance: 50 }] }, /same mass number/], ['massSpectrum', { element: 'Cl', missing: 36 }, /one of the peaks' m\/z \(35, 37\)/],
    ['massSpectrum', { element: 'Cl', x: [30, 36] }, /widen "x"/], ['lineSpectrum', { strips: [{ element: 'K' }], from: 400, to: 700 }, /766\.5 nm is off the axis/],
    ['lineSpectrum', { strips: [{ element: 'H' }, { name: 'M', mix: [0] }] }, /2 or more other strips/], ['lineSpectrum', { strips: [{ element: 'Fe' }] }, /must be one of/],
    ['photoelectron', { element: 'Cs' }, /H to Xe/], ['photoelectron', { element: 'Na', compare: 'Na' }, /another element/]];
  for (const [k, d, re] of bad) { assert.match(OF.check(k, d).join('; '), re, `${k} ${JSON.stringify(d)}`); assert.match(OF.svg(k, d), /cannot be drawn/); }
  for (const [k, d] of [['massSpectrum', { element: 'Cl' }], ['lineSpectrum', { strips: [{ element: 'H' }] }], ['photoelectron', { element: 'Na', compare: 'Mg' }]]) {
    assert.ok(PRINT_OK(OF.svg(k, d, { print: true })), k);
    for (const l of ['de', 'ja', 'he', 'ar']) assert.doesNotMatch(OF.svg(k, d, { lang: l }), /NaN|undefined/, `${k} ${l}`);
  }
  assert.doesNotMatch(OF.svg('massSpectrum', { element: 'Cl' }, { hide: true }), /75\.76|>Cl</);
  await checkWords(assert, ['massSpectrum', 'massToCharge', 'abundance', 'relAbundance', 'lineSpectrum', 'wavelength', 'photoelectron', 'bindingEnergy', 'logScale', 'electronsRel', 'element']);
});
test('generators: a relative atomic mass, a line\'s frequency, an atom\'s electrons', async () => {
  for (const g of ['massSpectrum', 'lineSpectrum', 'photoelectron']) await checkChemGenerator(assert, g);
});
