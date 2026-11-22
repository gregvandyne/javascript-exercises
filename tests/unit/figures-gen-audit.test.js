// The audit of every Figures generator (public/js/figures-catalog.js, docs/figures-api.md "Figure question generators in
// Figures worksheets"), on the student sheet exactly as /figures/worksheets/:id/print draws it (services/figures.js
// printHtml, key=0, with the hide each generator sets). For many seeds of every generator, of every subject:
//   (a) the answer is not given away: the answer (as printed, its common roundings) is not text in the student figure
//       or the question, unless it is a scale's own tick label (a reading is read off its scale) or a case listed in
//       ALLOWED with its reason; a choice question's right option is not singled out in the figure;
//   (b) a graph's numbers are on the graph: the values the question and the data put on an axis (intercepts,
//       coordinates, readings, curve ends) lie inside the axis as drawn (read from the printed ticks and axis lines);
//   (c) every dealt figure passes OF.check, and the answer key is the generator's own formula.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const F = await import('../../server/services/figures.js');
const CAT = await import('../../public/js/figures-catalog.js');
const { figuresKit, FIG_LATEST } = await import('../../server/services/figlibs.js');
const OF = figuresKit(FIG_LATEST['oomba-figures']);

// 30 seeds spread over the generators' range (a fixed list, so a failure names a seed that repeats).
const SEEDS = []; for (let x = 12345; SEEDS.length < 30;) { x = (x * 48271) % 2147483647; SEEDS.push(1 + (x % 999999)); }
const GENS = CAT.KINDS.flatMap(K => K.gens.map(g => ({ K, g })));

const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const norm = s => String(s).replace(/−/g, '-').replace(/(\d),(?=\d{3}\b)/g, '$1');
const attr = (a, k) => { const m = a.match(new RegExp(`\\b${k}="([-\\d.]+)"`)); return m ? +m[1] : NaN; };
/** A text that is only a number (with % or ° after it), or null. */
const bare = s => { const m = norm(s).match(/^(-?\d+(?:\.\d+)?)\s*(%|°)?$/); return m ? +m[1] : null; };

/** The student sheet's figure and question for one dealt item, as the print page makes them. */
function studentSheet(r) {
  const html = F.printHtml({ title: 'Audit' }, [{ ...r, id: 'audit' }], { key: false });
  const svg = html.match(/<div class="fgp-fig">([\s\S]*?)<\/div>/)[1];
  const question = unesc(html.match(/<div class="fgp-text"><p dir="auto">([\s\S]*?)<\/p>/)[1]);
  const texts = [...svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)].map(m => ({ x: attr(m[1], 'x'), y: attr(m[1], 'y'), t: unesc(m[2].replace(/<[^>]+>/g, '')).trim() })).filter(e => e.t);
  return { html, svg, question, texts };
}

/** Bare numbers that belong to a scale: three or more in step (arithmetic, or by a factor for a log scale). */
function scaleValues(texts) {
  const vals = texts.map(e => bare(e.t)).filter(v => v !== null), has = v => vals.some(u => Math.abs(u - v) < 1e-9 * Math.max(1, Math.abs(v)));
  const out = new Set();
  for (const v of vals) for (const u of vals) {
    if (u === v) continue;
    const d = u - v, r = v ? u / v : 0;
    if ((has(v - d) && has(v + d)) || has(v + 2 * d) || (has(v - d) && has(v - 2 * d))) out.add(v);
    if (r > 0 && r !== 1 && ((has(v / r) && has(v * r)) || has(v * r * r))) out.add(v);
  }
  return out;
}
/** Kinds whose numbers are cells or counts, never a scale (a table's cells can happen to be in step). */
const NO_SCALE = new Set(['twoWayTable', 'tableOfValues', 'stemAndLeaf', 'vennDiagram', 'mappingDiagram', 'treeDiagram', 'pieChart', 'nuclide', 'dotCross', 'circuit', 'freeBody', 'pulley', 'vectors', 'inclinedPlane', 'rays', 'projectile']);

/** The answer as it may be printed: at its dp, and rounded to fewer decimals (not to a whole number when it has some). */
function answerForms(r) {
  const forms = new Set([CAT.numText(r.value, r.dp)]);
  for (let d = r.dp - 1; d >= 1; d--) forms.add(CAT.numText(r.value, d));
  return [...forms];
}
const tokenRe = f => new RegExp(`(?<![\\w.\\d-])${f.replace(/[.\\-]/g, '\\$&')}(?![\\d′″]|\\.\\d)`);

