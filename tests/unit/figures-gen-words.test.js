// The Figures question generators in every site language (public/js/figures-gen-words/, docs/decisions.md "Figures
// opens to all teachers"): every generator has its words in every language (en-GB only where it differs), the
// placeholders are exactly the English ones line by line, options keep their order, the Oomba Canvas self-test passes
// in every language as it does in English, and a question dealt in any language has the same numbers, figure and answer
// (the right option's index included) as the English one. Then the product: a worksheet keeps its language and deals
// in it, saved questions keep their words, a choice question stays linked to its generator in any language, a figure
// with translated labels still has its answer when assigned, and the AI drafter and its template speak the language.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/figures.js');
const FS = await import('../../server/services/figures-steps.js');
const LA = await import('../../server/services/lesson-ai.js');
const CAT = await import('../../public/js/figures-catalog.js');
const W = await import('../../public/js/figures-gen-words/index.js');
const { figTag } = await import('../../server/services/figlibs.js');
const { canvasTag, canvasKit, selfTestHtml } = await import('../../server/services/canvaskit.js');

const FULL = ['es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'ja', 'zh-Hant', 'ar', 'he'];
const GENS = CAT.KINDS.flatMap(K => K.gens.map(g => CAT.genOf(g.id)));
const holes = s => (String(s).match(/\{[^{}]+\}/g) || []).sort();
const FIELDS = new Set(['q', 'work', 'choices', 'unit', 'fig']);
/** Every string a table entry holds. */
const strings = w => [w.q, ...(w.work || []), ...(w.choices || []), w.unit, ...Object.entries(w.fig || {}).flat()].filter(x => typeof x === 'string');

test('the 13 site languages: English is the catalog, the other 12 have a table', () => {
  assert.deepEqual([...W.GEN_LANGS].sort(), ['ar', 'de', 'en', 'en-GB', 'es', 'fr', 'he', 'it', 'ja', 'nl', 'pt', 'ru', 'zh-Hant']);
  assert.equal(W.genLang('xx'), 'en'); assert.equal(W.genLang('es'), 'es'); assert.equal(W.genLang(undefined), 'en');
  assert.equal(GENS.length, 83);
});

test('every generator in every language, with the English placeholders line by line and the options in order', () => {
  for (const lang of [...FULL, 'en-GB']) {
    const T = W.TABLES[lang];
    for (const id of Object.keys(T)) assert.ok(CAT.genOf(id), `${lang}: ${id} is a generator`);
    for (const g of GENS) {
      const w = T[g.id];
      if (lang === 'en-GB' && !w) continue;
      assert.ok(w, `${lang}: ${g.id} has its words`);
      for (const k of Object.keys(w)) assert.ok(FIELDS.has(k), `${lang} ${g.id}: ${k}`);
      if (lang !== 'en-GB') { assert.equal(typeof w.q, 'string', `${lang} ${g.id}: q`); assert.ok(Array.isArray(w.work), `${lang} ${g.id}: work`); }
      if (w.q !== undefined) { assert.deepEqual(holes(w.q), holes(g.q), `${lang} ${g.id}: the question's placeholders`); assert.ok(w.q.length <= 300, `${lang} ${g.id}: q is short`); }
      if (w.work !== undefined) {
        assert.equal(w.work.length, g.work.length, `${lang} ${g.id}: as many worked lines`);
        w.work.forEach((x, i) => { assert.deepEqual(holes(x), holes(g.work[i]), `${lang} ${g.id} work ${i}: ${x}`); assert.ok(x.length <= 170, `${lang} ${g.id} work ${i} is short`); });
      }
      if (g.choices) {
        if (lang !== 'en-GB') assert.ok(Array.isArray(w.choices), `${lang} ${g.id}: options`);
        if (w.choices) {
          assert.equal(w.choices.length, g.choices.length, `${lang} ${g.id}: as many options, in the same order`);
          assert.equal(new Set(w.choices.map(x => x.toLowerCase())).size, w.choices.length, `${lang} ${g.id}: different options`);
          for (const c of w.choices) { assert.deepEqual(holes(c), [], c); assert.ok(c.trim() && c.length <= 60, c); }
        }
      } else assert.equal(w.choices, undefined, `${lang} ${g.id}: no options`);
      if (w.unit !== undefined) { assert.ok(g.unit, `${lang} ${g.id}: English has a unit`); assert.ok(w.unit.length <= 20, w.unit); }
      for (const [en, x] of Object.entries(w.fig || {})) {
        assert.ok(JSON.stringify(g.fig).includes(JSON.stringify(en)), `${lang} ${g.id}: "${en}" is a label in the English figure`);
        assert.ok(typeof x === 'string' && x.trim() && !/[{}]/.test(x), `${lang} ${g.id}: ${x}`);
      }
      for (const s of strings(w)) assert.doesNotMatch(s, /—/, `${lang} ${g.id}: no em dashes (${s})`);
      if (lang !== 'en-GB') assert.notEqual(w.q, g.q, `${lang} ${g.id}: the question is translated`);
    }
  }
});

/** A figure's data with every label the language translates turned back to English. */
const english = (data, lang, id) => {
  const back = Object.fromEntries(Object.entries((W.TABLES[lang][id] || {}).fig || {}).map(([a, b]) => [b, a]));
  const walk = o => (typeof o === 'string' ? (back[o] ?? o) : Array.isArray(o) ? o.map(walk) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)])) : o);
  return walk(data);
};
const SEEDS = [1, 7, 4242, 99991, 123457, 777777];

