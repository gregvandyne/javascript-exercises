// Story Builder: the render step, behind a small interface so it can move to a dedicated render machine later
// (docs/story-builder.md "Hosting"). A renderer is:
//   { name, probe(): Promise<{ engine }>, render(spec, { onProgress, signal }): Promise<{ engine, frames, seconds }> }
// spec is render_story.py's input (width, height, fps, step, samples, scenes[...]) plus out_dir; frames land in
// <out_dir>/<scene id>/f_00000.png ... The only implementation today is LocalBlenderRenderer: Blender as a Python
// module (pip install bpy) on this machine, EEVEE first (needs libEGL; on a machine without a GPU it renders through
// Mesa's llvmpipe), Cycles on the CPU (low samples + denoise) when EEVEE can't start. A remote renderer would POST the
// spec to a render box and download the frames (or the finished scene clips): same interface.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeClip } from './clip.js';
import { RemoteRenderer } from './remote-renderer.js';

export const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'blender', 'render_story.py');

/** Does `python -c "import bpy"` work here? (Tests skip the render when it doesn't.) */
export function hasBpy(python = process.env.STORY_PYTHON || 'python3') {
  return new Promise(resolve => {
    const p = spawn(python, ['-c', 'import bpy'], { stdio: 'ignore' });
    const t = setTimeout(() => { p.kill('SIGKILL'); resolve(false); }, 120000);
    p.on('error', () => { clearTimeout(t); resolve(false); });
    p.on('close', code => { clearTimeout(t); resolve(code === 0); });
  });
}

function runPython(python, args, { onLine, signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const p = spawn(python, ['-u', SCRIPT, ...args], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONUNBUFFERED: '1' } });
    let buf = '', err = '';
    const kill = () => { try { p.kill('SIGKILL'); } catch { /* gone */ } };
    const timer = timeoutMs ? setTimeout(kill, timeoutMs) : null;
    if (signal) { if (signal.aborted) kill(); else signal.addEventListener('abort', kill, { once: true }); }
    p.stdout.on('data', d => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (line.startsWith('{')) { try { onLine && onLine(JSON.parse(line)); } catch { /* not ours */ } }
      }
    });
    p.stderr.on('data', d => { err += d; if (err.length > 40000) err = err.slice(-20000); });
    p.on('error', e => { if (timer) clearTimeout(timer); reject(e); });
    p.on('close', code => {
      if (timer) clearTimeout(timer);
      if (signal && signal.aborted) return reject(Object.assign(new Error('render stopped'), { code: 'stopped' }));
      code === 0 ? resolve() : reject(new Error(`render exited ${code}: ${err.split('\n').filter(l => !/EGL Error/.test(l)).slice(-8).join(' | ')}`));
    });
  });
}

export class LocalBlenderRenderer {
  /** opts: { python, engine: 'auto'|'eevee'|'cycles', procs: scenes rendered at once } */
  constructor({ python = process.env.STORY_PYTHON || 'python3', engine = process.env.STORY_ENGINE || 'auto', procs = +process.env.STORY_RENDER_PROCS || 1 } = {}) {
    this.name = 'local-blender';
    this.python = python;
    this.engine = engine;
    this.procs = Math.max(1, Math.min(os.cpus().length, procs | 0 || 1));
    this._probed = null;
  }

  /** The engine this machine can use: EEVEE if a tiny test frame renders, else Cycles. Cached. */
  async probe() {
    if (this.engine === 'eevee' || this.engine === 'cycles') return { engine: this.engine };
    if (!this._probed) {
      this._probed = (async () => {
        for (const engine of ['eevee', 'cycles']) {
          try { await runPython(this.python, ['--probe', engine], { timeoutMs: 180000 }); return { engine }; } catch { /* try the next */ }
        }
        throw new Error('no Blender engine works on this machine (is bpy installed?)');
      })();
      this._probed.catch(() => { this._probed = null; });
    }
    return this._probed;
  }

  /** Render every scene of the spec. onProgress({ done, total, scene, sec }) after each frame. Each finished scene
   *  becomes <out_dir>/<scene id>.mp4 (clip.js) and its frames are removed (keepFrames: keep them, for previews).
   *  -> { engine, frames, seconds, frameSeconds, clips: { [scene id]: file } } */
  async render(spec, { onProgress = null, signal = null, keepFrames = false } = {}) {
    const { engine } = await this.probe();
    const full = { ...spec, engine };
    fs.mkdirSync(full.out_dir, { recursive: true });
    const specFile = path.join(full.out_dir, 'spec.json');
    fs.writeFileSync(specFile, JSON.stringify(full));
    const step = Math.max(1, full.step || 1);
    const perScene = full.scenes.map(s => (full.only_frames ? full.only_frames.length : Math.ceil(s.frames / step)));
    const total = perScene.reduce((a, b) => a + b, 0);
    let done = 0, secs = 0;
    const t0 = Date.now();
    const queue = full.scenes.map((s, i) => i);
    const clips = {};
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift();
        await runPython(this.python, [specFile, String(i)], {
          signal,
          onLine: m => {
            if (m.frame) { done++; secs += m.sec || 0; onProgress && onProgress({ done, total, scene: m.scene, sec: m.sec }); }
          },
        });
        if (full.only_frames) continue;
        const id = full.scenes[i].id, dir = path.join(full.out_dir, id);
        clips[id] = await encodeClip(dir, path.join(full.out_dir, `${id}.mp4`), { fps: full.fps || 24, step });
        if (!keepFrames) fs.rmSync(dir, { recursive: true, force: true });
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.procs, queue.length) }, worker));
    return { engine, frames: done, seconds: (Date.now() - t0) / 1000, frameSeconds: secs, clips };
  }
}

/** The renderer the worker uses: STORY_RENDERER 'local' (Blender on this machine, the default) or 'remote' (the
 *  story renderer service at STORY_RENDER_URL, services/story-renderer/). */
export function createRenderer(opts = {}) {
  const kind = process.env.STORY_RENDERER || 'local';
  if (kind === 'remote') return new RemoteRenderer(opts);
  if (kind !== 'local') throw new Error(`STORY_RENDERER=${kind} is not available ("local" or "remote")`);
  return new LocalBlenderRenderer(opts);
}
