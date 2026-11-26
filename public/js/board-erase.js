// The eraser (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board"): it takes only what it
// passes over. Every pen line loses the part of it within the eraser's radius of the eraser's path; a line the path
// crosses is split there into the pieces left on either side. Used by the teacher's board (the teacher's area's pen
// lines and board ink, public/js/homeroom.js), a student's doodle pad (public/js/homeroom-desk.js) and a student's own
// lines in See the room (public/js/homeroom-marks.js). Pure: no page.

const dist2 = (p, a, b) => {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  const k = l ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l)) : 0;
  const x = a.x + k * dx - p.x, y = a.y + k * dy - p.y;
  return x * x + y * y;
};
/** How far (squared) a point is from a path of points. */
function pathDist2(p, path) {
  if (path.length === 1) { const x = p.x - path[0].x, y = p.y - path[0].y; return x * x + y * y; }
  let d = Infinity;
  for (let i = 1; i < path.length; i++) d = Math.min(d, dist2(p, path[i - 1], path[i]));
  return d;
}
const boxOf = pts => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; } return { x0, y0, x1, y1 }; };
const near = (a, b, r) => a.x0 - r <= b.x1 && b.x0 - r <= a.x1 && a.y0 - r <= b.y1 && b.y0 - r <= a.y1;
/** At most max points: every other one dropped (the ends kept) until it fits. */
function thin(pts, max) {
  let out = pts;
  while (out.length > max && out.length > 2) out = out.filter((_, i) => i % 2 === 0 || i === out.length - 1);
  return out;
}

/**
 * Erase along a path from a list of pen lines.
 *   strokes  [{ pts: [{ x, y }], ...anything }]: the lines, in their own units
 *   path     [{ x, y }]: where the eraser went, in pixels (one point for a tap)
 *   r        the eraser's radius, in pixels
 *   o        { toPx(p), fromPx(p): the lines' units to pixels and back (fractions of a page, area pixels...);
 *              newId(): an id for each new piece (a stroke without an id gets none); maxPts: points a piece may have }
 * -> { strokes, changed }: a line the path missed is the same object; a cut one becomes its pieces (the first keeps its
 *    id, every piece its style), and a line wholly under the eraser is gone.
 */
export function eraseStrokes(strokes, path, r, o = {}) {
  const toPx = o.toPx || (p => p), fromPx = o.fromPx || (p => p), maxPts = o.maxPts || 600;
  const list = Array.isArray(strokes) ? strokes : [];
  if (!Array.isArray(path) || !path.length || !(r > 0)) return { strokes: list, changed: false };
  const pb = boxOf(path), r2 = r * r, step = Math.max(0.5, r / 3);
  const out = []; let changed = false;
  for (const s of list) {
    const px = (s && Array.isArray(s.pts) ? s.pts : []).map(toPx);
    if (px.length < 2 || !near(boxOf(px), pb, r)) { out.push(s); continue; }
    // the line's points, with more of them along its parts near the eraser (so it is cut where the eraser's edge is,
    // not at the nearest point the pen happened to record)
    const dense = [px[0]];
    for (let i = 1; i < px.length; i++) {
      const a = px[i - 1], b = px[i], len = Math.hypot(b.x - a.x, b.y - a.y);
      if (len > step && near(boxOf([a, b]), pb, r)) { const n = Math.ceil(len / step); for (let k = 1; k < n; k++) dense.push({ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }); }
      dense.push(b);
    }
    const gone = dense.map(p => pathDist2(p, path) <= r2);
    if (!gone.some(Boolean)) { out.push(s); continue; }
    changed = true;
    let run = [];
    const pieces = [];
    const end = () => { if (run.length >= 2 && new Set(run.map(p => `${Math.round(p.x * 10)},${Math.round(p.y * 10)}`)).size >= 2) pieces.push(run); run = []; };
    dense.forEach((p, i) => { if (gone[i]) end(); else run.push(p); });
    end();
    pieces.forEach((pts, i) => {
      const piece = { ...s, pts: thin(pts, maxPts).map(fromPx) };
      if (i > 0 && s.id !== undefined) piece.id = o.newId ? o.newId() : `${s.id}-${i}`;
      out.push(piece);
    });
  }
  return { strokes: changed ? out : list, changed };
}

/** The eraser's sizes (its radius on the screen, in pixels), small to large. */
export const ERASER = { S: 8, M: 18, L: 36 };
export const ERASER_SIZES = ['S', 'M', 'L'];
