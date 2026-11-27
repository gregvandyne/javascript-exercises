// Grammar Lab, Phase 3 (services/grammar-lab-assign.js, routes/grammar-lab-teach.js, services/grammar-lab-access.js
// reachOf, services/grammar-lab.js placeOf): flag reach for assigned students (an allowed teacher's class gets what was
// assigned, nothing else; the flag off is a 404 for everyone), assigning and completing a unit, a topic and a proofread
// room (done only by mastery, or a room passed on the server at 80%), the class grid and the student view (counts and
// states, roster order, no ranking), placement (grade-seeded, the teacher's override absolute, a first visit opens the
// student's band), the plan gate (none: as for the other courses), and a guest's passed room carried over at sign-in.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { createApp } = await import('../../server/app.js');
const { q } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const auth = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const C = await import('../../server/services/courses.js');
const GL = await import('../../server/services/grammar-lab.js');
const GLA = await import('../../server/services/grammar-lab-assign.js');
const A = await import('../../server/services/grammar-lab-access.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const TOOLS = await import('./_tools-plan.js');
const { proofCore } = await import('../../server/services/proof-core.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); config.grammarLab = false; config.grammarLabUsers = []; TOOLS.plansOn(false); });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const H = { accept: 'text/html', 'user-agent': 'Mozilla/5.0 Chrome/141.0' };
const get = async (p, u) => { const r = await fetch(base + p, { headers: { ...H, ...(u ? { cookie: cookieFor(u.id) } : {}) }, redirect: 'manual' }); return { status: r.status, text: await r.text(), location: r.headers.get('location') }; };
const post = async (p, u, body) => {
  const r = await fetch(base + p, { method: 'POST', headers: { ...H, 'sec-fetch-site': 'same-origin', 'content-type': 'application/json', ...(u ? { cookie: cookieFor(u.id) } : {}) }, body: JSON.stringify(body) });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text };
};
const flag = (on, users = []) => { config.grammarLab = on; config.grammarLabUsers = users.map(x => x.toLowerCase()); };
const API = id => `/api/courses/grammar-lab/topic/${id}`;
const itemOf = (topic, id) => GL.topic(topic).items.find(it => it.id === id);
const rightMark = (tp, it) => (tp.format === 'fix' ? it.right : it.answer);
/** Play a topic to mastery through the quiz API, as the page does. */
async function playTopic(u, unit, topic, band = 'k-2') {
  const tp = GL.topic(topic);
  let r = await post(`${API(topic)}/start`, u, { unit, band });
  assert.equal(r.status, 200, `${topic} opens: ${r.text}`);
  let qn = r.json.question, last = null;
  for (let i = 0; i < 40 && !(last && last.mastered); i++) {
    last = (await post(`${API(topic)}/answer`, u, { unit, band, id: qn.id, marked: rightMark(tp, itemOf(topic, qn.id)) })).json;
    qn = last.question;
  }
  assert.equal(last.mastered, true, `${topic} mastered`);
  return last;
}
/** The fixes that find n of a room's planted mistakes. */
function roomFixes(id, n) {
  const PC = proofCore(), p = GL.room(id).passages[0];
  const W = PC.wrongTokens(p.x, p.m), toks = PC.tokenize(p.x);
  return p.m.slice(0, n).map((m, j) => { const a = W.findIndex(w => w.m === j); return { a, b: a + m.w.split(' ').length, s: toks.slice(m.a, m.b).map(x => x.s).join(' ') }; });
}

// A school: Tess (on GRAMMAR_LAB_USERS) teaches 2T, Una (not on it) teaches 2U. Kim and Lee are in 2T, Ola in 2U.
const boss = auth.createUser({ username: 'GlTeachBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Grammar Oak' }).school;
const tess = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Tess Teacher', role: 'teacher', username: 'gltess' }).user.id);
const una = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Una Teacher', role: 'teacher', username: 'gluna' }).user.id);
const T2 = S.createClass(boss, oak.id, { name: '2T', grade: '2', teacherId: tess.id }).class;
const U2 = S.createClass(boss, oak.id, { name: '2U', teacherId: una.id }).class;
const kim = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Kim Kid', grade: '1' }).user.id);
const lee = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Lee Kid' }).user.id);
const ola = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Ola Kid' }).user.id);
S.addToClass(boss, T2.id, kim.id); S.addToClass(boss, T2.id, lee.id); S.addToClass(boss, U2.id, ola.id);
const LIST = [tess.username, una.username];
const doneRow = (cl, u) => q.get("SELECT status FROM step_progress WHERE class_lesson_id=? AND user_id=? AND status='done'", cl, u.id);

// ------------------------------------------------------------------------------------------------- flag reach
test('flag reach: an allowed teacher\'s assignment opens what was assigned to their students, and only that', async () => {
  flag(true, [tess.username]);
  // Before anything is assigned: a student sees nothing of Grammar Lab.
  assert.equal(A.mayOpenGrammarLab(kim), false);
  assert.equal((await get('/courses/grammar-lab', kim)).status, 404);
  const r = await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'unit', unit: 'commas', band: 'k-2', to: 'all' });
  assert.equal(r.status, 200, r.text); assert.match(r.json.toast, /Commas is assigned to 2T/);
  assert.equal(A.mayOpenGrammarLab(kim), true);
  const reach = A.reachOf(kim);
  assert.equal(reach.all, false); assert.ok(reach.units.has('commas'));
  // The course page lists only the assigned unit; the unit and its first topic open; another unit is a 404.
  const course = await get('/courses/grammar-lab', kim);
  assert.equal(course.status, 200);
  assert.match(course.text, /href="\/courses\/grammar-lab\/k-2\/commas"/);
  assert.doesNotMatch(course.text, /href="\/courses\/grammar-lab\/k-2\/capital-letters"/);
  assert.match(course.text, /From your teacher/);
  assert.equal((await get('/courses/grammar-lab/k-2/commas', kim)).status, 200);
  assert.equal((await get('/courses/grammar-lab/k-2/commas/commas-in-a-series', kim)).status, 200);
  assert.equal((await get('/courses/grammar-lab/k-2/capital-letters', kim)).status, 404);
  assert.equal((await post(`${API('capitalizing-titles')}/start`, kim, { unit: 'capital-letters' })).status, 403);
  // The unit's second topic stays locked until the first is mastered (the unit's order holds for assigned work).
  assert.equal((await get('/courses/grammar-lab/k-2/commas/commas-after-starting-phrases', kim)).status, 302);
  // A student of a class whose teacher is not let in gets nothing, even with work assigned (assigned by hand here).
  const cl = GLA.cleanWhat({ what: 'unit', unit: 'commas', band: 'k-2' });
  const made = L.createLesson(una, oak.id, { title: 'Commas', kind: 'grammar' }).lesson;
  L.addGrammarStep(una, made.id, { title: 'Commas', items: cl.items });
  L.assign(una, U2.id, made.id, {});
  assert.equal(A.mayOpenGrammarLab(ola), false);
  assert.equal((await get('/courses/grammar-lab/k-2/commas', ola)).status, 404);
  assert.equal((await post('/api/grammar-lab/assign', una, { classId: U2.id, what: 'unit', unit: 'commas', band: 'k-2' })).status, 404, 'Una may not assign');
  // GRAMMAR_LAB off: a 404 for everyone, the assigned student and the teacher's pages included.
  flag(false, LIST);
  for (const [p, u] of [['/courses/grammar-lab', kim], ['/courses/grammar-lab/k-2/commas', kim], ['/teach/grammar-lab', tess], [`/class/${T2.id}/grammar-lab`, tess], ['/teach/grammar-lab', null]]) assert.equal((await get(p, u)).status, 404, p);
  assert.equal((await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'unit', unit: 'commas' })).status, 404);
  assert.doesNotMatch((await get('/learn', kim)).text, /grammar-lab/);
});

