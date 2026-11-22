// One AI call for the drafters (Manipulatives "Draft with AI", Figures worksheets and tests, lessons): docs/decisions.md
// "AI drafts: one time budget, a starting board when the AI doesn't answer".
//   - one time budget for the whole call (AI_CALL.timeoutMs). A call that times out is NOT tried again: the SDK's own
//     retry gave a second full wait (60 s + 60 s) before anything happened, and nothing was logged.
//   - the API saying it is busy (429 rate limit, 529 overloaded) is tried once more after a short pause, only while
//     enough of the budget is left.
//   - every failure is one warn line (aiFailed): what was drafting, the kind of failure, the HTTP status, how long it
//     took. Never the teacher's words, never names: the caller passes only ids and the tool.
// The callers fall back to their template draft (ai: false) with fallbackReason(kind) as the reason the page words.
import { log } from './log.js';

export const AI_CALL = { timeoutMs: 90e3, busyPauseMs: 2e3, minRetryMs: 15e3 };
/** Test hooks: log receives each warn line as (msg, fields) instead of the log. */
export const hooks = { log: null };

class AiTimeout extends Error { constructor() { super('timeout'); this.name = 'AiTimeout'; } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
function within(p, ms) {
  let timer;
  return Promise.race([p, new Promise((_, rej) => { timer = setTimeout(() => rej(new AiTimeout()), ms); })]).finally(() => clearTimeout(timer));
}

/** What kind of failure: 'timeout' | 'rate_limit' | 'overloaded' | 'bad_json' | 'api_error'. */
export function aiErrorKind(e) {
  if (!e) return 'api_error';
  const name = String(e.name || e.constructor?.name || ''), msg = String(e.message || ''), status = Number(e.status) || 0;
  if (name === 'AiTimeout' || name === 'APIConnectionTimeoutError' || /timed? ?out/i.test(msg)) return 'timeout';
  if (status === 429) return 'rate_limit';
  if (status === 529 || e.error?.error?.type === 'overloaded_error' || /overloaded/i.test(msg)) return 'overloaded';
  if (e instanceof SyntaxError) return 'bad_json';
  return 'api_error';
}
/** The reason a draft carries when it fell back: 'timeout' | 'busy' | 'error' (the page words each one). */
export const fallbackReason = kind => (kind === 'timeout' ? 'timeout' : kind === 'rate_limit' || kind === 'overloaded' ? 'busy' : 'error');

/** client.messages.create(params) within the budget: no SDK retries, one retry when the API is busy. -> the response
 *  (rejects with the last error). */
export async function callAi(client, params, { timeoutMs = AI_CALL.timeoutMs } = {}) {
  const t0 = Date.now();
  const once = ms => within(Promise.resolve(client.messages.create(params, { timeout: ms, maxRetries: 0 })), ms);
  try { return await once(timeoutMs); } catch (e) {
    const k = aiErrorKind(e), left = timeoutMs - (Date.now() - t0) - AI_CALL.busyPauseMs;
    if ((k !== 'rate_limit' && k !== 'overloaded') || left < AI_CALL.minRetryMs) throw e;
    await sleep(AI_CALL.busyPauseMs);
    return once(left);
  }
}

/** The one warn line for a failed AI call. fields: ids and the tool only (never the brief or any name). -> the kind. */
export function logAiFail(msg, fields, e, t0) {
  const kind = aiErrorKind(e);
  const line = { ...fields, kind, status: Number(e && e.status) || null, ms: Math.max(0, Date.now() - t0) };
  if (hooks.log) hooks.log(msg, line); else log('warn', msg, line);
  return kind;
}
