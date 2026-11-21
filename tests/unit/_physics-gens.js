// The figure question generators for the 1.1.0 physics kinds and extensions (docs/figures-api.md): one each, shared by
// their tests, and the checks every one must pass (the same as the geometry ones: _geometry-gens.js).
export const PHYSICS_GENS = {
  projectile: { tool: 'figure.number', vars: { v: [10, 30], a: { of: [30, 40, 45, 50, 60] } }, q: 'A ball is kicked at {v} m/s, {a}° above the ground. Take g = 10 m/s². How far away does it land?', fig: { kind: 'projectile', speed: '{v}', angle: '{a}', g: 10, marks: ['range'], hide: 'range' }, answer: 'v^2*sin(2*a)/10', dp: 1, unit: 'm', work: ['R = v² sin(2θ) ÷ g', '= {v}² × sin({=2*a}°) ÷ 10', '= {=round(v^2*sin(2*a)/10, 1)} m'] },
  waves: { tool: 'figure.number', vars: { A: [1, 5], L: { of: [2, 4, 6, 8] }, c: { of: [2, 3] } }, q: 'What is the wavelength of this wave, in meters?', fig: { kind: 'waves', amplitude: '{A}', wavelength: '{L}', cycles: '{c}', marks: [] }, answer: 'L', dp: 0, unit: 'm', work: ['One wavelength is from one crest to the next.', 'The crests are {L} m apart.', 'λ = {L} m'] },
  motionMap: { tool: 'figure.number', vars: { s: [1, 5], t: [2, 6] }, q: 'The dots are 1 s apart. How far does the cart go?', fig: { kind: 'motionMap', segments: [{ kind: 'forward', speed: '{s}', duration: '{t}' }], dt: 1 }, answer: 's*t', dp: 0, unit: 'm', work: ['It moves {s} m each second.', 'It moves for {t} s.', '{s} × {t} = {=s*t} m'] },
  motionGraph: { tool: 'figure.number', vars: { v: [2, 12], t: [2, 6] }, q: 'What is the cart\'s acceleration while it speeds up?', fig: { kind: 'motionGraph', segments: [{ kind: 'faster', speed: '{v}', duration: '{t}' }, { kind: 'forward', speed: '{v}', duration: 3 }], type: 'velocity-time', marks: true }, answer: 'v/t', dp: 2, unit: 'm/s²', work: ['a = change in velocity ÷ time', '= {v} ÷ {t}', '= {=round(v/t, 2)} m/s²'] },
  rays: { tool: 'figure.number', vars: { u: [5, 30] }, q: 'The object is {u} cm in front of a plane mirror. How far behind the mirror is its image?', fig: { kind: 'rays', type: 'plane-mirror', u: '{u}', h: '{=u/2}', hide: 'image' }, answer: 'u', dp: 0, unit: 'cm', work: ['A plane mirror\'s image is as far behind it as the object is in front.', 'The image is {u} cm behind the mirror.'] },
  circuit: { tool: 'figure.number', vars: { a: [2, 10], b: [2, 10], c: [2, 10] }, q: 'What is the total resistance of the circuit?', fig: { kind: 'circuit', layout: 'network', loop: [{ type: 'battery', volts: 12 }, { type: 'resistor', ohms: '{a}' }, { parallel: [{ type: 'resistor', ohms: '{b}' }, { type: 'resistor', ohms: '{c}' }] }] }, answer: 'a + b*c/(b + c)', dp: 2, unit: 'Ω', work: ['In parallel: R = (R₂ × R₃) ÷ (R₂ + R₃) = {=round(b*c/(b + c), 2)} Ω', 'In series with R₁: R = {a} + {=round(b*c/(b + c), 2)}', '= {=round(a + b*c/(b + c), 2)} Ω'] },
  caliper: { tool: 'figure.number', vars: { m: [10, 140], k: [0, 19] }, q: 'What does the caliper read, in mm?', fig: { kind: 'reading', type: 'caliper', value: '{=m + k*0.05}', leastCount: 0.05, hide: 'value' }, answer: 'm + k*0.05', dp: 2, unit: 'mm', work: ['The main scale reads {m} mm before the sliding zero.', 'Sliding mark {k} lines up: {k} × 0.05 = {=k*0.05} mm.', '{m} + {=k*0.05} = {=m + k*0.05} mm'] },
  micrometer: { tool: 'figure.number', vars: { h: [2, 40], j: [0, 49] }, q: 'What does the micrometer read, in mm?', fig: { kind: 'reading', type: 'micrometer', value: '{=h/2 + j/100}', hide: 'value' }, answer: 'h/2 + j/100', dp: 2, unit: 'mm', work: ['The sleeve shows {=h/2} mm.', 'Thimble mark {j} is on the datum line: {=j/100} mm.', '{=h/2} + {=j/100} = {=h/2 + j/100} mm'] },
};
export async function checkGenerator(assert, name, key) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const g = PHYSICS_GENS[name], kind = g.fig.kind, kit = canvasKit(), F = figuresKit(FIG_LATEST['oomba-figures']);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: `${name} practice` }, problems: [], gen: g };
  const page = tag => `<title>Physics</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(page(figTag('oomba-figures', undefined, { kinds: [kind] }))), { ok: true, problems: [] }, name);
  const noPack = selfTestHtml(page(figTag('oomba-figures', undefined, { packs: [] })));
  assert.equal(noPack.ok, false, `${name}: its pack's tag is needed`); assert.match(noPack.problems[0].why, new RegExp(`the Oomba Figures ${F.packOf(kind)} pack`));
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 5]) for (const p of kit.logic.deal(data, { seed: seed * 7919, count: 8 })) {
    const { kind: k, hide, ...fig } = p.fig;
    assert.equal(k, kind); assert.deepEqual([...F.check(k, fig)], [], `${name} ${JSON.stringify(fig)}`);
    const want = key(F.solve[k](fig));
    assert.ok(Math.abs(want - p.answer) <= 0.5 * 10 ** -g.dp + 1e-9, `${name}: the key ${p.answer} is the figure's ${want}`);
    seen.add(p.answer);
  }
  assert.ok(seen.size >= 4, `${name} randomized: ${[...seen].join(', ')}`);
  const sheet = kit.sheet(data, { seed: 4242, n: 4 });
  assert.ok(sheet.items.every(i => i.picture && i.picture.fig.kind === kind && i.work.length >= 2));
}
/** Every 12 site languages' words for these keys, and English the fallback. */
export async function checkWords(assert, keys) {
  const { FIG_WORDS } = await import('../../figures/src/words.js');
  assert.equal(Object.keys(FIG_WORDS).length, 12);
  for (const [c, w] of Object.entries(FIG_WORDS)) for (const k of keys) assert.ok(typeof w[k] === 'string' && w[k].trim(), `${c}: ${k}`);
}
/** Print: black on white, no site colours. */
export const PRINT_OK = s => !/#1F9D63|#2A78B0|#B0372B|#9A6B00|#6E4BB0|#FFFDF2|#5AA9D6/i.test(s) && /fill="#FFFFFF"/.test(s);
