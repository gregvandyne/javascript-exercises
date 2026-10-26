// The Builder runner (server/builder/runner.js): builds run apart from any request, are saved as they go, end exactly
// once, stop on the time cap, a delete, a ban or the Builder turned off, and are handed off at shutdown and carried on
// (once) at the next boot. A "gate" provider lets each test hold a build at a known point.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_MOCK_DELAY_MS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-runner-test-' + process.pid;
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, today } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const runner = await import('../../server/builder/runner.js');
const agent = await import('../../server/builder/agent.js');
const turns = await import('../../server/builder/turns.js');
const usage = await import('../../server/builder/usage.js');
const { loadChat, appendChat } = await import('../../server/builder/chat.js');
const { historyToMessages, mergeRoles } = await import('../../server/builder/claude.js');
const { tEn } = await import('../../server/i18n/index.js');

const FOX = 'Make a catch game about a fox. Just build it.';
const GAME = '<title>T</title><style>b{}</style><canvas></canvas><script>let s = 1; BRB.sfx.play("win")</script>';
const CAP = config.builderTurnMaxMs, SCREEN = agent.hooks.screen;
let n = 0;
const newUser = (extra = {}) => auth.createUser({ username: `Run_${String.fromCharCode(97 + (n++ % 26))}${n}`.slice(0, 16), password: 'secret1', ...extra });
const newGame = u => games.createGame(u.id, { title: 'Untitled' });
const row = id => turns.get(id);
const used = userId => usage.turnsUsed(userId);
const versions = gameId => games.listVersions(gameId).length;
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms = 4000, what = 'the condition') {
  const t0 = Date.now();
  while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`timed out waiting for ${what}`); await sleep(3); }
}
function deferred() { let resolve; const p = new Promise(r => { resolve = r; }); p.resolve = resolve; return p; }
const aborted = signal => new Promise(r => { if (signal.aborted) r(); else signal.addEventListener('abort', r, { once: true }); });

// The gate provider: what it does is set per test (gateImpl).
let gateImpl = async () => ({ model: 'gate' });
agent.registerProvider('gate', { run: ctx => gateImpl(ctx) });
/** A held build: a blocks row and some text (and a version when save), then it waits for open() or its stop
 *  (ignoreStop: it never notices the stop). after(ctx) runs once it goes on. */
function hold({ text = 'Working on it. ', save = false, ignoreStop = false, after = null } = {}) {
  const g = { open: deferred(), started: deferred(), ctx: null, late: null };
  gateImpl = async ctx => {
    g.ctx = ctx;
    ctx.steps.start('blocks');
    if (text) ctx.emit('text', { text });
    if (save) ctx.tools.exec('write_game', { html: GAME, notes: 'First version' });
    g.started.resolve();
    await (ignoreStop ? g.open : Promise.race([g.open, aborted(ctx.signal)]));
    if (after) await after(ctx, g);
    return { model: 'gate', tokensIn: 0, tokensOut: 0 };
  };
  return g;
}
/** Start a build through the runner (the gate unless provider says otherwise). */
const build = (u, g, text = FOX, extra = {}) => runner.submit({ user: auth.getUser(u.id), game: games.getGame(g.id), text, t: tEn, provider: 'gate', ...extra });
/** A live subscriber that records what it gets (compat: like the streamed POST). */
function watch(gameId, userId, { compat = false } = {}) {
  const ev = [];
  const w = { ev, closed: false, of: name => ev.filter(e => e[0] === name).map(e => e[1]), names: () => ev.map(e => e[0]) };
  w.sub = runner.attach(gameId, { userId, locale: 'en', compat, send: (name, d) => ev.push([name, d]), close: () => { w.closed = true; } });
  return w;
}
/** step + stepinfo events -> rows (without i). */
function rowsOf(events) {
  const rows = new Map();
  for (const [name, d] of events) {
    if (name === 'step') rows.set(d.i, { ...d });
    else if (name === 'stepinfo' && rows.has(d.i)) Object.assign(rows.get(d.i), d);
  }
  return [...rows.values()].map(({ i, ...r }) => { void i; return r; });
}
const textOf = events => events.filter(e => e[0] === 'text').map(e => e[1].text).join('');

afterEach(() => {
  runner._reset();
  q.run("UPDATE builder_turns SET status='failed', end_reason='error', ended_at=? WHERE status IN ('queued','running','interrupted')", Date.now());
  config.builderTurnMaxMs = CAP; agent.hooks.screen = SCREEN; process.env.BRB_MOCK_DELAY_MS = '0';
  gateImpl = async () => ({ model: 'gate' });
});

