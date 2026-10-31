// Oomba Live part 3 through the real socket (docs/decisions.md "Oomba Live, part 3"; docs/live-protocol.md): teams over
// the wire (one tms for a shuffle, late joiners, a signed-in rejoin keeps its team, team events to teammates only,
// players choosing), the projector and the teacher's dashboard together (replacement per view, host-gone needs both,
// the dashboard not waited for at loading, dashboard-only data never reaching a player or the projector), eyes up,
// messages, +time, bonus privacy, a new nickname, muted emotes, names per view, settings at start, late join as autoLock,
// per-seat extra time (private), the linger and play again, play the missed questions again, and the new pages and APIs.
import { reset, ctx, call, socket, open, hostSocket, player, sleep, cookieFor, LS, q, S, config, teacher, teacher2, cls, mia, leo, publish, liveHtml } from './_live.js';
import test from 'node:test';
import assert from 'node:assert/strict';
const T = await import('../../server/services/classlive-teams.js');
const Q = await import('../../server/services/classlive-quiz.js');

test.beforeEach(() => reset());
const items = n => Array.from({ length: n }, (_, i) => ({ q: `Q${i + 1}: pick yes`, choices: ['yes', 'no', 'maybe'], answer: 0, secs: 10 }));
const yes = qm => qm.choices.indexOf('yes');
const no = qm => qm.choices.indexOf('no');
/** The teacher's dashboard connection. */
async function dashSocket(s, host = teacher) {
  const d = socket({ cookie: cookieFor(host.id) });
  await d.opened; d.send({ t: 'hello', v: 1, tok: LS.hostToken(s), view: 'dash' });
  d.wel = await d.next('wel');
  return d;
}
const types = c => c.msgs.map(m => m.t);
const close = (...cs) => { for (const c of cs) c.ws.close(); };

test('teams over the wire: on balances everyone, a shuffle of the room is one tms (no pu), late joiners to the smallest team, team events to teammates and hosts only, players choose in the lobby', async () => {
  const s = open(teacher, { mode: 'battle', items: items(3), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const ps = [];
  for (let i = 0; i < 4; i++) ps.push(await player(s));
  h.send({ t: 'tm', a: 'on', n: 2 });
  const tms = await ps[0].next('tms', m => m.on);
  assert.deepEqual(tms.teams.map(x => x[2]), [2, 2]); assert.equal(tms.m.length, 4);
  await sleep(50);
  const before = ps.map(p => p.msgs.length);
  h.send({ t: 'tm', a: 'shuffle' });
  await sleep(120);
  ps.forEach((p, i) => {
    const got = p.msgs.slice(before[i]).map(m => m.t);
    assert.deepEqual(got.filter(t => t === 'tms').length, 1, 'one message for the whole shuffle');
    assert.equal(got.filter(t => t === 'pu').length, 0, 'no per-seat updates');
  });
  // Team events: a player's event to its own team reaches teammates and the hosts, never the other team.
  const team = n => s.seats.get(ps[n].join.seat).team;
  const mate = ps.findIndex((p, i) => i > 0 && team(i) === team(0));
  const other = ps.findIndex(p => team(ps.indexOf(p)) !== team(0));
  ps[0].send({ t: 'ev', k: 'pick', d: 1, to: 'team' });
  const got = await ps[mate].next('ev', m => m.k === 'pick');
  assert.equal(got.f, ps[0].join.seat); assert.equal(got.tm, team(0));
  await h.next('ev', m => m.k === 'pick');
  await sleep(60);
  assert.ok(!ps[other].msgs.some(m => m.t === 'ev' && m.k === 'pick'), 'the other team hears nothing');
  // Late joiner: to the smallest team.
  const otherTeam = team(other);
  T.move(s, s.seats.get(ps[other].join.seat), team(0));   // 3 against 1
  const late = await player(s);
  const small = otherTeam;
  assert.equal(s.seats.get(late.join.seat).team, small);
  // Players choose: only when allowed, in the lobby.
  const mine = s.seats.get(late.join.seat);
  late.send({ t: 'pt', k: mine.team === 1 ? 2 : 1 }); await sleep(60);
  assert.equal(mine.team, small, 'not allowed yet');
  h.send({ t: 'tm', a: 'choose', v: true }); await late.next('tms', m => m.choose);
  h.send({ t: 'tm', a: 'balance' }); await sleep(60);
  const want = mine.team === 1 ? 2 : 1;
  late.send({ t: 'pt', k: want });
  await late.next('tms', m => m.m.some(([n, k]) => n === mine.no && k === want));
  // Off in the lobby; team actions are ignored with LIVE_TEAMS=0.
  config.liveTeams = false;
  h.send({ t: 'tm', a: 'off' }); await sleep(60);
  assert.equal(s.teams.on, true);
  config.liveTeams = true;
  close(h, late, ...ps);
});

test('a signed-in student whose seat was freed comes back to the same team; the class run saves its teams', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'tm', a: 'on', n: 2 }); await a.next('tms', m => m.on);
  const k = s.seats.get(a.join.seat).team;
  a.ws.close(); await sleep(60);
  s.seats.get(a.join.seat).leftAt = Date.now() - 61e3; LS.sweep();
  assert.ok(!s.seats.has(a.join.seat), 'freed after the hold');
  const a2 = await player(s, mia);
  assert.equal(s.seats.get(a2.join.seat).team, k);
  h.send({ t: 'h', a: 'start' }); a2.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qm = await a2.next('q');
  a2.send({ t: 'an', i: 0, c: yes(qm), e: 0 }); b.send({ t: 'an', i: 0, c: no(qm), e: 0 });
  const ts = await a2.next('ts'); const rv = await a2.next('rv');
  assert.ok(ts && rv, 'team scores before the reveal');
  assert.ok(a2.msgs.findIndex(m => m.t === 'ts') < a2.msgs.findIndex(m => m.t === 'rv'));
  h.send({ t: 'h', a: 'end' });
  await a2.next('bye');
  const saved = T.loadClassTeams(cls.id);
  assert.equal(saved.plan.get(mia.id), k);
  const run = q.get('SELECT teams FROM live_runs WHERE id=?', s.id);
  const t = JSON.parse(run.teams);
  assert.equal(t.scoring, 'avg'); assert.ok(t.list.every(x => Number.isInteger(x.p) && !('name' in x)), 'preset numbers, never names');
  assert.equal(q.get('SELECT team FROM live_run_scores WHERE run_id=? AND user_id=?', s.id, mia.id).team, k);
  close(h, a, a2, b);
});

