// AI spending cap. Every Claude API call records what it cost (from the response's usage), and once today's or this
// month's total reaches the limit the site stops calling Claude until the day/month rolls over:
//   - the Builder switches to the offline mock builder and says it is resting,
//   - picture uploads are refused (they can't be safety-checked without the model),
//   - the Builder chat classifier steps aside (the word filters still run, like when no key is set),
//   - public game reviews wait for a human.
// Limits: AI_DAILY_BUDGET_USD (default 5) and AI_MONTHLY_BUDGET_USD (default 50). Days and months are UTC.
// This is the site's own guard; also set a spend limit in the Anthropic Console as the hard backstop.
import { q, today } from '../db.js';
import { config } from '../config.js';

// US dollars per million tokens (Anthropic API list prices). Cache writes (5-minute TTL) bill at 1.25x input.
export const PRICES = {
  'claude-haiku-5-5': { input: 0.10, output: 0.50, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.20 },
  'claude-sonnet-5': { input: 2, output: 10, cacheRead: 0.20 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.20 },
  'claude-opus-5': { input: 5, output: 25, cacheRead: 0.50 },
  'claude-opus-4-8': { input: 5, output: 25, cacheRead: 0.50 },
  'claude-fable-5-1': { input: 10, output: 50, cacheRead: 0.25 },
};
// A model we don't know (e.g. a fallback) is priced like the most expensive one, so the cap errs on the safe side.
const UNKNOWN = { input: 10, output: 50, cacheRead: 1 };

/** Dollars for one response's usage block. */
export function costOf(model, usage = {}) {
  const p = PRICES[String(model || '').replace(/-\d{8}$/, '')] || UNKNOWN;
  const u = usage || {};
  const usd = ((u.input_tokens || 0) * p.input
    + (u.cache_creation_input_tokens || 0) * p.input * 1.25
    + (u.cache_read_input_tokens || 0) * p.cacheRead
    + (u.output_tokens || 0) * p.output) / 1e6;
  return Number.isFinite(usd) ? usd : 0;
}

/** Record one API response. model: the model that served it (res.model) or the one requested. Returns the cost. */
export function recordUsage(model, usage, day = today()) {
  const usd = costOf(model, usage);
  q.run('INSERT INTO ai_spend(day, usd, calls) VALUES (?,?,1) ON CONFLICT(day) DO UPDATE SET usd=usd+excluded.usd, calls=calls+1', day, usd);
  return usd;
}

export function spent(day = today()) {
  const d = q.get('SELECT usd, calls FROM ai_spend WHERE day=?', day) || { usd: 0, calls: 0 };
  const m = q.get('SELECT COALESCE(SUM(usd),0) usd, COALESCE(SUM(calls),0) calls FROM ai_spend WHERE substr(day,1,7)=?', day.slice(0, 7));
  return { today: d.usd, todayCalls: d.calls, month: m.usd, monthCalls: m.calls };
}
export const limits = () => ({ daily: config.aiDailyBudgetUsd, monthly: config.aiMonthlyBudgetUsd });

/** { ok, today, month, daily, monthly, reason } — ok is false once either limit is reached. */
export function status(day = today()) {
  const s = spent(day), l = limits();
  const reason = s.today >= l.daily ? 'daily' : s.month >= l.monthly ? 'monthly' : null;
  return { ok: !reason, reason, ...s, ...l };
}
export const ok = () => status().ok;
