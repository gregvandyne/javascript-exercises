// Oomba on the Manipulatives board (docs/decisions.md "Virtual math manipulatives: Oomba chat", services/manip-chat.js):
// a reply-only turn, a turn that changes the board (built by the code, offered once, undoable on the page), bad JSON and
// a timeout (a calm failed answer, the words kept, Try again), a message naming a student (refused before the AI, nothing
// stored), students and teachers without the plan refused, the page context (no sticky notes, no names, no typed text),
// one turn at a time, a restart mid-turn, and the chat going with its board and its account. The AI is the existing
// stand-in (services/manipulatives.js hooks.create).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const C = await import('../../server/services/manip-chat.js');
const AI = await import('../../server/services/ai-call.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { M.hooks.create = null; AI.hooks.log = null; server.close(); });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null; try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json };
};
let n = 0;
function world() {
  const k = ++n;
  const boss = createUser({ username: `ChatBoss${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `Chat Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `4C-${k}` }).class;
  const kid = name => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { boss, oak, A, kids: [kid('Quinn Marsh'), kid('Bea Tumble')] };
}
/** The stand-in AI: answers with answer() (an object becomes JSON text), or throws, or never answers. */
function standIn(answer) {
  const calls = [];
  M.hooks.create = async params => {
    calls.push(params);
    const a = typeof answer === 'function' ? await answer(params) : answer;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: typeof a === 'string' ? a : JSON.stringify(a) }] };
  };
  return calls;
}
const clockBoard = () => {
  const d = M.sanitizeDraft({ title: 'Half hours', steps: ['Read each clock.'], items: [{ time: '3:30', box: 'answer' }, { time: '7:30', box: 'answer' }] }, 'clock');
  return { ...d.board, __steps: [{ id: 's1', text: 'Read each clock.' }], __ann: { ...d.board.__ann, notes: [{ id: 'n1', text: 'Secret sticky for Bea', x: 0.5, y: 0.5 }], strokes: [] } };
};
const say = (who, body) => as(who)('/api/manipulatives/chat', { method: 'POST', body: { tool: 'clock', title: 'Half hours', state: clockBoard(), ...body } });
const chatOf = async (who, extra = '') => (await as(who)(`/api/manipulatives/chat?tool=clock${extra}`)).json.chat;

test('migration 0103: after 0102, the chats table with one conversation per teacher and board', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.indexOf('0103_manipulatives_chat') > names.indexOf('0102_version_playthrough'));
  assert.ok(q.all('PRAGMA table_info(manip_chats)').some(c => c.name === 'pending_id'));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='manip_chats_board'"));
});

test('a reply-only turn: stored, answered in the background, no change; the AI sees the board but no notes or names', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'Both clocks show half past. Ask me for more!', action: null });
  try {
    const r = await say(boss, { text: 'What do these clocks show?', grade: '2' });
    assert.equal(r.status, 200);
    assert.equal(r.json.chat.turns.length, 1); assert.equal(r.json.chat.turns[0].text, 'What do these clocks show?');
    assert.ok(r.json.chat.pending, 'the answer is on its way');
    await C.settled(r.json.chat.id);
    const chat = await chatOf(boss);
    assert.equal(chat.pending, null);
    assert.deepEqual(chat.turns.map(x => x.role), ['me', 'oomba']);
    assert.equal(chat.turns[1].text, 'Both clocks show half past. Ask me for more!');
    assert.equal(chat.turns[1].change, undefined);
    assert.equal(chat.grade, '2');
    assert.equal(calls.length, 1);
    const sys = calls[0].system, msgs = calls[0].messages;
    assert.equal(calls[0].model, config.builderModel); assert.equal(calls[0].output_config.effort, 'low');
    assert.equal(calls[0].output_format, undefined, 'plain JSON, no strict schema');
    assert.match(sys, /Clock/); assert.match(sys, /grade 2/); assert.match(sys, /"time":"3:30"/); assert.match(sys, /"answerKey":"3:30"/);
    assert.match(sys, /Read each clock\./); assert.match(sys, /Half hours/);
    assert.doesNotMatch(JSON.stringify(calls[0]), /Secret sticky|Bea|Quinn|Tumble|Marsh/, 'no sticky note text, no student names');
    assert.deepEqual(msgs.map(m => m.role), ['user']); assert.equal(msgs[0].content, 'What do these clocks show?');
  } finally { M.hooks.create = null; }
});

