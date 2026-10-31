// Oomba Live sessions: the in-memory store (docs/decisions.md "Oomba Live"; protocol: docs/live-protocol.md).
// One process holds every session, its seats, phase, clock and shared state; nothing here is written to the database
// except the summary saved when a session ends (classlive-results.js), which has no guest identifier, code or nickname.
//
// - A session has a 7-digit join code (live codes are digits only and 7 long; class codes on the same /join page are 6
//   letters and digits, so the length tells them apart). Codes are unique among open sessions, never reused within 24
//   hours, and die with the session (at its end, or after LIVE_HOURS).
// - A seat is one player. Signed-in players have one seat per session across devices (a second device takes it over).
//   A seat whose connection drops is held 60 seconds (same number, score, answers), then freed; its score stays in the
//   summary under the seat number.
// - Phases: lobby -> loading (frames load, devices say rdy; at most 20 s) -> countdown (3 s, from a server time) ->
//   playing <-> paused, between (after a round or a question's reveal) -> ... -> ended.
// - Host actions that move on (next, skip) carry the phase's seq; a stale one (a double tap) is ignored.
// - Every relayed message carries the sender's seat number (f) given by the server, never a name typed by anyone.
import crypto from 'node:crypto';
import { config } from '../config.js';
import { signToken } from '../auth.js';
import { characterOf } from './character.js';
import { log } from './log.js';
import { allow, count as rlCount, ipOf } from './ratelimit.js';
import { lifecycle } from './health.js';
import * as games from './games.js';
import * as A from './classlive-access.js';
import * as N from './classlive-names.js';
import * as P from './classlive-protocol.js';
import * as Q from './classlive-quiz.js';
import * as R from './classlive-results.js';
import * as C from './classlive-check.js';
import * as L from './lessons.js';
import * as S from './schools.js';

export const hooks = { now: () => Date.now(), log, tickMs: 100, sweepMs: 30e3, loadingMs: 20e3, countdownMs: 3000, holdMs: 60e3, hostGoneMs: 10 * 60e3, idleLobbyMs: 30 * 60e3, keepEndedMs: 10 * 60e3 };
export const PHASES = ['lobby', 'loading', 'countdown', 'playing', 'paused', 'between', 'ended'];
/** Seat and frame token lives. */
export const SEAT_TOKEN_SEC = 4 * 3600, FRAME_TOKEN_SEC = 15 * 60;
/** Backpressure: a connection with more than this waiting is skipped for a tick (it catches up from the next one). */
export const MAX_BUFFERED = 64 * 1024;

const sessions = new Map();     // sid -> Session (open ones, and ended ones for keepEndedMs)
const byCode = new Map();       // code -> sid (open sessions only)
const recentCodes = new Map();  // sha256(code) -> until: not reused within 24 hours
const hostOpen = new Map();     // host user id -> sid of their open session
let tickTimer = null, sweepTimer = null, tickNo = 0;

export const liveOn = () => !!config.liveClassroom;
const now = () => hooks.now();
const hash = code => crypto.createHash('sha256').update(String(code)).digest('base64url');
const open = s => s && s.phase !== 'ended';

// ---------------------------------------------------------------- lookups
export const get = sid => sessions.get(String(sid || '')) || null;
export const byJoinCode = code => { const sid = byCode.get(String(code || '')); return sid ? get(sid) : null; };
export const openSessions = () => [...sessions.values()].filter(open);
export const openCount = () => openSessions().length;
export const hostSession = userId => get(hostOpen.get(userId));
/** Connected seats in every open session (LIVE_MAX_SEATS). */
export function connectedSeats() { let n = 0; for (const s of openSessions()) for (const seat of s.seats.values()) if (seat.conn) n++; return n; }
export const _all = () => sessions;

/** A new 7-digit code: unique among open sessions and not used in the last 24 hours. */
export function newCode() {
  const t = now();
  for (const [h, until] of recentCodes) if (until < t) recentCodes.delete(h);
  for (let i = 0; i < 1000; i++) {
    const c = String(crypto.randomInt(1e6, 1e7));
    if (byCode.has(c) || recentCodes.has(hash(c))) continue;
    return c;
  }
  throw new Error('no free live code');
}

/** The address bucket for join limits: an IPv4 address, or an IPv6 /64 (rotating inside a /64 is free). */
export function ipKey(req) {
  const ip = ipOf(req);
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  if (ip.includes(':')) {
    // Expand :: and keep the first four groups.
    const [head, tail = ''] = ip.toLowerCase().split('::');
    const h = head ? head.split(':') : [], tl = tail ? tail.split(':') : [];
    const groups = ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - tl.length)).fill('0'), ...tl] : h;
    return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':') + '::/64';
  }
  return ip;
}

