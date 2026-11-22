// Oomba Figures: what every economics graph is drawn with (1.4.0, the economics pack). Schematic axes (no numbers, as
// economics graphs are drawn: the hidden grid runs 0 to 10 each way) or numbered ones (the core's graph paper), curves
// cut to the plot with their names by their ends, dashed guides from a point to the axes with its price and quantity
// named (or numbered) there, shift arrows from a curve to where it moves, and shaded regions (surplus, deadweight loss,
// tax revenue, profit and loss) that are hatched as well as tinted, each its own way, so a printed sheet tells them
// apart with no color. A name hidden for students is a short write-on line. The curves, crossings and areas come from
// ported/econcurves.js; the drawing here is Oomba's own.
import { node, label, line, poly, palette, fmt, isNum, text, hides, r2, arrow } from './svg.js';
import { axes, niceStep } from './graphs.js';
import { ecClip, ecCentroid, ecAlong, ecArea, EC_SIZES } from './ported/econcurves.js';

/** A figure's keys must be known ones: the first unknown key, named. */
export const ecOdd = (d, keys, what) => { const k = Object.keys(d).find(x => !keys.includes(x)); return k ? [`${what} does not take "${k}"`] : []; };
export const ecSize = (v, at) => (v === undefined || EC_SIZES.includes(v) ? [] : [`"${at}" must be ${EC_SIZES.join(', ')}`]);
export const ecBool = (d, keys) => keys.filter(k => d[k] !== undefined && typeof d[k] !== 'boolean').map(k => `"${k}" must be true or false`);
/** A short name from the data ("P_1", "Q_{sub}", "S + tax"), or the default. */
export const ecName = (v, dflt) => (v === undefined || v === null ? dflt : text(v, 24));
/** The names a figure may take (labels: { key: name }), checked: each a short string. */
export function ecLabelsCheck(d, keys) {
  if (d.labels === undefined) return [];
  if (!d.labels || typeof d.labels !== 'object' || Array.isArray(d.labels)) return ['"labels" is { name: "text" }'];
  const k = Object.keys(d.labels).find(x => !keys.includes(x));
  if (k) return [`"labels" does not take "${k}" (it takes ${keys.join(', ')})`];
  const bad = Object.entries(d.labels).find(([, v]) => typeof v !== 'string' || v.length > 24 || /[<>]/.test(v));
  return bad ? [`"labels.${bad[0]}" must be a short text (24 characters at most)`] : [];
}
/** A value's name before and after a change (P_1, P_2; from 0: P_0, P_1), or at the one equilibrium (P_e or P*). */
export function ecNumbered(name, k, from = 1, star = false) {
  const t = String(name || '').trim();
  if (!t) return t;
  if (!k) return star ? `${t}*` : `${t}_e`;
  const n = k - 1 + from, m = /^(.*)_\{([^}]*)\}$/.exec(t) || /^(.*)_(.)$/.exec(t);
  return m ? `${m[1]}_{${m[2]}${n}}` : `${t}_${n}`;
}
/** A curve's name before and after it shifts (D_1, D_2), or just the name. */
export const ecCurveNamed = (name, k, from = 1) => (k ? ecNumbered(name, k, from) : name);

/** A name written with its subscript: "P_1" is P with a lowered 1, "Q_{sub}" Q with a lowered sub, "P*" as it is. */
export function ecText(x, y, s, o = {}) {
  const t = String(s ?? '');
  if (!t) return null;
  if (!t.includes('_')) return label(x, y, t, o);
  // runs of text, each "_x" or "_{xy}" lowered (and raised back after it): "Q_1 = Q_2", "P_e = 6"
  const kids = [], re = /_(?:\{([^}]*)\}|([^\s=,]+))/g, small = Math.round((o.size || 14) * 0.72);
  let at = 0, m, low = false;
  while ((m = re.exec(t))) {
    const before = t.slice(at, m.index);
    if (before) kids.push(low ? node('tspan', { 'baseline-shift': 'baseline' }, before) : before);
    kids.push(node('tspan', { 'baseline-shift': 'sub', 'font-size': small }, m[1] ?? m[2]));
    low = true; at = m.index + m[0].length;
  }
  if (at < t.length) kids.push(node('tspan', { 'baseline-shift': 'baseline' }, t.slice(at)));
  const n = label(x, y, 'x', o);
  n.kids = kids;
  return n;
}
/** A name, or (hidden for students) a short line to write it on, where its middle would be. */
export function ecNameAt(x, y, s, o, hidden) {
  if (!hidden) return ecText(x, y, s, o);
  const w = 30, P = o.palette, a = o.anchor || 'start', x0 = a === 'start' ? x : a === 'end' ? x - w : x - w / 2;
  return line(r2(x0), r2(y + 6), r2(x0 + w), r2(y + 6), P.ink2, 1.4, { class: 'of-blank' });
}

