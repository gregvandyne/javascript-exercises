// Story Builder: the render step on another machine (docs/story-builder.md "Hosting"). STORY_RENDERER=remote.
// Talks to the story renderer service (services/story-renderer/server.js) at STORY_RENDER_URL with the bearer token
// STORY_RENDER_TOKEN:
//   POST   /jobs                    { key, spec }  -> 202 { id, total }   (503 busy: another story is rendering)
//   GET    /jobs/:id                -> { status: running|done|failed, done, total, engine, frameSeconds, clips, error }
//   GET    /jobs/:id/clips/:scene   -> the scene's MP4 clip
//   DELETE /jobs/:id                -> the service forgets the job and deletes its files
// Polling, not streaming: a dropped connection or a renderer restart costs nothing but a few seconds. `key` is the
// story id, so when this worker restarts and sends the same story again the service drops the old copy and starts over
// instead of answering "busy". Only node built-ins (global fetch).
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const sleep = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(Object.assign(new Error('stopped'), { code: 'stopped' })); }, { once: true });
});

export class RemoteRenderer {
  /** opts: { url, token, pollMs, busyWaitMs (how long to wait for a busy renderer), timeoutMs, fetch } */
  constructor({ url = process.env.STORY_RENDER_URL, token = process.env.STORY_RENDER_TOKEN, pollMs = +process.env.STORY_RENDER_POLL_MS || 3000,
    busyWaitMs = 30 * 60e3, timeoutMs = +process.env.STORY_RENDER_TIMEOUT_MS || 4 * 3600e3, fetch: f = (...a) => globalThis.fetch(...a) } = {}) {
    if (!url) throw new Error('STORY_RENDERER=remote needs STORY_RENDER_URL');
    if (!token) throw new Error('STORY_RENDERER=remote needs STORY_RENDER_TOKEN');
    this.name = 'remote';
    this.url = String(url).replace(/\/+$/, '');
    this.token = token;
    this.pollMs = Math.max(200, pollMs);
    this.busyWaitMs = busyWaitMs;
    this.timeoutMs = timeoutMs;
    this.fetch = f;
  }

  async call(method, p, { body = null, signal = null, raw = false } = {}) {
    const res = await this.fetch(this.url + p, {
      method, signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(raw ? 600e3 : 60e3)]),
      headers: { authorization: `Bearer ${this.token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (raw) return res;
    let data = null; try { data = await res.json(); } catch { /* empty */ }
    return { status: res.status, data: data || {} };
  }

  /** -> { engine } from the service's health check (no token needed there, but it is sent anyway). */
  async probe() {
    const r = await this.call('GET', '/health');
    if (r.status !== 200 || !r.data.ok) throw new Error(`story renderer not healthy (${r.status})`);
    return { engine: r.data.engine || 'unknown' };
  }

  async render(spec, { onProgress = null, signal = null } = {}) {
    const { out_dir: outDir, ...send } = spec;
    fs.mkdirSync(outDir, { recursive: true });
    const key = String(spec.key || path.basename(path.dirname(outDir)) || 'story');
    const t0 = Date.now();
    // 1. hand it over (a busy renderer: wait our turn, within reason)
    let job;
    for (;;) {
      if (signal && signal.aborted) throw Object.assign(new Error('stopped'), { code: 'stopped' });
      const r = await this.call('POST', '/jobs', { body: { key, spec: send }, signal });
      if (r.status === 202) { job = r.data; break; }
      if (r.status === 503 && Date.now() - t0 < this.busyWaitMs) { await sleep(Math.max(this.pollMs, 5000), signal); continue; }
      throw new Error(`story renderer refused the job (${r.status} ${r.data.error || ''})`);
    }
    const stop = () => { this.call('DELETE', `/jobs/${job.id}`).catch(() => {}); };
    try {
      // 2. follow it
      let st, misses = 0;
      for (;;) {
        await sleep(this.pollMs, signal);
        if (Date.now() - t0 > this.timeoutMs) throw new Error('story renderer: timed out');
        let r;
        try { r = await this.call('GET', `/jobs/${job.id}`, { signal }); } catch (e) {
          if (signal && signal.aborted) throw Object.assign(new Error('stopped'), { code: 'stopped' });
          if (++misses > 20) throw new Error(`story renderer unreachable: ${e.message}`);
          continue;
        }
        if (r.status === 404) throw new Error('story renderer lost the job (did it restart?)');
        if (r.status !== 200) { if (++misses > 20) throw new Error(`story renderer: ${r.status}`); continue; }
        misses = 0;
        st = r.data;
        if (onProgress && st.total) onProgress({ done: st.done || 0, total: st.total });
        if (st.status === 'failed') throw new Error(`story renderer: ${st.error || 'render failed'}`);
        if (st.status === 'done') break;
      }
      // 3. fetch the clips
      const clips = {};
      for (const s of spec.scenes) {
        const res = await this.call('GET', `/jobs/${job.id}/clips/${encodeURIComponent(s.id)}`, { signal, raw: true });
        if (res.status !== 200 || !res.body) throw new Error(`story renderer: clip ${s.id} missing (${res.status})`);
        const file = path.join(outDir, `${s.id}.mp4`);
        await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
        clips[s.id] = file;
      }
      stop();
      return { engine: st.engine, frames: st.done, seconds: (Date.now() - t0) / 1000, frameSeconds: st.frameSeconds || 0, clips };
    } catch (e) {
      stop();
      throw e;
    }
  }
}
