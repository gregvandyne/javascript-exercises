// The AI-drawn story lab (services/story-art.js, routes/story-art.js; docs/story-builder.md "AI-drawn lab (admin
// only)"): admin only (404 for everyone else), the prompts (a fixed character bible pasted verbatim into every scene
// it appears in, the fixed style), the art direction's checks, the AI budget (every picture recorded; refused while
// resting or over today's cap), the limits, the job's states, a refused picture shown with its reason, the fallback to
// text-only pictures, and the ffmpeg video from generated placeholder pictures. OpenAI and Claude are mocked: no
// network call is ever made from here.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-art-'));
process.env.BRB_DATA_DIR = DATA;
process.env.STORY_VOICE = 'silent';
process.env.STORY_NICE = '0';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q, uid } = await import('../../server/db.js');
const auth = await import('../../server/auth.js');
const W = await import('../../server/services/story-writer.js');
const A = await import('../../server/services/story-art.js');
const { createApp } = await import('../../server/app.js');

// ---------------------------------------------------------------- fakes
const sample = () => JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts/story-samples/lost-stars.json'), 'utf8'));
const PNG = path.join(DATA, 'placeholder.png');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1536x1024', '-frames:v', '1', PNG]);
const B64 = fs.readFileSync(PNG).toString('base64');
const DIRECTION = {
  characters: [{ name: 'Pip', look: 'a small grey mouse with big round ears, a yellow scarf and a tiny blue backpack' }, { name: 'Owl', look: 'a wise brown owl with round glasses and a green bow tie' }],
  scenes: [
    { shot: 'wide', setting: 'a striped lighthouse by a calm sea at night, moonlight', characters: ['Pip'], action: 'Pip walks along the path to the lighthouse', expression: 'Pip curious' },
    { shot: 'two_shot', setting: 'a sleepy village under the stars', characters: ['Pip', 'Owl'], action: 'Pip and Owl look up at the sky', expression: 'both amazed' },
    { shot: 'close_up', setting: 'the top of the lighthouse, warm lamp light', characters: ['Owl'], action: 'Owl smiles at Pip', expression: 'Owl warm and proud' },
    { shot: 'over_shoulder', setting: 'a meadow at night', characters: ['Pip', 'Owl'], action: 'Pip points at a star', expression: 'Pip happy' },
    { shot: 'medium', setting: 'the beach at dawn', characters: ['Pip', 'Owl'], action: 'they wave goodbye to the night', expression: 'both sleepy and happy' },
  ],
};
const reply = obj => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(obj) }], usage: { input_tokens: 1000, output_tokens: 400 } });
const USAGE = { input_tokens: 2000, input_tokens_details: { image_tokens: 1536, text_tokens: 464 }, output_tokens: 1372 };
/** The fake image API: answers (or refuses) and records every call. opts.refuse(i, kind) -> an error reply or null. */
function fakeOpenAI({ refuse = () => null, gate = null } = {}) {
  const calls = [];
  A.hooks.fetch = async (url, init) => {
    const kind = url.endsWith('/edits') ? 'edits' : url.endsWith('/generations') ? 'generations' : 'other';
    const call = { url, kind, headers: init.headers, body: init.body };
    if (kind === 'generations') call.json = JSON.parse(init.body);
    calls.push(call);
    if (gate) await gate;
    const bad = refuse(calls.length, kind, call);
    if (bad) return new Response(JSON.stringify({ error: bad.error }), { status: bad.status, headers: { 'content-type': 'application/json' } });
    return new Response(JSON.stringify({ created: 1, data: [{ b64_json: B64 }], usage: USAGE }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}
const realFetch = globalThis.fetch;
function mocks() {
  W.hooks.create = async () => reply(sample());
  W.hooks.screen = async () => ({ ok: true });
  A.hooks.create = async () => reply(DIRECTION);
  A.hooks.classify = async () => null;
  A.hooks.video = { width: 192, height: 108, fps: 8 };
  A.hooks.log = () => {};
  Object.assign(config, { ttsProvider: 'openai', ttsApiKey: 'test-key', storyArtPerHour: 100, aiDailyBudgetUsd: 5, aiMonthlyBudgetUsd: 150 });
}
function fresh() {
  fs.rmSync(A.rootDir(), { recursive: true, force: true });
  for (const t of ['ai_spend', 'ai_spend_pool', 'ai_usage']) q.run(`DELETE FROM ${t}`);
  mocks();
}
async function finished(id, ms = 120000) {
  const t0 = Date.now();
  for (;;) {
    const r = A.getRun(id);
    if (r && ['done', 'failed'].includes(r.status) && !A._running().includes(id)) return r;
    if (Date.now() - t0 > ms) throw new Error(`run ${id} still ${r && r.status}`);
    await new Promise(res => setTimeout(res, 100));
  }
}
const boss = auth.createUser({ username: `ArtBoss${uid(4)}`, password: 'boss-password-1', role: 'admin' });
const kid = auth.createUser({ username: `ArtKid${uid(4)}`, password: 'rainbow-77' });
const mum = auth.createUser({ username: `ArtMum${uid(4)}`, password: 'rainbow-77-long', accountType: 'grownup' });

let base = '', srv;
test.before(async () => { srv = await new Promise(r => { const s = createApp().listen(0, () => r(s)); }); base = `http://127.0.0.1:${srv.address().port}`; });
test.after(async () => { A.hooks.fetch = (...a) => globalThis.fetch(...a); await new Promise(r => srv.close(r)); fs.rmSync(DATA, { recursive: true, force: true }); });
function signIn(u) { let c = ''; auth.startSession({ append: (k, v) => { c = v.split(';')[0]; } }, u.id); return c; }
async function call(p, { user = null, method = 'GET', body } = {}) {
  const h = {}; if (user) h.cookie = signIn(user); if (body !== undefined) h['content-type'] = 'application/json';
  const r = await realFetch(base + p, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
  const buf = Buffer.from(await r.arrayBuffer()); let json = null; try { json = JSON.parse(buf.toString()); } catch { /* not json */ }
  return { status: r.status, text: buf.toString(), json, buf, headers: r.headers };
}

// ---------------------------------------------------------------- prompts and checks
test('prompts: the character bible goes verbatim into every scene it appears in, with the fixed style; the sheet has everyone', () => {
  const v = A.validateDirection(DIRECTION, 4);
  assert.deepEqual(v.errors, []);
  const P = A.buildPrompts(v.direction);
  assert.equal(P.scenes.length, 4); assert.equal(P.scenesText.length, 4);
  for (const c of v.direction.characters) assert.ok(P.sheet.includes(A.bibleLine(c)), `the sheet has ${c.name}`);
  assert.ok(P.sheet.startsWith(A.STYLE));
  v.direction.scenes.forEach((sc, i) => {
    for (const p of [P.scenes[i], P.scenesText[i]]) {
      assert.ok(p.startsWith(A.STYLE), 'the fixed style first');
      for (const c of v.direction.characters) {
        if (sc.characters.includes(c.name)) assert.ok(p.includes(A.bibleLine(c)), `scene ${i + 1} has ${c.name}'s look word for word`);
        else assert.ok(!p.includes(c.look), `scene ${i + 1} leaves ${c.name} out`);
      }
      assert.match(p, /No words, letters/);
    }
    assert.match(P.scenes[i], /reference sheet/); assert.doesNotMatch(P.scenesText[i], /reference sheet/);
  });
  assert.match(P.scenes[0], /Shot: wide shot/); assert.match(P.scenes[1], /Shot: two-shot/);
});

test('art direction: unknown names, missing scenes and unsafe text are errors; Claude gets one retry, then it fails', async () => {
  const bad = structuredClone(DIRECTION);
  bad.scenes[0].characters = ['Pip', 'Batman'];
  bad.scenes[1].setting = 'call 555-123-4567 for the lighthouse';
  bad.characters[1].look = '';
  const v = A.validateDirection(bad, 6);
  assert.equal(v.ok, false);
  for (const re of [/Batman" is not in the character list/, /scenes: 6 needed, 5 sent/, /setting: not suitable \(personal\)/, /characters\[1\]\.look: empty/]) assert.ok(v.errors.some(e => re.test(e)), `${re}`);
  fresh();
  let n = 0;
  A.hooks.create = async ({ messages }) => { n++; if (n === 2) assert.match(messages[2].content, /fix these problems/); return reply(bad); };
  const d = await A.direct({ script: sample(), n: 4 });
  assert.equal(d.ok, false); assert.equal(d.code, 'unsafe'); assert.equal(n, 2);
  assert.ok(d.usd > 0, 'both Claude calls are recorded in the AI budget');
  A.hooks.create = async () => reply(DIRECTION); A.hooks.classify = async () => 'violence';
  assert.equal((await A.direct({ script: sample(), n: 3 })).code, 'unsafe', 'the model classifier counts too');
  A.hooks.classify = async () => null;
  A.hooks.create = async () => ({ stop_reason: 'refusal', content: [] });
  assert.equal((await A.direct({ script: sample(), n: 3 })).code, 'refused');
});

test('costs: the estimate before a run, and each picture priced from its usage (or the table without one)', () => {
  const e = A.estimate(4, 'medium');
  assert.equal(e.images, 5);
  assert.equal(e.usd, Math.round((5 * A.IMAGE_USD.medium + 4 * A.EDIT_INPUT_USD + A.CLAUDE_USD) * 1000) / 1000);
  assert.equal(A.estimate(99, 'nope').scenes, 6); assert.equal(A.estimate(1).scenes, 3); assert.equal(A.estimate(1).quality, 'medium');
  const usd = A.imageCost(USAGE, 'medium', true);
  assert.ok(Math.abs(usd - (464 * 5 + 1536 * 8 + 1372 * 30) / 1e6) < 1e-9);
  assert.equal(A.imageCost(null, 'high', false), A.IMAGE_USD.high);
  assert.equal(A.imageCost(null, 'low', true), A.IMAGE_USD.low + A.EDIT_INPUT_USD);
});

test('ffmpeg: the Ken Burns filter pushes, pulls and pans a 16:9 cut of the picture', () => {
  for (const move of A.MOVES) {
    const f = A.kenBurnsFilter({ move, frames: 50, width: 1280, height: 720, fps: 24 });
    assert.match(f, /^crop=iw:'min\(ih,iw\*9\/16\)',scale=2560:1440/);
    assert.match(f, /zoompan=z='[^']+':x='[^']+':y='[^']+':d=50:s=1280x720:fps=24/);
  }
  assert.match(A.kenBurnsFilter({ move: 'pan_left', frames: 10, width: 4, height: 2, fps: 1 }), /\(1-on\/9\)/);
});

// ---------------------------------------------------------------- access
test('access: the page, the APIs and the files are 404 for everyone but the admin; the admin header links it', async () => {
  fresh();
  const calls = fakeOpenAI();
  for (const u of [kid, mum, null]) {
    assert.equal((await call('/admin/story-art', { user: u })).status, 404);
    assert.equal((await call('/api/admin/story-art/runs', { user: u, method: 'POST', body: { idea: 'a fox' } })).status, 404);
    assert.equal((await call('/api/admin/story-art/runs/abc', { user: u })).status, 404);
    assert.equal((await call('/admin/story-art/runs/abc/story.mp4', { user: u })).status, 404);
  }
  assert.equal(calls.length, 0, 'nobody else can start one');
  const pg = await call('/admin/story-art', { user: boss });
  assert.equal(pg.status, 200);
  assert.match(pg.text, /Banks and Rev, two blonde brothers on a soccer team/);
  assert.match(pg.text, /Make test/); assert.match(pg.text, /\/js\/admin-story-art\.js/);
  assert.match((await call('/admin', { user: boss })).text, /href="\/admin\/story-art"/);
  assert.equal((await call('/api/admin/story-art/runs/nope', { user: boss })).status, 404);
});

// ---------------------------------------------------------------- the whole run
test('a run: script, art direction, a character sheet, each scene drawn with the sheet, the video; every picture in the AI budget', async () => {
  fresh();
  const calls = fakeOpenAI();
  const s = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: A.SAMPLE_IDEA, scenes: 3, quality: 'low' } });
  assert.equal(s.status, 202, s.text);
  assert.equal(s.json.run.estimate.images, 4);
  const r = await finished(s.json.run.id);
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.n, 3); assert.equal(r.images, 4);
  // the image API: one generation (the sheet), then one edit per scene with the sheet as its input image
  assert.deepEqual(calls.map(c => c.kind), ['generations', 'edits', 'edits', 'edits']);
  assert.equal(calls[0].json.model, config.storyArtModel); assert.equal(calls[0].json.size, '1536x1024'); assert.equal(calls[0].json.quality, 'low');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key');
  const P = A.buildPrompts(r.direction);
  assert.equal(calls[0].json.prompt, P.sheet);
  for (let i = 1; i <= 3; i++) {
    const f = calls[i].body;
    assert.ok(f instanceof FormData);
    assert.equal(f.get('prompt'), P.scenes[i - 1]); assert.equal(f.get('size'), '1536x1024'); assert.equal(f.get('quality'), 'low');
    const img = f.get('image');
    assert.ok(img instanceof Blob); assert.equal(img.type, 'image/png');
    assert.equal(Buffer.from(await img.arrayBuffer()).toString('base64'), B64, 'the reference sheet is the input image');
  }
  // spend: each picture recorded under the 'free' pool (the daily cap applies), plus the art direction's Claude call
  const row = q.get('SELECT calls, usd FROM ai_usage WHERE model=?', `image:${config.storyArtModel}`);
  assert.equal(row.calls, 4);
  assert.ok(Math.abs(row.usd - r.usd.images) < 1e-9);
  assert.ok(Math.abs(row.usd - (A.imageCost(USAGE, 'low', false) + 3 * A.imageCost(USAGE, 'low', true))) < 1e-9);
  assert.ok(r.usd.claude > 0);
  assert.ok(q.get("SELECT usd FROM ai_spend_pool WHERE pool='free'").usd >= row.usd);
  // results: the pictures, the video (H.264 + AAC, as long as the timeline), the poster
  assert.ok(r.sheet.file); assert.deepEqual(r.scenes.map(x => x.file), ['scene-1.jpg', 'scene-2.jpg', 'scene-3.jpg']);
  assert.equal(r.video.voice, 'silent');
  const dir = A.runDir(r.id);
  const probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name,width,height', '-of', 'csv=p=0', path.join(dir, 'story.mp4')], { encoding: 'utf8' });
  assert.match(probe, /h264,192,108/); assert.match(probe, /aac/);
  const dur = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(dir, 'story.mp4')], { encoding: 'utf8' });
  assert.ok(Math.abs(dur - r.video.seconds) < 0.5, `${dur} vs ${r.video.seconds}`);
  assert.ok(!fs.existsSync(path.join(dir, 'voice')) && !fs.existsSync(path.join(dir, 'clip-1.mp4')), 'the working files are gone');
  assert.ok(r.timings.total >= 0 && r.timings.scenes >= 0);
  // the page's view and the files: the admin only
  const v = await call(`/api/admin/story-art/runs/${r.id}`, { user: boss });
  assert.equal(v.json.run.status, 'done'); assert.equal(v.json.run.video.url, `/admin/story-art/runs/${r.id}/story.mp4`);
  assert.equal(v.json.run.scenes[0].prompt, P.scenes[0]); assert.ok(v.json.run.scenes[0].lines.length);
  const vid = await call(v.json.run.video.url, { user: boss });
  assert.equal(vid.status, 200); assert.equal(vid.headers.get('content-type'), 'video/mp4');
  assert.equal((await call(v.json.run.scenes[0].url, { user: boss })).headers.get('content-type'), 'image/jpeg');
  assert.equal((await call(v.json.run.video.url, { user: kid })).status, 404);
  assert.equal((await call(`/admin/story-art/runs/${r.id}/run.json`, { user: boss })).status, 404, 'only the pictures and video');
  assert.equal((await call(`/admin/story-art/runs/${r.id}/..%2F..%2Fbrb.db`, { user: boss })).status, 404);
});