test('RUN-1 lifecycle: queued, then running (charged, attempt 1, blocks, no base version), then done/ok with one version', async () => {
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  let seen = null; const send = w.sub.send;
  w.sub.send = (name, d) => { send(name, d); if (name === 'step' && d.key === 'blocks' && !seen) seen = row(runner.jobFor(g.id).id); };
  const r = await runner.submit({ user: u, game: g, text: FOX, t: tEn });   // the simple building blocks
  assert.equal(r.status, 202); assert.deepEqual(r.body.turn, { id: r.job.id, status: 'queued' });
  assert.equal(row(r.job.id).status, 'queued'); assert.equal(row(r.job.id).charged_day, null);
  assert.equal(runner.isBusy(g.id), true); assert.equal(runner.busyCount(), 1);
  const res = await runner.idle(r.job);
  assert.equal(seen.status, 'running'); assert.equal(seen.charged_day, today()); assert.equal(seen.attempt, 1);
  assert.equal(seen.provider, 'blocks'); assert.equal(seen.base_version, null);
  const end = row(r.job.id);
  assert.equal(end.status, 'done'); assert.equal(end.end_reason, 'ok'); assert.equal(end.versions, 1); assert.ok(end.ended_at >= end.created_at);
  assert.equal(runner.isBusy(g.id), false); assert.equal(runner.busyCount(), 0);
  const done = w.of('done')[0];
  assert.equal(done.turnsLeft, usage.dailyTurns() - 1); assert.equal(done.end, 'ok'); assert.equal(done.steps.end, 'ok');
  assert.equal(res.ok, true); assert.equal(res.turnsLeft, usage.dailyTurns() - 1);
  assert.equal(w.of('turn').length, 1); assert.equal(w.of('turn')[0].id, r.job.id); assert.equal(w.of('turn')[0].mine, true);
  const msgs = loadChat(g.id).messages;
  assert.deepEqual(msgs.map(m => [m.role, m.turn]), [['user', r.job.id], ['assistant', r.job.id]]);
});

test('RUN-2 the message is saved when the build starts; while screening, the turn shows it from the request', async () => {
  const u = newUser(); const g = newGame(u);
  const gate = hold();
  const r = await build(u, g);
  await gate.started;
  assert.deepEqual(loadChat(g.id).messages.map(m => [m.role, m.text, m.turn]), [['user', FOX, r.job.id]], 'durable before the reply');
  const pt = runner.publicTurn(r.job, u);
  assert.equal(pt.entries[0].text, FOX); assert.equal(pt.provider, 'blocks'); assert.equal(pt.attempt, 1); assert.equal(pt.mine, true);
  assert.equal(runner.publicTurn(r.job, newUser()).mine, false);
  gate.open.resolve(); await runner.idle(r.job);

  const slow = deferred();
  agent.hooks.screen = async (text, o) => { await slow; return SCREEN(text, o); };
  const g2 = newGame(u); const gate2 = hold();
  const r2 = await build(u, g2, 'A robot runner game. Just build it.');
  await sleep(20);
  assert.equal(r2.job.phase, 'screening'); assert.equal(row(r2.job.id).status, 'queued');
  assert.deepEqual(loadChat(g2.id).messages, [], 'nothing is stored before screening passes');
  const pt2 = runner.publicTurn(r2.job, u);
  assert.equal(pt2.entries.length, 1); assert.equal(pt2.entries[0].role, 'user'); assert.equal(pt2.entries[0].text, 'A robot runner game. Just build it.');
  slow.resolve(); await gate2.started; gate2.open.resolve(); await runner.idle(r2.job);
});

