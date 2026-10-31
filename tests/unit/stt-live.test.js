// Live speech to text (server/services/stt-live.js, the relay on /api/studio/:id/listen, and stt.js openRealtime):
// the providers' realtime protocols against a local fake (tests/support/fake-realtime.js, no network), words masked in
// every message the page gets, segment order, every guard (none of them contacts the provider), the per-minute bucket
// shared with /transcribe, seconds counted once, the one-use fallback id, frame and length limits, nothing stored or
// logged, and shutdown draining.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-stt-live-test-' + process.pid;
delete process.env.STT_API_KEY; delete process.env.STT_PROVIDER; delete process.env.STT_MODEL; delete process.env.STT_LIVE; delete process.env.STT_REALTIME_MODEL;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import WebSocket from 'ws';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const stt = await import('../../server/services/stt.js');
const live = await import('../../server/services/stt-live.js');
const { createApp } = await import('../../server/app.js');
const ratelimit = await import('../../server/services/ratelimit.js');
const auth = await import('../../server/auth.js');
const { lifecycle } = await import('../../server/services/health.js');
const { hasProfanity } = await import('../../server/services/textfilter.js');
const { q } = await import('../../server/db.js');
const { startFakeRealtime, openaiWords } = await import('../support/fake-realtime.js');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
live.attachLive(server);
const PORT = server.address().port;
const BASE = `http://127.0.0.1:${PORT}`;
const fake = await startFakeRealtime();
stt.hooks.realtimeBase = fake.base;
stt.hooks.finalWaitMs = 400;
const logs = [];
live.hooks.log = (level, msg, fields) => logs.push({ level, msg, fields });
test.after(async () => { server.closeAllConnections(); server.close(); await fake.close(); });

function client() {
  const c = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const h = { ...headers }; if (c.cookie) h.cookie = c.cookie;
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const x of res.headers.getSetCookie()) { const kv = x.split(';')[0]; if (kv.startsWith('brb_session=')) c.cookie = kv; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, text, json };
  };
  c.cookie = '';
  return c;
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return c; }

