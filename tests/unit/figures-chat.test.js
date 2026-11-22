// Oomba's chat on a Figures worksheet (docs/decisions.md "Figures: Oomba's chat and the shared chat engine";
// services/figures-chat.js on services/oomba-chat.js): the first message drafts the questions as a server job (steps,
// estimate, one live turn per teacher), a refine turn changes only the questions it names (units are the app's, every
// answer worked out again with OF.solve), the AI's items are checked and repaired like a draft's, Undo puts back only
// what is still as Oomba left it, names and personal details are refused before anything is stored or sent, who may use
// it, failures (bad JSON, a timeout, the budget resting, "Add a starter set instead"), a restart (recover), the rate
// limit, the menu's "Describe what you need" and "finished while you were away", and what is kept and for how long.
// The AI is the existing stand-in (services/figures.js hooks.create).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, now, MIGRATIONS } = await import('../../server/db.js');
const { createUser, startSession, getUser } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/figures.js');
const FC = await import('../../server/services/figures-chat.js');
const C = await import('../../server/services/oomba-chat.js');
const AI = await import('../../server/services/ai-call.js');
const RL = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');
const TOOLS = await import('./_tools-plan.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { F.hooks.create = null; F.hooks.log = null; AI.hooks.log = null; server.close(); });
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
  const boss = createUser({ username: `FigChatBoss${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `FigChat Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  const A = S.createClass(boss, oak.id, { name: `4F-${k}` }).class;
  const kid = name => { const u = S.createSchoolAccount(boss, oak.id, { rosterName: name }).user; S.addToClass(boss, A.id, u.id); return getUser(u.id); };
  return { boss, oak, A, kids: [kid('Quinn Marsh'), kid('Bea Tumble')] };
}
/** The stand-in AI: answer(params, i) -> an object (JSON text), a string, or throws; gate: a promise each call waits on. */
function standIn(answer, { gate = null } = {}) {
  const calls = [];
  F.hooks.create = async params => {
    calls.push(params);
    if (gate) await gate();
    const a = typeof answer === 'function' ? await answer(params, calls.length - 1) : answer;
    return { model: params.model, usage: { input_tokens: 5, output_tokens: 5 }, content: [{ type: 'text', text: typeof a === 'string' ? a : JSON.stringify(a) }] };
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
const say = (who, id, body) => as(who)(`/api/figures/worksheets/${id}/chat`, { body });
const chatOf = async (who, id) => (await as(who)(`/api/figures/worksheets/${id}/chat`)).json.chat;
const answers = id => F.itemsOf(id).map(it => it.answer);
/** A worksheet drafted by the stand-in's first draft. */
async function drafted(boss) {
  standIn(firstDraft);
  const id = F.createWorksheet(boss, {}).id;
  const r = await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4, 8 questions' });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  await C.allSettled();
  return id;
}

test('migration 0106: after 0105, the shared engine\'s conversations and jobs with one live turn per live key', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.indexOf('0106_figures_chat') > names.indexOf('0105_mistake_hunt_chat'));
  assert.ok(q.all('PRAGMA table_info(oomba_turns)').some(c => c.name === 'live_key'));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='oomba_turns_one_live'"));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='oomba_chats_ctx'"));
  assert.equal(C.surfaceOf('figures').live, 'owner');
  assert.deepEqual(C.surfaceOf('figures').steps, ['check', 'ai', 'build', 'save']);
});

