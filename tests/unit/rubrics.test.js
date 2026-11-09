// Rubrics (docs/decisions.md "Rubrics"): the library (make, edit, share, copy, delete, CS Quest starters, AI draft),
// attaching to steps and lessons, scoring on the review page, the gradebook and CSV, the student's own result, and who
// can see or change what (other teachers, other schools, students, kids, grown-ups and guests get 404).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const R = await import('../../server/services/rubrics.js');
const AI = await import('../../server/services/rubric-ai.js');
const { tEn } = await import('../../server/i18n/index.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {}; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};

const boss = createUser({ username: 'RubBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Oak Rubrics' }).school;
const elm = S.createSchool(boss, { name: 'Elm Rubrics' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const head = S.createSchoolAccount(boss, oak.id, { rosterName: 'Hana Head', role: 'admin' }).user;
const eve = S.createSchoolAccount(boss, elm.id, { rosterName: 'Eve Elsewhere', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 6R' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const leo = S.createSchoolAccount(ana, oak.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(ana, cls.id, leo.id);
const kid = createUser({ username: 'RubKid', password: 'secret123' });
const grown = createUser({ username: 'RubParent', password: 'secret123', accountType: 'grownup' });
const guest = createGuest();

const levels = [{ label: 'Beginning', points: 1 }, { label: 'Developing', points: 2 }, { label: 'Secure', points: 3 }, { label: 'Excellent', points: 4 }];
const criteria = [{ name: 'Ideas', descs: ['few', 'some', 'clear', 'rich'] }, { name: 'Reasons', descs: ['none', 'one', 'two', 'many'] }];

test('cleanRubric: a title, 2-6 levels with names and 0-100 points, 1-12 named criteria; descriptors one per level', () => {
  assert.equal(R.cleanRubric({ title: '', levels, criteria }).code, 'rubricTitle');
  assert.equal(R.cleanRubric({ title: 'x', levels: levels.slice(0, 1), criteria }).code, 'rubricLevels');
  assert.equal(R.cleanRubric({ title: 'x', levels: [...levels, ...levels], criteria }).code, 'rubricLevels');
  assert.equal(R.cleanRubric({ title: 'x', levels, criteria: [] }).code, 'rubricCriteria');
  assert.equal(R.cleanRubric({ title: 'x', levels: [{ label: '', points: 1 }, levels[1]], criteria }).code, 'rubricLabel');
  assert.equal(R.cleanRubric({ title: 'x', levels: [{ label: 'a', points: 101 }, levels[1]], criteria }).code, 'rubricPoints');
  assert.equal(R.cleanRubric({ title: 'x', levels: [{ label: 'a', points: 'two' }, levels[1]], criteria }).code, 'rubricPoints');
  assert.equal(R.cleanRubric({ title: 'x', levels, criteria: [{ name: ' ' }] }).code, 'rubricName');
  const c = R.cleanRubric({ title: ' Essay ', levels, criteria: [{ name: 'Ideas', descs: ['a', 'b', 'c', 'd', 'extra'] }, { name: 'Care' }] });
  assert.ok(c.ok); assert.equal(c.v.title, 'Essay');
  assert.deepEqual(c.v.criteria[0].descs, ['a', 'b', 'c', 'd']); assert.deepEqual(c.v.criteria[1].descs, ['', '', '', '']);
  assert.equal(R.maxPoints({ ...c.v }), 8);
});

let rub;
test('the library: staff make rubrics; colleagues see them only when shared; nobody else at all', async () => {
  for (const u of [mia, kid, grown, guest, eve]) assert.equal(R.createRubric(u, oak.id, { title: 'No', levels, criteria }).code, 'notFound');
  rub = R.createRubric(ana, oak.id, { title: 'Persuasive paragraph', levels, criteria }).rubric;
  assert.ok(R.canEditRubric(ana, rub) && R.canEditRubric(head, rub), 'the owner and school admins');
  assert.ok(!R.canSeeRubric(ben, rub), 'not shared yet');
  assert.equal(R.updateRubric(ana, rub.id, { shared: true }).ok, true);
  rub = R.getRubric(rub.id);
  assert.ok(R.canSeeRubric(ben, rub) && !R.canEditRubric(ben, rub), 'shared: colleagues see, never edit');
  assert.ok(!R.canSeeRubric(eve, rub) && !R.canSeeRubric(mia, rub) && !R.canSeeRubric(kid, rub), 'another school, students, kids');
  assert.equal(R.updateRubric(ben, rub.id, { title: 'Mine now' }).code, 'notFound');
  // Pages and APIs
  assert.equal((await as(ana)(`/teach/rubrics?school=${oak.id}`)).status, 200);
  assert.ok((await as(ana)(`/teach/rubrics?school=${oak.id}`)).text.includes(`href="/teach/rubrics/${rub.id}"`));
  assert.match((await as(ben)(`/teach/rubrics?school=${oak.id}&tab=shared`)).text, /Persuasive paragraph/);
  assert.equal((await as(ben)(`/teach/rubrics/${rub.id}`)).status, 200, 'a colleague can open a shared rubric');
  assert.doesNotMatch((await as(ben)(`/teach/rubrics/${rub.id}`)).text, /name="cr-0-name"/, 'read-only for them');
  for (const u of [mia, kid, grown, guest, eve]) {
    if (u !== eve) assert.equal((await as(u)('/teach/rubrics')).status, 404, `library: ${u.username}`);
    assert.equal((await as(u)(`/teach/rubrics/${rub.id}`)).status, 404, `rubric: ${u.username}`);
    assert.equal((await as(u)(`/teach/rubrics/${rub.id}/print`)).status, 404, `print: ${u.username}`);
    assert.equal((await as(u)(`/api/rubrics/${rub.id}`, { method: 'POST', body: { title: 'Hacked' } })).status, 404);
    assert.equal((await as(u)(`/api/rubrics/${rub.id}/copy`, { method: 'POST', body: {} })).status, 404);
    assert.equal((await as(u)(`/api/rubrics/${rub.id}/delete`, { method: 'POST', body: { detach: '1' } })).status, 404);
    assert.equal((await as(u)('/api/rubrics', { method: 'POST', body: { schoolId: oak.id, title: 'X' } })).status, 404);
    assert.equal((await as(u)('/api/rubrics/draft', { method: 'POST', body: { schoolId: oak.id, task: 'X' } })).status, 404);
    assert.equal((await as(u)('/api/rubrics/import', { method: 'POST', body: { schoolId: oak.id, key: 'csq-1b-1.1' } })).status, 404);
  }
  assert.equal((await as(null)('/teach/rubrics')).status, 302, 'signed out: sign in first');
  const elmLib = await as(eve)(`/teach/rubrics?school=${oak.id}`);
  assert.equal(elmLib.status, 200, 'another school\'s teacher gets their own library');
  assert.ok(!elmLib.text.includes(rub.id), 'never this school\'s rubrics');
  assert.equal((await as(ben)(`/api/rubrics/${rub.id}`, { method: 'POST', body: { title: 'Hacked' } })).status, 404, 'a colleague cannot edit');
  assert.equal((await as(ben)(`/api/rubrics/${rub.id}/delete`, { method: 'POST', body: { detach: '1' } })).status, 404);
  assert.equal(R.getRubric(rub.id).title, 'Persuasive paragraph');
});

test('the editor saves the form, its row buttons add / remove / move rows, and the version goes up', async () => {
  const api = as(ana);
  const r0 = R.getRubric(rub.id);
  let r = await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { title: 'Persuasive paragraph', 'lv-0-label': 'Start', 'lv-0-points': '1', 'lv-1-label': 'Grow', 'lv-1-points': '2', 'lv-2-label': 'Got it', 'lv-2-points': '3', 'lv-3-label': 'Wow', 'lv-3-points': '4',
    'cr-0-name': 'Ideas', 'cr-0-d-0': 'few', 'cr-1-name': 'Reasons' } });
  assert.equal(r.status, 200);
  let now = R.getRubric(rub.id);
  assert.equal(now.levels[0].label, 'Start'); assert.equal(now.criteria[0].descs[1], ''); assert.equal(now.version, r0.version + 1);
  r = await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { title: 'Persuasive paragraph', 'lv-0-label': 'Start', 'lv-0-points': '1', 'lv-1-label': 'Grow', 'lv-1-points': '2', 'lv-2-label': 'Got it', 'lv-2-points': '3', 'lv-3-label': 'Wow', 'lv-3-points': '4', 'cr-0-name': 'Ideas', 'cr-1-name': 'Reasons', op: 'addCriterion' } });
  assert.match(r.json.redirect, /#crit-2$/);
  assert.equal(R.getRubric(rub.id).criteria.length, 3);
  await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { op: 'up:2' } });
  assert.equal(R.getRubric(rub.id).criteria[1].name, 'Criterion 3');
  await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { op: 'dropCriterion:1' } });
  await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { op: 'addLevel' } });
  now = R.getRubric(rub.id);
  assert.equal(now.criteria.length, 2); assert.equal(now.levels.length, 5); assert.equal(now.levels[4].points, 5);
  await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { op: 'dropLevel:4' } });
  assert.equal(R.getRubric(rub.id).levels.length, 4);
  r = await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { 'lv-0-label': 'Start', 'lv-0-points': '', 'lv-1-label': 'Grow', 'lv-1-points': '2', 'cr-0-name': 'Ideas' } });
  assert.equal(r.status, 400); assert.equal(r.json.field, 'lv-0-points');
  r = await api(`/api/rubrics/${rub.id}`, { method: 'POST', body: { 'lv-0-label': 'Start', 'lv-0-points': '1', 'lv-1-label': 'Grow', 'lv-1-points': '2', 'cr-0-name': '' } });
  assert.equal(r.json.field, 'cr-0-name');
  // Put it back as the tests below expect
  assert.ok(R.updateRubric(ana, rub.id, { levels, criteria }).ok);
  const page = await api(`/teach/rubrics/${rub.id}`);
  assert.match(page.text, /name="cr-1-d-3"/); assert.match(page.text, /href="\/teach\/rubrics\/[^"]+\/print"/);
  const print = await api(`/teach/rubrics/${rub.id}/print`);
  assert.equal(print.status, 200); assert.match(print.text, /rb-grid/); assert.match(print.text, /class="[^"]*printpage/);
});

