// AI voices over HTTP (server/routes/tts.js) with the mock provider: POST /api/tts only for the contexts that pick
// site- or teacher-written text (an official game's signed token bound to the player; the live question open now, by
// number; a lesson quiz question the student may see), locales off until the admin switches them on, the backstop
// filters, generation limits; GET /tts/<hash>.mp3 headers and refusals; the admin voice page and its APIs; the play
// page's token and the frame's INIT.tts only for official games listed in tts-lines GAMES (Hero of Sunvale), and for
// them only the game's own spoken lines (an allowlist from the repository file), with the line's own role.
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
const seedGame = publish(official, GAME_HTML, { source: 'seed', slug: 'hero-of-sunvale', title: 'Hero of Sunvale' });
// An official game missing from the AI voices list (a bug: every official game must be registered — the coverage
// test in tts-coverage.test.js guards it): no token, device voice only.
const unlistedGame = publish(official, GAME_HTML, { source: 'seed', slug: 'unlisted-test-game', title: 'Unlisted' });
// Two games registered by the all-games rule (5 Nov 2026): a word game and a kit-built course game.
const wordHuntGame = publish(official, GAME_HTML, { source: 'seed', slug: 'word-hunt', title: 'Word Hunt' });
const trickGame = publish(official, GAME_HTML, { source: 'seed', slug: 'trick-inbox', title: 'Trick Inbox' });
const kidGame = publish(kid, GAME_HTML, { source: 'studio', slug: 'tts-kid-game', title: 'Mine' });
tts.hooks.log = () => {};

function on(locales = ['en']) {
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  config.ttsPerMinute = 20; config.ttsDailyChars = 300000; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: locales.includes(l) }])) });
}
function off() { config.ttsEnabled = false; config.ttsProvider = 'openai'; }
const usage = await import('../../server/services/tts-usage.js');
test.beforeEach(() => { reset(); usage._resetQuota(); q.run('DELETE FROM tts_cache'); q.run('DELETE FROM tts_usage'); q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); });
test.afterEach(() => off());

const gameTok = (user, g = seedGame) => R.playData(user, g)?.tok;
const say = (user, body) => call('/api/tts', { method: 'POST', body, user });
// Hero of Sunvale's own spoken lines (en), from the repository file.
const HERO = lines.gameLines('hero-of-sunvale', 'en');
const heroLine = key => HERO.find(x => x.key === key).text;
const CHEER = heroLine('mg.cheer'), GRANNY = heroLine('d.granny.1'), INTRO = heroLine('intro.1');

test('off by default: POST answers 404 off, no token on the play page, no INIT.tts in the frame', async () => {
  off();
  assert.deepEqual((await say(mia, { ctx: 'game', tok: 'x', text: 'Hi', lang: 'en' })).json, { code: 'off' });
  assert.equal(R.playData(mia, seedGame), null);
  const page = await call('/play/hero-of-sunvale', { user: mia });
  assert.equal(page.status, 200);
  assert.ok(!page.text.includes('"tts"'), 'no tts in page-data');
});

