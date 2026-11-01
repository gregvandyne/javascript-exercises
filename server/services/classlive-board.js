// Brain Board (the built-in mode 'board'): a board of category columns with tiles worth 100 to 500. The host (or, when
// the host lets them, the player whose turn it is) picks a tile; its question opens for everyone at once through the
// usual quiz machinery (classlive-quiz.js), and a right answer scores the tile's value plus a little for speed. One or
// two hidden Lucky Star tiles score double. No wagers, no typing, no points lost for a wrong answer.
//
// The board is shared state the server owns: s.state.bb (sent to every device and the projector with the usual 'st'
// message; docs/live-protocol.md "Brain Board"). Category names come from the question set (written by the teacher and
// checked when the set was saved); a set without categories is split into columns by the game ("Set 1", "Set 2"...).
import crypto from 'node:crypto';

export const COLS = 6, ROWS = 5, STEP = 100;
/** Speed bonus: up to this share of the tile's value for an instant answer. */
export const SPEED_SHARE = 0.2;
/** How long after the last reveal a finished board ends by itself. */
export const END_MS = 9000;

/**
 * The board for a list of items -> { cols: [{ cat, tiles: [{ i (item index), v (value) }] }] }.
 * Items with a category (it.cat) are grouped by it, in the order the categories first appear, up to 5 a column (the
 * set's order, so later ones are worth more: teachers write them easy to hard). Items without one fill numbered
 * columns row by row, so later items sit lower (worth more). At most 6 columns and 30 tiles.
 */
export function layout(items) {
  const byCat = new Map(), loose = [];
  items.forEach((it, i) => {
    const c = String(it.cat || '').trim();
    if (!c) { loose.push(i); return; }
    const key = c.toLowerCase();
    if (!byCat.has(key)) byCat.set(key, { cat: c, list: [] });
    const g = byCat.get(key); if (g.list.length < ROWS) g.list.push(i);
  });
  const cols = [...byCat.values()].slice(0, COLS).map(g => ({ cat: g.cat, tiles: g.list.map((i, r) => ({ i, v: (r + 1) * STEP })) }));
  const room = COLS - cols.length;
  if (loose.length && room > 0) {
    const n = Math.min(loose.length, room * ROWS);
    const rows = n >= 10 ? ROWS : Math.max(1, Math.ceil(n / 2));
    const k = Math.min(room, Math.ceil(n / rows));
    const extra = Array.from({ length: k }, () => ({ cat: '', tiles: [] }));
    for (let j = 0; j < n; j++) { const r = Math.floor(j / k), c = j % k; if (r < ROWS) extra[c].tiles.push({ i: loose[j], v: (r + 1) * STEP }); }
    cols.push(...extra.filter(c => c.tiles.length));
  }
  return { cols };
}

/** Lucky Stars: 1 on a board of up to 15 tiles, else 2; never in the top row, never two in one column. -> Set of 'c:r' */
export function stars(cols, rnd = n => crypto.randomInt(n)) {
  const spots = [];
  cols.forEach((c, ci) => c.tiles.forEach((t, r) => { if (r > 0) spots.push([ci, r]); }));
  const total = cols.reduce((n, c) => n + c.tiles.length, 0);
  const want = Math.min(spots.length, total > 15 ? 2 : 1);
  const out = new Set(), used = new Set();
  for (let tries = 0; out.size < want && tries < 200; tries++) {
    const [ci, r] = spots[rnd(spots.length)];
    if (used.has(ci) && used.size < cols.length) continue;
    out.add(`${ci}:${r}`); used.add(ci);
  }
  return out;
}

