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
/** Screened and charged: the provider starts (the same transaction as the charge and the user entry, agent.js). */
export function markRunning(id, { chargedDay, provider, attempt = 1, baseVersion = null, startedAt = now() }) {
  q.run("UPDATE builder_turns SET status='running', charged_day=?, provider=?, attempt=?, base_version=?, started_at=? WHERE id=?", chargedDay, provider, attempt, baseVersion, startedAt, id);
}
/** One more go at this row, written before it runs, so a crash during the run still counts (runner.recover). */
export const bump = id => q.run('UPDATE builder_turns SET attempt=attempt+1 WHERE id=?', id);
/** A resumed attempt starts: running again, one attempt more, on the provider that runs it now. */
export const resumeRow = (id, provider) => q.run("UPDATE builder_turns SET status='running', attempt=attempt+1, provider=? WHERE id=?", provider, id);
/** Handed off at shutdown: decided at the next boot. */
export function interrupt(id, { durationMs = 0, modelCalls = 0, versions = 0 } = {}) {
  q.run("UPDATE builder_turns SET status='interrupted', end_reason='restart', duration_ms=?, model_calls=model_calls+?, versions=? WHERE id=?", durationMs, modelCalls, versions, id);
}
/** The build ended. model_calls adds up over attempts (a resume gets the rounds that are left). */
export function finish(id, { status, end, versions = 0, modelCalls = 0, tokensIn = 0, tokensOut = 0, durationMs = 0, canContinue = 0 }) {
  q.run('UPDATE builder_turns SET status=?, end_reason=?, versions=?, model_calls=model_calls+?, tokens_in=tokens_in+?, tokens_out=tokens_out+?, duration_ms=?, can_continue=?, ended_at=? WHERE id=?',
    status, end, versions, modelCalls, tokensIn, tokensOut, durationMs, canContinue ? 1 : 0, now(), id);
}
export const setContinue = (id, on) => q.run('UPDATE builder_turns SET can_continue=? WHERE id=?', on ? 1 : 0, id);
/** Give the build's turn back, once (idempotent; uses the day it was charged to). -> true when it gave one back now. */
export function refund(id) {
  return tx(() => {
    const r = q.get('SELECT user_id, charged_day, refunded FROM builder_turns WHERE id=?', id);
    if (!r || r.refunded || !r.charged_day) return false;
    refundTurn(r.user_id, r.charged_day);
    q.run('UPDATE builder_turns SET refunded=1 WHERE id=?', id);
    return true;
  });
}
/** The newest version number of a game (NULL when it has none): a build's base_version. */
export const newestVersion = gameId => q.get('SELECT MAX(number) n FROM game_versions WHERE game_id=?', gameId).n ?? null;
/** Versions saved since base (all when base is NULL), oldest first. */
export const versionsSince = (gameId, base) => q.all('SELECT id, number, notes, safety_status FROM game_versions WHERE game_id=? AND number>? ORDER BY number', gameId, base ?? 0);

/** Retention (a scheduled job, runner.startRunner): the message text goes 7 days after the end, the row after 35. */
export function forget(t = now()) {
  q.run("UPDATE builder_turns SET request='{}' WHERE ended_at IS NOT NULL AND ended_at<? AND request!='{}'", t - 7 * 86400e3);
  q.run('DELETE FROM builder_turns WHERE ended_at IS NOT NULL AND ended_at<?', t - 35 * 86400e3);
}