// Where the answer may show, generator by generator, and why. Each returns its reason when the hit is the allowed one.
const ALLOWED = {
  // The question states the object's distance as data; that a plane mirror's image is as far behind is what it tests.
  rays: (r, where, t) => /u = \d/.test(t) || where === 'question' ? 'the object distance is the question\'s own data' : null,
  // The asked total is blank in the table (data.blanks); another cell of the table can hold the same count.
  twoWayTable: (r, where, t) => where === 'figure' && bare(t) !== null && JSON.stringify(r.data.blanks) === '[[2,0]]' ? 'another cell equals the blank total' : null,
  // The number of protons equals the number of neutrons for some nuclei: the atomic number is the figure's data.
  nuclide: (r, where, t) => where === 'figure' && bare(t) === OF.solve.nuclide(r.data).protons ? 'the atomic number is data (Z = N here)' : null,
  // An ionic dot-and-cross diagram always shows the ions' charges (the kind has no hide for them); the question asks for
  // the electrons transferred, charge times the number of metal ions, which is the reading the diagram teaches.
  dotCross: (r, where, t) => where === 'figure' && /^\d?[+-]$/.test(norm(t)) ? 'an ion\'s charge is the diagram\'s own label' : null,
  // The equilibrium quantity is labeled so the surplus can be worked out; with Qe = 20 the surplus is also 20.
  supplyDemand: (r, where, t) => where === 'figure' && norm(t) === `Qe = ${r.value}` ? 'Qe is the data the surplus is worked from' : null,
  // "30 or less" is the class boundary the question asks about; the count of values can also be 30.
  // The expressions' coefficients and constants are the data the equation is built from; one can equal x.
  segmentAddition: (r, where, t) => where === 'figure' && r.data.parts.some(p => p.expr.includes(bare(t))) ? 'a coefficient of the expressions' : null,
  // The battery's voltage is data of another quantity (volts, not ohms); the total resistance can be 12 too.
  circuit: (r, where, t) => where === 'figure' && /^ε\s+12 V$/.test(t) ? 'the battery\'s voltage' : null,
  // The question's times (the half-life, the time asked about) are in days; the amount left, in grams, can match one.
  halfLife: (r, where, t) => where === 'question' && !new RegExp(`(?<![\\d.])${r.value} g\\b`).test(t) ? 'a time in days, not the amount' : null,
  // The micropipette's window shows its setting as digits: reading them as a volume (for its model) is the skill.
  'reading.micropipette': (r, where, t) => where === 'figure' && /^\d$/.test(t) ? 'a digit of the volume window' : null,
  cumulativeFrequency: (r, where) => where === 'question' ? 'the question\'s 30 is a class boundary, not the count' : null,
};

