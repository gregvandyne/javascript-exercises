// The owner's user analytics (docs/decisions.md "Admin: user analytics"): the All users table (every metric, sorting,
// filters, paging, CSV), one person's Activity on the Users tab, DAU / WAU / MAU on /admin/stats, where each number comes
// from (last login from sign-ins, days active, plays and distinct games, builds, Builder messages, course steps, live
// games), that every page is admin-only and shows no secrets, and that 5,000 accounts with their plays render fast.
import './_setup.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
process.env.BRB_SNAPSHOTS = '0';
const { q, db, uid, now, today, MIGRATIONS } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const AA = await import('../../server/services/admin-analytics.js');
const C = await import('../../server/services/courses.js');
const S = await import('../../server/services/schools.js');
const { _reset: resetLimits } = await import('../../server/services/ratelimit.js');
const { createApp } = await import('../../server/app.js');

const DAY = 86400e3;
let n = 0;
const mk = (p = 'An', o = {}) => auth.createUser({ username: `${p}${++n}`, ...o });
const admin = mk('Boss', { role: 'admin', password: 'secret123' });
const cookieFor = id => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const fakeRes = { append() {} };
const dayOf = t => today(t);
const addPlay = (userId, gameId, t = now(), seconds = 30) => q.run('INSERT INTO plays(id, game_id, user_id, started_at, ended_at, seconds) VALUES (?,?,?,?,?,?)', uid(12), gameId, userId, t, t + seconds * 1000, seconds);
const addTurns = (userId, day, turns) => q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,?) ON CONFLICT(user_id, day) DO UPDATE SET turns=turns+excluded.turns', userId, day, turns);
const row = (f, id) => AA.listUsers(AA.cleanFilters(f), { perPage: 5000 }).rows.find(r => r.id === id);
const course = C.getCourse('cs-quest');
const gameStep = C.steps(course, '1b').find(s => s.game), plainStep = C.steps(course, '1b').find(s => !s.game);

let server, base;
before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
after(() => server.close());
const req = (path, { user } = {}) => fetch(base + path, { redirect: 'manual', headers: user ? { cookie: cookieFor(user.id) } : {} });

// ---------------------------------------------------------------- where the numbers come from
test('last login: every real sign-in is noted with how (never the IP or browser); guests never are', () => {
  const u = mk('Login');
  assert.equal(u.last_login_at, 0, 'a new account has not signed in');
  const t0 = now();
  auth.startSession(fakeRes, u.id, 'Mozilla/5.0 secret-ua', { method: 'google' });
  const got = auth.getUser(u.id);
  assert.ok(got.last_login_at >= t0);
  const s = q.all('SELECT * FROM sign_ins WHERE user_id=?', u.id);
  assert.equal(s.length, 1); assert.equal(s[0].method, 'google');
  assert.deepEqual(Object.keys(s[0]).sort(), ['at', 'method', 'user_id'], 'no IP, no browser');
  auth.startSession(fakeRes, u.id, '', { via: 'switch' });
  assert.equal(q.get('SELECT method FROM sign_ins WHERE user_id=? ORDER BY at DESC, rowid DESC LIMIT 1', u.id).method, 'switch');
  assert.ok(q.get('SELECT 1 FROM user_days WHERE user_id=? AND day=?', u.id, today()), 'signing in is a day of use');
  // Sessions are deleted at sign-out; the last login stays.
  q.run('DELETE FROM sessions WHERE user_id=?', u.id);
  assert.ok(row({}, u.id).last_login_at >= t0);
  const guest = auth.createGuest(); auth.startSession(fakeRes, guest.id);
  assert.equal(auth.getUser(guest.id).last_login_at, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM sign_ins WHERE user_id=?', guest.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM user_days WHERE user_id=?', guest.id).n, 0);
});

