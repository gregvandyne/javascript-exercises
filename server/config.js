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
/** A Host header or host name for comparing: lower case, no :80 / :443, no trailing dot ("Old.Example.com.:443" ->
 *  "old.example.com"). Other ports stay ("localhost:3000"). */
export const hostOnly = h => String(h || '').trim().toLowerCase().replace(/:(80|443)$/, '').replace(/\.$/, '');
/** A host name, with an optional port. */
export const HOST_RE = /^[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:\d{1,5})?$/;
/** REDIRECT_HOSTS: more old names that redirect to PUBLIC_URL (comma list of host or host:port), or an error message.
 *  The value is never echoed, and PUBLIC_URL's own host can't be listed (it would redirect to itself). */
export function parseRedirectHosts(v, publicUrl) {
  const list = String(v || '').split(',').map(hostOnly).filter(Boolean);
  if (!list.length) return { hosts: [] };
  if (list.some(h => !HOST_RE.test(h))) return { hosts: [], error: 'REDIRECT_HOSTS must be a comma-separated list of host names, like old.example.com or old.example.com:8080' };
  if (!publicUrl) return { hosts: [], error: 'REDIRECT_HOSTS is set but PUBLIC_URL is not: there is nothing to redirect to' };
  const own = hostOnly(new URL(publicUrl).host);
  if (list.includes(own)) return { hosts: [], error: `REDIRECT_HOSTS lists PUBLIC_URL's own host (${own}): it would redirect to itself` };
  return { hosts: [...new Set(list)] };
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
/** The Stripe API version every call and the webhook endpoint use (docs/decisions.md "Paid plans", BP-2). It is also the
 *  default of the pinned stripe SDK (package.json, exact version), but is always passed explicitly. */
export const STRIPE_API_VERSION = '2026-09-30.endive';
/** Oldest accepted STRIPE_API_VERSION: the field shapes we read (period dates on items, invoice.parent, invoice
 *  payments) start at basil. */
export const STRIPE_MIN_API_VERSION = '2025-03-31';
/**
 * Billing settings (docs/decisions.md "Paid plans", BP-11). Billing is off unless STRIPE_API_KEY and
 * STRIPE_WEBHOOK_SECRET are both set and nothing below is an error. Keys and secrets are never echoed in a message.
 * -> { apiKey, webhookSecret, webhookSecretOld, apiVersion, apiBase, liveOk, tax, mode: 'off'|'test'|'live',
 *      errors: [], warnings: [] }
 */
export function parseStripe(env = process.env, nodeEnv = env.NODE_ENV || 'development') {
  const errors = []; const warnings = [];
  const apiKey = String(env.STRIPE_API_KEY || '').trim();
  const webhookSecret = String(env.STRIPE_WEBHOOK_SECRET || '').trim();
  const webhookSecretOld = String(env.STRIPE_WEBHOOK_SECRET_OLD || '').trim();
  const liveOk = parseFlag(env.STRIPE_LIVE_OK, 'STRIPE_LIVE_OK');
  const tax = parseFlag(env.STRIPE_TAX, 'STRIPE_TAX');
  const apiVersion = String(env.STRIPE_API_VERSION || STRIPE_API_VERSION).trim();
  const base = parsePublicUrl(env.STRIPE_API_BASE, 'STRIPE_API_BASE');
  for (const e of [liveOk.error, tax.error, base.error]) if (e) errors.push(e);
  let mode = 'off';
  if (apiKey) {
    if (/^sk_live_/.test(apiKey)) errors.push('STRIPE_API_KEY is a live secret key (sk_live_): use a restricted key (rk_live_) with only the permissions billing needs');
    else if (/^rk_live_/.test(apiKey)) { mode = 'live'; if (!liveOk.on) errors.push('STRIPE_API_KEY is a live key: set STRIPE_LIVE_OK=1 once the going-live checklist is done'); }
    else if (/^rk_test_/.test(apiKey)) mode = 'test';
    else if (/^sk_test_/.test(apiKey)) { mode = 'test'; warnings.push('STRIPE_API_KEY is a secret key (sk_test_): use a restricted key (rk_test_) instead'); }
    else errors.push('STRIPE_API_KEY must be a restricted key (rk_test_… or rk_live_…)');
    if (/\s/.test(apiKey)) errors.push('STRIPE_API_KEY contains a space or line break');
  }
  for (const [name, v] of [['STRIPE_WEBHOOK_SECRET', webhookSecret], ['STRIPE_WEBHOOK_SECRET_OLD', webhookSecretOld]]) {
    if (v && !/^whsec_\S+$/.test(v)) errors.push(`${name} must look like whsec_…`);
  }
  const m = /^(\d{4}-\d{2}-\d{2})\.[a-z]+$/.exec(apiVersion);
  if (!m) errors.push('STRIPE_API_VERSION must look like 2026-09-30.endive');
  else if (m[1] < STRIPE_MIN_API_VERSION) errors.push(`STRIPE_API_VERSION must be ${STRIPE_MIN_API_VERSION}.basil or later`);
  if (base.url && nodeEnv === 'production') errors.push("STRIPE_API_BASE is for tests and can't be used in production");
  if (apiKey && !webhookSecret && !errors.length) warnings.push('Billing stays off: STRIPE_API_KEY is set but STRIPE_WEBHOOK_SECRET is not');
  if (!apiKey && webhookSecret) warnings.push('Billing stays off: STRIPE_WEBHOOK_SECRET is set but STRIPE_API_KEY is not');
  if (errors.length || !apiKey || !webhookSecret) mode = 'off';
  return { apiKey, webhookSecret, webhookSecretOld, apiVersion, apiBase: base.url, liveOk: liveOk.on, tax: tax.on, mode, errors, warnings };
}
/** Shortest SESSION_SECRET accepted when REQUIRE_SESSION_SECRET is on (openssl rand -hex 32 gives 64). */
export const MIN_SECRET_LENGTH = 32;
const publicUrl = parsePublicUrl(process.env.PUBLIC_URL);
const movedTo = parsePublicUrl(process.env.MOVED_TO_URL, 'MOVED_TO_URL');
const redirectHosts = parseRedirectHosts(process.env.REDIRECT_HOSTS, publicUrl.url);
// Set by Render itself (the service's onrender.com name); anything that doesn't look like a host name is ignored.
const renderHost = hostOnly(process.env.RENDER_EXTERNAL_HOSTNAME);
const requireSecret = parseFlag(process.env.REQUIRE_SESSION_SECRET, 'REQUIRE_SESSION_SECRET');
const maintenance = parseFlag(process.env.MAINTENANCE_MODE, 'MAINTENANCE_MODE');
const movedPermanently = parseFlag(process.env.MOVED_PERMANENTLY, 'MOVED_PERMANENTLY');
const sessionSecret = process.env.SESSION_SECRET || '';
/** SQLite journal modes that keep data safe after a crash (MEMORY and OFF don't). */
export const JOURNAL_MODES = ['WAL', 'DELETE', 'TRUNCATE', 'PERSIST'];
const journalMode = (process.env.BRB_JOURNAL_MODE || 'WAL').toUpperCase();

const GOOGLE_ID_RE = /^[0-9a-z-]+\.apps\.googleusercontent\.com$/i;
const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
const oidcBase = parsePublicUrl(process.env.GOOGLE_OIDC_BASE, 'GOOGLE_OIDC_BASE');
const stripe = parseStripe(process.env);

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
  // The domain move (server/domain.js): with PUBLIC_URL set, page loads on these old names go to the same page on
  // PUBLIC_URL, signed in. Render's own name (RENDER_EXTERNAL_HOSTNAME), PUBLIC_URL's www. twin and REDIRECT_HOSTS.
  renderHost: HOST_RE.test(renderHost) ? renderHost : '',
  redirectHosts: redirectHosts.hosts,
  // Sign in with Google (server/oidc.js): on only when both are set, and in production also PUBLIC_URL.
  googleClientId,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  googleOidcBase: oidcBase.url, // tests only: a local fake Google (tests/support/fake-google.js)
  // Startup refuses a malformed setting instead of silently ignoring it (server/index.js).
  configErrors: [
    googleClientId && !GOOGLE_ID_RE.test(googleClientId) && 'GOOGLE_CLIENT_ID must look like 1234-abc.apps.googleusercontent.com',
    oidcBase.error, oidcBase.url && (process.env.NODE_ENV || 'development') === 'production' && "GOOGLE_OIDC_BASE is for tests and can't be used in production",
    ...stripe.errors,
    publicUrl.error, movedTo.error, redirectHosts.error, requireSecret.error, maintenance.error, movedPermanently.error,
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
  // Turns one "Pro quality" message uses (server/builder/usage.js). 1 = the same as a normal message (today); paid
  // plans set 2 (docs/decisions.md "Paid plans", D5). Whole numbers from 1 to 10.
  proTurnWeight: Math.min(10, Math.max(1, Math.floor(num(process.env.PRO_TURN_WEIGHT, 1)) || 1)),
  builderMaxTokens: num(process.env.BUILDER_MAX_TOKENS, 64000),   // the models think first: room for thinking plus a whole game
  // Hard cap on one Builder build attempt (server/builder/runner.js): it is stopped after this long, whoever watches.
  builderTurnMaxMs: Math.max(1, num(process.env.BUILDER_TURN_MAX_SECONDS, 1200)) * 1000,
  // AI spending cap in US dollars (see server/services/ai-budget.js). Calls stop once either is reached.
  aiDailyBudgetUsd: posNum(process.env.AI_DAILY_BUDGET_USD, 5),
  aiMonthlyBudgetUsd: posNum(process.env.AI_MONTHLY_BUDGET_USD, 150),
  // Headless Chromium for game screenshots (cover pictures, Builder playtests). On in production; BRB_SNAPSHOTS=1/0 forces it.
  snapshots: process.env.BRB_SNAPSHOTS ? process.env.BRB_SNAPSHOTS === '1' : (process.env.NODE_ENV || 'development') === 'production',
  // BRB_SNAPSHOTS=0 turns screenshots off even when SNAPSHOT_URL names a worker.
  snapshotsOff: process.env.BRB_SNAPSHOTS === '0',
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
  // Paid plans (server/services/stripe.js, server/services/billing.js; docs/decisions.md "Paid plans"). Off unless the
  // key and the webhook secret are both set: no billing route answers and the site works as before.
  stripeApiKey: stripe.apiKey,
  stripeWebhookSecret: stripe.webhookSecret,
  stripeWebhookSecretOld: stripe.webhookSecretOld,   // the previous secret, during a rotation or an endpoint change
  stripeApiVersion: stripe.apiVersion,
  stripeApiBase: stripe.apiBase,                     // tests only: a local fake Stripe (tests/support/fake-stripe.js)
  stripeTax: stripe.tax,
  stripeWarnings: stripe.warnings,                   // logged at start-up (server/index.js)
  // Days a card plan stays on while Stripe retries a failed payment; days after an invoice's due date for schools.
  billingGraceDays: Math.max(0, num(process.env.BILLING_GRACE_DAYS, 7)),
  schoolInvoiceGraceDays: Math.max(0, num(process.env.SCHOOL_INVOICE_GRACE_DAYS, 30)),
  // Families (server/services/family.js): children one grown-up can link, and the extra Builder messages a family plan
  // adds each month (shown on /grown-ups; counted from chunk 4 on).
  familyMaxChildren: Math.max(1, num(process.env.FAMILY_MAX_CHILDREN, 4)),
  familyExtraMessages: Math.max(0, num(process.env.FAMILY_EXTRA_MESSAGES, 40)),
};