// ---------------------------------------------------------------- join limits (POST /api/live/join)
/** Wrong codes per address bucket per 10 minutes, all tries per 10 minutes, and the site-wide meter: more than
 *  STRICT.trigger misses a minute puts every bucket on STRICT.misses per 10 minutes for 10 minutes (logged once). */
export const JOIN_LIMITS = { misses: 100, tries: 600, windowMs: 10 * 60e3, minMs: 150 };
export const STRICT = { trigger: 2000, misses: 5, forMs: 10 * 60e3 };
const meter = { win: -1, n: 0, strictUntil: 0 };
export const _meter = meter;
/** A join try from this bucket: -> null when it may go on, else 'slowDown'. */
export function joinTry(key) {
  if (!allow(`lv-try:${key}`, JOIN_LIMITS.tries, JOIN_LIMITS.windowMs)) return 'slowDown';
  const max = meter.strictUntil > now() ? STRICT.misses : JOIN_LIMITS.misses;
  if (rlCount(`lv-miss:${key}`) >= max) return 'slowDown';
  return null;
}
/** A wrong code from this bucket (locked or full rooms are not misses). */
export function joinMiss(key) {
  allow(`lv-miss:${key}`, JOIN_LIMITS.misses, JOIN_LIMITS.windowMs);
  const w = Math.floor(now() / 60e3);
  if (w !== meter.win) { meter.win = w; meter.n = 0; }
  if (++meter.n === STRICT.trigger + 1 && meter.strictUntil < now()) {
    meter.strictUntil = now() + STRICT.forMs;
    hooks.log('warn', 'live join codes guessed site-wide: strict limits on', { minutes: STRICT.forMs / 60e3 });
  }
}

// ---------------------------------------------------------------- tokens
export const seatToken = (s, seat) => signToken({ s: s.id, n: seat.no, k: seat.nonce, r: 'p', ...(seat.userId ? { u: seat.userId } : {}) }, SEAT_TOKEN_SEC);
export const hostToken = s => signToken({ s: s.id, n: 0, k: s.host.nonce, r: 'h', u: s.host.userId }, SEAT_TOKEN_SEC);
/** A frame token (GET /live/frame/:token). f: 'game' or 'lobby' (the platform lobby, for games that draw none). */
export function frameToken(s, seat, f = 'game') {
  const host = !seat;
  return signToken({ s: s.id, n: host ? 0 : seat.no, k: host ? s.host.nonce : seat.nonce, r: host ? 'h' : 'p', v: s.versionId, g: s.gameId, f,
    l: (host ? s.host.lang : seat.lang) || 'en', ...(host ? { u: s.host.userId } : seat.userId ? { u: seat.userId } : {}) }, FRAME_TOKEN_SEC);
}

// ---------------------------------------------------------------- create
/**
 * host: the user; opts: { mode: 'game'|'quest-race'|'battle', gameId, setId, starter, items, audience, classId, clId,
 * stepId, maxPlayers, replace, lang, title }. -> { ok: true, session } | { ok: false, code, sid? }
 */
