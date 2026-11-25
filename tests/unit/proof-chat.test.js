// Mistake Hunt, Phase 3 (docs/decisions.md "Mistake Hunt, Phase 3"), with the model faked through proof-ai.js hooks.create:
//   - Oomba's chat on a set (services/proof-chat.js): a reply-only turn and what the AI sees (the set's words and planted
//     mistakes, never students); a "replace" whose passages are planted again by proof-core on the server (the key always
//     fixes each passage back to its own correct text, a kept passage keeps its mistakes, the AI never chooses where a
//     mistake goes), caps ("fewer comma mistakes") and "only spelling"; bad JSON and a timeout fall back calmly with Try
//     again and one warn line without the words; a message naming a student refused before the AI; free teachers,
//     students and kids refused; one turn at a time; the chat follows its set and goes with it and the account;
//   - class insights (services/proof-insights.js): counts only to the AI (no names, no work, no passage text), the
//     code's read as the fallback, cached until a new hand-in, the progress page's card, the plan note, never students.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, publish, official, teacher, teacher2, cls, mia, leo, kid, q, RL, config } from './_live.js';
import * as A from '../../server/services/proof-ai.js';
import * as PC from '../../server/services/proof-chat.js';
import * as PI from '../../server/services/proof-insights.js';
import { hooks as callHooks } from '../../server/services/ai-call.js';
import { proofCore } from '../../server/services/proof-core.js';
import * as G from '../../server/services/game-sets.js';
import * as L from '../../server/services/lessons.js';
import * as TOOLS from './_tools-plan.js';

const P = proofCore();
const MH = q.get("SELECT id FROM games WHERE slug='mistake-hunt'") || publish(official, '<!doctype html><title>t</title><p>mh</p>', { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
PC._resetGame();
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const X2 = 'Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground, and they measure the gases. These clues help them warn people to leave their homes in time.';
const X3 = 'On Monday, our class went to the library. Your library card is important, so don\'t lose it. The children found books about wolves, geese, and mice, and then they read quietly.';
const TYPES = ['sp-common', 'pc-end', 'pc-start', 'us-there', 'pc-series', 'pc-intro', 'pc-compound', 'us-its'];
const plain = x => JSON.parse(JSON.stringify(x));
const M1 = plain(P.plant(X1, { types: TYPES, n: 5, seed: 3 }));
const draft = (extra = {}) => ({ T: 'Volcanoes', g: 4, types: TYPES, n: 5, p: [{ t: 'Inside a volcano', x: X1, m: M1 }], ...extra });
const answer = obj => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 }, model: 'test' });
let calls = [], logs = [];
const fake = fn => { calls = []; A.hooks.create = async (params, opts) => { calls.push({ params, opts }); return fn(params); }; };
const say = (user, body) => call(`/api/games/${MH.id}/proof/chat`, { method: 'POST', body: { set: draft(), ...body }, user });
const chatOf = async (user, setId = '') => (await call(`/api/games/${MH.id}/proof/chat${setId ? `?setId=${setId}` : ''}`, { user })).json.chat;
const turn = async (user, body) => { const r = await say(user, body); assert.equal(r.status, 200, JSON.stringify(r.json)); await PC.settled(r.json.chat.id); return chatOf(user, body.setId || ''); };
const fixes = (x, m) => P.key(x, m).map(k => ({ a: k.a, b: k.b, s: k.right }));
const keyOk = (x, m) => { assert.equal(P.problem(x, m), ''); assert.equal(P.applyEdits(x, m, fixes(x, m)), x, 'the key fixes the passage back to its own text'); };
const wipe = () => q.run('DELETE FROM proof_chats');

TOOLS.plansOn(); TOOLS.givePlan(teacher.id);
test.beforeEach(() => { RL._reset(); logs = []; callHooks.log = (msg, line) => logs.push({ msg, line }); PC._reset(); wipe(); });
test.after(() => { A.hooks.create = null; callHooks.log = null; TOOLS.plansOn(false); });

test('migration 0105: after 0104, the chat and insight tables', async () => {
  const { MIGRATIONS } = await import('../../server/db.js');
  const names = MIGRATIONS.map(m => m[0]);
  assert.ok(names.indexOf('0105_mistake_hunt_chat') > names.indexOf('0104_mistake_hunt_shelf'));
  assert.ok(q.all('PRAGMA table_info(proof_chats)').some(c => c.name === 'pending_id'));
  assert.ok(q.all('PRAGMA table_info(proof_insights)').some(c => c.name === 'handed'));
});

