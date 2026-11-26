// Homeroom: watching desks (docs/decisions.md "Homeroom: watching desks and the full catalog"). The owner: "I want to make
// sure that teachers can see what students are doing in oomba at their desks. This should look exactly like
// manipulatives." The Manipulatives live room shows each student's board in its square because the board's state is
// shared, never pixels; Homeroom does the same wherever it can and sends a small picture only where it can't:
//   - at their desk, on the doodle pad and reading: the board draws it from what it already has (their cards, their pad's
//     strokes, the book and the page: state, as Manipulatives does);
//   - a Manipulatives tool: the student's square in that tool's live room, drawn by the tool's own code from its saved
//     board (services/homeroom-tools.js boardsOf), with their cursor;
//   - a game in the in-desk player: the game runs in a sandboxed frame on another origin, so nothing outside it can read
//     it. The frame's own SDK (public/sdk/brb-sdk.js, "Homeroom: a small picture") draws a small picture of the game
//     when the play page asks, and the play page (public/js/homeroom-pulse.js) sends it here: this file.
// Pictures are asked for only while the teacher's board is on screen and polling (it says which desks are in view, and
// which one is open large in "look"), so a desk nobody is looking at sends nothing. Limits (WATCH):
//   - a desk in view: one picture every TILE.every (5 s), at most TILE.w pixels wide and TILE.bytes;
//   - the desk open large (look): one every LOOK.every (1.5 s), at most LOOK.w wide and LOOK.bytes;
//   - a picture sooner than 80% of that, bigger, of another kind than a picture (data:image/webp|jpeg|png), or while
//     nobody watches is refused; only while class is live; never for a student marked absent or at home (their home
//     device), never while Pause screens is on.
// Memory only: the newest picture per student, gone after STALE_MS (30 s), at End class, a new live class, or when the
// student leaves the class. Never written to the database, a log line or a file; never recorded. Only the class's
// teachers and aides get them (the board's pulse poll behind the Homeroom gate); never a student, a classmate, the
// projector, parents or a sub's link. No camera, no photos: it is a drawing of the game's own page.
import { now } from '../db.js';
import * as H from './homeroom.js';
import * as AT from './homeroom-attendance.js';
import * as S from './schools.js';

const ok = (x = {}) => ({ ok: true, ...x });
const fail = code => ({ ok: false, code });
export const TILE = Object.freeze({ w: 240, bytes: 24000, every: 5000 });
export const LOOK = Object.freeze({ w: 640, bytes: 110000, every: 1500 });
/** A board that stopped asking (hidden, closed, another view) is watching nobody after this long. */
export const WATCH_MS = 7000;
/** A picture older than this is not shown. */
export const STALE_MS = 30e3;
/** Desks a board may watch at once (the ones in its view). */
export const TILES_MAX = 40;
const IMG_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

/** classId -> { tiles: Map(sid -> at), look: Map(sid -> at), snaps: Map(sid -> { img, at, v, cur, on, w, h }), v } */
const rooms = new Map();
const roomOf = classId => { let r = rooms.get(classId); if (!r) { r = { tiles: new Map(), look: new Map(), snaps: new Map(), v: 0 }; rooms.set(classId, r); } return r; };
/** For tests. */
export const _reset = () => rooms.clear();
export const _rooms = rooms;

/** The teacher's board says which desks it shows now (tiles) and which one is open large (look). */
export function watch(c, { tiles = [], look = '' } = {}, at = now()) {
  const ids = new Set(H.studentsOf(c.id).map(s => s.id)), r = roomOf(c.id);
  for (const sid of [...new Set(tiles)].slice(0, TILES_MAX)) if (ids.has(sid)) r.tiles.set(sid, at);
  if (look && ids.has(look)) r.look.set(look, at);
}
/** What this student's desk is asked for now: 'look' | 'tile' | ''. */
export function watchOf(c, sid, at = now()) {
  const r = rooms.get(c.id); if (!r) return '';
  const live = H.liveOf(c.id);
  if (!live || live.paused || AT.statusOf(c.id, sid, at)) return '';
  if (at - (r.look.get(sid) || 0) < WATCH_MS) return 'look';
  if (at - (r.tiles.get(sid) || 0) < WATCH_MS) return 'tile';
  return '';
}
const limitsOf = mode => (mode === 'look' ? LOOK : TILE);
const frac = v => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : 0; };

