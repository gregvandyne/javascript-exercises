// Mistake Hunt, Phase 2: the AI tools (services/proof-ai.js; docs/decisions.md "Mistake Hunt, Phase 2"), with the model
// faked through hooks.create (no network):
//   - Power with AI passages: plain JSON (no strict json_schema), clean passages kept exactly, mistakes planted by
//     proof-core (the key fixes each passage back to the AI's own text), anything the text filter refuses dropped;
//   - failure, timeout and bad JSON: a calm fallback with its reason, one warn line without the teacher's words;
//   - a topic (or a passage to check) that names one of the teacher's students is refused before the AI;
//   - Check my passage: flags pointing at the text, nothing changed; why lines drafted in one call, kept through the
//     filter and stored with the set (ai: 1), editable before saving;
//   - the daily cap for free teachers vs none for Teacher plan holders; students, kids, family grown-ups and guests
//     never; the frame offers the tools to teachers only.
import './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { call, publish, official, teacher, teacher2, kid, mum, mia, q, RL, config } from './_live.js';
import * as A from '../../server/services/proof-ai.js';
import { hooks as callHooks } from '../../server/services/ai-call.js';
import { proofCore } from '../../server/services/proof-core.js';
import * as G from '../../server/services/game-sets.js';
import * as TOOLS from './_tools-plan.js';

const P = proofCore();
const MH = q.get("SELECT id FROM games WHERE slug='mistake-hunt'") || publish(official, '<!doctype html><title>t</title><p>mh</p>', { source: 'seed', slug: 'mistake-hunt', title: 'Mistake Hunt' });
const X1 = "A volcano is an opening in Earth's crust. Hot melted rock, called magma, rises from deep underground. When magma reaches the surface, it is called lava. Some volcanoes erupt with a loud boom, while others ooze lava slowly.";
const X2 = "Scientists who study volcanoes watch for small earthquakes. They look for changes in the ground, and they measure the gases. These clues help them warn people to leave their homes in time.";
const answer = obj => ({ content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj) }], usage: { input_tokens: 10, output_tokens: 10 }, model: 'test' });
let calls = [], logs = [];
const fake = fn => { calls = []; A.hooks.create = async (params, opts) => { calls.push({ params, opts }); return fn(params); }; };
const draft = (user, body) => call(`/api/games/${MH.id}/proof/draft`, { method: 'POST', body, user });
const scan = (user, body) => call(`/api/games/${MH.id}/proof/scan`, { method: 'POST', body, user });
const why = (user, body) => call(`/api/games/${MH.id}/proof/why`, { method: 'POST', body, user });
test.beforeEach(() => { RL._reset(); logs = []; callHooks.log = (msg, line) => logs.push({ msg, line }); config.proofAiFreePerDay = 50; });
test.after(() => { A.hooks.create = null; callHooks.log = null; TOOLS.plansOn(false); });

