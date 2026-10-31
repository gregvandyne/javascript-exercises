// Oomba Live questions with server timing (docs/decisions.md "Oomba Live"). Used by the built-in modes (Quest Race,
// Question Battle) and by any game that declares quiz:true. The server owns the clock: a question opens at a server
// time (at), its deadline is at + secs + 600 ms, and the answer is never sent until the reveal. A device's own measure
// of how long the player took is trusted only within one round trip of the server's.
import crypto from 'node:crypto';
import * as sets from './classlive-sets.js';
import { starterItems, STARTERS } from '../live/starters.js';

/** Extra time after the deadline for answers already on their way. */
export const GRACE_MS = 600;
export const SECS = [10, 20, 30, 60];
export const STREAK = { step: 50, max: 200 };

/**
 * The questions for a session: a saved set the host may use, a starter set, or items given directly (a quick set the
 * host typed, checked like a saved one). -> { ok: true, items, setId? } | { ok: false, code: 'noSet'|'setIncomplete' }
 */
export function loadItems(host, { setId = null, starter = null, items = null, lang = 'en' } = {}) {
  if (setId) {
    const set = sets.getSet(setId);
    if (!set || !sets.canUse(host, set)) return { ok: false, code: 'noSet' };
    const list = sets.itemsOf(set);
    if (!list.length || list.some(it => !sets.complete(it))) return { ok: false, code: 'setIncomplete' };
    return { ok: true, items: list, setId: set.id };
  }
  if (starter) {
    if (!STARTERS.includes(starter)) return { ok: false, code: 'noSet' };
    return { ok: true, items: starterItems(starter, lang) };
  }
  if (items) {
    const c = sets.cleanItems(items);
    if (!c.ok) return { ok: false, code: 'setIncomplete' };
    return { ok: true, items: c.items };
  }
  return { ok: false, code: 'noSet' };
}