export function createSession(host, opts = {}) {
  if (!liveOn()) return { ok: false, code: 'off' };
  if (lifecycle.draining) return { ok: false, code: 'busy' };
  if (!A.canHost(host)) return { ok: false, code: 'notHost' };
  const mode = ['game', ...Object.keys(A.MODES)].includes(opts.mode) ? opts.mode : null;
  if (!mode) return { ok: false, code: 'mode' };
  const audience = opts.audience || 'open';
  const classId = audience === 'class' ? String(opts.classId || '') : null;
  const refusal = A.audienceRefusal(host, audience, { classId });
  if (refusal) return { ok: false, code: refusal };
  const old = hostSession(host.id);
  if (old && open(old)) {
    if (!opts.replace) return { ok: false, code: 'hasOpen', sid: old.id };
    endSession(old.id, 'ended');
  }
  if (openCount() >= config.liveMaxSessions) return { ok: false, code: 'busy' };
  const game = mode === 'game' ? games.getGame(opts.gameId) : games.getGameBySlug(A.MODES[mode]);
  if (mode !== 'game' && (!game || !A.isOfficial(game) || !game.published_version_id)) return { ok: false, code: 'notFound' };
  const h = A.hostable(host, game, audience, { classId });
  if (!h.ok) return { ok: false, code: h.code };
  const check = C.liveCheck(h.versionId);
  if (!check.ready) return { ok: false, code: 'notReady', issue: check.issues[0] || null };
  // Quiz modes, and games that declare quiz:true, need a question set.
  const quiz = mode !== 'game' || check.quiz;
  let items = null, setId = null;
  if (quiz) {
    const loaded = Q.loadItems(host, { setId: opts.setId, starter: opts.starter, items: opts.items, lang: opts.lang });
    if (!loaded.ok) return { ok: false, code: loaded.code };
    items = loaded.items; setId = loaded.setId || null;
  }
  // A class lesson step this run counts for: only a game step of this very game, in this class.
  let clId = null, stepId = null;
  if (audience === 'class' && opts.clId && opts.stepId) {
    const cl = L.getClassLesson(String(opts.clId)), step = L.getStep(String(opts.stepId));
    if (cl && step && cl.class_id === classId && step.lesson_id === cl.lesson_id && step.kind === 'game' && step.game_id === game.id) { clId = cl.id; stepId = step.id; }
  }
  const t = now();
  const s = {
    id: crypto.randomBytes(16).toString('base64url'), code: newCode(),
    host: { userId: host.id, nonce: crypto.randomBytes(12).toString('base64url'), conn: null, lang: opts.lang || 'en', goneAt: t },
    createdAt: t, endsAt: t + config.liveHours * 3600e3, startedAt: null, endedAt: null, why: null,
    audience, nameMode: A.nameMode(host, audience, classId), mode, quiz, official: !!h.official,
    gameId: game.id, versionId: h.versionId, setId, classId, clId, stepId,
    title: String(opts.title || game.title || '').slice(0, 80), lobbyByGame: !!check.lobby,
    cfg: { presence: { bounds: 100, maxSpeed: 12 }, maxScorePerSec: 1000, lobby: !!check.lobby, quiz: !!check.quiz, hostView: !!check.hostView, threeD: !!check.threeD, twoD: !!check.twoD },
    settings: { maxPlayers: A.maxPlayersFor(host, audience, opts.maxPlayers), locked: false, autoLock: audience === 'open' },
    phase: 'lobby', round: 0, at: t, pausedAt: 0, seq: 1, seatSeq: 0, lastActive: t,
    seats: new Map(), byUser: new Map(), nicksUsed: new Set(), banned: new Set(),
    state: {}, stateBytes: 2, items, qz: null, race: mode === 'quest-race' ? new Map() : null,
    itemStats: new Map(), dirty: new Set(), scoresDirty: false, timers: {}, reports: 0, summary: null,
  };
  sessions.set(s.id, s); byCode.set(s.code, s.id); hostOpen.set(host.id, s.id);
  startTimers();
  hooks.log('info', 'live session opened', { sid: s.id, mode, audience, players: s.settings.maxPlayers });
  return { ok: true, session: s };
}

// ---------------------------------------------------------------- seats
const seatName = (s, seat) => (s.nameMode === 'accounts' && seat.name ? seat.name : seat.nick);
export const tuple = (s, seat) => P.playerTuple(seat, seatName(s, seat));
export const roster = s => [...s.seats.values()].map(seat => tuple(s, seat));

/**
 * Take a seat. user: the signed-in account (null for a guest); opts: { asGuest, useMine, lang }.
 * -> { ok: true, seat, token, again } | { ok: false, code: 'ended'|'locked'|'full'|'signIn'|'notMember'|'removed'|'takenDown' }
 */