test('chat: a reply-only turn; the AI sees the set and its planted mistakes, never a student', async () => {
  fake(() => answer({ reply: 'This passage has five mistakes, two of them commas.', action: null }));
  const r = await say(teacher, { text: 'How many comma mistakes are there?' });
  assert.equal(r.status, 200);
  assert.ok(r.json.chat.pending, 'the answer is on its way');
  await PC.settled(r.json.chat.id);
  const chat = await chatOf(teacher);
  assert.deepEqual(chat.turns.map(x => x.role), ['me', 'oomba']);
  assert.equal(chat.turns[1].text, 'This passage has five mistakes, two of them commas.');
  assert.equal(chat.turns[1].change, undefined);
  assert.equal(calls.length, 1);
  const p = calls[0].params;
  assert.equal(p.model, config.builderModel); assert.equal(p.output_config.effort, 'low'); assert.equal(p.output_config.format, undefined);
  assert.equal(calls[0].opts.maxRetries, 0);
  assert.ok(p.system.includes(JSON.stringify(X1)), 'the passage\'s correct text');
  for (const k of P.key(X1, M1)) assert.ok(p.system.includes(JSON.stringify(k.wrong)), 'each planted mistake (what students see)');
  assert.match(p.system, /never choose where they go/);
  const sent = JSON.stringify(p);
  for (const n of ['Mia', 'Leo', 'Pupil']) assert.ok(!sent.includes(n), `no student name (${n})`);
  assert.deepEqual(p.messages, [{ role: 'user', content: 'How many comma mistakes are there?' }]);
});

test('chat: a passage naming one of the teacher\'s students is hidden from the AI and kept as it is', async () => {
  const XN = 'Mia Pupil went to the lake on Saturday. She saw ducks, geese, and a heron near the shore. It was a calm, quiet morning, and the water was still.';
  const MN = plain(P.plant(XN, { types: TYPES, n: 3, seed: 2 }));
  fake(() => answer({ reply: 'Done.', action: { op: 'replace', set: { kinds: TYPES, perPassage: 5, passages: [{ keep: 1 }, { keep: 2 }] } } }));
  const chat = await turn(teacher, { text: 'Keep them as they are', set: draft({ p: [{ t: 'Inside a volcano', x: X1, m: M1 }, { t: 'Lake', x: XN, m: MN }] }) });
  assert.ok(!JSON.stringify(calls[0].params).includes('Mia'), 'the passage with the name never went');
  assert.match(calls[0].params.system, /"hidden":true/);
  const set = chat.turns[1].change.set;
  assert.equal(set.p[1].x, XN, 'kept from the teacher\'s own draft');
  assert.deepEqual(set.p[1].m, MN, 'its mistakes too (same kinds and count)');
});

test('chat: a change is the whole set, planted by proof-core on the server; kept passages keep their mistakes; the key is right', async () => {
  fake(() => answer({ reply: 'I added a passage about scientists.', action: { op: 'replace', set: {
    title: 'Volcanoes and scientists', grade: 4, kinds: TYPES, perPassage: 5,
    // the AI may not choose mistakes: "mistakes" here is ignored, the server plants
    passages: [{ keep: 1 }, { title: 'Volcano scientists', text: X2, mistakes: [{ a: 0, b: 1, w: 'Sceintists' }] }],
  } } }));
  const chat = await turn(teacher, { text: 'Add a passage about volcano scientists' });
  const ch = chat.turns[1].change;
  assert.equal(ch.passages, 2); assert.equal(ch.written, 1); assert.equal(ch.applied, false);
  const s = ch.set;
  assert.equal(s.T, 'Volcanoes and scientists'); assert.equal(s.g, 4); assert.equal(s.n, 5);
  assert.equal(s.p[0].x, X1); assert.deepEqual(s.p[0].m, M1, 'the kept passage keeps its mistakes');
  assert.equal(s.p[1].x, X2); assert.equal(s.p[1].ai, 1);
  assert.ok(s.p[1].m.length >= 3 && s.p[1].m.length <= 5);
  assert.ok(!s.p[1].m.some(m => m.w === 'Sceintists' && m.a === 0), 'the AI\'s own mistake was not used');
  assert.ok(s.p[1].m.every(m => TYPES.includes(m.k)));
  for (const p of s.p) keyOk(p.x, p.m);
  assert.equal(ch.mistakes, s.p[0].m.length + s.p[1].m.length);
  // the set saves as it came back
  assert.ok(G.cleanProofItems(s.p.map((p, i) => ({ t: p.t, x: p.x, g: s.g, m: p.m, ...(i === 0 ? { o: { h: true, s: true, n: 'total' } } : {}) }))));
  // put in the builder: not offered again
  const ap = await call(`/api/games/${MH.id}/proof/chat/applied`, { method: 'POST', body: { turnId: chat.turns[1].id }, user: teacher });
  assert.equal(ap.status, 200);
  const again = await chatOf(teacher);
  assert.equal(again.turns[1].change.applied, true); assert.equal(again.turns[1].change.set, null);
  // the next message carries the history: the change is summarised, not re-sent
  fake(() => answer({ reply: 'Sure.', action: null }));
  await turn(teacher, { text: 'Thanks, what grade is it for?' });
  assert.equal(calls[0].params.messages.length, 3);
  assert.match(calls[0].params.messages[1].content, /the set was changed/);
});

