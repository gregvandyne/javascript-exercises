// AI voices for a game the admin switched on (server/services/tts-games.js, routes/tts.js): the switch (admin only,
// audited, refused for a student's game), the play page's token, and the text rule: only the game's own words from its
// published version (numbers may differ, a line joined from a few of its strings), never anything else.
import { reset, call, config, q, auth, games, publish, official, teacher, mia, kid, boss } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const { TTS_ALL_LOCALES } = await import('../../server/config.js');
const tts = await import('../../server/services/tts.js');
const V = await import('../../server/services/tts-voices.js');
const TG = await import('../../server/services/tts-games.js');
const R = await import('../../server/routes/tts.js');
const usage = await import('../../server/services/tts-usage.js');
tts.hooks.log = () => {};

const HTML = `<!doctype html><title>Haberle Quiz</title>
<h1>Planet Quiz</h1><p>Which planet is the biggest?</p><button aria-label="Start the quiz">Go</button>
<script>
// a comment with 'not a line' in it
const LINES = { hello: "Welcome to the planet quiz!", right: 'Well done! That is right.', wrong: \`Not quite. Try again.\` };
const re = /it's/g;
function score(n) { BRB.speak('You have ' + n + ' points!'); BRB.speak(\`Level \${n} done.\`); }
BRB.speak("Question 3 of 10: Which planet has rings?");
BRB.speak(LINES.hello + " " + "Let's start.");
</script>`;
const teacherGame = publish(teacher, HTML, { slug: 'haberle-quiz', title: 'Planet Quiz' });
const kidGame = publish(kid, HTML, { slug: 'kid-quiz', title: 'Kid Quiz' });
const pupilGame = publish(mia, HTML, { slug: 'pupil-quiz', title: 'Pupil Quiz' });

// TTS_BUILT_GAMES=0 in this file: it is about the admin's own switch (and what a game has without it once the Builder
// default is off). The default for Builder games (the owner's decision of 2026-11-13: exact fixed lines of a published,
// scanner-passed version) has its own tests in tts-built.test.js.
function on(locales = ['en']) {
  config.ttsBuiltGames = false;
  config.ttsEnabled = true; config.ttsProvider = 'mock'; config.ttsApiKey = ''; config.ttsLocales = [...TTS_ALL_LOCALES];
  config.ttsPerMinute = 20; config.ttsDailyChars = 300000; config.ttsMaxChars = 600;
  V.save(null, { locales: Object.fromEntries(TTS_ALL_LOCALES.map(l => [l, { on: locales.includes(l) }])) });
}
const off = () => { config.ttsEnabled = false; config.ttsProvider = 'openai'; config.ttsBuiltGames = true; };
test.beforeEach(() => { reset(); usage._resetQuota(); q.run('DELETE FROM tts_cache'); q.run("DELETE FROM settings WHERE key='tts.games'"); TG._clear(); });
test.afterEach(() => off());
const sw = (user, game, onOff) => call('/api/admin/tts/games', { method: 'POST', user, body: { game, on: onOff } });
const say = (user, body) => call('/api/tts', { method: 'POST', body, user });

