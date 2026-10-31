// Oomba Live questions with server timing (docs/decisions.md "Oomba Live"). Used by the built-in modes (Quest Race,
// Question Battle) and by any game that declares quiz:true. The server owns the clock: a question opens at a server
// time (at), its deadline is at + secs + 600 ms, and the answer is never sent until the reveal. A device's own measure
// of how long the player took is trusted only within one round trip of the server's.
// Part 3: the host's settings (order, count, time, shuffled answers, accuracy-only points, the leaderboard on players'
// devices), per-seat extra time (support: the seat's own q with its own secs, never in a broadcast), +time, team banking
// (each seat counts for the team it had when the question opened), per-question marks and the dashboard's data.
import crypto from 'node:crypto';
import * as sets from './classlive-sets.js';
import * as T from './classlive-teams.js';
import * as D from './classlive-dash.js';
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

/** At start: the host's settings shape the run's questions (shuffled order, the first N, one time for all). The loaded
 *  set stays in s.allItems (play again, play missed). */
export function applySettings(s) {
  if (!s.items) return;
  const st = s.settings || {};
  let list = (s.allItems || s.items).map(it => ({ ...it }));
  if (st.shuffleQ) list = shuffle(list.length).map(k => list[k]);
  if (st.count) list = list.slice(0, st.count);
  for (const it of list) { it.own = it.own || it.secs; if (st.secs) it.secs = st.secs; }
  s.items = list;
}

/** A seat's extra time in percent (support; quiz modes only). */
const pct = seat => (seat && seat.acc && seat.acc.time > 100 ? seat.acc.time : 100);
/** How long a seat has for the open question, in ms (+time included). */
export const limitOf = (c, seat) => Math.round(c.secs * 1000 * pct(seat) / 100);

/** The q message for the current question (never the answer). seat: that seat's own secs (extra time). */
export function questionMsg(s, seat = null) {
  const c = s.qz && s.qz.cur;
  return c ? { t: 'q', i: c.i, n: s.items.length, q: c.q, choices: c.choices, secs: Math.round(c.secs * pct(seat) / 100), at: c.at } : null;
}
/** Send the open question: one string for everyone, and its own q to each seat with extra time (never broadcast). */
function sendQuestion(s, io) {
  const base = JSON.stringify(questionMsg(s));
  for (const seat of s.seats.values()) if (seat.conn) io.toSeat(s, seat.no, pct(seat) > 100 ? questionMsg(s, seat) : base);
  io.toHosts(s, base);
}

/** Open question i: choices shuffled once (the same order on every device), unless the host turned that off. */
export function ask(s, io, i) {
  if (!s.items || i >= s.items.length) return io.end(s, 'ended');
  const it = s.items[i];
  const order = s.settings && s.settings.shuffleA === false ? [...it.choices.keys()] : shuffle(it.choices.length);
  const at = io.now();
  if (!s.qz) s.qz = { i: -1, cur: null, answers: new Map() };
  s.qz.i = i;
  s.qz.cur = { i, q: it.q, choices: order.map(k => it.choices[k]), answer: order.indexOf(it.answer), secs: it.secs, base: it.secs, own: it.own || it.secs, at, deadline: at + it.secs * 1000 + GRACE_MS, teamAt: T.snapshot(s) };
  s.qz.answers = new Map();
  io.setPhase(s, 'playing', { at });
  sendQuestion(s, io);
  io.toDash(s, D.dqMsg(s));
  armDeadline(s, io);
}
/** The last moment an answer may arrive: the base deadline, or later for a connected seat with extra time that has not
 *  answered yet. */
function lastDeadline(s) {
  const c = s.qz.cur;
  let t = c.deadline;
  for (const seat of s.seats.values()) if (seat.conn && pct(seat) > 100 && !s.qz.answers.has(seat.no)) t = Math.max(t, c.deadline + (limitOf(c, seat) - c.secs * 1000));
  return t;
}
function armDeadline(s, io, at = s.qz.cur.deadline) {
  clearTimeout(s.timers.deadline);
  const ms = Math.max(0, at - io.now());
  s.timers.deadline = setTimeout(() => {
    s.timers.deadline = null;
    if (s.phase !== 'playing' || !s.qz.cur) return;
    const later = lastDeadline(s);
    if (later > io.now() + 5) return armDeadline(s, io, later);
    reveal(s, io);
  }, ms);
  s.timers.deadline.unref?.();
}

/** +time: the open question's time grows by secs for everyone (extra-time seats in proportion); q is sent again with
 *  the same at. Points still use the question's own time, so adding time never lowers anyone's points. */
export function extend(s, io, secs) {
  const c = s.qz && s.qz.cur;
  if (!c || s.phase !== 'playing') return false;
  c.secs += secs; c.deadline += secs * 1000;
  sendQuestion(s, io);
  armDeadline(s, io);
  return true;
}

/** An answer: once per seat per question, while it is open and before the seat's own deadline. -> true when accepted. */
export function answer(s, io, seat, m, recvAt = io.now()) {
  const c = s.qz && s.qz.cur;
  if (!c || s.phase !== 'playing' || m.i !== c.i || s.qz.answers.has(seat.no) || m.c >= c.choices.length) return false;
  const limit = limitOf(c, seat);
  // The seat's own deadline: the question's, plus its extra time (support).
  if (recvAt > c.deadline + (limit - c.secs * 1000)) return false;
  const serverElapsed = Math.max(0, recvAt - c.at);
  const elapsed = Math.min(limit, Math.max(0, serverElapsed - (seat.rtt || 0) - 500, Math.min(m.e, serverElapsed)));
  const ok = m.c === c.answer;
  s.qz.answers.set(seat.no, { c: m.c, elapsed, ok });
  io.toSeat(s, seat.no, { t: 'ack', i: c.i });
  io.toHosts(s, { t: 'ac', i: c.i, n: s.qz.answers.size });
  io.toDash(s, D.dqMsg(s));
  maybeAllAnswered(s, io);
  return true;
}