test('the same question in every language: the same numbers, figure, answer and right option; the words of the language', () => {
  for (const g of GENS) {
    for (const seed of SEEDS) {
      const en = F.generate(g.id, seed);
      for (const lang of [...FULL, 'en-GB']) {
        const x = F.generate(g.id, seed, undefined, null, lang);
        if (!en) { assert.equal(x, null, `${lang} ${g.id} ${seed}: nothing in English, nothing here`); continue; }
        assert.ok(x, `${lang} ${g.id} ${seed}: a question`);
        const at = `${lang} ${g.id} seed ${seed}`;
        assert.equal(JSON.stringify(english(x.data, lang, g.id)), JSON.stringify(en.data), `${at}: the same figure`);
        assert.equal(x.value, en.value, at); assert.equal(x.dp, en.dp, at); assert.equal(x.answerType, en.answerType, at); assert.equal(x.correct, en.correct, `${at}: the right option`);
        assert.equal(JSON.stringify(x.hide), JSON.stringify(en.hide), at);
        assert.equal(x.work.length, en.work.length, at);
        if (x.answerType === 'choice') { assert.equal(JSON.stringify(x.choices), JSON.stringify(localChoices(g, lang)), at); assert.ok(x.work.at(-1).toLowerCase().includes(x.choices[x.correct].toLowerCase()), `${at}: the last line says the answer`); }
        if (lang !== 'en-GB') assert.notEqual(x.question, en.question, `${at}: translated`);
      }
    }
  }
});
const localChoices = (g, lang) => W.localGen(g, lang).choices;

test('the Oomba Canvas self-test passes in every language (as in English): a number generator as the activity\'s generator, a choice one as its dealt problems', () => {
  const tag = figTag('oomba-figures'), L = canvasKit().logic;
  const page = data => `<title>Figures words</title>\n${tag}\n${canvasTag()}\n<div id="oc-app"></div>\n<script type="application/json" id="oc-activity">\n${JSON.stringify(data)}\n</script>\n<script>Oc.activity(JSON.parse(document.getElementById('oc-activity').textContent));</script>`;
  const activity = gg => {
    const { id: _i, key: _k, pick: _p, kind: _kk, ...g } = gg;
    if (g.tool !== 'figure.choice') return { config: { count: 6, purpose: ['screen', 'worksheet', 'generator'] }, task: { title: 'Practice' }, problems: [], gen: g };
    const problems = [];
    for (let seed = 1; problems.length < 8; seed++) {
      const raw = L.TOOLS[g.tool].gen(L.seeded(seed * 7919 + 13), g), say = s => String(s).replace(/\{choice\}/g, raw.choices[raw.answer]);
      problems.push({ ...raw, q: say(raw.q), work: raw.work.map(say) });
    }
    return { config: { count: 6, purpose: ['screen', 'worksheet'] }, task: { title: 'Practice' }, problems };
  };
  let n = 0;
  for (const g of GENS) {
    const en = selfTestHtml(page(activity(g)));
    assert.deepEqual(en, { ok: true, problems: [] }, `${g.id} in English`);
    for (const lang of [...FULL, 'en-GB']) { assert.deepEqual(selfTestHtml(page(activity(W.localGen(g, lang)))), { ok: true, problems: [] }, `${g.id} in ${lang}`); n++; }
  }
  assert.equal(n, GENS.length * 12);
});

