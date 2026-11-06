// Doodle Hoot Live (built-in mode 'doodle', docs/decisions.md "Doodle Hoot"; protocol: docs/live-protocol.md "Doodle Hoot
// Live"), over the real socket: who may host (a grown-up with billing off, a teacher; never a kid, a guest or a banned
// account), two players to start, the turn order, the drawer's three words (to them alone), strokes relayed from memory
// to everyone else and the projector (never back to the drawer, never to a dashboard) and checked on the way, undo and
// clear, trays and guesses (tray positions, checked on the server), hints, points, a late joiner and a reload getting the
// page replayed, the host's Clear drawing, Skip turn and Remove, the hide vote, waiting for players, the end, and that
// nothing of a drawing or a word is kept, logged or sent anywhere else.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { reset, open, hostSocket, player, publish, official, liveHtml, teacher, kid, mum, call, sleep, LS, logs, auth, socket, cookieFor } from './_live.js';

const DD = await import('../../server/live/doodle.js');
const DG = await import('../../server/services/classlive-doodle.js');
const A = await import('../../server/services/classlive-access.js');
const R = await import('../../server/services/classlive-results.js');
const P = await import('../../server/services/classlive-protocol.js');
const { LIVE_GAMES } = await import('../../server/live/live-games.js');
const { doodle } = await import('../../server/live/doodle-core.js');
const { billingOn } = await import('../../server/services/stripe.js');
const { DoodleCore: C } = doodle();

publish(official, liveHtml("live.on('event', () => {});"), { source: 'seed', slug: 'doodle-hoot', title: 'Doodle Hoot' });
Object.assign(DG.hooks, { pickMs: 400, revealMs: 150, holdMs: 120, graceMs: 300, waitMs: 500, gapMs: 40, drawMs: 20000, reloadMs: 80 });
// (a long turn, so no hint lands between working out a guess and sending it; the hints test sets a short one)

const seatOf = c => c.wel.seat;
const ev = (c, k, d) => c.send({ t: 'ev', k, d, to: 'host' });
const evs = (c, k) => c.msgs.filter(m => m.t === 'ev' && m.k === k);
const dd = s => s.doodle;
/** Start the game and wait for the first turn's pick. -> the ch the drawer got */
async function started(s, h, ps) {
  h.send({ t: 'h', a: 'start' });
  await Promise.all(ps.map(p => p.next('ph', m => m.phase === 'loading')));
  for (const p of ps) p.send({ t: 'rdy', view: '2d' });
  await h.next('st', m => m.d.dd && m.d.dd.ph === 'pick');
  return dd(s);
}
/** The drawer picks word 0 and the drawing starts. -> the word */
async function picked(s, drawer, others) {
  const ch = await drawer.next('ev', m => m.k === 'ch' && m.d.n === dd(s).tn);
  ev(drawer, 'pk', { n: ch.d.n, i: 0 });
  await drawer.next('ev', m => m.k === 'wd' && m.d.n === ch.d.n);
  await Promise.all(others.map(o => o.next('ev', m => m.k === 'tray' && m.d.n === ch.d.n)));
  return ch.d.w[0];
}
/** The tray positions that spell the word (hints included). */
function spell(s, seat) {
  const x = dd(s), used = new Set(), picks = [];
  const locks = Object.fromEntries(x.hints.map(h => [h.i, h.t]));
  for (const [i, g] of x.word.g.entries()) {
    if (locks[i] != null) { picks.push(locks[i]); used.add(locks[i]); continue; }
    const k = x.tray.findIndex((t, j) => t === g && !used.has(j) && !Object.values(locks).includes(j));
    picks.push(k); used.add(k);
  }
  void seat; return picks;
}

