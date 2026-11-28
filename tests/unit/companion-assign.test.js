// Oomba assigns (docs/decisions.md "Oomba assigns, and checks its work"; services/companion.js assign, assignPlan,
// assignAct, undoAssign): "assign Word Hunt to Room 12, due Friday" or "give [student 1] the fractions game". The AI
// (a stand-in here) picks what and for whom; the teacher sees "Assign ... to <class>?" and nothing is assigned until
// they tap Assign. The tap uses the Assign pages' own services (game-folders.js assignGame, library.js assignStory),
// reads the assignment back, and Undo takes it off the class (students' work kept). Also the checks the audit asked
// for: a point is checked in a dry run before the AI is told, a dashboard setting counts as landed only when it reads
// back as asked, and a new class is read back.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createApp } = await import('../../server/app.js');
const { seed } = await import('../../scripts/seed.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const { q } = await import('../../server/db.js');
const RL = await import('../../server/services/ratelimit.js');
const S = await import('../../server/services/schools.js');
const D = await import('../../server/services/dash.js');
const G = await import('../../server/services/games.js');
const LIB = await import('../../server/services/library.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

function world() {
  const admin = createUser({ username: uname('CAAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Chat Assign ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('CAT'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const A = S.createClass({ id: teacher.id }, s.id, { name: 'Room 12 Owls', grade: '3' }).class;
  const B = S.createClass({ id: teacher.id }, s.id, { name: 'Room 14 Foxes', grade: '4' }).class;
  const kid = (name, c) => { const u = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: name, grade: '3' }).user; S.addToClass({ id: admin.id }, c.id, u.id, 'student'); return getUser(u.id); };
  const maya = kid('Maya Brook', A), leo = kid('Leo Stone', A);
  return { s, teacher: getUser(teacher.id), A: S.getClass(A.id), B: S.getClass(B.id), maya, leo, tc: cookieFor(teacher.id) };
}
function standIn(script) {
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const r = await script(params, calls.length - 1);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
const toolUse = (name, input) => ({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${Math.random().toString(36).slice(2, 8)}`, name, input }] });
const say = async (x, text, page) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(x => x.role === 'oomba').at(-1);
const act = (cookie, turnId, a) => post('/api/companion/chat/act', { turnId, act: a }, cookie);
const resultOf = (calls, i = 1) => JSON.parse(calls[i].messages.at(-1).content[0].content);
const openAssignments = c => q.all('SELECT cl.id FROM class_lessons cl WHERE cl.class_id=? AND cl.removed_at IS NULL', c.id);
const wordHunt = () => G.getGameBySlug('word-hunt');

test('"assign Word Hunt to Room 12, due Friday": a card, nothing assigned until Assign; the tap assigns it (read back), Undo takes it off', async () => {
  const x = world();
  const calls = standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'game', id: 'word-hunt', classRef: 'Room 12 Owls', due: '2026-12-04' }) : 'Here it is: tap Assign to give it to the class.'));
  await say(x, 'Assign Word Hunt to Room 12 Owls, due Friday', { type: 'teach' });
  const r = resultOf(calls);
  assert.equal(r.waitingForTeacher, true); assert.equal(r.checked, true); assert.equal(r.className, 'Room 12 Owls'); assert.equal(r.due, '2026-12-04');
  assert.equal(r.done, undefined, 'never "done" before the tap');
  assert.equal(openAssignments(x.A).length, 0, 'the dry run left nothing behind');
  const bot = await lastBot(x.tc);
  assert.equal(bot.note.assign.state, 'open'); assert.equal(bot.note.assign.classId, x.A.id);
  // Assign
  const res = await act(x.tc, bot.id, 'assign');
  assert.equal(res.status, 200, await res.clone().text());
  await C.allSettled();
  const rows = openAssignments(x.A);
  assert.equal(rows.length, 1);
  const done = (await chatOf(x.tc)).turns.filter(t => t.role === 'oomba').at(-1);
  assert.equal(done.change.kind, 'assign'); assert.equal(done.change.classId, x.A.id); assert.ok(done.change.due);
  assert.deepEqual(done.verify, { ok: true, landed: 1, notLanded: [] });
  assert.equal((await chatOf(x.tc)).turns.find(t => t.id === bot.id).note.assign.state, 'assigned');
  // The class's games list shows it, the same as the Assign page's.
  const step = q.get("SELECT s.game_id FROM class_lessons cl JOIN lesson_steps s ON s.lesson_id=cl.lesson_id WHERE cl.id=?", rows[0].id);
  assert.equal(step.game_id, wordHunt().id);
  // Undo
  const u = await post('/api/companion/chat/undo', { turnId: done.id }, x.tc);
  assert.equal(u.status, 200, await u.clone().text());
  assert.equal(openAssignments(x.A).length, 0, 'taken off the class');
});

test('some students; several classes and none named: the app asks which; Not now assigns nothing; already assigned is refused', async () => {
  const x = world();
  // [student 1] = Maya: only she gets it.
  standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'game', id: 'word-hunt', students: ['[student 1]'] }) : 'Tap Assign.'));
  await say(x, 'Give Maya Word Hunt', { type: 'dashboard', classId: x.A.id });
  let bot = await lastBot(x.tc);
  assert.deepEqual(bot.note.assign.students, [x.maya.id]);
  await act(x.tc, bot.id, 'assign'); await C.allSettled();
  const cl = openAssignments(x.A)[0];
  assert.deepEqual(q.all('SELECT user_id FROM class_lesson_students WHERE class_lesson_id=?', cl.id).map(r => r.user_id), [x.maya.id]);
  // The same game again: refused before any card.
  const calls = standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'game', id: 'word-hunt', classRef: x.A.id }) : 'It is already there.'));
  await say(x, 'Assign Word Hunt again', { type: 'dashboard', classId: x.A.id });
  assert.match(resultOf(calls).error, /already has it/);
  // Two classes, none named, not on a class page: a which-class card.
  standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'book', id: LIB.books()[0].id }) : 'Which class?'));
  await say(x, 'Assign this book', { type: 'teach' });
  bot = await lastBot(x.tc);
  assert.ok(bot.note.ask); assert.deepEqual(bot.note.ask.options.map(o => o.label).sort(), ['Room 12 Owls', 'Room 14 Foxes']);
  // A book for Room 14, then Not now.
  standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'book', id: LIB.books()[0].id, classRef: 'room 14' }) : 'Tap Assign.'));
  await say(x, 'Room 14 Foxes', { type: 'teach' });
  bot = await lastBot(x.tc);
  assert.equal(bot.note.assign.classId, x.B.id);
  await act(x.tc, bot.id, 'assignNo');
  assert.equal(openAssignments(x.B).length, 0);
  assert.equal((await lastBot(x.tc)).note.assign.state, 'declined');
});

test('refused: a live-only game, a game that needs the teacher\'s own questions, a class that is not theirs', async () => {
  const x = world();
  const tryOne = async input => { const calls = standIn((p, i) => (i === 0 ? toolUse('assign', input) : 'No.')); await say(x, 'Assign this game', { type: 'dashboard', classId: x.A.id }); return resultOf(calls); };
  assert.match((await tryOne({ kind: 'game', id: 'brain-board' })).error, /played live/);
  assert.match((await tryOne({ kind: 'game', id: 'crossword' })).error, /no saved activities for Crossword yet.*\/play\/crossword/, 'chat audit 4: none saved, the activity editor offered');
  assert.match((await tryOne({ kind: 'game', id: 'word-hunt', classRef: 'Room 99' })).error, /not one of the teacher's classes/);
  assert.equal(openAssignments(x.A).length, 0);
});

test('checked before telling the AI: a point that cannot land (an empty class) is never reported as given', async () => {
  const x = world();
  const calls = standIn((p, i) => (i === 0 ? toolUse('givePoint', { target: 'class', reason: 'teamwork', classRef: x.B.id }) : 'Sorry.'));
  await say(x, 'Give Room 14 a point for teamwork', { type: 'dashboard', classId: x.B.id });
  const r = resultOf(calls);
  // The roster is checked first (the owner's live audit): an empty class is said at once, never a choice card.
  assert.equal(r.given, 0); assert.match(r.error, /no students yet/);
  assert.match((await lastBot(x.tc)).text, /has no students yet, so no points can be given/);
  assert.equal(D.classPoints(x.B).n || 0, 0);
});

test('a dashboard setting counts as landed only when it reads back as asked (a clamped value is not landed)', () => {
  const x = world();
  const made = D.createLayout(x.teacher, x.A, { name: 'Checks', widgets: [{ id: 'tm1', type: 'timer', x: 0, y: 0, w: 4, h: 4, s: { minutes: 5 } }] });
  const lay = made.layout || D.getLayout(made.id || (made.layout && made.layout.id));
  // 10 minutes: saved as asked -> landed
  let r = CO.applyProposal(x.teacher, { classId: x.A.id, layoutId: lay.id, ops: [{ op: 'set', id: 'tm1', settings: { minutes: 10 } }], lines: [] });
  assert.deepEqual(r.verify, { ok: true, landed: 1, notLanded: [] });
  // 999 minutes: the dashboard clamps it to 180 -> not landed as asked, and the card says so
  r = CO.applyProposal(x.teacher, { classId: x.A.id, layoutId: lay.id, ops: [{ op: 'set', id: 'tm1', settings: { minutes: 999 } }], lines: [] });
  assert.equal(D.getLayout(lay.id).widgets.find(w => w.id === 'tm1').s.minutes, 180);
  assert.equal(r.verify.ok, false); assert.equal(r.verify.landed, 0); assert.deepEqual(r.verify.notLanded, [{ code: 'other' }]);
});

test('a book to some students: refused with the reason (a book goes to the whole class); search finds a hidden game only for those who may open it', async () => {
  const x = world();
  const calls = standIn((p, i) => (i === 0 ? toolUse('assign', { kind: 'book', id: LIB.books()[0].id, students: ['[student 1]'] }) : 'Whole class only.'));
  await say(x, 'Give Maya this book', { type: 'dashboard', classId: x.A.id });
  assert.match(resultOf(calls).error, /whole class/);
  const F = await import('../../server/services/game-focus.js');
  const was = config.arcade; config.arcade = false;
  try {
    assert.ok(F.slugHidden('sum-racer'));
    const teacherSees = CO.searchGames({ topic: 'addition' }, x.teacher).map(g => g.id);
    assert.ok(!teacherSees.includes('sum-racer'), 'hidden for a teacher whose class does not have it');
    const admin = createUser({ username: uname('CAAdmin'), password: 'admin-pass-12345', role: 'admin' });
    assert.ok(CO.searchGames({ topic: 'addition' }, getUser(admin.id)).map(g => g.id).includes('sum-racer'), 'the platform admin may open it, so finds it');
  } finally { config.arcade = was; }
});
