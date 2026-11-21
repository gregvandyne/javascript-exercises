// The figure question generators for the 1.1.0 geometry kinds (docs/figures-api.md): one per kind, shared by their tests.
export const GEOMETRY_GENS = {
  angles: { tool: 'figure.number', vars: { a: [20, 70, 5] }, q: 'The two angles together make a right angle. Find x.', fig: { kind: 'angles', rays: [0, '{a}', 90], angles: [{ from: 0, to: 1, label: '{a}' }, { from: 1, to: 2, label: 'x' }, { from: 0, to: 2, label: false }] }, answer: '90 - a', dp: 0, unit: '°', work: ['Complementary angles add up to 90°.', 'x = 90° − {a}°', 'x = {=90 - a}°'] },
  parallelLines: { tool: 'figure.number', vars: { a: [40, 140, 5] }, where: 'a != 90', q: 'Lines m and n are parallel. Find x.', fig: { kind: 'parallelLines', transversals: [{ angle: '{a}' }], angles: [{ number: 2, label: '{a}' }, { number: 8, label: 'x' }] }, answer: '180 - a', dp: 0, unit: '°', work: ['Angles 2 and 8 are same-side exterior angles, so they add up to 180°.', 'x = 180° − {a}°', 'x = {=180 - a}°'] },
  segmentAddition: { tool: 'figure.number', vars: { x: [2, 9], a: [1, 4], b: [1, 6], c: [1, 5], d: [0, 6] }, q: 'B is on AC. Find x.', fig: { kind: 'segmentAddition', points: ['A', 'B', 'C'], unknown: { x: '{x}' }, parts: [{ expr: ['{a}', '{b}'] }, { expr: ['{c}', '{d}'] }], spans: [{ from: 'A', to: 'C', label: '{=(a + c)*x + b + d}' }] }, answer: 'x', dp: 0, work: ['AB + BC = AC', '({a}x + {b}) + ({c}x + {d}) = {=(a + c)*x + b + d}', '{=a + c}x + {=b + d} = {=(a + c)*x + b + d}', 'x = {x}'] },
  circle: { tool: 'figure.number', vars: { c: [40, 160, 10] }, q: 'O is the center of the circle. Find the inscribed angle x.', fig: { kind: 'circle', points: [{ name: 'A', at: '{=270 - c/2}' }, { name: 'B', at: '{=270 + c/2}' }, { name: 'C', at: 90 }], lines: [{ from: 'O', to: 'A' }, { from: 'O', to: 'B' }, { from: 'C', to: 'A' }, { from: 'C', to: 'B' }], angles: [{ at: 'O', from: 'A', to: 'B' }, { at: 'C', from: 'A', to: 'B', label: 'x' }] }, answer: 'c/2', dp: 0, unit: '°', work: ['An inscribed angle is half the central angle on the same arc.', 'x = {c}° ÷ 2', 'x = {=c/2}°'] },
  grid: { tool: 'figure.number', vars: { a: [1, 4], b: [3, 6] }, q: 'Triangle ABC is reflected over the y-axis. What is the x-coordinate of A′?', fig: { kind: 'grid', x: [-8, 8], y: [-2, 8], step: 1, shapes: [{ points: [['{=-a}', 1], ['{=-a}', '{b}'], ['{=-a-2}', 1]], names: ['A', 'B', 'C'], transform: { reflect: 'y-axis' } }] }, answer: 'a', dp: 0, work: ['A reflection over the y-axis changes the sign of x.', 'A is at ({=-a}, 1), so A′ is at ({a}, 1).', 'The x-coordinate of A′ is {a}.'] },
  compositeShape: { tool: 'figure.number', vars: { w: [6, 10], h: [5, 9], t: [2, 4], s: [2, 4] }, where: 's < h - 1', q: 'What is the area of the shape?', fig: { kind: 'compositeShape', parts: [{ rect: [0, 0, '{w}', '{s}'] }, { rect: [0, '{s}', '{t}', '{=h - s}'] }], sides: true, unit: 'm' }, answer: 'w*s + t*(h - s)', dp: 0, unit: 'm²', work: ['Split it into two rectangles.', '{w} × {s} = {=w*s}', '{t} × {=h - s} = {=t*(h - s)}', 'Area = {=w*s} + {=t*(h - s)} = {=w*s + t*(h - s)}'] },
};

/**
 * The checks every one of these generators must pass: the activity self-test, and every set it deals (5 seeds of 8) is
 * a figure that draws, whose answer key is what OF.solve says (key: the solve result -> the number asked for). t: the
 * node:test assert.
 */
export async function checkGenerator(assert, kind, key) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const g = GEOMETRY_GENS[kind], kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${kind} practice` }, problems: [], gen: g };
  const html = `<title>Geometry</title>\n${figTag('oomba-figures')}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(html), { ok: true, problems: [] }, kind);
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
    const { kind: k, ...fig } = p.fig;
    assert.equal(k, kind); assert.equal(F.check(k, fig).length, 0, `${kind} ${JSON.stringify(fig)}`);
    const want = key(F.solve[k](fig));
    assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -g.dp + 1e-9, `${kind}: the key ${p.answer} is the figure's ${want}`);
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 4, `${kind} randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 4 });
  assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === kind && i.work.length >= 2));
  return { selfTestHtml, html, data };
}
