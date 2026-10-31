// Oomba Live sessions end to end through the real socket (services/classlive-sessions.js, classlive-socket.js,
// classlive-quiz.js, classlive-results.js): codes, one session per host, joining (guests with no cookie and no row,
// class rooms for signed-in students only), seats across devices and reconnects, host controls with stale-seq
// protection, the loading barrier, server-timed questions (the answer never sent early, late and second answers
// refused, pause shifts the clock), Quest Race progress, results and the gradebook, and nothing about guests saved.
import { reset, RL, ctx, call, socket, open, hostSocket, player, sleep, cookieFor, LS, q, S, L, games, config, teacher, teacher2, cls, cls2, mia, leo, zed, kid, mum, questRace, battle, publish, liveHtml, logs } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';

test.beforeEach(() => reset());

test('codes: 7 digits, unique among open sessions, never reused within 24 hours, gone when the session ends', () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) { const c = LS.newCode(); assert.match(c, /^\d{7}$/); assert.ok(+c >= 1e6); seen.add(c); }
  const s = open(teacher, { mode: 'quest-race', starter: 'math-8', audience: 'class', classId: cls.id });
  assert.match(s.code, /^\d{7}$/);
  assert.equal(LS.byJoinCode(s.code), s);
  LS.endSession(s.id);
  assert.equal(LS.byJoinCode(s.code), null, 'the code dies with the session');
  for (let i = 0; i < 2000; i++) assert.notEqual(LS.newCode(), s.code, 'not reused within 24 hours');
});

test('one open session per host: a second asks first, replace ends the old one; kids and guests never host', () => {
  const a = open(teacher, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id });
  const again = LS.createSession(teacher, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id });
  assert.equal(again.code, 'hasOpen'); assert.equal(again.sid, a.id);
  const b = LS.createSession(teacher, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id, replace: true });
  assert.ok(b.ok); assert.equal(a.phase, 'ended');
  assert.equal(LS.createSession(kid, { mode: 'battle', starter: 'geo' }).code, 'notHost');
  assert.equal(LS.createSession(mia, { mode: 'battle', starter: 'geo' }).code, 'notHost');
  assert.equal(LS.createSession(teacher2, { mode: 'battle', starter: 'nope', audience: 'open' }).code, 'noSet');
  assert.equal(LS.createSession(teacher2, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id }).code, 'notTeacher', 'only your own class');
  config.liveClassroom = false;
  assert.equal(LS.createSession(teacher2, { mode: 'battle', starter: 'geo' }).code, 'off');
});

test('the max sessions cap', () => {
  const was = config.liveMaxSessions; config.liveMaxSessions = 1;
  try {
    open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
    assert.equal(LS.createSession(teacher2, { mode: 'battle', starter: 'geo', audience: 'open' }).code, 'busy');
  } finally { config.liveMaxSessions = was; }
});

test('a guest joins with no cookie and no users row; a 6-character code is not a live code; misses are slowed per address', async () => {
  const s = open(teacher, { mode: 'quest-race', starter: 'math-8', audience: 'open' });
  const users = q.get('SELECT COUNT(*) n FROM users').n;
  const r = await call('/api/live/join', { method: 'POST', body: { code: `${s.code.slice(0, 3)} ${s.code.slice(3)}` } });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.headers.getSetCookie().length, 0, 'no cookie for a guest');
  assert.equal(q.get('SELECT COUNT(*) n FROM users').n, users, 'no account made');
  assert.ok(r.json.tok); assert.ok(Number.isInteger(r.json.nick) && r.json.nick >= 0 && r.json.nick < 144); assert.equal(r.json.name, '');
  assert.ok(r.json.avatar && r.json.avatar.species); assert.equal(r.json.audience, 'open');
  assert.ok(r.ms >= 140, `answers take at least 150 ms (${r.ms})`);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: 'ABC234' } })).json.code, 'badCode');
  // A wrong code is a miss; 100 misses in 10 minutes from one address: slowed down (an IPv6 /64 is one address).
  assert.equal(LS.ipKey({ ip: '2001:db8:1:2:3:4:5:6' }), '2001:db8:1:2::/64');
  assert.equal(LS.ipKey({ ip: '2001:db8:1:2::9' }), '2001:db8:1:2::/64');
  assert.equal(LS.ipKey({ ip: '::ffff:10.1.2.3' }), '10.1.2.3');
  for (let i = 0; i < 100; i++) LS.joinMiss('127.0.0.1');
  const slow = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal(slow.status, 429); assert.equal(slow.json.code, 'slowDown');
});

