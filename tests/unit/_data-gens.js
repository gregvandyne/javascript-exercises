// The figure question generators for the 1.1.0 data displays, probability figures and the protractor
// (docs/figures-api.md): one per kind, and the checks every one of these kinds shares, used by their tests.
import { FIG_WORDS } from '../../figures/src/words.js';
import { CODES } from '../../server/i18n/index.js';

export const DATA_GENS = {
  barGraph: { tool: 'figure.number', vars: { a: [3, 15], b: [3, 15], c: [2, 12] }, q: 'The bar graph shows how many students chose each fruit. How many students were asked in all?', fig: { kind: 'barGraph', categories: ['Apples', 'Bananas', 'Grapes'], values: ['{a}', '{b}', '{c}'], ytitle: 'Students' }, answer: 'a + b + c', dp: 0, work: ['Add the heights of the bars.', '{a} + {b} + {c}', '= {=a + b + c}'] },
  dotPlot: { tool: 'figure.number', vars: { a: [1, 6], b: [3, 6] }, q: 'What is the range of the data?', fig: { kind: 'dotPlot', data: ['{a}', '{=a + 1}', '{=a + 2}', '{=a + 2}', '{=a + b}'], xtitle: 'Pets' }, answer: 'b', dp: 0, work: ['Range = largest − smallest', '= {=a + b} − {a}', '= {b}'] },
  histogram: { tool: 'figure.number', vars: { a: [2, 12], b: [2, 12], c: [2, 40, 2] }, q: 'What is the frequency density of the 20 to 40 class?', fig: { kind: 'histogram', bins: [[0, 10], [10, 20], [20, 40]], counts: ['{a}', '{b}', '{c}'], xtitle: 'Time (minutes)' }, answer: 'c/20', dp: 2, work: ['Frequency density = frequency ÷ class width', '= {c} ÷ 20', '= {=c/20}'] },
  boxPlot: { tool: 'figure.number', vars: { a: [10, 30], b: [2, 8], c: [2, 8], e: [2, 8], f: [2, 8] }, q: 'What is the interquartile range?', fig: { kind: 'boxPlot', summary: ['{a}', '{=a + b}', '{=a + b + c}', '{=a + b + c + e}', '{=a + b + c + e + f}'], values: true, step: 2 }, answer: 'c + e', dp: 0, work: ['IQR = Q3 − Q1', '= {=a + b + c + e} − {=a + b}', '= {=c + e}'] },
  scatterPlot: { tool: 'figure.number', vars: { m: [1, 5], k: [2, 10], c: [1, 3] }, q: 'What is the slope of the line of best fit?', fig: { kind: 'scatterPlot', points: [[1, '{=m + k + c}'], [2, '{=2*m + k}'], [3, '{=3*m + k - 2*c}'], [4, '{=4*m + k}'], [5, '{=5*m + k + c}']], fit: true }, answer: 'm', dp: 2, work: ['The line of best fit goes up {m} for every 1 across.', 'Slope = {m}'] },
  stemAndLeaf: { tool: 'figure.number', vars: { a: [2, 5], b: [5, 9] }, q: 'What is the median of the data?', fig: { kind: 'stemAndLeaf', data: ['{=10*a + 1}', '{=10*a + 4}', '{=10*a + b}', '{=10*a + 12}', '{=10*a + 17}'] }, answer: '10*a + b', dp: 0, work: ['There are 5 values, so the median is the 3rd.', 'Stem {a}, leaf {b}: {=10*a + b}'] },
  pieChart: { tool: 'figure.number', vars: { a: [6, 14], b: [6, 14] }, q: '36 students were asked how they get to school. What is the angle of the Walk sector?', fig: { kind: 'pieChart', slices: [{ name: 'Walk', value: '{a}' }, { name: 'Bus', value: '{b}' }, { name: 'Car', value: '{=36 - a - b}' }], show: ['name', 'value'] }, answer: 'a*10', dp: 0, unit: '°', work: ['Each student is 360° ÷ 36 = 10°.', '{a} × 10° = {=a*10}°'] },
  cumulativeFrequency: { tool: 'figure.number', vars: { a: [2, 10], b: [4, 16], c: [4, 20], d: [2, 10] }, q: 'How many values are 30 or less?', fig: { kind: 'cumulativeFrequency', bins: [[0, 10], [10, 20], [20, 30], [30, 40]], counts: ['{a}', '{b}', '{c}', '{d}'], join: 'lines' }, answer: 'a + b + c', dp: 0, work: ['Read the graph at 30.', '{a} + {b} + {c} = {=a + b + c}'] },
  normalCurve: { tool: 'figure.number', vars: { m: [40, 100, 10], j: [5, 25, 5] }, q: 'The mean is {m} and the standard deviation 10. What is the z-score where the shaded region starts?', fig: { kind: 'normalCurve', mean: '{m}', sd: 10, regions: [{ from: '{=m + j}' }] }, answer: 'j/10', dp: 1, work: ['z = (x − mean) ÷ standard deviation', '= ({=m + j} − {m}) ÷ 10', '= {=j/10}'] },
  treeDiagram: { tool: 'figure.number', vars: { r: [2, 6], b: [2, 6] }, q: 'A bag has {r} red and {b} blue marbles. Two are taken without replacement. What is the probability both are red?', fig: { kind: 'treeDiagram', stages: ['1st', '2nd'], branches: [{ name: 'R', p: ['{r}', '{=r + b}'], then: [{ name: 'R', p: ['{=r - 1}', '{=r + b - 1}'] }, { name: 'B', p: ['{b}', '{=r + b - 1}'] }] }, { name: 'B', p: ['{b}', '{=r + b}'], then: [{ name: 'R', p: ['{r}', '{=r + b - 1}'] }, { name: 'B', p: ['{=b - 1}', '{=r + b - 1}'] }] }], hide: 'products' }, answer: 'r*(r - 1)/((r + b)*(r + b - 1))', dp: 3, work: ['Multiply along the R, R branches.', '{r}/{=r + b} × {=r - 1}/{=r + b - 1}', '= {=round(r*(r - 1)/((r + b)*(r + b - 1)), 3)}'] },
  vennDiagram: { tool: 'figure.number', vars: { a: [2, 12], b: [2, 12], c: [1, 8], n: [1, 9] }, q: 'How many students have a cat or a dog (or both)?', fig: { kind: 'vennDiagram', sets: ['Cat', 'Dog'], counts: { A: '{a}', B: '{b}', AB: '{c}', none: '{n}' } }, answer: 'a + b + c', dp: 0, work: ['Add every number inside the circles.', '{a} + {c} + {b} = {=a + b + c}'] },
  twoWayTable: { tool: 'figure.number', vars: { a: [5, 20], b: [5, 20], c: [5, 20], d: [5, 20] }, q: 'How many students take the bus in all?', fig: { kind: 'twoWayTable', columns: ['Bus', 'Walk'], rows: ['Grade 7', 'Grade 8'], counts: [['{a}', '{b}'], ['{c}', '{d}']], blanks: [[2, 0]] }, answer: 'a + c', dp: 0, work: ['Add the Bus column.', '{a} + {c} = {=a + c}'] },
  tableOfValues: { tool: 'figure.number', vars: { m: [2, 6], k: [1, 9] }, q: 'The table follows the rule y = {m}x + {k}. What is y when x = 4?', fig: { kind: 'tableOfValues', rule: '{m}*x + {k}', from: 0, to: 4, blanks: [4] }, answer: '4*m + k', dp: 0, work: ['y = {m} × 4 + {k}', '= {=4*m + k}'] },
  protractor: { tool: 'figure.number', vars: { a: [10, 170, 5] }, where: 'a != 90', q: 'Read the protractor. What does the angle measure?', fig: { kind: 'protractor', angle: '{a}', reading: true, hide: 'reading' }, answer: 'a', dp: 0, unit: '°', work: ['One ray is on 0 of the inner scale.', 'The other ray crosses the inner scale at {a}.', 'The angle is {a}°.'] },
};