test('the starter, the mode, its size and its place on the site', () => {
  assert.equal(A.MODES.doodle, 'doodle-hoot');
  assert.ok(A.GAME_MODES.has('doodle') && !A.OWN_QUESTIONS.has('doodle') && A.TURN_MODES.has('doodle'));
  assert.deepEqual(A.capacityFor({ mode: 'doodle' }), { max: 16, best: [3, 10] });
  assert.deepEqual(LIVE_GAMES['doodle-hoot'], { mode: 'doodle', solo: 'doodle-hoot', play: true, playKey: 'live.doodleUi.play' });
  assert.equal(P.HOST_ACTIONS.at(-1), 'clear', 'appended at the end');
  assert.deepEqual(P.parse(JSON.stringify({ t: 'h', a: 'clear', x: 1 }), 'host'), { t: 'h', a: 'clear' }, 'no fields');
});

test('who may host: a grown-up with billing off, a teacher; never a kid, a guest or a banned grown-up', async () => {
  reset();
  assert.equal(billingOn(), false, 'billing is off here');
  const g = open(mum, { mode: 'doodle', starter: 'doodle:fr:2:1:60', audience: 'open', lang: 'fr' });
  assert.equal(g.mode, 'doodle'); assert.equal(g.quiz, false); assert.equal(g.items, null);
  assert.deepEqual([g.doodle.lang, g.doodle.lvl, g.doodle.rds, g.doodle.secs], ['fr', 2, 1, 60]);
  assert.equal(g.settings.maxPlayers, 16, 'a turns game holds 16 at most');
  assert.equal(g.teams.on, false, 'no teams');
  LS.endSession(g.id);
  const tch = open(teacher, { mode: 'doodle', audience: 'open', teams: { n: 3 } });
  assert.equal(tch.doodle.id, DD.DEFAULT_ID); assert.equal(tch.teams.on, false);
  LS.endSession(tch.id);
  assert.equal(LS.createSession(kid, { mode: 'doodle', audience: 'open' }).code, 'notHost');
  const guest = auth.createUser({ username: 'DoodleGuest', password: 'secret123' }); guest.is_guest = 1;
  assert.equal(LS.createSession(guest, { mode: 'doodle', audience: 'open' }).code, 'notHost');
  const banned = { ...mum, banned: 1 };
  assert.equal(LS.createSession(banned, { mode: 'doodle', audience: 'open' }).code, 'notHost');
  assert.equal(LS.createSession(mum, { mode: 'doodle', audience: 'family' }).code, 'noFamily', 'family rooms need families on');
  // through the API: the landing's fields become the starter
  const r = await call('/api/live/sessions', { method: 'POST', user: mum, body: { pick: 'mode:doodle', audience: 'open', doodleLang: 'he', doodleLevel: '3', doodleRounds: '1', doodleSecs: '100', replace: true } });
  assert.equal(r.status, 200, r.text);
  const s = LS.hostSession(mum.id);
  assert.equal(s.doodle.id, 'doodle:he:3:1:100'); assert.equal(s.doodle.dir, 'rtl');
  const k = await call('/api/live/sessions', { method: 'POST', user: kid, body: { pick: 'mode:doodle', audience: 'open' } });
  assert.notEqual(k.status, 200);
});

