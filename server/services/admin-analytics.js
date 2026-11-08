// User analytics for the platform admin (docs/decisions.md "Admin: user analytics"): the All users table (every real
// account with what it did, sortable and filterable), one person's activity on the Users tab, and the site's active
// people on /admin/stats. Read-only: counts, dates and game titles. Never a password, token, session, IP, browser,
// email, chat text or Builder request text. Guests (one-tap throwaway players) and the official account are left out.
//
// Where each number comes from:
// - last login: users.last_login_at (set at every sign-in, auth.startSession; sessions themselves are deleted on sign-out)
// - last active: users.last_seen (any signed-in request, at most once a minute)
// - days active: user_days (one row per account per UTC day it was used)
// - games played: plays (one row per game started; distinct games = different games)
// - games built / public / plays of their games: games (not deleted; games.plays is the game's play counter)
// - AI Builder messages: builder_usage (messages charged per day; a refunded build is given back)
// - course steps: course_progress (a step is done when its slides were read, its check passed and, for a step with a
//   game, the game reported its chapter won: services/courses.js isComplete)
// - live games joined: live_run_scores (one row per Oomba Live game a signed-in player was scored in; a game with no
//   class is kept 90 days); hosted: live_runs.host_id
import { q, now, today } from '../db.js';
import { OFFICIAL } from '../auth.js';
import { TYPE_SQL, METHOD_SQL, TYPES, TYPE_LABEL, METHOD_LABEL, rangeStart, likeEsc, cell, iso, CSV_MAX } from './admin-users.js';
import { COURSES, bandsFor, steps, getBand, overview } from './courses.js';
import { register } from './jobs.js';

const DAY = 86400e3;
export const PER_PAGE = 50;
/** How long sign-ins and active days are kept. */
export const KEEP_DAYS = 400;

