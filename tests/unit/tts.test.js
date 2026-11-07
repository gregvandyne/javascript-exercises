// AI voices (server/services/tts.js, tts-voices.js, tts-usage.js): off unless the owner's switch AND a key; the OpenAI
// request shape against a stubbed fetch (no network, no real key); the mock's real silent MP3; what may be spoken; the
// disk cache, single flight, clean-up with pinned lines; the daily characters and the AI budget; the admin's settings;
// and logs that never carry the text.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-tts-'));
process.env.BRB_DATA_DIR = DATA;
const { config, parseTtsLocales, TTS_ALL_LOCALES } = await import('../../server/config.js');
const { q, today } = await import('../../server/db.js');
const tts = await import('../../server/services/tts.js');
const V = await import('../../server/services/tts-voices.js');
const usage = await import('../../server/services/tts-usage.js');
const aiBudget = await import('../../server/services/ai-budget.js');
const { tFor } = await import('../../server/i18n/index.js');
const { execFileSync } = await import('node:child_process');

const FAKE_KEY = 'test-key-not-real';
const logs = [];
tts.hooks.log = (level, msg, fields) => logs.push({ level, msg, fields });
test.after(() => fs.rmSync(DATA, { recursive: true, force: true }));

function mock() { config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES]; }
function openai(key = FAKE_KEY) { config.ttsEnabled = true; config.ttsProvider = 'openai'; config.ttsApiKey = key; config.ttsModel = 'gpt-4o-mini-tts'; }
function fresh() {
  q.run('DELETE FROM tts_cache'); q.run('DELETE FROM tts_usage'); q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); q.run('DELETE FROM ai_usage');
  fs.rmSync(path.join(DATA, 'tts'), { recursive: true, force: true }); logs.length = 0;
  q.run("DELETE FROM settings WHERE key='tts.voices'"); V._forget();
}
/** fetch stub for the OpenAI adapter. reply(call) -> { status, body } */
function fakeFetch(reply = () => ({ status: 200, body: tts.silentMp3(40) })) {
  const calls = [];
  tts.hooks.fetch = async (url, init) => {
    const call = { url, method: init.method, headers: init.headers, json: JSON.parse(init.body), signal: init.signal }; calls.push(call);
    const r = await reply(call);
    return new Response(r.body ?? '', { status: r.status || 200, headers: { 'content-type': 'audio/mpeg' } });
  };
  return calls;
}

test('off by default; on only with the switch AND a key; STT_API_KEY only when both providers are openai; mock refused in production', () => {
  const base = { ttsEnabled: false, ttsProvider: 'openai', ttsApiKey: '', sttProvider: 'openai', sttApiKey: '' };
  assert.equal(tts.ttsEnabled(base), false);
  assert.equal(tts.ttsEnabled({ ...base, ttsApiKey: FAKE_KEY }), false, 'a key alone is not enough');
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true }), false, 'the switch alone is not enough');
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true, ttsApiKey: FAKE_KEY }), true);
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true, sttApiKey: FAKE_KEY }), true, 'falls back to the STT key (both openai)');
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true, sttProvider: 'elevenlabs', sttApiKey: FAKE_KEY }), false, 'never another provider\'s key');
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true, ttsProvider: '' }), false);
  assert.equal(tts.ttsEnabled({ ...base, ttsEnabled: true, ttsProvider: 'mock' }), true);
  // The process's own config (no TTS_* in the test environment): off.
  assert.equal(config.ttsEnabled, false);
  const env = { ...process.env, BRB_DB: ':memory:', BRB_SILENT: '1', NODE_ENV: 'production', TTS_PROVIDER: 'mock', TTS_LOCALES: 'en,xx', TTS_ENABLED: 'maybe' };
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', "const { config } = await import('./server/config.js'); console.log(JSON.stringify(config.configErrors))"], { env, cwd: path.resolve(import.meta.dirname, '../..') }).toString();
  const errs = JSON.parse(out).join('\n');
  assert.match(errs, /TTS_PROVIDER=mock is for tests/);
  assert.match(errs, /TTS_LOCALES has unknown locales: xx/);
  assert.match(errs, /TTS_ENABLED/);
  assert.deepEqual(parseTtsLocales('EN-gb, zh-hant ,en').list, ['en-GB', 'zh-Hant', 'en']);
  assert.deepEqual(parseTtsLocales('').list, TTS_ALL_LOCALES);
});

