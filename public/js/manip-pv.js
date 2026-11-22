// Virtual math manipulatives: place-value charts (docs/decisions.md "Virtual math manipulatives: place-value charts
// fit and regroup"). Pure functions shared by the solo board (public/js/manip.js), the live room (public/js/manip-room.js)
// and the tests. Two jobs:
//   1. Fit: the blocks in a chart's column are laid out inside it in tidy rows, made smaller as more come in, so none
//      ever crosses the column's edges or covers another. Out of a column, a block gets its own size back.
//   2. Regroup on drop, one place at a time, the total always the same:
//      - a block in its own column (a rod in Tens) just stays;
//      - a block one place smaller (a rod in Hundreds) waits there, marked "Needs 10 to trade"; as soon as the column
//        holds ten of them, each ten trade for one of the column's block (ten rods become a flat), leftovers stay;
//      - a block one place bigger (a flat in Tens) breaks into ten of the column's block (ten rods);
//      - a block two or more places away (a cube in Tens, a unit in Hundreds) goes to its own column of that chart,
//        if the chart has one; if not, it stays where it was dropped.
//   Locked blocks are left as they are (never traded, moved or resized).
import { slotsOf, PV_COL, nextPieceSpot } from './manip-board.js';
import { allPieceDefs, pieceDefs } from './manip-data.js';

const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const r1 = v => Math.round(v * 10) / 10;
const f1 = v => Math.max(4, Math.floor(v * 10 + 1e-6) / 10);

/** A column's place value, read from its heading (the chart's headings are English data: manip-board.js PV10, PVD). */
export const PLACES = { millions: 1e6, 'hundred thousands': 1e5, 'ten thousands': 1e4, thousands: 1000, hundreds: 100, tens: 10, ones: 1, tenths: 0.1, hundredths: 0.01, thousandths: 0.001 };
export const placeOf = name => { const v = PLACES[String(name == null ? '' : name).trim().toLowerCase()]; return v === undefined ? null : v; };
/** How many places a value is from a column's: 0 its own column, -1 one place smaller (a rod in Hundreds), +1 one place
 *  bigger (a flat in Tens). null: not a power of ten apart (or no value). */
export function stepsApart(value, place) {
  if (!(value > 0) || !(place > 0)) return null;
  const r = Math.log10(value / place), n = Math.round(r);
  return Math.abs(r - n) < 1e-6 ? n : null;
}
/** A piece's value: its kind's (the saved value only for a kind the tool does not know). */
export const valueOf = (slug, p) => { const d = allPieceDefs(slug).find(x => x.kind === p.kind); return d ? d.value : num(p.value); };
/** The block worth `value`, from the same set as the piece it replaces (base ten: whole-number blocks or decimal ones). */
export function defFor(slug, value, like) {
  const fams = slug === 'base-ten-blocks' ? [pieceDefs(slug, {}), pieceDefs(slug, { decimal: true })] : [allPieceDefs(slug)];
  const same = d => Math.abs(d.value - value) <= Math.abs(value) * 1e-6;
  const fam = fams.find(f => f.some(d => d.kind === like)) || [];
  return fam.find(same) || allPieceDefs(slug).find(same) || null;
}

// ---------------------------------------------------------------- the columns
/** Fit settings, in the chart's own pixels (times its scale): the heading's band at the top, the padding, the gap
 *  between blocks, the band at the bottom kept for a hint or a count. min: the smallest a block is made while they still
 *  fit (0.4 of its size: a unit 12 px); below it the column says how many it holds. floor: the very smallest. */
