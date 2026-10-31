// Oomba Live wire protocol, version 1 (docs/decisions.md "Oomba Live"; the full table is in docs/live-protocol.md).
// Pure: no database, no sockets. parse() is the only way a message from a device becomes something the server acts on:
// it checks the type, who may send it, every field's type and range, and the shape of game event data (numbers,
// booleans, null and identifier tokens only). Players' events are checked again against the game's own words
// (evVocabOk), and the host's strings against the text filter, so no prose can travel to players: a game can't
// become a chat.
// JSON text frames with short keys. Positions are whole numbers: x, y, z in centimetres, heading 0-255, animation index.

export const V = 1;
export const EMOTES = ['wave', 'cheer', 'jump', 'dance', 'clap', 'heart'];
export const ANIM = ['idle', 'walk', 'run', 'jump', 'cheer', 'hurt', 'wave', 'dance'];
export const HOST_ACTIONS = ['start', 'pause', 'resume', 'next', 'skip', 'lock', 'unlock', 'kick', 'end'];
export const VIEWS = ['3d', '2d', 'watch'];
export const BYE = ['removed', 'ended', 'full', 'locked', 'replaced', 'expired', 'restart', 'flood', 'takenDown'];
/** Largest message (bytes of JSON) a player may send; the host's page and frame may send more (shared state). */
export const MAX = { player: 2 * 1024, host: 16 * 1024, ev: 512, state: 8 * 1024 };
/** Messages per second per type (token buckets: this rate, a burst of twice it). Over: dropped silently. */
export const RATES = { hello: 1, rdy: 2, mv: 12, ev: 10, sc: 2, it: 4, an: 2, em: 1, pi: 1, h: 5, st: 5, fr: 1 };
/** Player-side types; the host may send the rest too (and h, st only it). */
const PLAYER_TYPES = new Set(['hello', 'rdy', 'mv', 'ev', 'sc', 'it', 'an', 'em', 'pi', 'fr']);
const HOST_TYPES = new Set(['hello', 'rdy', 'ev', 'pi', 'h', 'st', 'fr']);
/** Positions: at most 1 km from the centre either way (the session's own bounds clamp further). */
const POS_MAX = 100000;
export const KIND_RE = /^[a-z][a-z0-9_-]{0,23}$/;
export const TOKEN_RE = /^[a-z0-9_-]{1,24}$/;

const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const num = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

/**
 * Game event data: numbers, booleans, null and identifier tokens (lower case letters, digits, _ and -, 1-24 long), in
 * arrays or objects nested at most 2 deep, with token keys. No other strings: no spaces, no capitals, no prose. -> bool
 */
export function evDataOk(d, depth = 0) {
  if (d === null || typeof d === 'boolean') return true;
  if (typeof d === 'number') return Number.isFinite(d);
  if (typeof d === 'string') return TOKEN_RE.test(d);
  if (depth >= 2 || typeof d !== 'object') return false;
  if (Array.isArray(d)) return d.length <= 64 && d.every(x => evDataOk(x, depth + 1));
  const keys = Object.keys(d);
  return keys.length <= 32 && keys.every(k => TOKEN_RE.test(k) && evDataOk(d[k], depth + 1));
}

/**
 * A player's game event against the game's own vocabulary (words: a Set from Oomba.live.ready({ words })): the kind,
 * every string and every object key longer than 2 characters must be one of the game's words. Players relay only what
 * the game itself says, so no message a player makes up (add_me_on_snap) can reach another player. -> bool
 */
export function evVocabOk(kind, d, words) {
  const w = words instanceof Set ? words : new Set(words || []);
  if (!w.has(kind)) return false;
  const ok = (v, depth) => {
    if (v === null || typeof v !== 'object') return typeof v !== 'string' || w.has(v);
    if (depth >= 2) return false;
    if (Array.isArray(v)) return v.every(x => ok(x, depth + 1));
    return Object.keys(v).every(k => (k.length <= 2 || w.has(k)) && ok(v[k], depth + 1));
  };
  return ok(d, 0);
}

/** Shared state patches (host only): plain JSON objects, nested at most 4 deep, numbers/booleans/null and short
 *  strings (≤ 200 characters each). Strings also go through the text filter before anyone sees them (sessions.js
 *  setState): no rude words, contact details, handles or links, the same as question text. */
export function stateOk(d, depth = 0) {
  if (d === null || typeof d === 'boolean') return true;
  if (typeof d === 'number') return Number.isFinite(d);
  if (typeof d === 'string') return d.length <= 200;
  if (depth >= 4 || typeof d !== 'object') return false;
  if (Array.isArray(d)) return d.length <= 200 && d.every(x => stateOk(x, depth + 1));
  const keys = Object.keys(d);
  return keys.length <= 100 && keys.every(k => k.length <= 40 && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && stateOk(d[k], depth + 1));
}

/**
 * raw (a string or Buffer from the socket) and role ('player' | 'host') -> a clean message { t, ... } or null.
 * Unknown types, extra fields and anything out of range: null (the socket drops it).
 */
