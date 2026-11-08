// Story Builder, end to end (docs/story-builder.md): a tiny two-scene story goes through the real worker core —
// the job is claimed, "written" (a stand-in writer: no API key in tests), voiced, scored, captioned, rendered with
// Blender and assembled with ffmpeg — at a postage-stamp size so it takes about a minute. Skipped cleanly when
// Blender's Python module (pip install bpy) or ffmpeg isn't installed on this machine.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const auth = await import('../../server/auth.js');
const { uid } = await import('../../server/db.js');
const J = await import('../../server/services/story-jobs.js');
const { runStory } = await import('../../server/stories/worker.js');
const { LocalBlenderRenderer, hasBpy } = await import('../../server/stories/renderer.js');
const { validateScript } = await import('../../server/services/story-script.js');

const ffmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const bpy = ffmpeg && await hasBpy();
const why = !ffmpeg ? 'ffmpeg is not installed' : !bpy ? 'bpy (Blender as a Python module) is not installed' : false;

const SCRIPT = {
  title: 'Moss and the Moon',
  scenes: [
    { set: 'meadow', time: 'night', props: [], camera: 'slow_push', characters: [{ kind: 'bunny', action: 'hop', place: 'left' }, { kind: 'owl', action: 'idle', place: 'right' }],
      lines: [{ say: 'Moss the bunny could not sleep.', show: 'Moss the bunny could not sleep.' }] },
    { set: 'lighthouse', time: 'night', props: [], camera: 'drift', characters: [{ kind: 'bunny', action: 'sleep', place: 'center' }],
      lines: [{ say: 'So the moon sang her a song. Goodnight, Moss.', show: 'Goodnight, Moss.' }] },
  ],
};

const probe = file => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type,codec_name,width,height', '-of', 'json', file]).stdout.toString());

test('a tiny two-scene story, through every stage, to an MP4 with sound, a poster and captions', { skip: why, timeout: 15 * 60e3 }, async () => {
  assert.ok(validateScript(SCRIPT).ok);
  const u = auth.createUser({ username: `Pipe${uid(5)}`, password: 'rainbow-77' });
  const { story } = J.create(u, { idea: 'a bunny who cannot sleep', seconds: 45 });
  const claimed = J.claimNext('test-worker');
  assert.equal(claimed.id, story.id);
  const seen = new Set();
  const write = async args => { seen.add(args.idea); return { ok: true, script: validateScript(SCRIPT).script, attempts: 1 }; };
  const result = await runStory(claimed, { renderer: new LocalBlenderRenderer(), worker: 'test-worker', write, quality: 'test', voice: 'silent' });
  const s = J.get(story.id);
  assert.equal(result, 'done', s.error);
  assert.deepEqual([s.status, s.progress, s.title], ['done', 1, 'Moss and the Moon']);
  assert.ok(seen.has('a bunny who cannot sleep'), 'the writer got the idea');
  const meta = J.metaOf(s);
  const dir = J.storyDir(s.id);
  for (const f of ['story.mp4', 'poster.jpg', 'captions.vtt', 'captions.ass', 'music.wav', 'script.json'].filter(f => f !== 'script.json')) assert.ok(fs.existsSync(path.join(dir, f)), f);
  const info = probe(path.join(dir, 'story.mp4'));
  const v = info.streams.find(x => x.codec_type === 'video'), a = info.streams.find(x => x.codec_type === 'audio');
  assert.equal(v.codec_name, 'h264');
  assert.equal(a.codec_name, 'aac');
  assert.deepEqual([v.width, v.height], [128, 72]);
  assert.ok(Math.abs(+info.format.duration - meta.total) < 0.3, `the video lasts the timeline (${info.format.duration} vs ${meta.total})`);
  assert.equal(meta.scenes.length, 2);
  assert.ok(meta.render.engine === 'eevee' || meta.render.engine === 'cycles');
  assert.ok(meta.render.frames > 0 && meta.render.secPerVideoSec > 0);
  const vtt = fs.readFileSync(path.join(dir, 'captions.vtt'), 'utf8');
  assert.match(vtt, /^WEBVTT/);
  assert.match(vtt, /Moss the bunny could not sleep\./);
  assert.match(vtt, /Goodnight, Moss\./);
  assert.ok(fs.statSync(path.join(dir, 'poster.jpg')).size > 500);
  // a second worker finds nothing to do, and the finished story can't be moved again
  assert.equal(J.claimNext('test-worker'), null);
  assert.equal(J.transition(s.id, 'done', 'queued'), false);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a render that fails marks the story failed with a reason the page can explain', { skip: why, timeout: 5 * 60e3 }, async () => {
  const u = auth.createUser({ username: `Pipf${uid(5)}`, password: 'rainbow-77' });
  const { story } = J.create(u, { idea: 'x', seconds: 45 });
  const claimed = J.claimNext('test-worker');
  assert.equal(claimed.id, story.id);
  const broken = { name: 'broken', probe: async () => ({ engine: 'eevee' }), render: async () => { throw new Error('no GPU, no CPU, no luck'); } };
  const write = async () => ({ ok: true, script: validateScript(SCRIPT).script });
  assert.equal(await runStory(claimed, { renderer: broken, worker: 'test-worker', write, quality: 'test', voice: 'silent' }), 'failed');
  assert.deepEqual([J.get(story.id).status, J.get(story.id).error], ['failed', 'render']);
  assert.ok(J.scriptOf(J.get(story.id)), 'the script is kept, so a retry doesn\'t pay for writing again');
  // a writer refusal fails at the writing stage
  const { story: s2 } = J.create(u, { idea: 'y', seconds: 45 });
  J.claimNext('test-worker');
  assert.equal(await runStory(J.get(s2.id), { renderer: broken, worker: 'test-worker', write: async () => ({ ok: false, code: 'unsafe' }) }), 'failed');
  assert.equal(J.get(s2.id).error, 'unsafe');
  fs.rmSync(J.storyDir(story.id), { recursive: true, force: true });
});

