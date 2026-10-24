// Numbers for the admin stats page (/admin/stats). Read-only queries over the main tables plus the traffic and
// ai_usage tables. Days are UTC, like the rest of the site.
import { q, today } from '../db.js';
import * as aiBudget from './ai-budget.js';

const DAY = 86400e3;
const startOf = day => Date.parse(day + 'T00:00:00Z');
/** The last n days, oldest first, as YYYY-MM-DD. */
export function lastDays(n, end = today()) {
  const t = startOf(end);
  return Array.from({ length: n }, (_, i) => today(t - (n - 1 - i) * DAY));
}
const one = (sql, ...p) => { const r = q.get(sql, ...p); return r ? Object.values(r)[0] || 0 : 0; };
/** { day: value } from rows of { day, n }. */
const byDay = rows => Object.fromEntries(rows.map(r => [r.day, r.n || 0]));
const dayExpr = col => `strftime('%Y-%m-%d', ${col} / 1000, 'unixepoch')`;

/** The headline numbers. */
export function kpis(now = Date.now()) {
  const d = today(now), t0 = startOf(d), w0 = now - 7 * DAY, m = d.slice(0, 7);
  const traffic = (from, area = null) => one(`SELECT COALESCE(SUM(views),0) FROM traffic WHERE day>=? AND ${area ? 'area=?' : "area!='_visitors'"}`, from, ...(area ? [area] : []));
  const week = lastDays(7, d)[0];
  const ai = aiBudget.status(d);
  const tok = from => q.get('SELECT COALESCE(SUM(input+cache_read+cache_write),0) input, COALESCE(SUM(output),0) output FROM ai_usage WHERE day>=?', from);
  return {
    users: {
      accounts: one("SELECT COUNT(*) FROM users WHERE is_guest=0"),
      guests: one('SELECT COUNT(*) FROM users WHERE is_guest=1'),
      newToday: one('SELECT COUNT(*) FROM users WHERE is_guest=0 AND created_at>=?', t0),
      newWeek: one('SELECT COUNT(*) FROM users WHERE is_guest=0 AND created_at>=?', w0),
      guestsWeek: one('SELECT COUNT(*) FROM users WHERE is_guest=1 AND created_at>=?', w0),
      activeToday: one('SELECT COUNT(*) FROM users WHERE last_seen>=?', t0),
      activeWeek: one('SELECT COUNT(*) FROM users WHERE last_seen>=?', w0),
      banned: one('SELECT COUNT(*) FROM users WHERE banned=1'),
    },
    games: {
      built: one("SELECT COUNT(*) FROM games WHERE source!='seed' AND status!='deleted'"),
      live: one("SELECT COUNT(*) FROM games WHERE source!='seed' AND status='published'"),
      livePublic: one("SELECT COUNT(*) FROM games WHERE source!='seed' AND status='published' AND visibility='public'"),
      waiting: one('SELECT COUNT(*) FROM games WHERE pending_version_id IS NOT NULL'),
      launch: one("SELECT COUNT(*) FROM games WHERE source='seed' AND status='published'"),
      newToday: one("SELECT COUNT(*) FROM games WHERE source!='seed' AND created_at>=?", t0),
      newWeek: one("SELECT COUNT(*) FROM games WHERE source!='seed' AND created_at>=?", w0),
      deleted: one("SELECT COUNT(*) FROM games WHERE status='deleted'"),
    },
    plays: {
      total: one('SELECT COUNT(*) FROM plays'),
      today: one('SELECT COUNT(*) FROM plays WHERE started_at>=?', t0),
      week: one('SELECT COUNT(*) FROM plays WHERE started_at>=?', w0),
      minutesWeek: Math.round(one('SELECT COALESCE(SUM(seconds),0) FROM plays WHERE started_at>=?', w0) / 60),
      players: one('SELECT COUNT(DISTINCT user_id) FROM plays WHERE started_at>=? AND user_id IS NOT NULL', w0),
    },
    visits: {
      visitorsToday: traffic(d, '_visitors'), viewsToday: traffic(d),
      visitorsWeek: traffic(week, '_visitors'), viewsWeek: traffic(week),
    },
    ai: {
      today: ai.today, month: ai.month, daily: ai.daily, monthly: ai.monthly, callsToday: ai.todayCalls, callsMonth: ai.monthCalls, ok: ai.ok, reason: ai.reason,
      tokensToday: tok(d), tokensMonth: tok(m + '-01'),
      turnsToday: one('SELECT COALESCE(SUM(turns),0) FROM builder_usage WHERE day=?', d),
      buildersToday: one('SELECT COUNT(*) FROM builder_usage WHERE day=? AND turns>0', d),
    },
  };
}

