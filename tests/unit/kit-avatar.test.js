// Oomba.avatar() (kit 1.1.0): the character the player designed on their Me page (BRB.user.character), with its Bold
// wear and eyes in a Bold game; the mascot for guests; the old account look when there is none. It is what hero: 'me'
// draws, in 2D and in 3D (B.rig(Oomba.avatar())).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeWin } from '../support/kit-fake.js';
import { createKit, VERSION } from '../../kit/src/index.js';
import { STYLE } from '../../kit/src/chars.js';
import * as bold from '../../kit/packs/style-bold.js';
import { cleanCharacter } from '../../server/services/character.js';

const SPEC = cleanCharacter({ species: 'kid', body: 'pear', skin: 5, hair: { style: 'braids', color: 'black' }, mood: 'wink', outfit: { top: 'hoodie', color: 'grape' }, colors: { base: 'mint', accent: 'coral' }, wear: ['glasses'], bold: { wear: ['visor', 'bomber'] } });
const kitFor = user => createKit(fakeWin({ search: '', brb: user ? { user } : null }));

test('the designed character is the avatar (and me()), exactly as designed', () => {
  STYLE.name = 'playful';
  const O = kitFor({ isGuest: false, displayName: 'Kid', avatar: '🦊', character: SPEC });
  const a = O.avatar();
  assert.equal(a.species, 'kid'); assert.equal(a.skin, 5); assert.equal(a.body, 'pear'); assert.equal(a.mood, 'wink');
  assert.deepEqual(a.hair, { style: 'braids', color: 'black' }); assert.deepEqual(a.outfit, { top: 'hoodie', color: 'grape' });
  assert.deepEqual([...a.wear], ['glasses'], 'no Bold wear in the playful style');
  assert.equal(a.colors.accent, 'coral');
  assert.deepEqual(O.me(), a);
  assert.equal(O.avatar().id, a.id, 'the same spec every call (one atlas entry)');
});

test('in the Bold style it adds the Bold wear and the Bold eyes (determined unless chosen)', () => {
  const O = kitFor({ isGuest: false, displayName: 'Kid', character: SPEC });
  O.__pk({ name: 'style-bold', version: VERSION }, bold.define);
  O.style('bold');
  try {
    const a = O.avatar();
    assert.deepEqual([...a.wear].sort(), ['bomber', 'glasses', 'visor']);
    assert.equal(a.mood, 'determined');
    const O2 = kitFor({ isGuest: false, character: { ...SPEC, bold: { wear: ['hood'], mood: 'happy' } } });
    assert.equal(O2.avatar().mood, 'happy');
  } finally { STYLE.name = 'playful'; }
});

test('guests get the mascot; an account with no character keeps its old look; a broken value never throws', () => {
  STYLE.name = 'playful';
  assert.equal(kitFor({ isGuest: true, character: SPEC }).avatar().species, 'oomba', 'a guest never has one');
  assert.equal(kitFor(null).avatar().species, 'oomba');
  const plain = kitFor({ isGuest: false, displayName: 'Kid', avatar: '🦊', character: null }).avatar();
  assert.equal(plain.species, 'kid');
  assert.equal(kitFor({ isGuest: false, displayName: 'Kid', avatar: '🦊' }).avatar().id, plain.id, 'the same look as before the editor');
  const odd = kitFor({ isGuest: false, character: { species: 'dragon', skin: 99, wear: 'crown' } }).avatar();
  assert.ok(odd.species && odd.skin <= 7, 'the kit snaps anything odd');
});
