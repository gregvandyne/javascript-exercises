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
//            The Basic plan is the same for one child: BASIC_EXTRA_MESSAGES a month and BASIC_MONTHLY_AI_USD, for the
//            family's first linked child only (a Family plan switched to Basic keeps its links; the others use the free
//            messages, and /family says so).
//   school   an active student or staff member of a school with a plan whose pool has messages left: every message
//            comes from the school's pool (paid AI pool), up to the school's daily cap per person (never below the free
//            daily messages), so they never "rest" with free users. With the pool empty: the free messages, never the
//            family's extras (no family money in class).
// Class contexts (an active student of any school, or anyone building from a school's pool) see only "{left} left
// today", never a total, and their limit message names the class: children in a class are never compared by plan.
// builder_turns.charged_to records who paid each message; a refund gives it back to the same source (turns.refund).
import { q, today } from '../db.js';
import { config } from '../config.js';
import * as aiBudget from '../services/ai-budget.js';
import { ownerPlan, planLimits } from '../services/billing.js';
import { schoolSide } from '../services/school-billing.js';
import { resting } from './anthropic.js';

export const dailyTurns = () => Math.max(0, config.builderDailyTurns | 0);
/** Turns one message uses: PRO_TURN_WEIGHT for "Pro quality", else 1. */
export const weightOf = pro => (pro ? Math.max(1, config.proTurnWeight | 0) : 1);
const idOf = user => (user && typeof user === 'object' ? user.id : user);
/** The first and last calendar day of day's UTC month ('YYYY-MM-01', 'YYYY-MM-31': days are compared as text). */
const monthRange = day => [day.slice(0, 8) + '01', day.slice(0, 8) + '31'];

/** The linked children a family's plan covers, first linked first: all of them (up to the plan's maxChildren) for a
 *  Family plan, only the first linked child for Basic. -> [child id] */
export function coveredChildren(familyId, plan) {
  const max = planLimits(plan).maxChildren;
  return q.all("SELECT child_id FROM family_children WHERE family_id=? AND status='linked' AND unlinked_at IS NULL ORDER BY linked_at, requested_at, child_id", familyId)
    .slice(0, max).map(r => r.child_id);
}
/** The family whose plan pays a child's extra messages: the child's confirmed (linked) family, when it has a plan that
 *  covers this child (billing off: never). -> family id or null.
 *  Never for a member of a school with a plan (docs/decisions.md "Paid plans" §3.1, §4.3): they build from the school's
 *  pool, and family money is never used in class. A family child in a school without a plan keeps the family's extras,
 *  but as a class context sees only "{left} left today" (no "+N extra" counter). */
export function familyOf(userId, side = null) {
  if (!userId) return null;
  if ((side || schoolSide(userId)).entitled) return null;
  const r = q.get("SELECT family_id FROM family_children WHERE child_id=? AND status='linked' AND unlinked_at IS NULL", userId);
  if (!r) return null;
  const p = ownerPlan('family', r.family_id);
  return p.entitled && coveredChildren(r.family_id, p.plan).includes(userId) ? r.family_id : null;
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
 * -> { source, pool, daily, proWeight, left, freeLeft, familyId, extraLeft, extraToday, schoolId, classContext }
 *    source: what the next message is charged to (builder_turns.charged_to): 'free' | 'family:<id>' | 'school:<id>'.
 *    pool: the AI money pool that pays its model calls ('free' | 'paid', services/ai-budget.js).
 *    daily: messages per UTC day (the free ones; a school's daily cap for school-paid users). proWeight: turns one Pro
 *    message uses.
 *    left: messages that can still be sent today (free and extra). freeLeft: free messages left today.
 *    familyId: the paying family (null when none). extraLeft: the family's extra messages left this month as this child
 *    may use them (null when no family pays, and in class contexts); extraToday: how many of them this child can still
 *    use today.
 *    schoolId: the school whose pool pays (null when none). classContext: show "{left} left today" only (no totals).
 */
export function allowanceFor(user, day = today()) {
  const id = idOf(user), daily = dailyTurns(), proWeight = weightOf(true);
  const used = id ? turnsUsed(id, day) : 0;
  const side = schoolSide(id);
  const classContext = side.student || !!side.school;
  // 1. A school with a plan pays every message (its pool and the paid AI pool permitting), up to its daily cap.
  if (side.school && aiBudget.ok('paid')) {
    const cap = side.school.cap;
    const left = Math.min(Math.max(0, cap - used), side.school.pool.left);
    return { source: `school:${side.school.id}`, pool: 'paid', daily: cap, proWeight, left, freeLeft: left, familyId: null, extraLeft: null, extraToday: 0, schoolId: side.school.id, classContext: true };
  }
  const fam = familyOf(id, side);
  if (!fam) {
    const left = Math.max(0, daily - used);
    return { source: 'free', pool: 'free', daily, proWeight, left, freeLeft: left, familyId: null, extraLeft: null, extraToday: 0, schoolId: null, classContext };
  }
  const month = familyMonth(fam, day), mine = childExtrasOn(id, fam, day);
  const lim = planLimits(ownerPlan('family', fam).plan);
  // The $ backstop and the paid pool's ceiling stop the extras (the child then has the free messages, like anyone).
  const usable = month.usd < lim.aiUsd && aiBudget.ok('paid');
  const extraLeft = usable ? Math.max(0, lim.extra - month.used) : 0;
  const extraToday = Math.min(extraLeft, Math.max(0, config.familyChildDailyMax - mine));
  const freeLeft = Math.max(0, daily - (used - mine));
  // The free daily messages come first; extras after them, or while the free pool rests.
  const viaFamily = extraToday > 0 && (freeLeft <= 0 || resting('free'));
  const left = freeLeft + extraToday;
  // In a class context the extras are not shown apart (only "{left} left today").
  return { source: viaFamily ? `family:${fam}` : 'free', pool: viaFamily ? 'paid' : 'free', daily, proWeight, left, freeLeft: classContext ? left : freeLeft, familyId: fam, extraLeft: classContext ? null : extraLeft, extraToday, schoolId: null, classContext };
}
/** The Builder's "no messages left" words for an allowance: [key, vars]. A class context names the class and no number;
 *  with a family plan, no number either (they used more than the free ones, and a child is never told about plans). */
export function limitKey(a) {
  if (a.classContext) return ['builder.errors.limitClass'];
  if (a.familyId) return ['builder.errors.limitToday'];
  return ['builder.errors.limit', { count: a.daily }];
}
export function limitMessage(user, t) {
  const [key, vars] = limitKey(allowanceFor(user));
  return vars ? t(key, vars) : t(key);
}
/** The Studio counter's numbers: { turnsLeft, freeLeft, extraLeft, classContext }. */
export function counter(user) {
  const a = allowanceFor(user);
  return { turnsLeft: a.left, freeLeft: a.freeLeft, extraLeft: a.extraLeft, classContext: a.classContext };
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