test('the first message drafts the worksheet as a job: progress steps and an estimate, answers from OF.solve, no names to the AI', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  const calls = standIn(firstDraft, { gate: () => gate });
  try {
    const id = F.createWorksheet(boss, { title: 'Untitled worksheet' }).id;
    const r = await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4, 8 questions' });
    assert.equal(r.status, 200);
    const p = r.json.chat.pending;
    assert.ok(p, 'the answer is on its way');
    assert.deepEqual(p.names, ['check', 'ai', 'build', 'save']);
    assert.equal(p.eta.src, 'default'); assert.equal(p.eta.p50, 30e3); assert.ok(p.eta.max > p.eta.p75);
    await new Promise(res => setTimeout(res, 20));
    const mid = await chatOf(boss, id);
    assert.equal(mid.pending.step, 1, 'the AI step');
    assert.equal(mid.turns.length, 1); assert.equal(mid.turns[0].role, 'me');
    release(); await C.allSettled();
    const chat = await chatOf(boss, id);
    assert.equal(chat.pending, null);
    const last = chat.turns.at(-1);
    assert.equal(last.role, 'oomba'); assert.match(last.text, /8 questions/);
    assert.equal(last.change.first, true); assert.deepEqual(last.change.added, [1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(last.change.canUndo, true);
    assert.equal(last.undo, undefined, 'undo data stays on the server');
    assert.deepEqual(answers(id), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '20 cm', '70 cm²']);
    const w = F.ownWorksheet(boss, id);
    assert.equal(w.title, 'Area and perimeter of rectangles'); assert.equal(w.grade, '4');
    // What the AI saw: the catalog, the empty sheet, the message; never the class or its students.
    assert.equal(calls.length, 1);
    assert.match(calls[0].system, /"questions":\[\]/); assert.match(calls[0].system, /Figure catalog:/);
    assert.doesNotMatch(calls[0].system + JSON.stringify(calls[0].messages), /\bQuinn\b|\bBea\b|\bMarsh\b|\bTumble\b|4F-\d/);
    assert.equal(calls[0].model, config.builderModel);
    const job = q.get("SELECT * FROM oomba_turns WHERE surface='figures' AND owner_id=? ORDER BY created_at DESC", boss.id);
    assert.equal(job.status, 'done'); assert.equal(job.attempt, 1);
    assert.equal(JSON.parse(job.steps).length, 4, 'a time for each step');
  } finally { F.hooks.create = null; }
});

test('a refine turn changes only what it names: 3 and 7 harder, inches everywhere, every answer worked out again', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const before = F.itemsOf(id);
  const calls = standIn(harder);
  try {
    const r = await say(boss, id, { text: 'make 3 and 7 harder and use inches' });
    assert.equal(r.status, 200);
    await C.allSettled();
    const after = F.itemsOf(id);
    assert.deepEqual(after.map(it => it.id), before.map(it => it.id), 'the same questions in the same places');
    assert.deepEqual(answers(id), ['24 in²', '28 in', '78 in²', '24 in²', '36 in²', '20 in', '50 in', '70 in²']);
    for (const i of [0, 1, 3, 4, 5, 7]) { assert.equal(after[i].question, before[i].question, `question ${i + 1} untouched`); assert.equal(after[i].kind, before[i].kind); }
    assert.equal(after[2].kind, 'compositeShape'); assert.equal(after[6].kind, 'compositeShape');
    const last = (await chatOf(boss, id)).turns.at(-1);
    assert.deepEqual(last.change.changed, [3, 7]); assert.deepEqual(last.change.added, []); assert.equal(last.change.units, 'in');
    assert.equal(last.change.unitsOn, 6, 'the other six figures took the new unit');
    assert.deepEqual(last.change.ids, [after[2].id, after[6].id], 'the page marks only the questions Oomba rewrote');
    // The AI saw the sheet as it was (numbered, with its answers) and the conversation so far.
    assert.match(calls[0].system, /"n":3,"kind":"rectangle","question":"Find the area of the rectangle\."/);
    assert.match(calls[0].system, /"answer":"21 cm²"/);
    assert.equal(calls[0].messages[0].role, 'user'); assert.equal(calls[0].messages[1].role, 'assistant');
    assert.match(calls[0].messages[1].content, /"added":\[1,2,3,4,5,6,7,8\]/);
    assert.equal(calls[0].messages.at(-1).content, 'make 3 and 7 harder and use inches');
  } finally { F.hooks.create = null; }
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
    const items = F.itemsOf(id), last = (await chatOf(boss, id)).turns.at(-1);
    assert.equal(items.length, 7 + 12, 'one removed, twelve added (the most in one answer)');
    assert.equal(items[0].kind, 'triangle'); assert.ok(items[0].gen, 'the undrawable triangle became a generator question');
    assert.deepEqual(last.change.removed, [8]);
    assert.equal(last.change.repaired, 1); assert.ok(last.change.dropped >= 3, 'the unknown kind and the adds past twelve');
    assert.ok(lines.some(l => l.action === 'replaced by its generator'));
    assert.ok(lines.every(l => !/Mix it up/.test(JSON.stringify(l))), 'repairs never log the words');
  } finally { F.hooks.create = null; F.hooks.log = null; }
});

