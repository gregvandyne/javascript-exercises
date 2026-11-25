// Pen marks anywhere on Homeroom's board (docs/decisions.md "Homeroom: the pen anywhere on the board"). A line the
// teacher starts inside the teacher's area stays one of the area's own pen lines (fractions of the area, shown on every
// desk and on the projector). A line started anywhere else on the board (around desks, beside the area) is board ink:
// points in board pixels, kept with the area as `area.ink` so it saves, syncs, undoes and clears with it. Board ink is
// drawn on the teacher's and the aide's board and in a student's See the room; never on the projector or a desk's
// window on the teacher's area. Shared by the browser and the server (relative imports only).
import { strokeSvg, strokeStyle, PALETTE } from './board-shapes.js';
import { BOARD, AREA } from './homeroom-seats.js';

/** At most this many board ink lines, points on one line, and points in all. */
export const INK = { strokes: 80, points: 600, total: 20000 };

const clip = (s, n) => String(s ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, n);
const px = (v, max) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.min(max, Math.max(0, n)) * 10) / 10 : null; };

/** Board ink as it may be stored: lines of at least two points inside the board, a palette color, the pen's weight,
 *  dash and layer; anything else dropped. An older board has none: []. */
export function cleanInk(list) {
  const out = []; let total = 0;
  for (const s of Array.isArray(list) ? list : []) {
    if (out.length >= INK.strokes) break;
    if (!s || typeof s !== 'object' || !Array.isArray(s.pts)) continue;
    const pts = [];
    for (const p of s.pts.slice(0, INK.points)) {
      const x = px(p && p.x, BOARD.maxW), y = px(p && p.y, BOARD.maxH);
      if (x !== null && y !== null) pts.push({ x, y });
    }
    if (pts.length < 2 || total + pts.length > INK.total) continue;
    total += pts.length;
    out.push({ ...(s.id ? { id: clip(s.id, 40) } : {}), c: PALETTE.includes(s.c) ? s.c : '#141414', ...strokeStyle(s), pts });
  }
  return out;
}

/** Board ink as SVG polylines in board pixels (map(p) -> { x, y } moves each point: See the room's smaller board). */
export function inkSvg(ink, map = null) {
  return (Array.isArray(ink) ? ink : []).map(s => strokeSvg(map ? { ...s, pts: s.pts.map(map) } : s, 1, 1)).join('');
}

/** Is this board point inside the teacher's area? */
export const inTeacherArea = p => p.x >= AREA.x && p.y >= AREA.y && p.x <= AREA.x + AREA.w && p.y <= AREA.y + AREA.h;

/**
 * Board ink in a student's See the room (public/js/homeroom-desk.js placeRoom), where the teacher's area is a low band
 * (band px tall instead of AREA.h) and everything under it moved up by `up`; scaled by k from (x0, top). Lines beside or
 * above the area are pressed into the band's height; lines under it move up with the desks. Nothing in the grid of
 * names a phone shows (o: null): it has no board to draw on.
 */
export function roomInk(box, ink, o) {
  let el = box.querySelector(':scope > .hd-rink');
  const list = Array.isArray(ink) ? ink : [];
  if (!o || !list.length) { el?.remove(); return; }
  if (!el) { el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('class', 'hd-rink'); el.setAttribute('aria-hidden', 'true'); box.append(el); }
  const { x0, top, band, up, k } = o, areaEnd = AREA.y + AREA.h, squeeze = (AREA.y + band - top) / Math.max(1, areaEnd - top);
  const map = p => ({ x: (p.x - x0) * k, y: ((p.y <= areaEnd ? top + (p.y - top) * squeeze : p.y - up) - top) * k });
  el.innerHTML = inkSvg(list, map);
}
