// Live games inside Homeroom (docs/decisions.md "Homeroom: live games inside Homeroom, a simpler Find lessons"). The
// owner: "Make sure Brain Board and Would You Rather open up in Homeroom. You should be able to start live games
// directly from the board room. Experience should be seamless."
//
// A live game is an Oomba Live room (services/classlive-sessions.js) for the class: the teacher opens the real host
// pages (/live, /live/host/<sid>) in a layer over the board (?in=hr: routes/homeroom-liveembed.js), so nothing here makes
// a room or runs a game. This file only says what is running for the class (openForClass: the class's open "My class"
// room) to the board (the pill, "In Brain Board" on desks), the projector (its host screen) and the desks (a seat for a
// signed-in student of the class, so no code is typed), and ends it for its host.
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
const iconOf = s => (s.mode === 'game' ? (games.getGame(s.gameId) || {}).icon || '🎮' : ICONS[s.mode] || '📡');

/** What the board shows: the title, players connected, the class's students in it, and whether this teacher hosts it. */
export function boardView(c, u) {
  const s = gameOf(c); if (!s) return null;
  const kids = new Set(H.studentsOf(c.id).map(x => x.id));
  const seats = [...s.seats.values()];
  const role = u ? LS.roleOf(s, u.id) : null;
  return { sid: s.id, title: s.title, icon: iconOf(s), phase: s.phase, players: seats.filter(x => x.conn).length,
    in: seats.filter(x => x.conn && x.userId && kids.has(x.userId)).map(x => x.userId), host: role === 'host', ctl: !!role };
}
/** The projector: the game's title, and its host screen's address only for its host or a co-host (their own sign-in). */
export function projectorView(c, u) {
  const s = gameOf(c); if (!s) return null;
  const role = u ? LS.roleOf(s, u.id) : null;
  return { sid: s.id, title: s.title, icon: iconOf(s), ...(role ? { host: `/live/host/${s.id}` } : {}) };
}
/** A desk: the game to join (title and icon only; the seat comes from join). */
export function deskView(c, u) {
  const s = gameOf(c); if (!s || !u) return null;
  if (s.banned.has(u.id)) return null;
  return { sid: s.id, title: s.title, icon: iconOf(s), seated: s.byUser.has(u.id) };
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
