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
// Part 3 (docs/decisions.md "Oomba Live, part 3"): teams (classlive-teams.js), the host's game settings
// (classlive-settings.js, extending s.settings), a second host connection for the teacher's dashboard (s.dash; s.host.conn
// stays the projector), names per view (players, projector, dashboard), eyes up, fixed messages, +time, bonus points, a
// new nickname, per-seat support (private: never in a broadcast, a frame or the results), and a short linger after the
// end so the host can play again with the same players and teams.
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
import * as T from './classlive-teams.js';
import * as ST from './classlive-settings.js';
import * as D from './classlive-dash.js';
import { getUser } from '../auth.js';
import * as L from './lessons.js';
import * as S from './schools.js';
import { cleanText, personalInfo } from './textfilter.js';

export const hooks = { now: () => Date.now(), log, tickMs: 100, sweepMs: 30e3, loadingMs: 20e3, countdownMs: 3000, holdMs: 60e3, hostGoneMs: 10 * 60e3, idleLobbyMs: 30 * 60e3, keepEndedMs: 10 * 60e3, lingerMs: 120e3 };
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
export const teamsOn = () => !!config.liveTeams;
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
  return keyOf(ipOf(req));
}
function v6Groups(ip) {
  const [head, tail = ''] = ip.toLowerCase().split('::');
  const h = head ? head.split(':') : [], tl = tail ? tail.split(':') : [];
  return ip.includes('::') ? [...h, ...Array(Math.max(0, 8 - h.length - tl.length)).fill('0'), ...tl] : h;
}
const v6Prefix = (groups, n) => groups.slice(0, n).map(g => g.replace(/^0+(?=.)/, '')).join(':') + `::/${n * 16}`;
/** Every bucket a join try counts against: the address's own (ipKey), and for IPv6 also its /48 and /32, so an
 *  attacker holding a whole prefix (a /56 or /48 is routine on cloud hosts) can't spread guesses over many /64s. */
export function joinKeys(req) {
  const ip = ipOf(req), own = keyOf(ip);
  if (!own.endsWith('::/64')) return [own];
  const g = v6Groups(ip);
  return [own, v6Prefix(g, 3), v6Prefix(g, 2)];
}
function keyOf(ip) {
  ip = String(ip || '');
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1];
  if (ip.includes(':')) {
    // Expand :: and keep the first four groups.
    return v6Prefix(v6Groups(ip), 4);
  }
  return ip;
}

// ---------------------------------------------------------------- join limits (POST /api/live/join)
/** Wrong codes per address bucket per 10 minutes, all tries per 10 minutes, and the site-wide meter: more than
 *  STRICT.trigger misses a minute puts every bucket on STRICT.misses per 10 minutes for 10 minutes (logged once). */
export const JOIN_LIMITS = { misses: 100, tries: 600, windowMs: 10 * 60e3, minMs: 150 };
/** How many times an address bucket's limits a wider IPv6 bucket gets: a /48 (a site), a /32 (a provider). */
const WIDE = { '/48': 2, '/32': 6 };
const scale = key => { const m = /::(\/\d+)$/.exec(key); return (m && WIDE[m[1]]) || 1; };
const asKeys = keys => (Array.isArray(keys) ? keys : [keys]);
export const STRICT = { trigger: 2000, misses: 5, forMs: 10 * 60e3 };
const meter = { win: -1, n: 0, strictUntil: 0 };
export const _meter = meter;
/** A join try from this bucket: -> null when it may go on, else 'slowDown'. */
export function joinTry(keys) {
  const strict = meter.strictUntil > now();
  for (const key of asKeys(keys)) {
    if (!allow(`lv-try:${key}`, JOIN_LIMITS.tries * scale(key), JOIN_LIMITS.windowMs)) return 'slowDown';
    if (rlCount(`lv-miss:${key}`) >= (strict ? STRICT.misses : JOIN_LIMITS.misses) * scale(key)) return 'slowDown';
  }
  return null;
}
/** A wrong code from this bucket, or these buckets (locked or full rooms are not misses). */
export function joinMiss(keys) {
  for (const key of asKeys(keys)) allow(`lv-miss:${key}`, JOIN_LIMITS.misses * scale(key), JOIN_LIMITS.windowMs);
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
    // The game's own event words, read from its code (never from a device), each through the text filter.
    words: new Set((check.words || []).filter(shownOk)),
    settings: null,
    phase: 'lobby', round: 0, at: t, pausedAt: 0, seq: 1, seatSeq: 0, lastActive: t,
    seats: new Map(), byUser: new Map(), nicksUsed: new Set(), banned: new Set(),
    state: {}, stateBytes: 2, items, qz: null, race: mode === 'quest-race' ? new Map() : null,
    itemStats: new Map(), dirty: new Set(), scoresDirty: false, timers: {}, reports: 0, summary: null,
    allItems: items, lang: opts.lang || 'en', teams: T.initial(), dash: null, eyes: false, eyesPaused: false, actAt: {}, again: null,
  };
  // The game settings extend the existing s.settings ({ maxPlayers, locked, autoLock }; late join = !autoLock).
  s.settings = ST.initial({ maxPlayers: A.maxPlayersFor(host, audience, opts.maxPlayers), locked: false, autoLock: audience === 'open' }, audience, s.nameMode, opts.settings);
  // A team setup carried in (the landing's teams row, play again) and a plan (a rematch, a saved class run).
  if (teamsOn() && opts.teams && opts.teams.on !== false) T.fromSetup(s, opts.teams, opts.plan || null);
  sessions.set(s.id, s); byCode.set(s.code, s.id); hostOpen.set(host.id, s.id);
  startTimers();
  hooks.log('info', 'live session opened', { sid: s.id, mode, audience, players: s.settings.maxPlayers });
  return { ok: true, session: s };
}

