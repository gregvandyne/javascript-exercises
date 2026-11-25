// Homeroom: reading from the desk (docs/decisions.md "Homeroom: reading from the desk"; services/homeroom-reading.js,
// services/reading-quiz.js, routes/homeroom.js /api/desk/<class>/reading/..., routes/library.js ?in=hr and /api/library/books):
//   - handing out Reading (a book, or their own choice) is a real 'story' class assignment with homeroom_handouts
//     (Completion by default), for one desk, a group or Whole class; the same book twice is refused; only the class's
//     teachers;
//   - the routine's steps in order: Read (pages, the last finishes it), Quiz (the book's own questions; first-try marks;
//     a wrong one gives the page), 3 notes (one notebook page in the class's tab, titled with the book); then the class
//     row is done with the quiz's marks;
//   - grading: Completion (done after the notes), Score (the quiz's first try) in the overview and to Google Classroom;
//   - the quiz for a book without questions: the AI's (validated, cached per book, only the book's words sent), the
//     retell questions when the AI is off or wrong;
//   - who: only the student's own routine on their own desk, never a classmate's; a waiting In order handout is refused;
//   - the board and Today: each desk's step and score; the pulse's "Reading <book>"; the reader in a frame; delete paths.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const L = await import('../../server/services/lessons.js');
const P = await import('../../server/services/progress.js');
const H = await import('../../server/services/homeroom.js');
const HO = await import('../../server/services/homeroom-handouts.js');
const HR = await import('../../server/services/homeroom-reading.js');
const HV = await import('../../server/services/homeroom-live.js');
const RQ = await import('../../server/services/reading-quiz.js');
const OV = await import('../../server/services/homeroom-overview.js');
const GC = await import('../../server/services/gclassroom.js');
const LIB = await import('../../server/services/library.js');
const NB = await import('../../server/services/notebook.js');
const SD = await import('../../server/services/school-delete.js');
const AC = await import('../../server/services/ai-call.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');
TOOLS.plansOn();
AC.hooks.log = () => {};

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body, headers: more = {} } = {}) => {
  const headers = { ...(who ? { cookie: cookieFor(who.id) } : {}), ...more };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, text, json, headers: r.headers };
};

const boss = createUser({ username: 'RdBoss', password: 'secret123', role: 'admin' });
const oak = S.createSchool(boss, { name: 'Reading Oak' }).school;
const staff = name => getUser(S.createSchoolAccount(boss, oak.id, { rosterName: name, role: 'teacher' }).user.id);
const rivera = staff('Ms Rivera'), other = staff('Mr Other');
for (const u of [rivera, other]) TOOLS.givePlan(u.id);
const cls = S.createClass(boss, oak.id, { name: 'Room 2R', teacherId: rivera.id, grade: '2' }).class;
const otherCls = S.createClass(boss, oak.id, { name: 'Room 9Z', teacherId: other.id }).class;
const kidIn = (c, n) => { const u = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: n }).user.id); S.addToClass(boss, c.id, u.id); return getUser(u.id); };
const [zoe, ava, ben, cleo] = ['Zoe Quinn', 'Ava Stone', 'Ben Hill', 'Cleo Park'].map(n => kidIn(cls, n));
const eli = kidIn(otherCls, 'Eli Moss');
config.homeroom = true; config.homeroomUsers = [rivera, other].map(u => u.username.toLowerCase());
const room = H.roomOf(cls.id), [stretch] = room.groups;
assert.ok(H.saveGroups(rivera, cls, { groups: room.groups, members: { [ava.id]: stretch.id, [ben.id]: stretch.id } }).ok);

// two real library books (each with its 3 questions), and one added without questions (for the AI's quiz)
const [bookA, bookB] = LIB.books().filter(b => b.grade === '2' && b.pages.length >= 4 && b.pages.length <= 20);
const bare = { ...LIB.books().find(b => b.pages.length >= 4), id: 'zz-no-questions', title: 'The Little Red Boat', questions: [], grade: '2' };
LIB._setManifest({ ...LIB.manifest(), books: [...LIB.books(), bare] });
const give = (who, body) => as(who)(`/api/homeroom/${cls.id}/handouts`, { body: { reading: true, ...body } });
const desk = (who, clId, body) => as(who)(`/api/desk/${cls.id}/reading/${clId}`, body ? { body } : {});
const readAll = async (who, clId, n) => { for (let p = 1; p <= n; p++) { const r = await desk(who, clId, { action: 'progress', page: p }); assert.equal(r.status, 200, r.text); } };
const rightOf = (b, i) => RQ.libraryItems(b)[i].answer;
const NOTES = { happened: 'The boat went out to sea.', word: 'harbor: where boats stay', think: 'I liked <b>it</b>' };

