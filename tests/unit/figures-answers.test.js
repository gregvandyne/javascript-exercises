// Figures: multiple choice and negative answers (docs/decisions.md "Figures: multiple choice and negative answers";
// services/figures.js cleanItem, answerOf, printHtml, repairDraft; services/figures-steps.js; views/figures-step.js):
// migration 0099 (old questions are number questions); a choice question's options cleaned (blanks out, the right one
// follows, at most 6, the word rules, no two the same); a generator's choice question answered from OF.solve while its
// options are its generator's, even after the figure changes, until the teacher marks another; the print page and the
// key letter the options; the AI drafter's choice questions checked and repaired; negative numbers marked; and on the
// student's lesson step the options as radio buttons in a fieldset, a ± button on every number blank, and the right
// option never sent (page or JSON) before the teacher allows it, the due date is over and the student handed in.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS, uid } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const F = await import('../../server/services/figures.js');
const FS = await import('../../server/services/figures-steps.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) { headers['content-type'] = 'application/json'; method = method === 'GET' ? 'POST' : method; }
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'FigChoiceBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Choice Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: '8A' }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Kai Kid' }).user.id);
const kid2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Lou Kid' }).user.id);
S.addToClass(boss, A.id, kid.id); S.addToClass(boss, A.id, kid2.id);
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 24 * 3600e3;
// Seeds whose pedigree generator deals each mode (0 autosomal dominant, 1 autosomal recessive, 2 X-linked recessive), and
// a thermometer below freezing.
const PED = { 0: 182150, 1: 7932, 2: 15851 }, COLD = 297;
const RIGHT_TRI = { AB: 3, BC: 4, B: 90 };
const mine = (choices, correct) => ({ kind: 'triangle', data: RIGHT_TRI, question: 'What kind of triangle is this?', answerType: 'choice', choices, correct });

test('migration 0099: once, after 0098; a question stored before it is a number question', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.filter(n => n.startsWith('0099')).length, 1);
  assert.ok(names.indexOf('0099_figures_answer_types') > names.indexOf('0098_manipulatives_saving'));
  const cols = q.all('PRAGMA table_info(question_set_items)').map(c => c.name);
  for (const c of ['answer_type', 'choices', 'correct']) assert.ok(cols.includes(c), c);
  const id = F.createWorksheet(boss, { title: 'Old' }).id;
  q.run('INSERT INTO question_set_items(id, set_id, pos, kind, data, question, answer_key, answer) VALUES (?,?,?,?,?,?,?,?)', uid(12), id, 0, 'rectangle', JSON.stringify({ AB: 5, BC: 2 }), 'Area?', 'area', '10');
  const [it] = F.itemsOf(id);
  assert.equal(it.answerType, 'number'); assert.deepEqual(it.choices, []); assert.equal(it.correct, null);
  assert.deepEqual(F.answerOf(it), { value: 10, dp: 2, unit: '' });
  // An older lesson step's snapshot (no type) is still marked as a number.
  assert.equal(FS.isChoice({ value: 3, dp: 0 }), false); assert.ok(FS.isRight('3', { value: 3, dp: 0 }));
});