export const ACTIVE = { '': 'Any time', '1d': 'Active in the last day', '7d': 'Active in the last 7 days', '30d': 'Active in the last 30 days', idle: 'Not active for 30 days', never: 'Never active' };
export const JOINED = { all: 'Any time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' };
/** Sort keys: [SQL, default direction, label]. Every column of the table sorts. */
export const SORTS = {
  name: ['u.username COLLATE NOCASE', 'asc', 'Name'],
  type: ['type', 'asc', 'Type'],
  joined: ['u.created_at', 'desc', 'Joined'],
  login: ['u.last_login_at', 'desc', 'Last login'],
  active: ['active_sort', 'desc', 'Last active'],
  days: ['days30', 'desc', 'Days active (30 days)'],
  plays: ['plays', 'desc', 'Plays'],
  distinct: ['distinct_games', 'desc', 'Different games played'],
  built: ['games_made', 'desc', 'Games built'],
  public: ['games_public', 'desc', 'Public games'],
  ai: ['ai_messages', 'desc', 'AI Builder messages'],
  courses: ['course_steps', 'desc', 'Course steps done'],
  live: ['live_joined', 'desc', 'Live games joined'],
  popularity: ['plays_of_games', 'desc', 'Plays of their games'],
  status: ['u.banned', 'desc', 'Status'],
};
/** Quick views (the chips over the table): each sets these filters, the rest stay at their defaults. */
export const QUICK = {
  new: { label: '🆕 New (30 days)', set: { joined: '30d', sort: 'joined', dir: 'desc' } },
  today: { label: '🟢 Active today', set: { active: '1d', sort: 'active', dir: 'desc' } },
  week: { label: '📅 Active this week', set: { active: '7d', sort: 'days', dir: 'desc' } },
  never: { label: '💤 Never active', set: { active: 'never', sort: 'joined', dir: 'desc' } },
  players: { label: '🎮 Top players', set: { sort: 'plays', dir: 'desc' } },
  builders: { label: '🛠️ Top builders', set: { sort: 'built', dir: 'desc' } },
  ai: { label: '🤖 Most AI messages', set: { sort: 'ai', dir: 'desc' } },
};
export const SIGN_IN_LABEL = { password: 'Signed in with a password', google: 'Signed in with Google', switch: 'Switched in by their grown-up', signup: 'Signed up', '': 'Signed in' };
export const COURSE_NAME = { 'cs-quest': 'CS Quest', 'cyber-defenders': 'Cyber Defenders', 'number-quest': 'Number Quest' };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const okDate = s => (DATE.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z')) ? String(s) : '');
/** Clean filters from a query string (unknown values fall back to the defaults). */
export function cleanFilters(qs = {}) {
  const sort = Object.hasOwn(SORTS, qs.sort) ? qs.sort : 'joined';
  return {
    type: TYPES.includes(qs.type) ? qs.type : '',
    active: Object.hasOwn(ACTIVE, qs.active) ? qs.active : '',
    joined: Object.hasOwn(JOINED, qs.joined) ? qs.joined : 'all',
    from: okDate(qs.from), to: okDate(qs.to),
    search: String(qs.q || '').trim().slice(0, 40),
    sort, dir: qs.dir === 'asc' || qs.dir === 'desc' ? qs.dir : SORTS[sort][1],
    page: Math.max(1, parseInt(qs.page, 10) || 1),
  };
}
export const DEFAULTS = Object.freeze(cleanFilters({}));
/** Is this quick view the one showing (its filters set, everything else at the default)? */
export const quickOn = (f, key) => Object.keys(DEFAULTS).filter(k => k !== 'page').every(k => f[k] === (k in QUICK[key].set ? QUICK[key].set[k] : DEFAULTS[k]));

// A deleted (account-delete.js) or merged (schools.js) account is a tombstone: never listed.
const NOT_REMOVED = "NOT (u.banned=1 AND u.password_hash IS NULL AND (u.username LIKE 'deleted\\_%' ESCAPE '\\' OR u.username LIKE 'merged\\_%' ESCAPE '\\'))";
// Never active: never signed in and no day of use (an account a grown-up or school made that nobody has used yet).
const NEVER_SQL = '(u.last_login_at=0 AND NOT EXISTS (SELECT 1 FROM user_days d WHERE d.user_id=u.id))';

function where(f, at) {
  const parts = ['u.is_guest=0', 'u.username<>?', NOT_REMOVED]; const params = [OFFICIAL];
  if (f.type) { parts.push(`(${TYPE_SQL})=?`); params.push(f.type); }
  if (f.active === 'never') parts.push(NEVER_SQL);
  else if (f.active === 'idle') { parts.push(`NOT ${NEVER_SQL} AND u.last_seen<?`); params.push(at - 30 * DAY); }
  else if (f.active) { parts.push(`NOT ${NEVER_SQL} AND u.last_seen>=?`); params.push(at - parseInt(f.active, 10) * DAY); }
  if (f.from || f.to) {
    if (f.from) { parts.push('u.created_at>=?'); params.push(Date.parse(f.from + 'T00:00:00Z')); }
    if (f.to) { parts.push('u.created_at<?'); params.push(Date.parse(f.to + 'T00:00:00Z') + DAY); }
  } else if (f.joined !== 'all') { parts.push('u.created_at>=?'); params.push(rangeStart(f.joined, at)); }
  if (f.search) { parts.push("(u.username LIKE ? ESCAPE '\\' OR u.display_name LIKE ? ESCAPE '\\')"); params.push(likeEsc(f.search), likeEsc(f.search)); }
  return { sql: parts.join(' AND '), params };
}

// Course steps that have a game (they are done only once the game reported its chapter won). Read once from the decks.
let gameStepKeys = null;
function gameSteps() {
  if (gameStepKeys) return gameStepKeys;
  const keys = [];
  try { for (const c of COURSES) for (const b of bandsFor(c)) for (const s of steps(c, b)) if (s.game) keys.push(`${c.slug}|${s.key}`); } catch { /* no decks: read + check counts */ }
  return (gameStepKeys = JSON.stringify(keys));
}
const STEP_DONE = "c.read_at IS NOT NULL AND c.checked_at IS NOT NULL AND (c.completed_at IS NOT NULL OR (c.course || '|' || c.step) NOT IN (SELECT value FROM json_each(?)))";

/** One page of accounts with their numbers. filters: cleanFilters() output. -> { rows, total, page, pages, perPage } */
export function listUsers(filters = DEFAULTS, { perPage = PER_PAGE, at = now() } = {}) {
  const f = { ...DEFAULTS, ...filters };
  const w = where(f, at);
  const total = q.get(`SELECT COUNT(*) n FROM users u WHERE ${w.sql}`, ...w.params).n;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, parseInt(f.page, 10) || 1));
  const [col] = SORTS[f.sort] || SORTS.joined;
  const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
  // Pre-grouped once per table (each an index scan), then joined to the page's accounts.
  const rows = q.all(`WITH
      pl AS (SELECT user_id, COUNT(*) n, COUNT(DISTINCT game_id) g FROM plays WHERE user_id IS NOT NULL GROUP BY user_id),
      gm AS (SELECT owner_id, COUNT(*) made, SUM(status='published' AND visibility='public') pub, SUM(pending_version_id IS NOT NULL) waiting,
        COALESCE(SUM(plays), 0) pop FROM games WHERE status<>'deleted' GROUP BY owner_id),
      bu AS (SELECT user_id, SUM(turns) n FROM builder_usage GROUP BY user_id),
      ad AS (SELECT user_id, COUNT(*) n FROM user_days WHERE day>=? GROUP BY user_id),
      cp AS (SELECT c.user_id, COUNT(*) n FROM course_progress c WHERE ${STEP_DONE} GROUP BY c.user_id),
      lr AS (SELECT user_id, COUNT(*) n FROM live_run_scores GROUP BY user_id)
    SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, u.created_at, u.last_seen, u.last_login_at, u.banned,
      ${TYPE_SQL} AS type, ${METHOD_SQL} AS method, ${NEVER_SQL} AS never_active,
      CASE WHEN ${NEVER_SQL} THEN 0 ELSE u.last_seen END AS active_sort,
      COALESCE(ad.n, 0) days30, COALESCE(pl.n, 0) plays, COALESCE(pl.g, 0) distinct_games,
      COALESCE(gm.made, 0) games_made, COALESCE(gm.pub, 0) games_public, COALESCE(gm.waiting, 0) games_waiting, COALESCE(gm.pop, 0) plays_of_games,
      COALESCE(bu.n, 0) ai_messages, COALESCE(cp.n, 0) course_steps, COALESCE(lr.n, 0) live_joined
    FROM users u LEFT JOIN pl ON pl.user_id=u.id LEFT JOIN gm ON gm.owner_id=u.id LEFT JOIN bu ON bu.user_id=u.id
      LEFT JOIN ad ON ad.user_id=u.id LEFT JOIN cp ON cp.user_id=u.id LEFT JOIN lr ON lr.user_id=u.id
    WHERE ${w.sql} ORDER BY ${col} ${dir}, u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`,
  today(at - 29 * DAY), gameSteps(), ...w.params, perPage, (page - 1) * perPage);
  const links = linked(rows.map(r => r.id));
  return { rows: rows.map(r => ({ ...r, ...links(r.id), banned: !!r.banned, never_active: !!r.never_active, status: r.banned ? 'suspended' : 'active' })), total, page, pages, perPage };
}
/** Who looks after the listed accounts (only for the rows shown): a kid's linked grown-up, a grown-up's number of
 *  linked children, and the schools someone is an active member of. -> id => { parent, children, schools } */
