// Oomba Live nicknames and avatars (services/classlive-names.js): 144 whole phrases in every language, all different,
// none rude; picks unique in a session; rerolls limited; random avatars are valid shared-avatar specs.
process.env.BRB_ALL_LOCALES = '1';
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const N = await import('../../server/services/classlive-names.js');
const { CODES, lookup } = await import('../../server/i18n/index.js');
const { hasProfanity } = await import('../../server/services/textfilter.js');
const { cleanCharacter } = await import('../../server/services/character.js');
const RL = await import('../../server/services/ratelimit.js');

test('144 phrases in every language: all there (English fallback only in en-GB), all different, none rude', () => {
  assert.equal(N.NICK_COUNT, 144);
  for (const code of CODES) {
    const list = N.nicksFor(code);
    assert.equal(list.length, 144, code);
    assert.equal(new Set(list).size, 144, `${code}: all different`);
    for (const p of list) { assert.ok(p && p.length <= 26, `${code}: ${p}`); assert.equal(hasProfanity(p), false, `${code}: ${p}`); }
    if (code !== 'en-GB') for (let i = 0; i < 144; i++) assert.ok(lookup(code, N.nickKey(i)) !== undefined, `${code} live.nick.${i}`);
  }
  assert.equal(N.nicksFor('en')[0], 'Brave Otter'); assert.equal(N.nicksFor('en')[143], 'Starry Hedgehog');
});

test('picks are unique in a session until every phrase is taken; rerolls: 10 a minute', () => {
  const used = new Set();
  for (let i = 0; i < 144; i++) { const n = N.pickNick(used); assert.ok(!used.has(n)); used.add(n); }
  assert.ok(Number.isInteger(N.pickNick(used)), 'any when all are taken');
  RL._reset();
  for (let i = 0; i < 10; i++) assert.equal(N.mayReroll('nonce1'), true);
  assert.equal(N.mayReroll('nonce1'), false);
});

test('random avatars are valid character specs', () => {
  for (let i = 0; i < 200; i++) { const a = N.randomAvatar(); assert.deepEqual(cleanCharacter(a), a); }
});