test('chat: "fewer comma mistakes" caps commas, "only spelling" plants only spelling, "make passage 2 easier" rewrites one', async () => {
  fake(() => answer({ reply: 'At most one comma mistake now.', action: { op: 'replace', set: { kinds: TYPES, perPassage: 5, max: { commas: 0 }, passages: [{ keep: 1 }, { keep: 2 }] } } }));
  const two = draft({ p: [{ t: 'Inside a volcano', x: X1, m: M1 }, { t: 'Library day', x: X3, m: P.plant(X3, { types: TYPES, n: 5, seed: 9 }) }] });
  let s = (await turn(teacher, { text: 'No comma mistakes', set: two })).turns[1].change.set;
  for (const p of s.p) { keyOk(p.x, p.m); assert.ok(!p.m.some(m => PC.FAMILIES.commas.includes(m.k)), 'no comma mistakes'); assert.ok(p.m.length >= 3); }
  wipe();
  fake(() => answer({ reply: 'Only spelling.', action: { op: 'replace', set: { kinds: ['sp-common', 'sp-double', 'sp-suffix', 'sp-ie'], perPassage: 3, passages: [{ keep: 1 }, { keep: 2 }] } } }));
  s = (await turn(teacher, { text: 'Only spelling', set: two })).turns[1].change.set;
  assert.deepEqual(s.types, ['sp-common', 'sp-double', 'sp-suffix', 'sp-ie']);
  for (const p of s.p) { keyOk(p.x, p.m); assert.ok(p.m.every(m => P.BY[m.k].g === 'spell')); }
  wipe();
  const EASY = 'Volcanoes are mountains with hot rock inside. Sometimes the rock comes out. It is called lava, and it is very hot. People who study volcanoes keep everyone safe.';
  fake(() => answer({ reply: 'Passage 2 is shorter now.', action: { op: 'replace', set: { kinds: TYPES, perPassage: 5, passages: [{ keep: 1 }, { title: 'Hot rock', text: EASY, count: 3 }] } } }));
  s = (await turn(teacher, { text: 'Make passage 2 easier', set: two })).turns[1].change.set;
  assert.equal(s.p[0].x, X1); assert.deepEqual(s.p[0].m, M1);
  assert.equal(s.p[1].x, EASY); assert.ok(s.p[1].m.length <= 3); keyOk(EASY, s.p[1].m);
});

test('chat: passages the filter refuses are left out; nothing usable leaves the set unchanged', async () => {
  fake(() => answer({ reply: 'Here.', action: { op: 'replace', set: { kinds: TYPES, passages: [{ keep: 1 }, { title: 'x', text: `${X2} This part is shit.` }, { title: 'y', text: 'Too short.' }] } } }));
  let ch = (await turn(teacher, { text: 'Add two passages' })).turns[1].change;
  assert.equal(ch.passages, 1); assert.equal(ch.dropped, 2);
  wipe();
  fake(() => answer({ reply: 'Here.', action: { op: 'replace', set: { kinds: TYPES, passages: [{ title: 'x', text: 'Too short.' }] } } }));
  const t = (await turn(teacher, { text: 'Rewrite it' })).turns[1];
  assert.equal(t.change, undefined); assert.equal(t.note, 'notBuilt');
});

