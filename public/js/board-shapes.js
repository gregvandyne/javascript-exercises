// What the teacher's area on Homeroom's board is made of, drawn the same everywhere (docs/decisions.md "Homeroom: board
// tools"): the teacher's board (public/js/homeroom-board.js), the student desk's window and the projector
// (public/js/homeroom-area.js) all draw sticky notes, text boxes, pen lines and shapes with these functions, and the
// server (services/homeroom.js) cleans them with the same lists. Pure: no page, no strings (callers pass labels).
//
// An object's style is stored only when it is not the default, so an older board (no style fields) draws as it did:
//   shape  { id, k, x, y, x2, y2 (area fractions), c (stroke: a PALETTE color, or 'none' when filled), f (fill),
//            fo (fill opacity 50 | 25; 100 when absent), w (weight S | L | XL; M when absent), d ('dash' | 'dot'),
//            a (arrowheads on a line: 'start' | 'end' | 'both'), r (rotation in degrees, closed shapes), z, lk }
//   stroke { id, c, pts, w, d, z, lk }   (a pen line)
//   text   { id, text, x, y, w, h, fs, tc (color), b (bold), al ('c' | 'r'), r, lk }
//   note   { id, text, x, y, w, h, nc (pink | green | blue | purple; yellow when absent), lk }
// z orders the drawings (shapes and pen lines share one layer); text boxes sit above them and sticky notes above those.
import { textFont } from './manip-board.js';
import { NOTE_BOX, TEXT_NEW, OBJ_FRAC } from './homeroom-seats.js';

const clamp = (v, lo, hi) => Math.min(Math.max(lo, v), Math.max(lo, hi));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const r1 = v => Math.round(v * 10) / 10;

/** The colors a stroke, a fill and text may have (named for screen readers: js.homeroom.bt.colors.<name>). */
export const PALETTE = ['#141414', '#8A877C', '#FFFFFF', '#E53935', '#FF6B4A', '#F59E0B', '#FFD23F', '#7CB342', '#1F9D63', '#00897B', '#4FC3F7', '#1E88E5', '#8C6BD1', '#D6457A', '#6D4C41'];
export const COLOR_NAMES = ['black', 'gray', 'white', 'red', 'coral', 'orange', 'yellow', 'lime', 'green', 'teal', 'sky', 'blue', 'purple', 'pink', 'brown'];
export const colorName = c => COLOR_NAMES[PALETTE.indexOf(c)] || 'black';
/** Sticky note colors (yellow is the note's own, var(--spark)). */
export const NOTE_COLORS = { yellow: '#FFD23F', pink: '#FFB8CF', green: '#BDE8B2', blue: '#B8DBFF', purple: '#DACBFF' };
export const WEIGHTS = ['S', 'M', 'L', 'XL'];
const SHAPE_W = { S: 2, M: 5, L: 9, XL: 14 }, PEN_W = { S: 2, M: 4, L: 8, XL: 13 };
export const DASHES = ['solid', 'dash', 'dot'];
export const ARROWS = ['none', 'start', 'end', 'both'];
export const OPACITIES = [100, 50, 25];
export const ALIGNS = ['l', 'c', 'r'];

/** Every shape the Shapes picker offers, in its order. Lines have two ends (a, b); the rest a box. */
export const LINE_KINDS = ['line', 'elbow', 'curve'];
export const CLOSED_KINDS = ['rect', 'rrect', 'circle', 'tri', 'rtri', 'diamond', 'pent', 'hex', 'oct', 'star', 'heart', 'arrow', 'darrow', 'chevron', 'speech', 'cloud', 'cross', 'para', 'trap', 'cyl'];
export const SHAPE_KINDS = [...CLOSED_KINDS, ...LINE_KINDS];
export const isLine = k => LINE_KINDS.includes(k);
/** The picker's items: a kind, and for the arrow lines the arrowheads they start with. */
export const PICKS = [...CLOSED_KINDS.map(k => ({ id: k, k })), { id: 'line', k: 'line' }, { id: 'aline', k: 'line', a: 'end' }, { id: 'dline', k: 'line', a: 'both' },
  { id: 'elbow', k: 'elbow', a: 'end' }, { id: 'curve', k: 'curve', a: 'end' }];
