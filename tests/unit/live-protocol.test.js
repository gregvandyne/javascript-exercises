// The Oomba Live wire protocol (services/classlive-protocol.js): every message type, its ranges and sizes, who may
// send it, the shape of game event data (no prose can travel between players), and the token buckets.
import './_setup.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const P = await import('../../server/services/classlive-protocol.js');
const j = o => JSON.stringify(o);

test('valid messages pass, cleaned to their fields', () => {
  assert.deepEqual(P.parse(j({ t: 'hello', v: 1, tok: 'abc' })), { t: 'hello', v: 1, tok: 'abc' });
  assert.deepEqual(P.parse(j({ t: 'rdy' })), { t: 'rdy', view: '3d' });
  assert.deepEqual(P.parse(j({ t: 'rdy', view: 'watch', extra: 1 })), { t: 'rdy', view: 'watch' });
  assert.deepEqual(P.parse(j({ t: 'mv', p: [1, -2, 3, 255, 7] })), { t: 'mv', p: [1, -2, 3, 255, 7] });
  assert.deepEqual(P.parse(j({ t: 'ev', k: 'hit', d: { who: 3, ok: true, tag: 'red-gem', list: [1, 2, null] }, to: 'host' })), { t: 'ev', k: 'hit', d: { who: 3, ok: true, tag: 'red-gem', list: [1, 2, null] }, to: 'host' });
  assert.deepEqual(P.parse(j({ t: 'sc', n: 12.7 })), { t: 'sc', n: 12 });
  assert.deepEqual(P.parse(j({ t: 'it', i: 3, ok: false })), { t: 'it', i: 3, ok: false });
  assert.deepEqual(P.parse(j({ t: 'an', i: 0, c: 3, e: 1500 })), { t: 'an', i: 0, c: 3, e: 1500 });
  assert.deepEqual(P.parse(j({ t: 'em', e: 5 })), { t: 'em', e: 5 });
  assert.deepEqual(P.parse(j({ t: 'pi', c: 99 })), { t: 'pi', c: 99 });
  assert.deepEqual(P.parse(j({ t: 'fr', f: 'lobby' })), { t: 'fr', f: 'lobby' });
  assert.deepEqual(P.parse(j({ t: 'h', a: 'next', at: 4 }), 'host'), { t: 'h', a: 'next', at: 4 });
  assert.deepEqual(P.parse(j({ t: 'h', a: 'kick', n: 2 }), 'host'), { t: 'h', a: 'kick', n: 2 });
  assert.deepEqual(P.parse(j({ t: 'st', d: { round: 2, name: 'Team A' } }), 'host'), { t: 'st', d: { round: 2, name: 'Team A' } });
  assert.deepEqual(P.parse(j({ t: 'rdy', cfg: { presence: { bounds: 40, maxSpeed: 9 }, lobby: true } }), 'host'), { t: 'rdy', view: '3d', cfg: { presence: { bounds: 40, maxSpeed: 9 }, lobby: true } });
  assert.deepEqual(P.parse(j({ t: 'ev', k: 'go', d: 1, to: 4 }), 'host'), { t: 'ev', k: 'go', d: 1, to: 4 });
});

test('every bad case is refused', () => {
  const bad = [
    'not json', j([1]), j({}), j({ t: 'nope' }), j({ t: 'hello', v: 0, tok: 'x' }), j({ t: 'rdy', view: '4d' }),
    j({ t: 'mv', p: [1, 2, 3, 4] }), j({ t: 'mv', p: [1.5, 2, 3, 4, 0] }), j({ t: 'mv', p: [1, 2, 3, 256, 0] }), j({ t: 'mv', p: [1, 2, 3, 4, 8] }), j({ t: 'mv', p: [1e7, 2, 3, 4, 0] }),
    j({ t: 'ev', k: 'Bad Kind', d: 1 }), j({ t: 'ev', k: 'x', d: 'two words' }), j({ t: 'ev', k: 'x', d: 'Capital' }), j({ t: 'ev', k: 'x', d: { a: { b: { c: 1 } } } }),
    j({ t: 'ev', k: 'x', d: { 'bad key': 1 } }), j({ t: 'ev', k: 'x', d: Array(65).fill(1) }), j({ t: 'ev', k: 'x', d: Array(60).fill(123456789) }), j({ t: 'ev', k: 'x', d: 1, to: 3 }),
    j({ t: 'sc', n: -1 }), j({ t: 'sc', n: 2e6 }), j({ t: 'it', i: 200, ok: true }), j({ t: 'it', i: 1, ok: 1 }),
    j({ t: 'an', i: 0, c: 4, e: 0 }), j({ t: 'an', i: 0, c: 0, e: -1 }), j({ t: 'em', e: 6 }), j({ t: 'fr', f: 'other' }),
    j({ t: 'h', a: 'start' }), j({ t: 'st', d: { a: 1 } }), // host-only types from a player
    'x'.repeat(2049),
  ];
  for (const b of bad) assert.equal(P.parse(b), null, b.slice(0, 80));
  const hostBad = [j({ t: 'h', a: 'next' }), j({ t: 'h', a: 'kick' }), j({ t: 'h', a: 'dance' }), j({ t: 'st', d: [1] }), j({ t: 'st', d: { __proto__: 1, x: 1 } }).replace('"x"', '"__proto__"'),
    j({ t: 'mv', p: [1, 2, 3, 4, 0] }), j({ t: 'an', i: 0, c: 0, e: 0 }), j({ t: 'rdy', cfg: { presence: { bounds: 0 } } }), j({ t: 'ev', k: 'x', d: 1, to: 'host' })];
  for (const b of hostBad) assert.equal(P.parse(b, 'host'), null, b);
});