// ---------------------------------------------------------------- the product
const boss = createUser({ username: 'WordsBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Words Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Words' });
const A = S.createClass(boss, oak.id, { name: '9A' }).class;
const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tomas Teacher', role: 'teacher' }).user.id);
const LT = getUser(T.id);

test('migration 0101: question_sets.lang, English for every older set', () => {
  assert.ok(q.all('PRAGMA table_info(question_sets)').some(c => c.name === 'lang' && c.dflt_value === "'en'"));
});

test('a worksheet keeps its language and deals in it; saved questions keep their words; choices stay linked; labels keep their answer', () => {
  const es = F.createWorksheet(LT, { title: 'Hoja', lang: 'es' });
  assert.equal(F.ownWorksheet(LT, es.id).lang, 'es');
  assert.equal(F.createWorksheet(LT, { title: 'Sheet' }).ok, true);
  assert.equal(F.ownWorksheet(LT, F.createWorksheet(LT, { title: 'Odd', lang: 'xx' }).id).lang, 'en', 'an unknown language is English');
  // A starter question, a re-deal and a swap: in Spanish.
  assert.ok(F.addItem(LT, es.id, { kind: 'rectangle', gen: 'rectangle', seed: 5 }).ok);
  let it = F.itemsOf(es.id)[0];
  assert.equal(it.question, W.TABLES.es.rectangle.q); assert.equal(it.work[0], W.TABLES.es.rectangle.work[0]);
  assert.ok(F.regenItem(LT, es.id, it.id).ok);
  assert.equal(F.itemsOf(es.id)[0].question, W.TABLES.es.rectangle.q);
  assert.ok(F.swapItem(LT, es.id, it.id, 'barGraph').ok);
  it = F.itemsOf(es.id)[0];
  assert.equal(it.question, W.TABLES.es.barGraph.q, 'swapped: still Spanish');
  assert.deepEqual(it.data.categories, ['Apples', 'Bananas', 'Grapes'].map(x => W.TABLES.es.barGraph.fig[x]), 'the figure\'s words too');
  // A translated figure keeps its generator (and its answer) after a save and when the answer is looked up.
  assert.ok(F.updateItem(LT, es.id, it.id, { question: 'Cuenta los alumnos.' }).ok);
  it = F.itemsOf(es.id)[0];
  assert.equal(it.question, 'Cuenta los alumnos.'); assert.equal(it.gen, 'barGraph'); assert.ok(it.work.length && it.work[0] === W.TABLES.es.barGraph.work[0], 'its worked lines are still the generator\'s, in Spanish');
  const ans = F.answerOf(it); assert.ok(ans && Number.isFinite(ans.value), 'answerOf finds the Spanish figure\'s generator');
  // A Spanish choice question stays linked to its generator: the right option is worked out from the figure.
  assert.ok(F.addItem(LT, es.id, { kind: 'pedigree', gen: 'pedigree', seed: 11 }).ok);
  const ped = F.itemsOf(es.id).find(x => x.kind === 'pedigree');
  assert.deepEqual(ped.choices, W.TABLES.es.pedigree.choices); assert.equal(ped.answerKey, 'gen:pedigree');
  assert.equal(ped.correct, F.generate('pedigree', 11).correct, 'the same right option as in English');
  assert.equal(F.answerOf(ped).value, ped.correct);
  // Assign: every question has its answer.
  const r = FS.assignWorksheet(LT, es.id, S.createClass(boss, oak.id, { name: '9B', teacherId: T.id }).class.id);
  assert.equal(r.ok, true, JSON.stringify(r));
  // An English worksheet's saved question keeps its English words, whatever language the teacher uses now.
  const en = F.createWorksheet(LT, { title: 'Old', items: [{ kind: 'rectangle', gen: 'rectangle', seed: 5 }] });
  const old = F.itemsOf(en.id)[0];
  assert.equal(old.question, CAT.genOf('rectangle').q);
  assert.ok(F.updateItem(LT, en.id, old.id, { hide: false }).ok);
  assert.deepEqual(F.itemsOf(en.id)[0].work, old.work, 'kept in English');
  // A saved English choice question with English options: still linked.
  assert.ok(F.addItem(LT, en.id, { kind: 'osmosis', gen: 'osmosis', seed: 3 }).ok);
  assert.equal(F.itemsOf(en.id).find(x => x.kind === 'osmosis').answerKey, 'gen:osmosis');
});

