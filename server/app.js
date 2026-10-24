// App factory. createApp() returns a configured Express app (used by index.js and by tests).
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, csrfCheck } from './auth.js';
import { notFound, page } from './views/layout.js';
import { html } from './views/html.js';
import { log } from './services/log.js';
import { middleware as i18n, tReq } from './i18n/index.js';
import { router as authRoutes } from './routes/auth.js';
import { router as discoverRoutes } from './routes/discover.js';
import { router as gameRoutes } from './routes/games.js';
import { router as studioRoutes } from './routes/studio.js';
import { router as socialRoutes } from './routes/social.js';
import { router as chatRoutes } from './routes/chat.js';
import { router as adminRoutes } from './routes/admin.js';
import { router as adsRoutes } from './routes/ads.js';
import { router as creatorRoutes } from './routes/creator.js';
import { router as infoRoutes } from './routes/info.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-src 'self'; media-src 'self' data: blob:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.TRUST_PROXY === '0' ? false : 1);
  app.set('query parser', 'simple');

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
  app.get('/health', (req, res) => res.json({ ok: true, uptime: Math.round(process.uptime()) }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.env === 'production' ? '1h' : 0, index: false }));
  app.use(express.json({ limit: '3mb' }));
  app.use(express.text({ type: 'text/plain', limit: '64kb' }));
  app.use(sessionMiddleware);
  app.use(i18n);
  app.use(csrfCheck);

  for (const r of [authRoutes, discoverRoutes, gameRoutes, studioRoutes, socialRoutes, chatRoutes, adminRoutes, adsRoutes, creatorRoutes, infoRoutes]) app.use(r);

  app.use('/api', (req, res) => res.status(404).json({ error: tReq(req)('errors.api.notFound') }));
  app.use((req, res) => notFound(req, res));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    log('error', 'unhandled', { path: req.path, error: err.message, stack: err.stack });
    const t = tReq(req);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: t('errors.api.tooBig') });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: t('errors.api.badRequest') });
    if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: t('errors.api.server') });
    page(req, res, { title: t('errors.broken.title'), body: html`<div class="empty"><div class="emo">🛠️</div><h1>${t('errors.broken.heading')}</h1><p>${t('errors.broken.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 500);
  });
  return app;
}