test('event data: numbers, booleans, null and identifier tokens only, depth at most 2, 512 bytes at most', () => {
  assert.equal(P.evDataOk({ a: [1, 'ok_go', true] }), true);
  assert.equal(P.evDataOk({ a: { b: 1 } }), true);
  assert.equal(P.evDataOk({ a: { b: { c: 1 } } }), false);
  assert.equal(P.evDataOk('hi there'), false);
  assert.equal(P.evDataOk('hi'), true);
  assert.equal(P.evDataOk('x'.repeat(25)), false);
  assert.equal(P.evDataOk(NaN), false);
  assert.equal(P.parse(j({ t: 'ev', k: 'big', d: Array(40).fill('abcdefghijkl') })), null, 'over 512 bytes');
});

test('token buckets: the rate, then dropped; a fake clock refills them', () => {
  let t = 0; const b = P.buckets(() => t);
  let n = 0; for (let i = 0; i < 10; i++) if (b.take('an')) n++;
  assert.equal(n, 4, 'a burst of twice the rate');
  t = 500; assert.equal(b.take('an'), true); assert.equal(b.take('an'), false);
  let mv = 0; for (let i = 0; i < 100; i++) if (b.take('mv')) mv++;
  assert.equal(mv, 24);
});

test('part 3: team, settings and teacher-tool messages at and past every range; host types refused from players', () => {
  const ok = (m, role = 'host') => P.parse(j(m), role);
  assert.deepEqual(ok({ t: 'hello', v: 1, tok: 'x', view: 'dash' }), { t: 'hello', v: 1, tok: 'x', view: 'dash' });
  assert.equal(ok({ t: 'hello', v: 1, tok: 'x', view: 'tv' }), null);
  assert.deepEqual(ok({ t: 'tm', a: 'on', n: 6 }), { t: 'tm', a: 'on', n: 6 });
  assert.deepEqual(ok({ t: 'tm', a: 'on' }), { t: 'tm', a: 'on' });
  assert.equal(ok({ t: 'tm', a: 'on', n: 7 }), null); assert.equal(ok({ t: 'tm', a: 'count', n: 1 }), null);
  assert.deepEqual(ok({ t: 'tm', a: 'preset', k: 6, p: 7 }), { t: 'tm', a: 'preset', k: 6, p: 7 });
  assert.equal(ok({ t: 'tm', a: 'preset', k: 7, p: 0 }), null); assert.equal(ok({ t: 'tm', a: 'preset', k: 1, p: 8 }), null);
  assert.deepEqual(ok({ t: 'tm', a: 'move', s: 1000, k: 0 }), { t: 'tm', a: 'move', s: 1000, k: 0 });
  assert.equal(ok({ t: 'tm', a: 'move', s: 1001, k: 1 }), null);
  assert.deepEqual(ok({ t: 'tm', a: 'scoring', v: 'sum' }), { t: 'tm', a: 'scoring', v: 'sum' });
  assert.equal(ok({ t: 'tm', a: 'scoring', v: 'max' }), null); assert.equal(ok({ t: 'tm', a: 'choose', v: 'yes' }), null);
  assert.equal(ok({ t: 'tm', a: 'rename', k: 1 }), null, 'no team names, ever');
  assert.deepEqual(ok({ t: 'pt', k: 6 }, 'player'), { t: 'pt', k: 6 });
  assert.equal(ok({ t: 'pt', k: 0 }, 'player'), null); assert.equal(ok({ t: 'pt', k: 7 }, 'player'), null);
  assert.equal(ok({ t: 'pt', k: 'Blue Whales' }, 'player'), null);
  assert.deepEqual(ok({ t: 'cf', d: { board: 'off', secs: 20, sound: false } }), { t: 'cf', d: { board: 'off', secs: 20, sound: false } });
  for (const d of [{}, [], { board: 'Off now' }, { a: { b: 1 } }, { secs: 2000 }, Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`k${String.fromCharCode(97 + i)}`, 1]))]) assert.equal(ok({ t: 'cf', d }), null, j(d));
  assert.deepEqual(ok({ t: 'h', a: 'eyes', on: true }), { t: 'h', a: 'eyes', on: true });
  assert.equal(ok({ t: 'h', a: 'eyes' }), null);
  assert.deepEqual(ok({ t: 'h', a: 'say', m: 9 }), { t: 'h', a: 'say', m: 9 });
  assert.equal(ok({ t: 'h', a: 'say', m: 10 }), null); assert.equal(ok({ t: 'h', a: 'say', m: 'Two minutes left' }), null);
  assert.deepEqual(ok({ t: 'h', a: 'time', s: 30 }), { t: 'h', a: 'time', s: 30 });
  assert.equal(ok({ t: 'h', a: 'time', s: 15 }), null);
  assert.deepEqual(ok({ t: 'h', a: 'bonus', n: 3, r: 4 }), { t: 'h', a: 'bonus', n: 3, r: 4 });
  assert.deepEqual(ok({ t: 'h', a: 'bonus', k: 6, r: 0 }), { t: 'h', a: 'bonus', k: 6, r: 0 });
  assert.equal(ok({ t: 'h', a: 'bonus', n: 3, k: 1, r: 0 }), null, 'a seat or a team, not both');
  assert.equal(ok({ t: 'h', a: 'bonus', n: 3, r: 5 }), null); assert.equal(ok({ t: 'h', a: 'bonus', r: 0 }), null);
  assert.deepEqual(ok({ t: 'h', a: 'rename', n: 2 }), { t: 'h', a: 'rename', n: 2 });
  assert.deepEqual(ok({ t: 'h', a: 'acc', n: 2, x: 200, ra: 1, sv: 0, save: 1 }), { t: 'h', a: 'acc', n: 2, x: 200, ra: 1, sv: 0, save: 1 });
  assert.deepEqual(ok({ t: 'h', a: 'acc', n: 2, x: 100, ra: 0, sv: 0 }), { t: 'h', a: 'acc', n: 2, x: 100, ra: 0, sv: 0 });
  assert.equal(ok({ t: 'h', a: 'acc', n: 2, x: 300, ra: 0, sv: 0 }), null); assert.equal(ok({ t: 'h', a: 'acc', n: 2, x: 150, ra: true, sv: 0 }), null);
  // Events: a player to its own team; the host to one team.
  assert.deepEqual(ok({ t: 'ev', k: 'go', d: 1, to: 'team' }, 'player'), { t: 'ev', k: 'go', d: 1, to: 'team' });
  assert.deepEqual(ok({ t: 'ev', k: 'go', d: 1, tm: 3 }), { t: 'ev', k: 'go', d: 1, tm: 3 });
  assert.equal(ok({ t: 'ev', k: 'go', d: 1, tm: 3 }, 'player'), null);
  assert.equal(ok({ t: 'ev', k: 'go', d: 1, tm: 7 }), null);
  assert.equal(ok({ t: 'ev', k: 'go', d: 1, tm: 1, to: 2 }), null);
  assert.equal(ok({ t: 'ev', k: 'go', d: 1, to: 'team' }), null, 'the host sends to a team with tm');
  // Host types from a player: refused.
  for (const m of [{ t: 'tm', a: 'shuffle' }, { t: 'cf', d: { board: 'off' } }, { t: 'h', a: 'eyes', on: true }]) assert.equal(ok(m, 'player'), null, m.t);
  assert.equal(P.RATES.tm, 10); assert.equal(P.RATES.cf, 5); assert.equal(P.RATES.pt, 1);
  assert.equal(P.SAY.length, 10); assert.equal(P.BONUS_REASONS.length, 5);
});
