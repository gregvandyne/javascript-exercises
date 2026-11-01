// AI voice use per UTC day, site-wide (never per person: no user id, address or text is stored): provider calls,
// characters sent, cache hits and failures. The daily character cap (TTS_DAILY_CHARS) and the AI spending caps
// (ai-budget) stop new audio; cached audio still plays. Rows older than 90 days go.
import crypto from 'node:crypto';
import { q, today } from '../db.js';
import { config } from '../config.js';
import { register } from './jobs.js';
import * as aiBudget from './ai-budget.js';

const row = (day = today()) => q.get('SELECT calls, chars, hits, fails FROM tts_usage WHERE day=?', day) || { calls: 0, chars: 0, hits: 0, fails: 0 };
export const todayUse = (day = today()) => row(day);
/** Characters sent to the provider today. */
export const charsToday = (day = today()) => row(day).chars;
/** TTS's own share of the free AI budget: at most this part of AI_DAILY_BUDGET_USD a day (when TTS_DAILY_CHARS is unset). */
export const BUDGET_SHARE = 0.2;
/** New audio stops once the free pool has spent this part of its daily or monthly budget (the Builder, picture checks and
 *  reviews keep the rest). */
export const POOL_STOP = 0.8;
/** The daily character cap: TTS_DAILY_CHARS, else BUDGET_SHARE of the daily AI budget at the price per 1k characters. */
export function dailyCap(cfg = config) {
  if (cfg.ttsDailyChars != null) return cfg.ttsDailyChars;
  const per = cfg.ttsUsdPer1kChars > 0 ? cfg.ttsUsdPer1kChars : 0.015;
  return Math.max(1000, Math.floor((cfg.aiDailyBudgetUsd * BUDGET_SHARE / per) * 1000));
}
/** Why no new audio may be made now: 'site' (the daily characters, or the free AI pool past POOL_STOP) or null. */
export function blocked(extraChars = 0) {
  if (charsToday() + Math.max(0, +extraChars || 0) > dailyCap()) return 'site';
  const b = aiBudget.status(undefined, 'free');
  if (!b.ok || b.today >= b.daily * POOL_STOP || b.month >= b.monthly * POOL_STOP) return 'site';
  return null;
}

// ---- per person and per address: new characters today, in memory only, keyed by a salted hash (never the raw id) ----
const SALT = crypto.randomBytes(16);
const quotaUse = new Map(); let quotaDay = '';
const qkey = id => crypto.createHmac('sha256', SALT).update(String(id)).digest('base64url').slice(0, 22);
/**
 * May these ids (e.g. ['u:<user id>', 'ip:<address>']) have chars more new characters today? limits: the cap for each id,
 * in the same order. Counts them when allowed. -> true | false
 */
export function takeQuota(ids, limits, chars, day = today()) {
  if (day !== quotaDay) { quotaUse.clear(); quotaDay = day; }
  const n = Math.max(0, Math.floor(+chars || 0)), keys = ids.map(qkey);
  if (keys.some((k, i) => (quotaUse.get(k) || 0) + n > limits[i])) return false;
  keys.forEach(k => quotaUse.set(k, (quotaUse.get(k) || 0) + n));
  return true;
}
export const _resetQuota = () => { quotaUse.clear(); quotaDay = ''; };
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
