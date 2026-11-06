// Tug of Math Live (built-in mode 'tug', docs/decisions.md "Tug of Math goes live"; protocol: docs/live-protocol.md
// "Tug of Math"), over the real socket: two teams made by the platform (Blue Whales, Red Foxes, even, by average),
// each player's own questions sent to them alone and checked by the server (answers never leave the server, a device's
// score is ignored), uneven teams pulling fairly, wrong, stale, early and malformed answers, pause and resume, the
// line and the clock, the results, team changes a host may and may not make, the landing's options, and 30 players.
import test from 'node:test';
import assert from 'node:assert/strict';
import { reset, open, hostSocket, player, publish, official, liveHtml, teacher, kid, mum, call, sleep, LS, config } from './_live.js';

const TUG = await import('../../server/live/tug.js');
const TG = await import('../../server/services/classlive-tug.js');
const R = await import('../../server/services/classlive-results.js');
const A = await import('../../server/services/classlive-access.js');
const { LIVE_GAMES } = await import('../../server/live/live-games.js');
const { tug } = await import('../../server/live/tug-gen.js');
const { TugGen: G } = tug();

publish(official, liveHtml("live.on('event', () => {});"), { source: 'seed', slug: 'tug-of-math', title: 'Tug of Math' });
TG.hooks.holdMs = 60; TG.hooks.gap = { right: 40, wrong: 80 };

/** Start the match and wait until every player has its first question. -> the tq events in player order */
async function started(s, h, ps) {
  h.send({ t: 'h', a: 'start' });
  await Promise.all(ps.map(p => p.next('ph', m => m.phase === 'loading')));
  for (const p of ps) p.send({ t: 'rdy', view: '2d' });
  return Promise.all(ps.map(p => p.next('ev', m => m.k === 'tq')));
}
const seatOf = p => p.wel.seat;
const answerOf = (s, p) => s.tug.per.get(seatOf(p)).q.a;
const qOf = (s, p) => s.tug.per.get(seatOf(p)).q;
const ans = (p, i, v) => p.send({ t: 'ev', k: 'ans', d: { i, v }, to: 'host' });
/** Answer the open question right and wait for the result and the next question. */
async function right(s, p) {
  const q = qOf(s, p);
  ans(p, q.n, q.a);
  const r = await p.next('ev', m => m.k === 'tr' && m.d.i === q.n);
  await p.next('ev', m => m.k === 'tq' && m.d.i === q.n + 1);
  await sleep(TG.hooks.gap.right + 5);
  return r;
}

test('the starter, the mode and its place on the site', () => {
  assert.deepEqual(TUG.parseId('tug:7:0'), { grade: 7, len: 0 });
  assert.deepEqual(TUG.parseId('tug:1:120'), { grade: 1, len: 120 });
  for (const bad of ['tug:9:90', 'tug:0:90', 'tug:3:45', 'tug:3', 'wyr:mix:5:15', '', null]) assert.equal(TUG.parseId(bad), null, String(bad));
  assert.equal(TUG.makeId({ grade: 8, len: 60 }), 'tug:8:60');
  assert.equal(TUG.makeId({ grade: 12, len: 7 }), 'tug:3:90', 'anything else: the default');
  assert.equal(A.MODES.tug, 'tug-of-math');
  assert.ok(A.GAME_MODES.has('tug') && !A.OWN_QUESTIONS.has('tug'));
  assert.deepEqual(A.capacityFor({ mode: 'tug' }), { max: 60, best: [2, 60] });
  assert.deepEqual(LIVE_GAMES['tug-of-math'], { mode: 'tug', solo: 'tug-of-math', play: true });
  assert.deepEqual(TUG.TEAMS, { n: 2, presets: [0, 6], scoring: 'avg' });
});