test('locked and full rooms are not misses; the site-wide meter turns on strict limits', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open', maxPlayers: 2 });
  await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  const full = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal(full.status, 409); assert.equal(full.json.code, 'full');
  LS.hostAction(s, 'lock');
  const locked = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal(locked.json.code, 'locked');
  assert.equal(RL.count('lv-miss:127.0.0.1'), 0, 'neither counted as a miss');
  for (let i = 0; i < LS.STRICT.trigger + 1; i++) LS.joinMiss(`10.0.${i % 250}.${i % 7}`);
  assert.ok(LS._meter.strictUntil > Date.now());
  assert.ok(logs.some(l => l.msg.includes('strict limits on')));
  for (let i = 0; i < LS.STRICT.misses; i++) LS.joinMiss('10.9.9.9');
  assert.equal(LS.joinTry('10.9.9.9'), 'slowDown', 'strict: 5 misses');
});

test('class rooms: signed-in active students of that class only; names are account names; guests are told to sign in', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'class', classId: cls.id });
  assert.equal(s.nameMode, 'accounts');
  const guest = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.equal(guest.status, 401); assert.equal(guest.json.code, 'signIn');
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: zed })).json.code, 'notMember');
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: kid })).json.code, 'notMember');
  const m = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: mia });
  assert.equal(m.status, 200); assert.equal(m.json.name, mia.display_name, 'the account name in a teacher\'s own class room');
  // One seat per account: a second device gets the same seat.
  const again = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: mia });
  assert.equal(again.json.seat, m.json.seat); assert.equal(again.json.again, true);
});

test('open rooms: signed-in players show as nicknames too; "play as a guest" drops the account', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  assert.equal(s.nameMode, 'nicknames');
  const k = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: kid });
  assert.equal(k.json.name, ''); assert.ok(Number.isInteger(k.json.nick));
  const asGuest = await call('/api/live/join', { method: 'POST', body: { code: s.code, asGuest: true }, user: kid });
  assert.notEqual(asGuest.json.seat, k.json.seat, 'a separate guest seat');
  assert.equal(s.seats.get(asGuest.json.seat).userId, null);
});

test('reroll: a new nickname and avatar before entering, at most 10 a minute, never after connecting', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const j = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  const names = new Set([j.json.nick]);
  for (let i = 0; i < 10; i++) { const r = await call('/api/live/reroll', { method: 'POST', body: { tok: j.json.tok } }); assert.equal(r.status, 200); names.add(r.json.nick); }
  assert.ok(names.size > 1);
  assert.equal((await call('/api/live/reroll', { method: 'POST', body: { tok: j.json.tok } })).status, 429);
  const k = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  const c = socket(); await c.hello(k.json.tok);
  assert.equal((await call('/api/live/reroll', { method: 'POST', body: { tok: k.json.tok } })).status, 429, 'not after entering');
  c.ws.close();
});