/** Open the live socket. -> { ws, msgs, status (refused before the upgrade), closed: Promise<code>, next(type) } */
function listen(c, gameId, { origin = BASE, cookie = c && c.cookie } = {}) {
  const headers = {}; if (cookie) headers.cookie = cookie; if (origin) headers.origin = origin;
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/api/studio/${gameId}/listen`, { headers });
  const s = { ws, msgs: [], status: null, waiters: [] };
  s.closed = new Promise(r => { ws.on('close', code => r(code)); ws.on('unexpected-response', (req, res) => { s.status = res.statusCode; r(null); }); ws.on('error', () => r(null)); });
  ws.on('message', (d, bin) => { if (bin) return; const m = JSON.parse(String(d)); s.msgs.push(m); s.waiters = s.waiters.filter(w => (w.type === m.type ? (w.r(m), false) : true)); });
  s.next = type => { const had = s.msgs.find(m => m.type === type && !m.seen); if (had) { had.seen = true; return Promise.resolve(had); } return new Promise(r => s.waiters.push({ type, r: m => { m.seen = true; r(m); } })); };
  s.opened = new Promise(r => ws.on('open', r));
  return s;
}
const pcm = (ms, rate) => Buffer.alloc(Math.floor((rate * ms) / 1000) * 2, 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const usage = name => q.get('SELECT clips, seconds FROM stt_usage WHERE user_id=(SELECT id FROM users WHERE username=?)', name) || { clips: 0, seconds: 0 };
const reset = () => { q.run('DELETE FROM stt_usage'); ratelimit._reset(); fake.reset(); logs.length = 0; };
function on(provider = 'openai') { config.sttProvider = provider; config.sttApiKey = provider === 'mock' ? '' : 'test-key-not-real'; config.sttLive = true; config.sttRealtimeModel = ''; }
const WEBM = (n = 4000) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]), Buffer.alloc(n, 7)]);
stt.hooks.fetch = async () => new Response(JSON.stringify({ text: 'a dragon that flies' }), { status: 200, headers: { 'content-type': 'application/json' } });

const owner = await signup('LiveOwner');
const other = await signup('LiveOther');
const g = (await owner('/api/studio/new', { method: 'POST', body: {} })).json;
const g2 = (await other('/api/studio/new', { method: 'POST', body: {} })).json;

/** A whole live session with the OpenAI fake: ready, frames, stop, final. -> { s, texts, final } */
async function session(c, { frames = 5, frameMs = 100, gap = 60, script = openaiWords(['make', ' the', ' dragon', ' fly']), gameId = g.id } = {}) {
  fake.script = script;
  const s = listen(c, gameId);
  const ready = await s.next('ready');
  for (let i = 0; i < frames; i++) { s.ws.send(pcm(frameMs, ready.rate)); await sleep(gap); }
  await sleep(200);
  const before = s.msgs.filter(m => m.type === 'text').map(m => m.text);
  s.ws.send(JSON.stringify({ type: 'stop' }));
  const final = await s.next('final');
  await s.closed;
  return { s, ready, before, texts: s.msgs.filter(m => m.type === 'text').map(m => m.text), final: final.text };
}

test('OpenAI realtime: a transcription session (24 kHz PCM, the language, server turn detection for every model), the key as a bearer token, audio as base64, commit on stop', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const { ready, texts, before, final } = await session(owner, { frames: 4 });
  assert.equal(ready.rate, 24000); assert.equal(ready.maxMs, config.sttMaxSeconds * 1000); assert.ok(ready.liveId);
  const c = fake.last;
  assert.equal(c.path, '/v1/realtime'); assert.equal(c.query.intent, 'transcription');
  assert.equal(c.headers.authorization, 'Bearer test-key-not-real');
  const s = c.sessionUpdate.session;
  assert.equal(s.type, 'transcription');
  assert.deepEqual(s.audio.input.format, { type: 'audio/pcm', rate: 24000 });
  assert.equal(s.audio.input.transcription.model, 'gpt-transcribe', 'the configured transcription model (no separate live default)');
  assert.equal(s.audio.input.transcription.language, 'en');
  // The service transcribes only committed audio: without turn detection no word would come until stop.
  assert.deepEqual(s.audio.input.turn_detection, stt.OPENAI_VAD);
  assert.match(s.audio.input.transcription.prompt, /video game/, 'the transcription model gets the hint');
  // On stop: the last commit, then turn detection off (its answer marks the end of every commit).
  assert.deepEqual(c.events.filter(e => e !== 'input_audio_buffer.append'), ['session.update', 'input_audio_buffer.commit', 'session.update']);
  assert.equal(c.updates[1].session.audio.input.turn_detection, null);
  assert.deepEqual(c.chunks, [4800, 4800, 4800, 4800], 'exactly the bytes the page sent, frame by frame');
  assert.ok(before.length >= 1, `words while the kid speaks, before stop: ${JSON.stringify(texts)}`);
  assert.ok(texts.length >= 1 && texts.every(t => 'make the dragon fly'.startsWith(t)), JSON.stringify(texts));
  assert.equal(final, 'make the dragon fly');
  // An override (STT_REALTIME_MODEL) is used as is; a live-only model still gets server VAD, but no hint.
  reset(); config.sttRealtimeModel = 'test-live-model';
  fake.script = { onCommit: ctx => ctx.send({ type: 'error', error: { code: 'input_audio_buffer_commit_empty' } }) };
  const s2 = listen(owner, g.id);
  await s2.next('ready');
  assert.equal(fake.last.sessionUpdate.session.audio.input.turn_detection.type, 'server_vad');
  s2.ws.send(pcm(100, 24000)); await sleep(50);
  assert.equal(fake.last.sessionUpdate.session.audio.input.transcription.model, 'test-live-model');
  assert.equal(fake.last.sessionUpdate.session.audio.input.transcription.prompt, undefined);
  s2.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s2.next('final')).text, '', 'stopping with nothing to commit: no words, not a failure');
  config.sttRealtimeModel = '';
  const r = stt.openRealtime({ locale: 'zh-Hant' }); await r.ready;
  assert.equal(fake.last.sessionUpdate.session.audio.input.transcription.language, 'zh'); r.abort();
});

test('ElevenLabs realtime: logging off, 16 kHz PCM, its key header and language; chunks as base64, a commit at the end; partial then committed words', { timeout: 20000 }, async () => {
  reset(); on('elevenlabs');
  fake.script = {
    onAudio(ctx, n) { ctx.send({ message_type: 'partial_transcript', text: n < 8000 ? 'una' : 'una nave' }); },
    onCommit(ctx) { ctx.send({ message_type: 'committed_transcript', text: 'una nave espacial' }); },
  };
  const es = await signup('LiveEs');
  await es('/api/me/lang', { method: 'POST', body: { lang: 'es' } }).catch(() => {});
  const g3 = (await es('/api/studio/new', { method: 'POST', body: {} })).json;
  const s = listen(es, g3.id);
  const ready = await s.next('ready');
  assert.equal(ready.rate, 16000);
  s.ws.send(pcm(200, 16000)); await sleep(30); s.ws.send(pcm(200, 16000)); await sleep(200);
  s.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s.next('final')).text, 'una nave espacial');
  const c = fake.last;
  assert.equal(c.path, '/v1/speech-to-text/realtime');
  assert.equal(c.headers['xi-api-key'], 'test-key-not-real');
  assert.equal(c.query.model_id, 'scribe_v2_realtime'); assert.equal(c.query.audio_format, 'pcm_16000');
  assert.equal(c.query.enable_logging, 'false'); assert.equal(c.query.commit_strategy, 'vad');
  assert.ok(c.query.language_code, 'a language code is always sent');
  assert.deepEqual(c.chunks, [{ sample_rate: 16000, commit: false, bytes: 6400 }, { sample_rate: 16000, commit: false, bytes: 6400 }, { sample_rate: 16000, commit: true, bytes: 0 }]);
  assert.ok(s.msgs.filter(m => m.type === 'text').every(m => !/nave e/.test(m.text)));
});

test('masking: a rude word that arrives in pieces never reaches the page unmasked, nor its first letters; every message is already tidied and masked', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const pieces = ['make', ' the', ' dra', 'gon', ' sh', 'it', ' fly', ' fuc', 'k', ' faster'];
  const { texts, final } = await session(owner, { frames: pieces.length, script: openaiWords(pieces) });
  assert.ok(texts.length >= 3, JSON.stringify(texts));
  for (const t of texts) {
    assert.ok(!hasProfanity(t), `unmasked: ${t}`);
    assert.ok(!/\b(sh|shi|fu|fuc)\b/.test(t), `a rude word's first letters showed: ${t}`);
    assert.equal(t, stt.maskWords(stt.tidy(t)));
  }
  assert.equal(final, 'make the dragon **** fly **** faster');
  // Straight from the transcript: interim holds the growing word back; scripts without spaces hold back 2 characters.
  const seen = []; const tr = new stt.Transcript(t => seen.push(t));
  for (const d of ['a', ' bitc', 'h', ' ran']) tr.delta('x', d);
  assert.deepEqual(seen, ['a', 'a *****']);
  assert.equal(stt.interimText('ドラゴンがとぶ'), 'ドラゴンが');
  assert.equal(stt.interimText('x'.repeat(3000) + ' '), 'x'.repeat(stt.MAX_TEXT), 'at most 2000 characters');
});