test('projector and dashboard: one of each, replaced per view; host gone needs both gone; the dashboard is not waited for; its data reaches nobody else', async () => {
  const s = open(teacher, { mode: 'battle', items: items(2), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const d = await dashSocket(s);
  assert.equal(d.wel.view, 'dash'); assert.ok(Array.isArray(d.wel.dp)); assert.equal(d.wel.frame, undefined, 'no game frame');
  assert.equal(h.wel.view, 'projector'); assert.ok(h.wel.frame); assert.equal(h.wel.dp, undefined);
  const d2 = await dashSocket(s);
  assert.equal(await d.closed, 4409, 'a newer dashboard replaces the old one');
  assert.ok(h.ws.readyState === 1, 'the projector stays');
  const a = await player(s), b = await player(s);
  // Start: the dashboard never sends rdy and is not waited for.
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qm = await a.next('q');
  await d2.next('dq');
  a.send({ t: 'an', i: 0, c: yes(qm), e: 0 });
  await d2.next('dq', m => m.answered.includes(a.join.seat));
  b.send({ t: 'an', i: 0, c: no(qm), e: 0 });
  await d2.next('dp');
  await sleep(60);
  for (const c of [a, b, h]) assert.ok(!c.msgs.some(m => ['dq', 'dp', 'sup', 'me'].includes(m.t)), `${c === h ? 'projector' : 'player'} got dashboard data`);
  // The dashboard can steer the game.
  const between = await d2.next('ph', m => m.phase === 'between');
  d2.send({ t: 'h', a: 'next', at: between.seq });
  await a.next('q', m => m.i === 1);
  // Host gone: only when both are gone.
  h.ws.close(); await sleep(60);
  assert.equal(s.host.conn, null); assert.equal(s.host.goneAt, 0, 'the dashboard is still here');
  assert.equal(LS.hostGone(s), false);
  d2.ws.close(); await sleep(60);
  assert.ok(s.host.goneAt > 0); assert.equal(LS.hostGone(s), true);
  close(a, b);
});

test('eyes up pauses play and resumes only a pause it made; messages are fixed, translated on each device, at most one every 3 s', async () => {
  const s = open(teacher, { mode: 'battle', items: items(2), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  const q0 = await a.next('q');
  h.send({ t: 'h', a: 'eyes', on: true });
  assert.equal((await a.next('eyes')).on, true);
  await a.next('ph', m => m.phase === 'paused');
  assert.equal(s.eyesPaused, true);
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: false });
  assert.equal((await a.next('eyes', m => !m.on)).on, false);
  const again = await a.next('q', m => m.i === 0 && m.at >= q0.at);
  assert.equal(s.phase, 'playing'); assert.ok(again);
  // Eyes up, then the host resumes: Resume lowers eyes too (the clock never runs behind the cover).
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: true }); await a.next('ph', m => m.phase === 'paused');
  h.send({ t: 'h', a: 'resume' }); await a.next('ph', m => m.phase === 'playing');
  assert.equal((await a.next('eyes', m => !m.on)).on, false, 'Resume lowered eyes up');
  assert.equal(s.eyes, false);
  // The host pauses by hand, then eyes up and down: eyes off leaves that pause alone.
  h.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: true }); await sleep(40);
  assert.equal(s.eyes, true); assert.equal(s.eyesPaused, false);
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: false }); await sleep(40);
  assert.equal(s.eyes, false);
  await sleep(60);
  assert.equal(s.phase, 'paused', 'the host\'s own pause stays');
  // Messages: an index, everyone gets it, one every 3 s.
  h.send({ t: 'h', a: 'say', m: 5 });
  assert.equal((await a.next('say')).m, 5);
  await h.next('say');
  h.send({ t: 'h', a: 'say', m: 2 }); await sleep(80);
  assert.ok(!a.msgs.some(m => m.t === 'say' && m.m === 2), 'too soon');
  close(h, a);
});