test('RUN-3 replay equals live: a viewer who joins mid-build sees the same rows, facts and text', async () => {
  const u = newUser(); const g = newGame(u);
  const half = deferred(), go = deferred();
  gateImpl = async ctx => {
    ctx.steps.start('blocks'); ctx.emit('text', { text: 'Hello ' });
    const i = ctx.steps.start('write'); ctx.steps.info({ plan: 'A fox who hops' }, i); ctx.steps.info({ l: 4 }, i);
    ctx.emit('text', { text: 'world. ' });
    half.resolve(); await go;
    ctx.steps.info({ l: 12 }, i); ctx.emit('text', { text: 'More text.' });
    ctx.tools.exec('write_game', { html: GAME, notes: 'First version' });
    return { model: 'gate' };
  };
  const a = watch(g.id, u.id);
  const r = await build(u, g);
  await half;
  const b = watch(g.id, u.id);
  go.resolve(); await runner.idle(r.job);
  assert.deepEqual(b.names().slice(0, 1), ['hello']); assert.equal(b.of('hello')[0].turn.id, r.job.id);
  assert.equal(b.of('caughtup').length, 1, 'caughtup once');
  const cu = b.names().indexOf('caughtup');
  assert.ok(b.names().slice(1, cu).includes('step') && b.names().slice(1, cu).includes('text'), 'the replay comes before caughtup');
  assert.ok(!b.names().slice(1, cu).includes('stepinfo'), 'stepinfo is merged into its step in the replay');
  assert.equal(a.of('hello')[0].turn, null, 'A was there before the build');
  const ra = rowsOf(a.ev), rb = rowsOf(b.ev);
  assert.deepEqual(rb, ra); assert.deepEqual(ra.map(x => x.key), ['screen', 'blocks', 'write', 'check']);
  assert.deepEqual(ra[2], { key: 'write', at: ra[2].at, plan: 'A fox who hops', l: 12 });
  assert.equal(textOf(b.ev), textOf(a.ev)); assert.equal(textOf(a.ev), 'Hello world. More text.');
  assert.match(b.of('version')[0].preview, /^\/frame\//, 'previews are minted for each viewer');
});

test('RUN-4 the compat subscriber (runTurn) gets every event in order, without hello, caughtup or turn', async () => {
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  const ev = [];
  const res = await agent.runTurn({ user: u, gameId: g.id, text: FOX, emit: (name, d) => ev.push([name, d]) });
  assert.equal(res.ok, true);
  const names = ev.map(e => e[0]);
  for (const x of ['hello', 'caughtup', 'turn']) assert.ok(!names.includes(x), x);
  assert.deepEqual(names, w.names().filter(x => !['hello', 'caughtup', 'turn'].includes(x)));
  assert.equal(names.at(-1), 'done');
  assert.ok(ev.filter(e => e[0] === 'step').every(e => !('at' in e[1])), 'the streamed POST keeps its old step shape');
  assert.ok(w.of('step').every(s => Number.isInteger(s.at)), 'live subscribers get at');
  assert.equal(runner.isBusy(g.id), false, 'runTurn resolves once the game is idle');
});

test('RUN-5 bounded memory: 50,000 text chunks and 10,000 stepinfo keep the replay small, with every step and card', async () => {
  const u = newUser(); const g = newGame(u);
  const ready = deferred(), go = deferred();
  gateImpl = async ctx => {
    ctx.steps.start('blocks'); const i = ctx.steps.start('write');
    ctx.tools.exec('test_notes', { checklist: ['Try it'] });
    for (let k = 0; k < 50000; k++) { ctx.emit('text', { text: `chunk ${k} ` }); if (k % 5 === 0) ctx.steps.info({ l: k }, i); }
    ctx.tools.exec('write_game', { html: GAME, notes: 'First version' });
    ready.resolve(); await Promise.race([go, aborted(ctx.signal)]);
    return { model: 'gate' };
  };
  const r = await build(u, g);
  await ready;
  const buf = runner.jobFor(g.id).buf.map(e => [e[0], e[1]]);
  assert.ok(buf.length <= runner.LIMITS.bufEntries, `${buf.length} entries`);
  assert.ok(Buffer.byteLength(JSON.stringify(buf)) <= runner.LIMITS.bufBytes, `${Buffer.byteLength(JSON.stringify(buf))} bytes`);
  assert.deepEqual(buf.filter(e => e[0] === 'step').map(e => e[1].key), ['screen', 'blocks', 'write', 'notes', 'check']);
  assert.equal(buf.find(e => e[0] === 'step' && e[1].key === 'write')[1].l, 49995, 'stepinfo merged into its row');
  assert.deepEqual(buf.filter(e => !['step', 'text'].includes(e[0])).map(e => e[0]), ['notes', 'version']);
  const late = watch(g.id, u.id);
  const replayed = textOf(late.ev);
  assert.ok(replayed.endsWith('chunk 49999 '), 'the replayed text ends with the last chunk');
  assert.ok(replayed.startsWith('…'), 'the start was trimmed');
  assert.ok(replayed.length <= runner.LIMITS.segTextMax + 9 * 1024);
  go.resolve(); await runner.idle(r.job);
  assert.ok(loadChat(g.id).messages.at(-1).text.endsWith('chunk 49999'), 'the transcript keeps the whole reply');
});

test('RUN-6 time cap: stopped, turn given back when nothing was saved, the timeout text, Continue offered', async () => {
  config.builderTurnMaxMs = 150;
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  hold();
  const r = await build(u, g);
  const res = await runner.idle(r.job);
  const x = row(r.job.id);
  assert.equal(x.status, 'failed'); assert.equal(x.end_reason, 'timeout'); assert.equal(x.refunded, 1); assert.equal(x.can_continue, 1);
  assert.equal(used(u.id), 0, 'the turn came back');
  assert.deepEqual([w.of('done')[0].refunded, w.of('done')[0].end, w.of('done')[0].steps.end], [true, 'timeout', 'timeout']);
  assert.ok(textOf(w.ev).includes(tEn('builder.turnTimeoutNothing')));
  assert.ok(loadChat(g.id).messages.at(-1).text.includes(tEn('builder.turnTimeoutNothing')));
  assert.equal(res.ok, false); assert.equal(res.error, 'timeout');
  assert.equal(runner.isBusy(g.id), false);
  assert.equal(runner.lastTurn(g.id, u).cont, true); assert.equal(runner.lastTurn(g.id, u).refunded, true);

  const g2 = newGame(u); const w2 = watch(g2.id, u.id);
  hold({ save: true });
  const r2 = await build(u, g2); await runner.idle(r2.job);
  assert.equal(row(r2.job.id).refunded, 0); assert.equal(row(r2.job.id).versions, 1);
  assert.equal(used(u.id), 1, 'a build that saved a version keeps its turn');
  assert.ok(textOf(w2.ev).includes(tEn('builder.turnTimeout')));
  assert.equal(w2.of('done')[0].refunded, undefined);
});

test('RUN-7 backstop: a provider that ignores its stop is ended by the runner, and the game is free', async () => {
  config.builderTurnMaxMs = 80; runner.LIMITS.backstopMs = 50;
  const u = newUser(); const g = newGame(u);
  const gate = hold({ ignoreStop: true });
  const r = await build(u, g); const t0 = Date.now();
  await runner.idle(r.job);
  assert.ok(Date.now() - t0 < 2000);
  assert.equal(row(r.job.id).status, 'failed'); assert.equal(row(r.job.id).end_reason, 'timeout');
  assert.equal(runner.isBusy(g.id), false); assert.equal(runner.jobFor(g.id), null);
  gate.open.resolve(); await sleep(20);
});

test('RUN-8 delete mid-build: cancelled at once, no later version, viewers told the game is gone', async () => {
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  const gate = hold({ after: async (ctx, gg) => { gg.late = ctx.tools.exec('write_game', { html: GAME, notes: 'Too late' }); } });
  const r = await build(u, g); await gate.started;
  games.deleteGame(g.id);
  assert.equal(runner.cancel(g.id, 'deleted'), true);
  await runner.idle(r.job);
  assert.equal(row(r.job.id).status, 'cancelled'); assert.equal(row(r.job.id).end_reason, 'deleted');
  assert.equal(gate.late.ok, false); assert.equal(versions(g.id), 0);
  assert.equal(w.of('gone').length, 1); assert.equal(w.closed, true);
  assert.equal(row(r.job.id).refunded, 1, 'nothing saved: the turn comes back');
});

test('RUN-9 ban and Builder off stop the build at the next checkpoint (a ban keeps the turn)', async () => {
  const u = newUser(); const g = newGame(u);
  let gate = hold({ after: async ctx => { await ctx.between(2); } });
  let r = await build(u, g); await gate.started;
  q.run('UPDATE users SET banned=1 WHERE id=?', u.id); gate.open.resolve();
  await runner.idle(r.job);
  assert.equal(row(r.job.id).status, 'cancelled'); assert.equal(row(r.job.id).end_reason, 'banned');
  assert.equal(row(r.job.id).refunded, 0); assert.equal(used(u.id), 1);

  const u2 = newUser(); const g2 = newGame(u2); const w = watch(g2.id, u2.id);
  gate = hold({ after: async ctx => { await ctx.between(2); } });
  r = await build(u2, g2); await gate.started;
  q.run('UPDATE users SET builder_enabled=0 WHERE id=?', u2.id); gate.open.resolve();
  await runner.idle(r.job);
  assert.equal(row(r.job.id).status, 'cancelled'); assert.equal(row(r.job.id).end_reason, 'disabled');
  assert.equal(w.of('error')[0].message, tEn('builder.errors.disabled'));
  assert.equal(row(r.job.id).refunded, 1); assert.equal(used(u2.id), 0);
});

test('RUN-10 hand-off: the reply so far is saved, the row is interrupted, viewers told to come back; during screening the row stays queued', async () => {
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  const gate = hold({ text: 'Halfway there. ', after: async (ctx, gg) => { gg.late = ctx.tools.exec('write_game', { html: GAME, notes: 'Too late' }); } });
  const r = await build(u, g); await gate.started;
  assert.equal(runner.handOff(), 1);
  assert.equal(runner.busyCount(), 0, 'nothing holds the shutdown');
  assert.equal(row(r.job.id).status, 'interrupted'); assert.equal(row(r.job.id).end_reason, 'restart');
  const msgs = loadChat(g.id).messages;
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant']);
  assert.equal(msgs[1].interrupted, true); assert.equal(msgs[1].text, 'Halfway there.'); assert.equal(msgs[1].turn, r.job.id);
  assert.deepEqual([msgs[1].events.at(-1)[0], msgs[1].events.at(-1)[1].end], ['steps', 'restart']);
  assert.deepEqual(w.of('restart'), [{ retryMs: 5000, resume: true }]); assert.equal(w.closed, true);
  await sleep(10);
  assert.equal(gate.late.ok, false, 'a tool after the hand-off writes nothing'); assert.equal(versions(g.id), 0);
  assert.equal(w.of('done').length, 0);

  const slow = deferred();
  agent.hooks.screen = async (text, o) => { await slow; return SCREEN(text, o); };
  const g2 = newGame(u);
  const r2 = await build(u, g2); await sleep(10);
  assert.equal(runner.handOff(), 1);
  slow.resolve(); await sleep(20);
  assert.equal(row(r2.job.id).status, 'queued', 'still queued: the next boot screens it again');
  assert.deepEqual(loadChat(g2.id).messages, []);
  assert.equal(used(u.id), 1, 'only the first build was charged');
});

test('RUN-11 resume: carried on once at boot, from the resume row; one version and one turn either way', async () => {
  for (const saved of [false, true]) {
    const u = newUser(); const g = newGame(u);
    const gate = hold({ text: 'Halfway there. ', save: saved });
    const r = await build(u, g); await gate.started;
    runner.handOff();
    const w = watch(g.id, u.id);
    assert.equal(runner.recover().resumed, 1);
    const job = runner.jobFor(g.id);
    assert.equal(job.id, r.job.id); assert.equal(job.attempt, 2);
    assert.equal(row(job.id).status, 'running'); assert.equal(row(job.id).attempt, 2);
    assert.equal(w.of('turn')[0].attempt, 2);
    const first = w.of('step')[0];
    assert.equal(first.key, 'resume'); assert.equal(first.v, saved ? 1 : undefined);
    await runner.idle(job);
    assert.equal(row(job.id).status, 'done'); assert.equal(row(job.id).end_reason, 'ok');
    const msgs = loadChat(g.id).messages;
    assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant', 'assistant']);
    assert.equal(msgs[1].interrupted, true); assert.equal(msgs[2].resumed, true); assert.equal(msgs[2].events[0][0], 'resumed');
    assert.equal(used(u.id), 1, 'charged once'); assert.equal(versions(g.id), 1, `exactly one version (saved before the hand-off: ${saved})`);
    if (saved) assert.match(msgs[2].text, /I'm back!/);
    assert.equal(msgs[2].events.at(-1)[1].s[0][0], 'resume');
  }
});

test('RUN-12 resume once: a second interruption stops it (turn back, stopped note); Continue carries on once', async () => {
  const u = newUser(); const g = newGame(u);
  hold({ text: 'Halfway there. ' });
  const r = await build(u, g); await sleep(5);
  runner.handOff();
  process.env.BRB_MOCK_DELAY_MS = '25';
  runner.recover();                                    // attempt 2: the building blocks, slowly
  const w = watch(g.id, u.id);
  await until(() => w.of('text').length > 0, 4000, 'the resumed attempt to talk');
  assert.equal(runner.handOff(), 1);
  assert.deepEqual(w.of('restart'), [{ retryMs: 5000, resume: false }], 'the second time it will not carry on by itself');
  process.env.BRB_MOCK_DELAY_MS = '0';
  assert.equal(runner.recover().stopped, 1);
  const x = row(r.job.id);
  assert.deepEqual([x.status, x.end_reason, x.refunded, x.can_continue, x.attempt], ['failed', 'restart', 1, 1, 2]);
  assert.equal(used(u.id), 0);
  assert.deepEqual(loadChat(g.id).messages.at(-1).events, [['stopped', { why: 'restart' }]]);
  assert.deepEqual(runner.lastTurn(g.id, u), { id: r.job.id, end: 'restart', refunded: true, cid: null, cont: true });

  let seen = null;
  gateImpl = async ctx => { seen = ctx.resume; ctx.steps.start('blocks'); return { model: 'gate' }; };
  const c = await build(u, g, 'Please carry on with my last message.', { continueOf: r.job.id });
  assert.equal(c.status, 202); await runner.idle(c.job);
  assert.equal(seen.original, FOX); assert.equal(seen.cont, true); assert.deepEqual(seen.versions, []);
  assert.equal(used(u.id), 1, 'a Continue is a new build');
  assert.equal(row(r.job.id).can_continue, 0, 'used once');
  const again = await build(u, g, 'Please carry on with my last message.', { continueOf: r.job.id });
  assert.equal(again.status, 409); assert.equal(again.code, 'cantContinue'); assert.equal(again.body.error, tEn('studio.api.cantContinue'));
});

test('RUN-13 crash: a running row with no job is carried on at boot (no interrupted entry) and finishes', async () => {
  const u = newUser(); const g = newGame(u);
  const x = turns.create({ gameId: g.id, userId: u.id, status: 'running', request: { text: FOX }, attempt: 1, chargedDay: today(), provider: 'blocks' });
  usage.takeTurn(u.id); appendChat(g.id, u.id, [{ role: 'user', text: FOX, at: Date.now(), turn: x.id }]);
  assert.equal(runner.recover().resumed, 1);
  await runner.idle(runner.jobFor(g.id));
  assert.deepEqual([row(x.id).status, row(x.id).attempt], ['done', 2]);
  const msgs = loadChat(g.id).messages;
  assert.deepEqual(msgs.map(m => m.role), ['user', 'assistant']); assert.equal(msgs[1].resumed, true);
  assert.equal(versions(g.id), 1); assert.equal(used(u.id), 1);
});

test('RUN-14 a queued row at boot is screened and charged as normal; a refused text is still refused and free', async () => {
  const u = newUser(); const g = newGame(u);
  const x = turns.create({ gameId: g.id, userId: u.id, request: { text: FOX } });
  const w = watch(g.id, u.id);
  assert.equal(runner.recover().rerun, 1);
  assert.equal(row(x.id).attempt, 1, 'counted before it runs');
  await runner.idle(runner.jobFor(g.id));
  assert.equal(row(x.id).status, 'done'); assert.equal(used(u.id), 1);
  assert.equal(w.of('step')[0].key, 'screen');
  const g2 = newGame(u);
  const y = turns.create({ gameId: g2.id, userId: u.id, request: { text: 'make a pokemon game' } });
  runner.recover(); await runner.idle(runner.jobFor(g2.id));
  assert.deepEqual([row(y.id).status, row(y.id).end_reason], ['done', 'refused']);
  assert.equal(used(u.id), 1, 'not charged');
  assert.ok(loadChat(g2.id).messages.every(m => m.refused));
});

test('RUN-15 an AI build is not carried on by the building blocks: stopped, turn back', async () => {
  const u = newUser(); const g = newGame(u);
  const x = turns.create({ gameId: g.id, userId: u.id, status: 'running', request: { text: FOX }, attempt: 1, chargedDay: today(), provider: 'ai' });
  usage.takeTurn(u.id);
  assert.equal(agent.providerName(), 'mock');
  assert.equal(runner.recover().stopped, 1);
  assert.deepEqual([row(x.id).status, row(x.id).end_reason, row(x.id).refunded], ['failed', 'restart', 1]);
  assert.deepEqual(loadChat(g.id).messages.at(-1).events, [['stopped', { why: 'ai' }]]);
  assert.equal(used(u.id), 0);
});

test('RUN-16 an unfinished build older than 6 hours is stopped, with Continue', async () => {
  const u = newUser(); const g = newGame(u);
  const x = turns.create({ gameId: g.id, userId: u.id, status: 'running', request: { text: FOX }, attempt: 1, chargedDay: today(), provider: 'blocks' });
  q.run('UPDATE builder_turns SET created_at=? WHERE id=?', Date.now() - 7 * 3600e3, x.id);
  assert.equal(runner.recover().stopped, 1);
  assert.deepEqual([row(x.id).status, row(x.id).end_reason], ['failed', 'restart']);
  assert.equal(runner.lastTurn(g.id, u).cont, true);
});

test('RUN-17 refund table: server-side ends without a version give the turn back; a ban, a stop or a saved version do not', async () => {
  const cases = [['ok', 'done', false], ['error', 'failed', true], ['timeout', 'failed', true], ['deleted', 'cancelled', true],
    ['disabled', 'cancelled', true], ['banned', 'cancelled', false], ['stopped', 'cancelled', false], ['restart', 'failed', true]];
  for (const [end, status, refunds] of cases) {
    for (const saved of [false, true]) {
      const u = newUser(); const g = newGame(u);
      config.builderTurnMaxMs = end === 'timeout' ? 80 : CAP;
      if (end === 'error') gateImpl = async ctx => { ctx.steps.start('blocks'); if (saved) ctx.tools.exec('write_game', { html: GAME, notes: 'v' }); throw new Error('boom'); };
      const gate = end === 'error' ? null : hold({ save: saved, after: ['disabled', 'banned'].includes(end) ? async ctx => { await ctx.between(2); } : null });
      const r = await build(u, g);
      if (gate) await gate.started;
      if (end === 'ok') gate.open.resolve();
      if (end === 'deleted') { games.deleteGame(g.id); runner.cancel(g.id, 'deleted'); }
      if (end === 'disabled') { q.run('UPDATE users SET builder_enabled=0 WHERE id=?', u.id); gate.open.resolve(); }
      if (end === 'banned') { q.run('UPDATE users SET banned=1 WHERE id=?', u.id); gate.open.resolve(); }
      if (end === 'stopped') runner.cancel(r.job, 'stopped');
      if (end === 'restart') { runner.handOff(); q.run('UPDATE builder_turns SET attempt=2 WHERE id=?', r.job.id); runner.recover(); }
      else await runner.idle(r.job);
      const x = row(r.job.id); const want = refunds && !saved;
      assert.deepEqual([x.status, x.end_reason], [status, end], `${end} saved=${saved}`);
      assert.equal(x.refunded, want ? 1 : 0, `${end} saved=${saved}: refunded`);
      assert.equal(used(u.id), want ? 0 : 1, `${end} saved=${saved}: turns used`);
    }
  }
});

test('RUN-18 one unfinished build per game: a second row throws, and two sends at once start one build', async () => {
  const u = newUser(); const g = newGame(u);
  turns.create({ gameId: g.id, userId: u.id, status: 'running' });
  assert.throws(() => turns.create({ gameId: g.id, userId: u.id }), /UNIQUE/);
  const g2 = newGame(u); const gate = hold();
  const [a, b] = await Promise.all([build(u, g2), build(u, g2, 'make it harder')]);
  assert.deepEqual([a.status, b.status], [202, 409]); assert.equal(b.code, 'busy'); assert.equal(b.body.error, tEn('builder.errors.busy'));
  assert.equal(q.get('SELECT COUNT(*) n FROM builder_turns WHERE game_id=?', g2.id).n, 1);
  await gate.started; gate.open.resolve(); await runner.idle(a.job);
});

test('RUN-19 history: neighbours with the same role merged, stopped/resumed summarised, steps and carried left out', () => {
  const rec = { v: 1, p: 'blocks', ms: 10, r: 0, end: 'ok', s: [['blocks', 0]] };
  const h = [
    { role: 'user', text: 'a fox game', turn: 'A' },
    { role: 'assistant', text: 'Halfway', events: [['version', { number: 1, notes: 'First', status: 'pass' }], ['steps', { ...rec, end: 'restart' }]], interrupted: true, turn: 'A' },
    { role: 'assistant', text: 'Done!', events: [['resumed', { v: 1 }], ['steps', rec]], resumed: true, turn: 'A' },
    { role: 'user', text: 'make it red', turn: 'B' },
    { role: 'assistant', text: '', events: [['steps', { ...rec, end: 'error' }]], turn: 'B' },   // an errored build with no words
    { role: 'user', text: 'hello?', turn: 'C' },
    { role: 'assistant', text: '', events: [['stopped', { why: 'restart' }]], turn: 'C' },
    { role: 'assistant', text: '', events: [['carried', { n: 1 }]] },
    { role: 'user', text: 'thanks' },
  ];
  const out = historyToMessages(h);
  assert.deepEqual(out.map(m => m.role), ['user', 'assistant', 'user', 'assistant', 'user']);
  assert.equal(out[0].content, 'a fox game');
  assert.equal(out[1].content, 'Halfway\n[Built version 1: First (safety check: pass)]\n\nDone!\n[The server restarted during this build; carried on from version 1.]');
  assert.equal(out[2].content, 'make it red\n\nhello?', 'no two user messages in a row');
  assert.equal(out[3].content, '[The build stopped early because the server restarted. Anything built before that is saved.]');
  assert.doesNotMatch(JSON.stringify(out), /steps|"carried"|"why"|"s":/);
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].role, out[i - 1].role);
  assert.deepEqual(historyToMessages([{ role: 'assistant', text: 'Hi!' }, { role: 'user', text: 'yo' }]), [{ role: 'user', content: 'yo' }], 'starts with the user');
  // The new message (a block list) joins a history that ends with a user message, and stays a block list.
  assert.deepEqual(mergeRoles([{ role: 'user', content: 'a' }, { role: 'user', content: [{ type: 'text', text: 'b' }] }]), [{ role: 'user', content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }]);
});

