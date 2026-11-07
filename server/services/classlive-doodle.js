// Doodle Hoot Live (the built-in mode 'doodle'; server/live/doodle.js has the rules, docs/live-protocol.md
// "Doodle Hoot Live"). The server owns every turn: who draws, the words (three to pick from, sent to the drawer alone),
// every guess, the hints, the clock and the points. Guessing is open for the whole drawing. A guess is typed (the
// default: the text comes as code points, is compared here and forgotten at once, never kept, logged or passed on) or,
// when the host chose letter tiles, tray positions; or the drawer (or the host) says who guessed it out loud ('aw').
// The drawer and the host's page see the last few guesses: a word of the game's own reviewed list (as its word id),
// or only "something else"; a close guess is told to that guesser alone, and nobody else ever sees a guess. Drawings are relayed live and kept in this process's memory only, for replay to
// a late joiner or a reloaded page; they are wiped at the end of every turn and of the session, and never stored,
// logged, analysed or sent to any AI (tests/unit/live-doodle.test.js checks this module imports none of that).
//
// - Turns: each round, every player draws once, in the order they joined. A turn is pick (15 s, three words) -> draw
//   (60-100 s) -> reveal (5 s). Fewer than 2 players: the game waits (at most 3 minutes, then ends).
// - Strokes: ev 'ln' { s, c, w, e, p } from the drawer only, while drawing; checked for its keys, colour, size, ids,
//   bounds, steps and the turn's caps; relayed once as { s, c, w, e, a: absolute points, k: 1 for a continuation } to
//   every other device and the projector, never back to the drawer and never to a dashboard.
// - Shared state dd: numbers and tokens, plus the word only once it is revealed.
// - Private events (f 0, to one seat): ch (the three words), wd (the word: the drawer, or a guesser who solved it),
//   tray (the turn's shape: the tiles, or none when typing), hn / hd (hints), gr (a guess's result), full (the page is
//   full), cv (a canvas replay, in chunks); fd (guesses so far: to the drawer and the projector only).
import crypto from 'node:crypto';
import * as DD from '../live/doodle.js';
import { doodle } from '../live/doodle-core.js';
import { profanityMatch } from './textfilter.js';

/** Tests shorten the waits. drawMs: a fixed drawing time instead of the room's seconds; reloadMs: a seat still counts
 *  as in the game this long after its connection drops (a reload), so the game doesn't stop to wait for it. */
export const hooks = { pickMs: DD.PICK_MS, revealMs: DD.REVEAL_MS, holdMs: DD.HOLD_MS, graceMs: DD.DROP_GRACE_MS, waitMs: DD.WAIT_MAX_MS, gapMs: DD.GUESS_GAP_MS, typeGapMs: DD.TYPE_GAP_MS, awardGapMs: DD.AWARD_GAP_MS, drawMs: 0, reloadMs: 8000, replayMs: DD.REPLAY_GAP_MS };
/** A connection with more than this waiting stops getting strokes; it gets the whole canvas again once it drains. */
export const MAX_BUFFERED = 64 * 1024;
const C = () => doodle().DoodleCore;
/** The most numbers one stroke message carries (30 points). */
const DD_MAX_NUMS = 60;
const W = () => doodle().DoodleWords;
/** Decoy pools for the languages that take theirs from the word list, worked out once per language. */
const pools = new Map();
const poolFor = lang => { if (!pools.has(lang)) pools.set(lang, C().wordPool(W(), lang)); return pools.get(lang); };
/** Each language's whole list (every level), made comparable: the only words a guess can be passed on as. */
const lists = new Map();
const listFor = lang => { if (!lists.has(lang)) lists.set(lang, C().index(W(), lang)); return lists.get(lang); };
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const plain = (d, keys) => !!d && typeof d === 'object' && !Array.isArray(d) && Object.keys(d).every(k => keys.includes(k));
// (a seat that never connected counts only for reloadMs after it joined, from its leftAt: join calls alone never fill
// the room, block the hide vote or keep the game out of "waiting for players")
const here = (seat, now) => !!seat && (!!seat.conn || (!!seat.leftAt && now - seat.leftAt < hooks.reloadMs));

/** Set up a new room's game from its starter id (or the default). -> the parsed starter. */
export function init(s, id) {
  const p = DD.parseId(id) || DD.parseId(DD.DEFAULT_ID);
  s.doodle = {
    id: DD.makeId(p), lang: p.lang, lvl: p.lvl, rds: p.rounds, secs: p.secs, dir: C().dir(p.lang), tiles: !!p.tiles,
    rd: 0, tn: 0, ph: 'lobby', order: [], oi: -1, dr: 0, used: new Set(), cats: [],
    choices: null, word: null, tray: null, decoys: [], removed: new Set(), plan: [], hints: [], step: 0, trayTo: new Set(),
    endAt: 0, left: 0, running: false, drawMs: 0, waitFrom: 0, waitWas: null, waitLeft: 0,
    got: [], pts: new Map(), guess: new Map(), hid: new Set(), ans: null, feed: [], awAt: 0,
    canvas: [], points: 0, last: null, maxId: -1, rate: [], full: false, dropAt: 0, stale: new Set(), staleHost: false, drops: 0,
    rv: null, top: null, doneAt: 0, dirty: false, sentAt: 0, done: false, replays: new Map(),
  };
  s.state = { ...s.state, dd: publicState(s, 0) };
  s.stateBytes = JSON.stringify(s.state).length;
  return p;
}