/** Limits (the server's too): shapes in the area; z within this range. */
export const SHAPES_MAX = 80, Z_MAX = 9e6;

// ---------------------------------------------------------------- outlines in a unit box
const reg = (n, rot = -90, inner = 0) => {
  const pts = [];
  for (let i = 0; i < n * (inner ? 2 : 1); i++) {
    const a = (rot + i * 360 / (n * (inner ? 2 : 1))) * Math.PI / 180, rr = inner && i % 2 ? inner : 1;
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  return pts.map(([x, y]) => [(x - x0) / w, (y - y0) / h]);
};
const UNIT = {
  tri: [[0.5, 0], [1, 1], [0, 1]], rtri: [[0, 0], [1, 1], [0, 1]], diamond: [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]],
  pent: reg(5), hex: [[0.25, 0], [0.75, 0], [1, 0.5], [0.75, 1], [0.25, 1], [0, 0.5]],
  oct: [[0.29, 0], [0.71, 0], [1, 0.29], [1, 0.71], [0.71, 1], [0.29, 1], [0, 0.71], [0, 0.29]], star: reg(5, -90, 0.42),
  arrow: [[0, 0.3], [0.6, 0.3], [0.6, 0], [1, 0.5], [0.6, 1], [0.6, 0.7], [0, 0.7]],
  darrow: [[0, 0.5], [0.3, 0], [0.3, 0.28], [0.7, 0.28], [0.7, 0], [1, 0.5], [0.7, 1], [0.7, 0.72], [0.3, 0.72], [0.3, 1]],
  chevron: [[0, 0], [0.62, 0], [1, 0.5], [0.62, 1], [0, 1], [0.38, 0.5]],
  cross: [[0.33, 0], [0.67, 0], [0.67, 0.33], [1, 0.33], [1, 0.67], [0.67, 0.67], [0.67, 1], [0.33, 1], [0.33, 0.67], [0, 0.67], [0, 0.33], [0.33, 0.33]],
  para: [[0.25, 0], [1, 0], [0.75, 1], [0, 1]], trap: [[0.2, 0], [0.8, 0], [1, 1], [0, 1]],
};
/** A heart as cubic segments in a unit box: [start, [c1, c2, p]...]. */
const HEART = [[0.5, 0.96], [[0.18, 0.74], [0, 0.54], [0, 0.31]], [[0, 0.12], [0.14, 0], [0.29, 0]], [[0.39, 0], [0.47, 0.06], [0.5, 0.15]],
  [[0.53, 0.06], [0.61, 0], [0.71, 0]], [[0.86, 0], [1, 0.12], [1, 0.31]], [[1, 0.54], [0.82, 0.74], [0.5, 0.96]]];
const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };
function heartPts(n = 10) {
  const out = []; let p = HEART[0];
  for (const [c1, c2, q] of HEART.slice(1)) { for (let i = 0; i < n; i++) { const t = i / n; out.push([bez(p[0], c1[0], c2[0], q[0], t), bez(p[1], c1[1], c2[1], q[1], t)]); } p = q; }
  return out;
}
const ellPts = (cx, cy, rx, ry, n = 40) => Array.from({ length: n }, (_, i) => [cx + rx * Math.cos(i * 2 * Math.PI / n), cy + ry * Math.sin(i * 2 * Math.PI / n)]);