test('the socket: host and players get their welcome, the roster, positions (one snapshot for all), events with seat numbers', async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Walkers' }).id, audience: 'open' });
  const h = await hostSocket(s, teacher);
  assert.equal(h.wel.role, 'host'); assert.equal(h.wel.code, s.code); assert.ok(h.wel.frame);
  const a = await player(s); const b = await player(s);
  assert.equal(a.wel.role, 'player'); assert.equal(a.wel.players.length >= 1, true); assert.ok(a.wel.frame);
  assert.equal(a.wel.me.seat, a.join.seat);
  const pj = await a.next('pj', m => m.p[0] === b.join.seat);
  assert.equal(pj.p.length, 8, 'P = [seat, name, avatar, team, score, connected, ready, late]');
  a.send({ t: 'mv', p: [100, 0, 200, 64, 1] });
  const snap = await b.next('s');
  const row = snap.p.find(p => p[0] === a.join.seat);
  assert.deepEqual(row.slice(0, 6), [a.join.seat, 100, 0, 200, 64, 1]);
  assert.ok(Number.isInteger(row[6]) && row[6] >= 0 && row[6] <= 150, `each row says how old its position is (${row[6]} ms)`);
  const hs = await h.next('s'); assert.deepEqual(hs.p, snap.p, 'the same snapshot');
  // A jump faster than the game allows is put back (one teleport every 5 s is fine).
  a.send({ t: 'mv', p: [9000, 0, 9000, 0, 0] });
  await b.next('s', m => m.p.some(p => p[0] === a.join.seat && p[1] === 9000));
  a.send({ t: 'mv', p: [100, 0, 100, 0, 0] });
  const fix = await a.next('fix'); assert.deepEqual(fix.p.slice(0, 3), [9000, 0, 9000]);
  // Events: numbers and tokens only, relayed with the sender's seat; prose is dropped.
  a.send({ t: 'ev', k: 'pick', d: { item: 'red-gem', n: 3 } });
  const ev = await b.next('ev'); assert.deepEqual(ev, { t: 'ev', f: a.join.seat, k: 'pick', d: { item: 'red-gem', n: 3 }, seen: true });
  a.send({ t: 'ev', k: 'say', d: 'hello there' });
  a.send({ t: 'em', e: 2 });
  const em = await b.next('em'); assert.equal(em.f, a.join.seat); assert.equal(em.e, 2);
  assert.ok(!b.msgs.some(m => m.t === 'ev' && m.k === 'say'), 'a string with a space never travels');
  // Clock sync.
  a.send({ t: 'pi', c: 123 }); const po = await a.next('po'); assert.equal(po.c, 123); assert.ok(Math.abs(po.s - Date.now()) < 1000);
  for (const c of [h, a, b]) c.ws.close();
});

