// Cost per Builder message (docs/decisions.md "Paid plans", chunk 1): stored per build, estimated for older builds from
// their token counts, summed per quality on /admin/stats with messages per day and the free messages the budget pays for.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q, today } = await import('../../server/db.js');
const { config } = await import('../../server/config.js');
const { createUser, startSession } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const turns = await import('../../server/builder/turns.js');
const usage = await import('../../server/builder/usage.js');
const stats = await import('../../server/services/stats.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} vs ${b}`);
const DAY = 86400e3;
const day = n => today(Date.now() - n * DAY);

const kid = createUser({ username: 'CostStatsKid', password: 'secret123' });
const game = games.createGame(kid.id, { title: 'Cost Game' });
/** A finished, charged build the AI ran. */
function build({ ago = 0, pro = false, usd = null, tin = 0, tout = 0, provider = 'ai', refunded = false }) {
  const r = turns.create({ gameId: game.id, userId: kid.id, pro });
  if (usd === null) {   // an older build: charged, but from before costs were stored
    q.run("UPDATE builder_turns SET status='done', end_reason='ok', charged_day=?, provider=?, tokens_in=?, tokens_out=?, ended_at=? WHERE id=?", day(ago), provider, tin, tout, Date.now(), r.id);
  } else {
    turns.markRunning(r.id, { chargedDay: day(ago), provider, chargedTo: 'free', weight: pro ? 2 : 1 });
    turns.finish(r.id, { status: 'done', end: 'ok', usd, tokensIn: tin, tokensOut: tout });
  }
  if (refunded) q.run('UPDATE builder_turns SET refunded=1 WHERE id=?', r.id);
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,1) ON CONFLICT(user_id, day) DO UPDATE SET turns=turns+1', kid.id, day(ago));
  return r.id;
}

test('allowanceFor: the free allowance today, by user row or id; turnsLeft and takeTurn read it', () => {
  const u = createUser({ username: 'AllowKid', password: 'secret123' });
  const a = usage.allowanceFor(u);
  assert.deepEqual(a, { source: 'free', pool: 'free', daily: config.builderDailyTurns, proWeight: 1 });
  assert.deepEqual(usage.allowanceFor(u.id), a);
  const saved = config.builderDailyTurns; config.builderDailyTurns = 2;
  try {
    assert.equal(usage.turnsLeft(u), 2);
    assert.deepEqual(usage.takeTurn(u), { source: 'free', pool: 'free', weight: 1 });
    assert.equal(usage.turnsLeft(u.id), 1);
    config.proTurnWeight = 2;
    assert.equal(usage.takeTurn(u, today(), { pro: true }).weight, 2, 'a Pro message may use the last turn and count past the cap');
    assert.equal(usage.turnsLeft(u), 0); assert.equal(usage.takeTurn(u), false);
    usage.refundTurn(u.id, today(), 2); assert.equal(usage.turnsLeft(u), 1);
  } finally { config.builderDailyTurns = saved; config.proTurnWeight = 1; }
});

test('a build\'s cost adds up over attempts (hand-off at a restart, then the resumed attempt)', () => {
  const r = turns.create({ gameId: game.id, userId: kid.id });
  turns.markRunning(r.id, { chargedDay: today(), provider: 'ai' });
  turns.interrupt(r.id, { usd: 0.25 });
  turns.finish(r.id, { status: 'done', end: 'ok', usd: 0.5 });
  const row = q.get('SELECT usd, usd_known FROM builder_turns WHERE id=?', r.id);
  near(row.usd, 0.75); assert.equal(row.usd_known, 1);
  q.run('DELETE FROM builder_turns WHERE id=?', r.id);
});

test('recordUsage keeps spend per money pool next to the site total', () => {
  const d = '2026-02-03';
  aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 100000 }, d);            // $1, free by default
  aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 100000 }, d, 'paid');
  aiBudget.recordUsage('claude-sonnet-5-5', { output_tokens: 100000 }, d, 'nonsense');  // unknown pools pay as free
  near(q.get('SELECT usd FROM ai_spend WHERE day=?', d).usd, 3);
  near(q.get("SELECT usd FROM ai_spend_pool WHERE day=? AND pool='free'", d).usd, 2);
  near(q.get("SELECT usd FROM ai_spend_pool WHERE day=? AND pool='paid'", d).usd, 1);
  assert.equal(q.get("SELECT calls FROM ai_spend_pool WHERE day=? AND pool='free'", d).calls, 2);
});

