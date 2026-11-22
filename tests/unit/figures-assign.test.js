// Figures: Assign to class (services/figures-steps.js, routes/figures.js /assign, routes/progress.js; docs/decisions.md
// "Figures: Assign to class"): the worksheet builder assigns a worksheet to one of the tester's classes as a lesson with
// one figures step (a snapshot: later worksheet edits never change it); only testers can assign; the class's students
// answer under each figure, save, hand in once, and are marked with a tolerance from the stored dp; the gradebook and
// the Score count it like a quiz; answers and worked lines never reach a student before the teacher allows it, the due
// date is over and the student handed in; the teacher's switch; the step editor offers the kind only behind the gate.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const SC = await import('../../server/services/scores.js');
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
const withFlags = async (flags, fn) => { const old = { f: config.figures, u: config.manipulativesUsers }; Object.assign(config, flags); try { await fn(); } finally { config.figures = old.f; config.manipulativesUsers = old.u; } };

// The platform admin (a Figures tester) teaches 7A; T teaches 7B and is not on the tester list. kid and kid2 are in 7A.
const boss = createUser({ username: 'FigAssignBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Assign Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: '7A' }).class;
const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Teacher', role: 'teacher' }).user.id);
const B7 = S.createClass(boss, oak.id, { name: '7B', teacherId: T.id }).class;
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Kim Kid' }).user.id);
const kid2 = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Lee Kid' }).user.id);
const other = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Olly Other' }).user.id);
S.addToClass(boss, A.id, kid.id); S.addToClass(boss, A.id, kid2.id); S.addToClass(boss, B7.id, other.id);

// Three generator questions whose figure data holds the answer (a caliper's reading, a protractor's angle) or that
// have worked lines (the right triangle), and one the teacher answered from OF.solve.
const GENS = [['reading.caliper', 7], ['protractor', 7], ['triangle', 7]];
function sheet(extra = []) {
  const items = GENS.map(([gen, seed]) => ({ kind: F.genOf(gen).kind, gen, seed }));
  const r = F.createWorksheet(boss, { title: 'Readings and triangles', grade: '7', items: [...items, ...extra] });
  assert.ok(r.ok, JSON.stringify(r));
  return r.id;
}
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
const DAY = 24 * 3600e3;

test('migration 0096: once, after 0095, adds of_version and show_answers to lesson_steps', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.filter(n => n.startsWith('0096')).length, 1);
  assert.ok(names.indexOf('0096_figures_steps') > names.indexOf('0095_figures_question_sets'));
  const cols = q.all('PRAGMA table_info(lesson_steps)').map(c => c.name);
  assert.ok(cols.includes('of_version') && cols.includes('show_answers'));
});

test('marking: numbers in many spellings, a tolerance of half the last decimal place', () => {
  assert.deepEqual(FS.readNumber('5'), [5]);
  assert.deepEqual(FS.readNumber(' 5 cm '), [5]);
  assert.deepEqual(FS.readNumber('x = 5'), [5]);
  assert.deepEqual(FS.readNumber('12 cm²'), [12]);
  assert.deepEqual(FS.readNumber('−2.5'), [-2.5]);
  assert.deepEqual(FS.readNumber('2,5'), [2.5]);
  assert.deepEqual(FS.readNumber('1,250').sort(), [1.25, 1250].sort());
  assert.deepEqual(FS.readNumber('3/4'), [0.75]);
  assert.deepEqual(FS.readNumber('٣٫٥'), [3.5]);
  assert.deepEqual(FS.readNumber('５'), [5]);
  for (const bad of ['', 'five', '5 or 6', '1/0']) assert.deepEqual(FS.readNumber(bad), [], bad);
  const cyl = { value: 50.26548, dp: 1 };
  assert.ok(FS.isRight('50.3', cyl)); assert.ok(FS.isRight('50.27', cyl)); assert.ok(FS.isRight('50,3', cyl));
  assert.ok(!FS.isRight('50.2', cyl)); assert.ok(!FS.isRight('50', cyl)); assert.ok(!FS.isRight('', cyl));
  assert.ok(FS.isRight('126', { value: 126, dp: 0 })); assert.ok(!FS.isRight('125', { value: 126, dp: 0 }));
  assert.ok(FS.isRight('1/6', { value: 1 / 6, dp: 3 })); assert.ok(FS.isRight('0.167', { value: 1 / 6, dp: 3 })); assert.ok(!FS.isRight('0.17', { value: 1 / 6, dp: 3 }));
});

