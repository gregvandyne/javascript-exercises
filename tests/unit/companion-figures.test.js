// Figures through Oomba, the site's one companion chat (docs/decisions.md "Oomba teaching companion: one chat
// everywhere"; services/companion.js with the worksheet workflow of services/figures-chat.js). The behaviors of the old
// per-worksheet chat (tests/unit/figures-chat.test.js before the move), through the companion: the first message on a
// worksheet drafts it as a job (progress steps, answers from OF.solve, no names to the AI), a refine turn changes only
// the questions it names (units are the app's, every answer worked out again), the AI's items are checked and repaired
// like a draft's, Undo puts back only what is still as Oomba left it, names never reach the AI (taken out, and checked
// again when the job starts), who may use it, one live turn per teacher, calm failures with Try again, the budget
// resting with "Add a starter set instead", a restart, the menu's "Describe what you need" and "finished while you were
// away", "Ask Oomba about this", and routing: an off-topic request on a worksheet uses the general tools and leaves the
// worksheet as it is. The AI is a stand-in (services/companion.js hooks.create) that answers with the page's tool.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/figures.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const AI = await import('../../server/services/ai-call.js');
const RL = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; F.hooks.log = null; AI.hooks.log = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { method = 'GET', body } = {}) => {
  const headers = who ? { cookie: cookieFor(who.id) } : {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  let json = null; try { json = await r.json(); } catch { /* not json */ }
  return { status: r.status, json };
};
let n = 0;
function world() {
  const k = ++n;
  const boss = createUser({ username: `CoFigBoss${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `CoFig Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `4F-${k}` }).class;
  const kid = name => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { boss, oak, A, kids: [kid('Quinn Marsh'), kid('Bea Tumble')] };
}
/** The stand-in AI. answer(params, i) -> what the worksheet workflow answered before the move ({ reply, title?, grade?,
 *  units?, edits }), or a function of the call. It calls editWorksheet with the change, then says the reply. A throw is a
 *  failed AI call. gate: a promise each first call waits on. */
function standIn(answer, { gate = null } = {}) {
  const calls = [];
  let turn = 0;
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1), afterTool = Array.isArray(last.content) && last.content.some(c => c.type === 'tool_result');
    if (!afterTool && gate) await gate();
    const a = typeof answer === 'function' ? await answer(params, afterTool ? turn - 1 : turn++) : answer;
    const text = s => ({ model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'end_turn', content: [{ type: 'text', text: s }] });
    if (afterTool || !a || (!a.edits?.length && !a.title && !a.grade && !a.units)) return text(a ? a.reply : '');
    const { reply, ...input } = a;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu_${calls.length}`, name: 'editWorksheet', input: { edits: [], ...input } }] };
  };
  return calls;
}
const rect = (AB, BC, key, question, u = 'cm') => ({ kind: 'rectangle', data: { AB, BC, unit: u }, question, answerType: 'number', answerKey: key });
const FIRST = [
  rect(6, 4, 'area', 'What is the area of the rectangle?'), rect(9, 5, 'perimeter', 'What is the perimeter of the rectangle?'),
  rect(7, 3, 'area', 'Find the area of the rectangle.'), { kind: 'triangle', data: { AB: 6, BC: 8, B: 90, unit: 'cm' }, question: 'Find the area of the right triangle.', answerType: 'number', answerKey: 'area' },
  { kind: 'compositeShape', data: { parts: [{ rect: [0, 0, 8, 3] }, { rect: [0, 3, 3, 4] }], sides: true, unit: 'cm' }, question: 'What is the area of the shape?', answerType: 'number', answerKey: 'area' },
  rect(5, 5, 'perimeter', 'A square garden has sides of 5. How much fence goes all the way around it?'), rect(8, 2, 'perimeter', 'What is the perimeter of the rectangle?'),
  rect(10, 7, 'area', 'A rug is 10 long and 7 wide. How much floor does it cover?'),
];
const firstDraft = { reply: 'Here are 8 questions on area and perimeter.', title: 'Area and perimeter of rectangles', grade: '4', edits: FIRST.map(item => ({ op: 'add', item })) };
const harder = {
  reply: 'Questions 3 and 7 are now two-rectangle shapes, and every question uses inches.', units: 'in', edits: [
    { op: 'replace', n: 3, item: { kind: 'compositeShape', question: 'This shape is made of two rectangles. What is its area?', data: { parts: [{ rect: [0, 0, 12, 4] }, { rect: [0, 4, 5, 6] }], sides: true, unit: 'in' }, answerType: 'number', answerKey: 'area' } },
    { op: 'replace', n: 7, item: { kind: 'compositeShape', question: 'What is the perimeter of the shape?', data: { parts: [{ rect: [0, 0, 14, 5] }, { rect: [9, 5, 5, 6] }], sides: true, unit: 'in' }, answerType: 'number', answerKey: 'perimeter' } },
  ],
};
const page = id => ({ type: 'figures-sheet', sheetId: id });
const say = (who, id, body) => as(who)('/api/companion/chat', { body: { page: page(id), ...body } });
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const answers = id => F.itemsOf(id).map(it => it.answer);
const reset = async who => { await C.allSettled(); CO.reset(who); };
async function drafted(boss) {
  standIn(firstDraft);
  const id = F.createWorksheet(boss, {}).id;
  const r = await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4, 8 questions' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await C.allSettled();
  return id;
}
const NAMES = /\bQuinn\b|\bBea\b|\bMarsh\b|\bTumble\b|4F-\d/;

test('the first message on a worksheet drafts it as a job: progress steps, answers from OF.solve, the page\'s tool only on its page, no names to the AI', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  const calls = standIn(firstDraft, { gate: () => gate });
  try {
    const id = F.createWorksheet(boss, { title: 'Untitled worksheet' }).id;
    const r = await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4, 8 questions' });
    assert.equal(r.status, 200);
    const p = r.json.chat.pending;
    assert.ok(p, 'the answer is on its way');
    assert.deepEqual(p.names, ['check', 'ai', 'tools', 'answer']);
    assert.deepEqual(r.json.chat.turns.at(-1).meta.page, { type: 'figures-sheet', sheetId: id });
    release(); await C.allSettled();
    const chat = await chatOf(boss);
    assert.equal(chat.pending, null);
    const last = chat.turns.at(-1);
    assert.equal(last.role, 'oomba'); assert.match(last.text, /8 questions/);
    assert.equal(last.change.kind, 'figures'); assert.equal(last.change.sheetId, id);
    assert.equal(last.change.first, true); assert.deepEqual(last.change.added, [1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(last.change.canUndo, true);
    assert.equal(last.undo, undefined, 'undo data stays on the server');
    assert.deepEqual(answers(id), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '20 cm', '70 cm²']);
    const w = F.ownWorksheet(boss, id);
    assert.equal(w.title, 'Area and perimeter of rectangles'); assert.equal(w.grade, '4');
    // What the AI saw: the page's rules (catalog, the empty sheet), the editWorksheet tool, never the class or its students.
    assert.equal(calls.length, 2);
    assert.match(calls[0].system, /"questions":\[\]/); assert.match(calls[0].system, /Figure catalog:/);
    assert.ok(calls[0].tools.some(x => x.name === 'editWorksheet'));
    assert.doesNotMatch(JSON.stringify(calls), NAMES);
    assert.equal(calls[0].model, config.companionModel || config.builderModel);
    const job = q.get("SELECT * FROM oomba_turns WHERE surface='companion' AND owner_id=? ORDER BY created_at DESC", boss.id);
    assert.equal(job.status, 'done'); assert.equal(job.attempt, 1);
    // On another page there is no worksheet tool.
    standIn({ reply: 'Sure.' });
    const c2 = standIn({ reply: 'Sure.' });
    await as(boss)('/api/companion/chat', { body: { text: 'hello there', page: { type: 'teach' } } }); await C.allSettled();
    assert.ok(!c2[0].tools.some(x => x.name === 'editWorksheet'));
    // Someone else's worksheet id from the page is dropped on the server: no tool, no rules.
    const { boss: b2 } = world();
    const c3 = standIn({ reply: 'Sure.' });
    await as(b2)('/api/companion/chat', { body: { text: 'make it harder', page: page(id) } }); await C.allSettled();
    assert.ok(!c3[0].tools.some(x => x.name === 'editWorksheet')); assert.doesNotMatch(c3[0].system, /Figure catalog/);
    await reset(b2);
  } finally { await reset(boss); }
});

test('a refine turn changes only what it names: 3 and 7 harder, inches everywhere, every answer worked out again', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const before = F.itemsOf(id);
  const calls = standIn(harder);
  try {
    assert.equal((await say(boss, id, { text: 'make 3 and 7 harder and use inches' })).status, 200);
    await C.allSettled();
    const after = F.itemsOf(id);
    assert.deepEqual(after.map(it => it.id), before.map(it => it.id), 'the same questions in the same places');
    assert.deepEqual(answers(id), ['24 in²', '28 in', '78 in²', '24 in²', '36 in²', '20 in', '50 in', '70 in²']);
    for (const i of [0, 1, 3, 4, 5, 7]) { assert.equal(after[i].question, before[i].question, `question ${i + 1} untouched`); assert.equal(after[i].kind, before[i].kind); }
    assert.equal(after[2].kind, 'compositeShape'); assert.equal(after[6].kind, 'compositeShape');
    const last = (await chatOf(boss)).turns.at(-1);
    assert.deepEqual(last.change.changed, [3, 7]); assert.deepEqual(last.change.added, []); assert.equal(last.change.units, 'in');
    assert.equal(last.change.unitsOn, 6, 'the other six figures took the new unit');
    assert.deepEqual(last.change.ids, [after[2].id, after[6].id], 'the page marks only the questions Oomba rewrote');
    // The AI saw the sheet as it was (numbered, with its answers) and the conversation so far.
    assert.match(calls[0].system, /"n":3,"kind":"rectangle","question":"Find the area of the rectangle\."/);
    assert.match(calls[0].system, /"answer":"21 cm²"/);
    assert.equal(calls[0].messages[0].role, 'user'); assert.equal(calls[0].messages[1].role, 'assistant');
    assert.match(calls[0].messages[1].content, /8 questions/);
    assert.equal(calls[0].messages.at(-1).content, 'make 3 and 7 harder and use inches');
  } finally { await reset(boss); }
});

test('the AI\'s items are checked like a draft\'s: undrawable ones repaired, unknown kinds dropped, at most 12 added, remove', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const lines = []; F.hooks.log = f => lines.push(f);
  standIn({ reply: 'Changed.', edits: [
    { op: 'replace', n: 1, item: { kind: 'triangle', question: 'Find CA.', data: { AB: 1, BC: 2, CA: 10 }, answerType: 'number', answerKey: 'sides.CA' } },
    { op: 'add', item: { kind: 'notAKind', question: 'x', data: {} } },
    { op: 'remove', n: 8 }, { op: 'remove', n: 99 },
    ...Array.from({ length: 14 }, () => ({ op: 'add', item: { gen: 'rectangle' } })),
  ] });
  try {
    await say(boss, id, { text: 'Mix it up please' });
    await C.allSettled();
    const items = F.itemsOf(id), last = (await chatOf(boss)).turns.at(-1);
    assert.equal(items.length, 7 + 12, 'one removed, twelve added (the most in one answer)');
    assert.equal(items[0].kind, 'triangle'); assert.ok(items[0].gen, 'the undrawable triangle became a generator question');
    assert.deepEqual(last.change.removed, [8]);
    assert.equal(last.change.repaired, 1); assert.ok(last.change.dropped >= 3, 'the unknown kind and the adds past twelve');
    assert.ok(lines.some(l => l.action === 'replaced by its generator'));
    assert.ok(lines.every(l => !/Mix it up/.test(JSON.stringify(l))), 'repairs never log the words');
  } finally { F.hooks.log = null; await reset(boss); }
});

test('Undo puts back only what is still as Oomba left it; a question edited by hand since is kept', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const before = F.itemsOf(id);
  standIn(harder);
  try {
    await say(boss, id, { text: 'make 3 and 7 harder and use inches' });
    await C.allSettled();
    const turn = (await chatOf(boss)).turns.at(-1);
    const q7 = F.itemsOf(id)[6];
    assert.ok(F.updateItem(boss, id, q7.id, { question: 'Walk around the shape. How far did you go?' }).ok);
    const r = await as(boss)('/api/companion/chat/undo', { body: { turnId: turn.id } });
    assert.equal(r.status, 200); assert.equal(r.json.kept, 1);
    const now0 = F.itemsOf(id);
    assert.deepEqual(answers(id), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '50 in', '70 cm²']);
    assert.equal(now0[2].kind, 'rectangle'); assert.equal(now0[2].question, before[2].question);
    assert.equal(now0[6].question, 'Walk around the shape. How far did you go?', 'kept: edited by hand since');
    const t2 = (await chatOf(boss)).turns.find(x => x.id === turn.id);
    assert.equal(t2.change.undone, true); assert.equal(t2.change.canUndo, false); assert.equal(t2.change.kept, 1);
    assert.equal((await as(boss)('/api/companion/chat/undo', { body: { turnId: turn.id } })).status, 404, 'once');
    const first = (await chatOf(boss)).turns.find(x => x.change && x.change.first);
    assert.equal((await as(boss)('/api/companion/chat/undo', { body: { turnId: first.id } })).status, 200);
    assert.deepEqual(F.itemsOf(id).map(it => it.question), ['Walk around the shape. How far did you go?'], 'only the question edited by hand stays');
  } finally { await reset(boss); }
});

test('names and personal details never reach the AI: taken out before anything is kept or sent, checked again when the job starts; question text naming a student is left out', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'ok' });
  try {
    const id = F.createWorksheet(boss, {}).id;
    const r = await say(boss, id, { text: 'Make a sheet for Quinn Marsh and bea, email a@b.co' });
    assert.equal(r.status, 200);
    assert.equal(r.json.chat.turns.at(-1).text, 'Make a sheet for [student 1] and [student 2], email [email]');
    await C.allSettled();
    assert.doesNotMatch(JSON.stringify(calls), /Quinn|Marsh|a@b\.co/);
    assert.equal((await say(boss, id, { text: 'x' })).json.code, 'brief');
    // A question the teacher typed with a student's name in it: the AI sees "(left out)".
    F.addItem(boss, id, rect(6, 4, 'area', 'Quinn Marsh measured this rug. What is its area?'));
    const c1 = standIn({ reply: 'ok' });
    await say(boss, id, { text: 'Is this sheet ok?' }); await C.allSettled();
    assert.doesNotMatch(c1[0].system, /Quinn/); assert.match(c1[0].system, /\(left out\)/);
    // A student who joined after the message was sent: the words are checked again when the job runs, and it ends as
    // refused before the AI is asked.
    const { boss: b2, oak, A } = world();
    const id2 = F.createWorksheet(b2, {}).id;
    const c2 = standIn({ reply: 'ok' });
    const sent = CO.send(b2, { text: 'Pages for Zelda Quill', page: page(id2) });
    assert.ok(sent.ok); await C.allSettled();
    assert.equal(c2.length, 1);
    const u = S.createSchoolAccount(b2, oak.id, { rosterName: 'Zelda Quill' }).user; S.addToClass(b2, A.id, u.id);
    q.run("UPDATE oomba_turns SET status='interrupted', ended_at=NULL WHERE id=?", sent.turnId);
    C.run(sent.turnId); await C.allSettled();
    assert.equal(c2.length, 1, 'the AI was not asked again');
    assert.equal((await chatOf(b2)).turns.at(-1).failed, 'names');
    await reset(b2);
  } finally { await reset(boss); }
});

test('who: students, guests, teachers without the plan and other teachers get no worksheet workflow; the AI is never called', async () => {
  const { boss, kids } = world();
  const calls = standIn({ reply: 'x', edits: [{ op: 'remove', n: 1 }] });
  try {
    const id = F.createWorksheet(boss, { items: [FIRST[0]] }).id;
    assert.equal((await say(kids[0], id, { text: 'Make it easier' })).status, 404);
    assert.equal((await as(kids[0])('/api/companion/chat')).status, 404);
    assert.equal((await as(kids[0])('/api/figures/start', { body: { text: 'Area please' } })).status, 404);
    assert.equal((await say(null, id, { text: 'Make it easier' })).status, 404);
    assert.equal(calls.length, 0);
    TOOLS.plansOn();
    try {
      const oak = S.createSchool(boss, { name: `CoFig Free Oak ${n}` }).school;
      const free = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Fran Free', role: 'teacher' }).user.id);
      const r = await as(free)('/api/figures/start', { body: { text: 'Area please' } });
      assert.equal(r.status, 403); assert.equal(r.json.code, 'teacherPlan');
      assert.equal((await as(free)('/api/companion/chat', { body: { text: 'Make it easier', page: page(id) } })).status, 404);
    } finally { TOOLS.plansOn(false); }
    // Another teacher (with Oomba) naming this worksheet: the page is dropped, so nothing on it can change.
    const other = createUser({ username: `CoFigOther${n}`, password: 'secret123', role: 'admin' });
    const c2 = standIn({ reply: 'x', edits: [{ op: 'remove', n: 1 }] });
    await as(other)('/api/companion/chat', { body: { text: 'Remove question 1', page: page(id) } }); await C.allSettled();
    assert.ok(!c2[0].tools.some(x => x.name === 'editWorksheet'));
    assert.equal(F.itemsOf(id).length, 1, 'not their worksheet: unchanged');
    await reset(other);
  } finally { await reset(boss); }
});

test('one live turn per teacher: while one answer runs, another message waits; the menu makes nothing', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(firstDraft, { gate: () => gate });
  try {
    const a = F.createWorksheet(boss, {}).id, b = F.createWorksheet(boss, {}).id;
    assert.equal((await say(boss, a, { text: 'Area of rectangles' })).status, 200);
    const busy = await say(boss, b, { text: 'Volume of prisms' });
    assert.equal(busy.status, 409); assert.equal(busy.json.code, 'chatBusy');
    const sheets = F.listWorksheets(boss).length;
    const st = await as(boss)('/api/figures/start', { body: { text: 'Angles in triangles' } });
    assert.equal(st.status, 409); assert.equal(st.json.code, 'otherBusy');
    assert.equal(F.listWorksheets(boss).length, sheets, 'no worksheet was made');
    const { boss: b2 } = world();
    assert.equal((await say(b2, F.createWorksheet(b2, {}).id, { text: 'Area of rectangles' })).status, 200, 'another teacher is not held up');
    release(); await C.allSettled();
    assert.equal((await say(boss, b, { text: 'Volume of prisms' })).status, 200, 'free again');
    await C.allSettled(); await reset(b2);
  } finally { await reset(boss); }
});

test('failures are calm turns: an empty answer and a timeout (one warn line, no words), Try again replaces the pair', async () => {
  const { boss } = world();
  const lines = []; AI.hooks.log = (msg, f) => lines.push({ msg, ...f });
  standIn((p, i) => { if (i === 0) return { reply: '' }; if (i === 1) { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; } return firstDraft; });
  try {
    const id = F.createWorksheet(boss, {}).id;
    await say(boss, id, { text: 'Area of rectangles for grade 4' }); await C.allSettled();
    let chat = await chatOf(boss);
    assert.equal(chat.turns.at(-1).failed, 'error'); assert.equal(chat.turns.at(-1).for, chat.turns[0].id);
    assert.equal(F.itemsOf(id).length, 0, 'no silent starter set');
    await say(boss, id, { text: 'Area of rectangles for grade 4', retry: chat.turns[0].id }); await C.allSettled();
    chat = await chatOf(boss);
    assert.equal(chat.turns.length, 2, 'the failed pair made way'); assert.equal(chat.turns.at(-1).failed, 'timeout');
    await say(boss, id, { text: 'Area of rectangles for grade 4', retry: chat.turns[0].id }); await C.allSettled();
    chat = await chatOf(boss);
    assert.equal(chat.turns.length, 2); assert.equal(chat.turns.at(-1).change.added.length, 8);
    assert.deepEqual(lines.map(l => l.kind), ['timeout']);
    assert.ok(lines.every(l => !/rectangles/.test(JSON.stringify(l))), 'never the words');
  } finally { AI.hooks.log = null; await reset(boss); }
});

test('the budget resting: the chat says so, the AI is never called, "Add a starter set instead" once on an empty sheet', async () => {
  const { boss } = world();
  const calls = standIn(firstDraft);
  const daily = config.aiDailyBudgetUsd;
  try {
    config.aiDailyBudgetUsd = 0;
    const id = F.createWorksheet(boss, {}).id;
    await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4' }); await C.allSettled();
    const failed = (await chatOf(boss)).turns.at(-1);
    assert.equal(failed.failed, 'resting'); assert.equal(calls.length, 0);
    assert.equal(F.itemsOf(id).length, 0, 'nothing added by itself');
    const r = await as(boss)('/api/companion/chat/act', { body: { turnId: failed.id, act: 'starter' } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.ok(F.itemsOf(id).length >= 4 && F.itemsOf(id).every(it => it.gen), 'a starter set from the generators');
    const last = r.json.chat.turns.at(-1);
    assert.equal(last.note.starter, true); assert.equal(last.change.canUndo, true); assert.equal(last.change.kind, 'figures');
    assert.equal(r.json.chat.turns.find(x => x.id === failed.id).starter, true, 'offered once');
    assert.equal((await as(boss)('/api/companion/chat/act', { body: { turnId: failed.id, act: 'starter' } })).status, 404);
    assert.ok(F.addItem(boss, id, { kind: 'circle', data: F.kindOf('circle').presets[0] }).ok, 'the builder still works by hand');
    const id2 = F.createWorksheet(boss, { items: [FIRST[0]] }).id;
    await say(boss, id2, { text: 'More please' }); await C.allSettled();
    const f2 = (await chatOf(boss)).turns.at(-1);
    const r2 = await as(boss)('/api/companion/chat/act', { body: { turnId: f2.id, act: 'starter' } });
    assert.equal(r2.status, 400); assert.equal(r2.json.code, 'notEmpty');
  } finally { config.aiDailyBudgetUsd = daily; await reset(boss); }
});

test('a restart: a recent turn runs again once at boot (the worksheet changed once), an old one ends as failed', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(firstDraft, { gate: () => gate });
  try {
    const id = F.createWorksheet(boss, {}).id;
    const r = CO.send(boss, { text: 'Area of rectangles', page: page(id) });
    assert.ok(r.ok);
    await new Promise(res => setTimeout(res, 10));
    assert.equal(C.handOff(), 1);
    C._reset();
    standIn(firstDraft);
    assert.deepEqual(C.recover(), { resumed: 1, stopped: 0 });
    await C.allSettled();
    const job = q.get('SELECT * FROM oomba_turns WHERE id=?', r.turnId);
    assert.equal(job.status, 'done'); assert.equal(job.attempt, 2);
    assert.equal(F.itemsOf(id).length, 8, 'applied once');
    release();
    const id2 = F.createWorksheet(boss, {}).id;
    let rel2; const g2 = new Promise(res => { rel2 = res; });
    standIn(firstDraft, { gate: () => g2 });
    const r2 = CO.send(boss, { text: 'Area of rectangles', page: page(id2) });
    C.handOff(); C._reset();
    q.run('UPDATE oomba_turns SET created_at=? WHERE id=?', now() - 60 * 60e3, r2.turnId);
    assert.deepEqual(C.recover(), { resumed: 0, stopped: 1 });
    assert.equal((await chatOf(boss)).turns.at(-1).failed, 'restart');
    rel2(); await C.allSettled();
    assert.equal(F.itemsOf(id2).length, 0, 'the old attempt never writes');
  } finally { await reset(boss); }
});

test('the menu: "Describe what you need" makes a worksheet or test with the companion running on it; "finished while you were away"', async () => {
  const { boss } = world();
  const calls = standIn(firstDraft);
  try {
    const r = await as(boss)('/api/figures/start', { body: { text: 'Area and perimeter of rectangles, 8 questions', purpose: 'worksheet', grade: '4' } });
    assert.equal(r.status, 200); assert.match(r.json.redirect, new RegExp(`/figures/worksheets/${r.json.id}$`));
    assert.equal(F.ownWorksheet(boss, r.json.id).grade, '4');
    await C.allSettled();
    assert.equal(F.itemsOf(r.json.id).length, 8);
    const ready = CO.readySheets(boss);
    assert.deepEqual(ready.map(x => [x.id, x.title, x.n, x.status]), [[r.json.id, 'Area and perimeter of rectangles', 8, 'done']]);
    const menu = await fetch(`${base}/figures`, { headers: { cookie: cookieFor(boss.id) } }).then(x => x.text());
    assert.match(menu, /“Area and perimeter of rectangles” is ready\.[\s\S]*Oomba finished it while you were away: 8 questions\./);
    assert.match(menu, new RegExp(`data-dismiss="${r.json.id}"`));
    // A peek (the bubble closed) keeps it; opening the chat counts as seen.
    assert.equal((await as(boss)('/api/companion/chat?peek=1')).json.unseen, 1);
    assert.equal(CO.readySheets(boss).length, 1);
    await chatOf(boss);
    assert.deepEqual(CO.readySheets(boss), [], 'seen');
    const t = await as(boss)('/api/figures/start', { body: { text: 'Forces on ramps', purpose: 'test' } });
    assert.equal(F.ownWorksheet(boss, t.json.id).purpose, 'test');
    await C.allSettled();
    assert.match(calls.at(-1).system, /printable test/);
    assert.equal(CO.readySheets(boss).length, 1);
    assert.equal((await as(boss)(`/api/figures/worksheets/${t.json.id}/ready/dismiss`, { body: {} })).status, 200);
    assert.deepEqual(CO.readySheets(boss), []);
    // Words that fail make nothing; names never go anywhere.
    const sheets = F.listWorksheets(boss).length;
    const bad = await as(boss)('/api/figures/start', { body: { text: 'x' } });
    assert.equal(bad.status, 400); assert.equal(bad.json.code, 'brief');
    assert.equal(F.listWorksheets(boss).length, sheets);
  } finally { await reset(boss); }
});

test('"Ask Oomba about this": a question of the teacher\'s own worksheet is quoted on the message; another\'s is not', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const item = F.itemsOf(id)[3];
  const calls = standIn({ reply: 'It is a right triangle.' });
  try {
    const r = await say(boss, id, { text: 'Is this one too hard?', quote: `${id}:${item.id}` });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.chat.turns.at(-1).quote, { ref: `${id}:${item.id}`, sheetId: id, n: 4, text: 'Find the area of the right triangle.' });
    await C.allSettled();
    assert.ok(calls.length >= 1);
    const { boss: b2 } = world();
    standIn({ reply: 'ok' });
    const r2 = await as(b2)('/api/companion/chat', { body: { text: 'and this?', quote: `${id}:${item.id}` } });
    assert.equal(r2.json.chat.turns.at(-1).quote, undefined);
    await reset(b2);
  } finally { await reset(boss); }
});

test('routing on a worksheet: an off-topic request (a book for a level M reader) uses the general tools and leaves the worksheet as it is', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const before = JSON.stringify(F.itemsOf(id));
  const calls = [];
  CO.hooks.create = async p => {
    calls.push(JSON.parse(JSON.stringify(p)));
    const afterTool = p.messages.at(-1).content && Array.isArray(p.messages.at(-1).content);
    if (!afterTool) return { model: p.model, usage: {}, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'searchBooks', input: { words: 'animals', readingLevel: 'M' } }] };
    return { model: p.model, usage: {}, stop_reason: 'end_turn', content: [{ type: 'text', text: 'Level M is usually late grade 2 to early grade 3. Here are two.' }] };
  };
  try {
    await say(boss, id, { text: 'find me a book for a level M reader about animals' }); await C.allSettled();
    const last = (await chatOf(boss)).turns.at(-1);
    assert.equal(last.change, undefined, 'nothing on the worksheet changed');
    assert.equal(JSON.stringify(F.itemsOf(id)), before);
    assert.ok(last.note.cards.length > 0 && last.note.cards.every(c => c.kind === 'book'));
    assert.deepEqual(last.note.steps.map(s => s.k), ['booksLevel']);
    // The routing rule and an ask-first rule are in what the AI is told on this page.
    assert.match(calls[0].system, /Use it only for requests about what is on this page/);
    assert.match(calls[0].system, /ask one short question and change nothing/);
  } finally { await reset(boss); }
});
