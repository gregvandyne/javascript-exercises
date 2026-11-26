// Live games inside Homeroom (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find lessons"). The
// owner: "Make sure Brain Board and Would You Rather open up in Homeroom. You should be able to start live games
// directly from the board room. Experience should be seamless."
//
// A live game is an Oomba Live room (services/classlive-sessions.js) for the class: the teacher opens the real host
// pages (/live, /live/host/<sid>) in a layer over the board (?in=hr: routes/homeroom-liveembed.js), so nothing here makes
// a room or runs a game. This file only says what is running for the class (openForClass: the class's open "My class"
// room) to the board (the pill, "In Brain Board" on desks), the projector (its host screen) and the desks (a banner with Join,
// then a seat for a signed-in student of the class, so no code is typed), and ends it for its host.
import * as LS from './classlive-sessions.js';
import * as games from './games.js';
import * as H from './homeroom.js';

const ICONS = { 'quest-race': '🏝️', battle: '⚡', board: '🌟', wyr: '🤔', atlas: '🌍', tug: '🪢', doodle: '🦉' };

/** The class's open live room, or null (live games off, none, or ended). */
export function gameOf(c) {
  if (!c || !LS.liveOn()) return null;
  const s = LS.openForClass(c.id);
  return s && s.phase !== 'ended' ? s : null;
}
// Who of the class has Homeroom's desk open now (the desk's state poll calls deskView every few seconds while a game
// runs): memory only, for the pill's "N joined of M in Homeroom" and the board's "Not joined yet". Never written down.
const SEEN_MS = 25e3;
const seen = new Map();   // classId -> Map(userId -> last poll)
const sawDesk = (classId, userId) => { let m = seen.get(classId); if (!m) { m = new Map(); seen.set(classId, m); } m.set(userId, Date.now()); };
function atDesks(classId) {
  const m = seen.get(classId); if (!m) return [];
  const t0 = Date.now() - SEEN_MS, out = [];
  for (const [id, at] of m) { if (at < t0) m.delete(id); else out.push(id); }
  if (!m.size) seen.delete(classId);
  return out;
}
const iconOf = s => (s.mode === 'game' ? (games.getGame(s.gameId) || {}).icon || '🎮' : ICONS[s.mode] || '📡');

/** What the board shows: the title, players connected, the class's students in it, how many of the class are in
 *  Homeroom (here: on their desks or in the game), those on their desks who have not joined (waiting), and whether
 *  this teacher hosts it. */
export function boardView(c, u) {
  const s = gameOf(c); if (!s) return null;
  const kids = new Set(H.studentsOf(c.id).map(x => x.id));
  const seats = [...s.seats.values()];
  const role = u ? LS.roleOf(s, u.id) : null;
  const inIds = seats.filter(x => x.conn && x.userId && kids.has(x.userId)).map(x => x.userId);
  const isIn = new Set(inIds), waiting = atDesks(c.id).filter(id => kids.has(id) && !isIn.has(id));
  return { sid: s.id, title: s.title, icon: iconOf(s), phase: s.phase, players: seats.filter(x => x.conn).length,
    in: inIds, here: inIds.length + waiting.length, waiting, host: role === 'host', ctl: !!role };
}
/** The projector: the game's title, and its host screen's address only for its host or a co-host (their own sign-in). */
export function projectorView(c, u) {
  const s = gameOf(c); if (!s) return null;
  const role = u ? LS.roleOf(s, u.id) : null;
  return { sid: s.id, title: s.title, icon: iconOf(s), ...(role ? { host: `/live/host/${s.id}` } : {}) };
}
/** A desk: the game to join (title, icon, and whether it is still in its lobby; the seat comes from join). Nothing
 *  opens by itself: the desk shows a banner with Join while the game runs. */
export function deskView(c, u) {
  const s = gameOf(c); if (!s || !u) return null;
  if (s.banned.has(u.id)) return null;
  sawDesk(c.id, u.id);
  return { sid: s.id, title: s.title, icon: iconOf(s), lobby: s.phase === 'lobby', seated: s.byUser.has(u.id) };
}
/** A student of the class joins the class's live game as themselves (no code): -> { ok, sid, tok, play } | { ok: false, code } */
export function join(c, u, lang = 'en') {
  const s = gameOf(c); if (!s) return { ok: false, code: 'noLiveGame' };
  const r = LS.join(s, u, { lang });
  if (!r.ok) return { ok: false, code: r.code === 'full' ? 'liveFull' : r.code === 'locked' ? 'liveLocked' : 'noLiveGame' };
  return { ok: true, sid: s.id, tok: r.token, play: `/live/play/${s.id}` };
}
/** Its host ends it from the board's pill (the same end as the host page's End). */
export function end(c, u) {
  const s = gameOf(c);
  if (!s || !u || LS.roleOf(s, u.id) !== 'host') return { ok: false, code: 'notFound' };
  LS.endSession(s.id, 'ended');
  return { ok: true, sid: s.id };
}