test('days active: the first signed-in request of a UTC day counts the day (once)', async () => {
  const u = mk('Days', { password: 'secret123' });
  const cookie = cookieFor(u.id);
  q.run('DELETE FROM user_days WHERE user_id=?', u.id);
  q.run('UPDATE users SET last_seen=? WHERE id=?', now() - 2 * DAY, u.id);
  await fetch(base + '/me', { headers: { cookie }, redirect: 'manual' });
  await fetch(base + '/me', { headers: { cookie }, redirect: 'manual' });
  assert.deepEqual(q.all('SELECT day FROM user_days WHERE user_id=?', u.id).map(r => r.day), [today()]);
  // Days in the last 30 count; older ones don't.
  for (const d of [1, 5, 29, 30, 45]) auth.noteActiveDay(u.id, now() - d * DAY);
  assert.equal(row({}, u.id).days30, 4, 'today, 1, 5 and 29 days ago');
  assert.equal(AA.userAnalytics(u.id).totals.days30, 4);
});

test('the migration backfills last login, sign-ins and days active from what is stored', () => {
  const u = mk('Back'); const made = mk('BackMade');
  const t = now() - 3 * DAY;
  q.run("INSERT INTO sessions(id, user_id, created_at, expires_at, ua, last_active, via) VALUES (?,?,?,?,'',?,NULL)", uid(32), u.id, t, t + 10 * DAY, t + DAY);
  addTurns(u.id, dayOf(t - 5 * DAY), 2);
  q.run("UPDATE users SET made_by='someone', last_login_at=0 WHERE id=?", made.id);
  q.run('UPDATE users SET last_login_at=0 WHERE id=?', u.id);
  for (const id of [u.id, made.id]) { q.run('DELETE FROM user_days WHERE user_id=?', id); q.run('DELETE FROM sign_ins WHERE user_id=?', id); }
  const [, sql] = MIGRATIONS.find(m => m[0] === '0056_user_analytics');
  db.exec(sql.replace(/ALTER TABLE users ADD COLUMN last_login_at[^;]*;/, ''));
  assert.equal(auth.getUser(u.id).last_login_at, t, 'from the newest stored session');
  assert.equal(auth.getUser(made.id).last_login_at, 0, 'an account a grown-up made that never signed in');
  assert.equal(q.get('SELECT COUNT(*) n FROM sign_ins WHERE user_id=?', u.id).n, 1);
  const days = q.all('SELECT day FROM user_days WHERE user_id=? ORDER BY day', u.id).map(r => r.day);
  for (const d of [dayOf(t - 5 * DAY), dayOf(t), dayOf(t + DAY)]) assert.ok(days.includes(d), d);
  assert.equal(row({}, made.id).never_active, true);
});