// Checked work (docs/decisions.md "Builders check their work: verify after every change"): the reply was written before
// the server built the set, so what the checks left out is said in the app's own words after it, and on the turn.
test('chat: a partial or failed change is reported truthfully after Oomba\'s words', async () => {
  fake(() => answer({ reply: 'I added two passages.', action: { op: 'replace', set: { kinds: TYPES, passages: [{ keep: 1 }, { title: 'x', text: `${X2} This part is shit.` }, { title: 'y', text: 'Too short.' }] } } }));
  let t = (await turn(teacher, { text: 'Add two passages' })).turns[1];
  assert.equal(t.text, 'I added two passages. 2 passages were left out: they didn’t pass the checks.');
  assert.deepEqual(t.verify, { ok: false, landed: 1, notLanded: [{ code: 'filtered', count: 2 }] });
  wipe();
  fake(() => answer({ reply: 'Done, I rewrote it.', action: { op: 'replace', set: { kinds: TYPES, passages: [{ title: 'x', text: 'Too short.' }] } } }));
  t = (await turn(teacher, { text: 'Rewrite it' })).turns[1];
  assert.equal(t.change, undefined);
  assert.match(t.text, /^Done, I rewrote it\. Nothing in the set changed: none of the passages passed the checks\./);
  assert.deepEqual(t.verify, { ok: false, landed: 0, notLanded: [{ code: 'notBuilt' }] });
  wipe();
});

test('chat: bad JSON and a timeout fall back calmly, the words kept, Try again; one warn line without the words', async () => {
  fake(() => answer('not json at all'));
  let chat = await turn(teacher, { text: 'Secret request about owls' });
  assert.equal(chat.turns[1].failed, 'error'); assert.equal(chat.turns[1].for, chat.turns[0].id);
  assert.equal(chat.turns[0].text, 'Secret request about owls');
  assert.equal(logs.length, 1); assert.equal(logs[0].line.kind, 'bad_json');
  assert.doesNotMatch(JSON.stringify(logs), /owls|Secret/i);
  fake(() => { throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }); });
  chat = await turn(teacher, { text: 'Secret request about owls', retry: chat.turns[0].id });
  assert.equal(chat.turns.length, 2, 'the failed pair made way for the same words');
  assert.equal(chat.turns[1].failed, 'timeout');
});

test('chat: a student\'s name, rude words or nothing are refused before the AI; nothing stored', async () => {
  fake(() => answer({ reply: 'x', action: null }));
  let r = await say(teacher, { text: 'Make passage 1 about Mia and her dog' });
  assert.equal(r.status, 400); assert.equal(r.json.code, 'names');
  r = await say(teacher, { text: 'Make it about shit' });
  assert.equal(r.json.code, 'words');
  r = await say(teacher, { text: ' ' });
  assert.equal(r.json.code, 'brief');
  assert.equal(calls.length, 0);
  assert.equal((await chatOf(teacher)).turns.length, 0);
});

test('chat: Teacher plan only; free teachers get the plan answer; students, kids and plans off refused; the frame says which', async () => {
  fake(() => answer({ reply: 'x', action: null }));
  let r = await say(teacher2, { text: 'Fewer comma mistakes' });
  assert.equal(r.status, 403); assert.equal(r.json.code, 'teacherPlan');
  for (const u of [mia, kid]) { r = await say(u, { text: 'Fewer comma mistakes' }); assert.equal(r.status, 403); assert.equal(r.json.code, 'notAllowed'); }
  assert.equal((await call(`/api/games/${MH.id}/proof/chat`, { user: mia })).status, 403);
  assert.equal(calls.length, 0);
  assert.equal(PC.chatAccess(teacher), 'yes'); assert.equal(PC.chatAccess(teacher2), 'plan'); assert.equal(PC.chatAccess(mia), null);
  TOOLS.plansOn(false);
  try { assert.equal(PC.chatAccess(teacher2), null, 'no plan note while plans are off'); assert.equal((await say(teacher2, { text: 'Fewer commas' })).json.code, 'notAllowed'); }
  finally { TOOLS.plansOn(); }
});