const COLOR_RE = /#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#141414|#E1F1E1|#E9F3FA|#0F5A37/;
/**
 * The checks a 1.1.0 data kind shares: good data draws one accessible <svg> with nothing undefined; bad data is named
 * by OF.check, draws the "cannot be drawn" card and solves to null; print is black on white; the frozen 1.1.0 file
 * draws what the source draws; the kind's name in every site language; and its generator (the activity self-test, and
 * every dealt set a figure that draws whose key is what OF.solve says). key: the solve result -> the number asked for.
 */
export async function checkDataKind(assert, OF, kind, { good, bad, key, gen, title }) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  assert.ok(OF.kinds.includes(kind), kind);
  const F = figuresKit(FIG_LATEST['oomba-figures']);
  for (const d of good) {
    assert.deepEqual(OF.check(kind, d), [], `${kind} ${JSON.stringify(d)}`);
    const s = OF.svg(kind, d, { title: 'Chart' });
    assert.match(s, /role="img" aria-label="Chart"/); assert.match(s, new RegExp(`class="of-fig of-${kind}"`));
    assert.doesNotMatch(s, /cannot be drawn|NaN|undefined|Infinity|\[object/, JSON.stringify(d));
    assert.ok(OF.solve[kind](d), 'it solves');
    assert.doesNotMatch(OF.svg(kind, d, { print: true }), COLOR_RE, `${kind} prints black on white`);
    assert.equal(F.svg(kind, d, { lang: 'es' }), OF.svg(kind, d, { lang: 'es' }), 'the frozen 1.1.0 file draws the same');
    assert.equal(F.svg(kind, d, { print: true, hide: true }), OF.svg(kind, d, { print: true, hide: true }));
  }
  for (const [d, re] of bad) {
    assert.match(OF.check(kind, d).join('; '), re, JSON.stringify(d));
    assert.match(OF.svg(kind, d), /cannot be drawn/); assert.equal(OF.solve[kind](d), null);
    assert.equal(JSON.stringify(F.check(kind, d)), JSON.stringify(OF.check(kind, d)));
  }
  for (const c of CODES) { const W = FIG_WORDS[c] || FIG_WORDS[c.split('-')[0]]; assert.ok(OF.svg(kind, good[0], { lang: c }).includes(`<title>${title ? title(W) : W[kind]}</title>`) || 'heading' in good[0], `${kind} ${c}`); }
  // the generator
  const g = gen || DATA_GENS[kind], kit = canvasKit();
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${kind} practice` }, problems: [], gen: g };
  const html = `<title>Data</title>\n${figTag('oomba-figures')}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(html), { ok: true, problems: [] }, kind);
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
    const { kind: k, hide, ...fig } = p.fig;
    assert.equal(k, kind); assert.equal(JSON.stringify(F.check(k, fig)), '[]', `${kind} ${JSON.stringify(fig)}`);
    const want = key(F.solve[k](fig));
    assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -g.dp + 1e-9, `${kind}: the key ${p.answer} is the figure's ${want}`);
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 4, `${kind} randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 4 });
  assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === kind && i.work.length >= 2));
}
export const count = (s, cls) => (s.match(new RegExp(`class="${cls}"`, 'g')) || []).length;