test('each metric on seeded data: plays and distinct games, builds, Builder messages, course steps, live games, popularity', () => {
  const p = mk('Metric'); const other = mk('MetricMaker');
  const g1 = games.createGame(other.id, { title: 'One' }), g2 = games.createGame(other.id, { title: 'Two' });
  addPlay(p.id, g1.id); addPlay(p.id, g1.id); addPlay(p.id, g2.id, now() - 2 * DAY, 120);
  const mine = games.createGame(p.id, { title: 'Mine' }), mine2 = games.createGame(p.id, { title: 'Mine too' }), gone = games.createGame(p.id, { title: 'Gone' });
  const v = games.addVersion(mine.id, '<title>x</title>');
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, published_at=?, plays=41 WHERE id=?", v.id, now(), mine.id);
  q.run('UPDATE games SET plays=1 WHERE id=?', mine2.id);
  q.run("UPDATE games SET status='deleted', plays=500 WHERE id=?", gone.id);
  addTurns(p.id, today(), 3); addTurns(p.id, dayOf(now() - 40 * DAY), 2);
  // Course steps: a step without a game is done when read and checked; a step with a game only once the game is won.
  const ins = (step, completed) => q.run('INSERT INTO course_progress(user_id, course, step, band, read_at, checked_at, check_score, played_at, completed_at) VALUES (?,?,?,?,?,?,?,?,?)', p.id, 'cs-quest', step, '1b', now(), now(), 3, now(), completed);
  ins(plainStep.key, null); ins(gameStep.key, null);
  q.run("INSERT INTO course_progress(user_id, course, step, band, read_at) VALUES (?, 'cs-quest', '1b-9.9', '1b', ?)", p.id, now());
  const runId = uid(10);
  q.run("INSERT INTO live_runs(id, host_id, audience, mode, title, started_at, ended_at) VALUES (?,?, 'class', 'quiz', 'Fractions', ?, ?)", runId, other.id, now(), now());
  q.run('INSERT INTO live_run_scores(run_id, user_id, score) VALUES (?,?,10)', runId, p.id);
  let r = row({}, p.id);
  assert.equal(r.plays, 3); assert.equal(r.distinct_games, 2);
  assert.equal(r.games_made, 2, 'deleted games do not count'); assert.equal(r.games_public, 1);
  assert.equal(r.plays_of_games, 42);
  assert.equal(r.ai_messages, 5);
  assert.equal(r.course_steps, 1, 'the game step is not done until its game is won');
  assert.equal(r.live_joined, 1);
  q.run('UPDATE course_progress SET completed_at=? WHERE user_id=? AND step=?', now(), p.id, gameStep.key);
  r = row({}, p.id);
  assert.equal(r.course_steps, 2);
  // The same numbers on the detail.
  const a = AA.userAnalytics(p.id);
  assert.equal(a.totals.plays, 3); assert.equal(a.totals.distinctGames, 2); assert.equal(a.totals.minutes, 3);
  assert.equal(a.totals.built, 2); assert.equal(a.totals.public, 1); assert.equal(a.totals.ai, 5); assert.equal(a.totals.ai30, 3);
  assert.equal(a.totals.courseSteps, 2); assert.equal(a.totals.liveJoined, 1); assert.equal(a.totals.playsOfGames, 42);
  assert.equal(a.daily.length, 30); assert.equal(a.daily.at(-1).plays, 2); assert.equal(a.daily.at(-1).ai, 3); assert.equal(a.daily.at(-3).plays, 1);
  assert.deepEqual(a.topPlayed.map(g => [g.title, g.plays]), [['One', 2], ['Two', 1]]);
  const cs = a.courses.find(c => c.slug === 'cs-quest');
  assert.equal(cs.done, 2); assert.equal(cs.total, C.steps(course, '1b').length); assert.equal(cs.touched, 3);
  const kinds = new Set(a.timeline.map(e => e.kind));
  for (const k of ['joined', 'built', 'published', 'played', 'ai', 'course', 'live']) assert.ok(kinds.has(k), k);
  assert.ok(a.timeline.every((e, i) => i === 0 || a.timeline[i - 1].at >= e.at), 'newest first');
  const host = AA.userAnalytics(other.id);
  assert.equal(host.totals.liveHosted, 1); assert.equal(host.totals.playsOfGames, 0);
});