export function join(s, user, { asGuest = false, useMine = false, lang = 'en' } = {}) {
  if (!open(s)) return { ok: false, code: 'ended' };
  const u = user && !user.is_guest && !user.banned && !(asGuest && s.audience === 'open') ? user : null;
  const ok = A.joinCheck(s, u);
  if (!ok.ok) return ok;
  if (u && s.banned.has(u.id)) return { ok: false, code: 'removed' };
  if (u && s.byUser.has(u.id)) {
    const seat = s.seats.get(s.byUser.get(u.id));
    if (seat) { seat.lang = lang; return { ok: true, seat, token: seatToken(s, seat), again: true }; }
  }
  if (!A.seatCanView(s, u)) return { ok: false, code: 'takenDown' };
  if (s.settings.locked) return { ok: false, code: 'locked' };
  if (s.seats.size >= s.settings.maxPlayers || connectedSeats() >= config.liveMaxSeats) return { ok: false, code: 'full' };
  const t = now();
  const no = ++s.seatSeq;
  const nick = N.pickNick(s.nicksUsed); s.nicksUsed.add(nick);
  const own = u && (s.audience !== 'open' || useMine) ? characterOf(u) : null;
  const seat = {
    no, nonce: crypto.randomBytes(12).toString('base64url'), userId: u ? u.id : null, kind: ok.kind, nick,
    name: s.nameMode === 'accounts' && u ? String(u.display_name || u.username).slice(0, 40) : '',
    avatar: own || N.randomAvatar(), ownAvatar: !!own, team: 0, lang,
    score: 0, scoredBy: s.quiz ? 'server' : 'game', correct: 0, answered: 0, streak: 0, items: new Map(), lastScoreAt: t,
    pos: null, lastMoveAt: 0, lastJumpAt: 0, conn: null, everConnected: false, leftAt: t, rtt: 0, ready: false, late: s.phase !== 'lobby', view: '3d',
    buckets: null,
  };
  s.seats.set(no, seat);
  if (u) s.byUser.set(u.id, no);
  if (s.race) s.race.set(no, { prog: 0, gems: 0 });
  s.lastActive = t;
  broadcast(s, { t: 'pj', p: tuple(s, seat) });
  return { ok: true, seat, token: seatToken(s, seat), again: false };
}

/** A new nickname and avatar, before the player has entered (connected) for the first time. -> the seat or null. */
export function reroll(s, seat) {
  if (!open(s) || !seat || seat.everConnected || s.nameMode === 'accounts' || seat.ownAvatar) return null;
  if (!N.mayReroll(seat.nonce)) return null;
  s.nicksUsed.delete(seat.nick);
  seat.nick = N.pickNick(s.nicksUsed); s.nicksUsed.add(seat.nick);
  seat.avatar = N.randomAvatar();
  broadcast(s, { t: 'pu', p: tuple(s, seat) });
  return seat;
}

/** A token's seat, if it is still this session's (not removed, same nonce). */
export function seatFor(s, tok) {
  if (!s || !tok || tok.s !== s.id) return null;
  if (tok.r === 'h') return null;
  const seat = s.seats.get(tok.n);
  if (!seat || seat.nonce !== tok.k || s.banned.has(tok.k)) return null;
  return seat;
}

/** Remove a seat (the host's Remove): banned by nonce and account, told, closed. */
export function kick(s, no) {
  const seat = s.seats.get(no);
  if (!seat) return false;
  s.banned.add(seat.nonce);
  if (seat.userId) s.banned.add(seat.userId);
  if (seat.conn) { sendTo(seat.conn, { t: 'bye', why: 'removed' }); closeConn(seat.conn, 4403); seat.conn = null; }
  freeSeat(s, seat, { keepSummary: true });
  hooks.log('info', 'live seat removed', { sid: s.id, seat: no });
  return true;
}

/** A seat leaves the session: its number and score stay in the summary (left: true). */
function freeSeat(s, seat, { keepSummary = true } = {}) {
  s.seats.delete(seat.no);
  if (seat.userId && s.byUser.get(seat.userId) === seat.no) s.byUser.delete(seat.userId);
  s.nicksUsed.delete(seat.nick);
  s.dirty.delete(seat.no);
  if (keepSummary && (seat.score || seat.answered || seat.items.size || (s.race && s.race.get(seat.no)?.prog))) {
    (s.gone || (s.gone = [])).push(seat);
  }
  broadcast(s, { t: 'pl', n: seat.no });
  checkBarrier(s);
}

// ---------------------------------------------------------------- connections
export function sendTo(conn, msg) {
  if (!conn || conn.readyState !== 1) return false;
  try { conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; } catch { return false; }
}
function closeConn(conn, code) { try { conn.close(code); } catch { /* gone */ } }
/** Everyone in the session (players and the host), but except (a seat number). players: false -> the host only. */
export function broadcast(s, msg, { except = null, host = true, players = true } = {}) {
  const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
  if (players) for (const seat of s.seats.values()) if (seat.conn && seat.no !== except) sendTo(seat.conn, str);
  if (host && s.host.conn) sendTo(s.host.conn, str);
}
export const toSeat = (s, no, msg) => { const seat = s.seats.get(no); return seat ? sendTo(seat.conn, msg) : false; };
export const toHost = (s, msg) => sendTo(s.host.conn, msg);