test('messageCosts: average, median and 90th percentile per quality; older builds estimated; budget maths', () => {
  q.run('DELETE FROM builder_turns'); q.run('DELETE FROM builder_usage'); q.run('DELETE FROM ai_spend_pool'); q.run('DELETE FROM ai_usage');
  // Normal: 0.05, 0.10, 0.15, 0.20 (one refunded: still a paid message) over the last 4 days.
  build({ ago: 3, usd: 0.05 }); build({ ago: 2, usd: 0.10 }); build({ ago: 1, usd: 0.15, refunded: true }); build({ ago: 0, usd: 0.20 });
  // Pro: 0.30 and 0.50.
  build({ ago: 1, pro: true, usd: 0.30 }); build({ ago: 0, pro: true, usd: 0.50 });
  // Not messages that cost: the offline builder, a build still running, a build never charged.
  build({ ago: 0, usd: 0, provider: 'blocks' });
  const live = turns.create({ gameId: games.createGame(kid.id, {}).id, userId: kid.id }); turns.markRunning(live.id, { chargedDay: today(), provider: 'ai' });
  turns.create({ gameId: games.createGame(kid.id, {}).id, userId: kid.id });
  // An older normal build with no stored cost: 1M input tokens, 10k output. The model's real calls in ai_usage over
  // the window paid $0.50 per million input tokens on average (most were cached), so the estimate uses that rate.
  q.run(`INSERT INTO ai_usage(day, model, calls, input, output, cache_read, cache_write, usd) VALUES (?,?,1,?,?,?,?,?)`,
    day(1), config.builderModel, 100000, 0, 900000, 0, 0.5 + 0);
  const outPrice = aiBudget.costOf(config.builderModel, { output_tokens: 10000 });
  build({ ago: 2, tin: 1e6, tout: 10000 });
  // Free AI spend over the window: $3 (builds $1.30 + estimate, the rest is screening, reviews...).
  q.run("INSERT INTO ai_spend_pool(day, pool, usd, calls) VALUES (?, 'free', 3, 10)", day(1));

  const c = stats.messageCosts(30);
  assert.equal(c.normal.n, 5); assert.equal(c.pro.n, 2); assert.equal(c.all.n, 7);
  assert.equal(c.normal.estimated, 1); assert.equal(c.pro.estimated, 0);
  const est = 0.5 + outPrice;
  near(c.normal.total, 0.05 + 0.10 + 0.15 + 0.20 + est);
  near(c.normal.avg, c.normal.total / 5);
  near(c.normal.median, 0.15);
  near(c.normal.p90, Math.max(0.20, est));
  near(c.pro.avg, 0.40); near(c.pro.median, 0.30); near(c.pro.p90, 0.50);
  // Messages per day: the 8 charged turns in builder_usage over the 4 days since the first message.
  assert.equal(c.activeDays, 4); near(c.perDay, 8 / 4);
  // The budget: $3 spent over 4 days, builds cost all.total, the rest is other AI use, scaled to 30 days.
  near(c.otherUsd, 3 - c.all.total);
  near(c.projectedMonth, 3 / 4 * 30);
  assert.equal(c.expectedPerMonthAll, Math.floor(config.aiMonthlyBudgetUsd / c.all.avg));
  assert.equal(c.expectedPerMonth, Math.floor(Math.max(0, config.aiMonthlyBudgetUsd - c.otherUsd / 4 * 30) / c.all.avg));
  assert.equal(c.perDayCap, Math.floor(config.aiDailyBudgetUsd / c.all.avg));
});

test('messageCosts with no messages yet: nothing divides by zero', () => {
  q.run('DELETE FROM builder_turns'); q.run('DELETE FROM builder_usage'); q.run('DELETE FROM ai_spend_pool');
  const c = stats.messageCosts(30);
  assert.equal(c.all.n, 0); assert.equal(c.all.avg, 0); assert.equal(c.expectedPerMonth, null); assert.equal(c.perDay, 0);
});

test('/admin/stats shows cost per message by quality, messages per day and free messages per month', async () => {
  build({ ago: 0, usd: 0.12 }); build({ ago: 0, pro: true, usd: 0.4 }); build({ ago: 1, tin: 20000, tout: 3000 });
  const admin = createUser({ username: 'CostAdmin', password: 'secret123', role: 'admin' });
  assert.equal((await fetch(base + '/admin/stats', { headers: { cookie: cookieFor(kid.id) } })).status, 404);
  for (const days of [7, 30, 90]) {
    const r = await fetch(base + `/admin/stats?days=${days}`, { headers: { cookie: cookieFor(admin.id) } });
    assert.equal(r.status, 200);
    const h = await r.text();
    assert.match(h, new RegExp(`Cost per Builder message, last ${Math.min(days, 30)} days`));
    assert.match(h, /Average per message/); assert.match(h, /Messages per day/); assert.match(h, /Free messages per month/);
    assert.match(h, /<td>Normal<\/td><td>2 <span class="muted small">\(1 estimated\)<\/span><\/td>\s*<td>/);
    assert.match(h, /<td>Pro<\/td><td>1<\/td>\s*<td>40¢<\/td>/);
    assert.match(h, /1 older builds have no stored cost/);
  }
});