/** A shape's box in area pixels (its two corners in any order). */
export function boxOf(s, W, H) {
  const x1 = (+s.x || 0) * W, y1 = (+s.y || 0) * H, x2 = (+s.x2 || 0) * W, y2 = (+s.y2 || 0) * H;
  return { x: Math.min(x1, x2), y: Math.min(y1, y2), w: Math.abs(x2 - x1), h: Math.abs(y2 - y1) };
}
/** A closed shape's outline as a polygon in area pixels, unrotated (for hit-testing and the marquee). */
export function outlinePts(s, W, H) {
  const { x, y, w, h } = boxOf(s, W, H), sc = pts => pts.map(([u, v]) => [x + u * w, y + v * h]);
  if (UNIT[s.k]) return sc(UNIT[s.k]);
  if (s.k === 'circle') return ellPts(x + w / 2, y + h / 2, w / 2, h / 2);
  if (s.k === 'heart') return sc(heartPts());
  if (s.k === 'speech') return sc([[0, 0], [1, 0], [1, 0.78], [0.42, 0.78], [0.18, 1], [0.26, 0.78], [0, 0.78]]);
  if (s.k === 'cloud') return [...ellPts(x + w / 2, y + h * 0.39, w / 2, h * 0.39), ...sc([[0.22, 0.86]])];
  return sc([[0, 0], [1, 0], [1, 1], [0, 1]]);   // rect, rrect, cyl
}

// ---------------------------------------------------------------- lines: the path, the arrowheads
const unit = (dx, dy) => { const l = Math.hypot(dx, dy); return l > 0.001 ? [dx / l, dy / l] : null; };
/** A line's points (area pixels): the polyline it follows, and its direction at each end (pointing out of the line). */
export function linePts(s, W, H) {
  const a = [(+s.x || 0) * W, (+s.y || 0) * H], b = [(+s.x2 || 0) * W, (+s.y2 || 0) * H], mx = (a[0] + b[0]) / 2;
  const straight = unit(b[0] - a[0], b[1] - a[1]) || [1, 0];
  if (s.k === 'elbow') {
    const p1 = [mx, a[1]], p2 = [mx, b[1]];
    return { pts: [a, p1, p2, b], end: unit(b[0] - p2[0], b[1] - p2[1]) || unit(b[0] - p1[0], b[1] - p1[1]) || straight, start: unit(a[0] - p1[0], a[1] - p1[1]) || unit(a[0] - p2[0], a[1] - p2[1]) || [-straight[0], -straight[1]] };
  }
  if (s.k === 'curve') {
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push([bez(a[0], mx, mx, b[0], t), bez(a[1], a[1], b[1], b[1], t)]); }
    return { pts, end: unit(b[0] - mx, 0) || straight, start: unit(a[0] - mx, 0) || [-straight[0], -straight[1]], c: [[mx, a[1]], [mx, b[1]]] };
  }
  return { pts: [a, b], end: straight, start: [-straight[0], -straight[1]] };
}
const headPts = (tip, dir, L, hw) => [tip, [tip[0] - dir[0] * L - dir[1] * hw, tip[1] - dir[1] * L + dir[0] * hw], [tip[0] - dir[0] * L + dir[1] * hw, tip[1] - dir[1] * L - dir[0] * hw]];
const ptsStr = pts => pts.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ');