test('a turn that changes the board: the code builds and checks it; offered once; the next turn carries the history', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'I made it four clocks to the quarter hour.', action: { op: 'replace', draft: { title: 'Quarter hours', steps: ['Read each clock.', 'Write the time.'],
    items: [{ time: '3:15', box: 'answer' }, { time: '3:15', box: 'answer' }, { time: '25:99', box: 'answer' }, { time: '9:45', box: 'build', label: 'Last one' }] } } });
  try {
    const r = await say(boss, { text: 'Make it quarter hours, four clocks' });
    await C.settled(r.json.chat.id);
    const chat = await chatOf(boss);
    const t = chat.turns[1];
    assert.equal(t.text, 'I made it four clocks to the quarter hour.');
    assert.equal(t.change.title, 'Quarter hours'); assert.equal(t.change.n, 3, 'the repeat made distinct, the impossible time dropped'); assert.equal(t.change.steps, 2);
    assert.equal(t.change.applied, false);
    const st = t.change.state;
    assert.equal(st.v, 2); assert.deepEqual(st.__steps.map(s => s.text), ['Read each clock.', 'Write the time.']);
    assert.ok(M.cleanState(st, null, 'clock').ok, 'a board the server accepts');
    const clocks = st.objects.filter(o => o.k === 'clock');
    assert.equal(clocks.length, 3); assert.equal(new Set(clocks.map(o => `${o.st.h}:${o.st.m}`)).size, 3);
    // The page put it on the board: not offered again (no state any more).
    assert.equal((await as(boss)('/api/manipulatives/chat/applied', { method: 'POST', body: { tool: 'clock', turnId: t.id } })).status, 200);
    const after = await chatOf(boss);
    assert.equal(after.turns[1].change.applied, true); assert.equal(after.turns[1].change.state, null);
    // The next message: the conversation so far goes with it, in turn.
    const calls2 = standIn({ reply: 'Sure.', action: null });
    const r2 = await say(boss, { text: 'Thanks! Is that too hard for grade 1?' });
    await C.settled(r2.json.chat.id);
    assert.equal((await chatOf(boss)).turns.length, 4);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls2[0].messages.map(m => m.role), ['user', 'assistant', 'user']);
    assert.match(calls2[0].messages[1].content, /the board was changed/);
    assert.equal(calls2[0].messages[2].content, 'Thanks! Is that too hard for grade 1?');
  } finally { M.hooks.create = null; }
});

test('bad JSON and a timeout: a calm failed answer, the board unchanged, the words kept; Try again replaces the pair', async () => {
  const { boss } = world();
  const lines = []; AI.hooks.log = (msg, line) => lines.push({ msg, line });
  const budget = AI.AI_CALL.timeoutMs;
  try {
    standIn('Sorry, here is no JSON at all');
    const r = await say(boss, { text: 'Add two more clocks please' });
    await C.settled(r.json.chat.id);
    let chat = await chatOf(boss);
    assert.deepEqual(chat.turns.map(x => [x.role, x.failed || null]), [['me', null], ['oomba', 'error']]);
    assert.equal(chat.turns[1].for, chat.turns[0].id);
    assert.equal(chat.turns[1].change, undefined, 'nothing to put on the board');
    assert.equal(lines.at(-1).line.kind, 'bad_json'); assert.doesNotMatch(JSON.stringify(lines), /two more clocks/, 'the words are never logged');
    // A timeout: one call within the budget.
    AI.AI_CALL.timeoutMs = 60;
    const calls = standIn(() => new Promise(() => {}));
    const again = await say(boss, { text: 'Add two more clocks please', retry: chat.turns[0].id });
    await C.settled(again.json.chat.id);
    chat = await chatOf(boss);
    assert.deepEqual(chat.turns.map(x => [x.role, x.failed || null]), [['me', null], ['oomba', 'timeout']], 'Try again: the failed pair made way');
    assert.equal(calls.length, 1); assert.equal(lines.at(-1).line.kind, 'timeout');
  } finally { AI.AI_CALL.timeoutMs = budget; AI.hooks.log = null; M.hooks.create = null; }
});

test('a message naming a student, or with words the rules refuse: refused before the AI, nothing stored', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'x', action: null });
  try {
    const r = await say(boss, { text: 'Make it easier for Quinn please' });
    assert.equal(r.status, 400); assert.equal(r.json.code, 'names');
    assert.equal((await say(boss, { text: 'Call me at 555-123-4567 about clocks' })).json.code, 'personal');
    assert.equal((await say(boss, { text: 'x' })).json.code, 'brief');
    assert.equal(calls.length, 0);
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_chats WHERE owner_id=? AND turns LIKE ?', boss.id, '%Quinn%').n, 0);
    // A step on the board that names a student is left out of what the AI sees.
    const st = clockBoard(); st.__steps.push({ id: 's2', text: 'Bea goes first' });
    const ok = await as(boss)('/api/manipulatives/chat', { method: 'POST', body: { tool: 'clock', state: st, title: 'Clocks for Quinn', text: 'Is this board ready?' } });
    assert.equal(ok.status, 200); await C.settled(ok.json.chat.id);
    assert.doesNotMatch(calls[0].system, /Bea|Quinn/);
  } finally { M.hooks.create = null; }
});

