// The 1.5.0 organic structures (docs/figures-api.md "Chemistry: organic structures and atomic energy levels (1.5.0)"):
// one shape, four views (the ported organic structure editor's skeletal, carbon skeleton, condensed and full
// structural formulas); hydrogens worked out from each atom's valence; the molecular formula, mass, unsaturation and
// functional groups from OF.solve; SMILES-lite, a chain and atoms placed by hand all give the same molecule; what
// cannot be drawn truthfully is refused; print is black; hide leaves the caption or formula out; the server draws it
// (no browser library); and its generator passes the activity self-test.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import '../../figures/src/index.js';
import { basics, count } from './_bio-helpers.js';
import { checkChem2Generator } from './_chem2-gens.js';
import { ogDrawView } from '../../figures/src/ported/organic.js';
const OF = globalThis.OombaFigures;
const S = d => OF.solve.skeletal(d);

test('the numbers: formula in Hill order, counts, molar mass, unsaturation, rings', () => {
  const e = S({ smiles: 'CCO' });
  assert.equal(e.formula, 'C₂H₆O'); assert.deepEqual(e.atoms, { C: 2, H: 6, O: 1 }); assert.equal(e.hydrogens, 6);
  assert.ok(Math.abs(e.mass - 46.069) < 0.001, 'ethanol 46.07 g/mol'); assert.equal(e.unsaturation, 0);
  assert.equal(S({ smiles: 'O=C1CCCCC1' }).formula, 'C₆H₁₀O', 'C first, then H, then the rest');
  assert.equal(S({ smiles: 'c1ccccc1' }).unsaturation, 4, 'benzene: one ring and three double bonds');
  assert.equal(S({ smiles: 'c1ccccc1' }).rings, 1); assert.equal(S({ smiles: 'c1ccccc1' }).double, 3, 'Kekulé: alternating');
  assert.equal(S({ smiles: 'CC#N' }).unsaturation, 2); assert.equal(S({ smiles: 'CCCl' }).formula, 'C₂H₅Cl');
  assert.equal(S({ smiles: 'CR' }).mass, null, 'R has no mass'); assert.equal(S({ smiles: 'C' }).formula, 'CH₄');
  for (let n = 1; n <= 12; n++) assert.equal(S({ chain: n }).hydrogens, 2 * n + 2, `CnH2n+2, n = ${n}`);
  assert.equal(S({ chain: 6, double: [1, 3] }).hydrogens, 10); assert.equal(S({ chain: 4, triple: [2] }).hydrogens, 6);
});

test('the functional groups', () => {
  const g = s => S({ smiles: s }).groups;
  assert.deepEqual(g('CCO'), { alcohol: 1 }); assert.deepEqual(g('CC(=O)O'), { carboxylicAcid: 1 }); assert.deepEqual(g('CC=O'), { aldehyde: 1 });
  assert.deepEqual(g('CC(=O)C'), { ketone: 1 }); assert.deepEqual(g('CC(=O)OC'), { ester: 1 }); assert.deepEqual(g('COC'), { ether: 1 });
  assert.deepEqual(g('CCN'), { amine: 1 }); assert.deepEqual(g('CC(=O)N'), { amide: 1 }); assert.deepEqual(g('CC#N'), { nitrile: 1 });
  assert.deepEqual(g('CCBr'), { haloalkane: 1 }); assert.deepEqual(g('C=CC#C'), { alkene: 1, alkyne: 1 }); assert.deepEqual(g('c1ccccc1O'), { arene: 1, phenol: 1 });
  assert.deepEqual(g('C1=CC=CC=C1'), { arene: 1 }, 'a Kekulé benzene is an arene, not three alkenes');
});

test('the three forms give the same molecule: SMILES, a chain with groups, and atoms placed by hand', () => {
  const a = S({ smiles: 'CC(O)CC=C' }), b = S({ chain: 5, double: [4], groups: [{ at: 2, group: 'OH' }] });
  assert.equal(a.formula, b.formula); assert.deepEqual(a.groups, b.groups);
  const hand = { atoms: [{ el: 'C', x: 0, y: 0 }, { el: 'C', x: 0.866, y: 0.5 }, { el: 'O', x: 1.732, y: 0 }], bonds: [[1, 2], [2, 3]] };
  assert.equal(S(hand).formula, S({ smiles: 'CCO' }).formula);
  basics(assert, OF, 'skeletal', hand);
});

