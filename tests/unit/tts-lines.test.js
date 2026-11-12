// AI voices warm-up lines (server/services/tts-lines.js): Hero of Sunvale's spoken lines are read from the repository
// file's I18N block for all 13 locales, never with {placeholders}, each with a valid role; the optional VOICES block
// sets the roles; the I18N block runs in an empty sandbox with a time limit.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { TTS_ALL_LOCALES } = await import('../../server/config.js');
const lines = await import('../../server/services/tts-lines.js');
const V = await import('../../server/services/tts-voices.js');

test('Hero of Sunvale: spoken lines in every locale, no placeholders, valid roles, own words per locale', () => {
  const game = lines.readGame('hero-of-sunvale');
  assert.ok(game && game.strings.en);
  const en = lines.gameLines('hero-of-sunvale', 'en', game);
  assert.ok(en.length > 80, `en lines: ${en.length}`);
  const keys = new Set(en.map(x => x.key));
  for (const k of ['intro.1', 'd.granny.1', 'hint.m1', 'mg.cheer', 'end.1']) assert.ok(keys.has(k), k);
  for (const k of ['end.time', 'end.h', 'title', 'npc.granny', 'btn.attack']) assert.ok(!keys.has(k), `${k} is not spoken`);
  for (const l of TTS_ALL_LOCALES) {
    const ls = lines.gameLines('hero-of-sunvale', l, game);
    assert.equal(ls.length, en.length, l);
    for (const x of ls) {
      assert.ok(!/\{\w+\}/.test(x.text), `${l} ${x.key}`);
      assert.ok(V.ROLES.includes(x.role), `${l} ${x.key} ${x.role}`);
      assert.equal(x.locale, l);
    }
    if (l !== 'en' && l !== 'en-GB') assert.notEqual(ls.find(x => x.key === 'intro.1').text, en.find(x => x.key === 'intro.1').text, `${l} has its own words`);
  }
  const role = k => en.find(x => x.key === k).role;
  assert.equal(role('d.granny.1'), 'wise'); assert.equal(role('d.tilly.1'), 'friendly'); assert.equal(role('intro.1'), 'narrator');
  assert.equal(role('d.shop.1'), 'wise', "Granny's shop line"); assert.equal(role('d.gate.locked'), 'narrator');
  // Every character with lines has a role (objects such as gates and crystals are read by the narrator).
  const npcs = new Set([...keys].map(k => /^d\.([a-z]+)\./.exec(k)?.[1]).filter(Boolean));
  for (const n of npcs) if (!['gate', 'crystal', 'door', 'shop'].includes(n)) assert.ok(lines.DEFAULT_VOICE_ROLES[n], `role for ${n}`);
  assert.equal(lines.readGame('no-such-game'), null, 'only listed games');
});