// ------------------------------------------------------------------------------------------------- assign and complete
test('a unit, a topic and a room: assigned to a class, a student or a group, done only by mastery or a passed room', async () => {
  flag(true, [tess.username]);
  // A topic for one student, with a due date; a room for the whole class.
  let r = await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'topic', unit: 'sound-alike-words', band: 'k-2', topic: 'your-and-youre', to: `desk:${lee.id}`, dueAt: '2030-01-15' });
  assert.equal(r.status, 200, r.text);
  const topicCl = L.getClassLesson(r.json.classLessonId);
  assert.ok(topicCl.due_at, 'the due date is kept');
  assert.deepEqual(L.studentsOfLesson(topicCl.id), [lee.id]);
  assert.equal(A.reachOf(kim).topics.has('your-and-youre'), false, 'not Kim\'s');
  r = await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'room', unit: 'capital-letters', band: 'k-2', topic: 'capitalizing-titles', to: 'all' });
  assert.equal(r.status, 200, r.text);
  const roomCl = L.getClassLesson(r.json.classLessonId);
  assert.equal(L.getLesson(roomCl.lesson_id).title, 'Proofread: Rules of Capitalizing Titles');
  // Bad requests: no room on that topic, a date that is not one, someone not in the class.
  assert.equal((await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'room', unit: 'commas', band: 'k-2', topic: 'commas-after-starting-phrases' })).json.code, 'noRoom');
  assert.equal((await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'topic', unit: 'commas', topic: 'commas-in-a-series', dueAt: 'soon' })).json.code, 'badDate');
  assert.equal((await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'topic', unit: 'commas', topic: 'commas-in-a-series', to: `desk:${ola.id}` })).json.code, 'notInClass');
  // It shows on the class page and the student's lesson page; opening it completes nothing.
  const classPage = await get(`/class/${T2.id}`, lee);
  assert.ok(classPage.text.includes(`/class/${T2.id}/lessons/${topicCl.id}`), 'on the class page');
  assert.ok(P.toDoFor(T2.id, lee.id).some(x => (x.cl ? x.cl.id : x.id) === topicCl.id), 'on the To do list');
  assert.match((await get('/classes', lee)).text, /&quot;Your&quot; vs\. &quot;You&#39;re&quot;|"Your" vs/);
  const lessonPage = await get(`/class/${T2.id}/lessons/${topicCl.id}`, lee);
  assert.equal(lessonPage.status, 200);
  assert.match(lessonPage.text, /Open in Grammar Lab/);
  assert.match(lessonPage.text, /href="\/courses\/grammar-lab\/k-2\/sound-alike-words\/your-and-youre"/);
  assert.equal(doneRow(topicCl.id, lee), undefined);
  // Mark done is refused: only the course completes it.
  const step = L.steps(topicCl.lesson_id)[0];
  assert.equal(P.markDone(lee, topicCl.id, step.id).ok, false);
  // Lee masters the topic: the assignment is done.
  await playTopic(lee, 'sound-alike-words', 'your-and-youre');
  assert.ok(doneRow(topicCl.id, lee), 'the topic is done once mastered');
  // The room: a hand-in under 80% does not pass it; finding at least the need does, on the server.
  const id = 'capitalizing-titles', need = GL.room(id).need, all = GL.room(id).passages[0].m.length;
  assert.ok(need / all >= 0.8 && (need - 1) / all < 0.8, 'the need is 80% of the mistakes');
  GL.roomOpen(kim, id);
  let h = await post(`${API(id)}/room`, kim, { unit: 'capital-letters', edits: [roomFixes(id, need - 1)], handIn: true });
  assert.equal(h.status, 200, h.text); assert.equal(h.json.passed, false);
  assert.equal(doneRow(roomCl.id, kim), undefined, 'not passed: not done');
  GL.roomOpen(kim, id);
  h = await post(`${API(id)}/room`, kim, { unit: 'capital-letters', edits: [roomFixes(id, need)], handIn: true });
  assert.equal(h.json.passed, true);
  assert.ok(doneRow(roomCl.id, kim), 'the room is done once passed');
  assert.equal(GL.masteredSet(kim).has(id), false, 'a room never masters its topic');
  // A unit of two topics, for a group: done only when both are mastered.
  q.run(`INSERT INTO homeroom_rooms(class_id, preset, seats, groups, members, area, teams, created_at, updated_at) VALUES (?, 'rows', '{}', ?, ?, '{}', '[]', 0, 0)
    ON CONFLICT(class_id) DO UPDATE SET groups=excluded.groups, members=excluded.members`, T2.id, JSON.stringify([{ id: 'g1', key: 'stretch', name: 'Owls', color: '#8C6BD1' }]), JSON.stringify({ [kim.id]: 'g1' }));
  r = await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'unit', unit: 'verbs-and-time', band: 'k-2', to: 'group:g1' });
  assert.equal(r.status, 200, r.text);
  const unitCl = L.getClassLesson(r.json.classLessonId);
  assert.deepEqual(L.studentsOfLesson(unitCl.id), [kim.id]);
  await playTopic(kim, 'verbs-and-time', 'identifying-action-verbs');
  assert.equal(doneRow(unitCl.id, kim), undefined, 'one topic of two: not done');
  assert.match(q.get('SELECT answer FROM step_progress WHERE class_lesson_id=? AND user_id=?', unitCl.id, kim.id).answer, /"done":1,"total":2/);
  await playTopic(kim, 'verbs-and-time', 'using-simple-tenses');
  assert.ok(doneRow(unitCl.id, kim), 'both mastered: the unit is done');
  // A topic mastered before it was assigned counts at once.
  r = await post('/api/grammar-lab/assign', tess, { classId: T2.id, what: 'topic', unit: 'kinds-of-words', band: 'k-2', topic: 'identifying-action-verbs', to: `desk:${kim.id}` });
  assert.ok(doneRow(r.json.classLessonId, kim));
  // The Hub hands a unit out the same way (a homeroom_handouts row on the same class assignment).
  config.homeroom = true; config.homeroomUsers = ['*'];
  TOOLS.plansOn(); TOOLS.givePlan(tess.id);
  try {
    const ho = HO.handOutGrammar(tess, T2, { key: 'k-2/adjectives-and-adverbs', to: { kind: 'desk', id: lee.id } });
    assert.ok(ho.ok, JSON.stringify(ho)); assert.equal(ho.n, 2, 'the K-2 unit: Identifying Adjectives and Identifying Adverbs');
    const desk = HO.deskView(T2, lee);
    const card = desk.find(x => x.id === ho.classLesson.id);
    assert.ok(card && card.grammar, 'on the desk'); assert.equal(card.href, '/courses/grammar-lab/k-2/adjectives-and-adverbs'); assert.equal(card.done, false);
    const topicCard = desk.find(x => x.id === topicCl.id);
    assert.ok(topicCard && topicCard.done, 'the topic assigned in Classroom shows on the desk, done');
    assert.equal(HO.handOutGrammar(tess, T2, { key: 'k-2/nope', to: { kind: 'all' } }).ok, false);
    // The Hub's Find lessons catalog lists the units (a Grammar Lab chip and section), and its API hands one out.
    const hub = await get(`/class/${T2.id}/hub`, tess);
    assert.equal(hub.status, 200);
    assert.match(hub.text, /data-hritem="T:gl:k-2\/commas"/); assert.match(hub.text, /data-csubj="grammar"/); assert.match(hub.text, /data-csec="grammar"/);
    const api = await post(`/api/homeroom/${T2.id}/handouts`, tess, { grammar: 'k-2/capital-letters', to: { kind: 'desk', id: lee.id }, order: 'in', grade: 'completion' });
    assert.equal(api.status, 200, api.text); assert.match(api.json.toast, /Capital Letters/);
    // Una (not let in) gets no Grammar Lab in her catalog, and her hand-out is refused.
    TOOLS.givePlan(una.id);
    assert.doesNotMatch((await get(`/class/${U2.id}/hub`, una)).text, /T:gl:/);
    assert.equal((await post(`/api/homeroom/${U2.id}/handouts`, una, { grammar: 'k-2/commas', to: { kind: 'all' } })).status, 400);
  } finally { config.homeroom = false; config.homeroomUsers = []; TOOLS.plansOn(false); }
});

