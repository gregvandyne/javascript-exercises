// The 1.3.0 genetics (docs/figures-api.md "Biology (1.3.0)"): Punnett squares whose cells and ratios are worked out
// from the parents' alleles (monohybrid 1 : 2 : 1 and 3 : 1, dihybrid 9 : 3 : 3 : 1, X-linked by sex, incomplete
// dominance 1 : 2 : 1, codominant blood groups), and pedigrees: a seeded random family always fits its mode and a student
// can tell the mode; a family given with a mode is refused when that mode could not give it (genotype elimination); the
// genotypes written are the ones the family proves. Print is black and white, hide blanks the answers, and the
// generators pass the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkBioGenerator } from './_bio-gens.js';
const OF = globalThis.OombaFigures;

test('Punnett squares: the cells and the ratios come from the alleles', () => {
  const mono = { parents: [['T', 't'], ['T', 't']], names: { T: 'tall', t: 'short' } };
  const { s } = basics(assert, OF, 'punnett', mono), r = OF.solve.punnett(mono);
  assert.deepEqual(r.genotypes, { TT: 1, Tt: 2, tt: 1 }); assert.equal(r.genotypeRatio, '1 : 2 : 1'); assert.equal(r.phenotypeRatio, '3 : 1'); assert.equal(r.recessivePercent, 25);
  assert.equal(count(s, /class="of-offspring"/g), 4); assert.match(s, /3 tall : 1 short/);
  const di = OF.solve.punnett({ parents: [['R', 'r', 'Y', 'y'], ['R', 'r', 'Y', 'y']] });
  assert.equal(di.cells, 16); assert.equal(di.phenotypeRatio, '9 : 3 : 3 : 1'); assert.equal(di.recessivePercent, 6.25);
  const x = OF.solve.punnett({ cross: 'x-linked', parents: [['X^H', 'X^h'], ['X^H', 'Y']] });
  assert.deepEqual(x.daughterPercent, { 'X^H': 100 }); assert.deepEqual(x.sonPercent, { 'X^H': 50, 'X^h': 50 });
  assert.equal(OF.solve.punnett({ dominance: 'incomplete', parents: [['C^R', 'C^W'], ['C^R', 'C^W']] }).phenotypeRatio, '1 : 2 : 1');
  assert.deepEqual(OF.solve.punnett({ dominance: 'codominance', parents: [['I^A', 'i'], ['I^B', 'i']] }).phenotypes, { 'I^A': 1, 'I^A+I^B': 1, 'I^B': 1, i: 1 });
  assert.deepEqual(OF.solve.punnett({ letters: ['T'], parents: [[2], [0]] }).genotypes, { Tt: 4 }, 'counts with letters are the same alleles');
  for (const p of [{ parents: [['R', 'r', 'Y', 'y'], ['r', 'r', 'y', 'y']] }, { cross: 'x-linked', parents: [['X^H', 'X^h'], ['X^h', 'Y']] }, { dominance: 'codominance', parents: [['I^A', 'I^B'], ['i', 'i']] }]) basics(assert, OF, 'punnett', p);
});

test('Punnett squares: crosses that cannot be refused, and hide blanks the cells, gametes or ratios', () => {
  const bad = [{ parents: [['T', 't']] }, { parents: [['T', 't', 'T'], ['T', 't']] }, { parents: [['T', 't'], ['R', 'r']] }, { parents: [['T', 'q'], ['T', 't']] }, { parents: [['C^R', 'C^W'], ['C^R', 'C^W']] },
    { cross: 'x-linked', parents: [['X^H', 'X^h'], ['X^H', 'X^h']] }, { cross: 'x-linked', parents: [['X^H', 'Y^h'], ['X^H', 'Y']] }, { parents: [['T*', 't'], ['T', 't']] }, { letters: ['T'], parents: [[3], [1]] }];
  for (const d of bad) { assert.ok(OF.check('punnett', d).length, JSON.stringify(d)); assert.match(OF.svg('punnett', d), /cannot be drawn/); }
  const d = { parents: [['T', 't'], ['T', 't']] };
  assert.equal(count(OF.svg('punnett', d, { hide: 'cells' }), /class="of-offspring"/g), 0);
  assert.equal(count(OF.svg('punnett', d, { hide: 'gametes' }), /class="of-gamete"/g), 0);
  assert.equal(count(OF.svg('punnett', d, { hide: 'ratios' }), /class="of-ratio"/g), 0);
  assert.match(OF.svg('punnett', d, { lang: 'de' }), /Genotypenverhältnis/); assert.match(OF.svg('punnett', d, { lang: 'ar' }), /نسبة الطرز الجينية/);
});

