// Checked work after every page edit (docs/decisions.md "Builders check their work: verify after every change";
// services/verify-change.js). The owner's report, 25 Nov 2026: on a Figures test Oomba said it had replaced question 1
// ("What is the area of the rectangle?") with a "name the square" multiple-choice question, twice; the screen kept the
// area question. The figure Oomba sent (a square with both AB and BC) could not be drawn, so the repair swapped the whole
// question for its kind's number generator, the options were lost, and the tool told the AI "done" before anything was
// written. Here: that exact flow lands (the figure is drawn without the measure it says to leave out, the options kept),
// the tool's result is the worksheet read back, an edit that cannot land says so truthfully (to the AI and on the card,
// with Try again), a write that differs from what the AI was told is corrected in the reply, and a board's change on
// Manipulatives reports what was left out. The AI is a stand-in (services/companion.js hooks.create).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { createUser, startSession } = await import('../../server/auth.js');
const S = await import('../../server/services/schools.js');
const F = await import('../../server/services/figures.js');
const CO = await import('../../server/services/companion.js');
const C = await import('../../server/services/oomba-chat.js');
const VC = await import('../../server/services/verify-change.js');
const RL = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); server.keepAliveTimeout = 0; await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { CO.hooks.create = null; server.close(); });
test.beforeEach(() => RL._reset());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const as = who => async (p, { body } = {}) => {
  const headers = { cookie: cookieFor(who.id) };
  if (body !== undefined) headers['content-type'] = 'application/json';
  const r = await fetch(base + p, { method: body !== undefined ? 'POST' : 'GET', headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => null) };
};
let n = 0;
function teacher() {
  const k = ++n;
  const boss = createUser({ username: `CoVerify${k}`, password: 'secret123', role: 'admin' });
  const oak = S.createSchool(boss, { name: `Verify Oak ${k}` }).school;
  S.addMember(boss, oak.id, boss.id, 'teacher', { rosterName: 'Ms Boss' });
  return boss;
}
const say = (who, page, text, extra = {}) => as(who)('/api/companion/chat', { body: { page, text, ...extra } });
const chatOf = async who => (await as(who)('/api/companion/chat')).json.chat;
const reset = async who => { await C.allSettled(); CO.reset(who); };
const toolResults = calls => calls.flatMap(p => (Array.isArray(p.messages.at(-1).content) ? p.messages.at(-1).content.filter(c => c.type === 'tool_result').map(c => JSON.parse(c.content)) : []));

/** The stand-in: each round is a page tool call ({ tool, input }) or, after a tool, words made from what the tool
 *  answered (say(result)), the way the real AI is told to: only what landed. */
function standIn(rounds, say0) {
  const calls = []; let k = 0;
  CO.hooks.create = async params => {
    calls.push(JSON.parse(JSON.stringify(params)));
    const last = params.messages.at(-1), res = Array.isArray(last.content) ? last.content.find(c => c.type === 'tool_result') : null;
    const r = rounds[k++];
    const base0 = { model: params.model, usage: { input_tokens: 5, output_tokens: 5 } };
    if (r) return { ...base0, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: `tu${k}`, name: r.tool || 'editWorksheet', input: r.input }] };
    return { ...base0, stop_reason: 'end_turn', content: [{ type: 'text', text: say0(res ? JSON.parse(res.content) : null) }] };
  };
  return calls;
}
const grounded = r => (r && r.applied ? `Done: ${r.landed.map(x => (x.now ? `question ${x.now.n} is now "${x.now.question}" (${x.now.answerType})` : 'changed')).join('; ')}.` : `That did not change: ${(r && r.notLanded[0] && r.notLanded[0].why) || 'it did not land'}. Want me to try again?`);

