// AI voices over HTTP (server/routes/tts.js) with the mock provider: POST /api/tts only for the contexts that pick
// site- or teacher-written text (an official game's signed token bound to the player; the live question open now, by
// number; a lesson quiz question the student may see), locales off until the admin switches them on, the backstop
// filters, generation limits; GET /tts/<hash>.mp3 headers and refusals; the admin voice page and its APIs; the play
// page's token and the frame's INIT.tts only for official games.
import { reset, call, config, q, auth, LS, games, publish, official, teacher, cls, mia, leo, kid, boss, open } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const { TTS_ALL_LOCALES } = await import('../../server/config.js');
const tts = await import('../../server/services/tts.js');
const V = await import('../../server/services/tts-voices.js');
const lines = await import('../../server/services/tts-lines.js');
const SETS = await import('../../server/services/classlive-sets.js');
const R = await import('../../server/routes/tts.js');

const GAME_HTML = '<!doctype html><title>t</title><p>hi</p><script>BRB.speak("Hello there!")</script>';
const seedGame = publish(official, GAME_HTML, { source: 'seed', slug: 'tts-seed-game', title: 'Seed' });
const kidGame = publish(kid, GAME_HTML, { source: 'studio', slug: 'tts-kid-game', title: 'Mine' });
tts.hooks.log = () => {};

function on(locales = ['en']) {
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  config.ttsPerMinute = 20; config.ttsDailyChars = 300000; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: locales.includes(l) }])) });
}
function off() { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
test.beforeEach(() => { reset(); q.run('DELETE FROM tts_cache'); q.run('DELETE FROM tts_usage'); });
test.afterEach(() => off());

const gameTok = (user, g = seedGame) => R.playData(user, g)?.tok;
const say = (user, body) => call('/api/tts', { method: 'POST', body, user });

test('off by default: POST answers 404 off, no token on the play page, no INIT.tts in the frame', async () => {
  off();
  assert.deepEqual((await say(mia, { ctx: 'game', tok: 'x', text: 'Hi', lang: 'en' })).json, { code: 'off' });
  assert.equal(R.playData(mia, seedGame), null);
  const page = await call('/play/tts-seed-game', { user: mia });
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('"tts"'), 'no tts in page-data');
});

test('game: an official game\'s token works for its own player only; Builder games never get one; the locale must be on', async () => {
  on(['en']);
  const d = R.playData(mia, seedGame);
  assert.deepEqual(d.langs, ['en']); assert.ok(d.tok);
  assert.equal(R.playData(mia, kidGame), null, 'a kid-made game: device voice only');
  assert.equal(R.playData(null, seedGame), null, 'nobody signed in');
  const r = await say(mia, { ctx: 'game', tok: d.tok, text: 'Find the hidden word!', lang: 'en-US', role: 'friendly', rate: 1 });
  assert.equal(r.status, 200, r.text); assert.match(r.json.u, /^\/tts\/[0-9a-f]{64}\.mp3$/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  // Another account can't use mia's token; a forged token is refused.
  assert.equal((await say(leo, { ctx: 'game', tok: d.tok, text: 'Find the hidden word!', lang: 'en' })).status, 403);
  assert.equal((await say(null, { ctx: 'game', tok: d.tok, text: 'Find the hidden word!', lang: 'en' })).status, 403);
  const forged = auth.signToken({ k: 'tts', g: kidGame.id, u: mia.id }, 60);
  assert.equal((await say(mia, { ctx: 'game', tok: forged, text: 'Hi friend', lang: 'en' })).json.code, 'off', 'a token for a Builder game is refused');
  assert.equal((await say(mia, { ctx: 'game', tok: auth.signToken({ g: seedGame.id, u: mia.id }, 60), text: 'Hi', lang: 'en' })).status, 403, 'not a tts token');
  // A locale that is off (fr), or one TTS can't speak (zh-CN): 404 off.
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: 'Bonjour !', lang: 'fr' })).json.code, 'off');
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: '你好', lang: 'zh-CN' })).json.code, 'off');
  // The backstops.
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'x'.repeat(601), lang: 'en' })).json, { code: 'long' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'you shit', lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'email me: a@b.com', lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: `Great job, ${mia.display_name}!`, lang: 'en' })).json, { code: 'filtered' }, 'never the player\'s name');
  assert.equal((await say(mia, { ctx: 'nope' })).status, 400);
  // The game hidden since: refused.
  q.run("UPDATE games SET hidden_reason='test' WHERE id=?", seedGame.id);
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: 'Find the hidden word!', lang: 'en' })).json.code, 'off');
  q.run("UPDATE games SET hidden_reason='' WHERE id=?", seedGame.id);
});