test('pedigrees: a seeded family fits its mode and a student can tell it; the same seed draws the same family', () => {
  for (const mode of ['ad', 'ar', 'xr', 'xd']) for (const seed of [1, 2, 3]) {
    const d = { mode, seed, generations: 3 }, r = OF.solve.pedigree(d);
    assert.equal(r.fits[mode], true, `${mode} ${seed}`); assert.equal(r.tells, true, `${mode} ${seed}: a student can tell`);
    assert.equal(OF.svg('pedigree', d), OF.svg('pedigree', { ...d }));
    assert.equal(count(OF.svg('pedigree', d), /of-affected/g), r.affected);
  }
  basics(assert, OF, 'pedigree', { mode: 'ar', seed: 7 });
  basics(assert, OF, 'pedigree', { mode: 'xr', seed: 5, generations: 4, size: 'small', carriers: true, numbers: true });
});

test('pedigrees: a family given with a mode must fit it, and the genotypes written are what the family proves', () => {
  const xr = 'm-fc4mfc-m3fc-m2MdmMdfc-m3ffMpMd-f1fc-m2Mdmfc-m2fc-m3MdmfMd';
  assert.deepEqual(OF.check('pedigree', { mode: 'xr', family: xr, carriers: true }), []);
  assert.match(OF.check('pedigree', { mode: 'ad', family: xr, carriers: true })[0], /cannot be ad inheritance/);
  // two unaffected parents with an affected child cannot be dominant
  assert.match(OF.check('pedigree', { mode: 'ad', family: 'm-f2Mf' })[0], /cannot be ad inheritance: .*fit/);
  assert.deepEqual(OF.check('pedigree', { mode: 'ar', family: 'm-f2Mf' }), []);
  // an affected father's daughters are all affected in X-linked dominant
  assert.ok(OF.check('pedigree', { mode: 'xd', family: 'M-f2ff' }).length);
  const g = OF.solve.pedigree({ mode: 'ar', family: 'm-f2Mf', genotypes: true });
  assert.equal(g.genotypes['I-1'], 'Aa'); assert.equal(g.genotypes['I-2'], 'Aa'); assert.equal(g.genotypes['II-1'], 'aa'); assert.equal(g.genotypes['II-2'], 'A_');
  assert.deepEqual(g.fits, { ad: false, ar: true, xr: true, xd: false, y: false });
  const s = OF.svg('pedigree', { mode: 'ar', family: 'm-f2Mf', genotypes: true });
  assert.equal(count(s, /class="of-genotype"/g), 4);
  assert.equal(count(OF.svg('pedigree', { mode: 'ar', family: 'm-f2Mf', genotypes: true }, { hide: 'genotypes' }), /class="of-genotype"/g), 0);
  assert.equal(count(OF.svg('pedigree', { mode: 'ar', family: 'm-f2Mf' }, { hide: 'affected' }), /of-affected/g), 0);
  for (const b of [{ family: 'x-y' }, { mode: 'zz', seed: 1 }, { seed: 1 }, { mode: 'ar' }, { mode: 'ar', seed: 1, generations: 9 }, { family: 'm-f1M', seed: 3, mode: 'ar' }, { mode: 'ar', family: 'm-F2fcM' }]) assert.ok(OF.check('pedigree', b).length, JSON.stringify(b));
  assert.doesNotMatch(OF.svg('pedigree', { mode: 1, seed: 4 }), />[^<]*(recessive|dominant)/i, 'the figure never names its own mode');
  assert.match(OF.svg('pedigree', { mode: 'ar', seed: 7 }, { lang: 'he' }), /אילן יוחסין/);
});

for (const g of ['punnett', 'pedigree']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkBioGenerator(assert, g));