test('copy (own or shared), CS Quest starters and the AI draft (which only gets the teacher\'s words)', async () => {
  const mine = await as(ana)(`/api/rubrics/${rub.id}/copy`, { method: 'POST', body: {} });
  assert.match(mine.json.redirect, /\/teach\/rubrics\/\w+\?copied=1/);
  const copy = R.rubricsOf(ana.id, oak.id).find(r => r.source === `copy:${rub.id}`);
  assert.equal(copy.title, 'Persuasive paragraph (copy)');
  const theirs = await as(ben)(`/api/rubrics/${rub.id}/copy`, { method: 'POST', body: {} });
  assert.equal(theirs.status, 200);
  assert.equal(R.rubricsOf(ben.id, oak.id)[0].title, 'Persuasive paragraph', 'a colleague\'s copy keeps the title');
  R.deleteRubric(ana, copy.id);
  // Starters
  assert.ok(R.starters().length >= 40 && R.starters().every(s => s.lines > 0));
  const imp = await as(ana)('/api/rubrics/import', { method: 'POST', body: { schoolId: oak.id, key: 'csq-1b-1.1' } });
  assert.equal(imp.status, 200);
  const st = R.rubricsOf(ana.id, oak.id).find(r => r.source === 'csq:csq-1b-1.1');
  assert.deepEqual(st.levels.map(l => l.points), [0, 1, 2, 3]);
  assert.ok(st.criteria.length >= 2 && st.criteria.every(c => c.descs.length === 4 && c.descs[3]));
  assert.equal((await as(ana)('/api/rubrics/import', { method: 'POST', body: { schoolId: oak.id, key: 'nope' } })).status, 404);
  assert.equal((await as(eve)('/api/rubrics/import', { method: 'POST', body: { schoolId: oak.id, key: 'csq-1b-1.1' } })).status, 404, 'another school\'s teacher');
  // AI: no key -> the template draft
  let r = await as(ana)('/api/rubrics/draft', { method: 'POST', body: { schoolId: oak.id, task: 'Explain why your game is fair', levels: '3' } });
  assert.match(r.json.redirect, /drafted=template/);
  const tpl = R.getRubric(r.json.redirect.match(/rubrics\/(\w+)/)[1]);
  assert.equal(tpl.levels.length, 3); assert.equal(tpl.criteria.length, 3);
  // A fake client: what was sent, and the draft is cleaned
  const sent = [];
  AI._hooks.client = { messages: { create: async (req) => { sent.push(req); return { content: [{ type: 'text', text: JSON.stringify({ title: 'Fair games', levels: [{ label: 'Low', points: 1 }, { label: 'High', points: 2 }], criteria: [{ name: 'Fairness', descs: ['unfair', 'fair'] }] }) }], usage: {} }; } } };
  try {
    r = await as(ana)('/api/rubrics/draft', { method: 'POST', body: { schoolId: oak.id, task: 'Explain why your game is fair', grade: '5' } });
    assert.match(r.json.redirect, /drafted=ai/);
    const ai = R.getRubric(r.json.redirect.match(/rubrics\/(\w+)/)[1]);
    assert.equal(ai.title, 'Fair games'); assert.equal(ai.source, 'ai'); assert.deepEqual(ai.criteria[0].descs, ['unfair', 'fair']);
    const words = JSON.stringify(sent[0].messages);
    assert.match(words, /Explain why your game is fair/);
    for (const name of ['Mia', 'Leo', 'Pupil', 'Ana Teacher']) assert.ok(!words.includes(name), `no ${name} in what the AI gets`);
  } finally { AI._hooks.client = null; }
  assert.equal((await as(ana)('/api/rubrics/draft', { method: 'POST', body: { schoolId: oak.id, task: '' } })).json.field, 'task');
});