test('host controls: start (auto-lock), the loading barrier, countdown, next/skip with a stale seq ignored, remove bans, end', async () => {
  const g = publish(teacher, liveHtml(), { title: 'Rounds' });
  const s = open(teacher, { mode: 'game', gameId: g.id, audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' });
  const loading = await a.next('ph', m => m.phase === 'loading');
  assert.equal(s.settings.locked, true, 'open rooms lock at start');
  a.send({ t: 'rdy', view: '3d' });
  await sleep(50); assert.equal(s.phase, 'loading', 'waits for every connected seat');
  b.send({ t: 'rdy', view: 'watch' });
  const cd = await a.next('ph', m => m.phase === 'countdown');
  assert.ok(cd.at > loading.at);
  const playing = await a.next('ph', m => m.phase === 'playing');
  // A game's score can rise only as fast as it allows.
  await sleep(600);
  a.send({ t: 'sc', n: 500 }); await sleep(30); assert.equal(s.seats.get(a.join.seat).score, 500);
  a.send({ t: 'sc', n: 999999 }); await sleep(30); assert.ok(s.seats.get(a.join.seat).score < 3000);
  a.send({ t: 'it', i: 0, ok: true }); a.send({ t: 'it', i: 0, ok: false }); await sleep(30);
  assert.equal(s.seats.get(a.join.seat).correct, 1); assert.equal(s.seats.get(a.join.seat).answered, 1, 'once per item');
  // Next with the seq it was pressed at; the same press again is ignored.
  h.send({ t: 'h', a: 'next', at: playing.seq });
  const between = await a.next('ph', m => m.phase === 'between');
  h.send({ t: 'h', a: 'next', at: playing.seq });
  await sleep(60); assert.equal(s.phase, 'between', 'a double tap does not skip');
  h.send({ t: 'h', a: 'next', at: between.seq });
  await a.next('ph', m => m.phase === 'playing' && m.round === 2);
  // Remove: told, closed, banned (nonce and account).
  h.send({ t: 'h', a: 'kick', n: b.join.seat });
  assert.equal((await b.next('bye')).why, 'removed');
  assert.equal(await b.closed, 4403);
  const back = socket(); assert.equal(await back.opened.then(() => { back.send({ t: 'hello', v: 1, tok: b.join.tok }); return back.closed; }), 4403);
  const pl = await a.next('pl'); assert.equal(pl.n, b.join.seat);
  assert.equal((await h.next('pl')).n, b.join.seat);
  h.send({ t: 'h', a: 'end' });
  assert.equal((await a.next('bye')).why, 'ended');
  assert.equal((await h.next('res')).id, s.id);
  assert.equal(s.phase, 'ended');
  for (const c of [h, a]) c.ws.close();
});

test('the loading barrier gives up after its wait; disconnected seats never block it', async () => {
  const was = LS.hooks.loadingMs; LS.hooks.loadingMs = 150;
  try {
    const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Slow' }).id, audience: 'open' });
    const h = await hostSocket(s, teacher);
    const a = await player(s);
    h.send({ t: 'h', a: 'start' });
    await a.next('ph', m => m.phase === 'loading');
    await a.next('ph', m => m.phase === 'countdown', 1000);
    h.ws.close(); a.ws.close();
  } finally { LS.hooks.loadingMs = was; }
});

test('reconnect: the same seat and score; a second device takes the seat over; a freed seat keeps its score in the summary', async () => {
  const s = open(teacher, { mode: 'game', gameId: publish(teacher, liveHtml(), { title: 'Back' }).id, audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia);
  s.seats.get(a.join.seat).score = 77;
  a.ws.close(); await a.closed; await sleep(20);
  assert.equal(s.seats.get(a.join.seat).conn, null);
  const a2 = socket({ cookie: cookieFor(mia.id) });
  const wel = await a2.hello(a.join.tok);
  assert.equal(wel.me.seat, a.join.seat); assert.equal(wel.me.score, 77);
  // Same account, another device: takes over the seat.
  const again = await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: mia });
  const a3 = socket({ cookie: cookieFor(mia.id) }); await a3.hello(again.json.tok);
  assert.equal((await a2.next('bye')).why, 'replaced');
  // A signed-in seat's token is no use without that sign-in.
  const thief = socket({ cookie: cookieFor(leo.id) }); await thief.opened; thief.send({ t: 'hello', v: 1, tok: again.json.tok });
  assert.equal(await thief.closed, 4401);
  a3.ws.close(); await a3.closed; await sleep(20);
  const seat = s.seats.get(a.join.seat);
  seat.leftAt = Date.now() - LS.hooks.holdMs - 1;
  LS.sweep();
  assert.equal(s.seats.has(a.join.seat), false, 'freed after 60 s');
  LS.endSession(s.id);
  assert.equal(s.summary.players.find(p => p.seat === a.join.seat).score, 77, 'its score stays in the summary');
  h.ws.close();
});

test('questions: server timing, the answer never sent early, late and second answers refused, a reveal when everyone answered, pause shifts the clock', async () => {
  const s = open(teacher, { mode: 'battle', items: [
    { q: 'Two plus two?', choices: ['4', '5', '3'], answer: 0, secs: 10 },
    { q: 'Ten minus one?', choices: ['8', '9'], answer: 1, secs: 10 },
  ], audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' });
  a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const q0 = await a.next('q');
  assert.equal(q0.i, 0); assert.equal(q0.n, 2); assert.equal(q0.choices.length, 3); assert.equal(q0.answer, undefined, 'never the answer');
  assert.equal(JSON.stringify(a.msgs).includes('"answer"'), false);
  const right = q0.choices.indexOf('4'), wrong = q0.choices.indexOf('5');
  a.send({ t: 'an', i: 0, c: right, e: 0 });
  assert.equal((await a.next('ack')).i, 0);
  a.send({ t: 'an', i: 0, c: wrong, e: 0 }); // second answer ignored
  await sleep(30);
  assert.equal(s.qz.answers.get(a.join.seat).c, right);
  b.send({ t: 'an', i: 0, c: wrong, e: 9000 });
  const rv = await a.next('rv');
  assert.equal(rv.answer, right); assert.equal(rv.counts[right], 1); assert.equal(rv.counts[wrong], 1);
  const youA = await a.next('you'); assert.equal(youA.ok, true); assert.ok(youA.points >= 900, `fast and right: ${youA.points}`); assert.equal(youA.rank, 1);
  const youB = await b.next('you'); assert.equal(youB.ok, false); assert.equal(youB.points, 0);
  const between = await h.next('ph', m => m.phase === 'between');
  h.send({ t: 'h', a: 'next', at: between.seq });
  const q1 = await a.next('q', m => m.i === 1);
  // Pause: answers refused, then the clock moves on by the paused time and q comes again.
  h.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  b.send({ t: 'an', i: 1, c: 0, e: 0 }); await sleep(80);
  assert.equal(s.qz.answers.size, 0, 'no answers while paused');
  h.send({ t: 'h', a: 'resume' });
  const q1b = await a.next('q', m => m.i === 1 && m.at > q1.at);
  assert.ok(q1b.at - q1.at >= 70);
  // A late answer (after the deadline) is refused.
  s.qz.cur.deadline = Date.now() - 1;
  assert.equal(LS.answer(s, s.seats.get(a.join.seat), { t: 'an', i: 1, c: 0, e: 0 }, Date.now()), false);
  s.qz.cur.deadline = Date.now() + 10000;
  // Everyone connected and ready answered: the reveal comes at once.
  a.send({ t: 'an', i: 1, c: q1b.choices.indexOf('9'), e: 100 }); b.send({ t: 'an', i: 1, c: q1b.choices.indexOf('8'), e: 100 });
  await a.next('rv', m => m.i === 1);
  const last = await h.next('ph', m => m.phase === 'between' && m.seq > between.seq);
  h.send({ t: 'h', a: 'next', at: last.seq });
  assert.equal((await a.next('you', m => m.of !== undefined)).rank, 1);
  assert.equal((await a.next('bye')).why, 'ended');
  const sum = s.summary;
  assert.deepEqual(sum.items.map(i => [i.right, i.answered]), [[1, 2], [1, 2]]);
  assert.equal(sum.items[0].topWrong, '5');
  for (const c of [h, a, b]) c.ws.close();
});

test('the device\'s own timing is trusted only within one round trip of the server\'s', async () => {
  const s = open(teacher, { mode: 'battle', items: [{ q: 'Hi?', choices: ['a', 'b'], answer: 0, secs: 10 }], audience: 'open' });
  const h = await hostSocket(s, teacher); const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  const q0 = await a.next('q');
  const seat = s.seats.get(a.join.seat);
  // Claims 0 ms but the server saw 4 s: clamped to at least 4000 - rtt - 500.
  LS.answer(s, seat, { t: 'an', i: 0, c: 0, e: 0 }, q0.at + 4000);
  assert.ok(s.qz.answers.get(seat.no).elapsed >= 3400, String(s.qz.answers.get(seat.no).elapsed));
  h.ws.close(); a.ws.close();
});

test('Quest Race: a perfect, fast player reaches the flag (1000) on the last question; progress only for right answers', async () => {
  const items = Array.from({ length: 5 }, (_, i) => ({ q: `Q${i}?`, choices: ['yes', 'no'], answer: 0, secs: 10 }));
  const s = open(teacher, { mode: 'quest-race', items, audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  for (let i = 0; i < 5; i++) {
    const qq = await a.next('q', m => m.i === i);
    if (i >= 3) await sleep(500);   // answers: 2 a second per device
    a.send({ t: 'an', i, c: qq.choices.indexOf('yes'), e: 0 });
    b.send({ t: 'an', i, c: qq.choices.indexOf(i % 2 ? 'yes' : 'no'), e: 0 });
    const race = await a.next('race');
    const bp = race.p.find(p => p[0] === b.join.seat);
    if (i === 0) assert.equal(bp[1], 0, 'no progress for a wrong answer');
    const ph = await h.next('ph', m => m.phase === 'between');
    if (i < 4) h.send({ t: 'h', a: 'next', at: ph.seq });
  }
  const p = LS.raceList(s);
  assert.equal(p.find(x => x[0] === a.join.seat)[1], 1000);
  assert.ok(p.find(x => x[0] === b.join.seat)[1] < 1000);
  for (const c of [h, a, b]) c.ws.close();
});

test('results: a class run saves scores for the class\'s students only, into the gradebook for a linked game step; guests are never saved', async () => {
  const game = publish(teacher, liveHtml("live.quiz.answer(0);", { quiz: true }), { visibility: 'class', title: 'Class quiz' });
  q.run('INSERT INTO game_classes(game_id, class_id, added_at, added_by) VALUES (?,?,?,?)', game.id, cls.id, Date.now(), teacher.id);
  const lesson = L.createLesson(teacher, S.getClass(cls.id).school_id, { title: 'Live lesson' }).lesson;
  const step = L.addStep(teacher, lesson.id, { kind: 'game', gameId: game.id, body: 'Play it live' }).step;
  const cl = L.assign(teacher, cls.id, lesson.id, {}).classLesson;
  const s = open(teacher, { mode: 'game', gameId: game.id, items: [{ q: 'Pick yes', choices: ['yes', 'no'], answer: 0, secs: 10 }], audience: 'class', classId: cls.id, clId: cl.id, stepId: step.id });
  assert.equal(s.clId, cl.id); assert.ok(s.quiz, 'a game that declares quiz:true gets questions');
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qq = await a.next('q');
  a.send({ t: 'an', i: 0, c: qq.choices.indexOf('yes'), e: 0 }); b.send({ t: 'an', i: 0, c: qq.choices.indexOf('no'), e: 0 });
  const ph = await h.next('ph', m => m.phase === 'between');
  h.send({ t: 'h', a: 'next', at: ph.seq });
  await a.next('bye');
  const run = q.get('SELECT * FROM live_runs WHERE id=?', s.id);
  assert.equal(run.class_id, cls.id); assert.equal(run.players, 2); assert.equal(run.guests, 0);
  // Part 3: the question as asked (host-written text and choices, the answer, its time and the counts) for the review.
  const [saved] = JSON.parse(run.items);
  assert.deepEqual({ ...saved, choices: [...saved.choices].sort(), answer: saved.choices[saved.answer] }, { q: 'Pick yes', right: 1, answered: 2, top_wrong: 'no', choices: ['no', 'yes'], answer: 'yes', secs: 10, counts: [1, 1] });
  const scores = q.all('SELECT user_id, score, rank FROM live_run_scores WHERE run_id=? ORDER BY rank', s.id);
  assert.deepEqual(scores.map(r => r.user_id), [mia.id, leo.id]);
  const prog = q.get('SELECT score, label FROM step_progress WHERE class_lesson_id=? AND step_id=? AND user_id=?', cl.id, step.id, mia.id);
  assert.ok(prog.score > 0); assert.equal(prog.label, 'live');
  // The teacher's results page and CSV; another teacher can't see them.
  const page = await call(`/live/results/${s.id}`, { user: teacher });
  assert.equal(page.status, 200); assert.ok(page.text.includes(mia.display_name), 'names as shown in the session');
  const csv = await call(`/live/results/${s.id}.csv`, { user: teacher });
  assert.equal(csv.status, 200); assert.match(csv.text, /^rank,student,team,score,bonus,correct,answered,q1\r\n/);
  assert.equal((await call(`/live/results/${s.id}`, { user: teacher2 })).status, 404);
  for (const c of [h, a, b]) c.ws.close();
});

test('an open room persists counts only: no row names a guest, a code, a nickname or a nonce', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'science', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s, kid);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qq = await a.next('q');
  a.send({ t: 'an', i: 0, c: 0, e: 0 }); b.send({ t: 'an', i: 0, c: 1, e: 0 });
  await h.next('ph', m => m.phase === 'between');
  h.send({ t: 'h', a: 'end' });
  await a.next('bye');
  const run = q.get('SELECT * FROM live_runs WHERE id=?', s.id);
  assert.equal(run.players, 2); assert.equal(run.guests, 1); assert.equal(run.class_id, null);
  assert.equal(q.get('SELECT COUNT(*) n FROM live_run_scores WHERE run_id=?', s.id).n, 0);
  const all = JSON.stringify(q.all('SELECT * FROM live_runs')) + JSON.stringify(q.all('SELECT * FROM live_run_scores'));
  for (const seat of s.summary.players) assert.ok(typeof seat.name === 'number');
  assert.ok(!all.includes(s.code), 'no code'); assert.ok(!all.includes(a.join.tok.slice(0, 20)), 'no token');
  assert.ok(!all.includes(kid.id), 'no signed-in player outside a class run');
  assert.ok(qq.q.length > 0);
  for (const c of [h, a, b]) c.ws.close();
});

test('account deletion forgets live scores; retention drops classless runs after 90 days', async () => {
  const R = await import('../../server/services/classlive-results.js');
  q.run("INSERT INTO live_runs(id, host_id, audience, mode, started_at, ended_at) VALUES ('old1', ?, 'open', 'battle', 1, 1)", teacher.id);
  q.run("INSERT INTO live_run_scores(run_id, user_id, score) VALUES ('old1', ?, 5)", mia.id);
  assert.equal(R.retention(), 1);
  assert.equal(q.get("SELECT COUNT(*) n FROM live_runs WHERE id='old1'").n, 0);
  q.run("INSERT INTO live_run_scores(run_id, user_id, score) VALUES ('x', 'u-gone', 5)");
  R.forgetUser('u-gone');
  assert.equal(q.get("SELECT COUNT(*) n FROM live_run_scores WHERE user_id='u-gone'").n, 0);
});

test('a grown-up hosts an open room (at most 30 players, nicknames only); a family room needs a family', async () => {
  const s = open(mum, { mode: 'battle', starter: 'geo', audience: 'open', maxPlayers: 60 });
  assert.equal(s.settings.maxPlayers, 30); assert.equal(s.nameMode, 'nicknames');
  assert.equal(LS.createSession(mum, { mode: 'battle', starter: 'geo', audience: 'family', replace: true }).code, 'noFamily');
  // The grown-up guard lets them reach the live pages and APIs.
  assert.equal((await call('/live', { user: mum })).status, 200);
  assert.equal((await call('/join', { user: mum })).status, 200);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code }, user: mum })).status, 200);
});