// What the owner's Oomba sent: "Which shape is this?" on a square drawn with AB and BC (OF.check: a square is drawn
// from AB; leave out "BC"), as multiple choice with four options.
const SQUARE = { kind: 'rectangle', data: { AB: 5, BC: 5, square: true, unit: 'cm' }, question: 'What is the name of this shape?', answerType: 'choice', choices: ['Square', 'Circle', 'Triangle', 'Rectangle'], correct: 0 };
const area = (AB, BC) => ({ kind: 'rectangle', data: { AB, BC, unit: 'cm' }, question: 'What is the area of the rectangle?', answerType: 'number', answerKey: 'area' });

test('the owner\'s flow: replacing question 1 ("What is the area of the rectangle?") with a name-the-shape multiple-choice question lands, options kept, though its figure needed repairing', async () => {
  const boss = teacher();
  // The test as the owner had it: eight questions, question 1 the area question the first repair left.
  const id = F.createWorksheet(boss, { purpose: 'test', title: 'Shapes', items: [area(6, 4), ...Array.from({ length: 7 }, (_, i) => area(i + 2, 3))] }).id;
  const q1 = F.itemsOf(id)[0].id;
  const calls = standIn([{ input: { edits: [{ op: 'replace', n: 1, item: SQUARE }] } }], grounded);
  try {
    const r = await say(boss, { type: 'figures-sheet', sheetId: id }, 'The first question isn\'t multiple choice');
    assert.equal(r.status, 200, JSON.stringify(r.json));
    await C.allSettled();
    // On the worksheet (what the page shows): question 1 is the name-the-shape question, multiple choice, its options kept.
    const it = F.itemsOf(id)[0];
    assert.equal(it.id, q1, 'the same question, replaced in place');
    assert.equal(it.question, 'What is the name of this shape?');
    assert.equal(it.answerType, 'choice');
    assert.deepEqual(it.choices, ['Square', 'Circle', 'Triangle', 'Rectangle']);
    assert.equal(it.correct, 0);
    assert.equal(it.data.BC, undefined, 'drawn without the measure the figure works out itself');
    // The tool's result is the worksheet read back after the change, not "done" before it was written.
    const [res] = toolResults(calls);
    assert.equal(res.applied, true);
    assert.equal(res.landed.length, 1);
    assert.equal(res.landed[0].now.question, 'What is the name of this shape?');
    assert.equal(res.landed[0].now.answerType, 'choice');
    assert.deepEqual(res.landed[0].now.choices, ['Square', 'Circle', 'Triangle', 'Rectangle']);
    assert.match(res.landed[0].repaired, /without BC/);
    assert.deepEqual(res.notLanded, []);
    assert.match(res.worksheetNow.questions[0], /^1\. What is the name of this shape\? \[multiple choice: Square \/ Circle \/ Triangle \/ Rectangle\]/);
    // The rule is in what the AI is told, and the reply came from that result.
    assert.ok(calls[0].system.includes(VC.RULE));
    assert.match(calls[0].system, /Never say a question changed unless landed shows it/);
    const last = (await chatOf(boss)).turns.at(-1);
    assert.match(last.text, /question 1 is now "What is the name of this shape\?" \(choice\)/);
    assert.deepEqual(last.change.changed, [1]);
    assert.equal(last.change.canUndo, true);
    assert.equal(last.change.undone, undefined, 'nothing undid it: the card says what changed, never "Change undone."');
    assert.equal(last.verify.ok, true);
    assert.equal(last.verify.landed, 1);
    assert.deepEqual(last.note.steps.map(s => [s.k, s.n]), [['edit', 1]]);
  } finally { await reset(boss); }
});

test('the first draft of the owner\'s test keeps the name-the-shape question as asked (no swap for an area question)', async () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { purpose: 'test' }).id;
  const calls = standIn([{ input: { title: 'Name the shapes', edits: [SQUARE, ...Array.from({ length: 7 }, (_, i) => area(i + 2, 3))].map(item => ({ op: 'add', item })) } }], grounded);
  try {
    await say(boss, { type: 'figures-sheet', sheetId: id }, 'a multiple choice test asking students to name different shapes');
    await C.allSettled();
    const items = F.itemsOf(id);
    assert.equal(items.length, 8);
    assert.equal(items[0].question, 'What is the name of this shape?');
    assert.equal(items[0].answerType, 'choice');
    assert.deepEqual(items[0].choices, ['Square', 'Circle', 'Triangle', 'Rectangle']);
    const [res] = toolResults(calls);
    assert.equal(res.landed.length, 9, 'eight questions and the title');
    assert.equal(res.landed.filter(x => x.notAsAsked).length, 0);
    const last = (await chatOf(boss)).turns.at(-1);
    assert.equal(last.change.repaired, 0, 'no question was swapped for a generator question');
    assert.equal(last.verify.ok, true);
  } finally { await reset(boss); }
});

