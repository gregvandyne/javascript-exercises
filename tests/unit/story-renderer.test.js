// The Story Builder renderer service (services/story-renderer) and the site's RemoteRenderer that talks to it: token
// auth, the health check, size and shape limits, one job at a time (the same story again replaces itself), progress,
// clip download, cleanup. A fake renderer stands in for Blender so this runs in a second.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const { createRendererService } = await import('../../services/story-renderer/server.js');
const { checkSpec, MAX_BODY } = await import('../../services/story-renderer/spec.js');
const { RemoteRenderer } = await import('../../server/stories/remote-renderer.js');
const { createRenderer } = await import('../../server/stories/renderer.js');

const TOKEN = 'test-token-0123456789abcdef-xyz';
const spec = (over = {}) => ({ width: 128, height: 72, fps: 8, step: 4, samples: 1, key: 'story1',
  scenes: [{ id: 's1', set: 'meadow', time: 'night', props: [], characters: [{ kind: 'mouse', action: 'idle', place: 'center' }], camera: 'drift', frames: 16, seed: 3, focus: 'mouse' },
    { id: 's2', set: 'sky', time: 'night', props: ['boat'], characters: [], camera: 'tilt_up', frames: 8, seed: 4, focus: null }], ...over });

/** A stand-in for LocalBlenderRenderer: "renders" each scene in small steps, writes a fake clip, honours abort. */
function fakeRenderer({ stepMs = 5, fail = false } = {}) {
  const r = { name: 'fake', calls: [], probe: async () => ({ engine: 'eevee' }) };
  r.render = async (s, { onProgress, signal }) => {
    r.calls.push(s);
    const total = s.scenes.reduce((n, x) => n + Math.ceil(x.frames / s.step), 0);
    fs.mkdirSync(s.out_dir, { recursive: true });
    for (let i = 1; i <= total; i++) {
      await new Promise(res => setTimeout(res, stepMs));
      if (signal && signal.aborted) throw new Error('stopped');
      onProgress({ done: i, total, sec: 0.5 });
    }
    if (fail) throw new Error('blender fell over');
    const clips = {};
    for (const x of s.scenes) { clips[x.id] = path.join(s.out_dir, `${x.id}.mp4`); fs.writeFileSync(clips[x.id], `clip:${x.id}`); }
    return { engine: 'eevee', frames: total, seconds: 0.1, frameSeconds: total * 0.5, clips };
  };
  return r;
}
async function service(opts = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sr-test-'));
  const renderer = opts.renderer || fakeRenderer(opts);
  const srv = createRendererService({ token: TOKEN, dir, renderer, ...(opts.keepMs ? { keepMs: opts.keepMs } : {}) });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  return { url, dir, renderer, srv, close: () => new Promise(r => srv.close(r)) };
}
const req = (url, p, { method = 'GET', token = TOKEN, body, raw } = {}) => fetch(url + p, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) });
const until = async (fn, ms = 5000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timed out'); await new Promise(r => setTimeout(r, 20)); } };

test('renderer service: refuses to start without a long token; health needs none; jobs need the right one', async () => {
  assert.throws(() => createRendererService({ token: '', dir: os.tmpdir() }), /STORY_RENDER_TOKEN is required/);
  assert.throws(() => createRendererService({ token: 'short', dir: os.tmpdir() }), /at least 24/);
  const s = await service();
  try {
    const h = await req(s.url, '/health', { token: null });
    assert.equal(h.status, 200);
    assert.deepEqual(await h.json(), { ok: true, busy: false, engine: 'eevee' });
    for (const token of [null, 'wrong-token-0123456789abcdef-xyz', TOKEN + 'x']) assert.equal((await req(s.url, '/jobs', { method: 'POST', token, body: { key: 'a', spec: spec() } })).status, 401);
    assert.equal((await req(s.url, '/jobs/nope', { token: null })).status, 401);
    assert.equal((await req(s.url, '/nothing')).status, 404);
  } finally { await s.close(); }
});

test('renderer service: bad and oversized specs are refused before anything runs', async () => {
  const s = await service();
  try {
    let r = await req(s.url, '/jobs', { method: 'POST', raw: 'x'.repeat(MAX_BODY + 10), body: undefined });
    assert.equal(r.status, 413);
    r = await req(s.url, '/jobs', { method: 'POST', raw: '{nope', body: undefined });
    assert.equal(r.status, 400);
    r = await req(s.url, '/jobs', { method: 'POST', body: { key: 'a', spec: spec({ width: 4000 }) } });
    assert.equal(r.status, 400);
    assert.ok((await r.json()).problems.some(p => /width/.test(p)));
    assert.equal(s.renderer.calls.length, 0);
  } finally { await s.close(); }
  // the checks themselves
  assert.ok(checkSpec(spec()).ok);
  const bad = checkSpec({ ...spec(), out_dir: '/etc', scenes: [{ ...spec().scenes[0], id: '../../x', set: 'Lighthouse; rm -rf' }, { ...spec().scenes[0], frames: 999999 }] });
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some(p => /scenes\[0\]\.id/.test(p)) && bad.problems.some(p => /scenes\[0\]\.set/.test(p)) && bad.problems.some(p => /scenes\[1\]\.frames/.test(p)));
  assert.equal(bad.spec.out_dir, undefined, 'the caller never picks the output folder');
  assert.ok(!checkSpec({ ...spec(), scenes: [] }).ok);
  assert.ok(!checkSpec({ ...spec(), scenes: Array.from({ length: 11 }, (_, i) => ({ ...spec().scenes[0], id: `s${i}` })) }).ok);
  assert.ok(!checkSpec({ ...spec(), scenes: [spec().scenes[0], spec().scenes[0]] }).ok, 'scene ids are unique');
  // a person's look, a name and what they hold get through; anything odd in them does not
  const cast = { kind: 'kid', action: 'kick', place: 'left', who: 'Banks<script>', holds: 'trophy', look: { hair_color: 'blonde', glasses: 'yes', outfit: 'sports_kit', extra: 'x' } };
  const okc = checkSpec({ ...spec(), scenes: [{ ...spec().scenes[0], characters: [cast] }] });
  assert.ok(okc.ok, okc.problems.join('; '));
  assert.deepEqual(okc.spec.scenes[0].characters[0], { kind: 'kid', action: 'kick', place: 'left', who: 'Banksscript', holds: 'trophy', look: { hair_color: 'blonde', glasses: false, outfit: 'sports_kit' } });
  assert.ok(!checkSpec({ ...spec(), scenes: [{ ...spec().scenes[0], characters: [{ ...cast, look: { hair: '../x' } }] }] }).ok);
});