/**
 * A student's play page sends a picture of their game: { img (a data: picture), w, h (its size), cur ([x, y] fractions,
 * or none), on (the handout) }. Their own desk only (the desk gate), while live and watched, within the limits.
 * -> { ok, watch } | { ok: false, code: notFound | notLive | notWatched | tooBig | badImage | slow }
 */
export function putSnap(u, c, body = {}, at = now()) {
  if (!H.canUseDesk(u, c)) return fail('notFound');
  if (!H.liveOf(c.id)) return fail('notLive');
  const mode = watchOf(c, u.id, at);
  if (!mode) return fail('notWatched');
  const L = limitsOf(mode), img = typeof body.img === 'string' ? body.img : '';
  if (img.length > LOOK.bytes || (mode === 'tile' && img.length > TILE.bytes)) return fail('tooBig');
  if (!IMG_RE.test(img)) return fail('badImage');
  const w = Math.round(Number(body.w) || 0), h = Math.round(Number(body.h) || 0);
  if (w < 16 || h < 16 || w > L.w || h > L.w * 2) return fail('badImage');
  const r = roomOf(c.id), old = r.snaps.get(u.id);
  if (old && at - old.at < L.every * 0.8) return fail('slow');
  const cur = Array.isArray(body.cur) && body.cur.length === 2 ? [frac(body.cur[0]), frac(body.cur[1])] : null;
  r.snaps.set(u.id, { img, at, v: ++r.v, cur, on: typeof body.on === 'string' ? body.on.slice(0, 40) : '', w, h, mode });
  return ok({ watch: mode, every: L.every, w: L.w });
}
/** What the desk's pulse answer says about watching: { watch, every, w } (the play page's loop reads it). */
export function askFor(c, sid, at = now()) {
  const mode = watchOf(c, sid, at);
  return mode ? { watch: mode, every: limitsOf(mode).every, w: limitsOf(mode).w } : { watch: '' };
}
/**
 * The pictures the board does not have yet, for the desks it watches: { sid: { img, v, age, cur, on, w, h } }; have:
 * { sid: v } (what it has). Pictures of a student now absent or at home, or older than STALE_MS, are not sent.
 */
export function snapsFor(c, have = {}, at = now()) {
  const r = rooms.get(c.id), out = {}, live = H.liveOf(c.id); if (!r || !live || live.paused) return out;
  for (const [sid, s] of r.snaps) {
    if (at - s.at > STALE_MS) { r.snaps.delete(sid); continue; }
    const watched = at - Math.max(r.tiles.get(sid) || 0, r.look.get(sid) || 0) < WATCH_MS;
    if (!watched || AT.statusOf(c.id, sid, at) || Number(have[sid]) === s.v) continue;
    out[sid] = { img: s.img, v: s.v, age: at - s.at, cur: s.cur, on: s.on, w: s.w, h: s.h };
  }
  return out;
}
/** Versions of the fresh pictures (no picture itself): { sid: v }. */
export function versionsOf(c, at = now()) {
  const r = rooms.get(c.id), out = {}; if (!r) return out;
  for (const [sid, s] of r.snaps) if (at - s.at <= STALE_MS) out[sid] = s.v;
  return out;
}
/** End class, a new class, the student leaving: forget. */
export function clearClass(classId) { rooms.delete(classId); }
export function forget(classId, sid) { const r = rooms.get(classId); if (r) { r.snaps.delete(sid); r.tiles.delete(sid); r.look.delete(sid); } }
H.onLive(({ c, action, wasLive }) => { if (action === 'end' || (action === 'start' && !wasLive) || action === 'pause') clearClass(c.id); });
S.onClassLeave(({ classId, userId = null } = {}) => { if (!classId) return; if (userId) forget(classId, userId); else clearClass(classId); });
