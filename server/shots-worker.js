// Screenshot worker: a tiny HTTP service that runs games in a headless Chromium and returns the pictures,
// so the browser can live in its own container with NO database, NO data directory and NO other secrets.
// The main app talks to it when SNAPSHOT_URL is set (see server/services/snapshot.js, runRemote).
//
//   node server/shots-worker.js         # listens on SHOTS_PORT (default 4900)
//   GET  /health                        -> 200 "ok"
//   POST /run   Authorization: Bearer <SHOTS_TOKEN>   body { html, opts }
//               -> the same result runGame returns, with the JPEGs as base64.
//
// It refuses to start without SHOTS_TOKEN, caps the request body and the number of jobs in flight, and
// each job is time-limited inside the engine. It uses the exact same rendering code as local mode.
import http from 'node:http';
import crypto from 'node:crypto';
import { config } from './config.js';
import { runLocal, resultToJson, closeBrowser } from './services/snapshot.js';

const TOKEN = config.shotsToken;
if (!TOKEN) { console.error('shots-worker: SHOTS_TOKEN is required; refusing to start.'); process.exit(1); }

const MAX_BODY = 4 * 1024 * 1024;   // a game is <= 2 MB; leave room for base64/opts
const MAX_INFLIGHT = 4;             // the engine runs one at a time; the rest queue, beyond this we say "busy"
let inflight = 0;

const bearer = req => {
  const h = String(req.headers['authorization'] || '');
  const m = h.match(/^Bearer\s+(.+)$/);
  if (!m) return false;
  const a = Buffer.from(m[1]), b = Buffer.from(TOKEN);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const send = (res, status, obj) => { const body = JSON.stringify(obj); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) }); res.end(body); };

const readBody = req => new Promise((resolve, reject) => {
  const len = +req.headers['content-length'];
  if (len && len > MAX_BODY) return reject(Object.assign(new Error('too large'), { status: 413 }));
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'GET' && req.url === '/health') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
    if (req.method !== 'POST' || req.url !== '/run') return send(res, 404, { error: 'not found' });
    if (!bearer(req)) return send(res, 401, { error: 'unauthorized' });
    if (inflight >= MAX_INFLIGHT) return send(res, 503, { error: 'busy' });
    inflight++;
    try {
      const body = await readBody(req);
      let job; try { job = JSON.parse(body.toString('utf8')); } catch { return send(res, 400, { error: 'bad json' }); }
      if (!job || typeof job.html !== 'string') return send(res, 400, { error: 'html required' });
      const opts = job.opts && typeof job.opts === 'object' ? job.opts : {};
      const r = await runLocal(job.html, opts);
      return send(res, 200, resultToJson(r));
    } finally { inflight--; }
  } catch (e) {
    const status = e && e.status ? e.status : 500;
    return send(res, status, { error: String((e && e.message) || e).split('\n')[0].slice(0, 200) });
  }
});
server.requestTimeout = 90_000;
server.headersTimeout = 20_000;
server.listen(config.shotsPort, () => console.log(JSON.stringify({ level: 'info', msg: 'shots-worker listening', port: config.shotsPort })));

function shutdown() { server.close(() => closeBrowser().finally(() => process.exit(0))); setTimeout(() => process.exit(1), 10_000).unref(); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