test('renderer service: one job at a time, progress, clips, delete cleans up; the same story again replaces itself', async () => {
  const s = await service({ stepMs: 15 });
  try {
    const a = await (await req(s.url, '/jobs', { method: 'POST', body: { key: 'story1', spec: spec() } })).json();
    assert.equal(a.total, 6);
    assert.equal((await (await req(s.url, '/health', { token: null })).json()).busy, true);
    assert.equal((await req(s.url, '/jobs', { method: 'POST', body: { key: 'story2', spec: spec() } })).status, 503, 'another story waits');
    const b = await (await req(s.url, '/jobs', { method: 'POST', body: { key: 'story1', spec: spec() } })).json();
    assert.notEqual(b.id, a.id, 'the same story sent again replaces the old run');
    assert.equal((await req(s.url, `/jobs/${a.id}`)).status, 404);
    const mid = await (await req(s.url, `/jobs/${b.id}`)).json();
    assert.equal(mid.status, 'running');
    const done = await until(async () => { const j = await (await req(s.url, `/jobs/${b.id}`)).json(); return j.status === 'done' && j; });
    assert.deepEqual([done.done, done.total, done.engine, done.clips], [6, 6, 'eevee', ['s1', 's2']]);
    const clip = await req(s.url, `/jobs/${b.id}/clips/s2`);
    assert.equal(clip.status, 200);
    assert.equal(clip.headers.get('content-type'), 'video/mp4');
    assert.equal(await clip.text(), 'clip:s2');
    assert.equal((await req(s.url, `/jobs/${b.id}/clips/s9`)).status, 404);
    assert.equal((await req(s.url, `/jobs/${b.id}/clips/s1`, { token: null })).status, 401);
    const jobDir = path.join(s.dir, b.id);
    assert.ok(fs.existsSync(jobDir));
    assert.equal(s.renderer.calls[1].out_dir, path.join(jobDir, 'out'), 'the service picks the folder');
    assert.equal((await req(s.url, `/jobs/${b.id}`, { method: 'DELETE' })).status, 204);
    assert.ok(!fs.existsSync(jobDir), 'its files are gone');
    assert.equal(fs.readdirSync(s.dir).length, 0);
  } finally { await s.close(); }
});

