// Oomba runs several jobs at once (docs/decisions.md "Oomba runs several jobs at once"; services/oomba-jobs.js,
// services/companion.js). With the AI a stand-in (services/companion.js hooks.create) and the jobs held by a gate
// (services/oomba-jobs.js hooks.gate):
//   - three makes in one answer start three jobs; the reply comes back before they finish and never says they are done;
//   - the cap: a teacher's 4th job waits until one of the first three ends;
//   - each job's card ends done with the same thing the inline tool makes (the same functions, read back);
//   - a job that fails (the AI budget spent) ends failed with its reason; Try again runs it again, once;
//   - a restart (recover) puts a running job back in the queue once; one that already ran twice ends failed;
//   - a new message is answered while jobs run;
//   - read-only tool calls of one response run side by side; tools that write stay in order, results in order;
//   - nothing that changes a class is ever a job (assign stays a card for the teacher's tap).
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
const M = await import('../../server/services/manipulatives.js');
const F = await import('../../server/services/figures.js');
const AB = await import('../../server/services/ai-budget.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const J = await import('../../server/services/oomba-jobs.js');

seed({ quiet: true });
let server, base;
test.before(async () => { server = createApp().listen(0, '127.0.0.1'); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(async () => { if (lastGate) lastGate.off(); CO.hooks.create = null; CO.hooks.tool = null; J.hooks.gate = null; await J.idle(); server.close(); });
let lastGate = null;
test.beforeEach(() => { RL._reset(); if (lastGate) lastGate.off(); lastGate = null; });

const get = (p, cookie = '') => fetch(base + p, { redirect: 'manual', headers: cookie ? { cookie } : {} });
const post = (p, body, cookie = '') => fetch(base + p, { method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body || {}) });
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
let n = 0;
const uname = p => `${p}${++n}x${Date.now() % 1000}`.slice(0, 16);

function world() {
  const admin = createUser({ username: uname('OJAdm'), password: 'admin-pass-12345' });
  const s = S.createSchool({ id: admin.id }, { name: `Jobs ${++n}` }).school;
  S.addMember({ id: admin.id }, s.id, admin.id, 'admin', { rosterName: 'Ms Admin' });
  const teacher = createUser({ username: uname('OJT'), password: 'teach-pass-12345' });
  S.addMember({ id: admin.id }, s.id, teacher.id, 'teacher', { rosterName: 'Mr Teach' });
  config.manipulativesUsers = [...(config.manipulativesUsers || []), getUser(teacher.id).username.toLowerCase()];
  const A = S.createClass({ id: teacher.id }, s.id, { name: '4b math', grade: '4' }).class;
  const kid = S.createSchoolAccount({ id: admin.id }, s.id, { rosterName: 'Maya Brook', grade: '4' }).user;
  S.addToClass({ id: admin.id }, A.id, kid.id, 'student');
  return { s, teacher: getUser(teacher.id), A: S.getClass(A.id), tc: cookieFor(teacher.id) };
}
/** The stand-in AI: script(params, i) -> a response (or the reply's words); i: the call of this answer. */
function standIn(script) {
  const calls = []; let answerStart = 0;
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1);
    if (!(Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result'))) answerStart = calls.length - 1;
    const r = await script(params, calls.length - 1 - answerStart, calls);
    const res = typeof r === 'string' ? { stop_reason: 'end_turn', content: [{ type: 'text', text: r }] } : r;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, ...res };
  };
  return calls;
}
let tuN = 0;
const uses = (...list) => ({ stop_reason: 'tool_use', content: list.map(([name, input]) => ({ type: 'tool_use', id: `tu_${++tuN}`, name, input })) });
const say = async (x, text, page = { type: 'teach' }) => { const r = await post('/api/companion/chat', { text, page }, x.tc); assert.equal(r.status, 200, await r.clone().text()); await C.allSettled(); return r.json(); };
const chatOf = async cookie => (await (await get('/api/companion/chat', cookie)).json()).chat;
const lastBot = async cookie => (await chatOf(cookie)).turns.filter(t => t.role === 'oomba').at(-1);
const act = async (cookie, turnId, a, value) => (await post('/api/companion/chat/act', { turnId, act: a, ...(value !== undefined ? { value } : {}) }, cookie)).json();
const lastResults = calls => { for (let i = calls.length - 1; i >= 0; i--) { const m = calls[i].messages.at(-1); if (Array.isArray(m.content) && m.content[0] && m.content[0].type === 'tool_result') return m.content; } return null; };
const jobRows = u => q.all('SELECT * FROM oomba_jobs WHERE owner_id=? ORDER BY created_at, rowid', u.id);
const tick = () => new Promise(r => setImmediate(r));

/** A gate holding every job before its work; release(i) or releaseAll() lets them go. */
function gate() {
  const held = [];
  J.hooks.gate = job => new Promise(res => held.push({ job, res }));
  lastGate = { held, release: i => held[i].res(), releaseAll: () => { for (const h of held) h.res(); }, off: () => { J.hooks.gate = null; for (const h of held) h.res(); } };
  return lastGate;
}
const until = async (fn, ms = 3000) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 5)); } };

