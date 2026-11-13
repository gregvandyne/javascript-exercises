// AI voices for games made in the Builder, by default (server/services/tts-built.js, routes/tts.js; the owner's decision
// of 2026-11-13, docs/decisions.md "AI voices for Builder games: fixed, scanned lines only").
// The safety rule these tests pin: a Builder game's AI voice reads ONLY a line that is exactly one of the strings fixed
// in the stored source of its published version, and only when that version passed the safety scanner. What a player
// types while playing (an input's value), a string the game puts together while it runs, a line with a number or a
// name filled in, and another game's line never reach the voice provider: the provider is spied on here, so "never
// sent" is checked, not just "answered 422".
import { reset, call, config, q, db, auth, games, publish, official, teacher, mia, leo, kid, boss } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { TTS_ALL_LOCALES } = await import('../../server/config.js');
const tts = await import('../../server/services/tts.js');
const V = await import('../../server/services/tts-voices.js');
const BG = await import('../../server/services/tts-built.js');
const TG = await import('../../server/services/tts-games.js');
const lines = await import('../../server/services/tts-lines.js');
const R = await import('../../server/routes/tts.js');
const P = await import('../../server/services/publish.js');
const usage = await import('../../server/services/tts-usage.js');
tts.hooks.log = () => {};

// A kid's game with an input: it tries to have the typed value read, alone and inside its own sentences.
const ECHO = `<!doctype html><title>Animal Echo</title>
<h1>Animal Echo</h1><p id="ask">What is your favourite animal?</p>
<input id="answer" placeholder="Type an animal" value="starter text"><button id="go" aria-label="Read my answer">Read it</button>
<script>
const PRAISE = ['Well done!', 'Great job, explorer!'];
const WORDS = ['CAT', 'dog'];
const T = { hello: "Welcome to Animal Echo! Type an animal, then press the button.", level: 'Level 3 is next.' };
let score = 0;
BRB.speak(T.hello, { lang: 'en' });
go.onclick = () => {
  BRB.speak(answer.value);                              // what the player typed
  BRB.speak('You typed ' + answer.value + '!');         // typed text inside the game's own sentence
  BRB.speak(\`Hello \${answer.value}, nice to meet you.\`);
  BRB.speak(['Well', 'done', answer.value].join(' '));  // put together while playing
  BRB.speak('Your score is ' + score + ' points.');
  BRB.speak(PRAISE[0]);
};
</script>`;
const OTHER = `<!doctype html><title>Space Quiz</title><p>Which planet has rings?</p>
<script>BRB.speak("Three, two, one, lift off!"); BRB.speak('The rocket is ready.');</script>`;

const kidGame = publish(kid, ECHO, { slug: 'animal-echo', title: 'Animal Echo' });
const otherGame = publish(mia, OTHER, { slug: 'space-quiz-b', title: 'Space Quiz' });
const seedGame = publish(official, ECHO, { source: 'seed', slug: 'hero-of-sunvale', title: 'Hero of Sunvale' });
const unlistedSeed = publish(official, ECHO, { source: 'seed', slug: 'built-test-unlisted', title: 'Unlisted' });

// Every text the provider is handed (the mock stands where OpenAI would be).
const sent = [];
const mock = tts.PROVIDERS.mock;
tts.PROVIDERS.mock = async a => { sent.push(a.text); return mock(a); };

