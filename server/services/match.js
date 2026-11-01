// Online matches: two players, one game, each on their own device (docs/decisions.md "Online matches"; safety:
// docs/safety.md §13). A player invites a friend (or someone in their family) or shares a 6-character match code.
// The server only relays the game's events: numbers and booleans in a fixed shape, never text, so a match can never
// become a chat. Each side's game checks the moves itself (both run the same rules).
// Everything lives in memory: a restart ends the matches in progress (the page says the game has ended).
import crypto from 'node:crypto';
import { isGrownup, getUser } from '../auth.js';
import * as friends from './friends.js';
import * as family from './family.js';
import { isBlocked } from './chat.js';
import { characterOf } from './character.js';
import { pickNick, randomAvatar, nickKey } from './classlive-names.js';

/** Official games that can be played online (their code uses BRB.match). Slugs. */
export const GAMES = new Set(['castle-clash']);
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';   // no 0/O or 1/I
export const LIMITS = { codeMs: 15 * 60e3, idleMs: 3 * 3600e3, events: 3000, waitMs: 20e3, onlineMs: 30e3, open: 5 };
export const KINDS = new Set(['mv', 'act']);

const matches = new Map();   // id -> match
const codes = new Map();     // code -> id

/** A match code as people type it: letters and digits only, upper case. */
export const normCode = s => String(s ?? '').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Shown as ABC-DEF so it is easy to read out. */
export const showCode = c => (c ? c.slice(0, 3) + '-' + c.slice(3) : '');

function newCode() {
  for (;;) {
    let c = ''; for (let i = 0; i < 6; i++) c += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
    if (!codes.has(c) && !/^\d+$/.test(c)) return c;
  }
}

/** The family around an account: a grown-up's linked children; a child's grown-up and brothers and sisters. */
export function familyIds(u) {
  if (!u || u.is_guest) return [];
  const linked = fid => family.childrenOf(fid).filter(c => c.status === 'linked').map(c => c.child_id);
  if (isGrownup(u)) { const f = family.familyOfOwner(u.id); return f ? linked(f.id) : []; }
  const l = family.linkOf(u.id); const f = l && family.familyById(l.family_id);
  return f ? [f.owner_id, ...linked(f.id).filter(id => id !== u.id)] : [];
}
const inFamily = (a, b) => familyIds(a).includes(b.id);
/** Know each other: friends (connections for grown-ups) or family. They see each other's names; anyone else a nickname. */
export const knows = (a, b) => friends.status(a.id, b.id) === 'friends' || inFamily(a, b);
/** May these two play each other? Two kids or two grown-ups (as for friends), or family; never when either blocked the other. */
export function mayPair(a, b) {
  if (!a || !b || a.id === b.id || a.banned || b.banned) return false;
  if (isBlocked(a.id, b.id) || isBlocked(b.id, a.id)) return false;
  return friends.samePair(a, b) || inFamily(a, b);
}

/** Friends and family the player can invite, with who is playing this game right now. */
export function people(u, playingIds = new Set()) {
  if (!u || u.is_guest) return [];
  const seen = new Set(), out = [];
  const add = (p, kind) => {
    if (!p || seen.has(p.id) || p.banned || p.is_guest) return; seen.add(p.id);
    if (!mayPair(u, p)) return;
    out.push({ id: p.id, name: p.display_name, avatar: p.avatar || '🙂', kind, playing: playingIds.has(p.id) });
  };
  for (const id of familyIds(u)) add(getUser(id), 'family');
  for (const f of friends.list(u.id)) add(getUser(f.id), 'friend');
  return out.sort((a, b) => (b.playing - a.playing) || a.name.localeCompare(b.name));
}

function touch(m) { m.touched = Date.now(); }
function seatOf(m, u) { return !u ? -1 : m.seats[0] === u.id ? 0 : m.seats[1] === u.id ? 1 : -1; }
const openCount = uid => [...matches.values()].filter(m => m.state !== 'ended' && m.seats.includes(uid)).length;

