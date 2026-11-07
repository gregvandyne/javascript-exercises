// The Story Builder renderer service (docs/story-builder.md "Hosting"): renders a story's scenes with Blender on its
// own machine and hands back one MP4 clip per scene. No database, no user data, no secrets but its own token: it gets
// a render spec (sets, characters, camera moves, frame counts; never a child's words) and returns pictures.
//
//   node services/story-renderer/server.js      PORT (default 4800), STORY_RENDER_TOKEN (required)
//   GET    /health                      -> 200 { ok, busy, engine }                         (no token: the host's check)
//   POST   /jobs     { key, spec }      -> 202 { id, total } | 503 busy | 400 bad spec | 413 too large
//   GET    /jobs/:id                    -> { id, status: running|done|failed, done, total, engine, frameSeconds, clips, error }
//   GET    /jobs/:id/clips/:scene       -> video/mp4 (a render-only job)
//   GET    /jobs/:id/files/story.mp4 | poster.jpg   (a job sent with `assemble`: the finished video)
// With `assemble` (the timeline, the ASS captions, the music's seed, the voice clips) the service also composes the
// music-box lullaby and builds the final video with ffmpeg, so the web server never needs the memory for that.
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
import { assemble as buildVideo } from '../../server/stories/assemble.js';
import { lullaby, writeWav } from '../../server/services/story-music.js';
import { checkSpec, checkAssemble, MAX_BODY } from './spec.js';

const log = (level, msg, extra = {}) => process.stdout.write(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }) + '\n');
const sameToken = (a, b) => { const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest(); return crypto.timingSafeEqual(x, y); };

/** -> http.Server (not listening). opts: { token, dir, renderer, keepMs } */
export function createRendererService({ token, dir, renderer = new LocalBlenderRenderer(), keepMs = (+process.env.STORY_RENDER_KEEP_MIN || 60) * 60e3 } = {}) {
  if (!token || String(token).length < 24) throw new Error('STORY_RENDER_TOKEN is required (at least 24 characters)');
  // Start clean: whatever an earlier run left in the work folder goes (the folder itself may belong to root).
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f), { recursive: true, force: true });
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
  const view = j => ({ id: j.id, key: j.key, status: j.status, phase: j.phase, done: j.done, total: j.total, engine: j.engine, frameSeconds: Math.round(j.frameSeconds * 10) / 10, clips: Object.keys(j.clips || {}), files: Object.keys(j.files || {}), music: j.music || undefined, error: j.error || undefined });

  /** Compose the music, write the voice clips and captions, and build story.mp4 + poster.jpg from the scene clips. */
  async function assembleJob(j, clips) {
    const a = j.assemble, adir = path.join(j.dir, 'asm');
    fs.mkdirSync(adir, { recursive: true });
    const bed = lullaby({ seconds: a.music.seconds, seed: a.music.seed, duck: a.music.duck });
    const music = path.join(adir, 'music.wav');
    writeWav(music, [bed.left, bed.right]);
    const voice = a.voice.map((v, i) => { const f = path.join(adir, `line-${i}.${v.ext}`); fs.writeFileSync(f, v.data); return { file: f, start: v.start }; });
    const ass = path.join(adir, 'captions.ass');
    fs.writeFileSync(ass, a.ass);
    const out = path.join(adir, 'story.mp4');
    const r = await buildVideo({ tl: a.timeline, sceneClips: j.sceneIds.map(id => clips[id]), fps: j.fps, width: j.width, height: j.height, music, clips: voice, ass, out, xfade: a.xfade, posterAt: a.posterAt });
    return { files: { 'story.mp4': r.video, 'poster.jpg': r.poster }, music: bed.info };
  }

  function start(key, spec, asm = null) {
    const id = crypto.randomBytes(9).toString('base64url');
    const jdir = path.join(dir, id);
    fs.mkdirSync(jdir, { recursive: true });
    const step = Math.max(1, spec.step || 1);
    const total = spec.scenes.reduce((n, s) => n + Math.ceil(s.frames / step), 0);
    const j = { id, key, status: 'running', phase: 'render', done: 0, total, engine, frameSeconds: 0, clips: null, files: null, assemble: asm, sceneIds: spec.scenes.map(s => s.id), fps: spec.fps, width: spec.width, height: spec.height, dir: jdir, ctrl: new AbortController(), startedAt: Date.now() };
    jobs.set(id, j);
    log('info', 'job started', { id, scenes: spec.scenes.length, total, width: spec.width, height: spec.height });
    renderer.render({ ...spec, out_dir: path.join(jdir, 'out') }, { signal: j.ctrl.signal, onProgress: p => { j.done = p.done; j.frameSeconds += p.sec || 0; } })
      .then(async r => {
        Object.assign(j, { engine: r.engine, done: r.frames });
        log('info', 'render done', { id, frames: r.frames, seconds: Math.round(r.seconds), secPerFrame: r.frames ? Math.round((r.frameSeconds / r.frames) * 100) / 100 : null });
        if (j.assemble && jobs.has(id)) {
          j.phase = 'assemble';
          const t1 = Date.now();
          const built = await assembleJob(j, r.clips);
          fs.rmSync(path.join(jdir, 'out'), { recursive: true, force: true });   // the clips are inside the video now
          j.assemble = null;   // drop the voice clips from memory
          Object.assign(j, built);
          log('info', 'assembled', { id, seconds: Math.round((Date.now() - t1) / 1000) });
        } else j.clips = r.clips;
        if (!jobs.has(id)) return;
        Object.assign(j, { status: 'done', ctrl: null, finishedAt: Date.now() });
      })
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
        let asm = null;
        if (body.assemble !== undefined) {
          const a = checkAssemble(body.assemble, c.spec);
          if (!a.ok) return send(res, 400, { error: 'bad assembly bundle', problems: a.problems.slice(0, 10) });
          asm = a.assemble;
        }
        const j = start(key, c.spec, asm);
        return send(res, 202, { id: j.id, total: j.total });
      }
      const j = jobs.get(parts[1]);
      if (!j) return send(res, 404, { error: 'no such job' });
      if (req.method === 'GET' && parts.length === 2) return send(res, 200, view(j));
      if (req.method === 'DELETE' && parts.length === 2) { forget(j); log('info', 'job deleted', { id: j.id }); res.writeHead(204); return res.end(); }
      if (req.method === 'GET' && parts.length === 4 && parts[2] === 'files') {
        const file = j.status === 'done' && j.files ? j.files[parts[3]] : null;
        if (!file || !fs.existsSync(file)) return send(res, 404, { error: 'no such file' });
        res.writeHead(200, { 'content-type': parts[3].endsWith('.jpg') ? 'image/jpeg' : 'video/mp4', 'content-length': fs.statSync(file).size, 'cache-control': 'no-store' });
        return fs.createReadStream(file).pipe(res);
      }
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