test('RUN-20 retention: the message text goes after 7 days, the row after 35', () => {
  const u = newUser(); const g = newGame(u); const g2 = newGame(u); const now = Date.now();
  const mk = (days, gameId = g.id, status = 'done') => {
    const x = turns.create({ gameId, userId: u.id, status, request: { text: `t${days}` } });
    if (days !== null) q.run('UPDATE builder_turns SET ended_at=? WHERE id=?', now - days * 86400e3, x.id);
    return x.id;
  };
  const a = mk(8), b = mk(36), c = mk(1), d = mk(null, g2.id, 'running');
  turns.forget(now);
  assert.deepEqual(row(a).request, {}); assert.equal(row(b), null);
  assert.deepEqual(row(c).request, { text: 't1' }); assert.deepEqual(row(d).request, { text: 'tnull' });
});

test('RUN-21 while draining, a new build is refused (503 restarting) and nothing is stored', async () => {
  const u = newUser(); const g = newGame(u);
  runner.life.draining = true;
  const r = await build(u, g);
  assert.equal(r.status, 503); assert.equal(r.code, 'restarting'); assert.equal(r.body.error, tEn('studio.api.restarting'));
  assert.equal(q.get('SELECT COUNT(*) n FROM builder_turns WHERE game_id=?', g.id).n, 0);
  assert.deepEqual(loadChat(g.id).messages, []);
});