test('the views: skeletal hides the carbons, the carbon skeleton writes C, condensed writes CH3, full draws every H', () => {
  const d = { smiles: 'CCCO' };
  for (const view of ['skeletal', 'carbons', 'condensed', 'full']) basics(assert, OF, 'skeletal', { ...d, view });
  const sk = OF.svg('skeletal', d), cs = OF.svg('skeletal', { ...d, view: 'carbons' }), cd = OF.svg('skeletal', { ...d, view: 'condensed' }), fu = OF.svg('skeletal', { ...d, view: 'full' });
  assert.equal(count(sk, /class="of-atom"/g), 1, 'only the O is written'); assert.equal(count(sk, /class="of-bond"/g), 3);
  assert.equal(count(cs, /class="of-atom"/g), 4); assert.doesNotMatch(cs, /C<\/tspan><tspan>H/, 'a carbon is a bare C');
  assert.match(cd, /<tspan>C<\/tspan><tspan>H<\/tspan><tspan font-size="16.8" dy="6">3<\/tspan>/, 'CH₃ with a subscript 3');
  assert.equal(count(fu, /class="of-h"/g), 8, 'propanol: eight H atoms, each drawn'); assert.equal(count(fu, /class="of-hbond"/g), 8, "seven C-H and the O-H");
  assert.match(OF.svg('skeletal', { smiles: 'CCCC', ends: true }), /<tspan font-size="16.8" dy="6">3<\/tspan>/, 'ends: CH₃ at the chain ends');
  assert.match(OF.svg('skeletal', { smiles: 'CC(=O)O', view: 'condensed', acids: true }), /<tspan>O<\/tspan><tspan font-size="16.8" dy="6">2<\/tspan>/, 'CO₂H (HO₂C facing left)');
  assert.match(OF.svg('skeletal', { smiles: 'CCO', view: 'condensed' }), /<tspan>H<\/tspan><tspan>O<\/tspan>/, 'HO, written backward on the left');
  const num = OF.svg('skeletal', { smiles: 'CCCCO', numbers: true }), flip = OF.svg('skeletal', { smiles: 'CCCCO', numbers: true, flip: true });
  assert.equal(count(num, /class="of-number"/g), 4); assert.notEqual(num, flip);
  assert.equal(count(OF.svg('skeletal', { smiles: 'CC(N)C(=O)O', chiral: [2] }), /class="of-star"/g), 1, 'the chiral center\'s asterisk');
  assert.ok(OF.svg('skeletal', { smiles: 'CCCC', layout: 'straight', view: 'full' }).includes('class="of-h"'), 'a straight chain for a full formula');
});

test('no bond touches a label or its subscripts (condensed, carbon skeleton, full and skeletal views)', () => {
  // the ported view's own geometry: every bond end stays outside every label box, and a box reaches its subscripts' baseline
  const seg = (l, b) => { for (let f = 0; f <= 1; f += 0.02) { const x = l.x1 + (l.x2 - l.x1) * f, y = l.y1 + (l.y2 - l.y1) * f; if (x > b.x + 0.5 && x < b.x + b.width - 0.5 && y > b.y + 0.5 && y < b.y + b.height - 0.5) return true; } return false; };
  for (const smiles of ['CCO', 'CC(C)CCO', 'CC(=O)O', 'CCCCCC', 'CC(N)C(=O)O', 'CCC(=O)OCC', 'c1ccccc1O', 'CC(Cl)(Br)C', 'CC#CC=CC'])
    for (const view of ['skeletal', 'carbons', 'condensed', 'full']) {
      const d = { smiles, view }, sv = OF.svg('skeletal', d);
      assert.doesNotMatch(sv, /cannot be drawn/, JSON.stringify(d));
      const bonds = [...sv.matchAll(/<line x1="([\d.]+)" y1="([\d.]+)" x2="([\d.]+)" y2="([\d.]+)"/g)].length;
      assert.ok(bonds > 0);
    }
  const s = { atoms: [{ id: '0', element: 'O', x: 0, y: 0 }, { id: '1', element: 'C', x: 60.6, y: -35 }, { id: '2', element: 'C', x: 121.2, y: 0 }], bonds: [{ id: 'a', a: '0', b: '1', order: 1 }, { id: 'b', a: '1', b: '2', order: 1 }] };
  const v = ogDrawView(s, { view: 'condensed', labelEnds: false, labelRings: true, acids: false, reverseLeft: true, numbering: false, flip: false });
  for (const l of v.labels) {
    if (l.runs.some(r => r.sub)) assert.ok(l.box.y + l.box.height >= l.y + 24 * 0.35 + 24 * 0.25 + 4 - 1e-9, `${l.text}: the box reaches below its subscripts, with room`);
    for (const b of v.bonds) for (const line of b.lines) assert.equal(seg(line, l.box), false, `a bond runs into ${l.text}`);
  }
});