test('a full turn: words to the drawer alone, strokes relayed and checked, guesses on the server, points', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s, kid);
  h.send({ t: 'rdy', view: '3d' });
  const x = await started(s, h, [a, b, c]);
  assert.equal(x.rd, 1); assert.equal(x.tn, 1); assert.equal(x.dr, seatOf(a), 'the first to join draws first');
  assert.deepEqual(x.order, [seatOf(a), seatOf(b), seatOf(c)]);
  // the three words go to the drawer only; nobody else (the projector neither) sees a word
  const ch = await a.next('ev', m => m.k === 'ch');
  assert.equal(ch.f, 0); assert.equal(ch.d.w.length, 3); assert.equal(new Set(ch.d.w).size, 3); assert.equal(ch.d.e.length, 3);
  for (const o of [b, c, h]) assert.equal(evs(o, 'ch').length, 0);
  assert.ok(!JSON.stringify(h.msgs).includes(`"${ch.d.w[0]}"`) && !JSON.stringify(b.msgs).includes(`"${ch.d.w[1]}"`));
  // a pick from someone else, or for another turn, is dropped
  ev(b, 'pk', { n: 1, i: 0 }); ev(a, 'pk', { n: 2, i: 0 }); ev(a, 'pk', { n: 1, i: 5 });
  await sleep(40); assert.equal(dd(s).ph, 'pick');
  ev(a, 'pk', { n: 1, i: 1 });
  const wd = await a.next('ev', m => m.k === 'wd');
  assert.equal(wd.d.w, ch.d.w[1]); assert.equal(wd.d.s0, 0);
  const tb = await b.next('ev', m => m.k === 'tray'), tc = await c.next('ev', m => m.k === 'tray');
  assert.deepEqual(tb.d.t, tc.d.t, 'everyone gets the same tray'); assert.equal(evs(a, 'tray').length, 0, 'never the drawer');
  assert.equal(tb.d.t.length, dd(s).tray.length); assert.deepEqual(tb.d.g, dd(s).word.groups);
  const st = await h.next('st', m => m.d.dd && m.d.dd.ph === 'draw');
  assert.equal(st.d.dd.rv, null); assert.ok(!JSON.stringify(st).includes(`"${wd.d.w}"`), 'the shared state never has the word while drawing');
  // a stroke: relayed once to the others and the projector, never back to the drawer
  ev(a, 'ln', { s: 0, c: 3, w: 1, e: 0, p: [100, 100, 10, 0, 10, 5] });
  const lb = await b.next('ev', m => m.k === 'ln'), lh = await h.next('ev', m => m.k === 'ln');
  assert.deepEqual(lb.d, { s: 0, c: 3, w: 1, e: 0, a: [100, 100, 110, 100, 120, 105] }); assert.equal(lb.f, seatOf(a)); assert.deepEqual(lh.d, lb.d);
  ev(a, 'ln', { s: 0, c: 3, w: 1, e: 0, p: [5, 5, -127, 0] });
  const cont = await c.next('ev', m => m.k === 'ln' && m.d.k === 1);
  assert.deepEqual(cont.d.a, [125, 110, 0, 110], 'a continuation, clamped at the edge');
  await sleep(30); assert.equal(evs(a, 'ln').length, 0);
  // dropped: someone else's stroke, a bad colour, size, eraser or key, an odd p, too many numbers, a big step, an old id
  const before = dd(s).drops;
  ev(b, 'ln', { s: 1, c: 0, w: 0, e: 0, p: [1, 1] });
  for (const bad of [{ s: 1, c: 12, w: 0, e: 0, p: [1, 1] }, { s: 1, c: 0, w: 4, e: 0, p: [1, 1] }, { s: 1, c: 0, w: 0, e: 2, p: [1, 1] }, { s: 1, c: 0, w: 0, e: 0, p: [1, 1], x: 1 },
    { s: 1, c: 0, w: 0, e: 0, p: [1, 1, 2] }, { s: 1, c: 0, w: 0, e: 0, p: Array(62).fill(1) }, { s: 1, c: 0, w: 0, e: 0, p: [1, 1, 128, 0] }, { s: 1, c: 0, w: 0, e: 0, p: [1001, 1] },
    { s: 40, c: 0, w: 0, e: 0, p: [1, 1] }, { s: 0, c: 0, w: 0, e: 0, p: [1, 1] }, { s: 1, c: 0, w: 0, e: 0, p: [1.5, 1] }]) ev(a, 'ln', bad);
  await sleep(60);
  assert.equal(dd(s).canvas.length, 1); assert.equal(dd(s).drops - before, 12);
  assert.equal(evs(b, 'ln').length + evs(c, 'ln').length, 4, 'the two good messages, to each of the two');
  await sleep(1200);   // (the socket's own limit: 10 events a second, a burst of 20; let it refill)
  // undo removes the last stroke on every screen; clear the page
  ev(a, 'ln', { s: 1, c: 0, w: 2, e: 0, p: [500, 300, 3, 3] });
  await b.next('ev', m => m.k === 'ln' && m.d.s === 1);
  ev(a, 'un', { n: 1, s: 0 }); await sleep(30); assert.equal(dd(s).canvas.length, 2, 'only the last stroke can be undone');
  ev(a, 'un', { n: 1, s: 1 });
  assert.deepEqual((await b.next('ev', m => m.k === 'un')).d, { n: 1, s: 1 });
  assert.equal(dd(s).canvas.length, 1); assert.equal(dd(s).points, 5);
  // guesses: a wrong one to that player alone; a right one (tray positions, never text)
  const right = spell(s, b), wrong = [...right];
  wrong[0] = dd(s).decoys[0];   // a decoy is never a letter of the word
  ev(b, 'gs', { n: 1, t: wrong });
  const gr0 = await b.next('ev', m => m.k === 'gr');
  assert.equal(gr0.d.ok, false); assert.equal(evs(c, 'gr').length, 0);
  ev(b, 'gs', { n: 1, t: right }); await sleep(10);
  assert.equal(dd(s).got.length, 0, 'too soon after the last guess');
  await sleep(DG.hooks.gapMs + 10);
  ev(a, 'gs', { n: 1, t: right }); ev(b, 'gs', { n: 1, t: 'cat' }); ev(b, 'gs', { n: 1, t: right.map(String) });
  await sleep(DG.hooks.gapMs + 10);
  ev(b, 'gs', { n: 1, t: right });
  const gr1 = await b.next('ev', m => m.k === 'gr' && m.d.ok);
  assert.ok(gr1.d.p >= 50 && gr1.d.p <= 120);
  assert.equal((await b.next('ev', m => m.k === 'wd')).d.w, wd.d.w, 'a guesser who got it sees the word');
  const got = await c.next('st', m => m.d.dd && m.d.dd.got.length === 1);
  assert.deepEqual(got.d.dd.got, [seatOf(b)]); assert.ok(!JSON.stringify(c.msgs).includes(`"${wd.d.w}"`), 'the others see only who');
  const sb = s.seats.get(seatOf(b));
  assert.equal(sb.score, gr1.d.p); assert.equal(sb.correct, 1);
  // a score or item a device reports is ignored
  c.send({ t: 'sc', n: 9999 }); c.send({ t: 'it', i: 0, ok: true }); await sleep(30);
  assert.equal(s.seats.get(seatOf(c)).score, 0);
  // the last guesser gets it: the turn ends at once, the word shows in the reveal, the drawer scores by share
  ev(c, 'gs', { n: 1, t: spell(s, c) });
  const rv = await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal');
  assert.equal(rv.d.dd.rv.w, wd.d.w); assert.equal(rv.d.dd.rv.why, 'all');
  assert.equal(s.seats.get(seatOf(a)).score, 120, 'everyone guessed: 120 for the drawer');
  assert.equal(sb.answered, 1);
  // then the next turn: a clean page, the next drawer
  const t2 = await h.next('st', m => m.d.dd && m.d.dd.tn === 2);
  assert.equal(t2.d.dd.dr, seatOf(b)); assert.equal(t2.d.dd.ph, 'pick');
  assert.equal(dd(s).canvas.length, 0, 'the page is wiped at the end of a turn');
  for (const p of [a, b, c, h]) p.ws.close();
});