const SHEET = { title: 'Fractions with bar graphs', grade: '4', items: [[3, 4], [5, 2], [6, 6]].map(([a, b]) => ({ kind: 'barGraph', question: `How many in all? (${a} + ${b})`, data: { categories: ['First', 'Second'], values: [a, b], ytitle: 'Count' }, answerType: 'number', answerKey: 'total' })) };
const BOARD = { tool: 'base-ten-blocks', title: 'Showing 245', steps: ['Count the hundreds, tens and ones.'], items: [{ value: 245, box: 'none' }] };
const LESSON = { topic: 'fractions', grade: '4', subject: 'math' };
const THREE = 'Make a fractions worksheet, a lesson plan on fractions and a base-ten blocks board showing 245';

test('three makes in one answer start three jobs; the reply comes back first; each card ends done with what the inline tool makes', async () => {
  const x = world(), g = gate();
  const calls = standIn((p, i) => (i === 0 ? uses(['makeWorksheet', SHEET], ['makeLesson', LESSON], ['makeBoard', BOARD]) : 'I made the worksheet, the lesson plan and the board. They are ready.'));
  await say(x, THREE);
  // The AI was told at once that each was started, never that it is made.
  const rs = lastResults(calls).map(r => JSON.parse(r.content));
  assert.equal(rs.length, 3);
  for (const r of rs) { assert.equal(r.started, true); assert.equal(r.made, false); assert.match(r.note, /^Started: the card fills in when it is ready; say it is being made, never that it is done\./); }
  // The answer is there while every job is still waiting or running.
  let bot = await lastBot(x.tc);
  assert.doesNotMatch(bot.text, /I made|They are ready\./, 'no claim that anything is done');
  assert.match(bot.text, /They are being made now: the 3 cards below fill in when they are ready\./);
  assert.deepEqual(bot.note.jobs.map(j => j.kind), ['sheet', 'lesson', 'board']);
  await tick();
  bot = await lastBot(x.tc);
  assert.ok(bot.note.jobs.every(j => j.state === 'queued' || j.state === 'running'), 'not done yet');
  assert.equal(F.listWorksheets(x.teacher).length, 0, 'nothing made yet');
  assert.equal(M.listRecent(x.teacher).length, 0);
  assert.ok(!bot.note.jobs.some(j => 'input' in j), 'the card carries no job input');
  g.off();
  await J.idle();
  bot = await lastBot(x.tc);
  assert.deepEqual(bot.note.jobs.map(j => j.state), ['done', 'done', 'done']);
  const [sheet, lesson, board] = bot.note.jobs.map(j => j.made);
  assert.equal(sheet.kind, 'sheet'); assert.equal(sheet.href, `/figures/worksheets/${sheet.id}`); assert.equal(sheet.n, 3);
  assert.equal(lesson.kind, 'lesson'); assert.ok(lesson.n > 0); assert.match(lesson.href, new RegExp(`^/teach/lessons/${lesson.id}\\?drafted=`));
  assert.equal(board.kind, 'board'); assert.equal(board.href, `/manipulatives#board/${board.id}`);
  for (const r of jobRows(x.teacher)) { assert.equal(r.state, 'done'); assert.equal(r.attempt, 1); assert.ok(JSON.parse(r.result).id); }
  // The same as the inline tool makes: one make alone runs inline (as before) and gives the same thing.
  standIn((p, i) => (i === 0 ? uses(['makeWorksheet', SHEET]) : 'I made the worksheet.'));
  await say(x, 'Make a fractions worksheet');
  const inline = (await lastBot(x.tc)).note.made;
  assert.ok(inline && inline.id && !(await lastBot(x.tc)).note.jobs, 'one make is inline');
  const shape = id => F.itemsOf(id).map(it => [it.kind, it.question, it.answer]);
  assert.deepEqual(shape(sheet.id), shape(inline.id));
  assert.equal(sheet.title, inline.title); assert.equal(sheet.n, inline.n);
  standIn((p, i) => (i === 0 ? uses(['makeBoard', BOARD]) : 'I made the board.'));
  await say(x, 'Make a base-ten blocks board showing 245');
  const inB = (await lastBot(x.tc)).note.made;
  const noIds = st => st.replace(/"(id|g)":"[a-z0-9]+"/g, '"$1":""');
  assert.equal(noIds(M.ownBoard(x.teacher, board.id).state), noIds(M.ownBoard(x.teacher, inB.id).state), 'the same board (ids aside)');
  assert.equal(board.title, inB.title); assert.equal(board.n, inB.n);
  await C.allSettled(); CO.reset(x.teacher);
});