// ---------------------------------------------------------------- drawing
export const strokeWidth = (o, pen = false) => (pen ? PEN_W : SHAPE_W)[o && o.w] || (pen ? PEN_W.M : SHAPE_W.M);
function dashAttr(o, sw) {
  if (o.d === 'dash') return ` stroke-dasharray="${r1(Math.max(8, sw * 2.4))} ${r1(Math.max(6, sw * 1.9))}"`;
  // a dot is a dash of almost no length with round caps (WebKit draws nothing for a dash of exactly 0)
  if (o.d === 'dot') return ` stroke-dasharray="0.01 ${r1(Math.max(5, sw * 2.1))}"`;
  return '';
}
const colorOk = c => PALETTE.includes(c);
/** A shape as SVG in the area's pixels (W x H). extra: attributes for its group (class, data-shape). */
export function shapeSvg(s, W, H, extra = '') {
  const sw = strokeWidth(s), stroke = s.c === 'none' && !isLine(s.k) ? 'none' : esc(s.c || '#141414');
  const base = `stroke="${stroke}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dashAttr(s, sw)}`;
  if (isLine(s.k)) {
    const L = sw * 2.4 + 8, hw = L * 0.55, { pts, start, end, c } = linePts(s, W, H), ends = { start: s.a === 'start' || s.a === 'both', end: s.a === 'end' || s.a === 'both' };
    const a = pts[0], b = pts[pts.length - 1];
    // the line stops a little short of an arrowhead's tip, so its round cap never shows past it
    const a1 = ends.start ? [a[0] - start[0] * L * 0.7, a[1] - start[1] * L * 0.7] : a, b1 = ends.end ? [b[0] - end[0] * L * 0.7, b[1] - end[1] * L * 0.7] : b;
    const d = s.k === 'curve' ? `M${r1(a1[0])},${r1(a1[1])} C${r1(c[0][0])},${r1(c[0][1])} ${r1(c[1][0])},${r1(c[1][1])} ${r1(b1[0])},${r1(b1[1])}`
      : `M${ptsStr([a1, ...pts.slice(1, -1), b1]).replace(/ /g, ' L')}`;
    const head = (tip, dir) => `<polygon points="${ptsStr(headPts(tip, dir, L, hw))}" fill="${stroke}" stroke="${stroke}" stroke-width="${r1(Math.max(1, sw / 3))}" stroke-linejoin="round"/>`;
    return `<g${extra ? ` ${extra}` : ''}><path d="${d}" fill="none" ${base}/>${ends.start ? head(a, start) : ''}${ends.end ? head(b, end) : ''}</g>`;
  }
  const { x, y, w, h } = boxOf(s, W, H);
  const fill = s.f && colorOk(s.f) ? `fill="${s.f}"${s.fo === 50 || s.fo === 25 ? ` fill-opacity="${s.fo / 100}"` : ''}` : 'fill="none"';
  const a = `${fill} ${base}`, rot = s.r ? ` transform="rotate(${r1(+s.r)} ${r1(x + w / 2)} ${r1(y + h / 2)})"` : '';
  return `<g${extra ? ` ${extra}` : ''}${rot}>${bodySvg(s.k, x, y, w, h, a)}</g>`;
}
function bodySvg(k, x, y, w, h, a) {
  const P = (u, v) => `${r1(x + u * w)},${r1(y + v * h)}`;
  if (UNIT[k]) return `<polygon ${a} points="${UNIT[k].map(([u, v]) => P(u, v)).join(' ')}"/>`;
  if (k === 'circle') return `<ellipse ${a} cx="${r1(x + w / 2)}" cy="${r1(y + h / 2)}" rx="${r1(w / 2)}" ry="${r1(h / 2)}"/>`;
  if (k === 'rrect') { const rr = r1(Math.min(w, h) * 0.22); return `<rect ${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${rr}"/>`; }
  if (k === 'heart') return `<path ${a} d="M${P(...HEART[0])} ${HEART.slice(1).map(([c1, c2, q]) => `C${P(...c1)} ${P(...c2)} ${P(...q)}`).join(' ')} Z"/>`;
  if (k === 'speech') {
    const bh = h * 0.78, rr = Math.min(w, bh) * 0.2, X = v => r1(x + v), Y = v => r1(y + v);
    return `<path ${a} d="M${X(rr)},${Y(0)} H${X(w - rr)} A${r1(rr)} ${r1(rr)} 0 0 1 ${X(w)},${Y(rr)} V${Y(bh - rr)} A${r1(rr)} ${r1(rr)} 0 0 1 ${X(w - rr)},${Y(bh)} H${X(w * 0.42)} L${X(w * 0.18)},${Y(h)} L${X(w * 0.26)},${Y(bh)} H${X(rr)} A${r1(rr)} ${r1(rr)} 0 0 1 ${X(0)},${Y(bh - rr)} V${Y(rr)} A${r1(rr)} ${r1(rr)} 0 0 1 ${X(rr)},${Y(0)} Z"/>`;
  }
  if (k === 'cloud') {
    // a thought bubble: bumps around an oval, and two small bubbles under it
    const cx = x + w / 2, cy = y + h * 0.4, rx = w * 0.42, ry = h * 0.3, n = 10;
    const pts = Array.from({ length: n }, (_, i) => { const t = (i / n) * 2 * Math.PI - Math.PI / 2; return [cx + rx * Math.cos(t), cy + ry * Math.sin(t)]; });
    const d = pts.map((p, i) => { const q = pts[(i + 1) % n], rr = r1(Math.hypot(q[0] - p[0], q[1] - p[1]) * 0.62); return `A${rr} ${rr} 0 0 1 ${r1(q[0])},${r1(q[1])}`; }).join(' ');
    return `<path ${a} d="M${r1(pts[0][0])},${r1(pts[0][1])} ${d} Z"/><ellipse ${a} cx="${r1(x + w * 0.2)}" cy="${r1(y + h * 0.86)}" rx="${r1(w * 0.06)}" ry="${r1(h * 0.055)}"/><ellipse ${a} cx="${r1(x + w * 0.08)}" cy="${r1(y + h * 0.96)}" rx="${r1(w * 0.035)}" ry="${r1(h * 0.035)}"/>`;
  }
  if (k === 'cyl') {
    const ry = Math.min(h * 0.16, w * 0.3), rx = r1(w / 2);
    return `<path ${a} d="M${r1(x)},${r1(y + ry)} A${rx} ${r1(ry)} 0 0 1 ${r1(x + w)},${r1(y + ry)} V${r1(y + h - ry)} A${rx} ${r1(ry)} 0 0 1 ${r1(x)},${r1(y + h - ry)} Z"/><path ${a.replace(/fill="[^"]*"( fill-opacity="[^"]*")?/, 'fill="none"')} d="M${r1(x)},${r1(y + ry)} A${rx} ${r1(ry)} 0 0 0 ${r1(x + w)},${r1(y + ry)}"/>`;
  }
  return `<rect ${a} x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" rx="${r1(Math.min(6, w / 2, h / 2))}"/>`;
}
/** A pen line in area pixels. Drawn once it has two different points (a single point drew, in some browsers, a dot as
 *  wide as the board: public/js/board-ann.js inkLine). */
