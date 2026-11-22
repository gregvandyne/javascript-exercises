// Oomba Figures: how a segment addition figure is laid out: points in order on one straight line, each part (the piece
// between two neighboring points) drawn as long as its true length, its ticks and label above the line, the point names
// just below it, and each span (a stretch over several parts) as a curly brace under the names with its own label, a
// row each where they would overlap. A line can cross at one of the points, as a bisector does at a midpoint. Then the
// whole figure is turned, its labels kept upright, and framed. Pure numbers in, pure numbers out: the drawing is
// figures/src/segments.js.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; each part is drawn at the length the caller gives (its true length, or
// what "drawAs" says for a figure marked not to scale), not a size read from typed text, and never stretched to fit a
// label; the linear-expression reader and solver of the original (typed math) are left out: the caller reads structured
// lengths and expressions and checks them; labels are laid out by Oomba's own math label typesetter (mathtext.js);
// blank answer lines and the label size setting are left out (a scale factor instead).
import { lnAdd, lnMul, lnPerp, lnUnit, lnSub, lnReach, lnTicks, lnHead, lnLabelSet, lnFrame } from './lines.js';

const SEG_FIT = 420;       // the line from first point to last
const SEG_EXT = 42;        // how far the line runs on past an end point to its arrow
const SEG_TICK_HALF = 8;
const SEG_TICK_GAP = 5;
const SEG_CROSS = 72;      // how far a crossing line runs each way from its point
const SEG_SQUARE = 12;
const SEG_BRACE = 11;      // a brace's depth
const SEG_RAD = Math.PI / 180;
const segR1 = v => Math.round(v * 10) / 10;

/**
 * A curly brace from a to b, bulging depth toward n, with its point in the middle: quarter curves at each end and either
 * side of the point.
 */
export function segBracePath(a, b, n, depth) {
  const along = lnSub(b, a), L = Math.hypot(along[0], along[1]), t = lnUnit(along);
  const q = Math.min(depth / 2, L / 4), h = depth / 2, m = lnMul(lnAdd(a, b), 0.5);
  const pt = p => `${segR1(p[0])},${segR1(p[1])}`;
  const at = (base, u, v) => lnAdd(base, lnAdd(lnMul(t, u), lnMul(n, v)));
  return [`M${pt(a)}`, `Q${pt(at(a, 0, h))} ${pt(at(a, q, h))}`, `L${pt(at(m, -q, h))}`, `Q${pt(at(m, 0, h))} ${pt(at(m, 0, depth))}`,
    `Q${pt(at(m, 0, h))} ${pt(at(m, q, h))}`, `L${pt(at(b, -q, h))}`, `Q${pt(at(b, 0, h))} ${pt(b)}`].join(' ');
}

/**
 * spec: { sizes: [each part's drawn length], parts: [{ box, ticks }], points: [{ box (its name), dot }], spans: [{ from,
 * to (point places), box }], start, end ('none' | 'arrow'), cross: { at (a point's place), angle, square, box } | null,
 * turn }. -> { frame, segments, heads, dots, ticks, squares, braces, labels, at (each point, along the line) }
 */
