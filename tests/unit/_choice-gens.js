// The checks a multiple choice figure question generator must pass (docs/figures-api.md "Figure question generators in
// Figures worksheets"), shared by _bio-gens.js and _econ-gens.js. Such a generator is the Figures form of the gen
// language ({choice} in its worked lines), so Oomba Canvas cannot take it as a generator; what it deals can be an
// activity's own problems. So: Canvas deals each problem with its own frozen gen code, {choice} becomes the right
// option, and the problems must pass the Canvas self-test with the kind's pack tag (every figure through OF.check, the
// last worked line saying the answer) and fail without it; every dealt figure passes OF.check; the right option is the
// one OF.solve's value picks (key, pick); every option comes up; and the Figures catalog has the same generator, whose
// worksheet questions (services/figures.js generate) agree.
export async function checkChoiceGenerator(assert, name, g, key, pick, title) {
  const { figTag, figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
  const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');
  const CAT = await import('../../public/js/figures-catalog.js');
  const Fig = await import('../../server/services/figures.js');
  const kind = g.fig.kind, L = canvasKit().logic, F = figuresKit(FIG_LATEST['oomba-figures']);
  assert.equal(g.tool, 'figure.choice');
  assert.ok(g.choices.length >= 2 && g.choices.length <= 4, `${name}: 2 to 4 options, so an Oomba Canvas activity can take what it deals`);
  const { id: _i, key: k0, pick: p0, kind: _k, ...rest } = CAT.genOf(name);
  assert.deepEqual(rest, g, `${name}: the catalog's generator`); assert.equal(k0, key); assert.deepEqual(p0, pick);
  const problems = [], seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const raw = L.TOOLS[g.tool].gen(L.seeded(seed * 7919 + 13), g);
    const say = s => String(s).replace(/\{choice\}/g, raw.choices[raw.answer]);
    const p = { ...raw, q: say(raw.q), work: raw.work.map(say) };
    const { kind: kk, hide, ...fig } = p.fig;
    assert.equal(kk, kind); assert.deepEqual([...F.check(kk, fig)], [], `${name} ${JSON.stringify(fig)}`);
    const want = pick[String(F.solve[kk](fig)[key])];
    assert.equal(p.answer, want, `${name}: the generator's option ${p.answer} is OF.solve's ${want} (${JSON.stringify(fig)})`);
    if (kind === 'pedigree') assert.equal(F.solve.pedigree(fig).tells, true, `${name}: a student can tell the mode`);
    const w = Fig.generate(name, seed * 7919 + 13);
    assert.ok(w, `${name}: a worksheet question`); assert.equal(w.correct, want); assert.equal(w.answerType, 'choice'); assert.deepEqual(w.choices, p.choices);
    seen.add(p.answer);
    if (problems.length < 12) problems.push(p);
  }
  assert.equal(seen.size, g.choices.length, `${name}: every option comes up (${[...seen].join(', ')})`);
  const data = { config: { count: 6, purpose: ['screen', 'worksheet'] }, task: { title: `${name} practice` }, problems };
  const page = tag => `<title>${title}</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  assert.deepEqual(selfTestHtml(page(figTag('oomba-figures', undefined, { kinds: [kind] }))), { ok: true, problems: [] }, name);
  const noPack = selfTestHtml(page(figTag('oomba-figures', undefined, { packs: [] })));
  assert.equal(noPack.ok, false, `${name}: its pack's tag is needed`); assert.match(noPack.problems[0].why, new RegExp(`the Oomba Figures ${F.packOf(kind)} pack`));
}
