// One lazily-created Anthropic client for the Builder, the input classifier and model review.
// Returns null when ANTHROPIC_API_KEY is not set: every caller then uses its mock / fallback path.
import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config.js';

let client = null;
export function anthropic() {
  if (!config.anthropicKey) return null;
  if (!client) client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2 });
  return client;
}
export const hasModel = () => !!config.anthropicKey;
