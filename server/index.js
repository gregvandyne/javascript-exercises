// Server entry point: startup checks, boot, scheduled jobs, graceful shutdown (server/shutdown.js).
import { config, MIN_SECRET_LENGTH } from './config.js';
import { log } from './services/log.js';

// A malformed setting stops the start with a clear message instead of being silently ignored.
for (const e of config.configErrors) log('error', 'startup failed', { error: e });
if (config.configErrors.length) process.exit(1);

let mods;
try {
  mods = {
    ...(await import('./app.js')), ...(await import('./db.js')), ...(await import('./auth.js')), ...(await import('./services/jobs.js')),
    ...(await import('./services/shots.js')), ...(await import('./services/snapshot.js')), ...(await import('./builder/runner.js')), ...(await import('./shutdown.js')),
    ...(await import('./domain.js')), ...(await import('./site.js')), ...(await import('./oidc.js')),
  };
} catch (e) {
  // e.g. REQUIRE_SESSION_SECRET=1 without SESSION_SECRET, an unwritable data folder, a bad BRB_JOURNAL_MODE.
  log('error', 'startup failed', { error: e.message });
  process.exit(1);
}
const { createApp, trustProxySetting, db, JOURNAL_MODE, secretSource, startJobs, startSweeper, stopSweeper, closeBrowser, busyCount, makeShutdown, recover, startRunner, drain, handOff, startHostCheck, stopHostCheck, legacyHosts, googleEnabled } = mods;

if (secretSource !== 'env' && config.env === 'production') {
  log('warn', 'SESSION_SECRET is not set: sessions are signed with a secret stored in the database. Set SESSION_SECRET (scripts/export-session-secret.js copies the current one, so nobody is signed out) and REQUIRE_SESSION_SECRET=1.', { secretSource });
} else if (secretSource === 'env' && config.env === 'production' && config.sessionSecret.length < MIN_SECRET_LENGTH) {
  log('warn', `SESSION_SECRET is shorter than ${MIN_SECRET_LENGTH} characters: easy to guess. Make a new one with openssl rand -hex 32 (everyone signs in again once).`);
}

const app = createApp();
// Builds the last process left unfinished (a deploy hands them off; a crash leaves them running) are carried on or
// stopped before any request arrives (runner.js: single instance only).
try { recover(); } catch (e) { log('error', 'builder recovery failed', { error: e.message }); }
const server = app.listen(config.port, () => {
  log('info', 'listening', {
    port: config.port, builder: config.anthropicKey ? 'claude' : 'mock', journalMode: JOURNAL_MODE, trustProxy: trustProxySetting(),
    // redirectHosts: the old names that will go to PUBLIC_URL once its self-check passes (server/domain.js).
    publicUrl: config.publicUrl || null, redirectHosts: [...legacyHosts()], sessionSecret: secretSource, maintenance: config.maintenance || undefined,
    google: googleEnabled() ? 'on' : 'off', movedTo: config.movedTo || undefined, movedPermanently: config.movedTo ? config.movedPermanently : undefined,
  });
  startHostCheck();
});
// Keep idle connections open longer than the load balancer does (ALB: 60 s), or it may reuse one we just closed: a 502.
server.keepAliveTimeout = config.keepAliveTimeoutMs;
server.headersTimeout = config.keepAliveTimeoutMs + 1000;
// Half-done Google setup: a warning, not a failed deploy.
if (!!config.googleClientId !== !!config.googleClientSecret) log('warn', 'Google sign-in stays off: set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET');
else if (config.googleClientId && config.env === 'production' && !config.publicUrl) log('warn', 'Google sign-in stays off until PUBLIC_URL is set (its redirect address is PUBLIC_URL/auth/google/callback)');
// The site tells grown-ups they can contact us (deletion, export, a lost password); without an address that leads nowhere.
if (config.env === 'production' && !config.contactEmail) log('warn', 'CONTACT_EMAIL is not set: /parents has no way to contact the team');
startRunner();
const stopJobs = startJobs();
startSweeper();
const shutdown = makeShutdown({
  server, graceMs: config.shutdownGraceMs, busy: busyCount, drain, handOff, log,
  stop: () => { stopJobs(); stopSweeper(); stopHostCheck(); },
  close: () => { closeBrowser(); db.close(); },
});
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
