// All SQL for builder_turns (migration 0019): one row per Builder build, its lifecycle (runner.js) and its numbers.
// DB only: no events, no timers. status: queued | running | interrupted | done | failed | cancelled (db.js).
import { q, uid, now, tx } from '../db.js';
import { refundTurn } from './usage.js';

const LIVE = "('queued','running','interrupted')";
const parse = s => { try { return JSON.parse(s || '{}') || {}; } catch { return {}; } };
/** A row with its request parsed (request is JSON text in the table). */
const row = r => (r ? { ...r, request: parse(r.request) } : null);

export const get = id => row(q.get('SELECT * FROM builder_turns WHERE id=?', id));
/** Every unfinished build, oldest first (boot recovery). */
export const live = () => q.all(`SELECT * FROM builder_turns WHERE status IN ${LIVE} ORDER BY created_at, rowid`).map(row);
/** The unfinished build of a game, or null. */
export const liveFor = gameId => row(q.get(`SELECT * FROM builder_turns WHERE game_id=? AND status IN ${LIVE}`, gameId));
/** The game's most recently ended build, or null. */
export const lastEnded = gameId => row(q.get(`SELECT * FROM builder_turns WHERE game_id=? AND status NOT IN ${LIVE} ORDER BY ended_at DESC, created_at DESC, rowid DESC LIMIT 1`, gameId));
/** Whether the game has a build newer than this one (any status). */
export const hasNewer = (gameId, r) => !!q.get('SELECT 1 FROM builder_turns WHERE game_id=? AND id!=? AND (created_at>? OR (created_at=? AND rowid>(SELECT rowid FROM builder_turns WHERE id=?)))', gameId, r.id, r.created_at, r.created_at, r.id);

