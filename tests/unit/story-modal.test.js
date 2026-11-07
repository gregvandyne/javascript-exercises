// The Modal renderer (services/story-renderer/modal_app.py), without a Modal account: its web API served locally
// (`python3 modal_app.py --serve PORT`, the LocalBackend) runs the very scene function the GPU containers run, on this
// machine's CPU, and the site's STORY_RENDERER=modal client renders a tiny two-scene spec through it. Skipped when
// Python with bpy, FastAPI and uvicorn isn't installed.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const APP = path.join(ROOT, 'services/story-renderer/modal_app.py');
const PY = process.env.STORY_PYTHON || 'python3';
const ok = spawnSync(PY, ['-c', 'import bpy, fastapi, uvicorn'], { timeout: 120e3 }).status === 0 && spawnSync('ffmpeg', ['-version']).status === 0;
const TOKEN = 'modal-test-token-0123456789abcdef';
const freePort = () => new Promise(r => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => r(p)); }); });

test('Modal renderer API, served locally on the CPU: auth, limits, two scenes in parallel, clips back', { skip: ok ? false : 'needs python3 with bpy, fastapi and uvicorn, and ffmpeg', timeout: 10 * 60e3 }, async () => {
  const port = await freePort();
  const srv = spawn(PY, [APP, '--serve', String(port)], { env: { ...process.env, STORY_RENDER_TOKEN: TOKEN, STORY_LOCAL_WORKERS: '2' }, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; srv.stderr.on('data', d => { err = (err + d).slice(-4000); });
  const url = `http://127.0.0.1:${port}`;
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'modal-local-'));
  try {
    for (let i = 0; ; i++) { try { if ((await fetch(url + '/health')).ok) break; } catch { /* starting */ } if (i > 300) throw new Error('server did not start: ' + err); await new Promise(r => setTimeout(r, 200)); }
    const health = await (await fetch(url + '/health')).json();
    assert.equal(health.ok, true);
    assert.ok(['eevee', 'cycles'].includes(health.engine), health.engine);
    const spec = { width: 128, height: 72, fps: 8, step: 4, samples: 1, key: 'k1',
      scenes: [{ id: 's1', set: 'lighthouse', time: 'night', props: [], characters: [{ kind: 'mouse', action: 'walk', place: 'left' }], camera: 'slow_push', frames: 8, seed: 1, focus: 'mouse' },
        { id: 's2', set: 'forest', time: 'dusk', props: ['fireflies'], characters: [{ kind: 'owl', action: 'idle', place: 'center' }], camera: 'drift', frames: 8, seed: 2, focus: null }] };
    const post = (body, token = TOKEN) => fetch(url + '/jobs', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    assert.equal((await post({ key: 'x', spec }, 'wrong-token-0123456789abcdef-xyz')).status, 401);
    assert.equal((await fetch(url + '/jobs/abc')).status, 401);
    const bad = await post({ key: 'x', spec: { ...spec, width: 99999, scenes: [{ ...spec.scenes[0], id: '../x' }] } });
    assert.equal(bad.status, 400);
    assert.match((await bad.json()).problems.join(' '), /width.*scenes\[0\]\.id/);
    assert.equal((await post({ key: 'x', spec: 'x'.repeat(300 * 1024) })).status, 413);
    // the site's client, exactly as the worker uses it
    process.env.STORY_RENDERER = 'modal'; process.env.STORY_RENDER_URL = url; process.env.STORY_RENDER_TOKEN = TOKEN;
    const { createRenderer } = await import('../../server/stories/renderer.js');
    const rr = createRenderer({ pollMs: 500 });
    assert.deepEqual([rr.name, rr.assembles], ['modal', false]);
    const seen = [];
    const r = await rr.render({ ...spec, out_dir: path.join(out, 'frames') }, { onProgress: p => seen.push(p.done) });
    assert.deepEqual(Object.keys(r.clips), ['s1', 's2']);
    for (const f of Object.values(r.clips)) {
      const info = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height,nb_frames', '-of', 'json', f]).stdout.toString()).streams[0];
      assert.deepEqual([info.codec_name, info.width, info.height, +info.nb_frames], ['h264', 128, 72, 2]);
    }
    assert.equal(r.frames, 4);
    assert.ok(seen.includes(4));
  } finally {
    delete process.env.STORY_RENDERER; delete process.env.STORY_RENDER_URL; delete process.env.STORY_RENDER_TOKEN;
    srv.kill('SIGTERM');
    fs.rmSync(out, { recursive: true, force: true });
  }
});