test('RUN-22 runTurn on a game that is building answers busy, as before, and stores nothing', async () => {
  const u = newUser(); const g = newGame(u);
  const gate = hold();
  const r = await build(u, g); await gate.started;
  const ev = [];
  const res = await agent.runTurn({ user: u, gameId: g.id, text: 'make it harder', emit: (name, d) => ev.push([name, d]) });
  assert.deepEqual(ev.map(e => e[0]), ['error', 'done']); assert.equal(ev[0][1].message, tEn('builder.errors.busy'));
  assert.equal(res.ok, false); assert.equal(res.error, 'busy');
  assert.equal(loadChat(g.id).messages.length, 1);
  gate.open.resolve(); await runner.idle(r.job);
});

test('RUN-23 exactly one end: after the backstop, a provider that comes back late changes nothing', async () => {
  config.builderTurnMaxMs = 60; runner.LIMITS.backstopMs = 40;
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  const gate = hold({ ignoreStop: true, after: async (ctx, gg) => { ctx.emit('text', { text: 'late' }); gg.late = ctx.tools.exec('write_game', { html: GAME, notes: 'late' }); } });
  const r = await build(u, g);
  await runner.idle(r.job);
  const mine = () => loadChat(g.id).messages.filter(m => m.role === 'assistant' && m.turn === r.job.id);
  assert.equal(mine().length, 1); assert.equal(w.of('done').length, 1);
  const before = row(r.job.id); const usedBefore = used(u.id);
  gate.open.resolve(); await sleep(30);
  assert.equal(mine().length, 1, 'no second final entry'); assert.equal(w.of('done').length, 1, 'no second done');
  assert.equal(gate.late.ok, false); assert.equal(versions(g.id), 0);
  assert.ok(!textOf(w.ev).includes('late'));
  assert.deepEqual(row(r.job.id), before, 'the row was finished once'); assert.equal(used(u.id), usedBefore);
});