test('order: segments assemble in commit order whatever order they complete in; with no final answer in time the words so far are the final', { timeout: 20000 }, async () => {
  const tr = new stt.Transcript();
  tr.delta('b', 'two'); tr.delta('a', 'one');
  tr.committed('b', 'a'); tr.committed('a', null); tr.committed('c', 'b');
  tr.completed('c', 'three'); tr.completed('b', 'two'); tr.completed('a', 'one');
  assert.equal(tr.final(), 'one two three');
  // A live model may stream words under one id and commit them under another: they are counted once.
  const tr2 = new stt.Transcript();
  tr2.delta('stream', 'make'); tr2.delta('stream', ' it fly');
  tr2.committed('item_9', null); assert.equal(tr2.raw(), 'make it fly');
  tr2.completed('item_9', 'make it fly'); assert.equal(tr2.final(), 'make it fly');
  reset(); on('openai');
  // The commit is acknowledged but "completed" never comes: the deltas are the answer (after FINAL_WAIT_MS).
  const { final } = await session(owner, { frames: 3, script: { onAudio: (ctx, n) => ctx.send({ type: 'conversation.item.input_audio_transcription.delta', item_id: 'i', delta: n === 4800 ? 'jump' : ' higher' }), onCommit: ctx => ctx.send({ type: 'input_audio_buffer.committed', item_id: 'i', previous_item_id: null }) } });
  assert.equal(final, 'jump higher higher');
});

test('guards before the socket opens: signed out, another site, a guest, someone else\'s game (a grown-up\'s own game opens), no key, STT_LIVE=0, maintenance, shutting down; the provider is never contacted', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const expect = async (s, status) => { await s.closed; assert.equal(s.status, status); };
  await expect(listen(null, g.id), 401);
  await expect(listen(owner, g.id, { origin: 'https://evil.example' }), 403);
  await expect(listen(owner, g.id, { origin: null }), 403);
  const guest = client(); await guest('/api/auth/guest', { method: 'POST', body: {} });
  await expect(listen(guest, g.id), 403);
  auth.createUser({ username: 'LiveMum', password: 'a-long-password-1', accountType: 'grownup' });
  const mum = client(); assert.equal((await mum('/api/auth/login', { method: 'POST', body: { username: 'LiveMum', password: 'a-long-password-1' } })).status, 200);
  await expect(listen(mum, g.id), 404);
  // A grown-up builds too: their own game's live mic opens (a kid's game stays shut to them, above).
  const mine = (await mum('/api/studio/new', { method: 'POST', body: {} })).json;
  assert.ok(mine && mine.id, 'a grown-up can start a game');
  const ms = listen(mum, mine.id); await ms.next('ready'); ms.ws.send(JSON.stringify({ type: 'cancel' })); await ms.closed;
  const refusals = logs.filter(l => l.msg === 'live mic refused').map(l => l.fields.why);
  assert.ok(refusals.includes('origin') && refusals.includes('signed out') && refusals.includes('not editable'), 'refusals are logged with why');
  await expect(listen(owner, g2.id), 404);
  await expect(listen(owner, 'nosuchgame'), 404);
  config.sttApiKey = ''; await expect(listen(owner, g.id), 404); on('openai');
  config.sttLive = false; await expect(listen(owner, g.id), 404); on('openai');
  config.maintenance = true; await expect(listen(owner, g.id), 503); config.maintenance = false;
  lifecycle.draining = true; await expect(listen(owner, g.id), 503); lifecycle.draining = false;
  const bad = new WebSocket(`ws://127.0.0.1:${PORT}/api/elsewhere`, { headers: { origin: BASE, cookie: owner.cookie } });
  assert.equal(await new Promise(r => bad.on('unexpected-response', (req, res) => r(res.statusCode))), 404, 'other upgrades are refused');
  assert.equal(fake.connections.length, 1, 'the provider was contacted only for the grown-up\'s own game');
  assert.equal(usage('LiveOwner').clips, 0, 'nothing counted');
});