export const FIT = { top: 26, pad: 6, gap: 4, foot: 18, min: 0.4, floor: 0.05 };
/** Every column of every chart on a board: [{ o (the chart), i, name, place, slot }] (charts in drawing order). */
export function columnsOf(slug, st) {
  const out = [];
  for (const o of (st && st.objects) || []) {
    if (o.k !== 'pv-chart') continue;
    const names = Array.isArray(o.st && o.st.cols) ? o.st.cols : [];
    slotsOf(slug, o).forEach((slot, i) => out.push({ o, i, name: String(names[i] == null ? '' : names[i]), place: placeOf(names[i]), slot }));
  }
  return out;
}
const mid = p => ({ x: num(p.x) + num(p.w, 40) / 2, y: num(p.y) + num(p.h, 40) / 2 });
/** The column a piece is in (its middle inside the column; the chart drawn last wins), or null. */
export function columnOf(cols, p) {
  const c = mid(p); let hit = null;
  for (const col of cols) { const s = col.slot; if (c.x >= s.x && c.x <= s.x + s.w && c.y >= s.y && c.y <= s.y + s.h) hit = col; }
  if (hit) return hit;
  // A middle in the thin gap between two columns of a chart (a block straddling their border): the nearer column, so
  // the layout pulls it inside instead of leaving it across the line.
  let best = null, bd = Infinity;
  for (const col of cols) {
    const s = col.slot, g = (PV_COL.gap / 2) * (Number.isFinite(+col.o.s) ? +col.o.s : 1) + 0.01;
    if (c.y < s.y || c.y > s.y + s.h || c.x < s.x - g || c.x > s.x + s.w + g) continue;
    const d = c.x < s.x ? s.x - c.x : c.x - s.x - s.w; if (d < bd) { bd = d; best = col; }
  }
  return best;
}
/** The unlocked pieces in a chart's columns (they move with the chart). */
export function inChart(slug, o, pieces) {
  const cols = columnsOf(slug, { objects: [o] });
  return (pieces || []).filter(p => !p.locked && columnOf(cols, p));
}
/** The pieces of each column (unlocked only): Map(col -> pieces), and the pieces in no column. */
function sortOut(cols, pieces) {
  const by = new Map(cols.map(c => [c, []])), free = [];
  for (const p of pieces || []) { if (p.locked) continue; const c = columnOf(cols, p); if (c) by.get(c).push(p); else free.push(p); }
  return { by, free };
}

// ---------------------------------------------------------------- fit: the layout of one column
/** Rows of items (natural laid sizes { w, h }) at scale k in a width W: [{ items: [i], w, h }] and the total height, or
 *  null when one item alone is wider than W. */
function pack(items, k, W, gap) {
  const rows = []; let row = null;
  for (let i = 0; i < items.length; i++) {
    const w = Math.max(4, items[i].w * k), h = Math.max(4, items[i].h * k);
    if (w > W + 0.01) return null;
    if (!row || row.w + gap + w > W + 0.01) { row = { items: [], w: -gap, h: 0 }; rows.push(row); }
    row.items.push(i); row.w += gap + w; row.h = Math.max(row.h, h);
  }
  return { rows, H: rows.reduce((s, r) => s + r.h, 0) + gap * Math.max(0, rows.length - 1) };
}
/**
 * Lay items out inside box: rows from the top, each row centered, every item made smaller by one factor k (never bigger
 * than its own size) until they all fit. Below `min` the result is `cramped` (the column shows a count); at `floor`
 * the rows are drawn closer together, so even then nothing leaves the box. items: [{ w, h }] (natural, as they lie).
 * -> { k, cramped, tight (the rows had to overlap), places: [{ x, y, w, h }] } in the order of items.
 */