test('handing out Reading: a real story assignment, Completion by default, refusals, only the class\'s teachers', async () => {
  const one = await give(rivera, { bookId: bookA.id, to: { kind: 'group', id: stretch.id }, instructions: 'Read it twice.' });
  assert.equal(one.status, 200, one.text);
  const h = one.json.handouts.find(x => x.title === bookA.title);
  assert.ok(h, 'on the board'); assert.equal(h.icon, '📖'); assert.equal(h.grade, 'completion'); assert.equal(h.target, 'group'); assert.equal(h.students, 2);
  assert.equal(h.reading.book.id, bookA.id);
  const cl = L.getClassLesson(h.id), l = L.getLesson(cl.lesson_id), st = L.steps(l.id);
  assert.equal(l.kind, 'story'); assert.equal(st.length, 1); assert.equal(st[0].kind, 'story'); assert.equal(st[0].story_id, bookA.id); assert.equal(st[0].body, 'Read it twice.');
  assert.deepEqual(L.studentsOfLesson(h.id).sort(), [ava.id, ben.id].sort());
  // the same book for one of them again: refused; another student may have it
  const again = await give(rivera, { bookId: bookA.id, to: { kind: 'desk', id: ava.id } });
  assert.equal(again.status, 400); assert.equal(again.json.code, 'alreadyOnDesk');
  assert.equal((await give(rivera, { bookId: 'no-such-book', to: { kind: 'all' } })).json.code, 'pickBook');
  // a free choice to the whole class, graded by Score
  const any = await give(rivera, { bookId: '', to: { kind: 'all' }, grade: 'score', order: 'any' });
  assert.equal(any.status, 200, any.text);
  const ha = any.json.handouts.find(x => x.title === 'Read a book');
  assert.equal(ha.grade, 'score'); assert.equal(ha.reading.book, null);
  // never a student, another class's teacher, or nobody
  assert.equal((await give(ava, { bookId: bookB.id, to: { kind: 'all' } })).status, 404);
  assert.equal((await give(other, { bookId: bookB.id, to: { kind: 'all' } })).status, 404);
  assert.equal((await give(null, { bookId: bookB.id, to: { kind: 'all' } })).status, 404);
});

const byTitle = (title, c = cls) => HO.boardView(c).handouts.find(x => x.title === title);

