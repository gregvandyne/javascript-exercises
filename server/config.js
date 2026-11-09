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
 * -> { apiKey, webhookSecret, webhookSecretOld, apiVersion, apiBase, liveOk, tax, pmcFamily, pmcSchool, termsPublished, mode: 'off'|'test'|'live',
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
  // The "Family" payment method configuration (cards, Apple Pay, Google Pay; Link off, so a saved Link wallet can't be
  // filled in on a shared device). Required for family Checkout: unset, family plans are not on sale (never a fallback
  // to the account's default configuration). Never a list of payment_method_types.
  const pmcFamily = String(env.STRIPE_PMC_FAMILY || '').trim();
  // Optional "School" payment method configuration (cards, Link, ACH Direct Debit) for school Checkout; unset = the
  // account's default payment methods.
  const pmcSchool = String(env.STRIPE_PMC_SCHOOL || '').trim();
  const terms = parseFlag(env.TERMS_PUBLISHED, 'TERMS_PUBLISHED');
  for (const e of [liveOk.error, tax.error, base.error, terms.error]) if (e) errors.push(e);
  if (pmcFamily && !/^pmc_[A-Za-z0-9]+$/.test(pmcFamily)) errors.push('STRIPE_PMC_FAMILY must look like pmc_…');
  if (pmcSchool && !/^pmc_[A-Za-z0-9]+$/.test(pmcSchool)) errors.push('STRIPE_PMC_SCHOOL must look like pmc_…');
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
  if (mode !== 'off' && !pmcFamily) warnings.push('STRIPE_PMC_FAMILY is not set: family plans are not on sale until it names the "Family" payment method configuration (Link off)');
  return { apiKey, webhookSecret, webhookSecretOld, apiVersion, apiBase: base.url, liveOk: liveOk.on, tax: tax.on, pmcFamily, pmcSchool, termsPublished: terms.on, mode, errors, warnings };
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
const billingPublic = parseFlag(process.env.BILLING_PUBLIC, 'BILLING_PUBLIC');
const parentMade = parseFlag(process.env.PARENT_MADE_CHILDREN, 'PARENT_MADE_CHILDREN');
const movedPermanently = parseFlag(process.env.MOVED_PERMANENTLY, 'MOVED_PERMANENTLY');
const builderWebSearch = parseFlag(process.env.BUILDER_WEB_SEARCH, 'BUILDER_WEB_SEARCH');
const sttLive = parseFlag(process.env.STT_LIVE, 'STT_LIVE', true);
const liveClassroom = parseFlag(process.env.LIVE_CLASSROOM, 'LIVE_CLASSROOM', true);
const micGames = parseFlag(process.env.MIC_GAMES, 'MIC_GAMES', true);
const liveTeams = parseFlag(process.env.LIVE_TEAMS, 'LIVE_TEAMS', true);
const liveSaveSupport = parseFlag(process.env.LIVE_SAVE_SUPPORT, 'LIVE_SAVE_SUPPORT');
const liveHomework = parseFlag(process.env.LIVE_HOMEWORK, 'LIVE_HOMEWORK');
const liveCohost = parseFlag(process.env.LIVE_COHOST, 'LIVE_COHOST', true);
// CS Quest (docs/cs-quest.md): QUIZ_STEPS=0 hides quiz steps (exit tickets) on the student lesson page and their APIs.
const quizSteps = parseFlag(process.env.QUIZ_STEPS, 'QUIZ_STEPS', true);
/** Speech to text providers (server/services/stt.js). 'mock' answers fixed words, for tests only. */
export const STT_PROVIDERS = ['openai', 'elevenlabs', 'mock'];
const sttProvider = String(process.env.STT_PROVIDER || 'openai').trim().toLowerCase();
/** Text to speech providers (server/services/tts.js). 'mock' answers a silent MP3, for tests only. */
export const TTS_PROVIDERS = ['openai', 'mock'];
/** Every site locale TTS may speak (TTS_LOCALES narrows it; /admin/voices switches each one on inside that). */
export const TTS_ALL_LOCALES = ['en', 'en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl'];
const ttsEnabled = parseFlag(process.env.TTS_ENABLED, 'TTS_ENABLED');
const ttsProvider = String(process.env.TTS_PROVIDER || 'openai').trim().toLowerCase();
const ttsModel = String(process.env.TTS_MODEL || 'gpt-4o-mini-tts').trim();
/** TTS_LOCALES: a comma list of site locales (any case), default all of them. -> { list, error } */
export function parseTtsLocales(v) {
  if (v == null || !String(v).trim()) return { list: [...TTS_ALL_LOCALES], error: null };
  const out = [], bad = [];
  for (const raw of String(v).split(',').map(x => x.trim()).filter(Boolean)) {
    const code = TTS_ALL_LOCALES.find(c => c.toLowerCase() === raw.toLowerCase());
    if (code) { if (!out.includes(code)) out.push(code); } else bad.push(raw);
  }
  return { list: out, error: bad.length ? `TTS_LOCALES has unknown locales: ${bad.join(', ')} (use ${TTS_ALL_LOCALES.join(', ')})` : null };
}
const ttsLocales = parseTtsLocales(process.env.TTS_LOCALES);
const sessionSecret = process.env.SESSION_SECRET || '';
/** SQLite journal modes that keep data safe after a crash (MEMORY and OFF don't). */
export const JOURNAL_MODES = ['WAL', 'DELETE', 'TRUNCATE', 'PERSIST'];
const journalMode = (process.env.BRB_JOURNAL_MODE || 'WAL').toUpperCase();

const GOOGLE_ID_RE = /^[0-9a-z-]+\.apps\.googleusercontent\.com$/i;
const googleClientId = (process.env.GOOGLE_CLIENT_ID || '').trim();
const oidcBase = parsePublicUrl(process.env.GOOGLE_OIDC_BASE, 'GOOGLE_OIDC_BASE');
const stripe = parseStripe(process.env);
/** The default sender of Oomba's emails (server/services/email.js) and where replies go. */
export const EMAIL_FROM_DEFAULT = 'Greg at Oomba Academy <greg@oomba.ai>';
export const EMAIL_REPLY_TO_DEFAULT = 'Greg@oomba.ai';
/**
 * Email settings (server/services/email.js; docs/decisions.md "Trial emails"). Nothing is sent unless RESEND_API_KEY is
 * set and EMAIL_ENABLED is not 0; trial nudges (marketing) also need EMAIL_POSTAL_ADDRESS (CAN-SPAM), which has no
 * default. The key is never echoed. -> { apiKey, from, replyTo, postalAddress, enabled, errors }
 */
export function parseEmail(env = process.env) {
  const errors = [];
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const enabled = parseFlag(env.EMAIL_ENABLED, 'EMAIL_ENABLED', true);
  if (enabled.error) errors.push(enabled.error);
  if (apiKey && !/^re_[A-Za-z0-9_]+$/.test(apiKey)) errors.push('RESEND_API_KEY must look like re_…');
  const from = String(env.EMAIL_FROM || '').trim() || EMAIL_FROM_DEFAULT;
  const replyTo = String(env.EMAIL_REPLY_TO || '').trim() || EMAIL_REPLY_TO_DEFAULT;
  const addr = /^(?:[^<>@\s]+ )*<?[^<>@\s]+@[^<>@\s]+\.[^<>@\s]+>?$/;
  if (!addr.test(from)) errors.push('EMAIL_FROM must look like Name <name@example.com> or name@example.com');
  if (!addr.test(replyTo)) errors.push('EMAIL_REPLY_TO must be an email address');
  // One line in the footer: line breaks become " · ", and it is clipped (it is printed as text, never as HTML).
  const postalAddress = String(env.EMAIL_POSTAL_ADDRESS || '').replace(/\s*[\r\n]+\s*/g, ' · ').trim().slice(0, 200);
  return { apiKey, from, replyTo, postalAddress, enabled: enabled.on, errors };
}
const email = parseEmail(process.env);

export const config = {
  port: num(process.env.PORT, 3000),
  // KIT_PREVIEW=1: the Oomba Kit preview (/kit) for everyone, not only admins (docs/kit.md).
  kitPreview: process.env.KIT_PREVIEW === '1',
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
    ...email.errors,
    publicUrl.error, movedTo.error, redirectHosts.error, requireSecret.error, maintenance.error, movedPermanently.error, parentMade.error, sttLive.error, liveClassroom.error,
    liveTeams.error, liveSaveSupport.error, liveHomework.error, liveCohost.error, quizSteps.error, micGames.error,
    builderWebSearch.error,
    !STT_PROVIDERS.includes(sttProvider) && `STT_PROVIDER must be one of ${STT_PROVIDERS.filter(p => p !== 'mock').join(', ')}`,
    sttProvider === 'mock' && (process.env.NODE_ENV || 'development') === 'production' && "STT_PROVIDER=mock is for tests and can't be used in production",
    ttsEnabled.error, ttsLocales.error,
    !TTS_PROVIDERS.includes(ttsProvider) && `TTS_PROVIDER must be one of ${TTS_PROVIDERS.filter(p => p !== 'mock').join(', ')}`,
    ttsProvider === 'mock' && (process.env.NODE_ENV || 'development') === 'production' && "TTS_PROVIDER=mock is for tests and can't be used in production",
    !/^[A-Za-z0-9._-]{1,60}$/.test(ttsModel) && 'TTS_MODEL must be a model name like gpt-4o-mini-tts, tts-1 or tts-1-hd',
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
  // Story Builder (docs/story-builder.md): STORY_BUILDER=1 opens /stories (off by default: it needs a story worker,
  // scripts/story-worker.js, running beside the site). STORY_DAILY_LIMIT: new stories a day per kid account (grown-ups
  // and staff get twice as many); STORY_QUEUE_MAX: stories waiting site-wide before new ones are turned away.
  storyBuilder: parseFlag(process.env.STORY_BUILDER, 'STORY_BUILDER').on,
  storyDailyLimit: Math.max(0, Math.floor(num(process.env.STORY_DAILY_LIMIT, 2))),
  storyQueueMax: Math.max(1, Math.floor(num(process.env.STORY_QUEUE_MAX, 20))),
  // Quick story changes (new words, voice or music: no new pictures) a day per person; grown-ups and staff get twice as many.
  storyRemakeLimit: Math.max(0, Math.floor(num(process.env.STORY_REMAKE_LIMIT, 4))),
  // STORY_WORKER: 'inline' (the default) runs the story worker loop inside the site's process when STORY_BUILDER=1;
  // 'external' leaves it to scripts/story-worker.js. With STORY_RENDERER=remote the loop is light (the render runs on
  // the story renderer service, services/story-renderer/).
  storyWorker: process.env.STORY_WORKER === 'external' ? 'external' : 'inline',
  // BUILDER_WEB_SEARCH=1: the Builder may look facts up on the web (server/builder/search.js: blocked sites, a cap per
  // build, screening, an admin log). Off when unset. The Anthropic Console's own web search setting is a second switch.
  builderWebSearch: builderWebSearch.on,
  // Speech to text in the Studio chat (server/services/stt.js): on only when STT_API_KEY is set (the owner sets it in
  // the host's dashboard, never in a file). Audio is kept in memory only and dropped after the words come back.
  sttProvider: STT_PROVIDERS.includes(sttProvider) ? sttProvider : '',
  sttApiKey: process.env.STT_API_KEY || '',
  sttModel: process.env.STT_MODEL || '',
  // Live speech to text (server/services/stt-live.js): words show while the kid speaks, over a WebSocket relay to the
  // provider's realtime API. On whenever speech to text is on; STT_LIVE=0 turns only the live mode off (the page then
  // records and uploads as before). STT_REALTIME_MODEL overrides the live model (stt.js has the defaults).
  sttLive: sttLive.on,
  // Loudness on the play page of Remi's Quiet Meadow (server/services/mic-games.js): the page measures how loud the room
  // is and passes the game a number; audio is never recorded or sent. MIC_GAMES=0 switches it off site-wide (the game
  // then offers its demo without a mic).
  micGames: micGames.on,
  sttRealtimeModel: process.env.STT_REALTIME_MODEL || '',
  // Oomba Live (docs/decisions.md "Oomba Live"; server/services/classlive-*.js): live class games with join codes.
  // LIVE_CLASSROOM=0 turns it off (live pages and the live socket answer 404, entry buttons hide; the class-code /join
  // keeps working). Players per session (2-100; grown-ups' open rooms at most 30), open sessions and connected seats
  // site-wide, and a session's longest life in hours (its join code dies with it).
  liveClassroom: liveClassroom.on,
  liveMaxPlayers: Math.min(100, Math.max(2, Math.floor(num(process.env.LIVE_MAX_PLAYERS, 60)))),
  liveMaxSessions: Math.max(1, Math.floor(num(process.env.LIVE_MAX_SESSIONS, 60))),
  liveMaxSeats: Math.max(2, Math.floor(num(process.env.LIVE_MAX_SEATS, 2000))),
  liveHours: Math.min(3, Math.max(0.1, num(process.env.LIVE_HOURS, 3))),   // never more than 3 hours (docs/legal-review.md item 41)
  // Oomba Live part 3 (docs/decisions.md "Oomba Live, part 3"): LIVE_TEAMS=0 hides team mode (the server ignores team
  // messages). LIVE_SAVE_SUPPORT=1 lets class teachers save a student's support (extra time, read aloud, simple view)
  // for their class: off until docs/legal-review.md item 42 is signed off (support in one session works either way).
  // LIVE_HOMEWORK=1 lets teachers assign a question set as a self-paced lesson step (kind 'quiz').
  liveTeams: liveTeams.on,
  liveSaveSupport: liveSaveSupport.on,
  liveHomework: liveHomework.on,
  // CS Quest (docs/cs-quest.md). QUIZ_STEPS (default on) gates quiz steps on the student lesson page and the student quiz
  // APIs under /api/progress/:cl/:step/quiz; LIVE_HOMEWORK only gates "Set as homework" from a live results page (and,
  // until they move to QUIZ_STEPS, the older /api/lessons/:cl/steps/:step/quiz routes in routes/live.js).
  // CS_QUEST_BUILD_TEAMS_PER_PERIOD (1-60, default 8): how many capstone teams the plan page says can build this period
  // (services/builder-status.js builderStatus()).
  quizSteps: quizSteps.on,
  csQuestBuildTeamsPerPeriod: Math.min(60, Math.max(1, Math.floor(num(process.env.CS_QUEST_BUILD_TEAMS_PER_PERIOD, 8)) || 8)),
  // Oomba Live part 4 (docs/decisions.md "Oomba Live, part 4"): co-hosts. LIVE_COHOST=0 hides every co-host button and
  // the co-host APIs answer 404 (deleting logged data still works). LIVE_HANDOFF_SECS (3-600, default 120): how long the
  // host may be gone before the longest-standing co-host takes over.
  liveCohost: liveCohost.on,
  liveHandoffSecs: Math.min(600, Math.max(3, Math.floor(num(process.env.LIVE_HANDOFF_SECS, 120)))),
  // AI voices (text to speech; server/services/tts.js, docs/decisions.md "AI voices"): official games, lessons and Oomba
  // Live read site-, game- and teacher-written text aloud with a hosted voice. OFF unless TTS_ENABLED=1 AND a key is set:
  // TTS_API_KEY, or STT_API_KEY when both TTS_PROVIDER and STT_PROVIDER are openai (the owner sets keys in the host's
  // dashboard, never in a file). Even then each language stays off until the admin switches it on at /admin/voices.
  ttsEnabled: ttsEnabled.on,
  ttsProvider: TTS_PROVIDERS.includes(ttsProvider) ? ttsProvider : '',
  ttsApiKey: process.env.TTS_API_KEY || '',
  ttsModel,
  ttsLocales: ttsLocales.list,
  ttsMaxChars: Math.min(4000, Math.max(50, Math.floor(num(process.env.TTS_MAX_CHARS, 600)))),
  ttsCacheMb: Math.max(16, num(process.env.TTS_CACHE_MB, 512)),
  // TTS_DAILY_CHARS: new characters a day, site-wide. Unset: derived from the AI budget (server/services/tts-usage.js
  // dailyCap: about 20% of AI_DAILY_BUDGET_USD at TTS_USD_PER_1K_CHARS), so voices can never eat the whole free pool.
  ttsDailyChars: process.env.TTS_DAILY_CHARS ? Math.max(1000, Math.floor(num(process.env.TTS_DAILY_CHARS, 1000))) : null,
  // New characters a day for one person (a signed-in account, or a seat in Oomba Live) and for one network address.
  ttsUserDailyChars: Math.max(200, Math.floor(num(process.env.TTS_USER_DAILY_CHARS, 5000))),
  ttsIpDailyChars: Math.max(1000, Math.floor(num(process.env.TTS_IP_DAILY_CHARS, 30000))),
  ttsPerMinute: Math.max(1, Math.floor(num(process.env.TTS_PER_MINUTE, 20))),
  ttsUsdPer1kChars: Math.max(0, num(process.env.TTS_USD_PER_1K_CHARS, 0.015)),
  ttsTimeoutMs: Math.min(60000, Math.max(2000, num(process.env.TTS_TIMEOUT_MS, 15000))),
  sttMaxSeconds: Math.min(120, Math.max(5, num(process.env.STT_MAX_SECONDS, 60))),
  sttMaxBytes: Math.min(10_000_000, Math.max(100_000, num(process.env.STT_MAX_BYTES, 1_500_000))),
  sttPerMinute: Math.max(1, num(process.env.STT_PER_MINUTE, 8)),
  sttDailyClips: Math.max(1, num(process.env.STT_DAILY_CLIPS, 60)),
  // Site-wide minutes of speech to text a UTC day (all builders together), and its price for the AI spending caps.
  sttDailyMinutes: Math.max(1, num(process.env.STT_DAILY_MINUTES, 300)),
  sttUsdPerMinute: Math.max(0, num(process.env.STT_USD_PER_MINUTE, 0.007)),
  // Turns one "Pro quality" message uses (server/builder/usage.js). 1 = the same as a normal message (today); paid
  // plans set 2 (docs/decisions.md "Paid plans", D5). Whole numbers from 1 to 10.
  proTurnWeight: Math.min(10, Math.max(1, Math.floor(num(process.env.PRO_TURN_WEIGHT, 1)) || 1)),
  builderMaxTokens: num(process.env.BUILDER_MAX_TOKENS, 64000),   // the models think first: room for thinking plus a whole game
  // Hard cap on one Builder build attempt (server/builder/runner.js): it is stopped after this long, whoever watches.
  builderTurnMaxMs: Math.max(1, num(process.env.BUILDER_TURN_MAX_SECONDS, 1200)) * 1000,
  // The same cap for trusted makers (the platform admin, school staff and class teachers, builder/usage.js
  // trustedMaker): their builds always use the Pro model and get more model calls, so they get longer.
  // Every signed-in maker builds like a teacher (the owner's rule, November 2026): the Pro model, the longer cap, more
  // model calls and playtest fix rounds (builder/usage.js trustedMaker). Guests are not included. Set 0 to go back to
  // teachers and staff only (to save AI spend).
  builderFullForAll: !/^(0|false|no|off)$/i.test(String(process.env.BUILDER_FULL_FOR_ALL ?? '1').trim()),
  builderStaffTurnMaxMs: Math.max(1, num(process.env.BUILDER_STAFF_TURN_MAX_SECONDS, 2400)) * 1000,
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
  stripeLiveOk: stripe.liveOk,                       // STRIPE_LIVE_OK=1: a live key may start the server (the going-live checklist is done)
  stripePmcFamily: stripe.pmcFamily,                 // pmc_…: family Checkout's payment method configuration (required to sell family plans)
  stripePmcSchool: stripe.pmcSchool,                 // pmc_…: school Checkout's payment method configuration (optional)
  // TERMS_PUBLISHED=1 once /terms is on the site: family Checkout then asks the buyer to agree to it (Stripe's own
  // checkbox, which also needs the Terms URL in the Stripe Dashboard's public details) and /family links to it.
  termsPublished: stripe.termsPublished,
  stripeWarnings: stripe.warnings,                   // logged at start-up (server/index.js)
  // Days a card plan stays on while Stripe retries a failed payment; days after an invoice's due date for schools.
  billingGraceDays: Math.max(0, num(process.env.BILLING_GRACE_DAYS, 7)),
  schoolInvoiceGraceDays: Math.max(0, num(process.env.SCHOOL_INVOICE_GRACE_DAYS, 30)),
  // Families (server/services/family.js): children one grown-up can link, and the extra Builder messages a family plan
  // adds each month (shown on /plans; counted from chunk 4 on).
  // Paid-plan pages (grown-up accounts, family links, later checkout) for everyone: off until the owner opens them.
  // Before that, only a browser holding the preview cookie sees them (BILLING_PREVIEW_TOKEN, 24+ characters; visit
  // any page with ?bpreview=<token> once). Billing itself (webhooks, sync) runs either way when the Stripe keys are set.
  billingPublic: billingPublic.on,
  // Parent-made child accounts (services/family.js madeOn; docs/decisions.md "Parent-made child accounts"): a grown-up
  // makes their child's own account. Off by default; it also needs families on. Turning it on in production waits for
  // the owner's sign-off on docs/legal-review.md item 30 (start-up warns while it is on in production).
  parentMadeChildren: parentMade.on,
  billingPreviewToken: (process.env.BILLING_PREVIEW_TOKEN || '').length >= 24 ? process.env.BILLING_PREVIEW_TOKEN : '',
  familyMaxChildren: Math.max(1, num(process.env.FAMILY_MAX_CHILDREN, 4)),
  familyExtraMessages: Math.max(0, num(process.env.FAMILY_EXTRA_MESSAGES, 40)),
  // The family plan's limits besides the monthly count (server/builder/usage.js; disclosed on /plans and /family):
  // extra messages one child may use in a UTC day, and the AI cost (US dollars) of one family's extra messages in a UTC
  // month, a backstop against unusually expensive messages.
  familyChildDailyMax: Math.max(0, Math.floor(num(process.env.FAMILY_CHILD_DAILY_MAX, 60))),
  familyMonthlyAiUsd: posNum(process.env.FAMILY_MONTHLY_AI_USD, 4),
  // The Basic plan (one young builder; docs/decisions.md "Paid plans" §17): a family-type plan for 1 linked child, with
  // its own extra messages a UTC month and its own AI cost backstop. FAMILY_CHILD_DAILY_MAX applies to it too.
  basicExtraMessages: Math.max(0, num(process.env.BASIC_EXTRA_MESSAGES, 25)),
  basicMonthlyAiUsd: posNum(process.env.BASIC_MONTHLY_AI_USD, 2.5),
  // Spark Packs (server/services/sparks.js; docs/decisions.md "Spark Packs"): one-time top-ups of extra Builder messages
  // for a family with a plan, sold by Stripe Prices with the lookup keys oomba_spark_25 / _60 / _150. Days a pack lasts
  // from its payment, Spark Pack messages one builder may use in a UTC day, and the AI cost (US dollars) each pack message
  // adds to the paid AI pool's ceiling.
  sparkExpiryDays: Math.max(1, Math.floor(num(process.env.SPARK_PACK_EXPIRY_DAYS, 365))),
  sparkDailyMax: Math.max(0, Math.floor(num(process.env.SPARK_PACK_DAILY_MAX, 60))),
  sparkAiUsdPerMessage: posNum(process.env.SPARK_PACK_AI_USD_PER_MESSAGE, 0.1),
  // The paid AI pool (services/ai-budget.js): its monthly ceiling is computed (entitled families x FAMILY_MONTHLY_AI_USD);
  // AI_PAID_MONTHLY_BUDGET_USD caps it. AI_HARD_MONTHLY_USD stops every AI call site-wide (default: free + paid monthly).
  // School plans (server/services/school-billing.js; docs/decisions.md "Paid plans" D6): Builder messages each paid
  // student adds to the school's shared pool per billing year, the fewest students a plan can have, the default daily
  // messages per person from the pool (a school setting; never below BUILDER_DAILY_TURNS), and the AI cost (US dollars)
  // a paid student may use per year (the paid AI pool's ceiling counts paid students x this / 12 a month).
  schoolTurnsPerSeat: Math.max(0, Math.floor(num(process.env.SCHOOL_TURNS_PER_SEAT, 100))),
  schoolMinSeats: Math.max(1, Math.floor(num(process.env.SCHOOL_MIN_SEATS, 25))),
  schoolDailyCapDefault: Math.max(1, Math.floor(num(process.env.SCHOOL_DAILY_CAP_DEFAULT, 30))),
  schoolSeatAiUsd: posNum(process.env.SCHOOL_SEAT_AI_USD, 10),
  // Email (server/services/email.js, docs/decisions.md "Trial emails"): sent with Resend's HTTP API. Off without
  // RESEND_API_KEY; EMAIL_ENABLED=0 stops every send. Trial nudges also need EMAIL_POSTAL_ADDRESS (CAN-SPAM's physical
  // address in the footer): while it is empty they are not sent at all.
  resendApiKey: email.apiKey,
  emailEnabled: email.enabled,
  emailFrom: email.from,
  emailReplyTo: email.replyTo,
  emailPostalAddress: email.postalAddress,
  aiPaidMonthlyBudgetUsd: process.env.AI_PAID_MONTHLY_BUDGET_USD ? posNum(process.env.AI_PAID_MONTHLY_BUDGET_USD, null) : null,
  aiHardMonthlyUsd: process.env.AI_HARD_MONTHLY_USD ? posNum(process.env.AI_HARD_MONTHLY_USD, null) : null,
};
