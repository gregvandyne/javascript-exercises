// The figure question generators for the 1.3.0 biology kinds and the micropipette (docs/figures-api.md "Biology
// (1.3.0)"): one each, shared by their tests, and the checks every one must pass (the same as the chemistry ones:
// _chem-gens.js): the self-test passes with the kind's pack tag and fails without it, every dealt figure passes
// OF.check, its answer is the figure's own number from OF.solve, and the numbers change from seed to seed.
import { checkChoiceGenerator } from './_choice-gens.js';
export const BIO_GENS = {
  populationGrowth: { tool: 'figure.number', vars: { r: { of: [0.2, 0.3, 0.4, 0.5, 0.6, 0.8] }, k: { of: [200, 400, 500, 800, 1000, 1200] } }, q: 'This population grows logistically with r = {r} per year. What is its fastest growth rate, in individuals per year?', fig: { kind: 'populationGrowth', model: 'logistic', n0: 10, r: '{r}', k: '{k}', span: 30, unit: 'years', hide: 'k' }, answer: 'r*k/4', dp: 0, unit: 'individuals/year', work: ['Read K off the graph: K = {k}.', 'The fastest growth is at N = K/2: dN/dt = rK/4.', '{r} × {k} ÷ 4 = {=r*k/4}'] },
  predatorPrey: { tool: 'figure.number', vars: { p: [4, 12] }, q: 'How many years does one full cycle of the prey take? Read it from peak to peak.', fig: { kind: 'predatorPrey', prey: { average: 50, start: 20 }, predators: { average: 20, start: 12 }, period: '{p}', span: '{=4*p}', unit: 'years' }, answer: 'p', dp: 0, unit: 'years', work: ['Find two prey peaks next to each other.', 'Read the time at each.', 'The difference is {p} years.'] },
  enzymeActivity: { tool: 'figure.number', vars: { t: { of: [25, 30, 35, 40, 45, 50, 55, 60] } }, q: 'At what temperature does Enzyme X work fastest, in °C?', fig: { kind: 'enzymeActivity', graph: 'temperature', curves: [{ name: 'Enzyme X', opt: '{t}', width: 10 }], axes: 'numbered', x: [0, 100] }, answer: 't', dp: 0, unit: '°C', work: ['Find the top of the curve.', 'Read down to the temperature axis.', 'The optimum is {t} °C.'] },
  photosynthesis: { tool: 'figure.number', vars: { c: { of: [0.04, 0.05, 0.1, 0.2, 0.4] } }, q: 'At {c}% CO₂ and 30 °C, what is the fastest rate of photosynthesis as the light gets brighter (arbitrary units)?', fig: { kind: 'photosynthesis', graph: 'light', curves: [{ co2: '{c}', temp: 30 }], axes: 'numbered', marks: true }, answer: '25*c/(0.1 + c)', dp: 1, work: ['As the light gets brighter, the rate levels off.', 'Then CO₂ (or temperature), not light, is the limiting factor.', 'Read the plateau: {=round(25*c/(0.1 + c), 1)}'] },
  punnett: { tool: 'figure.number', vars: { a: [0, 2], b: [0, 2] }, q: 'Tall (T) is dominant to short (t). What percent of the offspring are short?', fig: { kind: 'punnett', letters: ['T'], parents: [['{a}'], ['{b}']], names: { T: 'tall', t: 'short' }, hide: 'ratios' }, answer: '(2 - a)*(2 - b)*25', dp: 0, unit: '%', work: ['Short plants are tt.', 'Count the tt cells out of 4.', '{=(2 - a)*(2 - b)} of 4 = {=(2 - a)*(2 - b)*25}%'] },
  pedigree: { tool: 'figure.choice', vars: { m: [0, 2], s: [1, 400] }, q: 'Which inheritance pattern does this family show?', fig: { kind: 'pedigree', mode: '{m}', seed: '{s}', generations: 3 }, choices: ['autosomal dominant', 'autosomal recessive', 'X-linked recessive'], answer: 'm', work: ['Look for affected children of unaffected parents (recessive), or the trait in every generation (dominant).', 'Check whether mostly males are affected (X-linked).', 'The pattern is {choice}.'] },
  proteinSynthesis: { tool: 'figure.number', vars: { s: { of: ['GCAUGGCUUCAAAGGGCUGGACCGAAUUCCGA', 'CAUGUUUGGACACGAUCCGGUAGCAAAACUG', 'UCAUGCCCGGAUUACUCGAAGCUUGGCACGUC', 'ACAUGAAAGUUCUCGGCCAGUUGGAUCCUAAC', 'GGAUGCGAACCUUUGGGCAGCAAUCGGUGCUU'] }, n: [3, 8] }, q: 'Translation starts at the first AUG. How many amino acids does this mRNA code for?', fig: { kind: 'proteinSynthesis', mrna: '{s}', rows: ['mrna'], codons: '{n}' }, answer: 'n', dp: 0, work: ['Find the start codon, AUG.', 'Count the codons from there: each codon is one amino acid.', 'There are {n} amino acids.'] },
  gel: { tool: 'figure.number', vars: { a: [5, 30], b: [5, 30] }, where: '(a - b >= 4) + (b - a >= 4)', q: 'A plasmid was cut into the pieces in lane 2. How long was the plasmid, in bp?', fig: { kind: 'gel', gel: '1', lanes: [{ ladder: '1kb' }, { label: 'Digest', bands: ['{=100*a}', '{=100*b}'] }], values: true }, answer: '100*(a + b)', dp: 0, unit: 'bp', work: ['The pieces add up to the whole plasmid.', '{=100*a} + {=100*b}', '= {=100*(a + b)} bp'] },
  osmosis: { tool: 'figure.choice', vars: { m: [0, 2], k: [2, 8], c: [5, 30] }, q: 'Urea crosses the membrane; salt does not. Which way does water move across the cell membrane?', fig: { kind: 'osmosis', scene: 'blood', solutes: [{ name: 'salt', inside: 0.9, outside: '{=0.9 + (m == 1)*k/10 - (m == 0)*k/10}' }, { name: 'urea', inside: 1, outside: '{=c/10}', cross: true }], view: 'start', particles: false, arrows: false, hide: 'tonicity' }, choices: ['into the cell', 'out of the cell', 'no net movement'], answer: 'm', work: ['Urea crosses the membrane, so it does not count.', 'Compare the salt: 0.9% inside, {=0.9 + (m == 1)*k/10 - (m == 0)*k/10}% outside.', 'Water moves toward the side with more salt that cannot cross. Answer: {choice}.'] },
  'reading.micropipette': { tool: 'figure.number', vars: { m: [20, 200] }, q: 'What volume is the micropipette set to, in µL?', fig: { kind: 'reading', type: 'micropipette', model: 'P20', value: '{=m/10}', hide: 'value' }, answer: 'm/10', dp: 1, unit: 'µL', work: ['A P20 reads tens, ones and tenths of a µL.', 'The red wheel, below the line, is the tenths.', 'The volume is {=m/10} µL.'] },
};
/** The OF.solve value each generator's answer is (its key in the Figures catalog). */
export const BIO_KEYS = { populationGrowth: 'maxRate', predatorPrey: 'period', enzymeActivity: 'optimum', photosynthesis: 'plateau', punnett: 'recessivePercent', pedigree: 'mode', proteinSynthesis: 'aminoAcids', gel: 'totals.2', osmosis: 'water', 'reading.micropipette': 'value' };
/** A multiple choice generator's OF.solve value (its key above) to the option each value means (its pick in the catalog). */
export const BIO_PICKS = { pedigree: { ad: 0, ar: 1, xr: 2 }, osmosis: { in: 0, out: 1, none: 2 } };
export async function checkBioGenerator(assert, name) {
  if (BIO_GENS[name].tool === 'figure.choice') return checkChoiceGenerator(assert, name, BIO_GENS[name], BIO_KEYS[name], BIO_PICKS[name], 'Biology');
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const { flatSolve } = await import('../../public/js/figures-catalog.js');
  const g = BIO_GENS[name], kind = g.fig.kind, kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${name} practice` }, problems: [], gen: g };
  const page = tag => `<title>Biology</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(page(figTag('oomba-figures', undefined, { kinds: [kind] }))), { ok: true, problems: [] }, name);
  const noPack = selfTestHtml(page(figTag('oomba-figures', undefined, { packs: [] })));
  assert.equal(noPack.ok, false, `${name}: its pack's tag is needed`); assert.match(noPack.problems[0].why, new RegExp(`the Oomba Figures ${F.packOf(kind)} pack`));
  const seen = new Set(), key = BIO_KEYS[name];
  for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
    const { kind: k, hide, ...fig } = p.fig;
    assert.equal(k, kind); assert.deepEqual([...F.check(k, fig)], [], `${name} ${JSON.stringify(fig)}`);
    const want = flatSolve(F.solve[k](fig))[key];
    assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -g.dp + 1e-9, `${name}: the key ${p.answer} is the figure's ${want}`);
    if (kind === 'pedigree') assert.equal(F.solve.pedigree(fig).tells, true, `${name}: a student can tell the mode (${JSON.stringify(fig)})`);
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 3, `${name} randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 4 });
  assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === kind && i.work.length >= 2));
}
