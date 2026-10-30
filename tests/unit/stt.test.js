// Speech to text (server/services/stt.js, POST /api/studio/:id/transcribe): the provider adapters against a mocked
// fetch (no network), and the endpoint's guards: off without a key, sign-in, owner only, audio types and first bytes,
// size and length limits, clips a minute and a day, words with rude ones starred, nothing ever stored.
process.env.BRB_DB = ':memory:';
process.env.BRB_SILENT = '1';
process.env.LOG_REQUESTS = '0';
process.env.BRB_DATA_DIR = (await import('node:os')).tmpdir() + '/brb-stt-test-' + process.pid;
delete process.env.STT_API_KEY; delete process.env.STT_PROVIDER; delete process.env.STT_MODEL;
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const stt = await import('../../server/services/stt.js');
const { createApp } = await import('../../server/app.js');
const ratelimit = await import('../../server/services/ratelimit.js');
const { q } = await import('../../server/db.js');

const server = createApp().listen(0);
await new Promise(r => server.once('listening', r));
const BASE = `http://127.0.0.1:${server.address().port}`;
test.after(() => { server.closeAllConnections(); server.close(); });

function client() {
  let cookie = '';
  const c = async (path, { method = 'GET', body, headers = {} } = {}) => {
    const h = { ...headers }; if (cookie) h.cookie = cookie;
    let payload = body;
    if (body !== undefined && !Buffer.isBuffer(body) && typeof body !== 'string') { h['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    const res = await fetch(BASE + path, { method, headers: h, body: payload, redirect: 'manual' });
    for (const x of res.headers.getSetCookie ? res.headers.getSetCookie() : []) { const kv = x.split(';')[0]; if (kv.startsWith('brb_session=')) cookie = kv; }
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* html */ }
    return { status: res.status, headers: res.headers, text, json };
  };
  return c;
}
async function signup(name) { const c = client(); const r = await c('/api/auth/signup', { method: 'POST', body: { username: name, password: 'secret12' } }); assert.equal(r.status, 200, r.text); return c; }

// A WebM clip's first bytes (EBML header), an MP4 (ftyp box) and an Ogg page, padded to a realistic size.
const WEBM = (n = 4000) => Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81, 0x01, 0x42, 0xf7, 0x81]), Buffer.alloc(n, 7)]);
const MP4 = (n = 4000) => Buffer.concat([Buffer.from([0, 0, 0, 0x20]), Buffer.from('ftypM4A '), Buffer.alloc(n, 3)]);
const OGG = (n = 4000) => Buffer.concat([Buffer.from('OggS'), Buffer.alloc(n, 1)]);