/** The drawn range of each numbered axis, from the printed ticks (aligned bare numbers) and the axis and grid lines. */
function axesOf(texts, svg) {
  const nums = texts.map(e => ({ ...e, v: bare(e.t) })).filter(e => e.v !== null);
  const lines = [...svg.matchAll(/<line\b([^>]*)\/?>/g)].map(m => ({ x1: attr(m[1], 'x1'), y1: attr(m[1], 'y1'), x2: attr(m[1], 'x2'), y2: attr(m[1], 'y2') }));
  const out = {};
  for (const [ax, same] of [['x', 'y'], ['y', 'x']]) {
    const groups = {};
    for (const e of nums) (groups[e[same]] ??= []).push(e);
    const g = Object.values(groups).filter(x => x.length >= 3).sort((a, b) => b.length - a.length)[0];
    if (!g) continue;
    const a = g[0], b = g[g.length - 1];
    if (a[ax] === b[ax]) continue;
    const k = (b.v - a.v) / (b[ax] - a[ax]), at = px => a.v + (px - a[ax]) * k;
    const px = lines.filter(l => (ax === 'x' ? Math.abs(l.y1 - l.y2) : Math.abs(l.x1 - l.x2)) < 1e-6).flatMap(l => (ax === 'x' ? [l.x1, l.x2] : [l.y1, l.y2]));
    if (!px.length) continue;
    const v1 = at(Math.min(...px)), v2 = at(Math.max(...px));
    out[ax] = [Math.min(v1, v2), Math.max(v1, v2)];
  }
  return out;
}
const sum = a => a.reduce((s, x) => s + x, 0);
// What each graph generator puts on its axes: [what, value, axis]. Each must lie inside that axis as printed.
const ON_AXES = {
  supplyDemand: (d, s) => [['the demand intercept the question states', d.demand.at, 'y'], ['the equilibrium price', s.price, 'y'], ['the equilibrium quantity', s.quantity, 'x']],
  adAs: d => [['potential GDP', d.potential, 'x'], ...d.schedule.flatMap(([p]) => [['a price level of the schedule', p, 'y']])],
  costCurves: d => [['the quantity at the lowest ATC', d.atc.q, 'x'], ['the lowest ATC', d.atc.cost, 'y']],
  phillipsCurve: d => [['the natural rate', d.nru, 'x'], ['B\'s unemployment', d.u2, 'x'], ['expected inflation', d.expected, 'y'], ['B\'s inflation', d.pi2, 'y']],
  grid: d => d.shapes.flatMap(sh => sh.points.flatMap(([x, y]) => [['a vertex', x, 'x'], ['its image', -x, 'x'], ['a vertex', y, 'y']])),
  scatterPlot: d => d.points.flatMap(([x, y]) => [['a point', x, 'x'], ['a point', y, 'y']]),
  motionGraph: d => [['the top speed', Math.max(...d.segments.map(g => g.speed)), 'y'], ['the time', sum(d.segments.map(g => g.duration)), 'x']],
  motionMap: d => [['the distance', sum(d.segments.map(g => g.speed * g.duration)), 'x']],
  populationGrowth: d => [['the carrying capacity', d.k, 'y'], ['the start', d.n0, 'y'], ['the time span', d.span, 'x']],
  enzymeActivity: d => d.curves.map(c => ['the optimum', c.opt, 'x']),
  photosynthesis: (d, s, r) => [['the plateau', r.value, 'y']],
  predatorPrey: d => [['the time span', d.span, 'x'], ['a period', d.period, 'x']],
  halfLife: (d, s, r) => [['the start amount', d.start, 'y'], ['the time asked about', +norm(r.question).match(/after (\d+(?:\.\d+)?)/)[1], 'x']],
  heatingCurve: (d, s, r) => [...norm(r.question).matchAll(/(-?\d+(?:\.\d+)?) °C/g)].map(m => ['a temperature the question states', +m[1], 'y']),
  energyProfile: d => d.levels.map(v => ['a level', v, 'y']),
  waves: d => [['the amplitude', d.amplitude, 'y'], ['the wave\'s length', d.wavelength * d.cycles, 'x']],
  histogram: (d, s, r) => [...d.bins.flat().map(v => ['a class boundary', v, 'x']), ['the frequency density asked for', r.value, 'y']],
  cumulativeFrequency: d => [...d.bins.flat().map(v => ['a class boundary', v, 'x']), ['the total', sum(d.counts), 'y']],
  barGraph: d => d.values.map(v => ['a bar', v, 'y']),
  boxPlot: d => d.summary.map(v => ['a summary value', v, 'x']),
  dotPlot: d => d.data.map(v => ['a value', v, 'x']),
  normalCurve: d => [['the mean', d.mean, 'x'], ...d.regions.flatMap(g => ['from', 'to'].filter(k => typeof g[k] === 'number').map(k => ['a region end', g[k], 'x']))],
  numberLine: d => d.points.map(p => ['a point', p.at, 'x']),
  massSpectrum: d => d.isotopes.flatMap(i => [['an isotope\'s mass', i.mass, 'x'], ['its abundance', i.abundance, 'y']]),
};

function audit(K, g, seed) {
  const problems = [], r = F.generate(g.id, seed), raw = F.dealRaw(g.id, seed);
  if (!r) return [`seed ${seed}: no question (the figure fails OF.check or the deal is refused)`];
  // (c) the figure passes OF.check; the key is the generator's own formula and the print key shows it.
  const { kind, hide, ...rawFig } = raw.fig;
  if (OF.check(kind, rawFig).length || OF.check(r.kind, r.data).length) problems.push(`OF.check: ${OF.check(r.kind, r.data).join('; ')}`);
  if (hide !== undefined && hide !== r.hide) problems.push(`the hide ${JSON.stringify(hide)} is not one of ${K.id}'s (${K.hide.join(', ')})`);
  const key = F.printHtml({ title: 'Audit' }, [{ ...r, id: 'audit' }], { key: true, sheet: false });
  if (!key.includes(`<p class="fgp-kans" dir="auto">${r.answer.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`)) problems.push(`the printed key is not ${r.answer}`);
  if (r.answerType === 'number') {
    if (Math.abs(r.value - raw.answer) > 0.5 * 10 ** -r.dp + 1e-9) problems.push(`key ${r.value} is not the formula's ${raw.answer}`);
    if (CAT.numText(r.value, r.dp) !== CAT.numText(raw.answer, r.dp)) problems.push(`key prints ${CAT.numText(r.value, r.dp)}, the formula ${CAT.numText(raw.answer, r.dp)}`);
  } else if (r.correct !== Math.round(raw.answer)) problems.push(`the right option ${r.correct} is not the formula's ${raw.answer}`);
  // (a) the student sheet does not give the answer away.
  const S = studentSheet(r), why = ALLOWED[g.id];
  if (r.answerType === 'number') {
    const scale = NO_SCALE.has(r.kind) ? new Set() : scaleValues(S.texts);
    for (const f of answerForms(r)) {
      const re = tokenRe(f);
      for (const e of S.texts) {
        if (!re.test(norm(e.t))) continue;
        if (bare(e.t) !== null && scale.has(bare(e.t))) continue;
        if (!(why && why(r, 'figure', e.t))) problems.push(`the figure shows the answer ${f}: "${e.t}"`);
      }
      if (re.test(norm(S.question)) && !(why && why(r, 'question', S.question))) problems.push(`the question states the answer ${f}`);
    }
  } else {
    const all = S.texts.map(e => e.t).join(' ').toLowerCase(), shown = r.choices.map(c => all.includes(c.toLowerCase()));
    if (shown[r.correct] && !shown.every(Boolean)) problems.push(`the figure singles out the right option "${r.choices[r.correct]}"`);
  }
  // (b) a graph's numbers lie on its axes as drawn.
  if (ON_AXES[g.id]) {
    const ax = axesOf(S.texts, S.svg), sol = OF.solve[r.kind] ? CAT.flatSolve(OF.solve[r.kind](r.data)) : {};
    const s = { ...sol, price: sol['equilibrium.price'], quantity: sol['equilibrium.quantity'] };
    for (const [what, v, a] of ON_AXES[g.id](r.data, s, r)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) { problems.push(`${what} is not a number`); continue; }
      const range = ax[a];
      if (!range) { problems.push(`no numbered ${a} axis for ${what}`); continue; }
      const eps = (range[1] - range[0]) * 1e-6;
      if (v < range[0] - eps || v > range[1] + eps) problems.push(`${what} (${v}) is off the ${a} axis, which runs ${+range[0].toFixed(3)} to ${+range[1].toFixed(3)}`);
    }
  }
  return problems.map(p => `seed ${seed}: ${p} :: ${r.question}`);
}