// ---------------------------------------------------------------- the table: sorting, filters, paging
test('every column sorts both ways; filters for type, active, never active, joined range and search; paging', () => {
  const t = now();
  const fresh = mk('SortFresh'), old = mk('SortOld'), idle = mk('SortIdle'), never = mk('SortNever'), grown = mk('SortGrown', { accountType: 'grownup' });
  q.run('UPDATE users SET created_at=?, last_seen=?, last_login_at=? WHERE id=?', t - 100 * DAY, t - 3 * DAY, t - 3 * DAY, old.id);
  q.run('UPDATE users SET created_at=?, last_seen=?, last_login_at=? WHERE id=?', t - 200 * DAY, t - 60 * DAY, t - 60 * DAY, idle.id);
  q.run('UPDATE users SET created_at=? WHERE id=?', Date.parse('2026-01-15T10:00:00Z'), never.id);
  q.run("UPDATE users SET made_by='x' WHERE id=?", never.id);
  auth.startSession(fakeRes, fresh.id);
  for (const [k] of Object.entries(AA.SORTS)) {
    for (const dir of ['asc', 'desc']) {
      const rows = AA.listUsers(AA.cleanFilters({ sort: k, dir }), { perPage: 5000 }).rows;
      assert.ok(rows.length > 5, k);
      const col = { name: 'username', type: 'type', joined: 'created_at', login: 'last_login_at', active: 'active_sort', days: 'days30', plays: 'plays', distinct: 'distinct_games', built: 'games_made', public: 'games_public', ai: 'ai_messages', courses: 'course_steps', live: 'live_joined', popularity: 'plays_of_games', status: 'banned' }[k];
      const val = r => (k === 'name' ? r.username.toLowerCase() : typeof r[col] === 'boolean' ? +r[col] : r[col]);
      for (let i = 1; i < rows.length; i++) {
        const a = val(rows[i - 1]), b = val(rows[i]);
        assert.ok(dir === 'asc' ? a <= b : a >= b, `${k} ${dir}: ${a} then ${b}`);
      }
    }
  }
  const ids = f => AA.listUsers(AA.cleanFilters(f), { perPage: 5000 }).rows.map(r => r.id);
  assert.ok(ids({ active: '1d' }).includes(fresh.id)); assert.ok(!ids({ active: '1d' }).includes(old.id));
  assert.ok(ids({ active: '7d' }).includes(old.id)); assert.ok(!ids({ active: '30d' }).includes(idle.id));
  assert.ok(ids({ active: 'idle' }).includes(idle.id)); assert.ok(!ids({ active: 'idle' }).includes(fresh.id));
  assert.ok(ids({ active: 'never' }).includes(never.id)); assert.ok(!ids({ active: 'never' }).includes(fresh.id));
  assert.ok(!ids({ active: '1d' }).includes(never.id), 'made today by someone else, never used: not active');
  assert.ok(ids({ type: 'grownup' }).includes(grown.id)); assert.ok(!ids({ type: 'grownup' }).includes(fresh.id));
  assert.deepEqual(ids({ from: '2026-01-15', to: '2026-01-15' }).filter(id => id === never.id), [never.id], 'joined range is inclusive (UTC days)');
  assert.ok(!ids({ from: '2026-01-16' }).includes(never.id)); assert.ok(!ids({ to: '2026-01-14' }).includes(never.id));
  assert.ok(ids({ joined: '30d' }).includes(fresh.id)); assert.ok(!ids({ joined: '30d' }).includes(old.id));
  assert.deepEqual(ids({ q: 'SortIdle' }), [idle.id]);
  assert.equal(AA.listUsers(AA.cleanFilters({ q: '_' })).total, 0, 'LIKE wildcards are literal');
  // Guests, the team account and removed accounts are never listed.
  const guest = auth.createGuest(); const all = ids({});
  assert.ok(!all.includes(guest.id)); assert.ok(!AA.listUsers(AA.DEFAULTS, { perPage: 5000 }).rows.some(r => r.username === auth.OFFICIAL));
  const tomb = mk('Tomb'); q.run("UPDATE users SET username=?, banned=1, password_hash=NULL WHERE id=?", `deleted_${tomb.id}`, tomb.id);
  assert.ok(!ids({}).includes(tomb.id));
  // Paging: pages don't overlap and cover everything.
  const p1 = AA.listUsers(AA.cleanFilters({ sort: 'name', dir: 'asc' }), { perPage: 3 }), p2 = AA.listUsers(AA.cleanFilters({ sort: 'name', dir: 'asc', page: 2 }), { perPage: 3 });
  assert.equal(p1.rows.length, 3); assert.equal(p2.page, 2); assert.ok(p1.pages > 2);
  assert.ok(!p2.rows.some(r => p1.rows.some(x => x.id === r.id)));
  assert.equal(AA.listUsers(AA.cleanFilters({ page: 99999 }), { perPage: 3 }).page, p1.pages, 'a page past the end shows the last one');
  // Unknown values fall back to the defaults.
  assert.deepEqual(AA.cleanFilters({ sort: 'password_hash', dir: 'x', active: 'evil', joined: '1;DROP', from: '2026-13-99', type: 'root' }), { ...AA.DEFAULTS });
  // No secrets in rows.
  for (const r of p1.rows) for (const k of ['password_hash', 'friend_code', 'ua', 'lang']) assert.equal(k in r, false);
});