let lesson, ask, build, read, cl;
test('attaching: own rubrics on question / build steps and on the whole lesson; never a colleague\'s or another school\'s', () => {
  lesson = L.createLesson(ana, oak.id, { title: 'Fair play' }).lesson;
  read = L.addStep(ana, lesson.id, { kind: 'text', body: 'Read', rubricId: rub.id }).step;
  assert.equal(L.getStep(read.id).rubric_id, null, 'a read step never keeps a rubric');
  ask = L.addStep(ana, lesson.id, { kind: 'question', body: 'Why is it fair?', rubricId: rub.id }).step;
  assert.equal(L.getStep(ask.id).rubric_id, rub.id);
  build = L.addStep(ana, lesson.id, { kind: 'build', body: 'a fair game', rubricId: rub.id }).step;
  assert.ok(L.updateLesson(ana, lesson.id, { rubricId: rub.id }).ok);
  const bens = R.rubricsOf(ben.id, oak.id)[0];
  assert.equal(L.addStep(ana, lesson.id, { kind: 'question', body: 'x', rubricId: bens.id }).code, 'rubricPick', 'a colleague\'s rubric: copy it first');
  const elmRub = R.createRubric(eve, elm.id, { title: 'Elm', levels, criteria }).rubric;
  assert.equal(L.updateLesson(ana, lesson.id, { rubricId: elmRub.id }).code, 'rubricPick');
  assert.ok(L.updateStep(ana, ask.id, { body: 'Why is it fair? Explain.' }).ok, 'leaving the rubric out keeps it');
  assert.equal(L.getStep(ask.id).rubric_id, rub.id);
  assert.ok(L.updateStep(head, ask.id, { body: 'Why is it fair? Explain.' }).ok, 'a school admin may edit a step with someone else\'s rubric on it');
  cl = L.assign(ana, cls.id, lesson.id, {}).classLesson;
  assert.ok(R.usage(rub.id).length === 1 && R.usage(rub.id)[0].whole && R.usage(rub.id)[0].steps === 2);
});