/** The game as everyone sees it: numbers and tokens; the word only in the reveal. */
export function publicState(s, now) {
  const x = s.doodle;
  const left = Math.max(0, Math.round(x.running && x.ph !== 'wait' ? x.endAt - now : x.ph === 'wait' ? x.waitLeft : x.left));
  return {
    lang: x.lang, lvl: x.lvl, rds: x.rds, rd: x.rd, tn: x.tn, ph: x.ph, dr: x.dr, secs: x.secs, dir: x.dir, tl: x.tiles ? 1 : 0,
    run: x.running && x.ph !== 'wait' ? 1 : 0, end: x.running && x.ph !== 'wait' ? x.endAt : 0, left,
    g: x.word && (x.ph === 'draw' || x.ph === 'reveal' || (x.ph === 'wait' && x.waitWas === 'draw')) ? x.word.groups.slice() : null,
    hint: x.hints.length, got: x.got.slice(), order: x.order.slice(),
    rv: x.rv, top: x.top,
  };
}
function send(s, io, now) {
  const x = s.doodle;
  x.dirty = false; x.sentAt = now;
  io.publish(s, { dd: publicState(s, now) });
}
const toSeat = (s, io, no, k, d) => io.toSeat(s, no, { t: 'ev', f: 0, k, d });

/** May the host start? (two players at least) */
export const canStart = s => s.seats.size >= 2;
/** Seats in the game now, in join order. */
const present = (s, now) => [...s.seats.values()].filter(seat => here(seat, now)).sort((a, b) => a.no - b.no);

// ---------------------------------------------------------------- turns
/** Play starts (after the countdown): round 1, the first turn. */
export function start(s, io) {
  const x = s.doodle, now = io.now();
  if (x.rd) return;
  x.rd = 1; x.order = present(s, now).map(seat => seat.no); x.oi = -1; x.running = true;
  nextTurn(s, io, now);
}

/** Three words for the drawer: different, never used this session, spread over the list, avoiding the categories of
 *  the last two turns. When the list runs out it starts again. */
function choose(s) {
  const x = s.doodle;
  let pool = DD.wordsFor(x.lang, x.lvl).filter(w => !x.used.has(w.id));
  if (pool.length < 3) { x.used.clear(); pool = DD.wordsFor(x.lang, x.lvl); }
  const fresh = pool.filter(w => !x.cats.includes(w.cat));
  const from = fresh.length >= 3 ? fresh : pool, out = [];
  const third = Math.max(1, Math.floor(from.length / 3));
  for (let k = 0; k < 3; k++) {
    const part = from.slice(k * third, k === 2 ? from.length : (k + 1) * third).filter(w => !out.includes(w));
    const list = part.length ? part : from.filter(w => !out.includes(w));
    out.push(list[crypto.randomInt(list.length)]);
  }
  return out;
}

/** The next turn: the next player in this round's order who is still here (a new round, or the end, when there is
 *  none). Every turn starts with a clean page. */
function nextTurn(s, io, now) {
  const x = s.doodle;
  if (x.done) return;
  // fewer than two players here (a reload counts): wait for them instead of running through the turns
  // (the wait goes back to an ended reveal, so the next turn starts as soon as there are two)
  if (present(s, now).length < 2) { x.ph = 'reveal'; x.endAt = now; x.left = 0; enterWait(s, io, now); return; }
  wipeTurn(x);
  for (;;) {
    x.oi++;
    if (x.oi >= x.order.length) {
      if (x.rd >= x.rds) { finish(s, io); return; }
      x.rd++; x.order = present(s, now).map(seat => seat.no); x.oi = -1;
      if (!x.order.length) { finish(s, io); return; }
      continue;
    }
    // the next drawer: anyone still here, a reload included (a drawer who doesn't come back has the pick's grace)
    const seat = s.seats.get(x.order[x.oi]);
    if (here(seat, now)) break;
  }
  x.tn++; x.dr = x.order[x.oi]; x.ph = 'pick'; x.rv = null; x.waitWas = null;
  x.choices = choose(s);
  x.endAt = now + hooks.pickMs; x.left = hooks.pickMs; x.running = s.phase === 'playing';
  if (!x.running) x.left = hooks.pickMs;
  sendChoices(s, io, now);
  send(s, io, now);
  if (present(s, now).length < 2) enterWait(s, io, now);
}
function sendChoices(s, io, now) {
  const x = s.doodle;
  if (x.ph !== 'pick' || !x.choices) return;
  toSeat(s, io, x.dr, 'ch', { v: 1, n: x.tn, w: x.choices.map(c => c.w), e: x.choices.map(c => c.e), ms: Math.max(0, Math.round(x.running ? x.endAt - now : x.left)) });
}
function wipeTurn(x) {
  x.choices = null; x.word = null; x.tray = null; x.decoys = []; x.removed = new Set(); x.plan = []; x.hints = []; x.step = 0; x.trayTo = new Set();
  x.got = []; x.pts = new Map(); x.guess = new Map(); x.hid = new Set(); x.ans = null; x.feed = []; x.awAt = 0;
  x.canvas = []; x.points = 0; x.last = null; x.maxId = -1; x.rate = []; x.full = false; x.dropAt = 0; x.stale = new Set(); x.staleHost = false;
}