test('an edit that cannot land is reported truthfully: the AI is told it did not change and why, the card says so with Try again, and nothing is called changed', async () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { purpose: 'test', items: [area(6, 4), area(3, 3)] }).id;
  const before = JSON.stringify(F.itemsOf(id));
  // A multiple-choice question on a triangle that cannot exist (sides 1, 2 and 10): not swapped for a number question.
  const bad = { kind: 'triangle', data: { AB: 1, BC: 2, CA: 10 }, question: 'What kind of triangle is this?', answerType: 'choice', choices: ['Right', 'Equilateral', 'Isosceles'], correct: 0 };
  const calls = standIn([{ input: { edits: [{ op: 'replace', n: 1, item: bad }] } }], grounded);
  try {
    await say(boss, { type: 'figures-sheet', sheetId: id }, 'make question 1 a multiple choice triangle question');
    await C.allSettled();
    assert.equal(JSON.stringify(F.itemsOf(id)), before, 'the worksheet is as it was');
    const [res] = toolResults(calls);
    assert.equal(res.applied, false);
    assert.deepEqual(res.landed, []);
    assert.equal(res.notLanded[0].n, 1);
    assert.match(res.notLanded[0].why, /cannot be drawn/);
    assert.match(res.note, /Nothing on the worksheet changed/);
    const chat = await chatOf(boss), last = chat.turns.at(-1);
    assert.match(last.text, /That did not change: .*cannot be drawn.*try again/i);
    assert.doesNotMatch(last.text, /\bDone\b/);
    assert.equal(last.change, undefined, 'no "What changed" card and no Undo');
    assert.deepEqual(last.verify, { ok: false, landed: 0, notLanded: [{ code: 'cannotDraw', n: 1 }], swapped: [] });
    assert.deepEqual(last.note.steps.map(s => s.k), ['editNo'], 'the step says it could not change the worksheet');
  } finally { await reset(boss); }
});

test('a second try in the same answer: the rejected edit, then the fixed one; one change, one Undo, the card shows only what is true', async () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { purpose: 'test', items: [area(6, 4), area(3, 3)] }).id;
  const bad = { ...SQUARE, data: { AB: 1, BC: 2, CA: 10 }, kind: 'triangle' };
  const calls = standIn([{ input: { edits: [{ op: 'replace', n: 1, item: bad }] } }, { input: { edits: [{ op: 'replace', n: 1, item: SQUARE }] } }], grounded);
  try {
    await say(boss, { type: 'figures-sheet', sheetId: id }, 'question 1 should ask which shape it is');
    await C.allSettled();
    const [r1, r2] = toolResults(calls);
    assert.equal(r1.applied, false); assert.equal(r2.applied, true);
    assert.equal(F.itemsOf(id)[0].answerType, 'choice');
    const last = (await chatOf(boss)).turns.at(-1);
    assert.deepEqual(last.change.changed, [1]);
    assert.equal(last.verify.ok, true, 'the first try\'s miss is no longer news');
    assert.match(last.text, /question 1 is now "What is the name of this shape\?"/);
  } finally { await reset(boss); }
});

