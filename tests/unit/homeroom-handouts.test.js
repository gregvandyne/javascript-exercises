// Homeroom, step 2a (docs/decisions.md "Homeroom, step 2a"; services/homeroom-handouts.js, routes/homeroom.js):
//   - handing a game to one desk, a group and Whole class makes a real class assignment (assignGame: a 'game' lesson,
//     class_lessons, class_lesson_students for exactly those students; [] for the whole class), with the instructions
//     on its game step, its order and grading in homeroom_handouts;
//   - a student never gets the same game twice; instructions are cleaned and limited; bad input is refused;
//   - the desk: only the student's own cards, in order, Next up, In order locks later cards, Any order never does, done
//     cards; the play page shows the instructions and goes back to the desk;
//   - grading: stored, shown in the gradebook (Not graded is practice, out of Work done and the Score; Completion is
//     done / not done), and in the CSV; Google Classroom never gets grades for Not graded;
//   - only the class's own teachers (the Homeroom gate) hand out and remove; students and other teachers get a 404;
//   - removing from one desk and from every desk (soft, work kept); the To do list on /classes includes handouts.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser, OFFICIAL, getUserByName } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const GC = await import('../../server/services/gclassroom.js');
const GC_C = await import('../../server/services/gclassroom-client.js');
const SD = await import('../../server/services/school-delete.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json };
};

const boss = createUser({ username: 'HohBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Handout Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 7A', teacherId: rivera.id }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 8B', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const kids = ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Dev Rao'].map(n => kidIn(cls, n));
const otherKid = kidIn(otherCls, 'Eli Moss');
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());

function made(owner, { title = 'G', slug = null } = {}) {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, source='seed', shelf='learn' WHERE id=?", v.id, g.id);
  if (slug) q.run('UPDATE games SET slug=? WHERE id=?', slug, g.id);
  return games.getGame(g.id);
}
const official = getUserByName(OFFICIAL) || createUser({ username: OFFICIAL, password: 'official-pass-123' });
const sudoku = made(official, { title: 'Sudoku Garden', slug: 'sudoku-garden' });
const fractions = made(official, { title: 'Fraction Pizza', slug: 'fraction-pizza' });
const words = made(official, { title: 'Word Ladder', slug: 'word-ladder' });
const atlas = made(official, { title: 'Map Hop', slug: 'map-hop' });
// Groups: Stretch (Ava, Ben) and Building (Cleo); Dev in none.
const room = H.roomOf(cls.id);
const [stretch, , building] = room.groups;
assert.ok(H.saveGroups(rivera, cls, { groups: room.groups, members: { [kids[0].id]: stretch.id, [kids[1].id]: stretch.id, [kids[2].id]: building.id } }).ok);
const give = (who, body) => as(who)(`/api/homeroom/${cls.id}/handouts`, { body });
const deskOf = (kid, c = cls) => HO.deskView(c, kid);