test('Undo puts back only what is still as Oomba left it; a question edited by hand since is kept', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const before = F.itemsOf(id);
  standIn(harder);
  try {
    await say(boss, id, { text: 'make 3 and 7 harder and use inches' });
    await C.allSettled();
    const turn = (await chatOf(boss, id)).turns.at(-1);
    // The teacher edits question 7 by hand after Oomba's change.
    const q7 = F.itemsOf(id)[6];
    assert.ok(F.updateItem(boss, id, q7.id, { question: 'Walk around the shape. How far did you go?' }).ok);
    const r = await as(boss)(`/api/figures/worksheets/${id}/chat/undo`, { body: { turnId: turn.id } });
    assert.equal(r.status, 200); assert.equal(r.json.kept, 1);
    assert.equal(r.json.worksheet.items.length, 8, 'the worksheet comes back for the page');
    const now0 = F.itemsOf(id);
    assert.deepEqual(answers(id), ['24 cm²', '28 cm', '21 cm²', '24 cm²', '36 cm²', '20 cm', '50 in', '70 cm²']);
    assert.equal(now0[2].kind, 'rectangle'); assert.equal(now0[2].question, before[2].question);
    assert.equal(now0[6].question, 'Walk around the shape. How far did you go?', 'kept: edited by hand since');
    const t2 = (await chatOf(boss, id)).turns.find(x => x.id === turn.id);
    assert.equal(t2.change.undone, true); assert.equal(t2.change.canUndo, false); assert.equal(t2.change.kept, 1);
    assert.equal((await as(boss)(`/api/figures/worksheets/${id}/chat/undo`, { body: { turnId: turn.id } })).status, 404, 'once');
    // Undo of the first draft takes its questions away again.
    const first = (await chatOf(boss, id)).turns.find(x => x.change && x.change.first);
    const u = await as(boss)(`/api/figures/worksheets/${id}/chat/undo`, { body: { turnId: first.id } });
    assert.equal(u.status, 200);
    assert.deepEqual(F.itemsOf(id).map(it => it.question), ['Walk around the shape. How far did you go?'], 'only the question edited by hand stays');
  } finally { F.hooks.create = null; }
});

test('names and personal details are refused before anything is stored or sent; question text naming a student is left out', async () => {
  const { boss } = world();
  const calls = standIn({ reply: 'ok', edits: [] });
  try {
    const id = F.createWorksheet(boss, {}).id;
    for (const [text, code] of [['Make a sheet for Quinn Marsh', 'names'], ['Make one for bea', 'names'], ['Email me at a@b.co', 'personal'], ['x', 'brief']]) {
      const r = await say(boss, id, { text });
      assert.equal(r.status, 400, text); assert.equal(r.json.code, code, text);
      assert.match(r.json.error, /./);
    }
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_chats WHERE owner_id=?", boss.id).n, 0, 'nothing stored');
    assert.equal(calls.length, 0, 'nothing sent');
    // A question the teacher typed with a student's name in it: the AI sees "(left out)".
    F.addItem(boss, id, rect(6, 4, 'area', 'Quinn Marsh measured this rug. What is its area?'));
    await say(boss, id, { text: 'Is this sheet ok?' });
    await C.allSettled();
    assert.doesNotMatch(calls[0].system, /Quinn/); assert.match(calls[0].system, /\(left out\)/);
    // The words are checked again when the job starts (a student may have joined meanwhile): the turn runs again after
    // Zelda joins the class, and ends as refused before the AI is asked.
    const { boss: b2, oak, A } = world();
    const id2 = F.createWorksheet(b2, {}).id;
    const c2 = standIn({ reply: 'ok', edits: [] });
    const r = C.send(b2, 'figures', id2, { text: 'Pages for Zelda Quill' });
    assert.ok(r.ok);
    await C.allSettled();
    assert.equal(c2.length, 1);
    const u = S.createSchoolAccount(b2, oak.id, { rosterName: 'Zelda Quill' }).user; S.addToClass(b2, A.id, u.id);
    q.run("UPDATE oomba_turns SET status='interrupted', ended_at=NULL WHERE id=?", r.turnId);
    C.run(r.turnId); await C.allSettled();
    assert.equal(c2.length, 1, 'the AI was not asked again');
    const last = (await chatOf(b2, id2)).turns.at(-1);
    assert.equal(last.failed, 'names');
  } finally { F.hooks.create = null; }
});

