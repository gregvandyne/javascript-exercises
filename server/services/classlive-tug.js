// Tug of Math Live (the built-in mode 'tug'; server/live/tug.js has the rules, docs/live-protocol.md "Tug of Math").
// The server owns everything that decides the game: each player's questions (the game's own generator), the answers
// (checked here; an answer is never sent to anyone before it is given), the rope, the clock and the winner.
//
// - Teams are always on: Blue Whales (1) and Red Foxes (2), split evenly by the platform (classlive-teams.js).
// - Each seat has its own question stream: the n-th question of every player is the same kind for the grade (one seed
//   for the room: TugGen.kindAt), with that player's own numbers (their own seed), so nobody can copy a neighbour.
// - A question goes to its player only: ev 'tq' { i, e } (e: number and word tokens, never text). The player answers
//   with ev 'ans' { i, v } (to the host); the server checks it and answers that player only: ev 'tr' { i, ok, a? } (a:
//   the right answer, after a wrong one), then the next question. Nothing a player sends reaches anyone else.
// - A right answer pulls the rope 1 / (players on the team now) toward that team: the rope is the difference of the two
//   teams' average right answers, so uneven teams pull fairly. Past TUG.LINE wins at once; else time decides.
// - Shared state tug { g, len, line, end, left, run, pos, pull, right, n, win } goes to every device about 5 times a
//   second while something changes: numbers only.
import crypto from 'node:crypto';
import * as TUG from '../live/tug.js';
import { tug as gen } from '../live/tug-gen.js';
import * as T from './classlive-teams.js';

/** Tests shorten the waits. */
export const hooks = { holdMs: TUG.HOLD_MS, gap: { ...TUG.GAP_MS } };
const present = seat => !!seat.conn || !seat.everConnected;
const round2 = v => Math.round(v * 100) / 100;

/** Set up a new room's game from its starter id (or the default). -> the parsed starter. */
export function init(s, id) {
  const p = TUG.parseId(id) || TUG.parseId(TUG.DEFAULT_ID);
  s.tug = {
    id: TUG.makeId(p), g: p.grade, len: p.len, line: TUG.LINE, seed: crypto.randomInt(2 ** 32),
    endAt: 0, left: (p.len || TUG.CAP) * 1000, running: false, done: false, win: null, doneAt: 0,
    pull: [0, 0, 0], right: [0, 0, 0], per: new Map(), dirty: false, sentAt: 0,
  };
  s.state = { ...s.state, tug: publicState(s, 0) };
  s.stateBytes = JSON.stringify(s.state).length;
  return p;
}

/** The rope as everyone sees it (numbers only). */
export function publicState(s, now) {
  const x = s.tug;
  return {
    g: x.g, len: x.len, line: x.line, run: x.running ? 1 : 0,
    end: x.running ? x.endAt : 0, left: Math.max(0, Math.round(x.running ? x.endAt - now : x.left)),
    pos: round2(pos(s)), pull: [round2(x.pull[1]), round2(x.pull[2])], right: [x.right[1], x.right[2]],
    n: [teamSize(s, 1), teamSize(s, 2)], win: x.win,
  };
}
export const pos = s => s.tug.pull[1] - s.tug.pull[2];
/** Players on team k who count for the rope now (connected, or joined and on their way). */
export const teamSize = (s, k) => { let n = 0; for (const seat of s.seats.values()) if (seat.team === k && present(seat)) n++; return n; };

function send(s, io, now) {
  s.tug.dirty = false; s.tug.sentAt = now;
  io.publish(s, { tug: publicState(s, now) });
}

/** A seat's own question stream. */
function stream(s, seat) {
  let p = s.tug.per.get(seat.no);
  if (!p) { p = { r: gen().TugGen.rng(crypto.randomInt(2 ** 32)), n: 0, prev: null, q: null, nextAt: 0 }; s.tug.per.set(seat.no, p); }
  return p;
}
function nextQuestion(s, seat) {
  const G = gen().TugGen, p = stream(s, seat);
  // the kind and its form (TugGen.variantSeed) come from the room's seed: every player's n-th question is equally hard
  const q = G.make(s.tug.g, p.r, p.prev, G.kindAt(s.tug.g, s.tug.seed, p.n), null, G.variantSeed(s.tug.seed, p.n));
  q.n = p.n++; p.prev = q; p.q = q;
  return q;
}
/** Send a seat its open question (a new one when it has none). */
export function sendQuestion(s, io, seat) {
  if (!seat || !seat.conn || s.tug.done) return false;
  const p = stream(s, seat);
  const q = p.q || nextQuestion(s, seat);
  return io.toSeat(s, seat.no, { t: 'ev', f: 0, k: 'tq', d: { i: q.n, e: q.e } });
}