test('game: an official game\'s token works for its own player only; Builder games never get one; the locale must be on', async () => {
  on(['en']);
  const d = R.playData(mia, seedGame);
  assert.deepEqual(d.langs, ['en']); assert.ok(d.tok);
  assert.equal(R.playData(mia, kidGame), null, 'a kid-made game: device voice only');
  assert.equal(R.playData(null, seedGame), null, 'nobody signed in');
  const r = await say(mia, { ctx: 'game', tok: d.tok, text: CHEER, lang: 'en-US', role: 'friendly', rate: 1 });
  assert.equal(r.status, 200, r.text); assert.match(r.json.u, /^\/tts\/[0-9a-f]{64}\.mp3$/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  // The role is the line's own (Marigold's cheer: bright), whatever the page asked for.
  assert.equal(r.json.u, tts.urlOf(tts.plan({ text: CHEER, locale: 'en', role: 'bright' }).hash));
  // Only the game's own words: free text with a valid token is refused (a kid with devtools can't have anything read).
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'Find the hidden word!', lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: `${CHEER} Mia`, lang: 'en' })).json, { code: 'filtered' });
  // A line with a {placeholder}: numbers only in its place, never letters.
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: 'Crystal smashed! 2/5', lang: 'en' })).status, 200);
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'Crystal smashed! Mia/5', lang: 'en' })).json, { code: 'filtered' });
  // Another language's own words, in that language only.
  const deCheer = lines.gameLines('hero-of-sunvale', 'de').find(x => x.key === 'mg.cheer').text;
  on(['en', 'de']);
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: deCheer, lang: 'de' })).status, 200);
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: deCheer, lang: 'en' })).json, { code: 'filtered' });
  on(['en']);
  // Another account can't use mia's token; a forged token is refused.
  assert.equal((await say(leo, { ctx: 'game', tok: d.tok, text: CHEER, lang: 'en' })).status, 403);
  assert.equal((await say(null, { ctx: 'game', tok: d.tok, text: CHEER, lang: 'en' })).status, 403);
  const forged = auth.signToken({ k: 'tts', g: kidGame.id, u: mia.id }, 60);
  assert.equal((await say(mia, { ctx: 'game', tok: forged, text: CHEER, lang: 'en' })).json.code, 'off', 'a token for a Builder game is refused');
  // An official game that isn't listed for AI voices: no data, and a token minted for it anyway is refused.
  assert.equal(R.playData(mia, unlistedGame), null); assert.equal(R.frameData(mia, unlistedGame), null);
  assert.equal((await say(mia, { ctx: 'game', tok: auth.signToken({ k: 'tts', g: unlistedGame.id, u: mia.id }, 60), text: CHEER, lang: 'en' })).status, 404);
  assert.equal((await say(mia, { ctx: 'game', tok: auth.signToken({ g: seedGame.id, u: mia.id }, 60), text: 'Hi', lang: 'en' })).status, 403, 'not a tts token');
  // A locale that is off (fr), or one TTS can't speak (zh-CN): 404 off.
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: 'Bonjour !', lang: 'fr' })).json.code, 'off');
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: '你好', lang: 'zh-CN' })).json.code, 'off');
  // The backstops.
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'x'.repeat(601), lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'you shit', lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'email me: a@b.com', lang: 'en' })).json, { code: 'filtered' });
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: `Great job, ${mia.display_name}!`, lang: 'en' })).json, { code: 'filtered' }, 'never the player\'s name');
  assert.equal((await say(mia, { ctx: 'nope' })).status, 400);
  // The game hidden since: refused.
  q.run("UPDATE games SET hidden_reason='test' WHERE id=?", seedGame.id);
  assert.equal((await say(mia, { ctx: 'game', tok: d.tok, text: CHEER, lang: 'en' })).json.code, 'off');
  q.run("UPDATE games SET hidden_reason='' WHERE id=?", seedGame.id);
});

test('the all-games rule: a word game and a kit course game get tokens; only their own lines are read', async () => {
  on(['en']);
  // Word Hunt (registered 5 Nov 2026; before, it kept the device voice): the play page mints a token, and the
  // request for one of its own lines goes to the AI-voices route with the line's role (narrator).
  const d = R.playData(mia, wordHuntGame);
  assert.ok(d && d.tok, 'word-hunt gets a token now'); assert.deepEqual(d.langs, ['en']);
  const tag = lines.gameLines('word-hunt', 'en').find(x => x.key === 'tag').text;
  const r = await say(mia, { ctx: 'game', tok: d.tok, text: tag, lang: 'en' });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.u, tts.urlOf(tts.plan({ text: tag, locale: 'en', role: 'narrator' }).hash), 'read with the narrator role');
  // A word a kid could type is not one of its lines: refused, so it falls back to the device voice in the game.
  assert.deepEqual((await say(mia, { ctx: 'game', tok: d.tok, text: 'elephant', lang: 'en' })).json, { code: 'filtered' });
  // Trick Inbox (a kit-built course game, registered the same day): it is inside the system (token minted), but
  // it has no extractable line table, so no text is readable in game context — never free text.
  const td = R.playData(mia, trickGame);
  assert.ok(td && td.tok, 'trick-inbox gets a token now');
  assert.deepEqual((await say(mia, { ctx: 'game', tok: td.tok, text: 'Is this email safe?', lang: 'en' })).json, { code: 'filtered' });
});

test('play page and frame: the token and INIT.tts only for an official game with a locale on', async () => {
  on(['en', 'fr']);
  const page = await call('/play/hero-of-sunvale', { user: mia });
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
  const unlistedPage = await call('/play/unlisted-test-game', { user: mia });
  assert.ok(!unlistedPage.text.includes('"tts"') && !unlistedPage.text.includes('id="p-voices"'), 'no tts and no Voices button for an official game not listed');
});

test('GET /tts/<hash>.mp3: audio/mpeg, immutable, same-origin only; unknown hashes 404', async () => {
  on(['en']);
  const r = await say(mia, { ctx: 'game', tok: gameTok(mia), text: INTRO, lang: 'en' });
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
  const again = await say(mia, { ctx: 'game', tok: gameTok(mia), text: INTRO, lang: 'en' });
  assert.equal(again.json.u, r.json.u);
  assert.equal(q.get('SELECT COUNT(*) n FROM tts_cache').n, 1);
  // Nothing in the cache row or the usage table identifies who asked or what was said.
  const row = q.get('SELECT * FROM tts_cache');
  assert.ok(!JSON.stringify(row).includes(INTRO.slice(0, 12)) && !JSON.stringify(row).includes(mia.id));
});

