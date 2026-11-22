// Figures Phase 3 (docs/decisions.md "Figures: the lesson Figure step and Build a test"): the lesson editor's "Figure
// questions" step (a lesson set edited in the Figures builder, Save to lesson snapshots it like Assign, behind the
// Figures gate), its print page (black on white), the lesson drafter's figure catalog (only catalog figures, every
// figure through OF.check, repairs logged without the topic, the budget cap and the template), and "Build a test"
// (purpose 'test': AI on picks generators so each question can be re-dealt, AI off is the same builder by hand; swap,
// re-deal, change, delete; assigned only on an explicit Assign, with dates; the student does it).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const F = await import('../../server/services/figures.js');
const FS = await import('../../server/services/figures-steps.js');
const LA = await import('../../server/services/lesson-ai.js');
const aiBudget = await import('../../server/services/ai-budget.js');
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
const pageData = (text, id) => JSON.parse(new RegExp(`<script type="application/json" id="${id}">([\\s\\S]*?)</script>`).exec(text)[1].replace(/\\u003c/g, '<'));
const DAY = 24 * 3600e3, isoDay = ms => new Date(ms).toISOString().slice(0, 10);

// The platform admin teaches 8A; T teaches 8B and is on no tester list (Figures is open to every teacher).
const boss = createUser({ username: 'FigP3Boss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Phase Three Oak' }).school;
S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
const A = S.createClass(boss, oak.id, { name: '8A' }).class;
const T = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tom Teacher', role: 'teacher' }).user.id);
S.createClass(boss, oak.id, { name: '8B', teacherId: T.id });
const kid = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Quinn Kid' }).user.id);
S.addToClass(boss, A.id, kid.id);
const lessonOf = (u, title = 'Shapes and forces') => L.createLesson(u, oak.id, { title, kind: 'lesson', grade: '7' }).lesson;
const hookAI = (fn, logs) => { F.hooks.create = fn; F.hooks.log = logs ? x => logs.push(x) : null; LA.hooks.create = fn; LA.hooks.log = logs ? x => logs.push(x) : null; };
const unhook = () => { F.hooks.create = null; F.hooks.log = null; LA.hooks.create = null; LA.hooks.log = null; };
const reply = obj => ({ model: 'mock', usage: { input_tokens: 10, output_tokens: 10 }, content: [{ type: 'text', text: JSON.stringify(obj) }] });

test('migration 0100: once, after 0099, adds question_sets.lesson_id', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.equal(names.filter(n => n.startsWith('0100')).length, 1);
  assert.ok(names.indexOf('0100_figures_lesson_sets') > names.indexOf('0099_figures_answer_types'));
  assert.ok(q.all('PRAGMA table_info(question_sets)').map(c => c.name).includes('lesson_id'));
});