export function strokeSvg(s, W, H, extra = '') {
  const pts = (s.pts || []).map(p => `${r1(+p.x * W)},${r1(+p.y * H)}`);
  if (new Set(pts).size < 2) return '';
  const sw = strokeWidth(s, true);
  return `<polyline${extra ? ` ${extra}` : ''} fill="none" stroke="${esc(s.c || '#141414')}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"${dashAttr(s, sw)} points="${pts.join(' ')}"/>`;
}
/** Where a drawing sits in the shared layer: its z, else (an older board) every pen line under every shape, each in
 *  the order it was drawn. */
export const zOf = (o, kind, i) => (Number.isFinite(+o.z) && o.z !== null && o.z !== '' ? +o.z : (kind === 'stroke' ? -2e6 : -1e6) + i);
/** Shapes and pen lines in one list, bottom first: [{ kind: 'shape' | 'stroke', o, z }]. */
export function drawings(shapes = [], strokes = []) {
  return [...strokes.map((o, i) => ({ kind: 'stroke', o, z: zOf(o, 'stroke', i), i })), ...shapes.map((o, i) => ({ kind: 'shape', o, z: zOf(o, 'shape', i), i: i + 1e5 }))]
    .sort((a, b) => a.z - b.z || a.i - b.i);
}
/** Every drawing as SVG (attrs(d) adds attributes to each, for the board's own selection). */
export const drawingsSvg = (shapes, strokes, W, H, attrs = () => '') => drawings(shapes, strokes).map(d => (d.kind === 'shape' ? shapeSvg(d.o, W, H, attrs(d)) : strokeSvg(d.o, W, H, attrs(d)))).join('');