test('one desk, a group, Whole class: a real assignment for exactly those students, with instructions, order and grading', async () => {
  const one = await give(rivera, { gameId: sudoku.id, to: { kind: 'desk', id: kids[3].id }, instructions: '  Try a  Medium puzzle.\n\n\n\nWrite one tip.  ', order: 'in', grade: 'score', dueAt: '2026-12-01' });
  assert.equal(one.status, 200, one.text);
  assert.match(one.json.toast, /Sudoku Garden is on 1 desk/);
  const h1 = one.json.handouts.find(h => h.title === 'Sudoku Garden');
  assert.equal(h1.target, 'desk'); assert.equal(h1.students, 1); assert.equal(h1.grade, 'score'); assert.equal(h1.inOrder, true);
  assert.equal(h1.instructions, 'Try a Medium puzzle.\n\nWrite one tip.', 'cleaned: spaces tidied, at most one blank line');
  const cl1 = L.getClassLesson(h1.id);
  assert.equal(cl1.class_id, cls.id); assert.ok(cl1.due_at);
  assert.equal(L.getLesson(cl1.lesson_id).kind, 'game', 'the same hidden game lesson assignGame makes');
  assert.deepEqual(L.studentsOfLesson(cl1.id), [kids[3].id]);
  assert.equal(L.steps(cl1.lesson_id)[0].body, h1.instructions, 'the instructions are the game step\'s text');
  assert.equal(L.gradeModeOf(cl1.id), 'score');

  const grp = await give(rivera, { gameId: fractions.id, to: { kind: 'group', id: stretch.id }, order: 'any', grade: 'none' });
  assert.equal(grp.status, 200, grp.text);
  const h2 = grp.json.handouts.find(h => h.title === 'Fraction Pizza');
  assert.deepEqual(L.studentsOfLesson(h2.id).sort(), [kids[0].id, kids[1].id].sort());
  assert.equal(h2.target, 'group'); assert.equal(h2.inOrder, false); assert.equal(h2.grade, 'none');

  const all = await give(rivera, { gameId: words.id, to: { kind: 'all' } });
  assert.equal(all.status, 200, all.text);
  const h3 = all.json.handouts.find(h => h.title === 'Word Ladder');
  assert.deepEqual(L.studentsOfLesson(h3.id), [], 'Whole class: the whole class, as any assignment');
  assert.equal(h3.grade, 'completion', 'free play is graded by completion unless the teacher picks');
  assert.equal(h3.inOrder, true);
  assert.equal(h3.students, kids.length);
  // Each desk on the board: Dev has Sudoku and Word Ladder; Ava Fraction Pizza and Word Ladder; Cleo only Word Ladder.
  const b = HO.boardView(cls);
  assert.deepEqual(b.desks[kids[3].id].map(x => x.id), [h1.id, h3.id]);
  assert.deepEqual(b.desks[kids[0].id].map(x => x.id), [h2.id, h3.id]);
  assert.deepEqual(b.desks[kids[2].id].map(x => x.id), [h3.id]);
  // The Classroom side sees an ordinary assignment: the class's lessons, and the student's To do list.
  assert.ok(L.classLessons(cls.id).some(x => x.id === h1.id));
  assert.deepEqual(P.toDoFor(cls.id, kids[3].id).map(x => x.id).sort(), [h1.id, h3.id].sort());
  assert.deepEqual(P.toDoFor(cls.id, kids[2].id).map(x => x.id), [h3.id]);
});

test('refused: the same game twice for a student, bad targets, order, grade, long or unkind instructions, live-only games', async () => {
  let r = await give(rivera, { gameId: words.id, to: { kind: 'desk', id: kids[0].id } });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'alreadyOnDesk'); assert.match(r.json.error, /1 of these desks already has/);
  r = await give(rivera, { gameId: sudoku.id, to: { kind: 'all' } });
  assert.equal(r.json.code, 'alreadyOnDesk', 'Dev already has Sudoku');
  assert.equal((await give(rivera, { gameId: sudoku.id, to: { kind: 'desk', id: otherKid.id } })).json.code, 'notInClass');
  assert.equal((await give(rivera, { gameId: sudoku.id, to: { kind: 'group', id: 'nope' } })).json.code, 'badTarget');
  assert.equal((await give(rivera, { gameId: sudoku.id, to: { kind: 'shelf' } })).json.code, 'badTarget');
  const empty = H.roomOf(cls.id).groups[1];
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'group', id: empty.id } })).json.code, 'emptyGroup');
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[2].id }, order: 'sideways' })).json.code, 'badOrder');
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[2].id }, grade: 'stars' })).json.code, 'badGrade');
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[2].id }, instructions: 'x'.repeat(301) })).json.code, 'tooLong');
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[2].id }, instructions: 'Call me on 555-123-4567' })).json.code, 'personal');
  assert.equal((await give(rivera, { gameId: 'nope', to: { kind: 'desk', id: kids[2].id } })).json.code, 'pickGame');
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[2].id }, dueAt: 'someday' })).json.code, 'badDate');
  assert.equal(HO.cleanInstructions('a\u0007b‮c\r\nd'), 'abc\nd', 'control and direction characters go');
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_handouts WHERE class_id=?', cls.id).n, 3, 'nothing left behind by a refusal');
});

