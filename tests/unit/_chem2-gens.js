// The figure question generators for the 1.5.0 chemistry kinds (docs/figures-api.md "Chemistry: organic structures and
// atomic energy levels (1.5.0)"): one each, shared by their tests, and the checks every one must pass (the same as the
// economics ones: _econ-gens.js): the self-test passes with the chem pack's tag and fails without it, every dealt figure
// passes OF.check, its answer is the figure's own number from OF.solve, and the numbers change from seed to seed.
export const CHEM2_GENS = {
  skeletal: {"tool": "figure.number", "vars": {"n": [3, 8], "k": [1, 7]}, "where": "k < n", "q": "Each corner and end of a skeletal formula is a carbon with enough hydrogens to make four bonds. How many hydrogen atoms does this molecule have?", "fig": {"kind": "skeletal", "chain": "{n}", "double": ["{k}"]}, "answer": "2*n", "dp": 0, "work": ["Count the carbons: {n}.", "One C=C double bond: an alkene, CₙH₂ₙ.", "2 × {n} = {=2*n} hydrogen atoms"]},
  energyLevels: {"tool": "figure.number", "vars": {"n": [3, 6], "m": [1, 2]}, "q": "The electron in a hydrogen atom falls from n = {n} to n = {m}. What is the wavelength of the light it gives out, in nm? (Eₙ = −13.6 ÷ n² eV, hc = 1239.84 eV·nm)", "fig": {"kind": "energyLevels", "transitions": [{"from": "{n}", "to": "{m}"}], "hide": "values"}, "answer": "1239.84198/(13.6*(1/(m*m) - 1/(n*n)))", "dp": 0, "unit": "nm", "work": ["ΔE = 13.6 × (1/{m}² − 1/{n}²) = {=round(13.6*(1/(m*m) - 1/(n*n)), 3)} eV", "λ = hc ÷ ΔE = 1239.84 ÷ {=round(13.6*(1/(m*m) - 1/(n*n)), 3)}", "= {=round(1239.84198/(13.6*(1/(m*m) - 1/(n*n))), 0)} nm"]},
};
/** The OF.solve value each generator's answer is (its key in the Figures catalog). */
export const CHEM2_KEYS = { skeletal: 'hydrogens', energyLevels: 'wavelength' };
export async function checkChem2Generator(assert, name) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const { flatSolve } = await import('../../public/js/figures-catalog.js');
  const g = CHEM2_GENS[name], kind = g.fig.kind, kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${name} practice` }, problems: [], gen: g };
  const page = tag => `<title>Chemistry</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(page(figTag('oomba-figures', undefined, { kinds: [kind] }))), { ok: true, problems: [] }, name);
  const noPack = selfTestHtml(page(figTag('oomba-figures', undefined, { packs: [] })));
  assert.equal(noPack.ok, false, `${name}: its pack's tag is needed`); assert.match(noPack.problems[0].why, new RegExp(`the Oomba Figures ${F.packOf(kind)} pack`));
  const seen = new Set(), key = CHEM2_KEYS[name];
  for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
    const { kind: k, hide, ...fig } = p.fig;
    assert.equal(k, kind); assert.deepEqual([...F.check(k, fig)], [], `${name} ${JSON.stringify(fig)}`);
    const want = flatSolve(F.solve[k](fig))[key];
    assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -g.dp + 1e-9, `${name}: the key ${p.answer} is the figure's ${want} (${JSON.stringify(fig)})`);
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 3, `${name} randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 4 });
  assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === kind && i.work.length >= 2));
}
