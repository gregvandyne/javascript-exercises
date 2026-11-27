// Oomba's actions for assignments, lessons and the things a teacher made (services/companion-actions/assignments.js:
// assignLesson, assignWorksheet, assignBoard, createUnit, renameUnit, reorderAssignment, postToClassroom;
// services/companion-actions/made.js: renameWorksheet, deleteWorksheet, renameBoard, duplicateBoard, deleteBoard,
// duplicateLesson, deleteLesson). Each: the card first and nothing before the tap, the tap does it with the page's own
// service (read back), Undo where there is one, refusals that end "Nothing was changed.". Google Classroom is the fakes
// in tests/support (fake-google.js, fake-classroom.js), as in tests/unit/gclassroom.test.js.
// Harness: tests/unit/_companion-actions-harness.js.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const { startFakeGoogle } = await import('../support/fake-google.js');
const { startFakeClassroom } = await import('../support/fake-classroom.js');
const fake = await startFakeGoogle();
const room = await startFakeClassroom();
const KEY = 'b'.repeat(64); // a fake test key
process.env.GOOGLE_CLIENT_ID = 'test-client.apps.googleusercontent.com';
process.env.GOOGLE_CLIENT_SECRET = 'fake-test-secret';
process.env.GOOGLE_OIDC_BASE = fake.url;
process.env.GOOGLE_TOKEN_KEY = KEY;
process.env.CLASSROOM_API_BASE = room.url;
const H = await import('./_companion-actions-harness.js');
const { config, parseTokenKey } = await import('../../server/config.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const F = await import('../../server/services/figures.js');
const M = await import('../../server/services/manipulatives.js');
const GC = await import('../../server/services/gclassroom.js');
H.boot();
test.after(async () => { await fake.close(); await room.close(); });

const day = ms => (ms === null || ms === undefined ? null : new Date(ms).toISOString().slice(0, 10));
const lessonIn = (classId, lessonId) => L.classLessons(classId).find(cl => cl.lesson_id === lessonId) || null;
const canUndo = async (x, turnId) => (await H.post('/api/companion/chat/undo', { turnId }, x.tc)).status === 200;
function sheet(x, title = 'Chat sheet') {
  const gen = F.genCatalog({ grade: '3' })[0];
  const w = F.createWorksheet(x.teacher, { title, grade: '3', items: [{ kind: F.genOf(gen.id).kind, gen: gen.id, seed: 3 }] });
  assert.ok(w.ok, JSON.stringify(w));
  return w.id;
}
function board(x, title = 'Bead board', tool = 'rekenreks') {
  const b = M.saveBoard(x.teacher, { tool, title, state: {} });
  assert.ok(b.ok, JSON.stringify(b));
  return b.board.id;
}

test('assignLesson: one of the teacher\'s own lessons to one student, due on a day; Undo takes it off; refusals', async () => {
  const x = H.world();
  const les = L.createLesson(x.teacher, x.s.id, { title: 'My Fractions Lesson' }).lesson;
  const { calls, r, bot, card } = await H.ask(x, 'assignLesson', { lesson: 'fractions', students: ['[student 1]'], due: '2026-12-10' }, { type: 'dashboard', classId: x.A.id }, 'Give Maya Brook my fractions lesson');
  assert.equal(r.waitingForTeacher, true, JSON.stringify(r));
  assert.match(card.title, /My Fractions Lesson/); assert.match(card.title, /Room 12 Owls/);
  assert.ok(card.lines.includes('1 student'), JSON.stringify(card.lines));
  assert.ok(card.lines.some(l => /^Due /.test(l)));
  assert.equal(lessonIn(x.A.id, les.id), null, 'nothing before the tap');
  assert.doesNotMatch(H.sentToAi(calls), /Maya|Brook/, 'the student is only a placeholder for the AI');
  const done = await H.doIt(x, bot);
  const cl = lessonIn(x.A.id, les.id);
  assert.ok(cl); assert.deepEqual(L.studentsOfLesson(cl.id), [x.maya.id]); assert.equal(day(cl.due_at), '2026-12-10');
  assert.match(done.change.lines[0], /Assigned the lesson “My Fractions Lesson” to Room 12 Owls/);
  assert.ok(done.change.links.some(l => l.href === `/class/${x.A.id}/progress/${cl.id}`));
  // Already in the class: refused before any card.
  await H.refused(x, 'assignLesson', { lesson: 'My Fractions Lesson' }, /already has/);
  await H.undo(x, done.id);
  assert.equal(lessonIn(x.A.id, les.id), null, 'off the class with Undo');
  // Refusals.
  L.createLesson(x.other, x.s.id, { title: 'Their Secret Lesson' });
  await H.refused(x, 'assignLesson', { lesson: 'secret lesson' }, /None of the teacher's lessons/);
  await H.refused(x, 'assignLesson', { lesson: 'fractions', due: 'Friday' }, /YYYY-MM-DD/);
  await H.refused(x, 'assignLesson', { lesson: 'fractions', due: '2026-12-01', opens: '2026-12-05' }, /before the open day/);
  await H.refused(x, 'assignLesson', { lesson: 'fractions', students: ['Maya'] }, /not a student placeholder/);
  assert.equal(lessonIn(x.A.id, les.id), null);
});

test('assignWorksheet: a Figures worksheet (from its page) to a class; students will see it; Undo takes it off', async () => {
  const x = H.world();
  const id = sheet(x);
  const page = { type: 'figures-sheet', sheetId: id };
  const n0 = L.classLessons(x.A.id).length;
  const { r, bot, card } = await H.ask(x, 'assignWorksheet', { classRef: 'Room 12 Owls', due: '2026-12-04' }, page);
  assert.equal(r.waitingForTeacher, true, JSON.stringify(r));
  assert.match(card.warn, /Students will see this/); assert.match(card.title, /Chat sheet/); assert.equal(card.undoable, true);
  assert.equal(L.classLessons(x.A.id).length, n0, 'nothing before the tap');
  const done = await H.doIt(x, bot);
  const made = L.classLessons(x.A.id).filter(cl => cl.kind === 'figures');
  assert.equal(made.length, 1); assert.equal(made[0].title, 'Chat sheet'); assert.equal(day(made[0].due_at), '2026-12-04');
  await H.undo(x, done.id);
  assert.equal(L.classLessons(x.A.id).length, n0, 'off with Undo');
  // Several classes and none named: a which-class card, nothing done.
  const w = await H.ask(x, 'assignWorksheet', {}, page);
  assert.equal(w.r.askedWhich, true);
  // Refusals.
  const empty = F.createWorksheet(x.teacher, { title: 'Empty one', grade: '3', items: [] }).id;
  await H.refused(x, 'assignWorksheet', { worksheet: empty, classRef: 'Room 12 Owls' }, /no questions/);
  await H.refused(x, 'assignWorksheet', { worksheet: 'nope', classRef: 'Room 12 Owls' }, /None of the teacher's worksheets/);
  await H.refused(x, 'assignWorksheet', { worksheet: 'Chat sheet', classRef: 'Room 20 Bears' }, /not one of the teacher's classes/);
});

test('assignBoard: practice tasks of a board\'s tool to a class (MT.assign); the tasks must be named; Undo takes it off', async () => {
  const x = H.world();
  board(x);
  const r0 = await H.refused(x, 'assignBoard', { board: 'bead board' }, /Say which practice tasks/);
  assert.match(r0.error, /Hidden beads/, 'the tool\'s tasks are listed');
  await H.refused(x, 'assignBoard', { board: 'bead board', tasks: ['no such task'] }, /no practice task called/);
  await H.refused(x, 'assignBoard', { board: 'bead board', tasks: ['Hidden beads'], count: 50 }, /1 to 10 questions/);
  await H.refused(x, 'assignBoard', { board: 'nothing like it', tasks: ['Hidden beads'] }, /None of the teacher's boards/);
  const n0 = L.classLessons(x.A.id).length;
  const { r, bot, card } = await H.ask(x, 'assignBoard', { board: 'bead', tasks: ['Hidden beads'], count: 3 });
  assert.equal(r.waitingForTeacher, true, JSON.stringify(r));
  assert.match(card.title, /Bead board/); assert.match(card.warn, /Students will see this/);
  assert.ok(card.lines.includes('Rekenreks: Hidden beads'), JSON.stringify(card.lines));
  assert.ok(card.lines.includes('3 questions of each task'));
  assert.equal(L.classLessons(x.A.id).length, n0, 'nothing before the tap');
  const done = await H.doIt(x, bot);
  const made = L.classLessons(x.A.id).filter(cl => cl.kind === 'manip');
  assert.equal(made.length, 1);
  assert.match(done.change.lines[0], /3 questions/);
  await H.undo(x, done.id);
  assert.equal(L.classLessons(x.A.id).length, n0);
});

test('createUnit and renameUnit: the class page\'s own services; Undo deletes an empty unit, renames back', async () => {
  const x = H.world();
  const { bot, card } = await H.ask(x, 'createUnit', { name: 'Fractions' });
  assert.match(card.title, /Add the unit “Fractions” to Room 12 Owls/);
  assert.equal(L.unitsOf(x.A.id).length, 0, 'nothing before the tap');
  let done = await H.doIt(x, bot);
  assert.deepEqual(L.unitsOf(x.A.id).map(u => u.name), ['Fractions']);
  await H.undo(x, done.id);
  assert.equal(L.unitsOf(x.A.id).length, 0, 'deleted with Undo while empty');
  // Made again; something goes in it; Undo then keeps it.
  done = await H.doIt(x, (await H.ask(x, 'createUnit', { name: 'Fractions' })).bot);
  const un = L.unitsOf(x.A.id)[0];
  await H.refused(x, 'createUnit', { name: 'fractions' }, /already has a unit/);
  await H.refused(x, 'createUnit', {}, /Say the unit's name/);
  // renameUnit, with Undo.
  const two = await H.ask(x, 'renameUnit', { unit: 'Fractions', name: 'Fractions and decimals' });
  assert.match(two.card.title, /“Fractions”/); assert.match(two.card.title, /“Fractions and decimals”/);
  assert.equal(L.getUnit(un.id).name, 'Fractions');
  const renamed = await H.doIt(x, two.bot);
  assert.equal(L.getUnit(un.id).name, 'Fractions and decimals');
  await H.undo(x, renamed.id);
  assert.equal(L.getUnit(un.id).name, 'Fractions');
  await H.refused(x, 'renameUnit', { unit: 'Spelling', name: 'X' }, /None of the teacher's units/);
  await H.refused(x, 'renameUnit', { unit: 'Fractions', name: 'Fractions' }, /already has that name/);
  // A unit with an assignment in it is not deleted by Undo.
  const les = L.createLesson(x.teacher, x.s.id, { title: 'In the unit' }).lesson;
  assert.ok(L.assign(x.teacher, x.A.id, les.id, { unitId: un.id }).ok);
  assert.equal(await canUndo(x, done.id), false);
  assert.ok(L.getUnit(un.id), 'kept: it has an assignment now');
});

test('reorderAssignment: one place up or down (L.reorderAssignment); Undo moves it back', async () => {
  const x = H.world();
  const a = L.createLesson(x.teacher, x.s.id, { title: 'Alpha lesson' }).lesson, b = L.createLesson(x.teacher, x.s.id, { title: 'Beta lesson' }).lesson;
  const clA = L.assign(x.teacher, x.A.id, a.id).classLesson.id, clB = L.assign(x.teacher, x.A.id, b.id).classLesson.id;
  const order = () => L.classPlan(x.A.id)[0].lessons.map(cl => cl.id);
  assert.deepEqual(order(), [clA, clB]);
  await H.refused(x, 'reorderAssignment', { assignment: 'Alpha', direction: 'up' }, /already first/);
  await H.refused(x, 'reorderAssignment', { assignment: 'Beta', direction: 'down' }, /already last/);
  await H.refused(x, 'reorderAssignment', { assignment: 'Beta', direction: 'sideways' }, /"up" or "down"/);
  const { bot, card } = await H.ask(x, 'reorderAssignment', { assignment: 'Beta', direction: 'up' });
  assert.match(card.title, /Move “Beta lesson” up one place in Room 12 Owls/);
  assert.deepEqual(order(), [clA, clB], 'nothing before the tap');
  const done = await H.doIt(x, bot);
  assert.deepEqual(order(), [clB, clA]);
  await H.undo(x, done.id);
  assert.deepEqual(order(), [clA, clB]);
});

test('made: rename and delete a worksheet; rename, copy and delete a board; copy and delete a lesson', async () => {
  const x = H.world();
  // A worksheet: rename (Undo), delete (no Undo).
  const ws = sheet(x, 'Shapes sheet');
  let c = await H.ask(x, 'renameWorksheet', { worksheet: 'shapes', title: 'Shapes and angles' });
  assert.match(c.card.title, /“Shapes sheet” to “Shapes and angles”/);
  assert.equal(F.ownWorksheet(x.teacher, ws).title, 'Shapes sheet');
  let done = await H.doIt(x, c.bot);
  assert.equal(F.ownWorksheet(x.teacher, ws).title, 'Shapes and angles');
  await H.undo(x, done.id);
  assert.equal(F.ownWorksheet(x.teacher, ws).title, 'Shapes sheet');
  await H.refused(x, 'renameWorksheet', { worksheet: 'shapes', title: 'Shapes sheet' }, /already has that title/);
  await H.refused(x, 'renameWorksheet', { worksheet: 'shapes' }, /Say the new title/);
  c = await H.ask(x, 'deleteWorksheet', {}, { type: 'figures-sheet', sheetId: ws });
  assert.equal(c.card.risk, 'delete'); assert.match(c.card.warn, /for good/); assert.equal(c.card.undoable, false);
  assert.ok(F.ownWorksheet(x.teacher, ws), 'nothing before the tap');
  done = await H.doIt(x, c.bot);
  assert.equal(F.ownWorksheet(x.teacher, ws), null);
  assert.equal(done.change.canUndo, false); assert.equal(await canUndo(x, done.id), false);
  await H.refused(x, 'deleteWorksheet', { worksheet: ws }, /no worksheets|None of the teacher's worksheets/);

  // A board: rename (Undo), copy (Undo deletes the copy), delete (no Undo).
  const bd = board(x, 'Place value board', 'base-ten-blocks');
  c = await H.ask(x, 'renameBoard', { board: 'place value', title: 'Hundreds board' });
  done = await H.doIt(x, c.bot);
  assert.equal(M.ownBoard(x.teacher, bd).title, 'Hundreds board');
  await H.undo(x, done.id);
  assert.equal(M.ownBoard(x.teacher, bd).title, 'Place value board');
  const n0 = M.listBoards(x.teacher, { all: true }).length;
  c = await H.ask(x, 'duplicateBoard', { board: 'place value' });
  assert.equal(M.listBoards(x.teacher, { all: true }).length, n0, 'nothing before the tap');
  done = await H.doIt(x, c.bot);
  const copy = M.listBoards(x.teacher, { all: true }).find(b => b.title === 'Place value board (copy)');
  assert.ok(copy); assert.match(done.change.lines[0], /Place value board \(copy\)/);
  await H.undo(x, done.id);
  assert.equal(M.ownBoard(x.teacher, copy.id), null, 'the copy goes with Undo');
  c = await H.ask(x, 'deleteBoard', { board: 'place value' });
  assert.match(c.card.warn, /deletes the board for good/); assert.equal(c.card.undoable, false);
  done = await H.doIt(x, c.bot);
  assert.equal(M.ownBoard(x.teacher, bd), null);
  await H.refused(x, 'deleteBoard', { board: 'place value' }, /None of the teacher's boards|no boards/);

  // A lesson: copy (Undo deletes the copy), delete (no Undo; the card counts its classes).
  const les = L.createLesson(x.teacher, x.s.id, { title: 'Water cycle' }).lesson;
  L.addStep(x.teacher, les.id, { kind: 'text', title: 'Read', body: 'Rain.' });
  c = await H.ask(x, 'duplicateLesson', { lesson: 'water' });
  done = await H.doIt(x, c.bot);
  const dup = L.allLessonsOf(x.teacher.id, x.s.id).find(l => l.copied_from === les.id);
  assert.ok(dup); assert.equal(L.steps(dup.id).length, 1);
  await H.undo(x, done.id);
  assert.equal(L.getLesson(dup.id), null, 'the copy goes with Undo');
  assert.ok(L.assign(x.teacher, x.A.id, les.id).ok);
  await H.refused(x, 'deleteLesson', { lesson: 'Their lesson' }, /None of the teacher's lessons/);
  c = await H.ask(x, 'deleteLesson', { lesson: 'water cycle' });
  assert.match(c.card.warn, /deletes the lesson for good/); assert.equal(c.card.undoable, false);
  assert.ok(c.card.lines.includes('It is assigned to 1 class.'), JSON.stringify(c.card.lines));
  assert.match(c.r.what, /assigned to 1 classes/);
  assert.ok(L.getLesson(les.id), 'nothing before the tap');
  done = await H.doIt(x, c.bot);
  assert.equal(L.getLesson(les.id), null);
  assert.equal(lessonIn(x.A.id, les.id), null);
  assert.equal(await canUndo(x, done.id), false);
  // Another teacher's things are never found.
  config.manipulativesUsers = [...(config.manipulativesUsers || []), x.other.username.toLowerCase()];
  const theirs = M.saveBoard(x.other, { tool: 'rekenreks', title: 'Their board', state: {} }).board.id;
  await H.refused(x, 'deleteBoard', { board: theirs }, /None of the teacher's boards|no boards/);
  assert.ok(M.ownBoard(x.other, theirs));
});

// ---------------------------------------------------------------- Google Classroom (the fakes)
const ON = { googleClientId: 'test-client.apps.googleusercontent.com', googleClientSecret: 'fake-test-secret', googleClassroom: true, googleTokenKey: parseTokenKey(KEY).key, classroomApiBase: room.url, googleClassroomScopes: 'read' };
const cookieOf = (res, name) => (res.headers.getSetCookie().find(c => c.startsWith(name + '=')) || '').split(';')[0];
/** Connect with the write scopes ("Allow Oomba Academy to post to Classroom"), through the fake Google. */
async function connect(cookie, classId) {
  const r = await H.post('/api/google-classroom/connect', { back: classId, write: '1' }, cookie);
  assert.equal(r.status, 200, await r.clone().text());
  const start = await H.get((await r.json()).redirect, cookie);
  assert.equal(start.status, 302);
  const flow = cookieOf(start, 'brb_gflow'); const to = new URL(start.headers.get('location'));
  to.searchParams.set('fake_auto', '1'); to.searchParams.set('fake_email', `t${crypto.createHash('sha256').update(cookie).digest('hex').slice(0, 10)}@dwes.test`);
  const a = await fetch(to, { redirect: 'manual' });
  const cb = new URL(a.headers.get('location'));
  return H.get(cb.pathname + cb.search, `${cookie}; ${flow}`);
}

test('postToClassroom: only with Classroom on, connected and the class linked; posted on Do it only; no Undo', async () => {
  const x = H.world();
  const saved = { ...config };
  try {
    const les = L.createLesson(x.teacher, x.s.id, { title: 'Fractions day' }).lesson;
    L.addStep(x.teacher, les.id, { kind: 'text', title: 'Read', body: 'Halves.' });
    const cl = L.assign(x.teacher, x.A.id, les.id, { dueAt: new Date(Date.now() + 7 * 86400e3).toISOString().slice(0, 10) }).classLesson;
    Object.assign(config, { googleClassroom: false });
    await H.refused(x, 'postToClassroom', { assignment: 'Fractions day' }, /not turned on/);
    Object.assign(config, ON); GC._forget();
    S.updateSchool({ id: x.admin.id }, x.s.id, { settings: { googleDomains: ['dwes.test'] } });
    await H.refused(x, 'postToClassroom', { assignment: 'Fractions day' }, /not connected Google Classroom/);
    const back = await connect(x.tc, x.A.id);
    assert.ok([302, 303].includes(back.status), `${back.status} ${back.headers.get('location')}`);
    assert.equal(GC.connectionState(x.teacher.id), 'ok');
    await H.refused(x, 'postToClassroom', { assignment: 'Fractions day' }, /not linked/);
    const course = room.addCourse({ name: 'Owls in Classroom', students: [] });
    assert.equal((await H.post(`/api/classes/${x.A.id}/google-classroom/link`, { courseId: course }, x.tc)).status, 200);
    // For some students only: never posted (it would reach the whole course).
    const some = L.createLesson(x.teacher, x.s.id, { title: 'Just for one' }).lesson;
    L.assign(x.teacher, x.A.id, some.id, { students: [x.maya.id] });
    await H.refused(x, 'postToClassroom', { assignment: 'Just for one' }, /some students only/);
    // The card; nothing sent to Google before the tap (not even in the dry run).
    const sent0 = room.calls.length;
    const { r, bot, card } = await H.ask(x, 'postToClassroom', { assignment: 'Fractions day' });
    assert.equal(r.waitingForTeacher, true, JSON.stringify(r));
    assert.equal(card.risk, 'external'); assert.match(card.warn, /Google Classroom/); assert.equal(card.undoable, false);
    assert.ok(card.lines.includes('Classroom class: Owls in Classroom'), JSON.stringify(card.lines));
    assert.equal(room.calls.length, sent0, 'nothing sent before the tap');
    assert.equal(GC.postOf(cl.id), null);
    const done = await H.doIt(x, bot);
    const post = GC.postOf(cl.id);
    assert.ok(post, 'posted and read back');
    const cw = room.courseWork.get(post.coursework_id);
    assert.equal(cw.courseId, course); assert.equal(cw.body.title, 'Fractions day');
    assert.match(done.change.lines[0], /Posted “Fractions day” to Google Classroom/);
    assert.ok(done.change.links.some(l => l.href.startsWith('https://classroom.google.com/')));
    assert.equal(done.change.canUndo, false);
    // Once: posted already.
    await H.refused(x, 'postToClassroom', { assignment: 'Fractions day' }, /already posted/);
    // Google fails on the tap: the card says Not done and nothing is recorded.
    const other = L.createLesson(x.teacher, x.s.id, { title: 'Decimals day' }).lesson;
    const cl2 = L.assign(x.teacher, x.A.id, other.id).classLesson;
    const two = await H.ask(x, 'postToClassroom', { assignment: 'Decimals day' });
    room.failNext(500, { match: /\/courseWork$/ });
    const tried = room.calls.length;
    assert.equal((await H.act(x, two.bot.id, 'actionDo')).status, 200);
    assert.ok(room.calls.slice(tried).some(c => /\/courseWork$/.test(c.path)), 'Google was asked on the tap');
    const failed = (await H.chatOf(x)).turns.find(t => t.id === two.bot.id).note.action;
    assert.equal(failed.state, 'failed'); assert.match(failed.why, /nothing was changed/);
    assert.equal(GC.postOf(cl2.id), null);
    assert.equal((await H.chatOf(x)).turns.filter(t => t.change && t.change.id === 'postToClassroom').length, 1, 'no change card for the failed post');
  } finally { for (const k of Object.keys(ON)) config[k] = saved[k]; GC._forget(); }
});