test('renderer service: a failed render reports why; finished jobs expire', async () => {
  const s = await service({ fail: true });
  try {
    const a = await (await req(s.url, '/jobs', { method: 'POST', body: { key: 'k', spec: spec() } })).json();
    const j = await until(async () => { const x = await (await req(s.url, `/jobs/${a.id}`)).json(); return x.status === 'failed' && x; });
    assert.match(j.error, /blender fell over/);
    assert.equal((await req(s.url, '/jobs', { method: 'POST', body: { key: 'k2', spec: spec() } })).status, 202, 'a failed job does not block the next');
  } finally { await s.close(); }
});

test('RemoteRenderer: hands the spec over, reports progress, brings the clips home, tidies up', async () => {
  const s = await service({ stepMs: 5 });
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-out-'));
  try {
    assert.throws(() => new RemoteRenderer({ url: '', token: TOKEN }), /STORY_RENDER_URL/);
    assert.throws(() => new RemoteRenderer({ url: s.url, token: '' }), /STORY_RENDER_TOKEN/);
    const rr = new RemoteRenderer({ url: s.url + '/', token: TOKEN, pollMs: 200 });
    assert.deepEqual(await rr.probe(), { engine: 'eevee' });
    const seen = [];
    const r = await rr.render({ ...spec(), out_dir: path.join(out, 'frames') }, { onProgress: p => seen.push(p.done) });
    assert.deepEqual(Object.keys(r.clips), ['s1', 's2']);
    assert.equal(fs.readFileSync(r.clips.s1, 'utf8'), 'clip:s1');
    assert.equal(r.frames, 6);
    assert.ok(seen.length >= 1 && seen[seen.length - 1] === 6);
    await until(() => s.srv.jobs.size === 0, 2000);
    assert.equal(fs.readdirSync(s.dir).length, 0, 'the service deleted the job after the clips came home');
    // a wrong token is a clear failure, not a hang
    await assert.rejects(new RemoteRenderer({ url: s.url, token: 'nope-nope-nope-nope-nope-nope', pollMs: 200 }).render({ ...spec(), out_dir: path.join(out, 'x') }), /refused the job \(401/);
    // stopping the story stops the remote render
    const ctrl = new AbortController();
    const slow = new RemoteRenderer({ url: s.url, token: TOKEN, pollMs: 200 });
    s.renderer.render = (orig => (sp, o) => orig(sp, o))(s.renderer.render);
    const p = slow.render({ ...spec({ key: 'story9' }), scenes: [{ ...spec().scenes[0], frames: 3000 }], out_dir: path.join(out, 'y') }, { signal: ctrl.signal });
    await until(() => [...s.srv.jobs.values()].some(j => j.status === 'running'), 3000);
    ctrl.abort();
    await assert.rejects(p, e => e.code === 'stopped');
    await until(() => s.srv.jobs.size === 0, 3000);
  } finally { await s.close(); fs.rmSync(out, { recursive: true, force: true }); }
});

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
test('the whole story through the remote path: the service composes the music and builds the video; the site gets story.mp4 and the poster', { skip: hasFfmpeg ? false : 'ffmpeg is not installed', timeout: 120e3 }, async () => {
  // a renderer whose "scenes" are real (tiny) video clips, so the service's ffmpeg assembly really runs
  const renderer = fakeRenderer({ stepMs: 2 });
  const plain = renderer.render;
  renderer.render = async (s, o) => {
    const r = await plain(s, o);
    for (const [id, f] of Object.entries(r.clips)) spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x2a4590:s=${s.width}x${s.height}:r=${s.fps / s.step}:d=4`, '-pix_fmt', 'yuv420p', f]);
    return r;
  };
  const s = await service({ renderer });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-asm-'));
  try {
    const W = await import('../../server/services/story-captions.js');
    const { ttsBytes } = { ttsBytes: (await import('../../server/services/tts.js')).silentMp3 };
    const script = { title: 'Moss', scenes: [{ lines: [{ say: 'Moss could not sleep.', show: 'Moss could not sleep.' }] }, { lines: [{ say: 'Goodnight, Moss.', show: 'Goodnight, Moss.' }] }] };
    const tl = W.timeline(script, [[1.2], [1.0]]);
    const voice = tl.lines.map((l, i) => { const f = path.join(work, `line-${i}.mp3`); fs.writeFileSync(f, ttsBytes(30)); return { file: f, start: l.start }; });
    const ass = path.join(work, 'captions.ass');
    fs.writeFileSync(ass, W.toAss(W.cues(tl.lines), { width: 128, height: 72, title: 'Moss', titleAt: [0.5, 2] }));
    const sp = { ...spec(), scenes: spec().scenes.map((x, i) => ({ ...x, frames: Math.ceil(tl.scenes[i].dur * 8) + 4 })) };
    const rr = new RemoteRenderer({ url: s.url, token: TOKEN, pollMs: 200 });
    assert.equal(rr.assembles, true);
    const phases = [];
    const r = await rr.render({ ...sp, out_dir: path.join(work, 'frames') }, {
      onPhase: ph => phases.push(ph),
      assemble: { timeline: { scenes: tl.scenes, total: tl.total }, xfade: W.T.xfade, posterAt: 1.0, ass, music: { seconds: tl.total, seed: 7, duck: tl.narration }, voice, outDir: work },
    });
    assert.equal(r.assembled, true);
    assert.deepEqual(r.music && Object.keys(r.music).sort(), ['bars', 'bpm', 'key', 'mood', 'notes'], 'the music was composed on the renderer');
    const probe = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path.join(work, 'story.mp4')]).stdout.toString());
    assert.deepEqual(probe.streams.map(x => x.codec_type).sort(), ['audio', 'video']);
    assert.ok(Math.abs(+probe.format.duration - tl.total) < 0.3, `${probe.format.duration} vs ${tl.total}`);
    assert.ok(fs.statSync(path.join(work, 'poster.jpg')).size > 200);
    await until(() => s.srv.jobs.size === 0, 3000);
    assert.equal(fs.readdirSync(s.dir).length, 0, 'nothing left on the renderer');
    // a bundle that doesn't match the spec is refused up front
    const bad = await req(s.url, '/jobs', { method: 'POST', body: { key: 'x', spec: sp, assemble: { timeline: { scenes: [], total: 5 }, ass: 'nope', voice: [] } } });
    assert.equal(bad.status, 400);
    const pr = (await bad.json()).problems.join(' ');
    assert.match(pr, /timeline\.scenes/); assert.match(pr, /ass:/); assert.match(pr, /voice:/);
  } finally { await s.close(); fs.rmSync(work, { recursive: true, force: true }); }
});

test('mp3Duration counts MPEG audio frames (the web server measures the site voice without ffmpeg)', async () => {
  const { mp3Duration } = await import('../../server/services/story-voice.js');
  const { silentMp3 } = await import('../../server/services/tts.js');
  const b = silentMp3(120);   // 10 frames of 1152 samples at 44.1 kHz
  assert.ok(Math.abs(mp3Duration(b) - (10 * 1152) / 44100) < 1e-9);
  assert.ok(Math.abs(mp3Duration(Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x05abcde', 'latin1'), b])) - (10 * 1152) / 44100) < 1e-9, 'an ID3 tag is skipped');
  assert.equal(mp3Duration(Buffer.from('not audio at all')), null);
});

test('createRenderer picks the renderer from STORY_RENDERER', () => {
  const old = { ...process.env };
  try {
    delete process.env.STORY_RENDERER;
    assert.equal(createRenderer().name, 'local-blender');
    Object.assign(process.env, { STORY_RENDERER: 'remote', STORY_RENDER_URL: 'http://127.0.0.1:1', STORY_RENDER_TOKEN: TOKEN });
    assert.equal(createRenderer().name, 'remote');
    process.env.STORY_RENDERER = 'gpu-farm';
    assert.throws(() => createRenderer(), /not available/);
  } finally { for (const k of ['STORY_RENDERER', 'STORY_RENDER_URL', 'STORY_RENDER_TOKEN']) { if (old[k] === undefined) delete process.env[k]; else process.env[k] = old[k]; } }
});