/** The drawer picked word i (or the clock picked for them): the drawing starts, the trays go out. */
export function pick(s, io, seat, d) {
  const x = s.doodle;
  if (x.ph !== 'pick' || !x.running || !seat || seat.no !== x.dr || !plain(d, ['n', 'i']) || d.n !== x.tn || !int(d.i, 0, 2)) return false;
  return beginDraw(s, io, d.i);
}
function beginDraw(s, io, i) {
  const x = s.doodle, now = io.now(), core = C();
  const c = x.choices && x.choices[i];
  if (!c) return false;
  x.used.add(c.id); x.cats = [c.cat, ...x.cats].slice(0, 2);
  const P = core.parts(c.w, x.lang);
  // (copied out of the game's vm context into plain arrays)
  x.word = { id: c.id, w: c.w, e: c.e, g: [...P.g], groups: [...P.groups] };
  if (x.tiles) {
    // (profanityMatch looks at word starts; core.rude, the same lists hashed, looks anywhere in the run of tiles)
    const built = core.buildTray(c.w, x.lang, x.lvl, core.rng(crypto.randomInt(2 ** 32)), { pool: poolFor(x.lang), bad: text => !!profanityMatch(text) || core.rude(text) });
    x.tray = [...built.tray]; x.decoys = [...built.decoys];
  } else { x.tray = []; x.decoys = []; }
  // what a typed guess may be: the word, and in English its other spelling
  x.ans = [...core.answers(W(), x.lang, c.id)];
  x.plan = [...core.hintPlan(P.g.length, core.rng(crypto.randomInt(2 ** 32)))];
  x.choices = null; x.ph = 'draw';
  x.drawMs = hooks.drawMs || x.secs * 1000; x.endAt = now + x.drawMs; x.left = x.drawMs;
  toSeat(s, io, x.dr, 'wd', { n: x.tn, w: c.w, e: c.e, s0: 0 });
  for (const seat of s.seats.values()) if (seat.no !== x.dr && seat.conn) sendTray(s, io, seat);
  send(s, io, now);
  return true;
}
/** A guesser's turn (the word's shape, the tiles when the host chose them, the hints so far): when the drawing starts,
 *  and again on a reload or a late join. A typed turn has no tiles (t: [], ty: 1) and its hints are letters. */
function sendTray(s, io, seat) {
  const x = s.doodle;
  if (!x.tray || seat.no === x.dr) return false;
  x.trayTo.add(seat.no);
  const base = { v: 1, n: x.tn, t: x.tray.slice(), g: x.word.groups.slice(), dir: x.dir, ok: x.got.includes(seat.no) };
  return toSeat(s, io, seat.no, 'tray', x.tiles ? { ...base, rm: [...x.removed], hn: x.hints.map(h => [h.i, h.t]) } : { ...base, ty: 1, hn: x.hints.map(h => [h.i, h.l]) });
}

/** The end of a turn: why 'time' | 'all' (everyone guessed) | 'skip' (the host) | 'gone' (the drawer left) | 'hid'
 *  (the room hid the drawing). The word and everyone's points show for the reveal. */
function endTurn(s, io, why) {
  const x = s.doodle, now = io.now();
  if (x.ph !== 'draw' && x.ph !== 'pick' && !(x.ph === 'wait' && (x.waitWas === 'draw' || x.waitWas === 'pick'))) return false;
  const was = x.ph === 'wait' ? x.waitWas : x.ph;
  x.ph = was;
  const drawer = s.seats.get(x.dr);
  if (was === 'draw' && x.word) {
    // who could have guessed: the guessers here now, and anyone who guessed it and then left
    const eligible = new Set(x.got);
    for (const seat of s.seats.values()) if (seat.no !== x.dr && here(seat, now) && x.trayTo.has(seat.no)) eligible.add(seat.no);
    for (const no of x.trayTo) { const seat = s.seats.get(no); if (seat && (here(seat, now) || x.got.includes(no))) { seat.answered++; s.dpDirty = true; } }
    if (drawer && why !== 'skip' && why !== 'hid') {
      const p = C().drawPoints(x.got.length, eligible.size);
      if (p) { drawer.score += p; s.scoresDirty = true; }
      x.pts.set(x.dr, p);
    }
  }
  // a drawing the host skipped, the room hid or whose drawer left is wiped at once, never shown in the reveal
  if (why === 'hid' || why === 'gone' || why === 'skip') clearAll(s, io);
  const w = x.word || (x.choices && x.choices[0]) || null;
  x.rv = { w: was === 'draw' && x.word ? x.word.w : '', e: was === 'draw' && x.word ? x.word.e : '', pts: [...x.pts].map(([no, p]) => [no, p]), why };
  if (!w) x.rv.w = '';
  x.ph = 'reveal'; x.choices = null; x.running = s.phase === 'playing';
  x.endAt = now + hooks.revealMs; x.left = hooks.revealMs;
  send(s, io, now);
  if (io.leaderboard && s.scoresDirty) io.leaderboard(s);
  return true;
}