/** Play starts (after the countdown): the clock runs, everyone gets their first question. */
export function start(s, io) {
  const x = s.tug, now = io.now();
  if (x.done) return;
  x.endAt = now + (x.len || TUG.CAP) * 1000; x.running = true;
  send(s, io, now);
  for (const seat of s.seats.values()) sendQuestion(s, io, seat);
}
/** Pause (the host, or eyes up): the clock stops where it is. */
export function pause(s, io) {
  const x = s.tug, now = io.now();
  if (!x.running) return;
  x.left = Math.max(0, x.endAt - now); x.running = false;
  send(s, io, now);
}
/** Resume: the clock goes on from where it stopped. */
export function resume(s, io) {
  const x = s.tug, now = io.now();
  if (x.running || x.done || !s.startedAt) return;
  x.endAt = now + x.left; x.running = true;
  send(s, io, now);
}

/** A player's game event: 'ans' { i, v } (an answer to their question i) or 'need' (send my question again). Anything
 *  else is dropped. Never relayed. -> true when it did something. */
export function fromPlayer(s, io, seat, m) {
  // (not while paused: the question waits for the clock; the player asks again on resume)
  if (m.k === 'need') return s.phase === 'playing' ? sendQuestion(s, io, seat) : false;
  if (m.k !== 'ans') return false;
  const d = m.d;
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Number.isInteger(d.i) || !Number.isInteger(d.v) || Math.abs(d.v) > 99999) return false;
  return answer(s, io, seat, d.i, d.v);
}

/** Check an answer. Only to the player's open question, while the clock runs, not sooner than GAP_MS after their last. */
export function answer(s, io, seat, i, v) {
  const x = s.tug, now = io.now();
  if (s.phase !== 'playing' || !x.running || x.done) return false;
  const p = x.per.get(seat.no);
  if (!p || !p.q || p.q.n !== i || now < p.nextAt) return false;
  const q = p.q, ok = gen().TugGen.check(q, v);
  seat.answered++; s.dpDirty = true; s.lastActive = now;
  const k = seat.team === 1 || seat.team === 2 ? seat.team : 0;
  if (ok) {
    seat.correct++; seat.streak = (seat.streak || 0) + 1; seat.wrongRun = 0;
    seat.score += TUG.POINTS; s.scoresDirty = true;
    if (k) { x.pull[k] += 1 / Math.max(1, teamSize(s, k)); x.right[k]++; T.bankRise(s, seat, TUG.POINTS); }
    p.nextAt = now + hooks.gap.right;
  } else {
    seat.streak = 0; seat.wrongRun = (seat.wrongRun || 0) + 1;
    p.nextAt = now + hooks.gap.wrong;
  }
  io.toSeat(s, seat.no, { t: 'ev', f: 0, k: 'tr', d: ok ? { i, ok: true } : { i, ok: false, a: q.a } });
  p.q = null;
  sendQuestion(s, io, seat);
  if (ok) {
    x.dirty = true;
    if (Math.abs(pos(s)) >= x.line - 1e-9) finish(s, io);
  }
  return true;
}

/** The end of the match: past the line, or time is up. The winner (1 Blue, 2 Red, 0 a draw) shows on every screen for
 *  HOLD_MS, then the session ends (the podium and the results). */
export function finish(s, io) {
  const x = s.tug;
  if (x.done) return;
  const now = io.now(), d = pos(s);
  x.done = true; x.running = false; x.left = Math.max(0, x.endAt - now);
  x.win = Math.abs(d) < 1e-9 ? 0 : d > 0 ? 1 : 2; x.doneAt = now;
  for (const p of x.per.values()) p.q = null;
  send(s, io, now);
}

/** Every tick (100 ms): the clock, the shared state when it changed, the end of the hold. */
export function tick(s, io) {
  const x = s.tug, now = io.now();
  if (x.running && now >= x.endAt) finish(s, io);
  if (x.dirty && now - x.sentAt >= TUG.SEND_MS) send(s, io, now);
  if (x.done && now - x.doneAt >= hooks.holdMs) io.end(s, 'ended');
}

/** The team actions a host may take in this mode: no count, presets, scoring or choosing (always two teams, by
 *  average); moves only between the two teams. */
export function teamActionOk(m) {
  if (['lock', 'unlock', 'balance', 'shuffle'].includes(m.a)) return true;
  return m.a === 'move' && (m.k === 1 || m.k === 2);
}