test('the cap: a teacher\'s 4th job waits until one of the first three ends; a new message is answered meanwhile', async () => {
  const x = world(), g = gate();
  standIn((p, i) => (i === 0 ? uses(['makeWorksheet', SHEET], ['makeBoard', BOARD], ['makeWorksheet', { ...SHEET, title: 'Second sheet' }], ['makeBoard', { ...BOARD, title: 'Second board' }]) : 'Making them now.'));
  await say(x, 'Make two worksheets and two base-ten blocks boards showing 245');
  await until(() => g.held.length === 3);
  await tick();
  let rows = jobRows(x.teacher);
  assert.equal(rows.length, 4);
  assert.deepEqual(rows.map(r => r.state), ['running', 'running', 'running', 'queued'], 'three at once, the 4th waits');
  assert.equal(J.perTeacher(), 3);
  // The chat stays usable: a new message is answered while the jobs run.
  standIn(() => 'Sure, fractions are parts of a whole.');
  const r = await post('/api/companion/chat', { text: 'What is a fraction?', page: { type: 'teach' } }, x.tc);
  assert.equal(r.status, 200);
  await C.allSettled();
  assert.equal((await lastBot(x.tc)).text, 'Sure, fractions are parts of a whole.');
  assert.equal(jobRows(x.teacher).filter(j => j.state === 'running').length, 3, 'the jobs are still running');
  // One ends: the 4th starts.
  g.release(0);
  await until(() => g.held.length === 4);
  rows = jobRows(x.teacher);
  assert.equal(rows[0].state, 'done'); assert.equal(rows[3].state, 'running');
  g.off();
  await J.idle();
  assert.ok(jobRows(x.teacher).every(j => j.state === 'done'));
  const bot = (await chatOf(x.tc)).turns.find(t => t.note && t.note.jobs);
  assert.ok(bot.note.jobs.every(j => j.state === 'done' && j.made && j.made.id));
  assert.equal(F.listWorksheets(x.teacher).length, 2); assert.equal(M.listRecent(x.teacher).length, 2);
  await C.allSettled(); CO.reset(x.teacher);
});