test('passages: plain JSON, kept exactly, mistakes planted by proof-core, the text filter drops the rest', async () => {
  fake(() => answer('Here you go:\n```json\n' + JSON.stringify({ passages: [
    { title: 'Inside a volcano', text: X1 },
    { title: 'Volcano scientists', text: X2 },
    { title: 'Bad one', text: `${X1} This part is shit.` },
    { title: 'Phone', text: `${X2} Call 07700 900123 after school.` },
  ] }) + '\n```'));
  const r = await draft(teacher, { topic: 'How volcanoes work', grade: 4, length: 'short', n: 4, types: ['sp-common', 'pc-end', 'pc-start', 'us-there'], count: 3, seed: 5 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.ai, true); assert.equal(r.json.passages.length, 2); assert.equal(r.json.dropped, 2);
  // one call, the plain-JSON prompt (no strict schema), the builder model, low effort, the topic inside its tags
  assert.equal(calls.length, 1);
  const p = calls[0].params;
  assert.equal(p.model, config.builderModel); assert.equal(p.output_config.effort, 'low'); assert.equal(p.output_config.format, undefined);
  assert.equal(calls[0].opts.maxRetries, 0);
  assert.match(p.messages[0].content, /<topic>How volcanoes work<\/topic>/);
  assert.match(p.messages[0].content, /do NOT put any mistakes in/);
  for (const [i, x] of [X1, X2].entries()) {
    const got = r.json.passages[i];
    assert.equal(got.x, x, 'the passage is kept exactly as written');
    assert.ok(got.m.length >= 1 && got.m.length <= 3);
    assert.equal(P.problem(got.x, got.m), '', 'a set the cleaner accepts');
    assert.ok(got.m.every(m => ['sp-common', 'pc-end', 'pc-start', 'us-there'].includes(m.k)), 'only the chosen kinds');
    // the key: fixing every planted mistake gives back the AI's own clean text
    const edits = P.key(got.x, got.m).map(k => ({ a: k.a, b: k.b, s: k.right }));
    assert.equal(P.check(got.x, got.m, edits).found.length, got.m.length);
    assert.equal(P.applyEdits(got.x, got.m, edits), got.x);
  }
  // the set saves as it came back
  const items = r.json.passages.map(x => ({ t: x.t, x: x.x, g: 4, m: x.m }));
  assert.ok(G.cleanProofItems(items));
});

test('passages: a failure, a timeout or bad JSON falls back calmly with its reason and one warn line without the topic', async () => {
  fake(() => { throw Object.assign(new Error('Request timed out.'), { name: 'APIConnectionTimeoutError' }); });
  let r = await draft(teacher, { topic: 'Secret topic about owls', grade: 3, n: 2 });
  assert.equal(r.status, 200); assert.equal(r.json.ai, false); assert.equal(r.json.reason, 'timeout'); assert.deepEqual(r.json.passages, []);
  assert.equal(logs.length, 1); assert.equal(logs[0].line.kind, 'timeout');
  assert.doesNotMatch(JSON.stringify(logs), /owls|Secret/i, 'never the teacher\'s words');
  fake(() => answer('not json at all'));
  r = await draft(teacher, { topic: 'Owls', grade: 3 });
  assert.equal(r.json.ai, false); assert.equal(r.json.reason, 'error');
  fake(() => { throw Object.assign(new Error('overloaded'), { status: 529 }); });
  r = await draft(teacher, { topic: 'Owls', grade: 3 });
  assert.equal(r.json.reason, 'busy');
  fake(() => answer({ passages: [{ title: 'x', text: 'Too short.' }] }));
  r = await draft(teacher, { topic: 'Owls', grade: 3 });
  assert.equal(r.json.ai, false); assert.equal(r.json.reason, 'filtered');
  // no model at all (no key, the budget resting): 'resting', and the day's count is not spent
  A.hooks.create = null; config.proofAiFreePerDay = 1; RL._reset(); const key = config.anthropicKey; config.anthropicKey = '';
  r = await draft(teacher, { topic: 'Owls', grade: 3 });
  assert.equal(r.json.ai, false); assert.equal(r.json.reason, 'resting'); assert.equal(r.json.left, 1);
  config.anthropicKey = key;
});

test('a topic or a passage that names one of the teacher\'s students is refused before the AI; rude topics too', async () => {
  fake(() => answer({ passages: [] }));
  for (const topic of ['A story about Mia at the zoo', 'mia pupil goes camping', 'Leo and the volcano']) {
    const r = await draft(teacher, { topic });
    assert.equal(r.status, 400, topic); assert.equal(r.json.code, 'names');
  }
  assert.equal((await draft(teacher, { topic: 'shit volcanoes' })).json.code, 'words');
  assert.equal((await draft(teacher, { topic: 'x' })).json.code, 'topic');
  const s = await scan(teacher, { text: `${X1} Then Mia went home.` });
  assert.equal(s.json.code, 'names');
  assert.equal(calls.length, 0, 'the AI was never asked');
  // another teacher's student is not one of this teacher's: no refusal (Zed is Tom's)
  fake(() => answer({ passages: [{ title: 'Zed', text: X1 }] }));
  assert.equal((await draft(teacher, { topic: 'A zebra called Zed' })).status, 200);
});

test('check my passage: flags that point at the text, for the teacher to accept or ignore; nothing is changed', async () => {
  const text = 'Last weekend we went to the libary. There was alot of books about space. We read until it was dark outside.';
  fake(() => answer({ flags: [
    { text: 'libary.', fix: 'library.', why: 'Library has an r after the b.' },
    { text: 'alot', fix: 'a lot', why: '"A lot" is two words.' },
    { text: 'There was', fix: 'There were', why: 'Books is more than one.' },
    { text: 'not in the text', fix: 'x', why: 'nope' },
    { text: 'We', fix: 'Shit', why: 'rude' },
  ] }));
  const r = await scan(teacher, { text });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.ai, true);
  assert.deepEqual(r.json.flags.map(f => [f.was, f.fix]), [['libary.', 'library.'], ['There was', 'There were'], ['alot', 'a lot']]);
  for (const f of r.json.flags) assert.equal(text.substr(f.at, f.len), f.was, 'each flag points at its words');
  assert.equal(r.json.flags[0].why, 'Library has an r after the b.');
  assert.doesNotMatch(JSON.stringify(r.json), /text":/, 'the answer carries flags, never a changed text');
  assert.match(calls[0].params.messages[0].content, /<passage>\nLast weekend/);
  fake(() => { throw new Error('boom'); });
  const f = await scan(teacher, { text });
  assert.equal(f.json.ai, false); assert.equal(f.json.reason, 'error'); assert.deepEqual(f.json.flags, []);
});

test('why lines: one call for every mistake, kept through the filter, stored with the set and editable before saving', async () => {
  const m = P.plant(X1, { types: ['sp-common', 'pc-end', 'pc-start'], n: 3, seed: 4 });
  fake(p => { const n = (p.messages[0].content.match(/Students see:/g) || []).length; return answer({ lines: Array.from({ length: n }, (_, i) => (i === 1 ? 'This is shit.' : `Line ${i + 1}: a kind reason.`)) }); });
  const r = await why(teacher, { grade: 4, items: m.map(x => ({ x: X1, ...x })) });
  assert.equal(r.status, 200, r.text); assert.equal(calls.length, 1, 'one batch');
  assert.deepEqual(r.json.lines, ['Line 1: a kind reason.', '', 'Line 3: a kind reason.']);
  assert.match(calls[0].params.messages[0].content, /<mistakes>/);
  // the teacher edits the second (empty) one and saves: stored as the set's why lines, the AI's marked ai: 1
  const items = [{ t: 'Volcano', x: X1, g: 4, m: m.map((x, i) => ({ ...x, ...(i === 0 ? { y: r.json.lines[0], ai: 1 } : i === 1 ? { y: 'My own line.' } : { y: 'Line 3, edited by me.', ai: 1 }) })) }];
  const saved = await call(`/api/games/${MH.id}/sets`, { method: 'POST', body: { items }, user: teacher });
  assert.equal(saved.status, 200, saved.text);
  const got = G.get(MH.id, saved.json.id).items[0].m;
  assert.deepEqual(got.map(x => [x.y, x.ai || 0]), [['Line 1: a kind reason.', 1], ['My own line.', 0], ['Line 3, edited by me.', 1]]);
  assert.equal(G.cleanProofItems([{ ...items[0], m: [{ ...items[0].m[0], ai: true }] }]), null, 'ai is 1 or absent');
  // the AI failing: no lines, the page keeps the fixed line a kind
  fake(() => { throw new Error('x'); });
  const f = await why(teacher, { grade: 4, items: m.map(x => ({ x: X1, ...x })) });
  assert.equal(f.json.ai, false); assert.deepEqual(f.json.lines, []);
  assert.equal((await why(teacher, { grade: 4, items: [{ x: X1, a: 0, b: 1, w: 'A', k: 'sp-common' }] })).json.code, 'bad', 'a mistake that is not one');
});

test('the daily cap: free teachers get a few AI requests a day, Teacher plan holders none; the cap says so calmly', async () => {
  TOOLS.plansOn(); TOOLS.givePlan(teacher2.id);
  config.proofAiFreePerDay = 3;
  fake(() => answer({ passages: [{ title: 'Owls', text: X1 }] }));
  const left = [];
  for (let i = 0; i < 3; i++) { const r = await (i === 2 ? scan(teacher, { text: X1 }) : draft(teacher, { topic: 'Owls' })); assert.equal(r.status, 200); left.push(r.json.left); }
  assert.deepEqual(left, [2, 1, 0], 'passages and checks share the day\'s count');
  const capped = await draft(teacher, { topic: 'Owls' });
  assert.equal(capped.status, 429); assert.equal(capped.json.code, 'cap'); assert.equal(capped.json.left, 0);
  assert.equal((await scan(teacher, { text: X1 })).json.code, 'cap');
  assert.equal(calls.length, 3, 'the capped requests never reached the AI');
  // a refused topic does not spend one; a Teacher plan holder has no cap
  for (let i = 0; i < 6; i++) { const r = await draft(teacher2, { topic: 'Owls' }); assert.equal(r.status, 200); assert.equal(r.json.left, null); }
  assert.equal(A.aiAccess(teacher2), 'plan'); assert.equal(A.aiAccess(teacher), 'free');
  // why lines are part of saving: not capped
  const m = P.plant(X1, { types: ['pc-end'], n: 1, seed: 1 });
  fake(() => answer({ lines: ['A line.'] }));
  assert.equal((await why(teacher, { grade: 4, items: [{ x: X1, ...m[0] }] })).status, 200);
  // the frame tells the page: left today and whether plans are on (for the trial link)
  const init = await frameInit(teacher);
  assert.deepEqual(init.proofAi, { access: 'free', left: 0, plans: true });
  assert.deepEqual((await frameInit(teacher2)).proofAi, { access: 'plan', left: null, plans: true });
  TOOLS.plansOn(false);
});

test('students, kids, family grown-ups and guests never: 403, and the frame offers nothing', async () => {
  fake(() => answer({ passages: [{ title: 'Owls', text: X1 }] }));
  // (a family grown-up is stopped earlier by the grown-up fence: the same 404 as any school-only call)
  for (const u of [mia, kid, mum]) {
    const no = u === mum ? 404 : 403;
    assert.equal((await draft(u, { topic: 'Owls' })).status, no, u.username);
    assert.equal((await scan(u, { text: X1 })).status, no);
    assert.equal((await why(u, { grade: 4, items: [] })).status, no);
    assert.equal((await frameInit(u)).proofAi, undefined);
  }
  assert.equal((await draft(null, { topic: 'Owls' })).status, 401);
  assert.equal(calls.length, 0);
  assert.equal(A.aiAccess({ id: 'g', is_guest: 1 }), null);
  // only Mistake Hunt has these routes
  const other = publish(official, '<!doctype html><title>t</title>', { source: 'seed', slug: 'crossword-x', title: 'X' });
  assert.equal((await call(`/api/games/${other.id}/proof/draft`, { method: 'POST', body: { topic: 'Owls' }, user: teacher })).status, 404);
});

test('the SDK and the play page carry the AI tools and the graded step; the play page checks the messages', async () => {
  const fs = await import('node:fs');
  const sdk = fs.readFileSync(new URL('../../public/sdk/brb-sdk.js', import.meta.url), 'utf8');
  const play = fs.readFileSync(new URL('../../public/js/play.js', import.meta.url), 'utf8');
  for (const k of ['proofAsk: proofAsk', 'proofSave: proofSave', 'openTrial:', "'brb:proofai'", "'brb:proof'"]) assert.ok(sdk.includes(k), k);
  for (const k of ["'brb:proofai': m =>", "'brb:proof': m =>", "'brb:trial': m =>", "case 'brb:trial': if (tappedJustNow("]) assert.ok(play.includes(k), k);
});

async function frameInit(user) {
  const page = await call('/play/mistake-hunt', { user });
  assert.equal(page.status, 200);
  const frame = await call(/data-src="(\/frame\/[^"]+?)"/.exec(page.text)[1].replace(/&amp;/g, '&'), { user });
  return JSON.parse(/window\.__BRB_INIT__=(\{.*?\});<\/script>/.exec(frame.text)[1]);
}