test('refusals after the socket opens, in the kid\'s words: Builder off, too fast (the same bucket as /transcribe, both ways), the day\'s cap, the site busy, a second tab; none falls back or reaches the provider', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const refused = async (s, code, closeCode) => { const m = await s.next('error'); assert.equal(m.code, code); assert.equal(m.fallback, false); assert.ok(m.error); assert.equal(await s.closed, closeCode); };
  q.run("UPDATE users SET builder_enabled=0 WHERE username='LiveOwner'");
  try { await refused(listen(owner, g.id), 'builder_off', 4403); } finally { q.run("UPDATE users SET builder_enabled=1 WHERE username='LiveOwner'"); }
  for (let i = 0; i < config.sttPerMinute; i++) assert.equal((await owner(`/api/studio/${g.id}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '1000' } })).status, 200);
  await refused(listen(owner, g.id), 'fast', 4429);
  reset();
  for (let i = 0; i < config.sttPerMinute; i++) { const s = listen(owner, g.id); await s.next('ready'); s.ws.send(JSON.stringify({ type: 'cancel' })); await s.closed; }
  assert.equal((await owner(`/api/studio/${g.id}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '1000' } })).json.code, 'fast');
  await refused(listen(owner, g.id), 'fast', 4429);
  reset(); const daily = config.sttDailyClips; config.sttDailyClips = 1;
  try { const s = listen(owner, g.id); await s.next('ready'); s.ws.send(JSON.stringify({ type: 'cancel' })); await s.closed; await refused(listen(owner, g.id), 'daily', 4429); } finally { config.sttDailyClips = daily; }
  reset(); q.run("INSERT INTO stt_usage(day, user_id, clips, seconds) VALUES (date('now'), 'someone', 1, ?)", config.sttDailyMinutes * 60);
  await refused(listen(owner, g.id), 'site', 4503);
  reset();
  const first = listen(owner, g.id); await first.next('ready');
  const conns = fake.connections.length;
  await refused(listen(owner, g.id), 'busy', 4409);
  assert.equal(fake.connections.length, conns, 'the second tab never reached the provider');
  first.ws.send(JSON.stringify({ type: 'cancel' })); await first.closed;
});