/** A sticky note. o: { ro (students and the projector), label, ph } */
export function noteHtml(n, o = {}) {
  const sized = Number.isFinite(+n.w) && Number.isFinite(+n.h), nc = NOTE_COLORS[n.nc] && n.nc !== 'yellow' ? ` hr-nc-${n.nc}` : '';
  const style = `left:${(+n.x || 0) * 100}%;top:${(+n.y || 0) * 100}%;width:${sized ? +n.w : NOTE_BOX.w}px;min-height:${sized ? +n.h : NOTE_BOX.h}px`;
  return o.ro ? `<div class="mp-sticky hr-obj hr-rosticky${nc}" style="${style}"><p class="hr-objtext" dir="auto">${esc(n.text)}</p></div>`
    : `<div class="mp-sticky hr-obj${nc}${n.lk ? ' hr-locked' : ''}" data-note="${esc(n.id)}" role="group" aria-label="${esc(o.label || '')}" style="${style}"><p class="hr-objtext" dir="auto" data-ph="${esc(o.ph || '')}">${esc(n.text)}</p></div>`;
}
/** A text box. o: { ro, label, ph } */
export function textHtml(x, o = {}) {
  const w = Number.isFinite(+x.w) ? +x.w : TEXT_NEW.w, h = Number.isFinite(+x.h) ? +x.h : TEXT_NEW.h;
  const style = [`left:${(+x.x || 0) * 100}%`, `top:${(+x.y || 0) * 100}%`, `font-size:${textFont(x)}px`, `width:${w}px`, `min-height:${h}px`,
    ...(colorOk(x.tc) ? [`color:${x.tc}`] : []), ...(x.b ? ['font-weight:900'] : []), ...(x.al === 'c' ? ['text-align:center'] : x.al === 'r' ? ['text-align:right'] : []),
    ...(x.r ? [`transform:rotate(${r1(+x.r)}deg)`] : [])].join(';');
  return o.ro ? `<div class="mp-text sized hr-obj hr-objtext hr-rotext" dir="auto" style="${style}">${esc(x.text)}</div>`
    : `<div class="mp-text sized hr-obj hr-objtext${x.lk ? ' hr-locked' : ''}" data-text="${esc(x.id)}" dir="auto" data-ph="${esc(o.ph || '')}" aria-label="${esc(o.label || '')}" style="${style}">${esc(x.text)}</div>`;
}

// ---------------------------------------------------------------- cleaning (the server, and anything pasted)
// (fractions of the default area from its top left; an object may sit anywhere on the board, so they reach past 0..1)
const fracIn = (v, lo, hi) => { const n = Number(v); return Number.isFinite(n) && v !== null && v !== '' ? Math.round(clamp(n, lo, hi) * 10000) / 10000 : 0; };
export const fracX = v => fracIn(v, OBJ_FRAC.x0, OBJ_FRAC.x1), fracY = v => fracIn(v, OBJ_FRAC.y0, OBJ_FRAC.y1);
const clip = (s, n) => String(s ?? '').replace(/[\u0000-\u001f\u007f‪-‮⁦-⁩]/g, '').slice(0, n);
const zClean = v => (Number.isFinite(+v) && v !== null && v !== '' && typeof v !== 'boolean' ? { z: Math.round(clamp(+v, -Z_MAX, Z_MAX)) } : {});
const rotClean = v => { const n = Number(v); if (!Number.isFinite(n) || typeof v === 'boolean') return {}; const d = Math.round(((n % 360) + 540) % 360 - 180); return d && d !== -180 ? { r: d } : d === -180 ? { r: 180 } : {}; };
/** The style fields a pen line, a text box or a note may keep (unknown or bad values are dropped). */
export function strokeStyle(s) {
  return { ...(WEIGHTS.includes(s.w) && s.w !== 'M' ? { w: s.w } : {}), ...(s.d === 'dash' || s.d === 'dot' ? { d: s.d } : {}), ...zClean(s.z), ...(s.lk === 1 || s.lk === true ? { lk: 1 } : {}) };
}
export function textStyle(x) {
  return { ...(colorOk(x.tc) ? { tc: x.tc } : {}), ...(x.b === 1 || x.b === true ? { b: 1 } : {}), ...(x.al === 'c' || x.al === 'r' ? { al: x.al } : {}), ...rotClean(x.r), ...(x.lk === 1 || x.lk === true ? { lk: 1 } : {}) };
}
export function noteStyle(n) {
  return { ...(NOTE_COLORS[n.nc] && n.nc !== 'yellow' ? { nc: n.nc } : {}), ...(n.lk === 1 || n.lk === true ? { lk: 1 } : {}) };
}
/** A shape as it may be stored, or null (an unknown kind). Its stroke color from the palette (else black; 'none' only on
 *  a filled closed shape), the rest only when valid and not the default. */