test('limits: the 21st new line in a minute is refused (cached lines still come); requests a minute', async () => {
  on(['en']);
  const tok = gameTok(mia);
  const short = HERO.filter(x => x.text.length < 60);
  for (let i = 0; i < 20; i++) assert.equal((await say(mia, { ctx: 'game', tok, text: short[i].text, lang: 'en' })).status, 200);
  const r = await say(mia, { ctx: 'game', tok, text: short[20].text, lang: 'en' });
  assert.equal(r.status, 429); assert.equal(r.json.code, 'fast');
  assert.equal((await say(mia, { ctx: 'game', tok, text: short[0].text, lang: 'en' })).status, 200, 'cached still plays');
  for (let i = 0; i < 100; i++) await say(mia, { ctx: 'game', tok, text: short[0].text, lang: 'en' });
  assert.equal((await say(mia, { ctx: 'game', tok, text: short[0].text, lang: 'en' })).json.code, 'fast', '120 requests a minute');
  // The site's daily characters.
  reset(); config.ttsDailyChars = 1000;
  q.run("INSERT INTO tts_usage(day, chars) VALUES (date('now'), 1000) ON CONFLICT(day) DO UPDATE SET chars=1000");
  assert.deepEqual((await say(leo, { ctx: 'game', tok: gameTok(leo), text: short[25].text, lang: 'en' })).json, { code: 'site' });
});

test('budget: TTS keeps to its own share (a daily cap from the AI budget, the free pool past 80%), and a daily quota per person and address', async () => {
  on(['en']);
  // The default cap: about 20% of the daily AI budget at the price per 1k characters ($5 x 20% / $0.015 per 1k).
  assert.equal(usage.dailyCap({ ttsDailyChars: null, aiDailyBudgetUsd: 5, ttsUsdPer1kChars: 0.015 }), 66666);
  assert.equal(usage.dailyCap({ ttsDailyChars: 12345, aiDailyBudgetUsd: 5, ttsUsdPer1kChars: 0.015 }), 12345);
  // One account: new characters a day (cache hits are free).
  const keep = config.ttsUserDailyChars; config.ttsUserDailyChars = 200;
  try {
    const tok = gameTok(mia);
    const longish = HERO.filter(x => x.text.length >= 60 && x.text.length < 100);
    let sent = 0, i = 0, last;
    while (sent + longish[i].text.length <= 200) { last = await say(mia, { ctx: 'game', tok, text: longish[i].text, lang: 'en' }); assert.equal(last.status, 200, last.text); sent += longish[i].text.length; i++; }
    assert.deepEqual((await say(mia, { ctx: 'game', tok, text: longish[i].text, lang: 'en' })).json, { code: 'fast' }, 'over the day\'s characters');
    assert.equal((await say(mia, { ctx: 'game', tok, text: longish[0].text, lang: 'en' })).status, 200, 'cached still plays');
    assert.equal((await say(leo, { ctx: 'game', tok: gameTok(leo), text: longish[i].text, lang: 'en' })).status, 200, 'another account has its own');
  } finally { config.ttsUserDailyChars = keep; }
  // The free AI pool at 80% of its daily budget: no new audio (the Builder and picture checks keep the rest).
  q.run("INSERT INTO ai_spend(day, usd, calls) VALUES (date('now'), ?, 1) ON CONFLICT(day) DO UPDATE SET usd=excluded.usd", config.aiDailyBudgetUsd * 0.81);
  assert.deepEqual((await say(kid, { ctx: 'game', tok: gameTok(kid), text: INTRO, lang: 'en' })).json, { code: 'site' });
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
  // The session's language only: a seat asking for another language gets the same audio (no extra generations).
  on(['en', 'fr']);
  const fr = await say(mia, { ctx: 'live', sid: s.id, tok: seatTok, i: 0, lang: 'fr' });
  assert.equal(fr.json.u, r.json.u);
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

test('course lesson slides: the server reads the slide of an open step in English with the game character voice', async () => {
  reset(); on(['en']);
  const C = await import('../../server/services/courses.js');
  const c = C.getCourse('cs-quest');
  C.setBand(mia, c, '1b');
  const first = C.steps(c, '1b')[0], second = C.steps(c, '1b')[1];
  const r = await say(mia, { ctx: 'course', course: 'cs-quest', step: first.key, i: 0 });
  assert.equal(r.status, 200); assert.match(r.json.u, /^\/tts\/[0-9a-f]{64}\.mp3$/);
  // a locked step, a slide that is not there, a stranger without an account: the device's voice
  assert.deepEqual((await say(mia, { ctx: 'course', course: 'cs-quest', step: second.key, i: 0 })).json, { code: 'off' });
  assert.deepEqual((await say(mia, { ctx: 'course', course: 'cs-quest', step: first.key, i: 99 })).json, { code: 'off' });
  assert.deepEqual((await say(null, { ctx: 'course', course: 'cs-quest', step: first.key, i: 0 })).json, { code: 'off' });
  // the page never sends text: a text field is ignored
  const again = await say(mia, { ctx: 'course', course: 'cs-quest', step: first.key, i: 0, text: 'something else' });
  assert.equal(again.json.u, r.json.u);
  off();
});
