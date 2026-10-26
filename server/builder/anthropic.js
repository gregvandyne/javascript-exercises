// One lazily-created Anthropic client for the Builder, the input classifier and model review.
// Returns null when ANTHROPIC_API_KEY is not set: every caller then uses its mock / fallback path.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';
import * as aiBudget from '../services/ai-budget.js';

let client = null;
/** The client, or null when no key is set OR the pool's AI budget is spent (callers use their fallback). pool: the
 *  money pool paying for the calls ('free' for everything but the Builder messages a family plan pays for). */
export function anthropic(pool = 'free') {
  if (!config.anthropicKey) return null;
  if (!aiBudget.ok(pool)) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2 });
  return client;
}
export const hasModel = () => !!config.anthropicKey;
/** A key is set but the pool's AI budget is used up for now. */
export const resting = (pool = 'free') => !!config.anthropicKey && !aiBudget.ok(pool);
/** While resting: when the AI is back (ms), else null. */
export const restingUntil = (pool = 'free') => (resting(pool) ? aiBudget.resetsAt(Date.now(), pool) : null);