export function layoutSegments(spec) {
  const total = spec.sizes.reduce((a, b) => a + b, 0), k = SEG_FIT / total;
  const at = [0];
  for (const v of spec.sizes) at.push(at[at.length - 1] + v * k);
  const a = (spec.turn || 0) * SEG_RAD, t = [Math.cos(a), -Math.sin(a)], up = [-Math.sin(a), -Math.cos(a)], down = lnMul(up, -1);
  const P = (u, v = 0) => lnAdd(lnMul(t, u), lnMul(up, v));
  const points = at.map(u => P(u));
  const L = lnLabelSet();

  // the line, running on past an end to an arrow, or stopping at its end point
  const ends = [{ cap: spec.start, tip: P(-(spec.start === 'arrow' ? SEG_EXT : 0)), dir: lnMul(t, -1) }, { cap: spec.end, tip: P(at[at.length - 1] + (spec.end === 'arrow' ? SEG_EXT : 0)), dir: t }];
  const heads = [];
  const stop = e => (e.cap === 'arrow' ? lnAdd(e.tip, lnMul(e.dir, -7)) : e.tip);
  for (const e of ends) if (e.cap === 'arrow') heads.push(lnHead(e.tip, e.dir, 13, 6));
  const segments = [{ id: 'line', from: stop(ends[0]), to: stop(ends[1]), style: 'solid' }];

  // a line crossing at a point, as a bisector does: turned from the line by its angle
  const squares = [];
  const cross = spec.cross;
  let crossDir = null;
  if (cross) {
    const th = cross.angle * SEG_RAD;
    crossDir = lnAdd(lnMul(t, Math.cos(th)), lnMul(up, Math.sin(th)));
    const c = points[cross.at], hi = lnAdd(c, lnMul(crossDir, SEG_CROSS)), lo = lnAdd(c, lnMul(crossDir, -SEG_CROSS));
    heads.push(lnHead(hi, crossDir, 13, 6), lnHead(lo, lnMul(crossDir, -1), 13, 6));
    segments.push({ id: 'cross', from: lnAdd(lo, lnMul(crossDir, 7)), to: lnAdd(hi, lnMul(crossDir, -7)), style: 'solid' });
    if (cross.square) squares.push([lnAdd(c, lnMul(t, SEG_SQUARE)), lnAdd(c, lnAdd(lnMul(t, SEG_SQUARE), lnMul(up, SEG_SQUARE))), lnAdd(c, lnMul(up, SEG_SQUARE))]);
    if (cross.box) { const out = lnUnit(lnAdd(crossDir, lnMul(t, -0.35))); L.place('cross', cross.box, lnAdd(hi, lnMul(out, 6 + lnReach(cross.box, out)))); }
  }

  // above the line: each part's ticks and label
  const ticks = [];
  spec.parts.forEach((p, i) => {
    const m = P((at[i] + at[i + 1]) / 2);
    if (p.ticks) ticks.push(...lnTicks(m, t, up, p.ticks, SEG_TICK_HALF, SEG_TICK_GAP));
    if (p.box) L.place(`part${i}`, p.box, lnAdd(m, lnMul(up, SEG_TICK_HALF + 6 + lnReach(p.box, up))));
  });

  // just below: each point's dot and name, beside a crossing line rather than on it
  const dots = spec.points.flatMap((p, i) => (p.dot ? [points[i]] : []));
  let nameDepth = 0;
  spec.points.forEach((p, i) => {
    if (!p.box) return;
    let out = down;
    if (cross && i === cross.at) out = lnUnit(lnAdd(down, lnMul(t, (cross.angle <= 90 ? 1 : -1) * 1.3)));
    const dd = (cross && i === cross.at ? 12 : 9) + lnReach(p.box, out);
    L.place(`pt${i}`, p.box, lnAdd(points[i], lnMul(out, dd)));
    nameDepth = Math.max(nameDepth, dd + lnReach(p.box, down));
  });

  // under the names: each span's brace and label, shorter spans nearer the line
  const braces = [], tips = [];
  const order = spec.spans.map((sp, i) => ({ sp, i })).sort((p, q) => p.sp.to - p.sp.from - (q.sp.to - q.sp.from) || p.sp.from - q.sp.from);
  const rows = [], rowOf = new Map();
  for (const { sp, i } of order) {
    let r = rows.findIndex(row => row.every(o => sp.to <= o.from || sp.from >= o.to));
    if (r < 0) r = rows.push([]) - 1;
    rows[r].push(sp); rowOf.set(i, r);
  }
  const crossDepth = cross ? SEG_CROSS * Math.sin(cross.angle * SEG_RAD) + 4 : 0;
  let depth = Math.max(nameDepth, SEG_TICK_HALF, crossDepth) + 8;
  for (let r = 0; r < rows.length; r++) {
    let rowDepth = SEG_BRACE;
    for (const { sp, i } of order) {
      if (rowOf.get(i) !== r) continue;
      const [x1, x2] = [at[sp.from], at[sp.to]];
      braces.push(segBracePath(P(x1, -depth), P(x2, -depth), down, SEG_BRACE));
      tips.push(P(x1, -depth), P(x2, -depth), P((x1 + x2) / 2, -depth - SEG_BRACE));
      if (sp.box) {
        const tip = P((x1 + x2) / 2, -depth - SEG_BRACE), dd = 5 + lnReach(sp.box, down);
        L.place(`span${i}`, sp.box, lnAdd(tip, lnMul(down, dd)));
        rowDepth = Math.max(rowDepth, SEG_BRACE + dd + lnReach(sp.box, down));
      }
    }
    depth += rowDepth + 10;
  }
  const frame = lnFrame([...points, ...segments.flatMap(g => [g.from, g.to]), ...heads.flat(), ...squares.flat(), ...ticks.flat(), ...tips], L.list);
  return { frame, segments, heads, dots, ticks, squares, braces, labels: L.list, arcs: [], arrows: [], at };
}