test('the routine: Read, then the quiz (first try, the page for a wrong answer), then 3 notes in the notebook', async () => {
  const h = byTitle(bookA.title);
  // Ava's desk: the card opens the reading layer, at Read
  const card = HO.deskView(cls, ava).find(x => x.id === h.id);
  assert.equal(card.reading.step, 'read'); assert.match(card.href, new RegExp(`/class/${cls.id}/desk#read=`)); assert.equal(card.reading.book.title, bookA.title);
  // Zoe has no such card (not in the group), and can't open Ava's routine
  assert.equal(HO.deskView(cls, zoe).some(x => x.id === h.id), false);
  assert.equal((await desk(zoe, h.id)).status, 404);
  // no quiz, no notes before the book is read
  assert.equal((await as(ava)(`/api/desk/${cls.id}/reading/${h.id}/quiz`)).json.code, 'readFirst');
  assert.equal((await desk(ava, h.id, { action: 'notes', notes: NOTES })).json.code, 'quizFirst');
  const v0 = await desk(ava, h.id);
  assert.equal(v0.json.step, 'read'); assert.equal(v0.json.instructions, 'Read it twice.');
  const half = Math.floor(bookA.pages.length / 2);
  await desk(ava, h.id, { action: 'progress', page: half, aloud: true });
  let b = HO.boardView(cls).desks[ava.id].find(x => x.id === h.id);
  assert.equal(b.rd.step, 'read'); assert.equal(b.rd.page, half); assert.ok(b.pct > 0 && b.pct < 65);
  // going back keeps the furthest page
  await desk(ava, h.id, { action: 'progress', page: 1 });
  assert.equal(HO.boardView(cls).desks[ava.id].find(x => x.id === h.id).rd.page, half);
  await readAll(ava, h.id, bookA.pages.length);
  assert.equal((await desk(ava, h.id)).json.step, 'quiz');
  // the quiz: the book's own questions, never the answers
  const qz = await as(ava)(`/api/desk/${cls.id}/reading/${h.id}/quiz`);
  assert.equal(qz.status, 200, qz.text);
  assert.equal(qz.json.source, 'library'); assert.equal(qz.json.items.length, bookA.questions.length);
  assert.ok(qz.json.items.every(x => !('answer' in x)), 'no answers'); assert.doesNotMatch(qz.text, /"answer"/);
  // question 0 wrong first (its page to look at), then right: the mark stays wrong; the others right
  const wrong = (rightOf(bookA, 0) + 1) % bookA.questions[0].choices.length;
  const w = await desk(ava, h.id, { action: 'answer', i: 0, c: wrong });
  assert.equal(w.json.right, false); assert.equal(w.json.page, bookA.questions[0].page);
  assert.equal((await desk(ava, h.id, { action: 'answer', i: 0, c: rightOf(bookA, 0) })).json.right, true);
  assert.equal((await desk(ava, h.id, { action: 'notes', notes: NOTES })).json.code, 'quizFirst', 'the quiz first');
  let last;
  for (let i = 1; i < bookA.questions.length; i++) last = await desk(ava, h.id, { action: 'answer', i, c: rightOf(bookA, i) });
  assert.equal(last.json.done, true); assert.deepEqual(last.json.score, { right: bookA.questions.length - 1, total: bookA.questions.length });
  // not done yet in the class: the notes are the last step
  assert.notEqual(P.lessonProgress(h.id).students.find(p => p.id === ava.id).done, 1);
  b = HO.boardView(cls).desks[ava.id].find(x => x.id === h.id);
  assert.equal(b.rd.step, 'notes'); assert.equal(b.done, false); assert.equal(b.rd.right, bookA.questions.length - 1);
  // the notes: all three, each short
  assert.equal((await desk(ava, h.id, { action: 'notes', notes: { ...NOTES, think: '  ' } })).json.code, 'noteEmpty');
  assert.equal((await desk(ava, h.id, { action: 'notes', notes: { ...NOTES, word: 'x'.repeat(HR.NOTE_MAX + 1) } })).json.code, 'noteLong');
  const saved = await desk(ava, h.id, { action: 'notes', notes: NOTES });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.step, 'done');
  // one page in the class's tab of her notebook, titled with the book, the prompts and her words (escaped)
  const pg = q.get('SELECT p.*, t.kind, t.class_id tclass FROM notebook_pages p JOIN notebook_tabs t ON t.id=p.tab_id WHERE p.id=?', saved.json.page);
  assert.equal(pg.title, bookA.title); assert.equal(pg.kind, 'class'); assert.equal(pg.tclass, cls.id); assert.equal(pg.class_lesson_id, h.id);
  assert.match(pg.body, /<b>Something that happened<\/b>/); assert.match(pg.body, /The boat went out to sea\./); assert.match(pg.body, /A new word/);
  assert.match(pg.body, /I liked &lt;b&gt;it&lt;\/b&gt;/, 'her words are text, never markup');
  assert.equal((await desk(ava, h.id, { action: 'notes', notes: NOTES })).json.code, 'notesSaved', 'once');
  // the class's row: done, with the first-try marks (the gradebook and the Score)
  const row = q.get('SELECT * FROM step_progress WHERE class_lesson_id=? AND user_id=?', h.id, ava.id);
  assert.equal(row.status, 'done'); assert.equal(row.marks, `0${'1'.repeat(bookA.questions.length - 1)}`); assert.equal(row.label, 'aloud');
  b = HO.boardView(cls).desks[ava.id].find(x => x.id === h.id);
  assert.equal(b.done, true); assert.equal(b.pct, 100); assert.equal(b.rd.notes, saved.json.page);
  // her teacher reads it (the notebook they already read); the AI never: nothing about it reaches a prompt
  const nb = NB.forTeacher(rivera, ava.id);
  assert.ok(nb.ok && nb.tabs.some(t => t.pages.some(p => p.id === saved.json.page)));
});