test('the shutdown drain saves every session and tells devices to come back', async () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  const h = await hostSocket(s, teacher); const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); await a.next('q');
  const LSock = await import('../../server/services/classlive-socket.js');
  assert.equal(LSock.drainLive(), 1);
  assert.equal((await a.next('bye')).why, 'restart');
  assert.ok(q.get('SELECT 1 FROM live_runs WHERE id=?', s.id));
});

test('expiry: past its hours the session ends and its code dies', () => {
  const s = open(teacher, { mode: 'battle', starter: 'geo', audience: 'open' });
  s.endsAt = Date.now() - 1;
  LS.sweep();
  assert.equal(s.phase, 'ended'); assert.equal(s.why, 'expired'); assert.equal(LS.byJoinCode(s.code), null);
});

test('frames: a seat\'s frame gets the session name only, the pinned version, gzip; a stranger\'s token or a removed seat gets nothing', async () => {
  const g = publish(teacher, liveHtml(), { title: 'Framed' });
  const s = open(teacher, { mode: 'game', gameId: g.id, audience: 'open' });
  const a = await player(s);
  const r = await fetch(`${ctx.base}/live/frame/${a.wel.frame}`, { headers: { 'accept-encoding': 'gzip' } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-security-policy'), /connect-src 'none'/);
  assert.equal(r.headers.get('content-encoding'), 'gzip');
  const html = await r.text();
  const init = JSON.parse(html.match(/window.__BRB_INIT__=(.*?);<\/script>/)[1]);
  assert.equal(init.live.role, 'player'); assert.equal(init.live.seat, a.join.seat); assert.equal(init.live.nicks.length, 144);
  assert.equal(init.user.displayName, init.live.nicks[a.join.nick], 'the nickname, never an account name');
  assert.equal(init.canSave, false);
  assert.equal(r.headers.get('set-cookie'), null);
  LS.kick(s, a.join.seat);
  assert.equal((await fetch(`${ctx.base}/live/frame/${a.wel.frame}`)).status, 403);
  assert.equal((await fetch(`${ctx.base}/live/frame/not-a-token`)).status, 403);
  a.ws.close();
});

test('a game hidden mid-session ends its game phase; joins and frames stop', async () => {
  const g = publish(teacher, liveHtml(), { title: 'Hidden later' });
  const s = open(teacher2, { mode: 'game', gameId: g.id, audience: 'open' });
  const h = await hostSocket(s, teacher2);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  await a.next('ph', m => m.phase === 'playing');
  q.run("UPDATE games SET hidden_reason='reports' WHERE id=?", g.id);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code } })).json.code, 'takenDown');
  LS.sweep();
  assert.equal((await a.next('bye')).why, 'takenDown');
  h.ws.close();
});