test('RUN-24 at most 2 builds at once per builder; resumed builds are not refused; other builders are not affected', async () => {
  const u = newUser(); const [gA, gB, gC] = [newGame(u), newGame(u), newGame(u)];
  const a = hold(); const ra = await build(u, gA); await a.started;
  const b = hold(); const rb = await build(u, gB); await b.started;
  const rc = await build(u, gC);
  assert.equal(rc.status, 429); assert.equal(rc.code, 'tooMany'); assert.equal(rc.body.error, tEn('builder.errors.tooMany'));
  assert.equal(q.get('SELECT COUNT(*) n FROM builder_turns WHERE game_id=?', gC.id).n, 0);
  const u2 = newUser(); const gD = newGame(u2);
  const d = hold(); const rd = await build(u2, gD); assert.equal(rd.status, 202); await d.started;
  turns.create({ gameId: gC.id, userId: u.id, status: 'running', request: { text: FOX }, attempt: 1, chargedDay: today(), provider: 'blocks' });
  assert.equal(runner.recover().resumed, 1, 'a resumed build is not refused by the cap');
  await runner.idle(runner.jobFor(gC.id));
  for (const x of [a, b, d]) x.open.resolve();
  await Promise.all([ra, rb, rd].map(x => runner.idle(x.job)));
});

