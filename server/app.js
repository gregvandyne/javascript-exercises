// App factory. createApp() returns a configured Express app (used by index.js and by tests).
import { countVisits } from './services/traffic.js';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, csrfCheck } from './auth.js';
import { notFound, page } from './views/layout.js';
import { html } from './views/html.js';
import { log } from './services/log.js';
import { handler as health, lifecycle } from './services/health.js';
import { BRAND } from './views/brand.js';
import { middleware as i18n, tReq } from './i18n/index.js';
import { middleware as theme } from './theme.js';
import { router as authRoutes } from './routes/auth.js';
import { router as discoverRoutes } from './routes/discover.js';
import { router as gameRoutes } from './routes/games.js';
import { router as studioRoutes } from './routes/studio.js';
import { router as socialRoutes } from './routes/social.js';
import { router as chatRoutes } from './routes/chat.js';
import { router as adminRoutes } from './routes/admin.js';
import { router as schoolRoutes } from './routes/schools.js';
import { router as lessonRoutes } from './routes/lessons.js';
import { router as progressRoutes } from './routes/progress.js';
import { router as infoRoutes } from './routes/info.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

/** TRUST_PROXY -> Express's 'trust proxy' value: false, a hop count, or an address/CIDR list. */
export const trustProxySetting = (v = process.env.TRUST_PROXY) => { if (!v || v === '0' || v === 'false') return false; const n = Number(v); return Number.isInteger(n) ? n : v; };
// One warning per process when a proxy's X-Forwarded-For arrives but TRUST_PROXY is off.
const warned = { xff: false };
export const _proxyWarning = warned;
// Bodies from browsers are never compressed: refusing Content-Encoding closes off decompression attacks.
const NO_INFLATE = { inflate: false };

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Off by default: a directly-exposed server must NOT trust a client-supplied X-Forwarded-For (it would let anyone
  // spoof req.ip and bypass every IP-keyed rate limit). A real proxy deployment sets TRUST_PROXY to its address/CIDR
  // or hop count, and its edge must overwrite (not append) X-Forwarded-For. README.md has the hop count per platform.
  const trust = trustProxySetting();
  app.set('trust proxy', trust);
  app.set('query parser', 'simple');
  // While shutting down: finish this request, then close the connection so the client reconnects elsewhere.
  app.use((req, res, next) => { if (lifecycle.draining) res.set('Connection', 'close'); next(); });
  // Health first: no request log line per probe, no session, works in maintenance mode.
  app.get('/health', health);
  if (!trust) {
    app.use((req, res, next) => {
      if (!warned.xff && req.headers['x-forwarded-for']) {
        warned.xff = true;
        log('warn', 'X-Forwarded-For arrived but TRUST_PROXY is off: every visitor gets the proxy\'s address, so IP rate limits hit everyone at once. Set TRUST_PROXY to the number of proxies in front of the app (see README).');
      }
      next();
    });
  }

  // Structured request log (one JSON line per request) + timing.
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      if (!config.logRequests || req.path.startsWith('/css/') || req.path.startsWith('/fonts/')) return;
      log('info', 'request', { method: req.method, path: req.path, status: res.statusCode, ms: Number(process.hrtime.bigint() - t0) / 1e6, user: req.user ? req.user.id : null });
    });
    // A connection that closes before the response is done (e.g. a phone dropping a long Builder stream).
    res.on('close', () => {
      if (res.writableFinished || !config.logRequests) return;
      log('info', 'request closed early', { method: req.method, path: req.path, ms: Number(process.hrtime.bigint() - t0) / 1e6, user: req.user ? req.user.id : null });
    });
    next();
  });
  // Security headers for the site (the game frame overrides CSP with its own, stricter one).
  app.use((req, res, next) => {
    res.set({ 'Content-Security-Policy': SITE_CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()', 'Cross-Origin-Opener-Policy': 'same-origin' });
    if (config.env === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
    next();
  });
  // Moving day (see docs/deploy-aws.md / deploy-azure.md, cut-over): the old host redirects, or says "back soon".
  if (config.movedTo) app.use(movedTo);
  if (config.maintenance) app.use(maintenancePage);
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.env === 'production' ? '1h' : 0, index: false }));
  app.use(express.json({ limit: '3mb', ...NO_INFLATE }));
  app.use(express.text({ type: 'text/plain', limit: '64kb', ...NO_INFLATE }));
  app.use(sessionMiddleware);
  app.use(countVisits);
  app.use(i18n);
  app.use(theme);
  app.use(csrfCheck);

  for (const r of [authRoutes, discoverRoutes, gameRoutes, studioRoutes, socialRoutes, chatRoutes, adminRoutes, schoolRoutes, progressRoutes, lessonRoutes, infoRoutes]) app.use(r);

  app.use('/api', (req, res) => res.status(404).json({ error: tReq(req)('errors.api.notFound') }));
  app.use((req, res) => notFound(req, res));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const t = tReq(req);
    if (err.type === 'encoding.unsupported') return res.status(415).json({ error: t('errors.api.badRequest') });
    log('error', 'unhandled', { path: req.path, error: err.message, stack: err.stack });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: t('errors.api.tooBig') });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: t('errors.api.badRequest') });
    if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: t('errors.api.server') });
    page(req, res, { title: t('errors.broken.title'), body: html`<div class="empty"><div class="emo">🛠️</div><h1>${t('errors.broken.heading')}</h1><p>${t('errors.broken.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 500);
  });
  return app;
}

const hostOnly = h => String(h || '').toLowerCase().replace(/:(80|443)$/, '').replace(/\.$/, '');
/** MOVED_TO_URL: the same path on the new site. A request that already arrives on the new site's name (DNS still
 *  pointing here during a move) gets the "moving" page: redirecting it to itself would loop. */
function movedTo(req, res) {
  const target = new URL(config.movedTo);
  if (hostOnly(req.headers.host) === hostOnly(target.host)) return maintenancePage(req, res);
  // Only a path is appended, so the new site's host can't be changed by the request line.
  const where = config.movedTo + (req.originalUrl.startsWith('/') ? req.originalUrl : '/');
  const get = req.method === 'GET' || req.method === 'HEAD';
  res.redirect(config.movedPermanently ? (get ? 301 : 308) : (get ? 302 : 307), where);
}

/** MAINTENANCE_MODE=1: every page answers 503 "back soon" (health still answers), so nothing writes while data moves. */
function maintenancePage(req, res) {
  res.set({ 'Retry-After': '300', 'Cache-Control': 'no-store' }).status(503);
  if (req.path.startsWith('/api/')) return res.json({ error: `${BRAND} is moving to a new home. Back in a few minutes!` });
  res.type('html').send(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Back soon</title>`
    + `<body style="font:18px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0 16px;text-align:center">`
    + `<div><div style="font-size:64px">🛠️</div><h1>${BRAND} is moving to a new home</h1><p>We'll be back in a few minutes. Your games and saves are safe.</p></div></body></html>`);
}
