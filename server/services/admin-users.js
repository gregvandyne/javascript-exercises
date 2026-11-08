// Shared pieces of the admin's user pages (docs/decisions.md "Admin: New users", "Admin: user analytics"): account type
// and sign-up method as SQL, sign-up counts, the CSV helpers, and the per-user detail on the Users tab. The All users list
// itself is services/admin-analytics.js. Never a password, token, email, IP or session; for a child only the username,
// display name, the grown-up or school they belong to, and counts. Guests and the official account are left out.
import { q, now, today } from '../db.js';
import { OFFICIAL } from '../auth.js';

export const TYPES = ['kid', 'grownup', 'teacher', 'staff', 'admin'];
export const RANGES = { today: null, '7d': 7, '30d': 30, all: 0 };
export const METHODS = ['self', 'family', 'school', 'google'];
export const TYPE_LABEL = { kid: 'Kid', grownup: 'Grown-up', teacher: 'Teacher', staff: 'School staff', admin: 'Platform admin' };
export const METHOD_LABEL = { self: 'Signed up', family: 'Made by a grown-up', school: 'School account', google: 'Google' };

// Account type as one SQL expression (the same order as auth.accountKind: grown-up, platform admin, school staff, kid).
export const TYPE_SQL = `CASE WHEN u.account_type='grownup' THEN 'grownup' WHEN u.role='admin' THEN 'admin'
  WHEN EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=u.id AND sm.status='active' AND sm.role='admin') THEN 'staff'
  WHEN EXISTS (SELECT 1 FROM school_members sm WHERE sm.user_id=u.id AND sm.status='active' AND sm.role='teacher') THEN 'teacher'
  ELSE 'kid' END`;
export const METHOD_SQL = `CASE WHEN u.made_by IS NOT NULL THEN 'family' WHEN u.managed_school<>'' THEN 'school'
  WHEN EXISTS (SELECT 1 FROM google_identities gi WHERE gi.user_id=u.id) THEN 'google' ELSE 'self' END`;

/** Start of the range in ms ('today' = since midnight UTC; 'all' = 0). */
export function rangeStart(range, at = now()) {
  if (range === 'today') return Date.parse(today(at) + 'T00:00:00Z');
  const days = RANGES[range];
  return days ? at - days * 86400e3 : 0;
}
export const likeEsc = s => `%${String(s).replace(/[\\%_]/g, c => '\\' + c)}%`;

/** Real accounts made per UTC day for the last `days` days (oldest first, zeros included). */
export function signupsByDay(days = 30, at = now()) {
  const start = Date.parse(today(at) + 'T00:00:00Z') - (days - 1) * 86400e3;
  const got = new Map(q.all(`SELECT strftime('%Y-%m-%d', created_at / 1000, 'unixepoch') AS day, COUNT(*) n FROM users
    WHERE is_guest=0 AND username<>? AND created_at>=? GROUP BY day`, OFFICIAL, start).map(r => [r.day, r.n]));
  return Array.from({ length: days }, (_, i) => { const day = today(start + i * 86400e3); return { day, n: got.get(day) || 0 }; });
}
/** Headline counts for the tiles: today, last 7 days, last 30 days (real accounts) and by type in the last 30 days. */
export function signupCounts(at = now()) {
  const n = from => q.get('SELECT COUNT(*) n FROM users WHERE is_guest=0 AND username<>? AND created_at>=?', OFFICIAL, from).n;
  const byType = Object.fromEntries(TYPES.map(k => [k, 0]));
  for (const r of q.all(`SELECT ${TYPE_SQL} AS type, COUNT(*) n FROM users u WHERE u.is_guest=0 AND u.username<>? AND u.created_at>=? GROUP BY type`, OFFICIAL, at - 30 * 86400e3)) byType[r.type] = r.n;
  return { today: n(rangeStart('today', at)), week: n(at - 7 * 86400e3), month: n(at - 30 * 86400e3), byType };
}

// ---- CSV helpers (services/admin-analytics.js usersCsv). A cell that starts with = + - @ is prefixed with ' so a spreadsheet never runs it.
export const cell = v => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const iso = t => (t ? new Date(t).toISOString() : '');
export const CSV_MAX = 5000;

// ---- The per-user detail (Users tab): their games, report counts and audit entries.
export function userGames(userId, limit = 30) {
  return q.all(`SELECT g.id, g.slug, g.title, g.icon, g.cover, g.status, g.visibility, g.plays, g.pending_version_id, g.pending_visibility, g.hidden_reason, g.updated_at,
      (SELECT COUNT(*) FROM reports r WHERE r.game_id=g.id) AS reports
    FROM games g WHERE g.owner_id=? AND g.status<>'deleted' ORDER BY g.updated_at DESC LIMIT ?`, userId, limit);
}
export const reportCounts = userId => ({
  againstGames: q.get('SELECT COUNT(*) n FROM reports r JOIN games g ON g.id=r.game_id WHERE g.owner_id=?', userId).n,
  made: q.get('SELECT COUNT(*) n FROM reports WHERE user_id=?', userId).n,
  chatAgainst: q.get('SELECT COUNT(*) n FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id WHERE m.from_id=?', userId).n,
});
export const userAudit = (userId, limit = 25) => q.all(`SELECT a.action, a.target, a.details, a.created_at, u.username AS actor_name FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
  WHERE a.actor_id=? OR a.target=? ORDER BY a.created_at DESC LIMIT ?`, userId, userId, limit);
export const signupMethod = userId => (q.get(`SELECT ${METHOD_SQL} AS m FROM users u WHERE u.id=?`, userId) || {}).m || 'self';
export const accountTypeOf = userId => (q.get(`SELECT ${TYPE_SQL} AS t FROM users u WHERE u.id=?`, userId) || {}).t || 'kid';