test('a run from an existing story reuses its script (no writer call)', async () => {
  fresh();
  fakeOpenAI();
  let wrote = 0; W.hooks.create = async () => { wrote++; return reply(sample()); };
  const id = uid(10), t = Date.now();
  q.run("INSERT INTO stories(id, owner_id, idea, age_band, seconds, locale, status, created_at, updated_at, finished_at, script, title) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    id, kid.id, 'stars', 'all', 45, 'en', 'done', t, t, t, JSON.stringify(sample()), 'Pip and the Lost Stars');
  assert.ok(A.storyChoices(boss).some(s => s.id === id), 'offered in the picker');
  assert.match((await call('/admin/story-art', { user: boss })).text, /Pip and the Lost Stars/);
  const s = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { storyId: id, scenes: 6, quality: 'medium' } });
  assert.equal(s.status, 202, s.text);
  const r = await finished(s.json.run.id);
  assert.equal(r.status, 'done', r.error); assert.equal(wrote, 0);
  assert.equal(r.n, 5, 'the story has five scenes'); assert.ok(r.notes.some(n => /5 scenes/.test(n)));
  assert.equal(r.title, 'Pip and the Lost Stars');
  assert.equal((await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { storyId: 'gone' } })).status, 404);
});

// ---------------------------------------------------------------- refusals and fallbacks
test('a refused picture is shown with its reason; the video has the other scenes', async () => {
  fresh();
  fakeOpenAI({ refuse: (n, kind) => (kind === 'edits' && n === 3 ? { status: 400, error: { code: 'moderation_blocked', message: 'Your request was rejected by the safety system.' } } : null) });
  const r = await finished((await A.start(boss, { idea: 'a mouse and an owl', scenes: 3, quality: 'low' })).run.id);
  assert.equal(r.status, 'done', r.error);
  assert.equal(r.images, 3, 'a refused call is not counted or paid');
  assert.equal(r.scenes[1].code, 'refused'); assert.match(r.scenes[1].error, /safety system/); assert.ok(!r.scenes[1].file);
  assert.ok(r.notes.some(n => /1 scene\(s\) were not drawn/.test(n)));
  assert.equal(q.get('SELECT calls FROM ai_usage WHERE model=?', `image:${config.storyArtModel}`).calls, 3);
});