test('quick views and the old New users tab', () => {
  assert.equal(AA.quickOn(AA.cleanFilters({ joined: '30d' }), 'new'), true);
  assert.equal(AA.quickOn(AA.cleanFilters({ joined: '30d', type: 'kid' }), 'new'), false);
  assert.equal(AA.quickOn(AA.cleanFilters({ sort: 'plays' }), 'players'), true);
});

// ---------------------------------------------------------------- DAU / WAU / MAU
test('DAU / WAU / MAU, new vs returning, active per day and the most active people', () => {
  const at = now() + 2000 * DAY;   // a day in the future, so only these rows count
  const newbie = mk('Dau'), regular = mk('Dau'), monthly = mk('Dau'), lapsed = mk('Dau'), guest = auth.createGuest();
  q.run('UPDATE users SET created_at=? WHERE id=?', at - 2 * DAY, newbie.id);
  for (const id of [regular.id, monthly.id, lapsed.id]) q.run('UPDATE users SET created_at=? WHERE id=?', at - 300 * DAY, id);
  const on = (u, d) => q.run('INSERT OR IGNORE INTO user_days(user_id, day) VALUES (?,?)', u.id, today(at - d * DAY));
  on(newbie, 0); on(newbie, 1); for (const d of [0, 1, 2, 3, 8, 9]) on(regular, d); on(monthly, 20); on(lapsed, 40);
  q.run('INSERT OR IGNORE INTO user_days(user_id, day) VALUES (?,?)', guest.id, today(at));
  const a = AA.activeCounts(at);
  assert.equal(a.dau, 2); assert.equal(a.wau, 2); assert.equal(a.mau, 3);
  assert.equal(a.newThisWeek, 1); assert.equal(a.returningThisWeek, 1);
  assert.equal(a.wauBefore, 1, 'the week before: the regular');
  assert.equal(a.stickiness, 67);
  const per = AA.activeByDay(30, at);
  assert.equal(per.length, 30); assert.equal(per.at(-1).active, 2); assert.equal(per.at(-4).active, 1); assert.equal(per.at(-5).active, 0);
  addPlay(regular.id, games.createGame(newbie.id, { title: 'P' }).id, at - DAY);
  const busy = AA.mostActive(7, 10, at);
  assert.deepEqual(busy.map(b => b.id), [regular.id, newbie.id]);
  assert.equal(busy[0].days, 4); assert.equal(busy[0].plays, 1);
});