test('the OpenAI request: URL, method, key header, JSON; instructions for gpt-4o-mini-tts, speed for tts-1; errors mapped; non-MP3 refused', async () => {
  fresh(); openai();
  V.save(null, { locales: { fr: { on: true, narrator: 'sage' } } });
  const calls = fakeFetch();
  const r = await tts.synthesize({ text: 'Bonjour les amis !', locale: 'fr', role: 'narrator', ctx: 'game' });
  assert.equal(r.cached, false); assert.match(r.url, /^\/tts\/[0-9a-f]{64}\.mp3$/);
  const c = calls[0];
  assert.equal(c.url, 'https://api.openai.com/v1/audio/speech'); assert.equal(c.method, 'POST');
  assert.equal(c.headers.Authorization, `Bearer ${FAKE_KEY}`); assert.equal(c.headers['Content-Type'], 'application/json');
  assert.deepEqual(Object.keys(c.json).sort(), ['input', 'instructions', 'model', 'response_format', 'voice']);
  assert.equal(c.json.model, 'gpt-4o-mini-tts'); assert.equal(c.json.voice, 'sage'); assert.equal(c.json.response_format, 'mp3'); assert.equal(c.json.input, 'Bonjour les amis !');
  assert.match(c.json.instructions, /aged 8 to 14/); assert.match(c.json.instructions, /French from France/);
  assert.ok(c.signal, 'a timeout signal');
  // tts-1: speed, no instructions.
  config.ttsModel = 'tts-1';
  await tts.synthesize({ text: 'Allons-y !', locale: 'fr', role: 'wise', rate: 'slow', ctx: 'game' });
  assert.deepEqual(Object.keys(calls[1].json).sort(), ['input', 'model', 'response_format', 'speed', 'voice']);
  assert.equal(calls[1].json.speed, 0.85); assert.equal(calls[1].json.voice, 'sage', 'wise -> sage by default');
  config.ttsModel = 'gpt-4o-mini-tts';
  // Errors.
  fakeFetch(() => ({ status: 429 }));
  await assert.rejects(tts.synthesize({ text: 'Un', locale: 'fr' }), { code: 'busy' });
  fakeFetch(() => ({ status: 500 }));
  await assert.rejects(tts.synthesize({ text: 'Deux', locale: 'fr' }), { code: 'provider' });
  fakeFetch(() => ({ status: 200, body: '{"error":"html?"}' }));
  await assert.rejects(tts.synthesize({ text: 'Trois', locale: 'fr' }), { code: 'provider' });
  config.ttsTimeoutMs = 2000;
  fakeFetch(c2 => new Promise((resolve, reject) => c2.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })))));
  const alive = setTimeout(() => {}, 5000);   // AbortSignal.timeout does not keep the process alive by itself
  await assert.rejects(tts.synthesize({ text: 'Quatre', locale: 'fr' }), { code: 'busy' });
  clearTimeout(alive);
  config.ttsTimeoutMs = 15000;
  assert.equal(usage.todayUse().fails, 4);
  assert.ok(!fs.existsSync(path.join(DATA, 'tts')) || fs.readdirSync(path.join(DATA, 'tts')).flatMap(d => fs.readdirSync(path.join(DATA, 'tts', d))).length === 2, 'only the two good lines are on disk');
  // Never the text or the key in a log line.
  const all = JSON.stringify(logs);
  for (const s of ['Bonjour', 'Allons', 'Quatre', FAKE_KEY]) assert.ok(!all.includes(s), `log has ${s}`);
  assert.ok(logs.some(l => l.msg === 'tts' && l.fields.h.length === 8 && l.fields.chars === 18));
});