// ---------------------------------------------------------------- changing a finished story, end to end (no Blender)
// A stand-in renderer makes each scene's clip with ffmpeg (a flat colour per scene) and counts what it was asked to
// render, so the test can check the rule that matters: a new voice, new music or new words never render a scene
// again, and a rewrite renders only the scenes whose pictures changed. The requests go through the real pages' APIs.
const crypto = await import('node:crypto');
const { createApp } = await import('../../server/app.js');
const { config } = await import('../../server/config.js');
const { q } = await import('../../server/db.js');
const { run } = await import('../../server/stories/assemble.js');
const { voiceLine } = await import('../../server/services/story-voice.js');

class FakeRenderer {
  constructor() { this.name = 'fake'; this.calls = []; this.fail = false; }
  async probe() { return { engine: 'fake' }; }
  async render(spec) {
    this.calls.push(spec.scenes.map(s => s.id));
    if (this.fail) throw new Error('the fake renderer is broken');
    fs.mkdirSync(spec.out_dir, { recursive: true });
    const clips = {};
    for (const s of spec.scenes) {
      const colour = crypto.createHash('md5').update(`${s.set}${s.time}${s.camera}`).digest('hex').slice(0, 6);
      const file = path.join(spec.out_dir, `${s.id}.mp4`);
      await run('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=c=0x${colour}:s=${spec.width}x${spec.height}:r=${spec.fps / spec.step}`, '-t', String(s.frames / spec.fps), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', file]);
      clips[s.id] = file;
    }
    return { engine: 'fake', frames: spec.scenes.reduce((a, s) => a + s.frames, 0), frameSeconds: 0, clips };
  }
}
const sha = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
async function web() {
  const app = createApp();
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  return { base: `http://127.0.0.1:${srv.address().port}`, close: () => new Promise(r => srv.close(r)) };
}
const signIn = u => { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; };
const post = async (base, cookie, p, body) => { const r = await fetch(base + p, { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, json: await r.json().catch(() => null) }; };

test('changing a story: voice, music and words reuse every scene; a rewrite renders only what changed; a failed change keeps the old video', { skip: ffmpeg ? false : 'ffmpeg is not installed', timeout: 10 * 60e3 }, async () => {
  const { base, close } = await web();
  const old = { on: config.storyBuilder, key: config.anthropicKey, remakes: config.storyRemakeLimit, daily: config.storyDailyLimit };
  config.storyBuilder = true; config.anthropicKey = 'test-key'; config.storyRemakeLimit = 10; config.storyDailyLimit = 10;
  const renderer = new FakeRenderer();
  const go = async (write = null) => { const c = J.claimNext('test-worker'); assert.ok(c, 'a job to run'); return runStory(c, { renderer, worker: 'test-worker', quality: 'test', voice: 'silent', ...(write ? { write } : {}) }); };
  try {
    const u = auth.createUser({ username: `Edit${uid(5)}`, password: 'rainbow-77' });
    const cookie = signIn(u);
    const { story } = J.create(u, { idea: 'a bunny who cannot sleep', seconds: 45, style: 'bedtime', music: 'lullaby' });
    const writes = [];
    const write = async args => { writes.push(args); return { ok: true, script: validateScript(SCRIPT).script, attempts: 1 }; };
    assert.equal(await go(write), 'done');
    const dir = J.storyDir(story.id), video = path.join(dir, 'story.mp4');
    assert.deepEqual(renderer.calls, [['s1', 's2']], 'the first video renders every scene');
    assert.equal(fs.readdirSync(path.join(dir, 'clips')).filter(f => f.endsWith('.mp4')).length, 2, 'and keeps each scene\'s clip');
    assert.deepEqual([writes[0].style, writes[0].tone], ['bedtime', 'cozy'], 'the writer got the choices');
    const v1 = sha(video);

    // 1. a new narrator and new music: nothing rendered again
    let r = await post(base, cookie, `/api/stories/${story.id}/remake`, { voice: 'onyx', music: 'playful' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.deepEqual(r.json.plan, { render: 0, reuse: 2 });
    assert.equal(J.get(story.id).status, 'done', 'the old video plays while the new one is made');
    assert.equal(await go(), 'done');
    let s = J.get(story.id);
    assert.deepEqual([s.version, s.voice, s.music, s.remake_status], [2, 'onyx', 'playful', '']);
    assert.equal(renderer.calls.length, 1, 'no scene rendered again');
    let meta = J.metaOf(s);
    assert.deepEqual([meta.render.rendered, meta.render.reused, meta.music.mood, meta.narrator], [0, 2, 'playful', 'onyx']);
    assert.notEqual(sha(video), v1, 'a new video');
    assert.ok(!fs.existsSync(path.join(dir, 'next')), 'the work folder is gone');

    // 2. new words (a much longer line): still nothing rendered; the kept clip is stretched to the new length
    const lines = SCRIPT.scenes.map(sc => sc.lines.map(l => l.say));
    lines[0][0] = 'Moss the bunny could not sleep, not one little wink, not even with her softest blanket and her favourite song.';
    r = await post(base, cookie, `/api/stories/${story.id}/remake`, { lines, title: 'Moss Cannot Sleep' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    const v2 = sha(video);
    assert.equal(await go(), 'done');
    s = J.get(story.id); meta = J.metaOf(s);
    assert.deepEqual([s.version, s.title, J.scriptOf(s).scenes[0].lines[0].say], [3, 'Moss Cannot Sleep', lines[0][0]]);
    assert.equal(renderer.calls.length, 1, 'still no scene rendered again');
    assert.ok(meta.render.stretched >= 1, 'the first scene grew: its clip was stretched to fit');
    assert.notEqual(sha(video), v2);
    assert.match(fs.readFileSync(path.join(dir, 'captions.vtt'), 'utf8'), /favourite song/, 'the new words are on screen');
    const info = JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', video]).stdout.toString());
    assert.ok(Math.abs(+info.format.duration - meta.total) < 0.3, 'the video lasts the new timeline');

    // 3. a rewrite that moves the second scene to the forest: only that scene is rendered
    const rewritten = validateScript(SCRIPT).script;
    rewritten.title = 'Moss in the Forest';
    rewritten.scenes[1].set = 'forest';
    rewritten.scenes[0].lines[0] = { say: 'Moss the bunny giggled and could not sleep.', show: 'Moss the bunny giggled and could not sleep.' };
    r = await post(base, cookie, `/api/stories/${story.id}/rewrite`, { note: 'make it funnier', style: 'funny' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    let asked = null;
    assert.equal(await go(async args => { asked = args; return { ok: true, script: rewritten, attempts: 1 }; }), 'done');
    assert.deepEqual([asked.note, asked.style, asked.previous.title], ['make it funnier', 'funny', 'Moss Cannot Sleep'], 'the writer got the note, the new style and the current story');
    assert.deepEqual(renderer.calls[1], ['s2'], 'only the changed scene');
    s = J.get(story.id);
    assert.deepEqual([s.version, s.style, s.title], [4, 'funny', 'Moss in the Forest']);
    assert.equal(fs.readdirSync(path.join(dir, 'clips')).length, 2, 'clips no version uses any more are removed');

    // 4. a change that fails (the renderer breaks): the old video stays exactly as it was
    const v4 = sha(video);
    const broken = validateScript(rewritten).script; broken.scenes[0].camera = 'tilt_up';
    renderer.fail = true;
    r = await post(base, cookie, `/api/stories/${story.id}/rewrite`, { note: 'look up at the sky' });
    assert.equal(r.status, 200);
    assert.equal(await go(async () => ({ ok: true, script: broken })), 'done');
    s = J.get(story.id);
    assert.deepEqual([s.status, s.version, s.remake_status, s.remake_error, s.title], ['done', 4, 'failed', 'render', 'Moss in the Forest']);
    assert.equal(sha(video), v4, 'the old video is untouched');
    assert.ok(!fs.existsSync(path.join(dir, 'next')));
    assert.equal((await post(base, cookie, `/api/stories/${story.id}/remake-dismiss`, {})).status, 200);
    assert.equal(J.get(story.id).remake_status, '');
    fs.rmSync(dir, { recursive: true, force: true });
  } finally {
    Object.assign(config, { storyBuilder: old.on, anthropicKey: old.key, storyRemakeLimit: old.remakes, storyDailyLimit: old.daily });
    await close();
  }
});

test('the offline voice says the narrator chosen: a lower voice for "deep and calm", a higher one for "bright"', { skip: ffmpeg && (spawnSync('sh', ['-c', 'command -v pico2wave || command -v espeak-ng']).status === 0) ? false : 'no offline voice', timeout: 60e3 }, async () => {
  const dir = fs.mkdtempSync(path.join(config.dataDir, 'voice-'));
  // the dominant pitch, from the zero crossings of the voiced part
  const pitch = async file => {
    const raw = file.replace(/\.wav$/, '.f32');
    await run('ffmpeg', ['-v', 'error', '-y', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', '16000', raw]);
    const b = fs.readFileSync(raw); const a = new Float32Array(b.buffer, b.byteOffset, b.length / 4);
    let z = 0, n = 0; for (let i = 1; i < a.length; i++) if (Math.abs(a[i]) > 0.02) { n++; if ((a[i] > 0) !== (a[i - 1] > 0)) z++; }
    return z / n;
  };
  const low = await voiceLine('The moon is round and bright tonight.', { dir, index: 0, provider: 'local', pitch: 0.86 });
  const mid = await voiceLine('The moon is round and bright tonight.', { dir, index: 1, provider: 'local', pitch: 1 });
  const high = await voiceLine('The moon is round and bright tonight.', { dir, index: 2, provider: 'local', pitch: 1.1 });
  const [pl, pm, ph] = [await pitch(low.file), await pitch(mid.file), await pitch(high.file)];
  assert.ok(pl < pm && pm < ph, `lower and higher (${pl.toFixed(4)} < ${pm.toFixed(4)} < ${ph.toFixed(4)})`);
  assert.ok(Math.abs(low.duration - mid.duration) / mid.duration < 0.05, 'at the same speed');
  fs.rmSync(dir, { recursive: true, force: true });
});