function on(locales = ['en']) {
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  config.ttsPerMinute = 20; config.ttsDailyChars = 300000; config.ttsMaxChars = 600; config.ttsUserDailyChars = 5000; config.ttsIpDailyChars = 30000;
  config.ttsBuiltGames = true;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: locales.includes(l) }])) });
}
const off = () => { config.ttsEnabled = false; config.ttsProvider = 'openai'; config.ttsBuiltGames = true; };
test.beforeEach(() => {
  reset(); usage._resetQuota(); sent.length = 0; BG._clear(); TG._clear();
  q.run('DELETE FROM tts_cache'); q.run('DELETE FROM tts_usage'); q.run('DELETE FROM ai_spend'); q.run('DELETE FROM ai_spend_pool'); q.run("DELETE FROM settings WHERE key='tts.games'");
});
test.afterEach(() => off());
const say = (user, body) => call('/api/tts', { method: 'POST', body, user });
const fresh = g => games.getGame(g.id);
const tokFor = (user, g) => R.playData(user, fresh(g)).tok;
const ask = (user, g, text, extra = {}) => say(user, { ctx: 'game', tok: tokFor(user, g), text, lang: 'en', ...extra });
const refused = async (user, g, text, why) => {
  const r = await ask(user, g, text);
  assert.deepEqual([r.status, r.json], [422, { code: 'filtered' }], `${why || text}: ${r.text}`);
};
const HELLO = 'Welcome to Animal Echo! Type an animal, then press the button.';

test('which games: a published Builder game whose version passed the scanner; never a flagged, failed, unscanned, hidden or draft one, a banned maker, or with the switches off', async () => {
  off();
  assert.equal(R.playData(mia, kidGame), null, 'site voices off');
  assert.deepEqual((await say(mia, { ctx: 'game', tok: 'x', text: HELLO, lang: 'en' })).json, { code: 'off' });
  on(['en']);
  assert.equal(BG.allowed(kidGame), true); assert.equal(R.builtGame(kidGame), true);
  assert.ok(R.playData(mia, kidGame).tok); assert.deepEqual(R.frameData(mia, kidGame), { langs: ['en'] });
  assert.equal(R.playData(null, kidGame), null, 'nobody signed in');
  // The owner's kill switch.
  config.ttsBuiltGames = false;
  assert.equal(R.playData(mia, kidGame), null); assert.equal(R.frameData(mia, kidGame), null);
  config.ttsBuiltGames = true;
  // No language switched on: nothing.
  on([]); assert.equal(R.playData(mia, kidGame), null); on(['en']);
  // The scanner's stored result decides: only 'pass'.
  const vid = kidGame.published_version_id, tok = tokFor(mia, kidGame);
  for (const status of ['flag', 'fail', 'unchecked']) {
    q.run('UPDATE game_versions SET safety_status=? WHERE id=?', status, vid);
    assert.equal(BG.allowed(fresh(kidGame)), false, status); assert.equal(R.playData(mia, fresh(kidGame)), null, status);
    assert.deepEqual((await say(mia, { ctx: 'game', tok, text: HELLO, lang: 'en' })).json, { code: 'off' }, `${status}: a token minted earlier is refused`);
  }
  q.run("UPDATE game_versions SET safety_status='pass' WHERE id=?", vid);
  assert.equal((await say(mia, { ctx: 'game', tok, text: HELLO, lang: 'en' })).status, 200);
  // Hidden, unpublished, deleted: off.
  q.run("UPDATE games SET hidden_reason='test' WHERE id=?", kidGame.id);
  assert.equal(R.playData(mia, fresh(kidGame)), null); assert.equal((await say(mia, { ctx: 'game', tok, text: HELLO, lang: 'en' })).json.code, 'off');
  q.run("UPDATE games SET hidden_reason='', status='draft' WHERE id=?", kidGame.id);
  assert.equal(R.playData(mia, fresh(kidGame)), null); assert.equal(R.playData(kid, fresh(kidGame)), null, 'not even for its maker');
  q.run("UPDATE games SET status='published' WHERE id=?", kidGame.id);
  // A maker who is banned: off.
  q.run('UPDATE users SET banned=1 WHERE id=?', kid.id);
  assert.equal(R.playData(mia, fresh(kidGame)), null);
  q.run('UPDATE users SET banned=0 WHERE id=?', kid.id);
  assert.ok(R.playData(mia, fresh(kidGame)).tok);
  // An official game is never a "Builder game": a listed one keeps its registered lines, an unlisted one gets nothing.
  assert.equal(R.builtGame(seedGame), false); assert.equal(BG.allowed(unlistedSeed), false); assert.equal(R.playData(mia, unlistedSeed), null);
  await refused(mia, seedGame, HELLO, 'an official game is matched against its registered lines, not its stored HTML');
});