function linked(ids) {
  const j = JSON.stringify(ids);
  const parent = new Map(q.all(`SELECT fc.child_id id, MIN(f.username) v FROM family_children fc JOIN families fa ON fa.id=fc.family_id JOIN users f ON f.id=fa.owner_id
    WHERE fc.status='linked' AND fc.unlinked_at IS NULL AND fc.child_id IN (SELECT value FROM json_each(?)) GROUP BY fc.child_id`, j).map(r => [r.id, r.v]));
  const children = new Map(q.all(`SELECT fa.owner_id id, COUNT(*) v FROM families fa JOIN family_children fc ON fc.family_id=fa.id
    WHERE fc.status='linked' AND fc.unlinked_at IS NULL AND fa.owner_id IN (SELECT value FROM json_each(?)) GROUP BY fa.owner_id`, j).map(r => [r.id, r.v]));
  const schools = new Map(q.all(`SELECT id, GROUP_CONCAT(name, ', ') v FROM (SELECT DISTINCT sm.user_id id, s.name FROM school_members sm JOIN schools s ON s.id=sm.school_id
    WHERE sm.status='active' AND sm.user_id IN (SELECT value FROM json_each(?)) ORDER BY s.name) GROUP BY id`, j).map(r => [r.id, r.v]));
  return id => ({ parent: parent.get(id) || null, children: children.get(id) || 0, schools: schools.get(id) || '' });
}

