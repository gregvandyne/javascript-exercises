// Oomba Figures: how a figure made of lines and the angles between them is laid out: rays from one vertex (angles), or
// lines cut by transversals (parallel lines). The figure arrives in its own units (y up): its lines as segments, the
// angles to mark (a vertex, the two directions round it, counterclockwise, and the label), the points to name. It is
// turned, flipped to the page's y-down coordinates and scaled to fit the same box whatever its numbers; each angle gets
// its arcs (or a right-angle square) and its label far enough out to clear them and to fit between its two rays; names
// go in the widest free gap round their point; the frame grows to hold every label. Pure numbers in, pure numbers out:
// the drawing is figures/src/lines.js. The marks (sectorPath, angleMark, tick marks, parallel arrows) are shared with
// the circle and the segment figures.
//
// Ported code, used under the Apache License 2.0 (LICENSE.txt in this folder; the source and its commit are recorded in
// docs/third-party.md). Changed from the original: rewritten from TypeScript as a plain ES module, names changed so they
// share one scope with the rest of the bundle; the two layouts of the original (rays from a vertex, and parallel lines
// with transversals) are one layout here, fed the figure's own lines and angles by the caller; the caller says which
// angles to mark and works out their measures (so a figure's labels are checked against the true measures before it is
// drawn); labels are laid out by Oomba's own math label typesetter (mathtext.js) from structured labels, not typed math;
// what the original kept for pointing and clicking (wedges to pick, ghost labels, popups, label dragging) and the label
// size setting (a scale factor instead) are left out; shading is left out.

const LN_FIT_W = 440;     // the box every figure is scaled to fit
const LN_FIT_H = 280;
const LN_PAD = 12;
const LN_ARC = 20;        // angle arc radius
const LN_ARC_GAP = 4.5;   // between congruence arcs
const LN_SQUARE = 13;     // right-angle square
const LN_HEAD = 12;       // an arrowhead's length, and
const LN_HEAD_W = 5.5;    // half its width
const LN_ARROW = 4.5;     // half a parallel arrow's length, and
const LN_ARROW_W = 5;     // half its width
const LN_ARROW_GAP = 6;
const LN_TICK = 7;        // half a tick's length
const LN_TICK_GAP = 5;
const LN_RAD = Math.PI / 180;

export const lnAdd = (p, q) => [p[0] + q[0], p[1] + q[1]];
export const lnSub = (p, q) => [p[0] - q[0], p[1] - q[1]];
export const lnMul = (p, k) => [p[0] * k, p[1] * k];
export const lnDot = (p, q) => p[0] * q[0] + p[1] * q[1];
export const lnCross = (p, q) => p[0] * q[1] - p[1] * q[0];
export const lnLen = p => Math.hypot(p[0], p[1]);
export const lnUnit = p => lnMul(p, 1 / (lnLen(p) || 1));
export const lnPerp = p => [-p[1], p[0]];
const lnR1 = v => Math.round(v * 10) / 10;
/** How far a label's box reaches from its middle in direction d. */
export const lnReach = (box, d) => (box.w / 2) * Math.abs(d[0]) + ((box.asc + box.desc) / 2) * Math.abs(d[1]);
/** A direction's angle on the page, counterclockwise as the eye sees it (y down), in degrees from 0 up to 360. */
const lnPageDeg = u => ((Math.atan2(-u[1], u[0]) / LN_RAD) % 360 + 360) % 360;

/**
 * Part of a circle round v, from direction e1 round to e2 (clockwise on the page): just the arc, or closed through v as
 * a wedge. large when it is more than half a turn.
 */