test('the real scanner: a clean game passes and gets the voice; a game the scanner flags keeps the device voice', async () => {
  on(['en']);
  const mk = (slug, html) => {
    const g = games.createGame(kid.id, { title: slug, slug });
    const v = P.ensureScanned(games.addVersion(g.id, html, { createdBy: kid.id }));
    q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
    return { g: games.getGame(g.id), v };
  };
  const clean = mk('scan-clean', ECHO);
  assert.equal(clean.v.safety_status, 'pass'); assert.ok(R.playData(mia, clean.g).tok);
  // Something that looks like an email address in the game: the scanner flags it for a person, so no AI voice.
  const flagged = mk('scan-flagged', ECHO.replace("'Level 3 is next.'", "'Level 3 is next.', mail: 'write to sam@example.com'"));
  assert.equal(flagged.v.safety_status, 'flag'); assert.equal(R.playData(mia, flagged.g), null);
  // Not scanned yet (saved, never published through the scanner): nothing.
  const g = games.createGame(kid.id, { title: 'unscanned', slug: 'scan-none' });
  const v = games.addVersion(g.id, ECHO, { createdBy: kid.id });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  assert.equal(v.safety_status, 'unchecked'); assert.equal(R.playData(mia, games.getGame(g.id)), null);
});

test('the allowlist comes from the stored source: whole fixed strings, markup text, text attributes and their sentences; nothing with a slot', () => {
  const a = BG.fixedLines(ECHO);
  for (const s of [HELLO, 'Welcome to Animal Echo!', 'Type an animal, then press the button.', 'Well done!', 'Great job, explorer!', 'CAT', 'dog',
    'Level 3 is next.', 'What is your favourite animal?', 'Animal Echo', 'Type an animal', 'Read my answer', 'Read it', 'starter text']) assert.ok(a.has(BG.key(s)), s);
  // Strings the game puts a value into are left out whole: no pattern, no slot to fill.
  for (const s of ['You typed ${x}!', 'Hello ${x}, nice to meet you.', 'Your score is ${x} points.', 'You typed 5!', 'Hello cat, nice to meet you.', 'Your score is 0 points.']) assert.ok(!a.has(BG.key(s)), s);
  assert.ok(![...a].some(s => s.includes('${')), 'no entry carries a slot');
  // A comment is not a line; a string inside one is not either.
  assert.ok(!a.has(BG.key('what the player typed')) && !a.has(BG.key('typed text inside the game')));
  assert.deepEqual([...BG.fixedLines('<script>// "hidden in a comment"\n/* \'and here\' */ BRB.speak("Real line.")</script>')], ['real line.']);
});

test('typed text is never read: an input value the game tries to speak is refused and never reaches the provider', async () => {
  on(['en']);
  // What the SDK sends when the game calls BRB.speak(answer.value) and its sentences around the typed value.
  for (const typed of ['my dog Biscuit', 'elephant', 'I live at 12 Oak Street', 'Sam', 'purple', '7']) {
    await refused(mia, kidGame, typed, `typed: ${typed}`);
    await refused(mia, kidGame, `You typed ${typed}!`, 'typed text inside the game\'s own sentence');
    await refused(mia, kidGame, `Hello ${typed}, nice to meet you.`, 'typed text in a template string');
    await refused(mia, kidGame, `${HELLO} ${typed}`, 'typed text after a fixed line');
    await refused(mia, kidGame, `${typed} Well done!`, 'typed text before a fixed line');
  }
  assert.deepEqual(sent, [], 'nothing was sent to the voice provider');
  assert.equal(q.get('SELECT COUNT(*) n FROM tts_cache').n, 0, 'and nothing was generated');
  // The game's own fixed lines are read (so the refusals above are about the text, not the game).
  const r = await ask(mia, kidGame, HELLO);
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(sent, [HELLO]);
  // The input's starting value and placeholder are fixed in the source (the game's words, not the player's): allowed.
  assert.equal((await ask(mia, kidGame, 'starter text')).status, 200);
});