test('the editor shows the Rubric select and the step\'s rubric; the lesson page lists the whole-lesson rubric', async () => {
  const page = await as(ana)(`/teach/lessons/${lesson.id}`);
  assert.match(page.text, /name="rubricId"/);
  assert.match(page.text, /data-for-kinds="question build"/);
  assert.match(page.text, /class="sc-rubric"/);
  assert.match(page.text, /id="lesson-rubric"|Whole-lesson rubric/);
  assert.equal((await as(ana)(`/api/lesson-steps/${ask.id}`, { method: 'POST', body: { kind: 'question', body: 'Why?', rubricId: R.rubricsOf(ben.id, oak.id)[0].id } })).json.field, 'rubricId');
});

test('scoring: tap a level per criterion on the review page; the class\'s teachers only, students of the class only', async () => {
  assert.ok(P.answer(mia, cl.id, ask.id, 'Everyone gets the same number of turns.').ok);
  assert.ok(P.answer(leo, cl.id, ask.id, 'It is fair.').ok);
  const page = await as(ana)(`/class/${cls.id}/progress/${cl.id}`);
  assert.match(page.text, /name="lvl-0"/); assert.match(page.text, /name="cmt-1"/);
  assert.match(page.text, /id="lesson-rubric"/);
  const path = `/api/progress/${cl.id}/${ask.id}/${mia.id}/review`;
  for (const u of [ben, eve, mia, leo, kid, guest]) assert.equal((await as(u)(path, { method: 'POST', body: { feedback: 'x', 'lvl-0': '1' } })).status, 404, u.username);
  assert.equal((await as(ana)(path, { method: 'POST', body: { feedback: 'x', 'lvl-0': '9' } })).json.code, 'badScore');
  assert.equal(P.get(cl.id, ask.id, mia.id).reviewed_at, null, 'a bad score saves nothing');
  let r = await as(ana)(path, { method: 'POST', body: { feedback: 'Good reasons!', 'lvl-0': '2', 'lvl-1': '3', 'cmt-0': 'Clear idea', 'cmt-1': '' } });
  assert.equal(r.status, 200); assert.equal(r.json.points, 7);
  const sc = R.getScore(cl.id, ask.id, mia.id);
  assert.deepEqual(sc.picks, [2, 3]); assert.equal(sc.max_points, 8); assert.equal(sc.comments[0], 'Clear idea'); assert.equal(sc.snapshot.title, 'Persuasive paragraph');
  assert.ok(P.get(cl.id, ask.id, mia.id).reviewed_at, '"Save and mark reviewed"');
  // a level left out keeps what it had; '-' clears it
  await as(ana)(path, { method: 'POST', body: { feedback: 'Good reasons!', 'lvl-1': '-' } });
  assert.deepEqual(R.getScore(cl.id, ask.id, mia.id).picks, [2, null]);
  await as(ana)(path, { method: 'POST', body: { feedback: 'Good reasons!', 'lvl-1': '3' } });
  // a school admin may score too; a student who is not in the class may not be scored
  assert.equal((await as(head)(`/api/progress/${cl.id}/${ask.id}/${leo.id}/review`, { method: 'POST', body: { feedback: 'ok', 'lvl-0': '0', 'lvl-1': '0' } })).status, 200);
  assert.equal(R.saveScore(ana, cl.id, ask.id, ben.id, { picks: [1, 1] }).code, 'notFound');
  assert.equal(R.saveScore(ana, cl.id, read.id, mia.id, { picks: [1, 1] }).code, 'notFound', 'a read step has no rubric');
  // whole lesson
  const lp = `/api/rubric-scores/${cl.id}/${mia.id}`;
  for (const u of [ben, eve, mia, kid, guest]) assert.equal((await as(u)(lp, { method: 'POST', body: { 'lvl-0': '1' } })).status, 404, u.username);
  r = await as(ana)(lp, { method: 'POST', body: { 'lvl-0': '3', 'lvl-1': '3', feedback: 'A great lesson, Mia.' } });
  assert.equal(r.json.points, 8);
  assert.equal(R.getScore(cl.id, '', mia.id).feedback, 'A great lesson, Mia.');
});