test('RUN-25 a message still queued at a second boot is given up: not charged, a stopped note, and put back for its owner only', async () => {
  const u = newUser(); const g = newGame(u);
  const admin = newUser({ role: 'admin' });
  const x = turns.create({ gameId: g.id, userId: u.id, request: { text: 'A shark catch game' } });
  q.run('UPDATE builder_turns SET attempt=1 WHERE id=?', x.id);
  assert.equal(runner.recover().stopped, 1);
  assert.deepEqual([row(x.id).status, row(x.id).end_reason, row(x.id).charged_day, row(x.id).can_continue], ['failed', 'restart', null, 0]);
  assert.equal(used(u.id), 0);
  assert.deepEqual(loadChat(g.id).messages.map(m => [m.role, m.events]), [['assistant', [['stopped', { why: 'restart' }]]]], 'never written as a user message');
  assert.equal(runner.lastTurn(g.id, u).putBack, 'A shark catch game'); assert.equal(runner.lastTurn(g.id, u).cont, false);
  assert.equal(runner.lastTurn(g.id, admin).putBack, undefined, 'only for the owner');
  const gate = hold(); const r = await build(u, g); await gate.started;
  assert.equal(runner.lastTurn(g.id, u).putBack, undefined, 'the next build clears it');
  gate.open.resolve(); await runner.idle(r.job);
  assert.equal(runner.lastTurn(g.id, u).putBack, undefined);

  const g2 = newGame(u);
  const y = turns.create({ gameId: g2.id, userId: u.id, request: { text: FOX } });
  assert.equal(runner.recover().rerun, 1);
  assert.equal(row(y.id).attempt, 1, 'the boot is counted before the message runs again');
  await runner.idle(runner.jobFor(g2.id));
  assert.equal(row(y.id).status, 'done');
});