test('no edit endpoint: the scenes fall back to text-only pictures with the bible; a refused sheet does the same', async () => {
  fresh();
  const calls = fakeOpenAI({ refuse: (n, kind) => (kind === 'edits' ? { status: 404, error: { message: 'Unknown endpoint' } } : null) });
  const r = await finished((await A.start(boss, { idea: 'a mouse and an owl', scenes: 3 })).run.id);
  assert.equal(r.status, 'done', r.error);
  assert.deepEqual(calls.map(c => c.kind), ['generations', 'edits', 'generations', 'generations', 'generations']);
  assert.deepEqual(r.scenes.map(s => s.mode), ['text', 'text', 'text']);
  const P = A.buildPrompts(r.direction);
  assert.equal(calls[2].json.prompt, P.scenesText[0]);
  assert.ok(r.notes.some(n => /reference sheet was not available/.test(n)));
  // an input_fidelity complaint is retried once without it, still as an edit
  fresh();
  const c2 = fakeOpenAI({ refuse: (n, kind, c) => (kind === 'edits' && c.body.get('input_fidelity') ? { status: 400, error: { message: "Unknown parameter: 'input_fidelity'." } } : null) });
  const r2 = await finished((await A.start(boss, { idea: 'a mouse and an owl', scenes: 3 })).run.id);
  assert.equal(r2.status, 'done', r2.error); assert.deepEqual(r2.scenes.map(s => s.mode), ['reference', 'reference', 'reference']);
  assert.equal(c2.filter(c => c.kind === 'edits').length, 6);
  // the sheet refused: no reference, every scene from the bible alone
  fresh();
  const c3 = fakeOpenAI({ refuse: n => (n === 1 ? { status: 400, error: { code: 'moderation_blocked', message: 'rejected by the safety system' } } : null) });
  const r3 = await finished((await A.start(boss, { idea: 'a mouse and an owl', scenes: 3 })).run.id);
  assert.equal(r3.status, 'done', r3.error); assert.equal(r3.sheet.code, 'refused');
  assert.deepEqual(c3.map(c => c.kind), ['generations', 'generations', 'generations', 'generations']);
});