/** Starts a match: an invite to one person (inviteId) or a code anyone may use. */
export function create(u, game, inviteId = null) {
  if (!u) return { error: 'signIn' };
  if (!game || !GAMES.has(game.slug)) return { error: 'notOnline' };
  // A player waits for one match at a time: a new one replaces the one still waiting.
  for (const m of matches.values()) if (m.state === 'waiting' && m.seats[0] === u.id) end(m, 'cancel');
  if (openCount(u.id) >= LIMITS.open) return { error: 'tooMany' };
  let invited = null;
  if (inviteId) {
    invited = getUser(String(inviteId));
    if (!invited || u.is_guest || !people(u).some(p => p.id === invited.id)) return { error: 'notFound' };
  }
  const id = crypto.randomBytes(9).toString('base64url');
  const code = invited ? null : newCode();
  const n0 = pickNick();
  const m = {
    id, gameId: game.id, slug: game.slug, title: game.title, icon: game.icon, code, invited: invited ? invited.id : null,
    seats: [u.id, null], nicks: [n0, pickNick(new Set([n0]))], looks: [randomAvatar(), randomAvatar()],
    state: 'waiting', created: Date.now(), touched: Date.now(), events: [], seen: [Date.now(), 0], waiters: new Set(), leftBy: -1,
  };
  matches.set(id, m); if (code) codes.set(code, id);
  return { match: m };
}

function begin(m, u) {
  m.seats[1] = u.id; m.state = 'playing'; m.seen[1] = Date.now(); touch(m);
  if (m.code) { codes.delete(m.code); m.code = null; }
  wake(m);
}
/** Joins with a code. A code that is wrong, used, old, your own or for someone you may not play is "not found". */
export function joinByCode(u, typed) {
  const c = normCode(typed);
  if (c.length !== 6) return { error: 'codeLength' };
  const m = matches.get(codes.get(c));
  if (!m || m.state !== 'waiting' || Date.now() - m.created > LIMITS.codeMs) return { error: 'notFound', wrong: true };
  if (m.seats[0] === u.id) return { error: 'ownCode' };
  const host = getUser(m.seats[0]);
  if (!mayPair(host, u)) return { error: 'notFound', wrong: true };
  if (openCount(u.id) >= LIMITS.open) return { error: 'tooMany' };
  begin(m, u);
  return { match: m };
}
/** Answers an invite. */
export function accept(u, id) {
  const m = matches.get(String(id));
  if (!m || m.state !== 'waiting' || m.invited !== u.id || Date.now() - m.created > LIMITS.codeMs) return { error: 'gone' };
  if (!mayPair(getUser(m.seats[0]), u)) return { error: 'gone' };
  begin(m, u);
  return { match: m };
}
export function decline(u, id) {
  const m = matches.get(String(id));
  if (!m || m.state !== 'waiting' || m.invited !== u.id) return false;
  end(m, 'declined'); return true;
}
/** Invites waiting for this player. */
export function inbox(u) {
  if (!u || u.is_guest) return [];
  const t = Date.now(), out = [];
  for (const m of matches.values()) {
    if (m.state !== 'waiting' || m.invited !== u.id || t - m.created > LIMITS.codeMs) continue;
    const from = getUser(m.seats[0]); if (!from || !mayPair(from, u)) continue;
    out.push({ id: m.id, from: { name: from.display_name, avatar: from.avatar || '🙂' }, game: { slug: m.slug, title: m.title, icon: m.icon } });
  }
  return out;
}

function end(m, why, seat = -1) {
  if (m.state === 'ended') return;
  m.state = 'ended'; m.why = why; m.leftBy = seat; touch(m);
  if (m.code) { codes.delete(m.code); m.code = null; }
  wake(m);
}
/** Leaves for good (or cancels a match still waiting). */
export function leave(u, id) {
  const m = matches.get(String(id)); const s = m ? seatOf(m, u) : -1;
  if (s < 0) return false;
  end(m, m.state === 'waiting' ? 'cancel' : 'left', s);
  return true;
}