test('who: students, guests, teachers without the plan and other teachers are refused; the AI is never called', async () => {
  const { boss, kids } = world();
  const calls = standIn({ reply: 'x', edits: [] });
  try {
    const id = F.createWorksheet(boss, {}).id;
    assert.equal((await say(kids[0], id, { text: 'Make it easier' })).status, 404);
    assert.equal((await as(kids[0])(`/api/figures/worksheets/${id}/chat`)).status, 404);
    assert.equal((await as(kids[0])('/api/figures/start', { body: { text: 'Area please' } })).status, 404);
    assert.equal((await say(null, id, { text: 'Make it easier' })).status, 401);
    const other = createUser({ username: `FigChatOther${n}`, password: 'secret123', role: 'admin' });
    assert.equal((await say(other, id, { text: 'Make it easier' })).status, 404, "another teacher's worksheet is a 404");
    TOOLS.plansOn();
    try {
      const oak = S.createSchool(boss, { name: 'FigChat Free Oak' }).school;
      const free = getUser(S.createSchoolAccount(boss, oak.id, { rosterName: 'Fran Free', role: 'teacher' }).user.id);
      const r = await as(free)('/api/figures/start', { body: { text: 'Area please' } });
      assert.equal(r.status, 403); assert.equal(r.json.code, 'teacherPlan');
    } finally { TOOLS.plansOn(false); }
    assert.equal(calls.length, 0);
  } finally { F.hooks.create = null; }
});

test('one live turn per teacher: the same worksheet is busy, another worksheet waits, the menu makes nothing', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(firstDraft, { gate: () => gate });
  try {
    const a = F.createWorksheet(boss, {}).id, b = F.createWorksheet(boss, {}).id;
    assert.equal((await say(boss, a, { text: 'Area of rectangles' })).status, 200);
    const busy = await say(boss, a, { text: 'And perimeter' });
    assert.equal(busy.status, 409); assert.equal(busy.json.code, 'chatBusy');
    const other = await say(boss, b, { text: 'Volume of prisms' });
    assert.equal(other.status, 409); assert.equal(other.json.code, 'otherBusy'); assert.equal(other.json.key, a);
    const sheets = F.listWorksheets(boss).length;
    const st = await as(boss)('/api/figures/start', { body: { text: 'Angles in triangles' } });
    assert.equal(st.status, 409); assert.equal(st.json.code, 'otherBusy');
    assert.equal(F.listWorksheets(boss).length, sheets, 'no worksheet was made');
    // Another teacher is not held up.
    const { boss: b2 } = world();
    assert.equal((await say(b2, F.createWorksheet(b2, {}).id, { text: 'Area of rectangles' })).status, 200);
    release(); await C.allSettled();
    assert.equal((await say(boss, b, { text: 'Volume of prisms' })).status, 200, 'free again');
    await C.allSettled();
  } finally { F.hooks.create = null; }
});

test('failures are calm turns: bad JSON and a timeout (one warn line, no words), Try again replaces the pair', async () => {
  const { boss } = world();
  const lines = []; AI.hooks.log = (msg, f) => lines.push({ msg, ...f });
  standIn((p, i) => { if (i === 0) return 'this is not json'; if (i === 1) { const e = new Error('Request timed out.'); e.name = 'APIConnectionTimeoutError'; throw e; } return firstDraft; });
  try {
    const id = F.createWorksheet(boss, {}).id;
    await say(boss, id, { text: 'Area of rectangles for grade 4' }); await C.allSettled();
    let chat = await chatOf(boss, id);
    assert.equal(chat.turns.at(-1).failed, 'error'); assert.equal(chat.turns.at(-1).for, chat.turns[0].id);
    assert.equal(F.itemsOf(id).length, 0, 'no silent starter set');
    await say(boss, id, { text: 'Area of rectangles for grade 4', retry: chat.turns[0].id }); await C.allSettled();
    chat = await chatOf(boss, id);
    assert.equal(chat.turns.length, 2, 'the failed pair made way'); assert.equal(chat.turns.at(-1).failed, 'timeout');
    await say(boss, id, { text: 'Area of rectangles for grade 4', retry: chat.turns[0].id }); await C.allSettled();
    chat = await chatOf(boss, id);
    assert.equal(chat.turns.length, 2); assert.equal(chat.turns.at(-1).change.added.length, 8);
    assert.deepEqual(lines.map(l => l.kind), ['bad_json', 'timeout']);
    assert.ok(lines.every(l => !/rectangles/.test(JSON.stringify(l))), 'never the words');
  } finally { F.hooks.create = null; AI.hooks.log = null; }
});

