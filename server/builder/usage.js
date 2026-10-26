// Daily Builder turn limit per user (builder_usage table). One user message to the Builder = one turn ("Pro quality"
// messages use PRO_TURN_WEIGHT turns, 1 by default).
// Messages refused by screening do not use a turn (the endpoint is rate-limited separately), and a build that ended
// badly for a server-side reason without saving anything gives its turns back (turns.refund, runner.js).
// allowanceFor(user) is the one place that says how many messages a user gets and who pays for them: every limit check
// and every "{count} messages" reads it. Today everyone is on the free allowance; family and school plans add their
// sources here (docs/decisions.md "Paid plans").
import { q, today } from '../db.js';
import { config } from '../config.js';

export const dailyTurns = () => Math.max(0, config.builderDailyTurns | 0);
/** Turns one message uses: PRO_TURN_WEIGHT for "Pro quality", else 1. */
export const weightOf = pro => (pro ? Math.max(1, config.proTurnWeight | 0) : 1);
const idOf = user => (user && typeof user === 'object' ? user.id : user);

/**
 * What a user may send to the Builder today and who pays. user: a user row or a user id.
 * -> { source, pool, daily, proWeight }
 *    source: what the turns are charged to (builder_turns.charged_to): 'free' today, later 'family:<id>' | 'school:<id>'.
 *    pool: the AI money pool that pays the model calls ('free' | 'paid', services/ai-budget.js).
 *    daily: turns per UTC day. proWeight: turns one Pro message uses.
 */
// The sources that depend on who the user is (family, school) plug in here.
export function allowanceFor(user) {
  return { source: 'free', pool: 'free', daily: dailyTurns(), proWeight: weightOf(true) };
}

export function turnsUsed(user, day = today()) {
  const r = q.get('SELECT turns FROM builder_usage WHERE user_id=? AND day=?', idOf(user), day);
  return r ? r.turns : 0;
}
export const turnsLeft = (user, day = today()) => Math.max(0, allowanceFor(user).daily - turnsUsed(user, day));
/** Use a message's turns. -> false (and nothing recorded) when today's turns are used up, else { source, pool, weight }.
 *  A message is taken while any turn is left; a Pro message may then use the last ones and count past the cap (the
 *  count shown never goes below 0). */
export function takeTurn(user, day = today(), { pro = false } = {}) {
  const a = allowanceFor(user);
  if (Math.max(0, a.daily - turnsUsed(user, day)) <= 0) return false;
  const weight = weightOf(pro);
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,?) ON CONFLICT(user_id, day) DO UPDATE SET turns=turns+excluded.turns', idOf(user), day, weight);
  return { source: a.source, pool: a.pool, weight };
}
/** Give back a message's turns (a build that ended badly for a server-side reason without saving anything). Never below 0. */
export function refundTurn(userId, day, weight = 1) {
  if (day) q.run('UPDATE builder_usage SET turns=MAX(0, turns-?) WHERE user_id=? AND day=?', Math.max(1, weight | 0), userId, day);
}
