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
  assert.equal(lines.readGame('word-hunt'), null, 'only listed games');
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