export function fitColumn(box, items, { gap: gap0 = FIT.gap, min = FIT.min, floor = FIT.floor } = {}) {
  if (!items.length) return { k: 1, cramped: false, tight: false, places: [] };
  // Below the readable size the gaps close up too (never under 1 px).
  const gapAt = k => Math.max(Math.min(1, gap0), gap0 * Math.min(1, k / min));
  const kw = Math.min(1, ...items.map(it => (box.w > 0 ? box.w / Math.max(1, it.w) : 0)));
  let k = null, p = null;
  // The biggest k that fits, in steps of 1% (a column holds at most a few hundred blocks: cheap).
  for (let s = Math.min(1, Math.floor(kw * 100) / 100); s >= floor - 1e-9; s = Math.round((s - 0.01) * 100) / 100) {
    const q = pack(items, s, box.w, gapAt(s)); if (q && q.H <= box.h + 0.01) { k = s; p = q; break; }
  }
  let squeeze = 1;
  if (!p) {
    // Not even at floor: the smallest size, and the rows overlap a little so the last one still ends inside the box.
    k = Math.max(0.01, Math.min(floor, kw)); p = pack(items, k, box.w, gapAt(k)) || pack(items, k, Infinity, gapAt(k));
    const last = p.rows[p.rows.length - 1].h, span = p.H - last;
    squeeze = span > 0 ? Math.max(0, (box.h - last) / span) : 1;
  }
  const places = new Array(items.length), gap = gapAt(k);
  let y = 0;
  for (const row of p.rows) {
    let x = box.x + Math.max(0, (box.w - row.w) / 2);
    for (const i of row.items) {
      const w = f1(Math.max(4, items[i].w * k)), h = f1(Math.max(4, items[i].h * k));
      places[i] = { x: r1(x), y: r1(box.y + y * squeeze), w, h };
      x += Math.max(4, items[i].w * k) + gap;
    }
    y += row.h + gap;
  }
  return { k, cramped: k < min - 1e-9, tight: squeeze < 1, places };
}
const quarter = p => { const r = ((Math.round(num(p.rot) / 90) * 90) % 360 + 360) % 360; return r === 90 || r === 270; };
/** A piece's top and left edges as it lies (a quarter turn swaps its width and height). */
const topOf = p => mid(p).y - (quarter(p) ? num(p.w, 40) : num(p.h, 40)) / 2;
const leftOf = p => mid(p).x - (quarter(p) ? num(p.h, 40) : num(p.w, 40)) / 2;
/** A piece's own size (before a column made it smaller). */
const natural = p => ({ w: num(p.nw, num(p.w, 40)), h: num(p.nh, num(p.h, 40)) });
/** Own-column blocks first, then the ones waiting to trade, then any others; inside each, top to bottom, left to right. */
const rankIn = (slug, col) => p => { const n = stepsApart(valueOf(slug, p), col.place); return n === 0 || col.place == null ? 0 : n === -1 ? 1 : 2; };
/** What a column shows: { n (pieces), waiting (one place smaller, fewer than ten), cramped, box (the inner box) }. */
function columnPlan(slug, col, ps) {
  const s = num(col.o.s, 1), sl = col.slot, rank = rankIn(slug, col);
  const sorted = [...ps].sort((a, b) => rank(a) - rank(b) || topOf(a) - topOf(b) || leftOf(a) - leftOf(b));
  const items = sorted.map(p => { const z = natural(p); return quarter(p) ? { w: z.h, h: z.w } : z; });
  const waiting = col.place == null ? 0 : ps.filter(p => stepsApart(valueOf(slug, p), col.place) === -1).length;
  const inner = foot => ({ x: sl.x + FIT.pad * s, y: sl.y + FIT.top * s, w: sl.w - 2 * FIT.pad * s, h: sl.h - (FIT.top + FIT.pad + (foot ? FIT.foot : 0)) * s });
  let box = inner(waiting > 0), fit = fitColumn(box, items, { gap: FIT.gap * s });
  if (fit.cramped && !waiting) { box = inner(true); fit = fitColumn(box, items, { gap: FIT.gap * s }); }
  return { sorted, items, fit, box, n: ps.length, waiting, cramped: fit.cramped };
}
/** A piece back to its own size, its middle where it was (kept inside the space). */
function restore(p, space) {
  if (p.nw === undefined && p.nh === undefined) return;
  const c = mid(p), z = natural(p);
  p.w = z.w; p.h = z.h; delete p.nw; delete p.nh;
  p.x = Math.round(Math.min(Math.max(0, c.x - z.w / 2), space ? space.w - z.w : Infinity));
  p.y = Math.round(Math.min(Math.max(0, c.y - z.h / 2), space ? space.h - z.h : Infinity));
}
function layoutColumn(slug, col, ps) {
  if (!ps.length) return;
  const { sorted, fit } = columnPlan(slug, col, ps);
  sorted.forEach((p, i) => {
    const z = natural(p), L = fit.places[i], turned = quarter(p);
    const w = turned ? L.h : L.w, h = turned ? L.w : L.h;
    if (Math.abs(w - z.w) > 0.05 || Math.abs(h - z.h) > 0.05) { p.nw = z.w; p.nh = z.h; } else { delete p.nw; delete p.nh; }
    p.w = w; p.h = h; p.x = r1(L.x + L.w / 2 - w / 2); p.y = r1(L.y + L.h / 2 - h / 2);
    p.rot = turned ? (Math.round(num(p.rot) / 90) * 90 % 360 + 360) % 360 : 0;
  });
}
/** Groups: a block in a column belongs to no snapped group (the column lays it out); a group left with one piece is none. */
function ungroup(pieces, inCols) {
  for (const p of inCols) delete p.g;
  const n = new Map(); for (const p of pieces) if (p.g) n.set(p.g, (n.get(p.g) || 0) + 1);
  for (const p of pieces) if (p.g && n.get(p.g) < 2) delete p.g;
}
/** Every chart's columns laid out, and every piece in no column at its own size again. */
export function layoutCharts(slug, st, space = null) {
  if (!Array.isArray(st.pieces)) return;
  const cols = columnsOf(slug, st), { by, free } = sortOut(cols, st.pieces);
  for (const p of free) restore(p, space);
  for (const c of cols) layoutColumn(slug, c, by.get(c));
  ungroup(st.pieces, [...by.values()].flat());
}
/** What each column of a chart shows: [{ name, n, waiting, cramped }] in column order. */
export function chartInfo(slug, st, o) {
  const cols = columnsOf(slug, { objects: [o] }), all = columnsOf(slug, st), { by } = sortOut(all, st.pieces || []);
  return cols.map(c => {
    const same = all.find(x => x.o === o && x.i === c.i), ps = same ? by.get(same) : [];
    if (!ps.length) return { name: c.name, n: 0, waiting: 0, cramped: false };
    const plan = columnPlan(slug, c, ps);
    return { name: c.name, n: plan.n, waiting: plan.waiting, cramped: plan.cramped };
  });
}
/** The pieces in a column that do not belong there yet (waiting to trade, or with no column of their own): a Set of ids. */
export function strayIds(slug, st) {
  const cols = columnsOf(slug, st), { by } = sortOut(cols, st.pieces || []), out = new Set();
  for (const c of cols) if (c.place != null) for (const p of by.get(c)) if (stepsApart(valueOf(slug, p), c.place) !== 0) out.add(p.id);
  return out;
}