/** Everyone connected and ready has answered: reveal now. */
export function maybeAllAnswered(s, io) {
  if (!s.quiz || s.phase !== 'playing' || !s.qz || !s.qz.cur) return;
  const waiting = [...s.seats.values()].filter(seat => seat.conn && seat.ready);
  if (waiting.length && waiting.every(seat => s.qz.answers.has(seat.no))) reveal(s, io);
}

/** Points for a right answer: 500 to 1000 by speed (elapsed of secs), plus a streak bonus. Accuracy only: 1000. */
export const points = (elapsed, secs, streak, { accuracy = false } = {}) => (accuracy ? 1000
  : Math.round(500 + 500 * (1 - Math.min(1, elapsed / (secs * 1000)))) + Math.min(STREAK.max, STREAK.step * Math.max(0, streak - 1)));

/** What players may see of the leaderboard (the host's board setting): -> how many top rows (0: none, and no ranks). */
export const boardRows = (s, all = 10) => { const b = s.settings && s.settings.board; return b === 'off' ? 0 : b === 'top5' ? Math.min(5, all) : all; };

/** Close the question: score it, bank team points, tell everyone the answer and the counts, and each player their own
 *  result. Team scores (ts) go out before the reveal, so a game's reveal event already has them. */
export function reveal(s, io) {
  const c = s.qz && s.qz.cur;
  if (!c) return;
  clearTimeout(s.timers.deadline); s.timers.deadline = null;
  const counts = c.choices.map(() => 0);
  const n = s.items.length;
  const accuracy = s.settings && s.settings.points === 'accuracy';
  const mine = new Map(), pts = new Map();
  for (const seat of s.seats.values()) {
    const a = s.qz.answers.get(seat.no);
    if (!a) { if (seat.conn) { seat.streak = 0; seat.missRun = (seat.missRun || 0) + 1; } continue; }
    seat.missRun = 0;
    counts[a.c]++;
    seat.answered++;
    let p = 0;
    const limit = limitOf(c, seat);
    if (a.ok) {
      seat.streak++; seat.correct++; seat.wrongRun = 0;
      // Speed points against the question's own time (and the seat's extra time), never the added time.
      p = points(a.elapsed, (c.base * pct(seat)) / 100, seat.streak, { accuracy });
      seat.score += p;
      if (s.race) { const r = s.race.get(seat.no) || { prog: 0, gems: 0 }; r.prog = Math.min(1000, r.prog + (0.8 * 1000) / n + ((0.2 * 1000) / n) * (1 - Math.max(0, a.elapsed - limit / 3) / (limit * 2 / 3))); r.gems += a.elapsed < limit / 3 ? 2 : 1; s.race.set(seat.no, r); }
    } else { seat.streak = 0; seat.wrongRun = (seat.wrongRun || 0) + 1; }
    seat.items.set(c.i, a.ok);
    pts.set(seat.no, p);
    mine.set(seat.no, { ok: a.ok, points: p });
  }
  T.bankQuiz(s, c.teamAt, pts, new Set(s.qz.answers.keys()));
  const right = counts[c.answer];
  const answered = counts.reduce((x, y) => x + y, 0);
  let topWrong = null;
  counts.forEach((k, i) => { if (i !== c.answer && k > 0 && (topWrong === null || k > counts[topWrong])) topWrong = i; });
  // The question as the class saw it (host-written text only), for the question review and "play the missed ones".
  s.itemStats.set(c.i, { q: c.q, choices: c.choices, answer: c.answer, secs: c.own, counts, right, answered, topWrong: topWrong === null ? null : c.choices[topWrong] });
  s.qz.cur = null;
  s.scoresDirty = false;
  const ranked = rankSeats(s);
  const top = ranked.slice(0, 5).map(r => [r.seat, r.score]);
  const rows = boardRows(s, 5);
  io.setPhase(s, 'between');
  io.teamScores(s);
  io.toHosts(s, { t: 'rv', i: c.i, answer: c.answer, counts, top });
  io.toPlayers(s, { t: 'rv', i: c.i, answer: c.answer, counts, top: top.slice(0, rows) });
  if (s.race) io.broadcast(s, { t: 'race', p: io.raceList(s) });   // a right answer in the first third of the time is a full step: all right and quick reaches the flag
  for (const r of ranked) {
    const m = mine.get(r.seat) || { ok: false, points: 0, none: true };
    io.toSeat(s, r.seat, { t: 'you', i: c.i, ok: m.ok, points: m.points, rank: rows ? r.rank : 0, score: r.score, ...(m.none ? { none: true } : {}) });
  }
  io.toDash(s, D.dpMsg(s));
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
  if (c) { sendQuestion(s, io); armDeadline(s, io); }
}

/** Seats in rank order (Quest Race: progress first, then score). score = the seat's score plus bonus points (the
 *  leaderboard's number; the gradebook keeps the score alone). Ties share a rank. */
export function rankSeats(s) {
  const list = [...s.seats.values()].map(seat => ({ seat: seat.no, score: seat.score + (seat.bonus || 0), prog: s.race ? Math.round((s.race.get(seat.no) || { prog: 0 }).prog) : 0 }));
  list.sort((a, b) => (b.prog - a.prog) || (b.score - a.score) || (a.seat - b.seat));
  let rank = 0, prev = null;
  list.forEach((r, i) => { const key = `${r.prog}:${r.score}`; if (key !== prev) { rank = i + 1; prev = key; } r.rank = rank; });
  return list;
}