test('RUN-26 no late version: a hand-off, the time cap or a delete while the template files load writes nothing', async () => {
  for (const how of ['handoff', 'timeout', 'deleted']) {
    const u = newUser(); const g = newGame(u); let res;
    gateImpl = async ctx => {
      ctx.steps.start('blocks');
      const p = ctx.tools.exec('start_from_template', { template: 'island', notes: 'A 3D island' });
      if (how === 'handoff') runner.handOff();
      else if (how === 'timeout') runner.cancel(runner.jobFor(g.id), 'timeout');
      else { games.deleteGame(g.id); runner.cancel(g.id, 'deleted'); }
      res = await p;
      return { model: 'gate' };
    };
    const r = await build(u, g);
    await until(() => res !== undefined, 4000, `the template (${how})`);
    assert.equal(res.ok, false, how); assert.equal(versions(g.id), 0, how);
    if (how !== 'handoff') { await runner.idle(r.job); assert.equal(row(r.job.id).end_reason, how); }
  }
});

test('RUN-27 a retried first message (same cid) gets the same build, not a second one', async () => {
  const u = newUser(); const g = newGame(u); let screens = 0;
  agent.hooks.screen = (text, o) => { screens++; return SCREEN(text, o); };
  const gate = hold();
  const r = await build(u, g, FOX, { cid: 'abcdefgh1234' }); await gate.started;
  const again = await build(u, g, FOX, { cid: 'abcdefgh1234' });
  assert.equal(again.status, 202); assert.equal(again.job, r.job); assert.equal(again.body.turn.id, r.job.id);
  assert.equal(screens, 1, 'screened once');
  assert.equal(loadChat(g.id).messages.length, 1);
  assert.equal(runner.publicTurn(r.job, u).cid, 'abcdefgh1234');
  const other = await build(u, g, 'make it harder', { cid: 'zzzzzzzz9999' });
  assert.equal(other.status, 409, 'another message while building: busy (until follow-ups)');
  const junk = await build(u, newGame(u), FOX, { cid: 'bad cid!' });
  assert.equal(junk.job.cid, null, 'a malformed cid is dropped');
  gate.open.resolve(); await runner.idle(r.job);
  agent.hooks.screen = SCREEN;
});

test('RUN-28 the Builder state survives a hand-off: the resumed attempt does not ask the same question again', async () => {
  process.env.BRB_MOCK_DELAY_MS = '30';
  const u = newUser(); const g = newGame(u);
  const w = watch(g.id, u.id);
  await runner.submit({ user: u, game: g, text: 'hi', t: tEn });   // the building blocks: "What kind of game?"
  await until(() => w.of('text').length > 0, 4000, 'the first words');
  runner.handOff();
  process.env.BRB_MOCK_DELAY_MS = '0';
  assert.deepEqual(loadChat(g.id).state.mock.asked, ['kind'], 'saved with the interrupted reply');
  assert.equal(w.of('ask').length, 0, 'the question card never came');
  const w2 = watch(g.id, u.id);
  runner.recover(); await runner.idle(runner.jobFor(g.id));
  const asks = w2.of('ask');
  assert.equal(asks.length, 1); assert.equal(asks[0].question, 'Who is the hero, or what is it about?');
  assert.deepEqual(loadChat(g.id).state.mock.asked, ['kind', 'theme']);
});
