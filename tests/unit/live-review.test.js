// Oomba Live review fixes (regression tests): a removed account can't come back as a guest; players' game events carry
// only the game's own words and the host's strings pass the text filter; IPv6 prefixes can't spread code guesses; codes
// never outlive 3 hours; codes and frame tokens stay out of the request log and a frame token is no seat credential;
// game scores bank no lobby time; one seat per account (results and the gradebook keep the best); unsolicited pongs
// don't change the answer timing; removing the last player who hadn't answered reveals at once; snapshot rows carry
// their age.
import { reset, call, socket, open, hostSocket, player, sleep, cookieFor, LS, q, config, teacher, cls, mia, kid, battle, publish, liveHtml } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
test.beforeEach(() => reset());

test('a removed signed-in player cannot come back as a guest (or as themselves) in an open room', async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Open room' }).id, audience: 'open' });
  const first = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: kid });
  assert.equal(first.status, 200, first.text);
  assert.ok(LS.kick(s, first.json.seat));
  const asGuest = await call('/api/live/join', { method: 'POST', body: { code: s.code, asGuest: true }, user: kid });
  assert.equal(asGuest.status, 403); assert.equal(asGuest.json.code, 'removed');
  const again = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: kid });
  assert.equal(again.json.code, 'removed');
  assert.equal(s.seats.size, 0, 'no new seat was handed out');
});

test("players' events carry only the game's own words; the host's state and events pass the text filter", async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Words' }).id, audience: 'open' });
  assert.ok(s.words.has('pick') && s.words.has('red-gem'));
  assert.ok(!s.words.has('add_me_on_snap'), 'a declared word that fails the text filter is dropped');
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  for (const [k, d] of [['pick', { item: 'kidname2014' }], ['pick', ['what_school_u_go']], ['shout', 1], ['add_me_on_snap', null], ['pick', { whatever: 1 }]]) a.send({ t: 'ev', k, d });
  a.send({ t: 'ev', k: 'pick', d: { item: 'red-gem', n: 3, ok: true } });
  const ev = await b.next('ev');
  assert.deepEqual(ev.d, { item: 'red-gem', n: 3, ok: true }, 'only the event made of game words arrives');
  await sleep(80);
  assert.equal(b.msgs.filter(m => m.t === 'ev').length, 1, 'made-up words never travel');
  assert.equal(h.msgs.filter(m => m.t === 'ev').length, 1);
  // The host: contact details, handles and rude words never reach a player.
  h.send({ t: 'st', d: { msg: 'message me on discord: xyz#1234' } });
  h.send({ t: 'st', d: { note: 'find me @kidfinder99' } });
  h.send({ t: 'ev', k: 'tip', d: 'add_me_on_snap' });
  h.send({ t: 'st', d: { msg: 'Round two!' } });
  const st = await a.next('st');
  assert.deepEqual(st.d, { msg: 'Round two!' });
  await sleep(80);
  assert.equal(a.msgs.filter(m => m.t === 'st').length, 1); assert.ok(!a.msgs.some(m => m.t === 'ev' && m.k === 'tip'));
  assert.deepEqual(s.state, { msg: 'Round two!' });
  for (const c of [h, a, b]) c.ws.close();
});

test('IPv6: guesses spread over many /64s inside one /48 are still limited', () => {
  assert.deepEqual(LS.joinKeys({ ip: '2001:db8:1:200::1' }), ['2001:db8:1:200::/64', '2001:db8:1::/48', '2001:db8::/32']);
  assert.deepEqual(LS.joinKeys({ ip: '10.1.2.3' }), ['10.1.2.3']);
  let allowed = 0;
  for (let i = 0; i < 256; i++) {
    const keys = LS.joinKeys({ ip: `2001:db8:1:${i.toString(16)}::1` });
    for (let j = 0; j < 8; j++) { if (LS.joinTry(keys)) break; allowed++; LS.joinMiss(keys); }
  }
  assert.ok(allowed <= 200, `a /48 gets at most 200 misses per 10 minutes (${allowed})`);
  // Another site's /48 under a different /32 is untouched.
  assert.equal(LS.joinTry(LS.joinKeys({ ip: '2001:db9:5:1::1' })), null);
});

test('LIVE_HOURS can never make a code live longer than 3 hours', () => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', "const { config } = await import('./server/config.js'); console.log(config.liveHours);"], { cwd: ROOT, env: { ...process.env, LIVE_HOURS: '12' }, encoding: 'utf8' });
  assert.equal(r.stdout.trim().split('\n').at(-1), '3', r.stderr);
});