test('a teacher\'s choice question: blanks left out, the right one follows, at most 6, word rules, none the same', () => {
  let c = F.cleanItem(mine(['acute', '', ' right ', 'obtuse'], 2));
  assert.ok(c.ok); assert.deepEqual(c.item.choices, ['acute', 'right', 'obtuse']); assert.equal(c.item.correct, 1); assert.equal(c.item.answer, 'B) right');
  assert.equal(c.item.answerKey, null); assert.deepEqual(c.item.work, []);
  c = F.cleanItem(mine(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'], 0)); assert.equal(c.item.choices.length, 6);
  assert.equal(F.cleanItem(mine(['Right', 'right'], 0)).code, 'sameChoices');
  assert.equal(F.cleanItem(mine(['acute', 'you are a b1tch'], 0)).code, 'words');
  assert.equal(F.cleanItem(mine(['acute', 'mail me at kid@example.com'], 0)).code, 'personal');
  c = F.cleanItem(mine(['only one'], 0)); assert.ok(c.ok); assert.equal(c.item.correct, null, 'fewer than 2 options: no answer yet');
  assert.equal(F.answerOf(c.item), null);
  c = F.cleanItem(mine(['acute', 'right'], 7)); assert.equal(c.item.correct, null, 'a right one that is not an option');
  // Stored and read back; the builder's view has the options.
  const id = F.createWorksheet(boss, { title: 'Triangles', items: [mine(['acute', 'right', 'obtuse'], 1)] }).id;
  const [it] = F.itemsOf(id);
  assert.deepEqual([it.answerType, it.choices, it.correct, it.answer], ['choice', ['acute', 'right', 'obtuse'], 1, 'B) right']);
  assert.deepEqual(F.answerOf(it), { type: 'choice', value: 1, dp: 0, unit: '', choices: ['acute', 'right', 'obtuse'] });
  // Switching it to a number question and back keeps what OF.solve gives / what the teacher typed.
  assert.ok(F.updateItem(boss, id, it.id, { answerType: 'number', answerKey: 'sides.CA' }).ok);
  assert.deepEqual([F.itemsOf(id)[0].answerType, F.itemsOf(id)[0].answer], ['number', '5']);
  assert.ok(F.updateItem(boss, id, it.id, { answerType: 'choice' }).ok);
  assert.equal(F.itemsOf(id)[0].answer, 'B) right');
});

test('a generator\'s choice question: the right option from OF.solve, after the figure changes too, until the teacher marks another', () => {
  const g = F.generate('pedigree', PED[1]);
  assert.deepEqual([g.answerType, g.correct, g.answer], ['choice', 1, 'B) autosomal recessive']);
  assert.match(g.work.at(-1), /autosomal recessive/); assert.doesNotMatch(g.question, /write 1|\{choice\}/i);
  const id = F.createWorksheet(boss, { title: 'Pedigrees', items: [{ kind: 'pedigree', gen: 'pedigree', seed: PED[1] }] }).id;
  let [it] = F.itemsOf(id);
  assert.deepEqual([it.answerType, it.correct, it.answerKey, it.gen], ['choice', 1, 'gen:pedigree', 'pedigree']);
  assert.deepEqual(it.work, g.work);
  // The teacher changes the family to another one (an X-linked one): still linked, so OF.solve says the right option.
  const other = F.generate('pedigree', PED[2]).data;
  assert.ok(F.updateItem(boss, id, it.id, { data: other }).ok);
  [it] = F.itemsOf(id);
  assert.deepEqual([it.gen, it.answerKey, it.correct, it.answer], [null, 'gen:pedigree', 2, 'C) X-linked recessive']);
  assert.deepEqual(it.work, [], 'the generator\'s worked lines were for the other family');
  assert.equal(F.answerOf(it).value, 2);
  // A question edit keeps the link; marking another option makes it the teacher's.
  assert.ok(F.updateItem(boss, id, it.id, { question: 'Which pattern is it?' }).ok); assert.equal(F.itemsOf(id)[0].correct, 2);
  assert.ok(F.updateItem(boss, id, it.id, { correct: 0, answerKey: null }).ok);
  [it] = F.itemsOf(id); assert.deepEqual([it.answerKey, it.correct], [null, 0]);
  // Changing an option's words breaks the link too.
  const id2 = F.createWorksheet(boss, { title: 'P2', items: [{ kind: 'pedigree', gen: 'pedigree', seed: PED[0] }] }).id;
  const [i2] = F.itemsOf(id2);
  assert.ok(F.updateItem(boss, id2, i2.id, { choices: ['dominant', 'autosomal recessive', 'X-linked recessive'], correct: 0 }).ok);
  assert.deepEqual([F.itemsOf(id2)[0].answerKey, F.itemsOf(id2)[0].correct], [null, 0]);
  // Regenerate deals a new family with its own right option.
  assert.ok(F.regenItem(boss, id2, i2.id, PED[2]).ok);
  assert.deepEqual([F.itemsOf(id2)[0].answerKey, F.itemsOf(id2)[0].correct], ['gen:pedigree', 2]);
});

test('the four rewritten generators ask the natural question; the thermometer reads below 0', () => {
  const ask = { pedigree: /inheritance pattern/, osmosis: /Which way does water move/, moneyMarket: /What happens to the nominal interest rate/, adAs: /what does the economy have/ };
  for (const [id, re] of Object.entries(ask)) {
    const g = F.genOf(id); assert.equal(g.tool, 'figure.choice', id);
    const r = F.generate(id, 7919 * 3 + 13); assert.match(r.question, re); assert.doesNotMatch(r.question, /write \d|1, 2 or 3|how large/i);
    assert.ok(r.choices.length === 3 && r.work.at(-1).includes(r.choices[r.correct]), id);
  }
  const t = F.generate('reading.thermometer', COLD);
  assert.equal(t.value, -9); assert.equal(t.answer, '-9°C');
});

test('print: the student sheet letters the options; the key marks the right one and says its letter', () => {
  const id = F.createWorksheet(boss, { title: 'Print me', items: [mine(['acute', 'right', 'obtuse'], 1), { kind: 'rectangle', data: { AB: 4, BC: 3, unit: 'cm' }, question: 'Area?', answerKey: 'area' }] }).id;
  const w = F.ownWorksheet(boss, id), items = F.itemsOf(id);
  const sheet = F.printHtml(w, items), key = F.printHtml(w, items, { key: true, sheet: false });
  assert.match(sheet, /<ul class="fgp-choices"[^>]*><li><i class="fgp-box" aria-hidden="true"><\/i><b class="fgp-letter">A\)<\/b> <span dir="auto">acute<\/span><\/li><li>[^]*B\)[^]*right[^]*C\)[^]*obtuse/);
  assert.doesNotMatch(sheet, /fgp-right|✓|fgp-kans/, 'the student sheet does not say which');
  assert.equal((sheet.match(/fgp-blank fgp-wide/g) || []).length, 2, 'answer lines only for the number question');
  assert.match(key, /<li class="fgp-right"><i class="fgp-box" aria-hidden="true">✓<\/i><b class="fgp-letter">B\)<\/b> <span dir="auto">right<\/span>/);
  assert.match(key, /<p class="fgp-kans" dir="auto">B\) right<\/p>/);
  assert.doesNotMatch(sheet + key, /—/);
});