test('grading: Completion is done after the notes; Score is the quiz\'s first try, in the overview and to Google Classroom', async () => {
  const comp = byTitle(bookA.title);
  const ov = OV.overview(cls), col = ov.columns.findIndex(x => x.id === comp.id);
  assert.equal(ov.columns[col].kind, 'reading'); assert.equal(ov.columns[col].grade, 'completion');
  assert.equal(ov.students.find(s => s.id === ava.id).cells[col].state, 'done');
  assert.deepEqual(ov.students.find(s => s.id === ava.id).cells[col].quiz, { right: bookA.questions.length - 1, total: bookA.questions.length }, 'the quiz beside a Completion cell');
  assert.equal(ov.students.find(s => s.id === ben.id).cells[col].state, 'notDone');
  assert.deepEqual(ov.students.map(s => s.name), ['Ava Stone', 'Ben Hill', 'Cleo Park', 'Zoe Quinn'], 'alphabetical, never ranked');
  assert.equal(GC.gradeBasis(comp.id), 'completion');
  assert.equal(GC.gradeOf(P.lessonProgress(comp.id).students.find(p => p.id === ava.id), 'completion'), 100);
  // the free choice, graded by Score: Zoe picks a book, reads, gets 2 of 3 first time, writes her notes
  const any = byTitle('Read a book');
  assert.equal((await desk(zoe, any.id)).json.step, 'choose');
  assert.equal((await desk(zoe, any.id, { action: 'progress', page: 1 })).json.code, 'pickBook');
  const ch = await desk(zoe, any.id, { action: 'choose', bookId: bookB.id });
  assert.equal(ch.status, 200, ch.text); assert.equal(ch.json.step, 'read'); assert.equal(ch.json.book.id, bookB.id);
  // she may still change her mind before the quiz
  assert.equal((await desk(zoe, any.id, { action: 'choose', bookId: bookA.id })).json.book.id, bookA.id);
  assert.equal((await desk(zoe, any.id, { action: 'choose', bookId: bookB.id })).json.book.id, bookB.id);
  await readAll(zoe, any.id, bookB.pages.length);
  await as(zoe)(`/api/desk/${cls.id}/reading/${any.id}/quiz`);
  assert.equal((await desk(zoe, any.id, { action: 'choose', bookId: bookA.id })).json.code, 'quizStarted');
  const n = bookB.questions.length;
  for (let i = 0; i < n; i++) {
    if (i === 1) await desk(zoe, any.id, { action: 'answer', i, c: (rightOf(bookB, i) + 1) % bookB.questions[i].choices.length });
    await desk(zoe, any.id, { action: 'answer', i, c: rightOf(bookB, i) });
  }
  // a page made earlier from the card's Notes button ("Read a book") is the book's page now
  const early = NB.handoutPage(zoe, cls, any.id, HO.deskView(cls, zoe));
  assert.ok(early.ok);
  const saved = await desk(zoe, any.id, { action: 'notes', notes: NOTES });
  assert.equal(saved.status, 200, saved.text); assert.equal(saved.json.page, early.page);
  assert.equal(q.get('SELECT title FROM notebook_pages WHERE id=?', early.page).title, bookB.title);
  const pct = Math.round((100 * (n - 1)) / n);
  const ov2 = OV.overview(cls), c2 = ov2.columns.findIndex(x => x.id === any.id);
  assert.deepEqual([ov2.students.find(s => s.id === zoe.id).cells[c2].state, ov2.students.find(s => s.id === zoe.id).cells[c2].pct], ['score', pct]);
  assert.equal(GC.gradeBasis(any.id), 'score');
  assert.equal(GC.gradeOf(P.lessonProgress(any.id).students.find(p => p.id === zoe.id), 'score'), pct);
  // Today: each student it went to, with their step and score (the board's cards carry them)
  const z = HO.boardView(cls).desks[zoe.id].find(x => x.id === any.id);
  assert.deepEqual([z.rd.step, z.rd.right, z.rd.total, z.rd.book.id], ['done', n - 1, n, bookB.id]);
  // the results page: alphabetical, the book, the step, the quiz
  const pgRes = await as(rivera)(`/class/${cls.id}/progress/${any.id}`);
  assert.equal(pgRes.status, 200);
  assert.ok(pgRes.text.indexOf('Ava Stone') < pgRes.text.indexOf('Zoe Quinn'));
  assert.match(pgRes.text, new RegExp(`${n - 1} / ${n}`)); assert.match(pgRes.text, /Not picked yet/);
});