test('two even teams made for the room; each player gets only their own questions; the server checks every answer', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:3:120', audience: 'open', lang: 'en', teams: { n: 4, scoring: 'sum' } });
  assert.equal(s.quiz, false); assert.equal(s.items, null);
  assert.equal(s.tug.g, 3); assert.equal(s.tug.len, 120);
  assert.equal(s.teams.on, true); assert.equal(s.teams.n, 2, 'always two teams, whatever the landing said');
  assert.deepEqual(s.teams.presets, [0, 6]); assert.equal(s.teams.scoring, 'avg');
  const h = await hostSocket(s, teacher);
  assert.equal(h.wel.state.tug.g, 3); assert.equal(h.wel.state.tug.len, 120);
  const ps = [await player(s, kid), await player(s), await player(s), await player(s), await player(s, mum)];
  const sizes = [1, 2].map(k => [...s.seats.values()].filter(x => x.team === k).length);
  assert.deepEqual(sizes.sort(), [2, 3], 'split evenly as they join');
  const qs = await started(s, h, ps);
  // a question: tokens only, no answer, from the server (f 0), to that player only
  for (const m of qs) { assert.equal(m.f, 0); assert.deepEqual(Object.keys(m.d).sort(), ['e', 'i']); assert.equal(m.d.i, 0); assert.ok(m.d.e.every(x => typeof x === 'number' || /^[a-z]{1,5}$/.test(x))); }
  assert.ok(JSON.stringify(qs[0]).length < 200);
  for (const [k, p] of ps.entries()) assert.equal(p.msgs.filter(m => m.t === 'ev' && m.k === 'tq').length, 1, `player ${k} got only its own question`);
  assert.equal(h.msgs.filter(m => m.t === 'ev').length, 0, 'the projector gets no questions');
  // every player's first question is the same kind (fair), with its own numbers (no copying)
  const kinds = new Set(ps.map(p => qOf(s, p).k)); assert.equal(kinds.size, 1);
  for (const p of ps) assert.equal(G.check(qOf(s, p), answerOf(s, p)), true);
  // the state: the clock runs on the server
  const st = (await h.next('st', m => m.d.tug && m.d.tug.run === 1)).d.tug;
  assert.equal(st.run, 1); assert.ok(st.end > Date.now() + 100e3);
  // a right answer: to that player only, then the next question; the others hear nothing of it
  const before = ps.slice(1).map(p => p.msgs.length);
  const r = await right(s, ps[0]);
  assert.deepEqual(r.d, { i: 0, ok: true });
  const seat0 = s.seats.get(seatOf(ps[0]));
  assert.equal(seat0.correct, 1); assert.equal(seat0.answered, 1); assert.equal(seat0.score, TUG.POINTS);
  for (const [k, p] of ps.slice(1).entries()) assert.ok(p.msgs.slice(before[k]).every(m => !(m.t === 'ev' && (m.k === 'ans' || m.k === 'tr' || m.k === 'tq'))), 'nothing relayed');
  // a wrong answer: the right one comes back (to that player), and the next answer must wait a moment
  const q1 = qOf(s, ps[1]);
  ans(ps[1], q1.n, q1.a + 1);
  const w = await ps[1].next('ev', m => m.k === 'tr');
  assert.deepEqual(w.d, { i: q1.n, ok: false, a: q1.a });
  await ps[1].next('ev', m => m.k === 'tq' && m.d.i === 1);
  const seat1 = s.seats.get(seatOf(ps[1]));
  assert.equal(seat1.correct, 0); assert.equal(seat1.answered, 1); assert.equal(seat1.wrongRun, 1);
  ans(ps[1], 1, qOf(s, ps[1]).a); await sleep(20);
  assert.equal(seat1.answered, 1, 'too soon after a wrong answer: dropped');
  // stale, malformed or text answers: dropped
  await sleep(TG.hooks.gap.wrong);
  ans(ps[1], 0, 5); ans(ps[1], 1, 2.5); ans(ps[1], 1, 'ten'); ps[1].send({ t: 'ev', k: 'ans', d: { i: 1, v: 123456 }, to: 'host' });
  ps[1].send({ t: 'ev', k: 'hello', d: null, to: 'host' });
  await sleep(40);
  assert.equal(seat1.answered, 1);
  // a score or item a device reports is ignored: the server alone scores this game
  ps[2].send({ t: 'sc', n: 99999 }); ps[2].send({ t: 'it', i: 0, ok: true });
  await sleep(40);
  assert.equal(s.seats.get(seatOf(ps[2])).score, 0); assert.equal(s.seats.get(seatOf(ps[2])).correct, 0);
  // "my question again" (a reloaded frame) sends the same open question
  ps[3].send({ t: 'ev', k: 'need', d: null, to: 'host' });
  const again = await ps[3].next('ev', m => m.k === 'tq' && m.d.i === 0);
  assert.equal(JSON.stringify(again.d.e), JSON.stringify(qOf(s, ps[3]).e));
  // Next and Skip do nothing in this mode
  h.send({ t: 'h', a: 'next', at: s.seq }); h.send({ t: 'h', a: 'skip', at: s.seq });
  await sleep(40); assert.equal(s.phase, 'playing');
  for (const c of [h, ...ps]) c.ws.close();
});