export function cleanShape(s, i = 0) {
  if (!s || typeof s !== 'object' || !SHAPE_KINDS.includes(s.k)) return null;
  const line = isLine(s.k), f = !line && colorOk(s.f) ? s.f : null;
  const c = colorOk(s.c) || (s.c === 'none' && f) ? s.c : '#141414';
  return {
    id: clip(s.id || `s${i}`, 40), k: s.k, x: fracX(s.x), y: fracY(s.y), x2: fracX(s.x2), y2: fracY(s.y2), c,
    ...(f ? { f, ...(s.fo === 50 || s.fo === 25 ? { fo: s.fo } : {}) } : {}),
    ...(WEIGHTS.includes(s.w) && s.w !== 'M' ? { w: s.w } : {}), ...(s.d === 'dash' || s.d === 'dot' ? { d: s.d } : {}),
    ...(line && ['start', 'end', 'both'].includes(s.a) ? { a: s.a } : {}), ...(line ? {} : rotClean(s.r)), ...zClean(s.z), ...(s.lk === 1 || s.lk === true ? { lk: 1 } : {}),
  };
}
export const cleanShapes = list => (Array.isArray(list) ? list : []).filter(s => s && typeof s === 'object' && SHAPE_KINDS.includes(s.k)).slice(0, SHAPES_MAX).map(cleanShape);

// ---------------------------------------------------------------- the teacher's area and the rest of the board
// Objects are kept in fractions of the default area (AREA, from its top left; homeroom-seats.js) and may sit anywhere on
// the board (docs/decisions.md "Homeroom: touch drag, eraser, resizable area, the whole board"). One whose middle is
// inside the teacher's area (its frame, however the teacher sized it) is the area's: on every desk's window and the
// projector. Anything else is on the board only: the teacher's and the aide's board and a student's See the room.
/** An object's middle in board pixels. kind: note | text | shape | stroke; A: the default area { x, y, w, h }. */
export function middleOf(kind, o, A) {
  if (kind === 'shape') { const b = boxOf(o, A.w, A.h); return { x: A.x + b.x + b.w / 2, y: A.y + b.y + b.h / 2 }; }
  if (kind === 'stroke') {
    const xs = (o.pts || []).map(p => +p.x || 0), ys = (o.pts || []).map(p => +p.y || 0);
    if (!xs.length) return { x: A.x, y: A.y };
    return { x: A.x + ((Math.min(...xs) + Math.max(...xs)) / 2) * A.w, y: A.y + ((Math.min(...ys) + Math.max(...ys)) / 2) * A.h };
  }
  const w = Number.isFinite(+o.w) ? +o.w : kind === 'note' ? NOTE_BOX.w : TEXT_NEW.w, h = Number.isFinite(+o.h) ? +o.h : kind === 'note' ? NOTE_BOX.h : TEXT_NEW.h;
  return { x: A.x + (+o.x || 0) * A.w + w / 2, y: A.y + (+o.y || 0) * A.h + h / 2 };
}
/** Is this object the teacher's area's (its middle inside the frame fr, board pixels)? */
export const inFrame = (kind, o, A, fr) => { const m = middleOf(kind, o, A); return m.x >= fr.x && m.x <= fr.x + fr.w && m.y >= fr.y && m.y <= fr.y + fr.h; };
/** An area's objects split: { inside, outside }, each { notes, texts, strokes, shapes } in their saved order. */
export function splitObjects(area, A, fr) {
  const a = (area && area.__ann) || {}, shapes = (area && Array.isArray(area.shapes)) ? area.shapes : [];
  const part = (list, kind) => { const i = [], o = []; for (const x of Array.isArray(list) ? list : []) (inFrame(kind, x, A, fr) ? i : o).push(x); return [i, o]; };
  const [ni, no] = part(a.notes, 'note'), [ti, to] = part(a.texts, 'text'), [si, so] = part(a.strokes, 'stroke'), [hi, ho] = part(shapes, 'shape');
  return { inside: { notes: ni, texts: ti, strokes: si, shapes: hi }, outside: { notes: no, texts: to, strokes: so, shapes: ho } };
}