test('every catalog generator is audited, of every subject and both answer types', () => {
  assert.ok(GENS.length >= 80, `${GENS.length} generators`);
  assert.deepEqual([...new Set(GENS.map(x => x.K.subject))].sort(), [...CAT.SUBJECTS].sort());
  assert.ok(GENS.some(x => x.g.tool === 'figure.choice') && GENS.some(x => x.g.tool === 'figure.number'));
  for (const id of Object.keys(ON_AXES)) assert.ok(CAT.genOf(id), `${id} is a generator`);
  for (const id of Object.keys(ALLOWED)) assert.ok(CAT.genOf(id), `${id} is a generator`);
});

for (const subject of CAT.SUBJECTS) {
  test(`${subject}: the student sheet keeps every answer back, its graphs show their numbers, and the key is the formula`, () => {
    const bad = [];
    for (const { K, g } of GENS.filter(x => x.K.subject === subject)) {
      const found = SEEDS.flatMap(seed => audit(K, g, seed));
      if (found.length) bad.push(`${g.id} (${found.length} of ${SEEDS.length} seeds):\n    ${found.slice(0, 3).join('\n    ')}`);
    }
    assert.equal(bad.length, 0, bad.join('\n'));
  });
}

test('the two printed bugs stay fixed: no net force on the student copy, the stated demand intercept on the price axis', () => {
  for (const seed of SEEDS) {
    const fb = F.generate('freeBody', seed), sheet = studentSheet(fb).texts.map(e => e.t);
    assert.equal(fb.hide, 'forces');
    assert.ok(sheet.includes('F = ? N'), sheet.join());
    assert.ok(!sheet.some(t => tokenRe(String(fb.value)).test(norm(t))), `${fb.question}: ${sheet.join()}`);
    const key = F.printHtml({ title: 'Audit' }, [{ ...fb, id: 'k' }], { key: true, sheet: false });
    assert.match(key, new RegExp(`F = ${fb.value} N`), 'the answer key still draws the force');
  }
  // The printed case was a supply curve that meets the price axis below 0 (Demand at $7, supply at -0.5): the graph's own
  // range then left the demand intercept off it. Deal until every (p, q) the generator can make has been seen.
  const seen = new Set();
  for (let x = 777, n = 0; n < 3000 && seen.size < 35; n++) {
    x = (x * 48271) % 2147483647; const seed = 1 + (x % 999999);
    const sd = F.generate('supplyDemand', seed), S = studentSheet(sd), ax = axesOf(S.texts, S.svg);
    const stated = +norm(sd.question).match(/axis at \$(\d+(?:\.\d+)?)/)[1];
    seen.add(`${sd.data.demand.at}/${sd.data.supply.at}`);
    assert.equal(stated, sd.data.demand.at);
    assert.ok(ax.y[0] <= 0 && ax.y[1] >= stated, `${sd.question}: the price axis runs to ${ax.y[1]}`);
    assert.equal(sd.value, OF.solve.supplyDemand(sd.data).cs);
  }
  assert.equal(seen.size, 35, 'all 7 x 5 deals');
  assert.ok([...seen].some(k => +k.split('/')[1] < 0), 'a supply curve that starts on the quantity axis');
});
