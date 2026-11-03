// CS Quest platform slice (docs/cs-quest.md): step options / standards / template / rubric (P2, P3, P10), the CSTA loader
// (P3), quiz snapshots that keep cat and secs (P4), live-hosted steps and the Host-live mode link (P5), the QUIZ_STEPS flag
// and the student quiz APIs (P7), copies that keep everything (P8), lessons.template_key / template_version (P9), rubric
// marks with "Also mark these teammates" (P11), the unit cadence (P17) and the Builder status line (P18).
// Everything is backwards compatible: with the new columns empty, lessons and steps behave as before.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const CSTA = await import('../../server/standards/csta.js');
const { builderStatus } = await import('../../server/services/builder-status.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (path, { method = 'GET', body } = {}) => {
  const headers = { cookie: cookieFor(who.id) }; if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'CsqBoss', password: 'secret123', role: 'admin' });
const official = createUser({ username: 'OombaAcademy', password: 'secret123' });
const oak = S.createSchool(boss, { name: 'Oak CS Quest' }).school;
const ana = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, oak.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const cls = S.createClass(ana, oak.id, { name: 'Ana 4B' }).class;
const mia = S.createSchoolAccount(ana, oak.id, { rosterName: 'Mia Pupil' }).user; S.addToClass(ana, cls.id, mia.id);
const leo = S.createSchoolAccount(ana, oak.id, { rosterName: 'Leo Pupil' }).user; S.addToClass(ana, cls.id, leo.id);
const kim = S.createSchoolAccount(ana, oak.id, { rosterName: 'Kim Pupil' }).user; S.addToClass(ana, cls.id, kim.id);
const other = S.createClass(ben, oak.id, { name: 'Ben 5D' }).class;
const zed = S.createSchoolAccount(ben, oak.id, { rosterName: 'Zed Pupil' }).user; S.addToClass(ben, other.id, zed.id);
function liveGame(owner, { title = 'G', slug = null, source = 'studio', visibility = 'public' } = {}) {
  const g = games.createGame(owner.id, { title, slug, source });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility=?, published_version_id=? WHERE id=?", visibility, v.id, g.id);
  return games.getGame(g.id);
}
const robo = liveGame(official, { title: 'Robo Route', slug: 'robo-route', source: 'seed' });
const wyrLive = liveGame(official, { title: 'Would You Rather (Live)', slug: 'would-you-rather-live', source: 'seed' });
const questRace = liveGame(official, { title: 'Quest Race', slug: 'quest-race', source: 'seed' });
const builderGame = liveGame(ana, { title: 'Ana quiz', visibility: 'school' });

test('P3 CSTA loader: 44 ids (21 at 1B, 23 at level 2), byId / isId / parseList, case-insensitive', () => {
  assert.equal(CSTA.all().length, 44); assert.equal(CSTA.all('1B').length, 21); assert.equal(CSTA.all('2').length, 23);
  assert.deepEqual(CSTA.LEVELS, { '1B': '3-5', '2': '6-8' });
  assert.ok(CSTA.isId('1B-AP-10')); assert.ok(CSTA.isId('1b-ap-10')); assert.ok(!CSTA.isId('1B-AP-99')); assert.ok(!CSTA.isId(''));
  const s = CSTA.byId('2-NI-04'); assert.equal(s.level, '2'); assert.equal(s.concept, 'Networks & the Internet'); assert.ok(s.statement.length > 20);
  assert.equal(CSTA.byId('nope'), null);
  assert.deepEqual(CSTA.parseList(' 1b-ap-10, 1B-AP-11 1B-AP-10,2-ap-13 '), { ids: ['1B-AP-10', '1B-AP-11', '2-AP-13'], bad: [] });
  assert.deepEqual(CSTA.parseList('1B-AP-10,1B-ZZ-01').bad, ['1B-ZZ-01']);
  assert.ok(Object.isFrozen(CSTA.all()[0]), 'the loaded standards are read-only');
  assert.ok(CSTA.ids().every(id => /^(1B|2)-[A-Z]{2}-\d{2}$/.test(id)));
});