/** The welcome for a seat or the host (conn has just said hello). */
export function welcome(s, seat) {
  const t = now();
  const base = {
    t: 'wel', v: P.V, phase: s.phase, seq: s.seq, round: s.round, at: s.at, clock: t, players: roster(s), state: s.state,
    nameMode: s.nameMode, audience: s.audience, mode: s.mode, title: s.title, cfg: s.cfg, locked: s.settings.locked, max: s.settings.maxPlayers,
  };
  if (s.qz && s.qz.cur) base.quiz = { q: Q.questionMsg(s), answered: seat ? s.qz.answers.has(seat.no) : s.qz.answers.size };
  if (s.race) base.race = raceList(s);
  const lobbyFrame = s.lobbyByGame ? null : 1;
  if (!seat) {
    return { ...base, role: 'host', seat: 0, code: s.code, frame: frameToken(s, null, 'game'), ...(lobbyFrame ? { lobbyFrame: frameToken(s, null, 'lobby') } : {}) };
  }
  return {
    ...base, role: 'player', seat: seat.no,
    me: { seat: seat.no, name: seatName(s, seat), avatar: seat.avatar, team: seat.team, score: seat.score, late: seat.late },
    frame: frameToken(s, seat, 'game'), ...(lobbyFrame ? { lobbyFrame: frameToken(s, seat, 'lobby') } : {}),
  };
}

/** A seat's device connected (hello passed). A second device for the same seat takes over. */
export function attachSeat(s, seat, conn) {
  if (seat.conn && seat.conn !== conn) { sendTo(seat.conn, { t: 'bye', why: 'replaced' }); closeConn(seat.conn, 4409); }
  seat.conn = conn; seat.everConnected = true; seat.leftAt = 0; seat.buckets = P.buckets(hooks.now);
  s.lastActive = now();
  sendTo(conn, welcome(s, seat));
  broadcast(s, { t: 'pu', p: tuple(s, seat) }, { except: seat.no });
}
export function detachSeat(s, seat, conn) {
  if (!seat || seat.conn !== conn) return;
  seat.conn = null; seat.leftAt = now(); seat.ready = false;
  if (open(s)) { broadcast(s, { t: 'pu', p: tuple(s, seat) }); checkBarrier(s); Q.maybeAllAnswered(s, io); }
}
export function attachHost(s, conn) {
  if (s.host.conn && s.host.conn !== conn) { sendTo(s.host.conn, { t: 'bye', why: 'replaced' }); closeConn(s.host.conn, 4409); }
  s.host.conn = conn; s.host.goneAt = 0; s.host.buckets = P.buckets(hooks.now);
  sendTo(conn, welcome(s, null));
  if (s.waitingForHost) { s.waitingForHost = false; }
}
export function detachHost(s, conn) {
  if (s.host.conn !== conn) return;
  s.host.conn = null; s.host.goneAt = now();
}

// The way the quiz module talks to devices (no import cycle).
const io = { broadcast, toSeat, toHost, now, setPhase: (s, phase, extra) => setPhase(s, phase, extra), end: (s, why) => endSession(s.id, why), raceList: s => raceList(s) };

// ---------------------------------------------------------------- phases
function clearTimer(s, k) { if (s.timers[k]) { clearTimeout(s.timers[k]); s.timers[k] = null; } }
function setTimer(s, k, ms, fn) { clearTimer(s, k); s.timers[k] = setTimeout(() => { s.timers[k] = null; try { fn(); } catch (e) { hooks.log('error', 'live timer failed', { sid: s.id, error: e.message }); } }, ms); s.timers[k].unref?.(); }

export function setPhase(s, phase, extra = {}) {
  s.phase = phase; s.seq++; s.lastActive = now();
  if (extra.at !== undefined) s.at = extra.at;
  broadcast(s, { t: 'ph', phase, round: s.round, seq: s.seq, at: s.at, ...extra });
}

/** Everyone connected is ready (or the 20-second wait ran out): count down from a server time, then play. */
function checkBarrier(s) {
  if (s.phase !== 'loading') return;
  const waiting = [...s.seats.values()].some(seat => seat.conn && !seat.ready);
  if (!waiting) countdown(s);
}
function countdown(s) {
  if (s.phase !== 'loading' && s.phase !== 'between') return;
  clearTimer(s, 'loading');
  const at = now() + hooks.countdownMs;
  setPhase(s, 'countdown', { at });
  setTimer(s, 'countdown', hooks.countdownMs, () => play(s));
}
function play(s) {
  if (s.phase !== 'countdown') return;
  s.round++;
  if (s.quiz) return Q.ask(s, io, s.qz ? s.qz.i + 1 : 0);
  setPhase(s, 'playing', { at: now() });
}

