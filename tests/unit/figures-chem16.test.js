// Oomba Figures 1.6.0, the seven chemistry kinds new in 1.6.0 (docs/figures-api.md "Chemistry: seven new figures (1.6.0)";
// docs/decisions.md, the 1.6.0 section): paper chromatograms, galvanic cells, phase
// diagrams, bond energy curves, equilibrium graphs, rate law graphs and VSEPR shapes. Their science against known
// values, what each refuses, OF.solve, hide (the answer never drawn), print (black and white, VSEPR's one gray per
// element), the figure words in other languages, and the catalog's generators: every dealt figure passes OF.check, its
// key is the figure's own OF.solve value, every option comes up, and the numbers change from seed to seed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { pdPhaseAt } from '../../figures/src/ported/phase.js';
import { beEnergyAt } from '../../figures/src/ported/morse.js';
import { eqQuotient } from '../../figures/src/ported/equilibrium.js';
const F = await import('../../server/services/figures.js');
const CAT = await import('../../public/js/figures-catalog.js');
const OF = globalThis.OombaFigures;
const NEW = ['chromatography', 'galvanicCell', 'phaseDiagram', 'bondEnergy', 'equilibrium', 'rateLaw', 'vsepr'];
const texts = svg => [...svg.matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&'));
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('every new kind is in the chem pack and the catalog; every preset draws, in every mode, and passes OF.check', () => {
  for (const k of NEW) {
    assert.equal(OF.packOf(k), 'chem'); assert.ok(OF.kinds.includes(k), k);
    const K = CAT.kindOf(k);
    assert.ok(K && K.subject === 'chem' && K.grades.includes('9-12') && K.presets.length >= 4 && K.gens.length >= 2, k);
    for (const d of K.presets) {
      assert.deepEqual(OF.check(k, d), [], `${k} ${JSON.stringify(d)}`);
      for (const o of [{}, { print: true }, { hide: true }, ...K.hide.map(h => ({ hide: h })), { lang: 'ar' }]) {
        const s = OF.svg(k, d, o);
        assert.match(s, new RegExp(`class="of-fig of-${k}`), k); assert.doesNotMatch(s, /NaN|undefined|Infinity/, `${k} ${JSON.stringify(d)} ${JSON.stringify(o)}`);
      }
    }
    assert.ok(OF.check(k, { ...K.presets[0], nonsense: 1 }).length, `${k} refuses a field it does not take`);
  }
});

test('chromatography: Rf is distance over front; a mixture contains a dye when a spot matches in color and height; no dye passes the front', () => {
  const d = CAT.kindOf('chromatography').presets[0], s = OF.solve.chromatography(d);
  assert.ok(near(s.rf.A.blue, 0.7) && near(s.rf.A.yellow, 0.3) && near(s.rf.B.red, 0.55));
  const x = { samples: [{ name: 'X', spots: [{ color: 'red', distance: 3.2 }, { color: 'blue', distance: 6 }] }, { name: 'Red', spots: [{ color: 'red', distance: 3.2 }] }, { name: 'Blue', spots: [{ color: 'blue', distance: 6.5 }] }], front: 8 };
  assert.deepEqual(OF.solve.chromatography(x).contains, { Red: 1, Blue: 0 }); assert.equal(OF.solve.chromatography(x).absent, 'Blue');
  assert.match(OF.check('chromatography', { samples: [{ spots: [{ color: 'red', distance: 9 }] }], front: 8 })[0], /past the solvent front/);
  assert.match(OF.check('chromatography', { samples: [{ spots: [{ color: 'red', distance: 3 }, { color: 'red', distance: 5 }] }] })[0], /two red dyes/);
  assert.match(OF.check('chromatography', { samples: [{ spots: [{ color: 'gold', distance: 3 }] }] })[0], /"color"/);
  const m = OF.svg('chromatography', { ...d, measure: true });
  assert.ok(texts(m).includes('5.6 cm') && texts(m).includes('8.0 cm') && texts(m).includes('2.4 cm'), 'distances to 0.1 cm');
  assert.ok(!texts(OF.svg('chromatography', { ...d, measure: true }, { hide: 'values' })).some(t => /cm$/.test(t)), 'hidden distances');
  const both = texts(OF.svg('chromatography', { ...d, show: 'both' }, { lang: 'de' }));
  assert.ok(both.includes(OF.data.words.de.before) && both.includes(OF.data.words.de.after) && OF.data.words.de.before !== 'Before', 'the captions in German');
});

test('galvanicCell: the lower E° is the anode, E°cell is the difference, the reactions balance, the meter reads it and hides it', () => {
  const zc = OF.solve.galvanicCell({ left: 'Zn', right: 'Cu' });
  assert.deepEqual([zc.voltage, zc.anode, zc.cathode, zc.anodeSide, zc.flow, zc.electrons], [1.1, 'Zn', 'Cu', 'left', 'right', 2]);
  assert.equal(zc.overall, 'Zn(s) + Cu²⁺(aq) → Zn²⁺(aq) + Cu(s)');
  const ma = OF.solve.galvanicCell({ left: 'Ag', right: 'Mg' });
  assert.deepEqual([ma.voltage, ma.anodeSide, ma.flow, ma.anodePotential], [3.17, 'right', 'left', -2.37]);
  assert.equal(ma.overall, 'Mg(s) + 2Ag⁺(aq) → Mg²⁺(aq) + 2Ag(s)');
  assert.equal(OF.solve.galvanicCell({ left: 'Al', right: 'Ni' }).overall, '2Al(s) + 3Ni²⁺(aq) → 2Al³⁺(aq) + 3Ni(s)');
  assert.deepEqual(OF.solve.galvanicCell({ left: 30, right: 29 }), zc, 'atomic numbers are the same metals');
  assert.match(OF.check('galvanicCell', { left: 'Cu', right: 'Cu' })[0], /two different metals/);
  assert.match(OF.check('galvanicCell', { left: 'Au', right: 'Cu' })[0], /Mg, Al/);
  assert.ok(texts(OF.svg('galvanicCell', { left: 'Zn', right: 'Cu' })).includes('1.10'));
  const hidden = texts(OF.svg('galvanicCell', { left: 'Zn', right: 'Cu', electrodes: true }, { hide: true }));
  assert.ok(!hidden.includes('1.10') && !hidden.some(t => /Anode|Cathode|^[+−]$/.test(t)), hidden.join('|'));
  const pot = texts(OF.svg('galvanicCell', { left: 'Zn', right: 'Cu', potentials: 'cathode' }));
  assert.ok(pot.includes('E° = +0.34 V') && !pot.includes('E° = −0.76 V'));
  assert.equal(OF.solve.galvanicCell({ left: 'Zn', right: 'Cu', voltage: 1.2 }).voltage, 1.2, 'a typed E°cell for the meter');
});

test('phaseDiagram: the substances\' values, a typed substance\'s checks, each mark drawn in its region, and the path\'s change', () => {
  const w = OF.solve.phaseDiagram({ substance: 'water' }), t = texts(OF.svg('phaseDiagram', { substance: 'water', isobar: true }));
  assert.ok(near(w.tripleT, 0.01, 1e-6) && near(w.nbp, 99.9743, 1e-4) && w.lean === 'left' && w.denserSolid === 0);
  for (const s of ['0.01 °C', '0.00604 atm', '373.9 °C', '218 atm', '0.00 °C', '100.0 °C', '1 atm']) assert.ok(t.includes(s), s);
  const co2 = OF.solve.phaseDiagram({ substance: 'co2' });
  assert.ok(co2.sublimesAt1atm === 1 && near(co2.sublimes, -78.464, 1e-3) && co2.lean === 'right');
  assert.ok(texts(OF.svg('phaseDiagram', { substance: 'co2', isobar: true })).includes('−78.5 °C'));
  assert.ok(near(OF.solve.phaseDiagram({ substance: 'nitrogen', tUnit: 'K', pUnit: 'kPa' }).critP, 3395.8, 1e-6));
  const own = { tripleT: 20, tripleP: 0.4, critT: 140, critP: 3, nmp: 22, nbp: 75 };
  assert.deepEqual(OF.check('phaseDiagram', { ...own, axes: 'numbered' }), []);
  assert.match(OF.check('phaseDiagram', { ...own, nbp: 40 })[0], /bends upward/);
  assert.match(OF.check('phaseDiagram', { ...own, tripleP: 1.5 })[0], /less than 1 atm/);
  assert.match(OF.check('phaseDiagram', { ...own, critT: 10 })[0], /hotter than the triple point/);
  assert.match(OF.check('phaseDiagram', { substance: 'water', axes: 'numbered' })[0], /not to scale/);
  for (const sub of ['water', 'co2', 'nitrogen', 'oxygen', 'argon', 'methane', 'ammonia']) for (const at of ['solid', 'liquid', 'gas']) {
    const d = { substance: sub, regions: 'none', marks: [{ name: 'A', at }] };
    assert.equal(OF.solve.phaseDiagram(d).mark, at);
    assert.ok(texts(OF.svg('phaseDiagram', d)).includes('A'));
  }
  const changes = [['solid', 'liquid', 'melting'], ['liquid', 'gas', 'vaporization'], ['solid', 'gas', 'sublimation'], ['gas', 'liquid', 'condensation'], ['liquid', 'solid', 'freezing'], ['gas', 'solid', 'deposition']];
  for (const [from, to, change] of changes) assert.equal(OF.solve.phaseDiagram({ substance: 'water', path: { from, to } }).change, change);
  assert.ok(OF.check('phaseDiagram', { substance: 'water', path: { from: 'solid', to: 'solid' } }).length);
  // the phase at a place: the ported model, on a shape like the figure's
  const sh = { triple: { x: 4.5, y: 2.5 }, critical: { x: 10, y: 8 }, corner: { x: 0, y: 0 }, top: 10, fusionTopX: 3.3, kVap: 2, kSub: 4 };
  assert.deepEqual([pdPhaseAt(sh, 2, 6), pdPhaseAt(sh, 6, 6), pdPhaseAt(sh, 9, 1), pdPhaseAt(sh, 11, 9)], ['solid', 'liquid', 'gas', 'supercritical']);
  const hid = texts(OF.svg('phaseDiagram', { substance: 'water' }, { hide: true }));
  assert.ok(!hid.some(t => /atm|°C/.test(t) && !/\(/.test(t)) && !hid.includes('Solid'), hid.join('|'));
});

test('bondEnergy: each curve\'s lowest point is exactly its bond length and -energy; the deepest well is the strongest bond', () => {
  for (const [r0, D] of [[74, 436], [150, 300], [199, 242]]) {
    assert.equal(beEnergyAt(r0, r0, D), -D);
    for (const r of [r0 * 0.9, r0 * 1.1, r0 * 2]) assert.ok(beEnergyAt(r, r0, D) > -D);
    assert.ok(beEnergyAt(r0 * 0.7, r0, D) > 0 && beEnergyAt(r0 * 10, r0, D) < 0 && beEnergyAt(r0 * 10, r0, D) > -D * 0.001);
  }
  const s = OF.solve.bondEnergy(CAT.kindOf('bondEnergy').presets[1]);
  assert.deepEqual([s.length, s.energy, s.minimum, s.strongest, s.weakest, s.shortest, s.longest], [74, 436, -436, 'A', 'B', 'A', 'B']);
  assert.equal(OF.solve.bondEnergy({ bonds: [{ length: 150, energy: 300 }], unit: 'angstrom' }).length, 1.5);
  assert.match(OF.check('bondEnergy', { bonds: [{ length: 150, energy: 300 }, { length: 150, energy: 300 }] })[0], /one curve/);
  assert.match(OF.check('bondEnergy', { bonds: [{ length: 150, energy: 300 }], x: [0, 100] })[0], /off the distance axis/);
  const named = texts(OF.svg('bondEnergy', { bonds: [{ name: 'H–H', length: 74, energy: 436 }, { name: 'Cl–Cl', length: 199, energy: 242 }] }, { hide: 'names' }));
  assert.ok(named.includes('Bond A') && named.includes('Bond B') && !named.includes('H–H'));
  assert.ok(texts(OF.svg('bondEnergy', { bonds: [{ length: 74, energy: 436 }] }, { lang: 'fr' })).includes('Liaison 1'));
});

test('equilibrium: every level stretch gives K; the stresses shift the way Le Chatelier says; a removal larger than what is there is refused', () => {
  const n2o4 = OF.solve.equilibrium({ reaction: 'n2o4', k: 0.2 });
  assert.ok(near(n2o4.equilibrium.N2O4, 0.8, 1e-6) && near(n2o4.equilibrium.NO2, 0.4, 1e-6));
  const nh3 = OF.solve.equilibrium({ reaction: 'ammonia' });
  assert.ok(near(eqQuotient([nh3.equilibrium.N2, nh3.equilibrium.H2, nh3.equilibrium.NH3], [-1, -3, 2]), 0.5, 1e-4));
  const shift = stress => OF.solve.equilibrium({ reaction: 'ammonia', stresses: [{ ...stress, at: 8 }] });
  assert.equal(shift({ kind: 'add', species: 1, amount: 0.5 }).shift, 'forward');
  assert.equal(shift({ kind: 'add', species: 3, amount: 0.5 }).shift, 'reverse');
  assert.equal(shift({ kind: 'remove', species: 3, amount: 0.5 }).shift, 'forward');
  assert.equal(shift({ kind: 'volume', amount: 0.5 }).shift, 'forward', 'a smaller volume: toward fewer moles of gas');
  assert.equal(shift({ kind: 'volume', amount: 2 }).shift, 'reverse');
  assert.deepEqual([shift({ kind: 'raise' }).shift, shift({ kind: 'raise' }).kAfter], ['reverse', 0.25], 'heating an exothermic reaction lowers K');
  assert.equal(shift({ kind: 'lower' }).shift, 'forward');
  assert.equal(OF.solve.equilibrium({ reaction: 'n2o4', stresses: [{ kind: 'raise', at: 8 }] }).shift, 'forward', 'heating an endothermic reaction raises K');
  assert.equal(OF.solve.equilibrium({ reaction: 'hi', stresses: [{ kind: 'volume', at: 8, amount: 0.5 }] }).shift, 'none', 'equal moles of gas each side: no shift');
  assert.deepEqual([shift({ kind: 1, species: 3, amount: 0.5 }).stress, shift({ kind: 'add', species: 1 }).stress, shift({ kind: 'volume', amount: 0.5 }).stress], ['removeProduct', 'addReactant', 'volumeDown']);
  assert.match(OF.check('equilibrium', { reaction: 'ammonia', stresses: [{ kind: 'remove', at: 8, species: 3, amount: 5 }] })[0], /more of a species than is there/);
  assert.match(OF.check('equilibrium', { reaction: 'ammonia', start: [0, 3, 0] })[0], /both at 0/);
  const t = texts(OF.svg('equilibrium', { reaction: 'ammonia', stresses: [{ kind: 'add', at: 8, species: 1 }] }));
  assert.ok(t.includes('N₂ added') && t.includes('NH₃'));
  const h = texts(OF.svg('equilibrium', { reaction: 'ammonia', stresses: [{ kind: 'add', at: 8, species: 1 }] }, { hide: 'stresses' }));
  assert.ok(h.includes('?') && !h.includes('N₂ added'));
});

test('rateLaw: the straight graph for each order, the half-lives, k\'s unit, and data that stop when a zero-order reaction ends', () => {
  const one = OF.solve.rateLaw({ order: 1, a0: 1, k: 0.02 });
  assert.ok(near(one.halfLife, Math.LN2 / 0.02) && near(one.halfLives[2], 2 * Math.LN2 / 0.02) && one.straight === 'ln' && one.slope === -0.02 && one.kUnit === 's⁻¹');
  const zero = OF.solve.rateLaw({ order: 0, a0: 1, k: 0.01, points: true });
  assert.deepEqual([zero.halfLives[1], zero.halfLives[2], zero.straight, zero.kUnit], [50, 75, 'conc', 'M s⁻¹']);
  const two = OF.solve.rateLaw({ order: 2, a0: 1, k: 0.05, concUnit: 'mol/L', timeUnit: 'min' });
  assert.deepEqual([two.halfLives[1], two.halfLives[2], two.straight, two.slope, two.kUnit], [20, 60, 'inv', 0.05, 'L mol⁻¹ min⁻¹']);
  assert.ok(Object.values(zero.at).every(c => c > 0), 'no zero-order point at or after [A] = 0');
  assert.match(OF.check('rateLaw', { order: 1, a0: 1, k: 0.000001 })[0], /long/);
  assert.match(OF.check('rateLaw', { order: 1, a0: 1, k: 0.02, graphs: 'ln', guides: 1 })[0], /\[A\] graph/);
  const t = texts(OF.svg('rateLaw', { order: 1, a0: 1, k: 0.02, species: 'N2O5' }));
  assert.ok(t.includes('[N₂O₅] (M)') && t.includes('ln[N₂O₅]') && t.includes('1/[N₂O₅] (M⁻¹)'));
  assert.ok(texts(OF.svg('rateLaw', { order: 0, a0: 1, k: 0.01, graphs: 'conc', guides: 1 })).includes('50 s'));
  assert.ok(!texts(OF.svg('rateLaw', { order: 0, a0: 1, k: 0.01, graphs: 'conc', guides: 1 }, { hide: 'values' })).includes('50 s'));
  assert.doesNotMatch(OF.svg('rateLaw', { order: 2, a0: 1, k: 0.05 }), /second order|first order|zero order/, 'the figure\'s name does not give the order away');
});

test('vsepr: every molecule\'s shape, the angle labels, the odd atom out at the apex, radicals; one gray per element in print', () => {
  const shape = m => OF.solve.vsepr({ molecule: m });
  const want = { CO2: 'linear', H2O: 'bent', SO2: 'bent', BF3: 'trigonal planar', NH3: 'trigonal pyramidal', CH4: 'tetrahedral', PCl5: 'trigonal bipyramidal', SF4: 'seesaw', ClF3: 'T-shaped', XeF2: 'linear', SF6: 'octahedral', BrF5: 'square pyramidal', XeF4: 'square planar', NH4: 'tetrahedral', NO3: 'trigonal planar', I3: 'linear', NO2: 'bent', CH3: 'trigonal planar' };
  for (const [m, s] of Object.entries(want)) assert.equal(shape(m).shape, s, m);
  assert.deepEqual([shape('H2O').angle, shape('H2O').squeezed, shape('H2O').lonePairs, shape('H2O').axe], [109.5, 1, 2, 'AX₂E₂']);
  assert.equal(shape('NO2').squeezed, 0, 'a lone electron squeezes no angle');
  assert.equal(shape('CH3').geometry, 'trigonal planar', 'a planar radical');
  for (const [m, n] of Object.entries({ 0: 'CO2', 3: 'H2O', 9: 'NH3', 12: 'CH4' })) assert.equal(OF.solve.vsepr({ molecule: +m }).formula, OF.solve.vsepr({ molecule: n }).formula);
  assert.ok(texts(OF.svg('vsepr', { molecule: 'H2O', angles: true })).includes('<109.5°'));
  assert.ok(texts(OF.svg('vsepr', { molecule: 'CH4', angles: true })).includes('109.5°'));
  // XeOF4: O at the apex, opposite the lone pair (whatever order the atoms are given in)
  const xe = OF.solve.vsepr({ central: 'Xe', outer: ['F', 'F', { el: 'O', order: 2 }, 'F', 'F'], lone: 1 });
  assert.equal(xe.shape, 'square pyramidal');
  assert.match(OF.check('vsepr', { central: 'N', outer: ['H', 'H', 'H'], lone: 0 })[0], /electrons/);
  assert.match(OF.check('vsepr', { central: 'C', outer: ['F', 'F', 'F', 'F', 'F'], lone: 0 })[0], /period 2|electrons/);
  // print and grayscale: each element its own gray
  for (const o of [{ print: true }, {}]) {
    const s = OF.svg('vsepr', { molecule: 'CH3Cl', style: 'ball', gray: !o.print }, o);
    const fill = el => (s.match(new RegExp(`fill="(#[0-9a-f]{6})"[^>]*class="of-atom of-${el}"`)) || [])[1];
    const [c, h, cl] = ['C', 'H', 'Cl'].map(fill);
    for (const g of [c, h, cl]) assert.match(g, /^#([0-9a-f]{2})\1\1$/, `${g} is a gray`);
    assert.equal(new Set([c, h, cl]).size, 3, 'three elements, three grays');
  }
  const blank = texts(OF.svg('vsepr', { molecule: 'NH3', geometry: true }, { hide: 'name' }));
  assert.ok(!blank.some(t => /pyramidal|tetrahedral/.test(t)), blank.join('|'));
  assert.ok(texts(OF.svg('vsepr', { molecule: 'NH3' }, { lang: 'ja' })).some(t => t.includes('三角錐形')));
});

test('the catalog\'s generators for the seven kinds: each figure passes OF.check, the key is its OF.solve value, every option comes up, the numbers vary', () => {
  for (const K of CAT.KINDS.filter(k => NEW.includes(k.id))) for (const g of K.gens) {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) {
      const r = F.generate(g.id, seed * 7919);
      assert.ok(r, `${g.id} seed ${seed}`);
      assert.deepEqual(OF.check(r.kind, r.data), [], `${g.id} ${JSON.stringify(r.data)}`);
      const solved = CAT.flatSolve(OF.solve[r.kind](r.data)), raw = F.dealRaw(g.id, seed * 7919);
      if (r.answerType === 'number') {
        assert.ok(Math.abs(solved[g.key] - r.value) <= 1e-9, `${g.id}: the key is OF.solve's ${g.key}`);
        assert.ok(Math.abs(raw.answer - r.value) <= 0.5 * 10 ** -r.dp + 1e-9, `${g.id}: the formula agrees (${raw.answer} vs ${r.value})`);
      } else {
        const v = OF.solve[r.kind](r.data), path = g.key.split('.').reduce((o, k) => o[k], v);
        assert.equal(g.pick[String(path)], r.correct, `${g.id}: the pick is OF.solve's ${g.key}`);
        assert.equal(Math.round(raw.answer), r.correct, `${g.id}: the formula agrees`);
      }
      seen.add(r.answer);
      assert.ok(F.printHtml({ title: 'Chem' }, [{ ...r, id: 'q' }], { key: true }).includes(r.answer.replace(/&/g, '&amp;').replace(/</g, '&lt;')), `${g.id}: the printed key`);
    }
    if (g.tool === 'figure.choice') assert.equal(seen.size, g.choices.length, `${g.id}: every option comes up`);
    else assert.ok(seen.size >= 3, `${g.id} varies: ${[...seen].join(', ')}`);
  }
  assert.ok(CAT.KINDS.filter(k => NEW.includes(k.id)).flatMap(k => k.gens).some(g => g.tool === 'figure.number' && [...Array(40)].some((_, i) => (F.generate(g.id, (i + 1) * 7919) || {}).value < 0)), 'some answers are negative');
});

test('worksheets, Assign and the lesson step take the new kinds as they are: one generator question of each, a snapshot, the student\'s figure, marking (a negative E° too)', async () => {
  const { createUser } = await import('../../server/auth.js');
  const S = await import('../../server/services/schools.js');
  const L = await import('../../server/services/lessons.js');
  const FS = await import('../../server/services/figures-steps.js');
  const boss = createUser({ username: 'Chem16Boss', password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: 'Chem16 Oak' }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Chem' });
  const cls = S.createClass(boss, oak.id, { name: '11C' }).class;
  const gens = CAT.KINDS.filter(k => NEW.includes(k.id)).flatMap(k => k.gens.map(g => g.id));
  const items = gens.map(gen => ({ kind: CAT.genOf(gen).kind, gen, seed: 5 }));
  const w = F.createWorksheet(boss, { title: 'Chemistry 1.6.0', items });
  assert.ok(w.ok, JSON.stringify(w));
  const r = FS.assignWorksheet(boss, w.id, cls.id, {});
  assert.ok(r.ok, JSON.stringify(r));
  const step = L.getStep(r.step.id), snap = FS.itemsOf(step);
  assert.equal(step.of_version, '1.6.0'); assert.equal(snap.length, gens.length);
  snap.forEach((it, i) => {
    const g = F.generate(gens[i], 5);
    assert.equal(JSON.stringify(it.data), JSON.stringify(g.data), gens[i]); assert.equal(it.answer, g.answer);
    const svg = FS.figureSvg(step, i);
    assert.match(svg, new RegExp(`data-of="${it.kind}"`)); assert.doesNotMatch(svg, /cannot be drawn/);
    if (g.answerType === 'number') assert.ok(FS.isRight(CAT.numText(g.value, g.dp).replace('-', '−'), it), `${gens[i]}: ${g.answer} is marked right`);
  });
  const neg = snap.find((it, i) => gens[i] === 'galvanicCell.anodePotential');
  if (neg.value < 0) { assert.ok(FS.isRight(String(neg.value), neg)); assert.ok(!FS.isRight(String(-neg.value), neg), 'the sign counts'); }
});
