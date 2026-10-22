// Structured logs: one JSON object per line on stdout/stderr. Optional PostHog events behind POSTHOG_KEY.
import { config } from '../config.js';
export function log(level, msg, fields = {}) {
  if (process.env.BRB_SILENT === '1' && level !== 'error') return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, msg, ...fields });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}
/** Product analytics hook. Off unless POSTHOG_KEY is set. Never sends usernames or free text. */
export function track(event, distinctId, props = {}) {
  if (!config.posthogKey) return;
  fetch(`${config.posthogHost}/capture/`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: config.posthogKey, event, distinct_id: distinctId || 'anon', properties: props }) }).catch(() => {});
}