test('a string built at run time by joining pieces is refused, and so is a number or a name filled into a line', async () => {
  on(['en']);
  // ['Well', 'done', typed].join(' '), and joins of the game's own fixed pieces: each piece is a fixed string, the join is not.
  for (const s of ['Well done cat', 'Well done', 'Well done! Great job, explorer!', 'CAT dog', 'dog CAT dog', 'Animal Echo Read it',
    'Welcome to Animal Echo! Well done!', 'What is your favourite animal? CAT', 'Well done!!', 'Well done! 🎉', 'Well done explorer']) await refused(mia, kidGame, s, `joined: ${s}`);
  // Numbers are not interchangeable and no slot is filled: the score line is never read, a fixed line reads only its own number.
  for (const s of ['Your score is 3 points.', 'Your score is 0 points.', 'Level 4 is next.', 'Level 33 is next.', 'Level is next.']) await refused(mia, kidGame, s, `number: ${s}`);
  assert.deepEqual(sent, [], 'nothing was sent to the voice provider');
  assert.equal((await ask(mia, kidGame, 'Level 3 is next.')).status, 200);
  // A fixed line, a sentence of one, and upper or lower case of one (a word game reads 'CAT' as 'cat'): read.
  for (const s of ['Well done!', 'Type an animal, then press the button.', 'cat', '  Great job,   explorer!  ']) assert.equal((await ask(mia, kidGame, s)).status, 200, s);
  assert.deepEqual(sent, ['Level 3 is next.', 'Well done!', 'Type an animal, then press the button.', 'cat', 'Great job, explorer!']);
});

test('a line from a different game is refused; each game reads only its own stored version', async () => {
  on(['en']);
  await refused(mia, kidGame, 'Three, two, one, lift off!', 'another Builder game\'s line');
  await refused(mia, kidGame, 'The rocket is ready.');
  await refused(mia, otherGame, HELLO, 'and the other way round');
  // An official game's registered line is not a Builder game's line either.
  const hero = lines.gameLines('hero-of-sunvale', 'en')[0].text;
  await refused(mia, kidGame, hero, 'an official game\'s line');
  assert.deepEqual(sent, []);
  assert.equal((await ask(mia, otherGame, 'Three, two, one, lift off!')).status, 200);
  // A token is bound to its game and its player: mia's token for one game can't be used by leo, or forged for another.
  const tok = tokFor(mia, kidGame);
  assert.equal((await say(leo, { ctx: 'game', tok, text: HELLO, lang: 'en' })).status, 403);
  assert.equal((await say(null, { ctx: 'game', tok, text: HELLO, lang: 'en' })).status, 403);
  assert.deepEqual(sent, ['Three, two, one, lift off!']);
});

test('the allowlist follows the published version: a new version\'s lines at once, the old version\'s lines no more', async () => {
  on(['en']);
  const g = publish(kid, ECHO, { slug: 'echo-versions', title: 'Echo v' });
  assert.equal((await ask(mia, g, HELLO)).status, 200);
  const v2 = games.addVersion(g.id, OTHER, { createdBy: kid.id, safetyStatus: 'pass' });
  // Saved but not published (a draft the maker is working on): the published version's lines still.
  await refused(mia, g, 'The rocket is ready.', 'a draft\'s line');
  q.run('UPDATE games SET published_version_id=? WHERE id=?', v2.id, g.id);
  assert.equal((await ask(mia, g, 'The rocket is ready.')).status, 200);
  await refused(mia, g, 'Well done!', 'the old version\'s line');
  // A new version the scanner did not pass: the voice stops for the game.
  const v3 = games.addVersion(g.id, ECHO, { createdBy: kid.id, safetyStatus: 'flag' });
  q.run('UPDATE games SET published_version_id=? WHERE id=?', v3.id, g.id);
  assert.equal(R.playData(mia, games.getGame(g.id)), null);
  // A version id that belongs to another game is never used.
  q.run('UPDATE games SET published_version_id=? WHERE id=?', otherGame.published_version_id, g.id);
  assert.equal(BG.allowed(games.getGame(g.id)), false); assert.equal(BG.linesFor(games.getGame(g.id)), null);
});