test('eyes up raised between questions (or before the start): the next question opens paused, no deadline passes behind the cover', async () => {
  const s = open(teacher, { mode: 'battle', items: items(2), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  // before the start: the first question opens paused
  h.send({ t: 'h', a: 'eyes', on: true }); await a.next('eyes', m => m.on);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  await a.next('q', m => m.i === 0);
  await a.next('ph', m => m.phase === 'paused');
  assert.equal(s.phase, 'paused'); assert.equal(s.eyesPaused, true);
  assert.equal(s.timers.deadline, null, 'no question clock runs behind the cover');
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: false }); await a.next('ph', m => m.phase === 'playing');
  // answer, reveal, then eyes up on the between screen and Next
  const q0 = await a.next('q', m => m.i === 0 && !m.seen);
  a.send({ t: 'an', i: 0, c: yes(q0), e: 100 }); await sleep(40);
  h.send({ t: 'h', a: 'next', at: s.seq }); await a.next('ph', m => m.phase === 'between');
  s.actAt = {};
  h.send({ t: 'h', a: 'eyes', on: true }); await a.next('eyes', m => m.on);
  h.send({ t: 'h', a: 'next', at: s.seq });
  await a.next('q', m => m.i === 1);
  await a.next('ph', m => m.phase === 'paused');
  assert.equal(s.eyesPaused, true); assert.equal(s.timers.deadline, null);
  const before = s.seats.get(a.join.seat).missRun || 0;
  await sleep(150);
  assert.equal(s.phase, 'paused'); assert.equal(s.qz.answers.size, 0);
  assert.equal(s.seats.get(a.join.seat).missRun || 0, before, 'nobody missed a question they could not see');
  // Resume while eyes are up: eyes come down and the question plays
  h.send({ t: 'h', a: 'resume' }); await sleep(40);
  assert.equal(s.phase, 'playing'); assert.equal(s.eyes, false);
  assert.ok(a.msgs.some(m => m.t === 'eyes' && !m.on && !m.seen), 'every device lowered the cover');
  close(h, a);
});

test('+time resends q with the same at and more seconds; points still use the question\'s own time', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'open' });
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  const q0 = await a.next('q');
  h.send({ t: 'h', a: 'time', s: 20 });
  const q1 = await a.next('q', m => m.secs === 30);
  assert.equal(q1.at, q0.at);
  assert.equal(s.qz.cur.base, 10, 'the time points are counted against');
  assert.equal(Q.points(5000, 10, 1), 750); assert.ok(Q.points(5000, 30, 1) > 750, 'so adding time could only have raised points; it doesn\'t');
  assert.equal(Q.points(9000, 10, 5, { accuracy: true }), 1000);
  close(h, a);
});

test('bonus points: a seat\'s is private (that seat and the hosts), a team\'s is public; never in the gradebook score', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'tm', a: 'on', n: 2 }); await a.next('tms', m => m.on);
  h.send({ t: 'h', a: 'bonus', n: a.join.seat, r: 1 });
  const bn = await a.next('bn');
  assert.deepEqual(bn, { t: 'bn', n: a.join.seat, r: 1, p: 100, seen: true });
  await h.next('bn');
  await sleep(60);
  assert.ok(!b.msgs.some(m => m.t === 'bn'), 'another player never hears of it');
  s.actAt = {};
  h.send({ t: 'h', a: 'bonus', k: 2, r: 0 });
  assert.equal((await b.next('bn')).k, 2); await a.next('bn', m => m.k === 2);
  await a.next('ts');
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qm = await a.next('q');
  a.send({ t: 'an', i: 0, c: no(qm), e: 0 }); b.send({ t: 'an', i: 0, c: no(qm), e: 0 });
  await a.next('rv');
  h.send({ t: 'h', a: 'end' }); await a.next('bye');
  const row = q.get('SELECT score, bonus FROM live_run_scores WHERE run_id=? AND user_id=?', s.id, mia.id);
  assert.deepEqual(row, { score: 0, bonus: 100 });
  close(h, a, b);
});