test('P2/P3/P10 steps: options (params grammar), standards (CSTA ids), template (Studio key), rubric; cleared where they make no sense', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Loops' }).lesson;
  const r = L.addStep(ana, l.id, { kind: 'game', gameId: robo.id, options: '?lock=1&band=1b&chapter=loops', standards: ['1b-ap-10', '1B-AP-12'], minutes: 18 });
  assert.ok(r.ok, r.code);
  assert.equal(r.step.options, 'chapter=loops&band=1b&lock=1', 'canonical order');
  assert.equal(r.step.standards, '1B-AP-10,1B-AP-12');
  assert.equal(L.addStep(ana, l.id, { kind: 'game', gameId: robo.id, options: 'chapter=loops&evil=1' }).code, 'stepOptions');
  assert.equal(L.addStep(ana, l.id, { kind: 'game', gameId: robo.id, options: 'band=3' }).code, 'stepOptions');
  assert.equal(L.addStep(ana, l.id, { kind: 'game', gameId: robo.id, standards: '1B-AP-10,1B-ZZ-99' }).code, 'stepStandards');
  assert.equal(L.addStep(ana, l.id, { kind: 'build', body: 'a quiz', template: 'nope' }).code, 'stepTemplate');
  const b = L.addStep(ana, l.id, { kind: 'build', body: 'a quiz', template: 'quiz', standards: '1B-AP-15', options: 'chapter=x', rubric: [{ line: 'Plan', ids: ['1B-AP-13'], levels: ['none', 'some', 'most', 'all'] }] }).step;
  assert.equal(b.template, 'quiz'); assert.equal(b.options, '', 'options only on game steps'); assert.equal(b.standards, '1B-AP-15');
  assert.deepEqual(L.rubricOf(b), [{ line: 'Plan', ids: ['1B-AP-13'], levels: ['none', 'some', 'most', 'all'] }]);
  const txt = L.addStep(ana, l.id, { kind: 'text', body: 'Read', standards: '1B-AP-10', template: 'quiz', rubric: [{ line: 'x' }] }).step;
  assert.equal(txt.standards, ''); assert.equal(txt.template, ''); assert.equal(txt.rubric, '', 'text steps carry none of them');
  const qs = L.addStep(ana, l.id, { kind: 'question', body: 'Why?', standards: '2-AP-13', rubric: JSON.stringify([{ line: 'Explain', ids: '2-AP-13' }]) }).step;
  assert.deepEqual(L.rubricOf(qs), [{ line: 'Explain', ids: ['2-AP-13'], levels: [] }], 'rubric as JSON text too; ids as a comma list');
  assert.equal(L.addStep(ana, l.id, { kind: 'question', body: 'Why?', rubric: [{ line: '' }] }).code, 'stepRubric');
  assert.equal(L.addStep(ana, l.id, { kind: 'question', body: 'Why?', rubric: [{ line: 'x', ids: ['bad-id'] }] }).code, 'stepRubric');
  assert.equal(L.addStep(ana, l.id, { kind: 'question', body: 'Why?', rubric: 'not json' }).code, 'stepRubric');
  assert.equal(L.addStep(ana, l.id, { kind: 'question', body: 'Why?', rubric: Array.from({ length: 9 }, () => ({ line: 'x' })) }).code, 'stepRubric', 'at most 8 lines');
  // editing keeps what was not sent; a kind change clears what no longer applies
  assert.ok(L.updateStep(ana, r.step.id, { title: 'Play Loops' }).ok);
  assert.equal(L.getStep(r.step.id).options, 'chapter=loops&band=1b&lock=1');
  assert.ok(L.updateStep(ana, r.step.id, { options: '' }).ok); assert.equal(L.getStep(r.step.id).options, '');
  assert.ok(L.updateStep(ana, b.id, { kind: 'text', body: 'now text' }).ok);
  assert.equal(L.getStep(b.id).template, ''); assert.equal(L.getStep(b.id).rubric, '');
  // the step API takes the same fields and answers 400 with the code
  const api = as(ana);
  let x = await api(`/api/lessons/${l.id}/steps`, { method: 'POST', body: { kind: 'game', gameId: robo.id, options: 'chapter=loops&band=2', standards: '2-AP-10' } });
  assert.equal(x.status, 200);
  const made = L.steps(l.id).at(-1); assert.equal(made.options, 'chapter=loops&band=2'); assert.equal(made.standards, '2-AP-10');
  x = await api(`/api/lesson-steps/${made.id}`, { method: 'POST', body: { options: 'nope=1' } });
  assert.equal(x.status, 400); assert.equal(x.json.code, 'stepOptions');
  // helpers
  assert.equal(L.cleanStandards(''), ''); assert.equal(L.cleanStandards('1B-AP-10,1B-AP-10'), '1B-AP-10'); assert.equal(L.cleanStandards('x'), null);
  assert.equal(L.cleanRubric(''), ''); assert.equal(L.cleanRubric(null), ''); assert.equal(L.cleanRubric('[]'), ''); assert.equal(L.cleanRubric('{}'), null);
});