test('failures: the writer\'s refusal and every picture failing end the run with a reason', async () => {
  fresh();
  fakeOpenAI();
  W.hooks.create = async () => ({ stop_reason: 'refusal', content: [] });
  const r = await finished((await A.start(boss, { idea: 'a mouse', scenes: 3 })).run.id);
  assert.equal(r.status, 'failed'); assert.equal(r.code, 'refused'); assert.match(r.error, /declined/);
  fresh();
  fakeOpenAI({ refuse: () => ({ status: 500, error: { message: 'server error' } }) });
  const r2 = await finished((await A.start(boss, { idea: 'a mouse', scenes: 3 })).run.id);
  assert.equal(r2.status, 'failed'); assert.equal(r2.code, 'noPictures'); assert.equal(r2.images, 0);
  assert.equal(q.get('SELECT COUNT(*) n FROM ai_usage WHERE model=?', `image:${config.storyArtModel}`).n, 0);
});

// ---------------------------------------------------------------- budget and limits
test('budget: refused while resting or when the estimate would pass today\'s cap; stops between pictures when the cap is hit', async () => {
  fresh();
  const calls = fakeOpenAI();
  q.run("INSERT INTO ai_spend(day, usd, calls) VALUES (date('now'), 5, 1)");
  q.run("INSERT INTO ai_spend_pool(day, pool, usd, calls) VALUES (date('now'), 'free', 5, 1)");
  const a = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: 'a fox' } });
  assert.equal(a.status, 503); assert.equal(a.json.code, 'resting');
  fresh();
  config.aiDailyBudgetUsd = 0.1;
  const b = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: 'a fox', scenes: 6, quality: 'high' } });
  assert.equal(b.status, 503); assert.equal(b.json.code, 'overBudget');
  assert.equal(calls.length, 0);
  // the cap reached mid-run: the next picture is not asked for
  fresh();
  const c2 = fakeOpenAI({ refuse: n => { if (n === 2) q.run("UPDATE ai_spend SET usd=usd+50"); return null; } });
  const r = await finished((await A.start(boss, { idea: 'a mouse', scenes: 4 })).run.id);
  assert.equal(r.status, 'failed'); assert.equal(r.code, 'resting');
  assert.equal(c2.length, 2, 'no picture after the cap');
  // no key, no Claude
  fresh(); config.ttsApiKey = '';
  assert.equal((await A.start(boss, { idea: 'a fox' })).code, 'noKey');
  config.sttProvider = 'openai'; config.sttApiKey = 'stt-key';
  assert.equal(A.openaiKey(), 'stt-key'); config.sttApiKey = '';
  fresh(); W.hooks.create = null;
  assert.equal((await A.start(boss, { idea: 'a fox' })).code, 'noClaude');
});