test('gate: only a Figures tester assigns, only their own worksheet, only to a class they teach', async () => {
  const id = sheet();
  // T teaches 7B but is not on the tester list: the normal 404, like every /figures address.
  assert.equal((await as(T)(`/api/figures/worksheets/${id}/assign`, { body: { classId: B7.id } })).status, 404);
  assert.equal(FS.assignWorksheet(T, id, B7.id).code, 'notFound');
  assert.equal((await as(kid)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id } })).status, 404);
  await withFlags({ figures: false }, async () => assert.equal((await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id } })).status, 404, 'FIGURES=0'));
  await withFlags({ manipulativesUsers: [T.username.toLowerCase()] }, async () => {
    // On the list now, but the worksheet is the boss's: the same 404 as a wrong id.
    assert.equal((await as(T)(`/api/figures/worksheets/${id}/assign`, { body: { classId: B7.id } })).status, 404);
  });
  const r = await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: B7.id } });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'noClass', 'the boss does not teach 7B');
  // The builder lists the tester's own classes for the dialog.
  const page = await as(boss)(`/figures/worksheets/${id}`);
  const data = JSON.parse(/<script type="application\/json" id="fg-sheet">([\s\S]*?)<\/script>/.exec(page.text)[1].replace(/\\u003c/g, '<'));
  assert.deepEqual(data.classes.map(c => c.id), [A.id]);
  assert.doesNotMatch(page.text, /Coming next/);
});

test('assign refuses an empty worksheet, a question without an answer and bad dates; makes a lesson with a snapshot', async () => {
  const empty = F.createWorksheet(boss, { title: 'Empty' }).id;
  let r = await as(boss)(`/api/figures/worksheets/${empty}/assign`, { body: { classId: A.id } });
  assert.equal(r.json.code, 'empty');
  const orbitals = F.kindOf('orbitals');
  const noAns = sheet([{ kind: 'orbitals', data: orbitals.presets[0] }]);
  r = await as(boss)(`/api/figures/worksheets/${noAns}/assign`, { body: { classId: A.id } });
  assert.equal(r.json.code, 'noAnswer'); assert.deepEqual(r.json.questions, [4]); assert.match(r.json.error, /question 4/);
  const id = sheet();
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, dueAt: 'soon' } })).json.code, 'badDate');
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, opensAt: '2026-12-10', dueAt: '2026-12-01' } })).json.code, 'dueBeforeOpen');
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, showAnswers: true } })).json.code, 'needsDue');
  r = await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: true } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.view, `/class/${A.id}/lessons/${r.json.classLessonId}`);
  const l = L.getLesson(r.json.lessonId);
  assert.equal(l.kind, 'figures'); assert.equal(l.title, 'Readings and triangles');
  const st = L.steps(l.id); assert.equal(st.length, 1);
  const s = st[0];
  assert.equal(s.kind, 'figures'); assert.equal(s.set_id, id); assert.equal(s.of_version, F.OF_VERSION); assert.equal(s.show_answers, 1);
  const items = FS.itemsOf(s);
  assert.equal(items.length, 3);
  for (const [i, [gen, seed]] of GENS.entries()) {
    const g = F.generate(gen, seed);
    assert.equal(items[i].value, g.value); assert.equal(items[i].dp, g.dp); assert.equal(items[i].unit, g.unit);
    assert.equal(JSON.stringify(items[i].data), JSON.stringify(g.data)); assert.equal(items[i].answer, g.answer); assert.deepEqual(items[i].work, [...g.work]);
  }
  const cl = L.getClassLesson(r.json.classLessonId);
  assert.equal(cl.class_id, A.id); assert.ok(cl.due_at > Date.now());
  // Later edits to the worksheet (or deleting it) never change the assigned lesson.
  const w = F.worksheetView(boss, id);
  F.updateItem(boss, id, w.items[0].id, { question: 'Changed later' });
  F.regenItem(boss, id, w.items[2].id, 99);
  F.deleteWorksheet(boss, id);
  assert.equal(L.getStep(s.id).items, s.items, 'the snapshot stays');
  // An answerKey question is snapshotted with its OF.solve value (2 decimal places).
  const id2 = F.createWorksheet(boss, { title: 'Hyp', items: [{ kind: 'triangle', data: { AB: 5, BC: 12, B: 90, labels: { CA: 'x' } }, answerKey: 'sides.CA' }] }).id;
  const snap = FS.snapshot(boss, id2);
  assert.ok(snap.ok); assert.ok(Math.abs(snap.items[0].value - 13) < 1e-9); assert.ok(FS.isRight('13', snap.items[0])); assert.equal(snap.items[0].dp, 2); assert.equal(snap.items[0].unit, '');
});