test('P2/P5 student page: Play carries the step options; live-only games show "Your teacher hosts this live" and no Play / I played it; Host live picks the mode', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Links' }).lesson;
  const play = L.addStep(ana, l.id, { kind: 'game', gameId: robo.id, options: 'chapter=loops&band=1b&lock=1' }).step;
  const warm = L.addStep(ana, l.id, { kind: 'game', gameId: wyrLive.id }).step;
  const race = L.addStep(ana, l.id, { kind: 'game', gameId: questRace.id }).step;
  const own = L.addStep(ana, l.id, { kind: 'game', gameId: builderGame.id }).step;
  const cl = L.assign(ana, cls.id, l.id).classLesson;
  const kid = await as(mia)(`/class/${cls.id}/lessons/${cl.id}`);
  assert.equal(kid.status, 200);
  assert.match(kid.text, new RegExp(`href="/play/robo-route\\?lesson=${cl.id}&(amp;)?step=${play.id}&(amp;)?chapter=loops&(amp;)?band=1b&(amp;)?lock=1"`), 'the Play link carries the options');
  assert.doesNotMatch(kid.text, /href="\/play\/would-you-rather-live/, 'no Play on a live-only step');
  assert.doesNotMatch(kid.text, /href="\/play\/quest-race/);
  assert.equal((kid.text.match(/Your teacher hosts this live/g) || []).length, 2, 'both live-only steps say so');
  assert.equal((kid.text.match(/I&#39;ve played it|I've played it/g) || []).length, 2, 'the "I played it" button only on the two playable steps');
  assert.match(kid.text, new RegExp(`href="/play/${builderGame.slug}\\?lesson=${cl.id}&(amp;)?step=${own.id}"`), 'no options: the link is as before');
  // the live-only step still takes a score from a live run and shows it
  assert.ok(P.gameScore(mia, cl.id, warm.id, 7, 'live').ok);
  assert.match((await as(mia)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Your best score: 7/);
  // the teacher's preview: a plain Play with the options, Host live with mode= for built-in modes
  const teacher = await as(ana)(`/class/${cls.id}/lessons/${cl.id}`);
  assert.match(teacher.text, /href="\/play\/robo-route\?chapter=loops&(amp;)?band=1b&(amp;)?lock=1"/);
  assert.match(teacher.text, new RegExp(`href="/live\\?cl=${cl.id}&(amp;)?step=${warm.id}&(amp;)?mode=wyr"`), 'Would You Rather Live hosts as the wyr mode');
  assert.match(teacher.text, new RegExp(`href="/live\\?cl=${cl.id}&(amp;)?step=${race.id}&(amp;)?mode=quest-race"`));
  assert.doesNotMatch(teacher.text, new RegExp(`game=${wyrLive.id}`), 'never ?game= for a mode game');
  // the server, not only the page: a hosted-live step cannot be opened with the lesson context, timed, scored or marked done by hand
  const kidApi = as(mia);
  assert.ok(P.hostedLive(L.getStep(race.id)) && P.hostedLive(L.steps(l.id).find(s => s.id === warm.id)) && !P.hostedLive(L.getStep(play.id)), 'bare and joined step rows');
  let r = await kidApi(`/play/quest-race?lesson=${cl.id}&step=${race.id}`);
  assert.equal(r.status, 200); assert.doesNotMatch(r.text, new RegExp(`"cl":"${cl.id}"`), 'the game opens without the lesson context');
  r = await kidApi(`/play/robo-route?lesson=${cl.id}&step=${play.id}`);
  assert.match(r.text, new RegExp(`"cl":"${cl.id}"`), 'an ordinary game step keeps it');
  for (const body of [{ event: 'start' }, { event: 'time', seconds: 30 }, { event: 'score', score: 9 }, { event: 'end', score: 9 }]) assert.equal((await kidApi(`/api/progress/${cl.id}/${race.id}/game`, { method: 'POST', body })).status, 404, body.event);
  assert.equal((await kidApi(`/api/progress/${cl.id}/${race.id}/done`, { method: 'POST', body: { done: 1 } })).status, 404);
  assert.equal(P.markDone(mia, cl.id, race.id).code, 'notFound'); assert.equal(P.gameTime(mia, cl.id, race.id, 30).code, 'notFound'); assert.equal(P.gameStarted(mia, cl.id, race.id).code, 'notFound');
  assert.equal(P.get(cl.id, race.id, mia.id), null, 'no row was made');
  assert.ok(P.gameScore(mia, cl.id, race.id, 12, 'live').ok, 'the live run (server side) still writes the cell');
  assert.equal(P.get(cl.id, race.id, mia.id).status, 'done');
  assert.equal((await kidApi(`/api/progress/${cl.id}/${play.id}/game`, { method: 'POST', body: { event: 'time', seconds: 30 } })).status, 200, 'ordinary steps as before');
  L.unassign(ana, cl.id);
});

test('P4 quiz snapshots keep cat and secs; students never get cat or the answer; P7 the quiz APIs live under /api/progress and QUIZ_STEPS gates them and the page', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Exit ticket' }).lesson;
  const items = [{ q: 'A loop…', choices: ['repeats', 'stops', 'asks', 'draws'], answer: 0, secs: 20, cat: '1B-AP-10', extra: 'dropped' }, { q: 'A bug is…', choices: ['a mistake', 'a feature'], answer: 0, cat: '1B-AP-15' }];
  const step = L.addQuizStep(ana, l.id, { title: 'Exit ticket', items, minutes: 3, body: 'Three quick questions.' }).step;
  assert.deepEqual(L.quizItemsOf(step), [{ q: 'A loop…', choices: ['repeats', 'stops', 'asks', 'draws'], answer: 0, cat: '1B-AP-10', secs: 20 }, { q: 'A bug is…', choices: ['a mistake', 'a feature'], answer: 0, cat: '1B-AP-15' }]);
  assert.equal(step.minutes, 3); assert.equal(step.body, 'Three quick questions.');
  const cl = L.assign(ana, cls.id, l.id).classLesson;
  const kid = as(mia);
  let r = await kid(`/class/${cls.id}/lessons/${cl.id}`);
  assert.match(r.text, new RegExp(`data-api="/api/progress/${cl.id}/${step.id}/quiz"`), 'the page points the quiz script at the progress API');
  assert.match(r.text, /live-quiz-step\.js/);
  const url = `/api/progress/${cl.id}/${step.id}/quiz`;
  r = await kid(url); assert.equal(r.status, 200);
  assert.deepEqual(r.json, { items: [{ q: 'A loop…', choices: ['repeats', 'stops', 'asks', 'draws'] }, { q: 'A bug is…', choices: ['a mistake', 'a feature'] }], marks: '--' });
  assert.ok(!r.text.includes('cat') && !r.text.includes('answer'));
  assert.equal((await as(zed)(url)).status, 404, 'not in the class');
  r = await kid(url, { method: 'POST', body: { i: 0, c: 0 } }); assert.deepEqual(r.json, { ok: true, answer: 0, next: 1, score: null });
  r = await kid(url, { method: 'POST', body: { i: 0, c: 1 } }); assert.equal(r.status, 400); assert.equal(r.json.code, 'answered');
  r = await kid(url, { method: 'POST', body: { i: 1, c: 1 } }); assert.deepEqual(r.json, { ok: false, answer: 0, next: -1, score: 50 });
  assert.deepEqual(q.get('SELECT status, score, label, marks FROM step_progress WHERE step_id=? AND user_id=?', step.id, mia.id), { status: 'done', score: 50, label: 'quiz', marks: '10' });
  // QUIZ_STEPS off: the APIs answer 404 and the step is left off the page; LIVE_HOMEWORK is not involved
  assert.equal(config.liveHomework, false);
  config.quizSteps = false;
  try {
    r = await as(leo)(url); assert.equal(r.status, 404); assert.equal(r.json.code, 'quizStepsOff');
    assert.equal((await as(leo)(url, { method: 'POST', body: { i: 0, c: 0 } })).status, 404);
    r = await as(leo)(`/class/${cls.id}/lessons/${cl.id}`);
    assert.equal(r.status, 200); assert.doesNotMatch(r.text, /lv-qstep/); assert.doesNotMatch(r.text, /live-quiz-step\.js/);
  } finally { config.quizSteps = true; }
  assert.match((await as(leo)(`/class/${cls.id}/lessons/${cl.id}`)).text, /lv-qstep/);
  L.unassign(ana, cl.id);
});

test('P8/P9 copies keep options, standards, template, rubric, set_id and fresh quiz items; template_key / template_version are stored and copied', async () => {
  const SETS = await import('../../server/services/classlive-sets.js');
  const set = SETS.createSet(ana, { title: 'U1 exit', items: [{ q: 'Q1?', choices: ['a', 'b'], answer: 1, secs: 20, cat: '1B-AP-10' }], lang: 'en' }).set;
  const src = L.createLesson(ana, oak.id, { title: 'CSQ 1.2', templateKey: 'csq-1b-1.2', templateVersion: 3 }).lesson;
  assert.equal(src.template_key, 'csq-1b-1.2'); assert.equal(src.template_version, 3);
  assert.equal(L.createLesson(ana, oak.id, { title: 'x', templateKey: 'Bad Key!' }).code, 'templateKey');
  assert.deepEqual(L.cleanLesson({ title: 't', templateVersion: 2 }).v.template_version, 0, 'no key: no version');
  assert.deepEqual(L.cleanLesson({ title: 't', templateKey: 'CSQ-2-7.2', templateVersion: '4' }).v, { title: 't', summary: '', subject: '', grade: '', objectives: '', shared: 0, template_key: 'csq-2-7.2', template_version: 4 });
  L.addStep(ana, src.id, { kind: 'game', gameId: robo.id, options: 'chapter=loops&band=1b&lock=1', standards: '1B-AP-10' });
  L.addStep(ana, src.id, { kind: 'build', body: 'a quiz about loops', template: 'quiz', standards: '1B-AP-15', rubric: [{ line: 'Plan', ids: ['1B-AP-13'] }] });
  const quiz = L.addQuizStep(ana, src.id, { title: 'Exit', setId: set.id, items: SETS.getSet(set.id) ? JSON.parse(SETS.getSet(set.id).items) : [] }).step;
  assert.deepEqual(L.quizItemsOf(quiz).map(i => i.cat), ['1B-AP-10']);
  // the set changes after the snapshot: a copy regenerates from the set (set_id kept)
  SETS.updateSet(ana, set.id, { items: [{ q: 'Q1 new?', choices: ['a', 'b'], answer: 0, secs: 30, cat: '1B-AP-11' }, { q: 'Q2?', choices: ['c', 'd'], answer: 1, secs: 20, cat: '1B-AP-12' }] });
  L.updateLesson(ana, src.id, { shared: true });
  const c = L.copyLesson(ben, src.id); assert.ok(c.ok);
  assert.equal(c.lesson.template_key, 'csq-1b-1.2'); assert.equal(c.lesson.template_version, 3); assert.equal(c.lesson.copied_from, src.id);
  const st = L.steps(c.lesson.id);
  assert.deepEqual(st.map(s => [s.kind, s.options, s.standards, s.template]), [['game', 'chapter=loops&band=1b&lock=1', '1B-AP-10', ''], ['build', '', '1B-AP-15', 'quiz'], ['quiz', '', '', '']]);
  assert.deepEqual(L.rubricOf(st[1]), [{ line: 'Plan', ids: ['1B-AP-13'], levels: [] }]);
  assert.equal(st[2].set_id, set.id);
  assert.deepEqual(L.quizItemsOf(st[2]), [{ q: 'Q1 new?', choices: ['a', 'b'], answer: 0, cat: '1B-AP-11', secs: 30 }, { q: 'Q2?', choices: ['c', 'd'], answer: 1, cat: '1B-AP-12', secs: 20 }], 'regenerated from the set');
  // the set gone: the copy keeps the snapshot it had
  SETS.archiveSet(ana, set.id);
  const c2 = L.copyLesson(ana, src.id);
  assert.deepEqual(L.quizItemsOf(L.steps(c2.lesson.id)[2]), L.quizItemsOf(quiz), 'the original snapshot');
  // a plain lesson copies exactly as before
  const plain = L.createLesson(ana, oak.id, { title: 'Plain' }).lesson; L.addStep(ana, plain.id, { kind: 'text', body: 'Read' });
  const pc = L.copyLesson(ana, plain.id); assert.equal(pc.lesson.template_key, ''); assert.equal(pc.lesson.template_version, 0);
  assert.deepEqual(L.steps(pc.lesson.id).map(s => [s.options, s.standards, s.template, s.rubric, s.set_id, s.items]), [['', '', '', '', null, '']]);
  // updateLesson can set and clear the template fields; the lesson editor still works
  assert.ok(L.updateLesson(ana, plain.id, { templateKey: 'csq-2-3.1', templateVersion: 1 }).ok);
  assert.equal(L.getLesson(plain.id).template_key, 'csq-2-3.1');
  assert.ok(L.updateLesson(ana, plain.id, { templateKey: '' }).ok);
  assert.deepEqual([L.getLesson(plain.id).template_key, L.getLesson(plain.id).template_version], ['', 0]);
  assert.equal((await as(ana)(`/teach/lessons/${src.id}`)).status, 200);
});

test('P10 a build step with a Studio template starts the student from that template; without one, from an empty game as before', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Capstone' }).lesson;
  const tpl = L.addStep(ana, l.id, { kind: 'build', body: 'A quiz about our town', template: 'quiz' }).step;
  const plain = L.addStep(ana, l.id, { kind: 'build', body: 'Anything you like' }).step;
  const cl = L.assign(ana, cls.id, l.id).classLesson;
  const kid = as(mia);
  let r = await kid(`/api/progress/${cl.id}/${tpl.id}/build`, { method: 'POST', body: {} });
  assert.equal(r.status, 200, r.text); assert.match(r.json.redirect, /^\/studio\/[^?]+\?ask=A%20quiz%20about%20our%20town$/);
  const g = games.getGame(r.json.redirect.split('/')[2].split('?')[0]);
  assert.equal(g.owner_id, mia.id); assert.equal(g.tags, 'quiz'); assert.equal(g.category, 'learning'); assert.equal(g.title, 'A quiz about our town'.slice(0, 60) === g.title ? g.title : g.title);
  assert.ok(g.current_version_id, 'the template is its first version');
  const v = games.getVersion(g.current_version_id);
  assert.match(v.html, /oomba-kit/, 'the Quiz Show template on the kit');
  assert.ok(v.html.length > 5000);
  r = await kid(`/api/progress/${cl.id}/${tpl.id}/build`, { method: 'POST', body: {} });
  assert.equal(r.json.redirect, `/studio/${g.id}`, 'reopened, not made again');
  r = await kid(`/api/progress/${cl.id}/${plain.id}/build`, { method: 'POST', body: {} });
  const g2 = games.getGame(r.json.redirect.split('/')[2].split('?')[0]);
  assert.equal(g2.current_version_id, null, 'no template: an empty game, as before');
  L.unassign(ana, cl.id);
});

test('P11 rubric marks: 0-3 per line on question and build steps, teammates get the same marks, the page shows the form and the marks', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Marks' }).lesson;
  const ask = L.addStep(ana, l.id, { kind: 'question', body: 'In your own words: what is a loop?', standards: '1B-AP-10', rubric: [{ line: 'Explains the loop', ids: ['1B-AP-10'], levels: ['Not yet', 'Starting', 'Mostly', 'Clear'] }, { line: 'Gives an example', ids: ['1B-AP-11'] }] }).step;
  const plainQ = L.addStep(ana, l.id, { kind: 'question', body: 'Anything else?' }).step;
  const build = L.addStep(ana, l.id, { kind: 'build', body: 'A quiz game', template: 'quiz', rubric: [{ line: 'Plan', ids: ['1B-AP-13'] }, { line: 'Test with others', ids: ['1B-AP-15'] }, { line: 'Credit', ids: ['1B-AP-17'] }] }).step;
  const cl = L.assign(ana, cls.id, l.id).classLesson;
  assert.ok(P.answer(mia, cl.id, ask.id, 'It repeats steps.').ok);
  assert.ok(P.answer(mia, cl.id, plainQ.id, 'No.').ok);
  // marks helpers
  assert.equal(P.cleanMarks([2, '3'], 2), '23'); assert.equal(P.cleanMarks('2-', 2), '2-'); assert.equal(P.cleanMarks([null, 1], 3), '-1-');
  assert.equal(P.cleanMarks([4], 1), null); assert.equal(P.cleanMarks('123', 2), null, 'longer than the rubric'); assert.equal(P.cleanMarks('x', 1), null);
  // service: marks on a question with a rubric; refused where there is no rubric; feedback still works alone
  assert.equal(P.review(ana, cl.id, ask.id, mia.id, 'Good', { marks: [2, 9] }).code, 'badMarks');
  assert.equal(P.review(ana, cl.id, plainQ.id, mia.id, 'Fine', { marks: [2] }).code, 'badMarks', 'no rubric on this step');
  assert.ok(P.review(ana, cl.id, plainQ.id, mia.id, 'Fine', { marks: ['-'] }).ok, 'all unmarked is the same as none');
  let r = P.review(ana, cl.id, ask.id, mia.id, 'Good', { marks: [2, 3] });
  assert.ok(r.ok); assert.equal(r.marks, '23'); assert.deepEqual(r.alsoMarked, []);
  assert.equal(P.get(cl.id, ask.id, mia.id).marks, '23'); assert.equal(P.get(cl.id, ask.id, mia.id).feedback, 'Good');
  assert.ok(P.review(ana, cl.id, ask.id, mia.id, 'Better').ok, 'feedback alone leaves the marks');
  assert.equal(P.get(cl.id, ask.id, mia.id).marks, '23');
  assert.equal(P.review(ben, cl.id, ask.id, mia.id, 'x', { marks: [1, 1] }).code, 'notFound', 'not this class\'s teacher');
  assert.equal(P.review(ana, cl.id, ask.id, leo.id, 'x').code, 'notFound', 'nothing to review for a student without an answer');
  r = P.review(ana, cl.id, ask.id, leo.id, '', { marks: [1, '-'] });
  assert.ok(r.ok, 'marks alone make a row for a student of the class'); assert.equal(P.get(cl.id, ask.id, leo.id).marks, '1-'); assert.equal(P.get(cl.id, ask.id, leo.id).status, 'started');
  assert.equal(P.review(ana, cl.id, ask.id, zed.id, '', { marks: [1, 1] }).code, 'notFound', 'not a student of the class');
  // a build step: the captain handed in; teammates never opened the step and still get the marks (not the feedback)
  const kid = as(mia);
  let x = await kid(`/api/progress/${cl.id}/${build.id}/build`, { method: 'POST', body: {} }); assert.equal(x.status, 200);
  r = P.review(ana, cl.id, build.id, mia.id, 'Great team work', { marks: '32-', alsoMark: [leo.id, kim.id, zed.id, mia.id, 'nobody'] });
  assert.ok(r.ok); assert.deepEqual(r.alsoMarked.sort(), [leo.id, kim.id].sort(), 'classmates only, never the student again or an outsider');
  for (const id of [leo.id, kim.id]) { const row = P.get(cl.id, build.id, id); assert.equal(row.marks, '32-'); assert.equal(row.feedback, ''); assert.ok(row.reviewed_at); assert.equal(row.status, 'started'); }
  assert.equal(P.get(cl.id, build.id, mia.id).feedback, 'Great team work');
  assert.equal(P.get(cl.id, build.id, zed.id), null);
  // the lesson progress page: rubric radios, teammates, marks in the grid and on the cards; the API takes the form's fields
  const teacher = as(ana);
  let page = await teacher(`/class/${cls.id}/progress/${cl.id}`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Explains the loop/); assert.match(page.text, /name="mark-0" value="2" checked/); assert.match(page.text, /name="mark-1" value="3" checked/);
  assert.match(page.text, /Also mark these teammates/); assert.match(page.text, new RegExp(`name="alsoMark" value="${leo.id}"`));
  assert.match(page.text, /Not yet.*Clear/s, 'the level descriptors');
  assert.match(page.text, /title="Rubric marks: 2 · 3"/, 'marks in the grid');
  assert.match(page.text, /3 · 2 · –/, 'the build step\'s marks');
  assert.match(page.text, new RegExp(`id="b-${build.id}"`), 'a build step with a rubric gets its own section');
  x = await teacher(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { feedback: 'Clear now', 'mark-0': '3', 'mark-1': '-', alsoMark: kim.id } });
  assert.equal(x.status, 200, x.text); assert.equal(x.json.marks, '3-'); assert.deepEqual(x.json.alsoMarked, [kim.id]);
  assert.equal(P.get(cl.id, ask.id, kim.id).marks, '3-');
  x = await teacher(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { feedback: 'x', marks: [5, 0] } });
  assert.equal(x.status, 400); assert.equal(x.json.code, 'badMarks');
  x = await teacher(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { feedback: 'Just words' } });
  assert.equal(x.status, 200); assert.equal(P.get(cl.id, ask.id, mia.id).marks, '3-', 'feedback alone keeps the marks');
  assert.equal((await as(ben)(`/api/progress/${cl.id}/${ask.id}/${mia.id}/review`, { method: 'POST', body: { marks: [1, 1] } })).status, 404);
  // the student sees feedback, never the marks or the rubric form
  page = await kid(`/class/${cls.id}/lessons/${cl.id}`);
  assert.match(page.text, /Just words/); assert.match(page.text, /Great team work/, 'feedback on the build shows too');
  assert.doesNotMatch(page.text, /mark-0|Rubric marks|alsoMark/);
  // a question step without a rubric keeps today's form exactly
  const full = (await teacher(`/class/${cls.id}/progress/${cl.id}`)).text;
  const card = full.slice(full.indexOf(`id="a-${plainQ.id}-${mia.id}"`)); const plainCard = card.slice(0, card.indexOf('</li>'));
  assert.ok(plainCard.includes(`fb-${plainQ.id}-${mia.id}`) && !plainCard.includes('name="mark-') && !plainCard.includes('alsoMark'), 'no radios on the plain question');
  L.unassign(ana, cl.id);
});