test('the budget resting: the chat says so, the AI is never called, "Add a starter set instead" once on an empty sheet', async () => {
  const { boss } = world();
  const calls = standIn(firstDraft);
  const daily = config.aiDailyBudgetUsd;
  try {
    config.aiDailyBudgetUsd = 0;
    const id = F.createWorksheet(boss, {}).id;
    await say(boss, id, { text: 'Area and perimeter of rectangles, grade 4' }); await C.allSettled();
    const failed = (await chatOf(boss, id)).turns.at(-1);
    assert.equal(failed.failed, 'resting'); assert.equal(calls.length, 0);
    assert.equal(F.itemsOf(id).length, 0, 'nothing added by itself');
    const r = await as(boss)(`/api/figures/worksheets/${id}/chat/starter`, { body: { turnId: failed.id } });
    assert.equal(r.status, 200);
    const n0 = F.itemsOf(id).length;
    assert.ok(n0 >= 4 && F.itemsOf(id).every(it => it.gen), 'a starter set from the generators');
    const chat = r.json.chat, last = chat.turns.at(-1);
    assert.equal(last.note, 'starter'); assert.equal(last.change.canUndo, true);
    assert.equal(chat.turns.find(x => x.id === failed.id).starter, true, 'offered once');
    assert.equal((await as(boss)(`/api/figures/worksheets/${id}/chat/starter`, { body: { turnId: failed.id } })).status, 404);
    // The builder still works by hand while Oomba rests.
    assert.ok(F.addItem(boss, id, { kind: 'circle', data: F.kindOf('circle').presets[0] }).ok);
    // A starter set only goes on an empty worksheet.
    const id2 = F.createWorksheet(boss, { items: [FIRST[0]] }).id;
    await say(boss, id2, { text: 'More please' }); await C.allSettled();
    const f2 = (await chatOf(boss, id2)).turns.at(-1);
    const r2 = await as(boss)(`/api/figures/worksheets/${id2}/chat/starter`, { body: { turnId: f2.id } });
    assert.equal(r2.status, 409); assert.equal(r2.json.code, 'notEmpty');
  } finally { config.aiDailyBudgetUsd = daily; F.hooks.create = null; }
});

test('a restart: a recent turn runs again once at boot, an old one ends as failed with Try again; shutdown hands off', async () => {
  const { boss } = world();
  let release; const gate = new Promise(r => { release = r; });
  standIn(firstDraft, { gate: () => gate });
  try {
    const id = F.createWorksheet(boss, {}).id;
    const r = C.send(boss, 'figures', id, { text: 'Area of rectangles' });
    assert.ok(r.ok);
    await new Promise(res => setTimeout(res, 10));
    assert.equal(C.handOff(), 1, 'the running turn is marked interrupted');
    assert.equal(q.get('SELECT status FROM oomba_turns WHERE id=?', r.turnId).status, 'interrupted');
    // The process "restarts": the in-memory job is forgotten, recover() runs it again.
    C._reset();
    standIn(firstDraft);
    assert.deepEqual(C.recover(), { resumed: 1, stopped: 0 });
    await C.allSettled();
    const job = q.get('SELECT * FROM oomba_turns WHERE id=?', r.turnId);
    assert.equal(job.status, 'done'); assert.equal(job.attempt, 2);
    assert.equal(F.itemsOf(id).length, 8, 'applied once');
    release();
    // An old unfinished turn (or one on its last attempt) ends as failed.
    const id2 = F.createWorksheet(boss, {}).id;
    let rel2; const g2 = new Promise(res => { rel2 = res; });
    standIn(firstDraft, { gate: () => g2 });
    const r2 = C.send(boss, 'figures', id2, { text: 'Area of rectangles' });
    C.handOff(); C._reset();
    q.run('UPDATE oomba_turns SET created_at=? WHERE id=?', now() - 60 * 60e3, r2.turnId);
    assert.deepEqual(C.recover(), { resumed: 0, stopped: 1 });
    const t = (await chatOf(boss, id2)).turns.at(-1);
    assert.equal(t.failed, 'restart');
    rel2(); await C.allSettled();
    assert.equal(F.itemsOf(id2).length, 0, 'the old attempt never writes');
  } finally { F.hooks.create = null; }
});