/** Text a player will see that a person (the host) chose: no rude words, contact details, handles or links. Tokens
 *  (snake_case, kebab-case) are read as words. */
export function shownOk(str) {
  const v = String(str).replace(/[_-]+/g, ' ');
  return cleanText(v, 1000).ok && !personalInfo(v);
}
const strings = (v, out = []) => {
  if (typeof v === 'string') out.push(v);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { if (!Array.isArray(v)) out.push(k); strings(x, out); }
  return out;
};

// ---------------------------------------------------------------- seats
const seatName = (s, seat) => (s.nameMode === 'accounts' && seat.name ? seat.name : seat.nick);
/** Views a name is built for: 'player' (players' devices and frames), 'projector' (the host page and frame), 'dash'. */
export const VIEWS = ['player', 'projector', 'dash'];
/**
 * A seat's name in one view (the host's names setting):
 *   names      (a teacher's own class room only) account names everywhere;
 *   nicknames  nicknames on players' devices and the projector; the dashboard has account names in a class room;
 *   hidden     nicknames on devices, nothing on the projector (avatar, team and rank only), the dashboard as above.
 * A nickname is its index (0-143); an account name a string; '' is no name.
 */
export function nameFor(s, seat, view = 'player') {
  const mode = (s.settings && s.settings.names) || 'names';
  if (view === 'dash' || mode === 'names') return seatName(s, seat);
  if (view === 'projector' && mode === 'hidden') return '';
  return seat.nick;
}
/** wel.nameMode / ros.nameMode for a view: 'accounts' when that view gets account names. */
export const nameModeFor = (s, view = 'player') => (s.nameMode === 'accounts' && (view === 'dash' || ((s.settings && s.settings.names) || 'names') === 'names') ? 'accounts' : 'nicknames');
export const tuple = (s, seat, view = 'player') => P.playerTuple(seat, nameFor(s, seat, view));
export const roster = (s, view = 'player') => [...s.seats.values()].map(seat => tuple(s, seat, view));
/** A name-carrying message (pj, pu) for one seat: built once per view, each connection gets its own view's string. */
export function broadcastSeat(s, t, seat, { except = null } = {}) {
  const str = view => JSON.stringify({ t, p: tuple(s, seat, view) });
  const pl = str('player');
  for (const x of s.seats.values()) if (x.conn && x.no !== except) sendTo(x.conn, pl);
  if (s.host.conn) sendTo(s.host.conn, str('projector'));
  if (s.dash) sendTo(s.dash, str('dash'));
}
/** ros: the whole roster again, per view (the names setting changed). */
export function broadcastRoster(s) {
  const str = view => JSON.stringify({ t: 'ros', players: roster(s, view), nameMode: nameModeFor(s, view) });
  const pl = str('player');
  for (const x of s.seats.values()) if (x.conn) sendTo(x.conn, pl);
  if (s.host.conn) sendTo(s.host.conn, str('projector'));
  if (s.dash) sendTo(s.dash, str('dash'));
}

/**
 * Take a seat. user: the signed-in account (null for a guest); opts: { asGuest, useMine, lang }.
 * -> { ok: true, seat, token, again } | { ok: false, code: 'ended'|'locked'|'full'|'signIn'|'notMember'|'removed'|'takenDown' }
 */
export function join(s, user, { asGuest = false, useMine = false, lang = 'en' } = {}) {
  if (!open(s)) return { ok: false, code: 'ended' };
  // A removed account stays removed, even when it asks to play as a guest (its own sign-in is still on the request).
  if (user && !user.is_guest && s.banned.has(user.id)) return { ok: false, code: 'removed' };
  const u = user && !user.is_guest && !user.banned && !(asGuest && s.audience === 'open') ? user : null;
  const ok = A.joinCheck(s, u);
  if (!ok.ok) return ok;
  if (u && s.banned.has(u.id)) return { ok: false, code: 'removed' };
  if (u && s.byUser.has(u.id)) {
    const seat = s.seats.get(s.byUser.get(u.id));
    if (seat) { seat.lang = lang; return { ok: true, seat, token: seatToken(s, seat), again: true }; }
  }
  if (!A.seatCanView(s, u)) return { ok: false, code: 'takenDown' };
  // A signed-in player whose seat was freed (offline more than 60 s) gets that seat back, score and all: one seat per
  // account per session, so results and the gradebook never see them twice. Not when the room is locked or full.
  const back = u && s.gone ? s.gone.findIndex(x => x.userId === u.id) : -1;
  if (back >= 0 && !s.settings.locked && s.seats.size < s.settings.maxPlayers) {
    const seat = s.gone.splice(back, 1)[0];
    seat.nonce = crypto.randomBytes(12).toString('base64url'); seat.lang = lang; seat.conn = null; seat.leftAt = now(); seat.ready = false;
    if (s.nicksUsed.has(seat.nick)) seat.nick = N.pickNick(s.nicksUsed);
    s.nicksUsed.add(seat.nick);
    s.seats.set(seat.no, seat); s.byUser.set(u.id, seat.no);
    if (s.race && !s.race.has(seat.no)) s.race.set(seat.no, { prog: 0, gems: 0 });
    s.lastActive = now();
    seated(s, seat);
    return { ok: true, seat, token: seatToken(s, seat), again: true };
  }
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
    score: 0, bonus: 0, scoredBy: s.quiz ? 'server' : 'game', correct: 0, answered: 0, streak: 0, wrongRun: 0, missRun: 0, items: new Map(), lastScoreAt: t,
    pos: null, lastMoveAt: 0, lastJumpAt: 0, conn: null, everConnected: false, leftAt: t, rtt: 0, ready: false, late: s.phase !== 'lobby', view: '3d',
    buckets: null, acc: null,
  };
  s.seats.set(no, seat);
  if (u) s.byUser.set(u.id, no);
  if (s.race) s.race.set(no, { prog: 0, gems: 0 });
  s.lastActive = t;
  seated(s, seat);
  return { ok: true, seat, token: seatToken(s, seat), again: false };
}
/** A seat was taken (or taken back): saved support (class rooms, LIVE_SAVE_SUPPORT), its team, and everyone told. */
function seated(s, seat) {
  if (!seat.acc && seat.userId) {
    const kept = s.accByUser && s.accByUser.get(seat.userId);
    if (kept) s.accByUser.delete(seat.userId);
    seat.acc = kept || savedSupport(s, seat.userId);
  }
  if (T.isOn(s)) T.place(s, seat);
  broadcastSeat(s, 'pj', seat);
  if (T.isOn(s)) broadcast(s, T.tmsMsg(s));
  toDash(s, D.dpMsg(s));
  if (seat.acc) toDash(s, D.supMsg(s));
}