test('one fixed friendly role whatever the page asks; the rate buckets as for every game; nothing is pinned (no warm-up)', async () => {
  on(['en']);
  const want = role => tts.urlOf(tts.plan({ text: 'Well done!', locale: 'en', role }).hash);
  for (const role of [undefined, 'grumpy', 'deep', 'narrator', 'nope']) {
    const r = await ask(mia, kidGame, 'Well done!', role ? { role } : {});
    assert.equal(r.status, 200); assert.equal(r.json.u, want('friendly'), `asked ${role}`);
  }
  assert.equal(BG.ROLE, 'friendly'); assert.ok(V.ROLES.includes(BG.ROLE));
  assert.deepEqual(sent, ['Well done!'], 'made once, then from the cache');
  const slow = await ask(mia, kidGame, 'Well done!', { rate: 0.8 });
  assert.equal(slow.json.u, tts.urlOf(tts.plan({ text: 'Well done!', locale: 'en', role: 'friendly', rate: 'slow' }).hash));
  assert.equal(q.get('SELECT COUNT(*) n FROM tts_cache WHERE pinned=1').n, 0, 'generated on first play, never pinned');
  assert.equal(lines.TTS_GAMES.has('animal-echo'), false, 'a Builder game is not in the warm-up list');
});

test('the backstops, the per-person daily quota and the TTS budget still apply to a Builder game\'s fixed lines', async () => {
  on(['en']);
  // A fixed line that carries the player's own name, an email address or a phone number: filtered at speaking time.
  const html = `<!doctype html><title>B</title><p>Hi</p><script>const L = ["Hello ${mia.display_name}, welcome back!", "Write to sam@example.com today.", "Call 555-867-5309 now.", "A perfectly fine line."];</script>`;
  const g = publish(kid, html, { slug: 'built-backstops', title: 'Backstops' });
  assert.ok(BG.fixedLines(html).has(BG.key('Write to sam@example.com today.')), 'in the source, so only the backstop stops it');
  await refused(mia, g, `Hello ${mia.display_name}, welcome back!`, 'the player\'s own name');
  await refused(mia, g, 'Write to sam@example.com today.', 'an email address');
  await refused(mia, g, 'Call 555-867-5309 now.', 'a phone number');
  assert.deepEqual(sent, []);
  assert.equal((await ask(mia, g, 'A perfectly fine line.')).status, 200);
  // Too long for one request.
  config.ttsMaxChars = 50;
  assert.deepEqual((await ask(mia, kidGame, HELLO)).json, { code: 'long' });
  config.ttsMaxChars = 600;
  // The per-person daily quota of new characters: the next new line is refused (the device's voice reads it).
  config.ttsUserDailyChars = 30;
  assert.equal((await ask(leo, kidGame, 'Well done!')).status, 200);
  assert.equal((await ask(leo, kidGame, 'Great job, explorer!')).status, 200);
  assert.deepEqual([(await ask(leo, kidGame, 'What is your favourite animal?')).status], [429]);
  config.ttsUserDailyChars = 5000;
  // New audio a minute per person.
  config.ttsPerMinute = 1; usage._resetQuota(); reset();
  assert.equal((await ask(leo, kidGame, 'Read it')).status, 200);
  assert.deepEqual((await ask(leo, kidGame, 'Read my answer')).json, { code: 'fast' });
  config.ttsPerMinute = 20;
  // The site's daily characters (the TTS budget): no new audio, cached lines still play.
  config.ttsDailyChars = 1000; q.run('INSERT INTO tts_usage(day, calls, chars) VALUES (?,1,1000) ON CONFLICT(day) DO UPDATE SET chars=1000', db.today());
  reset(); usage._resetQuota();
  assert.deepEqual((await ask(mia, kidGame, 'Type an animal')).json, { code: 'site' });
  assert.equal((await ask(mia, kidGame, 'Well done!')).status, 200, 'a line already made is served from the cache');
});