test('a failing job ends failed with its reason; Try again runs the same job again, once', async () => {
  const x = world();
  const spend = () => AB.recordSpend('test-jobs', 1e6);
  const unspend = () => { q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); };
  try {
    let g = gate();
    standIn((p, i) => (i === 0 ? uses(['makeLesson', LESSON], ['makeWorksheet', SHEET]) : 'Making them now.'));
    await say(x, 'Make a lesson plan on fractions and a fractions worksheet');
    await until(() => g.held.length === 2);
    spend();   // the AI budget is spent while the jobs wait: the lesson's AI call is refused
    g.off();
    await J.idle();
    let bot = await lastBot(x.tc);
    const [lj, sj] = bot.note.jobs;
    assert.equal(lj.state, 'failed'); assert.equal(lj.error, 'budgetDay', 'the budget reason');
    assert.equal(sj.state, 'done', 'a make without AI is not stopped by the budget');
    assert.equal(q.get("SELECT COUNT(*) n FROM lessons WHERE owner_id=? AND kind!='game'", x.teacher.id).n, 0, 'nothing saved');
    // Try again (still spent): the same job runs again and fails again; a second Try again is refused.
    let r = await act(x.tc, bot.id, 'jobRetry', lj.id);
    assert.ok(r.chat, JSON.stringify(r));
    await J.idle();
    bot = await lastBot(x.tc);
    assert.equal(bot.note.jobs[0].state, 'failed'); assert.equal(bot.note.jobs[0].retried, true);
    assert.equal(jobRows(x.teacher).find(j => j.id === lj.id).retried, 1);
    r = await act(x.tc, bot.id, 'jobRetry', lj.id);
    assert.equal(r.code, 'notFound', 'Try again only once');
    // Another answer's job: failed, then Try again with the budget back makes it.
    unspend();
    g = gate();
    standIn((p, i) => (i === 0 ? uses(['makeLesson', LESSON], ['makeBoard', BOARD]) : 'Making them now.'));
    await say(x, 'Make a lesson plan on fractions and a base-ten blocks board showing 245');
    await until(() => g.held.length === 2);
    spend(); g.off(); await J.idle(); unspend();
    bot = await lastBot(x.tc);
    assert.equal(bot.note.jobs[0].state, 'failed');
    r = await act(x.tc, bot.id, 'jobRetry', bot.note.jobs[0].id);
    assert.ok(r.chat);
    await J.idle();
    bot = await lastBot(x.tc);
    assert.equal(bot.note.jobs[0].state, 'done'); assert.equal(bot.note.jobs[0].made.kind, 'lesson');
    assert.equal(q.get("SELECT COUNT(*) n FROM lessons WHERE owner_id=? AND kind!='game'", x.teacher.id).n, 1);
    // A job of someone else's chat cannot be retried from here.
    assert.equal(J.retry('someone-else', lj.id), false);
  } finally { unspend(); J.hooks.gate = null; }
  await C.allSettled(); CO.reset(x.teacher);
});

test('a restart re-queues a running job once; a job that already ran twice ends failed', async () => {
  const x = world(), g = gate();
  standIn((p, i) => (i === 0 ? uses(['makeWorksheet', SHEET], ['makeBoard', BOARD]) : 'Making them now.'));
  await say(x, 'Make a fractions worksheet and a base-ten blocks board showing 245');
  await until(() => g.held.length === 2);
  // The process "restarts": its in-memory jobs are gone; the rows still say running.
  J._reset();
  let out = J.recover();
  assert.deepEqual(out, { requeued: 2, stopped: 0 });
  await until(() => g.held.length === 4);
  let rows = jobRows(x.teacher);
  assert.deepEqual(rows.map(r => [r.state, r.attempt]), [['running', 2], ['running', 2]], 'running again: the second attempt');
  // A second restart while they run their second time: they end failed ('restart'), with a card that says so.
  J._reset();
  out = J.recover();
  assert.deepEqual(out, { requeued: 0, stopped: 2 });
  g.off();
  await new Promise(r => setTimeout(r, 20));
  rows = jobRows(x.teacher);
  assert.deepEqual(rows.map(r => [r.state, r.error]), [['failed', 'restart'], ['failed', 'restart']]);
  const bot = await lastBot(x.tc);
  assert.deepEqual(bot.note.jobs.map(j => [j.state, j.error]), [['failed', 'restart'], ['failed', 'restart']]);
  assert.equal(F.listWorksheets(x.teacher).length, 0, 'an attempt that is no longer current writes nothing');
  assert.equal(M.listRecent(x.teacher).length, 0);
  // Try again still works after a restart.
  const r = await act(x.tc, bot.id, 'jobRetry', bot.note.jobs[0].id);
  assert.ok(r.chat);
  await J.idle();
  assert.equal((await lastBot(x.tc)).note.jobs[0].state, 'done');
  assert.equal(F.listWorksheets(x.teacher).length, 1);
  await C.allSettled(); CO.reset(x.teacher);
});