// ---------------------------------------------------------------- support (accommodations; private to the seat)
/** Support may be saved per class student only in class rooms, with LIVE_SAVE_SUPPORT on (legal-review item 42). */
export const supportSaveOn = s => !!config.liveSaveSupport && s.audience === 'class' && !!s.classId;
function savedSupport(s, userId) {
  if (!supportSaveOn(s)) return null;
  const r = R.supportRow(s.classId, userId);
  return r && (r.extra_time > 100 || r.read_aloud || r.simple) ? { time: P.EXTRA_TIME.includes(r.extra_time) ? r.extra_time : 100, read: !!r.read_aloud, simple: !!r.simple, saved: true } : null;
}
/** The host sets a seat's support: { time: 100|150|200, read, simple }, save: remember it for the class. -> bool */
export function setSupport(s, seat, { time = 100, read = false, simple = false, save = false } = {}) {
  if (!seat) return false;
  const acc = { time: P.EXTRA_TIME.includes(time) ? time : 100, read: !!read, simple: !!simple, saved: false };
  const any = acc.time > 100 || acc.read || acc.simple;
  if (save && supportSaveOn(s) && seat.userId && S.classMember(s.classId, seat.userId)?.role === 'student') {
    acc.saved = R.saveSupport(s.classId, seat.userId, acc, s.host.userId);
  } else if (seat.acc && seat.acc.saved && supportSaveOn(s)) acc.saved = any;
  seat.acc = any ? acc : null;
  // Only the seat itself (PRIVATE: its page never relays it into the game frame) and the dashboard.
  sendTo(seat.conn, { t: 'me', acc: accOut(seat) });
  toDash(s, D.supMsg(s));
  // A seat given extra time mid-question gets its own q at once.
  if (s.qz && s.qz.cur && s.phase === 'playing' && seat.conn) sendTo(seat.conn, Q.questionMsg(s, seat));
  return true;
}
const accOut = seat => (seat.acc ? { time: seat.acc.time, read: seat.acc.read, simple: seat.acc.simple } : { time: 100, read: false, simple: false });

/** A new nickname and avatar, before the player has entered (connected) for the first time. -> the seat or null. */
export function reroll(s, seat) {
  if (!open(s) || !seat || seat.everConnected || s.nameMode === 'accounts' || seat.ownAvatar) return null;
  if (!N.mayReroll(seat.nonce)) return null;
  s.nicksUsed.delete(seat.nick);
  seat.nick = N.pickNick(s.nicksUsed); s.nicksUsed.add(seat.nick);
  seat.avatar = N.randomAvatar();
  broadcastSeat(s, 'pu', seat);
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
  } else if (keepSummary && seat.userId && seat.acc) {
    // a seat with support but no results yet: its support waits for a rejoin (memory only, this session), like
    // teams.byUser keeps its team; a gone seat keeps it on the seat itself
    (s.accByUser || (s.accByUser = new Map())).set(seat.userId, { ...seat.acc });
  }
  broadcast(s, { t: 'pl', n: seat.no });
  if (T.isOn(s) && open(s)) broadcast(s, T.tmsMsg(s));
  toDash(s, D.dpMsg(s));
  checkBarrier(s);
  if (open(s)) Q.maybeAllAnswered(s, io);
}

// ---------------------------------------------------------------- connections
export function sendTo(conn, msg) {
  if (!conn || conn.readyState !== 1) return false;
  try { conn.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); return true; } catch { return false; }
}
function closeConn(conn, code) { try { conn.close(code); } catch { /* gone */ } }
/** Everyone in the session (players and the hosts: the projector and the dashboard), but except (a seat number).
 *  players: false -> the hosts only; host: false -> the players only. One string for everyone. */
export function broadcast(s, msg, { except = null, host = true, players = true } = {}) {
  const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
  if (players) for (const seat of s.seats.values()) if (seat.conn && seat.no !== except) sendTo(seat.conn, str);
  if (host) toHosts(s, str);
}
export const toSeat = (s, no, msg) => { const seat = s.seats.get(no); return seat ? sendTo(seat.conn, msg) : false; };
/** The projector and the dashboard. */
export function toHosts(s, msg) {
  const str = typeof msg === 'string' ? msg : JSON.stringify(msg);
  const a = sendTo(s.host.conn, str), b = sendTo(s.dash, str);
  return a || b;
}
/** The host's projector only. */
export const toProjector = (s, msg) => sendTo(s.host.conn, msg);
/** The teacher's dashboard only (dq, dp, sup): never a player, the projector or a frame. */
export const toDash = (s, msg) => (msg && s.dash ? sendTo(s.dash, msg) : false);
/** Kept for callers from before the dashboard: every host connection. */
export const toHost = toHosts;
export const toPlayers = (s, msg) => broadcast(s, msg, { host: false });
/** Team scores (ts): the hosts with ranks; players with ranks unless the leaderboard is off. */
export function teamScores(s, { fin = false } = {}) {
  if (!T.isOn(s)) return;
  toHosts(s, T.tsMsg(s, { fin }));
  toPlayers(s, T.tsMsg(s, { fin, ranks: s.settings.board !== 'off' }));
}