/** The final podium: the top three for HOLD_MS, then the session ends (the platform's podium and results). */
export function finish(s, io) {
  const x = s.doodle, now = io.now();
  if (x.done) return;
  // (a player the host removed never stands on the podium)
  const rows = [...s.seats.values(), ...(s.gone || []).filter(seat => !seat.removed)].map(seat => [seat.no, (seat.score || 0) + (seat.bonus || 0)]).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  wipeTurn(x);
  x.done = true; x.ph = 'done'; x.top = rows.slice(0, 3); x.rv = null; x.doneAt = now; x.running = s.phase === 'playing';
  send(s, io, now);
  if (io.leaderboard) io.leaderboard(s);
}

// ---------------------------------------------------------------- the clock
/** Pause (the host, or eyes up): the turn's clock stops; strokes and guesses are dropped until it runs again. */
export function pause(s, io) {
  const x = s.doodle, now = io.now();
  if (!x.running) return;
  if (x.ph !== 'wait') x.left = Math.max(0, x.endAt - now);
  x.running = false;
  send(s, io, now);
}
export function resume(s, io) {
  const x = s.doodle, now = io.now();
  if (x.running || !x.rd) return;
  if (x.ph !== 'wait') x.endAt = now + x.left;
  x.running = true;
  if (x.ph === 'done') x.doneAt = now;
  send(s, io, now);
  sendChoices(s, io, now);
}
function enterWait(s, io, now) {
  const x = s.doodle;
  if (x.ph === 'wait' || x.ph === 'done') return;
  x.waitWas = x.ph; x.waitLeft = Math.max(0, x.running ? x.endAt - now : x.left); x.waitFrom = now; x.ph = 'wait';
  send(s, io, now);
}
function leaveWait(s, io, now) {
  const x = s.doodle;
  if (x.ph !== 'wait') return;
  x.ph = x.waitWas; x.waitWas = null; x.endAt = now + x.waitLeft; x.left = x.waitLeft;
  send(s, io, now);
  sendChoices(s, io, now);
}

/** Every tick (100 ms): the turn's clock, the hints, a drawer who left, waiting for players, slow connections. */
export function tick(s, io) {
  const x = s.doodle, now = io.now();
  if (!x.rd) return;
  catchUp(s, io);
  if (x.ph === 'done') { if (x.running && now - x.doneAt >= hooks.holdMs) io.end(s, 'ended'); return; }
  if (!x.running) return;
  const n = present(s, now).length;
  if (x.ph === 'wait') {
    if (n >= 2) leaveWait(s, io, now);
    else if (now - x.waitFrom >= hooks.waitMs) { finish(s, io); x.doneAt = now - hooks.holdMs; }
    return;
  }
  if (n < 2) { enterWait(s, io, now); return; }
  const drawer = s.seats.get(x.dr);
  if (x.ph === 'pick') {
    if (!drawer || (!drawer.conn && now - (drawer.leftAt || now) >= hooks.graceMs)) { endTurn(s, io, 'gone'); return; }
    if (now >= x.endAt) beginDraw(s, io, crypto.randomInt(3));
  } else if (x.ph === 'draw') {
    if (!drawer || (!drawer.conn && now - (drawer.leftAt || now) >= hooks.graceMs)) { endTurn(s, io, 'gone'); return; }
    hints(s, io, now);
    // (a guesser whose reload grace ran out no longer holds the turn open)
    if (allSolved(s, now)) { endTurn(s, io, 'all'); return; }
    if (now >= x.endAt) endTurn(s, io, 'time');
  } else if (x.ph === 'reveal') {
    if (now >= x.endAt) nextTurn(s, io, now);
  }
  if (x.dirty && now - x.sentAt >= DD.SEND_MS) send(s, io, now);
}

/** Hints over the drawing time (DoodleCore.HINTS): two decoys go, then letters lock into their slots, never more than
 *  half the word. Every guesser gets the same hint at the same moment. */
function hints(s, io, now) {
  const x = s.doodle, H = C().HINTS;
  while (x.step < H.length) {
    const h = H[x.step], at = x.drawMs * h.at;
    if (x.drawMs - (x.endAt - now) < at) return;
    x.step++;
    if (h.min && x.word.g.length < h.min) continue;
    if (h.k === 'decoys') {
      // (typing has no tiles: only the letter hints)
      if (!x.tiles) continue;
      const gone = x.decoys.filter(i => !x.removed.has(i)).slice(0, h.n);
      if (!gone.length) continue;
      for (const i of gone) x.removed.add(i);
      for (const no of x.trayTo) if (no !== x.dr) toSeat(s, io, no, 'hd', { n: x.tn, t: gone });
    } else {
      const slot = x.plan.find(i => !x.hints.some(q => q.i === i));
      if (slot === undefined) continue;
      if (!x.tiles) {
        const l = x.word.g[slot];
        x.hints.push({ i: slot, t: -1, l });
        for (const no of x.trayTo) if (no !== x.dr) toSeat(s, io, no, 'hn', { n: x.tn, i: slot, l });
        x.dirty = true;
        continue;
      }
      const usedT = new Set(x.hints.map(q => q.t));
      const t = x.tray.findIndex((g, i) => g === x.word.g[slot] && !usedT.has(i) && !x.decoys.includes(i));
      if (t < 0) continue;
      x.hints.push({ i: slot, t });
      for (const no of x.trayTo) if (no !== x.dr) toSeat(s, io, no, 'hn', { n: x.tn, i: slot, t });
      x.dirty = true;
    }
  }
}