test('read-only tools of one response run side by side; tools that write stay in order; results keep the order', async () => {
  const x = world();
  const log = [];
  let live = 0, most = 0;
  CO.hooks.tool = async name => { live++; most = Math.max(most, live); log.push(`+${name}`); await new Promise(r => setTimeout(r, 25)); log.push(`-${name}`); live--; };
  try {
    const resp = uses(['searchGames', { topic: 'fractions' }], ['searchBooks', { words: 'fractions' }], ['figuresKinds', { topic: 'number line' }], ['makeBoard', BOARD], ['createClass', { name: 'Room 9' }], ['searchLessons', { topic: 'fractions' }]);
    const calls = standIn((p, i) => (i === 0 ? resp : 'Here you go.'));
    await say(x, 'Find fraction games, books and lessons, make a base-ten blocks board showing 245 and create the class Room 9');
    const at = k => log.indexOf(k);
    // The three reads started before any of them ended.
    for (const a of ['+searchGames', '+searchBooks', '+figuresKinds']) assert.ok(at(a) < at('-searchGames') && at(a) < at('-searchBooks') && at(a) < at('-figuresKinds'), log.join(' '));
    assert.equal(most, 3, 'three at once');
    // The writes run alone, in order, after the reads.
    assert.ok(at('-figuresKinds') < at('+makeBoard') && at('-makeBoard') < at('+createClass') && at('-createClass') < at('+searchLessons'), log.join(' '));
    // Results in the response's order.
    const res = lastResults(calls);
    assert.deepEqual(res.map(r => r.tool_use_id), resp.content.map(c => c.id));
    assert.ok(JSON.parse(res[0].content).games, 'searchGames first'); assert.ok(JSON.parse(res[1].content).books, 'searchBooks second');
    assert.equal(JSON.parse(res[3].content).made, true, 'one make alone runs inline');
  } finally { CO.hooks.tool = null; }
  await C.allSettled(); CO.reset(x.teacher);
});

test('nothing that changes a class is ever a job: an assign in the same answer stays a card for the teacher\'s tap', async () => {
  const x = world(), g = gate();
  const open = () => q.all('SELECT cl.id FROM class_lessons cl WHERE cl.class_id=? AND cl.removed_at IS NULL', x.A.id).length;
  const before = open();
  standIn((p, i) => (i === 0 ? uses(['makeWorksheet', SHEET], ['makeBoard', BOARD], ['assign', { kind: 'game', id: 'word-hunt', classRef: x.A.id }]) : 'Making them; tap Assign to hand out the game.'));
  await say(x, 'Make a fractions worksheet and a base-ten blocks board showing 245, and assign Word Hunt to 4b math');
  g.off();
  await J.idle();
  const bot = await lastBot(x.tc);
  assert.deepEqual(bot.note.jobs.map(j => [j.kind, j.state]), [['sheet', 'done'], ['board', 'done']], 'only the makes are jobs');
  assert.ok(bot.note.assign, 'the assign is a confirm card');
  assert.equal(open(), before, 'nothing assigned before the tap');
  assert.deepEqual(J.kindIds().sort(), ['board', 'lesson', 'sheet'], 'the only job kinds are makes');
  assert.throws(() => J.enqueue(x.teacher.id, 'x', null, [{ id: 'j1', kind: 'assign', input: {} }]), /unknown job kind/);
  assert.ok(jobRows(x.teacher).every(r => ['sheet', 'board', 'lesson'].includes(r.kind)));
  await C.allSettled(); CO.reset(x.teacher);
});