test('uneven teams pull fairly: the rope moves by each team\'s average', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:1:120', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const ps = []; for (let k = 0; k < 5; k++) ps.push(await player(s));
  await started(s, h, ps);
  const of = k => ps.filter(p => s.seats.get(seatOf(p)).team === k);
  const big = of(1).length === 3 ? 1 : 2, small = 3 - big;
  assert.equal(of(big).length, 3); assert.equal(of(small).length, 2);
  // every player of both teams answers once: the rope stays in the middle
  for (const p of ps) await right(s, p);
  assert.ok(Math.abs(TG.pos(s)) < 1e-9, `pos ${TG.pos(s)}`);
  assert.ok(Math.abs(s.tug.pull[big] - 1) < 1e-9 && Math.abs(s.tug.pull[small] - 1) < 1e-9);
  assert.deepEqual([s.tug.right[1], s.tug.right[2]].sort(), [2, 3]);
  // one more from one player of the small team pulls further than one from the big team
  await right(s, of(small)[0]); await right(s, of(big)[0]);
  const toward = big === 1 ? -1 : 1;
  assert.ok(Math.sign(TG.pos(s)) === toward, 'the smaller team\'s answer counts for more of its team');
  assert.ok(Math.abs(Math.abs(TG.pos(s)) - (1 / 2 - 1 / 3)) < 1e-9);
  // the shared state carries it, about five times a second at most
  const st = await h.next('st', m => m.d.tug && Math.abs(m.d.tug.pos) > 0.1);
  assert.equal(st.d.tug.n.reduce((a, b) => a + b, 0), 5);
  // team scores: by average (points per player), the same for both teams so far apart from the last two answers
  const ts = await h.next('ts', m => m.s.some(r => r[1] > 0), 6000);
  assert.equal(ts.s.length, 2);
  for (const c of [h, ...ps]) c.ws.close();
});

test('the line wins at once, then the winner shows and the session ends with team results', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:2:0', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  const blue = s.seats.get(seatOf(a)).team === 1 ? a : b;
  for (let k = 0; k < TUG.LINE - 1; k++) await right(s, blue);
  assert.equal(s.tug.done, false);
  const q = qOf(s, blue); ans(blue, q.n, q.a);
  const st = await h.next('st', m => m.d.tug && m.d.tug.win != null);
  assert.equal(st.d.tug.win, 1); assert.equal(st.d.tug.run, 0);
  // answers after the win: dropped; pause: refused
  ans(blue, q.n + 1, 1); h.send({ t: 'h', a: 'pause' }); await sleep(10);
  assert.equal(s.seats.get(seatOf(blue)).answered, TUG.LINE);
  await h.next('ph', m => m.phase === 'ended');
  const sum = R.summary(s);
  assert.equal(sum.mode, 'tug'); assert.equal(sum.scoredBy, 'server');
  assert.equal(sum.teams[0].k, 1); assert.equal(sum.teams[0].rank, 1);
  assert.equal(sum.teams[0].avg, TUG.LINE * TUG.POINTS);
  assert.equal(sum.players[0].correct, TUG.LINE); assert.equal(sum.players[0].score, TUG.LINE * TUG.POINTS);
  assert.equal(sum.settings.tug, 'tug:2:0', 'the grade and length stay with the run (play again)');
  assert.equal(sum.items.length, 0, 'no question review: every player had their own');
  for (const c of [h, a, b]) c.ws.close();
});