/** The table as CSV (same filters and order, every page, at most CSV_MAX rows). Spreadsheet-safe cells (admin-users.js). */
export function usersCsv(filters = DEFAULTS, { at = now() } = {}) {
  const { rows } = listUsers({ ...filters, page: 1 }, { perPage: CSV_MAX, at });
  const head = ['username', 'display_name', 'type', 'joined_utc', 'signed_up_by', 'grown_up', 'children', 'schools', 'last_login_utc', 'last_active_utc', 'days_active_last_30', 'plays', 'different_games_played',
    'games_built', 'games_public', 'games_waiting', 'ai_builder_messages', 'course_steps_done', 'live_games_joined', 'plays_of_their_games', 'status'];
  const lines = rows.map(r => [r.username, r.display_name, TYPE_LABEL[r.type], iso(r.created_at), METHOD_LABEL[r.method], r.parent || '', r.type === 'grownup' ? r.children : '', r.schools,
    iso(r.last_login_at), r.never_active ? '' : iso(r.last_seen), r.days30, r.plays, r.distinct_games,
    r.games_made, r.games_public, r.games_waiting, r.ai_messages, r.course_steps, r.live_joined, r.plays_of_games, r.status].map(cell).join(','));
  return [head.join(','), ...lines].join('\r\n') + '\r\n';
}

const startOfDay = d => Date.parse(d + 'T00:00:00Z');
/** The last n UTC days, oldest first. */
const lastDays = (n, at) => Array.from({ length: n }, (_, i) => today(startOfDay(today(at)) - (n - 1 - i) * DAY));
const mapOf = rows => new Map(rows.map(r => [r.day, r.n]));

/** One person's activity for the Users tab. -> null for an unknown id. */
export function userAnalytics(userId, at = now()) {
  const u = q.get('SELECT * FROM users WHERE id=?', userId);
  if (!u) return null;
  const days = lastDays(30, at); const from = startOfDay(days[0]);
  const plays = mapOf(q.all("SELECT strftime('%Y-%m-%d', started_at / 1000, 'unixepoch') day, COUNT(*) n FROM plays WHERE user_id=? AND started_at>=? GROUP BY day", u.id, from));
  const ai = mapOf(q.all('SELECT day, turns n FROM builder_usage WHERE user_id=? AND day>=?', u.id, days[0]));
  const active = new Set(q.all('SELECT day FROM user_days WHERE user_id=? AND day>=?', u.id, days[0]).map(r => r.day));
  const daily = days.map(day => ({ day, plays: plays.get(day) || 0, ai: ai.get(day) || 0, active: active.has(day) ? 1 : 0 }));
  const p = q.get('SELECT COUNT(*) n, COUNT(DISTINCT game_id) g, COALESCE(SUM(seconds), 0) s FROM plays WHERE user_id=?', u.id);
  const g = q.get(`SELECT COUNT(*) made, COALESCE(SUM(status='published'), 0) live, COALESCE(SUM(status='published' AND visibility='public'), 0) pub,
    COALESCE(SUM(pending_version_id IS NOT NULL), 0) waiting, COALESCE(SUM(plays), 0) pop FROM games WHERE owner_id=? AND status<>'deleted'`, u.id);
  const never = !u.last_login_at && !q.get('SELECT 1 FROM user_days WHERE user_id=? LIMIT 1', u.id);
  const totals = {
    plays: p.n, distinctGames: p.g, minutes: Math.round(p.s / 60),
    built: g.made, live: g.live, public: g.pub, waiting: g.waiting, playsOfGames: g.pop,
    ai: q.get('SELECT COALESCE(SUM(turns), 0) n FROM builder_usage WHERE user_id=?', u.id).n,
    ai30: daily.reduce((a, d) => a + d.ai, 0), plays30: daily.reduce((a, d) => a + d.plays, 0),
    days30: active.size, daysAll: q.get('SELECT COUNT(*) n FROM user_days WHERE user_id=?', u.id).n,
    signIns30: q.get('SELECT COUNT(*) n FROM sign_ins WHERE user_id=? AND at>=?', u.id, at - 30 * DAY).n,
    liveJoined: q.get('SELECT COUNT(*) n FROM live_run_scores WHERE user_id=?', u.id).n,
    liveHosted: q.get('SELECT COUNT(*) n FROM live_runs WHERE host_id=?', u.id).n,
    courseSteps: q.get(`SELECT COUNT(*) n FROM course_progress c WHERE c.user_id=? AND ${STEP_DONE}`, u.id, gameSteps()).n,
  };
  const lastSignIn = q.get('SELECT method FROM sign_ins WHERE user_id=? ORDER BY at DESC LIMIT 1', u.id);
  const topPlayed = q.all(`SELECT g.id, g.slug, g.title, g.icon, g.status, COUNT(*) plays, MAX(p.started_at) last, ROUND(SUM(p.seconds) / 60.0) minutes
    FROM plays p JOIN games g ON g.id=p.game_id WHERE p.user_id=? GROUP BY g.id ORDER BY plays DESC, last DESC LIMIT 5`, u.id);
  return {
    lastLogin: u.last_login_at || 0, lastLoginMethod: lastSignIn ? lastSignIn.method : null, lastSeen: never ? 0 : u.last_seen, never,
    joined: u.created_at, method: (q.get(`SELECT ${METHOD_SQL} m FROM users u WHERE u.id=?`, u.id) || {}).m || 'self',
    daily, totals, topPlayed, courses: courseSummary(u), timeline: timeline(u, at),
  };
}