/**
 * A host action (from the host page or the host's frame). -> true when it did something.
 * next/skip carry the seq they were pressed at: a stale one (a double tap after the phase moved) is ignored.
 */
export function hostAction(s, a, { n = null, at = null } = {}) {
  if (!open(s)) return false;
  s.lastActive = now();
  switch (a) {
    case 'start': {
      if (s.phase !== 'lobby') return false;
      s.startedAt = now();
      if (s.settings.autoLock) s.settings.locked = true;
      for (const seat of s.seats.values()) seat.ready = false;
      setPhase(s, 'loading', { at: now(), locked: s.settings.locked });
      setTimer(s, 'loading', hooks.loadingMs, () => countdown(s));
      checkBarrier(s);
      return true;
    }
    case 'pause': {
      if (s.phase !== 'playing') return false;
      s.pausedAt = now();
      if (s.quiz) Q.pause(s);
      setPhase(s, 'paused');
      return true;
    }
    case 'resume': {
      if (s.phase !== 'paused') return false;
      const shift = now() - s.pausedAt; s.pausedAt = 0;
      s.phase = 'playing';
      if (s.quiz) return Q.resume(s, io, shift), true;
      s.at += shift;
      setPhase(s, 'playing');
      return true;
    }
    case 'next': case 'skip': {
      if (at !== s.seq) return false;
      if (s.quiz) {
        if (s.phase === 'playing') return a === 'skip' ? Q.skip(s, io) : Q.reveal(s, io), true;
        if (s.phase === 'between') { if (!Q.hasNext(s)) { endSession(s.id, 'ended'); return true; } countdown(s); return true; }
        return false;
      }
      if (s.phase === 'playing') { setPhase(s, 'between'); s.scoresDirty = true; return true; }
      if (s.phase === 'between') { countdown(s); return true; }
      return false;
    }
    case 'lock': case 'unlock': {
      s.settings.locked = a === 'lock';
      if (a === 'unlock') s.settings.autoLock = false;
      broadcast(s, { t: 'lk', locked: s.settings.locked }, { players: false });
      return true;
    }
    case 'kick': return kick(s, n);
    case 'end': endSession(s.id, 'ended'); return true;
    default: return false;
  }
}

/** A seat said its frame (or Watch view) is ready. */
export function ready(s, seat, view) {
  if (!seat.ready || seat.view !== view) { seat.ready = true; seat.view = view; broadcast(s, { t: 'pu', p: tuple(s, seat) }); }
  checkBarrier(s);
}
/** The host's frame said it is ready, with the game's live settings (Oomba.live.ready(opts)). */
export function hostReady(s, cfg) {
  if (!cfg) return;
  if (cfg.presence) s.cfg.presence = cfg.presence;
  for (const k of ['lobby', 'quiz', 'hostView', 'maxScorePerSec']) if (cfg[k] !== undefined) s.cfg[k] = cfg[k];
}