export function lnSector(v, e1, e2, r, closed, large) {
  const a = lnAdd(v, lnMul(e1, r)), b = lnAdd(v, lnMul(e2, r));
  const arc = `A${lnR1(r)},${lnR1(r)} 0 ${large ? 1 : 0} 1 ${lnR1(b[0])},${lnR1(b[1])}`;
  return closed ? `M${lnR1(v[0])},${lnR1(v[1])} L${lnR1(a[0])},${lnR1(a[1])} ${arc} Z` : `M${lnR1(a[0])},${lnR1(a[1])} ${arc}`;
}
/**
 * The mark at an angle at v between e1 and e2 (page directions; the arc runs clockwise on the page from e1 to e2): a
 * square at a right angle, or count arcs, the first at radius r0. -> how far out it reaches, so a label can clear it.
 */
export function lnAngleMark(out, v, e1, e2, count, square, large, r0 = LN_ARC) {
  if (square) {
    const q = r0 > LN_ARC ? r0 + 4 : LN_SQUARE;   // round the arcs of the angles inside it
    out.squares.push([lnAdd(v, lnMul(e1, q)), lnAdd(v, lnAdd(lnMul(e1, q), lnMul(e2, q))), lnAdd(v, lnMul(e2, q))]);
    return q * Math.SQRT2;
  }
  if (!count) return 0;
  for (let n = 0; n < count; n++) out.arcs.push(lnSector(v, e1, e2, r0 + n * LN_ARC_GAP, false, large));
  return r0 + (count - 1) * LN_ARC_GAP;
}
/** count congruence ticks across a line at m, which runs along t, each reaching half either side of it. */
export function lnTicks(m, t, n, count, half = LN_TICK, gap = LN_TICK_GAP) {
  return Array.from({ length: count }, (_, i) => {
    const at = lnAdd(m, lnMul(t, (i - (count - 1) / 2) * gap));
    return [lnAdd(at, lnMul(n, half)), lnAdd(at, lnMul(n, -half))];
  });
}
/** count parallel arrows (open chevrons) centered at m, pointing along t, each half long either side and width across. */
export function lnParallelArrows(m, t, n, count, half = LN_ARROW, width = LN_ARROW_W, gap = LN_ARROW_GAP) {
  return Array.from({ length: count }, (_, i) => {
    const at = lnAdd(m, lnMul(t, (i - (count - 1) / 2) * gap)), tail = lnAdd(at, lnMul(t, -half));
    return [lnAdd(tail, lnMul(n, width)), lnAdd(at, lnMul(t, half)), lnAdd(tail, lnMul(n, -width))];
  });
}
/** A filled arrowhead with its tip at tip, pointing along d. */
export function lnHead(tip, d, len = LN_HEAD, half = LN_HEAD_W) {
  const base = lnAdd(tip, lnMul(d, -len));
  return [lnAdd(base, lnMul(lnPerp(d), half)), tip, lnAdd(base, lnMul(lnPerp(d), -half))];
}
/** Labels put down one by one, each clear of the ones before it where it can be. */
export function lnLabelSet() {
  const list = [];
  const boxAt = (box, [cx, cy]) => ({ l: cx - box.w / 2 - 2, r: cx + box.w / 2 + 2, t: cy - (box.asc + box.desc) / 2 - 1, b: cy + (box.asc + box.desc) / 2 + 1 });
  const overlaps = (box, c) => { const a = boxAt(box, c); return list.some(l => { const b = boxAt(l.box, [l.cx, l.cy]); return a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b; }); };
  const place = (part, box, [cx, cy]) => { list.push({ part, box, cx, cy, x: cx - box.w / 2, y: cy + (box.asc - box.desc) / 2 }); };
  /** Out from v along out, as far as it takes to clear the labels already down. */
  const placeOut = (part, box, v, out, gap) => {
    let d = gap + lnReach(box, out);
    for (let n = 0; n < 12 && overlaps(box, lnAdd(v, lnMul(out, d))); n++) d += 4;
    place(part, box, lnAdd(v, lnMul(out, d)));
  };
  return { list, overlaps, place, placeOut };
}
/** The frame round some points and every label, with padding. */
export function lnFrame(points, labels) {
  const all = [...points];
  for (const l of labels) all.push([l.cx - l.box.w / 2, l.y - l.box.asc], [l.cx + l.box.w / 2, l.y + l.box.desc]);
  const minX = Math.min(...all.map(p => p[0])) - LN_PAD, minY = Math.min(...all.map(p => p[1])) - LN_PAD;
  const maxX = Math.max(...all.map(p => p[0])) + LN_PAD, maxY = Math.max(...all.map(p => p[1])) + LN_PAD;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * spec: { segments: [{ id, from, to (y up), startCap, endCap ('arrow' | 'dot' | 'none'), name (a box: past its "to"
 * end), arrows (parallel arrows: a count, at arrowAt, a point on it), style }], angles: [{ id, at (the vertex), u1, u2
 * (directions, y up; the angle runs counterclockwise from u1 to u2), measure, box (its label or null), arcs (a count),
 * square }], points: [{ id, at, dot, box (its name), dir (a direction its line runs along: the name goes across it; none:
 * the widest free gap round it) }], turn (degrees), maxScale }.
 * -> { frame, segments: [{ id, from, to (as drawn, short of an arrowhead's tip), style }], heads, dots, arcs, squares,
 *      arrows, labels: [{ part, box, cx, cy, x, y }], scale }
 */
export function layoutLinesFigure(spec) {
  const turn = (spec.turn || 0) * LN_RAD;
  const turned = ([x, y]) => [x * Math.cos(turn) - y * Math.sin(turn), -(x * Math.sin(turn) + y * Math.cos(turn))];
  const way = u => lnUnit(turned(u));
  const ends = spec.segments.flatMap(g => [turned(g.from), turned(g.to)]);
  const xs = ends.map(p => p[0]), ys = ends.map(p => p[1]);
  const scale = Math.min(LN_FIT_W / (Math.max(...xs) - Math.min(...xs) || 1), LN_FIT_H / (Math.max(...ys) - Math.min(...ys) || 1), spec.maxScale || Infinity);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const at = p => { const [x, y] = turned(p); return [(x - x0) * scale, (y - y0) * scale]; };
  const segs = spec.segments.map(g => ({ ...g, a: at(g.from), b: at(g.to) }));
  const L = lnLabelSet();

  // the rays out from a point along every drawn line through it, on the page
  const raysAt = v => {
    const out = [];
    for (const g of segs) {
      const d = lnSub(g.b, g.a), len = lnLen(d), u = lnUnit(d), w = lnSub(v, g.a);
      if (Math.abs(lnCross(u, w)) > 0.5) continue;
      const t = lnDot(w, u);
      if (t < -0.5 || t > len + 0.5) continue;
      if (t < len - 0.5) out.push(u);
      if (t > 0.5) out.push(lnMul(u, -1));
    }
    return out;
  };
  const labeledAt = new Map();
  for (const a of spec.angles) if (a.box) { const k = `${lnR1(at(a.at)[0])},${lnR1(at(a.at)[1])}`; labeledAt.set(k, [...(labeledAt.get(k) || []), a]); }

  // names of points: at a vertex or a crossing, in its widest gap not taken by a labeled angle; along a line, across it
  const dots = [];
  for (const p of spec.points || []) {
    const v = at(p.at);
    if (p.dot) dots.push(v);
    if (!p.box) continue;
    if (p.dir) {
      const n = lnPerp(way(p.dir)), spots = [n, lnMul(n, -1)].map(out => ({ at: lnAdd(v, lnMul(out, 8 + lnReach(p.box, out))), out }));
      const spot = spots.find(sp => !L.overlaps(p.box, sp.at)) || spots[0];
      L.place(p.id, p.box, spot.at);
      continue;
    }
    const rays = raysAt(v).sort((u, w) => lnPageDeg(u) - lnPageDeg(w));
    let out = [0, 1];
    if (rays.length) {
      const taken = (labeledAt.get(`${lnR1(v[0])},${lnR1(v[1])}`) || []).map(a => { const s = lnPageDeg(way(a.u1)); return [s, a.measure]; });
      let best = -1;
      rays.forEach((u, i) => {
        const w = rays[(i + 1) % rays.length], from = lnPageDeg(u), gap = rays.length === 1 ? 360 : ((lnPageDeg(w) - from) % 360 + 360) % 360;
        const mid = from + gap / 2, busy = taken.some(([s, m]) => ((mid - s) % 360 + 360) % 360 < m);
        const score = gap * (busy ? 0.3 : 1);
        if (score > best + 1e-9) { best = score; out = [Math.cos(mid * LN_RAD), -Math.sin(mid * LN_RAD)]; }
      });
    }
    L.place(p.id, p.box, lnAdd(v, lnMul(out, 8 + lnReach(p.box, out))));
  }

  // line names past their "to" end
  for (const g of segs) if (g.name) { const out = lnUnit(lnSub(g.b, g.a)); L.placeOut(`name:${g.id}`, g.name, g.b, out, 8); }

  // angles: arcs or a square, the label far enough out to clear them and to fit between the two rays
  const marks = { arcs: [], squares: [] };
  for (const a of spec.angles) {
    const v = at(a.at), e1 = way(a.u2), e2 = way(a.u1);   // clockwise on the page from the later ray back to the earlier
    const large = a.measure > 180, mid = way([Math.cos((Math.atan2(a.u1[1], a.u1[0]) + (a.measure * LN_RAD) / 2)), Math.sin((Math.atan2(a.u1[1], a.u1[0]) + (a.measure * LN_RAD) / 2))]);
    const outer = lnAngleMark(marks, v, e1, e2, a.square ? 0 : a.arcs, a.square, large, LN_ARC + (a.inner || 0) * 9);
    if (!a.box) continue;
    const half = a.measure < 180 ? Math.sin((a.measure * LN_RAD) / 2) : 1;
    const toSide = a.measure < 180 ? Math.max(...[e1, e2].map(e => (lnReach(a.box, lnPerp(e)) + 3) / half)) : 0;
    let d = Math.max(outer + 5 + lnReach(a.box, mid), toSide, 12 + lnReach(a.box, mid));
    for (let n = 0; n < 12 && L.overlaps(a.box, lnAdd(v, lnMul(mid, d))); n++) d += 4;
    L.place(a.id, a.box, lnAdd(v, lnMul(mid, d)));
  }

  // each end's cap: a filled arrowhead pointing out, or a dot; the line stops short of an arrowhead's tip
  const heads = [], drawn = [], arrows = [];
  for (const g of segs) {
    const pts = [];
    for (const [cap, tip, from] of [[g.startCap, g.a, g.b], [g.endCap, g.b, g.a]]) {
      const d = lnUnit(lnSub(tip, from));
      if (cap === 'arrow') heads.push(lnHead(tip, d));
      else if (cap === 'dot') dots.push(tip);
      pts.push(cap === 'arrow' ? lnAdd(tip, lnMul(d, -LN_HEAD * 0.6)) : tip);
    }
    drawn.push({ id: g.id, from: pts[0], to: pts[1], style: g.style || 'solid' });
    if (g.arrows) {
      const d = lnUnit(lnSub(g.b, g.a)), t = d[0] < -1e-9 || (Math.abs(d[0]) <= 1e-9 && d[1] < 0) ? lnMul(d, -1) : d;
      arrows.push(...lnParallelArrows(at(g.arrowAt), t, lnPerp(t), g.arrows));
    }
  }
  const frame = lnFrame([...segs.flatMap(g => [g.a, g.b]), ...heads.flat()], L.list);
  return { frame, segments: drawn, heads, dots, arcs: marks.arcs, squares: marks.squares, arrows, labels: L.list, scale };
}