test('a new nickname for a seat shown by nickname; muted emotes; names per view (projector hidden, dashboard real names, players nicknames)', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const d = await dashSocket(s);
  const a = await player(s, mia), b = await player(s, leo);
  assert.equal(a.wel.players.find(p => p[0] === a.join.seat)[1], mia.display_name, 'class rooms: real names by default');
  h.send({ t: 'h', a: 'rename', n: a.join.seat }); await sleep(60);
  assert.ok(!b.msgs.some(m => m.t === 'pu' && m.p[0] === a.join.seat && typeof m.p[1] === 'number'), 'not for account names');
  h.send({ t: 'cf', d: { names: 'hidden' } });
  const pros = await h.next('ros'), dros = await d.next('ros'), aros = await a.next('ros');
  assert.equal(pros.players.find(p => p[0] === a.join.seat)[1], '', 'the projector shows no name');
  assert.equal(dros.players.find(p => p[0] === a.join.seat)[1], mia.display_name, 'the dashboard has real names');
  assert.equal(dros.nameMode, 'accounts'); assert.equal(aros.nameMode, 'nicknames');
  assert.equal(typeof aros.players.find(p => p[0] === a.join.seat)[1], 'number', 'players see nicknames');
  const nick = s.seats.get(a.join.seat).nick;
  h.send({ t: 'h', a: 'rename', n: a.join.seat });
  const pu = await b.next('pu', m => m.p[0] === a.join.seat && m.p[1] !== nick);
  assert.equal(typeof pu.p[1], 'number');
  assert.equal((await h.next('pu', m => m.p[0] === a.join.seat && m.p[1] !== mia.display_name)).p[1], '', 'still no name on the projector');
  // Emotes off: players are told (opt) and nothing is relayed.
  h.send({ t: 'cf', d: { emotes: false } });
  assert.equal((await a.next('opt', m => m.emotes === false)).emotes, false);
  b.send({ t: 'em', e: 1 }); await sleep(80);
  assert.ok(!a.msgs.some(m => m.t === 'em'));
  // Settings reach the hosts in full, players only the public part.
  const cf = await d.next('cf', m => m.d.emotes === false);
  assert.equal(cf.d.emotes, false);
  assert.ok(!a.msgs.some(m => m.t === 'cf'));
  close(h, d, a, b);
});

test('settings at start: the first N questions, accuracy-only points, leaderboard off on devices (no ranks, no top), full on the projector', async () => {
  const s = open(teacher, { mode: 'battle', items: items(7), audience: 'open', settings: { count: 5, points: 'accuracy', board: 'off', shuffleQ: true } });
  assert.equal(s.settings.board, 'off'); assert.equal(s.settings.count, 5);
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  const qm = await a.next('q');
  assert.equal(qm.n, 5); assert.equal(s.items.length, 5); assert.equal(s.allItems.length, 7);
  a.send({ t: 'an', i: 0, c: yes(qm), e: 0 });
  const you = await a.next('you');
  assert.equal(you.points, 1000); assert.equal(you.rank, 0, 'no rank on the device');
  assert.deepEqual((await a.next('rv')).top, []);
  assert.equal((await h.next('rv')).top.length, 1, 'the projector keeps its top five');
  // Remembered as the host's defaults (at start).
  const prefs = await call('/api/live/prefs', { user: teacher });
  assert.equal(prefs.json.settings.board, 'off'); assert.equal(prefs.json.settings.count, 5);
  close(h, a);
});

test('late join is the room\'s autoLock: lock, unlock and the player cap still work', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'open', maxPlayers: 2 });
  assert.equal(s.settings.autoLock, true, 'open rooms lock at start');
  const h = await hostSocket(s, teacher);
  h.send({ t: 'cf', d: { late: true } }); await h.next('cf');
  assert.equal(s.settings.autoLock, false);
  const a = await player(s); await player(s);
  assert.equal((await call('/api/live/join', { method: 'POST', body: { code: s.code } })).json.code, 'full');
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
  await a.next('q');
  assert.equal(s.settings.locked, false, 'late join on: not locked at start');
  h.send({ t: 'cf', d: { late: false } });
  assert.equal((await h.next('lk')).locked, true);
  h.send({ t: 'h', a: 'unlock' }); await h.next('lk', m => !m.locked);
  close(h, a);
});