/**
 * The plot an economics graph is drawn on. s: { box: { x0, x1, y0, y1 } (the graph's units), numbered (numbers on the
 * axes, on graph paper), xstep, ystep, xtitle, ytitle, w, h (the plot's size), right (room past it for names), xfmt,
 * yfmt }. -> { X, Y (units to the drawing), kids, w, h (the figure's size), L, T, R, B (the plot's edges) }.
 */
export function ecPlot(o, s) {
  const P = palette(o), b = s.box, w = s.w || 340, h = s.h || 280, right = s.right ?? 70;
  if (s.numbered) {
    const xs = s.xstep || niceStep(b.x1 - b.x0, 8), ys = s.ystep || niceStep(b.y1 - b.y0, 6);
    const A = axes([b.x0, b.x1], [b.y0, b.y1], o, { w, h, xstep: xs, ystep: ys, xlabel: s.xtitle, ylabel: s.ytitle, xfmt: s.xfmt, yfmt: s.yfmt });
    return { X: A.X, Y: A.Y, kids: A.kids, w: A.w + Math.max(0, right - 26), h: A.h, L: A.X(b.x0), T: A.Y(b.y1), R: A.X(b.x1), B: A.Y(b.y0), box: b, numbered: true };
  }
  const L = 66, T = 26, X = x => L + ((x - b.x0) / (b.x1 - b.x0)) * w, Y = y => T + h - ((y - b.y0) / (b.y1 - b.y0)) * h;
  const kids = [
    line(L, T + h, L + w + 10, T + h, P.ink, 2), line(L, T + h, L, T - 10, P.ink, 2),
    node('polygon', { points: `${r2(L + w + 16)},${r2(T + h)} ${r2(L + w + 6)},${r2(T + h - 5)} ${r2(L + w + 6)},${r2(T + h + 5)}`, fill: P.ink }),
    node('polygon', { points: `${r2(L)},${r2(T - 16)} ${r2(L - 5)},${r2(T - 6)} ${r2(L + 5)},${r2(T - 6)}`, fill: P.ink }),
    label(L - 6, T + h + 12, '0', { anchor: 'end', size: 12, weight: 600, colour: P.ink2 }),
  ];
  if (s.xtitle) kids.push(label(L + w / 2, T + h + 40, s.xtitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' }));
  if (s.ytitle) kids.push(node('g', { transform: `translate(16 ${r2(T + h / 2)}) rotate(-90)` }, label(0, 0, s.ytitle, { anchor: 'middle', size: 13, colour: P.ink, cls: 'of-axis-title' })));
  return { X, Y, kids, w: L + w + right, h: T + h + 54, L, T, R: L + w, B: T + h, box: b, numbered: false };
}
const ecPx = (A, p) => [A.X(p.x), A.Y(p.y)];
/** A curve's runs inside the plot (box: where it may be drawn, in the graph's units), as drawing points. */
export const ecRuns = (A, c, box = A.box) => ecClip(c, box).map(r => r.map(p => ecPx(A, p)));
/** A curve drawn: its runs, solid or dashed. */
export function ecCurve(A, c, o2 = {}) {
  return ecRuns(A, c, o2.box).map(r => poly(r, { stroke: o2.colour, 'stroke-width': o2.width || 3, 'stroke-dasharray': o2.dash || null, class: o2.cls || 'of-curve' }));
}
/** Where a curve's name goes: past the end of its longest run (the right end; an upright curve's top). -> { x, y, anchor }. */
export function ecEnd(A, c, box = A.box, at = 'end') {
  const runs = ecClip(c, box).sort((a, b) => b.length - a.length), run = runs[0];
  if (!run) return null;
  const a = run[0], z = run[run.length - 1], upright = Math.abs(A.X(a.x) - A.X(z.x)) < 2;
  if (upright) { const top = A.Y(a.y) < A.Y(z.y) ? a : z; return { x: A.X(top.x), y: A.Y(top.y) - 11, anchor: 'middle' }; }
  const e = at === 'start' ? (a.x < z.x ? a : z) : (a.x > z.x ? a : z), ex = A.X(e.x), ey = A.Y(e.y);
  if (ey < A.T + 8) return { x: ex + 4, y: ey - 9, anchor: 'start' };
  return { x: ex + 7, y: ey, anchor: 'start' };
}
/** A dashed guide from a point to either axis (x: down to the quantity axis, y: across to the price axis). */
export function ecGuide(A, p, P, o2 = {}) {
  const out = [], [x, y] = ecPx(A, p), dash = { 'stroke-dasharray': '5 5', class: 'of-guide' };
  if (o2.y !== false) out.push(line(r2(o2.fromX ?? A.L), r2(y), r2(x), r2(y), P.muted, 1.5, dash));
  if (o2.x !== false) out.push(line(r2(x), r2(A.B), r2(x), r2(y), P.muted, 1.5, dash));
  return out;
}
/** A value named at an axis (axis: 'x' or 'y'): outside a schematic plot; inside a numbered one, with its number. */
export function ecMark(A, axis, v, name, o, P, o2 = {}) {
  const lang = o.lang, hidden = o2.hidden, num = A.numbered ? fmt(v, o2.dp ?? 2, lang) : '';
  const s = A.numbered ? (name && !hidden ? `${name} = ${num}` : hidden ? '' : num) : name;
  if (!s && !hidden) return null;
  const opt = { size: 13, colour: P.ink, palette: P, cls: 'of-mark', halo: A.numbered ? P.paper : null };
  if (axis === 'y') return A.numbered ? ecNameAt(A.L + 5, A.Y(v) - 9, s, { ...opt, anchor: 'start' }, hidden) : ecNameAt(A.L - 8, A.Y(v), s, { ...opt, anchor: 'end' }, hidden);
  return A.numbered ? ecNameAt(A.X(v) + 5, A.B - 10 - 15 * (o2.low || 0), s, { ...opt, anchor: 'start' }, hidden) : ecNameAt(A.X(v), A.B + 16 + 14 * (o2.low || 0), s, { ...opt, anchor: 'middle' }, hidden);
}
/** Marks along the quantity axis, each lowered (raised, numbered) a step when it would crowd the one before it. */
export function ecMarksX(A, marks, o, P, o2 = {}) {
  const xs = [...marks].sort((a, b) => a.v - b.v), out = [];
  xs.forEach((x, i) => {
    const prev = xs[i - 1], width = A.numbered ? 9 * String(x.name || '').length + 40 : 30;
    x.low = prev && A.X(x.v) - A.X(prev.v) < (A.numbered ? 9 * String(prev.name || '').length + 44 : width) ? (prev.low || 0) + 1 : 0;
    if (x.low > 2) x.low = 0;
    out.push(ecMark(A, 'x', x.v, x.name, o, P, { ...o2, low: x.low }));
  });
  return out;
}
/** A point: a dot, and its name above and to the right. */
export function ecDot(A, p, P, name, o2 = {}) {
  const [x, y] = ecPx(A, p), out = [node('circle', { cx: r2(x), cy: r2(y), r: o2.r || 4.5, fill: o2.open ? P.paper : P.ink, stroke: P.ink, 'stroke-width': 1.6, class: o2.cls || 'of-point' })];
  if (name) out.push(ecNameAt(x + (o2.dx ?? 8), y + (o2.dy ?? -11), name, { size: 13, colour: P.ink, halo: P.paper, palette: P, anchor: o2.anchor || 'start', cls: 'of-point-name' }, o2.hidden));
  return out;
}
/** A shift arrow from a point on a curve to where it moves (dx across, dy up), kept a little off both curves. */
export function ecShiftArrow(A, from, dx, dy, colour) {
  const [x1, y1] = ecPx(A, from), [x2, y2] = ecPx(A, { x: from.x + dx, y: from.y + dy }), len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 16) return null;
  const ux = (x2 - x1) / len, uy = (y2 - y1) / len, g = Math.min(7, len * 0.2);
  return arrow(r2(x1 + ux * g), r2(y1 + uy * g), r2(x2 - ux * g), r2(y2 - uy * g), { colour, width: 2, head: 9, cls: 'of-shift' });
}
/** Shift arrows along the part of a curve on the plot (and where it moves to), at these shares of the way along it. */
export function ecShiftArrows(A, c, dx, dy, colour, at = [0.25, 0.75], box = A.box) {
  const from = { x0: box.x0 + Math.max(0, -dx), x1: box.x1 - Math.max(0, dx), y0: box.y0 + Math.max(0, -dy), y1: box.y1 - Math.max(0, dy) };
  const run = ecClip(c, from).sort((a, b) => b.length - a.length)[0];
  if (!run || (!dx && !dy)) return [];
  return at.map(t => ecShiftArrow(A, ecAlong(run, t).at, dx, dy, colour)).filter(Boolean);
}

// ---------------------------------------------------------------- shaded regions
/** Each region's look: a tint on screen, a gray in print, and hatching at its own angle (none for the lightest). */
const EC_REGIONS = {
  cs: { c: 'blue', print: '#EEEEEE', angle: 45, gap: 8 }, ps: { c: 'red', print: '#E2E2E2', angle: -45, gap: 8 }, dwl: { c: 'gold', print: '#C8C8C8', angle: 0, gap: 5 },
  revenue: { c: 'green', print: '#F4F4F4', angle: 90, gap: 7 }, profit: { c: 'green', print: '#E6E6E6', angle: 45, gap: 7 }, loss: { c: 'red', print: '#D2D2D2', angle: -45, gap: 6 },
};
/** Lines across a polygon (drawing points) at an angle, gap apart: where each line is inside the polygon (even-odd). */
export function ecHatch(pts, angle, gap) {
  const t = (angle * Math.PI) / 180, d = { x: Math.cos(t), y: -Math.sin(t) }, n = { x: -d.y, y: d.x }, out = [];
  const proj = pts.map(p => p[0] * n.x + p[1] * n.y), lo = Math.min(...proj), hi = Math.max(...proj);
  for (let c = Math.ceil(lo / gap) * gap; c <= hi; c += gap) {
    const hits = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length], pa = proj[i] - c, pb = proj[(i + 1) % pts.length] - c;
      if ((pa < 0) === (pb < 0) || pa === pb) continue;
      const f = pa / (pa - pb), x = a[0] + (b[0] - a[0]) * f, y = a[1] + (b[1] - a[1]) * f;
      hits.push(x * d.x + y * d.y);
    }
    hits.sort((a, b) => a - b);
    for (let k = 0; k + 1 < hits.length; k += 2) {
      const p = s => [c * n.x + s * d.x, c * n.y + s * d.y], [x1, y1] = p(hits[k]), [x2, y2] = p(hits[k + 1]);
      out.push(`M${r2(x1)} ${r2(y1)}L${r2(x2)} ${r2(y2)}`);
    }
  }
  return out.join('');
}
/** A shaded region (in the graph's units): tinted and hatched, and its name in its middle. Nothing for a sliver. */
export function ecRegion(A, polyPts, kind, o, name, hidden) {
  if (!polyPts || polyPts.length < 3) return [];
  const P = palette(o), look = EC_REGIONS[kind], pts = polyPts.map(p => ecPx(A, p));
  if (ecArea(pts.map(([x, y]) => ({ x, y }))) < 30) return [];
  const pointsAttr = pts.map(p => `${r2(p[0])},${r2(p[1])}`).join(' ');
  const out = [node('polygon', { points: pointsAttr, fill: o.print ? look.print : P[look.c], 'fill-opacity': o.print ? null : 0.2, stroke: 'none', class: `of-region of-${kind}` })];
  const h = ecHatch(pts, look.angle, look.gap);
  if (h) out.push(node('path', { d: h, fill: 'none', stroke: o.print ? P.ink : P[look.c], 'stroke-width': o.print ? 0.7 : 0.9, 'stroke-opacity': o.print ? null : 0.55, class: `of-hatch of-hatch-${kind}` }));
  if (name) {
    const c = ecCentroid(polyPts);
    out.push(ecNameAt(A.X(c.x), A.Y(c.y), name, { anchor: 'middle', size: 12.5, colour: P.ink, halo: P.paper, palette: P, cls: 'of-region-name' }, hidden));
  }
  return out;
}
/** A brace under (or over) a stretch of a level line, from x0 to x1 at height y (drawing units), with its name. */
export function ecBrace(x0, x1, y, side, P, name, hidden) {
  const s = side === 'below' ? 1 : -1, d = 7, m = (x0 + x1) / 2;
  const path = `M${r2(x0)} ${r2(y + s * 2)} Q${r2(x0)} ${r2(y + s * d)} ${r2(x0 + d)} ${r2(y + s * d)} L${r2(m - d)} ${r2(y + s * d)} Q${r2(m)} ${r2(y + s * d)} ${r2(m)} ${r2(y + s * 2 * d)} Q${r2(m)} ${r2(y + s * d)} ${r2(m + d)} ${r2(y + s * d)} L${r2(x1 - d)} ${r2(y + s * d)} Q${r2(x1)} ${r2(y + s * d)} ${r2(x1)} ${r2(y + s * 2)}`;
  const out = [node('path', { d: path, fill: 'none', stroke: P.ink, 'stroke-width': 1.6, class: 'of-brace' })];
  if (name) out.push(ecNameAt(m, y + s * (2 * d + 10), name, { anchor: 'middle', size: 12.5, colour: P.ink, halo: P.paper, palette: P, cls: 'of-brace-name' }, hidden));
  return out;
}
/** A heading over the figure. */
export const ecHeading = (d, w, P) => (d.heading ? label(w / 2, 12, text(d.heading, 60), { anchor: 'middle', size: 14, colour: P.ink }) : null);
/** Numbered axes from the data: x and y as [from, to], each from below to above; null when not given. */
export function ecRangeCheck(d) {
  const out = [];
  for (const k of ['x', 'y']) if (d[k] !== undefined && !(Array.isArray(d[k]) && d[k].length === 2 && d[k].every(v => isNum(v, -1e9, 1e9)) && d[k][1] > d[k][0])) out.push(`"${k}" is [from, to], from below to`);
  return out;
}