test('the mock: a real MP3 that ffmpeg decodes, longer for longer text', () => {
  const a = tts.silentMp3(10), b = tts.silentMp3(600);
  assert.ok(tts.isMp3(a)); assert.ok(b.length > a.length);
  assert.equal(b.length, 104 * 50);
  const f = path.join(DATA, 'probe.mp3'); fs.writeFileSync(f, b);
  let probe = null;
  try { probe = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', f]).toString().trim(); } catch { probe = null; }
  if (probe !== null) assert.equal(probe, 'mp3');
});

test('speakable: empty, too long, rude words, personal info, link codes, the player\'s own name or username; RTL and CJK pass', () => {
  config.ttsMaxChars = 600;
  assert.equal(tts.speakable('   '), 'long');
  assert.equal(tts.speakable('a'.repeat(601)), 'long');
  assert.equal(tts.speakable('a'.repeat(600)), null);
  assert.equal(tts.speakable('what the fuck'), 'filtered');
  assert.equal(tts.speakable('mail me at kid@example.com'), 'filtered');
  assert.equal(tts.speakable('call 555 123 4567'), 'filtered');
  // A teacher's maths question read by number (live, lesson): its digits are not a phone number; emails still are.
  const maths = 'What is 2 + 3? A: 5. B: 4. C: 6. D: 7.';
  assert.equal(tts.speakable(maths, { ctx: 'game' }), 'filtered');
  assert.equal(tts.speakable(maths, { ctx: 'live' }), null);
  assert.equal(tts.speakable(maths, { ctx: 'lesson' }), null);
  assert.equal(tts.speakable('Write to kid@example.com', { ctx: 'live' }), 'filtered');
  const user = { display_name: 'Zara Moon', username: 'StarFox77' };
  assert.equal(tts.speakable('Well done, Zara Moon!', { user }), 'filtered');
  assert.equal(tts.speakable('Go starfox77, go!', { user }), 'filtered');
  assert.equal(tts.speakable('The moon is bright tonight.', { user }), null, 'a part of a name is fine');
  assert.equal(tts.speakable('Hi Al!', { user: { display_name: 'Al', username: 'Al' } }), null, 'names under 3 letters are not checked');
  assert.equal(tts.speakable('שלום! בואו נשחק ביחד.'), null);
  assert.equal(tts.speakable('مرحبًا! هيا نلعب.'), null);
  assert.equal(tts.speakable('嗨！我們一起玩吧！'), null);
  assert.equal(tts.speakable('嗨小明！', { user: { display_name: '王小明', username: 'xm123' } }), null);
  assert.equal(tts.speakable('嗨王小明！', { user: { display_name: '王小明', username: 'xm123' } }), 'filtered');
  assert.equal(tts.tidy(' a‮ b \n\n c '), 'a b c');
});

test('spoken text never includes emoji: spokenText strips pictographs, and a star-row question is its words only', () => {
  // Greg, live on the placement (2026-11-05): the Listen voice read a counting question's star row
  // aloud as repeated "star". The stars are a picture; the spoken text is the words around them.
  assert.equal(tts.spokenText('Count the stars ⭐⭐⭐⭐⭐⭐⭐⭐⭐'), 'Count the stars');
  assert.equal(tts.spokenText('⭐⭐⭐'), '', 'a line of only pictures says nothing');
  assert.equal(tts.spokenText('Press 1️⃣ to start'), 'Press 1 to start', 'a keycap keeps its digit');
  assert.equal(tts.spokenText('Family 👨‍👩‍👧 time'), 'Family time', 'a joined sequence goes whole');
  assert.equal(tts.spokenText('Go 🇬🇧 team'), 'Go team', 'a flag is a picture too');
  assert.equal(tts.spokenText('I ❤️ maths 🎮'), 'I maths');
  assert.equal(tts.spokenText('What is 3 × 4? Turn 6 ÷ 2 → 3'), 'What is 3 × 4? Turn 6 ÷ 2 → 3', 'maths symbols are not pictographs');
  // tidy() itself keeps the text as written: the line matchers (tts-lines, tts-games) compare with it,
  // and a registered line with emoji added must stay a different, refused line.
  assert.equal(tts.tidy('Count the stars ⭐'), 'Count the stars ⭐');
  // A placement item in Tally's voice (ctx 'placement', picked by the server from the run): its own
  // generated digits are not a phone number or a link code; rude words still refuse it.
  assert.equal(tts.speakable('Which is more, 123456 or 654321?', { ctx: 'placement' }), null);
  assert.equal(tts.speakable('Count the stars ⭐⭐⭐⭐⭐⭐⭐⭐⭐', { ctx: 'placement' }), null);
  assert.equal(tts.speakable('what the fuck', { ctx: 'placement' }), 'filtered');
  // The plan (what is synthesized and cached) is built from the spoken text: no emoji reaches a voice.
  const p = tts.plan({ text: 'Count the stars ⭐⭐⭐', locale: 'en', role: 'friendly' });
  assert.equal(p.text, 'Count the stars');
});

test('the real star-counting placement item is spoken as its words only', async () => {
  // The exact item Greg heard read wrong: the counting template used to deal a prompt whose counting
  // row was star emoji. The stars now live only in the tappable tiles (manip), so the prompt and its
  // spoken wording are words alone; the speak path (plan) still strips any picture that slips in.
  const { TEMPLATES, generateItem } = await import('../../seed-lessons/number-quest/placement/generator.js');
  const counting = TEMPLATES.find(t => t.id === 'nq-place-num-K_0-2');
  assert.ok(counting, 'the counting template exists');
  const full = generateItem(counting, 'tts-star-1');
  assert.equal(full.manip && full.manip.glyph, '⭐', 'the stars are dealt as tiles');
  assert.ok(!full.prompt.includes('⭐') && !full.spokenPrompt.includes('⭐'), 'no star row in the words');
  assert.equal(tts.plan({ text: full.spokenPrompt, locale: 'en', role: 'friendly' }).text, 'Count the stars. How many are there?');
  assert.equal(tts.plan({ text: `${full.prompt} ⭐⭐⭐`, locale: 'en', role: 'friendly' }).text, 'Count the stars. How many are there?');
});

test('cache key: stable, and changes with every part that changes the sound', () => {
  const base = { provider: 'openai', model: 'gpt-4o-mini-tts', voice: 'coral', instructions: 'x', speed: null, locale: 'en', rate: 'normal', text: 'Hi' };
  const k = tts.cacheKey(base);
  assert.match(k, /^[0-9a-f]{64}$/); assert.equal(tts.cacheKey({ ...base }), k);
  for (const [f, v] of [['provider', 'mock'], ['model', 'tts-1'], ['voice', 'nova'], ['instructions', 'y'], ['speed', 1], ['locale', 'en-GB'], ['rate', 'slow'], ['text', 'Hi!']]) assert.notEqual(tts.cacheKey({ ...base, [f]: v }), k, f);
});

test('cache: a hit makes no call; 5 identical requests in parallel make one; files land on disk; a missing file is made again', async () => {
  fresh(); openai();
  let n = 0;
  fakeFetch(async () => { n++; await new Promise(r => setTimeout(r, 30)); return { status: 200, body: tts.silentMp3(30) }; });
  const all = await Promise.all(Array.from({ length: 5 }, () => tts.synthesize({ text: 'What is 7 times 8?', locale: 'en', ctx: 'live' })));
  assert.equal(n, 1, 'single flight');
  assert.equal(new Set(all.map(r => r.url)).size, 1);
  assert.equal(all.filter(r => !r.cached).length, 1);
  assert.equal(tts._inflight(), 0);
  const hash = all[0].hash;
  assert.ok(fs.existsSync(tts.fileOf(hash)));
  assert.equal(path.dirname(tts.fileOf(hash)), path.join(DATA, 'tts', hash.slice(0, 2)));
  const again = await tts.synthesize({ text: '  What is 7   times 8? ', locale: 'en', ctx: 'live' });
  assert.equal(again.cached, true); assert.equal(n, 1, 'tidied text hits the cache');
  assert.equal(usage.todayUse().hits, 1);
  fs.unlinkSync(tts.fileOf(hash));
  await tts.synthesize({ text: 'What is 7 times 8?', locale: 'en' });
  assert.equal(n, 2);
  // gate: refuses new audio only.
  await assert.rejects(tts.synthesize({ text: 'New line', locale: 'en', gate: () => 'fast' }), { code: 'fast' });
  assert.equal((await tts.synthesize({ text: 'What is 7 times 8?', locale: 'en', gate: () => 'fast' })).cached, true);
});

test('daily characters and the AI budget stop new audio (cached lines still play); the cost goes into the AI spend', async () => {
  fresh(); mock();
  config.ttsDailyChars = 1000; config.ttsUsdPer1kChars = 0.015;
  const first = await tts.synthesize({ text: 'x'.repeat(500), locale: 'en' });
  assert.equal(usage.charsToday(), 500);
  const spend = q.get("SELECT usd, calls FROM ai_usage WHERE day=? AND model='tts:mock'", today());
  assert.equal(spend.calls, 1); assert.ok(Math.abs(spend.usd - 0.0075) < 1e-9);
  await assert.rejects(tts.synthesize({ text: 'y'.repeat(501), locale: 'en' }), { code: 'site' });
  assert.equal((await tts.synthesize({ text: 'x'.repeat(500), locale: 'en' })).hash, first.hash, 'cached still plays');
  config.ttsDailyChars = 300000;
  aiBudget.recordSpend('test', 1000);
  await assert.rejects(tts.synthesize({ text: 'z', locale: 'en' }), { code: 'site' });
  assert.equal(usage.blocked(), 'site');
  q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool');
  assert.equal(usage.blocked(), null);
  // Retention: 90 days.
  q.run("INSERT INTO tts_usage(day, chars) VALUES ('2000-01-01', 5)");
  assert.equal(usage.forget(), 1);
});

test('clean-up: least recently used first, pinned lines kept, orphans removed, at or under 90% of the cap', async () => {
  fresh(); mock();
  config.ttsCacheMb = 16;
  const lines = [];
  for (let i = 0; i < 6; i++) lines.push(await tts.synthesize({ text: `Line number ${i} ` + 'a'.repeat(400), locale: 'en', pin: i === 0 }));
  // Pretend each file is 4 MB, oldest first.
  lines.forEach((r, i) => q.run('UPDATE tts_cache SET bytes=?, last_used=? WHERE hash=?', 4 * 1048576, 1000 + i, r.hash));
  fs.writeFileSync(path.join(path.dirname(tts.fileOf(lines[1].hash)), 'f'.repeat(64) + '.mp3'), 'orphan');   // no row
  const r = tts.cleanup();
  assert.ok(r.orphans >= 1);
  const left = new Set(q.all('SELECT hash FROM tts_cache').map(x => x.hash));
  assert.ok(left.has(lines[0].hash), 'pinned kept');
  assert.ok(!left.has(lines[1].hash) && !left.has(lines[2].hash), 'oldest unpinned gone');
  assert.ok(left.has(lines[5].hash));
  assert.ok(tts.cacheBytes() <= 16 * 1048576 * 0.9);
  assert.ok(!fs.existsSync(tts.fileOf(lines[1].hash)));
  assert.ok(!fs.existsSync(path.join(path.dirname(tts.fileOf(lines[1].hash)), 'f'.repeat(64) + '.mp3')));
  config.ttsCacheMb = 512;
});

test('voices: roles, accents and samples for all 13 locales; settings saved, checked and audited; locales off by default', () => {
  fresh(); mock();
  assert.equal(TTS_ALL_LOCALES.length, 13);
  for (const l of TTS_ALL_LOCALES) {
    assert.ok(V.ACCENT[l], l);
    const s = V.sampleFor(l);
    assert.ok(s && !/[{}]/.test(s) && s.length < 160, l);
    assert.ok(s.includes('Oomba Academy'), l);
    if (l !== 'en') assert.notEqual(s, tFor('en')('tts.sample'), `${l} has its own sample`);
  }
  assert.match(V.ACCENT['zh-Hant'], /Taiwanese Mandarin/); assert.match(V.ACCENT['zh-Hant'], /never Cantonese/);
  for (const r of V.ROLES) for (const l of TTS_ALL_LOCALES) assert.ok(V.VOICES.includes(V.voiceFor(r, l)), `${r}/${l}`);
  assert.deepEqual(V.onLocales(), [], 'every locale off by default');
  assert.equal(tts.localeOn('en'), false);
  assert.equal(V.save('admin1', { locales: { en: { on: true, narrator: 'nope' } } }).ok, false);
  assert.equal(V.save('admin1', { roles: { grumpy: 'darth' } }).ok, false);
  assert.equal(V.save('admin1', { roles: { narrator: 'coral' } }).ok, false, 'the narrator is per locale');
  config.ttsLocales = ['en'];
  assert.equal(V.save('admin1', { locales: { fr: { on: true } } }).ok, false, 'outside TTS_LOCALES');
  const r = V.save('admin1', { locales: { en: { on: true, narrator: 'marin' } }, roles: { grumpy: 'fable' } });
  assert.ok(r.ok);
  V._forget();
  assert.equal(V.load().locales.en.on, true); assert.equal(V.voiceFor('narrator', 'en'), 'marin'); assert.equal(V.voiceFor('grumpy', 'ja'), 'fable');
  assert.equal(tts.localeOn('en'), true); assert.deepEqual(tts.onLocales(), ['en']);
  const a = q.get("SELECT * FROM audit_log WHERE action='admin.tts.settings' ORDER BY created_at DESC LIMIT 1");
  assert.deepEqual(JSON.parse(a.details), { 'en.on': true, 'en.narrator': 'marin', 'role.grumpy': 'fable' });
  config.ttsEnabled = false;
  assert.equal(tts.localeOn('en'), false, 'the owner switch wins'); assert.deepEqual(tts.onLocales(), []);
  config.ttsLocales = [...TTS_ALL_LOCALES];
});

test('locale mapping and instructions', () => {
  const m = { en: 'en', 'en-US': 'en', 'en-GB': 'en-GB', 'EN_gb': 'en-GB', 'zh-Hant': 'zh-Hant', 'zh-TW': 'zh-Hant', 'zh-HK': 'zh-Hant', 'zh-CN': null, zh: null, 'pt-BR': 'pt', 'pt-PT': null, he: 'he', 'ar-EG': 'ar', 'ko': null, '': null };
  for (const [k, v] of Object.entries(m)) assert.equal(V.ttsLocale(k), v, k);
  assert.equal(V.rateBucket(0.7), 'slow'); assert.equal(V.rateBucket(1), 'normal'); assert.equal(V.rateBucket(1.5), 'fast'); assert.equal(V.rateBucket('x'), 'normal');
  const ins = V.instructionsFor('grumpy', 'ja', 'fast');
  assert.match(ins, /never frightening/); assert.match(ins, /Japanese/); assert.match(ins, /quicker/);
});
