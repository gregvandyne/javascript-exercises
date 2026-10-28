// Compression and long caching for what search engines and first-time visitors load: page loads are judged on speed.
//
//   compressPublicPages   gzip/brotli for text answers to SIGNED-OUT requests only (pages, sitemap, robots, JSON). A
//                         signed-in page can hold secrets (login cards, class and friend codes, chats) next to text an
//                         attacker can put in the URL; compressing those would leak them through the response size
//                         (BREACH). Signed-out pages hold nothing secret. Streams (the Builder) are never touched.
//   staticAssets          /css and /js files asked for with ?v= (layout.js adds it, new on every boot): compressed once,
//                         kept in memory, and cached by browsers for a year. Without ?v= express.static answers as before.
//   versionedCache        ?v= pictures, icons and the manifest: cached for a year too (their ?v= changes with the file).
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';

const TEXT = /^(text\/(html|css|plain|xml|javascript)|application\/(json|xml|javascript|manifest\+json|ld\+json)|image\/svg\+xml)\b/i;
export const MIN_BYTES = 1024;
export const YEAR = 'public, max-age=31536000, immutable';
/** The best encoding this request accepts: 'br', 'gzip' or null. */
export function pickEncoding(header) {
  const h = String(header || '');
  if (/\bbr\b(?!;q=0(\.0*)?\b)/.test(h)) return 'br';
  if (/\bgzip\b(?!;q=0(\.0*)?\b)/.test(h)) return 'gzip';
  return null;
}
export const compressBuffer = (buf, enc, quality = 5) => (enc === 'br'
  ? zlib.brotliCompressSync(buf, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length } })
  : zlib.gzipSync(buf, { level: quality >= 9 ? 9 : 6 }));

export function compressPublicPages(req, res, next) {
  const enc = pickEncoding(req.headers['accept-encoding']);
  const send = res.send;
  res.send = function (body) {
    if (typeof body === 'string' || Buffer.isBuffer(body)) {
      const type = res.get('Content-Type') || (typeof body === 'string' ? 'text/html' : '');
      if (TEXT.test(type)) {
        res.vary('Accept-Encoding');
        const size = Buffer.byteLength(body);
        if (enc && !req.user && size >= MIN_BYTES && !res.get('Content-Encoding') && res.statusCode !== 204 && res.statusCode !== 304
          && !/no-transform/.test(res.get('Cache-Control') || '')) {
          if (!res.get('Content-Type')) res.type('html');
          res.set('Content-Encoding', enc);
          return send.call(this, compressBuffer(Buffer.isBuffer(body) ? body : Buffer.from(body), enc));
        }
      }
    }
    return send.call(this, body);
  };
  next();
}

/** ?v= CSS and JS from dir (public/css, public/js), compressed once per file version. */
export function staticAssets(dir, { types = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' } } = {}) {
  const cache = new Map();
  return (req, res, next) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !req.query.v) return next();
    let rel; try { rel = decodeURIComponent(req.path.replace(/^\/+/, '')); } catch { return next(); }
    const type = types[path.extname(rel).toLowerCase()];
    if (!type || rel.includes('..') || rel.includes('\0')) return next();
    const abs = path.join(dir, rel);
    if (!abs.startsWith(dir + path.sep)) return next();
    let st; try { st = fs.statSync(abs); } catch { return next(); }
    if (!st.isFile()) return next();
    const enc = pickEncoding(req.headers['accept-encoding']);
    const key = `${abs}|${st.mtimeMs}|${enc || 'identity'}`;
    let body = cache.get(key);
    if (!body) {
      const raw = fs.readFileSync(abs);
      body = enc ? compressBuffer(raw, enc, 11) : raw;
      if (cache.size > 200) cache.clear();
      cache.set(key, body);
    }
    res.set({ 'Content-Type': type, 'Cache-Control': YEAR, Vary: 'Accept-Encoding', 'Last-Modified': st.mtime.toUTCString(), ...(enc ? { 'Content-Encoding': enc } : {}) });
    res.end(req.method === 'HEAD' ? undefined : body);
  };
}

/** express.static setHeaders: a ?v= request (the URL changes whenever the file does) is cached for a year. */
export function versionedCache(res) {
  if (res.req && res.req.query && res.req.query.v) res.set('Cache-Control', YEAR);
}
