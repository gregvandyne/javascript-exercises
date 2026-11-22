// The 1.3.0 molecular biology, osmosis and the micropipette (docs/figures-api.md "Biology (1.3.0)"): protein synthesis
// rows by base pairing and the genetic code, every base its letter (print needs no color), blanks from a seed; a gel's
// bands at their distance for their size (linear in log10 of the size within the gel's range, to scale); osmosis's
// tonicity, water movement and result from the solutes that cannot cross, its dots to scale; a micropipette's wheels
// showing exactly the volume's digits. What cannot be drawn is refused, hide leaves answers out, the words are in the
// reader's language, and the generators pass the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count, ysOf } from './_bio-helpers.js';
import { checkBioGenerator } from './_bio-gens.js';
const OF = globalThis.OombaFigures;

test('protein synthesis: the rows pair base for base, translation runs from AUG to the stop codon', () => {
  const d = { coding: 'ATGGCCTTTAAAGGGTAA', rows: ['template', 'coding', 'mrna', 'trna', 'amino'] };
  const { s, p } = basics(assert, OF, 'proteinSynthesis', d), r = OF.solve.proteinSynthesis(d);
  assert.equal(r.template, 'TACCGGAAATTTCCCATT'); assert.equal(r.mrna, 'AUGGCCUUUAAAGGGUAA'); assert.equal(r.protein, 'Met-Ala-Phe-Lys-Gly'); assert.equal(r.stop, true);
  assert.deepEqual(r.anticodons, ['UAC', 'CGG', 'AAA', 'UUU', 'CCC']);
  assert.deepEqual(OF.solve.proteinSynthesis({ template: 'TACCGGAAATTTCCCATT' }).coding, 'ATGGCCTTTAAAGGGTAA', 'a template strand gives the same coding strand');
  assert.equal(count(s, /class="of-base-letter"/g), 18 * 3 + 15, 'every base written as its letter');
  assert.equal(count(p, /class="of-base-letter"/g), 18 * 3 + 15, 'print keeps every letter');
  assert.doesNotMatch(p, /#F6D6D2|#D7E8F4|#D9EED9|#F7EBC6|#E6DDF4/, 'and no tints in print');
  assert.deepEqual(OF.solve.proteinSynthesis({ mrna: 'GCAUGGCUUCAAAGGG', codons: 3 }).protein, 'Met-Ala-Ser', 'the frame starts at the first AUG');
  const blank = { coding: 'ATGGCCTTTAAAGGGTAA', blanks: { mrna: 50 }, seed: 3 };
  assert.equal(OF.svg('proteinSynthesis', blank), OF.svg('proteinSynthesis', { ...blank }), 'the same seed, the same blanks');
  assert.equal(count(OF.svg('proteinSynthesis', { coding: 'ATGGCCTTTAAAGGGTAA' }), /class="of-base-letter"/g), 36, 'no blanks unless asked');
  assert.equal(count(OF.svg('proteinSynthesis', blank), /class="of-base-letter"/g), 36 - 9);
  assert.equal(count(OF.svg('proteinSynthesis', { coding: 'ATGGCCTTTAAAGGGTAA' }, { hide: 'amino' }), /class="of-amino-name"/g), 0);
  for (const b of [{ coding: 'ATGXYZ' }, { mrna: 'AUGT' }, { coding: 'ATG', mrna: 'AUG' }, { coding: 'CCCGGGTTT' }, { coding: 'A'.repeat(40) }, { mrna: 'AUGGCC', codons: 5 }, { coding: 'atggcc' }]) assert.ok(OF.check('proteinSynthesis', b).length, JSON.stringify(b));
  assert.match(OF.svg('proteinSynthesis', { coding: 'ATGGCCTAA' }, { lang: 'de' }), /Aminosäuren/);
});

test('gel electrophoresis: each band where its size runs, to scale; ladders are the makers\' bands; totals add up', () => {
  const d = { gel: '1', lanes: [{ ladder: '1kb' }, { label: 'Digest', bands: [4000, 2000, 1000, 500] }], ruler: true };
  const { s } = basics(assert, OF, 'gel', d), r = OF.solve.gel(d);
  assert.equal(r.totals['2'], 7500);
  const cm = r.lanes[1].bands.map(b => b.cm);
  // inside the 1% gel's range (500 to 10,000 bp) the distance is linear in log10 of the size: halving the size always adds the same
  assert.ok(Math.abs((cm[1] - cm[0]) - (cm[2] - cm[1])) < 1e-3 && Math.abs((cm[2] - cm[1]) - (cm[3] - cm[2])) < 1e-3, cm.join(', '));
  assert.ok(cm[0] < cm[3], 'smaller fragments run farther');
  const ys = ysOf(s, 'of-band'), lad = r.lanes[0].bands;
  assert.equal(ys.length, lad.length + 4);
  assert.ok(r.lanes[0].bands.every(b => b.resolved), 'every 1 kb ladder band is in the 1% gel\'s range');
  const out = OF.solve.gel({ gel: '2', lanes: [{ ladder: '100bp' }, { bands: [9000, 8000] }] });
  assert.equal(out.lanes[1].bands.some(b => b.resolved), false, 'bands too big for a 2% gel crowd near the wells');
  assert.ok(out.lanes[0].bands.length === 13 && out.lanes[0].merged.length >= 1, 'the 500 and 517 bp bands run together, and solve says so');
  assert.equal(count(OF.svg('gel', d, { hide: 'sizes' }), /class="of-size"/g), 0);
  assert.equal(count(OF.svg('gel', { ...d, values: true }), /class="of-value"/g), 4);
  basics(assert, OF, 'gel', { lanes: [{ ladder: 'lambda' }, { bands: [2100, 1800] }], look: 'glow', numbers: true });
  for (const b of [{ lanes: [{ ladder: '1kb' }] }, { lanes: [{ ladder: '5kb' }, { bands: [1] }] }, { gel: '3', lanes: [{ ladder: '1kb' }, { bands: [500] }] }, { lanes: [{ bands: [5, 300] }, { bands: [300] }] }, { lanes: [{ bands: [300, 300] }, { bands: [400] }] }, { lanes: [{ ladder: '1kb', bands: [300] }, { bands: [400] }] }]) assert.ok(OF.check('gel', b).length, JSON.stringify(b));
});

test('osmosis: tonicity, water and the result come from the solutes that cannot cross; the dots are to scale', () => {
  const blood = { scene: 'blood', solutes: [{ name: 'salt', inside: 0.9, outside: 3 }], view: 'both' };
  basics(assert, OF, 'osmosis', blood);
  assert.deepEqual(['tonicity', 'water', 'outcome'].map(k => OF.solve.osmosis(blood)[k]), ['hypertonic', 'out', 'crenated']);
  assert.deepEqual(['tonicity', 'water', 'outcome'].map(k => OF.solve.osmosis({ scene: 'plant', solutes: [{ inside: 0.3, outside: 0.1 }] })[k]), ['hypotonic', 'in', 'turgid']);
  assert.equal(OF.solve.osmosis({ scene: 'blood', solutes: [{ inside: 0.9, outside: 0.2 }], burst: true }).outcome, 'burst');
  // a solute that crosses does not count: urea outside makes no difference
  const urea = { scene: 'blood', solutes: [{ name: 'salt', inside: 0.9, outside: 0.9 }, { name: 'urea', inside: 0, outside: 5, cross: true }] };
  assert.equal(OF.solve.osmosis(urea).tonicity, 'isotonic'); assert.equal(OF.solve.osmosis(urea).solutes[1].flow, 'in');
  const u = { scene: 'utube', solutes: [{ inside: 1, outside: 3 }], unit: 'M', view: 'result' };
  assert.equal(OF.solve.osmosis(u).outcome, 'risesB'); basics(assert, OF, 'osmosis', u);
  // to scale: the side with three times the salt holds about three times the dots per area
  const dots = [...OF.svg('osmosis', { scene: 'beaker', solutes: [{ inside: 1, outside: 3 }] }).matchAll(/<circle cx="([\d.]+)" cy="([\d.]+)" r="3\.6"/g)].map(m => [+m[1], +m[2]]).filter(([, y]) => y < 210);
  const a = dots.filter(([x]) => x < 120).length, b = dots.filter(([x]) => x > 120).length;
  assert.ok(a >= 3 && b === 3 * a, `side A ${a} dots, side B ${b}: three times the concentration, three times the dots`);
  for (const p of [{ scene: 'bag', solutes: [{ name: 'starch', inside: 5, outside: 0 }, { name: 'glucose', inside: 2, outside: 2, cross: true }], view: 'both' }, { scene: 'plant', solutes: [{ inside: 0.3, outside: 0.6 }], view: 'both' }]) basics(assert, OF, 'osmosis', p);
  assert.doesNotMatch(OF.svg('osmosis', blood, { hide: 'tonicity' }), /hypertonic/);
  assert.equal(count(OF.svg('osmosis', { ...blood, view: 'start' }, { hide: 'arrows' }), /class="of-water"/g), 0);
  assert.equal(count(OF.svg('osmosis', blood, { hide: 'result' }), /class="of-cell"/g), 1);
  for (const b of [{ scene: 'lake' }, { solutes: [] }, { solutes: [{ inside: -1, outside: 2 }] }, { solutes: [{ inside: 0, outside: 0 }] }, { scene: 'plant', burst: true }, { solutes: [{ inside: 100, outside: 1 }] }]) assert.ok(OF.check('osmosis', b).length, JSON.stringify(b));
  assert.match(OF.svg('osmosis', blood, { lang: 'ru' }), /гипертонический/);
});

test('the micropipette: the wheels show the volume\'s digits for its model, the decimal line, and only volumes it can be set to', () => {
  for (const [model, value, digits] of [['P20', 12.5, '1-2-5'], ['P2', 1.25, '1-2-5'], ['P200', 125, '1-2-5'], ['P1000', 750, '0-7-5-0'], ['P10', 7.5, '0-7-5']]) {
    const d = { type: 'micropipette', model, value }, { s } = basics(assert, OF, 'reading', d), r = OF.solve.reading(d);
    assert.equal(r.digits, digits); assert.equal(r.value, value);
    assert.deepEqual([...s.matchAll(/class="of-digit">(\d)</g)].map(m => m[1]).join('-'), digits);
    assert.equal(count(s, /class="of-decimal"/g), ['P2', 'P10', 'P20'].includes(model) ? 1 : 0);
  }
  const p = OF.svg('reading', { type: 'micropipette', model: 'P20', value: 12.5 }, { print: true });
  assert.match(p, /fill="#D9D9D9"[^>]*class="of-wheel of-red"/, 'in print the decimal wheel is shaded gray');
  assert.doesNotMatch(OF.svg('reading', { type: 'micropipette', value: 12.5 }, { hide: 'value' }), /12\.5 µL/);
  assert.match(OF.svg('reading', { type: 'micropipette', value: 12.5, parts: true }, { lang: 'fr' }), /Éjecteur de cône/);
  for (const b of [{ value: 25 }, { value: 1 }, { value: 12.55 }, { model: 'P5', value: 3 }, { model: 'P1000', value: 750.5 }, { value: 12.5, tip: 'yes' }]) assert.ok(OF.check('reading', { type: 'micropipette', ...b }).length, JSON.stringify(b));
});

for (const g of ['proteinSynthesis', 'gel', 'osmosis', 'reading.micropipette']) test(`the ${g} generator: self-test, OF.check, answers from OF.solve, randomized`, async () => checkBioGenerator(assert, g));
