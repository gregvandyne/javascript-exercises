// Daily Builder turn limit per user (builder_usage table). One user message to the Builder = one turn ("Pro quality"
// messages use PRO_TURN_WEIGHT turns, 1 by default).
// Messages refused by screening do not use a turn (the endpoint is rate-limited separately), and a build that ended
// badly for a server-side reason without saving anything gives its turns back (turns.refund, runner.js).
// allowanceFor(user) is the one place that says how many messages a user gets and who pays for them: every limit check
// and every "{count} messages" reads it (docs/decisions.md "Paid plans" §3.1).
//   free     everyone: BUILDER_DAILY_TURNS a UTC day, paid by the free AI pool.
//   family   a confirmed child of a family with a plan: the same free daily messages first; beyond them, or while the
//            free AI pool rests, the family's extra messages (FAMILY_EXTRA_MESSAGES a UTC month, shared by its children,
//            Pro weight counted), paid by the paid pool. Limits (disclosed on /grown-ups): FAMILY_CHILD_DAILY_MAX extra
//            messages per child per day, and FAMILY_MONTHLY_AI_USD of AI cost per family per month.
//   school   (chunk 5) an entitled school's students and staff build from the school's pool.
// builder_turns.charged_to records who paid each message; a refund gives it back to the same source (turns.refund).
import { q, today } from '../db.js';
import { config } from '../config.js';
import * as aiBudget from '../services/ai-budget.js';
import { ownerPlan } from '../services/billing.js';
import { resting } from './anthropic.js';

export const dailyTurns = () => Math.max(0, config.builderDailyTurns | 0);
/** Turns one message uses: PRO_TURN_WEIGHT for "Pro quality", else 1. */
export const weightOf = pro => (pro ? Math.max(1, config.proTurnWeight | 0) : 1);
const idOf = user => (user && typeof user === 'object' ? user.id : user);
/** The first and last calendar day of day's UTC month ('YYYY-MM-01', 'YYYY-MM-31': days are compared as text). */
const monthRange = day => [day.slice(0, 8) + '01', day.slice(0, 8) + '31'];

/** The family whose plan pays a child's extra messages: the child's confirmed (linked) family, when it has a plan
 *  (billing off: never). -> family id or null. */
export function familyOf(userId) {
  if (!userId) return null;
  const r = q.get("SELECT family_id FROM family_children WHERE child_id=? AND status='linked' AND unlinked_at IS NULL", userId);
  return r && ownerPlan('family', r.family_id).entitled ? r.family_id : null;
}
/** A family's extra messages this UTC month: { used (turns, Pro weight counted, refunds given back), usd (what their AI
 *  calls cost, refunded builds included: those calls were paid) }. beforeDay: only up to the end of the day before
 *  (the grown-up's page never shows today, so it can't tell when a child is building). */
export function familyMonth(familyId, day = today(), { beforeDay = false } = {}) {
  const [from, to] = monthRange(day);
  const r = q.get(`SELECT COALESCE(SUM(CASE WHEN refunded=0 THEN weight ELSE 0 END), 0) used, COALESCE(SUM(usd), 0) usd FROM builder_turns
    WHERE charged_to=? AND charged_day BETWEEN ? AND ? AND charged_day < ?`, `family:${familyId}`, from, to, beforeDay ? day : '9999');
  return { used: r.used, usd: r.usd };
}
/** Extra messages of one family a child used on one UTC day. */
const childExtrasOn = (userId, familyId, day) => q.get('SELECT COALESCE(SUM(weight), 0) n FROM builder_turns WHERE user_id=? AND charged_to=? AND charged_day=? AND refunded=0',
  userId, `family:${familyId}`, day).n;

/**
 * What a user may send to the Builder today and who pays. user: a user row or a user id.
 * -> { source, pool, daily, proWeight, left, freeLeft, familyId, extraLeft, extraToday }
 *    source: what the next message is charged to (builder_turns.charged_to): 'free' | 'family:<id>' (later 'school:<id>').
 *    pool: the AI money pool that pays its model calls ('free' | 'paid', services/ai-budget.js).
 *    daily: free messages per UTC day (the "{count}" of the free limit). proWeight: turns one Pro message uses.
 *    left: messages that can still be sent today (free and extra). freeLeft: free messages left today.
 *    familyId: the paying family (null when none). extraLeft: the family's extra messages left this month as this child
 *    may use them (null when no family pays); extraToday: how many of them this child can still use today.
 */
export function allowanceFor(user, day = today()) {
  const id = idOf(user), daily = dailyTurns(), proWeight = weightOf(true);
  const used = id ? turnsUsed(id, day) : 0;
  const fam = familyOf(id);
  if (!fam) {
    const left = Math.max(0, daily - used);
    return { source: 'free', pool: 'free', daily, proWeight, left, freeLeft: left, familyId: null, extraLeft: null, extraToday: 0 };
  }
  const month = familyMonth(fam, day), mine = childExtrasOn(id, fam, day);
  // The $ backstop and the paid pool's ceiling stop the extras (the child then has the free messages, like anyone).
  const usable = month.usd < config.familyMonthlyAiUsd && aiBudget.ok('paid');
  const extraLeft = usable ? Math.max(0, config.familyExtraMessages - month.used) : 0;
  const extraToday = Math.min(extraLeft, Math.max(0, config.familyChildDailyMax - mine));
  const freeLeft = Math.max(0, daily - (used - mine));
  // The free daily messages come first; extras after them, or while the free pool rests.
  const viaFamily = extraToday > 0 && (freeLeft <= 0 || resting('free'));
  return { source: viaFamily ? `family:${fam}` : 'free', pool: viaFamily ? 'paid' : 'free', daily, proWeight, left: freeLeft + extraToday, freeLeft, familyId: fam, extraLeft, extraToday };
}
/** The Builder's "no messages left" words for this user: with a family plan, no number (they used more than the free
 *  ones, and a child is never told about plans). */
export function limitMessage(user, t) {
  const a = allowanceFor(user);
  return a.familyId ? t('builder.errors.limitToday') : t('builder.errors.limit', { count: a.daily });
}
/** The Studio counter's numbers: { turnsLeft, freeLeft, extraLeft }. */
export function counter(user) {
  const a = allowanceFor(user);
  return { turnsLeft: a.left, freeLeft: a.freeLeft, extraLeft: a.extraLeft };
}

export function turnsUsed(user, day = today()) {
  const r = q.get('SELECT turns FROM builder_usage WHERE user_id=? AND day=?', idOf(user), day);
  return r ? r.turns : 0;
}
export const turnsLeft = (user, day = today()) => allowanceFor(user, day).left;
/** Use a message's turns. -> false (and nothing recorded) when no message is left today, else { source, pool, weight }.
 *  A message is taken while any turn is left; a Pro message may then use the last ones and count past the cap (the
 *  count shown never goes below 0). Runs inside the charge transaction (agent.js), so the family's month is read and
 *  charged at once. */
export function takeTurn(user, day = today(), { pro = false } = {}) {
  const a = allowanceFor(user, day);
  if (a.left <= 0) return false;
  const weight = weightOf(pro);
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,?) ON CONFLICT(user_id, day) DO UPDATE SET turns=turns+excluded.turns', idOf(user), day, weight);
  return { source: a.source, pool: a.pool, weight };
}
/** Give back a message's turns (a build that ended badly for a server-side reason without saving anything). Never below 0. */
export function refundTurn(userId, day, weight = 1) {
  if (day) q.run('UPDATE builder_usage SET turns=MAX(0, turns-?) WHERE user_id=? AND day=?', Math.max(1, weight | 0), userId, day);
}