test('the gradebook and the CSV carry points and percent per lesson and in total', async () => {
  const gb = P.classProgress(cls.id);
  const i = gb.lessons.findIndex(l => l.id === cl.id);
  const miaRow = gb.students.find(p => p.id === mia.id);
  assert.equal(miaRow.cells[i].points, 15); assert.equal(miaRow.cells[i].maxPoints, 16);
  assert.deepEqual(miaRow.rubric, { points: 15, max: 16, pct: 94 });
  assert.ok(gb.anyRubric);
  const page = await as(ana)(`/class/${cls.id}/progress`);
  assert.match(page.text, /📏 15\/16/);
  const csv = await as(ana)(`/class/${cls.id}/progress.csv`);
  const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.match(lines[0], /Fair play \(rubric points\),Fair play \(rubric %\)/);
  assert.match(lines[0], /Rubric points,Rubric %$/);
  const row = lines.find(l => l.startsWith('Mia Pupil'));
  assert.match(row, /,15\/16,94%,/); assert.match(row, /,15\/16,94%$/);
  for (const u of [ben, mia, kid, guest]) assert.equal((await as(u)(`/class/${cls.id}/progress.csv`)).status, 404, u.username);
});

test('students see their own rubric result and feedback ("From your teacher"), never a classmate\'s', async () => {
  const mine = await as(mia)(`/class/${cls.id}/lessons/${cl.id}`);
  assert.match(mine.text, /From your teacher/);
  assert.match(mine.text, /Clear idea/); assert.match(mine.text, /7\/8 points/);
  assert.match(mine.text, /A great lesson, Mia\./); assert.match(mine.text, /id="from-teacher"/);
  const his = await as(leo)(`/class/${cls.id}/lessons/${cl.id}`);
  assert.doesNotMatch(his.text, /Clear idea|A great lesson, Mia|15\/16/);
  assert.match(his.text, /2\/8 points/, 'Leo sees his own score');
  assert.doesNotMatch(his.text, /id="from-teacher"/, 'Leo has no whole-lesson score');
  for (const u of [kid, guest, eve]) assert.equal((await as(u)(`/class/${cls.id}/lessons/${cl.id}`)).status, 404);
});