/** Make the session's board (at start). s.board keeps the server's side; s.state.bb what everyone sees. */
export function build(s, rnd) {
  const { cols } = layout(s.items || []);
  s.board = { cols, stars: stars(cols, rnd), done: new Map(), cur: null, pending: null, turn: 0, turns: !!(s.board && s.board.turns), last: null, endAt: 0 };
  return publicState(s);
}
export const tileAt = (s, ci, r) => (s.board && s.board.cols[ci] && s.board.cols[ci].tiles[r]) || null;
export const remaining = s => (s.board ? s.board.cols.reduce((n, c, ci) => n + c.tiles.filter((t, r) => !s.board.done.has(`${ci}:${r}`)).length, 0) : 0);
/** What every device sees: categories, values, which tiles are done (and which were Lucky Stars), whose pick it is. */
export function publicState(s) {
  const b = s.board;
  return {
    cats: b.cols.map(c => c.cat),
    // per column, per tile: [value, state] (0 waiting, 1 open now, 2 done, 3 done and was a Lucky Star)
    t: b.cols.map((c, ci) => c.tiles.map((tile, r) => {
      const k = `${ci}:${r}`;
      if (b.cur && b.cur.k === k) return [tile.v, 1];
      if (b.done.has(k)) return [tile.v, b.stars.has(k) ? 3 : 2];
      return [tile.v, 0];
    })),
    cur: b.cur ? [b.cur.c, b.cur.r, b.stars.has(b.cur.k) ? 1 : 0] : null,
    turn: b.turns ? b.turn : 0, turns: b.turns ? 1 : 0, left: remaining(s),
    last: b.last,
  };
}

/** May this tile be picked now, by this seat (0 = a host)? */
export function canPick(s, ci, r, seatNo = 0) {
  const b = s.board;
  if (!b || s.phase !== 'between' || b.cur || b.pending) return false;
  if (!Number.isInteger(ci) || !Number.isInteger(r) || !tileAt(s, ci, r) || b.done.has(`${ci}:${r}`)) return false;
  if (seatNo && !(b.turns && b.turn === seatNo)) return false;
  return true;
}
/** Pick a tile: it opens after the countdown (the board flips it meanwhile). -> true when picked. */
export function pick(s, ci, r, seatNo = 0) {
  if (!canPick(s, ci, r, seatNo)) return false;
  const k = `${ci}:${r}`, tile = tileAt(s, ci, r);
  s.board.pending = { c: ci, r, k, i: tile.i, v: tile.v };
  s.board.cur = s.board.pending;
  return true;
}
/** The question for the picked tile is opening: -> its item index. */
export function opening(s) { const p = s.board.pending; s.board.pending = null; return p ? p.i : -1; }

/** Points for a right answer on the open tile: its value, plus up to 20% for speed (not with accuracy-only points),
 *  doubled on a Lucky Star. */
export function points(s, elapsed, secs, { accuracy = false } = {}) {
  const c = s.board && s.board.cur; if (!c) return 0;
  const speed = accuracy ? 0 : Math.round(c.v * SPEED_SHARE * (1 - Math.min(1, elapsed / Math.max(1, secs * 1000))));
  return (c.v + speed) * (s.board.stars.has(c.k) ? 2 : 1);
}
/** After the reveal: the tile is done; with turns on, the fastest right answer picks next (else the host). */
export function closeTile(s, answers) {
  const b = s.board, c = b.cur; if (!c) return;
  b.done.set(c.k, true);
  let best = null;
  for (const [no, a] of answers) if (a.ok && s.seats.has(no) && s.seats.get(no).conn && (!best || a.elapsed < best.elapsed)) best = { no, elapsed: a.elapsed };
  b.turn = best ? best.no : 0;
  b.last = [c.c, c.r, b.stars.has(c.k) ? 1 : 0];
  b.cur = null;
}
/** A skipped tile is done too (nobody scores). */
export function skipTile(s) { const b = s.board; if (!b || !b.cur) return; b.done.set(b.cur.k, true); b.last = [b.cur.c, b.cur.r, 0]; b.cur = null; }
/** Turns on/off (the host). With turns on and nobody's turn yet, the host still picks. */
export function setTurns(s, on) { if (!s.board) return false; s.board.turns = !!on; if (!on) s.board.turn = 0; return true; }