test('support: extra time only for that seat (its own q, a later deadline), private (never broadcast, never to the projector), saved per class only with LIVE_SAVE_SUPPORT', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const d = await dashSocket(s);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'h', a: 'acc', n: a.join.seat, x: 200, ra: 1, sv: 0, save: 1 });
  const me = await a.next('me');
  assert.deepEqual(me.acc, { time: 200, read: true, simple: false });
  const sup = await d.next('sup');
  assert.deepEqual(sup.p, [[a.join.seat, 200, 1, 0, 0]], 'not saved: LIVE_SAVE_SUPPORT is off');
  assert.equal(q.get('SELECT COUNT(*) n FROM live_support').n, 0);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const qa = await a.next('q'), qb = await b.next('q'), qh = await h.next('q');
  assert.equal(qa.secs, 20); assert.equal(qb.secs, 10); assert.equal(qh.secs, 10);
  assert.deepEqual(Object.keys(qb).sort(), ['at', 'choices', 'i', 'n', 'q', 'secs', 't'].concat('seen').sort(), 'the broadcast q carries nothing per seat');
  for (const c of [b, h]) assert.ok(!c.msgs.some(m => m.t === 'me' || m.t === 'sup'));
  // After the question's own deadline: only the seat with extra time may still answer.
  s.qz.cur.deadline = Date.now() - 1;
  assert.equal(LS.answer(s, s.seats.get(b.join.seat), { i: 0, c: 0, e: 0 }, Date.now()), false);
  assert.equal(LS.answer(s, s.seats.get(a.join.seat), { i: 0, c: 0, e: 0 }, Date.now()), true);
  // Saved per class with the flag on (class rooms only); loaded when the student takes a seat.
  config.liveSaveSupport = true;
  try {
    LS.setSupport(s, s.seats.get(b.join.seat), { time: 150, save: true });
    assert.deepEqual(q.get('SELECT extra_time, read_aloud, simple FROM live_support WHERE user_id=?', leo.id), { extra_time: 150, read_aloud: 0, simple: 0 });
  } finally { config.liveSaveSupport = false; q.run('DELETE FROM live_support'); }
  close(h, d, a, b);
});

test('support survives a freed seat: a student with extra time but no results yet who drops for over a minute gets it back on rejoin (flag off)', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia);
  LS.setSupport(s, s.seats.get(a.join.seat), { time: 200, read: true });
  close(a); await sleep(60);
  const seat = s.seats.get(a.join.seat);
  assert.ok(seat && !seat.conn);
  seat.leftAt = Date.now() - LS.hooks.holdMs - 1;
  LS.sweep();
  assert.ok(![...s.seats.values()].some(x => x.userId === mia.id), 'the seat was freed');
  const back = await player(s, mia);
  const again = s.seats.get(back.join.seat);
  assert.deepEqual({ time: again.acc.time, read: again.acc.read }, { time: 200, read: true }, 'extra time and read aloud kept');
  assert.deepEqual(back.wel.me.acc, { time: 200, read: true, simple: false });
  assert.equal(q.get('SELECT COUNT(*) n FROM live_support').n, 0, 'nothing stored');
  close(h, back);
});

test('the linger: players get the end at once and stay connected; bye after lingerMs; the snapshot is wiped', async () => {
  LS.hooks.lingerMs = 250;
  try {
    const s = open(teacher, { mode: 'battle', items: items(1), audience: 'open' });
    const h = await hostSocket(s, teacher);
    const a = await player(s);
    h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' });
    await a.next('q');
    h.send({ t: 'h', a: 'end' });
    await a.next('ph', m => m.phase === 'ended'); await a.next('you', m => m.of);
    await h.next('res');
    assert.ok(s.again && s.again.seats.length === 1); assert.equal(LS.lingering(s), 1);
    assert.ok(!a.msgs.some(m => m.t === 'bye'), 'still connected');
    a.send({ t: 'em', e: 0 }); a.send({ t: 'ev', k: 'pick', d: 1 });   // dropped: the session has ended
    const bye = await a.next('bye', null, 1500);
    assert.equal(bye.why, 'ended');
    assert.equal(s.again, null); assert.equal(LS.lingering(s), 0);
    close(h, a);
  } finally { LS.hooks.lingerMs = 0; }
});

test('play again with the same players and teams: join checks re-run, nicknames and teams carried, a removed player never; again only to its own seat', async () => {
  LS.hooks.lingerMs = 5000;
  try {
    const s = open(teacher, { mode: 'battle', items: items(1), audience: 'open' });
    const h = await hostSocket(s, teacher);
    const a = await player(s), b = await player(s), c = await player(s);
    h.send({ t: 'tm', a: 'on', n: 2 }); await a.next('tms', m => m.on);
    h.send({ t: 'h', a: 'kick', n: c.join.seat }); await c.next('bye');
    const before = [a, b].map(p => ({ nick: s.seats.get(p.join.seat).nick, team: s.seats.get(p.join.seat).team }));
    h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
    await a.next('q');
    h.send({ t: 'h', a: 'end' }); await h.next('res');
    assert.equal(s.again.seats.length, 2, 'the removed seat was freed at removal');
    const page = await call(`/live/results/${s.id}`, { user: teacher });
    assert.match(page.text, /id="lv-play-again"/);
    const r = await call('/api/live/sessions', { method: 'POST', body: { again: s.id }, user: teacher });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.moved, 2);
    const ns = LS.get(r.json.sid);
    const ga = await a.next('again'), gb = await b.next('again');
    assert.equal(ga.sid, ns.id); assert.notEqual(ga.tok, gb.tok, 'each its own token');
    assert.ok(!h.msgs.some(m => m.t === 'again'));
    const seats = [...ns.seats.values()];
    assert.deepEqual(seats.map(x => ({ nick: x.nick, team: x.team })).sort((x, y) => x.nick - y.nick), before.sort((x, y) => x.nick - y.nick));
    assert.equal(ns.teams.on, true); assert.equal(ns.phase, 'lobby');
    // The players come in with their new token.
    const na = socket(); const wel = await na.hello(ga.tok);
    assert.equal(wel.role, 'player'); assert.equal(wel.teams.on, true);
    assert.equal((await call('/api/live/sessions', { method: 'POST', body: { again: s.id }, user: teacher })).json.code, 'againGone');
    close(h, a, b, na);
  } finally { LS.hooks.lingerMs = 0; }
});