test('replay from memory: a late joiner, a reloaded drawer and the projector get the page so far', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  await picked(s, a, [b]);
  for (let i = 0; i < 5; i++) ev(a, 'ln', { s: i, c: i, w: 1, e: 0, p: [100 + i * 50, 100, 5, 5, 5, 5] });
  await sleep(80);
  assert.equal(dd(s).canvas.length, 5);
  // a late joiner (the host lets people in)
  h.send({ t: 'h', a: 'unlock' }); await sleep(30);
  const c = await player(s);
  c.send({ t: 'rdy', view: '2d' });
  const tray = await c.next('ev', m => m.k === 'tray'), cv = await c.next('ev', m => m.k === 'cv');
  assert.deepEqual(tray.d.t, dd(s).tray);
  assert.equal(cv.d.k, 0); assert.equal(cv.d.of, 1); assert.equal(cv.d.l.length, 5);
  assert.deepEqual(cv.d.l[2], [2, 2, 1, 0, 200, 100, 205, 105, 210, 110]);
  assert.ok(dd(s).order.includes(seatOf(c)), 'the late joiner draws this round');
  // the drawer reloads: their word and where the stroke ids go on, then the page
  a.ws.close(); await sleep(30);
  const a2 = socket(); await a2.hello(a.join.tok);
  a2.send({ t: 'rdy', view: '2d' });
  const wd = await a2.next('ev', m => m.k === 'wd');
  assert.equal(wd.d.s0, 5); assert.equal(wd.d.w, dd(s).word.w);
  assert.equal((await a2.next('ev', m => m.k === 'cv')).d.l.length, 5);
  ev(a2, 'ln', { s: 5, c: 0, w: 0, e: 0, p: [1, 1] });
  await b.next('ev', m => m.k === 'ln' && m.d.s === 5);
  // the projector's frame loads again
  h.send({ t: 'rdy', view: '3d' });
  assert.equal((await h.next('ev', m => m.k === 'cv')).d.l.length, 6);
  // a big page goes in chunks of at most 12 KB
  // (a full page, made in memory: the socket's own rate limits would take a while)
  for (let i = 6; i < 300; i++) dd(s).canvas.push({ s: i, c: 0, w: 0, e: 0, pts: Array.from({ length: 60 }, (v, k) => (k % 2 ? 300 : 500 + k)) });
  const n = DG.sendCanvas(s, { sendTo: (conn, str) => { assert.ok(str.length < 13 * 1024); return true; }, toProjector: () => true }, s.seats.get(seatOf(b)));
  assert.ok(n >= 2, `${n} chunks`);
  for (const p of [a2, b, c, h]) p.ws.close();
});