test('students, teachers without the plan and guests are refused; the AI is never called', async () => {
  const { boss, A, kids } = world();
  const calls = standIn({ reply: 'x', action: null });
  try {
    // A student in a running session may open the page, never the chat.
    M.createSession(boss, { classId: A.id, tool: 'clock', title: 'Live clocks' });
    assert.equal(M.roleOf(kids[0]), 'student');
    assert.equal((await say(kids[0], { text: 'Make it easier' })).status, 404);
    assert.equal((await as(kids[0])('/api/manipulatives/chat?tool=clock')).status, 404);
    assert.equal((await say(null, { text: 'Make it easier' })).status, 404);
    TOOLS.plansOn();
    try {
      const oak = S.createSchool(boss, { name: 'Chat Free Oak' }).school;
      const free = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Fran Free', role: 'teacher' }).user.id);
      const r = await say(free, { text: 'Make it easier' });
      assert.equal(r.status, 403); assert.equal(r.json.code, 'teacherPlan');
    } finally { TOOLS.plansOn(false); }
    assert.equal(calls.length, 0);
  } finally { M.hooks.create = null; }
});

test('one turn at a time; a turn cut off by a restart ends calmly; the chat follows the board and goes with it and the account', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(async () => { await gate; return { reply: 'Done.', action: null }; });
  try {
    const r = await say(boss, { text: 'Add a title please' });
    assert.equal((await say(boss, { text: 'And another thing' })).status, 409);
    release(); await C.settled(r.json.chat.id);
    // A restart mid-turn: the row says pending, no job runs here.
    q.run("UPDATE manip_chats SET pending_id='gone1', pending_at=? WHERE id=?", Date.now(), r.json.chat.id);
    const chat = await chatOf(boss);
    assert.equal(chat.pending, null); assert.equal(chat.turns.at(-1).failed, 'restart');
    // The board gets saved (autosave): its chat moves with it.
    const b = M.autosave(boss, { tool: 'clock', title: 'Half hours', state: clockBoard() }).board;
    const saved = await chatOf(boss, `&boardId=${b.id}`);
    assert.equal(saved.id, r.json.chat.id);
    assert.equal(q.get('SELECT board_key FROM manip_chats WHERE id=?', r.json.chat.id).board_key, b.id);
    // A new board of the same tool starts a new conversation.
    assert.equal((await chatOf(boss)).id, null);
    // The board deleted: its chat goes.
    M.deleteBoard(boss, b.id);
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_chats WHERE id=?', r.json.chat.id).n, 0);
    // The account: every chat goes.
    standIn({ reply: 'Hi.', action: null });
    const r2 = await say(boss, { text: 'Hello Oomba' }); await C.settled(r2.json.chat.id);
    M.forgetUser(boss.id);
    assert.equal(q.get('SELECT COUNT(*) n FROM manip_chats WHERE owner_id=?', boss.id).n, 0);
  } finally { M.hooks.create = null; }
});

test('the board context: drafted items in the practice-set form, a hand-made board as "free", no typed text', () => {
  const ctx = C.boardContext('clock', clockBoard());
  assert.deepEqual(ctx.items.map(i => [i.box, i.time, i.answerKey]), [['answer', '3:30', '3:30'], ['answer', '7:30', '7:30']]);
  assert.deepEqual(ctx.steps, ['Read each clock.']);
  assert.doesNotMatch(JSON.stringify(ctx), /Secret|Half hours/);
  const money = C.boardContext('money', { v: 2, objects: [], pieces: [{ kind: 'quarter', value: 25, x: 1, y: 1 }, { kind: 'dime', value: 10, x: 60, y: 1 }] });
  assert.deepEqual(money.items, []); assert.equal(money.free.piecesTotal, 35);
  const fr = M.sanitizeDraft({ title: 'F', steps: ['Solve.'], items: [{ op: '+', a: '1/4', b: '1/2', box: 'answer' }] }, 'fraction-tiles');
  assert.equal(C.boardContext('fraction-tiles', fr.board).items[0].op, '+');
});

test('readAnswer: only a reply, a replace draft built by the code, nothing else', () => {
  assert.throws(() => C.readAnswer(null, 'clock'), SyntaxError);
  assert.throws(() => C.readAnswer({ reply: '' }, 'clock'), SyntaxError);
  assert.deepEqual(C.readAnswer({ reply: 'Hi', action: { op: 'edit', changes: [] } }, 'clock'), { reply: 'Hi', change: null });
  assert.equal(C.readAnswer({ reply: 'Hi', action: { op: 'replace', draft: { title: 'X', items: [{ time: '99:99' }] } } }, 'clock').note, 'notBuilt');
  const ok = C.readAnswer({ reply: 'Hi', action: { op: 'replace', draft: { title: 'X', steps: ['Go.'], items: [{ time: '1:00' }] } } }, 'clock');
  assert.equal(ok.change.n, 1); assert.equal(typeof ok.change.state, 'string');
});
