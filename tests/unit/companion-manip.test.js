// The Manipulatives board through Oomba, the site's one companion chat (docs/decisions.md "Oomba teaching companion: one
// chat everywhere"; services/companion.js with the board workflow of services/manip-chat.js). The behaviors of the old
// per-board chat (tests/unit/manip-chat.test.js before the move), through the companion: a reply-only turn (the AI sees
// the board but no sticky notes, typed text or names), a turn that changes the board (built and checked by the code,
// put on the board once by the page), the next turn carrying the history, failures (a timeout, a board that cannot be
// built: the board unchanged, Try again), names never reaching the AI, who may use it, one turn at a time, and routing:
// on a board "add 4 clocks" changes the board; an unrelated request (a book, the dashboard, how to invite a teacher)
// uses the general tools and never touches the board. The AI is a stand-in (services/companion.js hooks.create).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const M = await import('../../server/services/manipulatives.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const AI = await import('../../server/services/ai-call.js');
const RL = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; AI.hooks.log = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null; try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json };
};
let n = 0;
function world() {
  const k = ++n;
  const boss = createUser({ username: `CoManBoss${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `CoMan Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `4C-${k}` }).class;
  const kid = name => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { boss, oak, A, kids: [kid('Quinn Marsh'), kid('Bea Tumble')] };
}
/** The stand-in AI: answer(params, i) -> { reply, draft? } (a draft is sent with changeBoard first), { tool, input }
 *  (another tool first), or throws. */