test('play page and frame: the Voices button, the token and INIT.tts for the published version; never in a preview or for a draft', async () => {
  on(['en', 'fr']);
  const page = await call('/play/animal-echo', { user: mia });
  assert.equal(page.status, 200);
  assert.match(page.text, /id="p-voices"/);
  const pd = JSON.parse(/<script type="application\/json" id="page-data">(.*?)<\/script>/s.exec(page.text)[1]);
  assert.deepEqual(pd.tts.langs, ['en', 'fr']); assert.ok(pd.tts.tok);
  const frame = await call(/data-src="(\/frame\/[^"]+)"/.exec(page.text)[1], { user: mia });
  assert.match(frame.text, /"tts":\{"langs":\["en","fr"\]\}/);
  // A preview frame (the Studio, the Builder, the admin's review: token p:1) never has INIT.tts, even of the published version.
  const v = games.getVersion(kidGame.published_version_id);
  const preview = await call(`/frame/${auth.signToken({ v: v.id, g: kidGame.id, u: kid.id, p: 1 }, 60)}`, { user: kid });
  assert.equal(preview.status, 200); assert.ok(!preview.text.includes('"tts":{'), 'no INIT.tts in a preview');
  // A frame showing a version that is not the published one (a draft saved after publishing): none.
  const draft = games.addVersion(kidGame.id, OTHER, { createdBy: kid.id, safetyStatus: 'pass' });
  assert.equal(R.frameData(kid, fresh(kidGame), draft.id), null);
  assert.deepEqual(R.frameData(kid, fresh(kidGame), v.id), { langs: ['en', 'fr'] });
  const draftFrame = await call(`/frame/${auth.signToken({ v: draft.id, g: kidGame.id, u: kid.id }, 60)}`, { user: kid });
  assert.equal(draftFrame.status, 200); assert.ok(!draftFrame.text.includes('"tts":{'), 'no INIT.tts for a version that is not published');
  // A private game: only its viewers (the maker) get a token, and nobody else's request is answered.
  const priv = publish(kid, ECHO, { slug: 'echo-private', title: 'Private', visibility: 'private' });
  assert.equal((await call('/play/echo-private', { user: mia })).status, 404);
  const forged = auth.signToken({ k: 'tts', g: priv.id, u: mia.id }, 60);
  assert.deepEqual((await say(mia, { ctx: 'game', tok: forged, text: HELLO, lang: 'en' })).json, { code: 'off' });
  assert.equal((await ask(kid, priv, HELLO)).status, 200);
});

test('a game the admin switched on keeps its wider rule; a teacher\'s game without the switch gets the strict default', async () => {
  on(['en']);
  const quiz = `<!doctype html><title>Q</title><p>Quiz</p><script>function s(n){ BRB.speak('You have ' + n + ' points!'); } BRB.speak("Welcome to the quiz!");</script>`;
  const g = publish(teacher, quiz, { slug: 'built-teacher-quiz', title: 'Teacher Quiz' });
  // By default: the exact fixed line only, in the friendly role.
  assert.equal((await ask(mia, g, 'Welcome to the quiz!')).status, 200);
  await refused(mia, g, 'You have 3 points!', 'a number filled in, without the admin\'s switch');
  // Switched on by the admin (services/tts-games.js, unchanged): numbers in the game's own patterns too.
  assert.equal(TG.set(boss, g, true).ok, true);
  assert.equal((await ask(mia, g, 'You have 3 points!')).status, 200);
  await refused(mia, g, 'You have Mia points!', 'never free text, switch or not');
  TG.set(boss, g, false);
  await refused(mia, g, 'You have 3 points!');
});
