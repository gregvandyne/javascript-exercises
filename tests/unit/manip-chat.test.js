// The Manipulatives board workflow (docs/decisions.md "Virtual math manipulatives: Oomba chat", services/manip-chat.js).
// Since one chat everywhere ("Oomba teaching companion: one chat everywhere") the board's Oomba is the site's companion:
// every behavior of the old per-board chat is tested through it in tests/unit/companion-manip.test.js. What stays here:
// the old table, its cleanup, and the workflow's pure parts (the board context, readAnswer).
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

test('the old per-board conversations go with their board and the account (no longer written: one chat everywhere)', () => {
  const { boss } = world();
  const b = M.autosave(boss, { tool: 'clock', title: 'Half hours', state: clockBoard() }).board;
  q.run("INSERT INTO manip_chats(id, owner_id, board_key, tool, grade, turns, updated_at) VALUES ('mc1',?,?,'clock','','[]',?)", boss.id, b.id, Date.now());
  M.deleteBoard(boss, b.id);
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_chats WHERE id='mc1'").n, 0);
  q.run("INSERT INTO manip_chats(id, owner_id, board_key, tool, grade, turns, updated_at) VALUES ('mc2',?,'new:clock','clock','','[]',?)", boss.id, Date.now() - 61 * 86400e3);
  C.prune();
  assert.equal(q.get("SELECT COUNT(*) n FROM manip_chats WHERE id='mc2'").n, 0, 'after 60 days');
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