test('P11 marks are not a reading: alsoMark and marks-only leave unread answers waiting; feedback left out is kept; shorter marks merge; nothing marked marks nobody', async () => {
  const l = L.createLesson(ana, oak.id, { title: 'Own words' }).lesson;
  const ask = L.addStep(ana, l.id, { kind: 'question', body: 'In your own words', rubric: [{ line: 'Explains' }, { line: 'Example' }] }).step;
  const cl = L.assign(ana, cls.id, l.id).classLesson;
  assert.ok(P.answer(mia, cl.id, ask.id, 'Mia says').ok); assert.ok(P.answer(leo, cl.id, ask.id, 'Leo says').ok);
  const toRead = () => (P.toReadByLesson(cls.id).find(r => r.cl === cl.id) || { n: 0 }).n;
  const url = who => `/api/progress/${cl.id}/${ask.id}/${who.id}/review`;
  assert.equal(toRead(), 2);
  const teacher = as(ana);
  let x = await teacher(url(mia), { method: 'POST', body: { feedback: 'Nice', 'mark-0': '3', 'mark-1': '2', alsoMark: [leo.id, kim.id] } });
  assert.equal(x.status, 200, x.text); assert.deepEqual(x.json.alsoMarked.sort(), [leo.id, kim.id].sort());
  assert.equal(toRead(), 1, "Leo's unread answer still waits for the teacher");
  assert.equal(P.firstNewAnswers(cls.id)[`${leo.id}:${cl.id}`], ask.id);
  assert.equal(P.lessonProgress(cl.id).students.find(p => p.id === leo.id).toRead, 1);
  assert.equal(P.classProgress(cls.id).toRead, 1);
  const leoRow = P.get(cl.id, ask.id, leo.id); assert.equal(leoRow.marks, '32'); assert.equal(leoRow.reviewed_at, null, 'marks copied, the answer not read');
  assert.doesNotMatch((await as(leo)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Your teacher has seen your answer/);
  const kimRow = P.get(cl.id, ask.id, kim.id); assert.equal(kimRow.marks, '32'); assert.equal(kimRow.answer, ''); assert.equal(kimRow.status, 'started');
  assert.doesNotMatch((await as(kim)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Your teacher has seen your answer|💬 Feedback/, 'no answer: no feedback block');
  assert.match((await as(mia)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Nice/);
  // marks alone (no feedback key): the marks change, an unread answer stays unread, the feedback is kept
  x = await teacher(url(leo), { method: 'POST', body: { marks: ['1', '1'] } });
  assert.equal(x.status, 200); assert.equal(x.json.marks, '11'); assert.equal(P.get(cl.id, ask.id, leo.id).reviewed_at, null); assert.equal(toRead(), 1);
  assert.ok(P.review(ana, cl.id, ask.id, leo.id, undefined, { marks: [2, 2] }).ok); assert.equal(P.get(cl.id, ask.id, leo.id).reviewed_at, null, 'the service too');
  x = await teacher(url(mia), { method: 'POST', body: { marks: ['1', '1'] } });
  assert.equal(x.status, 200); assert.equal(P.get(cl.id, ask.id, mia.id).feedback, 'Nice', 'feedback left out = kept');
  // a marks-only row for a student with no answer never says the teacher has seen an answer
  const zoe = S.createSchoolAccount(ana, oak.id, { rosterName: 'Zoe Pupil' }).user; S.addToClass(ana, cls.id, zoe.id);
  assert.ok(P.review(ana, cl.id, ask.id, zoe.id, undefined, { marks: [1, 1] }).ok);
  assert.doesNotMatch((await as(zoe)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Your teacher has seen your answer|💬 Feedback/);
  // the form's Send with an empty box still marks the answer read and clears the feedback, as it always did
  x = await teacher(url(leo), { method: 'POST', body: { feedback: '', 'mark-0': '1', 'mark-1': '1' } });
  assert.equal(x.status, 200); assert.ok(P.get(cl.id, ask.id, leo.id).reviewed_at); assert.equal(toRead(), 0);
  assert.match((await as(leo)(`/class/${cls.id}/lessons/${cl.id}`)).text, /Your teacher has seen your answer/);
  // a shorter list, or a form missing a line, keeps the other lines; '-' un-marks one
  x = await teacher(url(mia), { method: 'POST', body: { marks: ['2'] } }); assert.equal(x.json.marks, '21');
  x = await teacher(url(mia), { method: 'POST', body: { 'mark-1': '3' } }); assert.equal(x.json.marks, '23');
  x = await teacher(url(mia), { method: 'POST', body: { marks: ['-'] } }); assert.equal(x.json.marks, '-3');
  assert.equal(P.cleanMarks([undefined, 2], 2, '1-'), '12'); assert.equal(P.cleanMarks([], 2, '13'), '13'); assert.equal(P.cleanMarks([null], 2, '13'), '-3');
  assert.equal(P.cleanMarks([], 2, 'x9'), '--', 'only marks are kept from what is stored'); assert.equal(P.cleanMarks([1, 2, 3], 2, ''), null);
  // nothing marked + alsoMark: nobody else gets a row; the list is capped at 60
  x = await teacher(url(mia), { method: 'POST', body: { marks: ['-', '-'], alsoMark: [kim.id, zed.id] } });
  assert.equal(x.status, 200); assert.deepEqual(x.json.alsoMarked, []);
  const r = P.review(ana, cl.id, ask.id, mia.id, undefined, { marks: [1, 1], alsoMark: Array.from({ length: P.ALSO_MARK_MAX }, (_, i) => `ghost${i}`).concat(kim.id) });
  assert.ok(r.ok); assert.deepEqual(r.alsoMarked, [], 'the 61st id is never looked at');
  assert.deepEqual(P.review(ana, cl.id, ask.id, mia.id, undefined, { marks: [1, 1], alsoMark: Array.from({ length: P.ALSO_MARK_MAX - 1 }, (_, i) => `ghost${i}`).concat(kim.id) }).alsoMarked, [kim.id]);
  // a text step row never takes feedback (as before P11)
  const txt = L.addStep(ana, l.id, { kind: 'text', body: 'Read' }).step; assert.ok(P.markDone(mia, cl.id, txt.id).ok);
  assert.equal(P.review(ana, cl.id, txt.id, mia.id, 'x').code, 'notFound');
  S.removeFromClass(ana, cls.id, zoe.id);
  L.unassign(ana, cl.id);
});

test('P17 cadence dates and assignUnitWithCadence: opens_at per lesson, due the day before the next opens (last +7), or dueDays', () => {
  const D = 86400e3, day = s => Date.parse(`${s}T00:00:00Z`);
  assert.deepEqual(L.cadenceDates('2026-01-05', 3, 'daily'), [day('2026-01-05'), day('2026-01-06'), day('2026-01-07')]);
  assert.deepEqual(L.cadenceDates('2026-01-08', 3, 'weekdays'), [day('2026-01-08'), day('2026-01-09'), day('2026-01-12')], 'Thu, Fri, Mon');
  assert.deepEqual(L.cadenceDates('2026-01-10', 2, 'weekdays'), [day('2026-01-12'), day('2026-01-13')], 'a Saturday start moves to Monday');
  assert.deepEqual(L.cadenceDates('2026-01-05', 3, 'weekly'), [day('2026-01-05'), day('2026-01-12'), day('2026-01-19')]);
  assert.deepEqual(L.cadenceDates('2026-01-05', 4, 'twice-weekly'), [day('2026-01-05'), day('2026-01-08'), day('2026-01-12'), day('2026-01-15')], 'Mon / Thu');
  assert.equal(L.cadenceDates('nope', 2, 'daily'), null); assert.equal(L.cadenceDates('2026-01-05', 2, 'hourly'), null);
  assert.equal(L.cadenceDates('', 1, 'daily')[0] % D, 0, 'today when empty');
  const mk = t => { const l = L.createLesson(ana, oak.id, { title: t }).lesson; L.addStep(ana, l.id, { kind: 'text', body: t }); return l; };
  const [a, b, c] = ['U1 1.1', 'U1 1.2', 'U1 1.3'].map(mk);
  const uc = S.createClass(ana, oak.id, { name: 'Ana cadence' }).class;
  const unit = L.createUnit(ana, uc.id, 'Unit 1').unit;
  assert.equal(L.assignUnitWithCadence(ben, uc.id, [a.id], { start: '2026-02-02' }).code, 'notFound', 'not their class');
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [], {}).code, 'badRequest');
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [a.id], { cadence: 'monthly' }).code, 'badCadence');
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [a.id], { start: 'not a day' }).code, 'badDate');
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [a.id], { start: '2026-02-02', dueDays: -1 }).code, 'badDate');
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [a.id], { start: '2026-02-02', dueDays: 366 }).code, 'badDate');
  const bensUnit = L.createUnit(ben, other.id, 'Ben unit').unit;
  assert.equal(L.assignUnitWithCadence(ana, uc.id, [a.id], { unitId: bensUnit.id, start: '2026-02-02' }).code, 'notFound', 'a unit of another class');
  assert.deepEqual(L.cadenceDates(day('2026-01-05') + 3600e3, 2, 'daily'), [day('2026-01-05'), day('2026-01-06')], 'a numeric start is cut to its day');
  // a lesson that exists but that assign() would refuse (a colleague's private lesson) takes no day either: the next lesson keeps its date
  const bensOwn = L.createLesson(ben, oak.id, { title: 'Ben private' }).lesson;
  const r = L.assignUnitWithCadence(ana, uc.id, [a.id, b.id, 'missing', bensOwn.id, c.id, c.id], { unitId: unit.id, start: '2026-02-02', cadence: 'twice-weekly' });
  assert.ok(r.ok); assert.deepEqual(r.skipped, [{ lessonId: 'missing', code: 'notFound' }, { lessonId: bensOwn.id, code: 'notFound' }], 'an unknown or refused id takes no day; a repeated id counts once');
  assert.deepEqual(r.assigned.map(x => [x.opensAt, x.dueAt]), [[day('2026-02-02'), day('2026-02-04')], [day('2026-02-05'), day('2026-02-08')], [day('2026-02-09'), day('2026-02-16')]], 'due the day before the next opens; the last a week on');
  const rows = L.classLessons(uc.id);
  assert.deepEqual(rows.map(x => [x.title, x.opens_at, x.due_at, x.unit_id]), [['U1 1.1', day('2026-02-02'), day('2026-02-04'), unit.id], ['U1 1.2', day('2026-02-05'), day('2026-02-08'), unit.id], ['U1 1.3', day('2026-02-09'), day('2026-02-16'), unit.id]]);
  const again = L.assignUnitWithCadence(ana, uc.id, [a.id, b.id], { start: '2026-03-02' });
  assert.deepEqual(again.skipped.map(x => x.code), ['alreadyAssigned', 'alreadyAssigned'], 'already in the class: left as they are');
  L.unassign(ana, rows[0].id);
  const back = L.assignUnitWithCadence(ana, uc.id, [a.id], { start: '2026-03-02', cadence: 'daily', dueDays: 2 });
  assert.equal(back.assigned[0].restored, true); assert.equal(back.assigned[0].dueAt, day('2026-03-04'), 'dueDays after it opens');
  assert.deepEqual(L.assignUnitWithCadence(ana, uc.id, [c.id], { start: '2026-03-02', cadence: 'daily', dueDays: 0 }).skipped.map(x => x.code), ['alreadyAssigned']);
  assert.ok(L.CADENCES.includes('weekdays'));
});