/** The welcome for a seat or a host connection (conn has just said hello). view: 'projector' | 'dash' for a host. */
export function welcome(s, seat, view = 'projector') {
  const t = now();
  const v = seat ? 'player' : view;
  const tms = T.tmsMsg(s); delete tms.t;
  const base = {
    t: 'wel', v: P.V, phase: s.phase, seq: s.seq, round: s.round, at: s.at, clock: t, players: roster(s, v), state: s.state,
    nameMode: nameModeFor(s, v), audience: s.audience, mode: s.mode, title: s.title, cfg: s.cfg, locked: s.settings.locked, max: s.settings.maxPlayers,
    teams: tms, eyes: s.eyes, lang: s.lang,
  };
  if (T.isOn(s)) base.ts = T.tsMsg(s, { ranks: !seat || s.settings.board !== 'off' }).s;
  if (s.qz && s.qz.cur) base.quiz = { q: Q.questionMsg(s, seat), answered: seat ? s.qz.answers.has(seat.no) : s.qz.answers.size };
  if (s.race) base.race = raceList(s);
  const lobbyFrame = s.lobbyByGame ? null : 1;
  if (!seat) {
    const host = { ...base, role: 'host', view, seat: 0, code: s.code, settings: ST.view(s.settings) };
    // The dashboard has no game frame; only it gets the teacher-only data.
    if (view === 'dash') return { ...host, dp: D.dpMsg(s).p, sup: D.supMsg(s).p, ...(s.qz && s.qz.cur ? { dq: D.dqMsg(s) } : {}) };
    return { ...host, frame: frameToken(s, null, 'game'), ...(lobbyFrame ? { lobbyFrame: frameToken(s, null, 'lobby') } : {}) };
  }
  return {
    ...base, role: 'player', seat: seat.no, settings: ST.publicPart(s.settings),
    // me.acc is PRIVATE: the page uses it and never relays it into the game frame (live-common.js).
    me: { seat: seat.no, name: nameFor(s, seat, 'player'), avatar: seat.avatar, team: seat.team, score: seat.score, late: seat.late, acc: accOut(seat) },
    frame: frameToken(s, seat, 'game'), ...(lobbyFrame ? { lobbyFrame: frameToken(s, seat, 'lobby') } : {}),
  };
}

/** A seat's device connected (hello passed). A second device for the same seat takes over. */
export function attachSeat(s, seat, conn) {
  if (seat.conn && seat.conn !== conn) { sendTo(seat.conn, { t: 'bye', why: 'replaced' }); closeConn(seat.conn, 4409); }
  seat.conn = conn; seat.everConnected = true; seat.leftAt = 0; seat.buckets = P.buckets(hooks.now);
  s.lastActive = now();
  sendTo(conn, welcome(s, seat));
  broadcastSeat(s, 'pu', seat, { except: seat.no });
  toDash(s, D.dpMsg(s));
}
export function detachSeat(s, seat, conn) {
  if (!seat || seat.conn !== conn) return;
  seat.conn = null; seat.leftAt = now(); seat.ready = false;
  if (open(s)) { broadcastSeat(s, 'pu', seat); toDash(s, D.dpMsg(s)); checkBarrier(s); Q.maybeAllAnswered(s, io); }
}
/** The projector connected (view 'projector'), or the teacher's dashboard (view 'dash': attachDash). */
export function attachHost(s, conn, view = 'projector') {
  if (view === 'dash') return attachDash(s, conn);
  if (s.host.conn && s.host.conn !== conn) { sendTo(s.host.conn, { t: 'bye', why: 'replaced' }); closeConn(s.host.conn, 4409); }
  s.host.conn = conn; s.host.goneAt = 0; s.host.buckets = P.buckets(hooks.now);
  sendTo(conn, welcome(s, null, 'projector'));
  if (s.waitingForHost) { s.waitingForHost = false; }
}
export function detachHost(s, conn) {
  if (s.dash === conn) return detachDash(s, conn);
  if (s.host.conn !== conn) return;
  s.host.conn = null;
  if (!s.dash) s.host.goneAt = now();
}
/** One dashboard per session (the same host account); a newer one replaces it (4409). It has no game frame, never
 *  sends rdy and is not waited for at loading. */
export function attachDash(s, conn) {
  if (s.dash && s.dash !== conn) { sendTo(s.dash, { t: 'bye', why: 'replaced' }); closeConn(s.dash, 4409); }
  s.dash = conn; s.host.goneAt = 0; s.dashBuckets = P.buckets(hooks.now);
  sendTo(conn, welcome(s, null, 'dash'));
}
export function detachDash(s, conn) {
  if (s.dash !== conn) return;
  s.dash = null;
  if (!s.host.conn) s.host.goneAt = now();
}
/** The host is gone when neither the projector nor the dashboard is connected. */
export const hostGone = s => !s.host.conn && !s.dash;

// The way the quiz module talks to devices (no import cycle).
const io = { broadcast, toSeat, toHost, toHosts, toDash, toPlayers, teamScores: s => teamScores(s), now, setPhase: (s, phase, extra) => setPhase(s, phase, extra), end: (s, why) => endSession(s.id, why), raceList: s => raceList(s) };

// ---------------------------------------------------------------- phases
function clearTimer(s, k) { if (s.timers[k]) { clearTimeout(s.timers[k]); s.timers[k] = null; } }
function setTimer(s, k, ms, fn) { clearTimer(s, k); s.timers[k] = setTimeout(() => { s.timers[k] = null; try { fn(); } catch (e) { hooks.log('error', 'live timer failed', { sid: s.id, error: e.message }); } }, ms); s.timers[k].unref?.(); }