// ---------------------------------------------------------------- regroup on drop
/** Put a piece's middle at a point. */
const centerAt = (p, x, y) => { p.x = r1(x - num(p.w, 40) / 2); p.y = r1(y - num(p.h, 40) / 2); };
/** One regroup (the first found), or false when every column is settled. make(d, x, y): a new piece of def d. */
function regroupOnce(slug, st, make, out) {
  const cols = columnsOf(slug, st), { by } = sortOut(cols, st.pieces);
  for (const c of cols) {
    if (c.place == null) continue;
    const ps = by.get(c);
    for (const p of ps) {
      const n = stepsApart(valueOf(slug, p), c.place);
      if (n === 1) {
        // One place bigger: ten of the column's block, where it was.
        const d = defFor(slug, c.place, p.kind); if (!d) continue;
        const at = mid(p), news = [];
        for (let i = 0; i < 10; i++) { const q = make(d, 0, 0); centerAt(q, at.x, at.y); q.y = r1(q.y + i * 0.01); news.push(q); }
        st.pieces = st.pieces.filter(x => x !== p).concat(news);
        out.fresh.push(...news.map(q => q.id)); out.events.push({ kind: 'broke', from: p.label, to: d.label, n: 10 });
        return true;
      }
      if (n !== null && Math.abs(n) >= 2) {
        // Two or more places away: to its own column of the same chart (at its end), if there is one.
        const own = cols.find(x => x.o === c.o && stepsApart(valueOf(slug, p), x.place) === 0); if (!own) continue;
        centerAt(p, own.slot.x + own.slot.w / 2, own.slot.y + own.slot.h - 1);
        out.moved.push(p.id); out.events.push({ kind: 'moved', label: p.label, col: own.name });
        return true;
      }
    }
    const lower = ps.filter(p => stepsApart(valueOf(slug, p), c.place) === -1);
    if (lower.length >= 10) {
      const d = defFor(slug, c.place, lower[0].kind); if (!d) continue;
      const m = Math.floor(lower.length / 10);
      const gone = [...lower].sort((a, b) => topOf(a) - topOf(b) || leftOf(a) - leftOf(b)).slice(0, m * 10), ids = new Set(gone.map(p => p.id));
      const at = mid(gone[0]), news = [];
      for (let i = 0; i < m; i++) { const q = make(d, 0, 0); centerAt(q, at.x, at.y); q.y = r1(q.y + i * 0.01); news.push(q); }
      st.pieces = st.pieces.filter(x => !ids.has(x.id)).concat(news);
      out.fresh.push(...news.map(q => q.id)); out.events.push({ kind: 'traded', n: m * 10, from: gone[0].label, m, to: d.label });
      return true;
    }
  }
  return false;
}
/**
 * After any change to a board: regroup what sits in a chart's columns (the rules at the top of this file), then lay
 * every column out. Changes st in place. opts: { make(d, x, y) a new piece (required to regroup), trade (false: lay
 * out only, as when a board is opened), space (pieces stay inside it) }.
 * -> { fresh: [ids of new pieces], moved: [ids], events: [{ kind: 'traded'|'broke'|'moved', ... }] }
 */
export function settleCharts(slug, st, { make = null, trade = true, space = null } = {}) {
  const out = { fresh: [], moved: [], events: [] };
  if (!st || !Array.isArray(st.pieces) || !(st.objects || []).some(o => o.k === 'pv-chart')) { if (st && Array.isArray(st.pieces)) layoutCharts(slug, st, space); return out; }
  if (trade && make) for (let i = 0; i < 200 && regroupOnce(slug, st, make, out); i++);
  const fresh = new Set(out.fresh); out.fresh = st.pieces.filter(p => fresh.has(p.id)).map(p => p.id);
  layoutCharts(slug, st, space);
  return out;
}
/** The board's total value (pieces only): the same before and after any settle. */
export const totalOf = (slug, st) => Math.round(((st && st.pieces) || []).reduce((s, p) => s + valueOf(slug, p), 0) * 1e6) / 1e6;