// ------------------------------------------------------------------------------------------------- the teacher's views
test('the class grid: students by topics of the assigned units, not started / level X of 3 / mastered, a room mark; filters', async () => {
  flag(true, [tess.username]);
  // Lee started Commas in a Series (one right answer: level 1).
  const st = await post(`${API('commas-in-a-series')}/start`, lee, { unit: 'commas', band: 'k-2' });
  const it = itemOf('commas-in-a-series', st.json.question.id);
  await post(`${API('commas-in-a-series')}/answer`, lee, { unit: 'commas', band: 'k-2', id: it.id, marked: it.answer });
  const g = GLA.classGrid(T2);
  assert.deepEqual(g.students.map(s => s.name), ['Kim Kid', 'Lee Kid'], 'roster order, by name');
  assert.ok(g.units.some(u => u.id === 'commas') && g.units.some(u => u.id === 'verbs-and-time') && g.units.some(u => u.id === 'capital-letters'));
  const kimRow = g.students.find(s => s.id === kim.id), leeRow = g.students.find(s => s.id === lee.id);
  assert.equal(kimRow.cells['using-simple-tenses'].state, 'mastered');
  assert.equal(leeRow.cells['commas-in-a-series'].state, 'started'); assert.equal(leeRow.cells['commas-in-a-series'].level, 1); assert.equal(leeRow.cells['commas-in-a-series'].levels, 3);
  assert.equal(leeRow.cells['using-simple-tenses'].state, 'none');
  assert.equal(kimRow.cells['capitalizing-titles'].room.passed, true, 'the room badge');
  assert.deepEqual(g.counts['using-simple-tenses'], { mastered: 1, started: 0 });
  // Filters: by unit, by band.
  assert.deepEqual(GLA.classGrid(T2, { unit: 'commas' }).units.map(u => u.id), ['commas']);
  assert.ok(GLA.classGrid(T2, { band: 'k-2' }).units.length >= 3);
  assert.deepEqual(GLA.classGrid(T2, { band: '9-12' }).units.map(u => u.id).length, GLA.classGrid(T2).units.length, 'a band with nothing assigned is no filter');
  // The page: in the class's Progress tab, never a ranking; the Progress page links it.
  const page = await get(`/class/${T2.id}/grammar-lab?unit=commas`, tess);
  assert.equal(page.status, 200);
  assert.match(page.text, /Grammar Lab progress/); assert.match(page.text, /Level 1 of 3/); assert.match(page.text, /never ranked/);
  assert.doesNotMatch(page.text, /\brank(ing)?\b(?! )|leaderboard|top student/i);
  assert.match((await get(`/class/${T2.id}/progress`, tess)).text, /id="glt-progress-link"/);
  assert.equal((await get(`/class/${T2.id}/grammar-lab`, una)).status, 404, 'another teacher');
  assert.equal((await get(`/class/${T2.id}/grammar-lab`, kim)).status, 404, 'a student');
});
test('the student view: each unit with its ring, its topics with status, attempts, wrong answers and the last activity', async () => {
  flag(true, [tess.username]);
  // Lee gets one wrong answer on Commas in a Series.
  const run = GL.currentRun(lee, 'commas-in-a-series'), it = itemOf('commas-in-a-series', GL.questionFor(GL.topic('commas-in-a-series'), run).id);
  await post(`${API('commas-in-a-series')}/answer`, lee, { unit: 'commas', band: 'k-2', id: it.id, marked: [it.answer[0] === 0 ? 1 : 0] });
  const v = GLA.studentView(T2, GLA.studentIn(T2, lee.id));
  const commas = v.units.find(u => u.id === 'commas');
  assert.equal(commas.total, 2); assert.equal(commas.done, 0);
  const t1 = commas.topics.find(x => x.id === 'commas-in-a-series');
  assert.equal(t1.state, 'started'); assert.equal(t1.attempts, 1); assert.equal(t1.wrong, 1); assert.ok(t1.last > 0);
  const sound = v.units.find(u => u.id === 'sound-alike-words');
  assert.equal(sound.done, 1); assert.equal(sound.topics[0].state, 'mastered'); assert.equal(sound.topics[0].wrong, 0);
  const page = await get(`/class/${T2.id}/grammar-lab/${lee.id}`, tess);
  assert.equal(page.status, 200);
  assert.match(page.text, /Lee Kid in Grammar Lab/); assert.match(page.text, /Wrong answers/); assert.match(page.text, /aria-label="1 of 1 topics mastered"/);
  assert.equal((await get(`/class/${T2.id}/grammar-lab/${ola.id}`, tess)).status, 404, 'not in the class');
});