export function setPhase(s, phase, extra = {}) {
  const was = s.phase;
  // Game scores may rise only with playing time (score()): a new round starts every seat's allowance afresh, and
  // leaving play (pause, between rounds) stops it.
  if (phase === 'playing' && was === 'countdown') for (const seat of s.seats.values()) seat.lastScoreAt = now();
  if (was === 'playing' && phase !== 'playing') s.playEndAt = now();
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
  if (s.quiz) Q.ask(s, io, s.qz ? s.qz.i + 1 : 0);
  else setPhase(s, 'playing', { at: now() });
  // Eyes up while the game moved into play (raised in the lobby, loading, the countdown or between questions): the
  // round opens paused, so no clock runs behind the cover; lowering eyes (or Resume) starts it.
  if (s.eyes && s.phase === 'playing') { pauseNow(s); s.eyesPaused = true; }
}
function pauseNow(s) {
  s.pausedAt = now(); s.eyesPaused = false;
  if (s.quiz) Q.pause(s);
  setPhase(s, 'paused');
}

/**
 * A host action (from the host page or the host's frame). -> true when it did something.
 * next/skip carry the seq they were pressed at: a stale one (a double tap after the phase moved) is ignored.
 */
/** Per-action limits on top of h's 5 a second (ms between two): messages, bonus points, eyes up. */
export const ACTION_GAP = { say: 3000, bonus: 1000, eyes: 1000 };
export function hostAction(s, a, { n = null, at = null, ...m } = {}) {
  if (!open(s)) return false;
  s.lastActive = now();
  if (ACTION_GAP[a]) {
    if (now() - (s.actAt[a] || -Infinity) < ACTION_GAP[a]) return false;
    s.actAt[a] = now();
  }
  switch (a) {
    case 'start': {
      if (s.phase !== 'lobby') return false;
      s.startedAt = now();
      // The settings shape the questions now; every seat still without a team gets one; what the host started with
      // becomes their remembered defaults (the next /live landing is filled in with it).
      if (s.quiz) Q.applySettings(s);
      if (T.isOn(s)) { for (const seat of s.seats.values()) if (!seat.team) T.place(s, seat); broadcast(s, T.tmsMsg(s)); }
      try { ST.savePrefs(s.host.userId, { settings: ST.view(s.settings), teams: T.isOn(s) ? { on: true, ...T.setupOf(s) } : { on: false } }); } catch (e) { hooks.log('warn', 'live prefs not saved', { sid: s.id, error: e.message }); }
      if (s.settings.autoLock) s.settings.locked = true;
      for (const seat of s.seats.values()) seat.ready = false;
      setPhase(s, 'loading', { at: now(), locked: s.settings.locked });
      setTimer(s, 'loading', hooks.loadingMs, () => countdown(s));
      checkBarrier(s);
      return true;
    }
    case 'pause': {
      if (s.phase !== 'playing') return false;
      pauseNow(s);
      return true;
    }
    case 'resume': {
      if (s.phase !== 'paused') return false;
      // Resume means "go on": eyes up comes down with it, so the clock never runs behind the cover
      if (s.eyes) { s.eyes = false; broadcast(s, { t: 'eyes', on: false }); }
      const shift = now() - s.pausedAt; s.pausedAt = 0; s.eyesPaused = false;
      for (const seat of s.seats.values()) seat.lastScoreAt = Math.min(now(), seat.lastScoreAt + shift);
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
    case 'eyes': return eyes(s, !!m.on);
    case 'say': {
      if (!Number.isInteger(m.m) || m.m < 0 || m.m >= P.SAY.length) return false;
      broadcast(s, { t: 'say', m: m.m });
      return true;
    }
    case 'time': {
      if (!s.quiz || !P.ADD_SECS.includes(m.s)) return false;
      return Q.extend(s, io, m.s);
    }
    case 'bonus': return bonus(s, { n, k: m.k, r: m.r });
    case 'rename': return rename(s, s.seats.get(n));
    case 'acc': return setSupport(s, s.seats.get(n), { time: m.x, read: !!m.ra, simple: !!m.sv, save: !!m.save });
    default: return false;
  }
}

/** Eyes up: every screen shows "Eyes on your teacher". While playing it also pauses (like Pause), and a round that
 *  opens while eyes are up opens paused (play()); eyes off resumes only a pause that eyes up made (not one the host
 *  pressed meanwhile). Resume while eyes are up lowers them. */
export function eyes(s, on) {
  if (s.eyes === on) return false;
  s.eyes = on;
  broadcast(s, { t: 'eyes', on });
  if (on && s.phase === 'playing') { hostAction(s, 'pause'); s.eyesPaused = true; }
  else if (!on && s.eyesPaused && s.phase === 'paused') { s.eyesPaused = false; hostAction(s, 'resume'); }
  if (!on) s.eyesPaused = false;
  return true;
}
/** Bonus points (+100, a fixed positive reason): to a seat (only that seat and the hosts hear of it), or to a team
 *  (everyone). Kept apart from the score: leaderboards show score + bonus; the gradebook the score alone. */
export function bonus(s, { n = null, k = null, r = 0 } = {}) {
  if (!['lobby', 'loading', 'countdown', 'playing', 'paused', 'between'].includes(s.phase) || !Number.isInteger(r) || r < 0 || r >= P.BONUS_REASONS.length) return false;
  if (n) {
    const seat = s.seats.get(n);
    if (!seat) return false;
    T.bonusSeat(s, seat);
    const msg = JSON.stringify({ t: 'bn', n, r, p: T.BONUS_POINTS });
    sendTo(seat.conn, msg); toHosts(s, msg);
  } else {
    if (!T.bonusTeam(s, k)) return false;
    broadcast(s, { t: 'bn', k, r, p: T.BONUS_POINTS });
  }
  s.scoresDirty = true;
  teamScores(s);
  return true;
}
/** A new nickname for a seat shown by its nickname (not an account name: switch the room's names instead). */
export function rename(s, seat) {
  if (!seat || (s.nameMode === 'accounts' && s.settings.names === 'names')) return false;
  s.nicksUsed.delete(seat.nick);
  seat.nick = N.pickNick(s.nicksUsed); s.nicksUsed.add(seat.nick);
  broadcastSeat(s, 'pu', seat);
  return true;
}

/** The host's game settings (cf). Lobby-only keys are refused after start. -> the keys that changed. */
export function setSettings(s, d) {
  if (!open(s)) return [];
  const c = ST.clean(d, { lobby: s.phase === 'lobby', nameMode: s.nameMode });
  if (!s.quiz) for (const k of ST.QUIZ_ONLY) delete c[k];
  const { changed, lock } = ST.apply(s, c);
  if (!changed.length) return changed;
  s.lastActive = now();
  toHosts(s, { t: 'cf', d: ST.view(s.settings) });
  if (changed.some(k => ST.PUBLIC.includes(k))) toPlayers(s, { t: 'opt', ...ST.publicPart(s.settings) });
  if (changed.includes('names')) broadcastRoster(s);
  if (changed.includes('sound')) toProjector(s, { t: 'snd', on: s.settings.sound });
  if (lock !== null) toHosts(s, { t: 'lk', locked: lock });
  if (changed.includes('board')) { s.scoresDirty = true; teamScores(s); }
  return changed;
}

/** A team action from the host (tm). Phases: setup (on, off, count, preset, scoring, choose, shuffle, last) in the
 *  lobby; balance in the lobby or between; move any time (to no team only in the lobby); lock any time. -> bool */
export function teamAction(s, m) {
  if (!open(s) || !teamsOn()) return false;
  const lobby = s.phase === 'lobby';
  const ts = s.teams;
  let ok = false, extra = null;
  switch (m.a) {
    case 'on': ok = lobby && T.setup(s, m.n); break;
    case 'off': ok = lobby && ts.on && T.off(s); break;
    case 'count': ok = lobby && T.setCount(s, m.n); break;
    case 'preset': ok = lobby && T.setPreset(s, m.k, m.p); break;
    case 'scoring': ok = lobby && T.setScoring(s, m.v); break;
    case 'choose': ok = lobby && ts.on && ts.choose !== m.v && ((ts.choose = m.v), true); break;
    case 'lock': case 'unlock': ok = ts.on && ts.locked !== (m.a === 'lock') && ((ts.locked = m.a === 'lock'), true); break;
    case 'balance': ok = (lobby || s.phase === 'between') && ts.on && (T.balance(s), true); break;
    case 'shuffle': ok = lobby && T.shuffle(s); break;
    case 'move': ok = (m.k > 0 || lobby) && T.move(s, s.seats.get(m.s), m.k); break;
    case 'last': {
      if (!lobby || s.audience !== 'class' || !s.classId) break;
      const saved = T.loadClassTeams(s.classId);
      if (!saved) { toHosts(s, { t: 'tml', ok: false }); return false; }
      ok = T.usePlan(s, saved.cfg, saved.plan);
      extra = { t: 'tml', ok, uneven: T.uneven(s) };
      break;
    }
    default: break;
  }
  if (!ok) return false;
  s.lastActive = now();
  broadcast(s, T.tmsMsg(s));
  if (extra) toHosts(s, extra);
  if (!lobby) teamScores(s);
  return true;
}
/** A player picks a team (pt: lobby only, when the host lets players choose and teams are not locked). */
export function pickTeam(s, seat, k) {
  if (!open(s) || !teamsOn() || !T.choose(s, seat, k)) return false;
  broadcast(s, T.tmsMsg(s));
  return true;
}

/** A seat said its frame (or Watch view) is ready. */
export function ready(s, seat, view) {
  if (!seat.ready || seat.view !== view) { seat.ready = true; seat.view = view; broadcastSeat(s, 'pu', seat); }
  checkBarrier(s);
}
/** The host's frame said it is ready, with the game's live settings (Oomba.live.ready(opts)). */
export function hostReady(s, cfg) {
  if (!cfg) return;
  if (cfg.presence) s.cfg.presence = cfg.presence;
  for (const k of ['lobby', 'quiz', 'hostView', 'maxScorePerSec', 'teams']) if (cfg[k] !== undefined) s.cfg[k] = cfg[k];
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
  if (!['lobby', 'playing', 'between', 'countdown'].includes(s.phase) || s.settings.emotes === false) return;
  broadcast(s, { t: 'em', f: seat.no, e }, { except: seat.no });
}
/** A game event: to everyone else (and the hosts), the hosts only, or the sender's own team (and the hosts). From the
 *  host: to every player, one seat, or one team. */
export function event(s, from, m) {
  if (!['lobby', 'loading', 'countdown', 'playing', 'between'].includes(s.phase)) return;
  if (!from) {
    if (!strings(m.d, [m.k]).every(shownOk)) return;
    const msg = { t: 'ev', f: 0, k: m.k, d: m.d };
    if (m.to) toSeat(s, m.to, msg);
    else if (m.tm) { const str = JSON.stringify({ ...msg, tm: m.tm }); for (const seat of s.seats.values()) if (seat.conn && seat.team === m.tm) sendTo(seat.conn, str); }
    else broadcast(s, msg, { host: false });
    return;
  }
  // A player's event carries only the game's own words (protocol evVocabOk), whoever it goes to.
  if (!P.evVocabOk(m.k, m.d, s.words)) return;
  const msg = { t: 'ev', f: from.no, k: m.k, d: m.d };
  if (m.to === 'host') toHost(s, msg);
  else if (m.to === 'team') {
    if (!T.isOn(s) || !from.team) return;
    const str = JSON.stringify({ ...msg, tm: from.team });
    for (const seat of s.seats.values()) if (seat.conn && seat.no !== from.no && seat.team === from.team) sendTo(seat.conn, str);
    toHosts(s, str);
  } else broadcast(s, msg, { except: from.no });
}
/** A score the game reported. It can only rise as fast as the game's maxScorePerSec allows. */
export function score(s, seat, n) {
  if (s.quiz || !['playing', 'between', 'paused'].includes(s.phase)) return;
  // Only time spent playing counts: the lobby, loading, countdown, pauses and the gaps between rounds bank nothing
  // (lastScoreAt is reset when play starts and shifted over a pause; after play stops, time is counted up to then).
  const t = s.phase === 'playing' ? now() : Math.max(seat.lastScoreAt, Math.min(now(), s.playEndAt || 0));
  const room = s.cfg.maxScorePerSec * (Math.max(0, t - seat.lastScoreAt) / 1000);
  const was = seat.score;
  seat.score = Math.max(0, Math.min(n, seat.score + room));
  if (seat.score !== was) T.bankScore(s, seat);
  seat.lastScoreAt = Math.max(seat.lastScoreAt, t); seat.scoredBy = 'game'; s.scoresDirty = true;
}
/** An item result the game reported (once per item). */
export function item(s, seat, i, ok) {
  if (s.quiz || !['playing', 'between', 'paused'].includes(s.phase) || seat.items.has(i)) return;
  seat.items.set(i, ok); seat.answered++; if (ok) seat.correct++;
  s.dpDirty = true;
  const st = s.itemStats.get(i) || { right: 0, answered: 0 };
  st.answered++; if (ok) st.right++;
  s.itemStats.set(i, st);
}
export const answer = (s, seat, m, recvAt) => Q.answer(s, io, seat, m, recvAt);

/** Shared state: a JSON merge patch from the host, at most MAX.state bytes in all. -> true when applied. */
export function setState(s, patch) {
  if (!strings(patch).every(shownOk)) return false;
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
  if (s.startedAt && T.isOn(s)) { try { T.saveClassTeams(s); } catch (e) { hooks.log('error', 'live class teams not saved', { sid: s.id, error: e.message }); } }
  // Team scores first (fin), then the end. Players see the top five, or none when the host turned the leaderboard off.
  teamScores(s, { fin: true });
  const top = summary ? summary.players.slice(0, 5).map(p => [p.seat, p.total ?? p.score]) : [];
  const rows = Q.boardRows(s, 5);
  const ph = { t: 'ph', phase: 'ended', round: s.round, seq: s.seq, at: s.endedAt };
  toHosts(s, { ...ph, top });
  toPlayers(s, { ...ph, top: top.slice(0, rows) });
  for (const seat of s.seats.values()) {
    const me = summary && summary.players.find(p => p.seat === seat.no);
    if (me) sendTo(seat.conn, { t: 'you', rank: rows ? me.rank : 0, score: me.total ?? me.score, of: summary.players.length });
  }
  // Play again: the seats as they ended (account, nickname, avatar, team) and the bans, kept only while the players'
  // sockets linger (hooks.lingerMs, 2 minutes), then wiped. Removed seats were freed at removal: never in it.
  const linger = why === 'ended' && !!s.startedAt && hooks.lingerMs > 0 && !hostGone(s) && [...s.seats.values()].some(x => x.conn);
  s.again = linger ? { seats: [...s.seats.values()].map(x => [x.no, x.userId, x.nick, x.avatar, x.team]), banned: new Set(s.banned) } : null;
  if (s.host.conn || s.dash) toHosts(s, { t: 'res', id: s.id });
  // Forget everything a guest gave (nonces, nickname picks, bans) now; the summary keeps seat numbers and scores only.
  s.banned.clear(); s.byUser.clear(); s.nicksUsed.clear(); s.state = {}; if (s.accByUser) s.accByUser.clear();
  if (linger) {
    s.lingerUntil = now() + hooks.lingerMs;
    setTimer(s, 'linger', hooks.lingerMs, () => endLinger(s, why));
  } else endLinger(s, why);
  setTimeout(() => { if (sessions.get(s.id) === s) sessions.delete(s.id); }, hooks.keepEndedMs).unref?.();
  hooks.log('info', 'live session ended', { sid: s.id, why, players: summary ? summary.players.length : 0 });
  if (!openCount()) stopTimers();
  return summary;
}

/** The end of the linger (at once when there is none): bye and close every player socket, and wipe the snapshot. */
export function endLinger(s, why = 'ended') {
  clearTimer(s, 'linger');
  s.lingerUntil = 0; s.again = null;
  const bye = JSON.stringify({ t: 'bye', why });
  for (const seat of s.seats.values()) if (seat.conn) { sendTo(seat.conn, bye); closeConn(seat.conn, 4000); seat.conn = null; }
}
/** Players still connected after the end (the results page's "N players still here"). */
export const lingering = s => (s && s.again && s.lingerUntil > now() ? [...s.seats.values()].filter(x => x.conn).length : 0);

/**
 * Play again with the same players and teams (the results page, while the players linger): a new session with the same
 * game, questions, audience, class, settings and team setup. Every lingering seat goes through the join checks again
 * (the room's rule, class membership, the old session's bans) and gets a seat with the same account, nickname, avatar
 * and team (or shuffled teams), then is sent { t: 'again', sid, tok } (PRIVATE: never into a frame) and closed.
 * -> { ok: true, session, moved } | { ok: false, code }
 */
export function rematch(old, host, { shuffle = false } = {}) {
  if (!old || old.host.userId !== host.id || !old.again || !lingering(old)) return { ok: false, code: 'againGone' };
  const snap = old.again;
  const teams = T.setupOf(old);
  const r = createSession(host, {
    mode: old.mode, gameId: old.gameId, ...(old.allItems ? { items: old.allItems.map(it => ({ q: it.q, choices: it.choices, answer: it.answer, secs: it.own || it.secs })) } : {}),
    audience: old.audience, classId: old.classId, clId: old.clId, stepId: old.stepId, maxPlayers: old.settings.maxPlayers, lang: old.lang, title: old.title,
    settings: ST.view(old.settings), teams, replace: true,
  });
  if (!r.ok) return r;
  const ns = r.session;
  ns.setId = old.setId;
  let moved = 0;
  for (const [no, userId, nick, avatar, team] of snap.seats) {
    const seat = old.seats.get(no);
    if (!seat || !seat.conn) continue;
    const u = userId ? getUser(userId) : null;
    if ((userId && (!u || u.banned || snap.banned.has(userId))) || snap.banned.has(seat.nonce)) continue;
    const chk = A.joinCheck(ns, u);
    if (!chk.ok || !A.seatCanView(ns, u)) continue;
    const t = now();
    const nseat = {
      no: ++ns.seatSeq, nonce: crypto.randomBytes(12).toString('base64url'), userId: u ? u.id : null, kind: chk.kind, nick: ns.nicksUsed.has(nick) ? N.pickNick(ns.nicksUsed) : nick,
      name: ns.nameMode === 'accounts' && u ? String(u.display_name || u.username).slice(0, 40) : '', avatar, ownAvatar: seat.ownAvatar, team: 0, lang: seat.lang,
      score: 0, bonus: 0, scoredBy: ns.quiz ? 'server' : 'game', correct: 0, answered: 0, streak: 0, wrongRun: 0, missRun: 0, items: new Map(), lastScoreAt: t,
      pos: null, lastMoveAt: 0, lastJumpAt: 0, conn: null, everConnected: false, leftAt: t, rtt: 0, ready: false, late: false, view: '3d', buckets: null, acc: null,
    };
    ns.nicksUsed.add(nseat.nick);
    ns.seats.set(nseat.no, nseat);
    if (u) ns.byUser.set(u.id, nseat.no);
    if (ns.race) ns.race.set(nseat.no, { prog: 0, gems: 0 });
    if (u) nseat.acc = savedSupport(ns, u.id) || (seat.acc ? { ...seat.acc } : null);
    else if (seat.acc) nseat.acc = { ...seat.acc, saved: false };
    if (T.isOn(ns) && !shuffle && team >= 1 && team <= ns.teams.n) T.assign(ns, nseat, team);
    sendTo(seat.conn, { t: 'again', sid: ns.id, tok: seatToken(ns, nseat) });
    closeConn(seat.conn, 4000); seat.conn = null;
    moved++;
  }
  // The same teams as they ended (a seat with none is placed); or shuffled when the host asked.
  if (T.isOn(ns)) { if (shuffle) T.shuffle(ns); else for (const x of ns.seats.values()) if (!x.team) T.place(ns, x); }
  endLinger(old);
  hooks.log('info', 'live session played again', { sid: ns.id, from: old.id, players: moved });
  return { ok: true, session: ns, moved };
}

/** Shutdown: every open session is saved and told (bye restart). -> how many. */
export function drainLiveSessions() {
  let n = 0;
  for (const s of openSessions()) { endSession(s.id, 'restart'); n++; }
  for (const s of sessions.values()) { if (s.lingerUntil) endLinger(s, 'restart'); if (s.host.conn) closeConn(s.host.conn, 4503); if (s.dash) closeConn(s.dash, 4503); }
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
      // Each row carries how old its position is (ms since it arrived), so devices interpolate on the time the player
      // was really there, not on the tick that happened to send it.
      const t = now();
      for (const no of s.dirty) { const seat = s.seats.get(no); if (seat && seat.pos) p.push([no, ...seat.pos, Math.max(0, Math.min(1000, t - seat.lastMoveAt))]); }
      s.dirty.clear();
      if (p.length) {
        const str = JSON.stringify({ t: 's', k: tickNo, ts: t, p });
        for (const seat of s.seats.values()) if (seat.conn && (seat.conn.bufferedAmount || 0) < MAX_BUFFERED) sendTo(seat.conn, str);
        if (s.host.conn && (s.host.conn.bufferedAmount || 0) < MAX_BUFFERED) sendTo(s.host.conn, str);
      }
    }
    if (s.scoresDirty && tickNo % 20 === 0) leaderboard(s);
    if (s.dpDirty && s.dash && tickNo % 10 === 0) { s.dpDirty = false; toDash(s, D.dpMsg(s)); }
  }
}
/** The top ten to the hosts; players get the top ten, the top five or nothing (the host's leaderboard setting) and
 *  their own rank (none when the leaderboard is off). Then the team scores. score = score + bonus. */
export function leaderboard(s) {
  s.scoresDirty = false;
  const list = R.ranked(s);
  const top = list.slice(0, 10).map(r => [r.seat, r.score]);
  const rows = Q.boardRows(s, 10);
  toHosts(s, { t: 'lb', top, n: list.length });
  for (const r of list) { const seat = s.seats.get(r.seat); if (seat && seat.conn) sendTo(seat.conn, { t: 'lb', top: top.slice(0, rows), n: list.length, you: [rows ? r.rank : 0, r.score] }); }
  teamScores(s);
}

/** Every 30 s: ends sessions past their time, without a host for 10 minutes, or idle in the lobby for 30 minutes;
 *  frees seats disconnected for more than 60 s. */
export function sweep() {
  const t = now();
  for (const s of [...sessions.values()]) {
    if (!open(s)) { if (s.lingerUntil && t >= s.lingerUntil) endLinger(s); continue; }
    if (t >= s.endsAt) { endSession(s.id, 'expired'); continue; }
    if (hostGone(s) && s.host.goneAt && t - s.host.goneAt > hooks.hostGoneMs) { endSession(s.id, 'ended'); continue; }
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