/** A fresh assignment to 7A: { cl, step, items }. */
async function assigned(body = {}) {
  const id = sheet();
  const r = await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, ...body } });
  assert.equal(r.status, 200, r.text);
  const step = L.steps(r.json.lessonId)[0];
  return { cl: L.getClassLesson(r.json.classLessonId), step, items: FS.itemsOf(step) };
}
const secrets = items => items.flatMap(it => [it.answer, ...it.work]).filter(x => x && x.length >= 4);
const noSecrets = (text, items, what) => {
  for (const s of secrets(items)) assert.ok(!text.includes(s), `${what} leaks "${s}"`);
  assert.doesNotMatch(text, /"(value|answer|work|data|dp)":/, `${what}: no answer fields`);
  for (const svg of text.match(/<svg[\s\S]*?<\/svg>/g) || []) assert.doesNotMatch(svg, /data-(?!of=)[a-z-]+=/, `${what}: no figure values in data attributes`);
};

test('the student page and JSON: figures drawn here, a blank with the unit, never the answers before they are allowed', async () => {
  const { cl, step, items } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: true });
  const page = await as(kid)(`/class/${A.id}/lessons/${cl.id}`);
  assert.equal(page.status, 200);
  assert.equal((page.text.match(/<svg[^>]*class="of-fig/g) || []).length, 3, 'three figures, drawn on the server');
  assert.match(page.text, /name="a0"[\s\S]*name="a1"[\s\S]*name="a2"/);
  assert.match(page.text, /class="fs-unit" dir="ltr">mm</);
  assert.match(page.text, /value="1" data-confirm="Hand in your answers\?/);
  noSecrets(page.text, items, 'student page');
  const js = await as(kid)(`/api/progress/${cl.id}/${step.id}/figures`);
  assert.equal(js.status, 200);
  assert.equal(js.json.revealed, false); assert.equal(js.json.items.length, 3);
  assert.deepEqual(Object.keys(js.json.items[0]).sort(), ['n', 'question', 'svg', 'type', 'typed', 'unit']);
  noSecrets(js.text, items, 'student JSON');
  // Not in the class, or a teacher: no student JSON. The teacher's own preview has the answer key.
  assert.equal((await as(other)(`/api/progress/${cl.id}/${step.id}/figures`)).status, 404);
  assert.equal((await as(other)(`/class/${A.id}/lessons/${cl.id}`)).status, 404);
  assert.equal((await as(boss)(`/api/progress/${cl.id}/${step.id}/figures`)).status, 404);
  const tp = await as(boss)(`/class/${A.id}/lessons/${cl.id}`);
  assert.match(tp.text, /Answer key:/); assert.ok(tp.text.includes(items[0].answer));
  assert.doesNotMatch(tp.text, /name="hand"/, 'the preview saves nothing');
  assert.doesNotMatch(page.text + tp.text, /\u2014/, 'no em dashes');
});

test('save, hand in once, marked with the dp tolerance; the gradebook and the Score count it like a quiz', async () => {
  const { cl, step, items } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY) });
  const api = `/api/progress/${cl.id}/${step.id}/figures`;
  const near = it => String(+(it.value + 0.4 * 10 ** -it.dp).toFixed(it.dp + 1));
  let r = await as(kid)(api, { body: { a0: near(items[0]), a1: '', a2: '' } });
  assert.equal(r.status, 200); assert.equal(r.json.handedIn, false); assert.equal(r.json.toast, 'Saved');
  let row = P.get(cl.id, step.id, kid.id);
  assert.equal(row.status, 'started'); assert.equal(row.marks, ''); assert.equal(row.score, null);
  assert.equal((await as(kid)(api)).json.items[0].typed, near(items[0]));
  assert.equal(P.markDone(kid, cl.id, step.id).code, 'notFound', 'done only by handing in');
  assert.equal((await as(kid)(api, { body: { hand: '1', a0: '', a1: '', a2: '' } })).json.code, 'answerEmpty');
  r = await as(kid)(api, { body: { hand: '1', a0: near(items[0]), a1: `${items[1].value}${items[1].unit}`, a2: String(items[2].value + 1) } });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.handedIn, true); assert.equal(r.json.score, 67);
  row = P.get(cl.id, step.id, kid.id);
  assert.deepEqual({ status: row.status, marks: row.marks, score: row.score, label: row.label }, { status: 'done', marks: '110', score: 67, label: 'figures' });
  assert.equal((await as(kid)(api, { body: { hand: '1', a0: '1', a1: '1', a2: String(items[2].value) } })).json.code, 'handedIn', 'once');
  assert.equal((await as(kid)(api, { body: { answers: ['1', '2', '3', '4'] } })).status, 400, 'more answers than questions');
  const after = await as(kid)(api);
  assert.deepEqual(after.json.items.map(x => x.right), [true, true, false]);
  assert.equal(after.json.revealed, false, 'show answers is off');
  noSecrets(after.text, items, 'after hand-in, switch off');
  const page = await as(kid)(`/class/${A.id}/lessons/${cl.id}`);
  assert.match(page.text, /You got 2 of 3 right \(67%\)/); assert.match(page.text, /readonly/);
  // Gradebook: the lesson's quiz-like score; the Score: 2 of 3 points.
  const gb = P.classProgress(A.id), col = gb.lessons.findIndex(x => x.id === cl.id);
  const me = gb.students.find(p => p.id === kid.id);
  assert.equal(me.cells[col].quiz, 67); assert.equal(gb.lessons[col].hasQuiz, true);
  const its = SC.classItems(A.id).get(`${kid.id}:${cl.id}`);
  assert.deepEqual(its.map(x => [x.kind, x.stepKind, x.earned, x.possible]), [['quiz', 'figures', 2, 3]]);
  const lp = await as(boss)(`/class/${A.id}/progress/${cl.id}`);
  assert.equal(lp.status, 200);
  assert.match(lp.text, /2\/3 · 67%/);
  assert.match(lp.text, /Handed in: 1 of 2/);
  assert.match(lp.text, /Question 1<\/b> <span>1 of 1 right/);
  const gbPage = await as(boss)(`/class/${A.id}/progress`);
  assert.match(gbPage.text, /<span dir="ltr">67%<\/span>/);
});