/** Insert a row. Throws when the game already has an unfinished build (unique index builder_turns_one_live). */
export function create({ id = uid(16), gameId, userId, status = 'queued', request = {}, locale = 'en', pro = false, chain = 0, attempt = 0, chargedDay = null, provider = '', baseVersion = null, startedAt = null }) {
  q.run('INSERT INTO builder_turns(id, game_id, user_id, status, request, locale, pro, chain, attempt, charged_day, provider, base_version, created_at, started_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    id, gameId, userId, status, JSON.stringify(request || {}), locale, pro ? 1 : 0, chain, attempt, chargedDay, provider, baseVersion, now(), startedAt);
  return get(id);
}
/** Screened and charged: the provider starts (the same transaction as the charge and the user entry, agent.js).
 *  chargedTo / weight: the allowance source that paid and the turns it used (usage.takeTurn). From here the row's
 *  cost is measured (usd_known). */
export function markRunning(id, { chargedDay, provider, attempt = 1, baseVersion = null, startedAt = now(), chargedTo = 'free', weight = 1 }) {
  q.run("UPDATE builder_turns SET status='running', charged_day=?, provider=?, attempt=?, base_version=?, started_at=?, charged_to=?, weight=?, usd_known=1 WHERE id=?",
    chargedDay, provider, attempt, baseVersion, startedAt, chargedTo, weight, id);
}
/** One more go at this row, written before it runs, so a crash during the run still counts (runner.recover). */
export const bump = id => q.run('UPDATE builder_turns SET attempt=attempt+1 WHERE id=?', id);
/** A resumed attempt starts: running again, one attempt more, on the provider that runs it now. */
export const resumeRow = (id, provider) => q.run("UPDATE builder_turns SET status='running', attempt=attempt+1, provider=? WHERE id=?", provider, id);
/** Handed off at shutdown: decided at the next boot. */
export function interrupt(id, { durationMs = 0, modelCalls = 0, versions = 0, usd = 0 } = {}) {
  q.run("UPDATE builder_turns SET status='interrupted', end_reason='restart', duration_ms=?, model_calls=model_calls+?, versions=?, usd=usd+? WHERE id=?", durationMs, modelCalls, versions, usd || 0, id);
}
/** The build ended. model_calls and usd (what this attempt's model calls cost) add up over attempts (a resume gets the
 *  rounds that are left). */
export function finish(id, { status, end, versions = 0, modelCalls = 0, tokensIn = 0, tokensOut = 0, durationMs = 0, canContinue = 0, usd = 0 }) {
  q.run('UPDATE builder_turns SET status=?, end_reason=?, versions=?, model_calls=model_calls+?, tokens_in=tokens_in+?, tokens_out=tokens_out+?, duration_ms=?, can_continue=?, usd=usd+?, ended_at=? WHERE id=?',
    status, end, versions, modelCalls, tokensIn, tokensOut, durationMs, canContinue ? 1 : 0, usd || 0, now(), id);
}
export const setContinue = (id, on) => q.run('UPDATE builder_turns SET can_continue=? WHERE id=?', on ? 1 : 0, id);
/** Give the build's turns back, once (idempotent; the day and the weight it was charged with, to the source that paid:
 *  only 'free' exists today). -> true when it gave them back now. */
export function refund(id) {
  return tx(() => {
    const r = q.get('SELECT user_id, charged_day, refunded, weight FROM builder_turns WHERE id=?', id);
    if (!r || r.refunded || !r.charged_day) return false;
    refundTurn(r.user_id, r.charged_day, r.weight);
    q.run('UPDATE builder_turns SET refunded=1 WHERE id=?', id);
    return true;
  });
}
/** The newest version number of a game (NULL when it has none): a build's base_version. */
export const newestVersion = gameId => q.get('SELECT MAX(number) n FROM game_versions WHERE game_id=?', gameId).n ?? null;
/** Versions saved since base (all when base is NULL), oldest first. */
export const versionsSince = (gameId, base) => q.all('SELECT id, number, notes, safety_status FROM game_versions WHERE game_id=? AND number>? ORDER BY number', gameId, base ?? 0);

// ---- What the owner's lists say (/build, the Me page) and the one-time "ready" note (views/layout.js).
const WEEK = 7 * 86400e3;
// The newest build of each game (a newer build replaces what an older one said).
const NEWEST = 't.rowid = (SELECT t2.rowid FROM builder_turns t2 WHERE t2.game_id = t.game_id ORDER BY t2.created_at DESC, t2.rowid DESC LIMIT 1)';
/** How a build ended, for the owner: 'building' | 'stopped' (time cap, or a restart it couldn't carry on from, even when
 *  versions were saved: it didn't finish) | 'ready' (finished with a new version) | 'question' (finished without one) |
 *  null (refused, no turns left, cancelled, or an error: nothing to tell). First match wins. */
export function statusOf(r) {
  if (['queued', 'running', 'interrupted'].includes(r.status)) return 'building';
  if (r.status === 'failed' && r.can_continue) return 'stopped';
  if (r.status === 'done' && r.end_reason === 'ok') return r.versions > 0 ? 'ready' : 'question';
  return null;
}
/** The owner's games with news: Map gameId -> 'building' | 'stopped' | 'ready' | 'question'. Builds an admin runs in the
 *  owner's game count too (the game is joined on its owner). An ended build stays news for 7 days, until the owner sees
 *  it (markSeen). */
export function buildStatus(ownerId, t = now()) {
  const rows = q.all(`SELECT t.game_id, t.status, t.end_reason, t.versions, t.can_continue FROM builder_turns t JOIN games g ON g.id = t.game_id
    WHERE g.owner_id = ? AND g.status != 'deleted' AND ${NEWEST} AND (t.status IN ${LIVE} OR (t.ended_at >= ? AND t.seen_at IS NULL))`, ownerId, t - WEEK);
  const out = new Map();
  for (const r of rows) { const st = statusOf(r); if (st) out.set(r.game_id, st); }
  return out;
}
/** The owner saw how the game's builds ended (opened its Studio, or watched one end on a live stream). */
export const markSeen = gameId => q.run('UPDATE builder_turns SET seen_at=? WHERE game_id=? AND seen_at IS NULL AND ended_at IS NOT NULL', now(), gameId);
/** The one-time note: builds the owner sent themselves (an admin's test build never tells the child) that ended with
 *  news in the last 7 days, not seen and not told yet. -> [{ id, gameId, title, kind: 'ready'|'question'|'stopped' }] */
export function notices(userId, t = now()) {
  return q.all(`SELECT t.id, t.game_id, t.status, t.end_reason, t.versions, t.can_continue, g.title FROM builder_turns t JOIN games g ON g.id = t.game_id
    WHERE t.user_id = ? AND g.owner_id = t.user_id AND g.status != 'deleted' AND t.notified_at IS NULL AND t.seen_at IS NULL AND t.ended_at >= ? AND ${NEWEST}
    ORDER BY t.ended_at DESC LIMIT 20`, userId, t - WEEK)
    .map(r => ({ id: r.id, gameId: r.game_id, title: r.title, kind: statusOf(r) })).filter(r => r.kind && r.kind !== 'building');
}
/** The note was shown (on this page view only). */
export function markNotified(ids) {
  if (!ids.length) return;
  const t = now(); tx(() => { for (const id of ids) q.run('UPDATE builder_turns SET notified_at=? WHERE id=? AND notified_at IS NULL', t, id); });
}

/** Retention (a scheduled job, runner.startRunner): the message text goes 7 days after the end, the row after 35. */
export function forget(t = now()) {
  q.run("UPDATE builder_turns SET request='{}' WHERE ended_at IS NOT NULL AND ended_at<? AND request!='{}'", t - 7 * 86400e3);
  q.run('DELETE FROM builder_turns WHERE ended_at IS NOT NULL AND ended_at<?', t - 35 * 86400e3);
}
