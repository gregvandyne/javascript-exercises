// Shared board reading for the piece tools' practice checks (two-color-counters.js, linking-cubes.js, color-tiles.js;
// docs/manip-practice-tasks.md). Pure functions over the raw board the page sends (numbers may be strings, fields may
// be missing): the pieces as rectangles, sticks (pieces touching end to end in one straight line), and the lattice a
// group of square pieces sits on (rows and columns, to read a rectangle, an array or a shape). A piece added from the
// palette sits a few pixels from the one before it (manip-board.js ROW_GAP), one snapped by a drop sits flush: both
// count as touching.
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);

/** The board's pieces of these kinds (a Set or a list; all kinds when null), as { id, kind, x, y, w, h, cx, cy, locked, label }. */
export function piecesOf(b, kinds = null, size = 40) {
  const ok = kinds ? new Set(kinds) : null;
  return ((b && Array.isArray(b.pieces)) ? b.pieces : []).filter(p => p && typeof p === 'object' && (!ok || ok.has(p.kind))).map(p => {
    const w = num(p.w, size) || size, h = num(p.h, size) || size, x = num(p.x), y = num(p.y);
    return { id: String(p.id || ''), kind: String(p.kind || ''), x, y, w, h, cx: x + w / 2, cy: y + h / 2, locked: !!p.locked, label: String(p.label == null ? '' : p.label) };
  });
}
/** Is a piece's middle inside an object's rectangle (or a part of it: { x, y, w, h })? */
export const inside = (p, r) => p.cx >= r.x && p.cx <= r.x + r.w && p.cy >= r.y && p.cy <= r.y + r.h;

/** Two pieces touch end to end: side by side (or one above the other), lined up, at most `join` apart. */
function touch(a, b, join) {
  const s = Math.min(a.w, a.h, b.w, b.h);
  const gx = Math.abs(a.cx - b.cx) - (a.w + b.w) / 2, gy = Math.abs(a.cy - b.cy) - (a.h + b.h) / 2;
  return (Math.abs(a.cy - b.cy) < s / 2 && gx >= -s / 3 && gx <= join) || (Math.abs(a.cx - b.cx) < s / 2 && gy >= -s / 3 && gy <= join);
}
/** Groups of touching pieces (connected parts). */
export function partsOf(ps, join = 8) {
  const seen = new Array(ps.length).fill(false), out = [];
  for (let i = 0; i < ps.length; i++) {
    if (seen[i]) continue;
    const part = [], todo = [i]; seen[i] = true;
    while (todo.length) { const k = todo.pop(); part.push(ps[k]); for (let j = 0; j < ps.length; j++) if (!seen[j] && touch(ps[k], ps[j], join)) { seen[j] = true; todo.push(j); } }
    out.push(part);
  }
  return out;
}
/** A part that is one straight line (a row or a column), its pieces in order (left to right, or top to bottom); else null. */
export function lineOf(part) {
  if (!part.length) return null;
  const s = Math.min(...part.map(p => Math.min(p.w, p.h)));
  const ys = part.map(p => p.cy), xs = part.map(p => p.cx);
  if (Math.max(...ys) - Math.min(...ys) < s / 2) return [...part].sort((a, b) => a.cx - b.cx);
  if (Math.max(...xs) - Math.min(...xs) < s / 2) return [...part].sort((a, b) => a.cy - b.cy);
  return null;
}
/** Sticks: the touching parts that are straight lines, each in order. -> { sticks: [[piece]], loose: [part] (not a line) } */
export function sticksOf(ps, join = 8) {
  const sticks = [], other = [];
  for (const part of partsOf(ps, join)) { const l = lineOf(part); if (l) sticks.push(l); else other.push(part); }
  return { sticks, other };
}

/** Values grouped where they are close (consecutive gaps under tol): the groups' middles, in order; null when a group is
 *  wider than `span` (pieces not lined up). */
function clusters(vals, tol, span) {
  const v = [...vals].sort((a, b) => a - b), out = [];
  let cur = [];
  for (const x of v) { if (cur.length && x - cur[cur.length - 1] >= tol) { out.push(cur); cur = []; } cur.push(x); }
  if (cur.length) out.push(cur);
  if (out.some(c => c[c.length - 1] - c[0] > span)) return null;
  return out.map(c => (c[0] + c[c.length - 1]) / 2);
}
/**
 * The lattice square pieces sit on: rows and columns found from their middles, with no empty row or column between
 * two used ones (neighbors at most a piece and `gap` apart) and never two pieces in one place.
 * -> { cells: Set('r,c'), at: Map('r,c' -> piece), rows, cols } | null
 */
export function latticeOf(ps, gap = 14) {
  if (!ps.length) return null;
  const s = Math.min(...ps.map(p => Math.min(p.w, p.h)));
  const cx = clusters(ps.map(p => p.cx), s / 2, s * 0.6), cy = clusters(ps.map(p => p.cy), s / 2, s * 0.6);
  if (!cx || !cy) return null;
  for (const l of [cx, cy]) for (let i = 1; i < l.length; i++) if (l[i] - l[i - 1] > s + gap) return null;
  const near = (l, v) => l.reduce((bi, x, i) => (Math.abs(x - v) < Math.abs(l[bi] - v) ? i : bi), 0);
  const at = new Map();
  for (const p of ps) { const k = `${near(cy, p.cy)},${near(cx, p.cx)}`; if (at.has(k)) return null; at.set(k, p); }
  return { cells: new Set(at.keys()), at, rows: cy.length, cols: cx.length };
}
/** A solid rectangle: every place of its rows and columns filled. -> { rows, cols, at } | null */
export function rectOf(ps, gap = 14) {
  const L = latticeOf(ps, gap);
  return L && L.cells.size === L.rows * L.cols ? L : null;
}
/** A shape (cells 'r,c') in a standard place, the same for its turns and flips when any: true. */
export function shapeKey(cells, any = true) {
  const pts = [...cells].map(k => k.split(',').map(Number));
  const forms = any ? [[1, 0, 0, 1], [0, 1, -1, 0], [-1, 0, 0, -1], [0, -1, 1, 0], [-1, 0, 0, 1], [1, 0, 0, -1], [0, 1, 1, 0], [0, -1, -1, 0]] : [[1, 0, 0, 1]];
  return forms.map(([a, b, c, d]) => {
    const q = pts.map(([r, k]) => [a * r + b * k, c * r + d * k]), r0 = Math.min(...q.map(x => x[0])), c0 = Math.min(...q.map(x => x[1]));
    return q.map(([r, k]) => `${r - r0},${k - c0}`).sort().join(' ');
  }).sort()[0];
}
/** The cells of a shape given as rows of text ('##.', '###'): '#' a tile. */
export const cellsOfRows = rows => new Set(rows.flatMap((row, r) => [...row].map((ch, c) => (ch === '#' ? `${r},${c}` : null)).filter(Boolean)));
/** Exposed edges of a shape (its perimeter in unit lengths). */
export function perimeterOf(cells) {
  let n = 0;
  for (const k of cells) { const [r, c] = k.split(',').map(Number); for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!cells.has(`${r + dr},${c + dc}`)) n++; }
  return n;
}