test('play the missed questions again; play again with these teams (a saved class run); the results page is split', async () => {
  const s = open(teacher, { mode: 'battle', items: items(3), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'tm', a: 'on', n: 2 }); await a.next('tms', m => m.on);
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  for (let i = 0; i < 3; i++) {
    const qm = await a.next('q', m => m.i === i);
    a.send({ t: 'an', i, c: yes(qm), e: 0 }); b.send({ t: 'an', i, c: i === 1 ? no(qm) : yes(qm), e: 0 });
    const ph = await h.next('ph', m => m.phase === 'between' && m.seq > (s.seq - 3));
    h.send({ t: 'h', a: 'next', at: ph.seq });
  }
  await a.next('bye');
  // The results page: the class-safe part has no student names; "Student details" is closed.
  const page = await call(`/live/results/${s.id}`, { user: teacher });
  const [safe, details] = page.text.split('<details class="lv-group lv-details"');
  assert.ok(!safe.includes(mia.display_name) && !safe.includes(leo.display_name), 'no student names in the class-safe part');
  assert.ok(details.startsWith(' id="lv-details">'), 'closed by default');
  assert.ok(details.includes(mia.display_name));
  assert.match(safe, /id="lv-team-podium"/); assert.match(safe, /id="lv-hardest"/); assert.match(safe, /id="lv-review"/);
  const csv = await call(`/live/results/${s.id}.csv`, { user: teacher });
  assert.match(csv.text, /^rank,student,team,score,bonus,correct,answered,q1,q2,q3\r\n/);
  assert.match(csv.text, /question,right,answered,choice_a/);
  // Missed: question 2 only.
  const m = await call('/api/live/sessions', { method: 'POST', body: { fromRun: s.id, only: 'missed' }, user: teacher });
  assert.equal(m.status, 200, m.text);
  const ms = LS.get(m.json.sid);
  assert.deepEqual(ms.items.map(x => x.q), ['Q2: pick yes']); assert.equal(ms.teams.on, true);
  LS.endSession(ms.id);
  // Play again with these teams, from the saved run (after the in-memory copy is gone).
  LS._all().delete(s.id);
  const again = await call('/api/live/sessions', { method: 'POST', body: { againRun: s.id }, user: teacher });
  assert.equal(again.status, 200, again.text);
  const as = LS.get(again.json.sid);
  assert.equal(as.teams.on, true); assert.equal(as.teams.plan.get(mia.id), s.teams ? q.get('SELECT team FROM live_run_scores WHERE run_id=? AND user_id=?', s.id, mia.id).team : 0);
  const a3 = await player(as, mia);
  assert.equal(as.seats.get(a3.join.seat).team, as.teams.plan.get(mia.id));
  close(h, a, b, a3);
});