// ---------------------------------------------------------------- what players send
/** A player's game event (never relayed as it is): pk, ln, un, cl, gs, aw, hide or need. -> true when it did something. */
export function fromPlayer(s, io, seat, m) {
  const x = s.doodle;
  if (!x || !seat) return false;
  switch (m.k) {
    case 'need': return resync(s, io, seat);
    case 'pk': return s.phase === 'playing' && pick(s, io, seat, m.d);
    case 'ln': return stroke(s, io, seat, m.d);
    case 'un': return undo(s, io, seat, m.d);
    case 'cl': return drawerClear(s, io, seat, m.d);
    case 'gs': return guess(s, io, seat, m.d);
    case 'aw': return award(s, io, m.d, seat);
    case 'hide': return hide(s, io, seat, m.d);
    default: return false;
  }
}
/** The host's page's game event: aw (who guessed it out loud). -> bool */
export function fromHost(s, io, m) {
  const x = s.doodle;
  if (!x || !m) return false;
  return m.k === 'aw' ? award(s, io, m.d, null) : false;
}
const drop = x => { x.drops++; return false; };
const drawing = (s, seat) => { const x = s.doodle; return s.phase === 'playing' && x.ph === 'draw' && x.running && !!seat && seat.no === x.dr; };

/** One stroke message from the drawer (see the top of this file). Points past the board's edge are clamped. */
export function stroke(s, io, seat, d) {
  const x = s.doodle, now = io.now();
  if (!drawing(s, seat) || !plain(d, ['s', 'c', 'w', 'e', 'p'])) return drop(x);
  const { s: id, c, w, e, p } = d;
  if (!int(id, 0, 4095) || !int(c, 0, 11) || !int(w, 0, 3) || !(e === 0 || e === 1)) return drop(x);
  if (!Array.isArray(p) || p.length < 2 || p.length > DD_MAX_NUMS || p.length % 2 || !p.every(v => Number.isInteger(v))) return drop(x);
  const last = x.last, cont = !!last && last.s === id;
  if (cont) {
    if (last.c !== c || last.w !== w || last.e !== e || !p.every(v => Math.abs(v) <= 127)) return drop(x);
  } else {
    if (id <= x.maxId || id > x.maxId + 17) return drop(x);
    if (!int(p[0], 0, 1000) || !int(p[1], 0, 750) || !p.slice(2).every(v => Math.abs(v) <= 127)) return drop(x);
  }
  const n = p.length / 2;
  if (x.points + n > DD.MAX_POINTS || (!cont && x.canvas.length >= DD.MAX_STROKES)) {
    if (!x.full) { x.full = true; toSeat(s, io, seat.no, 'full', { n: x.tn }); }
    return drop(x);
  }
  // points a second, over a rolling 2 s
  x.rate = x.rate.filter(r => now - r[0] < 2000);
  if (x.rate.reduce((a, r) => a + r[1], 0) + n > DD.MAX_PPS * 2) return drop(x);
  x.rate.push([now, n]);
  const cl = (v, hi) => Math.max(0, Math.min(hi, v));
  let px, py, i = 0;
  const a = [];
  if (cont) { px = last.pts[last.pts.length - 2]; py = last.pts[last.pts.length - 1]; } else { px = p[0]; py = p[1]; a.push(px, py); i = 2; }
  for (; i < p.length; i += 2) { px = cl(px + p[i], 1000); py = cl(py + p[i + 1], 750); a.push(px, py); }
  if (cont) last.pts.push(...a);
  else { x.last = { s: id, c, w, e, pts: a }; x.canvas.push(x.last); x.maxId = id; }
  x.points += a.length / 2;
  relay(s, io, { t: 'ev', f: x.dr, k: 'ln', d: { s: id, c, w, e, a, ...(cont ? { k: 1 } : {}) } });
  return true;
}