test('editing or deleting a rubric never changes a result; delete is refused while in use unless detached', async () => {
  assert.ok(R.updateRubric(ana, rub.id, { levels: [{ label: 'No', points: 0 }, { label: 'Yes', points: 10 }], criteria: [{ name: 'One' }] }).ok);
  const sc = R.getScore(cl.id, ask.id, mia.id);
  assert.equal(sc.points, 7); assert.equal(sc.snapshot.criteria[0].name, 'Ideas');
  const page = await as(ana)(`/class/${cls.id}/progress/${cl.id}`);
  assert.match(page.text, /The rubric has changed since this was scored/);
  let r = await as(ana)(`/api/rubrics/${rub.id}/delete`, { method: 'POST', body: {} });
  assert.equal(r.status, 409); assert.equal(r.json.code, 'inUse');
  assert.ok(R.getRubric(rub.id));
  r = await as(ana)(`/api/rubrics/${rub.id}/delete`, { method: 'POST', body: { detach: '1' } });
  assert.equal(r.status, 200);
  assert.equal(R.getRubric(rub.id), null);
  assert.equal(L.getStep(ask.id).rubric_id, null); assert.equal(L.getLesson(lesson.id).rubric_id, null);
  assert.equal(R.getScore(cl.id, ask.id, mia.id).points, 7, 'the score stays');
  assert.match((await as(mia)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Clear idea/, 'and the student still sees it');
});

test('copying a lesson copies a colleague\'s rubric; deleting a step or lesson takes its scores with it', () => {
  const shared = R.createRubric(ben, oak.id, { title: 'Ben rubric', levels, criteria, shared: true }).rubric;
  const bl = L.createLesson(ben, oak.id, { title: 'Ben lesson' }).lesson;
  L.addStep(ben, bl.id, { kind: 'question', body: 'Q?', rubricId: shared.id });
  L.updateLesson(ben, bl.id, { rubricId: shared.id, shared: true });
  const copy = L.copyLesson(ana, bl.id).lesson;
  const st = L.steps(copy.id)[0];
  assert.ok(st.rubric_id && st.rubric_id !== shared.id, 'a copy of the rubric');
  assert.equal(R.getRubric(st.rubric_id).owner_id, ana.id);
  assert.equal(L.getLesson(copy.id).rubric_id, st.rubric_id, 'the same copy for the lesson and its step');
  const own = L.copyLesson(ana, copy.id).lesson;
  assert.equal(L.steps(own.id)[0].rubric_id, st.rubric_id, 'her own rubric stays attached');
  // deletion
  const r2 = R.createRubric(ana, oak.id, { title: 'Temp', levels, criteria }).rubric;
  const l2 = L.createLesson(ana, oak.id, { title: 'Temp lesson' }).lesson;
  const s2 = L.addStep(ana, l2.id, { kind: 'question', body: 'Q?', rubricId: r2.id }).step;
  const c2 = L.assign(ana, cls.id, l2.id, {}).classLesson;
  P.answer(mia, c2.id, s2.id, 'A');
  assert.ok(R.saveScore(ana, c2.id, s2.id, mia.id, { picks: [1, 1] }).ok);
  L.deleteStep(ana, s2.id);
  assert.equal(R.getScore(c2.id, s2.id, mia.id), null);
  L.updateLesson(ana, l2.id, { rubricId: r2.id });
  assert.ok(R.saveScore(ana, c2.id, '', mia.id, { picks: [1, 1] }).ok);
  L.deleteLesson(ana, l2.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM rubric_scores WHERE class_lesson_id=?', c2.id).n, 0);
});

test('template draft: levels and criteria in the teacher\'s language', () => {
  const d = AI.templateRubric({ task: 'Robots', levels: 5 }, tEn);
  assert.equal(d.levels.length, 5); assert.equal(d.criteria.length, 3);
  assert.ok(d.criteria.every(c => c.descs.length === 5 && c.descs.every(Boolean)));
  assert.ok(R.cleanRubric(d).ok);
});
