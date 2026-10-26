// AI spending cap. Every Claude API call records what it cost (from the response's usage), and once today's or this
// month's total reaches the limit the site stops calling Claude until the day/month rolls over:
//   - the Builder switches to the offline mock builder and says it is resting,
//   - picture uploads are refused (they can't be safety-checked without the model),
//   - the Builder chat classifier steps aside (the word filters still run, like when no key is set),
//   - public game reviews wait for a human.
// Limits: AI_DAILY_BUDGET_USD (default 5) and AI_MONTHLY_BUDGET_USD (default 150). Days and months are UTC.
// This is the site's own guard; also set a spend limit in the Anthropic Console as the hard backstop.
// Two money pools (docs/decisions.md "Paid plans" §3.3): 'free' (everything above, and free Builder messages) and 'paid'
// (family extra messages, with its own computed monthly ceiling), so the free pool resting never stops someone who
// paid. A site-wide hard ceiling (AI_HARD_MONTHLY_USD) stops both.
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

export const POOLS = ['free', 'paid'];
/** Record one API response. model: the model that served it (res.model) or the one requested. pool: the money pool
 *  that pays ('free' for everything today; paid plans add 'paid'). Returns the cost. */
export function recordUsage(model, usage, day = today(), pool = 'free') {
  const usd = costOf(model, usage);
  q.run('INSERT INTO ai_spend(day, usd, calls) VALUES (?,?,1) ON CONFLICT(day) DO UPDATE SET usd=usd+excluded.usd, calls=calls+1', day, usd);
  q.run('INSERT INTO ai_spend_pool(day, pool, usd, calls) VALUES (?,?,?,1) ON CONFLICT(day, pool) DO UPDATE SET usd=usd+excluded.usd, calls=calls+1',
    day, POOLS.includes(pool) ? pool : 'free', usd);
  // Token counts per model, for the admin stats page.
  const u = usage || {}, m = String(model || 'unknown').replace(/-\d{8}$/, '').slice(0, 60);
  q.run(`INSERT INTO ai_usage(day, model, calls, input, output, cache_read, cache_write, usd) VALUES (?,?,1,?,?,?,?,?)
    ON CONFLICT(day, model) DO UPDATE SET calls=calls+1, input=input+excluded.input, output=output+excluded.output,
    cache_read=cache_read+excluded.cache_read, cache_write=cache_write+excluded.cache_write, usd=usd+excluded.usd`,
  day, m, u.input_tokens || 0, u.output_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, usd);
  return usd;
}

export function spent(day = today()) {
  const d = q.get('SELECT usd, calls FROM ai_spend WHERE day=?', day) || { usd: 0, calls: 0 };
  const m = q.get('SELECT COALESCE(SUM(usd),0) usd, COALESCE(SUM(calls),0) calls FROM ai_spend WHERE substr(day,1,7)=?', day.slice(0, 7));
  return { today: d.usd, todayCalls: d.calls, month: m.usd, monthCalls: m.calls };
}
/** What the paid pool spent today and this month. */
export function paidSpent(day = today()) {
  const d = q.get("SELECT usd, calls FROM ai_spend_pool WHERE day=? AND pool='paid'", day) || { usd: 0, calls: 0 };
  const m = q.get("SELECT COALESCE(SUM(usd),0) usd, COALESCE(SUM(calls),0) calls FROM ai_spend_pool WHERE pool='paid' AND substr(day,1,7)=?", day.slice(0, 7));
  return { today: d.usd, todayCalls: d.calls, month: m.usd, monthCalls: m.calls };
}
/** The free pool's spend: the site total minus what the paid pool spent (so it equals the total while nobody pays). */
export function freeSpent(day = today()) {
  const all = spent(day), paid = paidSpent(day);
  return { today: Math.max(0, all.today - paid.today), todayCalls: Math.max(0, all.todayCalls - paid.todayCalls), month: Math.max(0, all.month - paid.month), monthCalls: Math.max(0, all.monthCalls - paid.monthCalls) };
}

// The paid pool's monthly ceiling is computed from who pays (docs/decisions.md "Paid plans" §3.2): each paying owner
// kind registers how many US dollars a month it adds (families: entitled families x FAMILY_MONTHLY_AI_USD).
const paidSources = new Map();
export function registerPaidBudget(name, fn) { paidSources.set(name, fn); }
/** The paid pool's ceiling this month: the registered sources, capped by AI_PAID_MONTHLY_BUDGET_USD when set. */
export function paidMonthly() {
  let usd = 0;
  for (const fn of paidSources.values()) { try { usd += Math.max(0, +fn() || 0); } catch { /* a source that can't count adds nothing */ } }
  return config.aiPaidMonthlyBudgetUsd != null ? Math.min(usd, config.aiPaidMonthlyBudgetUsd) : usd;
}
/** The site-wide guard that stops every AI call: AI_HARD_MONTHLY_USD, else the free and paid monthly budgets together. */
export const hardMonthly = () => (config.aiHardMonthlyUsd != null ? config.aiHardMonthlyUsd : config.aiMonthlyBudgetUsd + paidMonthly());
export const limits = () => ({ daily: config.aiDailyBudgetUsd, monthly: config.aiMonthlyBudgetUsd });

/**
 * One money pool's state: { ok, reason, pool, today, month, daily, monthly, hard } — ok is false once a limit is
 * reached. 'free' (screening, uploads, reviews, free Builder messages): AI_DAILY_BUDGET_USD and AI_MONTHLY_BUDGET_USD
 * against the free pool's own spend. 'paid' (family extra messages): its computed monthly ceiling, no daily one. Both
 * stop at the site-wide hard ceiling (reason 'hard').
 */
export function status(day = today(), pool = 'free') {
  const all = spent(day), hard = hardMonthly();
  if (pool === 'paid') {
    const p = paidSpent(day), monthly = paidMonthly();
    const reason = all.month >= hard ? 'hard' : p.month >= monthly ? 'monthly' : null;
    return { ok: !reason, reason, pool, ...p, daily: null, monthly, hard };
  }
  const f = freeSpent(day), l = limits();
  const reason = f.today >= l.daily ? 'daily' : f.month >= l.monthly ? 'monthly' : all.month >= hard ? 'hard' : null;
  return { ok: !reason, reason, pool: 'free', ...f, ...l, hard };
}
export const ok = (pool = 'free') => status(undefined, pool).ok;
/** When the AI is back for a pool (ms): the next UTC midnight for the daily limit, the 1st of next month (UTC) for a
 *  monthly one, or null while the budget isn't spent. */
export function resetsAt(now = Date.now(), pool = 'free') {
  const s = status(new Date(now).toISOString().slice(0, 10), pool); if (s.ok) return null;
  const d = new Date(now);
  return s.reason === 'daily' ? Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) : Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
