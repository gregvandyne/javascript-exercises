// Daily Builder turn limit per user (builder_usage table). One user message to the Builder = one turn.
// Messages refused by screening do not use a turn (the endpoint is rate-limited separately).
import { q, today } from '../db.js';
import { config } from '../config.js';

export const dailyTurns = () => Math.max(0, config.builderDailyTurns | 0);
export function turnsUsed(userId, day = today()) {
  const r = q.get('SELECT turns FROM builder_usage WHERE user_id=? AND day=?', userId, day);
  return r ? r.turns : 0;
}
export const turnsLeft = (userId, day = today()) => Math.max(0, dailyTurns() - turnsUsed(userId, day));
/** Use one turn. -> false (and nothing recorded) when today's turns are used up. */
export function takeTurn(userId, day = today()) {
  if (turnsLeft(userId, day) <= 0) return false;
  q.run('INSERT INTO builder_usage(user_id, day, turns) VALUES (?,?,1) ON CONFLICT(user_id, day) DO UPDATE SET turns=turns+1', userId, day);
  return true;
}