test('chat: one turn at a time; a restart ends the turn as failed', async () => {
  let release; fake(() => new Promise(res => { release = () => res(answer({ reply: 'ok', action: null })); }));
  const r = await say(teacher, { text: 'First message' });
  assert.equal(r.status, 200);
  const busy = await say(teacher, { text: 'Second message' });
  assert.equal(busy.status, 409); assert.equal(busy.json.code, 'chatBusy');
  release(); await PC.settled(r.json.chat.id);
  // a restart: the pending turn is not running in this process
  q.run("UPDATE proof_chats SET pending_id='gone', pending_at=? WHERE id=?", Date.now(), r.json.chat.id);
  const chat = await chatOf(teacher);
  assert.equal(chat.pending, null); assert.equal(chat.turns.at(-1).failed, 'restart');
});

test('chat: follows its set (a new set\'s chat is taken over on save), goes with the set and the account', async () => {
  fake(() => answer({ reply: 'Hello!', action: null }));
  await turn(teacher, { text: 'A new set' });
  const s = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items: [{ t: 'Inside a volcano', x: X1, g: 4, m: M1, o: { h: true, s: true, n: 'total' } }], title: 'Volcanoes' }, user: teacher });
  assert.equal(s.status, 200, s.text);
  const setId = s.json.id;
  const chat = await chatOf(teacher, setId);
  assert.equal(chat.turns.length, 2, 'the saved set took the new set\'s chat');
  assert.ok(q.get('SELECT 1 FROM proof_chats WHERE owner_id=? AND set_key=?', teacher.id, setId));
  // another teacher can't read it through the set's id
  TOOLS.givePlan(teacher2.id);
  assert.equal((await chatOf(teacher2, setId)).turns.length, 0);
  // the set is deleted: its chat goes
  const del = await call(`/api/games/${MH.id}/sets/${setId}`, { method: 'DELETE', user: teacher });
  assert.ok(del.status === 200 || del.status === 204, del.text);
  assert.equal(q.get('SELECT COUNT(*) n FROM proof_chats WHERE set_key=?', setId).n, 0);
  // the account goes: every chat of theirs
  await turn(teacher, { text: 'Another' });
  G.forgetUser(teacher.id);
  assert.equal(q.get('SELECT COUNT(*) n FROM proof_chats WHERE owner_id=?', teacher.id).n, 0);
});