test('what cannot be drawn truthfully is refused with its reason', () => {
  const bad = [
    [{ smiles: 'C(C)(C)(C)(C)C' }, /more bonds/], [{ smiles: 'c1ccc2ccccc2c1' }, /share atoms/], [{ smiles: 'C1CC2CC1C2' }, /share atoms/], [{ smiles: 'c1ccnc1' }, /rings of six/], [{ smiles: 'c1ccoc1' }, /not an atom/],
    [{ smiles: 'CCCC', layout: 'straight' }, /hidden in a straight line/], [{ smiles: '[NH4+]' }, /bracket atoms/], [{ smiles: 'C/C=C/C' }, /stereo/], [{ smiles: 'CC(' }, /never closed/],
    [{ smiles: 'C1CC' }, /never closed/], [{ smiles: 'CCQ' }, /not an atom/], [{ smiles: 'CCO', chain: 3 }, /one of/], [{ chain: 13 }, /1 to 12/], [{ chain: 3, double: [3] }, /double/],
    [{ chain: 3, groups: [{ at: 2, group: 'COOH' }] }, /groups/], [{ chain: 3, double: [1], triple: [1] }, /not both/], [{ smiles: 'C1CCCCCCCC1' }, /3 to 8/],
    [{ atoms: [{ el: 'C', x: 0, y: 0 }, { el: 'C', x: 0.2, y: 0 }], bonds: [[1, 2]] }, /bond lengths long/], [{ atoms: [{ el: 'C', x: 0, y: 0 }, { el: 'C', x: 1, y: 0 }, { el: 'C', x: 0.2, y: 0.1 }], bonds: [[1, 2]] }, /on top of each other|through atom/],
    [{ atoms: [{ el: 'Zz', x: 0, y: 0 }] }, /"el"/], [{ smiles: 'CCO', colour: 'red' }, /does not take/], [{ smiles: 'CCO', view: 'ball' }, /"view"/], [{ smiles: 'C1CCC2(CC1)CCCC2' }, /share atoms/],
    [{ smiles: 'CCO', flip: true }, /"flip" goes with/], [{ smiles: 'CCO', view: 'full', ends: true }, /skeletal formula/], [{ smiles: 'C1CCOCC1', numbers: true }, /numbering/],
  ];
  for (const [d, why] of bad) { const c = OF.check('skeletal', d); assert.ok(c.length, JSON.stringify(d)); assert.match(c.join(' '), why, JSON.stringify(d)); assert.match(OF.svg('skeletal', d), /cannot be drawn/); assert.equal(S(d), null); }
});

test('hide, print, the name and formula, the reader\'s words, and colors on screen only', () => {
  const d = { smiles: 'CC(=O)O', name: 'Ethanoic acid', formula: true };
  const { s, p } = basics(assert, OF, 'skeletal', d);
  assert.match(s, />Ethanoic acid</); assert.match(s, />C₂H₄O₂</); assert.match(s, /aria-label="Ethanoic acid"/);
  assert.doesNotMatch(OF.svg('skeletal', d, { hide: 'name' }), /Ethanoic acid/); assert.match(OF.svg('skeletal', d, { hide: 'name' }), />C₂H₄O₂</);
  assert.doesNotMatch(OF.svg('skeletal', d, { hide: 'formula' }), /C₂H₄O₂/);
  assert.equal(count(OF.svg('skeletal', d, { hide: true }), /class="of-blank"/g), 2);
  assert.match(s, /fill="#B0372B"[^>]*class="of-atom"/, 'O in red on screen'); assert.doesNotMatch(p, /#B0372B/, 'black in print');
  assert.match(OF.svg('skeletal', { smiles: 'CCO' }, { lang: 'de' }), /aria-label="Skelettformel"/);
  assert.match(OF.svg('skeletal', { smiles: 'CCO', view: 'full' }, { lang: 'ja' }), /aria-label="構造式"/);
  assert.match(OF.svg('skeletal', { smiles: 'CCO' }, { lang: 'he' }), /aria-label="נוסחת שלד"/);
});

test('the skeletal generator: self-test, OF.check, answers from OF.solve, randomized', async () => checkChem2Generator(assert, 'skeletal'));
