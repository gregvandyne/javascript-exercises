// The Story Builder renderer service (docs/story-builder.md "Hosting"): renders a story's scenes with Blender on its
// own machine and hands back one MP4 clip per scene. No database, no user data, no secrets but its own token: it gets
// a render spec (sets, characters, camera moves, frame counts; never a child's words) and returns pictures.
//
//   node services/story-renderer/server.js      PORT (default 4800), STORY_RENDER_TOKEN (required)
//   GET    /health                      -> 200 { ok, busy, engine }                         (no token: the host's check)
//   POST   /jobs     { key, spec }      -> 202 { id, total } | 503 busy | 400 bad spec | 413 too large
//   GET    /jobs/:id                    -> { id, status: running|done|failed, done, total, engine, frameSeconds, clips, error }
//   GET    /jobs/:id/clips/:scene       -> video/mp4
//   DELETE /jobs/:id                    -> 204 (stops it if running; deletes its files)
// One job at a time. A new job with the same key as the running one (the site's worker restarted and sent the same
// story again) replaces it; any other is "busy". Finished jobs are kept for STORY_RENDER_KEEP_MIN minutes (default
// 60) or until deleted; the work folder is emptied at start. Token compared in constant time.
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LocalBlenderRenderer } from '../../server/stories/renderer.js';
import { checkSpec, MAX_BODY } from './spec.js';

const log = (level, msg, extra = {}) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + '\n');
const sameToken = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