test('counting: one session is one clip; its seconds are the audio received (not the partials), counted once on stop, cancel, a dropped page and a provider failure', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const before = (await owner(`/api/studio/${g.id}`)).json.mic;
  assert.equal(before.live, true);
  const { texts } = await session(owner, { frames: 10, frameMs: 100, script: openaiWords(Array.from({ length: 10 }, (_, i) => ` w${i}`)) });
  assert.ok(texts.length >= 3, 'many partials');
  let u = usage('LiveOwner'); assert.equal(u.clips, 1); assert.ok(Math.abs(u.seconds - 1.0) < 0.01, String(u.seconds));
  // Cancel after 0.5 s of audio.
  let s = listen(owner, g.id); await s.next('ready'); for (let i = 0; i < 5; i++) s.ws.send(pcm(100, 24000)); await sleep(100);
  s.ws.send(JSON.stringify({ type: 'cancel' })); await s.closed; await sleep(30);
  u = usage('LiveOwner'); assert.equal(u.clips, 2); assert.ok(Math.abs(u.seconds - 1.5) < 0.01, String(u.seconds));
  // The page goes away (no close handshake).
  s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(300, 24000)); await sleep(100); s.ws.terminate(); await sleep(100);
  u = usage('LiveOwner'); assert.equal(u.clips, 3); assert.ok(Math.abs(u.seconds - 1.8) < 0.01, String(u.seconds));
  // The provider fails mid-way: the page is told to upload instead (fallback), and is given the id for it.
  fake.script = { onAudio: ctx => ctx.send({ type: 'error', error: { type: 'server_error', code: 'internal' } }) };
  s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(200, 24000));
  const err = await s.next('error'); assert.equal(err.fallback, true); assert.ok(err.liveId); assert.equal(await s.closed, 4502);
  u = usage('LiveOwner'); assert.equal(u.clips, 4); assert.ok(Math.abs(u.seconds - 2.0) < 0.01, String(u.seconds));
  // The fallback upload: no second clip and no turn of the minute's bucket, but its seconds count (it went again).
  const up = h => owner(`/api/studio/${g.id}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '3000', ...h } });
  assert.equal((await up({ 'x-live-id': err.liveId })).status, 200);
  u = usage('LiveOwner'); assert.equal(u.clips, 4); assert.ok(Math.abs(u.seconds - 5.0) < 0.01, String(u.seconds));
  // Used once: again, it is an ordinary upload (a clip).
  assert.equal((await up({ 'x-live-id': err.liveId })).status, 200);
  assert.equal(usage('LiveOwner').clips, 5);
  // Someone else's id counts normally too; and a finished (or cancelled) session's id is never a fallback.
  fake.script = { onAudio: ctx => ctx.send({ type: 'error', error: { code: 'internal' } }) };
  s = listen(other, g2.id); await s.next('ready'); s.ws.send(pcm(100, 24000)); const e2 = await s.next('error'); await s.closed;
  assert.equal((await up({ 'x-live-id': e2.liveId })).status, 200); assert.equal(usage('LiveOwner').clips, 6);
  ratelimit._reset();   // eight clips a minute: a fresh minute for the rest
  const done = await session(owner, { frames: 2 });
  assert.equal((await up({ 'x-live-id': done.ready.liveId })).status, 200); assert.equal(usage('LiveOwner').clips, 8);
  // A page that lost its socket before its words came may upload as the fallback (its id came in the first message).
  s = listen(owner, g.id); const opened = await s.next('open'); await s.next('ready'); s.ws.send(pcm(100, 24000)); s.ws.terminate(); await sleep(80);
  assert.equal((await up({ 'x-live-id': opened.liveId })).status, 200); assert.equal(usage('LiveOwner').clips, 9);
});

test('limits: a broken frame or message closes the socket; frames over 64 KB are refused; the longest recording stops itself; a silent socket stops; the provider failing to open falls back', { timeout: 20000 }, async () => {
  reset(); on('openai');
  let s = listen(owner, g.id); await s.next('ready'); s.ws.send(Buffer.alloc(101)); assert.equal(await s.closed, 1003, 'odd length');
  s = listen(owner, g.id); await s.next('ready'); s.ws.send('{"type":"shout"}'); assert.equal(await s.closed, 1003, 'unknown message');
  s = listen(owner, g.id); await s.next('ready'); s.ws.send(Buffer.alloc(65 * 1024)); assert.equal(await s.closed, 1009, 'too big');
  reset();
  const max = config.sttMaxSeconds; config.sttMaxSeconds = 1;
  try {
    fake.script = openaiWords(['go']);
    s = listen(owner, g.id); await s.next('ready');
    for (let i = 0; i < 15; i++) s.ws.send(pcm(100, 24000));
    await s.next('limit'); await s.next('final'); await s.closed;
    assert.ok(Math.abs(usage('LiveOwner').seconds - 1) < 0.01, 'never more than the longest recording');
    assert.ok(fake.last.audioBytes <= 24000 * 2, 'and no more went to the provider');
  } finally { config.sttMaxSeconds = max; }
  reset(); live.hooks.idleMs = 150;
  // A socket with no audio at all (the page's audio never ran): the page is told to upload its recording instead.
  try { s = listen(owner, g.id); await s.next('ready'); const f = await s.next('error'); assert.equal(f.code, 'silent'); assert.equal(f.fallback, true); assert.equal(await s.closed, 4502); } finally { live.hooks.idleMs = 10000; }
  reset(); stt.hooks.connectMs = 200;
  try {
    fake.script = { onOpen: () => {}, noSessionUpdated: true };
    s = listen(owner, g.id); const e = await s.next('error'); assert.equal(e.code, 'timeout'); assert.equal(e.fallback, true);
    s = listen(owner, g.id); fake.script = { onOpen: ctx => ctx.close(1011) }; assert.equal((await s.next('error')).fallback, true);
  } finally { stt.hooks.connectMs = 5000; }
});

test('never stored: no file is written during a session; the log line has numbers only (no words, no audio)', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const writes = [];
  const spied = ['writeFile', 'writeFileSync', 'appendFile', 'appendFileSync', 'createWriteStream'];
  const orig = {}; for (const k of spied) { orig[k] = fs[k]; fs[k] = (...a) => { writes.push([k, String(a[0])]); return orig[k](...a); }; }
  const origP = fs.promises.writeFile; fs.promises.writeFile = (...a) => { writes.push(['promises.writeFile', String(a[0])]); return origP(...a); };
  try { await session(owner, { frames: 4, script: openaiWords(['secret', ' dragon', ' words']) }); } finally { for (const k of spied) fs[k] = orig[k]; fs.promises.writeFile = origP; }
  assert.deepEqual(writes, []);
  const line = logs.find(l => l.fields && l.fields.mode === 'live');
  assert.ok(line);
  assert.deepEqual(Object.keys(line.fields).sort(), ['code', 'mode', 'ms', 'provider', 'seconds']);
  assert.ok(!JSON.stringify(logs).match(/secret|dragon|words|AQEB/), 'no words and no base64 audio in the log');
  const row = q.get("SELECT * FROM stt_usage WHERE user_id=(SELECT id FROM users WHERE username='LiveOwner')");
  assert.deepEqual(Object.keys(row).sort(), ['clips', 'day', 'seconds', 'user_id']);
});

test('shutdown: drainLive tells every open page to upload instead and closes its socket', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(100, 24000)); await sleep(50);
  assert.equal(live.openCount(), 1);
  assert.equal(live.drainLive(), 1);
  const e = await s.next('error'); assert.equal(e.code, 'restart'); assert.equal(e.fallback, true); assert.ok(e.liveId);
  assert.equal(await s.closed, 4503);
  assert.equal(live.openCount(), 0);
});

test('the test provider: words one by one as audio arrives, the sentence at the end (so the Studio can be tried end to end)', { timeout: 20000 }, async () => {
  reset(); on('mock');
  assert.equal(stt.liveEnabled(), true);
  const s = listen(owner, g.id); const ready = await s.next('ready'); assert.equal(ready.rate, 16000);
  for (let i = 0; i < 14; i++) { s.ws.send(pcm(100, 16000)); await sleep(140); }
  s.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s.next('final')).text, 'make the dragon fly faster');
  const texts = s.msgs.filter(m => m.type === 'text').map(m => m.text);
  assert.deepEqual(texts, ['make', 'make the', 'make the dragon', 'make the dragon fly']);
  assert.equal(fake.connections.length, 0);
  config.sttLive = false; assert.equal(stt.liveEnabled(), false); config.sttLive = true;
  on('openai');
});

// ---- review regressions
test('interim: every unfinished segment holds back its own growing word, empty ones add nothing, and segments stay in commit order', () => {
  // Server VAD commits B while A's words still stream: A's half word must not show (nor through B's words after it).
  const seen = []; const tr = new stt.Transcript(t => seen.push(t));
  tr.committed('A', null); tr.committed('B', 'A');
  tr.delta('A', 'you are a sh'); tr.delta('B', 'hello there'); tr.delta('A', 'it');
  for (const t of seen) { assert.ok(!/\bsh\b/.test(t), `a rude word's first letters showed: ${t}`); assert.ok(!hasProfanity(t), t); }
  assert.deepEqual(seen, ['you are a', 'you are a hello']);
  tr.delta('A', ' ok'); assert.equal(tr.interim(), 'you are a **** hello');
  tr.completed('A', 'you are a shit ok'); tr.completed('B', 'hello there');
  assert.equal(tr.final(), 'you are a **** ok hello there');
  // A committed segment with no words yet adds no trailing space, so the growing word before it is still held back.
  const tr2 = new stt.Transcript(); tr2.committed('A', null); tr2.committed('B', 'A'); tr2.delta('A', 'a bitc');
  assert.equal(tr2.interim(), 'a');
  // Order: a later segment that finished first comes after the earlier one, not before it.
  const tr3 = new stt.Transcript();
  tr3.committed('A', null); tr3.delta('A', 'make the dragon ');
  tr3.committed('B', 'A'); tr3.completed('B', 'fly faster');
  assert.equal(tr3.interim(), 'make the dragon fly faster');
  tr3.delta('A', 'go'); assert.equal(tr3.interim(), 'make the dragon fly faster', 'the growing word is held back in its place');
  tr3.completed('A', 'make the dragon go'); assert.equal(tr3.interim(), 'make the dragon go fly faster');
});