test('only the class\'s own teachers hand out, read and remove; students read only their own desk', async () => {
  const h = HO.boardView(cls).handouts[0];
  for (const who of [kids[0], other, otherKid, null]) {
    assert.equal((await give(who, { gameId: atlas.id, to: { kind: 'all' } })).status, 404, who ? who.username : 'signed out');
    assert.equal((await as(who)(`/api/homeroom/${cls.id}/handouts`)).status, 404);
    assert.equal((await as(who)(`/api/homeroom/${cls.id}/handouts/${h.id}/remove`, { body: {} })).status, 404);
  }
  // The gate: Homeroom off, nobody hands out.
  config.homeroom = false;
  assert.equal((await give(rivera, { gameId: atlas.id, to: { kind: 'all' } })).status, 404);
  config.homeroom = true;
  // Another class's teacher can't remove from this class through their own class's address either.
  assert.equal((await as(other)(`/api/homeroom/${otherCls.id}/handouts/${h.id}/remove`, { body: {} })).json.code, 'notFound');
  // A student's desk state carries their own cards only.
  const st = await as(kids[2])(`/api/desk/${cls.id}/state`);
  assert.equal(st.status, 200);
  assert.deepEqual(st.json.cards.map(c => c.title), ['Word Ladder']);
  assert.doesNotMatch(st.text, /Sudoku|Fraction/);
  const again = await as(kids[2])(`/api/desk/${cls.id}/state?hv=${encodeURIComponent(st.json.hv)}`);
  assert.equal(again.json.cards, undefined, 'the cards come again only when they changed');
  const page = await as(kids[0])(`/class/${cls.id}/desk`);
  assert.equal(page.status, 200); assert.match(page.text, /Fraction Pizza/); assert.doesNotMatch(page.text, /Sudoku Garden/);
  assert.equal((await as(kids[0])(`/api/homeroom/${cls.id}/handouts`)).status, 404);
});

test('the desk: in order, Next up, In order waits for the ones before, Any order never does, done cards', () => {
  // Dev: Sudoku (in order), Word Ladder (in order).
  let d = deskOf(kids[3]);
  assert.deepEqual(d.map(x => [x.title, !!x.next, !!x.locked, x.done]), [['Sudoku Garden', true, false, false], ['Word Ladder', false, true, false]]);
  assert.match(d[0].href, new RegExp(`^/play/sudoku-garden\\?lesson=${d[0].id}&step=`));
  assert.equal(d[0].instructions, 'Try a Medium puzzle.\n\nWrite one tip.');
  // Play time moves the bar; finishing it unlocks the next.
  const step = L.steps(L.getClassLesson(d[0].id).lesson_id)[0];
  assert.ok(P.gameTime(kids[3], d[0].id, step.id, 30).ok);
  d = deskOf(kids[3]); assert.ok(d[0].pct > 0 && d[0].pct < 100); assert.equal(d[1].locked, true);
  assert.ok(P.gameScore(kids[3], d[0].id, step.id, 12).ok);
  d = deskOf(kids[3]);
  // (a done card moves after what is not done yet: Word Ladder, Next up now, comes first)
  assert.deepEqual(d.map(x => [x.title, !!x.next, !!x.locked, x.done, x.pct]), [['Word Ladder', true, false, false, 0], ['Sudoku Garden', false, false, true, 100]]);
  // Ava: Fraction Pizza (any order) then Word Ladder (in order): Word Ladder waits while Fraction Pizza is open.
  d = deskOf(kids[0]);
  assert.deepEqual(d.map(x => [x.title, !!x.next, !!x.locked]), [['Fraction Pizza', true, false], ['Word Ladder', false, true]]);
  // The teacher's board shows the same progress.
  const b = HO.boardView(cls).desks[kids[3].id];
  assert.equal(b[0].done, true); assert.equal(b[0].score, 12);
});