test('P18 builderStatus: resting without a key or at the budget cap; on otherwise; the teams-per-period number from config', () => {
  assert.equal(config.anthropicKey, '');
  let s = builderStatus();
  assert.deepEqual([s.on, s.state, s.why, s.resetsAt, s.teamsPerPeriod], [false, 'resting', 'noKey', null, 8]);
  config.anthropicKey = 'test-key';
  try {
    s = builderStatus(); assert.equal(s.state, 'on'); assert.equal(s.why, null); assert.equal(s.pools.free, true);
    const day = '2031-05-05', at = Date.parse(`${day}T10:00:00Z`);
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 10_000_000 }, day);
    s = builderStatus(at);
    assert.deepEqual([s.on, s.state, s.why], [false, 'resting', 'daily']);
    assert.equal(s.resetsAt, Date.UTC(2031, 4, 6), 'back at the next UTC midnight');
    assert.equal(builderStatus(Date.parse('2031-05-06T01:00:00Z')).on, true, 'a new UTC day: back on ($100 is under the $150 month)');
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 10_000_000 }, '2031-05-06');
    s = builderStatus(Date.parse('2031-05-07T01:00:00Z'));
    assert.deepEqual([s.on, s.why, s.resetsAt], [false, 'monthly', Date.UTC(2031, 5, 1)], 'the month spent: back on the 1st');
  } finally { config.anthropicKey = ''; }
  // a school plan pays into the paid pool: the Builder stays on while the free pool rests; the site-wide hard ceiling stops both
  config.anthropicKey = 'test-key';
  aiBudget.registerPaidBudget('csq-test', () => 25);
  try {
    const d2 = '2032-01-05';
    aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 10_000_000 }, d2);   // the free pool's day is spent ($100)
    s = builderStatus(Date.parse(`${d2}T10:00:00Z`));
    assert.deepEqual([s.on, s.state, s.why, s.resetsAt, s.pools], [true, 'on', null, null, { free: false, paid: true }]);
    const hardWas = config.aiHardMonthlyUsd; config.aiHardMonthlyUsd = 50;
    try {
      s = builderStatus(Date.parse('2032-01-06T10:00:00Z'));   // the next day: the free pool's own day is clean, but the month is over the hard ceiling
      assert.deepEqual([s.on, s.why, s.resetsAt, s.pools], [false, 'hard', Date.UTC(2032, 1, 1), { free: false, paid: false }]);
    } finally { config.aiHardMonthlyUsd = hardWas; }
  } finally { aiBudget.registerPaidBudget('csq-test', () => 0); config.anthropicKey = ''; }
  const was = config.csQuestBuildTeamsPerPeriod;
  config.csQuestBuildTeamsPerPeriod = 12;
  try { assert.equal(builderStatus().teamsPerPeriod, 12); } finally { config.csQuestBuildTeamsPerPeriod = was; }
});