test('the clock: pause and resume move it, time up decides by the rope (or a draw)', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:5:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  const end0 = s.tug.endAt;
  h.send({ t: 'h', a: 'pause' });
  const ps = await h.next('st', m => m.d.tug && m.d.tug.run === 0);
  assert.ok(ps.d.tug.left > 55e3 && ps.d.tug.left <= 60e3);
  const q = qOf(s, a); ans(a, q.n, q.a); await sleep(150);
  assert.equal(s.seats.get(seatOf(a)).answered, 0, 'no answers while paused');
  h.send({ t: 'h', a: 'resume' });
  const rs = await h.next('st', m => m.d.tug && m.d.tug.run === 1 && m.d.tug.end > end0);
  assert.ok(rs.d.tug.end - end0 >= 140, 'the end moved by the paused time');
  // time up with the rope in the middle: a draw
  s.tug.endAt = Date.now();
  const st = await h.next('st', m => m.d.tug && m.d.tug.win != null);
  assert.equal(st.d.tug.win, 0);
  await h.next('ph', m => m.phase === 'ended');
  for (const c of [h, a, b]) c.ws.close();
});

test('a late joiner goes to the smaller team and gets a question; teams stay two, by average', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:8:90', audience: 'class', classId: (await import('./_live.js')).cls.id, lang: 'en' });
  assert.equal(s.settings.autoLock, false, 'class rooms let late joiners in');
  const h = await hostSocket(s, teacher);
  const { mia, leo } = await import('./_live.js');
  const m = await player(s, mia);
  // teams the host may not change here: the count, presets, scoring, players choosing, no team, the class's saved teams
  for (const tm of [{ a: 'count', n: 3 }, { a: 'off' }, { a: 'scoring', v: 'sum' }, { a: 'preset', k: 1, p: 3 }, { a: 'choose', v: true }, { a: 'move', s: seatOf(m), k: 0 }, { a: 'last' }]) h.send({ t: 'tm', ...tm });
  await sleep(60);
  assert.equal(s.teams.n, 2); assert.equal(s.teams.scoring, 'avg'); assert.deepEqual(s.teams.presets, [0, 6]); assert.equal(s.teams.choose, false);
  assert.ok(s.seats.get(seatOf(m)).team >= 1);
  // ...but may move a player to the other team, balance and lock
  const was = s.seats.get(seatOf(m)).team;
  h.send({ t: 'tm', a: 'move', s: seatOf(m), k: 3 - was }); await sleep(30);
  assert.equal(s.seats.get(seatOf(m)).team, 3 - was);
  await started(s, h, [m]);
  assert.ok(G.needsMinus(8));
  const l = await player(s, leo);
  l.send({ t: 'rdy', view: '2d' });
  const q = await l.next('ev', x => x.k === 'tq');
  assert.equal(q.d.i, 0);
  assert.notEqual(s.seats.get(seatOf(l)).team, s.seats.get(seatOf(m)).team, 'the smaller team');
  // a class run keeps the scores but never overwrites the class's own saved teams
  h.send({ t: 'h', a: 'end' });
  await h.next('ph', x => x.phase === 'ended');
  const { q: dbq } = await import('./_live.js');
  assert.equal(dbq.get('SELECT COUNT(*) AS n FROM live_class_teams WHERE class_id=?', s.classId).n, 0);
  assert.equal(dbq.get('SELECT scored_by FROM live_runs WHERE id=?', s.id).scored_by, 'server');
  for (const c of [h, m, l]) c.ws.close();
});

test('with teams switched off on the server, Tug of Math Live is not offered and cannot open', async () => {
  reset();
  config.liveTeams = false;
  try {
    const r = LS.createSession(teacher, { mode: 'tug', audience: 'open' });
    assert.deepEqual(r, { ok: false, code: 'tugTeams' });
    const page = await call('/live', { user: teacher });
    assert.doesNotMatch(page.text, /value="mode:tug"/);
  } finally { config.liveTeams = true; }
});