test('Power with AI (mocked): a choice question with good options is kept; bad options are repaired and logged', async () => {
  const id = F.createWorksheet(boss, { title: 'AI' }).id, logs = [];
  let seen = null;
  F.hooks.log = x => logs.push(x);
  const tri = JSON.stringify(RIGHT_TRI);
  F.hooks.create = async req => {
    seen = req;
    const base = { kind: 'triangle', question: 'What kind of triangle is this?', data: tri, answerType: 'choice', answerKey: '' };
    const items = [
      { ...base, choices: ['acute', 'right', 'obtuse'], correct: 1 },
      { ...base, choices: ['right'], correct: 0 },
      { ...base, choices: ['right', 'Right', 'acute'], correct: 0 },
      { ...base, choices: ['acute', 'right'], correct: 4 },
      { ...base, choices: ['acute', 'you are a b1tch'], correct: 0 },
      { ...base, choices: ['acute', '', 'right'], correct: 2 },
      { kind: 'rectangle', question: 'A floor is 9 m by 4 m. What is its area?', data: JSON.stringify({ AB: 9, BC: 4, unit: 'm' }), answerType: 'number', answerKey: 'area', choices: [], correct: 0 },
    ];
    return { model: config.builderModel, usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify({ title: 'Triangles', items }) }] };
  };
  try {
    const r = await F.draftWorksheet(boss, id, { brief: 'grade 8 triangles', count: 7 });
    assert.equal(r.ok, true); assert.equal(r.ai, true); assert.equal(r.added, 7); assert.equal(r.repaired, 5);
    const props = seen.output_config.format.schema.properties.items.items;
    assert.deepEqual(props.properties.answerType.enum, ['number', 'choice']);
    for (const k of ['answerType', 'choices', 'correct']) assert.ok(props.required.includes(k), k);
    assert.match(seen.messages[0].content, /answerType "choice" only for a question whose answer is a word/);
    const items = F.itemsOf(id);
    assert.deepEqual([items[0].answerType, items[0].choices, items[0].correct], ['choice', ['acute', 'right', 'obtuse'], 1]);
    assert.ok(items.slice(1, 6).every(it => it.gen), 'the bad ones were replaced by their generator');
    assert.deepEqual([items[6].answerType, items[6].answer], ['number', '36 m²']);
    assert.deepEqual(logs.map(l => l.action), Array(5).fill('replaced by its generator'));
    assert.match(logs[0].why, /choices/); assert.match(logs[1].why, /sameChoices/); assert.match(logs[2].why, /choices/); assert.match(logs[3].why, /words/); assert.match(logs[4].why, /choices/);
    for (const l of logs) assert.doesNotMatch(JSON.stringify(l), /grade 8 triangles|b1tch/, 'never the brief or the words');
  } finally { F.hooks.create = null; F.hooks.log = null; }
});