/** -> http.Server (not listening). opts: { token, dir, renderer, keepMs } */
export function createRendererService({ token, dir, renderer = new LocalBlenderRenderer(), keepMs = (+process.env.STORY_RENDER_KEEP_MIN || 60) * 60e3 } = {}) {
  if (!token || String(token).length < 24) throw new Error('STORY_RENDER_TOKEN is required (at least 24 characters)');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const jobs = new Map();   // id -> { id, key, status, done, total, engine, frameSeconds, error, clips, dir, ctrl, finishedAt }
  let engine = null;
  renderer.probe().then(r => { engine = r.engine; log('info', 'engine ready', r); }, e => log('error', 'no engine', { error: e.message }));
  const running = () => [...jobs.values()].find(j => j.status === 'running') || null;
  const forget = j => { if (j.ctrl) j.ctrl.abort(); jobs.delete(j.id); fs.rmSync(j.dir, { recursive: true, force: true }); };
  const sweep = setInterval(() => {
    for (const j of jobs.values()) if (j.finishedAt && Date.now() - j.finishedAt > keepMs) { log('info', 'expired', { id: j.id }); forget(j); }
  }, 60e3);
  sweep.unref();

  const send = (res, status, obj) => { const body = JSON.stringify(obj); res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'cache-control': 'no-store' }); res.end(body); };
  const authed = req => { const m = /^Bearer\s+(\S+)$/.exec(String(req.headers.authorization || '')); return !!m && sameToken(m[1], token); };
  const readBody = req => new Promise((resolve, reject) => {
    if (+req.headers['content-length'] > MAX_BODY) return reject(Object.assign(new Error('too large'), { status: 413 }));
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  const view = j => ({ id: j.id, key: j.key, status: j.status, done: j.done, total: j.total, engine: j.engine, frameSeconds: Math.round(j.frameSeconds * 10) / 10, clips: Object.keys(j.clips || {}), error: j.error || undefined });

  function start(key, spec) {
    const id = crypto.randomBytes(9).toString('base64url');
    const jdir = path.join(dir, id);
    fs.mkdirSync(jdir, { recursive: true });
    const step = Math.max(1, spec.step || 1);
    const total = spec.scenes.reduce((n, s) => n + Math.ceil(s.frames / step), 0);
    const j = { id, key, status: 'running', done: 0, total, engine, frameSeconds: 0, clips: null, dir: jdir, ctrl: new AbortController(), startedAt: Date.now() };
    jobs.set(id, j);
    log('info', 'job started', { id, scenes: spec.scenes.length, total, width: spec.width, height: spec.height });
    renderer.render({ ...spec, out_dir: path.join(jdir, 'out') }, { signal: j.ctrl.signal, onProgress: p => { j.done = p.done; j.frameSeconds += p.sec || 0; } })
      .then(r => { Object.assign(j, { status: 'done', engine: r.engine, done: r.frames, clips: r.clips, ctrl: null, finishedAt: Date.now() }); log('info', 'job done', { id, frames: r.frames, seconds: Math.round(r.seconds), secPerFrame: r.frames ? Math.round((r.frameSeconds / r.frames) * 100) / 100 : null }); })
      .catch(e => {
        if (!jobs.has(id)) return;   // deleted while running
        Object.assign(j, { status: 'failed', error: String(e.message || e).slice(0, 300), ctrl: null, finishedAt: Date.now() });
        log('warn', 'job failed', { id, error: j.error });
        fs.rmSync(path.join(jdir, 'out'), { recursive: true, force: true });
      });
    return j;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      const parts = url.pathname.split('/').filter(Boolean);
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, busy: !!running(), engine });
      if (parts[0] !== 'jobs') return send(res, 404, { error: 'not found' });
      if (!authed(req)) { log('warn', 'refused: wrong or missing token'); return send(res, 401, { error: 'unauthorized' }); }
      if (req.method === 'POST' && parts.length === 1) {
        let body;
        try { body = JSON.parse((await readBody(req)).toString('utf8')); } catch (e) { return send(res, e.status || 400, { error: e.status ? 'too large' : 'bad json' }); }
        const key = String((body && body.key) || '').slice(0, 64);
        const c = checkSpec(body && body.spec);
        if (!c.ok) return send(res, 400, { error: 'bad spec', problems: c.problems.slice(0, 10) });
        const cur = running();
        if (cur && cur.key && cur.key === key) { log('info', 'replacing a job with the same key', { id: cur.id }); forget(cur); }
        else if (cur) return send(res, 503, { error: 'busy' });
        const j = start(key, c.spec);
        return send(res, 202, { id: j.id, total: j.total });
      }
      const j = jobs.get(parts[1]);
      if (!j) return send(res, 404, { error: 'no such job' });
      if (req.method === 'GET' && parts.length === 2) return send(res, 200, view(j));
      if (req.method === 'DELETE' && parts.length === 2) { forget(j); log('info', 'job deleted', { id: j.id }); res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && parts.length === 4 && parts[2] === 'clips') {
        const file = j.status === 'done' && j.clips ? j.clips[decodeURIComponent(parts[3])] : null;
        if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'no such clip' });
        const size = fs.statSync(file).size;
        res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': size, 'cache-control': 'no-store' });
        return fs.createReadStream(file).pipe(res);
      }
      return send(res, 404, { error: 'not found' });
    } catch (e) {
      log('error', 'request failed', { error: String(e.message || e).slice(0, 200) });
      if (!res.headersSent) send(res, 500, { error: 'server error' });
    }
  });
  server.requestTimeout = 120e3;
  server.on('close', () => { clearInterval(sweep); for (const j of [...jobs.values()]) forget(j); });
  server.jobs = jobs;
  return server;
}

// Run directly: listen, and on SIGTERM stop the render and clean up.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = +process.env.PORT || 4800;
  const dir = process.env.STORY_RENDER_DIR || path.join(os.tmpdir(), 'story-renderer');
  let server;
  try { server = createRendererService({ token: process.env.STORY_RENDER_TOKEN, dir }); } catch (e) { log('error', 'refusing to start', { error: e.message }); process.exit(1); }
  server.listen(port, () => log('info', 'story renderer listening', { port, dir, procs: +process.env.STORY_RENDER_PROCS || 1 }));
  const bye = sig => { log('info', 'stopping', { sig }); server.close(); setTimeout(() => process.exit(0), 2000).unref(); };
  process.on('SIGTERM', () => bye('SIGTERM'));
  process.on('SIGINT', () => bye('SIGINT'));
}