function on(provider = 'openai', key = 'test-key-not-real') { config.sttProvider = provider; config.sttApiKey = key; }
function off() { config.sttProvider = 'openai'; config.sttApiKey = ''; }
/** Replace fetch for the adapter; returns the calls it saw. reply(call) -> { status, json }. */
function fakeFetch(reply = () => ({ status: 200, json: { text: 'a dragon that flies' } })) {
  const calls = [];
  stt.hooks.fetch = async (url, init) => {
    const form = init.body; const fields = {};
    for (const [k, v] of form.entries()) fields[k] = typeof v === 'string' ? v : { name: v.name, type: v.type, size: v.size };
    const call = { url, headers: init.headers, fields, signal: init.signal }; calls.push(call);
    const r = reply(call);
    return new Response(JSON.stringify(r.json || {}), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  return calls;
}

// Made before the first test: test.after (which closes the server) runs once the tests registered so far are done.
const owner = await signup('SttOwner');
const stranger = await signup('SttStranger');
const g = (await owner('/api/studio/new', { method: 'POST', body: {} })).json;
const URL_ = `/api/studio/${g.id}/transcribe`;
const post = (c, body, type = 'audio/webm;codecs=opus', extra = {}) => c(URL_, { method: 'POST', body, headers: { 'content-type': type, 'x-clip-ms': '3000', ...extra } });
const AUDIO = name => fs.readFileSync(new URL(`../support/audio/${name}`, import.meta.url));
const resetUsage = () => { q.run('DELETE FROM stt_usage'); ratelimit._reset(); };

test('clip length from the container: WebM without a duration (as Chrome records it), fragmented MP4 (Safari), Ogg', () => {
  const near = (a, b) => assert.ok(a != null && Math.abs(a - b) < 0.3, `${a} vs ${b}`);
  near(stt.clipSeconds(AUDIO('live.webm')), 3.2);
  near(stt.clipSeconds(AUDIO('long.webm')), 95);
  near(stt.clipSeconds(AUDIO('frag.mp4')), 3.2);
  near(stt.clipSeconds(AUDIO('clip.ogg')), 3.2);
  assert.equal(stt.clipSeconds(WEBM()), null, 'unreadable -> null');
  // Unreadable: counted from its size at a low bitrate (errs long), and never less than the page said.
  assert.equal(stt.countedSeconds(WEBM(3988), 1000), 4000 / stt.UNKNOWN_BYTES_PER_SECOND);
  assert.equal(stt.countedSeconds(AUDIO('live.webm'), 9000), 9);
});

test('sniff: WebM, MP4, Ogg and WAV by their first bytes; anything else is refused', () => {
  assert.equal(stt.sniff(WEBM()), 'webm');
  assert.equal(stt.sniff(MP4()), 'mp4');
  assert.equal(stt.sniff(OGG()), 'ogg');
  assert.equal(stt.sniff(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE'), Buffer.alloc(20)])), 'wav');
  assert.equal(stt.sniff(Buffer.from('<html><script>alert(1)</script>')), null);
  assert.equal(stt.sniff(Buffer.alloc(5)), null);
  assert.equal(stt.baseMime('audio/webm;codecs=opus'), 'audio/webm');
});

test('enabled only with a known provider and a key (the mock needs none); the language and hint follow the locale', () => {
  assert.equal(stt.sttEnabled({ sttProvider: 'openai', sttApiKey: '' }), false);
  assert.equal(stt.sttEnabled({ sttProvider: 'openai', sttApiKey: 'k' }), true);
  assert.equal(stt.sttEnabled({ sttProvider: 'elevenlabs', sttApiKey: 'k' }), true);
  assert.equal(stt.sttEnabled({ sttProvider: '', sttApiKey: 'k' }), false);
  assert.equal(stt.sttEnabled({ sttProvider: 'mock', sttApiKey: '' }), true);
  assert.equal(stt.langOf('en-GB'), 'en'); assert.equal(stt.langOf('zh-Hant'), 'zh'); assert.equal(stt.langOf('he'), 'he');
  assert.match(stt.hintFor('zh-Hant'), /繁體中文/);
  for (const l of ['en', 'en-GB', 'pt', 'fr', 'es', 'de', 'he', 'ja', 'ar', 'ru', 'it', 'zh-Hant', 'nl']) assert.ok(stt.hintFor(l).length > 20, l);
});

test('OpenAI adapter: one multipart POST with the key as a bearer token, the clip, model, language and hint; text back, rude words starred', async () => {
  on('openai');
  const calls = fakeFetch(() => ({ status: 200, json: { text: '  make the  shit dragon‮ faster  ' } }));
  const r = await stt.transcribe({ bytes: WEBM(), locale: 'fr' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.equal(calls[0].headers.Authorization, 'Bearer test-key-not-real');
  assert.deepEqual(calls[0].fields.file, { name: 'clip.webm', type: 'audio/webm', size: WEBM().length });
  assert.equal(calls[0].fields['languages[]'], 'fr'); assert.equal(calls[0].fields.language, undefined);
  assert.match(calls[0].fields.prompt, /jeu vidéo/);
  assert.ok(calls[0].fields.model);
  assert.ok(calls[0].signal, 'a timeout signal is always passed');
  assert.equal(r.text, 'make the **** dragon faster');
  assert.equal(r.provider, 'openai');
  // Safari's MP4 goes as .mp4; STT_MODEL overrides the model.
  config.sttModel = 'custom-model';
  await stt.transcribe({ bytes: MP4(), locale: 'zh-Hant' });
  assert.equal(calls[1].fields.file.name, 'clip.mp4'); assert.equal(calls[1].fields.model, 'custom-model'); assert.equal(calls[1].fields.language, 'zh');
  // The newest model gets the language list, with Traditional Chinese as zh-tw.
  config.sttModel = '';
  await stt.transcribe({ bytes: MP4(), locale: 'zh-Hant' });
  assert.equal(calls[2].fields['languages[]'], 'zh-tw'); assert.equal(calls[2].fields.language, undefined);
  off();
});

test('ElevenLabs adapter: logging off on every call (zero retention mode), its own key header and language code', async () => {
  on('elevenlabs');
  const calls = fakeFetch(() => ({ status: 200, json: { text: 'שלום' } }));
  const r = await stt.transcribe({ bytes: OGG(), locale: 'he' });
  assert.match(calls[0].url, /^https:\/\/api\.elevenlabs\.io\/v1\/speech-to-text\?enable_logging=false$/);
  assert.equal(calls[0].headers['xi-api-key'], 'test-key-not-real');
  assert.equal(calls[0].fields.language_code, 'he');
  assert.ok(calls[0].fields.model_id);
  assert.equal(r.text, 'שלום');
  off();
});

test('adapter errors: off, a clip that is not audio, the provider failing or busy, a network error', async () => {
  off();
  await assert.rejects(stt.transcribe({ bytes: WEBM() }), e => e.code === 'off');
  on('openai');
  fakeFetch();
  await assert.rejects(stt.transcribe({ bytes: Buffer.from('not audio at all, just text') }), e => e.code === 'format');
  fakeFetch(() => ({ status: 500 }));
  await assert.rejects(stt.transcribe({ bytes: WEBM() }), e => e.code === 'provider');
  fakeFetch(() => ({ status: 429 }));
  await assert.rejects(stt.transcribe({ bytes: WEBM() }), e => e.code === 'busy');
  stt.hooks.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(stt.transcribe({ bytes: WEBM() }), e => e.code === 'provider');
  off();
});

test('tidy and mask: control characters go, spaces collapse, at most 2000 characters, never a broken surrogate pair', () => {
  assert.equal(stt.tidy('a\u0000b \t c'), 'ab c');
  const long = 'x'.repeat(1999) + '😀😀';
  assert.equal(Array.from(stt.tidy(long)).at(-1), 'x');
  assert.equal(stt.maskWords('hello world'), 'hello world');
});

// ---- The endpoint (accounts and the game are made before the first test: see the top).

test('off without a key: 404, no mic in the Studio, and the microphone stays blocked on the page', async () => {
  off();
  assert.equal((await post(owner, WEBM())).status, 404);
  const page = await owner(`/studio/${g.id}`);
  assert.equal(page.status, 200);
  assert.doesNotMatch(page.text, /id="st-mic"/);
  assert.match(page.headers.get('permissions-policy'), /microphone=\(\)/);
  assert.equal((await owner(`/api/studio/${g.id}`)).json.mic, null);
});

test('on: the Studio has the mic button (hidden until the script checks the browser) and allows the microphone on that page only', async () => {
  on('openai');
  const page = await owner(`/studio/${g.id}`);
  assert.match(page.text, /<button class="st-mic" type="button" id="st-mic" aria-pressed="false"[^>]*aria-label="Speak instead of typing"[^>]* hidden>/);
  assert.match(page.text, /id="st-mic-status" role="status" aria-live="polite"/);
  assert.match(page.headers.get('permissions-policy'), /microphone=\(self\)/);
  assert.match((await owner('/build')).headers.get('permissions-policy'), /microphone=\(\)/, 'other pages keep it blocked');
  const st = (await owner(`/api/studio/${g.id}`)).json;
  assert.deepEqual(st.mic, { maxMs: config.sttMaxSeconds * 1000, maxBytes: config.sttMaxBytes, live: true, rate: 24000 }, 'the page builds its audio at the service\'s rate from the start');
  assert.match(page.text, /id="st-mic-said" aria-live="polite" aria-atomic="true"/, 'the final words are announced in their own live region');
  config.sttLive = false;
  assert.equal((await owner(`/api/studio/${g.id}`)).json.mic.live, false, 'STT_LIVE=0: record and upload as before');
  config.sttLive = true;
  off();
});

test('guards: signed out 401, someone else\'s game 404, not audio 415, too big 413, too long 413', async () => {
  on('openai'); ratelimit._reset();
  const calls = fakeFetch();
  assert.equal((await post(client(), WEBM())).status, 401);
  assert.equal((await post(stranger, WEBM())).status, 404);
  assert.equal((await post(owner, WEBM(), 'application/octet-stream')).status, 415);
  assert.equal((await post(owner, Buffer.from('<svg onload=alert(1)>'.repeat(20)), 'audio/webm')).status, 415, 'the first bytes must be audio');
  const big = await post(owner, WEBM(config.sttMaxBytes + 10));
  assert.equal(big.status, 413); assert.match(big.json.error, /too long/);
  assert.equal((await post(owner, WEBM(), 'audio/webm', { 'x-clip-ms': String(config.sttMaxSeconds * 1000 + 5000) })).status, 413);
  const noLen = await owner(URL_, { method: 'POST', body: WEBM(), headers: { 'content-type': 'audio/webm' } });
  assert.equal(noLen.status, 400, 'X-Clip-Ms is required');
  // The page says 3 s, the clip itself is 95 s long (a low bitrate fits that in a few KB): its real length counts.
  const lie = await post(owner, AUDIO('long.webm'), 'audio/webm', { 'x-clip-ms': '3000' });
  assert.equal(lie.status, 413); assert.equal(lie.json.code, 'too_long'); assert.match(lie.json.error, /up to 1:00/);
  assert.equal(calls.length, 0, 'nothing reached the provider');
  assert.equal(q.get('SELECT COUNT(*) AS n FROM stt_usage').n, 0, 'refused clips use none of the daily caps');
  off();
});

test('a clip becomes words for the text box: rude words starred, nothing heard says so, a provider failure is a kind error', async () => {
  on('openai'); ratelimit._reset();
  fakeFetch(() => ({ status: 200, json: { text: 'make a fuck cat game' } }));
  const r = await post(owner, MP4(), 'audio/mp4', { 'x-clip-ms': '4200' });
  assert.equal(r.status, 200); assert.deepEqual(r.json, { text: 'make a **** cat game' });
  fakeFetch(() => ({ status: 200, json: { text: '   ' } }));
  assert.deepEqual((await post(owner, WEBM())).json, { text: '', reason: 'nothing' });
  fakeFetch(() => ({ status: 500 }));
  const bad = await post(owner, WEBM());
  assert.equal(bad.status, 502); assert.match(bad.json.error, /couldn't turn that into words/);
  fakeFetch(() => ({ status: 429 }));
  assert.equal((await post(owner, WEBM())).status, 503);
  off();
});

test('limits: clips a minute, then a day\'s cap per builder', async () => {
  on('openai'); ratelimit._reset();
  fakeFetch();
  const keep = { min: config.sttPerMinute, day: config.sttDailyClips };
  config.sttPerMinute = 2; config.sttDailyClips = 100;
  assert.equal((await post(owner, WEBM())).status, 200);
  assert.equal((await post(owner, WEBM())).status, 200);
  const fast = await post(owner, WEBM());
  assert.equal(fast.status, 429); assert.equal(fast.json.code, 'fast');
  assert.equal((await post(stranger, WEBM())).status, 404, 'per builder (and still owner only)');
  resetUsage(); config.sttPerMinute = 100; config.sttDailyClips = 1;
  assert.equal((await post(owner, WEBM())).status, 200);
  const day = await post(owner, WEBM());
  assert.equal(day.status, 429); assert.equal(day.json.code, 'daily');
  Object.assign(config, { sttPerMinute: keep.min, sttDailyClips: keep.day }); resetUsage();
  off();
});

test('nothing is stored: no clip or words in the database, the data folder or the audit log', async () => {
  on('openai'); ratelimit._reset();
  fakeFetch(() => ({ status: 200, json: { text: 'purple penguin parade' } }));
  const marker = Buffer.from('MARKER-AUDIO-BYTES');
  const clip = Buffer.concat([WEBM(3000), marker]);
  assert.equal((await post(owner, clip)).status, 200);
  const tables = q.all("SELECT name FROM sqlite_master WHERE type='table'").map(r => r.name);
  for (const tname of tables) {
    const rows = q.all(`SELECT * FROM "${tname}"`);
    const dump = JSON.stringify(rows, (k, v) => (Buffer.isBuffer(v) ? v.toString('latin1') : v));
    assert.doesNotMatch(dump, /purple penguin|MARKER-AUDIO/, tname);
  }
  const walk = d => (fs.existsSync(d) ? fs.readdirSync(d, { withFileTypes: true }).flatMap(e => (e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`])) : []);
  for (const f of walk(process.env.BRB_DATA_DIR)) assert.ok(!fs.readFileSync(f).includes(marker), f);
  off();
});

test('Builder off for this account: no mic in the Studio state and the clip is refused before it is read', async () => {
  on('openai'); resetUsage();
  const calls = fakeFetch();
  q.run("UPDATE users SET builder_enabled=0 WHERE username='SttOwner'");
  try {
    assert.equal((await owner(`/api/studio/${g.id}`)).json.mic, null);
    const r = await post(owner, AUDIO('live.webm'));
    assert.equal(r.status, 403); assert.equal(r.json.code, 'builder_off');
    assert.equal(calls.length, 0);
  } finally { q.run("UPDATE users SET builder_enabled=1 WHERE username='SttOwner'"); off(); }
});

test('daily caps live in the database and count only clips that reach the service; the site-wide minutes cap and the AI spend', async () => {
  on('openai'); resetUsage();
  fakeFetch();
  const aiBudget = await import('../../server/services/ai-budget.js');
  const before = aiBudget.spent().today;
  assert.equal((await post(owner, AUDIO('live.webm'))).status, 200);
  const row = q.get("SELECT clips, seconds FROM stt_usage s JOIN users u ON u.id=s.user_id WHERE u.username='SttOwner'");
  assert.equal(row.clips, 1); assert.ok(row.seconds >= 3 && row.seconds < 3.6, String(row.seconds));
  assert.ok(aiBudget.spent().today > before, 'the cost is in the AI spend');
  assert.equal((await post(owner, Buffer.from('<svg>'.repeat(60)), 'audio/webm')).status, 415);
  assert.equal(q.get("SELECT clips FROM stt_usage s JOIN users u ON u.id=s.user_id WHERE u.username='SttOwner'").clips, 1, 'a refused clip is not counted');
  const keep = config.sttDailyMinutes; config.sttDailyMinutes = 0.01;
  const site = await post(owner, AUDIO('live.webm'));
  assert.equal(site.status, 503); assert.equal(site.json.code, 'site');
  config.sttDailyMinutes = keep; resetUsage(); off();
});