test('OpenAI: words come only for committed audio; a long turn without a pause is committed by the relay, so its words still come while the kid speaks', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const hard = stt.hooks.hardTurnMs, long = stt.hooks.longTurnMs;
  stt.hooks.hardTurnMs = 300; stt.hooks.longTurnMs = 200;
  try {
    // The fake's turn detection never commits (the kid never pauses).
    const { before, final } = await session(owner, { frames: 8, script: openaiWords(['make', ' the', ' dragon', ' fly', ' really', ' really', ' fast', ' now'], { vadEvery: 0 }) });
    assert.ok(fake.last.commits >= 2, `the relay committed during the turn (${fake.last.commits})`);
    assert.ok(before.length >= 1 && before.some(t => t.startsWith('make the')), JSON.stringify(before));
    assert.equal(final, 'make the dragon fly really really fast now');
  } finally { stt.hooks.hardTurnMs = hard; stt.hooks.longTurnMs = long; }
  // No commit at all: the fake sends no words before stop (as the real service), so the test above is meaningful.
  reset(); stt.hooks.hardTurnMs = 1e9; stt.hooks.longTurnMs = 1e9;
  try {
    const { before, final } = await session(owner, { frames: 4, script: openaiWords(['make', ' the', ' dragon', ' fly'], { vadEvery: 0 }) });
    assert.deepEqual(before, []); assert.equal(final, 'make the dragon fly');
  } finally { stt.hooks.hardTurnMs = hard; stt.hooks.longTurnMs = long; }
});