test('the switch: admin only (404 for anyone else), audited, by slug, id or link; a student\'s game is pinned to its version', async () => {
  for (const u of [teacher, mia, kid, null]) {
    const r = await sw(u, 'haberle-quiz', true);
    assert.equal(r.status, 404, `not for ${u ? u.username : 'guests'}`);
  }
  assert.equal((await call('/admin/voices', { user: teacher })).status, 404);
  assert.equal(TG.isOn(teacherGame.id), false);
  // Official games: never through this switch (they are all registered for AI voices in tts-lines already).
  const off1 = await sw(boss, 'quest-race', true);
  assert.equal(off1.status, 400); assert.match(off1.json.error, /already has AI voices/);
  const r = await sw(boss, 'https://oomba.ai/es/g/haberle-quiz?x=1', true);
  assert.equal(r.status, 200, r.text); assert.equal(r.json.game.id, teacherGame.id); assert.equal(r.json.game.on, true);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.tts.game.on' AND target=? AND actor_id=?", teacherGame.id, boss.id));
  assert.equal(TG.findGame('/play/haberle-quiz').id, teacherGame.id);
  assert.equal(TG.findGame(teacherGame.id).id, teacherGame.id);
  assert.equal((await sw(boss, 'no-such-game', true)).status, 404);
  // A student's game (a kid's own account, a school pupil): the admin may switch it on; the switch pins the published
  // version, audited as a student's game.
  for (const g of [kidGame, pupilGame]) {
    const x = await sw(boss, g.slug, true);
    assert.equal(x.status, 200, x.text); assert.equal(x.json.game.student, true); assert.equal(x.json.game.stale, false);
    assert.equal(TG.switched()[g.id].version, games.getGame(g.id).published_version_id);
    assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.tts.game.on' AND target=? AND details LIKE '%student%'", g.id));
    assert.equal((await sw(boss, g.slug, false)).status, 200);
  }
  // A student's game that was never published can't be switched on: there is no version to pin.
  const pv = kidGame.published_version_id;
  q.run('UPDATE games SET published_version_id=NULL WHERE id=?', kidGame.id);
  const np = await sw(boss, kidGame.slug, true);
  assert.equal(np.status, 400); assert.match(np.json.error, /publish it first/);
  q.run('UPDATE games SET published_version_id=? WHERE id=?', pv, kidGame.id);
  // The list and switching off.
  assert.deepEqual((await call('/api/admin/tts/games', { user: boss })).json.games.map(x => x.slug), ['haberle-quiz']);
  const page = await call('/admin/voices', { user: boss });
  assert.match(page.text, /id="tv-games-list"/); assert.match(page.text, /data-tg-off="/);
  assert.equal((await sw(boss, teacherGame.id, false)).status, 200);
  assert.equal(TG.isOn(teacherGame.id), false);
  assert.ok(q.get("SELECT 1 FROM audit_log WHERE action='admin.tts.game.off' AND target=?", teacherGame.id));
  assert.equal((await call('/api/admin/tts/games', { user: boss })).json.games.length, 0);
  assert.equal((await call('/api/admin/tts/games', { method: 'POST', user: boss, body: { game: 'haberle-quiz' } })).status, 400);
});

test('the game page: the switch shows for the admin only, with the reason for a student\'s game', async () => {
  const a = await call('/g/haberle-quiz', { user: boss });
  assert.match(a.text, /id="admin-voices"/); assert.match(a.text, /id="admin-voices-on"/); assert.match(a.text, /admin-game-voices\.js/);
  const t = await call('/g/haberle-quiz', { user: teacher });
  assert.ok(!t.text.includes('admin-voices'), 'never for the maker or anyone else');
  // Switched on while AI voices are off for the site, or no language is on: the admin is told nothing plays yet.
  TG.set(boss, teacherGame, true);
  assert.match((await call('/g/haberle-quiz', { user: boss })).text, /id="admin-voices-note"[^]*off for the whole site/);
  on([]);
  assert.match((await call('/g/haberle-quiz', { user: boss })).text, /No language is switched on/);
  assert.match((await call('/admin/voices', { user: boss })).text, /On, but nothing plays yet: No language is switched on/);
  on(['en']);
  assert.ok(!(await call('/g/haberle-quiz', { user: boss })).text.includes('admin-voices-note'));
  const k = await call('/g/kid-quiz', { user: boss });
  assert.match(k.text, /id="admin-voices-student"/); assert.match(k.text, /id="admin-voices-on"/); assert.ok(!k.text.includes('admin-voices-why'));
});

test('play data: only once switched on, published and not hidden; never for a student\'s game or a preview', async () => {
  on(['en']);
  assert.equal(R.playData(mia, teacherGame), null, 'off until the admin switches it on');
  TG.set(boss, teacherGame, true);
  assert.ok(R.playData(mia, games.getGame(teacherGame.id)).tok);
  const page = await call('/play/haberle-quiz', { user: mia });
  assert.match(page.text, /id="p-voices"/);
  // Hidden or unpublished since: off.
  q.run("UPDATE games SET hidden_reason='test' WHERE id=?", teacherGame.id);
  assert.equal(R.playData(mia, games.getGame(teacherGame.id)), null);
  q.run("UPDATE games SET hidden_reason='', status='draft' WHERE id=?", teacherGame.id);
  assert.equal(R.playData(mia, games.getGame(teacherGame.id)), null);
  q.run("UPDATE games SET status='published' WHERE id=?", teacherGame.id);
  // A student's game in the setting without a pinned version (or forced in by hand): off.
  q.run('UPDATE settings SET value=? WHERE key=?', JSON.stringify({ [teacherGame.id]: { by: boss.id, at: 1 }, [kidGame.id]: { by: boss.id, at: 1 } }), 'tts.games');
  assert.equal(R.playData(mia, kidGame), null);
  assert.equal(TG.allowed(kidGame), false);
  // Switched on by the admin: on for that published version only.
  TG.set(boss, kidGame, false); TG.set(boss, kidGame, true);
  assert.equal(TG.allowed(games.getGame(kidGame.id)), true);
  assert.ok(R.playData(mia, games.getGame(kidGame.id)).tok);
  // The student publishes a new version: paused (stale) until the admin switches it on again.
  const was = games.getGame(kidGame.id).published_version_id;
  q.run('UPDATE games SET published_version_id=? WHERE id=?', was + '-new', kidGame.id);
  assert.equal(TG.stale(games.getGame(kidGame.id)), true);
  assert.equal(TG.allowed(games.getGame(kidGame.id)), false);
  assert.equal(R.playData(mia, games.getGame(kidGame.id)), null);
  assert.match((await call('/g/kid-quiz', { user: boss })).text, /id="admin-voices-stale"/);
  q.run('UPDATE games SET published_version_id=? WHERE id=?', was, kidGame.id);
  TG.set(boss, kidGame, false);
});

test('text: the game\'s own words (numbers may differ, joined strings), anything else 422 filtered; the backstops still run', async () => {
  on(['en']);
  TG.set(boss, teacherGame, true);
  const tok = R.playData(mia, games.getGame(teacherGame.id)).tok;
  const ok = async (text, role) => { const r = await say(mia, { ctx: 'game', tok, text, lang: 'en', ...(role ? { role } : {}) }); assert.equal(r.status, 200, `${text}: ${r.text}`); return r.json.u; };
  const no = async (text, code = 'filtered') => { const r = await say(mia, { ctx: 'game', tok, text, lang: 'en' }); assert.equal(r.status, 422, text); assert.equal(r.json.code, code, text); };
  await ok('Welcome to the planet quiz!');
  await ok('Which planet is the biggest?');
  await ok('Start the quiz');
  await ok('Well done!');                                         // a sentence of a longer string
  await ok('Not quite.  Try   again.');
  await ok('Question 7 of 12: Which planet has rings?');          // other numbers
  await ok('You have 25 points!');                                // 'You have ' + n + ' points!'
  await ok('Level 4 done.');                                      // a template literal
  await ok("Welcome to the planet quiz! Let's start.");           // two strings joined
  // The role: a known one as asked, else the narrator.
  assert.equal(await ok('Well done!', 'grumpy'), tts.urlOf(tts.plan({ text: 'Well done!', locale: 'en', role: 'grumpy' }).hash));
  assert.equal(await ok('Well done!', 'pirate'), tts.urlOf(tts.plan({ text: 'Well done!', locale: 'en', role: 'narrator' }).hash));
  // Made-up lines, a player's words, a name, letters where a number goes, the comment's words.
  await no('Find the hidden word!');
  await no('You have lots of points!');
  await no('Well done Mia!');
  await no('not a line');
  await no(`Well done! ${mia.display_name}`);
  await no('Level 4 done. Level 4 done. Level 4 done. Level 4 done. Well done!');   // more than MAX_JOIN strings
  await no('you shit');
  // A new published version: its own words at once, and the old ones are gone.
  const v = games.addVersion(teacherGame.id, '<p>Brand new words here.</p>', { createdBy: teacher.id, safetyStatus: 'pass' });
  q.run('UPDATE games SET published_version_id=? WHERE id=?', v.id, teacherGame.id);
  await ok('Brand new words here.');
  await no('Welcome to the planet quiz!');
  // A draft (current, not published) is never the source.
  const d = games.addVersion(teacherGame.id, '<p>Draft only words.</p>', { createdBy: teacher.id });
  q.run('UPDATE games SET current_version_id=? WHERE id=?', d.id, teacherGame.id);
  await no('Draft only words.');
  // Switched off: the token stops working.
  TG.set(boss, games.getGame(teacherGame.id), false);
  assert.equal((await say(mia, { ctx: 'game', tok, text: 'Brand new words here.', lang: 'en' })).json.code, 'off');
});

test('source parsing: strings, templates, markup and attributes; comments and regexes are not read as strings', () => {
  const f = TG.sourceFragments(HTML).map(s => s.trim()).filter(Boolean);
  assert.ok(f.includes('Welcome to the planet quiz!'));
  assert.ok(f.includes('Level ${x} done.'));
  assert.ok(f.includes('Start the quiz'));
  assert.ok(!f.some(s => s.includes('not a line')));
  const a = TG.buildAllowlist('<script>const t = "Hi {name}, round {n}!"; const n = 3;</script>');
  assert.ok(TG.matches(a, TG.canon('Hi 2, round 3!')));
  assert.ok(!TG.matches(a, TG.canon('Hi Bob, round 3!')));
  // Single letters can't spell a word: each joined piece is a whole string of the game's, at most MAX_JOIN of them.
  const letters = TG.buildAllowlist(`<script>const ABC = ${JSON.stringify('abcdefghijklmnopqrstuvwxyz'.split(''))};</script>`);
  assert.ok(TG.matches(letters, TG.canon('a')));
  assert.ok(!TG.matches(letters, TG.canon('hello')));
});

test('safety: no sentences built from word lists, letters, emoji or free numbers; names only in a placeholder', () => {
  const a = TG.buildAllowlist(`<script>
    const WORDS = ['come', 'to', 'my', 'house', 'meet', 'me', 'after', 'school', 'dont', 'tell', 'mom', 'sam', 'dad'];
    const CHOICES = ['A', 'B', 'C', 'D']; const AZ = 'abcdefghijklmnopqrstuvwxyz'.split('');
    const CONFIG = { p1: { name: 'Fox' }, css: 'fade-in', w: '12px' };
    const I18N = { en: { wins: '{name} wins!', lose: 'Stars found: {got}/{total}. Can you find them all next time?', score: 'Score: {score} · Best: {best}', how1: 'Wait for GO', how2: 'Tap your side first (or press A / L)' },
      fr: { wins: '{name} gagne !', lose: 'Étoiles trouvées : {got}/{total}. Tu les trouveras toutes la prochaine fois ?', score: 'Score : {score} · Record : {best}' },
      es: { wins: '¡Gana {name}!' } };
    function cheer(n) { say('Great job, ' + n + '!'); say('cat'); say('dog'); say('Find the word!'); }
  </script>`);
  const yes = s => assert.ok(TG.matches(a, TG.canon(s)), `should play: ${s}`);
  const no = s => assert.ok(!TG.matches(a, TG.canon(s)), `should be refused: ${s}`);
  // The game's i18n lines with their placeholders filled: numbers, French spacing, and the game's own names.
  yes('Stars found: 3/10. Can you find them all next time?');
  yes('Étoiles trouvées : 3/10. Tu les trouveras toutes la prochaine fois ?');
  yes('Score: 1,234 · Best: 2,000');
  yes('Score\u202f: 1\u202f234 · Record\u202f: 2\u202f000');
  yes('Fox wins!'); yes('¡Gana Fox!'); yes('Fox gagne !');
  yes('Great job, 5!');
  yes('Wait for GO Tap your side first (or press A / L)');            // a kit "how to play" read as one
  yes('Find the word! Great job, 3!');
  // A word list, answer letters or an alphabet are never building blocks, and never fill a name.
  for (const s of ['come to my house', 'meet me after school', 'dont tell mom', 'Great job, Dad!', 'Great job, Sam!', 'Great job, Mia!', 'Mia wins!', 'sam wins!'])
    no(s);
  // Emoji or symbols added, numbers where the game has none, a long number in a number's place, glued words.
  for (const s of ['Great job, 🖕🖕🖕 !', 'Great job, ☠☠☠☠ !', 'Fox wins! 💩', 'cat 5551234 dog', 'Find the word! 555', 'Great job, 5551234567!', 'Fox fade-in', 'catdog', 'cat dog'])
    no(s);
});