// ---------------------------------------------------------------- what players send
/** Positions are accepted in the lobby, and while playing a game (not in quiz modes: Quest Race moves by answers). */
const presenceOn = s => !!s.cfg.presence && (s.phase === 'lobby' || (s.phase === 'playing' && !s.quiz));
export function move(s, seat, p) {
  if (!presenceOn(s)) return;
  const lim = Math.round(s.cfg.presence.bounds * 100);
  const q = [Math.max(-lim, Math.min(lim, p[0])), Math.max(-lim, Math.min(lim, p[1])), Math.max(-lim, Math.min(lim, p[2])), p[3], p[4]];
  const t = now();
  if (seat.pos && seat.lastMoveAt) {
    const dt = Math.max(0.05, (t - seat.lastMoveAt) / 1000);
    const dist = Math.hypot(q[0] - seat.pos[0], q[1] - seat.pos[1], q[2] - seat.pos[2]) / 100;
    if (dist / dt > s.cfg.presence.maxSpeed * 1.5) {
      // One jump (a teleport stone, a respawn) every 5 seconds is allowed; anything faster is put back.
      if (t - seat.lastJumpAt < 5000) { sendTo(seat.conn, { t: 'fix', p: seat.pos }); return; }
      seat.lastJumpAt = t;
    }
  }
  seat.pos = q; seat.lastMoveAt = t;
  s.dirty.add(seat.no);
}
export function emote(s, seat, e) {
  if (!['lobby', 'playing', 'between', 'countdown'].includes(s.phase)) return;
  broadcast(s, { t: 'em', f: seat.no, e }, { except: seat.no });
}
/** A game event: to everyone else (and the host), or the host only. From the host: to every player or one seat. */
export function event(s, from, m) {
  if (!['lobby', 'loading', 'countdown', 'playing', 'between'].includes(s.phase)) return;
  if (!from) {
    const msg = { t: 'ev', f: 0, k: m.k, d: m.d };
    if (m.to) toSeat(s, m.to, msg); else broadcast(s, msg, { host: false });
    return;
  }
  const msg = { t: 'ev', f: from.no, k: m.k, d: m.d };
  if (m.to === 'host') toHost(s, msg); else broadcast(s, msg, { except: from.no });
}
/** A score the game reported. It can only rise as fast as the game's maxScorePerSec allows. */
export function score(s, seat, n) {
  if (s.quiz || !['playing', 'between', 'paused'].includes(s.phase)) return;
  const t = now();
  const room = s.cfg.maxScorePerSec * (Math.max(0, t - seat.lastScoreAt) / 1000 + 1);
  seat.score = Math.max(0, Math.min(n, seat.score + room));
  seat.lastScoreAt = t; seat.scoredBy = 'game'; s.scoresDirty = true;
}
/** An item result the game reported (once per item). */
export function item(s, seat, i, ok) {
  if (s.quiz || !['playing', 'between', 'paused'].includes(s.phase) || seat.items.has(i)) return;
  seat.items.set(i, ok); seat.answered++; if (ok) seat.correct++;
  const st = s.itemStats.get(i) || { right: 0, answered: 0 };
  st.answered++; if (ok) st.right++;
  s.itemStats.set(i, st);
}
export const answer = (s, seat, m, recvAt) => Q.answer(s, io, seat, m, recvAt);

/** Shared state: a JSON merge patch from the host, at most MAX.state bytes in all. -> true when applied. */
export function setState(s, patch) {
  const next = mergePatch(structuredClone(s.state), patch);
  const bytes = JSON.stringify(next).length;
  if (bytes > P.MAX.state) return false;
  s.state = next; s.stateBytes = bytes;
  broadcast(s, { t: 'st', d: patch }, { host: false });
  return true;
}
function mergePatch(target, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = target && typeof target === 'object' && !Array.isArray(target) ? target : {};
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete out[k];
    else out[k] = v && typeof v === 'object' && !Array.isArray(v) ? mergePatch(out[k], v) : v;
  }
  return out;
}

export const raceList = s => (s.race ? [...s.race].map(([no, r]) => [no, Math.min(1000, Math.round(r.prog)), r.gems]) : []);

// ---------------------------------------------------------------- the end
/** End a session: save its summary, tell everyone, forget its code at once. The object stays keepEndedMs for the
 *  host's results page. -> the summary, or null if it was not open. */
export function endSession(sid, why = 'ended') {
  const s = get(sid);
  if (!open(s)) return null;
  for (const k of Object.keys(s.timers)) clearTimer(s, k);
  s.phase = 'ended'; s.endedAt = now(); s.why = why; s.seq++;
  byCode.delete(s.code); recentCodes.set(hash(s.code), now() + 24 * 3600e3);
  if (hostOpen.get(s.host.userId) === s.id) hostOpen.delete(s.host.userId);
  let summary = null;
  try { summary = R.summary(s); s.summary = summary; if (s.startedAt) R.save(s, summary); } catch (e) { hooks.log('error', 'live results not saved', { sid: s.id, error: e.message }); }
  const top = summary ? summary.players.slice(0, 5).map(p => [p.seat, p.score]) : [];
  broadcast(s, { t: 'ph', phase: 'ended', round: s.round, seq: s.seq, at: s.endedAt, top });
  for (const seat of s.seats.values()) {
    const me = summary && summary.players.find(p => p.seat === seat.no);
    if (me) sendTo(seat.conn, { t: 'you', rank: me.rank, score: me.score, of: summary.players.length });
  }
  const bye = JSON.stringify({ t: 'bye', why });
  for (const seat of s.seats.values()) if (seat.conn) { sendTo(seat.conn, bye); closeConn(seat.conn, 4000); seat.conn = null; }
  if (s.host.conn) { sendTo(s.host.conn, { t: 'res', id: s.id }); }
  // Forget everything a guest gave (nonces, nickname picks, bans) now; the summary keeps seat numbers and scores only.
  s.banned.clear(); s.byUser.clear(); s.nicksUsed.clear(); s.state = {};
  setTimeout(() => { if (sessions.get(s.id) === s) sessions.delete(s.id); }, hooks.keepEndedMs).unref?.();
  hooks.log('info', 'live session ended', { sid: s.id, why, players: summary ? summary.players.length : 0 });
  if (!openCount()) stopTimers();
  return summary;
}