/** Each course the person started: band, steps done of the band's steps, steps touched, last activity. */
export function courseSummary(u) {
  const out = [];
  for (const c of COURSES) {
    const r = q.get('SELECT COUNT(*) n, MAX(MAX(COALESCE(read_at, 0), COALESCE(checked_at, 0), COALESCE(completed_at, 0), COALESCE(played_at, 0))) last FROM course_progress WHERE user_id=? AND course=?', u.id, c.slug);
    if (!r.n) continue;
    let band = null;
    try { band = getBand(u, c); } catch { band = null; }
    if (!band) band = (q.get('SELECT band, COUNT(*) n FROM course_progress WHERE user_id=? AND course=? GROUP BY band ORDER BY n DESC LIMIT 1', u.id, c.slug) || {}).band || null;
    let done = null, total = null;
    try { const ov = overview(u, c, band); done = ov.done; total = ov.total; } catch { /* decks missing */ }
    if (done === null) done = q.get(`SELECT COUNT(*) n FROM course_progress c WHERE c.user_id=? AND c.course=? AND ${STEP_DONE}`, u.id, c.slug, gameSteps()).n;
    out.push({ slug: c.slug, emoji: c.emoji, name: COURSE_NAME[c.slug] || c.slug, band, done, total, touched: r.n, last: r.last || 0 });
  }
  return out;
}

/** Recent activity, newest first: sign-ins, games started and published, plays, Builder messages per day, course steps,
 *  live games. Titles and counts only (no chat, no Builder requests, no IPs). */
export function timeline(u, at = now(), limit = 30) {
  const ev = [{ at: u.created_at, kind: 'joined', text: 'Account created' }];
  for (const r of q.all('SELECT at, method FROM sign_ins WHERE user_id=? ORDER BY at DESC LIMIT 15', u.id)) ev.push({ at: r.at, kind: 'signin', text: SIGN_IN_LABEL[r.method] || SIGN_IN_LABEL[''] });
  for (const r of q.all("SELECT slug, title, icon, created_at, published_at, status FROM games WHERE owner_id=? AND status<>'deleted' ORDER BY created_at DESC LIMIT 10", u.id)) {
    ev.push({ at: r.created_at, kind: 'built', text: 'Started a game', game: r });
    if (r.published_at) ev.push({ at: r.published_at, kind: 'published', text: 'Published a game', game: r });
  }
  for (const r of q.all('SELECT p.started_at, p.seconds, g.slug, g.title, g.icon FROM plays p JOIN games g ON g.id=p.game_id WHERE p.user_id=? ORDER BY p.started_at DESC LIMIT 15', u.id)) {
    ev.push({ at: r.started_at, kind: 'played', text: r.seconds >= 60 ? `Played for ${Math.round(r.seconds / 60)} min` : 'Played', game: r });
  }
  for (const r of q.all('SELECT day, turns FROM builder_usage WHERE user_id=? AND turns>0 ORDER BY day DESC LIMIT 10', u.id)) {
    ev.push({ at: Math.min(at, startOfDay(r.day) + DAY - 1), day: r.day, kind: 'ai', text: `${r.turns} AI Builder message${r.turns === 1 ? '' : 's'} that day` });
  }
  for (const r of q.all('SELECT course, step, checked_at, completed_at FROM course_progress WHERE user_id=? AND (checked_at>1 OR completed_at>1) ORDER BY MAX(COALESCE(checked_at, 0), COALESCE(completed_at, 0)) DESC LIMIT 10', u.id)) {
    const name = COURSE_NAME[r.course] || r.course;
    if (r.completed_at > 1) ev.push({ at: r.completed_at, kind: 'course', text: `${name}: won the game of step ${r.step}` });
    if (r.checked_at > 1) ev.push({ at: r.checked_at, kind: 'course', text: `${name}: passed the check of step ${r.step}` });
  }
  for (const r of q.all('SELECT r.started_at, r.title FROM live_run_scores s JOIN live_runs r ON r.id=s.run_id WHERE s.user_id=? ORDER BY r.started_at DESC LIMIT 10', u.id)) {
    ev.push({ at: r.started_at, kind: 'live', text: r.title ? `Joined a live game: ${r.title}` : 'Joined a live game' });
  }
  return ev.sort((a, b) => b.at - a.at).slice(0, limit);
}