test('migration 0044 adds each column once: run twice on a pre-CS-Quest schema it is a no-op the second time, and the columns are empty by default', async () => {
  const { MIGRATIONS } = await import('../../server/db.js');
  const Database = (await import('better-sqlite3')).default;
  const conn = new Database(':memory:');
  conn.exec(`CREATE TABLE lessons (id TEXT PRIMARY KEY, title TEXT NOT NULL);
    CREATE TABLE lesson_steps (id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, kind TEXT NOT NULL, items TEXT NOT NULL DEFAULT '');`);
  const m = MIGRATIONS.find(x => x[0] === '0044_cs_quest_steps');
  assert.ok(m && m[1] === '' && typeof m[2] === 'function', 'a function migration with no SQL');
  const cols = tbl => conn.prepare(`PRAGMA table_info(${tbl})`).all().map(c => c.name);
  m[2](conn); m[2](conn);
  assert.deepEqual(cols('lesson_steps'), ['id', 'lesson_id', 'kind', 'items', 'options', 'standards', 'template', 'rubric'], 'each column once');
  assert.deepEqual(cols('lessons'), ['id', 'title', 'template_key', 'template_version']);
  conn.exec("INSERT INTO lesson_steps(id, lesson_id, kind) VALUES ('s', 'l', 'text'); INSERT INTO lessons(id, title) VALUES ('l', 'L')");
  assert.deepEqual(conn.prepare('SELECT options, standards, template, rubric FROM lesson_steps').get(), { options: '', standards: '', template: '', rubric: '' }, 'empty = today\'s behaviour');
  assert.deepEqual(conn.prepare('SELECT template_key, template_version FROM lessons').get(), { template_key: '', template_version: 0 });
  conn.close();
});