/** Daily series for the charts: one entry per day, oldest first. */
export function daily(n = 30, end = today()) {
  const days = lastDays(n, end), from = days[0], t = startOf(from);
  const views = byDay(q.all("SELECT day, SUM(views) n FROM traffic WHERE day>=? AND area!='_visitors' GROUP BY day", from));
  const visitors = byDay(q.all("SELECT day, views n FROM traffic WHERE day>=? AND area='_visitors'", from));
  const signups = byDay(q.all(`SELECT ${dayExpr('created_at')} day, COUNT(*) n FROM users WHERE is_guest=0 AND created_at>=? GROUP BY day`, t));
  const guests = byDay(q.all(`SELECT ${dayExpr('created_at')} day, COUNT(*) n FROM users WHERE is_guest=1 AND created_at>=? GROUP BY day`, t));
  const plays = byDay(q.all(`SELECT ${dayExpr('started_at')} day, COUNT(*) n FROM plays WHERE started_at>=? GROUP BY day`, t));
  const minutes = byDay(q.all(`SELECT ${dayExpr('started_at')} day, ROUND(SUM(seconds)/60.0) n FROM plays WHERE started_at>=? GROUP BY day`, t));
  const built = byDay(q.all(`SELECT ${dayExpr('created_at')} day, COUNT(*) n FROM games WHERE source!='seed' AND created_at>=? GROUP BY day`, t));
  const turns = byDay(q.all('SELECT day, SUM(turns) n FROM builder_usage WHERE day>=? GROUP BY day', from));
  const usd = byDay(q.all('SELECT day, usd n FROM ai_spend WHERE day>=?', from));
  const calls = byDay(q.all('SELECT day, calls n FROM ai_spend WHERE day>=?', from));
  const tokIn = byDay(q.all('SELECT day, SUM(input+cache_read+cache_write) n FROM ai_usage WHERE day>=? GROUP BY day', from));
  const tokOut = byDay(q.all('SELECT day, SUM(output) n FROM ai_usage WHERE day>=? GROUP BY day', from));
  return days.map(day => ({
    day, views: views[day] || 0, visitors: visitors[day] || 0, signups: signups[day] || 0, guests: guests[day] || 0,
    plays: plays[day] || 0, minutes: minutes[day] || 0, built: built[day] || 0, turns: turns[day] || 0,
    usd: usd[day] || 0, calls: calls[day] || 0, tokensIn: tokIn[day] || 0, tokensOut: tokOut[day] || 0,
  }));
}

/** Most played games in the last `days` days (by plays started). */
export function topGames(days = 7, limit = 10, now = Date.now()) {
  return q.all(`SELECT g.id, g.slug, g.title, g.icon, g.source, u.username owner, COUNT(p.id) plays, ROUND(SUM(p.seconds)/60.0) minutes,
      COUNT(DISTINCT p.user_id) players
    FROM plays p JOIN games g ON g.id=p.game_id JOIN users u ON u.id=g.owner_id
    WHERE p.started_at>=? AND g.status!='deleted' GROUP BY g.id ORDER BY plays DESC LIMIT ?`, now - days * DAY, limit);
}
/** All-time favourites: plays, likes and ratings. */
export function topGamesAllTime(limit = 10) {
  return q.all(`SELECT g.slug, g.title, g.icon, g.source, u.username owner, g.plays, g.likes, g.rating_count,
      CASE WHEN g.rating_count>0 THEN ROUND(1.0*g.rating_sum/g.rating_count, 1) ELSE NULL END rating
    FROM games g JOIN users u ON u.id=g.owner_id WHERE g.status='published' ORDER BY g.plays DESC LIMIT ?`, limit);
}
/** Builders whose games are played most (Studio games only). */
export function topBuilders(limit = 10) {
  return q.all(`SELECT u.id, u.username, u.display_name, u.avatar, u.color, u.photo_at, COUNT(g.id) games, SUM(CASE WHEN g.status='published' THEN 1 ELSE 0 END) live,
      COALESCE(SUM(g.plays),0) plays
    FROM games g JOIN users u ON u.id=g.owner_id WHERE g.source!='seed' AND g.status!='deleted'
    GROUP BY u.id ORDER BY plays DESC, games DESC LIMIT ?`, limit);
}
/** Page views by area over the last `days` days. */
export function areas(days = 7, end = today()) {
  return q.all("SELECT area, SUM(views) views FROM traffic WHERE day>=? AND area!='_visitors' GROUP BY area ORDER BY views DESC", lastDays(days, end)[0]);
}
/** AI usage by model over the last `days` days. */
export function aiByModel(days = 30, end = today()) {
  return q.all(`SELECT model, SUM(calls) calls, SUM(input) input, SUM(output) output, SUM(cache_read) cache_read, SUM(cache_write) cache_write, SUM(usd) usd
    FROM ai_usage WHERE day>=? GROUP BY model ORDER BY usd DESC`, lastDays(days, end)[0]);
}
/** The newest accounts. */
export function newestUsers(limit = 10) {
  return q.all('SELECT id, username, display_name, avatar, color, photo_at, is_guest, created_at, last_seen FROM users WHERE is_guest=0 ORDER BY created_at DESC LIMIT ?', limit);
}