test('an Any order card after an unfinished one stays open', async () => {
  const r = await give(rivera, { gameId: atlas.id, to: { kind: 'desk', id: kids[0].id }, order: 'any' });
  assert.equal(r.status, 200, r.text);
  const d = deskOf(kids[0]);
  assert.deepEqual(d.map(x => [x.title, !!x.locked]), [['Fraction Pizza', false], ['Word Ladder', true], ['Map Hop', false]]);
});

test('the play page: the instructions on top and Back to my desk, for the student only', async () => {
  const d = deskOf(kids[3]).find(x => x.title === 'Sudoku Garden');
  const r = await as(kids[3])(d.href);
  assert.equal(r.status, 200, r.text.slice(0, 300));
  assert.match(r.text, /class="playnote"/); assert.match(r.text, /Try a Medium puzzle\./); assert.match(r.text, /has-playnote/);
  assert.match(r.text, new RegExp(`href="/class/${cls.id}/desk"`)); assert.match(r.text, /Back to my desk/);
  // A plain lesson link for someone else (the teacher trying it) is the game as it always was.
  const t = await as(rivera)(d.href);
  assert.doesNotMatch(t.text, /class="playnote"/);
  // The lesson page shows the instructions too (the step's text).
  assert.match((await as(kids[3])(`/class/${cls.id}/lessons/${d.id}`)).text, /Try a Medium puzzle\./);
});

test('grading: Not graded is practice (out of Work done and the Score), Completion is done / not done; CSV; Classroom', async () => {
  const gb = P.classProgress(cls.id);
  const col = id => gb.lessons.findIndex(l => l.id === id);
  const hs = HO.boardView(cls).handouts, byTitle = t => hs.find(h => h.title === t);
  const fp = byTitle('Fraction Pizza'), wl = byTitle('Word Ladder'), sg = byTitle('Sudoku Garden');
  assert.equal(gb.lessons[col(fp.id)].grade, 'none'); assert.equal(gb.lessons[col(wl.id)].grade, 'completion'); assert.equal(gb.lessons[col(sg.id)].grade, 'score');
  const ava = gb.students.find(p => p.id === kids[0].id);
  assert.equal(ava.cells[col(fp.id)].practice, true);
  // Ava plays Fraction Pizza to the end: it never counts toward Work done.
  const fstep = L.steps(L.getClassLesson(fp.id).lesson_id)[0];
  assert.ok(P.gameScore(kids[0], fp.id, fstep.id, 40).ok);
  const gb2 = P.classProgress(cls.id), ava2 = gb2.students.find(p => p.id === kids[0].id);
  assert.equal(ava2.cells[col(fp.id)].done, 1);
  assert.equal(ava2.overall, 0, 'practice is not in Work done (Word Ladder and Map Hop are still open)');
  assert.equal(ava2.cells[col(fp.id)].score, null);
  // The page: column chips and cells.
  const page = await as(rivera)(`/class/${cls.id}/progress`);
  assert.equal(page.status, 200);
  assert.match(page.text, /Not graded/); assert.match(page.text, /Completion/); assert.match(page.text, /gb-practice/);
  assert.match(page.text, /Practiced/); assert.match(page.text, /Not done/);
  const csv = await as(rivera)(`/class/${cls.id}/progress.csv`);
  assert.match(csv.text, /Practice \(1\/1\)/); assert.match(csv.text, /Not done/);
  // Google Classroom: a Not graded handout never sends grades (even if it was posted).
  q.run("INSERT INTO gc_links(class_id, course_id, course_name, linked_by, linked_at) VALUES (?,?,?,?,?)", cls.id, 'c1', 'Course', rivera.id, Date.now());
  q.run("INSERT INTO gc_posts(class_lesson_id, class_id, course_id, coursework_id, kind, posted_by, posted_at) VALUES (?,?,?,?,?,?,?)", fp.id, cls.id, 'c1', 'w1', 'assignment', rivera.id, Date.now());
  config.googleTokenKey = Buffer.alloc(32, 7);
  assert.ok(GC.saveConnection(rivera, { sub: 'sub-1', email: 'r@example.com', scopes: GC_C.SCOPES.join(' '), refreshToken: 'rt' }).ok);
  assert.ok(GC.can(rivera.id, 'coursework'));
  const sent = await GC.sendGrades(rivera, L.getClassLesson(fp.id), 'draft');
  assert.equal(sent.ok, false); assert.equal(sent.code, 'notGraded');
  const auto = await GC.sendGrades(rivera, L.getClassLesson(fp.id), 'draft', { auto: true, onlyChanged: true });
  assert.equal(auto.ok, true); assert.equal(auto.counts.sent, 0);
});