/** Undo: the drawer's last stroke goes, on every screen (its id must be the last stroke's). */
export function undo(s, io, seat, d) {
  const x = s.doodle;
  if (!drawing(s, seat) || !plain(d, ['n', 's']) || d.n !== x.tn || !int(d.s, 0, 4095)) return drop(x);
  const last = x.canvas[x.canvas.length - 1];
  if (!last || last.s !== d.s) return drop(x);
  x.canvas.pop(); x.points -= last.pts.length / 2; x.last = null; x.full = false;
  relay(s, io, { t: 'ev', f: x.dr, k: 'un', d: { n: x.tn, s: d.s } });
  return true;
}
/** The drawer clears their own page. */
export function drawerClear(s, io, seat, d) {
  const x = s.doodle;
  if (!drawing(s, seat) || !plain(d, ['n']) || d.n !== x.tn) return drop(x);
  x.canvas = []; x.points = 0; x.last = null; x.full = false;
  relay(s, io, { t: 'ev', f: x.dr, k: 'cl', d: { n: x.tn } });
  return true;
}
/** The host's Clear drawing: the page is wiped on every screen, the drawer's too. -> bool */
export function hostClear(s, io) {
  const x = s.doodle;
  if (!x || (x.ph !== 'draw' && x.ph !== 'reveal' && !(x.ph === 'wait' && (x.waitWas === 'draw' || x.waitWas === 'reveal')))) return false;
  clearAll(s, io);
  return true;
}
function clearAll(s, io) {
  const x = s.doodle;
  x.canvas = []; x.points = 0; x.last = null; x.full = false;
  const str = JSON.stringify({ t: 'ev', f: 0, k: 'cl', d: { n: x.tn } });
  for (const seat of s.seats.values()) if (seat.conn) io.sendTo(seat.conn, str);
  io.toProjector(s, str);
}
/** A relayed drawing message: built once, sent to every other device and the projector (not the drawer, not the
 *  dashboards). A connection that has fallen behind is skipped and gets the whole page once it catches up. */
function relay(s, io, msg) {
  const x = s.doodle, str = JSON.stringify(msg);
  for (const seat of s.seats.values()) {
    if (!seat.conn || seat.no === x.dr) continue;
    if (x.stale.has(seat.no)) continue;
    if ((seat.conn.bufferedAmount || 0) > MAX_BUFFERED) { x.stale.add(seat.no); continue; }
    io.sendTo(seat.conn, str);
  }
  const h = s.host.conn;
  if (h && !x.staleHost) { if ((h.bufferedAmount || 0) > MAX_BUFFERED) x.staleHost = true; else io.sendTo(h, str); }
}
/** Connections that fell behind and have caught up: the whole page again. */
function catchUp(s, io) {
  const x = s.doodle;
  for (const no of [...x.stale]) {
    const seat = s.seats.get(no);
    if (!seat || !seat.conn) { x.stale.delete(no); continue; }
    if ((seat.conn.bufferedAmount || 0) < MAX_BUFFERED / 2) { x.stale.delete(no); sendCanvas(s, io, seat); }
  }
  if (x.staleHost) { const h = s.host.conn; if (!h) x.staleHost = false; else if ((h.bufferedAmount || 0) < MAX_BUFFERED / 2) { x.staleHost = false; sendCanvas(s, io, null); } }
}

/**
 * The page so far, from memory, to one device (a seat, or the projector when seat is null): ev 'cv' { n, k, of, l } in
 * chunks of at most CHUNK_BYTES; l is [[s, c, w, e, x, y, x, y, ...], ...]; k 0 tells the device to clear first.
 */
export function sendCanvas(s, io, seat) {
  const x = s.doodle;
  if (!x || !x.tn) return 0;
  const list = x.canvas.map(st => [st.s, st.c, st.w, st.e, ...st.pts]);
  const chunks = [];
  let cur = [], bytes = 0;
  for (const r of list) {
    const b = JSON.stringify(r).length + 1;
    if (cur.length && bytes + b > DD.CHUNK_BYTES) { chunks.push(cur); cur = []; bytes = 0; }
    cur.push(r); bytes += b;
  }
  chunks.push(cur);
  const to = msg => (seat ? io.sendTo(seat.conn, msg) : io.toProjector(s, msg));
  chunks.forEach((l, k) => to(JSON.stringify({ t: 'ev', f: 0, k: 'cv', d: { n: x.tn, k, of: chunks.length, l } })));
  return chunks.length;
}

/** A guess, while drawing, from an unsolved guesser who has the turn: typed (code points: { n, c }) or, when the host
 *  chose letter tiles, tray positions in slot order ({ n, t }). The result goes to that player alone (gr). */
export function guess(s, io, seat, d) {
  const x = s.doodle;
  if (s.phase !== 'playing' || x.ph !== 'draw' || !x.running || seat.no === x.dr || !x.trayTo.has(seat.no) || x.got.includes(seat.no)) return drop(x);
  return x.tiles ? tileGuess(s, io, seat, d) : typedGuess(s, io, seat, d);
}
/** Tiles: at most one every GUESS_GAP_MS and guessMax() wrong ones a turn (a short word can't be found by trying every
 *  order). */