test('the quiz for a book without questions: the AI\'s, checked and cached; the retell questions otherwise', async () => {
  // validate: dashes go, duplicates, bad answers and short lists don't pass
  const good = [
    { question: 'Where did the little boat go?', choices: ['Out to sea', 'Up a hill', 'Into a cave'], answer: 0, page: 2 },
    { question: 'Who rowed the boat \u2014 at first?', choices: ['A cat', 'A girl', 'A dog'], answer: 1, page: 1 },
    { question: 'What color was the boat?', choices: ['Red', 'Blue', 'Green', 'Gold'], answer: 0, page: 99 },
    { question: 'How did the girl feel at the end?', choices: ['Happy', 'Sad', 'Angry'], answer: 0, page: 3 },
  ];
  const v = RQ.validate({ questions: good }, bare);
  assert.equal(v.length, 4); assert.equal(v[1].q, 'Who rowed the boat, at first?'); assert.equal(v[2].page, null, 'a page the book does not have');
  assert.equal(RQ.validate({ questions: good.slice(0, 3) }, bare), null, 'fewer than 4');
  assert.equal(RQ.validate({ questions: [...good.slice(0, 3), { ...good[3], answer: 7 }] }, bare), null);
  assert.equal(RQ.validate({ questions: [...good.slice(0, 3), { ...good[3], choices: ['Happy', 'happy', 'Sad'] }] }, bare), null);
  assert.equal(RQ.validate('nope', bare), null);
  // the retell questions: certain answers, about this book
  const rt = RQ.retell(bare);
  assert.ok(rt.length >= 3);
  assert.equal(rt[0].choices[rt[0].answer], bare.title);
  const text = bare.pages.map(p => p.text).join(' ').toLowerCase();
  for (const x of rt.filter(y => y.q.startsWith('Which word'))) {
    assert.ok(text.includes(x.choices[x.answer])); assert.ok(x.choices.filter((c, i) => i !== x.answer).every(c => !new RegExp(`\\b${c}\\b`).test(text)));
  }
  // the AI is off: the retell questions, nothing cached
  const off = await RQ.ensureQuiz(bare, { client: null });
  assert.equal(off.source, 'retell'); assert.equal(RQ.cachedItems(bare.id), null);
  // the AI answers badly: the retell questions, nothing cached
  const asked = [];
  const fake = out => ({ messages: { create: async req => { asked.push(req); return { model: 'm', usage: {}, content: [{ type: 'text', text: JSON.stringify(out) }] }; } } });
  assert.equal((await RQ.ensureQuiz(bare, { client: fake({ questions: good.slice(0, 2) }) })).source, 'retell');
  assert.equal(RQ.cachedItems(bare.id), null);
  // a good answer: cached per book; only the book was sent (its title and words), never a student or a class
  const r = await RQ.ensureQuiz(bare, { client: fake({ questions: good }) });
  assert.equal(r.source, 'ai'); assert.equal(r.items.length, 4); assert.deepEqual(RQ.cachedItems(bare.id), r.items);
  const sent = JSON.stringify(asked[asked.length - 1]);
  assert.match(sent, /The Little Red Boat/);
  for (const name of ['Ava', 'Zoe', 'Ben', 'Cleo', 'Rivera', 'Room 2R', 'Reading Oak']) assert.doesNotMatch(sent, new RegExp(name));
  // asked once: the next reader gets the cached quiz without a call
  const before = asked.length;
  assert.equal((await RQ.ensureQuiz(bare, { client: fake({ questions: [] }) })).source, 'ai');
  assert.equal(asked.length, before);
  // a student on that book gets it through the routine, with the AI's questions (no answers)
  const out = await give(rivera, { bookId: bare.id, to: { kind: 'desk', id: cleo.id }, order: 'any' });
  assert.equal(out.status, 200, out.text);
  const h = byTitle(bare.title);
  await readAll(cleo, h.id, bare.pages.length);
  const qz = await as(cleo)(`/api/desk/${cls.id}/reading/${h.id}/quiz`);
  assert.equal(qz.json.source, 'ai'); assert.equal(qz.json.items.length, 4); assert.doesNotMatch(qz.text, /"answer"/);
  assert.equal((await desk(cleo, h.id, { action: 'answer', i: 0, c: 1 })).json.page, 2);
});