/** Shutdown: every open session is saved and told (bye restart). -> how many. */
export function drainLiveSessions() {
  let n = 0;
  for (const s of openSessions()) { endSession(s.id, 'restart'); n++; }
  for (const s of sessions.values()) if (s.host.conn) closeConn(s.host.conn, 4503);
  return n;
}

// ---------------------------------------------------------------- timers: the tick and the sweep
function startTimers() {
  if (!tickTimer) { tickTimer = setInterval(tick, hooks.tickMs); tickTimer.unref?.(); }
  if (!sweepTimer) { sweepTimer = setInterval(sweep, hooks.sweepMs); sweepTimer.unref?.(); }
}
export function stopTimers() { clearInterval(tickTimer); clearInterval(sweepTimer); tickTimer = null; sweepTimer = null; }

/** One snapshot per session per tick: the seats that moved, serialised once, the same string for everyone. Above 40
 *  movers the session drops to every other tick (5 Hz). Slow connections skip a tick. Every 2 s: the leaderboard. */
export function tick() {
  tickNo++;
  for (const s of sessions.values()) {
    if (!open(s)) continue;
    if (s.dirty.size && presenceOn(s) && (s.dirty.size <= 40 || tickNo % 2 === 0)) {
      const p = [];
      for (const no of s.dirty) { const seat = s.seats.get(no); if (seat && seat.pos) p.push([no, ...seat.pos]); }
      s.dirty.clear();
      if (p.length) {
        const str = JSON.stringify({ t: 's', k: tickNo, ts: now(), p });
        for (const seat of s.seats.values()) if (seat.conn && (seat.conn.bufferedAmount || 0) < MAX_BUFFERED) sendTo(seat.conn, str);
        if (s.host.conn && (s.host.conn.bufferedAmount || 0) < MAX_BUFFERED) sendTo(s.host.conn, str);
      }
    }
    if (s.scoresDirty && tickNo % 20 === 0) leaderboard(s);
  }
}
/** The top ten to everyone, and each player's own rank. */
export function leaderboard(s) {
  s.scoresDirty = false;
  const list = R.ranked(s);
  const top = list.slice(0, 10).map(r => [r.seat, r.score]);
  toHost(s, { t: 'lb', top, n: list.length });
  for (const r of list) { const seat = s.seats.get(r.seat); if (seat && seat.conn) sendTo(seat.conn, { t: 'lb', top, n: list.length, you: [r.rank, r.score] }); }
}

/** Every 30 s: ends sessions past their time, without a host for 10 minutes, or idle in the lobby for 30 minutes;
 *  frees seats disconnected for more than 60 s. */
export function sweep() {
  const t = now();
  for (const s of [...sessions.values()]) {
    if (!open(s)) continue;
    if (t >= s.endsAt) { endSession(s.id, 'expired'); continue; }
    if (!s.host.conn && s.host.goneAt && t - s.host.goneAt > hooks.hostGoneMs) { endSession(s.id, 'ended'); continue; }
    if (s.phase === 'lobby' && t - s.lastActive > hooks.idleLobbyMs) { endSession(s.id, 'expired'); continue; }
    if (s.official === false && s.gameId && s.phase !== 'lobby') {
      const g = games.getGame(s.gameId);
      if (!g || g.hidden_reason || g.status === 'deleted') { endSession(s.id, 'takenDown'); continue; }
    }
    for (const seat of [...s.seats.values()]) if (!seat.conn && seat.leftAt && t - seat.leftAt > hooks.holdMs) freeSeat(s, seat);
  }
}

/** Tests: forget everything. */
export function _reset() {
  for (const s of sessions.values()) for (const k of Object.keys(s.timers)) clearTimer(s, k);
  sessions.clear(); byCode.clear(); recentCodes.clear(); hostOpen.clear(); stopTimers();
  meter.win = -1; meter.n = 0; meter.strictUntil = 0;
}
/** Tests: a class's staff check without the import in the test. */
export const _S = S;
