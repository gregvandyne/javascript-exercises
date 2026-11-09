// Doodle Hoot Live (built-in mode 'doodle', docs/decisions.md "Doodle Hoot"; protocol: docs/live-protocol.md "Doodle Hoot
// Live"), over the real socket: who may host (a grown-up with billing off, a teacher; never a kid, a guest or a banned
// account), two players to start, the turn order, the drawer's three words (to them alone), strokes relayed from memory
// to everyone else and the projector (never back to the drawer, never to a dashboard) and checked on the way, undo and
// clear, typed guesses (checked on the server and forgotten; only a word of the game's own list ever goes on, to the
// drawer and the projector; a close guess only to its guesser), letter tiles (the host's easier choice: tray positions),
// who said it out loud (the drawer or the host), hints, points, a late joiner and a reload getting the page replayed,
// the host's Clear drawing, Skip turn and Remove, the hide vote, waiting for players, the end, and that nothing of a
// drawing, a word or a guess is kept, logged or sent anywhere else.
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
Object.assign(DG.hooks, { pickMs: 400, revealMs: 150, holdMs: 120, graceMs: 300, waitMs: 500, gapMs: 40, typeGapMs: 40, drawMs: 20000, reloadMs: 80 });
// (a long turn, so no hint lands between working out a guess and sending it; the hints test sets a short one)

const seatOf = c => c.wel.seat;
/** A message (or record) as JSON for the "no word here" checks, without the players' avatars (an object with a species and
 *  a body: a player's "avatar" field, and the one inside a join's "pj" row): an avatar's parts are names from the avatar
 *  maker (body "ball", species "fox"), and a word can be one of them by chance ("ball" is a level-1 word), which made
 *  those checks fail now and then though no word was sent. Every other field is still searched. */
const isAvatar = v => !!v && typeof v === 'object' && !Array.isArray(v) && 'species' in v && 'body' in v;
const words = o => JSON.stringify(o, (k, v) => (isAvatar(v) ? undefined : v));
/** Wait (up to 3 s) until fn() is true. */
async function until(fn, ms = 3000) { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > ms) throw new Error(`timed out: ${fn}`); await sleep(20); } }
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
  assert.equal(s.doodle.id, 'doodle:he:3:1:100'); assert.equal(s.doodle.dir, 'rtl'); assert.equal(s.doodle.tiles, false, 'typing unless the host picks tiles');
  const r2 = await call('/api/live/sessions', { method: 'POST', user: mum, body: { pick: 'mode:doodle', audience: 'open', doodleLang: 'fr', doodleLevel: '1', doodleRounds: '2', doodleSecs: '80', doodleTiles: '1', replace: true } });
  assert.equal(r2.status, 200, r2.text);
  assert.equal(LS.hostSession(mum.id).doodle.id, 'doodle:fr:1:2:80:t'); assert.equal(LS.hostSession(mum.id).doodle.tiles, true);
  const k = await call('/api/live/sessions', { method: 'POST', user: kid, body: { pick: 'mode:doodle', audience: 'open' } });
  assert.notEqual(k.status, 200);
});