function tileGuess(s, io, seat, d) {
  const x = s.doodle, now = io.now();
  if (!plain(d, ['n', 't']) || d.n !== x.tn || !Array.isArray(d.t) || d.t.length !== x.word.g.length) return drop(x);
  const g = x.guess.get(seat.no) || { wrong: 0, at: 0 };
  const most = DD.guessMax(x.word.g.length);
  if (now - g.at < hooks.gapMs || g.wrong >= most) return drop(x);
  g.at = now; x.guess.set(seat.no, g);
  const locks = {}; for (const h of x.hints) locks[h.i] = h.t;
  if (C().check(x.tray, x.word.g, d.t, locks)) return solved(s, io, seat, now, false);
  g.wrong++;
  toSeat(s, io, seat.no, 'gr', { n: x.tn, ok: false, left: most - g.wrong });
  return true;
}
/** A typed guess: 1-40 code points (no control characters), at most one every TYPE_GAP_MS and TYPE_MAX wrong ones a
 *  turn. The text is compared here (DoodleCore.judge) and forgotten: it is never kept, logged or passed on. The drawer
 *  and the projector hear of a wrong guess only as a word id of the game's own list, or as "something else", or as
 *  "close" (no text); a close guess is told to that guesser alone ("So close!"). */
function typedGuess(s, io, seat, d) {
  const x = s.doodle, now = io.now();
  if (!plain(d, ['n', 'c']) || d.n !== x.tn || !Array.isArray(d.c) || d.c.length < 1 || d.c.length > C().MAX_TYPED) return drop(x);
  if (!d.c.every(v => int(v, 32, 0x10FFFF) && !(v >= 0x7F && v <= 0x9F) && !(v >= 0xD800 && v <= 0xDFFF))) return drop(x);
  const g = x.guess.get(seat.no) || { wrong: 0, at: 0 };
  if (now - g.at < hooks.typeGapMs || g.wrong >= DD.TYPE_MAX) return drop(x);
  g.at = now; x.guess.set(seat.no, g);
  const r = C().judge(String.fromCodePoint(...d.c), x.ans, x.lang, listFor(x.lang));
  if (!r) return drop(x);
  if (r.k === 'ok') return solved(s, io, seat, now, false);
  g.wrong++;
  toSeat(s, io, seat.no, 'gr', { n: x.tn, ok: false, left: DD.TYPE_MAX - g.wrong, ...(r.k === 'close' ? { c: 1 } : {}) });
  // (only a word id of the reviewed list ever goes on, never what was typed)
  feed(s, io, r.k === 'word' && typeof r.id === 'string' ? [seat.no, 'w', r.id] : [seat.no, r.k === 'close' ? 'c' : 'x']);
  return true;
}
/** Who guessed it out loud ({ n, s: their seat }): the drawer, or the host's page (who = null), while drawing; a
 *  player here who has the turn and hasn't got it yet (so once a turn each), at most one award every AWARD_GAP_MS.
 *  It counts as their right guess (the same points by speed; the drawer's share as usual). */
export function award(s, io, d, who) {
  const x = s.doodle, now = io.now();
  if (s.phase !== 'playing' || x.ph !== 'draw' || !x.running || (who && who.no !== x.dr)) return drop(x);
  if (!plain(d, ['n', 's']) || d.n !== x.tn || !int(d.s, 1, 100000)) return drop(x);
  const seat = s.seats.get(d.s);
  if (!seat || seat.no === x.dr || !here(seat, now) || !x.trayTo.has(seat.no) || x.got.includes(seat.no)) return drop(x);
  if (now - x.awAt < hooks.awardGapMs) return drop(x);
  x.awAt = now;
  return solved(s, io, seat, now, true);
}
/** A guesser got it (typed, tiles or out loud): points by speed and order, less the hints; the word to them alone. */
function solved(s, io, seat, now, aloud) {
  const x = s.doodle;
  const p = C().guessPoints(Math.max(0, x.endAt - now), x.drawMs, x.got.length, x.hints.length);
  x.got.push(seat.no); x.pts.set(seat.no, p);
  seat.score += p; seat.correct++; s.scoresDirty = true; s.lastActive = now;
  toSeat(s, io, seat.no, 'gr', { n: x.tn, ok: true, p, ...(aloud ? { a: 1 } : {}) });
  toSeat(s, io, seat.no, 'wd', { n: x.tn, w: x.word.w, e: x.word.e });
  feed(s, io, [seat.no, 'ok']);
  send(s, io, now);
  if (io.leaderboard) io.leaderboard(s);
  if (allSolved(s, now)) endTurn(s, io, 'all');
  return true;
}
/** One more line of the turn's guesses list (its last FEED_MAX): [seat, 'w', word id] a word of the list, [seat, 'x']
 *  something else, [seat, 'c'] close, [seat, 'ok'] got it. To the drawer and the projector only, never to a guesser. */
function feed(s, io, e) {
  const x = s.doodle;
  x.feed.push(e); if (x.feed.length > DD.FEED_MAX) x.feed.shift();
  const d = { n: x.tn, l: [e] };
  toSeat(s, io, x.dr, 'fd', d);
  io.toProjector(s, { t: 'ev', f: 0, k: 'fd', d });
}
/** Has every guesser here now guessed it? */
function allSolved(s, now) {
  const x = s.doodle;
  // a guesser who is reloading still counts: their chance isn't taken away by a blip
  const left = [...s.seats.values()].filter(seat => seat.no !== x.dr && here(seat, now) && x.trayTo.has(seat.no) && !x.got.includes(seat.no));
  return x.got.length > 0 && !left.length;
}