test('OpenAI stop: a turn detection commit already on its way is not taken for the stop\'s own commit; the last words are in the final', { timeout: 20000 }, async () => {
  reset(); on('openai');
  fake.script = {
    onAudio(ctx, n) {
      if (n !== 4800) return;
      ctx.send({ type: 'input_audio_buffer.committed', item_id: 'A', previous_item_id: null });
      ctx.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'A', transcript: 'make the dragon' });
    },
    async onCommit(ctx) {
      // The turn detection's commit B (sent before the stop reached the service), then the stop's own commit C.
      ctx.send({ type: 'input_audio_buffer.committed', item_id: 'B', previous_item_id: 'A' });
      ctx.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'B', transcript: 'fly' });
      await sleep(80);
      ctx.send({ type: 'input_audio_buffer.committed', item_id: 'C', previous_item_id: 'B' });
      setTimeout(() => ctx.send({ type: 'conversation.item.input_audio_transcription.completed', item_id: 'C', transcript: 'faster' }), 80);
    },
  };
  const s = listen(owner, g.id); await s.next('ready');
  s.ws.send(pcm(100, 24000)); await sleep(30); s.ws.send(pcm(100, 24000)); await sleep(60);
  s.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s.next('final')).text, 'make the dragon fly faster');
});

test('first words: audio sent before the service is ready is held and sent once it is (and counted then), never dropped', { timeout: 20000 }, async () => {
  reset(); on('openai');
  fake.script = { ...openaiWords(['make', ' the', ' dragon', ' fly']), updatedDelayMs: 400 };
  const s = listen(owner, g.id); await s.next('open');
  for (let i = 0; i < 3; i++) s.ws.send(pcm(100, 24000));   // the kid starts talking at once
  await s.next('ready');
  s.ws.send(pcm(100, 24000)); await sleep(150);
  s.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s.next('final')).text, 'make the dragon fly');
  await s.closed;
  assert.equal(fake.last.audioBytes, 4 * 4800, 'all four frames reached the service, in order');
  assert.ok(Math.abs(usage('LiveOwner').seconds - 0.4) < 0.01, String(usage('LiveOwner').seconds));
  // The service never gets ready: the held frames are dropped, not counted (the page uploads the clip instead).
  reset(); stt.hooks.connectMs = 200;
  try {
    fake.script = { noSessionUpdated: true };
    const s2 = listen(owner, g.id); await s2.next('open'); s2.ws.send(pcm(100, 24000));
    assert.equal((await s2.next('error')).fallback, true); await s2.closed;
    assert.equal(usage('LiveOwner').seconds, 0); assert.equal(fake.last.audioBytes, 0);
  } finally { stt.hooks.connectMs = 5000; }
});

test('no audio reached the relay: stop (or a stop before ready) is a fallback, and the upload of the clip is not a second clip', { timeout: 20000 }, async () => {
  reset(); on('openai');
  let s = listen(owner, g.id); await s.next('ready');
  s.ws.send(JSON.stringify({ type: 'stop' }));
  const e = await s.next('error'); assert.equal(e.code, 'silent'); assert.equal(e.fallback, true); assert.ok(e.liveId);
  assert.equal(s.msgs.filter(m => m.type === 'final').length, 0, 'never an empty final that would throw the clip away');
  await s.closed;
  const r = await owner(`/api/studio/${g.id}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '2000', 'x-live-id': e.liveId } });
  assert.equal(r.status, 200); assert.equal(r.json.text, 'a dragon that flies');
  assert.equal(usage('LiveOwner').clips, 1);
  // Stopped before the service was ready.
  reset(); fake.script = { updatedDelayMs: 500 };
  s = listen(owner, g.id); await s.next('open'); s.ws.send(JSON.stringify({ type: 'stop' }));
  assert.equal((await s.next('error')).fallback, true);
});

test('fallback upload: skips the builder\'s own daily cap (counted once), never the site\'s minutes or AI budget', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const daily = config.sttDailyClips; config.sttDailyClips = 1;
  try {
    const up = id => owner(`/api/studio/${g.id}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '2000', 'x-live-id': id } });
    // The day's last clip fails live: its upload still goes (it is the same clip).
    let s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(100, 24000)); await sleep(50);
    live.drainLive(); let e = await s.next('error'); await s.closed;
    assert.equal((await up(e.liveId)).status, 200); assert.equal(usage('LiveOwner').clips, 1);
    // The same, but the site's minutes run out during the clip: refused, the service never gets the audio.
    reset(); config.sttDailyClips = 1;
    s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(100, 24000)); await sleep(50);
    live.drainLive(); e = await s.next('error'); await s.closed;
    q.run("INSERT INTO stt_usage(day, user_id, clips, seconds) VALUES (date('now'), 'someone', 1, ?)", config.sttDailyMinutes * 60);
    let calls = 0; const f = stt.hooks.fetch; stt.hooks.fetch = async (...a) => { calls++; return f(...a); };
    try { const r = await up(e.liveId); assert.equal(r.status, 503); assert.equal(r.json.code, 'site'); } finally { stt.hooks.fetch = f; }
    assert.equal(calls, 0, 'the audio never went to the service');
  } finally { config.sttDailyClips = daily; }
});

