// Admin stats: visits are counted per day without tracking people, AI tokens are logged per model, and /admin/stats
// is admin-only and shows the numbers.
process.env.BRB_DB = ':memory:'; process.env.BRB_SILENT = '1'; process.env.LOG_REQUESTS = '0';
import test from 'node:test';
import assert from 'node:assert/strict';
const { q, today } = await import('../../server/db.js');
const { createUser, startSession } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const traffic = await import('../../server/services/traffic.js');
const stats = await import('../../server/services/stats.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const { createApp } = await import('../../server/app.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1';
const visit = (path, ua = CHROME, extra = {}) => fetch(base + path, { headers: { accept: 'text/html', 'user-agent': ua, ...extra }, redirect: 'manual' });
const views = area => (q.get('SELECT views FROM traffic WHERE day=? AND area=?', today(), area) || { views: 0 }).views;

test('page views count by area; each visitor once a day; bots, APIs, files and errors do not count', async () => {
  await visit('/'); await visit('/'); await visit('/search');
  assert.equal(views('home'), 2); assert.equal(views('search'), 1); assert.equal(views('_visitors'), 1, 'same browser = one visitor');
  await visit('/', 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0 Safari/537.36');
  assert.equal(views('_visitors'), 2);
  await visit('/', 'Googlebot/2.1'); await visit('/api/live?ids=x'); await visit('/css/app.css'); await visit('/g/nope-not-a-game');
  await fetch(base + '/', { headers: { accept: 'application/json', 'user-agent': CHROME } });
  assert.equal(views('home'), 3); assert.equal(views('_visitors'), 2); assert.equal(views('game'), 0, '404s are not visits');
  // only salted hashes are stored, and old ones are forgotten
  const h = q.all('SELECT h FROM visit_seen').map(r => r.h);
  assert.ok(h.every(x => /^[\w-]{16}$/.test(x) && !x.includes('127')));
  q.run("INSERT INTO visit_seen(day, h) VALUES ('2020-01-01', 'old')");
  traffic.pruneVisitors(); assert.equal(q.get("SELECT COUNT(*) n FROM visit_seen WHERE day='2020-01-01'").n, 0);
  assert.equal(traffic.areaOf('/play/x'), 'play'); assert.equal(traffic.areaOf('/studio/abc'), 'build'); assert.equal(traffic.areaOf('/weird'), 'other');
  for (const p of ['/teach', '/teach/lessons/abc', '/class/x', '/class/x/progress', '/school/oak-hill', '/classes']) assert.equal(traffic.areaOf(p), 'school', p);
  assert.equal(traffic.areaOf('/classy'), 'other', 'word boundary: only the real school pages');
  await visit('/teach'); // not signed in: a redirect, not a 200 page, so it is not counted
  assert.equal(views('school'), 0);
});

test('AI usage is logged per model with tokens; stats add up users, games, plays and AI', () => {
  aiBudget.recordUsage('claude-sonnet-5-5', { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 2000 });
  aiBudget.recordUsage('claude-haiku-5-5-20261001', { input_tokens: 100, output_tokens: 10 });
  const m = stats.aiByModel(30);
  assert.deepEqual(m.map(x => x.model).sort(), ['claude-haiku-5-5', 'claude-sonnet-5-5']);
  const s = m.find(x => x.model === 'claude-sonnet-5-5'); assert.equal(s.input, 1000); assert.equal(s.cache_read, 2000); assert.equal(s.output, 500); assert.ok(s.usd > 0);
  const u = createUser({ username: 'StatsKid', password: 'secret123' });
  const g = games.createGame(u.id, { title: 'Stat Game' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id='x' WHERE id=?", g.id);
  games.recordPlay(g.id, u.id); games.recordPlay(g.id, null);
  const k = stats.kpis();
  assert.ok(k.users.accounts >= 1); assert.ok(k.users.newToday >= 1); assert.equal(k.games.live, 1); assert.equal(k.plays.today, 2);
  assert.equal(k.ai.callsToday, 2); assert.equal(k.ai.tokensToday.output, 510);
  const d = stats.daily(7); assert.equal(d.length, 7); assert.equal(d[6].day, today());
  assert.equal(d[6].plays, 2); assert.equal(d[6].signups, k.users.newToday); assert.equal(d[6].tokensOut, 510);
  assert.equal(stats.topGames(7)[0].title, 'Stat Game');
  assert.equal(stats.topBuilders()[0].username, 'StatsKid');
});

test('/admin/stats: admins only; shows tiles, charts with tables, and lists', async () => {
  traffic.recordView('/teach', '10.0.0.9', CHROME);
  const admin = createUser({ username: 'StatsAdmin', password: 'secret123', role: 'admin' });
  const kid = createUser({ username: 'StatsNosy', password: 'secret123' });
  assert.equal((await fetch(base + '/admin/stats', { redirect: 'manual' })).status, 404);
  assert.equal((await fetch(base + '/admin/stats', { headers: { cookie: cookieFor(kid.id) } })).status, 404);
  for (const days of [7, 30, 90]) {
    const r = await fetch(base + `/admin/stats?days=${days}`, { headers: { cookie: cookieFor(admin.id) } });
    assert.equal(r.status, 200); const h = await r.text();
    assert.equal((h.match(/class="chart panel"/g) || []).length, 7);
    assert.equal((h.match(/class="bar"/g) || []).length, 7 * days);
    for (const s of ['Visitors today', 'AI cost today', 'Tokens today', 'Most played', 'AI by model', 'Show as a table', 'Stat Game', 'claude-sonnet-5-5']) assert.ok(h.includes(s), s);
    if (days === 7) { assert.ok(h.includes('<td>Home</td>') && h.includes('<td>Search</td>') && h.includes('<td>Schools</td>'), 'areas are shown by name'); }
  }
  const adm = await (await fetch(base + '/admin', { headers: { cookie: cookieFor(admin.id) } })).text();
  assert.match(adm, /href="\/admin\/stats"/);
  assert.equal(views('_visitors') >= 2, true); // admin pages are not counted as visits
});