// ------------------------------------------------------------------------------------------------- placement
test('placement: seeded by grade (to 12), the teacher\'s band is absolute, a first visit opens the student\'s band', async () => {
  flag(true, ['*']);
  // Kim's roster grade is 1: K-2. Lee has none here, but the class is grade 2.
  assert.deepEqual([GL.placeOf(kim).band, GL.placeOf(kim).from, GL.placeOf(kim).gradeFrom], ['k-2', 'grade', 'school']);
  assert.deepEqual([GL.placeOf(lee).band, GL.placeOf(lee).gradeFrom], ['k-2', 'class']);
  // Number Quest's declared grade seeds it too, and moves past 8 here (the cap-12 helper).
  const solo = auth.createUser({ username: `glsolo${Date.now() % 1e6}`, password: 'correct-horse-12' });
  assert.equal(GL.placeOf(solo).band, null);
  q.run("INSERT INTO nq_placement(user_id, course, grade, grade_declared_at, rungs, start_node, source, updated_at) VALUES (?, 'number-quest', 8, ?, '{}', NULL, 'override', 0)", solo.id, Date.UTC(2025, 5, 1));
  assert.equal(GL.gradeOf(solo).grade, GL.deriveGrade(8, Date.UTC(2025, 5, 1)));
  assert.equal(GL.placeOf(solo).band, GL.bandOfGrade(GL.gradeOf(solo).grade));
  // A grade the student declares wins over the others.
  assert.equal((await post('/api/courses/grammar-lab/grade', solo, { grade: '4' })).json.place.band, '3-5');
  assert.equal(GL.placeOf(solo).gradeFrom, 'declared');
  // The course page opens their band first, marked, the others folded under Other grades.
  const pg = await get('/courses/grammar-lab', kim);
  assert.match(pg.text, /<section class="gl-bandsec gl-band-k-2" id="gl-sec-k-2"[^>]*>.*?Your grades/s);
  assert.match(pg.text, /Other grades/); assert.match(pg.text, /<details class="gl-bandsec gl-bandfold gl-band-3-5"/);
  // Nothing known: the grade question; a guest's pick opens that band for this visit only.
  const fresh = auth.createUser({ username: `glfresh${Date.now() % 1e6}`, password: 'correct-horse-12' });
  assert.match((await get('/courses/grammar-lab', fresh)).text, /Which grade are you in\?/);
  const guest = auth.createGuest();
  const gp = await get('/courses/grammar-lab?grade=7', guest);
  assert.match(gp.text, /id="gl-sec-6-8"[^>]*>.*?Your grades|id="gl-sec-6-8"/s);
  assert.doesNotMatch(gp.text, /Which grade are you in/);
  assert.equal(GL.declareGrade(guest, 7), null, 'a guest has no stored grade');
  assert.equal(q.get('SELECT 1 x FROM grammar_lab_place WHERE user_id=?', guest.id), undefined);
  // The teacher's band is absolute: over the grade, and the course page opens it.
  flag(true, [tess.username]);
  let r = await post(`/api/class/${T2.id}/grammar-lab/band`, tess, { student: kim.id, band: '6-8' });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.place.band, '6-8'); assert.equal(r.json.place.from, 'teacher');
  assert.equal(GL.placeOf(kim).band, '6-8');
  GL.declareGrade(kim, 1);
  assert.equal(GL.placeOf(kim).band, '6-8', 'a grade declared later does not move a teacher\'s band');
  assert.match((await get(`/class/${T2.id}/grammar-lab/${kim.id}`, tess)).text, /Grades 6-8, set by a teacher/);
  // Back to the grade; another teacher, a band that is not one, a student of another class: refused.
  r = await post(`/api/class/${T2.id}/grammar-lab/band`, tess, { student: kim.id, band: '' });
  assert.equal(GL.placeOf(kim).band, 'k-2');
  assert.equal((await post(`/api/class/${T2.id}/grammar-lab/band`, una, { student: kim.id, band: '3-5' })).status, 404);
  assert.equal((await post(`/api/class/${T2.id}/grammar-lab/band`, tess, { student: kim.id, band: '13' })).status, 400);
  assert.equal((await post(`/api/class/${T2.id}/grammar-lab/band`, tess, { student: ola.id, band: '3-5' })).status, 400);
});

