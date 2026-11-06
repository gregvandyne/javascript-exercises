// How many players each live game is made for (classlive-access.js CAPACITY, docs/live-capacity.md): every room is
// capped at its game's number (and LIVE_MAX_PLAYERS above that), a Builder game may say its own with
// Oomba.live.ready({ maxPlayers }), a full room says how many it holds, and the host's landing and the teachers' page
// show each game's number.
import { reset, call, open, teacher, mum, official, publish, liveHtml, config, LS, C } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const A = await import('../../server/services/classlive-access.js');
const lint = await import('../../server/services/classlive-lint.js');

publish(official, liveHtml("live.on('question', () => {});", { quiz: true }), { source: 'seed', slug: 'brain-board', title: 'Brain Board' });
test.beforeEach(() => reset());

test('each built-in game has its number; LIVE_MAX_PLAYERS stays the ceiling', () => {
  assert.equal(A.capacityFor({ mode: 'quest-race' }).max, Math.min(40, config.liveMaxPlayers));
  assert.equal(A.capacityFor({ mode: 'battle' }).max, Math.min(60, config.liveMaxPlayers));
  assert.equal(A.capacityFor({ mode: 'board' }).max, Math.min(40, config.liveMaxPlayers));
  assert.equal(A.capacityFor({ mode: 'board' }).teamsAbove, 16);
  assert.equal(A.capacityFor({ slug: 'hero-of-sunvale' }).max, 30);
  // Every mode holds a full class, except the ones played in turns (A.TURN_MODES: Doodle Hoot Live, one drawer at a
  // time, holds 16: 30 turns of 80 s would be 40 minutes a round; docs/decisions.md "Doodle Hoot", docs/live-capacity.md)
  for (const k of Object.keys(A.MODES)) if (!A.TURN_MODES.has(k)) assert.ok(A.capacityFor({ mode: k }).max >= 30, `${k} holds a full class`);
  assert.deepEqual([...A.TURN_MODES], ['doodle'], 'the only exception, written down');
  assert.equal(A.capacityFor({ mode: 'doodle' }).max, Math.min(16, config.liveMaxPlayers));
  const was = config.liveMaxPlayers; config.liveMaxPlayers = 25;
  try { assert.equal(A.capacityFor({ mode: 'battle' }).max, 25); assert.deepEqual(A.capacityFor({ mode: 'battle' }).best, [2, 25]); } finally { config.liveMaxPlayers = was; }
});

test('a Builder game: 30 unless it says otherwise in ready({ maxPlayers }), never above 60', () => {
  assert.equal(lint.declaredMax("Oomba.live.ready({ lobby: true, maxPlayers: 8 })"), 8);
  assert.equal(lint.declaredMax("Oomba.live.ready({ lobby: true })"), null);
  assert.equal(lint.declaredMax("live.ready({ maxPlayers: 1 })"), null, 'at least 2');
  assert.equal(A.capacityFor({ declared: null }).max, Math.min(30, config.liveMaxPlayers));
  assert.equal(A.capacityFor({ declared: 8 }).max, 8);
  assert.equal(A.capacityFor({ declared: 90 }).max, Math.min(60, config.liveMaxPlayers));
  assert.equal(C.checkHtml(liveHtml('', { lobby: true }).replace('live.ready({', 'live.ready({ maxPlayers: 12,')).maxPlayers, 12);
});

test('rooms are capped at their game; the host may ask for fewer, never more', () => {
  assert.equal(open(teacher, { mode: 'quest-race', starter: 'math-8', audience: 'open', maxPlayers: 100 }).settings.maxPlayers, Math.min(40, config.liveMaxPlayers));
  assert.equal(open(teacher, { mode: 'board', starter: 'math-8', audience: 'open', maxPlayers: 100, replace: true }).settings.maxPlayers, Math.min(40, config.liveMaxPlayers));
  assert.equal(open(teacher, { mode: 'battle', starter: 'math-8', audience: 'open', replace: true }).settings.maxPlayers, Math.min(60, config.liveMaxPlayers));
  assert.equal(open(teacher, { mode: 'battle', starter: 'math-8', audience: 'open', maxPlayers: 12, replace: true }).settings.maxPlayers, 12);
  assert.equal(open(mum, { mode: 'battle', starter: 'math-8', audience: 'open', maxPlayers: 60 }).settings.maxPlayers, 30, 'a grown-up\'s open room: 30');
  const small = publish(teacher, liveHtml('').replace('live.ready({', 'live.ready({ maxPlayers: 6,'), { title: 'Tiny arena' });
  assert.equal(open(teacher, { mode: 'game', gameId: small.id, audience: 'open', maxPlayers: 30, replace: true }).settings.maxPlayers, 6);
  const plain = publish(teacher, liveHtml(''), { title: 'Plain' });
  assert.equal(open(teacher, { mode: 'game', gameId: plain.id, audience: 'open', replace: true }).settings.maxPlayers, Math.min(30, config.liveMaxPlayers));
});

test('a full room says how many it holds', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'math-8', audience: 'open', maxPlayers: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code }, headers: { 'x-forwarded-for': `10.4.4.${i + 1}` } })).status, 200);
  const full = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal(full.status, 409); assert.equal(full.json.code, 'full'); assert.equal(full.json.max, 2);
  assert.match(full.json.error, /full \(2 players\)/);
  LS.endSession(s.id);
});

test('the host\'s landing shows each game\'s number and clamps "Most players"; so does the teachers\' page', async () => {
  const r = await call('/live', { user: teacher });
  assert.equal(r.status, 200);
  assert.match(r.text, /data-max="40"[^>]*>[\s\S]{0,400}Best for 2–40 players/);
  assert.match(r.text, /Best for 2–60 players/);
  assert.match(r.text, /id="lv-max-hint"/);
  const tp = await call('/teachers/live');
  assert.equal(tp.status, 200); assert.match(tp.text, /Best for 2–40 players/);
});