test('play again with these teams from a saved run keeps every team number and preset, even teams nobody played on; older runs are renumbered', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'tm', a: 'on', n: 4 }); await a.next('tms', m => m.on && m.n === 4);
  h.send({ t: 'tm', a: 'preset', k: 3, p: 7 }); await a.next('tms', m => m.teams.some(t => t[0] === 3 && t[1] === 7));
  T.move(s, s.seats.get(a.join.seat), 1); T.move(s, s.seats.get(b.join.seat), 3);
  s.teams.list[1].ever = false; s.teams.list[3].ever = false;   // teams 2 and 4: nobody ever played on them
  h.send({ t: 'h', a: 'start' }); a.send({ t: 'rdy' }); b.send({ t: 'rdy' });
  const q0 = await a.next('q'); a.send({ t: 'an', i: 0, c: yes(q0), e: 0 }); b.send({ t: 'an', i: 0, c: no(q0), e: 0 });
  const ph = await h.next('ph', m => m.phase === 'between'); h.send({ t: 'h', a: 'next', at: ph.seq });
  await a.next('bye');
  close(h, a, b);
  LS._all().delete(s.id);
  const again = await call('/api/live/sessions', { method: 'POST', body: { againRun: s.id }, user: teacher });
  assert.equal(again.status, 200, again.text);
  let as = LS.get(again.json.sid);
  assert.equal(as.teams.n, 4); assert.equal(as.teams.presets[2], 7, 'team 3 keeps its preset');
  assert.equal(as.teams.plan.get(mia.id), 1); assert.equal(as.teams.plan.get(leo.id), 3);
  LS.endSession(as.id);
  // A run saved before n and presets were kept: the two teams that played become teams 1 and 2, the plan follows.
  const row = q.get('SELECT teams FROM live_runs WHERE id=?', s.id);
  const old = JSON.parse(row.teams); delete old.n; delete old.presets;
  q.run('UPDATE live_runs SET teams=? WHERE id=?', JSON.stringify(old), s.id);
  const again2 = await call('/api/live/sessions', { method: 'POST', body: { againRun: s.id }, user: teacher });
  as = LS.get(again2.json.sid);
  const ks = old.list.map(t => t.k).sort((x, y) => x - y);
  assert.deepEqual(ks, [1, 3], 'only teams that ever had a member are listed');
  const k3 = ks.indexOf(3) + 1;
  assert.equal(as.teams.n, ks.length); assert.equal(as.teams.presets[k3 - 1], 7, 'the old team 3 keeps its preset');
  assert.equal(as.teams.plan.get(mia.id), 1); assert.equal(as.teams.plan.get(leo.id), k3, 'the plan follows the renumbering');
  LS.endSession(as.id);
});

