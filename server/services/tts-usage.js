// AI voice use per UTC day, site-wide (never per person: no user id, address or text is stored): provider calls,
// characters sent, cache hits and failures. The daily character cap (TTS_DAILY_CHARS) and the AI spending caps
// (ai-budget) stop new audio; cached audio still plays. Rows older than 90 days go.
import { q, today } from '../db.js';
import { config } from '../config.js';
import { register } from './jobs.js';
import * as aiBudget from './ai-budget.js';

const row = (day = today()) => q.get('SELECT calls, chars, hits, fails FROM tts_usage WHERE day=?', day) || { calls: 0, chars: 0, hits: 0, fails: 0 };
export const todayUse = (day = today()) => row(day);
/** Characters sent to the provider today. */
export const charsToday = (day = today()) => row(day).chars;
/** Why no new audio may be made now: 'site' (the daily characters or the AI spending cap) or null. */
export function blocked(extraChars = 0) {
  if (charsToday() + Math.max(0, +extraChars || 0) > config.ttsDailyChars) return 'site';
  if (!aiBudget.ok('free')) return 'site';
  return null;
}
/** The estimated cost of chars characters (US dollars). */
export const usdFor = chars => (Math.max(0, +chars || 0) / 1000) * config.ttsUsdPer1kChars;
/** Count one provider call and put its cost in the AI spend ('tts:<provider>' on the admin stats page). -> usd */
export function record(chars, provider, day = today()) {
  const c = Math.max(0, Math.floor(+chars || 0));
  q.run('INSERT INTO tts_usage(day, calls, chars) VALUES (?,1,?) ON CONFLICT(day) DO UPDATE SET calls=calls+1, chars=chars+excluded.chars', day, c);
  return aiBudget.recordSpend(`tts:${provider || 'unknown'}`, usdFor(c), 'free', day);
}
export const hit = (day = today()) => { q.run('INSERT INTO tts_usage(day, hits) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET hits=hits+1', day); };
export const fail = (day = today()) => { q.run('INSERT INTO tts_usage(day, fails) VALUES (?,1) ON CONFLICT(day) DO UPDATE SET fails=fails+1', day); };
export function forget(day = today()) {
  const cut = new Date(Date.parse(day + 'T00:00:00Z') - 90 * 864e5).toISOString().slice(0, 10);
  return q.run('DELETE FROM tts_usage WHERE day < ?', cut).changes;
}
register('tts-usage-retention', 864e5, () => forget(), { firstAfterMs: 17 * 60e3 });
