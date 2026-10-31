// The player's own Oomba character (the shared avatar, docs/kit.md §6.4): a parts spec from the kit's lists, saved on
// the Me page, never a picture or free text; guests cannot save one; games get it as BRB.user.character; it goes with
// the account. The Studio's theme chips are here too (they are the other half of foundation step 3's UI).
import './_setup.js';
import fs from 'node:fs';
import os from 'node:os';
process.env.BRB_DATA_DIR = fs.mkdtempSync(os.tmpdir() + '/brb-character-');
import test from 'node:test';
import assert from 'node:assert/strict';
const { config } = await import('../../server/config.js');
config.anthropicKey = '';
const { q } = await import('../../server/db.js');
const { createUser, createGuest, startSession, getUser } = await import('../../server/auth.js');
const C = await import('../../server/services/character.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');
const { themeOf } = await import('../../server/routes/studio.js');
const { deleteAccount } = await import('../../server/services/account-delete.js');
const { SPECIES, WEAR, MOODS } = await import('../../kit/src/validate.js');

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const post = (u, body, method = 'POST') => fetch(base + '/api/me/character', { method, headers: { cookie: cookieFor(u.id), 'content-type': 'application/json', origin: base }, body: body === undefined ? undefined : JSON.stringify(body) });
const SPEC = { species: 'kid', body: 'pear', skin: 5, hair: { style: 'braids', color: 'black' }, mood: 'wink', outfit: { top: 'hoodie', color: 'grape' }, colors: { base: 'mint', accent: 'coral' }, wear: ['glasses'], bold: { wear: ['visor', 'bomber'], mood: 'determined' } };

test('the editor only offers the kit\'s own names, and a clean spec keeps exactly the kit\'s fields', () => {
  for (const s of C.CHARACTER.species) assert.ok(SPECIES.includes(s), s);
  for (const w of C.CHARACTER.accessory) assert.ok(WEAR.includes(w), w);
  for (const m of C.CHARACTER.eyes) assert.ok(MOODS.includes(m), m);
  assert.ok(!C.CHARACTER.color.includes('spark'), 'spark yellow is for rewards only');
  const s = C.cleanCharacter({ ...SPEC, name: 'Sam Smith', photo: 'data:image/png;base64,AAAA', extra: 'x' });
  assert.deepEqual(Object.keys(s).sort(), ['body', 'bold', 'colors', 'hair', 'mood', 'outfit', 'skin', 'species', 'wear']);
  assert.ok(!JSON.stringify(s).includes('Sam'), 'never a name'); assert.ok(!JSON.stringify(s).includes('data:'), 'never a picture');
  assert.ok(JSON.stringify(s).length <= C.MAX_JSON);
  // an animal keeps no kid fields
  assert.deepEqual(Object.keys(C.cleanCharacter({ species: 'fox', skin: 3, hair: { style: 'bob' } })).sort(), ['body', 'bold', 'colors', 'mood', 'species', 'wear']);
  // anything outside the lists is refused, naming the field
  for (const [bad, field] of [[{ species: 'dragon' }, 'species'], [{ ...SPEC, skin: 9 }, 'skin'], [{ ...SPEC, skin: '3' }, 'skin'], [{ ...SPEC, hair: { style: '<b>' } }, 'hair.style'],
    [{ ...SPEC, colors: { base: '#ff0000' } }, 'colors.base'], [{ ...SPEC, wear: ['crown', 'scarf'] }, 'wear'], [{ ...SPEC, bold: { wear: ['visor', 'helmet'] } }, 'bold.wear'],
    [{ ...SPEC, bold: { wear: ['crown'] } }, 'bold.wear'], [null, 'spec'], [[1], 'spec'], ['kid', 'spec']]) {
    assert.throws(() => C.cleanCharacter(bad), e => e instanceof C.CharacterError && e.field === field, JSON.stringify(bad));
  }
});

