// All configuration comes from env vars with safe defaults. Documented in README.md.
import path from 'node:path';

const num = (v, d) => (v === undefined || v === '' || isNaN(+v) ? d : +v);
// A dollar amount: 0 or more (0 turns the AI off); anything else falls back to the default.
const posNum = (v, d) => { const n = num(v, d); return Number.isFinite(n) && n >= 0 ? n : d; };
/** A site address (PUBLIC_URL, MOVED_TO_URL) -> its origin ("https://play.example.com"), or an error message. Unset: ''. */
export function parsePublicUrl(v, name = 'PUBLIC_URL') {
  if (!v) return { url: '' };
  let u = null;
  try { u = new URL(v); } catch { /* not a URL */ }
  if (u && /^https?:$/.test(u.protocol) && !u.username && !u.password && (u.pathname === '/' || u.pathname === '')) return { url: u.origin };
  // Echo what was given without a user name, password, query or fragment (they may hold secrets); junk isn't echoed.
  let shown = '';
  if (u) { u.username = ''; u.password = ''; u.search = ''; u.hash = ''; shown = ` (got "${u.href}")`; }
  return { url: '', error: `${name} must look like https://play.example.com, with no path, user name or password${shown}` };
}
/** An on/off variable: unset or '' -> fallback; 1/true/yes/on and 0/false/no/off (any case); anything else -> error. */
export function parseFlag(v, name, fallback = false) {
  if (v === undefined || v === '') return { on: fallback };
  const s = String(v).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return { on: true };
  if (['0', 'false', 'no', 'off'].includes(s)) return { on: false };
  // The value isn't echoed: a secret pasted into the wrong variable must not reach the log.
  return { on: fallback, error: `${name} must be 1 or 0` };
}
/** Shortest SESSION_SECRET accepted when REQUIRE_SESSION_SECRET is on (openssl rand -hex 32 gives 64). */
export const MIN_SECRET_LENGTH = 32;
const publicUrl = parsePublicUrl(process.env.PUBLIC_URL);
const movedTo = parsePublicUrl(process.env.MOVED_TO_URL, 'MOVED_TO_URL');
const requireSecret = parseFlag(process.env.REQUIRE_SESSION_SECRET, 'REQUIRE_SESSION_SECRET');
const maintenance = parseFlag(process.env.MAINTENANCE_MODE, 'MAINTENANCE_MODE');
const movedPermanently = parseFlag(process.env.MOVED_PERMANENTLY, 'MOVED_PERMANENTLY');
const sessionSecret = process.env.SESSION_SECRET || '';
/** SQLite journal modes that keep data safe after a crash (MEMORY and OFF don't). */
export const JOURNAL_MODES = ['WAL', 'DELETE', 'TRUNCATE', 'PERSIST'];
const journalMode = (process.env.BRB_JOURNAL_MODE || 'WAL').toUpperCase();

export const config = {
  port: num(process.env.PORT, 3000),
  env: process.env.NODE_ENV || 'development',
  dataDir: process.env.BRB_DATA_DIR || path.resolve(process.cwd(), 'data'),
  db: process.env.BRB_DB || '', // ':memory:' for tests; default <dataDir>/brb.db
  sessionSecret,
  // REQUIRE_SESSION_SECRET=1: refuse to start without SESSION_SECRET (instead of falling back to one stored in the DB).
  requireSessionSecret: requireSecret.on,
  // The site's public address, for login cards and same-origin checks behind a proxy that rewrites Host.
  publicUrl: publicUrl.url,
  // Startup refuses a malformed setting instead of silently ignoring it (server/index.js).
  configErrors: [
    publicUrl.error, movedTo.error, requireSecret.error, maintenance.error, movedPermanently.error,
    !JOURNAL_MODES.includes(journalMode) && `BRB_JOURNAL_MODE must be one of ${JOURNAL_MODES.join(', ')}`,
    requireSecret.on && sessionSecret && sessionSecret.length < MIN_SECRET_LENGTH
      && `SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters, which REQUIRE_SESSION_SECRET=1 refuses (make one with: openssl rand -hex 32)`,
  ].filter(Boolean),
  // SQLite journal mode: WAL on a local disk (default); DELETE on a network file system (NFS, SMB).
  journalMode,
  // Graceful shutdown: how long in-flight requests and Builder turns get to finish after SIGTERM.
  shutdownGraceMs: num(process.env.SHUTDOWN_GRACE_SECONDS, 25) * 1000,
  // Idle keep-alive connections stay open longer than a load balancer's idle timeout (AWS ALB: 60 s).
  keepAliveTimeoutMs: num(process.env.KEEPALIVE_TIMEOUT_SECONDS, 65) * 1000,
  // Moving day: MAINTENANCE_MODE=1 shows a "back soon" page; MOVED_TO_URL redirects every page to the new address
  // (302 / 307; MOVED_PERMANENTLY=1 makes it 301 / 308 once the new site is known to work).
  maintenance: maintenance.on,
  movedTo: movedTo.url,
  movedPermanently: movedPermanently.on,
  anthropicKey: process.env.ANTHROPIC_API_KEY || '',
  builderModel: process.env.BUILDER_MODEL || 'claude-sonnet-5-5',
  builderProModel: process.env.BUILDER_PRO_MODEL || 'claude-opus-5-5',
  builderDailyTurns: num(process.env.BUILDER_DAILY_TURNS, 60),
  builderMaxTokens: num(process.env.BUILDER_MAX_TOKENS, 32000),
  // AI spending cap in US dollars (see server/services/ai-budget.js). Calls stop once either is reached.
  aiDailyBudgetUsd: posNum(process.env.AI_DAILY_BUDGET_USD, 5),
  aiMonthlyBudgetUsd: posNum(process.env.AI_MONTHLY_BUDGET_USD, 50),
  // Headless Chromium for game screenshots (cover pictures, Builder playtests). On in production; BRB_SNAPSHOTS=1/0 forces it.
  snapshots: process.env.BRB_SNAPSHOTS ? process.env.BRB_SNAPSHOTS === '1' : (process.env.NODE_ENV || 'development') === 'production',
  chromiumPath: process.env.BRB_CHROMIUM || '',
  // Remote screenshot worker. When SNAPSHOT_URL is set, the app sends every screenshot/playtest job to
  // that worker over HTTP instead of launching Chromium itself, so the browser can run in a separate
  // container with no database or secrets. SHOTS_TOKEN is the shared bearer secret. Unset = local Chromium.
  snapshotUrl: (process.env.SNAPSHOT_URL || '').replace(/\/+$/, ''),
  shotsToken: process.env.SHOTS_TOKEN || '',
  shotsPort: num(process.env.SHOTS_PORT, 4900),
  adminUsername: process.env.ADMIN_USERNAME || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  chatDailyLimit: num(process.env.CHAT_DAILY_LIMIT, 300),
  reportsToHide: num(process.env.REPORTS_TO_HIDE, 3),
  // Where grown-ups write to us (deletion, export, a lost password): shown on /parents and in the footer when set.
  contactEmail: process.env.CONTACT_EMAIL || '',
  // Schools to create at start-up, each with an existing account as its school admin (scripts/seed.js seedSchools):
  // JSON like [{"name":"Oak Hill Primary","admin":"MsSmith"}]. Safe to leave set: already-done steps are skipped.
  bootstrapSchools: process.env.BOOTSTRAP_SCHOOLS || '',
  posthogKey: process.env.POSTHOG_KEY || '',
  posthogHost: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
  logRequests: process.env.LOG_REQUESTS !== '0',
};
