// The Figures worksheet workflow and the shared chat engine (docs/decisions.md "Figures: Oomba's chat and the shared chat
// engine"; services/figures-chat.js, services/oomba-chat.js). Since one chat everywhere ("Oomba teaching companion: one
// chat everywhere") the worksheet's Oomba is the site's companion: every behavior of the old per-worksheet chat is
// tested through it in tests/unit/companion-figures.test.js. What stays here: the engine's tables, its contract for a
// surface (one live turn per conversation, steps, apply and undo), and the workflow's pure parts (readAnswer, units).
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

test('migration 0107: after 0106, the shared engine\'s conversations and jobs with one live turn per live key', () => {
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.indexOf('0107_figures_chat') > names.indexOf('0106_mistake_hunt_limits'));
  assert.ok(q.all('PRAGMA table_info(oomba_turns)').some(c => c.name === 'live_key'));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='oomba_turns_one_live'"));
  assert.ok(q.get("SELECT 1 FROM sqlite_master WHERE type='index' AND name='oomba_chats_ctx'"));
  // One chat everywhere: the worksheet's own surface is gone; the companion's is one live turn per teacher.
  assert.equal(C.surfaceOf('figures'), null);
  assert.equal(C.surfaceOf('companion').live, 'owner');
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
