// Web search in the Builder (server/builder/search.js + the agent loop in claude.js) against a local fake Messages API:
// the tool's parameters and kill switch, the same tool in every round, "search" step rows with no query or links,
// no links in the chat, query and result screening, the admin log (no user), the per-build cap, pause_turn, a mixed
// turn (only tool results in the next user turn), the fallback echo rule, cost, and the API refusing the tool.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BUILDER_WEB_SEARCH = '1';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-search-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = []; const script = [];
const fake = http.createServer((req, res) => {
  let body = ''; req.on('data', c => (body += c)); req.on('end', () => {
    const b = JSON.parse(body || '{}'); requests.push({ url: req.url, headers: req.headers, body: b });
    const sys = JSON.stringify(b.system || ''); const msgs = JSON.stringify(b.messages || '');
    if (!b.stream) {
      const text = sys.includes('You check web search results')
        ? JSON.stringify(/casino|slots/i.test(msgs) ? { verdict: 'refuse', category: 'gambling' } : { verdict: 'allow', category: 'none' })
        : sys.includes('You review games') ? '{"verdict":"approve","reasons":[]}'
          : sys.includes('You check pictures') ? '{"verdict":"allow","reason":"a drawing"}' : JSON.stringify({ verdict: 'allow', category: 'none' });
      res.setHeader('content-type', 'application/json');
      return res.end(JSON.stringify({ id: 'msg_x', type: 'message', role: 'assistant', model: b.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }));
    }
    // An entry: a list of blocks, or { blocks, stop, searches (usage.server_tool_use.web_search_requests) }, or a
    // { status, error } reply. Blocks: text (with optional cites), tool_use, server_tool_use { id, query },
    // search_result { id, results: [{ url, title }] }, thinking, fallback.
    const entry = script.shift() || [{ type: 'text', text: 'Done.' }];
    if (entry.status) { res.writeHead(entry.status, { 'content-type': 'application/json' }); return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: entry.error } })); }
    const blocks = Array.isArray(entry) ? entry : entry.blocks;
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    const out = [];
    const ev = (name, data) => out.push(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...data })}\n\n`);
    ev('message_start', { message: { id: 'msg_s', type: 'message', role: 'assistant', model: b.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 100, output_tokens: 0 } } });
    blocks.forEach((blk, i) => {
      if (blk.type === 'text') {
        ev('content_block_start', { index: i, content_block: { type: 'text', text: '' } });
        for (const part of blk.text.match(/.{1,6}/gs)) ev('content_block_delta', { index: i, delta: { type: 'text_delta', text: part } });
        for (const c of blk.cites || []) ev('content_block_delta', { index: i, delta: { type: 'citations_delta', citation: { type: 'web_search_result_location', url: c.url, title: c.title, encrypted_index: 'x', cited_text: c.text } } });
      } else if (blk.type === 'thinking') { ev('content_block_start', { index: i, content_block: { type: 'thinking', thinking: '', signature: '' } }); ev('content_block_delta', { index: i, delta: { type: 'signature_delta', signature: 'sig' } }); }
      else if (blk.type === 'fallback') ev('content_block_start', { index: i, content_block: { type: 'fallback' } });
      else if (blk.type === 'server_tool_use') {
        ev('content_block_start', { index: i, content_block: { type: 'server_tool_use', id: blk.id, name: 'web_search', input: {} } });
        ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify({ query: blk.query }) } });
      } else if (blk.type === 'search_result') {
        ev('content_block_start', { index: i, content_block: { type: 'web_search_tool_result', tool_use_id: blk.id, content: blk.results.map(r => ({ type: 'web_search_result', url: r.url, title: r.title, page_age: null, encrypted_content: 'enc' })) } });
      } else {
        ev('content_block_start', { index: i, content_block: { type: 'tool_use', id: `tu_${i}_${requests.length}`, name: blk.name, input: {} } });
        ev('content_block_delta', { index: i, delta: { type: 'input_json_delta', partial_json: JSON.stringify(blk.input) } });
      }
      ev('content_block_stop', { index: i });
    });
    const searches = entry.searches || 0;
    ev('message_delta', { delta: { stop_reason: entry.stop || (blocks.some(x => x.type === 'tool_use') ? 'tool_use' : 'end_turn'), stop_sequence: null }, usage: { output_tokens: 42, ...(searches ? { server_tool_use: { web_search_requests: searches } } : {}) } });
    ev('message_stop', {});
    res.end(out.join(''));
  });
});
await new Promise(r => fake.listen(0, r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
test.after(() => fake.close());

const { config } = await import('../../server/config.js');
config.anthropicKey = 'sk-ant-test-fake';
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const search = await import('../../server/builder/search.js');
const { echoable, openServerTool } = await import('../../server/builder/claude.js');
const { TOOLS, SYSTEM_PROMPT } = await import('../../server/builder/prompt.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const runner = await import('../../server/builder/runner.js');
const { q } = await import('../../server/db.js');

const GAME = '<title>Cheetah Dash</title><style>body{margin:0}</style><canvas id="c"></canvas><script>const CONFIG = { speed: 1 }; BRB.sfx.play("jump");</script>';
const WRITE = { type: 'tool_use', name: 'write_game', input: { notes: 'A fast cheetah', html: GAME } };
const streamed = () => requests.filter(x => x.body.stream);
let n = 0;
async function turn(text, rounds, { onEvent = null } = {}) {
  const u = auth.createUser({ username: `SearchKid${++n}`, password: 'secret1' }); const g = games.createGame(u.id, {});
  script.push(...rounds);
  const before = streamed().length; const events = [];
  const r = await runTurn({ user: u, gameId: g.id, text, emit: (nm, d) => { events.push([nm, d]); if (onEvent) onEvent(nm, d, g, u); } });
  assert.equal(script.length, 0, 'every scripted round was used');
  const said = events.filter(e => e[0] === 'text').map(e => e[1].text).join('');
  return { r, events, said, calls: streamed().slice(before).map(c => c.body), g, u, rows: events.filter(e => e[0] === 'step').map(e => e[1]) };
}
const logRows = gameId => q.all('SELECT * FROM builder_searches WHERE game_id=? ORDER BY created_at', gameId);

test('tool parameters: direct calls only, a per-request cap, blocked sites, never a user location; the list is well-formed', () => {
  const tool = search.WEB_SEARCH_TOOL;
  assert.equal(tool.name, 'web_search'); assert.match(tool.type, /^web_search_\d{8}$/);
  assert.deepEqual(tool.allowed_callers, ['direct'], 'no code execution: plain pairs, eligible for zero data retention');
  assert.equal(tool.max_uses, search.MAX_USES); assert.ok(search.MAX_USES <= search.SEARCHES_PER_BUILD);
  assert.equal(tool.user_location, undefined); assert.equal(tool.allowed_domains, undefined, 'blocked and allowed lists cannot both be sent');
  assert.equal(tool.eager_input_streaming, undefined);
  const list = tool.blocked_domains;
  assert.ok(list.length >= 100 && list.length <= 150, `${list.length} entries`);
  assert.equal(new Set(list).size, list.length, 'no duplicates');
  for (const d of list) assert.match(d, /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?\.[a-z0-9]{2,}(\/[a-z0-9/_-]*)?$/, d);   // ASCII, no scheme, no *.
  for (const d of ['youtube.com', 'reddit.com', 'pornhub.com', 'bet365.com', 'discord.com', 'character.ai']) assert.ok(list.includes(d), d);
  for (const d of ['wikipedia.org', 'nasa.gov', 'britannica.com', 'kids.nationalgeographic.com']) assert.ok(!search.isBlocked(d), d);
  assert.ok(search.isBlocked('m.youtube.com') && search.isBlocked('old.reddit.com') && !search.isBlocked('notreddit.com'));
  assert.ok(Object.isFrozen(tool) && Object.isFrozen(list));
});

test('kill switch: off -> the tools and system prompt are exactly as before; on -> the tool is added once, unchanged in every round', async () => {
  config.builderWebSearch = false;
  assert.equal(search.toolsFor(TOOLS), TOOLS);
  const offRun = await turn('a cheetah game', [[WRITE], [{ type: 'text', text: 'Done!' }]]);
  for (const c of offRun.calls) {
    assert.ok(!c.tools.some(t => t.type && String(t.type).startsWith('web_search')), 'no web search tool');
    assert.ok(!JSON.stringify(c.system).includes('Looking things up on the web'));
    assert.equal(c.system[0].text, SYSTEM_PROMPT);
  }
  config.builderWebSearch = true;
  const onRun = await turn('a cheetah game', [[WRITE], [{ type: 'text', text: 'Done!' }]]);
  for (const c of onRun.calls) {
    assert.deepEqual(c.tools.at(-1), JSON.parse(JSON.stringify(search.WEB_SEARCH_TOOL)));
    assert.equal(c.tools.length, TOOLS.length + 1);
    assert.equal(c.system[0].text, SYSTEM_PROMPT); assert.equal(c.system[1].text, search.SEARCH_RULES);
    assert.equal(c.system[1].cache_control, undefined, 'cached with the block after it (no extra cache point)');
  }
  assert.equal(JSON.stringify(onRun.calls[0].tools), JSON.stringify(onRun.calls[1].tools), 'byte-identical in every round');
  assert.match(search.SEARCH_RULES, /Never search for people the builder knows/);
  assert.match(search.SEARCH_RULES, /Never copy text, links/);
});

test('a search: a "search" row with no query, chat text without links, the admin log without the user, the search paid for', async () => {
  const spent0 = aiBudget.status().today;
  const r = await turn('a game about how fast cheetahs run', [
    { blocks: [
      { type: 'text', text: 'Let me check one fact. ' },
      { type: 'server_tool_use', id: 'srvtoolu_1', query: 'cheetah top speed' },
      { type: 'search_result', id: 'srvtoolu_1', results: [{ url: 'https://en.wikipedia.org/wiki/Cheetah', title: 'Cheetah - Wikipedia' }, { url: 'https://www.nationalgeographic.com/animals/cheetah', title: 'Cheetah facts' }] },
      { type: 'text', text: 'Cheetahs can run about 110 km/h (see https://en.wikipedia.org/wiki/Cheetah or nationalgeographic.com). ', cites: [{ url: 'https://en.wikipedia.org/wiki/Cheetah', title: 'Cheetah', text: 'The cheetah is capable of running at 93 to 104 km/h' }] },
      WRITE,
    ], searches: 1 },
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(r.r.ok, true, JSON.stringify(r.events.filter(e => e[0] === 'error')));
  const row = r.rows.find(x => x.key === 'search');
  assert.ok(row, 'a search row');
  assert.ok(Object.keys(row).every(k => ['at', 'i', 'key'].includes(k)), `no query, sites or links on the row: ${JSON.stringify(row)}`);
  assert.match(r.said, /Let me check one fact\./);
  assert.match(r.said, /Cheetahs can run about 110 km\/h/);
  assert.doesNotMatch(r.said, /wikipedia|https?:|nationalgeographic|www\./i, 'no links or site names in the chat');
  assert.doesNotMatch(JSON.stringify(r.events), /cheetah top speed/, 'the query is never sent to the page');
  const logged = logRows(r.g.id);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].query, 'cheetah top speed');
  assert.deepEqual(JSON.parse(logged[0].domains), ['en.wikipedia.org', 'nationalgeographic.com']);
  assert.equal(logged[0].flagged, 0); assert.equal(logged[0].results, 2); assert.ok(logged[0].turn_id);
  assert.ok(!Object.keys(logged[0]).some(k => /user|name/.test(k)), 'no user column');
  assert.doesNotMatch(JSON.stringify(logged), new RegExp(r.u.username));
  // The finished-round check ran on the queries, titles and cited quotes (the web content classifier).
  const check = requests.filter(x => !x.body.stream && /You check web search results/.test(JSON.stringify(x.body.system))).at(-1);
  assert.ok(check); assert.match(JSON.stringify(check.body.messages), /cheetah top speed[\s\S]*Cheetah - Wikipedia[\s\S]*93 to 104/);
  // The round's assistant content goes back unchanged (search blocks included).
  const sent = r.calls[1].messages.at(-2).content.map(b => b.type);
  assert.deepEqual(sent.filter(t => t !== 'text'), ['server_tool_use', 'web_search_tool_result', 'tool_use']);
  assert.ok(aiBudget.status().today - spent0 >= 0.01, 'the search itself is paid ($0.01)');
  assert.equal(aiBudget.costOf('claude-sonnet-5-5', { server_tool_use: { web_search_requests: 3 } }), 0.03);
});

test('a bad query stops the round at once: logged as flagged (personal details redacted), asked again with a note, nothing from it shown', async () => {
  const r = await turn('a game about my friend', [
    { blocks: [{ type: 'text', text: 'Looking. ' }, { type: 'server_tool_use', id: 'srvtoolu_b', query: 'Jake Smith 555-123-4567 home address' }, { type: 'search_result', id: 'srvtoolu_b', results: [{ url: 'https://example.com/x', title: 'X' }] }, { type: 'text', text: 'SECRET FOUND TEXT' }], searches: 1 },
    [WRITE],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(r.r.ok, true);
  assert.doesNotMatch(r.said, /SECRET FOUND TEXT/);
  const logged = logRows(r.g.id);
  assert.equal(logged.length, 1); assert.equal(logged[0].flagged, 1); assert.equal(logged[0].reason, 'personal');
  assert.equal(logged[0].query, '[redacted]', 'personal details never stored');
  const retry = r.calls[1];
  assert.equal(retry.messages.at(-1).role, 'user');
  assert.match(JSON.stringify(retry.messages.at(-1).content), /that web search was not allowed/);
  assert.ok(!JSON.stringify(retry.messages).includes('srvtoolu_b'), 'nothing from the stopped round was kept');
});

test('a query the word rules refuse (gambling) is stopped too; after too many the build ends kindly', async () => {
  assert.equal(search.screenQuery('best online casino bonus'), 'gambling');
  assert.equal(search.screenQuery('how fast is a cheetah'), null);
  assert.equal(search.screenQuery('how far is the moon site:nasa.gov'), null, 'a site name in a query is fine');
  const bad = id => ({ blocks: [{ type: 'server_tool_use', id, query: 'casino slots jackpot' }], searches: 1 });
  const r = await turn('a fruit game', [bad('s1'), bad('s2'), bad('s3')]);
  assert.match(r.said, /couldn't look that up/);
  assert.equal(logRows(r.g.id).filter(x => x.flagged).length, 3);
});

test('unsuitable results: the round\'s text after the search is dropped, the log is flagged, the next turn says not to use it', async () => {
  const r = await turn('a racing game', [
    { blocks: [
      { type: 'server_tool_use', id: 'srvtoolu_u', query: 'fast race cars' },
      { type: 'search_result', id: 'srvtoolu_u', results: [{ url: 'https://cars.example.org/a', title: 'Best online casino slots and race betting' }] },
      { type: 'text', text: 'TEXT FROM BAD RESULTS' }, WRITE,
    ], searches: 1 },
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.doesNotMatch(r.said, /TEXT FROM BAD RESULTS/);
  const logged = logRows(r.g.id);
  assert.equal(logged[0].flagged, 1); assert.equal(logged[0].reason, 'gambling');
  const next = r.calls[1].messages.at(-1).content;
  assert.equal(next[0].type, 'tool_result');
  assert.equal(next[0].is_error, true); assert.match(next[0].content, /^Not run/);
  assert.equal(games.listVersions(r.g.id).length, 0, 'nothing made from unsuitable results is saved');
  assert.ok(!r.events.some(e => e[0] === 'version'));
  assert.match(JSON.stringify(next), /not suitable for a children's game/);
  // A blocked site should never come back; if it does, the round is flagged as well.
  assert.equal(await search.screenFound({ domains: ['www.youtube.com'.replace(/^www\./, '')] }), 'other');
});

test('the per-build cap: once reached, the next user turn says no more searches (the tool itself stays); far past it the build ends', async () => {
  const s = (id, q2) => [{ type: 'server_tool_use', id, query: q2 }, { type: 'search_result', id, results: [{ url: 'https://en.wikipedia.org/wiki/Moon', title: 'Moon' }] }];
  const r = await turn('a space game', [
    { blocks: [...s('a1', 'moon distance'), ...s('a2', 'moon gravity'), ...s('a3', 'moon craters'), WRITE], searches: search.SEARCHES_PER_BUILD },
    { blocks: [{ type: 'text', text: 'Done!' }] },
  ]);
  const note = r.calls[1].messages.at(-1).content;
  assert.equal(note[0].type, 'tool_result');
  assert.match(JSON.stringify(note), /that was the last web search for this build/);
  assert.deepEqual(r.calls[1].tools, r.calls[0].tools, 'the tool list never changes');
  const r2 = await turn('a planets game', [
    { blocks: [...s('b1', 'mars'), WRITE], searches: search.SEARCHES_PER_BUILD + search.SEARCH_BACKSTOP + 1 },
  ]);
  assert.equal(r2.calls.length, 1, 'no more model calls');
  assert.equal(games.listVersions(r2.g.id).length, 1, 'the round\'s own write still ran');
  // Far past it with no tool call: the build ends with a kind word, never silently.
  const r3 = await turn('a stars game', [{ blocks: [...s('c1', 'stars'), { type: 'text', text: 'Stars shine.' }], searches: search.SEARCHES_PER_BUILD + search.SEARCH_BACKSTOP + 1 }]);
  assert.match(r3.said, /couldn't look that up/);
});

test('pause_turn: the paused answer goes back as it is, with no new user message, and the build carries on', async () => {
  const r = await turn('a whale game', [
    { blocks: [{ type: 'server_tool_use', id: 'p1', query: 'blue whale length' }, { type: 'search_result', id: 'p1', results: [{ url: 'https://en.wikipedia.org/wiki/Blue_whale', title: 'Blue whale' }] }], stop: 'pause_turn', searches: 1 },
    [{ type: 'text', text: 'Blue whales are huge! ' }, WRITE],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(r.r.ok, true);
  assert.equal(r.calls.length, 3);
  const second = r.calls[1].messages;
  assert.equal(second.at(-1).role, 'assistant', 'the request ends with the paused answer');
  assert.deepEqual(second.at(-1).content.map(b => b.type), ['server_tool_use', 'web_search_tool_result']);
  assert.deepEqual(second.slice(0, -1), r.calls[0].messages, 'nothing else changed');
  assert.match(r.said, /Blue whales are huge!/);
});

test('a mixed turn (a search still running beside our tool): the next user turn holds only tool results; a new message waits one round', async () => {
  let added = false;
  const r = await turn('an ocean game', [
    { blocks: [{ type: 'server_tool_use', id: 'm1', query: 'octopus arms' }, WRITE] },
    [{ type: 'text', text: 'Octopuses have eight arms. ' }, { type: 'tool_use', name: 'edit_game', input: { notes: 'Eight arms', edits: [{ find: 'speed: 1', replace: 'speed: 2' }] } }],
    [{ type: 'text', text: 'Done!' }],
  ], { onEvent: (nm, d, g, u) => { if (!added && nm === 'step' && d.key === 'write') { added = true; runner._acceptScreened(g.id, auth.getUser(u.id), 'make it purple'); } } });
  assert.equal(r.r.ok, true, JSON.stringify(r.events.filter(e => e[0] === 'error')));
  assert.ok(openServerTool(r.calls[1].messages.at(-2).content), 'the search was left running');
  assert.deepEqual(r.calls[1].messages.at(-1).content.map(b => b.type), ['tool_result'], 'only tool results');
  assert.doesNotMatch(JSON.stringify(r.calls[1].messages), /make it purple/);
  assert.match(JSON.stringify(r.calls[2].messages.at(-1).content), /make it purple/, 'the message comes the round after');
});

test('fallback echo rule: before the last fallback block, thinking, tool_use and unanswered server tool calls are dropped', () => {
  const content = [
    { type: 'thinking', thinking: '', signature: 's' }, { type: 'text', text: 'a' }, { type: 'tool_use', id: 't1', name: 'x', input: {} },
    { type: 'server_tool_use', id: 'open', name: 'web_search', input: { query: 'q' } },
    { type: 'server_tool_use', id: 'done', name: 'web_search', input: { query: 'q2' } }, { type: 'web_search_tool_result', tool_use_id: 'done', content: [] },
    { type: 'fallback' }, { type: 'thinking', thinking: '', signature: 's2' }, { type: 'tool_use', id: 't2', name: 'y', input: {} },
  ];
  assert.deepEqual(echoable(content).map(b => b.id || b.type), ['text', 'done', 'web_search_tool_result', 'fallback', 'thinking', 't2']);
  assert.equal(echoable(content.slice(0, 3)).length, 3, 'no fallback: unchanged');
  assert.deepEqual(echoable([{ type: 'text', text: 'x' }, { type: 'server_tool_use', id: 'cut', name: 'web_search', input: {} }], 'max_tokens').map(b => b.type), ['text'], 'a cut-off search call is dropped');
  assert.equal(openServerTool([{ type: 'server_tool_use', id: 'a' }]), true);
  assert.equal(openServerTool([{ type: 'server_tool_use', id: 'a' }, { type: 'web_search_tool_result', tool_use_id: 'a' }]), false);
});

test('links never reach the chat, even split across streamed pieces; ordinary words stay', () => {
  const f = search.linkFilter();
  const out = ['Look at htt', 'ps://example.com/a', 'bc and www.foo', '.org now. Cats are fast! e.g. 3.5 m'].map(x => f.push(x)).join('') + f.flush();
  assert.doesNotMatch(out, /example|foo\.org|https?/);
  assert.match(out, /Cats are fast! e\.g\. 3\.5 m/);
  assert.equal(search.stripLinks('Read wikipedia.org, then play'), 'Read, then play');
  assert.equal(search.domainOf('https://WWW.Example.COM/x'), 'example.com');
  assert.equal(search.domainOf('javascript:alert(1)'), '');
});

test('the API refuses the tool on the first request: search turns itself off and the round runs again without it', async () => {
  const r = await turn('a frog game', [
    { status: 400, error: 'tools.7.blocked_domains: invalid domain' },
    [WRITE], [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(r.r.ok, true);
  assert.ok(r.calls[0].tools.some(t => t.name === 'web_search'));
  assert.ok(!r.calls[1].tools.some(t => t.name === 'web_search'));
  assert.equal(search.webSearchOn(), false);
  search._reset();
  assert.equal(search.webSearchOn(), true);
});

test('admin list and retention: newest first, flagged filter, rows older than 90 days go', () => {
  const id = search.logSearch({ turnId: 't-old', gameId: null, query: 'call me at 0123 456789', domains: ['a.org'] });
  assert.equal(q.get('SELECT query FROM builder_searches WHERE id=?', id).query, '[redacted]');
  q.run('UPDATE builder_searches SET created_at=? WHERE id=?', Date.now() - 91 * 864e5, id);
  assert.ok(search.listSearches({ flagged: true }).every(x => x.flagged === 1));
  assert.ok(search.listSearches().length >= 3);
  assert.equal(search.forget(), 1);
  assert.equal(q.get('SELECT COUNT(*) AS n FROM builder_searches WHERE id=?', id).n, 0);
});

test('a search result that arrives in the NEXT response (mixed turn) is held, screened and logged with its real query', async () => {
  const r = await turn('a racing game', [
    { blocks: [{ type: 'server_tool_use', id: 'mx1', query: 'fast race cars' }, WRITE], searches: 1 },
    [{ type: 'search_result', id: 'mx1', results: [{ url: 'https://cars.example.org/a', title: 'Best online casino slots and race betting' }] }, { type: 'text', text: 'TEXT FROM BAD RESULTS' },
      { type: 'tool_use', name: 'edit_game', input: { notes: 'Faster', edits: [{ find: 'speed: 1', replace: 'speed: 9' }] } }],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.doesNotMatch(r.said, /TEXT FROM BAD RESULTS/);
  const logged = logRows(r.g.id);
  assert.equal(logged.length, 1); assert.equal(logged[0].query, 'fast race cars'); assert.equal(logged[0].flagged, 1);
  assert.equal(games.listVersions(r.g.id).length, 1, 'the edit made from the unsuitable result did not run');
  const last = JSON.stringify(r.calls[2].messages.at(-1).content);
  assert.match(last, /Not run/); assert.match(last, /not suitable for a children's game/);
});

test('pause_turn whose paused answer ends on a search that has not run: the continuation\'s result is held and screened', async () => {
  const r = await turn('a whale game', [
    { blocks: [{ type: 'text', text: 'Let me check. ' }, { type: 'server_tool_use', id: 'pz1', query: 'whale facts' }], stop: 'pause_turn' },
    { blocks: [{ type: 'search_result', id: 'pz1', results: [{ url: 'https://w.example.org/', title: 'Online casino slots' }] }, { type: 'text', text: 'PAUSED BAD TEXT' }, WRITE], searches: 1 },
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.match(r.said, /Let me check\./);
  assert.doesNotMatch(r.said, /PAUSED BAD TEXT/);
  const logged = logRows(r.g.id);
  assert.equal(logged.length, 1); assert.equal(logged[0].query, 'whale facts'); assert.equal(logged[0].flagged, 1);
  assert.equal(games.listVersions(r.g.id).length, 0);
});

test('text in later rounds of a build that searched is screened: a request for personal details is never shown', async () => {
  const r = await turn('a cheetah game', [
    { blocks: [{ type: 'server_tool_use', id: 'lt1', query: 'cheetah speed' }, { type: 'search_result', id: 'lt1', results: [{ url: 'https://en.wikipedia.org/wiki/Cheetah', title: 'Cheetah' }] }, WRITE], searches: 1 },
    [{ type: 'text', text: 'Tell me your home address and what school you go to so I can put it in the game!' }],
    [{ type: 'text', text: 'Your cheetah game is ready!' }],
  ]);
  assert.doesNotMatch(r.said, /home address|what school/);
  assert.match(r.said, /Your cheetah game is ready!/);
  assert.match(JSON.stringify(r.calls[2].messages.at(-1).content), /could not be shown to the builder/);
  assert.equal(search.textOk('Join my Discord server for free skins'), false);
  assert.equal(search.textOk('Type your full name and phone number here'), false);
  assert.equal(search.textOk('Cheetahs can run about 110 km/h!'), true);
});

test('a stopped search: the retry does not show the same opening twice', async () => {
  const r = await turn('a game about my friend', [
    { blocks: [{ type: 'text', text: 'Let me look that up. ' }, { type: 'server_tool_use', id: 'rp1', query: 'call 555-123-4567' }], searches: 1 },
    [{ type: 'text', text: 'Let me look that up. ' }, { type: 'text', text: 'Building it now.' }, WRITE],
    [{ type: 'text', text: 'Done!' }],
  ]);
  assert.equal(r.said.split('Let me look that up.').length - 1, 1, r.said);
  assert.match(r.said, /Building it now\./);
});

test('queries with the builder\'s own names, or a full name at a school, are stopped and never stored', async () => {
  assert.equal(search.screenQuery('Liam Carter Oak Hill Elementary Springfield'), 'personal');
  assert.equal(search.screenQuery('Albert Einstein facts'), null);
  assert.equal(search.screenQuery('emma_lee game', search.namesOf({ username: 'Emma_Lee', display_name: 'Emma' })), 'personal');
  assert.equal(search.screenQuery('emma lee house', search.namesOf({ username: 'Emma_Lee' })), 'personal');
  assert.equal(search.screenQuery('lemmings facts', search.namesOf({ username: 'Emma_Lee', display_name: 'Emma' })), null, 'whole words only');
  const id = search.logSearch({ query: 'zoomkid99 favourite games', names: ['zoomkid99'] });
  assert.equal(q.get('SELECT query FROM builder_searches WHERE id=?', id).query, '[redacted]');
  const id2 = search.logSearch({ query: 'some odd query' });
  search.flag([id2], 'personal');
  assert.equal(q.get('SELECT query FROM builder_searches WHERE id=?', id2).query, '[redacted]', 'redacted when the check says personal');
  // In a build: the builder's own username in a query stops the round, and the log never holds it.
  const me = `SearchKid${n + 1}`;
  const r = await turn('a game about me', [
    { blocks: [{ type: 'server_tool_use', id: 'nm1', query: `${me.toLowerCase()} favourite animal` }], searches: 1 },
    [WRITE], [{ type: 'text', text: 'Done!' }],
  ]);
  const logged = logRows(r.g.id);
  assert.equal(logged.length, 1); assert.equal(logged[0].reason, 'personal'); assert.equal(logged[0].query, '[redacted]');
  assert.match(JSON.stringify(r.calls[1].messages.at(-1).content), /that web search was not allowed/);
});

test('links are removed anywhere: markdown, quotes, brackets, CJK text, any TLD, zero-width tricks', () => {
  const cases = ['see [this page](https://pornhub.com/x) ok', 'go to "https://evil.com"', '<https://evil.com>', '«https://evil.com»',
    '詳しくはhttps://example.comを見てね。', '詳しくはexample.comを見てね', 'kids.nationalgeographic.ca', 'Example.Club', 'nasa.gov​.', 'www.Foo.org/a?b=1'];
  for (const c of cases) assert.doesNotMatch(search.stripLinks(c), /https?|evil|pornhub|example|nationalgeographic|nasa|foo\.org|\.club/i, c);
  assert.equal(search.stripLinks('see [this page](https://pornhub.com/x) ok'), 'see this page ok');
  assert.equal(search.stripLinks('詳しくはhttps://example.comを見てね。'), '詳しくはを見てね。');
  assert.equal(search.stripLinks('Cheetahs run 3.5 m, e.g. fast. dragon.png'), 'Cheetahs run 3.5 m, e.g. fast. dragon.png');
});

test('the found-content check fails closed: no model or a classifier error -> unchecked', async () => {
  assert.equal(await search.screenFound({ titles: ['Cheetah'] }, { model: false }), 'unchecked');
  assert.equal(await search.screenFound({}, { model: false }), null, 'nothing found, nothing to check');
});

test('ask_user questions and version notes never carry links or requests for personal details', async () => {
  const r = await turn('a cat game', [
    [{ type: 'tool_use', name: 'write_game', input: { notes: 'Cats from https://evil.example.com/x', html: GAME } }],
    [{ type: 'tool_use', name: 'ask_user', input: { question: 'What is your home address?', options: ['a'] } }],
    [{ type: 'tool_use', name: 'ask_user', input: { question: 'Do you like the cats on [this site](https://evil.com) best?', options: ['Yes', 'see evil.com'] } }],
  ]);
  const v = r.events.find(e => e[0] === 'version');
  assert.equal(v[1].notes, 'Cats from');
  const asks = r.events.filter(e => e[0] === 'ask');
  assert.equal(asks.length, 1, 'the personal question was refused');
  assert.equal(asks[0][1].question, 'Do you like the cats on this site best?');
  assert.deepEqual(asks[0][1].options, ['Yes', 'see']);
  assert.match(JSON.stringify(r.calls[2].messages.at(-1).content), /Never ask for personal details/);
});