test('restart: the fallback id survives the process (it is in the database), so the upload after a restart is not a second clip', { timeout: 20000 }, async () => {
  reset(); on('openai'); q.run('DELETE FROM stt_live');
  const daily = config.sttDailyClips; config.sttDailyClips = 1;
  try {
    const me = q.get("SELECT id FROM users WHERE username='LiveOwner'").id;
    const up = (id, c = owner, gid = g.id) => c(`/api/studio/${gid}/transcribe`, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm', 'x-clip-ms': '2000', 'x-live-id': id } });
    // A session the old process had open when it stopped (no end ran there): its row is still 'open', its clip counted.
    q.run("INSERT INTO stt_usage(day, user_id, clips, seconds) VALUES (date('now'), ?, 1, 0)", me);
    q.run("INSERT INTO stt_live(id, user_id, game_id, state, until) VALUES ('old-process-id', ?, ?, 'open', ?)", me, g.id, Date.now() + 60e3);
    assert.equal((await up('old-process-id', other, g2.id)).status, 200, 'someone else\'s id: an ordinary clip of theirs');
    assert.equal(q.get("SELECT COUNT(*) AS n FROM stt_live WHERE id='old-process-id'").n, 1, 'and it is still there for its owner');
    let r = await up('old-process-id');
    assert.equal(r.status, 200, `not refused as over the day's cap: ${r.text}`); assert.equal(usage('LiveOwner').clips, 1);
    r = await up('old-process-id'); assert.equal(r.status, 429, 'used once: now an ordinary clip, over the cap'); assert.equal(r.json.code, 'daily');
    // A drained session: its row is 'failed' and outlives the in-memory state.
    reset(); q.run('DELETE FROM stt_live'); config.sttDailyClips = 1;
    const s = listen(owner, g.id); await s.next('ready'); s.ws.send(pcm(100, 24000)); await sleep(50);
    live.drainLive(); const e = await s.next('error'); await s.closed;
    assert.equal(q.get('SELECT state FROM stt_live WHERE id=?', e.liveId).state, 'failed');
    assert.equal((await up(e.liveId)).status, 200); assert.equal(usage('LiveOwner').clips, 1);
    // Late (past the window): ignored, and the row is gone. Ended with words: no row at all.
    q.run("INSERT INTO stt_live(id, user_id, game_id, state, until) VALUES ('late-id', ?, ?, 'failed', ?)", me, g.id, Date.now() - 1);
    assert.equal(live.consumeFallback('late-id', me, g.id), false);
    ratelimit._reset(); config.sttDailyClips = 99;
    const done = await session(owner, { frames: 2 });
    assert.equal(q.get('SELECT COUNT(*) AS n FROM stt_live WHERE id=?', done.ready.liveId).n, 0);
    const row = q.get('SELECT * FROM stt_live LIMIT 1');
    if (row) assert.deepEqual(Object.keys(row).sort(), ['game_id', 'id', 'state', 'until', 'user_id'], 'ids only, never audio or words');
  } finally { config.sttDailyClips = daily; }
});

test('OpenAI: the relay never commits a long stretch of silence by itself (only while the turn detection hears speech)', { timeout: 20000 }, async () => {
  reset(); on('openai');
  const hard = stt.hooks.hardTurnMs, long = stt.hooks.longTurnMs;
  stt.hooks.hardTurnMs = 300; stt.hooks.longTurnMs = 200;
  try {
    fake.script = {};   // no speech_started ever: the kid is quiet
    const s = listen(owner, g.id); await s.next('ready');
    for (let i = 0; i < 8; i++) { s.ws.send(pcm(100, 24000)); await sleep(20); }
    await sleep(100);
    assert.equal(fake.last.commits || 0, 0);
    s.ws.send(JSON.stringify({ type: 'cancel' })); await s.closed;
  } finally { stt.hooks.hardTurnMs = hard; stt.hooks.longTurnMs = long; }
});