test('limits: STORY_ART_PER_HOUR runs an hour, one at a time, at most 6 scenes; a run the restart stopped says so', async () => {
  fresh();
  config.storyArtPerHour = 3;
  let open; const gate = new Promise(r => { open = r; });
  fakeOpenAI();
  W.hooks.create = async () => { await gate; return reply(sample()); };
  const first = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: 'a fox', scenes: 9 } });
  assert.equal(first.status, 202); assert.equal(first.json.run.n, 6, 'at most 6 scenes');
  const busy = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: 'a fox' } });
  assert.equal(busy.status, 409); assert.equal(busy.json.code, 'busy');
  open();
  await finished(first.json.run.id);
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const r = await call('/api/admin/story-art/runs', { user: boss, method: 'POST', body: { idea: 'a fox', scenes: 3, quality: 'low' } });
    statuses.push(r.status);
    if (r.status === 202) await finished(r.json.run.id);
  }
  assert.deepEqual(statuses, [202, 202, 429]);
  // a run left "working" by a restart reads as failed
  fs.mkdirSync(A.runDir('ghost1'), { recursive: true });
  fs.writeFileSync(path.join(A.runDir('ghost1'), 'run.json'), JSON.stringify({ id: 'ghost1', status: 'scenes', createdAt: 1, progress: 0.5, scenes: [], notes: [], usd: {}, estimate: {}, timings: {} }));
  const g = A.getRun('ghost1');
  assert.equal(g.status, 'failed'); assert.match(g.error, /restarted/);
  assert.equal(A.getRun('../x'), null);
});