test('the landing offers it with a grade and a length; the form makes the right room; play again keeps them', async () => {
  reset();
  const page = await call('/live', { user: teacher });
  for (const re of [/value="mode:tug"/, /id="lv-tug-opts"/, /name="tugGrade"/, /<option value="7">Grade 7<\/option>/, /name="tugLen"/, /<option value="0">To the line/, /id="lv-tug-samples"/, /id="lv-teams-landing"/]) assert.match(page.text, re);
  const r = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { pick: 'mode:tug', tugGrade: '7', tugLen: '0', audience: 'open', set: 'bank', teams: '0' } });
  assert.equal(r.status, 200, r.text);
  const s = LS.get(r.json.sid);
  assert.equal(s.mode, 'tug'); assert.equal(s.tug.id, 'tug:7:0'); assert.equal(s.setId, null); assert.equal(s.items, null);
  assert.equal(s.teams.on, true, 'teams on even when the landing said none');
  // a lesson's link can preselect it
  const pre = await call('/live?starter=tug:4:60', { user: teacher });
  assert.match(pre.text, /data-own-mode="tug" data-preset="1"/); assert.match(pre.text, /<option value="4" selected>Grade 4/); assert.match(pre.text, /<option value="60" selected>/);
  // the host page has no Next or Skip, and its team box says the teams are made for the room
  const host = await call(`/live/host/${s.id}`, { user: teacher });
  assert.doesNotMatch(host.text, /data-lv-act="next"/); assert.doesNotMatch(host.text, /data-lv-act="skip"/);
  assert.match(host.text, /id="lv-teams-tug"/);
  // the game page: join, host, and play it here (vs the computer or two players)
  const g = await call('/g/tug-of-math', { user: teacher });
  assert.match(g.text, /href="\/live\?mode=tug" id="hostlive"/); assert.match(g.text, /href="\/play\/tug-of-math" id="playbtn">▶ Play vs the computer or 2 players/);
  // "play the missed ones" makes no sense here
  const miss = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { fromRun: s.id } });
  assert.notEqual(miss.status, 200);
  // play again with the same players keeps the grade and length
  const h = await hostSocket(s, teacher), p1 = await player(s), p2 = await player(s);
  await started(s, h, [p1, p2]);
  LS.hooks.lingerMs = 2000;
  try {
    h.send({ t: 'h', a: 'end' });
    await h.next('res');
    const again = await call('/api/live/sessions', { method: 'POST', user: teacher, body: { again: s.id } });
    assert.equal(again.status, 200, again.text);
    const ns = LS.get(again.json.sid);
    assert.equal(ns.mode, 'tug'); assert.equal(ns.tug.id, 'tug:7:0'); assert.equal(ns.seats.size, 2); assert.equal(ns.teams.n, 2);
  } finally { LS.hooks.lingerMs = 0; }
  for (const c of [h, p1, p2]) c.ws.close();
});

test('30 players: everyone has their own questions, the state stays small, the rope keeps up', async () => {
  reset();
  const s = open(teacher, { mode: 'tug', starter: 'tug:4:120', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const ps = []; for (let k = 0; k < 30; k++) ps.push(await player(s));
  const qs = await started(s, h, ps);
  assert.equal(qs.length, 30);
  assert.deepEqual([1, 2].map(k => [...s.seats.values()].filter(x => x.team === k).length), [15, 15]);
  // each answers three right, all at once
  for (let round = 0; round < 3; round++) {
    await Promise.all(ps.map(async p => { const q = qOf(s, p); ans(p, q.n, q.a); await p.next('ev', m => m.k === 'tr' && m.d.i === q.n); }));
    await sleep(TG.hooks.gap.right + 10);
  }
  assert.ok([...s.seats.values()].every(x => x.correct === 3));
  assert.ok(Math.abs(s.tug.pull[1] - 3) < 1e-9 && Math.abs(s.tug.pull[2] - 3) < 1e-9);
  await sleep(250);
  const sts = h.msgs.filter(m => m.t === 'st' && m.d.tug);
  assert.ok(sts.every(m => JSON.stringify(m).length < 300), 'a small state');
  assert.ok(sts.length < 40, `the rope is sent at most ~5 times a second (${sts.length})`);
  assert.ok(s.stateBytes < 400);
  assert.ok(ps.every(p => p.msgs.filter(m => m.t === 'ev').every(m => m.k === 'tq' || m.k === 'tr')), 'players only ever get their own question and result');
  for (const c of [h, ...ps]) c.ws.close();
});