test('remove: from one desk (the last one off removes it), from every desk; work is kept', async () => {
  const hs = HO.boardView(cls).handouts, fp = hs.find(h => h.title === 'Fraction Pizza'), wl = hs.find(h => h.title === 'Word Ladder');
  const rm = (id, body) => as(rivera)(`/api/homeroom/${cls.id}/handouts/${id}/remove`, { body });
  // Whole class: off Cleo's desk; everyone else keeps it.
  let r = await rm(wl.id, { studentId: kids[2].id });
  assert.equal(r.status, 200, r.text); assert.match(r.json.toast, /Taken off/);
  assert.deepEqual(L.studentsOfLesson(wl.id).sort(), [kids[0].id, kids[1].id, kids[3].id].sort());
  assert.deepEqual(deskOf(kids[2]).map(x => x.title), []);
  assert.equal((await rm(wl.id, { studentId: kids[2].id })).json.code, 'notOnDesk');
  // A group's: off Ava's, then Ben's: the last one off removes it from the class (soft: the work stays).
  assert.ok((await rm(fp.id, { studentId: kids[0].id })).json.ok);
  r = await rm(fp.id, { studentId: kids[1].id });
  assert.match(r.json.toast, /every desk/);
  assert.ok(q.get('SELECT removed_at FROM class_lessons WHERE id=?', fp.id).removed_at);
  assert.ok(q.get('SELECT 1 FROM step_progress WHERE class_lesson_id=?', fp.id), 'Ava\'s work is kept');
  assert.equal(r.json.handouts.some(h => h.id === fp.id), false);
  // Every desk at once.
  r = await rm(wl.id, {});
  assert.ok(r.json.ok); assert.ok(L.getClassLesson(wl.id) === null);
  assert.equal(P.toDoFor(cls.id, kids[3].id).some(x => x.id === wl.id), false);
  // Handed out again after a removal: a new handout, allowed.
  assert.equal((await give(rivera, { gameId: words.id, to: { kind: 'desk', id: kids[2].id } })).status, 200);
});

test('the teacher\'s board: games are buttons to hand out; the Manipulatives and Figures come next; deleting a school takes the rows', async () => {
  const r = await as(rivera)(`/class/${cls.id}/homeroom`);
  assert.equal(r.status, 200);
  assert.match(r.text, new RegExp(`data-hritem="${sudoku.id}"`));
  assert.match(r.text, /Tap a lesson, then a desk, a group or Whole class/);
  assert.doesNotMatch(r.text, /Handing out to desks comes next/);
  assert.ok(SD.BY_CLASS.includes('homeroom_handouts'));
  // A class deleted with the school: its handouts' rows go too.
  const tmp = S.createClass(boss, oak.id, { name: 'Tmp', teacherId: rivera.id }).class;
  const k = kidIn(tmp, 'Fay Lu');
  assert.ok(HO.handOut(rivera, tmp, { gameId: atlas.id, to: { kind: 'desk', id: k.id } }).ok);
  q.run('DELETE FROM class_lessons WHERE class_id=?', tmp.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM homeroom_handouts WHERE class_id=?', tmp.id).n, 0, 'gone with its class lesson');
});
