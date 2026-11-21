// The figure question generators for the 1.4.0 economics kinds (docs/figures-api.md "Economics (1.4.0)"): one each,
// shared by their tests, and the checks every one must pass (the same as the biology ones: _bio-gens.js): the self-test
// passes with the econ pack's tag and fails without it, every dealt figure passes OF.check, its answer is the figure's
// own number from OF.solve, and the numbers change from seed to seed.
const ROWS = [70, 80, 90, 100, 110, 120, 130].map(pl => [pl, `{=100*y - 60*(${pl} - p)}`, `{=100*y + 40*(${pl} - p)}`]);
export const ECON_GENS = {
  supplyDemand: { tool: 'figure.number', vars: { p: [2, 8], q: { of: [20, 30, 40, 50, 60] } }, q: 'Demand meets the price axis at ${=p + q/10}. What is the consumer surplus at the equilibrium, in dollars?', fig: { kind: 'supplyDemand', demand: { at: '{=p + q/10}', slope: -0.1 }, supply: { at: '{=p - q/20}', slope: 0.05 }, shade: ['cs'], xtitle: 'Quantity', ytitle: 'Price ($)' }, answer: 'q*q/20', dp: 0, unit: '$', work: ['Consumer surplus is the triangle under demand and over the price.', 'Its height is {=p + q/10} − {p} = {=q/10}, its base {q}.', '½ × {q} × {=q/10} = {=q*q/20}'] },
  moneyMarket: { tool: 'figure.number', vars: { s: { of: [1, -1] }, d: { of: [1, -1] } }, q: 'Money supply and money demand both shift as shown. Write 1 if the nominal interest rate rises, 2 if it ends where it started, or 3 if it falls.', fig: { kind: 'moneyMarket', graph: 'money', shift: { supply: '{s}', demand: '{d}' } }, answer: '2 - (d - s)/2', dp: 0, work: ['More money supplied lowers the interest rate; more money demanded raises it.', 'Compare i₁ and i₂ on the graph.', 'The answer is {=2 - (d - s)/2}.'] },
  businessCycle: { tool: 'figure.number', vars: { n: [1, 4], s: [1, 900] }, q: 'How many recessions (a fall from a peak to the next trough) does the graph show?', fig: { kind: 'businessCycle', cycles: '{n}', start: 'peak', irregularity: 0.5, seed: '{s}', shade: false, hide: 'labels' }, answer: 'n', dp: 0, work: ['Find each peak.', 'Count each fall from a peak down to the next trough.', 'There are {n}.'] },
  phillipsCurve: { tool: 'figure.number', vars: { u: { of: [4, 5, 6] }, e: [1, 4], k: [2, 5] }, q: 'The economy moves along the short-run Phillips curve from A to B, then expectations catch up and it moves to C. What is inflation at C, in %?', fig: { kind: 'phillipsCurve', nru: '{u}', expected: '{e}', u2: '{=u - 2}', pi2: '{=e + k}', movement: 'along', longRun: true, hide: 'values' }, answer: 'e + k', dp: 0, unit: '%', work: ['C is on the long-run curve, at the natural rate.', 'Inflation at C is the same as at B: expected inflation has caught up.', 'Read B: {=e + k}%.'] },
  possibilitiesCurve: { tool: 'figure.number', vars: { a: { of: [10, 20, 30, 40, 60] }, b: { of: [10, 20, 40, 50, 60] } }, where: 'a != b', q: 'What is Country A\'s opportunity cost of 1 ton of wheat, in tons of cloth?', fig: { kind: 'possibilitiesCurve', countries: [{ name: 'Country A', x: '{a}', y: '{b}' }, { name: 'Country B', x: 30, y: 30 }], goods: ['Wheat (tons)', 'Cloth (tons)'] }, answer: 'b/a', dp: 2, unit: 'tons of cloth', work: ['Country A gives up {b} tons of cloth to make {a} tons of wheat.', 'One ton of wheat costs {b} ÷ {a} tons of cloth.', '= {=round(b/a, 2)}'] },
  adAs: { tool: 'figure.number', vars: { p: { of: [80, 90, 100, 110] }, y: [80, 94] }, q: 'Potential GDP is 9,500 (billions of dollars). How large is the recessionary gap, potential GDP minus real GDP at the equilibrium, in billions?', fig: { kind: 'adAs', schedule: ROWS, potential: 9500, xtitle: 'Real GDP (billions)', ytitle: 'Price level' }, answer: '9500 - 100*y', dp: 0, unit: 'billion', work: ['Read real GDP where AD crosses SRAS: {=100*y}.', 'Subtract it from potential GDP: 9,500 − {=100*y}.', '= {=9500 - 100*y}'] },
  costCurves: { tool: 'figure.number', vars: { c: { of: [3, 3.5, 4, 4.5, 5] }, q: { of: [4, 5, 6, 7] } }, q: 'This perfectly competitive firm is in long-run equilibrium: the price is at the lowest point of ATC. What is the price?', fig: { kind: 'costCurves', market: 'perfect', price: 'breakeven', atc: { q: '{q}', cost: '{c}' }, mcSlope: 1, axes: 'numbered', hide: 'values' }, answer: 'c', dp: 2, unit: '$', work: ['In the long run, entry and exit push the price to the lowest ATC.', 'Find where MC crosses ATC: the lowest point of ATC.', 'Read across: ${c}.'] },
};
/** The OF.solve value each generator's answer is (its key in the Figures catalog). */
export const ECON_KEYS = { supplyDemand: 'cs', moneyMarket: 'rateMove', businessCycle: 'recessions', phillipsCurve: 'C.inflation', possibilitiesCurve: 'countryA.costX', adAs: 'gapSize', costCurves: 'price' };
export async function checkEconGenerator(assert, name) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const { flatSolve } = await import('../../public/js/figures-catalog.js');
  const g = ECON_GENS[name], kind = g.fig.kind, kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${name} practice` }, problems: [], gen: g };
  const page = tag => `<title>Economics</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(page(figTag('oomba-figures', undefined, { kinds: [kind] }))), { ok: true, problems: [] }, name);
  const noPack = selfTestHtml(page(figTag('oomba-figures', undefined, { packs: [] })));
  assert.equal(noPack.ok, false, `${name}: its pack's tag is needed`); assert.match(noPack.problems[0].why, new RegExp(`the Oomba Figures ${F.packOf(kind)} pack`));
  const seen = new Set(), key = ECON_KEYS[name];
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