// ---------------------------------------------------------------- class insights
const ITEMS = [{ t: 'Inside a volcano', x: X1, g: 4, m: M1, o: { h: true, s: true, n: 'total' } }, { t: 'Library day', x: X3, g: 4, m: P.plant(X3, { types: TYPES, n: 4, seed: 8 }) }];
async function assigned() {
  const s = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items: ITEMS, title: 'Volcanoes: find the mistakes' }, user: teacher });
  assert.equal(s.status, 200, s.text);
  const r = await call('/api/teach/assign-proofread', { method: 'POST', body: { setId: s.json.id, classId: cls.id }, user: teacher });
  assert.equal(r.status, 200, r.text);
  const clId = /progress\/([^/?#]+)/.exec(r.json.redirect)[1];
  const cl = L.getClassLesson(clId), step = L.steps(cl.lesson_id)[0];
  return { cl, step, api: `/api/progress/${cl.id}/${step.id}/proofread`, ins: `/api/proof/insights/${cl.id}/${step.id}`, page: `/class/${cls.id}/progress/${cl.id}` };
}

test('insights: counts only go to the AI (no names, no work, no passages), cached until a new hand-in; the code\'s read as fallback', async () => {
  const w = await assigned();
  // nothing handed in yet
  let g = await call(w.ins, { user: teacher });
  assert.equal(g.status, 200); assert.equal(g.json.facts.handed, 0); assert.equal((await call(w.ins, { method: 'POST', user: teacher })).json.code, 'noneYet');
  // Mia hands in with the first passage fixed and a strange word typed
  await call(w.api, { method: 'POST', body: { edits: [fixes(X1, M1).concat([]), []], handIn: true }, user: mia });
  g = await call(w.ins, { user: teacher });
  assert.equal(g.json.facts.handed, 1); assert.equal(g.json.insight, null);
  assert.ok(g.json.summary.lines.length >= 2, 'the code\'s read');
  assert.match(g.json.summary.lines[0], /1 of 2 handed in/);
  fake(() => answer({ read: 'The class found most capital letters but missed the commas after an opening part.', tips: ['Try a short set on commas after an opening part.', 'Read a passage aloud and pause at each comma.'] }));
  let r = await call(w.ins, { method: 'POST', user: teacher });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.ai, true); assert.equal(r.json.insight.tips.length, 2);
  assert.equal(calls.length, 1);
  const sent = JSON.stringify(calls[0].params);
  for (const s of ['Mia', 'Leo', 'Pupil', 'Tia', X1.slice(0, 30), X3.slice(0, 30), ...P.key(X1, M1).map(k => JSON.stringify(k.wrong).slice(1, -1)).filter(x => x.length > 3)]) assert.ok(!sent.includes(s), `nothing but counts: ${s}`);
  assert.match(calls[0].params.messages[0].content, /found \d+ times, missed \d+ times/);
  assert.match(calls[0].params.messages[0].content, /1 of 2 students handed in/);
  // cached: no second call, GET shows it
  r = await call(w.ins, { method: 'POST', user: teacher });
  assert.equal(r.json.ai, true); assert.equal(calls.length, 1);
  g = await call(w.ins, { user: teacher });
  assert.match(g.json.insight.read, /missed the commas/);
  // the page shows Oomba's read
  let pg = await call(w.page, { user: teacher });
  assert.match(pg.text, /Oomba&#39;s read|Oomba's read/); assert.match(pg.text, /missed the commas/);
  // Leo hands in: the read is stale, the code's read shows with Ask Oomba
  await call(w.api, { method: 'POST', body: { edits: [[], []], handIn: true }, user: leo });
  g = await call(w.ins, { user: teacher });
  assert.equal(g.json.insight, null); assert.equal(g.json.stale, true); assert.equal(g.json.facts.handed, 2);
  pg = await call(w.page, { user: teacher });
  assert.match(pg.text, /Ask Oomba/); assert.match(pg.text, /New work was handed in/);
  // the AI fails: a calm answer, nothing cached, the code's read stays
  fake(() => { throw Object.assign(new Error('overloaded'), { status: 529 }); });
  r = await call(w.ins, { method: 'POST', user: teacher });
  assert.equal(r.json.ai, false); assert.equal(r.json.reason, 'busy'); assert.match(r.json.toast, /read from the numbers/);
  assert.equal((await call(w.ins, { user: teacher })).json.insight, null);
  assert.equal(logs.at(-1).line.kind, 'overloaded');
});

test('insights: the code\'s read names the kinds missed most, no ranking; plan note for free teachers; never students', async () => {
  const w = await assigned();
  await call(w.api, { method: 'POST', body: { edits: [[], []], handIn: true }, user: mia });
  const c = PI.card(teacher, w.cl.id, w.step.id, { t: (k, v) => `${k}${v ? JSON.stringify(v) : ''}`, lang: 'en' });
  assert.ok(c.ok);
  assert.ok(c.facts.kinds.length >= 3 && c.facts.kinds.every(x => x.found === 0 && x.missed >= 1));
  assert.ok(c.summary.lines.some(l => l.startsWith('proof.insight.missedLine')));
  assert.ok(c.summary.tips.length >= 1);
  assert.ok(!JSON.stringify(c).includes('Mia'), 'no names in the facts or the read');
  // a teacher without the plan (another class's teacher can't see it at all)
  assert.equal((await call(w.ins, { user: teacher2 })).status, 404);
  q.run("UPDATE billing_subscriptions SET status='canceled', current_period_end=? WHERE owner_id=?", Date.now() - 1000, String(teacher.id));
  try {
    const g = await call(w.ins, { user: teacher });
    assert.equal(g.json.access, 'plan'); assert.equal(g.json.facts, undefined);
    assert.equal((await call(w.ins, { method: 'POST', user: teacher })).json.code, 'teacherPlan');
    const pg = await call(w.page, { user: teacher });
    assert.match(pg.text, /part of the Teacher plan/); assert.match(pg.text, /href="\/trial"/); assert.doesNotMatch(pg.text, /Ask Oomba/);
  } finally { TOOLS.givePlan(teacher.id); }
  // students: never
  assert.equal((await call(w.ins, { user: mia })).status, 404);
  assert.equal((await call(w.ins, { method: 'POST', user: mia })).status, 404);
});