function standIn(answer) {
  const calls = []; let turn = 0;
  CO.hooks.create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const last = p.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    const a = typeof answer === 'function' ? await answer(p, afterTool ? turn - 1 : turn++) : answer;
    const text = s => ({ model: p.model, usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
    if (afterTool) return text(a.reply);
    if (a.draft) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: 'changeBoard', input: a.draft }] };
    if (a.tool) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${calls.length}`, name: a.tool, input: a.input || {} }] };
    return text(a.reply);
  };
  return calls;
}
const clockBoard = () => {
  const d = M.sanitizeDraft({ title: 'Half hours', steps: ['Read each clock.'], items: [{ time: '3:30', box: 'answer' }, { time: '7:30', box: 'answer' }] }, 'clock');
  return { ...d.board, __steps: [{ id: 's1', text: 'Read each clock.' }], __ann: { ...d.board.__ann, notes: [{ id: 'n1', text: 'Secret sticky for Bea', x: 0.5, y: 0.5 }], strokes: [] } };
};
const page = (extra = {}) => ({ type: 'manip', tool: 'clock', ...extra });
const say = (who, body = {}) => as(who)('/api/companion/chat', { body: { page: page(), board: { tool: 'clock', title: 'Half hours', state: clockBoard(), grade: '2', ...(body.board || {}) }, ...body } });
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const reset = async who => { await C.allSettled(); CO.reset(who); };

test('a reply-only turn: answered in the background, no change; the AI sees the board but no notes or names', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'Both clocks show half past. Ask me for more!' });
  try {
    const r = await say(boss, { text: 'What do these clocks show?' });
    assert.equal(r.status, 200);
    assert.equal(r.json.chat.turns.at(-1).text, 'What do these clocks show?');
    assert.ok(r.json.chat.pending, 'the answer is on its way');
    await C.allSettled();
    const chat = await chatOf(boss);
    assert.equal(chat.pending, null);
    assert.deepEqual(chat.turns.map(x => x.role), ['me', 'oomba']);
    assert.equal(chat.turns[1].text, 'Both clocks show half past. Ask me for more!');
    assert.equal(chat.turns[1].note.manip, undefined);
    assert.equal(calls.length, 1);
    const sys = calls[0].system;
    assert.equal(calls[0].model, config.companionModel || config.builderModel);
    assert.ok(calls[0].tools.some(x => x.name === 'changeBoard'), 'the board\'s tool on its page');
    assert.match(sys, /Clock/); assert.match(sys, /grade 2/); assert.match(sys, /"time":"3:30"/); assert.match(sys, /"answerKey":"3:30"/);
    assert.match(sys, /Read each clock\./); assert.match(sys, /Half hours/);
    assert.doesNotMatch(JSON.stringify(calls[0]), /Secret sticky|Bea|Quinn|Tumble|Marsh/, 'no sticky note text, no student names');
    assert.deepEqual(calls[0].messages.map(m => m.role), ['user']); assert.equal(calls[0].messages[0].content, 'What do these clocks show?');
    // The stored message keeps the board as the AI saw it (kinds and numbers), never its notes.
    const row = q.get("SELECT turns FROM oomba_chats WHERE owner_id=? AND surface='companion'", boss.id);
    assert.doesNotMatch(row.turns, /Secret sticky/);
  } finally { await reset(boss); }
});

test('a turn that changes the board: the code builds and checks it; the page puts it on once; the next turn carries the history', async () => {
  const { boss } = world();
  standIn({ reply: 'I made it four clocks to the quarter hour.', draft: { title: 'Quarter hours', steps: ['Read each clock.', 'Write the time.'],
    items: [{ time: '3:15', box: 'answer' }, { time: '3:15', box: 'answer' }, { time: '25:99', box: 'answer' }, { time: '9:45', box: 'build', label: 'Last one' }] } });
  try {
    await say(boss, { text: 'Make it quarter hours, four clocks' }); await C.allSettled();
    const t = (await chatOf(boss)).turns[1];
    assert.equal(t.text, 'I made it four clocks to the quarter hour.');
    const m = t.note.manip;
    assert.equal(m.tool, 'clock'); assert.equal(m.title, 'Quarter hours'); assert.equal(m.n, 3, 'the repeat made distinct, the impossible time dropped'); assert.equal(m.steps, 2);
    assert.ok(!m.applied);
    const st = JSON.parse(m.state);
    assert.equal(st.v, 2); assert.deepEqual(st.__steps.map(s => s.text), ['Read each clock.', 'Write the time.']);
    assert.ok(M.cleanState(st, null, 'clock').ok, 'a board the server accepts');
    const clocks = st.objects.filter(o => o.k === 'clock');
    assert.equal(clocks.length, 3); assert.equal(new Set(clocks.map(o => `${o.st.h}:${o.st.m}`)).size, 3);
    assert.deepEqual(t.note.steps.map(s => s.k), ['board']);
    // The page put it on the board: marked, not offered again.
    assert.equal((await as(boss)('/api/companion/chat/act', { body: { turnId: t.id, act: 'manipApplied' } })).status, 200);
    assert.equal((await chatOf(boss)).turns[1].note.manip.applied, true);
    const calls2 = standIn({ reply: 'Sure.' });
    await say(boss, { text: 'Thanks! Is that too hard for grade 1?' }); await C.allSettled();
    assert.equal((await chatOf(boss)).turns.length, 4);
    assert.deepEqual(calls2[0].messages.map(x => x.role), ['user', 'assistant', 'user']);
    assert.match(calls2[0].messages[1].content, /four clocks/);
    assert.equal(calls2[0].messages[2].content, 'Thanks! Is that too hard for grade 1?');
  } finally { await reset(boss); }
});

test('failures: a timeout and a board that cannot be built leave the board unchanged and the words kept; Try again replaces the pair', async () => {
  const { boss } = world();
  const lines = []; AI.hooks.log = (msg, line) => lines.push({ msg, line });
  const budget = AI.AI_CALL.timeoutMs;
  try {
    standIn((p, i) => (i === 0 ? { reply: 'I could not make that board.', draft: { title: 'X', items: [{ time: '99:99' }] } } : { reply: 'ok' }));
    await say(boss, { text: 'Add two more clocks please' }); await C.allSettled();
    let chat = await chatOf(boss);
    assert.equal(chat.turns[1].note.manip, undefined, 'nothing to put on the board');
    AI.AI_CALL.timeoutMs = 60;
    const calls = standIn(() => new Promise(() => {}));
    await say(boss, { text: 'Add two more clocks please' }); await C.allSettled();
    chat = await chatOf(boss);
    const failed = chat.turns.at(-1);
    assert.equal(failed.failed, 'timeout'); assert.equal(calls.length, 1);
    assert.equal(lines.at(-1).line.kind, 'timeout'); assert.doesNotMatch(JSON.stringify(lines), /two more clocks/, 'the words are never logged');
    AI.AI_CALL.timeoutMs = budget;
    standIn({ reply: 'Done.' });
    await say(boss, { text: 'Add two more clocks please', retry: failed.for }); await C.allSettled();
    chat = await chatOf(boss);
    assert.deepEqual(chat.turns.slice(-2).map(x => [x.role, x.failed || null]), [['me', null], ['oomba', null]], 'Try again: the failed pair made way');
  } finally { AI.AI_CALL.timeoutMs = budget; AI.hooks.log = null; await reset(boss); }
});

test('names never reach the AI: taken out of the message; a step or title on the board that names a student is left out', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'x' });
  try {
    const r = await say(boss, { text: 'Make it easier for Quinn please' });
    assert.equal(JSON.parse(q.get("SELECT turns FROM oomba_chats WHERE owner_id=? AND surface='companion'", boss.id).turns).filter(t => t.role === 'me').at(-1).text, 'Make it easier for [student 1] please');
    assert.equal((await say(boss, { text: '  ' })).json.code, 'brief');
    await C.allSettled();
    const st = clockBoard(); st.__steps.push({ id: 's2', text: 'Bea goes first' });
    await say(boss, { text: 'Is this board ready?', board: { state: st, title: 'Clocks for Quinn' } }); await C.allSettled();
    assert.doesNotMatch(JSON.stringify(calls), /Bea|Quinn/);
  } finally { await reset(boss); }
});

test('students, teachers without the plan and guests get nothing; the AI is never called', async () => {
  const { boss, A, kids } = world();
  const calls = standIn({ reply: 'x', draft: { title: 'X', items: [{ time: '1:00' }] } });
  try {
    M.createSession(boss, { classId: A.id, tool: 'clock', title: 'Live clocks' });
    assert.equal(M.roleOf(kids[0]), 'student');
    assert.equal((await say(kids[0], { text: 'Make it easier' })).status, 404);
    assert.equal((await say(null, { text: 'Make it easier' })).status, 404);
    TOOLS.plansOn();
    try {
      const oak = S.createSchool(boss, { name: `CoMan Free Oak ${n}` }).school;
      const free = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Fran Free', role: 'teacher' }).user.id);
      assert.equal((await say(free, { text: 'Make it easier' })).status, 404);
    } finally { TOOLS.plansOn(false); }
    assert.equal(calls.length, 0);
  } finally { await reset(boss); }
});

test('one turn at a time; a turn cut off by a restart ends calmly with Try again', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(async () => { await gate; return { reply: 'Done.' }; });
  try {
    await say(boss, { text: 'Add a title please' });
    assert.equal((await say(boss, { text: 'And another thing' })).status, 409);
    assert.equal(C.handOff(), 1); C._reset();
    const { q: _q } = { q };
    _q.run("UPDATE oomba_turns SET created_at=? WHERE owner_id=? AND status='interrupted'", Date.now() - 3600e3, boss.id);
    C.recover();
    assert.equal((await chatOf(boss)).turns.at(-1).failed, 'restart');
    release();
  } finally { await reset(boss); }
});

test('routing on a board: "add 4 clocks" changes the board; an unrelated request (a book, a dashboard timer, inviting a teacher) uses the general tools and never touches the board', async () => {
  const { boss } = world();
  try {
    standIn({ reply: 'Here are four clocks.', draft: { title: 'Half hours', steps: ['Read each clock.'], items: ['3:30', '7:30', '1:30', '9:30'].map(time => ({ time, box: 'answer' })) } });
    await say(boss, { text: 'add 4 clocks' }); await C.allSettled();
    const t = (await chatOf(boss)).turns.at(-1);
    assert.equal(t.note.manip.n, 4);
    assert.equal(JSON.parse(t.note.manip.state).objects.filter(o => o.k === 'clock').length, 4);
    for (const [words, tool, input, kind] of [
      ['find me a book for a level M reader', 'searchBooks', { words: 'animals', readingLevel: 'M' }, 'booksLevel'],
      ['add a timer to my dashboard', 'proposeDashboardChange', { changes: [{ op: 'add', type: 'timer' }] }, 'dashNo'],
      ['how do I invite a teacher', 'explainOomba', { topic: 'invite a teacher' }, 'explain'],
    ]) {
      const calls = standIn({ reply: 'Here you go.', tool, input });
      await say(boss, { text: words }); await C.allSettled();
      const last = (await chatOf(boss)).turns.at(-1);
      assert.equal(last.note.manip, undefined, `${words}: the board is not touched`);
      assert.deepEqual(last.note.steps.map(s => s.k), [kind], words);
      assert.match(calls[0].system, /Use it only for requests about what is on this page/);
    }
  } finally { await reset(boss); }
});