test('play page and frame: the token and INIT.tts only for an official game with a locale on', async () => {
  on(['en', 'fr']);
  const page = await call('/play/tts-seed-game', { user: mia });
  const pd = JSON.parse(/<script type="application\/json" id="page-data">(.*?)<\/script>/s.exec(page.text)[1]);
  assert.deepEqual(pd.tts.langs, ['en', 'fr']); assert.ok(pd.tts.tok);
  const frameUrl = /data-src="(\/frame\/[^"]+)"/.exec(page.text)[1];
  const frame = await call(frameUrl, { user: mia });
  assert.equal(frame.status, 200);
  assert.match(frame.text, /"tts":\{"langs":\["en","fr"\]\}/);
  const kidPage = await call('/play/tts-kid-game', { user: mia });
  assert.ok(!kidPage.text.includes('"tts"'));
  const kidFrame = await call(/data-src="(\/frame\/[^"]+)"/.exec(kidPage.text)[1], { user: mia });
  assert.ok(!kidFrame.text.includes('"tts":{'), 'no INIT.tts for a Builder game');
});

test('GET /tts/<hash>.mp3: audio/mpeg, immutable, same-origin only; unknown hashes 404', async () => {
  on(['en']);
  const r = await say(mia, { ctx: 'game', tok: gameTok(mia), text: 'Ready, set, go!', lang: 'en' });
  const a = await fetch(`${(await import('./_live.js')).ctx.base}${r.json.u}`);
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('content-type'), 'audio/mpeg');
  assert.equal(a.headers.get('cache-control'), 'private, max-age=2592000, immutable');
  assert.equal(a.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(a.headers.get('cross-origin-resource-policy'), 'same-origin');
  const bytes = Buffer.from(await a.arrayBuffer());
  assert.ok(tts.isMp3(bytes));
  assert.equal((await call(r.json.u, { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
  assert.equal((await call(r.json.u, { headers: { 'sec-fetch-site': 'same-origin' } })).status, 200);
  assert.equal((await call(`/tts/${'0'.repeat(64)}.mp3`)).status, 404);
  assert.equal((await call('/tts/../../etc/passwd')).status, 404);
  assert.equal((await call('/tts/abc.mp3')).status, 404);
  // Same line again: from the cache, the same URL.
  const again = await say(mia, { ctx: 'game', tok: gameTok(mia), text: 'Ready, set, go!', lang: 'en' });
  assert.equal(again.json.u, r.json.u);
  assert.equal(q.get('SELECT COUNT(*) n FROM tts_cache').n, 1);
  // Nothing in the cache row or the usage table identifies who asked or what was said.
  const row = q.get('SELECT * FROM tts_cache');
  assert.ok(!JSON.stringify(row).includes('Ready') && !JSON.stringify(row).includes(mia.id));
});

test('limits: the 21st new line in a minute is refused (cached lines still come); requests a minute', async () => {
  on(['en']);
  const tok = gameTok(mia);
  for (let i = 0; i < 20; i++) assert.equal((await say(mia, { ctx: 'game', tok, text: `Line ${'abcdefghijklmnopqrstuvwxyz'[i]} is here`, lang: 'en' })).status, 200);
  const r = await say(mia, { ctx: 'game', tok, text: 'One line too many', lang: 'en' });
  assert.equal(r.status, 429); assert.equal(r.json.code, 'fast');
  assert.equal((await say(mia, { ctx: 'game', tok, text: 'Line a is here', lang: 'en' })).status, 200, 'cached still plays');
  for (let i = 0; i < 100; i++) await say(mia, { ctx: 'game', tok, text: 'Line a is here', lang: 'en' });
  assert.equal((await say(mia, { ctx: 'game', tok, text: 'Line a is here', lang: 'en' })).json.code, 'fast', '120 requests a minute');
  // The site's daily characters.
  reset(); config.ttsDailyChars = 1000;
  q.run("INSERT INTO tts_usage(day, chars) VALUES (date('now'), 1000) ON CONFLICT(day) DO UPDATE SET chars=1000");
  assert.deepEqual((await say(leo, { ctx: 'game', tok: gameTok(leo), text: 'A brand new line', lang: 'en' })).json, { code: 'site' });
});

test('live: only the question open now, by number, for a seat or the host; the teacher\'s "device voices" setting turns it off', async () => {
  on(['en']);
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id });
  const j = LS.join(s, mia); assert.ok(j.ok, JSON.stringify(j));
  const seatTok = LS.seatToken(s, j.seat), hostTok = LS.hostToken(s);
  const ask = (user, tok, i) => say(user, { ctx: 'live', sid: s.id, tok, i });
  assert.equal((await ask(mia, seatTok, 0)).json.code, 'notNow', 'nothing open yet');
  // The first question opens (as the quiz module does it: s.qz.cur with its shuffled choices).
  s.qz = { i: 0, cur: { i: 0, q: 'Capital of France?', choices: ['Rome', 'Paris', 'Oslo'], answer: 1, secs: 20, at: Date.now() }, answers: new Map() };
  s.phase = 'playing';
  const r = await ask(mia, seatTok, 0);
  assert.equal(r.status, 200, r.text);
  // The text was built on the server from the teacher's question (A/B/C choices).
  const p = tts.plan({ text: R.questionText('Capital of France?', ['Rome', 'Paris', 'Oslo']), locale: 'en', role: 'narrator' });
  assert.equal(r.json.u, tts.urlOf(p.hash));
  assert.equal(R.questionText('Capital of France?', ['Rome', 'Paris']), 'Capital of France? A: Rome. B: Paris.');
  assert.equal((await ask(null, hostTok, 0)).status, 403, 'the host token needs the host signed in');
  assert.equal((await ask(teacher, hostTok, 0)).status, 200, 'the projector');
  assert.equal((await ask(mia, seatTok, 1)).json.code, 'notNow', 'never a question still to come');
  assert.equal((await ask(leo, seatTok, 0)).status, 403, 'another account with mia\'s seat token');
  assert.equal((await ask(mia, 'garbage', 0)).status, 404);
  s.settings.voices = 'device';
  assert.equal((await ask(mia, seatTok, 0)).json.code, 'off');
});

test('lesson: a quiz step\'s question by number, only for a student who may see it', async () => {
  on(['en']);
  config.liveHomework = true;
  try {
    const st = SETS.createSet(teacher, { title: 'Sums', items: [{ q: 'What is 2 + 2?', choices: ['3', '4'], answer: 1, secs: 20 }], lang: 'en' }).set;
    const hw = await call(`/api/live/sets/${st.id}/homework`, { method: 'POST', body: { classId: cls.id }, user: teacher });
    assert.equal(hw.status, 200, hw.text);
    const step = q.get("SELECT * FROM lesson_steps WHERE lesson_id=? AND kind='quiz'", hw.json.lessonId);
    const body = i => ({ ctx: 'lesson', clId: hw.json.classLessonId, stepId: step.id, i });
    assert.equal((await say(mia, body(0))).status, 200);
    assert.equal((await say(mia, body(1))).status, 404);
    assert.equal((await say(kid, body(0))).status, 404, 'not in the class');
    assert.equal((await say(null, body(0))).status, 404);
  } finally { config.liveHomework = false; }
});

test('admin: /admin/voices and its APIs are admin-only; samples play in any language; settings saved; warm-up runs', async () => {
  on([]);
  for (const [path, method] of [['/admin/voices', 'GET'], ['/api/admin/tts/sample', 'POST'], ['/api/admin/tts/settings', 'POST'], ['/api/admin/tts/warm', 'GET'], ['/api/admin/tts/warm', 'POST']]) {
    const r = await call(path, { method, user: teacher, ...(method === 'POST' ? { body: {} } : {}) });
    assert.equal(r.status, 404, `${method} ${path}`);
  }
  const pg = await call('/admin/voices', { user: boss });
  assert.equal(pg.status, 200);
  assert.equal((pg.text.match(/data-play /g) || []).length, 13 * 13, 'a 13 x 13 grid');
  for (const l of TTS_ALL_LOCALES) assert.ok(pg.text.includes(V.sampleFor(l).replace(/'/g, '&#39;')), `sample ${l}`);
  assert.match(pg.text, /lang="he" dir="rtl"/);
  // A sample in a locale that is still off (the admin listens first).
  const s = await call('/api/admin/tts/sample', { method: 'POST', body: { locale: 'ja', voice: 'nova' }, user: boss });
  assert.equal(s.status, 200, s.text); assert.match(s.json.u, /^\/tts\//);
  assert.equal(q.get('SELECT pinned FROM tts_cache').pinned, 1, 'samples are kept');
  assert.equal((await call('/api/admin/tts/sample', { method: 'POST', body: { locale: 'ja', voice: 'darth' }, user: boss })).status, 400);
  // Settings.
  const bad = await call('/api/admin/tts/settings', { method: 'POST', body: { locales: { en: { narrator: 'darth' } } }, user: boss });
  assert.equal(bad.status, 400);
  const ok = await call('/api/admin/tts/settings', { method: 'POST', body: { locales: { en: { on: true, narrator: 'sage' } }, roles: { wise: 'ballad' } }, user: boss });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(V.voiceFor('narrator', 'en'), 'sage'); assert.deepEqual(tts.onLocales(), ['en']);
  // Warm-up of Hero of Sunvale for en (the mock): every line made, then a second run is all cached.
  const w = await call('/api/admin/tts/warm', { method: 'POST', body: { games: ['hero-of-sunvale'], locales: ['en'] }, user: boss });
  assert.equal(w.status, 200, w.text); assert.equal(w.json.running, true);
  await lines._wait();
  const done = (await call('/api/admin/tts/warm', { user: boss })).json;
  assert.equal(done.running, false); assert.ok(done.done > 50, JSON.stringify(done)); assert.equal(done.failed, 0); assert.equal(done.stopped, null);
  assert.equal(done.done, done.total - done.skipped);
  await call('/api/admin/tts/warm', { method: 'POST', body: { locales: ['en'] }, user: boss });
  await lines._wait();
  const again = (await call('/api/admin/tts/warm', { user: boss })).json;
  assert.equal(again.cached, again.done, 'all from the cache');
  assert.ok(q.get('SELECT COUNT(*) n FROM tts_cache WHERE pinned=0').n === 0, 'warm-up lines are pinned');
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.tts.warm'"));
  // The admin page shows the estimate (nothing left to make for en).
  assert.match((await call('/admin/voices', { user: boss })).text, /0 still to make/);
  // Files exist for every row.
  for (const r of q.all('SELECT hash FROM tts_cache')) assert.ok(fs.existsSync(tts.fileOf(r.hash)));
});

test('warm-up: one run at a time; it stops at the daily characters', async () => {
  on(['de']);
  q.run('DELETE FROM tts_cache');
  config.ttsDailyChars = 1000;
  const r = lines.start({ games: ['hero-of-sunvale'], locales: ['de'], by: boss.id });
  assert.ok(r.ok);
  assert.equal(lines.start({ games: ['hero-of-sunvale'], locales: ['de'], by: boss.id }).ok, false, 'one at a time');
  await lines._wait();
  const st = lines.status();
  assert.equal(st.stopped, 'budget'); assert.ok(st.done < st.total); assert.ok(st.chars <= 1000);
});