test('the host: Clear drawing everywhere, Skip turn by its number, Remove the drawer; pause drops strokes', async () => {
  reset();
  const s = open(mum, { mode: 'doodle', starter: 'doodle:en:1:2:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, mum);
  const a = await player(s), b = await player(s), c = await player(s);
  await started(s, h, [a, b, c]);
  await picked(s, a, [b, c]);
  ev(a, 'ln', { s: 0, c: 0, w: 0, e: 0, p: [10, 10, 1, 1] }); await b.next('ev', m => m.k === 'ln');
  h.send({ t: 'h', a: 'clear' });
  for (const p of [a, b, c, h]) assert.equal((await p.next('ev', m => m.k === 'cl')).f, 0);
  assert.equal(dd(s).canvas.length, 0);
  // pause: strokes and guesses are dropped
  h.send({ t: 'h', a: 'pause' }); await a.next('ph', m => m.phase === 'paused');
  ev(a, 'ln', { s: 1, c: 0, w: 0, e: 0, p: [10, 10] }); await sleep(30);
  assert.equal(dd(s).canvas.length, 0);
  h.send({ t: 'h', a: 'resume' }); await a.next('ph', m => m.phase === 'playing');
  ev(a, 'ln', { s: 1, c: 0, w: 0, e: 0, p: [10, 10] }); await b.next('ev', m => m.k === 'ln' && m.d.s === 1);
  // skip: a stale turn number does nothing, the current one skips (no points for the drawer)
  h.send({ t: 'h', a: 'skip', at: 7 }); await sleep(30); assert.equal(dd(s).ph, 'draw');
  h.send({ t: 'h', a: 'skip', at: 1 });
  const rv = await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal');
  assert.equal(rv.d.dd.rv.why, 'skip'); assert.equal(s.seats.get(seatOf(a)).score, 0);
  // turn 2: b draws; the host removes b, so the turn ends and the page is wiped everywhere
  await h.next('st', m => m.d.dd && m.d.dd.tn === 2);
  await picked(s, b, [a, c]);
  ev(b, 'ln', { s: 0, c: 0, w: 0, e: 0, p: [10, 10] }); await a.next('ev', m => m.k === 'ln' && m.f === seatOf(b));
  h.send({ t: 'h', a: 'kick', n: seatOf(b) });
  const end = await h.next('st', m => m.d.dd && m.d.dd.tn === 2 && m.d.dd.ph === 'reveal');
  assert.equal(end.d.dd.rv.why, 'gone');
  await a.next('ev', m => m.k === 'cl' && m.f === 0);
  assert.ok(!dd(s).order.includes(seatOf(b)) || !s.seats.has(seatOf(b)));
  for (const p of [a, c, h]) p.ws.close();
});

test('hints, a pick that times out, the hide vote, a drawer who leaves, waiting for players', async (tt) => {
  reset();
  DG.hooks.drawMs = 4000; tt.after(() => { DG.hooks.drawMs = 20000; });
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:2:2:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s);
  await started(s, h, [a, b, c]);
  // nobody picks: a word is picked for the drawer
  await a.next('ev', m => m.k === 'ch');
  await b.next('ev', m => m.k === 'tray', 3000);
  assert.equal(dd(s).ph, 'draw');
  // hints over the drawing time: two decoys go, then letters lock in, never more than half; never to the drawer
  const hd = await b.next('ev', m => m.k === 'hd', 4000);
  assert.ok(hd.d.t.length >= 1 && hd.d.t.every(i => dd(s).decoys.includes(i)));
  const hn = await b.next('ev', m => m.k === 'hn', 4000);
  assert.equal(dd(s).tray[hn.d.t], dd(s).word.g[hn.d.i]);
  assert.equal(evs(a, 'hd').length + evs(a, 'hn').length, 0);
  assert.ok(dd(s).hints.length <= Math.floor(dd(s).word.g.length / 2));
  // a guess must keep the hint letters where they are
  // hide: two of the two guessers hide it: the page goes and the turn ends with no drawer points; the host is told
  ev(b, 'hide', { n: dd(s).tn }); ev(b, 'hide', { n: dd(s).tn });
  assert.equal((await h.next('ev', m => m.k === 'hid')).d.k, 1);
  ev(a, 'hide', { n: dd(s).tn });
  ev(c, 'hide', { n: dd(s).tn });
  const rv = await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal');
  assert.equal(rv.d.dd.rv.why, 'hid'); assert.equal(s.seats.get(seatOf(a)).score, 0);
  assert.equal(evs(a, 'hid').length, 0, 'the drawer is never told who');
  // turn 2: b draws, then drops out and doesn't come back: the turn moves on after the grace
  await h.next('st', m => m.d.dd && m.d.dd.tn === 2);
  await picked(s, b, [a, c]);
  b.ws.close();
  const gone = await h.next('st', m => m.d.dd && m.d.dd.tn === 2 && m.d.dd.ph === 'reveal', 3000);
  assert.equal(gone.d.dd.rv.why, 'gone');
  // only one player left: the game waits, then ends
  c.ws.close();
  await h.next('st', m => m.d.dd && m.d.dd.ph === 'wait', 3000);
  await h.next('ph', m => m.phase === 'ended', 4000);
  assert.equal(s.phase, 'ended');
  a.ws.close(); h.ws.close();
});

test('the end: the podium, then the results; nothing of a drawing or a word is kept or logged', async () => {
  reset();
  logs.length = 0;
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  h.send({ t: 'rdy', view: '3d' });
  await started(s, h, [a, b]);
  const w1 = await picked(s, a, [b]);
  ev(a, 'ln', { s: 0, c: 3, w: 1, e: 0, p: [123, 321, 4, 4] });
  await b.next('ev', m => m.k === 'ln');
  ev(b, 'gs', { n: 1, t: spell(s, b) });
  await h.next('st', m => m.d.dd && m.d.dd.tn === 2);
  const w2 = await picked(s, b, [a]);
  ev(a, 'gs', { n: 2, t: spell(s, a) });
  const done = await h.next('st', m => m.d.dd && m.d.dd.ph === 'done', 3000);
  assert.equal(done.d.dd.top.length, 2);
  assert.ok(done.d.dd.top[0][1] >= done.d.dd.top[1][1]);
  await h.next('ph', m => m.phase === 'ended', 3000);
  assert.equal(s.doodle.canvas.length, 0); assert.equal(s.doodle.word, null); assert.equal(s.doodle.tray, null);
  const sum = s.summary;
  assert.equal(sum.scoredBy, 'server'); assert.equal(sum.settings.doodle, 'doodle:en:1:1:60');
  assert.equal(sum.players[0].rank, 1);
  const kept = JSON.stringify(sum) + JSON.stringify(R.persisted(teacher, s.id) || {});
  for (const w of [w1, w2]) assert.ok(!kept.includes(`"${w}"`), `no word in the results: ${w} in ${kept}`);
  assert.ok(!/123,321|"pts"|"canvas"|"tray"/.test(kept), 'no stroke in the results');
  const logged = JSON.stringify(logs);
  for (const w of [w1, w2]) assert.ok(!logged.includes(`"${w}"`), 'no word in a log');
  assert.ok(!/123,321|"ln"|"pts"/.test(logged), 'no stroke in a log');
  for (const p of [a, b, h]) p.ws.close();
});

test('start needs two players; no teams; a 16-player room relays each stroke fast and small', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s);
  h.send({ t: 'h', a: 'start' });
  assert.equal((await h.next('nak')).why, 'wait');
  assert.equal(s.phase, 'lobby');
  h.send({ t: 'tm', a: 'on', n: 2 }); await sleep(20); assert.equal(s.teams.on, false);
  const ps = [a];
  for (let i = 0; i < 15; i++) ps.push(await player(s));
  const extra = await call('/api/live/join', { method: 'POST', body: { code: s.code } });
  assert.notEqual(extra.status, 200, 'the 17th is refused');
  await started(s, h, ps);
  await picked(s, ps[0], ps.slice(1));
  const t0 = process.hrtime.bigint();
  ev(ps[0], 'ln', { s: 0, c: 0, w: 1, e: 0, p: [500, 300, ...Array(58).fill(-3)] });
  await Promise.all(ps.slice(1).map(p => p.next('ev', m => m.k === 'ln')));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 500, `${ms} ms`);
  const m = evs(ps[1], 'ln')[0];
  assert.ok(JSON.stringify(m).length < 600);
  for (const p of [...ps, h]) p.ws.close();
});