test('saving: accounts save it (and can clear it), guests cannot, bad specs are refused', async () => {
  const kid = createUser({ username: 'CharKid', password: 'secret123' });
  let r = await post(kid, { character: SPEC });
  assert.equal(r.status, 200); const j = await r.json(); assert.equal(j.character.hair.style, 'braids'); assert.ok(j.toast);
  assert.deepEqual(C.characterOf(getUser(kid.id)), C.cleanCharacter(SPEC));
  r = await post(kid, { character: { ...SPEC, species: 'unicorn' } });
  assert.equal(r.status, 400); assert.equal((await r.json()).field, 'species');
  assert.deepEqual(C.characterOf(getUser(kid.id)), C.cleanCharacter(SPEC), 'a refused save changes nothing');
  const guest = createGuest();
  r = await post(guest, { character: SPEC }); assert.equal(r.status, 403);
  assert.equal(getUser(guest.id).character_spec, null);
  assert.equal(C.characterOf({ ...getUser(guest.id), character_spec: JSON.stringify(SPEC) }), null, 'a guest row never has one');
  // a damaged row reads as none
  assert.equal(C.characterOf({ character_spec: '{nope' }), null);
  r = await post(kid, undefined, 'DELETE'); assert.equal(r.status, 200);
  assert.equal(getUser(kid.id).character_spec, null);
  // the Me page has the editor (real radio buttons) for accounts, and a sign-up link for guests
  const me = await (await fetch(base + '/me', { headers: { cookie: cookieFor(kid.id) } })).text();
  assert.match(me, /id="charform"/); assert.match(me, /type="radio" name="skin"/); assert.match(me, /<legend>/); assert.match(me, /\/js\/character\.js/);
  assert.match(me, /oomba-kit\/1\.1\.0\/oomba-kit\.js/, 'the preview draws with kit 1.1.0');
  const gme = await (await fetch(base + '/me', { headers: { cookie: cookieFor(guest.id) } })).text();
  assert.match(gme, /id="charform"/); assert.doesNotMatch(gme, /name="skin"/); assert.match(gme, /signup\?next=/);
});

test('games get the character as BRB.user.character (null for guests); deleting the account clears it', async () => {
  const kid = createUser({ username: 'CharPlayer', password: 'secret123' });
  await post(kid, { character: SPEC });
  const owner = createUser({ username: 'CharMaker', password: 'secret123' });
  const g = games.createGame(owner.id, { title: 'Char Game' });
  const v = games.addVersion(g.id, '<title>x</title><p>hi</p>', { notes: 'v', createdBy: owner.id, safetyStatus: 'pass', safetyReport: { status: 'pass', issues: [] } });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=?, current_version_id=? WHERE id=?", v.id, v.id, g.id);
  const frameInit = async u => {
    const play = await (await fetch(`${base}/play/${g.slug}`, { headers: u ? { cookie: cookieFor(u.id) } : {} })).text();
    const tok = (play.match(/\/frame\/([A-Za-z0-9_.-]+)/) || [])[1]; assert.ok(tok, 'a frame link');
    const doc = await (await fetch(`${base}/frame/${tok}`, { headers: u ? { cookie: cookieFor(u.id) } : {} })).text();
    return JSON.parse(doc.match(/window\.__BRB_INIT__=(\{.*?\});<\/script>/)[1]);
  };
  const init = await frameInit(kid);
  assert.deepEqual(init.user.character, C.cleanCharacter(SPEC));
  const gi = await frameInit(createGuest());
  assert.ok(!gi.user.character, 'guests get the default (the kit draws the mascot)');
  assert.ok(getUser(kid.id).character_spec);
  await deleteAccount(kid.id, null, { by: 'admin', parentMade: false });
  assert.equal(q.get('SELECT character_spec FROM users WHERE id=?', kid.id).character_spec, null, 'the tombstone clears the character');
});

test('the SDK hands games a frozen copy, and the Studio\'s theme chips know the game\'s theme', () => {
  const sdk = fs.readFileSync(new URL('../../public/sdk/brb-sdk.js', import.meta.url), 'utf8');
  assert.match(sdk, /character: deepFreeze\(/);
  assert.equal(themeOf("Oomba.game({ theme: 'snow' })"), 'snow');
  assert.equal(themeOf("const CONFIG = {\n  theme: { name: 'Ocean Reef', accent: 'grape' },\n}"), 'reef');
  assert.equal(themeOf("theme: 'halloween'"), 'haunted');
  assert.equal(themeOf("theme: 'dark'"), '');
  assert.equal(themeOf("theme: 'jelly volcano'"), '');
  assert.equal(themeOf(''), '');
});