test('a write that lands other than the AI was told (the question deleted by hand while Oomba was answering): the reply is corrected and the card says what did not land', async () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { purpose: 'test', items: [area(6, 4), area(3, 3), area(4, 2)] }).id;
  const q1 = F.itemsOf(id)[0].id;
  let release; const gate = new Promise(r => { release = r; });
  const calls = [];
  CO.hooks.create = async params => {
    calls.push(params);
    const last = params.messages.at(-1);
    const base0 = { model: params.model, usage: { input_tokens: 5, output_tokens: 5 } };
    if (!Array.isArray(last.content)) return { ...base0, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu1', name: 'editWorksheet', input: { edits: [{ op: 'replace', n: 1, item: SQUARE }] } }] };
    await gate;
    return { ...base0, stop_reason: 'end_turn', content: [{ type: 'text', text: grounded(JSON.parse(last.content[0].content)) }] };
  };
  try {
    await say(boss, { type: 'figures-sheet', sheetId: id }, 'make question 1 ask which shape it is');
    while (calls.length < 2) await new Promise(r => setTimeout(r, 10));
    assert.ok(F.deleteItem(boss, id, q1).ok, 'the teacher deletes question 1 by hand meanwhile');
    release(); await C.allSettled();
    const last = (await chatOf(boss)).turns.at(-1);
    assert.match(last.text, /^Done: question 1 is now/, 'what the AI was told');
    assert.match(last.text, /Nothing changed after all: the page changed while I was working\. Please try again\.$/, 'the app\'s own correction');
    assert.equal(last.change, undefined);
    assert.deepEqual(last.verify.notLanded, [{ code: 'meanwhile', n: 1 }]);
    assert.equal(F.itemsOf(id).length, 2);
  } finally { await reset(boss); }
});

test('Change undone. only after the teacher\'s Undo', async () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { purpose: 'test', items: [area(6, 4)] }).id;
  standIn([{ input: { edits: [{ op: 'replace', n: 1, item: SQUARE }] } }], grounded);
  try {
    await say(boss, { type: 'figures-sheet', sheetId: id }, 'question 1 should ask which shape it is'); await C.allSettled();
    let last = (await chatOf(boss)).turns.at(-1);
    assert.equal(last.change.undone, undefined);
    const u = await as(boss)('/api/companion/chat/undo', { body: { turnId: last.id } });
    assert.equal(u.status, 200);
    last = u.json.chat.turns.at(-1);
    assert.equal(last.change.undone, true); assert.equal(last.change.by, 'teacher');
    assert.equal(F.itemsOf(id)[0].question, 'What is the area of the rectangle?');
  } finally { await reset(boss); }
});

test('Manipulatives changeBoard: the result is the board read back, with what the checks left out; a board that cannot be built says nothing changed', async () => {
  const boss = teacher();
  const page = { type: 'manip', tool: 'clock' };
  const board = { tool: 'clock', boardId: null, title: '', state: {} };
  const calls = standIn([{ tool: 'changeBoard', input: { title: 'Quarter hours', steps: ['Read each clock.'], items: [{ time: '3:15' }, { time: '3:15' }, { time: '99:99' }, { time: '4:45' }] } }],
    r => (r && r.applied ? `The board has ${r.landed.items} clocks.${r.notLanded.length ? ` ${r.notLanded[0].items} left out.` : ''}` : 'Nothing changed on the board.'));
  try {
    await say(boss, page, 'make a quarter hours board', { board }); await C.allSettled();
    const [res] = toolResults(calls);
    assert.equal(res.applied, true);
    assert.equal(res.landed.board.title, 'Quarter hours');
    assert.equal(res.landed.items, res.landed.board.items.length, 'the count is what the board shows');
    const last = (await chatOf(boss)).turns.at(-1);
    assert.equal(last.note.manip.n, res.landed.items);
    assert.equal(last.verify.landed, res.landed.items);
    // The impossible time (99:99) failed the clock's checks: said, on the card and in the words.
    assert.equal(last.note.manip.dropped, 1); assert.equal(res.notLanded[0].items, 1);
    assert.equal(last.verify.ok, false); assert.deepEqual(last.verify.notLanded, [{ code: 'filtered', count: 1 }]); assert.match(last.text, /1 left out/);
    // Nothing the tool can build: nothing changed, and the card says so.
    CO.reset(boss);
    const calls2 = standIn([{ tool: 'changeBoard', input: { title: 'x', items: [{ nonsense: true }] } }], r => (r && r.applied ? 'Done!' : 'Nothing changed on the board.'));
    await say(boss, page, 'make it something odd', { board }); await C.allSettled();
    const [res2] = toolResults(calls2);
    assert.equal(res2.applied, false);
    const l2 = (await chatOf(boss)).turns.at(-1);
    assert.equal(l2.text, 'Nothing changed on the board.');
    assert.deepEqual(l2.verify, { ok: false, landed: 0, notLanded: [{ code: 'notBuilt' }] });
    assert.equal(l2.note.manip, undefined);
  } finally { await reset(boss); }
});