test('the AI drafters and their templates: the worksheet\'s language in the prompt, its generators in it', async () => {
  const seen = [];
  F.hooks.create = async req => { seen.push(req); return { model: 'mock', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Prueba', items: [
    { kind: 'triangle', question: 'Imposible', data: JSON.stringify({ AB: 1, BC: 1, CA: 5 }), answerType: 'number', answerKey: 'sides.CA', choices: [], correct: 0 }] }) }] }; };
  try {
    const w = F.createWorksheet(LT, { title: '', lang: 'fr' });
    const r = await F.draftWorksheet(LT, w.id, { brief: 'triangles rectangles', count: 1 });
    assert.equal(r.ai, true); assert.equal(r.repaired, 1);
    assert.match(seen[0].messages[0].content, /in French/); assert.doesNotMatch(seen[0].messages[0].content, /US English/);
    assert.equal(F.itemsOf(w.id)[0].question, W.TABLES.fr.triangle.q, 'repaired by its generator, in French');
    const t = F.createWorksheet(LT, { title: '', purpose: 'test', lang: 'ja' });
    seen.length = 0;
    F.hooks.create = async req => { seen.push(req); return { model: 'mock', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Test', items: [{ gen: 'freeBody', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 }] }) }] }; };
    await F.draftTest(LT, t.id, { topic: 'forces', subject: 'physics', count: 1 });
    assert.match(seen[0].messages[0].content, /in Japanese/);
    assert.equal(F.itemsOf(t.id)[0].question.includes('kg'), true); assert.notEqual(F.itemsOf(t.id)[0].question, CAT.genOf('freeBody').q);
  } finally { F.hooks.create = null; }
  // Without the AI: the template, in the language.
  for (const it of F.templateItems({ brief: 'area', count: 3, lang: 'de' })) assert.equal(it.question, W.TABLES.de[it.gen].q);
  for (const it of F.templateTest({ topic: 'circuit', subject: 'physics', count: 2, lang: 'ar' })) assert.equal(it.question.split(/\d/)[0], W.TABLES.ar[it.gen].q.split('{')[0]);
  // The lesson drafter's template: a Figure step dealt in the teacher's language.
  const d = LA.templateDraft({ topic: 'Area of rectangles', grade: '4' }, [], undefined, { figures: F.figureCatalog(), lang: 'he' });
  const step = d.steps.find(s => s.kind === 'figures');
  assert.ok(step && step.figures.every(it => !it.gen || it.question.split(/\d/)[0] === W.TABLES.he[it.gen].q.split('{')[0]));
});

test('the editor deals in the language of the worksheet it was opened from, else the page\'s', () => {
  const g = F.generate('kite', 9, undefined, null, 'ru');
  assert.equal(g.question, W.TABLES.ru.kite.q);
  assert.equal(F.dealtFor('kite', 9, g.data, undefined, 'it').question, W.TABLES.it.kite.q, 'no label in the figure: the language asked for');
  const bar = F.generate('barGraph', 9, undefined, null, 'nl');
  assert.equal(F.dealtFor('barGraph', 9, bar.data, undefined, 'en').question, W.TABLES.nl.barGraph.q, 'a Dutch figure: its Dutch words');
});
