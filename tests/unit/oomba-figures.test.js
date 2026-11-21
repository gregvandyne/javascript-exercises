// Oomba Figures (docs/figures-api.md): every kind draws from plain data, checks its data in plain English, hides its
// answer when asked, prints in black and white, keeps right-to-left labels readable, and is CORRECT TO SCALE: arrow
// lengths follow the forces, rays meet at the image the lens equation gives, electron counts follow the filling rules,
// a reading sits on its value, a titration's pH is where the chemistry puts it. The shipped file is a fresh build.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../../figures/src/index.js';
import { bundle, files as builtFiles, version, PARTS, partFile, coreLib } from '../../scripts/build-figures.js';
import zlib from 'node:zlib';
import { figuresKit, FIG_LATEST } from '../../server/services/figlibs.js';
import { evalExpr, exprProblem } from '../../canvas/src/expr.js';
import { CODES } from '../../server/i18n/index.js';
import { FIG_WORDS } from '../../figures/src/words.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OF = globalThis.OombaFigures;
const nums = (s, re) => [...s.matchAll(re)].map(m => +m[1]);
/** The arrows in a figure's SVG text: [{ x1, y1, x2, y2 }] of each arrow's shaft (its head ends at the tip). */
const shafts = s => [...s.matchAll(/<g><line x1="([-\d.]+)" y1="([-\d.]+)" x2="([-\d.]+)" y2="([-\d.]+)"[^>]*\/><polygon points="([-\d.]+),([-\d.]+)/g)].map(m => ({ x1: +m[1], y1: +m[2], tx: +m[5], ty: +m[6] }));
const len = a => Math.hypot(a.tx - a.x1, a.ty - a.y1);

const SAMPLES = {
  freeBody: { forces: [{ name: 'W', dir: 'down', size: 20 }, { name: 'N', dir: 'up', size: 20 }, { name: 'F', dir: 'right', size: 10 }] },
  vectors: { vectors: [{ x: 3, y: 0 }, { x: 0, y: 4 }], chain: true, resultant: true },
  inclinedPlane: { angle: 30, mass: 2 },
  pulley: { type: 'atwood', masses: [2, 3] },
  rays: { type: 'convex-lens', f: 10, u: 25, h: 4 },
  circuit: { layout: 'series', parts: [{ type: 'cell', value: '1.5 V' }, { type: 'bulb' }, { type: 'ammeter', value: '0.2 A' }] },
  motionGraph: { type: 'velocity-time', points: [[0, 0], [4, 12], [10, 12]], shade: true },
  grid: { x: [-5, 5], y: [-5, 5], points: [{ x: 2, y: 3, label: 'A' }], fns: [{ expr: '2*x - 1' }] },
  halfLife: { halfLife: 5, start: 80 },
  titration: { acid: 'weak', base: 'strong' },
  bohr: { element: 'Na' },
  orbitals: { element: 'O' },
  lewis: { molecule: 'H2O' },
  reading: { type: 'thermometer', value: 23.5, min: -10, max: 50, step: 1, major: 10 },
  numberLine: { from: -5, to: 5, intervals: [{ from: -2 }], points: [{ at: [1, 2], label: 'P' }] },   // 1.1.0 (tests/unit/figures-numberline.test.js)
  // 1.1.0 shapes (tests/unit/figures-shapes.test.js)
  triangle: { AB: 3, BC: 4, B: 90, labels: { CA: 'x' } },
  rectangle: { AB: 12, BC: 5, unit: 'cm' },
  parallelogram: { AB: 12, DA: 10, A: 30, heights: ['D'], labels: { hD: true } },
  trapezoid: { type: 'isosceles', AB: 14, CD: 8, h: 4 },
  kite: { AB: 6, DA: 10, B: 110 },
  regularPolygon: { n: 6, side: 8, lines: ['apothem'] },
  // 1.1.0 lines and angles, segment addition, the circle, composite shapes (tests/unit/figures-lines, -segments, -circle, -composite)
  angles: { rays: [0, 60], angles: [{ from: 0, to: 1 }] },
  parallelLines: { transversals: [{ angle: 65 }], angles: [{ number: 2, label: true }] },
  segmentAddition: { points: ['A', 'B', 'C'], unknown: { x: 6 }, parts: [{ expr: [2, 1] }, { expr: [3, -4] }], spans: [{ from: 'A', to: 'C', label: 27 }] },
  circle: { points: [{ name: 'A', at: 210 }, { name: 'B', at: 330 }], lines: [{ from: 'O', to: 'A' }, { from: 'O', to: 'B' }], angles: [{ at: 'O', from: 'A', to: 'B' }] },
  compositeShape: { parts: [{ rect: [0, 0, 8, 3] }, { rect: [0, 3, 3, 4] }], sides: true },
  barGraph: { categories: ['A', 'B'], values: [3, 5] }, dotPlot: { data: [1, 2, 2, 3] }, histogram: { bins: [[0, 10], [10, 20]], counts: [3, 5] },
  boxPlot: { data: [1, 2, 3, 4, 5, 6, 7] }, scatterPlot: { points: [[1, 2], [2, 3], [3, 5]], fit: true }, stemAndLeaf: { data: [12, 15, 21, 34] },
  pieChart: { slices: [{ name: 'A', value: 1 }, { name: 'B', value: 3 }] }, cumulativeFrequency: { bins: [[0, 10], [10, 20]], counts: [3, 5] }, normalCurve: { regions: [{ from: 1 }] },
  treeDiagram: { branches: [{ name: 'H', p: [1, 2] }, { name: 'T', p: [1, 2] }], repeat: 2 }, vennDiagram: { sets: ['A', 'B'], counts: { A: 3, B: 4, AB: 2, none: 1 } },
  twoWayTable: { columns: ['x', 'y'], rows: ['p', 'q'], counts: [[1, 2], [3, 4]] }, tableOfValues: { rule: '2*x' }, protractor: { angle: 60, reading: true },
  // 1.1.0 solids, nets and mapping diagrams (tests/unit/figures-solids, -net, -mapping)
  prism: { length: 8, width: 3, height: 5 }, cylinder: { radius: 4, height: 10 }, pyramid: { length: 6, width: 6, height: 4 }, cone: { radius: 5, height: 12 }, sphere: { radius: 6 },
  net: { solid: 'cube', side: 4 }, mappingDiagram: { inputs: [1, 2], outputs: [3, 4], arrows: [[1, 3], [2, 4]] },
  // 1.1.0 physics (tests/unit/figures-motion, -projectile, -waves)
  motionMap: { segments: [{ kind: 'forward', speed: 2, duration: 4 }], dt: 1 }, projectile: { speed: 20, angle: 45 }, waves: { amplitude: 3, wavelength: 4, cycles: 2 },
  // 1.2.0 chemistry (tests/unit/figures-chem-spectra, -chem-energy, -chem-atoms, -labware)
  massSpectrum: { element: 'Cl' }, heatingCurve: { substance: 'water' }, energyProfile: { levels: [50, 150, 20] }, nuclide: { element: 'C', mass: 14 },
  lineSpectrum: { strips: [{ element: 'H' }] }, photoelectron: { element: 'Na' }, particles: { particles: [{ count: 6, look: { size: 'm', shade: 'gray' } }] }, dotCross: { molecule: 'CH4' },
};

test('every kind: plain data in, one accessible <svg> out, no problems for good data', () => {
  assert.deepEqual([...OF.kinds].sort(), Object.keys(SAMPLES).sort());
  for (const [k, d] of Object.entries(SAMPLES)) {
    assert.deepEqual(OF.check(k, d), [], k);
    const s = OF.svg(k, d, { title: `A ${k}` });
    assert.match(s, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/, k);
    assert.match(s, new RegExp(`role="img" aria-label="A ${k}"`), k);
    assert.match(s, new RegExp(`<title>A ${k}</title>`), k);
    assert.match(s, /direction="ltr"/, `${k}: a figure never mirrors`);
    assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity/, k);
  }
});
test('bad data is named in plain English and never drawn as a figure', () => {
  const cases = [
    ['freeBody', { forces: [{ name: 'W', dir: 'sideways', size: 5 }] }, /dir/],
    ['rays', { type: 'convex-lens', f: 10, u: 10 }, /focal point/],
    ['rays', { type: 'convex-lens', f: 10, u: 10.5 }, /too far|too tall/],
    ['reading', { type: 'cylinder', value: 34.3, min: 0, max: 50, step: 1 }, /cannot read it/],
    ['reading', { type: 'thermometer', value: 80, min: 0, max: 50, step: 1 }, /on the scale/],
    ['bohr', { element: 'Fe' }, /school model is for up to 20/],
    ['bohr', { element: 'Na', shells: [2, 8, 2] }, /adds up to 12/],
    ['lewis', { atoms: [{ el: 'O', x: 0, y: 0, lone: 1 }, { el: 'H', x: 1, y: 0 }], bonds: [{ a: 0, b: 1 }] }, /has 4 electrons around it; it needs 8/],
    ['titration', { acid: 'weak', base: 'weak' }, /no sharp end point/],
    ['motionGraph', { type: 'distance-time', points: [[0, 5], [2, 3]] }, /never goes down/],
    ['circuit', { layout: 'series', parts: [{ type: 'bulb' }] }, /cell or a battery/],
    ['grid', { x: [-5, 5], y: [-5, 5], fns: [{ expr: 'window.x' }] }, /character|names/],
    ['numberLine', { from: 0, to: 5, points: [{ at: 7 }] }, /past the end of the line/],
    ['triangle', { AB: 3, BC: 4, CA: 10 }, /cannot make a triangle/],
    ['angles', { rays: [0, 60], angles: [{ from: 0, to: 1, label: 50 }] }, /labeled 50 but it is 60°/],
    ['compositeShape', { parts: [{ rect: [0, 0, 4, 4] }, { rect: [2, 2, 4, 4] }] }, /overlap/],
    ['nope', {}, /unknown figure/],
  ];
  for (const [k, d, re] of cases) { assert.match(OF.check(k, d).join('; '), re, k); assert.match(OF.svg(k, d), /cannot be drawn/, `${k}: a card, not a wrong figure`); }
});

// ---------------------------------------------------------------- correct to scale
test('free-body diagram: each arrow\'s length is proportional to its force, in its direction', () => {
  const s = OF.svg('freeBody', { body: 'dot', forces: [{ name: 'T', dir: 60, size: 20 }, { name: 'W', dir: 'down', size: 17.32 }, { name: 'P', dir: 'left', size: 10 }] });
  const a = shafts(s);
  assert.equal(a.length, 3);
  const [T, Wt, P] = a;
  assert.ok(Math.abs(len(T) / len(P) - 2) < 0.02 && Math.abs(len(Wt) / len(P) - 1.732) < 0.02, `20 : 17.3 : 10 (${len(T)}, ${len(Wt)}, ${len(P)})`);
  assert.ok(Math.abs(Math.atan2(-(T.ty - T.y1), T.tx - T.x1) * 180 / Math.PI - 60) < 0.5, 'T at 60°');
  assert.ok(Wt.tx === Wt.x1 && Wt.ty > Wt.y1, 'W straight down'); assert.ok(P.ty === P.y1 && P.tx < P.x1, 'P to the left');
  assert.match(s, /T = 20 N/); assert.match(s, /W = 17\.32 N/);
  assert.match(OF.svg('freeBody', { forces: [{ name: 'W', dir: 'down', size: 9.8 }] }, { hide: true }), /W = \? N/, 'hidden sizes');
});
test('inclined plane: W = m g down, N = m g cos θ at right angles to the slope, friction = m g sin θ up it', () => {
  const s = OF.solve.inclinedPlane({ angle: 30, mass: 2 });
  assert.ok(Math.abs(s.W - 19.6) < 1e-9 && Math.abs(s.N - 19.6 * Math.cos(Math.PI / 6)) < 1e-9 && Math.abs(s.F - 9.8) < 1e-9);
  const svg = OF.svg('inclinedPlane', { angle: 30, mass: 2 }), a = shafts(svg);
  const [W, N, F] = a;
  assert.ok(Math.abs(len(N) / len(W) - Math.cos(Math.PI / 6)) < 0.02 && Math.abs(len(F) / len(W) - 0.5) < 0.02, 'to scale');
  const dot = (p, q) => (p.tx - p.x1) * (q.tx - q.x1) + (p.ty - p.y1) * (q.ty - q.y1);
  assert.ok(Math.abs(dot(N, F)) / (len(N) * len(F)) < 0.01, 'normal at right angles to friction (the slope)');
  assert.match(svg, /N = 17 N/); assert.match(svg, />30°</);
});
test('pulleys: Atwood T = 2 m1 m2 g / (m1 + m2), a = (m2 − m1) g / (m1 + m2); a table pulley; the rope pulls level', () => {
  const s = OF.solve.pulley({ type: 'atwood', masses: [2, 3] });
  assert.ok(Math.abs(s.T - 23.52) < 1e-9 && Math.abs(s.a - 1.96) < 1e-9);
  const t = OF.solve.pulley({ type: 'table', masses: [4, 1] });
  assert.ok(Math.abs(t.a - 1.96) < 1e-9 && Math.abs(t.T - 7.84) < 1e-9);
  assert.match(OF.svg('pulley', { type: 'atwood', masses: [2, 3] }), /T = 23\.5 N/);
  assert.match(OF.svg('pulley', { type: 'atwood', masses: [2, 3] }, { hide: 'tension' }), /T = \?/);
});
test('ray diagrams: the image from 1/f = 1/u + 1/v, and every principal ray passes through it (real) or its back-extension does (virtual)', () => {
  for (const [type, f, u, real, upright] of [['convex-lens', 10, 25, true, false], ['convex-lens', 10, 6, false, true], ['concave-lens', 10, 20, false, true], ['concave-mirror', 10, 30, true, false], ['concave-mirror', 10, 6, false, true], ['convex-mirror', 10, 20, false, true]]) {
    const s = OF.solve.rays({ type, f, u, h: 4 });
    const sign = /convex-lens|concave-mirror/.test(type) ? 1 : -1;
    assert.ok(Math.abs(1 / s.v + 1 / u - 1 / (sign * f)) < 1e-9, `${type} u=${u}: lens equation`);
    assert.equal(s.real, real, `${type} u=${u}: real?`); assert.equal(s.hi > 0, upright, `${type} u=${u}: upright?`);
    // the three rays as lines (world units): ray 1 leaves (0, h), ray 2 (0, 0), ray 3 (0, h'); each one's outgoing line
    // (or its back-extension) goes through the image (x, h')
    const I = { x: s.x, y: s.hi }, mirror = /mirror/.test(type);
    const onLine = (p, q, r) => Math.abs((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x)) < 1e-6;
    // ray 1 leaves (0, h) through F (a converging lens: F beyond; a concave mirror: F in front) or as if from F (a
    // diverging lens: F on the object's side; a convex mirror: F behind)
    const F1 = { x: type === 'convex-lens' || type === 'convex-mirror' ? f : -f, y: 0 };
    assert.ok(onLine({ x: 0, y: 4 }, F1, I), `${type} u=${u}: ray 1 meets the image`);
    // ray 2 through the lens's centre goes straight on; off the mirror's pole it comes back mirrored in the axis
    assert.ok(onLine({ x: 0, y: 0 }, mirror ? { x: -u, y: -4 } : { x: -u, y: 4 }, I), `${type} u=${u}: ray 2 meets the image`);
    // ray 3 leaves at the image's height, parallel to the axis
    assert.ok(onLine({ x: 0, y: s.hi }, { x: 1, y: s.hi }, I), `${type} u=${u}: ray 3 meets the image`);
  }
  const blank = OF.svg('rays', { type: 'convex-lens', f: 10, u: 25 }, { hide: true });
  assert.doesNotMatch(blank, /stroke-dasharray="6 5"|>image</, 'hidden: no rays, no image (for the student to draw)');
  assert.match(OF.svg('rays', { type: 'convex-lens', f: 10, u: 6 }), /stroke-dasharray="6 4"/, 'a virtual image is dashed');
});
test('motion graphs, half-life and titration: the numbers behind the curves', () => {
  assert.equal(OF.solve.motionArea({ type: 'velocity-time', points: [[0, 0], [4, 12], [10, 12], [14, 0]] }), 24 + 72 + 24, 'distance = area under v-t');
  assert.equal(OF.solve.halfLife({ halfLife: 5, start: 80 }, 10), 20);
  const ph = (d, v) => OF.solve.titration(d, v);
  assert.ok(Math.abs(ph({ acid: 'strong', base: 'strong' }, 0) - 1) < 0.01, 'strong acid 0.1 M: pH 1');
  assert.ok(Math.abs(ph({ acid: 'strong', base: 'strong' }, 25) - 7) < 0.01, 'strong-strong: pH 7 at equivalence');
  assert.ok(Math.abs(ph({ acid: 'weak', base: 'strong', pKa: 4.76 }, 12.5) - 4.76) < 0.02, 'half way: pH = pKa');
  assert.ok(ph({ acid: 'weak', base: 'strong' }, 25) > 8.5, 'weak acid: equivalence above 7');
  assert.ok(ph({ acid: 'strong', base: 'weak' }, 25) < 6, 'weak base: equivalence below 7');
  const g = OF.svg('motionGraph', { type: 'distance-time', points: [[0, 0], [10, 50]] }, { hide: true });
  assert.doesNotMatch(g, /stroke-width="3.5"/, 'hidden: the axes only, for plotting');
});
test('Bohr models and orbitals: electrons from the element table and the filling rules', () => {
  const count = s => (s.match(/class="of-e"/g) || []).length;
  for (const [el, q, n, shells] of [['H', 0, 1, [1]], ['C', 0, 6, [2, 4]], ['Na', 0, 11, [2, 8, 1]], ['Cl', -1, 18, [2, 8, 8]], ['Ca', 0, 20, [2, 8, 8, 2]], ['Mg', 2, 10, [2, 8]]]) {
    assert.equal(count(OF.svg('bohr', { element: el, charge: q })), n, `${el}${q}`);
    assert.deepEqual(OF.solve.bohrShells(n), shells, `${el}${q}`);
  }
  assert.equal(count(OF.svg('bohr', { element: 'Na' }, { hide: 'electrons' })), 0);
  assert.match(OF.svg('bohr', { element: 'Na' }), />11 p<.*>12 n</s, 'protons and the commonest isotope\'s neutrons');
  const ct = (el, q) => OF.solve.configText(OF.solve.config(el, q));
  assert.equal(ct('O'), '1s² 2s² 2p⁴'); assert.equal(ct('Fe'), '1s² 2s² 2p⁶ 3s² 3p⁶ 4s² 3d⁶');
  assert.equal(ct('Cr'), '1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹ 3d⁵'); assert.equal(ct('Cu'), '1s² 2s² 2p⁶ 3s² 3p⁶ 4s¹ 3d¹⁰');
  assert.equal(ct('Fe', 2), '1s² 2s² 2p⁶ 3s² 3p⁶ 3d⁶', 'Fe2+ loses its 4s electrons first');
  // Hund's rule: oxygen's 2p has one pair and two single up arrows
  const o = OF.svg('orbitals', { element: 'O' });
  assert.equal((o.match(/fill="#2A78B0"/g) || []).length, 5, 'up arrows: 1s, 2s and three in 2p');
  assert.equal((o.match(/fill="#B0372B"/g) || []).length, 3, 'down arrows: 1s, 2s and one in 2p');
});
test('Lewis structures: every ready molecule passes its own electron count; lone pairs are drawn', () => {
  for (const m of OF.data.molecules) assert.deepEqual(OF.check('lewis', { molecule: m }), [], m);
  const lone = s => (s.match(/class="of-lone"/g) || []).length / 2;
  assert.equal(lone(OF.svg('lewis', { molecule: 'H2O' })), 2); assert.equal(lone(OF.svg('lewis', { molecule: 'NH3' })), 1); assert.equal(lone(OF.svg('lewis', { molecule: 'CO2' })), 4);
  assert.equal(lone(OF.svg('lewis', { molecule: 'H2O' }, { hide: 'lone' })), 0);
});
test('readings: the level sits exactly on the value; hidden, the reading is a blank line', () => {
  for (const type of ['thermometer', 'cylinder', 'spring']) {
    const d = { type, value: 34, min: 0, max: 50, step: 1, major: 10 };
    const s = OF.svg('reading', d), lo = OF.svg('reading', { ...d, value: 0 }), hi = OF.svg('reading', { ...d, value: 50 });
    const y = t => { const m = /class="of-level"/.test(t) && (type === 'thermometer' ? /<rect x="[\d.]+" y="([\d.]+)"[^>]*class="of-level"/.exec(t) : type === 'cylinder' ? /M \d+ [\d.]+ Q [\d.]+ ([\d.]+) [^"]*" [^>]*class="of-level"/.exec(t) : /points="[\d.]+,[\d.]+ [\d.]+,[\d.]+ [\d.]+,([\d.]+)"[^>]*class="of-level"/.exec(t)); return m ? +m[1] : NaN; };
    const frac = (y(lo) - y(s)) / (y(lo) - y(hi));
    assert.ok(Math.abs(frac - 34 / 50) < (type === 'cylinder' ? 0.03 : 0.005), `${type}: ${frac}`);
    assert.match(s, /34 (°C|mL|N)</); assert.match(OF.svg('reading', d, { hide: 'value' }), /______ (°C|mL|N)/);
  }
});

// ---------------------------------------------------------------- print, languages, the formula language
test('print: black on white; labels in right-to-left languages read the right way; numbers in the reader\'s language', () => {
  const s = OF.svg('freeBody', SAMPLES.freeBody, { print: true });
  assert.doesNotMatch(s, /#1F9D63|#2A78B0|#B0372B|#FFFDF2/, 'no colours in print'); assert.match(s, /fill="#FFFFFF"/);
  const he = OF.svg('rays', { type: 'convex-lens', f: 10, u: 25 }, { lang: 'he' });
  assert.match(he, /direction="rtl" unicode-bidi="embed"[^>]*>עצם</, 'a Hebrew label reads right to left');
  assert.match(he, /direction="ltr"/, 'the figure itself does not mirror');
  assert.match(OF.svg('freeBody', { forces: [{ name: 'W', dir: 'down', size: 9.8 }] }, { lang: 'de' }), /W = 9,8 N/);
  assert.match(OF.svg('freeBody', { forces: [{ name: 'W', dir: 'down', size: 9.8 }] }, { lang: 'ar' }), /W = 9\.8 N/, 'Arabic keeps Latin digits, as the site does');
  for (const c of CODES.filter(c => c !== 'en-GB')) { assert.ok(FIG_WORDS[c], c); assert.deepEqual(Object.keys(FIG_WORDS[c]).sort(), Object.keys(FIG_WORDS.en).sort(), c); }
});
test('the formula language: arithmetic, degrees, functions; nothing else (no names, no properties, no code)', () => {
  assert.equal(evalExpr('m * a', { m: 2, a: 3 }), 6); assert.equal(evalExpr('2^3^2'), 512); assert.equal(evalExpr('-2^2'), -4);
  assert.equal(evalExpr('round(sqrt(2), 2)'), 1.41); assert.ok(Math.abs(evalExpr('sin(30)') - 0.5) < 1e-12); assert.equal(evalExpr('if(u > f, 1, 0)', { u: 30, f: 10 }), 1);
  assert.equal(evalExpr('10 × 2 − 3 ÷ 3'), 19);
  for (const bad of ['constructor', 'x.y', 'alert(1)', 'a[0]', '"s"', 'process', '1;2', '=> 1']) assert.ok(exprProblem(bad) || (() => { try { evalExpr(bad, {}); return ''; } catch (e) { return e.message; } })(), bad);
  assert.throws(() => evalExpr('1/0'), /finite/);
});

// ---------------------------------------------------------------- the shipped file
test('the shipped oomba-figures.js and its packs are a fresh build of figures/src, and the server runs them with no document', async () => {
  const v = version(), dir = path.join(ROOT, 'public/vendor/oomba-figures', v);
  for (const [f, b] of Object.entries(await builtFiles())) assert.ok(fs.readFileSync(path.join(dir, f)).equals(b), `${f} matches figures/src`);
  for (const part of Object.keys(PARTS)) assert.doesNotMatch(bundle(part), /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|\beval\s*\(|new Function|import\s*\(/, `${part}: no network, no storage, no eval`);
  const F = figuresKit(FIG_LATEST['oomba-figures']);
  assert.equal(F.version, v);
  assert.equal(F.svg('bohr', { element: 'Na' }), OF.svg('bohr', { element: 'Na' }), 'the frozen file draws what the source draws');
});
test('the latest version (1.2.0; 1.1.0 was the first) is minified, the core and each pack: no comments but the legal ones (each header, and each ported file\'s Apache 2.0 note, in the file it is in), and smaller', () => {
  const ported = fs.readdirSync(path.join(ROOT, 'figures/src/ported')).filter(f => f.endsWith('.js')), v = version();
  let notes = 0;
  for (const part of Object.keys(PARTS)) {
    const js = fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures', v, partFile(part)), 'utf8'), src = bundle(part);
    assert.ok(js.startsWith(part === 'core' ? `/*! Oomba Figures ${v} |` : `/*! Oomba Figures ${v}, the ${part} pack |`), `${part}: the header stays`);
    const mine = ported.filter(f => PARTS[part].includes(`figures/src/ported/${f}`));
    for (const f of mine) {
      const note = new RegExp(`/\\*! figures/src/ported/${f.replace('.', '\\.')}:\\n[\\s\\S]*?Ported code, used under the Apache License 2\\.0[\\s\\S]*?Changed from the original[\\s\\S]*?\\*/`);
      assert.match(js, note, `${f}: its 4(b) note is kept in the ${part} file`);
    }
    notes += mine.length;
    assert.equal((js.match(/\/\*!/g) || []).length, 1 + mine.length, `${part}: no other comments`);
    assert.doesNotMatch(js, /\n\/\/ ---- /, 'the section markers go');
    assert.ok(js.length < src.length * 0.75 && zlib.gzipSync(js).length < zlib.gzipSync(src).length * 0.9, `${part}: ${js.length} vs ${src.length}`);
    assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|\beval\s*\(|new Function|import\s*\(/, 'no network, no storage, no eval');
  }
  assert.equal(notes, ported.length, 'every ported file is in exactly one part');
  const one = fs.readFileSync(path.join(ROOT, 'public/vendor/oomba-figures/1.0.0/oomba-figures.js'), 'utf8');
  assert.match(one, /\n\/\/ ---- figures\/src\/svg\.js\n/, '1.0.0 stays as it shipped, not minified');
});
test('each file shares one scope: no top-level name is declared twice in the core, or in a pack with the core names it takes (a second function would silently replace the first)', () => {
  const lib = coreLib();
  for (const part of Object.keys(PARTS)) {
    const js = bundle(part), names = [...js.matchAll(/^(?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    const taken = part === 'core' ? [] : /^const \{ ([^}]*) \} = __of\._core;$/m.exec(js)[1].split(', ');
    for (const n of taken) assert.ok(lib.includes(n), `${part}: ${n} is one of the names the core hands over`);
    const all = [...names, ...taken], twice = all.filter((n, i) => all.indexOf(n) !== i);
    assert.deepEqual(twice, [], part);
  }
});