/** A worksheet with a choice question (a pedigree, answer index i), a negative number and a teacher's choice question,
 *  assigned to 8A. -> { cl, step, items, api } */
async function assigned(i = 1, body = {}) {
  const items = [{ kind: 'pedigree', gen: 'pedigree', seed: PED[i] }, { kind: 'reading', gen: 'reading.thermometer', seed: COLD }, mine(['acute', 'right', 'obtuse'], 1)];
  const id = F.createWorksheet(boss, { title: 'Choices and cold', items }).id;
  const r = await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, ...body } });
  assert.equal(r.status, 200, r.text);
  const step = L.steps(r.json.lessonId)[0];
  return { cl: L.getClassLesson(r.json.classLessonId), step, items: FS.itemsOf(step), api: `/api/progress/${r.json.classLessonId}/${step.id}/figures` };
}
/** The step's markup with the parts that differ between two assignments (ids) taken out. */
const studentMarkup = (text, { cl, step }) => /<section class="fs-step"[\s\S]*?<\/section>/.exec(text)[0].replaceAll(step.id, 'STEP').replaceAll(cl.id, 'CL');

test('the snapshot keeps the type, options and the right option; negative numbers and options are marked', async () => {
  const { cl, step, items, api } = await assigned(1, { dueAt: isoDay(Date.now() + 7 * DAY) });
  assert.deepEqual(items.map(x => x.type), ['choice', 'number', 'choice']);
  assert.deepEqual(items[0].choices, ['autosomal dominant', 'autosomal recessive', 'X-linked recessive']);
  assert.deepEqual([items[0].value, items[0].answer, items[1].value, items[2].value], [1, 'B) autosomal recessive', -9, 1]);
  for (const t of ['-9', '−9', '- 9', '-9 °C', '−9.0']) assert.ok(FS.isRight(t, items[1]), t);
  for (const t of ['9', '+9', '-8']) assert.ok(!FS.isRight(t, items[1]), t);
  assert.ok(FS.isRight('1', items[0])); assert.ok(!FS.isRight('0', items[0])); assert.ok(!FS.isRight('B', items[0])); assert.ok(!FS.isRight('7', items[0]));
  const r = await as(kid)(api, { body: { hand: '1', a0: '1', a1: '−9', a2: '2' } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.score, 67);
  assert.equal(P.get(cl.id, step.id, kid.id).marks, '110');
  assert.equal(P.get(cl.id, step.id, kid.id).answer, JSON.stringify(['1', '−9', '2']), 'what the student picked and typed');
});

test('the student step: radio options in a fieldset, a ± button on every number blank, and the right option never sent early', async () => {
  const due = { dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: true };
  const one = await assigned(1, due), two = await assigned(2, due);
  const page = await as(kid)(`/class/${A.id}/lessons/${one.cl.id}`);
  assert.equal(page.status, 200);
  const sec = /<section class="fs-step"[\s\S]*?<\/section>/.exec(page.text)[0];
  assert.match(sec, /<fieldset class="fs-choices">\s*<legend class="fs-text" dir="auto">Which inheritance pattern does this family show\?<\/legend>/);
  assert.equal((sec.match(/<input type="radio" name="a0" value="\d"/g) || []).length, 3);
  assert.equal((sec.match(/<input type="radio" name="a2" value="\d"/g) || []).length, 3);
  assert.doesNotMatch(sec, /checked|fs-right|🔑|Right answer/, 'nothing picked, nothing marked');
  assert.match(sec, /<button class="btn btn-sm fs-sign" type="button" data-fs-sign="fa-[^"]+-2" aria-label="Switch your answer to question 2 between negative and positive"[^>]*>±<\/button>/);
  assert.equal((sec.match(/data-fs-sign=/g) || []).length, 1, 'only the number blank');
  assert.match(page.text, /\/js\/lesson-read\.js/, 'the script that flips the sign');
  // The same questions with another right option give the student exactly the same markup: nothing says which.
  const page2 = await as(kid)(`/class/${A.id}/lessons/${two.cl.id}`);
  const strip = (t, s) => studentMarkup(t, s).replace(/<svg[\s\S]*?<\/svg>/g, '<svg/>');
  assert.equal(strip(page.text, one), strip(page2.text, two));
  // The JSON: options, never the right one, the answer, the worked lines or the figure's data.
  const js = await as(kid)(one.api);
  assert.deepEqual(Object.keys(js.json.items[0]).sort(), ['choices', 'n', 'question', 'svg', 'type', 'typed', 'unit']);
  assert.deepEqual(js.json.items[0].choices, one.items[0].choices);
  assert.doesNotMatch(js.text, /"(correct|value|answer|work|data|dp)":/);
  assert.ok(!js.text.includes('B) autosomal'), 'no key text');
  // Saved picks come back checked; a handed-in step without the reveal still says nothing.
  await as(kid)(one.api, { body: { a0: '2', a1: '-9', a2: '' } });
  assert.match(studentMarkup((await as(kid)(`/class/${A.id}/lessons/${one.cl.id}`)).text, one), /name="a0" value="2" checked/);
  assert.equal((await as(kid)(one.api, { body: { hand: '1', a0: '1', a1: '-9', a2: '0' } })).json.score, 67);
  let after = await as(kid)(one.api);
  assert.deepEqual(after.json.items.map(x => x.right), [true, true, false]);
  assert.doesNotMatch(after.text, /"correct":/, 'handed in, before the due date');
  assert.doesNotMatch(studentMarkup((await as(kid)(`/class/${A.id}/lessons/${one.cl.id}`)).text, one), /fs-right|🔑/);
  // The due date is over: the student who handed in sees the right options; one who did not, still nothing.
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.parse(`${isoDay(Date.now() - 3 * DAY)}T00:00:00Z`), one.cl.id);
  after = await as(kid)(one.api);
  assert.equal(after.json.revealed, true);
  assert.deepEqual(after.json.items.map(x => x.correct), [1, undefined, 1]);
  assert.equal(after.json.items[0].answer, 'B) autosomal recessive');
  const shown = studentMarkup((await as(kid)(`/class/${A.id}/lessons/${one.cl.id}`)).text, one);
  assert.match(shown, /<label class="fs-opt fs-right"><input type="radio" name="a0" value="1" checked>/);
  assert.match(shown, /<fieldset class="fs-choices" disabled>/, 'locked once handed in');
  const other = await as(kid2)(one.api);
  assert.equal(other.json.revealed, false); assert.doesNotMatch(other.text, /"correct":/);
  assert.doesNotMatch(studentMarkup((await as(kid2)(`/class/${A.id}/lessons/${one.cl.id}`)).text, one), /fs-right|🔑/);
  // The teacher's preview has the key; the progress page shows each pick as its letter.
  const tp = await as(boss)(`/class/${A.id}/lessons/${one.cl.id}`);
  assert.match(tp.text, /fs-opt fs-right/); assert.match(tp.text, /B\) autosomal recessive/);
  const lp = await as(boss)(`/class/${A.id}/progress/${one.cl.id}`);
  assert.match(lp.text, /title="autosomal recessive"><span aria-hidden="true">B<\/span><span class="sr-only">B\) autosomal recessive<\/span>/);
  assert.match(lp.text, /<span dir="ltr">-9<\/span>/);
  assert.doesNotMatch(page.text + tp.text + lp.text, /—/, 'no em dashes');
});