/** Game event data: an object of up to 8 short keys, each an integer 0-9999 or a boolean. Never a string. */
export function cleanData(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const keys = Object.keys(d); if (keys.length > 8) return null;
  const out = {};
  for (const k of keys) {
    const v = d[k];
    if (!/^[a-z]{1,2}$/.test(k)) return null;
    if (typeof v === 'boolean' || (Number.isInteger(v) && v >= 0 && v <= 9999)) out[k] = v; else return null;
  }
  return out;
}
export function send(u, id, k, d) {
  const m = matches.get(String(id)); const s = m ? seatOf(m, u) : -1;
  if (s < 0) return { error: 'gone' };
  if (m.state !== 'playing') return { error: 'notPlaying' };
  const data = cleanData(d);
  if (!KINDS.has(k) || !data) return { error: 'bad' };
  if (m.events.length >= LIMITS.events) return { error: 'full' };
  m.events.push([m.events.length, s, k, data]); m.seen[s] = Date.now(); touch(m);
  wake(m);
  return { ok: true, n: m.events.length };
}

/** What a seat sees: names and looks (real ones only between friends or family), the state and the events after `after`. */
export function view(m, s, after = 0, tr = null) {
  const other = 1 - s, t = Date.now();
  const me = getUser(m.seats[s]), opp = m.seats[other] ? getUser(m.seats[other]) : null;
  const known = !!(me && opp && knows(me, opp));
  const nick = i => (tr ? tr(nickKey(m.nicks[i])) : nickKey(m.nicks[i]));
  const oppOn = !!opp && m.state === 'playing' && ([...m.waiters].some(w => w.seat === other) || t - m.seen[other] < LIMITS.onlineMs);
  return {
    state: m.state, seat: s, n: m.events.length,
    ev: m.events.slice(Math.max(0, after | 0)),
    me: { name: me ? me.display_name : nick(s) },
    opp: opp ? { name: known ? opp.display_name : nick(other), character: known ? characterOf(opp) : m.looks[other], on: oppOn } : null,
    left: m.state === 'ended' && m.leftBy === other,
    ...(m.state === 'waiting' ? { code: s === 0 ? showCode(m.code) : '', waitingFor: m.invited ? (getUser(m.invited) || {}).display_name || '' : '' } : {}),
  };
}

/** Long poll: answers at once when there is news after `after` (or the state changed), else within LIMITS.waitMs. */
export function wait(u, id, after, known, cb, tr = null) {
  const m = matches.get(String(id)); const s = m ? seatOf(m, u) : -1;
  if (s < 0) { cb(null); return () => {}; }
  m.seen[s] = Date.now();
  const stamp = () => `${m.state}:${m.events.length}:${m.seats[1] ? 1 : 0}`;
  if (m.events.length > after || stamp() !== known || m.state === 'ended') { cb(view(m, s, after, tr)); return () => {}; }
  const w = { seat: s, fire: null };
  const done = () => { clearTimeout(w.timer); m.waiters.delete(w); m.seen[s] = Date.now(); };
  w.fire = () => { done(); cb(view(m, s, after, tr)); };
  w.timer = setTimeout(w.fire, LIMITS.waitMs);
  m.waiters.add(w);
  return done;
}
export const stampOf = v => `${v.state}:${v.n}:${v.opp ? 1 : 0}`;
function wake(m) { for (const w of [...m.waiters]) w.fire(); }

export const get = id => matches.get(String(id)) || null;
export { seatOf };

// Old matches go: codes after 15 minutes, everything after 3 idle hours, ended ones after 10 minutes.
function sweep(t = Date.now()) {
  for (const [id, m] of matches) {
    if (m.state === 'waiting' && t - m.created > LIMITS.codeMs) end(m, 'expired');
    if (t - m.touched > (m.state === 'ended' ? 10 * 60e3 : LIMITS.idleMs) && !m.waiters.size) { matches.delete(id); if (m.code) codes.delete(m.code); }
  }
}
setInterval(sweep, 60e3).unref();
export const _sweep = sweep;
export const _reset = () => { for (const m of matches.values()) for (const w of m.waiters) clearTimeout(w.timer); matches.clear(); codes.clear(); };
