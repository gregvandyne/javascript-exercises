// The Builder's status line for CS Quest plan pages (docs/cs-quest.md, P18): is the AI Builder on or resting, and how many
// capstone teams can build this period. "Resting" is the AI budget's word (services/ai-budget.js): the free pool's daily
// or monthly cap is reached, the site-wide hard ceiling is reached, or no API key is set (the offline mock builds then).
// A school plan builds from the paid pool, so the Builder is on while either pool is open. No prices anywhere.
import { config } from '../config.js';
import * as aiBudget from './ai-budget.js';

/**
 * -> { on, state: 'on' | 'resting', why: null | 'noKey' | 'daily' | 'monthly' | 'hard', resetsAt: ms | null,
 *      teamsPerPeriod (CS_QUEST_BUILD_TEAMS_PER_PERIOD, default 8), pools: { free: bool, paid: bool } }
 */
export function builderStatus(now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  const key = !!config.anthropicKey;
  const free = key ? aiBudget.status(day, 'free') : { ok: false, reason: 'noKey' };
  const paid = key ? aiBudget.status(day, 'paid') : { ok: false, reason: 'noKey' };
  const on = key && (free.ok || paid.ok);
  return {
    on, state: on ? 'on' : 'resting',
    why: on ? null : !key ? 'noKey' : free.reason || 'daily',
    resetsAt: on || !key ? null : aiBudget.resetsAt(now, 'free'),
    teamsPerPeriod: config.csQuestBuildTeamsPerPeriod,
    pools: { free: !!free.ok, paid: !!paid.ok },
  };
}