const shuffle = n => { const a = [...Array(n).keys()]; for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
export const hasNext = s => !!s.items && (s.qz ? s.qz.i + 1 : 0) < s.items.length;

/** The q message for the current question (never the answer). */
export function questionMsg(s) {
  const c = s.qz && s.qz.cur;
  return c ? { t: 'q', i: c.i, n: s.items.length, q: c.q, choices: c.choices, secs: c.secs, at: c.at } : null;
}

/** Open question i: choices shuffled once (the same order on every device). */
export function ask(s, io, i) {
  if (!s.items || i >= s.items.length) return io.end(s, 'ended');
  const it = s.items[i];
  const order = shuffle(it.choices.length);
  const at = io.now();
  if (!s.qz) s.qz = { i: -1, cur: null, answers: new Map() };
  s.qz.i = i;
  s.qz.cur = { i, q: it.q, choices: order.map(k => it.choices[k]), answer: order.indexOf(it.answer), secs: it.secs, at, deadline: at + it.secs * 1000 + GRACE_MS };
  s.qz.answers = new Map();
  io.setPhase(s, 'playing', { at });
  io.broadcast(s, questionMsg(s));
  armDeadline(s, io);
}
function armDeadline(s, io) {
  clearTimeout(s.timers.deadline);
  const ms = Math.max(0, s.qz.cur.deadline - io.now());
  s.timers.deadline = setTimeout(() => { s.timers.deadline = null; if (s.phase === 'playing' && s.qz.cur) reveal(s, io); }, ms);
  s.timers.deadline.unref?.();
}

/** An answer: once per seat per question, while it is open and before the deadline. -> true when accepted. */
export function answer(s, io, seat, m, recvAt = io.now()) {
  const c = s.qz && s.qz.cur;
  if (!c || s.phase !== 'playing' || m.i !== c.i || s.qz.answers.has(seat.no) || recvAt > c.deadline || m.c >= c.choices.length) return false;
  const serverElapsed = Math.max(0, recvAt - c.at);
  const limit = c.secs * 1000;
  const elapsed = Math.min(limit, Math.max(0, serverElapsed - (seat.rtt || 0) - 500, Math.min(m.e, serverElapsed)));
  const ok = m.c === c.answer;
  s.qz.answers.set(seat.no, { c: m.c, elapsed, ok });
  io.toSeat(s, seat.no, { t: 'ack', i: c.i });
  io.toHost(s, { t: 'ac', i: c.i, n: s.qz.answers.size });
  maybeAllAnswered(s, io);
  return true;
}

/** Everyone connected and ready has answered: reveal now. */
export function maybeAllAnswered(s, io) {
  if (!s.quiz || s.phase !== 'playing' || !s.qz || !s.qz.cur) return;
  const waiting = [...s.seats.values()].filter(seat => seat.conn && seat.ready);
  if (waiting.length && waiting.every(seat => s.qz.answers.has(seat.no))) reveal(s, io);
}

/** Points for a right answer: 500 to 1000 by speed, plus a streak bonus. */
export const points = (elapsed, secs, streak) => Math.round(500 + 500 * (1 - elapsed / (secs * 1000))) + Math.min(STREAK.max, STREAK.step * Math.max(0, streak - 1));

/** Close the question: score it, tell everyone the answer and the counts, and each player their own result. */
export function reveal(s, io) {
  const c = s.qz && s.qz.cur;
  if (!c) return;
  clearTimeout(s.timers.deadline); s.timers.deadline = null;
  const counts = c.choices.map(() => 0);
  const n = s.items.length, limit = c.secs * 1000;
  const mine = new Map();
  for (const seat of s.seats.values()) {
    const a = s.qz.answers.get(seat.no);
    if (!a) { if (seat.conn) seat.streak = 0; continue; }
    counts[a.c]++;
    seat.answered++;
    let pts = 0;
    if (a.ok) {
      seat.streak++; seat.correct++;
      pts = points(a.elapsed, c.secs, seat.streak);
      seat.score += pts;
      if (s.race) { const r = s.race.get(seat.no) || { prog: 0, gems: 0 }; r.prog = Math.min(1000, r.prog + (0.8 * 1000) / n + ((0.2 * 1000) / n) * (1 - Math.max(0, a.elapsed - limit / 3) / (limit * 2 / 3))); r.gems += a.elapsed < limit / 3 ? 2 : 1; s.race.set(seat.no, r); }
    } else seat.streak = 0;
    seat.items.set(c.i, a.ok);
    mine.set(seat.no, { ok: a.ok, points: pts });
  }
  const right = counts[c.answer];
  const answered = counts.reduce((x, y) => x + y, 0);
  let topWrong = null;
  counts.forEach((k, i) => { if (i !== c.answer && k > 0 && (topWrong === null || k > counts[topWrong])) topWrong = i; });
  s.itemStats.set(c.i, { q: c.q, right, answered, topWrong: topWrong === null ? null : c.choices[topWrong] });
  s.qz.cur = null;
  s.scoresDirty = false;
  const ranked = rankSeats(s);
  const top = ranked.slice(0, 5).map(r => [r.seat, r.score]);
  io.setPhase(s, 'between');
  io.broadcast(s, { t: 'rv', i: c.i, answer: c.answer, counts, top });
  if (s.race) io.broadcast(s, { t: 'race', p: io.raceList(s) });   // a right answer in the first third of the time is a full step: all right and quick reaches the flag
  for (const r of ranked) {
    const m = mine.get(r.seat) || { ok: false, points: 0, none: true };
    io.toSeat(s, r.seat, { t: 'you', i: c.i, ok: m.ok, points: m.points, rank: r.rank, score: r.score, ...(m.none ? { none: true } : {}) });
  }
}

/** Skip the current question: nobody scores, it doesn't count for accuracy. */
export function skip(s, io) {
  const c = s.qz && s.qz.cur;
  if (!c) return;
  clearTimeout(s.timers.deadline); s.timers.deadline = null;
  s.qz.cur = null;
  io.setPhase(s, 'between');
  io.broadcast(s, { t: 'rv', i: c.i, skipped: true });
}

export function pause(s) { clearTimeout(s.timers.deadline); s.timers.deadline = null; }
/** Resume: the question's clock moves on by the paused time, and q is sent again with the new at. */
export function resume(s, io, shift) {
  const c = s.qz && s.qz.cur;
  if (c) { c.at += shift; c.deadline += shift; }
  s.at += shift;
  io.setPhase(s, 'playing', { at: c ? c.at : s.at });
  if (c) { io.broadcast(s, questionMsg(s)); armDeadline(s, io); }
}

/** Seats in rank order (Quest Race: progress first, then score). Ties share a rank. */
export function rankSeats(s) {
  const list = [...s.seats.values()].map(seat => ({ seat: seat.no, score: seat.score, prog: s.race ? Math.round((s.race.get(seat.no) || { prog: 0 }).prog) : 0 }));
  list.sort((a, b) => (b.prog - a.prog) || (b.score - a.score) || (a.seat - b.seat));
  let rank = 0, prev = null;
  list.forEach((r, i) => { const key = `${r.prog}:${r.score}`; if (key !== prev) { rank = i + 1; prev = key; } r.rank = rank; });
  return list;
}