// ---------------------------------------------------------------- pages, CSV and admin-only
test('All users, a person\'s Activity and Stats render for the admin, are 404 for everyone else and show no secrets', async () => {
  resetLimits();
  const kid = mk('PgKid', { password: 'secret123' }), grown = mk('PgGrown', { accountType: 'grownup', password: 'secret123' });
  const boss = mk('PgBoss', { role: 'admin' }); const school = S.createSchool(boss, { name: 'Pg School' }).school;
  const teacher = S.createSchoolAccount(boss, school.id, { rosterName: 'Pg Teacher', role: 'teacher' }).user;
  const target = mk('PgTarget'); q.run("UPDATE users SET display_name='=HYPERLINK(\"x\")' WHERE id=?", target.id);
  addTurns(target.id, today(), 4);
  const paths = ['/admin?tab=people', '/admin?tab=people&sort=ai&dir=asc&active=7d', '/admin?tab=newusers&range=all', `/admin?tab=users&username=${target.username}`, '/admin/stats', '/admin/users.csv', '/admin/new-users.csv'];
  for (const user of [kid, grown, teacher, null]) {
    for (const path of paths) assert.equal((await req(path, { user })).status, 404, `${path} as ${user ? user.username : 'nobody'}`);
  }
  for (const path of paths) assert.equal((await req(path, { user: admin })).status, 200, path);
  const people = await (await req('/admin?tab=people&sort=ai', { user: admin })).text();
  for (const s of ['All users', 'Last login', 'Days active', 'AI messages', 'Course steps', 'Live games', 'Plays of their games', 'Sign-ups per day', 'aria-sort="descending"', 'Never active']) assert.ok(people.includes(s), s);
  assert.match(people, new RegExp(`@${target.username}`));
  assert.doesNotMatch(people, /\$2[aby]\$/);
  const legacy = await (await req('/admin?tab=newusers', { user: admin })).text();
  assert.match(legacy, /aria-current="true">🆕 New \(30 days\)/, 'the old tab opens on the New view');
  const detail = await (await req(`/admin?tab=users&username=${target.username}`, { user: admin })).text();
  for (const s of ['📈 Activity', 'Last login', 'Plays per day', 'AI Builder messages per day', 'Days active', 'Games they play most', 'Courses', 'Recent activity', '4 AI Builder messages that day']) assert.ok(detail.includes(s), s);
  assert.doesNotMatch(detail, /\$2[aby]\$|Mozilla|127\.0\.0\.1/, 'no hashes, browsers or IPs');
  const statsPage = await (await req('/admin/stats', { user: admin })).text();
  for (const s of ['Daily active (DAU)', 'Weekly active (WAU)', 'Monthly active (MAU)', 'New this week', 'Returning this week', 'Active people', 'Most active, last 7 days', 'Most played, last 7 days', 'Builder messages', 'Games started in the Studio']) assert.ok(statsPage.includes(s), s);
  // CSV: the same filters, spreadsheet-safe, no secrets, audited.
  const res = await req(`/admin/users.csv?q=${target.username}`, { user: admin });
  assert.match(res.headers.get('content-type'), /text\/csv/); assert.match(res.headers.get('content-disposition'), /attachment; filename="oomba-users-/);
  const csv = await res.text(); const [head, line] = csv.trim().split('\r\n');
  assert.ok(head.startsWith('username,display_name,type,joined_utc'));
  for (const h of ['last_login_utc', 'last_active_utc', 'days_active_last_30', 'plays', 'different_games_played', 'games_built', 'games_public', 'ai_builder_messages', 'course_steps_done', 'live_games_joined', 'plays_of_their_games']) assert.ok(head.split(',').includes(h), h);
  assert.match(line, /'=HYPERLINK/, 'a formula is never run');
  assert.equal(line.split(',')[head.split(',').indexOf('ai_builder_messages')], '4');
  assert.doesNotMatch(csv, /\$2[aby]\$/);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.export_users' AND details LIKE ?", `%${target.username}%`));
});

test('deleting an account removes its sign-ins and active days', async () => {
  const { deleteAccount } = await import('../../server/services/account-delete.js');
  const u = mk('Del', { password: 'secret123' }); auth.startSession(fakeRes, u.id);
  assert.ok(q.get('SELECT 1 FROM sign_ins WHERE user_id=?', u.id));
  assert.equal(deleteAccount(u.id, null, { by: 'admin', parentMade: false }).ok, true);
  assert.equal(q.get('SELECT COUNT(*) n FROM sign_ins WHERE user_id=?', u.id).n, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM user_days WHERE user_id=?', u.id).n, 0);
});

test('retention: sign-ins and active days older than 400 days go', () => {
  const u = mk('Old'); const at = now();
  q.run('INSERT INTO sign_ins(user_id, at, method) VALUES (?,?,?)', u.id, at - 401 * DAY, 'password');
  q.run('INSERT INTO sign_ins(user_id, at, method) VALUES (?,?,?)', u.id, at - 10 * DAY, 'password');
  auth.noteActiveDay(u.id, at - 401 * DAY); auth.noteActiveDay(u.id, at - 10 * DAY);
  AA.retention(at);
  assert.equal(q.get('SELECT COUNT(*) n FROM sign_ins WHERE user_id=?', u.id).n, 1);
  assert.equal(q.get('SELECT COUNT(*) n FROM user_days WHERE user_id=?', u.id).n, 1);
});

// ---------------------------------------------------------------- performance
test('5,000 accounts with 60,000 plays: the table sorts and the page renders in well under a second', async tc => {
  const times = [];
  const t = now(); const N = 5000;
  const owner = mk('PerfOwner');
  const gameIds = Array.from({ length: 200 }, (_, i) => games.createGame(owner.id, { title: `Perf ${i}` }).id);
  const insU = db.prepare("INSERT INTO users(id, username, display_name, created_at, last_seen, last_login_at, friend_code) VALUES (?,?,?,?,?,?,NULL)");
  const insP = db.prepare('INSERT INTO plays(id, game_id, user_id, started_at, seconds) VALUES (?,?,?,?,30)');
  const insD = db.prepare('INSERT OR IGNORE INTO user_days(user_id, day) VALUES (?,?)');
  const insB = db.prepare('INSERT OR IGNORE INTO builder_usage(user_id, day, turns) VALUES (?,?,?)');
  const insG = db.prepare("INSERT INTO games(id, slug, owner_id, title, status, visibility, plays, created_at, updated_at) VALUES (?,?,?,?,'published','public',?,?,?)");
  db.transaction(() => {
    for (let i = 0; i < N; i++) {
      const id = `perf${i}`; const made = t - (i % 400) * DAY;
      insU.run(id, `Perf_${i}`, `Perf ${i}`, made, t - (i % 50) * DAY, i % 7 ? t - (i % 50) * DAY : 0);
      for (let k = 0; k < 12; k++) insP.run(`pp${i}_${k}`, gameIds[(i + k * 7) % gameIds.length], id, t - ((i + k) % 60) * DAY);
      for (let d = 0; d < 6; d++) insD.run(id, today(t - ((i + d * 3) % 40) * DAY));
      if (i % 3 === 0) insB.run(id, today(t - (i % 20) * DAY), 1 + (i % 9));
      if (i % 10 === 0) insG.run(`pg${i}`, `perf-game-${i}`, id, `Made ${i}`, i % 100, made, made);
    }
  })();
  for (const sort of ['joined', 'plays', 'days', 'ai', 'login', 'name']) {
    const t0 = performance.now();
    const r = AA.listUsers(AA.cleanFilters({ sort }));
    const ms = performance.now() - t0;
    assert.equal(r.rows.length, 50); assert.ok(r.total >= N);
    times.push(`${sort} ${Math.round(ms)}ms`); assert.ok(ms < 1000, `sort by ${sort}: ${Math.round(ms)} ms`);
  }
  let t0 = performance.now();
  const page = await req('/admin?tab=people&sort=plays&active=30d', { user: admin });
  assert.equal(page.status, 200); await page.text();
  assert.ok(performance.now() - t0 < 1000, `All users page: ${Math.round(performance.now() - t0)} ms`);
  t0 = performance.now();
  const stats = await req('/admin/stats', { user: admin }); assert.equal(stats.status, 200); await stats.text();
  assert.ok(performance.now() - t0 < 1500, `Stats page: ${Math.round(performance.now() - t0)} ms`);
  t0 = performance.now();
  const detail = await req('/admin?tab=users&username=Perf_42', { user: admin }); assert.equal(detail.status, 200); await detail.text();
  assert.ok(performance.now() - t0 < 1000, `User page: ${Math.round(performance.now() - t0)} ms`);
  t0 = performance.now();
  const csv = await req('/admin/users.csv?sort=plays', { user: admin }); assert.equal(csv.status, 200); assert.equal((await csv.text()).trim().split('\r\n').length, 5001, 'header + CSV_MAX rows');
  assert.ok(performance.now() - t0 < 3000, `CSV: ${Math.round(performance.now() - t0)} ms`);
  tc.diagnostic(`listUsers: ${times.join(', ')}; CSV of 5,000 rows ${Math.round(performance.now() - t0)} ms`);
});
