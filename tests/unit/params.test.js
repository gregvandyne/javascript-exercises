// Lesson parameters for games (CS Quest P1, docs/sdk.md "Lesson parameters"): the grammar (services/play-params.js), the
// play page signing them into the frame token (o), /frame copying them into __BRB_INIT__.params, and the SDK's frozen
// BRB.params ({} when absent; level and lock as numbers; nothing else gets through).
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const PP = await import('../../server/services/play-params.js');
const { q } = await import('../../server/db.js');
const { createUser, startSession, readToken } = await import('../../server/auth.js');
const games = await import('../../server/services/games.js');
const { createApp } = await import('../../server/app.js');

// The SDK's cleanParams, run outside a browser (the same trick as sdk-protocol.test.js for play.js).
const sdk = fs.readFileSync('public/sdk/brb-sdk.js', 'utf8');
const start = sdk.indexOf('function cleanParams('), end = sdk.indexOf('/* end cleanParams */');
assert.ok(start > 0 && end > start, 'the SDK has cleanParams between its markers');
const cleanParams = new Function(sdk.slice(start, end) + '\nreturn cleanParams;')();

let server, base;
test.before(async () => { server = createApp().listen(0); await new Promise(r => server.once('listening', r)); base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());
const cookieFor = id => { let c = ''; startSession({ append: (k, v) => { c = v.split(';')[0]; } }, id); return c; };
const owner = createUser({ username: 'ParamsOwner', password: 'secret123' });
function liveGame(title = 'Robo Route test') {
  const g = games.createGame(owner.id, { title });
  const v = games.addVersion(g.id, '<title>x</title><p>x</p><script>1</script>', { createdBy: owner.id, safetyStatus: 'pass' });
  q.run("UPDATE games SET status='published', visibility='public', published_version_id=? WHERE id=?", v.id, g.id);
  return games.getGame(g.id);
}

test('grammar: five keys, [a-z0-9-]{1,16}, band 1b|2, level 1-30, lock 0|1; unknown keys and bad values dropped', () => {
  assert.deepEqual(PP.parseParams({ chapter: 'loops', band: '1b', mode: 'play', level: '3', lock: '1' }), { chapter: 'loops', band: '1b', mode: 'play', level: 3, lock: 1 });
  assert.deepEqual(PP.parseParams('chapter=Loops&band=2&lock=0&evil=1&lesson=abc'), { chapter: 'loops', band: '2', lock: 0 }, 'lower-cased; unknown keys dropped');
  assert.deepEqual(PP.parseParams({ band: '3', level: '0', lock: '2', chapter: 'has space', mode: 'x'.repeat(17) }), {}, 'bad values dropped one by one');
  assert.deepEqual(PP.parseParams({ level: '30' }), { level: 30 }); assert.deepEqual(PP.parseParams({ level: '31' }), {});
  assert.deepEqual(PP.parseParams({ chapter: ['a', 'b'] }), { chapter: 'a' }, 'a repeated key takes the first value');
  assert.deepEqual(PP.parseParams({ chapter: 'über' }), {}, 'ASCII only');
  assert.deepEqual(PP.parseParams(undefined), {}); assert.deepEqual(PP.parseParams(''), {});
});

test('packing: o = chapter.band.mode.level.lock with empty parts, at most 40 characters, round-trips', () => {
  assert.equal(PP.packParams({ chapter: 'loops', band: '1b', lock: 1 }), 'loops.1b...1');
  assert.equal(PP.packParams({ level: 7 }), '...7.');
  assert.equal(PP.packParams({}), ''); assert.equal(PP.packParams({ evil: 'x' }), '');
  assert.deepEqual(PP.unpackParams('loops.1b...1'), { chapter: 'loops', band: '1b', lock: 1 });
  assert.deepEqual(PP.unpackParams('...7.'), { level: 7 });
  assert.deepEqual(PP.unpackParams(''), {}); assert.deepEqual(PP.unpackParams(null), {}); assert.deepEqual(PP.unpackParams('a.b'), {}, 'wrong part count');
  assert.deepEqual(PP.unpackParams('x.3.y.99.5'), { chapter: 'x', mode: 'y' }, 'bad parts dropped on the way out too');
  const full = { chapter: 'a'.repeat(15), band: '1b', mode: 'b'.repeat(16), level: 30, lock: 1 };
  assert.equal(PP.packParams(full).length, 40, 'the longest form that fits');
  assert.deepEqual(PP.unpackParams(PP.packParams(full)), full);
  const over = { ...full, chapter: 'a'.repeat(16) };
  assert.deepEqual(PP.unpackParams(PP.packParams(over)), { chapter: 'a'.repeat(16), band: '1b', level: 30, lock: 1 }, 'one over: mode is left out, the rest arrives');
  assert.deepEqual(PP.unpackParams('x'.repeat(41)), {});
  // the canonical query string for lesson_steps.options
  assert.equal(PP.toQuery({ lock: '1', chapter: 'loops', band: '1b' }), 'chapter=loops&band=1b&lock=1', 'fixed key order');
  assert.equal(PP.cleanOptions('?band=2&chapter=routes&level=5&lock=1'), 'chapter=routes&band=2&level=5&lock=1');
  assert.equal(PP.cleanOptions(''), ''); assert.equal(PP.cleanOptions(null), '');
  assert.equal(PP.cleanOptions('chapter=loops&evil=1'), null, 'a step refuses unknown keys');
  assert.equal(PP.cleanOptions('band=3'), null, 'and bad values');
  assert.equal(PP.cleanOptions(`chapter=${'a'.repeat(17)}`), null);
});

test('SDK: BRB.params is built from init.params alone, keys allow-listed, level and lock numbers, {} when absent', () => {
  assert.deepEqual(cleanParams(undefined), {}); assert.deepEqual(cleanParams(null), {}); assert.deepEqual(cleanParams('loops'), {});
  assert.deepEqual(cleanParams({ chapter: 'loops', band: '1b', mode: 'play', level: 3, lock: 1 }), { chapter: 'loops', band: '1b', mode: 'play', level: 3, lock: 1 });
  assert.deepEqual(cleanParams({ chapter: 'loops', level: '12', lock: '0', extra: 'no', __proto__: { x: 1 } }), { chapter: 'loops', level: 12, lock: 0 });
  assert.deepEqual(cleanParams({ band: '3', level: 31, lock: 2, chapter: 'Loops', mode: '' }), {}, 'bad values dropped');
  assert.deepEqual(cleanParams({ level: 0 }), {}); assert.deepEqual(cleanParams({ level: 1.5 }), {});
  // the object the SDK hands out is frozen (the same call site as the SDK's)
  const p = Object.freeze(cleanParams({ chapter: 'loops' }));
  assert.throws(() => { 'use strict'; p.chapter = 'x'; });
  assert.match(sdk, /params: Object\.freeze\(cleanParams\(INIT\.params\)\)/, 'BRB.params is the frozen clean object');
});

test('/play signs the allow-listed params into the token; /frame copies them into init.params; nothing when absent', async () => {
  const g = liveGame();
  const cookie = cookieFor(owner.id);
  const tokenOf = async qs => {
    const page = await (await fetch(`${base}/play/${g.slug}${qs}`, { headers: { cookie } })).text();
    const m = page.match(/\/frame\/([A-Za-z0-9_.\-]+)/); assert.ok(m, 'a frame token'); return m[1];
  };
  const tok = await tokenOf('?chapter=loops&band=1b&level=3&lock=1&mode=play&evil=1&lesson=x');
  assert.equal(readToken(tok).o, 'loops.1b.play.3.1', 'only the five keys, packed');
  let frame = await (await fetch(`${base}/frame/${tok}`, { headers: { cookie } })).text();
  const init = JSON.parse(frame.match(/window\.__BRB_INIT__=(\{.*?\});<\/script>/)[1]);
  assert.deepEqual(init.params, { chapter: 'loops', band: '1b', mode: 'play', level: 3, lock: 1 });
  assert.equal(frame.includes('"evil"'), false);
  // without params: no o in the token and no params in init (today's frame, byte for byte in that field)
  const plain = await tokenOf('');
  assert.equal(readToken(plain).o, undefined);
  frame = await (await fetch(`${base}/frame/${plain}`, { headers: { cookie } })).text();
  assert.equal('params' in JSON.parse(frame.match(/window\.__BRB_INIT__=(\{.*?\});<\/script>/)[1]), false);
  // all-bad params are the same as none
  const bad = await tokenOf('?band=9&level=99&lock=7&chapter=has%20space');
  assert.equal(readToken(bad).o, undefined);
});