test('the figure catalog: kinds with a generator, a line, a parameter schema, OF.solve keys; every example draws', () => {
  const cat = F.figureCatalog();
  assert.ok(cat.length >= 40, `${cat.length} kinds`);
  for (const c of cat) {
    const K = F.kindOf(c.id);
    assert.ok(K.gens.length, `${c.id} has a generator`);
    assert.ok(c.description && !/[\u2014\u2013]/.test(c.description), c.id);
    assert.ok(Object.keys(c.params).length, `${c.id} has parameters`);
    for (const [k, v] of Object.entries(c.params)) assert.ok(Array.isArray(v) || ['number', 'text', 'bool', 'list', 'object'].includes(v), `${c.id}.${k}: ${v}`);
    assert.equal(F.checkFigure(c.id, c.example).length, 0, c.id);
    for (const k of c.keys) assert.equal(typeof F.solved(c.id, c.example)[k], 'number', `${c.id} ${k}`);
  }
  const tri = cat.find(c => c.id === 'triangle');
  assert.equal(tri.params.AB, 'number'); assert.equal(tri.params.unit, 'text'); assert.ok(tri.keys.includes('sides.CA'));
  assert.deepEqual(F.figureCatalog({ subject: 'physics' }).every(c => c.subject === 'physics' || (F.kindOf(c.id).also || []).includes('physics')), true);
  assert.match(F.catalogLine(tri), /^- triangle \(math; grades .*\): .*Parameters: \{.*"AB":"number".*answerKey choices for the example: .*sides\.CA/);
});

test('gate: the lesson editor offers Figure questions to every teacher (not only testers); FIGURES=0 hides it', async () => {
  const l = lessonOf(boss);
  let ed = await as(boss)(`/teach/lessons/${l.id}`);
  assert.equal(ed.status, 200);
  assert.match(ed.text, /<option value="figures"\s*>📐 Figure questions<\/option>/);
  await withFlags({ figures: false }, async () => {
    ed = await as(boss)(`/teach/lessons/${l.id}`);
    assert.doesNotMatch(ed.text, /<option value="figures"/);
    const r = await as(boss)(`/api/lessons/${l.id}/steps`, { body: { kind: 'figures', title: 'x' } });
    assert.equal(r.status, 400); assert.match(r.json.error, /Pick a type of step/);
  });
  // A plain teacher (on no tester list): the same, and FIGURES=0 hides it from them too.
  assert.ok(!config.manipulativesUsers.includes(T.username.toLowerCase()));
  const tl = lessonOf(T, 'Tom lesson');
  ed = await as(T)(`/teach/lessons/${tl.id}`);
  assert.equal(ed.status, 200); assert.match(ed.text, /<option value="figures"\s*>📐 Figure questions<\/option>/);
  await withFlags({ figures: false }, async () => {
    assert.doesNotMatch((await as(T)(`/teach/lessons/${tl.id}`)).text, /<option value="figures"/);
    assert.equal((await as(T)(`/api/lessons/${tl.id}/steps`, { body: { kind: 'figures' } })).status, 400);
  });
  const made = await as(T)(`/api/lessons/${tl.id}/steps`, { body: { kind: 'figures', title: 'Tom figures' } });
  assert.equal(made.status, 200, made.text); assert.match(made.json.redirect, /^\/figures\/worksheets\//);
  // The service never makes one by itself.
  assert.equal(L.addStep(boss, l.id, { kind: 'figures', body: 'x' }).code, 'stepKind');
  // Someone else's lesson: no set.
  assert.equal(FS.newLessonSet(boss, tl.id).ok, true, 'the platform admin is a school admin here');
  assert.equal(FS.newLessonSet(T, l.id).code, 'notFound', 'a lesson T cannot edit');
});

test('a Figure step: built in the Figures builder, Save to lesson snapshots it, saved again replaces it, students keep it once started', async () => {
  const l = lessonOf(boss, 'Triangles lesson');
  let r = await as(boss)(`/api/lessons/${l.id}/steps`, { body: { kind: 'figures', title: 'Triangle check', minutes: '10' } });
  assert.equal(r.status, 200, r.text);
  const setId = /\/figures\/worksheets\/([^/?#]+)$/.exec(r.json.redirect)[1];
  const w = F.ownWorksheet(boss, setId);
  assert.equal(w.purpose, 'lesson'); assert.equal(w.lesson_id, l.id); assert.equal(w.title, 'Triangle check');
  assert.equal(L.steps(l.id).length, 0, 'nothing in the lesson before Save');
  assert.ok(!F.listWorksheets(boss).some(x => x.id === setId), 'a lesson set is not in My worksheets');
  // The builder knows its lesson: Save to lesson, no Assign classes.
  const pg = await as(boss)(`/figures/worksheets/${setId}`);
  const data = pageData(pg.text, 'fg-sheet');
  assert.equal(data.purpose, 'lesson'); assert.deepEqual(data.lesson, { id: l.id, title: l.title, stepId: null, started: false }); assert.deepEqual(data.classes, []);
  assert.match(pg.text, new RegExp(`href="/teach/lessons/${l.id}"`));
  // Empty: refused.
  assert.equal((await as(boss)(`/api/figures/worksheets/${setId}/save-to-lesson`, { body: {} })).json.code, 'empty');
  // A generator question, an own figure answered from OF.solve, a multiple choice one.
  assert.ok(F.addItem(boss, setId, { kind: 'triangle', gen: 'triangle', seed: 11 }).ok);
  assert.ok(F.addItem(boss, setId, { kind: 'rectangle', data: { AB: 9, BC: 4, unit: 'cm' }, question: 'Find the area.', answerKey: 'area' }).ok);
  assert.ok(F.addItem(boss, setId, { kind: 'pedigree', gen: 'pedigree', seed: 5 }).ok);
  r = await as(boss)(`/api/figures/worksheets/${setId}/save-to-lesson`, { body: {} });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.redirect, `/teach/lessons/${l.id}?figures=saved#steps`);
  let st = L.steps(l.id); assert.equal(st.length, 1);
  const step = st[0];
  assert.equal(step.kind, 'figures'); assert.equal(step.set_id, setId); assert.equal(step.of_version, F.OF_VERSION);
  let items = FS.itemsOf(step);
  assert.equal(items.length, 3);
  assert.equal(items[0].value, F.generate('triangle', 11).value); assert.equal(items[0].gen, 'triangle'); assert.equal(items[0].seed, 11);
  assert.equal(items[1].value, 36); assert.equal(items[1].answer, '36 cm²'); assert.equal(items[1].answerKey, 'area');
  assert.equal(items[2].type, 'choice'); assert.equal(items[2].value, F.generate('pedigree', 5).correct);
  // The editor shows it with Edit questions and Print; the step is not edited with the normal kind select.
  const ed = await as(boss)(`/teach/lessons/${l.id}?figures=saved`);
  assert.match(ed.text, /Figure questions saved to the lesson/);
  assert.match(ed.text, new RegExp(`data-api="/api/lesson-steps/${step.id}/figures-edit"`));
  assert.match(ed.text, new RegExp(`href="/teach/lesson-steps/${step.id}/print"`));
  assert.match(ed.text, /3 figure questions/);
  // Edit questions opens the same set; a change and Save again replace the snapshot in the same step.
  r = await as(boss)(`/api/lesson-steps/${step.id}/figures-edit`, { body: {} });
  assert.equal(r.json.redirect, `/figures/worksheets/${setId}`);
  const first = F.itemsOf(setId)[0];
  assert.ok(F.regenItem(boss, setId, first.id, 77).ok, 're-deal');
  assert.ok(F.deleteItem(boss, setId, F.itemsOf(setId)[2].id).ok);
  assert.equal(pageData((await as(boss)(`/figures/worksheets/${setId}`)).text, 'fg-sheet').lesson.stepId, step.id);
  r = await as(boss)(`/api/figures/worksheets/${setId}/save-to-lesson`, { body: {} });
  assert.equal(r.status, 200);
  st = L.steps(l.id); assert.equal(st.length, 1, 'the same step');
  items = FS.itemsOf(st[0]);
  assert.equal(items.length, 2); assert.equal(items[0].value, F.generate('triangle', 77).value);
  // Assigned and started by a student: its questions stay; Save is refused and the builder says so.
  const a = L.assign(boss, A.id, l.id, { dueAt: isoDay(Date.now() + 7 * DAY) });
  assert.ok(a.ok);
  const sr = await as(kid)(`/api/progress/${a.classLesson.id}/${step.id}/figures`, { body: { answers: [String(items[0].value), '36'], handIn: true } });
  assert.equal(sr.status, 200, sr.text);
  const row = q.get('SELECT * FROM step_progress WHERE step_id=? AND user_id=?', step.id, kid.id);
  assert.equal(row.marks, '11'); assert.equal(row.score, 100);
  r = await as(boss)(`/api/figures/worksheets/${setId}/save-to-lesson`, { body: {} });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'started'); assert.match(r.json.error, /Make a copy of the lesson/);
  assert.equal(pageData((await as(boss)(`/figures/worksheets/${setId}`)).text, 'fg-sheet').lesson.started, true);
  // Someone else cannot save or open it.
  await withFlags({ manipulativesUsers: [T.username.toLowerCase()] }, async () => {
    assert.equal((await as(T)(`/api/figures/worksheets/${setId}/save-to-lesson`, { body: {} })).status, 404);
    assert.equal((await as(T)(`/figures/worksheets/${setId}`)).status, 404);
    assert.equal((await as(T)(`/api/lesson-steps/${step.id}/figures-edit`, { body: {} })).status, 404);
  });
  // Delete the lesson: steps, assignments and its lesson set go.
  assert.ok(L.deleteLesson(boss, l.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM question_sets WHERE id=?', setId).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM question_set_items WHERE set_id=?', setId).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE lesson_id=?', l.id).n, 0);
});

test('Edit questions on an Assign step (or a copy) starts a lesson set from its snapshot, keeping answers', async () => {
  const wid = F.createWorksheet(boss, { title: 'From a worksheet', items: [{ kind: 'triangle', gen: 'triangle', seed: 3 }, { kind: 'rectangle', data: { AB: 7, BC: 3, unit: 'm' }, answerKey: 'area', question: 'Area?' }] }).id;
  const as1 = FS.assignWorksheet(boss, wid, A.id, {});
  assert.ok(as1.ok);
  const step = L.steps(as1.lesson.id)[0];
  const r = FS.editStepSet(boss, step.id);
  assert.ok(r.ok);
  assert.notEqual(r.id, wid, 'the worksheet itself is never edited from the lesson');
  const set = F.ownWorksheet(boss, r.id);
  assert.equal(set.purpose, 'lesson'); assert.equal(set.lesson_id, as1.lesson.id);
  assert.equal(L.getStep(step.id).set_id, r.id);
  const its = F.itemsOf(r.id);
  assert.equal(its.length, 2); assert.equal(its[0].gen, 'triangle'); assert.equal(its[0].seed, 3); assert.equal(its[1].answerKey, 'area');
  assert.deepEqual(F.answerOf(its[1]), { value: 21, dp: 2, unit: 'm²' });
  assert.equal(FS.editStepSet(boss, step.id).id, r.id, 'the same set next time');
  // An older snapshot without answerKey: the OF.solve value equal to the stored answer is found again.
  const old = FS.itemsOf(step).map(({ gen, seed, answerKey, ...x }) => x);
  assert.equal(F.fromSnapshot(old[1]).answerKey, 'area');
  // A copy of the lesson edits its own set.
  const copy = L.copyLesson(boss, as1.lesson.id);
  const cstep = L.steps(copy.lesson.id)[0];
  const cr = FS.editStepSet(boss, cstep.id);
  assert.ok(cr.ok); assert.notEqual(cr.id, r.id); assert.equal(F.ownWorksheet(boss, cr.id).lesson_id, copy.lesson.id);
  // Deleting the step deletes its lesson set (the worksheet stays).
  assert.ok(L.deleteStep(boss, cstep.id).ok);
  assert.equal(F.ownWorksheet(boss, cr.id), null);
  assert.ok(F.ownWorksheet(boss, wid));
});

test('print: a Figure step prints black on white, the key on request, for its editors only', async () => {
  const wid = F.createWorksheet(boss, { title: 'Print me', items: [{ kind: 'triangle', gen: 'triangle', seed: 9 }, { kind: 'pedigree', gen: 'pedigree', seed: 5 }] }).id;
  const step = L.steps(FS.assignWorksheet(boss, wid, A.id, {}).lesson.id)[0];
  const sheet = await as(boss)(`/teach/lesson-steps/${step.id}/print`);
  assert.equal(sheet.status, 200);
  assert.match(sheet.text, /class="fgp"[^>]*data-questions="2" data-key="0"/);
  assert.match(sheet.text, /of-print/, 'the figures are drawn for print');
  assert.doesNotMatch(sheet.text, /#66C792|#1F9D63/i, 'black on white: no brand colors in the figures');
  assert.doesNotMatch(sheet.text, new RegExp(FS.itemsOf(step)[0].answer.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), 'no answers on the student sheet');
  const key = await as(boss)(`/teach/lesson-steps/${step.id}/print?key=1`);
  assert.match(key.text, /data-key="1"/);
  assert.ok(key.text.includes(FS.itemsOf(step)[0].answer));
  assert.match(key.text, /fgp-right/);
  assert.equal((await as(T)(`/teach/lesson-steps/${step.id}/print`)).status, 404);
  assert.equal((await as(kid)(`/teach/lesson-steps/${step.id}/print`)).status, 404);
});

test('Draft with AI: a teacher gets the figure catalog; only catalog figures; bad ones repaired and logged without the topic', async () => {
  const logs = [], seen = [];
  const topic = 'Zanzibar triangles secret topic';
  hookAI(async req => {
    seen.push(req);
    return reply({ title: 'Triangles', summary: 'S', objectives: 'O', steps: [
      { kind: 'text', title: 'Warm-up', body: 'Look at triangles.', minutes: 5, gameId: '', figures: [] },
      { kind: 'figures', title: 'Triangle questions', body: 'Answer each one.', minutes: 15, gameId: '', figures: [
        { kind: 'triangle', question: 'How long is CA?', data: JSON.stringify({ AB: 3, BC: 4, B: 90 }), answerType: 'number', answerKey: 'sides.CA', choices: [], correct: 0 },
        { kind: 'triangle', question: 'Impossible one', data: JSON.stringify({ AB: 1, BC: 1, CA: 5 }), answerType: 'number', answerKey: 'sides.CA', choices: [], correct: 0 },
        { kind: 'rectangle', question: 'Area?', data: JSON.stringify({ AB: 4, BC: 2 }), answerType: 'number', answerKey: 'notAKey', choices: [], correct: 0 },
        { kind: 'teapot', question: 'What shape is the spout?', data: '{}', answerType: 'number', answerKey: '', choices: [], correct: 0 },
      ] },
      { kind: 'figures', title: 'Only made-up figures', body: '', minutes: 5, gameId: '', figures: [
        { kind: 'unicorn', question: 'Describe the unicorn.', data: '{}', answerType: 'number', answerKey: '', choices: [], correct: 0 }] },
      { kind: 'question', title: 'Exit ticket', body: 'What did you learn?', minutes: 5, gameId: '', figures: [] },
    ] });
  }, logs);
  try {
    const r = await as(boss)('/api/lessons/draft', { body: { schoolId: oak.id, topic, grade: '7' } });
    assert.equal(r.status, 200, r.text);
    assert.match(r.json.redirect, /drafted=ai/);
    const prompt = JSON.stringify(seen[0]);
    assert.match(prompt, /Figure catalog:/); assert.match(prompt, /- triangle \(math/); assert.match(prompt, /Parameters:/);
    assert.ok(seen[0].output_config.format.schema.properties.steps.items.properties.kind.enum.includes('figures'));
    const lid = /\/teach\/lessons\/([^?]+)/.exec(r.json.redirect)[1];
    const st = L.steps(lid);
    assert.deepEqual(st.map(s => s.kind), ['text', 'figures', 'question', 'question']);
    const items = FS.itemsOf(st[1]);
    assert.equal(items.length, 3, 'the made-up kind is dropped, the impossible triangle and the bad key are replaced');
    assert.ok(Math.abs(items[0].value - 5) < 1e-9); assert.equal(items[0].question, 'How long is CA?');
    for (const it of items) assert.equal(F.checkFigure(it.kind, it.data).length, 0, 'every figure passes OF.check');
    assert.ok(items[1].gen, 'replaced by its generator'); assert.ok(items[2].gen);
    assert.equal(st[1].title, 'Triangle questions'); assert.equal(st[1].body, 'Answer each one.'); assert.equal(st[1].minutes, 15);
    assert.match(st[2].body, /Describe the unicorn\./, 'the question is kept when its figure is dropped');
    const set = F.ownWorksheet(boss, st[1].set_id); assert.equal(set.purpose, 'lesson'); assert.equal(set.lesson_id, lid);
    // Every repair is logged: the kind and why, never the topic.
    assert.ok(logs.some(x => x.kind === 'teapot' && /catalog/.test(x.why)));
    assert.ok(logs.some(x => x.kind === 'triangle' && /OF\.check/.test(x.why)));
    assert.ok(logs.some(x => x.kind === 'rectangle' && /answerKey/.test(x.why)));
    assert.ok(logs.some(x => x.kind === 'unicorn'));
    assert.ok(!JSON.stringify(logs).includes('Zanzibar'), 'never the topic');
    // A plain teacher (on no tester list) gets the catalog too.
    seen.length = 0;
    assert.equal((await as(T)('/api/lessons/draft', { body: { schoolId: oak.id, topic: 'Triangles', grade: '7' } })).status, 200);
    assert.match(JSON.stringify(seen[0]), /Figure catalog/);
    // FIGURES=0: no catalog, no figures steps in the schema.
    seen.length = 0;
    await withFlags({ figures: false }, async () => assert.equal((await as(T)('/api/lessons/draft', { body: { schoolId: oak.id, topic: 'Triangles', grade: '7' } })).status, 200));
    assert.doesNotMatch(JSON.stringify(seen[0]), /Figure catalog/);
    assert.ok(!seen[0].output_config.format.schema.properties.steps.items.properties.kind.enum.includes('figures'));
    // A figures step from a draft without the catalog would be dropped too (nothing allowed).
    assert.equal(LA.figureStep({ kind: 'figures', figures: [{ kind: 'triangle', question: 'Q?' }] }, 0, []).kind, 'question');
  } finally { unhook(); }
});

test('Draft with AI: no key or a resting budget gives the template, with a Figure step when the topic names figures', async () => {
  let called = 0;
  // No key, no hook: the template.
  let r = await as(boss)('/api/lessons/draft', { body: { schoolId: oak.id, topic: 'Area of rectangles', grade: '4' } });
  assert.match(r.json.redirect, /drafted=template/);
  let lid = /\/teach\/lessons\/([^?]+)/.exec(r.json.redirect)[1];
  let st = L.steps(lid);
  assert.ok(st.some(s => s.kind === 'figures'), 'a starter Figure step');
  const fs1 = st.find(s => s.kind === 'figures');
  assert.ok(FS.itemsOf(fs1).length >= 1 && FS.itemsOf(fs1).every(it => it.gen && typeof it.value === 'number'));
  // A topic with no figure words: the usual four-step template only.
  r = await as(boss)('/api/lessons/draft', { body: { schoolId: oak.id, topic: 'Kindness', grade: '4' } });
  lid = /\/teach\/lessons\/([^?]+)/.exec(r.json.redirect)[1];
  assert.ok(!L.steps(lid).some(s => s.kind === 'figures'));
  // The budget is resting: the mock is never called (the cap applies as with the real client).
  const daily = config.aiDailyBudgetUsd;
  hookAI(async () => { called++; return reply({}); });
  try {
    config.aiDailyBudgetUsd = 0;
    assert.equal(aiBudget.ok(), false, 'the budget is resting now');
    r = await as(boss)('/api/lessons/draft', { body: { schoolId: oak.id, topic: 'Area of triangles', grade: '6' } });
    assert.match(r.json.redirect, /drafted=template/);
    assert.equal(called, 0);
    const t = await F.draftTest(boss, F.createWorksheet(boss, { purpose: 'test' }).id, { topic: 'Area of triangles', subject: 'math' });
    assert.equal(t.ai, false); assert.ok(t.added > 0); assert.equal(called, 0);
  } finally { unhook(); config.aiDailyBudgetUsd = daily; }
});

test('Build a test: the menu entry, AI on (generators, so each question re-deals), repairs logged, edit, then an explicit Assign', async () => {
  const menu = await as(boss)('/figures');
  assert.match(menu.text, /href="\/figures\/tests\/new"/); assert.match(menu.text, /Build a test/);
  const page = await as(boss)('/figures/tests/new');
  assert.equal(page.status, 200);
  const data = pageData(page.text, 'fg-sheet');
  assert.equal(data.purpose, 'test'); assert.equal(data.untitled, 'Untitled test'); assert.equal(data.lesson, null);
  assert.equal((await as(T)('/figures/tests/new')).status, 200, 'every teacher');
  await withFlags({ figures: false }, async () => assert.equal((await as(T)('/figures/tests/new')).status, 404, 'behind the Figures gate'));
  assert.equal((await as(kid)('/figures/tests/new')).status, 404, 'never a student');
  // "Power with AI" is remembered per teacher (figure_prefs), the same switch as worksheets.
  await as(boss)('/api/figures/prefs', { body: { ai: false } });
  assert.equal(pageData((await as(boss)('/figures/tests/new')).text, 'fg-sheet').ai, false);
  await as(boss)('/api/figures/prefs', { body: { ai: true } });
  assert.equal(pageData((await as(boss)('/figures/tests/new')).text, 'fg-sheet').ai, true);

  const made = await as(boss)('/api/figures/worksheets', { body: { title: '', purpose: 'test' } });
  const id = made.json.worksheet.id;
  assert.equal(F.ownWorksheet(boss, id).purpose, 'test');
  assert.ok(F.listWorksheets(boss).some(x => x.id === id && x.purpose === 'test'));
  const logs = [], seen = [];
  hookAI(async req => {
    seen.push(req);
    return reply({ title: 'Forces test', items: [
      { gen: 'freeBody', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
      { gen: 'inclinedPlane', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
      { gen: 'triangle', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
      { gen: 'warpDrive', kind: '', question: '', data: '', answerType: 'number', answerKey: '', choices: [], correct: 0 },
      { gen: '', kind: 'vectors', question: 'Own vectors', data: '{"nope":true', answerType: 'number', answerKey: 'x', choices: [], correct: 0 },
    ] });
  }, logs);
  let r;
  try {
    r = await as(boss)(`/api/figures/worksheets/${id}/draft-test`, { body: { topic: 'Quokka forces on ramps', grade: '9', subject: 'physics', count: 5 } });
  } finally { unhook(); }
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ai, true); assert.equal(r.json.added, 3); assert.equal(r.json.dropped, 2); assert.equal(r.json.repaired, 1);
  const prompt = seen[0].messages[0].content;
  assert.match(prompt, /Generators:\n- freeBody \(figure freeBody; physics/);
  assert.doesNotMatch(prompt, /- triangle \(figure triangle/, 'only the chosen subject');
  assert.match(prompt, /<topic>\nQuokka forces on ramps\n<\/topic>/);
  assert.ok(logs.some(x => x.kind === 'triangle' && /not in the catalog/.test(x.why)), 'another subject');
  assert.ok(logs.some(x => x.kind === 'warpDrive'));
  assert.ok(logs.some(x => x.kind === 'vectors' && /JSON/.test(x.why)));
  assert.ok(!JSON.stringify(logs).includes('Quokka'));
  let w = F.worksheetView(boss, id);
  assert.equal(w.title, 'Forces test'); assert.equal(w.grade, '9');
  assert.deepEqual(w.items.map(x => x.kind), ['freeBody', 'inclinedPlane', 'vectors']);
  for (const it of w.items) { assert.ok(it.gen && it.seed, 're-dealable'); assert.equal(F.checkFigure(it.kind, it.data).length, 0); assert.ok(F.answerOf(it)); }
  // The teacher edits: re-deal, swap a figure, change numbers, delete a question.
  const [a1, a2, a3] = w.items;
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/items/${a1.id}/regen`, { body: {} })).status, 200);
  assert.notEqual(F.itemsOf(id)[0].seed, a1.seed);
  r = await as(boss)(`/api/figures/worksheets/${id}/items/${a2.id}/swap`, { body: { kind: 'pulley' } });
  assert.equal(r.status, 200); assert.equal(F.itemsOf(id)[1].kind, 'pulley'); assert.equal(F.ownWorksheet(boss, id).subject, 'physics');
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/items/${a2.id}/swap`, { body: { kind: 'nope' } })).status, 400);
  const own = { kind: 'rectangle', data: { AB: 10, BC: 6, unit: 'cm' }, question: 'Area?', answerKey: 'area' };
  assert.ok(F.addItem(boss, id, own).ok);
  const rect = F.itemsOf(id)[3];
  r = await as(boss)(`/api/figures/worksheets/${id}/items/${rect.id}`, { body: { data: { AB: 11, BC: 6, unit: 'cm' } } });
  assert.equal(r.status, 200); assert.equal(F.itemsOf(id)[3].answer, '66 cm²');
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/items/${a3.id}/delete`, { body: {} })).status, 200);
  assert.equal(F.itemsOf(id).length, 3);
  // Nothing is assigned until Assign is pressed.
  assert.equal(q.get("SELECT COUNT(*) n FROM lesson_steps WHERE set_id=?", id).n, 0);
  r = await as(boss)(`/api/figures/worksheets/${id}/assign`, { body: { classId: A.id, opensAt: isoDay(Date.now() - DAY), dueAt: isoDay(Date.now() + 7 * DAY) } });
  assert.equal(r.status, 200, r.text);
  const cl = L.getClassLesson(r.json.classLessonId);
  assert.ok(cl.opens_at && cl.due_at);
  const step = L.steps(r.json.lessonId)[0];
  assert.equal(FS.itemsOf(step).length, 3); assert.equal(L.getLesson(r.json.lessonId).title, 'Forces test');
  // The existing flow: change the dates, reorder, then deleting the lesson removes steps and assignments.
  assert.ok(L.updateAssignment(boss, cl.id, { dueAt: isoDay(Date.now() + 9 * DAY) }).ok);
  assert.ok(L.reorderAssignment(boss, cl.id, -1).ok);
  // The student does it.
  const sp = await as(kid)(`/class/${A.id}/lessons/${cl.id}`);
  assert.equal(sp.status, 200);
  assert.equal((sp.text.match(/class="fs-q"/g) || []).length, 3);
  for (const it of FS.itemsOf(step)) assert.ok(!sp.text.includes(`"${it.answer}"`));
  const ans = FS.itemsOf(step).map(it => String(it.value));
  r = await as(kid)(`/api/progress/${cl.id}/${step.id}/figures`, { body: { answers: ans, handIn: true } });
  assert.equal(r.status, 200, r.text);
  assert.equal(q.get('SELECT score FROM step_progress WHERE step_id=? AND user_id=?', step.id, kid.id).score, 100);
  assert.ok(L.deleteLesson(boss, r.json && step.lesson_id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM class_lessons WHERE lesson_id=?', step.lesson_id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM lesson_steps WHERE lesson_id=?', step.lesson_id).n, 0);
  assert.ok(F.ownWorksheet(boss, id), 'the test itself stays in My worksheets');
});

test('Build a test with AI off (no key): a starter test from the generators, in the subject and grade band; by hand works', async () => {
  const id = F.createWorksheet(boss, { purpose: 'test' }).id;
  const r = await F.draftTest(boss, id, { topic: 'Area of rectangles and triangles', grade: '6', subject: 'math', count: 4 });
  assert.equal(r.ok, true); assert.equal(r.ai, false); assert.equal(r.added, 4);
  const w = F.worksheetView(boss, id);
  assert.equal(w.title, 'Area of rectangles and triangles');
  for (const it of w.items) { assert.equal(F.kindOf(it.kind).subject, 'math'); assert.ok(F.kindOf(it.kind).grades.includes('6-8')); assert.ok(it.gen); }
  assert.equal((await F.draftTest(boss, id, { topic: 'x' })).code, 'topic');
  assert.equal((await F.draftTest(boss, id, { topic: 'Quinn Kid shapes' })).code, 'names', "a student's name never goes to the AI");
  const ws = F.createWorksheet(boss, {}).id;
  assert.equal((await F.draftTest(boss, ws, { topic: 'Area' })).code, 'notFound', 'only a test');
  // By hand: add by kind, then the same edits.
  assert.equal((await as(boss)(`/api/figures/worksheets/${id}/items`, { body: { kind: 'circle' } })).status, 200);
  assert.equal(F.itemsOf(id).length, 5);
  // The browser cannot make a lesson set.
  const mk = await as(boss)('/api/figures/worksheets', { body: { purpose: 'lesson' } });
  assert.equal(F.ownWorksheet(boss, mk.json.worksheet.id).purpose, 'worksheet');
});