test('the rate limit: 30 messages an hour per teacher (shared with the menu and the old drafts)', async () => {
  const { boss } = world();
  standIn({ reply: 'ok', edits: [] });
  try {
    const id = F.createWorksheet(boss, {}).id;
    const codes = [];
    for (let i = 0; i < 31; i++) codes.push((await say(boss, id, { text: `Question ${i}` })).status);
    assert.ok(!codes.slice(0, 30).includes(429));
    assert.equal(codes[30], 429);
    await C.allSettled();
  } finally { F.hooks.create = null; }
});

test('the menu: "Describe what you need" makes a worksheet or test with the chat running; "finished while you were away"', async () => {
  const { boss } = world();
  const calls = standIn(firstDraft);
  try {
    const r = await as(boss)('/api/figures/start', { body: { text: 'Area and perimeter of rectangles, 8 questions', purpose: 'worksheet', grade: '4' } });
    assert.equal(r.status, 200); assert.match(r.json.redirect, new RegExp(`/figures/worksheets/${r.json.id}$`));
    assert.equal(F.ownWorksheet(boss, r.json.id).grade, '4');
    await C.allSettled();
    assert.equal(F.itemsOf(r.json.id).length, 8);
    // The teacher was away: the menu says it is ready (with its title and how many questions), once.
    const ready = FC.ready(boss);
    assert.deepEqual(ready.map(x => [x.id, x.title, x.n, x.status]), [[r.json.id, 'Area and perimeter of rectangles', 8, 'done']]);
    const menu = await fetch(`${base}/figures`, { headers: { cookie: cookieFor(boss.id) } }).then(x => x.text());
    assert.match(menu, /“Area and perimeter of rectangles” is ready\.[\s\S]*Oomba finished it while you were away: 8 questions\./);
    assert.match(menu, new RegExp(`data-dismiss="${r.json.id}"`));
    await chatOf(boss, r.json.id);
    assert.deepEqual(FC.ready(boss), [], 'opening the worksheet counts as seen');
    // A test, and a dismissed notice.
    const t = await as(boss)('/api/figures/start', { body: { text: 'Forces on ramps', purpose: 'test' } });
    assert.equal(F.ownWorksheet(boss, t.json.id).purpose, 'test');
    await C.allSettled();
    assert.match(calls.at(-1).system, /printable test/);
    assert.equal(FC.ready(boss).length, 1);
    assert.equal((await as(boss)(`/api/figures/worksheets/${t.json.id}/chat/dismiss`, { body: {} })).status, 200);
    assert.deepEqual(FC.ready(boss), []);
    // Words that fail make nothing.
    const sheets = F.listWorksheets(boss).length;
    const bad = await as(boss)('/api/figures/start', { body: { text: 'Area for Quinn Marsh' } });
    assert.equal(bad.status, 400); assert.equal(bad.json.code, 'names');
    assert.equal(F.listWorksheets(boss).length, sheets);
  } finally { F.hooks.create = null; }
});

test('kept: the newest turns, undo data on the newest changes; deleted with the worksheet, after 60 days, with the account', async () => {
  const { boss } = world();
  const id = await drafted(boss);
  const s = C.surfaceOf('figures');
  standIn((p, i) => ({ reply: `Answer ${i}`, title: `Title ${i}`, edits: [] }));
  try {
    for (let i = 0; i < 18; i++) { await say(boss, id, { text: `Rename it ${i}` }); await C.allSettled(); }
    const row = q.get("SELECT turns FROM oomba_chats WHERE surface='figures' AND ctx_key=?", id);
    const turns = JSON.parse(row.turns);
    assert.equal(turns.length, s.history, `the newest ${s.history} turns`);
    assert.equal(turns.filter(x => x.undo).length, s.undoKept, `undo data on the newest ${s.undoKept} changes`);
    // Deleted with the worksheet.
    assert.ok(F.deleteWorksheet(boss, id).ok);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_chats WHERE ctx_key=?", id).n, 0);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_turns t JOIN oomba_chats c ON c.id=t.chat_id WHERE c.ctx_key=?", id).n, 0);
    // Untouched for 60 days, and finished jobs after 7.
    const id2 = await drafted(boss);
    q.run("UPDATE oomba_chats SET updated_at=? WHERE ctx_key=?", now() - 61 * 86400e3, id2);
    q.run("UPDATE oomba_turns SET ended_at=? WHERE owner_id=?", now() - 8 * 86400e3, boss.id);
    C.prune();
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_chats WHERE ctx_key=?", id2).n, 0);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_turns WHERE owner_id=?", boss.id).n, 0);
    // With the account.
    const id3 = await drafted(boss);
    assert.ok(q.get("SELECT 1 FROM oomba_chats WHERE ctx_key=?", id3));
    F.forgetUser(boss.id);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_chats WHERE owner_id=?", boss.id).n, 0);
    assert.equal(q.get("SELECT COUNT(*) n FROM oomba_turns WHERE owner_id=?", boss.id).n, 0);
  } finally { F.hooks.create = null; }
});