/** "Hide this drawing" from a viewer: counted once a turn, the hosts told how many. When at least half the guessers
 *  here (and at least 2) hide it, the page is wiped everywhere and the turn ends with no points for the drawer. The
 *  drawer is never told who. */
export function hide(s, io, seat, d) {
  const x = s.doodle, now = io.now();
  const ph = x.ph === 'wait' ? x.waitWas : x.ph;
  if (!plain(d, ['n']) || d.n !== x.tn || seat.no === x.dr || (ph !== 'draw' && ph !== 'reveal') || x.hid.has(seat.no)) return drop(x);
  x.hid.add(seat.no);
  io.toHosts(s, { t: 'ev', f: 0, k: 'hid', d: { n: x.tn, k: x.hid.size } });
  // (only the guessers here now, and only their own hides: one who hid and then left counts no more)
  const guessers = [...s.seats.values()].filter(q => q.no !== x.dr && here(q, now));
  const hidNow = guessers.filter(q => x.hid.has(q.no)).length;
  if (x.ph === 'draw' && hidNow >= 2 && hidNow * 2 >= guessers.length) endTurn(s, io, 'hid');
  return true;
}

/** The host's Skip turn: at must be the turn number (a double tap never skips two). -> bool */
export function skip(s, io, at) {
  const x = s.doodle;
  if (!x || at !== x.tn || x.done) return false;
  if (x.ph === 'reveal' || (x.ph === 'wait' && x.waitWas === 'reveal')) {
    if (x.ph === 'wait') { x.ph = 'reveal'; x.waitWas = null; }
    clearAll(s, io); nextTurn(s, io, io.now()); return true;
  }
  return endTurn(s, io, 'skip');
}

/** A frame that loads during the game (a reload, a late joiner) or asks again ('need'): its own part of the turn, then
 *  the page so far. A late joiner is added to this round's order. */
export function resync(s, io, seat) {
  const x = s.doodle, now = io.now();
  if (!x.rd || x.done || !seat.conn) return false;
  // At most one replay a turn per connection every replayMs (a new connection, a reload, always gets one): asking again
  // and again never makes the server resend the page.
  const last = x.replays.get(seat.no);
  if (last && last.conn === seat.conn && last.tn === x.tn && now - last.at < hooks.replayMs) return drop(x);
  x.replays.set(seat.no, { conn: seat.conn, tn: x.tn, at: now });
  if (!x.order.includes(seat.no)) x.order.push(seat.no);
  const ph = x.ph === 'wait' ? x.waitWas : x.ph;
  if (ph === 'pick' && seat.no === x.dr) sendChoices(s, io, now);
  if (ph === 'draw' && x.word) {
    if (seat.no === x.dr) { toSeat(s, io, seat.no, 'wd', { n: x.tn, w: x.word.w, e: x.word.e, s0: x.maxId + 1 }); toSeat(s, io, seat.no, 'fd', { n: x.tn, l: x.feed.slice(), r: 1 }); }
    else { sendTray(s, io, seat); if (x.got.includes(seat.no)) toSeat(s, io, seat.no, 'wd', { n: x.tn, w: x.word.w, e: x.word.e }); }
  }
  if (ph === 'draw' || ph === 'reveal') {
    // a connection that is behind gets the page once it has caught up (catchUp), never on top of its backlog
    if ((seat.conn.bufferedAmount || 0) > MAX_BUFFERED / 2) x.stale.add(seat.no);
    else { x.stale.delete(seat.no); sendCanvas(s, io, seat); }
  }
  return true;
}
/** The projector's frame is ready: the page so far. */
export function hostReady(s, io) {
  const x = s.doodle;
  if (!x || !x.rd || x.done) return;
  x.staleHost = false;
  if (x.ph === 'draw' || x.ph === 'reveal' || x.ph === 'wait') sendCanvas(s, io, null);
  if (x.feed.length) io.toProjector(s, { t: 'ev', f: 0, k: 'fd', d: { n: x.tn, l: x.feed.slice(), r: 1 } });
}
/** A seat's connection dropped: nothing changes at once (a drawer has DROP_GRACE_MS to come back). */
export function dropped(s, io, seat) {
  const x = s.doodle, now = io.now();
  if (!x || !x.rd || x.done) return;
  if (x.ph === 'draw' && seat.no !== x.dr && allSolved(s, now)) endTurn(s, io, 'all');
}
/** A seat left the game (removed by the host, or gone past the hold). A drawer's turn ends at once, with the page
 *  wiped on every screen. */
export function left(s, io, seat) {
  const x = s.doodle, now = io.now();
  if (!x || !x.rd || x.done) return;
  x.stale.delete(seat.no);
  const ph = x.ph === 'wait' ? x.waitWas : x.ph;
  x.replays.delete(seat.no);
  if (seat.no === x.dr && (ph === 'pick' || ph === 'draw')) { endTurn(s, io, 'gone'); return; }
  if (ph === 'draw' && allSolved(s, now)) endTurn(s, io, 'all');
}
/** The end of the session: forget the drawing, the word and the tray at once (nothing of a drawing outlives it). */
export function wipe(s) {
  const x = s.doodle;
  if (!x) return;
  wipeTurn(x);
  x.used = new Set();
}