// ------------------------------------------------------------------------------------------------- the plan gate
test('plan gate: none, as for the other courses: a teacher without the Teacher plan assigns while paid plans are on', async () => {
  // Vic teaches 3V, is on the list and has no Teacher plan, with paid plans on for everyone.
  const vic = auth.getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Vic Teacher', role: 'teacher', username: 'glvic' }).user.id);
  const V3 = S.createClass(boss, oak.id, { name: '3V', teacherId: vic.id }).class;
  flag(true, [vic.username]);
  TOOLS.plansOn();
  try {
    const { teacherPlan } = await import('../../server/services/teacher-plan.js');
    const { toolAccess } = await import('../../server/services/teacher-tools.js');
    assert.equal(teacherPlan(vic.id).entitled, false);
    assert.equal(toolAccess(vic), 'plan', 'the paid teaching tools would send her to the plan page');
    const r = await post('/api/grammar-lab/assign', vic, { classId: V3.id, what: 'unit', unit: 'adjectives-and-adverbs', band: 'k-2', to: 'all' });
    assert.equal(r.status, 200, r.text);
    // The teacher page shows for her too, with its Assign buttons.
    const page = await get('/teach/grammar-lab', vic);
    assert.equal(page.status, 200); assert.match(page.text, /data-glassign/); assert.doesNotMatch(page.text, /Teacher plan/);
  } finally { TOOLS.plansOn(false); }
});