test('a full turn (letter tiles): words to the drawer alone, strokes relayed and checked, guesses on the server, points', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60:t', audience: 'open', lang: 'en' });
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
  assert.ok(!words(h.msgs).includes(`"${ch.d.w[0]}"`) && !words(b.msgs).includes(`"${ch.d.w[1]}"`));
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
  assert.equal(st.d.dd.rv, null); assert.ok(!words(st).includes(`"${wd.d.w}"`), 'the shared state never has the word while drawing');
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
  assert.deepEqual(got.d.dd.got, [seatOf(b)]); assert.ok(!words(c.msgs).includes(`"${wd.d.w}"`), 'the others see only who');
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
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:2:2:60:t', audience: 'open', lang: 'en' });
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
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60:t', audience: 'open', lang: 'en' });
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
  assert.equal(sum.scoredBy, 'server'); assert.equal(sum.settings.doodle, 'doodle:en:1:1:60:t');
  assert.equal(sum.players[0].rank, 1);
  const kept = words(sum) + words(R.persisted(teacher, s.id) || {});
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

test('blips: a reload at the end of a reveal never ends the game; a reloading guesser keeps the turn open', async (tt) => {
  reset();
  Object.assign(DG.hooks, { reloadMs: 3000, graceMs: 3000 });
  tt.after(() => Object.assign(DG.hooks, { reloadMs: 80, graceMs: 300 }));
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:2:60:t', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s);
  await started(s, h, [a, b, c]);
  await picked(s, a, [b, c]);
  // b gets it, then c's page reloads: the turn waits for c (it doesn't end as "everyone got it")
  ev(b, 'gs', { n: 1, t: spell(s, b) });
  await b.next('ev', m => m.k === 'gr' && m.d.ok);
  c.ws.close(); await sleep(150);
  assert.equal(dd(s).ph, 'draw', 'still drawing while c reloads');
  const c2 = socket(); await c2.hello(c.join.tok); c2.send({ t: 'rdy', view: '2d' });
  await c2.next('ev', m => m.k === 'tray');
  ev(c2, 'gs', { n: 1, t: spell(s, c2) });
  assert.equal((await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal')).d.dd.rv.why, 'all');
  // everyone's connection drops just as the reveal ends: the game goes on with the next drawer, not to the podium
  for (const p of [a, b, c2]) p.ws.close();
  await h.next('st', m => m.d.dd && m.d.dd.tn === 2, 3000);
  assert.equal(dd(s).done, false); assert.equal(dd(s).rd, 1); assert.equal(dd(s).dr, seatOf(b), 'b draws next, though reloading');
  const b2 = socket(); await b2.hello(b.join.tok); b2.send({ t: 'rdy', view: '2d' });
  assert.equal((await b2.next('ev', m => m.k === 'ch')).d.n, 2, 'the drawer gets their words back');
  h.ws.close(); b2.ws.close();
});

test('the host: Skip wipes the drawing; Remove locks the room and a removed player never stands on the podium', async () => {
  reset();
  const s = open(mum, { mode: 'doodle', starter: 'doodle:en:1:1:60:t', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, mum);
  const a = await player(s), b = await player(s), c = await player(s);
  await started(s, h, [a, b, c]);
  await picked(s, a, [b, c]);
  ev(a, 'ln', { s: 0, c: 0, w: 0, e: 0, p: [10, 10, 1, 1] }); await b.next('ev', m => m.k === 'ln');
  // c gets it (the only points so far), then the host removes c: the room locks, nobody new gets in
  ev(c, 'gs', { n: 1, t: spell(s, c) }); await c.next('ev', m => m.k === 'gr' && m.d.ok);
  h.send({ t: 'h', a: 'unlock' }); await h.next('lk', m => m.locked === false);
  h.send({ t: 'h', a: 'kick', n: seatOf(c) });
  assert.equal((await h.next('lk')).locked, true); assert.equal(s.settings.locked, true);
  assert.notEqual((await call('/api/live/join', { method: 'POST', body: { code: s.code } })).status, 200, 'no rejoin under a new nickname');
  // Skip: the page is wiped everywhere at once (never shown in the reveal)
  h.send({ t: 'h', a: 'skip', at: 1 });
  for (const p of [b, h]) await p.next('ev', m => m.k === 'cl' && m.f === 0);
  assert.equal(dd(s).canvas.length, 0); assert.equal(dd(s).rv.why, 'skip');
  // the rest of the round, skipped: the podium has a and b, never c
  await h.next('st', m => m.d.dd && m.d.dd.tn === 2);
  h.send({ t: 'h', a: 'skip', at: 2 });
  const done = await h.next('st', m => m.d.dd && m.d.dd.ph === 'done', 3000);
  assert.ok(!done.d.dd.top.some(r => r[0] === seatOf(c)), JSON.stringify(done.d.dd.top));
  for (const p of [a, b, h]) p.ws.close();
});

test('nobody watching: with no host page the game pauses itself, and goes on when it is back; replays are limited', async (tt) => {
  reset();
  const was = { u: LS.hooks.unwatchedMs, r: DG.hooks.replayMs };
  LS.hooks.unwatchedMs = 300; DG.hooks.replayMs = 400;
  tt.after(() => { LS.hooks.unwatchedMs = was.u; DG.hooks.replayMs = was.r; });
  const s = open(mum, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, mum);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  await picked(s, a, [b]);
  ev(a, 'ln', { s: 0, c: 0, w: 0, e: 0, p: [10, 10, 1, 1] }); await b.next('ev', m => m.k === 'ln');
  // a guesser asking for the page again and again gets it once a while, not every time
  await sleep(450);
  const before = evs(b, 'cv').length;
  for (let i = 0; i < 6; i++) ev(b, 'need', null);
  await sleep(150);
  assert.equal(evs(b, 'cv').length - before, 1, 'one replay for six asks');
  // the host page closes (a dashboard alone doesn't show the drawing): the game pauses itself, strokes stop
  h.ws.close();
  await until(() => s.phase === 'paused');
  assert.equal(s.ddAutoPaused, true);
  ev(a, 'ln', { s: 1, c: 0, w: 0, e: 0, p: [20, 20] }); await sleep(50);
  assert.equal(dd(s).canvas.length, 1, 'no stroke goes out while nobody is watching');
  // the host page is back: it goes on by itself
  const h2 = await hostSocket(s, mum);
  await until(() => s.phase === 'playing');
  assert.equal(s.ddAutoPaused, false);
  // a pause the host made stays (the page coming back doesn't undo it)
  h2.send({ t: 'h', a: 'pause' }); await until(() => s.phase === 'paused');
  await sleep(250); assert.equal(s.phase, 'paused');
  assert.equal(DD.guessMax(2), 3); assert.equal(DD.guessMax(5), 5); assert.equal(DD.guessMax(9), DD.GUESS_MAX);
  for (const p of [a, b, h2]) p.ws.close();
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
  assert.deepEqual(r.words, ['pk', 'ln', 'un', 'cl', 'gs', 'aw', 'hide', 'need']);
  // the guess box is made at run time (no <input type=text> in the file: nothing else can be typed in a live frame)
  assert.ok(!r.issues.some(i => i.code === 'live_text'));
});

// ---------------------------------------------------------------- typed guesses and guesses out loud
/** A typed guess as the game sends it: code points. */
const typed = (c, n, text) => ev(c, 'gs', { n, c: Array.from(text).map(ch => ch.codePointAt(0)) });
const gap = () => sleep(DG.hooks.typeGapMs + 15);
/** Every message a socket got, as one string (to look for a guess's text in it). */
const all = c => JSON.stringify(c.msgs);

test('typing (the default): open the whole drawing, checked on the server, only list words go on, never to guessers', async () => {
  reset();
  logs.length = 0;
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s);
  h.send({ t: 'rdy', view: '3d' });
  await started(s, h, [a, b, c]);
  assert.equal(dd(s).tiles, false); assert.equal(s.state.dd.tl, 0);
  const ch = await a.next('ev', m => m.k === 'ch');
  ev(a, 'pk', { n: 1, i: 0 });
  const word = (await a.next('ev', m => m.k === 'wd')).d.w;
  // the guessers get the word's shape and no tiles, before a single stroke: guessing is open from the start
  const tb = await b.next('ev', m => m.k === 'tray');
  assert.deepEqual(tb.d.t, []); assert.equal(tb.d.ty, 1); assert.deepEqual(tb.d.g, dd(s).word.groups); assert.deepEqual(tb.d.hn, []);
  assert.equal(dd(s).canvas.length, 0);
  const pick = ch.d.w.find(w => w !== word && !w.includes(' '));   // another word of the list (one the drawer was offered)
  const wrongId = C.words(doodle().DoodleWords, 'en', 0).find(x => x.w === pick).id;
  // a word of the list: the drawer and the projector see it (as its id), the guesser hears "not quite", nobody else
  typed(b, 1, pick.toUpperCase());
  const fa = await a.next('ev', m => m.k === 'fd'), fh = await h.next('ev', m => m.k === 'fd');
  assert.deepEqual(fa.d, { n: 1, l: [[seatOf(b), 'w', wrongId]] }); assert.deepEqual(fh.d, fa.d);
  const g0 = await b.next('ev', m => m.k === 'gr');
  assert.equal(g0.d.ok, false); assert.equal(g0.d.c, undefined); assert.equal(g0.d.left, DD.TYPE_MAX - 1);
  // anything else goes on only as "something else": a sentence, a rude word, a phone number, a link
  const secret = ['you are my best friend', 'fuck', 'call me 0791 234 5678', 'www.example.com', 'shit head', 'Ｓｈｉｔ'];
  for (const text of secret) { await gap(); typed(c, 1, text); await a.next('ev', m => m.k === 'fd' && m.d.l[0][0] === seatOf(c) && evs(a, 'fd').filter(x => x.d.l[0][0] === seatOf(c)).length === secret.indexOf(text) + 1); }
  for (const f of evs(a, 'fd').filter(x => x.d.l[0][0] === seatOf(c))) assert.deepEqual(f.d.l[0], [seatOf(c), 'x']);
  // a close guess: "So close!" to that guesser alone; the drawer and the projector see only "something else" (nobody
  // else learns who is near)
  await gap();
  // (a letter off; a short word: two letters swapped)
  const near = word.length >= 4 ? word.slice(0, -1) + (word.endsWith('z') ? 'y' : 'z') : word[0] !== word[1] ? word[1] + word[0] + word.slice(2) : word[0] + word[2] + word[1];
  typed(b, 1, near);
  const gc = await b.next('ev', m => m.k === 'gr' && m.d.c === 1);
  assert.equal(gc.d.ok, false);
  assert.deepEqual((await a.next('ev', m => m.k === 'fd' && m.d.l[0][0] === seatOf(b) && m.d.l[0][1] === 'x')).d.l[0], [seatOf(b), 'x']);
  assert.ok(!all(a).includes('"c"]') && !all(h).includes('"c"]'), 'no "close" line anywhere');
  // the right word, typed any old way (capitals, spaces, an article): b gets it, sees the word, the others see only who
  await gap();
  typed(b, 1, `  The ${word.toUpperCase()} `);
  const ok = await b.next('ev', m => m.k === 'gr' && m.d.ok);
  assert.ok(ok.d.p >= 50); assert.equal((await b.next('ev', m => m.k === 'wd')).d.w, word);
  assert.deepEqual((await a.next('ev', m => m.k === 'fd' && m.d.l[0][1] === 'ok')).d.l[0], [seatOf(b), 'ok']);
  // b can't guess again; c's typed text never reached anyone, as text, anywhere; guessers never get the list
  await gap(); typed(b, 1, word); await sleep(40);
  assert.equal(evs(b, 'gr').filter(m => m.d.ok).length, 1);
  for (const sock of [a, b, c, h]) for (const text of secret) assert.ok(!all(sock).includes(text) && !all(sock).includes(JSON.stringify(text)), `"${text}" reached a device`);
  assert.equal(evs(b, 'fd').length + evs(c, 'fd').length, 0, 'guessers never see the guesses list');
  for (const text of [...secret, near]) assert.ok(!JSON.stringify(logs).includes(text), 'no guess in a log');
  assert.ok(!JSON.stringify(dd(s)).includes('best friend'), 'no guess kept in the room');
  // c gets it too: everyone has it, the turn ends
  await gap(); typed(c, 1, word);
  assert.equal((await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal')).d.dd.rv.why, 'all');
  assert.equal(s.seats.get(seatOf(a)).score, 120);
  for (const p of [a, b, c, h]) p.ws.close();
});

test('typing: what a typed guess may be, rate limits, and messages that are dropped', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  const word = await picked(s, a, [b]);
  const before = dd(s).drops;
  // dropped: tiles in a typing room, text as a string, nothing, too long, control characters, half a surrogate pair,
  // floats, another turn, extra keys, the drawer guessing
  for (const d of [{ n: 1, t: [0, 1, 2] }, { n: 1, c: 'cat' }, { n: 1, c: [] }, { n: 1, c: Array(41).fill(97) }, { n: 1, c: [99, 10, 97] }, { n: 1, c: [0x80] },
    { n: 1, c: [0xD83D] }, { n: 1, c: [97.5] }, { n: 2, c: [97] }, { n: 1, c: [97], x: 1 }]) { ev(b, 'gs', d); await sleep(DG.hooks.typeGapMs + 5); }
  typed(a, 1, word);
  await sleep(60);
  assert.equal(dd(s).drops - before, 11); assert.equal(evs(b, 'gr').length, 0); assert.equal(dd(s).got.length, 0);
  // one guess every TYPE_GAP_MS: a second at once isn't counted, but is answered (f: 1), so the box never waits forever
  DG.hooks.typeGapMs = 400;
  typed(b, 1, 'zzzz'); typed(b, 1, 'yyyy');
  await b.next('ev', m => m.k === 'gr' && m.d.f === 1); await sleep(60);
  assert.equal(evs(b, 'gr').length, 2); assert.equal(evs(a, 'fd').length, 1);
  assert.equal(evs(b, 'gr')[1].d.left, DD.TYPE_MAX - 1, 'too quick is not a wrong guess');
  // no letters at all (emoji, punctuation): answered (z: 1), not counted, nothing in the list
  const none = ['???', '🙂🙂', '!'];
  for (const [i, text] of none.entries()) { await sleep(420); typed(b, 1, text); await b.next('ev', m => m.k === 'gr' && m.d.z === 1 && evs(b, 'gr').filter(x => x.d.z).length === i + 1); }
  assert.equal(evs(a, 'fd').length, 1); assert.equal(evs(b, 'gr').at(-1).d.left, DD.TYPE_MAX - 1);
  DG.hooks.typeGapMs = 40;
  // TYPE_MAX wrong ones a turn, then "keep watching" (left 0) and nothing more is checked
  // (the socket's own limit is 10 events a second: these go at 8)
  for (let i = 1; i < DD.TYPE_MAX; i++) { await sleep(125); typed(b, 1, `zz${i}`); }
  const last = await b.next('ev', m => m.k === 'gr' && m.d.left === 0, 5000);
  assert.equal(last.d.ok, false);
  const n0 = evs(b, 'gr').length;
  await sleep(50); typed(b, 1, word); await sleep(60);
  assert.equal(dd(s).got.length, 0, 'no guesses left this turn');
  assert.equal(evs(b, 'gr').length, n0 + 1, 'still answered'); assert.equal(evs(b, 'gr').at(-1).d.left, 0);
  // a reload: the turn comes back marked as out of guesses (out: 1), so the box doesn't wait for an answer
  b.ws.close(); await sleep(20);
  const b2 = socket(); await b2.hello(b.join.tok); b2.send({ t: 'rdy', view: '2d' });
  assert.equal((await b2.next('ev', m => m.k === 'tray')).d.out, 1);
  b2.ws.close();
  assert.ok(evs(a, 'fd').length <= DD.TYPE_MAX && dd(s).feed.length === DD.FEED_MAX, 'the list keeps the last few');
  for (const p of [a, b, h]) p.ws.close();
});

test('typing: letter hints show letters; a reloaded drawer and the projector get the guesses so far', async (tt) => {
  reset();
  DG.hooks.drawMs = 4000; tt.after(() => { DG.hooks.drawMs = 20000; });
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:2:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s);
  await started(s, h, [a, b]);
  await picked(s, a, [b]);
  typed(b, 1, 'qqqq');
  await a.next('ev', m => m.k === 'fd');
  // no decoys to take away: the first hint is a letter, in its slot
  const hn = await b.next('ev', m => m.k === 'hn', 4000);
  assert.equal(hn.d.l, dd(s).word.g[hn.d.i]); assert.equal(hn.d.t, undefined);
  assert.equal(evs(b, 'hd').length, 0); assert.equal(evs(a, 'hn').length, 0);
  // a guesser who reloads gets the letters so far
  b.ws.close(); await sleep(20);
  const b2 = socket(); await b2.hello(b.join.tok); b2.send({ t: 'rdy', view: '2d' });
  const tr = await b2.next('ev', m => m.k === 'tray');
  assert.deepEqual(tr.d.hn, dd(s).hints.map(x => [x.i, x.l])); assert.equal(tr.d.ty, 1);
  // the drawer reloads: the list again (whole: r 1); the projector's frame too
  a.ws.close(); await sleep(20);
  const a2 = socket(); await a2.hello(a.join.tok); a2.send({ t: 'rdy', view: '2d' });
  const fd = await a2.next('ev', m => m.k === 'fd');
  assert.deepEqual(fd.d, { n: 1, l: [[seatOf(b), 'x']], r: 1 });
  h.send({ t: 'rdy', view: '3d' });
  assert.equal((await h.next('ev', m => m.k === 'fd' && m.d.r === 1)).d.l.length, 1);
  for (const p of [a2, b2, h]) p.ws.close();
});

test('said out loud: the drawer (or the host) taps who; once a player a turn, only someone who may still get it', async () => {
  reset();
  const s = open(mum, { mode: 'doodle', starter: 'doodle:en:1:2:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, mum);
  const a = await player(s), b = await player(s), c = await player(s), d = await player(s);
  await started(s, h, [a, b, c, d]);
  const word = await picked(s, a, [b, c, d]);
  // nothing drawn yet: no award (the drawer is told, so the game can say "Draw something first!")
  let before = dd(s).drops;
  ev(a, 'aw', { n: 1, s: seatOf(b) });
  assert.deepEqual((await a.next('ev', m => m.k === 'awn')).d, { n: 1, s: seatOf(b) });
  h.send({ t: 'ev', k: 'aw', d: { n: 1, s: seatOf(b) } }); await sleep(50);
  assert.equal(dd(s).drops - before, 2); assert.equal(dd(s).got.length, 0); assert.equal(evs(b, 'gr').length, 0);
  ev(a, 'ln', { s: 0, c: 3, w: 1, e: 0, p: [100, 100, 10, 0, 10, 5] }); await sleep(40);
  before = dd(s).drops;
  // dropped: a guesser awarding, the drawer awarding themselves, no such seat, another turn, extra keys
  ev(b, 'aw', { n: 1, s: seatOf(c) }); await sleep(50);
  ev(a, 'aw', { n: 1, s: seatOf(a) }); await sleep(50);
  ev(a, 'aw', { n: 1, s: 999 }); await sleep(50);
  ev(a, 'aw', { n: 2, s: seatOf(b) }); await sleep(50);
  ev(a, 'aw', { n: 1, s: seatOf(b), x: 1 }); await sleep(50);
  assert.equal(dd(s).drops - before, 5); assert.equal(dd(s).got.length, 0);
  // the drawer: b said it. b gets their points by speed and the word; it shows in the list like a typed one
  ev(a, 'aw', { n: 1, s: seatOf(b) });
  const g = await b.next('ev', m => m.k === 'gr' && m.d.ok);
  assert.equal(g.d.a, 1); assert.ok(g.d.p >= 50 && g.d.p <= 120);
  assert.equal((await b.next('ev', m => m.k === 'wd')).d.w, word);
  assert.deepEqual((await a.next('ev', m => m.k === 'fd' && m.d.l[0][1] === 'ok')).d.l[0], [seatOf(b), 'ok', 1], 'marked as said out loud');
  assert.equal(s.seats.get(seatOf(b)).score, g.d.p); assert.equal(s.seats.get(seatOf(b)).correct, 1);
  // b again: once a turn
  await sleep(60); ev(a, 'aw', { n: 1, s: seatOf(b) }); await sleep(60);
  assert.equal(evs(b, 'gr').filter(m => m.d.ok).length, 1);
  // the host's page can say who too (c); a second tap on the same player does nothing (once a turn)
  h.send({ t: 'ev', k: 'aw', d: { n: 1, s: seatOf(c) } });
  h.send({ t: 'ev', k: 'aw', d: { n: 1, s: seatOf(c) } });
  await c.next('ev', m => m.k === 'gr' && m.d.ok); await sleep(80);
  assert.deepEqual(dd(s).got, [seatOf(b), seatOf(c)]);
  assert.equal(evs(c, 'gr').filter(m => m.d.ok).length, 1, 'once a turn');
  // d types it: everyone has it, the drawer's usual share
  typed(d, 1, word);
  const rv = await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal');
  assert.equal(rv.d.dd.rv.why, 'all'); assert.equal(s.seats.get(seatOf(a)).score, 120);
  // after the drawing, an award does nothing
  ev(a, 'aw', { n: 1, s: seatOf(d) }); await sleep(40);
  assert.equal(s.seats.get(seatOf(d)).correct, 1);
  for (const p of [a, b, c, d, h]) p.ws.close();
});

test('typing: at most FEED_WORDS list words a guesser a turn go on (words can not be strung into a message)', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s);
  h.send({ t: 'rdy', view: '3d' });
  await started(s, h, [a, b, c]);
  const word = await picked(s, a, [b, c]);
  const idx = C.index(doodle().DoodleWords, 'en');
  const msg = C.words(doodle().DoodleWords, 'en', 0).map(x => x.w).filter(w => !w.includes(' ') && C.judge(w, [word], 'en', idx).k === 'word').slice(0, DD.FEED_WORDS + 3);
  for (const w of msg) { typed(b, 1, w); await gap(); }
  await a.next('ev', m => m.k === 'fd' && evs(a, 'fd').length === msg.length);
  const lines = evs(a, 'fd').map(m => m.d.l[0]);
  assert.equal(lines.filter(l => l[1] === 'w').length, DD.FEED_WORDS);
  assert.equal(JSON.stringify(lines.slice(DD.FEED_WORDS)), JSON.stringify(msg.slice(DD.FEED_WORDS).map(() => [seatOf(b), 'x'])));
  // the projector the same; another guesser has their own few
  await h.next('ev', m => m.k === 'fd' && evs(h, 'fd').length === msg.length);
  assert.equal(evs(h, 'fd').filter(m => m.d.l[0][1] === 'w').length, DD.FEED_WORDS);
  typed(c, 1, msg[0]);
  assert.equal((await a.next('ev', m => m.k === 'fd' && m.d.l[0][0] === seatOf(c))).d.l[0][1], 'w');
  // a rude word, a sentence, prototype names: never a list word (the index has no prototype)
  assert.equal(Object.getPrototypeOf(idx), null);
  for (const t of ['constructor', 'constructors', '__proto__', 'hasOwnProperty', 'toString', 'fuck', 'you are my best friend'])
    assert.equal(C.judge(t, [word], 'en', idx).k, 'other', t);
  for (const p of [a, b, c, h]) p.ws.close();
});

test('letter tiles still work with "said it" (the host\'s easier choice); a typed guess there is dropped', async () => {
  reset();
  const s = open(teacher, { mode: 'doodle', starter: 'doodle:en:1:1:60:t', audience: 'open', lang: 'en' });
  const h = await hostSocket(s, teacher);
  const a = await player(s), b = await player(s), c = await player(s);
  await started(s, h, [a, b, c]);
  const word = await picked(s, a, [b, c]);
  assert.equal(s.state.dd.tl, 1);
  const tray = evs(b, 'tray')[0].d;
  assert.ok(tray.t.length > word.length - 1); assert.equal(tray.ty, undefined);
  const before = dd(s).drops;
  typed(b, 1, word); await sleep(60);
  assert.equal(dd(s).drops - before, 1); assert.equal(dd(s).got.length, 0);
  ev(b, 'gs', { n: 1, t: spell(s, b) });
  await b.next('ev', m => m.k === 'gr' && m.d.ok);
  ev(a, 'ln', { s: 0, c: 3, w: 1, e: 0, p: [100, 100, 10, 0, 10, 5] }); await sleep(40);
  ev(a, 'aw', { n: 1, s: seatOf(c) });
  assert.equal((await c.next('ev', m => m.k === 'gr' && m.d.ok)).d.a, 1);
  assert.equal((await h.next('st', m => m.d.dd && m.d.dd.ph === 'reveal')).d.dd.rv.why, 'all');
  for (const p of [a, b, c, h]) p.ws.close();
});

test('the protocol carries a typed guess as numbers only (no strings), within the event limits', () => {
  const word = 'מכונית גדולה ומהירה מאוד מאוד מאוד מאוד'.slice(0, 40);
  const d = { n: 3, c: Array.from(word).map(ch => ch.codePointAt(0)) };
  assert.ok(P.evDataOk(d));
  assert.ok(JSON.stringify(d).length <= P.MAX.ev);
  const big = { n: 3, c: Array(40).fill(0x1F600) };
  assert.ok(P.evDataOk(big) && JSON.stringify(big).length <= P.MAX.ev, 'forty emoji still fit');
  assert.equal(P.evDataOk({ n: 3, c: 'hello there' }), false, 'text itself never travels');
});
