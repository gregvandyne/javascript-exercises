// Standards beyond computer science (docs/decisions.md, 9 Nov 2026): the Common Core data files (codes, statements,
// the license notice), the official tags (every code exists; Number Quest's locked codes are all in the file), teacher
// tags on lessons and steps (who may tag, bad codes and steps, copied with a lesson, deleted with a step or lesson), the
// class view's coverage and per-student mastery from lesson work, live runs and Number Quest, the rubric-source
// interface, the pages and the CSV, and who may see them: other teachers, students, kids, grown-ups and guests get
// 404 (signed-out visitors the sign-in page / 401). The CSTA tab is unchanged when no framework is picked.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, uid } = await import('../../server/db.js');
const { createUser, createGuest, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const games = await import('../../server/services/games.js');
const CC = await import('../../server/services/standards-ccss.js');
const FW = await import('../../server/standards/frameworks.js');
const OT = await import('../../server/standards/official-tags.js');
const { MATH, ELA, NOTICE, normId } = await import('../../server/standards/ccss.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const req = async (who, path, { method = 'GET', body } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...(body ? { 'content-type': 'application/json' } : {}), origin: base };
  const r = await fetch(base + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
  return { status: r.status, text: await r.text(), type: r.headers.get('content-type') || '', location: r.headers.get('location') || '' };
};

// ---------------------------------------------------------------- people and places
const boss = createUser({ username: 'CcBoss', password: 'secret123', role: 'admin' });
const official = createUser({ username: 'OombaAcademy', password: 'secret123' });
const elm = S.createSchool(boss, { name: 'Elm Common Core' }).school;
const ana = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ana Teacher', role: 'teacher' }).user;
const ben = S.createSchoolAccount(boss, elm.id, { rosterName: 'Ben Teacher', role: 'teacher' }).user;
const head = S.createSchoolAccount(boss, elm.id, { rosterName: 'Hana Head', role: 'admin' }).user;
const cls = S.createClass(ana, elm.id, { name: 'Ana 3A' }).class;
const pupil = name => { const u = S.createSchoolAccount(ana, elm.id, { rosterName: name }).user; S.addToClass(ana, cls.id, u.id); return u; };
const mia = pupil('Mia Pupil'), leo = pupil('Leo Pupil'), kim = pupil('Kim Pupil'), nora = pupil('Nora Pupil');
const kid = createUser({ username: 'CcKid', password: 'secret123' });
const grownup = createUser({ username: 'CcParent', password: 'secret123', accountType: 'grownup' });
const guest = createGuest();
const other = S.createSchool(boss, { name: 'Far School' }).school;
const far = S.createSchoolAccount(boss, other.id, { rosterName: 'Far Teacher', role: 'teacher' }).user;
const seed = (slug, title) => {
  const g = games.createGame(official.id, { title, slug, source: 'seed', category: 'learning' });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: official.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  return games.getGame(g.id);
};
const sumRacer = seed('sum-racer', 'Sum Racer');
const wordTrail = seed('word-trail', 'Word Trail');

// ---------------------------------------------------------------- data
test('the data files: K-8 codes and official statements, the license notice', () => {
  assert.equal(MATH.all({ top: true }).length, 229, 'CCSS-M K-8 has 229 standards');
  assert.deepEqual(MATH.grades, ['K', '1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(MATH.all({ grade: '3', top: true }).length, 25);
  assert.equal(MATH.byId('3.OA.C.7').statement.startsWith('Fluently multiply and divide within 100'), true);
  assert.equal(MATH.byId('3.md.c.7a').parent, '3.MD.C.7');
  assert.deepEqual(MATH.childrenOf('3.MD.C.7'), ['3.MD.C.7a', '3.MD.C.7b', '3.MD.C.7c', '3.MD.C.7d']);
  assert.equal(MATH.byId('8.EE.A.2').grade, '8');
  for (const s of MATH.all()) assert.match(s.id, /^(K|[1-8])\.(CC|OA|NBT|NF|MD|G|RP|NS|EE|F|SP)\.[A-D]\.\d+[a-z]?$/);
  // ELA: RL 9 a grade (no RL.x.8), RI 10, RF only K-5, no W.2.4 / W.2.10 ("begins in grade 3")
  for (const g of ELA.grades) {
    assert.equal(ELA.all({ grade: g, domain: 'RL', top: true }).length, 9, `RL grade ${g}`);
    assert.equal(ELA.all({ grade: g, domain: 'RI', top: true }).length, 10, `RI grade ${g}`);
    assert.equal(ELA.all({ grade: g, domain: 'RF' }).length > 0, ['K', '1', '2', '3', '4', '5'].includes(g), `RF grade ${g}`);
  }
  assert.equal(ELA.byId('W.2.4'), null); assert.equal(ELA.byId('W.2.10'), null); assert.ok(ELA.byId('W.3.4'));
  assert.equal(ELA.byId('rf.k.3c').statement, 'Read common high-frequency words by sight (e.g., the, of, to, you, she, my, is, are, do, does).');
  for (const s of ELA.all()) { assert.match(s.id, /^(RL|RI|RF|W|SL|L)\.(K|[1-8])\.\d+[a-z]?$/); assert.ok(s.statement.length > 10, s.id); }
  for (const f of ['ccss-math.json', 'ccss-ela.json']) assert.equal(JSON.parse(fs.readFileSync(new URL(`../../server/standards/${f}`, import.meta.url))).notice, NOTICE);
  assert.equal(NOTICE, '© Copyright 2010. National Governors Association Center for Best Practices and Council of Chief State School Officers. All rights reserved.');
});

test('codes: normalised forms, frameworks never overlap, search by grade, domain and words', () => {
  assert.equal(normId('ccss.math.content.3.oa.c.7'), '3.OA.C.7');
  assert.equal(normId('CCSS.ELA-LITERACY.RF.K.1.D'), 'RF.K.1d');
  assert.equal(normId(' 3.MD.C.7.A '), '3.MD.C.7a');
  assert.equal(FW.frameworkOf('1B-AP-10'), 'csta');
  assert.equal(FW.frameworkOf('3.OA.C.7'), 'ccss-math');
  assert.equal(FW.frameworkOf('RL.3.1'), 'ccss-ela');
  assert.equal(FW.frameworkOf('3.OA.Z.7'), null);
  assert.deepEqual(FW.ccssCode('rl.3.1'), { framework: 'ccss-ela', code: 'RL.3.1' });
  assert.equal(FW.ccssCode('RL.3.1', 'ccss-math'), null);
  const r = MATH.search({ q: 'fraction', grade: '3' });
  assert.ok(r.total > 0 && r.list.every(s => s.grade === '3' && /fraction/i.test(s.statement + s.id)));
  assert.deepEqual(MATH.search({ q: '3.oa.c.7' }).list.map(s => s.id), ['3.OA.C.7']);
  assert.ok(MATH.search({ grade: '4', domain: 'NF' }).list.every(s => s.domain === 'NF' && s.grade === '4'));
  assert.equal(ELA.search({ q: 'main idea', grade: '3' }).list.some(s => s.id === 'RI.3.2'), true);
  assert.ok(MATH.search({ limit: 5 }).list.length === 5);
});

test('official tags: every code exists; Number Quest locked codes are in the file', () => {
  for (const [slug, byFw] of Object.entries(OT.GAMES)) for (const [f, codes] of Object.entries(byFw)) {
    assert.ok(FW.isCcss(f), `${slug}: ${f}`); assert.ok(codes.length, slug);
    for (const c of codes) assert.ok(FW.CCSS[f].byId(c) && FW.CCSS[f].byId(c).id === c, `${slug}: ${c} is a ${f} code`);
  }
  for (const [g, codes] of Object.entries(OT.TUG_GRADES)) for (const c of codes) assert.ok(MATH.byId(c), `tug ${g}: ${c}`);
  for (const codes of Object.values(OT.SUM_RACER_TRACKS)) for (const c of codes) assert.ok(MATH.byId(c), c);
  const reg = JSON.parse(fs.readFileSync(new URL('../../seed-lessons/number-quest/standards.json', import.meta.url)));
  for (const c of Object.keys(reg.explorerCodes.codes)) assert.ok(MATH.byId(c), `Number Quest ${c}`);
  const nq = OT.numberQuestSteps();
  assert.deepEqual(nq.get('explorer-3.3'), ['3.OA.C.7', '3.OA.B.5', '3.OA.B.6']);
  for (const codes of nq.values()) for (const c of codes) assert.ok(MATH.byId(c), c);
  assert.deepEqual(OT.liveRunCodes('tug', { tug: 'tug:3:90' }), ['3.OA.C.7', '3.NBT.A.2']);
  assert.deepEqual(OT.liveRunCodes('tug', { tug: 'nope' }), []);
  assert.deepEqual(OT.liveRunCodes('quest-race', { tug: 'tug:3:90' }), []);
  assert.deepEqual(OT.gameCodes('word-hunt', 'ccss-ela'), [], 'a word search practises no standard');
});

// ---------------------------------------------------------------- tags
const lesson = L.createLesson(ana, elm.id, { title: 'Times tables', grade: 'Grade 3' }).lesson;
const play = L.addStep(ana, lesson.id, { kind: 'game', title: 'Race', gameId: sumRacer.id }).step;
const write = L.addStep(ana, lesson.id, { kind: 'question', title: 'Explain', body: 'How do you know 6 x 7?' }).step;
const quiz = L.addQuizStep(ana, lesson.id, { title: 'Exit ticket', items: [
  { q: '6 x 7?', choices: ['42', '36'], answer: 0, cat: '3.OA.C.7' }, { q: '8 x 4?', choices: ['32', '24'], answer: 0, cat: '3.oa.c.7' },
  { q: '56 / 8?', choices: ['7', '6'], answer: 0, cat: '3.OA.C.7' }, { q: 'Round 47', choices: ['50', '40'], answer: 0, cat: '1B-AP-10' },
  { q: 'Any?', choices: ['A', 'B'], answer: 0 }] }).step;
const otherLesson = L.createLesson(ben, elm.id, { title: 'Ben reads' }).lesson;
const benStep = L.addStep(ben, otherLesson.id, { kind: 'text', title: 'Read', body: 'Read the story.' }).step;

test('tagging: the owner and school admins only; checked codes and steps; a limit', () => {
  assert.deepEqual(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.oa.b.5' }), { ok: true, code: '3.OA.B.5', added: true });
  assert.equal(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.B.5' }).added, false, 'idempotent');
  assert.ok(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.D.9', stepId: write.id }).ok);
  assert.ok(CC.addTag(head, lesson.id, { framework: 'ccss-ela', code: 'W.3.2', stepId: write.id }).ok, 'a school admin may');
  assert.equal(CC.addTag(ben, lesson.id, { framework: 'ccss-math', code: '3.OA.C.7' }).code, 'notFound', 'another teacher may not');
  assert.equal(CC.addTag(mia, lesson.id, { framework: 'ccss-math', code: '3.OA.C.7' }).code, 'notFound');
  assert.equal(CC.addTag(far, lesson.id, { framework: 'ccss-math', code: '3.OA.C.7' }).code, 'notFound');
  assert.equal(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.Z.9' }).code, 'badCode');
  assert.equal(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: 'RL.3.1' }).code, 'badCode', 'an ELA code is not a Math code');
  assert.equal(CC.addTag(ana, lesson.id, { framework: 'csta', code: '1B-AP-10' }).code, 'badFramework', 'CSTA tags stay on lesson_steps.standards');
  assert.equal(CC.addTag(ana, lesson.id, { framework: 'ccss-math', code: '3.OA.C.7', stepId: benStep.id }).code, 'badStep');
  assert.deepEqual(CC.lessonTags(lesson.id).map(x => `${x.step_id}:${x.code}`).sort(), [':3.OA.B.5', `${write.id}:3.OA.D.9`, `${write.id}:W.3.2`].sort());
  const many = L.createLesson(ana, elm.id, { title: 'Lots' }).lesson;
  const codes = MATH.all({ top: true }).slice(0, CC.MAX_TAGS).map(s => s.id);
  for (const c of codes) assert.ok(CC.addTag(ana, many.id, { framework: 'ccss-math', code: c }).ok);
  assert.equal(CC.addTag(ana, many.id, { framework: 'ccss-math', code: MATH.all({ top: true })[CC.MAX_TAGS].id }).code, 'tooMany');
  assert.ok(CC.removeTag(ana, many.id, { framework: 'ccss-math', code: codes[0] }).removed);
  assert.equal(CC.removeTag(ben, many.id, { framework: 'ccss-math', code: codes[1] }).code, 'notFound');
  assert.ok(L.deleteLesson(ana, many.id).ok);
  assert.equal(q.get('SELECT COUNT(*) n FROM lesson_standards WHERE lesson_id=?', many.id).n, 0, 'deleted with the lesson');
});

test('a copy keeps the tags on its own steps; deleting a step deletes its tags', () => {
  const copy = L.copyLesson(ana, lesson.id).lesson;
  const tags = CC.lessonTags(copy.id);
  const copiedWrite = L.steps(copy.id).find(s => s.kind === 'question');
  assert.deepEqual(tags.map(x => x.code).sort(), ['3.OA.B.5', '3.OA.D.9', 'W.3.2']);
  assert.ok(tags.filter(x => x.step_id).every(x => x.step_id === copiedWrite.id), 'on the copy\'s step, not the original\'s');
  assert.ok(L.deleteStep(ana, copiedWrite.id).ok);
  assert.deepEqual(CC.lessonTags(copy.id).map(x => x.code), ['3.OA.B.5']);
  assert.ok(L.deleteLesson(ana, copy.id).ok);
});

// ---------------------------------------------------------------- the class view
const cl = L.assign(ana, cls.id, lesson.id).classLesson;
const row = (v, id) => v.rows.find(r => r.id === id);

test('before any work: coverage from the lesson, its tags and its game; every student has no data', () => {
  const v = CC.classView(cls.id, 'ccss-math');
  const r7 = row(v, '3.OA.C.7');
  assert.equal(r7.status, 'covered');
  assert.deepEqual(r7.sources.lessons, [cl.id]);
  assert.deepEqual(r7.sources.games, ['sum-racer'], 'Sum Racer practises it');
  assert.equal(row(v, '3.OA.B.5').status, 'covered', 'a whole-lesson tag');
  assert.deepEqual(row(v, '3.NBT.A.1').sources.games, ['sum-racer'], 'the grade 3 codes Sum Racer practises');
  assert.ok(!row(v, '1.OA.C.6') && !row(v, '4.NBT.B.4'), 'never the codes of the other grades Sum Racer spans');
  assert.ok(!row(v, '6.EE.A.1'), 'nothing hits it');
  assert.ok(v.students.every(p => p.noData));
  const g3 = v.summary.find(s => s.grade === '3');
  assert.equal(g3.total, 25); assert.ok(g3.covered >= 4);
  // ELA: only the step tag W.3.2
  const e = CC.classView(cls.id, 'ccss-ela');
  assert.deepEqual(e.rows.map(r => r.id), ['W.3.2']);
  // a grade view lists every top-level code of the grade
  assert.equal(CC.classView(cls.id, 'ccss-math', { grade: '3' }).rows.filter(r => r.grade === '3' && !r.parent).length, 25);
});

test('mastery from lesson work: practice, quiz items by their cat (or the step/lesson tags), meets at 80% over 3', () => {
  // Mia finishes the game (Practiced for every Sum Racer code and the lesson tag) and gets the three 3.OA.C.7 items right.
  assert.ok(P.gameScore(mia, cl.id, play.id, 12, '12 laps').ok);
  for (const i of [0, 1, 2]) assert.ok(P.quizAnswer(mia, cl.id, quiz.id, i, 0).ok);
  // Leo answers two 3.OA.C.7 items wrong and the untagged one right (it counts for the lesson tag 3.OA.B.5).
  for (const i of [0, 1]) assert.ok(P.quizAnswer(leo, cl.id, quiz.id, i, 1).ok);
  assert.ok(P.quizAnswer(leo, cl.id, quiz.id, 4, 0).ok);
  // Kim writes the answer (the step's own tags 3.OA.D.9 and the lesson tag) and gets one item right.
  assert.ok(P.answer(kim, cl.id, write.id, 'Because 6 x 7 is 7 sixes.').ok);
  assert.ok(P.quizAnswer(kim, cl.id, quiz.id, 0, 0).ok);
  const v = CC.classView(cls.id, 'ccss-math');
  const r = row(v, '3.OA.C.7');
  assert.equal(r.by.get(mia.id).level, 'meets');
  assert.equal(r.by.get(mia.id).practiced, true, 'the game step practises it');
  assert.equal(r.by.get(leo.id).level, 'developing');
  assert.equal(r.by.get(kim.id).level, 'developing', '1 of 1 is not enough evidence');
  assert.equal(r.by.get(nora.id).level, 'none');
  assert.equal(r.answered, 6); assert.equal(r.right, 4); assert.equal(r.pct, 67);
  assert.deepEqual(r.needsLook, [leo.id]);
  assert.equal(r.meets, 1); assert.equal(r.status, 'checked');
  const b5 = row(v, '3.OA.B.5');
  assert.equal(b5.by.get(leo.id).answered, 1, 'the untagged item counts for the lesson tag');
  assert.equal(b5.by.get(mia.id).practiced, true, 'a whole-lesson tag counts on the game step');
  assert.equal(row(v, '3.OA.D.9').by.get(kim.id).practiced, true, 'the written answer, tagged on its step');
  assert.equal(row(v, '3.OA.D.9').by.get(mia.id).practiced, false);
  assert.equal(v.students.find(p => p.id === nora.id).noData, true);
  assert.equal(v.students.find(p => p.id === kim.id).noData, false);
  // The CSTA item (1B-AP-10) never shows here, and the CSTA tab is not changed by any of this.
  assert.ok(!v.rows.some(r2 => r2.id === '1B-AP-10'));
});

test('live runs: Tug of Math Live at its grade, and items with codes; Number Quest checks; other classes never count', () => {
  const run = (mode, settings, items, scores, classId = cls.id) => {
    const id = `run${uid(8)}`;
    q.run("INSERT INTO live_runs(id, host_id, class_id, audience, mode, started_at, ended_at, items, settings) VALUES (?,?,?, 'class', ?, ?, ?, ?, ?)", id, ana.id, classId, mode, Date.now() - 5000, Date.now(), JSON.stringify(items), JSON.stringify(settings));
    for (const [u, correct, answered, marks] of scores) q.run('INSERT INTO live_run_scores(run_id, user_id, score, correct, answered, marks) VALUES (?,?,?,?,?,?)', id, u.id, correct * 100, correct, answered, marks || '');
  };
  run('tug', { tug: 'tug:6:90' }, [], [[nora, 9, 10]]);
  run('quest-race', {}, [{ q: 'a', cat: '4.NBT.A.1' }, { q: 'b', cat: '4.NBT.A.1' }, { q: 'c', cat: 'RL.4.1' }], [[nora, 2, 3, '110']]);
  const elsewhere = S.createClass(ben, elm.id, { name: 'Ben 5B' }).class;
  run('tug', { tug: 'tug:6:90' }, [], [[nora, 0, 10]], elsewhere.id);
  // Number Quest: Kim completed 3.3 (practice) with 2 of 3 on its check.
  q.run('INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)', kim.id, 'number-quest', 'explorer-3.3', 'explorer', 1, 2, 2, 3, 4);
  const v = CC.classView(cls.id, 'ccss-math');
  const pct = row(v, '6.RP.A.3c');
  assert.equal(pct.sources.live, 1, 'the other class\'s run is not this class\'s');
  // 9 of 10 over grade 6's three codes: shared out (4/3/3 answered, 3/3/3 right), never 10 answers for each.
  assert.deepEqual(OT.TUG_GRADES[6].map(c => [row(v, c).by.get(nora.id).right, row(v, c).by.get(nora.id).answered]), [[3, 4], [3, 3], [3, 3]]);
  assert.equal(pct.by.get(nora.id).level, 'meets');
  const nbt = row(v, '4.NBT.A.1');
  assert.deepEqual([nbt.by.get(nora.id).right, nbt.by.get(nora.id).answered], [2, 2], 'item by item, the ELA item left out');
  const c7 = row(v, '3.OA.C.7');
  assert.deepEqual(c7.sources.courses, ['number-quest']);
  assert.deepEqual([c7.by.get(kim.id).right, c7.by.get(kim.id).answered], [3, 4], 'the quiz item + the check (2 of 3)');
  assert.equal(c7.by.get(kim.id).practiced, true);
  assert.equal(v.students.find(p => p.id === nora.id).noData, false);
  const e = CC.classView(cls.id, 'ccss-ela');
  assert.deepEqual([row(e, 'RL.4.1').by.get(nora.id).right, row(e, 'RL.4.1').by.get(nora.id).answered], [0, 1]);
});

test('rubric sources: an interface the rubrics work can feed (no tables of its own here)', () => {
  const off = CC.registerRubricSource(({ classId, framework, studentIds }) => {
    assert.equal(classId, cls.id); assert.ok(studentIds.has(leo.id));
    return framework === 'ccss-math' ? [
      { userId: leo.id, code: '3.oa.c.7', score: 2, max: 3, at: Date.now() }, // meets (2/3)
      { userId: far.id, code: '3.OA.C.7', score: 3, max: 3 },                 // not in the class: ignored
      { userId: leo.id, code: 'nope', score: 3, max: 3 },                     // unknown code: ignored
      { userId: leo.id, code: '3.OA.C.7', score: 9, max: 3 },                 // bad numbers: ignored
    ] : [];
  });
  const throwing = CC.registerRubricSource(() => { throw new Error('broken source'); });
  try {
    const r = row(CC.classView(cls.id, 'ccss-math'), '3.OA.C.7');
    assert.deepEqual(r.by.get(leo.id).rubric, { best: 2 / 3, n: 1 });
    assert.equal(r.by.get(leo.id).level, 'meets');
    assert.equal(r.rubricN, 1); assert.equal(r.rubricMean, 0.67);
  } finally { off(); throwing(); }
  assert.equal(row(CC.classView(cls.id, 'ccss-math'), '3.OA.C.7').by.get(leo.id).rubric, null, 'unregistered');
});

// ---------------------------------------------------------------- pages and who may see them
test('the class tab: teachers of the class and school admins only; everyone else 404, signed out to sign in', async () => {
  const path = `/class/${cls.id}/standards?fw=ccss-math`;
  const ok = await req(ana, path);
  assert.equal(ok.status, 200);
  assert.ok(ok.text.includes('3.OA.C.7') && ok.text.includes('Fluently multiply and divide within 100'));
  assert.ok(ok.text.includes(NOTICE), 'the CCSS notice is shown');
  assert.ok(ok.text.includes('Common Core Math') && ok.text.includes('aria-current="page"'), 'the framework picker');
  assert.ok(ok.text.includes('Mia Pupil'), 'names for the class\'s teachers (needs a look, the student picker)');
  assert.equal((await req(head, path)).status, 200, 'a school admin');
  for (const who of [ben, far, mia, kid, grownup, guest]) assert.equal((await req(who, path)).status, 404, who.username || 'guest');
  const out = await req(null, path); assert.equal(out.status, 302); assert.match(out.location, /login|signin|sign-in/);
  const one = await req(ana, `${path}&student=${mia.id}`);
  assert.equal(one.status, 200); assert.ok(one.text.includes('Mia Pupil') && one.text.includes(NOTICE));
  const ela = await req(ana, `/class/${cls.id}/standards?fw=ccss-ela`);
  assert.equal(ela.status, 200); assert.ok(ela.text.includes('W.3.2'));
});

test('the CSTA tab is unchanged (and gets the picker); the bare address opens the framework the class has work in', async () => {
  // This class's work is all Common Core Math, so the tab opens there (docs/decisions.md "Teacher quick wins", m).
  const bare = await req(ana, `/class/${cls.id}/standards`);
  assert.equal(bare.status, 302); assert.equal(bare.location, `/class/${cls.id}/standards?fw=ccss-math`);
  const r = await req(ana, `/class/${cls.id}/standards?fw=csta`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes('csq-std'), 'the CSTA view');
  assert.ok(!r.text.includes('3.OA.C.7'), 'no Common Core rows in it');
  assert.ok(r.text.includes(`/class/${cls.id}/standards?fw=ccss-math`), 'the picker links to Common Core');
  assert.ok(r.text.includes(`<a class="chip on" href="/class/${cls.id}/standards?fw=csta" aria-current="page">`), 'and names CSTA itself');
  assert.equal((await req(ana, `/class/${cls.id}/standards?fw=bogus`)).status, 200, 'an unknown framework is the CSTA tab');
  assert.equal((await req(ben, `/class/${cls.id}/standards`)).status, 404);
});

test('the CSV and the JSON: counts only in the CSV, formula safe, the notice; the same people only', async () => {
  const csv = await req(ana, `/class/${cls.id}/standards.csv?fw=ccss-math`);
  assert.equal(csv.status, 200); assert.match(csv.type, /text\/csv/);
  assert.ok(csv.text.includes('3.OA.C.7') && csv.text.includes('Copyright 2010'));
  assert.ok(!csv.text.includes('Mia Pupil') && !csv.text.includes('Leo Pupil'), 'no student names');
  for (const who of [ben, mia, kid, guest]) assert.equal((await req(who, `/class/${cls.id}/standards.csv?fw=ccss-math`)).status, 404);
  const api = await req(ana, `/api/classes/${cls.id}/standards?fw=ccss-math`);
  assert.equal(api.status, 200);
  const j = JSON.parse(api.text);
  assert.equal(j.notice, NOTICE);
  assert.equal(j.rows.find(r => r.code === '3.OA.C.7').students[mia.id].level, 'meets');
  for (const who of [ben, mia, kid, grownup, guest]) assert.equal((await req(who, `/api/classes/${cls.id}/standards?fw=ccss-math`)).status, 404);
  assert.equal((await req(null, `/api/classes/${cls.id}/standards?fw=ccss-math`)).status, 401);
  assert.equal((await req(ana, `/api/classes/${cls.id}/standards?fw=csta`)).status, 400);
});

test('the lesson picker page and its APIs: the lesson\'s editors; colleagues see shared lessons read-only; others 404', async () => {
  const path = `/teach/lessons/${lesson.id}/standards?fw=ccss-math&grade=3&domain=OA&q=multiply`;
  const page = await req(ana, path);
  assert.equal(page.status, 200);
  assert.ok(page.text.includes('3.OA.C.7') && page.text.includes(NOTICE));
  assert.ok(page.text.includes(`data-api="/api/lessons/${lesson.id}/standards"`), 'add buttons');
  for (const who of [ben, far, mia, kid, grownup, guest]) assert.equal((await req(who, path)).status, 404, who.username || 'guest');
  assert.equal((await req(null, path)).status, 302);
  // shared with the school: a colleague sees what is tagged, without the picker
  q.run('UPDATE lessons SET shared=1 WHERE id=?', lesson.id);
  const seen = await req(ben, path);
  assert.equal(seen.status, 200); assert.ok(seen.text.includes('3.OA.B.5')); assert.ok(!seen.text.includes('data-api="/api/lessons/'));
  q.run('UPDATE lessons SET shared=0 WHERE id=?', lesson.id);
  // the APIs
  const add = await req(ana, `/api/lessons/${lesson.id}/standards`, { method: 'POST', body: { framework: 'ccss-math', code: '3.oa.a.1', stepId: '' } });
  assert.equal(add.status, 200); assert.equal(JSON.parse(add.text).code, '3.OA.A.1');
  assert.equal((await req(ana, `/api/lessons/${lesson.id}/standards`, { method: 'POST', body: { framework: 'ccss-math', code: 'XX' } })).status, 400);
  for (const who of [ben, mia, kid, guest]) {
    assert.equal((await req(who, `/api/lessons/${lesson.id}/standards`, { method: 'POST', body: { framework: 'ccss-math', code: '3.OA.A.2' } })).status, 404, who.username || 'guest');
    assert.equal((await req(who, `/api/lessons/${lesson.id}/standards/remove`, { method: 'POST', body: { framework: 'ccss-math', code: '3.OA.A.1' } })).status, 404);
  }
  assert.equal((await req(null, `/api/lessons/${lesson.id}/standards`, { method: 'POST', body: { framework: 'ccss-math', code: '3.OA.A.2' } })).status, 401);
  const rm = await req(ana, `/api/lessons/${lesson.id}/standards/remove`, { method: 'POST', body: { framework: 'ccss-math', code: '3.OA.A.1', stepId: '' } });
  assert.equal(JSON.parse(rm.text).removed, true);
  // search: staff only
  const s = await req(ben, '/api/standards/search?fw=ccss-ela&grade=3&q=main%20idea');
  assert.equal(s.status, 200); assert.ok(JSON.parse(s.text).list.some(x => x.code === 'RI.3.2'));
  for (const who of [mia, kid, grownup, guest]) assert.equal((await req(who, '/api/standards/search?fw=ccss-math')).status, 404);
  assert.equal((await req(ben, '/api/standards/games/sum-racer')).status, 200);
  assert.equal((await req(mia, '/api/standards/games/sum-racer')).status, 404);
});

test('the lesson editor shows the tags and links to the picker; students never see codes', async () => {
  const ed = await req(ana, `/teach/lessons/${lesson.id}`);
  assert.equal(ed.status, 200);
  assert.ok(ed.text.includes(`/teach/lessons/${lesson.id}/standards`));
  assert.ok(ed.text.includes('3.OA.B.5'), 'the whole-lesson tag');
  assert.ok(ed.text.includes('3.OA.D.9'), 'the step tag on its step card');
  const kidPage = await req(mia, `/class/${cls.id}/lessons/${cl.id}`);
  assert.equal(kidPage.status, 200);
  assert.ok(!kidPage.text.includes('3.OA.') && !kidPage.text.includes('W.3.2'), 'the student lesson page has no codes');
});

test('a Tug of Math step practises its lesson\'s grade only (never all eight grades at once)', () => {
  const tug = seed('tug-of-math', 'Tug of Math');
  const graded = L.createLesson(ana, elm.id, { title: 'Tug', grade: 'Grade 6' }).lesson;
  L.addStep(ana, graded.id, { kind: 'game', title: 'Tug', gameId: tug.id });
  const plain = L.createLesson(ana, elm.id, { title: 'Tug again' }).lesson;
  L.addStep(ana, plain.id, { kind: 'game', title: 'Tug', gameId: tug.id });
  const c2 = S.createClass(ana, elm.id, { name: 'Ana 6T' }).class;
  L.assign(ana, c2.id, graded.id); L.assign(ana, c2.id, plain.id);
  const v = CC.classView(c2.id, 'ccss-math');
  assert.deepEqual(v.rows.map(r => r.id).sort(), [...OT.TUG_GRADES[6]].sort());
  assert.deepEqual(OT.stepGameCodes('tug-of-math', 'ccss-math', ''), []);
  assert.deepEqual(OT.stepGameCodes('tug-of-math', 'ccss-ela', '6'), []);
});

test('levelled games: a step practises only its lesson\'s grade or its locked track; otherwise coverage only', async () => {
  const ff = seed('fraction-factory', 'Fraction Factory');
  const c4 = S.createClass(ana, elm.id, { name: 'Ana 4L' }).class;
  const sam = S.createSchoolAccount(ana, elm.id, { rosterName: 'Sam Pupil' }).user; S.addToClass(ana, c4.id, sam.id);
  const mk = (title, grade, gameId, options) => { const l = L.createLesson(ana, elm.id, { title, grade }).lesson;
    const st = L.addStep(ana, l.id, { kind: 'game', title, gameId, options }).step; return { l, st, cl: L.assign(ana, c4.id, l.id).classLesson }; };
  const g4 = mk('Race at grade 4', 'Grade 4', sumRacer.id);
  const plain = mk('Race, no grade', '', sumRacer.id);
  const locked = mk('Race, track 9', '', sumRacer.id, 'level=9&lock=1');
  const fr = mk('Fractions', '3', ff.id);
  for (const x of [g4, plain, locked, fr]) assert.ok(P.gameScore(sam, x.cl.id, x.st.id, 5, '5').ok);
  const v = CC.classView(c4.id, 'ccss-math');
  const at = id => row(v, id) && row(v, id).by.get(sam.id);
  // A grade 4 lesson with a Sum Racer step never marks grade 1 codes as practised.
  assert.equal(at('4.NBT.B.4').practiced, true);
  assert.equal(at('1.OA.C.6').practiced, false, 'grade 1: not practised');
  assert.equal(at('2.NBT.B.5').practiced, false);
  assert.ok(!row(v, '1.OA.C.6').sources.lessons.includes(g4.cl.id), 'nor covered by the grade 4 lesson');
  assert.ok(row(v, '1.OA.C.6').sources.lessons.includes(plain.cl.id), 'the ungraded lesson covers it (coverage only)');
  assert.equal(row(v, '1.OA.C.6').practiced, 0);
  assert.equal(at('3.NBT.A.1').practiced, true, 'the step locked to track 9 practises its code');
  assert.equal(at('3.OA.C.7').practiced, false, 'no step plays a grade 3 times-table track');
  assert.equal(at('3.NF.A.1').practiced, true, 'Fraction Factory at grade 3');
  assert.ok(!row(v, '4.NF.B.3'), 'not its grade 4 chapters (not even covered: the lesson has a grade)');
  assert.ok(!row(v, '2.G.A.3'), 'nor its grade 2 chapter');
  assert.deepEqual(OT.stepGameCodes('fraction-factory', 'ccss-math', '', 'chapter=recipe&lock=1'), ['4.NF.B.3']);
  assert.deepEqual(OT.stepGameCodes('fraction-factory', 'ccss-math', '', 'chapter=recipe'), [], 'not locked: not known');
  assert.deepEqual(OT.stepGameCodes('word-trail', 'ccss-ela', '2'), ['RF.2.3f']);
  assert.deepEqual(OT.stepGameCodes('word-trail', 'ccss-ela', ''), []);
  assert.deepEqual(OT.stepGameCover('word-trail', 'ccss-ela', ''), OT.gameCodes('word-trail', 'ccss-ela'));
  assert.deepEqual(OT.stepGameCodes('shark-plank', 'ccss-ela', ''), OT.gameCodes('shark-plank', 'ccss-ela'), 'a one-level game: all its codes');
  // The lesson editor shows the same codes as the Standards tab: the grade's, or a hint to set a grade.
  const ed4 = await req(ana, `/teach/lessons/${g4.l.id}`);
  assert.ok(ed4.text.includes('4.NBT.B.4') && !ed4.text.includes('1.OA.C.6'), 'grade 4 only in the editor');
  const edPlain = await req(ana, `/teach/lessons/${plain.l.id}`);
  assert.ok(!edPlain.text.includes('1.OA.C.6'), 'no codes until the lesson has a grade');
  assert.ok(edPlain.text.includes('Give the lesson a grade'), 'and a hint to give it one');
});

test('Number Quest: own-account students count from when they joined; one check alone never meets', () => {
  const c5 = S.createClass(ana, elm.id, { name: 'Ana NQ' }).class;
  const own = S.createSchoolAccount(ana, elm.id, { rosterName: 'Olu Pupil' }).user; S.addToClass(ana, c5.id, own.id);
  const sch = S.createSchoolAccount(ana, elm.id, { rosterName: 'Sol Pupil' }).user; S.addToClass(ana, c5.id, sch.id);
  // Olu stands for a student who joined with their own account (no school owns it), on day 1000.
  q.run("UPDATE users SET managed_school='' WHERE id=?", own.id);
  q.run('UPDATE class_members SET joined_at=? WHERE class_id=? AND user_id=?', 1000, c5.id, own.id);
  const nq = (u, step, at, score) => q.run('INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)', u.id, 'number-quest', step, 'explorer', at, at, score, at, at);
  nq(own, 'explorer-2.1', 500, 3);   // home work before joining: not this class's
  nq(own, 'explorer-3.3', 2000, 3);  // after joining: counts
  nq(sch, 'explorer-2.1', 5, 3);     // a school account: counts whenever
  const v = CC.classView(c5.id, 'ccss-math');
  const at = (id, u) => row(v, id) && row(v, id).by.get(u.id);
  assert.equal(at('3.NBT.A.2', own).answered, 0, 'home work before joining is left out');
  assert.equal(at('3.NBT.A.2', own).practiced, false);
  assert.deepEqual([at('3.OA.C.7', own).right, at('3.OA.C.7', own).answered], [3, 3]);
  assert.equal(at('3.OA.C.7', own).level, 'developing', 'one 3/3 check alone is not enough to meet');
  assert.equal(at('3.NBT.A.2', sch).level, 'developing');
  nq(sch, 'explorer-2.2', 6, 3);     // a second check on 3.NBT.A.2
  const v2 = CC.classView(c5.id, 'ccss-math');
  assert.equal(row(v2, '3.NBT.A.2').by.get(sch.id).level, 'meets', 'two checks do');
});

test('Learn: staff see each official game\'s codes and can filter by a code; kids and visitors never see codes', async () => {
  q.run("UPDATE games SET shelf='learn' WHERE slug IN ('sum-racer', 'word-trail', 'tug-of-math')");
  const staffPage = await req(ana, '/learn');
  assert.equal(staffPage.status, 200);
  assert.ok(staffPage.text.includes('3.OA.C.7') && staffPage.text.includes('RF.K.3c'), 'codes on the cards');
  assert.ok(staffPage.text.includes(NOTICE) && staffPage.text.includes('name="std"'));
  const only = await req(ana, '/learn?std=RF.K');
  assert.ok(only.text.includes('/play/word-trail') && !only.text.includes('/play/sum-racer'), 'filtered to Word Trail');
  const code = await req(ana, '/learn?std=3.oa.c.7');
  assert.ok(code.text.includes('/play/sum-racer') && !code.text.includes('/play/word-trail'));
  for (const who of [mia, kid, null]) {
    const r = await req(who, '/learn?std=RF.K');
    assert.equal(r.status, 200);
    assert.ok(!r.text.includes('3.OA.C.7') && !r.text.includes('RF.K.3c') && !r.text.includes('name="std"'), who ? who.username : 'visitor');
    assert.ok(r.text.includes('/play/sum-racer') || r.text.includes('sum-racer'), 'the filter is ignored for them');
  }
});