// ------------------------------------------------------------------------------------------------- the entry points
test('entry points: a Learn card for whoever Grammar Lab lets in (Assign for teachers), the Hub catalog\'s units; never public lists', async () => {
  flag(true, [tess.username]);
  const learnT = await get('/learn', tess);
  assert.match(learnT.text, /id="gl-learn-assign"[^>]*href|href="\/teach\/grammar-lab"/);
  assert.match(learnT.text, /\/covers\/grammar-lab\.jpg/);
  const learnK = await get('/learn', kim);
  assert.match(learnK.text, /id="gl-learn-go"/);
  assert.doesNotMatch((await get('/learn', ola)).text, /gl-learn/);
  // The teacher page lists the band's units with Assign unit / topic / proofread room.
  const tp = await get('/teach/grammar-lab?band=k-2', tess);
  assert.match(tp.text, /data-what="unit" data-unit="commas"/); assert.match(tp.text, /data-what="room" data-unit="capital-letters" data-band="k-2" data-topic="capitalizing-titles"/);
  // Never in the sitemap or the public games search.
  assert.doesNotMatch((await get('/sitemap.xml')).text, /grammar-lab/);
  assert.doesNotMatch((await get('/search?q=grammar')).text, /\/courses\/grammar-lab/);
});

// ------------------------------------------------------------------------------------------------- guest carry-over
test('a guest\'s passed room is carried over at sign-in, as their mastery is', async () => {
  flag(true, ['*']);
  const guest = auth.createGuest();
  const id = 'your-and-youre', unit = 'sound-alike-words';
  GL.roomOpen(guest, id);
  const h = await post(`${API(id)}/room`, guest, { unit, edits: [roomFixes(id, GL.room(id).need)], handIn: true });
  assert.equal(h.status, 200, h.text); assert.equal(h.json.passed, true);
  assert.ok(GL.roomPassedSet(guest).has(id), 'the guest sees it passed for this sitting');
  assert.ok(q.get("SELECT 1 FROM course_pending_wins WHERE user_id=? AND course='grammar-lab' AND step=?", guest.id, `room:${id}`), 'a pending win');
  assert.equal(GL.pendingSet(guest).has(`room:${id}`), false, 'not a topic waiting');
  // The guest signs in to their own account: the pending facts move there and are honored.
  const acct = auth.createUser({ username: `glcarry${Date.now() % 1e6}`, password: 'correct-horse-12' });
  C.transferPendingWins(guest.id, acct.id);
  const applied = C.applyPendingWins(acct);
  assert.ok(applied.some(x => x.step === `room:${id}`));
  assert.ok(GL.roomPassedSet(acct).has(id), 'the room is passed on the account');
  assert.equal(GL.masteredSet(acct).has(id), false, 'and the topic is not mastered by it');
});