test('pages and APIs: the dashboard (the host only, no-store), remembered settings, a class\'s saved teams (its teachers), saved support (flag)', async () => {
  const s = open(teacher, { mode: 'battle', items: items(1), audience: 'class', classId: cls.id });
  const dash = await call(`/live/host/${s.id}/dash`, { user: teacher });
  assert.equal(dash.status, 200); assert.equal(dash.headers.get('cache-control'), 'no-store');
  assert.match(dash.text, /id="lv-dash-data"/); assert.match(dash.text, /data-lv-tab="players"/);
  assert.ok(!/\/live\/host\/[^"]*\?/.test(dash.text), 'no token in any address');
  assert.equal((await call(`/live/host/${s.id}/dash`, { user: teacher2 })).status, 404);
  assert.equal((await call(`/live/host/${s.id}/dash`, { user: mia })).status, 404);
  assert.equal((await call(`/live/host/${s.id}/dash`)).status, 302, 'signed out: sign in');
  const host = await call(`/live/host/${s.id}`, { user: teacher });
  assert.match(host.text, /id="lv-teams-sheet"/); assert.match(host.text, /data-lv-act="dash"/); assert.match(host.text, /\/live\/host\/[A-Za-z0-9_-]+\/dash/);
  // Prefs.
  q.run('DELETE FROM live_prefs');
  assert.deepEqual((await call('/api/live/prefs', { user: teacher })).json, {});
  await call('/api/live/prefs', { method: 'POST', body: { settings: { secs: 30 }, teams: { on: true, n: 3 } }, user: teacher });
  assert.equal((await call('/api/live/prefs', { user: teacher })).json.teams.n, 3);
  const landing = await call('/live', { user: teacher });
  assert.match(landing.text, /name="secs"/); assert.match(landing.text, /<option value="30" selected>/);
  await call('/api/live/prefs', { method: 'DELETE', user: teacher });
  assert.deepEqual((await call('/api/live/prefs', { user: teacher })).json, {});
  // The class teams editor's API: the class's teachers only.
  const api = `/api/live/classes/${cls.id}/teams`;
  assert.equal((await call(api, { user: teacher2 })).status, 404);
  assert.equal((await call(api, { user: mia })).status, 404);
  const put = await call(api, { method: 'PUT', body: { n: 2, presets: [5, 6], scoring: 'sum', plan: [[mia.id, 2], [leo.id, 1], ['x', 9]] }, user: teacher });
  assert.equal(put.status, 200);
  const got = (await call(api, { user: teacher })).json;
  assert.deepEqual(got.saved.presets, [5, 6]); assert.equal(got.students.length, 2);
  // Use last teams in a class lobby.
  const h = await hostSocket(s, teacher);
  const a = await player(s, mia), b = await player(s, leo);
  h.send({ t: 'tm', a: 'last' });
  const tml = await h.next('tml');
  assert.equal(tml.ok, true); assert.equal(tml.uneven, null);
  assert.equal(s.seats.get(a.join.seat).team, 2); assert.equal(s.teams.scoring, 'sum'); assert.deepEqual(s.teams.presets, [5, 6]);
  assert.equal((await call(api, { method: 'DELETE', user: teacher })).status, 200);
  assert.equal((await call(api, { user: teacher })).json.saved, null);
  // Saved support: 404 with the flag off.
  const sup = `/api/live/classes/${cls.id}/support`;
  assert.equal((await call(sup, { user: teacher })).status, 404);
  config.liveSaveSupport = true;
  try {
    assert.equal((await call(sup, { method: 'POST', body: { userId: mia.id, time: 200, read: true }, user: teacher })).status, 200);
    assert.equal((await call(sup, { method: 'POST', body: { userId: mia.id, time: 300 }, user: teacher })).status, 400);
    assert.equal((await call(sup, { user: teacher2 })).status, 404);
    assert.deepEqual((await call(sup, { user: teacher })).json.support.map(x => [x.userId, x.time, x.read]), [[mia.id, 200, true]]);
    assert.equal((await call(sup, { method: 'DELETE', user: teacher })).json.cleared, 1);
  } finally { config.liveSaveSupport = false; }
  // Saved student data stays deletable on demand after its flag is turned off, and in an archived class.
  q.run('INSERT INTO live_support(class_id, user_id, extra_time, updated_at) VALUES (?,?,200,1)', cls.id, mia.id);
  T.saveClassPlan(cls.id, { n: 2, presets: [0, 1] }, new Map([[mia.id, 1]]), teacher.id);
  const prog = await call(`/class/${cls.id}/progress`, { user: teacher });
  assert.match(prog.text, /id="lv-class-support"/, 'Clear support is offered with the flag off');
  const wasTeams = config.liveTeams;
  S.archiveClass(teacher, cls.id, true);
  config.liveTeams = false;
  try {
    const off = await call(`/class/${cls.id}/progress`, { user: teacher });
    if (off.status === 200) assert.match(off.text, /id="lv-class-teams-off"/, 'Forget saved teams is offered with teams off');
    assert.equal((await call(sup, { method: 'DELETE', user: teacher2 })).status, 404, 'only its teachers');
    assert.equal((await call(sup, { method: 'DELETE', user: teacher })).json.cleared, 1);
    assert.equal((await call(api, { method: 'DELETE', user: teacher })).status, 200);
    assert.equal(q.get('SELECT COUNT(*) n FROM live_support WHERE class_id=?', cls.id).n, 0);
    assert.equal(T.loadClassTeams(cls.id), null);
  } finally { config.liveTeams = wasTeams; S.archiveClass(teacher, cls.id, false); }
  close(h, a, b);
});

test('the frame gets the team presets in its language and never anyone\'s support', async () => {
  const g = publish(teacher, liveHtml(), { title: 'Teams game' });
  const s = open(teacher, { mode: 'game', gameId: g.id, audience: 'open' });
  const a = await player(s);
  LS.setSupport(s, s.seats.get(a.join.seat), { time: 200, read: true });
  const fr = await call(`/live/frame/${a.wel.frame}`);
  assert.equal(fr.status, 200);
  assert.ok(fr.text.includes('teamPresets') && fr.text.includes('#0072B2'), 'presets are in the frame');
  assert.ok(!/"acc"|extra_time|"read":true/.test(fr.text), 'no support in the frame');
  close(a);
});

test('the page never relays support, the play-again token, teacher-only data or the host\'s settings into a game frame', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../public/js/live-common.js', import.meta.url), 'utf8');
  const set = /const PRIVATE = new Set\(\[([^\]]+)\]\)/.exec(src)[1];
  for (const t of ['me', 'again', 'cf', 'dq', 'dp', 'sup', 'tml', 'eyes', 'say']) assert.ok(set.includes(`'${t}'`), t);
  assert.match(src, /const \{ acc, \.\.\.me \} = rest\.me/, 'wel.me.acc is stripped');
});

test('the landing form: flat settings and teams fields; open rooms still lock at start whatever the late-join box says', async () => {
  const r = await call('/api/live/sessions', { method: 'POST', body: { pick: 'mode:battle', set: 'starter:geo', audience: 'open', secs: '20', late: ['0', '1'], shuffleA: ['0'], teams: '3', scoring: 'sum' }, user: teacher });
  assert.equal(r.status, 200, r.text);
  const s = LS.get(r.json.sid);
  assert.equal(s.settings.secs, 20); assert.equal(s.settings.shuffleA, false);
  assert.equal(s.settings.autoLock, true, 'open rooms lock at start');
  assert.equal(s.teams.on, true); assert.equal(s.teams.n, 3); assert.equal(s.teams.scoring, 'sum');
  LS.endSession(s.id);
  const c = await call('/api/live/sessions', { method: 'POST', body: { pick: 'mode:battle', set: 'starter:geo', audience: 'class', classId: cls.id, late: ['0'], teams: '0' }, user: teacher });
  const cs = LS.get(c.json.sid);
  assert.equal(cs.settings.autoLock, true, 'a class room\'s host turned late join off'); assert.equal(cs.teams.on, false);
  LS.endSession(cs.id);
});