// ---------------------------------------------------------------- Break and Regroup buttons on a chart
/**
 * Where pieces worth `value` go when the piece p is broken or regrouped:
 *  - p in a chart that has a column for that value: { col } (put them in it; the layout does the rest);
 *  - p in a chart without one: { below } (a point under the chart, so they are not traded straight back);
 *  - p in no chart: null (the button's usual place).
 */
export function homeFor(slug, st, p, value) {
  const cols = columnsOf(slug, st), c = columnOf(cols, p); if (!c) return null;
  const own = cols.find(x => x.o === c.o && x.place != null && stepsApart(value, x.place) === 0);
  if (own) return { col: own };
  const cs = cols.filter(x => x.o === c.o), x0 = Math.min(...cs.map(x => x.slot.x)), y1 = Math.max(...cs.map(x => x.slot.y + x.slot.h));
  return { below: { x: x0, y: y1 + 24 } };
}
/** The column a piece is in, as a home for placeAtHome (a copy of it goes there too), or null. */
export function columnHome(slug, st, p) { const c = columnOf(columnsOf(slug, st), p); return c ? { col: c } : null; }
/**
 * Where a block added from the palette goes when the block placed just before it (last: { id }, the last one added or
 * dropped on this board or square) sits in a chart's column and is worth the same: { col } of that column (the layout
 * then fits them all). Any other case (another value, no such piece, not in a column any more, its chart gone): null,
 * and the usual placement applies.
 */
export function sameValueHome(slug, st, last, d) {
  const L = last && last.id != null ? ((st && st.pieces) || []).find(p => p.id === last.id) : null;
  if (!L || !d) return null;
  const v = valueOf(slug, L); if (Math.abs(v - d.value) > Math.abs(v) * 1e-9) return null;
  return columnHome(slug, st, L);
}
/** The column of a chart on the board made for a block worth d.value (a rod: Tens), as a home, or null. */
export function valueHome(slug, st, d) {
  const c = d && columnsOf(slug, st).find(x => x.place != null && stepsApart(d.value, x.place) === 0);
  return c ? { col: c } : null;
}
/**
 * A block added from the palette, on the solo board and in a live room's square alike (docs/decisions.md "Virtual math
 * manipulatives: place-value charts fit and regroup"): into the column of the block added just before it when that one
 * is worth the same (sameValueHome); else the next free spot (manip-board.js nextPieceSpot: never on a chart); and when
 * the region has no free spot left (a square the chart fills), into the chart's column for its value if it has one.
 * mk(d, x, y) makes the piece; space: the board's or square's size (kept inside it). -> { p, last } (last: the next
 * add's `last`)
 */
export function paletteAdd(slug, st, d, region, last, mk, space = null) {
  const home = sameValueHome(slug, st, last, d) || null;
  const at = home ? null : nextPieceSpot(slug, st, d, region, last);
  const into = home || (at.full ? valueHome(slug, st, d) : null);
  if (into) { const p = mk(d, 0, 0); placeAtHome(into, [p], space); return { p, last: { id: p.id, runX: p.x } }; }
  const x = space ? Math.min(at.x, Math.max(0, space.w - d.w)) : at.x, y = space ? Math.min(at.y, Math.max(0, space.h - d.h)) : at.y;
  const p = mk(d, x, y);
  return { p, last: { id: p.id, runX: at.runX } };
}
/** Put new pieces at a home from homeFor: in the column (at its end) or in rows of five under the chart. */
export function placeAtHome(home, news, space = null) {
  if (home.col) { const s = home.col.slot; news.forEach((q, i) => { centerAt(q, s.x + s.w / 2, s.y + s.h - 2); q.y = r1(q.y + i * 0.01); }); return; }
  const b = home.below;
  news.forEach((q, i) => {
    q.x = Math.round(b.x + (i % 5) * (num(q.w, 40) + 6)); q.y = Math.round(b.y + Math.floor(i / 5) * (num(q.h, 40) + 6));
    if (space) { q.x = Math.min(Math.max(0, q.x), space.w - num(q.w, 40)); q.y = Math.min(Math.max(0, q.y), space.h - num(q.h, 40)); }
  });
}