test('readAnswer and the units: numbers become ids, bad numbers ignored, a unit outside the list ignored, empty answers refused', () => {
  const { boss } = world();
  const id = F.createWorksheet(boss, { items: FIRST.slice(0, 3) }).id;
  const w = F.ownWorksheet(boss, id), items = F.itemsOf(id);
  const p = FC.readAnswer({ reply: 'ok', units: 'furlongs', grade: 'k', edits: [{ op: 'remove', n: 2 }, { op: 'remove', n: 2 }, { op: 'remove', n: 0 }, { op: 'replace', n: 9, item: { gen: 'rectangle' } }] }, w, items);
  assert.deepEqual(p.ops, [{ op: 'remove', id: items[1].id }]);
  assert.equal(p.units, ''); assert.equal(p.grade, 'K');
  assert.throws(() => FC.readAnswer({ reply: '', edits: [] }, w, items), SyntaxError);
  assert.throws(() => FC.readAnswer([], w, items), SyntaxError);
  assert.deepEqual(FC.jsonIn('```json\n{"reply":"x"}\n```'), { reply: 'x' });
  assert.deepEqual(FC.jsonIn('Sure! {"reply":"y"} Done.'), { reply: 'y' });
});

test('the shared engine: a surface with one live turn per conversation, its own steps and its own apply/undo', async () => {
  const { boss } = world();
  const notes = new Map();
  let release; const gate = new Promise(r => { release = r; });
  C.defineSurface({
    id: 'test-notes', live: 'chat', steps: ['check', 'ai', 'save'],
    may: u => !!u, context: (u, key) => (String(key).startsWith('n') ? { key } : null), check: (u, text) => (/secret/.test(text) ? 'words' : null),
    async answer({ ctx, text, step }) { await gate; step(2); return { reply: `Noted: ${text}`, apply: () => { const was = notes.get(ctx.key) || ''; notes.set(ctx.key, text); return { change: { n: 1 }, undo: { was } }; } }; },
    undo(u, ctx, data) { notes.set(ctx.key, data.was); return { ok: true, skipped: 0 }; },
  });
  assert.throws(() => C.defineSurface({ id: 'broken' }), /needs|missing/);
  const a = C.send(boss, 'test-notes', 'n1', { text: 'first note' }), b = C.send(boss, 'test-notes', 'n2', { text: 'second note' });
  assert.ok(a.ok && b.ok, 'two conversations answer at once under a per-conversation rule');
  assert.equal(C.send(boss, 'test-notes', 'n1', { text: 'again' }).code, 'chatBusy');
  assert.equal(C.send(boss, 'test-notes', 'x1', { text: 'nope' }).code, 'notFound');
  assert.equal(C.send(boss, 'test-notes', 'n3', { text: 'a secret' }).code, 'words');
  assert.deepEqual(a.chat.pending.names, ['check', 'ai', 'save']);
  release(); await C.allSettled();
  assert.equal(notes.get('n1'), 'first note');
  const t = C.current(boss, 'test-notes', 'n1').chat.turns.at(-1);
  assert.equal(t.text, 'Noted: first note'); assert.equal(t.change.canUndo, true);
  assert.ok(C.undo(boss, 'test-notes', 'n1', t.id).ok);
  assert.equal(notes.get('n1'), '');
  assert.equal(C.eta('test-notes').src, 'default');
});
