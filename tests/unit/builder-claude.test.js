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
    const blocks = script.shift() || [{ type: 'text', text: 'Done.' }];
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const ev = (name, data) => res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0, cache_read_input_tokens: 50 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') { ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } }); for (const part of blk.text.match(/.{1,8}/gs)) ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } }); }
      else { ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${requests.length}`, name: blk.name, input: {} } }); const j = JSON.stringify(blk.input); for (let k = 0; k < j.length; k += 500) ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: j.slice(k, k + 500) } }); }
      ev('content_block_stop', { index: i });
    });
    ev('message_delta', { delta: { stop_reason: blocks.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null }, usage: { output_tokens: 42 } });
    ev('message_stop', {}); res.end();
  });
});
await new Promise(r => fake.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());

const { config } = await import('../../server/config.js');
config.anthropicKey = 'sk-ant-test-fake';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn, providerName } = await import('../../server/builder/agent.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { reviewVersion } = await import('../../server/services/review.js');
const { SYSTEM_PROMPT } = await import('../../server/builder/prompt.js');

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

test('the model classifier can refuse what the word rules miss', async () => {
  const u = auth.createUser({ username: 'ClaudeKid2', password: 'secret1' }); const g = games.createGame(u.id, {});
  const before = requests.filter(x => x.body.stream).length;
  const events = []; const r = await runTurn({ user: u, gameId: g.id, text: 'the castle from that famous princess movie', emit: (n, d) => events.push([n, d]) });
  assert.equal(r.refused, 'copyright'); assert.equal(requests.filter(x => x.body.stream).length, before, 'the Builder model never saw it');
});

test('model review returns a structured verdict; flagged versions still go to a human', async () => {
  const r = await reviewVersion({ title: 'Fox', description: '', tags: '', category: 'arcade' }, { html: GAME, safety_status: 'pass', safety_report: '{}' });
  assert.equal(r.verdict, 'needs_changes'); assert.match(r.reasons[0], /hero/); assert.equal(r.by, config.builderModel);
  const call = requests.at(-1).body; assert.equal(call.output_config.format.type, 'json_schema'); assert.match(call.messages[0].content, /<game>[\s\S]*Fox Hop/);
  const f = await reviewVersion({ title: 'Fox' }, { html: GAME, safety_status: 'flag', safety_report: '{}' });
  assert.equal(f.verdict, 'unavailable');
});