test('a VOICES block sets roles; the I18N block runs sandboxed with a time limit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brb-tts-lines-'));
  try {
    const page = (i18n, voices = '') => `<script>
// ==== I18N START ====
${i18n}
// ==== I18N END ====
${voices}
</script>`;
    fs.writeFileSync(path.join(dir, 'hero-of-sunvale.html'), page(`const I18N = { en: { 'd.granny.1': 'Hello, dear!', 'intro.1': 'Once upon a time.', 'end.time': 'Time: {time}', 'd.bo.1': { one: 'x', other: 'y' } } };`,
      `// ==== VOICES START ====\nconst VOICE_ROLES = { story: 'bright', granny: 'grumpy' };\nconst VOICE_KEY_ROLES = { 'intro.': 'deep' };\n// ==== VOICES END ====`));
    const g = lines.readGame('hero-of-sunvale', dir);
    assert.deepEqual(lines.gameLines('hero-of-sunvale', 'fr', g).map(x => [x.key, x.role, x.text]), [['d.granny.1', 'grumpy', 'Hello, dear!'], ['intro.1', 'deep', 'Once upon a time.']]);
    fs.writeFileSync(path.join(dir, 'hero-of-sunvale.html'), page("const I18N = (typeof process === 'undefined' && typeof require === 'undefined') ? { en: { 'intro.1': 'safe' } } : null;"));
    assert.equal(lines.gameLines('hero-of-sunvale', 'en', lines.readGame('hero-of-sunvale', dir))[0].text, 'safe', 'no Node globals inside');
    fs.writeFileSync(path.join(dir, 'hero-of-sunvale.html'), page('for (;;) {} const I18N = {};'));
    assert.throws(() => lines.readGame('hero-of-sunvale', dir), /timed out/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('Hero of Sunvale speaks every line with the role the warm-up and the server use; every line it speaks is allowed', async () => {
  const vm = await import('node:vm');
  const src = fs.readFileSync(path.join(lines.SEED_DIR, 'hero-of-sunvale.html'), 'utf8');
  const block = src.slice(src.indexOf('// ==== VOICES START ===='), src.indexOf('// ==== VOICES END ===='));
  const voiceRole = vm.runInNewContext(`${block}\n;voiceRole`, Object.create(null));
  const game = lines.readGame('hero-of-sunvale');
  // The same rule on both sides, for every spoken key (templates too).
  for (const x of lines.gameLines('hero-of-sunvale', 'en', game, { templates: true })) assert.equal(voiceRole(x.key), x.role, x.key);
  const role = k => lines.roleOf(k, game.roles, game.keyRoles);
  assert.equal(role('mg.cheer'), 'bright'); assert.equal(role('d.gate.open'), 'bright'); assert.equal(role('d.gate.locked'), 'narrator');
  assert.equal(role('say.guard1'), 'deep'); assert.equal(role('say.tip1'), 'friendly'); assert.equal(role('hint.m1'), 'narrator');
  assert.equal(role('sw.intro'), 'grumpy'); assert.equal(role('cinder.purr'), 'deep'); assert.equal(role('d.shop.1'), 'wise');
  // Every key the game speaks (cutscene lines, conversation cards) is one of its spoken lines.
  const spoken = new Set(lines.gameLines('hero-of-sunvale', 'en', game, { templates: true }).map(x => x.key));
  const used = new Set([...src.matchAll(/who: '[a-z]+', key: '([a-zA-Z0-9.]+)'/g)].map(m => m[1]));
  for (const m of src.matchAll(/npcSay\('[a-z]+', \[([^\]]*)\]/g)) for (const k of m[1].matchAll(/'([a-z]+\.[a-zA-Z0-9.]+)'/g)) used.add(k[1]);
  assert.ok(used.size > 20, `keys found: ${used.size}`);
  for (const k of used) assert.ok(spoken.has(k), `${k} is spoken but not allowed`);
  // The allowlist: exact lines and numbers-only templates, per locale.
  for (const l of TTS_ALL_LOCALES) {
    const a = lines.allowlist('hero-of-sunvale', l);
    assert.ok(a.exact.size > 80, l);
    const cheer = lines.gameLines('hero-of-sunvale', l, game).find(x => x.key === 'mg.cheer');
    assert.deepEqual(lines.allowedLine('hero-of-sunvale', l, `  ${cheer.text} `), { text: cheer.text, role: 'bright' });
  }
  assert.equal(lines.allowedLine('hero-of-sunvale', 'en', 'Find {n} more Sun Gems and I can make it!'), null, 'never the raw template');
  assert.deepEqual(lines.allowedLine('hero-of-sunvale', 'en', 'Find 12 more Sun Gems and I can make it!'), { text: 'Find 12 more Sun Gems and I can make it!', role: 'deep' });
  assert.equal(lines.allowedLine('hero-of-sunvale', 'en', 'Find Mia more Sun Gems and I can make it!'), null);
  assert.equal(lines.allowedLine('hero-of-sunvale', 'en', 'Hello, I am a kid typing'), null);
  assert.equal(lines.allowedLine('no-such-game', 'en', 'Find the word!'), null, 'only listed games');
  // Fraction Factory (Number Quest's game) is registered too, between footy-tycoon and gulp-city as in GAMES; Tug of
  // Math after Trick Inbox; Remi's Quiet Meadow after Question Battle; Garden Count (Number Quest Launchpad) after
  // Fraction Factory, and Lily Hop (Launchpad Unit 2) after Happy Putt.
  assert.deepEqual([...lines.TTS_GAMES], ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine', 'hero-of-sunvale',
    'atlas-quest', 'atlas-quest-live', 'beat-lanes', 'brain-board', 'brick-drop', 'castle-clash', 'code-isle',
    'connect-four', 'escape-the-post-office', 'footy-tycoon', 'fraction-factory', 'garden-count', 'gulp-city', 'happy-putt', 'lily-hop', 'loop-lab', 'munch-maze',
    'quest-race', 'question-battle', 'remis-quiet-meadow', 'quiet-bounce', 'popcorn-hush', 'ring-rumble', 'shark-plank', 'sum-racer', 'swish-flick', 'trick-inbox', 'tug-of-math',
    'word-hunt', 'word-peek', 'would-you-rather', 'would-you-rather-live', 'doodle-hoot', 'word-trail', 'jungle-cup']);
});

test('the CS Quest games use AI voices for their own language-pack lines only', () => {
  for (const slug of ['robo-route', 'data-detective', 'packet-post', 'inside-the-machine']) {
    assert.ok(lines.TTS_GAMES.has(slug), `${slug} may use AI voices`);
    const g = lines.readGame(slug);
    const en = lines.gameLines(slug, 'en', g), es = lines.gameLines(slug, 'es', g), ar = lines.gameLines(slug, 'ar', g);
    assert.ok(en.length > 300 && es.length === en.length && ar.length === en.length, `${slug}: every line in every pack`);
    assert.ok(lines.allowedLine(slug, 'en', en[10].text) && lines.allowedLine(slug, 'es', es[10].text));
    assert.equal(lines.allowedLine(slug, 'en', 'Tell me your secret password now'), null);
    assert.equal(lines.allowedLine(slug, 'en', `${en[10].text}. Anything else at all`), null, 'a join needs every part to be the game\'s own');
  }
  const rr = lines.gameLines('robo-route', 'en').map(x => x.text);
  const title = rr.find(x => x.startsWith('An algorithm')), body = rr.find(x => x.startsWith('Bolt does exactly'));
  assert.ok(lines.allowedLine('robo-route', 'en', `${title}. ${body}`), 'a learn card read as one line');
});