export function parse(raw, role = 'player') {
  const s = typeof raw === 'string' ? raw : Buffer.isBuffer(raw) ? raw.toString('utf8') : null;
  if (s === null || s.length > (role === 'host' ? MAX.host : MAX.player)) return null;
  let m; try { m = JSON.parse(s); } catch { return null; }
  if (!m || typeof m !== 'object' || Array.isArray(m) || typeof m.t !== 'string') return null;
  if (!(role === 'host' ? HOST_TYPES : PLAYER_TYPES).has(m.t)) return null;
  switch (m.t) {
    case 'hello':
      return int(m.v, 1, 99) && typeof m.tok === 'string' && m.tok.length <= 2048 ? { t: 'hello', v: m.v, tok: m.tok } : null;
    case 'rdy': {
      const view = m.view === undefined ? '3d' : m.view;
      if (!VIEWS.includes(view)) return null;
      const out = { t: 'rdy', view };
      if (role === 'host' && m.cfg !== undefined) { const cfg = cleanCfg(m.cfg); if (!cfg) return null; out.cfg = cfg; }
      return out;
    }
    case 'mv': {
      const p = m.p;
      if (!Array.isArray(p) || p.length !== 5) return null;
      const [x, y, z, h, a] = p;
      if (!int(x, -POS_MAX, POS_MAX) || !int(y, -POS_MAX, POS_MAX) || !int(z, -POS_MAX, POS_MAX) || !int(h, 0, 255) || !int(a, 0, ANIM.length - 1)) return null;
      return { t: 'mv', p: [x, y, z, h, a] };
    }
    case 'ev': {
      if (typeof m.k !== 'string' || !KIND_RE.test(m.k)) return null;
      const d = m.d === undefined ? null : m.d;
      if (!evDataOk(d)) return null;
      let size; try { size = JSON.stringify(d).length; } catch { return null; }
      if (size > MAX.ev) return null;
      const out = { t: 'ev', k: m.k, d };
      if (m.to !== undefined) {
        if (role === 'player' && m.to === 'host') out.to = 'host';
        else if (role === 'host' && int(m.to, 1, 1000)) out.to = m.to;
        else return null;
      }
      return out;
    }
    case 'sc': return num(m.n, 0, 1e6) ? { t: 'sc', n: Math.floor(m.n) } : null;
    case 'it': return int(m.i, 0, 199) && typeof m.ok === 'boolean' ? { t: 'it', i: m.i, ok: m.ok } : null;
    case 'an': return int(m.i, 0, 199) && int(m.c, 0, 3) && num(m.e, 0, 600000) ? { t: 'an', i: m.i, c: m.c, e: Math.floor(m.e) } : null;
    case 'em': return int(m.e, 0, EMOTES.length - 1) ? { t: 'em', e: m.e } : null;
    case 'pi': return num(m.c, 0, 1e15) ? { t: 'pi', c: m.c } : null;
    case 'fr': return m.f === undefined || m.f === 'game' || m.f === 'lobby' ? { t: 'fr', f: m.f || 'game' } : null;
    case 'h': {
      if (!HOST_ACTIONS.includes(m.a)) return null;
      const out = { t: 'h', a: m.a };
      if (m.a === 'kick') { if (!int(m.n, 1, 1000)) return null; out.n = m.n; }
      if (m.a === 'next' || m.a === 'skip') { if (!int(m.at, 0, 1e9)) return null; out.at = m.at; }
      return out;
    }
    case 'st': {
      if (!m.d || typeof m.d !== 'object' || Array.isArray(m.d) || !stateOk(m.d)) return null;
      return { t: 'st', d: m.d };
    }
    default: return null;
  }
}

/** The game's live settings, sent by the host's frame with its rdy (Oomba.live.ready(opts) in the host view). */
export function cleanCfg(c) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const out = {};
  if (c.presence !== undefined) {
    const p = c.presence;
    if (!p || typeof p !== 'object') return null;
    const bounds = p.bounds === undefined ? 100 : p.bounds;
    const maxSpeed = p.maxSpeed === undefined ? 12 : p.maxSpeed;
    if (!num(bounds, 1, 1000) || !num(maxSpeed, 0.5, 100)) return null;
    out.presence = { bounds, maxSpeed };
  }
  for (const k of ['lobby', 'quiz', 'hostView']) if (c[k] !== undefined) { if (typeof c[k] !== 'boolean') return null; out[k] = c[k]; }
  if (c.maxScorePerSec !== undefined) { if (!num(c.maxScorePerSec, 1, 1e5)) return null; out.maxScorePerSec = c.maxScorePerSec; }
  return out;
}

/** Per-connection token buckets, one per message type. now: a clock (tests pass a fake one). */
export function buckets(now = Date.now) {
  const b = new Map();
  let win = -1, drops = 0, run = 0, lastFlood = -2;
  return {
    /** -> true if this message may go through. */
    take(type) {
      const rate = RATES[type] || 1, cap = rate * 2, t = now();
      let k = b.get(type);
      if (!k) { k = { n: cap, at: t }; b.set(type, k); }
      k.n = Math.min(cap, k.n + ((t - k.at) / 1000) * rate); k.at = t;
      if (k.n >= 1) { k.n -= 1; return true; }
      return false;
    },
    /** A message was dropped. A second with more than twice the type's rate in drops means the sender runs at over 3x
     *  the limit; five such seconds in a row -> true (a flood: the socket closes with 4429). */
    dropped(type) {
      const w = Math.floor(now() / 1000);
      if (w !== win) { win = w; drops = 0; }
      drops++;
      if (drops === (RATES[type] || 1) * 2 + 1) { run = lastFlood === w - 1 ? run + 1 : 1; lastFlood = w; }
      return run >= 5;
    },
  };
}

/** The player tuple of the roster: [seat, name, avatar, team, score, connected, ready, late]. */
export const playerTuple = (seat, name) => [seat.no, name, seat.avatar, seat.team || 0, seat.score || 0, seat.conn ? 1 : 0, seat.ready ? 1 : 0, seat.late ? 1 : 0];