test('who: only their own routine, their own desk; a waiting In order handout; teachers get the site\'s 404 on desk addresses', async () => {
  // In order: Cleo's book (not done) waits for nothing before it on her desk; a second In order one waits for it
  const second = await give(rivera, { bookId: bookB.id, to: { kind: 'desk', id: cleo.id }, order: 'in' });
  assert.equal(second.status, 200, second.text);
  const h2 = HO.boardView(cls).handouts.filter(x => x.reading && x.reading.book && x.reading.book.id === bookB.id).find(x => x.students === 1);
  const card = HO.deskView(cls, cleo).find(x => x.id === h2.id);
  assert.equal(card.locked, true);
  assert.equal((await desk(cleo, h2.id)).json.code, 'later');
  assert.equal((await desk(cleo, h2.id, { action: 'progress', page: 1 })).json.code, 'later');
  // a student of another class, a teacher, nobody: the desk's gate
  assert.equal((await desk(eli, h2.id)).status, 404);
  assert.equal((await desk(rivera, h2.id)).status, 404);
  assert.equal((await desk(null, h2.id)).status, 404);
  // a classmate's handout id on their own desk address: not on their desk
  assert.equal((await desk(ben, h2.id)).status, 404);
  assert.equal((await desk(ben, h2.id, { action: 'notes', notes: NOTES })).status, 404);
  assert.equal((await desk(cleo, h2.id, { action: 'nope' })).status, 400);
});

test('opening a Reading handout elsewhere goes to the desk; the library\'s own reader never counts it', async () => {
  const h = byTitle(bookA.title);
  const cl = L.getClassLesson(h.id), step = L.steps(cl.lesson_id)[0];
  const r = await as(ben)(`/class/${cls.id}/lessons/${h.id}`);
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), `/class/${cls.id}/desk#read=${encodeURIComponent(h.id)}`);
  assert.equal(LIB.assignmentCtx(ben, bookA, h.id, step.id), null);
  // the reader inside Homeroom: framed by this site only, no site bar, the routine's end instead of the questions
  const inFrame = await as(ben)(`/library/${bookA.id}/read?in=hr&hr=1&big=1`, { headers: { 'sec-fetch-dest': 'iframe' } });
  assert.equal(inFrame.status, 200);
  assert.match(inFrame.headers.get('content-security-policy'), /frame-ancestors 'self'/); assert.equal(inFrame.headers.get('x-frame-options'), null);
  assert.match(inFrame.text, /rd-inhr/); assert.match(inFrame.text, /rd-big/); assert.match(inFrame.text, /data-hrgo="quiz"/);
  assert.doesNotMatch(inFrame.text, /class="rd-opt"/, 'the routine has its own quiz');
  const plain = await as(ben)(`/library/${bookA.id}/read?in=hr`);
  assert.match(plain.headers.get('content-security-policy'), /frame-ancestors 'none'/, 'not in a frame: as always');
  // the books for the pickers
  const list = await as(null)('/api/library/books?grade=2');
  assert.equal(list.status, 200); assert.ok(list.json.books.length > 0); assert.ok(list.json.books.every(x => x.grade === '2' && x.cover && x.pages));
  assert.equal(HR.libraryGrade('Grade 2'), '2'); assert.equal(HR.libraryGrade('K'), 'k'); assert.equal(HR.libraryGrade('5th'), '4-5'); assert.equal(HR.libraryGrade('Algebra'), null);
});

test('live class: a desk reading says "Reading <book>" with its page, from the dock or a handout', async () => {
  H.setLive(rivera, cls, 'start');
  try {
    assert.ok(HV.pulse(ben, cls, { where: 'reading', on: '', book: bookB.id, page: 3, idle: 1 }).ok);
    const d = HV.liveView(cls).desks[ben.id];
    assert.equal(d.where, 'reading'); assert.deepEqual([d.book.title, d.book.page], [bookB.title, 3]);
    // a made-up book is nothing
    HV.pulse(ben, cls, { where: 'reading', book: 'nope', page: 3 });
    assert.equal(HV.liveView(cls).desks[ben.id].book, undefined);
  } finally { H.setLive(rivera, cls, 'end'); }
});

test('deleting: the routines go with the student\'s account, the class and the school; a leaver\'s too', async () => {
  assert.ok(SD.BY_CLASS.includes('homeroom_reading'));
  assert.ok(q.get('SELECT 1 FROM homeroom_reading WHERE user_id=?', zoe.id));
  S.removeFromClass(boss, cls.id, zoe.id);
  assert.equal(q.get('SELECT 1 FROM homeroom_reading WHERE user_id=?', zoe.id), undefined);
});