test('codes and frame tokens stay out of the request log; a frame token is not a seat credential', async () => {
  const { logPath } = await import('../../server/app.js');
  assert.equal(logPath('/join/1234567'), '/join/:code');
  assert.equal(logPath('/live/frame/abc.def'), '/live/frame/:token');
  assert.equal(logPath('/live/play/xyz'), '/live/play/xyz');
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Frames' }).id, audience: 'open' });
  const a = await player(s);
  const thief = socket();
  await thief.opened; thief.send({ t: 'hello', v: 1, tok: a.wel.frame });
  assert.equal(await thief.closed, 4401, 'a frame token from a log opens no seat');
  assert.ok(s.seats.get(a.join.seat).conn, 'the real device keeps its seat');
  a.ws.close();
});

test('game scores: lobby, loading and countdown time banks nothing, and the cap is maxScorePerSec per second of play', async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Scores' }).id, audience: 'open' });
  let clock = Date.now(); const was = LS.hooks.now; LS.hooks.now = () => clock;
  try {
    const seat = LS.join(s, null).seat;
    clock += 5 * 60e3;   // five minutes in the lobby
    LS.hostAction(s, 'start');
    for (let i = 0; i < 50 && s.phase !== 'playing'; i++) await sleep(20);
    assert.equal(s.phase, 'playing');
    LS.score(s, seat, 1000000);
    assert.equal(seat.score, 0, 'no allowance from the lobby');
    for (let i = 1; i <= 20; i++) { clock += 500; LS.score(s, seat, 1000000); }
    assert.equal(seat.score, 10 * s.cfg.maxScorePerSec, '10 s of play: 10 s of score, not 3x');
    // A pause banks nothing either.
    LS.hostAction(s, 'pause'); clock += 60e3; LS.score(s, seat, 1000000); LS.hostAction(s, 'resume');
    clock += 1000; LS.score(s, seat, 1000000);
    assert.equal(seat.score, 11 * s.cfg.maxScorePerSec);
  } finally { LS.hooks.now = was; }
});

test('one seat per account: a student whose seat was freed gets it back; results and the gradebook keep the best', () => {
  const g = publish(teacher, liveHtml(), { title: 'Class game' });
  const s = open(teacher, { mode: 'game', gameId: g.id, audience: 'class', classId: cls.id });
  const r1 = LS.join(s, mia); assert.ok(r1.ok, r1.code);
  r1.seat.score = 4000; r1.seat.leftAt = Date.now() - 61e3;
  LS.sweep();
  assert.equal(s.seats.size, 0, 'freed after 60 s offline');
  const r2 = LS.join(s, mia);
  assert.ok(r2.ok); assert.equal(r2.seat.no, r1.seat.no, 'the same seat'); assert.equal(r2.seat.score, 4000, 'score and all');
  assert.notEqual(r2.token, r1.token, 'old tokens die');
  // Even if two seats did end up in one run, the saved score is the better one.
  (s.gone || (s.gone = [])).push({ ...r2.seat, no: 99, score: 1500, items: new Map(), nonce: 'x' });
  s.startedAt = Date.now();
  const sum = LS.endSession(s.id);
  assert.ok(sum);
  const row = q.get('SELECT score FROM live_run_scores WHERE run_id=? AND user_id=?', s.id, mia.id);
  assert.equal(row.score, 4000);
});

test('unsolicited pongs do not change the answer timing', async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Pongs' }).id, audience: 'open' });
  const a = await player(s);
  for (let i = 0; i < 5; i++) { a.ws.pong(); await sleep(20); }
  await sleep(50);
  assert.equal(s.seats.get(a.join.seat).rtt, 0);
  a.ws.close();
});

test('removing the last player who had not answered reveals the question at once', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' });
  await a.next('ph', m => m.phase === 'loading');
  a.send({ t: 'rdy', view: '3d' }); b.send({ t: 'rdy', view: '3d' });
  const qm = await a.next('q');
  a.send({ t: 'an', i: qm.i, c: 0, e: 100 });
  await a.next('ack');
  const t0 = Date.now();
  h.send({ t: 'h', a: 'kick', n: b.join.seat });
  await a.next('rv', null, 2000);
  assert.ok(Date.now() - t0 < 1500, 'no wait for the deadline');
  for (const c of [h, a, b]) c.ws.close();
});

test('the live pack interpolates on when each position arrived (row age), not on the tick', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(path.join(ROOT, 'kit/packs/live.js'), 'utf8'));
  assert.match(src, /\(m\.ts \|\| now\(\)\) - \(\+r\[6\] \|\| 0\)/);
  void cookieFor; void battle; void config;
});