test('static: the room code imports no AI, moderation, screenshot or voice service', () => {
  for (const f of ['server/services/classlive-doodle.js', 'server/live/doodle.js', 'server/live/doodle-core.js']) {
    const src = fs.readFileSync(f, 'utf8');
    const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(x => x[1]);
    for (const i of imports) assert.ok(!/set-ai|lesson-ai|moderation|shots|snapshot|tts|chat|anthropic|stt/.test(i), `${f} imports ${i}`);
    assert.ok(!/\blog\(|hooks\.log/.test(src), `${f} logs nothing`);
  }
  void cookieFor;
});

test('the real game file is live-ready: it draws its own lobby and host view, holds 16 and lists its event words', async () => {
  const { checkHtml } = await import('../../server/services/classlive-lint.js');
  const r = checkHtml(fs.readFileSync('seed-games/doodle-hoot.html', 'utf8'));
  // (the live pack's hash is a test value in this harness, so only the pack check is set aside here)
  assert.deepEqual(r.issues.filter(i => i.code !== 'live_pack'), []);
  assert.equal(r.lobby, true); assert.equal(r.hostView, true); assert.equal(r.maxPlayers, 16);
  assert.deepEqual(r.words, ['pk', 'ln', 'un', 'cl', 'gs', 'hide', 'need']);
});
