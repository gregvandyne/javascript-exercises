// Speech to text use, kept in SQLite so the caps survive a restart or deploy: clips and counted seconds per UTC day and
// builder (the per-builder daily cap), and their sum (the site-wide daily minutes cap, STT_DAILY_MINUTES). Never audio
// or words. Rows older than 3 days go. The cost goes into the AI spending caps (ai-budget recordSpend).
import { q, today } from '../db.js';
import { config } from '../config.js';
import { register } from './jobs.js';
import * as aiBudget from './ai-budget.js';

/** Clips this builder sent today. */
export const clipsToday = (userId, day = today()) => (q.get('SELECT clips FROM stt_usage WHERE day=? AND user_id=?', day, userId) || { clips: 0 }).clips;
/** Minutes of speech to text the whole site used today. */
export const minutesToday = (day = today()) => q.get('SELECT COALESCE(SUM(seconds),0) AS s FROM stt_usage WHERE day=?', day).s / 60;
/** Why a builder can't send a clip now: 'daily' (their cap), 'site' (the site-wide minutes or the AI spending cap), or null. */
export function blocked(userId, pool = 'free') {
  if (clipsToday(userId) >= config.sttDailyClips) return 'daily';
  return siteBlocked(pool);
}
/** The site-wide caps alone (the minutes a day, the AI spending): 'site' or null. A live session's fallback upload,
 *  whose clip was already counted against the builder's own cap, still has to pass these. */
export function siteBlocked(pool = 'free') {
  if (minutesToday() >= config.sttDailyMinutes) return 'site';
  if (!aiBudget.ok(pool)) return 'site';
  return null;
}
/** Count one clip that is about to go to the service: its seconds, and its cost in the AI spend. */
export function record(userId, seconds, provider, pool = 'free', day = today()) {
  const s = Math.max(0, +seconds || 0);
  q.run('INSERT INTO stt_usage(day, user_id, clips, seconds) VALUES (?,?,1,?) ON CONFLICT(day, user_id) DO UPDATE SET clips=clips+1, seconds=seconds+excluded.seconds', day, userId, s);
  return aiBudget.recordSpend(`stt:${provider || 'unknown'}`, (s / 60) * config.sttUsdPerMinute, pool, day);
}
/** Seconds that went to the service without a new clip: a live session's audio, counted once when it ends (its clip
 *  was counted, at 0 seconds, when it opened), or a fallback upload after a live session failed (the same audio went to
 *  the service again, so its seconds are real). */
export function addSeconds(userId, seconds, provider, pool = 'free', day = today()) {
  const s = Math.max(0, +seconds || 0);
  if (!s) return 0;
  q.run('INSERT INTO stt_usage(day, user_id, clips, seconds) VALUES (?,?,0,?) ON CONFLICT(day, user_id) DO UPDATE SET seconds=seconds+excluded.seconds', day, userId, s);
  return aiBudget.recordSpend(`stt:${provider || 'unknown'}`, (s / 60) * config.sttUsdPerMinute, pool, day);
}
export function forget(day = today()) {
  const cut = new Date(Date.parse(day + 'T00:00:00Z') - 3 * 864e5).toISOString().slice(0, 10);
  return q.run('DELETE FROM stt_usage WHERE day < ?', cut).changes;
}
register('stt-usage-retention', 864e5, () => forget(), { firstAfterMs: 11 * 60e3 });