// ---- The site's active people (/admin/stats).
const REAL = 'JOIN users u ON u.id=ud.user_id WHERE u.is_guest=0 AND u.username<>?';
/** DAU / WAU / MAU (distinct accounts used today, in the last 7 and 30 UTC days), the week before, and this week's
 *  active people split into new (joined in these 7 days) and returning. */
export function activeCounts(at = now()) {
  const d = today(at), d7 = today(at - 6 * DAY), d30 = today(at - 29 * DAY), p7 = today(at - 13 * DAY);
  const n = (from, to = d) => q.get(`SELECT COUNT(DISTINCT ud.user_id) n FROM user_days ud ${REAL} AND ud.day>=? AND ud.day<=?`, OFFICIAL, from, to).n;
  const w0 = startOfDay(d7);
  const split = q.get(`SELECT COALESCE(SUM(u.created_at>=?), 0) fresh, COALESCE(SUM(u.created_at<?), 0) back
    FROM (SELECT DISTINCT user_id FROM user_days WHERE day>=?) ud ${REAL}`, w0, w0, d7, OFFICIAL);
  const dau = n(d), wau = n(d7), mau = n(d30);
  return { dau, wau, mau, wauBefore: n(p7, today(at - 7 * DAY)), newThisWeek: split.fresh, returningThisWeek: split.back, stickiness: mau ? Math.round(dau / mau * 100) : 0 };
}
/** Active accounts per UTC day, oldest first (zeros included). */
export function activeByDay(n = 30, at = now()) {
  const days = lastDays(n, at);
  const got = mapOf(q.all(`SELECT ud.day, COUNT(*) n FROM user_days ud ${REAL} AND ud.day>=? GROUP BY ud.day`, OFFICIAL, days[0]));
  return days.map(day => ({ day, active: got.get(day) || 0 }));
}
/** The most active people of the last `days` days: days active, then plays and Builder messages. */
export function mostActive(days = 7, limit = 10, at = now()) {
  const d0 = today(at - (days - 1) * DAY), t0 = startOfDay(d0);
  return q.all(`WITH a AS (SELECT user_id, COUNT(*) days FROM user_days WHERE day>=? GROUP BY user_id),
      p AS (SELECT user_id, COUNT(*) n FROM plays WHERE started_at>=? AND user_id IS NOT NULL GROUP BY user_id),
      b AS (SELECT user_id, SUM(turns) n FROM builder_usage WHERE day>=? GROUP BY user_id)
    SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, ${TYPE_SQL} AS type, a.days, COALESCE(p.n, 0) plays, COALESCE(b.n, 0) ai
    FROM a JOIN users u ON u.id=a.user_id LEFT JOIN p ON p.user_id=u.id LEFT JOIN b ON b.user_id=u.id
    WHERE u.is_guest=0 AND u.username<>? ORDER BY a.days DESC, COALESCE(p.n, 0) + COALESCE(b.n, 0) DESC, u.username LIMIT ?`, d0, t0, d0, OFFICIAL, limit);
}

/** Sign-ins and active days older than KEEP_DAYS go (daily). */
export function retention(at = now()) {
  q.run('DELETE FROM sign_ins WHERE at<?', at - KEEP_DAYS * DAY);
  q.run('DELETE FROM user_days WHERE day<?', today(at - KEEP_DAYS * DAY));
}
register('analytics-retention', DAY, () => retention(), { firstAfterMs: 17 * 60e3 });
