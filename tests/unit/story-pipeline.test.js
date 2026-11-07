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