test('verify-change: dryRun keeps nothing, kept() says what landed after filtering, correction() only when the write differs', () => {
  const boss = teacher();
  const id = F.createWorksheet(boss, { items: [area(6, 4)] }).id;
  const seen = VC.dryRun(() => { F.deleteItem(boss, id, F.itemsOf(id)[0].id); return F.itemsOf(id).length; });
  assert.equal(seen, 0); assert.equal(F.itemsOf(id).length, 1, 'rolled back');
  assert.equal(VC.kept({ asked: 15, kept: 12, removed: { 'removed by the filter': 3 }, noun: 'words' }).text, '12 of 15 words kept, 3 removed by the filter');
  assert.equal(VC.kept({ asked: 5, kept: 5, noun: 'words' }).text, '5 words kept');
  assert.equal(VC.kept({ asked: 4, kept: 0 }).nothing, true);
  const told = { landed: [{ op: 'replace', n: 1, now: { n: 1, question: 'A' } }] };
  assert.equal(VC.correction(told, { landed: [{ op: 'replace', n: 1, now: { n: 1, question: 'A' } }] }), '');
  assert.match(VC.correction(told, { landed: [] }), /Nothing changed after all/);
});

test('the drafts without a page tool (Crossword clues and words, Word Hunt, Atlas Quest) report how many of the AI\'s items were kept after the checks', async () => {
  const SA = await import('../../server/services/set-ai.js');
  const fake = json => ({ messages: { create: async () => ({ model: 'mock', usage: { input_tokens: 1, output_tokens: 1 }, content: [{ type: 'text', text: JSON.stringify(json) }] }) } });
  // Clues: one gives its word away, so it is left blank: 2 of 3.
  const c = await SA.draftClues({ words: ['volcano', 'glacier', 'delta'], client: fake({ clues: [{ word: 'volcano', clue: 'A volcano is a mountain' }, { word: 'glacier', clue: 'A slow river of ice' }, { word: 'delta', clue: 'Land where a river meets the sea' }] }) });
  assert.equal(c.asked, 3); assert.equal(c.clues.filter(Boolean).length, 2);
  // Words from a document: a repeat and a word with digits are dropped: 2 of 4.
  const w = await SA.draftWordsFromDoc({ text: 'A lesson about rocks and minerals.', client: fake({ title: 'Rocks', words: [{ word: 'basalt', clue: 'Dark rock from lava' }, { word: 'Basalt', clue: 'again' }, { word: 'H2O', clue: 'water' }, { word: 'granite', clue: 'Hard speckled rock' }] }) });
  assert.equal(w.asked, 4); assert.equal(w.words.length, 2);
  assert.equal(VC.kept({ asked: w.asked, kept: w.words.length, removed: { 'removed by the checks': w.asked - w.words.length }, noun: 'words' }).text, '2 of 4 words kept, 2 removed by the checks');
  // Atlas Quest: a country the game does not know is dropped: 1 of 2.
  const g = await SA.draftGeoQuiz({ text: 'France is in Europe.', known: new Set(['FR']), client: fake({ title: 'Europe', items: [{ kind: 'cont', country: 'FR', question: '', answer: '' }, { kind: 'cap', country: 'ZZ', question: '', answer: '' }] }) });
  assert.equal(g.asked, 2); assert.equal(g.items.length, 1);
});