test('answers and worked lines: only with the switch on, the due date over, and handed in', async () => {
  const past = isoDay(Date.now() - 5 * DAY);
  const { cl, step, items } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: true });
  const api = `/api/progress/${cl.id}/${step.id}/figures`;
  await as(kid)(api, { body: { hand: '1', a0: String(items[0].value), a1: '0', a2: '0' } });
  // Before the due date: nothing, even with the switch on and handed in.
  let r = await as(kid)(api); assert.equal(r.json.revealed, false); noSecrets(r.text, items, 'before the due date');
  let page = await as(kid)(`/class/${A.id}/lessons/${cl.id}`); noSecrets(page.text, items, 'page before the due date');
  assert.match(page.text, /Your teacher will show the answers after the due date/);
  // The due date is over: the student who handed in sees the answers, worked lines and the full figure.
  q.run('UPDATE class_lessons SET due_at=? WHERE id=?', Date.parse(`${past}T00:00:00Z`), cl.id);
  r = await as(kid)(api);
  assert.equal(r.json.revealed, true);
  assert.deepEqual(r.json.items.map(x => x.answer), items.map(it => it.answer));
  assert.deepEqual(r.json.items[2].work, items[2].work); assert.ok(items[2].work.length > 0, 'the triangle has worked lines');
  page = await as(kid)(`/class/${A.id}/lessons/${cl.id}`);
  for (const s of secrets(items)) assert.ok(page.text.includes(s.replace(/'/g, '&#39;')), `shows ${s}`);
  // kid2 has not handed in: still nothing, and the page says to hand in first.
  r = await as(kid2)(api); assert.equal(r.json.revealed, false); noSecrets(r.text, items, 'not handed in');
  page = await as(kid2)(`/class/${A.id}/lessons/${cl.id}`); noSecrets(page.text, items, 'page, not handed in');
  assert.match(page.text, /The answers are ready\. Hand in your work to see them\./);
  // The teacher turns the switch off: hidden again for everyone.
  assert.equal((await as(kid)(`/api/progress/${cl.id}/${step.id}/show-answers`, { body: { on: false } })).status, 404, 'students cannot');
  assert.equal((await as(T)(`/api/progress/${cl.id}/${step.id}/show-answers`, { body: { on: false } })).status, 404, 'not their class');
  const off = await as(boss)(`/api/progress/${cl.id}/${step.id}/show-answers`, { body: {} });
  assert.equal(off.status, 200); assert.equal(off.json.on, false);
  r = await as(kid)(api); assert.equal(r.json.revealed, false); noSecrets(r.text, items, 'switch turned off');
  assert.equal((await as(boss)(`/api/progress/${cl.id}/${step.id}/show-answers`, { body: { on: '1' } })).json.on, true);
  assert.equal((await as(kid)(api)).json.revealed, true);
  // Off by default, and it needs a due date.
  const d = await assigned({});
  assert.equal(d.step.show_answers, 0);
  const needs = await as(boss)(`/api/progress/${d.cl.id}/${d.step.id}/show-answers`, { body: { on: true } });
  assert.equal(needs.status, 400); assert.equal(needs.json.code, 'needsDue');
});

test('the figure SVG a student gets: hidden parts left out and no data-* values', () => {
  const step = { id: 'svgtest', of_version: F.OF_VERSION, items: JSON.stringify([F.generate('mappingDiagram', 7)].map(g => ({ kind: g.kind, data: g.data, hide: g.hide, question: g.question, answer: g.answer, unit: g.unit, value: g.value, dp: g.dp, work: g.work }))) };
  const raw = F.kitFor(F.OF_VERSION).svg('mappingDiagram', F.generate('mappingDiagram', 7).data, { hide: 'outputs' });
  assert.match(raw, /data-to="\d/, 'Oomba Figures itself keeps values in data-* attributes');
  const svg = FS.figureSvg(step, 0);
  assert.match(svg, /data-of="mappingDiagram"/);
  assert.doesNotMatch(svg, /data-(?!of=)/);
});

test('the step editor offers Figure questions only behind the Figures gate; its kind stays; a copy keeps the snapshot', async () => {
  const { step } = await assigned({ dueAt: isoDay(Date.now() + 7 * DAY), showAnswers: true });
  const ed = await as(boss)(`/teach/lessons/${step.lesson_id}`);
  assert.equal(ed.status, 200);
  // A Figures tester may add a "Figure questions" step (tests/unit/figures-lesson-step.test.js); with FIGURES=0 it is gone.
  assert.match(ed.text, /<option value="figures"/);
  await withFlags({ figures: false }, async () => assert.doesNotMatch((await as(boss)(`/teach/lessons/${step.lesson_id}`)).text, /<option value="figures"/));
  assert.match(ed.text, /3 figure questions/);
  assert.equal(L.addStep(boss, step.lesson_id, { kind: 'figures', body: 'x' }).code, 'stepKind');
  assert.equal(L.updateStep(boss, step.id, { kind: 'text', body: 'x' }).code, 'stepKind');
  assert.ok(L.updateStep(boss, step.id, { title: 'Readings homework' }).ok);
  const copy = L.copyLesson(boss, step.lesson_id);
  assert.ok(copy.ok);
  const c = L.steps(copy.lesson.id)[0];
  assert.equal(c.kind, 'figures'); assert.equal(c.items, L.getStep(step.id).items); assert.equal(c.of_version, F.OF_VERSION); assert.equal(c.show_answers, 1);
  // The class's lessons list shows it with the figures icon.
  const cls = await as(boss)(`/class/${A.id}?tab=lessons`);
  assert.equal(cls.status, 200);
});
