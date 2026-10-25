// App factory. createApp() returns a configured Express app (used by index.js and by tests).
import { countVisits } from './services/traffic.js';
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { sessionMiddleware, csrfCheck } from './auth.js';
import { notFound, page } from './views/layout.js';
import { html } from './views/html.js';
import { log } from './services/log.js';
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

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  // Off by default: a directly-exposed server must NOT trust a client-supplied X-Forwarded-For (it would let anyone
  // spoof req.ip and bypass every IP-keyed rate limit). A real proxy deployment sets TRUST_PROXY to its address/CIDR
  // or hop count, and its edge must overwrite (not append) X-Forwarded-For.
  app.set('trust proxy', (() => { const v = process.env.TRUST_PROXY; if (!v || v === '0' || v === 'false') return false; const n = Number(v); return Number.isInteger(n) ? n : v; })());
  app.set('query parser', 'simple');

  // Structured request log (one JSON line per request) + timing.
  app.use((req, res, next) => {
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      // originalUrl, because a mounted handler (e.g. /vendor) that ends the response leaves req.path stripped.
      const p = req.originalUrl.split('?')[0];
      if (!config.logRequests || p.startsWith('/css/') || p.startsWith('/fonts/') || p.startsWith('/vendor/')) return;
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
  // Self-hosted game libraries (public/vendor/three/<version>/ for 3D games). A versioned folder never changes, so it is
  // cached for a year. Game frames are opaque-origin and load these as module scripts, which needs CORS.
  // A CORS preflight (only sent if something adds request headers, e.g. a test harness) is answered too: public files, no credentials.
  app.use('/vendor', (req, res, next) => {
    if (req.method !== 'OPTIONS') return next();
    const asked = String(req.get('access-control-request-headers') || '');
    res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Max-Age': '86400', ...(/^[\w-]+(\s*,\s*[\w-]+)*$/.test(asked) ? { 'Access-Control-Allow-Headers': asked } : {}) });
    res.status(204).end();
  });
  // The three.js files are large text, so compress them. The app has no general compression (static HTML is
  // small and first-paint-critical), so this is scoped to /vendor's library files only. Each compressed form is
  // built once and kept in memory (the folder is immutable); the browser decompresses before checking SRI.
  const VENDOR_ROOT = path.join(ROOT, 'public/vendor');
  const vendorGz = new Map();
  const vendorCompressed = (abs, enc) => {
    const key = enc + '|' + abs;
    if (vendorGz.has(key)) return vendorGz.get(key);
    const raw = fs.readFileSync(abs);
    const out = enc === 'br' ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }) : zlib.gzipSync(raw, { level: 9 });
    if (vendorGz.size < 64) vendorGz.set(key, out);
    return out;
  };
  app.use('/vendor', (req, res, next) => {
    if (req.method !== 'GET') return next();
    const rel = decodeURIComponent(req.path.replace(/^\/+/, ''));
    if (rel.includes('..') || !/\.(js|css|json)$/i.test(rel)) return next();   // only text; other files via express.static
    const enc = /\bbr\b/.test(req.headers['accept-encoding'] || '') ? 'br' : /\bgzip\b/.test(req.headers['accept-encoding'] || '') ? 'gzip' : null;
    if (!enc) return next();
    const abs = path.join(VENDOR_ROOT, rel);
    if (!abs.startsWith(VENDOR_ROOT + path.sep) || !fs.existsSync(abs) || !fs.statSync(abs).isFile()) return next();
    let body; try { body = vendorCompressed(abs, enc); } catch { return next(); }
    res.set({
      'Content-Type': rel.endsWith('.css') ? 'text/css; charset=utf-8' : rel.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/javascript; charset=utf-8',
      'Content-Encoding': enc, 'Vary': 'Accept-Encoding',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(body);
  });
  app.use('/vendor', express.static(path.join(ROOT, 'public/vendor'), { index: false, immutable: true, maxAge: '365d', setHeaders: res => res.set({ 'Access-Control-Allow-Origin': '*', 'Cross-Origin-Resource-Policy': 'cross-origin' }) }));
  app.use(express.static(path.join(ROOT, 'public'), { maxAge: config.env === 'production' ? '1h' : 0, index: false }));
  app.use(express.json({ limit: '3mb' }));
  app.use(express.text({ type: 'text/plain', limit: '64kb' }));
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
    log('error', 'unhandled', { path: req.path, error: err.message, stack: err.stack });
    const t = tReq(req);
    if (err.type === 'entity.too.large') return res.status(413).json({ error: t('errors.api.tooBig') });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: t('errors.api.badRequest') });
    if (req.originalUrl.startsWith('/api/')) return res.status(500).json({ error: t('errors.api.server') });
    page(req, res, { title: t('errors.broken.title'), body: html`<div class="empty"><div class="emo">🛠️</div><h1>${t('errors.broken.heading')}</h1><p>${t('errors.broken.text')}</p><a class="btn btn-primary" href="/">${t('errors.goHome')}</a></div>` }, 500);
  });
  return app;
}
